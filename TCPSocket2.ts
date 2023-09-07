import Emitter from 'events'
import net from 'net'
import once from 'once'
import { TCPBufferHandler, TCPPacket } from './TCPPacket';
import { EndPoint, Pipe } from './UDPSocket';

export class TCPOptions {
    usePacket: boolean = false;
}

export class TCPServer extends Emitter {
    server: net.Server | null;
    options: TCPOptions;
    port: number;
    constructor(options: TCPOptions) {
        super();
        this.options = options;
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

            let server = this.server = new net.Server();
            server.on('listening', () => {
                this.onReady()
                resolve(true);
            });
            server.on('error', (err) => {
                this.onError(err)
                resolve(false);
            });
            server.on('close', () => {
                this.onClose();
            });

            server.on('connection', (socket) => {
                let session = new TCPSession(this.options, socket)
                this.emit('newConnect', session)
            });
            server.listen(this.port);
        });
        return promise
    }

    protected onError(error: Error) {
        console.error(error);
        this.server.close();
        this.emitCloseOnce();
    }
    protected onReady() {
        this.emit('ready')
    }
    protected onClose() {
        this.emitCloseOnce();
    }
    protected emitCloseOnce() {
        this.emit('close')
    }

    close() {
        this.server.close();
    }

    on(...args: [event: string, listener: (...args: any[]) => void] |
    [event: 'close', listener: () => void] |
    [event: 'ready', listener: () => void] |
    [event: 'newConnect', listener: (session: TCPSession) => void]
    ): this {
        super.on.call(this, ...args)
        return this
    }

    once(...args: [event: string, listener: (...args: any[]) => void] |
    [event: 'close', listener: () => void] |
    [event: 'ready', listener: () => void] |
    [event: 'newConnect', listener: (session: TCPSession) => void]
    ): this {
        super.once.call(this, ...args)
        return this
    }
}

export interface TCPPacketable {
    writePacket(packet: TCPPacket)
    on(event: 'packet', listener: (packet: TCPPacket) => void): this;
    once(event: 'packet', listener: (packet: TCPPacket) => void): this;
    off(eventName: string | symbol, listener: (...args: any[]) => void): this;
}

export class TCPSession extends Emitter implements EndPoint, TCPPacketable {
    isReady: boolean = true;
    isClosed: boolean = false;

    options: TCPOptions;
    socket: net.Socket
    private bufferHandler: TCPBufferHandler = new TCPBufferHandler()

    constructor(options: TCPOptions, socket: net.Socket) {
        super();
        this.options = options;
        this.socket = socket;
        let oriEmitCloseEventFn = this.emitCloseOnce.bind(this);
        this.emitCloseOnce = once(oriEmitCloseEventFn)

        socket.on("error", (error) => {
            this.onError(error);
        });
        socket.on("close", () => {
            this.onClose();
        });
        socket.on("end", () => {
            this.onEnd();
        });
        socket.on("timeout", () => {
            this.onTimeout();
        });
        socket.on("data", (data) => {
            this.onData(data);
        });
    }

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

    private onClose() {
        this.emitCloseOnce();
    }
    private onEnd() {
        this.emitCloseOnce();
    }
    private onError(error: Error) {
        console.error(error);
        this.socket.destroy();
        this.emitCloseOnce();
    }
    private onTimeout() {
        this.socket.destroy();
        this.emitCloseOnce();
    }
    private emitCloseOnce() {
        this.isClosed = true;
        this.emit('close')
    }

    private onData(buffer: Buffer) {
        this.emitData(buffer)

    }

    emitData(buffer: Buffer) {
        if (buffer && this.isReady && !this.isClosed) {
            this.emit('data', buffer)
            if (this.options.usePacket) {
                this.bufferHandler.put(buffer);
                while (true) {
                    let tcpPacket = this.bufferHandler.tryGetMsgPacket()
                    if (tcpPacket) {
                        this.emit('packet', tcpPacket)
                    } else {
                        break;
                    }
                }
            }
        }
    }

    write(buffer: Uint8Array | string) {
        if (buffer)
            if (this.isReady && !this.isClosed)
                this.socket.write(buffer);
    }

    writePacket(packet: TCPPacket) {
        if (packet)
            this.write(packet.GetSendBuffer())
    }

    close() {
        this.socket.end();
        this.socket.destroy();
    }

    on(...args: [event: string, listener: (...args: any[]) => void] |
    [event: 'close', listener: () => void] |
    [event: 'data', listener: (buffer: Buffer) => void] |
    [event: 'packet', listener: (packet: TCPPacket) => void]
    ): this {
        super.on.call(this, ...args)
        return this
    }

    once(...args: [event: string, listener: (...args: any[]) => void] |
    [event: 'close', listener: () => void] |
    [event: 'data', listener: (buffer: Buffer) => void] |
    [event: 'packet', listener: (packet: TCPPacket) => void]
    ): this {
        super.once.call(this, ...args)
        return this
    }
}


export class TCPClient extends Emitter implements EndPoint, TCPPacketable {
    isReady: boolean = false;
    isClosed: boolean = false;

    address: string
    port: number

    options: TCPOptions;
    socket: net.Socket
    private bufferHandler: TCPBufferHandler = new TCPBufferHandler()
    constructor(options: TCPOptions) {
        super();
        this.options = options
        this.socket = new net.Socket()
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
            socket.on("close", () => {
                this.onClose();
            });
            socket.on("end", () => {
                this.onClose();
            });
            socket.on("timeout", () => {
                this.onClose();
                resolve(false)
            });
            socket.on("ready", () => {
                this.onReady();
                resolve(true)
            });
            socket.on("data", (data) => {
                this.onData(data);
            });
            socket.connect(this.port, this.address)
        });
        return promise
    }

    protected onError(error: Error) {
        console.error(error);
        this.socket.destroy();
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
    private onData(buffer: Buffer) {
        this.emitData(buffer)

    }

    emitData(buffer: Buffer) {
        if (buffer && this.isReady && !this.isClosed) {
            this.emit('data', buffer)
            if (this.options.usePacket) {
                this.bufferHandler.put(buffer);
                while (true) {
                    let tcpPacket = this.bufferHandler.tryGetMsgPacket()
                    if (tcpPacket) {
                        this.emit('packet', tcpPacket)
                    } else {
                        break;
                    }
                }
            }
        }
    }

    write(buffer: Uint8Array | string) {
        if (buffer)
            if (this.isReady && !this.isClosed)
                this.socket.write(buffer);
    }

    writePacket(packet: TCPPacket) {
        if (packet)
            this.write(packet.GetSendBuffer())
    }

    close() {
        this.socket.end();
        this.socket.destroy();
    }

    on(...args: [event: string, listener: (...args: any[]) => void] |
    [event: 'close', listener: () => void] |
    [event: 'ready', listener: () => void] |
    [event: 'data', listener: (buffer: Buffer) => void] |
    [event: 'packet', listener: (packet: TCPPacket) => void]
    ): this {
        super.on.call(this, ...args)
        return this
    }

    once(...args: [event: string, listener: (...args: any[]) => void] |
    [event: 'close', listener: () => void] |
    [event: 'ready', listener: () => void] |
    [event: 'data', listener: (buffer: Buffer) => void] |
    [event: 'packet', listener: (packet: TCPPacket) => void]
    ): this {
        super.once.call(this, ...args)
        return this
    }
}

export class TCPLocalForward {
    leftPort: number
    leftAddr: string
    rightPort: number
    server: TCPServer
    constructor(fromPort: number, toPort: number, toAddr = '127.0.0.1') {
        this.leftPort = toPort
        this.leftAddr = toAddr
        this.rightPort = fromPort
    }

    async start() {
        let options = new TCPOptions()
        options.usePacket = false
        let forwardServer = new TCPServer(options)
        forwardServer.on('newConnect', (session: TCPSession) => {
            let tcpClient = new TCPClient(options)
            tcpClient.setClient(this.leftPort, this.leftAddr)
            let pipe = new Pipe(tcpClient, session);
            pipe.link()
        })
        forwardServer.setServer(this.rightPort)
        this.server = forwardServer;
        await forwardServer.start()
    }
}
