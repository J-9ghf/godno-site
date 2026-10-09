import { NextResponse, type NextRequest } from 'next/server';
import { signOut } from '@/lib/auth/service';

const reasons = ['idle', 'denied', 'expired'] as const;
type Reason = (typeof reasons)[number];

// GET — автоматический выход (бездействие, отключённый доступ). Кнопка «Выйти» отправляет POST.
export async function GET(request: NextRequest) {
  const raw = request.nextUrl.searchParams.get('reason');
  const reason: Reason = reasons.includes(raw as Reason) ? (raw as Reason) : 'expired';
  await signOut(reason);
  return NextResponse.redirect(new URL(`/login?reason=${reason}`, request.url));
}

export async function POST(request: NextRequest) {
  // Выход только по кнопке с нашего же сайта.
  const origin = request.headers.get('origin');
  if (origin && new URL(origin).host !== request.nextUrl.host) {
    return new NextResponse(null, { status: 403 });
  }
  await signOut('user');
  return NextResponse.redirect(new URL('/login?reason=logout', request.url), { status: 303 });
}
