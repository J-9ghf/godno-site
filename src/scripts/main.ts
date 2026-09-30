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

/* ── Reviews slider: стрелки, счётчик, прогресс ───────────── */
function initSlider() {
  document.querySelectorAll<HTMLElement>('[data-slider]').forEach((slider) => {
    const track = slider.querySelector<HTMLElement>('[data-slider-track]');
    const bar = slider.querySelector<HTMLElement>('[data-slider-progress]');
    const current = slider.querySelector<HTMLElement>('[data-slider-current]');
    const prev = slider.querySelector<HTMLButtonElement>('[data-slider-prev]');
    const next = slider.querySelector<HTMLButtonElement>('[data-slider-next]');
    const slides = [...slider.querySelectorAll<HTMLElement>('[data-slide]')];
    if (!track || !slides.length) return;

    const update = () => {
      const max = track.scrollWidth - track.clientWidth;
      const ratio = max > 0 ? track.scrollLeft / max : 1;
      const visible = track.clientWidth / track.scrollWidth;
      bar?.style.setProperty('--p', (visible + (1 - visible) * ratio).toFixed(3));

      const left = track.getBoundingClientRect().left;
      let idx = slides.findIndex((s) => s.getBoundingClientRect().left >= left - 8);
      if (ratio > 0.99) idx = slides.length - 1;
      if (current) current.textContent = String(Math.max(idx, 0) + 1).padStart(2, '0');
      if (prev) prev.disabled = track.scrollLeft <= 2;
      if (next) next.disabled = track.scrollLeft >= max - 2;
    };

    const step = (dir: number) => {
      const w = slides[0].getBoundingClientRect().width;
      track.scrollBy({ left: dir * w, behavior: reduceMotion ? 'auto' : 'smooth' });
    };

    prev?.addEventListener('click', () => step(-1));
    next?.addEventListener('click', () => step(1));
    track.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update);
    update();
  });
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

/* ── Form ─────────────────────────────────────────────────── */
function initForm() {
  const form = document.querySelector<HTMLFormElement>('[data-form]');
  const status = form?.querySelector<HTMLElement>('[data-form-status]');
  if (!form || !status) return;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    let firstInvalid: HTMLInputElement | null = null;
    form.querySelectorAll<HTMLInputElement>('[required]').forEach((field) => {
      const ok = field.type === 'checkbox' ? field.checked : field.value.trim().length > 0;
      field.setAttribute('aria-invalid', String(!ok));
      if (!ok && !firstInvalid) firstInvalid = field;
    });
    if (firstInvalid) {
      (firstInvalid as HTMLInputElement).focus();
      status.textContent = 'Пожалуйста, укажите имя, способ связи и подтвердите согласие на обработку данных.';
      return;
    }

    const endpoint = form.dataset.endpoint;
    if (!endpoint) {
      status.textContent = 'Форма ещё не подключена к обработчику заявок (PUBLIC_FORM_ENDPOINT).';
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
initSlider();
initProcess();
initForm();
