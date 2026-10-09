import type { Metadata } from 'next';
import { Empty } from '@/components/States';

export const metadata: Metadata = { title: 'Кабинет команды', robots: { index: false } };

export default function AdminPage() {
  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-3xl font-bold tracking-tight">Кабинет команды</h1>
      <Empty title="Дашборд по клиентам появится на этапе 5" />
    </div>
  );
}
