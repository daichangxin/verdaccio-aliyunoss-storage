import { getBadRequest, getForbidden, getNotFound, getServiceUnavailable, VerdaccioError } from "@verdaccio/commons-api";

// https://www.alibabacloud.com/help/zh/doc-detail/32005.htm
export type AliError = {
    status: number;
    code: string;
    message: string;
}

export const convertError = (err: AliError): VerdaccioError => {
    switch (err.status) {
        case 403:
            return getForbidden(err.message);
        case 404:
            return getNotFound(err.message);
        case 503:
            return getServiceUnavailable(err.message);
        default:
            return getBadRequest(err.message);
    }
};