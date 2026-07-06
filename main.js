const { app, BrowserWindow, ipcMain, dialog, Menu } = require('electron');
const path = require('path');
const { autoUpdater } = require('electron-updater');
const { convertFile, getFormatInfo } = require('./converter');

let mainWindow;

autoUpdater.autoDownload = false;
autoUpdater.logger = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 900,
    height: 700,
    minWidth: 700,
    minHeight: 500,
    title: 'Converter',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.loadFile('index.html');

  const menu = Menu.buildFromTemplate([
    {
      label: 'Converter',
      submenu: [
        { role: 'about' },
        {
          label: 'Check for Updates...',
          accelerator: 'CmdOrCtrl+U',
          click: () => checkForUpdates(),
        },
        { type: 'separator' },
        { role: 'quit' },
      ],
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' },
      ],
    },
    {
      label: 'View',
      submenu: [
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'reload' },
      ],
    },
  ]);
  Menu.setApplicationMenu(menu);
}

function sendStatus(status, data) {
  mainWindow?.webContents.send('update-status', { status, ...data });
}

async function checkForUpdates() {
  sendStatus('checking');
  try {
    const result = await autoUpdater.checkForUpdates();
    return result;
  } catch {
    return null;
  }
}

autoUpdater.on('update-available', (info) => {
  sendStatus('available', {
    version: info.version,
    releaseDate: info.releaseDate,
    releaseNotes: info.releaseNotes,
  });
});

autoUpdater.on('update-not-available', () => {
  sendStatus('not-available');
});

autoUpdater.on('error', (err) => {
  sendStatus('error', { message: err.message });
});

autoUpdater.on('download-progress', (progress) => {
  sendStatus('downloading', { percent: Math.round(progress.percent) });
});

autoUpdater.on('update-downloaded', (info) => {
  sendStatus('downloaded', { version: info.version });
});

ipcMain.handle('check-update', async () => {
  return checkForUpdates();
});

ipcMain.handle('download-update', async () => {
  autoUpdater.downloadUpdate();
});

ipcMain.handle('install-update', async () => {
  autoUpdater.quitAndInstall();
});

app.whenReady().then(() => {
  createWindow();
  setTimeout(() => checkForUpdates(), 3000);
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

ipcMain.handle('select-files', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile', 'multiSelections'],
    filters: [
      { name: 'All Files', extensions: ['*'] },
      { name: 'Images', extensions: ['jpg', 'jpeg', 'png', 'webp', 'bmp', 'tiff', 'gif', 'avif', 'heic', 'heif', 'jp2', 'pdf'] },
      { name: 'Audio', extensions: ['mp3', 'wav', 'ogg', 'flac', 'aac', 'm4a', 'wma', 'opus', 'aiff', 'alac', 'ac3', 'amr', 'mp2'] },
      { name: 'Video', extensions: ['mp4', 'avi', 'mov', 'mkv', 'webm', 'wmv', 'flv', '3gp', 'm4v', 'mpg', 'mpeg', 'ogv', 'ts', 'mts', 'm2ts'] },
      { name: 'Documents', extensions: ['pdf', 'txt', 'docx', 'doc'] },
      { name: '3D Models', extensions: ['3ds', '3mf', 'ac', 'amf', 'ase', 'b3d', 'blend', 'bvh', 'cob', 'dae', 'dxf', 'fbx', 'gltf', 'glb', 'lwo', 'lxo', 'md2', 'md5mesh', 'mdc', 'mdl', 'ms3d', 'nff', 'obj', 'off', 'ogex', 'ply', 'q3o', 'q3s', 'sib', 'smd', 'stl', 'x', 'xgl', 'zgl'] },
      { name: 'Animation', extensions: ['lottie'] },
    ],
  });
  return result.canceled ? [] : result.filePaths;
});

ipcMain.handle('get-format-info', async (_event, filePath) => {
  return getFormatInfo(filePath);
});

ipcMain.handle('convert', async (_event, { files, targetFormat, outputDir }) => {
  const results = [];
  for (const file of files) {
    try {
      const outputPath = path.join(outputDir, path.basename(file, path.extname(file)) + '.' + targetFormat);
      await convertFile(file, outputPath, targetFormat, (progress) => {
        mainWindow.webContents.send('convert-progress', { file, progress });
      });
      results.push({ file, outputPath, success: true });
    } catch (err) {
      results.push({ file, error: err.message, success: false });
    }
  }
  return results;
});

ipcMain.handle('select-output-dir', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory'],
  });
  return result.canceled ? null : result.filePaths[0];
});

ipcMain.handle('get-app-version', () => {
  return app.getVersion();
});
