'use server';

import { z } from 'zod';
import { requestPasswordReset } from '@/lib/auth/service';
import { emailSchema, type FormState } from '@/lib/auth/validation';

export async function forgotAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = z.object({ email: emailSchema }).safeParse({ email: formData.get('email') });
  if (!parsed.success) return { status: 'error', fieldErrors: { email: parsed.error.issues[0].message } };
  const result = await requestPasswordReset(parsed.data.email);
  if (result === 'limited') return { status: 'error', message: 'Слишком много запросов. Попробуйте через 15 минут.' };
  // Одинаковый ответ для любой почты: страница не сообщает, есть ли такой пользователь.
  return { status: 'success', message: 'Если этот адрес есть в системе, мы отправили на него ссылку для смены пароля. Она действует 1 час.' };
}
