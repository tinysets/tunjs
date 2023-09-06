import Emitter from 'events'
import net from 'net'
import once from 'once'
import { CMD, TCPBufferHandler, TCPDataPacket, TCPPacket } from './TCPPacket';
import { EndPoint, Pipe } from './UDPSocket';

export class TCPOptions {
    usePacket: boolean = false;
}

export class TCPServer extends Emitter {
    server: net.Server | null;
    options: TCPOptions;
    port: number;
    constructor(options: TCPOptions) {
        super();
        this.options = options;
        let oriEmitCloseEventFn = this.emitCloseEventOnce.bind(this);
        this.emitCloseEventOnce = once(oriEmitCloseEventFn)
    }

    setServer(port: number) {
        this.port = port
    }

    async start() {
        let promise = new Promise<boolean>((resolve, reject) => {
            resolve = once(resolve)
            reject = once(reject)

            let server = this.server = new net.Server();
            server.on('listening', () => {
                this.onReady()
                resolve(true);
            });
            server.on('error', (err) => {
                this.onError(err)
                resolve(false);
            });
            server.on('close', () => {
                this.onClose();
            });

            server.on('connection', (socket) => {
                let session = new TCPSession(this.options, socket)
                this.emit('newConnect', session)
            });
            server.listen(this.port);
        });
        return promise
    }

    protected onError(error: Error) {
        console.error(error);
        this.server.close();
        this.emitCloseEventOnce();
    }
    protected onReady() {
        this.emit('ready')
    }
    protected onClose() {
        this.emitCloseEventOnce();
    }
    protected emitCloseEventOnce() {
        this.emit('close')
    }

    close() {
        this.server.close();
    }

    on(...args: [event: string, listener: (...args: any[]) => void] |
    [event: 'close', listener: () => void] |
    [event: 'ready', listener: () => void] |
    [event: 'newConnect', listener: (session: TCPSession) => void]
    ): this {
        super.on.call(this, ...args)
        return this
    }

    once(...args: [event: string, listener: (...args: any[]) => void] |
    [event: 'close', listener: () => void] |
    [event: 'ready', listener: () => void] |
    [event: 'newConnect', listener: (session: TCPSession) => void]
    ): this {
        super.once.call(this, ...args)
        return this
    }
}

export interface TCPPacketable {
    writePacket(packet: TCPPacket)
    on(event: 'packet', listener: (packet: TCPPacket) => void): this;
    once(event: 'packet', listener: (packet: TCPPacket) => void): this;
    off(eventName: string | symbol, listener: (...args: any[]) => void): this;
}

export class TCPSession extends Emitter implements EndPoint, TCPPacketable {
    isReady: boolean = true;
    isClosed: boolean = false;

    options: TCPOptions;
    socket: net.Socket
    private bufferHandler: TCPBufferHandler = new TCPBufferHandler()

    constructor(options: TCPOptions, socket: net.Socket) {
        super();
        this.options = options;
        this.socket = socket;
        let oriEmitCloseEventFn = this.emitCloseEventOnce.bind(this);
        this.emitCloseEventOnce = once(oriEmitCloseEventFn)

        socket.on("error", (error) => {
            this.onError(error);
        });
        socket.on("close", () => {
            this.onClose();
        });
        socket.on("end", () => {
            this.onEnd();
        });
        socket.on("timeout", () => {
            this.onTimeout();
        });
        socket.on("data", (data) => {
            this.onData(data);
        });
    }

    async start() {
        if (this.isClosed) {
            let promise = new Promise<boolean>((resolve, reject) => {
                resolve(false)
            })
            return promise
        }

        let promise = new Promise<boolean>((resolve, reject) => {
            resolve(true)
        })
        return promise
    }

    private onClose() {
        this.emitCloseEventOnce();
    }
    private onEnd() {
        this.emitCloseEventOnce();
    }
    private onError(error: Error) {
        console.error(error);
        this.socket.destroy();
        this.emitCloseEventOnce();
    }
    private onTimeout() {
        this.socket.destroy();
        this.emitCloseEventOnce();
    }
    private emitCloseEventOnce() {
        this.isClosed = true;
        this.emit('close')
    }

    private onData(buffer: Buffer) {
        this.emit('data', buffer)
        if (this.options.usePacket) {
            this.bufferHandler.put(buffer);
            while (true) {
                let tcpPacket = this.bufferHandler.tryGetMsgPacket()
                if (tcpPacket) {
                    this.emit('packet', tcpPacket)
                } else {
                    break;
                }
            }
        }
    }

    write(buffer: Uint8Array | string) {
        if (buffer)
            if (this.isReady && !this.isClosed)
                this.socket.write(buffer);
    }

    writePacket(packet: TCPPacket) {
        if (packet)
            if (this.isReady && !this.isClosed)
                this.socket.write(packet.GetSendBuffer());
    }

    close() {
        this.socket.end();
        this.socket.destroy();
    }

    on(...args: [event: string, listener: (...args: any[]) => void] |
    [event: 'close', listener: () => void] |
    [event: 'data', listener: (buffer: Buffer) => void] |
    [event: 'packet', listener: (packet: TCPPacket) => void]
    ): this {
        super.on.call(this, ...args)
        return this
    }

    once(...args: [event: string, listener: (...args: any[]) => void] |
    [event: 'close', listener: () => void] |
    [event: 'data', listener: (buffer: Buffer) => void] |
    [event: 'packet', listener: (packet: TCPPacket) => void]
    ): this {
        super.once.call(this, ...args)
        return this
    }
}


export class TCPClient extends Emitter implements EndPoint, TCPPacketable {
    isReady: boolean = false;
    isClosed: boolean = false;

    address: string
    port: number

    options: TCPOptions;
    socket: net.Socket
    private bufferHandler: TCPBufferHandler = new TCPBufferHandler()
    constructor(options: TCPOptions) {
        super();
        this.options = options
        this.socket = new net.Socket()
        let oriEmitCloseEventFn = this.emitCloseEventOnce.bind(this);
        this.emitCloseEventOnce = once(oriEmitCloseEventFn)
    }

    setClient(port: number, address = '127.0.0.1') {
        this.port = port
        this.address = address
    }

    async start() {
        if (this.isClosed) {
            let promise = new Promise<boolean>((resolve, reject) => {
                resolve(false)
            })
            return promise
        }
        if (this.isReady) {
            let promise = new Promise<boolean>((resolve, reject) => {
                resolve(true)
            })
            return promise
        }
        let promise = new Promise<boolean>((resolve, reject) => {
            resolve = once(resolve)
            reject = once(reject)

            let socket = this.socket
            socket.on("error", (error) => {
                this.onError(error);
                resolve(false)
            });
            socket.on("close", () => {
                this.onClose();
            });
            socket.on("end", () => {
                this.onClose();
            });
            socket.on("timeout", () => {
                this.onClose();
                resolve(false)
            });
            socket.on("ready", () => {
                this.onReady();
                resolve(true)
            });
            socket.on("data", (data) => {
                this.onData(data);
            });
            socket.connect(this.port, this.address)
        });
        return promise
    }

    protected onError(error: Error) {
        console.error(error);
        this.socket.destroy();
        this.emitCloseEventOnce();
    }
    protected onReady() {
        this.isReady = true;
        this.emit('ready')
    }
    protected onClose() {
        this.emitCloseEventOnce();
    }
    protected emitCloseEventOnce() {
        this.isClosed = true;
        this.emit('close')
    }
    private onData(buffer: Buffer) {
        this.emit('data', buffer)
        if (this.options.usePacket) {
            this.bufferHandler.put(buffer);
            while (true) {
                let tcpPacket = this.bufferHandler.tryGetMsgPacket()
                if (tcpPacket) {
                    this.emit('packet', tcpPacket)
                } else {
                    break;
                }
            }
        }
    }

    write(buffer: Uint8Array | string) {
        if (buffer)
            if (this.isReady && !this.isClosed)
                this.socket.write(buffer);
    }

    writePacket(packet: TCPPacket) {
        if (packet)
            if (this.isReady && !this.isClosed)
                this.socket.write(packet.GetSendBuffer());
    }

    close() {
        this.socket.end();
        this.socket.destroy();
    }

    on(...args: [event: string, listener: (...args: any[]) => void] |
    [event: 'close', listener: () => void] |
    [event: 'ready', listener: () => void] |
    [event: 'data', listener: (buffer: Buffer) => void] |
    [event: 'packet', listener: (packet: TCPPacket) => void]
    ): this {
        super.on.call(this, ...args)
        return this
    }

    once(...args: [event: string, listener: (...args: any[]) => void] |
    [event: 'close', listener: () => void] |
    [event: 'ready', listener: () => void] |
    [event: 'data', listener: (buffer: Buffer) => void] |
    [event: 'packet', listener: (packet: TCPPacket) => void]
    ): this {
        super.once.call(this, ...args)
        return this
    }
}

export class TCPLocalForward {
    leftPort: number
    leftAddr: string
    rightPort: number
    server: TCPServer
    constructor(fromPort: number, toPort: number, toAddr = '127.0.0.1') {
        this.leftPort = toPort
        this.leftAddr = toAddr
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
        await forwardServer.start()
    }
}


export class TCPTunnleEndPoint extends Emitter implements EndPoint {
    isReady: boolean = true;
    isClosed: boolean = false;

    packetable: TCPPacketable;
    mappingId: number;
    pipeId: number;

    private onPacketFn: (packet: TCPPacket) => void;
    constructor(packetable: TCPPacketable, mappingId: number, pipeId: number) {
        super()
        this.packetable = packetable;
        this.mappingId = mappingId;
        this.pipeId = pipeId;

        let oriEmitCloseEventFn = this.emitCloseEventOnce.bind(this);
        this.emitCloseEventOnce = once(oriEmitCloseEventFn)
        this.onPacketFn = (packet: TCPPacket) => {
            // @TODO 为了性能需要在外界分发
            if (packet.Cmd == CMD.TCP_Data && packet.Data) {
                let dataPacket = new TCPDataPacket()
                dataPacket.UnSerialize(packet.Data)
                if (dataPacket.mappingId == this.mappingId && dataPacket.pipeId == this.pipeId) {
                    this.onReceiveData(dataPacket.buffer)
                }
            } else if (packet.Cmd == CMD.TCP_Closed && packet.Data) {
                let dataPacket = new TCPDataPacket()
                dataPacket.UnSerialize(packet.Data)
                if (dataPacket.mappingId == this.mappingId && dataPacket.pipeId == this.pipeId) {
                    this.close()
                }
            }
        }
        packetable.on('packet', this.onPacketFn)
    }

    onReceiveData(buffer: Buffer): void {
        if (!this.isClosed) {
            this.emit('data', buffer)
        }
    }

    protected emitCloseEventOnce() {
        this.packetable.off('packet', this.onPacketFn)
        this.isClosed = true;
        this.emit('close')
    }

    write(buffer: string | Uint8Array): void {
        if (buffer && !this.isClosed) {
            if (typeof buffer === 'string') {
                buffer = Buffer.from(buffer)
            }
            let packet = new TCPPacket()
            packet.Cmd = CMD.TCP_Data
            let dataPacket = new TCPDataPacket()
            dataPacket.mappingId = this.mappingId;
            dataPacket.pipeId = this.pipeId;
            dataPacket.buffer = buffer as Buffer
            packet.Data = dataPacket.Serialize()
            this.packetable.writePacket(packet)
        }
    }

    close(): void {
        if (!this.isClosed)
            this.emitCloseEventOnce()
    }

    async start() {
        if (this.isClosed) {
            let promise = new Promise<boolean>((resolve, reject) => {
                resolve(false)
            })
            return promise
        }
        let promise = new Promise<boolean>((resolve, reject) => {
            resolve(true)
        })
        return promise
    }

    on(...args: [event: string, listener: (...args: any[]) => void] |
    [event: 'close', listener: () => void] |
    [event: 'data', listener: (buffer: Buffer) => void]
    ): this {
        super.on.call(this, ...args)
        return this
    }

    once(...args: [event: string, listener: (...args: any[]) => void] |
    [event: 'close', listener: () => void] |
    [event: 'data', listener: (buffer: Buffer) => void]
    ): this {
        super.once.call(this, ...args)
        return this
    }

}

// enum EventInfoType {
//     Left = 1,
//     Right
// }
// class EventInfo {
//     type: EventInfoType;
//     name: string;
//     buffer?: Buffer
// }
// class EventQueue {
//     queue: EventInfo[] = [];
//     get length() {
//         return this.queue.length
//     }

//     EnQueue(evnet: EventInfo) {
//         this.queue.push(evnet);
//     }
//     DeQueue() {
//         return this.queue.shift()
//     }
//     Clear() {
//         this.queue = []
//     }
// }


// export class LocalPortForward extends Emitter {

//     leftPort: number
//     rightPort: number
//     tcpServer: TCPServer

//     constructor(leftPort: number, rightPort: number) {
//         super();
//         this.leftPort = leftPort
//         this.rightPort = rightPort
//     }

//     async start() {
//         let options = new TCPOptions();
//         options.isServer = true;
//         options.isClient = false;
//         options.usePacket = false;
//         let tcpServer = this.tcpServer = new TCPServer(options);
//         let succ = await tcpServer.start(this.rightPort)
//         if (!succ) {
//             console.error('本地代理启动失败!');
//         } else {
//             tcpServer.on('connection', (rometeSession: TCPSession) => {
//                 this.onNewRemoteSession(rometeSession)
//             })
//         }
//         return succ
//     }

//     private onNewRemoteSession(rometeSession: TCPSession) {
//         let vConnection = new LocalVConnection(rometeSession, this.leftPort);
//         vConnection.start();
//     }
// }
// export class LocalVConnection extends Emitter {
//     right: TCPSession
//     left: TCPSession
//     leftPort: number
//     constructor(right: TCPSession, leftPort: number) {
//         super();
//         this.right = right;
//         this.leftPort = leftPort;
//     }

//     async start() {
//         this.right.on('data', (buffer) => {
//             let eventInfo = new EventInfo();
//             eventInfo.type = EventInfoType.Right
//             eventInfo.name = 'data'
//             eventInfo.buffer = buffer
//             this.enQueue(eventInfo);
//         })
//         this.right.on('close', () => {
//             let eventInfo = new EventInfo();
//             eventInfo.type = EventInfoType.Right
//             eventInfo.name = 'close'
//             this.enQueue(eventInfo);
//         })

//         let options = new TCPOptions();
//         options.isServer = true;
//         options.isClient = false;
//         options.usePacket = false;
//         let left = new TCPSession(options, new net.Socket());
//         let succ = await left.startClient(this.leftPort)
//         if (!succ) {
//             console.error('本地虚拟连接启动失败!');
//             this.left = left
//             this.closeConnection()
//         } else {
//             this.left = left
//             left.on('data', (buffer) => {
//                 let eventInfo = new EventInfo();
//                 eventInfo.type = EventInfoType.Left
//                 eventInfo.name = 'data'
//                 eventInfo.buffer = buffer
//                 this.enQueue(eventInfo);
//             })
//             left.on('close', () => {
//                 let eventInfo = new EventInfo();
//                 eventInfo.type = EventInfoType.Left
//                 eventInfo.name = 'close'
//                 this.enQueue(eventInfo);
//             })
//             this.tryExecQueue()
//         }
//         return succ;
//     }

//     private eventQueue = new EventQueue();
//     private enQueue(evnet: EventInfo) {
//         this.eventQueue.EnQueue(evnet)
//         this.tryExecQueue()
//     }
//     private tryExecQueue() {
//         while (true) {
//             if (this.eventQueue.length == 0) {
//                 break;
//             }
//             if (this.left == null) {
//                 break;
//             }
//             if (this.right == null) {
//                 break;
//             }
//             let evnet = this.eventQueue.DeQueue()
//             if (evnet.type == EventInfoType.Left) {
//                 if (evnet.name == 'close') {
//                     this.closeConnection()
//                 } else if (evnet.name == 'data') {
//                     this.leftData(evnet.buffer)
//                 }
//             } else if (evnet.type == EventInfoType.Right) {
//                 if (evnet.name == 'close') {
//                     this.closeConnection()
//                 } else if (evnet.name == 'data') {
//                     this.rightData(evnet.buffer)
//                 }
//             }
//         }
//     }

//     private rightData(buffer: Buffer) {
//         if (this.left) {
//             this.left.writeBuffer(buffer)
//         }
//     }

//     private leftData(buffer: Buffer) {
//         if (this.right) {
//             this.right.writeBuffer(buffer)
//         }
//     }

//     private closeConnection() {
//         this.eventQueue.Clear();
//         let right = this.right
//         let left = this.left
//         if (right) {
//             this.right = null;
//             right.close()
//         }
//         if (left) {
//             this.left = null;
//             left.close()
//         }
//     }
// }


// // PortMappingClientSide
// export class PortMappingCSide extends Emitter {
//     leftPort: number
//     leftAddr: string
//     map: Map<number, PortMappingVConnectionCSide> = new Map()

//     constructor(leftPort: number, leftAddr = '127.0.0.1') {
//         super();
//         this.leftPort = leftPort
//         this.leftAddr = leftAddr
//     }

//     async startNew(id: number) {
//         let options = new TCPOptions();
//         options.isServer = false;
//         options.isClient = true;
//         options.usePacket = false;
//         let leftSession = new TCPSession(options, new net.Socket());
//         let vConnection = new PortMappingVConnectionCSide(id, leftSession);
//         vConnection.on('close', this.connectionClose.bind(this))
//         vConnection.on('leftData', this.receiveLeftData.bind(this))

//         this.map.set(id, vConnection)
//         let succ = await vConnection.start(this.leftPort, this.leftAddr)
//         if (!succ) {
//             console.error(`远程代理 本地session创建失败! id=${id}`);
//         }
//         return succ
//     }

//     private connectionClose(id: number) {
//         this.map.delete(id)
//         this.emit('closeConnection', id);
//     }

//     private receiveLeftData(buffer: Buffer, id: number) {
//         this.emit('leftData', buffer, id)
//     }
//     public receiveRightData(buffer: Buffer, id: number) {
//         if (this.map.has(id)) {
//             var vConnection = this.map.get(id);
//             vConnection.onRightData(buffer);
//         }
//     }
//     public receiveRightClose(id: number) {
//         if (this.map.has(id)) {
//             var vConnection = this.map.get(id);
//             vConnection.onRightClose();
//         }
//     }

//     public close() {
//         let vConnections: PortMappingVConnectionCSide[] = [];
//         for (const item of this.map.values()) {
//             vConnections.push(item)
//         }
//         for (const item of vConnections) {
//             item.close()
//         }
//     }
// }
// // PortMappingVirtualConnectionClientSide
// export class PortMappingVConnectionCSide extends Emitter {
//     private id: number
//     private isLeftConnected = false
//     private left: TCPSession
//     constructor(id: number, left: TCPSession) {
//         super();
//         this.id = id
//         this.left = left;
//     }

//     async start(leftPort: number, leftAddr = '127.0.0.1') {
//         this.left.on('data', (buffer) => {
//             let eventInfo = new EventInfo();
//             eventInfo.type = EventInfoType.Left
//             eventInfo.name = 'data'
//             eventInfo.buffer = buffer
//             this.enQueue(eventInfo);
//         })
//         this.left.on('close', () => {
//             let eventInfo = new EventInfo();
//             eventInfo.type = EventInfoType.Left
//             eventInfo.name = 'close'
//             this.enQueue(eventInfo);
//         })
//         let succ = await this.left.startClient(leftPort, leftAddr)
//         this.isLeftConnected = succ;
//         if (!succ) {
//             this.closeConnection()
//         } else {
//             this.tryExecQueue()
//         }
//         return succ;
//     }

//     private eventQueue = new EventQueue();
//     private enQueue(evnet: EventInfo) {
//         this.eventQueue.EnQueue(evnet)
//         this.tryExecQueue()
//     }
//     private tryExecQueue() {
//         while (true) {
//             if (this.eventQueue.length == 0) {
//                 break;
//             }
//             if (this.left == null) {
//                 break;
//             }
//             if (!this.isLeftConnected) {
//                 break;
//             }

//             let evnet = this.eventQueue.DeQueue()
//             if (evnet.type == EventInfoType.Left) {
//                 if (evnet.name == 'close') {
//                     this.closeConnection()
//                 } else if (evnet.name == 'data') {
//                     this.leftData(evnet.buffer)
//                 }
//             } else if (evnet.type == EventInfoType.Right) {
//                 if (evnet.name == 'close') {
//                     this.closeConnection()
//                 } else if (evnet.name == 'data') {
//                     this.rightData(evnet.buffer)
//                 }
//             }
//         }
//     }

//     public onRightClose() {
//         let eventInfo = new EventInfo();
//         eventInfo.type = EventInfoType.Right
//         eventInfo.name = 'close'
//         this.enQueue(eventInfo);
//     }

//     public onRightData(buffer: Buffer) {
//         let eventInfo = new EventInfo();
//         eventInfo.type = EventInfoType.Right
//         eventInfo.name = 'data'
//         eventInfo.buffer = buffer
//         this.enQueue(eventInfo);
//     }

//     private rightData(buffer: Buffer) {
//         if (this.left != null && this.isLeftConnected) {
//             this.left.writeBuffer(buffer)
//         }
//     }

//     private leftData(buffer: Buffer) {
//         this.emit('leftData', buffer, this.id)
//     }

//     private closeConnection() {
//         this.eventQueue.Clear()
//         this.isLeftConnected = false;
//         let left = this.left
//         if (left) {
//             this.left = null;
//             left.close()
//         }
//         this.emit('close', this.id)
//     }

//     public close() {
//         this.closeConnection()
//     }
// }


// // PortMappingServerSide
// export class PortMappingSSide extends Emitter {
//     map: Map<number, PortMappingVConnectionSSide> = new Map()
//     rightPort: number
//     tcpServer: TCPServer

//     constructor(rightPort: number) {
//         super();
//         this.rightPort = rightPort
//     }

//     async start() {
//         let options = new TCPOptions();
//         options.isServer = true;
//         options.isClient = false;
//         options.usePacket = false;
//         let tcpServer = this.tcpServer = new TCPServer(options);
//         let succ = await tcpServer.start(this.rightPort)
//         if (!succ) {
//             console.error('本地代理启动失败!');
//         } else {
//             tcpServer.on('connection', (rometeSession: TCPSession) => {
//                 this.onNewRemoteSession(rometeSession)
//             })
//         }
//         return succ
//     }
//     private onNewRemoteSession(rometeSession: TCPSession) {
//         let id = UID.GetUID()
//         let vConnection = new PortMappingVConnectionSSide(id, rometeSession);
//         vConnection.on('close', this.connectionClose.bind(this))
//         vConnection.on('rightData', this.receiveRightData.bind(this))
//         this.map.set(id, vConnection)
//         vConnection.start();
//         this.emit('newConnection', id);
//     }

//     private connectionClose(id: number) {
//         this.map.delete(id)
//         this.emit('closeConnection', id);
//     }
//     private receiveRightData(buffer: Buffer, id: number) {
//         this.emit('rightData', buffer, id)
//     }
//     public receiveLeftData(buffer: Buffer, id: number) {
//         if (this.map.has(id)) {
//             var vConnection = this.map.get(id);
//             vConnection.onLeftData(buffer);
//         }
//     }
//     public receiveLeftClose(id: number) {
//         if (this.map.has(id)) {
//             var vConnection = this.map.get(id);
//             vConnection.onLeftClose();
//         }
//     }

//     public close() {
//         let vConnections: PortMappingVConnectionSSide[] = [];
//         for (const item of this.map.values()) {
//             vConnections.push(item)
//         }
//         for (const item of vConnections) {
//             item.close()
//         }
//         this.tcpServer.close()
//     }
// }
// // PortMappingVirtualConnectionServerSide
// export class PortMappingVConnectionSSide extends Emitter {
//     private id: number
//     private right: TCPSession
//     constructor(id: number, right: TCPSession) {
//         super();
//         this.id = id
//         this.right = right;
//     }

//     start() {
//         this.right.on('data', (buffer) => {
//             let eventInfo = new EventInfo();
//             eventInfo.type = EventInfoType.Right
//             eventInfo.name = 'data'
//             eventInfo.buffer = buffer
//             this.enQueue(eventInfo);
//         })
//         this.right.on('close', () => {
//             let eventInfo = new EventInfo();
//             eventInfo.type = EventInfoType.Right
//             eventInfo.name = 'close'
//             this.enQueue(eventInfo);
//         })
//     }

//     private eventQueue = new EventQueue();
//     private enQueue(evnet: EventInfo) {
//         this.eventQueue.EnQueue(evnet)
//         this.tryExecQueue()
//     }
//     private tryExecQueue() {
//         while (true) {
//             if (this.eventQueue.length == 0) {
//                 break;
//             }
//             if (this.right == null) {
//                 break;
//             }

//             let evnet = this.eventQueue.DeQueue()
//             if (evnet.type == EventInfoType.Left) {
//                 if (evnet.name == 'close') {
//                     this.closeConnection()
//                 } else if (evnet.name == 'data') {
//                     this.leftData(evnet.buffer)
//                 }
//             } else if (evnet.type == EventInfoType.Right) {
//                 if (evnet.name == 'close') {
//                     this.closeConnection()
//                 } else if (evnet.name == 'data') {
//                     this.rightData(evnet.buffer)
//                 }
//             }
//         }
//     }

//     public onLeftClose() {
//         let eventInfo = new EventInfo();
//         eventInfo.type = EventInfoType.Left
//         eventInfo.name = 'close'
//         this.enQueue(eventInfo);
//     }

//     public onLeftData(buffer: Buffer) {
//         let eventInfo = new EventInfo();
//         eventInfo.type = EventInfoType.Left
//         eventInfo.name = 'data'
//         eventInfo.buffer = buffer
//         this.enQueue(eventInfo);
//     }

//     private rightData(buffer: Buffer) {
//         this.emit('rightData', buffer, this.id)
//     }

//     private leftData(buffer: Buffer) {
//         if (this.right != null) {
//             this.right.writeBuffer(buffer)
//         }
//     }

//     private closeConnection() {
//         this.eventQueue.Clear()
//         let right = this.right
//         if (right) {
//             this.right = null;
//             right.close()
//         }
//         this.emit('close', this.id)
//     }
//     public close() {
//         this.closeConnection()
//     }
// }


// export class PortMappingTest {

//     private portMapCSide: PortMappingCSide
//     private portMapSSide: PortMappingSSide
//     private leftPort: number
//     private rightPort: number
//     constructor(leftPort: number, rightPort: number) {
//         this.leftPort = leftPort
//         this.rightPort = rightPort
//     }

//     async start() {
//         this.portMapCSide = new PortMappingCSide(this.leftPort)
//         this.portMapSSide = new PortMappingSSide(this.rightPort)

//         this.portMapSSide.on('newConnection', (id: number) => {
//             this.portMapCSide.startNew(id);
//         })
//         this.portMapSSide.on('closeConnection', (id: number) => {
//             this.portMapCSide.receiveRightClose(id);
//         })
//         this.portMapSSide.on('rightData', (buffer: Buffer, id: number) => {
//             this.portMapCSide.receiveRightData(buffer, id);
//         })

//         this.portMapCSide.on('closeConnection', (id: number) => {
//             this.portMapSSide.receiveLeftClose(id);
//         })
//         this.portMapCSide.on('leftData', (buffer: Buffer, id: number) => {
//             this.portMapSSide.receiveLeftData(buffer, id);
//         })

//         await this.portMapSSide.start()
//     }
//     close() {
//         if (this.portMapCSide) {
//             this.portMapCSide.close();
//         }
//         if (this.portMapSSide) {
//             this.portMapCSide.close();
//         }
//     }
// }

// export class UID {
//     private static uid = 1
//     public static GetUID() {
//         return UID.uid++
//     }
// }