// Клиент A не получает данные клиента B ни через API, ни через подмену ID, ни напрямую в базе.
import { beforeAll, describe, expect, it } from 'vitest';
import { asApp, fakeId, owner } from './helpers';
import { anon, buildWorld, type World } from './world';

let w: World;
beforeAll(async () => { w = await buildWorld('iso'); });

describe('Изоляция компаний', () => {
  it('клиент видит только свою компанию и свои вакансии', async () => {
    const o = await w.a1.client.json('GET', '/api/client/overview');
    expect(o.companies.map((c: any) => c.id)).toEqual([w.A.id]);
    expect(o.vacancies.map((v: any) => v.id)).toEqual([w.vA.id]);
    expect(JSON.stringify(o)).not.toContain(w.vB.title);
  });

  it('список кандидатов: только представленные этой компании', async () => {
    const listA = await w.a1.client.json('GET', '/api/client/presentations');
    expect(listA.map((p: any) => p.presentation_id).sort()).toEqual([w.pXA.id, w.pYA.id].sort());
    const listB = await w.b1.client.json('GET', '/api/client/presentations');
    expect(listB.map((p: any) => p.presentation_id).sort()).toEqual([w.pXB.id, w.pZB.id].sort());
    // Z рассматривается по вакансии A внутренне, но A его не видит
    expect(JSON.stringify(listA)).not.toContain(w.Z.full_name);
  });

  it('подмена ID: чужое представление, решение, отзыв и резюме дают 404', async () => {
    const c = w.a1.client;
    for (const id of [w.pXB.id, w.pZB.id, fakeId()]) {
      expect((await c.get(`/api/client/presentations/${id}`)).status).toBe(404);
      expect((await c.post(`/api/client/presentations/${id}/decision`, { stage: 'interested' })).status).toBe(404);
      expect((await c.post(`/api/client/presentations/${id}/feedback`, { body: 'Попытка' })).status).toBe(404);
      expect((await c.get(`/api/client/presentations/${id}/resume`)).status).toBe(404);
    }
    expect((await c.get('/api/client/presentations/not-a-uuid')).status).toBe(404);
  });

  it('фильтр по чужой вакансии ничего не возвращает', async () => {
    expect(await w.a1.client.json('GET', `/api/client/presentations?vacancy_id=${w.vB.id}`)).toEqual([]);
    const m = await w.a1.client.json('GET', `/api/client/metrics?vacancy_id=${w.vB.id}`);
    expect(m.presented).toBe(0);
    expect(m.processed_candidates).toBe(0);
  });

  it('карточка не раскрывает ID кандидата, заметки рекрутера и факт представления другому клиенту', async () => {
    const card = await w.a1.client.json('GET', `/api/client/presentations/${w.pXA.id}`);
    const s = JSON.stringify(card);
    expect(card.full_name).toBe(w.X.full_name);
    for (const leak of [w.X.id, w.B.id, w.B.name, w.vB.title, w.pXB.id, w.aXB.id, 'ВНУТРЕННЯЯ-ЗАМЕТКА', '"company_id"', '"candidate_id"', 'source', 'pool_status'])
      expect(s).not.toContain(leak);
    expect(card.history.every((h: any) => !['sourced', 'screening'].includes(h.to_stage))).toBe(true);
  });

  it('контакты и видео открываются только там, где разрешено', async () => {
    const a = await w.a1.client.json('GET', `/api/client/presentations/${w.pXA.id}`);
    expect(a.phone).toBeNull();
    expect(a.links).toEqual([]);
    const b = await w.b1.client.json('GET', `/api/client/presentations/${w.pXB.id}`);
    expect(b.phone).toBe('+70000000001');
    expect(b.links.map((l: any) => l.url)).toEqual(['https://disk.yandex.ru/i/test-video-x']);
  });

  it('решение клиента A не влияет на этап того же кандидата у клиента B', async () => {
    await w.a1.client.json('POST', `/api/client/presentations/${w.pXA.id}/decision`, { stage: 'interested' });
    const b = await w.b1.client.json('GET', `/api/client/presentations/${w.pXB.id}`);
    expect(b.stage).toBe('offered');
    expect(JSON.stringify(b.history)).not.toContain('interested');
  });

  it('показатели: обработано учитывает внутренних кандидатов, представлено — только показанных', async () => {
    const m = await w.a1.client.json('GET', '/api/client/metrics');
    expect(m.processed_candidates).toBe(3);    // X, Y и Z (Z рассматривается внутренне)
    expect(m.presented).toBe(2);
    expect(m.revoked).toBe(0);
  });

  it('база: роль приложения от имени клиента A не читает таблицы пула и чужие данные', async () => {
    const uid = await owner(async (db) => (await db.query('select id from "user" where email = $1', [w.a1.email])).rows[0].id);
    const r = await asApp(uid, async (db) => ({
      candidates: (await db.query('select count(*)::int n from candidates')).rows[0].n,
      presentations: (await db.query('select count(*)::int n from presentations')).rows[0].n,
      applications: (await db.query('select count(*)::int n from applications')).rows[0].n,
      files: (await db.query('select count(*)::int n from files')).rows[0].n,
      consents: (await db.query('select count(*)::int n from consents')).rows[0].n,
      notes: (await db.query('select count(*)::int n from internal_notes')).rows[0].n,
      audit: (await db.query('select count(*)::int n from audit_log')).rows[0].n,
      companies: (await db.query('select array_agg(id) a from companies')).rows[0].a,
      cards: (await db.query('select array_agg(presentation_id) a from client_presentations')).rows[0].a,
    }));
    expect(r).toMatchObject({ candidates: 0, presentations: 0, applications: 0, files: 0, consents: 0, notes: 0, audit: 0 });
    expect(r.companies).toEqual([w.A.id]);
    expect([...r.cards].sort()).toEqual([w.pXA.id, w.pYA.id].sort());
    const none = await asApp(null, async (db) => (await db.query('select count(*)::int n from client_presentations')).rows[0].n);
    expect(none).toBe(0);
  });

  it('база: клиент не может записать решение в чужое представление даже напрямую', async () => {
    const uid = await owner(async (db) => (await db.query('select id from "user" where email = $1', [w.a1.email])).rows[0].id);
    await expect(asApp(uid, (db) => db.query(`select client_set_stage($1, 'interested', null)`, [w.pZB.id]))).rejects.toMatchObject({ code: 'IK404' });
    await expect(asApp(uid, (db) => db.query(`update applications set stage = 'hired' where id = $1`, [w.aXA.id]).then((r) => r.rowCount))).resolves.toBe(0);
  });
});

describe('Роли', () => {
  it('без входа: 401 на API, редирект со страницы кабинета', async () => {
    const c = anon();
    expect((await c.get('/api/admin/companies')).status).toBe(401);
    expect((await c.get('/api/client/presentations')).status).toBe(401);
    const page = await c.get('/app');
    expect(page.status).toBe(302);
    expect(page.headers.get('location')).toBe('/login');
  });

  it('клиент не имеет доступа к маршрутам администратора', async () => {
    const c = w.a1.client;
    const paths = ['/api/admin/companies', '/api/admin/users', '/api/admin/candidates', '/api/admin/vacancies', '/api/admin/metrics', '/api/admin/audit', '/api/admin/consent-texts', `/api/admin/candidates/${w.X.id}`];
    for (const p of paths) expect((await c.get(p)).status).toBe(403);
    expect((await c.post('/api/admin/companies', { name: 'Взлом' })).status).toBe(403);
    expect((await c.post('/api/admin/invitations', { email: 'x@example.test', staff_role: 'admin' })).status).toBe(403);
    expect((await c.post(`/api/admin/applications/${w.aXA.id}/stage`, { stage: 'hired' })).status).toBe(403);
  });

  it('администратор не пользуется клиентскими маршрутами', async () => {
    expect((await w.adm.get('/api/client/presentations')).status).toBe(403);
  });

  it('роль «просмотр» читает, но не принимает решения и не пишет отзывы', async () => {
    const c = w.a2.client;
    expect((await c.get(`/api/client/presentations/${w.pYA.id}`)).status).toBe(200);
    expect((await c.post(`/api/client/presentations/${w.pYA.id}/decision`, { stage: 'interested' })).status).toBe(403);
    expect((await c.post(`/api/client/presentations/${w.pYA.id}/feedback`, { body: 'Отзыв' })).status).toBe(403);
  });

  it('отзыв членства закрывает доступ к данным компании сразу', async () => {
    const { client: adm } = { client: w.adm };
    const co = await adm.json('GET', `/api/admin/companies/${w.A.id}`);
    const m = co.members.find((x: any) => x.email === w.a2.email);
    await adm.json('POST', `/api/admin/memberships/${m.id}/revoke`);
    expect((await w.a2.client.get(`/api/client/presentations/${w.pYA.id}`)).status).toBe(403);
    expect((await w.a2.client.json('GET', '/api/session/me')).kind).toBe('none');
  });
});

describe('Этапы', () => {
  it('недопустимый переход и отказ без причины отклоняются', async () => {
    const c = w.a1.client;
    expect((await c.post(`/api/client/presentations/${w.pYA.id}/decision`, { stage: 'rejected' })).status).toBe(400);
    await c.json('POST', `/api/client/presentations/${w.pYA.id}/decision`, { stage: 'interview' });
    expect((await c.post(`/api/client/presentations/${w.pYA.id}/decision`, { stage: 'interested' })).status).toBe(409);
    await c.json('POST', `/api/client/presentations/${w.pYA.id}/feedback`, { body: 'Хорошее интервью', rating: 5 });
    const card = await c.json('GET', `/api/client/presentations/${w.pYA.id}`);
    expect(card.stage).toBe('interview');
    expect(card.history.map((h: any) => h.to_stage)).toEqual(['offered', 'interview']);
    expect(card.history[1].actor_side).toBe('client');
    expect(card.feedback[0].body).toBe('Хорошее интервью');
  });

  it('администратор не ставит «Предложен» вручную; решения за клиента отмечаются в истории', async () => {
    const adm = w.adm;
    const app = await adm.json('POST', '/api/admin/applications', { vacancy_id: w.vB.id, candidate_id: w.Y.id });
    expect((await adm.post(`/api/admin/applications/${app.id}/stage`, { stage: 'offered' })).status).toBe(409);
    expect((await adm.post(`/api/admin/applications/${app.id}/stage`, { stage: 'interested' })).status).toBe(409);   // без представления
    await adm.json('POST', `/api/admin/applications/${w.aZB.id}/stage`, { stage: 'interested' });
    const h = await adm.json('GET', `/api/admin/applications/${w.aZB.id}/history`);
    expect(h.history.at(-1)).toMatchObject({ to_stage: 'interested', on_behalf_of_client: true });
  });
});
