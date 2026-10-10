const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const rendererPath = path.resolve(__dirname, '../src/renderer/renderer.js');
const rendererSource = fs.readFileSync(rendererPath, 'utf8');

// Explicit next-declaration delimiters preserve nested callbacks, regexes and
// template literals. Never load the renderer's application startup or copy its logic.
function evaluateSource(context, startMarker, endMarker) {
  const start = rendererSource.indexOf(`\n${startMarker}`) + 1;
  assert.ok(start > 0, `Missing renderer declaration: ${startMarker}`);
  const end = rendererSource.indexOf(`\n${endMarker}`, start);
  assert.ok(end > start, `Missing renderer delimiter: ${endMarker}`);
  new vm.Script(rendererSource.slice(start, end), {
    filename: rendererPath,
    lineOffset: rendererSource.slice(0, start).split('\n').length - 1
  }).runInContext(context);
}

// VM objects have different prototypes; compare their serialized data, not realms.
const plain = value => JSON.parse(JSON.stringify(value));

function createHarness() {
  const harness = { saves: 0, renders: [], artifacts: [], memoryReads: [], memoryArtifacts: {} };
  const context = vm.createContext({
    URL,
    console,
    currentSessionId: 'a',
    _aiSessionMetaInFlight: new Set(),
    conversationsStore: {
      a: { title: 'Session A', messages: [] },
      b: { title: 'Session B', messages: [] }
    },
    window: {
      UltronAgentMemory: {
        registerArtifact(kind, filePath, options) {
          harness.artifacts.push({ kind, path: filePath, options: plain(options) });
        },
        getSessionArtifacts(sessionId) {
          harness.memoryReads.push(sessionId);
          return harness.memoryArtifacts[sessionId] || [];
        },
        getConversationSummary: () => null
      }
    },
    saveConversationsToDisk() { harness.saves++; },
    renderSessionPanel() { harness.renders.push(context.currentSessionId); }
  });
  harness.context = context;
  evaluateSource(context, 'function updateSidebarActivity(', 'function switchSidebarTab(');
  return harness;
}

function installSidebar(harness) {
  const context = harness.context;
  const classes = new Set();
  const chatMain = { classList: {
    add: name => classes.add(name),
    remove: name => classes.delete(name),
    contains: name => classes.has(name)
  } };
  const scroller = { scrollTop: 0 };
  const content = {
    innerHTML: '',
    parentElement: { scrollTop: 17 },
    contains: () => false,
    querySelector: selector => selector === '.session-side-sections' ? scroller : null
  };
  const checklist = {
    children: [],
    set innerHTML(value) { this.children = []; },
    appendChild(node) { this.children.push(node); }
  };
  // The rail starts collapsed in the markup, so the stub body carries that class too.
  const railClasses = new Set(['session-rail-collapsed']);
  const railBody = { classList: {
    add: name => railClasses.add(name),
    remove: name => railClasses.delete(name),
    contains: name => railClasses.has(name),
    toggle: (name, on) => {
      const next = on === undefined ? !railClasses.has(name) : Boolean(on);
      if (next) railClasses.add(name); else railClasses.delete(name);
      return next;
    }
  } };
  Object.assign(context, {
    document: {
      activeElement: null,
      body: railBody,
      getElementById: id => id === 'session-panel-content' ? content : null,
      querySelector: selector => selector === '.chat-main' ? chatMain : null,
      createElement: () => ({ className: '', textContent: '', innerHTML: '' })
    },
    chatMessagesContainer: { innerHTML: '', querySelectorAll: () => [] },
    taskChecklistContainer: checklist,
    activeChatTitle: { textContent: '' },
    activeSubgoals: [],
    isAwaitingResponse: false
  });
  Object.assign(harness, { content, checklist, chatMain, railBody });
  evaluateSource(context, 'function escapeHtml(', 'function getWebSearchCardHtml(');
  evaluateSource(context, 'function formatSideWhen(', 'function renderSessionPanel(');
  evaluateSource(context, 'function renderSessionPanel(', '// Delegated handlers: sidebar tabs + session item actions');
}

function installSessionLifecycle(harness) {
  installSidebar(harness);
  const context = harness.context;
  harness.logs = [];
  harness.welcomes = 0;
  Object.assign(context, {
    setSendingState(value) { context.isAwaitingResponse = value; },
    updateWelcomeGreeting() { harness.welcomes++; },
    logTrace(message) { harness.logs.push(message); },
    // Prompt/workspace globals the lifecycle calls but the rail does not own: stub so
    // loadSession/triggerNewChat reach completion instead of throwing before the try.
    _mentionChips: [],
    renderMentionChips() {},
    clearPromptTurnState() {}
  });
  evaluateSource(context, 'function expandRightSidebarSection(', 'function ensureRightSidebarVisible(');
  evaluateSource(context, 'function renderChecklist(', 'function appendChatMessage(');
  evaluateSource(context, 'async function loadSession(', 'function showConfirmDialog(');
  evaluateSource(context, 'const triggerNewChat =', 'if (btnNewChat)');
}

function sectionHtml(html, key) {
  const match = html.match(new RegExp(`<section\\b[^>]*data-side-section="${key}"[^>]*>[\\s\\S]*?</section>`));
  assert.ok(match, `Missing sidebar section: ${key}`);
  return match[0];
}

// The right-hand rail was renamed: sideSectionHtml derives each data-side-section
// key from the visible title, so the current titles/keys must stay in lockstep.
const sidebarSections = [
  ['Tasks', 'tasks'],
  ['Tools', 'tools'],
  ['Output', 'output'],
  ['Pages', 'pages'],
  ['Sources', 'sources']
];

function assertSectionCollapsed(html, key, collapsed) {
  const section = sectionHtml(html, key);
  assert.match(section, new RegExp(`^<section class="side-section${collapsed ? ' collapsed' : ''}(?: expanded)?"`), key);
  assert.ok(section.includes(`class="side-section-head" aria-expanded="${!collapsed}"`), `${key}: header expansion state`);
  return section;
}

function testActivityUpsertAndSessionScope() {
  const h = createHarness();
  const c = h.context;
  c.updateSidebarActivity('a', 'tools', [{ id: 'run:1', name: 'read_file', server: 'filesystem', status: 'running' }]);
  c.updateSidebarActivity('a', 'tools', [{ id: 'run:1', status: 'completed' }]);
  assert.deepEqual(plain(c.conversationsStore.a.activity.tools), [
    { id: 'run:1', name: 'read_file', server: 'filesystem', status: 'completed' }
  ], 'Status-only upserts must retain tool metadata without duplicating the row');
  c.updateSidebarActivity('a', 'skills', [{ id: 'skill:1', name: 'Research' }]);
  assert.equal(c.conversationsStore.a.activity.tools.length, 1, 'Activity collections must remain independent');
  assert.deepEqual(h.renders, ['a', 'a', 'a']);

  const before = plain(c.conversationsStore.a);
  c.updateSidebarActivity('b', 'tools', [{ id: 'run:1', name: 'write_file', status: 'running' }]);
  assert.deepEqual(plain(c.conversationsStore.a), before);
  assert.equal(c.conversationsStore.b.activity.tools[0].name, 'write_file');
  assert.equal(h.saves, 4, 'Inactive sessions must still be persisted');
  assert.deepEqual(h.renders, ['a', 'a', 'a'], 'Inactive session updates must not repaint the active UI');
  c.currentSessionId = 'b';
  c.updateSidebarActivity('b', 'tools', [{ id: 'run:1', status: 'completed' }]);
  assert.deepEqual(h.renders, ['a', 'a', 'a', 'b']);
}

function testActivityBoundsAndMissingSessions() {
  const h = createHarness();
  const c = h.context;
  c.updateSidebarActivity('a', 'tools', Array.from({ length: 65 }, (_, i) => ({ id: `tool:${i}`, name: `Tool ${i}` })));
  assert.deepEqual(plain(c.conversationsStore.a.activity.tools).map(item => item.id),
    Array.from({ length: 60 }, (_, i) => `tool:${i + 5}`), 'Keep only the latest 60 entries');
  c.updateSidebarActivity('a', 'tools', [{ id: 'tool:64', status: 'completed' }]);
  assert.equal(c.conversationsStore.a.activity.tools.length, 60);
  assert.equal(c.conversationsStore.a.activity.tools[59].name, 'Tool 64');
  c.updateSidebarActivity('a', 'tools', [{ id: 'tool:65', name: 'Tool 65' }]);
  assert.equal(c.conversationsStore.a.activity.tools.length, 60);
  assert.equal(c.conversationsStore.a.activity.tools[0].id, 'tool:6');

  c.conversationsStore.deleted = { messages: [] };
  delete c.conversationsStore.deleted;
  const before = plain(c.conversationsStore);
  const saves = h.saves;
  const renders = h.renders.length;
  for (const id of [null, undefined, '', 'missing', 'deleted']) {
    c.currentSessionId = id;
    c.updateSidebarActivity(id, 'tools', [{ id: 'late', status: 'completed' }]);
  }
  assert.deepEqual(plain(c.conversationsStore), before, 'Late updates must not recreate missing/deleted sessions');
  assert.equal(h.saves, saves);
  assert.equal(h.renders.length, renders);
}

function testWebValidationAndReadPersistence() {
  const h = createHarness();
  const c = h.context;
  const invalid = ['javascript:alert(1)', 'file:///C:/private.txt', 'data:text/html,test', 'ftp://example.com/',
    'not a url', '/relative', 'https://', 'http://[broken', 'https://bad host.test/'];
  c.recordSidebarWeb('a', [...invalid.map(url => ({ url })), {}, null]);
  assert.equal(c.conversationsStore.a.activity, undefined);
  assert.equal(h.saves, 0, 'Rejected URLs must not persist or repaint');
  assert.deepEqual(h.renders, []);

  c.recordSidebarWeb('a', [{ url: 'HTTPS://EXAMPLE.COM:443/docs', title: 'Docs' }, { url: 'http://plain.example' }]);
  assert.deepEqual(plain(c.conversationsStore.a.activity.web).map(({ id, url, title, read }) => ({ id, url, title, read })), [
    { id: 'https://example.com/docs', url: 'https://example.com/docs', title: 'Docs', read: false },
    { id: 'http://plain.example/', url: 'http://plain.example/', title: 'plain.example', read: false }
  ]);
  c.recordSidebarWeb('a', [{ url: 'https://example.com/docs', title: 'Read docs' }], true);
  c.recordSidebarWeb('a', [{ url: 'https://example.com/docs', title: 'Found again' }], false);
  assert.equal(c.conversationsStore.a.activity.web.length, 2);
  assert.equal(c.conversationsStore.a.activity.web[0].read, true, 'Finding a previously read page must not downgrade it');
  c.recordSidebarWeb('a', [{ url: 'https://extracted.example/', pageContent: 'Actual page text' }]);
  assert.equal(c.conversationsStore.a.activity.web[2].read, true, 'Extracted page content counts as read');

  const a = plain(c.conversationsStore.a.activity.web);
  const renders = h.renders.length;
  c.recordSidebarWeb('b', [{ url: 'https://example.com/docs', title: 'B result' }]);
  assert.equal(c.conversationsStore.b.activity.web[0].read, false, 'Read state must not leak across sessions for the same URL');
  assert.equal(c.conversationsStore.b.activity.web[0].title, 'B result');
  assert.deepEqual(plain(c.conversationsStore.a.activity.web), a);
  assert.equal(h.renders.length, renders);
  const saves = h.saves;
  c.recordSidebarWeb('deleted', [{ url: 'https://example.com/' }], true);
  assert.equal(c.conversationsStore.deleted, undefined);
  assert.equal(h.saves, saves);
}

function testTrackerCapturesSessionAndArtifactOwnership() {
  const h = createHarness();
  const c = h.context;
  const tracker = c.createSidebarToolTracker('a', 'run-a');
  tracker.onToolCall({ toolCallId: 'read', toolName: 'system__read_file', args: { filePath: 'C:/work/input.txt' } });
  c.currentSessionId = 'b';
  tracker.onToolCall({ toolCallId: 'write', toolName: 'mcp__writer', originalName: 'write_file', serverId: 'filesystem', args: { path: 'C:/work/output.txt' } });
  const other = c.createSidebarToolTracker('b', 'run-b');
  other.onToolCall({ toolCallId: 'read', toolName: 'other_tool', args: {} });
  const renders = h.renders.length;
  // Destructured callbacks mirror the asynchronous harness subscription API.
  const { onToolResult } = tracker;
  onToolResult({ toolCallId: 'write', result: { success: true } });
  onToolResult({ toolCallId: 'read', result: { success: true, content: 'input text' } });
  assert.equal(h.renders.length, renders, 'Finishing A while B is active must not repaint B');
  assert.deepEqual(plain(c.conversationsStore.a.activity.tools), [
    { id: 'run-a:read', name: 'system__read_file', server: '', status: 'completed' },
    { id: 'run-a:write', name: 'write_file', server: 'filesystem', status: 'completed' }
  ]);
  assert.equal(c.conversationsStore.b.activity.tools[0].status, 'running', 'Identical call IDs in another tracker must stay isolated');
  assert.deepEqual(h.artifacts, [
    { kind: 'file', path: 'C:/work/output.txt', options: { sessionId: 'a', source: 'WRITE_FILE' } },
    { kind: 'file', path: 'C:/work/input.txt', options: { sessionId: 'a', source: 'READ_FILE' } }
  ]);
  other.onToolResult({ toolCallId: 'read', result: { success: true } });
  assert.equal(c.conversationsStore.b.activity.tools[0].status, 'completed');
}

function testTrackerFileAliasesAndFailures() {
  const h = createHarness();
  const c = h.context;
  const tracker = c.createSidebarToolTracker('a', 'files');
  const cases = [
    ['read_file', { file_path: 'C:/work/read.txt' }, 'file', 'READ_FILE'],
    ['edit_file', { path: 'C:/work/edit.txt' }, 'file', 'WRITE_FILE'],
    ['list_directory', { path: 'C:/work' }, 'folder', 'READ_FILE'],
    ['system__list_dir', { dirPath: 'C:/other' }, 'folder', 'READ_FILE'],
    ['create_directory', { path: 'C:/new' }, 'folder', 'WRITE_FILE']
  ];
  cases.forEach(([toolName, args, kind, source], index) => {
    tracker.onToolCall({ toolCallId: String(index), toolName, args });
    tracker.onToolResult({ toolCallId: String(index), result: { success: true } });
    assert.deepEqual(h.artifacts[index], { kind, path: Object.values(args)[0], options: { sessionId: 'a', source } });
  });
  const artifacts = plain(h.artifacts);
  const failures = [{ success: false }, { error: 'permission denied' }, { isError: true }];
  for (const [index, failure] of failures.entries()) {
    for (const name of ['read_file', 'write_file', 'browser_observe', 'fetch']) {
      const toolCallId = `failed-${index}-${name}`;
      tracker.onToolCall({ toolCallId, originalName: name, serverId: 'test-server', args: { path: 'C:/must-not-record.txt', url: 'https://not-read.example/' } });
      tracker.onToolResult({ toolCallId, result: {
        ...failure, url: 'https://not-read.example/', sourceUrl: 'https://not-found.example/',
        results: [{ url: 'https://not-a-result.example/', pageContent: 'Partial output' }]
      } });
      const row = c.conversationsStore.a.activity.tools.find(item => item.id === `files:${toolCallId}`);
      assert.equal(row.status, 'failed');
      assert.equal(row.name, name);
      assert.equal(row.server, 'test-server');
    }
  }
  assert.deepEqual(h.artifacts, artifacts, 'Failed read/write tools must not register artifacts');
  assert.equal(c.conversationsStore.a.activity.web, undefined, 'Failed results must not record URLs, even with partial output');
  const before = plain(c.conversationsStore);
  const saves = h.saves;
  const renders = h.renders.length;
  tracker.onToolResult({ toolCallId: 'unknown', result: { success: true, url: 'https://ignored.example/' } });
  assert.deepEqual(plain(c.conversationsStore), before);
  assert.equal(h.saves, saves);
  assert.equal(h.renders.length, renders);
  assert.deepEqual(h.artifacts, artifacts);
}

function testBrowserReadingVersusNativeSearch() {
  const h = createHarness();
  const c = h.context;
  const tracker = c.createSidebarToolTracker('a', 'web');
  const calls = [
    ['observe', 'browser_observe', {}, { url: 'https://read.example/', title: 'Observed page' }],
    ['extract', 'browser_extract', {}, { url: 'https://extracted.example/', title: 'Extracted page' }],
    ['fetch', 'fetch', { url: 'https://fetched.example/' }, { content: 'Fetched body' }],
    ['search', 'web_search', {}, { query: 'Native search', sourceUrl: 'https://native.example/', results: [{ url: 'https://found.example/', title: 'Found result' }] }]
  ];
  calls.forEach(([toolCallId, originalName, args]) => tracker.onToolCall({ toolCallId, originalName, toolName: `system__${originalName}`, args }));
  c.currentSessionId = 'b';
  const renders = h.renders.length;
  calls.forEach(([toolCallId, , , result]) => tracker.onToolResult({ toolCallId, result: { success: true, ...result } }));
  assert.deepEqual(plain(c.conversationsStore.a.activity.web).map(({ url, read }) => ({ url, read })), [
    { url: 'https://read.example/', read: true },
    { url: 'https://extracted.example/', read: true },
    { url: 'https://fetched.example/', read: true },
    { url: 'https://native.example/', read: false },
    { url: 'https://found.example/', read: false }
  ]);
  assert.equal(c.conversationsStore.b.activity, undefined);
  assert.equal(h.renders.length, renders);

  installSidebar(h);
  c.currentSessionId = 'a';
  c.renderSessionPanel();
  const reading = sectionHtml(h.content.innerHTML, 'pages');
  const sources = sectionHtml(h.content.innerHTML, 'sources');
  assert.match(reading, /Observed page/);
  assert.match(reading, /Extracted page/);
  assert.doesNotMatch(reading, /Native search|Found result/);
  assert.match(sources, /Native search/);
  assert.match(sources, /Found result/);
  assert.match(sources, /side-row-sub">Found</);
  assert.match(sources, /side-row-sub">Read</);

  // Rail visibility: content opens the default-closed rail, a hand-collapse survives later
  // renders, and switching to an empty session closes it again.
  assert.ok(!h.railBody.classList.contains('session-rail-collapsed'), 'Content opens the closed rail.');
  c.chooseSessionRail(true);
  c.renderSessionPanel();
  assert.ok(h.railBody.classList.contains('session-rail-collapsed'), 'A manual collapse is never undone by new content.');
  c.currentSessionId = 'b';
  c.renderSessionPanel();
  assert.ok(h.railBody.classList.contains('session-rail-collapsed'), 'An empty session keeps the rail closed.');
  c.chooseSessionRail(false);
  assert.ok(!h.railBody.classList.contains('session-rail-collapsed'), 'An explicit open wins over the empty session.');
}

function testSkillToolAndArtifactSourceDistinctions() {
  const h = createHarness();
  const c = h.context;
  c.window.UltronAgentSkills = {
    findSkillsForPrompt: () => [{ id: 'research-skill', name: 'Research' }],
    buildSkillsPromptSection: () => 'Research instructions'
  };
  c.isReminderOrTimerRequest = () => false;
  evaluateSource(c, 'function getAgentRuntimeSettings(', 'function persistTaskMemory(');
  assert.equal(c.buildAgentSkillsSnippet('Research this topic'), 'Research instructions');
  const tracker = c.createSidebarToolTracker('a', 'capabilities');
  for (const [toolCallId, name, serverId] of [['mcp', 'Research', 'research-server'], ['native', 'Local tool', '']]) {
    tracker.onToolCall({ toolCallId, originalName: name, serverId, args: {} });
    tracker.onToolResult({ toolCallId, result: { success: true } });
  }
  assert.deepEqual(plain(c.conversationsStore.a.activity.skills), [{ id: 'research-skill', name: 'Research' }]);
  assert.equal(c.conversationsStore.a.activity.tools.length, 2);
  h.memoryArtifacts.a = [
    { path: 'C:/input.txt', name: 'input.txt', source: 'READ_FILE' },
    { path: 'C:/output.txt', name: 'output.txt', source: 'WRITE_FILE' }
  ];
  installSidebar(h);
  c.renderSessionPanel();
  const capabilities = sectionHtml(h.content.innerHTML, 'tools');
  assert.equal((capabilities.match(/side-row-name">Research</g) || []).length, 2, 'A skill and tool with the same name are distinct');
  for (const label of ['Skill', 'MCP', 'Tool']) assert.ok(capabilities.includes(`side-row-sub">${label}</span>`), label);
  const sources = sectionHtml(h.content.innerHTML, 'sources');
  const outputs = sectionHtml(h.content.innerHTML, 'output');
  assert.match(sources, /input\.txt/);
  assert.doesNotMatch(sources, /output\.txt/);
  assert.match(outputs, /output\.txt/);
  assert.doesNotMatch(outputs, /input\.txt/);
}

function testSectionStateAcrossRenders() {
  const h = createHarness();
  installSidebar(h);
  const c = h.context;
  const states = vm.runInContext('sidebarSectionStates', c);
  const items = Array.from({ length: 7 }, (_, i) => ({ name: `Item ${i}` }));
  // The rail dropped the caller-supplied collapse default: sideSectionHtml always
  // starts minimized and only the per-session saved state can expand a section.
  const render = () => c.sideSectionHtml('Toolbox', items,
    (item, overflow) => c.sideRowHtml({ icon: '', name: item.name, overflow }));
  const initial = render();
  assert.match(initial, /class="side-section-head" aria-expanded="false"/);
  assert.match(initial, /aria-controls="side-body-toolbox"/);
  assert.match(initial, /id="side-body-toolbox"/);
  assert.match(initial, /class="side-see-all" aria-expanded="false"/);
  assert.equal((initial.match(/side-row-overflow/g) || []).length, 2);
  for (const collapsed of [true, false]) {
    for (const expanded of [true, false]) {
      states.set('a:toolbox', { collapsed, expanded });
      const html = render(); // Saved state, not a caller default, drives the rail.
      assert.ok(html.includes(`class="side-section-head" aria-expanded="${!collapsed}"`));
      assert.ok(html.includes(`class="side-see-all" aria-expanded="${expanded}"`));
      assert.ok(html.includes(expanded ? 'Show less' : 'See all (7)'));
      assert.ok(html.includes(`class="side-section${collapsed ? ' collapsed' : ''}${expanded ? ' expanded' : ''}"`));
      assert.equal(render(), html, 'Rerendering must not reset ARIA or expansion state');
    }
  }
  states.set('a:toolbox', { collapsed: true, expanded: true });
  const saved = render();
  c.currentSessionId = 'b';
  assert.equal(render(), initial, 'Section preferences are scoped to a session');
  c.currentSessionId = 'a';
  assert.equal(render(), saved, 'Returning to a session restores its state');
  const empty = c.sideSectionHtml('Action plan', [], () => assert.fail('No rows expected'), { empty: 'No tasks' });
  assert.match(empty, /class="side-section-head" aria-expanded="false"/);
  assert.match(empty, /No tasks/);
  assert.doesNotMatch(empty, /side-see-all/);
}

function testSectionDefaultsWithoutCollapsedOption() {
  const h = createHarness();
  installSidebar(h);
  const c = h.context;
  for (const items of [[], [{ name: 'A tool' }]]) {
    const buildRow = item => c.sideRowHtml({ icon: '', name: item.name });
    // With no saved state and no caller option, a section renders minimized by default.
    assertSectionCollapsed(c.sideSectionHtml('Toolbox', items, buildRow), 'toolbox', true);
    assertSectionCollapsed(c.sideSectionHtml('Toolbox', items, buildRow, { empty: 'No tools' }), 'toolbox', true);
  }
}

function testRenderedSectionsDefaultCollapsed() {
  const h = createHarness();
  installSidebar(h);
  const c = h.context;
  const activity = {
    tasks: [{ text: 'Plan a response', status: 'pending' }],
    skills: [{ id: 'research', name: 'Research' }],
    tools: [{ id: 'tool', name: 'read_file', status: 'completed' }],
    uploads: [{ id: 'upload', name: 'input.txt', messageIndex: 0 }],
    web: [{ url: 'https://read.example/', title: 'Read page', read: true }]
  };
  for (const mode of ['new', 'empty', 'populated']) {
    c.currentSessionId = mode === 'new' ? null : 'a';
    if (mode === 'populated') {
      c.conversationsStore.a.activity = plain(activity);
      h.memoryArtifacts.a = [{ name: 'output.txt', path: 'C:/output.txt', source: 'WRITE_FILE' }];
    }
    c.renderSessionPanel();
    assert.equal((h.content.innerHTML.match(/data-side-section=/g) || []).length, sidebarSections.length);
    for (const [title, key] of sidebarSections) {
      const section = assertSectionCollapsed(h.content.innerHTML, key, true);
      assert.ok(section.includes(`<span class="side-section-title">${title}</span>`));
      assert.ok(section.includes(`aria-controls="side-body-${key}"`));
      assert.ok(section.includes(`id="side-body-${key}"`));
      if (mode === 'populated') {
        assert.match(section, /class="side-count-badge">[1-9]\d*</);
        assert.doesNotMatch(section, /class="side-section-empty"/);
      } else {
        assert.match(section, /class="side-section-empty"/);
        assert.doesNotMatch(section, /class="side-count-badge"/);
      }
    }
  }
  assert.deepEqual(plain(c.conversationsStore.a.activity), activity, 'Display labels must not rename persisted activity');
}

function testContextCardEmptyAndMessageCounts() {
  const h = createHarness();
  installSidebar(h);
  const c = h.context;
  c.extractPlainTextFromMessage = text => String(text);
  c.conversationsStore.a.updatedAt = '2026-01-01T12:00:00Z';
  for (const sessionId of [null, 'a']) {
    c.currentSessionId = sessionId;
    c.renderSessionPanel();
    assert.match(h.content.innerHTML, /class="session-context-kicker">[\s\S]*?<span>In focus<\/span>/);
    assert.doesNotMatch(h.content.innerHTML, /session-context-state|session-context-meta|\b(?:idle|ready)\b/i);
    const title = sessionId ? 'Session A' : 'A fresh thread';
    assert.ok(h.content.innerHTML.includes(`<h3 class="session-context-title">${title}</h3>`));
  }
  const messages = [
    { text: 'Help with a plan', isAi: false },
    { text: 'Here is a plan', isAi: true }
  ];
  for (const count of [1, 2, 0]) {
    c.conversationsStore.a.messages = messages.slice(0, count);
    c.renderSessionPanel();
    const footers = [...h.content.innerHTML.matchAll(/<div class="session-context-meta">([^<]*)<\/div>/g)].map(match => match[1]);
    assert.deepEqual(footers, count ? [count === 1 ? '1 message' : '2 messages'] : []);
    assert.doesNotMatch(h.content.innerHTML, /session-context-state|\b(?:idle|ready)\b/i);
    if (count === 2) assert.match(h.content.innerHTML, /class="session-context-summary">Here is a plan<\/p>/);
    else if (count === 1) assert.match(h.content.innerHTML, /Waiting for Brown’s answer/);
    else assert.doesNotMatch(h.content.innerHTML, /session-context-meta/);
  }
}

async function testOpenSectionsSurviveRenderingAndSessionSwitches() {
  const h = createHarness();
  installSessionLifecycle(h);
  const c = h.context;
  const states = vm.runInContext('sidebarSectionStates', c);
  c.renderSessionPanel();
  for (const [, key] of sidebarSections) states.set(`a:${key}`, { collapsed: false, expanded: false });
  c.renderSessionPanel();
  for (const [, key] of sidebarSections) assertSectionCollapsed(h.content.innerHTML, key, false);
  c.updateSidebarActivity('a', 'tasks', [{ id: 'plan', text: 'Updated plan', status: 'pending' }]);
  assert.match(sectionHtml(h.content.innerHTML, 'tasks'), /Updated plan/);
  for (const [, key] of sidebarSections) assertSectionCollapsed(h.content.innerHTML, key, false);

  await c.loadSession('b');
  assert.equal(c.currentSessionId, 'b');
  for (const [, key] of sidebarSections) assertSectionCollapsed(h.content.innerHTML, key, true);
  states.set('b:tools', { collapsed: false, expanded: false });
  c.renderSessionPanel();
  for (const [, key] of sidebarSections) assertSectionCollapsed(h.content.innerHTML, key, key !== 'tools');

  await c.loadSession('a');
  assert.equal(c.currentSessionId, 'a');
  assert.match(sectionHtml(h.content.innerHTML, 'tasks'), /Updated plan/);
  for (const [, key] of sidebarSections) assertSectionCollapsed(h.content.innerHTML, key, false);
  await c.loadSession('b');
  assert.equal(c.currentSessionId, 'b');
  for (const [, key] of sidebarSections) assertSectionCollapsed(h.content.innerHTML, key, key !== 'tools');
  assert.deepEqual(h.logs, [], 'Session switches must finish without swallowed renderer errors');
}

async function testLoadSessionKeepsPersistedTasks() {
  for (const fromDisk of [false, true]) {
    const h = createHarness();
    installSessionLifecycle(h);
    const c = h.context;
    const saved = { title: 'Saved session', messages: [], activity: {
      tasks: [{ text: 'Persisted pending', completed: false, status: 'pending' }, { text: 'Persisted done', completed: true, status: 'completed' }],
      uploads: [{ id: 'upload', name: 'saved-upload.txt', messageIndex: 0 }]
    } };
    let diskLoads = 0;
    if (fromDisk) {
      delete c.conversationsStore.b;
      c.window.ultronAPI = { loadConversations: async () => {
        diskLoads++;
        return { success: true, data: JSON.stringify({ b: saved }) };
      } };
    } else c.conversationsStore.b = plain(saved);
    c.activeSubgoals = [{ text: 'Stale transient task', completed: false }];
    c.conversationsStore.a.activity = { tasks: [{ text: 'Other session task' }] };
    const previous = plain(c.conversationsStore.a);
    await c.loadSession('b');
    assert.equal(c.currentSessionId, 'b');
    assert.equal(c.activeChatTitle.textContent, 'Saved session');
    assert.deepEqual(plain(c.conversationsStore.b), saved, 'Loading history must not rewrite persisted activity');
    assert.deepEqual(plain(c.conversationsStore.a), previous);
    assert.equal(h.saves, 0, 'Restoring a checklist must use the non-persisting path');
    assert.equal(diskLoads, fromDisk ? 1 : 0);
    assert.deepEqual(h.logs, [], 'The real loadSession must finish without a swallowed renderer error');
    const checklistHtml = h.checklist.children.map(node => node.innerHTML).join('');
    assert.match(checklistHtml, /Persisted pending/);
    assert.match(checklistHtml, /Persisted done/);
    assert.equal(h.checklist.children[1].className, 'task-node completed');
    assert.match(sectionHtml(h.content.innerHTML, 'tasks'), /Persisted pending/);
    assert.match(sectionHtml(h.content.innerHTML, 'sources'), /saved-upload\.txt/);
    assert.doesNotMatch(h.content.innerHTML, /Stale transient task|Other session task/);
  }
}

function testNewChatHasNoStaleSidebarState() {
  const h = createHarness();
  installSessionLifecycle(h);
  const c = h.context;
  c.conversationsStore.a.activity = {
    tasks: [{ text: 'Old task', status: 'running' }],
    uploads: [{ id: 'upload', name: 'old-upload.txt', messageIndex: 0 }],
    skills: [{ id: 'skill', name: 'Old skill' }],
    tools: [{ id: 'tool', name: 'Old tool', status: 'completed' }],
    web: [{ id: 'https://old.example/', url: 'https://old.example/', title: 'Old page', read: true }]
  };
  c.activeSubgoals = [{ text: 'Old transient subgoal' }];
  // Poison the former global arrays so reintroducing a transient fallback fails.
  c._sidebarTasks = [{ text: 'Legacy transient task' }];
  c._sidebarUploads = [{ name: 'legacy-transient-upload.txt' }];
  h.memoryArtifacts.a = [{ name: 'old-output.txt', path: 'C:/old-output.txt', source: 'WRITE_FILE' }];
  c.renderSessionPanel();
  assert.match(h.content.innerHTML, /Old task/);
  assert.match(h.content.innerHTML, /old-upload\.txt/);
  assert.match(h.content.innerHTML, /old-output\.txt/);
  const before = plain(c.conversationsStore);
  h.memoryReads.length = 0;
  c.chatMessagesContainer.innerHTML = 'Previous chat contents';
  c.isAwaitingResponse = true;
  vm.runInContext('triggerNewChat()', c);
  assert.equal(c.currentSessionId, null);
  assert.equal(c.activeChatTitle.textContent, 'New chat');
  assert.equal(c.chatMessagesContainer.innerHTML, '');
  assert.equal(c.isAwaitingResponse, false);
  assert.deepEqual(plain(c.activeSubgoals), []);
  assert.equal(h.chatMain.classList.contains('empty-state'), true);
  assert.equal(h.welcomes, 1);
  assert.equal(h.saves, 0, 'New chat must not clear tasks in the previous session');
  assert.deepEqual(plain(c.conversationsStore), before);
  assert.deepEqual(h.memoryReads, [], 'An unsaved new chat must not read the previous session artifacts');
  for (let render = 0; render < 2; render++) {
    assert.match(h.content.innerHTML, /<h3 class="session-context-title">A fresh thread<\/h3>/);
    assert.doesNotMatch(h.content.innerHTML, /Old task|Old skill|Old tool|Old page|old-upload|old-output|Legacy transient|legacy-transient|Old transient/);
    c.renderSessionPanel();
  }
}

async function runSessionSidebarTests() {
  const tests = [
    testActivityUpsertAndSessionScope,
    testActivityBoundsAndMissingSessions,
    testWebValidationAndReadPersistence,
    testTrackerCapturesSessionAndArtifactOwnership,
    testTrackerFileAliasesAndFailures,
    testBrowserReadingVersusNativeSearch,
    testSkillToolAndArtifactSourceDistinctions,
    testSectionStateAcrossRenders,
    testSectionDefaultsWithoutCollapsedOption,
    testRenderedSectionsDefaultCollapsed,
    testContextCardEmptyAndMessageCounts,
    testOpenSectionsSurviveRenderingAndSessionSwitches,
    testLoadSessionKeepsPersistedTasks,
    testNewChatHasNoStaleSidebarState
  ];
  for (const test of tests) {
    try {
      await test();
    } catch (error) {
      error.message = `${test.name}: ${error.message}`;
      throw error;
    }
  }
  console.log(`Session sidebar: ${tests.length} regression tests passed.`);
}

module.exports = { runSessionSidebarTests };
if (require.main === module) {
  runSessionSidebarTests().catch(error => { console.error(error); process.exitCode = 1; });
}
