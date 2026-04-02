# claude-ble-nearby

**Chat with nearby devs through Claude Code — over Bluetooth.**

```
┌──────────────┐         BLE          ┌──────────────┐
│  Your Mac    │ ◄──────────────────► │  Their Mac   │
│              │                      │              │
│ Claude Code  │   discover + chat    │ Claude Code  │
│ + this plugin│                      │ + this plugin│
└──────────────┘                      └──────────────┘
```

## Install

```bash
claude plugin install github:knakul853/claude-ble-nearby
```

Restart Claude Code. Done.

## What It Does

```
You: "who's nearby?"

Claude: Nearby devs (2 found):
          🟢 coral-fox     -45dBm  paired
          🔵 amber-wolf    -62dBm  discovered

You: "send coral-fox: found the bug, line 247 in auth.go"

Claude: ✓ Delivered to coral-fox
```

- **Discovery** — automatically finds other devs running this plugin within ~30m
- **Chat** — send messages through Claude, no Slack/Teams needed
- **Pairing** — explicit accept/reject before anyone can message you

## How It Works

```
┌─────────────────────────────────────────────────┐
│                  Claude Code                     │
│                                                  │
│  Skills (nearby, ble-chat)                       │
│       │                                          │
│       ▼                                          │
│  ┌─────────────────────────────────────┐         │
│  │         MCP Server (stdio)          │         │
│  │                                     │         │
│  │  8 tools:                           │         │
│  │  ble_scan · ble_send · ble_inbox    │         │
│  │  ble_pair_request · ble_pair_accept │         │
│  │  ble_paired_list · ble_unpair       │         │
│  │  ble_status                         │         │
│  └──────────┬──────────────────────────┘         │
│             │                                    │
│  ┌──────────▼──────────────────────────┐         │
│  │          BLE Layer (macOS)          │         │
│  │                                     │         │
│  │  Scanner ◄─── ads ───► Advertiser   │         │
│  │     (noble)      (bleno)            │         │
│  │            │                        │         │
│  │    Connection Manager               │         │
│  │    (GATT / Nordic UART)             │         │
│  └─────────────────────────────────────┘         │
└─────────────────────────────────────────────────┘
```

**Transport:** BLE advertisements for discovery, GATT connections for chat.
Zero wifi, zero internet, zero accounts.

## Identity

Default: **pseudonymous** — you show up as `coral-fox`, `amber-wolf`, etc. Deterministic from your Mac's BLE UUID.

To use your real name:

```bash
# edit ~/.claude/plugins/data/claude-ble-nearby/config.json
{ "identity": "git" }   # pulls from git config user.name
```

## Pairing Flow

```
  You                          Them
   │                            │
   │──── pair request ────────►│
   │                            │ Claude: "coral-fox wants to pair. Accept?"
   │◄──── accepted ────────────│
   │                            │
   │◄════ encrypted channel ══►│
   │         chat away          │
```

No one can message you without your explicit approval.

## Commands

Just talk naturally:

- `"who's nearby?"` → scans + lists peers
- `"pair with amber-wolf"` → sends pair request
- `"message coral-fox: check line 42"` → sends chat
- `"any new messages?"` → reads inbox
- `"unpair amber-wolf"` → removes trust

## Requirements

- **macOS** (uses CoreBluetooth — no root, no dongles)
- **Bluetooth on** (System Settings → Bluetooth)
- **Claude Code** with plugin support

## Limits

| What | Limit |
|------|-------|
| Range | ~30m indoor |
| Peers | ~5-8 simultaneous |
| Message size | unlimited (auto-chunked) |
| Platform | macOS only (v1) |

## Config

`~/.claude/plugins/data/claude-ble-nearby/config.json`:

```json
{
  "identity": "pseudo",
  "displayName": null,
  "idleTimeout": 60,
  "maxConnections": 5,
  "autoAcceptPaired": true
}
```

## License

MIT
