import { route, body } from '../../../../../lib/http';
import { id } from '../../../../../lib/params';
import * as s from '../../../../../lib/services/admin';
export const POST = route('admin', async ({ params, request }, a) => s.recordConsent(a.userId, id(params.id), await body(request, s.consentInput)));
