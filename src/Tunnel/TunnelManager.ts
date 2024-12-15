import dgram from 'dgram'
import { TCPOptions, TCPServer, TCPSession } from '../Socket/TCPServer'
import { Pipe } from '../Common/Pipe'
import { TCPClient } from '../Socket/TCPClient'
import { Msg } from '../Common/Msg'
import { TCPDataPacket, TCPPacket } from '../Common/TCPPacket'
import { UDPServer, UDPSession } from '../Socket/UDPServer'
import { VirtualEndPoint } from './VirtualEndPoint'
import { EndPoint, TCPPacketable } from '../Common/interfaces'
import { TunnelInfo } from '../Common/TunnelInfo'
import { UDPClient } from '../Socket/UDPClient'

export class UID {
    private static uid = 1
    public static GetUID() {
        return UID.uid++
    }
}

export class Tunnel {
    isServer: boolean
    node: TCPPacketable
    tunnelInfo: TunnelInfo
    map: Map<number, Pipe> = new Map()
    tcpServer: TCPServer
    udpServer: UDPServer
    constructor(isServer: boolean, node: TCPPacketable, tunnelInfo: TunnelInfo) {
        this.isServer = isServer
        this.node = node;
        this.tunnelInfo = tunnelInfo
    }

    async start() {
        if (!this.isServer) {
            return true;
        }

        if (this.tunnelInfo.type == 'tcp') {
            let options = new TCPOptions();
            options.usePacket = false;
            let tcpServer = new TCPServer(options);
            tcpServer.setServer(this.tunnelInfo.sourcePort)
            let succ = await tcpServer.start()
            if (!succ) {
                console.error(`tcp server Tunnel start failed! targetAddr:${this.tunnelInfo.targetAddr}, targetPort:${this.tunnelInfo.targetPort}, sourcePort(serverPort):${this.tunnelInfo.sourcePort}`);
            } else {
                console.error(`tcp server Tunnel start success! targetAddr:${this.tunnelInfo.targetAddr}, targetPort:${this.tunnelInfo.targetPort}, sourcePort(serverPort):${this.tunnelInfo.sourcePort}`);
                this.tcpServer = tcpServer;
                tcpServer.on('newConnect', (rometeSession: TCPSession) => {
                    this.onServerNewConnect(rometeSession)
                })
            }
            return succ
        } else {
            let udpServer = new UDPServer(dgram.createSocket('udp4'));
            udpServer.setServer(this.tunnelInfo.sourcePort)
            let succ = await udpServer.start()
            if (!succ) {
                console.error(`udp server Tunnel start failed! targetAddr:${this.tunnelInfo.targetAddr}, targetPort:${this.tunnelInfo.targetPort}, sourcePort(serverPort):${this.tunnelInfo.sourcePort}`);
            } else {
                console.error(`udp server Tunnel start success! targetAddr:${this.tunnelInfo.targetAddr}, targetPort:${this.tunnelInfo.targetPort}, sourcePort(serverPort):${this.tunnelInfo.sourcePort}`);
                this.udpServer = udpServer;
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
        tcpPacket.Cmd = Msg.TCP_Connected
        let dataPacket = new TCPDataPacket();
        dataPacket.tunnelId = this.tunnelInfo.tunnelId;
        dataPacket.pipeId = pipeId;
        tcpPacket.Data = dataPacket.Serialize()
        this.node.writePacket(tcpPacket)

        let virtualEndPoint = new VirtualEndPoint(this.node, this.tunnelInfo.tunnelId, pipeId)
        let pipe = new Pipe(virtualEndPoint, rometeSession);
        pipe.virtualEndPoint = virtualEndPoint;
        pipe.on('close', () => {
            this.connectionClose(pipeId)
            console.info(`server pipe close! pipeId=${pipeId}, tunnelInfo={type=${this.tunnelInfo.type}, targetAddr=${this.tunnelInfo.targetAddr}, targetPort=${this.tunnelInfo.targetPort}, sourcePort=${this.tunnelInfo.sourcePort}}`);
        })

        this.map.set(pipeId, pipe)
        let succ = await pipe.link()
        if (!succ) {
            console.error(`server pipe link failed! pipeId=${pipeId}, tunnelInfo={type=${this.tunnelInfo.type}, targetAddr=${this.tunnelInfo.targetAddr}, targetPort=${this.tunnelInfo.targetPort}, sourcePort=${this.tunnelInfo.sourcePort}}`);
        } else {
            console.error(`server pipe link success! pipeId=${pipeId}, tunnelInfo={type=${this.tunnelInfo.type}, targetAddr=${this.tunnelInfo.targetAddr}, targetPort=${this.tunnelInfo.targetPort}, sourcePort=${this.tunnelInfo.sourcePort}}`);
        }
    }

    async onClientNewConnect(tunnelId: number, pipeId: number) {
        if (this.isServer) {
            return false
        }

        if (this.map.has(pipeId)) {
            return false;
        }
        if (this.tunnelInfo.type == 'tcp') {
            let options = new TCPOptions();
            options.usePacket = false;
            let leftSession = new TCPClient(options);
            leftSession.setClient(this.tunnelInfo.targetPort, this.tunnelInfo.targetAddr);

            let virtualEndPoint = new VirtualEndPoint(this.node, tunnelId, pipeId);
            let pipe = new Pipe(leftSession, virtualEndPoint);
            pipe.virtualEndPoint = virtualEndPoint;

            pipe.on('close', () => {
                this.connectionClose(pipeId)
                console.info(`tcp client pipe close! pipeId=${pipeId}, tunnelInfo={type=${this.tunnelInfo.type}, targetAddr=${this.tunnelInfo.targetAddr}, targetPort=${this.tunnelInfo.targetPort}, sourcePort=${this.tunnelInfo.sourcePort}}`);
            })
            this.map.set(pipeId, pipe)
            let succ = await pipe.link()
            if (!succ) {
                console.error(`tcp client pipe link failed! pipeId=${pipeId}, tunnelInfo={type=${this.tunnelInfo.type}, targetAddr=${this.tunnelInfo.targetAddr}, targetPort=${this.tunnelInfo.targetPort}, sourcePort=${this.tunnelInfo.sourcePort}}`);
            } else {
                console.info(`tcp client pipe link success! pipeId=${pipeId}, tunnelInfo={type=${this.tunnelInfo.type}, targetAddr=${this.tunnelInfo.targetAddr}, targetPort=${this.tunnelInfo.targetPort}, sourcePort=${this.tunnelInfo.sourcePort}}`);
            }
            return succ
        } else {
            let leftSession = new UDPClient(dgram.createSocket('udp4'));
            leftSession.setClient(this.tunnelInfo.targetPort, this.tunnelInfo.targetAddr);

            let virtualEndPoint = new VirtualEndPoint(this.node, tunnelId, pipeId);
            let pipe = new Pipe(leftSession, virtualEndPoint);
            pipe.virtualEndPoint = virtualEndPoint;

            pipe.on('close', () => {
                this.connectionClose(pipeId)
                console.info(`udp client pipe close! pipeId=${pipeId}, tunnelInfo={type=${this.tunnelInfo.type}, targetAddr=${this.tunnelInfo.targetAddr}, targetPort=${this.tunnelInfo.targetPort}, sourcePort=${this.tunnelInfo.sourcePort}}`);
            })
            this.map.set(pipeId, pipe)
            let succ = await pipe.link()
            if (!succ) {
                console.error(`udp client pipe link failed! pipeId=${pipeId}, tunnelInfo={type=${this.tunnelInfo.type}, targetAddr=${this.tunnelInfo.targetAddr}, targetPort=${this.tunnelInfo.targetPort}, sourcePort=${this.tunnelInfo.sourcePort}}`);
            } else {
                console.error(`udp client pipe link success! pipeId=${pipeId}, tunnelInfo={type=${this.tunnelInfo.type}, targetAddr=${this.tunnelInfo.targetAddr}, targetPort=${this.tunnelInfo.targetPort}, sourcePort=${this.tunnelInfo.sourcePort}}`);
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

export class TunnelManager {

    private tunnelMap: Map<EndPoint, Map<number, Tunnel>> = new Map()
    async newTunnel(tcpSession: EndPoint, tunnelId: number, tunnel: Tunnel) {

        if (!this.tunnelMap.has(tcpSession)) {
            this.tunnelMap.set(tcpSession, new Map());
        }
        this.tunnelMap.get(tcpSession).set(tunnelId, tunnel);
        let succ = await tunnel.start();
        return succ;
    }

    onRecvTunnleConnect(tcpSession: EndPoint, tunnelId: number, pipeId: number) {
        let map = this.tunnelMap.get(tcpSession)
        if (map) {
            let tunnel = map.get(tunnelId);
            if (tunnel) {
                tunnel.onClientNewConnect(tunnelId, pipeId)
            }
        }
    }

    onRecvTunnleClose(tcpSession: EndPoint, tunnelId: number, pipeId: number) {
        let map = this.tunnelMap.get(tcpSession)
        if (map) {
            let tunnel = map.get(tunnelId);
            if (tunnel) {
                tunnel.onReceiveTunnleClose(pipeId)
            }
        }
    }

    onRecvTunnleData(tcpSession: EndPoint, tunnelId: number, pipeId: number, buffer: Buffer) {
        let map = this.tunnelMap.get(tcpSession)
        if (map) {
            let tunnel = map.get(tunnelId);
            if (tunnel) {
                tunnel.onReceiveTunnleData(buffer, pipeId)
            }
        }
    }

    close(tcpSession: EndPoint) {
        let map = this.tunnelMap.get(tcpSession)
        if (map) {
            this.tunnelMap.delete(tcpSession)
            for (const tunnel of map.values()) {
                tunnel.close()
            }
        }
    }
}
