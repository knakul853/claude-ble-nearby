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
    const reqs = inbox.getPendingPairRequests();
    expect(reqs).toHaveLength(1);
    expect(reqs[0]).toEqual({ name: 'dev-coral-fox', id: 'uuid-1' });
  });

  it('clears pair request after retrieval', () => {
    inbox.pushPairRequest('dev-coral-fox', 'uuid-1');
    inbox.getPendingPairRequests();
    expect(inbox.getPendingPairRequests()).toEqual([]);
  });
});
