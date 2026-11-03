// Dil dosyalarını (src/locales/*.json) yükler ve kullanılacak dili seçer.
// Yeni bir dil için o klasöre bir JSON dosyası eklemek yeterli; ayrıca kayıt gerekmez.
const fs = require('fs');
const path = require('path');
const { flatten, createI18n } = require('./shared/i18n');

const DIR = path.join(__dirname, 'locales');
const cache = new Map();

function raw(code) {
  if (!cache.has(code)) cache.set(code, JSON.parse(fs.readFileSync(path.join(DIR, `${code}.json`), 'utf8')));
  return cache.get(code);
}

// → [{ code, name, englishName }]
function languages() {
  return fs
    .readdirSync(DIR)
    .filter((f) => /^[a-z]{2,3}(-[A-Za-z0-9]{2,8})?\.json$/.test(f))
    .map((f) => {
      const code = f.slice(0, -5);
      const meta = raw(code).meta || {};
      return { code, name: meta.name || code, englishName: meta.englishName || code };
    })
    .sort((a, b) => a.englishName.localeCompare(b.englishName));
}

// setting: 'system' ya da bir dil kodu; preferred: işletim sisteminin tercih ettiği diller (ör. ['en-TR', 'tr-TR'])
function resolveLanguage(setting, preferred = []) {
  const have = new Set(languages().map((l) => l.code));
  if (setting && setting !== 'system' && have.has(setting)) return setting;
  for (const p of preferred) {
    const full = String(p).replace('_', '-');
    if (have.has(full)) return full;
    const base = full.split('-')[0].toLowerCase();
    if (have.has(base)) return base;
  }
  return 'en';
}

// Pencerelere de gönderilen sözlük verisi.
function loadLanguage(code) {
  return { lang: code, dict: flatten(raw(code)), fallback: code === 'en' ? null : flatten(raw('en')) };
}

module.exports = { languages, resolveLanguage, loadLanguage, createI18n, flatten, DIR };
