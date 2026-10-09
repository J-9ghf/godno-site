'use client';

import Link from 'next/link';
import { useActionState } from 'react';
import { Alert } from '@/components/ui/Alert';
import { SubmitButton } from '@/components/ui/Button';
import { Field } from '@/components/ui/Field';
import { ConsentField, SelectField, TextareaField } from '@/components/ui/FormControls';
import { leadBlock } from '@/content/landing';
import { initialFormState } from '@/lib/auth/validation';
import { submitLeadAction } from '@/lib/forms/actions';
import { FormProtection } from './FormProtection';

export interface FormProps {
  token: string;
  captchaKey?: string;
  positions: { code: string; label: string }[];
}

export function LeadForm({ token, captchaKey, positions }: FormProps) {
  const [state, action] = useActionState(submitLeadAction, initialFormState);
  if (state.status === 'success') {
    return (
      <div role="status" className="rounded-lg bg-white p-8 text-2xl font-bold">
        {leadBlock.thanks}
      </div>
    );
  }
  const e = state.fieldErrors ?? {};
  return (
    <form action={action} noValidate className="relative grid grid-cols-1 gap-5 rounded-lg bg-white p-6 sm:grid-cols-2 sm:p-8" aria-label="Заявка работодателя">
      {state.message && <div className="sm:col-span-2"><Alert tone="error">{state.message}</Alert></div>}
      <Field label="Имя" name="name" autoComplete="name" required error={e.name} id="lead-name" />
      <Field label="Телефон или Telegram" name="contact" autoComplete="tel" required error={e.contact} id="lead-contact" hint="Например, +7 900 000-00-00 или @name" />
      <Field label="Компания (необязательно)" name="company" autoComplete="organization" error={e.company} id="lead-company" />
      <SelectField label="Кого ищете (необязательно)" name="position" placeholder="Выберите" options={positions.map((p) => ({ value: p.code, label: p.label }))} error={e.position} id="lead-position" />
      <div className="sm:col-span-2">
        <TextareaField label="Что уже пробовали и какие требования (необязательно)" name="requirements" maxLength={3000} error={e.requirements} id="lead-requirements" />
      </div>
      <Field label="Ориентир по бюджету (необязательно)" name="budget" error={e.budget} id="lead-budget" />
      <div className="sm:col-span-2">
        <ConsentField name="consent" id="lead-consent" error={e.consent}>
          {leadBlock.consent} в соответствии с{' '}
          <Link href="/privacy" className="font-semibold text-blue underline underline-offset-2" target="_blank">политикой конфиденциальности</Link> и{' '}
          <Link href="/consent" className="font-semibold text-blue underline underline-offset-2" target="_blank">согласием</Link>
        </ConsentField>
      </div>
      <div className="sm:col-span-2">
        <FormProtection formId="lead" token={token} captchaKey={captchaKey} />
      </div>
      <div className="sm:col-span-2">
        <SubmitButton pendingText="Отправляем…">Оставить заявку</SubmitButton>
      </div>
    </form>
  );
}
