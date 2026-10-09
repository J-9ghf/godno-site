import type { Metadata } from 'next';
import Link from 'next/link';
import { Alert } from '@/components/ui/Alert';
import { LoginForm } from './LoginForm';

export const metadata: Metadata = { title: 'Вход', robots: { index: false } };

const notices: Record<string, { tone: 'info' | 'success' | 'error'; text: string }> = {
  idle: { tone: 'info', text: 'Вы вышли из кабинета после 30 минут бездействия. Войдите снова.' },
  logout: { tone: 'success', text: 'Вы вышли из кабинета.' },
  denied: { tone: 'error', text: 'Доступ к кабинету закрыт. Напишите вашему менеджеру.' },
  expired: { tone: 'info', text: 'Сессия завершилась. Войдите снова.' },
  code_expired: { tone: 'error', text: 'Код устарел или попытки закончились. Войдите ещё раз, мы пришлём новый код.' },
  reset: { tone: 'success', text: 'Пароль изменён. Войдите с новым паролем.' },
  invited: { tone: 'success', text: 'Пароль задан. Войдите, чтобы открыть кабинет.' },
};

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ reason?: string; next?: string }> }) {
  const { reason, next } = await searchParams;
  const notice = reason ? notices[reason] : undefined;
  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-3xl font-bold tracking-tight">Вход для клиентов</h1>
      {notice && <Alert tone={notice.tone}>{notice.text}</Alert>}
      <LoginForm next={next} />
      <p className="border-t border-line pt-5 text-sm text-ink-2">
        Доступ только для клиентов. Нет доступа? Напишите вашему менеджеру или{' '}
        <Link href="/#contact" className="font-semibold text-blue underline-offset-4 hover:underline">
          оставьте заявку на сайте
        </Link>
        .
      </p>
    </div>
  );
}
