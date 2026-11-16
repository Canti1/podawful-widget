const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createStore } = require('../src/main/store');

function tmpFile() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'paw-'));
  return path.join(dir, 'settings.json');
}

test('defaults when file missing, with seed goons', () => {
  const s = createStore(tmpFile()).get();
  assert.strictEqual(s.intervals.liveSec, 120);
  assert.strictEqual(s.intervals.xSec, 300);
  assert.strictEqual(s.intervals.siteSec, 900);
  assert.strictEqual(s.x.capUsd, 20);
  assert.strictEqual(s.x.excludeReplies, true);
  assert.strictEqual(s.alarm.enabled, true);
  assert.strictEqual(s.startWithWindows, false);
  assert.strictEqual(s.site.url, 'https://podawful.com');
  const names = s.goons.map((g) => g.name);
  assert.ok(names.includes('Mersh'));
  assert.ok(names.includes('Maoist Landlord'));
  assert.strictEqual(s.jesse.name, 'PodAwful');
});

test('invalid JSON falls back to defaults and rewrites file', () => {
  const f = tmpFile();
  fs.writeFileSync(f, '{not json');
  const s = createStore(f).get();
  assert.strictEqual(s.intervals.liveSec, 120);
  assert.doesNotThrow(() => JSON.parse(fs.readFileSync(f, 'utf8')));
});

test('goon add/update/remove persists', () => {
  const f = tmpFile();
  const a = createStore(f);
  const g = a.addGoon({ name: 'Test Goon', xHandle: 'tg', youtube: '', kick: 'tg' });
  assert.ok(g.id);
  a.updateGoon(g.id, { kick: 'tg2' });
  const b = createStore(f);
  assert.strictEqual(b.get().goons.find((x) => x.id === g.id).kick, 'tg2');
  b.removeGoon(g.id);
  assert.strictEqual(createStore(f).get().goons.find((x) => x.id === g.id), undefined);
});

test('set merges nested patch without losing other keys', () => {
  const st = createStore(tmpFile());
  st.set({ x: { token: 'abc' } });
  const s = st.get();
  assert.strictEqual(s.x.token, 'abc');
  assert.strictEqual(s.x.capUsd, 20);
});
