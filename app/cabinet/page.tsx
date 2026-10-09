import type { Metadata } from 'next';
import { Empty } from '@/components/States';
import { requireRole } from '@/lib/auth/access';

export const metadata: Metadata = { title: 'Кабинет', robots: { index: false } };

export default async function CabinetPage() {
  const access = await requireRole(['client']);
  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-3xl font-bold tracking-tight">Здравствуйте{access.fullName ? `, ${access.fullName}` : ''}</h1>
      <Empty title="Кабинет клиента появится на этапе 4" text="Дашборд, кандидаты, заявки, документы и услуги." />
    </div>
  );
}
