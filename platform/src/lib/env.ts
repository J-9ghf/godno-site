// Настройки читаются из переменных окружения при запуске сервера, а не встраиваются в сборку.
// Секреты (пароли базы, ключ сессий, ключи хранилища и почты) задаются только в окружении.
import { z } from 'zod';

const bool = z.enum(['true', 'false']).default('false').transform((v) => v === 'true');

const schema = z.object({
  NODE_ENV: z.string().default('development'),
  BASE_URL: z.url(),
  DATABASE_URL: z.string().startsWith('postgres'),
  BETTER_AUTH_SECRET: z.string().min(32, 'BETTER_AUTH_SECRET: не короче 32 символов'),
  SESSION_IDLE_MINUTES: z.coerce.number().int().min(5).max(720).default(30),
  SESSION_MAX_HOURS: z.coerce.number().int().min(1).max(72).default(12),
  TRUST_PROXY: bool,
  MAIL_TRANSPORT: z.enum(['file', 'memory', 'smtp']).default('file'),
  MAIL_FROM: z.string().default('ИКР <no-reply@localhost>'),
  MAIL_DIR: z.string().default('.dev/mail'),
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().int().optional(),
  SMTP_USER: z.string().optional(),
  SMTP_PASSWORD: z.string().optional(),
  STORAGE_DRIVER: z.enum(['local', 's3']).default('local'),
  STORAGE_LOCAL_DIR: z.string().default('.data/files'),
  S3_ENDPOINT: z.string().optional(),
  S3_REGION: z.string().default('ru-central1'),
  S3_BUCKET: z.string().optional(),
  S3_ACCESS_KEY_ID: z.string().optional(),
  S3_SECRET_ACCESS_KEY: z.string().optional(),
  S3_FORCE_PATH_STYLE: bool,
  MAX_UPLOAD_MB: z.coerce.number().min(1).max(50).default(15),
}).superRefine((e, ctx) => {
  if (e.MAIL_TRANSPORT === 'smtp' && !e.SMTP_HOST) ctx.addIssue({ code: 'custom', message: 'SMTP_HOST обязателен для MAIL_TRANSPORT=smtp' });
  if (e.STORAGE_DRIVER === 's3' && !(e.S3_BUCKET && e.S3_ACCESS_KEY_ID && e.S3_SECRET_ACCESS_KEY))
    ctx.addIssue({ code: 'custom', message: 'Для STORAGE_DRIVER=s3 нужны S3_BUCKET, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY' });
  if (e.NODE_ENV === 'production' && !e.BASE_URL.startsWith('https://') && !/^http:\/\/(127\.0\.0\.1|localhost)/.test(e.BASE_URL))
    ctx.addIssue({ code: 'custom', message: 'В рабочем режиме BASE_URL должен начинаться с https://' });
});

export type Env = z.infer<typeof schema>;
let cached: Env | null = null;
export function env(): Env {
  if (!cached) {
    const r = schema.safeParse(process.env);
    if (!r.success) throw new Error('Ошибка настроек окружения: ' + r.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '));
    cached = r.data;
  }
  return cached;
}
