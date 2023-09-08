#!/usr/bin/env node

import fs from 'fs';
import { ForwardInfo } from './TCPPacket';
import { UDPLocalForward } from './UDPSocket';
import { TCPLocalForward } from "./TCPSocket";
import { startServer } from './Server';
import { startClient } from './Client';
import { Command } from 'commander';

{
    const clientProgram = new Command();
    clientProgram
        .name('client')
        .option('-c, --config <file path>', 'config file', 'client.json')
        .action(async (options, command) => {
            console.log('run as client')

            if (!fs.existsSync(options.config)) {
                let defualtConfig = {
                    address: '127.0.0.1',
                    port: 7666,
                    authKey: 'userkey1',
                    forwardInfos: [
                        { note: 'for test', isLocalForward: true, type: 'tcp', targetAddr: '127.0.0.1', targetPort: 46464, fromPort: 56565 },
                        { note: 'for test', isLocalForward: false, type: 'udp', targetAddr: '127.0.0.1', targetPort: 46464, fromPort: 56565 },
                    ]
                }
                fs.writeFileSync('client.json', JSON.stringify(defualtConfig, null, 2), 'utf8')
            }
            let str = fs.readFileSync(options.config, 'utf8')
            let config = JSON.parse(str);
            config.forwardInfos = config.forwardInfos.map((v) => ForwardInfo.From(v))
            let forwardInfos: ForwardInfo[] = config.forwardInfos

            let localForwards = forwardInfos.filter((v) => v.isLocalForward);
            let remoteForwards = forwardInfos.filter((v) => !v.isLocalForward);

            for (const localForward of localForwards) {
                if (localForward.type == 'tcp') {
                    let tcpLocalForward = new TCPLocalForward(localForward.fromPort, localForward.targetPort, localForward.targetAddr)
                    await tcpLocalForward.start()
                } else if (localForward.type == 'udp') {
                    let udpLocalForward = new UDPLocalForward(localForward.fromPort, localForward.targetPort, localForward.targetAddr)
                    await udpLocalForward.start()
                }
            }

            await startClient(remoteForwards, config.port, config.address, config.authKey)
        })

    const serverProgram = new Command();
    serverProgram
        .name('server')
        .option('-c, --config <file path>', 'config file', 'server.json')
        .action(async (options, command) => {
            console.log('run as server')

            if (!fs.existsSync(options.config)) {
                let defualtConfig = {
                    port: 7666,
                    validKeys: [
                        'userkey1',
                        'userkey2',
                    ]
                }
                fs.writeFileSync('server.json', JSON.stringify(defualtConfig, null, 2), 'utf8')
            }
            let str = fs.readFileSync(options.config, 'utf8')
            let config = JSON.parse(str);
            await startServer(config.port, config.validKeys)
        })

    const mainProgram = new Command();
    mainProgram
        .name('portmp')
        .addCommand(clientProgram,
            { isDefault: true }
        )
        .addCommand(serverProgram)

    mainProgram.parse(process.argv);
    // const options = mainProgram.opts();
    // console.log(options)
}

