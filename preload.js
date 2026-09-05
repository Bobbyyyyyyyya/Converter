const { contextBridge, ipcRenderer, webUtils } = require('electron');

contextBridge.exposeInMainWorld('converter', {
  selectFiles: () => ipcRenderer.invoke('select-files'),
  // Echt pad van een gedropt File-object (File.path is niet meer beschikbaar in nieuwe Electron-versies)
  getPathForFile: (file) => {
    try { return webUtils.getPathForFile(file); } catch { return file?.name || ''; }
  },
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
  openPlayer: (files) => ipcRenderer.invoke('open-player', files),
  onOpenFile: (callback) => {
    ipcRenderer.on('open-files', (_event, files) => callback(files));
  },
});
