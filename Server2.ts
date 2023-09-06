import dgram from 'dgram'
import Emitter from 'events'
import once from 'once'
import { CMD, ForwardInfo, TCPDataPacket, TCPPacket } from './TCPPacket';
import { TCPClient, TCPOptions, TCPPacketable, TCPServer, TCPSession } from "./TCPSocket2";
import { EndPoint, Pipe, UDPClient, UDPServer, UDPSession } from './UDPSocket';
import { PortMapping, PortMappingManager } from './Client2';


export let startServer = async (port = 7666) => {

    let mappingManager = new PortMappingManager()

    let options = new TCPOptions()
    options.usePacket = true;
    let tcpServer = new TCPServer(options);
    tcpServer.setServer(port);

    tcpServer.on("newConnect", (tcpSession: TCPSession) => {
        tcpSession.on('ready', () => {
            let packet = new TCPPacket()
            packet.Cmd = CMD.Hello
            tcpSession.writePacket(packet);
        })
        tcpSession.on('close', () => {
            mappingManager.close(tcpSession)
        })

        tcpSession.on('packet', (packet: TCPPacket) => {
            if (packet.Cmd == CMD.Hello) {
                tcpSession.writePacket(packet);
            } else if (packet.Cmd == CMD.New_PortMapping) {
                let forwardInfos: ForwardInfo[] = packet.GetJsonData();
                let isServer = true;
                for (const forwardInfo of forwardInfos) {
                    let portMapping = new PortMapping(isServer, tcpSession, forwardInfo)
                    mappingManager.newPortMapping(tcpSession, forwardInfo.mappingId, portMapping)
                }
            } else if (packet.Cmd == CMD.TCP_Closed) {
                let dataPacket = new TCPDataPacket();
                dataPacket.UnSerialize(packet.Data)
                mappingManager.onRecvTunnleClose(tcpSession, dataPacket.mappingId, dataPacket.pipeId)
            } else if (packet.Cmd == CMD.TCP_Data) {
                let dataPacket = new TCPDataPacket();
                dataPacket.UnSerialize(packet.Data)
                mappingManager.onRecvTunnleData(tcpSession, dataPacket.mappingId, dataPacket.pipeId, dataPacket.buffer)
            }
        })
    });

    await tcpServer.start()
}