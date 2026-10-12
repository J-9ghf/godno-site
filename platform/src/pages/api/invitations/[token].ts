import { describeInvitation } from '../../../lib/invitations';
import { publicRoute } from '../../../lib/http';
import { notFound } from '../../../lib/errors';

export const GET = publicRoute(async ({ params }) => {
  const inv = await describeInvitation(String(params.token));
  if (!inv) throw notFound();
  return inv;
});
