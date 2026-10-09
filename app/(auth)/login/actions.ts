'use server';

import { redirect } from 'next/navigation';
import { z } from 'zod';
import { homeFor } from '@/lib/auth/access';
import { loginWithPassword, resendLoginCode, verifyLoginCode } from '@/lib/auth/service';
import { emailSchema, type FormState } from '@/lib/auth/validation';

const loginSchema = z.object({ email: emailSchema, password: z.string().min(1, 'Введите пароль').max(200) });

/** Безопасный адрес возврата: только свои закрытые разделы. */
function safeNext(value: FormDataEntryValue | null, fallback: string): string {
  const v = typeof value === 'string' ? value : '';
  return /^\/(cabinet|admin)(\/[\w\-/]*)?$/.test(v) ? v : fallback;
}

export async function loginAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = loginSchema.safeParse({ email: formData.get('email'), password: formData.get('password') });
  // Ошибки формата не уточняем: тот же ответ, что и для неверного пароля.
  if (!parsed.success) return { status: 'error', message: 'Неверная почта или пароль.' };

  const result = await loginWithPassword(parsed.data.email, parsed.data.password);
  switch (result.kind) {
    case 'locked':
      return { status: 'error', message: 'Слишком много попыток входа. Попробуйте через 15 минут.' };
    case 'invalid':
      return { status: 'error', message: 'Неверная почта или пароль.' };
    case 'code_required':
      redirect('/login/code');
    case 'ok': {
      const home = homeFor(result.role);
      const next = safeNext(formData.get('next'), home);
      redirect(result.role === 'client' && next.startsWith('/admin') ? home : next);
    }
  }
}

const codeSchema = z.object({ code: z.string().trim().regex(/^\d{6}$/, 'Код — 6 цифр из письма') });

export async function verifyCodeAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = codeSchema.safeParse({ code: formData.get('code') });
  if (!parsed.success) return { status: 'error', fieldErrors: { code: parsed.error.issues[0].message } };
  const result = await verifyLoginCode(parsed.data.code);
  if (result.kind === 'expired') redirect('/login?reason=code_expired');
  if (result.kind === 'invalid') {
    return { status: 'error', fieldErrors: { code: `Неверный код. Осталось попыток: ${result.attemptsLeft}.` } };
  }
  redirect('/admin');
}

export async function resendCodeAction(_prev: FormState): Promise<FormState> {
  const result = await resendLoginCode();
  if (result === 'expired') redirect('/login?reason=code_expired');
  if (result === 'limited') return { status: 'error', message: 'Код можно запросить не чаще трёх раз за 10 минут.' };
  return { status: 'success', message: 'Новый код отправлен на почту.' };
}
