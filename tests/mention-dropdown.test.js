const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const { parseHTML } = require('linkedom');
const { document } = parseHTML(fs.readFileSync(require.resolve('../src/renderer/index.html'), 'utf8'));
const source = fs.readFileSync(require.resolve('../src/renderer/renderer.js'), 'utf8');
const tree = ts.createSourceFile('r.js', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
const names = ['isMentionPopoverOpen','openMentionPopover','closeMentionPopover','refreshMentionFileList','hideAtMentionDropdown','detectAtToken','renderAtMentionDropdown','syncAtMentionDropdown','acceptAtMentionRow'];
const functions = tree.statements.filter(n => ts.isFunctionDeclaration(n) && names.includes(n.name.text)).map(n => n.getText(tree));
assert.equal(functions.length, names.length);
const chatInput = document.getElementById('chat-input');
let resolveQuery, selected = [], inputFocused = false, searchFocused = false;
chatInput.focus = () => { inputFocused = true; };
chatInput.setSelectionRange = (a,b) => { chatInput.selectionStart = a; chatInput.selectionEnd = b; };
document.getElementById('mention-search-input').focus = () => { searchFocused = true; };
const context = vm.createContext({ document, chatInput, console, setTimeout, clearTimeout,
  window: { ultronAPI: { ragListFiles: query => new Promise(resolve => { resolveQuery = { query, resolve }; }) } },
  positionMentionPopover() {}, closeInputPopovers() {}, syncMentionToggleStates() {},
  _activeProject: null, DOCK_ICONS: { file: '<svg></svg>' },
  dirLabelForFile: () => 'project', escapeHtml: text => String(text).replace(/</g,'&lt;'), folderNameOf: path => path.split('/').pop(),
  addFileMentionChip: file => selected.push(file), adjustInputHeight() {}
});
vm.runInContext('const _atMenu = { rows: [], index: -1, tokenStart: -1, tokenEnd: -1, visible: false, inline: false }; let mentionFileRequest = 0;\n' + functions.join('\n'), context);
const tick = () => new Promise(resolve => setImmediate(resolve));
const file = { path: 'project/authSlice.jsx', fileName: 'authSlice.jsx' };
(async () => {
  chatInput.value = 'Explain @auth'; chatInput.selectionStart = chatInput.value.length;
  await context.syncAtMentionDropdown();
  assert(!document.getElementById('mention-popover').classList.contains('hidden'));
  assert(!document.getElementById('at-mention-dropdown'), 'old dropdown is removed');
  assert.equal(resolveQuery.query, 'auth');
  assert.equal(document.getElementById('mention-search-input').value, 'auth');
  assert(!searchFocused, 'typing @ keeps input focus');
  const stale = resolveQuery;
  chatInput.value = 'Explain @authSlice'; chatInput.selectionStart = chatInput.value.length;
  const pending = context.syncAtMentionDropdown();
  const latest = resolveQuery;
  stale.resolve({success:true,files:[{path:'stale',fileName:'wrong'}]}); await tick();
  assert(!document.getElementById('mention-file-list').textContent.includes('wrong'));
  latest.resolve({success:true,files:[file]}); await pending;
  assert.equal(document.querySelectorAll('#mention-file-list .mention-file-row').length, 1);
  document.querySelector('#mention-file-list .mention-file-row').click();
  assert.equal(selected[0].path, file.path); assert.equal(chatInput.value, 'Explain ');
  assert(inputFocused); assert(document.getElementById('mention-popover').classList.contains('hidden'));
  chatInput.value = '@'; chatInput.selectionStart = 1;
  await context.syncAtMentionDropdown();
  assert.equal(resolveQuery.query, '', 'bare @ loads indexed files, not tool suggestions');
  resolveQuery.resolve({success:true,files:[file]}); await tick();
  chatInput.value = ''; chatInput.selectionStart = 0;
  await context.syncAtMentionDropdown();
  assert(document.getElementById('mention-popover').classList.contains('hidden'));
  context.openMentionPopover();
  resolveQuery.resolve({success:true,files:[file]}); await tick();
  document.querySelector('#mention-file-list .mention-file-row').click();
  assert.equal(selected.length, 2, 'button-opened Mention still selects files');
  console.log('PASS: @ and Mention share the file dropdown; filtered results, stale search isolation, chip insertion, token removal and closing.');
})().catch(error => { console.error(error); process.exitCode = 1; });
