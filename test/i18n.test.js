const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { languages, resolveLanguage, loadLanguage, createI18n, flatten, DIR } = require('../src/i18n-main');
const { Store, fold } = require('../src/store');

const PLURAL = /\.(zero|one|two|few|many|other)$/;
const base = (k) => k.replace(PLURAL, '');
const placeholders = (s) => [...String(s).matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
const read = (code) => flatten(JSON.parse(fs.readFileSync(path.join(DIR, `${code}.json`), 'utf8')));

test('her dil dosyası geçerli JSON ve meta bilgisi taşıyor', () => {
  const langs = languages();
  assert.ok(langs.some((l) => l.code === 'en'));
  assert.ok(langs.some((l) => l.code === 'tr'));
  for (const l of langs) {
    const d = read(l.code);
    assert.ok(d['meta.name'], `${l.code}: meta.name eksik`);
    assert.ok(d['meta.locale'], `${l.code}: meta.locale eksik`);
  }
});

test('çeviriler İngilizceyle aynı anahtarları ve yer tutucuları kullanıyor', () => {
  const en = read('en');
  const enBase = new Map();
  for (const [k, v] of Object.entries(en)) if (!k.startsWith('meta.')) enBase.set(base(k), placeholders(v));
  for (const l of languages()) {
    if (l.code === 'en') continue;
    const d = read(l.code);
    const keys = new Set(Object.keys(d).filter((k) => !k.startsWith('meta.')).map(base));
    const missing = [...enBase.keys()].filter((k) => !keys.has(k));
    const extra = [...keys].filter((k) => !enBase.has(k));
    assert.deepEqual(missing, [], `${l.code}: eksik anahtarlar`);
    assert.deepEqual(extra, [], `${l.code}: İngilizcede olmayan anahtarlar`);
    for (const [k, v] of Object.entries(d)) {
      if (k.startsWith('meta.')) continue;
      const want = enBase.get(base(k));
      // Çoğul biçimlerde {count} bazı dillerde yazılmayabilir ("Every hour"); diğer yer tutucular aynı olmalı.
      const got = placeholders(v).filter((p) => p !== 'count');
      assert.deepEqual(got, want.filter((p) => p !== 'count'), `${l.code}: ${k} yer tutucuları`);
    }
  }
});

test('koddaki her t() anahtarı İngilizce sözlükte var', () => {
  const en = createI18n(loadLanguage('en'));
  const files = [];
  const walk = (dir) => {
    for (const f of fs.readdirSync(dir)) {
      const p = path.join(dir, f);
      if (fs.statSync(p).isDirectory()) walk(p);
      else if (/\.(js|html)$/.test(f)) files.push(p);
    }
  };
  walk(path.join(__dirname, '..', 'src'));
  const missing = [];
  for (const file of files) {
    const src = fs.readFileSync(file, 'utf8');
    for (const m of src.matchAll(/\bt\(\s*'([a-zA-Z0-9_.]+)'/g)) if (!en.has(m[1])) missing.push(`${path.basename(file)}: ${m[1]}`);
    for (const m of src.matchAll(/data-i18n(?:-title|-placeholder|-aria)?="([a-zA-Z0-9_.]+)"/g)) if (!en.has(m[1])) missing.push(`${path.basename(file)}: ${m[1]}`);
  }
  assert.deepEqual(missing, []);
});

test('çoğul biçimleri ve yedek dil', () => {
  const en = createI18n(loadLanguage('en')).t;
  const tr = createI18n(loadLanguage('tr')).t;
  assert.equal(en('list.posts', { count: 1 }), '1 post');
  assert.equal(en('list.posts', { count: 3 }), '3 posts');
  assert.equal(tr('list.posts', { count: 1 }), '1 yazı', 'Türkçede tekil için de "other" kullanılır, İngilizceye düşmez');
  assert.equal(tr('addDialog.added', { name: 'X' }), '“X” eklendi.');
  const partial = createI18n({ lang: 'xx', dict: { 'nav.all': 'Hepsi' }, fallback: loadLanguage('en').dict }).t;
  assert.equal(partial('nav.all'), 'Hepsi');
  assert.equal(partial('nav.unread'), 'Unread', 'çevrilmemiş anahtar İngilizceye düşer');
  assert.equal(partial('yok.boyle.bir.anahtar'), 'yok.boyle.bir.anahtar');
});

test('dil seçimi', () => {
  assert.equal(resolveLanguage('tr', ['en-US']), 'tr');
  assert.equal(resolveLanguage('system', ['en-TR', 'tr-TR']), 'en');
  assert.equal(resolveLanguage('system', ['tr-TR']), 'tr');
  assert.equal(resolveLanguage('system', ['de-DE', 'tr-TR']), 'tr', 'desteklenmeyen dil atlanır');
  assert.equal(resolveLanguage('system', ['ja-JP']), 'en');
  assert.equal(resolveLanguage('xx', []), 'en');
});

test('dil ayarından önce kurulmuş Feedbell Türkçe kalır, yeni kurulum sistem dilini izler', () => {
  const old = fs.mkdtempSync(path.join(os.tmpdir(), 'feedbell-i18n-'));
  fs.writeFileSync(path.join(old, 'settings.json'), JSON.stringify({ refreshMin: 30 }));
  assert.equal(new Store(old).settings.language, 'tr');
  const fresh = fs.mkdtempSync(path.join(os.tmpdir(), 'feedbell-i18n-'));
  assert.equal(new Store(fresh).settings.language, 'system');
});

test('arama dilden bağımsız', () => {
  assert.equal(fold('IŞIK'), fold('ışık'));
  assert.equal(fold('İstanbul'), 'istanbul');
  assert.equal(fold('IDE'), fold('ide'));
  assert.equal(fold('Çağrı'), 'cagri');
});
