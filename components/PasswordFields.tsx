import { Field } from '@/components/ui/Field';
import { PASSWORD_MIN } from '@/lib/auth/validation';

export function PasswordFields({ errors }: { errors?: Record<string, string> }) {
  return (
    <>
      <Field
        label="Новый пароль"
        name="password"
        type="password"
        autoComplete="new-password"
        minLength={PASSWORD_MIN}
        required
        hint={`Не короче ${PASSWORD_MIN} символов.`}
        error={errors?.password}
      />
      <Field label="Повторите пароль" name="confirm" type="password" autoComplete="new-password" required error={errors?.confirm} />
    </>
  );
}
