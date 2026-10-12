import { route, body } from '../../../../lib/http';
import { id } from '../../../../lib/params';
import * as s from '../../../../lib/services/admin';
export const GET = route('admin', async ({ params }, a) => s.getCompany(a.userId, id(params.id)));
export const PATCH = route('admin', async ({ params, request }, a) => s.updateCompany(a.userId, id(params.id), await body(request, s.companyInput.partial())));
