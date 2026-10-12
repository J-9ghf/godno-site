import { route } from '../../../../../lib/http';
import { id } from '../../../../../lib/params';
import { revokeInvitation } from '../../../../../lib/invitations';
export const POST = route('admin', async ({ params }, a) => revokeInvitation(a.userId, id(params.id)));
