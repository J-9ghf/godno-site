// Секреты и выгрузки не попадают в Git: проверка отслеживаемых файлов всего репозитория (сайт и платформа).
// Тот же поиск можно запустить вручную перед коммитом: npx vitest run tests/repo-hygiene.test.ts
import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = execFileSync('git', ['rev-parse', '--show-toplevel']).toString().trim();
const git = (...args: string[]): string => { try { return execFileSync('git', ['-C', root, ...args], { maxBuffer: 64 << 20 }).toString(); } catch (e: any) { return e.stdout?.toString() ?? ''; } };

// Значение после «=» считается секретом, если оно не пустое и не заглушка
const PATTERNS: [string, RegExp][] = [
  ['ключ сессий', /BETTER_AUTH_SECRETS?\s*[=:]\s*['"]?[A-Za-z0-9+/:=_-]{16,}/],
  ['пароль почты', /SMTP_PASSWORD\s*=\s*\S+/],
  ['ключ хранилища', /S3_SECRET_ACCESS_KEY\s*=\s*\S+/],
  ['пароль в адресе базы', /postgres(ql)?:\/\/[^:\s/]+:(?!ПАРОЛЬ@|postgres@|\$\{)[^@\s'"]{6,}@(?!127\.0\.0\.1|localhost)/],
  ['закрытый ключ', /-----BEGIN [A-Z ]*PRIVATE KEY-----/],
  ['ключ AWS', /AKIA[0-9A-Z]{16}/],
  ['ключ Yandex Cloud', /\bYC[A-Za-z0-9_-]{38,}\b|\bt1\.[A-Za-z0-9_-]{60,}/],
  ['токен GitHub', /\bgh[pousr]_[A-Za-z0-9]{36,}\b/],
  ['токен Telegram-бота', /\b\d{8,10}:AA[A-Za-z0-9_-]{33}\b/],
];

describe('гигиена репозитория', () => {
  it('файлы окружения, ключи и выгрузки базы не отслеживаются', () => {
    const files = git('ls-files').split('\n').filter(Boolean);
    const bad = files.filter((f) => /(^|\/)\.env($|\.(?!example$))|\.(pem|key|p12|pfx|dump|sql\.gz|bak)$|(^|\/)(\.dev|\.data|backups)\//.test(f));
    expect(bad).toEqual([]);
    expect(git('check-ignore', 'platform/.env', '.env', 'platform/.dev/x', 'platform/.data/x').split('\n').filter(Boolean)).toHaveLength(4);
  });

  const scan = (name: string, text: string) => {
    const found: string[] = [];
    text.split('\n').forEach((line, i) => { for (const [what, re] of PATTERNS) if (re.test(line)) found.push(`${what}: ${name}:${i + 1}`); });
    return found;
  };

  it('сканер находит образцы секретов (проверка самой проверки)', () => {
    const fake = ['BETTER_AUTH_SECRET=' + 'q'.repeat(40), 'SMTP_PASSWORD=x' + 'y', 'postgres://ikr_app:' + 'Very$ecret1@db.internal:5432/ikr', '-----BEGIN ' + 'PRIVATE KEY-----', 'AKIA' + 'ABCDEFGHIJKLMNOP'];
    expect(scan('образец', fake.join('\n'))).toHaveLength(fake.length);
    expect(scan('заглушки', 'BETTER_AUTH_SECRET=\nDATABASE_URL=postgres://ikr_app:ПАРОЛЬ@127.0.0.1:54329/ikr\nSMTP_PASSWORD=')).toEqual([]);
  });

  it('в отслеживаемых файлах нет секретов', () => {
    const files = git('ls-files').split('\n').filter((f) => f && f !== 'platform/tests/repo-hygiene.test.ts' && !/(^|\/)package-lock\.json$|\.(png|jpe?g|webp|gif|woff2?|ico|pdf|docx)$/.test(f));
    expect(files.length).toBeGreaterThan(100);
    const found = files.flatMap((f) => scan(f, readFileSync(join(root, f), 'utf8')));
    expect(found).toEqual([]);
  });
});
