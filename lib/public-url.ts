/**
 * Публичный адрес сайта из APP_URL. За прокси (Caddy) request.url содержит внутренний адрес
 * приложения (http://localhost:3000), поэтому переходы и проверка источника запроса строятся от APP_URL.
 * Без 'server-only': модуль нужен и в proxy.ts.
 */
export function publicBase(): URL {
  return new URL(process.env.APP_URL || 'http://localhost:3000');
}

/** Абсолютный адрес страницы сайта, например publicUrl('/login?reason=logout'). */
export function publicUrl(path: string): URL {
  return new URL(path, publicBase());
}

/** Запрос пришёл со страницы нашего сайта: заголовок Origin совпадает с публичным адресом. */
export function isOwnOrigin(origin: string | null): boolean {
  if (!origin) return true;
  try {
    return new URL(origin).origin === publicBase().origin;
  } catch {
    return false;
  }
}
