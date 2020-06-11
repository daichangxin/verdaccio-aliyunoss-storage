import { getConflict, HEADERS } from '@verdaccio/commons-api';
import { ReadTarball, UploadTarball } from '@verdaccio/streams';
import { Callback, CallbackAction, ILocalPackageManager, Logger, Package, PackageTransformer, ReadPackageCallback, StorageUpdateCallback, StorageWriteCallback } from '@verdaccio/types';
import { addTrailingSlash } from '../utils';
import { AliConfig } from './AliConfig';
import { AliError, convertError } from './AliError';
import { AliyunOSS } from './AliyunOSS';

export default class AliPackageManager implements ILocalPackageManager {
    logger: Logger;
    private readonly packageName: string;
    private readonly packagePath: string;
    // 该包的package.json配置文件
    private readonly packageJsonPath: string;

    constructor(config: AliConfig, packageName: string, logger: Logger) {
        this.packageName = packageName;
        this.logger = logger;
        const packageAccess = config.getMatchedPackagesSpec(packageName);
        if (packageAccess) {
            const storage = packageAccess.storage;
            const packageCustomFolder = addTrailingSlash(storage);
            this.packagePath = `${config.keyPrefix}${packageCustomFolder}${this.packageName}`;
        } else {
            this.packagePath = `${config.keyPrefix}${this.packageName}`;
        }
        this.packageJsonPath = `${this.packagePath}/package.json`;
    }

    updatePackage(
        packageName: string,
        updateHandler: StorageUpdateCallback,
        onWrite: StorageWriteCallback,
        transformPackage: PackageTransformer,
        onEnd: CallbackAction
    ) {
        this.logger.debug({ pkgFileName: packageName }, '[updatePackage init] @{pkgFileName}');
        this.getPackageInfo()
            .then(pkg => {
                updateHandler(pkg, err => {
                    if (err) {
                        this.logger.error({ err }, '[updatePackage updateHandler onEnd] @{err}');
                        onEnd(err);
                    } else {
                        const transformedPackage = transformPackage(pkg);
                        this.logger.debug(
                            { transformedPackage },
                            '[updatePackage updateHandler onWrite] @{transformedPackage}'
                        );
                        onWrite(packageName, transformedPackage, onEnd);
                    }
                });
            })
            .catch(err => {
                this.logger.error({ err }, '[updatePackage updateHandler onEnd catch] @{err}');
                return onEnd(err);
            });
    }

    private async getPackageInfo(): Promise<Package> {
        this.logger.debug('[getPackageInfo init]' + this.packageJsonPath);
        const oss = AliyunOSS.inst.getOSS();
        return oss.get(this.packageJsonPath)
            .then(data => {
                try {
                    const pkgInfo = JSON.parse(data.content);
                    this.logger.trace({ result: pkgInfo }, '[getPackageInfo body] @{result.name}');
                    return pkgInfo;
                } catch (e) {
                    this.logger.error({ body: data.content }, '[getPackageInfo] error parsing: @{body}');
                    throw e;
                }
            })
            .catch((err: AliError) => {
                const vcError = convertError(err);
                this.logger.error({ error: err.message }, '[getPackageInfo] @{error}');
                // 这里派发HttpError，才会触发ReadPackage的回调然后执行初始化package，醉了醉了
                throw vcError;
            });
    }

    /** 删除指定版本的包文件 */
    deletePackage(fileName: string, callback: Callback): void {
        AliyunOSS.inst.getOSS().delete(`${this.packagePath}/${fileName}`)
            .then(() => {
                this.logger.info(`[deletePackage] success : ${fileName}`);
                callback(null);
            })
            .catch((err: AliError) => {
                this.logger.error(`[deletePackage] ${err.message}`);
                callback(convertError(err));
            })
    }

    /** 删除整个包 */
    removePackage(callback: CallbackAction): void {
        const oss = AliyunOSS.inst.getOSS();
        oss.delete(`${this.packagePath}`)
            .then(() => {
                this.logger.debug(`[removePackage] success`);
                callback(null);
            })
            .catch(err => {
                this.logger.error(`[removePackage] ${err.message}`);
                callback(convertError(err));
            });
    }

    createPackage(name: string, value: Package, callback: CallbackAction): void {
        this.logger.debug(
            { name, packageName: this.packageName },
            'createPackage init] name @{name}/@{packageName}'
        );
        this.logger.trace({ value }, 'createPackage init] name @value');
        const oss = AliyunOSS.inst.getOSS();
        oss.head(this.packageJsonPath)
            .then(() => {
                this.logger.error('createPackage ] package exist already');
                callback(getConflict('file already exists'));
            })
            .catch((err: AliError) => {
                if (err.status === 404) {
                    this.logger.debug('[createPackage] 404, so start create');
                    this.savePackage(name, value, callback);
                } else {
                    this.logger.error(`createPackage error] ${err.message}`);
                    callback(convertError(err));
                }
            });
    }

    savePackage(name: string, value: Package, callback: CallbackAction): void {
        this.logger.debug(
            { name, packageName: this.packageName },
            '[savePackage init] name @{name}/@{packageName}'
        );
        this.logger.trace({ value }, '[savePackage ] init value @value');
        AliyunOSS.inst.getOSS().put(this.packageJsonPath, new Buffer(JSON.stringify(value, null, '  ')))
            .then(data => {
                callback(null);
            })
            .catch(err => {
                callback(convertError(err));
            });
    }

    readPackage(name: string, callback: ReadPackageCallback): void {
        this.getPackageInfo()
            .then(data => {
                this.logger.trace(`[readPackage] packageName: ${name}`);
                callback(null, data);
            })
            .catch((err: AliError) => {
                this.logger.error(`[readPackage] ${err.message}`);
                callback(convertError(err));
            });
    }

    writeTarball(name: string): UploadTarball {
        const packageName = this.packageName;
        this.logger.debug(`[writeTarball init] name ${name}/${packageName}`);
        const uploadStream = new UploadTarball({});

        const oss = AliyunOSS.inst.getOSS();
        const fileName = `${this.packagePath}/${name}`;
        oss.head(fileName)
            .then(() => {
                this.logger.debug(`[writeTarball head] file already exists: ${name}`);
                uploadStream.emit('error', getConflict('file already exists'));
            })
            .catch((err: AliError) => {
                const vcError = convertError(err);
                // 404表示没有重复文件，可以上传
                if (err.status === 404) {
                    uploadStream.emit('open');
                    oss.putStream(fileName, uploadStream)
                        .then(data => {
                            this.logger.trace({ data }, '[writeTarball success] response @{data}');
                            uploadStream.emit('success');
                        })
                        .catch((err: AliError) => {
                            this.logger.trace(`[writeTarball fail] response ${err.message}`);
                            uploadStream.emit('error', vcError);
                        });
                } else {
                    this.logger.error('[writeTarball headObject] non a 404 emit');
                    uploadStream.emit('error', vcError);
                }
            });
        return uploadStream;
    }

    readTarball(name: string): ReadTarball {
        this.logger.debug(`[readTarball init] name ${this.packageName}/${name}`);
        const readTarballStream = new ReadTarball({});
        const oss = AliyunOSS.inst.getOSS();
        oss.getStream(`${this.packagePath}/${name}`)
            .then(data => {
                if (data.res.status !== 200) {
                    const errMsg = `${name}不存在`;
                    readTarballStream.emit('error', errMsg);
                    this.logger.error(`[readTarball readTarballStream event] error ${errMsg}`);
                } else {
                    const contentLength = data.res.headers['content-length'];
                    this.logger.debug('[readTarball readTarballStream event] emit content-length:' + contentLength);
                    readTarballStream.emit(HEADERS.CONTENT_LENGTH, contentLength);
                    readTarballStream.emit('open');
                    this.logger.debug('[readTarball readTarballStream event] emit open');
                    data.stream.pipe(readTarballStream);
                    readTarballStream.abort = (): void => {
                        this.logger.debug('[readTarball readTarballStream event] request abort');
                        data.stream.abort();
                    };
                }
            })
            .catch((err: AliError) => {
                this.logger.error(`[readTarball readTarballStream event] error ${err.message}`);
                readTarballStream.emit('error', convertError(err));
            });
        return readTarballStream;
    }
}
