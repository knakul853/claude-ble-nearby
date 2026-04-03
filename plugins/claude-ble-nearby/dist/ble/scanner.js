import noble from '@stoprocent/noble';
import { EventEmitter } from 'node:events';
import { NORDIC_UART_SERVICE_UUID, META_CHARACTERISTIC_UUID, PEER_NAME_PREFIX } from './constants.js';
export class BleScanner extends EventEmitter {
    ready = false;
    claudePeers = new Map();
    resolving = new Set();
    async ensureReady() {
        if (this.ready)
            return;
        await this.waitForPoweredOn();
        this.ready = true;
    }
    isClaudePeerPeripheral(peripheral) {
        const name = peripheral.advertisement.localName;
        if (name && name.startsWith(PEER_NAME_PREFIX))
            return true;
        const uuids = peripheral.advertisement.serviceUuids || [];
        return uuids.includes(NORDIC_UART_SERVICE_UUID);
    }
    async scanForPeers(durationMs = 5000) {
        await this.ensureReady();
        return new Promise(async (resolve) => {
            const onDiscover = (peripheral) => {
                if (!this.isClaudePeerPeripheral(peripheral))
                    return;
                if (this.claudePeers.has(peripheral.id) || this.resolving.has(peripheral.id))
                    return;
                const name = peripheral.advertisement.localName;
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
            };
            noble.on('discover', onDiscover);
            await noble.startScanningAsync([], true);
            setTimeout(async () => {
                await noble.stopScanningAsync();
                noble.removeListener('discover', onDiscover);
                resolve(Array.from(this.claudePeers.values()));
            }, durationMs);
        });
    }
    async scanAllDevices(durationMs = 3000) {
        await this.ensureReady();
        const devices = new Map();
        return new Promise(async (resolve) => {
            const onDiscover = (peripheral) => {
                const name = peripheral.advertisement.localName;
                if (!name)
                    return;
                const isClaudePeer = this.isClaudePeerPeripheral(peripheral);
                const displayName = (name.startsWith(PEER_NAME_PREFIX)) ? name.slice(PEER_NAME_PREFIX.length) : name;
                devices.set(peripheral.id, {
                    id: peripheral.id,
                    name: displayName,
                    rssi: peripheral.rssi,
                    isClaudePeer,
                });
            };
            noble.on('discover', onDiscover);
            await noble.startScanningAsync([], true);
            setTimeout(async () => {
                await noble.stopScanningAsync();
                noble.removeListener('discover', onDiscover);
                resolve(Array.from(devices.values()));
            }, durationMs);
        });
    }
    async resolvePeerName(peripheral) {
        this.resolving.add(peripheral.id);
        let peerName = peripheral.advertisement.localName || `peer-${peripheral.id.slice(0, 8)}`;
        try {
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 5000);
            await peripheral.connectAsync();
            clearTimeout(timeout);
            const { characteristics } = await peripheral.discoverSomeServicesAndCharacteristicsAsync([NORDIC_UART_SERVICE_UUID], [META_CHARACTERISTIC_UUID]);
            const metaChar = characteristics.find((c) => c.uuid === META_CHARACTERISTIC_UUID);
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
        }
        catch {
            // GATT connect failed — use whatever name we have
        }
        finally {
            this.resolving.delete(peripheral.id);
        }
        const peer = {
            id: peripheral.id,
            name: peerName,
            rssi: peripheral.rssi,
            isClaudePeer: true,
        };
        this.claudePeers.set(peripheral.id, peer);
        this.emit('discovered', peer);
    }
    getClaudePeers() {
        return Array.from(this.claudePeers.values());
    }
    isScanning() {
        return this.ready;
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