    // ---------- Playmedia quiz ----------
    // Each attempt draws QUIZ_LEN random questions (mostly app features, a few on XP) and
    // shuffles the answers. Scoring MORE than 70% grants a one-time,
    // permanent +1x XP multiplier (still subject to the 10x total cap).
    const QUIZ_FLAG = 'ppxpQuizPlusOneV2';
    const QUIZ_BEST = 'ppxpQuizBestV2';
    const QUIZ_LEN = 20;
    const QUIZ_XP_COUNT = 5;    // of each attempt's questions, this many are about XP & grooves; the rest cover the app
    const QUIZ_PASS = 0.7;      // must EXCEED this accuracy
    const QUIZ_BONUS = 1;

    // [question, correct answer, wrong, wrong, wrong, explanation]
    const QUIZ_BANK = [
      ['How is XP earned?', 'By time actually played, counted from where playback starts', 'Only by finishing tracks', 'By opening the app', 'By adding tracks', 'Seeking is allowed, but skipped sections earn nothing.'],
      ['Does time skipped by seeking earn XP?', 'No, only time actually played counts', 'Yes, the full track length counts', 'Only when skipping forward', 'Only at 2x speed', 'Seeking never voids XP, it just earns nothing for skipped parts.'],
      ['How much base XP is earned per minute played?', '30', '1', '60', '100', 'XP is 30 per minute before multipliers.'],
      ['What is the maximum level?', '500', '100', '160', '300', 'The cap was raised to Lv 500.'],
      ['How much XP does Level 1 cost?', '60', '10', '205', '300', 'Costs climb from 60 XP at level 1.'],
      ['What is the hard cap on shop XP multipliers?', '3x', '5x', '10x', 'There is no cap', 'Timed boosts and sprints combined can never exceed 3x. The daily streak bonus is separate.'],
      ['Which rank is the starting rank?', 'New Presser', 'Casual Player', 'Media Enthusiast', 'Pro Media Player', 'Everyone starts as a New Presser at Lv 1.'],
      ['Which rank is reached at Level 3?', 'Casual Player', 'Experienced Player', 'Media Enthusiast', 'Media Virtuoso', 'Casual Player unlocks the first backgrounds.'],
      ['Which rank is reached at Level 60?', "Press Play's Media Monarch", 'Press Play Legend', 'Regent of the Realm', 'Media Maestro', 'Level 60 earns the crown.'],
      ['Which rank sits at Level 160?', "Press Play Media's Caesar", "Press Play's Emperor", 'Warlord of the Waves', 'Sovereign of Sound', 'Caesar was the original top rank.'],
      ['What is the final rank at Level 500?', "Press Play Media's Eternal", "Press Play Media's Immortal", 'Eternal Encore', 'Press Play Titan', 'Eternal is the summit.'],
      ['Which rank sits at Level 300?', "Press Play Media's Immortal", "Press Play Media's Eternal", 'Eternal Encore', 'Mythic Maestro', 'Immortal was the original summit.'],
      ['What unlocks at Level 320?', 'Custom EQ preset slots', 'Accent colors', 'Extra EQ bands', 'Animated gradients', 'Ascendant of the Airwaves can save its own EQ curves.'],
      ['How many custom EQ slots are available at Level 500?', '5', '12', '8', '3', 'Slots unlock one at a time from Lv 320 to Lv 500.'],
      ['What unlocks at Level 360?', 'Skip intro and outro', 'Quick speed buttons', 'Jump buttons', 'Quick boost buttons', 'It lives under Settings > Level perks.'],
      ['What does Press Play PLUS do?', 'Unlocks every level perk from the start and keeps levels', 'Removes levels and EXP', 'Doubles XP', 'Hides all backgrounds', 'PLUS keeps the leveling system.'],
      ['What does the Level 380 perk add?', 'Skip back and forward buttons', 'Quick boost buttons', 'Skip intro and outro', 'Custom EQ slots', 'The choices are 5, 10, 15 or 30 seconds.'],
      ['What unlocks at Level 15?', 'Choosing a custom accent color', 'Animated gradients', 'The crown badge', 'Extra EQ bands', 'Pro Media Player unlocks app recoloring.'],
      ['What unlocks at Level 6?', 'Two extra EQ bands (500Hz and 6K)', 'Accent colors', 'The crown badge', 'Animated gradients', 'Level 6 also adds Symphonic and Basshead Pro presets.'],
      ['What unlocks at Level 28?', 'Slow animated gradient backgrounds', 'A gold badge glow', 'Accent colors', 'The crown', 'Press Play Elite unlocks animated gradients.'],
      ['What happens at Level 45?', 'The badge gets a legendary gold glow', 'A crown is awarded', 'The EQ unlocks', 'Nothing', 'Press Play Legend adds the gold finish.'],
      ['What does Level 60 unlock?', "A crowned badge and the Monarch's Gold background", 'Accent colors', 'Extra EQ bands', 'A platinum badge', 'The crown arrives at 60.'],
      ['What new badge finish arrives at Level 215?', 'Platinum', 'Bronze', 'Gold', 'Rainbow', 'Maestro of Millennia gets platinum.'],
      ['What does the Level 300 badge look like?', 'Star-crowned with a rainbow finish', 'Laurelled bronze', 'Plain', 'Platinum', 'Immortal gets the star crown.'],
      ["Which EQ preset unlocks at Level 140?", "Caesar's Laurel", 'Warm Vinyl', 'Stadium Live', 'Cinematic', 'It comes with a bronze badge finish.'],
      ['Which EQ presets unlock at Level 90?', 'Warm Vinyl and Stadium Live', 'Symphonic and Basshead Pro', 'Cinematic and Crystal Air', 'Titan Bass and Silk Highs', 'Grand Duke of Media adds these two.'],
      ['What is the in-app currency called?', 'Grooves', 'Beats', 'Credits', 'Tokens', 'Grooves are spent in the EXP shop.'],
      ['Where are grooves earned?', 'The disc clicker minigame', 'Playing tracks', 'Making playlists', 'Opening the app daily', 'Generators and clicks in the game produce them.'],
      ['What is the first generator in the disc clicker?', 'Spare Needle', 'Speaker', 'DJ Booth', 'Radio Station', 'The needle is the cheapest generator.'],
      ['What does the "Keep earning grooves in background" setting do?', 'Generators keep earning while the game tab is closed', 'Plays music in the background', 'Earns XP while idle', 'Hides the game', 'It affects groove production only.'],
      ['What does Groove Focus do?', 'Multiplies XP by 3x for 1 hour', 'Multiplies XP by 2x for 1 hour', 'Adds 0.25x permanently', 'Fills 50% of a level', 'It is the shortest and strongest temporary boost.'],
      ['What does Groove Marathon do?', 'Multiplies XP by 1.5x for 24 hours', 'Multiplies XP by 3x for 1 hour', 'Multiplies XP by 2x for 10 hours', 'Adds 0.5x permanently', 'It is the longest, weakest temporary boost.'],
      ['How does the daily streak bonus grow?', 'It compounds each day, up to 5x', 'It adds a flat 5% per day', 'It never grows', 'It resets every day', 'Streak XP is 1.08 to the power of the streak days, capped at 5x.'],
      ['What does Groove Boost do?', 'Fills 50% of the current level bar', 'Fills 70% of the bar', 'Completes the level', 'Doubles XP', 'It has a 45 minute cooldown.'],
      ['What is the cooldown on Instant Level Up?', '4 hours', '45 minutes', '90 minutes', '24 hours', 'It is the only item that guarantees a full level.'],
      ['How much of the level bar does Groove Surge fill?', '70%', '50%', '100%', '25%', 'Its cooldown is 90 minutes.'],
      ['How much does a sprint drain in its first hour?', '10% of its up-front price', '1%', '50%', '100%', 'The drain then grows each hour.'],
      ['How fast does a sprint drain grow?', '40% more each hour', 'It stays flat', 'It doubles each hour', '10% more each hour', 'The growth compounds hourly.'],
      ['When does a sprint end by itself?', 'When grooves hit 0 or 20x its cost has drained', 'After exactly one hour', 'When the app closes', 'When a level up happens', 'Either condition stops it.'],
      ['Which sprint gives the largest multiplier?', 'Red Line Sprint (6x)', 'Overdrive Sprint (4x)', 'Hard Sprint (2.5x)', 'Quick Sprint (1.5x)', 'It is also the most expensive.'],
      ['Can a sprint push XP past the 3x cap?', 'No, the combined total is capped at 3x', 'Yes, sprints are uncapped', 'Only at Lv 300', 'Only for one hour', 'Sprints stack with boosts but share the cap.'],
      ['If a sprint is cancelled, what happens to grooves already drained?', 'They are not refunded', 'They are fully refunded', 'Half are refunded', 'They go to XP', 'Cancelling just stops further drain.'],
      ['What does passing the Playmedia quiz reward?', 'A permanent +1x XP multiplier', '250 grooves', 'An instant level up', 'A new background', 'More than 70% accuracy is needed, once.'],
      ['What is the default shortcut for play/pause?', 'Space', 'Enter', 'P', 'Tab', 'Shortcuts can be remapped in Settings.'],
      ['What does Shift + Right Arrow do by default?', 'Next track', 'Seek +10 s', 'Speed up', 'Fullscreen', 'Shift + Left goes to the previous track.'],
      ['How far does the plain Right Arrow seek by default?', '5 seconds', '10 seconds', '30 seconds', '1 second', 'J and L jump 10 seconds instead.'],
      ['Which key toggles fullscreen by default?', 'F', 'Z', 'M', 'A', 'M is mute, Z is zoom, A is fit.'],
      ['Which keys change playback speed by default?', '[ and ]', '+ and -', 'Up and Down', 'J and L', 'Up and Down change volume.'],
      ['What does Backspace do by default?', 'Resets speed to 1x', 'Deletes the track', 'Goes back a track', 'Mutes', 'It is the speed reset shortcut.'],
      ['Which keys step video frame by frame?', 'Period and comma', 'Brackets', 'Arrow keys', 'J and L', '. steps forward, , steps back.'],
      ['What does ReplayGain do?', 'Levels songs to similar loudness using file tags', 'Repeats a song', 'Boosts bass', 'Rewinds playback', 'Untagged tracks are left alone.'],
      ['Which is NOT applied by ASS subtitle styling?', 'Karaoke effects', 'Colors', 'Bold and italic', 'Fade in/out', 'Karaoke, rotation, drawings and moving text are not applied.'],
      ['What happens if "Remember playback position" is off?', 'Every track starts from the beginning', 'Playback never stops', 'Tracks loop', 'Saved spots are kept', 'It controls resume behavior.'],
      ['What does "Audio lead" do?', 'Plays sound slightly ahead instead of delaying the picture', 'Raises volume', 'Mutes video', 'Adds subtitles', 'The video is never processed, so no frames drop.'],
      ['How much delay does Decode compensation add?', '300 ms', '30 ms', '1 second', '3 seconds', 'It covers browser decoding lag.'],
      ['Which gestures does tap and gesture control support?', 'Tap, double-tap, swipe and long-press', 'Pinch only', 'Shake only', 'Voice commands', 'They work on the video or disc area.'],
      ['What does Simple playlist mode remove?', 'Thumbnails, size, length and multiple playlists', 'Cloud sync', 'Lyrics', 'Online radio', 'It is a settings toggle.'],
      ['Where is every rank and its rewards shown?', 'View rank & rewards in Settings', 'The equalizer', 'The sleep timer', 'The playlist', 'It lists all ranks and what each unlocks.']
    ].map(a => ({ q: a[0], correct: a[1], options: a.slice(1, 5), explain: a[5] }));

    // App & player features (the bulk of each attempt)
    const QUIZ_APP = [
      ['What is the playback speed range?', '0.25x to 4x', '0.5x to 2x', '1x to 10x', '0.1x to 3x', 'The speed slider moves in 0.05 steps.'],
      ['What does the repeat button cycle through?', 'Off, repeat all, repeat one', 'Off and on only', 'Repeat one, shuffle, off', 'Repeat all and shuffle', 'Three states, tapped in turn.'],
      ['Which is a sleep timer option?', 'End of current track', 'End of playlist', 'At sunrise', 'After 3 songs', 'Presets are 15, 30, 45 and 60 minutes plus end of track.'],
      ['Which subtitle formats can be loaded?', '.vtt, .srt, .ass and .ssa', 'Only .srt', '.docx and .pdf', '.mp4 and .mkv', 'Lyrics can also be loaded from .lrc files.'],
      ['How much can subtitle timing be nudged per button?', '0.1 s or 0.5 s earlier or later', '1 s only', '5 s only', 'Not adjustable', 'Four buttons shift the subtitles.'],
      ['What does Trim & export clip do?', 'Cuts a section of the media into a clip', 'Deletes the file', 'Converts to a playlist', 'Mutes the video', 'It lives in the player toolbar.'],
      ['What does "Set loop point A" do?', 'Marks the start of a section to loop', 'Starts the sleep timer', 'Sets the volume to max', 'Adds a bookmark to the cloud', 'It is the start of an A-B loop.'],
      ['What does Picture-in-picture do?', 'Floats the video in a small window', 'Splits the screen in two', 'Mirrors the video', 'Upscales the video', 'It keeps video visible while other apps are in use.'],
      ['What is Batch rename artists for?', 'Changing artist names on many tracks at once', 'Renaming playlists', 'Renaming files on disk', 'Merging albums', 'It is a library tool in the menu.'],
      ['What does the visualizer sensitivity setting change?', 'How strongly the visualizer reacts to sound', 'Its color', 'Its position', 'Its frame rate', 'Higher is more reactive.'],
      ['What does "Web audio: keep sound playing with the screen off" help with?', 'Audio continuing when the screen turns off', 'Saving battery by muting', 'Hiding the player', 'Casting to TVs', 'It is a background playback toggle.'],
      ['How many equalizer bands are there in total once everything is unlocked?', '8', '4', '6', '10', 'Six standard bands plus 500Hz and 6K.'],
      ['Which is a video filter in the app?', 'Auto levels', 'Auto-tune', 'Noise gate', 'Reverb', 'Others include Sharpen, Local contrast and Posterize.'],
      ['What does Auto levels do?', 'Lifts dark scenes and stretches contrast, within limits', 'Normalizes audio', 'Crops black bars', 'Sets volume', 'It samples the picture every half second.'],
      ['What does Posterize do?', 'Reduces the number of colors', 'Adds subtitles', 'Blurs the picture', 'Speeds up the video', 'A hint shows the color level count.'],
      ['What is the latency control for?', 'Syncing picture with audio', 'Faster loading', 'Lowering volume', 'Subtitle size', 'It delays the picture to match late audio.'],
      ['What does "Lighten UI while video plays" reduce?', 'Animated gradients and blur that cause dropped frames', 'Video resolution', 'Volume', 'Subtitle size', 'It can freeze animation or flatten gradients.'],
      ['What does Retro layout turn off?', 'A bottom tab bar and a mini-player', 'A bigger visualizer', 'Dual playlists', 'Cloud sync', 'Retro layout restores the original layout.'],
      ['What does "Keep MP3 conversions on reload" do when on?', 'A video converted to audio-only stays audio-only', 'Saves MP3 files to disk', 'Uploads MP3s', 'Converts all videos', 'Off means it reverts to video on next load.'],
      ['What does "Save progress every" control?', 'How often the current playback spot is saved', 'Autosave of playlists', 'Backup frequency', 'Subtitle refresh', 'It supports Remember playback position.'],
      ['How is the sidebar width changed?', 'Drag the handle on its edge', 'Pinch the playlist', 'Use the volume key', 'It is fixed', 'The handle highlights while dragging.'],
      ['What happens when a custom shortcut clashes with a default?', 'The custom key wins', 'The default wins', 'Both fire', 'Neither works', 'Custom keys add on top of the defaults.'],
      ['How is a custom shortcut cleared while capturing a key?', 'Press Delete', 'Press Escape', 'Press Enter', 'Press Space', 'Escape cancels the capture without changing anything.'],
      ['Is ASS subtitle styling on by default?', 'No, it is an opt-in toggle', 'Yes, always', 'Only for video files', 'Only on mobile', 'Older subtitle files may need reloading after enabling it.'],
      ['What does the Z key do by default?', 'Video zoom', 'Mute', 'Fullscreen', 'Fit', 'A fits the video and M mutes.'],
      ['What do Up and Down arrows do by default?', 'Change volume', 'Change speed', 'Seek 10 seconds', 'Change track', 'Brackets change speed.'],
      ['How long can a crossfade be, relative to the track?', 'At most half the track length', 'Always 10 seconds', 'The full track', 'Any length', 'It is capped at half the duration.'],
      ['What happens to repeat-one with the sleep timer on "end of track"?', 'The track will not loop, so it can end and stop', 'It loops forever', 'It switches to shuffle', 'The timer is ignored', 'This lets the timer actually finish.'],
      ['Which file types can be added to the player?', 'Audio, video, and subtitle or lyric files', 'Only MP3', 'Only video', 'Documents', 'The file picker accepts all of those.'],
      ['What can be set in the Customize appearance menu?', 'Background color, gradient or image', 'Audio codec', 'Keyboard layout', 'Playlist order', 'Unlockable presets appear there too.'],
      ['What does "Simple playlist mode" turn off?', 'Thumbnails, size, length and multiple playlists', 'A debug view', 'A lyrics view', 'A grid of covers', 'It is a toggle in Settings.'],
      ['What does Audio lead do?', 'Plays sound ahead instead of delaying the picture', 'Boosts volume', 'Adds an intro', 'Mutes video', 'Video is untouched, so no frames drop.'],
      ['What does "Tap & gesture controls" cover?', 'Tap, double-tap, swipe and long-press on the video area', 'Voice commands', 'Shaking the phone', 'Mouse wheel only', 'It can be switched off in Settings.'],
      ['What does ReplayGain rely on?', 'Loudness tags stored in the file', 'The internet', 'The equalizer', 'Playlist order', 'Untagged tracks are left alone.'],
      ['Which key jumps back 10 seconds by default?', 'J', 'L', 'K', 'H', 'L jumps forward 10 seconds.']
    ].map(a => ({ q: a[0], correct: a[1], options: a.slice(1, 5), explain: a[5] }));

    window.__ppQuizBank = { xp: QUIZ_BANK, app: QUIZ_APP };   // reused by The Marathon

    function buildQuizModal(){
      const overlay = document.createElement('div');
      overlay.id = 'ppxp-quiz-modal-overlay';
      overlay.innerHTML = `
        <div id="ppxp-quiz-modal">
          <div id="ppxp-quiz-modal-header">
            <h2>Playmedia quiz</h2>
            <p>${QUIZ_LEN} random questions from a bank of ${QUIZ_BANK.length + QUIZ_APP.length}, mostly about the app itself. Score over ${Math.round(QUIZ_PASS * 100)}% to earn a permanent +${QUIZ_BONUS}x XP multiplier (one time).</p>
          </div>
          <div id="ppxp-quiz-modal-body"></div>
          <div id="ppxp-quiz-modal-footer">
            <button class="sort-footer-btn" id="ppxp-quiz-modal-close">Close</button>
          </div>
        </div>
      `;
      document.body.appendChild(overlay);
      const body = overlay.querySelector('#ppxp-quiz-modal-body');
      overlay.querySelector('#ppxp-quiz-modal-close').addEventListener('click', close);
      overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });

      let set = [], qIndex = 0, correctCount = 0, answered = false, missed = [];
      const needed = Math.floor(QUIZ_LEN * QUIZ_PASS) + 1;   // strictly more than 70%

      const ls = {
        get: k => { try { return localStorage.getItem(k); } catch(e){ return null; } },
        set: (k, v) => { try { localStorage.setItem(k, v); } catch(e){} }
      };
      const alreadyClaimed = () => !!state.quizBonusClaimed || !!ls.get(QUIZ_FLAG);
      function shuffle(a){
        a = a.slice();
        for (let i = a.length - 1; i > 0; i--){ const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
        return a;
      }
      function newAttempt(){
        set = shuffle(shuffle(QUIZ_BANK).slice(0, QUIZ_XP_COUNT).concat(shuffle(QUIZ_APP).slice(0, QUIZ_LEN - QUIZ_XP_COUNT))).map(it => ({ q: it.q, correct: it.correct, explain: it.explain, options: shuffle(it.options) }));
        qIndex = 0; correctCount = 0; missed = [];
      }
      function el(tag, cls, text){
        const e = document.createElement(tag);
        if (cls) e.className = cls;
        if (text != null) e.textContent = text;
        return e;
      }

      function renderQuestion(){
        answered = false;
        const item = set[qIndex];
        body.innerHTML = '';
        body.appendChild(el('div', 'ppxp-quiz-progress', `Question ${qIndex + 1} of ${set.length}  ·  ${correctCount} correct so far`));
        body.appendChild(el('div', 'ppxp-quiz-question', item.q));
        const optionsEl = el('div');
        body.appendChild(optionsEl);
        item.options.forEach(opt => {
          const btn = el('button', 'ppxp-quiz-option', opt);
          btn.type = 'button';
          btn.addEventListener('click', () => {
            if (answered) return;
            answered = true;
            const buttons = optionsEl.querySelectorAll('.ppxp-quiz-option');
            buttons.forEach(b => { b.disabled = true; if (b.textContent === item.correct) b.classList.add('correct'); });
            if (opt === item.correct) correctCount++;
            else { btn.classList.add('incorrect'); missed.push(item); }
            optionsEl.appendChild(el('div', 'ppxp-quiz-explain', item.explain));
            const nextBtn = el('button', 'ppxp-quiz-next-btn', qIndex + 1 < set.length ? 'Next question' : 'See results');
            nextBtn.type = 'button';
            nextBtn.addEventListener('click', () => {
              qIndex++;
              if (qIndex < set.length) renderQuestion(); else renderResult();
            });
            body.appendChild(nextBtn);
          });
          optionsEl.appendChild(btn);
        });
      }

      function renderResult(){
        const total = set.length;
        const acc = correctCount / total;
        const passed = acc > QUIZ_PASS;
        const best = Math.max(parseInt(ls.get(QUIZ_BEST) || '0', 10) || 0, Math.round(acc * 100));
        ls.set(QUIZ_BEST, String(best));
        let rewardLine;
        if (!passed){
          rewardLine = alreadyClaimed()
            ? `Not a pass this time (${needed}/${total} needed), but the +${QUIZ_BONUS}x bonus is already earned.`
            : `More than ${Math.round(QUIZ_PASS * 100)}% (${needed}/${total} or better) is needed to earn the bonus. Try again!`;
        } else if (alreadyClaimed()){
          rewardLine = `Passed! The permanent +${QUIZ_BONUS}x bonus is already claimed.`;
        } else {
          state.expMods.permanentMult = (state.expMods.permanentMult || 1) + QUIZ_BONUS;
          state.quizBonusClaimed = true;
          ls.set(QUIZ_FLAG, '1');
          markDirty(); saveState();
          rewardLine = `Passed! Permanent +${QUIZ_BONUS}x XP multiplier unlocked (total is still capped at ${expMultiplierCap()}x).`;
          if (typeof showToast === 'function') showToast(`Quiz passed. Permanent +${QUIZ_BONUS}x XP multiplier!`);
        }
        body.innerHTML = '';
        const res = el('div', 'ppxp-quiz-result');
        res.appendChild(el('div', 'ppxp-quiz-result-score', `${correctCount} / ${total} correct (${Math.round(acc * 100)}%)`));
        res.appendChild(el('div', 'ppxp-quiz-result-sub', rewardLine));
        res.appendChild(el('div', 'ppxp-quiz-result-sub', `Best accuracy: ${best}%. The bonus can only be earned once; retakes use a fresh random set.`));
        body.appendChild(res);
        if (missed.length){
          body.appendChild(el('div', 'ppxp-quiz-progress', 'Review the misses:'));
          missed.forEach(m => {
            body.appendChild(el('div', 'ppxp-quiz-question', m.q));
            body.appendChild(el('div', 'ppxp-quiz-explain', `Answer: ${m.correct}. ${m.explain}`));
          });
        }
        const retake = el('button', 'ppxp-quiz-next-btn', 'Retake quiz');
        retake.type = 'button';
        retake.addEventListener('click', () => { newAttempt(); renderQuestion(); });
        body.appendChild(retake);
      }

      function open(){ newAttempt(); renderQuestion(); overlay.classList.add('open'); }
      function close(){ overlay.classList.remove('open'); }
      return { open };
    }

    function setupQuizEntry(){
      const settingsPaneEl = document.getElementById('sidebar-pane-settings');
      if (!settingsPaneEl || document.getElementById('ppxp-quiz-entry-section')) return;
      const modal = buildQuizModal();
      const section = document.createElement('div');
      section.className = 'settings-section';
      section.id = 'ppxp-quiz-entry-section';
      section.innerHTML = `
        <div class="settings-row" id="ppxp-quiz-open-row">
          <div class="settings-row-text">
            <div class="settings-row-title">Playmedia quiz</div>
            <div class="settings-row-sub">Optional. Score over 70% on a random set of questions for a permanent +1x XP multiplier.</div>
          </div>
        </div>
      `;
      settingsPaneEl.appendChild(section);
      section.querySelector('#ppxp-quiz-open-row').addEventListener('click', modal.open);
    }

    function setupRankEntry(){
      const settingsPaneEl = document.getElementById('sidebar-pane-settings');
      if (!settingsPaneEl || document.getElementById('ppxp-rank-entry-section')) return;
      const modal = buildRankModal();
      const section = document.createElement('div');
      section.className = 'settings-section';
      section.id = 'ppxp-rank-entry-section';
      section.innerHTML = `
        <div class="settings-row" id="ppxp-view-rank-row">
          <div class="settings-row-text">
            <div class="settings-row-title">View rank &amp; rewards</div>
            <div class="settings-row-sub">See every rank and what leveling up unlocks.</div>
          </div>
        </div>
      `;
      settingsPaneEl.appendChild(section);
      section.querySelector('#ppxp-view-rank-row').addEventListener('click', modal.open);
    }

    loadState();
    renderBadge(0, false);
    restoreAccentColorOnLoad();
    setupBgPresets();
    setupEqPro();
    setupEqCustom();
    setupQuickSpeed();
    setupQuickBoost();
    setupJump();
    setupSkip();
    setupPerksSection();
    setupExpShopEntry();
    setupRankEntry();
    setupQuizEntry();
    refreshAllUnlockUI();

    // The Customize modal's tabs are built well before this block runs, so
    // a plain click listener (added on top of whatever's already wired to
    // these buttons) is enough to keep the preset grid in sync whenever the
    // active tab changes.
    document.querySelectorAll('.customize-tab').forEach(tab => {
      tab.addEventListener('click', refreshBgPresetLocks);
    });
  })();
