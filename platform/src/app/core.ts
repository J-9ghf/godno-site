// Общее ядро интерфейса кабинетов: запросы к API, форматирование, модальные окна, уведомления.
// Разметка и классы перенесены из демоверсии (prototypes/ikr-platform.html) без изменения дизайна.
/* eslint-disable @typescript-eslint/no-explicit-any */

export const $ = <T extends HTMLElement = HTMLElement>(s: string, r: ParentNode = document) => r.querySelector(s) as T | null;
export const esc = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
export const DAY = 864e5;
const MONTHS = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
export const fmtD = (iso: string) => { const d = new Date(iso); return d.getDate() + ' ' + MONTHS[d.getMonth()] + (d.getFullYear() !== new Date().getFullYear() ? ' ' + d.getFullYear() : ''); };
export const hhmm = (iso: string) => { const d = new Date(iso); return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0'); };
export const fmtDT = (iso: string) => fmtD(iso) + ', ' + hhmm(iso);
export const plural = (n: number, one: string, few: string, many: string) => { const a = Math.abs(n) % 100, b = a % 10; if (a > 10 && a < 20) return many; if (b > 1 && b < 5) return few; if (b === 1) return one; return many; };
export const dn = (n: number) => n + ' ' + plural(n, 'день', 'дня', 'дней');
const sod = (d: string | Date) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
export const fmtRel = (iso: string) => {
  const diff = Math.round((+sod(new Date()) - +sod(iso)) / DAY);
  if (diff === 0) return 'сегодня, ' + hhmm(iso); if (diff === 1) return 'вчера, ' + hhmm(iso);
  if (diff > 1 && diff < 7) return dn(diff) + ' назад'; return fmtD(iso);
};
export const daysBetween = (a: string, b: string | Date = new Date()) => Math.max(0, Math.floor((+new Date(b) - +new Date(a)) / DAY));
export const initials = (n: string) => String(n).split(' ').filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
export const sizeMb = (b: number) => (b / 1048576 < 0.1 ? Math.max(1, Math.round(b / 1024)) + ' КБ' : (b / 1048576).toFixed(1).replace('.', ',') + ' МБ');

// ---------- API ----------
export class ApiError extends Error { constructor(public status: number, message: string, public code?: string, public fields?: Record<string, string>) { super(message); } }
async function call(method: string, url: string, body?: unknown, raw = false): Promise<any> {
  const init: RequestInit = { method, credentials: 'same-origin', headers: {} };
  if (body instanceof FormData) init.body = body;
  else if (body !== undefined) { (init.headers as any)['content-type'] = 'application/json'; init.body = JSON.stringify(body); }
  let res: Response;
  try { res = await fetch(url, init); } catch { throw new ApiError(0, 'Нет связи с сервером. Проверьте интернет и попробуйте ещё раз.'); }
  if (res.status === 401) { location.assign('/login'); throw new ApiError(401, 'Сессия закончилась. Войдите снова.'); }
  if (raw) { if (!res.ok) { const d = await res.json().catch(() => ({})); throw new ApiError(res.status, d.message || 'Файл недоступен'); } return res; }
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new ApiError(res.status, data?.message || 'Не получилось. Попробуйте ещё раз.', data?.error, data?.fields);
  return data;
}
export const api = {
  get: (u: string) => call('GET', u), post: (u: string, b: unknown = {}) => call('POST', u, b),
  patch: (u: string, b: unknown) => call('PATCH', u, b), del: (u: string) => call('DELETE', u),
  raw: (u: string) => call('GET', u, undefined, true),
};
export const qs = (o: Record<string, string | undefined | null>) => { const p = new URLSearchParams(); for (const [k, v] of Object.entries(o)) if (v) p.set(k, v); const s = p.toString(); return s ? '?' + s : ''; };

// ---------- Модальные окна и уведомления ----------
let lastFocus: Element | null = null;
export function openModal(title: string, body: string, foot = '', size = '') {
  lastFocus = document.activeElement;
  $('#modalRoot')!.innerHTML = `<div class="modal-bg" data-act="modalBg"><div class="modal ${size}" role="dialog" aria-modal="true" aria-labelledby="mh"><div class="modal-h"><h2 id="mh">${title}</h2><button class="modal-x" type="button" data-act="closeModal" aria-label="Закрыть">×</button></div><div class="modal-b">${body}</div>${foot ? `<div class="modal-f">${foot}</div>` : ''}</div></div>`;
  document.body.style.overflow = 'hidden';
  ($('#modalRoot .modal-b input:not([type=hidden]), #modalRoot .modal-b select, #modalRoot .modal-b textarea') ?? $('#modalRoot .modal-x'))?.focus({ preventScroll: true });
}
export function closeModal() { $('#modalRoot')!.innerHTML = ''; document.body.style.overflow = ''; if (lastFocus instanceof HTMLElement && document.contains(lastFocus)) lastFocus.focus({ preventScroll: true }); }
export const modalOpen = () => !!$('#modalRoot')?.innerHTML;
let toastT: ReturnType<typeof setTimeout>;
export function toast(msg: string) { clearTimeout(toastT); $('#toastRoot')!.innerHTML = `<div class="toast" role="status">${esc(msg)}</div>`; toastT = setTimeout(() => ($('#toastRoot')!.innerHTML = ''), 4500); }

// ---------- Формы ----------
export const val = (id: string) => ((document.getElementById(id) as HTMLInputElement | null)?.value ?? '').trim();
export const checked = (id: string) => !!(document.getElementById(id) as HTMLInputElement | null)?.checked;
export function applyErrors(prefix: string, errs: Record<string, string>) {
  let first: HTMLElement | null = null;
  for (const [k, msg] of Object.entries(errs)) {
    const el = document.getElementById(`${prefix}-${k}`), er = document.getElementById(`${prefix}-${k}-err`);
    if (er) er.textContent = msg || '';
    if (el) { if (msg) el.setAttribute('aria-invalid', 'true'); else el.removeAttribute('aria-invalid'); }
    if (msg && !first) first = el;
  }
  first?.focus();
  return !first;
}
// Ошибки сервера по полям — в те же места формы
export function showApiError(e: unknown, prefix?: string, map: Record<string, string> = {}) {
  if (e instanceof ApiError && prefix && e.fields) {
    const errs: Record<string, string> = {};
    for (const [k, v] of Object.entries(e.fields)) errs[map[k] ?? k] = v;
    applyErrors(prefix, errs);
  }
  toast(e instanceof Error ? e.message : 'Не получилось');
}

// ---------- Общие блоки ----------
export const IC: Record<string, string> = {
  dash: '<svg viewBox="0 0 24 24"><rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/></svg>',
  cands: '<svg viewBox="0 0 24 24"><circle cx="9" cy="8" r="4"/><path d="M2 21a7 7 0 0 1 14 0"/><path d="M17 4a4 4 0 0 1 0 8M22 21a7 7 0 0 0-4-6.3"/></svg>',
  reqs: '<svg viewBox="0 0 24 24"><rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 8h8M8 12h8M8 16h5"/></svg>',
  profile: '<svg viewBox="0 0 24 24"><circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/></svg>',
  clients: '<svg viewBox="0 0 24 24"><path d="M3 21V7l9-4 9 4v14"/><path d="M9 21v-6h6v6M8 10h.01M12 10h.01M16 10h.01"/></svg>',
  pool: '<svg viewBox="0 0 24 24"><ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v14c0 1.7 3.6 3 8 3s8-1.3 8-3V5M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3"/></svg>',
  pipe: '<svg viewBox="0 0 24 24"><rect x="3" y="4" width="5" height="16" rx="1.5"/><rect x="10" y="4" width="5" height="11" rx="1.5"/><rect x="17" y="4" width="4" height="7" rx="1.5"/></svg>',
  users: '<svg viewBox="0 0 24 24"><rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>',
  log: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>',
  shield: '<svg viewBox="0 0 24 24"><path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/><path d="M9 12l2 2 4-4"/></svg>',
  empty: '<svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 10h18M8 15h8"/></svg>',
  video: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="6" width="14" height="12" rx="2"/><path d="m16 10 6-3v10l-6-3"/></svg>',
  file: '<svg viewBox="0 0 24 24"><path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><path d="M14 3v6h6M12 18v-6M9 15l3-3 3 3"/></svg>',
};
export const emptyHTML = (title: string, text = '', btn = '') => `<div class="empty">${IC.empty}<b>${esc(title)}</b>${text ? `<span class="small">${esc(text)}</span>` : ''}${btn}</div>`;
export const pill = (txt: string, cls = '') => `<span class="pill ${cls}">${esc(txt)}</span>`;
export const opt = (v: string, label: string, sel = false, dis = false) => `<option value="${esc(v)}"${sel ? ' selected' : ''}${dis ? ' disabled' : ''}>${esc(label)}</option>`;
export const loading = () => '<div class="panel"><div class="empty"><b>Загрузка…</b></div></div>';

export const STAGES = ['offered', 'interested', 'interview', 'offer', 'hired'] as const;
export const ALL_STAGES = ['sourced', 'screening', 'offered', 'interested', 'interview', 'offer', 'hired', 'rejected'] as const;
export const ST_PILL: Record<string, string> = { sourced: '', screening: '', offered: 'blue', interested: 'blue', interview: 'warn', offer: 'warn', hired: 'ok', rejected: 'bad' };
export let LABELS: Record<string, string> = { sourced: 'Найден', screening: 'Проверка', offered: 'Предложен', interested: 'Интересен', interview: 'Интервью', offer: 'Оффер', hired: 'Вышел на работу', rejected: 'Отказ' };
export const setLabels = (l: Record<string, string>) => { LABELS = { ...LABELS, ...l }; };
export const ST = (s: string) => LABELS[s] ?? s;
export const stagePill = (s: string) => pill(ST(s), ST_PILL[s]);
export const VAC_STATUS: Record<string, [string, string]> = { new: ['Новая', 'blue'], searching: ['Идёт поиск', 'blue'], presented: ['Кандидаты предложены', 'blue'], interview: ['Интервью', 'warn'], paused: ['Приостановлена', ''], closed: ['Закрыта', 'ok'], cancelled: ['Отменена', 'bad'] };
export const vacPill = (s: string) => pill(VAC_STATUS[s]?.[0] ?? s, VAC_STATUS[s]?.[1] ?? '');

// Воронка с процентами перехода (как в демоверсии; цифры — из функции metrics в базе)
export function funnelHTML(m: any) {
  const rows: [string, number][] = [['Предложено', m.presented], ['Интересны', m.reached_interested], ['Интервью', m.reached_interview], ['Оффер', m.reached_offer], ['Вышли на работу', m.reached_hired]];
  const conv = [null, m.conversions.offered_to_interested, m.conversions.interested_to_interview, m.conversions.interview_to_offer, m.conversions.offer_to_hired];
  const max = Math.max(m.presented, 1);
  return '<div class="funnel"><div class="fn-row fn-head"><span></span><span></span><b>чел.</b><em>переход</em></div>' + rows.map(([l, n], i) =>
    `<div class="fn-row"><span>${l}</span><div class="fn-bar"><i style="width:${(n / max) * 100}%"></i></div><b>${n}</b><em>${i === 0 ? '' : conv[i] == null ? '—' : conv[i] + '%'}</em></div>`).join('') + '</div>';
}
export const miniFunnel = (m: any) => '<div class="mini-fn">' + [['Предложено', m.presented], ['Интересны', m.reached_interested], ['Интервью', m.reached_interview], ['Оффер', m.reached_offer], ['Вышли', m.reached_hired]].map((x) => `<div><b>${x[1]}</b><span>${x[0]}</span></div>`).join('') + '</div>';
export function reasonsHTML(list: { reason: string; count: number }[]) {
  if (!list?.length) return '<p class="small muted">Отказов нет.</p>';
  const max = Math.max(...list.map((r) => r.count));
  return list.map((r) => `<div class="rs-bar"><span>${esc(r.reason)}</span><div><i style="width:${(r.count / max) * 100}%"></i></div><b>${r.count}</b></div>`).join('');
}
export const kpi = (label: string, value: string | number, note = '', hl = false) => `<div class="kpi${hl ? ' hl' : ''}"><span>${label}</span><b>${value}</b>${note ? `<em>${note}</em>` : ''}</div>`;
