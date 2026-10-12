// Вымышленные данные для локальной разработки. Никаких реальных людей и компаний.
// Создаёт приглашения (ссылки выводятся в консоль и письма в папку MAIL_DIR) и данные подбора.
// Требует уже созданного администратора: npm run create-admin -- you@example.test, затем принять приглашение.
import pg from 'pg';
import { createInvitation } from '../src/lib/invitations';
import { pool, withUser } from '../src/lib/db';

const ownerUrl = process.env.DATABASE_OWNER_URL;
if (!ownerUrl) { console.error('Нужна DATABASE_OWNER_URL'); process.exit(1); }
const o = new pg.Client({ connectionString: ownerUrl }); await o.connect();
const adminId = (await o.query(`select user_id from staff_roles where role = 'admin' order by created_at limit 1`)).rows[0]?.user_id;
await o.end();
if (!adminId) { console.error('Сначала создайте администратора: npm run create-admin -- email'); process.exit(1); }

await withUser(adminId, async (db) => {
  const q = async (sql: string, p: unknown[]) => (await db.query(sql, p)).rows[0];
  const t = await q(`insert into consent_texts(purpose, version, body, effective_from) values ('transfer_to_employer', 'dev-1', 'Черновой текст согласия для разработки. Не юридический документ.', '2026-01-01')
                     on conflict (purpose, version) do update set body = excluded.body returning id`, []);
  const companies = [['ООО «Северный ветер» (демо)', 'Строительство'], ['Семья Карповых (демо)', 'Домашний персонал']];
  for (const [name, sphere] of companies) {
    const c = await q('insert into companies(name, sphere, created_by) values ($1, $2, $3) returning id', [name, sphere, adminId]);
    const v = await q(`insert into vacancies(company_id, title, status, created_by) values ($1, $2, 'searching', $3) returning id`, [c.id, sphere === 'Строительство' ? 'Бизнес-ассистент собственника' : 'Няня для ребёнка 2 лет', adminId]);
    for (const full of ['Алина Морозова (демо)', 'Кирилл Зайцев (демо)', 'Светлана Орлова (демо)']) {
      const k = await q(`insert into candidates(full_name, city, birth_year, experience_summary, created_by) values ($1, 'Москва', 1990, 'Вымышленный опыт для демо', $2) returning id`, [full, adminId]);
      const cons = await q(`insert into consents(candidate_id, purpose, consent_text_id, granted_at, method, recorded_by) values ($1, 'transfer_to_employer', $2, now() - interval '1 day', 'other', $3) returning id`, [k.id, t.id, adminId]);
      const a = await q('insert into applications(vacancy_id, candidate_id, created_by) values ($1, $2, $3) returning id', [v.id, k.id, adminId]);
      await db.query(`insert into presentations(application_id, consent_id, presented_by, client_comment, analysis, can_view_resume) values ($1, $2, $3, 'Демо-комментарий рекрутера', '{"who":"Демо","opinion":"Рекомендуем"}', true)`, [a.id, cons.id, adminId]);
      await db.query(`update applications set stage = 'offered' where id = $1`, [a.id]);
    }
    console.log(`Компания: ${name}`);
  }
});
const first = await withUser(adminId, async (db) => (await db.query('select id from companies order by created_at limit 1')).rows[0].id);
await createInvitation(adminId, { email: 'client-demo@example.test', companyId: first, memberRole: 'owner' });
console.log('Приглашение клиента отправлено на client-demo@example.test (смотрите папку писем).');
await pool().end();
