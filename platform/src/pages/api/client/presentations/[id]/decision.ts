import { route, body } from '../../../../../lib/http';
import { id } from '../../../../../lib/params';
import * as s from '../../../../../lib/services/client';
export const POST = route('client', async ({ params, request }, a) => s.decide(a, id(params.id), await body(request, s.decisionInput)));
