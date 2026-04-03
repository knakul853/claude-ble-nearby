import { EventEmitter } from 'node:events';
export declare class BleAdvertiser extends EventEmitter {
    private advertising;
    private localName;
    private child;
    constructor(localName: string);
    start(): Promise<void>;
    stop(): Promise<void>;
    sendNotification(_data: Buffer): boolean;
    isAdvertising(): boolean;
    setLocalName(name: string): void;
}
