// node render.js c1  -> c1-1-hero.png, c1-2-page.png, c1-3-ui.png
const { chromium } = require('playwright');
const fs = require('fs');
(async () => {
  const name = process.argv[2];
  const html = (fs.readFileSync('common.html','utf8') + fs.readFileSync(name + '.html','utf8')).replace('/*FONTS4*/', fs.existsSync('fonts/local4.css') ? fs.readFileSync('fonts/local4.css','utf8') : '');
  fs.writeFileSync(name + '.full.html', html);
  const b = await chromium.launch({ proxy: { server: process.env.HTTPS_PROXY } });
  const p = await b.newPage({ ignoreHTTPSErrors: true, viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  await p.goto('file://' + process.cwd() + '/' + name + '.full.html', { waitUntil: 'load', timeout: 60000 });
  await p.evaluate(() => document.fonts.ready);
  await p.waitForTimeout(800);
  // Пометки анимаций: ставим у целевого элемента
  await p.evaluate(() => {
    document.querySelectorAll('.an[data-at]').forEach(a => {
      const board = a.closest('.board'); const t = board.querySelector(a.dataset.at);
      if (!t) { a.style.background = 'red'; a.textContent = 'MISSING ' + a.dataset.at; return; }
      const br = board.getBoundingClientRect(), r = t.getBoundingClientRect(), w = a.offsetWidth;
      const pos = a.dataset.pos || 'tl', dx = +(a.dataset.dx || 0), dy = +(a.dataset.dy || 0), pad = 16;
      let x = pos.includes('l') ? r.left + pad : r.right - w - pad;
      let y = pos.includes('t') ? r.top + pad : r.bottom - a.offsetHeight - pad;
      if (pos === 'tr' && dx) x = r.right + dx - w;
      a.style.left = (x - br.left + (pos==='tr'?0:dx)) + 'px'; a.style.top = (y - br.top + dy) + 'px';
    });
  });
  const L = await p.$('#landing');
  await L.screenshot({ path: name + '-2-page.png' });
  const bb = await L.boundingBox();
  await p.screenshot({ path: name + '-1-hero.png', clip: { x: 0, y: bb.y, width: 1440, height: 900 }, fullPage: true });
  await (await p.$('#ui')).screenshot({ path: name + '-3-ui.png' });
  console.log('done', name, Math.round(bb.height));
  await b.close();
})();
