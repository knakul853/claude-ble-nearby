# Claude BLE Nearby — Plugin Design Spec

## Overview

A Claude Code plugin that uses Bluetooth Low Energy to discover nearby developers running Claude Code, enabling real-time chat between co-located devs. The plugin ships an MCP server (stdio) wrapping `@stoprocent/noble` + `@stoprocent/bleno` for BLE communication.

**v1 Scope:** Discovery + Chat (macOS only)
**Future:** Insight sharing, debug session invites, Linux support

## Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Identity | Pseudonymous default, configurable to git-based | Privacy-safe zero-config, opt-in real identity |
| Security | No encryption, manual accept/reject pairing | Explicit consent is the trust boundary for v1 |
| Transport | Hybrid (ads for discovery, GATT for chat) | Ads scale for presence, connections only for active chat |
| Architecture | MCP Server + Native BLE Addon | First-class Claude Code integration via MCP tools |
| Platform | macOS only | Best BLE dual-role support, fastest to ship |
| BLE Libraries | @stoprocent/noble + @stoprocent/bleno | Most actively maintained forks, macOS CoreBluetooth native |

## Plugin Structure

```
claude-ble-nearby/
├── .claude-plugin/
│   └── plugin.json
├── .mcp.json
├── package.json
├── tsconfig.json
├── src/
│   ├── mcp-server.ts            # MCP stdio server entry point
│   ├── ble/
│   │   ├── advertiser.ts        # Bleno — advertise presence + service UUID
│   │   ├── scanner.ts           # Noble — discover nearby peers
│   │   ├── connection.ts        # GATT connection manager (Nordic UART)
│   │   └── protocol.ts          # Message framing, chunking, reassembly
│   ├── peer/
│   │   ├── manager.ts           # Peer lifecycle state machine
│   │   ├── identity.ts          # Pseudonym generation + git identity
│   │   └── store.ts             # Persistent paired peer storage (JSON file)
│   └── chat/
│       ├── inbox.ts             # Incoming message queue
│       └── outbox.ts            # Outgoing message queue + chunking
├── skills/
│   ├── nearby/
│   │   └── SKILL.md
│   └── ble-chat/
│       └── SKILL.md
├── hooks/
│   ├── hooks.json
│   └── session-start
└── tests/
    └── ...
```

## MCP Tools

| Tool | Input | Output | Purpose |
|------|-------|--------|---------|
| `ble_scan` | none | `{ peers: [{ name, id, rssi, status }] }` | List discovered nearby peers |
| `ble_pair_request` | `{ peerId }` | `{ sent: true }` | Send pairing request |
| `ble_pair_accept` | `{ peerId, accept: bool }` | `{ paired: bool }` | Accept/reject incoming request |
| `ble_paired_list` | none | `{ peers: [{ name, id, lastSeen }] }` | List trusted peers |
| `ble_send` | `{ peerId, message }` | `{ delivered: bool }` | Send chat message |
| `ble_inbox` | `{ peerId?: string }` | `{ messages: [{ from, text, ts }] }` | Read & clear unread messages |
| `ble_unpair` | `{ peerId }` | `{ ok: true }` | Remove peer from trusted list |
| `ble_status` | none | `{ adapter, advertising, connections }` | BLE adapter health |

All responses kept minimal to avoid token bloat.

## BLE Protocol Design

### Service Definition (Nordic UART Service pattern)

```
Service UUID: 6e400001-b5a3-f393-e0a9-e50e24dcca9e

Characteristics:
  TX (notify):  6e400003-... — peripheral → central (outgoing messages)
  RX (write):   6e400002-... — central → peripheral (incoming messages)
  META (read):  custom UUID  — peer identity payload (pseudonym, version)
```

### Discovery Flow

1. Each instance advertises the service UUID + pseudonym in advertising data
2. Scanner picks up advertisements, extracts identity from META characteristic or ad payload
3. Discovered peers shown via `ble_scan` tool
4. No connection established until pairing is initiated

### Pairing Flow

```
DevA                          DevB
  |--- pair_request (ad) ----->|
  |                            | [ble_pair_accept prompt in Claude]
  |<--- pair_accepted (ad) ----|
  |                            |
  |==== GATT connection ======>|
  |     (Nordic UART)          |
  |<== bidirectional chat ===>|
```

1. DevA calls `ble_pair_request({ peerId: "dev-coral-fox" })`
2. Request sent via a dedicated pairing characteristic or connection attempt
3. DevB's MCP server queues the request; Claude surfaces it via `ble_inbox` or a notification
4. DevB calls `ble_pair_accept({ peerId: "dev-amber-wolf", accept: true })`
5. GATT connection established, both peers stored in trusted list

### Message Protocol

Messages are JSON-encoded and chunked to fit MTU:

```json
{ "type": "chat", "from": "dev-coral-fox", "text": "found the bug", "ts": 1712150400, "seq": 1 }
```

Chunking:
- Header byte: `[flags:4][seq:4][chunk:4][total:4]` (2 bytes)
- Payload: remaining MTU bytes
- Reassembly on receive, deliver complete messages to inbox

Messages types: `chat`, `pair_request`, `pair_accept`, `pair_reject`, `presence`

### Connection Lifecycle

- Idle timeout: 60 seconds of no messages → disconnect GATT
- Auto-reconnect on next `ble_send` to a paired peer
- Max concurrent GATT connections: 5 (configurable)
- Peers beyond limit queued; oldest idle connection dropped

## Peer Identity

### Pseudonym Generation

Deterministic from BLE peripheral UUID (stable per Mac):
```
adjective + animal: "coral-fox", "amber-wolf", "jade-otter"
```

Word lists: ~50 adjectives × ~50 animals = 2500 combinations. Collision unlikely for same-room scale.

### Git Identity (opt-in)

When configured, reads `git config user.name` and broadcasts in the META characteristic. Peers see the real name instead of pseudonym.

### Persistent Store

`~/.claude/plugins/data/claude-ble-nearby/peers.json`:
```json
{
  "paired": {
    "ble-uuid-abc": { "name": "dev-coral-fox", "gitName": null, "pairedAt": "2026-04-03T..." }
  }
}
```

## Skills

### `nearby` Skill

Triggered when user mentions nearby devs, wants to see who's around, or asks about BLE status. Guides Claude to call `ble_scan` and present results as a formatted list.

### `ble-chat` Skill

Triggered when user wants to message a nearby dev. Guides Claude through: check paired status → connect if needed → send via `ble_send` → monitor `ble_inbox` for replies.

## Hooks

### SessionStart Hook

Pings `ble_status` tool, outputs a one-liner:
> "BLE Nearby: 3 devs nearby (2 paired)"

Costs ~20 tokens. Skipped if adapter is off.

## Configuration

Plugin settings in `~/.claude/plugins/data/claude-ble-nearby/config.json`:

```json
{
  "identity": "pseudo",        // "pseudo" | "git"
  "displayName": null,         // custom override
  "idleTimeout": 60,           // seconds before GATT disconnect
  "maxConnections": 5,
  "autoAcceptPaired": true     // skip re-pairing for previously paired peers
}
```

## Error Handling

| Scenario | Behavior |
|----------|----------|
| Bluetooth off | `ble_status` returns `{ adapter: "poweredOff" }`, tools return clear error |
| Permission denied | Prompt user to grant Bluetooth access in System Settings |
| Peer out of range | Message queued, delivered on reconnect or timeout after 30s |
| MTU negotiation fails | Fall back to 20-byte chunks (slow but works) |
| Max connections hit | Drop oldest idle, log warning |

## Testing Strategy

- Unit tests: message chunking/reassembly, pseudonym generation, peer state machine
- Integration tests: noble ↔ bleno in same process (macOS dual-role), message round-trip
- Manual validation: two Macs running the plugin, chat end-to-end

## Out of Scope (v2+)

- Insight/memory sharing between peers
- Debug session invitations (share context, invite to codebase)
- End-to-end encryption (ECDH key exchange)
- Linux/Windows support
- Group chat (broadcast to all paired peers)
- File/snippet transfer
