const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { parseFeed, NotFeedError, parseDate, htmlToText } = require('../src/feed-parser');
const { decodeBody } = require('../src/fetcher');

const fixture = (name) => fs.readFileSync(path.join(__dirname, 'fixtures', name), 'utf8');

test('RSS 2.0: başlık, bağlantı, içerik, yazar, görsel, ek dosya', () => {
  const f = parseFeed(fixture('rss2.xml'), 'https://ornek.example/feed.xml');
  assert.equal(f.format, 'rss');
  assert.equal(f.title, 'Örnek Blog & Notlar');
  assert.equal(f.siteUrl, 'https://ornek.example/');
  assert.equal(f.icon, 'https://ornek.example/logo.png');
  assert.equal(f.items.length, 3);

  const [a, b, c] = f.items;
  assert.equal(a.title, 'Godot 4 ile ilk oyun');
  assert.equal(a.link, 'https://ornek.example/yazi/ilk-oyun');
  assert.equal(a.key, 'post-1');
  assert.equal(a.author, 'Deniz Aydın');
  assert.equal(a.date, Date.parse('2026-10-27T07:00:00Z'));
  assert.match(a.html, /^<p>Uzun içerik/);
  assert.equal(a.summary, 'Kısa özet metni', 'content:encoded varken özet description\'dan gelir');
  assert.equal(a.image, 'https://cdn.example/thumb.jpg');

  assert.equal(b.title, 'Tom & Jerry – bölüm 2', 'çift kaçışlı varlıklar çözülür');
  assert.equal(b.date, Date.parse('2026-10-28T06:30:00Z'), 'Türkçe gün/ay adları');
  assert.equal(b.author, 'Ece Kara');
  assert.match(b.html, /<b>HTML<\/b>/, 'kaçışsız HTML açıklama korunur');
  assert.deepEqual(b.enclosure, { url: 'https://ornek.example/bolum2.mp3', type: 'audio/mpeg', length: 1234 });
  assert.equal(b.comments, 'https://ornek.example/yazi/2#yorumlar');

  assert.equal(c.link, 'https://ornek.example/yazi/3', 'kalıcı guid bağlantı olarak kullanılır');
  assert.match(c.title, /^Başlığı olmayan bir yazı/);
  assert.equal(c.date, null);
});

test('Atom: xhtml içerik, html başlık, alternatif bağlantı, media:group', () => {
  const f = parseFeed(fixture('atom.xml'), 'https://atom.example/feed');
  assert.equal(f.format, 'atom');
  assert.equal(f.title, 'Atom Örneği');
  assert.equal(f.siteUrl, 'https://atom.example/');
  assert.equal(f.icon, 'https://atom.example/favicon.png');
  const [a, v] = f.items;
  assert.equal(a.title, 'Vurgulu başlık');
  assert.equal(a.link, 'https://atom.example/1');
  assert.equal(a.key, 'tag:atom.example,2026:1');
  assert.equal(a.date, Date.parse('2026-10-28T08:00:00Z'), 'published, updated\'dan önce gelir');
  assert.equal(a.author, 'Ortak Yazar');
  assert.match(a.html, /<p>XHTML <a href="\/x">içerik<\/a><\/p><br><p>son<\/p>/);
  assert.equal(a.summary, 'Özet metni');

  assert.equal(v.image, 'https://i.video.example/abc.jpg');
  assert.equal(v.html, '<p>Satır bir<br>Satır iki</p>');
});

test('RSS 1.0 (RDF)', () => {
  const f = parseFeed(fixture('rdf.xml'), 'https://rdf.example/rss');
  assert.equal(f.format, 'rdf');
  assert.equal(f.title, 'RDF Kanalı');
  assert.equal(f.items.length, 1);
  assert.equal(f.items[0].title, 'RDF yazısı');
  assert.equal(f.items[0].date, Date.parse('2026-10-26T10:00:00Z'));
});

test('JSON Feed', () => {
  const f = parseFeed(
    JSON.stringify({
      version: 'https://jsonfeed.org/version/1.1',
      title: 'JSON Örneği',
      home_page_url: 'https://json.example/',
      items: [{ id: 1, url: '/a', title: 'Bir', content_text: 'Düz\n\nmetin', date_published: '2026-10-28T10:00:00Z', authors: [{ name: 'Ada' }] }],
    }),
    'https://json.example/feed.json'
  );
  assert.equal(f.format, 'json');
  assert.equal(f.items[0].key, '1');
  assert.equal(f.items[0].link, 'https://json.example/a');
  assert.equal(f.items[0].html, '<p>Düz</p><p>metin</p>');
  assert.equal(f.items[0].author, 'Ada');
});

test('bozuk XML\'i tolere eder', () => {
  const f = parseFeed('<rss><channel><title>Bozuk<item><title>Yazı &nbsp;bir</title><link>https://x.example/1</link></item></channel>', 'https://x.example/');
  assert.equal(f.items.length, 1);
  assert.equal(f.items[0].title, 'Yazı bir');
});

test('HTML sayfası besleme sayılmaz', () => {
  assert.throws(() => parseFeed('<!doctype html><html><head></head><body>Merhaba</body></html>'), NotFeedError);
  assert.throws(() => parseFeed('{"merhaba": 1}'), NotFeedError);
  assert.throws(() => parseFeed(''), NotFeedError);
});

test('tarih biçimleri', () => {
  assert.equal(parseDate('2026-10-28T10:00:00Z'), Date.parse('2026-10-28T10:00:00Z'));
  assert.equal(parseDate('Wed, 28 Oct 2026 10:00:00 GMT'), Date.parse('2026-10-28T10:00:00Z'));
  assert.equal(parseDate('28 Kasım 2026 12:00 +0000'), Date.parse('2026-11-28T12:00:00Z'));
  assert.equal(parseDate('28.10.2026 14:30'), new Date(2026, 9, 28, 14, 30).getTime());
  assert.equal(parseDate('saçma'), null);
});

test('HTML\'den düz metin', () => {
  assert.equal(htmlToText('<p>Bir&nbsp;iki</p><script>x()</script><p>üç &amp; dört</p>'), 'Bir iki\nüç & dört');
});

test('Türkçe karakter kodlamaları çözülür', () => {
  const iso = Buffer.from([0x3c, 0x3f, 0x78, 0x6d, 0x6c, 0x20, 0x65, 0x6e, 0x63, 0x6f, 0x64, 0x69, 0x6e, 0x67, 0x3d, 0x22, 0x49, 0x53, 0x4f, 0x2d, 0x38, 0x38, 0x35, 0x39, 0x2d, 0x39, 0x22, 0x3f, 0x3e, 0xfe, 0xf0, 0xfd, 0xdd]);
  assert.equal(decodeBody(iso, 'text/xml').slice(-4), 'şğıİ', 'XML bildirimindeki ISO-8859-9');
  const w1254 = Buffer.from('<rss>Maþ</rss>', 'latin1');
  w1254[w1254.length - 7] = 0xfe;
  assert.equal(decodeBody(w1254, 'application/rss+xml; charset=windows-1254'), '<rss>Maş</rss>', 'HTTP başlığındaki karakter kümesi');
  const broken = Buffer.from([...Buffer.from('<rss>'), 0xe7, 0x61, 0xf0, 0x61, 0xfe, 0x61, 0xfd, 0x61, ...Buffer.from('</rss>')]);
  assert.equal(decodeBody(broken, 'text/xml'), '<rss>çağaşaıa</rss>', 'UTF-8 diye bildirip windows-1254 gönderenler');
});
