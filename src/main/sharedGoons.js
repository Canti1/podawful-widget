// Shared goon list: a goons.json kept in the GitHub repo that every copy of the
// widget downloads. People suggest changes through GitHub issues; the repo owner
// approves them by editing goons.json.

const REPO = 'Canti1/podawful-widget';
const SHARED_URL = `https://raw.githubusercontent.com/${REPO}/main/goons.json`;
const STATUSES = ['active', 'suspended', 'closed'];

const str = (v) => (typeof v === 'string' ? v.trim() : '');
const norm = (name) => str(name).toLowerCase().replace(/\s+/g, ' ');

function parseList(json) {
  if (!json || !Array.isArray(json.goons)) throw new Error('goons.json has no "goons" list');
  const seen = new Set();
  const out = [];
  for (const g of json.goons) {
    if (!g || typeof g !== 'object') continue;
    const id = str(g.id);
    const name = str(g.name);
    if (!id || !name || seen.has(id)) continue;
    seen.add(id);
    out.push({
      id,
      name,
      xHandle: str(g.xHandle).replace(/^@/, ''),
      youtube: str(g.youtube),
      kick: str(g.kick),
      rumble: str(g.rumble),
      status: STATUSES.includes(g.status) ? g.status : 'active',
      note: str(g.note),
    });
  }
  return out;
}

// What changed between the list we had and the one just downloaded.
function diffLists(prev, next) {
  const before = new Map((prev || []).map((g) => [g.id, g]));
  const added = [];
  const closed = [];
  let changed = (prev || []).length !== next.length;
  for (const g of next) {
    const old = before.get(g.id);
    if (!old) {
      added.push(g.name);
      changed = true;
      continue;
    }
    if (g.status === 'closed' && old.status !== 'closed') closed.push(g.name);
    if (['name', 'xHandle', 'youtube', 'kick', 'rumble', 'status', 'note'].some((k) => (old[k] || '') !== (g[k] || ''))) changed = true;
  }
  return { added, closed, changed };
}

// Shared goons first, then the person's own. A private goon with the same name
// as a shared one is dropped so nobody gets double alerts.
function combineGoons(shared, local, hiddenIds = []) {
  const hidden = new Set(hiddenIds);
  const names = new Set(shared.map((g) => norm(g.name)));
  return [
    ...shared.map((g) => ({ ...g, source: 'shared', hidden: hidden.has(g.id) })),
    ...local
      .filter((g) => !names.has(norm(g.name)))
      .map((g) => ({ ...g, source: 'local', status: 'active', hidden: false })),
  ];
}

async function fetchShared(url, fetchFn) {
  try {
    const r = await fetchFn(url, { cache: 'no-store' });
    if (!r.ok) return { ok: false, error: `HTTP ${r.status}` };
    return { ok: true, goons: parseList(JSON.parse(await r.text())) };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

// Link to a pre-filled GitHub issue form ("new" goon, or "update" an existing one).
function issueUrl(repo, kind, g = {}) {
  const u = new URL(`https://github.com/${repo}/issues/new`);
  const p = u.searchParams;
  if (kind === 'new') {
    p.set('template', 'new-goon.yml');
    p.set('title', `New goon: ${g.name || ''}`.trim());
  } else {
    p.set('template', 'goon-update.yml');
    p.set('title', `Update: ${g.name || ''}`.trim());
    p.set('goon_id', g.id || '');
  }
  p.set('name', g.name || '');
  p.set('x', g.xHandle || '');
  p.set('youtube', g.youtube || '');
  p.set('kick', g.kick || '');
  p.set('rumble', g.rumble || '');
  return u.toString();
}

module.exports = { REPO, SHARED_URL, parseList, diffLists, combineGoons, fetchShared, issueUrl };
