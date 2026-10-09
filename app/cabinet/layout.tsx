import { AppShell } from '@/components/AppShell';
import { requireRole } from '@/lib/auth/access';

export const dynamic = 'force-dynamic';

export default async function CabinetLayout({ children }: { children: React.ReactNode }) {
  const access = await requireRole(['client']);
  return (
    <AppShell access={access} nav={[{ href: '/cabinet', label: 'Дашборд' }]}>
      {children}
    </AppShell>
  );
}
