import { route, body } from '../../../../lib/http';
import { id } from '../../../../lib/params';
import * as s from '../../../../lib/services/admin';
export const GET = route('admin', async ({ params }, a) => s.getVacancy(a.userId, id(params.id)));
export const PATCH = route('admin', async ({ params, request }, a) => s.updateVacancy(a.userId, id(params.id), await body(request, s.vacancyInput.omit({ company_id: true }).partial())));
