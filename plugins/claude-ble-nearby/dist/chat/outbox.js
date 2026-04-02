import { encodeMessage, chunkPayload } from '../ble/protocol.js';
import { DEFAULT_MTU } from '../ble/constants.js';
let seqCounter = 0;
function nextSeq() {
    seqCounter = (seqCounter + 1) % 256;
    return seqCounter;
}
export function prepareOutgoing(type, from, text, mtu = DEFAULT_MTU) {
    const msg = {
        type,
        from,
        text,
        ts: Math.floor(Date.now() / 1000),
        seq: nextSeq(),
    };
    const payload = encodeMessage(msg);
    return chunkPayload(payload, msg.seq, mtu);
}
//# sourceMappingURL=outbox.js.map