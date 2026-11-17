// Should the live player pop open by itself? Once per stream, never when the
// user paused alerts, muted PodAwful, or turned auto-open off.
function shouldAutoOpen({ autoOpen, paused, level, alreadyOpenedThisStream }) {
  return !!autoOpen && !paused && level !== 'mute' && !alreadyOpenedThisStream;
}

// The TV's size (matches tv.css --tv-w/--tv-h).
const TV_SIZE = { width: 720, height: 452 };

// Where the TV drawer sits next to the widget: out of the right edge, or the
// left edge when there's no room on the right. Vertically centered on the
// widget but kept on screen. anchor/workArea: {x, y, width, height}.
function drawerBounds(anchor, workArea, size = TV_SIZE) {
  const roomRight = workArea.x + workArea.width - (anchor.x + anchor.width);
  const roomLeft = anchor.x - workArea.x;
  const side = roomRight >= size.width || roomRight >= roomLeft ? 'right' : 'left';
  const x = side === 'right' ? anchor.x + anchor.width : anchor.x - size.width;
  const centered = Math.round(anchor.y + (anchor.height - size.height) / 2);
  const y = Math.max(workArea.y, Math.min(centered, workArea.y + workArea.height - size.height));
  return { side, x, y, width: size.width, height: size.height };
}

// Bounds while sliding: `t` 0 (shut, a sliver against the widget) → 1 (open).
function drawerFrame(open, t) {
  const width = Math.max(1, Math.round(open.width * t));
  const x = open.side === 'right' ? open.x : open.x + open.width - width;
  return { x, y: open.y, width, height: open.height };
}

module.exports = { shouldAutoOpen, drawerBounds, drawerFrame, TV_SIZE };
