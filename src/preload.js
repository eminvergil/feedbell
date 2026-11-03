const { contextBridge, ipcRenderer } = require('electron');

const invoke = (ch) => (arg) => ipcRenderer.invoke(ch, arg);

contextBridge.exposeInMainWorld('feedbell', {
  // Seçili dilin sözlüğü: { lang, dict, fallback, languages, systemLanguage }
  i18n: ipcRenderer.sendSync('i18n-sync'),
  info: invoke('info'),
  state: invoke('state'),
  query: invoke('query'),
  item: invoke('item'),
  setRead: invoke('set-read'),
  setStarred: invoke('set-starred'),
  markAllRead: invoke('mark-all-read'),
  addFeed: invoke('add-feed'),
  updateFeed: invoke('update-feed'),
  removeFeed: invoke('remove-feed'),
  refresh: invoke('refresh'),
  notifications: invoke('notifications'),
  notificationsSeen: invoke('notifications-seen'),
  clearNotifications: invoke('clear-notifications'),
  saveSettings: invoke('save-settings'),
  snooze: invoke('snooze'),
  testNotification: invoke('test-notification'),
  importOpml: invoke('import-opml'),
  exportOpml: invoke('export-opml'),
  openExternal: invoke('open-external'),
  openData: invoke('open-data'),
  // Menü çubuğu paneli
  openApp: invoke('open-app'),
  panelHide: invoke('panel-hide'),
  showPanel: invoke('show-panel'),
  panelMenu: invoke('panel-menu'),
  quit: invoke('quit'),
  removeNotification: invoke('remove-notification'),
  notificationRead: invoke('notification-read'),
  panelRendered: () => ipcRenderer.send('panel-rendered'),
  ready: () => ipcRenderer.send('ready'),
  rendered: () => ipcRenderer.send('rendered'),
  on: (channel, fn) => {
    if (!['state', 'items-changed', 'progress', 'notifications-changed', 'navigate', 'panel-shown'].includes(channel)) return;
    ipcRenderer.on(channel, (_e, payload) => fn(payload));
  },
});
