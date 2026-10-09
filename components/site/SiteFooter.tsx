import Link from 'next/link';
import { contacts, legalLinks, motto, nav, requisites } from '@/content/landing';

export function SiteFooter() {
  return (
    <footer className="bg-black text-white">
      <div className="container-site grid gap-12 py-16 md:grid-cols-12">
        <div className="md:col-span-5">
          <p className="t-3 max-w-[18ch]">{motto}</p>
          <ul className="mt-8 flex flex-col gap-3 text-lg font-semibold">
            <li><a href={contacts.telegram.href} className="hover:text-[#a9c0ff]" rel="noopener" target="_blank">Telegram {contacts.telegram.label}</a></li>
            <li><a href={contacts.phone.href} className="hover:text-[#a9c0ff]">{contacts.phone.label}</a></li>
            <li><a href={contacts.email.href} className="hover:text-[#a9c0ff]">{contacts.email.label}</a></li>
          </ul>
        </div>
        <nav aria-label="Разделы сайта" className="md:col-span-3">
          <p className="eyebrow text-white/60">Разделы</p>
          <ul className="mt-4 flex flex-col gap-2">
            {nav.map((item) => (
              <li key={item.href}><a href={item.href} className="text-white/85 hover:text-white">{item.label}</a></li>
            ))}
            <li><Link href="/login" className="text-white/85 hover:text-white">Вход для клиентов</Link></li>
          </ul>
        </nav>
        <div className="md:col-span-4">
          <p className="eyebrow text-white/60">Документы</p>
          <ul className="mt-4 flex flex-col gap-2">
            {legalLinks.map((l) => (
              <li key={l.href}><Link href={l.href} className="text-white/85 hover:text-white">{l.label}</Link></li>
            ))}
          </ul>
          <address className="mt-8 text-sm not-italic leading-relaxed text-white/70">
            {requisites.map((r) => (
              <span key={r} className="block">{r}</span>
            ))}
            <span className="block">Почта: {contacts.email.label}</span>
          </address>
        </div>
      </div>
    </footer>
  );
}
