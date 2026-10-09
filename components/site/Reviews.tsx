'use client';

import { useRef } from 'react';
import { reviews } from '@/content/landing';
import { Section } from './Section';

/**
 * 10. Отзывы: горизонтальная лента с прокруткой и кнопками. Без автопрокрутки, чтобы текст
 * не уезжал во время чтения; на телефоне листается пальцем, с клавиатуры — кнопками и Tab.
 */
export function Reviews() {
  const track = useRef<HTMLUListElement>(null);
  const scroll = (dir: 1 | -1) => {
    const el = track.current;
    if (el) el.scrollBy({ left: dir * el.clientWidth * 0.85, behavior: 'smooth' });
  };
  return (
    <Section id="reviews" num="07" tone="white">
      <div className="flex items-end justify-between gap-6">
        <h2 id="reviews-title" className="t-2">Отзывы</h2>
        <div className="flex gap-2">
          <button type="button" onClick={() => scroll(-1)} aria-controls="reviews-track" aria-label="Предыдущие отзывы" className="h-12 w-12 rounded-md border border-line-strong text-xl hover:border-black">←</button>
          <button type="button" onClick={() => scroll(1)} aria-controls="reviews-track" aria-label="Следующие отзывы" className="h-12 w-12 rounded-md border border-line-strong text-xl hover:border-black">→</button>
        </div>
      </div>
      <ul
        id="reviews-track"
        ref={track}
        aria-roledescription="карусель"
        aria-label="Отзывы клиентов"
        className="mt-10 flex snap-x snap-mandatory gap-6 overflow-x-auto pb-4 [scrollbar-width:thin]"
      >
        {reviews.map((text, i) => (
          <li
            key={i}
            aria-roledescription="отзыв"
            aria-label={`${i + 1} из ${reviews.length}`}
            tabIndex={0}
            className="w-[85%] flex-none snap-start rounded-lg bg-soft p-6 sm:w-[420px] sm:p-8"
          >
            <blockquote className="whitespace-pre-line text-ink-2">{text}</blockquote>
          </li>
        ))}
      </ul>
    </Section>
  );
}
