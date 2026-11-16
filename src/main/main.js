const path = require('node:path');
const { app, BrowserWindow, Tray, Menu, Notification, nativeImage, ipcMain, net, shell } = require('electron');
const { createStore } = require('./store');
const { checkYouTube } = require('./checkers/youtube');
const { checkKick } = require('./checkers/kick');
const { checkSite } = require('./checkers/site');
const { createXWatcher } = require('./checkers/x');
const { createLiveTracker, checkAllLive } = require('./liveTracker');
const { openInOpera } = require('./opera');

const ICON_PATH = path.join(__dirname, '..', '..', 'assets', 'clickhead.jpg');
const APP_ID = 'com.personal.podawful-widget';

if (!app.requestSingleInstanceLock()) app.quit();
app.setAppUserModelId(APP_ID);
// Look like plain Chrome so x.com / YouTube serve their normal pages.
app.userAgentFallback = app.userAgentFallback.replace(/\s?Electron\/\S+/, '').replace(/\s?podawful-widget\/\S+/, '');

let win, tray, store, xWatcher;
const tracker = createLiveTracker();
const runtime = { xStatus: 'no-token', lastLiveCheck: null, lastXCheck: null, lastSiteCheck: null, siteOk: null };
const fetchFn = (url, opts) => net.fetch(url, opts);
const timers = {};
let quitting = false;

const people = () => [store.get().jesse, ...store.get().goons];
const open = (url) => openInOpera(url, store.get().opera.path, (u) => shell.openExternal(u));

function publicState() {
  const s = store.get();
  const { token, ...xRest } = s.x;
  return {
    settings: { ...s, x: { ...xRest, lastSeen: undefined, hasToken: !!token } },
    live: tracker.snapshot(),
    runtime: { ...runtime, spend: xWatcher.estimatedSpend() },
  };
}

function pushState() {
  const st = publicState();
  if (win && !win.isDestroyed()) win.webContents.send('state', st);
  updateTray(st);
}

function liveNames(st) {
  return people()
    .filter((p) => Object.values(st.live[p.id] || {}).some((v) => v.live))
    .map((p) => p.name);
}

function updateTray(st) {
  if (!tray) return;
  const names = liveNames(st);
  tray.setToolTip(names.length ? `LIVE: ${names.join(', ')}` : 'PodAwful Widget - nobody live');
}

function notify(title, body, url, withAlarm) {
  if (store.get().paused || process.env.PAW_SILENT) return;
  const n = new Notification({ title, body, icon: ICON_PATH, silent: withAlarm && store.get().alarm.enabled });
  if (url) n.on('click', () => open(url));
  n.show();
  if (withAlarm && store.get().alarm.enabled && win && !win.isDestroyed()) win.webContents.send('alarm');
}

async function runLive() {
  const ps = people();
  tracker.forget(ps.map((p) => p.id));
  const results = await checkAllLive(ps, {
    youtube: (c) => checkYouTube(c, fetchFn),
    kick: (c) => checkKick(c, fetchFn),
  });
  for (const { person, platform, result } of results) {
    if (tracker.update(person.id, platform, result) === 'went-live') {
      const where = platform === 'kick' ? 'Kick' : 'YouTube';
      notify(`${person.name} is LIVE on ${where}`, 'Click to watch in Opera', result.url, true);
    }
  }
  runtime.lastLiveCheck = Date.now();
}

async function runX() {
  const r = await xWatcher.poll(people());
  runtime.xStatus = r.status;
  runtime.lastXCheck = Date.now();
  for (const p of r.posts) notify(`${p.person.name} posted on X`, p.text.slice(0, 240), p.url, false);
}

async function runSite() {
  const s = store.get().site;
  const r = await checkSite(s.url, s.hash, fetchFn);
  runtime.siteOk = r.ok;
  runtime.lastSiteCheck = Date.now();
  if (!r.ok) return;
  if (r.changed) {
    store.set({ site: { hash: r.hash, changedAt: Date.now() } });
    notify('podawful.com updated', 'Something new is on the site', s.url, false);
  } else if (!s.hash) {
    store.set({ site: { hash: r.hash } });
  }
}

function schedule(name, fn, secondsKey) {
  clearTimeout(timers[name]);
  const tick = async () => {
    try {
      await fn();
    } catch (e) {
      console.error(name, e.message);
    }
    pushState();
    const sec = Math.max(30, Number(store.get().intervals[secondsKey]) || 120);
    timers[name] = setTimeout(tick, sec * 1000);
  };
  tick();
}

function startAll() {
  schedule('live', runLive, 'liveSec');
  schedule('x', runX, 'xSec');
  schedule('site', runSite, 'siteSec');
}

function applyLoginItem() {
  app.setLoginItemSettings({
    openAtLogin: !!store.get().startWithWindows,
    path: process.execPath,
    args: app.isPackaged ? [] : [app.getAppPath()],
  });
}

// Windows only shows toast notifications reliably for apps with a Start Menu
// shortcut carrying the same AppUserModelID, so create/refresh one at startup.
function ensureStartMenuShortcut() {
  if (process.platform !== 'win32') return;
  const lnk = path.join(app.getPath('appData'), 'Microsoft', 'Windows', 'Start Menu', 'Programs', 'PodAwful Widget.lnk');
  const ico = path.join(__dirname, '..', '..', 'assets', 'clickhead.ico');
  shell.writeShortcutLink(lnk, require('node:fs').existsSync(lnk) ? 'update' : 'create', {
    target: process.execPath,
    args: app.isPackaged ? '' : `"${app.getAppPath()}"`,
    cwd: app.getAppPath(),
    icon: ico,
    iconIndex: 0,
    appUserModelId: APP_ID,
    description: 'PodAwful Widget',
  });
}

function showWindow() {
  if (!win || win.isDestroyed()) createWindow();
  win.show();
  win.focus();
}

function createWindow() {
  win = new BrowserWindow({
    width: 440,
    height: 760,
    minWidth: 360,
    minHeight: 500,
    title: 'PodAwful Widget',
    icon: ICON_PATH,
    backgroundColor: '#111114',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      webviewTag: true,
      backgroundThrottling: false,
    },
  });
  win.setAlwaysOnTop(!!store.get().onTop);
  win.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));
  win.on('close', (e) => {
    if (!quitting) {
      e.preventDefault();
      win.hide();
    }
  });
}

function buildTrayMenu() {
  const paused = store.get().paused;
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: 'Open', click: showWindow },
      { label: 'Check now', click: startAll },
      { label: paused ? 'Resume alerts' : 'Pause alerts', click: () => { store.set({ paused: !paused }); buildTrayMenu(); pushState(); } },
      { type: 'separator' },
      { label: 'Quit', click: () => { quitting = true; app.quit(); } },
    ])
  );
}

app.whenReady().then(() => {
  try { ensureStartMenuShortcut(); } catch (e) { console.error('shortcut', e.message); }
  store = createStore(path.join(app.getPath('userData'), 'settings.json'));
  xWatcher = createXWatcher({ store, fetchFn });

  // Links that try to open new windows (e.g. inside the X view) go to Opera instead.
  app.on('web-contents-created', (_e, wc) => {
    wc.setWindowOpenHandler(({ url }) => {
      open(url);
      return { action: 'deny' };
    });
  });

  ipcMain.handle('get-state', () => publicState());
  ipcMain.handle('save-settings', (_e, patch) => {
    const safe = { ...patch };
    if (safe.x && 'token' in safe.x) safe.x = { ...safe.x, token: String(safe.x.token).trim() };
    store.set(safe);
    if (safe.x && 'token' in safe.x) store.set({ x: { lastSeen: {} } });
    if ('startWithWindows' in safe) applyLoginItem();
    if ('onTop' in safe && win && !win.isDestroyed()) win.setAlwaysOnTop(!!safe.onTop);
    if (safe.intervals || safe.x) startAll();
    buildTrayMenu();
    pushState();
    return publicState();
  });
  ipcMain.handle('add-goon', (_e, g) => { const r = store.addGoon(g); runLive().then(pushState); return r; });
  ipcMain.handle('update-goon', (_e, id, p) => { store.updateGoon(id, p); runLive().then(pushState); });
  ipcMain.handle('remove-goon', (_e, id) => { store.removeGoon(id); pushState(); });
  ipcMain.handle('open-url', (_e, url) => open(url));
  ipcMain.handle('check-now', () => startAll());
  ipcMain.handle('test-notification', () => {
    const was = store.get().paused;
    store.set({ paused: false });
    notify('TEST: PodAwful is LIVE', 'This is what a go-live alert looks like', 'https://kick.com/podawful', true);
    store.set({ paused: was });
  });
  ipcMain.on('tray-image', (_e, dataUrl) => {
    if (tray) tray.setImage(nativeImage.createFromDataURL(dataUrl).resize({ width: 32, height: 32 }));
  });

  tray = new Tray(nativeImage.createFromPath(ICON_PATH).resize({ width: 32, height: 32 }));
  tray.on('click', showWindow);
  buildTrayMenu();

  createWindow();
  startAll();
});

app.on('second-instance', showWindow);
app.on('before-quit', () => { quitting = true; });
app.on('window-all-closed', () => {}); // keep running in the tray
