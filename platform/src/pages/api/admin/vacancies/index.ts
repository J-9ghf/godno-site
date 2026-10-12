import { route, body } from '../../../../lib/http';
import { optId } from '../../../../lib/params';
import * as s from '../../../../lib/services/admin';
export const GET = route('admin', async ({ url }, a) => s.listVacancies(a.userId, optId(url.searchParams.get('company_id'))));
export const POST = route('admin', async ({ request }, a) => s.createVacancy(a.userId, await body(request, s.vacancyInput)));
