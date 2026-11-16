# PodAwful Widget

**Unofficial, fan-made.** Not affiliated with or endorsed by PodAwful.

A small Windows tray widget that:

- pops up an alert (with a smoke-alarm sound) when PodAwful or any goon goes live on YouTube, Kick, Rumble, or Twitch
- shows everyone who's live right now in a strip at the top
- shows their X profile right in the widget
- tells you when a new PodAwful episode drops (and when anything else changes on podawful.com)
- lets you set each person to 🔊 Alarm, 💬 Pop-up only, or 🔕 Muted, plus quiet hours with no alarm overnight
- updates itself: new versions download in the background and install when you restart it
- optionally pops up new X posts (needs your own paid X API key, see below)

## Install

1. Download `PodAwful Widget Setup x.y.z.exe` from the [Releases](https://github.com/Canti1/podawful-widget/releases) page.
2. Run it. The installer isn't code-signed, so Windows SmartScreen will say **"Windows protected your PC"**. Click **More info**, then **Run anyway**.
3. The widget lives in the system tray (bottom-right, near the clock). Click the icon to open it.

Links open in Opera if you have it, otherwise in your default browser.

**Tip:** the embedded X page starts in light mode. Log in to X inside the widget and pick *Settings → Accessibility, display and languages → Display → Lights out*.

## The shared goon list

Everyone's widget downloads the goon list from [`goons.json`](goons.json) in this repo when it starts and every 6 hours. You can also press **↻ Refresh goons**. When the list changes you'll see "Goon list updated: N new, N closed".

- **Suggest a goon:** press **Suggest a goon** (or tick "Also suggest them" when adding one). It opens a pre-filled GitHub issue. You need a free GitHub account.
- **Account closed / suspended / wrong links:** select the goon and press **⚑**.
- Suggestions go live for everyone once the maintainer approves them.
- **Your own goons:** goons you add with **＋** stay on your PC only. Shared goons can be hidden with 🗑 (undo in Settings).

Each goon has a status: `active`, `suspended` (still checked, but marked), or `closed` (no longer checked).

### For the maintainer: approving suggestions

New suggestions are checked automatically when they're opened: duplicates are closed, broken ones get **`needs-fix`** (and are re-checked when edited), valid ones get **`ready-for-review`**. More than 3 suggestions from one account in a day are closed as **`possible-spam`**, and accounts under a week old get a **`new-account`** label.

To approve, add the **`approved`** label to a suggestion or report issue. A GitHub Action checks it (valid handles, no duplicates), updates `goons.json`, commits, comments, and closes the issue. If something's wrong it comments why and removes the label, so you can fix the issue text and label it again. You can also edit `goons.json` by hand; the Tests workflow checks it on every push.

## X post pop-ups (optional)

X charges for API access, so post pop-ups are off unless you paste your own bearer token in Settings. There's a monthly spend cap so it can't run up a bill. Everything else works without it.

## Development

```
npm install
npm start      # run it
npm test       # unit tests
npm run dist   # build the Windows installer into dist/
```

Fonts: [Hack](https://github.com/source-foundry/Hack) (MIT, see `assets/fonts/LICENSE.md`).
