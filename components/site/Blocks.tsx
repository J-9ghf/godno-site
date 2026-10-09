import Link from 'next/link';
import {
  cabinet,
  candidateReport,
  cases,
  directions,
  faq,
  guarantees,
  principles,
  stats,
  steps,
  whyHard,
} from '@/content/landing';
import { Section, TextNeeded } from './Section';

const pad = (n: number) => String(n).padStart(2, '0');

/** 3. Цифры. */
export function Stats() {
  return (
    <section aria-label="Цифры" className="border-b border-line bg-white">
      <dl className="container-site grid grid-cols-1 divide-y divide-line sm:grid-cols-2 sm:divide-y-0 lg:grid-cols-4">
        {stats.map((s) => (
          <div key={s.label} className="flex flex-col gap-3 py-10 sm:pr-8 lg:border-l lg:border-line lg:pl-8 lg:first:border-l-0 lg:first:pl-0">
            <dt className="order-2 max-w-[24ch] text-ink-2">{s.label}</dt>
            <dd className="num-big order-1 text-blue">{s.value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

/** 4. Направления. */
export function Directions() {
  return (
    <Section id="directions" num="01">
      <h2 id="directions-title" className="t-2 max-w-4xl">Направления</h2>
      <div className="mt-12 grid grid-cols-1 gap-6 lg:grid-cols-3">
        {directions.map((d, i) => (
          <article key={d.title} className="flex flex-col rounded-lg border border-line bg-white p-6 sm:p-8">
            <span className="eyebrow text-blue" aria-hidden>{pad(i + 1)}</span>
            <h3 className="t-3 mt-4">{d.title}</h3>
            <p className="mt-4 text-ink-2">{d.text}</p>
            <details className="group mt-auto pt-6">
              <summary className="inline-flex items-center gap-2 font-semibold text-blue">
                Подробнее <span aria-hidden className="transition-transform group-open:rotate-90">→</span>
              </summary>
              <div className="mt-4 text-ink-2">{d.more ?? <TextNeeded />}</div>
            </details>
          </article>
        ))}
      </div>
    </Section>
  );
}

/** 5. Почему сложно найти самим. */
export function WhyHard() {
  return (
    <Section id="why" num="02" label="Почему сложно найти самим" tone="soft">
      <div className="grid grid-cols-1 gap-10 lg:grid-cols-12">
        <h2 id="why-title" className="t-2 lg:col-span-7">{whyHard.title}</h2>
        <div className="flex flex-col gap-6 lg:col-span-5">
          <ul className="flex flex-col gap-4 text-lg">
            {whyHard.points.map((p) => (
              <li key={p} className="border-l-2 border-blue pl-4">{p}</li>
            ))}
          </ul>
          <p className="rounded-md bg-white p-5">
            <span className="block text-xl font-bold">{whyHard.market.text}</span>
            <span className="mt-1 block text-sm text-ink-3">Источник: {whyHard.market.source}</span>
          </p>
          {whyHard.more === null && <TextNeeded what="развёрнутый текст блока нужен" />}
        </div>
      </div>
    </Section>
  );
}

/** 6. Чем мы отличаемся. */
export function Principles() {
  return (
    <Section id="approach" num="03">
      <h2 id="approach-title" className="t-2 max-w-4xl">Чем мы отличаемся</h2>
      <ol className="mt-12 grid grid-cols-1 gap-x-12 gap-y-10 md:grid-cols-2">
        {principles.map((p, i) => (
          <li key={p.title} className="border-t border-line-strong pt-6">
            <span className="num-big text-blue/30" aria-hidden>{pad(i + 1)}</span>
            <h3 className="t-3 mt-4">{p.title}</h3>
            <p className="mt-3 text-ink-2">{p.text}</p>
          </li>
        ))}
      </ol>
    </Section>
  );
}

/** 7. Что вы получаете по кандидату. */
export function CandidateReport() {
  return (
    <Section id="report" num="04" label="Что вы получаете по кандидату" tone="blue">
      <div className="grid grid-cols-1 gap-10 lg:grid-cols-12">
        <div className="lg:col-span-5">
          <h2 id="report-title" className="t-2">{candidateReport.title}</h2>
          <p className="lead mt-6 text-ink-2">{candidateReport.text}</p>
        </div>
        <div className="lg:col-span-6 lg:col-start-7">
          <ol className="divide-y divide-line-strong rounded-lg bg-white">
            {candidateReport.points.map((p, i) => (
              <li key={p} className="flex items-baseline gap-5 px-6 py-5">
                <span className="eyebrow text-blue" aria-hidden>{pad(i + 1)}</span>
                <span className="text-xl font-bold">{p}</span>
              </li>
            ))}
          </ol>
          <p className="mt-6 text-lg font-semibold">{candidateReport.caption}</p>
        </div>
      </div>
    </Section>
  );
}

/** 8. Как мы работаем. */
export function Process() {
  return (
    <Section id="process" num="05" tone="soft">
      <h2 id="process-title" className="t-2 max-w-4xl">Как мы работаем</h2>
      <ol className="mt-12 grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-5">
        {steps.map((s, i) => (
          <li key={s.title} className="flex flex-col rounded-lg bg-white p-6">
            <span className="eyebrow text-blue" aria-hidden>Шаг {i + 1}</span>
            <h3 className="mt-4 text-xl font-bold leading-snug">{s.title}</h3>
            {'mark' in s && s.mark && <span className="mt-2 self-start rounded-sm bg-blue-light px-2 py-1 text-sm font-semibold text-blue">{s.mark}</span>}
            <p className="mt-3 text-ink-2">{s.text}</p>
          </li>
        ))}
      </ol>
    </Section>
  );
}

/** 9. Кейсы: короткая карточка с цифрой, «Читать целиком» раскрывает историю. */
export function Cases() {
  return (
    <Section id="cases" num="06">
      <h2 id="cases-title" className="t-2 max-w-4xl">Кейсы</h2>
      <div className="mt-12 grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
        {cases.map((c) => (
          <article key={c.id} className="flex flex-col rounded-lg border border-line p-6 sm:p-8">
            <p className="eyebrow text-ink-3">{c.group}</p>
            {c.figure && (
              <p className="mt-6">
                <span className="num-big block text-blue">{c.figure.value}</span>
                <span className="mt-2 block text-ink-2">{c.figure.caption}</span>
              </p>
            )}
            <h3 className="mt-6 text-xl font-bold leading-snug">{c.title}</h3>
            <dl className="mt-4 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
              <dt className="text-ink-3">{c.metaLabel}</dt>
              <dd>{c.metaValue}</dd>
              <dt className="text-ink-3">Сфера</dt>
              <dd>{c.sphere}</dd>
            </dl>
            <details className="group mt-auto pt-6">
              <summary className="inline-flex items-center gap-2 font-semibold text-blue">
                <span className="group-open:hidden">Читать целиком</span>
                <span className="hidden group-open:inline">Свернуть</span>
              </summary>
              <div className="mt-4 flex flex-col gap-3 text-ink-2">
                {c.body.map((p) => (
                  <p key={p.slice(0, 40)}>{p}</p>
                ))}
              </div>
            </details>
          </article>
        ))}
      </div>
    </Section>
  );
}

/** 11. Гарантии и оплата. */
export function Guarantees() {
  return (
    <Section id="guarantees" num="08" label="Гарантии и оплата" tone="soft">
      <h2 id="guarantees-title" className="t-2 max-w-4xl">Что будет, если мы не подберём</h2>
      <div className="mt-12 grid grid-cols-1 gap-6 md:grid-cols-3">
        {guarantees.map((g) => (
          <article key={g.title} className="rounded-lg bg-white p-6 sm:p-8">
            <h3 className="t-3">{g.title}</h3>
            <div className="mt-4 text-ink-2">{g.text ?? <TextNeeded />}</div>
          </article>
        ))}
      </div>
    </Section>
  );
}

/** 12. Личный кабинет. */
export function CabinetBlock() {
  return (
    <Section id="cabinet" num="09" label="Личный кабинет" tone="dark">
      <div className="grid grid-cols-1 gap-10 lg:grid-cols-12">
        <div className="lg:col-span-5">
          <h2 id="cabinet-title" className="t-2">{cabinet.title}</h2>
          <p className="lead mt-6 text-white/80">{cabinet.subtitle}</p>
          <div className="mt-10">
            <Link href="/login" className="inline-flex h-14 items-center rounded-md bg-blue px-8 font-semibold text-white hover:bg-white hover:text-black">
              {cabinet.button}
            </Link>
            <p className="mt-3 text-sm text-white/60">{cabinet.note}</p>
          </div>
        </div>
        <ul className="grid grid-cols-1 gap-px overflow-hidden rounded-lg bg-white/15 sm:grid-cols-2 lg:col-span-6 lg:col-start-7">
          {cabinet.points.map((p) => (
            <li key={p.title} className="bg-black p-6">
              <p className="text-lg font-bold">{p.title}</p>
              <p className="mt-2 text-white/75">{p.text}</p>
            </li>
          ))}
        </ul>
      </div>
    </Section>
  );
}

/** 15. Частые вопросы. */
export function Faq() {
  return (
    <Section id="faq" num="12">
      <div className="grid grid-cols-1 gap-10 lg:grid-cols-12">
        <h2 id="faq-title" className="t-2 lg:col-span-4">Частые вопросы</h2>
        <div className="divide-y divide-line border-y border-line lg:col-span-8">
          {faq.map((f) => (
            <details key={f.q} className="group py-2">
              <summary className="flex items-center justify-between gap-6 py-4 text-lg font-bold">
                {f.q}
                <span aria-hidden className="text-2xl font-normal text-blue transition-transform group-open:rotate-45">+</span>
              </summary>
              <p className="pb-4 text-ink-2">{f.a}</p>
            </details>
          ))}
        </div>
      </div>
    </Section>
  );
}
