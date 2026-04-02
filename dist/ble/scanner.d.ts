import { EventEmitter } from 'node:events';
export interface DiscoveredPeer {
    id: string;
    name: string;
    rssi: number;
}
export declare class BleScanner extends EventEmitter {
    private scanning;
    start(): Promise<void>;
    stop(): Promise<void>;
    isScanning(): boolean;
    getAdapterState(): string;
    private waitForPoweredOn;
}
