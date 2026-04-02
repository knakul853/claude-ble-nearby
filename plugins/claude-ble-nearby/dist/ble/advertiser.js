import bleno from '@stoprocent/bleno';
import { EventEmitter } from 'node:events';
import { NORDIC_UART_SERVICE_UUID, NORDIC_UART_RX_UUID, NORDIC_UART_TX_UUID, META_CHARACTERISTIC_UUID, PEER_NAME_PREFIX, } from './constants.js';
export class BleAdvertiser extends EventEmitter {
    advertising = false;
    localName;
    txSubscription = null;
    constructor(localName) {
        super();
        this.localName = localName;
    }
    async start() {
        if (this.advertising)
            return;
        await this.waitForPoweredOn();
        const rxCharacteristic = new bleno.Characteristic({
            uuid: NORDIC_UART_RX_UUID,
            properties: ['write', 'writeWithoutResponse'],
            onWriteRequest: (data, _offset, _withoutResponse, callback) => {
                this.emit('data', data);
                callback(bleno.Characteristic.RESULT_SUCCESS);
            },
        });
        let notifyCallback = null;
        const txCharacteristic = new bleno.Characteristic({
            uuid: NORDIC_UART_TX_UUID,
            properties: ['notify'],
            onSubscribe: (_maxValueSize, updateValueCallback) => {
                notifyCallback = updateValueCallback;
                this.txSubscription = updateValueCallback;
                this.emit('subscribed');
            },
            onUnsubscribe: () => {
                notifyCallback = null;
                this.txSubscription = null;
                this.emit('unsubscribed');
            },
        });
        const metaCharacteristic = new bleno.Characteristic({
            uuid: META_CHARACTERISTIC_UUID,
            properties: ['read'],
            onReadRequest: (_offset, callback) => {
                const meta = JSON.stringify({ name: this.localName, version: '0.1.0' });
                callback(bleno.Characteristic.RESULT_SUCCESS, Buffer.from(meta, 'utf-8'));
            },
        });
        const service = new bleno.PrimaryService({
            uuid: NORDIC_UART_SERVICE_UUID,
            characteristics: [rxCharacteristic, txCharacteristic, metaCharacteristic],
        });
        return new Promise((resolve, reject) => {
            bleno.startAdvertising(PEER_NAME_PREFIX + this.localName, [NORDIC_UART_SERVICE_UUID], (err) => {
                if (err) {
                    reject(err);
                    return;
                }
                bleno.setServices([service], (err) => {
                    if (err) {
                        reject(err);
                        return;
                    }
                    this.advertising = true;
                    resolve();
                });
            });
        });
    }
    async stop() {
        if (!this.advertising)
            return;
        bleno.stopAdvertising();
        this.advertising = false;
    }
    sendNotification(data) {
        if (!this.txSubscription)
            return false;
        this.txSubscription(data);
        return true;
    }
    isAdvertising() {
        return this.advertising;
    }
    setLocalName(name) {
        this.localName = name;
    }
    waitForPoweredOn() {
        return new Promise((resolve, reject) => {
            if (bleno.state === 'poweredOn') {
                resolve();
                return;
            }
            const timeout = setTimeout(() => {
                reject(new Error(`BLE adapter state is "${bleno.state}", expected "poweredOn"`));
            }, 10_000);
            bleno.once('stateChange', (state) => {
                clearTimeout(timeout);
                if (state === 'poweredOn')
                    resolve();
                else
                    reject(new Error(`BLE adapter state changed to "${state}"`));
            });
        });
    }
}
//# sourceMappingURL=advertiser.js.map