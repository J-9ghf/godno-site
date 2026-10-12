// Аварийный сброс 2FA из консоли сервера: npm run reset-2fa -- admin@example.ru
// Для случая, когда единственный администратор потерял и приложение, и резервные коды.
// Действие записывается в журнал как системное; все сессии пользователя закрываются.
import { resetTwoFactor } from '../src/lib/users';
import { pool, withSystem } from '../src/lib/db';

const email = (process.argv[2] ?? '').trim().toLowerCase();
if (!email) { console.error('Укажите почту: npm run reset-2fa -- admin@example.ru'); process.exit(1); }
try {
  const id = await withSystem(async (db) => (await db.query('select id from "user" where email = $1', [email])).rows[0]?.id);
  if (!id) throw new Error('Пользователь не найден');
  await resetTwoFactor(null, id);
  console.log(`2FA для ${email} сброшена. При следующем входе её нужно настроить заново.`);
} catch (e) {
  console.error((e as Error).message);
  process.exitCode = 1;
} finally {
  await pool().end();
}
