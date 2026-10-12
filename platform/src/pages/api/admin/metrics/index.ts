import { route } from '../../../../lib/http';
import { optDate, optId } from '../../../../lib/params';
import * as s from '../../../../lib/services/admin';
export const GET = route('admin', async ({ url }, a) => s.metrics(a.userId, {
  companyId: optId(url.searchParams.get('company_id')), vacancyId: optId(url.searchParams.get('vacancy_id')),
  from: optDate(url.searchParams.get('from')), to: optDate(url.searchParams.get('to')) }));
