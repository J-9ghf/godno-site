import { route } from '../../../../lib/http';
import { listUsers } from '../../../../lib/users';
export const GET = route('admin', async (_c, a) => listUsers(a.userId));
