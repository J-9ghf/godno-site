import { z } from 'zod';
import { route, body } from '../../../../../lib/http';
import { id } from '../../../../../lib/params';
import * as s from '../../../../../lib/services/admin';
export const POST = route('admin', async ({ params, request }, a) => {
  const i = await body(request, z.object({ reason: z.string().trim().max(500).optional() }));
  return s.revokePresentation(a.userId, id(params.id), i.reason ?? null);
});
