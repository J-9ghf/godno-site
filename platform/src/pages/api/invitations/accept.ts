import type { APIRoute } from 'astro';
import { z } from 'zod';
import { acceptInvitation } from '../../../lib/invitations';
import { auth } from '../../../lib/auth';
import { body } from '../../../lib/http';
import { json, toResponse } from '../../../lib/errors';
import { clientIp } from '../../../lib/request';

const schema = z.object({
  token: z.string().min(20).max(100),
  name: z.string().trim().min(2, 'Укажите имя').max(100),
  password: z.string().min(10, 'Не короче 10 символов').max(128, 'Не длиннее 128 символов'),
});

export const POST: APIRoute = async ({ request, clientAddress }) => {
  try {
    const input = await body(request, schema);
    const r = await acceptInvitation(input, clientIp(request, clientAddress));
    if (r.existingAccount) return json({ ok: true, redirect: '/login', message: 'Доступ добавлен к вашему аккаунту. Войдите со своим паролем.' });
    const res = await auth().api.signInEmail({ body: { email: r.email, password: input.password }, headers: request.headers, asResponse: true });
    const out = json({ ok: true, redirect: res.ok ? '/app' : '/login' });
    for (const c of res.headers.getSetCookie()) out.headers.append('set-cookie', c);
    return out;
  } catch (e) {
    return toResponse(e);
  }
};
