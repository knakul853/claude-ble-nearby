import { EventEmitter } from 'node:events';
import { fork, type ChildProcess } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export class BleAdvertiser extends EventEmitter {
  private advertising = false;
  private localName: string;
  private child: ChildProcess | null = null;

  constructor(localName: string) {
    super();
    this.localName = localName;
  }

  async start(): Promise<void> {
    if (this.advertising) return;

    const workerPath = path.join(__dirname, 'advertiser-worker.js');

    return new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Advertiser start timeout')), 15_000);

      this.child = fork(workerPath, [this.localName], { silent: true });

      this.child.on('message', (msg: { type: string; data?: string; message?: string; name?: string }) => {
        if (msg.type === 'advertising') {
          clearTimeout(timeout);
          this.advertising = true;
          resolve();
        } else if (msg.type === 'error') {
          clearTimeout(timeout);
          reject(new Error(msg.message));
        } else if (msg.type === 'data') {
          this.emit('data', Buffer.from(msg.data!, 'base64'));
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

  async stop(): Promise<void> {
    if (!this.advertising || !this.child) return;
    this.child.send({ type: 'stop' });
    this.child = null;
    this.advertising = false;
  }

  sendNotification(_data: Buffer): boolean {
    // TODO: implement via IPC once GATT connections are working
    return false;
  }

  isAdvertising(): boolean {
    return this.advertising;
  }

  setLocalName(name: string): void {
    this.localName = name;
  }
}
