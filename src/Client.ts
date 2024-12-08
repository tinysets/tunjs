import { CMD } from './Common/CMD';
import { TCPDataPacket, TCPPacket } from './Common/TCPPacket';
import { TCPOptions } from './Socket/TCPServer';
import { TCPClient } from './Socket/TCPClient';
import { PortMapping, PortMappingManager } from './PortMapping/PortMappingManager';
import { ForwardInfo } from './Common/ForwardInfo';


export let startClient = async (forwardInfos: ForwardInfo[], remotePort = 7666, remoteAddr = '127.0.0.1', authKey = '') => {

    let mappingManager = new PortMappingManager()

    let options = new TCPOptions()
    options.usePacket = true;
    let tcpClient = new TCPClient(options);
    tcpClient.setClient(remotePort, remoteAddr)

    {
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
    let succ = await tcpClient.start();
    if (succ) {
        let packet = new TCPPacket()
        packet.Cmd = CMD.Hello
        packet.SetJsonData({ authKey: authKey })
        tcpClient.writePacket(packet);

        let intervalTimer = setInterval(() => {
            let packet = new TCPPacket()
            packet.Cmd = CMD.Heartbeat
            packet.SetJsonData({ authKey: authKey })
            tcpClient.writePacket(packet);
        }, 1000)

        tcpClient.on('close', () => {
            clearInterval(intervalTimer)
        });
    }

    return succ;
}