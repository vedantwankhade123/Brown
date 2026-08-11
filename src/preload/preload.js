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
  refreshGeoLocation: () => ipcRenderer.invoke('refresh-geo-location'),
  
  // Security state operations
  getSecurityMode: () => ipcRenderer.invoke('get-security-mode'),
  setSecurityMode: (mode) => ipcRenderer.invoke('set-security-mode', mode),
  setAuthorizedApps: (map) => ipcRenderer.invoke('set-authorized-apps', map),
  
  // Action execution loops
  executeAction: (payload) => ipcRenderer.invoke('execute-action', payload),
  launchSandbox: (hostPath) => ipcRenderer.invoke('launch-sandbox', hostPath),
  readFile: (filePath) => ipcRenderer.invoke('read-file', filePath),
  writeFile: (filePath, content) => ipcRenderer.invoke('write-file', { filePath, content }),
  listDir: (dirPath) => ipcRenderer.invoke('list-dir', dirPath),
  openExternal: (url) => ipcRenderer.invoke('open-external', url),
  appAction: (payload) => ipcRenderer.invoke('app-action', payload),
  resolveAppName: (appName) => ipcRenderer.invoke('resolve-app-name', appName),
  captureScreen: (payload) => ipcRenderer.invoke('capture-screen', payload || {}),
  ocrScreen: (payload) => ipcRenderer.invoke('ocr-screen', payload || {}),
  getLiveMetrics: () => ipcRenderer.invoke('get-live-metrics'),
  restoreFileBackup: (payload) => ipcRenderer.invoke('restore-file-backup', payload),
  searchWeb: (query, options) => ipcRenderer.invoke('search-web', query, options),
  fetchWebPage: (url) => ipcRenderer.invoke('fetch-web-page', url),
  getMcpStatus: () => ipcRenderer.invoke('get-mcp-status'),
  mcpCallTool: (payload) => ipcRenderer.invoke('mcp-call-tool', payload),
  getInstalledApps: () => ipcRenderer.invoke('get-installed-apps'),
  downloadModel: (modelName) => ipcRenderer.invoke('download-model', modelName),
  cancelDownloadModel: (modelName) => ipcRenderer.invoke('cancel-download-model', modelName),
  installOllama: () => ipcRenderer.invoke('install-ollama'),
  checkOllamaInstalled: () => ipcRenderer.invoke('check-ollama-installed'),
  startOllamaService: (exePath) => ipcRenderer.invoke('start-ollama-service', exePath),
  selectDirectory: () => ipcRenderer.invoke('select-directory'),
  selectSoundFile: () => ipcRenderer.invoke('select-sound-file'),
  updateDataDir: (customPath) => ipcRenderer.invoke('update-data-dir', customPath),
  getDefaultDataDir: () => ipcRenderer.invoke('get-default-data-dir'),
  getRuntimeDataRoot: () => ipcRenderer.invoke('get-runtime-data-root'),
  getConnectorsRoot: () => ipcRenderer.invoke('get-connectors-root'),
  getStoragePaths: () => ipcRenderer.invoke('get-storage-paths'),
  ensureUltronStorage: () => ipcRenderer.invoke('ensure-ultron-storage'),
  saveConversations: (dataStr) => ipcRenderer.invoke('save-conversations', dataStr),
  loadConversations: () => ipcRenderer.invoke('load-conversations'),
  saveGeminiKey: (key) => ipcRenderer.invoke('save-gemini-key', key),
  loadGeminiKey: () => ipcRenderer.invoke('load-gemini-key'),
  installMcpWindowsUia: () => ipcRenderer.invoke('install-mcp-windows-uia'),
  saveUserProfile: (profile) => ipcRenderer.invoke('save-user-profile', profile),
  loadUserProfile: () => ipcRenderer.invoke('load-user-profile'),
  saveSetupStatus: (completed) => ipcRenderer.invoke('save-setup-status', completed),
  loadSetupStatus: () => ipcRenderer.invoke('load-setup-status'),
  deleteModel: (modelName) => ipcRenderer.invoke('delete-model', modelName),
  searchWeb: (query, options) => ipcRenderer.invoke('search-web', query, options),
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
  },

  // Offline speech-to-text (Whisper via main process)
  transcribeAudio: (payload) => {
    if (payload && typeof payload === 'object' && !Array.isArray(payload)) {
      return ipcRenderer.invoke('transcribe-audio', payload);
    }
    return ipcRenderer.invoke('transcribe-audio', { samples: payload, sampleRate: 16000 });
  },
  getVoiceModelStatus: () => ipcRenderer.invoke('get-voice-model-status'),
  downloadVoiceModel: () => ipcRenderer.invoke('download-voice-model'),
  cancelVoiceModelDownload: () => ipcRenderer.invoke('cancel-voice-model-download'),
  deleteVoiceModel: () => ipcRenderer.invoke('delete-voice-model'),

  synthesizeSpeech: (text, modelKey) => ipcRenderer.invoke('synthesize-speech', { text, modelKey }),
  getTtsCatalog: () => ipcRenderer.invoke('get-tts-catalog'),
  getTtsModelStatus: (modelKey) => ipcRenderer.invoke('get-tts-model-status', modelKey),
  getActiveTtsModel: () => ipcRenderer.invoke('get-active-tts-model'),
  setActiveTtsModel: (modelKey) => ipcRenderer.invoke('set-active-tts-model', modelKey),
  downloadTtsModel: (modelKey) => ipcRenderer.invoke('download-tts-model', modelKey),
  cancelTtsModelDownload: (modelKey) => ipcRenderer.invoke('cancel-tts-model-download', modelKey),
  deleteTtsModel: (modelKey) => ipcRenderer.invoke('delete-tts-model', modelKey),
  warmupTtsModel: (modelKey) => ipcRenderer.invoke('warmup-tts-model', modelKey)
});
