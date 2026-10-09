import 'server-only';
import { env } from '@/lib/env';

export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

/** Провайдер почты. Реальный подставляется переменной EMAIL_PROVIDER, код вызова не меняется. */
export interface EmailProvider {
  send(message: EmailMessage): Promise<void>;
}

/**
 * Для разработки: письмо целиком печатается в лог сервера.
 * Если задан EMAIL_OUTBOX_FILE, письма ещё и дописываются в этот файл (JSON по строке) — для e2e-тестов.
 */
class ConsoleProvider implements EmailProvider {
  async send(m: EmailMessage) {
    console.info(`\n[email] to=${m.to}\nsubject: ${m.subject}\n\n${m.text}\n`);
    const outbox = process.env.EMAIL_OUTBOX_FILE;
    if (outbox) {
      const { appendFile } = await import('node:fs/promises');
      await appendFile(outbox, JSON.stringify({ ...m, at: Date.now() }) + '\n');
    }
  }
}

class SmtpProvider implements EmailProvider {
  async send(m: EmailMessage) {
    const { SMTP_HOST, SMTP_PORT, SMTP_SECURE, SMTP_USER, SMTP_PASSWORD, EMAIL_FROM } = env();
    if (!SMTP_HOST) throw new Error('SMTP_HOST не задан');
    const nodemailer = await import('nodemailer');
    const transport = nodemailer.createTransport({
      host: SMTP_HOST,
      port: SMTP_PORT,
      secure: SMTP_SECURE,
      auth: SMTP_USER ? { user: SMTP_USER, pass: SMTP_PASSWORD } : undefined,
    });
    await transport.sendMail({ from: EMAIL_FROM, to: m.to, subject: m.subject, text: m.text, html: m.html });
  }
}

let provider: EmailProvider | null = null;

export function emailProvider(): EmailProvider {
  if (provider) return provider;
  provider = env().EMAIL_PROVIDER === 'smtp' ? new SmtpProvider() : new ConsoleProvider();
  return provider;
}

export async function sendEmail(message: EmailMessage): Promise<void> {
  await emailProvider().send(message);
}
