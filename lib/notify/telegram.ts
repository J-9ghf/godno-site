import 'server-only';
import { env } from '@/lib/env';

/**
 * Сообщение в Telegram-чат команды через Bot API. Без токена — только запись в лог.
 *
 * Персональные данные в Telegram не отправляем: его серверы за пределами РФ, а это трансграничная
 * передача. В сообщении — тип события, направление и ссылка в кабинет; имена и контакты — только в кабинете.
 */
export async function notifyTeam(text: string): Promise<void> {
  const { TELEGRAM_BOT_TOKEN, TELEGRAM_TEAM_CHAT_ID } = env();
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_TEAM_CHAT_ID) {
    console.info(`[telegram] (не настроен) ${text}`);
    return;
  }
  try {
    const res = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ chat_id: TELEGRAM_TEAM_CHAT_ID, text, disable_web_page_preview: true }),
      signal: AbortSignal.timeout(5_000),
    });
    if (!res.ok) console.error('[telegram] ошибка отправки', res.status);
  } catch (e) {
    // Заявка уже сохранена в базе: сбой Telegram не должен ломать отправку формы.
    console.error('[telegram] ошибка отправки', e instanceof Error ? e.message : e);
  }
}
