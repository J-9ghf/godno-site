import Link from 'next/link';
import { Brand } from '@/components/ui/Logo';
import { requisites } from '@/content/landing';

/** Заглушка юридической страницы: текст готовит и проверяет юрист. */
export function LegalStub({ title, about }: { title: string; about: string }) {
  return (
    <div className="min-h-dvh bg-soft">
      <header className="container-site py-6">
        <Link href="/" aria-label="На главную" className="inline-block"><Brand compact /></Link>
      </header>
      <main className="container-site pb-20">
        <article className="max-w-3xl rounded-lg bg-white p-6 sm:p-10">
          <h1 className="t-2">{title}</h1>
          <div role="note" className="mt-8 rounded-md border-l-4 border-blue bg-blue-light px-5 py-4">
            <p className="font-bold">Текст документа проверяет юрист</p>
            <p className="mt-1 text-ink-2">Страница появится после согласования. {about}</p>
          </div>
          <p className="mt-8 text-sm text-ink-3">Оператор персональных данных:</p>
          <address className="mt-2 not-italic text-ink-2">
            {requisites.map((r) => <span key={r} className="block">{r}</span>)}
            <span className="block">Почта: yakovlevassistant@gmail.com</span>
          </address>
          <Link href="/" className="mt-10 inline-flex h-12 items-center rounded-md bg-blue px-6 font-semibold text-white hover:bg-black">На главную</Link>
        </article>
      </main>
    </div>
  );
}
