import { describe, expect, it } from 'vitest';
import { randomCode, randomToken, safeEqualHex, sessionIdFromJwt, sha256 } from '@/lib/auth/crypto';
import { emailSchema, newPasswordSchema } from '@/lib/auth/validation';
import { sessionExpired } from '@/lib/session-config';

describe('автовыход', () => {
  const now = 1_800_000_000_000;
  it('активная сессия не истекает', () => {
    expect(sessionExpired(String(now - 29 * 60_000), String(now - 60 * 60_000), now)).toBe(false);
  });
  it('30 минут бездействия — выход', () => {
    expect(sessionExpired(String(now - 31 * 60_000), String(now - 60 * 60_000), now)).toBe(true);
  });
  it('общая длительность больше 12 часов — выход', () => {
    expect(sessionExpired(String(now - 60_000), String(now - 13 * 3_600_000), now)).toBe(true);
  });
  it('нет отметок или мусор в cookie — выход', () => {
    expect(sessionExpired(undefined, undefined, now)).toBe(true);
    expect(sessionExpired('abc', String(now), now)).toBe(true);
  });
});

describe('пароль', () => {
  it('короче 10 символов — ошибка', () => {
    expect(newPasswordSchema().safeParse({ password: '123456789', confirm: '123456789' }).success).toBe(false);
  });
  it('10 символов и совпадает с повтором — ок', () => {
    expect(newPasswordSchema().safeParse({ password: '1234567890', confirm: '1234567890' }).success).toBe(true);
  });
  it('не совпадает с повтором — ошибка', () => {
    expect(newPasswordSchema().safeParse({ password: '1234567890', confirm: '1234567891' }).success).toBe(false);
  });
  it('совпадает с почтой — ошибка', () => {
    const email = 'long.name@example.com';
    expect(newPasswordSchema(email).safeParse({ password: email, confirm: email }).success).toBe(false);
  });
  it('почта приводится к нижнему регистру', () => {
    expect(emailSchema.parse('  Anna@Example.COM ')).toBe('anna@example.com');
  });
});

describe('токены', () => {
  it('ссылка — 256 бит base64url, коды — 6 цифр', () => {
    expect(randomToken()).toMatch(/^[A-Za-z0-9_-]{43}$/);
    for (let i = 0; i < 50; i++) expect(randomCode()).toMatch(/^\d{6}$/);
  });
  it('сравнение хешей', () => {
    expect(safeEqualHex(sha256('123456'), sha256('123456'))).toBe(true);
    expect(safeEqualHex(sha256('123456'), sha256('654321'))).toBe(false);
  });
  it('session_id из JWT', () => {
    const payload = Buffer.from(JSON.stringify({ sub: 'u', session_id: 'abc-123' })).toString('base64url');
    expect(sessionIdFromJwt(`x.${payload}.y`)).toBe('abc-123');
    expect(sessionIdFromJwt('мусор')).toBeNull();
  });
});
