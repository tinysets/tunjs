import dgram, { RemoteInfo } from 'dgram'
import delay from 'delay';
import { CMD, ForwardInfo, TCPPacket } from './TCPPacket';
import { UDPServer, UDPSession, UDPClient, UDPLocalForward } from './UDPSocket';
import { TCPServer, TCPSession, TCPClient, TCPOptions, TCPLocalForward } from "./TCPSocket";
import { startServer } from './Server';
import { startClient } from './Client';

class Tester {

    static async TCPServer(port: number) {
        let options = new TCPOptions()
        options.usePacket = false
        let tcpServer = new TCPServer(options)
        tcpServer.on('newConnect', (session: TCPSession) => {
            session.on('data', (buffer: Buffer) => {
                console.log(`tcpServer receive : ${buffer.toString()}`)
                session.write(`tcpServer reply : ${buffer.toString()}`)
            })
        })
        tcpServer.setServer(port)
        await tcpServer.start()
        return tcpServer
    }

    static async TCPClient(remotePort: number, remoteAddr = '127.0.0.1') {
        let options = new TCPOptions()
        options.usePacket = false
        let tcpClient = new TCPClient(options)
        tcpClient.on('data', (buffer: Buffer) => {
            console.log(`tcpClient receive : ${buffer.toString()}`)
        })
        tcpClient.setClient(remotePort, remoteAddr)
        await tcpClient.start()
        return tcpClient
    }

    static async UDPServer(port: number, needReply = true) {
        let udpServer = new UDPServer(dgram.createSocket('udp4'))
        if (needReply) {
            udpServer.on('data', (session: UDPSession, buffer: Buffer, rinfo: RemoteInfo) => {
                console.log(`udpServer receive : ${buffer.toString()}`)
                session.write(`udpServer reply : ${buffer.toString()}`)
            })
        }
        udpServer.setServer(port)
        await udpServer.start()
        return udpServer
    }

    static async UDPClient(remotePort: number, remoteAddr = '127.0.0.1', needLog = true) {
        let udpClient = new UDPClient(dgram.createSocket('udp4'))
        if (needLog) {
            udpClient.on('data', (buffer: Buffer) => {
                console.log(`udpClient receive : ${buffer.toString()}`)
            })
        }
        udpClient.setClient(remotePort, remoteAddr)
        await udpClient.start()
        return udpClient
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

    static async StartPacketClient(remotePort: number, remoteAddr = '127.0.0.1') {
        let options = new TCPOptions()
        options.usePacket = true
        let tcpClient = new TCPClient(options)
        tcpClient.setClient(remotePort, remoteAddr)
        await tcpClient.start()
        return tcpClient
    }

    static async StartPacketServer(port: number) {
        let options = new TCPOptions()
        options.usePacket = true
        let tcpServer = new TCPServer(options)
        tcpServer.setServer(port)
        await tcpServer.start()
        return tcpServer
    }

    static initNanoTime: bigint = null
    static NanoNow() {
        if (Tester.initNanoTime == null) {
            Tester.initNanoTime = process.hrtime.bigint(); // nodejs v10 above
        }
        let now = process.hrtime.bigint(); // nodejs v10 above
        return now - Tester.initNanoTime;
    }

    static Now() {
        let nowNano = Tester.NanoNow();
        let now = Number(nowNano) / 1000000;
        // let now = Date.now();
        // console.log(now)
        return now;
    }
}


let testTCPServer = async () => {
    let tcpServer = await Tester.TCPServer(7777)
    let tcpClient = await Tester.TCPClient(7777)

    tcpClient.write('tcp hello1')
    await delay(100)
    tcpClient.write('tcp hello2')
    await delay(100)
    tcpClient.write('tcp hello3')
    await delay(100)
    tcpClient.write('tcp hello4')
    await delay(100)
}
let testTCPLocalForward = async () => {

    let tcpServer = await Tester.TCPServer(7777)

    { // tcp localPortForward 8888 --> 7777
        let localPortForward = new TCPLocalForward(8888, 7777);
        await localPortForward.start()
    }

    let tcpClient = await Tester.TCPClient(8888)

    tcpClient.write('local forward tcp hello1')
    await delay(100)
    tcpClient.write('local forward tcp hello2')
    await delay(100)
    tcpClient.write('local forward tcp hello3')
    await delay(100)
    tcpClient.write('local forward tcp hello4')
    await delay(100)
}
let testTCPLocalForwardSpeed = async () => {

    { // tcp localPortForward 8888 --> 7777
        let localPortForward = new TCPLocalForward(8888, 7777);
        await localPortForward.start()
    }

    // iperf3 -s -p 7777
    // iperf3 -c 127.0.0.1 -b 1000G -t 5 -p 8888

    // native speed
    // [ ID] Interval           Transfer     Bandwidth       Retr
    // [  4]   0.00-5.00   sec  26.8 GBytes  46.1 Gbits/sec    0             sender
    // [  4]   0.00-5.00   sec  26.8 GBytes  46.1 Gbits/sec                  receiver

    // local forward speed
    // [ ID] Interval           Transfer     Bandwidth       Retr
    // [  4]   0.00-5.00   sec  7.89 GBytes  13.5 Gbits/sec    3             sender
    // [  4]   0.00-5.00   sec  7.88 GBytes  13.5 Gbits/sec                  receiver

}
let testTCPPing = async () => {
    let forwardInfos: ForwardInfo[] = [
        { mappingId: 1, type: 'tcp', targetAddr: '127.0.0.1', targetPort: 7777, serverPort: 9999 },
    ];
    await startServer()
    await startClient(forwardInfos)
    await delay(500)

    { // localPortForward 8888 --> 7777
        let localPortForward = new TCPLocalForward(8888, 7777);
        await localPortForward.start()
    }

    { // server 7777
        let server = await Tester.StartPacketServer(7777);
        server.on("newConnect", (session: TCPSession) => {
            session.on('packet', (packet: TCPPacket) => {
                if (packet.Cmd == CMD.Ping) {
                    session.writePacket(packet);
                }
            })
        })
    }

    { // client request 7777
        let rtts: number[] = []
        let tcpClient = await Tester.StartPacketClient(7777);
        tcpClient.on('packet', (packet: TCPPacket) => {
            if (packet.Cmd == CMD.Ping) {
                let sendTime = packet.GetJsonData().time;
                let currTime = Tester.Now();
                let rtt = currTime - sendTime;
                rtts.push(Number(rtt));
            }
        })

        await Tester.Loop(() => {
            let packet = new TCPPacket();
            packet.Cmd = CMD.Ping
            packet.SetJsonData({ time: Tester.Now().toString() });
            tcpClient.writePacket(packet)
        }, 100, 10);

        await delay(100);
        let totel = rtts.reduce((a, b) => {
            return a + b
        }, 0);
        let avg = totel / rtts.length
        console.log(`tcp native avg rtt = ${avg.toFixed(3)}ms`)
    }

    { // client request 8888
        let rtts: number[] = []
        let tcpClient = await Tester.StartPacketClient(8888);
        tcpClient.on('packet', (packet: TCPPacket) => {
            if (packet.Cmd == CMD.Ping) {
                let sendTime = packet.GetJsonData().time;
                let currTime = Tester.Now();
                let rtt = currTime - sendTime;
                rtts.push(Number(rtt));
            }
        })

        await Tester.Loop(() => {
            let packet = new TCPPacket();
            packet.Cmd = CMD.Ping
            packet.SetJsonData({ time: Tester.Now().toString() });
            tcpClient.writePacket(packet)
        }, 100, 10);

        await delay(100);
        let totel = rtts.reduce((a, b) => {
            return a + b
        }, 0);
        let avg = totel / rtts.length
        console.log(`tcp local proxy avg rtt = ${avg.toFixed(3)}ms`)
    }

    { // client request 9999
        let rtts: number[] = []
        let tcpClient = await Tester.StartPacketClient(9999);
        tcpClient.on('packet', (packet: TCPPacket) => {
            if (packet.Cmd == CMD.Ping) {
                let sendTime = packet.GetJsonData().time;
                let currTime = Tester.Now();
                let rtt = currTime - sendTime;
                rtts.push(Number(rtt));
            }
        })

        await Tester.Loop(() => {
            let packet = new TCPPacket();
            packet.Cmd = CMD.Ping
            packet.SetJsonData({ time: Tester.Now().toString() });
            tcpClient.writePacket(packet)
        }, 100, 10);

        await delay(100);
        let totel = rtts.reduce((a, b) => {
            return a + b
        }, 0);
        let avg = totel / rtts.length
        console.log(`tcp remote proxy avg rtt = ${avg.toFixed(3)}ms`)
    }

    // result
    // tcp native avg rtt = 0.493ms
    // tcp local proxy avg rtt = 0.786ms
    // tcp remote proxy avg rtt = 1.118ms
}

let testTCPRemotePortMapping = async () => {
    let forwardInfos: ForwardInfo[] = [
        { mappingId: 1, type: 'tcp', targetAddr: '127.0.0.1', targetPort: 7777, serverPort: 9999 },
        { mappingId: 2, type: 'tcp', targetAddr: '127.0.0.1', targetPort: 8880, serverPort: 80 },
        { mappingId: 3, type: 'tcp', targetAddr: 'www.google.com', targetPort: 443, serverPort: 443 },
    ];
    await startServer()
    await startClient(forwardInfos)

    await delay(1000)

    let server1 = await Tester.TCPServer(7777)
    let client1 = await Tester.TCPClient(9999)

    let server2 = await Tester.TCPServer(8880)
    let client2 = await Tester.TCPClient(80)

    // setInterval(async () => {
    //     client2.write('dddddd')
    //     client1.write('cccccc')
    // }, 100)

    await delay(100)
    client1.write('client1 hello')
    client2.write('client2 hello')

    await delay(100)
    client1.write('client1 hello')
    client2.write('client2 hello')
}
let testUDPServer = async () => {

    let udpServer = await Tester.UDPServer(7777)
    let udpClient = await Tester.UDPClient(7777)

    udpClient.write('udp hello1')
    udpClient.write('udp hello2')
    udpClient.write('udp hello3')
    udpClient.write('udp hello4')
}
let testUDPLocalForward = async () => {

    let udpServer = await Tester.UDPServer(7777)

    { // udp localPortForward 8888 --> 7777
        let udpLocalForward = new UDPLocalForward(8888, 7777);
        await udpLocalForward.start()
    }

    let udpClient = await Tester.UDPClient(8888)

    udpClient.write('local forward udp hello1')
    udpClient.write('local forward udp hello2')
    udpClient.write('local forward udp hello3')
    udpClient.write('local forward udp hello4')
}
let testUDPLocalForwardSpeed = async () => {

    { // tcp localPortForward 8888 --> 7777
        let localPortForward = new TCPLocalForward(8888, 7777);
        await localPortForward.start()
    }

    { // udp localPortForward 8888 --> 7777
        let udpLocalForward = new UDPLocalForward(8888, 7777);
        await udpLocalForward.start()
    }

    // iperf3 -s -p 7777
    // iperf3 -c 127.0.0.1 -b 1000G -t 5 -u -p 8888

    // native speed
    // [ ID] Interval           Transfer     Bandwidth       Jitter    Lost/Total Datagrams
    // [  4]   0.00-5.00   sec  15.3 GBytes  26.2 Gbits/sec  0.052 ms  214146/748612 (29%)  
    // [  4] Sent 748612 datagrams

    // local forward speed
    // [ ID] Interval           Transfer     Bandwidth       Jitter    Lost/Total Datagrams
    // [  4]   0.00-5.00   sec  15.9 GBytes  27.4 Gbits/sec  0.876 ms  776224/780757 (99%)  
    // [  4] Sent 780757 datagrams

}

let testUDPPing = async () => {
    let forwardInfos: ForwardInfo[] = [
        { mappingId: 1, type: 'udp', targetAddr: '127.0.0.1', targetPort: 7777, serverPort: 9999 },
    ];
    await startServer()
    await startClient(forwardInfos)
    await delay(500)

    { // localPortForward 8888 --> 7777
        let localPortForward = new UDPLocalForward(8888, 7777);
        await localPortForward.start()
    }

    { // server 7777
        let server = await Tester.UDPServer(7777, false);
        server.on("newConnect", (session: TCPSession) => {
            session.on('data', (buffer: Buffer) => {
                session.write(buffer);
            })
        })
    }

    { // client request 7777
        let rtts: number[] = []
        let udpClient = await Tester.UDPClient(7777, '127.0.0.1', false);
        udpClient.on('data', (buffer: Buffer) => {
            let sendTime = JSON.parse(buffer.toString()).time;
            let currTime = Tester.Now();
            let rtt = currTime - sendTime;
            rtts.push(Number(rtt));
        })

        await Tester.Loop(() => {
            udpClient.write(JSON.stringify({ time: Tester.Now().toString() }))
        }, 100, 10);

        await delay(100);
        let totel = rtts.reduce((a, b) => {
            return a + b
        }, 0);
        let avg = totel / rtts.length
        console.log(`udp native avg rtt = ${avg.toFixed(3)}ms`)
    }

    { // client request 8888
        let rtts: number[] = []
        let udpClient = await Tester.UDPClient(8888, '127.0.0.1', false);
        udpClient.on('data', (buffer: Buffer) => {
            let sendTime = JSON.parse(buffer.toString()).time;
            let currTime = Tester.Now();
            let rtt = currTime - sendTime;
            rtts.push(Number(rtt));
        })

        await Tester.Loop(() => {
            udpClient.write(JSON.stringify({ time: Tester.Now().toString() }))
        }, 100, 10);

        await delay(100);
        let totel = rtts.reduce((a, b) => {
            return a + b
        }, 0);
        let avg = totel / rtts.length
        console.log(`udp local proxy avg rtt = ${avg.toFixed(3)}ms`)
    }

    { // client request 9999
        let rtts: number[] = []
        let udpClient = await Tester.UDPClient(9999, '127.0.0.1', false);
        udpClient.on('data', (buffer: Buffer) => {
            let sendTime = JSON.parse(buffer.toString()).time;
            let currTime = Tester.Now();
            let rtt = currTime - sendTime;
            rtts.push(Number(rtt));
        })

        await Tester.Loop(() => {
            udpClient.write(JSON.stringify({ time: Tester.Now().toString() }))
        }, 100, 10);

        await delay(100);
        let totel = rtts.reduce((a, b) => {
            return a + b
        }, 0);
        let avg = totel / rtts.length
        console.log(`udp remote proxy avg rtt = ${avg.toFixed(3)}ms`)
    }

    // result
    // udp native avg rtt = 0.472ms
    // udp local proxy avg rtt = 0.624ms
    // udp remote proxy avg rtt = 1.083ms
}

let testUDPRemotePortMapping = async () => {
    let forwardInfos: ForwardInfo[] = [
        { mappingId: 1, type: 'udp', targetAddr: '127.0.0.1', targetPort: 7777, serverPort: 9999 },
    ];
    await startServer()
    await startClient(forwardInfos)

    await delay(1000)

    let server1 = await Tester.UDPServer(7777)
    let client1 = await Tester.UDPClient(9999)

    // setInterval(async () => {
    //     client2.write('dddddd')
    //     client1.write('cccccc')
    // }, 100)

    await delay(100)
    client1.write('client1 hello')

    await delay(100)
    client1.write('client1 hello')
}

let testRemoteForwardSpeed = async () => {
    // on linux
    // iperf3 -s -p 7777
    // iperf3 -c 127.0.0.1 -b 1000G -t 5 -p 9999
    // iperf3 -c 127.0.0.1 -b 1000G -t 5 -p 9999 -u

    let forwardInfos: ForwardInfo[] = [
        { mappingId: 1, type: 'tcp', targetAddr: '10.21.248.180', targetPort: 7777, serverPort: 9999 },
        { mappingId: 2, type: 'udp', targetAddr: '10.21.248.180', targetPort: 7777, serverPort: 9999 },
    ];

    if (process.platform == 'linux') {
        await startServer()
    } else if (process.platform == 'win32') {
        await startClient(forwardInfos, 7666, '10.21.248.180')
    }
    // iperf3 -c 127.0.0.1 -b 1000G -t 5 -p 9999 -u
    // udp proxy client
    // [ ID] Interval           Transfer     Bandwidth       Jitter    Lost/Total Datagrams
    // [  4]   0.00-5.00   sec  11.6 GBytes  19.9 Gbits/sec  0.345 ms  499174/569332 (88%)  
    // [  4] Sent 569332 datagrams
    // udp proxy server
    // [ ID] Interval           Transfer     Bandwidth       Jitter    Lost/Total Datagrams
    // [  5]   0.00-22.56  sec  0.00 Bytes  0.00 bits/sec  0.345 ms  499174/569332 (88%)  

    // iperf3 -c 127.0.0.1 -b 1000G -t 5 -p 7777 -u
    // udp native client
    // [ ID] Interval           Transfer     Bandwidth       Jitter    Lost/Total Datagrams
    // [  4]   0.00-5.00   sec  15.0 GBytes  25.7 Gbits/sec  0.001 ms  179984/734898 (24%)  
    // [  4] Sent 734898 datagrams
    // udp native server
    // [ ID] Interval           Transfer     Bandwidth       Jitter    Lost/Total Datagrams
    // [  5]   0.00-5.04   sec  0.00 Bytes  0.00 bits/sec  0.001 ms  179984/734898 (24%)  

    // iperf3 -c 127.0.0.1 -b 1000G -t 5 -p 9999
    // tcp proxy client
    // [ ID] Interval           Transfer     Bandwidth       Retr
    // [  4]   0.00-5.01   sec  2.24 GBytes  3.84 Gbits/sec    0             sender
    // [  4]   0.00-5.01   sec   840 MBytes  1.40 Gbits/sec                  receiver
    // tcp proxy server
    // [ ID] Interval           Transfer     Bandwidth
    // [  5]   0.00-34.33  sec  0.00 Bytes  0.00 bits/sec                  sender
    // [  5]   0.00-34.33  sec   840 MBytes   205 Mbits/sec                  receiver

    // iperf3 -c 127.0.0.1 -b 1000G -t 5 -p 7777
    // tcp native client
    // [ ID] Interval           Transfer     Bandwidth       Retr
    // [  4]   0.00-5.00   sec  25.5 GBytes  43.8 Gbits/sec    2             sender
    // [  4]   0.00-5.00   sec  25.5 GBytes  43.8 Gbits/sec                  receiver
    // tcp native server
    // [ ID] Interval           Transfer     Bandwidth
    // [  5]   0.00-5.04   sec  0.00 Bytes  0.00 bits/sec                  sender
    // [  5]   0.00-5.04   sec  25.5 GBytes  43.4 Gbits/sec                  receiver

}


let main = async () => {
    // testTCPServer();
    // testTCPLocalForward();
    // testTCPLocalForwardSpeed()
    // await testTCPPing()
    // testTCPRemotePortMapping()

    // testUDPServer();
    // testUDPLocalForward();
    // testUDPLocalForwardSpeed()
    // await testUDPPing()
    // testUDPRemotePortMapping()

    testRemoteForwardSpeed()

}

main();