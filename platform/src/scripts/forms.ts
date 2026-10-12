// Отправка форм входа и приглашений: JSON-запрос, ошибки у полей, переход по ответу сервера.
export function bindForm(form: HTMLFormElement, opts: { url: string | (() => string); collect: () => Record<string, unknown>; validate?: () => Record<string, string>; onSuccess?: (data: any) => void }) {
  const alert = form.querySelector<HTMLElement>('.form-alert');
  const submit = form.querySelector<HTMLButtonElement>('[type=submit]');
  const showErrors = (fields: Record<string, string> = {}) => {
    form.querySelectorAll<HTMLElement>('.err').forEach((e) => (e.textContent = ''));
    form.querySelectorAll('[aria-invalid]').forEach((e) => e.removeAttribute('aria-invalid'));
    let first: HTMLElement | null = null;
    for (const [k, msg] of Object.entries(fields)) {
      const input = form.querySelector<HTMLElement>(`[name="${k}"]`);
      const err = form.querySelector<HTMLElement>(`[data-err="${k}"]`);
      if (err) err.textContent = msg;
      if (input) { input.setAttribute('aria-invalid', 'true'); first ??= input; }
    }
    first?.focus();
  };
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (alert) alert.hidden = true;
    const local = opts.validate?.() ?? {};
    if (Object.keys(local).length) { showErrors(local); return; }
    showErrors();
    const label = submit?.textContent;
    if (submit) { submit.disabled = true; submit.textContent = 'Подождите…'; }
    try {
      const res = await fetch(typeof opts.url === 'function' ? opts.url() : opts.url, {
        method: 'POST', headers: { 'content-type': 'application/json' }, credentials: 'same-origin', body: JSON.stringify(opts.collect()),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (data.fields) showErrors(data.fields);
        if (alert) { alert.textContent = data.message || 'Не получилось. Попробуйте ещё раз.'; alert.hidden = false; }
        return;
      }
      if (opts.onSuccess) opts.onSuccess(data);
      else if (data.redirect) location.assign(data.redirect);
    } catch {
      if (alert) { alert.textContent = 'Нет связи с сервером. Проверьте интернет и попробуйте ещё раз.'; alert.hidden = false; }
    } finally {
      if (submit) { submit.disabled = false; submit.textContent = label ?? ''; }
    }
  });
}
export const val = (form: HTMLFormElement, name: string) => (form.elements.namedItem(name) as HTMLInputElement | null)?.value.trim() ?? '';
