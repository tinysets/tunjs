import Emitter from 'events'
import net from 'net'
import { LocalPortForward, PortMappingCSide, PortMappingSSide, PortMappingTest, TCPServer, TCPSession, TCPSessionOptions } from "./TCPSocket";
import { App, Context, TCPEventRouter, TCPPacketRouter } from './App';
import { CMD, ForwardInfo, TCPPacket } from './TCPPacket';

class PortMappingManager {

    private portMappingMap: Map<TCPSession, Map<number, PortMappingCSide>> = new Map()
    newPortMapping(tcpSession: TCPSession, mappingId: number, portMapCSide: PortMappingCSide) {

        if (!this.portMappingMap.has(tcpSession)) {
            this.portMappingMap.set(tcpSession, new Map());
        }
        this.portMappingMap.get(tcpSession).set(mappingId, portMapCSide);

        portMapCSide.on('closeConnection', (id: number) => {
            let packet = new TCPPacket()
            packet.Cmd = CMD.C2S_TCP_Closed
            let data = {
                mappingId: mappingId,
                id: id,
            }
            packet.SetJsonData(data)
            tcpSession.write(packet)
        })
        portMapCSide.on('leftData', (buffer: Buffer, id: number) => {
            let packet = new TCPPacket()
            packet.Cmd = CMD.C2S_TCP_Data
            let data = {
                mappingId: mappingId,
                id: id,
                buffer: buffer
            }
            packet.SetJsonData(data)
            tcpSession.write(packet)
        })
    }

    newConnection(tcpSession: TCPSession, mappingId: number, id: number) {
        let map = this.portMappingMap.get(tcpSession)
        if (map) {
            let portMapSSide = map.get(mappingId);
            if (portMapSSide) {
                portMapSSide.startNew(id)
            }
        }
    }

    rightClose(tcpSession: TCPSession, mappingId: number, id: number) {
        let map = this.portMappingMap.get(tcpSession)
        if (map) {
            let portMapSSide = map.get(mappingId);
            if (portMapSSide) {
                portMapSSide.receiveRightClose(id)
            }
        }
    }

    rightData(tcpSession: TCPSession, mappingId: number, id: number, buffer: Buffer) {
        let map = this.portMappingMap.get(tcpSession)
        if (map) {
            let portMapSSide = map.get(mappingId);
            if (portMapSSide) {
                portMapSSide.receiveRightData(buffer, id)
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

export let startClient = async (forwardInfos: ForwardInfo[]) => {

    let mappingManager = new PortMappingManager()
    let tcpClientApp = new App();
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
        packet.Cmd = CMD.C2S_New_PortMapping
        packet.SetJsonData(forwardInfos)
        tcpSession.write(packet);

        for (const forwardInfo of forwardInfos) {
            let portMapCSide = new PortMappingCSide(forwardInfo.targetPort, forwardInfo.targetAddr)
            mappingManager.newPortMapping(tcpSession, forwardInfo.id, portMapCSide)
        }
    })

    tcpPacketRouter.use(CMD.S2C_New_PortMapping, async (ctx: Context, next) => {
        let tcpSession = ctx.tcpSession;
        let packet = ctx.tcpPacket
        let succs: number[] = packet.GetJsonData();
        console.log(`S2C_New_PortMapping succs = ${succs}`);
    })

    tcpPacketRouter.use(CMD.S2C_TCP_Connected, async (ctx: Context, next) => {
        let tcpSession = ctx.tcpSession;
        let packet = ctx.tcpPacket
        let info: { mappingId: number, id: number } = packet.GetJsonData();
        mappingManager.newConnection(tcpSession, info.mappingId, info.id)
        console.log('client connect:' + JSON.stringify(info))
    })

    tcpPacketRouter.use(CMD.S2C_TCP_Closed, async (ctx: Context, next) => {
        let tcpSession = ctx.tcpSession;
        let packet = ctx.tcpPacket
        let info: { mappingId: number, id: number } = packet.GetJsonData();
        mappingManager.rightClose(tcpSession, info.mappingId, info.id)
    })
    tcpPacketRouter.use(CMD.S2C_TCP_Data, async (ctx: Context, next) => {
        let tcpSession = ctx.tcpSession;
        let packet = ctx.tcpPacket
        let info: { mappingId: number, id: number, buffer } = packet.GetJsonData();

        let buffer = Buffer.from(info.buffer.data)
        mappingManager.rightData(tcpSession, info.mappingId, info.id, buffer)
    })

    let tcpEventRouter = new TCPEventRouter();
    tcpEventRouter.use('packet', tcpPacketRouter.callback())
    tcpEventRouter.use('close', async (ctx: Context, next) => {
        let tcpSession = ctx.tcpSession;
        mappingManager.close(tcpSession)
    })
    tcpEventRouter.use('ready', async (ctx: Context, next) => {
        let tcpSession = ctx.tcpSession;
        let packet = new TCPPacket()
        packet.Cmd = CMD.Hello
        tcpSession.write(packet);
    })

    tcpEventRouter.use('data', async (ctx: Context, next) => {
        let tcpSession = ctx.tcpSession;
        let tcpBuffer = ctx.tcpBuffer;
    })

    tcpClientApp.use(tcpEventRouter.callback())

    let options: TCPSessionOptions = {
        isTCPPacket: true,
        isClient: true,
        isServer: false,
    }
    let tcpSession = new TCPSession(options, new net.Socket());
    tcpSession.setApp(tcpClientApp)
    await tcpSession.startClient(7666, '127.0.0.1');
}