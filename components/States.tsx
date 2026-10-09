'use client';

/** Общие состояния экранов: загрузка, пусто, ошибка. */
export function Loading({ label = 'Загружаем…' }: { label?: string }) {
  return (
    <div role="status" aria-live="polite" className="flex items-center gap-3 py-12 text-ink-2">
      <span aria-hidden className="h-5 w-5 animate-spin rounded-full border-2 border-line-strong border-t-blue" />
      {label}
    </div>
  );
}

export function Empty({ title, text }: { title: string; text?: string }) {
  return (
    <div className="rounded-lg border border-dashed border-line-strong bg-white px-6 py-10 text-center">
      <p className="font-semibold">{title}</p>
      {text && <p className="mt-1 text-sm text-ink-2">{text}</p>}
    </div>
  );
}

export function ErrorState({ reset }: { reset?: () => void }) {
  return (
    <div role="alert" className="rounded-lg border border-danger bg-danger-light px-6 py-8">
      <p className="font-semibold text-danger">Не удалось загрузить данные.</p>
      <p className="mt-1 text-sm text-ink-2">Проверьте соединение и попробуйте ещё раз. Если ошибка повторяется, напишите команде.</p>
      {reset && (
        <button onClick={reset} className="mt-4 h-10 rounded-md bg-blue px-4 text-sm font-semibold text-white hover:bg-black">
          Повторить
        </button>
      )}
    </div>
  );
}
