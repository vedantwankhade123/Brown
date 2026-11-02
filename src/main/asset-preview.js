const fs = require('node:fs/promises');
const path = require('node:path');
const { Worker, isMainThread, parentPort, workerData } = require('node:worker_threads');

// PDF rendering stays off the Electron main thread and has a fixed time limit.
if (!isMainThread && workerData?.assetPreview) {
  (async () => {
    const { PDFParse } = require('pdf-parse');
    const parser = new PDFParse({ data: new Uint8Array(await fs.readFile(workerData.path)) });
    try {
      const result = await parser.getScreenshot({ partial: [1], desiredWidth: 560, imageBuffer: false });
      parentPort.postMessage({ dataUrl: result.pages[0]?.dataUrl || '' });
    } finally { await parser.destroy(); }
  })().catch(() => parentPort.postMessage({ dataUrl: '' }));
}

function pdfPreview(filePath) {
  return new Promise(resolve => {
    const worker = new Worker(__filename, { workerData: { assetPreview: true, path: filePath } });
    let done = false;
    const finish = value => { if (done) return; done = true; clearTimeout(timer); worker.terminate().catch(() => {}); resolve(value); };
    const timer = setTimeout(() => finish(''), 10000);
    worker.once('message', value => finish(value.dataUrl || ''));
    worker.once('error', () => finish(''));
    worker.once('exit', () => finish(''));
  });
}

const cache = new Map(), pending = new Map();
async function preview(filePath) {
  const stat = await fs.stat(filePath);
  if (!stat.isFile() || stat.size > 30 * 1024 * 1024) return {};
  const key = filePath + ':' + stat.mtimeMs + ':' + stat.size;
  if (cache.has(key)) return cache.get(key);
  if (pending.has(key)) return pending.get(key);
  // The renderer also queues requests; this bounds work across multiple windows.
  if (pending.size >= 3) return {};
  const job = (async () => {
    const ext = path.extname(filePath).toLowerCase(); let result = {};
    if (ext === '.pdf') {
      const dataUrl = await pdfPreview(filePath); if (dataUrl) result = { dataUrl };
    } else if (/^\.(png|jpe?g|webp|gif|bmp|avif|svg)$/.test(ext)) {
      const { nativeImage } = require('electron');
      try { const image = await nativeImage.createThumbnailFromPath(filePath, { width: 560, height: 560 }); if (!image.isEmpty()) result = { dataUrl: image.toDataURL() }; } catch {}
    } else if (/^\.(txt|md|csv|json|js|jsx|ts|tsx|py|java|c|cpp|cs|html|css|sql|sh|ps1|yml|yaml)$/.test(ext)) {
      const file = await fs.open(filePath, 'r');
      try { const buffer = Buffer.alloc(4096); const { bytesRead } = await file.read(buffer, 0, buffer.length, 0); const text = buffer.subarray(0, bytesRead).toString('utf8'); if (!text.includes('\0')) result = { text }; } finally { await file.close(); }
    }
    cache.set(key, result); while (cache.size > 32) cache.delete(cache.keys().next().value);
    return result;
  })();
  pending.set(key, job);
  try { return await job; } finally { pending.delete(key); }
}
module.exports = { preview };
