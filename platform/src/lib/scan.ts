// Антивирусная проверка через ClamAV (clamd, протокол INSTREAM по TCP).
// ClamAV — свободная программа, разворачивается на своём сервере рядом с приложением; данные никуда не передаются.
// Если проверка включена и ClamAV недоступен, файл не принимается (отказ по умолчанию).
import { connect } from 'node:net';

export type ScanResult = { status: 'clean' } | { status: 'infected'; signature: string };

export function scanBuffer(data: Buffer, host: string, port: number, timeoutMs = 30_000): Promise<ScanResult> {
  return new Promise((resolve, reject) => {
    const sock = connect({ host, port });
    let reply = '';
    const timer = setTimeout(() => { sock.destroy(); reject(new Error('ClamAV не ответил вовремя')); }, timeoutMs);
    sock.on('error', (e) => { clearTimeout(timer); reject(new Error('ClamAV недоступен: ' + e.message)); });
    sock.on('data', (d) => { reply += d.toString('latin1'); });
    sock.on('end', () => {
      clearTimeout(timer);
      const r = reply.replace(/\0/g, '').trim();
      if (/^stream: OK$/.test(r)) resolve({ status: 'clean' });
      else if (/^stream: (.+) FOUND$/.test(r)) resolve({ status: 'infected', signature: r.replace(/^stream: (.+) FOUND$/, '$1') });
      else reject(new Error('Неожиданный ответ ClamAV'));
    });
    sock.on('connect', () => {
      sock.write('zINSTREAM\0');
      const CHUNK = 64 * 1024;
      for (let i = 0; i < data.length; i += CHUNK) {
        const part = data.subarray(i, i + CHUNK);
        const len = Buffer.alloc(4); len.writeUInt32BE(part.length);
        sock.write(len); sock.write(part);
      }
      sock.end(Buffer.alloc(4));
    });
  });
}
