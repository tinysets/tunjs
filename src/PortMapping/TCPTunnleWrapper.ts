import Emitter from 'events'
import { CMD } from "../Common/CMD";
import { TCPDataPacket, TCPPacket } from "../Common/TCPPacket";
import { EndPoint, TCPPacketable } from '../Common/interfaces';

export class TCPTunnleWrapper extends Emitter implements EndPoint {
    private packetable: TCPPacketable;
    private mappingId: number;
    private pipeId: number;

    constructor(packetable: TCPPacketable, mappingId: number, pipeId: number) {
        super()
        this.packetable = packetable;
        this.mappingId = mappingId;
        this.pipeId = pipeId;
    }

    onReceiveData(buffer: Buffer): void {
        if (this.packetable) {
            this.emit('data', buffer)
        }
    }

    write(buffer: string | Uint8Array): void {
        if (buffer && this.packetable) {
            if (typeof buffer === 'string') {
                buffer = Buffer.from(buffer)
            }
            let packet = new TCPPacket()
            packet.Cmd = CMD.TCP_Data
            let dataPacket = new TCPDataPacket()
            dataPacket.mappingId = this.mappingId;
            dataPacket.pipeId = this.pipeId;
            dataPacket.buffer = buffer as Buffer
            packet.Data = dataPacket.Serialize()
            this.packetable.writePacket(packet)
        }
    }

    close(): void {
        if (this.packetable) {
            let packetable = this.packetable;
            this.packetable = null;
            this.emitCloseEvent(packetable)
        }
    }

    private emitCloseEvent(packetable: TCPPacketable) {
        let packet = new TCPPacket()
        packet.Cmd = CMD.TCP_Closed
        let dataPacket = new TCPDataPacket()
        dataPacket.mappingId = this.mappingId
        dataPacket.pipeId = this.pipeId
        packet.Data = dataPacket.Serialize()
        packetable.writePacket(packet)
        this.emit('close')
    }

    async start() {
        return true
    }

    on(...args: [event: string, listener: (...args: any[]) => void] |
    [event: 'close', listener: () => void] |
    [event: 'data', listener: (buffer: Buffer) => void]
    ): this {
        super.on.call(this, ...args)
        return this
    }
}