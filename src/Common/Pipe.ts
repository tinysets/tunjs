import Emitter from 'events'
import { EndPoint } from './interfaces';

enum EventSide {
    Left = 1,
    Right
}
class EventInfo {
    side: EventSide;
    name: 'close' | 'data';
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

export class Pipe extends Emitter {
    private isReady: boolean = false;
    private left: EndPoint
    private right: EndPoint

    virtualEndPoint: EndPoint
    constructor(left: EndPoint, right: EndPoint) {
        super()
        this.left = left;
        this.right = right;
    }

    async link() {
        this.left.on('close', () => {
            let eventInfo = new EventInfo();
            eventInfo.side = EventSide.Left
            eventInfo.name = 'close'
            this.enQueue(eventInfo)
        })
        this.left.on('data', (buffer) => {
            let eventInfo = new EventInfo();
            eventInfo.side = EventSide.Left
            eventInfo.name = 'data'
            eventInfo.buffer = buffer
            this.enQueue(eventInfo)
        })

        this.right.on('close', () => {
            let eventInfo = new EventInfo();
            eventInfo.side = EventSide.Right
            eventInfo.name = 'close'
            this.enQueue(eventInfo)
        })
        this.right.on('data', (buffer) => {
            let eventInfo = new EventInfo();
            eventInfo.side = EventSide.Right
            eventInfo.name = 'data'
            eventInfo.buffer = buffer
            this.enQueue(eventInfo)
        })

        let leftSucc = await this.left.start()
        if (leftSucc) {
            let rightSucc = await this.right.start()
            if (rightSucc) {
                this.isReady = true;
                this.onReady();
                return true
            }
        }
        this.close()
        return false
    }

    private onReady() {
        this.tryExecQueue()
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
            if (!this.isReady) {
                break;
            }
            if (!this.left || !this.right) {
                break;
            }

            let evnet = this.eventQueue.DeQueue()
            if (evnet.side == EventSide.Left) {
                if (evnet.name == 'close') {
                    this.close();
                } else if (evnet.name == 'data') {
                    this.right.write(evnet.buffer)
                }
            } else if (evnet.side == EventSide.Right) {
                if (evnet.name == 'close') {
                    this.close();
                } else if (evnet.name == 'data') {
                    this.left.write(evnet.buffer)
                }
            }
        }
    }

    close() {
        let left = this.left
        let right = this.right
        if (left && right) {
            this.left = null
            this.right = null
            left.close()
            right.close()
            this.emit('close')
        }
    }

    public onReceiveTunnleData(buffer: Buffer) {
        let virtualEndPoint = this.virtualEndPoint;
        virtualEndPoint.onReceiveData(buffer)
    }
}
