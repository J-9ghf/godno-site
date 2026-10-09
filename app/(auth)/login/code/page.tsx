import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { hasPendingChallenge } from '@/lib/auth/service';
import { CodeForm } from './CodeForm';

export const metadata: Metadata = { title: 'Код входа', robots: { index: false } };

export default async function CodePage() {
  if (!(await hasPendingChallenge())) redirect('/login?reason=code_expired');
  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-3xl font-bold tracking-tight">Подтвердите вход</h1>
      <p className="text-ink-2">Мы отправили 6-значный код на вашу почту. Он действует 10 минут.</p>
      <CodeForm />
    </div>
  );
}
