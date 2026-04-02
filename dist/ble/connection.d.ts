import { type Peripheral } from '@stoprocent/noble';
import { EventEmitter } from 'node:events';
export declare class ConnectionManager extends EventEmitter {
    private connections;
    private maxConnections;
    private idleTimeoutMs;
    constructor(maxConnections?: number, idleTimeoutMs?: number);
    connect(peripheral: Peripheral): Promise<void>;
    write(peerId: string, data: Buffer): Promise<void>;
    disconnect(peerId: string): Promise<void>;
    isConnected(peerId: string): boolean;
    getConnectionCount(): number;
    getConnectedPeerIds(): string[];
    disconnectAll(): Promise<void>;
    private cleanup;
    private dropOldestIdle;
    private startIdleTimer;
    private resetIdleTimer;
}
