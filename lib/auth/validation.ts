import { z } from 'zod';

export const PASSWORD_MIN = 10;

export const emailSchema = z
  .string({ message: 'Укажите почту' })
  .trim()
  .toLowerCase()
  .min(1, 'Укажите почту')
  .max(254, 'Слишком длинный адрес')
  .email('Проверьте адрес почты');

/** Новый пароль: не короче 10 символов, не длиннее 72 (ограничение bcrypt), не совпадает с почтой. */
export function newPasswordSchema(email?: string) {
  return z
    .object({
      password: z
        .string()
        .min(PASSWORD_MIN, `Пароль должен быть не короче ${PASSWORD_MIN} символов`)
        .max(72, 'Пароль должен быть не длиннее 72 символов'),
      confirm: z.string(),
    })
    .refine((v) => v.password === v.confirm, { message: 'Пароли не совпадают', path: ['confirm'] })
    .refine((v) => !email || v.password.trim().toLowerCase() !== email.toLowerCase(), {
      message: 'Пароль не должен совпадать с почтой',
      path: ['password'],
    });
}

export type FormState = {
  status: 'idle' | 'error' | 'success';
  message?: string;
  fieldErrors?: Record<string, string>;
};

export const initialFormState: FormState = { status: 'idle' };

export function fieldErrors(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? 'form');
    out[key] ??= issue.message;
  }
  return out;
}
