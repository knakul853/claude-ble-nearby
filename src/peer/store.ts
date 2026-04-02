import fs from 'node:fs';
import path from 'node:path';
import { DEFAULT_CONFIG, type PeerRecord, type PluginConfig } from '../ble/constants.js';

const PEERS_FILE = 'peers.json';
const CONFIG_FILE = 'config.json';

export class PeerStore {
  private dataDir: string;
  private peers: Record<string, PeerRecord>;
  private config: PluginConfig;

  constructor(dataDir: string) {
    this.dataDir = dataDir;
    fs.mkdirSync(dataDir, { recursive: true });
    this.peers = this.loadJson(PEERS_FILE, {});
    this.config = { ...DEFAULT_CONFIG, ...this.loadJson(CONFIG_FILE, {}) };
  }

  getPairedPeers(): Record<string, PeerRecord> {
    return { ...this.peers };
  }

  addPairedPeer(id: string, record: PeerRecord): void {
    this.peers[id] = record;
    this.saveJson(PEERS_FILE, this.peers);
  }

  removePairedPeer(id: string): void {
    delete this.peers[id];
    this.saveJson(PEERS_FILE, this.peers);
  }

  isPaired(id: string): boolean {
    return id in this.peers;
  }

  getConfig(): PluginConfig {
    return { ...this.config };
  }

  saveConfig(config: PluginConfig): void {
    this.config = config;
    this.saveJson(CONFIG_FILE, config);
  }

  private loadJson<T>(filename: string, fallback: T): T {
    const filepath = path.join(this.dataDir, filename);
    try {
      return JSON.parse(fs.readFileSync(filepath, 'utf-8'));
    } catch {
      return fallback;
    }
  }

  private saveJson(filename: string, data: unknown): void {
    const filepath = path.join(this.dataDir, filename);
    fs.writeFileSync(filepath, JSON.stringify(data, null, 2), 'utf-8');
  }
}
