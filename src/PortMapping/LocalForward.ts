import dgram, { RemoteInfo } from 'dgram'
import { Pipe } from "../Common/Pipe"
import { TCPClient } from "../Socket/TCPClient"
import { TCPOptions, TCPServer, TCPSession } from "../Socket/TCPServer"
import { UDPClient, UDPServer, UDPSession } from "../Socket/UDPSocket"


export class TCPLocalForward {
    leftPort: number
    leftAddr: string
    rightPort: number
    server: TCPServer
    constructor(fromPort: number, targetPort: number, targetAddr = '127.0.0.1') {
        this.leftPort = targetPort
        this.leftAddr = targetAddr
        this.rightPort = fromPort
    }

    async start() {
        let options = new TCPOptions()
        options.usePacket = false
        let forwardServer = new TCPServer(options)
        forwardServer.on('newConnect', (session: TCPSession) => {
            let tcpClient = new TCPClient(options)
            tcpClient.setClient(this.leftPort, this.leftAddr)
            let pipe = new Pipe(tcpClient, session);
            pipe.link()
        })
        forwardServer.setServer(this.rightPort)
        this.server = forwardServer;
        let succ = await forwardServer.start()
        if (!succ) {
            console.error('本地代理启动失败!');
        } else {
            console.log(`local tcp proxy server port:${this.rightPort}`);
        }
    }
}



export class UDPLocalForward {
    leftPort: number
    leftAddr: string
    rightPort: number
    server: UDPServer
    constructor(fromPort: number, targetPort: number, targetAddr = '127.0.0.1') {
        this.leftPort = targetPort
        this.leftAddr = targetAddr
        this.rightPort = fromPort
    }

    async start() {
        let forwardServer = new UDPServer(dgram.createSocket('udp4'))
        forwardServer.on('newConnect', (session: UDPSession) => {
            let udpClient = new UDPClient(dgram.createSocket('udp4'))
            udpClient.setClient(this.leftPort, this.leftAddr)
            let pipe = new Pipe(udpClient, session);
            pipe.link()
        })
        forwardServer.setServer(this.rightPort)
        this.server = forwardServer;
        let succ = await forwardServer.start()
        if (!succ) {
            console.error('本地代理启动失败!');
        } else {
            console.log(`local udp proxy server port:${this.rightPort}`);
        }
    }
}