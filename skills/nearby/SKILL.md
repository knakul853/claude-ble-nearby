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
