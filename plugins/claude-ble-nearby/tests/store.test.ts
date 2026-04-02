import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { PeerStore } from '../src/peer/store.js';
import { DEFAULT_CONFIG, type PeerRecord, type PluginConfig } from '../src/ble/constants.js';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

let tmpDir: string;
let store: PeerStore;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ble-store-'));
  store = new PeerStore(tmpDir);
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('PeerStore', () => {
  it('starts with empty paired list', () => {
    expect(store.getPairedPeers()).toEqual({});
  });

  it('adds and retrieves a paired peer', () => {
    const record: PeerRecord = { name: 'dev-coral-fox', gitName: null, pairedAt: '2026-04-03T00:00:00Z' };
    store.addPairedPeer('uuid-1', record);
    const peers = store.getPairedPeers();
    expect(peers['uuid-1']).toEqual(record);
  });

  it('removes a paired peer', () => {
    store.addPairedPeer('uuid-1', { name: 'dev-coral-fox', gitName: null, pairedAt: '2026-04-03T00:00:00Z' });
    store.removePairedPeer('uuid-1');
    expect(store.getPairedPeers()['uuid-1']).toBeUndefined();
  });

  it('persists across instances', () => {
    store.addPairedPeer('uuid-2', { name: 'dev-amber-wolf', gitName: 'Nakul', pairedAt: '2026-04-03T00:00:00Z' });
    const store2 = new PeerStore(tmpDir);
    expect(store2.getPairedPeers()['uuid-2']?.name).toBe('dev-amber-wolf');
  });

  it('returns default config when no config file exists', () => {
    expect(store.getConfig()).toEqual(DEFAULT_CONFIG);
  });

  it('saves and loads config', () => {
    const config: PluginConfig = { ...DEFAULT_CONFIG, identity: 'git', maxConnections: 3 };
    store.saveConfig(config);
    const store2 = new PeerStore(tmpDir);
    expect(store2.getConfig().identity).toBe('git');
    expect(store2.getConfig().maxConnections).toBe(3);
  });
});
