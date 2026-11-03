#!/usr/bin/env node
// Post-build integrity gate for the packed desktop asar.
//
// Run under Electron (plain node cannot read inside an .asar):
//   node_modules/.bin/electron scripts/verify-asar-integrity.cjs <dist-dir-or-asar>
//
// Why this exists: electron-builder has produced asars whose dependency
// package.json files were byte-shifted during packing under memory pressure, so
// the stored size looked right but the content was corrupt. That breaks
// require('dompurify') in the preload, leaving window.ultronAPI undefined and the
// whole renderer bridge dead — while the app still "builds" successfully. This
// gate fails the release if the archive is corrupt instead of shipping it.
//
// Checks, in order:
//   1. every production dependency's package.json parses from inside the asar
//   2. critical source files are present and non-trivial
//   3. the packaged preload loads in a real BrowserWindow and exposes ultronAPI
const { app, BrowserWindow } = require('electron');
const fs = require('fs');
const originalFs = require('original-fs'); // bypasses the asar shim for real file stats
const path = require('path');

const arg = process.argv[2] || 'dist';

function resolveAsar(input) {
  const abs = path.resolve(input);
  const candidates = [
    abs.endsWith('app.asar') ? abs : null,
    path.join(abs, 'win-unpacked', 'resources', 'app.asar'),
    path.join(abs, 'app.asar'),
  ].filter(Boolean);
  return candidates.find((c) => fs.existsSync(c)) || null;
}

const CRITICAL_FILES = {
  'src/preload/preload.js': 1000,
  'src/main/ipc.js': 1000,
  'src/main/local-diagnostics.js': 500,
  'src/renderer/local-diagnostics-ui.js': 200,
  'src/renderer/index.html': 1000,
};

let failures = 0;
const fail = (msg) => { failures++; console.error('  FAIL  ' + msg); };
const ok = (msg) => console.log('  ok    ' + msg);

app.disableHardwareAcceleration();
const tmp = fs.mkdtempSync(path.join(require('os').tmpdir(), 'brown-asar-verify-'));
app.setPath('userData', path.join(tmp, 'profile'));

const deadline = setTimeout(() => { console.error('[asar-integrity] timed out'); app.exit(2); }, 60000);

app.whenReady().then(async () => {
  const asar = resolveAsar(arg);
  if (!asar) { console.error(`[asar-integrity] no app.asar found from "${arg}"`); clearTimeout(deadline); app.exit(2); return; }
  console.log(`[asar-integrity] verifying ${asar}`);
  console.log(`[asar-integrity] size ${(originalFs.statSync(asar).size / 1048576).toFixed(1)} MB`);

  // 1. production dependency package.json files
  let deps = [];
  try {
    const packedPkg = JSON.parse(fs.readFileSync(path.join(asar, 'package.json'), 'utf8'));
    deps = Object.keys(packedPkg.dependencies || {});
    console.log(`[asar-integrity] packed version ${packedPkg.version}, ${deps.length} production deps`);
  } catch (e) { fail('packed root package.json unreadable/invalid: ' + e.message); }

  console.log('[asar-integrity] check 1: dependency package.json integrity');
  const corrupt = [];
  for (const d of deps) {
    const rel = path.join(asar, 'node_modules', d, 'package.json');
    try { JSON.parse(fs.readFileSync(rel, 'utf8')); }
    catch (e) { corrupt.push(d); fail(`node_modules/${d}/package.json :: ${e.message.slice(0, 60)}`); }
  }
  if (!corrupt.length && deps.length) ok(`all ${deps.length} dependency package.json files parse`);

  // 2. critical source files
  console.log('[asar-integrity] check 2: critical source files');
  for (const [rel, minBytes] of Object.entries(CRITICAL_FILES)) {
    try {
      const b = fs.readFileSync(path.join(asar, rel));
      if (b.length < minBytes) fail(`${rel} too small (${b.length} < ${minBytes}) — likely truncated`);
      else ok(`${rel} (${b.length} bytes)`);
    } catch (e) { fail(`${rel} unreadable: ${e.message.slice(0, 60)}`); }
  }

  // 3. preload actually loads and exposes the bridge
  console.log('[asar-integrity] check 3: preload bridge loads');
  let win;
  try {
    let preloadError = null;
    win = new BrowserWindow({
      show: false,
      webPreferences: {
        preload: path.join(asar, 'src/preload/preload.js'),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: false,
        backgroundThrottling: false,
      },
    });
    win.webContents.on('preload-error', (_e, _p, err) => { preloadError = err; });
    const fixture = '<!doctype html><html><body>integrity</body></html>';
    await win.loadURL('data:text/html;base64,' + Buffer.from(fixture).toString('base64'));
    if (preloadError) fail('preload failed to load: ' + (preloadError.message || preloadError).toString().slice(0, 120));
    const bridge = await win.webContents.executeJavaScript(
      '(()=>({type:typeof window.ultronAPI,hasExport:typeof (window.ultronAPI&&window.ultronAPI.exportLocalDiagnostics),hasRecord:typeof (window.ultronAPI&&window.ultronAPI.recordLocalDiagnostic)}))()'
    );
    if (bridge.type !== 'object') fail(`window.ultronAPI is ${bridge.type}, expected object — preload bridge dead`);
    else if (bridge.hasExport !== 'function' || bridge.hasRecord !== 'function') fail(`ultronAPI missing diagnostics methods (export=${bridge.hasExport}, record=${bridge.hasRecord})`);
    else ok('preload loaded, window.ultronAPI exposes the diagnostics bridge');
  } catch (e) { fail('preload load check errored: ' + e.message.slice(0, 120)); }
  finally { try { win && win.destroy(); } catch (_) {} }

  console.log(failures ? `[asar-integrity] CORRUPT ARCHIVE — ${failures} failure(s). Do not release.` : '[asar-integrity] PASS — archive is intact.');
  clearTimeout(deadline);
  try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (_) {}
  app.exit(failures ? 1 : 0);
});
