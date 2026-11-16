// Free YouTube live check: load the channel's /live page and look for a live video.
function youtubeLiveUrl(channel) {
  let c = String(channel || '').trim().replace(/\/+$/, '');
  if (/^https?:\/\//i.test(c)) return c.replace(/\/live$/, '') + '/live';
  if (!c.startsWith('@')) c = '@' + c;
  return `https://www.youtube.com/${c}/live`;
}

async function checkYouTube(channel, fetchFn) {
  try {
    const r = await fetchFn(youtubeLiveUrl(channel), {
      headers: { 'Accept-Language': 'en-US,en;q=0.9', Cookie: 'CONSENT=YES+1' },
    });
    if (!r.ok) return { ok: false };
    const html = await r.text();
    const canon = html.match(/<link rel="canonical" href="(https:\/\/www\.youtube\.com\/watch\?v=[\w-]+)"/);
    const live = /"isLiveNow":true/.test(html) && !!canon;
    return { ok: true, live, url: live ? canon[1] : youtubeLiveUrl(channel).replace(/\/live$/, '') };
  } catch {
    return { ok: false };
  }
}

module.exports = { checkYouTube, youtubeLiveUrl };
