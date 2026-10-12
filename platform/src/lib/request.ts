import { env } from './env';
// IP клиента. За обратным прокси (Caddy) доверяем заголовку X-Real-IP только при TRUST_PROXY=true.
export function clientIp(request: Request, fallback?: string): string {
  if (env().TRUST_PROXY) {
    const ip = request.headers.get('x-real-ip') ?? request.headers.get('x-forwarded-for')?.split(',')[0]?.trim();
    if (ip) return ip;
  }
  return fallback ?? 'unknown';
}
