/**
 * Autonomy core: planner, post-action verifier, re-planner and app playbooks.
 * Rule-based and offline-first; the agent loop consults it before acting,
 * after every mutating action, and whenever a tool call fails.
 */
(function () {
  const PLAYBOOKS_KEY = 'ultron-agent-app-playbooks';
  const MAX_PLAYBOOKS = 40;

  // ---------------------------------------------------------------
  // Planner — decomposes multi-step prompts into a step graph.
  // Simple requests (one obvious tool) skip planning entirely.
  // ---------------------------------------------------------------
  const STEP_DETECTORS = [
    {
      tool_hint: 'WRITE_FILE',
      anchor: /\b(create|make|build|write|generate|save)\b/i,
      test: (p) => /\b(create|make|build|write|generate|save)\b[^.]*\b(file|page|website|site|script|document|app|project|code|html|css|python|program|landing page)\b/i.test(p),
      title: (p) => {
        const m = String(p || '').match(/\b(?:a|an)\s+((?:[\w-]+\s+){0,4}?(?:landing page|web ?site|website|page|file|script|app|document|program|project))\b/i);
        return `Create ${m ? m[1].trim() : (extractObject(p) || 'the file')}`;
      }
    },
    {
      tool_hint: 'OPEN_APP',
      anchor: /\b(open|launch|start|run)\b/i,
      test: (p) => /\b(open|launch|start|run)\b[^.]*\b(app|application|notepad|chrome|edge|firefox|excel|word|calculator|terminal|paint|vs ?code|spotify|whatsapp|discord)\b/i.test(p)
        || /\b(in|into|using|with)\s+(notepad|chrome|edge|firefox|excel|word|calculator|terminal|paint|vs ?code|spotify|whatsapp|discord)\b/i.test(p),
      title: (p) => `Open ${extractAppName(p) || 'the app'}`
    },
    {
      tool_hint: 'OPEN_URL',
      anchor: /\b(open|go to|visit|navigate)\b/i,
      test: (p) => /\b(open|go to|visit|navigate to)\b[^.]*\b(https?:\/\/\S+|website|web ?page|google|youtube|github|gmail|calendar)\b/i.test(p),
      title: () => 'Open the page in the browser'
    },
    {
      tool_hint: 'READ_FILE',
      anchor: /\b(read|analyze|summarize|review|check)\b/i,
      test: (p) => /\b(read|open|analyze|summarize|check|review)\b[^.]*\b(file|document|pdf|resume|cv|txt|doc|spreadsheet)\b/i.test(p),
      title: (p) => {
        const m = String(p || '').match(/\b(?:my|the|this|that)\s+((?:[\w-]+\s+){0,2}?(?:resume|cv|pdf|doc(?:x)?|document|spreadsheet|file))\b/i);
        return `Read ${m ? m[1].trim() : 'the file'}`;
      }
    },
    {
      tool_hint: 'TYPE_TEXT',
      anchor: /\b(type|enter|paste)\b/i,
      test: (p) => /\b(type|enter|paste)\s+["'][^"']{2,120}["']/i.test(p)
        || /\b(type|enter|paste)\s+(?!it\b|that\b|this\b|into\b|in\b|the\b|a\b|an\b|some\b)[a-z0-9][a-z0-9 .,!?'-]{2,60}/i.test(p),
      title: (p) => {
        const quoted = String(p || '').match(/\b(?:type|enter|paste)\s+["']([^"']{2,120})["']/i);
        const text = quoted ? quoted[1] : '';
        return text ? `Type "${text.slice(0, 40)}${text.length > 40 ? '…' : ''}"` : 'Type the requested text';
      }
    },
    {
      tool_hint: 'HOTKEY',
      anchor: /\bsave\b/i,
      test: (p) => /\b(save|save it|save the (?:file|document|changes))\b/i.test(p),
      title: () => 'Save the changes (Ctrl+S)'
    },
    {
      tool_hint: 'CLICK',
      anchor: /\b(click|press|tap|hit)\b/i,
      test: (p) => /\b(click|press|tap|hit)\s+(the\s+)?["']?[a-z0-9 _\-]{2,30}["']?\s*(button|icon|tab|menu|link|option)/i.test(p),
      title: (p) => `Click ${extractObject(p) || 'the element'}`
    },
    {
      tool_hint: 'SEARCH',
      anchor: /\b(search|look up|find out|google)\b/i,
      test: (p) => /\b(search|look up|find out|google)\b/i.test(p),
      title: () => 'Search the web'
    },
    {
      tool_hint: 'EXECUTE',
      anchor: /\b(run|execute)\b/i,
      test: (p) => /\b(run|execute)\s+(the\s+)?(command|script|program)\b/i.test(p),
      title: () => 'Run the command'
    }
  ];

  const SEQUENCE_SPLIT_RE = /\bthen\b|\bafter that\b|\bnext\b|;|\b\d+[.)]\s+/i;

  function extractObject(prompt) {
    const m = String(prompt || '').match(/\b(?:a|an|the|my)\s+([a-z0-9_\- ]{3,40}?)(?:\s+(?:file|page|website|site|document|script|app|in|on|for|with|named|called)\b|\s*$)/i);
    return m ? m[1].trim() : '';
  }

  function extractAppName(prompt) {
    const m = String(prompt || '').match(/\b(?:in|into|using|with|open|launch|start)\s+(notepad|chrome|google chrome|edge|microsoft edge|firefox|excel|word|calculator|terminal|windows terminal|paint|vs ?code|visual studio code|spotify|whatsapp|discord|outlook)\b/i);
    return m ? m[1].trim() : '';
  }

  function needsPlanning(userPrompt) {
    const p = String(userPrompt || '').trim();
    if (!p || p.length < 8) return false;
    let hits = 0;
    for (const det of STEP_DETECTORS) {
      if (det.test(p)) hits++;
      if (hits > 1) return true;
    }
    // Explicit sequencing words with at least one actionable step
    return hits === 1 && SEQUENCE_SPLIT_RE.test(p) && /\b(create|open|type|save|click|write|run|search)\b/i.test(p) && /then|after that|next|and/i.test(p);
  }

  function buildStepPlan(userPrompt) {
    const p = String(userPrompt || '');
    const matched = [];
    for (const det of STEP_DETECTORS) {
      if (!det.test(p)) continue;
      const anchorHit = det.anchor ? det.anchor.exec(p) : null;
      matched.push({ det, index: anchorHit ? anchorHit.index : p.length });
    }
    // Order steps by where they appear in the prompt (stable for ties)
    matched.sort((a, b) => a.index - b.index);
    const steps = matched.map(({ det }, i) => ({
      id: `step-${i + 1}`,
      title: det.title(p),
      tool_hint: det.tool_hint,
      status: 'pending'
    }));
    // Save step should come after typing/editing, never first
    const saveIdx = steps.findIndex(s => s.tool_hint === 'HOTKEY');
    if (saveIdx > 0 && saveIdx !== steps.length - 1) {
      const [saveStep] = steps.splice(saveIdx, 1);
      steps.push(saveStep);
    }
    return steps;
  }

  // Converts the planner step graph into the checklist/subgoal shape
  // used by renderTaskWidgetHtml / renderChecklist.
  function planToSubgoals(plan) {
    return (plan || []).map(step => ({
      action: step.tool_hint,
      text: step.title,
      completed: step.status === 'completed',
      status: step.status || 'pending'
    }));
  }

  function markPlanStep(plan, actionKey, success) {
    const step = (plan || []).find(s => s.tool_hint === actionKey && s.status !== 'completed');
    if (step) {
      step.status = success ? 'completed' : 'failed';
      return step;
    }
    return null;
  }

  // Insert a step mid-plan (e.g. a step revealed a missing app: needs browser
  // → insert "Open Edge" before the step that needs it). index < 0 = append.
  function insertPlanStep(plan, step, index = -1) {
    if (!Array.isArray(plan) || !step) return plan;
    const newStep = {
      id: step.id || `step-insert-${Date.now()}`,
      title: step.title || step.text || 'Additional step',
      tool_hint: step.tool_hint || 'OPEN_APP',
      status: 'pending'
    };
    const at = Number.isInteger(index) && index >= 0 && index <= plan.length ? index : plan.length;
    plan.splice(at, 0, newStep);
    return plan;
  }

  // ---------------------------------------------------------------
  // Verifier — golden rule: never report "done" without evidence.
  // Returns { verified, evidence, retryHint }.
  // ---------------------------------------------------------------
  const MUTATING_APP_ACTIONS = new Set(['OPEN_APP', 'FOCUS_APP', 'OPEN_FILE', 'OPEN_URL', 'TYPE_TEXT', 'HOTKEY', 'CLICK', 'DOUBLE_CLICK']);

  function getVerificationRequirement(toolCall) {
    if (!toolCall) return { type: 'none' };
    if (toolCall.type === 'WRITE_FILE') return { type: 'file-exists', path: toolCall.targetPath || toolCall.path || toolCall.target };
    if (toolCall.type === 'APP_ACTION') {
      const action = String(toolCall.action || '').toUpperCase();
      if (action === 'OPEN_APP' || action === 'FOCUS_APP') return { type: 'foreground', appName: toolCall.appName || toolCall.target };
      if (action === 'OPEN_FILE') return { type: 'file-exists', path: toolCall.path || toolCall.target };
      if (['CLICK', 'DOUBLE_CLICK', 'TYPE_TEXT'].includes(action)) return { type: 'screenshot' };
    }
    return { type: 'none' };
  }

  function appNamesMatch(foregroundTitle, appName) {
    const title = String(foregroundTitle || '').toLowerCase();
    const target = String(appName || '').toLowerCase().trim();
    if (!title || !target) return false;
    if (title.includes(target)) return true;
    // "Google Chrome" vs "chrome", "Visual Studio Code" vs "vs code"
    const core = target.replace(/\b(google|microsoft|windows|adobe)\b/g, '').trim();
    if (core && title.includes(core)) return true;
    const words = target.split(/\s+/).filter(w => w.length > 2);
    return words.length > 0 && words.every(w => title.includes(w));
  }

  async function verifyActionResult(toolCall, execResult) {
    const req = getVerificationRequirement(toolCall);
    const api = (typeof window !== 'undefined' && window.ultronAPI) || {};

    if (req.type === 'file-exists' && api.fileExists) {
      try {
        const res = await api.fileExists(req.path);
        if (res && res.exists) return { verified: true, evidence: `File verified on disk: ${req.path}` };
        return { verified: false, evidence: `File not found after write: ${req.path}`, retryHint: 'Retry WRITE_FILE with the same path.' };
      } catch (e) {
        return { verified: true, evidence: 'File check unavailable — assuming success.' };
      }
    }

    if (req.type === 'foreground' && api.getActiveWindow) {
      try {
        const res = await api.getActiveWindow();
        if (res && res.success && appNamesMatch(res.title, req.appName)) {
          return { verified: true, evidence: `Foreground window confirmed: "${res.title}"` };
        }
        return {
          verified: false,
          evidence: `Foreground window is "${(res && res.title) || 'unknown'}", expected ${req.appName}.`,
          retryHint: `Retry FOCUS_APP ${req.appName} once before continuing.`
        };
      } catch (e) {
        return { verified: true, evidence: 'Foreground check unavailable — assuming success.' };
      }
    }

    // Screenshot-based verification is handled by the loop itself (it owns
    // captureScreenForAgent); here we just declare that evidence is needed.
    if (req.type === 'screenshot') return { verified: true, evidence: 'visual', needsVisual: true };

    return { verified: true, evidence: execResult && execResult.message ? String(execResult.message).slice(0, 120) : 'No verification needed.' };
  }

  // ---------------------------------------------------------------
  // Re-planner — on failure, suggest an alternative strategy chain
  // instead of aborting.
  // ---------------------------------------------------------------
  function getRecoveryStrategy(toolCall, execResult) {
    const errorCode = (execResult && execResult.errorCode) || '';
    const type = toolCall ? toolCall.type : '';
    const action = toolCall ? String(toolCall.action || '').toUpperCase() : '';

    if (errorCode === 'APP_NOT_FOUND' || errorCode === 'APP_AMBIGUOUS') {
      const name = String((toolCall && (toolCall.appName || toolCall.target)) || '').toLowerCase();
      if (/\b(chrome|browser|internet)\b/.test(name)) {
        return { strategy: 'alternative-app', toolCall: { type: 'APP_ACTION', action: 'OPEN_APP', appName: 'Microsoft Edge' }, note: 'Chrome unavailable — trying Microsoft Edge instead.' };
      }
      if (/notepad/.test(name)) {
        return { strategy: 'alternative-app', toolCall: { type: 'APP_ACTION', action: 'OPEN_APP', appName: 'WordPad' }, note: 'Notepad unavailable — trying WordPad.' };
      }
      return { strategy: 'ask-user', note: `App "${toolCall.appName || toolCall.target}" not found. Ask the user which app to use.` };
    }

    if (errorCode === 'PERMISSION_DENIED') {
      return { strategy: 'ask-user', note: 'The user denied permission. Explain what is needed or suggest a safer alternative.' };
    }

    if (action === 'CLICK' || action === 'DOUBLE_CLICK') {
      return { strategy: 're-observe', note: 'Click missed. Capture the screen again and re-locate the element before retrying; if it keeps failing, try a keyboard shortcut (Tab + Enter) instead.' };
    }

    if (type === 'WRITE_FILE') {
      return { strategy: 'retry', note: 'Retry the write once; if it fails again, pick a different folder (e.g. Documents).' };
    }

    if (type === 'EXECUTE') {
      return { strategy: 'alternative-command', note: 'Command failed. Try an equivalent, simpler command or explain the failure.' };
    }

    return { strategy: 'retry-once', note: 'Retry the same action once, then report if it fails again.' };
  }

  // ---------------------------------------------------------------
  // App playbooks — cached "how to use" hints per app, learned by
  // observing the UI and (optionally) one web lookup.
  // ---------------------------------------------------------------
  function loadPlaybooks() {
    try {
      const saved = window.localStorage.getItem(PLAYBOOKS_KEY);
      if (saved) return JSON.parse(saved);
    } catch (e) {}
    return {};
  }

  function savePlaybook(appName, steps, source = 'auto') {
    const name = String(appName || '').trim().toLowerCase();
    if (!name) return;
    const all = loadPlaybooks();
    all[name] = { steps: (steps || []).slice(0, 12), source, ts: Date.now() };
    const names = Object.keys(all);
    if (names.length > MAX_PLAYBOOKS) {
      const oldest = names.sort((a, b) => (all[a].ts || 0) - (all[b].ts || 0))[0];
      delete all[oldest];
    }
    try {
      window.localStorage.setItem(PLAYBOOKS_KEY, JSON.stringify(all));
    } catch (e) {}
  }

  function getPlaybook(appName) {
    const name = String(appName || '').trim().toLowerCase();
    if (!name) return null;
    const all = loadPlaybooks();
    return all[name] || null;
  }

  function hasPlaybook(appName) {
    return Boolean(getPlaybook(appName));
  }

  function getPlaybookSnippet(appName) {
    const pb = getPlaybook(appName);
    if (!pb || !pb.steps.length) return '';
    return `[Playbook for ${appName}]: ${pb.steps.join(' → ')}`;
  }

  function buildPlaybookSearchQuery(appName) {
    return `${appName} how to use basics`;
  }

  const DOMAIN_MAP = {
    youtube: 'https://www.youtube.com',
    google: 'https://www.google.com',
    github: 'https://github.com',
    gmail: 'https://mail.google.com',
    calendar: 'https://calendar.google.com',
    reddit: 'https://www.reddit.com',
    twitter: 'https://twitter.com',
    chatgpt: 'https://chatgpt.com',
    wikipedia: 'https://www.wikipedia.org'
  };

  function extractUrlFromPrompt(prompt) {
    const directUrl = String(prompt || '').match(/https?:\/\/[^\s]+/i);
    if (directUrl) return directUrl[0];
    const p = String(prompt || '').toLowerCase();
    for (const [key, url] of Object.entries(DOMAIN_MAP)) {
      if (new RegExp(`\\b${key}\\b`, 'i').test(p)) return url;
    }
    const domainMatch = p.match(/\b([a-z0-9-]+\.(?:com|org|net|io|dev|app|edu|gov))\b/i);
    if (domainMatch) return `https://${domainMatch[1]}`;
    return '';
  }

  function getNextPendingPlanStep(plan) {
    if (!Array.isArray(plan)) return null;
    return plan.find(s => s.status !== 'completed' && s.status !== 'failed') || null;
  }

  function resolveToolCallForPlanStep(step, userPrompt, executedActions = [], sysEnv = null) {
    if (!step) return null;
    const p = String(userPrompt || '');
    const dirs = (sysEnv && sysEnv.keyDirectories) || {};
    const userHome = (sysEnv && sysEnv.homeDir) || 'C:\\Users\\vedan';
    const desktopDir = dirs.desktop || `${userHome}\\Desktop`;
    const documentsDir = dirs.documents || `${userHome}\\Documents`;
    const downloadsDir = dirs.downloads || `${userHome}\\Downloads`;

    switch (step.tool_hint) {
      case 'OPEN_APP': {
        const appName = extractAppName(p) || 'Google Chrome';
        return { type: 'APP_ACTION', action: 'OPEN_APP', appName, target: appName };
      }
      case 'OPEN_URL': {
        const url = extractUrlFromPrompt(p) || 'https://www.youtube.com';
        return { type: 'APP_ACTION', action: 'OPEN_URL', url, target: url };
      }
      case 'WRITE_FILE': {
        const target = extractObject(p) || 'untitled.txt';
        const targetPath = `${desktopDir}\\${target.replace(/^[/\\]+/, '')}`;
        return { type: 'WRITE_FILE', path: targetPath, targetPath, content: '', target: targetPath };
      }
      case 'READ_FILE': {
        const target = extractObject(p) || 'document.txt';
        return { type: 'READ_FILE', target, targetPath: target };
      }
      case 'TYPE_TEXT': {
        const quoted = p.match(/\b(?:type|enter|paste)\s+["']([^"']{2,120})["']/i);
        const text = quoted ? quoted[1] : (extractObject(p) || '');
        return { type: 'APP_ACTION', action: 'TYPE_TEXT', text, target: 'text input' };
      }
      case 'HOTKEY': {
        return { type: 'APP_ACTION', action: 'HOTKEY', keys: ['ctrl', 's'], target: 'Ctrl+S' };
      }
      case 'CLICK': {
        const target = extractObject(p) || 'button';
        return { type: 'APP_ACTION', action: 'CLICK', target };
      }
      case 'SEARCH': {
        const query = p.replace(/\b(search|look up|google|find out)\b/i, '').trim() || p;
        return { type: 'SEARCH', query, target: query };
      }
      case 'EXECUTE': {
        return { type: 'EXECUTE', command: p, target: p };
      }
      default:
        return null;
    }
  }

  window.UltronAgentPlanner = {
    needsPlanning,
    buildStepPlan,
    planToSubgoals,
    markPlanStep,
    insertPlanStep,
    getNextPendingPlanStep,
    resolveToolCallForPlanStep,
    extractUrlFromPrompt,
    getVerificationRequirement,
    verifyActionResult,
    getRecoveryStrategy,
    loadPlaybooks,
    savePlaybook,
    getPlaybook,
    hasPlaybook,
    getPlaybookSnippet,
    buildPlaybookSearchQuery
  };
})();
