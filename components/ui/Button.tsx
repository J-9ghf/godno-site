'use client';

import type { ButtonHTMLAttributes } from 'react';
import { useFormStatus } from 'react-dom';

type Variant = 'primary' | 'secondary' | 'danger' | 'link';

const styles: Record<Variant, string> = {
  primary: 'bg-blue text-white hover:bg-black disabled:bg-line-strong',
  secondary: 'border border-line-strong bg-white text-black hover:border-black disabled:text-ink-3',
  danger: 'border border-danger bg-white text-danger hover:bg-danger hover:text-white',
  link: 'h-auto px-0 text-blue underline-offset-4 hover:underline',
};

export function Button({ variant = 'primary', className = '', ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return (
    <button
      className={`inline-flex h-12 items-center justify-center rounded-md px-6 text-base font-semibold transition-colors disabled:cursor-not-allowed ${styles[variant]} ${className}`}
      {...rest}
    />
  );
}

/** Кнопка отправки: блокируется и показывает состояние, пока форма отправляется. */
export function SubmitButton({ children, pendingText = 'Отправляем…', ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; pendingText?: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending || rest.disabled} aria-busy={pending || undefined} {...rest}>
      {pending ? pendingText : children}
    </Button>
  );
}
