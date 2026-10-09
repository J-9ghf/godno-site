import 'server-only';
import { adminClient } from '@/lib/supabase/admin';

/**
 * Хранилище файлов. Сейчас — Supabase Storage. При переезде на S3-совместимое хранилище
 * (Yandex Object Storage, Selectel) меняется только этот модуль: в базе лежат ключи объектов.
 */
export type Bucket = 'resumes' | 'videos' | 'documents' | 'attachments';

/** Одноразовая ссылка, по которой браузер загружает файл напрямую в закрытое хранилище (минуя сервер приложения). */
export async function createUploadUrl(bucket: Bucket, key: string): Promise<{ url: string }> {
  const { data, error } = await adminClient().storage.from(bucket).createSignedUploadUrl(key);
  if (error || !data) throw new Error(`Не удалось подготовить загрузку: ${error?.message}`);
  return { url: data.signedUrl };
}

/** Содержимое загруженного объекта — для проверки (резюме не больше 10 МБ). */
export async function readObject(bucket: Bucket, key: string): Promise<Uint8Array | null> {
  const { data, error } = await adminClient().storage.from(bucket).download(key);
  if (error || !data) return null;
  return new Uint8Array(await data.arrayBuffer());
}

export async function moveObject(bucket: Bucket, from: string, to: string): Promise<boolean> {
  const { error } = await adminClient().storage.from(bucket).move(from, to);
  return !error;
}

export async function removeObject(bucket: Bucket, key: string): Promise<void> {
  await adminClient().storage.from(bucket).remove([key]);
}

/** Временная ссылка на чтение закрытого файла. */
export async function signedReadUrl(bucket: Bucket, key: string, seconds = 300): Promise<string | null> {
  const { data } = await adminClient().storage.from(bucket).createSignedUrl(key, seconds);
  return data?.signedUrl ?? null;
}
