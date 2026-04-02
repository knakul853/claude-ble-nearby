import { describe, it, expect } from 'vitest';
import {
  encodeMessage,
  chunkPayload,
  reassemble,
  ReassemblyBuffer,
} from '../src/ble/protocol.js';
import type { ProtocolMessage } from '../src/ble/constants.js';

describe('encodeMessage / decodeMessage', () => {
  it('encodes a protocol message to a JSON buffer', () => {
    const msg: ProtocolMessage = {
      type: 'chat',
      from: 'dev-coral-fox',
      text: 'hello',
      ts: 1712150400,
      seq: 1,
    };
    const buf = encodeMessage(msg);
    expect(JSON.parse(buf.toString('utf-8'))).toEqual(msg);
  });
});

describe('chunkPayload', () => {
  it('returns a single chunk when payload fits in MTU', () => {
    const payload = Buffer.from('hi');
    const chunks = chunkPayload(payload, 1, 185);
    expect(chunks).toHaveLength(1);
    expect(chunks[0][0]).toBe(0x03); // FLAG_FIRST | FLAG_LAST
    expect(chunks[0][1]).toBe(1);    // seq
    expect(chunks[0][2]).toBe(0);    // chunkIndex
    expect(chunks[0][3]).toBe(1);    // totalChunks
    expect(chunks[0].subarray(4).toString('utf-8')).toBe('hi');
  });

  it('splits large payloads into multiple chunks', () => {
    const payload = Buffer.alloc(400, 0x41);
    const mtu = 24; // 4 header + 20 data per chunk
    const chunks = chunkPayload(payload, 2, mtu);
    expect(chunks.length).toBe(20);
    expect(chunks[0][0] & 0x01).toBe(1);  // first flag
    expect(chunks[0][0] & 0x02).toBe(0);  // not last
    expect(chunks[chunks.length - 1][0] & 0x02).toBe(2); // last flag
  });

  it('every chunk has correct seq number', () => {
    const payload = Buffer.alloc(100, 0x42);
    const chunks = chunkPayload(payload, 7, 24);
    for (const chunk of chunks) {
      expect(chunk[1]).toBe(7);
    }
  });
});

describe('ReassemblyBuffer', () => {
  it('reassembles single-chunk messages immediately', () => {
    const rb = new ReassemblyBuffer();
    const payload = Buffer.from('hello');
    const chunks = chunkPayload(payload, 1, 185);
    const result = rb.ingest(chunks[0]);
    expect(result).not.toBeNull();
    expect(result!.toString('utf-8')).toBe('hello');
  });

  it('reassembles multi-chunk messages in order', () => {
    const rb = new ReassemblyBuffer();
    const payload = Buffer.alloc(50, 0x43);
    const chunks = chunkPayload(payload, 3, 24);
    let result: Buffer | null = null;
    for (const chunk of chunks) {
      result = rb.ingest(chunk);
    }
    expect(result).not.toBeNull();
    expect(result!.length).toBe(50);
    expect(result!.every((b) => b === 0x43)).toBe(true);
  });

  it('reassembles multi-chunk messages out of order', () => {
    const rb = new ReassemblyBuffer();
    const payload = Buffer.from('abcdefghijklmnopqrstuvwxyz0123456789abcdefghijklmn');
    const chunks = chunkPayload(payload, 4, 24);
    const shuffled = [...chunks].reverse();
    let result: Buffer | null = null;
    for (const chunk of shuffled) {
      result = rb.ingest(chunk);
    }
    expect(result).not.toBeNull();
    expect(result!.toString('utf-8')).toBe(payload.toString('utf-8'));
  });

  it('returns null for incomplete messages', () => {
    const rb = new ReassemblyBuffer();
    const payload = Buffer.alloc(50, 0x44);
    const chunks = chunkPayload(payload, 5, 24);
    const result = rb.ingest(chunks[0]);
    expect(result).toBeNull();
  });
});
