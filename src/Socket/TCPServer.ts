import Emitter from 'events'
import net from 'net'
import once from 'once'
import { TCPBufferHandler, TCPPacket, } from '../Common/TCPPacket';
import { Pipe } from '../Common/Pipe';
import { TCPClient } from './TCPClient';
import { EndPoint, TCPPacketable } from '../Common/interfaces';

export class TCPOptions {
    usePacket: boolean = false;
}

export class TCPServer extends Emitter {
    private options: TCPOptions;
    server: net.Server | null;
    port: number;
    constructor(options: TCPOptions) {
        super();
        this.options = options;
    }

    setServer(port: number) {
        this.port = port
    }

    async start() {
        let promise = new Promise<boolean>((resolve, reject) => {
            resolve = once(resolve);
            let server = this.server = new net.Server();
            server.on('listening', () => {
                // 监听成功
                resolve(true)
            });
            server.on('error', (err) => {
                // 监听发生错误
                resolve(false)
            });
            server.on('close', () => {
                // 关闭的时候
                this.emit('close')
            });
            server.on('connection', (socket) => {
                // 新连接
                let session = new TCPSession(this.options, socket);
                this.emit('newConnect', session)
            });

            // server.on('drop', (data?: net.DropArgument) => {
            //     // 新连接被丢弃 什么都不处理
            // });
            server.listen(this.port);
        });
        return promise
    }

    close() {
        if (this.server) {
            let server = this.server;
            this.server = null;
            server.close()
        }
    }

    on(event: string, listener: (...args: any[]) => void): this;
    on(event: 'close', listener: () => void): this;
    on(event: 'newConnect', listener: (session: TCPSession) => void): this;
    on(...args: [event: string, listener: (...args: any[]) => void]): this {
        super.on.call(this, ...args)
        return this
    }
}

export class TCPSession extends Emitter implements TCPPacketable, EndPoint {
    isAuthed = false
    socket: net.Socket
    private options: TCPOptions
    private bufferHandler: TCPBufferHandler
    constructor(options: TCPOptions, socket: net.Socket) {
        super();
        this.socket = socket;
        this.options = options;
        if (this.options.usePacket) {
            this.initTCPBufferHandler();
        }

        socket.on("error", (error) => {
            // 发生错误了
            this.close();
        });
        socket.on("close", () => {
            // 关闭了
            this.close();
        });
        socket.on("end", () => {
            // 对方说结束了
            this.close();
        });
        socket.on("timeout", () => {
            // 超时了 需要手动关闭链接
            this.close();
        });
        socket.on("data", (data) => {
            // 有数据来了
            this.onReceiveData(data)
        });
    }

    private initTCPBufferHandler() {
        this.bufferHandler = new TCPBufferHandler();
    }

    async start() {
        return true;
    }
    close() {
        if (this.socket) {
            let socket = this.socket;
            this.socket = null;
            socket.end();
            socket.destroy();
            this.emit('close')
        }
    }

    write(buffer: Uint8Array | string) {
        if (buffer)
            if (this.socket)
                this.socket.write(buffer);
    }

    writePacket(packet: TCPPacket) {
        if (packet)
            this.write(packet.GenTCPBuffer())
    }

    onReceiveData(data: Buffer) {
        this.emit('data', data)
        if (this.bufferHandler) {
            this.bufferHandler.put(data)
            while (true) {
                let packet = this.bufferHandler.tryGetTCPPacket();
                if (packet)
                    this.emit('packet', packet)
                else
                    break
            }
        }
    }

    on(event: string, listener: (...args: any[]) => void): this;
    on(event: 'close', listener: () => void): this;
    on(event: 'data', listener: (data: Buffer) => void): this;
    on(event: 'packet', listener: (packet: TCPPacket) => void): this;
    on(...args: [event: string, listener: (...args: any[]) => void]): this {
        super.on.call(this, ...args)
        return this
    }
}
