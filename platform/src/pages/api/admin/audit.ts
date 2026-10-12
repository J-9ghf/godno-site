import { route } from '../../../lib/http';
import { optId } from '../../../lib/params';
import * as s from '../../../lib/services/admin';
export const GET = route('admin', async ({ url }, a) => s.listAudit(a.userId, {
  companyId: optId(url.searchParams.get('company_id')), action: url.searchParams.get('action') ?? undefined, limit: Number(url.searchParams.get('limit') ?? 200) || 200 }));
