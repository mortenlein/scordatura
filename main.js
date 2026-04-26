const { app, BrowserWindow, ipcMain, session } = require('electron');
const path = require('path');
const fs = require('fs');
const cheerio = require('cheerio');

// OAuth 2.0 Credentials
const CLIENT_ID = '441422462550-ikj32d57kuojel24hogmfnkdsvc6b7u7.apps.googleusercontent.com';
const CLIENT_SECRET = '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';

// Register the custom protocol
if (process.defaultApp) {
    if (process.argv.length >= 2) {
        app.setAsDefaultProtocolClient('scordatura', process.execPath, [path.resolve(process.argv[1])]);
    }
} else {
    app.setAsDefaultProtocolClient('scordatura');
}

if (!app.requestSingleInstanceLock()) {
    app.quit();
    process.exit(0);
}

const TABS_DIR = path.join(app.getPath('userData'), 'tabs');
const GDriveSync = require('./gdrive');
const TOKEN_PATH = path.join(app.getPath('userData'), 'token.json');
if (!fs.existsSync(TABS_DIR)) fs.mkdirSync(TABS_DIR, { recursive: true });

const syncManager = new GDriveSync({ client_id: CLIENT_ID, client_secret: CLIENT_SECRET }, app.getPath('userData'));

let mainWindow;

// --- IPC HANDLERS: Initialized ONCE ---
function initializeIpc() {
    ipcMain.removeHandler('sync-library'); // Ensure no duplicates
    ipcMain.handle('sync-library', async () => await syncManager.sync());
    
    ipcMain.removeHandler('has-token');
    ipcMain.handle('has-token', () => fs.existsSync(TOKEN_PATH));

    ipcMain.removeHandler('minimize-app');
    ipcMain.handle('minimize-app', () => mainWindow?.minimize());

    ipcMain.removeHandler('maximize-app');
    ipcMain.handle('maximize-app', () => mainWindow?.isMaximized() ? mainWindow.unmaximize() : mainWindow.maximize());

    ipcMain.removeHandler('close-app');
    ipcMain.handle('close-app', () => mainWindow?.close());

    // ... (rest of your handlers)
}

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1400, height: 800,
        webPreferences: { preload: path.join(__dirname, 'preload.js'), nodeIntegration: false, contextIsolation: true }
    });
    
    mainWindow.loadFile('index.html');
}

app.whenReady().then(() => {
    initializeIpc();
    createWindow();
});
