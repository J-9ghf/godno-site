import type { ReactNode } from 'react';

/** Секция лендинга: шапка «линия → номер → метка» как на прежнем сайте. */
export function Section({
  id,
  num,
  label,
  tone = 'white',
  children,
  labelledBy,
}: {
  id: string;
  num: string;
  /** Метка над заголовком; не нужна, если заголовок совпадает с названием блока. */
  label?: string;
  tone?: 'white' | 'soft' | 'blue' | 'dark';
  children: ReactNode;
  labelledBy?: string;
}) {
  const bg = { white: 'bg-white', soft: 'bg-soft', blue: 'bg-blue-light', dark: 'bg-black text-white' }[tone];
  return (
    <section id={id} aria-labelledby={labelledBy ?? `${id}-title`} className={`section ${bg}`}>
      <div className="container-site">
        <p className={`mb-8 flex items-center gap-4 border-t pt-4 sm:mb-12 ${tone === 'dark' ? 'border-white/20' : 'border-line-strong'}`}>
          <span className="eyebrow text-blue" aria-hidden>
            {num}
          </span>
          {label && <span className="eyebrow">{label}</span>}
        </p>
        {children}
      </div>
    </section>
  );
}

/** Пометка для блоков, где длинный текст ещё не получен от заказчика. */
export function TextNeeded({ what = 'текст нужен' }: { what?: string }) {
  return (
    <span className="inline-flex items-center gap-2 rounded-sm border border-dashed border-line-strong bg-white px-3 py-1.5 text-sm font-semibold text-ink-3">
      <span aria-hidden>✎</span> {what}
    </span>
  );
}
