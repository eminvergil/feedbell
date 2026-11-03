const {
  app,
  BrowserWindow,
  Menu,
  Notification,
  ipcMain,
  nativeImage,
  nativeTheme,
  powerMonitor,
  screen,
  shell,
  dialog,
  net,
} = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { Store, displayName, byDate } = require('./store');
const { Poller } = require('./poller');
const { resolveFeed, normalizeUrl, urlKey } = require('./fetcher');
const { buildEntries, deliveryState, systemMessages, nextMorning, snoozeLabel, clockText } = require('./notifier');
const { buildOpml, parseOpml } = require('./opml');
const { seedDemo, DemoPoller } = require('./demo');
const { languages, resolveLanguage, loadLanguage, createI18n } = require('./i18n-main');
const { errorText } = require('./errors');
const { MenuBar } = require('./menubar');
const { buildAppMenu, buildDockMenu, notifyItems } = require('./app-menu');

const args = process.argv.slice(1);
const flag = (name) => {
  const a = args.find((x) => x === `--${name}` || x.startsWith(`--${name}=`));
  if (!a) return null;
  return a.includes('=') ? a.slice(a.indexOf('=') + 1) : true;
};
const DEMO = !!flag('demo');
const CAPTURE = flag('capture'); // geliştirme: ana pencerenin görüntüsünü kaydedip çık
const CAPTURE_TOAST = flag('capture-toast'); // geliştirme: deneme popup'ının görüntüsünü kaydedip çık
const CAPTURE_PANEL = flag('capture-panel'); // geliştirme: menü çubuğu panelinin görüntüsünü kaydedip çık
const CAPTURING = !!(CAPTURE || CAPTURE_TOAST || CAPTURE_PANEL);
const START_VIEW = flag('view') || '';
// Tanıtım/ekran görüntüsü için görünüm seçenekleri: --lang=en --color-theme=ocean --mode=dark
const DEMO_LOOK = { language: flag('lang'), colorTheme: flag('color-theme'), theme: flag('mode') };
const isMac = process.platform === 'darwin';
const ASSETS = path.join(__dirname, 'assets');
const TOAST_W = 392;

// Paketli sürüm ile geliştirme sürümü aynı veri klasörünü kullansın.
// Tanıtım modu ve FEEDBELL_DATA ile yapılan denemeler gerçek kurulumun profiline (localStorage, tek örnek kilidi) dokunmaz.
app.setName('Feedbell');
app.setPath(
  'userData',
  DEMO ? path.join(os.tmpdir(), 'feedbell-demo-profile') : process.env.FEEDBELL_DATA ? path.join(process.env.FEEDBELL_DATA, 'profile') : path.join(app.getPath('appData'), 'Feedbell')
);

if (process.platform === 'win32') app.setAppUserModelId(app.isPackaged ? 'com.feedbell.desktop' : process.execPath);

if (!CAPTURING && !app.requestSingleInstanceLock()) {
  app.quit();
  process.exit(0);
}
app.on('second-instance', () => showWindow());

let store;
let poller;
let win = null;
let menubar = null;
let toastWin = null;
let toastReady = false;
let toastDisplay = null;
let toastQueue = [];
let rendererReady = false;
let pendingNav = null;
let quitting = false;
let i18nData = null;
let t = (k) => k;
const liveNotifications = new Set();

const fetchImpl = (url, opts) => net.fetch(url, opts);

// --- Dil ---------------------------------------------------------------------------------

function applyLanguage() {
  const preferred = app.getPreferredSystemLanguages?.() || [app.getLocale()];
  const lang = resolveLanguage(store.settings.language, preferred);
  i18nData = { ...loadLanguage(lang), languages: languages(), systemLanguage: resolveLanguage('system', preferred) };
  t = createI18n(i18nData).t;
}

// Dil değişince pencereler yeni sözlükle yeniden yüklenir.
function reloadWindows() {
  appMenuKey = '';
  updateMenus();
  if (win && !win.isDestroyed()) {
    rendererReady = false;
    pendingNav = { view: 'settings' };
    win.webContents.reload();
  }
  if (menubar?.panel && !menubar.panel.isDestroyed()) menubar.panel.webContents.reload();
  if (toastWin && !toastWin.isDestroyed()) toastWin.destroy();
  app.setAboutPanelOptions({ applicationName: 'Feedbell', applicationVersion: app.getVersion(), version: '', credits: t('system.aboutCredits') });
}

function dataDir() {
  if (process.env.FEEDBELL_DATA) return process.env.FEEDBELL_DATA;
  if (DEMO) return path.join(os.tmpdir(), 'feedbell-demo');
  return path.join(app.getPath('userData'), 'data');
}

// Uygulamanın önceki adı Akış'tı. Eski veri klasörü varsa ve Feedbell'de henüz abonelik yoksa
// bir kopyası alınır; eski klasör yedek olarak yerinde kalır.
function migrateFromAkis() {
  if (DEMO || process.env.FEEDBELL_DATA) return false;
  const target = dataDir();
  const old = path.join(app.getPath('appData'), 'Ak\u0131\u015f', 'data');
  try {
    if (fs.existsSync(path.join(target, 'feeds.json')) || !fs.existsSync(path.join(old, 'feeds.json'))) return false;
    fs.mkdirSync(target, { recursive: true });
    fs.cpSync(old, target, { recursive: true, force: false, errorOnExist: false });
    console.log(`[migrate] ${old} → ${target}`);
    return true;
  } catch (e) {
    console.error('[migrate] eski veriler kopyalanamadı:', e.message);
    return false;
  }
}

// Ana pencereye ve menü çubuğu paneline birlikte gönderilir.
function send(channel, payload) {
  sendMain(channel, payload);
  menubar?.send(channel, payload);
}

function sendMain(channel, payload) {
  if (win && !win.isDestroyed()) win.webContents.send(channel, payload);
}

// --- Durum ---------------------------------------------------------------------------

function statePayload() {
  return {
    feeds: store.feeds,
    counts: store.counts(),
    folders: store.folders(),
    settings: store.settings,
    refresh: poller.status(),
    delivery: { ...deliveryState(store.settings), snoozeLabel: snoozeLabel(store.settings, Date.now(), t) },
  };
}

let changedTimer = null;
function changed({ items = false } = {}) {
  if (items) send('items-changed');
  if (changedTimer) return;
  changedTimer = setTimeout(() => {
    changedTimer = null;
    send('state', statePayload());
    updateMenus();
  }, 120);
}

// --- Ana pencere ---------------------------------------------------------------------------

function createWindow() {
  rendererReady = false;
  win = new BrowserWindow({
    width: 1320,
    height: 860,
    minWidth: 980,
    minHeight: 600,
    show: false,
    title: 'Feedbell',
    icon: path.join(ASSETS, 'icon.png'),
    titleBarStyle: isMac ? 'hiddenInset' : 'default',
    trafficLightPosition: { x: 16, y: 18 },
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#0f0f0e' : '#f3f2ee',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      backgroundThrottling: !CAPTURE,
    },
  });
  win.loadFile(path.join(__dirname, 'renderer', 'index.html'), { hash: START_VIEW });
  if (CAPTURE) win.webContents.on('console-message', (e) => console.log(`[renderer:${e.level}] ${e.message}`));
  win.once('ready-to-show', () => {
    const hidden = CAPTURE || flag('hidden') || app.getLoginItemSettings().wasOpenedAtLogin;
    if (!hidden) showWindow();
  });
  win.on('close', (e) => {
    if (quitting || CAPTURE) return;
    // Pencereyi kapatmak takibi durdurmaz; uygulama menü çubuğunda / sistem tepsisinde çalışmaya devam eder.
    e.preventDefault();
    win.hide();
    if (isMac) app.setActivationPolicy('accessory');
    if (!store.settings.closeHintShown) {
      store.saveSettings({ closeHintShown: true });
      showToast([
        {
          kind: 'info',
          id: 'hint',
          title: t('system.closeHintTitle'),
          body: t(isMac ? 'system.closeHintMac' : 'system.closeHintWin'),
        },
      ]);
    }
  });
  win.on('closed', () => {
    win = null;
    rendererReady = false;
  });
  win.webContents.setWindowOpenHandler(({ url }) => {
    openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (e, url) => {
    if (url.startsWith('file:')) return;
    e.preventDefault();
    openExternal(url);
  });
}

function showWindow(nav) {
  if (!win || win.isDestroyed()) createWindow();
  if (isMac) app.setActivationPolicy('regular');
  if (nav) {
    if (rendererReady) sendMain('navigate', nav);
    else pendingNav = nav;
  }
  if (win.isMinimized()) win.restore();
  win.show();
  win.focus();
  if (isMac) app.focus({ steal: true });
}

function openItem(id) {
  if (id) showWindow({ item: id });
  else showWindow();
}

function openExternal(url) {
  if (/^(https?|mailto):/i.test(url || '')) shell.openExternal(url);
}

// --- Popup bildirimleri -------------------------------------------------------------------

function ensureToast() {
  if (toastWin && !toastWin.isDestroyed()) return toastWin;
  toastReady = false;
  toastWin = new BrowserWindow({
    width: TOAST_W,
    height: 10,
    show: false,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    focusable: false,
    hasShadow: false,
    acceptFirstMouse: true,
    webPreferences: {
      preload: path.join(__dirname, 'toast', 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      backgroundThrottling: false,
      autoplayPolicy: 'no-user-gesture-required',
    },
  });
  toastWin.setAlwaysOnTop(true, 'screen-saver');
  if (isMac) toastWin.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true, skipTransformProcessType: true });
  toastWin.loadFile(path.join(__dirname, 'toast', 'toast.html'));
  toastWin.webContents.once('did-finish-load', () => {
    toastReady = true;
    flushToast();
  });
  toastWin.on('closed', () => {
    toastWin = null;
    toastReady = false;
  });
  return toastWin;
}

function toastCards(entries) {
  return entries.map((e) => {
    if (e.kind === 'info' || e.kind === 'more') return e;
    const feed = store.feed(e.feedId);
    return {
      kind: 'entry',
      id: e.id,
      feedId: e.feedId,
      feedTitle: e.feedTitle,
      icon: feed?.icon || '',
      count: e.count,
      ts: e.ts,
      items: e.items.slice(0, 3).map((x) => {
        const it = store.item(x.id);
        return { id: x.id, title: x.title, link: x.link, summary: (it?.summary || '').slice(0, 180), image: it?.image || '' };
      }),
    };
  });
}

function showToast(entries) {
  let list = entries;
  if (entries.length > 4) {
    const rest = entries.slice(3);
    list = [
      ...entries.slice(0, 3),
      { kind: 'more', id: `more-${Date.now()}`, count: rest.reduce((s, e) => s + (e.count || 0), 0), feeds: rest.length },
    ];
  }
  toastQueue.push(...toastCards(list));
  ensureToast();
  if (toastReady) flushToast();
}

function flushToast() {
  if (!toastQueue.length || !toastWin) return;
  const cards = toastQueue.splice(0);
  toastWin.webContents.send('toast', {
    cards,
    seconds: +store.settings.popupSeconds || 0,
    sound: !!store.settings.sound && cards.some((c) => c.kind !== 'info'),
    theme: store.settings.colorTheme,
    position: store.settings.popupPosition,
  });
}

function toastBounds(h) {
  if (!toastDisplay) toastDisplay = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
  const wa = toastDisplay.workArea;
  const pos = store.settings.popupPosition || 'top-right';
  const height = Math.max(1, Math.min(Math.ceil(h), wa.height - 16));
  const x = pos.endsWith('left') ? wa.x + 8 : wa.x + wa.width - TOAST_W - 8;
  const y = pos.startsWith('bottom') ? wa.y + wa.height - height - 8 : wa.y + 8;
  return { x: Math.round(x), y: Math.round(y), width: TOAST_W, height };
}

// --- Sistem bildirimleri -------------------------------------------------------------------

function iconImage(dataUrl) {
  if (!/^data:image\/(png|jpeg);/i.test(dataUrl || '')) return undefined;
  const img = nativeImage.createFromDataURL(dataUrl);
  return img.isEmpty() ? undefined : img;
}

function systemNotify(entries) {
  if (!Notification.isSupported()) return;
  for (const m of systemMessages(entries, t)) {
    const feed = m.feedId ? store.feed(m.feedId) : null;
    const n = new Notification({
      title: m.title,
      body: m.body,
      silent: !store.settings.sound,
      icon: isMac ? undefined : iconImage(feed?.icon) || path.join(ASSETS, 'icon.png'),
    });
    liveNotifications.add(n);
    n.on('click', () => {
      store.markNotificationsSeen(m.entryIds);
      changed();
      showWindow(m.target);
    });
    n.on('close', () => liveNotifications.delete(n));
    n.show();
    setTimeout(() => liveNotifications.delete(n), 10 * 60e3);
  }
}

function present(entries, style = store.settings.notifyStyle) {
  if (CAPTURE) return;
  if (style === 'popup' || style === 'both') showToast(entries);
  if (style === 'system' || style === 'both') systemNotify(entries);
}

function onNewItems(results) {
  const now = Date.now();
  const entries = buildEntries(results, now);
  if (!entries.length) return;
  const st = deliveryState(store.settings, now);
  for (const e of entries) e.silent = st.reason;
  store.addNotifications(entries);
  send('notifications-changed');
  if (st.on) present(entries);
}

function testNotification() {
  const latest = [...store.items.values()].sort(byDate)[0];
  const feed = latest && store.feed(latest.feedId);
  const entry = latest
    ? { id: `test-${Date.now()}`, ts: Date.now(), feedId: feed.id, feedTitle: displayName(feed), count: 1, items: [{ id: latest.id, title: latest.title, link: latest.link }] }
    : { kind: 'info', id: `test-${Date.now()}`, title: t('system.testTitle'), body: t('system.testBody') };
  const style = store.settings.notifyStyle === 'off' ? 'popup' : store.settings.notifyStyle;
  if (entry.kind === 'info') {
    if (style !== 'system') showToast([entry]);
    if (style !== 'popup' && Notification.isSupported()) new Notification({ title: entry.title, body: entry.body }).show();
  } else present([entry], style);
  return style;
}

// --- Menü çubuğu, Dock ve uygulama menüsü --------------------------------------------------------

function cut(s, n) {
  const t = String(s || '').replace(/\s+/g, ' ').trim();
  return t.length > n ? `${t.slice(0, n - 1)}…` : t;
}

function setSnooze(v) {
  const now = Date.now();
  let until = 0;
  if (v === -1) until = -1;
  else if (v === 'morning') until = nextMorning(now);
  else if (+v > 0) until = now + +v * 60e3;
  store.saveSettings({ snoozeUntil: until });
  changed();
}

// Menülerden gelen komutlar. Arayüzle ilgili olanlar pencereye iletilir.
function runCommand(cmd) {
  const i = cmd.indexOf(':');
  const name = i < 0 ? cmd : cmd.slice(0, i);
  const arg = i < 0 ? '' : cmd.slice(i + 1);
  if (name === 'quit') return quit();
  if (name === 'refresh') return store.feeds.length ? poller.refresh() : showWindow({ command: 'add' });
  if (name === 'snooze') return setSnooze(arg === 'morning' ? 'morning' : +arg);
  if (name === 'notify-on') {
    store.saveSettings({ notifyStyle: store.settings.notifyStyle === 'off' ? 'popup' : store.settings.notifyStyle, snoozeUntil: 0 });
    return changed();
  }
  if (name === 'test') return testNotification();
  if (name === 'panel') return menubar?.show();
  if (name === 'open-data') return shell.openPath(dataDir());
  if (name === 'set') {
    // set:colorTheme:ocean, set:theme:dark (uygulama menüsünden görünüm değişikliği)
    const [key, value] = arg.split(':');
    if (!['colorTheme', 'theme'].includes(key)) return;
    store.saveSettings({ [key]: value });
    if (key === 'theme') nativeTheme.themeSource = value;
    return changed();
  }
  menubar?.hide();
  showWindow({ command: cmd });
}

function trayMenu(c, delivery, snoozeText) {
  const st = poller.status();
  const recent = store.notifications.slice(0, 6);
  return Menu.buildFromTemplate([
    { label: c.unread ? t('tray.unread', { count: c.unread }) : t('tray.noUnread'), enabled: false },
    {
      label: st.running ? t('tray.refreshing', { done: st.done, total: st.total }) : st.last ? t('tray.lastRefresh', { time: clockText(st.last) }) : t('tray.neverRefreshed'),
      enabled: false,
    },
    { type: 'separator' },
    { label: t('tray.openPanel'), click: () => menubar.show() },
    { label: t('tray.openApp'), click: () => showWindow() },
    { label: t('common.refreshNow'), enabled: !st.running, click: () => runCommand('refresh') },
    {
      label: t('tray.recent'),
      submenu: recent.length
        ? [
            ...recent.map((n) => ({
              label: cut(`${n.feedTitle}: ${n.count === 1 ? n.items[0]?.title || t('common.untitled') : t('tray.newPosts', { count: n.count })}`, 64),
              click: () => {
                store.markNotificationsSeen([n.id]);
                changed();
                if (n.count === 1 && n.items[0]) openItem(n.items[0].id);
                else showWindow({ feed: n.feedId });
              },
            })),
            { type: 'separator' },
            { label: t('tray.history'), click: () => showWindow({ view: 'notifications' }) },
          ]
        : [{ label: t('tray.noneYet'), enabled: false }],
    },
    { type: 'separator' },
    ...notifyItems({ delivery, snoozeText, run: runCommand, t }),
    { label: t('tray.test'), click: () => testNotification() },
    { type: 'separator' },
    { label: t('tray.settings'), click: () => showWindow({ view: 'settings' }) },
    { label: t('tray.quit'), click: () => quit() },
  ]);
}

let appMenuKey = '';
function updateMenus() {
  const c = store.counts();
  const delivery = deliveryState(store.settings);
  const snoozeText = snoozeLabel(store.settings);
  const showCount = store.settings.showCount && c.unread > 0;
  if (isMac && app.dock) {
    app.dock.setBadge(showCount ? String(c.unread) : '');
    app.dock.setMenu(buildDockMenu({ delivery, snoozeText, unread: c.unread, run: runCommand, t }));
  }
  const s = store.settings;
  const key = [delivery.reason, snoozeText, s.colorTheme, s.theme].join('|');
  if (key !== appMenuKey) {
    appMenuKey = key;
    Menu.setApplicationMenu(buildAppMenu({ isMac, dev: !app.isPackaged, delivery, snoozeText, run: runCommand, t, settings: s }));
  }
  const tip = [
    c.unread ? t('tray.tooltipUnread', { count: c.unread }) : 'Feedbell',
    c.notifications ? t('tray.tooltipNew', { count: c.notifications }) : '',
    delivery.on ? '' : delivery.reason === 'snoozed' ? t('tray.tooltipSnoozed', { until: snoozeText }) : delivery.reason === 'quiet' ? t('tray.tooltipQuiet') : t('tray.tooltipOff'),
  ]
    .filter(Boolean)
    .join('\n');
  menubar?.update({ title: showCount ? ` ${c.unread}` : '', tooltip: tip, dot: c.notifications > 0, menu: trayMenu(c, delivery, snoozeText) });
}

function panelMenu(sender) {
  const s = store.settings;
  const set = (patch) => {
    store.saveSettings(patch);
    changed();
  };
  const style = (v, label) => ({ label, type: 'radio', checked: s.notifyStyle === v, click: () => set({ notifyStyle: v }) });
  const pos = (v, label) => ({ label, type: 'radio', checked: s.popupPosition === v, click: () => set({ popupPosition: v }) });
  const secs = (v, label) => ({ label, type: 'radio', checked: +s.popupSeconds === v, click: () => set({ popupSeconds: v }) });
  const popup = s.notifyStyle === 'popup' || s.notifyStyle === 'both';
  Menu.buildFromTemplate([
    {
      label: t('panelMenu.style'),
      submenu: [style('popup', t('settings.stylePopup')), style('system', t('settings.styleSystem')), style('both', t('settings.styleBoth')), style('off', t('settings.styleOff'))],
    },
    {
      label: t('panelMenu.position'),
      enabled: popup,
      submenu: [pos('top-right', t('settings.topRight')), pos('bottom-right', t('settings.bottomRight')), pos('top-left', t('settings.topLeft')), pos('bottom-left', t('settings.bottomLeft'))],
    },
    { label: t('panelMenu.duration'), enabled: popup, submenu: [...[5, 8, 15, 30].map((n) => secs(n, t('settings.seconds', { count: n }))), secs(0, t('settings.untilClosed'))] },
    { label: t('panelMenu.sound'), type: 'checkbox', checked: !!s.sound, click: (mi) => set({ sound: mi.checked }) },
    { label: t('panelMenu.quiet', { start: s.quietStart, end: s.quietEnd }), type: 'checkbox', checked: !!s.quietHours, click: (mi) => set({ quietHours: mi.checked }) },
    { label: t('tray.test'), click: () => testNotification() },
    { type: 'separator' },
    { label: t('tray.settings'), click: () => runCommand('view:settings') },
    { label: t('tray.quit'), click: () => quit() },
  ]).popup({ window: BrowserWindow.fromWebContents(sender) });
}

// --- IPC -----------------------------------------------------------------------------------------

function applyLoginItem(force = false) {
  if (DEMO || CAPTURING) return;
  // Hiç açılmadıysa sisteme dokunma (imzasız geliştirme sürümünde gereksiz hata yazar).
  if (!force && !store.settings.launchAtLogin) return;
  app.setLoginItemSettings({ openAtLogin: !!store.settings.launchAtLogin, args: ['--hidden'] });
}

async function addFeed({ url, folder, notify }) {
  try {
    const input = normalizeUrl(url);
    const exists = (u) => store.feeds.find((f) => urlKey(f.url) === urlKey(u));
    if (exists(input)) return { error: t('errors.alreadySubscribed', { name: displayName(exists(input)) }) };
    const r = await resolveFeed(input, { fetch: fetchImpl });
    if (r.choices) return { choices: r.choices };
    if (exists(r.url)) return { error: t('errors.alreadySubscribed', { name: displayName(exists(r.url)) }) };
    const parsed = r.result.feed;
    let siteUrl = parsed.siteUrl;
    if (!siteUrl) siteUrl = new URL('/', r.result.url).href;
    const feed = store.addFeed({ url: r.url, title: parsed.title, siteUrl, description: parsed.description, folder, notify });
    const now = Date.now();
    store.merge(feed.id, parsed.items, now);
    store.updateFeed(feed.id, { lastFetch: now, lastOk: now, etag: r.result.etag, lastModified: r.result.lastModified });
    poller.loadIcon(feed, parsed.icon);
    changed({ items: true });
    return { feed };
  } catch (e) {
    return { error: errorText(e, t) };
  }
}

async function importOpml() {
  const { filePaths, canceled } = await dialog.showOpenDialog(win, {
    title: t('opml.importTitle'),
    filters: [{ name: 'OPML', extensions: ['opml', 'xml'] }],
    properties: ['openFile'],
  });
  if (canceled || !filePaths[0]) return null;
  let list;
  try {
    list = parseOpml(fs.readFileSync(filePaths[0], 'utf8'));
  } catch (e) {
    return { error: errorText(e, t) };
  }
  const known = new Set(store.feeds.map((f) => urlKey(f.url)));
  const added = [];
  for (const o of list) {
    let u;
    try {
      u = normalizeUrl(o.url);
    } catch {
      continue;
    }
    if (known.has(urlKey(u))) continue;
    known.add(urlKey(u));
    added.push(store.addFeed({ url: u, title: o.title, siteUrl: o.siteUrl, folder: o.folder }).id);
  }
  changed();
  if (added.length) poller.refresh(added);
  return { added: added.length, skipped: list.length - added.length };
}

async function exportOpml() {
  const { filePath, canceled } = await dialog.showSaveDialog(win, {
    title: t('opml.exportTitle'),
    defaultPath: t('opml.fileName'),
    filters: [{ name: 'OPML', extensions: ['opml'] }],
  });
  if (canceled || !filePath) return null;
  fs.writeFileSync(filePath, buildOpml(store.feeds, { title: t('opml.docTitle') }));
  return { path: filePath, count: store.feeds.length };
}

async function confirm(message, detail, okLabel) {
  const parent = win && !win.isDestroyed() && win.isVisible() ? win : null;
  const opts = {
    type: 'warning',
    buttons: [t('common.cancel'), okLabel],
    defaultId: 0,
    cancelId: 0,
    message,
    detail,
  };
  const { response } = parent ? await dialog.showMessageBox(parent, opts) : await dialog.showMessageBox(opts);
  return response === 1;
}

function registerIpc() {
  // Pencereler sözlüğü yüklenirken eşzamanlı alır (preload).
  ipcMain.on('i18n-sync', (e) => {
    e.returnValue = i18nData;
  });
  ipcMain.handle('info', () => ({ platform: process.platform, demo: DEMO, capture: !!CAPTURE, version: app.getVersion(), dataDir: dataDir() }));
  ipcMain.handle('state', () => statePayload());
  ipcMain.handle('query', (_e, f) => store.query(f || {}));
  ipcMain.handle('item', (_e, id) => {
    const it = store.item(id);
    return it ? { ...it, feed: store.feed(it.feedId) } : null;
  });
  ipcMain.handle('set-read', (_e, { ids, read }) => {
    if (store.setRead(ids || [], read !== false)) changed();
  });
  ipcMain.handle('set-starred', (_e, { id, starred }) => {
    store.setStarred(id, starred);
    changed();
  });
  ipcMain.handle('mark-all-read', (_e, f) => {
    const n = store.markAllRead(f || {});
    changed({ items: true });
    return n;
  });
  ipcMain.handle('add-feed', (_e, data) => addFeed(data || {}));
  ipcMain.handle('update-feed', (_e, { id, patch }) => {
    const allowed = {};
    for (const k of ['name', 'folder', 'notify', 'keywords']) if (k in patch) allowed[k] = patch[k];
    const f = store.updateFeed(id, allowed);
    changed({ items: true });
    return f;
  });
  ipcMain.handle('remove-feed', async (_e, id) => {
    const f = store.feed(id);
    if (!f) return false;
    const n = [...store.items.values()].filter((it) => it.feedId === id).length;
    const ok = await confirm(t('confirm.removeFeedMessage', { name: displayName(f) }), t('confirm.removeFeedDetail', { count: n }), t('confirm.removeFeedOk'));
    if (!ok) return false;
    store.removeFeed(id);
    changed({ items: true });
    return true;
  });
  ipcMain.handle('refresh', (_e, ids) => {
    poller.refresh(ids);
  });
  ipcMain.handle('notifications', () =>
    store.notifications.map((n) => ({
      ...n,
      items: n.items.map((x) => {
        const it = store.item(x.id);
        return { ...x, read: !!it?.read, gone: !it };
      }),
    }))
  );
  ipcMain.handle('notifications-seen', (_e, ids) => {
    if (store.markNotificationsSeen(ids)) changed();
  });
  ipcMain.handle('clear-notifications', async (_e, opts) => {
    const ok = opts?.confirmed || (await confirm(t('confirm.clearMessage'), t('confirm.clearDetail'), t('confirm.clearOk')));
    if (!ok) return false;
    store.clearNotifications();
    send('notifications-changed');
    changed();
    return true;
  });
  ipcMain.handle('save-settings', (_e, patch) => {
    const before = store.settings;
    store.saveSettings(patch);
    if ('launchAtLogin' in patch) applyLoginItem(true);
    if ('theme' in patch) nativeTheme.themeSource = patch.theme || 'system';
    if ('retentionDays' in patch && patch.retentionDays !== before.retentionDays && store.prune()) changed({ items: true });
    if ('popupPosition' in patch && toastWin && toastWin.isVisible()) toastWin.setBounds(toastBounds(toastWin.getBounds().height));
    changed();
    if ('language' in patch && patch.language !== before.language) {
      applyLanguage();
      setTimeout(reloadWindows, 50);
    }
    return store.settings;
  });
  ipcMain.handle('snooze', (_e, v) => setSnooze(v));
  ipcMain.handle('test-notification', () => testNotification());
  ipcMain.handle('import-opml', () => importOpml());
  ipcMain.handle('export-opml', () => exportOpml());
  ipcMain.handle('open-external', (_e, url) => openExternal(url));
  ipcMain.handle('open-data', () => shell.openPath(dataDir()));
  // Menü çubuğu paneli
  ipcMain.handle('open-app', (_e, nav) => {
    menubar.hide();
    showWindow(nav || undefined);
  });
  ipcMain.handle('panel-hide', () => menubar.hide());
  ipcMain.handle('show-panel', () => menubar.show());
  ipcMain.handle('panel-menu', (e) => panelMenu(e.sender));
  ipcMain.handle('quit', () => quit());
  ipcMain.handle('remove-notification', (_e, id) => {
    store.removeNotification(id);
    send('notifications-changed');
    changed();
  });
  ipcMain.handle('notification-read', (_e, id) => {
    const n = store.notifications.find((x) => x.id === id);
    if (!n) return;
    store.markNotificationsSeen([id]);
    store.setRead(n.items.map((x) => x.id), true);
    changed({ items: true });
  });
  ipcMain.on('panel-rendered', () => {
    if (CAPTURE_PANEL) captureAndQuit(menubar.panel, CAPTURE_PANEL, 700);
  });

  ipcMain.on('ready', () => {
    rendererReady = true;
    if (pendingNav) {
      sendMain('navigate', pendingNav);
      pendingNav = null;
    }
  });
  ipcMain.on('rendered', () => {
    if (CAPTURE) captureAndQuit(win, CAPTURE, 700);
  });

  // Popup penceresi
  ipcMain.on('toast-size', (_e, h) => {
    if (!toastWin || toastWin.isDestroyed()) return;
    if (h <= 0) return;
    toastWin.setBounds(toastBounds(h));
    if (!toastWin.isVisible()) toastWin.showInactive();
  });
  ipcMain.on('toast-empty', () => {
    if (toastWin && !toastWin.isDestroyed()) toastWin.hide();
    toastDisplay = null;
  });
  ipcMain.on('toast-action', (_e, a) => {
    if (a.entryId) {
      store.markNotificationsSeen([a.entryId]);
      changed();
    }
    if (a.act === 'item') openItem(a.id);
    else if (a.act === 'feed') showWindow({ feed: a.feedId });
    else if (a.act === 'history') showWindow({ view: 'notifications' });
    else if (a.act === 'link') {
      const it = store.item(a.id);
      openExternal(it?.link || a.link);
      if (it && store.setRead([it.id], true)) changed();
    }
  });
  ipcMain.on('toast-rendered', () => {
    if (CAPTURE_TOAST) captureAndQuit(toastWin, CAPTURE_TOAST, 900);
  });
}

function captureAndQuit(w, file, delay) {
  setTimeout(async () => {
    w.webContents.invalidate();
    await new Promise((r) => setTimeout(r, 300));
    const img = await w.webContents.capturePage();
    fs.writeFileSync(file, img.toPNG());
    quitting = true;
    app.quit();
  }, delay);
}

// --- Yaşam döngüsü ---------------------------------------------------------------------------------

function quit() {
  quitting = true;
  app.quit();
}

app.whenReady().then(() => {
  const hidden = flag('hidden') || app.getLoginItemSettings().wasOpenedAtLogin;
  if (isMac && !CAPTURE && hidden) app.setActivationPolicy('accessory');
  const demoLang = DEMO ? resolveLanguage(DEMO_LOOK.language || 'system', app.getPreferredSystemLanguages?.() || [app.getLocale()]) : '';
  if (!CAPTURING) migrateFromAkis();
  store = DEMO ? seedDemo(dataDir(), { ...DEMO_LOOK, lang: demoLang }) : new Store(dataDir());
  applyLanguage();
  nativeTheme.themeSource = store.settings.theme || 'system';
  poller = DEMO ? new DemoPoller({ store, lang: demoLang }) : new Poller({ store, fetch: fetchImpl });
  registerIpc();
  app.setAboutPanelOptions({
    applicationName: 'Feedbell',
    applicationVersion: app.getVersion(),
    version: '',
    credits: t('system.aboutCredits'),
  });
  if (isMac && !app.isPackaged && app.dock) app.dock.setIcon(path.join(ASSETS, 'icon.png'));
  menubar = new MenuBar({
    isMac,
    assets: ASSETS,
    preload: path.join(__dirname, 'preload.js'),
    page: path.join(__dirname, 'panel', 'panel.html'),
    capture: CAPTURE_PANEL ? flag('tab') || true : false,
  });

  poller.on('progress', (st) => {
    send('progress', st);
    if (!st.running) updateMenus();
  });
  poller.on('new-items', (results) => onNewItems(results));
  poller.on('changed', () => changed({ items: true }));
  if (!CAPTURING && !DEMO) poller.start();

  powerMonitor.on('resume', () => setTimeout(() => poller.tick(), 8000));
  powerMonitor.on('shutdown', () => store.flush());
  setInterval(() => changed(), 60e3); // susturma süresi dolunca menüler ve panel güncellensin

  // Tanıtım modunda örnek bir popup; gerçek veride ilk yenilemede gelen popup kaydedilir.
  if (CAPTURE_TOAST && !DEMO) {
    store.saveSettings({ popupSeconds: 0, sound: false });
    poller.start();
    return;
  }
  if (CAPTURE_TOAST) {
    store.saveSettings({ popupSeconds: 0, sound: false });
    const latest = [...store.items.values()].sort(byDate);
    const byFeed = new Map();
    for (const it of latest) {
      if (!byFeed.has(it.feedId)) byFeed.set(it.feedId, []);
      byFeed.get(it.feedId).push(it);
    }
    const results = [...byFeed].slice(0, 2).map(([id, items], i) => ({ feed: store.feed(id), items: items.slice(0, i === 0 ? 1 : 3) }));
    showToast(buildEntries(results.map((r) => ({ ...r, items: r.items.map((x) => ({ ...x, date: Date.now() })) }))));
    return;
  }

  if (CAPTURE_PANEL) {
    menubar.ensurePanel();
    return;
  }

  createWindow();
  if (!CAPTURE) menubar.createTray();
  updateMenus();
  applyLoginItem();
});

app.on('activate', () => showWindow());
app.on('window-all-closed', () => {
  if (CAPTURING) app.quit();
});
app.on('before-quit', () => {
  quitting = true;
  poller?.stop();
  store?.flush();
});
