const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('electronAPI', {
  openConfigure: () => ipcRenderer.invoke('open-configure'),
  openConfigureLan: () => ipcRenderer.invoke('open-configure-lan'),
  openProwlarr: () => ipcRenderer.invoke('open-prowlarr'),
  openQbit: () => ipcRenderer.invoke('open-qbit'),
  getLocalInstallUrl: () => ipcRenderer.invoke('get-local-install-url'),
  getLocalInstallUrls: () => ipcRenderer.invoke('get-local-install-urls'),
  getLocalStremioStatus: () => ipcRenderer.invoke('get-local-stremio-status'),
  copyLocalInstallUrl: () => ipcRenderer.invoke('copy-local-install-url'),
  getRecentLogs: (limit) => ipcRenderer.invoke('get-recent-logs', limit),
  copyRuntimeLog: () => ipcRenderer.invoke('copy-runtime-log'),
  getDownloadPath: () => ipcRenderer.invoke('get-download-path'),
  setDownloadPath: (savePath) => ipcRenderer.invoke('set-download-path', savePath),
  saveQbitSettings: (payload) => ipcRenderer.invoke('save-qbit-settings', payload),
  openDownloadFolder: (folderPath) => ipcRenderer.invoke('open-download-folder', folderPath),
  fitPopupWindow: (size) => ipcRenderer.send('fit-popup-window', size),
  minimizeWindow: () => ipcRenderer.invoke('minimize-app'),
  hideToTray: () => ipcRenderer.invoke('hide-to-tray'),
  quit: () => ipcRenderer.invoke('quit-app')
})
