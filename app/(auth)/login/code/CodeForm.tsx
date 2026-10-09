'use client';

import { useActionState } from 'react';
import { Alert } from '@/components/ui/Alert';
import { SubmitButton } from '@/components/ui/Button';
import { Field } from '@/components/ui/Field';
import { initialFormState } from '@/lib/auth/validation';
import { resendCodeAction, verifyCodeAction } from '../actions';

export function CodeForm() {
  const [state, action] = useActionState(verifyCodeAction, initialFormState);
  const [resend, resendAction] = useActionState(resendCodeAction, initialFormState);
  return (
    <div className="flex flex-col gap-5">
      <form action={action} className="flex flex-col gap-5" noValidate>
        <Field
          label="Код из письма"
          name="code"
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="\d{6}"
          maxLength={6}
          required
          autoFocus
          error={state.fieldErrors?.code}
        />
        <SubmitButton pendingText="Проверяем…">Подтвердить</SubmitButton>
      </form>
      <form action={resendAction}>
        <SubmitButton variant="link" pendingText="Отправляем…">
          Отправить код ещё раз
        </SubmitButton>
      </form>
      {resend.message && <Alert tone={resend.status === 'error' ? 'error' : 'success'}>{resend.message}</Alert>}
    </div>
  );
}
