// Remembers who is live on which platform and reports only offline→live transitions.
function createLiveTracker() {
  const state = {}; // { personId: { platform: { live, url } } }
  return {
    update(personId, platform, result) {
      if (!result || !result.ok) return null; // failed check: keep previous state
      const person = (state[personId] = state[personId] || {});
      const wasLive = !!(person[platform] && person[platform].live);
      person[platform] = { live: !!result.live, url: result.url };
      return result.live && !wasLive ? 'went-live' : null;
    },
    snapshot: () => JSON.parse(JSON.stringify(state)),
    forget(keepIds) {
      for (const id of Object.keys(state)) if (!keepIds.includes(id)) delete state[id];
    },
  };
}

async function checkAllLive(people, checkers) {
  const jobs = [];
  for (const p of people) {
    for (const platform of ['youtube', 'kick', 'rumble']) {
      if (p[platform]) {
        jobs.push(checkers[platform](p[platform]).then((result) => ({ person: p, platform, result })));
      }
    }
  }
  return Promise.all(jobs);
}

module.exports = { createLiveTracker, checkAllLive };
