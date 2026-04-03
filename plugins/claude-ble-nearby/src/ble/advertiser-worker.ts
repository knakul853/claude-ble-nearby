import bleno from '@stoprocent/bleno';
import {
  NORDIC_UART_SERVICE_UUID,
  NORDIC_UART_RX_UUID,
  NORDIC_UART_TX_UUID,
  META_CHARACTERISTIC_UUID,
} from './constants.js';

const localName = process.argv[2] || 'unknown';
const prefixedName = 'cc-' + localName;

function start() {
  const rxCharacteristic = new bleno.Characteristic({
    uuid: NORDIC_UART_RX_UUID,
    properties: ['write', 'writeWithoutResponse'],
    onWriteRequest: (data: Buffer, _offset: number, _withoutResponse: boolean, callback: (result: number) => void) => {
      process.send?.({ type: 'data', data: data.toString('base64') });
      callback(bleno.Characteristic.RESULT_SUCCESS);
    },
  });

  const txCharacteristic = new bleno.Characteristic({
    uuid: NORDIC_UART_TX_UUID,
    properties: ['notify'],
    onSubscribe: () => {
      process.send?.({ type: 'subscribed' });
    },
    onUnsubscribe: () => {
      process.send?.({ type: 'unsubscribed' });
    },
  });

  const metaCharacteristic = new bleno.Characteristic({
    uuid: META_CHARACTERISTIC_UUID,
    properties: ['read'],
    onReadRequest: (_offset: number, callback: (result: number, data?: Buffer) => void) => {
      const meta = JSON.stringify({ name: localName, version: '0.1.0' });
      callback(bleno.Characteristic.RESULT_SUCCESS, Buffer.from(meta, 'utf-8'));
    },
  });

  const service = new bleno.PrimaryService({
    uuid: NORDIC_UART_SERVICE_UUID,
    characteristics: [rxCharacteristic, txCharacteristic, metaCharacteristic],
  });

  bleno.startAdvertising(prefixedName, [NORDIC_UART_SERVICE_UUID], (err?: Error | null) => {
    if (err) {
      process.send?.({ type: 'error', message: err.message });
      return;
    }
    bleno.setServices([service], (err?: Error | null) => {
      if (err) {
        process.send?.({ type: 'error', message: err.message });
        return;
      }
      process.send?.({ type: 'advertising', name: prefixedName });
    });
  });
}

bleno.on('stateChange', (state: string) => {
  if (state === 'poweredOn') start();
  else process.send?.({ type: 'state', state });
});

if (bleno.state === 'poweredOn') start();

process.on('message', (msg: { type: string }) => {
  if (msg.type === 'stop') {
    bleno.stopAdvertising();
    process.exit(0);
  }
});
