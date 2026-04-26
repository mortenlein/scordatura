const { app, BrowserWindow, ipcMain, session } = require('electron');
const path = require('path');
const fs = require('fs');
const cheerio = require('cheerio');

const CLIENT_ID = '441422462550-ikj32d57kuojel24hogmfnkdsvc6b7u7.apps.googleusercontent.com';
const CLIENT_SECRET = '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';

if (!app.requestSingleInstanceLock()) {
    app.quit();
}

const TABS_DIR = path.join(app.getPath('userData'), 'tabs');
const GDriveSync = require('./gdrive');
const TOKEN_PATH = path.join(app.getPath('userData'), 'token.json');
const SETTINGS_FILE = path.join(TABS_DIR, 'settings.json');

if (!fs.existsSync(TABS_DIR)) fs.mkdirSync(TABS_DIR, { recursive: true });

const syncManager = new GDriveSync({ client_id: CLIENT_ID, client_secret: CLIENT_SECRET }, app.getPath('userData'));

let mainWindow;

function initializeIpc() {
    ipcMain.removeHandler('initiate-auth');
    ipcMain.handle('initiate-auth', async () => await syncManager.authenticate());

    ipcMain.removeHandler('sync-library');
    ipcMain.handle('sync-library', async () => await syncManager.sync());
    
    ipcMain.removeHandler('has-token');
    ipcMain.handle('has-token', () => fs.existsSync(TOKEN_PATH));

    ipcMain.removeHandler('minimize-app');
    ipcMain.handle('minimize-app', () => mainWindow?.minimize());

    ipcMain.removeHandler('maximize-app');
    ipcMain.handle('maximize-app', () => mainWindow?.isMaximized() ? mainWindow.unmaximize() : mainWindow.maximize());

    ipcMain.removeHandler('close-app');
    ipcMain.handle('close-app', () => mainWindow?.close());
    
    ipcMain.removeHandler('get-chord-db');
    ipcMain.handle('get-chord-db', () => {
        const dbPath = path.join(__dirname, 'chords.json');
        return fs.existsSync(dbPath) ? JSON.parse(fs.readFileSync(dbPath, 'utf-8')) : null;
    });

    ipcMain.removeHandler('get-settings');
    ipcMain.handle('get-settings', () => fs.existsSync(SETTINGS_FILE) ? JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf-8')) : {});
    
    ipcMain.removeHandler('save-settings');
    ipcMain.handle('save-settings', (event, settings) => fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2), 'utf-8'));

    ipcMain.removeHandler('load-tab');
    ipcMain.handle('load-tab', (event, id) => JSON.parse(fs.readFileSync(path.join(TABS_DIR, id), 'utf-8')));

    ipcMain.removeHandler('delete-tab');
    ipcMain.handle('delete-tab', (event, id) => {
        const filePath = path.join(TABS_DIR, id);
        if (fs.existsSync(filePath)) {
            const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
            data.isDeleted = true;
            data.savedAt = Date.now();
            fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
            return true;
        }
        return false;
    });
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
