'use server';

import { redirect } from 'next/navigation';
import { z } from 'zod';
import { homeFor } from '@/lib/auth/access';
import { acceptInvitation, findValidInvitation, loginWithPassword } from '@/lib/auth/service';
import { fieldErrors, newPasswordSchema, type FormState } from '@/lib/auth/validation';

const nameSchema = z.string().trim().min(2, 'Укажите имя').max(120, 'Слишком длинное имя');

export async function acceptAction(token: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const invitation = await findValidInvitation(token);
  if (!invitation) return { status: 'error', message: 'Ссылка недействительна или устарела. Попросите менеджера отправить новое приглашение.' };

  const name = nameSchema.safeParse(formData.get('full_name'));
  const passwords = newPasswordSchema(invitation.email).safeParse({ password: formData.get('password'), confirm: formData.get('confirm') });
  if (!name.success || !passwords.success) {
    return {
      status: 'error',
      fieldErrors: {
        ...(name.success ? {} : { full_name: name.error.issues[0].message }),
        ...(passwords.success ? {} : fieldErrors(passwords.error)),
      },
    };
  }

  const result = await acceptInvitation(token, name.data, passwords.data.password);
  if (result.kind === 'invalid') return { status: 'error', message: 'Ссылка недействительна или устарела. Попросите менеджера отправить новое приглашение.' };
  if (result.kind === 'error') return { status: 'error', message: result.message };

  // Сразу входим тем же паролем. Админу нужен ещё код с почты — это сделает обычный вход.
  const login = await loginWithPassword(invitation.email, passwords.data.password);
  if (login.kind === 'ok') redirect(homeFor(login.role));
  if (login.kind === 'code_required') redirect('/login/code');
  redirect('/login?reason=invited');
}
