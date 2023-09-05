
export enum CMD {
    Hello = 1,
    C2S_New_PortMapping,
    S2C_New_PortMapping,

    S2C_TCP_Connected,
    S2C_TCP_Closed,
    S2C_TCP_Data,

    C2S_TCP_Closed,
    C2S_TCP_Data,
}

export interface ForwardInfo {
    id: number
    type: 'tcp' | 'udp'
    targetAddr: string
    targetPort: number
    serverPort: number
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
        let buffer = Buffer.alloc(l)

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
            let data = Buffer.alloc(dataLength)
            this.recvdBuffer.copy(data, 0, 8)
            packet.Data = data
        }

        let remainLength = this.recvdBuffer.length - packetDataLength;
        if (remainLength == 0) {
            this.recvdBuffer = null;
        } else {
            let data = Buffer.alloc(remainLength)
            this.recvdBuffer.copy(data, 0, packetDataLength)
            this.recvdBuffer = data;
        }

        return packet;
    }
}

export class TCPDataPacket {
    mappingId: number
    id: number
    buffer: Buffer

    public UnSerialize(data: Buffer) {
        if (data.length >= 8) {
            this.mappingId = data.readUInt32LE(0)
            this.id = data.readUInt32LE(4)
            let dataLength = data.length - 8
            this.buffer = Buffer.alloc(dataLength)
            if (dataLength > 0) {
                data.copy(this.buffer, 0, 8)
            }
        }
    }

    public Serialize() {
        let length = 8
        if (this.buffer) {
            length += this.buffer.length
        }
        let data = Buffer.alloc(length)
        data.writeUint32LE(this.mappingId, 0)
        data.writeUint32LE(this.id, 4)
        if (this.buffer && this.buffer.length > 0) {
            this.buffer.copy(data, 8, 0)
        }
        return data;
    }

}