// Просмотр PDF внутри карточки: pdf.js рисует страницы на canvas, файл получается запросом с проверкой прав.
// Кнопки «Скачать» здесь нет: скачивание — отдельная кнопка и отдельное право.
// Водяной знак с названием компании и датой — только пометка, а не защита: снимок экрана сделать можно всегда.
import { api, esc, openModal, toast } from './core';

// legacy-сборка pdf.js: основная требует новейших функций JavaScript, которых нет в распространённых браузерах
let pdfjsP: Promise<typeof import('pdfjs-dist')> | null = null;
async function pdfjs() {
  if (!pdfjsP) pdfjsP = (async () => {
    const lib = (await import('pdfjs-dist/legacy/build/pdf.mjs')) as unknown as typeof import('pdfjs-dist');
    const worker = (await import('pdfjs-dist/legacy/build/pdf.worker.min.mjs?url')).default;
    lib.GlobalWorkerOptions.workerSrc = worker;
    return lib;
  })();
  return pdfjsP;
}

export async function openPdf(url: string, title: string, watermark: string, downloadUrl?: string) {
  openModal(esc(title), `<div class="pdf-view" id="pdfView"><div class="empty"><b>Загружаем документ…</b></div></div>`,
    downloadUrl ? `<a class="btn btn-ghost" href="${esc(downloadUrl)}" download>Скачать оригинал</a>` : '', 'xwide');
  try {
    const res: Response = await api.raw(url);
    const data = new Uint8Array(await res.arrayBuffer());
    const lib = await pdfjs();
    const task = lib.getDocument({ data, verbosity: 0 });
    const doc = await task.promise;
    const box = document.getElementById('pdfView');
    if (!box) return;
    box.innerHTML = '';
    const width = Math.min(box.clientWidth || 800, 900);
    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i);
      const base = page.getViewport({ scale: 1 });
      const scale = width / base.width;
      const vp = page.getViewport({ scale: scale * (window.devicePixelRatio || 1) });
      const wrap = document.createElement('div');
      wrap.className = 'pdf-page';
      const canvas = document.createElement('canvas');
      canvas.width = vp.width; canvas.height = vp.height;
      canvas.style.width = width + 'px';
      canvas.setAttribute('aria-label', `Страница ${i} из ${doc.numPages}`);
      wrap.appendChild(canvas);
      const wm = document.createElement('div');
      wm.className = 'pdf-wm'; wm.textContent = watermark;
      wrap.appendChild(wm);
      box.appendChild(wrap);
      await page.render({ canvas, viewport: vp }).promise;
    }
    await task.destroy();
  } catch (e) {
    console.error('[pdf]', e);
    const box = document.getElementById('pdfView');
    if (box) box.innerHTML = '<div class="empty"><b>Не удалось открыть документ</b><span class="small">Файл недоступен или доступ к нему закрыт.</span></div>';
    toast(e instanceof Error ? e.message : 'Не удалось открыть документ');
  }
}
