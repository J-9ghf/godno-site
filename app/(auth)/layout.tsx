import Link from 'next/link';
import { Brand } from '@/components/ui/Logo';

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col bg-soft">
      <header className="px-5 py-6 sm:px-12">
        <Link href="/" aria-label="На главную" className="inline-block">
          <Brand compact />
        </Link>
      </header>
      <main className="flex flex-1 items-start justify-center px-4 pb-16 pt-4 sm:items-center">
        <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-panel sm:p-10">{children}</div>
      </main>
    </div>
  );
}
