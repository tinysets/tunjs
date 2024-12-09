import { TCPPacket, TCPDataPacket } from './Common/TCPPacket';
import { TCPServer, TCPSession, TCPOptions } from "./Socket/TCPServer";
import { Tunnel, TunnelManager } from './Tunnel/TunnelManager';
import { Msg } from './Common/Msg';
import { TunnelInfo } from './Common/TunnelInfo';

export let startServer = async (port = 7666, validKeys: string[] = []) => {

    let tunnelManager = new TunnelManager()

    let options = new TCPOptions();
    options.usePacket = true;
    let tcpServer = new TCPServer(options);
    tcpServer.setServer(port);

    tcpServer.on("newConnect", (tcpSession: TCPSession) => {

        tcpSession.on('packet', (packet: TCPPacket) => {
            if (packet.Cmd == Msg.Hello) {
                if (validKeys.length > 0) {
                    let hello = packet.GetJsonData()
                    if (hello && hello.authKey) {
                        if (validKeys.includes(hello.authKey)) {
                            tcpSession.isAuthed = true
                        } else {
                            tcpSession.isAuthed = false
                        }
                    }
                } else {
                    tcpSession.isAuthed = true
                }
                let resPacket = new TCPPacket();
                resPacket.Cmd = Msg.Hello;
                resPacket.SetJsonData({ isAuthed: tcpSession.isAuthed })
                tcpSession.writePacket(resPacket);

            }

            if (!tcpSession.isAuthed) {
                tcpSession.close()
                return
            }

            if (packet.Cmd == Msg.New_Tunnel) {
                let tunnelInfos: TunnelInfo[] = packet.GetJsonData();
                tunnelInfos = tunnelInfos.map((v) => TunnelInfo.From(v))
                let isServer = true;
                for (const tunnelInfo of tunnelInfos) {
                    let tunnel = new Tunnel(isServer, tcpSession, tunnelInfo)
                    tunnelManager.newTunnel(tcpSession, tunnelInfo.tunnelId, tunnel)
                }
            } else if (packet.Cmd == Msg.TCP_Closed) {
                let dataPacket = new TCPDataPacket();
                dataPacket.UnSerialize(packet.Data)
                tunnelManager.onRecvTunnleClose(tcpSession, dataPacket.tunnelId, dataPacket.pipeId)
            } else if (packet.Cmd == Msg.TCP_Data) {
                let dataPacket = new TCPDataPacket();
                dataPacket.UnSerialize(packet.Data)
                tunnelManager.onRecvTunnleData(tcpSession, dataPacket.tunnelId, dataPacket.pipeId, dataPacket.buffer)
            }
        });

        tcpSession.on('close', () => {
            tunnelManager.close(tcpSession)
        });
    });

    return await tcpServer.start()
}