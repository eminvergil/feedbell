// Ekranın köşesinde çıkan bildirim kartları. Pencere, ana süreç tarafından kartların
// yüksekliğine göre boyutlanır ve odak çalmaz.
const stack = document.getElementById('stack');
const I18N = window.FeedbellI18n.createI18n(window.toast.i18n);
const t = I18N.t;
document.documentElement.lang = I18N.lang;
const MAX_CARDS = 4;
let opts = { seconds: 8, sound: true, position: 'top-right' };

const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

function hue(s) {
  let h = 0;
  for (const ch of String(s)) h = (h * 31 + ch.codePointAt(0)) % 360;
  return h;
}

function favicon(icon, name) {
  if (icon) return `<img class="fav" src="${esc(icon)}" alt="">`;
  const letter = (String(name || '?').trim()[0] || '?').toLocaleUpperCase(I18N.locale);
  return `<span class="fav letter" style="--c: hsl(${hue(name)} 52% 46%)">${esc(letter)}</span>`;
}

function ago(ts) {
  const m = Math.floor((Date.now() - ts) / 60000);
  if (m < 1) return t('time.now');
  if (m < 60) return t('time.minutesAgo', { count: m });
  return t('time.hoursAgo', { count: Math.floor(m / 60) });
}

const CLOSE = '<svg viewBox="0 0 12 12"><path d="M2 2l8 8M10 2l-8 8"/></svg>';

function cardHtml(c) {
  if (c.kind === 'info') {
    return `<div class="body info">
      <div class="head"><img class="brand" src="../assets/icon.png" alt=""><span class="feed">Feedbell</span></div>
      <div class="title">${esc(c.title)}</div>
      <div class="sum">${esc(c.body)}</div>
    </div>`;
  }
  if (c.kind === 'more') {
    return `<div class="body">
      <div class="head"><img class="brand" src="../assets/icon.png" alt=""><span class="feed">Feedbell</span></div>
      <div class="count">${esc(t('toast.moreFeeds', { count: c.count, feeds: c.feeds }))}</div>
      <div class="actions"><button class="btn ghost" data-act="history">${esc(t('toast.openHistory'))}</button></div>
    </div>`;
  }
  const head = `<div class="head">${favicon(c.icon, c.feedTitle)}<span class="feed">${esc(c.feedTitle)}</span><span class="when" data-ts="${c.ts}">${ago(c.ts)}</span></div>`;
  if (c.count === 1) {
    const it = c.items[0];
    return `<div class="body">${head}
      <div class="single">
        <div class="text"><div class="title">${esc(it.title || t('common.untitled'))}</div>${it.summary ? `<div class="sum">${esc(it.summary)}</div>` : ''}</div>
        ${it.image ? `<img class="thumb" src="${esc(it.image)}" alt="" referrerpolicy="no-referrer">` : ''}
      </div>
      <div class="actions">
        <button class="btn" data-act="item">${esc(t('toast.read'))}</button>
        ${it.link ? `<button class="btn ghost" data-act="link">${esc(t('common.openInBrowser'))}</button>` : ''}
      </div>
    </div>`;
  }
  const rest = c.count - c.items.length;
  return `<div class="body">${head}
    <div class="count">${esc(t('toast.newPosts', { count: c.count }))}</div>
    <ul class="list">
      ${c.items.map((it) => `<li data-item="${esc(it.id)}" title="${esc(it.title)}">${esc(it.title || t('common.untitled'))}</li>`).join('')}
      ${rest > 0 ? `<li class="more-line">${esc(t('toast.more', { count: rest }))}</li>` : ''}
    </ul>
    <div class="actions"><button class="btn" data-act="feed">${esc(t('toast.seeAll'))}</button></div>
  </div>`;
}

function defaultAction(c) {
  if (c.kind === 'info') return null;
  if (c.kind === 'more') return 'history';
  return c.count === 1 ? 'item' : 'feed';
}

function act(c, name, itemId) {
  if (!name) return;
  const realEntry = c.kind === 'entry' && !String(c.id).startsWith('test-');
  window.toast.action({
    act: name,
    id: itemId || c.items?.[0]?.id || '',
    link: c.items?.[0]?.link || '',
    feedId: c.feedId || '',
    entryId: realEntry ? c.id : '',
  });
}

function addCard(c) {
  const el = document.createElement('div');
  el.className = 'card';
  el.innerHTML = `${cardHtml(c)}<button class="close" aria-label="${esc(t('common.close'))}">${CLOSE}</button><div class="bar"></div>`;
  for (const img of el.querySelectorAll('img')) img.addEventListener('error', () => img.remove());

  el.addEventListener('click', (e) => {
    if (e.target.closest('.close')) return dismiss(el);
    const li = e.target.closest('[data-item]');
    const btn = e.target.closest('[data-act]');
    if (li) act(c, 'item', li.dataset.item);
    else if (btn) act(c, btn.dataset.act);
    else act(c, defaultAction(c));
    dismiss(el);
  });
  el.addEventListener('animationend', (e) => {
    if (e.target === el && el.classList.contains('leaving')) {
      el.remove();
      report();
    }
  });

  const bar = el.querySelector('.bar');
  const seconds = c.kind === 'info' ? Math.max(opts.seconds, 12) : opts.seconds;
  if (seconds > 0) {
    bar.style.setProperty('--dur', `${seconds}s`);
    bar.classList.add('run');
    bar.addEventListener('animationend', (e) => {
      if (e.animationName === 'shrink') dismiss(el);
    });
  } else bar.remove();

  stack.prepend(el);
}

function dismiss(el) {
  if (el.classList.contains('leaving')) return;
  el.classList.add('leaving');
}

let raf = 0;
function report() {
  cancelAnimationFrame(raf);
  raf = requestAnimationFrame(() => {
    if (!stack.querySelector('.card')) {
      window.toast.empty();
      return;
    }
    window.toast.size(Math.ceil(stack.getBoundingClientRect().height));
  });
}

new ResizeObserver(() => report()).observe(stack);

function chime() {
  try {
    const ctx = new AudioContext();
    const t = ctx.currentTime + 0.02;
    for (const [freq, delay] of [
      [988, 0],
      [1319, 0.11],
    ]) {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = 'sine';
      o.frequency.value = freq;
      g.gain.setValueAtTime(0, t + delay);
      g.gain.linearRampToValueAtTime(0.11, t + delay + 0.012);
      g.gain.exponentialRampToValueAtTime(0.0001, t + delay + 0.55);
      o.connect(g).connect(ctx.destination);
      o.start(t + delay);
      o.stop(t + delay + 0.6);
    }
    setTimeout(() => ctx.close(), 1200);
  } catch {
    /* ses aygıtı yoksa sessiz geç */
  }
}

window.toast.onShow((p) => {
  opts = p;
  document.documentElement.dataset.theme = p.theme || 'ember';
  document.body.classList.toggle('bottom', String(p.position).startsWith('bottom'));
  document.body.classList.toggle('left', String(p.position).endsWith('left'));
  // En yeni kart köşeye en yakın olur; aynı anda gelenlerde ilk sıradaki en üstte kalır.
  for (const c of [...p.cards].reverse()) addCard(c);
  const cards = stack.querySelectorAll('.card');
  for (let i = MAX_CARDS; i < cards.length; i++) cards[i].remove();
  if (p.sound) chime();
  report();
  setTimeout(() => window.toast.rendered(), 400);
});

setInterval(() => {
  for (const w of stack.querySelectorAll('.when[data-ts]')) w.textContent = ago(+w.dataset.ts);
}, 30e3);
