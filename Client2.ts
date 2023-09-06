import { CMD, ForwardInfo, TCPDataPacket, TCPPacket } from './TCPPacket';
import { TCPClient, TCPOptions, TCPTunnleEndPoint } from "./TCPSocket2";
import { Pipe } from './UDPSocket';

// PortMappingClientSide
export class PortMappingCSide {
    tcpClient: TCPClient
    forwardInfo: ForwardInfo
    map: Map<number, Pipe> = new Map()

    constructor(tcpClient: TCPClient, forwardInfo: ForwardInfo) {
        this.tcpClient = tcpClient;
        this.forwardInfo = forwardInfo
    }

    async startNew(mappingId: number, pipeId: number) {
        let options = new TCPOptions();
        options.usePacket = false;
        let leftSession = new TCPClient(options);
        leftSession.setClient(this.forwardInfo.targetPort, this.forwardInfo.targetAddr)

        let tcpTunnle = new TCPTunnleEndPoint(this.tcpClient, mappingId, pipeId)
        let pipe = new Pipe(leftSession, tcpTunnle);

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

    private connectionClose(pipeId: number) {
        this.map.delete(pipeId)
    }

    public receiveRightData(buffer: Buffer, pipeId: number) {
        if (this.map.has(pipeId)) {
            var pipe = this.map.get(pipeId);
            let right = pipe.right;
            right.emitData(buffer)
        }
    }
    public receiveRightClose(pipeId: number) {
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

    private portMappingMap: Map<TCPClient, Map<number, PortMappingCSide>> = new Map()
    newPortMapping(tcpSession: TCPClient, mappingId: number, portMapCSide: PortMappingCSide) {

        if (!this.portMappingMap.has(tcpSession)) {
            this.portMappingMap.set(tcpSession, new Map());
        }
        this.portMappingMap.get(tcpSession).set(mappingId, portMapCSide);
    }

    newConnection(tcpSession: TCPClient, mappingId: number, pipeId: number) {
        let map = this.portMappingMap.get(tcpSession)
        if (map) {
            let portMapSSide = map.get(mappingId);
            if (portMapSSide) {
                portMapSSide.startNew(mappingId, pipeId)
            }
        }
    }

    rightClose(tcpSession: TCPClient, mappingId: number, pipeId: number) {
        let map = this.portMappingMap.get(tcpSession)
        if (map) {
            let portMapSSide = map.get(mappingId);
            if (portMapSSide) {
                portMapSSide.receiveRightClose(pipeId)
            }
        }
    }

    rightData(tcpSession: TCPClient, mappingId: number, pipeId: number, buffer: Buffer) {
        let map = this.portMappingMap.get(tcpSession)
        if (map) {
            let portMapSSide = map.get(mappingId);
            if (portMapSSide) {
                portMapSSide.receiveRightData(buffer, pipeId)
            }
        }
    }

    close(tcpSession: TCPClient) {
        let map = this.portMappingMap.get(tcpSession)
        if (map) {
            this.portMappingMap.delete(tcpSession)
            for (const portMapSSide of map.values()) {
                portMapSSide.close()
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
                for (const forwardInfo of forwardInfos) {
                    let portMapCSide = new PortMappingCSide(tcpClient, forwardInfo)
                    mappingManager.newPortMapping(tcpClient, forwardInfo.mappingId, portMapCSide)
                }
            } else if (packet.Cmd == CMD.New_PortMapping) {
                let succs: number[] = packet.GetJsonData();
            } else if (packet.Cmd == CMD.TCP_Connected) {
                let dataPacket = new TCPDataPacket();
                dataPacket.UnSerialize(packet.Data)
                mappingManager.newConnection(tcpClient, dataPacket.mappingId, dataPacket.pipeId)
            } else if (packet.Cmd == CMD.TCP_Closed) {
                let dataPacket = new TCPDataPacket();
                dataPacket.UnSerialize(packet.Data)
                mappingManager.rightClose(tcpClient, dataPacket.mappingId, dataPacket.pipeId)
            } else if (packet.Cmd == CMD.TCP_Data) {
                let dataPacket = new TCPDataPacket();
                dataPacket.UnSerialize(packet.Data)
                mappingManager.rightData(tcpClient, dataPacket.mappingId, dataPacket.pipeId, dataPacket.buffer)
            }
        })
    }

    await tcpClient.start();
}