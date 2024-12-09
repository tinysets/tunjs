import { Msg } from './Common/Msg';
import { TCPDataPacket, TCPPacket } from './Common/TCPPacket';
import { TCPOptions } from './Socket/TCPServer';
import { TCPClient } from './Socket/TCPClient';
import { Tunnel, TunnelManager } from './Tunnel/TunnelManager';
import { TunnelInfo } from './Common/TunnelInfo';


export let startClient = async (tunnelInfos: TunnelInfo[], remotePort = 7666, remoteAddr = '127.0.0.1', authKey = '') => {

    let tunnelManager = new TunnelManager()

    let options = new TCPOptions()
    options.usePacket = true;
    let tcpClient = new TCPClient(options);
    tcpClient.setClient(remotePort, remoteAddr)

    {
        tcpClient.on('close', () => {
            tunnelManager.close(tcpClient)
        })

        tcpClient.on('packet', (packet: TCPPacket) => {
            if (packet.Cmd == Msg.Hello) {
                let hello = packet.GetJsonData()
                if (hello && hello.isAuthed) {
                    tcpClient.isAuthed = true
                } else {
                    tcpClient.isAuthed = false
                }
                if (tcpClient.isAuthed) {
                    let packet = new TCPPacket()
                    packet.Cmd = Msg.New_Tunnel
                    packet.SetJsonData(tunnelInfos)
                    tcpClient.writePacket(packet);
                    let isServer = false;
                    for (const tunnelInfo of tunnelInfos) {
                        let tunnel = new Tunnel(isServer, tcpClient, tunnelInfo)
                        tunnelManager.newTunnel(tcpClient, tunnelInfo.tunnelId, tunnel)
                    }
                }
            }

            if (!tcpClient.isAuthed) {
                tcpClient.close()
                return;
            }

            if (packet.Cmd == Msg.New_Tunnel) {
                let succs: number[] = packet.GetJsonData();
            } else if (packet.Cmd == Msg.TCP_Connected) {
                let dataPacket = new TCPDataPacket();
                dataPacket.UnSerialize(packet.Data)
                tunnelManager.onRecvTunnleConnect(tcpClient, dataPacket.tunnelId, dataPacket.pipeId)
            } else if (packet.Cmd == Msg.TCP_Closed) {
                let dataPacket = new TCPDataPacket();
                dataPacket.UnSerialize(packet.Data)
                tunnelManager.onRecvTunnleClose(tcpClient, dataPacket.tunnelId, dataPacket.pipeId)
            } else if (packet.Cmd == Msg.TCP_Data) {
                let dataPacket = new TCPDataPacket();
                dataPacket.UnSerialize(packet.Data)
                tunnelManager.onRecvTunnleData(tcpClient, dataPacket.tunnelId, dataPacket.pipeId, dataPacket.buffer)
            }
        })
    }
    let succ = await tcpClient.start();
    if (succ) {
        let packet = new TCPPacket()
        packet.Cmd = Msg.Hello
        packet.SetJsonData({ authKey: authKey })
        tcpClient.writePacket(packet);

        let intervalTimer = setInterval(() => {
            let packet = new TCPPacket()
            packet.Cmd = Msg.Heartbeat
            packet.SetJsonData({ authKey: authKey })
            tcpClient.writePacket(packet);
        }, 1000)

        tcpClient.on('close', () => {
            clearInterval(intervalTimer)
        });
    }

    return succ;
}