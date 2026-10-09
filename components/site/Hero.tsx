import { hero } from '@/content/landing';

/** Первый экран: видео заказчика на весь экран (без звука, без управления), поверх — заголовок и две кнопки. */
export function Hero() {
  return (
    <section id="top" aria-labelledby="hero-title" className="relative flex min-h-[100svh] items-end overflow-hidden bg-[#6f7478] text-white">
      <video
        className="absolute inset-0 h-full w-full object-cover object-[60%_50%] sm:object-[64%_50%] lg:object-center"
        autoPlay
        muted
        loop
        playsInline
        preload="metadata"
        poster="/media/hero-poster.jpg"
        aria-hidden
        tabIndex={-1}
      >
        <source src="/media/hero.webm" type="video/webm" />
        <source src="/media/hero.mp4" type="video/mp4" />
      </video>
      <div aria-hidden className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/35 to-black/20" />
      <div className="container-site relative pb-[12vh] pt-32">
        <h1 id="hero-title" className="t-hero max-w-[14ch]">
          {hero.title}
        </h1>
        <p className="lead mt-6 max-w-2xl text-white/90">{hero.subtitle}</p>
        <div className="mt-10 flex flex-col gap-3 sm:flex-row">
          <a href="#contact" className="inline-flex h-14 items-center justify-center rounded-md bg-blue px-8 text-base font-semibold text-white hover:bg-white hover:text-black">
            {hero.primary}
          </a>
          <a href="#candidates" className="inline-flex h-14 items-center justify-center rounded-md border border-white/70 px-8 text-base font-semibold hover:bg-white hover:text-black">
            {hero.secondary}
          </a>
        </div>
      </div>
    </section>
  );
}
