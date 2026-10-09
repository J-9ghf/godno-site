import type { ReactNode } from 'react';

type Tone = 'error' | 'success' | 'info';

const tones: Record<Tone, string> = {
  error: 'border-danger bg-danger-light text-danger',
  success: 'border-success bg-success-light text-success',
  info: 'border-blue bg-blue-light text-black',
};

/** Сообщение формы. Ошибки объявляются экранному диктору сразу (role=alert). */
export function Alert({ tone = 'info', children }: { tone?: Tone; children: ReactNode }) {
  return (
    <div role={tone === 'error' ? 'alert' : 'status'} className={`rounded-md border-l-4 px-4 py-3 text-sm font-medium ${tones[tone]}`}>
      {children}
    </div>
  );
}
