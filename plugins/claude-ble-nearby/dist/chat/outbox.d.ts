import { type MessageType } from '../ble/constants.js';
export declare function prepareOutgoing(type: MessageType, from: string, text: string, mtu?: number): Buffer[];
