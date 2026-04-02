import noble from '@stoprocent/noble';
import { EventEmitter } from 'node:events';
import { PEER_NAME_PREFIX } from './constants.js';

export interface DiscoveredPeer {
  id: string;
  name: string;
  rssi: number;
  isClaudePeer?: boolean;
}

export class BleScanner extends EventEmitter {
  private scanning = false;
  private allDevices: Map<string, DiscoveredPeer> = new Map();

  async start(): Promise<void> {
    if (this.scanning) return;

    await this.waitForPoweredOn();

    noble.on('discover', (peripheral) => {
      const name = peripheral.advertisement.localName;
      if (!name) return;

      const isClaudePeer = name.startsWith(PEER_NAME_PREFIX);
      const displayName = isClaudePeer ? name.slice(PEER_NAME_PREFIX.length) : name;

      const peer: DiscoveredPeer = {
        id: peripheral.id,
        name: displayName,
        rssi: peripheral.rssi,
        isClaudePeer,
      };

      this.allDevices.set(peripheral.id, peer);

      if (isClaudePeer) {
        this.emit('discovered', peer);
      }
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

  getAllDevices(): DiscoveredPeer[] {
    return Array.from(this.allDevices.values());
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
