// RSS 2.0, RSS 1.0 (RDF), Atom ve JSON Feed beslemelerini tek bir biçime çevirir:
//   { format, title, siteUrl, description, icon, items: [{ key, title, link, author, date, html, summary, image, enclosure, comments }] }
// Bağımlılık yok: içinde hataya dayanıklı küçük bir XML ayrıştırıcı var. Kapanmamış etiketleri,
// HTML varlıklarını (&nbsp; vb.) ve bildirilmemiş ad alanı öneklerini tolere eder.

const { AppError } = require('./errors');

class NotFeedError extends AppError {
  constructor(code = 'notFeed', message = 'This address is not an RSS/Atom feed.') {
    super(code, {}, message);
    this.name = 'NotFeedError';
  }
}

const normNs = (u) => String(u || '').trim().replace(/[/#]+$/, '').toLowerCase();

const NS = {
  atom: normNs('http://www.w3.org/2005/Atom'),
  atom03: normNs('http://purl.org/atom/ns#'),
  rdf: normNs('http://www.w3.org/1999/02/22-rdf-syntax-ns#'),
  content: normNs('http://purl.org/rss/1.0/modules/content/'),
  dc: normNs('http://purl.org/dc/elements/1.1/'),
  media: normNs('http://search.yahoo.com/mrss/'),
  itunes: normNs('http://www.itunes.com/dtds/podcast-1.0.dtd'),
  feedburner: normNs('http://rssnamespace.org/feedburner/ext/1.0'),
  xhtml: normNs('http://www.w3.org/1999/xhtml'),
};

// Önek bildirilmemişse (bozuk beslemelerde sık görülür) yaygın karşılıkları kullanılır.
const ROOT_SCOPE = { '': '', xml: 'xml', ...NS };
const EXTENSION_NS = new Set([NS.atom, NS.atom03, NS.rdf, NS.content, NS.dc, NS.media, NS.itunes, NS.feedburner]);

// --- Varlıklar ---------------------------------------------------------------------

const ENTITIES = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', ensp: ' ', emsp: ' ', thinsp: ' ',
  copy: '©', reg: '®', trade: '™', hellip: '…', mdash: '—', ndash: '–', minus: '−',
  lsquo: '‘', rsquo: '’', sbquo: '‚', ldquo: '“', rdquo: '”', bdquo: '„', laquo: '«', raquo: '»', lsaquo: '‹', rsaquo: '›',
  bull: '•', middot: '·', prime: '′', Prime: '″', dagger: '†', Dagger: '‡', permil: '‰',
  euro: '€', pound: '£', yen: '¥', cent: '¢', curren: '¤', deg: '°', plusmn: '±', times: '×', divide: '÷',
  frac12: '½', frac14: '¼', frac34: '¾', sup1: '¹', sup2: '²', sup3: '³', micro: 'µ', sect: '§', para: '¶',
  iexcl: '¡', iquest: '¿', shy: '­', acute: '´', uml: '¨', cedil: '¸', macr: '¯', ordf: 'ª', ordm: 'º', not: '¬', brvbar: '¦',
  larr: '←', rarr: '→', uarr: '↑', darr: '↓', harr: '↔', hearts: '♥', check: '✓',
  ccedil: 'ç', Ccedil: 'Ç', gbreve: 'ğ', Gbreve: 'Ğ', inodot: 'ı', imath: 'ı', Idot: 'İ', ouml: 'ö', Ouml: 'Ö',
  scedil: 'ş', Scedil: 'Ş', uuml: 'ü', Uuml: 'Ü',
  auml: 'ä', Auml: 'Ä', aring: 'å', Aring: 'Å', aelig: 'æ', AElig: 'Æ', oslash: 'ø', Oslash: 'Ø', szlig: 'ß', ntilde: 'ñ', Ntilde: 'Ñ',
  aacute: 'á', eacute: 'é', iacute: 'í', oacute: 'ó', uacute: 'ú', yacute: 'ý', Aacute: 'Á', Eacute: 'É', Iacute: 'Í', Oacute: 'Ó', Uacute: 'Ú',
  agrave: 'à', egrave: 'è', igrave: 'ì', ograve: 'ò', ugrave: 'ù', Agrave: 'À', Egrave: 'È',
  acirc: 'â', ecirc: 'ê', icirc: 'î', ocirc: 'ô', ucirc: 'û', Acirc: 'Â', Ecirc: 'Ê', Icirc: 'Î', Ocirc: 'Ô', Ucirc: 'Û',
  atilde: 'ã', otilde: 'õ', euml: 'ë', iuml: 'ï', yuml: 'ÿ', zwj: '‍', zwnj: '‌', lrm: '‎', rlm: '‏',
};

// &#146; gibi Windows-1252 kodları tarayıcılardaki gibi gerçek karakterlere çevrilir.
const CP1252 = {
  128: '€', 130: '‚', 131: 'ƒ', 132: '„', 133: '…', 134: '†', 135: '‡', 136: 'ˆ', 137: '‰', 138: 'Š', 139: '‹', 140: 'Œ', 142: 'Ž',
  145: '‘', 146: '’', 147: '“', 148: '”', 149: '•', 150: '–', 151: '—', 152: '˜', 153: '™', 154: 'š', 155: '›', 156: 'œ', 158: 'ž', 159: 'Ÿ',
};

function decodeEntities(s) {
  if (!s || s.indexOf('&') === -1) return s || '';
  return s.replace(/&(?:#(\d{1,7})|#[xX]([0-9a-fA-F]{1,6})|([A-Za-z][A-Za-z0-9]{1,31}));/g, (m, dec, hex, name) => {
    if (name) return Object.hasOwn(ENTITIES, name) ? ENTITIES[name] : m;
    const cp = dec ? parseInt(dec, 10) : parseInt(hex, 16);
    if (CP1252[cp]) return CP1252[cp];
    if (!cp || cp > 0x10ffff || (cp >= 0xd800 && cp <= 0xdfff)) return '�';
    return String.fromCodePoint(cp);
  });
}

const escapeHtml = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const escapeAttr = (s) => escapeHtml(s).replace(/"/g, '&quot;');

// --- XML ayrıştırıcı --------------------------------------------------------------

const NAME_RE = /[A-Za-z_][\w.\-:]*/y;
const ATTR_RE = /([^\s=/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/y;
const WS_RE = /\s*/y;

function makeElement(name, attrs, parent) {
  let scope = parent.scope;
  for (const k of Object.keys(attrs)) {
    if (k !== 'xmlns' && !k.startsWith('xmlns:')) continue;
    if (scope === parent.scope) scope = Object.create(parent.scope);
    scope[k === 'xmlns' ? '' : k.slice(6)] = normNs(attrs[k]);
  }
  const colon = name.indexOf(':');
  const prefix = colon > 0 ? name.slice(0, colon) : '';
  const local = colon > 0 ? name.slice(colon + 1) : name;
  const ns = prefix in scope ? scope[prefix] : scope[prefix.toLowerCase()] ?? prefix;
  return { name, local, prefix, ns, attrs, children: [], scope };
}

function addText(el, s) {
  if (!s) return;
  const last = el.children.length - 1;
  if (last >= 0 && typeof el.children[last] === 'string') el.children[last] += s;
  else el.children.push(s);
}

function closeTag(stack, name) {
  const lower = name.toLowerCase();
  for (let k = stack.length - 1; k > 0; k--) {
    if (stack[k].name === name || stack[k].name.toLowerCase() === lower) {
      stack.length = k;
      return;
    }
  }
}

function parseXml(src) {
  const root = { name: '#root', local: '#root', prefix: '', ns: '', attrs: {}, children: [], scope: ROOT_SCOPE };
  const stack = [root];
  const n = src.length;
  let i = 0;
  while (i < n) {
    const top = stack[stack.length - 1];
    const lt = src.indexOf('<', i);
    if (lt === -1) {
      addText(top, decodeEntities(src.slice(i)));
      break;
    }
    if (lt > i) addText(top, decodeEntities(src.slice(i, lt)));
    const c = src[lt + 1];
    if (c === '!') {
      if (src.startsWith('<!--', lt)) {
        const e = src.indexOf('-->', lt + 4);
        i = e < 0 ? n : e + 3;
      } else if (src.startsWith('<![CDATA[', lt)) {
        const e = src.indexOf(']]>', lt + 9);
        addText(top, src.slice(lt + 9, e < 0 ? n : e));
        i = e < 0 ? n : e + 3;
      } else {
        // <!DOCTYPE ... [ ... ]>
        let depth = 0;
        let j = lt + 2;
        for (; j < n; j++) {
          const ch = src[j];
          if (ch === '[') depth++;
          else if (ch === ']') depth--;
          else if (ch === '>' && depth <= 0) break;
        }
        i = j + 1;
      }
      continue;
    }
    if (c === '?') {
      const e = src.indexOf('?>', lt + 2);
      i = e < 0 ? n : e + 2;
      continue;
    }
    if (c === '/') {
      const e = src.indexOf('>', lt + 2);
      closeTag(stack, src.slice(lt + 2, e < 0 ? n : e).trim());
      i = e < 0 ? n : e + 1;
      continue;
    }
    NAME_RE.lastIndex = lt + 1;
    const m = NAME_RE.exec(src);
    if (!m) {
      addText(top, '<');
      i = lt + 1;
      continue;
    }
    const name = m[0];
    const attrs = {};
    let j = NAME_RE.lastIndex;
    let selfClose = false;
    while (j < n) {
      WS_RE.lastIndex = j;
      WS_RE.exec(src);
      j = WS_RE.lastIndex;
      if (src[j] === '>') {
        j++;
        break;
      }
      if (src[j] === '/' && src[j + 1] === '>') {
        selfClose = true;
        j += 2;
        break;
      }
      ATTR_RE.lastIndex = j;
      const a = ATTR_RE.exec(src);
      if (!a || !a[0]) {
        j++;
        continue;
      }
      attrs[a[1]] = decodeEntities(a[2] ?? a[3] ?? a[4] ?? '');
      j = ATTR_RE.lastIndex;
    }
    const el = makeElement(name, attrs, top);
    top.children.push(el);
    if (!selfClose) stack.push(el);
    i = j;
  }
  return root;
}

// --- Ağaç yardımcıları --------------------------------------------------------------

const isEl = (c) => typeof c !== 'string';
const plain = (c) => !EXTENSION_NS.has(c.ns); // RSS 2.0 / RSS 1.0 kendi öğeleri
const atomish = (c) => c.ns === NS.atom || c.ns === NS.atom03 || c.ns === '';
const inNs = (ns) => (c) => c.ns === ns;

function first(el, local, pred) {
  if (!el) return null;
  for (const c of el.children) if (isEl(c) && c.local === local && (!pred || pred(c))) return c;
  return null;
}

function all(el, local, pred) {
  if (!el) return [];
  return el.children.filter((c) => isEl(c) && c.local === local && (!pred || pred(c)));
}

// Bozuk beslemelerde (ör. kapanmamış bir etiketin içine düşmüş) öğeleri bulmak için derin arama.
function deep(el, local, pred, out = []) {
  if (!el) return out;
  for (const c of el.children) {
    if (!isEl(c)) continue;
    if (c.local === local && (!pred || pred(c))) out.push(c);
    else deep(c, local, pred, out);
  }
  return out;
}

function text(el) {
  if (!el) return '';
  let s = '';
  for (const c of el.children) s += typeof c === 'string' ? c : text(c);
  return s;
}

const VOID = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr']);

function serialize(node) {
  if (typeof node === 'string') return escapeHtml(node);
  const attrs = Object.entries(node.attrs)
    .filter(([k]) => k !== 'xmlns' && !k.startsWith('xmlns:'))
    .map(([k, v]) => ` ${k}="${escapeAttr(v)}"`)
    .join('');
  const inner = node.children.map(serialize).join('');
  if (VOID.has(node.local.toLowerCase())) return `<${node.local}${attrs}>${inner}`;
  return `<${node.local}${attrs}>${inner}</${node.local}>`;
}

const innerXml = (el) => (el ? el.children.map(serialize).join('') : '');

// Kaçışsız ham HTML içeren öğeler (geçersiz ama yaygın) için iç yapıyı yeniden HTML'e çevirir.
function markup(el) {
  if (!el) return '';
  return el.children.some(isEl) ? innerXml(el) : text(el);
}

// --- Metin yardımcıları ------------------------------------------------------------

function htmlToText(html) {
  if (!html) return '';
  return decodeEntities(
    String(html)
      .replace(/<(script|style|noscript|template)\b[\s\S]*?<\/\1\s*>/gi, ' ')
      .replace(/<!--[\s\S]*?-->/g, ' ')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/(p|div|li|h[1-6]|blockquote|tr|figure|figcaption|section|article)\s*>/gi, '\n')
      .replace(/<\/?(a|b|i|em|strong|span|code|small|sup|sub|u|s|mark|abbr|cite|q|time|font|kbd|var|del|ins)\b[^>]*>/gi, '')
      .replace(/<\/?[a-zA-Z!][^>]*>/g, ' ')
  )
    .replace(/[ \t \r\f\v]+/g, ' ')
    .replace(/ *\n[\s]*/g, '\n')
    .trim();
}

const oneLine = (s) => String(s || '').replace(/\s+/g, ' ').trim();

function cleanTitle(s) {
  let t = oneLine(s);
  if (/<\/?[a-z][^>]*>|&[#a-z0-9]+;/i.test(t)) t = oneLine(htmlToText(t));
  return t;
}

function summarize(html, max = 300) {
  const t = oneLine(htmlToText(html));
  if (t.length <= max) return t;
  const cut = t.slice(0, max);
  const sp = cut.lastIndexOf(' ');
  return `${(sp > max * 0.6 ? cut.slice(0, sp) : cut).replace(/[\s,.;:!?-]+$/, '')}…`;
}

function cleanAuthor(s) {
  const t = oneLine(s);
  // "ad@site.com (Ad Soyad)" → "Ad Soyad"
  const m = /^\S+@\S+\s*\((.+)\)$/.exec(t);
  return m ? m[1].trim() : t;
}

function resolveUrl(u, base) {
  const s = oneLine(u);
  if (!s) return '';
  try {
    return new URL(s, base || undefined).href;
  } catch {
    return /^https?:\/\//i.test(s) ? s : '';
  }
}

const TR_MONTHS = {
  ocak: 'Jan', şubat: 'Feb', subat: 'Feb', mart: 'Mar', nisan: 'Apr', mayıs: 'May', mayis: 'May', haziran: 'Jun',
  temmuz: 'Jul', ağustos: 'Aug', agustos: 'Aug', eylül: 'Sep', eylul: 'Sep', ekim: 'Oct', kasım: 'Nov', kasim: 'Nov',
  aralık: 'Dec', aralik: 'Dec', oca: 'Jan', şub: 'Feb', nis: 'Apr', haz: 'Jun', tem: 'Jul', ağu: 'Aug', eyl: 'Sep', eki: 'Oct', kas: 'Nov', ara: 'Dec',
};
const TR_DAYS = new Set(['pazartesi', 'salı', 'sali', 'çarşamba', 'carsamba', 'perşembe', 'persembe', 'cuma', 'cumartesi', 'pazar', 'pzt', 'sal', 'çar', 'per', 'cum', 'cmt', 'paz']);

function parseDate(s) {
  const raw = oneLine(s);
  if (!raw) return null;
  let t = Date.parse(raw);
  if (Number.isNaN(t)) {
    // Türkçe ay/gün adları: "Salı, 28 Ekim 2026 14:30:00 +0300"
    const x = raw
      .toLocaleLowerCase('tr')
      .replace(/[a-zçğıöşü]+/g, (w) => TR_MONTHS[w] || (TR_DAYS.has(w) ? '' : w))
      .replace(/^[\s,]+/, '');
    t = Date.parse(x);
  }
  if (Number.isNaN(t)) {
    // "28.10.2026 14:30" biçimi (yerel saat)
    const m = /^(\d{1,2})[./](\d{1,2})[./](\d{4})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?/.exec(raw);
    if (m) t = new Date(+m[3], +m[2] - 1, +m[1], +(m[4] || 0), +(m[5] || 0), +(m[6] || 0)).getTime();
  }
  return Number.isNaN(t) ? null : t;
}

function firstImage(html, base) {
  if (!html) return '';
  const re = /<img\b[^>]*>/gi;
  let m;
  while ((m = re.exec(html))) {
    const tag = m[0];
    if (/\b(width|height)\s*=\s*["']?1["'\s/>]/i.test(tag)) continue; // izleme pikseli
    const src = /\b(?:data-src|data-lazy-src|src)\s*=\s*["']([^"']+)["']/i.exec(tag);
    if (!src || /^data:/i.test(src[1].trim())) continue;
    const u = resolveUrl(decodeEntities(src[1]), base);
    if (u) return u;
  }
  return '';
}

function mediaImage(el, base) {
  const media = inNs(NS.media);
  const groups = [el, ...all(el, 'group', media)];
  for (const g of groups) {
    const th = first(g, 'thumbnail', media);
    if (th && th.attrs.url) return resolveUrl(th.attrs.url, base);
  }
  for (const g of groups) {
    for (const mc of all(g, 'content', media)) {
      const type = mc.attrs.type || '';
      if (mc.attrs.url && (mc.attrs.medium === 'image' || type.startsWith('image/'))) return resolveUrl(mc.attrs.url, base);
    }
  }
  const it = first(el, 'image', inNs(NS.itunes));
  if (it && it.attrs.href) return resolveUrl(it.attrs.href, base);
  return '';
}

function atomLink(el, base) {
  const links = all(el, 'link', (c) => c.ns === NS.atom || c.ns === NS.atom03 || (c.ns === '' && !!c.attrs.href));
  const alt = links.filter((l) => !l.attrs.rel || l.attrs.rel === 'alternate');
  const pick = alt.find((l) => !l.attrs.type || /html/i.test(l.attrs.type)) || alt[0] || links.find((l) => l.attrs.rel !== 'self') || null;
  // Bazı beslemeler adresi href yerine metin olarak yazar: <link rel="alternate">https://…</link>
  return pick ? resolveUrl(pick.attrs.href || text(pick), base) : '';
}

// Atom metin yapısı (title, subtitle, summary): düz metin döner.
function atomText(el) {
  if (!el) return '';
  const type = (el.attrs.type || 'text').toLowerCase();
  if (type === 'xhtml') return oneLine(htmlToText(innerXml(first(el, 'div') || el)));
  if (type === 'html' || type === 'text/html') return cleanTitle(text(el));
  return cleanTitle(text(el));
}

// Atom içerik yapısı (content, summary): HTML döner.
function atomHtml(el) {
  if (!el) return '';
  const type = (el.attrs.type || 'text').toLowerCase();
  if (type === 'xhtml') {
    const div = first(el, 'div');
    return div ? innerXml(div) : innerXml(el);
  }
  if (type === 'html' || type === 'text/html') return markup(el);
  if (type === 'text' || type === 'text/plain') {
    const t = text(el);
    // Türü belirtmeden HTML koyan beslemeler çok yaygın.
    if (/<\/?[a-z][\s\S]*>/i.test(t)) return t;
    return escapeHtml(t.trim()).replace(/\n/g, '<br>');
  }
  return ''; // ikili içerik (src ya da base64) desteklenmiyor
}

function plainToHtml(t) {
  const s = String(t || '').trim();
  if (!s) return '';
  return s
    .split(/\n{2,}/)
    .map((p) => `<p>${escapeHtml(p).replace(/\n/g, '<br>')}</p>`)
    .join('');
}

function finishItem(it, base) {
  const html = it.html || '';
  let title = it.title;
  if (!title) title = summarize(html, 90); // boş kalırsa arayüz "(Başlıksız)" gösterir
  const image = it.image || firstImage(html, it.link || base);
  return {
    key: it.key || it.link || `${title}|${it.dateRaw || ''}`,
    title,
    link: it.link || '',
    author: it.author || '',
    date: it.date ?? null,
    html,
    summary: it.summary != null ? it.summary : summarize(html),
    image,
    enclosure: it.enclosure || null,
    comments: it.comments || '',
  };
}

// --- Biçimler --------------------------------------------------------------------------

function rssItem(it, base) {
  const guidEl = first(it, 'guid', plain);
  const guid = oneLine(text(guidEl));
  let link = resolveUrl(text(first(it, 'origLink', inNs(NS.feedburner))), base) || resolveUrl(text(first(it, 'link', plain)), base);
  if (!link) link = atomLink(it, base);
  if (!link && guid && guidEl.attrs.isPermaLink !== 'false' && /^https?:\/\//i.test(guid)) link = guid;

  const encoded = markup(first(it, 'encoded', inNs(NS.content)));
  const desc = markup(first(it, 'description', plain));
  const mediaDesc = text(first(first(it, 'group', inNs(NS.media)), 'description', inNs(NS.media))) || text(first(it, 'description', inNs(NS.media)));
  const html = encoded || desc || plainToHtml(mediaDesc);

  const dateRaw =
    text(first(it, 'pubDate', plain)) ||
    text(first(it, 'date', inNs(NS.dc))) ||
    text(first(it, 'published', atomish)) ||
    text(first(it, 'updated', atomish)) ||
    text(first(it, 'date', plain));

  const author = cleanAuthor(
    text(first(it, 'creator', inNs(NS.dc))) || text(first(it, 'author', plain)) || text(first(it, 'author', inNs(NS.itunes)))
  );

  let enclosure = null;
  const enc = first(it, 'enclosure', plain);
  if (enc && enc.attrs.url) enclosure = { url: resolveUrl(enc.attrs.url, base), type: enc.attrs.type || '', length: +enc.attrs.length || 0 };
  let image = mediaImage(it, base);
  if (!image && enclosure && enclosure.type.startsWith('image/')) image = enclosure.url;
  if (enclosure && enclosure.type.startsWith('image/')) enclosure = null;

  return finishItem(
    {
      key: guid || link,
      title: cleanTitle(text(first(it, 'title', plain))),
      link,
      author,
      date: parseDate(dateRaw),
      dateRaw,
      html,
      summary: summarize(desc && encoded ? desc : html),
      image,
      enclosure,
      comments: resolveUrl(text(first(it, 'comments', plain)), base),
    },
    base
  );
}

function parseRss(rootEl, base) {
  const ch = first(rootEl, 'channel', plain) || rootEl;
  const siteUrl = resolveUrl(text(first(ch, 'link', plain)), base) || atomLink(ch, base);
  const img = first(ch, 'image', plain);
  let items = all(ch, 'item', plain);
  if (!items.length) items = deep(rootEl, 'item', plain);
  return {
    format: 'rss',
    title: cleanTitle(text(first(ch, 'title', plain))),
    siteUrl,
    description: oneLine(htmlToText(text(first(ch, 'description', plain)))),
    icon: resolveUrl(text(first(img, 'url', plain)), base) || mediaImage(ch, base),
    items: items.map((it) => rssItem(it, siteUrl || base)),
  };
}

function parseRdf(rootEl, base) {
  const ch = first(rootEl, 'channel', plain);
  const siteUrl = resolveUrl(text(first(ch, 'link', plain)), base);
  const img = first(rootEl, 'image', plain);
  return {
    format: 'rdf',
    title: cleanTitle(text(first(ch, 'title', plain))),
    siteUrl,
    description: oneLine(htmlToText(text(first(ch, 'description', plain)))),
    icon: resolveUrl(text(first(img, 'url', plain)), base),
    items: (all(rootEl, 'item', plain).length ? all(rootEl, 'item', plain) : deep(rootEl, 'item', plain)).map((it) => rssItem(it, siteUrl || base)),
  };
}

function parseAtom(rootEl, base) {
  const siteUrl = atomLink(rootEl, base);
  const entries = all(rootEl, 'entry', atomish);
  const items = (entries.length ? entries : deep(rootEl, 'entry', atomish)).map((e) => {
    const link = atomLink(e, base);
    const content = atomHtml(first(e, 'content', atomish));
    const summaryEl = first(e, 'summary', atomish);
    const summaryHtml = atomHtml(summaryEl);
    const mediaGroup = first(e, 'group', inNs(NS.media));
    const mediaDesc = text(first(mediaGroup, 'description', inNs(NS.media)));
    const html = content || summaryHtml || plainToHtml(mediaDesc);
    const dateRaw =
      text(first(e, 'published', atomish)) ||
      text(first(e, 'issued', atomish)) ||
      text(first(e, 'updated', atomish)) ||
      text(first(e, 'modified', atomish)) ||
      text(first(e, 'date', inNs(NS.dc)));
    const authorEl = first(e, 'author', atomish) || first(rootEl, 'author', atomish);
    return finishItem(
      {
        key: oneLine(text(first(e, 'id', atomish))) || link,
        title: atomText(first(e, 'title', atomish)),
        link,
        author: cleanAuthor(text(first(authorEl, 'name', atomish)) || text(first(e, 'creator', inNs(NS.dc)))),
        date: parseDate(dateRaw),
        dateRaw,
        html,
        summary: summarize(summaryHtml && content ? summaryHtml : html),
        image: mediaImage(e, link || base),
        comments: '',
      },
      base
    );
  });
  return {
    format: 'atom',
    title: atomText(first(rootEl, 'title', atomish)),
    siteUrl,
    description: atomText(first(rootEl, 'subtitle', atomish) || first(rootEl, 'tagline', atomish)),
    icon: resolveUrl(text(first(rootEl, 'icon', atomish)) || text(first(rootEl, 'logo', atomish)), base),
    items,
  };
}

function parseJsonFeed(obj, base) {
  const siteUrl = resolveUrl(obj.home_page_url, base);
  const items = (Array.isArray(obj.items) ? obj.items : []).map((it) => {
    const link = resolveUrl(it.url || it.external_url, siteUrl || base);
    const html = it.content_html || plainToHtml(it.content_text) || '';
    const author = (Array.isArray(it.authors) && it.authors[0]?.name) || it.author?.name || '';
    const att = Array.isArray(it.attachments) ? it.attachments.find((a) => a && a.url) : null;
    return finishItem(
      {
        key: it.id != null ? String(it.id) : link,
        title: cleanTitle(it.title || ''),
        link,
        author: oneLine(author),
        date: parseDate(it.date_published || it.date_modified),
        dateRaw: it.date_published || '',
        html,
        summary: it.summary ? summarize(it.summary) : summarize(html),
        image: resolveUrl(it.image || it.banner_image, link || base),
        enclosure: att ? { url: resolveUrl(att.url, base), type: att.mime_type || '', length: +att.size_in_bytes || 0 } : null,
      },
      base
    );
  });
  return {
    format: 'json',
    title: cleanTitle(obj.title || ''),
    siteUrl,
    description: oneLine(obj.description || ''),
    icon: resolveUrl(obj.icon || obj.favicon, base),
    items,
  };
}

function parseFeed(src, base = '') {
  const s = String(src || '').replace(/^﻿/, '').trimStart();
  if (!s) throw new NotFeedError('emptyResponse', 'The server returned an empty response.');
  if (s[0] === '{') {
    let obj;
    try {
      obj = JSON.parse(s);
    } catch {
      throw new NotFeedError();
    }
    if (obj && (/jsonfeed/i.test(String(obj.version || '')) || Array.isArray(obj.items))) return parseJsonFeed(obj, base);
    throw new NotFeedError();
  }
  if (s[0] !== '<') throw new NotFeedError();
  const root = parseXml(s);
  const top = root.children.find(isEl);
  if (!top) throw new NotFeedError();
  const name = top.local.toLowerCase();
  if (name === 'rss' || name === 'channel') return parseRss(top, base);
  if (name === 'rdf') return parseRdf(top, base);
  if (name === 'feed') return parseAtom(top, base);
  throw new NotFeedError();
}

module.exports = {
  parseFeed,
  parseXml,
  NotFeedError,
  decodeEntities,
  htmlToText,
  summarize,
  parseDate,
  resolveUrl,
  text,
  first,
  all,
  escapeHtml,
};
