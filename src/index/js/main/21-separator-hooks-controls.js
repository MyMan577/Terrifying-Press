    // --- hooks used by vocal-separator.js (smart tags, auto-EQ, Whisper) ---
    setTrackEqPreset: (dbId, name) => {
      const pre = EQ_PRESETS[name]; if (!pre) return false;
      saveTrackEqOverride(dbId, { gains: pre.slice(), enabled: true });
      const cur = currentIndex !== -1 ? tracks[currentIndex] : null;
      if (cur && cur.dbId === dbId){
        trackEqOverrideActive = true; eqGains = pre.slice(); eqEnabled = true;
        eqOverrideToggle.checked = true;
        refreshEqSlidersUI(); updateEqPresetHighlight(); refreshEqPowerUI();
        Object.values(graphs).forEach(rewireFilterChain); applyEqAll();
      }
      return true;
    },
    setSubtitles: (dbId, cues, name) => {
      const c = finalizeSubtitleCues(cues); if (!c.length) return false;
      const ok = writeSubtitleEntry(dbId, { cues: c, on: true, offset: 0, name: name || 'Whisper' });
      if (currentIndex !== -1 && tracks[currentIndex] && tracks[currentIndex].dbId === dbId) applySavedSubtitles(dbId);
      return ok;
    },
    createPlaylist: name => createPlaylist(name),
    setStemSections: on => { if (stemSections === !!on) return; stemSections = !!on; try { localStorage.setItem('ppStemSections', on ? '1' : '0'); } catch(e){ if (typeof ppCaught === "function") ppCaught(e); } renderPlaylist(); },   // unchanged (the splitter sets it at start): no redraw
    // Splitter entry point: adds stems as split tracks (kept out of All tracks, grouped under "Split tracks").
    // info: { srcId, srcTitle, makePlaylist, showInTab }
    addLibraryFiles: (files) => addFiles(files),   // a new ordinary library track (used by mashup save)
    addStemFiles: (files, info) => {
      info = info || {};
      let plId = null;
      if (info.makePlaylist){
        let pl = info.srcId ? playlists.find(p => p.stemOf === info.srcId) : null;
        if (!pl){
          pl = { id: 'pl_' + Date.now() + '_' + Math.random().toString(36).slice(2,8), name: (info.srcTitle || 'Split') + ' (stems)', stemOf: info.srcId || 'x' };
          playlists.push(pl);
        }
        pl.libOnly = !info.showInTab;
        plId = pl.id;
        savePlaylists();
        renderPlaylistsManager();
      }
      addFiles(files, { srcId: info.srcId, srcTitle: info.srcTitle, playlistId: plId });
    },
    addToPlaylist: (dbId, plId) => {
      const t = tracks.find(x => x.dbId === dbId); if (!t) return false;
      t.playlistIds = t.playlistIds || [];
      if (!t.playlistIds.includes(plId)) t.playlistIds.push(plId);
      return true;
    },
    removeFromPlaylist: (dbId, plId) => {
      const t = tracks.find(x => x.dbId === dbId); if (!t || !t.playlistIds) return false;
      t.playlistIds = t.playlistIds.filter(pid => pid !== plId); return true;
    },
    deletePlaylistQuiet: id => {       // no confirm: used for auto-made (surprise) playlists that age out
      if (!playlists.some(p => p.id === id)) return;
      playlists = playlists.filter(p => p.id !== id);
      tracks.forEach(t => { if (t.playlistIds) t.playlistIds = t.playlistIds.filter(pid => pid !== id); });
      if (activePlaylistView === id) activePlaylistView = '__all__';
    },
    commitPlaylists: () => { savePlaylists(); saveLibraryMeta(); renderPlaylistsManager(); renderPlaylistViewSelect(); renderPlaylist(); },
    // --- read by the widgets (pp-widgets.js): what plays next, the sleep timer, saved positions ---
    w: {
      upNext: n => {
        if (currentIndex < 0 || !tracks[currentIndex]) return [];
        return upcomingEntries(n).map(e => e.i);
      },
      jump: i => {
        if (i < 0 || i >= tracks.length) return;
        const e = upcomingEntries(400).find(x => x.i === i);
        if (e && e.k != null) forceQueuedK = e.k;
        loadTrack(i, true);
      },
      time: () => { const m = media(); return { t: (m && m.currentTime) || 0, d: (m && isFinite(m.duration) && m.duration) || 0 }; },
      seek: s => { const m = media(); if (m && isFinite(s)) m.currentTime = Math.max(0, s); },
      sleep: () => ({ mode: sleepTimer.mode, ms: sleepRemainingMs(), left: sleepTimer.left || 0 }),
      sleepFor: min => startSleepTimer(min),
      sleepEnd: () => startSleepAtEndOfTrack(),
      sleepOff: () => clearSleepTimer(),
      positions: () => loadPlaybackPositions(),
      // the queue builder widget: put a track right after the one playing, or take one out, without stopping the music
      playNext: i => {
        if (i < 0 || i >= tracks.length || currentIndex < 0 || i === currentIndex) return false;
        return window.__ppQueue.add([i], true) > 0;   // a picked song (see the queue in pp-queue.js)
      },
      unqueue: i => {
        if (i === currentIndex) return false;
        const pos = upcomingEntries(Infinity).findIndex(e => e.i === i);
        if (pos < 0) return false;
        window.__ppQueue.removeAt(pos);
        return true;
      }
    },
    sel: {
      active: () => selectMode,
      has: t => selectedTracks.has(t),
      count: () => selectedTracks.size,
      hasVideo: () => [...selectedTracks].some(t => t.kind === 'video'),
      enter: (t, plId) => enterSelectFromHome(t, plId),
      toggle: t => toggleSelectedFromHome(t),
      all: idxs => selectAllOfIndices(idxs),
      exit: () => exitSelectMode(),
      act: (name, btn) => {
        if (!selectMode) return;
        if (name === 'cancel') exitSelectMode();
        else if (['playlist', 'move-pl', 'remove-pl', 'q-next', 'q-add', 'rename', 'rename-artist', 'convert', 'delete'].includes(name)) runSelectAct(name, btn);
      }
    }
  };
  function loadTrack(i, autoplay){
    if (i < 0 || i >= tracks.length) return;
    noteQueuePlay(i);
    if (autoplay && window.__ppOnPlay){ try { window.__ppOnPlay(tracks[i]); } catch(e){ if (typeof ppCaught === "function") ppCaught(e); } }
    const _prevTrack = currentIndex !== -1 ? tracks[currentIndex] : null;

    // Remember where the track we're switching away from left off, so it
    // picks back up there next time (see the resume-seek below).
    if (rememberPlaybackPosition && currentIndex !== -1 && tracks[currentIndex]){
      const prev = tracks[currentIndex];
      const m = media();
      if (isFinite(m.currentTime) && isFinite(m.duration) && m.duration > 0){
        // Being within a few seconds of the end counts as "finished" -
        // don't save that, or the track would reopen right at its end.
        const nearEnd = m.currentTime > m.duration - 3;
        savePlaybackPosition(prev.dbId, nearEnd ? null : m.currentTime);
      }
    }

    // Pause whichever element was previously active.
    lastTrackLoadTs = Date.now();
    // When auto-advancing while backgrounded, don't explicitly pause audioEl:
    // an explicit pause() makes the OS drop the media session / audio focus,
    // and the follow-up play() (no user gesture) can then be refused or
    // bounce. Assigning a new src below already stops the old audio.
    if (!(autoplay && document.hidden)) audioEl.pause();
    videoEl.pause();
    if (bgAudioActive){ releaseWebAudioPicture(bgEl.muted); try { bgEl.pause(); bgEl.removeAttribute('src'); bgEl.load(); } catch(e){} }
    bgAudioActive = false; // any prior background-audio substitution no longer applies
    setTimeout(() => { if (!bgAudioActive) setBgGraphLive(false); }, 400);
    audioEl.loop = false;   // set again for the new track by syncAudioLoop() below

    persistSubtitleState(true);   // flush a pending offset change to the track we're leaving
    currentIndex = i;
    const t = tracks[i];
    npTitleTrack.textContent = t.title;
    npArtist.textContent = t.artist;
    document.title = `${t.title} · Player`;
    requestAnimationFrame(() => setupMarquee(npTitle));

    // Reset per-track extras, then restore anything saved for this track.
    abLoop = getSavedABLoop(t.dbId) || { a: null, b: null };
    const savedBoost = getSavedTrackBoost(t.dbId);
    trackBoostOverrideActive = savedBoost != null;
    trackBoost = trackBoostOverrideActive ? savedBoost : 1;

    const savedEq = getSavedTrackEqOverride(t.dbId);
    trackEqOverrideActive = savedEq != null;
    eqGains = trackEqOverrideActive ? window.__ppEqNorm(savedEq.gains) : globalEqGains.slice();
    eqEnabled = trackEqOverrideActive ? !!savedEq.enabled : globalEqEnabled;

    const savedVizSens = getSavedTrackVizSens(t.dbId);
    trackVizSensOverrideActive = savedVizSens != null;
    vizSensitivity = trackVizSensOverrideActive ? savedVizSens : globalVizSensitivity;

    setABLabel();
    applySavedSubtitles(t.dbId);
    try { songSoundSwitch(_prevTrack, t); } catch(e){ if (typeof ppCaught === "function") ppCaught(e); }   // this song's own speed / pitch / reverb, if it has one
    try { songOvSwitch(_prevTrack, t); } catch(e){ console.warn('[song override]', e); }   // its own filters, visualizer, smoothing, enhance, FX, fit
    applySpeed();
    syncAudioLoop();

    // Formats and links the in-app players cannot open at all go straight to the VLC engine (29b).
    ppVlcLeave(t);
    const toVlc = ppVlcWants(t);
    if (t.kind === 'video'){
      showVideoView();
      ppApplyCors(videoEl, t);
      if (toVlc) ppVlcPark(videoEl, t, autoplay); else PPNative.setSrc(videoEl, t);
    } else {
      showAudioView();
      ppApplyCors(audioEl, t);
      if (toVlc) ppVlcPark(audioEl, t, autoplay); else PPNative.setSrc(audioEl, t);
      if (t.artUrl){
        artImg.src = t.artUrl;
        artImg.style.display = 'block';
        artFallback.style.display = 'none';
      } else {
        showFallbackArt();
      }
    }

    // Resume where this track left off, once we know its duration (so we
    // can sanity-check the saved position isn't past the end - e.g. a
    // shorter re-encode of the same title).
    if (rememberPlaybackPosition){
      const savedPos = getSavedPlaybackPosition(t.dbId);
      if (savedPos != null && savedPos > 3){
        const resumeEl = t.kind === 'video' ? videoEl : audioEl;
        resumeEl.addEventListener('loadedmetadata', function applyResume(){
          if (savedPos < resumeEl.duration - 2) resumeEl.currentTime = savedPos;
        }, { once: true });
      }
    }

    // Keep volume in sync across both elements.
    audioEl.volume = volume.value / 100;
    videoEl.volume = volume.value / 100;

    renderPlaylist();
    // Both audio and video route through the Web Audio graph now, since the
    // equalizer needs to reach video's audio too (only audio also feeds the
    // visualizer ring, video just gets the analyser/filter chain along for
    // the ride).
    ensureAudioCtx();
    getGraphFor(t.kind === 'video' ? 'video' : 'audio');
    applyTrackBoostToCurrentGraph();
    ppOnTrackLoaded(t);
    applyMasterBoostAll();
    refreshBoostUI();
    applyEqToGraph(getGraphFor(t.kind === 'video' ? 'video' : 'audio'));
    rewireFilterChain(getGraphFor(t.kind === 'video' ? 'video' : 'audio'));
    refreshEqSlidersUI();
    updateEqPresetHighlight();
    refreshEqPowerUI();
    refreshEqOverrideUI();
    refreshVizSensUI();

    updateMediaSession();

    if (autoplay){
      if (window.PPPortfolioApi) window.PPPortfolioApi.recordTrackPlay(t);
      if (toVlc){ /* ppVlcPark has opened it in the VLC engine */ }
      else if (t.kind === 'video' && (document.hidden || bgAudioManual)){
        enterBackgroundAudioMode().then(()=>{ isPlaying = true; updatePlayIcon(); updateMediaSession(); });
      } else {
        resumeAudioCtx().then(() => media().play()).then(()=>{ isPlaying = true; updatePlayIcon(); updateMediaSession(); }).catch(()=>{});
      }
    }
  }

  function updatePlayIcon(){
    if (window.ppWake) ppWake();   // restart the heartbeat if it was parked while hidden and idle
    playBtn.classList.toggle('is-playing', !!isPlaying);
    playBtn.title = isPlaying ? 'Pause' : 'Play';
    playBtn.setAttribute('aria-label', isPlaying ? 'Pause' : 'Play');
  }

  function togglePlay(){
    if (currentIndex === -1){
      if (tracks.length > 0) loadTrack(0, true);
      return;
    }
    if (isPlaying){
      resumeOnReturn = false; resumeGuardUntil = 0;
      media().pause();
      isPlaying = false;
      updatePlayIcon();
      updateMediaSession();
      if (rememberPlaybackPosition) savePlaybackPosition(tracks[currentIndex].dbId, media().currentTime);
    } else if (tracks[currentIndex].kind === 'video' && (document.hidden || bgAudioManual) && !bgAudioActive){
      // Starting/resuming a video while already backgrounded (e.g. tapped
      // play from lock-screen controls) - go straight to the audio channel.
      enterBackgroundAudioMode().then(() => {
        isPlaying = true;
        updatePlayIcon();
        updateMediaSession();
      });
    } else if (ppVlcResume(tracks[currentIndex])){
      // it is casting / playing in the VLC player: that screen came back
    } else if (ppVlcWants(tracks[currentIndex])){
      ppVlcOpen(tracks[currentIndex]);                 // this one only plays in the VLC engine
    } else {
      resumeAudioCtx().then(() => media().play()).then(() => {
        isPlaying = true;
        updatePlayIcon();
        updateMediaSession();
      }).catch(()=>{});
    }
  }

  // The queue next/prev should walk: normally the playlist the current
  // track was started from (playQueue), falling back to the full library
  // if nothing was captured (e.g. on app resume) or if the current track
  // is no longer in that queue (e.g. it was removed from the playlist).
  // While a hand-queued song plays, the place in that queue is the song
  // playback came from (queueAnchorId), so it carries on from there.
  function queueRef(){
    if (playingQueued && queueAnchorId != null){
      const a = tracks.findIndex(t => t.dbId === queueAnchorId);
      if (a >= 0) return a;
    }
    return currentIndex;
  }
  function activeQueue(){
    const ref = queueRef();
    if (playQueue.length && playQueue.includes(ref)) return playQueue;
    const curIsStem = !!(tracks[ref] && tracks[ref].stem);
    return tracks.map((_,i) => i).filter(i => !!tracks[i].stem === curIsStem);
  }
  // Picked songs that are still in the library: [{i, k}] (k = place in userQueue). Missing songs drop out.
  function userQueueIdxs(){
    if (!userQueue.length) return [];
    const at = new Map(); tracks.forEach((t, i) => at.set(t.dbId, i));
    const keep = userQueue.filter(e => at.has(e.id));
    if (keep.length !== userQueue.length){ userQueue = keep; saveUserQueue(); }
    return userQueue.map((e, k) => ({ i: at.get(e.id), k }));
  }
  // Everything still to come, in play order: picked songs placed among the songs that follow from playQueue.
  // [{i, k}] where k is set for a picked song. A picked song whose `after` song is no longer ahead plays first.
  function upcomingEntries(n){
    n = n == null ? Infinity : n;
    const picked = userQueueIdxs();
    const ctx = contextUpcoming(Infinity);
    if (!picked.length) return ctx.slice(0, n === Infinity ? ctx.length : n).map(i => ({ i }));
    const ahead = new Set(ctx.map(i => tracks[i].dbId));
    const groups = new Map(), out = [], used = new Set();
    picked.forEach(p => {
      const a = userQueue[p.k].after, key = a != null && ahead.has(a) ? a : null;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(p);
    });
    const emit = key => (groups.get(key) || []).forEach(p => { if (!used.has(p.k)){ used.add(p.k); out.push({ i: p.i, k: p.k }); } });
    emit(null);
    for (let j = 0; j < ctx.length && out.length < n; j++){
      out.push({ i: ctx[j] });
      emit(tracks[ctx[j]].dbId);
    }
    return out.slice(0, n === Infinity ? out.length : n);
  }
  function saveUserQueue(){
    queueVer++;
    try { localStorage.setItem('ppUserQueue', JSON.stringify({ ids: userQueue })); } catch(e){ if (typeof ppCaught === "function") ppCaught(e); }
    clearTimeout(saveUserQueue.t);
    saveUserQueue.t = setTimeout(() => { try { document.dispatchEvent(new CustomEvent('pp-queue')); } catch(e){ if (typeof ppCaught === "function") ppCaught(e); } }, 0);
  }
  // Called by loadTrack before currentIndex moves: a picked song that starts leaves the queue.
  function noteQueuePlay(i){
    const t = tracks[i], fresh = playQueue !== queueCtxArr;
    queueCtxArr = playQueue;
    let k = -1;
    if (t && forceQueuedK >= 0 && userQueue[forceQueuedK] && userQueue[forceQueuedK].id === t.dbId) k = forceQueuedK;
    else if (t && !fresh && userQueue.length && currentIndex >= 0){
      const e = upcomingEntries(1)[0];
      if (e && e.k != null && e.i === i) k = e.k;
    }
    if (k >= 0){
      if (!playingQueued) queueAnchorId = currentIndex >= 0 && tracks[currentIndex] ? tracks[currentIndex].dbId : null;
      userQueue.splice(k, 1);
      playingQueued = true;
    } else {
      playingQueued = false; queueAnchorId = null;
    }
    forceQueuedK = -1;
    saveUserQueue();
  }
  // True when nothing comes after the current song with repeat off.
  function atQueueEnd(){
    if (userQueueIdxs().length) return false;
    const ref = queueRef();
    if (shuffleOn){
      if (shuffleOrder.length === 0) buildShuffleOrder();
      return shuffleOrder.indexOf(ref) === shuffleOrder.length - 1;
    }
    const q = activeQueue();
    return q.indexOf(ref) === q.length - 1;
  }
  // What follows from the queue the song was started from (not the hand-queued songs), honouring shuffle and repeat.
  function contextUpcoming(n){
    const out = []; if (currentIndex < 0 || !tracks[currentIndex]) return out;
    if (repeatMode === 2) n = Math.min(n, 400);
    if (shuffleOn && !shuffleOrder.length) buildShuffleOrder();
    const ref = queueRef(), q = shuffleOn ? shuffleOrder : activeQueue(), p = q.indexOf(ref); if (p < 0) return out;
    for (let k = 1; k < q.length && out.length < n; k++){
      if (repeatMode === 0 && p + k >= q.length) break;   // the queue ends here
      const j = q[(p + k) % q.length];
      if (j !== currentIndex || playingQueued) out.push(j);   // a picked song playing doesn't hide its own place in the playlist
    }
    return out;
  }
  function nextTrackIndex(){
    if (tracks.length === 0) return -1;
    if (userQueue.length){
      if (currentIndex < 0){ const p = userQueueIdxs()[0]; if (p) return p.i; }
      const e = upcomingEntries(1)[0];
      if (e) return e.i;
    }
    const queue = activeQueue();
    if (queue.length === 0) return -1;
    const ref = queueRef();
    if (shuffleOn){
      if (shuffleOrder.length === 0) buildShuffleOrder();
      const pos = shuffleOrder.indexOf(ref);
      return shuffleOrder[(pos+1) % shuffleOrder.length];
    }
    const pos = queue.indexOf(ref);
    return queue[(pos + 1) % queue.length];
  }
  function prevTrackIndex(){
    if (tracks.length === 0) return -1;
    if (playingQueued){   // back from a hand-queued song: to the song it interrupted
      const a = queueRef();
      if (a >= 0 && a !== currentIndex) return a;
    }
    const queue = activeQueue();
    if (queue.length === 0) return -1;
    if (shuffleOn){
      if (shuffleOrder.length === 0) buildShuffleOrder();
      const pos = shuffleOrder.indexOf(currentIndex);
      return shuffleOrder[(pos - 1 + shuffleOrder.length) % shuffleOrder.length];
    }
    const pos = queue.indexOf(currentIndex);
    return queue[(pos - 1 + queue.length) % queue.length];
  }
  function buildShuffleOrder(){
    shuffleOrder = activeQueue().slice();
    for (let i = shuffleOrder.length-1; i>0; i--){
      const j = Math.floor(Math.random()*(i+1));
      [shuffleOrder[i], shuffleOrder[j]] = [shuffleOrder[j], shuffleOrder[i]];
    }
  }

  // Take a song out of what follows from playQueue (the playlist itself is not changed).
  function dropUpcoming(i){
    if (i === currentIndex) return;
    const ref = queueRef();
    if (!(playQueue.length && playQueue.includes(ref))) playQueue = activeQueue().slice();
    playQueue = playQueue.filter(x => x !== i);
    queueCtxArr = playQueue;   // same context, just edited
    shuffleOrder = shuffleOrder.filter(x => x !== i);
  }
  // The queue board (pp-queue.js) and the queue widgets read and edit the queue through this.
  // Positions (pos) are places in upcomingEntries(): picked songs and the rest, in play order.
  window.__ppQueue = {
    state: (n) => {
      const cur = currentIndex >= 0 && tracks[currentIndex] ? currentIndex : -1;
      return { cur, up: upcomingEntries(n || 200), picked: userQueueIdxs().length, shuffle: shuffleOn, repeat: repeatMode, playingQueued, playing: isPlaying };
    },
    // idxs: track indices. next=true plays them straight after the current song, in the order given.
    add: (idxs, next) => {
      const ids = idxs.map(i => tracks[i] && tracks[i].dbId).filter(id => id != null);
      if (!ids.length) return 0;
      userQueueIdxs();
      const items = ids.map(id => ({ id, after: null }));
      if (next) userQueue.splice(0, 0, ...items);
      else {
        // at the very end: after the last song still to come
        const up = upcomingEntries(Infinity), last = up.length ? up[up.length - 1] : null;
        const after = !last ? null : last.k != null ? userQueue[last.k].after : tracks[last.i].dbId;
        items.forEach(x => { x.after = after; });
        userQueue.push(...items);
      }
      saveUserQueue();
      return ids.length;
    },
    removeAt: pos => {
      const e = upcomingEntries(pos + 1)[pos]; if (!e) return;
      if (e.k != null) userQueue.splice(e.k, 1); else dropUpcoming(e.i);
      saveUserQueue();
    },
    jumpAt: pos => {
      const e = upcomingEntries(pos + 1)[pos]; if (!e) return;
      if (e.k != null) forceQueuedK = e.k;
      loadTrack(e.i, true);
    },
    // Drag: move the song at `from` to `to` (both places among the first n). Any song can go anywhere.
    moveAt: (from, to, n) => {
      const S = upcomingEntries(Math.max(n || 0, from + 1, to + 1));
      if (from < 0 || from >= S.length || to < 0 || to >= S.length || from === to) return;
      const oldSet = S.filter(e => e.k == null).map(e => e.i);
      const [m] = S.splice(from, 1); S.splice(to, 0, m);
      const newSet = S.filter(e => e.k == null).map(e => e.i);
      // 1. the songs from playQueue take their new order in the same slots
      if (newSet.some((i, j) => i !== oldSet[j])){
        if (!shuffleOn){
          const ref = queueRef();
          if (!(playQueue.length && playQueue.includes(ref))) playQueue = activeQueue().slice();
        }
        const q = (shuffleOn ? shuffleOrder : playQueue).slice();
        const slots = oldSet.map(i => q.indexOf(i));
        if (slots.every(x => x >= 0)){
          slots.forEach((x, j) => { q[x] = newSet[j]; });
          if (shuffleOn) shuffleOrder = q; else { playQueue = q; queueCtxArr = q; }
        }
      }
      // 2. each picked song now follows the song from playQueue just above it
      let lastSet = null; const order = [], seen = new Set();
      S.forEach(e => {
        if (e.k == null){ lastSet = tracks[e.i].dbId; return; }
        const x = userQueue[e.k]; x.after = lastSet; order.push(x); seen.add(e.k);
      });
      userQueue = order.concat(userQueue.filter((x, k) => !seen.has(k)));
      saveUserQueue();
    },
    clearAdded: () => { userQueue = []; saveUserQueue(); },
    // Start a whole new queue (a saved queue or a preset). Picked songs stay queued.
    playList: (idxs, startAt) => {
      idxs = idxs.filter(i => i >= 0 && i < tracks.length);
      if (!idxs.length) return;
      playQueue = idxs.slice(); shuffleOrder = [];
      loadTrack(idxs[Math.max(0, Math.min(idxs.length - 1, startAt || 0))], true);
    },
    version: () => queueVer,
    // What really follows when this song ends, by the same rules as onEnded(): -1 for repeat one, the end of the
    // queue with repeat off, the sleep timer stopping after this track, or an A-B loop. Used by Transitions.
    peekNext: () => {
      if (currentIndex === -1 || repeatMode === 2) return -1;
      if (sleepTimer && sleepTimer.mode === 'track') return -1;
      if (abLoop && abLoop.a != null && abLoop.b != null) return -1;
      if (repeatMode === 0 && atQueueEnd()) return -1;
      const n = nextTrackIndex();
      return n >= 0 && n !== currentIndex ? n : -1;
    },
    current: () => currentIndex
  };

  // ---------- Controls ----------
  playBtn.addEventListener('click', togglePlay);
  nextBtn.addEventListener('click', () => {
    if (currentIndex === -1) return;
    loadTrack(nextTrackIndex(), true);
  });
  prevBtn.addEventListener('click', () => {
    if (currentIndex === -1) return;
    loadTrack(prevTrackIndex(), true);
  });
  shuffleBtn.addEventListener('click', () => {
    shuffleOn = !shuffleOn;
    shuffleBtn.classList.toggle('toggled', shuffleOn);
    if (shuffleOn) buildShuffleOrder();
    saveSettings();
    saveUserQueue();
  });
  repeatBtn.addEventListener('click', () => {
    repeatMode = (repeatMode + 1) % 3;
    repeatBtn.classList.toggle('toggled', repeatMode !== 0);
    repeatBtn.classList.toggle('repeat-one', repeatMode === 2);
    repeatBtn.title = repeatMode === 0 ? 'Repeat' : repeatMode === 1 ? 'Repeat all' : 'Repeat one';
    if (bgAudioActive) bgEl.loop = repeatMode === 2 && sleepTimer.mode !== 'track';
    syncAudioLoop();
    saveSettings();
    saveUserQueue();
  });

  // Real listening time, for the Portfolio feature: driven off wall-clock
  // gaps between consecutive timeupdate events while isPlaying is true,
  // rather than off currentTime deltas, so seeks/loops don't get counted
  // as listening and a stalled/backgrounded tab doesn't overcount. Capped
  // per-tick so a tab coming back from sleep doesn't credit a huge gap.
  // Lets the Portfolio feature resolve a live (non-stale) thumbnail URL for
  // a track it only knows by dbId, since object URLs from a past session
  // won't survive a reload.
  window.PPGetTrackByDbId = (dbId) => tracks.find(t => t.dbId === dbId) || null;

  let lastListenTickTs = null;
  function trackListenTick(m){
    if (!isPlaying){ lastListenTickTs = null; return; }
    const now = Date.now();
    if (lastListenTickTs != null){
      const delta = now - lastListenTickTs;
      if (delta > 0 && delta < 2000 && window.PPPortfolioApi){
        const t = currentIndex !== -1 ? tracks[currentIndex] : null;
        window.PPPortfolioApi.tickListen(m === videoEl ? 'video' : 'audio', delta, t, document.hidden);
      }
    }
    lastListenTickTs = now;
  }

  let lastPositionSaveTs = 0;
  let lastTickPos = 0;
  function onTimeUpdate(e){
    if (e.target !== media()) return; // ignore events from the inactive element
    const m = media();
    if (!isFinite(m.duration)) return;
    // A natively looping element never fires 'ended', so count the wrap here.
    if (m.loop && !(abLoop.a != null && abLoop.b != null) &&
        lastTickPos - m.currentTime > m.duration / 2 && window.PPXpApi){
      window.PPXpApi.recordCompletion(m.duration);
    }
    lastTickPos = m.currentTime;
    if (m.duration > 0) seek.max = m.duration;
    if (!(window.ppSeekDrag && window.ppSeekDrag.on)) seek.value = m.currentTime;
    curTimeEl.textContent = fmtTime(m.currentTime);
    durTimeEl.textContent = fmtTime(m.duration);
    updateSeekFill();
    if (abLoop.a != null && abLoop.b != null) abTick(m);
    if (m === videoEl) renderSubtitleFrame();
    trackListenTick(m);
    // Throttled (interval configurable in Settings, default 1s) so a
    // crash/hard-refresh mid-track only loses a little progress rather than
    // the whole thing, without writing to localStorage on every single
    // timeupdate tick.
    if (rememberPlaybackPosition && currentIndex !== -1){
      const now = Date.now();
      if (now - lastPositionSaveTs > playbackPositionSaveIntervalMs){
        lastPositionSaveTs = now;
        savePlaybackPosition(tracks[currentIndex].dbId, m.currentTime);
      }
    }
  }
  function onLoadedMetadata(e){
    if (e.target !== media()) return;
    const m = media();
    if (currentIndex !== -1 && isFinite(m.duration) && m.duration > 0){
      tracks[currentIndex].duration = m.duration;
      saveLibraryMeta();
    }
    seek.max = (isFinite(m.duration) && m.duration > 0) ? m.duration : 100;
    durTimeEl.textContent = fmtTime(m.duration);
    renderPlaylist();
    updateABMarkers();
  }
  // Repeat-one for a song: let the player loop it by itself (ExoPlayer in the app, the <audio> element otherwise).
  // Restarting from onEnded (ended -> seek to 0 -> play()) needs this page to be awake at the exact moment the
  // song ends. With the screen off Android pauses the page, and a finished player also lets go of its
  // foreground service, so the restart never arrived and the song just stopped. Same idea as bgEl.loop for videos.
  // A single song on repeat-all is the same case. Sleep timer 'track' mode needs the real 'ended' event.
  // With the native video player on, a video is in the same spot: in the background the page sleeps and the restart
  // never came, so a video on repeat just paused at its end. ExoPlayer loops it instead. (The web <video> keeps the
  // old path: in the background bgEl takes over and loops itself, and audio lead needs the real 'ended'.)
  function syncAudioLoop(){
    const t = currentIndex !== -1 ? tracks[currentIndex] : null;
    const rep = !!t && sleepTimer.mode !== 'track' && (repeatMode === 2 || (repeatMode === 1 && tracks.length === 1));
    const want = rep && t.kind !== 'video';
    if (audioEl.loop !== want) audioEl.loop = want;
    let nv = false; try { nv = !!(window.PPNative && PPNative.enabled && PPNative.nativeVideoSetting && PPNative.nativeVideoSetting()); } catch(e){ if (typeof ppCaught === "function") ppCaught(e); }
    const wantV = rep && t.kind === 'video' && nv;
    if (videoEl.loop !== wantV) videoEl.loop = wantV;
  }
  function onEnded(e){
    if (e.target !== media()) return;
    if (window.PPXpApi) window.PPXpApi.recordCompletion(e.target.duration);
    if (rememberPlaybackPosition && currentIndex !== -1) savePlaybackPosition(tracks[currentIndex].dbId, null);
    if (sleepTimer.mode === 'track'){
      cancelResumeOnReturn();
      isPlaying = false;
      updatePlayIcon();
      clearSleepTimer();
      return;
    }
    if (repeatMode === 2){
      media().currentTime = 0;
      media().play();
      return;
    }
    if (repeatMode === 0 && atQueueEnd()){
      cancelResumeOnReturn();
      isPlaying = false;
      updatePlayIcon();
      return;
    }
    loadTrack(nextTrackIndex(), true);
  }
  [audioEl, videoEl, bgPlainEl, bgFxEl].forEach(el => {
    el.addEventListener('timeupdate', onTimeUpdate);
    el.addEventListener('loadedmetadata', onLoadedMetadata);
    el.addEventListener('durationchange', onLoadedMetadata);
    el.addEventListener('ended', onEnded);
  });
  document.addEventListener('visibilitychange', () => { if (document.hidden) persistSubtitleState(true); });
  window.addEventListener('beforeunload', () => {
    persistSubtitleState(true);
    if (rememberPlaybackPosition && currentIndex !== -1 && tracks[currentIndex]){
      savePlaybackPosition(tracks[currentIndex].dbId, media().currentTime);
    }
  });

  // While the thumb is held (or still moving), playback updates must not move it.
  // Several events are listened to because not every phone sends all of them.
  window.ppSeekDrag = window.ppSeekDrag || { on: false, t: 0 };
  const seekHold = () => { window.ppSeekDrag.on = true; clearTimeout(window.ppSeekDrag.t); };
  const seekRelease = () => { clearTimeout(window.ppSeekDrag.t); window.ppSeekDrag.t = setTimeout(() => { window.ppSeekDrag.on = false; }, 400); };
  ['pointerdown', 'touchstart', 'mousedown'].forEach(ev => seek.addEventListener(ev, seekHold, { passive: true }));
  ['pointerup', 'pointercancel', 'touchend', 'touchcancel', 'mouseup'].forEach(ev => window.addEventListener(ev, seekRelease, { passive: true }));
  seek.addEventListener('input', () => {
    seekHold();
    updateSeekFill();
  });
  seek.addEventListener('change', () => {
    window.ppSeekDrag.on = false; clearTimeout(window.ppSeekDrag.t);
    media().currentTime = parseFloat(seek.value);
  });

  // Same reasoning as applySpeed(): writing .volume (and hitting
  // localStorage via saveSettings) on every 'input' tick while dragging
  // fires dozens of times a second. rAF-throttle the actual writes so
  // they happen at most once per frame; the icon still updates immediately.
  let pendingVolumeRAF = null;
  volume.addEventListener('input', () => {
    updateVolIcon();
    if (pendingVolumeRAF) return;
    pendingVolumeRAF = requestAnimationFrame(() => {
      pendingVolumeRAF = null;
      const v = volume.value / 100;
      if (audioEl.volume !== v) audioEl.volume = v;
      if (bgPlainEl.volume !== v) bgPlainEl.volume = v;
      if (bgFxEl.volume !== v) bgFxEl.volume = v;
      if (videoEl.volume !== v) videoEl.volume = v;
      if (typeof audioLeadActive !== 'undefined' && audioLeadActive) audioLeadApplyGain();
      saveSettings();
    });
  });
  function updateVolIcon(){
    volIcon.style.opacity = media().volume === 0 ? 0.4 : 1;
  }
  audioEl.volume = 0.8;
  videoEl.volume = 0.8;

