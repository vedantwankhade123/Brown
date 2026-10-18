(function(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.BrownOnboardingSetup = api;
})(typeof window === 'undefined' ? globalThis : window, function() {
  const key = 'ultron-pending-setup-jobs';
  let running = null;
  function saveSelection(selection, storage) {
    const jobs = [];
    if (selection.voice?.enabled) jobs.push({ id: 'voice', choice: selection.voice });
    if (selection.ollama !== false) jobs.push({ id: 'ollama' });
    if (selection.huggingFace !== false) jobs.push({ id: 'hf' });
    storage.setItem(key, JSON.stringify(jobs));
    return jobs;
  }
  function resume({ api, storage, voices }) {
    if (running) return running;
    running = (async () => {
      let jobs;
      try { jobs = JSON.parse(storage.getItem(key) || '[]'); } catch { return; }
      if (!Array.isArray(jobs) || !jobs.length) return;
      api.queueOnboardingActivities?.(jobs.map(job => job.id));
      const pending = [...jobs];
      // Each job has independent failure handling: an offline connection must not block voice setup.
      const results = await Promise.allSettled(jobs.map(async job => {
        if (job.id === 'voice') await voices.downloadAfterSetup(job.choice, { api, storage });
        else if (job.id === 'ollama') {
          const installed = await api.checkOllamaInstalled();
          const result = installed?.installed ? await api.startOllamaSetup(installed.path) : await api.installOllama();
          if (result?.success === false) throw Error(result.error || 'Ollama setup failed.');
        } else if (job.id === 'hf') {
          const result = await api.checkHuggingFaceSetup();
          if (!result?.reachable) throw Error('Hugging Face is unreachable. Retry when connected.');
        } else throw Error('Unknown setup task');
        const index = pending.indexOf(job);
        if (index >= 0) pending.splice(index, 1);
        if (pending.length) storage.setItem(key, JSON.stringify(pending));
        else storage.removeItem(key);
      }));
      return results;
    })().finally(() => { running = null; });
    return running;
  }
  return { saveSelection, resume };
});
