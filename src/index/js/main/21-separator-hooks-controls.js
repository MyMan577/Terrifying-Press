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
    setStemSections: on => { stemSections = !!on; try { localStorage.setItem('ppStemSections', on ? '1' : '0'); } catch(e){} renderPlaylist(); },
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
        else if (['playlist', 'move-pl', 'remove-pl', 'rename', 'rename-artist', 'convert', 'delete'].includes(name)) runSelectAct(name, btn);
      }
    }
  };
  function loadTrack(i, autoplay){
    if (i < 0 || i >= tracks.length) return;
    if (autoplay && window.__ppOnPlay){ try { window.__ppOnPlay(tracks[i]); } catch(e){} }
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
    try { songSoundSwitch(_prevTrack, t); } catch(e){}   // this song's own speed / pitch / reverb, if it has one
    applySpeed();
    syncAudioLoop();

    if (t.kind === 'video'){
      showVideoView();
      ppApplyCors(videoEl, t);
      PPNative.setSrc(videoEl, t);
    } else {
      showAudioView();
      ppApplyCors(audioEl, t);
      PPNative.setSrc(audioEl, t);
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
      if (t.kind === 'video' && (document.hidden || bgAudioManual)){
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
  function activeQueue(){
    if (playQueue.length && playQueue.includes(currentIndex)) return playQueue;
    const curIsStem = !!(tracks[currentIndex] && tracks[currentIndex].stem);
    return tracks.map((_,i) => i).filter(i => !!tracks[i].stem === curIsStem);
  }
  function nextTrackIndex(){
    if (tracks.length === 0) return -1;
    const queue = activeQueue();
    if (queue.length === 0) return -1;
    if (shuffleOn){
      if (shuffleOrder.length === 0) buildShuffleOrder();
      const pos = shuffleOrder.indexOf(currentIndex);
      return shuffleOrder[(pos+1) % shuffleOrder.length];
    }
    const pos = queue.indexOf(currentIndex);
    return queue[(pos + 1) % queue.length];
  }
  function prevTrackIndex(){
    if (tracks.length === 0) return -1;
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
  });
  repeatBtn.addEventListener('click', () => {
    repeatMode = (repeatMode + 1) % 3;
    repeatBtn.classList.toggle('toggled', repeatMode !== 0);
    repeatBtn.classList.toggle('repeat-one', repeatMode === 2);
    repeatBtn.title = repeatMode === 0 ? 'Repeat' : repeatMode === 1 ? 'Repeat all' : 'Repeat one';
    if (bgAudioActive) bgEl.loop = repeatMode === 2 && sleepTimer.mode !== 'track';
    syncAudioLoop();
    saveSettings();
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
    if (abLoop.a != null && abLoop.b != null && m.currentTime >= abLoop.b){
      m.currentTime = abLoop.a;
    }
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
  function syncAudioLoop(){
    const t = currentIndex !== -1 ? tracks[currentIndex] : null;
    const want = !!t && t.kind !== 'video' && sleepTimer.mode !== 'track' &&
      (repeatMode === 2 || (repeatMode === 1 && tracks.length === 1));
    if (audioEl.loop !== want) audioEl.loop = want;
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
    const isLast = shuffleOn
      ? shuffleOrder.indexOf(currentIndex) === shuffleOrder.length - 1
      : currentIndex === tracks.length - 1;
    if (isLast && repeatMode === 0){
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

