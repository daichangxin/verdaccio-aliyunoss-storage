import { Config } from "@verdaccio/types";
/** 阿里云oss配置 */
export interface AliConfig extends Config {
    bucket: string;
    keyPrefix: string;
    endpoint: string;
    accessKeyId: string;
    secretAccessKey: string;
}