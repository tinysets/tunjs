import dgram from 'dgram'
import { Pipe } from "../Common/Pipe"
import { TCPClient } from "../Socket/TCPClient"
import { TCPOptions, TCPServer, TCPSession } from "../Socket/TCPServer"
import { UDPServer, UDPSession } from "../Socket/UDPServer"
import { UDPClient } from '../Socket/UDPClient'


export class TCPLocalTunnel {
    leftPort: number
    leftAddr: string
    rightPort: number
    server: TCPServer
    constructor(sourcePort: number, targetPort: number, targetAddr = '127.0.0.1') {
        this.leftPort = targetPort
        this.leftAddr = targetAddr
        this.rightPort = sourcePort
    }

    async start() {
        let options = new TCPOptions()
        options.usePacket = false
        let tunnelServer = new TCPServer(options)
        tunnelServer.on('newConnect', (session: TCPSession) => {
            let tcpClient = new TCPClient(options)
            tcpClient.setClient(this.leftPort, this.leftAddr)
            let pipe = new Pipe(tcpClient, session);
            pipe.link()
        })
        tunnelServer.setServer(this.rightPort)
        this.server = tunnelServer;
        let succ = await tunnelServer.start()
        if (!succ) {
            console.error(`TCPLocalTunnel start failed! leftPort:${this.leftPort}, leftAddr:${this.leftAddr}, rightPort(serverPort):${this.rightPort}`);
        } else {
            console.error(`TCPLocalTunnel start success! leftPort:${this.leftPort}, leftAddr:${this.leftAddr}, rightPort(serverPort):${this.rightPort}`);
        }
    }
}



export class UDPLocalTunnel {
    leftPort: number
    leftAddr: string
    rightPort: number
    server: UDPServer
    constructor(sourcePort: number, targetPort: number, targetAddr = '127.0.0.1') {
        this.leftPort = targetPort
        this.leftAddr = targetAddr
        this.rightPort = sourcePort
    }

    async start() {
        let tunnelServer = new UDPServer(dgram.createSocket('udp4'))
        tunnelServer.on('newConnect', (session: UDPSession) => {
            let udpClient = new UDPClient(dgram.createSocket('udp4'))
            udpClient.setClient(this.leftPort, this.leftAddr)
            let pipe = new Pipe(udpClient, session);
            pipe.link()
        })
        tunnelServer.setServer(this.rightPort)
        this.server = tunnelServer;
        let succ = await tunnelServer.start()
        if (!succ) {
            console.error(`UDPLocalTunnel start failed! leftPort:${this.leftPort}, leftAddr:${this.leftAddr}, rightPort(serverPort):${this.rightPort}`);
        } else {
            console.info(`UDPLocalTunnel start success! leftPort:${this.leftPort}, leftAddr:${this.leftAddr}, rightPort(serverPort):${this.rightPort}`);
        }
    }
}