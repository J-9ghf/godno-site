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
    { rootMargin: '0px 0px -6% 0px', threshold: 0.06 },
  );
  items.forEach((el) => {
    // Первый экран появляется сразу после загрузки, не дожидаясь скролла
    if (el.closest('.hero')) requestAnimationFrame(() => el.classList.add('is-visible'));
    else io.observe(el);
  });
}

/* ── Accordions (кейсы, FAQ) ──────────────────────────────── */
function initAccordions() {
  document.querySelectorAll<HTMLElement>('[data-accordion]').forEach((item) => {
    const trigger = item.querySelector<HTMLButtonElement>('[data-accordion-trigger]');
    trigger?.addEventListener('click', () => {
      const open = trigger.getAttribute('aria-expanded') !== 'true';
      trigger.setAttribute('aria-expanded', String(open));
      item.classList.toggle('is-open', open);
    });
  });

  // Открыть кейс по прямой ссылке (#case-…)
  const target = location.hash && document.getElementById(decodeURIComponent(location.hash.slice(1)));
  const acc = target instanceof HTMLElement ? target.closest<HTMLElement>('[data-accordion]') : null;
  if (acc && !acc.classList.contains('is-open')) {
    acc.querySelector<HTMLButtonElement>('[data-accordion-trigger]')?.click();
  }
}

/* ── Header: активный пункт навигации ─────────────────────── */
function initActiveNav() {
  const links = new Map<string, HTMLElement>();
  document.querySelectorAll<HTMLAnchorElement>('[data-nav-link]').forEach((a) => {
    if (a.pathname === location.pathname) links.set(a.hash.slice(1), a);
  });
  const sections = [...links.keys()]
    .map((id) => document.getElementById(id))
    .filter((el): el is HTMLElement => Boolean(el));
  if (!sections.length) return;

  const inView = new Set<string>();
  const io = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        if (e.isIntersecting) inView.add(e.target.id);
        else inView.delete(e.target.id);
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
  window.matchMedia('(min-width: 1061px)').addEventListener('change', (e) => e.matches && setOpen(false));
}

/* ── Hero video: фоновое, всегда играет, без UI ──────────── */
function initVideo() {
  const video = document.querySelector<HTMLVideoElement>('[data-hero-video]');
  if (!video) return;

  // Для надёжного autoplay во всех браузерах (iOS Safari требует свойство, а не только атрибут)
  video.muted = true;
  video.defaultMuted = true;
  video.playsInline = true;

  const play = () => {
    if (video.paused) video.play().catch(() => {});
  };

  play();
  video.addEventListener('canplay', play, { once: true });
  // Если браузер приостановил видео (энергосбережение, вкладка в фоне) — возобновляем
  document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && play());
  video.addEventListener('pause', () => document.visibilityState === 'visible' && setTimeout(play, 300));
  // iOS Low Power Mode блокирует autoplay до первого касания — запускаем при первом взаимодействии
  const kick = () => {
    play();
    window.removeEventListener('touchstart', kick);
    window.removeEventListener('scroll', kick);
  };
  window.addEventListener('touchstart', kick, { passive: true });
  window.addEventListener('scroll', kick, { passive: true });
}

/* ── Header: прозрачный поверх hero, белый после первого экрана ─ */
function initHeaderState() {
  const header = document.querySelector<HTMLElement>('[data-header]');
  const hero = document.querySelector<HTMLElement>('.hero');
  if (!header || !hero || !header.classList.contains('header--overlay')) return;

  const update = () => {
    const threshold = hero.offsetHeight - header.offsetHeight - 8;
    header.classList.toggle('is-solid', window.scrollY > threshold);
  };
  update();
  window.addEventListener('scroll', update, { passive: true });
  window.addEventListener('resize', update);
}

/* ── Process: «Шаг N из 5» + прогресс по скроллу ─────────── */
function initProcess() {
  const steps = [...document.querySelectorAll<HTMLElement>('[data-step]')];
  const currentEl = document.querySelector<HTMLElement>('[data-step-current]');
  const bar = document.querySelector<HTMLElement>('[data-step-bar]');
  if (!steps.length) return;

  const setCurrent = (n: number) => {
    steps.forEach((s) => s.classList.toggle('is-current', Number(s.dataset.step) === n));
    if (currentEl) currentEl.textContent = String(n);
    bar?.style.setProperty('--p', String(n / steps.length));
  };

  const io = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        if (e.isIntersecting) setCurrent(Number((e.target as HTMLElement).dataset.step));
      }
    },
    { rootMargin: '-40% 0px -55% 0px' },
  );
  steps.forEach((s) => io.observe(s));
  setCurrent(1);
}

/* ── Счётчики: число набегает от нуля один раз, когда появляется на экране ── */
function initCounters() {
  const els = [...document.querySelectorAll<HTMLElement>('[data-count]')];
  // «Уменьшить движение» или старый браузер — итоговые числа уже стоят в разметке
  if (!els.length || reduceMotion || !('IntersectionObserver' in window)) return;

  const DURATION = 1800;
  const format = (v: number, d: number) => v.toFixed(d).replace('.', ',');
  const run = (el: HTMLElement) => {
    const target = Number(el.dataset.count);
    const decimals = Number(el.dataset.decimals || 0);
    let start: number | null = null;
    const step = (ts: number) => {
      if (start === null) start = ts;
      const p = Math.min(1, (ts - start) / DURATION);
      const eased = 1 - Math.pow(1 - p, 3); // плавное замедление к концу
      el.textContent = format(target * eased, decimals);
      if (p < 1) requestAnimationFrame(step);
      else el.textContent = format(target, decimals);
    };
    requestAnimationFrame(step);
  };

  const io = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        if (!e.isIntersecting) continue;
        io.unobserve(e.target);
        run(e.target as HTMLElement);
      }
    },
    { threshold: 0.6 },
  );
  els.forEach((el) => {
    el.textContent = format(0, Number(el.dataset.decimals || 0));
    io.observe(el);
  });
}

/* ── Form: пока только интерфейс — данные никуда не отправляются ── */
function initForm() {
  const form = document.querySelector<HTMLFormElement>('[data-form]');
  const status = form?.querySelector<HTMLElement>('[data-form-status]');
  const done = document.querySelector<HTMLElement>('[data-form-done]');
  const again = document.querySelector<HTMLButtonElement>('[data-form-again]');
  if (!form || !status || !done) return;

  const fields = [...form.querySelectorAll<HTMLInputElement>('[required]')];

  form.addEventListener('submit', (e) => {
    e.preventDefault();

    const invalid = fields.filter((f) => (f.type === 'checkbox' ? !f.checked : !f.value.trim()));
    fields.forEach((f) => f.setAttribute('aria-invalid', String(invalid.includes(f))));

    if (invalid.length) {
      const needsConsent = invalid.some((f) => f.type === 'checkbox');
      const needsFields = invalid.some((f) => f.type !== 'checkbox');
      status.textContent = needsFields
        ? 'Пожалуйста, укажите, как к вам обращаться, и телефон или Telegram.'
        : needsConsent
          ? 'Пожалуйста, подтвердите согласие на обработку персональных данных.'
          : '';
      invalid[0].focus();
      return;
    }

    // Отправка не подключена намеренно: показываем состояние «Спасибо»
    status.textContent = '';
    form.reset();
    form.hidden = true;
    done.hidden = false;
    done.focus();
  });

  again?.addEventListener('click', () => {
    done.hidden = true;
    form.hidden = false;
    form.querySelector<HTMLInputElement>('input')?.focus();
  });

  form.querySelectorAll('input, textarea').forEach((f) => {
    f.addEventListener('input', () => f.removeAttribute('aria-invalid'));
    f.addEventListener('change', () => f.removeAttribute('aria-invalid'));
  });
}

initReveal();
initAccordions();
initActiveNav();
initMenu();
initVideo();
initHeaderState();
initProcess();
initForm();
initCounters();
