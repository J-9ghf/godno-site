import type { ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from 'react';

const control = 'rounded-md border bg-white px-4 text-base text-black outline-none transition-colors focus:border-blue';

function describedBy(id: string, hint?: string, error?: string) {
  return [hint ? `${id}-hint` : '', error ? `${id}-error` : ''].filter(Boolean).join(' ') || undefined;
}

function Messages({ id, hint, error }: { id: string; hint?: string; error?: string }) {
  return (
    <>
      {hint && <p id={`${id}-hint`} className="text-sm text-ink-3">{hint}</p>}
      {error && <p id={`${id}-error`} className="text-sm font-medium text-danger">{error}</p>}
    </>
  );
}

export function SelectField({
  label,
  name,
  options,
  placeholder,
  error,
  hint,
  id: idProp,
  ...rest
}: SelectHTMLAttributes<HTMLSelectElement> & { label: string; name: string; options: { value: string; label: string }[]; placeholder: string; error?: string; hint?: string }) {
  const id = idProp ?? `f-${name}`;
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-semibold">{label}</label>
      <select id={id} name={name} defaultValue="" aria-invalid={error ? true : undefined} aria-describedby={describedBy(id, hint, error)} className={`${control} h-12 ${error ? 'border-danger' : 'border-line-strong'}`} {...rest}>
        <option value="">{placeholder}</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
      <Messages id={id} hint={hint} error={error} />
    </div>
  );
}

export function TextareaField({ label, name, error, hint, id: idProp, ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement> & { label: string; name: string; error?: string; hint?: string }) {
  const id = idProp ?? `f-${name}`;
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-semibold">{label}</label>
      <textarea id={id} name={name} rows={4} aria-invalid={error ? true : undefined} aria-describedby={describedBy(id, hint, error)} className={`${control} py-3 ${error ? 'border-danger' : 'border-line-strong'}`} {...rest} />
      <Messages id={id} hint={hint} error={error} />
    </div>
  );
}

export function ConsentField({ name = 'consent', id: idProp, children, error }: { name?: string; id?: string; children: ReactNode; error?: string }) {
  const id = idProp ?? `f-${name}`;
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-start gap-3">
        <input id={id} name={name} type="checkbox" required aria-invalid={error ? true : undefined} aria-describedby={error ? `${id}-error` : undefined} className="mt-0.5 h-5 w-5 flex-none accent-[var(--c-blue)]" />
        <label htmlFor={id} className="text-sm text-ink-2">{children}</label>
      </div>
      {error && <p id={`${id}-error`} className="text-sm font-medium text-danger">{error}</p>}
    </div>
  );
}
