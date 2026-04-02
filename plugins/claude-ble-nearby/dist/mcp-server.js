import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { BleScanner } from './ble/scanner.js';
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
const DATA_DIR = path.join(os.homedir(), '.claude', 'plugins', 'data', 'claude-ble-nearby');
const store = new PeerStore(DATA_DIR);
const config = store.getConfig();
const peerManager = new PeerManager(store);
const inbox = new Inbox();
const scanner = new BleScanner();
const reassembly = new ReassemblyBuffer();
function getLocalName() {
    let gitName;
    if (config.identity === 'git') {
        try {
            gitName = execSync('git config user.name', { encoding: 'utf-8' }).trim();
        }
        catch { }
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
function handleIncomingData(data) {
    const complete = reassembly.ingest(data);
    if (!complete)
        return;
    const msg = decodeMessage(complete);
    if (msg.type === 'chat') {
        inbox.push({ from: msg.from, text: msg.text, ts: msg.ts });
    }
    else if (msg.type === 'pair_request') {
        inbox.pushPairRequest(msg.from, msg.from);
    }
}
scanner.on('discovered', (peer) => {
    peerManager.onDiscovered(peer.id, peer.name, peer.rssi);
});
connectionManager.on('data', (_peerId, data) => {
    handleIncomingData(data);
});
connectionManager.on('connected', (id) => peerManager.onConnected(id));
connectionManager.on('disconnected', (id) => peerManager.onDisconnected(id));
advertiser.on('data', (data) => {
    handleIncomingData(data);
});
const server = new McpServer({
    name: 'ble-nearby',
    version: '0.1.0',
});
server.tool('ble_status', 'Get BLE adapter and connection status', {}, async () => ({
    content: [
        {
            type: 'text',
            text: JSON.stringify({
                adapter: scanner.getAdapterState(),
                advertising: advertiser.isAdvertising(),
                scanning: scanner.isScanning(),
                connections: connectionManager.getConnectionCount(),
                localName,
            }),
        },
    ],
}));
server.tool('ble_scan', 'List nearby discovered Claude Code peers', {}, async () => {
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
server.tool('ble_scan_all', 'List ALL nearby BLE devices (for debugging). Shows both Claude Code peers and other BLE devices.', {}, async () => {
    if (!scanner.isScanning()) {
        await scanner.start();
        await advertiser.start();
    }
    const devices = scanner.getAllDevices().map((d) => ({
        name: d.name,
        id: d.id,
        rssi: d.rssi,
        claudePeer: d.isClaudePeer,
    }));
    return {
        content: [{ type: 'text', text: JSON.stringify({ devices, total: devices.length }) }],
    };
});
server.tool('ble_pair_request', 'Send a pairing request to a discovered peer', { peerId: z.string().describe('The BLE ID of the peer to pair with') }, async ({ peerId }) => {
    const peer = peerManager.getPeer(peerId);
    if (!peer) {
        return {
            content: [
                { type: 'text', text: JSON.stringify({ error: 'Peer not found' }) },
            ],
        };
    }
    if (peer.status !== 'discovered') {
        return {
            content: [
                {
                    type: 'text',
                    text: JSON.stringify({ error: `Peer is already ${peer.status}` }),
                },
            ],
        };
    }
    peerManager.onPairRequestSent(peerId);
    return {
        content: [
            { type: 'text', text: JSON.stringify({ sent: true, to: peer.name }) },
        ],
    };
});
server.tool('ble_pair_accept', 'Accept or reject an incoming pair request', {
    peerId: z.string().describe('The BLE ID of the peer'),
    accept: z.boolean().describe('True to accept, false to reject'),
}, async ({ peerId, accept }) => {
    if (accept) {
        peerManager.onPairAccepted(peerId);
    }
    else {
        peerManager.onPairRejected(peerId);
    }
    return {
        content: [{ type: 'text', text: JSON.stringify({ paired: accept }) }],
    };
});
server.tool('ble_paired_list', 'List all paired (trusted) peers', {}, async () => {
    const pairedRecords = store.getPairedPeers();
    const peers = Object.entries(pairedRecords).map(([id, record]) => ({
        name: record.name,
        id,
        lastSeen: record.pairedAt,
    }));
    return {
        content: [{ type: 'text', text: JSON.stringify({ peers }) }],
    };
});
server.tool('ble_send', 'Send a chat message to a paired peer', {
    peerId: z.string().describe('The BLE ID of the peer'),
    message: z.string().describe('The message text to send'),
}, async ({ peerId, message }) => {
    if (!store.isPaired(peerId)) {
        return {
            content: [
                { type: 'text', text: JSON.stringify({ error: 'Peer not paired' }) },
            ],
        };
    }
    const chunks = prepareOutgoing('chat', localName, message);
    if (connectionManager.isConnected(peerId)) {
        for (const chunk of chunks) {
            await connectionManager.write(peerId, chunk);
        }
        return {
            content: [{ type: 'text', text: JSON.stringify({ delivered: true }) }],
        };
    }
    if (advertiser.isAdvertising()) {
        for (const chunk of chunks) {
            advertiser.sendNotification(chunk);
        }
        return {
            content: [
                {
                    type: 'text',
                    text: JSON.stringify({ delivered: true, via: 'notification' }),
                },
            ],
        };
    }
    return {
        content: [
            {
                type: 'text',
                text: JSON.stringify({
                    delivered: false,
                    error: 'No connection or advertising',
                }),
            },
        ],
    };
});
server.tool('ble_inbox', 'Read unread messages (clears after reading)', { peerId: z.string().optional().describe('Filter by peer name (optional)') }, async ({ peerId }) => {
    const messages = peerId ? inbox.readFrom(peerId) : inbox.read();
    const pairRequests = inbox.getPendingPairRequests();
    return {
        content: [
            {
                type: 'text',
                text: JSON.stringify({ messages, pairRequests }),
            },
        ],
    };
});
server.tool('ble_unpair', 'Remove a peer from the trusted list', { peerId: z.string().describe('The BLE ID of the peer to unpair') }, async ({ peerId }) => {
    peerManager.unpair(peerId);
    if (connectionManager.isConnected(peerId)) {
        await connectionManager.disconnect(peerId);
    }
    return {
        content: [{ type: 'text', text: JSON.stringify({ ok: true }) }],
    };
});
async function main() {
    try {
        await scanner.start();
        await advertiser.start();
    }
    catch (err) {
        console.error('BLE init warning:', err);
    }
    const transport = new StdioServerTransport();
    await server.connect(transport);
}
main().catch((err) => {
    console.error('Fatal:', err);
    process.exit(1);
});
//# sourceMappingURL=mcp-server.js.map