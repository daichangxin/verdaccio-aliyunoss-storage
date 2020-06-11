import OSS from "ali-oss";
import { AliConfig } from './AliConfig';

export class AliyunOSS {
    static readonly inst = new AliyunOSS();

    private _oss: OSS;
    private _config: AliConfig;

    initOSS(config: AliConfig) {
        this._config = config;
        this._oss = new OSS({
            bucket: config.bucket,
            endpoint: config.endpoint,
            accessKeyId: config.accessKeyId,
            accessKeySecret: config.secretAccessKey,
        });
    }

    getOSS() {
        return this._oss;
    }

    getConfig() {
        return this._config;
    }
}