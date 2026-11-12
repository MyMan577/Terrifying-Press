      // ---------- Extended stats ----------
      const x = state.x, pl = (n, w) => n + ' ' + w + (n === 1 ? '' : 's');
      const add = (top, icon, text) => parts.push(bannerHtml(seed++, top, centerHtml({ artUrl: null, fallbackIcon: icon }), text));
      const sum = a => a.reduce((p, c) => p + c, 0);
      const hr = h => (h % 12 || 12) + (h < 12 ? ' AM' : ' PM');
      const days = Object.keys(x.dayMs).filter(k => x.dayMs[k] > 0);
      const none = 'Nothing recorded yet. Keep listening and check back.';
      add('SESSIONS', ICON.clock, x.sessions
        ? pl(x.sessions, 'session') + ' so far. The longest lasted ' + formatDuration(x.longestSessionMs) + ', and a typical one runs about ' + formatDuration(state.totalAppMs / x.sessions) + '.' : none);
      add('OPEN COUNT', ICON.calendar, 'Press Play Media has been opened ' + pl(x.launches, 'time') + ' across ' + pl(days.length, 'listening day') + '.');
      // Streaks (consecutive calendar days with listening)
      const dayNums = days.map(k => { const p = k.split('-'); return Math.round(Date.UTC(+p[0], +p[1] - 1, +p[2]) / 864e5); }).sort((a, b) => a - b);
      let best = 0, run = 0, prev = null;
      dayNums.forEach(n => { run = (prev !== null && n - prev === 1) ? run + 1 : 1; best = Math.max(best, run); prev = n; });
      const t0 = new Date(), today = Math.round(Date.UTC(t0.getFullYear(), t0.getMonth(), t0.getDate()) / 864e5);
      let cur = 0; if (prev !== null && today - prev <= 1) cur = run;
      add('STREAKS', ICON.trophy, dayNums.length ? 'Current streak: ' + pl(cur, 'day') + '. Longest: ' + pl(best, 'day') + '.' : none);
      const peak = x.hourMs.indexOf(Math.max.apply(null, x.hourMs));
      add('PEAK HOUR', ICON.clock, sum(x.hourMs) ? 'Peak listening is around ' + hr(peak) + ', with ' + formatDuration(x.hourMs[peak]) + ' logged in that hour.' : none);
      add('NIGHT OWL', ICON.disc, x.nightPlays ? pl(x.nightPlays, 'track') + ' started between midnight and 5 AM.' : 'No tracks started in the small hours. Early bird, then.');
      let bd = null; days.forEach(k => { if (!bd || x.dayMs[k] > x.dayMs[bd]) bd = k; });
      add('BUSIEST DAY', ICON.calendar, bd ? 'The biggest day was ' + formatDate(new Date(bd.split('-')[0], bd.split('-')[1] - 1, bd.split('-')[2]).getTime()) + ' with ' + formatDuration(x.dayMs[bd]) + ' of playback.' : none);
      const names = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
      const wd = x.weekdayMs.indexOf(Math.max.apply(null, x.weekdayMs)), wk = sum(x.weekdayMs);
      add('FAVORITE DAY', ICON.calendar, wk ? names[wd] + ' is the favorite day: ' + Math.round(x.weekdayMs[wd] / wk * 100) + '% of all listening.' : none);
      const wkend = x.weekdayMs[0] + x.weekdayMs[6];
      add('WEEKEND VS WEEKDAY', ICON.sliders, wk ? Math.round(wkend / wk * 100) + '% of listening happens on weekends, ' + Math.round(100 - wkend / wk * 100) + '% on weekdays.' : none);
      add('DAILY AVERAGE', ICON.headphones, days.length ? 'On listening days, the average is ' + formatDuration(state.totalListenMs / days.length) + '.' : none);
      const topArt = topEntry(x.artistPlays), topArtMs = topByField(Object.keys(x.artistMs).reduce((o, k) => { o[k] = { v: x.artistMs[k] }; return o; }, {}), 'v');
      add('TOP ARTIST', ICON.disc, topArt ? topArt.key + ' leads with ' + pl(topArt.value, 'play') + (topArtMs ? ' and is the most listened to at ' + formatDuration(x.artistMs[topArtMs.key]) + '.' : '.') : none);
      add('VARIETY', ICON.sliders, Object.keys(state.trackPlays).length ? pl(Object.keys(state.trackPlays).length, 'different track') + ' played, by ' + pl(Object.keys(x.artistPlays).length, 'artist') + '.' : none);
      add('FINISHER', ICON.trophy, x.completions ? pl(x.completions, 'track') + ' played to the very end' + (totalPlays ? ' (' + Math.min(100, Math.round(x.completions / totalPlays * 100)) + '% of everything started).' : '.') : none);
      add('SKIPPER', ICON.gear, pl(x.skips, 'track') + ' skipped within 30 seconds of starting.');
      add('ON REPEAT', ICON.disc, x.bestRepeat > 1 ? 'The longest repeat streak is ' + x.bestRepeat + ' plays of the same track in a row.' : 'No track has been played twice in a row yet.');
      add('SEEKER', ICON.sliders, 'Jumped around inside tracks ' + pl(x.seeks, 'time') + '.');
      add('SPEED', ICON.sliders, (x.speedUpMs || x.slowMs) ? 'Listened ' + formatDuration(x.speedUpMs) + ' faster than normal and ' + formatDuration(x.slowMs) + ' slower, with speed changed ' + pl(x.rateChanges, 'time') + '.' : 'Everything has played at normal speed so far.');
      const topBtn = topEntry(x.buttons);
      add('FAVORITE CONTROL', ICON.gear, topBtn ? 'The "' + topBtn.key + '" button is the most pressed, ' + pl(topBtn.value, 'time') + '.' : 'No control buttons pressed yet.');
      const topKey = topEntry(x.keys);
      add('KEYBOARD', ICON.gear, topKey ? 'Pressed ' + pl(sum(Object.keys(x.keys).map(k => x.keys[k])), 'key') + ', favoring "' + topKey.key + '" (' + topKey.value + ').' : 'No keyboard shortcuts used yet.');
      add('BIG SCREEN', ICON.film, pl(x.fsCount, 'time') + ' in fullscreen and ' + pl(x.pipCount, 'time') + ' in picture-in-picture.');
      add('LIBRARY GROWTH', ICON.film, pl(x.filesAdded, 'file') + ' added and ' + pl(x.subsLoaded, 'subtitle file') + ' loaded since tracking began.');
      const longest = topByField(state.trackPlays, 'totalMs');
      add('LONGEST LISTEN', ICON.headphones, longest ? (longest.value.title || 'Untitled') + ' has taken ' + formatDuration(longest.value.totalMs) + ' of listening time.' : none);
      const ofKind = k => { const o = {}; Object.keys(state.trackPlays).forEach(i => { if (state.trackPlays[i].kind === k) o[i] = state.trackPlays[i]; }); return topEntry(o); };
      const tv = ofKind('video'), ta = ofKind('audio');
      add('VIDEO AND AUDIO PICKS', ICON.film, (ta ? 'Top audio: ' + (ta.value.title || 'Untitled') + '. ' : '') + (tv ? 'Top video: ' + (tv.value.title || 'Untitled') + '.' : '') || none);
      let bestQ = null; try { bestQ = localStorage.getItem('ppxpQuizBestV2'); } catch(e){}
      const gr = window.PPXpGrooves ? window.PPXpGrooves.getGrooves() : null;
      add('SIDE QUESTS', ICON.trophy, (gr !== null ? 'Grooves held: ' + window.PPXpGrooves.formatNum(gr) + '. ' : '') + (bestQ ? 'Best quiz score: ' + bestQ + '%.' : 'Quiz not taken yet.'));

      // Member since
      parts.push(bannerHtml(seed++, 'MEMBER SINCE',
        centerHtml({ artUrl: null, fallbackIcon: ICON.calendar }),
        'First opened on ' + formatDate(state.firstOpened) + '.'));

      return parts.join('');
    }

    // ---------- DOM ----------
    const widget = document.createElement('div');
    widget.id = 'ppp-widget';
    widget.innerHTML = `
      <style>
        #ppp-overlay{
          position:fixed; inset:0; z-index:9999; display:none;
          background:#0a0a0c;
        }
        #ppp-overlay.open{ display:block; }
        #ppp-close{
          position:fixed; top:16px; right:16px; z-index:10000;
          width:36px; height:36px; border-radius:50%;
          background:rgba(255,255,255,0.08); border:none; color:#eee;
          display:flex; align-items:center; justify-content:center; cursor:pointer;
        }
        #ppp-close svg{ width:16px; height:16px; }
        #ppp-close:hover{ background:rgba(255,255,255,0.16); }
        #ppp-scroll{
          height:100%; width:100%; overflow-y:auto;
          scroll-snap-type:y mandatory; -webkit-overflow-scrolling:touch;
        }
        #ppp-scroll::-webkit-scrollbar{ display:none; }
        .ppp-banner{
          position:relative; overflow:hidden;
          height:100%; width:100%; min-height:100%;
          scroll-snap-align:start;
          display:flex; flex-direction:column; align-items:center; justify-content:space-between;
          padding:70px 30px 80px;
          background:linear-gradient(160deg, #131316 0%, #2b2c30 55%, #16171a 100%);
          opacity:0; transition:opacity .5s ease;
          box-sizing:border-box;
        }
        .ppp-banner.visible{ opacity:1; }
        .ppp-bubble{
          position:absolute; border-radius:50%;
          background:rgba(255,255,255,0.05);
          transform:translate(-50%,-50%);
          pointer-events:none;
        }
        .ppp-top-text{
          font-size:12px; letter-spacing:2.5px; text-transform:uppercase;
          color:#9a9aa1; text-align:center; z-index:1; font-weight:600;
        }
        .ppp-center{
          width:180px; height:180px; border-radius:26px;
          background:rgba(255,255,255,0.07);
          display:flex; align-items:center; justify-content:center;
          overflow:hidden; z-index:1;
          box-shadow:0 10px 30px rgba(0,0,0,0.45);
        }
        .ppp-center img{ width:100%; height:100%; object-fit:cover; }
        .ppp-center-fallback{ display:flex; align-items:center; justify-content:center; width:100%; height:100%; }
        .ppp-center-fallback svg{ width:60px; height:60px; color:#cfcfd4; opacity:.85; }
        .ppp-bottom-text{
          font-size:17px; line-height:1.55; color:#f0f0f1;
          text-align:center; max-width:360px; z-index:1;
          font-weight:500;
        }
        #ppp-progress{
          position:fixed; top:16px; left:16px; right:64px; z-index:10000;
          display:flex; gap:5px;
        }
        #ppp-progress div{
          flex:1; height:3px; border-radius:2px; background:rgba(255,255,255,0.18);
        }
        #ppp-progress div.done{ background:rgba(255,255,255,0.65); }
      </style>
      <div id="ppp-overlay">
        <div id="ppp-progress"></div>
        <button id="ppp-close" type="button" aria-label="Close">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M5 5l14 14M19 5 5 19"/></svg>
        </button>
        <div id="ppp-scroll"></div>
      </div>
    `;
    document.body.appendChild(widget);

    const overlay = widget.querySelector('#ppp-overlay');
    const scrollEl = widget.querySelector('#ppp-scroll');
    const closeBtn = widget.querySelector('#ppp-close');
    const progressEl = widget.querySelector('#ppp-progress');
    let observer = null;

    function open(){
      scrollEl.innerHTML = buildBanners();
      scrollEl.scrollTop = 0;
      const banners = scrollEl.querySelectorAll('.ppp-banner');
      progressEl.innerHTML = Array.from(banners).map(() => '<div></div>').join('');
      const progressDots = progressEl.querySelectorAll('div');
      if (observer) observer.disconnect();
      observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
          entry.target.classList.toggle('visible', entry.isIntersecting);
          if (entry.isIntersecting){
            const idx = Array.from(banners).indexOf(entry.target);
            progressDots.forEach((d, i) => d.classList.toggle('done', i <= idx));
          }
        });
      }, { root: scrollEl, threshold: 0.55 });
      banners.forEach(b => observer.observe(b));
      overlay.classList.add('open');
    }
    function close(){
      overlay.classList.remove('open');
      if (observer) observer.disconnect();
    }
    closeBtn.addEventListener('click', close);
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && overlay.classList.contains('open')) close();
    });

    // ---------- Settings entry point ----------
    // Deliberately a single unlabeled line, no description text, so it
    // reads as an invitation rather than another settings toggle.
    if (settingsPane){
      const entrySection = document.createElement('div');
      entrySection.className = 'settings-section';
      entrySection.id = 'ppp-entry-section';
      entrySection.innerHTML = `
        <div class="settings-row" id="ppp-entry-row" style="cursor:pointer;">
          <div class="settings-row-text">
            <div class="settings-row-title">View adventures with Press Play Media</div>
          </div>
        </div>
      `;
      settingsPane.appendChild(entrySection);
      entrySection.querySelector('#ppp-entry-row').addEventListener('click', open);
    }
  })();

  /* =====================================================================
     Press Play XP. Self-contained, its own storage key, own class/id
     namespace (ppxp-*). Earns XP only when a track plays through to a
     natural completion (the 'ended' event) with no seeking or skipping
     used on it, and only if that track is at least 1:30 long, so skipping around or short clips don't farm XP.
     Uses the same dirty-flag + idle-callback flush pattern as the
     Portfolio feature, so XP gains never trigger a synchronous
     localStorage write in the middle of playback.
  ===================================================================== */
  (function(){
    const SAVE_KEY = 'ppXpSaveV1';
    const MIN_DURATION_SEC = 90; // 1:30
    const XP_PER_MINUTE = 30; // tripled from 10 so leveling feels fast
    // One-time migration: every save gets bumped to exactly Level 60 a
    // single time (to line everyone up after the level cap was raised),
    // gated by this flag so it never re-fires on later loads.
    const LEVEL60_RESET_FLAG = 'ppXpLevel60ResetV1';
    // One-time: levels 300+ got more expensive. Saves already past 300 keep
    // their level (and bar at 0%) instead of being knocked back.
    const ENDGAME_REBALANCE_FLAG = 'ppXpEndgameRebalanceV1';

    let state = {
      xp: 0,
      expMods: { permanentMult: 1, tempMult: 1, tempEndsAt: 0 },
      instantCooldowns: {},
      // Sprint upgrades: a big multiplier that starts draining grooves
      // every hour it's active, at an accelerating (compounding) rate
      // based on how much it originally cost. The drain keeps going, hour
      // after hour, until either the player's grooves hit 0 (sprint ends)
      // or the total drained reaches 20x the sprint's up-front cost
      // (sprint ends on its own). Only one sprint can be active at a time;
      // it can be cancelled early, which just stops the drain (no refund
      // of what's already been taken).
      sprint: { activeId: null, initialCost: 0, mult: 1, startedAt: 0, hoursProcessed: 0, totalDrained: 0 },
      quizBonusClaimed: false,
      xpPending: 0,      // fractional XP carried between awards
      // Consistency: daily listening streak. lastDay is a local day number.
      streak: { count: 0, lastDay: 0, bonusDay: 0, best: 0 }
    };

    function loadState(){
      try {
        const saved = JSON.parse(localStorage.getItem(SAVE_KEY));
        if (saved && typeof saved.xp === 'number') state.xp = saved.xp;
        if (saved && saved.expMods && typeof saved.expMods === 'object'){
          if (typeof saved.expMods.permanentMult === 'number') state.expMods.permanentMult = saved.expMods.permanentMult;
          if (typeof saved.expMods.tempMult === 'number') state.expMods.tempMult = saved.expMods.tempMult;
          if (typeof saved.expMods.tempEndsAt === 'number') state.expMods.tempEndsAt = saved.expMods.tempEndsAt;
        }
        if (saved && saved.quizBonusClaimed === true) state.quizBonusClaimed = true;
        if (saved && saved.streak && typeof saved.streak === 'object'){
          ['count','lastDay','bonusDay','best'].forEach(k => { if (typeof saved.streak[k] === 'number') state.streak[k] = saved.streak[k]; });
        }
        if (saved && typeof saved.xpPending === 'number') state.xpPending = saved.xpPending;
        if (saved && saved.instantCooldowns && typeof saved.instantCooldowns === 'object'){
          state.instantCooldowns = saved.instantCooldowns;
        }
        if (saved && saved.sprint && typeof saved.sprint === 'object'){
          if (typeof saved.sprint.activeId === 'string' || saved.sprint.activeId === null) state.sprint.activeId = saved.sprint.activeId;
          if (typeof saved.sprint.initialCost === 'number') state.sprint.initialCost = saved.sprint.initialCost;
          if (typeof saved.sprint.mult === 'number') state.sprint.mult = saved.sprint.mult;
          if (typeof saved.sprint.startedAt === 'number') state.sprint.startedAt = saved.sprint.startedAt;
          if (typeof saved.sprint.hoursProcessed === 'number') state.sprint.hoursProcessed = saved.sprint.hoursProcessed;
          if (typeof saved.sprint.totalDrained === 'number') state.sprint.totalDrained = saved.sprint.totalDrained;
        }
      } catch(e){ /* ignore */ }
      // Shop permanents were removed; the only permanent multiplier left is the one-time quiz bonus.
      state.expMods.permanentMult = state.quizBonusClaimed ? 2 : 1; // 1 + the quiz's +1x
      applyOneTimeLevel60Reset();
      applyEndgameRebalance();
    }
    function applyEndgameRebalance(){
      try {
        if (localStorage.getItem(ENDGAME_REBALANCE_FLAG)) return;
        // Level under the OLD curve (top cost 420).
        const OLD_TOP = 420;
        const oldNeed = (lv) => {
          if (lv < 300) return xpNeededForLevel(lv);
          const step = (OLD_TOP - LEVEL_XP_FINAL) / (LEVEL_CAP - 1 - (MID_CAP - 1));
          return Math.round(LEVEL_XP_FINAL + (Math.min(lv, LEVEL_CAP - 1) - (MID_CAP - 1)) * step);
        };
        let lvl = 1, rem = state.xp;
        while (lvl < LEVEL_CAP && rem >= oldNeed(lvl)){ rem -= oldNeed(lvl); lvl++; }
        if (lvl >= 300){
          let keep = Math.round(rem / oldNeed(lvl) * xpNeededForLevel(lvl)); // same % into the level
          state.xp = xpForLevelStart(lvl) + keep;
          saveState();
        }
        localStorage.setItem(ENDGAME_REBALANCE_FLAG, '1');
      } catch(e){ /* ignore */ }
    }

    // Sets XP to exactly the start of `level` (0% into that level's bar).
    function xpForLevelStart(level){
      let sum = 0;
      for (let l = 1; l < level; l++) sum += xpNeededForLevel(l);
      return sum;
    }
    function applyOneTimeLevel60Reset(){
      try {
        if (localStorage.getItem(LEVEL60_RESET_FLAG)) return;
        if (levelInfo(state.xp).level > 60) state.xp = xpForLevelStart(60);
        localStorage.setItem(LEVEL60_RESET_FLAG, '1');
        saveState();
      } catch(e){ /* ignore */ }
    }
    function saveState(){
      try { localStorage.setItem(SAVE_KEY, JSON.stringify(state)); } catch(e){ /* storage full */ }
      dirty = false;
    }
    let dirty = false;
    function markDirty(){ dirty = true; }
    function scheduleFlush(){
      if (!dirty) return;
      const flush = () => { if (dirty) saveState(); };
      if (typeof requestIdleCallback === 'function') requestIdleCallback(flush, { timeout: 2000 });
      else setTimeout(flush, 0);
    }
    setInterval(scheduleFlush, 5000);
    window.addEventListener('beforeunload', () => { if (dirty && !window.__ppSkipUnloadSave) saveState(); });

    // ---------- Leveling curve ----------
    // Grows in a straight line from level 1 to level 160, then continues more gently to level 300,
    // and then more gently still up to the level cap (500). Costs for levels 1-299 are unchanged
    // from before, so nobody's existing level moves. Tuned
    // so the total XP from level 1 to 160 comes out to roughly 700 average
    // tracks (~30 XP each at a ~3 minute track and XP_PER_MINUTE = 10).
    const LEGACY_CAP = 160;      // the original curve is untouched up to here
    const MID_CAP = 300;         // end of the second segment (the previous level cap)
    const LEVEL_CAP = 500;       // new level cap
    const LEVEL_XP_START = 60;   // cost of level 1
    const LEVEL_XP_END = 205;    // cost of the last level before the legacy cap
    const LEVEL_XP_FINAL = 300;  // cost of the last level before level 300
    const LEVEL_XP_TOP = 2500;   // cost of the last level before the cap (was 420; raised so the endgame stays a real commitment)
    function xpNeededForLevel(level){
      if (level < LEGACY_CAP){
        const step = (LEVEL_XP_END - LEVEL_XP_START) / (LEGACY_CAP - 2);
        const l = Math.min(level, LEGACY_CAP - 1);
        return Math.round(LEVEL_XP_START + (l - 1) * step);
      }
      if (level < MID_CAP){
        // Levels 160-299 keep climbing gently from 205 XP to 300 XP per level.
        const step = (LEVEL_XP_FINAL - LEVEL_XP_END) / (MID_CAP - 1 - (LEGACY_CAP - 1));
        return Math.round(LEVEL_XP_END + (level - (LEGACY_CAP - 1)) * step);
      }
      // Levels 300-499 climb from 300 XP up to LEVEL_XP_TOP per level.
      const step = (LEVEL_XP_TOP - LEVEL_XP_FINAL) / (LEVEL_CAP - 1 - (MID_CAP - 1));
      const l = Math.min(level, LEVEL_CAP - 1);
      return Math.round(LEVEL_XP_FINAL + (l - (MID_CAP - 1)) * step);
    }
    function levelInfo(totalXp){
      let level = 1, remaining = totalXp, needed = xpNeededForLevel(level);
      while (remaining >= needed){
        remaining -= needed;
        level++;
        needed = xpNeededForLevel(level);
      }
      return { level, xpIntoLevel: remaining, xpForNext: needed };
    }

