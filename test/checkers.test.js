const test = require('node:test');
const assert = require('node:assert');
const { checkYouTube, youtubeLiveUrl } = require('../src/main/checkers/youtube');
const { checkKick } = require('../src/main/checkers/kick');

const res = (status, body) => ({
  ok: status >= 200 && status < 300,
  status,
  text: async () => (typeof body === 'string' ? body : JSON.stringify(body)),
  json: async () => (typeof body === 'string' ? JSON.parse(body) : body),
});

test('youtubeLiveUrl normalizes handles and URLs', () => {
  assert.strictEqual(youtubeLiveUrl('@podawful'), 'https://www.youtube.com/@podawful/live');
  assert.strictEqual(youtubeLiveUrl('podawful'), 'https://www.youtube.com/@podawful/live');
  assert.strictEqual(youtubeLiveUrl('https://www.youtube.com/@podawful/'), 'https://www.youtube.com/@podawful/live');
  assert.strictEqual(youtubeLiveUrl('https://www.youtube.com/channel/UC123'), 'https://www.youtube.com/channel/UC123/live');
});

test('youtube live page with isLiveNow → live with watch url', async () => {
  const html = '<link rel="canonical" href="https://www.youtube.com/watch?v=abc123XYZ_-"><script>{"isLiveNow":true}</script>';
  const r = await checkYouTube('@x', async () => res(200, html));
  assert.deepStrictEqual(r, { ok: true, live: true, url: 'https://www.youtube.com/watch?v=abc123XYZ_-' });
});

test('youtube offline page → not live', async () => {
  const html = '<link rel="canonical" href="https://www.youtube.com/@x"><script>{"isLiveNow":false}</script>';
  const r = await checkYouTube('@x', async () => res(200, html));
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.live, false);
});

test('youtube fetch failure → ok:false', async () => {
  const r = await checkYouTube('@x', async () => { throw new Error('offline'); });
  assert.strictEqual(r.ok, false);
  const r2 = await checkYouTube('@x', async () => res(500, ''));
  assert.strictEqual(r2.ok, false);
});

test('kick with livestream → live', async () => {
  const r = await checkKick('Mersh', async (url) => {
    assert.strictEqual(url, 'https://kick.com/api/v2/channels/mersh');
    return res(200, { livestream: { is_live: true } });
  });
  assert.deepStrictEqual(r, { ok: true, live: true, url: 'https://kick.com/mersh' });
});

test('kick offline / blocked / slug from URL', async () => {
  const off = await checkKick('https://kick.com/mersh', async () => res(200, { livestream: null }));
  assert.deepStrictEqual(off, { ok: true, live: false, url: 'https://kick.com/mersh' });
  const blocked = await checkKick('mersh', async () => res(403, 'blocked'));
  assert.strictEqual(blocked.ok, false);
});
