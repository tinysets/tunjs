import Emitter from 'events'
import net from 'net'
import once from 'once'
import { TCPBufferHandler, TCPPacket } from './TCPPacket';
import { App, Context } from './App';


export class TCPSessionOptions {
    isTCPPacket: boolean = false;
    isServer: boolean = false;
    isClient: boolean = false;
}

export class TCPServer extends Emitter {
    server: net.Server | null;
    options: TCPSessionOptions;

    private app: App
    constructor(options: TCPSessionOptions) {
        super();
        this.options = options;
    }

    setApp(app: App) {
        this.app = app;
    }

    start(port: number) {
        if (this.server != null) {
            return;
        }
        let promise = new Promise<boolean>((resolve, reject) => {
            resolve = once(resolve)
            reject = once(reject)

            let server = this.server = new net.Server();
            server.on('listening', () => {
                console.log(`server on listening: ${port}`);
                resolve(true);
            });
            server.on('error', (err) => {
                console.log('server on error: ' + err);
                this.server = null;
                resolve(false);
            });
            server.on('close', () => {
                console.log('server on close');
                this.server = null;
            });

            server.on('connection', (socket) => {
                let tcpSession = new TCPSession(this.options, socket)
                tcpSession.name = "Session(ServerSide)"
                tcpSession.setApp(this.app)
                tcpSession.startServer()
                // @TODO 记录该session
            });
            server.listen(port);
        });
        return promise
    }

    close() {
        if (this.server == null) {
            return;
        }
        this.server.close();
        this.server = null;
    }
}

export class TCPSession extends Emitter {
    name = ""
    socket: net.Socket
    options: TCPSessionOptions;
    private bufferHandler: TCPBufferHandler = new TCPBufferHandler()

    private app: App
    private ctx: Context;
    private eventEmiter: (ctx: Context) => void;
    constructor(options: TCPSessionOptions, socket: net.Socket) {
        super();
        this.options = options;
        this.socket = socket;
        this.emitCloseEvent = once(() => { this.emitCloseEvent() })
    }

    setApp(app: App) {
        this.app = app;
        if (app == null) {
            this.ctx = null;
            this.eventEmiter = null;
        } else {
            this.ctx = this.app.createContext()
            this.ctx.tcpSession = this;
            this.eventEmiter = this.app.callback();
        }
    }

    startServer() {
        if (this.socket == null) {
            return;
        }
        let socket = this.socket
        socket.on("close", () => {
            this.onClose();
        });
        socket.on("connect", () => {
        });
        socket.on("data", (data) => {
            this.onData(data);
        });
        socket.on("drain", () => {
        });
        socket.on("end", () => {
            this.onEnd();
        });
        socket.on("error", (error) => {
            this.onError(error);
        });
        socket.on("lookup", () => {
        });
        socket.on("ready", () => {
        });
        socket.on("timeout", () => {
            this.onTimeout();
        });
    }

    startClient(port: number, host: string) {
        if (this.socket == null) {
            return;
        }

        let promise = new Promise<boolean>((resolve, reject) => {
            resolve = once(resolve)
            reject = once(reject)

            let socket = this.socket
            socket.on("close", () => {
                this.onClose();
            });
            socket.on("connect", () => {
            });
            socket.on("ready", () => {
                resolve(true)
            });
            socket.on("data", (data) => {
                this.onData(data);
            });
            socket.on("drain", () => {
            });
            socket.on("end", () => {
                this.onEnd();
            });
            socket.on("error", (error) => {
                this.onError(error);
                resolve(false)
            });
            socket.on("lookup", () => {
            });

            socket.on("timeout", () => {
                this.onTimeout();
            });
            socket.connect(port, host)
        });
        return promise
    }

    write(packet: TCPPacket) {
        this.socket.write(packet.GetSendBuffer());
    }

    writeBuffer(buffer: Uint8Array | string) {
        this.socket.write(buffer);
    }

    close() {
        this.socket.end();
    }

    private onData(buffer: Buffer) {
        if (this.options.isTCPPacket) {
            this.bufferHandler.put(buffer);
            let tcpPacket = this.bufferHandler.tryGetMsgPacket()
            if (tcpPacket) {
                if (this.eventEmiter) {
                    this.ctx.tcpEvent = "packet"
                    this.ctx.tcpPacket = tcpPacket
                    this.eventEmiter(this.ctx)
                }
            }
        } else {
            if (this.eventEmiter) {
                this.ctx.tcpEvent = "data"
                this.ctx.tcpBuffer = buffer
                this.eventEmiter(this.ctx)
            }
        }
    }

    private onClose() {
        this.socket.destroy();
        this.emitCloseEvent();
    }
    private onEnd() {
        this.socket.destroy();
        this.emitCloseEvent();

    }
    private onError(error: Error) {
        console.log(error);
        this.socket.destroy();
        this.emitCloseEvent();
    }
    private onTimeout() {
        this.socket.destroy();
        this.emitCloseEvent();
    }

    private emitCloseEvent() {
        if (this.eventEmiter) {
            this.ctx.tcpEvent = "close"
            this.eventEmiter(this.ctx)
        }
    }

}