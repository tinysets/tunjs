import Emitter from 'events'
import dgram, { RemoteInfo } from 'dgram'
import once from 'once'
import { EndPoint } from '../Common/interfaces';

export class UDPServer extends Emitter {
    sessionManager = new UDPSessionManager()
    socket: dgram.Socket
    port: number
    timeout: number = 30
    constructor(socket: dgram.Socket) {
        super();
        this.socket = socket
    }

    setServer(port: number) {
        this.port = port
    }

    async start() {
        let promise = new Promise<boolean>((resolve, reject) => {
            resolve = once(resolve)
            reject = once(reject)

            let socket = this.socket
            socket.on("error", (error) => {
                console.error(error);
                this.close();
                resolve(false)
            });
            socket.on("listening", () => {
                this.onReady();
                resolve(true)
            });
            socket.on("close", () => {
                this.close();
            });
            socket.on("message", (data, rinfo) => {
                this.onData(data, rinfo);
            });
            socket.bind(this.port)
        });
        return promise
    }

    protected onReady() {
        this.sessionManager.startCheck();
    }

    protected onData(buffer: Buffer, rinfo: dgram.RemoteInfo) {
        let ipPort = rinfo.address + rinfo.port
        let session = this.sessionManager.GetByIPPort(ipPort)
        if (!session) {
            session = new UDPSession()
            session.server = this
            session.ipPort = ipPort
            session.address = rinfo.address
            session.port = rinfo.port
            session.once('close', () => {
                this.sessionManager.Del(session)
            })
            this.sessionManager.AddNew(session)
            this.emit('newConnect', session)
        }
        session.onReceiveData(buffer)
        this.emit('data', session, buffer, rinfo)
    }

    write(buffer: Uint8Array | string, port: number, address: string) {
        if (buffer && this.socket)
            this.socket.send(buffer, port, address);
    }
    close() {
        if (this.socket) {
            let socket = this.socket;
            this.socket = null;
            socket.close(() => {
                console.log(`udp server ${this.port} closed!`)
            })
            this.sessionManager.stopCheck();
            this.emit('close')
        }
    }

    on(event: 'close', listener: () => void): this;
    on(event: 'data', listener: (session: UDPSession, buffer: Buffer, rinfo: RemoteInfo) => void): this;
    on(event: 'newConnect', listener: (session: UDPSession) => void): this;
    on(...args): this {
        super.on.call(this, ...args)
        return this
    }

    once(event: 'close', listener: () => void): this;
    once(event: 'data', listener: (session: UDPSession, buffer: Buffer, rinfo: RemoteInfo) => void): this;
    once(event: 'newConnect', listener: (session: UDPSession) => void): this;
    once(...args): this {
        super.once.call(this, ...args)
        return this
    }
}

export class UDPSession extends Emitter implements EndPoint {
    server: UDPServer
    ipPort: string
    address: string
    port: number
    activeTime: number
    timeout: number = 30
    private closed = false
    async start() {
        this.activeTime = Date.now() / 1000;
        return true;
    }

    onReceiveData(buffer: Buffer): void {
        if (!this.closed) {
            this.activeTime = Date.now() / 1000;
            this.emit('data', buffer)
        }
    }
    write(buffer: string | Uint8Array): void {
        if (!this.closed) {
            this.activeTime = Date.now() / 1000;
            this.server.write(buffer, this.port, this.address)
        }
    }
    close(): void {
        if (!this.closed) {
            this.closed = true;
            this.emit('close')
        }
    }

    on(event: 'close', listener: () => void): this;
    on(event: 'data', listener: (data: Buffer) => void): this;
    on(...args): this {
        super.on.call(this, ...args)
        return this
    }

    once(event: 'close', listener: () => void): this;
    once(event: 'data', listener: (data: Buffer) => void): this;
    once(...args): this {
        super.once.call(this, ...args)
        return this
    }
}

export class UDPSessionManager {
    mapByStr: Map<string, UDPSession> = new Map()

    public AddNew(udpSession: UDPSession) {
        this.mapByStr.set(udpSession.ipPort, udpSession)
    }

    public GetByIPPort(ipPort: string) {
        return this.mapByStr.get(ipPort)
    }

    public Del(udpSession: UDPSession) {
        this.mapByStr.delete(udpSession.ipPort)
    }

    private intervalTimer = null;
    public startCheck() {
        this.intervalTimer = setInterval(() => {
            this.checkDeadSession()
        }, 1000)
    }
    public stopCheck() {
        if (this.intervalTimer) {
            clearInterval(this.intervalTimer)
            this.intervalTimer = null;
        }
    }

    private checkDeadSession() {
        let toCloses: UDPSession[] = [];
        let now = Date.now() / 1000;
        for (const session of this.mapByStr.values()) {
            let dt = now - session.activeTime
            if (session.timeout != 0 && dt > session.timeout) {
                toCloses.push(session)
            }
        }
        for (const session of toCloses) {
            session.close()
        }
    }
}