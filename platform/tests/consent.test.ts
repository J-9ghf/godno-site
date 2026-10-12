// Согласия и отзыв доступа к представлениям.
import { beforeAll, describe, expect, it } from 'vitest';
import { buildWorld, type World } from './world';

let w: World;
beforeAll(async () => { w = await buildWorld('cons'); });

describe('Согласия', () => {
  it('без согласия на передачу кандидата нельзя представить клиенту', async () => {
    const adm = w.adm;
    const n = await adm.json('POST', '/api/admin/candidates', { full_name: 'Безсогласия Тест', city: 'Тверь' });
    const app = await adm.json('POST', '/api/admin/applications', { vacancy_id: w.vA.id, candidate_id: n.id });
    const r = await adm.post('/api/admin/presentations', { application_id: app.id });
    expect(r.status).toBe(409);
  });

  it('согласие для конкретного работодателя нельзя использовать для другого', async () => {
    const app = await w.adm.json('POST', '/api/admin/applications', { vacancy_id: w.vB.id, candidate_id: w.Y.id });
    expect((await w.adm.post('/api/admin/presentations', { application_id: app.id })).status).toBe(409);
    expect((await w.adm.post('/api/admin/presentations', { application_id: app.id, consent_id: w.cY.id })).status).toBe(409);
  });

  it('скачивание без права просмотра не сохраняется', async () => {
    const r = await w.adm.patch(`/api/admin/presentations/${w.pZB.id}`, { can_view_resume: false, can_download_resume: true });
    expect(r.status).toBe(200);
    expect((await r.json()).can_download_resume).toBe(false);
  });

  it('отзыв согласия сразу закрывает кандидата у всех клиентов, данные кандидата остаются', async () => {
    expect((await w.a1.client.get(`/api/client/presentations/${w.pXA.id}`)).status).toBe(200);
    const r = await w.adm.json('POST', `/api/admin/consents/${w.cX.id}/withdraw`, { method: 'email', note: 'Письмо кандидата' });
    expect(r.presentations_closed).toBe(2);
    for (const [c, p] of [[w.a1.client, w.pXA.id], [w.b1.client, w.pXB.id]] as const) {
      expect((await c.get(`/api/client/presentations/${p}`)).status).toBe(404);
      expect((await c.get(`/api/client/presentations/${p}/resume`)).status).toBe(404);
    }
    const listA = await w.a1.client.json('GET', '/api/client/presentations');
    expect(listA.map((x: any) => x.presentation_id)).toEqual([w.pYA.id]);
    const cand = await w.adm.json('GET', `/api/admin/candidates/${w.X.id}`);
    expect(cand.full_name).toBe(w.X.full_name);
    expect(cand.consents.find((k: any) => k.id === w.cX.id).withdrawn_at).not.toBeNull();
    const audit = await w.adm.json('GET', '/api/admin/audit?action=consent.withdrawn');
    expect(audit.some((e: any) => e.entity_id === w.cX.id)).toBe(true);
    // Повторно представить по отозванному согласию нельзя
    expect((await w.adm.post('/api/admin/presentations', { application_id: w.aXA.id, consent_id: w.cX.id })).status).toBe(409);
  });

  it('отзыв представления администратором закрывает доступ сразу', async () => {
    expect((await w.b1.client.get(`/api/client/presentations/${w.pZB.id}`)).status).toBe(200);
    await w.adm.json('POST', `/api/admin/presentations/${w.pZB.id}/revoke`, { reason: 'Кандидат попросил приостановить' });
    expect((await w.b1.client.get(`/api/client/presentations/${w.pZB.id}`)).status).toBe(404);
  });

  it('отзыв согласия на видео и фото отключает видео в представлениях', async () => {
    const t = await w.adm.json('GET', '/api/admin/consent-texts');
    const tr = t.find((x: any) => x.purpose === 'transfer_to_employer');
    const k = await w.adm.json('POST', `/api/admin/candidates/${w.X.id}/consents`, { purpose: 'transfer_to_employer', consent_text_id: tr.id, granted_at: new Date(Date.now() - 1000).toISOString(), method: 'paper' });
    const p = await w.adm.json('POST', '/api/admin/presentations', { application_id: w.aXB.id, consent_id: k.id, can_view_video: true });
    expect((await w.b1.client.json('GET', `/api/client/presentations/${p.id}`)).links).toHaveLength(1);
    await w.adm.json('POST', `/api/admin/consents/${w.cXvideo.id}/withdraw`, { method: 'phone' });
    expect((await w.b1.client.json('GET', `/api/client/presentations/${p.id}`)).links).toHaveLength(0);
  });
});
