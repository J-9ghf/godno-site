import { route } from '../../../lib/http';

export const GET = route('session', async (_ctx, a) => ({
  user: { name: a.name, email: a.email },
  kind: a.kind,
  twoFactorEnabled: a.twoFactorEnabled,
  needs2fa: a.needs2fa,
  companies: a.memberships.map((m) => ({ name: m.companyName, role: m.role })),
}));
