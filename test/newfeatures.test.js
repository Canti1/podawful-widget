const test = require('node:test');
const assert = require('node:assert');
const { checkTwitch, twitchLogin } = require('../src/main/checkers/twitch');
const { parseFeed, checkFeed } = require('../src/main/checkers/feed');
const { isQuiet, alertMode } = require('../src/main/alerts');

// ---------- Twitch ----------
test('twitchLogin normalizes', () => {
  assert.strictEqual(twitchLogin('https://www.twitch.tv/SomeGuy/videos'), 'someguy');
  assert.strictEqual(twitchLogin('@SomeGuy'), 'someguy');
});

test('twitch: 200 preview → live; redirect to 404_preview → offline', async () => {
  const live = await checkTwitch('someguy', async () => ({ status: 200, url: 'https://static-cdn.jtvnw.net/previews-ttv/live_user_someguy-80x45.jpg' }));
  assert.deepStrictEqual(live, { ok: true, live: true, url: 'https://www.twitch.tv/someguy' });
  const off = await checkTwitch('someguy', async () => ({ status: 200, url: 'https://static-cdn.jtvnw.net/ttv-static/404_preview-80x45.jpg' }));
  assert.deepStrictEqual(off, { ok: true, live: false, url: 'https://www.twitch.tv/someguy' });
  const off2 = await checkTwitch('someguy', async () => ({ status: 302, url: '' }));
  assert.strictEqual(off2.live, false);
});

test('twitch: bad name, server error, network error → not ok', async () => {
  assert.deepStrictEqual(await checkTwitch('x', async () => ({ status: 200 })), { ok: false });
  assert.deepStrictEqual(await checkTwitch('someguy', async () => ({ status: 503, url: '' })), { ok: false });
  assert.deepStrictEqual(await checkTwitch('someguy', async () => { throw new Error('x'); }), { ok: false });
});

// ---------- Episode feed ----------
const rss = `<?xml version="1.0"?><rss><channel><title>PODAWFUL</title>
<item><title>OLD EP &amp; STUFF</title><pubDate>Sun, 01 Nov 2026 08:00:00 +0000</pubDate><guid isPermaLink="false"><![CDATA[old-1]]></guid><link><![CDATA[https://podawful.libsyn.com/old]]></link><description><![CDATA[<p>no post link</p>]]></description></item>
<item><title>AWFULWEEN 2026 - EO123</title><pubDate>Sun, 15 Nov 2026 08:28:00 +0000</pubDate><guid isPermaLink="false"><![CDATA[new-2]]></guid><link><![CDATA[https://podawful.libsyn.com/new]]></link><description><![CDATA[<p><a href= "https://podawful.com/posts/2676">https://podawful.com/posts/2676</a></p>]]></description></item>
</channel></rss>`;

test('parseFeed: newest first, decodes entities, prefers podawful.com post link', () => {
  const items = parseFeed(rss);
  assert.strictEqual(items.length, 2);
  assert.deepStrictEqual(items[0], { guid: 'new-2', title: 'AWFULWEEN 2026 - EO123', url: 'https://podawful.com/posts/2676', date: Date.parse('Sun, 15 Nov 2026 08:28:00 +0000') });
  assert.strictEqual(items[1].title, 'OLD EP & STUFF');
  assert.strictEqual(items[1].url, 'https://podawful.libsyn.com/old');
});

test('checkFeed: first run is not "new"; different guid is', async () => {
  const f = async () => ({ ok: true, text: async () => rss });
  assert.strictEqual((await checkFeed('u', '', f)).isNew, false);
  assert.strictEqual((await checkFeed('u', 'new-2', f)).isNew, false);
  const r = await checkFeed('u', 'old-1', f);
  assert.strictEqual(r.isNew, true);
  assert.strictEqual(r.latest.guid, 'new-2');
  assert.deepStrictEqual(await checkFeed('u', '', async () => ({ ok: true, text: async () => '<html/>' })), { ok: false });
  assert.deepStrictEqual(await checkFeed('u', '', async () => ({ ok: false })), { ok: false });
});

// ---------- Alerts ----------
const at = (h, m = 0) => new Date(2026, 10, 16, h, m);

test('isQuiet handles same-day and overnight ranges', () => {
  assert.strictEqual(isQuiet(at(23, 30), '23:00', '08:00'), true);
  assert.strictEqual(isQuiet(at(3), '23:00', '08:00'), true);
  assert.strictEqual(isQuiet(at(8), '23:00', '08:00'), false);
  assert.strictEqual(isQuiet(at(12), '23:00', '08:00'), false);
  assert.strictEqual(isQuiet(at(13), '12:00', '14:00'), true);
  assert.strictEqual(isQuiet(at(14), '12:00', '14:00'), false);
  assert.strictEqual(isQuiet(at(13), 'junk', '14:00'), false);
  assert.strictEqual(isQuiet(at(13), '10:00', '10:00'), false);
});

test('alertMode: levels, quiet hours, alarm toggle', () => {
  assert.deepStrictEqual(alertMode({ level: 'alarm', wantAlarm: true }), { popup: true, alarm: true });
  assert.deepStrictEqual(alertMode({ level: 'popup', wantAlarm: true }), { popup: true, alarm: false });
  assert.deepStrictEqual(alertMode({ level: 'mute', wantAlarm: true }), { popup: false, alarm: false });
  assert.deepStrictEqual(alertMode({ level: 'alarm', wantAlarm: true, quiet: true }), { popup: true, alarm: false });
  assert.deepStrictEqual(alertMode({ level: 'alarm', wantAlarm: true, quiet: true, hidePopupsWhenQuiet: true }), { popup: false, alarm: false });
  assert.deepStrictEqual(alertMode({ level: 'alarm', wantAlarm: true, alarmEnabled: false }), { popup: true, alarm: false });
  assert.deepStrictEqual(alertMode({ level: 'alarm', wantAlarm: false }), { popup: true, alarm: false });
  assert.deepStrictEqual(alertMode({ level: 'bogus', wantAlarm: true }), { popup: true, alarm: true });
});
