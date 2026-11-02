const fs = require('fs');
const path = require('path');
const { app } = require('electron');
const rag = require('./rag-engine');
let timer, debounce, running, notify = () => { };
const watchers = new Map();
const state = { enabled: true, running: false, lastChecked: null, lastSuccess: null, error: '', updated: 0, removed: 0, skipped: [] };
const preference = () => path.join(app.getPath('userData'), 'knowledge-updates.json');
function status() { return { ...state, skipped: state.skipped.slice() }; }
function emit() { notify(status()); }
function syncWatchers() {
    const sources = rag.getStats().sources.filter(source => source.type !== 'memory');
    const active = new Set(sources.map(source => source.path));
    for (const [target, watcher] of watchers)
        if (!active.has(target)) {
            watcher.close();
            watchers.delete(target);
        }
    for (const source of sources) {
        if (watchers.has(source.path))
            continue;
        try {
            const watcher = fs.watch(source.path, { recursive: source.isDirectory, persistent: false }, (_event, name) => {
                if (/rag_knowledge_index\.json|knowledge-updates\.json/.test(String(name || '')))
                    return;
                if (/(?:^|[\\/])(?:node_modules|\.git|dist|build|\.cache)(?:[\\/]|$)/.test(String(name || '')))
                    return;
                clearTimeout(debounce);
                debounce = setTimeout(check, 1500);
                debounce.unref?.();
            });
            watcher.on('error', () => { watcher.close(); watchers.delete(source.path); });
            watchers.set(source.path, watcher);
        }
        catch { /* Polling covers unavailable roots and unsupported watchers. */ }
    }
}
async function check(forced = false) {
    if (!state.enabled && !forced)
        return status();
    if (running)
        return running;
    state.running = true;
    emit();
    running = (async () => {
        try {
            if (state.enabled)
                syncWatchers();
            const result = await rag.refreshChangedFiles();
            if (!result.success)
                throw new Error(result.error);
            Object.assign(state, result, { lastSuccess: new Date().toISOString(), error: '' });
        }
        catch (error) {
            state.error = error.message;
        }
        finally {
            state.running = false;
            running = null;
            emit();
        }
        return status();
    })();
    return running;
}
function stop() { clearInterval(timer); clearTimeout(debounce); for (const watcher of watchers.values())
    watcher.close(); watchers.clear(); }
function setEnabled(enabled) {
    const next = Boolean(enabled);
    fs.mkdirSync(path.dirname(preference()), { recursive: true });
    fs.writeFileSync(preference(), JSON.stringify({ enabled: next }));
    state.enabled = next;
    if (next) {
        syncWatchers();
        check();
    }
    else {
        for (const watcher of watchers.values())
            watcher.close();
        watchers.clear();
        clearTimeout(debounce);
    }
    emit();
    return status();
}
function start(callback) {
    if (timer)
        return;
    notify = callback || notify;
    try {
        state.enabled = JSON.parse(fs.readFileSync(preference(), 'utf8')).enabled !== false;
    }
    catch { }
    timer = setInterval(check, 30000);
    timer.unref();
    debounce = setTimeout(check, 3000);
    debounce.unref();
    app.once('before-quit', stop);
}
module.exports = { start, stop, check, status, setEnabled };
