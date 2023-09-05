import Emitter from 'events'
import dgram from 'dgram'
import once from 'once'
import { App, Context } from './App';
import { UID } from './TCPSocket';
let socket = dgram.createSocket('udp4')

export class UDPSession {
    id: number
    ipPort: string
    address: string
    port: number
    server: UDPServer
    activeTime: number
    constructor(address: string, port: number, id: number) {
        this.address = address;
        this.port = port;
        this.ipPort = address + ':' + port;
        this.id = id
    }
}

export class UDPSessionManager {
    mapByStr: Map<string, UDPSession> = new Map()
    mapById: Map<number, UDPSession> = new Map()

    public AddNew(udpSession: UDPSession) {
        this.mapByStr.set(udpSession.ipPort, udpSession)
        this.mapById.set(udpSession.id, udpSession)
    }

    public GetByIPPort(ipPort: string) {
        return this.mapByStr.get(ipPort)
    }

    public GetById(id: number) {
        return this.mapById.get(id)
    }

    public Del(udpSession: UDPSession) {
        this.mapByStr.delete(udpSession.ipPort)
        this.mapById.delete(udpSession.id)
    }
}

export class UDPSocket extends Emitter {

    socket: dgram.Socket
    protected app: App
    protected ctx: Context;
    protected eventEmiter: (ctx: Context) => void;
    constructor(socket: dgram.Socket) {
        super();
        this.socket = socket
        let oriEmitCloseEventFn = this.emitCloseEventOnce.bind(this);
        this.emitCloseEventOnce = once(oriEmitCloseEventFn)
    }

    setApp(app: App) {
        this.app = app;
        if (app == null) {
            this.ctx = null;
            this.eventEmiter = null;
        } else {
            this.ctx = this.app.createContext()
            this.ctx.udpSocket = this;
            this.eventEmiter = this.app.callback();
        }
    }

    close() {
        this.socket.close();
    }

    protected onData(buffer: Buffer, rinfo: dgram.RemoteInfo) {
        this.emit('data', buffer, rinfo, this)
        if (this.eventEmiter) {
            this.ctx.udpEvent = "data"
            this.ctx.udpBuffer = buffer
            this.ctx.udpRemoteInfo = rinfo
            this.eventEmiter(this.ctx)
        }
    }

    protected onReady() {
        this.emit('ready', this)
        if (this.eventEmiter) {
            this.ctx.udpEvent = "ready"
            this.eventEmiter(this.ctx)
        }
    }
    protected onClose() {
        this.emitCloseEventOnce();
    }
    protected onError(error: Error) {
        console.error(error);
        this.socket.close();
        this.emitCloseEventOnce();
    }

    protected emitCloseEventOnce() {
        this.emit('close', this)
        if (this.eventEmiter) {
            this.ctx.udpEvent = "close"
            this.eventEmiter(this.ctx)
        }
    }
}

export class UDPServer extends UDPSocket {
    sessionManager = new UDPSessionManager()
    private intervalTimer = null;
    async startServer(port: number) {
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
            socket.on("error", (error) => {
                this.onError(error);
                resolve(false)
            });
            socket.on("listening", () => {
                this.onReady();
                resolve(true)
            });
            socket.on("message", (data, rinfo) => {
                this.onData(data, rinfo);
            });
            socket.bind(port)
        });
        return promise
    }

    write(buffer: Uint8Array | string, port: number, address: string) {
        if (buffer && this.socket)
            this.socket.send(buffer, port, address);
    }

    protected onReady() {
        this.intervalTimer = setInterval(() => {
            this.checkDeadSession()
        }, 1000)
        super.onReady()
    }

    protected onData(buffer: Buffer, rinfo: dgram.RemoteInfo) {
        let ipPort = rinfo.address + ':' + rinfo.port
        let session = this.sessionManager.GetByIPPort(ipPort)
        if (!session) {
            let id = UID.GetUID()
            session = new UDPSession(rinfo.address, rinfo.port, id)
            session.server = this
            this.sessionManager.AddNew(session)
            this.emit('connect', session)
            if (this.eventEmiter) {
                this.ctx.udpEvent = "connect"
                this.ctx.udpSession = session
                this.eventEmiter(this.ctx)
            }
        }
        session.activeTime = Date.now();
        super.onData(buffer, rinfo)
    }

    close() {
        if (this.intervalTimer) {
            clearInterval(this.intervalTimer)
            this.intervalTimer = null;
        }
        super.close()
    }

    private checkDeadSession() {
        let toCloses: UDPSession[] = [];
        let now = Date.now()
        for (const session of this.sessionManager.mapById.values()) {
            let dt = now - session.activeTime
            if (dt > 5) {
                toCloses.push(session)
            }
        }
        for (const session of toCloses) {
            this.sessionManager.Del(session)
        }
    }
}



export class UDPClient extends UDPSocket {
    async startClient(port: number, address = '127.0.0.1') {
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
            socket.on("error", (error) => {
                this.onError(error);
                resolve(false)
            });
            socket.on("connect", () => {
                this.onReady();
                resolve(true)
            });
            socket.on("message", (data, rinfo) => {
                this.onData(data, rinfo);
            });
            socket.connect(port, address)
        });
        return promise
    }

    write(buffer: Uint8Array | string) {
        if (buffer && this.socket)
            this.socket.send(buffer);
    }
}