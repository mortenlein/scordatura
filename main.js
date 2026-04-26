const { app, BrowserWindow, ipcMain, session, Menu } = require('electron');
const path = require('path');
const fs = require('fs');
const cheerio = require('cheerio');

const CLIENT_ID = '441422462550-ikj32d57kuojel24hogmfnkdsvc6b7u7.apps.googleusercontent.com';
const CLIENT_SECRET = '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';

// Remove default menu early
Menu.setApplicationMenu(null);

// Register the custom protocol
if (process.defaultApp) {
    if (process.argv.length >= 2) {
        app.setAsDefaultProtocolClient('scordatura', process.execPath, [path.resolve(process.argv[1])]);
    }
} else {
    app.setAsDefaultProtocolClient('scordatura');
}

const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
    app.quit();
} else {
    app.on('second-instance', (event, commandLine) => {
        if (mainWindow) {
            if (mainWindow.isMinimized()) mainWindow.restore();
            mainWindow.setFocusable(true);
            mainWindow.focus();
            mainWindow.show();

            const url = commandLine.find(arg => arg.startsWith('scordatura://'));
            if (url) {
                handleProtocolUrl(url);
            }
        }
    });
}

// Set AppUserModelId for Windows Taskbar icon support
if (process.platform === 'win32') {
    app.setAppUserModelId('com.mortenlein.scordatura');
}

const TABS_DIR = path.join(app.getPath('userData'), 'tabs');
const GDriveSync = require('./gdrive');
const TOKEN_PATH = path.join(app.getPath('userData'), 'token.json');
const SETTINGS_FILE = path.join(TABS_DIR, 'settings.json');

if (!fs.existsSync(TABS_DIR)) fs.mkdirSync(TABS_DIR, { recursive: true });

// --- MIGRATION SCRIPT: Enforce data model on existing tabs ---
function migrateExistingTabs() {
    if (!fs.existsSync(TABS_DIR)) return;
    const artistDirs = fs.readdirSync(TABS_DIR, { withFileTypes: true }).filter(d => d.isDirectory());
    for (const artistDir of artistDirs) {
        const dPath = path.join(TABS_DIR, artistDir.name);
        const songFiles = fs.readdirSync(dPath).filter(f => f.endsWith('.json'));
        for (const songFile of songFiles) {
            const filePath = path.join(dPath, songFile);
            try {
                const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
                let modified = false;

                const expectedId = `${artistDir.name}/${songFile}`;
                if (data.id !== expectedId) { data.id = expectedId; modified = true; }
                if (data.artistId !== artistDir.name) { data.artistId = artistDir.name; modified = true; }
                if (typeof data.isDeleted !== 'boolean') { data.isDeleted = false; modified = true; }
                if (typeof data.savedAt !== 'number') { data.savedAt = fs.statSync(filePath).mtimeMs; modified = true; }
                if (typeof data.transpose !== 'number') { data.transpose = 0; modified = true; }
                if (typeof data.isStarred !== 'boolean') { data.isStarred = false; modified = true; }
                if (!data.tuning) { 
                    data.tuning = { id: 'standard', name: 'Standard', notes: ['E', 'A', 'D', 'G', 'B', 'E'] }; 
                    modified = true; 
                }

                if (modified) {
                    fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
                    const mtime = new Date(data.savedAt);
                    fs.utimesSync(filePath, mtime, mtime);
                }
            } catch (e) {
                console.error(`Error migrating ${filePath}:`, e);
            }
        }
    }
}
migrateExistingTabs();

const syncManager = new GDriveSync({ client_id: CLIENT_ID, client_secret: CLIENT_SECRET }, app.getPath('userData'));

let mainWindow;

const sanitize = (str) => str.replace(/[^a-z0-9]/gi, '_').toLowerCase();

function handleProtocolUrl(fullUrl) {
    if (!fullUrl) return;
    const urlToScrape = fullUrl.replace('scordatura://', '');
    if (urlToScrape && mainWindow) {
        mainWindow.webContents.send('protocol-url', urlToScrape);
    }
}

function initializeIpc() {
    ipcMain.handle('initiate-auth', async () => await syncManager.authenticate());
    
    ipcMain.handle('sync-library', async (event) => {
        return await syncManager.sync((msg, pct) => {
            if (mainWindow) {
                mainWindow.webContents.send('sync-progress', msg, pct);
            }
        });
    });

    ipcMain.handle('has-token', () => fs.existsSync(TOKEN_PATH));

    ipcMain.handle('minimize-app', () => mainWindow?.minimize());
    ipcMain.handle('maximize-app', () => mainWindow?.isMaximized() ? mainWindow.unmaximize() : mainWindow.maximize());
    ipcMain.handle('close-app', () => mainWindow?.close());
    
    ipcMain.handle('get-library', async () => {
        const library = [];
        const starred = [];
        if (!fs.existsSync(TABS_DIR)) return { library: [], starred: [] };

        const artistDirs = fs.readdirSync(TABS_DIR, { withFileTypes: true }).filter(d => d.isDirectory());
        for (const artistDir of artistDirs) {
            const dPath = path.join(TABS_DIR, artistDir.name);
            const songFiles = fs.readdirSync(dPath).filter(f => f.endsWith('.json'));
            const songs = songFiles.map(songFile => {
                try {
                    const data = JSON.parse(fs.readFileSync(path.join(dPath, songFile), 'utf-8'));
                    if (data.isDeleted) return null;
                    const songObj = { id: `${artistDir.name}/${songFile}`, artist: data.artist, song: data.song, transpose: data.transpose, isStarred: data.isStarred, tuning: data.tuning };
                    if (songObj.isStarred) starred.push(songObj);
                    return songObj;
                } catch(e) { return null; }
            }).filter(Boolean);
            if (songs.length > 0) library.push({ artistId: artistDir.name, artistName: songs[0].artist, songs });
        }
        return { library, starred };
    });

    ipcMain.handle('scrape-url', async (event, url) => {
        if (!url || (!url.includes('ultimate-guitar.com') && !url.includes('guitaretab.com'))) {
            throw new Error('Please provide a valid ultimate-guitar.com or guitaretab.com URL');
        }

        const scraperWindow = new BrowserWindow({ show: false, webPreferences: { offscreen: true } });

        try {
            if (url.includes('/artist/')) {
                let page = 1;
                let songs = {};
                let artistName = 'Unknown Artist';
                let seenUrls = new Set();
                const artistMatch = url.match(/\/artist\/([a-z0-9_]+?)_\d+\/?$/);
                const artistSlug = artistMatch ? artistMatch[1].replace(/_/g, '-') : null;

                while (true) {
                    let currentUrl = url;
                    if (page > 1) currentUrl += (url.includes('?') ? '&' : '?') + `page=${page}`;
                    await scraperWindow.loadURL(currentUrl, { userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36' });
                    const html = await scraperWindow.webContents.executeJavaScript(`new Promise(resolve => { setTimeout(() => resolve(document.documentElement.innerHTML), 3000); });`);
                    const $ = cheerio.load(html);
                    let newTabsThisPage = 0;

                    $('a[href^="https://tabs.ultimate-guitar.com/tab/"]').each((i, el) => {
                        const tabUrl = $(el).attr('href');
                        if (!tabUrl.includes('pro') && !tabUrl.includes('official') && tabUrl.split('/').length > 5) {
                            if (artistSlug) {
                                const tabPath = tabUrl.replace('https://tabs.ultimate-guitar.com/tab/', '');
                                const tabArtistSlug = tabPath.split('/')[0];
                                if (tabArtistSlug !== artistSlug) return;
                            }
                            if (seenUrls.has(tabUrl)) return;
                            seenUrls.add(tabUrl);
                            let curr = $(el);
                            let rowText = '';
                            for (let j = 0; j < 8; j++) {
                                curr = curr.parent();
                                if (curr.text().includes('Chords') || curr.text().includes('Tab')) {
                                    rowText = curr.text().trim().replace(/\\s+/g, ' ');
                                    break;
                                }
                            }

                            if (rowText) {
                                let typeMatch = rowText.match(/(Chords|Tab)$/);
                                let type = typeMatch ? typeMatch[1] : 'Unknown';
                                let votesMatch = rowText.match(/([\\d,]+)(Chords|Tab)$/);
                                let votes = votesMatch ? parseInt(votesMatch[1].replace(/,/g, '')) : 0;
                                let name = $(el).text().trim().replace(/\s*\(ver\s*\d+\)\s*$/i, '').trim();
                                if (!songs[name]) songs[name] = [];
                                songs[name].push({ url: tabUrl, type, votes });
                                newTabsThisPage++;
                            }
                        }
                    });

                    if (page === 1) {
                        artistName = $('h1').first().text().trim() || 'Unknown Artist';
                        artistName = artistName.replace(/ tabs$/i, '');
                    }
                    if (newTabsThisPage === 0) break;
                    page++;
                    await new Promise(r => setTimeout(r, 1500));
                }

                scraperWindow.close();
                let bestTabs = [];
                Object.keys(songs).forEach(songName => {
                    let versions = songs[songName];
                    versions.sort((a, b) => b.votes - a.votes);
                    let best = versions[0];
                    best.name = songName;
                    bestTabs.push(best);
                });
                return { isBatch: true, artist: artistName, tabs: bestTabs };
            }

            await scraperWindow.loadURL(url, { userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36' });
            const result = await scraperWindow.webContents.executeJavaScript(`
                new Promise((resolve) => {
                    setTimeout(() => {
                        let text = "Tab content not found.";
                        let artist = "Unknown Artist";
                        let song = "Unknown Song";
                        const isGuitareTab = window.location.hostname.includes('guitaretab.com');
                        if (isGuitareTab) {
                            try {
                                const heroTitle = document.querySelector('h1.gt-hero__title');
                                if (heroTitle) {
                                    const artistText = Array.from(heroTitle.childNodes).filter(node => node.nodeType === Node.TEXT_NODE).map(node => node.textContent.trim()).join('');
                                    if (artistText) artist = artistText;
                                    const spanNode = heroTitle.querySelector('span');
                                    if (spanNode) {
                                        let songText = spanNode.innerText.replace(/^[\\s-–—]+/, '').trim().replace(/ chords?$/i, '').trim();
                                        if (songText) song = songText;
                                    }
                                }
                            } catch(e) {}
                            const preNode = document.querySelector('pre');
                            if (preNode) text = preNode.innerText;
                            resolve({ text, artist, song });
                            return;
                        }
                        try {
                            const pathParts = window.location.pathname.split('/').filter(Boolean);
                            if (pathParts.length >= 3 && pathParts[0] === 'tab') {
                                artist = pathParts[1].replace(/-/g, ' ').replace(/\\b\\w/g, c => c.toUpperCase());
                                let songPart = pathParts[2].replace(/-(chords|tabs|bass|ukulele|drums|pro|power|official)-?\\d+$/, '');
                                song = songPart.replace(/-/g, ' ').replace(/\\b\\w/g, c => c.toUpperCase());
                            }
                        } catch(e) {}
                        const jsStore = document.querySelector('.js-store');
                        if (jsStore) {
                            try {
                                const data = JSON.parse(jsStore.getAttribute('data-content'));
                                if (data?.store?.page?.data?.tab_view) {
                                    if (data.store.page.data.tab) {
                                        artist = data.store.page.data.tab.artist_name || artist;
                                        song = data.store.page.data.tab.song_name || song;
                                    }
                                    if (data.store.page.data.tab_view.wiki_tab) {
                                        text = data.store.page.data.tab_view.wiki_tab.content;
                                        resolve({ text, artist, song });
                                        return;
                                    }
                                }
                            } catch(e) {}
                        }
                        const preElements = document.querySelectorAll('article pre');
                        if (preElements.length > 0) {
                            text = Array.from(preElements).map(p => p.innerText).join('\\n\\n');
                            resolve({ text, artist, song });
                            return;
                        }
                        const allPre = document.querySelectorAll('pre');
                        if (allPre.length > 0) {
                            text = Array.from(allPre).map(p => p.innerText).join('\\n\\n');
                            resolve({ text, artist, song });
                            return;
                        }
                        resolve({ text, artist, song });
                    }, 3000);
                });
            `);
            scraperWindow.close();
            if (!result || typeof result === 'string') throw new Error(result || "Extraction failed");
            return result;
        } catch (error) {
            if (!scraperWindow.isDestroyed()) scraperWindow.close();
            throw new Error('Failed to scrape the URL: ' + error.message);
        }
    });

    ipcMain.handle('save-tab', (event, tab) => {
        const safeArtist = sanitize(tab.artist) || 'unknown_artist';
        const safeSong = sanitize(tab.song) || 'unknown_song';
        const artistDir = path.join(TABS_DIR, safeArtist);
        if (!fs.existsSync(artistDir)) fs.mkdirSync(artistDir, { recursive: true });
        
        tab.id = `${safeArtist}/${safeSong}.json`;
        tab.artistId = safeArtist;
        tab.isDeleted = tab.isDeleted || false;
        tab.savedAt = Date.now();
        if (typeof tab.transpose !== 'number') tab.transpose = 0;
        if (typeof tab.isStarred !== 'boolean') tab.isStarred = false;

        fs.writeFileSync(path.join(artistDir, safeSong + '.json'), JSON.stringify(tab, null, 2));
        return true;
    });

    ipcMain.handle('load-tab', (event, id) => JSON.parse(fs.readFileSync(path.join(TABS_DIR, id), 'utf-8')));

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

    ipcMain.handle('delete-artist', (event, artistFolderId) => {
        const artistDir = path.join(TABS_DIR, artistFolderId);
        if (fs.existsSync(artistDir)) {
            const songFiles = fs.readdirSync(artistDir).filter(f => f.endsWith('.json') && f !== 'settings.json');
            for (const songFile of songFiles) {
                const filePath = path.join(artistDir, songFile);
                const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
                data.isDeleted = true;
                data.savedAt = Date.now();
                fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
            }
            return true;
        }
        return false;
    });

    ipcMain.handle('update-tab-meta', (event, { oldId, newArtist, newSong }) => {
        const oldPath = path.join(TABS_DIR, oldId);
        if (fs.existsSync(oldPath)) {
            const data = JSON.parse(fs.readFileSync(oldPath, 'utf-8'));
            data.isDeleted = true;
            data.savedAt = Date.now();
            fs.writeFileSync(oldPath, JSON.stringify(data, null, 2), 'utf-8');
            
            const safeArtist = sanitize(newArtist);
            const safeSong = sanitize(newSong);
            const newId = `${safeArtist}/${safeSong}.json`;
            const newArtistDir = path.join(TABS_DIR, safeArtist);
            if (!fs.existsSync(newArtistDir)) fs.mkdirSync(newArtistDir, { recursive: true });
            
            const newData = { ...data, id: newId, artistId: safeArtist, artist: newArtist, song: newSong, isDeleted: false, savedAt: Date.now() };
            fs.writeFileSync(path.join(newArtistDir, safeSong + '.json'), JSON.stringify(newData, null, 2));
            return { newId };
        }
        throw new Error('Original tab not found');
    });

    ipcMain.handle('get-settings', () => fs.existsSync(SETTINGS_FILE) ? JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf-8')) : {});
    ipcMain.handle('save-settings', (event, settings) => fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2), 'utf-8'));

    ipcMain.handle('get-chord-db', () => {
        const dbPath = path.join(__dirname, 'chords.json');
        return fs.existsSync(dbPath) ? JSON.parse(fs.readFileSync(dbPath, 'utf-8')) : null;
    });

    ipcMain.handle('get-paths', () => ({ userData: app.getPath('userData'), tabs: TABS_DIR, settings: SETTINGS_FILE }));
}

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1400, height: 800, frame: false, icon: path.join(__dirname, 'icon.png'),
        webPreferences: { preload: path.join(__dirname, 'preload.js'), nodeIntegration: false, contextIsolation: true }
    });
    mainWindow.loadFile('index.html');
}

app.whenReady().then(() => {
    initializeIpc();
    createWindow();
    const protocolUrl = process.argv.find(arg => arg.startsWith('scordatura://'));
    if (protocolUrl) {
        mainWindow.webContents.once('did-finish-load', () => { setTimeout(() => handleProtocolUrl(protocolUrl), 500); });
    }
    app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
