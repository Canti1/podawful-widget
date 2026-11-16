const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { parseForm, applyIssue, cleanYouTube } = require('../scripts/goonIssue');
const { parseList } = require('../src/main/sharedGoons');

const list = () => ({
  goons: [
    { id: 'mersh', name: 'Mersh', xHandle: 'NiceGuyMersh', youtube: '@NiceGuyMersh', kick: '', status: 'active' },
  ],
});

const newBody = (o) =>
  `### Name\n\n${o.name}\n\n### X handle\n\n${o.x || '_No response_'}\n\n### YouTube\n\n${o.yt || '_No response_'}\n\n### Kick\n\n${o.kick || '_No response_'}\n\n### Rumble\n\n${o.rumble || '_No response_'}\n\n### Notes\n\n_No response_`;
const updBody = (o) =>
  `### Goon ID\n\n${o.id || '_No response_'}\n\n### Name\n\n${o.name}\n\n### What happened?\n\n${o.what}\n\n### X handle\n\n${o.x || '_No response_'}\n\n### YouTube\n\n${o.yt || '_No response_'}\n\n### Kick\n\n${o.kick || '_No response_'}\n\n### Rumble\n\n${o.rumble || '_No response_'}\n\n### Notes / proof link\n\n_No response_`;

test('parseForm reads issue-form markdown', () => {
  const f = parseForm('### Name\r\n\r\nMy Guy\r\n\r\n### X handle\r\n\r\n_No response_\r\n');
  assert.deepStrictEqual(f, { Name: 'My Guy', 'X handle': '' });
});

test('new goon suggestion is added with a slug id', () => {
  const j = list();
  const r = applyIssue(j, { labels: [{ name: 'goon-suggestion' }], body: newBody({ name: 'My Guy!', x: '@MyGuy', kick: 'https://kick.com/myguy' }) });
  assert.strictEqual(r.changed, true);
  const g = j.goons[1];
  assert.deepStrictEqual(g, { id: 'my-guy', name: 'My Guy!', xHandle: 'MyGuy', youtube: '', kick: 'myguy', rumble: '', status: 'active' });
  assert.strictEqual(parseList(j).length, 2);
});

test('rumble-only suggestion works and rumble links can be fixed', () => {
  const j = list();
  applyIssue(j, { labels: ['goon-suggestion'], body: newBody({ name: 'Rumbler', rumble: 'https://rumble.com/c/Rumbler/livestreams' }) });
  assert.strictEqual(j.goons[1].rumble, 'c/Rumbler');
  applyIssue(j, { labels: ['goon-update'], body: updBody({ id: 'mersh', name: 'Mersh', what: 'Links are wrong (corrected below)', rumble: 'MershRumble' }) });
  assert.strictEqual(j.goons[0].rumble, 'MershRumble');
  assert.throws(() => applyIssue(list(), { labels: ['goon-suggestion'], body: newBody({ name: 'Bad', rumble: 'not a channel!!' }) }), /valid Rumble/);
});

test('duplicate suggestion (same name or handle) is refused', () => {
  assert.throws(() => applyIssue(list(), { labels: ['goon-suggestion'], body: newBody({ name: 'mersh', x: 'other' }) }), /duplicate of \*\*Mersh/);
  assert.throws(() => applyIssue(list(), { labels: ['goon-suggestion'], body: newBody({ name: 'New Name', x: 'niceguymersh' }) }), /duplicate/);
});

test('suggestion with no platforms or bad handle is refused', () => {
  assert.throws(() => applyIssue(list(), { labels: ['goon-suggestion'], body: newBody({ name: 'Nobody' }) }), /at least one/);
  assert.throws(() => applyIssue(list(), { labels: ['goon-suggestion'], body: newBody({ name: 'Bad', x: 'way too long handle here' }) }), /valid X handle/);
});

test('report closed / suspended / back / links', () => {
  const j = list();
  assert.strictEqual(applyIssue(j, { labels: ['goon-update'], body: updBody({ id: 'mersh', name: 'Mersh', what: 'Account closed / deleted' }) }).changed, true);
  assert.strictEqual(j.goons[0].status, 'closed');
  applyIssue(j, { labels: ['goon-update'], body: updBody({ name: 'MERSH', what: 'Account suspended' }) });
  assert.strictEqual(j.goons[0].status, 'suspended');
  applyIssue(j, { labels: ['goon-update'], body: updBody({ id: 'mersh', name: 'Mersh', what: 'Back / reinstated' }) });
  assert.strictEqual(j.goons[0].status, 'active');
  const r = applyIssue(j, { labels: ['goon-update'], body: updBody({ id: 'mersh', name: 'Mersh', what: 'Links are wrong (corrected below)', kick: 'mersh' }) });
  assert.strictEqual(r.changed, true);
  assert.strictEqual(j.goons[0].kick, 'mersh');
  assert.strictEqual(j.goons[0].xHandle, 'NiceGuyMersh', 'blank boxes keep old values');
});

test('no-op update reports no change; unknown goon throws', () => {
  const r = applyIssue(list(), { labels: ['goon-update'], body: updBody({ id: 'mersh', name: 'Mersh', what: 'Back / reinstated' }) });
  assert.strictEqual(r.changed, false);
  assert.throws(() => applyIssue(list(), { labels: ['goon-update'], body: updBody({ id: 'nope', name: 'Nope', what: 'Account closed / deleted' }) }), /Couldn't find/);
});

test('cleanYouTube accepts handles and channel URLs, rejects junk', () => {
  assert.strictEqual(cleanYouTube('tricballcult'), '@tricballcult');
  assert.strictEqual(cleanYouTube('https://youtube.com/@NiceGuyMersh/'), 'https://www.youtube.com/@NiceGuyMersh');
  assert.throws(() => cleanYouTube('javascript:alert(1)'));
});

test('repo goons.json is valid and nothing gets dropped', () => {
  const raw = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'goons.json'), 'utf8'));
  const parsed = parseList(raw);
  assert.strictEqual(parsed.length, raw.goons.length, 'every entry needs a unique id and a name');
  for (const g of raw.goons) assert.ok(['active', 'suspended', 'closed'].includes(g.status), `${g.id} has a bad status`);
});
