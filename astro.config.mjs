import { defineConfig } from 'astro/config';

export default defineConfig({
  site: 'https://example.com',
  build: { inlineStylesheets: 'auto' },
  // Юридические тексты выводятся дословно: без автоссылок из адресов и e-mail внутри текста
  markdown: { gfm: false },
  // Старые адреса документов → новые
  redirects: {
    '/privacy': '/privacy-policy',
    '/consent': '/personal-data',
  },
});
