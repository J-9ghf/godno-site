'use client';

import { useActionState } from 'react';
import { Alert } from '@/components/ui/Alert';
import { SubmitButton } from '@/components/ui/Button';
import { Field } from '@/components/ui/Field';
import { initialFormState } from '@/lib/auth/validation';
import { forgotAction } from './actions';

export function ForgotForm() {
  const [state, action] = useActionState(forgotAction, initialFormState);
  if (state.status === 'success') return <Alert tone="success">{state.message}</Alert>;
  return (
    <form action={action} className="flex flex-col gap-5" noValidate>
      {state.message && <Alert tone="error">{state.message}</Alert>}
      <Field label="Почта" name="email" type="email" autoComplete="email" required autoFocus error={state.fieldErrors?.email} />
      <SubmitButton>Отправить ссылку</SubmitButton>
    </form>
  );
}
