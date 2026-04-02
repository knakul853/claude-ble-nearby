export interface ChatMessage {
    from: string;
    text: string;
    ts: number;
}
interface PairRequest {
    name: string;
    id: string;
}
export declare class Inbox {
    private messages;
    private pairRequests;
    push(msg: ChatMessage): void;
    read(): ChatMessage[];
    readFrom(peerId: string): ChatMessage[];
    pushPairRequest(name: string, id: string): void;
    getPendingPairRequests(): PairRequest[];
}
export {};
