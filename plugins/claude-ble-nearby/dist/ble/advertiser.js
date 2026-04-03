import { EventEmitter } from 'node:events';
import { fork } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
export class BleAdvertiser extends EventEmitter {
    advertising = false;
    localName;
    child = null;
    constructor(localName) {
        super();
        this.localName = localName;
    }
    async start() {
        if (this.advertising)
            return;
        const workerPath = path.join(__dirname, 'advertiser-worker.js');
        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => reject(new Error('Advertiser start timeout')), 15_000);
            this.child = fork(workerPath, [this.localName], { silent: true });
            this.child.on('message', (msg) => {
                if (msg.type === 'advertising') {
                    clearTimeout(timeout);
                    this.advertising = true;
                    resolve();
                }
                else if (msg.type === 'error') {
                    clearTimeout(timeout);
                    reject(new Error(msg.message));
                }
                else if (msg.type === 'data') {
                    this.emit('data', Buffer.from(msg.data, 'base64'));
                }
            });
            this.child.on('error', (err) => {
                clearTimeout(timeout);
                reject(err);
            });
            this.child.on('exit', () => {
                this.advertising = false;
                this.child = null;
            });
        });
    }
    async stop() {
        if (!this.advertising || !this.child)
            return;
        this.child.send({ type: 'stop' });
        this.child = null;
        this.advertising = false;
    }
    sendNotification(_data) {
        // TODO: implement via IPC once GATT connections are working
        return false;
    }
    isAdvertising() {
        return this.advertising;
    }
    setLocalName(name) {
        this.localName = name;
    }
}
//# sourceMappingURL=advertiser.js.map