/**
 * App name aliases, fuzzy matching, and authorization helpers.
 */

const APP_ALIASES = {
  chrome: 'Google Chrome',
  'google chrome': 'Google Chrome',
  edge: 'Microsoft Edge',
  'microsoft edge': 'Microsoft Edge',
  firefox: 'Mozilla Firefox',
  vscode: 'Visual Studio Code',
  'visual studio code': 'Visual Studio Code',
  code: 'Visual Studio Code',
  notepad: 'Notepad',
  'notepad++': 'Notepad++',
  whatsapp: 'WhatsApp',
  telegram: 'Telegram',
  discord: 'Discord',
  spotify: 'Spotify',
  slack: 'Slack',
  zoom: 'Zoom',
  teams: 'Microsoft Teams',
  'microsoft teams': 'Microsoft Teams',
  word: 'Microsoft Word',
  excel: 'Microsoft Excel',
  powerpoint: 'Microsoft PowerPoint',
  outlook: 'Outlook',
  explorer: 'File Explorer',
  'file explorer': 'File Explorer',
  cmd: 'Command Prompt',
  'command prompt': 'Command Prompt',
  powershell: 'PowerShell',
  terminal: 'Windows Terminal',
  'windows terminal': 'Windows Terminal',
  calc: 'Calculator',
  calculator: 'Calculator',
  paint: 'Paint',
  obs: 'OBS Studio',
  'obs studio': 'OBS Studio',
  obsidian: 'Obsidian',
  'samsung browser': 'Samsung Internet',
  'samsung internet': 'Samsung Internet',
  brave: 'Brave',
  opera: 'Opera',
  python: 'Python',
  git: 'Git Bash',
  'git bash': 'Git Bash'
};

function normalizeAppQuery(value) {
  return String(value || '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s+]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function levenshtein(a, b) {
  const s = a || '';
  const t = b || '';
  if (s === t) return 0;
  if (!s.length) return t.length;
  if (!t.length) return s.length;
  const rows = s.length + 1;
  const cols = t.length + 1;
  const matrix = Array.from({ length: rows }, () => new Array(cols).fill(0));
  for (let i = 0; i < rows; i++) matrix[i][0] = i;
  for (let j = 0; j < cols; j++) matrix[0][j] = j;
  for (let i = 1; i < rows; i++) {
    for (let j = 1; j < cols; j++) {
      const cost = s[i - 1] === t[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost
      );
    }
  }
  return matrix[rows - 1][cols - 1];
}

function resolveAlias(query) {
  const normalized = normalizeAppQuery(query);
  if (!normalized) return null;
  if (APP_ALIASES[normalized]) return APP_ALIASES[normalized];

  const entries = Object.entries(APP_ALIASES).sort((a, b) => b[0].length - a[0].length);
  for (const [alias, target] of entries) {
    if (alias.length <= 3) {
      const re = new RegExp(`\\b${alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`);
      if (re.test(normalized)) return target;
    } else if (normalized === alias || normalized.includes(alias)) {
      return target;
    }
  }
  return null;
}

function rankAppCandidates(query, apps = []) {
  const normalized = normalizeAppQuery(query);
  const aliasTarget = resolveAlias(query);
  const results = [];

  for (const app of apps) {
    const name = app.name || app;
    const lower = String(name).toLowerCase();
    let score = 0;

    if (aliasTarget && lower === aliasTarget.toLowerCase()) score = 1000;
    else if (lower === normalized) score = 900;
    else if (aliasTarget && lower.includes(aliasTarget.toLowerCase())) score = 850;
    else if (lower.includes(normalized) && normalized.length >= 3) score = 700;
    else if (normalized.includes(lower) && lower.length >= 4) score = 650;
    else {
      const distance = levenshtein(normalized, lower);
      const threshold = Math.max(3, Math.floor(normalized.length * 0.45));
      if (distance <= threshold) score = 500 - distance * 20;
    }

    if (score > 0) results.push({ app, name, score });
  }

  return results.sort((a, b) => b.score - a.score);
}

function findBestAppMatch(query, apps = []) {
  const ranked = rankAppCandidates(query, apps);
  if (!ranked.length) return { match: null, suggestions: [] };
  const best = ranked[0];
  const second = ranked[1];
  const ambiguous = second && (best.score - second.score) < 80 && second.score > 400;
  return {
    match: best.score >= 400 ? best.app : null,
    suggestions: ranked.slice(0, 5).map(item => item.name),
    ambiguous,
    query: normalizeAppQuery(query)
  };
}

function getAuthorizedAppsMapFromStorage() {
  try {
    const saved = window.localStorage.getItem('ultron-authorized-apps-map');
    if (saved) return JSON.parse(saved);
  } catch (e) {}
  return null;
}

function isAppNameAuthorized(appName, resolvedName) {
  const map = getAuthorizedAppsMapFromStorage();
  if (!map) return true;

  const candidates = [appName, resolvedName].filter(Boolean);
  for (const candidate of candidates) {
    const lower = String(candidate).toLowerCase();
    for (const [key, allowed] of Object.entries(map)) {
      const keyLower = String(key).toLowerCase();
      const isMatch = keyLower === lower
        || (lower.length >= 3 && (keyLower.includes(lower) || lower.includes(keyLower)));
      if (isMatch) return allowed !== false;
    }
  }
  // Not explicitly listed — allow (matches main-process behavior)
  return true;
}

window.UltronAppRegistry = {
  APP_ALIASES,
  normalizeAppQuery,
  resolveAlias,
  rankAppCandidates,
  findBestAppMatch,
  isAppNameAuthorized,
  getAuthorizedAppsMapFromStorage
};
