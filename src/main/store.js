const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

// Handles are best guesses - editable in the app. Empty string = not set.
function defaults() {
  return {
    jesse: { id: 'jesse', name: 'PodAwful', xHandle: 'podawful', youtube: '', kick: 'podawful' },
    goons: [
      { id: 'mersh', name: 'Mersh', xHandle: '', youtube: '', kick: '' },
      { id: 'maoist-landlord', name: 'Maoist Landlord', xHandle: '', youtube: '', kick: '' },
    ],
    opera: { path: '' },
    intervals: { liveSec: 120, xSec: 300, siteSec: 900 },
    alarm: { enabled: true, volume: 0.7 },
    x: { token: '', capUsd: 20, excludeReplies: true, monthKey: '', postsRead: 0, lastSeen: {} },
    site: { url: 'https://podawful.com', hash: '', changedAt: null },
    startWithWindows: false,
    paused: false,
  };
}

function isObj(v) {
  return v && typeof v === 'object' && !Array.isArray(v);
}

function merge(base, patch) {
  const out = { ...base };
  for (const [k, v] of Object.entries(patch || {})) {
    out[k] = isObj(v) && isObj(base[k]) ? merge(base[k], v) : v;
  }
  return out;
}

function createStore(filePath) {
  let data;
  try {
    data = merge(defaults(), JSON.parse(fs.readFileSync(filePath, 'utf8')));
  } catch {
    data = defaults();
  }

  function save() {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    const tmp = filePath + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
    fs.renameSync(tmp, filePath);
  }
  save();

  const clean = (g) => ({
    name: String(g.name || '').trim(),
    xHandle: String(g.xHandle || '').trim().replace(/^@/, ''),
    youtube: String(g.youtube || '').trim(),
    kick: String(g.kick || '').trim(),
  });

  return {
    get: () => data,
    set(patch) {
      data = merge(data, patch);
      save();
      return data;
    },
    addGoon(g) {
      const goon = { id: crypto.randomUUID(), ...clean(g) };
      data.goons.push(goon);
      save();
      return goon;
    },
    updateGoon(id, patch) {
      if (id === 'jesse') {
        data.jesse = { ...data.jesse, ...clean({ ...data.jesse, ...patch }) };
      } else {
        data.goons = data.goons.map((g) => (g.id === id ? { ...g, ...clean({ ...g, ...patch }) } : g));
      }
      save();
    },
    removeGoon(id) {
      data.goons = data.goons.filter((g) => g.id !== id);
      save();
    },
  };
}

module.exports = { createStore, defaults };
