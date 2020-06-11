export const addTrailingSlash = (path?: string) => {
    return path != null ? (path.endsWith('/') ? path : `${path}/`) : '';
};

export const getEnv = (key: string, defaultValue?: string) => {
    return process.env[key] || defaultValue || '';
};