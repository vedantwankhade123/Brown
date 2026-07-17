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
  
  // Security state operations
  getSecurityMode: () => ipcRenderer.invoke('get-security-mode'),
  setSecurityMode: (mode) => ipcRenderer.invoke('set-security-mode', mode),
  
  // Action execution loops
  executeAction: (payload) => ipcRenderer.invoke('execute-action', payload),
  launchSandbox: (hostPath) => ipcRenderer.invoke('launch-sandbox', hostPath),
  
  // Apps & connector installs
  getInstalledApps: () => ipcRenderer.invoke('get-installed-apps'),
  downloadModel: (modelName) => ipcRenderer.invoke('download-model', modelName),
  installOllama: () => ipcRenderer.invoke('install-ollama'),
  
  // Human-in-the-loop triggers
  onPermissionRequest: (callback) => {
    const subscription = (event, data) => callback(data);
    ipcRenderer.on('request-permission', subscription);
    return () => ipcRenderer.removeListener('request-permission', subscription);
  },
  sendPermissionResponse: (payload) => ipcRenderer.send('permission-response', payload)
});
