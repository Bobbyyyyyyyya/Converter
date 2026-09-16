const { contextBridge, ipcRenderer, webUtils } = require('electron');

contextBridge.exposeInMainWorld('player', {
  getPathForFile: (file) => {
    try { return webUtils.getPathForFile(file); } catch { return file?.name || ''; }
  },
  readDirectory: (dirPath) => ipcRenderer.invoke('read-directory', dirPath),
  getHomeDir: () => ipcRenderer.invoke('get-home-dir'),
  getRecentFiles: () => ipcRenderer.invoke('get-recent-files'),
  addToRecent: (filePath) => ipcRenderer.invoke('add-to-recent', filePath),
  clearRecent: () => ipcRenderer.invoke('clear-recent'),
  getDrives: () => ipcRenderer.invoke('get-drives'),
  selectFiles: () => ipcRenderer.invoke('select-files'),
  selectDirectory: () => ipcRenderer.invoke('select-output-dir'),
  getFormatInfo: (filePath) => ipcRenderer.invoke('get-format-info', filePath),
  getAudioMetadata: (filePath) => ipcRenderer.invoke('get-audio-metadata', filePath),
  getPlatform: () => ipcRenderer.invoke('get-platform'),
  getAlbums: () => ipcRenderer.invoke('get-albums'),
  createAlbum: (name) => ipcRenderer.invoke('create-album', name),
  renameAlbum: (data) => ipcRenderer.invoke('rename-album', data),
  deleteAlbum: (id) => ipcRenderer.invoke('delete-album', id),
  addToAlbum: (data) => ipcRenderer.invoke('add-to-album', data),
  removeFromAlbum: (data) => ipcRenderer.invoke('remove-from-album', data),
  onOpenMediaFiles: (callback) => ipcRenderer.on('open-media-files', (_event, files) => callback(files)),
});
