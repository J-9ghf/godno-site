import { route } from '../../../../../lib/http';
import { revokeSessions } from '../../../../../lib/users';
export const DELETE = route('admin', async ({ params }, a) => revokeSessions(a.userId, String(params.id)));
