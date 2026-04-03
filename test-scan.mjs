#!/usr/bin/env node
// Quick test: scans for Claude Code BLE peers for 10 seconds.
// Run on a DIFFERENT Mac to verify advertising works.
// Usage: npx @stoprocent/noble  (installs noble, then run this script)
//   OR: npm install @stoprocent/noble && node test-scan.mjs

import noble from '@stoprocent/noble';

const SERVICE_UUID = '6e400001b5a3f393e0a9e50e24dcca9e';

console.log('Scanning for Claude Code peers (10s)...');
console.log('Looking for service UUID:', SERVICE_UUID);
console.log('---');

noble.on('stateChange', async (state) => {
  if (state === 'poweredOn') {
    await noble.startScanningAsync([SERVICE_UUID], true);
  }
});

noble.on('discover', (peripheral) => {
  const name = peripheral.advertisement.localName || '(no name)';
  console.log(`FOUND: ${name}  id=${peripheral.id}  rssi=${peripheral.rssi}dBm`);
  console.log('  serviceUuids:', peripheral.advertisement.serviceUuids);
});

setTimeout(() => {
  console.log('---');
  console.log('Done. If nothing found, the other Mac is not advertising.');
  process.exit(0);
}, 10000);
