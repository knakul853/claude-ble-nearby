import noble, { type Peripheral, type Characteristic } from '@stoprocent/noble';
import { EventEmitter } from 'node:events';
import {
  NORDIC_UART_SERVICE_UUID,
  NORDIC_UART_RX_UUID,
  NORDIC_UART_TX_UUID,
  DEFAULT_IDLE_TIMEOUT_MS,
  DEFAULT_MAX_CONNECTIONS,
} from './constants.js';

interface ActiveConnection {
  peripheral: Peripheral;
  rxCharacteristic: Characteristic;
  txCharacteristic: Characteristic;
  lastActivity: number;
  idleTimer: ReturnType<typeof setTimeout>;
}

export class ConnectionManager extends EventEmitter {
  private connections = new Map<string, ActiveConnection>();
  private maxConnections: number;
  private idleTimeoutMs: number;

  constructor(maxConnections = DEFAULT_MAX_CONNECTIONS, idleTimeoutMs = DEFAULT_IDLE_TIMEOUT_MS) {
    super();
    this.maxConnections = maxConnections;
    this.idleTimeoutMs = idleTimeoutMs;
  }

  async connect(peripheral: Peripheral): Promise<void> {
    const id = peripheral.id;
    if (this.connections.has(id)) return;

    if (this.connections.size >= this.maxConnections) {
      this.dropOldestIdle();
    }

    await peripheral.connectAsync();
    const { characteristics } = await peripheral.discoverSomeServicesAndCharacteristicsAsync(
      [NORDIC_UART_SERVICE_UUID],
      [NORDIC_UART_RX_UUID, NORDIC_UART_TX_UUID],
    );

    const rxChar = characteristics.find((c) => c.uuid === NORDIC_UART_RX_UUID);
    const txChar = characteristics.find((c) => c.uuid === NORDIC_UART_TX_UUID);

    if (!rxChar || !txChar) {
      await peripheral.disconnectAsync();
      throw new Error(`Peer ${id} missing UART characteristics`);
    }

    await txChar.subscribeAsync();

    txChar.on('data', (data: Buffer) => {
      const conn = this.connections.get(id);
      if (conn) conn.lastActivity = Date.now();
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

  async write(peerId: string, data: Buffer): Promise<void> {
    const conn = this.connections.get(peerId);
    if (!conn) throw new Error(`No connection to peer ${peerId}`);

    conn.lastActivity = Date.now();
    this.resetIdleTimer(peerId);
    await conn.rxCharacteristic.writeAsync(data, false);
  }

  async disconnect(peerId: string): Promise<void> {
    const conn = this.connections.get(peerId);
    if (!conn) return;
    clearTimeout(conn.idleTimer);
    await conn.peripheral.disconnectAsync();
    this.connections.delete(peerId);
  }

  isConnected(peerId: string): boolean {
    return this.connections.has(peerId);
  }

  getConnectionCount(): number {
    return this.connections.size;
  }

  getConnectedPeerIds(): string[] {
    return [...this.connections.keys()];
  }

  async disconnectAll(): Promise<void> {
    const ids = [...this.connections.keys()];
    await Promise.all(ids.map((id) => this.disconnect(id)));
  }

  private cleanup(id: string): void {
    const conn = this.connections.get(id);
    if (conn) {
      clearTimeout(conn.idleTimer);
      this.connections.delete(id);
    }
  }

  private dropOldestIdle(): void {
    let oldest: { id: string; lastActivity: number } | null = null;
    for (const [id, conn] of this.connections) {
      if (!oldest || conn.lastActivity < oldest.lastActivity) {
        oldest = { id, lastActivity: conn.lastActivity };
      }
    }
    if (oldest) {
      this.disconnect(oldest.id).catch(() => {});
    }
  }

  private startIdleTimer(id: string): ReturnType<typeof setTimeout> {
    return setTimeout(() => {
      this.disconnect(id).catch(() => {});
    }, this.idleTimeoutMs);
  }

  private resetIdleTimer(id: string): void {
    const conn = this.connections.get(id);
    if (!conn) return;
    clearTimeout(conn.idleTimer);
    conn.idleTimer = this.startIdleTimer(id);
  }
}
