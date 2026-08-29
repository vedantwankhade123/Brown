const { ipcMain, exec, app, shell, dialog, clipboard, desktopCapturer, screen } = require('electron');
const { exec: cpExec } = require('child_process');
const path = require('path');
const fs = require('fs');
const zlib = require('zlib');
const { pathToFileURL } = require('url');

async function extractTextFromPdfBuffer(buffer) {
  if (!buffer) return '';
  try {
    const uint8 = Buffer.isBuffer(buffer) ? new Uint8Array(buffer) : (buffer instanceof Uint8Array ? buffer : new Uint8Array(Buffer.from(buffer)));
    
    if (typeof globalThis.DOMMatrix === 'undefined') {
      globalThis.DOMMatrix = class DOMMatrix {
        constructor(init) {
          this.a = 1; this.b = 0; this.c = 0; this.d = 1; this.e = 0; this.f = 0;
          if (Array.isArray(init) && init.length >= 6) {
            [this.a, this.b, this.c, this.d, this.e, this.f] = init;
          }
        }
      };
    }
    if (typeof globalThis.ImageData === 'undefined') {
      globalThis.ImageData = class ImageData {
        constructor(width, height) {
          this.width = width || 0;
          this.height = height || 0;
          this.data = new Uint8ClampedArray((this.width * this.height * 4) || 0);
        }
      };
    }
    if (typeof globalThis.Path2D === 'undefined') {
      globalThis.Path2D = class Path2D {
        constructor() {}
        addPath() {}
        closePath() {}
        moveTo() {}
        lineTo() {}
        bezierCurveTo() {}
        quadraticCurveTo() {}
        arc() {}
        arcTo() {}
        ellipse() {}
        rect() {}
      };
    }

    // 1. Primary: Use standard Mozilla pdf.js parser via pdf-parse
    try {
      const pdfModule = require('pdf-parse');
      const PDFParse = pdfModule.PDFParse || (typeof pdfModule === 'function' ? pdfModule : null);
      if (PDFParse) {
        const origWarn = console.warn;
        const origError = console.error;
        try {
          console.warn = (...args) => {
            const msg = String(args[0] || '');
            if (msg.includes('standardFontDataUrl') || msg.includes('polyfill') || msg.includes('require')) return;
            origWarn.apply(console, args);
          };
          console.error = (...args) => {
            const msg = String(args[0] || '');
            if (msg.includes('standardFontDataUrl') || msg.includes('polyfill')) return;
            origError.apply(console, args);
          };
          if (typeof PDFParse === 'function' && !pdfModule.PDFParse) {
            const res = await PDFParse(Buffer.from(uint8));
            if (res && res.text && res.text.trim()) {
              return res.text
                .replace(/\r\n/g, '\n')
                .replace(/[ \t]+/g, ' ')
                .replace(/(\n{3,})/g, '\n\n')
                .trim();
            }
          } else {
            const parser = new PDFParse(uint8);
            const res = await parser.getText();
            if (res && res.text && res.text.trim()) {
              return res.text
                .replace(/\r\n/g, '\n')
                .replace(/[ \t]+/g, ' ')
                .replace(/(\n{3,})/g, '\n\n')
                .trim();
            }
          }
        } finally {
          console.warn = origWarn;
          console.error = origError;
        }
      }
    } catch (parseErr) {
      // Fall through to stream decompression
    }

    // 2. Secondary: Decompress Flate streams and extract BT...ET text blocks
    const rawBuffer = Buffer.isBuffer(buffer) ? buffer : Buffer.from(uint8);
    const pdfString = rawBuffer.toString('latin1');
    const textPieces = [];

    const streamRegex = /stream\r?\n([\s\S]*?)\r?\nendstream/g;
    let streamMatch;

    while ((streamMatch = streamRegex.exec(pdfString)) !== null) {
      const streamContent = streamMatch[1];
      let uncompressed = streamContent;

      try {
        const streamBuffer = Buffer.from(streamContent, 'latin1');
        uncompressed = zlib.inflateSync(streamBuffer).toString('latin1');
      } catch {
        try {
          const streamBuffer = Buffer.from(streamContent, 'latin1');
          uncompressed = zlib.inflateRawSync(streamBuffer).toString('latin1');
        } catch {
          uncompressed = streamContent;
        }
      }

      const btRegex = /BT[\s\S]*?ET/g;
      let btMatch;
      while ((btMatch = btRegex.exec(uncompressed)) !== null) {
        const block = btMatch[0];
        const tjRegex = /(?:\((.*?)\)\s*(?:Tj|'|"))|(?:\[(.*?)\]\s*TJ)/g;
        let tjMatch;
        while ((tjMatch = tjRegex.exec(block)) !== null) {
          if (tjMatch[1] !== undefined) {
            const cleanStr = cleanPdfString(tjMatch[1]);
            if (cleanStr.trim()) textPieces.push(cleanStr);
          } else if (tjMatch[2] !== undefined) {
            const arrayItems = tjMatch[2].match(/\((.*?)\)|<([0-9a-fA-F]+)>/g) || [];
            const arrayText = arrayItems.map(item => {
              if (item.startsWith('(')) {
                return cleanPdfString(item.slice(1, -1));
              } else if (item.startsWith('<')) {
                return decodeHexPdfString(item.slice(1, -1));
              }
              return '';
            }).join('');
            if (arrayText.trim()) textPieces.push(arrayText);
          }
        }
      }

      if (textPieces.length === 0) {
        const rawParens = uncompressed.match(/\(([^()]{2,})\)/g);
        if (rawParens) {
          rawParens.forEach(p => {
            const clean = cleanPdfString(p.slice(1, -1));
            if (clean.length > 1 && !/^\s+$/.test(clean) && /[aeiouyAEIOUY]/i.test(clean)) {
              textPieces.push(clean);
            }
          });
        }
      }
    }

    if (textPieces.length > 0) {
      return textPieces.join(' ')
        .replace(/\r\n/g, '\n')
        .replace(/[ \t]+/g, ' ')
        .replace(/(\n{3,})/g, '\n\n')
        .trim();
    }

    // 3. Fallback: Filter only meaningful natural language words
    const asciiWords = (pdfString.match(/[A-Za-z0-9,.:;!?'"()\-]{3,}/g) || [])
      .filter(w => !/^(obj|endobj|stream|endstream|xref|trailer|startxref|FlateDecode|Length|Filter|Type|Catalog|Pages|Root)$/i.test(w))
      .filter(w => /[aeiouyAEIOUY]/i.test(w));

    if (asciiWords.length > 10) {
      return asciiWords.join(' ').trim();
    }

    return 'Could not extract legible text from this PDF file.';
  } catch (err) {
    return `Error extracting PDF text: ${err.message}`;
  }
}

function cleanPdfString(str) {
  return str
    .replace(/\\([0-7]{1,3})/g, (_, oct) => String.fromCharCode(parseInt(oct, 8)))
    .replace(/\\n/g, '\n')
    .replace(/\\r/g, '\r')
    .replace(/\\t/g, '\t')
    .replace(/\\b/g, '\b')
    .replace(/\\f/g, '\f')
    .replace(/\\\(/g, '(')
    .replace(/\\\)/g, ')')
    .replace(/\\\\/g, '\\');
}

function decodeHexPdfString(hex) {
  try {
    return Buffer.from(hex, 'hex').toString('utf8');
  } catch {
    return '';
  }
}

const { verifyAndResolvePath, isPathBlacklisted, isCommandBlacklisted } = require('./security');
const { profileHardware, queryLocalOllamaModels, getModelRecommendation } = require('./hardware');
const { launchWindowsSandbox } = require('./sandbox');
const { findInstalledAppSmart } = require('./app-matching');
const { fetchWebPage } = require('./web-fetch');
const mcpManager = require('./mcp-manager');
const { searchHuggingFaceGgufModels, getModelQuantizations } = require('./huggingface-service');
const { getWindowsNativeLocation } = require('./windows-geolocation');
const { getUltronRuntimeRoot, getConnectorsRoot, getDefaultAgentDataDir, getStoragePathsSnapshot, updateAgentDataDir, updateConnectorsDir, getOllamaModelsDir, getOllamaInstallPath, provisionUltronFolderForOllama, ensureUltronStorageLayout } = require('./paths');

function loadUltronConfigFile() {
  try {
    const configPath = path.join(app.getPath('userData'), 'ultron-config.json');
    if (fs.existsSync(configPath)) {
      return JSON.parse(fs.readFileSync(configPath, 'utf8'));
    }
  } catch (e) { /* ignore */ }
  return {};
}

function saveUltronConfigPatch(patch) {
  const configPath = path.join(app.getPath('userData'), 'ultron-config.json');
  let config = loadUltronConfigFile();
  config = { ...config, ...patch };
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf8');
  return config;
}

function formatDownloadBytes(bytes) {
  if (!bytes || bytes <= 0) return '0 MB';
  const mb = bytes / (1024 * 1024);
  if (mb >= 1024) return `${(mb / 1024).toFixed(1)} GB`;
  return `${mb.toFixed(1)} MB`;
}

// Active security mode state
let activeSecurityMode = 'Adaptive'; // Default to Adaptive Auto Mode for smooth computer task execution
let pendingPermissions = new Map(); // Store pending human-in-the-loop validation promises

// Authorized apps allowlist, synced from renderer settings.
// null = never configured → all apps allowed (matches renderer default).
let authorizedAppsMap = null;

function isAppAuthorizedInMain(appName) {
  if (!authorizedAppsMap || !appName) return true;
  const entry = Object.keys(authorizedAppsMap).find(
    key => key.toLowerCase() === String(appName).toLowerCase()
  );
  return entry === undefined ? true : authorizedAppsMap[entry] !== false;
}

// Keep reference to the main window
let mainWindow = null;

let cachedGeoLocation = null;
let cachedGeoLocationAt = 0;
const GEO_LOCATION_TTL_MS = 30 * 60 * 1000;

async function resolveGeoLocation(options = {}) {
  const forceRefresh = Boolean(options.forceRefresh);
  if (!forceRefresh && cachedGeoLocation && Date.now() - cachedGeoLocationAt < GEO_LOCATION_TTL_MS) {
    return cachedGeoLocation;
  }

  // 1. Windows native GPS / Wi‑Fi location (most accurate when enabled)
  if (process.platform === 'win32') {
    try {
      const native = await getWindowsNativeLocation(runPowerShellScript);
      if (native && native.latitude != null) {
        cachedGeoLocation = native;
        cachedGeoLocationAt = Date.now();
        return cachedGeoLocation;
      }
    } catch (e) {
      // fall through to IP providers
    }
  }

  // 2. IP geolocation providers
  const providers = [
    {
      url: 'https://ipwho.is/',
      parse: (d) => (d && d.success) ? {
        city: d.city || '',
        region: d.region || '',
        country: d.country || '',
        countryCode: d.country_code || '',
        timezone: d.timezone ? d.timezone.id : '',
        latitude: d.latitude,
        longitude: d.longitude
      } : null
    },
    {
      url: 'https://ipinfo.io/json',
      parse: (d) => (d && (d.city || d.country)) ? {
        city: d.city || '',
        region: d.region || '',
        country: d.country || '',
        countryCode: d.country || '',
        timezone: d.timezone || '',
        latitude: d.loc ? parseFloat(d.loc.split(',')[0]) : null,
        longitude: d.loc ? parseFloat(d.loc.split(',')[1]) : null
      } : null
    },
    {
      url: 'https://freeipapi.com/api/json',
      parse: (d) => (d && (d.cityName || d.countryName)) ? {
        city: d.cityName || '',
        region: d.regionName || '',
        country: d.countryName || '',
        countryCode: d.countryCode || '',
        timezone: d.timeZone || '',
        latitude: d.latitude,
        longitude: d.longitude
      } : null
    },
    {
      url: 'http://ip-api.com/json/?fields=status,country,countryCode,regionName,city,timezone,lat,lon',
      parse: (d) => (d && d.status === 'success') ? {
        city: d.city || '',
        region: d.regionName || '',
        country: d.country || '',
        countryCode: d.countryCode || '',
        timezone: d.timezone || '',
        latitude: d.lat,
        longitude: d.lon
      } : null
    }
  ];

  for (const provider of providers) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 3500);
      const res = await fetch(provider.url, {
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' },
        signal: controller.signal
      });
      clearTimeout(timeout);

      if (res.ok) {
        const raw = await res.json();
        const parsed = provider.parse(raw);
        if (parsed) {
          cachedGeoLocation = parsed;
          cachedGeoLocationAt = Date.now();
          return cachedGeoLocation;
        }
      }
    } catch (e) {
      // Continue to next provider
    }
  }

  // OS System TimeZone & Locale Fallback
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || '';
    const parts = tz ? tz.split('/') : [];
    const cityFallback = parts.length > 1 ? parts[parts.length - 1].replace(/_/g, ' ') : '';
    const regionFallback = parts.length > 0 ? parts[0].replace(/_/g, ' ') : '';

    cachedGeoLocation = {
      city: cityFallback,
      region: regionFallback,
      country: '',
      countryCode: '',
      timezone: tz,
      latitude: null,
      longitude: null
    };
    cachedGeoLocationAt = Date.now();
    return cachedGeoLocation;
  } catch (err) {
    // Ignore error
  }

  return cachedGeoLocation || null;
}

function buildDateTimeSnapshot(now = new Date()) {
  const dayOfYear = Math.floor((now - new Date(now.getFullYear(), 0, 0)) / 86400000);
  const weekStart = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
  const dayNum = weekStart.getUTCDay() || 7;
  weekStart.setUTCDate(weekStart.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(weekStart.getUTCFullYear(), 0, 1));
  const isoWeek = Math.ceil((((weekStart - yearStart) / 86400000) + 1) / 7);

  return {
    iso: now.toISOString(),
    localDate: now.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }),
    localTime: now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', second: '2-digit', hour12: true }),
    utcTime: now.toUTCString(),
    dayOfWeek: now.toLocaleDateString('en-US', { weekday: 'long' }),
    month: now.toLocaleDateString('en-US', { month: 'long' }),
    year: now.getFullYear(),
    dayOfMonth: now.getDate(),
    dayOfYear,
    isoWeek,
    unixTimestamp: Math.floor(now.getTime() / 1000)
  };
}

function setMainWindow(win) {
  mainWindow = win;
}

function runPowerShellScript(script) {
  const encoded = Buffer.from(script, 'utf16le').toString('base64');
  return runCommandWithTimeout(`powershell -NoProfile -ExecutionPolicy Bypass -EncodedCommand ${encoded}`);
}

function escapePowerShellSingleQuoted(value) {
  return String(value || '').replace(/'/g, "''");
}

const JUNK_APP_NAME_RE = /\b(what('s| is) new|release notes?|readme|read me|documentation|user manual|quick start|getting started|welcome to|learn more|visit (our )?website|online help|tip of the day|eula|license agreement|privacy (policy|statement)|product information|how to use|tutorial|support center|customer service|release note|about this|overview|introduction|information|help topics?|view (the )?manual|software license|activation|register (your )?product|buy now|upgrade now|try premium|subscribe|newsletter|survey|feedback form)\b/i;

const EXCLUDED_APP_NAME_RE = /\b(developer command prompt|developer powershell|x\d{2,3} native tools|x\d{2,3} x64 native tools|x64 cross tools|x86 cross tools|remote debugger|performance profiler|blend for visual studio|vc[_\s-]?vars|vs[_\s-]?devcmd|application verifier|windows sdk|windows kit|debuggable package|fusion log viewer|ildasm|gacutil|ngen|spy\+\+|wfc|xsd|vcperf|installerprojects|clickonce|nuget package|sql server configuration|sql server installation|odbc data sources?\(\d+\)|odbcad32|iis express|hyper-v (quick|manager)|windows sandbox|steps recorder|problem steps|windows memory diagnostic|defragment|disk cleanup|resource monitor|system configuration|system information|computer management|event viewer|services\.msc|local security policy|windows powershell ise|powershell ise|debuggable|symbol settings|dumpchk|windbg|debug diagnostic|application compatibility|windows performance toolkit|windows assessment)\b/i;

const EXCLUDED_TARGET_PATH_RE = /\\Common7\\Tools\\|\\VC\\Auxiliary\\Build\\|\\Windows Kits\\|\\Team Tools\\|\\Microsoft Visual Studio\\20\d{2}\\.*\\(Team Tools|Common7\\Tools)\\|\\Program Files \(x86\)\\Microsoft Visual Studio\\|\\Windows\s*Performance\s*Toolkit\\|\\Windows\s*Assessment\s*and\s*Deployment\\|\\Microsoft\s*SDKs\\|\\SDK\s*Tools\\/i;

const ALLOWED_SYSTEM_APP_NAMES = new Set([
  'file explorer', 'notepad', 'calculator', 'paint', 'paint 3d', 'snipping tool',
  'powershell', 'windows powershell', 'command prompt', 'windows terminal',
  'settings', 'control panel', 'task manager', 'windows media player',
  'microsoft edge', 'wordpad', 'character map', 'remote desktop connection',
  'windows security', 'microsoft store', 'sticky notes', 'clock', 'photos',
  'camera', 'maps', 'mail', 'calendar', 'microsoft teams', 'xbox',
  'google chrome', 'visual studio code', 'whatsapp', 'telegram', 'obsidian',
  'notepad++', 'git bash', 'obs studio', 'python'
]);

const ALLOWED_SYSTEM_EXE_NAMES = new Set([
  'explorer', 'notepad', 'calc', 'mspaint', 'powershell', 'cmd', 'wt',
  'systemsettings', 'control', 'taskmgr', 'wordpad', 'charmap', 'mstsc',
  'chrome', 'msedge', 'code', 'whatsapp', 'telegram', 'obs64', 'obs32',
  'notepad++', 'git-bash', 'py', 'python', 'pythonw'
]);

const NON_APP_FOLDER_TOKENS = [
  'startup', 'maintenance', 'system tools', 'administrative tools',
  'desktop', 'documents', 'downloads', 'uninstall', 'accessories',
  'windows tools', 'startup folder', 'visual studio 20', 'windows kits',
  'windows sdk', 'debugging tools', 'diagnostics', 'accessibility'
];

function resolveAppTargetPath(appItemOrPath) {
  const rawPath = typeof appItemOrPath === 'string'
    ? appItemOrPath
    : appItemOrPath?.path;
  if (!rawPath) return '';
  let target = rawPath;
  if (target.toLowerCase().endsWith('.lnk')) {
    try {
      const shortcut = shell.readShortcutLink(target);
      if (shortcut && shortcut.target) target = shortcut.target;
    } catch (e) { /* ignore bad shortcuts */ }
  }
  return target;
}

function isObscureSystemUtility(name, targetPath) {
  const friendlyName = String(name || '').toLowerCase().trim();
  if (ALLOWED_SYSTEM_APP_NAMES.has(friendlyName)) return false;

  const normalized = String(targetPath || '').toLowerCase().replace(/\//g, '\\');
  if (!normalized.includes('\\windows\\system32\\') && !normalized.includes('\\windows\\syswow64\\')) {
    return false;
  }

  const exeBase = path.basename(normalized, path.extname(normalized)).toLowerCase();
  if (ALLOWED_SYSTEM_EXE_NAMES.has(exeBase)) return false;

  // Hide cryptic system utilities like dfrgui, cleanmgr, compmgmt, etc.
  if (/^[a-z][a-z0-9]{2,11}$/.test(friendlyName) && friendlyName === exeBase) {
    return true;
  }

  return !ALLOWED_SYSTEM_APP_NAMES.has(friendlyName);
}

function isLaunchableExecutable(targetPath) {
  if (!targetPath) return false;
  const ext = path.extname(targetPath).toLowerCase();
  if (['.exe', '.bat', '.cmd', '.com'].includes(ext)) {
    return fs.existsSync(targetPath);
  }
  if (targetPath.toLowerCase().includes('\\windowsapps\\')) {
    return fs.existsSync(targetPath);
  }
  return false;
}

function isDocumentOrLinkTarget(targetPath) {
  const ext = path.extname(String(targetPath || '')).toLowerCase();
  return ['.txt', '.html', '.htm', '.pdf', '.md', '.chm', '.url', '.doc', '.docx', '.rtf', '.xml', '.json', '.ini', '.log'].includes(ext);
}

function isRealApplication(appItem) {
  const name = String(appItem?.name || '').trim();
  if (!name || name.length < 2) return false;

  const lowerName = name.toLowerCase();
  if (JUNK_APP_NAME_RE.test(lowerName)) return false;
  if (EXCLUDED_APP_NAME_RE.test(lowerName)) return false;
  if (NON_APP_FOLDER_TOKENS.some(token => lowerName.includes(token))) return false;
  if (/^(help|support|readme|documentation|license|uninstall|repair|modify)$/i.test(lowerName)) return false;

  const rawPath = appItem.path;
  if (!rawPath || !fs.existsSync(rawPath)) return false;

  const target = resolveAppTargetPath(rawPath);
  if (isDocumentOrLinkTarget(target)) return false;
  if (EXCLUDED_TARGET_PATH_RE.test(String(target).replace(/\//g, '\\'))) return false;
  if (isObscureSystemUtility(name, target)) return false;

  if (rawPath.toLowerCase().endsWith('.lnk')) {
    return isLaunchableExecutable(target);
  }

  return isLaunchableExecutable(target);
}

function getBuiltInAppsList() {
  const localAppData = process.env.LOCALAPPDATA || path.join(process.env.USERPROFILE, 'AppData', 'Local');
  const appData = process.env.APPDATA || path.join(process.env.USERPROFILE, 'AppData', 'Roaming');
  return [
    { name: 'Google Chrome', path: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe' },
    { name: 'Google Chrome', path: 'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe' },
    { name: 'Microsoft Edge', path: 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe' },
    { name: 'Microsoft Edge', path: 'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe' },
    { name: 'Visual Studio Code', path: path.join(localAppData, 'Programs\\Microsoft VS Code\\Code.exe') },
    { name: 'Obsidian', path: path.join(localAppData, 'Obsidian\\Obsidian.exe') },
    { name: 'Git Bash', path: 'C:\\Program Files\\Git\\git-bash.exe' },
    { name: 'OBS Studio', path: 'C:\\Program Files\\obs-studio\\bin\\64bit\\obs64.exe' },
    { name: 'OBS Studio', path: 'C:\\Program Files (x86)\\obs-studio\\bin\\64bit\\obs64.exe' },
    { name: 'File Explorer', path: 'C:\\Windows\\explorer.exe' },
    { name: 'Notepad', path: 'C:\\Windows\\System32\\notepad.exe' },
    { name: 'Calculator', path: 'C:\\Windows\\System32\\calc.exe' },
    { name: 'Paint', path: 'C:\\Windows\\System32\\mspaint.exe' },
    { name: 'WhatsApp', path: path.join(localAppData, 'WhatsApp\\WhatsApp.exe') },
    { name: 'Telegram', path: path.join(appData, 'Telegram Desktop\\Telegram.exe') },
    { name: 'Notepad++', path: 'C:\\Program Files\\Notepad++\\notepad++.exe' },
    { name: 'Command Prompt', path: 'C:\\Windows\\System32\\cmd.exe' },
    { name: 'PowerShell', path: 'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe' },
    { name: 'Windows Terminal', path: path.join(localAppData, 'Microsoft\\WindowsApps\\wt.exe') },
    { name: 'Settings', path: 'C:\\Windows\\ImmersiveControlPanel\\SystemSettings.exe' },
    { name: 'Python', path: 'C:\\Windows\\py.exe' }
  ];
}

function scanStartMenuShortcuts(dir, depth = 0) {
  if (!fs.existsSync(dir) || depth > 2) return [];
  const list = [];
  try {
    const items = fs.readdirSync(dir);
    for (const item of items) {
      const fullPath = path.join(dir, item);
      try {
        const stat = fs.statSync(fullPath);
        if (stat.isDirectory()) {
          list.push(...scanStartMenuShortcuts(fullPath, depth + 1));
        } else if (item.toLowerCase().endsWith('.lnk')) {
          list.push({ name: item.replace(/\.lnk$/i, ''), path: fullPath });
        }
      } catch (e) { /* skip unreadable entries */ }
    }
  } catch (e) { /* skip unreadable dirs */ }
  return list;
}

function discoverInstalledApps() {
  const startMenuPath = 'C:\\ProgramData\\Microsoft\\Windows\\Start Menu\\Programs';
  const userStartMenuPath = path.join(
    process.env.APPDATA || path.join(process.env.USERPROFILE, 'AppData', 'Roaming'),
    'Microsoft\\Windows\\Start Menu\\Programs'
  );

  const seen = new Set();
  const mergedApps = [];

  for (const appItem of [
    ...getBuiltInAppsList(),
    ...scanStartMenuShortcuts(startMenuPath),
    ...scanStartMenuShortcuts(userStartMenuPath)
  ]) {
    const lowerName = appItem.name.toLowerCase();
    if (seen.has(lowerName)) continue;
    if (!isRealApplication(appItem)) continue;
    seen.add(lowerName);
    mergedApps.push(appItem);
  }

  return mergedApps.sort((a, b) => a.name.localeCompare(b.name));
}

function findInstalledApp(appName) {
  const result = findInstalledAppSmart(appName, discoverInstalledApps);
  return result.match || null;
}

function findInstalledAppResult(appName) {
  return findInstalledAppSmart(appName, discoverInstalledApps);
}

async function getInstalledAppIcon(appItem) {
  if (!appItem || !appItem.path) return '';
  try {
    let targetPath = appItem.path;
    if (targetPath.toLowerCase().endsWith('.lnk')) {
      try {
        const shortcut = shell.readShortcutLink(targetPath);
        if (shortcut && shortcut.target && fs.existsSync(shortcut.target)) {
          targetPath = shortcut.target;
        }
      } catch (e) {}
    }
    if (fs.existsSync(targetPath)) {
      const nativeImg = await app.getFileIcon(targetPath, { size: 'normal' });
      if (nativeImg && !nativeImg.isEmpty()) return nativeImg.toDataURL();
    }
    if (fs.existsSync(appItem.path)) {
      const shortcutImg = await app.getFileIcon(appItem.path, { size: 'normal' });
      if (shortcutImg && !shortcutImg.isEmpty()) return shortcutImg.toDataURL();
    }
  } catch (e) {}
  return '';
}

function inferAppPublisher(targetPath = '') {
  if (!targetPath) return 'Local';
  const pfMatch = targetPath.match(/Program Files(?: \(x86\))?\\([^\\]+)/i);
  if (pfMatch) return pfMatch[1];
  if (/\\Windows\\/i.test(targetPath)) return 'Microsoft';
  const localPrograms = targetPath.match(/AppData\\Local\\Programs\\([^\\]+)/i);
  if (localPrograms) return localPrograms[1];
  return 'Local';
}

function enrichInstalledApp(appItem) {
  const targetPath = resolveAppTargetPath(appItem);
  let sizeBytes = 0;
  let modifiedAt = null;

  try {
    const statPath = targetPath && fs.existsSync(targetPath) ? targetPath : appItem.path;
    if (statPath && fs.existsSync(statPath)) {
      const stat = fs.statSync(statPath);
      sizeBytes = stat.size || 0;
      modifiedAt = stat.mtime ? stat.mtime.toISOString() : null;
    }
  } catch (e) { /* ignore */ }

  return {
    name: appItem.name,
    path: appItem.path || '',
    targetPath,
    publisher: inferAppPublisher(targetPath || appItem.path || ''),
    sizeBytes,
    modifiedAt
  };
}

async function runMouseScript(bodyLines) {
  const script = [
    'Add-Type @"',
    'using System;',
    'using System.Runtime.InteropServices;',
    'public class WinMouse {',
    '  [DllImport("user32.dll")] public static extern bool SetCursorPos(int X, int Y);',
    '  [DllImport("user32.dll")] public static extern void mouse_event(int dwFlags, int dx, int dy, int cButtons, int dwExtraInfo);',
    '  public const int LEFTDOWN = 0x02;',
    '  public const int LEFTUP = 0x04;',
    '  public const int RIGHTDOWN = 0x08;',
    '  public const int RIGHTUP = 0x10;',
    '  public const int WHEEL = 0x0800;',
    '  public static void Move(int x, int y) { SetCursorPos(x, y); }',
    '  public static void Click(int x, int y) { SetCursorPos(x, y); mouse_event(LEFTDOWN, 0, 0, 0, 0); mouse_event(LEFTUP, 0, 0, 0, 0); }',
    '  public static void RightClick(int x, int y) { SetCursorPos(x, y); mouse_event(RIGHTDOWN, 0, 0, 0, 0); mouse_event(RIGHTUP, 0, 0, 0, 0); }',
    '  public static void DoubleClick(int x, int y) { SetCursorPos(x, y); mouse_event(LEFTDOWN, 0, 0, 0, 0); mouse_event(LEFTUP, 0, 0, 0, 0); System.Threading.Thread.Sleep(80); mouse_event(LEFTDOWN, 0, 0, 0, 0); mouse_event(LEFTUP, 0, 0, 0, 0); }',
    '  public static void Scroll(int delta) { mouse_event(WHEEL, 0, 0, delta, 0); }',
    '}',
    '"@',
    ...bodyLines
  ].join('\n');
  await runPowerShellScript(script);
}

function sendKeys(keys) {
  const safeKeys = escapePowerShellSingleQuoted(keys);
  return runPowerShellScript(`Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.SendKeys]::SendWait('${safeKeys}')`);
}

async function pasteTextIntoApp(appName) {
  const lookup = findInstalledAppResult(appName);
  const match = lookup.match;
  let processName = '';
  if (match && match.path) {
    let executablePath = match.path;
    if (executablePath.toLowerCase().endsWith('.lnk')) {
      try {
        const shortcut = shell.readShortcutLink(executablePath);
        if (shortcut && shortcut.target) executablePath = shortcut.target;
      } catch (e) {}
    }
    processName = path.basename(executablePath, path.extname(executablePath));
  }

  const safeAppName = escapePowerShellSingleQuoted(match ? match.name : appName);
  const safeProcessName = escapePowerShellSingleQuoted(processName);
  const script = `
Add-Type -AssemblyName System.Windows.Forms
Add-Type @"
using System;
using System.Runtime.InteropServices;
public class UltronFocus {
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint processId);
}
"@
$ws = New-Object -ComObject WScript.Shell
$target = $null
if ('${safeProcessName}') {
  $target = Get-Process -Name '${safeProcessName}' -ErrorAction SilentlyContinue |
    Where-Object { $_.MainWindowHandle -ne 0 } |
    Sort-Object StartTime -Descending |
    Select-Object -First 1
}
if ($target) {
  $activated = $ws.AppActivate($target.Id)
  [UltronFocus]::SetForegroundWindow($target.MainWindowHandle) | Out-Null
} else {
  $activated = $ws.AppActivate('${safeAppName}')
}
if (-not $activated) { throw 'Could not focus ${safeAppName} before typing.' }
Start-Sleep -Milliseconds 350
if ($target) {
  [uint32]$foregroundPid = 0
  [UltronFocus]::GetWindowThreadProcessId([UltronFocus]::GetForegroundWindow(), [ref]$foregroundPid) | Out-Null
  if ($foregroundPid -ne $target.Id) { throw 'Focus verification failed for ${safeAppName}.' }
}
[System.Windows.Forms.SendKeys]::SendWait('^v')
Start-Sleep -Milliseconds 250
Write-Output 'PASTE_VERIFIED'
`;
  const result = await runPowerShellScript(script);
  return {
    appName: match ? match.name : appName,
    verified: String(result.stdout || '').includes('PASTE_VERIFIED')
  };
}

async function getActiveWindowAppName() {
  try {
    const script = `
Add-Type @"
using System;
using System.Runtime.InteropServices;
using System.Text;
public class UltronWin {
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern int GetWindowText(IntPtr hWnd, StringBuilder text, int count);
}
"@
$h = [UltronWin]::GetForegroundWindow()
$sb = New-Object System.Text.StringBuilder 512
[void][UltronWin]::GetWindowText($h, $sb, 512)
$title = $sb.ToString()
if ($title) { Write-Output $title }
`;
    return String(await runPowerShellScript(script) || '').trim();
  } catch (e) {
    return '';
  }
}

const SENSITIVE_CAPTURE_RE = /password|sign.?in|login|bank|paypal|stripe|auth|2fa|otp|credential|bitwarden|lastpass|1password/i;

function isSensitiveCaptureLabel(label, neverCaptureApps = []) {
  const normalized = String(label || '').toLowerCase();
  if (SENSITIVE_CAPTURE_RE.test(normalized)) return true;
  return (Array.isArray(neverCaptureApps) ? neverCaptureApps : [])
    .some(appName => appName && normalized.includes(String(appName).trim().toLowerCase()));
}

async function captureDesktopImage(options = {}) {
  const primaryDisplay = screen.getPrimaryDisplay();
  const scaleFactor = primaryDisplay.scaleFactor || 1;
  const { width, height } = primaryDisplay.size;
  const maxWidth = Math.min(Math.round(width * scaleFactor), 1920);
  const maxHeight = Math.min(Math.round(height * scaleFactor), 1080);

  const sources = await desktopCapturer.getSources({
    types: ['screen'],
    thumbnailSize: { width: maxWidth, height: maxHeight }
  });

  if (!sources || sources.length === 0) {
    return { success: false, error: 'No screen sources available.' };
  }

  const displayId = String(primaryDisplay.id);
  const source = sources.find(item => item.display_id === displayId) || sources[0];
  if (!source || !source.thumbnail || source.thumbnail.isEmpty()) {
    return { success: false, error: 'Screen capture returned an empty image.' };
  }

  const size = source.thumbnail.getSize();
  let imgBuffer = null;
  let mimeType = 'image/jpeg';
  try {
    imgBuffer = source.thumbnail.toJPEG(75);
  } catch (_) {
    imgBuffer = source.thumbnail.toPNG();
    mimeType = 'image/png';
  }
  return {
    success: true,
    mimeType,
    data: imgBuffer.toString('base64'),
    width: size.width,
    height: size.height,
    sourceName: source.name || 'Primary Display',
    capturedAt: new Date().toISOString(),
    label: options.label || 'desktop'
  };
}

async function recognizeTextFromPng(pngBuffer) {
  const tempPath = path.join(app.getPath('temp'), `ultron-ocr-${Date.now()}-${Math.random().toString(16).slice(2)}.png`);
  fs.writeFileSync(tempPath, pngBuffer);
  const safePath = escapePowerShellSingleQuoted(tempPath);
  const script = `
Add-Type -AssemblyName System.Runtime.WindowsRuntime
$null = [Windows.Storage.StorageFile, Windows.Storage, ContentType = WindowsRuntime]
$null = [Windows.Storage.FileAccessMode, Windows.Storage, ContentType = WindowsRuntime]
$null = [Windows.Graphics.Imaging.BitmapDecoder, Windows.Graphics.Imaging, ContentType = WindowsRuntime]
$null = [Windows.Media.Ocr.OcrEngine, Windows.Foundation, ContentType = WindowsRuntime]

function Await-WinRT($operation, $resultType) {
  $method = [System.WindowsRuntimeSystemExtensions].GetMethods() |
    Where-Object { $_.Name -eq 'AsTask' -and $_.IsGenericMethod -and $_.GetParameters().Count -eq 1 } |
    Select-Object -First 1
  $task = $method.MakeGenericMethod($resultType).Invoke($null, @($operation))
  $task.Wait()
  return $task.Result
}

$file = Await-WinRT ([Windows.Storage.StorageFile]::GetFileFromPathAsync('${safePath}')) ([Windows.Storage.StorageFile])
$stream = Await-WinRT ($file.OpenAsync([Windows.Storage.FileAccessMode]::Read)) ([Windows.Storage.Streams.IRandomAccessStream])
$decoder = Await-WinRT ([Windows.Graphics.Imaging.BitmapDecoder]::CreateAsync($stream)) ([Windows.Graphics.Imaging.BitmapDecoder])
$bitmap = Await-WinRT ($decoder.GetSoftwareBitmapAsync()) ([Windows.Graphics.Imaging.SoftwareBitmap])
$engine = [Windows.Media.Ocr.OcrEngine]::TryCreateFromUserProfileLanguages()
if ($null -eq $engine) { throw 'Windows OCR is unavailable for the current language profile.' }
$result = Await-WinRT ($engine.RecognizeAsync($bitmap)) ([Windows.Media.Ocr.OcrResult])
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
Write-Output $result.Text
$stream.Dispose()
$bitmap.Dispose()
`;
  try {
    const result = await runPowerShellScript(script);
    return String(result.stdout || '').trim();
  } finally {
    try { fs.unlinkSync(tempPath); } catch (e) {}
  }
}

async function captureWindowImage(windowTitle = '') {
  const query = String(windowTitle || '').trim().toLowerCase();
  const sources = await desktopCapturer.getSources({
    types: ['window'],
    thumbnailSize: { width: 1280, height: 720 }
  });

  if (!sources || sources.length === 0) {
    return { success: false, error: 'No window sources available.' };
  }

  let source = sources[0];
  if (query) {
    source = sources.find(item => item.name && item.name.toLowerCase().includes(query)) || source;
  }

  if (!source.thumbnail || source.thumbnail.isEmpty()) {
    return { success: false, error: 'Window capture returned an empty image.' };
  }

  const size = source.thumbnail.getSize();
  let imgBuffer = null;
  let mimeType = 'image/jpeg';
  try {
    imgBuffer = source.thumbnail.toJPEG(75);
  } catch (_) {
    imgBuffer = source.thumbnail.toPNG();
    mimeType = 'image/png';
  }
  return {
    success: true,
    mimeType,
    data: imgBuffer.toString('base64'),
    width: size.width,
    height: size.height,
    sourceName: source.name || 'Window',
    capturedAt: new Date().toISOString(),
    label: query || 'window'
  };
}

function hotkeyToSendKeys(keys) {
  const parts = String(keys || '').toLowerCase().split(/[+\s]+/).filter(Boolean);
  const key = parts.pop() || '';
  const modifiers = parts.map(part => {
    if (part === 'ctrl' || part === 'control') return '^';
    if (part === 'alt') return '%';
    if (part === 'shift') return '+';
    return '';
  }).join('');
  const named = {
    enter: '{ENTER}',
    tab: '{TAB}',
    escape: '{ESC}',
    esc: '{ESC}',
    backspace: '{BACKSPACE}',
    delete: '{DELETE}',
    del: '{DELETE}',
    space: ' ',
    up: '{UP}',
    down: '{DOWN}',
    left: '{LEFT}',
    right: '{RIGHT}'
  };
  const normalizedKey = named[key] || (key.length === 1 ? key : `{${key.toUpperCase()}}`);
  return `${modifiers}${normalizedKey}`;
}

/**
 * Helper to execute terminal commands with an AbortController timeout.
 * Capped at 300 seconds to prevent resource exhaustion.
 * 
 * @param {string} command - Command to run.
 * @param {object} options - Execution options.
 * @returns {Promise<{stdout: string, stderr: string}>}
 */
function runCommandWithTimeout(command, options = {}) {
  return new Promise((resolve, reject) => {
    const controller = new AbortController();
    const { signal } = controller;
    
    const timeout = setTimeout(() => {
      controller.abort();
      reject(new Error('Execution Timeout: Terminal command execution exceeded the 300 second threshold.'));
    }, 300 * 1000); // 300 seconds

    const child = cpExec(command, { windowsHide: true, ...options, signal }, (error, stdout, stderr) => {
      clearTimeout(timeout);
      if (error) {
        if (error.name === 'AbortError') {
          reject(new Error('Execution Timeout: Capped at 300s.'));
        } else {
          reject(error);
        }
      } else {
        resolve({ stdout: stdout.trim(), stderr: stderr.trim() });
      }
    });
  });
}

/**
 * Voice STT + neural TTS IPC — registered first so mic/TTS work even if later setup throws.
 */
function registerAudioIpcHandlers() {
  if (registerAudioIpcHandlers._done) return;
  registerAudioIpcHandlers._done = true;

  // Warm up the local Whisper model in the background so the first
  // transcription doesn't pay the model-load cost.
  setImmediate(() => {
    try {
      require('./voice-whisper').warmupWhisper().catch((e) => {
        console.warn('[ipc] Whisper warmup notice:', e.message);
      });
    } catch (e) {
      console.warn('[ipc] Whisper warmup init notice:', e.message);
    }
  });


  ipcMain.handle('transcribe-audio', async (_event, payload = {}) => {
    try {
      const culture = String(payload.culture || '').trim() || undefined;
      const { transcribeWhisperFloat32, transcribeWhisperWavBuffer } = require('./voice-whisper');
      const { transcribeAudioWavBase64, transcribeAudioFloat32 } = require('./voice-stt');

      const samples = payload.samples || payload.audio || [];
      const hasSamples = Array.isArray(samples) && samples.length > 800;
      const sampleRate = Number(payload.sampleRate) || 16000;

      // 1) Local Whisper engine first — the neural model is far more accurate
      // than the built-in Windows dictation, which mishears short phrases.
      // Loads on demand (and is warmed up at startup), so it never needs a
      // readiness gate here.
      try {
        if (payload.wavBase64) {
          const whisperRes = await transcribeWhisperWavBuffer(Buffer.from(payload.wavBase64, 'base64'));
          if (whisperRes?.success && whisperRes?.text) return whisperRes;
        } else if (hasSamples) {
          const whisperRes = await transcribeWhisperFloat32(Float32Array.from(samples), sampleRate);
          if (whisperRes?.success && whisperRes?.text) return whisperRes;
        }
      } catch (wErr) {
        console.warn('[ipc] Whisper transcribe notice:', wErr.message);
      }

      // 2) Built-in Windows speech engine as fallback.
      let windowsResult = null;
      if (payload.wavBase64) {
        windowsResult = await transcribeAudioWavBase64(payload.wavBase64, culture);
        if (windowsResult?.success && windowsResult?.text) return windowsResult;
      } else if (hasSamples) {
        windowsResult = await transcribeAudioFloat32(samples, sampleRate, culture);
        if (windowsResult?.text) return windowsResult;
      }

      return windowsResult || { success: false, error: 'No speech detected in the recording.' };
    } catch (err) {
      console.error('[ipc] transcribe-audio error:', err);
      return { success: false, error: err.message || 'Transcription failed.' };
    }
  });

  ipcMain.handle('voice-stt-live:start', async (event, payload = {}) => {
    try {
      const { startLiveStt } = require('./voice-stt-live');
      const culture = String(payload.culture || '').trim() || 'en-US';
      const sender = event.sender;
      return await startLiveStt(culture, (text) => {
        if (sender && !sender.isDestroyed()) {
          sender.send('voice-stt-live:partial', { text });
        }
      });
    } catch (err) {
      console.error('[ipc] voice-stt-live:start error:', err);
      return { success: false, code: 'unavailable', error: err.message || 'Live speech failed to start.' };
    }
  });

  ipcMain.handle('voice-stt-live:stop', async () => {
    try {
      const { stopLiveStt } = require('./voice-stt-live');
      return await stopLiveStt();
    } catch (err) {
      console.error('[ipc] voice-stt-live:stop error:', err);
      return { success: true, text: '' };
    }
  });

  ipcMain.handle('get-voice-model-status', async () => {
    try {
      const { refreshVoiceModelAvailability } = require('./voice-stt');
      return await refreshVoiceModelAvailability();
    } catch (err) {
      const onWindows = process.platform === 'win32';
      return {
        installed: onWindows,
        available: onWindows,
        builtIn: onWindows,
        noDownloadRequired: onWindows,
        engine: onWindows ? 'windows-speech' : 'unavailable',
        error: err.message
      };
    }
  });

  ipcMain.handle('download-voice-model', async (event) => {
    try {
      const { downloadVoiceModel, VOICE_MODEL_KEY } = require('./voice-stt');
      const sendProgress = (data) => {
        if (event.sender && !event.sender.isDestroyed()) {
          event.sender.send('download-progress', {
            modelName: VOICE_MODEL_KEY,
            percent: data.percent ?? 0,
            downloaded: data.downloaded || '',
            total: data.total || '',
            speed: data.speed || '',
            phase: data.phase || 'download',
            status: data.status || ''
          });
        }
      };
      return await downloadVoiceModel(sendProgress);
    } catch (err) {
      console.error('[ipc] download-voice-model error:', err);
      return { success: false, error: err.message || 'Voice model download failed.' };
    }
  });

  ipcMain.handle('cancel-voice-model-download', async () => {
    const { cancelVoiceModelDownload } = require('./voice-stt');
    return cancelVoiceModelDownload();
  });

  ipcMain.handle('delete-voice-model', async () => {
    const { deleteVoiceModel } = require('./voice-stt');
    return deleteVoiceModel();
  });

  ipcMain.handle('get-tts-catalog', async () => {
    try {
      const { getTtsCatalog } = require('./voice-tts');
      return { success: true, models: getTtsCatalog() };
    } catch (err) {
      return { success: false, error: err.message, models: [] };
    }
  });

  ipcMain.handle('get-tts-model-status', async (_event, modelKey) => {
    try {
      const { getTtsModelStatus } = require('./voice-tts');
      return getTtsModelStatus(modelKey);
    } catch (err) {
      return { installed: false, error: err.message };
    }
  });

  ipcMain.handle('get-active-tts-model', async () => {
    try {
      const { getActiveTtsModelKey } = require('./voice-tts');
      return { success: true, modelKey: getActiveTtsModelKey() };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('set-active-tts-model', async (_event, modelKey) => {
    try {
      const { setActiveTtsModelKey } = require('./voice-tts');
      return setActiveTtsModelKey(modelKey);
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('synthesize-speech', async (_event, payload = {}) => {
    try {
      const { synthesizeSpeech, synthesizeWithModel } = require('./voice-tts');
      const text = String(payload.text || payload.content || '');
      const modelKey = payload.modelKey || null;
      const apiKey = String(payload.apiKey || payload.geminiApiKey || '').trim();
      if (modelKey) return await synthesizeWithModel(modelKey, text, { apiKey });
      return await synthesizeSpeech(text, undefined, { apiKey });
    } catch (err) {
      console.error('[ipc] synthesize-speech error:', err);
      return { success: false, error: err.message || 'Speech synthesis failed.' };
    }
  });

  ipcMain.handle('download-tts-model', async (event, modelKey) => {
    try {
      const { downloadTtsModel } = require('./voice-tts');
      const key = modelKey || 'mms-eng';
      const sendProgress = (data) => {
        if (event.sender && !event.sender.isDestroyed()) {
          event.sender.send('download-progress', {
            modelName: data.modelName || `tts-${key}`,
            modelKey: data.modelKey || key,
            percent: data.percent ?? 0,
            downloaded: data.downloaded || '',
            total: data.total || '',
            speed: data.speed || '',
            phase: data.phase || 'download',
            status: data.status || ''
          });
        }
      };
      return await downloadTtsModel(key, sendProgress);
    } catch (err) {
      console.error('[ipc] download-tts-model error:', err);
      return { success: false, error: err.message || 'Neural voice download failed.' };
    }
  });

  ipcMain.handle('cancel-tts-model-download', async (_event, modelKey) => {
    const { cancelTtsModelDownload } = require('./voice-tts');
    return cancelTtsModelDownload(modelKey || null);
  });

  ipcMain.handle('delete-tts-model', async (_event, modelKey) => {
    const { deleteTtsModel } = require('./voice-tts');
    return deleteTtsModel(modelKey || undefined);
  });

  ipcMain.handle('warmup-tts-model', async (_event, modelKey) => {
    try {
      const { warmupTtsEngine } = require('./voice-tts');
      return await warmupTtsEngine(modelKey || undefined);
    } catch (err) {
      return { success: false, error: err.message || 'TTS warmup failed.' };
    }
  });

  console.log('[ipc] Audio handlers registered (STT + TTS).');
}

/**
 * Setup IPC handlers for the main Electron process.
 */
function setupIpcHandlers() {
  registerAudioIpcHandlers();
  // Proactively pre-fetch device location in background as soon as main process starts
  resolveGeoLocation().catch(() => {});

  ipcMain.handle('refresh-geo-location', async () => {
    cachedGeoLocation = null;
    cachedGeoLocationAt = 0;
    const geoLocation = await resolveGeoLocation({ forceRefresh: true });
    return { success: Boolean(geoLocation), geoLocation };
  });

  // System Hardware Profiling
  ipcMain.handle('profile-system', async () => {
    try {
      const stats = await profileHardware();
      const recommendation = getModelRecommendation(stats.totalRamGB);
      const installedModels = await queryLocalOllamaModels();
      
      return {
        success: true,
        stats,
        recommendation,
        installedModels
      };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  // System Environment Scanner — provides the AI agent full context about the user's computer
  ipcMain.handle('system-environment', async () => {
    const os = require('os');
    const now = new Date();
    const info = {
      platform: os.platform(),
      osVersion: os.release(),
      arch: os.arch(),
      hostname: os.hostname(),
      username: os.userInfo().username,
      homeDir: os.homedir(),
      tempDir: os.tmpdir(),
      locale: Intl.DateTimeFormat().resolvedOptions().locale || 'en-US',
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'Local',
      utcOffsetMinutes: -now.getTimezoneOffset(),
      dateTime: buildDateTimeSnapshot(now),
      totalMemoryGB: (os.totalmem() / (1024 ** 3)).toFixed(1),
      freeMemoryGB: (os.freemem() / (1024 ** 3)).toFixed(1),
      cpuCores: os.cpus().length,
      cpuModel: os.cpus()[0] ? os.cpus()[0].model : 'Unknown',
      drives: [],
      keyDirectories: {},
      region: {},
      geoLocation: null
    };

    try {
      const hardware = await profileHardware();
      info.hardware = hardware;
      info.gpus = hardware.gpus || [];
      info.gpuDetails = hardware.gpuDetails || [];
      info.hasDedicatedGpu = Boolean(hardware.hasDedicatedGpu);
      info.dedicatedGpu = hardware.dedicatedGpu || null;
    } catch (e) {
      info.hardware = null;
      info.gpus = [];
      info.gpuDetails = [];
      info.hasDedicatedGpu = false;
      info.dedicatedGpu = null;
    }

    try {
      const regionRaw = await new Promise((resolve, reject) => {
        cpExec(
          'powershell -NoProfile -Command "[System.Globalization.RegionInfo]::CurrentRegion | ConvertTo-Json -Compress"',
          { windowsHide: true },
          (err, stdout) => {
            if (err) reject(err);
            else resolve(stdout);
          }
        );
      });
      const region = JSON.parse(String(regionRaw || '').trim());
      info.region = {
        country: region.EnglishName || region.NativeName || '',
        countryCode: region.TwoLetterISORegionName || region.Name || '',
        currency: region.ISOCurrencySymbol || ''
      };
    } catch (e) {
      info.region = { country: '', countryCode: '', currency: '' };
    }

    info.geoLocation = await resolveGeoLocation();

    // Ensure country from Windows Region info if IP Geo is missing country
    if (info.geoLocation && info.region) {
      if (!info.geoLocation.country && info.region.country) {
        info.geoLocation.country = info.region.country;
        info.geoLocation.countryCode = info.region.countryCode;
      }
    }

    // Discover drives (Windows)
    try {
      const drivesRaw = await new Promise((resolve, reject) => {
        cpExec('wmic logicaldisk get name,size,freespace,description /format:csv', { windowsHide: true }, (err, stdout) => {
          if (err) reject(err);
          else resolve(stdout);
        });
      });
      const lines = drivesRaw.split('\n').filter(l => l.trim() && l.includes(','));
      for (const line of lines.slice(1)) {
        const parts = line.split(',').map(p => p.trim());
        if (parts.length >= 4 && parts[3]) {
          info.drives.push({
            letter: parts[3],
            description: parts[1] || 'Local Disk',
            totalGB: parts[4] ? (parseInt(parts[4]) / (1024 ** 3)).toFixed(1) : 'N/A',
            freeGB: parts[2] ? (parseInt(parts[2]) / (1024 ** 3)).toFixed(1) : 'N/A'
          });
        }
      }
    } catch (e) {
      // Fallback: just report C:
      info.drives.push({ letter: 'C:', description: 'Local Disk', totalGB: 'N/A', freeGB: 'N/A' });
    }

    // Map key directories
    const userHome = os.homedir();
    info.keyDirectories = {
      desktop: path.join(userHome, 'Desktop'),
      documents: path.join(userHome, 'Documents'),
      downloads: path.join(userHome, 'Downloads'),
      pictures: path.join(userHome, 'Pictures'),
      videos: path.join(userHome, 'Videos'),
      music: path.join(userHome, 'Music'),
      appData: process.env.APPDATA || path.join(userHome, 'AppData', 'Roaming'),
      programFiles: process.env['ProgramFiles'] || 'C:\\Program Files',
      programFilesX86: process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)'
    };

    return info;
  });

  // Settings & Security Mode management
  ipcMain.handle('get-security-mode', () => activeSecurityMode);
  ipcMain.handle('set-security-mode', (event, mode) => {
    if (['Review', 'Containment', 'Adaptive', 'Trusted'].includes(mode)) {
      activeSecurityMode = mode;
      return { success: true, mode: activeSecurityMode };
    }
    return { success: false, error: 'Invalid security mode' };
  });

  // Authorized apps allowlist sync (renderer settings → main enforcement)
  ipcMain.handle('set-authorized-apps', (event, map) => {
    authorizedAppsMap = (map && typeof map === 'object') ? map : null;
    return { success: true, count: authorizedAppsMap ? Object.keys(authorizedAppsMap).length : 0 };
  });

  // Sandbox Launcher Hook
  ipcMain.handle('launch-sandbox', async (event, hostPath) => {
    try {
      const activeDataDir = process.env.ULTRON_DATA_DIR || getDefaultAgentDataDir();
      const localAgentTemp = path.join(activeDataDir, 'temp');
      if (!fs.existsSync(localAgentTemp)) {
        fs.mkdirSync(localAgentTemp, { recursive: true });
      }
      
      const safeHostPath = verifyAndResolvePath(hostPath, true);
      const result = await launchWindowsSandbox(safeHostPath, localAgentTemp);
      return { success: true, message: result };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  // Get Installed Apps list — real launchable apps only (no readme/docs shortcuts)
  ipcMain.handle('get-installed-apps', async () => {
    try {
      const mergedApps = discoverInstalledApps();

      const results = await Promise.all(
        mergedApps.map(async (appItem) => {
          const enriched = enrichInstalledApp(appItem);
          const iconDataUrl = await getInstalledAppIcon(appItem);
          return { ...enriched, icon: iconDataUrl };
        })
      );

      return { success: true, apps: results };
    } catch (err) {
      return { success: false, error: err.message, apps: [] };
    }
  });

  // Resolve installed app with fuzzy matching + suggestions
  ipcMain.handle('resolve-app-name', async (event, appName) => {
    try {
      const result = findInstalledAppResult(appName);
      const icon = result.match ? await getInstalledAppIcon(result.match) : '';
      return {
        success: true,
        match: result.match ? { name: result.match.name, icon } : null,
        suggestions: result.suggestions || [],
        ambiguous: Boolean(result.ambiguous),
        alias: result.alias || null,
        query: result.query || ''
      };
    } catch (err) {
      return { success: false, error: err.message, suggestions: [] };
    }
  });

  // Capture desktop or window screenshot for agent screen understanding
  ipcMain.handle('capture-screen', async (event, payload = {}) => {
    try {
      const mode = String(payload.mode || payload.target || 'screen').toLowerCase();
      const windowLabel = payload.windowTitle || payload.appName || '';
      if (isSensitiveCaptureLabel(windowLabel, payload.neverCaptureApps)) {
        return { success: false, error: 'Screen capture blocked for sensitive window (login/banking/auth).' };
      }
      if (mode === 'window' && (payload.windowTitle || payload.appName)) {
        return await captureWindowImage(payload.windowTitle || payload.appName);
      }
      return await captureDesktopImage({ label: payload.label || 'desktop' });
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  // Windows OCR fallback lets text-only models inspect visible screen text.
  ipcMain.handle('ocr-screen', async (event, payload = {}) => {
    try {
      const windowLabel = payload.windowTitle || payload.appName || '';
      if (isSensitiveCaptureLabel(windowLabel, payload.neverCaptureApps)) {
        return { success: false, error: 'OCR blocked for sensitive window (login/banking/auth).' };
      }
      const shot = payload.mode === 'window' && windowLabel
        ? await captureWindowImage(windowLabel)
        : await captureDesktopImage({ label: payload.label || 'ocr' });
      if (!shot.success || !shot.data) return shot;
      const text = await recognizeTextFromPng(Buffer.from(shot.data, 'base64'));
      return {
        success: true,
        text,
        width: shot.width,
        height: shot.height,
        sourceName: shot.sourceName,
        thumbnailDataUrl: `data:${shot.mimeType || 'image/png'};base64,${shot.data}`
      };
    } catch (err) {
      return { success: false, error: `Windows OCR failed: ${err.message}` };
    }
  });

  // Desktop app control entry point for the agent loop
  ipcMain.handle('app-action', async (event, payload = {}) => {
    try {
      const action = String(payload.action || '').toUpperCase();

      if (action === 'LIST_APPS') {
        return {
          success: true,
          apps: discoverInstalledApps().map(item => ({ name: item.name }))
        };
      }

      if (action === 'OPEN_APP') {
        const lookup = findInstalledAppResult(payload.appName || payload.target);
        const match = lookup.match;
        if (!match) {
          const suggestionText = lookup.suggestions && lookup.suggestions.length
            ? ` Did you mean: ${lookup.suggestions.join(', ')}?`
            : '';
          return {
            success: false,
            error: `App not found: ${payload.appName || payload.target || 'unknown'}.${suggestionText}`,
            suggestions: lookup.suggestions || [],
            ambiguous: lookup.ambiguous
          };
        }
        if (!isAppAuthorizedInMain(match.name)) {
          return {
            success: false,
            error: `"${match.name}" is not in your authorized apps list. Enable it in Settings → Applications.`,
            errorCode: 'APP_NOT_AUTHORIZED'
          };
        }
        const icon = await getInstalledAppIcon(match);
        const launchError = await shell.openPath(match.path);
        if (launchError) return { success: false, error: launchError };
        return { success: true, message: `Opened ${match.name}`, app: match.name, resolvedApp: match.name, appIcon: icon };
      }

      if (action === 'FOCUS_APP') {
        const lookup = findInstalledAppResult(payload.appName || payload.target);
        const appName = lookup.match ? lookup.match.name : (payload.appName || payload.target);
        if (!appName) return { success: false, error: 'No app name provided.' };
        if (!isAppAuthorizedInMain(appName)) {
          return {
            success: false,
            error: `"${appName}" is not in your authorized apps list. Enable it in Settings → Applications.`,
            errorCode: 'APP_NOT_AUTHORIZED'
          };
        }
        await runPowerShellScript(`$ws = New-Object -ComObject WScript.Shell; $ok = $ws.AppActivate('${escapePowerShellSingleQuoted(appName)}'); if (-not $ok) { exit 2 }`);
        const icon = lookup.match ? await getInstalledAppIcon(lookup.match) : '';
        return { success: true, message: `Focused ${appName}`, app: appName, resolvedApp: appName, appIcon: icon };
      }

      if (action === 'OPEN_URL') {
        let url = String(payload.url || payload.target || '').trim();
        if (!url) return { success: false, error: 'No URL provided.' };
        if (!/^https?:\/\//i.test(url)) {
          if (/^(youtube|google|github|reddit|twitter|x|facebook|instagram|linkedin|chatgpt|wikipedia)$/i.test(url)) {
            url = `https://www.${url.toLowerCase()}.com`;
          } else if (/^[a-zA-Z0-9-]+\.[a-zA-Z]{2,}/.test(url)) {
            url = `https://${url}`;
          } else {
            url = `https://www.google.com/search?q=${encodeURIComponent(url)}`;
          }
        }
        await shell.openExternal(url);
        return { success: true, message: `Opened ${url}` };
      }

      if (action === 'OPEN_FILE') {
        const targetPath = String(payload.path || payload.target || '').trim();
        if (!targetPath) return { success: false, error: 'No file path provided.' };
        const resolvedPath = path.resolve(targetPath);
        if (isPathBlacklisted(resolvedPath)) {
          return { success: false, error: `Access Denied: Path "${resolvedPath}" is restricted by safety policy.` };
        }
        if (!fs.existsSync(resolvedPath)) {
          return { success: false, error: `File not found: ${resolvedPath}` };
        }
        const openError = await shell.openPath(resolvedPath);
        if (openError) return { success: false, error: openError };
        return { success: true, message: `Opened ${resolvedPath}` };
      }

      if (action === 'TYPE_TEXT') {
        const text = String(payload.text || payload.target || '');
        if (!text) return { success: false, error: 'No text provided.' };
        if (text.length > 10000) return { success: false, error: 'Text is too long for direct app typing.' };
        clipboard.writeText(text);
        let targetApp = String(payload.appName || payload.targetApp || '').trim();
        if (!targetApp) {
          targetApp = await getActiveWindowAppName();
        }
        if (!targetApp) {
          return { success: false, error: 'Cannot type safely because the target app is unknown. Open or focus an app first, or include the app name in your request.' };
        }
        const pasteResult = await pasteTextIntoApp(targetApp);
        if (!pasteResult.verified) {
          return { success: false, error: `Could not verify text entry in ${pasteResult.appName}.` };
        }
        return {
          success: true,
          message: `Pasted ${text.length} characters into ${pasteResult.appName} after verifying focus.`,
          app: pasteResult.appName,
          resolvedApp: pasteResult.appName,
          verified: true
        };
      }

      if (action === 'HOTKEY') {
        const keys = String(payload.keys || payload.target || '').trim();
        if (!keys) return { success: false, error: 'No hotkey provided.' };
        await sendKeys(hotkeyToSendKeys(keys));
        return { success: true, message: `Sent hotkey ${keys}` };
      }

      if (action === 'WAIT') {
        const ms = Math.max(100, Math.min(Number(payload.ms || payload.target || 1000), 10000));
        await new Promise(resolve => setTimeout(resolve, ms));
        return { success: true, message: `Waited ${ms}ms` };
      }

      if (action === 'CLICK') {
        const x = Math.round(Number(payload.x));
        const y = Math.round(Number(payload.y));
        if (!Number.isFinite(x) || !Number.isFinite(y)) {
          return { success: false, error: 'CLICK requires numeric x and y coordinates.' };
        }
        await runMouseScript([`[WinMouse]::Click(${x}, ${y})`]);
        return { success: true, message: `Clicked at (${x}, ${y})` };
      }

      if (action === 'RIGHT_CLICK') {
        const x = Math.round(Number(payload.x));
        const y = Math.round(Number(payload.y));
        if (!Number.isFinite(x) || !Number.isFinite(y)) {
          return { success: false, error: 'RIGHT_CLICK requires numeric x and y coordinates.' };
        }
        await runMouseScript([`[WinMouse]::RightClick(${x}, ${y})`]);
        return { success: true, message: `Right-clicked at (${x}, ${y})` };
      }

      if (action === 'DOUBLE_CLICK') {
        const x = Math.round(Number(payload.x));
        const y = Math.round(Number(payload.y));
        if (!Number.isFinite(x) || !Number.isFinite(y)) {
          return { success: false, error: 'DOUBLE_CLICK requires numeric x and y coordinates.' };
        }
        await runMouseScript([`[WinMouse]::DoubleClick(${x}, ${y})`]);
        return { success: true, message: `Double-clicked at (${x}, ${y})` };
      }

      if (action === 'MOUSE_MOVE' || action === 'MOVE_MOUSE') {
        const x = Math.round(Number(payload.x));
        const y = Math.round(Number(payload.y));
        if (!Number.isFinite(x) || !Number.isFinite(y)) {
          return { success: false, error: 'MOUSE_MOVE requires numeric x and y coordinates.' };
        }
        await runMouseScript([`[WinMouse]::Move(${x}, ${y})`]);
        return { success: true, message: `Moved cursor to (${x}, ${y})` };
      }

      if (action === 'SCROLL') {
        const delta = Math.round(Number(payload.delta || payload.amount || 120));
        const clamped = Math.max(-1200, Math.min(1200, delta));
        await runMouseScript([`[WinMouse]::Scroll(${clamped})`]);
        return { success: true, message: `Scrolled ${clamped > 0 ? 'down' : 'up'} (${Math.abs(clamped)})` };
      }

      return { success: false, error: `Unsupported app action: ${action || 'none'}` };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  // Download direct file or online asset (e.g. logos, images, documents)
  ipcMain.handle('download-file', async (event, payload = {}) => {
    try {
      let downloadUrl = typeof payload === 'string' ? payload : (payload.url || payload.target);
      const query = payload.query || payload.searchQuery || '';

      if (!downloadUrl && query) {
        const q = String(query).toLowerCase();
        if (q.includes('chatgpt') || q.includes('openai')) {
          downloadUrl = 'https://upload.wikimedia.org/wikipedia/commons/0/04/ChatGPT_logo.svg';
        } else if (q.includes('python')) {
          downloadUrl = 'https://upload.wikimedia.org/wikipedia/commons/c/c3/Python-logo-notext.svg';
        } else if (q.includes('google') || q.includes('chrome')) {
          downloadUrl = 'https://upload.wikimedia.org/wikipedia/commons/e/e1/Google_Chrome_icon_%28February_2022%29.svg';
        } else if (q.includes('github')) {
          downloadUrl = 'https://upload.wikimedia.org/wikipedia/commons/9/91/Octicons-mark-github.svg';
        } else {
          // Perform image web search
          const searchRes = await performWebSearch(`${query} direct download filetype:png`);
          if (searchRes && searchRes.results && searchRes.results.length > 0) {
            const candidate = searchRes.results.find(r => /\.(png|svg|jpg|jpeg|webp)/i.test(r.url) || /wikimedia|github|raw\.github|logo|icon/i.test(r.url));
            downloadUrl = candidate ? candidate.url : searchRes.results[0].url;
          }
        }
      }

      if (!downloadUrl) {
        return { success: false, error: `Could not find a downloadable file URL for "${query || 'requested asset'}".` };
      }

      const downloadsDir = path.join(process.env.USERPROFILE || 'C:\\Users\\vedan', 'Downloads');
      let destPath = payload.targetPath || payload.path;
      if (!destPath) {
        let name = payload.filename || '';
        if (!name) {
          try {
            name = path.basename(new URL(downloadUrl).pathname);
          } catch (_) {
            name = 'downloaded_asset.png';
          }
        }
        if (!name || name === '/' || name.length < 3) {
          const ext = downloadUrl.endsWith('.svg') ? 'svg' : (downloadUrl.endsWith('.jpg') ? 'jpg' : 'png');
          name = `${(query || 'downloaded_file').replace(/[^a-zA-Z0-9_-]+/g, '_')}.${ext}`;
        }
        destPath = path.join(downloadsDir, name);
      }

      const destDir = path.dirname(destPath);
      if (!fs.existsSync(destDir)) fs.mkdirSync(destDir, { recursive: true });

      const res = await fetch(downloadUrl, {
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
      });

      if (!res.ok) {
        return { success: false, error: `Download failed with HTTP status ${res.status}` };
      }

      const buffer = Buffer.from(await res.arrayBuffer());
      fs.writeFileSync(destPath, buffer);

      return {
        success: true,
        message: `Successfully downloaded to ${destPath} (${buffer.length} bytes)`,
        filePath: destPath,
        bytes: buffer.length,
        url: downloadUrl
      };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  // Delete file or directory safely
  ipcMain.handle('delete-file', async (event, targetPath) => {
    try {
      if (!targetPath) return { success: false, error: 'No file path provided.' };
      const resolved = path.resolve(targetPath);
      if (isPathBlacklisted(resolved)) {
        return { success: false, error: `Access Denied: Path "${resolved}" is protected by security policy.` };
      }
      if (!fs.existsSync(resolved)) {
        return { success: false, error: `File not found: ${resolved}` };
      }
      const stat = fs.statSync(resolved);
      if (stat.isDirectory()) {
        fs.rmSync(resolved, { recursive: true, force: true });
      } else {
        fs.unlinkSync(resolved);
      }
      return { success: true, message: `Deleted ${resolved}`, path: resolved };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  // Active pull process registry
  const activePullProcesses = new Map();

  // Trigger direct download of Ollama weights with real-time progress events
  ipcMain.handle('download-model', async (event, modelName) => {
    return new Promise((resolve) => {
      const { spawn } = require('child_process');
      const modelsDir = getOllamaModelsDir();
      const child = spawn('ollama', ['pull', modelName], {
        windowsHide: true,
        env: { ...process.env, OLLAMA_MODELS: modelsDir, ULTRON_MODELS_DIR: modelsDir }
      });
      
      activePullProcesses.set(modelName.toLowerCase(), child);
      let lastPercent = 0;
      let errorOutput = '';

      child.stdout.on('data', (data) => {
        const text = data.toString();
        parseAndSendProgress(text);
      });

      child.stderr.on('data', (data) => {
        const text = data.toString();
        parseAndSendProgress(text);
      });

      function parseAndSendProgress(text) {
        const lines = text.split(/[\r\n]+/);
        for (const line of lines) {
          if (!line.trim()) continue;
          if (line.includes('pulling')) {
            const percentMatch = line.match(/([0-9]+)%/);
            const bytesMatch = line.match(/([0-9.]+\s*[KMGT]B)\/([0-9.]+\s*[KMGT]B)/i);
            const speedMatch = line.match(/([0-9.]+\s*[KMGT]B\/s)/i);
            
            if (percentMatch) {
              lastPercent = parseInt(percentMatch[1]);
            }
            
            event.sender.send('download-progress', {
              modelName,
              percent: percentMatch ? parseInt(percentMatch[1]) : lastPercent,
              downloaded: bytesMatch ? bytesMatch[1].trim() : '',
              total: bytesMatch ? bytesMatch[2].trim() : '',
              speed: speedMatch ? speedMatch[1].trim() : ''
            });
          } else if (line.includes('Error')) {
            errorOutput += line + ' ';
          }
        }
      }

      child.on('close', (code) => {
        activePullProcesses.delete(modelName.toLowerCase());
        if (code === 0) {
          resolve({ success: true });
        } else if (child.killed) {
          resolve({ success: false, error: 'Download cancelled by user', cancelled: true });
        } else {
          resolve({ success: false, error: errorOutput.trim() || `Process exited with code ${code}` });
        }
      });
    });
  });

  // Cancel an ongoing model weight download
  ipcMain.handle('cancel-download-model', async (event, modelName) => {
    const key = (modelName || '').toLowerCase();
    const child = activePullProcesses.get(key) || Array.from(activePullProcesses.values())[0];
    if (child) {
      try {
        child.kill('SIGKILL');
        const { exec } = require('child_process');
        exec(`taskkill /F /PID ${child.pid} /T`, { windowsHide: true }, () => {});
      } catch (e) {}
      activePullProcesses.delete(key);
      return { success: true, cancelled: true };
    }
    return { success: false, error: 'No active pull process found' };
  });

  // Delete local model weights
  ipcMain.handle('delete-model', async (event, modelName) => {
    try {
      const { exec } = require('child_process');
      return new Promise((resolve) => {
        exec(`ollama rm ${modelName}`, { windowsHide: true }, (error, stdout, stderr) => {
          if (error) {
            resolve({ success: false, error: stderr || error.message });
          } else {
            resolve({ success: true });
          }
        });
      });
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  // Search Hugging Face Hub for open-source GGUF models in real-time
  ipcMain.handle('search-huggingface-models', async (event, query, limit = 20) => {
    try {
      const results = await searchHuggingFaceGgufModels(query || '', limit);
      return { success: true, models: results };
    } catch (err) {
      return { success: false, error: err.message, models: [] };
    }
  });

  // Query specific Hugging Face model repository files for available quantizations
  ipcMain.handle('get-huggingface-model-quantizations', async (event, repoId) => {
    try {
      const quantizations = await getModelQuantizations(repoId);
      return { success: true, quantizations };
    } catch (err) {
      return { success: false, error: err.message, quantizations: [] };
    }
  });

  // Check if Ollama is installed on the user's computer
  ipcMain.handle('check-ollama-installed', async () => {
    try {
      // 1. Check default installation paths on Windows first (fastest, no CLI spawn)
      const userLocal = process.env.LOCALAPPDATA || path.join(process.env.USERPROFILE, 'AppData', 'Local');
      const defaultPaths = [
        path.join(userLocal, 'Programs', 'Ollama', 'ollama app.exe'),
        path.join(userLocal, 'Programs', 'Ollama', 'ollama.exe'),
        'C:\\Program Files\\Ollama\\ollama.exe',
        'C:\\Program Files (x86)\\Ollama\\ollama.exe'
      ];

      for (const p of defaultPaths) {
        if (fs.existsSync(p)) {
          provisionUltronFolderForOllama(p);
          return { installed: true, source: 'filepath', path: p, ultronRoot: process.env.ULTRON_ROOT };
        }
      }

      // 2. Fallback check if in PATH by executing a silent version check
      const checkPath = () => {
        return new Promise((resolve) => {
          const { exec } = require('child_process');
          exec('ollama --version', { windowsHide: true }, (error) => {
            resolve(!error);
          });
        });
      };

      const inPath = await checkPath();
      if (inPath) {
        provisionUltronFolderForOllama(getOllamaInstallPath());
        return { installed: true, source: 'path', ultronRoot: process.env.ULTRON_ROOT };
      }

      return { installed: false };
    } catch (err) {
      return { installed: false, error: err.message };
    }
  });

  // Start the Ollama background server (headless mode with 0 terminal or GUI windows)
  ipcMain.handle('start-ollama-service', async (event, exePath) => {
    try {
      const { exec } = require('child_process');
      provisionUltronFolderForOllama(exePath || getOllamaInstallPath());
      const modelsDir = getOllamaModelsDir();
      const userLocal = process.env.LOCALAPPDATA || path.join(process.env.USERPROFILE, 'AppData', 'Local');
      const ollamaCliExe = path.join(userLocal, 'Programs', 'Ollama', 'ollama.exe');
      
      let targetExe = 'ollama';
      if (fs.existsSync(ollamaCliExe)) {
        targetExe = `"${ollamaCliExe}"`;
      } else if (exePath && fs.existsSync(exePath) && !exePath.toLowerCase().endsWith('ollama app.exe')) {
        targetExe = `"${exePath}"`;
      }

      const modelsEnv = modelsDir.replace(/'/g, "''");
      const psCmd = `powershell -NoProfile -ExecutionPolicy Bypass -Command "$env:OLLAMA_MODELS='${modelsEnv}'; Start-Process -FilePath ${targetExe} -ArgumentList 'serve' -WindowStyle Hidden"`;

      return new Promise((resolve) => {
        exec(psCmd, { windowsHide: true }, (error) => {
          if (error) {
            // Fallback to direct background exec
            exec(`${targetExe} serve`, { windowsHide: true }, () => {});
          }
          resolve({ success: true });
        });
      });
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  function resolveOllamaCliPath() {
    const userLocal = process.env.LOCALAPPDATA || path.join(process.env.USERPROFILE || '', 'AppData', 'Local');
    const candidates = [
      path.join(userLocal, 'Programs', 'Ollama', 'ollama.exe'),
      'C:\\Program Files\\Ollama\\ollama.exe',
      'C:\\Program Files (x86)\\Ollama\\ollama.exe'
    ];
    for (const candidate of candidates) {
      if (candidate && fs.existsSync(candidate)) return candidate;
    }
    return 'ollama';
  }

  function extractOllamaSigninUrl(text) {
    const match = String(text || '').match(/https:\/\/[^\s"'<>]+/i);
    return match ? match[0].replace(/[),.]+$/, '') : null;
  }

  async function verifyLiveOllamaCloudAuth() {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 4000);
      const response = await fetch('http://127.0.0.1:11434/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'gpt-oss:20b-cloud',
          messages: [{ role: 'user', content: 'ping' }],
          stream: false
        }),
        signal: controller.signal
      });
      clearTimeout(timeoutId);

      if (response.status === 401) {
        return { authorized: false, error: 'Unauthorized' };
      }

      if (response.ok) {
        return { authorized: true };
      }

      const text = await response.text().catch(() => '');
      if (text.toLowerCase().includes('unauthorized') || text.toLowerCase().includes('sign in')) {
        return { authorized: false, error: 'Unauthorized' };
      }

      return { authorized: true };
    } catch (err) {
      return { authorized: false, error: err.message };
    }
  }

  ipcMain.handle('verify-ollama-cloud-auth', async () => {
    return await verifyLiveOllamaCloudAuth();
  });

  ipcMain.handle('ollama-auth-status', async () => {
    const config = loadUltronConfigFile();
    let signedIn = Boolean(config.ollamaCloudSignedIn);

    // If marked as signed in, verify with a live probe so stale/false tokens are caught
    if (signedIn) {
      const verification = await verifyLiveOllamaCloudAuth();
      if (!verification.authorized && verification.error === 'Unauthorized') {
        signedIn = false;
        saveUltronConfigPatch({
          ollamaCloudSignedIn: false,
          ollamaCloudSignedInAt: null
        });
      }
    }

    return {
      signedIn,
      signedInAt: signedIn ? (config.ollamaCloudSignedInAt || null) : null,
      email: config.ollamaCloudEmail || null
    };
  });

  ipcMain.handle('set-ollama-auth-status', async (event, signedIn, email = null) => {
    saveUltronConfigPatch({
      ollamaCloudSignedIn: Boolean(signedIn),
      ollamaCloudSignedInAt: signedIn ? new Date().toISOString() : null,
      ollamaCloudEmail: email || null
    });
    return { success: true, signedIn: Boolean(signedIn) };
  });

  ipcMain.handle('ollama-signin', async () => {
    try {
      const { spawn } = require('child_process');
      const ollamaExe = resolveOllamaCliPath();

      return await new Promise((resolve) => {
        let output = '';
        let resolved = false;

        const finish = (result) => {
          if (resolved) return;
          resolved = true;
          resolve(result);
        };

        try {
          const child = spawn(ollamaExe, ['signin'], {
            windowsHide: true,
            env: { ...process.env }
          });

          const handleChunk = (chunk) => {
            output += chunk.toString();
            const url = extractOllamaSigninUrl(output);
            if (url) {
              shell.openExternal(url).catch(() => {});
              finish({
                success: true,
                authUrl: url,
                message: 'Opened Ollama authorization page in browser.'
              });
            }
          };

          child.stdout.on('data', handleChunk);
          child.stderr.on('data', handleChunk);
          child.on('error', () => {
            shell.openExternal('https://ollama.com/signin').catch(() => {});
            finish({
              success: true,
              authUrl: 'https://ollama.com/signin',
              message: 'Opened Ollama sign-in page in browser.'
            });
          });
          child.on('close', (code) => {
            const text = output.trim();
            const url = extractOllamaSigninUrl(text) || 'https://ollama.com/signin';
            finish({
              success: true,
              authUrl: url,
              output: text
            });
          });

          // Timeout fallback
          setTimeout(() => {
            const url = extractOllamaSigninUrl(output) || 'https://ollama.com/signin';
            shell.openExternal(url).catch(() => {});
            finish({
              success: true,
              authUrl: url,
              message: 'Opened Ollama sign-in page in browser.'
            });
          }, 3000);
        } catch (spawnErr) {
          shell.openExternal('https://ollama.com/signin').catch(() => {});
          finish({
            success: true,
            authUrl: 'https://ollama.com/signin',
            message: 'Opened Ollama sign-in page in browser.'
          });
        }
      });
    } catch (err) {
      shell.openExternal('https://ollama.com/signin').catch(() => {});
      return { success: true, authUrl: 'https://ollama.com/signin' };
    }
  });

  ipcMain.handle('ollama-signout', async () => {
    try {
      const { spawn } = require('child_process');
      const ollamaExe = resolveOllamaCliPath();
      await new Promise((resolve) => {
        try {
          const child = spawn(ollamaExe, ['signout'], { windowsHide: true, env: { ...process.env } });
          child.on('close', () => resolve());
          child.on('error', () => resolve());
        } catch {
          resolve();
        }
      });
    } catch {}
    saveUltronConfigPatch({
      ollamaCloudSignedIn: false,
      ollamaCloudSignedInAt: null,
      ollamaCloudEmail: null
    });
    return { success: true };
  });

  // Persistent Gemini API Key Storage across app restarts
  ipcMain.handle('save-gemini-key', async (event, key) => {
    try {
      const configPath = path.join(app.getPath('userData'), 'ultron-config.json');
      let config = {};
      if (fs.existsSync(configPath)) {
        try { config = JSON.parse(fs.readFileSync(configPath, 'utf8')); } catch (e) {}
      }
      config.geminiApiKey = key || '';
      fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf8');
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('load-gemini-key', async () => {
    try {
      const configPath = path.join(app.getPath('userData'), 'ultron-config.json');
      if (fs.existsSync(configPath)) {
        const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
        return config.geminiApiKey || '';
      }
      return '';
    } catch (err) {
      return '';
    }
  });

  ipcMain.handle('install-mcp-windows-uia', async (event) => {
    try {
      const userDataPath = getConnectorsRoot();
      const sendProgress = (data) => {
        if (event.sender && !event.sender.isDestroyed()) {
          event.sender.send('download-progress', {
            modelName: 'mcp-windows-uia',
            percent: data.percent ?? 0,
            downloaded: data.downloaded != null ? formatDownloadBytes(data.downloaded) : '',
            total: data.total != null ? formatDownloadBytes(data.total) : '',
            speed: data.speed || '',
            phase: data.phase || 'download'
          });
        }
      };
      const installed = await mcpManager.ensureWindowsUiaInstalled({
        userDataPath,
        onProgress: sendProgress
      });
      if (!installed.success) return installed;
      const reconnect = await mcpManager.reconnectWindowsUia({
        userDataPath,
        autoInstall: false,
        exePath: installed.exePath
      });
      return {
        success: true,
        exePath: installed.exePath,
        installed: installed.installed,
        windowsUia: reconnect.windowsUia,
        tools: reconnect.tools
      };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  // Persistent User Profile Storage across app restarts
  ipcMain.handle('save-user-profile', async (event, profile) => {
    try {
      const configPath = path.join(app.getPath('userData'), 'ultron-config.json');
      let config = {};
      if (fs.existsSync(configPath)) {
        try { config = JSON.parse(fs.readFileSync(configPath, 'utf8')); } catch (e) {}
      }
      const rawFullName = (profile && (profile.fullName || profile.name)) ? (profile.fullName || profile.name).trim() : '';
      let firstName = (profile && profile.firstName) ? profile.firstName.trim() : '';
      let lastName = (profile && profile.lastName) ? profile.lastName.trim() : '';
      if (!firstName && rawFullName) {
        const parts = rawFullName.split(/\s+/);
        firstName = parts[0] || '';
        lastName = parts.slice(1).join(' ') || '';
      }
      config.userProfile = {
        fullName: rawFullName || `${firstName} ${lastName}`.trim(),
        firstName: firstName,
        lastName: lastName,
        birthdate: (profile && profile.birthdate) ? profile.birthdate.trim() : '',
        email: (profile && profile.email) ? profile.email.trim() : ''
      };
      fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf8');
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('load-user-profile', async () => {
    try {
      const configPath = path.join(app.getPath('userData'), 'ultron-config.json');
      if (fs.existsSync(configPath)) {
        const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
        return config.userProfile || null;
      }
      return null;
    } catch (err) {
      return null;
    }
  });

  // First-Time Setup Status Storage
  ipcMain.handle('save-setup-status', async (event, completed) => {
    try {
      const configPath = path.join(app.getPath('userData'), 'ultron-config.json');
      let config = {};
      if (fs.existsSync(configPath)) {
        try { config = JSON.parse(fs.readFileSync(configPath, 'utf8')); } catch (e) {}
      }
      config.setupCompleted = Boolean(completed);
      fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf8');
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('load-setup-status', async () => {
    try {
      const configPath = path.join(app.getPath('userData'), 'ultron-config.json');
      if (fs.existsSync(configPath)) {
        const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
        return Boolean(config.setupCompleted);
      }
      return false;
    } catch (err) {
      return false;
    }
  });

  // Install Ollama using winget package manager
  ipcMain.handle('install-ollama', async () => {
    try {
      return new Promise((resolve) => {
        const { exec } = require('child_process');
        exec('winget install Ollama --accept-package-agreements --accept-source-agreements', { windowsHide: true }, (error, stdout, stderr) => {
          if (error) {
            resolve({ success: false, error: stderr || error.message });
          } else {
            const ollamaPath = getOllamaInstallPath();
            const layout = provisionUltronFolderForOllama(ollamaPath);
            resolve({ success: true, stdout, ultronRoot: layout.ultronRoot, modelsDir: layout.modelsDir });
          }
        });
      });
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('ensure-ultron-storage', async () => {
    try {
      const layout = ensureUltronStorageLayout();
      return { success: true, ...layout };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  // Select local directory using native folder picker
  ipcMain.handle('select-directory', async () => {
    if (!mainWindow) return { canceled: true };
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openDirectory']
    });
    return result;
  });

  ipcMain.handle('select-document-file', async () => {
    if (!mainWindow) return { canceled: true };
    const result = await dialog.showOpenDialog(mainWindow, {
      title: 'Select a document',
      properties: ['openFile'],
      filters: [{ name: 'Documents', extensions: ['pdf', 'doc', 'docx', 'txt', 'md', 'rtf', 'csv'] }]
    });
    if (result.canceled || !result.filePaths[0]) return { canceled: true };
    return { canceled: false, path: result.filePaths[0] };
  });

  // Recent documents picker: last 5 pdf/doc/txt-ish files from Documents + Desktop
  ipcMain.handle('list-recent-documents', async () => {
    try {
      const exts = new Set(['.pdf', '.doc', '.docx', '.txt', '.md', '.rtf']);
      const roots = [];
      try { roots.push(app.getPath('documents')); } catch (_) { /* ignore */ }
      try { roots.push(app.getPath('desktop')); } catch (_) { /* ignore */ }
      const found = [];
      for (const root of roots) {
        let entries = [];
        try { entries = fs.readdirSync(root, { withFileTypes: true }); } catch (_) { continue; }
        for (const entry of entries) {
          if (!entry.isFile()) continue;
          if (!exts.has(path.extname(entry.name).toLowerCase())) continue;
          const fullPath = path.join(root, entry.name);
          try {
            const stat = fs.statSync(fullPath);
            found.push({ name: entry.name, path: fullPath, size: stat.size, mtime: stat.mtimeMs });
          } catch (_) { /* skip unreadable entry */ }
        }
      }
      found.sort((a, b) => b.mtime - a.mtime);
      return { success: true, files: found.slice(0, 5) };
    } catch (err) {
      return { success: false, error: err.message, files: [] };
    }
  });

  ipcMain.handle('select-sound-file', async () => {
    if (!mainWindow) return { canceled: true };
    const result = await dialog.showOpenDialog(mainWindow, {
      title: 'Choose agent sound',
      properties: ['openFile'],
      filters: [{ name: 'Audio', extensions: ['mp3', 'wav', 'ogg', 'm4a', 'aac'] }]
    });
    if (result.canceled || !result.filePaths[0]) return { canceled: true };
    return {
      canceled: false,
      path: result.filePaths[0],
      fileUrl: pathToFileURL(result.filePaths[0]).href
    };
  });

function getInstallationDefaultDataDir() {
  return getDefaultAgentDataDir();
}

  // Update persistent agent memory data directory
  ipcMain.handle('update-data-dir', async (event, customPath) => {
    try {
      const oldPath = process.env.ULTRON_DATA_DIR;
      updateAgentDataDir(customPath);

      if (oldPath && oldPath !== customPath) {
        const oldFile = path.join(oldPath, 'conversations.json');
        const newFile = path.join(customPath, 'conversations.json');
        if (fs.existsSync(oldFile) && !fs.existsSync(newFile)) {
          fs.copyFileSync(oldFile, newFile);
        }
      }

      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('update-connectors-dir', async (event, customPath) => {
    try {
      updateConnectorsDir(customPath);
      return { success: true, connectorsDir: getConnectorsRoot() };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  // Get default app memory data directory location
  ipcMain.handle('get-default-data-dir', () => {
    return getInstallationDefaultDataDir();
  });

  ipcMain.handle('get-runtime-data-root', () => {
    return getUltronRuntimeRoot();
  });

  ipcMain.handle('get-connectors-root', () => {
    return getConnectorsRoot();
  });

  ipcMain.handle('get-storage-paths', () => {
    return getStoragePathsSnapshot();
  });

  // Save conversation history to local data directory path
  ipcMain.handle('save-conversations', async (event, dataStr) => {
    try {
      const dataDir = process.env.ULTRON_DATA_DIR;
      if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
      }
      const filePath = path.join(dataDir, 'conversations.json');
      fs.writeFileSync(filePath, dataStr, 'utf8');
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  // Load conversation history from local data directory path
  ipcMain.handle('load-conversations', async () => {
    try {
      const dataDir = process.env.ULTRON_DATA_DIR;
      const filePath = path.join(dataDir, 'conversations.json');
      if (fs.existsSync(filePath)) {
        const data = fs.readFileSync(filePath, 'utf8');
        return { success: true, data };
      }
      return { success: true, data: '{}' };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  // User input response from the Review Mode floating overlay
  ipcMain.on('permission-response', (event, { id, approved, modifiedCommand }) => {
    const pending = pendingPermissions.get(id);
    if (pending) {
      pendingPermissions.delete(id);
      pending.resolve({ approved, modifiedCommand });
    }
  });

  // Main task execution entry point
  ipcMain.handle('execute-action', async (event, { command, targetPath, isWrite }) => {
    try {
      // 1. Hard-coded Blacklist check
      if (isCommandBlacklisted(command)) {
        return { success: false, error: 'Security Block: Direct registry changes and environment path manipulations are forbidden.' };
      }

      let safePath = targetPath;
      if (targetPath) {
        // Will throw an error if path is blacklisted
        safePath = verifyAndResolvePath(targetPath, isWrite);
      }

      // 2. Security Mode Routing
      const needsReview = 
        activeSecurityMode === 'Review' || 
        (activeSecurityMode === 'Adaptive' && (isWrite || isCommandBlacklisted(command) || command.includes('rm ') || command.includes('del ')));

      if (needsReview) {
        // Trigger Human-in-the-Loop Overlay Pause State
        const id = `perm-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
        
        const userDecision = await new Promise((resolve) => {
          pendingPermissions.set(id, { resolve });
          if (mainWindow) {
            mainWindow.webContents.send('request-permission', {
              id,
              command,
              targetPath: safePath || 'None'
            });
          } else {
            resolve({ approved: false });
          }
        });

        if (!userDecision.approved) {
          return { success: false, error: 'Execution Rejected: Permission denied by user.' };
        }

        if (userDecision.modifiedCommand) {
          command = userDecision.modifiedCommand;
        }
      }

      // 3. Containment Sandbox Routing
      if (activeSecurityMode === 'Containment') {
        // Redirection to sandboxed path
        const sandboxDir = 'C:\\local_agent_sandbox';
        if (!fs.existsSync(sandboxDir)) {
          fs.mkdirSync(sandboxDir, { recursive: true });
        }
        
        // Execute command mapped to local sandbox environment
        const result = await runCommandWithTimeout(command, { cwd: sandboxDir });
        return { success: true, stdout: result.stdout, stderr: result.stderr, sandboxed: true };
      }

      // 4. Native standard execution
      const runOpts = safePath && fs.existsSync(safePath) ? { cwd: safePath } : {};
      const result = await runCommandWithTimeout(command, runOpts);
      return { success: true, stdout: result.stdout, stderr: result.stderr };

    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  // Read local file contents
  ipcMain.handle('read-file', async (event, filePath) => {
    try {
      const resolvedPath = path.resolve(filePath);
      if (isPathBlacklisted(resolvedPath)) {
        return { success: false, error: `Access Denied: Path "${resolvedPath}" is restricted by safety policy.` };
      }
      if (!fs.existsSync(resolvedPath)) {
        return { success: false, error: `File not found: ${resolvedPath}` };
      }
      const ext = path.extname(resolvedPath).toLowerCase();
      if (ext === '.pdf') {
        const buffer = fs.readFileSync(resolvedPath);
        const text = await extractTextFromPdfBuffer(buffer);
        return { success: true, content: text, filePath: resolvedPath };
      }
      const content = fs.readFileSync(resolvedPath, 'utf8');
      return { success: true, content, filePath: resolvedPath };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  // Extract text from PDF buffer or file path
  ipcMain.handle('extract-pdf-text', async (event, payload) => {
    try {
      let buffer;
      if (typeof payload === 'string') {
        const resolvedPath = path.resolve(payload);
        if (!fs.existsSync(resolvedPath)) {
          return { success: false, error: 'File not found' };
        }
        buffer = fs.readFileSync(resolvedPath);
      } else if (payload && (payload.buffer || Buffer.isBuffer(payload) || ArrayBuffer.isView(payload) || payload instanceof ArrayBuffer)) {
        buffer = Buffer.isBuffer(payload) ? payload : Buffer.from(payload.buffer || payload);
      } else if (payload && payload.data) {
        buffer = Buffer.from(payload.data);
      } else {
        return { success: false, error: 'Invalid PDF payload' };
      }

      const text = await extractTextFromPdfBuffer(buffer);
      return { success: true, text };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  // Write content to a local file
  ipcMain.handle('write-file', async (event, { filePath, content }) => {
    try {
      const resolvedPath = path.resolve(filePath);
      if (isPathBlacklisted(resolvedPath)) {
        return { success: false, error: `Access Denied: Writing to "${resolvedPath}" is restricted by safety policy.` };
      }
      const dir = path.dirname(resolvedPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      let undo = null;
      const hadFile = fs.existsSync(resolvedPath);
      if (hadFile) {
        const previousContent = fs.readFileSync(resolvedPath, 'utf8');
        undo = { type: 'restore_file', path: resolvedPath, previousContent };
        // Shadow copy to disk so the original survives app restarts / undo-stack loss
        try {
          const backupDir = path.join(
            process.env.ULTRON_DATA_DIR || getDefaultAgentDataDir(),
            'backups'
          );
          if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true });
          const backupPath = path.join(backupDir, `${path.basename(resolvedPath)}.${Date.now()}.bak`);
          fs.copyFileSync(resolvedPath, backupPath);
          undo.backupPath = backupPath;
        } catch (backupErr) {
          // Backup is best-effort; the in-memory undo record still holds previousContent
        }
      } else {
        undo = { type: 'delete_file', path: resolvedPath };
      }
      fs.writeFileSync(resolvedPath, content, 'utf8');
      const writtenContent = fs.readFileSync(resolvedPath, 'utf8');
      if (writtenContent !== String(content)) {
        throw new Error(`Write verification failed for ${resolvedPath}`);
      }
      return {
        success: true,
        filePath: resolvedPath,
        verified: true,
        evidence: `${resolvedPath} exists and its contents match.`,
        undo
      };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('restore-file-backup', async (event, payload = {}) => {
    try {
      const resolvedPath = path.resolve(payload.path || payload.filePath);
      if (isPathBlacklisted(resolvedPath)) {
        return { success: false, error: `Access Denied: Path "${resolvedPath}" is restricted.` };
      }
      if (payload.type === 'delete_file') {
        if (fs.existsSync(resolvedPath)) fs.unlinkSync(resolvedPath);
        return { success: true, message: `Removed ${resolvedPath}` };
      }
      const dir = path.dirname(resolvedPath);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(resolvedPath, payload.previousContent ?? '', 'utf8');
      return { success: true, message: `Restored ${resolvedPath}` };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  let _prevCpuStats = null;
  function calculateCpuLoadPct() {
    try {
      const os = require('os');
      const cpus = os.cpus();
      if (!cpus || cpus.length === 0) return null;
      let totalIdle = 0;
      let totalTick = 0;
      for (let i = 0; i < cpus.length; i++) {
        const times = cpus[i].times;
        for (const type in times) {
          totalTick += times[type];
        }
        totalIdle += times.idle;
      }
      if (!_prevCpuStats) {
        _prevCpuStats = { idle: totalIdle, total: totalTick };
        return 0;
      }
      const idleDelta = totalIdle - _prevCpuStats.idle;
      const totalDelta = totalTick - _prevCpuStats.total;
      _prevCpuStats = { idle: totalIdle, total: totalTick };
      if (totalDelta <= 0) return 0;
      const usage = 100 - Math.round((idleDelta / totalDelta) * 100);
      return Math.max(0, Math.min(100, usage));
    } catch (e) {
      return null;
    }
  }

  ipcMain.handle('get-live-metrics', async () => {
    try {
      const os = require('os');
      const totalMem = os.totalmem();
      const freeMem = os.freemem();
      const usedPct = totalMem > 0 ? Math.round(((totalMem - freeMem) / totalMem) * 100) : 0;
      const cpuLoad = calculateCpuLoadPct();
      return {
        success: true,
        freeMemoryGB: (freeMem / (1024 ** 3)).toFixed(1),
        totalMemoryGB: (totalMem / (1024 ** 3)).toFixed(1),
        memoryUsedPct: usedPct,
        cpuLoadPct: cpuLoad,
        cpuCores: os.cpus().length
      };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  // List directory contents
  ipcMain.handle('list-dir', async (event, dirPath) => {
    try {
      const targetDir = dirPath ? path.resolve(dirPath) : process.cwd();
      if (isPathBlacklisted(targetDir)) {
        return { success: false, error: `Access Denied: Path "${targetDir}" is restricted by safety policy.` };
      }
      if (!fs.existsSync(targetDir)) {
        return { success: false, error: `Directory not found: ${targetDir}` };
      }
      const items = fs.readdirSync(targetDir, { withFileTypes: true }).map(item => ({
        name: item.name,
        isDirectory: item.isDirectory(),
        isFile: item.isFile()
      }));
      return { success: true, dirPath: targetDir, items };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  // Open URL in default system browser
  ipcMain.handle('open-external', async (event, url) => {
    try {
      if (url && (url.startsWith('http://') || url.startsWith('https://'))) {
        const parsed = new URL(url);
        const host = parsed.hostname.toLowerCase();
        if (!host || host === 'localhost' || host.endsWith('.local') || host.includes('duckduckgo.com')) {
          return { success: false, error: 'Blocked URL host.' };
        }
        await shell.openExternal(url);
        return { success: true };
      }
      return { success: false, error: 'Invalid URL scheme.' };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  // Decode HTML entities in web search snippets
  function decodeHTMLEntities(text) {
    if (!text) return '';
    return text
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&nbsp;/g, ' ')
      .replace(/&#x27;/g, "'")
      .replace(/&#x2F;/g, '/');
  }

  function stripTags(html) {
    return decodeHTMLEntities((html || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim());
  }

  function buildWikipediaUrl(title) {
    if (!title) return '';
    const slug = String(title).trim().replace(/ /g, '_');
    const wikiUrl = `https://en.wikipedia.org/wiki/${encodeURIComponent(slug).replace(/%20/g, '_')}`;
    return isValidResultUrl(wikiUrl) ? wikiUrl : '';
  }

  function normalizeDdgUrl(rawUrl) {
    if (!rawUrl) return '';
    const decoded = decodeHTMLEntities(String(rawUrl).trim());
    try {
      const url = new URL(decoded, 'https://duckduckgo.com');
      const uddg = url.searchParams.get('uddg');
      if (uddg) {
        const target = decodeURIComponent(uddg);
        return isValidResultUrl(target) ? target : '';
      }
      if (/duckduckgo\.com$/i.test(url.hostname) || url.hostname.endsWith('.duckduckgo.com')) {
        return '';
      }
      return isValidResultUrl(url.href) ? url.href : '';
    } catch (e) {
      return '';
    }
  }

  function getHostname(url) {
    try {
      return new URL(url).hostname.replace(/^www\./i, '');
    } catch (e) {
      return 'web';
    }
  }

  function normalizeAbsoluteUrl(rawUrl, baseUrl = '') {
    if (!rawUrl) return '';
    const decoded = decodeHTMLEntities(String(rawUrl).trim());
    if (/^(javascript|data|mailto|tel):/i.test(decoded)) return '';
    try {
      return new URL(decoded, baseUrl || undefined).href;
    } catch (e) {
      return '';
    }
  }

  function isValidResultUrl(url) {
    try {
      const parsed = new URL(url);
      if (!['http:', 'https:'].includes(parsed.protocol)) return false;

      const host = parsed.hostname.toLowerCase();
      if (!host || !host.includes('.') || host === 'localhost' || host.endsWith('.local')) return false;
      if (/^(\d{1,3}\.){3}\d{1,3}$/.test(host)) return false;

      const blockedHosts = new Set([
        'duckduckgo.com',
        'www.duckduckgo.com',
        'google.com',
        'www.google.com',
        'bing.com',
        'www.bing.com',
        'search.yahoo.com',
        'search.brave.com',
        'example.com',
        'www.example.com',
        'example.org',
        'www.example.org',
        'example.net',
        'www.example.net',
        'localhost',
        '127.0.0.1'
      ]);
      if (blockedHosts.has(host)) return false;
      if (host.includes('duckduckgo.com')) return false;

      if ((host === 'google.com' || host === 'www.google.com') && parsed.pathname === '/search') return false;
      if ((host === 'bing.com' || host === 'www.bing.com') && parsed.pathname === '/search') return false;

      if (parsed.pathname === '/' && parsed.searchParams.has('q')) return false;

      return true;
    } catch (e) {
      return false;
    }
  }

  async function verifyUrl(url) {
    if (!isValidResultUrl(url)) return { ok: false, status: 0, finalUrl: '' };
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    const headers = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36',
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
    };

    try {
      let res = await fetch(url, { method: 'HEAD', headers, redirect: 'follow', signal: controller.signal });
      if (!res.ok || [401, 403, 405, 404, 501].includes(res.status)) {
        res = await fetch(url, {
          method: 'GET',
          headers: { ...headers, Range: 'bytes=0-4096' },
          redirect: 'follow',
          signal: controller.signal
        });
      }

      clearTimeout(timeout);
      const finalUrl = res.url || url;
      if (!isValidResultUrl(finalUrl)) {
        return { ok: false, status: res.status, finalUrl: '' };
      }

      const ok = res.status >= 200 && res.status < 400;
      return {
        ok,
        status: res.status,
        finalUrl
      };
    } catch (e) {
      clearTimeout(timeout);
      return { ok: false, status: 0, finalUrl: '' };
    }
  }

  function isShoppingQuery(query) {
    const q = String(query || '').toLowerCase();
    if (/\b(buy|purchase|shop|shopping|deal|deals|sale|price|cart|checkout|amazon|flipkart|ebay|meesho|myntra)\b/i.test(q)) return true;
    if (/\b(courses?|tutorials?|certifications?|classes?|books?|learning|academy|institutes?|programs?|laptops?|phones?|monitors?|headphones?|earbuds?|keyboards?|mice|mouse|tablets?|tvs?|gpus?|cpus?|processors?|smartwatches?|cameras?|shoes?|sneakers?|tools?|software|apps?|services?)\b/i.test(q)) {
      return true;
    }
    if (/\b(best|top|cheap|budget|affordable|recommended|find me the best|suggest me|list of)\b/i.test(q)) {
      return true;
    }
    return false;
  }

  function extractPrice(text) {
    const match = (text || '').match(/(?:₹|Rs\.?|INR|\$|USD|€|£)\s?[0-9][0-9,]*(?:\.[0-9]{1,2})?/i);
    return match ? match[0] : '';
  }

  function uniqueResults(results) {
    const seen = new Set();
    return results.filter((item) => {
      if (!item || !item.url) return false;
      if (!isValidResultUrl(item.url)) return false;
      const key = item.url.replace(/[#?].*$/, '').toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  async function fetchPagePreview(url) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 6000);
      const res = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36'
        },
        signal: controller.signal
      });
      clearTimeout(timeout);
      if (!res.ok) return null;
      const contentType = res.headers.get('content-type') || '';
      if (!contentType.includes('text/html')) return null;
      const html = await res.text();
      const title = html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i)?.[1]
        || html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1];
      const description = html.match(/<meta[^>]+(?:name|property)=["'](?:description|og:description)["'][^>]+content=["']([^"']+)["']/i)?.[1];
      
      // Extract high-resolution image
      const image = html.match(/<meta[^>]+property=["']og:image(?::secure_url)?["'][^>]+content=["']([^"']+)["']/i)?.[1]
        || html.match(/<meta[^>]+name=["']twitter:image(?::src)?["'][^>]+content=["']([^"']+)["']/i)?.[1]
        || html.match(/<link[^>]+rel=["']image_src["'][^>]+href=["']([^"']+)["']/i)?.[1]
        || html.match(/<meta[^>]+itemprop=["']image["'][^>]+content=["']([^"']+)["']/i)?.[1]
        || html.match(/<img[^>]+(?:class|id)=["'][^"']*(?:product|hero|main|lead|thumb|cover|banner)[^"']*["'][^>]+src=["']([^"']+)["']/i)?.[1]
        || '';

      return {
        title: stripTags(title || ''),
        description: stripTags(description || ''),
        image: normalizeAbsoluteUrl(image, url)
      };
    } catch (e) {
      return null;
    }
  }

  // Search Cache (in-memory + 24-hour TTL)
  const searchMemoryCache = new Map();
  const SEARCH_CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

  function isVideoOrTutorialQuery(query) {
    const q = String(query || '').toLowerCase();
    return /\b(video|videos|youtube|tutorial|tutorials|course|courses|how to|guide|learn|class|classes|lecture|lectures|hindi|explained|crash course)\b/i.test(q);
  }

  async function fetchYouTubeVideoResults(query) {
    try {
      const q = encodeURIComponent(`${query} site:youtube.com`);
      const res = await fetch(`https://html.duckduckgo.com/html/`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        },
        body: `q=${q}`
      });
      if (!res.ok) return [];
      const html = await res.text();
      const videos = [];
      const matches = html.matchAll(/<div class="result[\s\S]*?<\/div>\s*<\/div>/g);
      for (const match of matches) {
        const block = match[0];
        const titleMatch = block.match(/<a[^>]+class="result__a"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i);
        const snippetMatch = block.match(/<a class="result__snippet"[^>]*>([\s\S]*?)<\/a>/i) || block.match(/<div class="result__snippet"[^>]*>([\s\S]*?)<\/div>/i);
        if (!titleMatch) continue;
        const rawUrl = normalizeDdgUrl(titleMatch[1]);
        if (!rawUrl || !rawUrl.includes('youtube.com/watch') && !rawUrl.includes('youtu.be/')) continue;
        const title = stripTags(titleMatch[2]);
        const snippet = stripTags(snippetMatch ? snippetMatch[1] : '');
        let videoId = '';
        const vMatch = rawUrl.match(/(?:v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
        if (vMatch) videoId = vMatch[1];
        
        const thumbnail = videoId ? `https://img.youtube.com/vi/${videoId}/hqdefault.jpg` : '';
        videos.push({
          title,
          url: rawUrl,
          source: 'youtube.com',
          snippet,
          thumbnail,
          isVideo: true,
          type: 'video'
        });
        if (videos.length >= 4) break;
      }
      return videos;
    } catch (e) {
      return [];
    }
  }

  // Robust multi-source Web Search handler (DuckDuckGo API + Wiki API + DDG Organic POST + Video + Cache)
  ipcMain.handle('search-web', async (event, query, options = {}) => {
    let cleanQuery = query ? query.replace(/["']/g, '').trim() : '';
    // Strip common prompt prefixes
    cleanQuery = cleanQuery
      .replace(/\bwbe\b/gi, 'web')
      .replace(/\bspiderman\b/gi, 'Spider-Man')
      .replace(/^(please\s+)?(can\s+you\s+|could\s+you\s+)?(search\s+(web\s+for|online\s+for|for)?|look\s+up|google|find\s+out|find)\s+/i, '')
      .replace(/^(tell\s+me|show\s+me|give\s+me)\s+(about\s+)?/i, '')
      .trim();
    if (!cleanQuery) {
      return { success: false, query: '', results: [], products: [], videos: [], answerContext: '', needsClarification: true, clarification: 'Please provide a valid web search query.' };
    }

    const cacheKey = cleanQuery.toLowerCase();
    if (!options.bypassCache && searchMemoryCache.has(cacheKey)) {
      const cachedEntry = searchMemoryCache.get(cacheKey);
      if (Date.now() - cachedEntry.timestamp < SEARCH_CACHE_TTL_MS) {
        return { ...cachedEntry.data, cached: true };
      }
    }

    const resultBlocks = [];
    const isVideoQuery = isVideoOrTutorialQuery(cleanQuery);

    // Parallel multi-source fetch: DDG API + Wikipedia + YouTube (if relevant)
    const parallelTasks = [
      (async () => {
        try {
          const ddgApiUrl = `https://api.duckduckgo.com/?q=${encodeURIComponent(cleanQuery)}&format=json&no_html=1&skip_disambig=1`;
          const res = await fetch(ddgApiUrl, { signal: AbortSignal.timeout(4500) });
          if (!res.ok) return;
          const data = await res.json();
          if (data.AbstractText && data.AbstractURL && isValidResultUrl(data.AbstractURL)) {
            resultBlocks.push({
              title: data.Heading || cleanQuery,
              url: data.AbstractURL,
              snippet: decodeHTMLEntities(data.AbstractText),
              source: getHostname(data.AbstractURL),
              image: data.Image ? normalizeAbsoluteUrl(data.Image, data.AbstractURL) : '',
              type: 'article'
            });
          } else if (data.RelatedTopics && data.RelatedTopics.length > 0) {
            data.RelatedTopics
              .flatMap(t => t.Topics || [t])
              .filter(t => t.Text && t.FirstURL && isValidResultUrl(t.FirstURL))
              .slice(0, 4)
              .forEach((topic) => {
                resultBlocks.push({
                  title: topic.Text.split(' - ')[0] || cleanQuery,
                  url: topic.FirstURL,
                  snippet: decodeHTMLEntities(topic.Text),
                  source: getHostname(topic.FirstURL),
                  image: topic.Icon?.URL ? normalizeAbsoluteUrl(topic.Icon.URL, 'https://duckduckgo.com') : '',
                  type: 'article'
                });
              });
          }
        } catch (e) {
          console.error('DDG API error:', e.message);
        }
      })(),
      (async () => {
        try {
          const wikiUrl = `https://en.wikipedia.org/w/api.php?action=query&prop=extracts|pageimages&exintro=1&explaintext=1&pithumbsize=600&titles=${encodeURIComponent(cleanQuery)}&format=json&origin=*`;
          const wikiRes = await fetch(wikiUrl, { signal: AbortSignal.timeout(4500) });
          if (!wikiRes.ok) return;
          const wikiData = await wikiRes.json();
          const pages = wikiData.query ? wikiData.query.pages : null;
          if (!pages) return;
          const pageId = Object.keys(pages)[0];
          if (pageId !== '-1' && pages[pageId].extract) {
            const wikiText = pages[pageId].extract.substring(0, 450);
            const builtWikiUrl = buildWikipediaUrl(pages[pageId].title);
            const wikiThumb = pages[pageId].thumbnail?.source || '';
            if (builtWikiUrl) {
              resultBlocks.push({
                title: `Wikipedia: ${pages[pageId].title}`,
                url: builtWikiUrl,
                snippet: `${decodeHTMLEntities(wikiText)}...`,
                source: 'wikipedia.org',
                image: wikiThumb,
                type: 'article'
              });
            }
          }
        } catch (e) {
          console.error('Wikipedia API error:', e.message);
        }
      })()
    ];

    let videoResults = [];
    if (isVideoQuery) {
      parallelTasks.push((async () => {
        videoResults = await fetchYouTubeVideoResults(cleanQuery);
      })());
    }

    await Promise.all(parallelTasks);

    // DuckDuckGo HTML organic results when instant answers are thin
    if (resultBlocks.length < 6) {
      try {
        const ddgHtmlUrl = `https://html.duckduckgo.com/html/`;
        const res = await fetch(ddgHtmlUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
          },
          body: `q=${encodeURIComponent(cleanQuery)}`
        });
        if (res.ok) {
          const html = await res.text();
          const beforeOrganicCount = resultBlocks.length;
          const matches = html.matchAll(/<div class="result[\s\S]*?<\/div>\s*<\/div>/g);
          for (const match of matches) {
            const block = match[0];
            const titleMatch = block.match(/<a[^>]+class="result__a"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i);
            const snippetMatch = block.match(/<a class="result__snippet"[^>]*>([\s\S]*?)<\/a>/i) || block.match(/<div class="result__snippet"[^>]*>([\s\S]*?)<\/div>/i);
            if (!titleMatch) continue;
            const url = normalizeDdgUrl(titleMatch[1]);
            const title = stripTags(titleMatch[2]);
            const snippetText = stripTags(snippetMatch ? snippetMatch[1] : '');
            // Filter out junk/SEO aggregator boilerplates
            if (title && url && isValidResultUrl(url) && resultBlocks.length < 12 && !snippetText.toLowerCase().includes('stopwatch timer countdown') && !snippetText.toLowerCase().includes('calculator')) {
              resultBlocks.push({
                title,
                url,
                snippet: snippetText,
                source: getHostname(url),
                type: url.includes('youtube.com') ? 'video' : 'web'
              });
            }
          }
          if (resultBlocks.length === beforeOrganicCount) {
            const titleMatches = [...html.matchAll(/<a[^>]+class="result__a"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi)];
            const snippetMatches = [...html.matchAll(/<(?:a|div)[^>]+class="result__snippet"[^>]*>([\s\S]*?)<\/(?:a|div)>/gi)];
            titleMatches.slice(0, 8).forEach((titleMatch, index) => {
              const url = normalizeDdgUrl(titleMatch[1]);
              const title = stripTags(titleMatch[2]);
              const snippetText = stripTags(snippetMatches[index] ? snippetMatches[index][1] : '');
              if (title && url && isValidResultUrl(url) && resultBlocks.length < 12) {
                resultBlocks.push({
                  title,
                  url,
                  snippet: snippetText,
                  source: getHostname(url),
                  type: url.includes('youtube.com') ? 'video' : 'web'
                });
              }
            });
          }
        }
      } catch (e) {
        console.error('DDG HTML error:', e.message);
      }
    }

    const candidateResults = uniqueResults(resultBlocks).slice(0, 10);
    const verifiedResults = [];
    const verifications = await Promise.all(candidateResults.map(item => verifyUrl(item.url)));
    candidateResults.forEach((item, index) => {
      const verification = verifications[index];
      if (verification.ok) {
        verifiedResults.push({
          ...item,
          url: verification.finalUrl || item.url,
          source: getHostname(verification.finalUrl || item.url),
          status: verification.status,
          verified: true
        });
        return;
      }
      if (item.url && isValidResultUrl(item.url)) {
        verifiedResults.push({
          ...item,
          url: item.url,
          source: getHostname(item.url),
          status: verification.status || 0,
          verified: false
        });
      }
    });

    const results = verifiedResults.slice(0, 8);

    // Fetch page previews and high-res images for top results in parallel
    const previewTargets = results.slice(0, 8);
    const previews = await Promise.all(previewTargets.map(item => fetchPagePreview(item.url)));
    previews.forEach((preview, index) => {
      if (!preview) return;
      if (preview.title && preview.title.length > results[index].title.length) results[index].title = preview.title;
      if (preview.description && preview.description.length > results[index].snippet.length) results[index].snippet = preview.description;
      if (preview.image && !results[index].image) results[index].image = preview.image;
    });

    const fetchCount = Math.min(Math.max(Number(options.fetchCount) || 3, 1), 4);

    await Promise.all(results.slice(0, fetchCount).map(async (item) => {
      const page = await fetchWebPage(item.url, { maxChars: 4000, timeoutMs: 8000 });
      if (page.success && page.markdown && page.markdown.length > 120) {
        item.pageContent = page.markdown;
        if (page.title && page.title.length > 2) item.title = page.title;
        if (!item.snippet || item.snippet.length < 80) {
          item.snippet = page.plain.slice(0, 280);
        }
      }
    }));

    const shopping = isShoppingQuery(cleanQuery);
    const products = shopping
      ? results
          .filter(item => item.title && item.url)
          .slice(0, 8)
          .map((item) => ({
            title: item.title,
            url: item.url,
            source: item.source,
            snippet: item.snippet,
            price: extractPrice(`${item.title} ${item.snippet} ${item.pageContent || ''}`),
            image: item.image || '',
            type: cleanQuery.includes('course') || cleanQuery.includes('tutorial') ? 'course' : 'product'
          }))
      : [];

    const answerContext = results.map((item, index) => {
      const body = item.pageContent
        ? `Content excerpt:\n${item.pageContent.slice(0, 3000)}`
        : `Snippet: ${item.snippet || 'No snippet available.'}`;
      return `[${index + 1}] ${item.title}\nURL: ${item.url}\nSource: ${item.source}${item.verified === false ? ' (unverified link)' : ''}\n${body}`;
    }).join('\n\n');

    if (results.length === 0 && videoResults.length === 0) {
      return {
        success: true,
        query: cleanQuery,
        results: [],
        products: [],
        videos: [],
        answerContext: '',
        needsClarification: true,
        clarification: `I could not find reliable web results for "${cleanQuery}". Try adding a brand, location, budget, or date range.`
      };
    }

    const hasRichResult = results.some(item =>
      (item.snippet || '').trim().length > 40 || (item.pageContent || '').trim().length > 80
    ) || videoResults.length > 0;

    const payload = {
      success: true,
      query: cleanQuery,
      results,
      products,
      videos: videoResults,
      answerContext,
      searchProvider: 'duckduckgo+wiki+hybrid',
      needsClarification: results.length === 0 || !hasRichResult,
      clarification: results.length === 0
        ? `I could not find web results for "${cleanQuery}". Try adding a brand, location, budget, or date range.`
        : (!hasRichResult ? `I found links for "${cleanQuery}" but could not extract enough detail. Try a more specific query.` : '')
    };

    // Save into semantic memory cache
    searchMemoryCache.set(cacheKey, { timestamp: Date.now(), data: payload });

    return payload;
  });

  ipcMain.handle('fetch-web-page', async (_event, url) => {
    try {
      const mcpStatus = mcpManager.getMcpStatus();
      if (mcpStatus.connected.includes('fetch')) {
        const mcpResult = await mcpManager.callMcpTool('fetch', 'fetch_markdown', { url: String(url || '') });
        if (mcpResult.success && mcpResult.text) {
          return { success: true, markdown: mcpResult.text, source: 'mcp-fetch-server' };
        }
      }
    } catch (e) { /* fall through to native fetch */ }
    return fetchWebPage(url);
  });

  ipcMain.handle('get-mcp-status', async () => mcpManager.getMcpStatus());

  ipcMain.handle('get-mcp-registry', async () => mcpManager.getMcpRegistry());

  ipcMain.handle('toggle-mcp-server', async (_event, payload) => {
    try {
      const serverId = payload && payload.serverId;
      const enable = payload && payload.enable !== false;
      return await mcpManager.toggleMcpServer(serverId, enable);
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('save-custom-mcp-server', async (_event, payload) => {
    try {
      return await mcpManager.saveCustomMcpServer(payload);
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('delete-custom-mcp-server', async (_event, payload) => {
    try {
      const serverId = typeof payload === 'string' ? payload : payload?.serverId;
      return await mcpManager.deleteCustomMcpServer(serverId);
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('mcp-call-tool', async (_event, payload) => {
    const serverId = payload && payload.serverId;
    const toolName = payload && payload.toolName;
    const args = (payload && payload.args) || {};
    if (!serverId || !toolName) {
      return { success: false, error: 'serverId and toolName are required.' };
    }
    try {
      return await mcpManager.callMcpTool(serverId, toolName, args);
    } catch (err) {
      return { success: false, error: err.message || 'MCP tool call failed.' };
    }
  });

  // Floating Bar IPC Handlers
  ipcMain.handle('floating-bar:toggle', async () => {
    try {
      const { toggleFloatingBar } = require('./floating-bar-window');
      toggleFloatingBar();
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('floating-bar:hide', async (_event, payload) => {
    try {
      const { hideFloatingBar } = require('./floating-bar-window');
      const force = payload && payload.force !== undefined ? payload.force : true;
      hideFloatingBar(force);
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('floating-bar:expand-to-main', async (_event, payload) => {
    try {
      const { expandToMainWindow } = require('./floating-bar-window');
      expandToMainWindow(payload);
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('floating-bar:set-mode', async (_event, { miniMode }) => {
    try {
      const { setFloatingBarMode } = require('./floating-bar-window');
      setFloatingBarMode(miniMode);
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('floating-bar:get-clipboard', async () => {
    try {
      const text = clipboard.readText() || '';
      return { success: true, text };
    } catch (err) {
      return { success: false, text: '', error: err.message };
    }
  });

  ipcMain.handle('floating-bar:sync-session', async (_event, payload) => {
    try {
      if (mainWindow && !mainWindow.isDestroyed() && mainWindow.webContents) {
        mainWindow.webContents.send('floating-bar:session-created', payload);
      }
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  // Reveal file or folder in Windows File Explorer
  ipcMain.handle('show-item-in-folder', async (_event, targetPath) => {
    try {
      if (!targetPath) return { success: false, error: 'Path required' };
      const resolved = path.resolve(targetPath);
      if (fs.existsSync(resolved)) {
        shell.showItemInFolder(resolved);
        return { success: true, path: resolved };
      }
      return { success: false, error: 'File not found on disk' };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  // Open file or folder directly with default Windows application
  ipcMain.handle('open-file-or-path', async (_event, targetPath) => {
    try {
      if (!targetPath) return { success: false, error: 'Path required' };
      const resolved = path.resolve(targetPath);
      if (fs.existsSync(resolved)) {
        const openErr = await shell.openPath(resolved);
        return { success: !openErr, error: openErr || null, path: resolved };
      }
      return { success: false, error: 'File not found on disk' };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  // Check whether a file or folder exists on disk (used to enable/repair file action buttons)
  ipcMain.handle('file-exists', async (_event, targetPath) => {
    try {
      if (!targetPath) return { exists: false };
      const resolved = path.resolve(targetPath);
      return { exists: fs.existsSync(resolved), path: resolved };
    } catch (err) {
      return { exists: false, error: err.message };
    }
  });

  // Foreground window title — used by the planner's post-action verification
  ipcMain.handle('get-active-window', async () => {
    try {
      const title = await getActiveWindowAppName();
      return { success: Boolean(title), title: title || '' };
    } catch (err) {
      return { success: false, title: '', error: err.message };
    }
  });

  // Check Windows UI Automation installation status
  ipcMain.handle('check-mcp-windows-uia', async () => {
    try {
      const uia = require('./mcp-windows-uia');
      const exe = uia.resolveWindowsUiaExecutable({ userDataPath: getConnectorsRoot() });
      return { installed: Boolean(exe), exePath: exe || null };
    } catch (err) {
      return { installed: false, error: err.message };
    }
  });

  // Download default Kokoro voices for onboarding (Bella & Michael)
  ipcMain.handle('download-kokoro-onboarding-voices', async (event) => {
    try {
      const { downloadKokoroOnboardingDefaults } = require('./voice-kokoro');
      return await downloadKokoroOnboardingDefaults((payload) => {
        if (event.sender && !event.sender.isDestroyed()) {
          event.sender.send('download-progress', {
            modelName: 'tts-kokoro-onboarding',
            ...payload
          });
        }
      });
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('desktop-sync:get-info', async () => {
    try {
      const { getSyncInfo } = require('./desktop-sync-server');
      return { success: true, ...getSyncInfo() };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('desktop-sync:list-devices', async () => {
    try {
      const { listPairedDevices } = require('./desktop-sync-server');
      return { success: true, devices: listPairedDevices() };
    } catch (err) {
      return { success: false, error: err.message, devices: [] };
    }
  });

  ipcMain.handle('desktop-sync:revoke-device', async (_event, idOrPrefix) => {
    try {
      const { revokePairedDevice } = require('./desktop-sync-server');
      return revokePairedDevice(idOrPrefix);
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('desktop-sync:clear-previous-devices', async () => {
    try {
      const { clearPreviousDevices } = require('./desktop-sync-server');
      return clearPreviousDevices();
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('desktop-sync:create-pair-code', async () => {
    try {
      const { createDesktopPairCode } = require('./desktop-sync-server');
      return createDesktopPairCode();
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('desktop-sync:deny-pair', async () => {
    try {
      const { denyPendingPair } = require('./desktop-sync-server');
      denyPendingPair();
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('desktop-sync:approve-chats', async () => {
    try {
      const { resolveChatConsent } = require('./desktop-sync-server');
      resolveChatConsent(true);
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('desktop-sync:deny-chats', async () => {
    try {
      const { resolveChatConsent } = require('./desktop-sync-server');
      resolveChatConsent(false);
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  // ==========================================
  // MULTI-PROVIDER MODEL HUB IPC HANDLERS
  // ==========================================
  ipcMain.handle('save-provider-keys', async (_event, keys = {}) => {
    try {
      const configPath = path.join(app.getPath('userData'), 'ultron-config.json');
      let config = {};
      if (fs.existsSync(configPath)) {
        try { config = JSON.parse(fs.readFileSync(configPath, 'utf8')); } catch (e) {}
      }
      config.providerKeys = { ...(config.providerKeys || {}), ...keys };
      if (keys.gemini) config.geminiApiKey = keys.gemini;
      if (keys.customUrl) config.customEndpointUrl = keys.customUrl;
      fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf8');
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('load-provider-keys', async () => {
    try {
      const configPath = path.join(app.getPath('userData'), 'ultron-config.json');
      if (fs.existsSync(configPath)) {
        const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
        const keys = config.providerKeys || {};
        if (!keys.gemini && config.geminiApiKey) keys.gemini = config.geminiApiKey;
        if (!keys.customUrl && config.customEndpointUrl) keys.customUrl = config.customEndpointUrl;
        return { success: true, keys };
      }
      return { success: true, keys: {} };
    } catch (err) {
      return { success: false, error: err.message, keys: {} };
    }
  });

  // ==========================================
  // LOCAL VECTOR RAG KNOWLEDGE BASE IPC HANDLERS
  // ==========================================
  ipcMain.handle('rag:add-sources', async (_event, targetPaths = []) => {
    try {
      const rag = require('./rag-engine');
      return await rag.addSources(targetPaths);
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('rag:remove-source', async (_event, sourcePath) => {
    try {
      const rag = require('./rag-engine');
      return await rag.removeSource(sourcePath);
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('rag:reindex', async (event) => {
    try {
      const rag = require('./rag-engine');
      return await rag.reindexAll((progress) => {
        event.sender.send('rag:index-progress', progress);
      });
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('rag:auto-add', async (_event, sourcePath) => {
    try {
      const rag = require('./rag-engine');
      return await rag.autoAddSource(sourcePath);
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('rag:index-file', async (_event, filePath) => {
    try {
      const rag = require('./rag-engine');
      return await rag.indexFile(filePath);
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('rag:index-text', async (_event, payload = {}) => {
    try {
      const rag = require('./rag-engine');
      const { id, title, content, metadata } = payload;
      return await rag.indexTextContent(id, title, content, metadata);
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('rag:search', async (_event, payload = {}) => {
    try {
      const rag = require('./rag-engine');
      const query = typeof payload === 'string' ? payload : (payload.query || '');
      const options = typeof payload === 'object' ? payload : {};
      const results = await rag.searchKnowledge(query, options);
      return { success: true, results };
    } catch (err) {
      return { success: false, error: err.message, results: [] };
    }
  });

  ipcMain.handle('rag:clear', async () => {
    try {
      const rag = require('./rag-engine');
      return rag.clearIndex();
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('rag:get-stats', async () => {
    try {
      const rag = require('./rag-engine');
      return { success: true, ...rag.getStats() };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  // ==========================================
  // NATIVE WINDOWS SYSTEM CONTROLS IPC HANDLERS
  // ==========================================
  ipcMain.handle('windows:get-volume', async () => {
    try {
      const winCtrl = require('./windows-controls');
      return await winCtrl.getVolume();
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('windows:set-volume', async (_event, level) => {
    try {
      const winCtrl = require('./windows-controls');
      return await winCtrl.setVolume(level);
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('windows:toggle-mute', async () => {
    try {
      const winCtrl = require('./windows-controls');
      return await winCtrl.toggleMute();
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('windows:media-key', async (_event, action) => {
    try {
      const winCtrl = require('./windows-controls');
      return await winCtrl.sendMediaKey(action);
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('windows:lock', async () => {
    try {
      const winCtrl = require('./windows-controls');
      return await winCtrl.lockWorkstation();
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('windows:sleep', async () => {
    try {
      const winCtrl = require('./windows-controls');
      return await winCtrl.sleepSystem();
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('windows:restart', async () => {
    try {
      const winCtrl = require('./windows-controls');
      return await winCtrl.restartSystem();
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('windows:get-brightness', async () => {
    try {
      const winCtrl = require('./windows-controls');
      return await winCtrl.getBrightness();
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('windows:set-brightness', async (_event, level) => {
    try {
      const winCtrl = require('./windows-controls');
      return await winCtrl.setBrightness(level);
    } catch (err) {
      return { success: false, error: err.message };
    }
  });
}

module.exports = {
  setupIpcHandlers,
  setMainWindow
};

