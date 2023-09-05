import { App, Context, TCPEventRouter, TCPPacketRouter } from './App';
import { CMD, ForwardInfo, TCPPacket } from './TCPPacket';
import { PortMappingSSide, TCPServer, TCPSession, TCPSessionOptions } from "./TCPSocket";

class PortMappingManager {

    private portMappingMap: Map<TCPSession, Map<number, PortMappingSSide>> = new Map()
    newPortMapping(tcpSession: TCPSession, mappingId: number, portMapSSide: PortMappingSSide) {

        if (!this.portMappingMap.has(tcpSession)) {
            this.portMappingMap.set(tcpSession, new Map());
        }
        this.portMappingMap.get(tcpSession).set(mappingId, portMapSSide);

        portMapSSide.on('newConnection', (id: number) => {
            let packet = new TCPPacket()
            packet.Cmd = CMD.S2C_TCP_Connected
            let data = {
                mappingId: mappingId,
                id: id,
            }
            packet.SetJsonData(data)
            tcpSession.write(packet)
        })
        portMapSSide.on('closeConnection', (id: number) => {
            let packet = new TCPPacket()
            packet.Cmd = CMD.S2C_TCP_Closed
            let data = {
                mappingId: mappingId,
                id: id,
            }
            packet.SetJsonData(data)
            tcpSession.write(packet)
        })
        portMapSSide.on('rightData', (buffer: Buffer, id: number) => {
            let packet = new TCPPacket()
            packet.Cmd = CMD.S2C_TCP_Data
            let data = {
                mappingId: mappingId,
                id: id,
                buffer: buffer
            }
            packet.SetJsonData(data)
            tcpSession.write(packet)
        })
    }

    leftClose(tcpSession: TCPSession, mappingId: number, id: number) {
        let map = this.portMappingMap.get(tcpSession)
        if (map) {
            let portMapSSide = map.get(mappingId);
            if (portMapSSide) {
                portMapSSide.receiveLeftClose(id)
            }
        }
    }

    leftData(tcpSession: TCPSession, mappingId: number, id: number, buffer: Buffer) {
        let map = this.portMappingMap.get(tcpSession)
        if (map) {
            let portMapSSide = map.get(mappingId);
            if (portMapSSide) {
                portMapSSide.receiveLeftData(buffer, id)
            }
        }
    }

    close(tcpSession: TCPSession) {
        let map = this.portMappingMap.get(tcpSession)
        if (map) {
            this.portMappingMap.delete(tcpSession)
            for (const portMapSSide of map.values()) {
                portMapSSide.close()
            }
        }
    }
}

export let startServer = async (port = 7666) => {

    let mappingManager = new PortMappingManager()
    let tcpServerApp = new App();
    // tcpServerApp.use(async (ctx: Context, next) => {
    //     // logger
    //     let tcpEvent = ctx.tcpEvent;
    //     let tcpSession = ctx.tcpSession;
    //     let socket = tcpSession.socket;
    //     console.log(`server remote: ${socket.remoteAddress}:${socket.remotePort} tcpEvent=${tcpEvent}`);
    //     await next();
    // })

    let tcpPacketRouter = new TCPPacketRouter();
    tcpPacketRouter.use(CMD.Hello, async (ctx: Context, next) => {
        let tcpSession = ctx.tcpSession;
        let packet = new TCPPacket()
        packet.Cmd = CMD.Hello
        tcpSession.write(packet);
    })

    tcpPacketRouter.use(CMD.C2S_New_PortMapping, async (ctx: Context, next) => {
        let tcpSession = ctx.tcpSession;
        let packet = ctx.tcpPacket
        let forwardInfos: ForwardInfo[] = packet.GetJsonData();

        let succs: number[] = []
        for (const forwardInfo of forwardInfos) {
            let portMapSSide = new PortMappingSSide(forwardInfo.serverPort)
            let succ = await portMapSSide.start()
            if (succ) {
                succs.push(forwardInfo.id)
                mappingManager.newPortMapping(tcpSession, forwardInfo.id, portMapSSide)
            }
        }
        let resPacket = new TCPPacket();
        resPacket.Cmd = CMD.S2C_New_PortMapping;
        resPacket.SetJsonData(succs);
        tcpSession.write(resPacket);
    })
    tcpPacketRouter.use(CMD.C2S_TCP_Closed, async (ctx: Context, next) => {
        let tcpSession = ctx.tcpSession;
        let packet = ctx.tcpPacket
        let info: { mappingId: number, id: number } = packet.GetJsonData();
        mappingManager.leftClose(tcpSession, info.mappingId, info.id)
    })
    tcpPacketRouter.use(CMD.C2S_TCP_Data, async (ctx: Context, next) => {
        let tcpSession = ctx.tcpSession;
        let packet = ctx.tcpPacket
        let info: { mappingId: number, id: number, buffer } = packet.GetJsonData();
        let buffer = Buffer.from(info.buffer.data)
        mappingManager.leftData(tcpSession, info.mappingId, info.id, buffer)
    })

    let tcpEventRouter = new TCPEventRouter();
    tcpEventRouter.use('packet', tcpPacketRouter.callback())
    tcpEventRouter.use('close', async (ctx: Context, next) => {
        let tcpSession = ctx.tcpSession;
        mappingManager.close(tcpSession)
    })

    tcpServerApp.use(tcpEventRouter.callback())
    let options: TCPSessionOptions = {
        isTCPPacket: true,
        isClient: false,
        isServer: true,
    }
    let tcpServer = new TCPServer(options);
    tcpServer.setApp(tcpServerApp);
    await tcpServer.start(7666)
}