const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
    scrapeUrl: (url) => ipcRenderer.invoke('scrape-url', url),
    saveTab: (data) => ipcRenderer.invoke('save-tab', data),
    getLibrary: () => ipcRenderer.invoke('get-library'),
    loadTab: (id) => ipcRenderer.invoke('load-tab', id),
    deleteTab: (id) => ipcRenderer.invoke('delete-tab', id),
    deleteArtist: (artistFolderId) => ipcRenderer.invoke('delete-artist', artistFolderId),
    getSettings: () => ipcRenderer.invoke('get-settings'),
    saveSettings: (settings) => ipcRenderer.invoke('save-settings', settings),
    getChordDb: () => ipcRenderer.invoke('get-chord-db'),
    minimizeApp: () => ipcRenderer.invoke('minimize-app'),
    maximizeApp: () => ipcRenderer.invoke('maximize-app'),
    closeApp: () => ipcRenderer.invoke('close-app'),
    updateTabMeta: (data) => ipcRenderer.invoke('update-tab-meta', data)
});
