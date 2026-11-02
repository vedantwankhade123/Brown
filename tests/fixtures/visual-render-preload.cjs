const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('renderVisualTest', code => ipcRenderer.invoke('render-visual-diagram', code));
