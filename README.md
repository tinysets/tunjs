[npm-image]: https://img.shields.io/npm/v/tunjs.svg
[npm-url]: https://www.npmjs.com/package/tunjs

[npm-package-image]: https://github.com/tinysets/tunjs/actions/workflows/npm-publish.yml/badge.svg
[npm-package-url]: https://github.com/tinysets/tunjs/actions/workflows/npm-publish.yml

# tunjs -> tunnel js

<!-- [![Node.js Package][npm-package-image]][npm-package-url] -->
[![npm version][npm-image]][npm-url]


## Introduction
- tunnel
- port mapping
- A fast reverse proxy to help you expose a local server behind a NAT or firewall to the internet.
- Support TCP & UDP.
- local port forward, remote port forward.

## Usage

Install the plugin with NPM:

```
$ npm install -g tunjs
then
$ tunjs -h
```

#### As Server
```
$ tunjs server
will gen a server.json in your `pwd`
```

#### As Client
```
$ tunjs client
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
  "tunnelInfos": [
    {
      "note": "for test",
      "isLocalTunnel": true,
      "type": "tcp",
      "targetAddr": "127.0.0.1",
      "targetPort": 46464,
      "sourcePort": 56565
    },
    {
      "note": "for test",
      "isLocalTunnel": false,
      "type": "udp",
      "targetAddr": "127.0.0.1",
      "targetPort": 46464,
      "sourcePort": 56565,
      "timeout": 60
    }
  ]
}
```