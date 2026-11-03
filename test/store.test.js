const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { Store } = require('../src/store');

const DAY = 86400e3;
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'feedbell-test-'));
const post = (key, date, extra = {}) => ({ key, title: `Yazı ${key}`, link: `https://x.example/${key}`, date, html: `<p>${key}</p>`, summary: key, ...extra });

test('yalnızca daha önce görülmemiş yazılar yeni sayılır', () => {
  const s = new Store(tmp());
  const f = s.addFeed({ url: 'https://x.example/feed' });
  const now = Date.now();
  assert.equal(s.merge(f.id, [post('a', now - 1000), post('b', now - 2000)], now).length, 2);
  assert.equal(s.merge(f.id, [post('c', now), post('a', now - 1000), post('b', now - 2000)], now).length, 1);
  assert.equal(s.merge(f.id, [post('c', now), post('c', now)], now).length, 0, 'aynı yazı iki kez gelirse');
  assert.equal(s.counts().unread, 3);
});

test('saklama süresi dolup silinen yazılar beslemede dursa bile yeniden gelmez', () => {
  const s = new Store(tmp());
  s.saveSettings({ retentionDays: 7 });
  const f = s.addFeed({ url: 'https://x.example/feed' });
  const old = Date.now() - 30 * DAY;
  s.merge(f.id, [post('eski', old)], old);
  assert.equal(s.prune(), 1);
  assert.equal(s.items.size, 0);
  assert.equal(s.merge(f.id, [post('eski', old)], Date.now()).length, 0);
});

test('yıldızlı yazılar silinmez', () => {
  const s = new Store(tmp());
  s.saveSettings({ retentionDays: 7 });
  const f = s.addFeed({ url: 'https://x.example/feed' });
  const old = Date.now() - 30 * DAY;
  const [it] = s.merge(f.id, [post('y', old)], old);
  s.setStarred(it.id, true);
  assert.equal(s.prune(), 0);
});

test('düzeltilen yazının içeriği güncellenir, okundu durumu korunur', () => {
  const s = new Store(tmp());
  const f = s.addFeed({ url: 'https://x.example/feed' });
  const [it] = s.merge(f.id, [post('a', 1)], 10);
  s.setRead([it.id], true);
  s.merge(f.id, [post('a', 1, { title: 'Düzeltilmiş' })], 20);
  assert.equal(s.item(it.id).title, 'Düzeltilmiş');
  assert.equal(s.item(it.id).read, true);
});

test('tarihsiz yazılar beslemedeki sırayı korur, gelecekteki tarih şimdiye çekilir', () => {
  const s = new Store(tmp());
  const f = s.addFeed({ url: 'https://x.example/feed' });
  const now = Date.now();
  s.merge(f.id, [post('ilk', null), post('ikinci', null), post('gelecek', now + 5 * DAY)], now);
  const titles = s.query().items.map((x) => x.title);
  assert.deepEqual(titles, ['Yazı ilk', 'Yazı gelecek', 'Yazı ikinci']);
  assert.ok(s.query().items.every((x) => x.date <= now));
});

test('sorgu: kapsam, okunmamış, arama ve okunduktan sonra listede tutma', () => {
  const s = new Store(tmp());
  const a = s.addFeed({ url: 'https://a.example/feed', title: 'Alfa', folder: 'Oyun' });
  const b = s.addFeed({ url: 'https://b.example/feed', title: 'Beta' });
  const now = Date.now();
  const [a1] = s.merge(a.id, [post('ışık', now, { title: 'Işıklandırma rehberi' }), post('a2', now - 1)], now);
  s.merge(b.id, [post('b1', now - 2)], now);
  assert.equal(s.query({ scope: 'feed', feedId: a.id }).total, 2);
  assert.equal(s.query({ scope: 'folder', folder: 'Oyun' }).total, 2);
  assert.equal(s.query({ search: 'IŞIK' }).total, 1, 'Türkçe büyük/küçük harf');
  assert.equal(s.query({ search: 'beta' }).total, 1, 'kaynak adında arama');
  s.setRead([a1.id], true);
  assert.equal(s.query({ unreadOnly: true }).total, 2);
  assert.equal(s.query({ unreadOnly: true, keep: [a1.id] }).total, 3);
  assert.equal(s.markAllRead({ scope: 'folder', folder: 'Oyun' }), 1);
  assert.deepEqual(s.counts().feeds, { [b.id]: 1 });
  assert.equal(s.counts().folders.Oyun, 0);
});

test('diske yazılır ve yeniden yüklenir', () => {
  const dir = tmp();
  const s = new Store(dir);
  const f = s.addFeed({ url: 'https://x.example/feed', title: 'X' });
  const [it] = s.merge(f.id, [post('a', 1)], 10);
  s.setStarred(it.id, true);
  s.addNotifications([{ id: 'n1', ts: 1, feedId: f.id, feedTitle: 'X', count: 1, items: [], seen: false }]);
  s.flush();
  const again = new Store(dir);
  assert.equal(again.feeds[0].title, 'X');
  assert.equal(again.item(it.id).starred, true);
  assert.equal(again.counts().notifications, 1);
  assert.equal(again.merge(f.id, [post('a', 1)], 20).length, 0, 'görülen kimlikler de kalıcı');
  again.removeFeed(f.id);
  again.flush();
  assert.equal(new Store(dir).items.size, 0);
});
