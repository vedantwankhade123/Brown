/**
 * Ultron MCP Manager & Server Registry Hub
 * Integrates Awesome Model Context Protocol (MCP) servers:
 * - Web & Browser Automation (Playwright/Puppeteer)
 * - Local Filesystem Sandbox (@modelcontextprotocol/server-filesystem)
 * - Web Fetch & Markdown Scraper (mcp-fetch-server)
 * - Windows UI Automation (mcp-windows-uia)
 * - Awesome MCP Store Catalog & Dynamic User Server Registry
 */
const path = require('path');
const os = require('os');
const fs = require('fs');
const { app } = require('electron');
const { Client } = require('@modelcontextprotocol/sdk/client');
const { StdioClientTransport } = require('@modelcontextprotocol/sdk/client/stdio.js');
const { resolveWindowsUiaExecutable, ensureWindowsUiaInstalled } = require('./mcp-windows-uia');

const _servers = new Map();

// Built-in Awesome MCP Server Catalog
const DEFAULT_MCP_CATALOG = [
  {
    id: 'web-browser',
    name: 'Web & Headless Browser Automation',
    category: 'Web & Research',
    description: 'Autonomous browser automation using Playwright. Navigate web pages, click elements, fill forms, and take screenshots.',
    command: 'npx',
    args: ['-y', '@executeautomation/playwright-mcp-server'],
    icon: '🌐',
    enabled: true,
    preinstalled: true
  },
  {
    id: 'filesystem',
    name: 'Local File Sandbox',
    category: 'Filesystem',
    description: 'Sandboxed file management with directory traversal, reading, editing, diffing, and searching files.',
    command: 'internal',
    icon: '📁',
    enabled: true,
    preinstalled: true
  },
  {
    id: 'fetch',
    name: 'Web Fetch & Markdown Scraper',
    category: 'Web & Research',
    description: 'High-speed web scraping converting HTML directly to clean, formatted Markdown for RAG and search.',
    command: 'internal',
    icon: '📄',
    enabled: true,
    preinstalled: true
  },
  {
    id: 'sqlite',
    name: 'SQLite Database Explorer',
    category: 'Databases',
    description: 'Direct SQL schema exploration, table inspection, and analytical queries on local SQLite databases.',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-sqlite'],
    icon: '💾',
    enabled: false,
    preinstalled: false
  },
  {
    id: 'github',
    name: 'GitHub Repository Manager',
    category: 'Developer Tools',
    description: 'Manage GitHub repositories, search code, create issues, and review pull request diffs directly.',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-github'],
    env: { GITHUB_PERSONAL_ACCESS_TOKEN: '' },
    icon: '🐙',
    enabled: false,
    preinstalled: false
  },
  {
    id: 'memory',
    name: 'Persistent Knowledge Graph Memory',
    category: 'Memory & Knowledge',
    description: 'Open-source graph-based persistent entity and relationship memory for long-term agent reasoning.',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-memory'],
    icon: '🧠',
    enabled: false,
    preinstalled: false
  },
  {
    id: 'windows-uia',
    name: 'Windows Desktop UI Automation (UIA)',
    category: 'Operating System',
    description: 'Native Windows accessibility automation inspecting active windows, control trees, and system dialogs.',
    command: 'internal',
    icon: '🪟',
    enabled: true,
    preinstalled: true
  }
];

function resolvePackageEntry(packageName) {
  try {
    const pkgJson = require.resolve(`${packageName}/package.json`);
    return path.join(path.dirname(pkgJson), 'dist', 'index.js');
  } catch (e) {
    return '';
  }
}

function defaultAllowedPaths() {
  const home = os.homedir();
  const dataDir = process.env.ULTRON_DATA_DIR || path.join(home, 'Documents');
  return [home, dataDir, path.join(home, 'Desktop'), path.join(home, 'Documents')].filter(Boolean);
}

function spawnEnv(extra = {}) {
  const env = { ...process.env, ...extra };
  if (process.versions && process.versions.electron) {
    env.ELECTRON_RUN_AS_NODE = '1';
  }
  return env;
}

function getMcpConfigPath() {
  const baseDir = app && typeof app.getPath === 'function' 
    ? app.getPath('userData') 
    : path.join(os.homedir(), '.ultron');
  return path.join(baseDir, 'mcp-config.json');
}

function loadMcpConfig() {
  const configPath = getMcpConfigPath();
  try {
    if (fs.existsSync(configPath)) {
      const data = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      return {
        servers: data.servers || {},
        customServers: data.customServers || []
      };
    }
  } catch (err) {
    console.warn('Error reading mcp-config.json:', err.message);
  }
  return { servers: {}, customServers: [] };
}

function saveMcpConfig(config) {
  const configPath = getMcpConfigPath();
  try {
    const dir = path.dirname(configPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf8');
  } catch (err) {
    console.warn('Error saving mcp-config.json:', err.message);
  }
}

function resolveNpxExecutable() {
  const isWin = process.platform === 'win32';
  const cmd = isWin ? 'npx.cmd' : 'npx';

  const candidates = [
    path.join(process.env.ProgramFiles || 'C:\\Program Files', 'nodejs', cmd),
    path.join(process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)', 'nodejs', cmd),
    path.join(os.homedir(), 'AppData', 'Roaming', 'npm', cmd),
    path.join(os.homedir(), 'AppData', 'Roaming', 'nvm', 'current', cmd)
  ];

  for (const candidate of candidates) {
    if (candidate && fs.existsSync(candidate)) return candidate;
  }

  try {
    const { execFileSync } = require('child_process');
    const whereCmd = isWin ? 'where.exe' : 'which';
    const output = execFileSync(whereCmd, [cmd], { encoding: 'utf8', windowsHide: true });
    const first = output.split(/\r?\n/).map(line => line.trim()).find(Boolean);
    if (first && fs.existsSync(first)) return first;
  } catch (e) { /* fall through */ }

  return cmd;
}

function resolveNodeExecutable() {
  const fromEnv = process.env.ULTRON_NODE_PATH || process.env.npm_node_execpath;
  if (fromEnv && fs.existsSync(fromEnv)) return fromEnv;

  const candidates = [
    path.join(process.env.ProgramFiles || 'C:\\Program Files', 'nodejs', 'node.exe'),
    path.join(process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)', 'nodejs', 'node.exe'),
    path.join(os.homedir(), 'AppData', 'Roaming', 'nvm', 'current', 'node.exe')
  ];

  for (const candidate of candidates) {
    if (candidate && fs.existsSync(candidate)) return candidate;
  }

  if (!process.versions.electron) return process.execPath;

  try {
    const { execFileSync } = require('child_process');
    const whereCmd = process.platform === 'win32' ? 'where.exe' : 'which';
    const output = execFileSync(whereCmd, ['node'], { encoding: 'utf8', windowsHide: true });
    const first = output.split(/\r?\n/).map(line => line.trim()).find(Boolean);
    if (first && fs.existsSync(first)) return first;
  } catch (e) { /* fall through */ }

  return 'node';
}

function resolveUvxPath() {
  const fromEnv = process.env.ULTRON_UVX_PATH || process.env.UVX_PATH;
  if (fromEnv && fs.existsSync(fromEnv)) return fromEnv;

  const candidates = [
    path.join(os.homedir(), '.local', 'bin', 'uvx.exe'),
    path.join(os.homedir(), 'AppData', 'Local', 'Programs', 'uv', 'uvx.exe'),
    path.join(process.env.ProgramFiles || 'C:\\Program Files', 'uv', 'uvx.exe'),
    path.join(process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)', 'uv', 'uvx.exe')
  ];

  for (const candidate of candidates) {
    if (candidate && fs.existsSync(candidate)) return candidate;
  }
  return null;
}

async function connectServer(id, { command, args = [], env = spawnEnv() }) {
  if (_servers.has(id)) return _servers.get(id);

  const transport = new StdioClientTransport({
    command,
    args,
    env,
    stderr: 'pipe'
  });

  const client = new Client({ name: 'ultron', version: '1.0.14' }, { capabilities: {} });
  try {
    await client.connect(transport);
  } catch (err) {
    try {
      await transport.close();
    } catch (e) { /* ignore */ }
    throw err;
  }

  const entry = { id, client, transport, tools: [] };
  try {
    const listed = await client.listTools();
    entry.tools = (listed && listed.tools) ? listed.tools.map(t => t.name) : [];
  } catch (e) {
    entry.tools = [];
  }
  _servers.set(id, entry);
  return entry;
}

async function disconnectServer(id) {
  const entry = _servers.get(id);
  if (!entry) return;
  try {
    await entry.client.close();
  } catch (e) { /* ignore */ }
  _servers.delete(id);
}

// 1. Filesystem Sandbox Server
async function startFilesystemServer(allowedPaths) {
  const roots = (Array.isArray(allowedPaths) && allowedPaths.length ? allowedPaths : defaultAllowedPaths())
    .map(p => path.resolve(p))
    .filter((p, i, arr) => arr.indexOf(p) === i);

  const serverScript = resolvePackageEntry('@modelcontextprotocol/server-filesystem');
  if (!serverScript) {
    throw new Error('@modelcontextprotocol/server-filesystem package entry not found.');
  }

  return connectServer('filesystem', {
    command: process.execPath,
    args: [serverScript, ...roots]
  });
}

// 2. Web Fetch Server
async function startFetchServer() {
  const serverScript = resolvePackageEntry('mcp-fetch-server');
  if (!serverScript) return null;

  const nodePath = resolveNodeExecutable();
  return connectServer('fetch', {
    command: nodePath,
    args: [serverScript],
    env: spawnEnv()
  });
}

async function startFetchServerWithRetry(retries = 2) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      if (_servers.has('fetch')) return _servers.get('fetch');
      const srv = await startFetchServer();
      if (srv) return srv;
    } catch (err) {
      if (attempt === retries) throw err;
      await new Promise(r => setTimeout(r, 400 * (attempt + 1)));
    }
  }
  return null;
}

// 3. Web & Browser Automation Server (Playwright)
async function startBrowserServer(options = {}) {
  const npxPath = resolveNpxExecutable();
  const args = options.args || ['-y', '@executeautomation/playwright-mcp-server'];
  return connectServer('web-browser', {
    command: npxPath,
    args,
    env: spawnEnv(options.env || {})
  });
}

// 4. Windows MCP Server (uvx)
async function startWindowsMcpServer(options = {}) {
  const uvxPath = resolveUvxPath();
  if (!uvxPath) return null;

  const excludeTools = options.excludeTools || 'PowerShell,Registry';
  const args = ['windows-mcp', 'serve'];
  if (excludeTools) args.push('--exclude-tools', excludeTools);

  const env = spawnEnv({
    ANONYMIZED_TELEMETRY: 'false',
    ...(options.env || {})
  });

  return connectServer('windows', {
    command: uvxPath,
    args,
    env
  });
}

// 5. Windows UIA Server
async function startWindowsUiaServer(options = {}) {
  if (process.platform !== 'win32') return null;

  const uiaOptions = {
    ...options,
    legacyUserDataPath: options.legacyUserDataPath || (app && app.getPath ? app.getPath('userData') : '')
  };

  let exePath = resolveWindowsUiaExecutable(uiaOptions);
  if (!exePath && options.autoInstall !== false) {
    const installed = await ensureWindowsUiaInstalled(uiaOptions);
    if (installed.success) exePath = installed.exePath;
  }
  if (!exePath) return null;

  return connectServer('windows-uia', {
    command: exePath,
    args: options.args || [],
    env: spawnEnv(options.env || {})
  });
}

// Initialize all configured and enabled MCP servers
async function initializeMcp(options = {}) {
  const cfg = loadMcpConfig();
  const status = {
    filesystem: false,
    fetch: false,
    webBrowser: false,
    windows: false,
    windowsUia: false,
    custom: {},
    tools: [],
    errors: []
  };

  // 1. Filesystem Sandbox
  if (cfg.servers['filesystem'] !== false) {
    try {
      const fsSrv = await startFilesystemServer(options.allowedPaths);
      status.filesystem = true;
      status.tools.push(...fsSrv.tools.map(name => `filesystem:${name}`));
    } catch (err) {
      status.errors.push(`filesystem: ${err.message}`);
    }
  }

  // 2. Fetch Server
  if (cfg.servers['fetch'] !== false) {
    try {
      const fetchSrv = await startFetchServerWithRetry();
      if (fetchSrv) {
        status.fetch = true;
        status.tools.push(...fetchSrv.tools.map(name => `fetch:${name}`));
      }
    } catch (err) {
      status.errors.push(`fetch: ${err.message}`);
    }
  }

  // 3. Web & Browser Automation (Playwright)
  if (cfg.servers['web-browser'] !== false) {
    try {
      const browserSrv = await startBrowserServer();
      if (browserSrv) {
        status.webBrowser = true;
        status.tools.push(...browserSrv.tools.map(name => `web-browser:${name}`));
      }
    } catch (err) {
      status.errors.push(`web-browser: ${err.message} (on-demand start available)`);
    }
  }

  // 4. Windows UIA
  if (options.windowsUiaMcp !== false && process.platform === 'win32' && cfg.servers['windows-uia'] !== false) {
    try {
      const uiaSrv = await startWindowsUiaServer({
        userDataPath: options.userDataPath,
        autoInstall: options.windowsUiaAutoInstall !== false,
        ...(options.windowsUiaMcp || {})
      });
      if (uiaSrv) {
        status.windowsUia = true;
        status.tools.push(...uiaSrv.tools.map(name => `windows-uia:${name}`));
      }
    } catch (err) {
      status.errors.push(`windows-uia: ${err.message}`);
    }
  }

  // 5. Connect any custom configured servers
  for (const custom of (cfg.customServers || [])) {
    if (custom.enabled && custom.command && custom.id) {
      try {
        const srv = await connectServer(custom.id, {
          command: custom.command === 'npx' ? resolveNpxExecutable() : custom.command,
          args: custom.args || [],
          env: spawnEnv(custom.env || {})
        });
        if (srv) {
          status.custom[custom.id] = true;
          status.tools.push(...srv.tools.map(name => `${custom.id}:${name}`));
        }
      } catch (err) {
        status.errors.push(`${custom.id}: ${err.message}`);
      }
    }
  }

  return status;
}

// Toggle or connect/disconnect a specific MCP server
async function toggleMcpServer(serverId, enable) {
  const cfg = loadMcpConfig();
  cfg.servers[serverId] = Boolean(enable);
  saveMcpConfig(cfg);

  if (enable) {
    if (serverId === 'filesystem') await startFilesystemServer();
    else if (serverId === 'fetch') await startFetchServer();
    else if (serverId === 'web-browser') await startBrowserServer();
    else if (serverId === 'windows-uia') await startWindowsUiaServer();
    else {
      const custom = (cfg.customServers || []).find(s => s.id === serverId);
      if (custom) {
        await connectServer(custom.id, {
          command: custom.command === 'npx' ? resolveNpxExecutable() : custom.command,
          args: custom.args || [],
          env: spawnEnv(custom.env || {})
        });
      }
    }
  } else {
    await disconnectServer(serverId);
  }

  return getMcpRegistry();
}

// Register or update a custom MCP Server
async function saveCustomMcpServer(serverConfig) {
  if (!serverConfig || !serverConfig.id || !serverConfig.command) {
    throw new Error('Server ID and command are required.');
  }

  const cfg = loadMcpConfig();
  const existingIdx = cfg.customServers.findIndex(s => s.id === serverConfig.id);
  if (existingIdx >= 0) {
    cfg.customServers[existingIdx] = { ...cfg.customServers[existingIdx], ...serverConfig };
  } else {
    cfg.customServers.push({
      enabled: true,
      category: 'Custom MCP Server',
      icon: '⚡',
      ...serverConfig
    });
  }

  saveMcpConfig(cfg);

  if (serverConfig.enabled !== false) {
    try {
      await connectServer(serverConfig.id, {
        command: serverConfig.command === 'npx' ? resolveNpxExecutable() : serverConfig.command,
        args: serverConfig.args || [],
        env: spawnEnv(serverConfig.env || {})
      });
    } catch (e) {
      console.warn(`Custom server ${serverConfig.id} connect failed:`, e.message);
    }
  }

  return getMcpRegistry();
}

// Delete custom server
async function deleteCustomMcpServer(serverId) {
  await disconnectServer(serverId);
  const cfg = loadMcpConfig();
  cfg.customServers = (cfg.customServers || []).filter(s => s.id !== serverId);
  delete cfg.servers[serverId];
  saveMcpConfig(cfg);
  return getMcpRegistry();
}

// Get full registry details for UI Store & Settings
function getMcpRegistry() {
  const cfg = loadMcpConfig();
  const connectedKeys = [..._servers.keys()];

  const catalog = DEFAULT_MCP_CATALOG.map(item => ({
    ...item,
    enabled: cfg.servers[item.id] !== undefined ? Boolean(cfg.servers[item.id]) : Boolean(item.enabled),
    connected: connectedKeys.includes(item.id),
    tools: _servers.get(item.id)?.tools || []
  }));

  const custom = (cfg.customServers || []).map(item => ({
    ...item,
    enabled: Boolean(item.enabled),
    connected: connectedKeys.includes(item.id),
    tools: _servers.get(item.id)?.tools || []
  }));

  return {
    catalog,
    custom,
    connected: connectedKeys,
    allTools: [..._servers.values()].flatMap(s => s.tools.map(t => `${s.id}:${t}`))
  };
}

async function callMcpTool(serverId, toolName, args = {}) {
  const entry = _servers.get(serverId);
  if (!entry) throw new Error(`MCP server "${serverId}" is not connected.`);

  const result = await entry.client.callTool({ name: toolName, arguments: args });
  const textParts = (result.content || [])
    .filter(part => part.type === 'text')
    .map(part => part.text);
  return {
    success: !result.isError,
    text: textParts.join('\n\n'),
    raw: result
  };
}

function getMcpStatus() {
  return {
    connected: [..._servers.keys()],
    tools: [..._servers.values()].flatMap(s => s.tools.map(t => `${s.id}:${t}`))
  };
}

async function shutdownMcp() {
  for (const entry of _servers.values()) {
    try {
      await entry.client.close();
    } catch (e) { /* ignore */ }
  }
  _servers.clear();
}

module.exports = {
  initializeMcp,
  callMcpTool,
  getMcpStatus,
  getMcpRegistry,
  toggleMcpServer,
  saveCustomMcpServer,
  deleteCustomMcpServer,
  shutdownMcp,
  startFilesystemServer,
  startFetchServer,
  startBrowserServer,
  startWindowsMcpServer,
  startWindowsUiaServer,
  isServerConnected: id => _servers.has(id),
  resolveNpxExecutable,
  resolveNodeExecutable,
  resolveUvxPath,
  ensureWindowsUiaInstalled: require('./mcp-windows-uia').ensureWindowsUiaInstalled
};
