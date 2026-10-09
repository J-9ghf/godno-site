// Проверка файла резюме по содержимому, а не только по расширению. Чистая функция, покрыта unit-тестами.

export const RESUME_MAX_BYTES = 10 * 1024 * 1024;

export const RESUME_TYPES = {
  pdf: 'application/pdf',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
} as const;

export type ResumeExt = keyof typeof RESUME_TYPES;

export function extensionOf(name: string): ResumeExt | null {
  const ext = name.toLowerCase().split('.').pop();
  return ext === 'pdf' || ext === 'doc' || ext === 'docx' ? ext : null;
}

const startsWith = (bytes: Uint8Array, sig: number[]) => sig.every((b, i) => bytes[i] === b);

/** Сигнатура совпадает с расширением: PDF — %PDF-, DOC — OLE2, DOCX — ZIP с word/document.xml. */
export function matchesSignature(bytes: Uint8Array, ext: ResumeExt): boolean {
  if (ext === 'pdf') return startsWith(bytes, [0x25, 0x50, 0x44, 0x46, 0x2d]);
  if (ext === 'doc') return startsWith(bytes, [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);
  if (!startsWith(bytes, [0x50, 0x4b, 0x03, 0x04])) return false;
  // Имена файлов в ZIP хранятся открытым текстом: ищем обязательную часть документа Word.
  return Buffer.from(bytes).includes('word/document.xml');
}

/** Предварительная проверка по метаданным (до загрузки). Окончательная — по содержимому. */
export function checkResumeMeta(name: string, size: number): string | null {
  if (!extensionOf(name)) return 'Подходят файлы PDF, DOC или DOCX';
  if (size <= 0) return 'Файл пустой';
  if (size > RESUME_MAX_BYTES) return 'Файл больше 10 МБ';
  return null;
}
