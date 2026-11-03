// Beslemeleri indirir: karakter kodlamasını çözer (Türkçe siteler için windows-1254 / ISO-8859-9 dahil),
// koşullu istek atar (ETag / Last-Modified), site adresi verilirse beslemeyi kendisi bulur ve simge indirir.
// `fetch` dışarıdan verilir: uygulamada Electron'un net.fetch'i (sistem vekil sunucusunu kullanır), testlerde sahtesi.
const { parseFeed, NotFeedError, decodeEntities } = require('./feed-parser');
const { AppError } = require('./errors');

const UA = 'Mozilla/5.0 (compatible; Feedbell/1.0; RSS okuyucu)';
const BROWSER_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36';
const FEED_ACCEPT =
  'application/rss+xml, application/atom+xml, application/feed+json, application/xml;q=0.9, text/xml;q=0.9, application/json;q=0.8, text/html;q=0.7, */*;q=0.5';
const MAX_BYTES = 15 * 1024 * 1024;
const MAX_ICON_BYTES = 300 * 1024;
const COMMON_PATHS = ['/feed', '/rss', '/feed.xml', '/rss.xml', '/atom.xml', '/index.xml', '/feed.json', '/feeds/posts/default'];

function normalizeUrl(input) {
  let s = String(input || '').trim();
  if (!s) throw new AppError('emptyUrl', {}, 'Type an address.');
  s = s.replace(/^feed:\/\//i, 'http://').replace(/^feed:/i, '');
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(s)) s = `https://${s.replace(/^\/+/, '')}`;
  let u;
  try {
    u = new URL(s);
  } catch {
    throw new AppError('invalidUrl', {}, 'Not a valid address.');
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') throw new AppError('httpOnly', {}, 'Only http and https addresses are supported.');
  if (!u.hostname.includes('.') && u.hostname !== 'localhost') throw new AppError('invalidUrl', {}, 'Not a valid address.');
  u.hash = '';
  return u.href;
}

// Karşılaştırma için: protokol, "www." ve sondaki "/" fark etmez.
function urlKey(url) {
  try {
    const u = new URL(url);
    return `${u.hostname.replace(/^www\./, '')}${u.pathname.replace(/\/+$/, '')}${u.search}`.toLowerCase();
  } catch {
    return String(url).toLowerCase();
  }
}

function httpError(status) {
  const known = [400, 401, 403, 404, 410, 429];
  const code = known.includes(status) ? `http${status}` : status >= 500 ? 'http5xx' : 'httpOther';
  const e = new AppError(code, { status }, `HTTP ${status}`);
  e.status = status;
  return e;
}

function networkError(err, timedOut) {
  if (timedOut) return new AppError('timeout', {}, 'Connection timed out');
  const m = String((err && (err.cause?.code || err.code || err.message)) || err);
  if (/NAME_NOT_RESOLVED|ENOTFOUND|EAI_AGAIN/i.test(m)) return new AppError('dns', {}, m);
  if (/INTERNET_DISCONNECTED|NETWORK_CHANGED|ENETUNREACH/i.test(m)) return new AppError('offline', {}, m);
  if (/CONNECTION_REFUSED|ECONNREFUSED/i.test(m)) return new AppError('refused', {}, m);
  if (/CERT|SSL|TLS/i.test(m)) return new AppError('certificate', {}, m);
  if (/TIMED_OUT|ETIMEDOUT|aborted/i.test(m)) return new AppError('timeout', {}, m);
  if (/TOO_MANY_REDIRECTS/i.test(m)) return new AppError('redirects', {}, m);
  return new AppError('network', { detail: m.replace(/^net::/, '') }, m);
}

function sniffCharset(buf, contentType) {
  const m = /charset\s*=\s*["']?([\w.:-]+)/i.exec(contentType || '');
  if (m) return m[1];
  if (buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf) return 'utf-8';
  if (buf[0] === 0xff && buf[1] === 0xfe) return 'utf-16le';
  if (buf[0] === 0xfe && buf[1] === 0xff) return 'utf-16be';
  const head = buf.subarray(0, 1024).toString('latin1');
  const x = /<\?xml[^>]*encoding\s*=\s*["']([\w.:-]+)/i.exec(head);
  if (x) return x[1];
  const h = /<meta[^>]+charset\s*=\s*["']?([\w.:-]+)/i.exec(head);
  if (h) return h[1];
  return 'utf-8';
}

function decodeBody(buf, contentType) {
  const label = sniffCharset(buf, contentType);
  let out;
  try {
    out = new TextDecoder(label).decode(buf);
  } catch {
    out = new TextDecoder('utf-8').decode(buf);
  }
  // Kodlamasını yanlış bildiren Türkçe siteler: UTF-8 diye çözülemiyorsa windows-1254 dene.
  if (/^utf-?8$/i.test(label) && (out.match(/�/g) || []).length > 3) {
    try {
      const tr = new TextDecoder('windows-1254').decode(buf);
      if (!tr.includes('�')) out = tr;
    } catch {
      /* desteklenmiyorsa olduğu gibi kalsın */
    }
  }
  return out;
}

async function request(url, opts = {}) {
  const { fetch, etag, lastModified, timeoutMs = 20000, accept = FEED_ACCEPT, ua = UA, maxBytes = MAX_BYTES } = opts;
  if (typeof fetch !== 'function') throw new Error('fetch verilmedi');
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const headers = { 'User-Agent': ua, Accept: accept, 'Accept-Language': 'tr-TR,tr;q=0.9,en;q=0.8' };
    if (etag) headers['If-None-Match'] = etag;
    if (lastModified) headers['If-Modified-Since'] = lastModified;
    let res;
    try {
      res = await fetch(url, { headers, signal: ctrl.signal, redirect: 'follow' });
    } catch (e) {
      throw networkError(e, ctrl.signal.aborted);
    }
    const finalUrl = res.url || url;
    if (res.status === 304) return { status: 304, url: finalUrl };
    // Bazı siteler tarayıcı dışı istemcileri engelliyor; bir kez tarayıcı kimliğiyle yeniden dene.
    if (res.status === 403 && ua === UA) {
      clearTimeout(timer);
      return request(url, { ...opts, ua: BROWSER_UA });
    }
    if (!res.ok) throw httpError(res.status);
    const len = +res.headers.get('content-length') || 0;
    if (len > maxBytes) throw new AppError('tooLarge', {}, 'Response too large');
    let buf;
    try {
      buf = Buffer.from(await res.arrayBuffer());
    } catch (e) {
      throw networkError(e, ctrl.signal.aborted);
    }
    if (buf.length > maxBytes) throw new AppError('tooLarge', {}, 'Response too large');
    return {
      status: res.status,
      url: finalUrl,
      contentType: res.headers.get('content-type') || '',
      buf,
      etag: res.headers.get('etag') || '',
      lastModified: res.headers.get('last-modified') || '',
    };
  } finally {
    clearTimeout(timer);
  }
}

const bodyText = (r) => decodeBody(r.buf, r.contentType);

async function fetchFeed(url, opts = {}) {
  const r = await request(url, opts);
  if (r.status === 304) return { notModified: true, url: r.url };
  const feed = parseFeed(bodyText(r), r.url);
  return { feed, url: r.url, etag: r.etag, lastModified: r.lastModified };
}

function tagAttrs(tag) {
  const attrs = {};
  const re = /([^\s=/<>]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g;
  let m;
  while ((m = re.exec(tag))) attrs[m[1].toLowerCase()] = decodeEntities(m[2] ?? m[3] ?? m[4] ?? '');
  return attrs;
}

const FEED_TYPES = /^application\/(rss\+xml|atom\+xml|feed\+json|rdf\+xml|json|xml)$|^text\/xml$/i;

// HTML sayfasındaki <link rel="alternate" type="application/rss+xml"> etiketlerini bulur.
function findFeedLinks(html, base) {
  const out = [];
  const seen = new Set();
  const head = html.slice(0, 400000);
  for (const m of head.matchAll(/<link\b[^>]*>/gi)) {
    const a = tagAttrs(m[0]);
    const rel = (a.rel || '').toLowerCase().split(/\s+/);
    const type = (a.type || '').toLowerCase().split(';')[0].trim();
    if (!a.href || !(rel.includes('alternate') || rel.includes('feed'))) continue;
    if (!FEED_TYPES.test(type)) continue;
    if (type === 'application/json' && !/feed/i.test(`${a.title || ''} ${a.href}`)) continue;
    let href;
    try {
      href = new URL(a.href, base).href;
    } catch {
      continue;
    }
    if (seen.has(urlKey(href))) continue;
    seen.add(urlKey(href));
    out.push({ url: href, title: (a.title || '').trim() });
  }
  // Yorum beslemeleri sona.
  return out.sort((x, y) => isCommentFeed(x) - isCommentFeed(y));
}

const isCommentFeed = (c) => /comment|yorum/i.test(`${c.title} ${c.url}`);

// Aynı beslemenin farklı biçimlerini (RSS 2.0 / Atom) ve yorum beslemelerini eler.
function narrowChoices(links) {
  const main = links.filter((c) => !isCommentFeed(c));
  const list = main.length ? main : links;
  const seen = new Set();
  return list.filter((c) => {
    const key = c.title
      .toLowerCase()
      .replace(/\b(rss|atom|json|xml|feed|besleme)\b|\d+(\.\d+)?|[»|:·–-]/gi, '')
      .trim();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// Bazı büyük sitelerin besleme adresleri sayfada yazmaz ama bilinir.
function knownFeeds(url) {
  const u = new URL(url);
  const host = u.hostname.replace(/^(www|old|new|m)\./, '');
  const parts = u.pathname.split('/').filter(Boolean);
  if (host === 'reddit.com' && parts[0] === 'r' && parts[1] && !u.pathname.endsWith('.rss')) {
    return { url: `https://www.reddit.com/r/${parts[1]}/.rss` };
  }
  if (host === 'github.com' && parts.length === 2 && !/\.atom$/.test(u.pathname)) {
    const base = `https://github.com/${parts[0]}/${parts[1]}`;
    return {
      choices: [
        // kind: arayüz kendi dilinde "yeni sürümler / etiketler / commitler" yazar
        { url: `${base}/releases.atom`, title: parts[1], kind: 'releases' },
        { url: `${base}/tags.atom`, title: parts[1], kind: 'tags' },
        { url: `${base}/commits.atom`, title: parts[1], kind: 'commits' },
      ],
    };
  }
  return null;
}

function looksLikeHtml(text, contentType) {
  return /html/i.test(contentType || '') || /^\s*(<!doctype html|<html)/i.test(text);
}

// Kullanıcının yazdığı adresi (besleme ya da site) bir beslemeye çevirir.
//   { url, result }   → doğrudan eklenebilir
//   { choices: [...] } → sayfada birden çok besleme var, kullanıcı seçmeli
async function resolveFeed(input, opts = {}) {
  const url = normalizeUrl(input);
  const known = knownFeeds(url);
  if (known?.choices) return { choices: known.choices };
  if (known?.url) return { url: known.url, result: await fetchFeed(known.url, opts) };
  const r = await request(url, opts);
  const text = bodyText(r);
  try {
    const feed = parseFeed(text, r.url);
    return { url, result: { feed, url: r.url, etag: r.etag, lastModified: r.lastModified } };
  } catch (e) {
    if (!(e instanceof NotFeedError)) throw e;
  }
  if (!looksLikeHtml(text, r.contentType)) throw new NotFeedError();

  const links = narrowChoices(findFeedLinks(text, r.url));
  if (links.length > 1) return { choices: links };
  if (links.length === 1) {
    const one = await fetchFeed(links[0].url, opts);
    return { url: links[0].url, result: one };
  }
  for (const p of COMMON_PATHS) {
    const candidate = new URL(p, r.url).href;
    try {
      const one = await fetchFeed(candidate, { ...opts, timeoutMs: 8000 });
      return { url: candidate, result: one };
    } catch {
      /* sıradakini dene */
    }
  }
  throw new NotFeedError('noFeedOnPage', 'No RSS/Atom feed found on this page.');
}

// --- Simgeler ---------------------------------------------------------------------------

function imageMime(buf, contentType) {
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return 'image/png';
  if (buf[0] === 0xff && buf[1] === 0xd8) return 'image/jpeg';
  if (buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46) return 'image/gif';
  if (buf[0] === 0x00 && buf[1] === 0x00 && buf[2] === 0x01 && buf[3] === 0x00) return 'image/x-icon';
  if (buf.subarray(0, 4).toString('latin1') === 'RIFF' && buf.subarray(8, 12).toString('latin1') === 'WEBP') return 'image/webp';
  const head = buf.subarray(0, 300).toString('utf8').trimStart();
  if (/^(<\?xml[^>]*>\s*)?<svg\b/i.test(head)) return 'image/svg+xml';
  if (/^image\//i.test(contentType)) return contentType.split(';')[0].trim();
  return '';
}

function iconLinks(html, base) {
  const out = [];
  for (const m of html.slice(0, 300000).matchAll(/<link\b[^>]*>/gi)) {
    const a = tagAttrs(m[0]);
    const rel = (a.rel || '').toLowerCase();
    if (!a.href || !/(^|\s)(icon|apple-touch-icon|apple-touch-icon-precomposed)(\s|$)/.test(rel)) continue;
    let href;
    try {
      href = new URL(a.href, base).href;
    } catch {
      continue;
    }
    const size = Math.max(0, ...String(a.sizes || '').split(/\s+/).map((s) => parseInt(s, 10) || 0));
    // Liste satırında 16–20 px'te görünecek: 32–192 px arası ideal.
    const score = rel.includes('apple-touch') ? 150 : size ? (size >= 32 && size <= 256 ? 200 + size / 10 : 100) : 120;
    out.push({ href, score });
  }
  return out.sort((a, b) => b.score - a.score).map((x) => x.href);
}

async function fetchImage(url, opts) {
  const r = await request(url, { ...opts, accept: 'image/*,*/*;q=0.5', ua: BROWSER_UA, timeoutMs: 10000, maxBytes: MAX_ICON_BYTES });
  if (r.status !== 200 || !r.buf.length) return '';
  const mime = imageMime(r.buf, r.contentType);
  if (!mime) return '';
  return `data:${mime};base64,${r.buf.toString('base64')}`;
}

async function findIcon({ siteUrl, feedIcon, feedUrl }, opts = {}) {
  const candidates = [];
  const home = siteUrl || (feedUrl ? new URL('/', feedUrl).href : '');
  if (home) {
    try {
      const r = await request(home, { ...opts, accept: 'text/html', ua: BROWSER_UA, timeoutMs: 10000 });
      if (r.status === 200) candidates.push(...iconLinks(bodyText(r), r.url));
    } catch {
      /* site açılmazsa varsayılan yollar denenir */
    }
    candidates.push(new URL('/favicon.ico', home).href);
  }
  if (feedIcon) candidates.push(feedIcon);
  for (const c of [...new Set(candidates)].slice(0, 5)) {
    try {
      const img = await fetchImage(c, opts);
      if (img) return img;
    } catch {
      /* sıradaki aday */
    }
  }
  return '';
}

module.exports = {
  normalizeUrl,
  urlKey,
  request,
  fetchFeed,
  resolveFeed,
  findFeedLinks,
  narrowChoices,
  findIcon,
  iconLinks,
  decodeBody,
  sniffCharset,
  UA,
};
