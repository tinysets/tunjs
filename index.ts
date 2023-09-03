import Koa from 'koa'
import Emitter from 'events'
import net from 'net'
import compose from 'koa-compose'
import { ForwardInfo, TCPBufferHandler, CMD, TCPForwardConnected, TCPPacket, TCPForwardData } from './TCPPacket'
import { buffer } from 'stream/consumers'

let koaApp = new Koa();

interface Context {
    tcpEvent?: string
    tcpSession?: TCPSession
    tcpPacket?: TCPPacket
    tcpBuffer?: Buffer
    tcpError?: Error
}

let context = {}


class Application extends Emitter {

    middleware: any[]
    context: Context
    constructor() {
        super();
        this.middleware = [];
        this.context = Object.create(context);
    }

    use(fn) {
        this.middleware.push(fn);
        return this;
    }

    callback() {
        const fn = compose(this.middleware);
        const handleRequest = (ctx: Context) => {
            return this.handleRequest(ctx, fn);
        };
        return handleRequest;
    }

    createContext() {
        const context = Object.create(this.context);
        context.app = this;
        return context as Context;
    }

    handleRequest(ctx: Context, fnMiddleware) {
        const onerror = err => console.error(err);
        const handleResponse = () => { };
        return fnMiddleware(ctx).then(handleResponse).catch(onerror);
    }
}

class TCPServer extends Emitter {
    app: Application
    server: net.Server | null;
    options: TCPSessionOptions;
    constructor(options: TCPSessionOptions) {
        super();
        this.options = options;
    }

    start(port: number) {
        if (this.server != null) {
            return;
        }

        let server = this.server = new net.Server();
        server.on('connection', (socket) => {
            console.log(`server on connection remote: ${socket.remoteAddress}:${socket.remotePort}`);
            let tcpSession = new TCPSession(this.options, this.app, socket)
            tcpSession.name = "ServerSession"
        });

        server.on('listening', () => {
            console.log(`server on listening: ${port}`);
        });
        server.on('close', () => {
            console.log('server on close');
            this.server = null;
        });
        server.on('error', (err) => {
            console.log('server on error: ' + err);
            this.server = null;
        });
        server.on('drop', (info) => {
            console.log('server on drop');
        });

        server.listen(port);
    }

    close() {
        if (this.server == null) {
            return;
        }
        this.server.close();
        this.server = null;
    }
}


interface TCPSessionOptions {
    isTCPPacket: boolean
    isServer: boolean
    isClient: boolean
}
class TCPSession extends Emitter {
    public name = ""
    private app: Application
    public socket: net.Socket
    private bufferHandler: TCPBufferHandler = new TCPBufferHandler()
    private ctx: Context;
    private eventHandler: (ctx: Context) => void;

    public isTCPPacket: boolean = false;
    public isServer: boolean = false;
    public isClient: boolean = false;

    constructor(options: TCPSessionOptions, app: Application, socket: net.Socket) {
        super();
        this.isTCPPacket = !!options.isTCPPacket;
        this.isServer = !!options.isServer;
        this.isClient = !!options.isClient;

        this.app = app;
        this.socket = socket;
        this.ctx = this.app.createContext()
        this.ctx.tcpSession = this;
        this.eventHandler = this.app.callback();

        socket.on("close", () => {
            console.log(`TCPSession[${this.name}] on close`);
            this.onClose();
        });
        socket.on("connect", () => {
            console.log(`TCPSession[${this.name}] on connect`);
            if (this.isClient) {
                this.ctx.tcpEvent = "connect"
                this.eventHandler(this.ctx)
            }
        });
        socket.on("data", (data) => {
            this.onData(data);
        });
        socket.on("drain", () => {
            console.log(`TCPSession[${this.name}] on drain`);
        });
        socket.on("end", () => {
            console.log(`TCPSession[${this.name}] on end`);
            this.onEnd();
        });
        socket.on("error", (error) => {
            console.log(`TCPSession[${this.name}] on error`);
            this.onError(error);
        });
        socket.on("lookup", () => {
            console.log(`TCPSession[${this.name}] on lookup`);
        });
        socket.on("ready", () => {
            console.log(`TCPSession[${this.name}] on ready`);
            this.ctx.tcpEvent = "ready"
            this.eventHandler(this.ctx)
        });
        socket.on("timeout", () => {
            console.log(`TCPSession[${this.name}] on timeout`);
            this.onTimeout();
        });

        if (this.isServer) {
            this.ctx.tcpEvent = "connect"
            this.eventHandler(this.ctx)
        }
    }

    write(packet: TCPPacket) {
        if (packet != null) {
            this.socket.write(packet.GetSendBuffer());
        }
    }

    writeBuffer(buffer: Uint8Array | string) {
        this.socket.write(buffer);
    }

    close() {
        this.socket.end();
    }

    private onData(buffer: Buffer) {
        if (this.isTCPPacket) {
            this.bufferHandler.put(buffer);
            let packet = this.bufferHandler.tryGetMsgPacket()
            if (packet) {
                this.onPacket(packet)
            }
        } else {
            console.log(`TCPSession[${this.name}] on data`);
            this.ctx.tcpEvent = "data"
            this.ctx.tcpBuffer = buffer
            this.eventHandler(this.ctx)
        }
    }
    private onClose() {
        this.socket.destroy();
    }
    private onEnd() {
        this.socket.destroy();
    }
    private onError(error: Error) {
        console.log(error);
        this.ctx.tcpEvent = "error"
        this.ctx.tcpError = error
        this.eventHandler(this.ctx)
        this.socket.destroy();
    }
    private onTimeout() {
        this.socket.destroy();
    }

    private onPacket(tcpPacket: TCPPacket) {
        this.ctx.tcpEvent = "packet"
        this.ctx.tcpPacket = tcpPacket
        this.eventHandler(this.ctx)
    }
}

class TCPEventRouter {
    private map = new Map()
    use(event: string, fn) {
        this.map[event] = fn
    }
    callback() {
        return (ctx: Context, next) => {
            let event = ctx.tcpEvent;
            if (this.map[event] != null) {
                let fn = this.map[event];
                fn(ctx, next)
            } else {
                next();
            }
        };
    }
}

class TCPPacketRouter {
    private map = new Map()
    use(cmd: number, fn) {
        this.map[cmd] = fn
    }
    callback() {
        return (ctx: Context, next) => {
            if (ctx.tcpEvent == "packet") {
                let tcpPacket = ctx.tcpPacket;
                var cmd = tcpPacket.Cmd;
                if (this.map[cmd] != null) {
                    let fn = this.map[cmd];
                    fn(ctx, next)
                } else {
                    next();
                }
            } else {
                next();
            }
        };
    }
}


interface ServerForwardedInfo {
    tcpSession: TCPSession
    forwardInfo: ForwardInfo
    tcpServer?: TCPServer
}

class ServerForwardManager {
    forwardeds: ServerForwardedInfo[] = []
    public NewForward(targetTCPSession: TCPSession, forwardInfo: ForwardInfo) {
        for (const forwarded of this.forwardeds) {
            if (forwarded.forwardInfo.type == forwardInfo.type) {
                if (forwarded.forwardInfo.serverPort == forwardInfo.serverPort) {
                    console.error('服务器端口已经被占用了')
                    return;
                }
            }
        }

        if (forwardInfo.type == 'tcp') {
            this.newTCPForwardServer(targetTCPSession, forwardInfo)
        }
    }

    private newTCPForwardServer(targetTCPSession: TCPSession, forwardInfo: ForwardInfo) {
        let tcpServerApp = new Application();
        let tcpEventRouter = new TCPEventRouter();
        tcpEventRouter.use('connect', async (ctx: Context, next) => {
            let tcpSession = ctx.tcpSession;
            let tcpForwardConnected: TCPForwardConnected = {
                forwardInfo: forwardInfo,
                sessionPort: tcpSession.socket.remotePort
            }
            let tcpPacket = new TCPPacket();
            tcpPacket.Cmd = CMD.S2C_TCPForward_Connected
            tcpPacket.SetJsonData(tcpForwardConnected);
            targetTCPSession.write(tcpPacket);
        })
        tcpEventRouter.use('data', async (ctx: Context, next) => {
            let tcpSession = ctx.tcpSession;
            let tcpBuffer = ctx.tcpBuffer;

            let tcpForwardData: TCPForwardData = {
                forwardInfo: forwardInfo,
                sessionPort: tcpSession.socket.remotePort,
                buffer: tcpBuffer
            }

            let tcpPacket = new TCPPacket();
            tcpPacket.Cmd = CMD.S2C_TCPForward_Data
            tcpPacket.SetJsonData(tcpForwardData);
            targetTCPSession.write(tcpPacket);
        })
        tcpServerApp.use(tcpEventRouter.callback())
        let options: TCPSessionOptions = {
            isTCPPacket: false,
            isClient: false,
            isServer: true,
        }
        let tcpServer = new TCPServer(options);
        tcpServer.app = tcpServerApp;
        tcpServer.start(forwardInfo.serverPort)

        let forwardedInfo: ServerForwardedInfo = {
            tcpSession: targetTCPSession,
            forwardInfo: forwardInfo,
            tcpServer: tcpServer,
        }
        this.forwardeds.push(forwardedInfo)
    }

    public OnClose(targetTCPSession: TCPSession) {

    }

    public ForwardData(targetTCPSession: TCPSession, tcpForwardData: TCPForwardData) {
        for (const forwarded of this.forwardeds) {
            for (const forwarded of this.forwardeds) {
                if (forwarded.forwardInfo.type == tcpForwardData.forwardInfo.type) {
                    if (forwarded.forwardInfo.serverPort == tcpForwardData.forwardInfo.serverPort) {
                        if (forwarded.tcpSession == tcpForwardData.sessionPort) {

                        }
                    }
                }
            }
        }
    }
}


interface ClientForwardedInfo {
    tcpSession: TCPSession
    tcpForwardConnected: TCPForwardConnected
    proxySession?: TCPSession
}

class ClientForwardManager {
    forwardeds: ClientForwardedInfo[] = []
    public NewForward(targetTCPSession: TCPSession, tcpForwardConnected: TCPForwardConnected) {
        for (const forwarded of this.forwardeds) {
            if (forwarded.tcpForwardConnected.forwardInfo.type == tcpForwardConnected.forwardInfo.type) {
                if (forwarded.tcpForwardConnected.forwardInfo.serverPort == tcpForwardConnected.forwardInfo.serverPort) {
                    if (forwarded.tcpForwardConnected.sessionPort == tcpForwardConnected.sessionPort) {
                        console.error('本地端口转发连接已创建')
                        return;
                    }
                }
            }
        }

        if (tcpForwardConnected.forwardInfo.type == 'tcp') {
            this.newTCPForwardClient(targetTCPSession, tcpForwardConnected)
        }
    }

    private newTCPForwardClient(targetTCPSession: TCPSession, tcpForwardConnected: TCPForwardConnected) {
        let tcpClientApp = new Application();
        let tcpEventRouter = new TCPEventRouter();
        tcpEventRouter.use('connect', async (ctx: Context, next) => {
            let tcpPacket = new TCPPacket();
            tcpPacket.Cmd = CMD.C2S_TCPForward_Connected
            targetTCPSession.write(tcpPacket);
        })
        tcpEventRouter.use('data', async (ctx: Context, next) => {
            let tcpSession = ctx.tcpSession;
            let tcpBuffer = ctx.tcpBuffer;

            let tcpForwardData: TCPForwardData = {
                forwardInfo: tcpForwardConnected.forwardInfo,
                sessionPort: tcpForwardConnected.sessionPort,
                buffer: tcpBuffer
            }

            let tcpPacket = new TCPPacket();
            tcpPacket.Cmd = CMD.C2S_TCPForward_Data
            tcpPacket.SetJsonData(tcpForwardData);
            targetTCPSession.write(tcpPacket);
        })
        tcpClientApp.use(tcpEventRouter.callback())
        let options: TCPSessionOptions = {
            isTCPPacket: false,
            isClient: true,
            isServer: false,
        }
        let clientSocket = new net.Socket();
        let tcpSession = new TCPSession(options, tcpClientApp, clientSocket);
        clientSocket.connect(tcpForwardConnected.forwardInfo.localPort, '127.0.0.1')

        let forwardedInfo: ClientForwardedInfo = {
            tcpSession: targetTCPSession,
            tcpForwardConnected: tcpForwardConnected,
            proxySession: tcpSession,
        }
        this.forwardeds.push(forwardedInfo)
    }

    public ForwardData(targetTCPSession: TCPSession, tcpForwardData: TCPForwardData) {
        for (const forwarded of this.forwardeds) {
            if (forwarded.tcpForwardConnected.forwardInfo.type == tcpForwardConnected.forwardInfo.type) {
                if (forwarded.tcpForwardConnected.forwardInfo.serverPort == tcpForwardConnected.forwardInfo.serverPort) {
                    if (forwarded.tcpForwardConnected.sessionPort == tcpForwardConnected.sessionPort) {
                        console.error('本地端口转发连接已创建')
                        return;
                    }
                }
            }
        }
    }

    public OnClose(targetTCPSession: TCPSession) {

    }
}

{ // server

    let forwardMng = new ServerForwardManager();

    let tcpServerApp = new Application();
    tcpServerApp.use(async (ctx: Context, next) => {
        // logger
        let tcpEvent = ctx.tcpEvent;
        let tcpSession = ctx.tcpSession;
        let socket = tcpSession.socket;
        console.log(`server remote: ${socket.remoteAddress}:${socket.remotePort} tcpEvent=${tcpEvent}`);
        await next();
    })

    let tcpPacketRouter = new TCPPacketRouter();
    tcpPacketRouter.use(CMD.Hello, async (ctx: Context, next) => {
        console.log(`server Receive: Hello`);
        let tcpSession = ctx.tcpSession;
        let packet = new TCPPacket()
        packet.Cmd = CMD.Hello
        tcpSession.write(packet);
    })
    tcpPacketRouter.use(CMD.C2S_New_Forward, async (ctx: Context, next) => {
        let tcpSession = ctx.tcpSession;
        let packet = ctx.tcpPacket
        let forwardInfo = packet.GetJsonData() as ForwardInfo;
        forwardMng.NewForward(tcpSession, forwardInfo)
    })

    tcpPacketRouter.use(CMD.C2S_TCPForward_Connected, async (ctx: Context, next) => {
        let tcpSession = ctx.tcpSession;
    })
    tcpPacketRouter.use(CMD.C2S_TCPForward_Data, async (ctx: Context, next) => {
        let tcpSession = ctx.tcpSession;
        let packet = ctx.tcpPacket
        let tcpForwardData: TCPForwardData = packet.GetJsonData()
        forwardMng.ForwardData(tcpSession, tcpForwardData)
    })

    let tcpEventRouter = new TCPEventRouter();
    tcpEventRouter.use('packet', tcpPacketRouter.callback())
    tcpServerApp.use(tcpEventRouter.callback())
    let options: TCPSessionOptions = {
        isTCPPacket: true,
        isClient: false,
        isServer: true,
    }
    let tcpServer = new TCPServer(options);
    tcpServer.app = tcpServerApp;
    tcpServer.start(8088)
}

{ // client
    let forwardMng = new ClientForwardManager();
    let tcpClientApp = new Application();
    tcpClientApp.use(async (ctx: Context, next) => {
        // logger
        let tcpEvent = ctx.tcpEvent;
        let tcpSession = ctx.tcpSession;
        let socket = tcpSession.socket;
        console.log(`client remote: ${socket.remoteAddress}:${socket.remotePort} tcpEvent=${tcpEvent}`);
        await next();
    })

    let tcpPacketRouter = new TCPPacketRouter();
    tcpPacketRouter.use(CMD.Hello, async (ctx: Context, next) => {
        console.log(`client Receive: Hello`);
        let tcpSession = ctx.tcpSession;
        let packet = new TCPPacket()
        packet.Cmd = CMD.C2S_New_Forward
        let forwardInfo: ForwardInfo = {
            type: "tcp",
            serverPort: 22222,
            localPort: 33333,
        }
        packet.SetJsonData(forwardInfo);
        tcpSession.write(packet);
    })

    tcpPacketRouter.use(CMD.S2C_New_Forward, async (ctx: Context, next) => {
        let tcpSession = ctx.tcpSession;
    })

    tcpPacketRouter.use(CMD.S2C_TCPForward_Connected, async (ctx: Context, next) => {
        let tcpSession = ctx.tcpSession;
        let packet = ctx.tcpPacket
        let tcpForwardConnected: TCPForwardConnected = packet.GetJsonData()
        forwardMng.NewForward(tcpSession, tcpForwardConnected)
    })

    tcpPacketRouter.use(CMD.S2C_TCPForward_Data, async (ctx: Context, next) => {
        let tcpSession = ctx.tcpSession;
        let packet = ctx.tcpPacket
        let tcpForwardData: TCPForwardData = packet.GetJsonData()
        forwardMng.ForwardData(tcpSession, tcpForwardData)
    })

    let tcpEventRouter = new TCPEventRouter();
    tcpEventRouter.use('packet', tcpPacketRouter.callback())
    tcpEventRouter.use('ready', async (ctx: Context, next) => {
        console.log(`client send: Hello`);
        let tcpSession = ctx.tcpSession;
        let packet = new TCPPacket()
        packet.Cmd = CMD.Hello
        tcpSession.write(packet);
    })
    tcpClientApp.use(tcpEventRouter.callback())

    let clientSocket = new net.Socket();
    let options: TCPSessionOptions = {
        isTCPPacket: true,
        isClient: true,
        isServer: false,
    }
    let tcpSession = new TCPSession(options, tcpClientApp, clientSocket);
    tcpSession.name = "Client"
    clientSocket.connect(8088, '127.0.0.1');
}


let testRemoteClient = () => { // test

    let tcpClientApp = new Application();
    let tcpEventRouter = new TCPEventRouter();
    tcpEventRouter.use('ready', async (ctx: Context, next) => {
        console.log(`testRemoteClient ready`);
        let tcpSession = ctx.tcpSession;
        tcpSession.writeBuffer('ddd');
    })
    tcpClientApp.use(tcpEventRouter.callback())

    let clientSocket = new net.Socket();
    let options: TCPSessionOptions = {
        isTCPPacket: false,
        isClient: true,
        isServer: false,
    }
    let tcpSession = new TCPSession(options, tcpClientApp, clientSocket);
    tcpSession.name = "testRemoteClient"
    clientSocket.connect(22222, '127.0.0.1');

}
setTimeout(testRemoteClient, 0);

let testRemoteClient2 = () => { // test

    let tcpClientApp = new Application();
    let tcpEventRouter = new TCPEventRouter();
    tcpEventRouter.use('ready', async (ctx: Context, next) => {
        console.log(`testRemoteClient2 ready`);
        let tcpSession = ctx.tcpSession;
        tcpSession.writeBuffer('ddd');
    })
    tcpClientApp.use(tcpEventRouter.callback())

    let clientSocket = new net.Socket();
    let options: TCPSessionOptions = {
        isTCPPacket: false,
        isClient: true,
        isServer: false,
    }
    let tcpSession = new TCPSession(options, tcpClientApp, clientSocket);
    tcpSession.name = "testRemoteClient2"
    clientSocket.connect(12345, '127.0.0.1');
}
setTimeout(testRemoteClient2, 1000);