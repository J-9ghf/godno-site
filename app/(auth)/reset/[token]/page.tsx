import type { Metadata } from 'next';
import { InvalidLink } from '@/components/InvalidLink';
import { findValidResetToken } from '@/lib/auth/service';
import { ResetForm } from './ResetForm';

export const metadata: Metadata = { title: 'Новый пароль', robots: { index: false }, referrer: 'no-referrer' };

export default async function ResetPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!(await findValidResetToken(token))) {
    return <InvalidLink text="Ссылка недействительна или устарела. Запросите восстановление пароля ещё раз." />;
  }
  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-3xl font-bold tracking-tight">Новый пароль</h1>
      <ResetForm token={token} />
    </div>
  );
}
