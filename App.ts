import Emitter from 'events'
import compose from 'koa-compose'
import { TCPPacket } from "./TCPPacket"
import { TCPSession } from "./TCPSocket"

export interface Context {
    tcpEvent?: string
    tcpSession?: TCPSession
    tcpPacket?: TCPPacket
    tcpBuffer?: Buffer
    tcpError?: Error
}

let context: Context = {}

export class App extends Emitter {

    private middleware: any[]
    private context: Context
    constructor() {
        super();
        this.middleware = [];
        this.context = Object.create(context);
    }

    use(fn: (ctx: Context, next: any) => any) {
        this.middleware.push(fn);
        return this;
    }

    callback() {
        const fn = compose(this.middleware);
        const handleRequest = (ctx: Context) => {
            return this.handleRequest(ctx, fn);
        };
        return handleRequest;
    }

    createContext() {
        const context = Object.create(this.context);
        context.app = this;
        return context as Context;
    }

    private handleRequest(ctx: Context, fnMiddleware) {
        const onerror = err => console.error(err);
        const handleResponse = () => { };
        return fnMiddleware(ctx).then(handleResponse).catch(onerror);
    }
}


export class TCPEventRouter {
    private map = new Map()
    use(event: string, fn: (ctx: Context, next: any) => any) {
        this.map[event] = fn
    }
    callback() {
        return (ctx: Context, next) => {
            let event = ctx.tcpEvent;
            if (this.map[event] != null) {
                let fn = this.map[event];
                fn(ctx, next)
            } else {
                next();
            }
        };
    }
}

export class TCPPacketRouter {
    private map = new Map()
    use(cmd: number, fn: (ctx: Context, next: any) => any) {
        this.map[cmd] = fn
    }
    callback() {
        return (ctx: Context, next) => {
            if (ctx.tcpEvent == "packet") {
                let tcpPacket = ctx.tcpPacket;
                var cmd = tcpPacket.Cmd;
                if (this.map[cmd] != null) {
                    let fn = this.map[cmd];
                    fn(ctx, next)
                } else {
                    next();
                }
            } else {
                next();
            }
        };
    }
}
