// Закрытое файловое хранилище. Наружу файлы не публикуются: их отдаёт только сервер после проверки прав.
// Драйверы: local (разработка и тесты, папка вне публичного каталога) и s3 (Yandex Object Storage и совместимые).
import { env } from '../env';
import { LocalStore } from './local';
import { S3Store } from './s3';

export interface FileStore {
  put(key: string, data: Buffer, mime: string): Promise<void>;
  get(key: string): Promise<Buffer>;
  delete(key: string): Promise<void>;
}

let store: FileStore | null = null;
export function fileStore(): FileStore {
  if (!store) {
    const e = env();
    store = e.STORAGE_DRIVER === 's3'
      ? new S3Store({ endpoint: e.S3_ENDPOINT, region: e.S3_REGION, bucket: e.S3_BUCKET!, accessKeyId: e.S3_ACCESS_KEY_ID!, secretAccessKey: e.S3_SECRET_ACCESS_KEY!, forcePathStyle: e.S3_FORCE_PATH_STYLE })
      : new LocalStore(e.STORAGE_LOCAL_DIR);
  }
  return store;
}

export const validKey = (key: string) => /^[a-z]+\/[0-9a-f-]{36}\/[0-9a-f-]{36}$/.test(key);
