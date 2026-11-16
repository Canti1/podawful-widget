const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');

function findOpera(customPath) {
  const local = process.env.LOCALAPPDATA || '';
  const candidates = [
    customPath,
    path.join(local, 'Programs', 'Opera', 'opera.exe'),
    path.join(local, 'Programs', 'Opera', 'launcher.exe'),
    path.join(local, 'Programs', 'Opera GX', 'opera.exe'),
    path.join(local, 'Programs', 'Opera GX', 'launcher.exe'),
    'C:\\Program Files\\Opera\\opera.exe',
    'C:\\Program Files\\Opera\\launcher.exe',
  ].filter(Boolean);
  return candidates.find((p) => {
    try {
      return fs.statSync(p).isFile();
    } catch {
      return false;
    }
  });
}

// Opens url in Opera; falls back to the default browser if Opera isn't found.
function openInOpera(url, customPath, fallback) {
  if (!/^https?:\/\//i.test(String(url))) return false;
  const exe = findOpera(customPath);
  if (!exe) {
    if (fallback) fallback(url);
    return false;
  }
  const child = spawn(exe, [url], { detached: true, stdio: 'ignore' });
  child.on('error', () => fallback && fallback(url));
  child.unref();
  return true;
}

module.exports = { findOpera, openInOpera };
