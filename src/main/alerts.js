// Decides how loud an alert should be: per-person level + quiet hours.

const LEVELS = ['alarm', 'popup', 'mute'];

const toMin = (hhmm) => {
  const m = String(hhmm || '').match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  return h < 24 && min < 60 ? h * 60 + min : null;
};

// start/end as "HH:MM"; handles ranges that cross midnight (23:00-08:00).
function isQuiet(date, start, end) {
  const s = toMin(start);
  const e = toMin(end);
  if (s === null || e === null || s === e) return false;
  const now = date.getHours() * 60 + date.getMinutes();
  return s < e ? now >= s && now < e : now >= s || now < e;
}

// wantAlarm: the event would normally ring the alarm (go-live), not just pop up.
function alertMode({ level = 'alarm', wantAlarm = false, quiet = false, hidePopupsWhenQuiet = false, alarmEnabled = true }) {
  const lvl = LEVELS.includes(level) ? level : 'alarm';
  if (lvl === 'mute') return { popup: false, alarm: false };
  const popup = !(quiet && hidePopupsWhenQuiet);
  const alarm = popup && wantAlarm && lvl === 'alarm' && alarmEnabled && !quiet;
  return { popup, alarm };
}

module.exports = { LEVELS, isQuiet, alertMode };
