const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizeUrl, urlKey, resolveFeed, fetchFeed, findFeedLinks, iconLinks, UA } = require('../src/fetcher');
const { buildOpml, parseOpml } = require('../src/opml');

const RSS = (title) => `<?xml version="1.0"?><rss version="2.0"><channel><title>${title}</title><link>https://site.example/</link><item><title>Bir</title><link>https://site.example/1</link></item></channel></rss>`;

// Sahte fetch: adres → { status, body, headers }
function fakeFetch(routes, log = []) {
  return async (url, opts) => {
    log.push({ url, headers: opts.headers });
    const r = typeof routes[url] === 'function' ? routes[url](opts) : routes[url];
    if (!r) return new Response('yok', { status: 404 });
    const res = new Response(r.status === 304 ? null : r.body, { status: r.status || 200, headers: r.headers || {} });
    Object.defineProperty(res, 'url', { value: r.url || url });
    return res;
  };
}

test('adres düzeltme ve karşılaştırma', () => {
  assert.equal(normalizeUrl('godotengine.org'), 'https://godotengine.org/');
  assert.equal(normalizeUrl(' feed://site.example/rss '), 'http://site.example/rss');
  assert.equal(normalizeUrl('https://site.example/a#yorum'), 'https://site.example/a');
  assert.throws(() => normalizeUrl('ftp://site.example'), (e) => e.code === 'httpOnly');
  assert.throws(() => normalizeUrl('merhaba'), (e) => e.code === 'invalidUrl');
  assert.equal(urlKey('http://www.site.example/feed/'), urlKey('https://site.example/feed'));
});

test('doğrudan besleme adresi', async () => {
  const fetch = fakeFetch({ 'https://site.example/feed': { body: RSS('Site'), headers: { 'content-type': 'application/rss+xml', etag: '"v1"' } } });
  const r = await resolveFeed('site.example/feed', { fetch });
  assert.equal(r.url, 'https://site.example/feed');
  assert.equal(r.result.feed.title, 'Site');
  assert.equal(r.result.etag, '"v1"');
});

test('site adresinden besleme bulma: tek, çok ve hiç bağlantı yoksa olağan yollar', async () => {
  const one = fakeFetch({
    'https://site.example/': { body: '<html><head><link rel="alternate" type="application/rss+xml" href="/rss.xml" title="Yazılar"></head></html>', headers: { 'content-type': 'text/html' } },
    'https://site.example/rss.xml': { body: RSS('Bulunan') },
  });
  const r1 = await resolveFeed('https://site.example/', { fetch: one });
  assert.equal(r1.url, 'https://site.example/rss.xml');
  assert.equal(r1.result.feed.title, 'Bulunan');

  const many = fakeFetch({
    'https://site.example/': {
      body: `<html><head>
        <link rel="alternate" type="application/rss+xml" title="Site » Yorum Beslemesi" href="/comments/feed">
        <link rel="alternate" type="application/rss+xml" title="Site » Besleme" href="/feed">
        <link rel="alternate" type="application/atom+xml" href="https://site.example/atom.xml">
        <link rel="stylesheet" href="/x.css"></head></html>`,
      headers: { 'content-type': 'text/html; charset=utf-8' },
    },
  });
  const r2 = await resolveFeed('https://site.example/', { fetch: many });
  assert.deepEqual(r2.choices.map((c) => c.url), ['https://site.example/feed', 'https://site.example/atom.xml'], 'yorum beslemesi elenir');

  const probe = fakeFetch({
    'https://site.example/': { body: '<!doctype html><html><body>Blog</body></html>', headers: { 'content-type': 'text/html' } },
    'https://site.example/feed.xml': { body: RSS('Tahmin') },
  });
  const r3 = await resolveFeed('https://site.example/', { fetch: probe });
  assert.equal(r3.url, 'https://site.example/feed.xml');

  const none = fakeFetch({ 'https://site.example/': { body: '<html><body>Blog</body></html>', headers: { 'content-type': 'text/html' } } });
  await assert.rejects(resolveFeed('https://site.example/', { fetch: none }), (e) => e.code === 'noFeedOnPage');
});

test('aynı beslemenin biçimleri tek seçeneğe iner; Reddit ve GitHub adresleri tanınır', async () => {
  const { narrowChoices } = require('../src/fetcher');
  assert.equal(narrowChoices([{ title: 'Atom 1.0', url: 'https://x.example/atom.xml' }, { title: 'RSS 2.0', url: 'https://x.example/rss.xml' }]).length, 1);
  assert.equal(narrowChoices([{ title: 'Haberler', url: 'https://x.example/rss.xml' }, { title: 'Haberler', url: 'https://x.example/atom.xml' }]).length, 1);
  assert.equal(narrowChoices([{ title: 'Spor', url: 'https://x.example/spor.rss' }, { title: 'Ekonomi', url: 'https://x.example/ekonomi.rss' }]).length, 2);

  const fetch = fakeFetch({ 'https://www.reddit.com/r/godot/.rss': { body: RSS('r/godot') } });
  const r = await resolveFeed('reddit.com/r/godot/top', { fetch });
  assert.equal(r.url, 'https://www.reddit.com/r/godot/.rss');
  const gh = await resolveFeed('https://github.com/godotengine/godot', { fetch });
  assert.equal(gh.choices[0].url, 'https://github.com/godotengine/godot/releases.atom');
  assert.deepEqual(gh.choices.map((c) => c.kind), ['releases', 'tags', 'commits']);
});

test('koşullu istek ve 403 sonrası tarayıcı kimliğiyle yeniden deneme', async () => {
  const log = [];
  const fetch = fakeFetch(
    {
      'https://site.example/feed': (opts) =>
        opts.headers['If-None-Match'] === '"v1"' ? { status: 304 } : opts.headers['User-Agent'] === UA ? { status: 403, body: 'yasak' } : { body: RSS('Açıldı') },
    },
    log
  );
  assert.deepEqual(await fetchFeed('https://site.example/feed', { fetch, etag: '"v1"' }), { notModified: true, url: 'https://site.example/feed' });
  const r = await fetchFeed('https://site.example/feed', { fetch });
  assert.equal(r.feed.title, 'Açıldı');
  assert.equal(log.length, 3);
  assert.notEqual(log[2].headers['User-Agent'], UA);
});

test('hatalar dilden bağımsız kodlarla gelir', async () => {
  await assert.rejects(fetchFeed('https://site.example/yok', { fetch: fakeFetch({}) }), (e) => e.code === 'http404');
  const down = async () => {
    throw Object.assign(new TypeError('fetch failed'), { cause: { code: 'ENOTFOUND' } });
  };
  await assert.rejects(fetchFeed('https://site.example/', { fetch: down }), (e) => e.code === 'dns');
});

test('HTML içindeki besleme ve simge bağlantıları', () => {
  const html = `<link rel="icon" href="/favicon-16.png" sizes="16x16"><link rel="apple-touch-icon" href="/apple.png"><link rel="icon" sizes="64x64" href="/f64.png">
    <link type="application/feed+json" rel="alternate" href="/feed.json" title="JSON Feed">`;
  assert.deepEqual(iconLinks(html, 'https://s.example/'), ['https://s.example/f64.png', 'https://s.example/apple.png', 'https://s.example/favicon-16.png']);
  assert.deepEqual(findFeedLinks(html, 'https://s.example/'), [{ url: 'https://s.example/feed.json', title: 'JSON Feed' }]);
});

test('OPML gidiş-dönüş', () => {
  const feeds = [
    { url: 'https://a.example/feed', title: 'A & B', folder: 'Oyun', siteUrl: 'https://a.example/' },
    { url: 'https://c.example/rss', title: 'C', name: 'Özel C', folder: '' },
  ];
  const back = parseOpml(buildOpml(feeds));
  assert.deepEqual(back, [
    { url: 'https://a.example/feed', title: 'A & B', siteUrl: 'https://a.example/', folder: 'Oyun' },
    { url: 'https://c.example/rss', title: 'Özel C', siteUrl: '', folder: '' },
  ]);
  assert.throws(() => parseOpml('<html></html>'), (e) => e.code === 'opmlInvalid');
});
