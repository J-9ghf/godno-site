// Кабинет клиента: экраны демоверсии на реальных данных. Клиент видит только свою компанию
// и представленных ей кандидатов; сервер и база проверяют это при каждом запросе.
/* eslint-disable @typescript-eslint/no-explicit-any */
import {
  api, applyErrors, daysBetween, dn, emptyHTML, esc, fmtD, fmtDT, fmtRel, funnelHTML, IC, initials, kpi,
  miniFunnel, openModal, opt, pill, reasonsHTML, showApiError, ST, STAGES, stagePill, toast, val, vacPill,
} from './core';
import { hooks, S, type Handlers } from './state';
import { openPdf } from './viewer';

const canAct = () => S.me.companies.some((c: any) => c.role !== 'viewer');
const company = () => S.me.companies.map((c: any) => c.name).join(', ');

// ---------- Дашборд ----------
async function cDash() {
  const [m, list] = await Promise.all([api.get('/api/client/metrics'), api.get('/api/client/presentations')]);
  const waiting = list.filter((p: any) => p.stage === 'offered');
  return '<div class="kpis k5">' +
      kpi('Активные вакансии', m.active_vacancies, '', true) +
      kpi('Обработано кандидатов', m.processed_candidates, 'уникальных, на всех этапах') +
      kpi('Представлено вам', m.presented, m.presented_unique !== m.presented ? `${m.presented_unique} уникальных` : 'кандидатов') +
      kpi('Ждут вашего решения', m.awaiting_client, `на этапе «${esc(ST('offered'))}»`) +
      kpi('Интервью', m.current_interview, 'сейчас на этапе') +
      kpi('Офферы', m.reached_offer) + kpi('Наймы', m.reached_hired) +
      kpi('До первого кандидата', m.avg_days_to_first != null ? m.avg_days_to_first + ' дн.' : '—', 'в среднем по вакансиям') +
      kpi('Срок закрытия', m.avg_days_to_hire != null ? m.avg_days_to_hire + ' дн.' : '—', 'до выхода сотрудника') +
      kpi('Отказы', m.rejected) +
    '</div><div class="grid2">' +
      `<section class="panel"><div class="panel-h"><h2>Воронка подбора</h2><span class="small muted">переход — доля дошедших до следующего этапа</span></div>${m.presented ? funnelHTML(m) : emptyHTML('Кандидатов пока нет', 'Менеджер добавит первых кандидатов после старта поиска.')}<h3 style="font-size:.95rem;margin:18px 0 6px">Причины отказов</h3>${reasonsHTML(m.reject_reasons)}</section>` +
      `<section class="panel"><div class="panel-h"><h2>Ждут вашего решения</h2>${waiting.length ? '<button class="linkbtn small" type="button" data-act="nav" data-sec="cands">Все кандидаты</button>' : ''}</div>` +
        (waiting.length ? '<div class="list">' + waiting.map((p: any) => `<div class="li"><span class="avatar">${initials(p.full_name)}</span><div class="li-main"><b>${esc(p.full_name)}</b><span>${esc(p.vacancy_title)} · предложен ${fmtRel(p.presented_at)}</span></div><button class="btn btn-soft btn-sm" type="button" data-act="openP" data-id="${p.presentation_id}">Посмотреть</button></div>`).join('') + '</div>'
          : emptyHTML('Решений не ждём', 'Когда менеджер предложит кандидата, он появится здесь.')) +
      '</section></div>';
}

// ---------- Мои кандидаты ----------
function candCard(p: any) {
  const sel = S.cmp.includes(p.presentation_id);
  return `<div class="ccard${sel ? ' sel' : ''}" role="button" tabindex="0" data-act="openP" data-id="${p.presentation_id}">` +
    `<input type="checkbox" class="ccard-cmp" data-act="cmp" data-id="${p.presentation_id}" ${sel ? 'checked' : ''} aria-label="Добавить к сравнению: ${esc(p.full_name)}" title="Сравнить">` +
    `<div class="ccard-top"><span class="avatar">${initials(p.full_name)}</span><div><b>${esc(p.full_name)}</b><span>${p.age ? p.age + ' · ' : ''}${esc(p.city ?? '')}</span></div></div>` +
    `<div class="small" style="color:var(--muted)">${esc(p.vacancy_title)}</div>` +
    `<div class="ccard-meta">${p.can_view_video ? `<span class="pill blue plain">${IC.video} видео</span>` : ''}${p.has_resume ? '<span class="pill plain">резюме</span>' : ''}${p.stage === 'rejected' ? `<span class="pill bad plain">${esc(p.reject_reason || ST('rejected'))}</span>` : `<span>${fmtRel(p.stage_changed_at ?? p.presented_at)}</span>`}</div></div>`;
}
async function cCands() {
  const [vacs, all] = await Promise.all([api.get('/api/client/overview'), api.get('/api/client/presentations')]);
  let rows = S.vac !== 'all' ? all.filter((p: any) => p.vacancy_id === S.vac) : all;
  const toolbar = `<div class="toolbar"><div class="seg"><button type="button" class="${S.candView === 'board' ? 'on' : ''}" data-act="candView" data-v="board">Доска</button><button type="button" class="${S.candView === 'list' ? 'on' : ''}" data-act="candView" data-v="list">Список</button></div>` +
    `<select class="select" id="f-vac" data-change="vac" aria-label="Вакансия">${opt('all', 'Все вакансии', S.vac === 'all')}${vacs.vacancies.map((v: any) => opt(v.id, v.title, S.vac === v.id)).join('')}</select>` +
    (S.candView === 'list' ? `<select class="select" id="f-stage" data-change="stageF" aria-label="Этап">${opt('all', 'Все этапы')}${[...STAGES, 'rejected'].map((s) => opt(s, ST(s), S.stageF === s)).join('')}</select>` +
      `<select class="select" id="f-period" data-change="periodF" aria-label="Дата">${opt('all', 'За всё время')}${opt('7', 'Обновлены за 7 дней', S.periodF === '7')}${opt('30', 'Обновлены за 30 дней', S.periodF === '30')}</select>` : '') +
    '<span class="small muted" style="margin-left:auto">Отметьте 2–4 кандидатов, чтобы сравнить</span></div>';
  if (!all.length) return toolbar + '<div class="panel">' + emptyHTML('Кандидатов пока нет', 'Менеджер добавит первых кандидатов после старта поиска. Обычно это 5–7 рабочих дней.') + '</div>';
  let body: string;
  if (S.candView === 'board') {
    const active = rows.filter((p: any) => p.stage !== 'rejected'), rej = rows.filter((p: any) => p.stage === 'rejected');
    body = '<div class="board">' + STAGES.map((s) => { const list = active.filter((p: any) => p.stage === s);
      return `<div class="col"><div class="col-h">${esc(ST(s))}<span>${list.length}</span></div>${list.length ? list.map(candCard).join('') : '<div class="col-empty">Пока никого</div>'}</div>`; }).join('') + '</div>' +
      `<section class="panel"><div class="panel-h"><h3>${esc(ST('rejected'))} · ${rej.length}</h3></div>${rej.length ? '<div class="rej-row">' + rej.map(candCard).join('') + '</div>' : '<p class="small muted">Отказов нет.</p>'}</section>`;
  } else {
    if (S.stageF !== 'all') rows = rows.filter((p: any) => p.stage === S.stageF);
    if (S.periodF !== 'all') rows = rows.filter((p: any) => daysBetween(p.stage_changed_at ?? p.presented_at) <= +S.periodF);
    body = rows.length ? '<div class="tbl-wrap"><table class="tbl"><thead><tr><th style="width:40px"><span class="sr">Сравнить</span></th><th>Кандидат</th><th>Вакансия</th><th>Этап</th><th>Обновлено</th><th>Видео</th></tr></thead><tbody>' +
      rows.map((p: any) => `<tr class="click" data-act="openP" data-id="${p.presentation_id}"><td><input type="checkbox" class="ccard-cmp" style="position:static" data-act="cmp" data-id="${p.presentation_id}" ${S.cmp.includes(p.presentation_id) ? 'checked' : ''} aria-label="Сравнить"></td><td><b>${esc(p.full_name)}</b><div class="tiny muted">${p.age ? p.age + ' · ' : ''}${esc(p.city ?? '')}</div></td><td>${esc(p.vacancy_title)}</td><td>${stagePill(p.stage)}</td><td>${fmtD(p.stage_changed_at ?? p.presented_at)}</td><td>${p.can_view_video ? 'есть' : '—'}</td></tr>`).join('') +
      '</tbody></table></div>' : '<div class="panel">' + emptyHTML('Под фильтр никто не попал', 'Измените этап или период.', '<button class="btn btn-ghost btn-sm" type="button" data-act="resetCandF">Сбросить фильтры</button>') + '</div>';
  }
  const bar = S.cmp.length ? `<div class="cmpbar"><span>Выбрано для сравнения: ${S.cmp.length} из 4</span><div class="actions"><button class="btn btn-ghost btn-sm" type="button" data-act="cmpClear">Очистить</button><button class="btn btn-primary btn-sm" type="button" data-act="cmpOpen"${S.cmp.length < 2 ? ' disabled title="Выберите минимум двух"' : ''}>Сравнить</button></div></div>` : '';
  return toolbar + body + bar;
}

// Карточка кандидата: разбор, комментарий рекрутера, история этапов, отзывы, решения, видео, резюме
const DECISIONS: Record<string, string[]> = { offered: ['interested', 'interview', 'rejected'], interested: ['interview', 'rejected'], interview: ['rejected'], offer: ['rejected'] };
const a = (an: any, k: string) => esc(an?.[k] || '—');
export async function openPresentation(id: string) {
  let p: any;
  try { p = await api.get(`/api/client/presentations/${id}`); } catch (e) { toast((e as Error).message); return; }
  const allowed = canAct() ? DECISIONS[p.stage] ?? [] : [];
  const contacts = p.can_view_contacts ? [p.phone, p.email, p.telegram].filter(Boolean).map(esc).join('<br>') || '—' : '<span class="muted">менеджер откроет, когда это будет уместно</span>';
  const links = p.links.length ? p.links.map((l: any) => `<a class="btn btn-soft btn-sm" href="${esc(l.url)}" target="_blank" rel="noopener noreferrer">${IC.video} ${esc(l.title || (l.kind === 'video' ? 'Видео-визитка' : 'Яндекс Диск'))}</a>`).join(' ') : '<span class="small muted">Видео не открыто</span>';
  const resume = p.has_resume ? `<div class="actions"><button class="btn btn-primary btn-sm" type="button" data-act="viewResume" data-id="${p.presentation_id}" data-name="${esc(p.full_name)}">Открыть резюме</button>${p.can_download_resume ? `<a class="btn btn-ghost btn-sm" href="/api/client/presentations/${p.presentation_id}/resume?download=1" download>Скачать PDF</a>` : ''}</div>` : '<p class="small muted">Резюме не открыто.</p>';
  const hist = '<ul class="hist">' + p.history.slice().reverse().map((h: any) => `<li class="${h.to_stage === 'rejected' ? 'rej' : ''}"><span style="color:var(--ink);font-size:.86rem"><b>${esc(ST(h.to_stage))}</b>${h.reason ? ' · ' + esc(h.reason) : ''}<br><span>${h.actor_side === 'client' ? esc(h.actor_name || 'Ваша компания') : 'ИКР' + (h.on_behalf_of_client ? ' (по вашему решению)' : '')}</span></span><span>${fmtDT(h.changed_at)}</span></li>`).join('') + '</ul>';
  const fb = p.feedback.length ? '<div class="list">' + p.feedback.map((f: any) => `<div class="li"><div class="li-main"><b style="white-space:normal">${esc(f.body)}</b><span>${esc(f.author)} · ${fmtRel(f.created_at)}${f.rating ? ' · оценка ' + f.rating + ' из 5' : ''}</span></div></div>`).join('') + '</div>' : '<p class="small muted">Отзывов пока нет.</p>';
  const fbForm = canAct() ? `<form id="fbForm" data-id="${p.presentation_id}" novalidate style="display:grid;gap:8px;margin-top:10px"><div class="field"><label for="fb-body">Ваш отзыв о кандидате</label><textarea class="textarea" id="fb-body" placeholder="Впечатление после знакомства, вопросы к рекрутеру"></textarea><span class="err" id="fb-body-err"></span></div><div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap"><select class="select" id="fb-rating" style="width:auto" aria-label="Оценка">${opt('', 'Без оценки')}${[5, 4, 3, 2, 1].map((n) => opt(String(n), 'Оценка ' + n)).join('')}</select><button class="btn btn-soft btn-sm" type="submit">Оставить отзыв</button></div></form>` : '';
  let foot = '';
  if (allowed.includes('interested')) foot += `<button class="btn btn-soft" type="button" data-act="decide" data-id="${p.presentation_id}" data-s="interested">${esc(ST('interested'))}</button>`;
  if (allowed.includes('interview')) foot += `<button class="btn btn-primary" type="button" data-act="decide" data-id="${p.presentation_id}" data-s="interview">${esc(ST('interview'))}</button>`;
  if (allowed.includes('rejected')) foot += `<button class="btn btn-danger" type="button" data-act="rejectForm" data-id="${p.presentation_id}">${esc(ST('rejected'))}</button>`;
  const note = !canAct() ? '<div class="notice info">У вас доступ только для просмотра.</div>'
    : p.stage === 'interview' ? '<div class="notice info">После интервью оставьте отзыв ниже. Оффер оформляет менеджер.</div>'
    : p.stage === 'offer' ? '<div class="notice info">Оффер отправлен кандидату. Менеджер сообщит о его ответе.</div>'
    : p.stage === 'hired' ? '<div class="notice ok">Кандидат вышел на работу.</div>' : '';
  const body = `<div class="dossier-top"><span class="avatar lg">${initials(p.full_name)}</span><div style="flex:1;min-width:0"><div class="small muted">${esc(p.vacancy_title)} · представлен ${fmtD(p.presented_at)}</div></div>${stagePill(p.stage)}</div>${note}` +
    '<div class="cand-grid"><div style="display:grid;gap:16px;align-content:start">' +
      `<div><h3 style="font-size:1rem;margin-bottom:8px">Резюме</h3>${resume}</div><div><h3 style="font-size:1rem;margin-bottom:8px">Видео</h3>${links}</div>` +
      `<dl class="kv"><dt>Возраст</dt><dd>${p.age ?? '—'}</dd><dt>Город</dt><dd>${esc(p.city || '—')}</dd><dt>Направление</dt><dd>${esc(p.direction || '—')}</dd><dt>Опыт</dt><dd>${esc(p.experience_summary || '—')}</dd><dt>Ожидания</dt><dd>${esc(p.salary_expectation || '—')}</dd><dt>Контакты</dt><dd>${contacts}</dd></dl>` +
      `<div class="quote"><b>Комментарий рекрутера</b>${esc(p.client_comment || '—')}</div>` +
    '</div><div style="display:grid;gap:16px;align-content:start">' +
      `<div><h3 style="font-size:1rem;margin-bottom:10px">Разбор</h3><dl class="kv"><dt>Кто это</dt><dd>${a(p.analysis, 'who')}</dd><dt>Что движет</dt><dd>${a(p.analysis, 'drive')}</dd><dt>Где риски</dt><dd>${a(p.analysis, 'risk')}</dd><dt>Горизонт</dt><dd>${a(p.analysis, 'horizon')}</dd><dt>Наше мнение</dt><dd>${a(p.analysis, 'opinion')}</dd></dl></div>` +
      `<div><h3 style="font-size:1rem;margin-bottom:6px">История этапов</h3>${hist}</div>` +
      `<div><h3 style="font-size:1rem;margin-bottom:6px">Отзывы</h3>${fb}${fbForm}</div>` +
    '</div></div>';
  openModal(esc(p.full_name), body, foot, 'wide');
}

async function openCompare() {
  const cards = (await Promise.all(S.cmp.map((id) => api.get(`/api/client/presentations/${id}`).catch(() => null)))).filter(Boolean);
  if (cards.length < 2) { toast('Выберите минимум двух кандидатов'); return; }
  const rows: [string, (p: any) => string][] = [['Вакансия', (p) => esc(p.vacancy_title)], ['Этап', (p) => stagePill(p.stage)], ['Возраст', (p) => p.age ?? '—'], ['Город', (p) => esc(p.city || '—')], ['Опыт', (p) => esc(p.experience_summary || '—')], ['Ожидания', (p) => esc(p.salary_expectation || '—')],
    ['Кто это', (p) => a(p.analysis, 'who')], ['Что движет', (p) => a(p.analysis, 'drive')], ['Где риски', (p) => a(p.analysis, 'risk')], ['Горизонт', (p) => a(p.analysis, 'horizon')], ['Наше мнение', (p) => a(p.analysis, 'opinion')], ['Резюме', (p) => (p.has_resume ? 'есть' : '—')], ['Видео', (p) => (p.links.length ? 'есть' : '—')]];
  openModal('Сравнение кандидатов', '<div class="tbl-wrap"><table class="tbl cmp-tbl"><thead><tr><th></th>' + cards.map((p: any) => `<th><div style="display:flex;gap:10px;align-items:center"><span class="avatar">${initials(p.full_name)}</span><div><b>${esc(p.full_name)}</b><br><button class="linkbtn tiny" type="button" data-act="openP" data-id="${p.presentation_id}">Открыть карточку</button></div></div></th>`).join('') + '</tr></thead><tbody>' +
    rows.map(([l, fn]) => `<tr><td>${l}</td>${cards.map((p: any) => `<td>${fn(p)}</td>`).join('')}</tr>`).join('') + '</tbody></table></div>', '', 'xwide');
}

// ---------- Вакансии ----------
async function cVacancies() {
  const list = await api.get('/api/client/vacancies');
  if (!list.length) return '<div class="panel">' + emptyHTML('Вакансий пока нет', 'Вакансии появляются после согласования заявки с менеджером.') + '</div>';
  return `<p class="muted">Компания: ${esc(company())}</p>` + list.map((v: any) => {
    const closed = ['closed', 'cancelled'].includes(v.status);
    const age = closed && v.closed_at ? 'закрыта ' + fmtD(v.closed_at) : 'в работе ' + dn(daysBetween(v.opened_at));
    return `<section class="panel req-card"><div class="req-top"><div><h3>${esc(v.title)}</h3><div class="small muted">открыта ${fmtD(v.opened_at)} · ${age}</div></div>${vacPill(v.status)}</div>${miniFunnel(v.m)}` +
      `<div class="actions"><button class="btn btn-soft btn-sm" type="button" data-act="toVac" data-id="${v.id}">Кандидаты по вакансии</button>${v.m.awaiting_client ? pill('ждут решения: ' + v.m.awaiting_client, 'blue') : ''}</div></section>`;
  }).join('');
}

// ---------- Профиль ----------
async function cProfile() {
  const me = S.me;
  return `<div class="grid2"><section class="panel"><div class="panel-h"><h2>Ваши данные</h2></div><dl class="kv"><dt>Имя</dt><dd>${esc(me.user.name)}</dd><dt>Почта</dt><dd>${esc(me.user.email)}</dd><dt>Компания</dt><dd>${esc(company())}</dd><dt>Роль</dt><dd>${me.companies.map((c: any) => ({ owner: 'Руководитель', member: 'Сотрудник', viewer: 'Только просмотр' } as any)[c.role]).join(', ')}</dd></dl></section>` +
    passwordPanel() + '</div>' +
    `<section class="panel"><div class="panel-h"><h2>Сеансы</h2></div><p class="small muted">Если вы входили с чужого устройства или подозреваете, что пароль узнали, завершите все сеансы и смените пароль.</p><div class="actions" style="margin-top:10px"><button class="btn btn-ghost btn-sm" type="button" data-act="logoutAll">Выйти на всех устройствах</button></div></section>`;
}
export const passwordPanel = () => `<section class="panel"><div class="panel-h"><h2>Смена пароля</h2></div><form id="pwForm" novalidate style="display:grid;gap:12px">
  <div class="field"><label for="pw-currentPassword">Текущий пароль</label><input class="input" id="pw-currentPassword" type="password" autocomplete="current-password"><span class="err" id="pw-currentPassword-err"></span></div>
  <div class="field"><label for="pw-newPassword">Новый пароль</label><input class="input" id="pw-newPassword" type="password" autocomplete="new-password"><span class="hint">Не короче 10 символов. Остальные сеансы будут завершены.</span><span class="err" id="pw-newPassword-err"></span></div>
  <div><button class="btn btn-primary btn-sm" type="submit">Сменить пароль</button></div></form></section>`;

export const clientNav = () => [['dash', 'Дашборд', 'dash'], ['cands', 'Мои кандидаты', 'cands'], ['vacancies', 'Вакансии', 'reqs'], ['profile', 'Профиль', 'profile']] as [string, string, string][];
export const clientTitles: Record<string, string> = { dash: 'Дашборд', cands: 'Мои кандидаты', vacancies: 'Вакансии', profile: 'Профиль' };
export const clientScreens: Record<string, () => Promise<string>> = { dash: cDash, cands: cCands, vacancies: cVacancies, profile: cProfile };

// ---------- Обработчики ----------
export const clientActions: Handlers = {
  openP: (el) => openPresentation(el.dataset.id!),
  candView: (el) => { S.candView = el.dataset.v as any; hooks.render(); },
  resetCandF: () => { S.stageF = 'all'; S.periodF = 'all'; hooks.render(); },
  cmp: (el) => {
    const id = el.dataset.id!, box = el as HTMLInputElement;
    if (box.checked) { if (S.cmp.length >= 4) { box.checked = false; toast('Сравнить можно до 4 кандидатов'); return; } S.cmp.push(id); } else S.cmp = S.cmp.filter((x) => x !== id);
    hooks.render();
  },
  cmpClear: () => { S.cmp = []; hooks.render(); },
  cmpOpen: () => openCompare(),
  toVac: (el) => { S.vac = el.dataset.id!; S.candView = 'board'; hooks.go('cands'); },
  async decide(el) {
    const id = el.dataset.id!, s = el.dataset.s!;
    try { await api.post(`/api/client/presentations/${id}/decision`, { stage: s }); toast(`Решение сохранено: «${ST(s)}». Менеджер видит его.`); await hooks.render(); openPresentation(id); }
    catch (e) { showApiError(e); }
  },
  rejectForm(el) {
    const id = el.dataset.id!;
    const reasons: string[] = S.me.settings?.reject_reasons_client ?? [];
    openModal(esc(ST('rejected')), '<p class="small muted">Причина поможет точнее подобрать следующих кандидатов.</p>' +
      `<form id="rejForm" data-id="${id}" novalidate style="display:grid;gap:14px"><div class="field"><label for="rj-reason">Причина отказа</label><select class="select" id="rj-reason">${opt('', 'Выберите причину')}${reasons.map((r) => opt(r, r)).join('')}</select><span class="err" id="rj-reason-err"></span></div>` +
      '<div class="field"><label for="rj-note">Комментарий <span class="opt">обязателен для «Другое»</span></label><textarea class="textarea" id="rj-note"></textarea><span class="err" id="rj-note-err"></span></div></form>',
      `<button class="btn btn-ghost" type="button" data-act="openP" data-id="${id}">Назад</button><button class="btn btn-danger" type="submit" form="rejForm">Подтвердить отказ</button>`);
  },
  viewResume: (el) => openPdf(`/api/client/presentations/${el.dataset.id}/resume`, 'Резюме: ' + (el.dataset.name ?? ''), `Для: ${company()} · ${S.me.user.email} · ${fmtD(new Date().toISOString())}`),
  async logoutAll() { await api.post('/api/session/logout-all'); location.assign('/login'); },
};
export const clientChanges: Handlers = {
  vac: (el) => { S.vac = (el as HTMLSelectElement).value; S.cmp = []; hooks.render(); },
  stageF: (el) => { S.stageF = (el as HTMLSelectElement).value; hooks.render(); },
  periodF: (el) => { S.periodF = (el as HTMLSelectElement).value; hooks.render(); },
};
export const clientForms: Handlers = {
  async rejForm(form) {
    const reason = val('rj-reason'), note = val('rj-note');
    if (!applyErrors('rj', { reason: reason ? '' : 'Выберите причину отказа', note: reason === 'Другое' && !note ? 'Опишите причину' : '' })) return;
    const id = form.dataset.id!;
    try {
      await api.post(`/api/client/presentations/${id}/decision`, { stage: 'rejected', reason: reason === 'Другое' ? note : reason + (note ? ': ' + note : '') });
      toast('Отказ сохранён. Менеджер видит его.'); await hooks.render(); openPresentation(id);
    } catch (e) { showApiError(e); }
  },
  async fbForm(form) {
    const body = val('fb-body');
    if (!applyErrors('fb', { body: body ? '' : 'Напишите отзыв' })) return;
    const id = form.dataset.id!, rating = val('fb-rating');
    try { await api.post(`/api/client/presentations/${id}/feedback`, { body, rating: rating ? +rating : undefined }); toast('Отзыв сохранён. Менеджер видит его.'); openPresentation(id); }
    catch (e) { showApiError(e, 'fb'); }
  },
};
