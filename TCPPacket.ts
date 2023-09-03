
export enum CMD {
    Hello = 1,
    C2S_New_Forward, // 请求创建一个新的转发 ForwardInfo
    S2C_New_Forward, // 对应 C2S_New_Forward 的回复
    S2C_TCPForward_Connected, // 当一个TCP客户端连接到服务器的代理端口时 TCPForwardConnected
    C2S_TCPForward_Connected, // S2C_TCPForward_Connected 客户端返回值
    S2C_TCPForward_Data, // 当一个TCP客户端发送数据时候 TCPForwardData
    C2S_TCPForward_Data, // 当一个TCP客户端发送数据时候 TCPForwardData
}

export interface ForwardInfo {
    type: 'tcp' | 'udp'
    serverPort: number
    localPort: number
}

export interface TCPForwardConnected {
    forwardInfo: ForwardInfo
    sessionPort: number
}

export interface TCPForwardData {
    forwardInfo: ForwardInfo
    sessionPort: number
    buffer: Buffer
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
