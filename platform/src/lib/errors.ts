// Ошибки API и единый формат ответов. Внутренние подробности (SQL, стек) наружу не уходят.
export class HttpError extends Error {
  constructor(public status: number, public code: string, message: string, public fields?: Record<string, string>) { super(message); }
}
export const notFound = () => new HttpError(404, 'not_found', 'Не найдено');
export const forbidden = (m = 'Недостаточно прав') => new HttpError(403, 'forbidden', m);
export const unauthorized = () => new HttpError(401, 'unauthorized', 'Нужно войти в кабинет');
export const badRequest = (m: string, fields?: Record<string, string>) => new HttpError(400, 'bad_request', m, fields);
export const conflict = (m: string) => new HttpError(409, 'conflict', m);

export function json(data: unknown, status = 200, headers: HeadersInit = {}) {
  const h = new Headers(headers);
  h.set('content-type', 'application/json; charset=utf-8');
  h.set('cache-control', 'no-store');
  return new Response(JSON.stringify(data), { status, headers: h });
}

// Коды ошибок из функций базы (см. миграции 0003, 0004)
export function fromDb(e: unknown): HttpError | null {
  const err = e as { code?: string; message?: string };
  switch (err?.code) {
    case 'IK404': return notFound();
    case 'IK403': return forbidden();
    case 'IK409': return conflict('Такой переход между этапами недоступен');
    case 'IK422': return badRequest('Укажите причину отказа', { reason: 'Укажите причину отказа' });
    case 'P0001': return conflict(err.message ?? 'Недопустимое действие');
    case 'P0002': return conflict(err.message ?? 'Нет действующего согласия');
    case '23505': return conflict('Такая запись уже есть');
    case '23503': return notFound();
    case '23514': return badRequest('Данные не прошли проверку');
    case '42501': return notFound();       // нарушение политики RLS: не раскрываем, что запись существует
    case '22P02': return notFound();       // некорректный UUID в адресе
    default: return null;
  }
}

export function toResponse(e: unknown): Response {
  const h = e instanceof HttpError ? e : fromDb(e);
  if (h) return json({ error: h.code, message: h.message, fields: h.fields }, h.status);
  console.error('[api] необработанная ошибка:', (e as Error)?.message);
  return json({ error: 'server_error', message: 'Ошибка сервера. Попробуйте ещё раз.' }, 500);
}
