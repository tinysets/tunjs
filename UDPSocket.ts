import Emitter from 'events'
import dgram from 'dgram'
import once from 'once'

// let socket = dgram.createSocket('udp4')


interface EndPoint {
    isReady: boolean
    isClosed: boolean

    on(event: string, listener: (...args: any[]) => void): this;
    on(event: 'close', listener: () => void): this;
    on(event: 'ready', listener: () => void): this;
    on(event: 'data', listener: (msg: Buffer) => void): this;

    once(event: string, listener: (...args: any[]) => void): this;
    once(event: 'close', listener: () => void): this;
    once(event: 'ready', listener: () => void): this;
    once(event: 'data', listener: (msg: Buffer) => void): this;

    write(buffer: Uint8Array | string): void
    close(): void
}

export class UDPClient extends Emitter implements EndPoint {
    isReady: boolean = false;
    isClosed: boolean = false;
    address: string
    port: number
    socket: dgram.Socket
    constructor(socket: dgram.Socket) {
        super();
        this.socket = socket
        let oriEmitCloseEventFn = this.emitCloseEventOnce.bind(this);
        this.emitCloseEventOnce = once(oriEmitCloseEventFn)
    }

    async startClient(port: number, address = '127.0.0.1') {
        if (this.socket == null) {
            return;
        }
        this.port = port
        this.address = address

        let promise = new Promise<boolean>((resolve, reject) => {
            resolve = once(resolve)
            reject = once(reject)

            let socket = this.socket
            socket.on("error", (error) => {
                this.onError(error);
                resolve(false)
            });
            socket.on("listening", () => {
                this.onReady();
                resolve(true)
            });
            socket.on("close", () => {
                this.onClose();
            });
            socket.on("message", (data, rinfo) => {
                this.onData(data, rinfo);
            });
            socket.bind(0)// 让系统分配localport
        });
        return promise
    }

    protected onError(error: Error) {
        console.error(error);
        this.socket.close();
        this.emitCloseEventOnce();
    }
    protected onReady() {
        this.isReady = true;
        this.emit('ready')
    }
    protected onClose() {
        this.emitCloseEventOnce();
    }
    protected emitCloseEventOnce() {
        this.isClosed = true;
        this.emit('close')
    }
    protected onData(buffer: Buffer, rinfo: dgram.RemoteInfo) {
        if (rinfo.address == this.address && rinfo.port == this.port) {
            this.emit('data', buffer)
        }
    }

    write(buffer: Uint8Array | string) {
        if (buffer && this.socket)
            if (this.isReady && !this.isClosed)
                this.socket.send(buffer, this.port, this.address);
    }
    close() {
        this.socket.close();
    }
}

export class UDPEndPointSSide extends Emitter implements EndPoint {
    isReady: boolean = true;
    isClosed: boolean = false;
    server: UDPServer
    ipPort: string
    address: string
    port: number
    activeTime: number
    onReceiveData(buffer: Buffer): void {
        if (!this.isClosed) {
            this.activeTime = Date.now();
            this.emit('data', buffer)
        }
    }
    write(buffer: string | Uint8Array): void {
        if (this.isReady && !this.isClosed) {
            this.activeTime = Date.now();
            this.server.write(buffer, this.port, this.address)
        }
    }
    close(): void {
        if (!this.isClosed) {
            this.isClosed = true
            this.emit('close')
        }
    }
}

export class UDPEndPointManager {
    mapByStr: Map<string, UDPEndPointSSide> = new Map()

    public AddNew(udpSession: UDPEndPointSSide) {
        this.mapByStr.set(udpSession.ipPort, udpSession)
    }

    public GetByIPPort(ipPort: string) {
        return this.mapByStr.get(ipPort)
    }

    public Del(udpSession: UDPEndPointSSide) {
        this.mapByStr.delete(udpSession.ipPort)
    }
}

export class UDPServer extends Emitter {
    sessionManager = new UDPEndPointManager()
    private intervalTimer = null;

    socket: dgram.Socket
    constructor(socket: dgram.Socket) {
        super();
        this.socket = socket
        let oriEmitCloseEventFn = this.emitCloseEventOnce.bind(this);
        this.emitCloseEventOnce = once(oriEmitCloseEventFn)
    }

    async startServer(port: number) {
        if (this.socket == null) {
            return;
        }

        let promise = new Promise<boolean>((resolve, reject) => {
            resolve = once(resolve)
            reject = once(reject)

            let socket = this.socket
            socket.on("error", (error) => {
                this.onError(error);
                resolve(false)
            });
            socket.on("listening", () => {
                this.onReady();
                resolve(true)
            });
            socket.on("close", () => {
                this.onClose();
            });
            socket.on("message", (data, rinfo) => {
                this.onData(data, rinfo);
            });
            socket.bind(port)
        });
        return promise
    }

    protected onError(error: Error) {
        console.error(error);
        this.socket.close();
        this.emitCloseEventOnce();
    }
    protected onReady() {
        this.intervalTimer = setInterval(() => {
            this.checkDeadSession()
        }, 1000)
        this.emit('ready')
    }
    protected onClose() {
        this.emitCloseEventOnce();
    }
    protected emitCloseEventOnce() {
        if (this.intervalTimer) {
            clearInterval(this.intervalTimer)
            this.intervalTimer = null;
        }
        this.emit('close')
    }
    protected onData(buffer: Buffer, rinfo: dgram.RemoteInfo) {
        let ipPort = rinfo.address + rinfo.port
        let session = this.sessionManager.GetByIPPort(ipPort)
        if (!session) {
            session = new UDPEndPointSSide()
            session.server = this
            session.ipPort = ipPort
            session.address = rinfo.address
            session.port = rinfo.port
            session.once('close', () => {
                this.sessionManager.Del(session)
            })
            this.sessionManager.AddNew(session)
            this.emit('connect', session)
        }
        session.onReceiveData(buffer)
        this.emit('data', buffer, rinfo)
    }

    private checkDeadSession() {
        let toCloses: UDPEndPointSSide[] = [];
        let now = Date.now()
        for (const session of this.sessionManager.mapByStr.values()) {
            let dt = now - session.activeTime
            if (dt > 5000) { // 5s
                toCloses.push(session)
            }
        }
        for (const session of toCloses) {
            session.close()
        }
    }

    write(buffer: Uint8Array | string, port: number, address: string) {
        if (buffer && this.socket)
            this.socket.send(buffer, port, address);
    }
    close() {
        this.socket.close()
    }
}