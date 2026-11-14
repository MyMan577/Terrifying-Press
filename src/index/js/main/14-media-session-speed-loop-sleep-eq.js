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
    setPitchSemis(0, true);
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
  // Pitch slider: shifts the pitch by semitones without changing the speed (on top of "Pitch follows speed").
  // The native player does the shifting; the app's audio element passes it on through ppPitch.
  let pitchSemis = 0;
  try { pitchSemis = parseFloat(localStorage.getItem('ppPitchSemis')) || 0; } catch(e){}
  const pitchSlider = document.getElementById('pitch-slider'), pitchValue = document.getElementById('pitch-dropdown-value');
  function applyPitchShift(){
    pitchSemis = Math.max(-12, Math.min(12, Math.round(pitchSemis * 2) / 2));
    const f = Math.pow(2, pitchSemis / 12);
    [audioEl, videoEl, bgPlainEl, bgFxEl].forEach(el => { try { if (el && el.ppPitch !== f) el.ppPitch = f; } catch(e){} });
    pitchSlider.value = pitchSemis;
    pitchValue.textContent = pitchSemis ? (pitchSemis > 0 ? '+' : '-') + Math.abs(pitchSemis) + ' st' : '0';
    pitchSlider.style.setProperty('--pitch-pct', ((pitchSemis + 12) / 24 * 100) + '%');
  }
  function setPitchSemis(v, save){
    pitchSemis = +v || 0; applyPitchShift();
    if (save){ try { localStorage.setItem('ppPitchSemis', String(pitchSemis)); } catch(e){} }
  }
  pitchSlider.addEventListener('input', () => setPitchSemis(pitchSlider.value, false));
  pitchSlider.addEventListener('change', () => { setPitchSemis(pitchSlider.value, true); refreshSpeedPresetUI(); });
  pitchSlider.addEventListener('dblclick', () => { setPitchSemis(0, true); refreshSpeedPresetUI(); });
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
      if (Math.abs(playbackSpeed - p.speed) < 0.005 && pitchFollowsSpeed === p.follow && !pitchSemis && (p.reverb == null || Math.abs(reverbMix - p.reverb) < 0.03)) return k;
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
    setPitchSemis(0, true);
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
  function songSoundNow(){ return { s: playbackSpeed, f: pitchFollowsSpeed, r: Math.round(reverbMix * 100) / 100, p: pitchSemis }; }
  function songSoundApply(o){
    if (!o) return;
    if (typeof o.s === 'number' && o.s >= SPEED_MIN && o.s <= SPEED_MAX) playbackSpeed = o.s;
    if (typeof o.r === 'number' && o.r >= 0 && o.r <= 1 && Math.abs(o.r - reverbMix) > 0.001){ reverbMix = o.r; try { refreshFxUI(); applyFxAll(); } catch(e){} }
    if (!!o.f !== pitchFollowsSpeed) setPitchFollows(!!o.f);
    const p = typeof o.p === 'number' ? o.p : 0; if (p !== pitchSemis) setPitchSemis(p, true);
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
  pitchSlider.addEventListener('change', songSoundTouched);
  speedPresetSeg.addEventListener('click', () => setTimeout(songSoundTouched, 0));
  speedPitchToggle.addEventListener('change', () => { setPitchFollows(speedPitchToggle.checked); refreshSpeedPresetUI(); songSoundTouched(); });
  speedPresetSeg.addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) applySpeedPreset(b.dataset.v); });
  speedSlider.addEventListener('change', refreshSpeedPresetUI);
  applyPitchMode();
  applyPitchShift();
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
  // ---------- A-B loop ----------
  // Tapping A-B opens its panel: set A and B where the song is (and nudge them), repeat forever or a set number of
  // times (then it plays on), an optional pause between repeats, a lead-in before A, and a practice ramp that starts
  // slower and speeds up a step each repeat until normal speed. Options are kept for every song; the points per song.
  const abDropdown = document.getElementById('ab-dropdown');
  const AB_OPTS_KEY = 'ppABOpts';
  let abOpts = { count: 0, gap: 0, pre: 0, ramp: 0 };
  try { Object.assign(abOpts, JSON.parse(localStorage.getItem(AB_OPTS_KEY) || '{}')); } catch(e){}
  const AB_FIELDS = [['ab-count', 'count', 1, 999], ['ab-gap', 'gap', 0, 60], ['ab-pre', 'pre', 0, 30], ['ab-ramp', 'ramp', 10, 100]];
  const abRun = { key: '', done: 0, finished: false, waiting: false, rampBase: null };
  function abFmt(t){ if (t == null) return '-'; const m = Math.floor(t / 60), x = t - m * 60; return m + ':' + (x < 10 ? '0' : '') + x.toFixed(1); }
  function abResetRun(){
    if (abRun.rampBase != null){ playbackSpeed = abRun.rampBase; applySpeed(); }
    abRun.done = 0; abRun.finished = false; abRun.waiting = false; abRun.rampBase = null;
  }
  function abRampSpeed(){            // practice: from the chosen % up to the normal speed in steps of a few %
    if (!abOpts.ramp || abLoop.a == null || abLoop.b == null) return;
    if (abRun.rampBase == null) abRun.rampBase = playbackSpeed;
    const steps = abOpts.count ? Math.max(1, abOpts.count - 1) : 8;
    const f = Math.min(1, abOpts.ramp + (1 - abOpts.ramp) * abRun.done / steps);
    playbackSpeed = Math.round(abRun.rampBase * f * 100) / 100; applySpeed();
  }
  function setABLabel(){
    const both = abLoop.a != null && abLoop.b != null;
    if (abLoop.a == null) abLoopBtn.title = 'A-B loop';
    else if (abLoop.b == null) abLoopBtn.title = 'Set loop point B';
    else abLoopBtn.title = 'Looping A-B';
    abLoopLabel.textContent = both && abOpts.count ? 'A-B ' + Math.min(abRun.done + 1, abOpts.count) + '/' + abOpts.count : 'A-B';
    abLoopBtn.classList.toggle('toggled', abLoop.a != null);
    paintABPanel();
  }
  function paintABPanel(){
    if (!abDropdown) return;
    document.getElementById('ab-a-time').textContent = abFmt(abLoop.a);
    document.getElementById('ab-b-time').textContent = abFmt(abLoop.b);
    abDropdown.querySelectorAll('.pp-dd-nudge').forEach(n => n.querySelectorAll('button').forEach(b => { b.disabled = abLoop[n.dataset.pt] == null; }));
    AB_FIELDS.forEach(([id, k]) => {
      const el = document.getElementById(id); if (document.activeElement === el) return;
      const v = abOpts[k]; el.value = !v ? '' : k === 'ramp' ? Math.round(v * 100) : v;
    });
    const st = document.getElementById('ab-status'), both = abLoop.a != null && abLoop.b != null;
    st.textContent = !both ? (abLoop.a == null ? 'Set A, then B.' : 'Now set B.')
      : abRun.finished ? 'Done: playing on. Seek back before A to loop again.'
      : 'Looping ' + (abLoop.b - abLoop.a).toFixed(1) + ' s' + (abOpts.count ? ', repeat ' + Math.min(abRun.done + 1, abOpts.count) + ' of ' + abOpts.count : '') + (abOpts.ramp ? ', at ' + Math.round(playbackSpeed * 100) + '%' : '') + '.';
  }
  function abSaveLoop(){
    if (currentIndex === -1) return;
    saveABLoop(tracks[currentIndex].dbId, abLoop.a != null && abLoop.b != null ? abLoop : null);
    setABLabel(); updateABMarkers();
  }
  function abSet(pt){
    if (currentIndex === -1) return;
    const t = media().currentTime;
    if (pt === 'a'){ abLoop = { a: t, b: abLoop.b != null && abLoop.b > t + 0.05 ? abLoop.b : null }; }
    else {
      if (abLoop.a == null) abLoop = { a: 0, b: t };
      else if (t > abLoop.a + 0.05) abLoop = { a: abLoop.a, b: t };
      else { showToast('B has to come after A'); return; }
    }
    abResetRun(); abRampSpeed(); abSaveLoop();
  }
  abLoopBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    if (currentIndex === -1) return;
    abDropdown.classList.toggle('open');
    if (abDropdown.classList.contains('open')){ paintABPanel(); clampDropdownToViewport(abDropdown); }
  });
  abDropdown.addEventListener('click', (e) => e.stopPropagation());
  document.addEventListener('click', () => abDropdown.classList.remove('open'));
  document.getElementById('ab-set-a').addEventListener('click', () => abSet('a'));
  document.getElementById('ab-set-b').addEventListener('click', () => abSet('b'));
  document.getElementById('ab-clear').addEventListener('click', () => { abResetRun(); abLoop = { a: null, b: null }; abSaveLoop(); });
  abDropdown.querySelectorAll('.pp-dd-nudge').forEach(n => n.addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    const pt = n.dataset.pt; if (abLoop[pt] == null) return;
    let dur = media().duration; if (!isFinite(dur)) dur = 1e9;
    let v = Math.max(0, Math.min(dur, abLoop[pt] + +b.dataset.d));
    if (pt === 'a' && abLoop.b != null) v = Math.min(v, abLoop.b - 0.1);
    if (pt === 'b') v = Math.max(v, (abLoop.a || 0) + 0.1);
    abLoop[pt] = Math.round(v * 100) / 100;
    if (pt === 'a' && abLoop.b != null) { try { media().currentTime = Math.max(0, abLoop.a - abOpts.pre); } catch(x){} }   // hear the new start
    if (pt === 'b') { try { media().currentTime = Math.max(abLoop.a || 0, abLoop.b - 2); } catch(x){} }                      // hear the new end
    abSaveLoop();
  }));
  // typed values: blank or 0 = off (repeat: forever); kept within sensible limits
  AB_FIELDS.forEach(([id, k, lo, hi]) => {
    const el = document.getElementById(id);
    el.addEventListener('change', () => {
      let v = parseFloat(el.value);
      v = isFinite(v) && v > 0 ? Math.min(hi, Math.max(lo, v)) : 0;
      if (k === 'count') v = Math.round(v);
      abOpts[k] = k === 'ramp' ? (v && v < 100 ? v / 100 : 0) : v;
      try { localStorage.setItem(AB_OPTS_KEY, JSON.stringify(abOpts)); } catch(x){}
      if (k === 'ramp' || k === 'count'){ abResetRun(); abRampSpeed(); }
      el.blur(); setABLabel();
    });
    el.addEventListener('keydown', (e) => { if (e.key === 'Enter') el.blur(); });
  });
  // Called by the player's time updates and by a fast timer while a loop is set, so the jump back lands on B
  // (time updates alone come only every ~250 ms, which let the loop run noticeably past B).
  function abTick(m){
    if (abLoop.a == null || abLoop.b == null || abRun.waiting) return;
    const key = currentIndex + '|' + abLoop.a + '|' + abLoop.b;
    if (key !== abRun.key){ abRun.key = key; abResetRun(); abRampSpeed(); setABLabel(); }
    const t = m.currentTime;
    if (abRun.finished){ if (t < abLoop.a - 0.5){ abResetRun(); abRampSpeed(); setABLabel(); } return; }   // sought back: loop again
    if (t < abLoop.b - 0.015) return;
    abRun.done++;
    if (abOpts.count && abRun.done >= abOpts.count){
      abRun.finished = true;
      if (abRun.rampBase != null){ playbackSpeed = abRun.rampBase; abRun.rampBase = null; applySpeed(); }
      setABLabel(); return;
    }
    abRampSpeed();
    const back = () => { try { m.currentTime = Math.max(0, abLoop.a - abOpts.pre); } catch(e){} };
    if (abOpts.gap > 0 && isPlaying){
      abRun.waiting = true;
      togglePlay();                                     // pause through the player, so the controls stay right
      back();
      setTimeout(() => { abRun.waiting = false; if (!isPlaying && currentIndex !== -1) togglePlay(); }, abOpts.gap * 1000);
    } else back();
    setABLabel();
  }
  setInterval(() => { if (isPlaying && abLoop.a != null && abLoop.b != null && currentIndex !== -1){ try { abTick(media()); } catch(e){} } }, 25);

  // ---------- Sleep timer ----------
  // Minutes (quick picks or any number), a clock time, the end of this track or after a few tracks, with an optional
  // fade-out at the end. The fade lowers the players' volume and puts it back afterwards.
  const SLEEP_FADE_KEY = 'ppSleepFade';
  let sleepFade = 0; try { sleepFade = +localStorage.getItem(SLEEP_FADE_KEY) || 0; } catch(e){}
  let sleepFaded = false;
  function sleepSetGain(f){
    const v = (volume.value / 100) * f;
    [audioEl, videoEl, bgPlainEl, bgFxEl].forEach(el => { try { if (Math.abs(el.volume - v) > 0.002) el.volume = v; } catch(e){} });
    if (typeof audioLeadActive !== 'undefined' && audioLeadActive) audioLeadApplyGain();
  }
  function sleepUnfade(){ if (sleepFaded){ sleepFaded = false; sleepSetGain(1); } }
  function sleepStop(){
    cancelResumeOnReturn();   // stopped on purpose: must not restart when the app comes back to the foreground
    audioEl.pause();
    videoEl.pause();
    bgPlainEl.pause();        // background sound is carried by these, not audioEl
    bgFxEl.pause();
    isPlaying = false;
    updatePlayIcon();
    clearSleepTimer();
  }
  function clearSleepTimer(){
    if (sleepTimer.intervalId) clearInterval(sleepTimer.intervalId);
    sleepTimer = { mode: 'off', endAt: null, intervalId: null };
    sleepLabel.textContent = 'Sleep';
    sleepBtn.classList.remove('toggled');
    sleepUnfade();
    paintSleepPanel();
    syncAudioLoop();
  }
  function sleepRemainingMs(){
    if (sleepTimer.mode === 'duration') return Math.max(0, sleepTimer.endAt - Date.now());
    if (sleepTimer.mode === 'track'){
      try { const m = media(); if (isFinite(m.duration) && m.duration > 0) return Math.max(0, (m.duration - m.currentTime) / (playbackSpeed || 1) * 1000); } catch(e){}
    }
    return Infinity;
  }
  function tickSleepLabel(){
    if (sleepTimer.mode === 'tracks'){
      const id = currentIndex !== -1 && tracks[currentIndex] ? tracks[currentIndex].dbId : null;
      if (id !== sleepTimer.lastId){ sleepTimer.lastId = id; sleepTimer.left--; }
      if (sleepTimer.left <= 1){ sleepTimer.mode = 'track'; syncAudioLoop(); }     // the last one: stop when it ends
      else sleepLabel.textContent = sleepTimer.left + ' tracks';
    }
    if (sleepTimer.mode === 'track') sleepLabel.textContent = 'End of track';
    const remaining = sleepRemainingMs();
    if (sleepTimer.mode === 'duration'){
      const mins = Math.floor(remaining/60000), secs = Math.floor((remaining%60000)/1000).toString().padStart(2,'0');
      sleepLabel.textContent = mins >= 60 ? Math.floor(mins / 60) + 'h ' + String(mins % 60).padStart(2, '0') : `${mins}:${secs}`;
    }
    // fade out over the last part
    if (sleepFade > 0 && isPlaying && remaining <= sleepFade * 1000){ sleepFaded = true; sleepSetGain(Math.max(0, remaining / (sleepFade * 1000))); }
    else if (sleepFaded && remaining > sleepFade * 1000) sleepUnfade();
    if (sleepTimer.mode === 'duration' && remaining <= 0) sleepStop();
    paintSleepPanel();
  }
  function startSleep(mode, extra){
    if (sleepTimer.intervalId) clearInterval(sleepTimer.intervalId);
    sleepUnfade();
    sleepTimer = { mode, endAt: null, intervalId: null };
    if (mode === 'duration') sleepTimer.endAt = extra;
    if (mode === 'tracks'){ sleepTimer.left = extra; sleepTimer.lastId = currentIndex !== -1 && tracks[currentIndex] ? tracks[currentIndex].dbId : null; }
    sleepBtn.classList.add('toggled');
    tickSleepLabel();
    sleepTimer.intervalId = setInterval(tickSleepLabel, 250);
    syncAudioLoop();   // "end of track" needs the song to really end, so it may not loop
  }
  function startSleepTimer(minutes){ startSleep('duration', Date.now() + minutes * 60000); }
  function startSleepAtEndOfTrack(){ startSleep('track'); }
  function paintSleepPanel(){
    const st = document.getElementById('sleep-status'); if (!st) return;
    const on = sleepTimer.mode !== 'off';
    st.textContent = !on ? 'Off' : sleepTimer.mode === 'duration'
      ? 'Stops at ' + new Date(sleepTimer.endAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) + ' (' + sleepLabel.textContent + ')'
      : sleepTimer.mode === 'tracks' ? 'Stops after ' + sleepTimer.left + ' tracks' : 'Stops at the end of this track';
    if (on && sleepFade) st.textContent += ', fading out';
    document.getElementById('sleep-extend').style.display = on ? '' : 'none';
    document.getElementById('sleep-extend').querySelectorAll('[data-ext]').forEach(b => { b.style.display = sleepTimer.mode === 'duration' ? '' : 'none'; });
    const fe = document.getElementById('sleep-fade'); if (document.activeElement !== fe) fe.value = sleepFade || '';
  }
  sleepBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    sleepDropdown.classList.toggle('open');
    paintSleepPanel();
    clampDropdownToViewport(sleepDropdown);
  });
  sleepDropdown.addEventListener('click', (e) => e.stopPropagation());
  document.addEventListener('click', () => sleepDropdown.classList.remove('open'));
  sleepDropdown.addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.sleep){
      const val = b.dataset.sleep;
      if (val === 'off') clearSleepTimer();
      else if (val === 'track') startSleepAtEndOfTrack();
      else if (val.startsWith('tracks:')) startSleep('tracks', parseInt(val.slice(7), 10));
      else startSleepTimer(parseInt(val, 10));
      if (val !== 'off') sleepDropdown.classList.remove('open');
      return;
    }
    if (b.dataset.ext && sleepTimer.mode === 'duration'){ sleepTimer.endAt += +b.dataset.ext * 60000; sleepUnfade(); tickSleepLabel(); return; }
  });
  document.getElementById('sleep-custom-go').addEventListener('click', () => {
    const n = parseInt(document.getElementById('sleep-custom').value, 10);
    if (!(n > 0)) return;
    startSleepTimer(Math.min(720, n)); sleepDropdown.classList.remove('open');
  });
  document.getElementById('sleep-at-go').addEventListener('click', () => {
    const v = document.getElementById('sleep-at').value; if (!/^\d{1,2}:\d{2}/.test(v)) return;
    const [h, mi] = v.split(':').map(Number), at = new Date(); at.setHours(h, mi, 0, 0);
    if (at.getTime() <= Date.now() + 30000) at.setDate(at.getDate() + 1);   // a time already past means tomorrow
    startSleep('duration', at.getTime()); sleepDropdown.classList.remove('open');
  });
  document.getElementById('sleep-fade').addEventListener('change', (e) => {
    const v = parseFloat(e.target.value);
    sleepFade = isFinite(v) && v > 0 ? Math.min(900, Math.round(v)) : 0;
    try { localStorage.setItem(SLEEP_FADE_KEY, String(sleepFade)); } catch(x){}
    if (!sleepFade) sleepUnfade();
    e.target.blur(); paintSleepPanel();
  });
  document.getElementById('sleep-tracks-go').addEventListener('click', () => {
    const n = parseInt(document.getElementById('sleep-tracks').value, 10);
    if (!(n > 0)) return;
    if (n === 1) startSleepAtEndOfTrack(); else startSleep('tracks', Math.min(200, n));
    sleepDropdown.classList.remove('open');
  });
  ['sleep-custom', 'sleep-tracks', 'sleep-fade'].forEach(id => document.getElementById(id).addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    e.target.blur();
    if (id === 'sleep-custom') document.getElementById('sleep-custom-go').click();
    if (id === 'sleep-tracks') document.getElementById('sleep-tracks-go').click();
  }));

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

