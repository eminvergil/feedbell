// Uygulama menüsü (macOS'ta ekranın üstündeki menü, Windows'ta pencerenin menüsü) ve Dock menüsü.
// Menüler yalnızca komut adı üretir; komutları ana süreç `run(name)` ile yürütür. t: seçili dilin çeviri işlevi.
const { Menu } = require('electron');

const THEMES = ['ember', 'ocean', 'forest', 'lavender', 'sepia', 'graphite'];

function notifyItems({ delivery, snoozeText, run, t }) {
  if (delivery.reason === 'off') return [{ label: t('tray.notifyOn'), click: () => run('notify-on') }];
  if (delivery.reason === 'snoozed') return [{ label: t('tray.unsnooze', { until: snoozeText }), click: () => run('snooze:0') }];
  return [
    {
      label: t('tray.snooze'),
      submenu: [
        { label: t('snooze.hour1'), click: () => run('snooze:60') },
        { label: t('snooze.hour4'), click: () => run('snooze:240') },
        { label: t('snooze.morning'), click: () => run('snooze:morning') },
        { label: t('snooze.forever'), click: () => run('snooze:-1') },
      ],
    },
  ];
}

function buildAppMenu({ isMac, dev, delivery, snoozeText, run, t, settings }) {
  const tpl = [];
  if (isMac) {
    tpl.push({
      label: 'Feedbell',
      submenu: [
        { label: t('menu.about'), role: 'about' },
        { type: 'separator' },
        { label: t('menu.settings'), accelerator: 'Cmd+,', click: () => run('view:settings') },
        { type: 'separator' },
        { label: t('menu.services'), role: 'services' },
        { type: 'separator' },
        { label: t('menu.hide'), role: 'hide' },
        { label: t('menu.hideOthers'), role: 'hideOthers' },
        { label: t('menu.unhide'), role: 'unhide' },
        { type: 'separator' },
        { label: t('menu.quit'), accelerator: 'Cmd+Q', click: () => run('quit') },
      ],
    });
  }
  tpl.push({
    label: t('menu.file'),
    submenu: [
      { label: t('menu.addFeed'), accelerator: 'CmdOrCtrl+N', click: () => run('add') },
      { label: t('menu.refreshAll'), accelerator: 'CmdOrCtrl+R', click: () => run('refresh') },
      { type: 'separator' },
      { label: t('menu.importOpml'), click: () => run('import') },
      { label: t('menu.exportOpml'), click: () => run('export') },
      { type: 'separator' },
      ...(isMac
        ? [{ label: t('menu.closeWindow'), role: 'close' }]
        : [
            { label: t('common.settings'), accelerator: 'Ctrl+,', click: () => run('view:settings') },
            { type: 'separator' },
            { label: t('menu.exit'), accelerator: 'Ctrl+Q', click: () => run('quit') },
          ]),
    ],
  });
  tpl.push({
    label: t('menu.edit'),
    submenu: [
      { label: t('menu.undo'), role: 'undo' },
      { label: t('menu.redo'), role: 'redo' },
      { type: 'separator' },
      { label: t('menu.cut'), role: 'cut' },
      { label: t('menu.copy'), role: 'copy' },
      { label: t('menu.paste'), role: 'paste' },
      { label: t('menu.selectAll'), role: 'selectAll' },
      { type: 'separator' },
      { label: t('menu.find'), accelerator: 'CmdOrCtrl+F', click: () => run('find') },
    ],
  });
  const radio = (label, checked, cmd) => ({ label, type: 'radio', checked, click: () => run(cmd) });
  tpl.push({
    label: t('menu.view'),
    submenu: [
      { label: t('menu.all'), accelerator: 'CmdOrCtrl+1', click: () => run('scope:all') },
      { label: t('menu.unread'), accelerator: 'CmdOrCtrl+2', click: () => run('scope:unread') },
      { label: t('menu.starred'), accelerator: 'CmdOrCtrl+3', click: () => run('scope:starred') },
      { label: t('menu.history'), accelerator: 'CmdOrCtrl+4', click: () => run('view:notifications') },
      { type: 'separator' },
      { label: t('menu.markAll'), accelerator: 'Shift+CmdOrCtrl+A', click: () => run('mark-all-read') },
      { type: 'separator' },
      { label: t('menu.theme'), submenu: THEMES.map((id) => radio(t(`themes.${id}`), settings.colorTheme === id, `set:colorTheme:${id}`)) },
      {
        label: t('menu.mode'),
        submenu: [
          radio(t('settings.modeSystem'), settings.theme === 'system', 'set:theme:system'),
          radio(t('settings.modeLight'), settings.theme === 'light', 'set:theme:light'),
          radio(t('settings.modeDark'), settings.theme === 'dark', 'set:theme:dark'),
        ],
      },
      { type: 'separator' },
      { label: t('menu.zoomIn'), role: 'zoomIn' },
      { label: t('menu.zoomOut'), role: 'zoomOut' },
      { label: t('menu.resetZoom'), role: 'resetZoom' },
      { type: 'separator' },
      { label: t('menu.fullscreen'), role: 'togglefullscreen' },
      ...(dev ? [{ type: 'separator' }, { label: t('menu.devtools'), role: 'toggleDevTools' }] : []),
    ],
  });
  tpl.push({
    label: t('menu.notifications'),
    submenu: [
      { label: t('menu.openPanel'), click: () => run('panel') },
      { label: t('menu.history'), click: () => run('view:notifications') },
      { type: 'separator' },
      ...notifyItems({ delivery, snoozeText, run, t }),
      { label: t('menu.test'), click: () => run('test') },
      { type: 'separator' },
      { label: t('menu.notificationSettings'), click: () => run('view:settings') },
    ],
  });
  if (isMac) {
    tpl.push({
      label: t('menu.window'),
      role: 'window',
      submenu: [
        { label: t('menu.minimize'), role: 'minimize' },
        { label: t('menu.zoom'), role: 'zoom' },
        { type: 'separator' },
        { label: t('menu.front'), role: 'front' },
      ],
    });
  }
  tpl.push({
    label: t('menu.help'),
    role: 'help',
    submenu: [
      { label: t('menu.shortcuts'), click: () => run('view:settings') },
      { label: t('menu.dataFolder'), click: () => run('open-data') },
    ],
  });
  return Menu.buildFromTemplate(tpl);
}

function buildDockMenu({ delivery, snoozeText, unread, run, t }) {
  return Menu.buildFromTemplate([
    { label: unread ? t('tray.unread', { count: unread }) : t('tray.noUnread'), enabled: false },
    { label: t('common.refreshNow'), click: () => run('refresh') },
    { label: t('tray.history'), click: () => run('view:notifications') },
    { type: 'separator' },
    ...notifyItems({ delivery, snoozeText, run, t }),
  ]);
}

module.exports = { buildAppMenu, buildDockMenu, notifyItems, THEMES };
