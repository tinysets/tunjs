import { hashCode } from "./Utils"

export class TunnelInfo {
    tunnelId: number = 0
    isLocalTunnel = false
    type: 'tcp' | 'udp'
    targetAddr: string
    targetPort: number
    sourcePort: number
    timeout = 0

    constructor(jsonObj?) {
        this.from(jsonObj)
    }
    from(jsonObj) {
        if (jsonObj) {
            Object.assign(this, jsonObj)
            this.tunnelId = hashCode(this.type + this.targetAddr + this.targetPort + this.sourcePort)
        }
    }

    static From(jsonObj) {
        return new TunnelInfo(jsonObj);
    }
}