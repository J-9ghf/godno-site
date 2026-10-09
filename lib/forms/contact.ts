// Разбор поля «Телефон или Telegram» и проверка ссылки на видео. Чистые функции, покрыты unit-тестами.

export type Contact = { phone: string; telegram: null } | { phone: null; telegram: string };

/** Телефон: 10–15 цифр, допускаются +, пробелы, скобки, дефисы. Telegram: @ник, ник или ссылка t.me. */
export function parseContact(raw: string): Contact | null {
  const value = raw.trim();
  if (!value || value.length > 100) return null;
  if (/^\+?[\d\s()\-]+$/.test(value)) {
    const digits = value.replace(/\D/g, '');
    return digits.length >= 10 && digits.length <= 15 ? { phone: value, telegram: null } : null;
  }
  const m = value.match(/^(?:https?:\/\/)?(?:t\.me\/|telegram\.me\/)?@?([A-Za-z][A-Za-z0-9_]{4,31})\/?$/i);
  return m ? { phone: null, telegram: `@${m[1]}` } : null;
}

/** Ссылка на видео: только https. Любой хостинг (Яндекс.Диск, YouTube, Rutube…), длина до 500. */
export function isValidVideoUrl(raw: string): boolean {
  if (!raw) return true;
  if (raw.length > 500) return false;
  try {
    const url = new URL(raw);
    return url.protocol === 'https:' && url.hostname.includes('.');
  } catch {
    return false;
  }
}
