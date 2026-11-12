    // ---------- Game loop ----------
    const TICK_MS = 200;
    setInterval(() => {
      if (!shouldRunGameLoop()) return; // panel closed (or tab backgrounded) and background earning is off - nothing to update
      const ps = totalPs();
      if (ps > 0){
        state.grooves += ps * (TICK_MS/1000);
        renderStats();
        // Refresh shop affordability periodically without full re-render churn.
        renderShop();
      }
    }, TICK_MS);

    setInterval(saveState, 5000);
    // Restoring a progress/settings backup writes the new save straight to
    // localStorage and then reloads the page - which fires this same
    // beforeunload handler in between, and it would happily overwrite that
    // freshly-restored value with whatever's still sitting in memory from
    // before the restore. window.__ppSkipUnloadSave is set right before
    // that reload specifically to stop this from clobbering it.
    window.addEventListener('beforeunload', () => { if (!window.__ppSkipUnloadSave) saveState(); });

    loadState();
    renderAll();

    // Expose the grooves currency to other modules (the EXP shop lives in
    // a separate closure and has no other way to read or spend it). Spends
    // always go through this function so the balance check and the
    // deduction happen together and this widget's own UI stays in sync.
    window.PPXpGrooves = {
      getGrooves: () => state.grooves,
      spendGrooves: (amount) => {
        if (typeof amount !== 'number' || amount <= 0 || state.grooves < amount) return false;
        state.grooves -= amount;
        saveState();
        renderAll();
        return true;
      },
      // Unlike spendGrooves, this never fails for insufficient funds - it
      // just takes whatever is left (clamped at 0) and reports back how
      // much was actually taken. Used by the sprint-upgrade drain,
      // which needs to be able to bottom the player out at zero grooves
      // rather than block on an affordability check.
      forceDeductGrooves: (amount) => {
        if (typeof amount !== 'number' || amount <= 0) return 0;
        const taken = Math.min(amount, state.grooves);
        state.grooves -= taken;
        saveState();
        renderAll();
        return taken;
      },
      // Small, deliberately modest one-off rewards (e.g. the optional
      // Playmedia quiz) go through here rather than touching state.grooves
      // directly, so every credit to the balance is saved and re-rendered
      // the same way.
      addGrooves: (amount) => {
        if (typeof amount !== 'number' || amount <= 0) return false;
        state.grooves += amount;
        saveState();
        renderAll();
        return true;
      },
      formatNum
    };
  })();

  /* =====================================================================
     Press Play Portfolio, a Wrapped-style retrospective. Self-contained,
     its own storage key, own class/id namespace (ppp-*). Reads real usage
     signals fed in from the player via window.PPPortfolioApi and
     window.PPGetTrackByDbId, which the main player code calls into; it
     never reaches into player state directly.
  ===================================================================== */
  (function(){
    const SAVE_KEY = 'pppSaveV1';

    let state = {
      firstOpened: null,
      totalAppMs: 0,
      totalListenMs: 0,
      totalAudioMs: 0,
      totalVideoMs: 0,
      totalBackgroundMs: 0,
      trackPlays: {},     // dbId -> { count, totalMs, backgroundMs, title, artist, kind, artUrl, lastPlayed }
      settingsUsage: {},  // label -> count
      filterUsage: {},    // filter name -> count
      x: null             // extended stats, see newX()
    };
    function newX(){
      return { launches: 0, sessions: 0, longestSessionMs: 0, hourMs: new Array(24).fill(0), weekdayMs: new Array(7).fill(0),
        dayMs: {}, artistPlays: {}, artistMs: {}, completions: 0, skips: 0, seeks: 0, speedUpMs: 0, slowMs: 0, rateChanges: 0,
        buttons: {}, keys: {}, filesAdded: 0, subsLoaded: 0, bestRepeat: 0, nightPlays: 0, fsCount: 0, pipCount: 0 };
    }
    // Transient (not saved) tracking for sessions, skips and repeat runs.
    const live = { trackStart: 0, lastActive: 0, sessionMs: 0, curTrack: null, curListenMs: 0, curEnded: false, repeatRun: 0, lastInput: 0 };

    function loadState(){
      try {
        const saved = JSON.parse(localStorage.getItem(SAVE_KEY));
        if (saved && typeof saved === 'object'){
          state.firstOpened = saved.firstOpened || null;
          state.totalAppMs = typeof saved.totalAppMs === 'number' ? saved.totalAppMs : 0;
          state.totalListenMs = typeof saved.totalListenMs === 'number' ? saved.totalListenMs : 0;
          state.totalAudioMs = typeof saved.totalAudioMs === 'number' ? saved.totalAudioMs : 0;
          state.totalVideoMs = typeof saved.totalVideoMs === 'number' ? saved.totalVideoMs : 0;
          state.totalBackgroundMs = typeof saved.totalBackgroundMs === 'number' ? saved.totalBackgroundMs : 0;
          state.trackPlays = saved.trackPlays || {};
          state.settingsUsage = saved.settingsUsage || {};
          state.filterUsage = saved.filterUsage || {};
          state.x = Object.assign(newX(), saved.x || {});
        }
      } catch(e){ /* ignore */ }
      if (!state.x) state.x = newX();
      state.x.launches += 1;
      if (!state.firstOpened) state.firstOpened = Date.now();
    }
    function saveState(){
      try { localStorage.setItem(SAVE_KEY, JSON.stringify(state)); } catch(e){ /* storage full */ }
      dirty = false;
    }
    // Every recorder below used to call saveState() straight away, which
    // means a JSON.stringify + synchronous localStorage write landed right
    // at track-start (recordTrackPlay fires just before media().play()) or
    // mid-toggle. On some browsers that write is slow enough to stall the
    // main thread for a tick, and the audio graph in this app runs through
    // ScriptProcessor/AnalyserNode stages that are sensitive to exactly
    // that kind of stall - which is what shows up as crackling. So writes
    // are now just flagged as dirty here and actually flushed on a timer,
    // off the call stack that triggered them.
    let dirty = false;
    function markDirty(){ dirty = true; }
    function scheduleFlush(){
      if (!dirty) return;
      const flush = () => { if (dirty) saveState(); };
      if (typeof requestIdleCallback === 'function') requestIdleCallback(flush, { timeout: 2000 });
      else setTimeout(flush, 0);
    }

    // ---------- Public API used by the player ----------
    function recordTrackPlay(t){
      if (!t || !t.dbId) return;
      const entry = state.trackPlays[t.dbId] || { count: 0, totalMs: 0 };
      entry.count += 1;
      entry.title = t.title;
      entry.artist = t.artist;
      entry.kind = t.kind;
      entry.artUrl = t.artUrl || null;
      entry.lastPlayed = Date.now();
      state.trackPlays[t.dbId] = entry;
      const x = state.x, now = new Date();
      if (live.curTrack && live.curTrack !== t.dbId && !live.curEnded && live.curListenMs < 30000) x.skips++;
      live.repeatRun = (live.curTrack === t.dbId) ? live.repeatRun + 1 : 1;
      x.bestRepeat = Math.max(x.bestRepeat, live.repeatRun);
      live.curTrack = t.dbId; live.curListenMs = 0; live.curEnded = false;
      live.trackStart = Date.now();
      const artist = (t.artist || 'Unknown').trim() || 'Unknown';
      x.artistPlays[artist] = (x.artistPlays[artist] || 0) + 1;
      if (now.getHours() < 5) x.nightPlays++;
      markDirty();
    }
    function tickListen(kind, deltaMs, track, isBackground){
      state.totalListenMs += deltaMs;
      if (kind === 'video') state.totalVideoMs += deltaMs; else state.totalAudioMs += deltaMs;
      if (isBackground) state.totalBackgroundMs += deltaMs;
      const x = state.x, d = new Date(), dk = d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate();
      x.hourMs[d.getHours()] += deltaMs; x.weekdayMs[d.getDay()] += deltaMs;
      x.dayMs[dk] = (x.dayMs[dk] || 0) + deltaMs;
      live.curListenMs += deltaMs;
      const a = ((track && track.artist) || 'Unknown').trim() || 'Unknown';
      x.artistMs[a] = (x.artistMs[a] || 0) + deltaMs;
      const mEl = document.getElementById(kind === 'video' ? 'video-el' : 'audio'), rate = mEl ? mEl.playbackRate : 1;
      if (rate > 1.01) x.speedUpMs += deltaMs; else if (rate < 0.99) x.slowMs += deltaMs;
      // XP follows time actually played, so skipped sections earn nothing. Speed works inversely:
      // faster playback earns less per second (2x = half), slower earns more (0.5x = double).
      if (window.PPXpApi && window.PPXpApi.recordWatchTime) window.PPXpApi.recordWatchTime(deltaMs / Math.min(4, Math.max(0.25, rate > 0 ? rate : 1)));
      if (window.__ppHub) window.__ppHub.listen(deltaMs);
      if (track && track.dbId && state.trackPlays[track.dbId]){
        state.trackPlays[track.dbId].totalMs = (state.trackPlays[track.dbId].totalMs || 0) + deltaMs;
        if (isBackground){
          state.trackPlays[track.dbId].backgroundMs = (state.trackPlays[track.dbId].backgroundMs || 0) + deltaMs;
        }
      }
      markDirty();
    }
    function recordSetting(label){
      if (!label) return;
      state.settingsUsage[label] = (state.settingsUsage[label] || 0) + 1;
      markDirty();
    }
    function recordFilter(name){
      if (!name) return;
      state.filterUsage[name] = (state.filterUsage[name] || 0) + 1;
      markDirty();
    }
    // Writes are debounced (see the dirty/scheduleFlush comment above) so
    // an export that reads localStorage right after a stat-changing action
    // can grab data from before that change landed. Exposed so anything
    // that needs an up-to-date snapshot - like the progress/settings
    // backup export - can force it first.
    function flush(){ if (dirty) saveState(); }
    window.PPPortfolioApi = { recordTrackPlay, tickListen, recordSetting, recordFilter, flush };

    // ---------- App foreground time ----------
    ppEvery(() => {
      if (!document.hidden){
        state.totalAppMs += 1000; markDirty();
        const n = Date.now();
        if (n - live.lastActive > 30 * 60000){ state.x.sessions++; live.sessionMs = 0; }
        live.lastActive = n; live.sessionMs += 1000;
        state.x.longestSessionMs = Math.max(state.x.longestSessionMs, live.sessionMs);
      }
    }, 1000);

    // ---------- Extended tracking (listeners only, no player edits) ----------
    ['audio', 'video-el'].forEach(id => {
      const el = document.getElementById(id); if (!el) return;
      el.addEventListener('ended', () => { state.x.completions++; live.curEnded = true; markDirty(); });
      el.addEventListener('seeked', () => {
        // A user-driven seek (click, key or gesture just before it), not the automatic resume at track start.
        if (Date.now() - live.lastInput < 1000 && Date.now() - live.trackStart > 2000){ state.x.seeks++; markDirty(); }
      });
      el.addEventListener('ratechange', () => { if (Date.now() - live.lastInput < 1000){ state.x.rateChanges++; markDirty(); } });
    });
    const vEl = document.getElementById('video-el');
    if (vEl) vEl.addEventListener('enterpictureinpicture', () => { state.x.pipCount++; markDirty(); });
    document.addEventListener('fullscreenchange', () => { if (document.fullscreenElement){ state.x.fsCount++; markDirty(); } });
    document.addEventListener('pointerdown', () => { live.lastInput = Date.now(); }, true);
    document.addEventListener('keydown', (e) => {
      live.lastInput = Date.now();
      const t = e.target && e.target.tagName; if (t === 'INPUT' || t === 'TEXTAREA' || t === 'SELECT' || e.key.length > 1 && /^(Shift|Control|Alt|Meta)$/.test(e.key)) return;
      const k = e.key === ' ' ? 'Space' : (e.key.length === 1 ? e.key.toUpperCase() : e.key);
      state.x.keys[k] = (state.x.keys[k] || 0) + 1; markDirty();
    }, true);
    document.addEventListener('click', (e) => {
      const b = e.target.closest && e.target.closest('button[title]');
      if (!b || b.closest('#ppp-overlay') || b.closest('#sidebar-pane-settings')) return;
      const k = b.getAttribute('title'); if (!k || /^close$/i.test(k)) return;
      state.x.buttons[k] = (state.x.buttons[k] || 0) + 1; markDirty();
    }, true);
    const fileIn = document.getElementById('file-input'), subIn = document.getElementById('subtitle-input');
    if (fileIn) fileIn.addEventListener('change', () => { state.x.filesAdded += fileIn.files.length; markDirty(); });
    if (subIn) subIn.addEventListener('change', () => { state.x.subsLoaded++; markDirty(); });
    // Flush at most once every 5s, and only the work that's actually
    // pending - scheduleFlush no-ops entirely when nothing changed, so a
    // silent library doesn't pay for a stringify+write every 5 seconds.
    setInterval(scheduleFlush, 5000);
    window.addEventListener('beforeunload', () => { if (dirty && !window.__ppSkipUnloadSave) saveState(); });

    loadState();
    saveState();

    // ---------- Settings tinkering ----------
    // Delegated at the settings pane level so it covers every toggle,
    // button and preset already there without touching their individual
    // handlers.
    const settingsPane = document.getElementById('sidebar-pane-settings');
    function handleSettingsInteraction(e){
      const presetBtn = e.target.closest('[data-gesture-preset]');
      if (presetBtn){
        recordSetting('Gesture preset: ' + presetBtn.textContent.trim());
        return;
      }
      if (e.target.closest('#new-playlist-btn')){
        recordSetting('Create playlist');
        return;
      }
      const row = e.target.closest('.settings-row');
      if (row && !row.closest('#ppp-entry-section')){
        const titleEl = row.querySelector('.settings-row-title');
        if (titleEl){
          const label = titleEl.textContent.replace(/^[^\w]+\s*/, '').trim();
          if (label) recordSetting(label);
        }
      }
    }
    if (settingsPane){
      settingsPane.addEventListener('click', handleSettingsInteraction);
      settingsPane.addEventListener('change', handleSettingsInteraction);
    }

    // ---------- Icons (plain SVG, no emoji) ----------
    const ICON = {
      clock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.5 2"/></svg>',
      headphones: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M4 14v-2a8 8 0 0 1 16 0v2"/><rect x="3" y="14" width="5" height="6" rx="1.5"/><rect x="16" y="14" width="5" height="6" rx="1.5"/></svg>',
      gear: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3.2"/><path d="M12 3.5v2.4M12 18.1v2.4M20.5 12h-2.4M5.9 12H3.5M17.7 6.3l-1.7 1.7M8 16l-1.7 1.7M17.7 17.7L16 16M8 8 6.3 6.3"/></svg>',
      sliders: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h13M21 18h0"/><circle cx="16" cy="6" r="2"/><circle cx="8" cy="12" r="2"/><circle cx="17" cy="18" r="2"/></svg>',
      calendar: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="3.5" y="5" width="17" height="16" rx="2"/><path d="M3.5 10h17M8 3v4M16 3v4"/></svg>',
      disc: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="2.6"/></svg>',
      film: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4.5" width="18" height="15" rx="2"/><path d="M8 4.5v15M16 4.5v15M3 9.5h5M16 9.5h5M3 15h5M16 15h5"/></svg>',
      trophy: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M7 4h10v5a5 5 0 0 1-10 0V4Z"/><path d="M7 6H4.5A2.5 2.5 0 0 0 7 9.5M17 6h2.5A2.5 2.5 0 0 1 17 9.5"/><path d="M10 15.5v2M14 15.5v2M8 20.5h8M9.5 17.5h5v3h-5z"/></svg>',
      bee: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><ellipse cx="12" cy="13.5" rx="5.5" ry="6.5"/><path d="M6.7 11h10.6M6.7 15.3h10.6"/><path d="M12 7c-1.6-2.3-3.6-3.3-5.4-2.7C8 5.6 9.4 6.7 10.3 8"/><path d="M12 7c1.6-2.3 3.6-3.3 5.4-2.7C16 5.6 14.6 6.7 13.7 8"/><path d="M9 5.2V4M15 5.2V4"/></svg>',
    };

    // ---------- Formatting ----------
    function formatDuration(ms){
      const totalMin = Math.floor(ms / 60000);
      if (totalMin < 1) return 'under a minute';
      if (totalMin < 60) return totalMin + (totalMin === 1 ? ' minute' : ' minutes');
      const totalHr = Math.floor(totalMin / 60);
      const remMin = totalMin % 60;
      if (totalHr < 24) return totalHr + 'h ' + remMin + 'm';
      const days = Math.floor(totalHr / 24);
      const remHr = totalHr % 24;
      return days + (days === 1 ? ' day ' : ' days ') + remHr + 'h';
    }
    function formatDate(ts){
      try {
        return new Date(ts).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
      } catch(e){ return ''; }
    }
    function topEntry(obj){
      let bestKey = null, best = null;
      Object.keys(obj).forEach(k => {
        const v = obj[k];
        const count = typeof v === 'number' ? v : v.count;
        if (best === null || count > best){ best = count; bestKey = k; }
      });
      return bestKey === null ? null : { key: bestKey, value: obj[bestKey] };
    }
    function topByField(obj, field){
      let bestKey = null, best = 0;
      Object.keys(obj).forEach(k => {
        const v = (obj[k] && obj[k][field]) || 0;
        if (v > best){ best = v; bestKey = k; }
      });
      return bestKey === null ? null : { key: bestKey, value: obj[bestKey] };
    }

    // Small deterministic scatter of soft grey bubbles behind each banner's
    // content, seeded per-banner so the layout varies without being random
    // on every render.
    function bubblesHtml(seed){
      const specs = [
        [18, 14, 90], [78, 20, 60], [12, 70, 70], [85, 75, 110], [50, 8, 40], [55, 88, 50]
      ];
      return specs.map((s, i) => {
        const jitter = ((seed * (i + 3)) % 10) - 5;
        const left = Math.max(2, Math.min(92, s[0] + jitter));
        const top = Math.max(2, Math.min(90, s[1] + jitter));
        return '<div class="ppp-bubble" style="left:' + left + '%; top:' + top + '%; width:' + s[2] + 'px; height:' + s[2] + 'px;"></div>';
      }).join('');
    }

    function resolveArt(dbId, storedArtUrl){
      try {
        if (typeof window.PPGetTrackByDbId === 'function'){
          const live = window.PPGetTrackByDbId(dbId);
          if (live && live.artUrl) return live.artUrl;
        }
      } catch(e){ /* ignore */ }
      return storedArtUrl || null;
    }

    function centerHtml(opts){
      // opts: { artUrl, fallbackIcon }
      if (opts.artUrl){
        return '<div class="ppp-center"><img src="' + opts.artUrl + '" alt=""'
          + ' onerror="this.style.display=\'none\'; this.nextElementSibling.style.display=\'flex\';">'
          + '<div class="ppp-center-fallback" style="display:none;">' + opts.fallbackIcon + '</div></div>';
      }
      return '<div class="ppp-center"><div class="ppp-center-fallback">' + opts.fallbackIcon + '</div></div>';
    }

    function bannerHtml(seed, top, center, bottom){
      return '<div class="ppp-banner">'
        + bubblesHtml(seed)
        + '<div class="ppp-top-text">' + top + '</div>'
        + center
        + '<div class="ppp-bottom-text">' + bottom + '</div>'
        + '</div>';
    }

    function buildBanners(){
      const parts = [];
      let seed = 1;

      // Time in the app
      parts.push(bannerHtml(seed++, 'TIME IN THE APP',
        centerHtml({ artUrl: null, fallbackIcon: ICON.clock }),
        state.totalAppMs > 0
          ? 'Total time in Press Play Media: ' + formatDuration(state.totalAppMs) + '.'
          : 'No time logged yet.'));

      // Total listening time
      parts.push(bannerHtml(seed++, 'TIME SPENT LISTENING',
        centerHtml({ artUrl: null, fallbackIcon: ICON.headphones }),
        state.totalListenMs > 0
          ? 'Total playback: ' + formatDuration(state.totalListenMs) + ' of music and video.'
          : 'No playback time recorded yet.'));

      // Most played track
      const topTrack = topEntry(state.trackPlays);
      const trackArt = topTrack ? resolveArt(topTrack.key, topTrack.value.artUrl) : null;
      const trackFallback = topTrack && topTrack.value.kind === 'video' ? ICON.film : ICON.disc;
      parts.push(bannerHtml(seed++, 'MOST PLAYED',
        centerHtml({ artUrl: trackArt, fallbackIcon: trackFallback }),
        topTrack
          ? (topTrack.value.title || 'Untitled') + ' by ' + (topTrack.value.artist || 'Unknown')
            + ', played ' + topTrack.value.count + (topTrack.value.count === 1 ? ' time' : ' times') + '.'
          : 'Nothing has been played enough times yet to crown a favorite.'));

      // Total plays
      const totalPlays = Object.keys(state.trackPlays).reduce((sum, k) => sum + state.trackPlays[k].count, 0);
      parts.push(bannerHtml(seed++, 'TOTAL PLAYS',
        centerHtml({ artUrl: null, fallbackIcon: ICON.trophy }),
        totalPlays > 0
          ? totalPlays + (totalPlays === 1 ? ' track played so far.' : ' tracks played so far.')
          : 'No plays recorded yet.'));

      // Audio vs video balance
      const avTotal = state.totalAudioMs + state.totalVideoMs;
      let avText = 'Not enough playback yet to tell audio from video.';
      if (avTotal > 0){
        const audioPct = Math.round((state.totalAudioMs / avTotal) * 100);
        avText = audioPct >= 50
          ? audioPct + '% of listening time has gone to audio tracks.'
          : (100 - audioPct) + '% of listening time has gone to video.';
      }
      parts.push(bannerHtml(seed++, 'AUDIO OR VIDEO',
        centerHtml({ artUrl: null, fallbackIcon: ICON.sliders }),
        avText));

      // Busy Bee: background listening
      const topBg = topByField(state.trackPlays, 'backgroundMs');
      const bgArt = topBg ? resolveArt(topBg.key, topBg.value.artUrl) : null;
      const bgFallback = topBg && topBg.value.kind === 'video' ? ICON.film : ICON.bee;
      const bgTimeText = state.totalBackgroundMs > 0
        ? 'Background playback totals ' + formatDuration(state.totalBackgroundMs) + '.'
        : 'Nothing has played in the background yet.';
      const bgTrackText = topBg
        ? 'Top background track: ' + (topBg.value.title || 'Untitled') + ' by ' + (topBg.value.artist || 'Unknown') + '.'
        : '';
      parts.push(bannerHtml(seed++, 'BUSY BEE',
        centerHtml({ artUrl: bgArt, fallbackIcon: bgFallback }),
        bgTimeText + (bgTrackText ? ' ' + bgTrackText : '')));

      // Most tinkered with setting
      const topSetting = topEntry(state.settingsUsage);
      parts.push(bannerHtml(seed++, 'MOST TINKERED WITH',
        centerHtml({ artUrl: null, fallbackIcon: ICON.gear }),
        topSetting
          ? '"' + topSetting.key + '" adjusted ' + topSetting.value + (topSetting.value === 1 ? ' time.' : ' times.')
          : 'No settings changed yet.'));

      // Favorite video filter
      const topFilter = topEntry(state.filterUsage);
      parts.push(bannerHtml(seed++, 'FAVORITE LOOK',
        centerHtml({ artUrl: null, fallbackIcon: ICON.sliders }),
        topFilter
          ? 'Most used video filter: ' + topFilter.key + ', applied ' + topFilter.value + (topFilter.value === 1 ? ' time.' : ' times.')
          : 'No video filters applied yet.'));


