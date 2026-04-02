import { type PeerRecord, type PluginConfig } from '../ble/constants.js';
export declare class PeerStore {
    private dataDir;
    private peers;
    private config;
    constructor(dataDir: string);
    getPairedPeers(): Record<string, PeerRecord>;
    addPairedPeer(id: string, record: PeerRecord): void;
    removePairedPeer(id: string): void;
    isPaired(id: string): boolean;
    getConfig(): PluginConfig;
    saveConfig(config: PluginConfig): void;
    private loadJson;
    private saveJson;
}
