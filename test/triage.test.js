const test = require('node:test');
const assert = require('node:assert');
const { triage } = require('../scripts/triageIssue');

const goonsJson = { goons: [{ id: 'mersh', name: 'Mersh', xHandle: 'NiceGuyMersh', youtube: '', kick: '', status: 'active' }] };
const newIssue = (name, x) => ({
  labels: ['goon-suggestion'],
  body: `### Name\n\n${name}\n\n### X handle\n\n${x}\n\n### YouTube\n\n_No response_\n\n### Kick\n\n_No response_`,
});
const base = { goonsJson, recentCount: 1, accountAgeDays: 400, isOwner: false };

test('valid suggestion → ready-for-review, stays open, list untouched', () => {
  const r = triage({ ...base, issue: newIssue('New Guy', 'newguy') });
  assert.strictEqual(r.close, '');
  assert.deepStrictEqual(r.add, ['ready-for-review']);
  assert.match(r.comment, /Looks valid/);
  assert.strictEqual(goonsJson.goons.length, 1);
});

test('duplicate → closed as not planned', () => {
  const r = triage({ ...base, issue: newIssue('Someone', 'niceguymersh') });
  assert.strictEqual(r.close, 'not planned');
  assert.match(r.comment, /duplicate of \*\*Mersh/);
});

test('invalid → needs-fix, stays open', () => {
  const r = triage({ ...base, issue: newIssue('Bad', 'not a handle!') });
  assert.strictEqual(r.close, '');
  assert.deepStrictEqual(r.add, ['needs-fix']);
});

test('flood → closed as possible spam, owner exempt', () => {
  const r = triage({ ...base, recentCount: 4, issue: newIssue('New Guy', 'newguy') });
  assert.strictEqual(r.close, 'not planned');
  assert.deepStrictEqual(r.add, ['possible-spam']);
  const owner = triage({ ...base, recentCount: 9, isOwner: true, issue: newIssue('New Guy', 'newguy') });
  assert.strictEqual(owner.close, '');
});

test('brand-new account gets flagged but still triaged', () => {
  const r = triage({ ...base, accountAgeDays: 2, issue: newIssue('New Guy', 'newguy') });
  assert.deepStrictEqual(r.add, ['new-account', 'ready-for-review']);
  assert.match(r.comment, /under 7 days old/);
});
