import { EventEmitter } from 'node:events';
export interface DiscoveredPeer {
    id: string;
    name: string;
    rssi: number;
    isClaudePeer?: boolean;
}
export declare class BleScanner extends EventEmitter {
    private ready;
    private claudePeers;
    private resolving;
    ensureReady(): Promise<void>;
    private isClaudePeerPeripheral;
    scanForPeers(durationMs?: number): Promise<DiscoveredPeer[]>;
    scanAllDevices(durationMs?: number): Promise<DiscoveredPeer[]>;
    private resolvePeerName;
    getClaudePeers(): DiscoveredPeer[];
    isScanning(): boolean;
    getAdapterState(): string;
    private waitForPoweredOn;
}
