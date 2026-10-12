import { route } from '../../../../../lib/http';
import { id } from '../../../../../lib/params';
import { revokeMembership } from '../../../../../lib/users';
export const POST = route('admin', async ({ params }, a) => revokeMembership(a.userId, id(params.id)));
