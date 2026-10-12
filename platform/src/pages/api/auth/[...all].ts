// Наружу открыты только нужные маршруты Better Auth. Регистрация и прямой вход закрыты:
// вход идёт через /api/session/login, где работает ограничение попыток.
import type { APIRoute } from 'astro';
import { auth } from '../../../lib/auth';
import { json } from '../../../lib/errors';

const ALLOWED: Record<string, string[]> = {
  '/api/auth/get-session': ['GET'],
  '/api/auth/sign-out': ['POST'],
  '/api/auth/request-password-reset': ['POST'],
  '/api/auth/reset-password': ['POST'],
};

export const ALL: APIRoute = async ({ request, url }) => {
  if (!ALLOWED[url.pathname]?.includes(request.method)) return json({ error: 'not_found', message: 'Не найдено' }, 404);
  return auth().handler(request);
};
