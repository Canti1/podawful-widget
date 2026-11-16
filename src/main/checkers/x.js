// Paid X API (pay-per-use) post watcher with an in-app monthly spend cap.
const PRICE_PER_POST = 0.005; // USD per post read (estimate; X's console is the source of truth)
const API = 'https://api.x.com/2';

function monthKeyOf(d) {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

function createXWatcher({ store, fetchFn, now = () => new Date() }) {
  function x() {
    return store.get().x;
  }
  function count(n) {
    if (n > 0) store.set({ x: { postsRead: x().postsRead + n } });
  }
  function capped() {
    return x().postsRead * PRICE_PER_POST >= x().capUsd;
  }

  async function call(url) {
    const r = await fetchFn(url, { headers: { Authorization: `Bearer ${x().token}` } });
    if (r.status === 401 || r.status === 403) throw Object.assign(new Error('auth'), { status: 'auth-error' });
    if (r.status === 429) throw Object.assign(new Error('rate'), { status: 'rate-limited' });
    if (!r.ok) throw Object.assign(new Error('http ' + r.status), { status: 'error' });
    return r.json();
  }

  async function poll(people) {
    if (!x().token) return { status: 'no-token', posts: [] };
    const mk = monthKeyOf(now());
    if (x().monthKey !== mk) store.set({ x: { monthKey: mk, postsRead: 0 } });

    const posts = [];
    for (const person of people) {
      const handle = person.xHandle;
      if (!handle) continue;
      if (capped()) return { status: 'capped', posts };
      const seen = { ...(x().lastSeen[handle] || {}) };
      try {
        if (!seen.userId) {
          const u = await call(`${API}/users/by/username/${encodeURIComponent(handle)}`);
          count(1);
          seen.userId = u.data && u.data.id;
          if (!seen.userId) continue;
        }
        const q = new URLSearchParams({ max_results: '5', 'tweet.fields': 'created_at' });
        if (store.get().x.excludeReplies) q.set('exclude', 'replies,retweets');
        if (seen.sinceId) q.set('since_id', seen.sinceId);
        const t = await call(`${API}/users/${seen.userId}/tweets?${q}`);
        const data = t.data || [];
        count(data.length);
        if (seen.sinceId) {
          for (const p of [...data].reverse()) {
            posts.push({ person, id: p.id, text: p.text, url: `https://x.com/${handle}/status/${p.id}` });
          }
        }
        const newest = (t.meta && t.meta.newest_id) || (data[0] && data[0].id);
        if (newest) seen.sinceId = newest;
        store.set({ x: { lastSeen: { ...x().lastSeen, [handle]: seen } } });
      } catch (e) {
        if (seen.userId) store.set({ x: { lastSeen: { ...x().lastSeen, [handle]: seen } } });
        if (e.status === 'auth-error' || e.status === 'rate-limited') return { status: e.status, posts };
        // other errors: skip this account this round
      }
    }
    return { status: 'ok', posts };
  }

  return {
    poll,
    estimatedSpend: () => +(x().postsRead * PRICE_PER_POST).toFixed(2),
  };
}

module.exports = { createXWatcher, PRICE_PER_POST };
