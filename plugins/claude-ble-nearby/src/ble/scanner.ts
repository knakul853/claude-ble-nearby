import noble, { type Peripheral } from '@stoprocent/noble';
import { EventEmitter } from 'node:events';
import { NORDIC_UART_SERVICE_UUID, META_CHARACTERISTIC_UUID, PEER_NAME_PREFIX } from './constants.js';

export interface DiscoveredPeer {
  id: string;
  name: string;
  rssi: number;
  isClaudePeer?: boolean;
}

export class BleScanner extends EventEmitter {
  private ready = false;
  private claudePeers: Map<string, DiscoveredPeer> = new Map();
  private resolving: Set<string> = new Set();

  async ensureReady(): Promise<void> {
    if (this.ready) return;
    await this.waitForPoweredOn();
    this.ready = true;
  }

  private isClaudePeerPeripheral(peripheral: Peripheral): boolean {
    const name = peripheral.advertisement.localName;
    if (name && name.startsWith(PEER_NAME_PREFIX)) return true;
    const uuids = peripheral.advertisement.serviceUuids || [];
    return uuids.includes(NORDIC_UART_SERVICE_UUID);
  }

  async scanForPeers(durationMs = 5000): Promise<DiscoveredPeer[]> {
    await this.ensureReady();

    return new Promise(async (resolve) => {
      const onDiscover = (peripheral: Peripheral) => {
        if (!this.isClaudePeerPeripheral(peripheral)) return;
        if (this.claudePeers.has(peripheral.id) || this.resolving.has(peripheral.id)) return;

        const name = peripheral.advertisement.localName;
        if (name && name.startsWith(PEER_NAME_PREFIX)) {
          const peer: DiscoveredPeer = {
            id: peripheral.id,
            name: name.slice(PEER_NAME_PREFIX.length),
            rssi: peripheral.rssi,
            isClaudePeer: true,
          };
          this.claudePeers.set(peripheral.id, peer);
          this.emit('discovered', peer);
        } else {
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

  async scanAllDevices(durationMs = 3000): Promise<DiscoveredPeer[]> {
    await this.ensureReady();

    const devices: Map<string, DiscoveredPeer> = new Map();

    return new Promise(async (resolve) => {
      const onDiscover = (peripheral: Peripheral) => {
        const name = peripheral.advertisement.localName;
        if (!name) return;
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

  private resolvePeerName(peripheral: Peripheral): void {
    this.resolving.add(peripheral.id);
    const baseName = peripheral.advertisement.localName || `peer-${peripheral.id.slice(0, 8)}`;

    const addPeer = (name: string) => {
      this.resolving.delete(peripheral.id);
      const peer: DiscoveredPeer = {
        id: peripheral.id,
        name,
        rssi: peripheral.rssi,
        isClaudePeer: true,
      };
      this.claudePeers.set(peripheral.id, peer);
      this.emit('discovered', peer);
    };

    const gattTimeout = setTimeout(() => {
      peripheral.disconnectAsync().catch(() => {});
      addPeer(baseName);
    }, 3000);

    peripheral.connectAsync().then(async () => {
      const { characteristics } = await peripheral.discoverSomeServicesAndCharacteristicsAsync(
        [NORDIC_UART_SERVICE_UUID],
        [META_CHARACTERISTIC_UUID],
      );
      const metaChar = characteristics.find((c) => c.uuid === META_CHARACTERISTIC_UUID);
      let name = baseName;
      if (metaChar) {
        const data = await metaChar.readAsync();
        try {
          const meta = JSON.parse(data.toString('utf-8'));
          if (meta.name) name = meta.name;
        } catch {}
      }
      await peripheral.disconnectAsync();
      clearTimeout(gattTimeout);
      addPeer(name);
    }).catch(() => {
      clearTimeout(gattTimeout);
      addPeer(baseName);
    });
  }

  getClaudePeers(): DiscoveredPeer[] {
    return Array.from(this.claudePeers.values());
  }

  isScanning(): boolean {
    return this.ready;
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
