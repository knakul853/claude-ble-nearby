export class PeerManager {
    peers = new Map();
    store;
    constructor(store) {
        this.store = store;
    }
    onDiscovered(id, name, rssi) {
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
    onPairRequestSent(id) {
        const peer = this.peers.get(id);
        if (peer && peer.status === 'discovered') {
            peer.status = 'pending';
        }
    }
    onPairAccepted(id) {
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
    onPairRejected(id) {
        const peer = this.peers.get(id);
        if (peer && peer.status === 'pending') {
            peer.status = 'discovered';
        }
    }
    onConnected(id) {
        const peer = this.peers.get(id);
        if (peer && peer.status === 'paired') {
            peer.status = 'connected';
        }
    }
    onDisconnected(id) {
        const peer = this.peers.get(id);
        if (peer && peer.status === 'connected') {
            peer.status = 'paired';
        }
    }
    unpair(id) {
        this.store.removePairedPeer(id);
        const peer = this.peers.get(id);
        if (peer) {
            peer.status = 'discovered';
        }
    }
    getPeer(id) {
        return this.peers.get(id);
    }
    getDiscoveredPeers() {
        return [...this.peers.values()];
    }
    getPairedPeerIds() {
        return [...this.peers.values()]
            .filter((p) => p.status === 'paired' || p.status === 'connected')
            .map((p) => p.id);
    }
}
//# sourceMappingURL=manager.js.map