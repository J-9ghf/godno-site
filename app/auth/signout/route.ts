import { NextResponse, type NextRequest } from 'next/server';
import { signOut } from '@/lib/auth/service';
import { isOwnOrigin, publicUrl } from '@/lib/public-url';

const reasons = ['idle', 'denied', 'expired'] as const;
type Reason = (typeof reasons)[number];

// GET — автоматический выход (бездействие, отключённый доступ). Кнопка «Выйти» отправляет POST.
export async function GET(request: NextRequest) {
  const raw = request.nextUrl.searchParams.get('reason');
  const reason: Reason = reasons.includes(raw as Reason) ? (raw as Reason) : 'expired';
  await signOut(reason);
  return NextResponse.redirect(publicUrl(`/login?reason=${reason}`));
}

export async function POST(request: NextRequest) {
  // Выход только по кнопке с нашего же сайта.
  if (!isOwnOrigin(request.headers.get('origin'))) {
    return new NextResponse(null, { status: 403 });
  }
  await signOut('user');
  return NextResponse.redirect(publicUrl('/login?reason=logout'), { status: 303 });
}
