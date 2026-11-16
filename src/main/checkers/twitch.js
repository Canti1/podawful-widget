// Free, keyless Twitch live check: Twitch's public CDN serves a stream preview
// thumbnail only while a channel is live. When offline it redirects to a
// "404_preview" placeholder image.

function twitchLogin(input) {
  return String(input || '')
    .trim()
    .replace(/^https?:\/\/(www\.|m\.)?twitch\.tv\//i, '')
    .replace(/^@/, '')
    .replace(/[/?#].*$/, '')
    .toLowerCase();
}

async function checkTwitch(input, fetchFn) {
  const login = twitchLogin(input);
  if (!/^[a-z0-9_]{3,25}$/.test(login)) return { ok: false };
  const url = `https://www.twitch.tv/${login}`;
  try {
    const r = await fetchFn(`https://static-cdn.jtvnw.net/previews-ttv/live_user_${login}-80x45.jpg?t=${Date.now()}`, { method: 'HEAD' });
    const finalUrl = String(r.url || '');
    if (/404_preview/.test(finalUrl) || (r.status >= 300 && r.status < 400)) return { ok: true, live: false, url };
    if (r.status === 200) return { ok: true, live: true, url };
    if (r.status === 404) return { ok: true, live: false, url };
    return { ok: false };
  } catch {
    return { ok: false };
  }
}

module.exports = { checkTwitch, twitchLogin };
