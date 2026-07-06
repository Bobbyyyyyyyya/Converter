const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('player', {
  readDirectory: (dirPath) => ipcRenderer.invoke('read-directory', dirPath),
  getHomeDir: () => ipcRenderer.invoke('get-home-dir'),
  getRecentFiles: () => ipcRenderer.invoke('get-recent-files'),
  addToRecent: (filePath) => ipcRenderer.invoke('add-to-recent', filePath),
  clearRecent: () => ipcRenderer.invoke('clear-recent'),
  getDrives: () => ipcRenderer.invoke('get-drives'),
  selectFiles: () => ipcRenderer.invoke('select-files'),
  getFormatInfo: (filePath) => ipcRenderer.invoke('get-format-info', filePath),
  getPlatform: () => ipcRenderer.invoke('get-platform'),
});
