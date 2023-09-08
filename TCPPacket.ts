import { hashCode } from "./Utils"

export enum CMD {
    Hello = 1,
    Ping,
    New_PortMapping,

    TCP_Connected,
    TCP_Data,
    TCP_Closed,
}


export class ForwardInfo {
    mappingId: number = 0
    isLocalForward = false
    type: 'tcp' | 'udp'
    targetAddr: string
    targetPort: number
    fromPort: number

    constructor(jsonObj?) {
        this.from(jsonObj)
    }
    from(jsonObj) {
        if (jsonObj) {
            Object.assign(this, jsonObj)
            this.mappingId = hashCode(this.type + this.targetAddr + this.targetPort + this.fromPort)
            let a = 0
        }
    }

    static From(jsonObj) {
        return new ForwardInfo(jsonObj);
    }
}


export class TCPPacket {
    public Length: number; // Length = Length(4) + Cmd(4) + Data(n)
    public Cmd: number;
    public Data: Buffer;

    public GetSendBuffer() {
        let l = 8
        if (this.Data != null) {
            l += this.Data.length
        }
        let buffer = Buffer.allocUnsafe(l)

        buffer.writeUInt32LE(l, 0)
        buffer.writeUInt32LE(this.Cmd, 4)
        if (this.Data != null) {
            this.Data.copy(buffer, 8, 0)
        }
        return buffer;
    }

    public GetJsonData() {
        if (this.Data) {
            let jsonStr = this.Data.toString('utf8');
            return JSON.parse(jsonStr);
        }
        return null;
    }

    public SetJsonData(obj) {
        let jsonStr = JSON.stringify(obj);
        this.Data = Buffer.from(jsonStr, 'utf8')
    }
}

export class TCPBufferHandler {
    recvdBuffer: Buffer | null = null;
    put(buffer: Buffer) {
        if (this.recvdBuffer != null) {
            this.recvdBuffer = Buffer.concat([this.recvdBuffer, buffer], this.recvdBuffer.length + buffer.length)
        } else {
            this.recvdBuffer = buffer
        }
    }

    tryGetMsgPacket(): TCPPacket | null {
        if (this.recvdBuffer == null || this.recvdBuffer.length == 0) {
            return null;
        }
        if (this.recvdBuffer.length < 4) {
            return null;
        }

        var packetDataLength = this.recvdBuffer.readUInt32LE(0);
        if (this.recvdBuffer.length < packetDataLength) {
            return null;
        }

        let packet = new TCPPacket();
        packet.Length = packetDataLength;
        packet.Cmd = this.recvdBuffer.readUInt32LE(4);
        let dataLength = packetDataLength - 8;
        if (dataLength > 0) {
            let data = this.recvdBuffer.subarray(8, 8 + dataLength)
            packet.Data = data
        }

        let remainLength = this.recvdBuffer.length - packetDataLength;
        if (remainLength == 0) {
            this.recvdBuffer = null;
        } else {
            let data = this.recvdBuffer.subarray(packetDataLength)
            this.recvdBuffer = data;
        }

        return packet;
    }
}

export class TCPDataPacket {
    mappingId: number
    pipeId: number
    buffer: Buffer

    public UnSerialize(data: Buffer) {
        if (data.length >= 8) {
            this.mappingId = data.readUInt32LE(0)
            this.pipeId = data.readUInt32LE(4)
            if (data.length > 8) {
                this.buffer = data.subarray(8)
            }
        }
    }

    public Serialize() {
        let length = 8
        if (this.buffer) {
            length += this.buffer.length
        }
        let data = Buffer.allocUnsafe(length)
        data.writeUint32LE(this.mappingId, 0)
        data.writeUint32LE(this.pipeId, 4)
        if (this.buffer && this.buffer.length > 0) {
            this.buffer.copy(data, 8, 0)
        }
        return data;
    }

}