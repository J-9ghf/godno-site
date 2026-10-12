// Приём и выдача файлов. Тип определяется по содержимому (сигнатуре), а не по расширению.
// PDF дополнительно открывается библиотекой pdf.js: повреждённые и защищённые паролем файлы отклоняются.
// Текст из PDF не извлекается и поля карточки автоматически не заполняются.
import { createHash, randomUUID } from 'node:crypto';
import { env } from './env';
import { badRequest } from './errors';
import { fileStore } from './storage';

export type Kind = 'resume_pdf' | 'photo' | 'document' | 'other';
const MB = 1024 * 1024;
const LIMITS: Record<Kind, number> = { resume_pdf: 15, photo: 5, document: 15, other: 15 };

function sniff(buf: Buffer): { mime: string; ext: string } | null {
  if (buf.subarray(0, 5).toString('latin1') === '%PDF-') return { mime: 'application/pdf', ext: 'pdf' };
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return { mime: 'image/jpeg', ext: 'jpg' };
  if (buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return { mime: 'image/png', ext: 'png' };
  if (buf.subarray(0, 4).equals(Buffer.from([0x50, 0x4b, 0x03, 0x04])) && buf.includes(Buffer.from('word/'))) return { mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', ext: 'docx' };
  if (buf.subarray(0, 8).equals(Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]))) return { mime: 'application/msword', ext: 'doc' };
  return null;
}

const ALLOWED: Record<Kind, string[]> = {
  resume_pdf: ['application/pdf'],
  photo: ['image/jpeg', 'image/png'],
  document: ['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/msword', 'image/jpeg', 'image/png'],
  other: ['application/pdf', 'image/jpeg', 'image/png'],
};

async function pdfPages(buf: Buffer): Promise<number> {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  try {
    const task = pdfjs.getDocument({ data: new Uint8Array(buf), disableFontFace: true, useSystemFonts: false, verbosity: 0 });
    const doc = await task.promise;
    const n = doc.numPages;
    await task.destroy();
    return n;
  } catch (e) {
    const name = (e as Error)?.name;
    if (name !== 'PasswordException' && name !== 'InvalidPDFException') console.error('[files] pdf.js:', name, (e as Error)?.message);
    if (name === 'PasswordException') throw badRequest('PDF защищён паролем. Загрузите файл без пароля.', { file: 'PDF защищён паролем' });
    throw badRequest('Файл повреждён или это не PDF.', { file: 'Файл повреждён или это не PDF' });
  }
}

export const cleanName = (name: string) =>
  (name.split(/[\\/]/).pop() ?? 'file').replace(/[\u0000-\u001f\u007f<>:"|?*]/g, '').trim().slice(0, 150) || 'file';

export async function acceptUpload(file: File, kind: Kind, owner: { candidateId?: string; companyId?: string }) {
  const e = env();
  const limitMb = Math.min(LIMITS[kind], e.MAX_UPLOAD_MB);
  if (!file || typeof file.arrayBuffer !== 'function') throw badRequest('Выберите файл', { file: 'Выберите файл' });
  if (file.size === 0) throw badRequest('Файл пустой', { file: 'Файл пустой' });
  if (file.size > limitMb * MB) throw badRequest(`Файл больше ${limitMb} МБ`, { file: `Максимум ${limitMb} МБ` });
  const buf = Buffer.from(await file.arrayBuffer());
  const type = sniff(buf);
  if (!type || !ALLOWED[kind].includes(type.mime)) {
    throw badRequest(kind === 'resume_pdf' ? 'Резюме принимается только в формате PDF' : 'Этот тип файла не поддерживается', { file: 'Недопустимый тип файла' });
  }
  const pageCount = type.mime === 'application/pdf' ? await pdfPages(buf) : null;
  const prefix = owner.candidateId ? 'cand' : 'comp';
  const key = `${prefix}/${owner.candidateId ?? owner.companyId}/${randomUUID()}`;
  await fileStore().put(key, buf, type.mime);
  return {
    storage_key: key, mime: type.mime, size_bytes: buf.length, page_count: pageCount,
    sha256: createHash('sha256').update(buf).digest('hex'), original_name: cleanName(file.name),
  };
}

// Ответ с файлом: без кэширования, без определения типа браузером, в изолированном контексте.
export function fileResponse(data: Buffer, f: { mime: string; original_name: string }, download: boolean) {
  const encoded = encodeURIComponent(f.original_name).replace(/['()*]/g, (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase());
  const ascii = f.original_name.replace(/[^\x20-\x7e]/g, '_').replace(/"/g, '');
  return new Response(new Uint8Array(data), {
    status: 200,
    headers: {
      'Content-Type': f.mime,
      'Content-Length': String(data.length),
      'Content-Disposition': `${download ? 'attachment' : 'inline'}; filename="${ascii}"; filename*=UTF-8''${encoded}`,
      'Cache-Control': 'private, no-store, max-age=0',
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "default-src 'none'; sandbox",
      'Cross-Origin-Resource-Policy': 'same-origin',
    },
  });
}
