// ИКР.Ассистенты — вариант 2 «Маршрут». Системные анимации:
// typography reveal · scroll transformation · sticky storytelling · horizontal movement ·
// number animation · line drawing · image reveal · hover/cursor · section transitions.
// prefers-reduced-motion: ничего не движется, все состояния видны сразу.
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

gsap.registerPlugin(ScrollTrigger);

const root = document.documentElement;
const reduced = root.classList.contains('reduced');
const fine = matchMedia('(hover: hover) and (pointer: fine)').matches;

const $ = <T extends Element = HTMLElement>(s: string, el: ParentNode = document) => el.querySelector(s) as T | null;
const $$ = <T extends Element = HTMLElement>(s: string, el: ParentNode = document) => Array.from(el.querySelectorAll(s)) as T[];

/* ———————————— Подгонка гигантской типографики под ширину ———————————— */

function textRight(el: Element) {
  const r = document.createRange();
  r.selectNodeContents(el);
  return r.getBoundingClientRect().right;
}

function fitAll() {
  $$('[data-fit]').forEach((el) => {
    el.style.fontSize = '';
    const box = el.parentElement!;
    const avail = box.clientWidth - parseFloat(getComputedStyle(box).paddingLeft) - parseFloat(getComputedStyle(box).paddingRight);
    const w = textRight(el) - el.getBoundingClientRect().left;
    const fs = parseFloat(getComputedStyle(el).fontSize);
    const k = innerWidth < 768 ? 1 : Number(el.dataset.fit);
    if (w > 0) el.style.fontSize = `${(fs * avail * k) / w}px`;
  });
  placeFacts();
  $$('[data-fit-group]').forEach((el) => {
    el.style.fontSize = '';
    const left = el.getBoundingClientRect().left;
    const w = Math.max(...Array.from(el.children).map((c) => textRight(c) - left));
    const fs = parseFloat(getComputedStyle(el).fontSize);
    if (w > 0) el.style.fontSize = `${(fs * el.clientWidth * Number(el.dataset.fitGroup)) / w}px`;
  });
}

/** Первый экран: факты «плавают» в пустотах рядом с гигантскими строками */
function placeFacts() {
  const facts = $$('.fx');
  const a = $('[data-hr-a]');
  const b = $('[data-hr-b]');
  const box = $('[data-hr-in]');
  if (facts.length < 3 || !a || !b || !box) return;
  const put = (f: HTMLElement, l: number | null, t = 0, w = 0) => {
    f.style.left = l === null ? '' : `${l}px`;
    f.style.top = l === null ? '' : `${t}px`;
    f.style.width = l === null ? '' : `${w}px`;
  };
  if (innerWidth < 1024) return facts.forEach((f) => put(f, null));
  const base = box.getBoundingClientRect();
  const pad = parseFloat(getComputedStyle(box).paddingRight);
  const ra = a.getBoundingClientRect();
  const rb = b.getBoundingClientRect();
  const aRight = textRight(a);
  const bLeft = rb.right - (textRight(b) - rb.left);
  const [f1, f2, f3] = facts;
  const gap = 24;
  // справа от «в разы» — два факта рядом
  const free = base.right - pad - aRight - gap;
  const w = Math.max(120, (free - gap) / 2);
  put(f1, aRight - base.left + gap, ra.top - base.top + ra.height * 0.18, w);
  put(f2, aRight - base.left + gap * 2 + w, ra.top - base.top + ra.height * 0.18, w);
  // слева от «больше» — третий
  put(f3, pad, rb.top - base.top + rb.height * 0.18, Math.max(140, bLeft - base.left - pad - gap));
}

/* ———————————— UI ———————————— */

function initHeader() {
  const hd = $('[data-hd]');
  const btn = $<HTMLButtonElement>('[data-nav-toggle]');
  const nav = $('[data-nav]');
  if (!hd || !btn || !nav) return;
  let last = scrollY;
  addEventListener(
    'scroll',
    () => {
      const y = scrollY;
      hd.classList.toggle('is-up', y > last && y > 300);
      last = y;
    },
    { passive: true },
  );

  const label = $('[data-open-label]', btn);
  let t: number | undefined;
  const set = (open: boolean) => {
    clearTimeout(t);
    btn.setAttribute('aria-expanded', String(open));
    hd.classList.toggle('is-open', open);
    if (label) label.textContent = open ? 'Закрыть' : 'Меню';
    document.body.style.overflow = open ? 'hidden' : '';
    if (open) {
      nav.hidden = false;
      requestAnimationFrame(() => requestAnimationFrame(() => nav.classList.add('is-in')));
    } else {
      nav.classList.remove('is-in');
      t = window.setTimeout(() => (nav.hidden = true), reduced ? 0 : 900);
    }
  };
  btn.addEventListener('click', () => set(btn.getAttribute('aria-expanded') !== 'true'));
  $$('[data-nav-link]', nav).forEach((a) => a.addEventListener('click', () => set(false)));
  addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && btn.getAttribute('aria-expanded') === 'true') {
      set(false);
      btn.focus();
    }
  });
}

function initDock() {
  const dk = $('[data-dk]');
  const hero = $('#top');
  const contact = $('#contact');
  if (!dk || !hero || !contact) return;
  let past = false;
  let at = false;
  const sync = () => dk.classList.toggle('is-on', past && !at);
  new IntersectionObserver(([e]) => ((past = !e.isIntersecting), sync())).observe(hero);
  new IntersectionObserver(([e]) => ((at = e.isIntersecting), sync())).observe(contact);
}

function initRail() {
  const fill = $('[data-rail-fill]');
  const st = $$('[data-rail-st]');
  if (!fill) return;
  const upd = () => {
    const max = document.documentElement.scrollHeight - innerHeight;
    const p = max > 0 ? Math.min(1, scrollY / max) : 0;
    fill.style.setProperty('--p', String(p));
    let cur = 0;
    st.forEach((s, i) => {
      const on = p >= Number(s.dataset.railSt) - 0.001;
      s.classList.toggle('is-on', on);
      if (on) cur = i;
    });
    st.forEach((s, i) => s.classList.toggle('is-cur', i === cur));
  };
  upd();
  addEventListener('scroll', upd, { passive: true });
}

function initFaq() {
  $$<HTMLDetailsElement>('[data-qa]').forEach((d) => {
    const body = $('[data-qa-body]', d)!;
    const p = $('p', body)!;
    let anim: Animation | null = null;
    $('summary', d)!.addEventListener('click', (e) => {
      if (reduced) return;
      e.preventDefault();
      anim?.cancel();
      if (!d.open) {
        d.open = true;
        const h = body.scrollHeight;
        anim = body.animate([{ height: '0px' }, { height: `${h}px` }], { duration: 650, easing: 'cubic-bezier(0.16, 1, 0.3, 1)' });
        p.animate(
          [
            { opacity: 0, transform: 'translateY(24px)', clipPath: 'inset(0 0 100% 0)' },
            { opacity: 1, transform: 'none', clipPath: 'inset(0 0 0% 0)' },
          ],
          { duration: 800, easing: 'cubic-bezier(0.16, 1, 0.3, 1)' },
        );
        anim.onfinish = () => (anim = null);
      } else {
        anim = body.animate([{ height: `${body.offsetHeight}px` }, { height: '0px' }], {
          duration: 450,
          easing: 'cubic-bezier(0.76, 0, 0.24, 1)',
        });
        anim.onfinish = () => {
          d.open = false;
          anim = null;
        };
      }
    });
  });
}

function initShots() {
  const tr = $('[data-sh]');
  if (!tr) return;
  const step = () => ((tr.firstElementChild as HTMLElement)?.offsetWidth ?? 280) + 12;
  const behavior: ScrollBehavior = reduced ? 'auto' : 'smooth';
  $('[data-sh-prev]')?.addEventListener('click', () => tr.scrollBy({ left: -step(), behavior }));
  $('[data-sh-next]')?.addEventListener('click', () => tr.scrollBy({ left: step(), behavior }));
}

function initForm() {
  const form = $<HTMLFormElement>('[data-form]');
  if (!form) return;
  const fields = $('[data-form-fields]', form)!;
  const ok = $('[data-form-ok]', form)!;
  const req = $$<HTMLInputElement>('input[required]', form);
  const check = (i: HTMLInputElement) => {
    const valid = i.type === 'checkbox' ? i.checked : i.value.trim().length > 1;
    i.closest('.fd, .cn')?.classList.toggle('is-invalid', !valid);
    i.setAttribute('aria-invalid', String(!valid));
    return valid;
  };
  req.forEach((i) => i.addEventListener(i.type === 'checkbox' ? 'change' : 'blur', () => i.closest('.is-invalid') && check(i)));
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const res = req.map(check);
    if (res.includes(false)) return req[res.indexOf(false)].focus();
    // Отправка не подключена: здесь будет запрос в CRM / Telegram-бот.
    const show = () => {
      fields.hidden = true;
      ok.hidden = false;
      ok.focus();
      if (!reduced) gsap.from(ok.children, { y: 60, opacity: 0, duration: 1, ease: 'expo.out', stagger: 0.1 });
    };
    if (reduced) show();
    else gsap.to(fields, { opacity: 0, y: -30, duration: 0.4, ease: 'power2.in', onComplete: show });
  });
}

function initCursor() {
  const c = $('[data-cursor]');
  if (!c || !fine || reduced) return;
  const label = $('[data-cursor-label]', c)!;
  const x = gsap.quickTo(c, 'x', { duration: 0.35, ease: 'power3.out' });
  const y = gsap.quickTo(c, 'y', { duration: 0.35, ease: 'power3.out' });
  addEventListener('pointermove', (e) => {
    x(e.clientX);
    y(e.clientY);
  });
  document.addEventListener('pointerover', (e) => {
    const t = (e.target as Element).closest('a, button, summary, label, [data-ai-node], input, textarea');
    c.classList.toggle('is-hover', !!t && !t.matches('input, textarea'));
    const txt = t?.closest<HTMLElement>('[data-cursor-text]')?.dataset.cursorText;
    label.textContent = txt ?? '';
    c.classList.toggle('is-label', !!txt);
  });
}

/* ———————————— Анимации ———————————— */

const words = (el: Element) => $$('.w > span', el);

function initHero() {
  const hr = $('[data-hr]');
  if (!hr) return;
  const title = $('[data-hr-title]', hr)!;
  const route = $<SVGPathElement>('[data-hr-route]', hr);
  const tl = gsap.timeline({ defaults: { ease: 'expo.out' }, delay: 0.1 });
  tl.fromTo(words(title), { yPercent: 115, y: 0 }, { yPercent: 0, y: 0, duration: 1.4, stagger: 0.08 }, 0);
  if (route) {
    const L = route.getTotalLength();
    route.style.strokeDasharray = `${L}`;
    tl.fromTo(route, { strokeDashoffset: L }, { strokeDashoffset: 0, duration: 2, ease: 'power2.inOut' }, 0.6);
    tl.add(() => (route.style.strokeDasharray = ''), '>');
  }
  tl.fromTo('[data-hr-fade]', { opacity: 0, y: 30 }, { opacity: 1, y: 0, duration: 1.1, stagger: 0.1 }, 0.7);

  // Уход первого экрана: гигантские строки разъезжаются, экран «уезжает» под следующую секцию
  const st = { trigger: hr, start: 'top top', end: 'bottom top', scrub: true };
  gsap.to('[data-hr-a]', { xPercent: 12, ease: 'none', scrollTrigger: st });
  gsap.to('[data-hr-b]', { xPercent: -14, ease: 'none', scrollTrigger: st });
  gsap.to('[data-hr-in]', { scale: 0.92, opacity: 0.25, yPercent: 12, ease: 'none', scrollTrigger: { ...st, start: 'center top' } });
}

function initWords() {
  $$('[data-words]').forEach((el) => {
    if (el.hasAttribute('data-hr-title')) return;
    gsap.fromTo(
      words(el),
      { yPercent: 115, y: 0 },
      { yPercent: 0, y: 0, duration: 1.2, ease: 'expo.out', stagger: 0.07, scrollTrigger: { trigger: el, start: 'top 88%', once: true } },
    );
  });
}

function initFades() {
  ScrollTrigger.batch('[data-fade]', {
    start: 'top 90%',
    once: true,
    onEnter: (b) => {
      b.forEach((e) => e.classList.add('is-in'));
      gsap.to(b, { opacity: 1, y: 0, duration: 1.2, ease: 'expo.out', stagger: 0.1 });
    },
  });
  $$('[data-fade-group]').forEach((g) =>
    gsap.to(g.children, { opacity: 1, y: 0, duration: 1.1, ease: 'expo.out', stagger: 0.1, scrollTrigger: { trigger: g, start: 'top 88%', once: true } }),
  );
  $$('[data-strike]').forEach((el) =>
    ScrollTrigger.create({ trigger: el, start: 'top 85%', once: true, onEnter: () => el.classList.add('is-in') }),
  );
  $$('[data-pay]').forEach((el) =>
    ScrollTrigger.create({ trigger: el, start: 'top 85%', once: true, onEnter: () => el.classList.add('is-in') }),
  );
}

/** Линии, которые строятся по мере скролла */
function initDraw() {
  $$<SVGPathElement>('[data-draw]').forEach((p) => {
    const L = p.getTotalLength();
    gsap.set(p, { strokeDasharray: L, strokeDashoffset: L });
    gsap.to(p, {
      strokeDashoffset: 0,
      ease: 'none',
      scrollTrigger: { trigger: p.closest('svg')!.parentElement!, start: 'top 80%', end: 'bottom 55%', scrub: 0.8 },
    });
  });
}

function initCounts() {
  $$('[data-count]').forEach((el) => {
    const src = el.textContent ?? '';
    const parts = src.split(/(\d+)/);
    const nums = parts.map((p) => (/^\d+$/.test(p) ? Number(p) : null));
    if (!nums.some((n) => n !== null)) return;
    const s = { t: 0 };
    const render = () =>
      (el.textContent = parts
        .map((p, i) => (nums[i] === null ? p : String(nums[i] === 0 ? Math.round(9 * (1 - s.t)) : Math.round(nums[i]! * s.t))))
        .join(''));
    render();
    gsap.to(s, {
      t: 1,
      duration: 2,
      ease: 'power3.out',
      onUpdate: render,
      onComplete: () => (el.textContent = src),
      scrollTrigger: { trigger: el, start: 'top 92%', once: true },
    });
  });
}

/** «Зачем»: на desktop — горизонтальное путешествие, на mobile — вертикальный маршрут */
function initWhy() {
  const sec = $('[data-wy]');
  const track = $('[data-wy-track]');
  const fill = $('[data-wy-fill]');
  if (!sec || !track || !fill) return;
  const panels = $$('[data-wy-panel]', sec);
  const mm = gsap.matchMedia();

  mm.add('(min-width: 1024px)', () => {
    sec.classList.add('is-h');
    const dist = () => Math.max(0, track.scrollWidth - innerWidth);
    gsap.to(track, {
      x: () => -dist(),
      ease: 'none',
      scrollTrigger: {
        trigger: sec,
        pin: true,
        start: 'top top',
        end: () => `+=${dist()}`,
        scrub: 0.9,
        invalidateOnRefresh: true,
        onUpdate: (self) => {
          fill.style.setProperty('--p', String(self.progress));
          panels.forEach((p) => {
            const r = p.getBoundingClientRect();
            p.classList.toggle('is-on', r.left < innerWidth * 0.7);
          });
        },
      },
    });
    return () => {
      sec.classList.remove('is-h');
      gsap.set(track, { clearProps: 'transform' });
    };
  });

  mm.add('(max-width: 1023px)', () => {
    ScrollTrigger.create({
      trigger: track,
      start: 'top 70%',
      end: 'bottom 70%',
      scrub: true,
      onUpdate: (s) => fill.style.setProperty('--p', String(s.progress)),
    });
    panels.forEach((p) =>
      ScrollTrigger.create({ trigger: p, start: 'top 70%', onEnter: () => p.classList.add('is-on'), onLeaveBack: () => p.classList.remove('is-on') }),
    );
  });

  $$('[data-scale]').forEach((el) =>
    gsap.fromTo(el, { scale: 0.55 }, { scale: 1, ease: 'none', scrollTrigger: { trigger: el.parentElement!, start: 'top bottom', end: 'center 60%', scrub: true } }),
  );
}

/** ИИ + ассистент: точка идёт по маршруту, станции включаются по очереди */
function initAi() {
  const sec = $('[data-ai]');
  const stage = $('[data-ai-stage]');
  const dot = $('[data-ai-dot]');
  const concl = $('[data-ai-concl]');
  if (!sec || !stage || !dot) return;
  const nodes = $$('[data-ai-node]', sec);

  const setup = (kind: 'h' | 'v', pin: boolean) => {
    const svg = $(`[data-ai-svg="${kind}"]`, stage)!;
    const path = $<SVGPathElement>('[data-ai-path]', svg)!;
    const L = path.getTotalLength();
    const vb = (svg as unknown as SVGSVGElement).viewBox.baseVal;
    path.style.strokeDasharray = `${L}`;
    const at = (f: number) => {
      const pt = path.getPointAtLength(L * f);
      return { x: (pt.x / vb.width) * 100, y: (pt.y / vb.height) * 100 };
    };
    nodes.forEach((n) => {
      const { x, y } = at(Number(n.dataset.aiNode));
      n.style.left = `${x}%`;
      n.style.top = `${y}%`;
      const right = x > 85;
      n.style.translate = right ? '-100% 0' : '0 0';
      n.style.textAlign = right ? 'right' : 'left';
    });
    concl?.classList.add('is-wait');
    const paint = (p: number) => {
      path.style.strokeDashoffset = String(L * (1 - p));
      const { x, y } = at(p);
      dot.style.left = `${x}%`;
      dot.style.top = `${y}%`;
      nodes.forEach((n) => n.classList.toggle('is-on', p >= Number(n.dataset.aiNode) - 0.015 || n.matches(':hover')));
      concl?.classList.toggle('is-wait', p < 0.97);
    };
    paint(0);
    ScrollTrigger.create({
      trigger: pin ? sec : stage,
      pin: pin ? $('[data-ai-pin]', sec) : false,
      start: pin ? 'top top' : 'top 65%',
      end: pin ? '+=220%' : 'bottom 60%',
      scrub: 0.7,
      onUpdate: (s) => paint(s.progress),
    });
    return () => {
      concl?.classList.remove('is-wait');
      nodes.forEach((n) => (n.style.cssText = ''));
    };
  };

  const mm = gsap.matchMedia();
  mm.add('(min-width: 900px)', () => {
    sec.classList.add('is-pinned');
    const undo = setup('h', true);
    return () => {
      sec.classList.remove('is-pinned');
      undo();
    };
  });
  mm.add('(max-width: 899px)', () => setup('v', false));
}

function initReasons() {
  $$('[data-reason]').forEach((row) => {
    const line = $('.rs__line', row);
    const tl = gsap.timeline({ scrollTrigger: { trigger: row, start: 'top 82%', once: true, onEnter: () => row.classList.add('is-in') } });
    if (line) tl.fromTo(line, { scaleX: 0 }, { scaleX: 1, duration: 1.2, ease: 'expo.inOut' });
    tl.fromTo(Array.from(row.children).slice(1), { y: 50, opacity: 0 }, { y: 0, opacity: 1, duration: 1.1, ease: 'expo.out', stagger: 0.1 }, 0.3);
  });
}

function initAbout() {
  $$('[data-reveal-img]').forEach((fig) => {
    const mask = $('.ab__mask', fig)!;
    const inner = $('[data-img-inner], img', mask);
    gsap.fromTo(mask, { '--clip': '100%' }, { '--clip': '0%', ease: 'none', scrollTrigger: { trigger: fig, start: 'top 90%', end: 'top 35%', scrub: true } });
    if (inner)
      gsap.fromTo(inner, { scale: 1.25, yPercent: -6 }, { scale: 1, yPercent: 6, ease: 'none', scrollTrigger: { trigger: fig, start: 'top bottom', end: 'bottom top', scrub: true } });
  });
}

function initProcess() {
  const sec = $('[data-pr]');
  const list = $('[data-pr-steps]');
  const fill = $('[data-pr-fill]');
  const strip = $('[data-pr-strip]');
  if (!sec || !list || !fill) return;
  const steps = $$('[data-pr-step]', sec);
  const set = (idx: number) => {
    steps.forEach((s, i) => s.classList.toggle('is-on', i <= idx));
    if (strip) strip.style.transform = `translateY(${-Math.max(idx, 0) * 0.8}em)`;
  };
  ScrollTrigger.create({ trigger: list, start: 'top 60%', end: 'bottom 60%', scrub: true, onUpdate: (s) => fill.style.setProperty('--p', String(s.progress)) });
  steps.forEach((s, i) =>
    ScrollTrigger.create({ trigger: s, start: 'top 42%', onEnter: () => set(i), onLeaveBack: () => set(i - 1) }),
  );
}

function initCases() {
  $$('[data-drift]').forEach((el) =>
    gsap.fromTo(el, { xPercent: 4 }, { xPercent: Number(el.dataset.drift), ease: 'none', scrollTrigger: { trigger: el, start: 'top bottom', end: 'bottom top', scrub: true } }),
  );
  const num = $('[data-k3-num]');
  if (num)
    gsap.fromTo(num, { scale: 0.3, opacity: 0.2 }, { scale: 1, opacity: 1, ease: 'none', scrollTrigger: { trigger: '[data-k3]', start: 'top 95%', end: 'center 55%', scrub: true } });
}

function initFinal() {
  const fn = $('[data-fn]');
  if (!fn) return;
  const st = { trigger: fn, start: 'top bottom', end: 'top 25%', scrub: true };
  gsap.fromTo('.fn__l--1', { xPercent: -14 }, { xPercent: 0, ease: 'none', scrollTrigger: st });
  gsap.fromTo('.fn__l--2', { xPercent: 18 }, { xPercent: 0, ease: 'none', scrollTrigger: st });
  gsap.fromTo('.fn__l--3', { xPercent: -10 }, { xPercent: 0, ease: 'none', scrollTrigger: st });
}

/* ———————————— Запуск ———————————— */

fitAll();
initHeader();
initDock();
initRail();
initFaq();
initShots();
initForm();
initCursor();

let resizeT: number | undefined;
let lastW = innerWidth;
addEventListener('resize', () => {
  if (innerWidth === lastW) return;
  lastW = innerWidth;
  clearTimeout(resizeT);
  resizeT = window.setTimeout(() => {
    fitAll();
    if (!reduced) ScrollTrigger.refresh();
  }, 150);
});

if (!reduced) {
  initHero();
  initWords();
  initFades();
  initDraw();
  initCounts();
  initWhy();
  initAi();
  initReasons();
  initAbout();
  initProcess();
  initCases();
  initFinal();
}

document.fonts?.ready.then(() => {
  fitAll();
  if (!reduced) ScrollTrigger.refresh();
});
addEventListener('load', () => !reduced && ScrollTrigger.refresh());
