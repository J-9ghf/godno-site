// Операции администратора. Все запросы идут под ролью приложения с app.user_id: база дополнительно
// проверяет, что пользователь — действующий администратор (политики RLS в 0003_access.sql).
import { z } from 'zod';
import { withUser, type Db } from '../db';
import { audit } from '../audit';
import { badRequest, conflict, notFound } from '../errors';
import { adminStageError, CLIENT_DECISIONS, STAGES, type Stage } from '../stages';
import { env } from '../env';

const text = (max: number) => z.string().trim().max(max);
const optText = (max: number) => text(max).optional().nullable().transform((v) => (v ? v : null));

// ---------- Компании ----------
export const companyInput = z.object({
  name: text(200).min(2, 'Укажите название'),
  sphere: optText(200), city: optText(100), contact_name: optText(200),
  phone: optText(50), email: z.email('Проверьте почту').optional().nullable().or(z.literal('')).transform((v) => v || null),
  status: z.enum(['active', 'paused', 'archived']).default('active'),
});

export const listCompanies = (actor: string) => withUser(actor, async (db) => (await db.query(
  `select c.*, (select count(*) from vacancies v where v.company_id = c.id and v.status not in ('closed','cancelled','paused'))::int as active_vacancies,
          (select count(*) from company_members m where m.company_id = c.id and m.revoked_at is null)::int as users
     from companies c order by c.name`)).rows);

export const getCompany = (actor: string, id: string) => withUser(actor, async (db) => {
  const c = await db.query('select * from companies where id = $1', [id]);
  if (!c.rowCount) throw notFound();
  const members = await db.query(
    `select m.id, m.role, m.created_at, m.revoked_at, u.name, u.email, coalesce(s.is_blocked, false) as is_blocked
       from company_members m join "user" u on u.id = m.user_id left join user_security s on s.user_id = u.id
      where m.company_id = $1 order by u.name`, [id]);
  const invitations = await db.query(
    `select id, email, member_role, created_at, expires_at, accepted_at, revoked_at from invitations where company_id = $1 order by created_at desc`, [id]);
  return { ...c.rows[0], members: members.rows, invitations: invitations.rows };
});

export const createCompany = (actor: string, input: z.infer<typeof companyInput>) => withUser(actor, async (db) => {
  const r = await db.query(
    `insert into companies(name, sphere, city, contact_name, phone, email, status, created_by) values ($1,$2,$3,$4,$5,$6,$7,$8) returning *`,
    [input.name, input.sphere, input.city, input.contact_name, input.phone, input.email, input.status, actor]);
  await audit(db, { actorId: actor, action: 'company.created', entityType: 'company', entityId: r.rows[0].id, companyId: r.rows[0].id });
  return r.rows[0];
});

export const updateCompany = (actor: string, id: string, input: Partial<z.infer<typeof companyInput>>) => withUser(actor, async (db) => {
  const r = await db.query(
    `update companies set name = coalesce($2, name), sphere = coalesce($3, sphere), city = coalesce($4, city), contact_name = coalesce($5, contact_name),
            phone = coalesce($6, phone), email = coalesce($7, email), status = coalesce($8, status), updated_at = now()
      where id = $1 returning *`,
    [id, input.name ?? null, input.sphere ?? null, input.city ?? null, input.contact_name ?? null, input.phone ?? null, input.email ?? null, input.status ?? null]);
  if (!r.rowCount) throw notFound();
  await audit(db, { actorId: actor, action: 'company.updated', entityType: 'company', entityId: id, companyId: id, details: { fields: Object.keys(input) } });
  return r.rows[0];
});

// ---------- Вакансии ----------
export const vacancyInput = z.object({
  company_id: z.uuid(),
  title: text(200).min(2, 'Укажите название вакансии'),
  position_type: optText(100), requirements: optText(4000), budget: optText(200),
  status: z.enum(['new', 'searching', 'presented', 'interview', 'paused', 'closed', 'cancelled']).default('new'),
});

export const listVacancies = (actor: string, companyId?: string) => withUser(actor, async (db) => (await db.query(
  `select v.*, c.name as company_name,
          (select count(*) from applications a where a.vacancy_id = v.id)::int as candidates,
          (select count(*) from applications a join presentations p on p.application_id = a.id and p.revoked_at is null where a.vacancy_id = v.id)::int as presented
     from vacancies v join companies c on c.id = v.company_id
    where ($1::uuid is null or v.company_id = $1) order by v.opened_at desc`, [companyId ?? null])).rows);

export const createVacancy = (actor: string, input: z.infer<typeof vacancyInput>) => withUser(actor, async (db) => {
  const r = await db.query(
    `insert into vacancies(company_id, title, position_type, requirements, budget, status, created_by) values ($1,$2,$3,$4,$5,$6,$7) returning *`,
    [input.company_id, input.title, input.position_type, input.requirements, input.budget, input.status, actor]);
  await audit(db, { actorId: actor, action: 'vacancy.created', entityType: 'vacancy', entityId: r.rows[0].id, companyId: input.company_id });
  return r.rows[0];
});

export const updateVacancy = (actor: string, id: string, input: Partial<z.infer<typeof vacancyInput>>) => withUser(actor, async (db) => {
  const r = await db.query(
    `update vacancies set title = coalesce($2, title), position_type = coalesce($3, position_type), requirements = coalesce($4, requirements),
            budget = coalesce($5, budget), status = coalesce($6, status),
            closed_at = case when $6 in ('closed','cancelled') then coalesce(closed_at, now()) when $6 is not null then null else closed_at end,
            updated_at = now()
      where id = $1 returning *`,
    [id, input.title ?? null, input.position_type ?? null, input.requirements ?? null, input.budget ?? null, input.status ?? null]);
  if (!r.rowCount) throw notFound();
  await audit(db, { actorId: actor, action: 'vacancy.updated', entityType: 'vacancy', entityId: id, companyId: r.rows[0].company_id, details: { fields: Object.keys(input) } });
  return r.rows[0];
});

// ---------- Кандидаты ----------
export const candidateInput = z.object({
  full_name: text(200).min(2, 'Укажите имя'),
  birth_year: z.coerce.number().int().min(1930).max(2015).optional().nullable(),
  city: optText(100), direction: optText(100),
  phone: optText(50), email: z.email('Проверьте почту').optional().nullable().or(z.literal('')).transform((v) => v || null),
  telegram: optText(64), experience_summary: optText(2000), salary_expectation: optText(100),
  source: z.enum(['manual', 'site', 'base', 'referral', 'other']).default('manual'),
  pool_status: z.enum(['new', 'checked', 'offered', 'employed', 'reserve']).default('new'),
});

export const listCandidates = (actor: string, q?: string) => withUser(actor, async (db) => (await db.query(
  `select c.id, c.full_name, c.birth_year, c.city, c.direction, c.source, c.pool_status, c.created_at, c.anonymized_at,
          exists (select 1 from files f where f.candidate_id = c.id and f.kind = 'resume_pdf' and f.deleted_at is null) as has_resume,
          exists (select 1 from consents k where k.candidate_id = c.id and k.purpose = 'transfer_to_employer' and k.withdrawn_at is null) as can_transfer
     from candidates c
    where $1::text is null or c.full_name ilike '%' || $1 || '%' or c.city ilike '%' || $1 || '%'
    order by c.created_at desc limit 500`, [q?.trim() || null])).rows);

export const getCandidate = (actor: string, id: string) => withUser(actor, async (db) => {
  const c = await db.query('select * from candidates where id = $1', [id]);
  if (!c.rowCount) throw notFound();
  const [files, links, consents, notes, apps] = await Promise.all([
    db.query(`select id, kind, original_name, mime, size_bytes, page_count, scan_status, created_at from files where candidate_id = $1 and deleted_at is null order by created_at desc`, [id]),
    db.query('select id, kind, url, title, created_at from candidate_links where candidate_id = $1 order by created_at', [id]),
    db.query(`select k.*, t.version as text_version, co.name as scope_company_name from consents k join consent_texts t on t.id = k.consent_text_id
               left join companies co on co.id = k.scope_company_id where k.candidate_id = $1 order by k.granted_at desc`, [id]),
    db.query(`select n.id, n.body, n.created_at, n.application_id, u.name as author from internal_notes n left join "user" u on u.id = n.author_id where n.candidate_id = $1 order by n.created_at desc`, [id]),
    db.query(`select a.id, a.stage, a.reject_reason, a.created_at, v.id as vacancy_id, v.title as vacancy_title, co.id as company_id, co.name as company_name,
                     (select json_build_object('id', p.id, 'presented_at', p.presented_at, 'resume_file_id', p.resume_file_id, 'client_comment', p.client_comment, 'analysis', p.analysis, 'can_view_resume', p.can_view_resume, 'can_download_resume', p.can_download_resume,
                                               'can_view_video', p.can_view_video, 'can_view_contacts', p.can_view_contacts)
                        from presentations p where p.application_id = a.id and p.revoked_at is null) as presentation
                from applications a join vacancies v on v.id = a.vacancy_id join companies co on co.id = v.company_id
               where a.candidate_id = $1 order by a.created_at desc`, [id]),
  ]);
  return { ...c.rows[0], files: files.rows, links: links.rows, consents: consents.rows, notes: notes.rows, applications: apps.rows };
});

export const createCandidate = (actor: string, input: z.infer<typeof candidateInput>) => withUser(actor, async (db) => {
  const r = await db.query(
    `insert into candidates(full_name, birth_year, city, direction, phone, email, telegram, experience_summary, salary_expectation, source, pool_status, created_by)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) returning *`,
    [input.full_name, input.birth_year ?? null, input.city, input.direction, input.phone, input.email, input.telegram,
     input.experience_summary, input.salary_expectation, input.source, input.pool_status, actor]);
  await audit(db, { actorId: actor, action: 'candidate.created', entityType: 'candidate', entityId: r.rows[0].id });
  return r.rows[0];
});

export const updateCandidate = (actor: string, id: string, input: Partial<z.infer<typeof candidateInput>>) => withUser(actor, async (db) => {
  const cols = ['full_name', 'birth_year', 'city', 'direction', 'phone', 'email', 'telegram', 'experience_summary', 'salary_expectation', 'source', 'pool_status'] as const;
  const keys = cols.filter((k) => k in input);
  if (!keys.length) throw badRequest('Нет изменений');
  const sets = keys.map((k, i) => `${k} = $${i + 2}`).join(', ');
  const r = await db.query(`update candidates set ${sets}, updated_at = now() where id = $1 and anonymized_at is null returning *`,
    [id, ...keys.map((k) => (input as Record<string, unknown>)[k] ?? null)]);
  if (!r.rowCount) throw notFound();
  await audit(db, { actorId: actor, action: 'candidate.updated', entityType: 'candidate', entityId: id, details: { fields: keys } });
  return r.rows[0];
});

export const linkInput = z.object({
  kind: z.enum(['video', 'yandex_disk', 'other']),
  url: z.url('Нужна ссылка https://').refine((u) => u.startsWith('https://'), 'Ссылка должна начинаться с https://').refine((u) => u.length <= 2000),
  title: optText(200),
});
export const addLink = (actor: string, candidateId: string, input: z.infer<typeof linkInput>) => withUser(actor, async (db) => {
  const r = await db.query('insert into candidate_links(candidate_id, kind, url, title, added_by) values ($1,$2,$3,$4,$5) returning id, kind, url, title',
    [candidateId, input.kind, input.url, input.title, actor]);
  await audit(db, { actorId: actor, action: 'candidate.link_added', entityType: 'candidate', entityId: candidateId, details: { kind: input.kind } });
  return r.rows[0];
});
export const deleteLink = (actor: string, id: string) => withUser(actor, async (db) => {
  const r = await db.query('delete from candidate_links where id = $1 returning candidate_id', [id]);
  if (!r.rowCount) throw notFound();
  await audit(db, { actorId: actor, action: 'candidate.link_removed', entityType: 'candidate', entityId: r.rows[0].candidate_id });
});

export const noteInput = z.object({ body: text(4000).min(1, 'Напишите заметку'), application_id: z.uuid().optional().nullable() });
export const addNote = (actor: string, candidateId: string, input: z.infer<typeof noteInput>) => withUser(actor, async (db) => {
  const r = await db.query('insert into internal_notes(candidate_id, application_id, author_id, body) values ($1,$2,$3,$4) returning id, created_at',
    [candidateId, input.application_id ?? null, actor, input.body]);
  return r.rows[0];
});

// ---------- Согласия ----------
export const consentTextInput = z.object({
  purpose: z.enum(['pool_storage', 'transfer_to_employer', 'video_photo']),
  version: text(50).min(1), body: text(20000).min(20, 'Вставьте текст согласия'), effective_from: z.iso.date(),
});
export const listConsentTexts = (actor: string) => withUser(actor, async (db) => (await db.query('select * from consent_texts order by purpose, effective_from desc')).rows);
export const createConsentText = (actor: string, input: z.infer<typeof consentTextInput>) => withUser(actor, async (db) => {
  const r = await db.query('insert into consent_texts(purpose, version, body, effective_from) values ($1,$2,$3,$4) returning *',
    [input.purpose, input.version, input.body, input.effective_from]);
  await audit(db, { actorId: actor, action: 'consent_text.created', entityType: 'consent_text', entityId: r.rows[0].id, details: { purpose: input.purpose, version: input.version } });
  return r.rows[0];
});

export const consentInput = z.object({
  purpose: z.enum(['pool_storage', 'transfer_to_employer', 'video_photo']),
  consent_text_id: z.uuid(),
  scope_company_id: z.uuid().optional().nullable(),
  granted_at: z.iso.datetime({ offset: true }),
  method: z.enum(['site_form', 'paper', 'email', 'other']),
  evidence_note: optText(1000),
});
export const recordConsent = (actor: string, candidateId: string, input: z.infer<typeof consentInput>) => withUser(actor, async (db) => {
  const t = await db.query('select purpose from consent_texts where id = $1', [input.consent_text_id]);
  if (!t.rowCount) throw notFound();
  if (t.rows[0].purpose !== input.purpose) throw badRequest('Текст согласия относится к другой цели');
  if (new Date(input.granted_at) > new Date()) throw badRequest('Дата согласия не может быть в будущем');
  const r = await db.query(
    `insert into consents(candidate_id, purpose, consent_text_id, scope_company_id, granted_at, method, evidence, recorded_by)
     values ($1,$2,$3,$4,$5,$6,$7,$8) returning *`,
    [candidateId, input.purpose, input.consent_text_id, input.scope_company_id ?? null, input.granted_at, input.method,
     JSON.stringify({ note: input.evidence_note }), actor]);
  await audit(db, { actorId: actor, action: 'consent.recorded', entityType: 'consent', entityId: r.rows[0].id, companyId: input.scope_company_id ?? null,
    details: { purpose: input.purpose, candidate_id: candidateId } });
  return r.rows[0];
});

export const withdrawInput = z.object({ method: z.enum(['paper', 'email', 'phone', 'other']), note: optText(1000) });
// Отзыв согласия: триггер в базе сразу закрывает связанные представления. Данные не удаляются автоматически.
export const withdrawConsent = (actor: string, id: string, input: z.infer<typeof withdrawInput>) => withUser(actor, async (db) => {
  const r = await db.query(
    `update consents set withdrawn_at = now(), withdrawn_method = $2, withdrawn_note = $3, withdrawn_recorded_by = $4
      where id = $1 and withdrawn_at is null returning id, candidate_id, purpose`, [id, input.method, input.note, actor]);
  if (!r.rowCount) throw notFound();
  // Триггер закрыл представления в этой же транзакции, поэтому их revoked_at равен now()
  const closed = await db.query(
    `select count(*)::int as n from presentations p join applications a on a.id = p.application_id
      where a.candidate_id = $1 and p.revoked_reason = 'consent_withdrawn' and p.revoked_at = now()`, [r.rows[0].candidate_id]);
  return { ...r.rows[0], presentations_closed: closed.rows[0].n };
});

// ---------- Рассмотрение и этапы ----------
export const applicationInput = z.object({ vacancy_id: z.uuid(), candidate_id: z.uuid(), stage: z.enum(['sourced', 'screening']).default('sourced') });
export const createApplication = (actor: string, input: z.infer<typeof applicationInput>) => withUser(actor, async (db) => {
  const v = await db.query('select company_id from vacancies where id = $1', [input.vacancy_id]);
  if (!v.rowCount) throw notFound();
  const r = await db.query('insert into applications(vacancy_id, candidate_id, stage, created_by) values ($1,$2,$3,$4) returning *',
    [input.vacancy_id, input.candidate_id, input.stage, actor]);
  await audit(db, { actorId: actor, action: 'application.created', entityType: 'application', entityId: r.rows[0].id, companyId: v.rows[0].company_id });
  return r.rows[0];
});

export const stageInput = z.object({ stage: z.enum(STAGES), reason: optText(500) });
export const setStage = (actor: string, applicationId: string, input: z.infer<typeof stageInput>) => withUser(actor, async (db) => {
  const a = await db.query(`select a.stage, v.company_id from applications a join vacancies v on v.id = a.vacancy_id where a.id = $1 for update of a`, [applicationId]);
  if (!a.rowCount) throw notFound();
  const err = adminStageError(a.rows[0].stage as Stage, input.stage, input.reason);
  if (err) throw conflict(err);
  const onBehalf = CLIENT_DECISIONS.includes(input.stage);
  await db.query("select set_config('app.stage_reason', $1, true), set_config('app.on_behalf', $2, true)", [input.reason ?? '', String(onBehalf)]);
  await db.query(`update applications set stage = $2, reject_reason = case when $2 = 'rejected' then $3 end where id = $1`, [applicationId, input.stage, input.reason ?? null]);
  await db.query("select set_config('app.stage_reason', '', true), set_config('app.on_behalf', '', true)");
  if (input.stage === 'hired') await db.query(`update candidates set pool_status = 'employed' from applications a where a.id = $1 and candidates.id = a.candidate_id`, [applicationId]);
  await audit(db, { actorId: actor, action: 'application.stage_changed', entityType: 'application', entityId: applicationId, companyId: a.rows[0].company_id,
    details: { from: a.rows[0].stage, to: input.stage, on_behalf_of_client: onBehalf } });
  return { stage: input.stage };
});

export const applicationHistory = (actor: string, id: string) => withUser(actor, async (db) => {
  const r = await db.query(
    `select h.from_stage, h.to_stage, h.changed_at, h.reason, h.on_behalf_of_client, u.name as changed_by
       from stage_history h left join "user" u on u.id = h.changed_by where h.application_id = $1 order by h.changed_at, h.id`, [id]);
  const fb = await db.query(
    `select f.body, f.rating, f.created_at, u.name as author from client_feedback f join "user" u on u.id = f.author_id where f.application_id = $1 order by f.created_at`, [id]);
  return { history: r.rows, feedback: fb.rows };
});

// ---------- Представления клиенту ----------
export const presentationInput = z.object({
  application_id: z.uuid(),
  consent_id: z.uuid().optional(),
  client_comment: optText(4000),
  analysis: z.object({ who: optText(2000), drive: optText(2000), risk: optText(2000), horizon: optText(200), opinion: optText(2000) }).partial().default({}),
  resume_file_id: z.uuid().optional().nullable(),
  can_view_resume: z.boolean().default(false),
  can_download_resume: z.boolean().default(false),
  can_view_video: z.boolean().default(false),
  can_view_contacts: z.boolean().default(false),
}).refine((p) => !p.can_download_resume || p.can_view_resume, { message: 'Скачивание возможно только вместе с просмотром', path: ['can_download_resume'] })
  .refine((p) => !p.can_view_resume || p.resume_file_id, { message: 'Выберите файл резюме, который увидит клиент', path: ['resume_file_id'] });

// Файл резюме открывается клиенту только явным выбором. При включённой антивирусной проверке — только проверенный файл.
async function assertShareableFile(db: Db, fileId: string | null | undefined) {
  if (!fileId) return;
  const f = await db.query('select scan_status, deleted_at from files where id = $1', [fileId]);
  if (!f.rowCount || f.rows[0].deleted_at) throw notFound();
  if (f.rows[0].scan_status === 'infected') throw conflict('Файл не прошёл антивирусную проверку');
  if (env().FILE_SCAN_MODE === 'clamav' && f.rows[0].scan_status !== 'clean') throw conflict('Файл ещё не прошёл антивирусную проверку');
}

async function pickConsent(db: Db, applicationId: string, explicit?: string) {
  if (explicit) return explicit;
  const r = await db.query(
    `select k.id from applications a join vacancies v on v.id = a.vacancy_id
       join consents k on k.candidate_id = a.candidate_id and k.purpose = 'transfer_to_employer' and k.withdrawn_at is null
                      and (k.scope_company_id is null or k.scope_company_id = v.company_id)
      where a.id = $1 order by (k.scope_company_id is not null) desc, k.granted_at desc limit 1`, [applicationId]);
  if (!r.rowCount) throw conflict('Нет действующего согласия кандидата на передачу данных этому работодателю. Сначала зафиксируйте согласие.');
  return r.rows[0].id as string;
}

export const createPresentation = (actor: string, input: z.infer<typeof presentationInput>) => withUser(actor, async (db) => {
  const a = await db.query(`select a.id, a.stage, a.candidate_id, v.company_id from applications a join vacancies v on v.id = a.vacancy_id where a.id = $1 for update of a`, [input.application_id]);
  if (!a.rowCount) throw notFound();
  if (['hired', 'rejected'].includes(a.rows[0].stage)) throw conflict('Кандидат уже вышел на работу или получил отказ по этой вакансии');
  const consentId = await pickConsent(db, input.application_id, input.consent_id);
  await assertShareableFile(db, input.resume_file_id);
  const r = await db.query(
    `insert into presentations(application_id, consent_id, presented_by, client_comment, analysis, resume_file_id, can_view_resume, can_download_resume, can_view_video, can_view_contacts)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) returning *`,
    [input.application_id, consentId, actor, input.client_comment, JSON.stringify(input.analysis ?? {}), input.resume_file_id ?? null,
     input.can_view_resume, input.can_download_resume, input.can_view_video, input.can_view_contacts]);
  if (['sourced', 'screening'].includes(a.rows[0].stage)) await db.query(`update applications set stage = 'offered' where id = $1`, [input.application_id]);
  await db.query(`update candidates set pool_status = 'offered' where id = $1 and pool_status in ('new','checked','reserve')`, [a.rows[0].candidate_id]);
  await audit(db, { actorId: actor, action: 'presentation.created', entityType: 'presentation', entityId: r.rows[0].id, companyId: a.rows[0].company_id,
    details: { can_view_resume: input.can_view_resume, can_download_resume: input.can_download_resume, can_view_video: input.can_view_video, can_view_contacts: input.can_view_contacts } });
  return r.rows[0];
});

export const presentationPatch = z.object({
  client_comment: optText(4000).optional(),
  analysis: z.object({ who: optText(2000), drive: optText(2000), risk: optText(2000), horizon: optText(200), opinion: optText(2000) }).partial().optional(),
  resume_file_id: z.uuid().nullable().optional(),
  can_view_resume: z.boolean().optional(), can_download_resume: z.boolean().optional(),
  can_view_video: z.boolean().optional(), can_view_contacts: z.boolean().optional(),
});
export const updatePresentation = (actor: string, id: string, input: z.infer<typeof presentationPatch>) => withUser(actor, async (db) => {
  const cur = await db.query('select * from presentations where id = $1 and revoked_at is null for update', [id]);
  if (!cur.rowCount) throw notFound();
  const p = cur.rows[0];
  const fileId = input.resume_file_id !== undefined ? input.resume_file_id : p.resume_file_id;
  const canView = input.can_view_resume ?? p.can_view_resume;
  if (canView && !fileId) throw badRequest('Выберите файл резюме, который увидит клиент', { resume_file_id: 'Выберите файл' });
  if (input.resume_file_id !== undefined) await assertShareableFile(db, input.resume_file_id);
  const canDownload = canView ? (input.can_download_resume ?? p.can_download_resume) : false;
  const r = await db.query(
    `update presentations set client_comment = coalesce($2, client_comment), analysis = coalesce($3, analysis),
            resume_file_id = $4, can_view_resume = $5, can_download_resume = $6,
            can_view_video = coalesce($7, can_view_video), can_view_contacts = coalesce($8, can_view_contacts)
      where id = $1 returning *`,
    [id, input.client_comment ?? null, input.analysis ? JSON.stringify(input.analysis) : null, fileId ?? null, canView, canDownload,
     input.can_view_video ?? null, input.can_view_contacts ?? null]);
  await audit(db, { actorId: actor, action: 'presentation.updated', entityType: 'presentation', entityId: id, details: input as Record<string, unknown> });
  return r.rows[0];
});

export const revokePresentation = (actor: string, id: string, reason: string | null) => withUser(actor, async (db) => {
  const r = await db.query(`update presentations set revoked_at = now(), revoked_by = $2, revoked_reason = coalesce($3, 'revoked_by_admin') where id = $1 and revoked_at is null returning application_id`, [id, actor, reason]);
  if (!r.rowCount) throw notFound();
  await audit(db, { actorId: actor, action: 'presentation.revoked', entityType: 'presentation', entityId: id, details: { reason } });
});

// ---------- Журнал и показатели ----------
export const listAudit = (actor: string, f: { companyId?: string; action?: string; limit?: number }) => withUser(actor, async (db) => (await db.query(
  `select l.id, l.at, l.action, l.entity_type, l.entity_id, l.company_id, l.actor_kind, l.details, u.name as actor_name
     from audit_log l left join "user" u on u.id = l.actor_id
    where ($1::uuid is null or l.company_id = $1) and ($2::text is null or l.action like $2 || '%')
    order by l.at desc, l.id desc limit $3`, [f.companyId ?? null, f.action ?? null, Math.min(f.limit ?? 200, 1000)])).rows);

export const metrics = (actor: string, f: { companyId?: string; vacancyId?: string; from?: string; to?: string }) => withUser(actor, async (db) => {
  const r = await db.query('select metrics($1, $2, $3, $4) as m', [f.companyId ? [f.companyId] : null, f.vacancyId ?? null, f.from ?? null, f.to ?? null]);
  return r.rows[0].m;
});

// Сводка по каждой компании для таблицы на дашборде администратора (та же функция metrics, по одной компании)
export const metricsByCompany = (actor: string, f: { from?: string; to?: string }) => withUser(actor, async (db) => (await db.query(
  `select c.id, c.name, c.status, metrics(array[c.id], null, $1, $2) as m from companies c order by c.name`, [f.from ?? null, f.to ?? null])).rows);

export const getVacancy = (actor: string, id: string) => withUser(actor, async (db) => {
  const v = await db.query('select v.*, c.name as company_name from vacancies v join companies c on c.id = v.company_id where v.id = $1', [id]);
  if (!v.rowCount) throw notFound();
  const apps = await db.query(
    `select a.id, a.stage, a.reject_reason, a.created_at, a.updated_at, c.id as candidate_id, c.full_name, c.city, c.birth_year,
            (select json_build_object('id', p.id, 'presented_at', p.presented_at, 'resume_file_id', p.resume_file_id, 'can_view_resume', p.can_view_resume,
                                      'can_download_resume', p.can_download_resume, 'can_view_video', p.can_view_video, 'can_view_contacts', p.can_view_contacts)
               from presentations p where p.application_id = a.id and p.revoked_at is null) as presentation,
            (select count(*) from client_feedback f where f.application_id = a.id)::int as feedback_count
       from applications a join candidates c on c.id = a.candidate_id where a.vacancy_id = $1 order by a.created_at`, [id]);
  return { ...v.rows[0], applications: apps.rows, metrics: (await db.query('select metrics(null, $1, null, null) as m', [id])).rows[0].m };
});
