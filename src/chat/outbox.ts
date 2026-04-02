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
