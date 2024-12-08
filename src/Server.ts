import { TCPPacket, TCPDataPacket } from './Common/TCPPacket';
import { TCPServer, TCPSession, TCPOptions } from "./Socket/TCPServer";
import { PortMapping, PortMappingManager } from './PortMapping/PortMappingManager';
import { CMD } from './Common/CMD';
import { ForwardInfo } from './Common/ForwardInfo';

export let startServer = async (port = 7666, validKeys: string[] = []) => {

    let mappingManager = new PortMappingManager()

    let options = new TCPOptions();
    options.usePacket = true;
    let tcpServer = new TCPServer(options);
    tcpServer.setServer(port);

    tcpServer.on("newConnect", (tcpSession: TCPSession) => {

        tcpSession.on('packet', (packet: TCPPacket) => {
            if (packet.Cmd == CMD.Hello) {
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
                resPacket.Cmd = CMD.Hello;
                resPacket.SetJsonData({ isAuthed: tcpSession.isAuthed })
                tcpSession.writePacket(resPacket);

            }

            if (!tcpSession.isAuthed) {
                tcpSession.close()
                return
            }

            if (packet.Cmd == CMD.New_PortMapping) {
                let forwardInfos: ForwardInfo[] = packet.GetJsonData();
                forwardInfos = forwardInfos.map((v) => ForwardInfo.From(v))
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
        });

        tcpSession.on('close', () => {
            mappingManager.close(tcpSession)
        });
    });

    return await tcpServer.start()
}