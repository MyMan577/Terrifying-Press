# Notes for Claude

## Merging (owner's standing instruction)

The repo owner works from a phone and wants finished changes to reach the app without tapping Merge.
When a change is done and checked, Claude opens a pull request into `main` and merges it right away.
Merging into `main` runs `.github/workflows/build-apk.yml`, which builds the APK and publishes a GitHub Release.
After merging, check that the build went green and fix it if it did not.

Only merge Claude's own pull requests, and only after running the checks below on what changed.

## Target

Press Play is an Android app first. The browser copy (see below) gets non-AI changes, but don't build browser-only features here.
Test web-side changes against the Android app's behaviour (a faked Capacitor bridge in Playwright is fine for that).
The owner tests on a Galaxy S24 Ultra (120 Hz, strong GPU).

## Browser copy: Press-Play-Media

`MyMan577/Press-Play-Media` is the browser version of this app (a PWA on GitHub Pages). Its app files are a copy of this repo's built `www/`.
Every change that is not about the AI features also goes there. AI features means stems, tagging, Whisper, lyrics transcription, translation, smart playlists, Bloopy and the models behind them (mostly `src/vocal-separator/`).
A change that is only about AI does not need porting.

After the change is merged here:
1. `python3 tools/assemble.py`, and copy `android-overrides/native-bridge.js` over `www/native-bridge.js`.
2. In a clone of Press-Play-Media, copy everything in `www/` over its root. Keep its own `manifest.json`, icons, `sw.js`, `update-option.js` and `README.md`.
3. Put the web-only lines back into the copied `index.html`:
   - after `<meta name="theme-color" ...>`: the `manifest.json`, `icon-32.png` and `apple-touch-icon` (`icon-180.png`) links;
   - just before `</body>`: `<script src="./update-option.js" defer></script>` and the script that registers `./sw.js`.
   Copy these from the current `index.html` in Press-Play-Media before overwriting it.
4. Bump `CACHE_NAME` in `sw.js`, and add any new script or font the app loads at start to `CORE_ASSETS`.
5. Load it in Playwright from a local static server with no Capacitor: it must open with no console errors and play a file. Then open a PR there and merge it, as for this repo.

Android-only features (ExoPlayer, VLC, the NPU, notifications, alarms) switch themselves off in a browser, so a change to them alone does not need porting either.

## Project layout

- `www/index.html` (almost the whole app) and `www/vocal-separator.js` (stems, tagging, Whisper, Bloopy) are **built files, not stored in git**. Edit their parts in `src/`, then run `python3 tools/assemble.py` to build them into `www/`.
  - `src/index.html` is the page shell. Each `@@include path@@` line is replaced by that file (`src/index/css`, `src/index/html`, `src/index/js`).
  - `src/vocal-separator/*.js` are joined in name order.
  - The parts are plain cuts of one long file, so most are not complete scripts by themselves. Search across `src/` to find code, and check the built files, not the parts.
  - A new part under `src/index/` must be added to `src/index.html`; `assemble.py` fails on a part nothing includes.
- `backup/unsplit/` holds the full files as they were at the split. It is a snapshot: do not edit it or build from it.
- `android-overrides/native-bridge.js` is the copy that ships: the workflow overwrites `www/native-bridge.js` with it. Edit that one, and keep `www/native-bridge.js` identical to it.
- `android-overrides/` holds the native Android code. The workflow copies it into the generated Capacitor project.
- `www/CREDITS.txt` is Settings > Credits (shown at the very bottom): every library, model, font, service and tool the app uses, who made it, why it is used, and the licence texts. Add an entry whenever something new is used, and the licence text in Part 2 if that licence is not there yet.
- The signing key is `android-overrides/pp.keystore.enc`, unlocked in CI by the `KEYSTORE_FILE_PASSWORD` secret. Never commit a plain keystore.

## Checks before merging

- `python3 tools/assemble.py`, then `node --check www/vocal-separator.js` (and `www/native-bridge.js` if changed) and `node .github/scripts/check-web.js`.
- Java/Kotlin changes cannot be fully compiled here without the Android SDK. Compile changed pure-Java logic on its own with `javac` where possible, and say what was not tested.
