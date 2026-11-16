# PodAwful Widget Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** An Electron tray widget that shows Jesse's and goons' X pages, alerts (with a synthesized smoke-alarm sound) when they go live on YouTube/Kick, pops up new X posts via the paid API, and watches podawful.com.

**Architecture:** Main process owns all network checks (pure, injectable-`fetch` checker modules), state transitions, notifications, tray, and opening Opera. Renderer is a plain HTML/JS UI with `<webview>` for x.com, talking to main over a preload IPC bridge. Settings/goons live in one JSON file in `app.getPath('userData')`.

**Tech Stack:** Node 22 LTS, Electron 33, plain JS (CommonJS in main), Node's built-in `node:test` runner (no extra test deps).

**Spec:** `docs/2026-11-15-podawful-widget-design.md`

## Global Constraints
- Windows 11; Opera at `%LOCALAPPDATA%\Programs\Opera\opera.exe` (launcher.exe fallback; path overridable in settings).
- Live poll every 2 min; X poll every 5 min; site check every 15 min (all configurable).
- X: bearer token optional; app fully works without it. Replies/retweets excluded by default. In-app monthly cap default $20 at $0.005/post read.
- First X poll per account records newest post ID without notifying.
- Notify only on offline→live transitions; one notification per new post.
- Alarm: synthesized, ~3 kHz, three short bursts; go-live only; on/off + volume + test button.
- Icon from `C:\Users\Account\Desktop\clickhead.jpg` copied to `assets/clickhead.jpg`.
- Token never logged.

## Review Focus
1. Network down / site returns 5xx → checker returns `{ok:false}`, state unchanged, no false "went offline then live" alert. Test in Task 2 and Task 3.
2. Goon added with only some links (no Kick, no X) → those checks skipped, no crash. Test in Task 3.
3. X API 429/401 → watcher backs off, surfaces "X: token invalid / rate limited" in settings, no spend counted. Test in Task 4.
4. Month rollover → spend counter resets. Test in Task 4.
5. Malformed / missing settings JSON → defaults loaded, file rewritten. Test in Task 1.

---

### Task 1: Project scaffold + store

**Files:** Create `package.json`, `src/main/store.js`, `test/store.test.js`, `assets/clickhead.jpg`

**Interfaces:**
- Produces: `createStore(filePath) -> { get(): Settings, set(patch): Settings, addGoon(g), updateGoon(id, patch), removeGoon(id) }`
- `Settings = { jesse: Person, goons: Person[], opera: {path}, intervals: {liveSec:120, xSec:300, siteSec:900}, alarm: {enabled:true, volume:0.7}, x: {token:'', capUsd:20, excludeReplies:true, monthKey:'', postsRead:0, lastSeen:{}}, site: {url:'https://podawful.com', hash:'', changedAt:null}, startWithWindows:false }`
- `Person = { id, name, xHandle, youtube, kick }` (`youtube` = channel URL or @handle, `kick` = slug; empty string = none)

- [ ] Tests: defaults when file missing; defaults when file is invalid JSON (and file rewritten); addGoon/removeGoon persist across a new `createStore` on the same path; seed goons "Mersh" and "Maoist Landlord" present by default.
- [ ] Run `npm test` → FAIL; implement; → PASS. Commit.

### Task 2: Live checkers (YouTube, Kick)

**Files:** Create `src/main/checkers/youtube.js`, `src/main/checkers/kick.js`, `test/checkers.test.js`

**Interfaces:**
- `checkYouTube(channel, fetchFn) -> Promise<{ok, live, url}>` — fetch `<channelUrl>/live`; live if HTML contains `"isLive":true` (or `"isLiveNow":true`); `url` = canonical watch URL if found.
- `checkKick(slug, fetchFn) -> Promise<{ok, live, url}>` — GET `https://kick.com/api/v2/channels/<slug>`; live if `livestream` non-null; `url` = `https://kick.com/<slug>`.

- [ ] Tests with fake `fetchFn`: live HTML → live true; offline HTML → false; fetch throws → `{ok:false}`; Kick JSON with/without livestream; Kick 403 → `{ok:false}`; `@handle` and full URL both normalized.
- [ ] FAIL → implement → PASS. Commit.

### Task 3: Live tracker + site watcher

**Files:** Create `src/main/liveTracker.js`, `src/main/checkers/site.js`, `test/tracker.test.js`

**Interfaces:**
- `createLiveTracker() -> { update(personId, platform, result) -> 'went-live'|null, snapshot() -> {[personId]: {youtube?, kick?}} }` — `{ok:false}` results leave state untouched.
- `checkAllLive(people, checkers) -> Promise<Array<{person, platform, result}>>` — skips empty links.
- `contentHash(html) -> string` (sha256 of text with `<script>`, `<style>`, whitespace runs stripped); `checkSite(url, prevHash, fetchFn) -> {ok, hash, changed}` (first run, prevHash '' → changed false).

- [ ] Tests: offline→live returns 'went-live' once, live→live null; ok:false mid-stream doesn't reset; person with no kick skipped; hash ignores script changes; first site run not "changed".
- [ ] FAIL → implement → PASS. Commit.

### Task 4: X post watcher

**Files:** Create `src/main/checkers/x.js`, `test/x.test.js`

**Interfaces:**
- `createXWatcher({ getToken, store, fetchFn, now }) -> { poll(people) -> Promise<{posts: Array<{person, id, text, url}>, status: 'ok'|'no-token'|'capped'|'auth-error'|'rate-limited'}> }`
- Resolve `GET https://api.x.com/2/users/by/username/<handle>` once (cache id in `x.lastSeen[handle].userId`); then `GET /2/users/<id>/tweets?since_id=..&exclude=replies,retweets&max_results=5`. Spend = postsRead × 0.005; month key `YYYY-MM` resets count.

- [ ] Tests: no token → status 'no-token', no fetch; first poll records newest id, returns no posts; second poll returns new posts with `https://x.com/<handle>/status/<id>`; 401 → 'auth-error' and no count; 429 → 'rate-limited'; cap reached → 'capped' and no fetch; month change resets count.
- [ ] FAIL → implement → PASS. Commit.

### Task 5: Main process wiring (window, tray, notifications, Opera, scheduler)

**Files:** Create `src/main/main.js`, `src/main/opera.js`, `src/preload.js`

**Interfaces:**
- `openInOpera(url, operaPath)` — `child_process.spawn(path, [url], {detached:true})`; falls back to `shell.openExternal`.
- IPC (preload exposes `window.widget`): `getState()`, `saveSettings(patch)`, `addGoon(g)`, `updateGoon(id,p)`, `removeGoon(id)`, `open(url)`, `testAlarm()`, `onState(cb)`, `onAlarm(cb)`.
- Scheduler runs live/X/site checks on their intervals; on 'went-live' → Notification (click → Opera) + send `alarm` to renderer; new post → Notification with name + text; site change → Notification. Tray icon from clickhead; tooltip lists who's live; menu Open / Pause alerts / Quit. Close → hide to tray. `webviewTag: true`, persistent partition `persist:x` for X login.

- [ ] Verify: `npm start` opens window and tray; notification appears via `testAlarm`. Commit.

### Task 6: Renderer UI + alarm

**Files:** Create `src/renderer/index.html`, `src/renderer/app.js`, `src/renderer/styles.css`, `src/renderer/alarm.js`

**Interfaces:**
- `playAlarm(volume)` — Web Audio square oscillator ~3100 Hz, three 0.5 s bursts with 0.25 s gaps.
- Tabs: PodAwful (badges, site line, X webview) / Goons (dropdown with live dots, badges, X webview, add/edit/delete form) / Settings (Opera path, intervals, alarm toggle+volume+test, X token, cap, spend estimate, start with Windows).

- [ ] Verify manually: switch goons → webview loads `https://x.com/<handle>`; live badge click opens Opera; test sound plays. Commit.

### Task 7: Desktop shortcut + final verification

- [ ] Add `scripts/make-shortcut.ps1` creating a Desktop shortcut "PodAwful Widget" to `electron.cmd .` with icon. Run full `npm test` → all pass; launch and smoke-test. Commit.
