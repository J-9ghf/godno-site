import type { Metadata } from 'next';
import { Empty } from '@/components/States';
import { requireRole } from '@/lib/auth/access';
import { createUserClient } from '@/lib/supabase/server';
import { revokeInvitationAction, toggleUserAction } from './actions';
import { CompanyForm, InviteForm } from './Forms';

export const metadata: Metadata = { title: 'Пользователи и доступы', robots: { index: false } };

const roleLabel: Record<string, string> = { client: 'Клиент', manager: 'Менеджер', admin: 'Администратор' };

function invitationStatus(i: { used_at: string | null; revoked_at: string | null; expires_at: string }) {
  if (i.used_at) return 'Принято';
  if (i.revoked_at) return 'Отозвано';
  if (new Date(i.expires_at) < new Date()) return 'Истекло';
  return 'Ждёт ответа';
}

const dt = new Intl.DateTimeFormat('ru-RU', { dateStyle: 'short', timeStyle: 'short', timeZone: 'Europe/Moscow' });

export default async function UsersPage() {
  const access = await requireRole(['admin']);
  const supabase = await createUserClient();
  const [companies, profiles, invitations] = await Promise.all([
    supabase.from('companies').select('id, name').order('name'),
    supabase.from('profiles').select('id, email, full_name, role, is_active, is_company_lead, companies!profiles_company_id_fkey(name)').order('created_at'),
    supabase.from('invitations').select('id, email, role, expires_at, used_at, revoked_at, created_at, companies!invitations_company_id_fkey(name)').order('created_at', { ascending: false }).limit(50),
  ]);
  if (companies.error || profiles.error || invitations.error) {
    console.error('[admin/users]', (companies.error ?? profiles.error ?? invitations.error)?.message);
    throw new Error('Не удалось загрузить пользователей');
  }

  const cell = 'px-3 py-3 align-top';
  return (
    <div className="flex flex-col gap-10">
      <h1 className="text-3xl font-bold tracking-tight">Пользователи и доступы</h1>

      <section aria-labelledby="h-invite" className="rounded-lg bg-white p-6 shadow-panel">
        <h2 id="h-invite" className="mb-4 text-xl font-bold">Пригласить пользователя</h2>
        <InviteForm companies={companies.data} />
      </section>

      <section aria-labelledby="h-company" className="rounded-lg bg-white p-6 shadow-panel">
        <h2 id="h-company" className="mb-4 text-xl font-bold">Новая компания-клиент</h2>
        <CompanyForm />
      </section>

      <section aria-labelledby="h-users">
        <h2 id="h-users" className="mb-4 text-xl font-bold">Пользователи</h2>
        {profiles.data.length === 0 ? (
          <Empty title="Пользователей пока нет" />
        ) : (
          <div className="overflow-x-auto rounded-lg bg-white shadow-panel">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead className="border-b border-line text-ink-3">
                <tr>
                  <th scope="col" className={cell}>Имя и почта</th>
                  <th scope="col" className={cell}>Роль</th>
                  <th scope="col" className={cell}>Компания</th>
                  <th scope="col" className={cell}>Статус</th>
                  <th scope="col" className={cell}><span className="sr-only">Действия</span></th>
                </tr>
              </thead>
              <tbody>
                {profiles.data.map((p) => {
                  const company = (p.companies as unknown as { name: string } | null)?.name;
                  return (
                    <tr key={p.id} className="border-b border-line last:border-0">
                      <td className={cell}>
                        <div className="font-semibold">{p.full_name || '—'}</div>
                        <div className="text-ink-3">{p.email}</div>
                      </td>
                      <td className={cell}>
                        {roleLabel[p.role]}
                        {p.is_company_lead && <div className="text-ink-3">руководитель</div>}
                      </td>
                      <td className={cell}>{company ?? '—'}</td>
                      <td className={cell}>
                        <span className={p.is_active ? 'text-success' : 'text-danger'}>{p.is_active ? 'Активен' : 'Отключён'}</span>
                      </td>
                      <td className={`${cell} text-right`}>
                        {p.id !== access.userId && (
                          <form action={toggleUserAction}>
                            <input type="hidden" name="user_id" value={p.id} />
                            <input type="hidden" name="active" value={String(!p.is_active)} />
                            <button
                              type="submit"
                              aria-label={`${p.is_active ? 'Отключить' : 'Включить'} ${p.email}`}
                              className={`h-9 rounded-md border px-3 font-semibold ${p.is_active ? 'border-danger text-danger hover:bg-danger hover:text-white' : 'border-line-strong hover:border-black'}`}
                            >
                              {p.is_active ? 'Отключить' : 'Включить'}
                            </button>
                          </form>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section aria-labelledby="h-invitations">
        <h2 id="h-invitations" className="mb-4 text-xl font-bold">Приглашения</h2>
        {invitations.data.length === 0 ? (
          <Empty title="Приглашений пока нет" />
        ) : (
          <div className="overflow-x-auto rounded-lg bg-white shadow-panel">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead className="border-b border-line text-ink-3">
                <tr>
                  <th scope="col" className={cell}>Почта</th>
                  <th scope="col" className={cell}>Роль и компания</th>
                  <th scope="col" className={cell}>Отправлено</th>
                  <th scope="col" className={cell}>Статус</th>
                  <th scope="col" className={cell}><span className="sr-only">Действия</span></th>
                </tr>
              </thead>
              <tbody>
                {invitations.data.map((i) => {
                  const status = invitationStatus(i);
                  const company = (i.companies as unknown as { name: string } | null)?.name;
                  return (
                    <tr key={i.id} className="border-b border-line last:border-0">
                      <td className={cell}>{i.email}</td>
                      <td className={cell}>{roleLabel[i.role]}{company ? ` · ${company}` : ''}</td>
                      <td className={cell}>{dt.format(new Date(i.created_at))}</td>
                      <td className={cell}>{status}</td>
                      <td className={`${cell} text-right`}>
                        {status === 'Ждёт ответа' && (
                          <form action={revokeInvitationAction}>
                            <input type="hidden" name="invitation_id" value={i.id} />
                            <button type="submit" aria-label={`Отозвать приглашение ${i.email}`} className="h-9 rounded-md border border-line-strong px-3 font-semibold hover:border-black">
                              Отозвать
                            </button>
                          </form>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
