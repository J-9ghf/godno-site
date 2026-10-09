import type { NextRequest } from 'next/server';
import { guardSession } from '@/lib/supabase/proxy';

export function proxy(request: NextRequest) {
  return guardSession(request);
}

export const config = {
  matcher: ['/cabinet/:path*', '/admin/:path*', '/api/session/:path*'],
};
