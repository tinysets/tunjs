import fs from 'fs';
import { startServer } from './Server';
import { startClient } from './Client';
import { Command } from 'commander';
import { TCPLocalTunnel, UDPLocalTunnel } from './Tunnel/LocalTunnel';
import { TunnelInfo } from './Common/TunnelInfo';

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
                    tunnelInfos: [
                        {
                            note: 'for test', isLocalTunnel: true, type: 'tcp',
                            targetAddr: '127.0.0.1', targetPort: 46464, sourcePort: 56565
                        },
                        {
                            note: 'for test', isLocalTunnel: false, type: 'udp',
                            targetAddr: '127.0.0.1', targetPort: 46464, sourcePort: 56565, timeout: 60
                        },
                    ]
                }
                fs.writeFileSync('client.json', JSON.stringify(defualtConfig, null, 2), 'utf8')
            }
            let str = fs.readFileSync(options.config, 'utf8')
            let config = JSON.parse(str);
            config.tunnelInfos = config.tunnelInfos.map((v) => TunnelInfo.From(v))
            let tunnelInfos: TunnelInfo[] = config.tunnelInfos

            let localTunnels = tunnelInfos.filter((v) => v.isLocalTunnel);
            let remoteTunnels = tunnelInfos.filter((v) => !v.isLocalTunnel);

            for (const localTunnel of localTunnels) {
                if (localTunnel.type == 'tcp') {
                    let tcpLocalTunnel = new TCPLocalTunnel(localTunnel.sourcePort, localTunnel.targetPort, localTunnel.targetAddr)
                    await tcpLocalTunnel.start()
                } else if (localTunnel.type == 'udp') {
                    let udpLocalTunnel = new UDPLocalTunnel(localTunnel.sourcePort, localTunnel.targetPort, localTunnel.targetAddr)
                    await udpLocalTunnel.start()
                }
            }

            await startClient(remoteTunnels, config.port, config.address, config.authKey)
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

