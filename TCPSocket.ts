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

export class LocalPortForward extends Emitter {

    fromPort: number
    toPort: number
    tcpServer: TCPServer

    constructor(fromPort: number, toPort: number) {
        super();
        this.fromPort = fromPort
        this.toPort = toPort
    }

    async start() {
        let options = new TCPSessionOptions();
        options.isServer = true;
        options.isClient = false;
        options.isTCPPacket = false;
        let tcpServer = this.tcpServer = new TCPServer(options);
        let succ = await tcpServer.start(this.fromPort)
        if (!succ) {
            console.error('本地代理启动失败!');
        } else {
            tcpServer.on('connection', (rometeSession: TCPSession) => {
                this.onNewRemoteSession(rometeSession)
            })
        }
        return succ
    }

    private onNewRemoteSession(rometeSession: TCPSession,) {
        let virtualConnection = new LocalVirtualConnection(rometeSession, this.toPort);
        virtualConnection.start();
    }
}

enum EventInfoType {
    Local = 1,
    Remote
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

export class LocalVirtualConnection extends Emitter {
    rometeSession: TCPSession
    localPort: number
    localSession: TCPSession
    constructor(rometeSession: TCPSession, localPort: number) {
        super();
        this.rometeSession = rometeSession;
        this.localPort = localPort;
    }

    async start() {
        this.rometeSession.on('data', (buffer) => {
            let eventInfo = new EventInfo();
            eventInfo.type = EventInfoType.Remote
            eventInfo.name = 'data'
            eventInfo.buffer = buffer
            this.enQueue(eventInfo);
        })
        this.rometeSession.on('close', () => {
            let eventInfo = new EventInfo();
            eventInfo.type = EventInfoType.Remote
            eventInfo.name = 'close'
            this.enQueue(eventInfo);
        })

        let options = new TCPSessionOptions();
        options.isServer = true;
        options.isClient = false;
        options.isTCPPacket = false;
        let localSession = new TCPSession(options, new net.Socket());
        let succ = await localSession.startClient(this.localPort, '127.0.0.1')
        if (!succ) {
            console.error('本地虚拟连接启动失败!');
            this.localSession = localSession
            this.closeConnection()
        } else {
            this.localSession = localSession
            localSession.on('data', (buffer) => {
                let eventInfo = new EventInfo();
                eventInfo.type = EventInfoType.Local
                eventInfo.name = 'data'
                eventInfo.buffer = buffer
                this.enQueue(eventInfo);
            })
            localSession.on('close', () => {
                let eventInfo = new EventInfo();
                eventInfo.type = EventInfoType.Local
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
            if (this.localSession == null) {
                break;
            }
            if (this.rometeSession == null) {
                break;
            }
            let evnet = this.eventQueue.DeQueue()
            if (evnet.type == EventInfoType.Local) {
                if (evnet.name == 'close') {
                    this.closeConnection()
                } else if (evnet.name == 'data') {
                    this.localData(evnet.buffer)
                }
            } else if (evnet.type == EventInfoType.Remote) {
                if (evnet.name == 'close') {
                    this.closeConnection()
                } else if (evnet.name == 'data') {
                    this.remoteData(evnet.buffer)
                }
            }
        }
    }

    private remoteData(buffer: Buffer) {
        if (this.localSession) {
            this.localSession.writeBuffer(buffer)
        }
    }

    private localData(buffer: Buffer) {
        if (this.rometeSession) {
            this.rometeSession.writeBuffer(buffer)
        }
    }

    private closeConnection() {
        this.eventQueue.Clear();
        let rometeSession = this.rometeSession
        let localSession = this.localSession
        if (rometeSession) {
            this.rometeSession = null;
            rometeSession.close()
        }
        if (localSession) {
            this.localSession = null;
            localSession.close()
        }
    }
}


export class RemotePortForward extends Emitter {
    toPort: number
    map: Map<number, RemoteVirtualConnection> = new Map()

    constructor(toPort: number) {
        super();
        this.toPort = toPort
    }

    async startNew(id: number) {
        let options = new TCPSessionOptions();
        options.isServer = false;
        options.isClient = true;
        options.isTCPPacket = false;
        let localSession = new TCPSession(options, new net.Socket());
        let virtualConnection = new RemoteVirtualConnection(id, localSession);
        virtualConnection.on('close', this.connectionClose.bind(this))
        virtualConnection.on('localData', this.receiveLocalData.bind(this))
        this.map.set(id, virtualConnection)
        let succ = await virtualConnection.start(this.toPort)
        if (!succ) {
            console.error(`远程代理 本地session创建失败! id=${id}`);
            this.map.delete(id)
        }
        return succ
    }

    private connectionClose(id: number) {
        this.map.delete(id)
    }

    receiveLocalData(buffer: Buffer, id: number) {
        this.emit('localData', buffer, id)
    }
    receiveRemoteData(buffer: Buffer, id: number) {
        if (this.map.has(id)) {
            var virtualConnection = this.map.get(id);
            virtualConnection.onRemoteData(buffer);
        }
    }
    receiveRemoteClose(id: number) {
        if (this.map.has(id)) {
            var virtualConnection = this.map.get(id);
            virtualConnection.onRemoteClose();
        }
    }

}

export class RemoteVirtualConnection extends Emitter {
    private id: number
    private isLocalConnected = false
    private localSession: TCPSession
    constructor(id: number, localSession: TCPSession) {
        super();
        this.id = id
        this.localSession = localSession;
    }

    async start(toPort: number) {
        this.localSession.on('data', (buffer) => {
            let eventInfo = new EventInfo();
            eventInfo.type = EventInfoType.Local
            eventInfo.name = 'data'
            eventInfo.buffer = buffer
            this.enQueue(eventInfo);
        })
        this.localSession.on('close', () => {
            let eventInfo = new EventInfo();
            eventInfo.type = EventInfoType.Local
            eventInfo.name = 'close'
            this.enQueue(eventInfo);
        })
        let succ = await this.localSession.startClient(toPort, '127.0.0.1')
        this.isLocalConnected = succ;
        if (!succ) {
            this.closeConnection()
        } else {
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
            if (this.localSession == null) {
                break;
            }
            if (!this.isLocalConnected) {
                break;
            }

            let evnet = this.eventQueue.DeQueue()
            if (evnet.type == EventInfoType.Local) {
                if (evnet.name == 'close') {
                    this.closeConnection()
                } else if (evnet.name == 'data') {
                    this.localData(evnet.buffer)
                }
            } else if (evnet.type == EventInfoType.Remote) {
                if (evnet.name == 'close') {
                    this.closeConnection()
                } else if (evnet.name == 'data') {
                    this.remoteData(evnet.buffer)
                }
            }
        }
    }

    public onRemoteClose() {
        let eventInfo = new EventInfo();
        eventInfo.type = EventInfoType.Remote
        eventInfo.name = 'close'
        this.enQueue(eventInfo);
    }

    public onRemoteData(buffer: Buffer) {
        let eventInfo = new EventInfo();
        eventInfo.type = EventInfoType.Remote
        eventInfo.name = 'data'
        eventInfo.buffer = buffer
        this.enQueue(eventInfo);
    }

    private remoteData(buffer: Buffer) {
        if (this.localSession != null && this.isLocalConnected) {
            this.localSession.writeBuffer(buffer)
        }
    }

    private localData(buffer: Buffer) {
        this.emit('localData', buffer, this.id)
    }

    private closeConnection() {
        this.eventQueue.Clear()
        this.isLocalConnected = false;
        let localSession = this.localSession
        if (localSession) {
            this.localSession = null;
            localSession.close()
        }
        this.emit('close', this.id)
    }
}
