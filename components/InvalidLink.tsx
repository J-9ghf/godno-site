import Link from 'next/link';

export function InvalidLink({ text }: { text: string }) {
  return (
    <div className="flex flex-col gap-5">
      <h1 className="text-3xl font-bold tracking-tight">Ссылка не работает</h1>
      <p className="text-ink-2">{text}</p>
      <Link href="/login" className="inline-flex h-12 items-center justify-center rounded-md bg-blue px-6 font-semibold text-white hover:bg-black">
        Ко входу
      </Link>
    </div>
  );
}
