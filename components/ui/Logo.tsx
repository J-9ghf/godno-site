/**
 * Логотип ИКР из файла заказчика (public/brand/mark-*.png) как альфа-маска:
 * форма не меняется, цвета слоёв — из токенов.
 */
export function Logo({
  height = 40,
  className = '',
  ink = 'var(--c-black)',
  accent = 'var(--c-blue)',
}: {
  height?: number;
  className?: string;
  ink?: string;
  accent?: string;
}) {
  const layer = 'absolute inset-0 [mask-position:center] [mask-repeat:no-repeat] [mask-size:contain]';
  return (
    <span role="img" aria-label="ИКР" className={`relative block flex-none ${className}`} style={{ height, aspectRatio: '406 / 448' }}>
      <span className={layer} style={{ background: ink, maskImage: 'url(/brand/mark-dark.png)', WebkitMaskImage: 'url(/brand/mark-dark.png)' }} />
      <span className={layer} style={{ background: accent, maskImage: 'url(/brand/mark-accent.png)', WebkitMaskImage: 'url(/brand/mark-accent.png)' }} />
    </span>
  );
}

export function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <span className="flex items-center gap-3">
      <Logo height={compact ? 32 : 40} />
      <span className="border-l border-line-strong pl-3 text-[11px] font-bold uppercase leading-tight tracking-[0.14em] text-black">
        Институт
        <br />
        кадровых решений
      </span>
    </span>
  );
}
