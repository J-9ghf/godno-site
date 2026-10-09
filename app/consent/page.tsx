import type { Metadata } from 'next';
import { LegalStub } from '@/components/site/LegalStub';

export const metadata: Metadata = { title: 'Согласие на обработку персональных данных', robots: { index: false } };

export default function ConsentPage() {
  return <LegalStub title="Согласие на обработку персональных данных" about="Согласие для заявки работодателя: имя, телефон или Telegram, сведения о задаче." />;
}
