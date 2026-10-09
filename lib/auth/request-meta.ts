import 'server-only';
import { headers } from 'next/headers';

/** IP и user-agent запроса. На Vercel и за nginx IP клиента — первый адрес в x-forwarded-for. */
export async function requestMeta(): Promise<{ ip: string | null; userAgent: string | null }> {
  const h = await headers();
  const forwarded = h.get('x-forwarded-for')?.split(',')[0]?.trim();
  const ip = forwarded || h.get('x-real-ip') || null;
  return { ip: ip && /^[0-9a-fA-F:.]+$/.test(ip) ? ip : null, userAgent: h.get('user-agent') };
}
