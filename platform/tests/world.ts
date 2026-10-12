// Вымышленный набор данных для тестов изоляции, согласий и файлов.
// Компании A и B. Кандидат X представлен обеим, Y только A (согласие только для A), Z только B
// и при этом рассматривается по вакансии A внутренне (без представления).
import { admin, Client, inviteClient, makePdf } from './helpers';

export type World = Awaited<ReturnType<typeof buildWorld>>;

export async function buildWorld(tag: string) {
  const { client: adm } = await admin();
  const A = await adm.json('POST', '/api/admin/companies', { name: `Альфа ${tag}`, sphere: 'Строительство' });
  const B = await adm.json('POST', '/api/admin/companies', { name: `Бета ${tag}`, sphere: 'Домашний персонал' });
  const vA = await adm.json('POST', '/api/admin/vacancies', { company_id: A.id, title: `Ассистент ${tag}`, status: 'searching' });
  const vB = await adm.json('POST', '/api/admin/vacancies', { company_id: B.id, title: `Секретная вакансия Беты ${tag}`, status: 'searching' });

  const texts = await adm.json('GET', '/api/admin/consent-texts');
  const ensureText = async (purpose: string) => texts.find((t: any) => t.purpose === purpose)
    ?? adm.json('POST', '/api/admin/consent-texts', { purpose, version: `test-${purpose}-${tag}`, body: 'Тестовый текст согласия для автотестов, не юридический документ.', effective_from: '2026-01-01' });
  const tTransfer = await ensureText('transfer_to_employer');
  const tVideo = await ensureText('video_photo');

  const cand = (full_name: string, phone: string) => adm.json('POST', '/api/admin/candidates', { full_name, phone, city: 'Москва', birth_year: 1990, experience_summary: 'Тестовый опыт' });
  const X = await cand(`Иксова Тест ${tag}`, '+70000000001');
  const Y = await cand(`Игрекова Тест ${tag}`, '+70000000002');
  const Z = await cand(`Зетова Тест ${tag}`, '+70000000003');
  const granted = new Date(Date.now() - 86400_000).toISOString();
  const consent = (c: any, extra: object = {}) => adm.json('POST', `/api/admin/candidates/${c.id}/consents`, { purpose: 'transfer_to_employer', consent_text_id: tTransfer.id, granted_at: granted, method: 'paper', ...extra });
  const cX = await consent(X);
  const cY = await consent(Y, { scope_company_id: A.id });
  const cZ = await consent(Z);
  const cXvideo = await adm.json('POST', `/api/admin/candidates/${X.id}/consents`, { purpose: 'video_photo', consent_text_id: tVideo.id, granted_at: granted, method: 'paper' });

  const resume: Record<string, string> = {};
  for (const c of [X, Y, Z]) {
    const r = await adm.upload(`/api/admin/candidates/${c.id}/files`, makePdf(c.full_name), 'resume.pdf');
    if (r.status !== 200) throw new Error('upload ' + (await r.text()));
    resume[c.id] = (await r.json()).id;
  }
  await adm.json('POST', `/api/admin/candidates/${X.id}/links`, { kind: 'video', url: 'https://disk.yandex.ru/i/test-video-x', title: 'Видео-визитка' });
  await adm.json('POST', `/api/admin/candidates/${X.id}/notes`, { body: `ВНУТРЕННЯЯ-ЗАМЕТКА-${tag}` });

  const app = (v: any, c: any) => adm.json('POST', '/api/admin/applications', { vacancy_id: v.id, candidate_id: c.id });
  const aXA = await app(vA, X), aYA = await app(vA, Y), aXB = await app(vB, X), aZB = await app(vB, Z), aZA = await app(vA, Z);
  const present = (a: any, perms: object) => adm.json('POST', '/api/admin/presentations', { application_id: a.id, client_comment: `Комментарий ${tag}`, analysis: { who: 'Тест', opinion: 'Рекомендуем' }, ...perms });
  const pXA = await present(aXA, { can_view_resume: true, can_download_resume: false, resume_file_id: resume[X.id] });
  const pYA = await present(aYA, { can_view_resume: true, resume_file_id: resume[Y.id] });
  const pXB = await present(aXB, { can_view_resume: true, can_download_resume: true, can_view_video: true, can_view_contacts: true, resume_file_id: resume[X.id] });
  const pZB = await present(aZB, {});

  const a1 = await inviteClient(adm, A.id, 'owner');
  const a2 = await inviteClient(adm, A.id, 'viewer');
  const b1 = await inviteClient(adm, B.id, 'member');
  return { adm, resume, A, B, vA, vB, X, Y, Z, cX, cY, cZ, cXvideo, tTransfer, aXA, aYA, aXB, aZB, aZA, pXA, pYA, pXB, pZB, a1, a2, b1 };
}

export const anon = () => new Client();
