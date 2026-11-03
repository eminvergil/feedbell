const test = require('node:test');
const assert = require('node:assert/strict');
const { inQuietHours, deliveryState, buildEntries, systemMessages, nextMorning, snoozeLabel } = require('../src/notifier');
const { DEFAULT_SETTINGS } = require('../src/store');
const { loadLanguage, createI18n } = require('../src/i18n-main');

const tr = createI18n(loadLanguage('tr')).t;
const en = createI18n(loadLanguage('en')).t;

const at = (h, m = 0) => new Date(2026, 9, 28, h, m).getTime();
const item = (id, date, title = `Yazı ${id}`) => ({ id, title, link: `https://x.example/${id}`, date, summary: '' });

test('gece yarısını aşan sessiz saatler', () => {
  const s = { quietHours: true, quietStart: '23:00', quietEnd: '08:00' };
  assert.equal(inQuietHours(s, at(23, 30)), true);
  assert.equal(inQuietHours(s, at(3)), true);
  assert.equal(inQuietHours(s, at(8)), false);
  assert.equal(inQuietHours(s, at(14)), false);
  assert.equal(inQuietHours({ ...s, quietHours: false }, at(3)), false);
  assert.equal(inQuietHours({ quietHours: true, quietStart: '12:00', quietEnd: '13:00' }, at(12, 30)), true);
});

test('bildirim gösterilip gösterilmeyeceği', () => {
  const s = { ...DEFAULT_SETTINGS };
  assert.deepEqual(deliveryState(s, at(12)), { on: true, reason: '' });
  assert.equal(deliveryState({ ...s, notifyStyle: 'off' }, at(12)).reason, 'off');
  assert.equal(deliveryState({ ...s, snoozeUntil: -1 }, at(12)).reason, 'snoozed');
  assert.equal(deliveryState({ ...s, snoozeUntil: at(13) }, at(12)).reason, 'snoozed');
  assert.equal(deliveryState({ ...s, snoozeUntil: at(11) }, at(12)).on, true, 'süresi dolan susturma');
  assert.equal(deliveryState({ ...s, quietHours: true }, at(2)).reason, 'quiet');
});

test('kayıtlar kaynak başına gruplanır; eski yazılar, kapalı kaynaklar ve anahtar kelimeler', () => {
  const now = at(12);
  const entries = buildEntries(
    [
      { feed: { id: 'a', title: 'Alfa', url: 'https://a.example' }, items: [item('1', now - 1000), item('2', now - 5 * 86400e3), item('3', now - 2000)] },
      { feed: { id: 'b', title: 'Beta', url: 'https://b.example', notify: false }, items: [item('4', now)] },
      { feed: { id: 'c', name: 'Özel ad', title: 'Gama', url: 'https://c.example', keywords: 'godot, sürüm' }, items: [item('5', now, 'Godot 4.8 çıktı'), item('6', now, 'Başka bir şey')] },
    ],
    now
  );
  assert.equal(entries.length, 2);
  const [alfa, gama] = entries;
  assert.equal(alfa.feedTitle, 'Alfa');
  assert.equal(alfa.count, 2, '3 günden eski yazı bildirilmez');
  assert.deepEqual(alfa.items.map((x) => x.id), ['1', '3']);
  assert.equal(gama.feedTitle, 'Özel ad');
  assert.deepEqual(gama.items.map((x) => x.id), ['5'], 'anahtar kelime eşleşmesi');
  assert.equal(alfa.seen, false);
});

test('sistem bildirimleri: tek yazı, çok yazı, çok kaynak', () => {
  const e = (id, n) => ({ id, feedId: id, feedTitle: `K${id}`, count: n, items: Array.from({ length: n }, (_, i) => ({ id: `${id}${i}`, title: `B${i}` })) });
  const [one] = systemMessages([e('a', 1)], tr);
  assert.equal(one.title, 'Ka');
  assert.equal(one.body, 'B0');
  assert.deepEqual(one.target, { item: 'a0' });
  const [many] = systemMessages([e('a', 4)], tr);
  assert.equal(many.title, 'Ka · 4 yeni yazı');
  assert.equal(many.body, '• B0\n• B1\n• B2');
  const summary = systemMessages([e('a', 1), e('b', 2), e('c', 1), e('d', 3)], tr);
  assert.equal(summary.length, 1);
  assert.equal(summary[0].title, '7 yeni yazı');
  assert.deepEqual(summary[0].target, { view: 'notifications' });
  assert.equal(systemMessages([e('a', 4)], en)[0].title, 'Ka · 4 new posts');
  assert.equal(systemMessages([e('a', 1), e('b', 2), e('c', 1), e('d', 3)], en)[0].title, '7 new posts');
});

test('susturma etiketleri', () => {
  assert.equal(nextMorning(at(23)), new Date(2026, 9, 29, 8).getTime());
  assert.equal(nextMorning(at(6)), at(8));
  assert.equal(snoozeLabel({ snoozeUntil: at(15, 30) }, at(12), tr), "15:30'e kadar");
  assert.equal(snoozeLabel({ snoozeUntil: at(15, 30) }, at(12), en), 'until 15:30');
  assert.equal(snoozeLabel({ snoozeUntil: at(9) + 86400e3 }, at(23), en), 'until tomorrow 09:00');
  assert.equal(snoozeLabel({ snoozeUntil: -1 }, at(12), tr), 'sen açana kadar');
  assert.equal(snoozeLabel({ snoozeUntil: 0 }, at(12), tr), '');
});
