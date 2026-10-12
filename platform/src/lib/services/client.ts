// Операции клиента. Данные кандидатов читаются только через представления client_* и функции базы,
// которые отдают разрешённые поля по действующим представлениям компании пользователя.
// Клиент не получает ID кандидатов и файлов: всё адресуется по ID представления.
import { z } from 'zod';
import { withUser } from '../db';
import { audit } from '../audit';
import { forbidden, notFound } from '../errors';
import type { Actor } from '../session';

export const overview = (a: Actor) => withUser(a.userId, async (db) => {
  const companies = (await db.query('select id, name, sphere, city from companies order by name')).rows;   // RLS: только свои
  const vacancies = (await db.query(
    `select v.id, v.company_id, v.title, v.position_type, v.status, v.opened_at, v.closed_at,
            (select count(*) from client_presentations cp where cp.vacancy_id = v.id)::int as presented
       from vacancies v order by v.opened_at desc`)).rows;
  return { companies, vacancies };
});

export const listPresentations = (a: Actor, vacancyId?: string) => withUser(a.userId, async (db) => (await db.query(
  `select presentation_id, vacancy_id, vacancy_title, stage, reject_reason, presented_at, stage_changed_at,
          full_name, age, city, direction, has_resume, can_view_video
     from client_presentations where ($1::uuid is null or vacancy_id = $1) order by presented_at desc`, [vacancyId ?? null])).rows);

export const getPresentation = (a: Actor, id: string) => withUser(a.userId, async (db) => {
  const r = await db.query('select * from client_presentations where presentation_id = $1', [id]);
  if (!r.rowCount) throw notFound();
  const p = r.rows[0];
  const [history, links, feedback] = await Promise.all([
    db.query('select to_stage, changed_at, reason, actor_side, actor_name, on_behalf_of_client from client_stage_history where presentation_id = $1 order by changed_at', [id]),
    db.query('select kind, title, url from client_presentation_links where presentation_id = $1', [id]),
    db.query(`select f.id, f.body, f.rating, f.created_at, u.name as author from client_feedback f join "user" u on u.id = f.author_id
               where f.presentation_id = $1 order by f.created_at`, [id]),
  ]);
  await audit(db, { actorId: a.userId, action: 'client.card_viewed', entityType: 'presentation', entityId: id, companyId: p.company_id });
  const { company_id: _c, ...card } = p;
  return { ...card, history: history.rows, links: links.rows, feedback: feedback.rows };
});

export const decisionInput = z.object({ stage: z.enum(['interested', 'interview', 'rejected']), reason: z.string().trim().max(500).optional() });
export const decide = (a: Actor, id: string, input: z.infer<typeof decisionInput>) => withUser(a.userId, async (db) => {
  const r = await db.query('select client_set_stage($1, $2, $3) as stage', [id, input.stage, input.reason ?? null]);
  return { stage: r.rows[0].stage };
});

export const feedbackInput = z.object({ body: z.string().trim().min(1, 'Напишите отзыв').max(4000), rating: z.number().int().min(1).max(5).optional() });
export const addFeedback = (a: Actor, id: string, input: z.infer<typeof feedbackInput>) => withUser(a.userId, async (db) => {
  const v = await db.query('select company_id from client_presentations where presentation_id = $1', [id]);
  if (!v.rowCount) throw notFound();
  if (a.memberships.find((m) => m.companyId === v.rows[0].company_id)?.role === 'viewer') throw forbidden('Роль «просмотр» не позволяет оставлять отзывы');
  const r = await db.query('insert into client_feedback(presentation_id, author_id, body, rating) values ($1, $2, $3, $4) returning id, created_at',
    [id, a.userId, input.body, input.rating ?? null]);   // RLS: только owner/member своей компании
  await audit(db, { actorId: a.userId, action: 'client.feedback', entityType: 'presentation', entityId: id, companyId: v.rows[0].company_id });
  return r.rows[0];
});

export const metrics = (a: Actor, f: { vacancyId?: string; from?: string; to?: string }) => withUser(a.userId, async (db) =>
  (await db.query('select metrics(null, $1, $2, $3) as m', [f.vacancyId ?? null, f.from ?? null, f.to ?? null])).rows[0].m);
