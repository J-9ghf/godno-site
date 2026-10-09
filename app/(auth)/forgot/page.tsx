import type { Metadata } from 'next';
import Link from 'next/link';
import { ForgotForm } from './ForgotForm';

export const metadata: Metadata = { title: 'Восстановление пароля', robots: { index: false } };

export default function ForgotPage() {
  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-3xl font-bold tracking-tight">Восстановление пароля</h1>
      <p className="text-ink-2">Укажите почту, на которую открыт кабинет. Мы пришлём ссылку для нового пароля.</p>
      <ForgotForm />
      <Link href="/login" className="self-start text-sm font-semibold text-blue underline-offset-4 hover:underline">
        Вернуться ко входу
      </Link>
    </div>
  );
}
