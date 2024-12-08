import Emitter from 'events'
import net from 'net'
import once from 'once'
import { TCPBufferHandler, TCPPacket } from '../Common/TCPPacket'
import { TCPOptions } from './TCPServer'
import { EndPoint, TCPPacketable } from '../Common/interfaces'

export class TCPClient extends Emitter implements TCPPacketable, EndPoint {
    isAuthed = false
    address: string
    port: number
    socket: net.Socket
    private connected: boolean = false
    private options: TCPOptions
    private bufferHandler: TCPBufferHandler

    constructor(options: TCPOptions) {
        super();
        this.socket = new net.Socket()
        this.options = options;
        if (this.options.usePacket) {
            this.initTCPBufferHandler();
        }
    }

    setClient(port: number, address = '127.0.0.1') {
        this.port = port
        this.address = address
    }

    private initTCPBufferHandler() {
        this.bufferHandler = new TCPBufferHandler();
    }

    async start() {
        let promise = new Promise<boolean>((resolve, reject) => {
            resolve = once(resolve);
            if (this.connected) {
                resolve(false);
                return
            }
            if (!this.socket) {
                resolve(false);
                return
            }
            this.connected = true;

            let socket = this.socket

            socket.on("error", (error) => {
                // 发生错误了
                this.close();
                resolve(false)
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
            socket.on("ready", () => {
                // 连接成功
                resolve(true)
            });
            socket.connect(this.port, this.address)
        })
        return promise
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