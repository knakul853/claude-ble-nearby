import { CHUNK_HEADER_SIZE, FLAG_FIRST, FLAG_LAST, } from './constants.js';
export function encodeMessage(msg) {
    return Buffer.from(JSON.stringify(msg), 'utf-8');
}
export function decodeMessage(buf) {
    return JSON.parse(buf.toString('utf-8'));
}
export function chunkPayload(payload, seq, mtu) {
    const dataPerChunk = mtu - CHUNK_HEADER_SIZE;
    if (dataPerChunk <= 0) {
        throw new Error(`MTU ${mtu} too small for header size ${CHUNK_HEADER_SIZE}`);
    }
    const totalChunks = Math.ceil(payload.length / dataPerChunk);
    const chunks = [];
    for (let i = 0; i < totalChunks; i++) {
        const start = i * dataPerChunk;
        const end = Math.min(start + dataPerChunk, payload.length);
        const data = payload.subarray(start, end);
        let flags = 0;
        if (i === 0)
            flags |= FLAG_FIRST;
        if (i === totalChunks - 1)
            flags |= FLAG_LAST;
        const header = Buffer.alloc(CHUNK_HEADER_SIZE);
        header[0] = flags;
        header[1] = seq;
        header[2] = i;
        header[3] = totalChunks;
        chunks.push(Buffer.concat([header, data]));
    }
    return chunks;
}
export function reassemble(chunks) {
    const parts = chunks
        .map((c) => ({ index: c[2], data: c.subarray(CHUNK_HEADER_SIZE) }))
        .sort((a, b) => a.index - b.index)
        .map((c) => c.data);
    return Buffer.concat(parts);
}
export class ReassemblyBuffer {
    pending = new Map();
    ingest(chunk) {
        const seq = chunk[1];
        const chunkIndex = chunk[2];
        const totalChunks = chunk[3];
        const data = chunk.subarray(CHUNK_HEADER_SIZE);
        let entry = this.pending.get(seq);
        if (!entry) {
            entry = { totalChunks, received: new Map() };
            this.pending.set(seq, entry);
        }
        entry.received.set(chunkIndex, data);
        if (entry.received.size === entry.totalChunks) {
            const parts = [];
            for (let i = 0; i < entry.totalChunks; i++) {
                parts.push(entry.received.get(i));
            }
            this.pending.delete(seq);
            return Buffer.concat(parts);
        }
        return null;
    }
}
//# sourceMappingURL=protocol.js.map