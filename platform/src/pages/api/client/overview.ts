import { route } from '../../../lib/http';
import * as s from '../../../lib/services/client';
export const GET = route('client', async (_c, a) => s.overview(a));
