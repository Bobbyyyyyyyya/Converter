const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('converter', {
  selectFiles: () => ipcRenderer.invoke('select-files'),
  getFormatInfo: (filePath) => ipcRenderer.invoke('get-format-info', filePath),
  convert: (data) => ipcRenderer.invoke('convert', data),
  selectOutputDir: () => ipcRenderer.invoke('select-output-dir'),
  onProgress: (callback) => {
    ipcRenderer.on('convert-progress', (_event, data) => callback(data));
  },
});
