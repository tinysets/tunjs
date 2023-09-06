import dgram, { RemoteInfo } from 'dgram'
import { CMD, ForwardInfo, TCPDataPacket, TCPPacket } from './TCPPacket';
import { UID } from './TCPSocket';
import { TCPClient, TCPOptions, TCPServer, TCPSession, TCPTunnleEndPoint } from "./TCPSocket2";
import { EndPoint, Pipe, UDPClient, UDPServer, UDPSession } from './UDPSocket';

export class PortMapping {
    isServer: boolean
    tcpClient: TCPClient
    forwardInfo: ForwardInfo
    map: Map<number, Pipe> = new Map()

    constructor(isServer: boolean, tcpClient: TCPClient, forwardInfo: ForwardInfo) {
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
                tcpServer.setServer(this.forwardInfo.serverPort)
                let succ = await tcpServer.start()
                if (!succ) {
                    console.error('本地代理启动失败!');
                } else {
                    tcpServer.on('newConnect', (rometeSession: TCPSession) => {
                        this.onServerNewConnect(rometeSession)
                    })
                }
                return succ
            } else {
                let udpServer = new UDPServer(dgram.createSocket('udp4'));
                udpServer.setServer(this.forwardInfo.serverPort)
                let succ = await udpServer.start()
                if (!succ) {
                    console.error('本地代理启动失败!');
                } else {
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
    }
}

class PortMappingManager {

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

export let startClient = async (forwardInfos: ForwardInfo[], remotePort = 7666, remoteAddr = '127.0.0.1') => {

    let mappingManager = new PortMappingManager()

    let options = new TCPOptions()
    options.usePacket = false;
    let tcpClient = new TCPClient(options);
    tcpClient.setClient(remotePort, remoteAddr)

    {
        tcpClient.on('ready', () => {
            let packet = new TCPPacket()
            packet.Cmd = CMD.Hello
            tcpClient.writePacket(packet);
        })
        tcpClient.on('close', () => {
            mappingManager.close(tcpClient)
        })

        tcpClient.on('packet', (packet: TCPPacket) => {
            if (packet.Cmd == CMD.Hello) {
                let packet = new TCPPacket()
                packet.Cmd = CMD.New_PortMapping
                packet.SetJsonData(forwardInfos)
                tcpClient.writePacket(packet);
                let isServer = false;
                for (const forwardInfo of forwardInfos) {
                    let portMapping = new PortMapping(isServer, tcpClient, forwardInfo)
                    mappingManager.newPortMapping(tcpClient, forwardInfo.mappingId, portMapping)
                }
            } else if (packet.Cmd == CMD.New_PortMapping) {
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

    await tcpClient.start();
}