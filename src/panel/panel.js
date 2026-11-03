// Menü çubuğu paneli: son bildirimler, okunmamış yazılar, kaynakların bildirimleri ve susturma.
const api = window.feedbell;
const $ = (s, el = document) => el.querySelector(s);
const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

const I18N = window.FeedbellI18n.createI18n(api.i18n);
const t = I18N.t;
const LOCALE = I18N.locale;
document.documentElement.lang = I18N.lang;
for (const el of document.querySelectorAll('[data-i18n]')) el.textContent = t(el.dataset.i18n);
for (const el of document.querySelectorAll('[data-i18n-title]')) el.title = t(el.dataset.i18nTitle);

const svg = (d) => `<svg viewBox="0 0 24 24">${d}</svg>`;
const ICON = {
  bell: svg('<path d="M6 16.5V11a6 6 0 1 1 12 0v5.5l1.5 1.5h-15z"/><path d="M10 20.5a2.2 2.2 0 0 0 4 0"/>'),
  bellOff: svg('<path d="M8.5 5.6A6 6 0 0 1 18 11v4m-1 3H4.5L6 16.5V11a6 6 0 0 1 .4-2.1"/><path d="M10 20.5a2.2 2.2 0 0 0 4 0M3 3l18 18"/>'),
  moon: svg('<path d="M19.5 14.5A7.5 7.5 0 0 1 9.5 4.5a7.5 7.5 0 1 0 10 10z"/>'),
  check: svg('<path d="m5 12.5 4.5 4.5L19 7.5"/>'),
  x: svg('<path d="M6 6l12 12M18 6 6 18"/>'),
  external: svg('<path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/>'),
  inbox: svg('<path d="M4 13.5 6.5 5h11l2.5 8.5V19H4z"/><path d="M4 13.5h4.5l1 2h5l1-2H20"/>'),
  rss: svg('<circle cx="6" cy="18" r="1.8" fill="currentColor" stroke="none"/><path d="M4.5 11a8.5 8.5 0 0 1 8.5 8.5M4.5 4.5a15 15 0 0 1 15 15"/>'),
};

const S = {
  st: null,
  feedMap: new Map(),
  tab: load('panelTab', 'notifications'),
  notifs: [],
  unread: { items: [], total: 0 },
  fresh: new Set(),
  confirmClear: false,
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
    /* önemli değil */
  }
}

// --- Biçimlendirme ------------------------------------------------------------------

function host(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url || '';
  }
}
const displayName = (f) => (f ? f.name || f.title || host(f.url) : '');
const feedError = (f) => (f.lastErrorCode ? t(`errors.${f.lastErrorCode}`, f.lastErrorParams || {}) : f.lastError || '');
const capitalize = (s) => (s ? s[0].toLocaleUpperCase(LOCALE) + s.slice(1) : s);

function hue(s) {
  let h = 0;
  for (const ch of String(s)) h = (h * 31 + ch.codePointAt(0)) % 360;
  return h;
}

function fav(feed, fallback) {
  const name = displayName(feed) || fallback || '?';
  if (feed?.icon) return `<img class="fav" src="${esc(feed.icon)}" alt="" data-name="${esc(name)}">`;
  return letter(name);
}
const letter = (name) =>
  `<span class="fav letter" style="--c: hsl(${hue(name)} 52% 46%)">${esc((String(name).trim()[0] || '?').toLocaleUpperCase(LOCALE))}</span>`;

document.addEventListener(
  'error',
  (e) => {
    if (e.target instanceof HTMLImageElement && e.target.classList.contains('fav')) e.target.outerHTML = letter(e.target.dataset.name || '?');
  },
  true
);

const pad = (n) => String(n).padStart(2, '0');
const clock = (ts) => `${pad(new Date(ts).getHours())}:${pad(new Date(ts).getMinutes())}`;
function dayDiff(ts) {
  const a = new Date();
  a.setHours(0, 0, 0, 0);
  const b = new Date(ts);
  b.setHours(0, 0, 0, 0);
  return Math.round((a - b) / 86400e3);
}
function ago(ts) {
  const m = Math.floor((Date.now() - ts) / 60000);
  if (m < 1) return t('time.now');
  if (m < 60) return t('time.minutesAgo', { count: m });
  const d = dayDiff(ts);
  if (d === 0) return t('time.hoursAgo', { count: Math.floor(m / 60) });
  if (d === 1) return t('time.yesterdayAt', { time: clock(ts) });
  if (d < 7) return t('time.daysAgo', { count: d });
  return new Date(ts).toLocaleDateString(LOCALE, { day: 'numeric', month: 'short' });
}
function groupLabel(ts) {
  const d = dayDiff(ts);
  if (d <= 0) return t('time.today');
  if (d === 1) return t('time.yesterday');
  return t('time.earlier');
}

let snackTimer = null;
function snack(text, undo) {
  const el = $('#snack');
  el.innerHTML = `<span>${esc(text)}</span>${undo ? `<button>${esc(t('common.undo'))}</button>` : ''}`;
  el.classList.remove('hidden');
  if (undo)
    el.querySelector('button').onclick = () => {
      el.classList.add('hidden');
      undo();
    };
  clearTimeout(snackTimer);
  snackTimer = setTimeout(() => el.classList.add('hidden'), 4500);
}

// --- Veri --------------------------------------------------------------------------------

function applyState(st) {
  S.st = st;
  S.feedMap = new Map(st.feeds.map((f) => [f.id, f]));
  document.documentElement.dataset.theme = st.settings.colorTheme || 'ember';
}

let reloadToken = 0;
async function reload() {
  const token = ++reloadToken;
  const [st, notifs, unread] = await Promise.all([api.state(), api.notifications(), api.query({ scope: 'unread', limit: 60 })]);
  if (token !== reloadToken) return;
  applyState(st);
  S.notifs = notifs.slice(0, 80);
  S.unread = unread;
  render();
}

let reloadTimer = null;
function reloadSoon() {
  clearTimeout(reloadTimer);
  reloadTimer = setTimeout(reload, 150);
}

// Panel açıkken bildirim sekmesine bakmak, bildirimleri "görüldü" yapar; vurgu panel kapanana kadar kalır.
function markSeen() {
  if (S.tab !== 'notifications') return;
  const unseen = S.notifs.filter((n) => !n.seen);
  if (!unseen.length) return;
  for (const n of unseen) S.fresh.add(n.id);
  api.notificationsSeen();
}

// --- Çizim -------------------------------------------------------------------------------

function render() {
  if (!S.st) return;
  renderHead();
  renderBell();
  renderTabs();
  renderList();
  renderFoot();
}

function renderHead() {
  const { counts, refresh } = S.st;
  const parts = [counts.unread ? t('panel.unread', { count: counts.unread }) : t('panel.noUnread')];
  if (refresh.running) parts.push(refresh.total > 1 ? t('panel.refreshingProgress', { done: refresh.done, total: refresh.total }) : t('panel.refreshing'));
  else if (refresh.last) parts.push(Date.now() - refresh.last < 60e3 ? t('panel.justRefreshed') : t('panel.refreshedAt', { time: clock(refresh.last) }));
  $('#sub').textContent = parts.join(' · ');
  $('#btn-refresh').classList.toggle('spin', !!refresh.running);
}

function renderBell() {
  const { delivery: d, settings: s } = S.st;
  const style = { popup: t('panel.stylePopup'), system: t('panel.styleSystem'), both: t('panel.styleBoth') }[s.notifyStyle] || '';
  const on = d.reason !== 'off' && d.reason !== 'snoozed';
  let icon = ICON.bell;
  let title = t('panel.onTitle');
  let sub = t(s.sound ? 'panel.onTextSound' : 'panel.onText', { style });
  if (d.reason === 'snoozed') {
    icon = ICON.bellOff;
    title = t('panel.snoozedTitle');
    sub = t('panel.snoozedText', { until: capitalize(d.snoozeLabel) });
  } else if (d.reason === 'quiet') {
    icon = ICON.moon;
    title = t('panel.quietTitle');
    sub = t('panel.quietText', { start: s.quietStart, end: s.quietEnd });
  } else if (d.reason === 'off') {
    icon = ICON.bellOff;
    title = t('panel.offTitle');
    sub = t('panel.offText');
  }
  const chips =
    d.reason === 'snoozed'
      ? `<div class="chips"><button class="btn" data-act="unsnooze">${esc(t('panel.unsnooze'))}</button></div>`
      : d.reason === 'off'
        ? `<div class="chips"><button class="btn" data-act="enable">${esc(t('panel.enable'))}</button></div>`
        : `<div class="chips"><span class="lbl">${esc(t('panel.snoozeLabel'))}</span>
            <button class="chip" data-snooze="60">${esc(t('snooze.hour1'))}</button>
            <button class="chip" data-snooze="240">${esc(t('snooze.hour4'))}</button>
            <button class="chip" data-snooze="morning">${esc(t('snooze.morningShort'))}</button></div>`;
  $('#bell').innerHTML = `
    <div class="bell-row">
      <div class="bell-ic ${on ? '' : 'off'}">${icon}</div>
      <div class="bell-text"><b>${esc(title)}</b><span title="${esc(sub)}">${esc(sub)}</span></div>
      <input type="checkbox" class="switch" id="sw-notify" ${on ? 'checked' : ''} title="${esc(on ? t('panel.switchOff') : t('panel.switchOn'))}" aria-label="${esc(t('panel.tabNotifications'))}">
    </div>
    ${chips}`;
}

function renderTabs() {
  const fresh = S.notifs.filter((n) => !n.seen || S.fresh.has(n.id)).length;
  for (const b of document.querySelectorAll('[data-tab]')) {
    b.classList.toggle('on', b.dataset.tab === S.tab);
    b.setAttribute('aria-selected', String(b.dataset.tab === S.tab));
  }
  const n = $('#n-notifications');
  n.textContent = fresh ? String(fresh) : '';
  n.classList.toggle('badge', fresh > 0);
  $('#n-unread').textContent = S.st.counts.unread ? String(S.st.counts.unread) : '';
  $('#n-feeds').textContent = S.st.feeds.length ? String(S.st.feeds.length) : '';
}

const actBtn = (act, icon, title) => `<button data-act="${act}" title="${esc(title)}" aria-label="${esc(title)}">${icon}</button>`;

function renderList() {
  const box = $('#list');
  const scroll = box.scrollTop;
  if (S.tab === 'notifications') box.innerHTML = notificationsHtml();
  else if (S.tab === 'unread') box.innerHTML = unreadHtml();
  else box.innerHTML = feedsHtml();
  box.scrollTop = scroll;
}

const SILENT = { quiet: 'panel.silentQuiet', snoozed: 'panel.silentSnoozed', off: 'panel.silentOff' };

function emptyHtml(icon, title, text, withAdd) {
  return `<div class="empty">${icon}<b>${esc(title)}</b><span>${esc(text)}</span>${withAdd ? `<button class="btn" data-act="add">${esc(t('common.addFeed'))}</button>` : ''}</div>`;
}

function notificationsHtml() {
  if (!S.notifs.length) {
    const has = S.st.feeds.length > 0;
    return emptyHtml(ICON.bell, t('panel.emptyNotificationsTitle'), has ? t('panel.emptyNotificationsText') : t('panel.emptyNotificationsNoFeeds'), !has);
  }
  let html = '';
  let group = '';
  for (const n of S.notifs) {
    const g = groupLabel(n.ts);
    if (g !== group) {
      html += `<div class="group">${esc(g)}</div>`;
      group = g;
    }
    const feed = S.feedMap.get(n.feedId);
    const titles = n.items
      .slice(0, 3)
      .map((x) => {
        const title = x.title || t('common.untitled');
        return `<li><button class="t ${x.gone ? 'gone' : x.read ? 'read' : ''}" data-item="${esc(x.id)}" data-link="${esc(x.link)}" title="${esc(title)}">${esc(title)}</button></li>`;
      })
      .join('');
    const more = n.count > 3 ? `<li class="more-line">${esc(t('panel.morePosts', { count: n.count - 3 }))}</li>` : '';
    const allRead = n.items.every((x) => x.read || x.gone);
    const muted = feed && feed.notify === false;
    html += `<div class="row ${S.fresh.has(n.id) || !n.seen ? 'fresh' : ''}" data-nid="${esc(n.id)}">
      ${fav(feed, n.feedTitle)}
      <div>
        <div class="meta">
          <button class="feed" data-feed="${esc(n.feedId)}" ${feed ? '' : 'disabled'}>${esc(feed ? displayName(feed) : n.feedTitle || t('common.deletedFeed'))}</button>
          <span class="time">${esc(ago(n.ts))}${n.count > 1 ? ` · ${esc(t('panel.posts', { count: n.count }))}` : ''}</span>
          ${SILENT[n.silent] ? `<span class="tag">${esc(t(SILENT[n.silent]))}</span>` : ''}
        </div>
        <ul class="titles">${titles}${more}</ul>
      </div>
      <div class="acts">
        ${allRead ? '' : actBtn('n-read', ICON.check, t('panel.actRead'))}
        ${feed ? (muted ? actBtn('n-unmute', ICON.bell, t('panel.actUnmute')) : actBtn('n-mute', ICON.bellOff, t('panel.actMute'))) : ''}
        ${actBtn('n-remove', ICON.x, t('panel.actRemove'))}
      </div>
    </div>`;
  }
  return html;
}

function unreadHtml() {
  const items = S.unread.items;
  if (!items.length) {
    const has = S.st.feeds.length > 0;
    return emptyHtml(ICON.inbox, has ? t('list.allDoneTitle') : t('list.emptyNoFeedsTitle'), has ? t('list.allDoneText') : t('panel.emptyUnreadNoFeeds'), !has);
  }
  return items
    .map((it) => {
      const feed = S.feedMap.get(it.feedId);
      const title = it.title || t('common.untitled');
      return `<div class="row click" data-open="${esc(it.id)}" data-link="${esc(it.link)}">
        ${fav(feed)}
        <div>
          <div class="meta"><button class="feed" data-feed="${esc(it.feedId)}">${esc(displayName(feed))}</button><span class="time">${esc(ago(it.date))}</span></div>
          <button class="t" data-item="${esc(it.id)}" title="${esc(title)}">${esc(title)}</button>
          ${it.summary ? `<div class="sum">${esc(it.summary)}</div>` : ''}
        </div>
        <div class="acts">
          ${actBtn('u-read', ICON.check, t('panel.actRead'))}
          ${it.link ? actBtn('u-browser', ICON.external, t('common.openInBrowser')) : ''}
        </div>
      </div>`;
    })
    .join('');
}

function feedsHtml() {
  const feeds = [...S.st.feeds].sort((a, b) => displayName(a).localeCompare(displayName(b), LOCALE));
  if (!feeds.length) return emptyHtml(ICON.rss, t('panel.emptyFeedsTitle'), t('panel.emptyFeedsText'), true);
  const on = feeds.filter((f) => f.notify !== false).length;
  return (
    `<div class="group">${esc(t('panel.feedsHeader', { on, count: feeds.length }))}</div>` +
    feeds
      .map((f) => {
        const n = S.st.counts.feeds[f.id] || 0;
        const notify = f.notify !== false;
        const err = f.errorCount ? feedError(f) : '';
        const sub = [f.folder, f.keywords ? t('panel.only', { words: f.keywords }) : ''].filter(Boolean).join(' · ') || host(f.siteUrl || f.url);
        return `<div class="feed-row ${notify ? '' : 'muted'}">
          ${fav(f)}
          <button class="name" data-feed="${esc(f.id)}" title="${esc(err || displayName(f))}"><b>${esc(displayName(f))}</b><span>${err ? `<span class="warn">⚠ ${esc(err)}</span>` : esc(sub)}</span></button>
          <span class="cnt">${n || ''}</span>
          <input type="checkbox" class="switch small" data-feed-notify="${esc(f.id)}" ${notify ? 'checked' : ''} title="${esc(notify ? t('panel.notifyOff') : t('panel.notifyOn'))}" aria-label="${esc(t('panel.feedNotifications', { name: displayName(f) }))}">
        </div>`;
      })
      .join('')
  );
}

function renderFoot() {
  const f = $('#foot');
  if (S.tab === 'notifications') {
    if (S.confirmClear) {
      f.innerHTML = `<span class="grow">${esc(t('panel.confirmClear'))}</span><button class="btn ghost" data-act="clear-cancel">${esc(t('common.cancel'))}</button><button class="btn danger" data-act="clear-yes">${esc(t('panel.clearYes'))}</button>`;
      return;
    }
    f.innerHTML = `<span class="grow">${S.notifs.length ? esc(t('panel.lastN', { count: S.notifs.length })) : ''}</span>
      ${S.notifs.length ? `<button class="link plain" data-act="clear">${esc(t('panel.clear'))}</button>` : ''}
      <button class="link" data-act="history">${esc(t('panel.fullHistory'))}</button>`;
  } else if (S.tab === 'unread') {
    const total = S.unread.total;
    f.innerHTML = `<span class="grow">${total > S.unread.items.length ? esc(t('panel.showing', { shown: S.unread.items.length, count: total })) : ''}</span>
      ${total ? `<button class="link plain" data-act="all-read">${esc(t('panel.markAllRead'))}</button>` : ''}
      <button class="link" data-act="open-unread">${esc(t('panel.readInApp'))}</button>`;
  } else {
    f.innerHTML = `<span class="grow"></span><button class="link plain" data-act="settings">${esc(t('panel.notificationSettings'))}</button><button class="link" data-act="add">${esc(t('panel.addFeedPlus'))}</button>`;
  }
}

// --- Olaylar ------------------------------------------------------------------------------

function setTab(tab) {
  S.tab = tab;
  S.confirmClear = false;
  save('panelTab', tab);
  render();
  markSeen();
}

async function muteFeed(id, notify) {
  const f = S.feedMap.get(id);
  await api.updateFeed({ id, patch: { notify } });
  snack(notify ? t('panel.unmuted', { name: displayName(f) }) : t('panel.muted', { name: displayName(f) }), () => muteFeed(id, !notify));
}

document.addEventListener('click', async (e) => {
  const el = e.target;
  const tab = el.closest('[data-tab]');
  if (tab) return setTab(tab.dataset.tab);

  const snooze = el.closest('[data-snooze]');
  if (snooze) {
    const v = snooze.dataset.snooze;
    api.snooze(v === 'morning' ? v : +v);
    snack(v === 'morning' ? t('panel.snoozedMorning') : t('panel.snoozedHours', { count: +v / 60 }), () => api.snooze(0));
    return;
  }

  const item = el.closest('[data-item]');
  if (item) {
    if (item.classList.contains('gone')) {
      if (item.dataset.link) api.openExternal(item.dataset.link);
      else snack(t('reader.postGone'));
      return;
    }
    return api.openApp({ item: item.dataset.item });
  }
  const feed = el.closest('[data-feed]');
  if (feed && !feed.disabled) return api.openApp({ feed: feed.dataset.feed });

  const row = el.closest('[data-nid]');
  const urow = el.closest('[data-open]');
  const act = el.closest('[data-act]')?.dataset.act;
  if (!act) {
    if (urow) api.openApp({ item: urow.dataset.open });
    return;
  }
  switch (act) {
    case 'refresh':
      api.refresh();
      break;
    case 'open-app':
      api.openApp();
      break;
    case 'more':
      api.panelMenu();
      break;
    case 'unsnooze':
      api.snooze(0);
      break;
    case 'enable':
      api.saveSettings({ notifyStyle: 'popup', snoozeUntil: 0 });
      break;
    case 'add':
      api.openApp({ command: 'add' });
      break;
    case 'settings':
      api.openApp({ view: 'settings' });
      break;
    case 'history':
      api.openApp({ view: 'notifications' });
      break;
    case 'open-unread':
      api.openApp({ command: 'scope:unread' });
      break;
    case 'all-read': {
      const n = await api.markAllRead({ scope: 'unread' });
      snack(t('list.markedRead', { count: n }));
      break;
    }
    case 'clear':
      S.confirmClear = true;
      renderFoot();
      break;
    case 'clear-cancel':
      S.confirmClear = false;
      renderFoot();
      break;
    case 'clear-yes':
      S.confirmClear = false;
      await api.clearNotifications({ confirmed: true });
      break;
    case 'n-read':
      api.notificationRead(row.dataset.nid);
      break;
    case 'n-mute':
    case 'n-unmute': {
      const n = S.notifs.find((x) => x.id === row.dataset.nid);
      if (n) muteFeed(n.feedId, act === 'n-unmute');
      break;
    }
    case 'n-remove':
      row.remove();
      api.removeNotification(row.dataset.nid);
      break;
    case 'u-read':
      urow.remove();
      api.setRead({ ids: [urow.dataset.open], read: true });
      break;
    case 'u-browser':
      api.openExternal(urow.dataset.link);
      api.setRead({ ids: [urow.dataset.open], read: true });
      break;
  }
});

document.addEventListener('change', (e) => {
  const el = e.target;
  if (el.id === 'sw-notify') {
    const d = S.st.delivery;
    if (el.checked) {
      if (d.reason === 'off') api.saveSettings({ notifyStyle: 'popup', snoozeUntil: 0 });
      else api.snooze(0);
    } else {
      api.snooze(-1);
      snack(t('panel.snoozedForever'), () => api.snooze(0));
    }
    return;
  }
  if (el.dataset.feedNotify) muteFeed(el.dataset.feedNotify, el.checked);
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') api.panelHide();
  if ((e.key === 'r' || e.key === 'R') && !e.metaKey && !e.ctrlKey) api.refresh();
  if (e.key === '1') setTab('notifications');
  if (e.key === '2') setTab('unread');
  if (e.key === '3') setTab('feeds');
});

api.on('panel-shown', async () => {
  S.fresh.clear();
  S.confirmClear = false;
  $('#snack').classList.add('hidden');
  await reload();
  markSeen();
});
api.on('state', (st) => {
  applyState(st);
  renderHead();
  renderBell();
  reloadSoon();
});
api.on('progress', (p) => {
  if (!S.st) return;
  S.st.refresh = p;
  renderHead();
});
api.on('items-changed', reloadSoon);
api.on('notifications-changed', reloadSoon);

(async () => {
  const info = await api.info();
  const capture = location.hash.startsWith('#capture');
  document.body.classList.toggle('vibrant', info.platform === 'darwin' && !capture);
  const tab = capture && location.hash.split(':')[1];
  if (tab) S.tab = tab;
  await reload();
  if (capture) setTimeout(() => api.panelRendered(), 300);
})();
