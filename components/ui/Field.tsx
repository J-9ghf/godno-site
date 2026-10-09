import type { InputHTMLAttributes } from 'react';

interface FieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  name: string;
  error?: string;
  hint?: string;
}

/** Поле формы: подпись, подсказка и ошибка связаны с input через aria-атрибуты. */
export function Field({ label, name, error, hint, id, className = '', ...rest }: FieldProps) {
  const inputId = id ?? `f-${name}`;
  const hintId = hint ? `${inputId}-hint` : undefined;
  const errorId = error ? `${inputId}-error` : undefined;
  return (
    <div className={`flex flex-col gap-1.5 ${className}`}>
      <label htmlFor={inputId} className="text-sm font-semibold text-black">
        {label}
      </label>
      <input
        id={inputId}
        name={name}
        aria-invalid={error ? true : undefined}
        aria-describedby={[hintId, errorId].filter(Boolean).join(' ') || undefined}
        className={`h-12 rounded-md border bg-white px-4 text-base text-black outline-none transition-colors placeholder:text-ink-3 focus:border-blue ${
          error ? 'border-danger' : 'border-line-strong'
        }`}
        {...rest}
      />
      {hint && (
        <p id={hintId} className="text-sm text-ink-3">
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} className="text-sm font-medium text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
