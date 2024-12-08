import { TCPPacket } from "./TCPPacket";

export interface TCPPacketable {
    writePacket(packet: TCPPacket)
    on(event: 'packet', listener: (packet: TCPPacket) => void): this;
}

export interface EndPoint {
    on(event: string, listener: (...args: any[]) => void): this;
    on(event: 'close', listener: () => void): this;
    on(event: 'data', listener: (buffer: Buffer) => void): this;

    start(): Promise<boolean>;
    close(): void;
    write(buffer: Uint8Array | string): void;
    onReceiveData(data: Buffer): void;
}
