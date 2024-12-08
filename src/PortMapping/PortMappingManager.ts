import dgram from 'dgram'
import { TCPOptions, TCPServer, TCPSession } from '../Socket/TCPServer'
import { Pipe } from '../Common/Pipe'
import { TCPClient } from '../Socket/TCPClient'
import { CMD } from '../Common/CMD'
import { TCPDataPacket, TCPPacket } from '../Common/TCPPacket'
import { UDPClient, UDPServer, UDPSession } from '../Socket/UDPSocket'
import { TCPTunnleWrapper } from './TCPTunnleWrapper'
import { EndPoint, TCPPacketable } from '../Common/interfaces'
import { ForwardInfo } from '../Common/ForwardInfo'

export class UID {
    private static uid = 1
    public static GetUID() {
        return UID.uid++
    }
}

export class PortMapping {
    isServer: boolean
    tunnel: TCPPacketable
    forwardInfo: ForwardInfo
    map: Map<number, Pipe> = new Map()
    tcpServer: TCPServer
    udpServer: UDPServer
    constructor(isServer: boolean, tunnel: TCPPacketable, forwardInfo: ForwardInfo) {
        this.isServer = isServer
        this.tunnel = tunnel;
        this.forwardInfo = forwardInfo
    }

    async start() {
        if (!this.isServer) {
            return true;
        }

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
    }

    private async onServerNewConnect(rometeSession: EndPoint) {
        let pipeId = UID.GetUID()

        let tcpPacket = new TCPPacket()
        tcpPacket.Cmd = CMD.TCP_Connected
        let dataPacket = new TCPDataPacket();
        dataPacket.mappingId = this.forwardInfo.mappingId;
        dataPacket.pipeId = pipeId;
        tcpPacket.Data = dataPacket.Serialize()
        this.tunnel.writePacket(tcpPacket)

        let tcpTunnleWrapper = new TCPTunnleWrapper(this.tunnel, this.forwardInfo.mappingId, pipeId)
        let pipe = new Pipe(tcpTunnleWrapper, rometeSession);
        pipe.tunnleWrapper = tcpTunnleWrapper;
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
        if (this.isServer) {
            return false
        }

        if (this.map.has(pipeId)) {
            return false;
        }
        if (this.forwardInfo.type == 'tcp') {
            let options = new TCPOptions();
            options.usePacket = false;
            let leftSession = new TCPClient(options);
            leftSession.setClient(this.forwardInfo.targetPort, this.forwardInfo.targetAddr);

            let tcpTunnleWrapper = new TCPTunnleWrapper(this.tunnel, mappingId, pipeId);
            let pipe = new Pipe(leftSession, tcpTunnleWrapper);
            pipe.tunnleWrapper = tcpTunnleWrapper;

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

            let tcpTunnleWrapper = new TCPTunnleWrapper(this.tunnel, mappingId, pipeId);
            let pipe = new Pipe(leftSession, tcpTunnleWrapper);
            pipe.tunnleWrapper = tcpTunnleWrapper;

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

    private connectionClose(pipeId: number) {
        this.map.delete(pipeId)
    }

    public onReceiveTunnleData(buffer: Buffer, pipeId: number) {
        if (this.map.has(pipeId)) {
            var pipe = this.map.get(pipeId);
            pipe.onReceiveTunnleData(buffer)
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
        this.map = new Map(); // clear
        for (const item of pipes) {
            item.close()
        }
        if (this.tcpServer) {
            let server = this.tcpServer;
            this.tcpServer = null;
            server.close();
        }
        if (this.udpServer) {
            let server = this.udpServer;
            this.udpServer = null;
            server.close();
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
