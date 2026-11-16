const test = require('node:test');
const assert = require('node:assert');
const { parseList, diffLists, combineGoons, fetchShared, issueUrl } = require('../src/main/sharedGoons');

const res = (status, body) => ({ ok: status >= 200 && status < 300, status, text: async () => body });

test('parseList cleans entries, defaults status, drops junk', () => {
  const list = parseList({
    goons: [
      { id: 'mersh', name: ' Mersh ', xHandle: '@NiceGuyMersh', youtube: '', kick: '' },
      { id: 'ralph', name: 'Ethan Ralph', status: 'suspended' },
      { id: 'bad', name: 'Bad', status: 'weird' },
      { name: 'no id' },
      { id: 'mersh', name: 'duplicate id' },
      'junk',
    ],
  });
  assert.deepStrictEqual(list.map((g) => [g.id, g.name, g.status]), [
    ['mersh', 'Mersh', 'active'],
    ['ralph', 'Ethan Ralph', 'suspended'],
    ['bad', 'Bad', 'active'],
  ]);
  assert.strictEqual(list[0].xHandle, 'NiceGuyMersh');
  assert.strictEqual(list[1].kick, '');
});

test('parseList throws when there is no goons array', () => {
  assert.throws(() => parseList({}));
  assert.throws(() => parseList(null));
});

test('diffLists counts new and newly closed goons', () => {
  const prev = [{ id: 'a', name: 'A', status: 'active' }, { id: 'b', name: 'B', status: 'active' }];
  const next = [
    { id: 'a', name: 'A', status: 'closed' },
    { id: 'b', name: 'B', status: 'active' },
    { id: 'c', name: 'C', status: 'active' },
  ];
  assert.deepStrictEqual(diffLists(prev, next), { added: ['C'], closed: ['A'], changed: true });
  assert.deepStrictEqual(diffLists(next, next), { added: [], closed: [], changed: false });
});

test('diffLists notices edits that are not new/closed', () => {
  const prev = [{ id: 'a', name: 'A', xHandle: 'x', status: 'active' }];
  const next = [{ id: 'a', name: 'A', xHandle: 'y', status: 'active' }];
  assert.deepStrictEqual(diffLists(prev, next), { added: [], closed: [], changed: true });
});

test('combineGoons: shared first, locals with same name hidden, hidden ids flagged', () => {
  const shared = [
    { id: 'mersh', name: 'Mersh', status: 'active' },
    { id: 'old', name: 'Old', status: 'closed' },
  ];
  const local = [
    { id: 'u1', name: 'mersh' },
    { id: 'u2', name: 'My Guy' },
  ];
  const all = combineGoons(shared, local, ['old']);
  assert.deepStrictEqual(all.map((g) => [g.id, g.source, g.status, !!g.hidden]), [
    ['mersh', 'shared', 'active', false],
    ['old', 'shared', 'closed', true],
    ['u2', 'local', 'active', false],
  ]);
});

test('fetchShared returns parsed list or an error', async () => {
  const ok = await fetchShared('u', async () => res(200, JSON.stringify({ goons: [{ id: 'a', name: 'A' }] })));
  assert.strictEqual(ok.ok, true);
  assert.strictEqual(ok.goons[0].id, 'a');
  const notFound = await fetchShared('u', async () => res(404, 'nope'));
  assert.strictEqual(notFound.ok, false);
  const badJson = await fetchShared('u', async () => res(200, '{oops'));
  assert.strictEqual(badJson.ok, false);
  const offline = await fetchShared('u', async () => { throw new Error('offline'); });
  assert.strictEqual(offline.ok, false);
});

test('issueUrl pre-fills the issue form', () => {
  const u = new URL(issueUrl('Canti1/podawful-widget', 'new', { name: 'My Guy', xHandle: 'myguy', youtube: '', kick: 'mg' }));
  assert.strictEqual(u.origin + u.pathname, 'https://github.com/Canti1/podawful-widget/issues/new');
  assert.strictEqual(u.searchParams.get('template'), 'new-goon.yml');
  assert.strictEqual(u.searchParams.get('title'), 'New goon: My Guy');
  assert.strictEqual(u.searchParams.get('x'), 'myguy');
  assert.strictEqual(u.searchParams.get('kick'), 'mg');
  assert.strictEqual(u.searchParams.get('rumble'), '');
  const r = new URL(issueUrl('Canti1/podawful-widget', 'update', { id: 'mersh', name: 'Mersh' }));
  assert.strictEqual(r.searchParams.get('template'), 'goon-update.yml');
  assert.strictEqual(r.searchParams.get('goon_id'), 'mersh');
});
