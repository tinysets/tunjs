import Emitter from 'events'
import dgram from 'dgram'
import once from 'once'
import { CMD, ForwardInfo, TCPDataPacket, TCPPacket } from './TCPPacket';
import { TCPServer, TCPSession, TCPClient, TCPOptions, TCPPacketable, } from "./TCPSocket";
import { UDPServer, UDPSession, UDPClient, EndPoint, Pipe } from './UDPSocket';

export class UID {
    private static uid = 1
    public static GetUID() {
        return UID.uid++
    }
}

export class TCPTunnleEndPoint extends Emitter implements EndPoint {
    isReady: boolean = true;
    isClosed: boolean = false;

    packetable: TCPPacketable;
    mappingId: number;
    pipeId: number;

    // private onPacketFn: (packet: TCPPacket) => void;
    constructor(packetable: TCPPacketable, mappingId: number, pipeId: number) {
        super()
        this.packetable = packetable;
        this.mappingId = mappingId;
        this.pipeId = pipeId;

        let oriEmitCloseEventFn = this.emitCloseOnce.bind(this);
        this.emitCloseOnce = once(oriEmitCloseEventFn)
        // this.onPacketFn = (packet: TCPPacket) => {
        //     // @TODO 为了性能需要在外界分发
        //     if (packet.Cmd == CMD.TCP_Data && packet.Data) {
        //         let dataPacket = new TCPDataPacket()
        //         dataPacket.UnSerialize(packet.Data)
        //         if (dataPacket.mappingId == this.mappingId && dataPacket.pipeId == this.pipeId) {
        //             this.emitData(dataPacket.buffer)
        //         }
        //     } else if (packet.Cmd == CMD.TCP_Closed && packet.Data) {
        //         let dataPacket = new TCPDataPacket()
        //         dataPacket.UnSerialize(packet.Data)
        //         if (dataPacket.mappingId == this.mappingId && dataPacket.pipeId == this.pipeId) {
        //             this.close()
        //         }
        //     }
        // }
        // packetable.on('packet', this.onPacketFn)
    }

    emitData(buffer: Buffer): void {
        if (!this.isClosed) {
            this.emit('data', buffer)
        }
    }

    protected emitCloseOnce() {
        // this.packetable.off('packet', this.onPacketFn)
        let packet = new TCPPacket()
        packet.Cmd = CMD.TCP_Closed
        let dataPacket = new TCPDataPacket()
        dataPacket.mappingId = this.mappingId
        dataPacket.pipeId = this.pipeId
        packet.Data = dataPacket.Serialize()
        this.packetable.writePacket(packet)
        this.isClosed = true;
        this.emit('close')
    }

    write(buffer: string | Uint8Array): void {
        if (buffer && !this.isClosed) {
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
        if (!this.isClosed)
            this.emitCloseOnce()
    }

    async start() {
        if (this.isClosed) {
            let promise = new Promise<boolean>((resolve, reject) => {
                resolve(false)
            })
            return promise
        }
        let promise = new Promise<boolean>((resolve, reject) => {
            resolve(true)
        })
        return promise
    }

    on(...args: [event: string, listener: (...args: any[]) => void] |
    [event: 'close', listener: () => void] |
    [event: 'data', listener: (buffer: Buffer) => void]
    ): this {
        super.on.call(this, ...args)
        return this
    }

    once(...args: [event: string, listener: (...args: any[]) => void] |
    [event: 'close', listener: () => void] |
    [event: 'data', listener: (buffer: Buffer) => void]
    ): this {
        super.once.call(this, ...args)
        return this
    }
}

export class PortMapping {
    isServer: boolean
    tcpClient: TCPPacketable
    forwardInfo: ForwardInfo
    map: Map<number, Pipe> = new Map()
    tcpServer: TCPServer
    udpServer: UDPServer
    constructor(isServer: boolean, tcpClient: TCPPacketable, forwardInfo: ForwardInfo) {
        this.isServer = isServer
        this.tcpClient = tcpClient;
        this.forwardInfo = forwardInfo
    }

    async start() {
        if (this.isServer) {
            if (this.forwardInfo.type == 'tcp') {
                let options = new TCPOptions();
                options.usePacket = false;
                let tcpServer = new TCPServer(options);
                tcpServer.setServer(this.forwardInfo.fromPort)
                let succ = await tcpServer.start()
                if (!succ) {
                    console.error('本地代理启动失败!');
                } else {
                    this.tcpServer = tcpServer;
                    console.log(`tcp proxy server port:${this.forwardInfo.fromPort}`);
                    tcpServer.on('newConnect', (rometeSession: TCPSession) => {
                        this.onServerNewConnect(rometeSession)
                    })
                }
                return succ
            } else {
                let udpServer = new UDPServer(dgram.createSocket('udp4'));
                udpServer.setServer(this.forwardInfo.fromPort)
                let succ = await udpServer.start()
                if (!succ) {
                    console.error('本地代理启动失败!');
                } else {
                    this.udpServer = udpServer;
                    console.log(`udp proxy server port:${this.forwardInfo.fromPort}`);
                    udpServer.on('newConnect', (rometeSession: UDPSession) => {
                        this.onServerNewConnect(rometeSession)
                    })
                }
                return succ
            }
        } else {
            return true
        }
    }

    private async onServerNewConnect(rometeSession: EndPoint) {
        let pipeId = UID.GetUID()

        let tcpPacket = new TCPPacket()
        tcpPacket.Cmd = CMD.TCP_Connected
        let dataPacket = new TCPDataPacket();
        dataPacket.mappingId = this.forwardInfo.mappingId;
        dataPacket.pipeId = pipeId;
        tcpPacket.Data = dataPacket.Serialize()
        this.tcpClient.writePacket(tcpPacket)

        let tcpTunnle = new TCPTunnleEndPoint(this.tcpClient, this.forwardInfo.mappingId, pipeId)
        let pipe = new Pipe(tcpTunnle, rometeSession);
        pipe.tunnle = tcpTunnle;
        pipe.on('close', () => {
            this.connectionClose(pipeId)
        })

        this.map.set(pipeId, pipe)
        let succ = await pipe.link()
        if (!succ) {
            console.error(`远程代理 本地session创建失败! pipeId=${pipeId}`);
        }
    }

    async onClientNewConnect(mappingId: number, pipeId: number) {
        if (!this.isServer) {
            if (this.map.has(pipeId)) {
                return false;
            }
            if (this.forwardInfo.type == 'tcp') {
                let options = new TCPOptions();
                options.usePacket = false;
                let leftSession = new TCPClient(options);
                leftSession.setClient(this.forwardInfo.targetPort, this.forwardInfo.targetAddr);

                let tcpTunnle = new TCPTunnleEndPoint(this.tcpClient, mappingId, pipeId);
                let pipe = new Pipe(leftSession, tcpTunnle);
                pipe.tunnle = tcpTunnle;

                pipe.on('close', () => {
                    this.connectionClose(pipeId)
                })
                this.map.set(pipeId, pipe)
                let succ = await pipe.link()
                if (!succ) {
                    console.error(`远程代理 本地session创建失败! id=${pipeId}`);
                }
                return succ
            } else {
                let leftSession = new UDPClient(dgram.createSocket('udp4'));
                leftSession.setClient(this.forwardInfo.targetPort, this.forwardInfo.targetAddr);

                let tcpTunnle = new TCPTunnleEndPoint(this.tcpClient, mappingId, pipeId);
                let pipe = new Pipe(leftSession, tcpTunnle);
                pipe.tunnle = tcpTunnle;

                pipe.on('close', () => {
                    this.connectionClose(pipeId)
                })
                this.map.set(pipeId, pipe)
                let succ = await pipe.link()
                if (!succ) {
                    console.error(`远程代理 本地session创建失败! id=${pipeId}`);
                }
                return succ
            }
        }
        return false
    }

    private connectionClose(pipeId: number) {
        this.map.delete(pipeId)
    }

    public onReceiveTunnleData(buffer: Buffer, pipeId: number) {
        if (this.map.has(pipeId)) {
            var pipe = this.map.get(pipeId);
            let tunnle = pipe.tunnle;
            tunnle.emitData(buffer)
        }
    }
    public onReceiveTunnleClose(pipeId: number) {
        if (this.map.has(pipeId)) {
            var pipe = this.map.get(pipeId);
            pipe.close()
        }
    }

    public close() {
        let pipes: Pipe[] = [];
        for (const item of this.map.values()) {
            pipes.push(item)
        }
        for (const item of pipes) {
            item.close()
        }
        if (this.tcpServer) {
            this.tcpServer.close();
        }
        if (this.udpServer) {
            this.udpServer.close();
        }
    }
}

export class PortMappingManager {

    private portMappingMap: Map<EndPoint, Map<number, PortMapping>> = new Map()
    async newPortMapping(tcpSession: EndPoint, mappingId: number, portMapping: PortMapping) {

        if (!this.portMappingMap.has(tcpSession)) {
            this.portMappingMap.set(tcpSession, new Map());
        }
        this.portMappingMap.get(tcpSession).set(mappingId, portMapping);
        let succ = await portMapping.start();
        return succ;
    }

    onRecvTunnleConnect(tcpSession: EndPoint, mappingId: number, pipeId: number) {
        let map = this.portMappingMap.get(tcpSession)
        if (map) {
            let portMapping = map.get(mappingId);
            if (portMapping) {
                portMapping.onClientNewConnect(mappingId, pipeId)
            }
        }
    }

    onRecvTunnleClose(tcpSession: EndPoint, mappingId: number, pipeId: number) {
        let map = this.portMappingMap.get(tcpSession)
        if (map) {
            let portMapping = map.get(mappingId);
            if (portMapping) {
                portMapping.onReceiveTunnleClose(pipeId)
            }
        }
    }

    onRecvTunnleData(tcpSession: EndPoint, mappingId: number, pipeId: number, buffer: Buffer) {
        let map = this.portMappingMap.get(tcpSession)
        if (map) {
            let portMapping = map.get(mappingId);
            if (portMapping) {
                portMapping.onReceiveTunnleData(buffer, pipeId)
            }
        }
    }

    close(tcpSession: EndPoint) {
        let map = this.portMappingMap.get(tcpSession)
        if (map) {
            this.portMappingMap.delete(tcpSession)
            for (const portMapping of map.values()) {
                portMapping.close()
            }
        }
    }
}

export let startClient = async (forwardInfos: ForwardInfo[], remotePort = 7666, remoteAddr = '127.0.0.1', authKey = '') => {

    let mappingManager = new PortMappingManager()

    let options = new TCPOptions()
    options.usePacket = true;
    let tcpClient = new TCPClient(options);
    tcpClient.setClient(remotePort, remoteAddr)

    {
        tcpClient.on('ready', () => {
            let packet = new TCPPacket()
            packet.Cmd = CMD.Hello
            packet.SetJsonData({ authKey: authKey })
            tcpClient.writePacket(packet);
        })
        tcpClient.on('close', () => {
            mappingManager.close(tcpClient)
        })

        tcpClient.on('packet', (packet: TCPPacket) => {
            if (packet.Cmd == CMD.Hello) {
                let hello = packet.GetJsonData()
                if (hello && hello.isAuthed) {
                    tcpClient.isAuthed = true
                } else {
                    tcpClient.isAuthed = false
                }
                if (tcpClient.isAuthed) {
                    let packet = new TCPPacket()
                    packet.Cmd = CMD.New_PortMapping
                    packet.SetJsonData(forwardInfos)
                    tcpClient.writePacket(packet);
                    let isServer = false;
                    for (const forwardInfo of forwardInfos) {
                        let portMapping = new PortMapping(isServer, tcpClient, forwardInfo)
                        mappingManager.newPortMapping(tcpClient, forwardInfo.mappingId, portMapping)
                    }
                }
            }

            if (!tcpClient.isAuthed) {
                tcpClient.close()
                return;
            }

            if (packet.Cmd == CMD.New_PortMapping) {
                let succs: number[] = packet.GetJsonData();
            } else if (packet.Cmd == CMD.TCP_Connected) {
                let dataPacket = new TCPDataPacket();
                dataPacket.UnSerialize(packet.Data)
                mappingManager.onRecvTunnleConnect(tcpClient, dataPacket.mappingId, dataPacket.pipeId)
            } else if (packet.Cmd == CMD.TCP_Closed) {
                let dataPacket = new TCPDataPacket();
                dataPacket.UnSerialize(packet.Data)
                mappingManager.onRecvTunnleClose(tcpClient, dataPacket.mappingId, dataPacket.pipeId)
            } else if (packet.Cmd == CMD.TCP_Data) {
                let dataPacket = new TCPDataPacket();
                dataPacket.UnSerialize(packet.Data)
                mappingManager.onRecvTunnleData(tcpClient, dataPacket.mappingId, dataPacket.pipeId, dataPacket.buffer)
            }
        })
    }

    return await tcpClient.start();
}