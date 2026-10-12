// Показатели считаются из базы по истории этапов. Отдельная компания, чтобы цифры были детерминированы.
import { beforeAll, describe, expect, it } from 'vitest';
import { admin, inviteClient } from './helpers';

let ctx: any;
beforeAll(async () => {
  const { client: adm } = await admin();
  const C = await adm.json('POST', '/api/admin/companies', { name: 'Гамма метрики' });
  const v1 = await adm.json('POST', '/api/admin/vacancies', { company_id: C.id, title: 'Вакансия 1', status: 'searching' });
  const v2 = await adm.json('POST', '/api/admin/vacancies', { company_id: C.id, title: 'Вакансия 2', status: 'paused' });
  const t = (await adm.json('GET', '/api/admin/consent-texts')).find((x: any) => x.purpose === 'transfer_to_employer')
    ?? await adm.json('POST', '/api/admin/consent-texts', { purpose: 'transfer_to_employer', version: 'm1', body: 'Тестовый текст согласия для автотестов.', effective_from: '2026-01-01' });
  const pres: string[] = []; const apps: string[] = [];
  for (let i = 0; i < 5; i++) {
    const c = await adm.json('POST', '/api/admin/candidates', { full_name: `Метрика Кандидат ${i}` });
    await adm.json('POST', `/api/admin/candidates/${c.id}/consents`, { purpose: 'transfer_to_employer', consent_text_id: t.id, granted_at: new Date(Date.now() - 1000).toISOString(), method: 'paper' });
    const a = await adm.json('POST', '/api/admin/applications', { vacancy_id: v1.id, candidate_id: c.id });
    apps.push(a.id);
    if (i < 4) pres.push((await adm.json('POST', '/api/admin/presentations', { application_id: a.id })).id);
  }
  // кандидат 5 (индекс 4) только рассматривается внутренне; и один кандидат по второй вакансии
  const extra = await adm.json('POST', '/api/admin/candidates', { full_name: 'Метрика Внутренний' });
  await adm.json('POST', '/api/admin/applications', { vacancy_id: v2.id, candidate_id: extra.id });
  const cl = await inviteClient(adm, C.id, 'owner');
  const d = (i: number, stage: string, reason?: string) => cl.client.json('POST', `/api/client/presentations/${pres[i]}/decision`, { stage, reason });
  await d(0, 'interested'); await d(0, 'interview');
  await d(1, 'interview');
  await d(2, 'rejected', 'Не подходит по опыту');
  await adm.json('POST', `/api/admin/applications/${apps[0]}/stage`, { stage: 'offer' });
  await adm.json('POST', `/api/admin/applications/${apps[0]}/stage`, { stage: 'hired' });
  ctx = { adm, C, v1, v2, cl };
});

describe('Показатели', () => {
  it('клиент: точные значения по правилам расчёта', async () => {
    const m = await ctx.cl.client.json('GET', '/api/client/metrics');
    expect(m).toMatchObject({
      active_vacancies: 1,          // вторая на паузе
      processed_candidates: 6,      // 5 по первой + 1 по второй, включая непредставленных
      presented: 4, presented_unique: 4,
      awaiting_client: 1,           // кандидат 3 ещё без решения
      in_progress: 1,               // кандидат 1 на интервью
      current_interview: 1,
      reached_interested: 2,        // 0 и 1 (интервью сразу считается как пройденный интерес)
      reached_interview: 2, reached_offer: 1, reached_hired: 1, rejected: 1,
    });
    expect(m.conversions).toEqual({ offered_to_interested: 50, interested_to_interview: 100, interview_to_offer: 50, offer_to_hired: 100 });
    expect(m.reject_reasons).toEqual([{ reason: 'Не подходит по опыту', count: 1 }]);
    expect(m.avg_days_to_first).toBeGreaterThanOrEqual(0);
  });

  it('фильтр по вакансии и периоду', async () => {
    const byV2 = await ctx.cl.client.json('GET', `/api/client/metrics?vacancy_id=${ctx.v2.id}`);
    expect(byV2).toMatchObject({ presented: 0, processed_candidates: 1, active_vacancies: 0 });
    const future = await ctx.cl.client.json('GET', '/api/client/metrics?from=2099-01-01');
    expect(future.presented).toBe(0);
  });

  it('администратор: те же цифры по компании и общая сводка включает её', async () => {
    const m = await ctx.adm.json('GET', `/api/admin/metrics?company_id=${ctx.C.id}`);
    expect(m.presented).toBe(4);
    expect(m.reached_hired).toBe(1);
    const all = await ctx.adm.json('GET', '/api/admin/metrics');
    expect(all.presented).toBeGreaterThanOrEqual(4);
  });

  it('после смены этапа показатели обновляются при следующем запросе', async () => {
    const before = (await ctx.cl.client.json('GET', '/api/client/metrics')).awaiting_client;
    const list = await ctx.cl.client.json('GET', '/api/client/presentations');
    const waiting = list.find((p: any) => p.stage === 'offered');
    await ctx.cl.client.json('POST', `/api/client/presentations/${waiting.presentation_id}/decision`, { stage: 'interested' });
    const after = await ctx.cl.client.json('GET', '/api/client/metrics');
    expect(after.awaiting_client).toBe(before - 1);
    expect(after.reached_interested).toBe(3);
  });
});
