import Emitter from 'events'
import dgram from 'dgram'
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