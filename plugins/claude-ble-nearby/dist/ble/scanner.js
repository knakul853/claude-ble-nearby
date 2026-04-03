import noble from '@stoprocent/noble';
import { EventEmitter } from 'node:events';
import { NORDIC_UART_SERVICE_UUID, PEER_NAME_PREFIX } from './constants.js';
export class BleScanner extends EventEmitter {
    scanning = false;
    scanMode = 'peers';
    allDevices = new Map();
    claudePeers = new Map();
    async start() {
        if (this.scanning)
            return;
        await this.waitForPoweredOn();
        noble.on('discover', (peripheral) => {
            const name = peripheral.advertisement.localName;
            if (this.scanMode === 'peers') {
                // UUID-filtered scan: every device here IS a Claude peer
                // macOS strips localName from background ads, so name may be null
                const displayName = name
                    ? (name.startsWith(PEER_NAME_PREFIX) ? name.slice(PEER_NAME_PREFIX.length) : name)
                    : `peer-${peripheral.id.slice(0, 8)}`;
                const peer = {
                    id: peripheral.id,
                    name: displayName,
                    rssi: peripheral.rssi,
                    isClaudePeer: true,
                };
                this.claudePeers.set(peripheral.id, peer);
                this.emit('discovered', peer);
            }
            else {
                // Unfiltered scan: all BLE devices for debug
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
        // Scan for our service UUID specifically.
        // On macOS, CoreBluetooth puts custom UUIDs in an "overflow" area
        // that is ONLY discoverable when scanning with a UUID filter.
        await noble.startScanningAsync([NORDIC_UART_SERVICE_UUID], true);
        this.scanMode = 'peers';
        this.scanning = true;
    }
    async scanAllDevices() {
        if (!this.scanning)
            await this.start();
        // Switch to unfiltered scan briefly to collect all devices
        await noble.stopScanningAsync();
        this.allDevices.clear();
        this.scanMode = 'all';
        await noble.startScanningAsync([], true);
        // Collect for 3 seconds
        await new Promise(resolve => setTimeout(resolve, 3000));
        // Switch back to Claude peer scan
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