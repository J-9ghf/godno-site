'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { requireRole } from '@/lib/auth/access';
import { createInvitation, setUserActive } from '@/lib/auth/service';
import { emailSchema, fieldErrors, type FormState } from '@/lib/auth/validation';
import { createUserClient } from '@/lib/supabase/server';

const companySchema = z.object({
  name: z.string().trim().min(2, 'Укажите название').max(200),
  contact_name: z.string().trim().max(120).optional().transform((v) => v || null),
  contact_email: z.union([emailSchema, z.literal('')]).optional().transform((v) => v || null),
  contact_phone: z.string().trim().max(40).optional().transform((v) => v || null),
});

export async function createCompanyAction(_prev: FormState, formData: FormData): Promise<FormState> {
  await requireRole(['admin']);
  const parsed = companySchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { status: 'error', fieldErrors: fieldErrors(parsed.error) };
  const supabase = await createUserClient();
  const { error } = await supabase.from('companies').insert(parsed.data);
  if (error) return { status: 'error', message: 'Не удалось создать компанию.' };
  revalidatePath('/admin/users');
  return { status: 'success', message: `Компания «${parsed.data.name}» создана. Теперь пригласите контактное лицо.` };
}

const inviteSchema = z
  .object({
    email: emailSchema,
    full_name: z.string().trim().max(120).optional(),
    role: z.enum(['client', 'manager', 'admin'], { message: 'Выберите роль' }),
    company_id: z.string().uuid().optional().or(z.literal('')),
    is_company_lead: z.literal('on').optional(),
  })
  .refine((v) => v.role !== 'client' || Boolean(v.company_id), { message: 'Для клиента выберите компанию', path: ['company_id'] });

export async function inviteAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const access = await requireRole(['admin']);
  const parsed = inviteSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { status: 'error', fieldErrors: fieldErrors(parsed.error) };
  const v = parsed.data;
  const result = await createInvitation(
    { email: v.email, fullName: v.full_name, role: v.role, companyId: v.company_id || null, isCompanyLead: v.is_company_lead === 'on' },
    access.userId,
  );
  if (result.kind === 'exists') return { status: 'error', fieldErrors: { email: 'Пользователь с этой почтой уже есть' } };
  if (result.kind !== 'ok') return { status: 'error', message: 'Не удалось создать приглашение.' };
  revalidatePath('/admin/users');
  return { status: 'success', message: `Приглашение отправлено на ${v.email}. Ссылка действует 72 часа.` };
}

export async function toggleUserAction(formData: FormData): Promise<void> {
  const access = await requireRole(['admin']);
  const id = z.string().uuid().parse(formData.get('user_id'));
  const active = formData.get('active') === 'true';
  await setUserActive(id, active, access.userId);
  revalidatePath('/admin/users');
}

export async function revokeInvitationAction(formData: FormData): Promise<void> {
  await requireRole(['admin']);
  const id = z.string().uuid().parse(formData.get('invitation_id'));
  const supabase = await createUserClient();
  await supabase.from('invitations').update({ revoked_at: new Date().toISOString() }).eq('id', id).is('used_at', null);
  revalidatePath('/admin/users');
}
