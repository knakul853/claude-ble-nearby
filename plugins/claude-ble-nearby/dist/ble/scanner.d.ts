import { EventEmitter } from 'node:events';
export interface DiscoveredPeer {
    id: string;
    name: string;
    rssi: number;
    isClaudePeer?: boolean;
}
export declare class BleScanner extends EventEmitter {
    private scanning;
    private scanMode;
    private allDevices;
    private claudePeers;
    private resolving;
    start(): Promise<void>;
    private resolvePeerName;
    scanAllDevices(): Promise<DiscoveredPeer[]>;
    getClaudePeers(): DiscoveredPeer[];
    getAllDevices(): DiscoveredPeer[];
    stop(): Promise<void>;
    isScanning(): boolean;
    getAdapterState(): string;
    private waitForPoweredOn;
}
