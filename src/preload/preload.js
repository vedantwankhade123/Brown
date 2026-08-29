const { contextBridge, ipcRenderer } = require('electron');

// Require the copied CommonJS file directly
const marked = require('./marked.cjs');

// Configure marked options
marked.setOptions({
  gfm: true,
  breaks: true
});

const apiMethods = {
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
  extractPdfText: (payload) => ipcRenderer.invoke('extract-pdf-text', payload),
  writeFile: (filePath, content) => ipcRenderer.invoke('write-file', { filePath, content }),
  deleteFile: (filePath) => ipcRenderer.invoke('delete-file', filePath),
  downloadFile: (payload) => ipcRenderer.invoke('download-file', payload),
  listDir: (dirPath) => ipcRenderer.invoke('list-dir', dirPath),
  openExternal: (url) => ipcRenderer.invoke('open-external', url),
  appAction: (payload) => ipcRenderer.invoke('app-action', payload),
  resolveAppName: (appName) => ipcRenderer.invoke('resolve-app-name', appName),
  captureScreen: (payload) => ipcRenderer.invoke('capture-screen', payload || {}),
  ocrScreen: (payload) => ipcRenderer.invoke('ocr-screen', payload || {}),
  getLiveMetrics: () => ipcRenderer.invoke('get-live-metrics'),
  restoreFileBackup: (payload) => ipcRenderer.invoke('restore-file-backup', payload),
  searchWeb: (query, options) => ipcRenderer.invoke('search-web', query, options),
  getMcpStatus: () => ipcRenderer.invoke('get-mcp-status'),
  getMcpRegistry: () => ipcRenderer.invoke('get-mcp-registry'),
  toggleMcpServer: (payload) => ipcRenderer.invoke('toggle-mcp-server', payload),
  saveCustomMcpServer: (payload) => ipcRenderer.invoke('save-custom-mcp-server', payload),
  deleteCustomMcpServer: (serverId) => ipcRenderer.invoke('delete-custom-mcp-server', serverId),
  mcpCallTool: (payload) => ipcRenderer.invoke('mcp-call-tool', payload),
  getInstalledApps: () => ipcRenderer.invoke('get-installed-apps'),
  downloadModel: (modelName) => ipcRenderer.invoke('download-model', modelName),
  cancelDownloadModel: (modelName) => ipcRenderer.invoke('cancel-download-model', modelName),
  searchHuggingFaceModels: (query, limit) => ipcRenderer.invoke('search-huggingface-models', query, limit),
  getHuggingFaceModelQuantizations: (repoId) => ipcRenderer.invoke('get-huggingface-model-quantizations', repoId),
  installOllama: () => ipcRenderer.invoke('install-ollama'),
  checkOllamaInstalled: () => ipcRenderer.invoke('check-ollama-installed'),
  startOllamaService: (exePath) => ipcRenderer.invoke('start-ollama-service', exePath),
  selectDirectory: () => ipcRenderer.invoke('select-directory'),
  selectDocumentFile: () => ipcRenderer.invoke('select-document-file'),
  listRecentDocuments: () => ipcRenderer.invoke('list-recent-documents'),
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
   getOllamaAuthStatus: () => ipcRenderer.invoke('ollama-auth-status'),
   setOllamaAuthStatus: (signedIn, email) => ipcRenderer.invoke('set-ollama-auth-status', signedIn, email),
   verifyOllamaCloudAuth: () => ipcRenderer.invoke('verify-ollama-cloud-auth'),
   ollamaSignin: () => ipcRenderer.invoke('ollama-signin'),
   ollamaSignout: () => ipcRenderer.invoke('ollama-signout'),
  installMcpWindowsUia: () => ipcRenderer.invoke('install-mcp-windows-uia'),
  checkMcpWindowsUia: () => ipcRenderer.invoke('check-mcp-windows-uia'),
  downloadKokoroOnboardingVoices: () => ipcRenderer.invoke('download-kokoro-onboarding-voices'),
  showItemInFolder: (filePath) => ipcRenderer.invoke('show-item-in-folder', filePath),
  openFileOrPath: (filePath) => ipcRenderer.invoke('open-file-or-path', filePath),
  fileExists: (filePath) => ipcRenderer.invoke('file-exists', filePath),
  getActiveWindow: () => ipcRenderer.invoke('get-active-window'),
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

  // Built-in speech-to-text (Windows Speech Recognition)
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

  // Live Windows Speech engine (streams recognition from the mic)
  startLiveSpeech: (culture) => ipcRenderer.invoke('voice-stt-live:start', { culture }),
  stopLiveSpeech: () => ipcRenderer.invoke('voice-stt-live:stop'),
  onLiveSpeechPartial: (callback) => {
    const subscription = (event, data) => callback(data?.text || '');
    ipcRenderer.on('voice-stt-live:partial', subscription);
    return () => ipcRenderer.removeListener('voice-stt-live:partial', subscription);
  },

  synthesizeSpeech: (text, modelKey) => ipcRenderer.invoke('synthesize-speech', { text, modelKey }),
  getTtsCatalog: () => ipcRenderer.invoke('get-tts-catalog'),
  getTtsModelStatus: (modelKey) => ipcRenderer.invoke('get-tts-model-status', modelKey),
  getActiveTtsModel: () => ipcRenderer.invoke('get-active-tts-model'),
  setActiveTtsModel: (modelKey) => ipcRenderer.invoke('set-active-tts-model', modelKey),
  downloadTtsModel: (modelKey) => ipcRenderer.invoke('download-tts-model', modelKey),
  cancelTtsModelDownload: (modelKey) => ipcRenderer.invoke('cancel-tts-model-download', modelKey),
  deleteTtsModel: (modelKey) => ipcRenderer.invoke('delete-tts-model', modelKey),
  warmupTtsModel: (modelKey) => ipcRenderer.invoke('warmup-tts-model', modelKey),

  // Floating Bar Companion APIs
  floatingBarToggle: () => ipcRenderer.invoke('floating-bar:toggle'),
  floatingBarHide: (payload) => ipcRenderer.invoke('floating-bar:hide', payload),
  floatingBarSetMode: (payload) => ipcRenderer.invoke('floating-bar:set-mode', payload),
  floatingBarExpandToMain: (payload) => ipcRenderer.invoke('floating-bar:expand-to-main', payload),
  floatingBarGetClipboard: () => ipcRenderer.invoke('floating-bar:get-clipboard'),
  floatingBarSyncSession: (payload) => ipcRenderer.invoke('floating-bar:sync-session', payload),
  onFloatingBarActivated: (callback) => {
    const subscription = (event, data) => callback(data);
    ipcRenderer.on('floating-bar:activated', subscription);
    return () => ipcRenderer.removeListener('floating-bar:activated', subscription);
  },
  onFloatingBarHandOff: (callback) => {
    const subscription = (event, data) => callback(data);
    ipcRenderer.on('floating-bar:hand-off', subscription);
    return () => ipcRenderer.removeListener('floating-bar:hand-off', subscription);
  },
  onFloatingBarSessionCreated: (callback) => {
    const subscription = (event, data) => callback(data);
    ipcRenderer.on('floating-bar:session-created', subscription);
    return () => ipcRenderer.removeListener('floating-bar:session-created', subscription);
  },
  getDesktopSyncInfo: () => ipcRenderer.invoke('desktop-sync:get-info'),
  listMobilePairedDevices: () => ipcRenderer.invoke('desktop-sync:list-devices'),
  revokeMobilePairedDevice: (id) => ipcRenderer.invoke('desktop-sync:revoke-device', id),
  clearPreviousMobileDevices: () => ipcRenderer.invoke('desktop-sync:clear-previous-devices'),
  createMobilePairCode: () => ipcRenderer.invoke('desktop-sync:create-pair-code'),
  denyMobilePair: () => ipcRenderer.invoke('desktop-sync:deny-pair'),
  approveMobileChats: () => ipcRenderer.invoke('desktop-sync:approve-chats'),
  denyMobileChats: () => ipcRenderer.invoke('desktop-sync:deny-chats'),
  onMobilePairRequest: (callback) => {
    const subscription = (event, data) => callback(data);
    ipcRenderer.on('mobile-pair-request', subscription);
    return () => ipcRenderer.removeListener('mobile-pair-request', subscription);
  },
  onMobilePairComplete: (callback) => {
    const subscription = (event, data) => callback(data);
    ipcRenderer.on('mobile-pair-complete', subscription);
    return () => ipcRenderer.removeListener('mobile-pair-complete', subscription);
  },
  onMobilePairDismissed: (callback) => {
    const subscription = (event, data) => callback(data);
    ipcRenderer.on('mobile-pair-dismissed', subscription);
    return () => ipcRenderer.removeListener('mobile-pair-dismissed', subscription);
  },
  onMobilePairedDevicesUpdated: (callback) => {
    const subscription = (event, data) => callback(data);
    ipcRenderer.on('mobile-paired-devices-updated', subscription);
    return () => ipcRenderer.removeListener('mobile-paired-devices-updated', subscription);
  },
  onMobileChatConsent: (callback) => {
    const subscription = (event, data) => callback(data);
    ipcRenderer.on('mobile-chat-consent', subscription);
    return () => ipcRenderer.removeListener('mobile-chat-consent', subscription);
  },
  onMobileChatConsentDismissed: (callback) => {
    const subscription = (event, data) => callback(data);
    ipcRenderer.on('mobile-chat-consent-dismissed', subscription);
    return () => ipcRenderer.removeListener('mobile-chat-consent-dismissed', subscription);
  },
  onMobileProfileUpdated: (callback) => {
    const subscription = (event, data) => callback(data);
    ipcRenderer.on('mobile-profile-updated', subscription);
    return () => ipcRenderer.removeListener('mobile-profile-updated', subscription);
  },
  onMobileChatsImported: (callback) => {
    const subscription = (event, data) => callback(data);
    ipcRenderer.on('mobile-chats-imported', subscription);
    return () => ipcRenderer.removeListener('mobile-chats-imported', subscription);
  },
  // Multi-Provider Hub
  saveProviderKeys: (keys) => ipcRenderer.invoke('save-provider-keys', keys),
  loadProviderKeys: () => ipcRenderer.invoke('load-provider-keys'),
  // Local Vector RAG
  ragAddSources: (paths) => ipcRenderer.invoke('rag:add-sources', paths),
  ragAutoAdd: (sourcePath) => ipcRenderer.invoke('rag:auto-add', sourcePath),
  ragIndexFile: (filePath) => ipcRenderer.invoke('rag:index-file', filePath),
  ragIndexText: (payload) => ipcRenderer.invoke('rag:index-text', payload),
  ragRemoveSource: (sourcePath) => ipcRenderer.invoke('rag:remove-source', sourcePath),
  ragReindex: () => ipcRenderer.invoke('rag:reindex'),
  ragSearch: (payload) => ipcRenderer.invoke('rag:search', payload),
  ragClear: () => ipcRenderer.invoke('rag:clear'),
  ragGetStats: () => ipcRenderer.invoke('rag:get-stats'),
  onRagIndexProgress: (callback) => {
    const subscription = (event, data) => callback(data);
    ipcRenderer.on('rag:index-progress', subscription);
    return () => ipcRenderer.removeListener('rag:index-progress', subscription);
  },
  // Native Windows Controls
  windowsGetVolume: () => ipcRenderer.invoke('windows:get-volume'),
  windowsSetVolume: (level) => ipcRenderer.invoke('windows:set-volume', level),
  windowsToggleMute: () => ipcRenderer.invoke('windows:toggle-mute'),
  windowsMediaKey: (action) => ipcRenderer.invoke('windows:media-key', action),
  windowsLock: () => ipcRenderer.invoke('windows:lock'),
  windowsSleep: () => ipcRenderer.invoke('windows:sleep'),
  windowsRestart: () => ipcRenderer.invoke('windows:restart'),
  windowsGetBrightness: () => ipcRenderer.invoke('windows:get-brightness'),
  windowsSetBrightness: (level) => ipcRenderer.invoke('windows:set-brightness', level),
};

contextBridge.exposeInMainWorld('ultronAPI', apiMethods);
contextBridge.exposeInMainWorld('brownAPI', apiMethods);
