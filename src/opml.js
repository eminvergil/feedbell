// OPML: diğer RSS okuyucularıyla abonelik listesi alışverişi.
const { parseXml, all, escapeHtml } = require('./feed-parser');
const { displayName } = require('./store');
const { AppError } = require('./errors');

const attr = (s) => escapeHtml(s).replace(/"/g, '&quot;');

function buildOpml(feeds, { now = new Date(), title = 'Feedbell' } = {}) {
  const line = (f, pad) =>
    `${pad}<outline type="rss" text="${attr(displayName(f))}" title="${attr(displayName(f))}" xmlUrl="${attr(f.url)}"${f.siteUrl ? ` htmlUrl="${attr(f.siteUrl)}"` : ''}/>`;
  const loose = feeds.filter((f) => !f.folder);
  const folders = [...new Set(feeds.map((f) => f.folder).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'tr'));
  const body = [
    ...folders.map(
      (name) =>
        `    <outline text="${attr(name)}" title="${attr(name)}">\n${feeds
          .filter((f) => f.folder === name)
          .map((f) => line(f, '      '))
          .join('\n')}\n    </outline>`
    ),
    ...loose.map((f) => line(f, '    ')),
  ];
  return `<?xml version="1.0" encoding="UTF-8"?>
<opml version="2.0">
  <head>
    <title>${attr(title)}</title>
    <dateCreated>${now.toUTCString()}</dateCreated>
  </head>
  <body>
${body.join('\n')}
  </body>
</opml>
`;
}

// → [{ url, title, siteUrl, folder }]
function parseOpml(src) {
  const root = parseXml(String(src || '').replace(/^﻿/, ''));
  const opml = root.children.find((c) => typeof c !== 'string' && c.local.toLowerCase() === 'opml');
  if (!opml) throw new AppError('opmlInvalid', {}, 'This file is not an OPML file.');
  const body = all(opml, 'body')[0];
  const out = [];
  const walk = (el, folder) => {
    for (const o of all(el, 'outline')) {
      const a = Object.fromEntries(Object.entries(o.attrs).map(([k, v]) => [k.toLowerCase(), v]));
      if (a.xmlurl) out.push({ url: a.xmlurl.trim(), title: (a.title || a.text || '').trim(), siteUrl: (a.htmlurl || '').trim(), folder });
      else walk(o, folder || (a.title || a.text || '').trim());
    }
  };
  if (body) walk(body, '');
  return out;
}

module.exports = { buildOpml, parseOpml };
