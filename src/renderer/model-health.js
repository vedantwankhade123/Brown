(function (root) {
    'use strict';
    const local = model => !/(?:-cloud|:cloud)$/i.test(model.name || '');
    function recommend(models, freeBytes = 0) {
        return models.filter(local).filter(m => !m.capabilities?.length || m.capabilities.includes('completion')).map(model => {
            const vision = /llava|vision|moondream|bakllava/i.test(model.name);
            const fits = !freeBytes || model.size * 1.3 < freeBytes;
            const tiny = /tinyllama|0\.\d+b|(?:^|:)1b/i.test(model.name) || /M$/i.test(model.details?.parameter_size || '');
            return { ...model, fits, score: (fits ? 100 : 0) + (vision ? 0 : 30) + (tiny ? 0 : 20) };
        }).sort((a, b) => b.score - a.score || (a.size || 0) - (b.size || 0));
    }
    async function inspect({ fetchImpl = root.fetch.bind(root), hardware = {} } = {}) {
        const get = async (endpoint) => { const response = await fetchImpl('http://127.0.0.1:11434/api/' + endpoint, { signal: AbortSignal.timeout(5000) }); if (!response.ok)
            throw new Error('Ollama returned HTTP ' + response.status); return response.json(); };
        try {
            const [version, tags, ps] = await Promise.all([get('version'), get('tags'), get('ps')]);
            const freeGB = Number(hardware.freeMemoryGB || hardware.freeMemGB || 0);
            return { online: true, version: version.version, loaded: ps.models || [], models: recommend(tags.models || [], freeGB * 1024 ** 3), freeGB };
        }
        catch (error) {
            return { online: false, models: [], loaded: [], error: error.message };
        }
    }
    async function warm(model, { fetchImpl = root.fetch.bind(root), signal } = {}) {
        if (!model || !local({ name: model }))
            throw new Error('Choose an installed local model.');
        const response = await fetchImpl('http://127.0.0.1:11434/api/generate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: signal || AbortSignal.timeout(120000), body: JSON.stringify({ model, prompt: '', stream: false, keep_alive: '5m' }) });
        if (!response.ok)
            throw new Error('Could not load the local model. Check available memory or select a smaller model.');
        const result = await response.json();
        if (result.error)
            throw new Error(result.error);
        return result;
    }
    const api = { inspect, recommend, warm };
    if (typeof module !== 'undefined')
        module.exports = api;
    root.BrownModelHealth = api;
})(typeof window === 'undefined' ? globalThis : window);
