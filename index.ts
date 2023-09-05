import net from 'net'
import { App, Context, TCPEventRouter, TCPPacketRouter } from './App';
import { CMD, ForwardInfo, TCPPacket } from './TCPPacket';
import { LocalPortForward, PortMappingCSide, PortMappingTest, TCPServer, TCPSession, TCPSessionOptions } from "./TCPSocket";
import { startServer } from './Server';
import { startClient } from './Client';
import delay from 'delay';

class Tester {

    static async StartServer(port: number) {
        let app = new App()
        let eventRouter = new TCPEventRouter()
        eventRouter.use('data', async (ctx, next) => {
            let tcpSession = ctx.tcpSession
            let tcpBuffer = ctx.tcpBuffer
            let msgStr = tcpBuffer.toString()
            console.log(`Server Receive : ${msgStr}`);
            tcpSession.writeBuffer(`[server replay] : ${msgStr}`);
        })
        app.use(eventRouter.callback())

        let options = new TCPSessionOptions();
        options.isServer = true;
        options.isClient = false;
        options.isTCPPacket = false;
        let tcpServer = new TCPServer(options);
        tcpServer.setApp(app);
        await tcpServer.start(port)
        return tcpServer
    }

    static async StartClient(remotePort: number, remoteAddr = '127.0.0.1') {
        let app = new App()
        let eventRouter = new TCPEventRouter()
        eventRouter.use('data', async (ctx, next) => {
            let tcpSession = ctx.tcpSession
            let tcpBuffer = ctx.tcpBuffer
            let msgStr = tcpBuffer.toString()
            console.log(`Client Receive : ${msgStr}`);
        })
        app.use(eventRouter.callback())

        let options = new TCPSessionOptions();
        options.isServer = false;
        options.isClient = true;
        options.isTCPPacket = false;
        let tcpClient = new TCPSession(options, new net.Socket());
        tcpClient.setApp(app)
        await tcpClient.startClient(remotePort, remoteAddr)
        return tcpClient
    }

    static async Loop(fn: () => void, times: number, interval: number) {
        let p = new Promise<void>((resolve, reject) => {
            let count = 0
            let timer = setInterval(() => {
                fn();
                count++
                if (count >= times) {
                    clearInterval(timer);
                    resolve();
                }
            }, interval)
        })
        return p;
    }

    static async StartPacketClient(packetRouter: TCPPacketRouter, remotePort: number, remoteAddr = '127.0.0.1') {
        let app = new App()
        let eventRouter = new TCPEventRouter()
        eventRouter.use('packet', packetRouter.callback())
        app.use(eventRouter.callback())
        let options = new TCPSessionOptions();
        options.isServer = false;
        options.isClient = true;
        options.isTCPPacket = true;
        let tcpClient = new TCPSession(options, new net.Socket());
        tcpClient.setApp(app)
        await tcpClient.startClient(remotePort, remoteAddr)
        return tcpClient
    }

    static async StartPacketServer(packetRouter: TCPPacketRouter, port: number) {
        let app = new App()
        let eventRouter = new TCPEventRouter()
        eventRouter.use('packet', packetRouter.callback())
        app.use(eventRouter.callback())
        let options = new TCPSessionOptions();
        options.isServer = true;
        options.isClient = false;
        options.isTCPPacket = true;
        let tcpServer = new TCPServer(options);
        tcpServer.setApp(app);
        await tcpServer.start(port)
        return tcpServer
    }

}

let testLocalProxy = async () => {

    { // server 11111
        let app = new App()
        let eventRouter = new TCPEventRouter()
        eventRouter.use('data', async (ctx, next) => {
            let tcpSession = ctx.tcpSession
            let tcpBuffer = ctx.tcpBuffer
            let msgStr = tcpBuffer.toString()
            console.log(`Server Receive : ${msgStr}`);
            tcpSession.writeBuffer(`server replay : ${msgStr}`);
        })
        app.use(eventRouter.callback())

        let options = new TCPSessionOptions();
        options.isServer = true;
        options.isClient = false;
        options.isTCPPacket = false;
        let tcpServer = new TCPServer(options);
        tcpServer.setApp(app);
        await tcpServer.start(11111)
    }

    { // localPortForward 22222 --> 11111
        let localPortForward = new LocalPortForward(11111, 22222);
        await localPortForward.start()
    }

    { // client request 22222
        let options = new TCPSessionOptions();
        options.isServer = false;
        options.isClient = true;
        options.isTCPPacket = false;
        let tcpClient = new TCPSession(options, new net.Socket());
        await tcpClient.startClient(22222)

        tcpClient.writeBuffer('hello localPortForward')

        tcpClient.on('data', (buffer: Buffer) => {
            let msgStr = buffer.toString()
            console.log(`LocalPortForward Client Receive : ${msgStr}`);
        });

        await delay(1000)
        tcpClient.close()
        tcpClient.writeBuffer('close') // will throw error 'ERR_STREAM_WRITE_AFTER_END'
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

        let options = new TCPSessionOptions();
        options.isServer = false;
        options.isClient = true;
        options.isTCPPacket = false;
        let tcpClient = new TCPSession(options, new net.Socket());
        await tcpClient.startClient(33333)

        tcpClient.on('data', (buffer: Buffer) => {
            let msgStr = buffer.toString()
            console.log(`PortMappingTest Client Receive : ${msgStr}`);
        });

        tcpClient.writeBuffer('hello portMappingTest')

        await delay(1000)
        portMappingTest.close()
        tcpClient.writeBuffer('hello portMappingTest') // nothing happen
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

    { // localPortForward 22222 --> 22000
        let localPortForward = new LocalPortForward(22000, 22222);
        await localPortForward.start()
    }

    await delay(500)
    console.log('testSpeed ready')
}

let testTCPPing = async () => {
    let forwardInfos: ForwardInfo[] = [
        { id: 1, type: 'tcp', targetAddr: '127.0.0.1', targetPort: 11111, serverPort: 22222 },
    ];
    await startServer()
    await startClient(forwardInfos)
    await delay(500)
    console.log('testTCPPing ready')

    { // server 11111
        let packetRouter = new TCPPacketRouter();
        packetRouter.use(CMD.Ping, async (ctx: Context, next) => {
            let tcpSession = ctx.tcpSession
            let tcpPacket = ctx.tcpPacket
            tcpSession.write(tcpPacket);
        })
        await Tester.StartPacketServer(packetRouter, 11111);
    }

    { // client request 11111
        let rtts: number[] = []
        let packetRouter = new TCPPacketRouter();
        packetRouter.use(CMD.Ping, async (ctx: Context, next) => {
            let tcpPacket = ctx.tcpPacket
            let sendTime = tcpPacket.GetJsonData().time;
            let currTime = Date.now();
            let rtt = currTime - sendTime;
            rtts.push(rtt);
        })
        let tcpClient = await Tester.StartPacketClient(packetRouter, 11111);

        await Tester.Loop(() => {
            let packet = new TCPPacket();
            packet.Cmd = CMD.Ping
            packet.SetJsonData({ time: Date.now() });
            tcpClient.write(packet)
        }, 100, 10);

        await delay(100);
        let totle = rtts.reduce((a, b) => {
            return a + b
        }, 0);
        let avg = totle / rtts.length
        console.log(`native avg rtt = ${avg}ms`)
    }

    { // client request 22222
        let rtts: number[] = []
        let packetRouter = new TCPPacketRouter();
        packetRouter.use(CMD.Ping, async (ctx: Context, next) => {
            let tcpPacket = ctx.tcpPacket
            let sendTime = tcpPacket.GetJsonData().time;
            let currTime = Date.now();
            let rtt = currTime - sendTime;
            rtts.push(rtt);
        })
        let tcpClient = await Tester.StartPacketClient(packetRouter, 22222);

        await Tester.Loop(() => {
            let packet = new TCPPacket();
            packet.Cmd = CMD.Ping
            packet.SetJsonData({ time: Date.now() });
            tcpClient.write(packet)
        }, 100, 10);

        await delay(100);
        let totle = rtts.reduce((a, b) => {
            return a + b
        }, 0);
        let avg = totle / rtts.length
        console.log(`proxy avg rtt = ${avg}ms`)
    }

}

// testLocalProxy();
// testPortMapping();
// testSpeed()
testTCPPing()

// remote proxy speed
// iperf3 -s -p 22000
// iperf3 -c 127.0.0.1 -l 1M -t 5 -p 22333
// [ ID] Interval           Transfer     Bandwidth       Retr
// [  4]   0.00-5.00   sec  1.72 GBytes  2.96 Gbits/sec    3             sender
// [  4]   0.00-5.00   sec  1.71 GBytes  2.94 Gbits/sec                  receiver

// local proxy speed
// iperf3 -s -p 22000
// iperf3 -c 127.0.0.1 -l 1M -t 5 -p 22222
// [ ID] Interval           Transfer     Bandwidth       Retr
// [  4]   0.00-5.00   sec  8.04 GBytes  13.8 Gbits/sec    2             sender
// [  4]   0.00-5.00   sec  8.02 GBytes  13.8 Gbits/sec                  receiver

// native speed
// iperf3 -s -p 22000
// iperf3 -c 127.0.0.1 -l 1M -t 5 -p 22000
// [ ID] Interval           Transfer     Bandwidth       Retr
// [  4]   0.00-5.00   sec  28.1 GBytes  48.2 Gbits/sec    9             sender
// [  4]   0.00-5.00   sec  28.1 GBytes  48.2 Gbits/sec                  receiver