'use client';

import { ErrorState } from '@/components/States';

export default function ErrorPage({ reset }: { error: Error; reset: () => void }) {
  return <ErrorState reset={reset} />;
}
