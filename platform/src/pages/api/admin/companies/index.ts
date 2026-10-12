import { route, body } from '../../../../lib/http';
import * as s from '../../../../lib/services/admin';
export const GET = route('admin', async (_c, a) => s.listCompanies(a.userId));
export const POST = route('admin', async ({ request }, a) => s.createCompany(a.userId, await body(request, s.companyInput)));
