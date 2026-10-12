import { route } from '../../../../lib/http';
import { optId } from '../../../../lib/params';
import * as s from '../../../../lib/services/client';
export const GET = route('client', async ({ url }, a) => s.listPresentations(a, optId(url.searchParams.get('vacancy_id'))));
