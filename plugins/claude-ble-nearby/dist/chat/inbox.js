export class Inbox {
    messages = [];
    pairRequests = [];
    push(msg) {
        this.messages.push(msg);
    }
    read() {
        const msgs = [...this.messages];
        this.messages = [];
        return msgs;
    }
    readFrom(peerId) {
        const matching = this.messages.filter((m) => m.from === peerId);
        this.messages = this.messages.filter((m) => m.from !== peerId);
        return matching;
    }
    pushPairRequest(name, id) {
        this.pairRequests.push({ name, id });
    }
    getPendingPairRequests() {
        const reqs = [...this.pairRequests];
        this.pairRequests = [];
        return reqs;
    }
}
//# sourceMappingURL=inbox.js.map