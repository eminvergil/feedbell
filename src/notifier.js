// Yeni yazılardan bildirim kayıtları üretir ve o an gösterilip gösterilmeyeceğine karar verir.
// Elektron'a bağımlı değildir; ana süreç sonucu popup'a ya da sistem bildirimine dönüştürür.
const { displayName, randomId, fold, DAY } = require('./store');

// Beslemeye geç eklenen ya da kimliği değişip yeniden görünen eski yazılar bildirim üretmesin.
const MAX_AGE = 3 * DAY;

function minutesOf(hhmm) {
  const [h, m] = String(hhmm || '0:0').split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}

function inQuietHours(settings, now = Date.now()) {
  if (!settings.quietHours) return false;
  const d = new Date(now);
  const cur = d.getHours() * 60 + d.getMinutes();
  const start = minutesOf(settings.quietStart);
  const end = minutesOf(settings.quietEnd);
  if (start === end) return false;
  return start < end ? cur >= start && cur < end : cur >= start || cur < end; // gece yarısını aşan aralık
}

const isSnoozed = (settings, now = Date.now()) => settings.snoozeUntil === -1 || settings.snoozeUntil > now;

// { on: true } ya da { on: false, reason: 'off' | 'snoozed' | 'quiet' }
function deliveryState(settings, now = Date.now()) {
  if (settings.notifyStyle === 'off') return { on: false, reason: 'off' };
  if (isSnoozed(settings, now)) return { on: false, reason: 'snoozed' };
  if (inQuietHours(settings, now)) return { on: false, reason: 'quiet' };
  return { on: true, reason: '' };
}

function keywordList(s) {
  return String(s || '')
    .split(/[,\n]/)
    .map((k) => fold(k.trim()))
    .filter(Boolean);
}

function matchesKeywords(item, keywords) {
  const list = keywordList(keywords);
  if (!list.length) return true;
  const hay = fold(`${item.title} ${item.summary}`);
  return list.some((k) => hay.includes(k));
}

// results: [{ feed, items }] — her kaynak için bir kayıt (aynı yenilemede gelen yazılar gruplanır).
function buildEntries(results, now = Date.now()) {
  const entries = [];
  for (const { feed, items } of results) {
    if (!feed || feed.notify === false) continue;
    const fresh = items.filter((it) => (it.date || now) >= now - MAX_AGE && matchesKeywords(it, feed.keywords)).sort((a, b) => b.date - a.date);
    if (!fresh.length) continue;
    entries.push({
      id: randomId(),
      ts: now,
      feedId: feed.id,
      feedTitle: displayName(feed),
      count: fresh.length,
      items: fresh.slice(0, 10).map((it) => ({ id: it.id, title: it.title, link: it.link })),
      seen: false,
      silent: '',
    });
  }
  return entries.sort((a, b) => b.count - a.count);
}

// Sistem bildirimleri: kaynak başına bir tane; çok kaynak varsa tek özet. t: seçili dilin çeviri işlevi.
function systemMessages(entries, t) {
  if (entries.length > 3) {
    const total = entries.reduce((s, e) => s + e.count, 0);
    const names = entries.slice(0, 3).map((e) => e.feedTitle);
    return [
      {
        title: t('system.manyTitle', { count: total }),
        body: t('system.manyBody', { feeds: entries.length, names: names.join(', ') }) + t('system.andOthers'),
        target: { view: 'notifications' },
        entryIds: entries.map((e) => e.id),
      },
    ];
  }
  return entries.map((e) => ({
    title: e.count === 1 ? e.feedTitle : t('system.feedMany', { feed: e.feedTitle, count: e.count }),
    body: e.count === 1 ? e.items[0].title : e.items.slice(0, 3).map((x) => `• ${x.title}`).join('\n'),
    target: e.count === 1 && e.items[0].id ? { item: e.items[0].id } : { feed: e.feedId },
    entryIds: [e.id],
    feedId: e.feedId,
  }));
}

function nextMorning(now = Date.now(), hour = 8) {
  const d = new Date(now);
  d.setHours(hour, 0, 0, 0);
  if (d.getTime() <= now) d.setDate(d.getDate() + 1);
  return d.getTime();
}

function clockText(ts) {
  const d = new Date(ts);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

// "15:30'e kadar" / "until 15:30"; t: seçili dilin çeviri işlevi.
function snoozeLabel(settings, now = Date.now(), t) {
  if (settings.snoozeUntil === -1) return t('snooze.untilOn');
  if (!isSnoozed(settings, now)) return '';
  const sameDay = new Date(settings.snoozeUntil).toDateString() === new Date(now).toDateString();
  return t(sameDay ? 'snooze.until' : 'snooze.untilTomorrow', { time: clockText(settings.snoozeUntil) });
}

module.exports = {
  inQuietHours,
  isSnoozed,
  deliveryState,
  matchesKeywords,
  buildEntries,
  systemMessages,
  nextMorning,
  snoozeLabel,
  clockText,
  MAX_AGE,
};
