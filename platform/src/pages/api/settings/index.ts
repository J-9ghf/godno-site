// Названия этапов и причины отказа для интерфейса (чтение; редактирование — вторая очередь)
import { route } from '../../../lib/http';
import { withUser } from '../../../lib/db';
export const GET = route('any', async (_c, a) => withUser(a.userId, async (db) => {
  const s = (await db.query('select stage_labels, reject_reasons_client, reject_reasons_team, guarantee_days from settings where id = 1')).rows[0];
  return a.kind === 'admin' ? s : { stage_labels: s.stage_labels, reject_reasons_client: s.reject_reasons_client };
}));
