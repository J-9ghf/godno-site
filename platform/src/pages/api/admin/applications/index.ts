import { route, body } from '../../../../lib/http';
import * as s from '../../../../lib/services/admin';
export const POST = route('admin', async ({ request }, a) => s.createApplication(a.userId, await body(request, s.applicationInput)));
