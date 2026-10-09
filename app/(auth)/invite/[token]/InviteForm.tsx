'use client';

import { useActionState } from 'react';
import { PasswordFields } from '@/components/PasswordFields';
import { Alert } from '@/components/ui/Alert';
import { SubmitButton } from '@/components/ui/Button';
import { Field } from '@/components/ui/Field';
import { initialFormState } from '@/lib/auth/validation';
import { acceptAction } from './actions';

export function InviteForm({ token, email, fullName }: { token: string; email: string; fullName: string }) {
  const [state, action] = useActionState(acceptAction.bind(null, token), initialFormState);
  return (
    <form action={action} className="flex flex-col gap-5" noValidate>
      {state.message && <Alert tone="error">{state.message}</Alert>}
      <Field label="Почта" name="email_display" type="email" value={email} readOnly autoComplete="username" />
      <Field label="Ваше имя" name="full_name" defaultValue={fullName} autoComplete="name" required error={state.fieldErrors?.full_name} />
      <PasswordFields errors={state.fieldErrors} />
      <SubmitButton pendingText="Сохраняем…">Задать пароль и войти</SubmitButton>
    </form>
  );
}
