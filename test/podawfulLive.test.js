const test = require('node:test');
const assert = require('node:assert');
const { embeddedVideoId, checkPodawfulLive, LIVE_URL } = require('../src/main/checkers/podawfulLive');
const { shouldAutoOpen } = require('../src/main/playerRules');

const res = (status, body) => ({ ok: status >= 200 && status < 300, status, text: async () => body });
const page = (id) => `<iframe allowfullscreen src='https://www.youtube.com/embed/${id}?autoplay=1&amp;mute=1'></iframe>`;

test('embeddedVideoId pulls the id from the /live iframe', () => {
  assert.strictEqual(embeddedVideoId(page('kWeFcXNT7w4')), 'kWeFcXNT7w4');
  assert.strictEqual(embeddedVideoId('<p>nothing</p>'), null);
});

test('/live with a live YouTube embed → live, links to podawful.com/live', async () => {
  const fetchFn = async (url) => (url === LIVE_URL ? res(200, page('abc123XYZ')) : res(200, '{"isLiveNow":true}'));
  assert.deepStrictEqual(await checkPodawfulLive(fetchFn), { ok: true, live: true, url: LIVE_URL, videoId: 'abc123XYZ' });
});

test('/live showing an old (private/ended) video → not live', async () => {
  const fetchFn = async (url) => (url === LIVE_URL ? res(200, page('abc123XYZ')) : res(200, '"status":"LOGIN_REQUIRED"'));
  const r = await checkPodawfulLive(fetchFn);
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.live, false);
});

test('/live with a self-hosted .m3u8 stream → live', async () => {
  const r = await checkPodawfulLive(async () => res(200, '<video><source src="https://cdn.example.com/live/index.m3u8"></video>'));
  assert.strictEqual(r.live, true);
});

test('/live fetch failure → ok:false (keeps previous state)', async () => {
  assert.strictEqual((await checkPodawfulLive(async () => { throw new Error('x'); })).ok, false);
  assert.strictEqual((await checkPodawfulLive(async () => res(503, ''))).ok, false);
});

test('shouldAutoOpen: once per stream, respects setting/pause/mute', () => {
  const base = { autoOpen: true, paused: false, level: 'popup', alreadyOpenedThisStream: false };
  assert.strictEqual(shouldAutoOpen(base), true);
  assert.strictEqual(shouldAutoOpen({ ...base, level: 'alarm' }), true);
  assert.strictEqual(shouldAutoOpen({ ...base, level: 'mute' }), false);
  assert.strictEqual(shouldAutoOpen({ ...base, paused: true }), false);
  assert.strictEqual(shouldAutoOpen({ ...base, autoOpen: false }), false);
  assert.strictEqual(shouldAutoOpen({ ...base, alreadyOpenedThisStream: true }), false);
});

const { drawerBounds, drawerFrame, TV_SIZE } = require('../src/main/playerRules');
const screenArea = { x: 0, y: 0, width: 1920, height: 1040 };

test('TV slides out the right side, centered on the widget', () => {
  const b = drawerBounds({ x: 100, y: 50, width: 440, height: 760 }, screenArea);
  assert.deepStrictEqual(b, { side: 'right', x: 540, y: 50 + (760 - TV_SIZE.height) / 2, ...TV_SIZE });
});

test('TV uses the left side when the widget is against the right edge', () => {
  const b = drawerBounds({ x: 1480, y: 0, width: 440, height: 760 }, screenArea);
  assert.strictEqual(b.side, 'left');
  assert.strictEqual(b.x + b.width, 1480); // flush against the widget
});

test('TV stays on screen vertically', () => {
  const b = drawerBounds({ x: 100, y: 900, width: 440, height: 300 }, screenArea);
  assert.strictEqual(b.y + b.height, 1040);
  assert.strictEqual(drawerBounds({ x: 100, y: -200, width: 440, height: 300 }, screenArea).y, 0);
});

test('drawerFrame grows away from the widget edge', () => {
  const right = { side: 'right', x: 540, y: 0, width: 1000, height: 700 };
  assert.deepStrictEqual(drawerFrame(right, 0.5), { x: 540, y: 0, width: 500, height: 700 });
  const left = { side: 'left', x: 480, y: 0, width: 1000, height: 700 };
  assert.deepStrictEqual(drawerFrame(left, 0.5), { x: 980, y: 0, width: 500, height: 700 });
  assert.strictEqual(drawerFrame(left, 0).width, 1);
});
