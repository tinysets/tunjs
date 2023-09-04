import Emitter from 'events'
import net from 'net'
import once from 'once'
import { TCPBufferHandler, TCPPacket } from './TCPPacket';
import { App, Context } from './App';


export class TCPSessionOptions {
    isTCPPacket: boolean = false;
    isServer: boolean = false;
    isClient: boolean = false;
}

export class TCPServer extends Emitter {
    server: net.Server | null;
    options: TCPSessionOptions;

    private app: App
    constructor(options: TCPSessionOptions) {
        super();
        this.options = options;
    }

    setApp(app: App) {
        this.app = app;
    }

    start(port: number) {
        if (this.server != null) {
            return;
        }
        let promise = new Promise<boolean>((resolve, reject) => {
            resolve = once(resolve)
            reject = once(reject)

            let server = this.server = new net.Server();
            server.on('listening', () => {
                console.log(`server on listening: ${port}`);
                resolve(true);
            });
            server.on('error', (err) => {
                console.log('server on error: ' + err);
                this.server = null;
                resolve(false);
            });
            server.on('close', () => {
                console.log('server on close');
                this.server = null;
            });

            server.on('connection', (socket) => {
                let tcpSession = new TCPSession(this.options, socket)
                tcpSession.name = "Session(ServerSide)"
                tcpSession.setApp(this.app)
                tcpSession.startServer()
                this.emit('connection', tcpSession)
            });
            server.listen(port);
        });
        return promise
    }

    close() {
        if (this.server == null) {
            return;
        }
        this.server.close();
        this.server = null;
    }
}

export class TCPSession extends Emitter {
    name = ""
    socket: net.Socket
    options: TCPSessionOptions;
    private bufferHandler: TCPBufferHandler = new TCPBufferHandler()

    private app: App
    private ctx: Context;
    private eventEmiter: (ctx: Context) => void;
    constructor(options: TCPSessionOptions, socket: net.Socket) {
        super();
        this.options = options;
        this.socket = socket;
        let oriEmitCloseEventFn = this.emitCloseEventOnce.bind(this);
        this.emitCloseEventOnce = once(oriEmitCloseEventFn)
    }

    setApp(app: App) {
        this.app = app;
        if (app == null) {
            this.ctx = null;
            this.eventEmiter = null;
        } else {
            this.ctx = this.app.createContext()
            this.ctx.tcpSession = this;
            this.eventEmiter = this.app.callback();
        }
    }

    startServer() {
        if (this.socket == null) {
            return;
        }
        let socket = this.socket
        socket.on("close", () => {
            this.onClose();
        });
        socket.on("connect", () => {
        });
        socket.on("data", (data) => {
            this.onData(data);
        });
        socket.on("drain", () => {
        });
        socket.on("end", () => {
            this.onEnd();
        });
        socket.on("error", (error) => {
            this.onError(error);
        });
        socket.on("lookup", () => {
        });
        socket.on("ready", () => {
        });
        socket.on("timeout", () => {
            this.onTimeout();
        });
    }

    startClient(port: number, host: string) {
        if (this.socket == null) {
            return;
        }

        let promise = new Promise<boolean>((resolve, reject) => {
            resolve = once(resolve)
            reject = once(reject)

            let socket = this.socket
            socket.on("close", () => {
                this.onClose();
            });
            socket.on("connect", () => {
            });
            socket.on("ready", () => {
                resolve(true)
            });
            socket.on("data", (data) => {
                this.onData(data);
            });
            socket.on("drain", () => {
            });
            socket.on("end", () => {
                this.onEnd();
            });
            socket.on("error", (error) => {
                this.onError(error);
                resolve(false)
            });
            socket.on("lookup", () => {
            });

            socket.on("timeout", () => {
                this.onTimeout();
            });
            socket.connect(port, host)
        });
        return promise
    }

    write(packet: TCPPacket) {
        this.socket.write(packet.GetSendBuffer());
    }

    writeBuffer(buffer: Uint8Array | string) {
        this.socket.write(buffer);
    }

    close() {
        this.socket.end();
    }

    private onData(buffer: Buffer) {
        if (this.options.isTCPPacket) {
            this.bufferHandler.put(buffer);
            let tcpPacket = this.bufferHandler.tryGetMsgPacket()
            if (tcpPacket) {
                this.emit('packet', tcpPacket, this)
                if (this.eventEmiter) {
                    this.ctx.tcpEvent = "packet"
                    this.ctx.tcpPacket = tcpPacket
                    this.eventEmiter(this.ctx)
                }
            }
        } else {
            this.emit('data', buffer, this)
            if (this.eventEmiter) {
                this.ctx.tcpEvent = "data"
                this.ctx.tcpBuffer = buffer
                this.eventEmiter(this.ctx)
            }
        }
    }

    private onClose() {
        this.socket.destroy();
        this.emitCloseEventOnce();
    }
    private onEnd() {
        this.socket.destroy();
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
        this.emit('close', this)
        if (this.eventEmiter) {
            this.ctx.tcpEvent = "close"
            this.eventEmiter(this.ctx)
        }
    }
}


enum EventInfoType {
    Left = 1,
    Right
}
class EventInfo {
    type: EventInfoType;
    name: string;
    buffer?: Buffer
}
class EventQueue {
    queue: EventInfo[] = [];
    get length() {
        return this.queue.length
    }

    EnQueue(evnet: EventInfo) {
        this.queue.push(evnet);
    }
    DeQueue() {
        return this.queue.shift()
    }
    Clear() {
        this.queue = []
    }
}


export class LocalPortForward extends Emitter {

    rightPort: number
    leftPort: number
    tcpServer: TCPServer

    constructor(rightPort: number, leftPort: number) {
        super();
        this.rightPort = rightPort
        this.leftPort = leftPort
    }

    async start() {
        let options = new TCPSessionOptions();
        options.isServer = true;
        options.isClient = false;
        options.isTCPPacket = false;
        let tcpServer = this.tcpServer = new TCPServer(options);
        let succ = await tcpServer.start(this.rightPort)
        if (!succ) {
            console.error('本地代理启动失败!');
        } else {
            tcpServer.on('connection', (rometeSession: TCPSession) => {
                this.onNewRemoteSession(rometeSession)
            })
        }
        return succ
    }

    private onNewRemoteSession(rometeSession: TCPSession) {
        let vConnection = new LocalVConnection(rometeSession, this.leftPort);
        vConnection.start();
    }
}
export class LocalVConnection extends Emitter {
    right: TCPSession
    left: TCPSession
    leftPort: number
    constructor(right: TCPSession, leftPort: number) {
        super();
        this.right = right;
        this.leftPort = leftPort;
    }

    async start() {
        this.right.on('data', (buffer) => {
            let eventInfo = new EventInfo();
            eventInfo.type = EventInfoType.Right
            eventInfo.name = 'data'
            eventInfo.buffer = buffer
            this.enQueue(eventInfo);
        })
        this.right.on('close', () => {
            let eventInfo = new EventInfo();
            eventInfo.type = EventInfoType.Right
            eventInfo.name = 'close'
            this.enQueue(eventInfo);
        })

        let options = new TCPSessionOptions();
        options.isServer = true;
        options.isClient = false;
        options.isTCPPacket = false;
        let left = new TCPSession(options, new net.Socket());
        let succ = await left.startClient(this.leftPort, '127.0.0.1')
        if (!succ) {
            console.error('本地虚拟连接启动失败!');
            this.left = left
            this.closeConnection()
        } else {
            this.left = left
            left.on('data', (buffer) => {
                let eventInfo = new EventInfo();
                eventInfo.type = EventInfoType.Left
                eventInfo.name = 'data'
                eventInfo.buffer = buffer
                this.enQueue(eventInfo);
            })
            left.on('close', () => {
                let eventInfo = new EventInfo();
                eventInfo.type = EventInfoType.Left
                eventInfo.name = 'close'
                this.enQueue(eventInfo);
            })
            this.tryExecQueue()
        }
        return succ;
    }

    private eventQueue = new EventQueue();
    private enQueue(evnet: EventInfo) {
        this.eventQueue.EnQueue(evnet)
        this.tryExecQueue()
    }
    private tryExecQueue() {
        while (true) {
            if (this.eventQueue.length == 0) {
                break;
            }
            if (this.left == null) {
                break;
            }
            if (this.right == null) {
                break;
            }
            let evnet = this.eventQueue.DeQueue()
            if (evnet.type == EventInfoType.Left) {
                if (evnet.name == 'close') {
                    this.closeConnection()
                } else if (evnet.name == 'data') {
                    this.leftData(evnet.buffer)
                }
            } else if (evnet.type == EventInfoType.Right) {
                if (evnet.name == 'close') {
                    this.closeConnection()
                } else if (evnet.name == 'data') {
                    this.rightData(evnet.buffer)
                }
            }
        }
    }

    private rightData(buffer: Buffer) {
        if (this.left) {
            this.left.writeBuffer(buffer)
        }
    }

    private leftData(buffer: Buffer) {
        if (this.right) {
            this.right.writeBuffer(buffer)
        }
    }

    private closeConnection() {
        this.eventQueue.Clear();
        let right = this.right
        let left = this.left
        if (right) {
            this.right = null;
            right.close()
        }
        if (left) {
            this.left = null;
            left.close()
        }
    }
}


// PortMappingClientSide
export class PortMapCSide extends Emitter {
    leftPort: number
    map: Map<number, PortMapVConnectionCSide> = new Map()

    constructor(toPort: number) {
        super();
        this.leftPort = toPort
    }

    async startNew(id: number) {
        let options = new TCPSessionOptions();
        options.isServer = false;
        options.isClient = true;
        options.isTCPPacket = false;
        let leftSession = new TCPSession(options, new net.Socket());
        let vConnection = new PortMapVConnectionCSide(id, leftSession);
        vConnection.on('close', this.connectionClose.bind(this))
        vConnection.on('leftData', this.receiveLeftData.bind(this))

        this.map.set(id, vConnection)
        let succ = await vConnection.start(this.leftPort)
        if (!succ) {
            console.error(`远程代理 本地session创建失败! id=${id}`);
            this.map.delete(id)
        }
        return succ
    }

    private connectionClose(id: number) {
        this.map.delete(id)
    }

    receiveLeftData(buffer: Buffer, id: number) {
        this.emit('leftData', buffer, id)
    }
    receiveRightData(buffer: Buffer, id: number) {
        if (this.map.has(id)) {
            var vConnection = this.map.get(id);
            vConnection.onRightData(buffer);
        }
    }
    receiveRightClose(id: number) {
        if (this.map.has(id)) {
            var vConnection = this.map.get(id);
            vConnection.onRightClose();
        }
    }
}
// PortMappingVirtualConnectionClientSide
export class PortMapVConnectionCSide extends Emitter {
    private id: number
    private isLeftConnected = false
    private left: TCPSession
    constructor(id: number, left: TCPSession) {
        super();
        this.id = id
        this.left = left;
    }

    async start(leftPort: number) {
        this.left.on('data', (buffer) => {
            let eventInfo = new EventInfo();
            eventInfo.type = EventInfoType.Left
            eventInfo.name = 'data'
            eventInfo.buffer = buffer
            this.enQueue(eventInfo);
        })
        this.left.on('close', () => {
            let eventInfo = new EventInfo();
            eventInfo.type = EventInfoType.Left
            eventInfo.name = 'close'
            this.enQueue(eventInfo);
        })
        let succ = await this.left.startClient(leftPort, '127.0.0.1')
        this.isLeftConnected = succ;
        if (!succ) {
            this.closeConnection()
            // @TODO 通过隧道发送失败事件
        } else {
            this.tryExecQueue()
            // @TODO 通过隧道发送成功事件
        }
        return succ;
    }

    private eventQueue = new EventQueue();
    private enQueue(evnet: EventInfo) {
        this.eventQueue.EnQueue(evnet)
        this.tryExecQueue()
    }
    private tryExecQueue() {
        while (true) {
            if (this.eventQueue.length == 0) {
                break;
            }
            if (this.left == null) {
                break;
            }
            if (!this.isLeftConnected) {
                break;
            }

            let evnet = this.eventQueue.DeQueue()
            if (evnet.type == EventInfoType.Left) {
                if (evnet.name == 'close') {
                    this.closeConnection()
                } else if (evnet.name == 'data') {
                    this.leftData(evnet.buffer)
                }
            } else if (evnet.type == EventInfoType.Right) {
                if (evnet.name == 'close') {
                    this.closeConnection()
                } else if (evnet.name == 'data') {
                    this.rightData(evnet.buffer)
                }
            }
        }
    }

    public onRightClose() {
        let eventInfo = new EventInfo();
        eventInfo.type = EventInfoType.Right
        eventInfo.name = 'close'
        this.enQueue(eventInfo);
    }

    public onRightData(buffer: Buffer) {
        let eventInfo = new EventInfo();
        eventInfo.type = EventInfoType.Right
        eventInfo.name = 'data'
        eventInfo.buffer = buffer
        this.enQueue(eventInfo);
    }

    private rightData(buffer: Buffer) {
        if (this.left != null && this.isLeftConnected) {
            this.left.writeBuffer(buffer)
        }
    }

    private leftData(buffer: Buffer) {
        this.emit('leftData', buffer, this.id)// @TODO 通过隧道发送数据
    }

    private closeConnection() {
        this.eventQueue.Clear()
        this.isLeftConnected = false;
        let left = this.left
        if (left) {
            this.left = null;
            left.close()
        }
        this.emit('close', this.id)// @TODO 通过隧道发送连接关闭事件
    }
}


// PortMappingServerSide
export class PortMapSSide extends Emitter {
    map: Map<number, PortMapVConnectionSSide> = new Map()
    rightPort: number
    tcpServer: TCPServer

    constructor(rightPort: number) {
        super();
        this.rightPort = rightPort
    }

    async start() {
        let options = new TCPSessionOptions();
        options.isServer = true;
        options.isClient = false;
        options.isTCPPacket = false;
        let tcpServer = this.tcpServer = new TCPServer(options);
        let succ = await tcpServer.start(this.rightPort)
        if (!succ) {
            console.error('本地代理启动失败!');
        } else {
            tcpServer.on('connection', (rometeSession: TCPSession) => {
                this.onNewRemoteSession(rometeSession)
            })
        }
        return succ
    }
    public static UID = 1;
    private onNewRemoteSession(rometeSession: TCPSession) {
        let uid = PortMapSSide.UID++
        let vConnection = new PortMapVConnectionSSide(uid, rometeSession);
        vConnection.on('close', this.connectionClose.bind(this))
        vConnection.on('rightData', this.receiveRightData.bind(this))
        this.map.set(uid, vConnection)
        vConnection.start();
    }

    private connectionClose(id: number) {
        this.map.delete(id)
    }
    receiveRightData(buffer: Buffer, id: number) {
        this.emit('rightData', buffer, id)
    }
    receiveLeftData(buffer: Buffer, id: number) {
        if (this.map.has(id)) {
            var vConnection = this.map.get(id);
            vConnection.onLeftData(buffer);
        }
    }
    receiveLeftClose(id: number) {
        if (this.map.has(id)) {
            var vConnection = this.map.get(id);
            vConnection.onLeftClose();
        }
    }
}
export class PortMapVConnectionSSide extends Emitter {
    private id: number
    private right: TCPSession
    constructor(id: number, right: TCPSession) {
        super();
        this.id = id
        this.right = right;
    }

    start() {
        this.right.on('data', (buffer) => {
            let eventInfo = new EventInfo();
            eventInfo.type = EventInfoType.Right
            eventInfo.name = 'data'
            eventInfo.buffer = buffer
            this.enQueue(eventInfo);
        })
        this.right.on('close', () => {
            let eventInfo = new EventInfo();
            eventInfo.type = EventInfoType.Right
            eventInfo.name = 'close'
            this.enQueue(eventInfo);
        })
        // @TODO 通过隧道发送新连接事件
    }

    private eventQueue = new EventQueue();
    private enQueue(evnet: EventInfo) {
        this.eventQueue.EnQueue(evnet)
        this.tryExecQueue()
    }
    private tryExecQueue() {
        while (true) {
            if (this.eventQueue.length == 0) {
                break;
            }
            if (this.right == null) {
                break;
            }

            let evnet = this.eventQueue.DeQueue()
            if (evnet.type == EventInfoType.Left) {
                if (evnet.name == 'close') {
                    this.closeConnection()
                } else if (evnet.name == 'data') {
                    this.leftData(evnet.buffer)
                }
            } else if (evnet.type == EventInfoType.Right) {
                if (evnet.name == 'close') {
                    this.closeConnection()
                } else if (evnet.name == 'data') {
                    this.rightData(evnet.buffer)
                }
            }
        }
    }

    public onLeftClose() {
        let eventInfo = new EventInfo();
        eventInfo.type = EventInfoType.Left
        eventInfo.name = 'close'
        this.enQueue(eventInfo);
    }

    public onLeftData(buffer: Buffer) {
        let eventInfo = new EventInfo();
        eventInfo.type = EventInfoType.Left
        eventInfo.name = 'data'
        eventInfo.buffer = buffer
        this.enQueue(eventInfo);
    }

    private rightData(buffer: Buffer) {
        this.emit('rightData', buffer, this.id)// @TODO 通过隧道发送数据
    }

    private leftData(buffer: Buffer) {
        if (this.right != null) {
            this.right.writeBuffer(buffer)
        }
    }

    private closeConnection() {
        this.eventQueue.Clear()
        let right = this.right
        if (right) {
            this.right = null;
            right.close()
        }
        this.emit('close', this.id)// @TODO 通过隧道发送连接关闭事件
    }
}