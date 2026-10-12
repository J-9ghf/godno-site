import { route } from '../../../../lib/http';
import { id } from '../../../../lib/params';
import { fileResponse } from '../../../../lib/files';
import { adminReadFile, deleteFile } from '../../../../lib/services/files';
export const GET = route('admin', async ({ params, url }, a) => {
  const download = url.searchParams.get('download') === '1';
  const f = await adminReadFile(a.userId, id(params.id), download);
  return fileResponse(f.data, f.meta, download);
});
export const DELETE = route('admin', async ({ params }, a) => deleteFile(a.userId, id(params.id)));
