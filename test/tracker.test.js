const test = require('node:test');
const assert = require('node:assert');
const { createLiveTracker, checkAllLive } = require('../src/main/liveTracker');
const { contentHash, checkSite } = require('../src/main/checkers/site');

test('offline→live fires once; live→live does not', () => {
  const t = createLiveTracker();
  assert.strictEqual(t.update('a', 'kick', { ok: true, live: false }), null);
  assert.strictEqual(t.update('a', 'kick', { ok: true, live: true, url: 'u' }), 'went-live');
  assert.strictEqual(t.update('a', 'kick', { ok: true, live: true, url: 'u' }), null);
  assert.deepStrictEqual(t.snapshot().a.kick, { live: true, url: 'u' });
});

test('already live on first check counts as went-live', () => {
  const t = createLiveTracker();
  assert.strictEqual(t.update('a', 'youtube', { ok: true, live: true, url: 'u' }), 'went-live');
});

test('failed check mid-stream keeps state, no re-alert', () => {
  const t = createLiveTracker();
  t.update('a', 'kick', { ok: true, live: true, url: 'u' });
  assert.strictEqual(t.update('a', 'kick', { ok: false }), null);
  assert.strictEqual(t.snapshot().a.kick.live, true);
  assert.strictEqual(t.update('a', 'kick', { ok: true, live: true, url: 'u' }), null);
});

test('forget drops removed people', () => {
  const t = createLiveTracker();
  t.update('a', 'kick', { ok: true, live: true });
  t.forget(['b']);
  assert.strictEqual(t.snapshot().a, undefined);
});

test('checkAllLive skips empty links', async () => {
  const calls = [];
  const checkers = {
    youtube: async (c) => { calls.push(['yt', c]); return { ok: true, live: false }; },
    kick: async (c) => { calls.push(['kick', c]); return { ok: true, live: false }; },
  };
  const out = await checkAllLive([{ id: 'a', youtube: '', kick: 'k' }, { id: 'b', youtube: '@y', kick: '' }], checkers);
  assert.deepStrictEqual(calls.sort(), [['kick', 'k'], ['yt', '@y']]);
  assert.strictEqual(out.length, 2);
});

test('contentHash ignores scripts, styles, and whitespace', () => {
  const a = '<html><script>var t=1</script><style>a{}</style><p>Hello   world</p></html>';
  const b = '<html><script>var t=2</script><p>Hello world</p>\n</html>';
  assert.strictEqual(contentHash(a), contentHash(b));
  assert.notStrictEqual(contentHash(a), contentHash('<p>New episode</p>'));
});

test('checkSite: first run not changed, later change detected, failure ok:false', async () => {
  const f = (body) => async () => ({ ok: true, status: 200, text: async () => body });
  const first = await checkSite('u', '', f('<p>one</p>'));
  assert.deepStrictEqual([first.ok, first.changed], [true, false]);
  const same = await checkSite('u', first.hash, f('<p>one</p>'));
  assert.strictEqual(same.changed, false);
  const diff = await checkSite('u', first.hash, f('<p>two</p>'));
  assert.strictEqual(diff.changed, true);
  const bad = await checkSite('u', first.hash, async () => ({ ok: false, status: 503 }));
  assert.strictEqual(bad.ok, false);
});
