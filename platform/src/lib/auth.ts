// Better Auth: вход по почте и паролю, сессии в базе, сброс пароля.
// Открытая регистрация выключена: пользователи появляются только через приглашения (src/lib/invitations.ts).
import { betterAuth } from 'better-auth';
import { twoFactor } from 'better-auth/plugins';
import { env } from './env';
import { pool, withSystem } from './db';
import { sendMail, templates } from './mailer';
import { audit } from './audit';

function create() {
  const e = env();
  return betterAuth({
    appName: 'Кабинет ИКР',
    baseURL: e.BASE_URL,
    basePath: '/api/auth',
    secret: e.BETTER_AUTH_SECRET,
    database: pool(),
    trustedOrigins: [new URL(e.BASE_URL).origin],
    emailAndPassword: {
      enabled: true,
      disableSignUp: true,
      minPasswordLength: 10,
      maxPasswordLength: 128,
      autoSignIn: false,
      resetPasswordTokenExpiresIn: 60 * 60,
      revokeSessionsOnPasswordReset: true,
      async sendResetPassword({ user, token }) {
        // Заблокированным пользователям письмо не отправляем; ответ на запрос при этом тот же
        const blocked = await withSystem(async (db) =>
          (await db.query('select is_blocked from user_security where user_id = $1', [user.id])).rows[0]?.is_blocked === true);
        if (blocked) return;
        const link = `${e.BASE_URL}/reset-password?token=${encodeURIComponent(token)}`;
        await sendMail({ to: user.email, ...templates.passwordReset(link) });
        await withSystem((db) => audit(db, { actorId: null, kind: 'system', action: 'password.reset_requested', entityType: 'user', entityId: user.id }));
      },
      async onPasswordReset({ user }) {
        await withSystem((db) => audit(db, { actorId: null, kind: 'system', action: 'password.reset_done', entityType: 'user', entityId: user.id }));
      },
    },
    session: {
      expiresIn: e.SESSION_IDLE_MINUTES * 60,   // срок без активности
      updateAge: 60,                            // продление не чаще раза в минуту
      cookieCache: { enabled: false },          // каждая проверка сессии идёт в базу: отзыв действует сразу
    },
    verification: { storeIdentifier: 'hashed' }, // токены сброса пароля хранятся в виде хэша
    rateLimit: {
      enabled: true,
      storage: 'database',
      window: 60,
      max: 60,
      customRules: {
        '/request-password-reset': { window: 15 * 60, max: 5 },
        '/reset-password': { window: 15 * 60, max: 10 },
        '/sign-in/email': { window: 15 * 60, max: 30 },
      },
    },
    // 2FA: приложение-аутентификатор (TOTP) и одноразовые резервные коды. «Доверенные устройства» не используются:
    // флаг trustDevice удаляется из запросов (src/pages/api/auth/[...all].ts), срок доверия минимальный.
    plugins: [twoFactor({
      issuer: 'Кабинет ИКР',
      twoFactorCookieMaxAge: 600,
      trustDeviceMaxAge: 1,
      backupCodeOptions: { amount: 10, length: 10, storeBackupCodes: 'encrypted' },
    })],
    advanced: {
      cookiePrefix: 'ikr',
      useSecureCookies: e.BASE_URL.startsWith('https://'),
      ipAddress: e.TRUST_PROXY ? { ipAddressHeaders: ['x-real-ip', 'x-forwarded-for'] } : { disableIpTracking: false },
    },
  });
}

let instance: ReturnType<typeof create> | null = null;
export function auth() {
  if (!instance) instance = create();
  return instance;
}
