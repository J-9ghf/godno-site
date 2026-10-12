// Этапы подбора. Коды совпадают с демоверсией и таблицей applications.
export const STAGES = ['sourced', 'screening', 'offered', 'interested', 'interview', 'offer', 'hired', 'rejected'] as const;
export type Stage = (typeof STAGES)[number];
export const INTERNAL_STAGES: Stage[] = ['sourced', 'screening'];
export const CLIENT_DECISIONS: Stage[] = ['interested', 'interview'];

// Правила для команды. Решения клиента («Интересен», «Интервью») администратор может поставить только с отметкой «за клиента».
// Этап «Предложен» ставится только созданием представления.
export function adminStageError(from: Stage, to: Stage, reason?: string | null): string | null {
  if (from === to) return 'Кандидат уже на этом этапе';
  if (to === 'offered') return 'Этап «Предложен» ставится созданием представления клиенту';
  if (to === 'rejected' && !reason?.trim()) return 'Укажите причину отказа';
  return null;
}
