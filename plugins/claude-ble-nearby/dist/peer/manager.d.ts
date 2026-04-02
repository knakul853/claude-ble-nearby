import type { PeerInfo } from '../ble/constants.js';
import type { PeerStore } from './store.js';
export declare class PeerManager {
    private peers;
    private store;
    constructor(store: PeerStore);
    onDiscovered(id: string, name: string, rssi: number): void;
    onPairRequestSent(id: string): void;
    onPairAccepted(id: string): void;
    onPairRejected(id: string): void;
    onConnected(id: string): void;
    onDisconnected(id: string): void;
    unpair(id: string): void;
    getPeer(id: string): PeerInfo | undefined;
    getDiscoveredPeers(): PeerInfo[];
    getPairedPeerIds(): string[];
}
