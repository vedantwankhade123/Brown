'use strict';

// Run with: node_modules/.bin/electron tests/agent-browser-electron.test.js
const electron = require('electron');
if (process.type === 'renderer') {
  electron.ipcRenderer.on('browser:event', (_event, payload) => {
    electron.ipcRenderer.send('agent-browser-integration:event', payload);
  });
  electron.ipcRenderer.send('agent-browser-integration:event', { type: 'test-preload-ready' });
} else if (!electron.app) {
  throw new Error('Launch this test with Electron, not node.');
} else {
  runIntegration().catch(error => {
    console.error('FATAL:', error.stack || error);
    electron.app.exit(1);
  });
}

async function runIntegration() {
  const assert = require('node:assert/strict');
  const fs = require('node:fs');
  const os = require('node:os');
  const path = require('node:path');
  const { randomUUID } = require('node:crypto');
  const { EventEmitter } = require('node:events');
  const { app, BrowserWindow, WebContentsView, ipcMain, session } = electron;
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'brown-browser-electron-test-'));
  app.setPath('userData', profile);
  app.setPath('sessionData', profile);
  app.setPath('crashDumps', profile);
  // Ignore OS occlusion in this test so animation frames cannot stall behind another app.
  if (process.platform === 'win32') app.commandLine.appendSwitch('disable-features', 'CalculateNativeWinOcclusion');
  // Do not import the application entry point or acquire its single-instance lock.
  app.on('window-all-closed', () => {});

  const secrets = ['PRIVATE_INPUT_92641', 'PRIVATE_PASSWORD_92641',
    'PRIVATE_TEXTAREA_92641', 'PRIVATE_EDITABLE_92641', 'PRIVATE_ROLE_VALUE_92641',
    'HIDDEN_TEXT_92641', 'FRAME_PRIVATE_92641', 'URL_TOKEN_92641'];
  const fixture = `<!doctype html><html><head><meta charset="utf-8">
    <title>Controlled browser integration fixture</title>
    <style>
      html { scroll-behavior: auto; } body { margin:20px; font:16px sans-serif; }
      main { width:720px; } h1 { font-size:22px; margin:0 0 12px; }
      .row { display:flex; gap:12px; margin:10px 0; align-items:center; }
      label { display:inline-flex; gap:8px; align-items:center; }
      input, textarea, select, button, [contenteditable], [role=textbox] {
        box-sizing:border-box; font:16px sans-serif; min-height:32px;
      }
      input, textarea { width:210px; } textarea { height:38px; }
      button { padding:5px 12px; } iframe { width:500px; height:45px; }
      #spacer { height:2600px; background:linear-gradient(#fff, #dde6f5); }
      #cover { position:fixed; inset:0; background:#ececec; z-index:1000; }
    </style></head><body><main>
    <h1>Local fixture: all effects stay in this test</h1>
    <p>Public readable evidence from the main document.</p>
    <div class="row"><button id="increment" type="button">Increment counter</button>
      <button id="replaceable" type="button">Replaceable target</button>
      <button id="covered" type="button">Coverable target</button></div>
    <form id="draft-form" class="row"><label>Draft text<input id="draft" value="${secrets[0]}"></label>
      <label>Password<input id="password" type="password" value="${secrets[1]}"></label><button type="submit" hidden>Submit</button></form>
    <div class="row"><label>Notes<textarea id="notes">${secrets[2]}</textarea></label>
      <label>Color<select id="color"><option value="red">Red</option>
        <option value="blue">Blue</option><option value="disabled" disabled>Unavailable</option>
      </select></label></div>
    <div class="row"><div id="editable" contenteditable="true" aria-label="Draft editor">${secrets[3]}</div></div>
    <div class="row"><div role="textbox" aria-label="Custom field">${secrets[4]}</div></div>
    <div hidden>${secrets[5]}</div>
    <a href="https://example.com/next?topic=fixture&token=${secrets[7]}#private">Fixture next page</a>
    <div class="row"><iframe id="frame" title="Opaque-origin fixture" sandbox="allow-scripts" src="https://example.com/frame"></iframe></div>
    <div id="spacer">Scroll region</div><p>Bottom of local fixture</p>
    </main><script>
      window.fixtureState = { clicks:0, replaced:0, covered:0, inputEvents:0, submits:0,
        selectInput:0, selectChange:0, keys:[], wheels:[], frameReady:false, frameOrigin:null };
      document.getElementById('draft-form').addEventListener('submit', event => { event.preventDefault(); fixtureState.submits++; });
      addEventListener('wheel', event => fixtureState.wheels.push({ deltaY:event.deltaY, target:event.target.id }), { passive:true });
      document.getElementById('increment').addEventListener('click', () => fixtureState.clicks++);
      document.getElementById('replaceable').addEventListener('click', () => fixtureState.replaced++);
      document.getElementById('covered').addEventListener('click', () => fixtureState.covered++);
      document.getElementById('draft').addEventListener('input', () => fixtureState.inputEvents++);
      document.getElementById('draft').addEventListener('keydown', event => fixtureState.keys.push(event.key));
      document.getElementById('color').addEventListener('input', () => fixtureState.selectInput++);
      document.getElementById('color').addEventListener('change', () => fixtureState.selectChange++);
      addEventListener('message', event => {
        if (event.source === document.getElementById('frame').contentWindow && event.data === 'fixture-frame-ready') {
          fixtureState.frameReady = true; fixtureState.frameOrigin = event.origin;
        }
      });
    </script></body></html>`;
  const frame = `<!doctype html><html><body>${secrets[6]}<button>Frame-only action</button>
    <script>parent.postMessage('fixture-frame-ready', '*')</script></body></html>`;
  const headers = {
    'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store',
    'content-security-policy': "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; frame-src https://example.com; connect-src https://example.com; form-action 'none'"
  };

  let owner;
  let browser;
  let isolatedSession;
  let runController;
  let currentName = '';
  let passed = 0;
  let failed = 0;
  let shuttingDown = false;
  const ui = new EventEmitter();
  const events = [];
  const actionEvents = [];
  const requests = [];
  const unexpectedRequests = [];
  const pageErrors = [];
  const pending = new Set();
  const slowResponses = new Set();
  const startedAt = Date.now();
  const receive = (event, payload) => {
    if (!owner || event.sender !== owner.webContents || event.senderFrame !== owner.webContents.mainFrame) return;
    events.push(payload);
    ui.emit('event', payload);
  };
  ipcMain.on('agent-browser-integration:event', receive);

  function timeout(promise, label, milliseconds = 6000) {
    let timer;
    return Promise.race([promise, new Promise((_resolve, reject) => {
      timer = setTimeout(() => reject(new Error(`Timed out: ${label} (${milliseconds}ms)`)), milliseconds);
    })]).finally(() => clearTimeout(timer));
  }

  async function until(check, label, milliseconds = 4000) {
    const deadline = Date.now() + milliseconds;
    let last;
    do {
      last = await check();
      if (last) return last;
      // Short condition polling, not an assumption about navigation/input timing.
      await new Promise(resolve => setTimeout(resolve, 25));
    } while (Date.now() < deadline);
    throw new Error(`Condition not reached: ${label}`);
  }

  function track(promise) {
    const work = Promise.resolve(promise);
    pending.add(work);
    work.then(() => pending.delete(work), () => pending.delete(work));
    return work;
  }

  function nextEvent(predicate, label) {
    let listener;
    let timer;
    const promise = new Promise((resolve, reject) => {
      listener = event => {
        if (predicate(event)) { cancel(); resolve(event); }
      };
      timer = setTimeout(() => { cancel(); reject(new Error(`Missing UI event: ${label}`)); }, 6000);
      ui.on('event', listener);
    });
    function cancel() { clearTimeout(timer); ui.removeListener('event', listener); }
    // A failing tool can finish before its expected event; callers cancel that wait.
    promise.catch(() => {});
    return { promise, cancel };
  }

  const dom = code => browser.view.webContents.executeJavaScript(code);
  const action = (name, args = {}) => track(browser.perform(name, args));
  function success(result, label) {
    assert.equal(result.success, true, `${label}: ${JSON.stringify(result)}`);
    assert.equal(result.untrusted, true, `${label}: page-derived tool result must be marked untrusted`);
    return result;
  }
  function rejected(result, label, pattern) {
    assert.equal(result.success, false, `${label} unexpectedly succeeded: ${JSON.stringify(result)}`);
    assert.equal(result.untrusted, true);
    assert.equal(typeof result.error, 'string');
    if (pattern) assert.match(result.error, pattern, label);
    return result;
  }
  const observe = async () => success(await action('observe'), 'observe');
  function ref(observation, label) {
    const matches = observation.elements.filter(element => element.label === label);
    assert.equal(matches.length, 1, `Expected one target "${label}": ${JSON.stringify(observation.elements)}`);
    return { observationId: observation.observationId, id: matches[0].id };
  }
  const snapshot = () => dom(`({ ...fixtureState, keys:[...fixtureState.keys],
    draft:document.getElementById('draft').value, password:document.getElementById('password').value,
    color:document.getElementById('color').value })`);

  // Resolve approval only after a real published IPC event, solely in this test.
  async function holdApproval(start) {
    const waiter = nextEvent(event => event.type === 'state' && event.state.approval, 'approval');
    const work = track(start());
    try {
      const event = await Promise.race([waiter.promise, work.then(result => {
        throw new Error(`Action finished without its required approval: ${JSON.stringify(result)}`);
      })]);
      await until(() => dom("document.visibilityState === 'hidden'"), 'native page hidden for approval UI');
      return { work, approval: event.state.approval };
    } finally { waiter.cancel(); }
  }
  async function approvedAction(name, args, approved = true) {
    const { work, approval } = await holdApproval(() => action(name, args));
    assert.match(approval.title, /Allow this browser action/i);
    await browser.command({ command: 'approve', id: approval.id, approved });
    return timeout(work, `${name} after approval`);
  }

  async function freshRun() {
    runController = new AbortController();
    await browser.beginRun({ id: `${currentName}-${randomUUID()}`, controller: runController,
      onEvent: event => actionEvents.push(event), remote: false });
    await browser.command({ command: 'bounds', bounds: { x: 0, y: 0, width: 800, height: 600 }, visible: true });
    const observation = success(await action('open', {
      url: `https://example.com/fixture?case=${encodeURIComponent(currentName)}&token=${secrets[7]}#private`
    }), 'open controlled fixture');
    await until(() => dom('Boolean(window.fixtureState && fixtureState.frameReady)'), 'opaque-origin frame loaded');
    return observation;
  }

  async function finishRun() {
    if (browser?.run) {
      const id = browser.run.id;
      browser.stop();
      for (const release of slowResponses) release();
      slowResponses.clear();
      browser.endRun(id);
    }
    await timeout(Promise.allSettled([...pending]), 'drain this test run', 5000);
    assert.equal(browser?.approval || null, null, 'Approval must be cleared at end of run');
  }

  async function test(name, body, { open = true } = {}) {
    currentName = name;
    const eventStart = events.length;
    const errorStart = pageErrors.length;
    try {
      const exercise = async () => {
        if (open) await freshRun();
        await body();
        assert.deepEqual(unexpectedRequests, [], 'No request may leave the controlled fixture');
      };
      await timeout(exercise(), name, 18000);
      passed++;
      console.log(`PASS ${name}`);
    } catch (error) {
      failed++;
      console.error(`FAIL ${name}\n${error.stack || error}`);
      console.error('EVIDENCE', JSON.stringify({
        state: browser?.state(), runCount: browser?.run?.count,
        actions: events.slice(eventStart).filter(event => event.type === 'action'),
        providerEvents: actionEvents.filter(event => event.runId === browser?.run?.id).slice(-6),
        pageErrors: pageErrors.slice(errorStart)
      }));
      if (browser?.view && !browser.view.webContents.isDestroyed()) {
        try { console.error('DOM', JSON.stringify(await timeout(dom(`({url:location.href,
          scrollY, innerWidth, innerHeight, active:document.activeElement?.id,
          state:window.fixtureState, draft:document.getElementById('draft')?.value,
          color:document.getElementById('color')?.value})`), 'failure evidence', 1500))); }
        catch (_) { /* The failing case may intentionally have stopped a navigation. */ }
      }
    } finally {
      // Never start another case with unresolved work from the preceding run.
      await finishRun();
    }
  }

  try {
    await app.whenReady();
    console.log(`Electron ${process.versions.electron}; Node ${process.versions.node}; Chromium ${process.versions.chrome}; profile ${profile}`);
    const { AgentBrowser } = require('../src/main/agent-browser');
    passed++;
    console.log('PASS production browser module loads in bundled Electron');
    owner = new BrowserWindow({ width: 840, height: 660, useContentSize: true, show: true,
      title: 'Agent browser integration test (isolated temporary profile)',
      webPreferences: { preload: __filename, sandbox: true, contextIsolation: true, nodeIntegration: false } });
    owner.webContents.on('preload-error', (_event, _file, error) => console.error('OWNER PRELOAD:', error));
    const preloadReady = nextEvent(event => event.type === 'test-preload-ready', 'owner preload ready');
    await owner.loadURL('data:text/html,<title>Browser integration test owner</title><p>Isolated test window</p>');
    await preloadReady.promise;
    browser = new AgentBrowser(owner);
    await browser.command({ command: 'show' });
    await browser.command({ command: 'bounds', bounds: { x: 0, y: 0, width: 800, height: 600 }, visible: true });
    isolatedSession = browser.view.webContents.session;
    // Route only this test's private session to local fixtures.
    await isolatedSession.protocol.handle('https', async request => {
      const url = new URL(request.url);
      requests.push({ url: request.url, method: request.method });
      if (url.origin !== 'https://example.com' || !['/fixture', '/frame', '/next', '/slow', '/download'].includes(url.pathname)
          || request.method !== 'GET') {
        unexpectedRequests.push({ url: request.url, method: request.method });
        return new Response('Unexpected fixture request blocked by the test', { status: 403 });
      }
      if (url.pathname === '/download') return new Response('Approved fixture download', { headers: {
        'content-type': 'application/octet-stream', 'content-disposition': 'attachment; filename="fixture.txt"'
      } });
      if (url.pathname === '/slow') {
        await new Promise(resolve => {
          const release = () => { slowResponses.delete(release); resolve(); };
          slowResponses.add(release);
          if (shuttingDown) release();
        });
      }
      return new Response(url.pathname === '/frame' ? frame : fixture, { status: 200, headers });
    });
    browser.view.webContents.on('console-message', (_event, level, message) => {
      if (level >= 2) pageErrors.push(message);
    });

    await test('visible native view and sandbox isolation', async () => {
      const wc = browser.view.webContents;
      assert.ok(browser.view instanceof WebContentsView);
      assert.equal(owner.isVisible(), true);
      assert.deepEqual(browser.view.getBounds(), { x: 0, y: 0, width: 800, height: 600 });
      assert.notEqual(wc.session, owner.webContents.session);
      assert.notEqual(wc.session, session.defaultSession);
      assert.equal(wc.session.isPersistent(), false);
      assert.equal(app.getPath('userData'), profile);
      const preferences = wc.getLastWebPreferences();
      for (const key of ['sandbox', 'contextIsolation', 'webSecurity']) assert.equal(preferences[key], true, key);
      assert.equal(preferences.nodeIntegration, false);
      assert.ok(!preferences.preload, 'Native website must not receive an application preload');
      const globals = await dom(`Object.fromEntries(['require','process','Buffer','ipcRenderer',
        'electron','ultronAPI','brownAPI'].map(key => [key, typeof window[key]]))`);
      for (const [name, type] of Object.entries(globals)) assert.equal(type, 'undefined', `Website exposes ${name}`);
      assert.equal(await dom(`Boolean(globalThis[Symbol.for('brown.agent-browser-page.v1')])`), false,
        'Isolated-world element references must not be accessible to website scripts');
      assert.deepEqual(await dom('({width:innerWidth,height:innerHeight})'), { width: 800, height: 600 });
      await until(() => dom("document.visibilityState === 'visible'"), 'initial native page becomes visible');
      assert.equal(await dom('document.visibilityState'), 'visible');
    });

    await test('observe and extract redact values and cross-origin frame content', async () => {
      const observation = await observe();
      assert.match(observation.text, /Public readable evidence from the main document/);
      assert.match(observation.note, /frames.*cross-origin.*unsupported/i);
      assert.equal(await dom('fixtureState.frameOrigin'), 'null', 'Sandboxed iframe must have an opaque origin');
      assert.equal(await dom("document.getElementById('frame').contentDocument === null"), true);
      for (const secret of secrets) assert.ok(!JSON.stringify(observation).includes(secret), `Observation leaked ${secret}`);
      for (const element of observation.elements) assert.ok(!Object.hasOwn(element, 'value'), 'Field values must be omitted');
      assert.equal(observation.elements.find(element => element.label === 'Password').sensitive, true);
      assert.ok(!observation.elements.some(element => element.label === 'Frame-only action'));
      const link = observation.elements.find(element => element.label === 'Fixture next page');
      assert.equal(link.href, 'https://example.com/next?topic=fixture');
      const extracted = success(await action('extract', { observationId: observation.observationId }), 'extract');
      for (const secret of secrets) assert.ok(!JSON.stringify(extracted).includes(secret), `Extract leaked ${secret}`);
      const eventsBefore = events.length;
      const blocked = await action('type', { ...ref(await observe(), 'Password'), text: 'Do not insert' });
      rejected(blocked, 'password input', /sensitive|takeover/i);
      assert.equal((await snapshot()).password, secrets[1]);
      assert.ok(!events.slice(eventsBefore).some(event => event.type === 'state' && event.state.approval),
        'Sensitive input must be blocked, not offered for agent approval');
    });

    await test('approved click changes the actual DOM exactly once', async () => {
      const result = success(await approvedAction('click', ref(await observe(), 'Increment counter')), 'click');
      await until(async () => (await snapshot()).clicks === 1, 'native click delivered');
      assert.equal((await snapshot()).clicks, 1);
      assert.ok(result.observationId);
      const statuses = actionEvents.filter(event => event.runId === browser.run.id && event.action === 'click').map(event => event.status);
      assert.deepEqual(statuses, ['planned', 'running', 'succeeded']);
    });

    await test('approved type replaces text without submitting', async () => {
      success(await approvedAction('type', { ...ref(await observe(), 'Draft text'), text: 'Replacement draft' }), 'type');
      await until(async () => (await snapshot()).draft === 'Replacement draft', 'replacement input text');
      const state = await snapshot();
      assert.equal(state.draft, 'Replacement draft');
      assert.ok(state.inputEvents >= 1, 'Website must receive an input event');
      assert.equal(state.clicks, 0);
      assert.ok(!state.keys.includes('Enter'), 'Type must not submit implicitly');
      assert.ok(!(await observe()).text.includes('Replacement draft'), 'Typed values must remain private');
    });

    await test('approved select changes native selection and emits input/change', async () => {
      success(await approvedAction('select', { ...ref(await observe(), 'Color'), value: 'blue' }), 'select');
      const state = await snapshot();
      assert.equal(state.color, 'blue');
      assert.equal(state.selectInput, 1);
      assert.equal(state.selectChange, 1);
    });

    await test('approved key reaches the identified editable element', async () => {
      success(await approvedAction('key', { ...ref(await observe(), 'Draft text'), key: 'ArrowDown' }), 'key');
      await until(async () => (await snapshot()).keys.includes('ArrowDown'), 'native ArrowDown received');
      assert.equal(await dom('document.activeElement.id'), 'draft');
      assert.equal((await snapshot()).draft, secrets[0]);
    });

    await test('approved Enter submits the focused form once', async () => {
      success(await approvedAction('key', { ...ref(await observe(), 'Draft text'), key: 'Enter' }), 'Enter');
      await until(async () => (await snapshot()).submits === 1, 'native Enter submits the form');
      assert.equal((await snapshot()).submits, 1);
    });

    await test('focus diversion cannot receive agent text', async () => {
      await dom("document.getElementById('draft').addEventListener('focus', () => document.getElementById('password').focus())");
      rejected(await approvedAction('type', { ...ref(await observe(), 'Draft text'), text: 'No redirected input' }), 'diverted focus', /focus/i);
      const state = await snapshot();
      assert.equal(state.password, secrets[1]);
      assert.equal(state.draft, secrets[0]);
    });

    await test('stale observation cannot click a reused element id', async () => {
      const stale = ref(await observe(), 'Increment counter');
      await observe();
      rejected(await action('click', stale), 'old observation', /stale/i);
      assert.equal((await snapshot()).clicks, 0);
      assert.equal(browser.approval, null);
    });

    await test('detached target cannot be replaced behind the same DOM id', async () => {
      const target = ref(await observe(), 'Replaceable target');
      await dom(`(() => { const old = document.getElementById('replaceable');
        const replacement = old.cloneNode(true); replacement.addEventListener('click', () => fixtureState.replaced++);
        old.replaceWith(replacement); })()`);
      rejected(await action('click', target), 'detached target');
      assert.equal((await snapshot()).replaced, 0);
      assert.equal(browser.approval, null);
    });

    await test('covered target is rejected before requesting approval', async () => {
      const target = ref(await observe(), 'Coverable target');
      await dom(`(() => { const cover = document.createElement('div'); cover.id = 'cover';
        cover.textContent = 'Test overlay'; document.body.appendChild(cover); })()`);
      rejected(await action('click', target), 'covered target');
      assert.equal((await snapshot()).covered, 0);
      assert.equal(browser.approval, null);
    });

    await test('target is revalidated after approval while an overlay appears', async () => {
      const target = ref(await observe(), 'Coverable target');
      const { work, approval } = await holdApproval(() => action('click', target));
      await dom(`(() => { const cover = document.createElement('div'); cover.id = 'cover';
        document.body.appendChild(cover); })()`);
      await browser.command({ command: 'approve', id: approval.id, approved: true });
      rejected(await work, 'covered during approval');
      assert.equal((await snapshot()).covered, 0);
    });

    for (const direction of ['down', 'up']) {
      await test(`scroll ${direction} moves actual document in the requested direction`, async () => {
        await until(() => dom("document.visibilityState === 'visible'"), 'scroll fixture visible');
        await dom('scrollTo(0, 1100)');
        await until(() => dom('scrollY === 1100'), 'initial scroll position');
        // Commit the fixture's initial scroll before injecting native wheel input.
        await dom('new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve(true))))');
        const before = await dom('scrollY');
        success(await action('scroll', { direction, pixels: 350 }), `scroll ${direction}`);
        let after = before;
        await until(async () => { after = await dom('scrollY'); return after !== before; }, 'native wheel changes scroll position');
        assert.ok(direction === 'down' ? after > before : after < before,
          `Requested ${direction} 350px; actual scrollY ${before} -> ${after}`);
      });
    }

    for (const [name, label, args] of [
      ['click', 'Increment counter', {}], ['type', 'Draft text', { text: 'MUST NOT APPEAR' }],
      ['select', 'Color', { value: 'blue' }], ['key', 'Draft text', { key: 'Enter' }]
    ]) {
      // Denial may stop the entire run, so never retry within it.
      await test(`denied ${name} produces no page side effects`, async () => {
        const target = ref(await observe(), label);
        const before = await snapshot();
        const requestCount = requests.length;
        rejected(await approvedAction(name, { ...target, ...args }, false), `denied ${name}`, /not approve|denied|stopped/i);
        // A round-trip after tool completion checks the real renderer's state.
        assert.deepEqual(await snapshot(), before, `Denied ${name} mutated the page`);
        assert.equal(requests.length, requestCount, `Denied ${name} issued a request`);
        assert.equal(browser.approval, null);
        if (browser.state().mode === 'stopped') assert.equal(runController.signal.aborted, true);
      });
    }

    await test('stop cancels an action waiting for approval', async () => {
      const target = ref(await observe(), 'Increment counter');
      const before = await snapshot();
      const { work, approval } = await holdApproval(() => action('click', target));
      await browser.command({ command: 'stop' });
      rejected(await timeout(work, 'stopped approval action', 2000), 'stopped pending click', /stopped/i);
      assert.equal(runController.signal.aborted, true);
      assert.equal(browser.state().mode, 'stopped');
      assert.equal(browser.approval, null);
      assert.deepEqual(await snapshot(), before);
      await assert.rejects(browser.command({ command: 'approve', id: approval.id, approved: true }), /expired/i);
    });

    await test('stop cancels an in-flight fixture navigation', async () => {
      const work = action('open', { url: 'https://example.com/slow' });
      await until(() => slowResponses.size === 1, 'controlled navigation reached pending response');
      await browser.command({ command: 'stop' });
      rejected(await timeout(work, 'stopped navigation', 2000), 'stopped navigation', /stopped/i);
      assert.equal(runController.signal.aborted, true);
      assert.equal(browser.state().mode, 'stopped');
    });

    await test('pause gates queued observation until resume', async () => {
      await browser.command({ command: 'pause' });
      assert.equal(browser.state().mode, 'paused');
      assert.equal(browser.observationId, null);
      const eventCount = actionEvents.length;
      let settled = false;
      const work = action('observe').finally(() => { settled = true; });
      await until(() => browser.waiters.size > 0, 'tool blocked at pause gate');
      await snapshot();
      assert.equal(settled, false);
      assert.equal(actionEvents.length, eventCount, 'Paused tool must not dispatch any action');
      await browser.command({ command: 'resume' });
      success(await work, 'resumed observation');
      assert.equal(browser.state().mode, 'running');
      assert.equal(await dom('document.visibilityState'), 'visible');
    });

    await test('takeover permits manual input and invalidates queued agent targets', async () => {
      const oldTarget = ref(await observe(), 'Increment counter');
      await browser.command({ command: 'takeover' });
      assert.equal(browser.state().mode, 'manual');
      assert.equal(browser.observationId, null);
      const blocked = action('click', oldTarget);
      await until(() => browser.waiters.size > 0, 'agent blocked during takeover');
      // Simulate the user's native mouse, not an agent tool or DOM click().
      const point = await dom(`(() => { const r = document.getElementById('increment').getBoundingClientRect();
        return { x:Math.round(r.x+r.width/2), y:Math.round(r.y+r.height/2) }; })()`);
      const wc = browser.view.webContents;
      wc.sendInputEvent({ type: 'mouseDown', ...point, button: 'left', clickCount: 1 });
      wc.sendInputEvent({ type: 'mouseUp', ...point, button: 'left', clickCount: 1 });
      await until(async () => (await snapshot()).clicks === 1, 'manual native click');
      assert.equal(browser.approval, null, 'Manual input must not request agent approval');
      await browser.command({ command: 'resume' });
      rejected(await blocked, 'pre-takeover reference', /stale/i);
      assert.equal((await snapshot()).clicks, 1);
      success(await approvedAction('click', ref(await observe(), 'Increment counter')), 'fresh resumed click');
      await until(async () => (await snapshot()).clicks === 2, 'resumed agent click');
    });

    await test('old-run tool closures cannot operate on a new run', async () => {
      const oldRun = browser.run;
      const oldTools = browser.toolset().tools;
      browser.endRun(oldRun.id);
      assert.equal(oldRun.signal.aborted, false, 'Exercise identity protection, not merely an aborted signal');
      await freshRun();
      const activeRun = browser.run;
      const fresh = await observe();
      const before = await snapshot();
      const requestCount = requests.length;
      const observationId = browser.observationId;
      const count = activeRun.count;
      for (const [name, args] of [
        ['browser_click', ref(fresh, 'Increment counter')],
        ['browser_open', { url: 'https://example.com/next' }], ['browser_observe', {}]
      ]) {
        rejected(await track(oldTools[name].execute(args)), `old ${name} closure`, /stopped/i);
      }
      browser.endRun(oldRun.id);
      assert.equal(browser.run, activeRun, 'Late endRun must not end the new run');
      assert.equal(activeRun.signal.aborted, false);
      assert.equal(activeRun.count, count);
      assert.equal(browser.observationId, observationId);
      assert.equal(requests.length, requestCount);
      assert.equal(browser.approval, null);
      assert.deepEqual(await snapshot(), before);
      success(await approvedAction('click', ref(fresh, 'Increment counter')), 'new run still works');
      await until(async () => (await snapshot()).clicks === 1, 'new-run click');
    });

    for (const approved of [false, true]) {
      await test(`${approved ? 'approved' : 'denied'} download respects the save decision`, async () => {
        const saveDialog = electron.dialog.showSaveDialog;
        const filePath = path.join(profile, 'approved-download.txt');
        let saves = 0;
        let completed;
        const completion = new Promise(resolve => { completed = resolve; });
        const downloaded = (event, item) => {
          if (!event.defaultPrevented) item.once('done', (_event, state) => completed(state));
        };
        electron.dialog.showSaveDialog = async () => { saves++; return { canceled: false, filePath }; };
        isolatedSession.on('will-download', downloaded);
        const approvalEvent = nextEvent(event => event.type === 'state' && event.state.approval, 'download approval');
        try {
          browser.view.webContents.downloadURL('https://example.com/download');
          const event = await approvalEvent.promise;
          assert.match(event.state.approval.title, /Download this file/i);
          assert.equal(saves, 0);
          await browser.command({ command: 'approve', id: event.state.approval.id, approved });
          if (approved) {
            assert.equal(await timeout(completion, 'approved file download'), 'completed');
            assert.equal(fs.readFileSync(filePath, 'utf8'), 'Approved fixture download');
            assert.equal(saves, 1);
          } else {
            await snapshot();
            assert.equal(saves, 0);
            assert.equal(fs.existsSync(filePath), false);
          }
        } finally {
          approvalEvent.cancel();
          isolatedSession.removeListener('will-download', downloaded);
          electron.dialog.showSaveDialog = saveDialog;
        }
      });
    }

    await test('remote-provider consent denial prevents page observation', async () => {
      // Denial must protect the already-open fixture without contacting any provider.
      runController = new AbortController();
      const id = `remote-denial-${randomUUID()}`;
      const requestCount = requests.length;
      const { work, approval } = await holdApproval(() => browser.beginRun({ id,
        controller: runController, onEvent: event => actionEvents.push(event), remote: true })
        .then(() => ({ started: true }), error => ({ error })));
      assert.match(approval.title, /share page content.*model/i);
      assert.match(approval.detail, /remote|cloud/i);
      assert.equal(browser.observationId, null);
      const blocked = action('observe');
      await until(() => browser.waiters.size > 0, 'observation gated behind remote consent');
      await browser.command({ command: 'approve', id: approval.id, approved: false });
      const outcome = await work;
      assert.ok(outcome.error instanceof Error, 'Remote run must reject consent denial');
      assert.match(outcome.error.message, /sharing was not approved/i);
      rejected(await blocked, 'observe after remote denial', /stopped/i);
      assert.equal(runController.signal.aborted, true);
      assert.equal(browser.state().mode, 'stopped');
      assert.equal(browser.observationId, null);
      assert.equal(browser.run.count, 0);
      assert.equal(requests.length, requestCount);
      assert.ok(!actionEvents.some(event => event.runId === id && ['running', 'succeeded'].includes(event.status)));
    }, { open: false });
  } catch (error) {
    failed++;
    console.error('INFRASTRUCTURE FAILURE:', error.stack || error);
  } finally {
    shuttingDown = true;
    for (const release of slowResponses) release();
    try {
      await finishRun();
      if (isolatedSession) isolatedSession.protocol.unhandle('https');
      browser?.dispose();
      if (isolatedSession) await isolatedSession.closeAllConnections();
      if (owner && !owner.isDestroyed()) owner.destroy();
      ipcMain.removeListener('agent-browser-integration:event', receive);
      assert.ok(!owner || owner.isDestroyed(), 'Test owner window must be destroyed');
    } catch (error) {
      failed++;
      console.error('CLEANUP FAILURE:', error.stack || error);
    }
    console.log(`RESULT ${passed} passed, ${failed} failed; ${Date.now() - startedAt}ms; ${requests.length} intercepted requests`);
    // Windows holds Chromium cache files until exit; remove only this profile afterward.
    const cleaner = require('node:child_process').spawn(process.execPath, ['-e', `
      const fs = require('node:fs');
      const directory = process.argv[1], parent = Number(process.argv[2]);
      const deadline = Date.now() + 30000;
      function cleanAfterExit() {
        let alive = false;
        try { process.kill(parent, 0); alive = true; } catch (_) {}
        if (alive && Date.now() < deadline) return setTimeout(cleanAfterExit, 50);
        if (alive) { console.error('CLEANUP parent did not exit:', parent); process.exitCode = 1; return; }
        try {
          fs.rmSync(directory, { recursive:true, force:true, maxRetries:50, retryDelay:100 });
          console.log('CLEANUP removed ' + directory);
        } catch (error) { console.error('CLEANUP FAILURE:', error.message); process.exitCode = 1; }
      }
      cleanAfterExit();
    `, profile, String(process.pid)], {
      env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' }, windowsHide: true,
      detached: true, stdio: 'inherit'
    });
    await new Promise((resolve, reject) => {
      cleaner.once('spawn', resolve);
      cleaner.once('error', reject);
    });
    cleaner.unref();
    app.exit(failed ? 1 : 0);
  }
}
