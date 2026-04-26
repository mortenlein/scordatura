const { app, BrowserWindow, ipcMain, session } = require('electron');
const path = require('path');
const fs = require('fs');
const cheerio = require('cheerio');

// OAuth 2.0 Client ID for Scordatura Desktop (Public Identifier - Safe for Git)
const CLIENT_ID = '441422462550-ikj32d57kuojel24hogmfnkdsvc6b7u7.apps.googleusercontent.com';

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
    process.exit(0);
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

const TABS_DIR = path.join(app.getPath('userData'), 'tabs');
const GDriveSync = require('./gdrive');
const TOKEN_PATH = path.join(app.getPath('userData'), 'token.json');

if (!fs.existsSync(TABS_DIR)) {
    fs.mkdirSync(TABS_DIR, { recursive: true });
}

// Initializing sync manager without a secret - secure PKCE standard
const syncManager = new GDriveSync({
    client_id: CLIENT_ID
}, app.getPath('userData'));

let mainWindow;

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1400,
        height: 800,
        show: false,
        focusable: false,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            nodeIntegration: false,
            contextIsolation: true
        },
        icon: path.join(__dirname, 'icon.png'),
        frame: false,
        backgroundColor: '#111111'
    });

    mainWindow.once('ready-to-show', () => {
        mainWindow.showInactive();
        setTimeout(() => mainWindow.setFocusable(true), 500);
    });

    ipcMain.handle('minimize-app', () => {
        mainWindow.minimize();
    });
    ipcMain.handle('maximize-app', () => {
        if (mainWindow.isMaximized()) {
            mainWindow.unmaximize();
        } else {
            mainWindow.maximize();
        }
    });
    ipcMain.handle('close-app', () => {
        mainWindow.close();
    });

    ipcMain.handle('sync-library', async () => {
        try {
            return await syncManager.sync();
        } catch (e) {
            console.error("Sync Error:", e);
            throw e;
        }
    });

    ipcMain.handle('has-token', () => fs.existsSync(TOKEN_PATH));

    mainWindow.loadFile('index.html');
}

function handleProtocolUrl(fullUrl) {
    if (!fullUrl) return;
    const urlToScrape = fullUrl.replace('scordatura://', '');
    if (urlToScrape && mainWindow) {
        mainWindow.webContents.send('protocol-url', urlToScrape);
    }
}

app.whenReady().then(() => {
    session.defaultSession.webRequest.onBeforeSendHeaders(
        { urls: ["*://*.youtube.com/*", "*://*.youtube-nocookie.com/*"] },
        (details, callback) => {
            details.requestHeaders['Origin'] = 'http://localhost';
            details.requestHeaders['Referer'] = 'http://localhost/';
            callback({ requestHeaders: details.requestHeaders });
        }
    );

    createWindow();

    const protocolUrl = process.argv.find(arg => arg.startsWith('scordatura://'));
    if (protocolUrl) {
        mainWindow.webContents.once('did-finish-load', () => {
            setTimeout(() => handleProtocolUrl(protocolUrl), 500);
        });
    }

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
});

const sanitize = (str) => str.replace(/[^a-z0-9]/gi, '_').toLowerCase();

ipcMain.handle('scrape-url', async (event, url) => {
    if (!url || (!url.includes('ultimate-guitar.com') && !url.includes('guitaretab.com'))) {
        throw new Error('Please provide a valid ultimate-guitar.com or guitaretab.com URL');
    }

    const scraperWindow = new BrowserWindow({
        show: false,
        webPreferences: {
            offscreen: true
        }
    });

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
                if (page > 1) {
                    currentUrl += (url.includes('?') ? '&' : '?') + `page=${page}`;
                }

                await scraperWindow.loadURL(currentUrl, {
                    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
                });

                const html = await scraperWindow.webContents.executeJavaScript(`
                    new Promise(resolve => {
                        setTimeout(() => resolve(document.documentElement.innerHTML), 3000);
                    });
                `);

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
                            let votes = 0;
                            if (votesMatch) {
                                votes = parseInt(votesMatch[1].replace(/,/g, ''));
                            }

                            let name = $(el).text().trim();
                            name = name.replace(/\s*\(ver\s*\d+\)\s*$/i, '').trim();
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

                if (newTabsThisPage === 0) {
                    break;
                }

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

        await scraperWindow.loadURL(url, {
            userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
        });

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
                      const artistText = Array.from(heroTitle.childNodes)
                          .filter(node => node.nodeType === Node.TEXT_NODE)
                          .map(node => node.textContent.trim())
                          .join('');
                          
                      if (artistText) artist = artistText;

                      const spanNode = heroTitle.querySelector('span');
                      if (spanNode) {
                          let songText = spanNode.innerText.replace(/^[\\s-–—]+/, '').trim();
                          songText = songText.replace(/ chords?$/i, '').trim();
                          if (songText) song = songText;
                      }
                  }
              } catch(e) {}
              
              const preNode = document.querySelector('pre');
              if (preNode) {
                  text = preNode.innerText;
              }
              resolve({ text, artist, song });
              return;
          }

          try {
             const pathParts = window.location.pathname.split('/').filter(Boolean);
             if (pathParts.length >= 3 && pathParts[0] === 'tab') {
                 artist = pathParts[1].replace(/-/g, ' ').replace(/\\b\\w/g, c => c.toUpperCase());
                 let songPart = pathParts[2];
                 songPart = songPart.replace(/-(chords|tabs|bass|ukulele|drums|pro|power|official)-?\\d+$/, '');
                 song = songPart.replace(/-/g, ' ').replace(/\\b\\w/g, c => c.toUpperCase());
             }
          } catch(e) {}

          const jsStore = document.querySelector('.js-store');
          if (jsStore) {
             try {
                const data = JSON.parse(jsStore.getAttribute('data-content'));
                if (data && data.store && data.store.page && data.store.page.data && data.store.page.data.tab_view) {
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

        if (!result || typeof result === 'string') {
            throw new Error(result || "Extraction failed");
        }

        return result;

    } catch (error) {
        if (!scraperWindow.isDestroyed()) scraperWindow.close();
        throw new Error('Failed to scrape the URL: ' + error.message);
    }
});

ipcMain.handle('save-tab', async (event, { artist, song, text, transpose, isStarred, isDeleted }) => {
    try {
        const safeArtist = sanitize(artist) || 'unknown_artist';
        const safeSong = sanitize(song) || 'unknown_song';

        const artistDir = path.join(TABS_DIR, safeArtist);
        if (!fs.existsSync(artistDir)) {
            fs.mkdirSync(artistDir, { recursive: true });
        }

        const filePath = path.join(artistDir, safeSong + '.json');
        const dataToSave = {
            id: safeArtist + '_' + safeSong,
            artistId: safeArtist,
            artist,
            song,
            text,
            transpose: transpose || 0,
            isStarred: isStarred || false,
            isDeleted: isDeleted || false,
            savedAt: Date.now()
        };

        fs.writeFileSync(filePath, JSON.stringify(dataToSave, null, 2), 'utf-8');
        return true;
    } catch (e) {
        return false;
    }
});

ipcMain.handle('get-library', async () => {
    try {
        if (!fs.existsSync(TABS_DIR)) return { library: [], starred: [] };

        const library = [];
        const starred = [];
        const artistDirs = fs.readdirSync(TABS_DIR, { withFileTypes: true })
            .filter(dirent => dirent.isDirectory())
            .sort((a, b) => a.name.localeCompare(b.name));

        for (const artistDir of artistDirs) {
            const dPath = path.join(TABS_DIR, artistDir.name);
            const songFiles = fs.readdirSync(dPath)
                .filter(file => file.endsWith('.json'))
                .sort((a, b) => a.localeCompare(b));

            const songs = songFiles.map(songFile => {
                const songPath = path.join(dPath, songFile);
                let data = {};
                try {
                    const content = fs.readFileSync(songPath, 'utf-8');
                    data = JSON.parse(content);
                } catch (err) {
                    return null;
                }

                if (data.isDeleted) return null;

                const songObj = {
                    id: artistDir.name + '/' + songFile,
                    artist: data.artist || artistDir.name,
                    song: data.song || songFile.replace('.json', ''),
                    transpose: data.transpose || 0,
                    isStarred: data.isStarred || false
                };

                if (songObj.isStarred) {
                    starred.push(songObj);
                }

                return songObj;
            }).filter(Boolean);

            if (songs.length > 0) {
                library.push({
                    artistId: artistDir.name,
                    artistName: songs[0].artist || artistDir.name,
                    songs: songs
                });
            }
        }

        starred.sort((a, b) => a.song.localeCompare(b.song));
        return { library, starred };
    } catch (e) {
        return { library: [], starred: [] };
    }
});

ipcMain.handle('load-tab', async (event, id) => {
    try {
        const filePath = path.join(TABS_DIR, id);
        if (fs.existsSync(filePath)) {
            return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
        }
        throw new Error("File not found");
    } catch (e) {
        throw e;
    }
});

ipcMain.handle('delete-tab', async (event, id) => {
    try {
        const filePath = path.join(TABS_DIR, id);
        if (fs.existsSync(filePath)) {
            const content = fs.readFileSync(filePath, 'utf-8');
            const data = JSON.parse(content);
            data.isDeleted = true;
            data.savedAt = Date.now();
            fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
            return true;
        }
        return false;
    } catch (e) {
        return false;
    }
});

ipcMain.handle('sync-library', async () => {
    return await syncManager.sync();
});

ipcMain.handle('has-token', () => fs.existsSync(TOKEN_PATH));

ipcMain.handle('delete-artist', async (event, artistFolderId) => {
    try {
        const artistDir = path.join(TABS_DIR, artistFolderId);
        if (fs.existsSync(artistDir)) {
            fs.rmSync(artistDir, { recursive: true, force: true });
            return true;
        }
        return false;
    } catch (e) {
        return false;
    }
});

const SETTINGS_FILE = path.join(TABS_DIR, 'settings.json');
ipcMain.handle('get-settings', async () => {
    try {
        if (fs.existsSync(SETTINGS_FILE)) {
            return JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf-8'));
        }
        return {};
    } catch (e) {
        return {};
    }
});

ipcMain.handle('save-settings', async (event, settingsObj) => {
    try {
        fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settingsObj, null, 2), 'utf-8');
        return true;
    } catch (e) {
        return false;
    }
});

ipcMain.handle('get-chord-db', async () => {
    try {
        const dbPath = path.join(__dirname, 'chords.json');
        if (fs.existsSync(dbPath)) {
            return JSON.parse(fs.readFileSync(dbPath, 'utf-8'));
        }
        return null;
    } catch (e) {
        return null;
    }
});
