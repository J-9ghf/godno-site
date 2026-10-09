import Link from 'next/link';
import { Brand } from '@/components/ui/Logo';

// Временная главная до этапа 3 (лендинг).
export default function Home() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-3xl flex-col items-start justify-center gap-8 px-5">
      <Brand />
      <h1 className="text-4xl font-bold tracking-tight">Сайт обновляется</h1>
      <Link href="/login" className="inline-flex h-12 items-center rounded-md bg-blue px-6 font-semibold text-white hover:bg-black">
        Вход
      </Link>
    </main>
  );
}
