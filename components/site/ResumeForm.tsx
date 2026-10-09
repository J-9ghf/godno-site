'use client';

import Link from 'next/link';
import { useRef, useState } from 'react';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Field } from '@/components/ui/Field';
import { ConsentField, SelectField } from '@/components/ui/FormControls';
import { candidatesBlock } from '@/content/landing';
import { finalizeResumeAction, prepareResumeAction } from '@/lib/forms/actions';
import { checkResumeMeta } from '@/lib/forms/file';
import { FormProtection } from './FormProtection';
import type { FormProps } from './LeadForm';

type Phase = 'idle' | 'checking' | 'uploading' | 'saving' | 'done';
const phaseText: Record<Phase, string> = {
  idle: 'Отправить резюме',
  checking: 'Проверяем…',
  uploading: 'Загружаем файл…',
  saving: 'Сохраняем…',
  done: 'Отправлено',
};

/**
 * Форма резюме. Файл уходит напрямую в закрытое хранилище по одноразовой ссылке
 * (сервер приложения не принимает тело больше нескольких мегабайт), затем сервер проверяет его содержимое.
 */
export function ResumeForm({ token, captchaKey, positions, testMode }: FormProps & { testMode: boolean }) {
  const formRef = useRef<HTMLFormElement>(null);
  const [phase, setPhase] = useState<Phase>('idle');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<string>();

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrors({});
    setMessage(undefined);
    const form = event.currentTarget;
    const data = new FormData(form);
    const file = data.get('file');
    data.delete('file');
    if (!(file instanceof File) || !file.name) {
      setErrors({ file: 'Прикрепите файл резюме' });
      return;
    }
    const fileError = checkResumeMeta(file.name, file.size);
    if (fileError) {
      setErrors({ file: fileError });
      return;
    }
    data.set('file_name', file.name);
    data.set('file_size', String(file.size));

    try {
      setPhase('checking');
      const prepared = await prepareResumeAction(data);
      if (prepared.status === 'success') return setPhase('done');
      if (!prepared.upload) {
        setErrors(prepared.fieldErrors ?? {});
        setMessage(prepared.message);
        return setPhase('idle');
      }

      setPhase('uploading');
      const body = new FormData();
      body.append('cacheControl', '3600');
      body.append('', new File([file], file.name, { type: prepared.upload.contentType }));
      const uploaded = await fetch(prepared.upload.url, { method: 'PUT', body, headers: { 'x-upsert': 'false' } });
      if (!uploaded.ok) {
        setErrors({ file: 'Файл не загрузился. Проверьте формат и размер и попробуйте ещё раз.' });
        return setPhase('idle');
      }

      setPhase('saving');
      data.set('ticket', prepared.upload.ticket);
      const result = await finalizeResumeAction(data);
      if (result.status === 'success') return setPhase('done');
      setErrors(result.fieldErrors ?? {});
      setMessage(result.message);
      setPhase('idle');
    } catch {
      setMessage('Не удалось отправить. Проверьте соединение и попробуйте ещё раз.');
      setPhase('idle');
    }
  }

  if (phase === 'done') {
    return (
      <div role="status" className="rounded-lg bg-white p-8 text-2xl font-bold">
        {candidatesBlock.thanks}
      </div>
    );
  }

  const busy = phase !== 'idle';
  return (
    <form ref={formRef} onSubmit={onSubmit} noValidate aria-label="Отправить резюме" className="relative grid grid-cols-1 gap-5 rounded-lg bg-white p-6 sm:grid-cols-2 sm:p-8">
      {testMode && (
        <div className="sm:col-span-2">
          <Alert tone="info">{candidatesBlock.testMode}</Alert>
        </div>
      )}
      {message && <div className="sm:col-span-2"><Alert tone="error">{message}</Alert></div>}
      <Field label="Имя" name="name" autoComplete="name" required error={errors.name} id="cv-name" />
      <Field label="Телефон или Telegram" name="contact" autoComplete="tel" required error={errors.contact} id="cv-contact" hint="Например, +7 900 000-00-00 или @name" />
      <Field label="Город" name="city" autoComplete="address-level2" required error={errors.city} id="cv-city" />
      <SelectField label="Направление" name="position" required placeholder="Выберите направление" options={positions.map((p) => ({ value: p.code, label: p.label }))} error={errors.position} id="cv-position" />
      <div className="flex flex-col gap-1.5 sm:col-span-2">
        <label htmlFor="cv-file" className="text-sm font-semibold">Файл резюме</label>
        <input
          id="cv-file"
          name="file"
          type="file"
          required
          accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          aria-invalid={errors.file ? true : undefined}
          aria-describedby={`cv-file-hint${errors.file ? ' cv-file-error' : ''}`}
          className="w-full min-w-0 rounded-md border border-line-strong bg-white p-3 text-base file:mr-4 file:rounded-sm file:border-0 file:bg-blue-light file:px-4 file:py-2 file:font-semibold file:text-blue"
        />
        <p id="cv-file-hint" className="text-sm text-ink-3">PDF, DOC или DOCX, до 10 МБ.</p>
        {errors.file && <p id="cv-file-error" className="text-sm font-medium text-danger">{errors.file}</p>}
      </div>
      <div className="sm:col-span-2">
        <Field label="Ссылка на видео-визитку (необязательно)" name="video_url" type="url" inputMode="url" placeholder="https://" error={errors.video_url} id="cv-video" />
      </div>
      <div className="sm:col-span-2">
        <ConsentField name="consent" id="cv-consent" error={errors.consent}>
          {candidatesBlock.consent} (
          <Link href="/consent-resume" className="font-semibold text-blue underline underline-offset-2" target="_blank">текст согласия</Link>,{' '}
          <Link href="/privacy" className="font-semibold text-blue underline underline-offset-2" target="_blank">политика конфиденциальности</Link>)
        </ConsentField>
      </div>
      <div className="sm:col-span-2">
        <FormProtection formId="cv" token={token} captchaKey={captchaKey} />
      </div>
      <div className="sm:col-span-2">
        <Button type="submit" disabled={busy} aria-busy={busy || undefined}>
          {phaseText[phase]}
        </Button>
        <p className="sr-only" aria-live="polite">{busy ? phaseText[phase] : ''}</p>
      </div>
    </form>
  );
}
