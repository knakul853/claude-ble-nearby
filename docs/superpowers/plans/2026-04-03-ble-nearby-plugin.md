# Claude BLE Nearby — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Claude Code plugin that discovers nearby devs via BLE and enables peer-to-peer chat through MCP tools.

**Architecture:** MCP stdio server wrapping @stoprocent/noble (scanner) + @stoprocent/bleno (advertiser). Hybrid transport — BLE advertisements for discovery, GATT connections (Nordic UART Service) for chat. Plugin exposes 8 MCP tools for Claude to interact with the BLE layer.

**Tech Stack:** TypeScript, @stoprocent/noble, @stoprocent/bleno, @modelcontextprotocol/sdk, vitest (testing)

---

## File Structure

```
claude-ble-nearby/
├── .claude-plugin/plugin.json       — Plugin manifest (name, version, description)
├── .mcp.json                        — MCP server registration for Claude Code
├── package.json                     — Dependencies and scripts
├── tsconfig.json                    — TypeScript config (ESM, strict)
├── src/
│   ├── mcp-server.ts                — MCP stdio entry point, tool registration, dispatch
│   ├── ble/
│   │   ├── constants.ts             — Service/characteristic UUIDs, defaults
│   │   ├── advertiser.ts            — Bleno wrapper: start/stop advertising, set local name
│   │   ├── scanner.ts               — Noble wrapper: start/stop scan, emit discovered peers
│   │   ├── connection.ts            — GATT connection pool: connect, disconnect, idle timeout
│   │   └── protocol.ts             — Message encode/decode, chunk/reassemble for MTU
│   ├── peer/
│   │   ├── identity.ts              — Pseudonym generator (adjective-animal from BLE UUID)
│   │   ├── manager.ts               — Peer state machine (discovered → pending → paired)
│   │   └── store.ts                 — JSON file persistence for paired peers + config
│   └── chat/
│       ├── inbox.ts                 — Incoming message queue (read-once semantics)
│       └── outbox.ts                — Outgoing: serialize, chunk, write to GATT characteristic
├── skills/
│   ├── nearby/SKILL.md              — Skill for discovering nearby devs
│   └── ble-chat/SKILL.md            — Skill for chatting with a paired peer
├── hooks/
│   ├── hooks.json                   — SessionStart hook config
│   └── session-start                — Bash script: output peer count summary
├── tests/
│   ├── protocol.test.ts             — Chunking/reassembly unit tests
│   ├── identity.test.ts             — Pseudonym generation tests
│   ├── manager.test.ts              — Peer state machine tests
│   ├── inbox.test.ts                — Inbox queue tests
│   └── store.test.ts                — Persistent store tests
└── docs/superpowers/
    ├── specs/2026-04-03-ble-nearby-plugin-design.md
    └── plans/2026-04-03-ble-nearby-plugin.md (this file)
```

---

## Task 1: Project Scaffold & Build Pipeline

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `.claude-plugin/plugin.json`
- Create: `.mcp.json`
- Create: `src/ble/constants.ts`

- [ ] **Step 1: Initialize package.json**

```bash
cd /Users/nakulbharti/Documents/github/pd/claude-ble-nearby
```

Write `package.json`:

```json
{
  "name": "claude-ble-nearby",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "description": "Claude Code plugin for BLE-based nearby dev discovery and chat",
  "main": "dist/mcp-server.js",
  "scripts": {
    "build": "tsc",
    "dev": "tsc --watch",
    "test": "vitest run",
    "test:watch": "vitest",
    "start": "node dist/mcp-server.js"
  },
  "dependencies": {
    "@modelcontextprotocol/sdk": "^1.12.0",
    "@stoprocent/noble": "^1.15.0",
    "@stoprocent/bleno": "^0.8.0"
  },
  "devDependencies": {
    "typescript": "^5.7.0",
    "vitest": "^3.1.0",
    "@types/node": "^22.0.0"
  }
}
```

- [ ] **Step 2: Create tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "outDir": "dist",
    "rootDir": "src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "declaration": true,
    "sourceMap": true
  },
  "include": ["src/**/*.ts"],
  "exclude": ["node_modules", "dist", "tests"]
}
```

- [ ] **Step 3: Create plugin manifest**

Create `.claude-plugin/plugin.json`:

```json
{
  "name": "claude-ble-nearby",
  "description": "Discover nearby devs and chat via Bluetooth Low Energy",
  "version": "0.1.0",
  "author": {
    "name": "nakulbharti"
  },
  "keywords": ["ble", "bluetooth", "nearby", "chat", "collaboration"]
}
```

- [ ] **Step 4: Create MCP server registration**

Create `.mcp.json`:

```json
{
  "mcpServers": {
    "ble-nearby": {
      "type": "stdio",
      "command": "node",
      "args": ["dist/mcp-server.js"]
    }
  }
}
```

- [ ] **Step 5: Create BLE constants**

Create `src/ble/constants.ts`:

```typescript
export const NORDIC_UART_SERVICE_UUID = '6e400001b5a3f393e0a9e50e24dcca9e';
export const NORDIC_UART_RX_UUID = '6e400002b5a3f393e0a9e50e24dcca9e';
export const NORDIC_UART_TX_UUID = '6e400003b5a3f393e0a9e50e24dcca9e';
export const META_CHARACTERISTIC_UUID = '6e400004b5a3f393e0a9e50e24dcca9e';

export const DEFAULT_IDLE_TIMEOUT_MS = 60_000;
export const DEFAULT_MAX_CONNECTIONS = 5;
export const DEFAULT_MTU = 185;
export const MIN_MTU = 20;

export const CHUNK_HEADER_SIZE = 4;
// Header layout: [flags:1][seq:1][chunkIndex:1][totalChunks:1]
export const FLAG_FIRST = 0x01;
export const FLAG_LAST = 0x02;

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

export const DEFAULT_CONFIG: PluginConfig = {
  identity: 'pseudo',
  displayName: null,
  idleTimeout: 60,
  maxConnections: 5,
  autoAcceptPaired: true,
};
```

- [ ] **Step 6: Install dependencies and verify build**

```bash
cd /Users/nakulbharti/Documents/github/pd/claude-ble-nearby
npm install
npx tsc --noEmit
```

Expected: clean install, no type errors.

- [ ] **Step 7: Commit**

```bash
git init
git add package.json tsconfig.json .claude-plugin/plugin.json .mcp.json src/ble/constants.ts
git commit -m "feat: scaffold project with plugin manifest, MCP config, and BLE constants"
```

---

## Task 2: Protocol Layer — Message Chunking & Reassembly

**Files:**
- Create: `src/ble/protocol.ts`
- Create: `tests/protocol.test.ts`

- [ ] **Step 1: Write failing tests for protocol**

Create `tests/protocol.test.ts`:

```typescript
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
    const payload = Buffer.alloc(400, 0x41); // 400 bytes of 'A'
    const mtu = 24; // 4 header + 20 data = 20 bytes per chunk
    const chunks = chunkPayload(payload, 2, mtu);
    expect(chunks.length).toBe(20); // 400 / 20 = 20 chunks
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
    // only send first chunk
    const result = rb.ingest(chunks[0]);
    expect(result).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd /Users/nakulbharti/Documents/github/pd/claude-ble-nearby
npx vitest run tests/protocol.test.ts
```

Expected: FAIL — module `../src/ble/protocol.js` not found.

- [ ] **Step 3: Implement protocol.ts**

Create `src/ble/protocol.ts`:

```typescript
import {
  CHUNK_HEADER_SIZE,
  FLAG_FIRST,
  FLAG_LAST,
  type ProtocolMessage,
} from './constants.js';

export function encodeMessage(msg: ProtocolMessage): Buffer {
  return Buffer.from(JSON.stringify(msg), 'utf-8');
}

export function decodeMessage(buf: Buffer): ProtocolMessage {
  return JSON.parse(buf.toString('utf-8')) as ProtocolMessage;
}

export function chunkPayload(payload: Buffer, seq: number, mtu: number): Buffer[] {
  const dataPerChunk = mtu - CHUNK_HEADER_SIZE;
  if (dataPerChunk <= 0) {
    throw new Error(`MTU ${mtu} too small for header size ${CHUNK_HEADER_SIZE}`);
  }

  const totalChunks = Math.ceil(payload.length / dataPerChunk);
  const chunks: Buffer[] = [];

  for (let i = 0; i < totalChunks; i++) {
    const start = i * dataPerChunk;
    const end = Math.min(start + dataPerChunk, payload.length);
    const data = payload.subarray(start, end);

    let flags = 0;
    if (i === 0) flags |= FLAG_FIRST;
    if (i === totalChunks - 1) flags |= FLAG_LAST;

    const header = Buffer.alloc(CHUNK_HEADER_SIZE);
    header[0] = flags;
    header[1] = seq;
    header[2] = i;
    header[3] = totalChunks;

    chunks.push(Buffer.concat([header, data]));
  }

  return chunks;
}

export class ReassemblyBuffer {
  private pending = new Map<number, { totalChunks: number; received: Map<number, Buffer> }>();

  ingest(chunk: Buffer): Buffer | null {
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
      const parts: Buffer[] = [];
      for (let i = 0; i < entry.totalChunks; i++) {
        parts.push(entry.received.get(i)!);
      }
      this.pending.delete(seq);
      return Buffer.concat(parts);
    }

    return null;
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run tests/protocol.test.ts
```

Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/ble/protocol.ts tests/protocol.test.ts
git commit -m "feat: add message chunking and reassembly protocol"
```

---

## Task 3: Peer Identity — Pseudonym Generation

**Files:**
- Create: `src/peer/identity.ts`
- Create: `tests/identity.test.ts`

- [ ] **Step 1: Write failing tests**

Create `tests/identity.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { generatePseudonym, resolveDisplayName } from '../src/peer/identity.js';

describe('generatePseudonym', () => {
  it('produces adjective-animal format', () => {
    const name = generatePseudonym('abc123');
    expect(name).toMatch(/^[a-z]+-[a-z]+$/);
  });

  it('is deterministic for same input', () => {
    const a = generatePseudonym('test-uuid-1');
    const b = generatePseudonym('test-uuid-1');
    expect(a).toBe(b);
  });

  it('produces different names for different inputs', () => {
    const a = generatePseudonym('uuid-aaa');
    const b = generatePseudonym('uuid-bbb');
    expect(a).not.toBe(b);
  });
});

describe('resolveDisplayName', () => {
  it('returns pseudonym when identity is pseudo', () => {
    const name = resolveDisplayName('some-uuid', {
      identity: 'pseudo',
      displayName: null,
    });
    expect(name).toMatch(/^[a-z]+-[a-z]+$/);
  });

  it('returns custom displayName when set', () => {
    const name = resolveDisplayName('some-uuid', {
      identity: 'pseudo',
      displayName: 'CustomName',
    });
    expect(name).toBe('CustomName');
  });

  it('returns gitName when identity is git and gitName provided', () => {
    const name = resolveDisplayName('some-uuid', {
      identity: 'git',
      displayName: null,
      gitName: 'Nakul Bharti',
    });
    expect(name).toBe('Nakul Bharti');
  });

  it('falls back to pseudonym when git identity requested but no gitName', () => {
    const name = resolveDisplayName('some-uuid', {
      identity: 'git',
      displayName: null,
      gitName: undefined,
    });
    expect(name).toMatch(/^[a-z]+-[a-z]+$/);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run tests/identity.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement identity.ts**

Create `src/peer/identity.ts`:

```typescript
const ADJECTIVES = [
  'amber', 'azure', 'bold', 'calm', 'coral', 'crisp', 'dark', 'deep',
  'dusk', 'ember', 'fern', 'flint', 'frost', 'glow', 'gold', 'haze',
  'iron', 'ivy', 'jade', 'keen', 'lark', 'lime', 'lunar', 'maple',
  'mint', 'moss', 'neon', 'nova', 'opal', 'pale', 'pine', 'plum',
  'quartz', 'rain', 'reed', 'rose', 'rust', 'sage', 'sand', 'silk',
  'slate', 'snow', 'stone', 'storm', 'swift', 'teal', 'tide', 'vine',
  'warm', 'wild',
];

const ANIMALS = [
  'badger', 'bear', 'crane', 'crow', 'deer', 'dove', 'eagle', 'elk',
  'falcon', 'finch', 'fox', 'frog', 'hawk', 'hare', 'heron', 'jay',
  'kite', 'lark', 'lion', 'lynx', 'mink', 'moth', 'newt', 'orca',
  'otter', 'owl', 'panda', 'pike', 'quail', 'raven', 'robin', 'seal',
  'shrike', 'snake', 'sparrow', 'stag', 'stork', 'swan', 'tiger', 'toad',
  'trout', 'viper', 'vole', 'wasp', 'whale', 'wolf', 'wren', 'yak',
  'zebra', 'ibis',
];

function simpleHash(input: string): number {
  let hash = 0;
  for (let i = 0; i < input.length; i++) {
    hash = ((hash << 5) - hash + input.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

export function generatePseudonym(bleUuid: string): string {
  const hash = simpleHash(bleUuid);
  const adj = ADJECTIVES[hash % ADJECTIVES.length];
  const animal = ANIMALS[Math.floor(hash / ADJECTIVES.length) % ANIMALS.length];
  return `${adj}-${animal}`;
}

interface IdentityOptions {
  identity: 'pseudo' | 'git';
  displayName: string | null;
  gitName?: string;
}

export function resolveDisplayName(bleUuid: string, opts: IdentityOptions): string {
  if (opts.displayName) return opts.displayName;
  if (opts.identity === 'git' && opts.gitName) return opts.gitName;
  return generatePseudonym(bleUuid);
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run tests/identity.test.ts
```

Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add src/peer/identity.ts tests/identity.test.ts
git commit -m "feat: add deterministic pseudonym generation for peer identity"
```

---

## Task 4: Persistent Store — Peers & Config

**Files:**
- Create: `src/peer/store.ts`
- Create: `tests/store.test.ts`

- [ ] **Step 1: Write failing tests**

Create `tests/store.test.ts`:

```typescript
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
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run tests/store.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement store.ts**

Create `src/peer/store.ts`:

```typescript
import fs from 'node:fs';
import path from 'node:path';
import { DEFAULT_CONFIG, type PeerRecord, type PluginConfig } from '../ble/constants.js';

const PEERS_FILE = 'peers.json';
const CONFIG_FILE = 'config.json';

export class PeerStore {
  private dataDir: string;
  private peers: Record<string, PeerRecord>;
  private config: PluginConfig;

  constructor(dataDir: string) {
    this.dataDir = dataDir;
    fs.mkdirSync(dataDir, { recursive: true });
    this.peers = this.loadJson(PEERS_FILE, {});
    this.config = { ...DEFAULT_CONFIG, ...this.loadJson(CONFIG_FILE, {}) };
  }

  getPairedPeers(): Record<string, PeerRecord> {
    return { ...this.peers };
  }

  addPairedPeer(id: string, record: PeerRecord): void {
    this.peers[id] = record;
    this.saveJson(PEERS_FILE, this.peers);
  }

  removePairedPeer(id: string): void {
    delete this.peers[id];
    this.saveJson(PEERS_FILE, this.peers);
  }

  isPaired(id: string): boolean {
    return id in this.peers;
  }

  getConfig(): PluginConfig {
    return { ...this.config };
  }

  saveConfig(config: PluginConfig): void {
    this.config = config;
    this.saveJson(CONFIG_FILE, config);
  }

  private loadJson<T>(filename: string, fallback: T): T {
    const filepath = path.join(this.dataDir, filename);
    try {
      return JSON.parse(fs.readFileSync(filepath, 'utf-8'));
    } catch {
      return fallback;
    }
  }

  private saveJson(filename: string, data: unknown): void {
    const filepath = path.join(this.dataDir, filename);
    fs.writeFileSync(filepath, JSON.stringify(data, null, 2), 'utf-8');
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run tests/store.test.ts
```

Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add src/peer/store.ts tests/store.test.ts
git commit -m "feat: add persistent peer store with JSON file backing"
```

---

## Task 5: Peer Manager — State Machine

**Files:**
- Create: `src/peer/manager.ts`
- Create: `tests/manager.test.ts`

- [ ] **Step 1: Write failing tests**

Create `tests/manager.test.ts`:

```typescript
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
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run tests/manager.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Implement manager.ts**

Create `src/peer/manager.ts`:

```typescript
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
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run tests/manager.test.ts
```

Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add src/peer/manager.ts tests/manager.test.ts
git commit -m "feat: add peer manager with state machine transitions"
```

---

## Task 6: Chat Inbox & Outbox

**Files:**
- Create: `src/chat/inbox.ts`
- Create: `src/chat/outbox.ts`
- Create: `tests/inbox.test.ts`

- [ ] **Step 1: Write failing tests**

Create `tests/inbox.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { Inbox, type ChatMessage } from '../src/chat/inbox.js';

let inbox: Inbox;

beforeEach(() => {
  inbox = new Inbox();
});

describe('Inbox', () => {
  it('starts empty', () => {
    expect(inbox.read()).toEqual([]);
  });

  it('stores and reads messages', () => {
    const msg: ChatMessage = { from: 'dev-coral-fox', text: 'hello', ts: 1712150400 };
    inbox.push(msg);
    const messages = inbox.read();
    expect(messages).toHaveLength(1);
    expect(messages[0]).toEqual(msg);
  });

  it('clears messages after read (read-once)', () => {
    inbox.push({ from: 'dev-coral-fox', text: 'hi', ts: 1 });
    inbox.push({ from: 'dev-coral-fox', text: 'yo', ts: 2 });
    inbox.read();
    expect(inbox.read()).toEqual([]);
  });

  it('filters by peerId', () => {
    inbox.push({ from: 'dev-coral-fox', text: 'a', ts: 1 });
    inbox.push({ from: 'dev-amber-wolf', text: 'b', ts: 2 });
    inbox.push({ from: 'dev-coral-fox', text: 'c', ts: 3 });
    const messages = inbox.readFrom('dev-coral-fox');
    expect(messages).toHaveLength(2);
    expect(messages.every((m) => m.from === 'dev-coral-fox')).toBe(true);
  });

  it('only clears read messages when filtering', () => {
    inbox.push({ from: 'dev-coral-fox', text: 'a', ts: 1 });
    inbox.push({ from: 'dev-amber-wolf', text: 'b', ts: 2 });
    inbox.readFrom('dev-coral-fox');
    const remaining = inbox.read();
    expect(remaining).toHaveLength(1);
    expect(remaining[0].from).toBe('dev-amber-wolf');
  });

  it('tracks pending pair requests separately', () => {
    inbox.pushPairRequest('dev-coral-fox', 'uuid-1');
    expect(inbox.getPendingPairRequests()).toHaveLength(1);
    expect(inbox.getPendingPairRequests()[0]).toEqual({ name: 'dev-coral-fox', id: 'uuid-1' });
  });

  it('clears pair request after retrieval', () => {
    inbox.pushPairRequest('dev-coral-fox', 'uuid-1');
    inbox.getPendingPairRequests();
    expect(inbox.getPendingPairRequests()).toEqual([]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run tests/inbox.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Implement inbox.ts**

Create `src/chat/inbox.ts`:

```typescript
export interface ChatMessage {
  from: string;
  text: string;
  ts: number;
}

interface PairRequest {
  name: string;
  id: string;
}

export class Inbox {
  private messages: ChatMessage[] = [];
  private pairRequests: PairRequest[] = [];

  push(msg: ChatMessage): void {
    this.messages.push(msg);
  }

  read(): ChatMessage[] {
    const msgs = [...this.messages];
    this.messages = [];
    return msgs;
  }

  readFrom(peerId: string): ChatMessage[] {
    const matching = this.messages.filter((m) => m.from === peerId);
    this.messages = this.messages.filter((m) => m.from !== peerId);
    return matching;
  }

  pushPairRequest(name: string, id: string): void {
    this.pairRequests.push({ name, id });
  }

  getPendingPairRequests(): PairRequest[] {
    const reqs = [...this.pairRequests];
    this.pairRequests = [];
    return reqs;
  }
}
```

- [ ] **Step 4: Implement outbox.ts**

Create `src/chat/outbox.ts`:

```typescript
import { encodeMessage, chunkPayload } from '../ble/protocol.js';
import { DEFAULT_MTU, type ProtocolMessage, type MessageType } from '../ble/constants.js';

let seqCounter = 0;

function nextSeq(): number {
  seqCounter = (seqCounter + 1) % 256;
  return seqCounter;
}

export function prepareOutgoing(
  type: MessageType,
  from: string,
  text: string,
  mtu: number = DEFAULT_MTU,
): Buffer[] {
  const msg: ProtocolMessage = {
    type,
    from,
    text,
    ts: Math.floor(Date.now() / 1000),
    seq: nextSeq(),
  };
  const payload = encodeMessage(msg);
  return chunkPayload(payload, msg.seq, mtu);
}
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
npx vitest run tests/inbox.test.ts
```

Expected: all PASS.

- [ ] **Step 6: Commit**

```bash
git add src/chat/inbox.ts src/chat/outbox.ts tests/inbox.test.ts
git commit -m "feat: add chat inbox (read-once queue) and outbox (message preparation)"
```

---

## Task 7: BLE Scanner (Noble Wrapper)

**Files:**
- Create: `src/ble/scanner.ts`

- [ ] **Step 1: Implement scanner.ts**

Create `src/ble/scanner.ts`:

```typescript
import noble from '@stoprocent/noble';
import { EventEmitter } from 'node:events';
import { NORDIC_UART_SERVICE_UUID } from './constants.js';

export interface DiscoveredPeer {
  id: string;
  name: string;
  rssi: number;
}

export class BleScanner extends EventEmitter {
  private scanning = false;

  async start(): Promise<void> {
    if (this.scanning) return;

    await this.waitForPoweredOn();

    noble.on('discover', (peripheral) => {
      const name = peripheral.advertisement.localName;
      if (!name) return;

      const serviceUuids = peripheral.advertisement.serviceUuids || [];
      if (!serviceUuids.includes(NORDIC_UART_SERVICE_UUID)) return;

      this.emit('discovered', {
        id: peripheral.id,
        name,
        rssi: peripheral.rssi,
      } satisfies DiscoveredPeer);
    });

    await noble.startScanningAsync([NORDIC_UART_SERVICE_UUID], true);
    this.scanning = true;
  }

  async stop(): Promise<void> {
    if (!this.scanning) return;
    await noble.stopScanningAsync();
    noble.removeAllListeners('discover');
    this.scanning = false;
  }

  isScanning(): boolean {
    return this.scanning;
  }

  getAdapterState(): string {
    return noble.state;
  }

  private waitForPoweredOn(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (noble.state === 'poweredOn') {
        resolve();
        return;
      }
      const timeout = setTimeout(() => {
        reject(new Error(`BLE adapter state is "${noble.state}", expected "poweredOn"`));
      }, 10_000);

      noble.once('stateChange', (state) => {
        clearTimeout(timeout);
        if (state === 'poweredOn') resolve();
        else reject(new Error(`BLE adapter state changed to "${state}", expected "poweredOn"`));
      });
    });
  }
}
```

- [ ] **Step 2: Verify it compiles**

```bash
npx tsc --noEmit
```

Expected: no errors (noble types may need `@ts-expect-error` if no type declarations exist — adjust if needed).

- [ ] **Step 3: Commit**

```bash
git add src/ble/scanner.ts
git commit -m "feat: add BLE scanner wrapping noble for peer discovery"
```

---

## Task 8: BLE Advertiser (Bleno Wrapper)

**Files:**
- Create: `src/ble/advertiser.ts`

- [ ] **Step 1: Implement advertiser.ts**

Create `src/ble/advertiser.ts`:

```typescript
import bleno from '@stoprocent/bleno';
import { EventEmitter } from 'node:events';
import {
  NORDIC_UART_SERVICE_UUID,
  NORDIC_UART_RX_UUID,
  NORDIC_UART_TX_UUID,
  META_CHARACTERISTIC_UUID,
} from './constants.js';

export class BleAdvertiser extends EventEmitter {
  private advertising = false;
  private localName: string;
  private txSubscription: ((data: Buffer) => void) | null = null;

  constructor(localName: string) {
    super();
    this.localName = localName;
  }

  async start(): Promise<void> {
    if (this.advertising) return;

    await this.waitForPoweredOn();

    const rxCharacteristic = new bleno.Characteristic({
      uuid: NORDIC_UART_RX_UUID,
      properties: ['write', 'writeWithoutResponse'],
      onWriteRequest: (data: Buffer, _offset: number, _withoutResponse: boolean, callback: (result: number) => void) => {
        this.emit('data', data);
        callback(bleno.Characteristic.RESULT_SUCCESS);
      },
    });

    let notifyCallback: ((data: Buffer) => void) | null = null;

    const txCharacteristic = new bleno.Characteristic({
      uuid: NORDIC_UART_TX_UUID,
      properties: ['notify'],
      onSubscribe: (_maxValueSize: number, updateValueCallback: (data: Buffer) => void) => {
        notifyCallback = updateValueCallback;
        this.txSubscription = updateValueCallback;
        this.emit('subscribed');
      },
      onUnsubscribe: () => {
        notifyCallback = null;
        this.txSubscription = null;
        this.emit('unsubscribed');
      },
    });

    const metaCharacteristic = new bleno.Characteristic({
      uuid: META_CHARACTERISTIC_UUID,
      properties: ['read'],
      onReadRequest: (_offset: number, callback: (result: number, data?: Buffer) => void) => {
        const meta = JSON.stringify({ name: this.localName, version: '0.1.0' });
        callback(bleno.Characteristic.RESULT_SUCCESS, Buffer.from(meta, 'utf-8'));
      },
    });

    const service = new bleno.PrimaryService({
      uuid: NORDIC_UART_SERVICE_UUID,
      characteristics: [rxCharacteristic, txCharacteristic, metaCharacteristic],
    });

    return new Promise<void>((resolve, reject) => {
      bleno.startAdvertising(this.localName, [NORDIC_UART_SERVICE_UUID], (err?: Error) => {
        if (err) {
          reject(err);
          return;
        }
        bleno.setServices([service], (err?: Error) => {
          if (err) {
            reject(err);
            return;
          }
          this.advertising = true;
          resolve();
        });
      });
    });
  }

  async stop(): Promise<void> {
    if (!this.advertising) return;
    bleno.stopAdvertising();
    this.advertising = false;
  }

  sendNotification(data: Buffer): boolean {
    if (!this.txSubscription) return false;
    this.txSubscription(data);
    return true;
  }

  isAdvertising(): boolean {
    return this.advertising;
  }

  setLocalName(name: string): void {
    this.localName = name;
  }

  private waitForPoweredOn(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (bleno.state === 'poweredOn') {
        resolve();
        return;
      }
      const timeout = setTimeout(() => {
        reject(new Error(`BLE adapter state is "${bleno.state}", expected "poweredOn"`));
      }, 10_000);

      bleno.once('stateChange', (state: string) => {
        clearTimeout(timeout);
        if (state === 'poweredOn') resolve();
        else reject(new Error(`BLE adapter state changed to "${state}"`));
      });
    });
  }
}
```

- [ ] **Step 2: Verify it compiles**

```bash
npx tsc --noEmit
```

Expected: no type errors.

- [ ] **Step 3: Commit**

```bash
git add src/ble/advertiser.ts
git commit -m "feat: add BLE advertiser with Nordic UART Service and META characteristic"
```

---

## Task 9: GATT Connection Manager

**Files:**
- Create: `src/ble/connection.ts`

- [ ] **Step 1: Implement connection.ts**

Create `src/ble/connection.ts`:

```typescript
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
```

- [ ] **Step 2: Verify it compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/ble/connection.ts
git commit -m "feat: add GATT connection manager with idle timeout and pool limits"
```

---

## Task 10: MCP Server — Tool Registration & Dispatch

**Files:**
- Create: `src/mcp-server.ts`

- [ ] **Step 1: Implement MCP server entry point**

Create `src/mcp-server.ts`:

```typescript
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { BleScanner, type DiscoveredPeer } from './ble/scanner.js';
import { BleAdvertiser } from './ble/advertiser.js';
import { ConnectionManager } from './ble/connection.js';
import { ReassemblyBuffer, decodeMessage } from './ble/protocol.js';
import { PeerManager } from './peer/manager.js';
import { PeerStore } from './peer/store.js';
import { resolveDisplayName } from './peer/identity.js';
import { Inbox } from './chat/inbox.js';
import { prepareOutgoing } from './chat/outbox.js';
import os from 'node:os';
import path from 'node:path';
import { execSync } from 'node:child_process';

const DATA_DIR = path.join(
  os.homedir(),
  '.claude',
  'plugins',
  'data',
  'claude-ble-nearby',
);

const store = new PeerStore(DATA_DIR);
const config = store.getConfig();
const peerManager = new PeerManager(store);
const inbox = new Inbox();
const scanner = new BleScanner();
const reassembly = new ReassemblyBuffer();

function getLocalName(): string {
  let gitName: string | undefined;
  if (config.identity === 'git') {
    try {
      gitName = execSync('git config user.name', { encoding: 'utf-8' }).trim();
    } catch {}
  }
  const bleUuid = 'local-' + os.hostname();
  return resolveDisplayName(bleUuid, {
    identity: config.identity,
    displayName: config.displayName,
    gitName,
  });
}

const localName = getLocalName();
const advertiser = new BleAdvertiser(localName);
const connectionManager = new ConnectionManager(config.maxConnections, config.idleTimeout * 1000);

scanner.on('discovered', (peer: DiscoveredPeer) => {
  peerManager.onDiscovered(peer.id, peer.name, peer.rssi);
});

connectionManager.on('data', (_peerId: string, data: Buffer) => {
  const complete = reassembly.ingest(data);
  if (!complete) return;

  const msg = decodeMessage(complete);
  if (msg.type === 'chat') {
    inbox.push({ from: msg.from, text: msg.text, ts: msg.ts });
  } else if (msg.type === 'pair_request') {
    inbox.pushPairRequest(msg.from, msg.from);
  }
});

connectionManager.on('connected', (id: string) => peerManager.onConnected(id));
connectionManager.on('disconnected', (id: string) => peerManager.onDisconnected(id));

advertiser.on('data', (data: Buffer) => {
  const complete = reassembly.ingest(data);
  if (!complete) return;

  const msg = decodeMessage(complete);
  if (msg.type === 'chat') {
    inbox.push({ from: msg.from, text: msg.text, ts: msg.ts });
  } else if (msg.type === 'pair_request') {
    inbox.pushPairRequest(msg.from, msg.from);
  }
});

const server = new McpServer({
  name: 'ble-nearby',
  version: '0.1.0',
});

server.tool('ble_status', 'Get BLE adapter and connection status', {}, async () => {
  return {
    content: [{
      type: 'text',
      text: JSON.stringify({
        adapter: scanner.getAdapterState(),
        advertising: advertiser.isAdvertising(),
        scanning: scanner.isScanning(),
        connections: connectionManager.getConnectionCount(),
        localName,
      }),
    }],
  };
});

server.tool('ble_scan', 'List nearby discovered peers', {}, async () => {
  if (!scanner.isScanning()) {
    await scanner.start();
    await advertiser.start();
  }
  const peers = peerManager.getDiscoveredPeers().map((p) => ({
    name: p.name,
    id: p.id,
    rssi: p.rssi,
    status: p.status,
  }));
  return {
    content: [{ type: 'text', text: JSON.stringify({ peers }) }],
  };
});

server.tool(
  'ble_pair_request',
  'Send a pairing request to a discovered peer',
  { peerId: z.string().describe('The BLE ID of the peer to pair with') },
  async ({ peerId }) => {
    const peer = peerManager.getPeer(peerId);
    if (!peer) return { content: [{ type: 'text', text: JSON.stringify({ error: 'Peer not found' }) }] };
    if (peer.status !== 'discovered') {
      return { content: [{ type: 'text', text: JSON.stringify({ error: `Peer is already ${peer.status}` }) }] };
    }
    peerManager.onPairRequestSent(peerId);
    return { content: [{ type: 'text', text: JSON.stringify({ sent: true, to: peer.name }) }] };
  },
);

server.tool(
  'ble_pair_accept',
  'Accept or reject an incoming pair request',
  {
    peerId: z.string().describe('The BLE ID of the peer'),
    accept: z.boolean().describe('True to accept, false to reject'),
  },
  async ({ peerId, accept }) => {
    if (accept) {
      peerManager.onPairAccepted(peerId);
    } else {
      peerManager.onPairRejected(peerId);
    }
    return { content: [{ type: 'text', text: JSON.stringify({ paired: accept }) }] };
  },
);

server.tool('ble_paired_list', 'List all paired (trusted) peers', {}, async () => {
  const pairedRecords = store.getPairedPeers();
  const peers = Object.entries(pairedRecords).map(([id, record]) => ({
    name: record.name,
    id,
    lastSeen: record.pairedAt,
  }));
  return { content: [{ type: 'text', text: JSON.stringify({ peers }) }] };
});

server.tool(
  'ble_send',
  'Send a chat message to a paired peer',
  {
    peerId: z.string().describe('The BLE ID of the peer'),
    message: z.string().describe('The message text to send'),
  },
  async ({ peerId, message }) => {
    if (!store.isPaired(peerId)) {
      return { content: [{ type: 'text', text: JSON.stringify({ error: 'Peer not paired' }) }] };
    }

    const chunks = prepareOutgoing('chat', localName, message);

    if (connectionManager.isConnected(peerId)) {
      for (const chunk of chunks) {
        await connectionManager.write(peerId, chunk);
      }
      return { content: [{ type: 'text', text: JSON.stringify({ delivered: true }) }] };
    }

    if (advertiser.isAdvertising()) {
      for (const chunk of chunks) {
        advertiser.sendNotification(chunk);
      }
      return { content: [{ type: 'text', text: JSON.stringify({ delivered: true, via: 'notification' }) }] };
    }

    return { content: [{ type: 'text', text: JSON.stringify({ delivered: false, error: 'No connection or advertising' }) }] };
  },
);

server.tool(
  'ble_inbox',
  'Read unread messages (clears after reading)',
  { peerId: z.string().optional().describe('Filter by peer name (optional)') },
  async ({ peerId }) => {
    const messages = peerId ? inbox.readFrom(peerId) : inbox.read();
    const pairRequests = inbox.getPendingPairRequests();
    return {
      content: [{
        type: 'text',
        text: JSON.stringify({ messages, pairRequests }),
      }],
    };
  },
);

server.tool(
  'ble_unpair',
  'Remove a peer from the trusted list',
  { peerId: z.string().describe('The BLE ID of the peer to unpair') },
  async ({ peerId }) => {
    peerManager.unpair(peerId);
    if (connectionManager.isConnected(peerId)) {
      await connectionManager.disconnect(peerId);
    }
    return { content: [{ type: 'text', text: JSON.stringify({ ok: true }) }] };
  },
);

async function main() {
  try {
    await scanner.start();
    await advertiser.start();
  } catch (err) {
    // BLE may not be available — server still starts, tools return adapter state
    console.error('BLE init warning:', err);
  }

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
```

- [ ] **Step 2: Add zod dependency (required by MCP SDK)**

```bash
cd /Users/nakulbharti/Documents/github/pd/claude-ble-nearby
npm install zod
```

- [ ] **Step 3: Verify it compiles**

```bash
npx tsc --noEmit
```

Expected: no type errors. If noble/bleno lack type declarations, add `src/types/` with `.d.ts` shims:

Create `src/types/stoprocent-noble.d.ts` if needed:

```typescript
declare module '@stoprocent/noble' {
  export = noble;
}
```

Create `src/types/stoprocent-bleno.d.ts` if needed:

```typescript
declare module '@stoprocent/bleno' {
  export = bleno;
}
```

- [ ] **Step 4: Commit**

```bash
git add src/mcp-server.ts
git commit -m "feat: add MCP server with all 8 BLE tools"
```

---

## Task 11: Skills — Nearby & Chat

**Files:**
- Create: `skills/nearby/SKILL.md`
- Create: `skills/ble-chat/SKILL.md`

- [ ] **Step 1: Create nearby skill**

Create `skills/nearby/SKILL.md`:

```markdown
---
name: nearby
description: Use when user wants to see nearby Claude Code developers, check who is around, or manage BLE peer connections
---

# Nearby Devs

When the user asks about nearby developers or wants to see who's around:

1. Call `ble_status` to check if the adapter is on and scanning
2. If not scanning, call `ble_scan` to start discovery and get the peer list
3. Present the results as a formatted list:

Example output:
```
Nearby devs (3 found):
  coral-fox     -45dBm  paired
  amber-wolf    -62dBm  discovered
  jade-otter    -78dBm  connected
```

If the adapter is off, tell the user to enable Bluetooth in System Settings.

When showing pair requests, check `ble_inbox` for pending requests and prompt the user to accept or reject each one using `ble_pair_accept`.
```

- [ ] **Step 2: Create chat skill**

Create `skills/ble-chat/SKILL.md`:

```markdown
---
name: ble-chat
description: Use when user wants to chat with a nearby developer, send a message, or read incoming messages from BLE peers
---

# BLE Chat

When the user wants to send a message to a nearby dev:

1. Call `ble_paired_list` to check if the target peer is paired
2. If not paired, call `ble_pair_request` and inform the user they need to wait for acceptance
3. If paired, call `ble_send` with the peer ID and message text
4. Confirm delivery

When checking for new messages:

1. Call `ble_inbox` to get unread messages
2. Present messages grouped by sender:

Example:
```
Messages from coral-fox:
  [14:32] "found the null pointer — it's in the auth middleware"
  [14:33] "line 247 of auth.go"
```

If no messages, say "No new messages."

Always check for pending pair requests in the inbox response and surface them to the user.
```

- [ ] **Step 3: Commit**

```bash
git add skills/
git commit -m "feat: add nearby and ble-chat skills"
```

---

## Task 12: Session Start Hook

**Files:**
- Create: `hooks/hooks.json`
- Create: `hooks/session-start`

- [ ] **Step 1: Create hooks.json**

Create `hooks/hooks.json`:

```json
{
  "hooks": {
    "SessionStart": [
      {
        "matcher": "",
        "hooks": [
          {
            "type": "command",
            "command": "\"${CLAUDE_PLUGIN_ROOT}/hooks/session-start\"",
            "async": true
          }
        ]
      }
    ]
  }
}
```

- [ ] **Step 2: Create session-start script**

Create `hooks/session-start`:

```bash
#!/bin/bash
# Outputs a brief nearby peer summary for the session start context.
# This runs async so it won't block session startup.

echo '{"additionalContext": "BLE Nearby plugin active. Use /nearby to see who is around, or ask to chat with a nearby dev."}'
```

- [ ] **Step 3: Make it executable**

```bash
chmod +x /Users/nakulbharti/Documents/github/pd/claude-ble-nearby/hooks/session-start
```

- [ ] **Step 4: Commit**

```bash
git add hooks/
git commit -m "feat: add session start hook for BLE nearby context"
```

---

## Task 13: Build, Smoke Test, Final Commit

- [ ] **Step 1: Full build**

```bash
cd /Users/nakulbharti/Documents/github/pd/claude-ble-nearby
npm install
npm run build
```

Expected: `dist/` directory created with compiled JS files.

- [ ] **Step 2: Run all tests**

```bash
npm test
```

Expected: all unit tests pass (protocol, identity, store, manager, inbox).

- [ ] **Step 3: Verify MCP server starts**

```bash
echo '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"0.1.0"}}}' | node dist/mcp-server.js
```

Expected: JSON-RPC response with server capabilities (may warn about BLE adapter if not available in terminal).

- [ ] **Step 4: Create .gitignore**

```
node_modules/
dist/
*.js.map
.DS_Store
```

- [ ] **Step 5: Final commit**

```bash
git add .gitignore
git commit -m "feat: complete v1 build — BLE nearby discovery and chat plugin"
```

---

## Post-Implementation Checklist

After all tasks are complete:

- [ ] All unit tests pass (`npm test`)
- [ ] Build succeeds (`npm run build`)
- [ ] MCP server starts without crash
- [ ] Plugin manifest is valid JSON
- [ ] .mcp.json points to correct built entry point
- [ ] Skills have valid frontmatter
- [ ] Hook script is executable
