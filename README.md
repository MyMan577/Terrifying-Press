# Press Play

A music and video player for Android that you can shape to your own taste, that keeps your library on your phone, and that runs its AI features on the device itself.

No account. No subscription. No ads.

## Why Press Play

Most players give you a fixed look, a fixed set of controls, and a growing list of cloud features that want your data. Press Play goes the other way.

- **It looks and behaves the way you want.** Colors, backgrounds, layout, gestures and shortcuts are all yours to change, and anything you do not need can be switched off.
- **It is private.** Your music and videos stay on your phone. There is no sign in, no tracking, and nothing is uploaded.
- **Its AI runs offline.** Lyrics, stem splitting, translation, smart playlists and the built-in chat assistant all run on your device once their models are downloaded. There is no cloud AI service behind any of it.

## Make it yours

Press Play has a lot of settings, and most of them are things other players leave fixed. You can go as light or as deep as you like.

**Look and layout**
- Pick an accent color and recolor the whole app with it.
- Set the background to a solid color, a gradient with an adjustable angle, or your own image, with controls for dimming and how the image fits the screen.
- Change the button color separately from the rest of the theme.
- Choose between the modern layout, with a bottom tab bar and mini player, or the Retro layout, which drops both for a simpler, older style.
- Turn on Simple playlist mode if you just want a plain track list, with no thumbnails, file sizes or multiple playlists.
- Hide the extras you do not want: the mascot, its speech bubbles, the assistant button and the game tab can each be switched off.

**Controls**
- Assign your own actions to taps, swipes, pinches and other gestures on the video or the disc.
- Add custom keyboard shortcuts, which override the defaults.
- Add skip back and skip forward buttons next to the speed control, with the jump lengths you choose.
- Skip intros and outros automatically, with your own lengths, so long openings and endings do not get in the way.

**Sound**
- A full equalizer with presets (bass, treble, vocal, v-shape, acoustic, pop, rock, jazz, classical, electronic, hip hop, loudness, podcast, late night and flat) as well as manual bands.
- Bass and reverb controls, and playback speed.
- Choose how songs join: normal, gapless with no pause between tracks, or crossfade with a length you set.
- ReplayGain keeps songs at a similar loudness so you are not reaching for the volume between tracks.

**Playback**
- Remembers where you stopped in each track, and lets you choose how often progress is saved. You can also turn it off so tracks always start from the beginning.
- Video settings aimed at slower phones, including frame-drop protection, audio lead and a lighter interface while video plays.
- Styled subtitle support for .ass and .ssa files, including colors, fonts and positions.
- Sleep timer, A-B repeat, shuffle, and playlist import and export.

**Backup and moving phones**
- Export your settings and progress, without your media files, and restore them on another phone.

## Privacy

Press Play is built so that your library is your business.

- Your music and videos stay on your device. Nothing is uploaded.
- There are no accounts and no sign in.
- There are no analytics or tracking built into the app.
- On first launch, Press Play asks for permission to read the audio and video on your device, and on Android 13 and newer it also asks to show playback notifications. Android shows both in one prompt. You can say no to either one, and you can always add files through the system file picker instead. Media access is only asked for once, so declining never turns into repeated prompts. You can change it later in Android Settings under Apps, Press Play, Permissions.
- Granting media access only lets the app read audio and video on your phone, which is what the Scan phone button uses. It does not upload anything and it does not give the app access to your photos, documents or anything else.
- Chats with the built-in assistant stay on your phone, and the conversation is cleared when you close the page or tap Clear.
- Voice features, including the optional wake word and talking to the assistant, are processed on the device.
- The AI models you download live on your phone, and you can delete them whenever you like.

The app does use the internet in a few specific situations, so you know exactly where the line is:

- **Downloading AI models.** Each model is a one-time download. Once it is on your phone it works offline. You choose which ones to get.
- **Lyrics lookup (optional).** If you turn on background lyric fetching, song titles are sent to lrclib.net and lyrics.ovh to find lyrics, which are then saved so they work offline. This is a single toggle in the lyrics settings. Turn it off and nothing is sent. You can also generate lyrics yourself with the on-device transcriber, which never sends anything anywhere.
- **Translation language packs.** About 30 MB per language, downloaded the first time you use that language. After that, translation runs offline.
- **Checking for updates (optional).** Once a day the app asks GitHub whether a newer build has been released, and offers it if so. Only the public release list is read, and nothing about you or your library is sent. Switch it off under Settings, App updates.
- **Playing a game together (optional).** Obby Builder, Weapon Ball, Bastion Brawl and Kitchen Rush can link two phones by scanning QR codes. The phones then talk to each other directly, and only game data (positions, moves, the course) goes between them. To find each other, the phones ask a public STUN server (stun.l.google.com) for their network addresses. Nothing about your library is sent.

## AI features, all on your device

Everything below runs locally on your phone with no cloud service involved. Each feature lets you pick a model size that suits your hardware, so it works on modest phones and makes use of flagship ones.

**Lyrics and subtitles**

Whisper listens to the audio and writes out the words, on your device. Songs get synced lyrics that follow along as they play, and videos get subtitles. An NVIDIA Parakeet model is also available for faster English transcription. This is useful for songs with no lyrics available online, for videos with no subtitles, and for anyone who would rather not send their audio anywhere.

**Stem splitting**

Pull a song apart into vocals, drums, bass and the rest. Tick the stems you want, pick a model, and tap split. Choose by quality and size:

- Fast, 2 stems (about 80 MB)
- Spleeter, 4 stems (about 79 MB)
- MDX-Net, for cleaner vocals (about 67 MB)
- Best quality, 4 stems, with a 6 stem option that adds guitar and piano (about 316 MB)

Use it to make a karaoke track, practice along with the bass or drums, or just hear a song one layer at a time.

**Translation**

Translate lyrics and subtitles between languages using on-device translation. The source language is detected automatically, and once a language pack is downloaded it works without a connection.

**AI tagging and smart playlists**

Press Play tags your songs by mood and sound while the app is idle, then builds playlists from those tags and your listening history. You can ask for what you want in plain words, such as "piano slow", or let it build For You, Ones You May Like and Your Pattern mixes. You control how much it does: background tagging, surprise playlists and live smart playlists that follow your tags can each be switched on or off.

**Bloopy, the built-in assistant**

Bloopy is a small chat assistant that lives inside the player. It can explain how features work, change settings for you, set EQ presets, find tracks similar to the one you are playing, and make playlists from a description. You can talk to it by voice and have it talk back, and everything it says and hears stays on your phone. Choose the chat model that fits your phone:

| Model | Size | Good for |
| --- | --- | --- |
| SmolLM2 135M | about 150 MB | Older or low-memory phones |
| Qwen2.5 0.5B | about 520 MB | Default, a good balance |
| Qwen2.5 0.5B, 4-bit | about 265 MB | The smallest download |
| Llama 3.2 1B | about 1.3 GB | Stronger phones |
| Qwen2.5 1.5B | about 1.6 GB | Stronger phones |
| Gemma 4 E2B | about 2.4 GB | High-end phones |
| Gemma 4 E4B | about 3.7 GB | Flagship phones |

Bloopy is entirely optional. If you do not want it, turn off the mascot and the assistant button in settings and the rest of the player works exactly the same.

## Also built in

- Scan phone: one tap in the Add menu finds all the music and videos on your phone and adds them to your library, with titles, artists, albums and cover art. It skips ringtones, alarms, notification sounds and voice recordings, and running it again only adds what is new. If you said no to media access earlier, tapping it asks again. You can still add files or whole folders by hand if you prefer to choose exactly what goes in.
- Browse the library by album, artist, genre or folder, as well as the plain song list.
- New on this phone: the app notices new music and videos on your phone and keeps them apart from your library, sorted into bundles by what each one looks like (an album, loose songs, podcasts, camera videos, screen recordings, voice messages and so on). You add or dismiss each bundle. Nothing joins your library by itself, and this can be switched off.
- Plays audio and video, from local files and from web stream links.
- Opens files from file managers, browsers and chat apps through "Open with".
- Registers itself as a music player, so headset, car and assistant requests to open your music app can launch it.
- Media notification and lock screen controls, with playback that keeps going in the background.
- Picture in picture for video.
- An optional progression system with levels, a minigame, a quiz and unlockable perks such as extra accent colors and animated gradients. It is completely optional and can be hidden with one switch.

## Games

The Games tab holds ten games that play offline, right inside the app. Your music keeps playing while you play, and Obby Builder and Weapon Ball turn their own soundtrack off while a song is on.

| Game | What it is |
| --- | --- |
| Obby Builder | Build an obstacle course, then beat it with a cast of characters who each move and fight their own way |
| Nebula Touch | Stir a field of light with your fingers |
| Toque & Spear | Hunt, fight and bond with the spirits of the wild |
| Weapon Ball | Pick your balls and watch them fight it out |
| Ante Up | Play poker hands to beat ten antes |
| Last Card | Match colours and numbers, and be first to empty your hand |
| Blob Barrage | Turn-based blob battles with silly weapons |
| Bastion Brawl | Send troops in and knock down the towers |
| Kitchen Rush | Cook every order before the clock runs out |
| Dashcube Knight | Tap to dash through stages of monsters |

**Press Play Points.** Daily and weekly quests and each game's achievements earn points. Spend them in the shop on game currencies, boosts and Press Play exclusives: characters, cosmetics and emotes you can't get inside the games themselves. The shop also sells the Playground, an extra app mode with a daily wheel, a beat sequencer, a rhythm game and a card album of characters from every game.

**Obby Builder fighting.** The fighters are built to make every hit feel like it lands:
- Each move has its own windup, sweet spot and recovery, and the character shows it with its whole body. The Brawler cocks a glowing glove back, the Arch Mage rises over a rune circle, the Form Switcher's stone form squats low and is slow to stand back up. A hit on the sweet spot does more damage, launches harder and freezes the action for a moment.
- Hold the attack button to charge a special, aimed sideways, up or down. Each fighter has its own: a dash through a crowd, a launching pillar, a shockwave, a meteor, a lightning storm, a rolling boulder.
- The Press Play Prodigy fights to a beat that follows the song playing in Press Play, reading its tempo from the song's tags or working it out from the kick drum. There is a headphone delay slider for Bluetooth headphones, with a tap-along button to set it.
- The Press Play Mixtape has two forms: a tape-whip fighter, and a grappling ribbon you can shoot in any direction to swing from blocks or grab foes and throw them.
- Build together: two phones linked by QR code edit the same course at the same time, then play it together. Your own course is saved as you build and comes back when you reopen the game, and nothing that happens while playing (broken walls, spawned blocks) changes it.
- Emotes: wave, dance, laugh, flex, bow, cheer, clap, facepalm, shrug, sleep and come on, and dances that keep going until you move (floss, twist, disco, running man, shuffle, slow sway), plus Air Guitar, Headbang, Mic Drop, Robot, DJ Scratch, Breakdance and Moonwalk from the shop. Your character performs them with a pair of floating hands, dances move on the beat of your song, and the emote wheel shows a live preview of your own character. In two-phone play, the other phone sees your emotes too.

## Install

1. Open the [Releases](../../releases) page.
2. Download the latest `press-play-1.0.x.apk` to your phone.
3. Open the file, and allow installs from your browser or file manager if Android asks.

Every build is signed with the same key, so a new version installs over the old one and keeps your settings and library. The app tells you when a newer version is out and takes you to the download.

## Build it yourself

Press Play is a web app wrapped with Capacitor, with native Android code for playback, on-device AI and downloads.

```
src/                  the two big app files, cut into parts (index.html and vocal-separator.js)
tools/assemble.py     joins the parts into www/index.html and www/vocal-separator.js
www/                  the rest of the app (scripts, games, fonts) and where the built files go
backup/unsplit/       the full, uncut files as they were when they were split
android-overrides/    native Android code, manifest additions, shortcuts
resources/icon.png    app icon source (1024x1024)
.github/workflows/    builds and publishes the APK
```

Pushing to `main` runs the GitHub Actions workflow, which builds the APK and publishes it as a release. You can also run it by hand from the Actions tab.

To build locally you need Node 20 and Java 17:

```
npm install
npx cap add android
npx cap sync android
```

Then copy the files from `android-overrides` into the generated Android project the way the workflow does, and build with Gradle.

## Feedback

Found a bug or want a feature? Open an issue on this repository.
