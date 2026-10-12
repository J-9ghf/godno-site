import { route } from '../../../../../lib/http';
import { id } from '../../../../../lib/params';
import * as s from '../../../../../lib/services/admin';
export const GET = route('admin', async ({ params }, a) => s.applicationHistory(a.userId, id(params.id)));
