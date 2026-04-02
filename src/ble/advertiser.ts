import bleno from '@stoprocent/bleno';
import { EventEmitter } from 'node:events';
import {
  NORDIC_UART_SERVICE_UUID,
  NORDIC_UART_RX_UUID,
  NORDIC_UART_TX_UUID,
  META_CHARACTERISTIC_UUID,
} from './constants.js';

export class BleAdvertiser extends EventEmitter {
  private advertising = false;
  private localName: string;
  private txSubscription: ((data: Buffer) => void) | null = null;

  constructor(localName: string) {
    super();
    this.localName = localName;
  }

  async start(): Promise<void> {
    if (this.advertising) return;

    await this.waitForPoweredOn();

    const rxCharacteristic = new bleno.Characteristic({
      uuid: NORDIC_UART_RX_UUID,
      properties: ['write', 'writeWithoutResponse'],
      onWriteRequest: (data: Buffer, _offset: number, _withoutResponse: boolean, callback: (result: number) => void) => {
        this.emit('data', data);
        callback(bleno.Characteristic.RESULT_SUCCESS);
      },
    });

    let notifyCallback: ((data: Buffer) => void) | null = null;

    const txCharacteristic = new bleno.Characteristic({
      uuid: NORDIC_UART_TX_UUID,
      properties: ['notify'],
      onSubscribe: (_maxValueSize: number, updateValueCallback: (data: Buffer) => void) => {
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
      onReadRequest: (_offset: number, callback: (result: number, data?: Buffer) => void) => {
        const meta = JSON.stringify({ name: this.localName, version: '0.1.0' });
        callback(bleno.Characteristic.RESULT_SUCCESS, Buffer.from(meta, 'utf-8'));
      },
    });

    const service = new bleno.PrimaryService({
      uuid: NORDIC_UART_SERVICE_UUID,
      characteristics: [rxCharacteristic, txCharacteristic, metaCharacteristic],
    });

    return new Promise<void>((resolve, reject) => {
      bleno.startAdvertising(this.localName, [NORDIC_UART_SERVICE_UUID], (err?: Error | null) => {
        if (err) {
          reject(err);
          return;
        }
        bleno.setServices([service], (err?: Error | null) => {
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

  async stop(): Promise<void> {
    if (!this.advertising) return;
    bleno.stopAdvertising();
    this.advertising = false;
  }

  sendNotification(data: Buffer): boolean {
    if (!this.txSubscription) return false;
    this.txSubscription(data);
    return true;
  }

  isAdvertising(): boolean {
    return this.advertising;
  }

  setLocalName(name: string): void {
    this.localName = name;
  }

  private waitForPoweredOn(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (bleno.state === 'poweredOn') {
        resolve();
        return;
      }
      const timeout = setTimeout(() => {
        reject(new Error(`BLE adapter state is "${bleno.state}", expected "poweredOn"`));
      }, 10_000);

      bleno.once('stateChange', (state: string) => {
        clearTimeout(timeout);
        if (state === 'poweredOn') resolve();
        else reject(new Error(`BLE adapter state changed to "${state}"`));
      });
    });
  }
}
