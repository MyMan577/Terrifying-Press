  // ---------- Media Session (lock-screen controls + background playback hint) ----------
  if ('mediaSession' in navigator){
    navigator.mediaSession.setActionHandler('play', () => { if (!isPlaying) togglePlay(); });
    navigator.mediaSession.setActionHandler('pause', () => { if (isPlaying) togglePlay(); });
    navigator.mediaSession.setActionHandler('previoustrack', () => prevBtn.click());
    navigator.mediaSession.setActionHandler('nexttrack', () => nextBtn.click());
    try {
      navigator.mediaSession.setActionHandler('seekto', (details) => {
        if (details.seekTime == null) return;
        media().currentTime = details.seekTime;
      });
    } catch(e) { /* seekto not supported in this browser */ }
  }
  // Videos play in the WebView, which has no media notification of its own. Mirror their state into the native
  // media session so the notification (and its play/pause/seek/next/prev) exists for videos like it does for audio.
  function ppMirrorSync(){
    const P = window.PPNative; if (!P || !P.mirror) return;
    const t = currentIndex !== -1 ? tracks[currentIndex] : null;
    if (!t || t.kind !== 'video' || (P.active && P.active())){ P.mirror(null); return; }
    const m = media();
    let dur = (m && isFinite(m.duration) && m.duration > 0) ? m.duration : (isFinite(videoEl.duration) ? videoEl.duration : 0);
    P.mirror({ track: t, playing: !!isPlaying, posMs: Math.round(((m && m.currentTime) || 0) * 1000),
               durMs: Math.round((dur || 0) * 1000), rate: playbackSpeed || 1 });
  }
  let ppMirrorTimer = 0;
  function ppMirrorSoon(){ clearTimeout(ppMirrorTimer); ppMirrorTimer = setTimeout(() => { try { ppMirrorSync(); } catch(e){} }, 250); }
  ['loadedmetadata', 'durationchange', 'seeked', 'ratechange'].forEach(ev => videoEl.addEventListener(ev, ppMirrorSoon));
  [bgPlainEl, bgFxEl].forEach(el => ['seeked', 'ratechange'].forEach(ev => el.addEventListener(ev, ppMirrorSoon)));

  function updateMediaSession(){
    try { ppMirrorSync(); } catch(e){}
    if (!('mediaSession' in navigator) || currentIndex === -1) return;
    const t = tracks[currentIndex];
    if (window.PPNative) PPNative.updateMeta(t);
    navigator.mediaSession.metadata = new MediaMetadata({
      title: t.title,
      artist: t.artist,
      artwork: t.artUrl ? [{ src: t.artUrl, sizes: '512x512', type: 'image/jpeg' }] : []
    });
    navigator.mediaSession.playbackState = isPlaying ? 'playing' : 'paused';
  }

  // ---------- Playback speed ----------
  // Rewriting audioEl/videoEl.playbackRate on every 'input' tick while the
  // slider is being dragged (which can fire dozens of times per second)
  // makes the browser's audio pipeline briefly stutter on each change,
  // since both elements are wired into a Web Audio graph (EQ/booster/
  // visualizer) - that's what produces the crackling, regardless of which
  // speed you land on. rAF-throttle the actual playbackRate write so it
  // happens at most once per frame no matter how fast 'input' fires; the
  // label/slider fill still update immediately so the UI feels responsive.
  let pendingSpeedRAF = null;
  function applySpeed(){
    const label = (Math.round(playbackSpeed * 100) / 100) + 'x';
    speedLabel.textContent = label;
    speedDropdownValue.textContent = label;
    speedSlider.value = playbackSpeed;
    const pct = ((playbackSpeed - SPEED_MIN) / (SPEED_MAX - SPEED_MIN)) * 100;
    speedSlider.style.setProperty('--speed-pct', pct + '%');

    if (pendingSpeedRAF) return; // a write for this frame is already queued
    pendingSpeedRAF = requestAnimationFrame(() => {
      pendingSpeedRAF = null;
      if (audioEl.playbackRate !== playbackSpeed) audioEl.playbackRate = playbackSpeed;
      if (bgEl.playbackRate !== playbackSpeed) bgEl.playbackRate = playbackSpeed;
      if (videoEl.playbackRate !== playbackSpeed) videoEl.playbackRate = playbackSpeed;
    });
  }
  function setSpeedTo(v){
    playbackSpeed = Math.min(SPEED_MAX, Math.max(SPEED_MIN, Math.round(v * 100) / 100));
    applySpeed();
    saveSettings();
    if (typeof showToast === 'function') showToast('Speed: ' + playbackSpeed + 'x');
  }
  function stepSpeed(delta){ setSpeedTo(playbackSpeed + delta); }
  speedBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    const opening = !speedDropdown.classList.contains('open');
    speedDropdown.classList.toggle('open');
    speedBtn.setAttribute('aria-expanded', opening ? 'true' : 'false');
    clampDropdownToViewport(speedDropdown);
  });
  speedDropdown.addEventListener('click', (e) => e.stopPropagation());
  document.addEventListener('click', () => {
    speedDropdown.classList.remove('open');
    speedBtn.setAttribute('aria-expanded', 'false');
  });
  speedSlider.addEventListener('input', () => {
    playbackSpeed = parseFloat(speedSlider.value);
    applySpeed();
  });
  // Persist only once the drag settles (native 'change' fires on release),
  // instead of hitting localStorage synchronously on every 'input' tick -
  // that extra main-thread work while dragging was adding to the crackle.
  speedSlider.addEventListener('change', () => {
    saveSettings();
  });
  speedResetBtn.addEventListener('click', () => {
    playbackSpeed = 1;
    applySpeed();
    saveSettings();
    refreshSpeedPresetUI();
  });

  // "Pitch follows speed": like a record or tape, slower is lower and faster is higher. Off = speed changes keep
  // the original pitch. In the app the audio element is a facade over ExoPlayer, which gets the same setting.
  let pitchFollowsSpeed = false;
  try { pitchFollowsSpeed = localStorage.getItem('ppPitchFollow') === '1'; } catch(e){}
  const speedPitchToggle = document.getElementById('speed-pitch-follow');
  const speedPresetSeg = document.getElementById('speed-preset-seg');
  function applyPitchMode(){
    [audioEl, videoEl, bgPlainEl, bgFxEl].forEach(el => { try { el.preservesPitch = !pitchFollowsSpeed; } catch(e){} });
    speedPitchToggle.checked = pitchFollowsSpeed;
  }
  function setPitchFollows(on){
    pitchFollowsSpeed = !!on;
    try { localStorage.setItem('ppPitchFollow', pitchFollowsSpeed ? '1' : '0'); } catch(e){}
    applyPitchMode();
  }
  // One-tap sounds. Each sets speed, pitch mode and reverb together. The reverb you had before a preset is kept
  // and put back by the next preset that does not use reverb.
  const SPEED_PRESETS = {
    slowed:    { speed: 0.85, follow: true,  reverb: 0.4 },
    nightcore: { speed: 1.25, follow: true,  reverb: null },
    normal:    { speed: 1,    follow: false, reverb: null }
  };
  function activeSpeedPreset(){
    for (const k in SPEED_PRESETS){
      const p = SPEED_PRESETS[k];
      if (Math.abs(playbackSpeed - p.speed) < 0.005 && pitchFollowsSpeed === p.follow && (p.reverb == null || Math.abs(reverbMix - p.reverb) < 0.03)) return k;
    }
    return '';
  }
  function refreshSpeedPresetUI(){
    const cur = activeSpeedPreset();
    speedPresetSeg.querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.v === cur));
  }
  function applySpeedPreset(name){
    const p = SPEED_PRESETS[name]; if (!p) return;
    let prev = null;
    try { const v = localStorage.getItem('ppPresetPrevReverb'); if (v != null) prev = parseFloat(v); } catch(e){}
    if (p.reverb != null){
      if (prev == null){ try { localStorage.setItem('ppPresetPrevReverb', String(reverbMix)); } catch(e){} }
      reverbMix = p.reverb;
    } else if (prev != null && isFinite(prev)){
      reverbMix = Math.max(0, Math.min(1, prev));
      try { localStorage.removeItem('ppPresetPrevReverb'); } catch(e){}
    }
    refreshFxUI();
    applyFxAll();
    setPitchFollows(p.follow);
    playbackSpeed = p.speed;
    applySpeed();
    saveSettings();
    refreshSpeedPresetUI();
    showToast(name === 'slowed' ? 'Slowed + reverb' : name === 'nightcore' ? 'Nightcore' : 'Normal speed and pitch');
  }
  // ---- per-song sound: a song can keep its own speed, pitch mode and reverb ----
  // songSound[dbId] = { s: speed, f: pitch follows speed, r: reverb }. While such a song is loaded, the values
  // every other song uses are parked in songSoundBase (also kept in localStorage, so closing the app on that song
  // cannot turn its sound into the default for everything).
  const speedSongRemember = document.getElementById('speed-song-remember');
  let songSound = {}, songSoundBase = null, songSoundBooted = false;
  try { songSound = JSON.parse(localStorage.getItem('ppSongSound') || '{}') || {}; } catch(e){ songSound = {}; }
  function songSoundSave(){ try { localStorage.setItem('ppSongSound', JSON.stringify(songSound)); } catch(e){} }
  function songSoundSetBase(b){
    songSoundBase = b;
    try { if (b) localStorage.setItem('ppSongSoundBase', JSON.stringify(b)); else localStorage.removeItem('ppSongSoundBase'); } catch(e){}
  }
  function songSoundNow(){ return { s: playbackSpeed, f: pitchFollowsSpeed, r: Math.round(reverbMix * 100) / 100 }; }
  function songSoundApply(o){
    if (!o) return;
    if (typeof o.s === 'number' && o.s >= SPEED_MIN && o.s <= SPEED_MAX) playbackSpeed = o.s;
    if (typeof o.r === 'number' && o.r >= 0 && o.r <= 1 && Math.abs(o.r - reverbMix) > 0.001){ reverbMix = o.r; try { refreshFxUI(); applyFxAll(); } catch(e){} }
    if (!!o.f !== pitchFollowsSpeed) setPitchFollows(!!o.f);
  }
  function songSoundCapture(t){ if (t && songSound[t.dbId]){ songSound[t.dbId] = songSoundNow(); songSoundSave(); } }
  // Called by loadTrack just before the speed is applied.
  function songSoundSwitch(prev, next){
    if (!songSoundBooted){
      songSoundBooted = true;
      try { const b = JSON.parse(localStorage.getItem('ppSongSoundBase') || 'null'); if (b){ songSoundBase = null; songSoundApply(b); localStorage.removeItem('ppSongSoundBase'); } } catch(e){}
    } else if (prev && prev !== next) songSoundCapture(prev);   // keep whatever was changed while it played
    const o = next ? songSound[next.dbId] : null;
    if (o){
      if (!songSoundBase) songSoundSetBase(songSoundNow());
      songSoundApply(o);
    } else if (songSoundBase){
      const b = songSoundBase; songSoundSetBase(null); songSoundApply(b);
    }
    speedSongRemember.checked = !!o;
    speedSongRemember.disabled = !next;
    refreshSpeedPresetUI();
  }
  speedSongRemember.addEventListener('change', () => {
    const t = currentIndex !== -1 ? tracks[currentIndex] : null;
    if (!t){ speedSongRemember.checked = false; return; }
    if (speedSongRemember.checked){
      songSound[t.dbId] = songSoundNow();
      // Other songs go back to normal speed and pitch, with the reverb from before a preset if one changed it.
      let r = reverbMix; try { const v = localStorage.getItem('ppPresetPrevReverb'); if (v != null && isFinite(parseFloat(v))){ r = parseFloat(v); localStorage.removeItem('ppPresetPrevReverb'); } } catch(e){}
      if (!songSoundBase) songSoundSetBase({ s: 1, f: false, r });
      showToast('This song will always open with this speed, pitch and reverb');
    } else {
      delete songSound[t.dbId];
      if (songSoundBase){ const b = songSoundBase; songSoundSetBase(null); songSoundApply(b); applySpeed(); saveSettings(); refreshSpeedPresetUI(); }
      showToast('This song plays like the others again');
    }
    songSoundSave();
  });
  const songSoundTouched = () => { if (currentIndex !== -1) songSoundCapture(tracks[currentIndex]); };
  speedSlider.addEventListener('change', songSoundTouched);
  speedResetBtn.addEventListener('click', songSoundTouched);
  speedPresetSeg.addEventListener('click', () => setTimeout(songSoundTouched, 0));
  speedPitchToggle.addEventListener('change', () => { setPitchFollows(speedPitchToggle.checked); refreshSpeedPresetUI(); songSoundTouched(); });
  speedPresetSeg.addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) applySpeedPreset(b.dataset.v); });
  speedSlider.addEventListener('change', refreshSpeedPresetUI);
  applyPitchMode();
  setTimeout(refreshSpeedPresetUI, 1500);   // after saved settings (speed, reverb) have been restored

  // ---------- A/B loop ----------
  function updateABMarkers(){
    const dur = media().duration;
    if (!isFinite(dur) || dur <= 0){
      abMarkerA.classList.remove('on');
      abMarkerB.classList.remove('on');
      return;
    }
    if (abLoop.a != null){
      abMarkerA.style.left = (abLoop.a/dur*100) + '%';
      abMarkerA.classList.add('on');
    } else abMarkerA.classList.remove('on');
    if (abLoop.b != null){
      abMarkerB.style.left = (abLoop.b/dur*100) + '%';
      abMarkerB.classList.add('on');
    } else abMarkerB.classList.remove('on');
  }
  function setABLabel(){
    if (abLoop.a == null) { abLoopLabel.textContent = 'A-B'; abLoopBtn.title = 'Set loop point A'; }
    else if (abLoop.b == null) { abLoopLabel.textContent = 'A-B'; abLoopBtn.title = 'Set loop point B'; }
    else { abLoopLabel.textContent = 'A-B'; abLoopBtn.title = 'Looping, click to clear'; }
    abLoopBtn.classList.toggle('toggled', abLoop.a != null);
  }
  abLoopBtn.addEventListener('click', () => {
    if (currentIndex === -1) return;
    const t = media().currentTime;
    if (abLoop.a == null){
      abLoop = { a: t, b: null };
    } else if (abLoop.b == null){
      if (t <= abLoop.a){ abLoop = { a: null, b: null }; }
      else { abLoop.b = t; }
    } else {
      abLoop = { a: null, b: null };
    }
    saveABLoop(tracks[currentIndex].dbId, abLoop.a != null && abLoop.b != null ? abLoop : null);
    setABLabel();
    updateABMarkers();
  });

  // ---------- Sleep timer ----------
  function clearSleepTimer(){
    if (sleepTimer.intervalId) clearInterval(sleepTimer.intervalId);
    sleepTimer = { mode: 'off', endAt: null, intervalId: null };
    sleepLabel.textContent = 'Sleep';
    sleepBtn.classList.remove('toggled');
    syncAudioLoop();
  }
  function tickSleepLabel(){
    if (sleepTimer.mode === 'track'){
      sleepLabel.textContent = 'End of track';
      return;
    }
    if (!sleepTimer.endAt) return;
    const remaining = Math.max(0, sleepTimer.endAt - Date.now());
    const mins = Math.floor(remaining/60000);
    const secs = Math.floor((remaining%60000)/1000).toString().padStart(2,'0');
    sleepLabel.textContent = `${mins}:${secs}`;
    if (remaining <= 0){
      cancelResumeOnReturn();   // stopped on purpose: must not restart when the app comes back to the foreground
      audioEl.pause();
      videoEl.pause();
      bgPlainEl.pause();        // background sound is carried by these, not audioEl
      bgFxEl.pause();
      isPlaying = false;
      updatePlayIcon();
      clearSleepTimer();
    }
  }
  function startSleepTimer(minutes){
    if (sleepTimer.intervalId) clearInterval(sleepTimer.intervalId);
    sleepTimer.mode = 'duration';
    sleepTimer.endAt = Date.now() + minutes*60000;
    sleepBtn.classList.add('toggled');
    tickSleepLabel();
    sleepTimer.intervalId = setInterval(tickSleepLabel, 1000);
    syncAudioLoop();
  }
  function startSleepAtEndOfTrack(){
    if (sleepTimer.intervalId) clearInterval(sleepTimer.intervalId);
    sleepTimer.mode = 'track';
    sleepTimer.endAt = null;
    sleepBtn.classList.add('toggled');
    tickSleepLabel();
    syncAudioLoop();   // the song must really end for this timer, so it may not loop
  }
  sleepBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    sleepDropdown.classList.toggle('open');
    clampDropdownToViewport(sleepDropdown);
  });
  sleepDropdown.addEventListener('click', (e) => e.stopPropagation());
  document.addEventListener('click', () => sleepDropdown.classList.remove('open'));
  sleepDropdown.querySelectorAll('button[data-sleep]').forEach(btn => {
    btn.addEventListener('click', () => {
      sleepDropdown.classList.remove('open');
      const val = btn.dataset.sleep;
      if (val === 'off') clearSleepTimer();
      else if (val === 'track') startSleepAtEndOfTrack();
      else startSleepTimer(parseInt(val, 10));
    });
  });

  // ---------- Equalizer UI ----------
  // 6-band peaking EQ. Frequencies chosen to spread evenly (log-ish) across
  // the range that matters for music, with a wide-ish Q so bands blend
  // instead of leaving audible notches/peaks between them.
  // The last two bands (500Hz, 6K) are a Level 6 unlock - they always exist
  // in the graph/preset data (so nothing about the audio chain needs to be
  // rebuilt when they unlock), but their slider is hidden via the `pro`
  // flag until then, and every non-pro preset leaves them at 0 (no effect)
  // so a base-tier listener never hears them regardless.
  // 10-band EQ. Older 8-value presets/saves get a 31 Hz band and a 16K band added at half the gain of their neighbour.
  window.__ppEqNorm = function(a){
    if (!Array.isArray(a)) return new Array(10).fill(0);
    if (a.length === 10) return a.slice();
    if (a.length !== 8) return new Array(10).fill(0);
    const h = v => Math.round(v * 0.5 * 2) / 2;
    return [h(a[0])].concat(a, [h(a[7])]);
  };
  const EQ_BANDS = [
    { freq: 31,    label: '31' },
    { freq: 60,    label: '60' },
    { freq: 170,   label: '170' },
    { freq: 350,   label: '350' },
    { freq: 500,   label: '500',  pro: true, proLevel: 6 },
    { freq: 1000,  label: '1K' },
    { freq: 3500,  label: '3.5K' },
    { freq: 6000,  label: '6K',   pro: true, proLevel: 6 },
    { freq: 10000, label: '10K' },
    { freq: 16000, label: '16K' }
  ];
  const EQ_PRESETS = {
    flat:       [0, 0, 0, 0, 0, 0, 0, 0],
    bass:       [6, 4.5, 1.5, 0, 0, -1, 0, -1.5],
    treble:     [-1.5, -1, 0, 0, 1.5, 4, 0, 6],
    vocal:      [-2, -1, 2, 0, 4, 2, 0, -1],
    vshape:     [5, 2.5, -2, 0, -2, 2.5, 0, 5],
    acoustic:   [3, 2, 1, 0, 1.5, 2.5, 0, 1.5],
    pop:        [-1, 1, 3, 0, 3, 1, 0, -1],
    rock:       [4, 2.5, -1, 0, -1, 2, 0, 3.5],
    jazz:       [2.5, 1.5, -1, 0, 1, 2, 0, 2.5],
    classical:  [2, 1, 0, 0, 0.5, 1.5, 0, 3],
    electronic: [5, 3.5, -1.5, 0, 1.5, 1.5, 0, 4],
    hiphop:     [6, 4, 0.5, 0, -1, 1, 0, 2],
    loudness:   [5, 3, -2, 0, 0, 3, 0, 5],
    podcast:    [-4, -2, 2, 0, 5, 3, 0, -2],
    latenight:  [-3, -1.5, 0, 0, 1, -1, 0, -3]
  };
  Object.keys(EQ_PRESETS).forEach(k => { EQ_PRESETS[k] = window.__ppEqNorm(EQ_PRESETS[k]); });
  let eqGains = EQ_PRESETS.flat.slice();
  let eqEnabled = false;
  let trackEqOverrideActive = false; // when true, eqGains/eqEnabled above are this track's own, not the universal ones
  let globalEqGains = EQ_PRESETS.flat.slice(); // universal ("all songs") EQ, kept aside while an override is active
  let globalEqEnabled = false;
  const TRACK_EQ_KEY = 'playerTrackEq';

  function loadTrackEqOverrides(){
    try { return JSON.parse(localStorage.getItem(TRACK_EQ_KEY)) || {}; }
    catch(e){ return {}; }
  }
  function saveTrackEqOverride(dbId, override){
    const all = loadTrackEqOverrides();
    if (override == null) delete all[dbId];
    else all[dbId] = override;
    try { localStorage.setItem(TRACK_EQ_KEY, JSON.stringify(all)); } catch(e){}
  }
  function getSavedTrackEqOverride(dbId){
    const v = loadTrackEqOverrides()[dbId];
    return (v && Array.isArray(v.gains)) ? v : null;
  }

