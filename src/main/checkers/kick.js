// Kick live check via Kick's unofficial (undocumented) channel endpoint.
// Isolated here so it can be swapped for the official Kick API if this breaks.
function kickSlug(input) {
  return String(input || '').trim().replace(/^https?:\/\/(www\.)?kick\.com\//i, '').replace(/\/.*$/, '').toLowerCase();
}

async function checkKick(input, fetchFn) {
  const slug = kickSlug(input);
  const url = `https://kick.com/${slug}`;
  try {
    const r = await fetchFn(`https://kick.com/api/v2/channels/${slug}`, {
      headers: { Accept: 'application/json' },
    });
    if (!r.ok) return { ok: false };
    const data = await r.json();
    return { ok: true, live: !!(data && data.livestream), url };
  } catch {
    return { ok: false };
  }
}

module.exports = { checkKick, kickSlug };
