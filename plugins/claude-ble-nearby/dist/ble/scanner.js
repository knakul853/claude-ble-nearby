import noble from '@stoprocent/noble';
import { EventEmitter } from 'node:events';
import { NORDIC_UART_SERVICE_UUID, META_CHARACTERISTIC_UUID, PEER_NAME_PREFIX } from './constants.js';
export class BleScanner extends EventEmitter {
    scanning = false;
    scanMode = 'peers';
    allDevices = new Map();
    claudePeers = new Map();
    resolving = new Set();
    async start() {
        if (this.scanning)
            return;
        await this.waitForPoweredOn();
        noble.on('discover', (peripheral) => {
            const name = peripheral.advertisement.localName;
            if (this.scanMode === 'peers') {
                if (this.claudePeers.has(peripheral.id) || this.resolving.has(peripheral.id))
                    return;
                if (name && name.startsWith(PEER_NAME_PREFIX)) {
                    const peer = {
                        id: peripheral.id,
                        name: name.slice(PEER_NAME_PREFIX.length),
                        rssi: peripheral.rssi,
                        isClaudePeer: true,
                    };
                    this.claudePeers.set(peripheral.id, peer);
                    this.emit('discovered', peer);
                }
                else {
                    this.resolvePeerName(peripheral);
                }
            }
            else {
                if (!name)
                    return;
                const isClaudePeer = name.startsWith(PEER_NAME_PREFIX);
                const displayName = isClaudePeer ? name.slice(PEER_NAME_PREFIX.length) : name;
                this.allDevices.set(peripheral.id, {
                    id: peripheral.id,
                    name: displayName,
                    rssi: peripheral.rssi,
                    isClaudePeer,
                });
            }
        });
        await noble.startScanningAsync([NORDIC_UART_SERVICE_UUID], true);
        this.scanMode = 'peers';
        this.scanning = true;
    }
    async resolvePeerName(peripheral) {
        this.resolving.add(peripheral.id);
        try {
            await peripheral.connectAsync();
            const { characteristics } = await peripheral.discoverSomeServicesAndCharacteristicsAsync([NORDIC_UART_SERVICE_UUID], [META_CHARACTERISTIC_UUID]);
            const metaChar = characteristics.find((c) => c.uuid === META_CHARACTERISTIC_UUID);
            let peerName = `peer-${peripheral.id.slice(0, 8)}`;
            if (metaChar) {
                const data = await metaChar.readAsync();
                try {
                    const meta = JSON.parse(data.toString('utf-8'));
                    if (meta.name)
                        peerName = meta.name;
                }
                catch { }
            }
            await peripheral.disconnectAsync();
            const peer = {
                id: peripheral.id,
                name: peerName,
                rssi: peripheral.rssi,
                isClaudePeer: true,
            };
            this.claudePeers.set(peripheral.id, peer);
            this.emit('discovered', peer);
        }
        catch {
            const peer = {
                id: peripheral.id,
                name: `peer-${peripheral.id.slice(0, 8)}`,
                rssi: peripheral.rssi,
                isClaudePeer: true,
            };
            this.claudePeers.set(peripheral.id, peer);
            this.emit('discovered', peer);
        }
        finally {
            this.resolving.delete(peripheral.id);
        }
    }
    async scanAllDevices() {
        if (!this.scanning)
            await this.start();
        await noble.stopScanningAsync();
        this.allDevices.clear();
        this.scanMode = 'all';
        await noble.startScanningAsync([], true);
        await new Promise(resolve => setTimeout(resolve, 3000));
        await noble.stopScanningAsync();
        this.scanMode = 'peers';
        await noble.startScanningAsync([NORDIC_UART_SERVICE_UUID], true);
        return Array.from(this.allDevices.values());
    }
    getClaudePeers() {
        return Array.from(this.claudePeers.values());
    }
    getAllDevices() {
        return Array.from(this.allDevices.values());
    }
    async stop() {
        if (!this.scanning)
            return;
        await noble.stopScanningAsync();
        noble.removeAllListeners('discover');
        this.scanning = false;
    }
    isScanning() {
        return this.scanning;
    }
    getAdapterState() {
        return noble.state;
    }
    waitForPoweredOn() {
        return new Promise((resolve, reject) => {
            if (noble.state === 'poweredOn') {
                resolve();
                return;
            }
            const timeout = setTimeout(() => {
                reject(new Error(`BLE adapter state is "${noble.state}", expected "poweredOn"`));
            }, 10_000);
            noble.once('stateChange', (state) => {
                clearTimeout(timeout);
                if (state === 'poweredOn')
                    resolve();
                else
                    reject(new Error(`BLE adapter state changed to "${state}", expected "poweredOn"`));
            });
        });
    }
}
//# sourceMappingURL=scanner.js.map