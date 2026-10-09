// Продление отметки активности: саму отметку ставит proxy.ts, здесь только ответ.
export function POST() {
  return new Response(null, { status: 204 });
}
