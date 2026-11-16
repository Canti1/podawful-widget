const test = require('node:test');
const assert = require('node:assert');
const { checkRumble, rumbleChannelUrl } = require('../src/main/checkers/rumble');

const page = (items) =>
  `<html><rum-videos-grid> <script type="application/json"> ${JSON.stringify({ items })} </script></rum-videos-grid></html>`;
const res = (status, body) => ({ ok: status >= 200 && status < 300, status, text: async () => body });

test('rumbleChannelUrl normalizes names and URLs', () => {
  assert.strictEqual(rumbleChannelUrl('PODAWFUL'), 'https://rumble.com/c/PODAWFUL');
  assert.strictEqual(rumbleChannelUrl('https://rumble.com/c/Redacted/livestreams?x=1'), 'https://rumble.com/c/Redacted');
  assert.strictEqual(rumbleChannelUrl('https://rumble.com/user/SomeGuy/'), 'https://rumble.com/user/SomeGuy');
  assert.strictEqual(rumbleChannelUrl('user/SomeGuy'), 'https://rumble.com/user/SomeGuy');
});

test('live stream (live + status 2) → live with video url', async () => {
  let asked;
  const r = await checkRumble('Redacted', async (u) => {
    asked = u;
    return res(200, page([
      { object_type: 'video', live: true, livestream_status: 2, url: 'https://rumble.com/v1-live.html' },
      { object_type: 'video', live: false, livestream_status: 0, url: 'https://rumble.com/v0-old.html' },
    ]));
  });
  assert.strictEqual(asked, 'https://rumble.com/c/Redacted/livestreams');
  assert.deepStrictEqual(r, { ok: true, live: true, url: 'https://rumble.com/v1-live.html' });
});

test('only past or upcoming streams → offline with channel url', async () => {
  const r = await checkRumble('x', async () => res(200, page([
    { object_type: 'video', live: false, livestream_status: 0, url: 'a' },
    { object_type: 'video', live: true, livestream_status: 1, url: 'b' },
  ])));
  assert.deepStrictEqual(r, { ok: true, live: false, url: 'https://rumble.com/c/x' });
});

test('missing grid, HTTP error, or network failure → not ok', async () => {
  assert.deepStrictEqual(await checkRumble('x', async () => res(200, '<html>nothing</html>')), { ok: false });
  assert.deepStrictEqual(await checkRumble('x', async () => res(404, '')), { ok: false });
  assert.deepStrictEqual(await checkRumble('x', async () => { throw new Error('offline'); }), { ok: false });
});
