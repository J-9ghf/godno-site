import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: { default: 'Институт кадровых решений', template: '%s — Институт кадровых решений' },
  description: 'Подбор ключевых сотрудников, ассистентов и домашнего персонала.',
  icons: { icon: '/favicon-32.png', apple: '/apple-touch-icon.png' },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru">
      <body className="min-h-dvh">{children}</body>
    </html>
  );
}
