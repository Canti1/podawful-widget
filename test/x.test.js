const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createStore } = require('../src/main/store');
const { createXWatcher, PRICE_PER_POST } = require('../src/main/checkers/x');

const tmpStore = () => createStore(path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'pawx-')), 's.json'));
const json = (status, body) => ({ ok: status >= 200 && status < 300, status, json: async () => body });
const people = [{ id: 'jesse', name: 'PodAwful', xHandle: 'podawful' }, { id: 'g', name: 'NoX', xHandle: '' }];

function fakeX(timelines) {
  const calls = [];
  const fetchFn = async (url, opts) => {
    calls.push(url);
    assert.strictEqual(opts.headers.Authorization, 'Bearer tok');
    if (url.includes('/users/by/username/podawful')) return json(200, { data: { id: '42' } });
    if (url.includes('/users/42/tweets')) return timelines.shift();
    throw new Error('unexpected ' + url);
  };
  return { fetchFn, calls };
}

test('no token → no-token, no fetch', async () => {
  const store = tmpStore();
  let called = false;
  const w = createXWatcher({ store, fetchFn: async () => { called = true; }, now: () => new Date('2026-11-15') });
  const r = await w.poll(people);
  assert.strictEqual(r.status, 'no-token');
  assert.strictEqual(called, false);
});

test('first poll records newest without notifying; next poll returns new posts', async () => {
  const store = tmpStore();
  store.set({ x: { token: 'tok' } });
  const { fetchFn, calls } = fakeX([
    json(200, { data: [{ id: '100', text: 'old' }], meta: { newest_id: '100', result_count: 1 } }),
    json(200, { data: [{ id: '102', text: 'new two' }, { id: '101', text: 'new one' }], meta: { newest_id: '102', result_count: 2 } }),
  ]);
  const w = createXWatcher({ store, fetchFn, now: () => new Date('2026-11-15') });
  const first = await w.poll(people);
  assert.deepStrictEqual([first.status, first.posts.length], ['ok', 0]);
  const second = await w.poll(people);
  assert.strictEqual(second.posts.length, 2);
  assert.deepStrictEqual(second.posts.map((p) => p.id), ['101', '102']); // oldest first
  assert.strictEqual(second.posts[1].url, 'https://x.com/podawful/status/102');
  assert.strictEqual(second.posts[1].person.name, 'PodAwful');
  assert.ok(calls.some((u) => u.includes('since_id=100')));
  assert.ok(calls.every((u) => !u.includes('/tweets') || u.includes('exclude=replies%2Cretweets')));
  assert.strictEqual(store.get().x.postsRead, 1 + 1 + 2); // lookup + 1 post + 2 posts
});

test('401 → auth-error, nothing counted', async () => {
  const store = tmpStore();
  store.set({ x: { token: 'tok' } });
  const w = createXWatcher({ store, fetchFn: async () => json(401, {}), now: () => new Date('2026-11-15') });
  const r = await w.poll(people);
  assert.strictEqual(r.status, 'auth-error');
  assert.strictEqual(store.get().x.postsRead, 0);
});

test('429 → rate-limited', async () => {
  const store = tmpStore();
  store.set({ x: { token: 'tok' } });
  const w = createXWatcher({ store, fetchFn: async () => json(429, {}), now: () => new Date('2026-11-15') });
  assert.strictEqual((await w.poll(people)).status, 'rate-limited');
});

test('cap reached → capped, no fetch', async () => {
  const store = tmpStore();
  store.set({ x: { token: 'tok', capUsd: 1, monthKey: '2026-11', postsRead: Math.ceil(1 / PRICE_PER_POST) } });
  let called = false;
  const w = createXWatcher({ store, fetchFn: async () => { called = true; }, now: () => new Date('2026-11-20') });
  assert.strictEqual((await w.poll(people)).status, 'capped');
  assert.strictEqual(called, false);
});

test('month rollover resets the counter', async () => {
  const store = tmpStore();
  store.set({ x: { token: 'tok', capUsd: 1, monthKey: '2026-10', postsRead: 99999 } });
  const { fetchFn } = fakeX([json(200, { meta: { result_count: 0 } })]);
  const w = createXWatcher({ store, fetchFn, now: () => new Date('2026-11-02') });
  const r = await w.poll(people);
  assert.strictEqual(r.status, 'ok');
  assert.strictEqual(store.get().x.monthKey, '2026-11');
  assert.ok(store.get().x.postsRead < 10);
});
