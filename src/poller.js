// Beslemeleri arka planda düzenli olarak yeniler.
//   'progress' → { running, done, total }
//   'new-items' → [{ feed, items }]   (ilk kez eklenen kaynakların yazıları bildirilmez)
//   'changed'   → yenileme bitti, sayılar değişmiş olabilir
const { EventEmitter } = require('events');
const { fetchFeed, findIcon } = require('./fetcher');

const CONCURRENCY = 4;
const MAX_BACKOFF = 6 * 3600e3;

class Poller extends EventEmitter {
  constructor({ store, fetch }) {
    super();
    this.store = store;
    this.fetch = fetch;
    this.running = false;
    this.done = 0;
    this.total = 0;
    this.lastRun = Math.max(0, ...store.feeds.map((f) => f.lastFetch || 0));
    this.queue = null; // yenileme sürerken gelen istek
    this.timer = null;
  }

  start() {
    this.timer = setInterval(() => this.tick(), 60e3);
    setTimeout(() => this.tick(), 1500);
  }

  stop() {
    clearInterval(this.timer);
  }

  status() {
    return { running: this.running, done: this.done, total: this.total, last: this.lastRun };
  }

  intervalMs() {
    return Math.max(1, +this.store.settings.refreshMin || 15) * 60e3;
  }

  isDue(feed, now) {
    if (!feed.lastFetch) return true;
    const base = this.intervalMs();
    const wait = feed.errorCount ? Math.min(base * 2 ** Math.min(feed.errorCount, 6), Math.max(base, MAX_BACKOFF)) : base;
    return now - feed.lastFetch >= wait - 5000;
  }

  tick() {
    const now = Date.now();
    const due = this.store.feeds.filter((f) => this.isDue(f, now));
    if (due.length && !this.running) this.run(due.map((f) => f.id));
  }

  // Elle yenileme: hepsi ya da verilen kaynaklar, zamanına bakmadan.
  refresh(ids) {
    const list = ids && ids.length ? ids : this.store.feeds.map((f) => f.id);
    if (this.running) {
      this.queue = [...new Set([...(this.queue || []), ...list])];
      return this.current;
    }
    return this.run(list);
  }

  run(ids) {
    this.current = this._run(ids).finally(() => {
      const next = this.queue;
      this.queue = null;
      if (next && next.length) this.run(next);
    });
    return this.current;
  }

  async _run(ids) {
    this.running = true;
    this.done = 0;
    this.total = ids.length;
    this.emit('progress', this.status());
    const results = [];
    const queue = ids.slice();
    const worker = async () => {
      while (queue.length) {
        const id = queue.shift();
        const feed = this.store.feed(id);
        if (feed) {
          const r = await this.fetchOne(feed);
          if (r.fresh.length && !r.initial) results.push({ feed, items: r.fresh });
        }
        this.done++;
        this.emit('progress', this.status());
      }
    };
    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, queue.length) }, worker));
    this.store.prune();
    this.running = false;
    this.lastRun = Date.now();
    this.emit('progress', this.status());
    if (results.length) this.emit('new-items', results);
    this.emit('changed');
    return results;
  }

  async fetchOne(feed) {
    const now = Date.now();
    const initial = !feed.lastOk;
    try {
      const r = await fetchFeed(feed.url, { fetch: this.fetch, etag: feed.etag, lastModified: feed.lastModified });
      if (!this.store.feed(feed.id)) return { fresh: [], initial }; // indirilirken silindi
      const patch = { lastFetch: now, lastOk: now, lastError: '', lastErrorCode: '', lastErrorParams: null, errorCount: 0 };
      if (r.notModified) {
        this.store.updateFeed(feed.id, patch);
        return { fresh: [], initial };
      }
      Object.assign(patch, {
        etag: r.etag,
        lastModified: r.lastModified,
        title: r.feed.title || feed.title,
        siteUrl: r.feed.siteUrl || feed.siteUrl,
        description: r.feed.description || feed.description,
      });
      const fresh = this.store.merge(feed.id, r.feed.items, now);
      this.store.updateFeed(feed.id, patch);
      if (!feed.icon && !feed.iconTried) this.loadIcon(feed, r.feed.icon);
      return { fresh, initial };
    } catch (e) {
      this.store.updateFeed(feed.id, {
        lastFetch: now,
        lastError: e.message,
        lastErrorCode: e.code || '',
        lastErrorParams: e.params || null,
        errorCount: (feed.errorCount || 0) + 1,
      });
      return { fresh: [], initial, error: e.message };
    }
  }

  async loadIcon(feed, feedIcon) {
    this.store.updateFeed(feed.id, { iconTried: Date.now() });
    try {
      const icon = await findIcon({ siteUrl: feed.siteUrl, feedIcon, feedUrl: feed.url }, { fetch: this.fetch });
      if (icon && this.store.feed(feed.id)) {
        this.store.updateFeed(feed.id, { icon });
        this.emit('changed');
      }
    } catch {
      /* simge bulunamazsa baş harf gösterilir */
    }
  }
}

module.exports = { Poller };
