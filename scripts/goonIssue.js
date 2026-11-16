// Applies an approved "Suggest a goon" / "Report closed account" GitHub issue
// to goons.json. Used by .github/workflows/apply-goon.yml.
//
// CLI: node scripts/goonIssue.js <event.json> <goons.json> <outDir>
// Writes <outDir>/comment.md and <outDir>/commit-msg.txt, and prints ok=/changed= lines
// for $GITHUB_OUTPUT.

const fs = require('node:fs');
const path = require('node:path');

const EMPTY = '_No response_';

// GitHub renders issue forms as "### Field label\n\nvalue" blocks.
function parseForm(body) {
  const out = {};
  const parts = String(body || '').replace(/\r\n/g, '\n').split(/^### /m).slice(1);
  for (const part of parts) {
    const nl = part.indexOf('\n');
    const label = (nl < 0 ? part : part.slice(0, nl)).trim();
    const value = (nl < 0 ? '' : part.slice(nl + 1)).trim();
    out[label] = value === EMPTY ? '' : value;
  }
  return out;
}

const clean = (s) => String(s || '').replace(/[\u0000-\u001f\u007f<>`]/g, '').trim();

function cleanName(s) {
  const n = clean(s).replace(/\s+/g, ' ');
  if (!n) throw new Error('Name is empty.');
  if (n.length > 60) throw new Error('Name is longer than 60 characters.');
  return n;
}

function cleanX(s) {
  const v = clean(s).replace(/^https?:\/\/(www\.)?(x|twitter)\.com\//i, '').replace(/^@/, '').replace(/[/?#].*$/, '');
  if (!v) return '';
  if (!/^[A-Za-z0-9_]{1,15}$/.test(v)) throw new Error(`"${v}" isn't a valid X handle.`);
  return v;
}

function cleanYouTube(s) {
  let v = clean(s);
  if (!v) return '';
  const url = v.match(/^https?:\/\/(www\.|m\.)?youtube\.com\/(@[\w.-]{3,30}|channel\/UC[\w-]{10,30}|c\/[\w.-]{1,100}|user\/[\w.-]{1,100})\/?$/i);
  if (url) return `https://www.youtube.com/${url[2]}`;
  if (!v.startsWith('@')) v = '@' + v;
  if (!/^@[\w.-]{3,30}$/.test(v)) throw new Error(`"${clean(s)}" isn't a valid YouTube handle or channel URL.`);
  return v;
}

function cleanKick(s) {
  const v = clean(s).replace(/^https?:\/\/(www\.)?kick\.com\//i, '').replace(/[/?#].*$/, '');
  if (!v) return '';
  if (!/^[A-Za-z0-9_-]{2,25}$/.test(v)) throw new Error(`"${v}" isn't a valid Kick username.`);
  return v;
}

const norm = (s) => String(s || '').toLowerCase().replace(/\s+/g, ' ').trim();

function slug(name, taken) {
  const base = norm(name).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'goon';
  let id = base;
  for (let i = 2; taken.has(id); i++) id = `${base}-${i}`;
  return id;
}

function findGoon(goons, id, name) {
  return goons.find((g) => id && g.id === id) || goons.find((g) => name && norm(g.name) === norm(name));
}

// Returns { changed, summary } and mutates json.goons. Throws Error with a
// human-readable message when the issue can't be applied.
function applyIssue(json, issue) {
  const labels = (issue.labels || []).map((l) => (typeof l === 'string' ? l : l.name));
  const f = parseForm(issue.body);
  const goons = json.goons;

  if (labels.includes('goon-suggestion')) {
    const g = {
      id: '',
      name: cleanName(f['Name']),
      xHandle: cleanX(f['X handle']),
      youtube: cleanYouTube(f['YouTube']),
      kick: cleanKick(f['Kick']),
      status: 'active',
    };
    if (!g.xHandle && !g.youtube && !g.kick) throw new Error('No X, YouTube, or Kick given. Need at least one.');
    const dupe =
      findGoon(goons, '', g.name) ||
      goons.find((o) => (g.xHandle && norm(o.xHandle) === norm(g.xHandle)) || (g.kick && norm(o.kick) === norm(g.kick)) || (g.youtube && norm(o.youtube) === norm(g.youtube)));
    if (dupe) throw new Error(`Looks like a duplicate of **${dupe.name}** (\`${dupe.id}\`), who's already on the list. Use "Report a closed account / fix links" to change them instead.`);
    g.id = slug(g.name, new Set(goons.map((o) => o.id)));
    goons.push(g);
    return { changed: true, summary: `Added **${g.name}** to the shared goon list.`, commit: `goons: add ${g.name}` };
  }

  if (labels.includes('goon-update')) {
    const g = findGoon(goons, clean(f['Goon ID']), clean(f['Name']));
    if (!g) throw new Error(`Couldn't find a goon with ID "${clean(f['Goon ID'])}" or name "${clean(f['Name'])}".`);
    const what = norm(f['What happened?']);
    const before = JSON.stringify(g);
    let summary;
    if (what.startsWith('account closed')) {
      g.status = 'closed';
      summary = `Marked **${g.name}** as closed. They'll no longer be checked.`;
    } else if (what.startsWith('account suspended')) {
      g.status = 'suspended';
      summary = `Marked **${g.name}** as suspended.`;
    } else if (what.startsWith('back')) {
      g.status = 'active';
      summary = `Marked **${g.name}** as active again.`;
    } else if (what.startsWith('links are wrong')) {
      // Blank boxes leave the existing value alone.
      const x = cleanX(f['X handle']);
      const yt = cleanYouTube(f['YouTube']);
      const k = cleanKick(f['Kick']);
      if (x) g.xHandle = x;
      if (yt) g.youtube = yt;
      if (k) g.kick = k;
      summary = `Updated **${g.name}**'s links.`;
    } else {
      throw new Error(`Unknown "What happened?" choice: "${clean(f['What happened?'])}".`);
    }
    const changed = JSON.stringify(g) !== before;
    if (!changed) summary = `No change needed. **${g.name}** already looks like that.`;
    return { changed, summary, commit: `goons: update ${g.name} (${g.status})` };
  }

  throw new Error('This issue has neither the `goon-suggestion` nor the `goon-update` label, so there is nothing to apply.');
}

function main([eventPath, goonsPath, outDir]) {
  const event = JSON.parse(fs.readFileSync(eventPath, 'utf8'));
  const issue = event.issue;
  const json = JSON.parse(fs.readFileSync(goonsPath, 'utf8'));
  fs.mkdirSync(outDir, { recursive: true });
  let ok = true;
  let changed = false;
  let comment;
  try {
    const r = applyIssue(json, issue);
    changed = r.changed;
    comment = `✅ ${r.summary}\n\nEveryone's widget will pick this up within 6 hours (or right away with **↻ Refresh goons**).`;
    if (changed) {
      fs.writeFileSync(goonsPath, JSON.stringify(json, null, 2) + '\n');
      fs.writeFileSync(path.join(outDir, 'commit-msg.txt'), `${r.commit} (#${issue.number})\n`);
    }
  } catch (e) {
    ok = false;
    comment = `⚠️ Couldn't apply this automatically: ${e.message}\n\nFix the issue text (or goons.json by hand), then remove and re-add the \`approved\` label.`;
  }
  fs.writeFileSync(path.join(outDir, 'comment.md'), comment + '\n');
  console.log(`ok=${ok}`);
  console.log(`changed=${changed}`);
}

if (require.main === module) main(process.argv.slice(2));

module.exports = { parseForm, applyIssue, cleanX, cleanYouTube, cleanKick };
