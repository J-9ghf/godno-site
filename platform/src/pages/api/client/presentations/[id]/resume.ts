import { route } from '../../../../../lib/http';
import { id } from '../../../../../lib/params';
import { fileResponse } from '../../../../../lib/files';
import { clientReadResume } from '../../../../../lib/services/files';
export const GET = route('client', async ({ params, url }, a) => {
  const download = url.searchParams.get('download') === '1';
  const f = await clientReadResume(a, id(params.id), download);
  return fileResponse(f.data, f.meta, download);
});
