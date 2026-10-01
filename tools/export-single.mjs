// Собирает лендинг (dist/index.html) в один самодостаточный HTML для публикации как Artifact:
// CSS, JS (GSAP), шрифты (только latin + cyrillic) и изображения встраиваются инлайн.
// Запуск: npm run build && node tools/export-single.mjs <out.html>
import { readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, extname } from 'node:path';

const out = process.argv[2] || 'ikr-assistants.html';
const dist = 'dist';
let html = readFileSync(join(dist, 'index.html'), 'utf8');

const mime = { '.woff2': 'font/woff2', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml' };
const dataUri = (p) => `data:${mime[extname(p)]};base64,${readFileSync(join(dist, p)).toString('base64')}`;

// 1. CSS → <style>, оставляем только latin и cyrillic начертания шрифтов
html = html.replace(/<link rel="stylesheet" href="([^"]+)">/g, (_, href) => {
  let css = readFileSync(join(dist, href), 'utf8');
  css = css.replace(/@font-face\{[^}]*\}/g, (ff) => {
    const m = ff.match(/url\(([^)]+\.woff2)\)/);
    if (!m) return ff;
    if (!/-(latin|cyrillic)-wght/.test(m[1]) || /-(latin|cyrillic)-ext-/.test(m[1])) return '';
    return ff.replace(/url\(([^)]+\.woff2)\)/, (_m, u) => `url(${dataUri(u)})`).replace(/,\s*url\([^)]*\.woff\)\s*format\("woff"\)/, '');
  });
  return `<style>${css}</style>`;
});

// 2. Модульный скрипт Astro → один IIFE-бандл (esbuild), инлайн
const bundle = execFileSync('node_modules/.bin/esbuild', ['src/scripts/assist.ts', '--bundle', '--minify', '--format=iife', '--target=es2019'], { encoding: 'utf8' });
const inline = `<script>${bundle.replace(/<\/script/g, '<\\/script')}</script>`;
// функция-заменитель: в бандле есть последовательности `$&`, которые строковая замена исказила бы
// Astro подключает модуль в <head> (defer); инлайн-скрипт ставим в конец документа
html = html.replace(/<script type="module" src="[^"]+"><\/script>/, '').replace(/<\/body>/, () => `${inline}</body>`);

// 3. Изображения → data URI
html = html.replace(/(src|content)="(\/brand\/[^"]+\.png)"/g, (_, attr, p) => `${attr}="${dataUri(p)}"`);

// 4. Убираем то, что хостинг задаёт сам: doctype/html/head/body, иконки, canonical
html = html
  .replace(/<!DOCTYPE html>/i, '')
  .replace(/<link rel="(icon|apple-touch-icon|canonical)"[^>]*>/g, '')
  .replace(/<\/?(html|head|body)(\s[^>]*)?>/g, "");

// Название страницы на хостинге — короткое имя продукта
html = html.replace(/<title>[^<]*<\/title>/, '<title>ИКР.Ассистенты</title>');

writeFileSync(out, html);
console.log(out, (Buffer.byteLength(html) / 1024).toFixed(0) + ' KB');
