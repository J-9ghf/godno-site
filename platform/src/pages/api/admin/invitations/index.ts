import { z } from 'zod';
import { route, body } from '../../../../lib/http';
import { createInvitation } from '../../../../lib/invitations';
import { clientIp } from '../../../../lib/request';
const schema = z.union([
  z.object({ email: z.email('Проверьте почту'), company_id: z.uuid(), member_role: z.enum(['owner', 'member', 'viewer']).default('member') }),
  z.object({ email: z.email('Проверьте почту'), staff_role: z.literal('admin') }),
]);
export const POST = route('admin', async ({ request, clientAddress }, a) => {
  const i = await body(request, schema);
  return createInvitation(a.userId, 'company_id' in i ? { email: i.email, companyId: i.company_id, memberRole: i.member_role } : { email: i.email, staffRole: 'admin' }, clientIp(request, clientAddress));
});
