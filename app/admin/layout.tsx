import { AppShell } from '@/components/AppShell';
import { requireRole } from '@/lib/auth/access';

export const dynamic = 'force-dynamic';

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const access = await requireRole(['manager', 'admin']);
  const nav = [{ href: '/admin', label: 'Дашборд' }];
  if (access.role === 'admin') nav.push({ href: '/admin/users', label: 'Пользователи и доступы' });
  return (
    <AppShell access={access} nav={nav}>
      {children}
    </AppShell>
  );
}
