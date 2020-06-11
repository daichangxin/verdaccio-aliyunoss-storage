import { getServiceUnavailable } from '@verdaccio/commons-api';
import { Callback, Config, IPackageStorage, IPluginStorage, LocalStorage, Logger, onEndSearchPackage, onSearchPackage, onValidatePackage, PluginOptions, Token, TokenFilter } from '@verdaccio/types';
import { GetObjectResult } from 'ali-oss';
import { AliConfig } from './aliyunoss/AliConfig';
import AliPackageManager from './aliyunoss/AliPackageManager';
import { AliyunOSS } from './aliyunoss/AliyunOSS';
import { addTrailingSlash } from './utils';
/**
 * 阿里云OSS存储
 */
export default class AliyunOSSDatabase implements IPluginStorage<AliConfig> {
    logger: Logger;
    config: AliConfig;
    private _storageInfo: LocalStorage;
    private _storageName: string;

    constructor(config: Config, options: PluginOptions<AliConfig>) {
        this.logger = options.logger;
        if (!config) {
            throw new Error('aliyunOSS storage missing config. Add `store.aliyunoss-storage` to your config file');
        }
        this.config = Object.assign(config, config.store['aliyunoss-storage']);
        if (!this.config.bucket) {
            throw new Error('aliyunOSS storage requires a bucket');
        }
        this.config.keyPrefix = addTrailingSlash(this.config.keyPrefix);
        this._storageName = `${this.config.keyPrefix}verdaccio-aliyunoss-db.json`;
        AliyunOSS.inst.initOSS(this.config);
        this.logger.debug({ config: JSON.stringify(this.config, null, 4) }, 'aliyunoss: configuration: @{config}');
    }

    async getSecret() {
        return this.getStorageInfo().then(res => {
            return res.secret;
        }).catch(err => {
            throw err;
        })
    }

    async setSecret(secret: string) {
        (await this.getStorageInfo()).secret = secret;
        await this.saveStorageInfo();
    }

    add(name: string, callback: Callback): void {
        this.logger.debug({ name }, 'aliyunoss: [add] private package @{name}');
        this.getStorageInfo().then(async data => {
            if (data.list.indexOf(name) === -1) {
                data.list.push(name);
                this.logger.trace({ name }, 'aliyunoss: [add] @{name} has been added');
                try {
                    await this.saveStorageInfo();
                    callback(null);
                } catch (err) {
                    callback(err);
                }
            } else {
                callback(null);
            }
        });
    }

    async search(onPackage: onSearchPackage, onEnd: onEndSearchPackage, validateName: onValidatePackage): Promise<void> {
        this.logger.debug('aliyunoss: [search]');
        const storage = await this.getStorageInfo();
        const storageInfoMap = storage.list.map(this._fetchPackageInfo.bind(this, onPackage));
        this.logger.debug({ l: storageInfoMap.length }, 'aliyunoss: [search] storageInfoMap length is @{l}');
        await Promise.all(storageInfoMap);
        onEnd();
    }

    private async _fetchPackageInfo(onPackage: Function, packageName: string): Promise<void> {
        const { bucket, keyPrefix } = this.config;
        this.logger.debug({ packageName }, 'aliyunoss: [_fetchPackageInfo] @{packageName}');
        this.logger.trace({ keyPrefix, bucket }, 'aliyunoss: [_fetchPackageInfo] bucket: @{bucket} prefix: @{keyPrefix}');
        const oss = AliyunOSS.inst.getOSS();
        return oss.get(`${keyPrefix + packageName}/package.json`)
            .then(data => {
                return JSON.parse(data.content);
            }).catch(err => {
                this.logger.debug({ err }, 'aliyunoss: [_fetchPackageInfo] error: @{err}');
            });
    }

    remove(name: string, callback: Callback): void {
        this.logger.debug({ name }, 'aliyunoss: [remove] @{name}');
        this.get(async (err, data) => {
            if (err) {
                this.logger.error({ err }, 'aliyunoss: [remove] error: @{err}');
                callback('something went wrong on remove a package');
            }

            const pkgName = data.indexOf(name);
            if (pkgName !== -1) {
                const data = await this.getStorageInfo();
                data.list.splice(pkgName, 1);
                this.logger.debug({ pkgName }, 'aliyunoss: [remove] sucessfully removed @{pkgName}');
            }

            try {
                this.logger.trace('aliyunoss: [remove] starting sync');
                await this.saveStorageInfo();
                this.logger.trace('aliyunoss: [remove] finish sync');
                callback(null);
            } catch (err) {
                this.logger.error({ err }, 'aliyunoss: [remove] sync error: @{err}');
                callback(err);
            }
        });
    }

    get(callback: Callback): void {
        this.logger.debug('aliyunoss: [get]');
        this.getStorageInfo().then(data => {
            this.logger.debug('aliyunoss: [get] _getData' + JSON.stringify(data));
            callback(null, data.list);
        });
    }

    /** 包配置文件上传到oss */
    private async saveStorageInfo() {
        const { bucket, keyPrefix } = this.config;
        this.logger.debug({ keyPrefix, bucket }, '[saveStorageInfo] bucket: @{bucket} prefix: @{keyPrefix}');
        const oss = AliyunOSS.inst.getOSS();
        return oss.put(this._storageName, new Buffer(JSON.stringify(this._storageInfo)))
            .then(data => {
                this.logger.debug('[saveStorageInfo] sucess' + data);
            })
            .catch(err => {
                this.logger.error({ err }, '[saveStorageInfo] error: @{err}');
                throw err;
            });
    }

    getPackageStorage(packageName: string): IPackageStorage {
        this.logger.debug({ packageName }, '[getPackageStorage] @{packageName}');
        return new AliPackageManager(this.config, packageName, this.logger);
    }

    private async getStorageInfo() {
        if (this._storageInfo) return Promise.resolve(this._storageInfo);
        const oss = AliyunOSS.inst.getOSS();
        return oss.get(this._storageName)
            .then((data: GetObjectResult) => {
                this.logger.info(`[getStorageInfo] success !`);
                this._storageInfo = JSON.parse(data.content);
                return this._storageInfo;
            })
            .catch((err: { status: number, code: string }) => {
                if (err.status === 404) {
                    this._storageInfo = { list: [], secret: '' };
                    return this._storageInfo;
                } else {
                    this.logger.error(`[getStorageInfo] ${JSON.stringify(err)}`);
                    throw err;
                }
            });
    }

    saveToken(token: Token): Promise<void> {
        this.logger.warn({ token }, 'save token has not been implemented yet @{token}');
        return Promise.reject(getServiceUnavailable('[saveToken] method not implemented'));
    }

    deleteToken(user: string, tokenKey: string): Promise<void> {
        this.logger.warn({ tokenKey, user }, 'delete token has not been implemented yet @{user}');
        return Promise.reject(getServiceUnavailable('[deleteToken] method not implemented'));
    }

    readTokens(filter: TokenFilter): Promise<Token[]> {
        this.logger.warn({ filter }, 'read tokens has not been implemented yet @{filter}');
        return Promise.reject(getServiceUnavailable('[readTokens] method not implemented'));
    }
}
