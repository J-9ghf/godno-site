// S3-совместимое хранилище (Yandex Object Storage: endpoint https://storage.yandexcloud.net, регион ru-central1).
// Бакет должен быть закрытым; шифрование включается на уровне бакета (ключ KMS). Публичные ссылки не создаются.
import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import type { FileStore } from './index';
import { validKey } from './index';

export class S3Store implements FileStore {
  private client: S3Client;
  constructor(private cfg: { endpoint?: string; region: string; bucket: string; accessKeyId: string; secretAccessKey: string; forcePathStyle: boolean }) {
    this.client = new S3Client({ endpoint: cfg.endpoint, region: cfg.region, forcePathStyle: cfg.forcePathStyle,
      credentials: { accessKeyId: cfg.accessKeyId, secretAccessKey: cfg.secretAccessKey } });
  }
  async put(key: string, data: Buffer, mime: string) {
    if (!validKey(key)) throw new Error('Недопустимый ключ файла');
    await this.client.send(new PutObjectCommand({ Bucket: this.cfg.bucket, Key: key, Body: data, ContentType: mime, ACL: 'private' }));
  }
  async get(key: string) {
    if (!validKey(key)) throw new Error('Недопустимый ключ файла');
    const r = await this.client.send(new GetObjectCommand({ Bucket: this.cfg.bucket, Key: key }));
    return Buffer.from(await r.Body!.transformToByteArray());
  }
  async delete(key: string) {
    if (!validKey(key)) throw new Error('Недопустимый ключ файла');
    await this.client.send(new DeleteObjectCommand({ Bucket: this.cfg.bucket, Key: key }));
  }
}
