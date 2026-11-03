const api = window.feedbell;
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

// Çeviriler ana süreçten gelir (src/locales/*.json); metinler t(anahtar) ile alınır.
const I18N = window.FeedbellI18n.createI18n(api.i18n);
const t = I18N.t;
const LOCALE = I18N.locale;
document.documentElement.lang = I18N.lang;

function applyI18n(root = document) {
  for (const el of root.querySelectorAll('[data-i18n]')) el.textContent = t(el.dataset.i18n);
  for (const el of root.querySelectorAll('[data-i18n-title]')) el.title = t(el.dataset.i18nTitle);
  for (const el of root.querySelectorAll('[data-i18n-placeholder]')) el.placeholder = t(el.dataset.i18nPlaceholder);
  for (const el of root.querySelectorAll('[data-i18n-aria]')) el.setAttribute('aria-label', t(el.dataset.i18nAria));
}
applyI18n();

const PAGE = 150;
const THEMES = ['ember', 'ocean', 'forest', 'lavender', 'sepia', 'graphite'];

const SUGGESTIONS = [
  { title: 'Godot Engine', url: 'https://godotengine.org/rss.xml' },
  { title: 'r/godot', url: 'https://www.reddit.com/r/godot/.rss' },
  { title: 'Game Developer', url: 'https://www.gamedeveloper.com/rss.xml' },
  { title: 'Hacker News', url: 'https://hnrss.org/frontpage' },
  { title: 'Webrazzi', url: 'https://webrazzi.com/feed/' },
  { title: 'BBC Türkçe', url: 'https://feeds.bbci.co.uk/turkce/rss.xml' },
  { title: 'The Verge', url: 'https://www.theverge.com/rss/index.xml' },
  { title: 'xkcd', url: 'https://xkcd.com/atom.xml' },
];

const svg = (d, extra = '') => `<svg viewBox="0 0 24 24" ${extra}>${d}</svg>`;
const ICON = {
  star: svg('<path d="m12 3.6 2.6 5.3 5.8.8-4.2 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.2-4.1 5.8-.8z"/>'),
  external: svg('<path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/>'),
  read: svg('<circle cx="12" cy="12" r="7.5"/><path d="m8.8 12.2 2.2 2.2 4.4-4.6"/>'),
  unread: svg('<circle cx="12" cy="12" r="7.5"/><circle cx="12" cy="12" r="3" fill="currentColor" stroke="none"/>'),
  comments: svg('<path d="M5 5h14a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1h-8l-4 3.5V16H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z"/>'),
  chevron: svg('<path d="m9 6 6 6-6 6"/>'),
  dots: svg('<circle cx="6" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="18" cy="12" r="1.6"/>'),
  warn: svg('<path d="M12 4 2.8 19.5h18.4z"/><path d="M12 10v4.2m0 2.6v.2"/>'),
  bell: svg('<path d="M6 16.5V11a6 6 0 1 1 12 0v5.5l1.5 1.5h-15z"/><path d="M10 20.5a2.2 2.2 0 0 0 4 0"/>'),
  bellOff: svg('<path d="M8.5 5.6A6 6 0 0 1 18 11v4m-1 3H4.5L6 16.5V11a6 6 0 0 1 .4-2.1"/><path d="M10 20.5a2.2 2.2 0 0 0 4 0M3 3l18 18"/>'),
  moon: svg('<path d="M19.5 14.5A7.5 7.5 0 0 1 9.5 4.5a7.5 7.5 0 1 0 10 10z"/>'),
  refresh: svg('<path d="M20 11.5A8 8 0 0 0 5.6 6.8L4 8.5M4 4v4.5h4.5M4 12.5a8 8 0 0 0 14.4 4.7l1.6-1.7m0 4.5v-4.5h-4.5"/>'),
  check: svg('<path d="m5 12.5 4.5 4.5L19 7.5"/>'),
  inbox: svg('<path d="M4 13.5 6.5 5h11l2.5 8.5V19H4z"/><path d="M4 13.5h4.5l1 2h5l1-2H20"/>'),
  book: svg('<path d="M4 5.5C6.5 4.5 9.5 4.5 12 6c2.5-1.5 5.5-1.5 8-.5V19c-2.5-1-5.5-1-8 .5-2.5-1.5-5.5-1.5-8-.5z"/><path d="M12 6v13.5"/>'),
  rss: svg('<circle cx="6" cy="18" r="1.8" fill="currentColor" stroke="none"/><path d="M4.5 11a8.5 8.5 0 0 1 8.5 8.5M4.5 4.5a15 15 0 0 1 15 15"/>'),
  search: svg('<circle cx="11" cy="11" r="6.5"/><path d="m16 16 4.5 4.5"/>'),
  play: svg('<path d="M7 5v14l11-7z"/>'),
};

const S = {
  info: {},
  feeds: [],
  feedMap: new Map(),
  counts: { all: 0, unread: 0, starred: 0, feeds: {}, folders: {}, notifications: 0 },
  folders: [],
  settings: {},
  refresh: { running: false },
  delivery: { on: true },
  view: 'reader',
  scope: load('scope', { type: 'all' }),
  unreadOnly: load('unreadOnly', false),
  search: '',
  items: [],
  total: 0,
  limit: PAGE,
  selected: null,
  article: null,
  collapsed: new Set(load('collapsed', [])),
};

function load(k, d) {
  try {
    const v = localStorage.getItem(`feedbell.${k}`);
    return v ? JSON.parse(v) : d;
  } catch {
    return d;
  }
}
function save(k, v) {
  try {
    localStorage.setItem(`feedbell.${k}`, JSON.stringify(v));
  } catch {
    /* yer yoksa önemli değil */
  }
}

// --- Biçimlendirme ---------------------------------------------------------------

function host(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url || '';
  }
}
const displayName = (f) => (f ? f.name || f.title || host(f.url) : t('common.deletedFeed'));
const titleOf = (it) => it.title || t('common.untitled');
const feedError = (f) => (f.lastErrorCode ? t(`errors.${f.lastErrorCode}`, f.lastErrorParams || {}) : f.lastError || '');
const compare = (a, b) => a.localeCompare(b, LOCALE);

function hue(s) {
  let h = 0;
  for (const ch of String(s)) h = (h * 31 + ch.codePointAt(0)) % 360;
  return h;
}

function fav(feed, cls = '', fallbackName = '') {
  const name = feed ? displayName(feed) : fallbackName || '?';
  if (feed?.icon) return `<img class="fav ${cls}" src="${esc(feed.icon)}" alt="" data-name="${esc(name)}">`;
  return letterFav(name, cls);
}
function letterFav(name, cls = '') {
  const letter = (String(name).trim()[0] || '?').toLocaleUpperCase(LOCALE);
  return `<span class="fav letter ${cls}" style="--c: hsl(${hue(name)} 52% 46%)">${esc(letter)}</span>`;
}

const pad = (n) => String(n).padStart(2, '0');
const clock = (ts) => `${pad(new Date(ts).getHours())}:${pad(new Date(ts).getMinutes())}`;

function startOfDay(ts) {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}
const daysBetween = (ts) => Math.round((startOfDay(Date.now()) - startOfDay(ts)) / 86400e3);

function dayLabel(ts) {
  const diff = daysBetween(ts);
  if (diff <= 0) return t('time.today');
  if (diff === 1) return t('time.yesterday');
  const d = new Date(ts);
  const opts = { day: 'numeric', month: 'long', weekday: 'long' };
  if (d.getFullYear() !== new Date().getFullYear()) opts.year = 'numeric';
  return d.toLocaleDateString(LOCALE, opts);
}

function ago(ts) {
  const m = Math.floor((Date.now() - ts) / 60000);
  if (m < 1) return t('time.now');
  if (m < 60) return t('time.minutesShort', { count: m });
  const h = Math.floor(m / 60);
  if (h < 24) return t('time.hoursShort', { count: h });
  const days = daysBetween(ts);
  if (days === 1) return t('time.yesterdayShort');
  if (days < 7) return t('time.daysShort', { count: days });
  const d = new Date(ts);
  return d.toLocaleDateString(LOCALE, { day: 'numeric', month: 'short', ...(d.getFullYear() !== new Date().getFullYear() ? { year: 'numeric' } : {}) });
}

const fullDate = (ts) => new Date(ts).toLocaleString(LOCALE, { dateStyle: 'long', timeStyle: 'short' });
const fmtCount = (n) => (n > 9999 ? '9999+' : n.toLocaleString(LOCALE));

let snackTimer = null;
function snack(text, ms = 3200) {
  const el = $('#snack');
  el.textContent = text;
  el.classList.remove('hidden');
  clearTimeout(snackTimer);
  snackTimer = setTimeout(() => el.classList.add('hidden'), ms);
}

// Simgesi yüklenemeyen kaynaklar baş harfle, açılmayan küçük görseller hiç gösterilmez.
document.addEventListener(
  'error',
  (e) => {
    const el = e.target;
    if (!(el instanceof HTMLImageElement)) return;
    if (el.classList.contains('fav')) el.outerHTML = letterFav(el.dataset.name || '?', [...el.classList].filter((c) => c !== 'fav').join(' '));
    else if (el.classList.contains('i-thumb') || el.classList.contains('art-hero')) el.remove();
  },
  true
);

// --- Durum -------------------------------------------------------------------------

function applyAppearance(s) {
  const html = document.documentElement;
  html.dataset.theme = THEMES.includes(s.colorTheme) ? s.colorTheme : 'ember';
  html.dataset.readerFont = s.readerFont || 'sans';
  html.dataset.readerSize = s.readerSize || 'medium';
}

function applyState(st) {
  S.feeds = st.feeds;
  S.feedMap = new Map(st.feeds.map((f) => [f.id, f]));
  S.counts = st.counts;
  S.folders = st.folders;
  S.settings = st.settings;
  S.refresh = st.refresh;
  S.delivery = st.delivery;
  applyAppearance(st.settings);
  // Silinen kaynağa bakıyorsak Tümü'ne dön.
  if (S.scope.type === 'feed' && !S.feedMap.has(S.scope.feedId)) setScope({ type: 'all' });
  if (S.scope.type === 'folder' && !S.folders.includes(S.scope.folder)) setScope({ type: 'all' });
  $('#folder-list').innerHTML = S.folders.map((f) => `<option value="${esc(f)}">`).join('');
}

function scopeTitle() {
  const s = S.scope;
  if (s.type === 'unread') return t('nav.unread');
  if (s.type === 'starred') return t('nav.starred');
  if (s.type === 'feed') return displayName(S.feedMap.get(s.feedId));
  if (s.type === 'folder') return s.folder;
  return t('nav.all');
}

function scopeUnread() {
  const s = S.scope;
  if (s.type === 'feed') return S.counts.feeds[s.feedId] || 0;
  if (s.type === 'folder') return S.counts.folders[s.folder] || 0;
  if (s.type === 'starred') return null;
  return S.counts.unread;
}

function filterObj() {
  return {
    scope: S.scope.type,
    feedId: S.scope.feedId,
    folder: S.scope.folder,
    unreadOnly: S.unreadOnly,
    search: S.search,
  };
}

// --- Kenar çubuğu ------------------------------------------------------------------

function renderSidebar() {
  for (const el of $$('[data-count]')) {
    const n = S.counts[el.dataset.count] || 0;
    el.textContent = n ? fmtCount(n) : '';
  }
  for (const el of $$('.nav-item')) {
    const active = el.dataset.view ? S.view === el.dataset.view : S.view === 'reader' && S.scope.type === el.dataset.scope;
    el.classList.toggle('active', active);
  }
  $('[data-view="settings"].icon-btn').classList.toggle('active', S.view === 'settings');

  const box = $('#feeds');
  if (!S.feeds.length) {
    box.innerHTML = `<div class="feeds-empty">${esc(t('sidebar.noFeeds'))}<button class="btn small" data-add>${esc(t('common.addFeed'))}</button></div>`;
    return;
  }
  const sorted = [...S.feeds].sort((a, b) => compare(displayName(a), displayName(b)));
  const row = (f) => {
    const n = S.counts.feeds[f.id] || 0;
    const active = S.view === 'reader' && S.scope.type === 'feed' && S.scope.feedId === f.id;
    const err = f.errorCount > 0 ? feedError(f) : '';
    const warn = err ? `<span class="warn" title="${esc(err)}">${ICON.warn}</span>` : '';
    const tip = [displayName(f) + (f.notify === false ? ` · ${t('sidebar.notifyOff')}` : ''), err].filter(Boolean).join('\n');
    return `<button class="feed-row ${active ? 'active' : ''} ${n ? 'unread' : ''}" data-feed="${f.id}" title="${esc(tip)}">
      ${fav(f)}<span class="name">${esc(displayName(f))}</span>${warn}<span class="count">${n ? fmtCount(n) : ''}</span><span class="more" data-more="${f.id}" title="${esc(t('sidebar.feedSettings'))}">${ICON.dots}</span>
    </button>`;
  };
  const folders = S.folders.map((name) => {
    const n = S.counts.folders[name] || 0;
    const active = S.view === 'reader' && S.scope.type === 'folder' && S.scope.folder === name;
    return `<div class="folder ${S.collapsed.has(name) ? 'collapsed' : ''}">
      <button class="folder-head ${active ? 'active' : ''}" data-folder="${esc(name)}">
        <span class="chev" data-toggle="${esc(name)}">${ICON.chevron}</span><span class="name">${esc(name)}</span><span class="count">${n ? fmtCount(n) : ''}</span>
      </button>
      <div class="folder-feeds">${sorted.filter((f) => f.folder === name).map(row).join('')}</div>
    </div>`;
  });
  box.innerHTML = folders.join('') + sorted.filter((f) => !f.folder).map(row).join('');
}

function renderSync() {
  const r = S.refresh;
  const el = $('#sync');
  const broken = S.feeds.filter((f) => f.errorCount > 0);
  el.classList.toggle('running', !!r.running);
  $('#sync-icon').innerHTML = ICON.refresh;
  let text;
  if (r.running) text = esc(r.total > 1 ? t('sidebar.refreshingProgress', { done: r.done, total: r.total }) : t('sidebar.refreshing'));
  else if (r.last) text = esc(Date.now() - r.last < 60e3 ? t('sidebar.justRefreshed') : t('sidebar.lastRefresh', { time: clock(r.last) }));
  else text = S.feeds.length ? esc(t('sidebar.neverRefreshed')) : '';
  if (!r.running && broken.length) text += ` · <span class="warn">${esc(t('sidebar.problems', { count: broken.length }))}</span>`;
  $('#sync-text').innerHTML = text;
  $('#sync-icon').classList.toggle('hidden', !text);
  el.title = broken.map((f) => `${displayName(f)}: ${feedError(f)}`).join('\n');
  $('#btn-refresh').classList.toggle('spin', !!r.running);

  const d = S.delivery;
  const bell = $('#btn-bell');
  bell.classList.toggle('off', d.reason === 'off');
  bell.classList.toggle('paused', d.reason === 'snoozed' || d.reason === 'quiet');
  const label =
    d.reason === 'off'
      ? t('sidebar.bellOff')
      : d.reason === 'snoozed'
        ? t('sidebar.bellSnoozed', { until: d.snoozeLabel })
        : d.reason === 'quiet'
          ? t('sidebar.bellQuiet')
          : t('sidebar.bellOn');
  bell.innerHTML = `${d.on ? ICON.bell : d.reason === 'quiet' ? ICON.moon : ICON.bellOff}<span class="b-text">${esc(label)}</span><span class="dot"></span>`;
  bell.title = label;
}

function bellMenu() {
  const d = S.delivery;
  const m = $('#menu-bell');
  const items = [];
  if (d.reason === 'snoozed') items.push([t('bellMenu.unsnooze'), () => api.snooze(0)]);
  else if (d.reason !== 'off') {
    items.push(['label', t('snooze.title')]);
    items.push([t('snooze.hour1'), () => api.snooze(60)]);
    items.push([t('snooze.hour4'), () => api.snooze(240)]);
    items.push([t('snooze.morning'), () => api.snooze('morning')]);
    items.push([t('snooze.forever'), () => api.snooze(-1)]);
  } else items.push([t('bellMenu.enable'), () => api.saveSettings({ notifyStyle: 'popup' })]);
  items.push(['sep']);
  items.push([t('bellMenu.test'), () => testNotification()]);
  items.push([t('bellMenu.history'), () => showView('notifications')]);
  items.push([t('bellMenu.settings'), () => showView('settings')]);
  m.innerHTML = items
    .map(([label, fn], i) => (label === 'sep' ? '<div class="sep"></div>' : label === 'label' ? `<div class="menu-label">${esc(fn)}</div>` : `<button data-i="${i}">${esc(label)}</button>`))
    .join('');
  m.onclick = (e) => {
    const b = e.target.closest('button[data-i]');
    if (!b) return;
    m.classList.add('hidden');
    items[+b.dataset.i][1]();
  };
  m.classList.toggle('hidden');
}

async function testNotification() {
  const style = await api.testNotification();
  snack(style === 'system' ? t('settings.testSystem') : t('settings.testSent'));
}

// --- Liste ----------------------------------------------------------------------------

function setScope(scope, { keepSearch = false } = {}) {
  S.scope = scope;
  save('scope', scope);
  if (!keepSearch && S.search) {
    S.search = '';
    $('#search').value = '';
  }
}

let listToken = 0;
async function loadList({ soft = false, select = null } = {}) {
  if (!soft) S.limit = PAGE;
  const token = ++listToken;
  const keep = soft ? S.items.map((x) => x.id) : [];
  if (select) keep.push(select);
  if (S.selected && soft) keep.push(S.selected);
  const res = await api.query({ ...filterObj(), offset: 0, limit: S.limit, keep });
  if (token !== listToken) return;
  S.items = res.items;
  S.total = res.total;
  const box = $('#items');
  const scroll = box.scrollTop;
  renderList();
  if (soft) box.scrollTop = scroll;
  else box.scrollTop = 0;
}

function renderListHead() {
  $('#list-title').textContent = scopeTitle();
  const unread = scopeUnread();
  const parts = [];
  if (!S.feeds.length) parts.push(t('list.noFeedsYet'));
  else if (S.search) parts.push(t('list.results', { count: S.total, q: S.search }));
  else {
    parts.push(t('list.posts', { count: S.total }));
    if (unread != null) parts.push(unread ? t('list.unread', { count: unread }) : t('list.allRead'));
  }
  $('#list-sub').textContent = parts.join(' · ');
  const btn = $('#btn-unread');
  btn.setAttribute('aria-pressed', String(S.unreadOnly));
  btn.title = S.unreadOnly ? t('list.showAll') : t('list.unreadOnly');
  btn.disabled = S.scope.type === 'unread';
}

function itemRow(it) {
  const feed = S.feedMap.get(it.feedId);
  const thumb = it.image && S.settings.loadImages ? `<img class="i-thumb" src="${esc(it.image)}" alt="" loading="lazy" referrerpolicy="no-referrer">` : '';
  return `<div class="item ${it.read ? '' : 'unread'} ${it.id === S.selected ? 'active' : ''}" data-id="${it.id}" role="option" aria-selected="${it.id === S.selected}">
    <div class="i-meta">${fav(feed)}<span class="i-feed">${esc(displayName(feed))}</span><span class="i-time" data-ts="${it.date}" title="${esc(fullDate(it.date))}">${ago(it.date)}</span>${it.starred ? `<span class="i-star">${ICON.star}</span>` : ''}</div>
    <div class="i-title">${esc(titleOf(it))}</div>
    ${it.summary ? `<div class="i-sum">${esc(it.summary)}</div>` : ''}
    ${thumb}
  </div>`;
}

function renderList() {
  renderListHead();
  const box = $('#items');
  if (!S.feeds.length) {
    box.innerHTML = `<div class="list-empty">${ICON.rss}<b>${esc(t('list.emptyNoFeedsTitle'))}</b><span>${esc(t('list.emptyNoFeedsText'))}</span></div>`;
    return;
  }
  if (!S.items.length) {
    let msg = [t('list.emptyTitle'), ''];
    if (S.search) msg = [t('list.noResultsTitle'), t('list.noResultsText')];
    else if (S.scope.type === 'starred') msg = [t('list.noStarredTitle'), t('list.noStarredText')];
    else if (S.unreadOnly || S.scope.type === 'unread') msg = [t('list.allDoneTitle'), t('list.allDoneText')];
    box.innerHTML = `<div class="list-empty">${S.search ? ICON.search : ICON.inbox}<b>${esc(msg[0])}</b><span>${esc(msg[1])}</span></div>`;
    return;
  }
  let html = '';
  let lastDay = '';
  for (const it of S.items) {
    const day = dayLabel(it.date);
    if (day !== lastDay) {
      html += `<div class="day-head">${esc(day)}</div>`;
      lastDay = day;
    }
    html += itemRow(it);
  }
  if (S.items.length < S.total) html += `<button class="btn ghost small load-more" id="load-more">${esc(t('list.loadMore', { count: S.total - S.items.length }))}</button>`;
  box.innerHTML = html;
}

function updateRow(id) {
  const it = S.items.find((x) => x.id === id);
  const el = $(`.item[data-id="${id}"]`);
  if (!it || !el) return;
  el.outerHTML = itemRow(it);
}

function markActiveRow() {
  for (const el of $$('.item.active')) {
    el.classList.remove('active');
    el.setAttribute('aria-selected', 'false');
  }
  const el = S.selected && $(`.item[data-id="${S.selected}"]`);
  if (el) {
    el.classList.add('active');
    el.setAttribute('aria-selected', 'true');
  }
  return el;
}

async function selectItem(id, { scroll = true } = {}) {
  S.selected = id;
  const row = markActiveRow();
  if (row && scroll) row.scrollIntoView({ block: 'nearest' });
  const it = await api.item(id);
  if (S.selected !== id) return;
  S.article = it;
  renderReader();
  if (it && !it.read && S.settings.markReadOnOpen) setRead([id], true);
}

function setRead(ids, read) {
  for (const id of ids) {
    const it = S.items.find((x) => x.id === id);
    if (it && it.read !== read) {
      it.read = read;
      updateRow(id);
    }
  }
  if (S.article && ids.includes(S.article.id)) {
    S.article.read = read;
    renderReaderBar();
  }
  api.setRead({ ids, read });
}

function toggleStar(id = S.selected) {
  if (!id) return;
  const it = S.items.find((x) => x.id === id) || (S.article?.id === id ? S.article : null);
  if (!it) return;
  const starred = !it.starred;
  it.starred = starred;
  if (S.article?.id === id) S.article.starred = starred;
  updateRow(id);
  renderReaderBar();
  api.setStarred({ id, starred });
}

function move(dir) {
  if (!S.items.length) return;
  const i = S.items.findIndex((x) => x.id === S.selected);
  const next = i < 0 ? (dir > 0 ? 0 : S.items.length - 1) : i + dir;
  if (next < 0 || next >= S.items.length) {
    if (dir > 0 && S.items.length < S.total) loadMore();
    return;
  }
  selectItem(S.items[next].id);
}

async function loadMore() {
  S.limit += PAGE;
  await loadList({ soft: true });
}

async function markAllRead() {
  const n = await api.markAllRead(filterObj());
  for (const it of S.items) it.read = true;
  renderList();
  if (S.article) {
    S.article.read = true;
    renderReaderBar();
  }
  snack(n ? t('list.markedRead', { count: n }) : t('list.nothingUnread'));
}

// --- Okuyucu ---------------------------------------------------------------------------

const ALLOWED = new Set(
  'a abbr address article aside b bdi bdo blockquote br caption cite code col colgroup dd del details dfn div dl dt em figcaption figure h1 h2 h3 h4 h5 h6 hr i img ins kbd li mark ol p picture pre q rp rt ruby s samp section small source span strong sub summary sup table tbody td tfoot th thead time tr u ul var video audio wbr'.split(' ')
);
const DROP = new Set('script style noscript template object embed form input button select textarea link meta base svg math canvas frame frameset head title applet dialog'.split(' '));
const ATTRS = {
  a: ['href', 'title'],
  img: ['src', 'alt', 'title', 'width', 'height', 'srcset', 'sizes'],
  source: ['srcset', 'type', 'media', 'sizes', 'src'],
  video: ['src', 'poster', 'width', 'height'],
  audio: ['src'],
  td: ['colspan', 'rowspan'],
  th: ['colspan', 'rowspan', 'scope'],
  col: ['span'],
  colgroup: ['span'],
  time: ['datetime'],
  abbr: ['title'],
  ol: ['start', 'reversed', 'type'],
  q: ['cite'],
  blockquote: ['cite'],
  details: ['open'],
};

function safeUrl(v, base) {
  const s = String(v || '').trim();
  if (!s) return '';
  try {
    const u = new URL(s, base || undefined);
    if (u.protocol === 'http:' || u.protocol === 'https:' || u.protocol === 'mailto:') return u.href;
    if (u.protocol === 'data:' && /^data:image\/(png|jpe?g|gif|webp|avif);/i.test(s)) return s;
  } catch {
    /* geçersiz adres */
  }
  return '';
}

function safeSrcset(v, base) {
  return String(v || '')
    .split(',')
    .map((part) => {
      const [u, d] = part.trim().split(/\s+/, 2);
      const url = safeUrl(u, base);
      return url ? `${url}${d ? ` ${d}` : ''}` : '';
    })
    .filter(Boolean)
    .join(', ');
}

// Besleme içeriği güvenilmezdir: yalnızca izin verilen etiket/özellikler yeni öğelere kopyalanır.
function sanitize(html, base) {
  const doc = new DOMParser().parseFromString(String(html || ''), 'text/html');
  const out = document.createDocumentFragment();
  const images = S.settings.loadImages !== false;
  const walk = (src, dst) => {
    for (const node of src.childNodes) {
      if (node.nodeType === Node.TEXT_NODE) {
        dst.appendChild(document.createTextNode(node.data));
        continue;
      }
      if (node.nodeType !== Node.ELEMENT_NODE) continue;
      const tag = node.localName;
      if (tag === 'iframe') {
        const url = safeUrl(node.getAttribute('src') || node.getAttribute('data-src'), base);
        if (url && /^https?:/.test(url)) {
          const a = document.createElement('a');
          a.className = 'embed';
          a.href = url;
          a.innerHTML = `${/youtube|youtu\.be|vimeo/.test(url) ? ICON.play : ICON.external}<span>${esc(t('reader.embedded', { host: host(url) }))}</span>`;
          dst.appendChild(a);
        }
        continue;
      }
      if (DROP.has(tag)) continue;
      if (!ALLOWED.has(tag)) {
        walk(node, dst);
        continue;
      }
      if (tag === 'img') {
        const raw = node.getAttribute('data-src') || node.getAttribute('data-lazy-src') || node.getAttribute('src');
        const w = node.getAttribute('width');
        const h = node.getAttribute('height');
        if ((w === '1' && h === '1') || !safeUrl(raw, base)) continue; // izleme pikselleri
        if (!images) {
          const alt = node.getAttribute('alt');
          if (alt) {
            const span = document.createElement('span');
            span.className = 'img-off';
            span.textContent = t('reader.image', { alt });
            dst.appendChild(span);
          }
          continue;
        }
      }
      if ((tag === 'video' || tag === 'source' || tag === 'picture') && !images) continue;
      const el = document.createElement(tag);
      for (const a of ATTRS[tag] || []) {
        let v = node.getAttribute(a);
        if (tag === 'img' && a === 'src') v = node.getAttribute('data-src') || node.getAttribute('data-lazy-src') || v;
        if (v == null) continue;
        if (a === 'href' || a === 'src' || a === 'poster' || a === 'cite') {
          v = safeUrl(v, base);
          if (!v) continue;
        } else if (a === 'srcset') {
          v = safeSrcset(v, base);
          if (!v) continue;
        }
        el.setAttribute(a, v);
      }
      if (tag === 'img') {
        el.loading = 'lazy';
        el.decoding = 'async';
        el.referrerPolicy = 'no-referrer';
      }
      if (tag === 'video' || tag === 'audio') {
        el.controls = true;
        el.preload = 'none';
      }
      walk(node, el);
      dst.appendChild(el);
    }
  };
  walk(doc.body, out);
  return out;
}

function renderReaderBar() {
  const bar = $('#reader .reader-bar');
  const it = S.article;
  if (!bar || !it) return;
  bar.innerHTML = `
    <button class="icon-btn" data-act="toggle-read" title="${esc(it.read ? t('reader.markUnread') : t('reader.markRead'))}">${it.read ? ICON.unread : ICON.read}</button>
    <button class="icon-btn ${it.starred ? 'on' : ''}" data-act="star" title="${esc(it.starred ? t('reader.unstar') : t('reader.star'))}">${ICON.star}</button>
    ${it.comments ? `<button class="icon-btn" data-act="comments" title="${esc(t('reader.comments'))}">${ICON.comments}</button>` : ''}
    ${it.link ? `<button class="btn small" data-act="open" title="${esc(t('reader.openKey'))}">${ICON.external}${esc(t('common.openInBrowser'))}</button>` : ''}`;
}

function keysHtml(compact) {
  const mod = S.info.platform === 'darwin' ? '⌘' : 'Ctrl';
  const k = (...keys) => keys.map((x) => `<kbd>${esc(x)}</kbd>`).join(' ');
  const rows = compact
    ? [
        [k('J', 'K'), t('keys.nextPrev')],
        [k(t('common.space')), t('keys.space')],
        [k('O'), t('keys.open')],
        [k('S', 'M'), t('keys.starUnread')],
        [k('R', 'N'), t('keys.refreshAdd')],
        [k('/'), t('keys.search')],
        [k(mod, ','), t('keys.settings')],
      ]
    : [
        [k('J', 'K'), t('keys.nextPrev')],
        [k(t('common.space')), t('keys.space')],
        [k('O'), t('keys.open')],
        [k('S'), t('keys.star')],
        [k('M'), t('keys.toggleRead')],
        [k('Shift', 'A'), t('keys.markAll')],
        [k('R'), t('keys.refresh')],
        [k('N'), t('keys.add')],
        [k('/'), t('keys.search')],
        [k(mod, ','), t('keys.settings')],
        [`${k(mod, '1')}–${k('4')}`, t('keys.views')],
        [`${k(mod, 'N')} · ${k(mod, 'R')}`, t('keys.addRefreshAll')],
      ];
  return `<div class="keys">${rows.map(([a, b]) => `<span>${a}</span><span>${esc(b)}</span>`).join('')}</div>`;
}

function renderReader() {
  const box = $('#reader');
  if (!S.feeds.length) {
    box.innerHTML = `<div class="welcome">
      <img src="../assets/icon.png" alt="" width="64" height="64">
      <h1>${esc(t('welcome.title'))}</h1>
      <p>${esc(t('welcome.p1'))}</p>
      <p>${esc(t('welcome.p2'))}</p>
      <div class="btn-row"><button class="btn" data-add>${esc(t('common.addFeed'))}</button><button class="btn ghost" data-view="settings">${esc(t('common.settings'))}</button></div>
      <div class="suggest"><div class="suggest-label">${esc(t('welcome.quickStart'))}</div><div class="chips">${SUGGESTIONS.map((s) => `<button data-suggest="${esc(s.url)}">${esc(s.title)}</button>`).join('')}</div></div>
    </div>`;
    return;
  }
  const it = S.article;
  if (!it) {
    box.innerHTML = `<div class="reader-empty">${ICON.book}<b>${esc(t('reader.pick'))}</b><span>${esc(t('reader.keyboardHint'))}</span>${keysHtml(true)}</div>`;
    return;
  }
  const feed = it.feed || S.feedMap.get(it.feedId);
  const base = it.link || feed?.siteUrl || feed?.url;
  const showHero = it.image && S.settings.loadImages && !String(it.html || '').includes(it.image.split('?')[0]);
  const enc = it.enclosure;
  let media = '';
  if (enc && /^audio\//.test(enc.type)) media = `<audio class="art-media" controls preload="none" src="${esc(safeUrl(enc.url))}"></audio>`;
  else if (enc && /^video\//.test(enc.type) && S.settings.loadImages) media = `<video class="art-media" controls preload="none" src="${esc(safeUrl(enc.url))}"></video>`;
  const title = it.link ? `<a href="${esc(it.link)}">${esc(titleOf(it))}</a>` : esc(titleOf(it));
  box.innerHTML = `
    <div class="reader-bar"></div>
    <article class="article">
      <div class="art-meta">
        <button class="art-feed" data-act="feed">${fav(feed)}${esc(displayName(feed))}</button>
        <span>·</span><time datetime="${new Date(it.date).toISOString()}">${esc(fullDate(it.date))}</time>
        ${it.author ? `<span>·</span><span>${esc(it.author)}</span>` : ''}
      </div>
      <h1 class="art-title">${title}</h1>
      ${showHero ? `<img class="art-hero" src="${esc(it.image)}" alt="" referrerpolicy="no-referrer">` : ''}
      ${media}
      <div class="art-body" id="art-body"></div>
      ${
        it.link || it.comments
          ? `<div class="art-end">${it.link ? `<button class="btn" data-act="open">${ICON.external}${esc(t('reader.readOnSite'))}</button>` : ''}${
              it.comments ? `<button class="btn ghost" data-act="comments">${ICON.comments}${esc(t('reader.comments'))}</button>` : ''
            }</div>`
          : ''
      }
    </article>`;
  renderReaderBar();
  const body = $('#art-body');
  const frag = sanitize(it.html, base);
  if (frag.textContent.trim() || frag.querySelector?.('img, video, audio')) body.appendChild(frag);
  else body.innerHTML = `<p class="art-empty">${esc(t('reader.noContent'))}</p>`;
  box.scrollTop = 0;
}

function readerAction(act) {
  const it = S.article;
  if (!it) return;
  if (act === 'open' && it.link) {
    api.openExternal(it.link);
    if (!it.read) setRead([it.id], true);
  } else if (act === 'comments' && it.comments) api.openExternal(it.comments);
  else if (act === 'star') toggleStar(it.id);
  else if (act === 'toggle-read') setRead([it.id], !it.read);
  else if (act === 'feed') openScope({ type: 'feed', feedId: it.feedId });
}

// --- Görünümler -----------------------------------------------------------------------------

function showView(view) {
  if (view !== 'notifications') freshNotifs.clear();
  S.view = view;
  const reader = view === 'reader';
  $('#list-pane').classList.toggle('hidden', !reader);
  $('#reader').classList.toggle('hidden', !reader);
  $('#page-notifications').classList.toggle('hidden', view !== 'notifications');
  $('#page-settings').classList.toggle('hidden', view !== 'settings');
  renderSidebar();
  if (view === 'notifications') renderNotifications();
  if (view === 'settings') renderSettings();
}

async function openScope(scope) {
  setScope(scope);
  S.selected = null;
  S.article = null;
  if (S.view !== 'reader') showView('reader');
  else renderSidebar();
  renderReader();
  await loadList();
}

// Uygulama menüsünden ve menü çubuğu panelinden gelen komutlar.
function runCommand(cmd) {
  const i = cmd.indexOf(':');
  const name = i < 0 ? cmd : cmd.slice(0, i);
  const arg = i < 0 ? '' : cmd.slice(i + 1);
  if (name === 'add') {
    if (S.view !== 'reader') showView('reader');
    return openAdd();
  }
  if (name === 'find') {
    if (S.view !== 'reader') showView('reader');
    $('#search').focus();
    $('#search').select();
    return;
  }
  if (name === 'scope') return openScope({ type: arg });
  if (name === 'view') return showView(arg);
  if (name === 'mark-all-read') return S.view === 'reader' ? markAllRead() : undefined;
  if (name === 'import') return importOpml();
  if (name === 'export') return exportOpml();
}

async function navigate(nav) {
  if (!nav) return;
  if (nav.command) return runCommand(nav.command);
  if (nav.view && nav.view !== 'reader') return showView(nav.view);
  if (nav.feed) return openScope({ type: 'feed', feedId: nav.feed });
  if (nav.item) {
    const it = await api.item(nav.item);
    if (!it) return snack(t('reader.postGone'));
    if (S.view !== 'reader') showView('reader');
    if (!S.items.some((x) => x.id === it.id)) {
      setScope({ type: 'feed', feedId: it.feedId });
      renderSidebar();
      await loadList({ select: it.id });
    }
    await selectItem(it.id);
    return;
  }
  showView('reader');
}

// --- Bildirim geçmişi -------------------------------------------------------------------------

const SILENT = {
  quiet: ['notifications.silentQuiet', ICON.moon],
  snoozed: ['notifications.silentSnoozed', ICON.bellOff],
  off: ['notifications.silentOff', ICON.bellOff],
};

let notifFilter = '';
// Sayfa açıkken görüldü sayılan bildirimler, sayfadan çıkana kadar vurgulu kalır.
const freshNotifs = new Set();
async function renderNotifications() {
  const list = await api.notifications();
  if (S.view !== 'notifications') return;
  for (const n of list) if (!n.seen) freshNotifs.add(n.id);
  const page = $('#page-notifications');
  const d = S.delivery;
  const style = { popup: t('notifications.stylePopup'), system: t('notifications.styleSystem'), both: t('notifications.styleBoth') }[S.settings.notifyStyle] || '';
  const status =
    d.reason === 'off'
      ? [t('notifications.statusOffTitle'), t('notifications.statusOffText')]
      : d.reason === 'snoozed'
        ? [t('notifications.statusSnoozedTitle', { until: d.snoozeLabel }), t('notifications.statusSnoozedText')]
        : d.reason === 'quiet'
          ? [t('notifications.statusQuietTitle'), t('notifications.statusQuietText', { start: S.settings.quietStart, end: S.settings.quietEnd })]
          : [t('notifications.statusOnTitle'), t('notifications.statusOnText', { style, min: S.settings.refreshMin })];
  const nameOf = (id, fallback) => (S.feedMap.has(id) ? displayName(S.feedMap.get(id)) : fallback || t('common.deletedFeed'));
  const feedsInHistory = [...new Map(list.map((n) => [n.feedId, n.feedTitle])).entries()].sort((a, b) => compare(nameOf(a[0], a[1]), nameOf(b[0], b[1])));
  if (notifFilter && !feedsInHistory.some(([id]) => id === notifFilter)) notifFilter = '';
  const shown = notifFilter ? list.filter((n) => n.feedId === notifFilter) : list;

  let groups = '';
  let day = '';
  let open = false;
  for (const n of shown) {
    const label = dayLabel(n.ts);
    if (label !== day) {
      if (open) groups += '</div></section>';
      groups += `<section class="n-day"><h4>${esc(label)}</h4><div class="n-list">`;
      day = label;
      open = true;
    }
    const feed = S.feedMap.get(n.feedId);
    const silent = SILENT[n.silent];
    const items = n.items
      .slice(0, 5)
      .map((x) => {
        const title = x.title || t('common.untitled');
        return `<li><button data-nitem="${esc(x.id)}" data-link="${esc(x.link)}" class="${x.gone ? 'gone' : x.read ? 'read' : ''}" title="${esc(x.gone ? `${title} ${t('notifications.gone')}` : title)}">${esc(title)}</button></li>`;
      })
      .join('');
    const more = n.count > 5 ? `<li class="n-more">${esc(t('notifications.more', { count: n.count - 5 }))}</li>` : '';
    groups += `<div class="notif ${freshNotifs.has(n.id) ? 'unseen' : ''}">
      <div>${fav(feed, 'big', n.feedTitle)}</div>
      <div>
        <div class="n-head">
          <button class="n-feed" data-nfeed="${esc(n.feedId)}" ${feed ? '' : 'disabled'}>${esc(nameOf(n.feedId, n.feedTitle))}</button>
          <span class="n-time">${clock(n.ts)}</span>
          ${n.count > 1 ? `<span class="n-count">· ${esc(t('notifications.newPosts', { count: n.count }))}</span>` : ''}
          ${silent ? `<span class="chip">${silent[1]}${esc(t(silent[0]))}</span>` : ''}
        </div>
        <ul class="n-items">${items}${more}</ul>
      </div>
    </div>`;
  }
  if (open) groups += '</div></section>';

  const snoozeMenu = `<button class="btn ghost small" id="nsnooze">${esc(t('notifications.snooze'))}</button><div class="menu down hidden" id="nsnooze-menu">
    <button data-snooze="60">${esc(t('snooze.hour1'))}</button><button data-snooze="240">${esc(t('snooze.hour4'))}</button>
    <button data-snooze="morning">${esc(t('snooze.morning'))}</button><button data-snooze="-1">${esc(t('snooze.forever'))}</button></div>`;
  page.innerHTML = `
    <header class="page-head">
      <div><h1>${esc(t('notifications.title'))}</h1><div class="sub">${esc(list.length ? t('notifications.sub', { count: list.length }) : t('notifications.none'))}</div></div>
      <div class="toolbar">
        ${
          feedsInHistory.length > 1
            ? `<select class="select" id="nfilter"><option value="">${esc(t('notifications.allFeeds'))}</option>${feedsInHistory
                .map(([id, title]) => `<option value="${esc(id)}" ${id === notifFilter ? 'selected' : ''}>${esc(nameOf(id, title))}</option>`)
                .join('')}</select>`
            : ''
        }
        ${list.length ? `<button class="btn ghost small" id="nclear">${esc(t('notifications.clear'))}</button>` : ''}
      </div>
    </header>
    <div class="page-body">
      <div class="card status-card">
        <div class="st-icon">${d.on ? ICON.bell : d.reason === 'quiet' ? ICON.moon : ICON.bellOff}</div>
        <div class="st-text"><b>${esc(status[0])}</b><span>${esc(status[1])}</span></div>
        <div class="btn-row">
          <div class="menu-wrap">${
            d.reason === 'snoozed'
              ? `<button class="btn small" id="nunsnooze">${esc(t('notifications.unsnooze'))}</button>`
              : d.reason === 'off'
                ? `<button class="btn small" id="nenable">${esc(t('notifications.enable'))}</button>`
                : snoozeMenu
          }</div>
          <button class="btn ghost small" id="ntest">${esc(t('notifications.test'))}</button>
          <button class="btn ghost small" data-view="settings">${esc(t('common.settings'))}</button>
        </div>
      </div>
      ${shown.length ? groups : `<div class="page-empty">${ICON.bell}<b>${esc(t('notifications.emptyTitle'))}</b><span>${esc(t('notifications.emptyText'))}</span></div>`}
    </div>`;

  $('#nfilter')?.addEventListener('change', (e) => {
    notifFilter = e.target.value;
    renderNotifications();
  });
  $('#nclear')?.addEventListener('click', async () => {
    if (await api.clearNotifications()) renderNotifications();
  });
  $('#ntest').addEventListener('click', () => testNotification());
  $('#nunsnooze')?.addEventListener('click', () => api.snooze(0));
  $('#nenable')?.addEventListener('click', () => api.saveSettings({ notifyStyle: 'popup' }));
  $('#nsnooze')?.addEventListener('click', () => $('#nsnooze-menu').classList.toggle('hidden'));
  $('#nsnooze-menu')?.addEventListener('click', (e) => {
    const b = e.target.closest('[data-snooze]');
    if (!b) return;
    const v = b.dataset.snooze;
    api.snooze(v === 'morning' ? v : +v);
  });
  // Sayfaya bakıldı: görülmemiş işaretleri bu görünümde kalır, rozet sıfırlanır.
  if (list.some((n) => !n.seen)) api.notificationsSeen();
}

$('#page-notifications').addEventListener('click', async (e) => {
  const item = e.target.closest('[data-nitem]');
  if (item) {
    if (item.classList.contains('gone')) {
      if (item.dataset.link) api.openExternal(item.dataset.link);
      else snack(t('reader.postGone'));
      return;
    }
    return navigate({ item: item.dataset.nitem });
  }
  const feed = e.target.closest('[data-nfeed]');
  if (feed) openScope({ type: 'feed', feedId: feed.dataset.nfeed });
});

// --- Ayarlar ---------------------------------------------------------------------------------------

function opt(value, label, current) {
  return `<option value="${esc(value)}" ${String(value) === String(current) ? 'selected' : ''}>${esc(label)}</option>`;
}

function seg(key, current, options) {
  return `<span class="seg" role="radiogroup">${options
    .map(([v, label]) => `<button type="button" role="radio" aria-checked="${v === current}" class="${v === current ? 'on' : ''}" data-seg="${key}" data-value="${esc(v)}">${esc(label)}</button>`)
    .join('')}</span>`;
}

function themeCards(current) {
  return `<div class="themes" role="radiogroup">${THEMES.map(
    (id) => `<button type="button" class="theme-card ${id === current ? 'on' : ''}" data-theme-pick="${id}" role="radio" aria-checked="${id === current}">
      <span class="tc-prev" data-theme="${id}"><span class="p-side"><i></i><i></i><i></i></span><span class="p-main"><b></b><i></i><i></i><u></u></span></span>
      <span class="tc-name">${esc(t(`themes.${id}`))}${id === 'ember' ? ` <small>${esc(t('settings.defaultTheme'))}</small>` : ''}<span class="tc-check">${ICON.check}</span></span>
    </button>`
  ).join('')}</div>`;
}

function renderSettings() {
  const s = S.settings;
  const mac = S.info.platform === 'darwin';
  const off = s.notifyStyle === 'off';
  const popup = s.notifyStyle === 'popup' || s.notifyStyle === 'both';
  const langs = api.i18n.languages || [];
  const systemLang = langs.find((l) => l.code === api.i18n.systemLanguage);
  const testHint =
    s.notifyStyle === 'system' || s.notifyStyle === 'both' ? (mac ? t('settings.tryItHintMac') : t('settings.tryItHintWin')) : t('settings.tryItHint');
  $('#page-settings').innerHTML = `
    <header class="page-head"><div><h1>${esc(t('settings.title'))}</h1><div class="sub">${esc(t('settings.sub'))}</div></div></header>
    <div class="page-body settings">
      <section class="card">
        <h3>${esc(t('settings.notificationsTitle'))}</h3>
        <p class="desc">${esc(t('settings.notificationsDesc'))}</p>
        <div class="row"><span>${esc(t('settings.notifyStyle'))}<small>${esc(t('settings.notifyStyleHint'))}</small></span>
          <select data-set="notifyStyle">${opt('popup', t('settings.stylePopup'), s.notifyStyle)}${opt('system', t('settings.styleSystem'), s.notifyStyle)}${opt('both', t('settings.styleBoth'), s.notifyStyle)}${opt('off', t('settings.styleOff'), s.notifyStyle)}</select></div>
        <div class="row ${!popup ? 'disabled' : ''}"><span>${esc(t('settings.popupPosition'))}</span>
          <select data-set="popupPosition" ${!popup ? 'disabled' : ''}>${opt('top-right', t('settings.topRight'), s.popupPosition)}${opt('bottom-right', t('settings.bottomRight'), s.popupPosition)}${opt('top-left', t('settings.topLeft'), s.popupPosition)}${opt('bottom-left', t('settings.bottomLeft'), s.popupPosition)}</select></div>
        <div class="row ${!popup ? 'disabled' : ''}"><span>${esc(t('settings.popupSeconds'))}<small>${esc(t('settings.popupSecondsHint'))}</small></span>
          <select data-set="popupSeconds" data-num ${!popup ? 'disabled' : ''}>${[5, 8, 15, 30].map((n) => opt(n, t('settings.seconds', { count: n }), s.popupSeconds)).join('')}${opt(0, t('settings.untilClosed'), s.popupSeconds)}</select></div>
        <div class="row ${off ? 'disabled' : ''}"><span>${esc(t('settings.sound'))}</span><input type="checkbox" class="switch" data-set="sound" ${s.sound ? 'checked' : ''} ${off ? 'disabled' : ''}></div>
        <div class="row ${off ? 'disabled' : ''}"><span>${esc(t('settings.quietHours'))}<small>${esc(t('settings.quietHoursHint'))}</small></span>
          <span class="inline">
            <input type="time" data-set="quietStart" value="${esc(s.quietStart)}" ${!s.quietHours || off ? 'disabled' : ''}> –
            <input type="time" data-set="quietEnd" value="${esc(s.quietEnd)}" ${!s.quietHours || off ? 'disabled' : ''}>
            <input type="checkbox" class="switch" data-set="quietHours" ${s.quietHours ? 'checked' : ''} ${off ? 'disabled' : ''}>
          </span></div>
        <div class="row"><span>${esc(t('settings.tryIt'))}<small>${esc(testHint)}</small></span><button class="btn ghost small" id="set-test">${esc(t('settings.sendTest'))}</button></div>
      </section>

      <section class="card">
        <h3>${esc(t('settings.appearanceTitle'))}</h3>
        <div class="row"><span>${esc(t('settings.mode'))}</span>${seg('theme', s.theme, [
          ['system', t('settings.modeSystem')],
          ['light', t('settings.modeLight')],
          ['dark', t('settings.modeDark')],
        ])}</div>
        <div class="row" style="flex-direction:column;align-items:stretch"><span>${esc(t('settings.theme'))}<small>${esc(t('settings.themeHint'))}</small></span>${themeCards(s.colorTheme)}</div>
        <div class="row"><span>${esc(t('settings.readerFont'))}</span>${seg('readerFont', s.readerFont, [
          ['sans', t('settings.fontSans')],
          ['serif', t('settings.fontSerif')],
        ])}</div>
        <div class="row"><span>${esc(t('settings.readerSize'))}</span>${seg('readerSize', s.readerSize, [
          ['small', t('settings.sizeSmall')],
          ['medium', t('settings.sizeMedium')],
          ['large', t('settings.sizeLarge')],
          ['xlarge', t('settings.sizeXLarge')],
        ])}</div>
        <div class="row"><span>${esc(t('settings.language'))}<small>${esc(t('settings.languageHint'))}</small></span>
          <select data-set="language">${opt('system', t('settings.languageSystem', { name: systemLang ? systemLang.name : 'English' }), s.language)}${langs
            .map((l) => opt(l.code, l.name === l.englishName ? l.name : `${l.name} — ${l.englishName}`, s.language))
            .join('')}</select></div>
      </section>

      <section class="card">
        <h3>${esc(t('settings.refreshTitle'))}</h3>
        <div class="row"><span>${esc(t('settings.interval'))}<small>${esc(t('settings.intervalHint'))}</small></span>
          <select data-set="refreshMin" data-num>${[5, 10, 15, 30, 60, 180]
            .map((m) => opt(m, m < 60 ? t('settings.everyMinutes', { count: m }) : t('settings.everyHours', { count: m / 60 }), s.refreshMin))
            .join('')}</select></div>
        <div class="row"><span>${esc(t('settings.checkNow'))}</span><button class="btn ghost small" id="set-refresh">${esc(t('common.refreshNow'))}</button></div>
      </section>

      <section class="card">
        <h3>${esc(t('settings.readingTitle'))}</h3>
        <div class="row"><span>${esc(t('settings.markReadOnOpen'))}</span><input type="checkbox" class="switch" data-set="markReadOnOpen" ${s.markReadOnOpen ? 'checked' : ''}></div>
        <div class="row"><span>${esc(t('settings.loadImages'))}<small>${esc(t('settings.loadImagesHint'))}</small></span><input type="checkbox" class="switch" data-set="loadImages" ${s.loadImages ? 'checked' : ''}></div>
        <div class="row"><span>${esc(t('settings.retention'))}<small>${esc(t('settings.retentionHint'))}</small></span>
          <select data-set="retentionDays" data-num>${[7, 30, 90].map((n) => opt(n, t('settings.olderThanDays', { count: n }), s.retentionDays)).join('')}${opt(365, t('settings.olderThanYear'), s.retentionDays)}${opt(0, t('settings.never'), s.retentionDays)}</select></div>
      </section>

      <section class="card">
        <h3>${esc(t('settings.appTitle'))}</h3>
        <div class="row"><span>${esc(t('settings.launchAtLogin'))}<small>${esc(t('settings.launchAtLoginHint'))}</small></span><input type="checkbox" class="switch" data-set="launchAtLogin" ${s.launchAtLogin ? 'checked' : ''} ${S.info.demo ? 'disabled' : ''}></div>
        <div class="row"><span>${esc(mac ? t('settings.trayMac') : t('settings.trayWin'))}<small>${esc(t('settings.trayHint'))}</small></span><button class="btn ghost small" id="set-panel">${esc(t('settings.showPanel'))}</button></div>
        <div class="row"><span>${esc(t('settings.showCount'))}<small>${esc(mac ? t('settings.showCountHintMac') : t('settings.showCountHintWin'))}</small></span><input type="checkbox" class="switch" data-set="showCount" ${s.showCount ? 'checked' : ''}></div>
      </section>

      <section class="card">
        <h3>${esc(t('settings.subscriptionsTitle'))}</h3>
        <p class="desc">${esc(t('settings.subscriptionsDesc', { count: S.feeds.length }))}</p>
        <div class="btn-row" style="margin-top:10px">
          <button class="btn ghost small" id="set-import">${esc(t('settings.importOpml'))}</button>
          <button class="btn ghost small" id="set-export" ${S.feeds.length ? '' : 'disabled'}>${esc(t('settings.exportOpml'))}</button>
          <button class="btn ghost small" id="set-data">${esc(t('settings.openData'))}</button>
        </div>
      </section>

      <section class="card keys-card">
        <h3>${esc(t('settings.shortcutsTitle'))}</h3>
        ${keysHtml(false)}
      </section>
      <p class="muted small">${esc(t('settings.footer', { version: S.info.version || '', demo: S.info.demo ? t('settings.demoMode') : '', dir: S.info.dataDir || '' }))}</p>
    </div>`;

  const page = $('#page-settings');
  for (const el of $$('[data-set]', page)) {
    el.addEventListener('change', async () => {
      const key = el.dataset.set;
      let v = el.type === 'checkbox' ? el.checked : el.value;
      if ('num' in el.dataset) v = Number(v);
      await saveSetting(key, v);
    });
  }
  page.onclick = async (e) => {
    const b = e.target.closest('[data-seg], [data-theme-pick]');
    if (!b) return;
    if (b.dataset.themePick) await saveSetting('colorTheme', b.dataset.themePick);
    else await saveSetting(b.dataset.seg, b.dataset.value);
  };
  $('#set-test').addEventListener('click', () => testNotification());
  $('#set-panel').addEventListener('click', () => api.showPanel());
  $('#set-refresh').addEventListener('click', () => refresh());
  $('#set-import').addEventListener('click', () => importOpml());
  $('#set-export').addEventListener('click', () => exportOpml());
  $('#set-data').addEventListener('click', () => api.openData());
}

async function saveSetting(key, value) {
  // Dil değişince ana süreç pencereyi yeni dille yeniden yükler.
  S.settings = await api.saveSettings({ [key]: value });
  applyAppearance(S.settings);
  if (['notifyStyle', 'quietHours', 'loadImages', 'theme', 'colorTheme', 'readerFont', 'readerSize'].includes(key)) {
    const scroll = $('#page-settings').scrollTop;
    renderSettings();
    $('#page-settings').scrollTop = scroll;
  }
  if (key === 'loadImages') {
    renderList();
    renderReader();
  }
}

async function importOpml() {
  const r = await api.importOpml();
  if (!r) return;
  if (r.error) return snack(r.error, 5000);
  snack(
    r.added
      ? t('settings.opmlAdded', { count: r.added }) + (r.skipped ? t('settings.opmlSkipped', { count: r.skipped }) : '') + t('settings.opmlDownloading')
      : t('settings.opmlNothing'),
    5000
  );
  if (S.view === 'settings') renderSettings();
}

async function exportOpml() {
  if (!S.feeds.length) return snack(t('settings.noFeedsToExport'));
  const r = await api.exportOpml();
  if (r) snack(t('settings.exported', { count: r.count }));
}

// --- Kaynak ekle ----------------------------------------------------------------------------------

const dlgAdd = $('#dlg-add');
const formAdd = $('#form-add');
let addBusy = false;

function renderSuggestions() {
  const have = new Set(S.feeds.map((f) => f.url.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '')));
  const list = SUGGESTIONS.filter((s) => !have.has(s.url.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '')));
  $('#suggest-wrap').classList.toggle('hidden', !list.length);
  $('#suggest').innerHTML = list.map((s) => `<button type="button" data-suggest="${esc(s.url)}">${esc(s.title)}</button>`).join('');
}

function openAdd(url = '') {
  if (dlgAdd.open) return;
  formAdd.reset();
  formAdd.url.value = url;
  if (S.scope.type === 'folder') formAdd.folder.value = S.scope.folder;
  $('#add-error').classList.add('hidden');
  $('#add-choices').classList.add('hidden');
  $('#add-choices').innerHTML = '';
  $('#add-submit').textContent = t('common.add');
  renderSuggestions();
  dlgAdd.showModal();
  formAdd.url.focus();
}

async function submitAdd(urlOverride) {
  if (addBusy) return;
  const chosen = formAdd.querySelector('input[name="choice"]:checked');
  const url = urlOverride || (chosen && !$('#add-choices').classList.contains('hidden') ? chosen.value : formAdd.url.value.trim());
  const err = $('#add-error');
  if (!url) {
    err.textContent = t('addDialog.needUrl');
    err.classList.remove('hidden');
    formAdd.url.focus();
    return;
  }
  addBusy = true;
  const btn = $('#add-submit');
  const prev = btn.textContent;
  btn.disabled = true;
  btn.textContent = t('addDialog.checking');
  err.classList.add('hidden');
  const r = await api.addFeed({ url, folder: formAdd.folder.value.trim(), notify: formAdd.notify.checked });
  addBusy = false;
  btn.disabled = false;
  btn.textContent = prev;
  if (r.error) {
    err.textContent = r.error;
    err.classList.remove('hidden');
    return;
  }
  if (r.choices) {
    const box = $('#add-choices');
    box.innerHTML = `<div class="c-label">${esc(t('addDialog.choices', { count: r.choices.length }))}</div>${r.choices
      .map(
        (c, i) =>
          `<label><input type="radio" name="choice" value="${esc(c.url)}" ${i === 0 ? 'checked' : ''}><span class="t">${esc(choiceTitle(c))}</span><span class="u">${esc(c.url)}</span></label>`
      )
      .join('')}`;
    box.classList.remove('hidden');
    btn.textContent = t('addDialog.submitChosen');
    return;
  }
  dlgAdd.close();
  snack(t('addDialog.added', { name: displayName(r.feed) }));
  applyState(await api.state());
  openScope({ type: 'feed', feedId: r.feed.id });
}

const GITHUB_KINDS = { releases: t('addDialog.githubReleases'), tags: t('addDialog.githubTags'), commits: t('addDialog.githubCommits') };
const choiceTitle = (c) => (c.kind ? `${c.title} · ${GITHUB_KINDS[c.kind] || c.kind}` : c.title || host(c.url));

formAdd.addEventListener('submit', (e) => {
  e.preventDefault();
  submitAdd();
});
formAdd.url.addEventListener('input', () => {
  $('#add-choices').classList.add('hidden');
  $('#add-submit').textContent = t('common.add');
});
$('#suggest').addEventListener('click', (e) => {
  const b = e.target.closest('[data-suggest]');
  if (!b) return;
  formAdd.url.value = b.dataset.suggest;
  submitAdd(b.dataset.suggest);
});

// --- Kaynak ayarları --------------------------------------------------------------------------------

const dlgFeed = $('#dlg-feed');
const formFeed = $('#form-feed');
let editing = null;

function openFeedDialog(id) {
  const f = S.feedMap.get(id);
  if (!f) return;
  editing = id;
  $('#feed-fav').innerHTML = fav(f, 'big');
  $('#feed-title').textContent = displayName(f);
  const err = feedError(f);
  const status = err
    ? `<span class="err">${esc(t('feedDialog.lastError', { time: f.lastFetch ? clock(f.lastFetch) : '', error: err }))}</span>`
    : f.lastOk
      ? `<span>${esc(t('feedDialog.lastOk', { date: fullDate(f.lastOk) }))}</span>`
      : `<span>${esc(t('feedDialog.neverChecked'))}</span>`;
  $('#feed-meta').innerHTML = `<span class="url" title="${esc(f.url)}">${esc(f.url)}</span>${status}
    <span class="links">${f.siteUrl ? `<button type="button" data-fact="site">${esc(t('feedDialog.openSite'))}</button>` : ''}<button type="button" data-fact="refresh">${esc(
      t('common.refreshNow')
    )}</button><button type="button" data-fact="read">${esc(t('feedDialog.markAllRead'))}</button></span>`;
  formFeed.name.value = f.name || '';
  formFeed.name.placeholder = f.title || host(f.url);
  formFeed.folder.value = f.folder || '';
  formFeed.notify.checked = f.notify !== false;
  formFeed.keywords.value = f.keywords || '';
  dlgFeed.showModal();
}

formFeed.addEventListener('submit', async (e) => {
  e.preventDefault();
  if (!editing) return;
  await api.updateFeed({
    id: editing,
    patch: { name: formFeed.name.value.trim(), folder: formFeed.folder.value.trim(), notify: formFeed.notify.checked, keywords: formFeed.keywords.value.trim() },
  });
  dlgFeed.close();
  snack(t('feedDialog.saved'));
});

$('#feed-delete').addEventListener('click', async () => {
  if (!editing) return;
  const ok = await api.removeFeed(editing);
  if (!ok) return;
  dlgFeed.close();
  if (S.scope.type === 'feed' && S.scope.feedId === editing) openScope({ type: 'all' });
  snack(t('feedDialog.deleted'));
});

$('#feed-meta').addEventListener('click', async (e) => {
  const b = e.target.closest('[data-fact]');
  if (!b || !editing) return;
  const f = S.feedMap.get(editing);
  if (b.dataset.fact === 'site') api.openExternal(f.siteUrl);
  if (b.dataset.fact === 'refresh') {
    api.refresh([editing]);
    snack(t('feedDialog.refreshing', { name: displayName(f) }));
  }
  if (b.dataset.fact === 'read') {
    const n = await api.markAllRead({ scope: 'feed', feedId: editing });
    snack(t('list.markedRead', { count: n }));
  }
});

for (const d of [dlgAdd, dlgFeed]) {
  d.addEventListener('click', (e) => {
    if (e.target === d || e.target.closest('[data-close]')) d.close();
  });
}

// --- Olaylar --------------------------------------------------------------------------------------------

function refresh() {
  if (!S.feeds.length) return openAdd();
  api.refresh();
}

document.addEventListener('click', (e) => {
  const el = e.target;
  if (!el.closest('#btn-bell') && !el.closest('#menu-bell')) $('#menu-bell').classList.add('hidden');
  if (!el.closest('#nsnooze') && !el.closest('#nsnooze-menu')) $('#nsnooze-menu')?.classList.add('hidden');

  const add = el.closest('[data-add]');
  if (add) return openAdd();
  const sug = el.closest('[data-suggest]');
  if (sug && !sug.closest('#dlg-add')) {
    openAdd(sug.dataset.suggest);
    submitAdd(sug.dataset.suggest);
    return;
  }
  const view = el.closest('[data-view]');
  if (view && !view.closest('dialog')) return showView(view.dataset.view);
  const scope = el.closest('.nav-item[data-scope]');
  if (scope) return openScope({ type: scope.dataset.scope });

  // Okuyucudaki bağlantılar her zaman varsayılan tarayıcıda açılır.
  const a = el.closest('#reader a[href]');
  if (a) {
    e.preventDefault();
    api.openExternal(a.href);
    return;
  }
  const act = el.closest('#reader [data-act]');
  if (act) return readerAction(act.dataset.act);
});

$('#btn-add').addEventListener('click', () => openAdd());
$('#btn-bell').addEventListener('click', () => bellMenu());
$('#btn-refresh').addEventListener('click', () => refresh());
$('#btn-unread').addEventListener('click', () => {
  S.unreadOnly = !S.unreadOnly;
  save('unreadOnly', S.unreadOnly);
  loadList();
});
$('#btn-markall').addEventListener('click', () => markAllRead());

$('#feeds').addEventListener('click', (e) => {
  const toggle = e.target.closest('[data-toggle]');
  if (toggle) {
    const name = toggle.dataset.toggle;
    if (S.collapsed.has(name)) S.collapsed.delete(name);
    else S.collapsed.add(name);
    save('collapsed', [...S.collapsed]);
    toggle.closest('.folder').classList.toggle('collapsed');
    return;
  }
  const more = e.target.closest('[data-more]');
  if (more) return openFeedDialog(more.dataset.more);
  const feed = e.target.closest('[data-feed]');
  if (feed) return openScope({ type: 'feed', feedId: feed.dataset.feed });
  const folder = e.target.closest('[data-folder]');
  if (folder) return openScope({ type: 'folder', folder: folder.dataset.folder });
});
$('#feeds').addEventListener('contextmenu', (e) => {
  const feed = e.target.closest('[data-feed]');
  if (!feed) return;
  e.preventDefault();
  openFeedDialog(feed.dataset.feed);
});

$('#items').addEventListener('click', (e) => {
  if (e.target.closest('#load-more')) return loadMore();
  const row = e.target.closest('.item');
  if (row) selectItem(row.dataset.id, { scroll: false });
});
let loadingMore = false;
$('#items').addEventListener('scroll', (e) => {
  const el = e.target;
  if (S.items.length < S.total && el.scrollTop + el.clientHeight > el.scrollHeight - 400 && !loadingMore) {
    loadingMore = true;
    loadMore().finally(() => (loadingMore = false));
  }
});

$('#reader').addEventListener('scroll', (e) => {
  $('#reader .reader-bar')?.classList.toggle('scrolled', e.target.scrollTop > 4);
});

let searchTimer = null;
$('#search').addEventListener('input', (e) => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => {
    S.search = e.target.value.trim();
    loadList();
  }, 180);
});
$('#search').addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    e.target.value = '';
    S.search = '';
    loadList();
    e.target.blur();
  } else if (e.key === 'Enter' || e.key === 'ArrowDown') {
    e.preventDefault();
    e.target.blur();
    if (S.items.length) selectItem(S.items[0].id);
  }
});

document.addEventListener('keydown', (e) => {
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  if (e.target.closest('input, textarea, select, [contenteditable="true"]') || $('dialog[open]')) return;
  if (e.key === 'Escape') {
    $('#menu-bell').classList.add('hidden');
    if (S.view !== 'reader') showView('reader');
    return;
  }
  if (e.key === 'n') return (e.preventDefault(), openAdd());
  if (e.key === 'r') return (e.preventDefault(), refresh());
  if (S.view !== 'reader') return;
  const reader = $('#reader');
  switch (e.key) {
    case 'j':
    case 'ArrowDown':
      e.preventDefault();
      move(1);
      break;
    case 'k':
    case 'ArrowUp':
      e.preventDefault();
      move(-1);
      break;
    case 'o':
    case 'v':
    case 'Enter':
      e.preventDefault();
      readerAction('open');
      break;
    case 's':
      e.preventDefault();
      toggleStar();
      break;
    case 'm':
      e.preventDefault();
      if (S.article) setRead([S.article.id], !S.article.read);
      break;
    case 'A':
      e.preventDefault();
      markAllRead();
      break;
    case '/':
      e.preventDefault();
      $('#search').focus();
      break;
    case ' ':
      e.preventDefault();
      if (!S.article) move(1);
      else if (reader.scrollTop + reader.clientHeight >= reader.scrollHeight - 8) move(e.shiftKey ? -1 : 1);
      else reader.scrollBy({ top: (e.shiftKey ? -1 : 1) * reader.clientHeight * 0.85, behavior: 'smooth' });
      break;
  }
});

api.on('state', (st) => {
  const appearance = [st.settings.colorTheme, st.settings.theme, st.settings.readerFont, st.settings.readerSize].join();
  const before = [S.settings.colorTheme, S.settings.theme, S.settings.readerFont, S.settings.readerSize].join();
  applyState(st);
  renderSidebar();
  renderSync();
  if (S.view === 'reader') renderListHead();
  if (S.view === 'notifications' && !$('#nsnooze-menu:not(.hidden)')) renderNotifications();
  // Tema menüden değiştiyse ayarlar sayfasındaki seçim de güncellensin.
  if (S.view === 'settings' && appearance !== before) renderSettings();
});
api.on('items-changed', () => {
  if (S.view === 'reader') loadList({ soft: true });
  if (!S.feeds.length || !S.article) renderReader();
});
api.on('progress', (st) => {
  S.refresh = st;
  renderSync();
});
api.on('notifications-changed', () => {
  if (S.view === 'notifications') renderNotifications();
});
api.on('navigate', (nav) => navigate(nav));

// Göreli zamanlar dakikada bir güncellenir.
setInterval(() => {
  for (const el of $$('.i-time[data-ts]')) el.textContent = ago(+el.dataset.ts);
  renderSync();
}, 60e3);

// --- Başlangıç ------------------------------------------------------------------------------------------

async function init() {
  S.info = await api.info();
  document.body.classList.toggle('mac', S.info.platform === 'darwin');
  applyState(await api.state());
  renderSidebar();
  renderSync();
  await loadList();
  renderReader();
  api.ready();

  // Geliştirme/ekran görüntüsü için: #notifications, #settings, #add, #first:<sıra>
  const hash = location.hash.slice(1);
  if (hash === 'notifications' || hash === 'settings') showView(hash);
  else if (hash === 'add') openAdd();
  else if (hash.startsWith('first') && S.items.length) {
    const n = Math.max(0, (+hash.split(':')[1] || 1) - 1);
    await selectItem(S.items[Math.min(n, S.items.length - 1)].id);
  }
  if (S.info.capture) setTimeout(() => api.rendered(), 400);
}

init();
