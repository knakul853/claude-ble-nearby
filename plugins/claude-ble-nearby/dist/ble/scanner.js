import noble from '@stoprocent/noble';
import { EventEmitter } from 'node:events';
import { NORDIC_UART_SERVICE_UUID } from './constants.js';
export class BleScanner extends EventEmitter {
    scanning = false;
    async start() {
        if (this.scanning)
            return;
        await this.waitForPoweredOn();
        noble.on('discover', (peripheral) => {
            const name = peripheral.advertisement.localName;
            if (!name)
                return;
            const serviceUuids = peripheral.advertisement.serviceUuids || [];
            if (!serviceUuids.includes(NORDIC_UART_SERVICE_UUID))
                return;
            this.emit('discovered', {
                id: peripheral.id,
                name,
                rssi: peripheral.rssi,
            });
        });
        await noble.startScanningAsync([NORDIC_UART_SERVICE_UUID], true);
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