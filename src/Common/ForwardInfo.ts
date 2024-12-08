import { hashCode } from "./Utils"

export class ForwardInfo {
    mappingId: number = 0
    isLocalForward = false
    type: 'tcp' | 'udp'
    targetAddr: string
    targetPort: number
    fromPort: number

    constructor(jsonObj?) {
        this.from(jsonObj)
    }
    from(jsonObj) {
        if (jsonObj) {
            Object.assign(this, jsonObj)
            this.mappingId = hashCode(this.type + this.targetAddr + this.targetPort + this.fromPort)
            let a = 0
        }
    }

    static From(jsonObj) {
        return new ForwardInfo(jsonObj);
    }
}