import { EventEmitter } from 'node:events';
export interface DiscoveredPeer {
    id: string;
    name: string;
    rssi: number;
    isClaudePeer?: boolean;
}
export declare class BleScanner extends EventEmitter {
    private scanning;
    private allDevices;
    start(): Promise<void>;
    stop(): Promise<void>;
    getAllDevices(): DiscoveredPeer[];
    isScanning(): boolean;
    getAdapterState(): string;
    private waitForPoweredOn;
}
