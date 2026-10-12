import { route } from '../../../lib/http';
import { optDate, optId } from '../../../lib/params';
import * as s from '../../../lib/services/client';
export const GET = route('client', async ({ url }, a) => s.metrics(a, {
  vacancyId: optId(url.searchParams.get('vacancy_id')), from: optDate(url.searchParams.get('from')), to: optDate(url.searchParams.get('to')) }));
