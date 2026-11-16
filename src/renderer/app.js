const $ = (id) => document.getElementById(id);
let state = null;
let selectedGoon = null;
let lastTrayLive = null;
let dialogMode = null; // { type: 'add' } | { type: 'edit', id }

// ---------- helpers ----------
function timeAgo(ms) {
  if (!ms) return 'never';
  const s = Math.round((Date.now() - ms) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  return new Date(ms).toLocaleString();
}

function isLive(id) {
  return Object.values((state.live || {})[id] || {}).some((v) => v.live);
}

function youtubeUrl(c) {
  if (/^https?:/i.test(c)) return c;
  return `https://www.youtube.com/${c.startsWith('@') ? c : '@' + c}`;
}

function badge(label, cls, onClick, title) {
  const b = document.createElement('button');
  b.className = 'badge ' + cls;
  b.textContent = label;
  if (title) b.title = title;
  if (onClick) b.onclick = onClick;
  return b;
}

const browserName = () => (state && state.runtime.browser) || 'your browser';

function renderBadges(container, person) {
  container.replaceChildren();
  if (person.status === 'closed') container.append(badge('✖ account closed', 'unset'));
  if (person.status === 'suspended') container.append(badge('⚠ suspended', 'unset', null, person.note || ''));
  const live = (state.live || {})[person.id] || {};
  for (const [platform, name] of [['youtube', 'YouTube'], ['kick', 'Kick']]) {
    if (!person[platform]) {
      container.append(badge(`${name}: not set`, 'unset'));
      continue;
    }
    const st = live[platform];
    if (st && st.live) {
      container.append(badge(`🔴 LIVE on ${name}`, 'live', () => widget.open(st.url), `Watch in ${browserName()}`));
    } else {
      const fallback = platform === 'kick' ? `https://kick.com/${person.kick}` : youtubeUrl(person.youtube);
      container.append(badge(`${name}: ${st ? 'offline' : 'checking…'}`, 'link', () => widget.open(fallback), `Open channel in ${browserName()}`));
    }
  }
  if (person.xHandle) {
    container.append(badge('X: check page', 'link', () => widget.open(`https://x.com/${person.xHandle}`), `X live streams can't be detected automatically - open their X in ${browserName()}`));
  } else {
    container.append(badge('X: not set', 'unset'));
  }
}

// One persistent webview per panel; only reload when the handle changes.
function renderX(container, handle) {
  const want = handle ? `https://x.com/${handle}` : '';
  if (container.dataset.src === want) return;
  container.dataset.src = want;
  container.replaceChildren();
  if (!want) {
    const d = document.createElement('div');
    d.className = 'empty';
    d.textContent = 'No X handle set. Use edit to add one.';
    container.append(d);
    return;
  }
  const wv = document.createElement('webview');
  wv.setAttribute('partition', 'persist:x');
  wv.setAttribute('src', want);
  wv.addEventListener('dom-ready', () => wv.insertCSS(X_CLEAN_CSS));
  container.append(wv);
}

// Hide X's navigation, sidebars, and bottom bar so only the profile and posts show.
const X_CLEAN_CSS = `
  header[role="banner"],
  [data-testid="sidebarColumn"],
  [data-testid="BottomBar"],
  [data-testid="DMDrawer"],
  [data-testid="GrokDrawer"],
  nav[aria-label="Primary"],
  a[href="/compose/post"] { display: none !important; }
  main[role="main"] { align-items: stretch !important; }
  main[role="main"] > div, [data-testid="primaryColumn"] {
    max-width: none !important; width: 100% !important; margin: 0 !important; border: 0 !important;
  }
`;

// ---------- render ----------
function render() {
  const s = state.settings;
  $('paused-pill').classList.toggle('hidden', !s.paused);
  $('pin').classList.toggle('on', !!s.onTop);

  // PodAwful tab
  renderBadges($('pod-badges'), s.jesse);
  const line = $('site-line');
  const changed = s.site.changedAt;
  const fresh = changed && Date.now() - changed < 24 * 3600 * 1000;
  line.textContent = state.runtime.siteOk === false
    ? 'podawful.com: couldn\'t reach the site (will retry)'
    : `podawful.com: ${changed ? 'updated ' + timeAgo(changed) : 'no changes seen yet'} · checked ${timeAgo(state.runtime.lastSiteCheck)}`;
  line.classList.toggle('new', !!fresh);
  line.onclick = fresh ? () => widget.open(s.site.url) : null;
  renderX($('pod-x'), s.jesse.xHandle);

  // Goons tab
  const visible = state.goons.filter((g) => !g.hidden);
  const sel = $('goon-select');
  if (!visible.some((g) => g.id === selectedGoon)) selectedGoon = visible[0] ? visible[0].id : null;
  const groups = [
    ['Shared goon list', visible.filter((g) => g.source === 'shared' && g.status !== 'closed')],
    ['My goons (only on this PC)', visible.filter((g) => g.source === 'local')],
    ['Closed accounts', visible.filter((g) => g.status === 'closed')],
  ];
  sel.replaceChildren(
    ...groups.filter(([, gs]) => gs.length).map(([label, gs]) => {
      const og = document.createElement('optgroup');
      og.label = label;
      og.append(...gs.map((g) => {
        const o = document.createElement('option');
        o.value = g.id;
        const mark = g.status === 'closed' ? '✖' : isLive(g.id) ? '🔴' : '⚪';
        o.textContent = `${mark} ${g.name}${g.status === 'suspended' ? ' (suspended)' : ''}`;
        return o;
      }));
      return og;
    })
  );
  sel.value = selectedGoon || '';
  const goon = visible.find((g) => g.id === selectedGoon);
  $('edit-goon').disabled = $('del-goon').disabled = $('report-goon').disabled = !goon;
  const shared = !!goon && goon.source === 'shared';
  $('edit-goon').title = shared ? 'Suggest a fix to the shared list' : 'Edit goon';
  $('del-goon').title = shared ? 'Hide from my list' : 'Delete goon';
  $('report-goon').classList.toggle('hidden', !shared);

  const nShared = state.goons.filter((g) => g.source === 'shared').length;
  const sl = $('shared-line');
  sl.textContent = state.runtime.sharedOk === false
    ? `Shared list: couldn't download (${state.runtime.sharedError || 'offline'}) - using saved copy (${nShared})`
    : `Shared list: ${nShared} goons · updated ${timeAgo(s.shared.fetchedAt)}`;
  const news = state.runtime.sharedNews;
  $('goon-news').classList.toggle('hidden', !news);
  if (news) {
    const bits = [];
    if (news.added.length) bits.push(`${news.added.length} new (${news.added.join(', ')})`);
    if (news.closed.length) bits.push(`${news.closed.length} closed (${news.closed.join(', ')})`);
    $('goon-news-text').textContent = `Goon list updated: ${bits.join(' · ')}`;
  }
  const nHidden = s.shared.hidden.length;
  $('hidden-line').textContent = nHidden ? `${nHidden} shared goon${nHidden > 1 ? 's' : ''} hidden` : 'No hidden goons';
  $('unhide').disabled = !nHidden;
  if (goon) {
    renderBadges($('goon-badges'), goon);
    renderX($('goon-x'), goon.xHandle);
  } else {
    $('goon-badges').replaceChildren();
    renderX($('goon-x'), '');
  }

  // Settings status lines (inputs are filled once in fillSettings)
  const xs = state.runtime.xStatus;
  const msg = {
    'no-token': s.x.hasToken ? 'Token saved - waiting for first check' : 'No token: X post pop-ups are off (everything else works).',
    ok: 'Token working ✔',
    'auth-error': 'X rejected the token (401/403). Check it in the X developer console.',
    'rate-limited': 'X rate limit hit - will retry next check.',
    capped: 'Monthly cap reached - X checks paused until next month or a higher cap.',
  }[xs] || '';
  $('x-token-state').textContent = msg;
  $('x-token-state').classList.toggle('bad', ['auth-error', 'rate-limited', 'capped'].includes(xs));
  $('x-spend').textContent = `Estimated X spend this month: $${state.runtime.spend.toFixed(2)} of $${s.x.capUsd} cap (~${s.x.postsRead} posts read). Last X check: ${timeAgo(state.runtime.lastXCheck)}.`;

  updateTrayIcon();
}

function fillSettings() {
  const s = state.settings;
  $('s-alarm').checked = s.alarm.enabled;
  $('s-volume').value = s.alarm.volume;
  $('s-token').value = '';
  $('s-token').placeholder = s.x.hasToken ? 'token saved (paste a new one to replace)' : 'paste token to enable post pop-ups';
  $('s-cap').value = s.x.capUsd;
  $('s-replies').checked = s.x.excludeReplies;
  $('s-live').value = s.intervals.liveSec;
  $('s-x').value = s.intervals.xSec;
  $('s-site').value = s.intervals.siteSec;
  $('s-opera').value = s.opera.path;
  $('s-startup').checked = s.startWithWindows;
  $('s-paused').checked = s.paused;
}

// Tray icon gets a red dot when anyone is live.
function updateTrayIcon() {
  const s = state.settings;
  const anyLive = [s.jesse, ...state.goons].some((p) => isLive(p.id));
  if (anyLive === lastTrayLive) return;
  lastTrayLive = anyLive;
  const img = new Image();
  img.onload = () => {
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const g = c.getContext('2d');
    g.save();
    g.beginPath();
    g.arc(32, 32, 32, 0, Math.PI * 2);
    g.clip();
    g.drawImage(img, 0, 0, 64, 64);
    g.restore();
    if (anyLive) {
      g.beginPath();
      g.arc(48, 48, 15, 0, Math.PI * 2);
      g.fillStyle = '#e5262f';
      g.fill();
      g.lineWidth = 4;
      g.strokeStyle = '#fff';
      g.stroke();
    }
    widget.setTrayImage(c.toDataURL('image/png'));
  };
  img.src = '../../assets/clickhead.jpg';
}

// ---------- events ----------
document.querySelectorAll('.tab').forEach((t) => {
  t.onclick = () => {
    document.querySelectorAll('.tab').forEach((x) => x.classList.toggle('active', x === t));
    document.querySelectorAll('.panel').forEach((p) => p.classList.toggle('active', p.id === 'tab-' + t.dataset.tab));
  };
});

$('pin').onclick = async () => apply(await widget.saveSettings({ onTop: !state.settings.onTop }));
$('goon-select').onchange = (e) => { selectedGoon = e.target.value; render(); };

function openDialog(mode, person) {
  dialogMode = mode;
  const f = $('goon-form');
  $('goon-dialog-title').textContent = mode.type === 'add' ? 'Add goon' : `Edit ${person.name}`;
  for (const k of ['name', 'xHandle', 'youtube', 'kick']) f.elements[k].value = person ? person[k] : '';
  f.elements.name.readOnly = mode.id === 'jesse';
  f.elements.suggest.checked = false;
  $('suggest-row').classList.toggle('hidden', mode.type !== 'add');
  $('goon-dialog').showModal();
}

$('add-goon').onclick = () => openDialog({ type: 'add' });
const selected = () => state.goons.find((g) => g.id === selectedGoon);
$('edit-goon').onclick = () => {
  const g = selected();
  if (!g) return;
  if (g.source === 'shared') {
    if (confirm(`${g.name} is on the shared list, so changes go through GitHub.\n\nOpen a pre-filled "fix links" form in ${browserName()}? (Needs a free GitHub account.)`)) widget.suggestGoon('update', g);
    return;
  }
  openDialog({ type: 'edit', id: g.id }, g);
};
$('report-goon').onclick = () => {
  const g = selected();
  if (g && confirm(`Report that ${g.name}'s account was closed/suspended (or links are wrong)?\n\nOpens a pre-filled GitHub form in ${browserName()}. Needs a free GitHub account.`)) widget.suggestGoon('update', g);
};
$('suggest-goon').onclick = () => widget.suggestGoon('new', {});
$('refresh-goons').onclick = async () => {
  $('refresh-goons').disabled = true;
  try { apply(await widget.refreshGoons()); } finally { $('refresh-goons').disabled = false; }
};
$('goon-news-x').onclick = () => widget.dismissGoonNews();
$('unhide').onclick = () => widget.unhideGoons();
$('edit-jesse').onclick = () => openDialog({ type: 'edit', id: 'jesse' }, state.settings.jesse);
$('del-goon').onclick = async () => {
  const g = selected();
  if (g && g.source === 'shared') {
    if (confirm(`Hide ${g.name}? You won't get alerts for them. (Undo in Settings.)`)) {
      await widget.hideGoon(g.id);
      selectedGoon = null;
    }
    return;
  }
  if (g && confirm(`Remove ${g.name} from your goons?`)) {
    await widget.removeGoon(g.id);
    selectedGoon = null;
    apply(await widget.getState());
  }
};

$('goon-dialog').addEventListener('close', async () => {
  if ($('goon-dialog').returnValue !== 'ok') return;
  const f = $('goon-form').elements;
  const data = { name: f.name.value, xHandle: f.xHandle.value, youtube: f.youtube.value, kick: f.kick.value };
  if (dialogMode.type === 'add') {
    const g = await widget.addGoon(data);
    selectedGoon = g.id;
    if ($('goon-form').elements.suggest.checked) widget.suggestGoon('new', data);
  } else {
    await widget.updateGoon(dialogMode.id, data);
  }
  apply(await widget.getState());
});

$('test-sound').onclick = () => playAlarm(Number($('s-volume').value));
$('test-notif').onclick = () => widget.testNotification();
$('check-now').onclick = () => widget.checkNow();

$('save-settings').onclick = async () => {
  const patch = {
    alarm: { enabled: $('s-alarm').checked, volume: Number($('s-volume').value) },
    x: { capUsd: Math.max(1, Number($('s-cap').value) || 20), excludeReplies: $('s-replies').checked },
    intervals: {
      liveSec: Math.max(30, Number($('s-live').value) || 120),
      xSec: Math.max(60, Number($('s-x').value) || 300),
      siteSec: Math.max(60, Number($('s-site').value) || 900),
    },
    opera: { path: $('s-opera').value.trim() },
    startWithWindows: $('s-startup').checked,
    paused: $('s-paused').checked,
  };
  const token = $('s-token').value.trim();
  if (token) patch.x.token = token;
  apply(await widget.saveSettings(patch));
  fillSettings();
  $('saved-msg').textContent = 'Saved ✔';
  setTimeout(() => ($('saved-msg').textContent = ''), 2000);
};

widget.onAlarm(() => playAlarm(state ? state.settings.alarm.volume : 0.7));
widget.onState((s) => apply(s));

function apply(s) {
  state = s;
  render();
}

widget.getState().then((s) => {
  apply(s);
  fillSettings();
});
setInterval(() => state && render(), 30000); // refresh "x min ago" labels
