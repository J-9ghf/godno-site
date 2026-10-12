import { route, body } from '../../../../lib/http';
import * as s from '../../../../lib/services/admin';
export const GET = route('admin', async ({ url }, a) => s.listCandidates(a.userId, url.searchParams.get('q') ?? undefined));
export const POST = route('admin', async ({ request }, a) => s.createCandidate(a.userId, await body(request, s.candidateInput)));
