// podawful.com/live embeds the current stream (a YouTube embed today; the page
// also loads hls.js/video.js, so it may host its own stream). The page keeps
// showing the last video when nobody is live, so "the page has a video" isn't
// enough: we check that the embedded YouTube video is live right now.
const LIVE_URL = 'https://podawful.com/live';

function embeddedVideoId(html) {
  const m = String(html).match(/youtube(?:-nocookie)?\.com\/embed\/([\w-]{6,})/i);
  return m ? m[1] : null;
}

// A self-hosted HLS stream on the page counts as live.
const hasHlsStream = (html) => /https?:\/\/[^"'\s]+\.m3u8/i.test(String(html));

async function checkPodawfulLive(fetchFn, pageUrl = LIVE_URL) {
  try {
    const r = await fetchFn(pageUrl);
    if (!r.ok) return { ok: false };
    const html = await r.text();
    if (hasHlsStream(html)) return { ok: true, live: true, url: pageUrl };
    const id = embeddedVideoId(html);
    if (!id) return { ok: true, live: false, url: pageUrl };
    const w = await fetchFn(`https://www.youtube.com/watch?v=${id}`, {
      headers: { 'Accept-Language': 'en-US,en;q=0.9', Cookie: 'CONSENT=YES+1' },
    });
    if (!w.ok) return { ok: false };
    const live = /"isLiveNow":true/.test(await w.text());
    return { ok: true, live, url: pageUrl, videoId: id };
  } catch {
    return { ok: false };
  }
}

module.exports = { LIVE_URL, embeddedVideoId, hasHlsStream, checkPodawfulLive };
