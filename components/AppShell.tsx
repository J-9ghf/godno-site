import Link from 'next/link';
import { IdleWatcher } from '@/components/IdleWatcher';
import { Brand } from '@/components/ui/Logo';
import type { Access } from '@/lib/auth/access';
import { idleMinutes } from '@/lib/session-config';

const roleLabel = { client: 'Клиент', manager: 'Менеджер', admin: 'Администратор' } as const;

export interface NavItem {
  href: string;
  label: string;
}

/** Каркас кабинета: шапка с навигацией и выходом, автовыход по бездействию. */
export function AppShell({ access, nav, children }: { access: Access; nav: NavItem[]; children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col bg-soft">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:rounded-md focus:bg-white focus:px-4 focus:py-2">
        К содержимому
      </a>
      <header className="border-b border-line bg-white">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-4 py-3 sm:px-8">
          <Brand compact />
          <div className="flex items-center gap-4 text-sm">
            <span className="hidden text-right sm:block">
              <span className="block font-semibold">{access.fullName || access.email}</span>
              <span className="block text-ink-3">
                {roleLabel[access.role]}
                {access.companyName ? ` · ${access.companyName}` : ''}
              </span>
            </span>
            <form action="/auth/signout" method="post">
              <button type="submit" className="h-10 rounded-md border border-line-strong px-4 font-semibold hover:border-black">
                Выйти
              </button>
            </form>
          </div>
        </div>
        <nav aria-label="Разделы" className="mx-auto max-w-7xl overflow-x-auto px-4 sm:px-8">
          <ul className="flex gap-6 text-sm font-semibold">
            {nav.map((item) => (
              <li key={item.href}>
                <Link href={item.href} className="block border-b-2 border-transparent py-3 text-ink-2 hover:border-blue hover:text-black">
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </header>
      <main id="main" className="mx-auto w-full max-w-7xl flex-1 px-4 py-8 sm:px-8">
        {children}
      </main>
      <IdleWatcher idleMinutes={idleMinutes()} />
    </div>
  );
}
