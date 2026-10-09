import { CabinetBlock, Cases, CandidateReport, Directions, Faq, Guarantees, Principles, Process, Stats, WhyHard } from '@/components/site/Blocks';
import { Hero } from '@/components/site/Hero';
import { LeadForm } from '@/components/site/LeadForm';
import { ResumeForm } from '@/components/site/ResumeForm';
import { Reviews } from '@/components/site/Reviews';
import { Section } from '@/components/site/Section';
import { SiteFooter } from '@/components/site/SiteFooter';
import { SiteHeader } from '@/components/site/SiteHeader';
import { candidatesBlock, leadBlock } from '@/content/landing';
import { env } from '@/lib/env';
import { issueFormToken } from '@/lib/forms/guard';
import { getPositions } from '@/lib/forms/positions';

// Страница рендерится на сервере при каждом запросе: формам нужен свежий подписанный токен времени.
export const dynamic = 'force-dynamic';

export default async function LandingPage() {
  const { CAPTCHA_PROVIDER, SMARTCAPTCHA_CLIENT_KEY, RESUME_FORM_MODE } = env();
  const positions = await getPositions();
  const formProps = {
    token: issueFormToken(),
    captchaKey: CAPTCHA_PROVIDER === 'smartcaptcha' ? SMARTCAPTCHA_CLIENT_KEY : undefined,
    positions,
  };

  return (
    <>
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-white focus:px-4 focus:py-2">
        К содержимому
      </a>
      <SiteHeader />
      <main id="main">
        <Hero />
        <Stats />
        <Directions />
        <WhyHard />
        <Principles />
        <CandidateReport />
        <Process />
        <Cases />
        <Reviews />
        <Guarantees />
        <CabinetBlock />

        <Section id="candidates" num="10" label="Кандидатам" tone="soft">
          <div className="grid grid-cols-1 gap-10 lg:grid-cols-12">
            <div className="lg:col-span-4">
              <h2 id="candidates-title" className="t-2">{candidatesBlock.title}</h2>
              <p className="lead mt-6 text-ink-2">{candidatesBlock.text}</p>
            </div>
            <div className="lg:col-span-8">
              <ResumeForm {...formProps} testMode={RESUME_FORM_MODE === 'test'} />
            </div>
          </div>
        </Section>

        <Section id="contact" num="11" label="Заявка" tone="blue">
          <div className="grid grid-cols-1 gap-10 lg:grid-cols-12">
            <div className="lg:col-span-4">
              <h2 id="contact-title" className="t-2">{leadBlock.title}</h2>
              <p className="lead mt-6 text-ink-2">{leadBlock.subtitle}</p>
            </div>
            <div className="lg:col-span-8">
              <LeadForm {...formProps} />
            </div>
          </div>
        </Section>

        <Faq />
      </main>
      <SiteFooter />
    </>
  );
}
