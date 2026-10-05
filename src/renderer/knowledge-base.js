/* Local Knowledge Base dashboard. Pickers and indexing stay behind the preload API. */
(function () {
  const types = [
    { id: 'text', label: 'Text & notes', glyph: 'TXT', extensions: ['txt', 'md', 'markdown', 'log'] },
    { id: 'pdf', label: 'PDF documents', glyph: 'PDF', extensions: ['pdf'] },
    { id: 'code', label: 'Code files', glyph: '</>', extensions: ['js', 'ts', 'jsx', 'tsx', 'py', 'html', 'css', 'sql', 'sh', 'bat', 'ps1'] },
    { id: 'data', label: 'Data & config', glyph: 'CSV', extensions: ['json', 'csv', 'xml', 'yaml', 'yml', 'ini', 'cfg'] },
  ];
  function selectedPaths(result) {
    if (!result || result.canceled) return [];
    if (typeof result === 'string') return [result];
    return (result.filePaths || (result.path ? [result.path] : [])).filter(path => typeof path === 'string' && path);
  }
  async function pickKnowledgeFiles(api) {
    if (typeof api.ragSelectFiles === 'function') {
      try { return await api.ragSelectFiles(); }
      catch (error) {
        if (!String(error.message || error).includes("No handler registered for 'rag:select-files'") || typeof api.selectDocumentFile !== 'function') throw error;
      }
    }
    if (typeof api.selectDocumentFile === 'function') return api.selectDocumentFile();
    throw new Error('Please restart the desktop app to enable file imports.');
  }
  function typeFor(file) {
    const extension = (file.fileName || file.path || '').split('.').pop().toLowerCase();
    return types.find(type => type.extensions.includes(extension))?.id || 'text';
  }
  function belongsTo(file, source) {
    const normalize = path => String(path || '').replace(/\\/g, '/').toLowerCase().replace(/\/$/, '');
    const filePath = normalize(file.path), sourcePath = normalize(source.path);
    return filePath === sourcePath || (source.isDirectory && filePath.startsWith(sourcePath + '/'));
  }
  function fileSize(bytes) {
    if (bytes == null) return '—';
    if (bytes < 1024) return `${bytes} B`;
    return bytes < 1024 * 1024 ? `${(bytes / 1024).toFixed(1)} KB` : `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }
  async function init(api, { isAutoEnabled = () => true } = {}) {
    const dashboard = document.getElementById('kb-drop-zone');
    if (!dashboard || dashboard.dataset.initialized) return;
    dashboard.dataset.initialized = 'true';
    const $ = id => document.getElementById(id);
    const node = (tag, className, text) => { const element = document.createElement(tag); if (className) element.className = className; if (text != null) element.textContent = text; return element; };
    let sources = [], files = [], sourceFilter = '', typeFilter = 'all', search = '', recent = false, busy = false;
    function notice(message, error = false) {
      $('kb-notice').textContent = message;
      $('kb-notice').classList.toggle('hidden', !message);
      $('kb-notice').classList.toggle('is-error', error);
    }
    function draw() {
      const sourceGrid = $('rag-sources-list'); sourceGrid.replaceChildren();
      if (!sources.length) {
        const empty = node('div', 'kb-source-empty');
        const illustration = node('div', 'kb-empty-folders');
        illustration.setAttribute('aria-hidden', 'true');
        illustration.append(node('span', 'kb-empty-folder kb-empty-folder-back'), node('span', 'kb-empty-folder kb-empty-folder-front'));
        empty.append(illustration, node('strong', '', 'Your knowledge starts here'), node('p', '', 'Import a folder or supported files. Brown will index their contents for your conversations.'));
        sourceGrid.append(empty);
      }
      for (const source of sources) {
        const tile = node('div', 'kb-source-tile');
        const button = node('button', 'kb-source-button' + (sourceFilter === source.path ? ' active' : ''));
        button.type = 'button'; button.title = source.path; button.setAttribute('aria-pressed', String(sourceFilter === source.path));
        const sourceIcon = node('span', 'kb-small-folder' + (source.isDirectory ? '' : ' kb-source-document'));
        sourceIcon.setAttribute('aria-hidden', 'true');
        sourceIcon.dataset.format = source.isDirectory ? (source.fileCount ? 'FILES' : '') : (source.name || '').split('.').pop().toUpperCase().slice(0, 4);
        button.append(sourceIcon, node('span', 'kb-source-name', source.name || source.path), node('span', 'kb-source-count', `${source.fileCount || 0} ${source.fileCount === 1 ? 'file' : 'files'}`));
        button.addEventListener('click', () => { sourceFilter = sourceFilter === source.path ? '' : source.path; draw(); });
        const remove = node('button', 'kb-source-remove', '⋮'); remove.type = 'button'; remove.title = 'Remove source from index'; remove.setAttribute('aria-label', `Remove ${source.name || 'source'} from index`);
        remove.addEventListener('click', () => {
          if (!busy && confirm(`Remove "${source.name || source.path}" from the index? The original files stay on this PC.`)) run('Removing source…', () => api.ragRemoveSource(source.path));
        });
        remove.disabled = busy; tile.append(button, remove); sourceGrid.append(tile);
      }
      const baseFiles = files.filter(file => !sourceFilter || sources.some(source => source.path === sourceFilter && belongsTo(file, source)));
      const typeGrid = $('kb-type-cards'); typeGrid.replaceChildren();
      for (const type of types) {
        const button = node('button', 'kb-type-card' + (typeFilter === type.id ? ' active' : '')); button.type = 'button'; button.setAttribute('aria-pressed', String(typeFilter === type.id));
        const folder = node('span', 'kb-type-folder', type.glyph); folder.setAttribute('aria-hidden', 'true');
        folder.dataset.format = type.glyph;
        const count = baseFiles.filter(file => typeFor(file) === type.id).length;
        button.append(folder, node('span', 'kb-type-title', type.label), node('span', 'kb-type-count', `${count} ${count === 1 ? 'file' : 'files'}`));
        button.addEventListener('click', () => { typeFilter = typeFilter === type.id ? 'all' : type.id; $('kb-type-filter').value = typeFilter; draw(); }); typeGrid.append(button);
      }
      let shown = baseFiles.filter(file => (typeFilter === 'all' || typeFor(file) === typeFilter) && `${file.fileName} ${file.path}`.toLowerCase().includes(search));
      shown.sort(recent ? (a, b) => (Date.parse(b.modifiedAt) || 0) - (Date.parse(a.modifiedAt) || 0) : (a, b) => a.fileName.localeCompare(b.fileName));
      $('kb-file-count').textContent = `(${shown.length})`;
      const rows = $('kb-file-rows'); rows.replaceChildren();
      if (!shown.length) {
        const row = node('tr'); const cell = node('td', 'kb-empty', files.length ? 'No indexed files match these filters.' : 'No files indexed yet. Import supported files or a folder above.'); cell.colSpan = 5; row.append(cell); rows.append(row);
      }
      for (const file of shown) {
        const row = node('tr'); const nameCell = node('td'); const name = node('div', 'kb-file-name'); name.title = file.path;
        name.append(node('span', 'kb-file-icon', (file.fileName.split('.').pop() || 'TXT').toUpperCase().slice(0, 4)), node('span', '', file.fileName)); nameCell.append(name);
        const source = sources.find(source => belongsTo(file, source));
        const action = node('td'); const reveal = node('button', 'kb-reveal', 'Show'); reveal.type = 'button'; reveal.setAttribute('aria-label', `Show ${file.fileName} in folder`); reveal.disabled = !file.modifiedAt || !api.showItemInFolder;
        reveal.addEventListener('click', async () => { try { const result = await api.showItemInFolder(file.path); if (result?.success === false) throw new Error(result.error); } catch (error) { notice(error.message || 'Could not open the file location.', true); } }); action.append(reveal);
        row.append(nameCell, node('td', 'kb-table-muted', source?.name || 'Saved note'), node('td', 'kb-table-muted', fileSize(file.size)), node('td', 'kb-table-muted', file.modifiedAt ? new Date(file.modifiedAt).toLocaleDateString() : '—'), action); rows.append(row);
      }
    }
    async function refresh() {
      const [stats, fileResult] = await Promise.all([api.ragGetStats(), api.ragListFiles('')]);
      if (stats?.success === false || fileResult?.success === false) throw new Error(stats?.error || fileResult?.error || 'Could not load the Knowledge Base.');
      sources = stats.sources || []; files = fileResult.files || [];
      if (!sources.some(source => source.path === sourceFilter)) sourceFilter = '';
      $('rag-stat-sources').textContent = `${sources.length} sources`;
      $('rag-stat-chunks').textContent = `${stats.totalChunks || 0} indexed excerpts`;
      draw();
    }
    async function run(label, action, importing = false) {
      if (busy) return;
      busy = true;
      const controls = ['btn-rag-add-folder', 'btn-rag-add-files', 'btn-rag-reindex', 'btn-rag-clear']; controls.forEach(id => $(id).disabled = true);
      $('rag-progress-container').classList.remove('hidden'); $('rag-progress-label').textContent = label; $('rag-progress-stats').textContent = ''; notice(''); draw();
      try {
        const result = await action();
        if (!result?.success) throw new Error(result?.error || 'Indexing failed. Please retry.');
        const issues = [...(result.rejected || []), ...(result.skipped || [])];
        let message = importing ? `${result.totalFiles || 0} files indexed. Ready to use in chat.` : 'Knowledge Base updated.';
        if (issues.length) message += ` ${issues.length} items skipped. ${issues.slice(0, 3).map(item => `${String(item.path).split(/[\\/]/).pop()}: ${item.reason}`).join(' ')}`;
        notice(message, importing && result.totalFiles === 0);
        await refresh();
      } catch (error) { notice(error.message || 'Could not update the index.', true); }
      finally { busy = false; controls.forEach(id => $(id).disabled = false); $('rag-progress-container').classList.add('hidden'); draw(); }
    }
    async function choose(picker) {
      if (busy) return;
      try { const paths = selectedPaths(await picker()); if (paths.length) await run('Importing and indexing…', () => api.ragAddSources(paths), true); }
      catch (error) { notice(error.message || 'Could not open the picker.', true); }
    }
    $('btn-rag-add-folder').addEventListener('click', () => choose(() => api.selectDirectory()));
    $('btn-rag-add-files').addEventListener('click', () => choose(() => pickKnowledgeFiles(api)));
    $('btn-rag-reindex').addEventListener('click', () => run('Re-indexing…', () => api.ragReindex(), true));
    $('btn-rag-clear').addEventListener('click', () => { if (!busy && confirm('Clear the Knowledge Base index? Original files will not be deleted.')) run('Clearing index…', () => api.ragClear()); });
    let _kbSearchTimer = 0;
    $('kb-search').addEventListener('input', event => {
      search = event.target.value.trim().toLowerCase();
      clearTimeout(_kbSearchTimer);
      _kbSearchTimer = setTimeout(draw, 140);
    });
    $('kb-type-filter').addEventListener('change', event => { typeFilter = event.target.value; draw(); });
    $('kb-reset-filter').addEventListener('click', () => { sourceFilter = ''; typeFilter = 'all'; search = ''; $('kb-search').value = ''; $('kb-type-filter').value = 'all'; draw(); });
    document.querySelectorAll('[data-kb-view]').forEach(button => button.addEventListener('click', () => {
      recent = button.dataset.kbView === 'recent';
      document.querySelectorAll('[data-kb-view]').forEach(other => { const active = other === button; other.classList.toggle('active', active); other.setAttribute('aria-pressed', String(active)); }); draw();
    }));
    $('rag-auto-toggle').checked = isAutoEnabled();
    $('rag-auto-toggle').addEventListener('change', event => { try { localStorage.setItem('ultron-rag-auto', event.target.checked ? '1' : '0'); } catch { notice('Could not save the auto-learn preference.', true); } });
    api.onRagIndexProgress?.(progress => { if (!busy) return; $('rag-progress-label').textContent = `Indexing ${progress.currentSource || 'files'}…`; $('rag-progress-stats').textContent = `${progress.filesIndexed || 0} files`; });
    dashboard.addEventListener('dragover', event => { if (!Array.from(event.dataTransfer?.types || []).includes('Files')) return; event.preventDefault(); event.stopPropagation(); dashboard.classList.add('kb-drag-over'); });
    dashboard.addEventListener('dragleave', event => { if (!dashboard.contains(event.relatedTarget)) dashboard.classList.remove('kb-drag-over'); });
    dashboard.addEventListener('drop', event => {
      event.preventDefault(); event.stopPropagation(); dashboard.classList.remove('kb-drag-over'); if (busy) return;
      const paths = [...new Set(Array.from(event.dataTransfer?.files || []).map(file => api.ragGetDroppedPath?.(file) || file.path).filter(Boolean))];
      if (!paths.length) { notice('Use Import files or Import folder to select local items.', true); return; }
      run('Importing dropped files…', () => api.ragAddSources(paths), true);
    });
    $('btn-rag-test-search').addEventListener('click', async () => {
      const query = $('input-rag-test-query').value.trim(); if (!query) return;
      const button = $('btn-rag-test-search'); button.disabled = true;
      try {
        const result = await api.ragSearch({ query, topK: 4 }); if (!result.success) throw new Error(result.error || 'Search failed.');
        const results = $('rag-test-results'); results.replaceChildren();
        if (!result.results.length) results.append(node('p', 'kb-empty', 'No matching excerpts found.'));
        result.results.forEach(item => { const card = node('article', 'kb-excerpt'); card.append(node('strong', '', item.fileName), node('p', '', item.snippet)); results.append(card); });
      } catch (error) { notice(error.message, true); } finally { button.disabled = false; }
    });
    $('input-rag-test-query').addEventListener('keydown', event => { if (event.key === 'Enter') $('btn-rag-test-search').click(); });
    document.querySelector('.settings-tab-btn[data-tab="knowledge"]')?.addEventListener('click', () => refresh().catch(error => notice(error.message, true)));
    try { await refresh(); } catch (error) { notice(error.message, true); }
    // Keep the existing six-hour refresh for auto-learned sources.
    try {
      const lastRefresh = Number(localStorage.getItem('ultron-rag-last-refresh') || 0);
      if (isAutoEnabled() && Date.now() - lastRefresh > 6 * 3600 * 1000) {
        setTimeout(() => {
          if (busy || !sources.length || !isAutoEnabled()) return;
          run('Refreshing indexed sources…', async () => {
            const result = await api.ragReindex();
            if (result.success) localStorage.setItem('ultron-rag-last-refresh', String(Date.now()));
            return result;
          });
        }, 8000);
      }
    } catch { /* Indexing remains available when preference storage is unavailable. */ }
  }
  const api = { init, selectedPaths, pickKnowledgeFiles, typeFor, belongsTo, fileSize };
  if (typeof window !== 'undefined') window.BrownKnowledgeBase = api;
  if (typeof module !== 'undefined') module.exports = api;
})();
