import { beforeAll, describe, expect, it } from 'vitest';
import { isValidVideoUrl, parseContact } from '@/lib/forms/contact';
import { checkResumeMeta, extensionOf, matchesSignature } from '@/lib/forms/file';

describe('телефон или Telegram', () => {
  it('телефоны в разных форматах', () => {
    expect(parseContact('+7 (900) 000-00-00')).toEqual({ phone: '+7 (900) 000-00-00', telegram: null });
    expect(parseContact('89000000000')?.phone).toBe('89000000000');
  });
  it('Telegram: @ник, ник, ссылка', () => {
    expect(parseContact('@kateriniya')?.telegram).toBe('@kateriniya');
    expect(parseContact('kateriniya')?.telegram).toBe('@kateriniya');
    expect(parseContact('https://t.me/kateriniya')?.telegram).toBe('@kateriniya');
  });
  it('мусор не принимается', () => {
    for (const v of ['', '123', '@ab', 'привет', 'javascript:alert(1)', '+7 900']) expect(parseContact(v)).toBeNull();
  });
});

describe('ссылка на видео', () => {
  it('только https', () => {
    expect(isValidVideoUrl('')).toBe(true);
    expect(isValidVideoUrl('https://disk.yandex.ru/i/abc')).toBe(true);
    expect(isValidVideoUrl('http://disk.yandex.ru/i/abc')).toBe(false);
    expect(isValidVideoUrl('javascript:alert(1)')).toBe(false);
  });
});

describe('файл резюме', () => {
  const pdf = new TextEncoder().encode('%PDF-1.4 test');
  const doc = new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1, 0, 0]);
  const docx = new Uint8Array([0x50, 0x4b, 0x03, 0x04, ...new TextEncoder().encode('....word/document.xml....')]);
  const zip = new Uint8Array([0x50, 0x4b, 0x03, 0x04, ...new TextEncoder().encode('....evil.exe....')]);
  it('расширения', () => {
    expect(extensionOf('cv.PDF')).toBe('pdf');
    expect(extensionOf('cv.docx')).toBe('docx');
    expect(extensionOf('cv.exe')).toBeNull();
    expect(extensionOf('cv.pdf.exe')).toBeNull();
  });
  it('сигнатура должна совпадать с расширением', () => {
    expect(matchesSignature(pdf, 'pdf')).toBe(true);
    expect(matchesSignature(doc, 'doc')).toBe(true);
    expect(matchesSignature(docx, 'docx')).toBe(true);
    expect(matchesSignature(pdf, 'docx')).toBe(false);
    expect(matchesSignature(zip, 'docx')).toBe(false);
    expect(matchesSignature(new TextEncoder().encode('<html>'), 'pdf')).toBe(false);
  });
  it('размер до 10 МБ', () => {
    expect(checkResumeMeta('cv.pdf', 10 * 1024 * 1024)).toBeNull();
    expect(checkResumeMeta('cv.pdf', 10 * 1024 * 1024 + 1)).toBe('Файл больше 10 МБ');
    expect(checkResumeMeta('cv.pdf', 0)).toBe('Файл пустой');
    expect(checkResumeMeta('cv.png', 100)).toBe('Подходят файлы PDF, DOC или DOCX');
  });
});

describe('токен формы', () => {
  beforeAll(() => {
    Object.assign(process.env, { SUPABASE_URL: 'http://x.test', SUPABASE_ANON_KEY: 'a', SUPABASE_SERVICE_ROLE_KEY: 's', APP_SECRET: 'x'.repeat(40) });
  });
  it('слишком быстро, нормально, устарел, подделан', async () => {
    const { checkFormToken, issueFormToken } = await import('@/lib/forms/guard');
    const now = 1_800_000_000_000;
    const token = issueFormToken(now);
    expect(checkFormToken(token, now + 1_000)).toBe(false);
    expect(checkFormToken(token, now + 5_000)).toBe(true);
    expect(checkFormToken(token, now + 25 * 3_600_000)).toBe(false);
    expect(checkFormToken(`${now - 10_000}.${token.split('.')[1]}`, now)).toBe(false);
    expect(checkFormToken(undefined, now)).toBe(false);
  });
});
