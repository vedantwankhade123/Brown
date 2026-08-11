/**
 * Simple scheduled workflow runner (Monaw-style) — checks every minute.
 */
(function () {
  const SCHEDULE_KEY = 'ultron-agent-schedules';
  let _timer = null;
  let _lastFired = {};

  function loadSchedules() {
    try {
      const saved = window.localStorage.getItem(SCHEDULE_KEY);
      if (saved) return JSON.parse(saved);
    } catch (e) {}
    return [];
  }

  function saveSchedules(schedules) {
    try {
      window.localStorage.setItem(SCHEDULE_KEY, JSON.stringify(schedules));
    } catch (e) {}
  }

  function addSchedule({ workflowId, label, hour, minute, days }) {
    const workflows = window.UltronAgentMemory ? window.UltronAgentMemory.loadWorkflows() : [];
    const wf = workflows.find(w => w.id === workflowId);
    if (!wf) return null;
    const schedules = loadSchedules();
    const id = `sched-${Date.now()}`;
    const entry = {
      id,
      workflowId,
      label: label || wf.name,
      hour: Number(hour),
      minute: Number(minute),
      days: Array.isArray(days) && days.length ? days : [0, 1, 2, 3, 4, 5, 6],
      enabled: true
    };
    schedules.push(entry);
    saveSchedules(schedules);
    return entry;
  }

  function removeSchedule(id) {
    const next = loadSchedules().filter(s => s.id !== id);
    saveSchedules(next);
    return next;
  }

  function toggleSchedule(id, enabled) {
    const schedules = loadSchedules();
    const item = schedules.find(s => s.id === id);
    if (item) item.enabled = enabled !== false;
    saveSchedules(schedules);
    return schedules;
  }

  function scheduleKey(entry) {
    const now = new Date();
    return `${entry.id}-${now.getFullYear()}-${now.getMonth()}-${now.getDate()}-${entry.hour}:${entry.minute}`;
  }

  function checkSchedules(onRunWorkflow) {
    if (typeof onRunWorkflow !== 'function') return;
    const now = new Date();
    const day = now.getDay();
    const hour = now.getHours();
    const minute = now.getMinutes();

    for (const entry of loadSchedules()) {
      if (!entry.enabled) continue;
      if (!entry.days.includes(day)) continue;
      if (entry.hour !== hour || entry.minute !== minute) continue;
      const key = scheduleKey(entry);
      if (_lastFired[key]) continue;
      _lastFired[key] = true;
      onRunWorkflow(entry);
    }
  }

  function startScheduler(onRunWorkflow, intervalMs = 60000) {
    stopScheduler();
    checkSchedules(onRunWorkflow);
    _timer = setInterval(() => checkSchedules(onRunWorkflow), intervalMs);
  }

  function stopScheduler() {
    if (_timer) {
      clearInterval(_timer);
      _timer = null;
    }
  }

  window.UltronAgentScheduler = {
    loadSchedules,
    saveSchedules,
    addSchedule,
    removeSchedule,
    toggleSchedule,
    startScheduler,
    stopScheduler
  };
})();
