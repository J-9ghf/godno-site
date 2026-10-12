import { route } from '../../../../../lib/http';
import { id } from '../../../../../lib/params';
import { badRequest } from '../../../../../lib/errors';
import { env } from '../../../../../lib/env';
import { uploadCandidateFile } from '../../../../../lib/services/files';
const KINDS = ['resume_pdf', 'photo', 'document', 'other'] as const;
export const POST = route('admin', async ({ params, request }, a) => {
  const len = Number(request.headers.get('content-length') ?? 0);
  if (len > (env().MAX_UPLOAD_MB + 1) * 1024 * 1024) throw badRequest('Файл слишком большой', { file: `Максимум ${env().MAX_UPLOAD_MB} МБ` });
  let form: FormData;
  try { form = await request.formData(); } catch { throw badRequest('Ожидается форма с файлом'); }
  const kind = String(form.get('kind') ?? 'resume_pdf');
  if (!(KINDS as readonly string[]).includes(kind)) throw badRequest('Неизвестный тип файла');
  return uploadCandidateFile(a.userId, id(params.id), form.get('file') as File, kind as (typeof KINDS)[number]);
});
