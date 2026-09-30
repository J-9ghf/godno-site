const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/* ── Reveal on scroll ─────────────────────────────────────── */
function initReveal() {
  const items = document.querySelectorAll<HTMLElement>('[data-reveal]');
  if (reduceMotion || !('IntersectionObserver' in window)) {
    items.forEach((el) => el.classList.add('is-visible'));
    return;
  }
  const io = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible');
          io.unobserve(entry.target);
        }
      }
    },
    { rootMargin: '0px 0px -8% 0px', threshold: 0.08 },
  );
  items.forEach((el) => io.observe(el));
}

/* ── Accordions (кейсы и FAQ) ─────────────────────────────── */
function initAccordions() {
  document.querySelectorAll<HTMLElement>('[data-accordion]').forEach((item) => {
    const trigger = item.querySelector<HTMLButtonElement>('[data-accordion-trigger]');
    if (!trigger) return;
    trigger.addEventListener('click', () => {
      const open = trigger.getAttribute('aria-expanded') !== 'true';
      trigger.setAttribute('aria-expanded', String(open));
      item.classList.toggle('is-open', open);
    });
  });

  // Открыть кейс/вопрос по прямой ссылке (#case-…)
  const hash = decodeURIComponent(location.hash.slice(1));
  if (hash) {
    const target = document.getElementById(hash)?.closest<HTMLElement>('[data-accordion]');
    target?.querySelector<HTMLButtonElement>('[data-accordion-trigger]')?.click();
  }
}

/* ── Header: состояние при скролле, активный пункт ───────── */
function initHeader() {
  const header = document.querySelector<HTMLElement>('[data-header]');
  if (!header) return;

  const onScroll = () => header.classList.toggle('is-scrolled', window.scrollY > 8);
  onScroll();
  window.addEventListener('scroll', onScroll, { passive: true });

  const links = new Map<string, HTMLElement>();
  document.querySelectorAll<HTMLAnchorElement>('[data-nav-link]').forEach((a) => {
    links.set(a.hash.slice(1), a);
  });
  const sections = [...links.keys()]
    .map((id) => document.getElementById(id))
    .filter((el): el is HTMLElement => Boolean(el));

  const inView = new Set<string>();
  const io = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) inView.add(entry.target.id);
        else inView.delete(entry.target.id);
      }
      const current = sections.find((s) => inView.has(s.id))?.id;
      links.forEach((a, id) => a.classList.toggle('is-active', id === current));
    },
    { rootMargin: '-45% 0px -50% 0px' },
  );
  sections.forEach((s) => io.observe(s));
}

/* ── Mobile menu ──────────────────────────────────────────── */
function initMenu() {
  const header = document.querySelector<HTMLElement>('[data-header]');
  const toggle = document.querySelector<HTMLButtonElement>('[data-menu-toggle]');
  const menu = document.querySelector<HTMLElement>('[data-menu]');
  const label = document.querySelector<HTMLElement>('[data-menu-label]');
  if (!header || !toggle || !menu) return;

  const setOpen = (open: boolean) => {
    toggle.setAttribute('aria-expanded', String(open));
    header.classList.toggle('is-open', open);
    menu.hidden = !open;
    document.body.style.overflow = open ? 'hidden' : '';
    if (label) label.textContent = open ? 'Закрыть меню' : 'Открыть меню';
  };

  toggle.addEventListener('click', () => setOpen(toggle.getAttribute('aria-expanded') !== 'true'));
  menu.querySelectorAll('[data-menu-link]').forEach((a) => a.addEventListener('click', () => setOpen(false)));
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !menu.hidden) {
      setOpen(false);
      toggle.focus();
    }
  });
  window.matchMedia('(min-width: 961px)').addEventListener('change', (e) => e.matches && setOpen(false));
}

/* ── Principles: индикатор активного пункта в sticky-колонке ─ */
function initPrinciples() {
  const dots = document.querySelectorAll<HTMLElement>('[data-principle-dot]');
  if (!dots.length) return;
  const io = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        const i = (entry.target as HTMLElement).dataset.principle;
        dots.forEach((d) => d.classList.toggle('is-active', d.dataset.principleDot === i));
      }
    },
    { rootMargin: '-40% 0px -55% 0px' },
  );
  document.querySelectorAll('[data-principle]').forEach((el) => io.observe(el));
}

/* ── Reviews slider (mobile): прогресс ────────────────────── */
function initSlider() {
  document.querySelectorAll<HTMLElement>('[data-slider]').forEach((slider) => {
    const track = slider.querySelector<HTMLElement>('[data-slider-track]');
    const bar = slider.querySelector<HTMLElement>('[data-slider-progress]');
    if (!track || !bar) return;
    const update = () => {
      const max = track.scrollWidth - track.clientWidth;
      const visible = track.clientWidth / track.scrollWidth;
      const p = max > 0 ? visible + (1 - visible) * (track.scrollLeft / max) : 1;
      bar.style.setProperty('--p', p.toFixed(3));
    };
    track.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update);
    update();
  });
}

/* ── Form ─────────────────────────────────────────────────── */
function initForm() {
  const form = document.querySelector<HTMLFormElement>('[data-form]');
  const status = form?.querySelector<HTMLElement>('[data-form-status]');
  if (!form || !status) return;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    let valid = true;
    form.querySelectorAll<HTMLInputElement>('[required]').forEach((field) => {
      const ok = field.value.trim().length > 0;
      field.setAttribute('aria-invalid', String(!ok));
      if (!ok && valid) {
        field.focus();
        valid = false;
      }
    });
    if (!valid) {
      status.textContent = 'Пожалуйста, укажите имя и способ связи.';
      return;
    }

    const endpoint = form.dataset.endpoint;
    if (!endpoint) {
      status.textContent = 'Форма ещё не подключена к обработчику заявок. Укажите PUBLIC_FORM_ENDPOINT при сборке.';
      console.warn('[form] PUBLIC_FORM_ENDPOINT не задан — заявка не отправлена.');
      return;
    }

    const submit = form.querySelector<HTMLButtonElement>('[type="submit"]');
    submit?.setAttribute('disabled', '');
    status.textContent = 'Отправляем…';

    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { Accept: 'application/json' },
        body: new FormData(form),
      });
      if (!res.ok) throw new Error(String(res.status));
      form.reset();
      status.textContent = 'Спасибо. Мы свяжемся с вами в ближайшее время.';
    } catch {
      status.textContent = 'Не удалось отправить заявку. Попробуйте ещё раз чуть позже.';
    } finally {
      submit?.removeAttribute('disabled');
    }
  });

  form.querySelectorAll('input, textarea').forEach((f) =>
    f.addEventListener('input', () => f.removeAttribute('aria-invalid')),
  );
}

initReveal();
initAccordions();
initHeader();
initMenu();
initPrinciples();
initSlider();
initForm();
