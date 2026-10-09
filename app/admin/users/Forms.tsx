'use client';

import { useActionState, useState } from 'react';
import { Alert } from '@/components/ui/Alert';
import { SubmitButton } from '@/components/ui/Button';
import { Field } from '@/components/ui/Field';
import { initialFormState } from '@/lib/auth/validation';
import { createCompanyAction, inviteAction } from './actions';

const select = 'h-12 rounded-md border border-line-strong bg-white px-4 text-base focus:border-blue';

export function CompanyForm() {
  const [state, action] = useActionState(createCompanyAction, initialFormState);
  return (
    <form action={action} className="grid gap-4 sm:grid-cols-2" noValidate>
      <div className="sm:col-span-2">{state.message && <Alert tone={state.status === 'error' ? 'error' : 'success'}>{state.message}</Alert>}</div>
      <Field label="Название" name="name" required error={state.fieldErrors?.name} />
      <Field label="Контактное лицо" name="contact_name" error={state.fieldErrors?.contact_name} />
      <Field label="Почта контакта" name="contact_email" type="email" error={state.fieldErrors?.contact_email} />
      <Field label="Телефон контакта" name="contact_phone" type="tel" error={state.fieldErrors?.contact_phone} />
      <div className="sm:col-span-2">
        <SubmitButton pendingText="Создаём…">Создать компанию</SubmitButton>
      </div>
    </form>
  );
}

export function InviteForm({ companies }: { companies: { id: string; name: string }[] }) {
  const [state, action] = useActionState(inviteAction, initialFormState);
  const [role, setRole] = useState('client');
  return (
    <form action={action} className="grid gap-4 sm:grid-cols-2" noValidate>
      <div className="sm:col-span-2">{state.message && <Alert tone={state.status === 'error' ? 'error' : 'success'}>{state.message}</Alert>}</div>
      <Field label="Почта" name="email" type="email" required error={state.fieldErrors?.email} />
      <Field label="Имя" name="full_name" error={state.fieldErrors?.full_name} />
      <div className="flex flex-col gap-1.5">
        <label htmlFor="f-role" className="text-sm font-semibold">Роль</label>
        <select id="f-role" name="role" className={select} value={role} onChange={(e) => setRole(e.target.value)}>
          <option value="client">Клиент</option>
          <option value="manager">Менеджер</option>
          <option value="admin">Администратор</option>
        </select>
      </div>
      {role === 'client' && (
        <div className="flex flex-col gap-1.5">
          <label htmlFor="f-company" className="text-sm font-semibold">Компания</label>
          <select
            id="f-company"
            name="company_id"
            className={select}
            defaultValue=""
            aria-invalid={state.fieldErrors?.company_id ? true : undefined}
            aria-describedby={state.fieldErrors?.company_id ? 'f-company-error' : undefined}
          >
            <option value="" disabled>Выберите компанию</option>
            {companies.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
          {state.fieldErrors?.company_id && <p id="f-company-error" className="text-sm font-medium text-danger">{state.fieldErrors.company_id}</p>}
        </div>
      )}
      {role === 'client' && (
        <label className="flex items-center gap-3 text-sm sm:col-span-2">
          <input type="checkbox" name="is_company_lead" className="h-5 w-5 accent-[var(--c-blue)]" defaultChecked />
          Руководитель клиента (может приглашать коллег)
        </label>
      )}
      <div className="sm:col-span-2">
        <SubmitButton pendingText="Отправляем…">Отправить приглашение</SubmitButton>
      </div>
    </form>
  );
}
