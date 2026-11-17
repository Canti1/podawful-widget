// Live player: a retro TV (src/renderer/tv.html) that slides out of the
// widget's side like a drawer and follows it around. The TV shows
// podawful.com/live in a <webview>, so whatever the site embeds - YouTube
// today, its own stream tomorrow - just works.
const path = require('node:path');
const { BrowserWindow, Menu, ipcMain, screen } = require('electron');
const { LIVE_URL } = require('./checkers/podawfulLive');
const { drawerBounds, drawerFrame } = require('./playerRules');

const TV_HTML = path.join(__dirname, '..', 'renderer', 'tv.html');
const TV_PRELOAD = path.join(__dirname, '..', 'tvPreload.js');
const PARTITION = 'persist:podawful'; // stays signed in to podawful.com between streams

function createPlayer({ getAnchor, onChange = () => {} }) {
  let win = null;
  let open = null; // fully-open bounds + side
  let anim = null;
  let closing = false;
  let unhook = () => {};

  const anchorBounds = () => {
    const a = getAnchor();
    return a && !a.isDestroyed() && a.isVisible() ? a.getBounds() : null;
  };
  const target = () => {
    const a = anchorBounds();
    return a ? drawerBounds(a, screen.getDisplayMatching(a).workArea) : null;
  };

  // Slide from t0 to t1 over ~260 ms (ease-out), then call done.
  function slide(t0, t1, done) {
    clearInterval(anim);
    const start = Date.now();
    const ms = 260;
    anim = setInterval(() => {
      if (!win || win.isDestroyed()) { clearInterval(anim); anim = null; return; }
      const k = Math.min(1, (Date.now() - start) / ms);
      const t = t0 + (t1 - t0) * (1 - Math.pow(1 - k, 3));
      win.setBounds(drawerFrame(open, t));
      if (k === 1) { clearInterval(anim); anim = null; if (done) done(); }
    }, 16);
  }

  // Keep the TV glued to the widget when it moves/resizes; vanish with it.
  function follow(a) {
    const reposition = () => {
      if (!win || win.isDestroyed() || anim) return;
      const t = target();
      if (!t) return;
      if (t.side !== open.side) win.webContents.send('tv-side', t.side);
      open = t;
      win.setBounds(t);
    };
    const shut = () => destroy();
    a.on('move', reposition);
    a.on('resize', reposition);
    a.on('hide', shut);
    a.on('closed', shut);
    unhook = () => {
      if (a.isDestroyed()) return;
      a.off('move', reposition);
      a.off('resize', reposition);
      a.off('hide', shut);
      a.off('closed', shut);
    };
  }

  function destroy() {
    clearInterval(anim);
    anim = null;
    closing = false;
    unhook();
    unhook = () => {};
    const w = win;
    win = null;
    if (w && !w.isDestroyed()) w.destroy(); // stops the stream
    onChange(false);
  }

  function build({ sound }) {
    const anchor = getAnchor();
    open = target();
    win = new BrowserWindow({
      ...drawerFrame(open, 0),
      parent: anchor, // stays above the widget, minimizes with it
      frame: false,
      transparent: true,
      hasShadow: false,
      resizable: false,
      maximizable: false,
      skipTaskbar: true,
      show: false,
      title: 'PodAwful Live',
      webPreferences: {
        preload: TV_PRELOAD,
        contextIsolation: true,
        nodeIntegration: false,
        webviewTag: true,
        backgroundThrottling: false,
      },
    });
    win.setMinimumSize(1, 1);
    const wc = win.webContents;

    // Lock down the stream webview and let it autoplay with sound.
    wc.on('will-attach-webview', (e, prefs, params) => {
      if (params.partition !== PARTITION) return e.preventDefault();
      delete prefs.preload;
      prefs.nodeIntegration = false;
      prefs.contextIsolation = true;
      prefs.autoplayPolicy = 'no-user-gesture-required';
    });
    // Right-click menu on the screen for the less common stuff.
    wc.on('did-attach-webview', (_e, guest) => {
      guest.on('context-menu', () => {
        if (!win) return;
        Menu.buildFromTemplate([
          { label: 'Reload stream', click: () => guest.loadURL(LIVE_URL) },
          { label: 'Sign in to podawful.com', click: () => win && win.webContents.send('tv-sign-in') },
          { type: 'separator' },
          { label: 'Turn off TV', click: close },
        ]).popup({ window: win });
      });
    });
    win.on('closed', () => { if (win) destroy(); });

    follow(anchor);
    win.loadFile(TV_HTML, { query: { side: open.side, muted: sound ? '0' : '1' } });
    win.once('ready-to-show', () => {
      if (!win) return;
      win.showInactive();
      slide(0, 1, () => win && win.webContents.send('tv-power-on'));
    });
    onChange(true);
  }

  // CRT switch-off, then the drawer slides shut.
  function close() {
    if (!win || win.isDestroyed() || closing) return;
    closing = true;
    win.webContents.send('tv-power-off');
    setTimeout(() => slide(1, 0, destroy), 260);
  }

  ipcMain.on('tv-power-off', (e) => {
    if (win && e.sender === win.webContents) close();
  });

  return {
    // sound=false (quiet hours): the TV comes on muted.
    open({ sound = true } = {}) {
      if (win && !win.isDestroyed()) return;
      if (!anchorBounds()) return;
      build({ sound });
    },
    close,
    toggle(opts) {
      if (win && !win.isDestroyed()) close();
      else this.open(opts);
    },
    isOpen: () => !!win && !win.isDestroyed(),
  };
}

module.exports = { createPlayer };
