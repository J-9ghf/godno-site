import type { Metadata } from 'next';
import { LegalStub } from '@/components/site/LegalStub';

export const metadata: Metadata = { title: 'Политика конфиденциальности', robots: { index: false } };

export default function PrivacyPage() {
  return <LegalStub title="Политика конфиденциальности" about="Здесь будет политика обработки персональных данных для нового сайта." />;
}
