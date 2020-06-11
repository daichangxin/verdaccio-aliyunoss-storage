# verdaccio-aliyunoss-storage

### Usage

```
npm install verdaccio-aliyunoss-storage
```

In your verdaccio config, configure

```
store:
  aliyunoss-storage:
    bucket: npm-packages
    keyPrefix: packages
    # https://help.aliyun.com/document_detail/31837.html
    endpoint: oss-cn-shanghai.aliyuncs.com
    accessKeyId: YOUR ACCESS_KEY_ID
    secretAccessKey: YOUR SECRET_ACCESS_KEY
```
