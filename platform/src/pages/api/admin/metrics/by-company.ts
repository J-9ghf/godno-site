import { route } from '../../../../lib/http';
import { optDate } from '../../../../lib/params';
import * as s from '../../../../lib/services/admin';
export const GET = route('admin', async ({ url }, a) => s.metricsByCompany(a.userId, { from: optDate(url.searchParams.get('from')), to: optDate(url.searchParams.get('to')) }));
