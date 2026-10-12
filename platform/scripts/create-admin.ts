// Приглашение администратора из консоли сервера: npm run create-admin -- admin@example.ru
// Пароль не задаётся здесь: человек сам устанавливает его по ссылке (72 часа, одноразовая).
// Ссылка уходит письмом и выводится в консоль, если письма пока сохраняются в файл.
import { createStaffInvitationSystem } from '../src/lib/invitations';
import { env } from '../src/lib/env';
import { pool } from '../src/lib/db';

const email = process.argv[2];
if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
  console.error('Укажите почту: npm run create-admin -- admin@example.ru');
  process.exit(1);
}
try {
  const link = await createStaffInvitationSystem(email);
  console.log(`Приглашение администратора создано для ${email.toLowerCase()}.`);
  if (env().MAIL_TRANSPORT !== 'smtp') console.log(`Ссылка (письма сейчас не отправляются, режим ${env().MAIL_TRANSPORT}):\n${link}`);
} catch (e) {
  console.error((e as Error).message);
  process.exitCode = 1;
} finally {
  await pool().end();
}
