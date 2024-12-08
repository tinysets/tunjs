import Emitter from 'events'
import dgram, { RemoteInfo } from 'dgram'
import once from 'once'
import { EndPoint } from '../Common/interfaces';

export class UDPClient extends Emitter implements EndPoint {
    address: string
    port: number
    socket: dgram.Socket
    constructor(socket: dgram.Socket) {
        super();
        this.socket = socket
    }

    setClient(port: number, address = '127.0.0.1') {
        this.port = port
        this.address = address
    }

    async start() {
        if (!this.socket) {
            return false;
        }
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
                resolve(true)
            });
            socket.on("close", () => {
                this.close();
            });
            socket.on("message", (data, rinfo) => {
                this.onData(data, rinfo);
            });
            socket.bind(0)// 让系统分配localport
        });
        return promise
    }

    protected onData(buffer: Buffer, rinfo: dgram.RemoteInfo) {
        if (rinfo.address == this.address && rinfo.port == this.port) {
            this.onReceiveData(buffer)
        }
    }

    onReceiveData(buffer: Buffer) {
        if (buffer)
            this.emit('data', buffer)
    }

    write(buffer: Uint8Array | string) {
        if (buffer && this.socket)
            this.socket.send(buffer, this.port, this.address);
    }
    close() {
        let socket = this.socket;
        if (socket) {
            this.socket = null;
            socket.close();
            this.emit('close')
        }
    }

    on(...args: [event: string, listener: (...args: any[]) => void] |
    [event: 'close', listener: () => void] |
    [event: 'data', listener: (buffer: Buffer) => void]
    ): this {
        super.on.call(this, ...args)
        return this
    }

    once(...args: [event: string, listener: (...args: any[]) => void] |
    [event: 'close', listener: () => void] |
    [event: 'data', listener: (buffer: Buffer) => void]
    ): this {
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
    private closed = false
    async start() {
        return true;
    }

    onReceiveData(buffer: Buffer): void {
        if (!this.closed) {
            this.activeTime = Date.now();
            this.emit('data', buffer)
        }
    }
    write(buffer: string | Uint8Array): void {
        if (!this.closed) {
            this.activeTime = Date.now();
            this.server.write(buffer, this.port, this.address)
        }
    }
    close(): void {
        if (!this.closed) {
            this.closed = true;
            this.emit('close')
        }
    }

    on(...args: [event: string, listener: (...args: any[]) => void] |
    [event: 'close', listener: () => void] |
    [event: 'data', listener: (buffer: Buffer) => void]
    ): this {
        super.on.call(this, ...args)
        return this
    }

    once(...args: [event: string, listener: (...args: any[]) => void] |
    [event: 'close', listener: () => void] |
    [event: 'data', listener: (buffer: Buffer) => void]
    ): this {
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
        let now = Date.now()
        for (const session of this.mapByStr.values()) {
            let dt = now - session.activeTime
            if (dt > 10) { // 5s
                toCloses.push(session)
            }
        }
        for (const session of toCloses) {
            session.close()
        }
    }

}

export class UDPServer extends Emitter {
    sessionManager = new UDPSessionManager()
    socket: dgram.Socket
    port: number
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
        this.emit('ready')
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
        if (!this.socket) {
            let socket = this.socket;
            this.socket = null;
            socket.close()
            this.sessionManager.stopCheck();
            this.emit('close')
        }
    }

    on(...args: [event: string, listener: (...args: any[]) => void] |
    [event: 'close', listener: () => void] |
    [event: 'data', listener: (session: UDPSession, buffer: Buffer, rinfo: RemoteInfo) => void] |
    [event: 'newConnect', listener: (session: UDPSession) => void]
    ): this {
        super.on.call(this, ...args)
        return this
    }

    once(...args: [event: string, listener: (...args: any[]) => void] |
    [event: 'close', listener: () => void] |
    [event: 'data', listener: (session: UDPSession, buffer: Buffer, rinfo: RemoteInfo) => void] |
    [event: 'newConnect', listener: (session: UDPSession) => void]
    ): this {
        super.once.call(this, ...args)
        return this
    }
}