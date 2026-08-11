/**
 * MCP client manager — integrates official MCP servers (filesystem, fetch patterns).
 * Inspired by modelcontextprotocol/servers, OpenJarvis tool layer, omega-agent MCP client.
 */
const path = require('path');
const os = require('os');
const fs = require('fs');
const { app } = require('electron');
const { Client } = require('@modelcontextprotocol/sdk/client');
const { StdioClientTransport } = require('@modelcontextprotocol/sdk/client/stdio.js');
const { resolveWindowsUiaExecutable, ensureWindowsUiaInstalled } = require('./mcp-windows-uia');

const _servers = new Map();

function resolvePackageEntry(packageName) {
  const pkgJson = require.resolve(`${packageName}/package.json`);
  return path.join(path.dirname(pkgJson), 'dist', 'index.js');
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

async function connectServer(id, { command, args, env = spawnEnv() }) {
  if (_servers.has(id)) return _servers.get(id);

  const transport = new StdioClientTransport({
    command,
    args,
    env,
    stderr: 'pipe'
  });

  const client = new Client({ name: 'ultron', version: '1.0.6' }, { capabilities: {} });
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

async function startFilesystemServer(allowedPaths) {
  const roots = (Array.isArray(allowedPaths) && allowedPaths.length ? allowedPaths : defaultAllowedPaths())
    .map(p => path.resolve(p))
    .filter((p, i, arr) => arr.indexOf(p) === i);

  const serverScript = resolvePackageEntry('@modelcontextprotocol/server-filesystem');
  return connectServer('filesystem', {
    command: process.execPath,
    args: [serverScript, ...roots]
  });
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

async function startFetchServer() {
  try {
    const serverScript = resolvePackageEntry('mcp-fetch-server');
    // mcp-fetch-server is ESM + jsdom — must use system Node, not Electron's runtime
    const nodePath = resolveNodeExecutable();
    return connectServer('fetch', {
      command: nodePath,
      args: [serverScript],
      env: spawnEnv()
    });
  } catch (e) {
    return null;
  }
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

async function disconnectServer(id) {
  const entry = _servers.get(id);
  if (!entry) return;
  try {
    await entry.client.close();
  } catch (e) { /* ignore */ }
  _servers.delete(id);
}

async function startWindowsUiaServer(options = {}) {
  if (process.platform !== 'win32') return null;

  const uiaOptions = {
    ...options,
    legacyUserDataPath: options.legacyUserDataPath || app.getPath('userData')
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

function isServerConnected(id) {
  return _servers.has(id);
}

async function initializeMcp(options = {}) {
  const status = {
    filesystem: false,
    fetch: false,
    windows: false,
    windowsUia: false,
    tools: [],
    errors: []
  };

  try {
    const fsSrv = await startFilesystemServer(options.allowedPaths);
    status.filesystem = true;
    status.tools.push(...fsSrv.tools.map(name => `filesystem:${name}`));
  } catch (err) {
    status.errors.push(`filesystem: ${err.message}`);
  }

  try {
    const fetchSrv = await startFetchServerWithRetry();
    if (fetchSrv) {
      status.fetch = true;
      status.tools.push(...fetchSrv.tools.map(name => `fetch:${name}`));
    }
  } catch (err) {
    status.errors.push(`fetch: ${err.message} (native web-fetch fallback active)`);
  }

  if (options.windowsMcp !== false) {
    try {
      const winSrv = await startWindowsMcpServer(options.windowsMcp || {});
      if (winSrv) {
        status.windows = true;
        status.tools.push(...winSrv.tools.map(name => `windows:${name}`));
      } else if (!resolveUvxPath()) {
        status.errors.push('windows: uvx not found — install uv (https://astral.sh/uv) for Windows-MCP desktop automation');
      }
    } catch (err) {
      status.errors.push(`windows: ${err.message}`);
    }
  }

  if (options.windowsUiaMcp !== false && process.platform === 'win32') {
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

  return status;
}

async function reconnectWindowsUia(options = {}) {
  await disconnectServer('windows-uia');
  const uiaSrv = await startWindowsUiaServer(options);
  return {
    windowsUia: Boolean(uiaSrv),
    tools: getMcpStatus().tools
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
  shutdownMcp,
  startFilesystemServer,
  startWindowsMcpServer,
  startWindowsUiaServer,
  reconnectWindowsUia,
  isServerConnected,
  resolveUvxPath,
  resolveNodeExecutable,
  ensureWindowsUiaInstalled: require('./mcp-windows-uia').ensureWindowsUiaInstalled
};
