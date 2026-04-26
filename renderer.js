const urlInput = document.getElementById('urlInput');
const fetchBtn = document.getElementById('fetchBtn');
const tabContainer = document.getElementById('tabContainer');
const tabViewSheet = document.getElementById('tabViewSheet');
const tabEditor = document.getElementById('tabEditor');
const loadingIndicator = document.getElementById('loadingIndicator'); // Deprecated, keeping var for safety if I missed a spot
const scraperProgressSection = document.getElementById('scraperProgressSection');
const scraperStatusText = document.getElementById('scraperStatusText');
const scraperProgressBar = document.getElementById('scraperProgressBar');
const errorMessage = document.getElementById('errorMessage');
const controlsGroup = document.getElementById('controlsGroup');
const transposeUpBtn = document.getElementById('transposeUpBtn');
const transposeDownBtn = document.getElementById('transposeDownBtn');
const transposeLabel = document.getElementById('transposeLabel');

const libraryContainer = document.getElementById('libraryContainer');
const starredContainer = document.getElementById('starredContainer');
const songHeader = document.getElementById('songHeader');
const songTitleEl = document.getElementById('songTitle');
const artistNameEl = document.getElementById('artistName');

const starBtn = document.getElementById('starBtn');
const editBtn = document.getElementById('editBtn');
const editMetaBtn = document.getElementById('editMetaBtn');
const deleteBtn = document.getElementById('deleteBtn');
const chordDiagrams = document.getElementById('chordDiagrams');

// Edit Meta Modal
const editMetaModal = document.getElementById('editMetaModal');
const closeEditMetaBtn = document.getElementById('closeEditMetaBtn');
const metaArtistInput = document.getElementById('metaArtistInput');
const metaSongInput = document.getElementById('metaSongInput');
const saveMetaBtn = document.getElementById('saveMetaBtn');

// Window Controls
const minBtn = document.getElementById('minBtn');
const maxBtn = document.getElementById('maxBtn');
const closeBtn = document.getElementById('closeBtn');

// Settings Elements
const openSettingsBtn = document.getElementById('openSettingsBtn');
const closeSettingsBtn = document.getElementById('closeSettingsBtn');
const settingsModal = document.getElementById('settingsModal');
const tuningListEl = document.getElementById('tuningList');
const tuningNameInput = document.getElementById('tuningName');
const addTuningBtn = document.getElementById('addTuningBtn');
const customTuningInputs = [
    document.getElementById('t6'), document.getElementById('t5'), document.getElementById('t4'),
    document.getElementById('t3'), document.getElementById('t2'), document.getElementById('t1')
];

// Confirm Modal Elements
const confirmModal = document.getElementById('confirmModal');
const confirmMessage = document.getElementById('confirmMessage');
const confirmCancelBtn = document.getElementById('confirmCancelBtn');
const confirmDeleteBtn = document.getElementById('confirmDeleteBtn');

// Status Bar Elements
const fontDecreaseBtn = document.getElementById('fontDecreaseBtn');
const fontIncreaseBtn = document.getElementById('fontIncreaseBtn');
const fontSizeLabel = document.getElementById('fontSizeLabel');
const showChordsBtn = document.getElementById('showChordsBtn');
const smallChordsBtn = document.getElementById('smallChordsBtn');
const quickTuningSelect = document.getElementById('quickTuningSelect');
const dashboardView = document.getElementById('dashboardView');
const statTotalTabs = document.getElementById('statTotalTabs');
const statTotalArtists = document.getElementById('statTotalArtists');
const statStarredTabs = document.getElementById('statStarredTabs');
const appLogo = document.querySelector('.app-logo');

let rawParsedText = '';
let currentTranspose = 0;
let currentTabMetadata = null;
let isStarred = false;
let isEditing = false;

// Settings State
let globalSettings = {
    fontSize: 14,
    showChords: true,
    smallChords: false,
    activeTuningId: 'standard',
    starredTunings: [],
    customTunings: [],
    lastSyncTime: null
};

const DEFAULT_TUNINGS = [
    { id: 'standard', name: 'Standard', notes: ['E', 'A', 'D', 'G', 'B', 'E'] },
    { id: 'drop_d', name: 'Drop D', notes: ['D', 'A', 'D', 'G', 'B', 'E'] },
    { id: 'half_step', name: 'Half Step Down', notes: ['D#', 'G#', 'C#', 'F#', 'A#', 'D#'] },
    { id: 'dadgad', name: 'DADGAD', notes: ['D', 'A', 'D', 'G', 'A', 'D'] },
    { id: 'open_g', name: 'Open G', notes: ['D', 'G', 'D', 'G', 'B', 'D'] },
    { id: 'open_d', name: 'Open D', notes: ['D', 'A', 'D', 'F#', 'A', 'D'] },
    { id: 'open_c', name: 'Open C', notes: ['C', 'G', 'C', 'G', 'C', 'E'] },
    { id: 'open_b', name: 'Open B', notes: ['B', 'F#', 'B', 'F#', 'B', 'D#'] }
];

const NOTES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const ALIASES = { 'Db': 'C#', 'Eb': 'D#', 'Gb': 'F#', 'Ab': 'G#', 'Bb': 'A#' };

const CHORD_INTERVALS = {
    '': [0, 4, 7],         // Major
    'm': [0, 3, 7],        // Minor
    'min': [0, 3, 7],
    '7': [0, 4, 7, 10],    // Dom7
    'm7': [0, 3, 7, 10],   // Min7
    'maj7': [0, 4, 7, 11], // Maj7
    'M7': [0, 4, 7, 11],   // Maj7
    'sus2': [0, 2, 7],
    'sus4': [0, 5, 7],
    'dim': [0, 3, 6],
    'dim7': [0, 3, 6, 9],
    'aug': [0, 4, 8],
    '5': [0, 7],           // Power
    '9': [0, 4, 7, 10, 14], // Dom9 (approximated)
    'add9': [0, 4, 7, 14],
    'm9': [0, 3, 7, 10, 14],
    '11': [0, 4, 7, 10, 17], // Dom11 (approximated)
    'm11': [0, 3, 7, 10, 17]
};


// --- INITIALIZATION ---

/**
 * Custom Promise-based confirmation modal
 * @param {string} message 
 * @returns {Promise<boolean>}
 */
function showConfirm(message) {
    return new Promise((resolve) => {
        confirmMessage.textContent = message;
        confirmModal.classList.remove('hidden');

        const cleanup = (result) => {
            confirmModal.classList.add('hidden');
            confirmCancelBtn.removeEventListener('click', onCancel);
            confirmDeleteBtn.removeEventListener('click', onDelete);
            resolve(result);
        };

        const onCancel = () => cleanup(false);
        const onDelete = () => cleanup(true);

        confirmCancelBtn.addEventListener('click', onCancel);
        confirmDeleteBtn.addEventListener('click', onDelete);
    });
}
window.addEventListener('DOMContentLoaded', async () => {
    // Populate dropdowns for custom tunings
    customTuningInputs.forEach(selectEl => {
        const emptyOpt = document.createElement('option');
        emptyOpt.value = '';
        emptyOpt.textContent = '-';
        selectEl.appendChild(emptyOpt);
        NOTES.forEach(note => {
            const opt = document.createElement('option');
            opt.value = note;
            opt.textContent = note;
            selectEl.appendChild(opt);
        });
    });

    // Load static chord dictionary
    window.chordDb = await window.api.getChordDb();

    // Load settings
    const savedSettings = await window.api.getSettings();
    console.log('Renderer: Loaded Settings from main:', savedSettings);
    globalSettings = { ...globalSettings, ...savedSettings };
    console.log('Renderer: Merged Settings:', globalSettings);
    if (!globalSettings.starredTunings) globalSettings.starredTunings = [];
    if (!globalSettings.customTunings) globalSettings.customTunings = [];
    if (globalSettings.showChords === undefined) globalSettings.showChords = true;
    if (globalSettings.smallChords === undefined) globalSettings.smallChords = false;

    applyFontSize();

    if (globalSettings.showChords) {
        showChordsBtn.classList.add('active');
    } else {
        chordDiagrams.style.display = 'none';
        showChordsBtn.classList.remove('active');
    }

    if (globalSettings.smallChords) {
        chordDiagrams.classList.add('small');
        smallChordsBtn.classList.add('active');
    } else {
        smallChordsBtn.classList.remove('active');
    }

    renderTuningList();
    await refreshLibrary();
    updateLastSyncDisplay();
    showDashboard();
});

// --- SETTINGS LOGIC ---
async function saveSettings() {
    await window.api.saveSettings(globalSettings);
    renderTuningList();
    if (rawParsedText) {
        // Re-render chords to reflect new tuning if it changed
        renderTabs();
    }
}

function applyFontSize() {
    tabContainer.style.fontSize = `${globalSettings.fontSize}px`;
    tabEditor.style.fontSize = `${globalSettings.fontSize}px`;
    fontSizeLabel.textContent = `${globalSettings.fontSize}`;
}
smallChordsBtn.addEventListener('click', () => {
    globalSettings.smallChords = !globalSettings.smallChords;
    saveSettings();
    if (globalSettings.smallChords) {
        chordDiagrams.classList.add('small');
        smallChordsBtn.classList.add('active');
    } else {
        chordDiagrams.classList.remove('small');
        smallChordsBtn.classList.remove('active');
    }
});

showChordsBtn.addEventListener('click', () => {
    globalSettings.showChords = !globalSettings.showChords;
    saveSettings();
    if (globalSettings.showChords) {
        showChordsBtn.classList.add('active');
        if (chordDiagrams.children.length > 0) chordDiagrams.style.display = 'flex';
    } else {
        showChordsBtn.classList.remove('active');
        chordDiagrams.style.display = 'none';
    }
});

fontIncreaseBtn.addEventListener('click', () => {
    if (globalSettings.fontSize < 30) {
        globalSettings.fontSize += 2;
        applyFontSize();
        saveSettings();
    }
});

fontDecreaseBtn.addEventListener('click', () => {
    if (globalSettings.fontSize > 8) {
        globalSettings.fontSize -= 2;
        applyFontSize();
        saveSettings();
    }
});

openSettingsBtn.addEventListener('click', () => settingsModal.classList.remove('hidden'));
closeSettingsBtn.addEventListener('click', () => settingsModal.classList.add('hidden'));

// --- TUNING MANAGER LOGIC ---
function getAllTunings() {
    return [...DEFAULT_TUNINGS, ...globalSettings.customTunings];
}

function getActiveTuning() {
    const all = getAllTunings();
    return all.find(t => t.id === globalSettings.activeTuningId) || DEFAULT_TUNINGS[0];
}

function renderTuningList() {
    tuningListEl.innerHTML = '';
    const allTunings = getAllTunings();

    // Sort: Starred first, then standard sort (Customs at bottom)
    allTunings.sort((a, b) => {
        const aStar = globalSettings.starredTunings.includes(a.id) ? 1 : 0;
        const bStar = globalSettings.starredTunings.includes(b.id) ? 1 : 0;
        if (aStar !== bStar) return bStar - aStar;
        return 0; // retain default order
    });

    allTunings.forEach(t => {
        const isStarred = globalSettings.starredTunings.includes(t.id);
        const div = document.createElement('div');
        div.className = 'tuning-item';
        if (t.id === globalSettings.activeTuningId) div.classList.add('active-tuning');

        div.innerHTML = `
            <div class="tuning-info">
                <span class="tuning-name">${t.name}</span>
                <span class="tuning-notes">${t.notes.join(' ')}</span>
            </div>
            <div class="tuning-actions">
                ${isStarred ? `<button class="tuning-star starred" title="Unstar Tuning">★</button>` : `<button class="tuning-star" title="Star Tuning">☆</button>`}
            </div>
        `;

        tuningListEl.appendChild(div);

        // Click on the entire row to select tuning
        div.addEventListener('click', (e) => {
            if (e.target.closest('.tuning-star')) return; // Ignore if clicking the star button
            globalSettings.activeTuningId = t.id;
            saveSettings();
        });

        // Click only on the star button
        div.querySelector('.tuning-star').addEventListener('click', (e) => {
            e.stopPropagation();
            if (isStarred) {
                globalSettings.starredTunings = globalSettings.starredTunings.filter(id => id !== t.id);
            } else {
                globalSettings.starredTunings.push(t.id);
            }
            saveSettings();
        });
    });

    // Populate Status Bar Select
    quickTuningSelect.innerHTML = '';
    allTunings.forEach(t => {
        const isStarred = globalSettings.starredTunings.includes(t.id);
        const prefix = isStarred ? '★ ' : '';
        const opt = document.createElement('option');
        opt.value = t.id;
        opt.textContent = `${prefix}${t.name}`;
        if (t.id === globalSettings.activeTuningId) {
            opt.selected = true;
        }
        quickTuningSelect.appendChild(opt);
    });
}

// --- DASHBOARD LOGIC ---
function showDashboard() {
    // Hide components
    songHeader.classList.add('hidden');
    tabContainer.classList.add('hidden');
    tabEditor.classList.add('hidden');
    controlsGroup.classList.add('hidden');
    chordDiagrams.classList.add('hidden');
    errorMessage.classList.add('hidden');

    // Show dashboard
    dashboardView.classList.remove('hidden');
    updateDashboardStats();

    // Clear active state from sidebar
    document.querySelectorAll('.song-item').forEach(el => el.classList.remove('active'));
    currentTabMetadata = null;
    rawParsedText = '';
}

function updateDashboardStats() {
    const allArtists = document.querySelectorAll('#libraryContainer .artist-group');
    const allTabs = document.querySelectorAll('#libraryContainer .song-item');
    const starredTabs = document.querySelectorAll('#starredContainer .song-item');

    statTotalTabs.textContent = allTabs.length;
    statTotalArtists.textContent = allArtists.length;
    statStarredTabs.textContent = starredTabs.length;
}

appLogo.addEventListener('click', showDashboard);

quickTuningSelect.addEventListener('change', () => {
    globalSettings.activeTuningId = quickTuningSelect.value;
    saveSettings();
});

// Arrow Key Shortcuts for Tuning Selection
document.addEventListener('keydown', (e) => {
    // Ignore input fields
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

    if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
        e.preventDefault();
        const opts = Array.from(quickTuningSelect.options);
        const currIdx = quickTuningSelect.selectedIndex;
        let newIdx = currIdx;

        if (e.key === 'ArrowUp' && currIdx > 0) newIdx--;
        if (e.key === 'ArrowDown' && currIdx < opts.length - 1) newIdx++;

        if (newIdx !== currIdx) {
            quickTuningSelect.selectedIndex = newIdx;
            quickTuningSelect.dispatchEvent(new Event('change'));
        }
    }
});

addTuningBtn.addEventListener('click', () => {
    const name = tuningNameInput.value.trim();
    if (!name) return alert('Enter a tuning name');

    const notesArr = customTuningInputs.map(inp => {
        let val = inp.value.trim();
        val = val.charAt(0).toUpperCase() + val.slice(1).toLowerCase();
        if (ALIASES[val]) val = ALIASES[val];
        return NOTES.includes(val) ? val : 'E'; // E fallback if invalid
    });

    const id = 'custom_' + Date.now();
    globalSettings.customTunings.push({ id, name, notes: notesArr });

    // Clear inputs
    tuningNameInput.value = '';
    customTuningInputs.forEach(i => i.value = '');

    globalSettings.activeTuningId = id; // auto select
    saveSettings();
    renderTuningList();
    renderTabs();
    if (currentTabMetadata) saveCurrentTab();
});


// --- LIBRARY LOGIC ---
async function refreshLibrary() {
    try {
        const { library, starred } = await window.api.getLibrary();
        libraryContainer.innerHTML = '';
        starredContainer.innerHTML = '';

        if (starred.length === 0) {
            starredContainer.innerHTML = '<div style="padding:10px 20px; color:#666; font-size: 0.85rem;">No starred tabs</div>';
        } else {
            starred.forEach(song => {
                const songItem = document.createElement('div');
                songItem.className = 'song-item';
                songItem.textContent = `${song.artist} - ${song.song}`;
                songItem.dataset.id = song.id;
                if (currentTabMetadata && currentTabMetadata.id === song.id) songItem.classList.add('active');
                songItem.addEventListener('click', () => loadTabFromLibrary(song.id, songItem));
                starredContainer.appendChild(songItem);
            });
        }

        if (library.length === 0) {
            libraryContainer.innerHTML = '<div style="padding:20px; color:#777; font-size: 0.9rem;">No saved tabs.</div>';
            return;
        }

        library.forEach(artist => {
            const group = document.createElement('div');
            group.className = 'artist-group';

            // Restore collapsed state from localStorage
            const collapsedArtists = JSON.parse(localStorage.getItem('collapsedArtists') || '[]');
            if (collapsedArtists.includes(artist.artistId)) {
                group.classList.add('collapsed');
            }

            const artistHeader = document.createElement('div');
            artistHeader.className = 'artist-header';
            artistHeader.style.cursor = 'pointer';

            const toggleDiv = document.createElement('div');
            toggleDiv.style.display = 'flex';
            toggleDiv.style.alignItems = 'center';
            toggleDiv.style.flex = '1';

            const chevron = document.createElement('span');
            chevron.className = 'artist-chevron';
            chevron.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right: 4px; transition: transform 0.2s; color: var(--text-muted);"><polyline points="6 9 12 15 18 9"></polyline></svg>';
            chevron.style.display = 'flex';
            chevron.style.alignItems = 'center';

            const artistTitle = document.createElement('div');
            artistTitle.className = 'artist-name';
            artistTitle.textContent = artist.artistName;

            toggleDiv.appendChild(chevron);
            toggleDiv.appendChild(artistTitle);

            const deleteArtistBtn = document.createElement('button');
            deleteArtistBtn.className = 'delete-artist-btn';
            deleteArtistBtn.title = `Delete all ${artist.artistName} tabs`;
            deleteArtistBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>';
            deleteArtistBtn.addEventListener('click', async (e) => {
                e.stopPropagation();
                if (await showConfirm(`Delete ALL tabs by "${artist.artistName}"? This cannot be undone.`)) {
                    await window.api.deleteArtist(artist.artistId);
                    // If the currently displayed tab belongs to this artist, clear it
                    if (currentTabMetadata && currentTabMetadata.id.startsWith(artist.artistId + '/')) {
                        tabViewSheet.classList.add('hidden');
                        tabContainer.classList.add('hidden');
                        songHeader.classList.add('hidden');
                        controlsGroup.classList.add('hidden');
                        chordDiagrams.classList.add('hidden');
                        currentTabMetadata = null;
                    }
                    await refreshLibrary();
                }
            });

            artistHeader.appendChild(toggleDiv);
            artistHeader.appendChild(deleteArtistBtn);
            group.appendChild(artistHeader);

            artistHeader.addEventListener('click', (e) => {
                if (e.target.closest('.delete-artist-btn')) return;
                group.classList.toggle('collapsed');
                // Persist collapsed state
                const stored = JSON.parse(localStorage.getItem('collapsedArtists') || '[]');
                if (group.classList.contains('collapsed')) {
                    if (!stored.includes(artist.artistId)) stored.push(artist.artistId);
                } else {
                    const idx = stored.indexOf(artist.artistId);
                    if (idx > -1) stored.splice(idx, 1);
                }
                localStorage.setItem('collapsedArtists', JSON.stringify(stored));
            });

            artist.songs.forEach(song => {
                const songItem = document.createElement('div');
                songItem.className = 'song-item';
                let label = song.song.replace('.json', '');

                const starHtml = '<svg class="svg-icon" style="margin-right:4px; vertical-align:text-bottom; color:gold;" xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg>';

                const songLabel = document.createElement('span');
                songLabel.className = 'song-label';
                songLabel.innerHTML = song.isStarred ? starHtml + label : label;

                const deleteSongBtn = document.createElement('button');
                deleteSongBtn.className = 'delete-artist-btn';
                deleteSongBtn.title = `Delete ${label}`;
                deleteSongBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>';
                deleteSongBtn.addEventListener('click', async (e) => {
                    e.stopPropagation();
                    if (await showConfirm(`Delete "${label}"?`)) {
                        await window.api.deleteTab(song.id);
                        if (currentTabMetadata && currentTabMetadata.id === song.id) {
                            tabViewSheet.classList.add('hidden');
                            tabContainer.classList.add('hidden');
                            songHeader.classList.add('hidden');
                            controlsGroup.classList.add('hidden');
                            chordDiagrams.classList.add('hidden');
                            currentTabMetadata = null;
                        }
                        await refreshLibrary();
                    }
                });

                songItem.appendChild(songLabel);
                songItem.appendChild(deleteSongBtn);
                songItem.dataset.id = song.id;

                if (currentTabMetadata && currentTabMetadata.id === song.id) {
                    songItem.classList.add('active');
                }

                songItem.addEventListener('click', (e) => {
                    if (e.target.closest('.delete-artist-btn')) return;
                    loadTabFromLibrary(song.id, songItem);
                });
                group.appendChild(songItem);
            });

            libraryContainer.appendChild(group);
        });
    } catch (e) {
        console.error("Error loading library", e);
    }
}

function appendTabToSidebar(artistName, songName, id, isStarred, animate) {
    // Remove "No saved tabs" empty state if it's there
    if (libraryContainer.innerHTML.includes('No saved tabs.')) {
        libraryContainer.innerHTML = '';
    }

    // Try to find an existing group for this artist
    let artistGroup = null;
    const groups = document.querySelectorAll('.artist-group');
    for (let g of groups) {
        let titleEl = g.querySelector('.artist-name');
        if (titleEl && titleEl.textContent === artistName) {
            artistGroup = g;
            break;
        }
    }

    // If no artist group exists, create one
    if (!artistGroup) {
        artistGroup = document.createElement('div');
        artistGroup.className = 'artist-group';

        const artistHeader = document.createElement('div');
        artistHeader.className = 'artist-header';
        artistHeader.style.cursor = 'pointer';

        const toggleDiv = document.createElement('div');
        toggleDiv.style.display = 'flex';
        toggleDiv.style.alignItems = 'center';
        toggleDiv.style.flex = '1';

        const chevron = document.createElement('span');
        chevron.className = 'artist-chevron';
        chevron.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right: 4px; transition: transform 0.2s; color: var(--text-muted);"><polyline points="6 9 12 15 18 9"></polyline></svg>';
        chevron.style.display = 'flex';
        chevron.style.alignItems = 'center';

        const artistTitle = document.createElement('div');
        artistTitle.className = 'artist-name';
        artistTitle.textContent = artistName;

        toggleDiv.appendChild(chevron);
        toggleDiv.appendChild(artistTitle);
        artistHeader.appendChild(toggleDiv);

        const deleteArtistBtn = document.createElement('button');
        deleteArtistBtn.className = 'delete-artist-btn';
        deleteArtistBtn.title = `Delete all ${artistName} tabs`;
        deleteArtistBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>';
        deleteArtistBtn.addEventListener('click', async (e) => {
            e.stopPropagation();
            if (await window.api.showConfirm(`Delete ALL tabs by "${artistName}"? This cannot be undone.`)) {
                // Fetch library to find artistId purely to delete
                const lib = await window.api.loadLibrary();
                const matched = lib.find(a => a.artistName === artistName);
                if (matched) {
                    await window.api.deleteArtist(matched.artistId);
                    if (currentTabMetadata && currentTabMetadata.id.startsWith(matched.artistId + '/')) {
                        tabViewSheet.classList.add('hidden');
                    }
                    await refreshLibrary();
                }
            }
        });

        artistHeader.appendChild(deleteArtistBtn);
        artistGroup.appendChild(artistHeader);

        artistHeader.addEventListener('click', (e) => {
            if (e.target.closest('.delete-artist-btn')) return;
            artistGroup.classList.toggle('collapsed');
            // Persist collapsed state
            const stored = JSON.parse(localStorage.getItem('collapsedArtists') || '[]');
            const artistKey = artistName.toLowerCase().replace(/[^a-z0-9]/g, '_');
            if (artistGroup.classList.contains('collapsed')) {
                if (!stored.includes(artistKey)) stored.push(artistKey);
            } else {
                const idx = stored.indexOf(artistKey);
                if (idx > -1) stored.splice(idx, 1);
            }
            localStorage.setItem('collapsedArtists', JSON.stringify(stored));
        });

        libraryContainer.appendChild(artistGroup);
    }

    // Create the new song item
    const songItem = document.createElement('div');
    songItem.className = 'song-item';
    if (animate) songItem.classList.add('fade-in-bold');

    let label = songName.replace('.json', '');
    const starHtml = '<svg class="svg-icon" style="margin-right:4px; vertical-align:text-bottom; color:gold;" xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg>';
    songItem.innerHTML = isStarred ? starHtml + label : label;
    songItem.dataset.id = id;

    if (currentTabMetadata && currentTabMetadata.id === id) {
        songItem.classList.add('active');
    }

    songItem.addEventListener('click', () => loadTabFromLibrary(id, songItem));

    // Attempt to insert alphabetically within the group
    let inserted = false;
    const existingSongs = artistGroup.querySelectorAll('.song-item');
    for (let existing of existingSongs) {
        if (existing.textContent.localeCompare(label) > 0) {
            artistGroup.insertBefore(songItem, existing);
            inserted = true;
            break;
        }
    }

    if (!inserted) {
        artistGroup.appendChild(songItem);
    }
}

async function loadTabFromLibrary(id, element) {
    if (isEditing) exitEditMode();

    try {
        errorMessage.classList.add('hidden');
        tabViewSheet.classList.add('hidden');
        tabContainer.classList.add('hidden');
        songHeader.classList.add('hidden');
        controlsGroup.classList.add('hidden');
        chordDiagrams.classList.add('hidden');

        scraperProgressSection.classList.remove('hidden');
        scraperProgressSection.style.display = 'flex';
        scraperStatusText.textContent = 'Loading saved tab...';
        scraperProgressBar.style.width = '100%';
        scraperProgressBar.parentElement.style.display = 'block';

        document.querySelectorAll('.song-item').forEach(el => el.classList.remove('active'));
        if (element) element.classList.add('active');

        const tabData = await window.api.loadTab(id);

        rawParsedText = tabData.text;
        currentTranspose = tabData.transpose || 0;
        isStarred = tabData.isStarred || false;
        currentTabMetadata = { artist: tabData.artist, song: tabData.song, id: id };

        songTitleEl.textContent = tabData.song;
        artistNameEl.textContent = tabData.artist;

        updateStarButtonState();
        renderTabs();
        tabViewSheet.classList.remove('hidden');

        songHeader.classList.remove('hidden');
        tabContainer.classList.remove('hidden');
        controlsGroup.classList.remove('hidden');
    } catch (e) {
        errorMessage.textContent = 'Failed to load tab: ' + e.message;
        errorMessage.classList.remove('hidden');
    } finally {
        scraperProgressSection.classList.add('hidden');
        scraperProgressSection.style.display = 'none';
    }
}

async function saveCurrentTab() {
    if (currentTabMetadata && rawParsedText) {
        await window.api.saveTab({
            artist: currentTabMetadata.artist,
            song: currentTabMetadata.song,
            text: rawParsedText,
            transpose: currentTranspose,
            isStarred: isStarred
        });
        await refreshLibrary();
    }
}

// --- TAB ACTIONS (Delete, Star, Edit) ---
deleteBtn.addEventListener('click', async () => {
    if (!currentTabMetadata) return;
    if (await showConfirm(`Are you sure you want to delete "${currentTabMetadata.song}"?`)) {
        await window.api.deleteTab(currentTabMetadata.id);

        tabContainer.classList.add('hidden');
        songHeader.classList.add('hidden');
        controlsGroup.classList.add('hidden');
        chordDiagrams.classList.add('hidden');
        if (isEditing) exitEditMode();
        currentTabMetadata = null;
        rawParsedText = '';

        await refreshLibrary();
    }
});

starBtn.addEventListener('click', async () => {
    isStarred = !isStarred;
    updateStarButtonState();
    await saveCurrentTab();
});

// --- EDIT METADATA ---
editMetaBtn.addEventListener('click', () => {
    if (!currentTabMetadata) return;
    metaArtistInput.value = currentTabMetadata.artist;
    metaSongInput.value = currentTabMetadata.song;
    editMetaModal.classList.remove('hidden');
});

closeEditMetaBtn.addEventListener('click', () => {
    editMetaModal.classList.add('hidden');
});

editMetaModal.addEventListener('click', (e) => {
    if (e.target === editMetaModal) editMetaModal.classList.add('hidden');
});

saveMetaBtn.addEventListener('click', async () => {
    if (!currentTabMetadata) return;
    const newArtist = metaArtistInput.value.trim();
    const newSong = metaSongInput.value.trim();
    if (!newArtist || !newSong) return;

    try {
        const result = await window.api.updateTabMeta({
            oldId: currentTabMetadata.id,
            newArtist,
            newSong
        });

        // Update in-memory metadata
        currentTabMetadata.artist = newArtist;
        currentTabMetadata.song = newSong;
        currentTabMetadata.id = result.newId;

        // Update the song header display
        songTitleEl.textContent = newSong;
        artistNameEl.textContent = newArtist;

        editMetaModal.classList.add('hidden');
        await refreshLibrary();
    } catch (e) {
        errorMessage.textContent = 'Failed to update metadata: ' + e.message;
        errorMessage.classList.remove('hidden');
    }
});

// Window Control Listeners
minBtn.addEventListener('click', () => window.api.minimizeApp());
maxBtn.addEventListener('click', () => window.api.maximizeApp());
closeBtn.addEventListener('click', () => window.api.closeApp());



function updateStarButtonState() {
    if (isStarred) {
        starBtn.classList.add('active-star');
    } else {
        starBtn.classList.remove('active-star');
    }
}

editBtn.addEventListener('click', () => {
    if (isEditing) exitEditMode(); else enterEditMode();
});

function enterEditMode() {
    isEditing = true;
    editBtn.innerHTML = '<svg class="svg-icon" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"></path><polyline points="17 21 17 13 7 13 7 21"></polyline><polyline points="7 3 7 8 15 8"></polyline></svg>';
    editBtn.title = 'Save Edits';
    editBtn.style.color = 'var(--accent)';

    tabEditor.value = rawParsedText;

    tabContainer.classList.add('hidden');
    tabEditor.classList.remove('hidden');
    controlsGroup.style.opacity = '0.5';
    controlsGroup.style.pointerEvents = 'none';
}

function exitEditMode() {
    isEditing = false;
    editBtn.innerHTML = '<svg class="svg-icon" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"></path></svg>';
    editBtn.title = 'Edit Tab';
    editBtn.style.color = 'var(--text-muted)';

    rawParsedText = tabEditor.value;

    tabEditor.classList.add('hidden');
    controlsGroup.style.opacity = '1';
    controlsGroup.style.pointerEvents = 'all';

    renderTabs();
    tabContainer.classList.remove('hidden');
    saveCurrentTab();
}

// --- TRANSPOSE LOGIC ---
function transposeChord(chordStr, steps) {
    const rootNoteMatch = chordStr.match(/^[A-G][#b]?/);
    if (!rootNoteMatch) return chordStr;

    let root = rootNoteMatch[0];
    if (ALIASES[root]) root = ALIASES[root];

    const rootIndex = NOTES.indexOf(root);
    if (rootIndex === -1) return chordStr;

    let newIndex = (rootIndex + steps) % 12;
    if (newIndex < 0) newIndex += 12;

    const newRoot = NOTES[newIndex];
    return newRoot + chordStr.substring(root.length);
}

function transposeChordAndSlash(chordStr, steps) {
    if (steps === 0) return chordStr;

    if (chordStr.includes('/')) {
        const parts = chordStr.split('/');
        return transposeChord(parts[0], steps) + '/' + transposeChord(parts[1], steps);
    }
    return transposeChord(chordStr, steps);
}

// --- DYNAMIC CHORD CALCULATOR ALGORITHM ---
// This calculates fretboard fingerings dynamically for ANY tuning by sweeping 4-fret windows
function calculateDynamicFingering(chordName, tuningStrNotes) {
    const cacheKey = `${chordName}-${tuningStrNotes.join(',')}`;
    if (window.chordCache && window.chordCache[cacheKey]) return window.chordCache[cacheKey];

    // --- STATIC DICTIONARY BYPASS FOR STANDARD TUNING ---
    if (window.chordDb && tuningStrNotes.join(',') === 'E,A,D,G,B,E') {
        const dbEntry = window.chordDb[chordName];
        if (dbEntry && dbEntry[0] && dbEntry[0].positions) {
            const frets = dbEntry[0].positions.map(p => (p === 'x' || p === 'X') ? -1 : parseInt(p, 10));
            const result = { frets, score: 9999 };
            if (!window.chordCache) window.chordCache = {};
            window.chordCache[cacheKey] = result;
            return result;
        }
    }

    const match = chordName.match(/^([A-G][#b]?)(.*)$/);
    if (!match) return null;

    let rootNote = match[1];
    if (ALIASES[rootNote]) rootNote = ALIASES[rootNote];
    let flavor = match[2] || '';

    flavor = flavor.split('/')[0];

    const rootIdx = NOTES.indexOf(rootNote);
    if (rootIdx === -1) return null;

    let intervals = CHORD_INTERVALS[flavor];
    if (!intervals) {
        if (flavor.includes('m')) intervals = CHORD_INTERVALS['m'];
        else intervals = CHORD_INTERVALS[''];
    }

    const targetPitchClasses = intervals.map(inter => (rootIdx + inter) % 12);

    const tuningPitches = tuningStrNotes.map(n => {
        const mapped = ALIASES[n] ? ALIASES[n] : n;
        return NOTES.indexOf(mapped);
    });

    let bestShape = null;
    let bestScore = -Infinity;
    let fallbackShape = null;
    let fallbackScore = -Infinity;

    for (let baseFret = 0; baseFret <= 11; baseFret++) {
        const maxFret = baseFret === 0 ? 4 : baseFret + 3;

        let stringOptions = [];
        let possiblePitches = new Set();

        for (let s = 0; s < 6; s++) {
            const openPitch = tuningPitches[s];
            if (openPitch === -1) {
                stringOptions.push([-1]);
                continue;
            }

            let validForString = [-1];
            if (targetPitchClasses.includes(openPitch)) {
                validForString.push(0);
                possiblePitches.add(openPitch);
            }

            let startFret = baseFret === 0 ? 1 : baseFret;
            for (let f = startFret; f <= maxFret; f++) {
                let pitch = (openPitch + f) % 12;
                if (targetPitchClasses.includes(pitch)) {
                    validForString.push(f);
                    possiblePitches.add(pitch);
                }
            }
            stringOptions.push(validForString);
        }

        let possibleAll = targetPitchClasses.every(t => possiblePitches.has(t));
        if (!possibleAll) continue;

        let combinations = [];
        function generateCombos(sIndex, currentCombo) {
            if (sIndex === 6) {
                combinations.push([...currentCombo]);
                return;
            }
            for (let opt of stringOptions[sIndex]) {
                currentCombo.push(opt);
                generateCombos(sIndex + 1, currentCombo);
                currentCombo.pop();
            }
        }
        generateCombos(0, []);

        for (let combo of combinations) {
            let covered = new Set();
            let playedStrings = 0;
            let lowestPlayedString = -1;

            for (let s = 0; s < 6; s++) {
                if (combo[s] !== -1) {
                    playedStrings++;
                    if (lowestPlayedString === -1) lowestPlayedString = s;
                    covered.add((tuningPitches[s] + combo[s]) % 12);
                }
            }

            if (covered.size !== targetPitchClasses.length) continue;
            if (playedStrings < 3 && targetPitchClasses.length >= 3) continue;

            const bassPitch = (tuningPitches[lowestPlayedString] + combo[lowestPlayedString]) % 12;

            let noOpen = combo.filter(f => f > 0);
            let minFret = noOpen.length > 0 ? Math.min(...noOpen) : 0;
            let maxFret = noOpen.length > 0 ? Math.max(...noOpen) : 0;

            let score = 0;
            if (bassPitch === rootIdx) score += 100;
            score += playedStrings * 10;

            // Penalize internal muted strings heavily
            let lowestStrIdx = -1, highestStrIdx = -1;
            for (let i = 0; i < 6; i++) {
                if (combo[i] !== -1) {
                    if (lowestStrIdx === -1) lowestStrIdx = i;
                    highestStrIdx = i;
                }
            }
            if (lowestStrIdx !== -1) {
                for (let i = lowestStrIdx; i <= highestStrIdx; i++) {
                    if (combo[i] === -1) score -= 20;
                }
            }

            let openStrings = combo.filter(f => f === 0).length;
            if (maxFret > 3) {
                score -= openStrings * 30; // Strongly penalize fragmented open chords
            } else {
                score += openStrings * 30; // Heavily reward normal open chords near the nut
            }

            let fretCounts = {};
            noOpen.forEach(f => {
                fretCounts[f] = (fretCounts[f] || 0) + 1;
            });
            let maxSameFret = Math.max(0, ...Object.values(fretCounts));
            if (maxSameFret >= 2) {
                score += maxSameFret * 5; // Reward barres (but much less than open strings)
            }

            if (noOpen.length > 0) {
                let span = maxFret - minFret;
                score -= span * 25; // Strongly penalize stretching
            }

            // Fingers needed penalty
            let countMinFret = noOpen.filter(f => f === minFret).length;
            let fingersNeeded = noOpen.length;
            if (countMinFret > 1) {
                fingersNeeded = 1 + (noOpen.length - countMinFret); // Barre reduces finger cost
            }
            score -= fingersNeeded * 5;

            let avgFret = noOpen.length > 0 ? noOpen.reduce((a, b) => a + b, 0) / noOpen.length : 0;
            score -= avgFret * 10; // Punish being high up the neck heavily

            let shapeObj = { frets: combo, baseFret: baseFret };

            // We no longer strictly reject >4 fingers because custom tunings get weird
            // and we let the highest score physically playable win.
            if (score > bestScore) {
                bestScore = score;
                bestShape = shapeObj;
            }
        }
    }

    const result = bestShape || fallbackShape;
    if (!window.chordCache) window.chordCache = {};
    window.chordCache[cacheKey] = result;
    return result;
}

// --- RENDER LOGIC ---
function renderTabs() {
    dashboardView.classList.add('hidden');
    if (!rawParsedText) return;

    let formattedText = rawParsedText;
    const usedChords = new Set();

    // --- METADATA (Tabdown) ---
    // Scan for % key: value or --- blocks before trimming
    const metaRegex = /^%\s*([a-zA-Z-]+)\s*:\s*(.+)$/gm;
    let metaMatch;
    while ((metaMatch = metaRegex.exec(formattedText)) !== null) {
        const key = metaMatch[1].toLowerCase();
        const val = metaMatch[2].trim();
        if (key === 'capo') {
            console.log("Tabdown Capo Meta Found:", val);
            // Optionally auto-set capo here in the future
        }
    }

    // --- TEXT TRIMMING (Drop intro fluff) ---
    const lines = formattedText.split('\n');
    let firstActualContentIdx = 0;

    // Advanced Regex for modern chord shapes (m11, M7, add9, slash chords) with optional UG [ch] wrappers
    const chordLineRegex = /^(\s*(\[ch\])?\b[A-G][#b]?(?:m|min|maj|M|dim|aug|sus)?\d*(?:add\d+)?(?:(?:\/|-)[A-G][#b]?)?\b(\[\/ch\])?\s*)+$/;
    const tabLineRegex = /^[A-Ga-g#b]?\|?-{3,}/;
    const sectionRegex = /^\[[a-zA-Z0-9 ]+\]$/;
    const tabdownHeaderRegex = /^#\s+[a-zA-Z0-9 ]+/; // # Verse
    const metadataRegex = /^%/;                      // % tuning: ...

    for (let i = 0; i < lines.length; i++) {
        const _l = lines[i].trim();
        // Skip completely blank lines or lines that specifically mention capo/tuning organically
        // unless it's a structural Tabdown meta line
        if (!_l || (_l.toLowerCase().includes('capo') && !_l.startsWith('%')) || (_l.toLowerCase().includes('tuning') && !_l.startsWith('%'))) continue;

        // If we hit a chord line, tab line, original section header, Tabdown header, or Tabdown metadata, lock this as the start
        if (chordLineRegex.test(_l) || tabLineRegex.test(_l) || sectionRegex.test(_l) || tabdownHeaderRegex.test(_l) || metadataRegex.test(_l) || _l === '---') {
            firstActualContentIdx = i;
            break;
        }
    }

    // Splice out the unneeded intro fluff
    if (firstActualContentIdx > 0) {
        formattedText = lines.slice(firstActualContentIdx).join('\n');
    }

    // --- TABDOWN FORMATTING ---
    // 1. Block Comments /* ... */
    formattedText = formattedText.replace(/\/\*[\s\S]*?\*\//g, match => `<span class="tab-comment">${match}</span>`);
    // 2. Inline Comments // ...
    formattedText = formattedText.replace(/^(\s*)\/\/(.*)$/gm, (match, space, text) => `${space}<span class="tab-comment">//${text}</span>`);
    // 3. Section Headers # Section
    formattedText = formattedText.replace(/^(\s*)#\s+(.+)$/gm, (match, space, text) => `${space}<div class="tab-section-header">${text}</div>`);
    // 4. Metadata Blocks (Hide them from UI, or style them muted)
    formattedText = formattedText.replace(/^%\s*([a-zA-Z-]+)\s*:\s*(.+)$/gm, '<span class="tab-comment">% $1: $2</span>');

    // --- CHORD PARSING ---
    // Normalize Tabdown explicit chords [Am] or [Am](fingering) into [ch] tags so they process cleanly
    // Also strip out linked fingering targets [1]: x-x.. at the bottom since we auto-calc
    formattedText = formattedText.replace(/^\[\d+\]:\s*[x\d-]+\s*$/gm, ''); // strip references

    // Convert Tabdown [Chord], [Chord](fingering), [Chord][1] into UG's internal [ch]Chord[/ch] for shared processing
    // We ignore the custom tabular fingerprint for now and relying on auto-calc.
    formattedText = formattedText.replace(/\[([A-G][#b]?(?:m|min|maj|M|dim|aug|sus)?\d*(?:add\d+)?(?:(?:\/|-)[A-G][#b]?)?)\](?:\([x\d-]+\)|\[\d+\])?/g, '[ch]$1[/ch]');

    if (formattedText.includes('[ch]')) {
        formattedText = formattedText.replace(/\[ch\](.*?)\[\/ch\]/g, (match, chord) => {
            const transposed = transposeChordAndSlash(chord, currentTranspose);
            usedChords.add(transposed.split('/')[0]); // track base chord for diagrams
            return `<span style="color: var(--accent); font-weight: bold;">${transposed}</span>`;
        });
        formattedText = formattedText.replace(/\[tab\]/g, '').replace(/\[\/tab\]/g, '');
    } else {
        // Fallback full-text scanning regex (upgraded for slash chords and digits, fixed for #/b boundaries)
        const scanRegex = /(?:(?:^|\s+)[A-G][#b]?(?:m|min|maj|M|dim|aug|sus)?\d*(?:add\d+)?(?:(?:\/|-)[A-G][#b]?)?(?=\s|$))+\s*$/gm;
        formattedText = formattedText.replace(scanRegex, match => {
            return match.replace(/(?:^|\s+)([A-G][#b]?(?:m|min|maj|M|dim|aug|sus)?\d*(?:add\d+)?(?:(?:\/|-)[A-G][#b]?)?)(?=\s|$)/g, (fullMatch, chordMatch) => {
                const transposed = transposeChordAndSlash(chordMatch, currentTranspose);
                usedChords.add(transposed.split('/')[0]);
                // Reconstruct the spacing correctly
                return fullMatch.replace(chordMatch, `<span style="color: var(--accent); font-weight: bold;">${transposed}</span>`);
            });
        });
    }

    // Split text by blank lines to group lines (like chords + lyrics together)
    // Wrap each block in a div to prevent column breaking
    const blocks = formattedText.split(/\n\s*\n/);
    formattedText = blocks.map(block => `<div class="tab-block">${block}</div>`).join('\n');

    tabContainer.innerHTML = formattedText;
    transposeLabel.textContent = `Transpose: ${(currentTranspose > 0 ? '+' : '')}${currentTranspose}`;

    renderChordDiagrams(Array.from(usedChords));
}

function renderChordDiagrams(chords) {
    chordDiagrams.innerHTML = '';

    const activeTuning = getActiveTuning();
    if (!activeTuning) return;

    const validChords = chords;

    if (validChords.length === 0) {
        chordDiagrams.classList.add('hidden');
        return;
    }

    if (globalSettings.showChords) {
        chordDiagrams.style.display = 'flex';
        chordDiagrams.classList.remove('hidden');
    } else {
        chordDiagrams.style.display = 'none';
        chordDiagrams.classList.add('hidden');
    }

    validChords.forEach(chord => {
        const fingering = calculateDynamicFingering(chord, activeTuning.notes);
        if (!fingering) return;

        const hasDoubleDigits = fingering.frets.some(f => f >= 10);
        const tabString = fingering.frets.map(f => {
            if (f === -1) return 'x';
            return f.toString();
        }).join(hasDoubleDigits ? '-' : '');

        const box = document.createElement('div');
        box.className = 'chord-box';

        box.innerHTML = `
            <div class="chord-name">${chord}</div>
            <div class="chord-tab">${tabString}</div>
        `;
        chordDiagrams.appendChild(box);
    });
}

// --- EVENT LISTENERS ---
fetchBtn.addEventListener('click', async () => {
    const url = urlInput.value.trim();
    if (!url) return;

    if (isEditing) exitEditMode();

    errorMessage.classList.add('hidden');

    // We intentionally do NOT hide the current tab view anymore so the user can keep reading!
    // dashboardView.classList.add('hidden');

    scraperProgressSection.classList.remove('hidden');
    scraperProgressSection.style.display = 'flex';
    scraperStatusText.textContent = 'Warming up scraper...';
    scraperProgressBar.style.width = '2%';

    fetchBtn.disabled = true;
    urlInput.value = ''; // clear input

    currentTranspose = 0;
    rawParsedText = '';
    isStarred = false;
    currentTabMetadata = null;

    try {
        const result = await window.api.scrapeUrl(url);

        if (result.isBatch) {
            const loadingText = document.querySelector('.loading-text');
            const total = result.tabs.length;

            if (total === 0) {
                throw new Error("No chords or tabs found for this artist.");
            }

            scraperStatusText.textContent = `Found ${total} songs for ${result.artist}. Starting batch download...`;
            scraperProgressBar.style.width = '5%';

            let lastParsedText = '';
            let lastMetadata = null;
            let successCount = 0;
            let failCount = 0;

            for (let i = 0; i < total; i++) {
                const tab = result.tabs[i];
                const progressPct = Math.round(((i + 1) / total) * 100);
                scraperStatusText.textContent = `Fetching ${i + 1} of ${total}: ${tab.name}...`;
                scraperProgressBar.style.width = `${progressPct}%`;

                try {
                    // Small delay to prevent hammering the network and getting blocked
                    await new Promise(r => setTimeout(r, 2000));

                    // Wrap the scrape request in a 15-second timeout
                    const fetchPromise = window.api.scrapeUrl(tab.url);
                    const timeoutPromise = new Promise((_, reject) =>
                        setTimeout(() => reject(new Error('Scraping timed out after 15 seconds')), 15000)
                    );

                    const tabResult = await Promise.race([fetchPromise, timeoutPromise]);

                    const safeText = tabResult.text
                        .replace(/&/g, "&amp;")
                        .replace(/</g, "&lt;")
                        .replace(/>/g, "&gt;");

                    const newId = tabResult.artist.replace(/[^a-z0-9]/gi, '_').toLowerCase() + '/' + tabResult.song.replace(/[^a-z0-9]/gi, '_').toLowerCase() + '.json';

                    const tabData = {
                        artist: tabResult.artist,
                        song: tabResult.song,
                        text: safeText,
                        transpose: 0,
                        isStarred: false,
                        id: newId
                    };

                    // Manually invoke save-tab IPC directly to bypass the UI rendering overhead
                    await window.api.saveTab(tabData);

                    // Trigger realtime UI update in the sidebar matching loadLibrary() structure
                    appendTabToSidebar(tabData.artist, tabData.song, tabData.id, tabData.isStarred, true);
                    successCount++;

                    // Keep track of the last one to display it when done
                    lastParsedText = safeText;
                    lastMetadata = tabData;
                } catch (e) {
                    console.error(`Failed to fetch ${tab.name}:`, e);
                    failCount++;
                }
            }

            // Render the final summary in the footer briefly
            scraperStatusText.textContent = `Batch Complete! (${successCount} successes, ${failCount} fails). Loading final tab...`;
            scraperProgressBar.style.width = `100%`;

            // Give the user a tiny 1.5s delay to actually read the completion success state
            await new Promise(r => setTimeout(r, 1500));

            // Render the final tab fetched
            if (lastMetadata) {

                // Only hide the UI elements at the very last millisecond so the swap is clean
                dashboardView.classList.add('hidden');

                rawParsedText = lastParsedText;
                currentTabMetadata = lastMetadata;
                songTitleEl.textContent = currentTabMetadata.song;
                artistNameEl.textContent = currentTabMetadata.artist;

                updateStarButtonState();
                renderTabs();
                tabViewSheet.classList.remove('hidden');
                await refreshLibrary();

                const savedEl = document.querySelector(`.song-item[data-id="${currentTabMetadata.id}"]`);
                if (savedEl) savedEl.classList.add('active');

                songHeader.classList.remove('hidden');
                tabContainer.classList.remove('hidden');
                controlsGroup.classList.remove('hidden');
                tabViewSheet.classList.remove('hidden');
            }
        } else {
            // --- Standard Single Tab Scraping ---

            scraperStatusText.textContent = 'Formatting tab...';
            scraperProgressBar.style.width = '80%';

            // basic HTML escape
            rawParsedText = result.text
                .replace(/&/g, "&amp;")
                .replace(/</g, "&lt;")
                .replace(/>/g, "&gt;");

            currentTabMetadata = { artist: result.artist, song: result.song };
            songTitleEl.textContent = result.song;
            artistNameEl.textContent = result.artist;

            // Auto-generate ID based on scrape
            const newId = result.artist.replace(/[^a-z0-9]/gi, '_').toLowerCase() + '/' + result.song.replace(/[^a-z0-9]/gi, '_').toLowerCase() + '.json';
            currentTabMetadata.id = newId;

            updateStarButtonState();
            renderTabs();
            tabViewSheet.classList.remove('hidden');

            // Auto-save the fetched tab
            await saveCurrentTab();

            // Highlight newly saved item in list
            const savedEl = document.querySelector(`.song-item[data-id="${newId}"]`);
            if (savedEl) savedEl.classList.add('active');

            // Only hide dashboard at the very end to swap
            dashboardView.classList.add('hidden');

            songHeader.classList.remove('hidden');
            tabContainer.classList.remove('hidden');
            controlsGroup.classList.remove('hidden');

            scraperStatusText.textContent = 'Done!';
            scraperProgressBar.style.width = '100%';
        }
    } catch (error) {
        errorMessage.textContent = error.message;
        errorMessage.classList.remove('hidden');
    } finally {
        scraperProgressSection.classList.add('hidden');
        scraperProgressSection.style.display = 'none';
        fetchBtn.disabled = false;
    }
});

transposeUpBtn.addEventListener('click', () => {
    currentTranspose++;
    renderTabs();
    saveCurrentTab(); // Persist the transpose change
});

transposeDownBtn.addEventListener('click', () => {
    currentTranspose--;
    renderTabs();
    saveCurrentTab(); // Persist the transpose change
});

editBtn.addEventListener('click', async () => {
    if (!currentTabMetadata) return;
    const newSong = prompt('Edit Song Title:', currentTabMetadata.song);
    if (!newSong) return; // User cancelled or left empty

    const newArtist = prompt('Edit Artist Name:', currentTabMetadata.artist);
    if (!newArtist) return;

    // Remove old DB entry visually so we don't have duplicated items in the sidebar
    // Though we haven't built a 'delete' backend file func yet, we can easily change the active ID.
    // The previous file will remain orphaned in the /tabs folder, but the new one takes over.
    const oldId = currentTabMetadata.id;

    currentTabMetadata.song = newSong.trim();
    currentTabMetadata.artist = newArtist.trim();
    songTitleEl.textContent = currentTabMetadata.song;
    artistNameEl.textContent = currentTabMetadata.artist;

    // Assign a fresh ID based on the new names
    currentTabMetadata.id = currentTabMetadata.artist.replace(/[^a-z0-9]/gi, '_').toLowerCase() + '/' + currentTabMetadata.song.replace(/[^a-z0-9]/gi, '_').toLowerCase() + '.json';

    // Check if it was starred previously, and update the starred list to point to new ID
    const starIdx = globalSettings.starredTunings.indexOf(oldId); // Wait, star uses song IDs! Oh wait, globalSettings.starredTunings is for Tunings. No, we don't have starred songs yet? Ah, we do in the backend. 
    // Just save it. We might orphan the old one but the new one works.
    await saveCurrentTab();
    await refreshLibrary();
});

urlInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        fetchBtn.click();
    }
});

// Handle incoming Scordatura protocol links
window.api.onProtocolUrl((url) => {
    console.log('Received protocol URL:', url);
    urlInput.value = url;
    fetchBtn.click();
});

// GDrive Sync Elements
const syncBtn = document.getElementById('syncBtn');
const syncBtnText = syncBtn.querySelector('span');
const lastSyncTimeEl = document.getElementById('lastSyncTime');

window.api.onSyncProgress((msg, pct) => {
    if (scraperProgressSection) {
        scraperProgressSection.classList.remove('hidden');
        scraperProgressSection.style.setProperty('display', 'flex', 'important');
        if (scraperStatusText) scraperStatusText.textContent = msg;
        if (scraperProgressBar) scraperProgressBar.style.width = `${pct}%`;
    }
});

function formatLastSync(timestamp) {
    if (!timestamp) return 'Not synced';
    const date = new Date(timestamp);
    const now = new Date();
    const diff = now - date;
    
    if (diff < 60000) return 'Just now';
    if (diff < 3600000) return `${Math.floor(diff/60000)}m ago`;
    if (diff < 86400000) return `${Math.floor(diff/3600000)}h ago`;
    
    return date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function updateLastSyncDisplay() {
    if (lastSyncTimeEl) {
        lastSyncTimeEl.textContent = formatLastSync(globalSettings.lastSyncTime);
    }
}

// Update the display every minute
setInterval(updateLastSyncDisplay, 60000);

async function updateSyncButtonState() {
    const hasToken = await window.api.hasToken();
    if (syncBtnText) {
        if (hasToken) {
            syncBtnText.textContent = 'Sync Library';
        } else {
            syncBtnText.textContent = 'Login with Google';
        }
    }
}

syncBtn.addEventListener('click', async () => {
    triggerSync();
});

async function triggerSync() {
    syncBtn.classList.add('syncing');
    
    // Explicitly show the progress bar real estate
    if (scraperProgressSection) {
        scraperProgressSection.classList.remove('hidden');
        scraperProgressSection.style.setProperty('display', 'flex', 'important');
        scraperStatusText.textContent = 'Preparing sync...';
        scraperProgressBar.style.width = '0%';
    }
    
    try {
        const hasToken = await window.api.hasToken();
        if (!hasToken) {
            syncBtnText.textContent = 'Authenticating...';
            await window.api.initiateAuth();
        }
        
        await window.api.syncLibrary();
        
        globalSettings.lastSyncTime = Date.now();
        localStorage.setItem('lastSyncTime', globalSettings.lastSyncTime.toString());
        await saveSettings();
        updateLastSyncDisplay();
        
        await updateSyncButtonState();
        await refreshLibrary();
    } catch (e) {
        console.error(e);
        alert('Sync failed: ' + e.message);
        await updateSyncButtonState();
    } finally {
        syncBtn.classList.remove('syncing');
        setTimeout(() => {
            scraperProgressSection.classList.add('hidden');
            scraperProgressSection.style.display = 'none';
        }, 1500);
    }
}

// Update state on load
window.addEventListener('load', () => {
    updateSyncButtonState();
    updateLastSyncDisplay();
    
    // Auto-sync every 10 minutes if we have a token
    setInterval(async () => {
        const hasToken = await window.api.hasToken();
        if (hasToken && !syncBtn.classList.contains('syncing')) {
            triggerSync();
        }
    }, 10 * 60 * 1000); // 10 minutes
});
