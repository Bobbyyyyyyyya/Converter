const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('converter', {
  selectFiles: () => ipcRenderer.invoke('select-files'),
  getFormatInfo: (filePath) => ipcRenderer.invoke('get-format-info', filePath),
  convert: (data) => ipcRenderer.invoke('convert', data),
  selectOutputDir: () => ipcRenderer.invoke('select-output-dir'),
  getAppVersion: () => ipcRenderer.invoke('get-app-version'),
  onProgress: (callback) => {
    ipcRenderer.on('convert-progress', (_event, data) => callback(data));
  },
  checkUpdate: () => ipcRenderer.invoke('check-update'),
  downloadUpdate: () => ipcRenderer.invoke('download-update'),
  installUpdate: () => ipcRenderer.invoke('install-update'),
  onUpdateStatus: (callback) => {
    ipcRenderer.on('update-status', (_event, data) => callback(data));
  },
});
