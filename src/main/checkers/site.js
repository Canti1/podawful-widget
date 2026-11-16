const crypto = require('node:crypto');

// Hash only the set of visible text lines: ignores script/token churn and the
// homepage's per-load shuffling of sections; new/removed content still changes it.
function contentHash(html) {
  const lines = String(html)
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, '')
    .replace(/<[^>]+>/g, '\n')
    .split('\n')
    .map((s) => s.replace(/\s+/g, ' ').trim())
    .filter(Boolean);
  const text = [...new Set(lines)].sort().join('\n');
  return crypto.createHash('sha256').update(text).digest('hex');
}

async function checkSite(url, prevHash, fetchFn) {
  try {
    const r = await fetchFn(url);
    if (!r.ok) return { ok: false };
    const hash = contentHash(await r.text());
    return { ok: true, hash, changed: !!prevHash && hash !== prevHash };
  } catch {
    return { ok: false };
  }
}

module.exports = { contentHash, checkSite };
