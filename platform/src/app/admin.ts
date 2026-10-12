// Кабинет администратора: экраны демоверсии на реальных данных.
/* eslint-disable @typescript-eslint/no-explicit-any */
import QRCode from 'qrcode';
import {
  ALL_STAGES, api, applyErrors, checked, closeModal, daysBetween, dn, emptyHTML, esc, fmtD, fmtDT, fmtRel, funnelHTML, initials, kpi,
  miniFunnel, openModal, opt, pill, qs, reasonsHTML, showApiError, sizeMb, ST, stagePill, toast, val, vacPill, VAC_STATUS,
} from './core';
import { hooks, S, type Handlers } from './state';
import { passwordPanel } from './client';
import { openPdf } from './viewer';

const PURPOSE: Record<string, string> = { pool_storage: 'Хранение в базе кандидатов', transfer_to_employer: 'Передача работодателю', video_photo: 'Видео и фото' };
const METHOD: Record<string, string> = { site_form: 'Форма на сайте', paper: 'Письменно', email: 'По почте', other: 'Другое', phone: 'По телефону' };
const ROLE: Record<string, string> = { owner: 'Руководитель', member: 'Сотрудник', viewer: 'Просмотр' };
const POOL: Record<string, string> = { new: 'Новый', checked: 'Проверен', offered: 'Предложен', employed: 'Работает', reserve: 'В резерве' };
const SOURCE: Record<string, string> = { manual: 'Добавлен вручную', site: 'Сайт', base: 'База ИКР', referral: 'Рекомендация', other: 'Другое' };
const field = (id: string, label: string, input: string, full = false) => `<div class="field${full ? ' full' : ''}"><label for="${id}">${label}</label>${input}<span class="err" id="${id}-err"></span></div>`;
const inp = (id: string, v = '', attrs = '') => `<input class="input" id="${id}" value="${esc(v)}" ${attrs}>`;

// ---------- Дашборд ----------
async function tDash() {
  const d = S.dash;
  const [companies, vacancies, m, rows] = await Promise.all([
    api.get('/api/admin/companies'), api.get('/api/admin/vacancies' + qs({ company_id: d.company })),
    api.get('/api/admin/metrics' + qs({ company_id: d.company, vacancy_id: d.vacancy, from: d.from, to: d.to })),
    api.get('/api/admin/metrics/by-company' + qs({ from: d.from, to: d.to })),
  ]);
  const filters = '<div class="toolbar">' +
    `<select class="select" id="df-company" data-change="dash" data-k="company" aria-label="Компания">${opt('', 'Все компании')}${companies.map((c: any) => opt(c.id, c.name, d.company === c.id)).join('')}</select>` +
    `<select class="select" id="df-vacancy" data-change="dash" data-k="vacancy" aria-label="Вакансия">${opt('', 'Все вакансии')}${vacancies.map((v: any) => opt(v.id, `${v.title} · ${v.company_name}`, d.vacancy === v.id)).join('')}</select>` +
    `<label class="small muted" for="df-from">с</label><input class="input" type="date" id="df-from" data-change="dash" data-k="from" value="${esc(d.from)}" style="max-width:170px">` +
    `<label class="small muted" for="df-to">по</label><input class="input" type="date" id="df-to" data-change="dash" data-k="to" value="${esc(d.to)}" style="max-width:170px">` +
    (d.company || d.vacancy || d.from || d.to ? '<button class="btn btn-ghost btn-sm" type="button" data-act="dashReset">Сбросить</button>' : '') + '</div>' +
    '<p class="small muted">Период для воронки — дата первого представления кандидата (когорта); «Обработано» — дата добавления к вакансии.</p>';
  return filters +
    '<div class="kpis k5">' + kpi('Активные вакансии', m.active_vacancies, '', true) + kpi('Обработано кандидатов', m.processed_candidates, 'уникальных') +
      kpi('Представлено', m.presented, `${m.presented_unique} уникальных`) + kpi('Ждут решения клиента', m.awaiting_client) + kpi('В работе у клиента', m.in_progress, 'интерес и интервью') +
      kpi('Интервью сейчас', m.current_interview) + kpi('Офферы', m.reached_offer) + kpi('Наймы', m.reached_hired) +
      kpi('До первого кандидата', m.avg_days_to_first != null ? m.avg_days_to_first + ' дн.' : '—', 'среднее по вакансиям') + kpi('Отозвано представлений', m.revoked, 'доступ клиенту закрыт') + '</div>' +
    `<div class="grid2"><section class="panel"><div class="panel-h"><h2>Воронка</h2></div>${m.presented ? funnelHTML(m) : emptyHTML('Нет представлений за период', 'Измените фильтры.')}</section>` +
    `<section class="panel"><div class="panel-h"><h2>Причины отказов</h2></div>${reasonsHTML(m.reject_reasons)}</section></div>` +
    '<section><div class="panel-h"><h2 style="font-size:1.05rem">По клиентам</h2></div>' + (rows.length ? '<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Клиент</th><th class="num-c">Активные вакансии</th><th class="num-c">Обработано</th><th class="num-c">Представлено</th><th class="num-c">Ждут решения</th><th class="num-c">Интервью</th><th class="num-c">Наймы</th></tr></thead><tbody>' +
      rows.map((r: any) => `<tr class="click" data-act="openClient" data-id="${r.id}"><td><b>${esc(r.name)}</b></td><td class="num-c">${r.m.active_vacancies}</td><td class="num-c">${r.m.processed_candidates}</td><td class="num-c">${r.m.presented}</td><td class="num-c">${r.m.awaiting_client ? pill(String(r.m.awaiting_client), 'blue plain') : 0}</td><td class="num-c">${r.m.reached_interview}</td><td class="num-c">${r.m.reached_hired}</td></tr>`).join('') + '</tbody></table></div>'
      : '<div class="panel">' + emptyHTML('Клиентов пока нет', 'Создайте первую компанию в разделе «Клиенты».') + '</div>') + '</section>';
}

// ---------- Клиенты ----------
async function tClients() {
  const list = await api.get('/api/admin/companies');
  return '<div class="toolbar"><button class="btn btn-primary btn-sm" type="button" data-act="companyForm">Новая компания</button></div>' +
    (list.length ? '<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Компания</th><th>Сфера</th><th>Статус</th><th class="num-c">Активные вакансии</th><th class="num-c">Пользователи</th><th>Клиент с</th></tr></thead><tbody>' +
      list.map((c: any) => `<tr class="click" data-act="openClient" data-id="${c.id}"><td><b>${esc(c.name)}</b><div class="tiny muted">${esc(c.contact_name || '')}</div></td><td>${esc(c.sphere || '—')}</td><td>${pill({ active: 'Активный', paused: 'На паузе', archived: 'В архиве' }[c.status as string] ?? c.status, c.status === 'active' ? 'ok' : '')}</td><td class="num-c">${c.active_vacancies}</td><td class="num-c">${c.users}</td><td>${fmtD(c.created_at)}</td></tr>`).join('') + '</tbody></table></div>'
      : '<div class="panel">' + emptyHTML('Компаний пока нет', 'Создайте компанию, затем пригласите контактное лицо.') + '</div>');
}
const companyFields = (c: any = {}) => '<div class="fgrid">' + field('co-name', 'Название', inp('co-name', c.name), true) + field('co-sphere', 'Сфера', inp('co-sphere', c.sphere)) + field('co-city', 'Город', inp('co-city', c.city)) +
  field('co-contact_name', 'Контактное лицо', inp('co-contact_name', c.contact_name)) + field('co-phone', 'Телефон', inp('co-phone', c.phone)) + field('co-email', 'Почта', inp('co-email', c.email, 'type="email"')) +
  field('co-status', 'Статус', `<select class="select" id="co-status">${[['active', 'Активный'], ['paused', 'На паузе'], ['archived', 'В архиве (доступ клиента закрыт)']].map(([v, l]) => opt(v, l, (c.status ?? 'active') === v)).join('')}</select>`) + '</div>';
const companyBody = () => ({ name: val('co-name'), sphere: val('co-sphere'), city: val('co-city'), contact_name: val('co-contact_name'), phone: val('co-phone'), email: val('co-email'), status: val('co-status') });

async function tClient() {
  const id = S.param;
  const [c, vacancies, m] = await Promise.all([api.get(`/api/admin/companies/${id}`), api.get('/api/admin/vacancies' + qs({ company_id: id })), api.get('/api/admin/metrics' + qs({ company_id: id }))]);
  const tabs: [string, string][] = [['overview', 'Обзор'], ['users', 'Пользователи и приглашения'], ['vacancies', 'Вакансии'], ['history', 'История']];
  let body = '';
  if (S.clientTab === 'overview') {
    body = '<div class="kpis">' + kpi('Активные вакансии', m.active_vacancies) + kpi('Представлено', m.presented) + kpi('Ждут решения', m.awaiting_client) + kpi('Наймы', m.reached_hired) + '</div>' +
      `<div class="grid2"><section class="panel"><div class="panel-h"><h3>Данные компании</h3></div><form id="companyEdit" data-id="${c.id}" novalidate style="display:grid;gap:14px">${companyFields(c)}<div><button class="btn btn-primary btn-sm" type="submit">Сохранить</button></div></form></section>` +
      `<section class="panel"><div class="panel-h"><h3>Воронка</h3></div>${m.presented ? funnelHTML(m) : emptyHTML('Представлений пока нет')}</section></div>`;
  } else if (S.clientTab === 'users') {
    body = '<section class="panel"><div class="panel-h"><h3>Пользователи</h3></div>' + (c.members.length ? '<div class="list">' + c.members.map((u: any) => `<div class="li"><span class="avatar">${initials(u.name)}</span><div class="li-main"><b>${esc(u.name)}</b><span>${esc(u.email)} · ${ROLE[u.role]} · с ${fmtD(u.created_at)}</span></div>${u.revoked_at ? pill('Доступ отозван', 'bad') : u.is_blocked ? pill('Заблокирован', 'bad') : `${pill('Активен', 'ok')}<button class="btn btn-ghost btn-sm" type="button" data-act="revokeMember" data-id="${u.id}" data-name="${esc(u.name)}">Отозвать доступ</button>`}</div>`).join('') + '</div>' : emptyHTML('Пользователей пока нет', 'Отправьте приглашение контактному лицу.')) + '</section>' +
      `<section class="panel"><div class="panel-h"><h3>Пригласить пользователя</h3></div><form id="inviteForm" data-company="${c.id}" novalidate class="fgrid">${field('iv-email', 'Почта', inp('iv-email', '', 'type="email" placeholder="name@company.ru"'))}${field('iv-role', 'Роль', `<select class="select" id="iv-role">${opt('owner', 'Руководитель')}${opt('member', 'Сотрудник', true)}${opt('viewer', 'Только просмотр')}</select>`)}<div class="full"><button class="btn btn-primary btn-sm" type="submit">Отправить приглашение</button><span class="hint" style="margin-left:10px">Ссылка действует 72 часа и срабатывает один раз</span></div></form></section>` +
      '<section class="panel"><div class="panel-h"><h3>Приглашения</h3></div>' + (c.invitations.length ? '<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Почта</th><th>Роль</th><th>Отправлено</th><th>Статус</th><th></th></tr></thead><tbody>' +
        c.invitations.map((i: any) => { const st = i.accepted_at ? ['Принято', 'ok'] : i.revoked_at ? ['Отозвано', 'bad'] : new Date(i.expires_at) < new Date() ? ['Истекло', 'bad'] : ['Ожидает', 'warn'];
          return `<tr><td><b>${esc(i.email)}</b></td><td>${ROLE[i.member_role]}</td><td>${fmtDT(i.created_at)}</td><td>${pill(st[0], st[1])}</td><td>${st[0] === 'Ожидает' ? `<button class="btn btn-ghost btn-sm" type="button" data-act="revokeInv" data-id="${i.id}">Отозвать</button>` : ''}</td></tr>`; }).join('') + '</tbody></table></div>' : '<p class="small muted">Приглашений не было.</p>') + '</section>';
  } else if (S.clientTab === 'vacancies') {
    body = `<div class="toolbar"><button class="btn btn-primary btn-sm" type="button" data-act="vacancyForm" data-company="${c.id}">Новая вакансия</button></div>` + vacancyTable(vacancies);
  } else {
    const ev = await api.get('/api/admin/audit' + qs({ company_id: c.id, limit: '300' }));
    body = ev.length ? auditTable(ev) : '<div class="panel">' + emptyHTML('Событий пока нет') + '</div>';
  }
  return '<button class="back" type="button" data-act="nav" data-sec="clients">← Все клиенты</button>' +
    `<div class="req-top"><div><h2 style="font-size:1.6rem">${esc(c.name)}</h2><div class="muted small">${esc(c.sphere || '')}</div></div>${m.awaiting_client ? pill('ждут решения клиента: ' + m.awaiting_client, 'blue') : ''}</div>` +
    '<div class="tabs" role="tablist">' + tabs.map(([t, l]) => `<button type="button" class="${S.clientTab === t ? 'on' : ''}" data-act="clientTab" data-t="${t}">${l}</button>`).join('') + '</div>' + body;
}

// ---------- Вакансии и кандидаты по вакансии ----------
const vacancyTable = (list: any[]) => list.length ? '<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Вакансия</th><th>Компания</th><th>Статус</th><th class="num-c">Дней в работе</th><th class="num-c">Кандидатов</th><th class="num-c">Представлено</th></tr></thead><tbody>' +
  list.map((v: any) => `<tr class="click" data-act="openVacancy" data-id="${v.id}"><td><b>${esc(v.title)}</b></td><td>${esc(v.company_name)}</td><td>${vacPill(v.status)}</td><td class="num-c">${daysBetween(v.opened_at, v.closed_at ?? new Date())}</td><td class="num-c">${v.candidates}</td><td class="num-c">${v.presented}</td></tr>`).join('') + '</tbody></table></div>'
  : '<div class="panel">' + emptyHTML('Вакансий нет', 'Создайте вакансию в карточке клиента.') + '</div>';
async function tVacancies() {
  const [list, companies] = await Promise.all([api.get('/api/admin/vacancies' + qs({ company_id: S.dash.company })), api.get('/api/admin/companies')]);
  return `<div class="toolbar"><select class="select" id="vf-company" data-change="vacCompany" aria-label="Компания">${opt('', 'Все компании')}${companies.map((c: any) => opt(c.id, c.name, S.dash.company === c.id)).join('')}</select>${companies.length ? '<button class="btn btn-primary btn-sm" style="margin-left:auto" type="button" data-act="vacancyForm">Новая вакансия</button>' : ''}</div>` + vacancyTable(list);
}
function stageSelect(app: any) {
  return `<select class="stage-sel" id="st-${app.id}" data-change="stage" data-id="${app.id}" aria-label="Этап">` + ALL_STAGES.map((s) =>
    opt(s, ST(s) + (s === 'offered' && app.stage !== 'offered' ? ' (через представление)' : ''), s === app.stage, s === 'offered' && app.stage !== 'offered')).join('') + '</select>';
}
async function tVacancy() {
  const v = await api.get(`/api/admin/vacancies/${S.param}`);
  const rows = v.applications.map((a: any) => {
    const p = a.presentation;
    const perms = p ? [p.can_view_resume && 'резюме', p.can_download_resume && 'скачивание', p.can_view_video && 'видео', p.can_view_contacts && 'контакты'].filter(Boolean).join(', ') || 'без файлов и контактов' : '';
    return `<tr><td><button class="linkbtn" type="button" data-act="openCandidate" data-id="${a.candidate_id}">${esc(a.full_name)}</button><div class="tiny muted">${esc(a.city || '')}</div></td>` +
      `<td>${stageSelect(a)}${a.stage === 'rejected' && a.reject_reason ? `<div class="tiny muted" style="margin-top:4px">${esc(a.reject_reason)}</div>` : ''}</td>` +
      `<td>${p ? `${pill('Показан ' + fmtD(p.presented_at), 'ok plain')}<div class="tiny muted">${esc(perms)}</div>` : '<span class="small muted">не показан</span>'}</td>` +
      `<td class="num-c">${a.feedback_count}</td><td style="text-align:right;white-space:nowrap">` +
      (p ? `<button class="btn btn-ghost btn-sm" type="button" data-act="presentForm" data-app="${a.id}" data-cand="${a.candidate_id}" data-pres="${p.id}">Доступ клиента</button> <button class="btn btn-danger btn-sm" type="button" data-act="revokePres" data-id="${p.id}">Отозвать</button>`
        : !['hired', 'rejected'].includes(a.stage) ? `<button class="btn btn-soft btn-sm" type="button" data-act="presentForm" data-app="${a.id}" data-cand="${a.candidate_id}">Показать клиенту</button>` : '') +
      ` <button class="btn btn-ghost btn-sm" type="button" data-act="history" data-id="${a.id}" data-name="${esc(a.full_name)}">История</button></td></tr>`;
  }).join('');
  return '<button class="back" type="button" data-act="nav" data-sec="vacancies">← Все вакансии</button>' +
    `<div class="req-top"><div><h2 style="font-size:1.6rem">${esc(v.title)}</h2><div class="muted small"><button class="linkbtn" type="button" data-act="openClient" data-id="${v.company_id}">${esc(v.company_name)}</button> · открыта ${fmtD(v.opened_at)} · ${dn(daysBetween(v.opened_at, v.closed_at ?? new Date()))}</div>${v.requirements ? `<p class="small" style="margin-top:6px">${esc(v.requirements)}</p>` : ''}</div>` +
    `<select class="stage-sel" id="vs-${v.id}" data-change="vacStatus" data-id="${v.id}" aria-label="Статус вакансии">${Object.entries(VAC_STATUS).map(([k, [l]]) => opt(k, l, k === v.status)).join('')}</select></div>` +
    miniFunnel(v.metrics) +
    `<div class="toolbar"><button class="btn btn-primary btn-sm" type="button" data-act="addToVacancy" data-id="${v.id}">Добавить кандидата из пула</button><span class="small muted">Этап «${esc(ST('offered'))}» ставится показом клиенту. Решения «${esc(ST('interested'))}» и «${esc(ST('interview'))}» обычно принимает клиент; если ставите их вы, в истории будет отметка «за клиента».</span></div>` +
    (v.applications.length ? `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Кандидат</th><th>Этап</th><th>Клиенту</th><th class="num-c">Отзывы</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>` : '<div class="panel">' + emptyHTML('Кандидатов пока нет', 'Добавьте кандидата из пула.') + '</div>');
}

// ---------- Пул и карточка кандидата ----------
async function tPool() {
  const list = await api.get('/api/admin/candidates' + qs({ q: S.poolQ }));
  return `<div class="toolbar"><input class="input" id="pl-q" type="search" placeholder="Имя или город" value="${esc(S.poolQ)}" data-input="poolQ" aria-label="Поиск по пулу"><button class="btn btn-primary btn-sm" style="margin-left:auto" type="button" data-act="candidateForm">Новый кандидат</button></div>` +
    (list.length ? '<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Кандидат</th><th>Город</th><th>Источник</th><th>Статус</th><th>Резюме</th><th>Согласие на передачу</th><th>Добавлен</th></tr></thead><tbody>' +
      list.map((c: any) => `<tr class="click" data-act="openCandidate" data-id="${c.id}"><td><b>${esc(c.full_name)}</b>${c.anonymized_at ? ' ' + pill('обезличен', 'bad plain') : ''}</td><td>${esc(c.city || '—')}</td><td>${SOURCE[c.source] ?? c.source}</td><td>${pill(POOL[c.pool_status] ?? c.pool_status)}</td><td>${c.has_resume ? 'есть' : '—'}</td><td>${c.can_transfer ? '<span class="yes">есть</span>' : '<span class="no">нет</span>'}</td><td>${fmtRel(c.created_at)}</td></tr>`).join('') + '</tbody></table></div>'
      : '<div class="panel">' + emptyHTML(S.poolQ ? 'Никого не нашли' : 'Пул пуст', S.poolQ ? 'Измените запрос.' : 'Добавьте первого кандидата.') + '</div>');
}
const candidateFields = (c: any = {}) => '<div class="fgrid">' + field('cd-full_name', 'Имя и фамилия', inp('cd-full_name', c.full_name), true) +
  field('cd-birth_year', 'Год рождения', inp('cd-birth_year', c.birth_year ?? '', 'inputmode="numeric"')) + field('cd-city', 'Город', inp('cd-city', c.city)) +
  field('cd-direction', 'Направление', inp('cd-direction', c.direction)) + field('cd-salary_expectation', 'Ожидания по доходу', inp('cd-salary_expectation', c.salary_expectation)) +
  field('cd-phone', 'Телефон', inp('cd-phone', c.phone)) + field('cd-email', 'Почта', inp('cd-email', c.email, 'type="email"')) + field('cd-telegram', 'Telegram', inp('cd-telegram', c.telegram)) +
  field('cd-source', 'Источник', `<select class="select" id="cd-source">${Object.entries(SOURCE).map(([k, l]) => opt(k, l, (c.source ?? 'manual') === k)).join('')}</select>`) +
  field('cd-experience_summary', 'Опыт кратко', `<textarea class="textarea" id="cd-experience_summary">${esc(c.experience_summary ?? '')}</textarea>`, true) + '</div>';
const candidateBody = () => { const by = val('cd-birth_year'); return { full_name: val('cd-full_name'), birth_year: by ? +by : null, city: val('cd-city'), direction: val('cd-direction'), salary_expectation: val('cd-salary_expectation'), phone: val('cd-phone'), email: val('cd-email'), telegram: val('cd-telegram'), source: val('cd-source'), experience_summary: val('cd-experience_summary') }; };

async function tCandidate() {
  const [c, texts, vacancies] = await Promise.all([api.get(`/api/admin/candidates/${S.param}`), api.get('/api/admin/consent-texts'), api.get('/api/admin/vacancies')]);
  const files = c.files.length ? '<div class="list">' + c.files.map((f: any) => `<div class="li" style="flex-wrap:wrap"><span class="ft pill plain">${f.kind === 'resume_pdf' ? 'Резюме' : f.kind === 'photo' ? 'Фото' : 'Документ'}</span><div class="li-main" style="flex-basis:60%"><b title="${esc(f.original_name)}">${esc(f.original_name)}</b><span>${sizeMb(f.size_bytes)}${f.page_count ? ' · ' + f.page_count + ' стр.' : ''} · ${fmtRel(f.created_at)} · ${f.scan_status === 'clean' ? 'проверен антивирусом' : f.scan_status === 'not_scanned' ? 'антивирусная проверка выключена' : esc(f.scan_status)}</span></div>` +
    `<div class="actions" style="margin-left:auto">${f.mime === 'application/pdf' ? `<button class="btn btn-ghost btn-sm" type="button" data-act="viewFile" data-id="${f.id}" data-name="${esc(f.original_name)}">Открыть</button>` : ''}<a class="btn btn-ghost btn-sm" href="/api/admin/files/${f.id}?download=1" download>Скачать</a><button class="btn btn-danger btn-sm" type="button" data-act="deleteFile" data-id="${f.id}">Удалить</button></div></div>`).join('') + '</div>' : '<p class="small muted">Файлов нет.</p>';
  const links = (c.links.length ? '<div class="list">' + c.links.map((l: any) => `<div class="li"><div class="li-main"><b>${esc(l.title || (l.kind === 'video' ? 'Видео' : l.kind === 'yandex_disk' ? 'Яндекс Диск' : 'Ссылка'))}</b><span style="user-select:all">${esc(l.url)}</span></div><button class="btn btn-danger btn-sm" type="button" data-act="deleteLink" data-id="${l.id}">Удалить</button></div>`).join('') + '</div>' : '<p class="small muted">Ссылок нет.</p>') +
    `<form id="linkForm" data-id="${c.id}" novalidate class="fgrid" style="margin-top:10px">${field('ln-kind', 'Тип', `<select class="select" id="ln-kind">${opt('video', 'Видео')}${opt('yandex_disk', 'Яндекс Диск')}${opt('other', 'Другое')}</select>`)}${field('ln-title', 'Название', inp('ln-title', '', 'placeholder="Видео-визитка"'))}${field('ln-url', 'Ссылка', inp('ln-url', '', 'placeholder="https://disk.yandex.ru/…"'), true)}<div class="full"><button class="btn btn-soft btn-sm" type="submit">Добавить ссылку</button><span class="hint" style="margin-left:10px">Клиент увидит ссылку, только если в представлении разрешено видео. Проверьте, что доступ по ссылке ограничен.</span></div></form>`;
  const consents = (c.consents.length ? '<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Цель</th><th>Текст</th><th>Получено</th><th>Способ</th><th>Для компании</th><th>Статус</th><th></th></tr></thead><tbody>' +
    c.consents.map((k: any) => `<tr><td>${PURPOSE[k.purpose]}</td><td>версия ${esc(k.text_version)}</td><td>${fmtD(k.granted_at)}</td><td>${METHOD[k.method]}</td><td>${esc(k.scope_company_name || 'любой работодатель')}</td><td>${k.withdrawn_at ? pill('Отозвано ' + fmtD(k.withdrawn_at), 'bad') : pill('Действует', 'ok')}</td><td>${k.withdrawn_at ? '' : `<button class="btn btn-ghost btn-sm" type="button" data-act="withdrawForm" data-id="${k.id}">Зафиксировать отзыв</button>`}</td></tr>`).join('') + '</tbody></table></div>'
    : '<div class="notice">Согласий нет. Без согласия на передачу работодателю кандидата нельзя показать клиенту.</div>') +
    (texts.length ? `<button class="btn btn-soft btn-sm" style="margin-top:10px" type="button" data-act="consentForm" data-id="${c.id}">Зафиксировать согласие</button>` : '<p class="small muted" style="margin-top:10px">Сначала добавьте текст согласия в разделе «Безопасность и согласия».</p>');
  const notes = `<form id="noteForm" data-id="${c.id}" novalidate style="display:grid;gap:8px">${field('nt-body', 'Новая заметка (клиенты не видят)', '<textarea class="textarea" id="nt-body"></textarea>')}<div><button class="btn btn-soft btn-sm" type="submit">Добавить заметку</button></div></form>` +
    (c.notes.length ? '<div class="list" style="margin-top:8px">' + c.notes.map((n: any) => `<div class="li"><div class="li-main"><b style="white-space:normal">${esc(n.body)}</b><span>${esc(n.author || '')} · ${fmtRel(n.created_at)}</span></div></div>`).join('') + '</div>' : '');
  const apps = (c.applications.length ? '<div class="list">' + c.applications.map((a: any) => `<div class="li"><div class="li-main"><b>${esc(a.vacancy_title)}</b><span>${esc(a.company_name)} · ${a.presentation ? 'показан клиенту ' + fmtD(a.presentation.presented_at) : 'клиенту не показан'}</span></div>${stagePill(a.stage)}<button class="btn btn-ghost btn-sm" type="button" data-act="openVacancy" data-id="${a.vacancy_id}">К вакансии</button></div>`).join('') + '</div>' : '<p class="small muted">Не рассматривался ни по одной вакансии.</p>') +
    `<form id="appForm" data-id="${c.id}" novalidate style="display:flex;gap:8px;flex-wrap:wrap;margin-top:10px"><select class="select" id="ap-vacancy" style="width:auto;flex:1;min-width:220px" aria-label="Вакансия">${opt('', 'Добавить к вакансии…')}${vacancies.filter((v: any) => !['closed', 'cancelled'].includes(v.status) && !c.applications.some((a: any) => a.vacancy_id === v.id)).map((v: any) => opt(v.id, `${v.title} · ${v.company_name}`)).join('')}</select><button class="btn btn-soft btn-sm" type="submit">Добавить</button></form>`;
  return '<button class="back" type="button" data-act="nav" data-sec="pool">← Пул кандидатов</button>' +
    `<div class="req-top"><div style="display:flex;gap:14px;align-items:center"><span class="avatar lg">${initials(c.full_name)}</span><div><h2 style="font-size:1.6rem">${esc(c.full_name)}</h2><div class="muted small">${esc(SOURCE[c.source] ?? '')} · добавлен ${fmtD(c.created_at)}</div></div></div>${pill(POOL[c.pool_status] ?? c.pool_status)}</div>` +
    `<div class="grid2"><section class="panel"><div class="panel-h"><h3>Данные кандидата</h3></div><form id="candidateEdit" data-id="${c.id}" novalidate style="display:grid;gap:14px">${candidateFields(c)}<div><button class="btn btn-primary btn-sm" type="submit">Сохранить</button></div></form></section>` +
    `<div style="display:grid;gap:16px;align-content:start"><section class="panel"><div class="panel-h"><h3>Резюме и файлы</h3></div>${files}<form id="uploadForm" data-id="${c.id}" novalidate style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-top:10px"><select class="select" id="up-kind" style="width:auto" aria-label="Тип файла">${opt('resume_pdf', 'Резюме (PDF)')}${opt('document', 'Документ')}${opt('photo', 'Фото')}</select><input type="file" id="up-file" accept=".pdf,.doc,.docx,.jpg,.jpeg,.png" aria-label="Файл"><button class="btn btn-soft btn-sm" type="submit">Загрузить</button><span class="err" id="up-file-err"></span></form><p class="hint" style="margin-top:6px">Загрузка ничего не открывает клиенту: файл для клиента выбирается в настройке доступа к представлению.</p></section>` +
    `<section class="panel"><div class="panel-h"><h3>Видео и ссылки</h3></div>${links}</section></div></div>` +
    `<section class="panel"><div class="panel-h"><h3>Согласия</h3></div>${consents}</section>` +
    `<div class="grid2"><section class="panel"><div class="panel-h"><h3>Рассмотрение по вакансиям</h3></div>${apps}</section><section class="panel"><div class="panel-h"><h3>Заметки рекрутера</h3></div>${notes}</section></div>`;
}

// ---------- Пользователи и доступы ----------
const MATRIX: [string, string, string, string, string][] = [
  ['Своя компания и её вакансии', 'Просмотр', 'Просмотр', 'Просмотр', 'Все компании, изменение'],
  ['Кандидаты', 'Только представленные компании', 'То же', 'То же', 'Весь пул'],
  ['Решения «Интересен», «Интервью», «Отказ»', 'Да', 'Да', 'Нет', 'Да, с отметкой «за клиента»'],
  ['Отзывы о кандидатах', 'Да', 'Да', 'Нет', 'Просмотр'],
  ['Резюме, видео, контакты', 'По правам представления', 'То же', 'То же', 'Все'],
  ['Заметки рекрутера, согласия, журнал', 'Нет', 'Нет', 'Нет', 'Да'],
  ['Пользователи и приглашения', 'Нет', 'Нет', 'Нет', 'Да'],
  ['Двухфакторная аутентификация', 'По желанию', 'По желанию', 'По желанию', 'Обязательна'],
];
async function tUsers() {
  const tabs = '<div class="tabs">' + [['users', 'Пользователи'], ['staff', 'Пригласить сотрудника'], ['matrix', 'Роли и доступы']].map(([t, l]) => `<button type="button" class="${S.usersTab === t ? 'on' : ''}" data-act="usersTab" data-t="${t}">${l}</button>`).join('') + '</div>';
  if (S.usersTab === 'matrix') return tabs + '<div class="tbl-wrap"><table class="tbl matrix"><thead><tr><th>Действие</th><th>Клиент: руководитель</th><th>Клиент: сотрудник</th><th>Клиент: просмотр</th><th>Администратор</th></tr></thead><tbody>' + MATRIX.map((r) => `<tr><td><b>${esc(r[0])}</b></td>${r.slice(1).map((v) => `<td>${v === 'Нет' ? '<span class="no">Нет</span>' : v === 'Да' ? '<span class="yes">Да</span>' : esc(v)}</td>`).join('')}</tr>`).join('') + '</tbody></table></div><p class="small muted">Права проверяются на сервере и повторно в базе данных. Регистрации нет: доступ только по приглашению.</p>';
  if (S.usersTab === 'staff') return tabs + `<section class="panel"><div class="panel-h"><h3>Пригласить администратора</h3></div><form id="staffForm" novalidate class="fgrid">${field('sf-email', 'Почта', inp('sf-email', '', 'type="email"'))}<div class="full"><button class="btn btn-primary btn-sm" type="submit">Отправить приглашение</button></div></form><p class="small muted" style="margin-top:10px">После входа новый администратор обязан включить двухфакторную аутентификацию. Клиентов приглашайте из карточки компании.</p></section>`;
  const users = await api.get('/api/admin/users');
  return tabs + '<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Пользователь</th><th>Роль и компании</th><th>2FA</th><th>Последний вход</th><th>Сеансы</th><th>Доступ</th><th></th></tr></thead><tbody>' + users.map((u: any) => {
    const roles = u.staff_role === 'admin' ? pill('Администратор', 'warn plain') : u.memberships.filter((m: any) => !m.revoked_at).map((m: any) => `${esc(m.company_name)} (${ROLE[m.role]})`).join(', ') || '<span class="muted">нет доступа</span>';
    const self = u.email === S.me.user.email;
    return `<tr><td><b>${esc(u.name)}</b><div class="tiny muted">${esc(u.email)}</div></td><td>${roles}</td><td>${u.two_factor_enabled ? '<span class="yes">включена</span>' : '<span class="no">нет</span>'}</td><td class="small">${u.last_login_at ? fmtRel(u.last_login_at) : '—'}</td><td class="num-c">${u.active_sessions}</td>` +
      `<td>${self ? '<span class="small muted">это вы</span>' : u.is_blocked ? `${pill('Заблокирован', 'bad')} <button class="btn btn-ghost btn-sm" type="button" data-act="block" data-id="${u.id}" data-b="0">Разблокировать</button>` : `<button class="btn btn-ghost btn-sm" type="button" data-act="blockForm" data-id="${u.id}" data-name="${esc(u.name)}">Заблокировать</button>`}</td>` +
      `<td style="white-space:nowrap">${self ? '' : `${u.active_sessions ? `<button class="btn btn-ghost btn-sm" type="button" data-act="killSessions" data-id="${u.id}">Завершить сеансы</button>` : ''}${u.two_factor_enabled ? ` <button class="btn btn-ghost btn-sm" type="button" data-act="reset2fa" data-id="${u.id}" data-name="${esc(u.name)}">Сбросить 2FA</button>` : ''}`}</td></tr>`;
  }).join('') + '</tbody></table></div>';
}

// ---------- Журнал ----------
const ACTION_GROUPS: [string, string][] = [['', 'Все действия'], ['login', 'Входы'], ['2fa', '2FA'], ['client.', 'Действия клиентов'], ['presentation', 'Представления'], ['application', 'Этапы'], ['consent', 'Согласия'], ['file', 'Файлы'], ['invitation', 'Приглашения'], ['user', 'Пользователи'], ['sessions', 'Сеансы'], ['password', 'Пароли']];
const auditTable = (ev: any[]) => '<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Когда</th><th>Кто</th><th>Действие</th><th>Объект</th></tr></thead><tbody>' +
  ev.map((e: any) => `<tr><td style="white-space:nowrap">${fmtDT(e.at)}</td><td>${esc(e.actor_name || (e.actor_kind === 'public' ? 'Без входа' : 'Система'))}</td><td>${esc(e.action)}</td><td class="tiny muted">${esc(e.entity_type || '')}</td></tr>`).join('') + '</tbody></table></div>';
async function tLog() {
  const [companies, ev] = await Promise.all([api.get('/api/admin/companies'), api.get('/api/admin/audit' + qs({ action: S.logAction, company_id: S.logCompany, limit: '300' }))]);
  return `<div class="toolbar"><select class="select" id="lg-action" data-change="logAction" aria-label="Действие">${ACTION_GROUPS.map(([v, l]) => opt(v, l, S.logAction === v)).join('')}</select><select class="select" id="lg-company" data-change="logCompany" aria-label="Компания">${opt('', 'Все компании')}${companies.map((c: any) => opt(c.id, c.name, S.logCompany === c.id)).join('')}</select><span class="small muted">Последние 300 записей. Журнал только пополняется.</span></div>` +
    (ev.length ? auditTable(ev) : '<div class="panel">' + emptyHTML('Ничего не найдено', 'Измените фильтры.') + '</div>');
}

// ---------- Безопасность и согласия ----------
async function tSecurity() {
  const me = S.me;
  const texts = me.needs2fa ? [] : await api.get('/api/admin/consent-texts');
  const twofa = me.twoFactorEnabled
    ? `<p>Двухфакторная аутентификация <b class="yes">включена</b>. При входе нужен код из приложения или резервный код.</p><form id="backupForm" novalidate style="display:flex;gap:8px;flex-wrap:wrap;align-items:flex-end;margin-top:10px">${field('bk-password', 'Пароль, чтобы получить новые резервные коды', inp('bk-password', '', 'type="password" autocomplete="current-password"'))}<button class="btn btn-ghost btn-sm" type="submit">Новые резервные коды</button></form><p class="hint">Старые коды перестанут работать. Отключить 2FA администратор не может; при потере доступа её сбрасывает другой администратор.</p><div id="tfaOut"></div>`
    : `${me.needs2fa ? '<div class="notice">Чтобы работать в кабинете администратора, включите двухфакторную аутентификацию.</div>' : ''}<form id="tfaStart" novalidate style="display:flex;gap:8px;flex-wrap:wrap;align-items:flex-end;margin-top:10px">${field('tf-password', 'Ваш пароль', inp('tf-password', '', 'type="password" autocomplete="current-password"'))}<button class="btn btn-primary btn-sm" type="submit">Включить 2FA</button></form><div id="tfaOut"></div>`;
  const consentTexts = me.needs2fa ? '' : `<section class="panel"><div class="panel-h"><h2>Тексты согласий</h2></div>` +
    (texts.length ? '<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Цель</th><th>Версия</th><th>Действует с</th><th>Текст</th></tr></thead><tbody>' + texts.map((t: any) => `<tr><td>${PURPOSE[t.purpose]}</td><td>${esc(t.version)}</td><td>${fmtD(t.effective_from)}</td><td class="small" style="max-width:420px">${esc(t.body.slice(0, 160))}${t.body.length > 160 ? '…' : ''}</td></tr>`).join('') + '</tbody></table></div>' : '<p class="small muted">Текстов пока нет.</p>') +
    `<form id="ctForm" novalidate class="fgrid" style="margin-top:12px">${field('ct-purpose', 'Цель', `<select class="select" id="ct-purpose">${Object.entries(PURPOSE).map(([k, l]) => opt(k, l)).join('')}</select>`)}${field('ct-version', 'Версия', inp('ct-version', '', 'placeholder="2026-1"'))}${field('ct-effective_from', 'Действует с', `<input class="input" type="date" id="ct-effective_from">`)}${field('ct-body', 'Текст согласия (согласованный с юристом)', '<textarea class="textarea" id="ct-body" style="min-height:140px"></textarea>', true)}<div class="full"><button class="btn btn-soft btn-sm" type="submit">Добавить версию текста</button><span class="hint" style="margin-left:10px">Версии не меняются после добавления: у каждого согласия хранится ссылка на свою версию.</span></div></form></section>`;
  return `<div class="grid2"><section class="panel"><div class="panel-h"><h2>Двухфакторная аутентификация</h2></div>${twofa}</section>${passwordPanel()}</div>` + consentTexts;
}

export const adminNav = (needs2fa: boolean) => (needs2fa ? [['security', 'Безопасность', 'shield']]
  : [['dash', 'Дашборд', 'dash'], ['clients', 'Клиенты', 'clients'], ['vacancies', 'Вакансии и кандидаты', 'pipe'], ['pool', 'Пул кандидатов', 'pool'], ['users', 'Пользователи и доступы', 'users'], ['log', 'Журнал действий', 'log'], ['security', 'Безопасность и согласия', 'shield']]) as [string, string, string][];
export const adminTitles: Record<string, string> = { dash: 'Дашборд', clients: 'Клиенты', client: 'Карточка клиента', vacancies: 'Вакансии и кандидаты', vacancy: 'Кандидаты по вакансии', pool: 'Пул кандидатов', candidate: 'Карточка кандидата', users: 'Пользователи и доступы', log: 'Журнал действий', security: 'Безопасность и согласия' };
export const adminScreens: Record<string, () => Promise<string>> = { dash: tDash, clients: tClients, client: tClient, vacancies: tVacancies, vacancy: tVacancy, pool: tPool, candidate: tCandidate, users: tUsers, log: tLog, security: tSecurity };

// ---------- Модальные формы ----------
async function presentForm(appId: string, candId: string, presId?: string) {
  const c = await api.get(`/api/admin/candidates/${candId}`);
  const app = c.applications.find((a: any) => a.id === appId);
  const p = presId ? app?.presentation ?? {} : {};
  const resumes = c.files.filter((f: any) => f.kind === 'resume_pdf');
  const an = p.analysis ?? {};
  const cb = (id: string, label: string, on: boolean) => `<label class="check"><input type="checkbox" id="${id}" ${on ? 'checked' : ''}><span>${label}</span></label>`;
  const hasConsent = c.consents.some((k: any) => k.purpose === 'transfer_to_employer' && !k.withdrawn_at && (!k.scope_company_id || k.scope_company_id === app?.company_id));
  openModal((presId ? 'Доступ клиента: ' : 'Показать клиенту: ') + esc(c.full_name),
    (hasConsent ? '' : '<div class="notice">Нет действующего согласия кандидата на передачу данных этому работодателю. Сначала зафиксируйте согласие в карточке кандидата.</div>') +
    `<form id="presForm" data-app="${appId}" data-pres="${presId ?? ''}" novalidate class="fgrid">` +
    field('pr-resume_file_id', 'Файл резюме, который увидит клиент', `<select class="select" id="pr-resume_file_id">${opt('', resumes.length ? 'Не показывать резюме' : 'Резюме не загружено')}${resumes.map((f: any) => opt(f.id, `${f.original_name} · ${fmtD(f.created_at)}`, p.resume_file_id === f.id)).join('')}</select>`, true) +
    `<div class="full" style="display:grid;gap:8px">${cb('pr-can_view_resume', 'Просмотр резюме в карточке', !!p.can_view_resume)}${cb('pr-can_download_resume', 'Скачивание оригинала PDF', !!p.can_download_resume)}${cb('pr-can_view_video', 'Видео и ссылки на Яндекс Диск', !!p.can_view_video)}${cb('pr-can_view_contacts', 'Контакты кандидата', !!p.can_view_contacts)}<span class="err" id="pr-can_view_resume-err"></span></div>` +
    field('pr-client_comment', 'Комментарий рекрутера для клиента', `<textarea class="textarea" id="pr-client_comment">${esc(p.client_comment ?? '')}</textarea>`, true) +
    field('pr-who', 'Кто это', `<textarea class="textarea" id="pr-who">${esc(an.who ?? '')}</textarea>`) + field('pr-drive', 'Что движет', `<textarea class="textarea" id="pr-drive">${esc(an.drive ?? '')}</textarea>`) +
    field('pr-risk', 'Где риски', `<textarea class="textarea" id="pr-risk">${esc(an.risk ?? '')}</textarea>`) + field('pr-horizon', 'Реальный горизонт', inp('pr-horizon', an.horizon ?? '')) +
    field('pr-opinion', 'Наше мнение', `<textarea class="textarea" id="pr-opinion">${esc(an.opinion ?? '')}</textarea>`, true) + '</form>',
    `<button class="btn btn-ghost" type="button" data-act="closeModal">Отмена</button><button class="btn btn-primary" type="submit" form="presForm">${presId ? 'Сохранить доступ' : 'Показать клиенту'}</button>`, 'wide');
}

export const adminActions: Handlers = {
  dashReset: () => { S.dash = { company: '', vacancy: '', from: '', to: '' }; hooks.render(); },
  openClient: (el) => { S.clientTab = 'overview'; hooks.go('client', el.dataset.id!); },
  clientTab: (el) => { S.clientTab = el.dataset.t!; hooks.render(); },
  openVacancy: (el) => { closeModal(); hooks.go('vacancy', el.dataset.id!); },
  openCandidate: (el) => { closeModal(); hooks.go('candidate', el.dataset.id!); },
  usersTab: (el) => { S.usersTab = el.dataset.t!; hooks.render(); },
  companyForm: () => openModal('Новая компания', `<form id="companyNew" novalidate>${companyFields()}</form>`, '<button class="btn btn-ghost" type="button" data-act="closeModal">Отмена</button><button class="btn btn-primary" type="submit" form="companyNew">Создать</button>', 'wide'),
  async vacancyForm(el) {
    const companies = el.dataset.company ? null : await api.get('/api/admin/companies');
    openModal('Новая вакансия', `<form id="vacancyNew" data-company="${el.dataset.company ?? ''}" novalidate class="fgrid">` +
      (companies ? field('vc-company_id', 'Компания', `<select class="select" id="vc-company_id">${opt('', 'Выберите компанию')}${companies.map((c: any) => opt(c.id, c.name, S.dash.company === c.id)).join('')}</select>`, true) : '') +
      field('vc-title', 'Название', inp('vc-title'), true) + field('vc-position_type', 'Тип позиции', inp('vc-position_type', '', 'placeholder="Ассистент, няня…"')) + field('vc-budget', 'Бюджет', inp('vc-budget')) +
      field('vc-status', 'Статус', `<select class="select" id="vc-status">${Object.entries(VAC_STATUS).map(([k, [l]]) => opt(k, l, k === 'searching')).join('')}</select>`) +
      field('vc-requirements', 'Требования', '<textarea class="textarea" id="vc-requirements"></textarea>', true) + '</form>',
      '<button class="btn btn-ghost" type="button" data-act="closeModal">Отмена</button><button class="btn btn-primary" type="submit" form="vacancyNew">Создать</button>', 'wide');
  },
  candidateForm: () => openModal('Новый кандидат', `<form id="candidateNew" novalidate>${candidateFields()}</form><p class="small muted">Только данные, на обработку которых есть основание. Согласие фиксируется в карточке после создания.</p>`, '<button class="btn btn-ghost" type="button" data-act="closeModal">Отмена</button><button class="btn btn-primary" type="submit" form="candidateNew">Создать</button>', 'wide'),
  async addToVacancy(el) {
    const vid = el.dataset.id!;
    const [pool, v] = await Promise.all([api.get('/api/admin/candidates'), api.get(`/api/admin/vacancies/${vid}`)]);
    const taken = new Set(v.applications.map((a: any) => a.candidate_id));
    const free = pool.filter((c: any) => !taken.has(c.id) && !c.anonymized_at);
    openModal('Добавить кандидата к вакансии', free.length ? `<form id="addApp" data-vacancy="${vid}" novalidate>${field('aa-candidate', 'Кандидат', `<select class="select" id="aa-candidate">${opt('', 'Выберите кандидата')}${free.map((c: any) => opt(c.id, `${c.full_name}${c.city ? ' · ' + c.city : ''}${c.can_transfer ? '' : ' · нет согласия на передачу'}`)).join('')}</select>`)}</form><p class="small muted">Кандидат появится на внутреннем этапе «${esc(ST('sourced'))}». Клиент его не увидит, пока вы не покажете его.</p>` : emptyHTML('Свободных кандидатов нет', 'Добавьте кандидата в пул.'),
      free.length ? '<button class="btn btn-ghost" type="button" data-act="closeModal">Отмена</button><button class="btn btn-primary" type="submit" form="addApp">Добавить</button>' : '');
  },
  presentForm: (el) => presentForm(el.dataset.app!, el.dataset.cand!, el.dataset.pres || undefined),
  async revokePres(el) {
    openModal('Отозвать представление', `<p>Клиент сразу перестанет видеть кандидата, его резюме, видео и контакты. Данные кандидата и история сохранятся.</p><form id="revokeForm" data-id="${el.dataset.id}" novalidate>${field('rv-reason', 'Причина', inp('rv-reason', '', 'placeholder="Например, кандидат попросил приостановить"'))}</form>`,
      '<button class="btn btn-ghost" type="button" data-act="closeModal">Отмена</button><button class="btn btn-danger" type="submit" form="revokeForm">Отозвать</button>');
  },
  async history(el) {
    const h = await api.get(`/api/admin/applications/${el.dataset.id}/history`);
    openModal('История: ' + esc(el.dataset.name ?? ''), '<ul class="hist">' + h.history.slice().reverse().map((x: any) => `<li class="${x.to_stage === 'rejected' ? 'rej' : ''}"><span style="color:var(--ink);font-size:.86rem"><b>${esc(ST(x.to_stage))}</b>${x.reason ? ' · ' + esc(x.reason) : ''}${x.on_behalf_of_client ? ' · за клиента' : ''}<br><span>${esc(x.changed_by || 'Система')}</span></span><span>${fmtDT(x.changed_at)}</span></li>`).join('') + '</ul>' +
      '<h3 style="font-size:1rem">Отзывы клиента</h3>' + (h.feedback.length ? '<div class="list">' + h.feedback.map((f: any) => `<div class="li"><div class="li-main"><b style="white-space:normal">${esc(f.body)}</b><span>${esc(f.author)} · ${fmtRel(f.created_at)}${f.rating ? ' · ' + f.rating + ' из 5' : ''}</span></div></div>`).join('') + '</div>' : '<p class="small muted">Отзывов нет.</p>'), '', 'wide');
  },
  viewFile: (el) => openPdf(`/api/admin/files/${el.dataset.id}`, el.dataset.name ?? 'Файл', `Внутренний просмотр · ${S.me.user.email} · ${fmtD(new Date().toISOString())}`, `/api/admin/files/${el.dataset.id}?download=1`),
  async deleteFile(el) { try { await api.del(`/api/admin/files/${el.dataset.id}`); toast('Файл удалён. Если он был открыт клиенту, доступ к нему закрыт.'); hooks.render(); } catch (e) { showApiError(e); } },
  async deleteLink(el) { try { await api.del(`/api/admin/links/${el.dataset.id}`); toast('Ссылка удалена'); hooks.render(); } catch (e) { showApiError(e); } },
  async consentForm(el) {
    const [texts, companies] = await Promise.all([api.get('/api/admin/consent-texts'), api.get('/api/admin/companies')]);
    const now = new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16);
    openModal('Зафиксировать согласие', `<form id="consentNew" data-id="${el.dataset.id}" novalidate class="fgrid">` +
      field('cs-consent_text_id', 'Текст согласия', `<select class="select" id="cs-consent_text_id">${opt('', 'Выберите текст')}${texts.map((t: any) => opt(t.id, `${PURPOSE[t.purpose]} · версия ${t.version}`)).join('')}</select>`, true) +
      field('cs-granted_at', 'Когда получено', `<input class="input" type="datetime-local" id="cs-granted_at" value="${now}" max="${now}">`) +
      field('cs-method', 'Способ', `<select class="select" id="cs-method">${['paper', 'email', 'site_form', 'other'].map((m) => opt(m, METHOD[m])).join('')}</select>`) +
      field('cs-scope_company_id', 'Только для работодателя (для цели «Передача работодателю»)', `<select class="select" id="cs-scope_company_id">${opt('', 'Любой работодатель по согласию')}${companies.map((c: any) => opt(c.id, c.name)).join('')}</select>`, true) +
      field('cs-evidence_note', 'Где хранится подтверждение', inp('cs-evidence_note', '', 'placeholder="Например, скан в папке договоров, письмо от 12.10"'), true) + '</form>',
      '<button class="btn btn-ghost" type="button" data-act="closeModal">Отмена</button><button class="btn btn-primary" type="submit" form="consentNew">Сохранить</button>', 'wide');
  },
  withdrawForm: (el) => openModal('Отзыв согласия', `<div class="notice">Связанные представления закроются сразу: клиенты перестанут видеть кандидата. Данные не удаляются автоматически — хранение и удаление выполняются по согласованным правилам.</div><form id="withdrawNew" data-id="${el.dataset.id}" novalidate class="fgrid">${field('wd-method', 'Как получен отзыв', `<select class="select" id="wd-method">${['email', 'paper', 'phone', 'other'].map((m) => opt(m, METHOD[m])).join('')}</select>`)}${field('wd-note', 'Комментарий', inp('wd-note'))}</form>`,
    '<button class="btn btn-ghost" type="button" data-act="closeModal">Отмена</button><button class="btn btn-danger" type="submit" form="withdrawNew">Зафиксировать отзыв</button>'),
  revokeMember: (el) => openModal('Отозвать доступ', `<p>${esc(el.dataset.name ?? '')} сразу потеряет доступ к данным этой компании.</p>`, `<button class="btn btn-ghost" type="button" data-act="closeModal">Отмена</button><button class="btn btn-danger" type="button" data-act="revokeMemberGo" data-id="${el.dataset.id}">Отозвать</button>`),
  async revokeMemberGo(el) { try { await api.post(`/api/admin/memberships/${el.dataset.id}/revoke`); closeModal(); toast('Доступ отозван'); hooks.render(); } catch (e) { showApiError(e); } },
  async revokeInv(el) { try { await api.post(`/api/admin/invitations/${el.dataset.id}/revoke`); toast('Приглашение отозвано, ссылка больше не работает'); hooks.render(); } catch (e) { showApiError(e); } },
  blockForm: (el) => openModal('Заблокировать пользователя', `<p>${esc(el.dataset.name ?? '')} не сможет войти, все его сеансы завершатся сразу.</p><form id="blockNew" data-id="${el.dataset.id}" novalidate>${field('bl-reason', 'Причина', inp('bl-reason'))}</form>`, '<button class="btn btn-ghost" type="button" data-act="closeModal">Отмена</button><button class="btn btn-danger" type="submit" form="blockNew">Заблокировать</button>'),
  async block(el) { try { await api.post(`/api/admin/users/${el.dataset.id}/block`, { blocked: el.dataset.b === '1' }); toast('Доступ восстановлен'); hooks.render(); } catch (e) { showApiError(e); } },
  async killSessions(el) { try { await api.del(`/api/admin/users/${el.dataset.id}/sessions`); toast('Все сеансы пользователя завершены'); hooks.render(); } catch (e) { showApiError(e); } },
  reset2fa: (el) => openModal('Сбросить 2FA', `<p>Используйте, если ${esc(el.dataset.name ?? '')} потерял(а) и приложение, и резервные коды. Сеансы пользователя завершатся; при следующем входе администратор обязан настроить 2FA заново. Действие записывается в журнал.</p>`, `<button class="btn btn-ghost" type="button" data-act="closeModal">Отмена</button><button class="btn btn-danger" type="button" data-act="reset2faGo" data-id="${el.dataset.id}">Сбросить</button>`),
  async reset2faGo(el) { try { await api.post(`/api/admin/users/${el.dataset.id}/reset-2fa`); closeModal(); toast('2FA сброшена'); hooks.render(); } catch (e) { showApiError(e); } },
};

export const adminChanges: Handlers = {
  dash: (el) => { (S.dash as any)[el.dataset.k!] = (el as HTMLInputElement).value; if (el.dataset.k === 'company') S.dash.vacancy = ''; hooks.render(); },
  vacCompany: (el) => { S.dash.company = (el as HTMLSelectElement).value; hooks.render(); },
  logAction: (el) => { S.logAction = (el as HTMLSelectElement).value; hooks.render(); },
  logCompany: (el) => { S.logCompany = (el as HTMLSelectElement).value; hooks.render(); },
  async vacStatus(el) { try { await api.patch(`/api/admin/vacancies/${el.dataset.id}`, { status: (el as HTMLSelectElement).value }); toast('Статус вакансии обновлён'); } catch (e) { showApiError(e); } hooks.render(); },
  async stage(el) {
    const id = el.dataset.id!, s = (el as HTMLSelectElement).value;
    if (s === 'rejected') {
      const reasons: string[] = (S.me.settings?.reject_reasons_team ?? []).concat(S.me.settings?.reject_reasons_client ?? []);
      openModal(esc(ST('rejected')), `<form id="adminReject" data-id="${id}" novalidate>${field('ar-reason', 'Причина', `<select class="select" id="ar-reason">${opt('', 'Выберите причину')}${reasons.map((r) => opt(r, r)).join('')}</select>`)}${field('ar-note', 'Комментарий', inp('ar-note'))}</form>`,
        '<button class="btn btn-ghost" type="button" data-act="closeModal">Отмена</button><button class="btn btn-danger" type="submit" form="adminReject">Подтвердить</button>');
      hooks.render(); return;
    }
    try { await api.post(`/api/admin/applications/${id}/stage`, { stage: s }); toast(`Этап «${ST(s)}» сохранён. Клиент видит изменение.`); } catch (e) { showApiError(e); }
    hooks.render();
  },
};

export const adminForms: Handlers = {
  async companyNew() { if (!applyErrors('co', { name: val('co-name').length >= 2 ? '' : 'Укажите название' })) return; try { const c = await api.post('/api/admin/companies', companyBody()); closeModal(); toast('Компания создана. Пригласите контактное лицо.'); S.clientTab = 'users'; hooks.go('client', c.id); } catch (e) { showApiError(e, 'co'); } },
  async companyEdit(f) { try { await api.patch(`/api/admin/companies/${f.dataset.id}`, companyBody()); toast('Сохранено'); hooks.render(); } catch (e) { showApiError(e, 'co'); } },
  async inviteForm(f) {
    const email = val('iv-email');
    if (!applyErrors('iv', { email: /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) ? '' : 'Проверьте почту' })) return;
    try { await api.post('/api/admin/invitations', { email, company_id: f.dataset.company, member_role: val('iv-role') }); toast('Приглашение отправлено. Ссылка действует 72 часа.'); hooks.render(); } catch (e) { showApiError(e, 'iv'); }
  },
  async staffForm() {
    const email = val('sf-email');
    if (!applyErrors('sf', { email: /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) ? '' : 'Проверьте почту' })) return;
    try { await api.post('/api/admin/invitations', { email, staff_role: 'admin' }); toast('Приглашение администратору отправлено'); (document.getElementById('sf-email') as HTMLInputElement).value = ''; } catch (e) { showApiError(e, 'sf'); }
  },
  async vacancyNew(f) {
    const company = f.dataset.company || val('vc-company_id');
    if (!applyErrors('vc', { company_id: company ? '' : 'Выберите компанию', title: val('vc-title').length >= 2 ? '' : 'Укажите название' })) return;
    try { const v = await api.post('/api/admin/vacancies', { company_id: company, title: val('vc-title'), position_type: val('vc-position_type'), budget: val('vc-budget'), status: val('vc-status'), requirements: val('vc-requirements') }); closeModal(); toast('Вакансия создана'); hooks.go('vacancy', v.id); } catch (e) { showApiError(e, 'vc'); }
  },
  async candidateNew() { if (!applyErrors('cd', { full_name: val('cd-full_name').length >= 2 ? '' : 'Укажите имя' })) return; try { const c = await api.post('/api/admin/candidates', candidateBody()); closeModal(); toast('Кандидат добавлен'); hooks.go('candidate', c.id); } catch (e) { showApiError(e, 'cd'); } },
  async candidateEdit(f) { try { await api.patch(`/api/admin/candidates/${f.dataset.id}`, candidateBody()); toast('Сохранено'); hooks.render(); } catch (e) { showApiError(e, 'cd'); } },
  async uploadForm(f) {
    const input = document.getElementById('up-file') as HTMLInputElement;
    const file = input.files?.[0];
    if (!applyErrors('up', { file: file ? '' : 'Выберите файл' })) return;
    const fd = new FormData(); fd.set('kind', val('up-kind')); fd.set('file', file!);
    try { await api.post(`/api/admin/candidates/${f.dataset.id}/files`, fd); toast('Файл загружен. Клиенту он не виден, пока вы не выберете его в представлении.'); hooks.render(); } catch (e) { showApiError(e, 'up'); }
  },
  async linkForm(f) {
    const url = val('ln-url');
    if (!applyErrors('ln', { url: /^https:\/\/\S+\.\S+/.test(url) ? '' : 'Ссылка должна начинаться с https://' })) return;
    try { await api.post(`/api/admin/candidates/${f.dataset.id}/links`, { kind: val('ln-kind'), url, title: val('ln-title') }); toast('Ссылка добавлена'); hooks.render(); } catch (e) { showApiError(e, 'ln'); }
  },
  async noteForm(f) { const body = val('nt-body'); if (!applyErrors('nt', { body: body ? '' : 'Напишите заметку' })) return; try { await api.post(`/api/admin/candidates/${f.dataset.id}/notes`, { body }); hooks.render(); } catch (e) { showApiError(e, 'nt'); } },
  async appForm(f) { const v = val('ap-vacancy'); if (!v) { toast('Выберите вакансию'); return; } try { await api.post('/api/admin/applications', { vacancy_id: v, candidate_id: f.dataset.id }); toast('Кандидат добавлен к вакансии'); hooks.render(); } catch (e) { showApiError(e); } },
  async addApp(f) { const c = val('aa-candidate'); if (!applyErrors('aa', { candidate: c ? '' : 'Выберите кандидата' })) return; try { await api.post('/api/admin/applications', { vacancy_id: f.dataset.vacancy, candidate_id: c }); closeModal(); toast('Кандидат добавлен'); hooks.render(); } catch (e) { showApiError(e); } },
  async presForm(f) {
    const body: any = {
      resume_file_id: val('pr-resume_file_id') || null, can_view_resume: checked('pr-can_view_resume'), can_download_resume: checked('pr-can_download_resume'),
      can_view_video: checked('pr-can_view_video'), can_view_contacts: checked('pr-can_view_contacts'), client_comment: val('pr-client_comment'),
      analysis: { who: val('pr-who'), drive: val('pr-drive'), risk: val('pr-risk'), horizon: val('pr-horizon'), opinion: val('pr-opinion') },
    };
    if (!applyErrors('pr', { resume_file_id: body.can_view_resume && !body.resume_file_id ? 'Выберите файл или снимите «Просмотр резюме»' : '', can_view_resume: body.can_download_resume && !body.can_view_resume ? 'Скачивание возможно только вместе с просмотром' : '' })) return;
    try {
      if (f.dataset.pres) await api.patch(`/api/admin/presentations/${f.dataset.pres}`, body);
      else await api.post('/api/admin/presentations', { application_id: f.dataset.app, ...body });
      closeModal(); toast(f.dataset.pres ? 'Доступ клиента обновлён' : 'Кандидат показан клиенту'); hooks.render();
    } catch (e) { showApiError(e, 'pr'); }
  },
  async revokeForm(f) { try { await api.post(`/api/admin/presentations/${f.dataset.id}/revoke`, { reason: val('rv-reason') || undefined }); closeModal(); toast('Представление отозвано. Клиент больше не видит кандидата.'); hooks.render(); } catch (e) { showApiError(e); } },
  async adminReject(f) {
    const reason = val('ar-reason'), note = val('ar-note');
    if (!applyErrors('ar', { reason: reason ? '' : 'Выберите причину' })) return;
    try { await api.post(`/api/admin/applications/${f.dataset.id}/stage`, { stage: 'rejected', reason: reason + (note ? ': ' + note : '') }); closeModal(); toast('Отказ сохранён'); hooks.render(); } catch (e) { showApiError(e); }
  },
  async consentNew(f) {
    const textId = val('cs-consent_text_id'), at = val('cs-granted_at');
    if (!applyErrors('cs', { consent_text_id: textId ? '' : 'Выберите текст', granted_at: at ? '' : 'Укажите дату' })) return;
    const texts = await api.get('/api/admin/consent-texts');
    const t = texts.find((x: any) => x.id === textId);
    try {
      await api.post(`/api/admin/candidates/${f.dataset.id}/consents`, { purpose: t.purpose, consent_text_id: textId, granted_at: new Date(at).toISOString(), method: val('cs-method'), scope_company_id: t.purpose === 'transfer_to_employer' ? val('cs-scope_company_id') || null : null, evidence_note: val('cs-evidence_note') });
      closeModal(); toast('Согласие зафиксировано'); hooks.render();
    } catch (e) { showApiError(e, 'cs'); }
  },
  async withdrawNew(f) { try { const r = await api.post(`/api/admin/consents/${f.dataset.id}/withdraw`, { method: val('wd-method'), note: val('wd-note') }); closeModal(); toast(`Отзыв зафиксирован. Закрыто представлений: ${r.presentations_closed}.`); hooks.render(); } catch (e) { showApiError(e); } },
  async blockNew(f) { try { await api.post(`/api/admin/users/${f.dataset.id}/block`, { blocked: true, reason: val('bl-reason') || undefined }); closeModal(); toast('Пользователь заблокирован, его сеансы завершены'); hooks.render(); } catch (e) { showApiError(e); } },
  async ctForm() {
    if (!applyErrors('ct', { version: val('ct-version') ? '' : 'Укажите версию', effective_from: val('ct-effective_from') ? '' : 'Укажите дату', body: val('ct-body').length >= 20 ? '' : 'Вставьте текст согласия' })) return;
    try { await api.post('/api/admin/consent-texts', { purpose: val('ct-purpose'), version: val('ct-version'), effective_from: val('ct-effective_from'), body: val('ct-body') }); toast('Версия текста добавлена'); hooks.render(); } catch (e) { showApiError(e, 'ct'); }
  },
  async tfaStart() {
    const password = (document.getElementById('tf-password') as HTMLInputElement).value;
    if (!applyErrors('tf', { password: password ? '' : 'Введите пароль' })) return;
    try {
      const r = await api.post('/api/auth/two-factor/enable', { password });
      const secret = new URL(r.totpURI).searchParams.get('secret') ?? '';
      const qr = await QRCode.toDataURL(r.totpURI, { margin: 1, width: 220 });
      document.getElementById('tfaOut')!.innerHTML = `<div style="display:grid;gap:12px;margin-top:14px"><p class="small">1. Отсканируйте код в приложении-аутентификаторе (например, Яндекс Ключ, Google Authenticator) или введите ключ вручную.</p><img src="${qr}" alt="QR-код для приложения-аутентификатора" width="220" height="220" style="border:1px solid var(--line);border-radius:12px"><div class="small">Ключ: <b style="user-select:all;letter-spacing:.05em">${esc(secret)}</b></div>` +
        `<p class="small">2. Сохраните резервные коды в надёжном месте. Каждый код работает один раз, если нет доступа к приложению.</p><div class="quote" style="font-family:ui-monospace,monospace;columns:2">${r.backupCodes.map(esc).join('<br>')}</div>` +
        `<form id="tfaVerify" novalidate style="display:flex;gap:8px;flex-wrap:wrap;align-items:flex-end">${field('tv-code', '3. Код из приложения', inp('tv-code', '', 'inputmode="numeric" autocomplete="one-time-code" maxlength="6"'))}<button class="btn btn-primary btn-sm" type="submit">Подтвердить и включить</button></form></div>`;
      document.getElementById('tv-code')?.focus();
    } catch (e) { showApiError(e, 'tf'); }
  },
  async tfaVerify() {
    const code = val('tv-code');
    if (!applyErrors('tv', { code: /^\d{6}$/.test(code) ? '' : 'Введите 6 цифр' })) return;
    try { await api.post('/api/auth/two-factor/verify-totp', { code }); toast('Двухфакторная аутентификация включена'); location.assign('/app#dash'); location.reload(); } catch (e) { showApiError(e, 'tv'); }
  },
  async backupForm() {
    const password = (document.getElementById('bk-password') as HTMLInputElement).value;
    if (!applyErrors('bk', { password: password ? '' : 'Введите пароль' })) return;
    try { const r = await api.post('/api/auth/two-factor/generate-backup-codes', { password }); document.getElementById('tfaOut')!.innerHTML = `<p class="small" style="margin-top:12px">Новые резервные коды (старые больше не действуют):</p><div class="quote" style="font-family:ui-monospace,monospace;columns:2">${r.backupCodes.map(esc).join('<br>')}</div>`; } catch (e) { showApiError(e, 'bk'); }
  },
};
