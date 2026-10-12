// Драйвер S3 проверяется на локальном эмуляторе (moto), без облака. Если эмулятора нет, тест пропускается с пояснением.
import { describe, expect, it } from 'vitest';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { CreateBucketCommand, S3Client } from '@aws-sdk/client-s3';
import { S3Store } from '../src/lib/storage/s3';

const MOTO = process.env.MOTO_SERVER ?? '';
describe.skipIf(!MOTO || !existsSync(MOTO))('Драйвер S3 (эмулятор moto)', () => {
  it('сохраняет, читает и удаляет объект; недопустимые ключи отклоняются', async () => {
    const port = 45000 + Math.floor(Math.random() * 1000);
    const proc = spawn(MOTO, ['-p', String(port)], { stdio: 'ignore' });
    try {
      const endpoint = `http://127.0.0.1:${port}`;
      for (let i = 0; i < 50; i++) { try { await fetch(endpoint); break; } catch { await new Promise((r) => setTimeout(r, 200)); } }
      const creds = { accessKeyId: 'test', secretAccessKey: 'test' };
      await new S3Client({ endpoint, region: 'ru-central1', forcePathStyle: true, credentials: creds }).send(new CreateBucketCommand({ Bucket: 'ikr-test' }));
      const store = new S3Store({ endpoint, region: 'ru-central1', bucket: 'ikr-test', forcePathStyle: true, ...creds });
      const key = 'cand/11111111-1111-1111-1111-111111111111/22222222-2222-2222-2222-222222222222';
      await store.put(key, Buffer.from('%PDF-test'), 'application/pdf');
      expect((await store.get(key)).toString()).toBe('%PDF-test');
      await expect(store.put('../etc/passwd', Buffer.from('x'), 'text/plain')).rejects.toThrow();
      await store.delete(key);
      await expect(store.get(key)).rejects.toThrow();
    } finally {
      proc.kill();
    }
  });
});
