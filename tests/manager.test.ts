import { describe, it, expect, beforeEach } from 'vitest';
import { PeerManager } from '../src/peer/manager.js';
import { PeerStore } from '../src/peer/store.js';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

let tmpDir: string;
let store: PeerStore;
let manager: PeerManager;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ble-mgr-'));
  store = new PeerStore(tmpDir);
  manager = new PeerManager(store);
});

describe('PeerManager', () => {
  it('registers a discovered peer', () => {
    manager.onDiscovered('uuid-1', 'dev-coral-fox', -65);
    const peers = manager.getDiscoveredPeers();
    expect(peers).toHaveLength(1);
    expect(peers[0].id).toBe('uuid-1');
    expect(peers[0].status).toBe('discovered');
  });

  it('updates rssi and lastSeen on re-discovery', () => {
    manager.onDiscovered('uuid-1', 'dev-coral-fox', -65);
    manager.onDiscovered('uuid-1', 'dev-coral-fox', -50);
    const peers = manager.getDiscoveredPeers();
    expect(peers).toHaveLength(1);
    expect(peers[0].rssi).toBe(-50);
  });

  it('transitions discovered → pending on pair request sent', () => {
    manager.onDiscovered('uuid-1', 'dev-coral-fox', -65);
    manager.onPairRequestSent('uuid-1');
    const peer = manager.getPeer('uuid-1');
    expect(peer?.status).toBe('pending');
  });

  it('transitions pending → paired on pair accepted', () => {
    manager.onDiscovered('uuid-1', 'dev-coral-fox', -65);
    manager.onPairRequestSent('uuid-1');
    manager.onPairAccepted('uuid-1');
    const peer = manager.getPeer('uuid-1');
    expect(peer?.status).toBe('paired');
    expect(store.isPaired('uuid-1')).toBe(true);
  });

  it('transitions back to discovered on pair rejected', () => {
    manager.onDiscovered('uuid-1', 'dev-coral-fox', -65);
    manager.onPairRequestSent('uuid-1');
    manager.onPairRejected('uuid-1');
    const peer = manager.getPeer('uuid-1');
    expect(peer?.status).toBe('discovered');
  });

  it('marks paired peer as connected', () => {
    manager.onDiscovered('uuid-1', 'dev-coral-fox', -65);
    manager.onPairRequestSent('uuid-1');
    manager.onPairAccepted('uuid-1');
    manager.onConnected('uuid-1');
    expect(manager.getPeer('uuid-1')?.status).toBe('connected');
  });

  it('marks connected peer back to paired on disconnect', () => {
    manager.onDiscovered('uuid-1', 'dev-coral-fox', -65);
    manager.onPairRequestSent('uuid-1');
    manager.onPairAccepted('uuid-1');
    manager.onConnected('uuid-1');
    manager.onDisconnected('uuid-1');
    expect(manager.getPeer('uuid-1')?.status).toBe('paired');
  });

  it('unpair removes peer from store and sets status to discovered', () => {
    manager.onDiscovered('uuid-1', 'dev-coral-fox', -65);
    manager.onPairRequestSent('uuid-1');
    manager.onPairAccepted('uuid-1');
    manager.unpair('uuid-1');
    expect(manager.getPeer('uuid-1')?.status).toBe('discovered');
    expect(store.isPaired('uuid-1')).toBe(false);
  });

  it('loads previously paired peers from store on init', () => {
    store.addPairedPeer('uuid-old', { name: 'dev-old-bear', gitName: null, pairedAt: '2026-01-01T00:00:00Z' });
    const mgr2 = new PeerManager(store);
    mgr2.onDiscovered('uuid-old', 'dev-old-bear', -70);
    expect(mgr2.getPeer('uuid-old')?.status).toBe('paired');
  });
});
