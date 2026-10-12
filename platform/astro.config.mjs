import { defineConfig } from 'astro/config';
import node from '@astrojs/node';

// Серверный режим: страницы кабинета и API работают на Node. Настройки — только из окружения при запуске.
export default defineConfig({
  output: 'server',
  adapter: node({ mode: 'standalone' }),
  security: { checkOrigin: true },
  build: { inlineStylesheets: 'auto' },
  vite: { build: { assetsInlineLimit: 0 }, ssr: { external: ['pg', 'pdfjs-dist', '@aws-sdk/client-s3', 'nodemailer'] } },
});
