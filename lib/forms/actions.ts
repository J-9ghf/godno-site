'use server';

import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { env } from '@/lib/env';
import { requestMeta } from '@/lib/auth/request-meta';
import type { FormState } from '@/lib/auth/validation';
import { fieldErrors } from '@/lib/auth/validation';
import { notifyTeam } from '@/lib/notify/telegram';
import { createUploadUrl, moveObject, readObject, removeObject } from '@/lib/storage';
import { adminClient } from '@/lib/supabase/admin';
import { isValidVideoUrl, parseContact } from './contact';
import { RESUME_MAX_BYTES, checkResumeMeta, extensionOf, matchesSignature } from './file';
import { checkFormToken, honeypotTripped, rateLimited, sign, verifyCaptcha, verifySignature } from './guard';
import { getPositions } from './positions';

const STALE = 'Форма устарела. Обновите страницу и отправьте ещё раз.';
const CAPTCHA = 'Подтвердите, что вы не робот.';
const LIMIT = 'Слишком много отправок. Попробуйте позже или напишите нам в Telegram.';
const FAILED = 'Не удалось отправить. Попробуйте ещё раз или напишите нам в Telegram.';

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Не больше ${max} символов`)
    .optional()
    .transform((v) => v || null);

async function positionField() {
  const codes = (await getPositions()).map((p) => p.code);
  return z
    .string()
    .optional()
    .transform((v) => v || null)
    .refine((v) => v === null || codes.includes(v), 'Выберите из списка');
}

const contactField = z
  .string({ message: 'Укажите телефон или Telegram' })
  .trim()
  .min(1, 'Укажите телефон или Telegram')
  .transform((v, ctx) => {
    const c = parseContact(v);
    if (!c) {
      ctx.addIssue({ code: 'custom', message: 'Телефон (не меньше 10 цифр) или ник в Telegram, например @name' });
      return z.NEVER;
    }
    return c;
  });

const consentField = z.literal('on', { message: 'Без согласия отправить нельзя' });

/** Общие проверки формы до разбора полей: ловушка, токен, капча, лимит. */
async function guard(formData: FormData, kind: 'lead' | 'resume'): Promise<FormState | 'bot' | null> {
  if (honeypotTripped(formData)) return 'bot';
  if (!checkFormToken(formData.get('form_token'))) return { status: 'error', message: STALE };
  const { ip } = await requestMeta();
  if (!(await verifyCaptcha(formData.get('smart-token'), ip))) return { status: 'error', message: CAPTCHA };
  if (await rateLimited(`${kind}:ip:${ip ?? 'unknown'}`, 5, 3600)) return { status: 'error', message: LIMIT };
  return null;
}

// ───────────────────────── Заявка работодателя ─────────────────────────

export async function submitLeadAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const blocked = await guard(formData, 'lead');
  // Боту отвечаем «успехом», чтобы он не подбирал обход.
  if (blocked === 'bot') return { status: 'success' };
  if (blocked) return blocked;

  const schema = z.object({
    name: z.string({ message: 'Укажите имя' }).trim().min(2, 'Укажите имя').max(120, 'Слишком длинное имя'),
    contact: contactField,
    company: optionalText(200),
    position: await positionField(),
    requirements: optionalText(3000),
    budget: optionalText(200),
    consent: consentField,
  });
  const parsed = schema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { status: 'error', fieldErrors: fieldErrors(parsed.error) };
  const v = parsed.data;
  const positions = await getPositions();
  const positionLabel = positions.find((p) => p.code === v.position)?.label ?? null;

  const { error } = await adminClient()
    .from('requests')
    .insert({
      company_id: null,
      title: positionLabel ?? '',
      position_code: v.position,
      requirements: v.requirements,
      budget: v.budget,
      status: 'new',
      source: 'site',
      contact_name: v.name,
      contact_phone: v.contact.phone ?? v.contact.telegram,
      contact_company: v.company,
      consent_at: new Date().toISOString(),
    });
  if (error) {
    console.error('[lead] insert', error.message);
    return { status: 'error', message: FAILED };
  }

  await notifyTeam(`Новая заявка с сайта${positionLabel ? `: ${positionLabel}` : ''}\nОткрыть: ${env().APP_URL}/admin`);
  return { status: 'success' };
}

// ───────────────────────── Резюме кандидата ─────────────────────────

async function resumeSchema() {
  return z.object({
    name: z.string({ message: 'Укажите имя' }).trim().min(2, 'Укажите имя').max(120, 'Слишком длинное имя'),
    contact: contactField,
    city: z.string({ message: 'Укажите город' }).trim().min(2, 'Укажите город').max(100),
    position: (await positionField()).refine((v) => v !== null, 'Выберите направление'),
    video_url: z
      .string()
      .trim()
      .optional()
      .transform((v) => v || '')
      .refine(isValidVideoUrl, 'Ссылка должна начинаться с https://'),
    consent: consentField,
  });
}

export type PrepareResult = FormState & { upload?: { url: string; ticket: string; contentType: string } };

/** Шаг 1: проверить поля, капчу и лимит, выдать одноразовую ссылку для загрузки файла. */
export async function prepareResumeAction(formData: FormData): Promise<PrepareResult> {
  const blocked = await guard(formData, 'resume');
  if (blocked === 'bot') return { status: 'success' };
  if (blocked) return blocked;

  const parsed = (await resumeSchema()).safeParse(Object.fromEntries(formData));
  const fileName = String(formData.get('file_name') ?? '');
  const fileError = checkResumeMeta(fileName, Number(formData.get('file_size') ?? 0));
  if (!parsed.success || fileError) {
    return {
      status: 'error',
      fieldErrors: { ...(parsed.success ? {} : fieldErrors(parsed.error)), ...(fileError ? { file: fileError } : {}) },
    };
  }

  const ext = extensionOf(fileName)!;
  const key = `pending/${randomUUID()}.${ext}`;
  const { url } = await createUploadUrl('resumes', key);
  const payload = Buffer.from(JSON.stringify({ key, exp: Date.now() + 30 * 60_000 })).toString('base64url');
  const { RESUME_TYPES } = await import('./file');
  return { status: 'idle', upload: { url, ticket: `${payload}.${sign(`resume:${payload}`)}`, contentType: RESUME_TYPES[ext] } };
}

/** Шаг 2: файл уже в хранилище — проверить содержимое, перенести в постоянную папку, записать кандидата. */
export async function finalizeResumeAction(formData: FormData): Promise<FormState> {
  const [payload, signature] = String(formData.get('ticket') ?? '').split('.');
  if (!payload || !signature || !verifySignature(`resume:${payload}`, signature)) return { status: 'error', message: STALE };
  const { key, exp } = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as { key: string; exp: number };
  if (Date.now() > exp || !/^pending\/[0-9a-f-]{36}\.(pdf|docx?)$/.test(key)) return { status: 'error', message: STALE };

  const parsed = (await resumeSchema()).safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { status: 'error', fieldErrors: fieldErrors(parsed.error) };
  const v = parsed.data;

  const bytes = await readObject('resumes', key);
  if (!bytes) return { status: 'error', fieldErrors: { file: 'Файл не загрузился. Попробуйте ещё раз.' } };
  const ext = extensionOf(key)!;
  if (bytes.length > RESUME_MAX_BYTES || !matchesSignature(bytes, ext)) {
    await removeObject('resumes', key);
    return { status: 'error', fieldErrors: { file: 'Файл повреждён или это не PDF, DOC или DOCX' } };
  }

  const month = new Date().toISOString().slice(0, 7);
  const finalKey = key.replace(/^pending\//, `site/${month}/`);
  if (!(await moveObject('resumes', key, finalKey))) return { status: 'error', message: FAILED };

  const { data, error } = await adminClient()
    .rpc('submit_site_resume', {
      p_full_name: v.name,
      p_phone: v.contact.phone,
      p_telegram: v.contact.telegram,
      p_email: null,
      p_city: v.city,
      p_position_code: v.position,
      p_resume_path: finalKey,
      p_video_url: v.video_url || null,
      p_consent_version: env().RESUME_FORM_MODE === 'test' ? 'test-mode' : 'resume-consent-v1',
    })
    .single<{ candidate_id: string; merged: boolean }>();
  if (error || !data) {
    console.error('[resume] submit', error?.message);
    await removeObject('resumes', finalKey);
    return { status: 'error', message: FAILED };
  }

  const label = (await getPositions()).find((p) => p.code === v.position)?.label;
  await notifyTeam(
    `${data.merged ? 'Повторное резюме' : 'Новое резюме'} с сайта: ${label}, ${v.city}\nОткрыть: ${env().APP_URL}/admin`,
  );
  return { status: 'success' };
}
