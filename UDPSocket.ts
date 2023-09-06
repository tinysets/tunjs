import Emitter from 'events'
import dgram, { RemoteInfo } from 'dgram'
import once from 'once'

export interface EndPoint {
    isReady: boolean
    isClosed: boolean

    on(event: string, listener: (...args: any[]) => void): this;
    on(event: 'close', listener: () => void): this;
    on(event: 'ready', listener: () => void): this;
    on(event: 'data', listener: (buffer: Buffer) => void): this;

    once(event: string, listener: (...args: any[]) => void): this;
    once(event: 'close', listener: () => void): this;
    once(event: 'ready', listener: () => void): this;
    once(event: 'data', listener: (buffer: Buffer) => void): this;

    write(buffer: Uint8Array | string): void;
    close(): void;
    start(): Promise<boolean>;
    emitData(buffer: Buffer): void;
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
        let oriEmitCloseEventFn = this.emitCloseOnce.bind(this);
        this.emitCloseOnce = once(oriEmitCloseEventFn)
    }

    setClient(port: number, address = '127.0.0.1') {
        this.port = port
        this.address = address
    }

    async start() {
        if (this.isClosed) {
            let promise = new Promise<boolean>((resolve, reject) => {
                resolve(false)
            })
            return promise
        }
        if (this.isReady) {
            let promise = new Promise<boolean>((resolve, reject) => {
                resolve(true)
            })
            return promise
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
            socket.bind(0)// 让系统分配localport
        });
        return promise
    }

    protected onError(error: Error) {
        console.error(error);
        this.socket.close();
        this.emitCloseOnce();
    }
    protected onReady() {
        this.isReady = true;
        this.emit('ready')
    }
    protected onClose() {
        this.emitCloseOnce();
    }
    protected emitCloseOnce() {
        this.isClosed = true;
        this.emit('close')
    }
    protected onData(buffer: Buffer, rinfo: dgram.RemoteInfo) {
        if (rinfo.address == this.address && rinfo.port == this.port) {
            this.emit('data', buffer)
        }
    }

    emitData(buffer: Buffer) {
        if (buffer)
            if (this.isReady && !this.isClosed)
                this.emit('data', buffer)
    }

    write(buffer: Uint8Array | string) {
        if (buffer)
            if (this.isReady && !this.isClosed)
                this.socket.send(buffer, this.port, this.address);
    }
    close() {
        this.socket.close();
    }

    on(...args: [event: string, listener: (...args: any[]) => void] |
    [event: 'close', listener: () => void] |
    [event: 'ready', listener: () => void] |
    [event: 'data', listener: (buffer: Buffer) => void]
    ): this {
        super.on.call(this, ...args)
        return this
    }

    once(...args: [event: string, listener: (...args: any[]) => void] |
    [event: 'close', listener: () => void] |
    [event: 'ready', listener: () => void] |
    [event: 'data', listener: (buffer: Buffer) => void]
    ): this {
        super.once.call(this, ...args)
        return this
    }
}

export class UDPSession extends Emitter implements EndPoint {
    isReady: boolean = true;
    isClosed: boolean = false;
    server: UDPServer
    ipPort: string
    address: string
    port: number
    activeTime: number
    async start() {
        if (this.isClosed) {
            let promise = new Promise<boolean>((resolve, reject) => {
                resolve(false)
            })
            return promise
        }

        let promise = new Promise<boolean>((resolve, reject) => {
            resolve(true)
        })
        return promise
    }

    emitData(buffer: Buffer): void {
        if (!this.isClosed) {
            this.activeTime = Date.now();
            this.emit('data', buffer)
        }
    }
    write(buffer: string | Uint8Array): void {
        if (!this.isClosed) {
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

    on(...args: [event: string, listener: (...args: any[]) => void] |
    [event: 'close', listener: () => void] |
    [event: 'ready', listener: () => void] |
    [event: 'data', listener: (buffer: Buffer) => void]
    ): this {
        super.on.call(this, ...args)
        return this
    }

    once(...args: [event: string, listener: (...args: any[]) => void] |
    [event: 'close', listener: () => void] |
    [event: 'ready', listener: () => void] |
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
            if (dt > 5000) { // 5s
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
        let oriEmitCloseEventFn = this.emitCloseOnce.bind(this);
        this.emitCloseOnce = once(oriEmitCloseEventFn)
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
            socket.bind(this.port)
        });
        return promise
    }

    protected onError(error: Error) {
        console.error(error);
        this.socket.close();
        this.emitCloseOnce();
    }
    protected onReady() {
        this.sessionManager.startCheck();
        this.emit('ready')
    }
    protected onClose() {
        this.emitCloseOnce();
    }
    protected emitCloseOnce() {
        this.sessionManager.stopCheck();
        this.emit('close')
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
        session.emitData(buffer)
        this.emit('data', session, buffer, rinfo)
    }

    write(buffer: Uint8Array | string, port: number, address: string) {
        if (buffer)
            this.socket.send(buffer, port, address);
    }
    close() {
        this.socket.close()
    }

    on(...args: [event: string, listener: (...args: any[]) => void] |
    [event: 'close', listener: () => void] |
    [event: 'ready', listener: () => void] |
    [event: 'data', listener: (session: UDPSession, buffer: Buffer, rinfo: RemoteInfo) => void] |
    [event: 'newConnect', listener: (session: UDPSession) => void]
    ): this {
        super.on.call(this, ...args)
        return this
    }

    once(...args: [event: string, listener: (...args: any[]) => void] |
    [event: 'close', listener: () => void] |
    [event: 'ready', listener: () => void] |
    [event: 'data', listener: (session: UDPSession, buffer: Buffer, rinfo: RemoteInfo) => void] |
    [event: 'newConnect', listener: (session: UDPSession) => void]
    ): this {
        super.once.call(this, ...args)
        return this
    }
}

enum EventInfoType {
    Left = 1,
    Right
}
class EventInfo {
    type: EventInfoType;
    name: 'close' | 'data';
    buffer?: Buffer
}

class EventQueue {
    queue: EventInfo[] = [];
    get length() {
        return this.queue.length
    }

    EnQueue(evnet: EventInfo) {
        this.queue.push(evnet);
    }
    DeQueue() {
        return this.queue.shift()
    }
    Clear() {
        this.queue = []
    }
}

export class Pipe extends Emitter {
    isReady: boolean = false;
    isClosed: boolean = false;

    left: EndPoint
    right: EndPoint
    tunnle: EndPoint
    constructor(left: EndPoint, right: EndPoint) {
        super()
        this.left = left;
        this.right = right;

        let oriEmitCloseEventFn = this.emitCloseOnce.bind(this);
        this.emitCloseOnce = once(oriEmitCloseEventFn)
    }

    async link() {
        this.left.on('close', () => {
            if (!this.isClosed) {
                if (!this.isReady) {
                    let eventInfo = new EventInfo();
                    eventInfo.type = EventInfoType.Left
                    eventInfo.name = 'close'
                    this.enQueue(eventInfo)
                } else {
                    this.close();
                }
            }
        })
        this.left.on('data', (buffer) => {
            if (!this.isClosed) {
                if (!this.isReady) {
                    let eventInfo = new EventInfo();
                    eventInfo.type = EventInfoType.Left
                    eventInfo.name = 'data'
                    eventInfo.buffer = buffer
                    this.enQueue(eventInfo)
                } else {
                    this.right.write(buffer)
                }
            }
        })

        this.right.on('close', () => {
            if (!this.isClosed) {
                if (!this.isReady) {
                    let eventInfo = new EventInfo();
                    eventInfo.type = EventInfoType.Right
                    eventInfo.name = 'close'
                    this.enQueue(eventInfo)
                } else {
                    this.close();
                }
            }
        })
        this.right.on('data', (buffer) => {
            if (!this.isClosed) {
                if (!this.isReady) {
                    let eventInfo = new EventInfo();
                    eventInfo.type = EventInfoType.Right
                    eventInfo.name = 'data'
                    eventInfo.buffer = buffer
                    this.enQueue(eventInfo)
                } else {
                    this.left.write(buffer)
                }
            }
        })

        let leftSucc = await this.left.start()
        if (leftSucc) {
            let rightSucc = await this.right.start()
            if (rightSucc) {
                this.isReady = true;
                this.onReady();
                return true
            }
        }
        this.close()
        return false
    }

    private onReady() {
        this.tryExecQueue()
    }

    private eventQueue = new EventQueue();
    private enQueue(evnet: EventInfo) {
        this.eventQueue.EnQueue(evnet)
        this.tryExecQueue()
    }
    private tryExecQueue() {
        while (true) {
            if (this.eventQueue.length == 0) {
                break;
            }
            if (!this.isReady) {
                break;
            }
            if (this.isClosed) {
                break;
            }

            let evnet = this.eventQueue.DeQueue()
            if (evnet.type == EventInfoType.Left) {
                if (evnet.name == 'close') {
                    this.close();
                } else if (evnet.name == 'data') {
                    this.right.write(evnet.buffer)
                }
            } else if (evnet.type == EventInfoType.Right) {
                if (evnet.name == 'close') {
                    this.close();
                } else if (evnet.name == 'data') {
                    this.left.write(evnet.buffer)
                }
            }
        }
    }

    private emitCloseOnce() {
        this.emit('close')
    }

    close() {
        if (!this.isClosed) {
            this.isClosed = true
            this.left.close()
            this.right.close()
            this.emitCloseOnce()
        }
    }
}

export class UDPLocalForward {
    leftPort: number
    leftAddr: string
    rightPort: number
    server: UDPServer
    constructor(fromPort: number, toPort: number, toAddr = '127.0.0.1') {
        this.leftPort = toPort
        this.leftAddr = toAddr
        this.rightPort = fromPort
    }

    async start() {
        let forwardServer = new UDPServer(dgram.createSocket('udp4'))
        forwardServer.on('newConnect', (session: UDPSession) => {
            let udpClient = new UDPClient(dgram.createSocket('udp4'))
            udpClient.setClient(this.leftPort, this.leftAddr)
            let pipe = new Pipe(udpClient, session);
            pipe.link()
        })
        forwardServer.setServer(this.rightPort)
        this.server = forwardServer;
        await forwardServer.start()
    }
}