import { TCPPacket } from "./TCPPacket";

export interface TCPPacketable {
    on(event: 'packet', listener: (packet: TCPPacket) => void): this;
    writePacket(packet: TCPPacket)
}

export interface EndPoint {
    on(event: 'close', listener: () => void): this;
    on(event: 'data', listener: (buffer: Buffer) => void): this;

    start(): Promise<boolean>;
    close(): void;
    write(buffer: Uint8Array | string): void;
    onReceiveData(data: Buffer): void;
}
