import { z } from 'zod';
import { notFound, badRequest } from './errors';
// ID в адресе: некорректный ID даёт 404, как и чужая запись
export function id(v: string | undefined): string {
  const r = z.uuid().safeParse(v);
  if (!r.success) throw notFound();
  return r.data;
}
export function optId(v: string | null | undefined): string | undefined {
  if (!v) return undefined;
  const r = z.uuid().safeParse(v);
  if (!r.success) throw badRequest('Некорректный идентификатор');
  return r.data;
}
export function optDate(v: string | null | undefined): string | undefined {
  if (!v) return undefined;
  if (!/^\d{4}-\d{2}-\d{2}(T[\d:.]+(Z|[+-]\d{2}:\d{2})?)?$/.test(v) || Number.isNaN(Date.parse(v))) throw badRequest('Некорректная дата');
  return v;
}
