import Emitter from 'events'
import { Msg } from "../Common/Msg";
import { TCPDataPacket, TCPPacket } from "../Common/TCPPacket";
import { EndPoint, TCPPacketable } from '../Common/interfaces';

export class VirtualEndPoint extends Emitter implements EndPoint {
    private node: TCPPacketable;
    private tunnelId: number;
    private pipeId: number;

    constructor(node: TCPPacketable, tunnelId: number, pipeId: number) {
        super()
        this.node = node;
        this.tunnelId = tunnelId;
        this.pipeId = pipeId;
    }

    onReceiveData(buffer: Buffer): void {
        if (this.node) {
            this.emit('data', buffer)
        }
    }

    write(buffer: string | Uint8Array): void {
        if (buffer && this.node) {
            if (typeof buffer === 'string') {
                buffer = Buffer.from(buffer)
            }
            let packet = new TCPPacket()
            packet.Cmd = Msg.TCP_Data
            let dataPacket = new TCPDataPacket()
            dataPacket.tunnelId = this.tunnelId;
            dataPacket.pipeId = this.pipeId;
            dataPacket.buffer = buffer as Buffer
            packet.Data = dataPacket.Serialize()
            this.node.writePacket(packet)
        }
    }

    close(): void {
        if (this.node) {
            let packetable = this.node;
            this.node = null;
            this.emitCloseEvent(packetable)
        }
    }

    private emitCloseEvent(node: TCPPacketable) {
        let packet = new TCPPacket()
        packet.Cmd = Msg.TCP_Closed
        let dataPacket = new TCPDataPacket()
        dataPacket.tunnelId = this.tunnelId
        dataPacket.pipeId = this.pipeId
        packet.Data = dataPacket.Serialize()
        node.writePacket(packet)
        this.emit('close')
    }

    async start() {
        return true
    }

    on(event: 'close', listener: () => void): this;
    on(event: 'data', listener: (data: Buffer) => void): this;
    on(...args): this {
        super.on.call(this, ...args)
        return this
    }
}