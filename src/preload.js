const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('widget', {
  getState: () => ipcRenderer.invoke('get-state'),
  saveSettings: (patch) => ipcRenderer.invoke('save-settings', patch),
  addGoon: (g) => ipcRenderer.invoke('add-goon', g),
  updateGoon: (id, patch) => ipcRenderer.invoke('update-goon', id, patch),
  removeGoon: (id) => ipcRenderer.invoke('remove-goon', id),
  hideGoon: (id) => ipcRenderer.invoke('hide-goon', id),
  unhideGoons: () => ipcRenderer.invoke('unhide-goons'),
  refreshGoons: () => ipcRenderer.invoke('refresh-goons'),
  dismissGoonNews: () => ipcRenderer.invoke('dismiss-goon-news'),
  suggestGoon: (kind, g) => ipcRenderer.invoke('suggest-goon', kind, g),
  checkUpdate: () => ipcRenderer.invoke('check-update'),
  installUpdate: () => ipcRenderer.invoke('install-update'),
  open: (url) => ipcRenderer.invoke('open-url', url),
  checkNow: () => ipcRenderer.invoke('check-now'),
  testNotification: () => ipcRenderer.invoke('test-notification'),
  setTrayImage: (dataUrl) => ipcRenderer.send('tray-image', dataUrl),
  onState: (cb) => ipcRenderer.on('state', (_e, s) => cb(s)),
  onAlarm: (cb) => ipcRenderer.on('alarm', () => cb()),
});
