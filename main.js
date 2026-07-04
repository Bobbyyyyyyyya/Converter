const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const { convertFile, getFormatInfo } = require('./converter');

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 900,
    height: 700,
    minWidth: 700,
    minHeight: 500,
    title: 'File Converter',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.loadFile('index.html');
}

app.whenReady().then(createWindow);

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
      { name: 'Alles', extensions: ['*'] },
      { name: 'Afbeeldingen', extensions: ['jpg', 'jpeg', 'png', 'webp', 'bmp', 'tiff', 'gif', 'avif'] },
      { name: 'Audio', extensions: ['mp3', 'wav', 'ogg', 'flac', 'aac', 'm4a', 'wma'] },
      { name: 'Video', extensions: ['mp4', 'avi', 'mov', 'mkv', 'webm', 'wmv', 'flv'] },
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
