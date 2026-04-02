import fs from 'node:fs';
import path from 'node:path';
import { DEFAULT_CONFIG } from '../ble/constants.js';
const PEERS_FILE = 'peers.json';
const CONFIG_FILE = 'config.json';
export class PeerStore {
    dataDir;
    peers;
    config;
    constructor(dataDir) {
        this.dataDir = dataDir;
        fs.mkdirSync(dataDir, { recursive: true });
        this.peers = this.loadJson(PEERS_FILE, {});
        this.config = { ...DEFAULT_CONFIG, ...this.loadJson(CONFIG_FILE, {}) };
    }
    getPairedPeers() {
        return { ...this.peers };
    }
    addPairedPeer(id, record) {
        this.peers[id] = record;
        this.saveJson(PEERS_FILE, this.peers);
    }
    removePairedPeer(id) {
        delete this.peers[id];
        this.saveJson(PEERS_FILE, this.peers);
    }
    isPaired(id) {
        return id in this.peers;
    }
    getConfig() {
        return { ...this.config };
    }
    saveConfig(config) {
        this.config = config;
        this.saveJson(CONFIG_FILE, config);
    }
    loadJson(filename, fallback) {
        const filepath = path.join(this.dataDir, filename);
        try {
            return JSON.parse(fs.readFileSync(filepath, 'utf-8'));
        }
        catch {
            return fallback;
        }
    }
    saveJson(filename, data) {
        const filepath = path.join(this.dataDir, filename);
        fs.writeFileSync(filepath, JSON.stringify(data, null, 2), 'utf-8');
    }
}
//# sourceMappingURL=store.js.map