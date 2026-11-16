// Free Rumble live check: a channel's /livestreams page embeds its video list as
// JSON inside <rum-videos-grid>. A stream that is live right now has
// live: true and livestream_status: 2 (past streams are live: false, status 0).

function rumbleChannelUrl(input) {
  let c = String(input || '').trim().replace(/^https?:\/\/(www\.)?rumble\.com\//i, '').replace(/[?#].*$/, '').replace(/\/+$/, '');
  c = c.replace(/\/(livestreams|videos|shorts|about|exclusive)$/i, '');
  if (/^(c|user)\/[^/]+$/i.test(c)) return `https://rumble.com/${c}`;
  return `https://rumble.com/c/${c.replace(/^@/, '').split('/')[0]}`;
}

function findLive(html) {
  const m = String(html).match(/<rum-videos-grid>\s*<script type="application\/json">([\s\S]*?)<\/script>/);
  if (!m) return null; // page layout changed or not a channel page
  const items = (JSON.parse(m[1]).items || []).filter((v) => v && v.object_type === 'video');
  return { live: items.find((v) => v.live === true && v.livestream_status === 2) || null };
}

async function checkRumble(input, fetchFn) {
  const channel = rumbleChannelUrl(input);
  try {
    const r = await fetchFn(`${channel}/livestreams`, { headers: { 'Accept-Language': 'en-US,en;q=0.9' } });
    if (!r.ok) return { ok: false };
    const found = findLive(await r.text());
    if (!found) return { ok: false };
    return found.live ? { ok: true, live: true, url: found.live.url } : { ok: true, live: false, url: channel };
  } catch {
    return { ok: false };
  }
}

module.exports = { checkRumble, rumbleChannelUrl };
