'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Logo } from '@/components/ui/Logo';
import { headerButtons, nav } from '@/content/landing';

/** Шапка: поверх видео прозрачная и светлая, после прокрутки — белая. На телефоне меню по кнопке. */
export function SiteHeader() {
  const [solid, setSolid] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setSolid(window.scrollY > window.innerHeight * 0.6);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  const light = !solid && !open;
  return (
    <header
      className={`fixed inset-x-0 top-0 z-40 transition-colors duration-300 ${light ? 'bg-transparent text-white' : 'border-b border-line bg-white text-black'}`}
    >
      <div className="container-site flex h-[72px] items-center justify-between gap-6">
        <Link href="#top" className="flex items-center gap-3" aria-label="Институт кадровых решений — наверх">
          <Logo height={36} ink={light ? '#ffffff' : undefined} accent={light ? '#a9c0ff' : undefined} />
          <span className={`hidden border-l pl-3 text-[11px] font-bold uppercase leading-tight tracking-[0.14em] sm:block ${light ? 'border-white/40' : 'border-line-strong'}`}>
            Институт
            <br />
            кадровых решений
          </span>
        </Link>

        <nav aria-label="Основное меню" className="hidden xl:block">
          <ul className="flex gap-6 text-sm font-semibold">
            {nav.map((item) => (
              <li key={item.href}>
                <a href={item.href} className="underline-offset-8 hover:underline">
                  {item.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>

        <div className="flex items-center gap-2">
          <Link
            href="/login"
            className={`hidden h-11 items-center rounded-md border px-4 text-sm font-semibold sm:inline-flex ${light ? 'border-white/60 hover:bg-white hover:text-black' : 'border-line-strong hover:border-black'}`}
          >
            {headerButtons.login}
          </Link>
          <a href="#contact" className="hidden h-11 items-center rounded-md bg-blue px-4 text-sm font-semibold text-white hover:bg-black md:inline-flex">
            {headerButtons.primary}
          </a>
          <button
            type="button"
            className="inline-flex h-11 w-11 items-center justify-center rounded-md xl:hidden"
            aria-expanded={open}
            aria-controls="mobile-menu"
            aria-label={open ? 'Закрыть меню' : 'Открыть меню'}
            onClick={() => setOpen((v) => !v)}
          >
            <span aria-hidden className="relative block h-3.5 w-6">
              <span className={`absolute left-0 h-0.5 w-6 bg-current transition-transform ${open ? 'top-1.5 rotate-45' : 'top-0'}`} />
              <span className={`absolute left-0 top-1.5 h-0.5 w-6 bg-current ${open ? 'opacity-0' : ''}`} />
              <span className={`absolute left-0 h-0.5 w-6 bg-current transition-transform ${open ? 'top-1.5 -rotate-45' : 'top-3'}`} />
            </span>
          </button>
        </div>
      </div>

      {open && (
        <nav id="mobile-menu" aria-label="Меню" className="border-t border-line bg-white xl:hidden">
          <ul className="container-site flex flex-col py-4 text-lg font-semibold">
            {nav.map((item) => (
              <li key={item.href}>
                <a href={item.href} onClick={() => setOpen(false)} className="block py-3">
                  {item.label}
                </a>
              </li>
            ))}
            <li className="mt-4 flex flex-col gap-3 sm:flex-row">
              <a href="#contact" onClick={() => setOpen(false)} className="inline-flex h-12 items-center justify-center rounded-md bg-blue px-6 text-white">
                {headerButtons.primary}
              </a>
              <Link href="/login" className="inline-flex h-12 items-center justify-center rounded-md border border-line-strong px-6">
                {headerButtons.login}
              </Link>
            </li>
          </ul>
        </nav>
      )}
    </header>
  );
}
