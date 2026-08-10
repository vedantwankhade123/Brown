const { contextBridge, ipcRenderer } = require('electron');

// Require the copied CommonJS file directly
const marked = require('./marked.cjs');

// Configure marked options
marked.setOptions({
  gfm: true,
  breaks: true
});

contextBridge.exposeInMainWorld('ultronAPI', {
  // Markdown parser
  parseMarkdown: (text) => marked.parse(text),
  // Profiling & setup queries
  profileSystem: () => ipcRenderer.invoke('profile-system'),
  getSystemEnvironment: () => ipcRenderer.invoke('system-environment'),
  
  // Security state operations
  getSecurityMode: () => ipcRenderer.invoke('get-security-mode'),
  setSecurityMode: (mode) => ipcRenderer.invoke('set-security-mode', mode),
  
  // Action execution loops
  executeAction: (payload) => ipcRenderer.invoke('execute-action', payload),
  launchSandbox: (hostPath) => ipcRenderer.invoke('launch-sandbox', hostPath),
  readFile: (filePath) => ipcRenderer.invoke('read-file', filePath),
  writeFile: (filePath, content) => ipcRenderer.invoke('write-file', { filePath, content }),
  listDir: (dirPath) => ipcRenderer.invoke('list-dir', dirPath),
  openExternal: (url) => ipcRenderer.invoke('open-external', url),
  searchWeb: (query) => ipcRenderer.invoke('search-web', query),
  
  // Apps & connector installs
  getInstalledApps: () => ipcRenderer.invoke('get-installed-apps'),
  downloadModel: (modelName) => ipcRenderer.invoke('download-model', modelName),
  cancelDownloadModel: (modelName) => ipcRenderer.invoke('cancel-download-model', modelName),
  installOllama: () => ipcRenderer.invoke('install-ollama'),
  checkOllamaInstalled: () => ipcRenderer.invoke('check-ollama-installed'),
  startOllamaService: (exePath) => ipcRenderer.invoke('start-ollama-service', exePath),
  selectDirectory: () => ipcRenderer.invoke('select-directory'),
  updateDataDir: (customPath) => ipcRenderer.invoke('update-data-dir', customPath),
  getDefaultDataDir: () => ipcRenderer.invoke('get-default-data-dir'),
  saveConversations: (dataStr) => ipcRenderer.invoke('save-conversations', dataStr),
  loadConversations: () => ipcRenderer.invoke('load-conversations'),
  saveGeminiKey: (key) => ipcRenderer.invoke('save-gemini-key', key),
  loadGeminiKey: () => ipcRenderer.invoke('load-gemini-key'),
  deleteModel: (modelName) => ipcRenderer.invoke('delete-model', modelName),
  searchWeb: (query) => ipcRenderer.invoke('search-web', query),
  onDownloadProgress: (callback) => {
    ipcRenderer.on('download-progress', (event, data) => callback(data));
    return () => ipcRenderer.removeAllListeners('download-progress');
  },
  
  // Human-in-the-loop triggers
  onPermissionRequest: (callback) => {
    const subscription = (event, data) => callback(data);
    ipcRenderer.on('request-permission', subscription);
    return () => ipcRenderer.removeListener('request-permission', subscription);
  },
  sendPermissionResponse: (payload) => ipcRenderer.send('permission-response', payload),

  // GitHub Releases Auto-Updater bindings
  checkForUpdates: () => ipcRenderer.invoke('check-for-updates'),
  downloadUpdate: () => ipcRenderer.invoke('download-update'),
  restartAndInstall: () => ipcRenderer.invoke('restart-and-install'),
  onUpdateStatus: (callback) => {
    const subscription = (event, data) => callback(data);
    ipcRenderer.on('update-status', subscription);
    return () => ipcRenderer.removeListener('update-status', subscription);
  }
});
