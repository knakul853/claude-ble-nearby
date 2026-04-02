import type { PeerInfo } from '../ble/constants.js';
import type { PeerStore } from './store.js';

export class PeerManager {
  private peers = new Map<string, PeerInfo>();
  private store: PeerStore;

  constructor(store: PeerStore) {
    this.store = store;
  }

  onDiscovered(id: string, name: string, rssi: number): void {
    const existing = this.peers.get(id);
    const isPaired = this.store.isPaired(id);

    if (existing) {
      existing.rssi = rssi;
      existing.lastSeen = Date.now();
      if (isPaired && existing.status === 'discovered') {
        existing.status = 'paired';
      }
      return;
    }

    this.peers.set(id, {
      id,
      name,
      rssi,
      status: isPaired ? 'paired' : 'discovered',
      lastSeen: Date.now(),
    });
  }

  onPairRequestSent(id: string): void {
    const peer = this.peers.get(id);
    if (peer && peer.status === 'discovered') {
      peer.status = 'pending';
    }
  }

  onPairAccepted(id: string): void {
    const peer = this.peers.get(id);
    if (peer && peer.status === 'pending') {
      peer.status = 'paired';
      this.store.addPairedPeer(id, {
        name: peer.name,
        gitName: null,
        pairedAt: new Date().toISOString(),
      });
    }
  }

  onPairRejected(id: string): void {
    const peer = this.peers.get(id);
    if (peer && peer.status === 'pending') {
      peer.status = 'discovered';
    }
  }

  onConnected(id: string): void {
    const peer = this.peers.get(id);
    if (peer && peer.status === 'paired') {
      peer.status = 'connected';
    }
  }

  onDisconnected(id: string): void {
    const peer = this.peers.get(id);
    if (peer && peer.status === 'connected') {
      peer.status = 'paired';
    }
  }

  unpair(id: string): void {
    this.store.removePairedPeer(id);
    const peer = this.peers.get(id);
    if (peer) {
      peer.status = 'discovered';
    }
  }

  getPeer(id: string): PeerInfo | undefined {
    return this.peers.get(id);
  }

  getDiscoveredPeers(): PeerInfo[] {
    return [...this.peers.values()];
  }

  getPairedPeerIds(): string[] {
    return [...this.peers.values()]
      .filter((p) => p.status === 'paired' || p.status === 'connected')
      .map((p) => p.id);
  }
}
