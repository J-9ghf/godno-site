import { route } from '../../../../../lib/http';
import { id } from '../../../../../lib/params';
import * as s from '../../../../../lib/services/client';
export const GET = route('client', async ({ params }, a) => s.getPresentation(a, id(params.id)));
