import noble from '@stoprocent/noble';
import { EventEmitter } from 'node:events';
import { PEER_NAME_PREFIX } from './constants.js';
export class BleScanner extends EventEmitter {
    scanning = false;
    async start() {
        if (this.scanning)
            return;
        await this.waitForPoweredOn();
        noble.on('discover', (peripheral) => {
            const name = peripheral.advertisement.localName;
            if (!name || !name.startsWith(PEER_NAME_PREFIX))
                return;
            this.emit('discovered', {
                id: peripheral.id,
                name: name.slice(PEER_NAME_PREFIX.length),
                rssi: peripheral.rssi,
            });
        });
        await noble.startScanningAsync([], true);
        this.scanning = true;
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