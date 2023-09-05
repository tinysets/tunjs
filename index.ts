import Emitter from 'events'
import net from 'net'
import { LocalPortForward, PortMappingCSide, PortMappingTest, TCPServer, TCPSession, TCPSessionOptions } from "./TCPSocket";
import { App, TCPEventRouter } from './App';
import { startServer } from './Server';
import { startClient } from './Client';
import { ForwardInfo } from './TCPPacket';

// import Koa from 'koa'
// let koaApp = new Koa();


// interface ServerForwardedInfo {
//     tcpSession: TCPSession
//     forwardInfo: ForwardInfo
//     tcpServer?: TCPServer
// }

// class ServerForwardManager {
//     forwardeds: ServerForwardedInfo[] = []
//     public NewForward(targetTCPSession: TCPSession, forwardInfo: ForwardInfo) {
//         for (const forwarded of this.forwardeds) {
//             if (forwarded.forwardInfo.type == forwardInfo.type) {
//                 if (forwarded.forwardInfo.serverPort == forwardInfo.serverPort) {
//                     console.error('服务器端口已经被占用了')
//                     return;
//                 }
//             }
//         }

//         if (forwardInfo.type == 'tcp') {
//             this.newTCPForwardServer(targetTCPSession, forwardInfo)
//         }
//     }

//     private newTCPForwardServer(targetTCPSession: TCPSession, forwardInfo: ForwardInfo) {
//         let tcpServerApp = new Application();
//         let tcpEventRouter = new TCPEventRouter();
//         tcpEventRouter.use('connect', async (ctx: Context, next) => {
//             let tcpSession = ctx.tcpSession;
//             let tcpForwardConnected: TCPForwardConnected = {
//                 forwardInfo: forwardInfo,
//                 sessionPort: tcpSession.socket.remotePort
//             }
//             let tcpPacket = new TCPPacket();
//             tcpPacket.Cmd = CMD.S2C_TCPForward_Connected
//             tcpPacket.SetJsonData(tcpForwardConnected);
//             targetTCPSession.write(tcpPacket);
//         })
//         tcpEventRouter.use('data', async (ctx: Context, next) => {
//             let tcpSession = ctx.tcpSession;
//             let tcpBuffer = ctx.tcpBuffer;

//             let tcpForwardData: TCPForwardData = {
//                 forwardInfo: forwardInfo,
//                 sessionPort: tcpSession.socket.remotePort,
//                 buffer: tcpBuffer
//             }

//             let tcpPacket = new TCPPacket();
//             tcpPacket.Cmd = CMD.S2C_TCPForward_Data
//             tcpPacket.SetJsonData(tcpForwardData);
//             targetTCPSession.write(tcpPacket);
//         })
//         tcpServerApp.use(tcpEventRouter.callback())
//         let options: TCPSessionOptions = {
//             isTCPPacket: false,
//             isClient: false,
//             isServer: true,
//         }
//         let tcpServer = new TCPServer(options);
//         tcpServer.app = tcpServerApp;
//         tcpServer.start(forwardInfo.serverPort)

//         let forwardedInfo: ServerForwardedInfo = {
//             tcpSession: targetTCPSession,
//             forwardInfo: forwardInfo,
//             tcpServer: tcpServer,
//         }
//         this.forwardeds.push(forwardedInfo)
//     }

//     public OnClose(targetTCPSession: TCPSession) {

//     }

//     public ForwardData(targetTCPSession: TCPSession, tcpForwardData: TCPForwardData) {
//         // for (const forwarded of this.forwardeds) {
//         //     for (const forwarded of this.forwardeds) {
//         //         if (forwarded.forwardInfo.type == tcpForwardData.forwardInfo.type) {
//         //             if (forwarded.forwardInfo.serverPort == tcpForwardData.forwardInfo.serverPort) {
//         //                 if (forwarded.tcpSession == tcpForwardData.sessionPort) {

//         //                 }
//         //             }
//         //         }
//         //     }
//         // }
//     }
// }


// interface ClientForwardedInfo {
//     tcpSession: TCPSession
//     tcpForwardConnected: TCPForwardConnected
//     proxySession?: TCPSession
// }

// class ClientForwardManager {
//     forwardeds: ClientForwardedInfo[] = []
//     public NewForward(targetTCPSession: TCPSession, tcpForwardConnected: TCPForwardConnected) {
//         for (const forwarded of this.forwardeds) {
//             if (forwarded.tcpForwardConnected.forwardInfo.type == tcpForwardConnected.forwardInfo.type) {
//                 if (forwarded.tcpForwardConnected.forwardInfo.serverPort == tcpForwardConnected.forwardInfo.serverPort) {
//                     if (forwarded.tcpForwardConnected.sessionPort == tcpForwardConnected.sessionPort) {
//                         console.error('本地端口转发连接已创建')
//                         return;
//                     }
//                 }
//             }
//         }

//         if (tcpForwardConnected.forwardInfo.type == 'tcp') {
//             this.newTCPForwardClient(targetTCPSession, tcpForwardConnected)
//         }
//     }

//     private newTCPForwardClient(targetTCPSession: TCPSession, tcpForwardConnected: TCPForwardConnected) {
//         let tcpClientApp = new Application();
//         let tcpEventRouter = new TCPEventRouter();
//         tcpEventRouter.use('connect', async (ctx: Context, next) => {
//             let tcpPacket = new TCPPacket();
//             tcpPacket.Cmd = CMD.C2S_TCPForward_Connected
//             targetTCPSession.write(tcpPacket);
//         })
//         tcpEventRouter.use('data', async (ctx: Context, next) => {
//             let tcpSession = ctx.tcpSession;
//             let tcpBuffer = ctx.tcpBuffer;

//             let tcpForwardData: TCPForwardData = {
//                 forwardInfo: tcpForwardConnected.forwardInfo,
//                 sessionPort: tcpForwardConnected.sessionPort,
//                 buffer: tcpBuffer
//             }

//             let tcpPacket = new TCPPacket();
//             tcpPacket.Cmd = CMD.C2S_TCPForward_Data
//             tcpPacket.SetJsonData(tcpForwardData);
//             targetTCPSession.write(tcpPacket);
//         })
//         tcpClientApp.use(tcpEventRouter.callback())
//         let options: TCPSessionOptions = {
//             isTCPPacket: false,
//             isClient: true,
//             isServer: false,
//         }
//         let clientSocket = new net.Socket();
//         let tcpSession = new TCPSession(options, tcpClientApp, clientSocket);
//         clientSocket.connect(tcpForwardConnected.forwardInfo.localPort, '127.0.0.1')

//         let forwardedInfo: ClientForwardedInfo = {
//             tcpSession: targetTCPSession,
//             tcpForwardConnected: tcpForwardConnected,
//             proxySession: tcpSession,
//         }
//         this.forwardeds.push(forwardedInfo)
//     }

//     public ForwardData(targetTCPSession: TCPSession, tcpForwardData: TCPForwardData) {
//         // for (const forwarded of this.forwardeds) {
//         //     if (forwarded.tcpForwardConnected.forwardInfo.type == tcpForwardConnected.forwardInfo.type) {
//         //         if (forwarded.tcpForwardConnected.forwardInfo.serverPort == tcpForwardConnected.forwardInfo.serverPort) {
//         //             if (forwarded.tcpForwardConnected.sessionPort == tcpForwardConnected.sessionPort) {
//         //                 console.error('本地端口转发连接已创建')
//         //                 return;
//         //             }
//         //         }
//         //     }
//         // }
//     }

//     public OnClose(targetTCPSession: TCPSession) {

//     }
// }

// { // server

//     let forwardMng = new ServerForwardManager();

//     let tcpServerApp = new Application();
//     tcpServerApp.use(async (ctx: Context, next) => {
//         // logger
//         let tcpEvent = ctx.tcpEvent;
//         let tcpSession = ctx.tcpSession;
//         let socket = tcpSession.socket;
//         console.log(`server remote: ${socket.remoteAddress}:${socket.remotePort} tcpEvent=${tcpEvent}`);
//         await next();
//     })

//     let tcpPacketRouter = new TCPPacketRouter();
//     tcpPacketRouter.use(CMD.Hello, async (ctx: Context, next) => {
//         console.log(`server Receive: Hello`);
//         let tcpSession = ctx.tcpSession;
//         let packet = new TCPPacket()
//         packet.Cmd = CMD.Hello
//         tcpSession.write(packet);
//     })
//     tcpPacketRouter.use(CMD.C2S_New_Forward, async (ctx: Context, next) => {
//         let tcpSession = ctx.tcpSession;
//         let packet = ctx.tcpPacket
//         let forwardInfo = packet.GetJsonData() as ForwardInfo;
//         forwardMng.NewForward(tcpSession, forwardInfo)
//     })

//     tcpPacketRouter.use(CMD.C2S_TCPForward_Connected, async (ctx: Context, next) => {
//         let tcpSession = ctx.tcpSession;
//     })
//     tcpPacketRouter.use(CMD.C2S_TCPForward_Data, async (ctx: Context, next) => {
//         let tcpSession = ctx.tcpSession;
//         let packet = ctx.tcpPacket
//         let tcpForwardData: TCPForwardData = packet.GetJsonData()
//         forwardMng.ForwardData(tcpSession, tcpForwardData)
//     })

//     let tcpEventRouter = new TCPEventRouter();
//     tcpEventRouter.use('packet', tcpPacketRouter.callback())
//     tcpServerApp.use(tcpEventRouter.callback())
//     let options: TCPSessionOptions = {
//         isTCPPacket: true,
//         isClient: false,
//         isServer: true,
//     }
//     let tcpServer = new TCPServer(options);
//     tcpServer.app = tcpServerApp;
//     tcpServer.start(8088)
// }

// { // client
//     let forwardMng = new ClientForwardManager();
//     let tcpClientApp = new Application();
//     tcpClientApp.use(async (ctx: Context, next) => {
//         // logger
//         let tcpEvent = ctx.tcpEvent;
//         let tcpSession = ctx.tcpSession;
//         let socket = tcpSession.socket;
//         console.log(`client remote: ${socket.remoteAddress}:${socket.remotePort} tcpEvent=${tcpEvent}`);
//         await next();
//     })

//     let tcpPacketRouter = new TCPPacketRouter();
//     tcpPacketRouter.use(CMD.Hello, async (ctx: Context, next) => {
//         console.log(`client Receive: Hello`);
//         let tcpSession = ctx.tcpSession;
//         let packet = new TCPPacket()
//         packet.Cmd = CMD.C2S_New_Forward
//         let forwardInfo: ForwardInfo = {
//             type: "tcp",
//             serverPort: 22222,
//             localPort: 33333,
//         }
//         packet.SetJsonData(forwardInfo);
//         tcpSession.write(packet);
//     })

//     tcpPacketRouter.use(CMD.S2C_New_Forward, async (ctx: Context, next) => {
//         let tcpSession = ctx.tcpSession;
//     })

//     tcpPacketRouter.use(CMD.S2C_TCPForward_Connected, async (ctx: Context, next) => {
//         let tcpSession = ctx.tcpSession;
//         let packet = ctx.tcpPacket
//         let tcpForwardConnected: TCPForwardConnected = packet.GetJsonData()
//         forwardMng.NewForward(tcpSession, tcpForwardConnected)
//     })

//     tcpPacketRouter.use(CMD.S2C_TCPForward_Data, async (ctx: Context, next) => {
//         let tcpSession = ctx.tcpSession;
//         let packet = ctx.tcpPacket
//         let tcpForwardData: TCPForwardData = packet.GetJsonData()
//         forwardMng.ForwardData(tcpSession, tcpForwardData)
//     })

//     let tcpEventRouter = new TCPEventRouter();
//     tcpEventRouter.use('packet', tcpPacketRouter.callback())
//     tcpEventRouter.use('ready', async (ctx: Context, next) => {
//         console.log(`client send: Hello`);
//         let tcpSession = ctx.tcpSession;
//         let packet = new TCPPacket()
//         packet.Cmd = CMD.Hello
//         tcpSession.write(packet);
//     })
//     tcpClientApp.use(tcpEventRouter.callback())

//     let clientSocket = new net.Socket();
//     let options: TCPSessionOptions = {
//         isTCPPacket: true,
//         isClient: true,
//         isServer: false,
//     }
//     let tcpSession = new TCPSession(options, tcpClientApp, clientSocket);
//     tcpSession.name = "Client"
//     clientSocket.connect(8088, '127.0.0.1');
// }


// let testRemoteClient = () => { // test

//     let tcpClientApp = new Application();
//     let tcpEventRouter = new TCPEventRouter();
//     tcpEventRouter.use('ready', async (ctx: Context, next) => {
//         console.log(`testRemoteClient ready`);
//         let tcpSession = ctx.tcpSession;
//         tcpSession.writeBuffer('ddd');
//     })
//     tcpClientApp.use(tcpEventRouter.callback())

//     let clientSocket = new net.Socket();
//     let options: TCPSessionOptions = {
//         isTCPPacket: false,
//         isClient: true,
//         isServer: false,
//     }
//     let tcpSession = new TCPSession(options, tcpClientApp, clientSocket);
//     tcpSession.name = "testRemoteClient"
//     clientSocket.connect(22222, '127.0.0.1');

// }
// setTimeout(testRemoteClient, 0);

// let testRemoteClient2 = () => { // test

//     let tcpClientApp = new Application();
//     let tcpEventRouter = new TCPEventRouter();
//     tcpEventRouter.use('ready', async (ctx: Context, next) => {
//         console.log(`testRemoteClient2 ready`);
//         let tcpSession = ctx.tcpSession;
//         tcpSession.writeBuffer('ddd');
//     })
//     tcpClientApp.use(tcpEventRouter.callback())

//     let clientSocket = new net.Socket();
//     let options: TCPSessionOptions = {
//         isTCPPacket: false,
//         isClient: true,
//         isServer: false,
//     }
//     let tcpSession = new TCPSession(options, tcpClientApp, clientSocket);
//     tcpSession.name = "testRemoteClient2"
//     clientSocket.connect(12345, '127.0.0.1');
// }
// setTimeout(testRemoteClient2, 1000);


class TestServer {

    static async StartServer(port: number) {
        let serverApp = new App()
        let serverEventRouter = new TCPEventRouter()
        serverEventRouter.use('data', async (ctx, next) => {
            let tcpSession = ctx.tcpSession
            let tcpBuffer = ctx.tcpBuffer
            let msgStr = tcpBuffer.toString()
            console.log(`Server Receive : ${msgStr}`);
            tcpSession.writeBuffer(`[server replay] : ${msgStr}`);
        })
        serverApp.use(serverEventRouter.callback())

        let serverOptions = new TCPSessionOptions();
        serverOptions.isServer = true;
        serverOptions.isClient = false;
        serverOptions.isTCPPacket = false;
        let tcpServer = new TCPServer(serverOptions);
        tcpServer.setApp(serverApp);
        await tcpServer.start(port)
        return tcpServer
    }

    static async StartClient(port: number, host?: string) {
        host = host ? host : '127.0.0.1'
        let clientApp = new App()
        let clientEventRouter = new TCPEventRouter()
        clientEventRouter.use('data', async (ctx, next) => {
            let tcpSession = ctx.tcpSession
            let tcpBuffer = ctx.tcpBuffer
            let msgStr = tcpBuffer.toString()
            console.log(`Client Receive : ${msgStr}`);
        })
        clientApp.use(clientEventRouter.callback())

        let localOptions = new TCPSessionOptions();
        localOptions.isServer = false;
        localOptions.isClient = true;
        localOptions.isTCPPacket = false;
        let localSession = new TCPSession(localOptions, new net.Socket());
        localSession.setApp(clientApp)
        await localSession.startClient(port, host)
        return localSession
    }
}

let testLocalProxy = async () => {

    {
        let serverApp = new App()
        let serverEventRouter = new TCPEventRouter()
        serverEventRouter.use('data', async (ctx, next) => {
            let tcpSession = ctx.tcpSession
            let tcpBuffer = ctx.tcpBuffer
            let msgStr = tcpBuffer.toString()
            console.log(`Server Receive : ${msgStr}`);
            tcpSession.writeBuffer(`server replay : ${msgStr}`);
        })
        serverApp.use(serverEventRouter.callback())

        let serverOptions = new TCPSessionOptions();
        serverOptions.isServer = true;
        serverOptions.isClient = false;
        serverOptions.isTCPPacket = false;
        let tcpServer = new TCPServer(serverOptions);
        tcpServer.setApp(serverApp);
        await tcpServer.start(11111)
    }

    {
        let localPortForward = new LocalPortForward(22222, 11111);
        await localPortForward.start()
    }

    {
        let localOptions = new TCPSessionOptions();
        localOptions.isServer = false;
        localOptions.isClient = true;
        localOptions.isTCPPacket = false;
        let localSession = new TCPSession(localOptions, new net.Socket());
        await localSession.startClient(22222, '127.0.0.1')

        localSession.writeBuffer('hello localPortForward')
        localSession.close()
        localSession.writeBuffer('close') // will throw error 'ERR_STREAM_WRITE_AFTER_END'
    }

    {
        let remotePortForward = new PortMappingCSide(11111);
        let remoteForwardId = 1;
        await remotePortForward.startNew(remoteForwardId)
        remotePortForward.receiveRightData(Buffer.from('hello remotePortForward'), remoteForwardId)
        remotePortForward.on('leftData', (buffer: Buffer, id: number) => {
            let msgStr = buffer.toString()
            console.log(`Receive : id=${id}, ${msgStr}`);
        });
    }

    {
        let portMappingTest = new PortMappingTest(11111, 33333)
        await portMappingTest.start()

        let localOptions = new TCPSessionOptions();
        localOptions.isServer = false;
        localOptions.isClient = true;
        localOptions.isTCPPacket = false;
        let localSession = new TCPSession(localOptions, new net.Socket());
        await localSession.startClient(33333, '127.0.0.1')

        localSession.writeBuffer('hello portMappingTest')
        setTimeout(() => {
            portMappingTest.close()
            localSession.writeBuffer('hello portMappingTest') // nothing happen
        }, 1000)
    }
}

// testLocalProxy();

let testPortMapping = async () => {
    let forwardInfos: ForwardInfo[] = [
        { id: 1, type: 'tcp', targetAddr: '127.0.0.1', targetPort: 22000, serverPort: 22333 },
        { id: 2, type: 'tcp', targetAddr: '127.0.0.1', targetPort: 33000, serverPort: 33222 },
        { id: 3, type: 'tcp', targetAddr: 'www.google.com', targetPort: 443, serverPort: 443 },
    ];
    await startServer()
    await startClient(forwardInfos)

    setTimeout(async () => {
        let server1 = await TestServer.StartServer(22000)
        let server2 = await TestServer.StartServer(33000)

        let client1 = await TestServer.StartClient(22333)
        let client2 = await TestServer.StartClient(33222)

        // setInterval(async () => {
        //     client2.writeBuffer('dddddd')
        //     client1.writeBuffer('cccccc')
        // }, 100)
        setTimeout(async () => {
            client1.writeBuffer('client1 hello')
            client2.writeBuffer('client2 hello')
        }, 200)

        setTimeout(async () => {
            client1.writeBuffer('client1 hello')
            client2.writeBuffer('client2 hello')
        }, 300)

    }, 1000)
}
testPortMapping();

