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
