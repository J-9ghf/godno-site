// Обёртка для API-маршрутов: проверка роли, разбор тела запроса, единый формат ошибок.
import type { APIContext } from 'astro';
import { z } from 'zod';
import type { Actor } from './session';
import { badRequest, forbidden, json, toResponse, unauthorized } from './errors';

// session — любой вошедший пользователь, даже если доступ к компаниям отозван
type Role = 'admin' | 'client' | 'any' | 'session';
export function route(role: Role, fn: (ctx: APIContext, actor: Actor) => Promise<unknown>) {
  return async (ctx: APIContext) => {
    try {
      const actor = ctx.locals.actor;
      if (!actor) throw unauthorized();
      if (role === 'admin' && actor.kind !== 'admin') throw forbidden();
      if (role === 'client' && actor.kind !== 'client') throw forbidden();
      if (role === 'any' && actor.kind === 'none') throw forbidden();
      const out = await fn(ctx, actor);
      return out instanceof Response ? out : json(out ?? { ok: true });
    } catch (e) {
      return toResponse(e);
    }
  };
}

export function publicRoute(fn: (ctx: APIContext) => Promise<unknown>) {
  return async (ctx: APIContext) => {
    try {
      const out = await fn(ctx);
      return out instanceof Response ? out : json(out ?? { ok: true });
    } catch (e) {
      return toResponse(e);
    }
  };
}

export async function body<T extends z.ZodType>(request: Request, schema: T): Promise<z.infer<T>> {
  let data: unknown;
  try { data = await request.json(); } catch { throw badRequest('Некорректный запрос'); }
  return parse(schema, data);
}

export function parse<T extends z.ZodType>(schema: T, data: unknown): z.infer<T> {
  const r = schema.safeParse(data);
  if (!r.success) {
    const fields: Record<string, string> = {};
    for (const i of r.error.issues) fields[i.path.join('.') || '_'] = i.message;
    throw badRequest('Проверьте отмеченные поля', fields);
  }
  return r.data;
}

export const uuid = z.uuid('Некорректный идентификатор');
export function query(url: URL, key: string) { return url.searchParams.get(key) || undefined; }
