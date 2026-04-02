export declare const NORDIC_UART_SERVICE_UUID = "6e400001b5a3f393e0a9e50e24dcca9e";
export declare const PEER_NAME_PREFIX = "cc-";
export declare const NORDIC_UART_RX_UUID = "6e400002b5a3f393e0a9e50e24dcca9e";
export declare const NORDIC_UART_TX_UUID = "6e400003b5a3f393e0a9e50e24dcca9e";
export declare const META_CHARACTERISTIC_UUID = "6e400004b5a3f393e0a9e50e24dcca9e";
export declare const DEFAULT_IDLE_TIMEOUT_MS = 60000;
export declare const DEFAULT_MAX_CONNECTIONS = 5;
export declare const DEFAULT_MTU = 185;
export declare const MIN_MTU = 20;
export declare const CHUNK_HEADER_SIZE = 4;
export declare const FLAG_FIRST = 1;
export declare const FLAG_LAST = 2;
export type MessageType = 'chat' | 'pair_request' | 'pair_accept' | 'pair_reject' | 'presence';
export interface ProtocolMessage {
    type: MessageType;
    from: string;
    text: string;
    ts: number;
    seq: number;
}
export interface PeerInfo {
    id: string;
    name: string;
    rssi: number;
    status: 'discovered' | 'pending' | 'paired' | 'connected';
    lastSeen: number;
}
export interface PeerRecord {
    name: string;
    gitName: string | null;
    pairedAt: string;
}
export interface PluginConfig {
    identity: 'pseudo' | 'git';
    displayName: string | null;
    idleTimeout: number;
    maxConnections: number;
    autoAcceptPaired: boolean;
}
export declare const DEFAULT_CONFIG: PluginConfig;
