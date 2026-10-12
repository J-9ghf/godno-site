import { route } from '../../../lib/http';

export const GET = route('session', async (_ctx, a) => ({
  user: { name: a.name, email: a.email },
  kind: a.kind,
  companies: a.memberships.map((m) => ({ name: m.companyName, role: m.role })),
}));
