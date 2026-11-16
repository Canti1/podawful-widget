const crypto = require('node:crypto');

// Hash only the visible text so script/ad/token churn doesn't count as an update.
function contentHash(html) {
  const text = String(html)
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
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
