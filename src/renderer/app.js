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

function renderBadges(container, person) {
  container.replaceChildren();
  const live = (state.live || {})[person.id] || {};
  for (const [platform, name] of [['youtube', 'YouTube'], ['kick', 'Kick']]) {
    if (!person[platform]) {
      container.append(badge(`${name}: not set`, 'unset'));
      continue;
    }
    const st = live[platform];
    if (st && st.live) {
      container.append(badge(`🔴 LIVE on ${name}`, 'live', () => widget.open(st.url), 'Watch in Opera'));
    } else {
      const fallback = platform === 'kick' ? `https://kick.com/${person.kick}` : youtubeUrl(person.youtube);
      container.append(badge(`${name}: ${st ? 'offline' : 'checking…'}`, 'link', () => widget.open(fallback), 'Open channel in Opera'));
    }
  }
  if (person.xHandle) {
    container.append(badge('X: check page', 'link', () => widget.open(`https://x.com/${person.xHandle}`), 'X live streams can\'t be detected automatically - open their X in Opera'));
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
  container.append(wv);
}

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
  const sel = $('goon-select');
  if (!s.goons.some((g) => g.id === selectedGoon)) selectedGoon = s.goons[0] ? s.goons[0].id : null;
  sel.replaceChildren(
    ...s.goons.map((g) => {
      const o = document.createElement('option');
      o.value = g.id;
      o.textContent = `${isLive(g.id) ? '🔴' : '⚪'} ${g.name}`;
      return o;
    })
  );
  sel.value = selectedGoon || '';
  const goon = s.goons.find((g) => g.id === selectedGoon);
  $('edit-goon').disabled = $('del-goon').disabled = !goon;
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
  const anyLive = [s.jesse, ...s.goons].some((p) => isLive(p.id));
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
  $('goon-dialog').showModal();
}

$('add-goon').onclick = () => openDialog({ type: 'add' });
$('edit-goon').onclick = () => openDialog({ type: 'edit', id: selectedGoon }, state.settings.goons.find((g) => g.id === selectedGoon));
$('edit-jesse').onclick = () => openDialog({ type: 'edit', id: 'jesse' }, state.settings.jesse);
$('del-goon').onclick = async () => {
  const g = state.settings.goons.find((x) => x.id === selectedGoon);
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
