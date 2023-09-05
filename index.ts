import net from 'net'
import { App, TCPEventRouter } from './App';
import { ForwardInfo } from './TCPPacket';
import { LocalPortForward, PortMappingCSide, PortMappingTest, TCPServer, TCPSession, TCPSessionOptions } from "./TCPSocket";
import { startServer } from './Server';
import { startClient } from './Client';
import delay from 'delay';

class Tester {

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

    static async StartClient(remotePort: number, remoteAddr = '127.0.0.1') {
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
        await localSession.startClient(remotePort, remoteAddr)
        return localSession
    }
}

let testLocalProxy = async () => {

    { // server 11111
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

    { // localPortForward 22222 --> 11111
        let localPortForward = new LocalPortForward(11111, 22222);
        await localPortForward.start()
    }

    { // client request 22222
        let localOptions = new TCPSessionOptions();
        localOptions.isServer = false;
        localOptions.isClient = true;
        localOptions.isTCPPacket = false;
        let localSession = new TCPSession(localOptions, new net.Socket());
        await localSession.startClient(22222)

        localSession.writeBuffer('hello localPortForward')

        localSession.on('data', (buffer: Buffer) => {
            let msgStr = buffer.toString()
            console.log(`LocalPortForward Client Receive : ${msgStr}`);
        });

        await delay(1000)
        localSession.close()
        localSession.writeBuffer('close') // will throw error 'ERR_STREAM_WRITE_AFTER_END'
    }

    { // PortMappingCSide request 11111
        let remotePortForward = new PortMappingCSide(11111);
        let remoteForwardId = 1;
        await remotePortForward.startNew(remoteForwardId)
        remotePortForward.receiveRightData(Buffer.from('hello portMappingCSide'), remoteForwardId)
        remotePortForward.on('leftData', (buffer: Buffer, id: number) => {
            let msgStr = buffer.toString()
            console.log(`PortMappingCSide Client Receive : id=${id}, ${msgStr}`);
        });
    }

    { // PortMappingTest 33333 --> 11111
        let portMappingTest = new PortMappingTest(11111, 33333)
        await portMappingTest.start()

        let localOptions = new TCPSessionOptions();
        localOptions.isServer = false;
        localOptions.isClient = true;
        localOptions.isTCPPacket = false;
        let localSession = new TCPSession(localOptions, new net.Socket());
        await localSession.startClient(33333)

        localSession.on('data', (buffer: Buffer) => {
            let msgStr = buffer.toString()
            console.log(`PortMappingTest Client Receive : ${msgStr}`);
        });

        localSession.writeBuffer('hello portMappingTest')

        await delay(1000)
        portMappingTest.close()
        localSession.writeBuffer('hello portMappingTest') // nothing happen
    }
}

let testPortMapping = async () => {
    let forwardInfos: ForwardInfo[] = [
        { id: 1, type: 'tcp', targetAddr: '127.0.0.1', targetPort: 22000, serverPort: 22333 },
        { id: 2, type: 'tcp', targetAddr: '127.0.0.1', targetPort: 33000, serverPort: 33222 },
        { id: 3, type: 'tcp', targetAddr: 'www.google.com', targetPort: 443, serverPort: 443 },
    ];
    await startServer()
    await startClient(forwardInfos)

    await delay(1000)

    let server1 = await Tester.StartServer(22000)
    let server2 = await Tester.StartServer(33000)

    let client1 = await Tester.StartClient(22333)
    let client2 = await Tester.StartClient(33222)

    // setInterval(async () => {
    //     client2.writeBuffer('dddddd')
    //     client1.writeBuffer('cccccc')
    // }, 100)

    await delay(100)
    client1.writeBuffer('client1 hello')
    client2.writeBuffer('client2 hello')

    await delay(100)
    client1.writeBuffer('client1 hello')
    client2.writeBuffer('client2 hello')
}

let testSpeed = async () => {
    let forwardInfos: ForwardInfo[] = [
        { id: 1, type: 'tcp', targetAddr: '127.0.0.1', targetPort: 22000, serverPort: 22333 },
    ];
    await startServer()
    await startClient(forwardInfos)

    await delay(500)
    console.log('testSpeed ready')
}

// testLocalProxy();
// testPortMapping();
testSpeed()
// iperf3 -s -p 5555
// iperf3 -c 127.0.0.1 -l 1M -t 5 -p 5666