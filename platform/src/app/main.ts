// Оболочка кабинета: загрузка профиля, меню по роли, маршрутизация по #раздел/параметр и делегирование событий.
// Разметка оболочки — из демоверсии (боковое меню, верхняя панель, мобильное меню).
// Права проверяет сервер: меню лишь скрывает разделы, к которым у роли всё равно нет доступа в API.
/* eslint-disable @typescript-eslint/no-explicit-any */
import { $, api, ApiError, IC, esc, initials, emptyHTML, closeModal, modalOpen, toast, applyErrors, showApiError, setLabels } from './core';
import { S, hooks, type Handlers } from './state';
import { clientNav, clientTitles, clientScreens, clientActions, clientChanges, clientForms } from './client';
import { adminNav, adminTitles, adminScreens, adminActions, adminChanges, adminForms } from './admin';

let nav: [string, string, string][] = [];
let titles: Record<string, string> = {};
let screens: Record<string, () => Promise<string>> = {};

const shared: Handlers = {
  nav: (el) => { closeModal(); go(el.dataset.sec!); },
  closeModal: () => closeModal(),
  reload: () => location.reload(),
  modalBg: (el, e) => { if (e.target === el) closeModal(); },
  async logout() { try { await api.post('/api/session/logout'); } finally { location.assign('/login'); } },
};
const A: Handlers = { ...clientActions, ...adminActions, ...shared };
const C: Handlers = { ...clientChanges, ...adminChanges };
const F: Handlers = {
  ...clientForms, ...adminForms,
  async pwForm() {
    const currentPassword = (document.getElementById('pw-currentPassword') as HTMLInputElement).value;
    const newPassword = (document.getElementById('pw-newPassword') as HTMLInputElement).value;
    if (!applyErrors('pw', { currentPassword: currentPassword ? '' : 'Введите текущий пароль', newPassword: newPassword.length >= 10 ? '' : 'Не короче 10 символов' })) return;
    try {
      await api.post('/api/session/change-password', { currentPassword, newPassword });
      toast('Пароль изменён. Остальные сеансы завершены.');
      (document.getElementById('pwForm') as HTMLFormElement | null)?.reset();
    } catch (e) { showApiError(e, 'pw'); }
  },
};

function parseHash() {
  const [sec, param] = decodeURIComponent(location.hash.replace(/^#/, '')).split('/');
  return { sec: sec || '', param: param || '' };
}
function go(section: string, param = '') {
  const h = '#' + section + (param ? '/' + encodeURIComponent(param) : '');
  if (location.hash === h) render(); else location.hash = h;
}

let seq = 0;
async function render() {
  const me = S.me;
  const allowed = new Set(nav.map((n) => n[0]).concat(Object.keys(screens)));
  if (me.needs2fa) { S.section = 'security'; S.param = ''; }
  else if (!allowed.has(S.section) || !screens[S.section]) S.section = nav[0]?.[0] ?? '';
  const my = ++seq;
  const keepScroll = window.scrollY;
  shell();
  const box = $('#content')!;
  let html: string;
  try { html = screens[S.section] ? await screens[S.section]() : noAccess(); }
  catch (e) {
    if (e instanceof ApiError && e.status === 401) return;
    html = '<div class="panel">' + emptyHTML(e instanceof ApiError && e.status === 404 ? 'Не найдено' : 'Не удалось загрузить раздел',
      e instanceof Error ? e.message : '', nav[0] ? `<button class="btn btn-ghost btn-sm" type="button" data-act="nav" data-sec="${nav[0][0]}">${esc(nav[0][1])}</button>` : '') + '</div>';
  }
  if (my !== seq) return; // пока грузились данные, пользователь перешёл в другой раздел
  box.innerHTML = html;
  box.removeAttribute('aria-busy');
  if (keepScroll && sameScreen) window.scrollTo(0, keepScroll);
  sameScreen = true;
}
let sameScreen = false;

function noAccess() {
  return '<div class="panel">' + emptyHTML('Нет доступа к кабинету', 'Доступ к компании отозван или ещё не выдан. Напишите вашему менеджеру.') + '</div>';
}

function shell() {
  const me = S.me;
  const isAdmin = me.kind === 'admin';
  const org = isAdmin ? 'Команда ИКР' : (me.companies.map((c: any) => c.name).join(', ') || '—');
  const orgSub = isAdmin ? 'Кабинет администратора' : 'Кабинет клиента';
  const role = isAdmin ? 'Администратор' : me.kind === 'client' ? 'Клиент' : 'Нет доступа';
  const active = (id: string) => S.section === id || (S.section === 'client' && id === 'clients') || (S.section === 'vacancy' && id === 'vacancies') || (S.section === 'candidate' && id === 'pool');
  const navBtns = (icons: boolean) => nav.map(([id, label, ic]) => `<button type="button" class="${active(id) ? 'on' : ''}" data-act="nav" data-sec="${id}"${active(id) ? ' aria-current="page"' : ''}>${icons ? IC[ic] ?? '' : ''}<span>${esc(label)}</span></button>`).join('');
  $('#view-app')!.innerHTML =
    '<div class="app"><aside class="side">' +
      '<span class="brand"><span class="logo" aria-hidden="true"><i class="l-ink"></i><i class="l-acc"></i></span><span class="brand-name">Институт кадровых решений</span></span>' +
      `<div class="side-org"><span class="muted">${orgSub}</span><b title="${esc(org)}">${esc(org)}</b></div>` +
      `<nav class="snav" aria-label="Разделы кабинета">${navBtns(true)}</nav>` +
      '<div class="side-foot"><button class="btn btn-ghost btn-sm" type="button" data-act="logout">Выйти</button></div>' +
    '</aside><div class="main">' +
      `<header class="topbar"><h1>${esc(titles[S.section] ?? '')}</h1><div class="who"><span class="avatar">${esc(initials(me.user.name))}</span><div class="who-txt"><b>${esc(me.user.name)}</b><span>${role}</span></div><button class="btn btn-ghost btn-sm" type="button" data-act="logout">Выйти</button></div></header>` +
      (me.needs2fa ? '<div class="notice" style="margin:16px clamp(16px,3vw,32px) 0">Для работы в кабинете администратора включите двухфакторную аутентификацию. До этого остальные разделы недоступны.</div>' : '') +
      `<nav class="mob-nav" aria-label="Разделы кабинета">${navBtns(false)}</nav>` +
      '<div class="content" id="content" aria-busy="true"><div class="panel"><div class="empty"><b>Загрузка…</b></div></div></div>' +
    '</div></div>';
  document.title = (titles[S.section] ?? 'Кабинет') + ' · Кабинет ИКР';
}

async function loadMe() {
  const me = await api.get('/api/session/me');
  me.settings = me.kind === 'none' ? {} : await api.get('/api/settings').catch(() => ({}));
  if (me.settings?.stage_labels) setLabels(me.settings.stage_labels);
  S.me = me;
  if (me.kind === 'admin') { nav = adminNav(me.needs2fa); titles = adminTitles; screens = me.needs2fa ? { security: adminScreens.security } : adminScreens; }
  else if (me.kind === 'client') { nav = clientNav(); titles = clientTitles; screens = clientScreens; }
  else { nav = []; titles = {}; screens = {}; }
}

hooks.render = async () => { sameScreen = true; await render(); };
hooks.go = (section, param = '') => go(section, param);

function onRoute() {
  const { sec, param } = parseHash();
  S.section = sec; S.param = param;
  sameScreen = false;
  closeModal();
  render().then(() => { if (!S.param) window.scrollTo(0, 0); });
}

document.addEventListener('click', (e) => {
  const t = e.target as HTMLElement;
  const el = t.closest<HTMLElement>('[data-act]'); if (!el) return;
  const ctl = t.closest<HTMLElement>('select,input,textarea,label,button,a');
  if (ctl && ctl !== el && el.contains(ctl) && !ctl.dataset.act) return;
  const fn = A[el.dataset.act!]; if (!fn) return;
  if (el.tagName === 'A' && el.getAttribute('href')?.startsWith('#')) e.preventDefault();
  Promise.resolve(fn(el, e)).catch((err) => showApiError(err));
});
document.addEventListener('keydown', (e) => {
  const t = e.target as HTMLElement;
  if (e.key === 'Escape' && modalOpen()) closeModal();
  if ((e.key === 'Enter' || e.key === ' ') && t.matches?.('.ccard[data-act]')) { e.preventDefault(); A[t.dataset.act!]?.(t, e); }
});
document.addEventListener('change', (e) => {
  const el = (e.target as HTMLElement).closest<HTMLElement>('[data-change]');
  if (el && C[el.dataset.change!]) Promise.resolve(C[el.dataset.change!](el, e)).catch((err) => showApiError(err));
});
let inputT: ReturnType<typeof setTimeout>;
document.addEventListener('input', (e) => {
  const el = e.target as HTMLInputElement;
  if (el.dataset?.input === 'poolQ') {
    clearTimeout(inputT);
    inputT = setTimeout(async () => {
      const pos = el.selectionStart, id = el.id;
      S.poolQ = el.value;
      await hooks.render();
      const n = document.getElementById(id) as HTMLInputElement | null;
      if (n) { n.focus(); try { n.setSelectionRange(pos, pos); } catch { /* поле без курсора */ } }
    }, 250);
    return;
  }
  const er = document.getElementById(el.id + '-err');
  if (er?.textContent) { er.textContent = ''; el.removeAttribute('aria-invalid'); }
});
document.addEventListener('submit', (e) => {
  const f = e.target as HTMLFormElement;
  e.preventDefault();
  const fn = F[f.id]; if (!fn) return;
  const btns = [...document.querySelectorAll<HTMLButtonElement>(`button[type=submit][form="${f.id}"]`), ...f.querySelectorAll<HTMLButtonElement>('button[type=submit]')];
  btns.forEach((b) => (b.disabled = true));
  Promise.resolve(fn(f, e)).catch((err) => showApiError(err)).finally(() => btns.forEach((b) => (b.disabled = false)));
});
window.addEventListener('hashchange', onRoute);

(async () => {
  try { await loadMe(); }
  catch (e) {
    if (e instanceof ApiError && e.status === 401) return;
    $('#view-app')!.innerHTML = '<div class="wrap" style="padding-block:40px">' + emptyHTML('Не удалось открыть кабинет', e instanceof Error ? e.message : '', '<button class="btn btn-ghost btn-sm" type="button" data-act="reload">Обновить</button>') + '</div>';
    return;
  }
  onRoute();
})();
