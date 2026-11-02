/* Local Knowledge Base dashboard. Pickers and indexing stay behind the preload API. */
(function () {
  const types = [
    { id: 'text', label: 'Text & notes', glyph: 'TXT', extensions: ['txt', 'md', 'markdown', 'log'] },
    { id: 'pdf', label: 'PDF documents', glyph: 'PDF', extensions: ['pdf'] },
    { id: 'documents', label: 'Documents & slides', glyph: 'DOC', extensions: ['docx','pptx','odt','odp','rtf'] },
    { id: 'images', label: 'Images & scans', glyph: 'IMG', extensions: ['png','jpg','jpeg','webp','bmp','tif','tiff','gif'] },
    { id: 'code', label: 'Code files', glyph: '</>', extensions: ['js', 'ts', 'jsx', 'tsx', 'py', 'html', 'css', 'sql', 'sh', 'bat', 'ps1'] },
    { id: 'data', label: 'Data & spreadsheets', glyph: 'CSV', extensions: ['json', 'jsonl', 'csv', 'tsv', 'xlsx', 'ods', 'xml', 'yaml', 'yml', 'ini', 'cfg', 'toml'] },
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
  async function init(api, { isAutoEnabled = () => true, confirmAction } = {}) {
    const dashboard = document.getElementById('kb-drop-zone');
    if (!dashboard || dashboard.dataset.initialized) return;
    dashboard.dataset.initialized = 'true';
    const $ = id => document.getElementById(id);
    const node = (tag, className, text) => { const element = document.createElement(tag); if (className) element.className = className; if (text != null) element.textContent = text; return element; };
    let sources = [], files = [], sourceFilter = '', typeFilter = 'all', search = '', recent = false, busy = false, confirming = false;
    const pageSize=10;let page=1,searchOpen=false;
    const pagination=node('nav','kb-pagination');pagination.setAttribute('aria-label','Indexed files pages');$('kb-file-rows').closest('.kb-table-wrap').after(pagination);
    const results=$('kb-search-results'),searchInput=$('kb-search');
    function closeSearch(){searchOpen=false;if(results)results.hidden=true;searchInput.setAttribute('aria-expanded','false');}
    function drawSearch(matches){
      if(!results)return;results.replaceChildren();results.hidden=!search||!searchOpen;searchInput.setAttribute('aria-expanded',String(!results.hidden));
      if(results.hidden)return;
      if(!matches.length){results.append(node('div','kb-search-empty','No indexed files match your search.'));return;}
      matches.slice(0,50).forEach((file,index)=>{
        const row=node('button','kb-search-result');row.type='button';row.setAttribute('role','option');row.setAttribute('aria-selected','false');row.title=file.path;
        const icon=node('span','kb-search-file-icon');icon.setAttribute('aria-hidden','true');icon.innerHTML='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M14 3H5v18h14V8Z"/><path d="M14 3v6h5"/></svg>';
        const parent=String(file.path||'').replace(/[\\/][^\\/]*$/,'');row.append(icon,node('strong','',file.fileName),node('span','kb-search-file-path',parent));
        row.addEventListener('click',()=>{page=Math.floor(index/pageSize)+1;closeSearch();draw();const target=[...$('kb-file-rows').children].find(el=>el.dataset.filePath===file.path);target?.scrollIntoView({block:'center',behavior:'smooth'});target?.classList.add('kb-file-highlight');setTimeout(()=>target?.classList.remove('kb-file-highlight'),1600);});
        row.addEventListener('keydown',event=>{if(event.key==='Escape'){closeSearch();searchInput.focus();}else if(event.key==='ArrowDown'||event.key==='ArrowUp'){event.preventDefault();const rows=[...results.querySelectorAll('button')];rows[(index+(event.key==='ArrowDown'?1:-1)+rows.length)%rows.length]?.focus();}});
        results.append(row);
      });
      if(matches.length>50)results.append(node('div','kb-search-empty',`Showing 50 of ${matches.length} matches. Refine your search or browse the table.`));
    }
    function drawPages(count){
      const pages=Math.max(1,Math.ceil(count/pageSize));page=Math.min(Math.max(1,page),pages);pagination.replaceChildren();pagination.hidden=count<=pageSize;
      const range=node('span','kb-page-range',count?`${(page-1)*pageSize+1}–${Math.min(page*pageSize,count)} of ${count} files`:'0 files');pagination.append(range);
      const controls=node('div','kb-page-controls');
      const add=(label,value,disabled=false)=>{const numeric=/^\d+$/.test(label);const button=node('button',(numeric?'kb-page-number ':'')+(value===page?'active':''),label);button.type='button';button.disabled=disabled;button.setAttribute('aria-label',numeric?'Page '+label:label+' page');if(value===page&&numeric)button.setAttribute('aria-current','page');button.onclick=()=>{page=value;draw();};controls.append(button);};
      add('Previous',page-1,page===1);let previous=0;
      for(const value of [...new Set([1,page-1,page,page+1,pages])].filter(value=>value>=1&&value<=pages).sort((a,b)=>a-b)){if(previous&&value>previous+1)controls.append(node('span','','…'));add(String(value),value);previous=value;}
      add('Next',page+1,page===pages);pagination.append(controls);
    }
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
        button.addEventListener('click', () => { sourceFilter = sourceFilter === source.path ? '' : source.path; page=1; draw(); });
        const remove = node('button', 'kb-source-remove', '⋮'); remove.type = 'button'; remove.title = 'Remove source from index'; remove.setAttribute('aria-label', `Remove ${source.name || 'source'} from index`);
        remove.addEventListener('click', () => confirmIndexChange({
          title: 'Remove source?',
          message: `Remove "${source.name || source.path}" from the Knowledge Base index? Your original files will stay on this PC.`,
          confirmText: 'Remove source', destructive: true
        }, 'Removing source…', () => api.ragRemoveSource(source.path)));
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
        button.addEventListener('click', () => { typeFilter = typeFilter === type.id ? 'all' : type.id; $('kb-type-filter').value = typeFilter; page=1; draw(); }); typeGrid.append(button);
      }
      let shown = baseFiles.filter(file => (typeFilter === 'all' || typeFor(file) === typeFilter) && `${file.fileName} ${file.path}`.toLowerCase().includes(search));
      shown.sort(recent ? (a, b) => (Date.parse(b.modifiedAt) || 0) - (Date.parse(a.modifiedAt) || 0) : (a, b) => a.fileName.localeCompare(b.fileName));
      $('kb-file-count').textContent = `(${shown.length})`;
      drawSearch(shown);drawPages(shown.length);
      const rows = $('kb-file-rows'); rows.replaceChildren();
      if (!shown.length) {
        const row = node('tr'); const cell = node('td', 'kb-empty', files.length ? 'No indexed files match these filters.' : 'No files indexed yet. Import supported files or a folder above.'); cell.colSpan = 5; row.append(cell); rows.append(row);
      }
      for (const file of shown.slice((page-1)*pageSize,page*pageSize)) {
        const row = node('tr'); const nameCell = node('td'); const name = node('div', 'kb-file-name'); name.title = file.path;
        row.dataset.filePath=file.path;
        name.append(node('span', 'kb-file-icon', (file.fileName.split('.').pop() || 'TXT').toUpperCase().slice(0, 4)), node('span', '', file.fileName)); nameCell.append(name);
        if(file.extraction==='metadata')nameCell.append(node('small','kb-table-muted','Filename only · no readable image text'));
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
      const report=$('kb-import-report'),items=$('kb-import-report-items');
      if(report&&items){items.replaceChildren();for(const entry of stats.extractionReport||[])items.append(node('p','',entry.path+': '+entry.reason));report.hidden=!stats.extractionReport?.length;}
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
        if (issues.length) message += ` ${issues.filter(item=>!item.warning).length} items skipped; ${issues.filter(item=>item.warning).length} extraction notices. ${issues.slice(0, 3).map(item => `${String(item.path).split(/[\\/]/).pop()}: ${item.reason}`).join(' ')}`;
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
    async function confirmIndexChange(options, label, action) {
      if (busy || confirming) return;
      confirming = true;
      try {
        if (typeof confirmAction !== 'function') throw new Error('Please restart Brown to enable Knowledge Base confirmations.');
        if (await confirmAction(options)) await run(label, action);
      } catch (error) { notice(error.message || 'Could not confirm the index change.', true); }
      finally { confirming = false; }
    }
    $('btn-rag-add-folder').addEventListener('click', () => choose(() => api.selectDirectory()));
    $('btn-rag-add-files').addEventListener('click', () => choose(() => pickKnowledgeFiles(api)));
    $('btn-rag-reindex').addEventListener('click', () => run('Re-indexing…', () => api.ragReindex(), true));
    $('btn-rag-clear').addEventListener('click', () => confirmIndexChange({
      title: 'Clear Knowledge Base?',
      message: 'Remove all indexed sources and excerpts from the Knowledge Base? Your original files will stay on this PC.',
      confirmText: 'Clear index', destructive: true
    }, 'Clearing index…', () => api.ragClear()));
    let _kbSearchTimer = 0;
    $('kb-search').addEventListener('input', event => {
      search = event.target.value.trim().toLowerCase();
      page=1;searchOpen=Boolean(search);
      clearTimeout(_kbSearchTimer);
      _kbSearchTimer = setTimeout(draw, 140);
    });
    searchInput.addEventListener('focus',()=>{if(search){searchOpen=true;draw();}});
    searchInput.addEventListener('keydown',event=>{if(event.key==='Escape')closeSearch();if(event.key==='ArrowDown'&&results&&!results.hidden){event.preventDefault();results.querySelector('button')?.focus();}});
    document.addEventListener('click',event=>{if(!event.target.closest('.kb-search-shell'))closeSearch();});
    $('kb-type-filter').addEventListener('change', event => { typeFilter = event.target.value; page=1; draw(); });
    $('kb-reset-filter').addEventListener('click', () => { sourceFilter = ''; typeFilter = 'all'; search = ''; page=1; closeSearch(); $('kb-search').value = ''; $('kb-type-filter').value = 'all'; draw(); });
    document.querySelectorAll('[data-kb-view]').forEach(button => button.addEventListener('click', () => {
      recent = button.dataset.kbView === 'recent';
      page=1;
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
    function showUpdates(status) {
      if (!status) return;
      $('kb-auto-updates-toggle').checked = status.enabled;
      $('kb-update-status').textContent = status.running ? 'Updating changed files…' : status.error ? 'Update failed: ' + status.error : !status.enabled ? 'Automatic updates paused.' : status.lastSuccess ? 'Last checked ' + new Date(status.lastSuccess).toLocaleString() + ' · ' + status.updated + ' updated · ' + status.removed + ' removed' : 'Automatic updates ready. Waiting for the first check.';
      const details = $('kb-update-details'); details.replaceChildren();
      for (const item of status.skipped || []) details.append(node('p', '', item.path + ': ' + item.reason));
      if (!status.skipped?.length) details.append(node('p', '', 'No skipped files in the last check.'));
    }
    if (api.ragUpdateStatus) {
      const updateFailure = error => {
        const message = String(error?.message || error || 'Unknown update error');
        if (/No handler registered for ['"]?rag:(?:update-status|auto-updates|check-updates)/i.test(message)) {
          $('kb-update-status').textContent = 'Close Brown completely and reopen it to activate automatic knowledge updates. Your indexed files are still available.';
          $('kb-auto-updates-toggle').disabled = true;
          $('kb-check-updates').disabled = true;
        } else {
          $('kb-update-status').textContent = 'Automatic knowledge updates are unavailable: ' + message;
        }
      };
      api.ragUpdateStatus().then(showUpdates).catch(updateFailure);
      api.onRagUpdateStatus?.(status => { showUpdates(status); if (!status.running && !busy) refresh().catch(() => {}); });
      $('kb-auto-updates-toggle').addEventListener('change', async event => {
        try { showUpdates(await api.ragSetAutoUpdates(event.target.checked)); } catch (error) { updateFailure(error); }
      });
      $('kb-check-updates').addEventListener('click', async event => {
        event.target.disabled = true;
        try { showUpdates(await api.ragCheckUpdates()); await refresh(); } catch (error) { updateFailure(error); }
        finally { event.target.disabled = $('kb-auto-updates-toggle').disabled; }
      });
    } else $('kb-update-status').textContent = 'Restart Brown to enable automatic knowledge updates.';
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
