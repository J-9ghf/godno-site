'use client';

import Link from 'next/link';
import { useActionState } from 'react';
import { Alert } from '@/components/ui/Alert';
import { SubmitButton } from '@/components/ui/Button';
import { Field } from '@/components/ui/Field';
import { initialFormState } from '@/lib/auth/validation';
import { loginAction } from './actions';

export function LoginForm({ next }: { next?: string }) {
  const [state, action] = useActionState(loginAction, initialFormState);
  return (
    <form action={action} className="flex flex-col gap-5" noValidate>
      {state.status === 'error' && state.message && <Alert tone="error">{state.message}</Alert>}
      <input type="hidden" name="next" value={next ?? ''} />
      <Field label="Почта" name="email" type="email" autoComplete="username" required autoFocus />
      <Field label="Пароль" name="password" type="password" autoComplete="current-password" required />
      <SubmitButton pendingText="Входим…">Войти</SubmitButton>
      <Link href="/forgot" className="self-start text-sm font-semibold text-blue underline-offset-4 hover:underline">
        Забыли пароль?
      </Link>
    </form>
  );
}
