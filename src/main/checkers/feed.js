// New-episode check from the PodAwful podcast RSS feed (podawful.com/rss).

const decode = (s) =>
  String(s || '')
    .replace(/^\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*$/, '$1')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .trim();

const tag = (xml, name) => {
  const m = xml.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, 'i'));
  return m ? decode(m[1]) : '';
};

function parseFeed(xml) {
  const items = [];
  for (const m of String(xml).matchAll(/<item\b[^>]*>([\s\S]*?)<\/item>/gi)) {
    const x = m[1];
    const title = tag(x, 'title');
    const link = tag(x, 'link');
    const guid = tag(x, 'guid') || link || title;
    if (!title || !guid) continue;
    const desc = tag(x, 'description');
    const post = desc.match(/https?:\/\/(www\.)?podawful\.com\/posts\/\d+/i);
    const date = Date.parse(tag(x, 'pubDate'));
    items.push({ guid, title, url: post ? post[0] : link, date: Number.isNaN(date) ? null : date });
  }
  return items.sort((a, b) => (b.date || 0) - (a.date || 0));
}

// lastGuid '' means first run: remember the newest episode without alerting.
async function checkFeed(url, lastGuid, fetchFn) {
  try {
    const r = await fetchFn(url, { headers: { Accept: 'application/rss+xml, text/xml' } });
    if (!r.ok) return { ok: false };
    const items = parseFeed(await r.text());
    if (!items.length) return { ok: false };
    const latest = items[0];
    return { ok: true, latest, isNew: !!lastGuid && latest.guid !== lastGuid };
  } catch {
    return { ok: false };
  }
}

module.exports = { parseFeed, checkFeed };
