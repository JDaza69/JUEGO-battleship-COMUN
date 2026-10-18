const { app, BrowserWindow, session } = require('electron');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const entry = path.join(__dirname, '..', 'dist', 'index.html');
const entryURL = pathToFileURL(entry).href;
let window;

function createWindow() {
  window = new BrowserWindow({
    width: 1280,
    height: 900,
    minWidth: 400,
    minHeight: 600,
    backgroundColor: '#0a1b23',
    title: 'Flota táctica',
    autoHideMenuBar: true,
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  window.once('ready-to-show', () => window.show());
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', (event, url) => {
    if (url.split('#')[0] !== entryURL) event.preventDefault();
  });
  window.on('closed', () => { window = undefined; });
  window.loadFile(entry);
}

app.whenReady().then(() => {
  // La edición de escritorio funciona sin conexión y no solicita permisos del sistema.
  session.defaultSession.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
  createWindow();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
