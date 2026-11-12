  // ---------- Audio lead ----------
  // Instead of delaying the picture (which means capturing and re-drawing every frame), leave the
  // video completely untouched and play its sound from the spare <audio> element, running ahead of
  // the picture by the latency. The video element is muted; the audio element carries its own EQ chain.
  //
  // The lead is a small state machine so nothing is ever "fixed" while you can hear it:
  //   'syncing' - silent. The audio element is parked/aimed at the right spot (after a start, skip,
  //               seek, track change, stall, latency change). Nothing is audible until it has landed.
  //   'live'    - audible. Only a sustained, real drift sends it back to 'syncing'.
  const AUDIO_LEAD_KEY = 'playerAudioLead';
  let audioLeadOn = false;
  try { if (localStorage.getItem(AUDIO_LEAD_KEY) === '1') audioLeadOn = true; } catch (e){}
  let audioLeadActive = false, audioLeadUrl = null, audioLeadUserMuted = false, audioLeadPrevAudioMuted = false;
  let audioLeadState = 'syncing';
  let audioLeadGain = 1, audioLeadFadeTimer = null, audioLeadFadeTarget = 1, audioLeadPlayPending = false;
  let audioLeadAimTries = 0, audioLeadStableSince = 0;
  let audioLeadBias = 0;          // steady offset (FX chain / output latency) we couldn't aim away: tolerated, not "drift"
  let audioLeadErrs = [], audioLeadLastSample = 0;   // recent drift samples while live
  let audioLeadHoldUntil = 0;     // no drift judging before this time (just locked in, or the page just hiccuped)
  let audioLeadStallAt = 0, audioLeadAudioStallAt = 0, audioLeadLastTick = 0;
  let audioLeadSeekMs = 120, audioLeadSeekT0 = 0;    // measured cost of a seek, so we aim slightly ahead of it
  let audioLeadFixes = [];        // timestamps of recent drift corrections, used to back off
  let audioLeadLat = 0;
  let audioLeadHandoffAt = 0, audioLeadHandoffTimer = null;   // set when the lead hands audioEl to background-audio mode

  function audioLeadWanted(){
    if (!audioLeadOn || bgAudioActive) return false;
    // Keep the lead running in Picture-in-Picture even when the page is hidden (phone app backgrounded).
    if (document.hidden && document.pictureInPictureElement !== videoEl) return false;
    if (currentIndex === -1 || !tracks[currentIndex] || tracks[currentIndex].kind !== 'video') return false;
    if (videoWrap.style.display === 'none') return false;
    return netLatencyMs() > 0;
  }
  function audioLeadTarget(){
    let tt = videoEl.currentTime + netLatencyMs() / 1000;
    const d = audioEl.duration;
    if (isFinite(d)) tt = Math.min(tt, Math.max(0, d - 0.01));
    return Math.max(0, tt);
  }
  // Seek the audio element to where it should be, a touch ahead to cover the time the seek itself takes.
  function audioLeadAim(){
    audioLeadSeekT0 = performance.now();
    let tt = audioLeadTarget() + audioLeadBias + audioLeadSeekMs / 1000;
    const d = audioEl.duration;
    if (isFinite(d)) tt = Math.min(tt, Math.max(0, d - 0.01));
    try { audioEl.currentTime = Math.max(0, tt); } catch (e){}
  }
  audioEl.addEventListener('seeked', () => {
    if (!audioLeadActive || !audioLeadSeekT0) return;
    const ms = performance.now() - audioLeadSeekT0;
    audioLeadSeekT0 = 0;
    audioLeadSeekMs = Math.max(0, Math.min(400, audioLeadSeekMs * 0.5 + ms * 0.5));
  });
  // Every start, stop and correction goes through a short volume fade so nothing clicks.
  function audioLeadApplyGain(){ audioEl.volume = Math.max(0, Math.min(1, videoEl.volume * audioLeadGain)); }
  function audioLeadFade(to, ms, cb){
    clearInterval(audioLeadFadeTimer);
    audioLeadFadeTimer = null;
    audioLeadFadeTarget = to;
    const from = audioLeadGain, t0 = performance.now();
    audioLeadFadeTimer = setInterval(() => {
      const k = Math.min(1, (performance.now() - t0) / ms);
      audioLeadGain = from + (to - from) * k;
      audioLeadApplyGain();
      if (k >= 1){ clearInterval(audioLeadFadeTimer); audioLeadFadeTimer = null; if (cb) cb(); }
    }, 5);
  }
  function audioLeadKick(){
    if (audioLeadPlayPending) return;
    audioLeadPlayPending = true;
    resumeAudioCtx()
      .then(() => { if (audioLeadActive && !videoEl.paused) return audioEl.play(); })
      .catch(() => {})
      .finally(() => { audioLeadPlayPending = false; });
  }
  // Go silent and re-aim. Safe to call over and over (scrubbing, rapid skips): it just restarts the wait.
  function audioLeadResync(){
    if (!audioLeadActive) return;
    audioLeadState = 'syncing';
    audioLeadAimTries = 0;
    audioLeadStableSince = 0;
    audioLeadErrs.length = 0;
    if (audioLeadGain > 0.001 && !(audioLeadFadeTimer && audioLeadFadeTarget === 0)) audioLeadFade(0, 25);
  }
  function audioLeadLock(){
    audioLeadState = 'live';
    audioLeadErrs.length = 0;
    audioLeadHoldUntil = performance.now() + (audioLeadFixes.length ? 2500 : 800);
    audioLeadFade(1, 90);
  }
  function audioLeadStart(){
    const t = tracks[currentIndex];
    audioLeadActive = true;
    audioLeadUrl = t.url;
    if (audioLeadHandoffTimer){ clearTimeout(audioLeadHandoffTimer); audioLeadHandoffTimer = null; }   // returned quickly: keep the real mute state
    else audioLeadUserMuted = videoEl.muted;
    audioLeadPrevAudioMuted = audioEl.muted;
    try {
      ensureAudioCtx();
      getGraphFor('audio');
      applyEqAll();
      applyMasterBoostAll();
      applyTrackBoostToCurrentGraph();
    } catch (e){}
    if (audioEl.getAttribute('src') !== t.url) audioEl.src = t.url;
    audioEl.loop = false;
    audioLeadBias = 0; audioLeadFixes = [];
    audioLeadHoldUntil = 0; audioLeadStallAt = 0; audioLeadAudioStallAt = 0;
    audioLeadLat = netLatencyMs();
    clearInterval(audioLeadFadeTimer); audioLeadFadeTimer = null;
    audioLeadGain = 0; audioLeadFadeTarget = 0; audioLeadApplyGain();   // start silent, fade in once aimed
    audioEl.muted = audioLeadUserMuted;
    audioEl.playbackRate = videoEl.playbackRate;
    videoEl.muted = true;
    audioLeadState = 'syncing'; audioLeadAimTries = 0; audioLeadStableSince = 0; audioLeadErrs.length = 0;
  }
  // A different video was loaded while the lead was running: keep the picture muted the whole time
  // (no stop/start, so no burst of sound from the video element) and re-aim quietly.
  function audioLeadRetarget(){
    const t = tracks[currentIndex];
    audioLeadUrl = t.url;
    audioLeadBias = 0; audioLeadFixes = [];
    audioLeadHoldUntil = 0; audioLeadStallAt = 0; audioLeadAudioStallAt = 0;
    audioLeadLat = netLatencyMs();
    clearInterval(audioLeadFadeTimer); audioLeadFadeTimer = null;
    audioLeadGain = 0; audioLeadFadeTarget = 0; audioLeadApplyGain();
    audioEl.pause();
    if (audioEl.getAttribute('src') !== t.url) audioEl.src = t.url;
    audioEl.loop = false;
    audioEl.playbackRate = videoEl.playbackRate;
    videoEl.muted = true;
    audioLeadState = 'syncing'; audioLeadAimTries = 0; audioLeadStableSince = 0; audioLeadErrs.length = 0;
  }
  function audioLeadStop(){
    if (!audioLeadActive) return;
    audioLeadActive = false;
    clearInterval(audioLeadFadeTimer); audioLeadFadeTimer = null;
    audioLeadGain = 1; audioLeadFadeTarget = 1; audioLeadApplyGain();
    // Leaving the tab/app while playing: background-audio mode needs audioEl to keep playing. Pausing it
    // here (this runs just before that handoff) drops the media session and the handoff can then be
    // refused, so the sound never carries over. Leave it running, keep the picture muted so the two
    // don't overlap, and only restore things if the handoff doesn't happen.
    const handoff = document.hidden && isPlaying && !bgAudioActive &&
      document.pictureInPictureElement !== videoEl &&
      currentIndex !== -1 && tracks[currentIndex] && tracks[currentIndex].kind === 'video' &&
      audioEl.getAttribute('src') === audioLeadUrl;
    if (handoff){
      audioLeadHandoffAt = performance.now();
      audioEl.muted = audioLeadUserMuted;
      audioEl.playbackRate = videoEl.playbackRate;
      const um = audioLeadUserMuted, url = audioLeadUrl;
      clearTimeout(audioLeadHandoffTimer);
      audioLeadHandoffTimer = setTimeout(() => {
        audioLeadHandoffTimer = null;
        if (audioLeadActive) return;
        videoEl.muted = um;
        if (!bgAudioActive && !bgEnteringOp && media() !== audioEl && audioEl.getAttribute('src') === url) audioEl.pause();
      }, 2500);
      audioLeadUrl = null;
      return;
    }
    videoEl.muted = audioLeadUserMuted;
    audioEl.muted = audioLeadPrevAudioMuted;
    audioEl.playbackRate = videoEl.playbackRate;
    // Leave the audio element alone if something else (background mode, an audio track) took it over.
    if (!bgAudioActive && media() !== audioEl && audioEl.getAttribute('src') === audioLeadUrl) audioEl.pause();
    audioLeadUrl = null;
  }
  function audioLeadUpdate(){
    const want = audioLeadWanted();
    if (audioLeadActive){
      if (!want) audioLeadStop();
      else if (tracks[currentIndex].url !== audioLeadUrl) audioLeadRetarget();
    } else if (want){
      audioLeadStart();
    }
  }
  // Allowed drift before a correction. If we keep having to correct, the machine (heavy FX, busy page)
  // is the problem, not the sync, so tolerate more instead of chopping the sound over and over.
  function audioLeadDriftLimit(now){
    audioLeadFixes = audioLeadFixes.filter(t => now - t < 30000);
    return audioLeadFixes.length >= 2 ? 0.5 : 0.25;
  }
  function audioLeadTick(){
    if (!audioLeadActive || bgAudioActive) return;
    const now = performance.now();
    const gap = now - audioLeadLastTick;
    audioLeadLastTick = now;
    // A late tick means the page itself stalled (FX rebuild, GC, layout). Clocks measured across that
    // gap can't be trusted, so don't judge drift from them.
    if (gap > 400){ audioLeadErrs.length = 0; audioLeadHoldUntil = Math.max(audioLeadHoldUntil, now + 500); }
    // Latency slider moved: the target jumped on purpose, re-aim quietly.
    const lat = netLatencyMs();
    if (lat !== audioLeadLat){ audioLeadLat = lat; audioLeadResync(); }
    if (!audioLeadFadeTimer) audioLeadApplyGain();   // heal anything else that wrote audioEl.volume (slider, track load)
    // Keep the rate matched without nudging it (nudging crackles).
    const base = videoEl.playbackRate || 1;
    if (audioEl.playbackRate !== base) audioEl.playbackRate = base;

    const vPaused = videoEl.paused || videoEl.ended;
    if (vPaused || videoEl.seeking){
      audioLeadStallAt = 0; audioLeadAudioStallAt = 0;
      if (audioLeadState === 'live') audioLeadResync();
      audioLeadStableSince = 0; audioLeadAimTries = 0;
      // Park the audio once it has faded out.
      if (audioLeadGain <= 0.001 && !audioLeadFadeTimer && !audioEl.paused) audioEl.pause();
      return;
    }
    const d = audioEl.duration;
    const atTail = isFinite(d) && videoEl.currentTime + netLatencyMs() / 1000 >= d - 0.3;
    if (atTail) return;   // the sound legitimately runs out slightly before the picture does

    if (audioLeadState === 'syncing'){
      if (videoEl.readyState < 3){
        audioLeadStableSince = 0; audioLeadAimTries = 0;
        if (audioLeadGain <= 0.001 && !audioLeadFadeTimer && !audioEl.paused) audioEl.pause();
        return;
      }
      if (audioEl.paused){
        if (!audioEl.seeking) audioLeadAim();
        audioLeadKick();
        audioLeadStableSince = 0;
        return;
      }
      if (audioEl.seeking || audioEl.readyState < 3){ audioLeadStableSince = 0; return; }
      if (!audioLeadStableSince){ audioLeadStableSince = now; return; }
      if (now - audioLeadStableSince < 250) return;   // let it play a moment, silently, so the measurement is real
      const err = audioEl.currentTime - audioLeadTarget() - audioLeadBias;
      if (Math.abs(err) > 0.15 && audioLeadAimTries < 3){
        audioLeadAimTries++;
        audioLeadAim();
        audioLeadStableSince = 0;
        return;
      }
      // Still off after a few clean tries: it's a steady offset from the audio path (FX, output latency),
      // not a bad seek. Accept it as the baseline instead of fighting it.
      if (Math.abs(err) > 0.15) audioLeadBias = Math.max(-0.6, Math.min(0.6, audioLeadBias + err));
      audioLeadLock();
      return;
    }

    // ---- live ----
    if (videoEl.readyState < 3){
      if (!audioLeadStallAt) audioLeadStallAt = now;
      if (now - audioLeadStallAt > 300) audioLeadResync();   // picture is stuck: stop the sound too, restart together
      return;
    }
    audioLeadStallAt = 0;
    if (audioEl.paused || audioEl.ended){ audioLeadResync(); return; }
    if (audioEl.seeking || audioEl.readyState < 2){
      if (!audioLeadAudioStallAt) audioLeadAudioStallAt = now;
      if (now - audioLeadAudioStallAt > 400) audioLeadResync();
      return;
    }
    audioLeadAudioStallAt = 0;
    if (now < audioLeadHoldUntil) return;
    if (now - audioLeadLastSample < 120) return;
    audioLeadLastSample = now;
    audioLeadErrs.push(audioEl.currentTime - audioLeadTarget() - audioLeadBias);
    if (audioLeadErrs.length > 6) audioLeadErrs.shift();
    if (audioLeadErrs.length < 6) return;
    // Judge the median of ~0.7 s of samples, so a single odd reading never triggers anything.
    const sorted = audioLeadErrs.slice().sort((a, b) => a - b);
    const med = (sorted[2] + sorted[3]) / 2;
    if (Math.abs(med) > audioLeadDriftLimit(now)){
      audioLeadFixes.push(now);
      audioLeadResync();
    }
  }
  (function leadPoll(){
    setTimeout(() => {
      if (audioLeadOn || audioLeadActive){
        const was = audioLeadActive;
        audioLeadUpdate();
        if (was !== audioLeadActive) refreshVideoDelayState();
        audioLeadTick();
      }
      leadPoll();
    }, (audioLeadOn || audioLeadActive) ? 150 : 1000);
  })();
  ['play', 'playing', 'pause', 'waiting', 'ratechange'].forEach(ev => videoEl.addEventListener(ev, audioLeadTick));
  // The moment a skip/seek begins, go quiet and wait for it to finish; don't chase the picture around.
  videoEl.addEventListener('seeking', () => { if (audioLeadActive) audioLeadResync(); });
  // New source (track skip): quiet immediately, before the old audio can play against the new picture.
  ['loadstart', 'emptied'].forEach(ev => videoEl.addEventListener(ev, () => {
    if (audioLeadActive){ audioLeadUpdate(); if (audioLeadActive) audioLeadResync(); }
    refreshVideoDelayState();
  }));
  videoEl.addEventListener('loadedmetadata', () => { if (audioLeadActive) audioLeadResync(); refreshVideoDelayState(); });
  document.addEventListener('visibilitychange', () => refreshVideoDelayState());
  // The mute button flips videoEl.muted; while it is held muted for audio lead, treat that as the user's mute toggle.
  videoEl.addEventListener('volumechange', () => {
    if (!audioLeadActive || videoEl.muted) return;
    audioLeadUserMuted = !audioLeadUserMuted;
    audioEl.muted = audioLeadUserMuted;
    videoEl.muted = true;
  });
  const LOSSLESS_LAT_KEY = 'playerLosslessLatency';
  let losslessLatency = false; // delay-only: skip the GPU engine so the worker captures every frame from the video track
  try { if (localStorage.getItem(LOSSLESS_LAT_KEY) === '1') losslessLatency = true; } catch (e){}
  const LOSSLESS_Q_KEY = 'playerLosslessQuality';
  let losslessQuality = 'auto'; // 'auto' or a max stored frame width in px
  try { const q = localStorage.getItem(LOSSLESS_Q_KEY); if (q === '640' || q === '1280' || q === '1920' || q === '3840') losslessQuality = q; } catch (e){}
  try { if (localStorage.getItem(MEMC_DELAY_KEY) === '0') memcDelayGL = false; } catch (e){}
  let memcActive = false, memcRunning = false, memcFailed = false, memcFailWhy = '', memcBypass = false;
  // Video decoding / performance: 'off' | 'auto' | 'light'. Light mode drops the extras that
  // compete with the decoder for GPU/CPU (picture filters, motion smoothing, UI animation).
  const PERF_KEY = 'playerPerfModeV1';
  let perfMode = 'off', perfAutoTripped = false;
  try { const pm = localStorage.getItem(PERF_KEY); if (pm === 'auto' || pm === 'light') perfMode = pm; } catch (e){}
  function perfLightActive(){ return perfMode === 'light' || (perfMode === 'auto' && perfAutoTripped); }
  let memcLEff = null, memcLEffAt = 0, memcLastTT = -Infinity; // eased delay + last shown media time (smooth latency changes)
  let memcLastDrawMs = 0;
  let memcPrevSlot = null, memcLastUniqT = null, memcUDts = [];   // held-frame (duplicate) detection
  let memcDupOff = false, memcDupBuf = null, memcDupFbo = null, memcDupTex = null, memcDupMs = 0, memcDupN = 0;
  let memcExtraSec = 0;   // extra picture lag added by interpolation (subtitles follow it)
  let memcGL = null, memcProgs = null, memcSrcTex = null, memcSrcMip = false;
  let memcRing = [], memcRingW = 0, memcRingH = 0, memcWrite = 0, memcSeq = 0, memcPrevSeq = 0, memcResKey = '';
  let memcLuma = [], memcMvRaw = null, memcMvRef = null, memcFloatOk = false, memcUniqSlot = null, memcAna = null, memcLumaIdx = 0, memcPrevLumaValid = false;
  let memcDts = [], memcPeriod = 1 / 30, memcPeriodN = 0, memcLastT = null, memcOffMs = 0, memcOffValid = false, memcLastKey = '';
  let memcVfcId = null, memcRafId = null;
  let latencyPresetMs = 150; // a saved value the latency-preset button toggles the slider to/from, e.g. one earbud's known Bluetooth delay
  const SUBTITLE_KEY = 'playerSubtitles';
  const SUBTITLE_FONTS = {
    default: "'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif",
    serif: "Georgia, 'Times New Roman', serif",
    mono: "'Courier New', ui-monospace, monospace",
    arial: "Arial, Helvetica, sans-serif",
    condensed: "'Arial Narrow', 'Roboto Condensed', 'Helvetica Neue Condensed', 'Franklin Gothic Medium Cond', sans-serif-condensed, Arial, sans-serif",
    impact: "Impact, 'Haettenschweiler', 'Arial Narrow Bold', sans-serif",
    casual: "'Comic Sans MS', 'Chalkboard SE', 'Comic Neue', cursive"
  };

  let sleepTimer = { mode: 'off', endAt: null, intervalId: null };

  // Playback position memory: remembers where you left off in each track
  // (by dbId) so switching away and coming back - or reloading - picks up
  // where you stopped instead of from the beginning. On by default; the
  // toggle in Settings turns it off for anyone who'd rather every track
  // always start fresh.
  let rememberPlaybackPosition = true;
  let playbackPositionSaveIntervalMs = 1000; // how often the position is saved during playback
  const PLAYBACK_POSITION_KEY = 'playerPlaybackPositions';

  // ---------- Persistence (IndexedDB for bytes, localStorage for metadata) ----------
  // Local file bytes go in IndexedDB since localStorage is far too small for
  // audio/video; playlist metadata (title, artist, kind, duration) is tiny
  // JSON that goes in localStorage so it's simple to read back on load.
  const PLAYLIST_KEY = 'playerPlaylistMeta';
  const SETTINGS_KEY = 'playerSettings';

