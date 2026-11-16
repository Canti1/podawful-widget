# PodAwful Desktop Widget — Design

## Intent
A personal desktop widget for one fan to follow PodAwful (Jesse) and the "goons" he covers on
the show: see their X/Twitter, know when anyone goes live, notice when podawful.com changes, and
jump to a stream in Opera with one click. Personal use only; not distributed.

## Goals
- **Jesse panel:** his X feed, his live status (YouTube, Kick, X), and podawful.com update alerts.
- **Goons panel:** a dropdown of goons (e.g. Mersh, Maoist Landlord). Selecting one shows their
  X page and their live status; clicking the status opens their live stream in Opera.
- **Go-live alerts:** Windows notification when Jesse or any goon goes live; clicking it opens Opera.
- **User-managed goon list:** add / edit / remove goons in the app (name, X handle, YouTube channel,
  Kick channel). The cast changes weekly; no official list exists to pull from.
- **Clickhead icon:** window, taskbar, and tray icon from `C:\Users\Account\Desktop\clickhead.jpg`.

- **New-post pop-ups (paid X API):** Windows notification appears on its own when Jesse or a goon
  posts, showing their name and the post text; clicking it opens the post in Opera.
- **Smoke-alarm sound on go-live alerts:** generated in code (no audio file), with on/off,
  volume, and a "test sound" button. Not played for site updates or new posts.

## Non-goals
- Chat, posting, or any interaction with X/YouTube/Kick beyond viewing.
- Mobile, multi-user, cloud sync.

## Anti-goals (failure even if it "works")
- Surprise costs: nothing paid runs unless the user explicitly enables it and enters a key.
- Alert spam: one notification per go-live event, not one per poll.
- Heavy CPU/battery use while idling in the tray.

## Constraints
- Windows 11, Opera installed (Opera GX or regular; path detected or set in settings).
- X has no free API. Viewing X pages is done by embedding x.com in the app (user logs in once
  inside the widget; session persists).
- YouTube live check: free, no API key (check `youtube.com/channel/<id>/live` or `@handle/live`
  for a live video). YouTube Data API key is an optional fallback.
- Kick live check: unofficial `https://kick.com/api/v2/channels/<slug>` (`livestream` non-null =
  live). Undocumented and may break; the code isolates it so it can be swapped for the official
  Kick API later.
- X live check: no clean signal exists. Best-effort only: shown as "X: check page" rather than a
  live/offline status in v1.

## Approaches considered
1. **Electron desktop app — CHOSEN by the user.** Small always-on-top-capable window + tray icon,
   native notifications, and `<webview>` can embed x.com reliably. Cost: ~150 MB install.
2. Python (PySide/Qt WebEngine) — lighter, same features, plainer look, clunkier X embedding.
3. Rainmeter skin — great desktop look but cannot embed X pages or do the dropdown well. Ruled out.

X data — options considered for new-post alerts:
1. **Paid pay-per-use X API — CHOSEN by the user.** Reliable and permitted. ~$0.005/post read,
   est. $10–40/mo for Jesse + ~10 goons.
2. Background scraping of logged-in X pages — free but fragile and against X's rules (account
   risk). Rejected.
3. No post alerts — rejected; the user wants pop-ups.
Embedded X pages remain for viewing (free).

## Design
**Window:** compact (~420×700), resizable, "pin on top" toggle, minimize-to-tray, dark theme.
Two tabs:
- **PodAwful** — live badges (YouTube / Kick / X), "podawful.com updated <time>" line, embedded
  X page for Jesse.
- **Goons** — dropdown of goons, each entry showing a live dot; below it the selected goon's
  live badges and embedded X page. "+ Add goon" / edit / delete buttons.

**Live checker:** background poll every 2 minutes (configurable) for Jesse + every goon with a
YouTube/Kick link. Tracks previous state per person/platform; notifies only on offline→live.
Clicking a live badge or notification launches Opera with the stream URL.

**podawful.com watcher:** fetch the homepage every 15 minutes, hash the main content (strip
scripts/timestamps), alert when the hash changes. Shows the last-changed time.

**X post watcher (paid API):** user pastes an X API bearer token in Settings (stored locally,
never logged). Without a token the app works fully, minus post pop-ups. Resolves each handle to a
user ID once and caches it, then polls `GET /2/users/:id/tweets` with `since_id` every 5 minutes
(configurable), excluding replies/retweets by default. One notification per new post. In-app
spend guard: counts posts read, shows estimated monthly cost in Settings, and pauses polling when
a user-set monthly cap (default $20) is reached. The user should also set a spending limit in
X's developer console. On first run with a token, the app records the newest post per account
without notifying, so existing posts don't flood the screen.

**Alarm sound:** Web Audio synthesized smoke-detector beep (~3 kHz square-ish tone, three short
bursts). Plays with go-live notifications only.

**Tray:** clickhead icon; turns a red-dot variant when anyone is live. Menu: Open, Pause alerts,
Quit. Option to start with Windows (off by default).

**Storage:** goon list and settings in a JSON file in the app's user-data folder.

**Seed data:** Jesse's handles pre-filled; Mersh and Maoist Landlord pre-added with whatever
links can be confirmed, the rest left for the user to fill in.

## Builder's calls (not decided by the user)
Poll intervals, window size/theme, tab layout, JSON storage, hashing approach for the site
watcher, start-with-Windows default off, X live shown as best-effort, X poll every 5 min,
replies/retweets excluded by default, $20/mo default in-app cap, alarm sound design.
