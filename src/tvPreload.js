const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('tvApi', {
  powerOff: () => ipcRenderer.send('tv-power-off'),
  onPowerOff: (cb) => ipcRenderer.on('tv-power-off', () => cb()),
  onPowerOn: (cb) => ipcRenderer.on('tv-power-on', () => cb()),
  onSide: (cb) => ipcRenderer.on('tv-side', (_e, side) => cb(side)),
  onSignIn: (cb) => ipcRenderer.on('tv-sign-in', () => cb()),
});
