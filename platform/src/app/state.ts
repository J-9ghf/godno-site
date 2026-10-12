// Состояние интерфейса (не данные): текущий раздел, фильтры, выбранные для сравнения кандидаты.
/* eslint-disable @typescript-eslint/no-explicit-any */
export const S: {
  me: any; section: string; param: string;
  candView: 'board' | 'list'; vac: string; stageF: string; periodF: string; cmp: string[];
  dash: { company: string; vacancy: string; from: string; to: string };
  poolQ: string; clientTab: string; logAction: string; logCompany: string; usersTab: string;
} = {
  me: null, section: 'dash', param: '',
  candView: 'board', vac: 'all', stageF: 'all', periodF: 'all', cmp: [],
  dash: { company: '', vacancy: '', from: '', to: '' },
  poolQ: '', clientTab: 'overview', logAction: '', logCompany: '', usersTab: 'users',
};
export type Handler = (el: HTMLElement, e: Event) => unknown;
export type Handlers = Record<string, Handler>;
// Перерисовка и переходы задаются в main.ts; экраны вызывают их через hooks, чтобы не было циклических импортов
export const hooks = { render: async () => {}, go: (_section: string, _param = '') => {} };
