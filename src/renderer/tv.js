// The TV: shows podawful.com/live in a <webview> with the site's chrome (and
// chat - no room on a TV) hidden. Knobs: CH reloads, VOL mutes, ⏻ turns it off.
const LIVE_URL = 'https://podawful.com/live';
const params = new URLSearchParams(location.search);
document.body.classList.add(params.get('side') === 'left' ? 'side-left' : 'side-right');

const PAGE_CSS = `
  #main-header, footer, #banner, #loading, .row:has(> .col-sm-12 > h1.big-title), .col-lg-4 { display: none !important; }
  html, body { background: #000 !important; overflow: hidden !important; }
  body > .div, .div[style] { margin: 0 !important; }
  .row { margin: 0 !important; height: 100vh; }
  .col-lg-8 { flex: 1 1 100% !important; max-width: 100% !important; padding: 0 !important; }
  .iq-blog-box, .iq-blog-image, article { height: 100% !important; margin: 0 !important; padding: 0 !important; }
  .video-wrapper { position: relative !important; height: 100vh !important; padding: 0 !important; margin: 0 !important; }
  .video-wrapper iframe, .video-wrapper video, .video-wrapper .video-js {
    position: absolute !important; inset: 0 !important; width: 100% !important; height: 100% !important; }
`;
// The site embeds YouTube with mute=1; swap it to play with sound (VOL knob mutes the whole TV).
const UNMUTE_JS = `
  for (const f of document.querySelectorAll('iframe[src*="youtube"][src*="/embed/"]')) {
    const s = f.getAttribute('src');
    if (/[?&]mute=1/.test(s)) f.setAttribute('src', s.replace(/([?&])mute=1/, '$1mute=0'));
  }
  for (const v of document.querySelectorAll('video')) { v.muted = false; v.play().catch(() => {}); }
`;

const $ = (id) => document.getElementById(id);
const stream = $('stream');
const screenEl = $('screen');
let muted = params.get('muted') === '1';
let osdTimer;

function osd(text, { center = false, ms = 1800 } = {}) {
  const el = $('osd');
  el.textContent = text;
  el.classList.toggle('center', center);
  el.classList.remove('hidden');
  clearTimeout(osdTimer);
  if (ms) osdTimer = setTimeout(() => el.classList.add('hidden'), ms);
}

// Snow between channels.
const canvas = $('static');
const g = canvas.getContext('2d');
const img = g.createImageData(canvas.width, canvas.height);
let snowing = true;
(function snow() {
  if (snowing) {
    const d = img.data;
    for (let i = 0; i < d.length; i += 4) {
      const v = (Math.random() * 255) | 0;
      d[i] = d[i + 1] = d[i + 2] = v;
      d[i + 3] = 255;
    }
    g.putImageData(img, 0, 0);
  }
  requestAnimationFrame(snow);
})();
function setSnow(on) {
  snowing = on;
  canvas.classList.toggle('gone', !on);
}

// Snow only when the whole page changes (not when the embedded player loads stuff).
let snowTimer;
stream.addEventListener('did-start-navigation', (e) => {
  if (e.isMainFrame && !e.isInPlace) { clearTimeout(snowTimer); setSnow(true); }
});
// Clear once everything has stopped loading, with a beat for the player to start.
stream.addEventListener('did-stop-loading', () => {
  clearTimeout(snowTimer);
  snowTimer = setTimeout(() => setSnow(false), 700);
});
stream.addEventListener('did-finish-load', () => {
  let path = '';
  try { path = new URL(stream.getURL()).pathname; } catch {}
  if (path === '/live') {
    stream.insertCSS(PAGE_CSS).catch(() => {});
    stream.executeJavaScript(UNMUTE_JS).catch(() => {});
  }
});
stream.addEventListener('did-fail-load', (e) => {
  if (e.errorCode === -3) return; // aborted by a redirect/reload
  osd('NO SIGNAL', { center: true, ms: 0 });
});
stream.addEventListener('dom-ready', () => stream.setAudioMuted(muted), { once: true });

$('knob-ch').onclick = (e) => {
  e.currentTarget.style.transform = `rotate(${(Number(e.currentTarget.dataset.turn || 0) + 1) * 45}deg)`;
  e.currentTarget.dataset.turn = Number(e.currentTarget.dataset.turn || 0) + 1;
  osd('CH 03');
  stream.loadURL(LIVE_URL);
};
$('knob-vol').onclick = (e) => {
  muted = !muted;
  e.currentTarget.style.transform = muted ? 'rotate(-120deg)' : 'rotate(0deg)';
  stream.setAudioMuted(muted);
  osd(muted ? 'MUTE' : 'VOL ▮▮▮▮▮▮▮▮', { ms: muted ? 0 : 1500 });
};
$('power').onclick = () => tvApi.powerOff();

// Main asks us to switch off (power button, widget button, widget hidden): CRT collapse, then main slides us away.
tvApi.onPowerOff(() => {
  $('led').classList.remove('on');
  screenEl.classList.add('dying');
});
tvApi.onSide((side) => {
  document.body.classList.toggle('side-left', side === 'left');
  document.body.classList.toggle('side-right', side !== 'left');
});
tvApi.onSignIn(() => stream.loadURL('https://podawful.com/sign-in?return_to=%2Flive'));

// Power on once the drawer has slid out.
tvApi.onPowerOn(() => {
  $('led').classList.add('on');
  screenEl.classList.remove('off');
  if (muted) $('knob-vol').style.transform = 'rotate(-120deg)';
  osd(muted ? 'MUTE · QUIET HOURS' : 'CH 03', { ms: muted ? 0 : 1800 });
});
stream.src = LIVE_URL;
