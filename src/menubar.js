// Menü çubuğu (Windows'ta sistem tepsisi) simgesi ve simgeye tıklayınca açılan bildirim paneli.
//   Sol tık → panel (son bildirimler, okunmamışlar, kaynakların bildirimleri, susturma)
//   Sağ tık → hızlı işlemler menüsü
const { app, BrowserWindow, Tray, nativeImage, nativeTheme, screen } = require('electron');
const path = require('path');

const PANEL_W = 380;
const PANEL_H = 600;

class MenuBar {
  constructor({ isMac, assets, preload, page, capture = false }) {
    this.isMac = isMac;
    this.assets = assets;
    this.preload = preload;
    this.page = page;
    this.capture = capture;
    this.tray = null;
    this.panel = null;
    this.menu = null;
    this.dot = null;
    this.hiddenAt = 0;
  }

  createTray() {
    this.tray = new Tray(this.icon(false));
    this.dot = false;
    if (this.isMac) this.tray.setIgnoreDoubleClickEvents(true);
    this.tray.on('click', (_e, bounds) => this.toggle(bounds));
    this.tray.on('right-click', () => this.popMenu());
  }

  icon(dot) {
    if (this.isMac) {
      const img = nativeImage.createFromPath(path.join(this.assets, dot ? 'trayDotTemplate.png' : 'trayTemplate.png'));
      img.setTemplateImage(true);
      return img;
    }
    return nativeImage.createFromPath(path.join(this.assets, 'tray.png'));
  }

  // title: simgenin yanındaki yazı (yalnızca macOS), dot: görülmemiş bildirim var mı, menu: sağ tık menüsü
  update({ title, tooltip, dot, menu }) {
    this.menu = menu;
    if (!this.tray) return;
    if (dot !== this.dot) {
      this.dot = dot;
      this.tray.setImage(this.icon(dot));
    }
    if (this.isMac) this.tray.setTitle(title || '', { fontType: 'monospacedDigit' });
    this.tray.setToolTip(tooltip);
    // Linux'ta tık olayları her masaüstünde gelmez; menü her zaman erişilebilir olsun.
    if (process.platform === 'linux') this.tray.setContextMenu(menu);
  }

  popMenu() {
    if (!this.tray || !this.menu) return;
    this.hide();
    this.tray.popUpContextMenu(this.menu);
  }

  ensurePanel() {
    if (this.panel && !this.panel.isDestroyed()) return this.panel;
    const vibrant = this.isMac && !this.capture;
    this.panel = new BrowserWindow({
      width: PANEL_W,
      height: PANEL_H,
      show: false,
      frame: false,
      resizable: false,
      movable: false,
      minimizable: false,
      maximizable: false,
      fullscreenable: false,
      skipTaskbar: true,
      alwaysOnTop: true,
      roundedCorners: true,
      vibrancy: vibrant ? 'popover' : undefined,
      visualEffectState: 'active',
      backgroundColor: vibrant ? '#00000000' : nativeTheme.shouldUseDarkColors ? '#191918' : '#fcfcfb',
      webPreferences: {
        preload: this.preload,
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        backgroundThrottling: false,
      },
    });
    this.panel.setAlwaysOnTop(true, 'pop-up-menu');
    if (this.isMac) this.panel.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true, skipTransformProcessType: true });
    this.panel.loadFile(this.page, { hash: this.capture ? `capture${this.capture === true ? '' : `:${this.capture}`}` : '' });
    this.panel.on('blur', () => {
      if (!this.panel.webContents.isDevToolsOpened()) this.hide();
    });
    this.panel.on('closed', () => {
      this.panel = null;
    });
    this.panel.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    this.panel.webContents.on('will-navigate', (e) => e.preventDefault());
    return this.panel;
  }

  position(bounds) {
    const b = bounds && bounds.width ? bounds : this.tray ? this.tray.getBounds() : { x: 0, y: 0, width: 0, height: 0 };
    const display = b.width ? screen.getDisplayMatching(b) : screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
    const wa = display.workArea;
    const height = Math.min(PANEL_H, wa.height - 16);
    let x = b.width ? Math.round(b.x + b.width / 2 - PANEL_W / 2) : wa.x + wa.width - PANEL_W - 8;
    let y;
    if (this.isMac) y = wa.y + 6;
    else if (b.width && b.y < wa.y + wa.height / 2) y = wa.y + 8; // görev çubuğu üstte
    else y = wa.y + wa.height - height - 8; // görev çubuğu altta (olağan)
    x = Math.max(wa.x + 8, Math.min(x, wa.x + wa.width - PANEL_W - 8));
    return { x, y, width: PANEL_W, height };
  }

  toggle(bounds) {
    if (this.panel && this.panel.isVisible()) return this.hide();
    // Panel açıkken simgeye tıklamak önce paneli odaktan düşürüp kapatır; aynı tık yeniden açmasın.
    if (Date.now() - this.hiddenAt < 300) return;
    this.show(bounds);
  }

  show(bounds) {
    const p = this.ensurePanel();
    p.setBounds(this.position(bounds));
    if (this.isMac) app.focus({ steal: true });
    p.show();
    p.focus();
    p.webContents.send('panel-shown');
  }

  hide() {
    if (this.panel && !this.panel.isDestroyed() && this.panel.isVisible()) {
      this.panel.hide();
      this.hiddenAt = Date.now();
    }
  }

  isVisible() {
    return !!(this.panel && !this.panel.isDestroyed() && this.panel.isVisible());
  }

  send(channel, payload) {
    if (this.panel && !this.panel.isDestroyed()) this.panel.webContents.send(channel, payload);
  }
}

module.exports = { MenuBar, PANEL_W, PANEL_H };
