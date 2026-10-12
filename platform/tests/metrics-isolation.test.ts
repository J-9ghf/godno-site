// Показатели не смешивают клиентов: фильтры, счётчики и конверсии считаются только по данным своей компании.
import { beforeAll, describe, expect, it } from 'vitest';
import { buildWorld, type World } from './world';

let w: World;
beforeAll(async () => {
  w = await buildWorld('miso');
  // Решения у B: X интересен, Z отказ (Z по умолчанию без резюме)
  await w.b1.client.json('POST', `/api/client/presentations/${w.pXB.id}/decision`, { stage: 'interested' });
  await w.b1.client.json('POST', `/api/client/presentations/${w.pZB.id}/decision`, { stage: 'rejected', reason: 'Не подходит по опыту' });
});

describe('Показатели и изоляция', () => {
  it('у A нет решений B: конверсии и отказы считаются только по своим представлениям', async () => {
    const a = await w.a1.client.json('GET', '/api/client/metrics');
    expect(a).toMatchObject({ presented: 2, reached_interested: 0, rejected: 0, awaiting_client: 2 });
    expect(a.reject_reasons).toEqual([]);
    expect(a.conversions.offered_to_interested).toBe(0);
    const b = await w.b1.client.json('GET', '/api/client/metrics');
    expect(b).toMatchObject({ presented: 2, reached_interested: 1, rejected: 1, awaiting_client: 0 });
    expect(b.conversions.offered_to_interested).toBe(50);
  });

  it('цифры клиента совпадают с цифрами администратора по той же компании', async () => {
    for (const [cl, co] of [[w.a1.client, w.A], [w.b1.client, w.B]] as const) {
      const c = await cl.json('GET', '/api/client/metrics');
      const a = await w.adm.json('GET', `/api/admin/metrics?company_id=${co.id}`);
      for (const k of ['active_vacancies', 'processed_candidates', 'presented', 'awaiting_client', 'reached_interested', 'rejected']) expect(a[k]).toBe(c[k]);
    }
  });

  it('фильтр по вакансии и компании у администратора', async () => {
    const vA = await w.adm.json('GET', `/api/admin/metrics?vacancy_id=${w.vA.id}`);
    expect(vA.presented).toBe(2);
    const mixed = await w.adm.json('GET', `/api/admin/metrics?company_id=${w.A.id}&vacancy_id=${w.vB.id}`);
    expect(mixed.presented).toBe(0);
    const rows = await w.adm.json('GET', '/api/admin/metrics/by-company');
    const ra = rows.find((r: any) => r.id === w.A.id), rb = rows.find((r: any) => r.id === w.B.id);
    expect(ra.m.presented).toBe(2); expect(rb.m.rejected).toBe(1);
  });

  it('период: будущее — ноль, прошлое включает', async () => {
    expect((await w.a1.client.json('GET', '/api/client/metrics?from=2099-01-01')).presented).toBe(0);
    expect((await w.a1.client.json('GET', '/api/client/metrics?from=2020-01-01&to=2099-01-01')).presented).toBe(2);
    expect((await w.a1.client.get('/api/client/metrics?from=не-дата')).status).toBe(400);
  });

  it('воронка по вакансиям клиента содержит только его вакансии', async () => {
    const list = await w.a1.client.json('GET', '/api/client/vacancies');
    expect(list.map((v: any) => v.id)).toEqual([w.vA.id]);
    expect(list[0].m.presented).toBe(2);
  });

  it('клиент не получает сводку по компаниям и чужую вакансию у администратора', async () => {
    expect((await w.a1.client.get('/api/admin/metrics/by-company')).status).toBe(403);
    expect((await w.a1.client.get(`/api/admin/vacancies/${w.vB.id}`)).status).toBe(403);
  });
});
