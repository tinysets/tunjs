[npm-image]: https://img.shields.io/npm/v/portmp.svg
[npm-url]: https://www.npmjs.com/package/portmp

[npm-package-image]: https://github.com/tinysets/portmp/actions/workflows/npm-publish.yml/badge.svg
[npm-package-url]: https://github.com/tinysets/portmp/actions/workflows/npm-publish.yml

# portmp -> port mapping

[![Node.js Package][npm-package-image]][npm-package-url]
[![npm version][npm-image]][npm-url]


## Introduction

port mapping, local port forward,remote port forward, NAT, TCP, UDP

## Usage

Install the plugin with NPM:

```
npm install -g portmp
then
portmp -h
```

#### As Server
```
portmp server
will gen a server.json in your `pwd`
```

#### As Client
```
portmp client
will gen a client.json in your `pwd`
```