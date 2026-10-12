import { z } from 'zod';
import { route, body } from '../../../../../lib/http';
import { setBlocked } from '../../../../../lib/users';
const schema = z.object({ blocked: z.boolean(), reason: z.string().trim().max(500).optional() });
export const POST = route('admin', async ({ params, request }, a) => {
  const i = await body(request, schema);
  await setBlocked(a.userId, String(params.id), i.blocked, i.reason);
  return { ok: true };
});
