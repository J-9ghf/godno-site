import { route } from '../../../../lib/http';
import { id } from '../../../../lib/params';
import * as s from '../../../../lib/services/admin';
export const DELETE = route('admin', async ({ params }, a) => s.deleteLink(a.userId, id(params.id)));
