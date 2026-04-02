import { type ProtocolMessage } from './constants.js';
export declare function encodeMessage(msg: ProtocolMessage): Buffer;
export declare function decodeMessage(buf: Buffer): ProtocolMessage;
export declare function chunkPayload(payload: Buffer, seq: number, mtu: number): Buffer[];
export declare function reassemble(chunks: Buffer[]): Buffer;
export declare class ReassemblyBuffer {
    private pending;
    ingest(chunk: Buffer): Buffer | null;
}
