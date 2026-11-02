'use strict';
const path = require('path');
const states = new WeakMap();

// Mermaid needs a DOM, so a sandboxed renderer (rather than a Node worker)
// owns its layout. Heavy layout cannot block the chat's animation thread.
function renderDiagram(source, owner) {
  const code = String(source || '').trim();
  if (!owner || owner.isDestroyed()) return Promise.reject(new Error('Chat window is closed.'));
  if (code.length > 12000) return Promise.reject(new Error('This diagram is too large. Ask for smaller diagrams.'));
  let state = states.get(owner);
  if (!state) {
    state = { window: null, tail: Promise.resolve(), pending: 0, cache: new Map() };
    states.set(owner, state);
    owner.once('destroyed', () => { if (state.window && !state.window.isDestroyed()) state.window.destroy(); });
  }
  if (state.cache.has(code)) return Promise.resolve(state.cache.get(code));
  if (state.pending >= 4) return Promise.reject(new Error('Too many diagrams are rendering. Please try again shortly.'));
  state.pending++;
  const job = state.tail.then(async () => {
    if (owner.isDestroyed()) throw new Error('Chat window is closed.');
    const { BrowserWindow } = require('electron');
    let timer;
    try {
      const html = await Promise.race([
        (async () => {
          if (!state.window || state.window.isDestroyed()) {
            state.window = new BrowserWindow({
              show: false, width: 1100, height: 800,
              webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false,
                backgroundThrottling: false, partition: 'brown-local-visual-renderer' }
            });
            state.window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
            state.window.webContents.on('will-navigate', event => event.preventDefault());
            state.window.webContents.session.webRequest.onBeforeRequest((details, callback) => {
              callback({ cancel: !/^(file|data|blob):/.test(details.url) });
            });
            await state.window.loadFile(path.join(__dirname, '../renderer/visual-renderer.html'));
          }
          return state.window.webContents.executeJavaScript(
            `(async () => {
              const html = await window.UltronVisualEngine.renderMermaidDiagram(${JSON.stringify(code)});
              if (/data-visual-error/.test(html)) return html;
              const host = document.createElement('div');
              host.style.cssText = 'position:absolute;width:1100px;opacity:0;pointer-events:none';
              host.innerHTML = html;
              document.body.appendChild(host);
              try {
                const nodes = [...host.querySelectorAll('svg g.node')].map(node => node.getBoundingClientRect()).filter(rect => rect.width > 0 && rect.height > 0);
                for (let i = 0; i < nodes.length; i++) for (let j = i + 1; j < nodes.length; j++) {
                  const a = nodes[i], b = nodes[j];
                  const width = Math.min(a.right, b.right) - Math.max(a.left, b.left);
                  const height = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
                  if (width > 4 && height > 4 && width * height > 0.2 * Math.min(a.width * a.height, b.width * b.height)) throw new Error('Diagram nodes overlap. Shorten labels or change layout direction.');
                }
                return html;
              } finally { host.remove(); }
            })()`
          );
        })(),
        new Promise((_, reject) => {
          timer = setTimeout(() => {
            if (state.window && !state.window.isDestroyed()) state.window.destroy();
            state.window = null;
            reject(new Error('Visual rendering timed out. Try a smaller diagram.'));
          }, 15000);
        })
      ]);
      if (!/data-visual-error/.test(html)) {
        state.cache.set(code, html);
        if (state.cache.size > 6) state.cache.delete(state.cache.keys().next().value);
      }
      return html;
    } finally { clearTimeout(timer); }
  });
  state.tail = job.catch(() => {});
  return job.finally(() => { state.pending--; });
}
module.exports = { renderDiagram };
