# [1.1.0-next.2](https://github.com/kashje/harpo/compare/v1.1.0-next.1...v1.1.0-next.2) (2026-10-24)


### Bug Fixes

* **rate-limit:** fail open instead of hanging when Redis is down ([52a8ced](https://github.com/kashje/harpo/commit/52a8cede84fb3fbe68e3f1767eaa7bf9379fc619))
* **redis:** create the client on first use ([fc25aa6](https://github.com/kashje/harpo/commit/fc25aa6d7f6f27e788f7d0e21225c89824f35513))
* show the invalid key error for malformed link keys ([1c70fc5](https://github.com/kashje/harpo/commit/1c70fc53f3f086dd72c3cf20bf7e36cad4fee755))
* **ui:** align landing page claims with what Harpo does ([ecde31c](https://github.com/kashje/harpo/commit/ecde31ca7b10771733ca248076e466aeaa41059a))


### Features

* **security:** add a nonce-based content security policy and security headers ([c49b3c2](https://github.com/kashje/harpo/commit/c49b3c2fddcca243b7c60a769eaaa8cd80d9a3eb))
* **security:** delete expired secrets in the background ([8d9dc14](https://github.com/kashje/harpo/commit/8d9dc14c6fdf87b190c0c40415040eb6d2cff622))
* **security:** enforce view limits and passphrases on the server ([8afc477](https://github.com/kashje/harpo/commit/8afc477e54f1cb8089e0fe216c2aba8b597e795e))

# [1.1.0-next.1](https://github.com/kashje/harpo/compare/v1.0.0...v1.1.0-next.1) (2026-03-30)


### Features

* implement file uploads with local adapter ([c45da01](https://github.com/kashje/harpo/commit/c45da014caa40d015bca4ec3cfc559978ea3adab))

# 1.0.0 (2026-03-16)


### Bug Fixes

* cache step (testing ci) ([a98cc8c](https://github.com/kashje/harpo/commit/a98cc8cebd73f4246d27eb72c57e2cd6b3a57dd1))
* change node version in ci (just for testing ci pipeline) ([1fe1a66](https://github.com/kashje/harpo/commit/1fe1a6640cf6aa964dd4742b8c20624074229bef))
* ci ([67827b8](https://github.com/kashje/harpo/commit/67827b86178edd778b5adf77f8a22b5625e417e0))
* ci use pat ([9a5ea37](https://github.com/kashje/harpo/commit/9a5ea372e44e3e30e080adbc1b45fc1e2e673edf))
* dockerfile ([e64b2e3](https://github.com/kashje/harpo/commit/e64b2e39be3eca653fad53f3dee0c220f17cda0e))
* Dockerfile ([cab0d01](https://github.com/kashje/harpo/commit/cab0d0160de16ffb41bc6a5cdbb7aa34042fdb7e))
* rename release config ([5d813f6](https://github.com/kashje/harpo/commit/5d813f6c6f06749474b44b4ecfe892424c254c30))


### Features

* Add issue report button ([26fe552](https://github.com/kashje/harpo/commit/26fe55238516973a0b9f32e85dbaa39472d2d121))
* add rate limits ([94a77ed](https://github.com/kashje/harpo/commit/94a77ed796c43c58e50f409a9a5f87e61b9d2e27))
* **app-page:** create app page ([02902af](https://github.com/kashje/harpo/commit/02902af7b1938b1ada4cbebf4c8cf85ca4d51ab0))
* initial commit ([20c78dc](https://github.com/kashje/harpo/commit/20c78dc94cc62400908008cdf5f396078f0bfe59))
* initial commit ([862ce88](https://github.com/kashje/harpo/commit/862ce8847e4e043d2d27595a220baa8653a37db8))
* initial commit ([d0d5ecd](https://github.com/kashje/harpo/commit/d0d5ecd4fc840ca1fd2fd2369ef6171b7b07681b))
* **share, secrets:** Add client encryption/descryption of strings. Secret creation and fetching from encrypted url ([72d6a90](https://github.com/kashje/harpo/commit/72d6a909d5b503d6a0c6918a4dd5aaba7df49ab2))
* **share:** add password gate for password shares (unsafe) ([68b945d](https://github.com/kashje/harpo/commit/68b945dd70e494dc965d8a968b92b0037a2d11ed))
* **share:** Added basic sharing page (insecure) ([61a96a0](https://github.com/kashje/harpo/commit/61a96a069283bc92c934cc938bdcb8a3c80c5754))

# [1.0.0-next.3](https://github.com/kashje/harpo/compare/v1.0.0-next.2...v1.0.0-next.3) (2026-03-16)


### Features

* Add issue report button ([26fe552](https://github.com/kashje/harpo/commit/26fe55238516973a0b9f32e85dbaa39472d2d121))

# [1.0.0-next.2](https://github.com/kashje/harpo/compare/v1.0.0-next.1...v1.0.0-next.2) (2026-03-16)


### Features

* add rate limits ([94a77ed](https://github.com/kashje/harpo/commit/94a77ed796c43c58e50f409a9a5f87e61b9d2e27))

# 1.0.0-next.1 (2026-03-12)

### Bug Fixes

- cache step (testing ci) ([a98cc8c](https://github.com/kashje/harpo/commit/a98cc8cebd73f4246d27eb72c57e2cd6b3a57dd1))
- change node version in ci (just for testing ci pipeline) ([1fe1a66](https://github.com/kashje/harpo/commit/1fe1a6640cf6aa964dd4742b8c20624074229bef))
- ci ([67827b8](https://github.com/kashje/harpo/commit/67827b86178edd778b5adf77f8a22b5625e417e0))
- ci use pat ([9a5ea37](https://github.com/kashje/harpo/commit/9a5ea372e44e3e30e080adbc1b45fc1e2e673edf))
- dockerfile ([e64b2e3](https://github.com/kashje/harpo/commit/e64b2e39be3eca653fad53f3dee0c220f17cda0e))
- Dockerfile ([cab0d01](https://github.com/kashje/harpo/commit/cab0d0160de16ffb41bc6a5cdbb7aa34042fdb7e))
- rename release config ([5d813f6](https://github.com/kashje/harpo/commit/5d813f6c6f06749474b44b4ecfe892424c254c30))

### Features

- **app-page:** create app page ([02902af](https://github.com/kashje/harpo/commit/02902af7b1938b1ada4cbebf4c8cf85ca4d51ab0))
- initial commit ([20c78dc](https://github.com/kashje/harpo/commit/20c78dc94cc62400908008cdf5f396078f0bfe59))
- initial commit ([862ce88](https://github.com/kashje/harpo/commit/862ce8847e4e043d2d27595a220baa8653a37db8))
- initial commit ([d0d5ecd](https://github.com/kashje/harpo/commit/d0d5ecd4fc840ca1fd2fd2369ef6171b7b07681b))
- **share, secrets:** Add client encryption/descryption of strings. Secret creation and fetching from encrypted url ([72d6a90](https://github.com/kashje/harpo/commit/72d6a909d5b503d6a0c6918a4dd5aaba7df49ab2))
- **share:** add password gate for password shares (unsafe) ([68b945d](https://github.com/kashje/harpo/commit/68b945dd70e494dc965d8a968b92b0037a2d11ed))
- **share:** Added basic sharing page (insecure) ([61a96a0](https://github.com/kashje/harpo/commit/61a96a069283bc92c934cc938bdcb8a3c80c5754))
