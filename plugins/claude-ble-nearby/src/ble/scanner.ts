import noble from '@stoprocent/noble';
import { EventEmitter } from 'node:events';
import { PEER_NAME_PREFIX } from './constants.js';

export interface DiscoveredPeer {
  id: string;
  name: string;
  rssi: number;
}

export class BleScanner extends EventEmitter {
  private scanning = false;

  async start(): Promise<void> {
    if (this.scanning) return;

    await this.waitForPoweredOn();

    noble.on('discover', (peripheral) => {
      const name = peripheral.advertisement.localName;
      if (!name || !name.startsWith(PEER_NAME_PREFIX)) return;

      this.emit('discovered', {
        id: peripheral.id,
        name: name.slice(PEER_NAME_PREFIX.length),
        rssi: peripheral.rssi,
      } satisfies DiscoveredPeer);
    });

    await noble.startScanningAsync([], true);
    this.scanning = true;
  }

  async stop(): Promise<void> {
    if (!this.scanning) return;
    await noble.stopScanningAsync();
    noble.removeAllListeners('discover');
    this.scanning = false;
  }

  isScanning(): boolean {
    return this.scanning;
  }

  getAdapterState(): string {
    return noble.state;
  }

  private waitForPoweredOn(): Promise<void> {
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
        if (state === 'poweredOn') resolve();
        else reject(new Error(`BLE adapter state changed to "${state}", expected "poweredOn"`));
      });
    });
  }
}
