// Çeviri çekirdeği. Ana süreçte require ile, pencerelerde <script> ile aynı kod kullanılır.
//   t('list.posts', { count: 3 })  → çoğul biçimi Intl.PluralRules ile seçer (list.posts.one / list.posts.other)
//   t('addDialog.added', { name: 'X' }) → {name} yer tutucularını doldurur
// Bir anahtar seçili dilde yoksa İngilizce kullanılır; o da yoksa anahtarın kendisi görünür.
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.FeedbellI18n = api;
})(typeof self !== 'undefined' ? self : globalThis, () => {
  function flatten(obj, prefix = '', out = {}) {
    for (const [k, v] of Object.entries(obj || {})) {
      const key = prefix ? `${prefix}.${k}` : k;
      if (v && typeof v === 'object' && !Array.isArray(v)) flatten(v, key, out);
      else out[key] = v;
    }
    return out;
  }

  function createI18n({ lang, dict, fallback }) {
    const locale = (dict && dict['meta.locale']) || lang || 'en';
    let plural;
    try {
      plural = new Intl.PluralRules(locale);
    } catch {
      plural = new Intl.PluralRules('en');
    }
    const own = (k) => (dict && typeof dict[k] === 'string' ? dict[k] : undefined);
    const fb = (k) => (fallback && typeof fallback[k] === 'string' ? fallback[k] : undefined);

    function lookup(key, vars) {
      if (vars && typeof vars.count === 'number') {
        const cat = plural.select(vars.count);
        // Önce seçili dilin kendi biçimleri (Türkçe gibi dillerde yalnızca "other" yeterli), sonra İngilizce.
        const s = own(`${key}.${cat}`) ?? own(`${key}.other`) ?? (own(key) === undefined ? fb(`${key}.${cat}`) ?? fb(`${key}.other`) : undefined);
        if (s !== undefined) return s;
      }
      return own(key) ?? fb(key);
    }

    function t(key, vars) {
      const s = lookup(key, vars);
      if (s === undefined) return key;
      if (!vars) return s;
      return s.replace(/\{(\w+)\}/g, (m, name) => (vars[name] !== undefined && vars[name] !== null ? String(vars[name]) : m));
    }

    const has = (key) => lookup(key) !== undefined || lookup(key, { count: 2 }) !== undefined;
    return { lang, locale, t, has };
  }

  return { flatten, createI18n };
});
