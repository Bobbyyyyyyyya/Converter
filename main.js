const { app, BrowserWindow, ipcMain, dialog, Menu } = require('electron');
const path = require('path');
const fs = require('fs');
const { autoUpdater } = require('electron-updater');
const { convertFile, getFormatInfo } = require('./converter');

let mainWindow;
let playerWindow;
const RECENT_FILE = path.join(app.getPath('userData'), 'recent-files.json');

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
      webSecurity: true,
      allowFileAccess: true,
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
      label: 'Player',
      submenu: [
        {
          label: 'Open Media Player',
          accelerator: 'CmdOrCtrl+P',
          click: () => openPlayerWindow(),
        },
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

function openPlayerWindow() {
  if (playerWindow && !playerWindow.isDestroyed()) {
    playerWindow.focus();
    return;
  }

  playerWindow = new BrowserWindow({
    width: 1100,
    height: 750,
    minWidth: 800,
    minHeight: 500,
    title: 'Media Player',
    webPreferences: {
      preload: path.join(__dirname, 'player-preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: true,
      allowFileAccess: true,
    },
  });

  playerWindow.loadFile('player.html');
  playerWindow.on('closed', () => { playerWindow = null; });
}

function loadRecent() {
  try {
    if (fs.existsSync(RECENT_FILE)) {
      return JSON.parse(fs.readFileSync(RECENT_FILE, 'utf8'));
    }
  } catch {}
  return [];
}

function saveRecent(files) {
  try {
    fs.writeFileSync(RECENT_FILE, JSON.stringify(files.slice(0, 50)), 'utf8');
  } catch {}
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

// ---- Converter IPC ----

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

ipcMain.handle('get-platform', () => {
  return process.platform;
});

// ---- Player IPC ----

ipcMain.handle('open-player', () => {
  openPlayerWindow();
});

ipcMain.handle('read-directory', async (_event, dirPath) => {
  try {
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });
    const files = [];
    const folders = [];
    for (const entry of entries) {
      if (entry.name.startsWith('.')) continue;
      const fullPath = path.join(dirPath, entry.name);
      if (entry.isDirectory()) {
        folders.push({ name: entry.name, path: fullPath, isDirectory: true, size: 0 });
      } else {
        const ext = path.extname(entry.name).toLowerCase().replace('.', '');
        const info = getFormatInfo(entry.name);
        let size = 0;
        try { size = fs.statSync(fullPath).size; } catch {}
        files.push({
          name: entry.name,
          path: fullPath,
          isDirectory: false,
          ext,
          type: info.type,
          size,
        });
      }
    }
    folders.sort((a, b) => a.name.localeCompare(b.name));
    files.sort((a, b) => a.name.localeCompare(b.name));
    return { success: true, entries: [...folders, ...files], path: dirPath };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('get-home-dir', () => {
  return require('os').homedir();
});

ipcMain.handle('get-recent-files', () => {
  return loadRecent();
});

ipcMain.handle('add-to-recent', (_event, filePath) => {
  const recent = loadRecent();
  const filtered = recent.filter((f) => f !== filePath);
  filtered.unshift(filePath);
  saveRecent(filtered);
});

ipcMain.handle('clear-recent', () => {
  saveRecent([]);
});

ipcMain.handle('get-drives', () => {
  if (process.platform === 'darwin') {
    return ['/'];
  }
  if (process.platform === 'win32') {
    const drives = [];
    for (let i = 65; i <= 90; i++) {
      const letter = String.fromCharCode(i);
      try {
        if (fs.statSync(`${letter}:\\`).isDirectory()) {
          drives.push(`${letter}:\\`);
        }
      } catch {}
    }
    return drives;
  }
  return ['/'];
});
