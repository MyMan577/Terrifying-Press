# Notes for Claude

## Merging (owner's standing instruction)

The repo owner works from a phone and wants finished changes to reach the app without tapping Merge.
When a change is done and checked, Claude opens a pull request into `main` and merges it right away.
Merging into `main` runs `.github/workflows/build-apk.yml`, which builds the APK and publishes a GitHub Release.
After merging, check that the build went green and fix it if it did not.

Only merge Claude's own pull requests, and only after running the checks below on what changed.

## Target

Press Play is an Android app only. Don't spend effort on plain-browser support or browser-only checks.
Test web-side changes against the Android app's behaviour (a faked Capacitor bridge in Playwright is fine for that).
The owner tests on a Galaxy S24 Ultra (120 Hz, strong GPU).

## Project layout

- `www/index.html` is almost the whole app (one large file). `www/vocal-separator.js` holds stems, tagging and Whisper.
- `android-overrides/` holds the native Android code. The workflow copies it into the generated Capacitor project.
- The signing key is `android-overrides/pp.keystore.enc`, unlocked in CI by the `KEYSTORE_FILE_PASSWORD` secret. Never commit a plain keystore.

## Checks before merging

- `node --check www/vocal-separator.js` (and `www/native-bridge.js` if changed).
- Java/Kotlin changes cannot be fully compiled here without the Android SDK. Compile changed pure-Java logic on its own with `javac` where possible, and say what was not tested.
