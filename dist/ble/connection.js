import { EventEmitter } from 'node:events';
import { NORDIC_UART_SERVICE_UUID, NORDIC_UART_RX_UUID, NORDIC_UART_TX_UUID, DEFAULT_IDLE_TIMEOUT_MS, DEFAULT_MAX_CONNECTIONS, } from './constants.js';
export class ConnectionManager extends EventEmitter {
    connections = new Map();
    maxConnections;
    idleTimeoutMs;
    constructor(maxConnections = DEFAULT_MAX_CONNECTIONS, idleTimeoutMs = DEFAULT_IDLE_TIMEOUT_MS) {
        super();
        this.maxConnections = maxConnections;
        this.idleTimeoutMs = idleTimeoutMs;
    }
    async connect(peripheral) {
        const id = peripheral.id;
        if (this.connections.has(id))
            return;
        if (this.connections.size >= this.maxConnections) {
            this.dropOldestIdle();
        }
        await peripheral.connectAsync();
        const { characteristics } = await peripheral.discoverSomeServicesAndCharacteristicsAsync([NORDIC_UART_SERVICE_UUID], [NORDIC_UART_RX_UUID, NORDIC_UART_TX_UUID]);
        const rxChar = characteristics.find((c) => c.uuid === NORDIC_UART_RX_UUID);
        const txChar = characteristics.find((c) => c.uuid === NORDIC_UART_TX_UUID);
        if (!rxChar || !txChar) {
            await peripheral.disconnectAsync();
            throw new Error(`Peer ${id} missing UART characteristics`);
        }
        await txChar.subscribeAsync();
        txChar.on('data', (data) => {
            const conn = this.connections.get(id);
            if (conn)
                conn.lastActivity = Date.now();
            this.emit('data', id, data);
        });
        peripheral.once('disconnect', () => {
            this.cleanup(id);
            this.emit('disconnected', id);
        });
        const idleTimer = this.startIdleTimer(id);
        this.connections.set(id, {
            peripheral,
            rxCharacteristic: rxChar,
            txCharacteristic: txChar,
            lastActivity: Date.now(),
            idleTimer,
        });
        this.emit('connected', id);
    }
    async write(peerId, data) {
        const conn = this.connections.get(peerId);
        if (!conn)
            throw new Error(`No connection to peer ${peerId}`);
        conn.lastActivity = Date.now();
        this.resetIdleTimer(peerId);
        await conn.rxCharacteristic.writeAsync(data, false);
    }
    async disconnect(peerId) {
        const conn = this.connections.get(peerId);
        if (!conn)
            return;
        clearTimeout(conn.idleTimer);
        await conn.peripheral.disconnectAsync();
        this.connections.delete(peerId);
    }
    isConnected(peerId) {
        return this.connections.has(peerId);
    }
    getConnectionCount() {
        return this.connections.size;
    }
    getConnectedPeerIds() {
        return [...this.connections.keys()];
    }
    async disconnectAll() {
        const ids = [...this.connections.keys()];
        await Promise.all(ids.map((id) => this.disconnect(id)));
    }
    cleanup(id) {
        const conn = this.connections.get(id);
        if (conn) {
            clearTimeout(conn.idleTimer);
            this.connections.delete(id);
        }
    }
    dropOldestIdle() {
        let oldest = null;
        for (const [id, conn] of this.connections) {
            if (!oldest || conn.lastActivity < oldest.lastActivity) {
                oldest = { id, lastActivity: conn.lastActivity };
            }
        }
        if (oldest) {
            this.disconnect(oldest.id).catch(() => { });
        }
    }
    startIdleTimer(id) {
        return setTimeout(() => {
            this.disconnect(id).catch(() => { });
        }, this.idleTimeoutMs);
    }
    resetIdleTimer(id) {
        const conn = this.connections.get(id);
        if (!conn)
            return;
        clearTimeout(conn.idleTimer);
        conn.idleTimer = this.startIdleTimer(id);
    }
}
//# sourceMappingURL=connection.js.map