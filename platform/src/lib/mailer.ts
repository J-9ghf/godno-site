// Отправка писем. Режимы: file (разработка: письма сохраняются в папку), memory (тесты), smtp (рабочий запуск).
// Почтовый сервис для рабочего режима ещё не выбран и не подключён.
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import nodemailer from 'nodemailer';
import { env } from './env';

export type Mail = { to: string; subject: string; text: string };
export const memoryOutbox: Mail[] = [];

export async function sendMail(mail: Mail) {
  const e = env();
  if (e.MAIL_TRANSPORT === 'memory') { memoryOutbox.push(mail); return; }
  if (e.MAIL_TRANSPORT === 'file') {
    await mkdir(e.MAIL_DIR, { recursive: true });
    const name = `${Date.now()}-${randomUUID().slice(0, 8)}.json`;
    await writeFile(join(e.MAIL_DIR, name), JSON.stringify({ ...mail, from: e.MAIL_FROM, at: new Date().toISOString() }, null, 2), { mode: 0o600 });
    return;
  }
  const transport = nodemailer.createTransport({
    host: e.SMTP_HOST, port: e.SMTP_PORT ?? 465, secure: (e.SMTP_PORT ?? 465) === 465,
    auth: e.SMTP_USER ? { user: e.SMTP_USER, pass: e.SMTP_PASSWORD } : undefined,
  });
  await transport.sendMail({ from: e.MAIL_FROM, to: mail.to, subject: mail.subject, text: mail.text });
}

export const templates = {
  invitation: (link: string, companyName: string | null) => ({
    subject: 'Ваш личный кабинет в Институте кадровых решений',
    text: `Здравствуйте!\n\nМы подготовили для вас личный кабинет${companyName ? ` компании «${companyName}»` : ''}: в нём статус поиска, кандидаты и документы.\n\nЗадайте пароль по ссылке. Она действует 72 часа и сработает один раз:\n${link}\n\nЕсли вы не ждали этого письма, просто удалите его.\n\nИнститут кадровых решений`,
  }),
  passwordReset: (link: string) => ({
    subject: 'Восстановление пароля к кабинету ИКР',
    text: `Здравствуйте!\n\nЧтобы задать новый пароль, перейдите по ссылке. Она действует 1 час:\n${link}\n\nЕсли вы не запрашивали восстановление, ничего делать не нужно: пароль останется прежним.\n\nИнститут кадровых решений`,
  }),
};
