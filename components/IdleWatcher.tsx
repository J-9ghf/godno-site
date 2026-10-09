'use client';

import { useEffect, useRef, useState } from 'react';

const EVENTS = ['mousedown', 'keydown', 'touchstart', 'scroll', 'pointermove'] as const;
const PING_EVERY_MS = 5 * 60_000;
const WARN_BEFORE_MS = 60_000;

/**
 * Автовыход по бездействию на стороне браузера: через idleMinutes без действий пользователя
 * переводит на выход. Пока пользователь активен (например, долго заполняет форму),
 * раз в 5 минут продлевает серверную отметку активности. Главная проверка — на сервере (proxy.ts).
 */
export function IdleWatcher({ idleMinutes }: { idleMinutes: number }) {
  const lastActivity = useRef(Date.now());
  const lastPing = useRef(Date.now());
  const [warning, setWarning] = useState(false);

  useEffect(() => {
    const idleMs = idleMinutes * 60_000;
    const onActivity = () => {
      lastActivity.current = Date.now();
      setWarning(false);
      if (Date.now() - lastPing.current > PING_EVERY_MS) {
        lastPing.current = Date.now();
        fetch('/api/session/ping', { method: 'POST' }).catch(() => undefined);
      }
    };
    for (const e of EVENTS) window.addEventListener(e, onActivity, { passive: true });
    const timer = window.setInterval(() => {
      const idle = Date.now() - lastActivity.current;
      if (idle >= idleMs) {
        window.location.assign('/auth/signout?reason=idle');
      } else if (idle >= idleMs - WARN_BEFORE_MS) {
        setWarning(true);
      }
    }, 10_000);
    return () => {
      for (const e of EVENTS) window.removeEventListener(e, onActivity);
      window.clearInterval(timer);
    };
  }, [idleMinutes]);

  if (!warning) return null;
  return (
    <div role="alert" className="fixed inset-x-4 bottom-4 z-50 mx-auto max-w-md rounded-md border border-line-strong bg-white p-4 text-sm shadow-panel">
      Через минуту вы выйдете из кабинета из-за бездействия. Чтобы остаться, нажмите любую клавишу или кликните.
    </div>
  );
}
