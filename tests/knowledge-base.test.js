const assert = require('assert');
const fs = require('fs');
const path = require('path');
const os = require('os');
const ui = require('../src/renderer/knowledge-base');

function loadEngine(root, failSave = false) {
  const filename = path.resolve(__dirname, '../src/main/rag-engine.js');
  const module = { exports: {} };
  const disk = failSave
    ? { ...fs, promises: { ...fs.promises, writeFile: async () => { throw new Error('Disk unavailable'); } }, writeFileSync: () => { throw new Error('Disk unavailable'); } }
    : fs;
  new Function('require', 'module', 'exports', fs.readFileSync(filename, 'utf8'))(name => {
    if (name === 'electron') return { app: { getPath: () => root } };
    if (name === 'fs') return disk;
    return require(name);
  }, module, module.exports);
  return module.exports;
}
function pdf(text) {
  const content = `BT /F1 12 Tf 30 100 Td (${text}) Tj ET`;
  const objects = ['<< /Type /Catalog /Pages 2 0 R >>', '<< /Type /Pages /Kids [3 0 R] /Count 1 >>', '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 200] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>', '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>', `<< /Length ${content.length} >>\nstream\n${content}\nendstream`];
  let body = '%PDF-1.4\n', offsets = [0];
  objects.forEach((object, index) => { offsets.push(Buffer.byteLength(body)); body += `${index + 1} 0 obj\n${object}\nendobj\n`; });
  const start = Buffer.byteLength(body);
  body += `xref\n0 6\n0000000000 65535 f \n${offsets.slice(1).map(offset => `${String(offset).padStart(10, '0')} 00000 n \n`).join('')}trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${start}\n%%EOF`;
  return body;
}
async function runKnowledgeTests() {
  const picked = { canceled: false, filePaths: ['C:/Notes/note.txt'] };
  assert.strictEqual(await ui.pickKnowledgeFiles({ ragSelectFiles: async () => picked }), picked);
  const legacy = { canceled: false, path: 'C:/Notes/note.txt' };
  assert.strictEqual(await ui.pickKnowledgeFiles({
    ragSelectFiles: async () => { throw new Error("Error invoking remote method 'rag:select-files': Error: No handler registered for 'rag:select-files'"); },
    selectDocumentFile: async () => legacy
  }), legacy, 'Older running main processes must use the existing document picker');
  assert.strictEqual(await ui.pickKnowledgeFiles({ selectDocumentFile: async () => legacy }), legacy);
  await assert.rejects(ui.pickKnowledgeFiles({
    ragSelectFiles: async () => { throw new Error('Picker failed'); },
    selectDocumentFile: async () => { throw new Error('Unexpected fallback'); }
  }), /Picker failed/);
  assert.deepStrictEqual(ui.selectedPaths({ canceled: false, filePaths: ['C:/Notes'] }), ['C:/Notes']);
  assert.deepStrictEqual(ui.selectedPaths({ canceled: true, filePaths: ['C:/Notes'] }), []);
  assert.deepStrictEqual(ui.selectedPaths({ path: 'C:/Notes/note.txt' }), ['C:/Notes/note.txt']);
  assert(ui.belongsTo({ path: 'C:\\Notes\\note.txt' }, { path: 'c:/notes', isDirectory: true }));
  assert(!ui.belongsTo({ path: 'C:/Notes-old/note.txt' }, { path: 'C:/Notes', isDirectory: true }));
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'brown-kb-test-'));
  const notes = path.join(root, 'notes'); fs.mkdirSync(notes);
  const note = path.join(notes, 'guide.MD'); fs.writeFileSync(note, '# Brown\nThe aurora knowledge guide includes offline document indexing.');
  const csv = path.join(notes, 'budget.csv'); fs.writeFileSync(csv, 'item,cost\nAurora,42');
  fs.writeFileSync(path.join(notes, 'empty.txt'), '');
  fs.writeFileSync(path.join(notes, 'picture.png'), 'unsupported');
  fs.writeFileSync(path.join(notes, '.env'), 'SECRET=do-not-index');
  fs.mkdirSync(path.join(notes, 'node_modules')); fs.writeFileSync(path.join(notes, 'node_modules', 'ignored.txt'), 'Do not index dependencies');
  fs.writeFileSync(path.join(notes, 'manual.pdf'), pdf('Aurora PDF documentation is searchable.'));
  const rag = loadEngine(root);
  assert.strictEqual((await rag.addSources([{ filePaths: [notes] }])).success, false);
  assert.strictEqual((await rag.addSources([path.join(notes, 'picture.png')])).success, false);
  assert.strictEqual((await rag.addSources([path.join(root, 'missing')])).success, false);
  const progress = [];
  const result = await rag.addSources([notes], item => progress.push(item));
  assert.strictEqual(result.success, true);
  assert.strictEqual(result.totalFiles, 3, 'Markdown, CSV, and real PDF must be indexed');
  assert.strictEqual(result.skipped.length, 1, 'Empty supported files must be reported');
  assert(progress.length >= 3);
  assert.strictEqual(rag.listIndexedFiles().files.length, 3);
  const indexedNote = rag.listIndexedFiles().files.find(file => file.path === note);
  assert.strictEqual(indexedNote.size, fs.statSync(note).size, 'Table metadata must report the actual file size in bytes');
  assert.strictEqual(indexedNote.modifiedAt, fs.statSync(note).mtime.toISOString());
  assert.strictEqual(ui.fileSize(0), '0 B');
  assert.strictEqual(ui.fileSize(1536), '1.5 KB');
  assert.strictEqual(ui.fileSize(1572864), '1.5 MB');
  assert((await rag.searchKnowledge('Aurora PDF documentation')).results.some(item => item.fileName === 'manual.pdf'));
  await rag.indexTextContent('memory-test', 'Saved note', 'Remember the purple nebula project milestones.');
  const again = await rag.addSources([note]);
  assert.strictEqual(again.success, true);
  assert.strictEqual(again.totalFiles, 3, 'Overlapping sources must not double-count indexed files');
  assert.strictEqual(rag.listIndexedFiles().files.filter(file => file.path === note).length, 1);
  assert((await rag.searchKnowledge('purple nebula')).results.some(item => item.fileName === 'Saved note'), 'Reindexing must preserve saved text');
  assert(rag.listIndexedFiles().files.find(file => file.path === note).size > 0);
  const broken = loadEngine(root, true);
  assert.strictEqual((await broken.addSources([csv])).success, false, 'Persistence errors must not report success');
  console.log('PASS: Knowledge pickers, folder/file import, PDF extraction, progress, exclusions, duplicates, saved notes, and disk errors.');
}
module.exports = { runKnowledgeTests };
if (require.main === module) runKnowledgeTests().catch(error => { console.error(error); process.exitCode = 1; });
