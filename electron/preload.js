const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('electronAPI', {
  openConfigure: () => ipcRenderer.invoke('open-configure'),
  openProwlarr: () => ipcRenderer.invoke('open-prowlarr'),
  openQbit: () => ipcRenderer.invoke('open-qbit'),
  getLocalInstallUrl: () => ipcRenderer.invoke('get-local-install-url'),
  copyLocalInstallUrl: () => ipcRenderer.invoke('copy-local-install-url'),
  getDownloadPath: () => ipcRenderer.invoke('get-download-path'),
  setDownloadPath: (savePath) => ipcRenderer.invoke('set-download-path', savePath),
  openDownloadFolder: (folderPath) => ipcRenderer.invoke('open-download-folder', folderPath),
  quit: () => ipcRenderer.invoke('quit-app')
})
