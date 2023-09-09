[npm-image]: https://img.shields.io/npm/v/portmp.svg
[npm-url]: https://www.npmjs.com/package/portmp

[npm-package-image]: https://github.com/tinysets/portmp/actions/workflows/npm-publish.yml/badge.svg
[npm-package-url]: https://github.com/tinysets/portmp/actions/workflows/npm-publish.yml

# portmp -> port mapping

<!-- [![Node.js Package][npm-package-image]][npm-package-url] -->
[![npm version][npm-image]][npm-url]


## Introduction
- port mapping
- A fast reverse proxy to help you expose a local server behind a NAT or firewall to the internet.
- Support TCP & UDP.
- local port forward, remote port forward.

## Usage

Install the plugin with NPM:

```
$ npm install -g portmp
then
$ portmp -h
```

#### As Server
```
$ portmp server
will gen a server.json in your `pwd`
```

#### As Client
```
$ portmp client
will gen a client.json in your `pwd`
```

#### Config File:
```json
// server.json
{
  "port": 7666,
  "validKeys": [
    "userkey1",
    "userkey2"
  ]
}
```
```json
// client.json
{
  "address": "127.0.0.1",
  "port": 7666,
  "authKey": "userkey1",
  "forwardInfos": [
    {
      "note": "for test",
      "isLocalForward": true,
      "type": "tcp",
      "targetAddr": "127.0.0.1",
      "targetPort": 46464,
      "fromPort": 56565
    },
    {
      "note": "for test",
      "isLocalForward": false,
      "type": "udp",
      "targetAddr": "127.0.0.1",
      "targetPort": 46464,
      "fromPort": 56565
    }
  ]
}
```