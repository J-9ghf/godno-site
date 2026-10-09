import type { Metadata } from 'next';
import { InvalidLink } from '@/components/InvalidLink';
import { findValidInvitation } from '@/lib/auth/service';
import { InviteForm } from './InviteForm';

export const metadata: Metadata = { title: 'Приглашение в кабинет', robots: { index: false }, referrer: 'no-referrer' };

export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const invitation = await findValidInvitation(token);
  if (!invitation) {
    return <InvalidLink text="Ссылка недействительна, уже использована или устарела (она действует 72 часа). Попросите менеджера отправить новое приглашение." />;
  }
  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-3xl font-bold tracking-tight">Ваш личный кабинет</h1>
      <p className="text-ink-2">Задайте пароль, чтобы открыть кабинет: в нём статус поиска, кандидаты и документы.</p>
      <InviteForm token={token} email={invitation.email} fullName={invitation.full_name ?? ''} />
    </div>
  );
}
