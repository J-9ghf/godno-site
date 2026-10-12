import { route } from '../../../../../lib/http';
import { resetTwoFactor } from '../../../../../lib/users';
export const POST = route('admin', async ({ params }, a) => resetTwoFactor(a.userId, String(params.id)));
