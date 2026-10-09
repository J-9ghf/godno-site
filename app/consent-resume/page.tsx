import type { Metadata } from 'next';
import { LegalStub } from '@/components/site/LegalStub';

export const metadata: Metadata = { title: 'Согласие кандидата', robots: { index: false } };

export default function ConsentResumePage() {
  return (
    <LegalStub
      title="Согласие кандидата на обработку персональных данных и передачу резюме работодателям"
      about="Отдельное согласие кандидата: что собираем (контакты, резюме, видео), зачем, кому передаём, срок хранения и как удалить данные."
    />
  );
}
