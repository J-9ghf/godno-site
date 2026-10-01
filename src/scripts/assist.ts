// ИКР.Ассистенты — интерактив и анимации.
// GSAP + ScrollTrigger только там, где нужна связка со скроллом; остальное — CSS.
// При prefers-reduced-motion анимации не запускаются, а все состояния показываются сразу (см. html.reduced в CSS).
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

gsap.registerPlugin(ScrollTrigger);

const root = document.documentElement;
const reduced = root.classList.contains('reduced');
const finePointer = matchMedia('(hover: hover) and (pointer: fine)').matches;

const $ = <T extends Element = HTMLElement>(s: string, el: ParentNode = document) => el.querySelector<T>(s as string) as T | null;
const $$ = <T extends Element = HTMLElement>(s: string, el: ParentNode = document) => Array.from(el.querySelectorAll<T>(s as string)) as T[];

/* ——————————————————— UI без анимаций ——————————————————— */

function initHeader() {
  const header = $('[data-header]');
  if (!header) return;
  let lastY = window.scrollY;
  const onScroll = () => {
    const y = window.scrollY;
    header.classList.toggle('is-scrolled', y > 8);
    const goingDown = y > lastY && y > 400;
    header.classList.toggle('is-hidden', goingDown);
    lastY = y;
  };
  onScroll();
  window.addEventListener('scroll', onScroll, { passive: true });

  // Текущий раздел в навигации
  const links = $$<HTMLAnchorElement>('[data-nav]');
  const map = new Map(links.map((a) => [a.getAttribute('href')!.slice(1), a]));
  const io = new IntersectionObserver(
    (entries) => {
      entries.forEach((e) => {
        if (!e.isIntersecting) return;
        links.forEach((l) => l.classList.remove('is-current'));
        map.get(e.target.id)?.classList.add('is-current');
      });
    },
    { rootMargin: '-45% 0px -50% 0px' },
  );
  map.forEach((_, id) => {
    const s = document.getElementById(id);
    if (s) io.observe(s);
  });
}

function initMenu() {
  const header = $('[data-header]');
  const btn = $<HTMLButtonElement>('[data-menu-toggle]');
  const menu = $('[data-menu]');
  if (!header || !btn || !menu) return;

  const set = (open: boolean) => {
    btn.setAttribute('aria-expanded', String(open));
    header.classList.toggle('is-open', open);
    document.body.style.overflow = open ? 'hidden' : '';
    if (open) {
      menu.hidden = false;
      requestAnimationFrame(() => menu.classList.add('is-in'));
    } else {
      menu.classList.remove('is-in');
      menu.hidden = true;
    }
  };
  btn.addEventListener('click', () => set(btn.getAttribute('aria-expanded') !== 'true'));
  $$('[data-menu-link]', menu).forEach((a) => a.addEventListener('click', () => set(false)));
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && btn.getAttribute('aria-expanded') === 'true') {
      set(false);
      btn.focus();
    }
  });
  matchMedia('(min-width: 1240px)').addEventListener('change', (e) => e.matches && set(false));
}

function initDock() {
  const dock = $('[data-dock]');
  const hero = $('#top');
  const contact = $('#contact');
  if (!dock || !hero || !contact) return;
  let pastHero = false;
  let atContact = false;
  const sync = () => dock.classList.toggle('is-visible', pastHero && !atContact);
  new IntersectionObserver(([e]) => {
    pastHero = !e.isIntersecting;
    sync();
  }).observe(hero);
  new IntersectionObserver(([e]) => {
    atContact = e.isIntersecting;
    sync();
  }).observe(contact);
}

function initFaq() {
  $$<HTMLDetailsElement>('[data-qa]').forEach((d) => {
    const summary = $('summary', d)!;
    const body = $('[data-qa-body]', d)!;
    let anim: Animation | null = null;

    summary.addEventListener('click', (e) => {
      if (reduced) return;
      e.preventDefault();
      anim?.cancel();
      if (!d.open) {
        d.open = true;
        const h = body.scrollHeight;
        anim = body.animate(
          [
            { height: '0px', opacity: 0 },
            { height: `${h}px`, opacity: 1 },
          ],
          { duration: 520, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' },
        );
        anim.onfinish = () => (anim = null);
      } else {
        const h = body.offsetHeight;
        anim = body.animate(
          [
            { height: `${h}px`, opacity: 1 },
            { height: '0px', opacity: 0 },
          ],
          { duration: 380, easing: 'cubic-bezier(0.65, 0, 0.35, 1)' },
        );
        anim.onfinish = () => {
          d.open = false;
          anim = null;
        };
      }
    });
  });
}

function initShots() {
  const track = $('[data-shots]');
  if (!track) return;
  const step = () => (track.firstElementChild as HTMLElement | null)?.offsetWidth ?? 300;
  const behavior: ScrollBehavior = reduced ? 'auto' : 'smooth';
  $('[data-shots-prev]')?.addEventListener('click', () => track.scrollBy({ left: -(step() + 14), behavior }));
  $('[data-shots-next]')?.addEventListener('click', () => track.scrollBy({ left: step() + 14, behavior }));
}

function initForm() {
  const form = $<HTMLFormElement>('[data-form]');
  if (!form) return;
  const fields = $('[data-form-fields]', form)!;
  const ok = $('[data-form-ok]', form)!;

  const check = (input: HTMLInputElement) => {
    const wrap = input.closest('.field, .consent');
    const valid = input.type === 'checkbox' ? input.checked : input.value.trim().length > 1;
    wrap?.classList.toggle('is-invalid', !valid);
    input.setAttribute('aria-invalid', String(!valid));
    return valid;
  };

  const required = $$<HTMLInputElement>('input[required]', form);
  required.forEach((i) =>
    i.addEventListener(i.type === 'checkbox' ? 'change' : 'blur', () => {
      if (i.closest('.is-invalid') || i.value) check(i);
    }),
  );

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const results = required.map(check);
    if (results.includes(false)) {
      required[results.indexOf(false)].focus();
      return;
    }
    // Отправка не подключена: здесь будет запрос в CRM / Telegram-бот.
    const show = () => {
      fields.hidden = true;
      ok.hidden = false;
      ok.focus();
    };
    if (reduced) show();
    else
      gsap.to(fields, {
        opacity: 0,
        y: -16,
        duration: 0.35,
        ease: 'power2.in',
        onComplete: () => {
          show();
          gsap.from(ok, { opacity: 0, y: 20, duration: 0.6, ease: 'expo.out' });
        },
      });
  });
}

/* ——————————————————— Анимации ——————————————————— */

const wordsOf = (el: Element) => $$('.w > span', el);

function initIntro() {
  const title = $('[data-hero-title]');
  const hl = $('[data-hl]');
  const tl = gsap.timeline({ defaults: { ease: 'expo.out' } });
  tl.fromTo('[data-hero-col]', { scaleY: 0, y: 0 }, { scaleY: 1, duration: 1.6, ease: 'expo.inOut', stagger: 0.05 }, 0);
  if (title) tl.fromTo(wordsOf(title), { yPercent: 105, y: 0 }, { yPercent: 0, y: 0, duration: 1.2, stagger: 0.07 }, 0.15);
  tl.fromTo('[data-hero-fade]', { opacity: 0, y: 28 }, { opacity: 1, y: 0, duration: 1.1, stagger: 0.12 }, 0.75);
  tl.add(() => hl?.classList.add('is-on'), 1.05);
}

function initWords() {
  $$('[data-words]').forEach((el) => {
    if (el.hasAttribute('data-hero-title')) return;
    gsap.fromTo(
      wordsOf(el),
      { yPercent: 105, y: 0 },
      {
        yPercent: 0,
        y: 0,
        duration: 1.1,
        ease: 'expo.out',
        stagger: 0.06,
        scrollTrigger: { trigger: el, start: 'top 88%', once: true },
      },
    );
  });
}

function initReveals() {
  ScrollTrigger.batch('[data-reveal]', {
    start: 'top 90%',
    once: true,
    onEnter: (batch) => {
      batch.forEach((el) => el.classList.add('is-in'));
      gsap.to(batch, { opacity: 1, y: 0, duration: 1.1, ease: 'expo.out', stagger: 0.1 });
    },
  });

  $$('[data-stagger]').forEach((group) => {
    const items = Array.from(group.children);
    gsap.to(items, {
      opacity: 1,
      y: 0,
      duration: 1,
      ease: 'expo.out',
      stagger: 0.1,
      scrollTrigger: {
        trigger: group,
        start: 'top 88%',
        once: true,
        onEnter: () => items.forEach((i) => i.classList.add('is-in')),
      },
    });
  });

  const once = (sel: string, cls = 'is-in', start = 'top 80%') =>
    $$(sel).forEach((el) =>
      ScrollTrigger.create({ trigger: el, start, once: true, onEnter: () => el.classList.add(cls) }),
    );
  once('[data-strike]', 'is-in', 'top 85%');
  once('[data-shield]', 'is-in', 'top 85%');
  once('[data-pay]', 'is-in', 'top 88%');

  $$('[data-progress]').forEach((el) => {
    const bar = $('.done__bar i', el);
    if (!bar) return;
    gsap.fromTo(
      bar,
      { scaleX: 0 },
      {
        scaleX: 1,
        duration: 1.6,
        ease: 'power3.inOut',
        scrollTrigger: { trigger: el, start: 'top 85%', once: true },
        onComplete: () => el.classList.add('is-done'),
      },
    );
  });

  // Линии меток секций
  $$('.sec-tag__line').forEach((l) =>
    gsap.fromTo(
      l,
      { scaleX: 0 },
      { scaleX: 1, duration: 1.2, ease: 'expo.inOut', scrollTrigger: { trigger: l, start: 'top 92%', once: true } },
    ),
  );
}

/** Анимирует все числа внутри строки: «5–7», «99%», «1500+». Ноль отсчитывается вниз. */
function initCounts() {
  $$('[data-count]').forEach((el) => {
    const source = el.textContent ?? '';
    const parts = source.split(/(\d+)/);
    const nums = parts.map((p) => (/^\d+$/.test(p) ? Number(p) : null));
    if (!nums.some((n) => n !== null)) return;
    const state = { t: 0 };
    const render = () => {
      el.textContent = parts
        .map((p, i) => {
          const n = nums[i];
          if (n === null) return p;
          return String(n === 0 ? Math.round(9 * (1 - state.t)) : Math.round(n * state.t));
        })
        .join('');
    };
    render();
    gsap.to(state, {
      t: 1,
      duration: 1.8,
      ease: 'power3.out',
      onUpdate: render,
      onComplete: () => (el.textContent = source),
      scrollTrigger: { trigger: el, start: 'top 90%', once: true },
    });
  });
}

function initScrubWords() {
  $$('[data-scrub-words]').forEach((el) => {
    const text = el.textContent?.trim() ?? '';
    el.setAttribute('aria-label', text);
    el.innerHTML = text
      .split(' ')
      .map((w) => `<span aria-hidden="true" style="display:inline-block">${w}</span>`)
      .join(' ');
    gsap.fromTo(
      el.children,
      { opacity: 0.14 },
      {
        opacity: 1,
        ease: 'none',
        stagger: 0.1,
        scrollTrigger: { trigger: el, start: 'top 85%', end: 'bottom 50%', scrub: true },
      },
    );
  });
}

function initScheme() {
  const scheme = $('[data-scheme]');
  if (!scheme) return;
  const nodes = $$('[data-node]', scheme);
  const fill = $('[data-scheme-fill]', scheme);
  let progress = 0;
  let hoverIdx = -1;

  const paint = () => {
    const reached = Math.round(progress * (nodes.length - 1) - 0.02);
    const upto = Math.max(reached, hoverIdx);
    nodes.forEach((n, i) => n.classList.toggle('is-active', i <= upto));
    fill?.style.setProperty('--p', String(hoverIdx >= 0 ? Math.max(progress, hoverIdx / (nodes.length - 1)) : progress));
    scheme.classList.toggle('is-complete', progress > 0.98 || hoverIdx === nodes.length - 1);
  };

  ScrollTrigger.create({
    trigger: scheme,
    start: 'top 75%',
    end: 'bottom 50%',
    scrub: 0.6,
    onUpdate: (self) => {
      progress = self.progress;
      paint();
    },
  });

  nodes.forEach((n, i) => {
    const on = () => {
      hoverIdx = i;
      paint();
    };
    const off = () => {
      hoverIdx = -1;
      paint();
    };
    n.addEventListener('mouseenter', on);
    n.addEventListener('mouseleave', off);
    n.addEventListener('focus', on);
    n.addEventListener('blur', off);
  });
  paint();
}

function initProcess() {
  const section = $('[data-process]');
  const track = $('[data-tl-track]');
  const fill = $('[data-tl-fill]');
  const counter = $('[data-process-current]');
  if (!section || !track || !fill) return;
  const steps = $$('[data-step]', section);

  const activate = (idx: number) => {
    steps.forEach((s, i) => s.classList.toggle('is-active', i <= idx));
    if (counter) counter.textContent = String(Math.max(idx, 0) + 1).padStart(2, '0');
  };

  const mm = gsap.matchMedia();

  mm.add('(min-width: 1024px)', () => {
    section.classList.add('is-horizontal');
    const dist = () => Math.max(0, track.scrollWidth - window.innerWidth);
    gsap.to(track, {
      x: () => -dist(),
      ease: 'none',
      scrollTrigger: {
        trigger: section,
        pin: true,
        start: 'top top',
        end: () => `+=${dist() + window.innerHeight * 0.3}`,
        scrub: 0.8,
        invalidateOnRefresh: true,
        onUpdate: (self) => {
          fill.style.setProperty('--p', String(self.progress));
          activate(Math.min(steps.length - 1, Math.floor(self.progress * steps.length * 0.999 + 0.25)));
        },
      },
    });
    return () => {
      section.classList.remove('is-horizontal');
      gsap.set(track, { clearProps: 'transform' });
    };
  });

  mm.add('(max-width: 1023px)', () => {
    ScrollTrigger.create({
      trigger: track,
      start: 'top 70%',
      end: 'bottom 60%',
      scrub: true,
      onUpdate: (self) => fill.style.setProperty('--p', String(self.progress)),
    });
    steps.forEach((s, i) =>
      ScrollTrigger.create({
        trigger: s,
        start: 'top 65%',
        onEnter: () => activate(i),
        onLeaveBack: () => activate(i - 1),
      }),
    );
  });
}

function initCases() {
  $$('[data-case]').forEach((c) => {
    const tl = gsap.timeline({ scrollTrigger: { trigger: c, start: 'top 85%', once: true } });
    tl.fromTo(
      c,
      { clipPath: 'inset(8% 4% 8% 4% round 32px)', y: 80, opacity: 0.4 },
      { clipPath: 'inset(0% 0% 0% 0% round 32px)', y: 0, opacity: 1, duration: 1.3, ease: 'expo.out' },
    );
    tl.fromTo(
      c.children,
      { y: 40, opacity: 0 },
      { y: 0, opacity: 1, duration: 1, ease: 'expo.out', stagger: 0.12 },
      0.15,
    );
    tl.add(() => gsap.set(c, { clearProps: 'clipPath' }));
  });
}

function initFinal() {
  const section = $('[data-final]');
  const panel = $('[data-final-panel]');
  if (!section || !panel) return;
  const mm = gsap.matchMedia();
  mm.add('(min-width: 0px)', () => {
    const x = Math.min(window.innerWidth * 0.04, 56);
    gsap.fromTo(
      panel,
      { '--inset-x': `${x}px`, '--inset-r': '40px' },
      {
        '--inset-x': '0px',
        '--inset-r': '0px',
        ease: 'none',
        scrollTrigger: { trigger: section, start: 'top bottom', end: 'top 15%', scrub: true },
      },
    );
  });
}

function initParallax() {
  $$('[data-parallax]').forEach((el) => {
    const speed = Number(el.dataset.parallax) || 0.2;
    gsap.fromTo(
      el,
      { yPercent: -speed * 40 },
      {
        yPercent: speed * 40,
        ease: 'none',
        scrollTrigger: { trigger: el.closest('section') ?? el, start: 'top bottom', end: 'bottom top', scrub: true },
      },
    );
  });
  $$('[data-parallax-img]').forEach((frame) => {
    const inner = frame.firstElementChild;
    if (!inner) return;
    gsap.fromTo(
      inner,
      { yPercent: -5 },
      { yPercent: 5, ease: 'none', scrollTrigger: { trigger: frame, start: 'top bottom', end: 'bottom top', scrub: true } },
    );
  });
}

function initPointer() {
  if (!finePointer) return;

  $$('[data-magnetic]').forEach((el) => {
    const xTo = gsap.quickTo(el, 'x', { duration: 0.6, ease: 'power3.out' });
    const yTo = gsap.quickTo(el, 'y', { duration: 0.6, ease: 'power3.out' });
    el.addEventListener('pointermove', (e) => {
      const r = el.getBoundingClientRect();
      xTo((e.clientX - r.left - r.width / 2) * 0.18);
      yTo((e.clientY - r.top - r.height / 2) * 0.3);
    });
    el.addEventListener('pointerleave', () => {
      xTo(0);
      yTo(0);
    });
  });

  $$('[data-tilt]').forEach((el) => {
    gsap.set(el, { transformPerspective: 1000 });
    const rx = gsap.quickTo(el, 'rotationX', { duration: 0.8, ease: 'power3.out' });
    const ry = gsap.quickTo(el, 'rotationY', { duration: 0.8, ease: 'power3.out' });
    const ty = gsap.quickTo(el, 'yPercent', { duration: 0.8, ease: 'power3.out' });
    el.addEventListener('pointermove', (e) => {
      const r = el.getBoundingClientRect();
      const px = (e.clientX - r.left) / r.width - 0.5;
      const py = (e.clientY - r.top) / r.height - 0.5;
      ry(px * 5);
      rx(-py * 5);
      ty(-1.2);
    });
    el.addEventListener('pointerleave', () => {
      rx(0);
      ry(0);
      ty(0);
    });
  });
}

/* ——————————————————— Запуск ——————————————————— */

initHeader();
initMenu();
initDock();
initFaq();
initShots();
initForm();

if (reduced) {
  $('[data-hl]')?.classList.add('is-on');
  $$('[data-node]').forEach((n) => n.classList.add('is-active'));
  $$('[data-step]').forEach((s) => s.classList.add('is-active'));
  $$('[data-progress]').forEach((p) => p.classList.add('is-done'));
} else {
  initIntro();
  initWords();
  initReveals();
  initCounts();
  initScrubWords();
  initScheme();
  initProcess();
  initCases();
  initFinal();
  initParallax();
  initPointer();
  document.fonts?.ready.then(() => ScrollTrigger.refresh());
  window.addEventListener('load', () => ScrollTrigger.refresh());
}
