'use client';

import { useActionState } from 'react';
import { PasswordFields } from '@/components/PasswordFields';
import { Alert } from '@/components/ui/Alert';
import { SubmitButton } from '@/components/ui/Button';
import { initialFormState } from '@/lib/auth/validation';
import { resetAction } from './actions';

export function ResetForm({ token }: { token: string }) {
  const [state, action] = useActionState(resetAction.bind(null, token), initialFormState);
  return (
    <form action={action} className="flex flex-col gap-5" noValidate>
      {state.message && <Alert tone="error">{state.message}</Alert>}
      <PasswordFields errors={state.fieldErrors} />
      <SubmitButton pendingText="Сохраняем…">Сохранить пароль</SubmitButton>
    </form>
  );
}
