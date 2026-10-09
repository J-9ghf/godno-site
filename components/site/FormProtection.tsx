'use client';

import Script from 'next/script';
import { HONEYPOT_FIELD } from '@/lib/forms/honeypot';

/**
 * Защита формы на стороне браузера: подписанный токен времени, скрытое поле-ловушка и
 * виджет Яндекс SmartCaptcha (если включён). Проверка всех трёх — на сервере.
 */
export function FormProtection({ formId, token, captchaKey }: { formId: string; token: string; captchaKey?: string }) {
  return (
    <>
      <input type="hidden" name="form_token" value={token} />
      {/* Человек это поле не видит и не заполняет; боты заполняют всё подряд. */}
      <div aria-hidden className="absolute -left-[10000px] h-px w-px overflow-hidden">
        <label htmlFor={`hp-${formId}`}>Сайт</label>
        <input id={`hp-${formId}`} name={HONEYPOT_FIELD} type="text" tabIndex={-1} autoComplete="off" defaultValue="" />
      </div>
      {captchaKey && (
        <>
          <Script src="https://smartcaptcha.yandexcloud.net/captcha.js" strategy="afterInteractive" />
          <div className="smart-captcha" data-sitekey={captchaKey} data-hl="ru" />
        </>
      )}
    </>
  );
}
