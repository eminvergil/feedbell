const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('toast', {
  i18n: ipcRenderer.sendSync('i18n-sync'),
  onShow: (fn) => ipcRenderer.on('toast', (_e, payload) => fn(payload)),
  size: (h) => ipcRenderer.send('toast-size', h),
  empty: () => ipcRenderer.send('toast-empty'),
  action: (a) => ipcRenderer.send('toast-action', a),
  rendered: () => ipcRenderer.send('toast-rendered'),
});
