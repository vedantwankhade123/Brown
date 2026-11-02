(function (root) {
    'use strict';
    function init({ store, api, hooks }) {
        const node = (tag, text, cls) => {
            const n = document.createElement(tag);
            if (text != null)
                n.textContent = text;
            if (cls)
                n.className = cls;
            return n;
        };
        function panel(title) {
            const dialog = node('dialog', null, 'brown-workspace-dialog');
            dialog.setAttribute('aria-label', title);
            const header = node('div', null, 'brown-workspace-heading');
            header.append(node('h2', title));
            const close = node('button', '×');
            close.type = 'button';
            close.setAttribute('aria-label', 'Close');
            close.onclick = () => { if (dialog.dataset.busy !== 'true')
                dialog.close(); };
            header.append(close);
            dialog.append(header);
            dialog.addEventListener('close', () => dialog.remove(), { once: true });
            dialog.addEventListener('click', e => {
                if (e.target === dialog && dialog.dataset.busy !== 'true') {
                    const r = dialog.getBoundingClientRect();
                    if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom)
                        dialog.close();
                }
            });
            document.body.append(dialog);
            dialog.showModal();
            return dialog;
        }
        async function projects(selectedId) {
            const editing = typeof selectedId === 'string';
            const existing = editing ? store.get(selectedId) : null;
            const dialog = panel(editing ? 'Project settings' : 'Create project');
            dialog.classList.add('brown-project-form');
            const folderIcon = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="M3 7V5a2 2 0 0 1 2-2h5l2 3h7a2 2 0 0 1 2 2v12H3Z"/><path d="M3 7h18"/></svg>';
            const nameWrap = node('div', null, 'brown-project-name');
            const nameIcon = node('span');
            nameIcon.innerHTML = folderIcon;
            const name = node('input');
            name.placeholder = 'Project name';
            name.maxLength = 100;
            name.setAttribute('aria-label', 'Project name');
            name.value = existing?.name || '';
            if (existing?.id === 'personal')
                name.readOnly = true;
            nameWrap.append(nameIcon, name);
            let roots = [...(existing?.roots || [])], page = 0, saving = false;
            const general = node('div', null, 'brown-project-general');
            general.append(nameWrap);
            const instructions = node('textarea');
            instructions.rows = 5;
            instructions.maxLength = 6000;
            instructions.placeholder = 'Project goals, coding conventions, response preferences…';
            instructions.setAttribute('aria-label', 'Project instructions');
            instructions.value = existing?.instructions || '';
            const model = node('select');
            model.setAttribute('aria-label', 'Preferred project model');
            const inherit = node('option', 'Use current chat model');
            inherit.value = '';
            model.append(inherit);
            for (const m of hooks.models()) {
                const option = node('option', m.name);
                option.value = m.name;
                model.append(option);
            }
            model.value = existing?.model || '';
            model.hidden = true;
            const modelPicker = node('div', null, 'brown-project-model-picker');
            const modelButton = node('button', null, 'brown-project-model-trigger');
            modelButton.type = 'button';
            modelButton.setAttribute('aria-haspopup', 'listbox');
            modelButton.setAttribute('aria-expanded', 'false');
            modelButton.setAttribute('aria-label', 'Preferred project model');
            const modelText = node('span');
            const modelChevron = node('span', '⌄', 'brown-project-model-chevron');
            modelButton.append(modelText, modelChevron);
            const modelMenu = node('div', null, 'brown-project-model-menu');
            modelMenu.setAttribute('role', 'listbox');
            modelMenu.setAttribute('aria-label', 'Available local models');
            modelMenu.hidden = true;
            const closeModels = () => { modelMenu.hidden = true; modelButton.setAttribute('aria-expanded', 'false'); };
            const syncModel = () => {
                modelText.textContent = [...model.options].find(option => option.value === model.value)?.textContent || 'Use current chat model';
                for (const option of modelMenu.children) option.setAttribute('aria-selected', String(option.dataset.value === model.value));
            };
            for (const option of model.options) {
                const item = node('button', option.textContent, 'brown-project-model-option');
                item.type = 'button'; item.dataset.value = option.value;
                item.setAttribute('role', 'option');
                item.onclick = () => { model.value = option.value; syncModel(); closeModels(); modelButton.focus(); };
                item.onkeydown = event => {
                    const items = [...modelMenu.children], index = items.indexOf(item);
                    if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
                        event.preventDefault(); items[event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1 : (index + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length].focus();
                    }
                };
                modelMenu.append(item);
            }
            modelButton.onclick = () => {
                modelMenu.hidden = !modelMenu.hidden;
                modelButton.setAttribute('aria-expanded', String(!modelMenu.hidden));
                if (!modelMenu.hidden) modelMenu.querySelector('[aria-selected="true"]')?.focus();
            };
            modelPicker.addEventListener('keydown', event => { if (event.key === 'Escape' && !modelMenu.hidden) { event.preventDefault(); event.stopPropagation(); closeModels(); modelButton.focus(); } });
            dialog.addEventListener('click', event => { if (!modelPicker.contains(event.target)) closeModels(); });
            modelPicker.addEventListener('focusout', event => { if (!modelPicker.contains(event.relatedTarget)) closeModels(); });
            model.addEventListener('change', syncModel);
            modelPicker.append(modelButton, modelMenu); syncModel();
            const instructionPane = node('div', null, 'brown-project-preference');
            instructionPane.append(node('label', 'Instructions for this project'), instructions);
            const modelPane = node('div', null, 'brown-project-preference');
            modelPane.append(node('label', 'Preferred local model'), model, modelPicker);
            if (editing) {
                const tabs = node('div', null, 'brown-project-tabs');
                const panes = [general, instructionPane, modelPane];
                ['General', 'Instructions', 'Model'].forEach((label, index) => {
                    const tab = node('button', label);
                    tab.type = 'button';
                    tab.setAttribute('aria-pressed', String(index === 0));
                    tab.onclick = () => { for (const [i, pane] of panes.entries())
                        pane.hidden = i !== index; for (const [i, button] of [...tabs.children].entries())
                        button.setAttribute('aria-pressed', String(i === index)); };
                    tabs.append(tab);
                });
                instructionPane.hidden = modelPane.hidden = true;
                dialog.append(tabs, general, instructionPane, modelPane);
            }
            else
                dialog.append(general);
            const sourceHeading = node('div', null, 'brown-project-source-heading');
            sourceHeading.append(node('h3', 'Project folder'));
            general.append(sourceHeading);
            const folders = node('div', null, 'brown-project-folder-card');
            general.append(folders);
            const notice = node('p', '', 'brown-project-feedback');
            notice.setAttribute('role', 'status');
            notice.setAttribute('aria-live', 'polite');
            dialog.append(notice);
            const message = text => {
                const value = String(text || '');
                notice.replaceChildren(); notice.title = value;
                const folderName = roots.map(path => path.replace(/\\/g, '/').split('/').filter(Boolean).at(-1))
                    .find(folder => folder && value.startsWith(folder + ':'));
                notice.classList.toggle('has-folder-message', Boolean(folderName));
                if (folderName) {
                    notice.append(node('strong', folderName, 'brown-project-feedback-title'),
                        node('span', value.slice(folderName.length + 1).trim(), 'brown-project-feedback-detail'));
                } else notice.textContent = value;
            };
            const knowledge = node('input');
            knowledge.type = 'checkbox';
            knowledge.checked = existing?.knowledgeEnabled !== false;
            knowledge.setAttribute('aria-label', 'Use project files for answers');
            if (editing && existing.id !== 'personal') {
                const knowledgeRow = node('div', null, 'brown-project-knowledge');
                const label = node('label'); label.append(knowledge, node('span', 'Use project files for answers'));
                const index = node('button', 'Index folder'); index.type = 'button';
                index.onclick = async () => {
                    if (!existing.roots.length) { message('Save a project folder first.'); return; }
                    index.disabled = true;
                    message('Indexing project files…');
                    try {
                        const result = await api.ragAddSources(existing.roots);
                        if (!result?.success) throw Error(result?.error || 'Could not index project files.');
                        knowledge.checked = true;
                        message('Files indexed. Save changes to enable project knowledge.');
                    } catch (error) { message(error.message); }
                    finally { index.disabled = false; }
                };
                knowledgeRow.append(label, index); general.append(knowledgeRow);
            }
            const footer = node('div', null, 'brown-project-footer');
            const cancel = node('button', 'Cancel', 'brown-project-cancel');
            cancel.type = 'button';
            cancel.onclick = () => { if (!saving)
                dialog.close(); };
            const submit = node('button', editing ? 'Save changes' : 'Create project', 'brown-project-submit');
            submit.type = 'button';
            footer.append(cancel, submit);
            dialog.append(footer);
            const controls = [name, instructions, model, modelButton, cancel, submit, dialog.querySelector('[aria-label="Close"]')];
            function drawFolders() {
                folders.replaceChildren();
                folders.classList.toggle('has-folders', roots.length > 0);
                if (existing?.id === 'personal') {
                    folders.append(node('p', 'Personal chats can use all indexed knowledge.'));
                    return;
                }
                const add = node('button', '+ Add', 'brown-project-add');
                add.type = 'button';
                add.setAttribute('aria-label', 'Add source folder');
                add.disabled = saving;
                add.onclick = async () => {
                    if (roots.length) return;
                    add.disabled = true;
                    try {
                        const result = await api.selectDirectory();
                        if (!dialog.isConnected || result?.canceled)
                            return;
                        roots = (result?.filePaths || []).filter(path => typeof path === 'string' && path.trim()).slice(0, 1);
                        page = Math.max(0, Math.ceil(roots.length / 2) - 1);
                        drawFolders();
                    }
                    catch (error) {
                        message(error.message);
                    }
                    finally {
                        add.disabled = false;
                    }
                };
                if (!roots.length) {
                    const sourceIcon = node('span', null, 'brown-project-source-icon'); sourceIcon.innerHTML = folderIcon;
                    const sourceText = node('div', 'Add a folder on this computer', 'brown-project-source-text');
                    folders.append(sourceIcon, sourceText, add);
                }
                else {
                    const list = node('div', null, 'brown-project-folder-list');
                    folders.append(list);
                    roots.slice(page * 2, page * 2 + 2).forEach(path => {
                        const row = node('div', null, 'brown-project-folder-row'), icon = node('span');
                        icon.innerHTML = folderIcon;
                        const label = node('span', path.replace(/\\/g, '/').split('/').filter(Boolean).at(-1) || path, 'brown-project-folder-label');
                        label.title = path;
                        const remove = node('button', '×');
                        remove.type = 'button';
                        remove.disabled = saving;
                        remove.setAttribute('aria-label', 'Remove ' + path);
                        remove.onclick = () => { roots = roots.filter(root => root !== path); page = Math.min(page, Math.max(0, Math.ceil(roots.length / 2) - 1)); drawFolders(); };
                        row.append(icon, label, remove);
                        list.append(row);
                    });
                    if (roots.length > 2) {
                        const actions = node('div', null, 'brown-project-folder-actions');
                        const previous = node('button', '‹'), next = node('button', '›');
                        previous.type = next.type = 'button';
                        previous.setAttribute('aria-label', 'Previous folders');
                        next.setAttribute('aria-label', 'Next folders');
                        previous.disabled = saving || page === 0;
                        next.disabled = saving || (page + 1) * 2 >= roots.length;
                        previous.onclick = () => { page--; drawFolders(); };
                        next.onclick = () => { page++; drawFolders(); };
                        actions.append(previous, node('span', String(page + 1) + ' / ' + Math.ceil(roots.length / 2)), next);
                        folders.append(actions);
                    }
                }
            }
            drawFolders();
            submit.disabled = !name.value.trim();
            name.oninput = () => { submit.disabled = !name.value.trim(); };
            dialog.addEventListener('cancel', event => { if (saving)
                event.preventDefault(); });
            submit.onclick = async () => {
                if (!name.value.trim() || saving)
                    return;
                if (hooks.busy()) {
                    message('Stop the current response before opening a project.');
                    return;
                }
                saving = true;
                dialog.dataset.busy = 'true';
                controls.forEach(control => { control.disabled = true; });
                drawFolders();
                const previous = store.active();
                try {
                    if (!dialog.isConnected)
                        return;
                    const project = existing || store.create(name.value);
                    store.update(project.id, { name: name.value, roots, knowledgeEnabled: editing ? knowledge.checked : false, instructions: instructions.value, model: model.value });
                    store.select(project.id);
                    await hooks.activate(store.get());
                    dialog.close();
                }
                catch (error) {
                    store.select(previous);
                    message(error.message);
                }
                finally {
                    saving = false;
                    delete dialog.dataset.busy;
                    controls.forEach(control => { control.disabled = false; });
                    submit.disabled = !name.value.trim();
                    drawFolders();
                }
            };
            name.focus();
        }
        async function health() {
            const dialog = panel('Local model health'), notice = node('p', 'Checking Ollama and available memory…', 'brown-workspace-notice');
            dialog.append(notice);
            const list = node('div', null, 'brown-health-list');
            dialog.append(list);
            async function refresh() {
                if (retry.disabled) return;
                retry.disabled = true;
                notice.classList.add('is-checking');
                list.setAttribute('aria-busy', 'true');
                try {
                list.replaceChildren();
                notice.textContent = 'Checking local models…';
                const hardware = await api.getSystemEnvironment().catch(() => ({}));
                const result = await root.BrownModelHealth.inspect({ hardware });
                if (!dialog.isConnected)
                    return;
                if (!result.online) {
                    notice.textContent = 'Ollama is unavailable. Start Ollama, then check again. ' + result.error;
                    return;
                }
                notice.textContent = 'Ollama ' + result.version + ' · ' + result.loaded.length + ' loaded' + (result.freeGB ? ' · ' + result.freeGB.toFixed(1) + ' GB RAM available' : '') + '. Memory guidance is an estimate; model context and GPU use also matter.';
                if (!result.models.length)
                    list.append(node('p', 'No local models installed. Install a model from Settings → Models.'));
                result.models.forEach((m, index) => {
                    const row = node('div', null, 'brown-health-model');
                    row.append(node('strong', m.name), node('span', [(m.size / 1024 ** 3).toFixed(1) + ' GB on disk', result.loaded.some(x => x.name === m.name) ? 'Loaded' : 'Not loaded', m.fits ? 'Within estimated memory budget' : 'May exceed available RAM', index === 0 ? 'Recommended for text chat' : ''].filter(Boolean).join(' · ')));
                    const actions = node('div', null, 'brown-workspace-actions'), use = node('button', 'Use model'), warm = node('button', 'Load / test');
                    use.onclick = () => {
                        if (hooks.busy()) {
                            notice.textContent = 'Stop the current response before changing models.';
                            return;
                        }
                        hooks.chooseModel(m.name);
                        notice.textContent = 'Selected ' + m.name;
                    };
                    warm.onclick = async () => {
                        warm.disabled = true;
                        retry.disabled = true;
                        notice.classList.add('is-checking');
                        notice.textContent = 'Loading ' + m.name + '…';
                        try {
                            if (hooks.busy())
                                throw Error('Stop the current response before testing a model.');
                            await root.BrownModelHealth.warm(m.name);
                            retry.disabled = false;
                            await refresh();
                        }
                        catch (e) {
                            notice.textContent = e.message;
                        }
                        finally {
                            warm.disabled = false;
                            retry.disabled = false;
                            notice.classList.remove('is-checking');
                        }
                    };
                    actions.append(use, warm);
                    row.append(actions);
                    list.append(row);
                });
                } catch (error) {
                    notice.textContent = error.message || 'Could not check local models. Try again.';
                } finally {
                    retry.disabled = false;
                    notice.classList.remove('is-checking');
                    list.setAttribute('aria-busy', 'false');
                }
            }
            notice.setAttribute('role', 'status');
            notice.setAttribute('aria-live', 'polite');
            const retry = node('button', 'Check again');
            retry.onclick = refresh;
            dialog.append(retry);
            await refresh();
        }
        function projectMenu(id, anchor) {
            const project = store.get(id);
            if (project.id === 'personal') return;
            return root.openSidebarActionsMenu(anchor, 'Project options', [
                { icon: 'settings', label: 'Project settings', action: () => projects(id) },
                { icon: 'delete', label: 'Delete project', danger: true, action: async () => { try { await hooks.removeProject(id); } catch (error) { hooks.error?.(error); } } }
            ]);
        }
        document.getElementById('titlebar-btn-projects')?.addEventListener('click', () => projects());
        document.getElementById('titlebar-btn-model-health')?.addEventListener('click', health);
        return { projects, health, projectMenu };
    }
    root.BrownWorkspaceUI = { init };
})(window);
