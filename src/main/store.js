const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { SHARED_URL } = require('./sharedGoons');

// Handles are best guesses - editable in the app. Empty string = not set.
function defaults() {
  return {
    jesse: { id: 'jesse', name: 'PodAwful', xHandle: 'podawful', youtube: '', kick: 'podawful', rumble: 'PODAWFUL', twitch: '' },
    goons: [], // this person's private goons; the shared list lives in `shared`
    shared: { url: SHARED_URL, goons: [], fetchedAt: null, hidden: [] },
    opera: { path: '' },
    intervals: { liveSec: 120, xSec: 300, siteSec: 900, sharedSec: 21600 },
    alarm: { enabled: true, volume: 0.7 },
    player: { autoOpen: true }, // open podawful.com/live in the built-in player when PodAwful goes live
    x: { token: '', capUsd: 20, excludeReplies: true, monthKey: '', postsRead: 0, lastSeen: {} },
    site: { url: 'https://podawful.com', hash: '', changedAt: null },
    feed: { url: 'https://podawful.com/rss', lastGuid: '', latest: null },
    alerts: {}, // person id -> 'alarm' | 'popup' | 'mute' (default alarm)
    quiet: { enabled: false, start: '23:00', end: '08:00', hidePopups: false },
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
    rumble: String(g.rumble || '').trim(),
    twitch: String(g.twitch || '').trim().replace(/^@/, ''),
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
    setShared(goons) {
      data.shared = { ...data.shared, goons, fetchedAt: Date.now() };
      save();
    },
    hideShared(id) {
      if (!data.shared.hidden.includes(id)) data.shared.hidden = [...data.shared.hidden, id];
      save();
    },
    unhideAll() {
      data.shared.hidden = [];
      save();
    },
    removeGoon(id) {
      data.goons = data.goons.filter((g) => g.id !== id);
      save();
    },
  };
}

module.exports = { createStore, defaults };
