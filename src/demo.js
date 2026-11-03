// `npm run demo`: geçici klasörde örnek kaynaklar, yazılar ve bildirim geçmişi.
// İnternete çıkmaz; "Yenile" her seferinde bir iki yeni örnek yazı "getirir" ve bildirim gösterir.
const fs = require('fs');
const { EventEmitter } = require('events');
const { Store, randomId } = require('./store');

const svgUri = (svg) => `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;

function letterIcon(letter, c1, c2) {
  return svgUri(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${c1}"/><stop offset="1" stop-color="${c2}"/></linearGradient></defs><rect width="64" height="64" rx="14" fill="url(#g)"/><text x="32" y="43" font-family="Helvetica, Arial, sans-serif" font-size="30" font-weight="700" fill="#fff" text-anchor="middle">${letter}</text></svg>`);
}

function artImage(seed, c1, c2) {
  const r = (n) => ((seed * 9301 + n * 49297) % 233280) / 233280;
  const circles = Array.from({ length: 5 }, (_, i) => `<circle cx="${Math.round(r(i) * 640)}" cy="${Math.round(r(i + 7) * 360)}" r="${Math.round(40 + r(i + 3) * 120)}" fill="#fff" fill-opacity="${(0.08 + r(i + 11) * 0.16).toFixed(2)}"/>`).join('');
  return svgUri(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 360"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${c1}"/><stop offset="1" stop-color="${c2}"/></linearGradient></defs><rect width="640" height="360" fill="url(#g)"/>${circles}</svg>`);
}

// Kurgusal kaynaklar; adlar ve yazılar tanıtım dilinde (Türkçe ya da İngilizce) üretilir.
const FEEDS = [
  { key: 'piksel', title: { tr: 'Piksel Atölyesi', en: 'Pixel Workshop' }, folder: { tr: 'Oyun geliştirme', en: 'Game dev' }, c: ['#ff8a3d', '#d9480f'], site: 'https://pixel-workshop.example' },
  { key: 'indie', title: { tr: 'Indie Oyun Notları', en: 'Indie Game Notes' }, folder: { tr: 'Oyun geliştirme', en: 'Game dev' }, c: ['#7b6cf2', '#3a2ea6'], site: 'https://indie-notes.example' },
  { key: 'kod', title: { tr: 'Kod Defteri', en: 'Code Notebook' }, folder: { tr: 'Yazılım', en: 'Software' }, c: ['#2fb67c', '#127a52'], site: 'https://code-notebook.example' },
  { key: 'tekno', title: { tr: 'Teknoloji Bülteni', en: 'Tech Bulletin' }, folder: { tr: 'Teknoloji', en: 'Tech' }, c: ['#3a8ee6', '#1d5fb0'], site: 'https://tech-bulletin.example' },
  { key: 'bilim', title: { tr: 'Bilim Kıyısı', en: 'Science Shore' }, folder: { tr: '', en: '' }, c: ['#e6497a', '#a8204f'], site: 'https://science-shore.example' },
  { key: 'tasarim', title: { tr: 'Haftalık Tasarım', en: 'Design Weekly' }, folder: { tr: '', en: '' }, c: ['#f2b630', '#c98500'], site: 'https://design-weekly.example' },
];

const AUTHORS = { tr: ['Deniz Aydın', 'Ece Kara', 'Mert Yıldız', 'Selin Öztürk'], en: ['Alex Morgan', 'Sam Rivera', 'Jordan Lee', 'Taylor Kim'] };

const P = (...ps) => ps.map((p) => `<p>${p}</p>`).join('');

const POSTS_TR = {
  piksel: [
    ['Tilemap ile sonsuz zindan üretmek: adım adım rehber', P('Rastgele zindan üretimi ilk bakışta karmaşık görünse de birkaç basit kuralla oynanabilir haritalar çıkarmak mümkün. Bu yazıda oda yerleştirme, koridor bağlama ve düşman dağıtımını tek tek ele alıyoruz.', 'İlk adım odaları ızgaraya çakışmadan yerleştirmek. Ardından her odayı en yakın komşusuna bağlayan bir ağaç kuruyoruz; böylece ulaşılamayan oda kalmıyor.') + '<h2>Koridorlar</h2><ul><li>Önce yatay, sonra dikey ilerleyen L biçimli koridorlar</li><li>Her on odada bir döngü ekleyerek alternatif yollar</li><li>Kapı noktalarını koridorun oda sınırına değdiği karoya koymak</li></ul>' + P('Son olarak oyuncunun başladığı odadan en uzak odaya çıkış merdivenini koyuyoruz. Mesafeyi genişlik öncelikli aramayla hesaplamak yeterli.'), 'Oyun tasarımı'],
    ['Piksel sanatta sınırlı paletin gücü', P('Dört ya da sekiz renkle çalışmak kısıt gibi görünür ama karakterlerin okunurluğunu ciddi biçimde artırır. Palet seçerken açıklık değerlerinin birbirinden yeterince ayrık olmasına dikkat et.') + '<blockquote>İyi bir palet, karakterin siyah-beyaz ekran görüntüsünde de seçilebildiği palettir.</blockquote>' + P('Gölgelendirmede tonu yalnızca koyulaştırmak yerine hafifçe soğuk renklere kaydırmak sahneye derinlik katar.'), 'Sanat'],
    ['Oyun hissi: zıplamaya 6 küçük düzeltme', P('Coyote time, zıplama tamponu, değişken zıplama yüksekliği… Platform oyunlarının "iyi hissettirmesini" sağlayan küçük hileleri örnek kodlarla anlattık.') + '<pre><code>if on_floor or coyote_timer &gt; 0:\n    velocity.y = -jump_speed\n    coyote_timer = 0</code></pre>' + P('Bu düzeltmelerin hiçbiri oyuncunun fark edeceği türden değil; ama eksik olduklarında kontroller hemen "kaygan" ya da "tepkisiz" gelir.'), 'Programlama'],
  ],
  indie: [
    ['Tek kişilik ekiple 18 ayda Steam\'e çıkmak', P('Geliştirici günlüğümüzün son bölümünde yayın öncesi son üç ayı, istek listesi sayılarını ve basın kitini nasıl hazırladığımızı anlatıyoruz.', 'En büyük ders: fragmanı ve mağaza sayfasını oyun bitmeden çok önce hazırlamak.'), 'Günlük'],
    ['Oyun festivallerinde demo hazırlamanın püf noktaları', P('Festival demoları kısa, net ve ilk 30 saniyede kancayı atan cinsten olmalı. Oyuncuların demoyu nerede bıraktığını ölçmek için basit bir analitik ekledik.'), 'Pazarlama'],
    ['Ses tasarımında ücretsiz araçlar', P('Bütçesiz bir projede efekt üretmek için kullandığımız araçları ve kayıt düzeneğimizi paylaşıyoruz. Mutfak eşyalarıyla şaşırtıcı derecede iyi sesler çıkıyor.'), 'Ses'],
  ],
  kod: [
    ['JavaScript\'te tarihleri doğru biçimlendirmek', P('Intl.DateTimeFormat ile yerel ayara uygun tarih göstermek, elle biçimlendirmekten hem daha kısa hem de daha güvenilir.') + '<pre><code>new Intl.DateTimeFormat(\'tr-TR\', { dateStyle: \'long\' }).format(new Date())\n// → "28 Ekim 2026"</code></pre>' + P('Saat dilimi farklarını hesaba katmayı unutma: sunucudan gelen zamanları her zaman UTC olarak sakla.'), 'Web'],
    ['Küçük projeler için test yazma alışkanlığı', P('Her şeyi test etmek zorunda değilsin. Hata çıktığında önce onu yeniden üreten bir test yazmak, zamanla en değerli test setini kendiliğinden oluşturur.'), 'Alışkanlıklar'],
    ['Git\'te geri alma komutları: hangisi ne zaman?', P('revert, reset ve restore arasındaki farkları tek tabloda topladık. Paylaşılmış dallarda geçmişi yeniden yazmaktan kaçın.'), 'Araçlar'],
  ],
  tekno: [
    ['Yeni nesil ekran kartları enerji verimliliğinde iddialı', P('Üreticilerin açıkladığı yeni seride watt başına performans önceki nesle göre belirgin biçimde artmış görünüyor. Bağımsız testler önümüzdeki haftalarda gelecek.'), 'Donanım'],
    ['Yerel yapay zekâ modelleri dizüstü bilgisayarlara geliyor', P('Bulut bağlantısı gerektirmeden çalışan dil modelleri, yeni işlemcilerdeki hızlandırıcılar sayesinde günlük kullanımda pratik hâle geliyor.'), 'Yapay zekâ'],
    ['Akıllı ev cihazlarında ortak standart dönemi', P('Farklı markaların cihazlarını tek uygulamadan yönetmeyi sağlayan standart, yeni güncellemeyle enerji ölçümü desteği kazandı.'), 'Ev'],
  ],
  bilim: [
    ['Derin denizde yeni bir canlı türü tanımlandı', P('Araştırmacılar 3.000 metre derinlikte, ışık üreten ve daha önce bilinmeyen bir denizanası türünü kayıt altına aldı.'), 'Biyoloji'],
    ['Uykunun hafızaya etkisi üzerine yeni bulgular', P('Kısa öğle uykularının yeni öğrenilen bilgilerin kalıcılığını artırdığı, katılımcıların ertesi gün yapılan testlerdeki başarısından anlaşıldı.'), 'Sağlık'],
  ],
  tasarim: [
    ['Bu haftanın ilham panosu: sıcak tonlar', P('Sonbahar renkleriyle hazırlanmış arayüz örnekleri, afişler ve yazı tipi eşleşmeleri.'), 'İlham'],
    ['Erişilebilir renk kontrastı için hızlı kontrol listesi', P('Metin ve arka plan arasında en az 4,5:1 kontrast, durum renklerini yalnızca renkle değil simgeyle de anlatmak ve odak halkasını asla gizlememek.'), 'Erişilebilirlik'],
  ],
};

const POSTS_EN = {
  piksel: [
    ['Generating endless dungeons with tilemaps: a step-by-step guide', P('Procedural dungeons look complicated at first, but a handful of simple rules is enough to produce playable maps. This post walks through room placement, corridor linking and enemy distribution one by one.', 'Step one is placing rooms on a grid without overlaps. Then we build a tree that connects each room to its nearest neighbour, so no room is left unreachable.') + '<h2>Corridors</h2><ul><li>L-shaped corridors that go horizontal first, then vertical</li><li>A loop every ten rooms for alternative routes</li><li>Doors on the tile where a corridor meets a room</li></ul>' + P('Finally, we put the exit stairs in the room farthest from the start. A breadth-first search is all you need to measure the distance.'), 'Game design'],
    ['The power of a limited palette in pixel art', P('Working with four or eight colours feels like a restriction, but it makes characters far more readable. When you pick a palette, keep the lightness values clearly apart.') + '<blockquote>A good palette is one where the character still reads in a black-and-white screenshot.</blockquote>' + P('Instead of only darkening a tone for shading, shift it slightly towards cooler colours to give the scene depth.'), 'Art'],
    ['Game feel: 6 small fixes for jumping', P('Coyote time, jump buffering, variable jump height… We explain the little tricks that make platformers feel good, with sample code.') + '<pre><code>if on_floor or coyote_timer &gt; 0:\n    velocity.y = -jump_speed\n    coyote_timer = 0</code></pre>' + P('Players will never notice any of these fixes — but without them, controls instantly feel slippery or unresponsive.'), 'Programming'],
  ],
  indie: [
    ['Shipping on Steam in 18 months as a solo developer', P('In the last part of our devlog we cover the final three months before launch, wishlist numbers and how we put together the press kit.', 'Biggest lesson: make the trailer and the store page long before the game is finished.'), 'Devlog'],
    ['Tips for building a festival demo', P('Festival demos should be short, clear and hook players in the first 30 seconds. We added simple analytics to see where people stop playing.'), 'Marketing'],
    ['Free tools for sound design', P('We share the tools and the recording setup we used to make sound effects on a zero budget. Kitchen utensils sound surprisingly good.'), 'Audio'],
  ],
  kod: [
    ['Formatting dates correctly in JavaScript', P('Showing locale-aware dates with Intl.DateTimeFormat is shorter and more reliable than formatting them by hand.') + "<pre><code>new Intl.DateTimeFormat('en-US', { dateStyle: 'long' }).format(new Date())\n// → \"October 28, 2026\"</code></pre>" + P('Don\'t forget time zones: always store timestamps from the server in UTC.'), 'Web'],
    ['A testing habit for small projects', P("You don't have to test everything. Writing a test that reproduces each bug before fixing it builds the most valuable test suite over time."), 'Habits'],
    ['Undo commands in Git: which one, when?', P('We put the differences between revert, reset and restore into a single table. Avoid rewriting history on shared branches.'), 'Tools'],
  ],
  tekno: [
    ['New graphics cards make big efficiency claims', P('Performance per watt in the newly announced series looks clearly ahead of the previous generation. Independent benchmarks will arrive in the coming weeks.'), 'Hardware'],
    ['Local AI models are coming to laptops', P('Language models that run without a cloud connection are becoming practical for everyday use, thanks to the accelerators in new processors.'), 'AI'],
    ['A common standard for smart home devices', P('The standard that lets you control devices from different brands in one app now supports energy metering.'), 'Home'],
  ],
  bilim: [
    ['A new species described in the deep sea', P('Researchers recorded a previously unknown, bioluminescent jellyfish species at a depth of 3,000 metres.'), 'Biology'],
    ['New findings on how sleep affects memory', P('Short afternoon naps improved how well participants retained newly learned information, judging by their scores the next day.'), 'Health'],
  ],
  tasarim: [
    ['This week\'s mood board: warm tones', P('Interface examples, posters and type pairings in autumn colours.'), 'Inspiration'],
    ['A quick checklist for accessible colour contrast', P('At least 4.5:1 contrast between text and background, status shown with an icon as well as a colour, and never hiding the focus ring.'), 'Accessibility'],
  ],
};

// "Yenile"ye basınca gelecek örnek yazılar.
const INCOMING_EN = [
  ['piksel', 'Water reflections with a shader: realistic in 20 lines'],
  ['tekno', 'Browsers are switching to a new compression format'],
  ['indie', 'Our game is on sale this week: what we learned'],
  ['kod', 'Component-based layouts with CSS container queries'],
  ['bilim', 'Traces of an ancient riverbed on the surface of Mars'],
  ['tasarim', 'Responsive typography with variable fonts'],
  ['piksel', 'Particle effects performance: 10,000 sparks'],
  ['tekno', 'Satellite internet latency keeps dropping'],
];

const INCOMING_TR = [
  ['piksel', 'Shader ile su yansıması: 20 satırda gerçekçi görünüm'],
  ['tekno', 'Tarayıcılar yeni sıkıştırma biçimine geçiyor'],
  ['indie', 'Oyunumuz bu hafta indirimde: neler öğrendik'],
  ['kod', 'CSS container queries ile bileşen tabanlı yerleşim'],
  ['bilim', 'Mars yüzeyinde eski bir nehir yatağının izleri'],
  ['tasarim', 'Değişken yazı tipleriyle duyarlı tipografi'],
  ['piksel', 'Parçacık efektlerinde performans: 10.000 kıvılcım'],
  ['tekno', 'Uydu internetinde gecikme süreleri düşüyor'],
];

const demoLang = (lang) => (lang === 'tr' ? 'tr' : 'en');

// look: { lang, language, colorTheme, theme } — tanıtım dili ve isteğe bağlı görünüm ayarları
function seedDemo(dir, look = {}) {
  fs.rmSync(dir, { recursive: true, force: true });
  const store = new Store(dir);
  const now = Date.now();
  const H = 3600e3;
  const L = demoLang(look.lang);
  const POSTS = L === 'tr' ? POSTS_TR : POSTS_EN;
  const settings = { closeHintShown: true, language: look.language || 'system' };
  if (look.colorTheme) settings.colorTheme = look.colorTheme;
  if (look.theme) settings.theme = look.theme;
  store.saveSettings(settings);
  const ids = {};
  FEEDS.forEach((f, fi) => {
    const feed = store.addFeed({ url: `${f.site}/feed.xml`, title: f.title[L], siteUrl: f.site, folder: f.folder[L], icon: letterIcon(f.title[L][0], f.c[0], f.c[1]) });
    store.updateFeed(feed.id, { lastFetch: now - 4 * 60e3, lastOk: now - 4 * 60e3, iconTried: now });
    ids[f.key] = feed.id;
    const posts = POSTS[f.key].map(([title, html, tag], i) => ({
      key: `${f.key}-${i}`,
      title,
      link: `${f.site}/posts/${i + 1}`,
      author: AUTHORS[L][(fi + i) % 4],
      date: now - (fi * 2.7 + i * 9.5 + 0.4) * H,
      html,
      summary: html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 240),
      image: (fi + i) % 3 !== 2 ? artImage(fi * 10 + i + 3, f.c[0], f.c[1]) : '',
      comments: '',
      tag,
    }));
    store.merge(feed.id, posts, now);
  });
  // Birkaç yazı okunmuş, biri yıldızlı olsun.
  const all = [...store.items.values()].sort((a, b) => b.date - a.date);
  store.setRead(all.slice(6).filter((_, i) => i % 2 === 0).map((x) => x.id), true);
  store.setStarred(all[3].id, true);

  const entry = (key, hoursAgo, n, extra = {}) => {
    const feed = store.feed(ids[key]);
    const items = all.filter((x) => x.feedId === feed.id).slice(0, n);
    return { id: randomId(), ts: now - hoursAgo * H, feedId: feed.id, feedTitle: feed.title, count: items.length, items: items.map((x) => ({ id: x.id, title: x.title, link: x.link })), seen: hoursAgo > 3, silent: '', ...extra };
  };
  store.addNotifications([
    entry('piksel', 0.4, 1),
    entry('tekno', 1.2, 2),
    entry('kod', 5, 1),
    entry('bilim', 27, 2, { silent: 'quiet' }),
    entry('indie', 30, 3),
    entry('tasarim', 51, 1),
  ]);
  store.flush();
  return store;
}

class DemoPoller extends EventEmitter {
  constructor({ store, lang }) {
    super();
    this.store = store;
    this.lang = demoLang(lang);
    this.running = false;
    this.lastRun = Date.now() - 4 * 60e3;
    this.next = 0;
  }

  start() {}
  stop() {}
  tick() {}
  loadIcon() {}

  status() {
    return { running: this.running, done: this.running ? 0 : 1, total: 1, last: this.lastRun };
  }

  async refresh() {
    if (this.running) return [];
    this.running = true;
    this.emit('progress', this.status());
    await new Promise((r) => setTimeout(r, 900));
    const now = Date.now();
    const results = [];
    for (let k = 0; k < 2; k++) {
      const incoming = this.lang === 'tr' ? INCOMING_TR : INCOMING_EN;
      const [key, title] = incoming[this.next++ % incoming.length];
      const f = FEEDS.find((x) => x.key === key);
      const feed = this.store.feeds.find((x) => x.title === f.title[this.lang]);
      if (!feed) continue;
      const html =
        this.lang === 'tr'
          ? P(`${title}. Bu, Feedbell'in tanıtım modunda üretilmiş örnek bir yazıdır; gerçek bir kaynaktan gelmez.`, 'Tanıtım modunda "Yenile" düğmesine her bastığında bir iki yeni yazı gelir ve bildirim sistemi gerçek kullanımdaki gibi çalışır.')
          : P(`${title}. This is a sample post generated by Feedbell's demo mode; it doesn't come from a real feed.`, 'In demo mode, every press of "Refresh" brings one or two new posts and the notification system works just like in real use.');
      const items = this.store.merge(feed.id, [{ key: `demo-${now}-${k}`, title, link: `${f.site}/new/${this.next}`, author: 'Feedbell', date: now - k * 1000, html, summary: html.replace(/<[^>]+>/g, ' ').trim(), image: artImage(this.next + 40, f.c[0], f.c[1]) }], now);
      const same = results.find((r) => r.feed.id === feed.id);
      if (same) same.items.push(...items);
      else if (items.length) results.push({ feed, items });
    }
    this.running = false;
    this.lastRun = now;
    this.emit('progress', this.status());
    if (results.length) this.emit('new-items', results);
    this.emit('changed');
    return results;
  }
}

module.exports = { seedDemo, DemoPoller, letterIcon };
