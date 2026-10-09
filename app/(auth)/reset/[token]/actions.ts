'use server';

import { redirect } from 'next/navigation';
import { findValidResetToken, resetPassword } from '@/lib/auth/service';
import { fieldErrors, newPasswordSchema, type FormState } from '@/lib/auth/validation';

export async function resetAction(token: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const found = await findValidResetToken(token);
  if (!found) return { status: 'error', message: 'Ссылка недействительна или устарела. Запросите новую.' };
  const parsed = newPasswordSchema(found.email).safeParse({ password: formData.get('password'), confirm: formData.get('confirm') });
  if (!parsed.success) return { status: 'error', fieldErrors: fieldErrors(parsed.error) };
  const result = await resetPassword(token, parsed.data.password);
  if (result === 'invalid') return { status: 'error', message: 'Ссылка недействительна или устарела. Запросите новую.' };
  if (result === 'error') return { status: 'error', message: 'Не удалось сменить пароль. Попробуйте другой пароль или повторите позже.' };
  redirect('/login?reason=reset');
}
