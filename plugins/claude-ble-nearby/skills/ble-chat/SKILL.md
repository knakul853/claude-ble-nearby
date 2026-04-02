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
