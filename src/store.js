// Veriler yalnızca bu bilgisayarda, JSON dosyalarında tutulur:
//   <veri klasörü>/settings.json
//   <veri klasörü>/feeds.json             → abonelikler
//   <veri klasörü>/items/<kaynak>.json    → { seen: [kimlikler], items: [yazılar] }
//   <veri klasörü>/notifications.json     → bildirim geçmişi (en yenisi başta)
// "seen" listesi, saklama süresi dolup silinen ama beslemede hâlâ duran yazıların
// yeniymiş gibi tekrar gelip bildirim üretmesini önler.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DAY = 86400e3;
const SEEN_CAP = 3000;
const MAX_PER_FEED = 1000;
const MAX_NOTIFICATIONS = 1000;
const MAX_HTML = 400 * 1024;

const DEFAULT_SETTINGS = {
  refreshMin: 15, // beslemeleri kaç dakikada bir kontrol et
  notifyStyle: 'popup', // 'popup' | 'system' | 'both' | 'off'
  popupPosition: process.platform === 'darwin' ? 'top-right' : 'bottom-right',
  popupSeconds: 8, // popup kaç saniye ekranda kalsın (0 = ben kapatana kadar)
  sound: true,
  quietHours: false, // sessiz saatlerde bildirim gösterme, yalnızca geçmişe yaz
  quietStart: '23:00',
  quietEnd: '08:00',
  snoozeUntil: 0, // bildirimler bu zamana kadar susturuldu (ms); -1 = ben açana kadar
  markReadOnOpen: true,
  loadImages: true,
  retentionDays: 30, // bu kadar günden eski yazıları sil (yıldızlılar kalır); 0 = hiç silme
  showCount: true, // menü çubuğunda / Dock'ta okunmamış sayısı
  launchAtLogin: false,
  theme: 'system', // görünüm modu: 'system' | 'light' | 'dark'
  colorTheme: 'ember', // renk teması: ember | ocean | forest | lavender | sepia | graphite
  readerFont: 'sans', // 'sans' | 'serif'
  readerSize: 'medium', // 'small' | 'medium' | 'large' | 'xlarge'
  language: 'system', // 'system' ya da src/locales içindeki bir dil kodu
  closeHintShown: false,
};

function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return fallback;
  }
}

function writeAtomic(file, data) {
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, data);
  fs.renameSync(tmp, file);
}

const randomId = () => crypto.randomBytes(6).toString('hex');
const itemId = (feedId, key) => crypto.createHash('sha1').update(`${feedId}\n${key}`).digest('hex').slice(0, 16);

function hostOf(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

// Kaynak silinmişse boş döner; arayüz kendi dilinde "Silinmiş kaynak" yazar.
const displayName = (feed) => (feed && (feed.name || feed.title || hostOf(feed.url))) || '';
const byDate = (a, b) => b.date - a.date || b.added - a.added;
// Dilden bağımsız arama: büyük/küçük harf, Türkçe ı/i ve aksanlar fark etmez ("IŞIK" = "isik").
const fold = (s) =>
  String(s || '')
    .toLocaleLowerCase('tr')
    .replace(/ı/g, 'i')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
const lower = fold;

// Liste için hafif kopya (içerik HTML'i olmadan).
function light(it) {
  const { html, ...rest } = it;
  return rest;
}

class Store {
  constructor(dir) {
    this.dir = dir;
    this.itemsDir = path.join(dir, 'items');
    fs.mkdirSync(this.itemsDir, { recursive: true });
    const saved = readJson(this.file('settings.json'), null);
    this.settings = { ...DEFAULT_SETTINGS, ...(saved || {}) };
    // Dil ayarı gelmeden önce kurulmuş Feedbell Türkçeydi; o kullanıcılar için Türkçe kalsın.
    if (saved && !('language' in saved)) this.settings.language = 'tr';
    this.feeds = readJson(this.file('feeds.json'), []);
    this.notifications = readJson(this.file('notifications.json'), []);
    this.items = new Map();
    this.seen = new Map();
    for (const f of this.feeds) this.loadFeedItems(f.id);
    this.dirty = new Set();
    this.timer = null;
  }

  file(name) {
    return path.join(this.dir, name);
  }

  itemsFile(feedId) {
    return path.join(this.itemsDir, `${feedId}.json`);
  }

  loadFeedItems(feedId) {
    const d = readJson(this.itemsFile(feedId), {});
    this.seen.set(feedId, Array.isArray(d.seen) ? d.seen : []);
    for (const it of Array.isArray(d.items) ? d.items : []) this.items.set(it.id, it);
  }

  // --- Kalıcılık ----------------------------------------------------------------------

  touch(what) {
    this.dirty.add(what);
    if (!this.timer) this.timer = setTimeout(() => this.flush(), 800);
  }

  flush() {
    clearTimeout(this.timer);
    this.timer = null;
    const dirty = [...this.dirty];
    this.dirty.clear();
    for (const d of dirty) {
      try {
        if (d === 'settings') writeAtomic(this.file('settings.json'), JSON.stringify(this.settings, null, 2));
        else if (d === 'feeds') writeAtomic(this.file('feeds.json'), JSON.stringify(this.feeds, null, 2));
        else if (d === 'notifications') writeAtomic(this.file('notifications.json'), JSON.stringify(this.notifications));
        else if (d.startsWith('items:')) {
          const id = d.slice(6);
          if (!this.feeds.some((f) => f.id === id)) continue;
          const items = [...this.items.values()].filter((it) => it.feedId === id);
          writeAtomic(this.itemsFile(id), JSON.stringify({ seen: this.seen.get(id) || [], items }));
        }
      } catch (e) {
        console.error('[store] kaydedilemedi:', d, e.message);
      }
    }
  }

  saveSettings(patch) {
    this.settings = { ...this.settings, ...patch };
    this.touch('settings');
    return this.settings;
  }

  // --- Kaynaklar ----------------------------------------------------------------------

  feed(id) {
    return this.feeds.find((f) => f.id === id) || null;
  }

  addFeed(data) {
    const feed = {
      id: randomId(),
      url: data.url,
      title: data.title || '',
      name: data.name || '',
      siteUrl: data.siteUrl || '',
      description: data.description || '',
      icon: data.icon || '',
      folder: (data.folder || '').trim(),
      notify: data.notify !== false,
      keywords: data.keywords || '',
      added: Date.now(),
      lastFetch: 0,
      lastOk: 0,
      lastError: '',
      errorCount: 0,
      etag: '',
      lastModified: '',
    };
    this.feeds.push(feed);
    this.seen.set(feed.id, []);
    this.touch('feeds');
    return feed;
  }

  updateFeed(id, patch) {
    const f = this.feed(id);
    if (!f) return null;
    Object.assign(f, patch);
    if ('folder' in patch) f.folder = String(patch.folder || '').trim();
    this.touch('feeds');
    return f;
  }

  removeFeed(id) {
    const i = this.feeds.findIndex((f) => f.id === id);
    if (i < 0) return false;
    this.feeds.splice(i, 1);
    for (const [k, it] of this.items) if (it.feedId === id) this.items.delete(k);
    this.seen.delete(id);
    fs.rmSync(this.itemsFile(id), { force: true });
    this.touch('feeds');
    return true;
  }

  folders() {
    return [...new Set(this.feeds.map((f) => f.folder).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'tr'));
  }

  // --- Yazılar ------------------------------------------------------------------------

  // Beslemeden gelen yazıları ekler; yalnızca daha önce hiç görülmemiş olanları döndürür.
  merge(feedId, parsed, now = Date.now()) {
    const seen = this.seen.get(feedId) || [];
    const seenSet = new Set(seen);
    const present = new Set();
    const fresh = [];
    let changed = false;
    parsed.forEach((p, index) => {
      const id = itemId(feedId, p.key);
      if (present.has(id)) return;
      present.add(id);
      const html = (p.html || '').length > MAX_HTML ? p.html.slice(0, MAX_HTML) : p.html || '';
      if (seenSet.has(id)) {
        // Yazı sonradan düzeltildiyse içeriği güncelle; okundu/yıldız durumu korunur.
        const ex = this.items.get(id);
        if (ex && (ex.title !== p.title || ex.html !== html)) {
          Object.assign(ex, { title: p.title, html, summary: p.summary, image: p.image || ex.image });
          changed = true;
        }
        return;
      }
      // Tarihsiz yazılar beslemedeki sırayı korusun; gelecekteki tarihler şimdiye çekilir.
      let date = p.date || now - index;
      if (date > now + 10 * 60e3) date = now;
      const item = {
        id,
        feedId,
        title: p.title,
        link: p.link,
        author: p.author || '',
        date,
        added: now,
        summary: p.summary || '',
        html,
        image: p.image || '',
        enclosure: p.enclosure || null,
        comments: p.comments || '',
        read: false,
        starred: false,
      };
      this.items.set(id, item);
      fresh.push(item);
      changed = true;
    });
    // Beslemede hâlâ duranlar listenin sonuna (en taze) taşınır, sonra eskiler kırpılır.
    const nextSeen = seen.filter((id) => !present.has(id)).concat([...present]);
    this.seen.set(feedId, nextSeen.length > SEEN_CAP ? nextSeen.slice(-SEEN_CAP) : nextSeen);
    if (changed || nextSeen.length !== seen.length) this.touch(`items:${feedId}`);
    return fresh;
  }

  item(id) {
    return this.items.get(id) || null;
  }

  filter(f = {}) {
    const scope = f.scope || 'all';
    const folderFeeds = scope === 'folder' ? new Set(this.feeds.filter((x) => (x.folder || '') === f.folder).map((x) => x.id)) : null;
    const q = lower(f.search).trim();
    const keep = f.keep ? new Set(f.keep) : null;
    const names = q ? new Map(this.feeds.map((x) => [x.id, lower(displayName(x))])) : null;
    return (it) => {
      if (scope === 'feed' && it.feedId !== f.feedId) return false;
      if (folderFeeds && !folderFeeds.has(it.feedId)) return false;
      if (scope === 'starred' && !it.starred) return false;
      if ((scope === 'unread' || f.unreadOnly) && it.read && !(keep && keep.has(it.id))) return false;
      if (q && !lower(`${it.title} ${it.summary} ${it.author} ${names.get(it.feedId) || ''}`).includes(q)) return false;
      return true;
    };
  }

  query(f = {}) {
    const list = [...this.items.values()].filter(this.filter(f)).sort(byDate);
    const offset = Math.max(0, f.offset || 0);
    const limit = Math.max(1, Math.min(f.limit || 150, 2000));
    return { total: list.length, items: list.slice(offset, offset + limit).map(light) };
  }

  setRead(ids, read = true) {
    const touched = new Set();
    for (const id of ids) {
      const it = this.items.get(id);
      if (!it || it.read === read) continue;
      it.read = read;
      touched.add(it.feedId);
    }
    for (const f of touched) this.touch(`items:${f}`);
    return touched.size > 0;
  }

  setStarred(id, starred) {
    const it = this.items.get(id);
    if (!it) return false;
    it.starred = !!starred;
    this.touch(`items:${it.feedId}`);
    return true;
  }

  markAllRead(f = {}) {
    const fn = this.filter({ ...f, keep: null });
    const ids = [];
    for (const it of this.items.values()) if (!it.read && fn(it)) ids.push(it.id);
    this.setRead(ids, true);
    return ids.length;
  }

  counts() {
    const feeds = {};
    let all = 0;
    let unread = 0;
    let starred = 0;
    for (const it of this.items.values()) {
      all++;
      if (!it.read) {
        unread++;
        feeds[it.feedId] = (feeds[it.feedId] || 0) + 1;
      }
      if (it.starred) starred++;
    }
    const folders = {};
    for (const f of this.feeds) if (f.folder) folders[f.folder] = (folders[f.folder] || 0) + (feeds[f.id] || 0);
    const notifications = this.notifications.filter((n) => !n.seen).length;
    return { all, unread, starred, feeds, folders, notifications };
  }

  // Saklama süresi dolan yazıları siler (yıldızlılar kalır). Kaç yazı silindiğini döndürür.
  prune(now = Date.now()) {
    let removed = 0;
    const touched = new Set();
    const days = +this.settings.retentionDays || 0;
    if (days > 0) {
      const cutoff = now - days * DAY;
      for (const [id, it] of this.items) {
        if (it.starred || it.added >= cutoff || it.date >= cutoff) continue;
        this.items.delete(id);
        touched.add(it.feedId);
        removed++;
      }
    }
    // Kaynak başına üst sınır.
    const per = new Map();
    for (const it of this.items.values()) {
      if (!per.has(it.feedId)) per.set(it.feedId, []);
      per.get(it.feedId).push(it);
    }
    for (const [feedId, list] of per) {
      if (list.length <= MAX_PER_FEED) continue;
      list.sort(byDate);
      for (const it of list.slice(MAX_PER_FEED)) {
        if (it.starred) continue;
        this.items.delete(it.id);
        removed++;
      }
      touched.add(feedId);
    }
    for (const f of touched) this.touch(`items:${f}`);
    return removed;
  }

  // --- Bildirim geçmişi -------------------------------------------------------------------

  addNotifications(entries) {
    if (!entries.length) return;
    this.notifications.unshift(...entries);
    if (this.notifications.length > MAX_NOTIFICATIONS) this.notifications.length = MAX_NOTIFICATIONS;
    this.touch('notifications');
  }

  markNotificationsSeen(ids) {
    const set = ids ? new Set(ids) : null;
    let n = 0;
    for (const e of this.notifications) {
      if (e.seen || (set && !set.has(e.id))) continue;
      e.seen = true;
      n++;
    }
    if (n) this.touch('notifications');
    return n;
  }

  removeNotification(id) {
    const i = this.notifications.findIndex((n) => n.id === id);
    if (i < 0) return false;
    this.notifications.splice(i, 1);
    this.touch('notifications');
    return true;
  }

  clearNotifications() {
    this.notifications = [];
    this.touch('notifications');
  }
}

module.exports = { Store, DEFAULT_SETTINGS, displayName, hostOf, itemId, randomId, byDate, fold, DAY };
