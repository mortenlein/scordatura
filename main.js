const { app, BrowserWindow, ipcMain, session } = require('electron');
const path = require('path');
const fs = require('fs');
const cheerio = require('cheerio');

// We will store tabs in the user data folder under "tabs"
const TABS_DIR = path.join(app.getPath('userData'), 'tabs');
if (!fs.existsSync(TABS_DIR)) {
    fs.mkdirSync(TABS_DIR, { recursive: true });
}

let mainWindow;

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1400, // Widened slightly to accommodate the sidebar
        height: 800,
        show: false, // Don't show immediately to prevent focus stealing
        focusable: false, // Start completely unfocused so OS doesn't yank foreground
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            // Keep Node integration disabled for security on the renderer
            nodeIntegration: false,
            contextIsolation: true
        },
        icon: path.join(__dirname, 'icon.png'),
        frame: false,
        backgroundColor: '#111111'
    });

    // Show the window without stealing focus once it's completely ready
    mainWindow.once('ready-to-show', () => {
        mainWindow.showInactive();
        // Restore focusability so the user can actually use it later
        setTimeout(() => mainWindow.setFocusable(true), 500);
    });

    // Custom Window Control IPCs
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

    mainWindow.loadFile('index.html');
}

app.whenReady().then(() => {
    // Spoof the Origin and Referer headers for YouTube iframes to prevent Error 153
    session.defaultSession.webRequest.onBeforeSendHeaders(
        { urls: ["*://*.youtube.com/*", "*://*.youtube-nocookie.com/*"] },
        (details, callback) => {
            details.requestHeaders['Origin'] = 'http://localhost';
            details.requestHeaders['Referer'] = 'http://localhost/';
            callback({ requestHeaders: details.requestHeaders });
        }
    );

    createWindow();

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
});

// Helper string function for safe filenames
const sanitize = (str) => str.replace(/[^a-z0-9]/gi, '_').toLowerCase();

// IPC Handler for scraping
ipcMain.handle('scrape-url', async (event, url) => {
    if (!url || (!url.includes('ultimate-guitar.com') && !url.includes('guitaretab.com'))) {
        throw new Error('Please provide a valid ultimate-guitar.com or guitaretab.com URL');
    }

    // Create a hidden window to load the page
    const scraperWindow = new BrowserWindow({
        show: false,
        webPreferences: {
            offscreen: true // further hiding it
        }
    });

    try {
        // Intercept Artist Batch URLs
        if (url.includes('/artist/')) {
            let page = 1;
            let songs = {};
            let artistName = 'Unknown Artist';
            let seenUrls = new Set();

            // Extract artist slug from URL to filter out trending/recommended tabs
            // URL format: /artist/tom_odell_39037 -> slug: tom-odell
            const artistMatch = url.match(/\/artist\/([a-z0-9_]+?)_\d+\/?$/);
            const artistSlug = artistMatch ? artistMatch[1].replace(/_/g, '-') : null;
            console.log(`\nArtist slug: ${artistSlug}`);

            while (true) {
                let currentUrl = url;
                if (page > 1) {
                    currentUrl += (url.includes('?') ? '&' : '?') + `page=${page}`;
                }

                await scraperWindow.loadURL(currentUrl, {
                    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
                });

                // Wait for React to render the table and dump HTML
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
                        // Filter by artist slug to exclude trending/recommended tabs from other artists
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
                            // Strip version suffixes like "(ver 2)", "(ver 3)" so all versions group under one name
                            name = name.replace(/\s*\(ver\s*\d+\)\s*$/i, '').trim();
                            if (!songs[name]) songs[name] = [];
                            songs[name].push({ url: tabUrl, type, votes });
                            newTabsThisPage++;
                        }
                    }
                });

                if (page === 1) {
                    artistName = $('h1').first().text().trim() || 'Unknown Artist';
                    artistName = artistName.replace(/ tabs$/i, ''); // Strip trailing " tabs"
                }

                console.log(`\nPage ${page} found ${newTabsThisPage} new tabs.`);

                if (newTabsThisPage === 0) {
                    break;
                }

                page++;
                // Artificial delay between pages to avoid aggroing UG
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

            console.log(`\nReturning: ${bestTabs.length} tabs for ${artistName}`);

            return { isBatch: true, artist: artistName, tabs: bestTabs };
        }

        // --- Standard Single Tab Scraping ---
        // Navigate to the URL
        await scraperWindow.loadURL(url, {
            userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
        });

        // Wait a little bit for dynamic content to load if needed
        // We execute javascript on the page to extract the text AND artist/song
        const result = await scraperWindow.webContents.executeJavaScript(`
      new Promise((resolve) => {
        setTimeout(() => {
          let text = "Tab content not found.";
          let artist = "Unknown Artist";
          let song = "Unknown Song";

          const isGuitareTab = window.location.hostname.includes('guitaretab.com');

          if (isGuitareTab) {
              // Parse Artist and Song from specific GuitareTab header:
              // <h1 class="gt-hero__title">Lana Del Rey<span> - Mariners Apartment Complex chords </span></h1>
              try {
                  const heroTitle = document.querySelector('h1.gt-hero__title');
                  if (heroTitle) {
                      // The artist is the direct text node of the h1 (before the span)
                      const artistText = Array.from(heroTitle.childNodes)
                          .filter(node => node.nodeType === Node.TEXT_NODE)
                          .map(node => node.textContent.trim())
                          .join('');
                          
                      if (artistText) artist = artistText;

                      const spanNode = heroTitle.querySelector('span');
                      if (spanNode) {
                          let songText = spanNode.innerText.replace(/^[\\s-–—]+/, '').trim(); // Remove leading dashes
                          songText = songText.replace(/ chords?$/i, '').trim();
                          if (songText) song = songText;
                      }
                  } else {
                     // Fallback to title
                     let titleStr = document.title;
                     if (titleStr.includes(' chords')) {
                         titleStr = titleStr.split(' chords')[0];
                         const parts = titleStr.split(/ - | – /);
                         if (parts.length >= 2) {
                             artist = parts[0].trim();
                             song = parts.slice(1).join(' - ').trim();
                         }
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

          // Handle ultimate-guitar.com below...
          try {
             const pathParts = window.location.pathname.split('/').filter(Boolean);
             if (pathParts.length >= 3 && pathParts[0] === 'tab') {
                 // Format: eagles -> Eagles
                 artist = pathParts[1].replace(/-/g, ' ').replace(/\\b\\w/g, c => c.toUpperCase());
                 
                 // Format: hotel-california-chords-46190 -> Hotel California
                 let songPart = pathParts[2];
                 songPart = songPart.replace(/-(chords|tabs|bass|ukulele|drums|pro|power|official)-?\\d+$/, '');
                 song = songPart.replace(/-/g, ' ').replace(/\\b\\w/g, c => c.toUpperCase());
             } else if (pathParts.length === 2 && pathParts[0] === 'tab' && /^\\d+$/.test(pathParts[1])) {
                 // Format: /tab/1011988
                 // Direct ID URL. Let the js-store or document.title extractors handle it completely.
                 artist = "Unknown Artist";
             }
          } catch(e) {}

          if (artist === "Unknown Artist") {
              const titleMatch = document.title.match(/(.*?)\s+(?:CHORDS|TAB|BASS|PRO|UKULELE|POWER)(?:\s+\(ver\s+\d+\))?\s+by\s+(.*?)\s+@/i);
              
              if (titleMatch) {
                  song = titleMatch[1].trim();
                  artist = titleMatch[2].trim();
              } else {
                  const bySplit = document.title.split(/\s+by\s+/i);
                  if (bySplit.length >= 2) {
                     song = bySplit[0].trim();
                     artist = bySplit[1].split('@')[0].trim();
                  }
              }
              artist = artist.replace(/tabs?$/i, '').trim();
          }

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
        }, 3000); // 3 seconds to let React render
      });
    `);

        scraperWindow.close();

        // Safety check just in case executeJavaScript failed unexpectedly
        if (!result || typeof result === 'string') {
            throw new Error(result || "Extraction failed");
        }

        return result;

    } catch (error) {
        if (!scraperWindow.isDestroyed()) scraperWindow.close();
        throw new Error('Failed to scrape the URL: ' + error.message);
    }
});

// IPC Handler for saving tab
ipcMain.handle('save-tab', async (event, { artist, song, text, transpose, isStarred }) => {
    try {
        const safeArtist = sanitize(artist) || 'unknown_artist';
        const safeSong = sanitize(song) || 'unknown_song';

        const artistDir = path.join(TABS_DIR, safeArtist);
        if (!fs.existsSync(artistDir)) {
            fs.mkdirSync(artistDir, { recursive: true });
        }

        const filePath = path.join(artistDir, safeSong + '.json');
        const dataToSave = {
            artist,
            song,
            text,
            transpose: transpose || 0,
            isStarred: isStarred || false,
            savedAt: Date.now()
        };

        fs.writeFileSync(filePath, JSON.stringify(dataToSave, null, 2), 'utf-8');
        return true;
    } catch (e) {
        console.error("Failed to save:", e);
        return false;
    }
});

// IPC Handler for fetching the whole library tree
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
                    // Use the pretty artist name from the first song rather than sanitized folder name
                    artistName: songs[0].artist || artistDir.name,
                    songs: songs
                });
            }
        }

        // Sort starred songs alphabetically too
        starred.sort((a, b) => a.song.localeCompare(b.song));

        return { library, starred };
    } catch (e) {
        console.error("Failed to get library:", e);
        return { library: [], starred: [] };
    }
});

// IPC Handler for loading a specific tab
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

// IPC Handler for deleting a tab
ipcMain.handle('delete-tab', async (event, id) => {
    try {
        const filePath = path.join(TABS_DIR, id);
        if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);

            // Cleanup empty directory if no more songs exist for that artist
            const dirPath = path.dirname(filePath);
            const remaining = fs.readdirSync(dirPath);
            if (remaining.length === 0) {
                fs.rmdirSync(dirPath);
            }
            return true;
        }
        return false;
    } catch (e) {
        console.error("Failed to delete tab:", e);
        return false;
    }
});

// IPC Handler for deleting all tabs by an artist
ipcMain.handle('delete-artist', async (event, artistFolderId) => {
    try {
        const artistDir = path.join(TABS_DIR, artistFolderId);
        if (fs.existsSync(artistDir)) {
            fs.rmSync(artistDir, { recursive: true, force: true });
            return true;
        }
        return false;
    } catch (e) {
        console.error("Failed to delete artist:", e);
        return false;
    }
});

// IPC Handler for reading settings
const SETTINGS_FILE = path.join(TABS_DIR, 'settings.json');
ipcMain.handle('get-settings', async () => {
    try {
        if (fs.existsSync(SETTINGS_FILE)) {
            return JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf-8'));
        }
        return {}; // Return empty to allow frontend defaults
    } catch (e) {
        return {};
    }
});

// IPC Handler for saving settings
ipcMain.handle('save-settings', async (event, settingsObj) => {
    try {
        fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settingsObj, null, 2), 'utf-8');
        return true;
    } catch (e) {
        console.error("Failed to save settings:", e);
        return false;
    }
});

// IPC Handler for reading the static chord dictionary
ipcMain.handle('get-chord-db', async () => {
    try {
        const dbPath = path.join(__dirname, 'chords.json');
        if (fs.existsSync(dbPath)) {
            return JSON.parse(fs.readFileSync(dbPath, 'utf-8'));
        }
        return null;
    } catch (e) {
        console.error("Failed to load chords.json:", e);
        return null;
    }
});
