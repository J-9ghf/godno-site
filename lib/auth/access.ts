import 'server-only';
import { cache } from 'react';
import { redirect } from 'next/navigation';
import { createUserClient } from '@/lib/supabase/server';

export type Role = 'client' | 'manager' | 'admin';

export interface Access {
  userId: string;
  email: string;
  fullName: string;
  role: Role;
  companyId: string | null;
  companyName: string | null;
  isCompanyLead: boolean;
}

/**
 * Кто вошёл и с какими правами. Роль вычисляет база (my_access): у отключённого пользователя
 * и у админа без второго шага роли нет. Результат кешируется на время одного запроса.
 */
export const getAccess = cache(async (): Promise<Access | null> => {
  const supabase = await createUserClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return null;
  const { data, error } = await supabase.rpc('my_access').maybeSingle<{
    user_id: string;
    email: string;
    full_name: string;
    role: Role | null;
    company_id: string | null;
    company_name: string | null;
    is_company_lead: boolean;
  }>();
  if (error || !data || !data.role) return null;
  return {
    userId: data.user_id,
    email: data.email,
    fullName: data.full_name,
    role: data.role,
    companyId: data.company_id,
    companyName: data.company_name,
    isCompanyLead: data.is_company_lead,
  };
});

export function homeFor(role: Role): string {
  return role === 'client' ? '/cabinet' : '/admin';
}

/** Пускает только указанные роли. Остальных — на вход или в свой кабинет. */
export async function requireRole(roles: Role[]): Promise<Access> {
  const access = await getAccess();
  if (!access) redirect('/auth/signout?reason=denied');
  if (!roles.includes(access.role)) redirect(homeFor(access.role));
  return access;
}
