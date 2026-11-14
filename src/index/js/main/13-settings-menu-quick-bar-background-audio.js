  // ---------- Settings menu (sidebar for non-media controls) ----------
  function openMenu(){ menuOverlay.classList.add('open'); }
  function closeMenu(){ menuOverlay.classList.remove('open'); }
  menuBtn.addEventListener('click', openMenu);
  menuCloseBtn.addEventListener('click', closeMenu);
  menuOverlay.addEventListener('click', (e) => {
    if (e.target === menuOverlay) closeMenu();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && menuOverlay.classList.contains('open')) closeMenu();
  });

  // ---------- Quick bar customization ----------
  // Each of these controls is a single set of real DOM nodes (with their
  // real listeners already attached above) that we relocate between the
  // quick bar row and its slot inside the settings menu, rather than
  // cloning or rebuilding anything.
  const QUICKBAR_ORDER = ['eq', 'boost', 'fx', 'speed', 'marks', 'abloop', 'cutter', 'stems', 'mashup', 'spatial', 'sleep', 'framestep', 'viewmode', 'vizsens', 'latency', 'memc', 'upscale', 'appearance'];
  const QUICKBAR_DEFAULT = ['speed', 'marks', 'abloop', 'cutter', 'sleep'];
  const QUICKBAR_KEY = 'playerQuickBar';
  // Hard cap: the pill row lives in the same fixed-size column as the
  // transport/seek controls, so an unbounded number of pills would overflow
  // past that area. 6 is the most that reliably fits without wrapping onto
  // a second row on the narrowest supported widths.
  const QUICKBAR_MAX_BASE = 6;
  // Media layout mode (body.player-layout) has a full-width, wrapping pill row, so it can hold more.
  const QUICKBAR_MAX_LAYOUT = 12;
  function quickBarMax(){ return document.body.classList.contains('player-layout') ? QUICKBAR_MAX_LAYOUT : QUICKBAR_MAX_BASE; }

  function getItemWrapper(name){
    return document.querySelector(`[data-item-wrapper="${name}"]`);
  }
  function getMenuSlot(name){
    return document.querySelector(`.menu-item-slot[data-slot="${name}"]`);
  }

  function loadQuickBarConfig(){
    try {
      const saved = JSON.parse(localStorage.getItem(QUICKBAR_KEY));
      if (Array.isArray(saved)){
        const list = saved.filter(x => QUICKBAR_ORDER.includes(x));
        // One-time migration: Marks used to be permanently on the bar, so keep it there
        // for existing users until they choose to remove it.
        if (!localStorage.getItem(QUICKBAR_KEY + 'MarksMigrated')){
          localStorage.setItem(QUICKBAR_KEY + 'MarksMigrated', '1');
          if (!list.includes('marks') && list.length < QUICKBAR_MAX_BASE) list.push('marks');
        }
        return list.slice(0, QUICKBAR_MAX_LAYOUT);   // the layout-mode cap; the active cap is applied when rendering
      }
    } catch(e){ /* storage unavailable */ }
    return QUICKBAR_DEFAULT.slice();
  }
  function saveQuickBarConfig(){
    try { localStorage.setItem(QUICKBAR_KEY, JSON.stringify(quickBarItems)); localStorage.setItem(QUICKBAR_KEY + 'MarksMigrated', '1'); } catch(e){ /* storage full or unavailable */ }
  }

  let quickBarItems = loadQuickBarConfig();

  // Pills actually shown right now: the saved list capped to the current mode's limit
  // (extras beyond 6 are kept in the saved list and reappear in media layout mode).
  function shownQuickBarItems(){ return quickBarItems.slice(0, quickBarMax()); }
  function renderQuickBar(){
    const shown = shownQuickBarItems();
    QUICKBAR_ORDER.forEach(name => {
      const wrapper = getItemWrapper(name);
      if (!wrapper) return;
      if (shown.includes(name)){
        quickBarEl.appendChild(wrapper);
      } else {
        const slot = getMenuSlot(name);
        if (slot) slot.appendChild(wrapper);
      }
    });
    const atCap = shown.length >= quickBarMax();
    document.querySelectorAll('.qb-checkbox').forEach(cb => {
      const checked = shown.includes(cb.dataset.qb);
      cb.checked = checked;
      // Only disable the boxes that would grow the quick bar past the cap;
      // checked ones stay clickable so the user can still uncheck to make room.
      cb.disabled = atCap && !checked;
      cb.closest('.qb-toggle').classList.toggle('qb-toggle-disabled', cb.disabled);
    });
  }

  document.querySelectorAll('.qb-checkbox').forEach(cb => {
    cb.addEventListener('change', () => {
      const name = cb.dataset.qb;
      if (cb.checked){
        quickBarItems = shownQuickBarItems();   // drop any hidden extras so the cap counts what's visible
        if (quickBarItems.length >= quickBarMax()){
          // Shouldn't normally happen since the box is disabled at the cap,
          // but guard anyway (e.g. programmatic toggles) by reverting it.
          cb.checked = false;
          if (typeof showToast === 'function') showToast('Quick bar can only hold ' + quickBarMax() + ' pills at once.');
          return;
        }
        if (!quickBarItems.includes(name)) quickBarItems.push(name);
      } else {
        quickBarItems = quickBarItems.filter(x => x !== name);
      }
      saveQuickBarConfig();
      renderQuickBar();
    });
  });

  renderQuickBar();
  // Re-render when media layout mode is switched on or off.
  let qbLastMax = quickBarMax();
  new MutationObserver(() => { const m = quickBarMax(); if (m !== qbLastMax){ qbLastMax = m; renderQuickBar(); } })
    .observe(document.body, { attributes:true, attributeFilter:['class'] });
  document.getElementById('frame-back-btn').addEventListener('click', () => stepFrame(-1));
  document.getElementById('frame-fwd-btn').addEventListener('click', () => stepFrame(1));
  document.getElementById('view-fit-btn').addEventListener('click', () => cycleViewFit());
  document.getElementById('view-zoom-btn').addEventListener('click', () => cycleViewZoom());

  // PiP menu: native PiP can only show the real <video>, so a delayed picture isn't possible there.
  // Audio lead + decode compensation are what keep the sound in sync, so the menu nudges both on.
  const pipDropdown = document.getElementById('pip-dropdown');
  const pipDdAL = document.getElementById('pip-audio-lead-toggle');
  const pipDdDC = document.getElementById('pip-decode-comp-toggle');
  const pipDdStatus = document.getElementById('pip-dd-status');
  const pipDdStart = document.getElementById('pip-dd-start');
  function refreshPipMenu(){
    pipDdAL.checked = audioLeadOn;
    pipDdDC.checked = decodeComp;
    const ms = netLatencyMs();
    if (audioLeadOn && ms > 0){
      pipDdStatus.classList.remove('warn');
      pipDdStatus.textContent = 'Sound will play ' + ms + ' ms ahead of the picture.';
      pipDdStart.textContent = 'Start Picture-in-picture';
    } else {
      pipDdStatus.classList.add('warn');
      pipDdStatus.textContent = !audioLeadOn
        ? 'Audio lead is off, so the sound will lag the picture in PiP.'
        : 'Latency is 0 ms, so there is nothing for audio lead to do.';
      pipDdStart.textContent = audioLeadOn ? 'Start Picture-in-picture' : 'Turn on both and start';
    }
  }
  // Drive the real settings switches so their existing handlers do the work and everything stays in sync.
  function setSettingToggle(id, on){
    const el = document.getElementById(id);
    if (!el || el.checked === on) return;
    el.checked = on;
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }
  pipDdAL.addEventListener('change', () => { setSettingToggle('audio-lead-toggle', pipDdAL.checked); refreshPipMenu(); });
  pipDdDC.addEventListener('change', () => { setSettingToggle('decode-comp-toggle', pipDdDC.checked); refreshPipMenu(); });
  async function startPip(){
    try { await videoEl.requestPictureInPicture(); } catch(e){ /* PiP unsupported or blocked, ignore */ }
  }
  pipDdStart.addEventListener('click', async () => {
    if (!audioLeadOn){
      setSettingToggle('audio-lead-toggle', true);
      setSettingToggle('decode-comp-toggle', true);
    }
    pipDropdown.classList.remove('open');
    pipBtn.setAttribute('aria-expanded', 'false');
    await startPip();
  });
  pipBtn.addEventListener('click', async (e) => {
    e.stopPropagation();
    try {
      if (document.pictureInPictureElement){
        await document.exitPictureInPicture();   // already in PiP: one tap to leave
        return;
      }
    } catch(err){ return; }
    refreshPipMenu();
    const open = pipDropdown.classList.toggle('open');
    pipBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
    if (open) clampDropdownToViewport(pipDropdown);
  });
  pipDropdown.addEventListener('click', (e) => e.stopPropagation());
  document.addEventListener('click', () => { pipDropdown.classList.remove('open'); pipBtn.setAttribute('aria-expanded', 'false'); });
  // Quick switch between a video and its audio (the button next to PiP, and "Back to video" on the player).
  // Uses the same conversion as the track menu, and keeps your place and whether it was playing.
  // (This button used to force the background-audio handoff by hand; that still happens by itself when the
  // app leaves the screen.)
  async function quickSwitchKind(toAudio){
    const i = currentIndex, t = tracks[i];
    if (!t || (toAudio ? t.kind !== 'video' : !t.convertedFromVideo)) return;
    let pos = 0; try { pos = media().currentTime || 0; } catch(e){}
    if (document.pictureInPictureElement === videoEl){ try { await document.exitPictureInPicture(); } catch(e){} }
    try { savePlaybackPosition(t.dbId, pos > 1 ? pos : null); } catch(e){}
    const target = toAudio ? audioEl : videoEl, from = toAudio ? videoEl : audioEl;
    // Converting can take a few seconds (the file is saved first) and the old element keeps playing meanwhile, so
    // the place to go back to is where it was when the new one started loading, not where it was at the tap.
    let at = pos, atT = performance.now();
    target.addEventListener('loadstart', function f(){ target.removeEventListener('loadstart', f); try { at = from.currentTime || pos; } catch(e){} atT = performance.now(); });
    // Put it back there once the other element has the file. Checked again a few times, because a fresh element
    // (or the native player) can report "loaded" before it accepts a seek, or start over from 0 after one.
    const want = () => at + (isPlaying ? (performance.now() - atT) / 1000 : 0);
    const seek = () => { try { if (currentIndex === i && (target.currentTime || 0) < want() - 1.5) target.currentTime = want(); } catch(e){} };
    if (pos >= 1){
      ['loadedmetadata', 'canplay', 'playing'].forEach(ev => target.addEventListener(ev, function once(){ target.removeEventListener(ev, once); seek(); }));
    }
    if (toAudio) await convertToMp3(i); else await revertToVideo(i);
    if (currentIndex !== i || pos < 1) return;
    [300, 900, 1800].forEach(ms => setTimeout(seek, ms));
  }
  const toAudioBtn = document.getElementById('to-audio-btn'), toVideoBtn = document.getElementById('to-video-btn');
  toAudioBtn.addEventListener('click', (e) => { e.stopPropagation(); quickSwitchKind(true); });
  toVideoBtn.addEventListener('click', (e) => { e.stopPropagation(); quickSwitchKind(false); });
  function refreshToVideoBtn(){
    const t = currentIndex !== -1 ? tracks[currentIndex] : null;
    toVideoBtn.style.display = t && t.convertedFromVideo ? '' : 'none';
  }
  videoEl.addEventListener('enterpictureinpicture', () => { pipBtn.classList.add('toggled'); refreshVideoDelayState(); });
  videoEl.addEventListener('leavepictureinpicture', () => { pipBtn.classList.remove('toggled'); autoPip = false; refreshVideoDelayState(); });

  // ---------- Keep video audio alive when backgrounded ----------
  // Browsers/mobile OSes suspend <video> decoding (audio included) once the
  // tab/app leaves the foreground, unless it's in Picture-in-Picture. <audio>
  // elements don't have that restriction. Since a track's file is just a
  // blob URL, we can point the (idle) <audio> element at the same URL - the
  // browser will demux just the audio track and play it, no transcoding
  // needed - and pause the <video> element while it's not visible anyway.
  // PiP is kept as a fallback for the rare container/codec an <audio> tag
  // can't demux on its own.
  let autoPip = false;
  // Monotonic token guarding the enter/exit handoff below: both functions are
  // async, so without this, a quick hide->show->hide flicker could let a
  // stale enterBackgroundAudioMode() call finish *after* a later exit, and
  // pause the video while leaving audioEl playing - video frozen, audio
  // running on, i.e. permanently "out of sync" until the next toggle.
  let bgOpId = 0;
  let bgExitTimer = null;
  let bgRetryTimer = null;
  let bgEnteringOp = 0;
  let bgRetryCount = 0;
  // "Should be playing" intent that survives anything the OS does to the elements while we're away.
  let resumeOnReturn = false, resumeGuardUntil = 0, resumeTimers = [];
  let bgLastError = '';
  let pageLeaving = false;
  let lastTrackLoadTs = 0; // set by loadTrack; watchdog stays out of the way right after

  // Always send background sound through the same Web Audio chain as the foreground (EQ, FX, boost, and the
  // output limiter), so level and tone match. The plain element is kept only as a fallback for when the
  // AudioContext can't run: it skips the limiter and some browsers ignore its volume, so it plays louder.
  function bgNeedsProcessing(){ return true; }
  // The 'bg' graph only needs to run while background audio is playing. When it has no path to the output
  // the browser stops rendering it, so it costs the audio thread nothing while a video plays in the foreground.
  function setBgGraphLive(on){
    const g = graphs.bg;
    if (!g || !audioCtx) return;
    if (!!g.live === on) return;
    try {
      // Cut BOTH ends of the chain. (Disconnecting only the output isn't enough: an AnalyserNode with no
      // output is still pulled by the browser, which keeps rendering everything feeding it.)
      g.source.disconnect();
      g.limiter.disconnect();
      g.audioDelay.disconnect();
      if (on){
        if (g.audioDelayOn){ g.limiter.connect(g.audioDelay); g.audioDelay.connect(g.analyser); }
        else g.limiter.connect(g.analyser);
        g.filtersConnected = null;   // force the source -> filters/trackGain link to be rebuilt
        rewireFilterChain(g);
      }
    } catch(e){}
    g.live = on;
  }
  // Builds the 'bg' graph (once) and brings every EQ/FX/boost setting up to date on it.
  function prepareBgFxGraph(){
    const g = getGraphFor('bg');
    setBgGraphLive(true);
    applyEqToGraph(g);
    rewireFxChain(g);
    applyFxToGraph(g);
    applyAudioDelay(g);
    g.trackGain.gain.value = (trackBoostOverrideActive ? trackBoost : 1) * rgFactor();
    g.masterGain.gain.value = trackBoostOverrideActive ? 1 : masterBoost;
    return g;
  }

  // Web-audio button: the sound comes from the background element while the picture keeps playing,
  // muted, and is nudged to stay with that sound. Nothing is paused or reloaded when the app is left
  // or re-entered, so there is no handoff to hear or see.
  let webAudioPicOn = false;
  function parkVideoForBg(){
    if (bgAudioManual && !document.hidden){ webAudioPicOn = true; videoEl.muted = true; }
    else { try { if (!videoEl.paused) videoEl.pause(); } catch(e){} }
  }
  function releaseWebAudioPicture(userMuted){
    if (!webAudioPicOn) return;
    webAudioPicOn = false;
    try { videoEl.muted = !!userMuted; videoEl.playbackRate = playbackSpeed; } catch(e){}
  }
  let wapBgPausedSince = 0, wapLastSeek = 0;
  function syncWebAudioPicture(){
    if (!bgAudioActive || !bgAudioManual || document.hidden){ wapBgPausedSince = 0; return; }
    if (!webAudioPicOn){ webAudioPicOn = true; videoEl.muted = true; }
    const now = performance.now();
    if (bgEl.paused){
      // A short pause of the sound (handoff, seek, OS blip) must not take the picture down with it:
      // only follow once the sound has stayed paused for a moment.
      if (!wapBgPausedSince) wapBgPausedSince = now;
      if (now - wapBgPausedSince > 800 && !videoEl.paused) videoEl.pause();
      return;
    }
    wapBgPausedSince = 0;
    if (videoEl.ended || videoEl.seeking) return;
    // The sound itself is buffering or seeking, so its clock isn't moving: nothing trustworthy to follow.
    // (Chasing it re-seeks the picture to the same spot over and over, which freezes it.)
    if (bgEl.seeking || bgEl.readyState < 3) return;
    const d = videoEl.currentTime - bgEl.currentTime;
    if (videoEl.paused || Math.abs(d) > 0.35){
      if (videoEl.paused){
        if (Math.abs(d) > 0.35 && now - wapLastSeek > 1500){ wapLastSeek = now; try { videoEl.currentTime = bgEl.currentTime; } catch(e){} }
        videoEl.play().catch(()=>{});
      } else if (videoEl.readyState >= 3 && now - wapLastSeek > 1500){
        // Rate-limited: one correction, then give the picture time to land before judging it again.
        wapLastSeek = now;
        try { videoEl.currentTime = bgEl.currentTime; } catch(e){}
      }
      return;
    }
    // Small drift: speed the picture up or slow it down a little instead of seeking.
    const want = Math.abs(d) < 0.04 ? playbackSpeed : playbackSpeed * (d > 0 ? 0.97 : 1.03);
    if (Math.abs(videoEl.playbackRate - want) > 0.001) videoEl.playbackRate = want;
  }
  // The 250 ms follower only runs while web-audio picture sync is live and visible; otherwise it did nothing but reset a flag.
  let wapTimer = 0;
  function wapSchedule(){
    const want = bgAudioActive && bgAudioManual && !document.hidden;
    if (want && !wapTimer) wapTimer = setInterval(syncWebAudioPicture, 250);
    else if (!want && wapTimer){ clearInterval(wapTimer); wapTimer = 0; syncWebAudioPicture(); }
  }
  ppEvery(wapSchedule, 1000);
  [bgPlainEl, bgFxEl].forEach(el => ['play', 'pause', 'seeked'].forEach(ev => el.addEventListener(ev, syncWebAudioPicture)));
  document.addEventListener('visibilitychange', () => { if (!document.hidden) syncWebAudioPicture(); });

  async function enterBackgroundAudioMode(){
    if (window.PPNative && PPNative.active()) return;   // native service keeps playing on its own
    if (bgAudioActive || currentIndex === -1 || pageLeaving) return;
    const t = tracks[currentIndex];
    if (t.kind !== 'video') return;
    // If Picture-in-Picture is already active for this video, it's already
    // handling "keep playing while backgrounded" on its own - the browser
    // keeps decoding and rendering frames into the PiP window regardless of
    // page visibility. Switching to background-audio mode on top of that
    // would still hit the videoEl.pause() below, freezing the PiP picture
    // on whatever frame it paused on while audioEl kept the soundtrack
    // running - audio moving, video frozen. Leave PiP alone instead.
    if (document.pictureInPictureElement === videoEl) return;
    if (bgEnteringOp && bgEnteringOp === bgOpId) return;   // a handoff is already in flight
    const opId = ++bgOpId;
    bgEnteringOp = opId;
    try {
      // Reuse audioEl if it's already loaded with this exact track: reassigning
      // src tears down and reloads the decoder, which is an audible gap/restart
      // every time the app flips between hidden and visible.
      const wantPos = videoEl.currentTime || 0;
      // Clean slate every time (this is what made the first handoff work and later ones not).
      try { bgPlainEl.pause(); } catch(e){}
      try { bgFxEl.pause(); } catch(e){}
      const startOn = async (el) => {
        bgEl = el;
        el.loop = false;
        el.muted = (audioLeadActive || audioLeadHandoffTimer) ? audioLeadUserMuted : videoEl.muted;
        el.src = t.url;
        try { el.currentTime = wantPos; } catch(e){}
        el.playbackRate = videoEl.playbackRate;
        el.volume = videoEl.volume;
        // play() is the first real work in the visibility event (browsers only allow a hidden page to start
        // sound in a short window). Bounded wait so a play() that never settles can't block later handoffs.
        const playP = el.play();
        await Promise.race([playP, new Promise((_, rej) => setTimeout(() => rej(new Error('PlayTimeout')), 2500))]);
        // The background element is audible now: silence the foreground sources at once so the same
        // sound is never summed twice (which reads as louder / doubled) while the rest of the handoff finishes.
        if (opId === bgOpId){
          parkVideoForBg();
          try { if (!audioEl.paused) audioEl.pause(); } catch(e){}
        }
      };
      // Prefer the element that goes through the equalizer / sound FX when any of them is in use.
      let usedFx = false;
      // Web-audio mode always uses the plain element: the processed one goes through the AudioContext,
      // which the OS suspends when the screen turns off, cutting the sound and restarting it.
      if (!bgAudioManual && Date.now() >= bgFxFailUntil && bgNeedsProcessing()){
        try {
          const ctx = ensureAudioCtx();
          prepareBgFxGraph();
          await startOn(bgFxEl);
          if (ctx.state !== 'running'){
            await Promise.race([ctx.resume().catch(()=>{}), new Promise(r => setTimeout(r, 1000))]);
          }
          if (ctx.state === 'running') usedFx = true;
          else throw new Error('FxContextSuspended');
        } catch(e){
          // The processed path can't make sound right now: drop it and use the plain element instead.
          bgFxFailUntil = Date.now() + 30000;
          try { bgFxEl.pause(); bgFxEl.removeAttribute('src'); bgFxEl.load(); } catch(_){}
          setBgGraphLive(false);
          if (opId !== bgOpId){ if (bgEnteringOp === opId) bgEnteringOp = 0; return; }
        }
      }
      if (!usedFx) await startOn(bgPlainEl);
      if (opId !== bgOpId){
        // Superseded by an exit while we were awaiting - back out.
        if (bgEnteringOp === opId) bgEnteringOp = 0;
        bgEl.pause();
        releaseWebAudioPicture(bgEl.muted);
        return;
      }
      if (!audioEl.paused) audioEl.pause();   // the Web-Audio-routed element (audio lead) must not play over bgEl
      parkVideoForBg(); // hidden: stop decoding frames. Web-audio mode: keep the picture going, muted
      bgAudioActive = true;
      bgKeepAlive(true);
      bgRetryCount = 0;
      // Repeat-one: let the element loop natively. Replaying from onEnded
      // (ended -> seek to 0 -> play()) drops the OS media session each
      // cycle while hidden, and after a few rounds the replay starts
      // bouncing between paused/playing. Sleep timer 'track' mode needs the
      // real 'ended' event, so it keeps the old path.
      bgEl.loop = repeatMode === 2 && sleepTimer.mode !== 'track';
      if (bgEnteringOp === opId) bgEnteringOp = 0;
      syncWebAudioPicture();
      if (!document.hidden && !bgAudioManual){
        // Visibility already flipped back before this resolved; reverse
        // immediately instead of leaving video paused with audio running.
        exitBackgroundAudioMode();
      }
    } catch(e){
      bgLastError = (e && (e.name || e.message)) || String(e);
      try { console.warn('Background audio handoff failed:', e); } catch(_){}
      // audioEl couldn't take over (blocked autoplay while backgrounded,
      // an unsupported codec, or superseded mid-await) - make sure it isn't
      // left half-started. A rejected play() promise doesn't guarantee the
      // element stays silent forever; some browsers will happily resume a
      // previously-issued play() once the tab regains focus, which is what
      // let audioEl start playing again on return *on top of* videoEl's own
      // audio (which was never paused in this branch, since that only
      // happens after a successful handoff below). Explicitly pausing here
      // closes that gap.
      try { bgPlainEl.pause(); bgFxEl.pause(); } catch(_){}
      releaseWebAudioPicture(bgEl.muted);
      if (bgEnteringOp === opId) bgEnteringOp = 0;
      if (document.hidden && !pageLeaving && isPlaying){
        if (bgRetryCount < 3){
          if (!bgRetryTimer){
            const delay = [600, 1500, 3000][bgRetryCount++];
            bgRetryTimer = setTimeout(() => { bgRetryTimer = null; if (document.hidden && isPlaying) enterBackgroundAudioMode(); }, delay);
          }
        } else {
          // The browser keeps refusing a gesture-less start while hidden. Say so (instead of showing
          // "playing" over silence) so the lock-screen / notification Play button, which counts as a
          // gesture, restarts it in one tap.
          bgRetryCount = 0;
          isPlaying = false;
          updatePlayIcon();
          updateMediaSession();
        }
      }
      // No automatic Picture-in-Picture fallback: opening a PiP window as the app is being
      // left is what makes the app try to reopen. PiP stays available via its own button.
    }
  }

  // Web-engine audio (video tracks handed to bgEl, or all audio with the native engine off) has no foreground
  // service behind it, so Android freezes the backgrounded app and the sound dies after ~30 s. Reuse the
  // foreground KeepAliveService (same one the splitter uses) for as long as that sound is playing hidden.
  let bgKeepOn = false;
  function bgKeepAlive(on){
    if (bgKeepOn === on) return;
    try {
      const P = window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.OnnxSeparator;
      if (!P || !P.keepAlive) return;
      bgKeepOn = on;
      P.keepAlive({ on, mode: 'play' }).catch(() => {});   // 'play' is tracked separately from a stem split, so one can't switch the other off
    } catch(e){}
  }
  window.ppIdleCheck = () => !isPlaying && !bgKeepOn;

  function exitBackgroundAudioMode(){
    if (!bgAudioActive) return;
    bgOpId++; // invalidate any enterBackgroundAudioMode() still in flight
    const bgPos = bgEl.currentTime;
    if (Math.abs(videoEl.currentTime - bgPos) > 0.5) videoEl.currentTime = bgPos;
    bgEl.loop = false;
    const userMuted = bgEl.muted;
    bgEl.pause();
    try { bgEl.removeAttribute('src'); bgEl.load(); } catch(e){}   // wipe it so the next handoff starts clean
    bgAudioActive = false;
    releaseWebAudioPicture(userMuted);
    setTimeout(() => { if (!bgAudioActive) setBgGraphLive(false); }, 400);   // let the last samples drain
    if (isPlaying){
      Promise.race([resumeAudioCtx(), new Promise(r => setTimeout(r, 1000))])
        .then(() => { if (isPlaying && !bgAudioActive && !document.hidden) return videoEl.play(); })
        .catch(() => setTimeout(() => {
          if (isPlaying && !bgAudioActive && videoEl.paused && !document.hidden) videoEl.play().catch(()=>{});
        }, 300));
    }
  }

  // Belt-and-braces: only one of audioEl/videoEl should ever actually be
  // audible at a time - whichever media() currently points to. Under normal
  // operation the enter/exit functions above already guarantee that, but a
  // handoff that fails or is interrupted partway (blocked autoplay, a long
  // background stretch where the browser throttles or freezes pending work,
  // etc.) can leave the *other* element primed to start on its own once the
  // tab regains focus - which is how both a track's video audio and its
  // background-audio substitute end up playing together. This is a cheap
  // self-healing check, safe to call any time the tab becomes visible again.
  function enforceSingleMediaSource(){
    const active = media();
    [audioEl, videoEl, bgPlainEl, bgFxEl].forEach(el => {
      if (el === active || el.paused) return;
      if (el === audioEl && audioLeadActive) return;   // audio lead legitimately runs audioEl beside the muted video
      if (el === videoEl && webAudioPicOn) return;      // web-audio mode: muted picture beside the background sound
      el.pause();
    });
  }

  // Tell the OS this page is media playback (Safari 16.4+): without it, Web Audio
  // output - which audioEl is routed through - is cut when the screen locks.
  try { if (navigator.audioSession) navigator.audioSession.type = 'playback'; } catch(e){}
  function hookCtxState(){
    if (!audioCtx || audioCtx.__ppHooked) return;
    audioCtx.__ppHooked = true;
    audioCtx.addEventListener('statechange', () => {
      if (isPlaying && audioCtx.state !== 'running') audioCtx.resume().catch(() => {});
    });
  }
  ppEvery(hookCtxState, 1000);

  // (Web-audio mode keeps the picture in step with the sound: see syncWebAudioPicture above.)

  // Pre-arm: while a video plays in the foreground, keep the idle <audio>
  // element loaded with the same file, parked near the playhead and wired
  // into its graph. Then the hide-time handoff is just "seek + play()",
  // with no src reload / decoder spin-up that would eat the short window
  // the OS gives a page that is going to the background or locking.
  function armBackgroundAudio(){ /* not needed: bgEl is loaded at handoff time */ }
  // (No periodic pre-arming: keeping a second decoder loaded for large videos can push a phone
  // over its memory limit, getting the app killed and relaunched. Armed only on demand below.)

  // (Handoff is triggered by visibilitychange only; pagehide/freeze are not used.)
  // The page is being closed/unloaded: never start (or retry) audio from here on,
  // or the OS can treat the app as still active and bring it back up.
  window.addEventListener('pagehide', (e) => {
    if (e.persisted) return;   // going to the back/forward cache / just backgrounded - not closing
    pageLeaving = true;
    if (bgRetryTimer){ clearTimeout(bgRetryTimer); bgRetryTimer = null; }
    bgKeepAlive(false);
  });
  window.addEventListener('pageshow', () => { pageLeaving = false; });

  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) return;
    if (isPlaying && currentIndex !== -1) resumeOnReturn = true;
    if (bgAudioActive) return;
    const pv = isPlaying && currentIndex !== -1 && tracks[currentIndex] && tracks[currentIndex].kind === 'video';
    if (pv) enterBackgroundAudioMode();
  }, true);   // capture: runs ahead of the other handlers (delay/visualizer refreshes etc.)

  // Back in the foreground: if playback was running when we left, make it run again - no matter
  // whether the OS paused an element, a late 'pause' event flipped the UI to paused, or the
  // background handoff was only half done. Retries a few times, then stops.
  function returnResumeStep(final){
    if (!resumeOnReturn || document.hidden || currentIndex === -1) return;
    if (!isPlaying){ isPlaying = true; updatePlayIcon(); updateMediaSession(); }
    if (bgAudioActive && !bgAudioManual){
      if (!bgExitTimer || final) exitBackgroundAudioMode();
    } else {
      const m = media();
      if (m.paused && !m.ended){
        Promise.race([resumeAudioCtx(), new Promise(r => setTimeout(r, 800))])
          .then(() => { if (resumeOnReturn && !document.hidden && m.paused) return m.play(); })
          .catch(() => {});
      }
    }
    if (final){ resumeOnReturn = false; resumeGuardUntil = 0; }
  }
  // Playback was stopped on purpose (sleep timer, end of the queue): forget the "resume when the app comes
  // back" intent, otherwise returnResumeStep() flips isPlaying back on and restarts the music.
  function cancelResumeOnReturn(){
    resumeOnReturn = false; resumeGuardUntil = 0;
    resumeTimers.forEach(clearTimeout); resumeTimers = [];
  }

  document.addEventListener('visibilitychange', async () => {
    // Never let a stale "leaving" flag block later handoffs: any visibility change proves the page is alive.
    pageLeaving = false;
    if (!document.hidden){
      bgRetryCount = 0;
      if (bgLastError){
        const msg = 'Background audio was blocked (' + bgLastError + ')';
        bgLastError = '';
        try { if (typeof showToast === 'function') showToast(msg, 'error'); } catch(_){}
      }
    }
    if (document.hidden && rememberPlaybackPosition && currentIndex !== -1 && tracks[currentIndex]){
      // A backgrounded mobile tab can be discarded by the OS without ever
      // firing beforeunload, so this is the more reliable save point for
      // "the person just left the app" rather than relying on that alone.
      savePlaybackPosition(tracks[currentIndex].dbId, media().currentTime);
    }
    if (document.hidden && bgExitTimer){ clearTimeout(bgExitTimer); bgExitTimer = null; }
    const playingVideo = isPlaying && currentIndex !== -1 &&
      tracks[currentIndex] && tracks[currentIndex].kind === 'video';
    if (document.hidden && playingVideo){
      await enterBackgroundAudioMode();
    } else if (!document.hidden){
      if (bgAudioActive && !bgAudioManual){
        // Debounced: Android fires quick hidden/visible/hidden bursts (shade
        // pulls, app switcher, screen on/off). Tearing the handoff down and
        // rebuilding it each time is what makes audio stop/start.
        clearTimeout(bgExitTimer);
        bgExitTimer = setTimeout(() => {
          bgExitTimer = null;
          if (!document.hidden) exitBackgroundAudioMode();
        }, 400);
      } else if (autoPip && document.pictureInPictureElement === videoEl){
        try { await document.exitPictureInPicture(); } catch(e) {}
        autoPip = false;
      }
      // If playback should still be going but the browser silently
      // suspended the active element while it was backgrounded (common on
      // mobile once a tab has been hidden for a while, and the same
      // situation that let background audio "turn off" while off-tab),
      // a plain resume picks it back up instead of leaving it stuck silent
      // until the person hits play themselves.
      enforceSingleMediaSource();
      if (isPlaying && currentIndex !== -1 && media().paused && !media().ended){
        media().play().catch(()=>{});
      }
      if (resumeOnReturn){
        resumeGuardUntil = Date.now() + 4000;
        resumeTimers.forEach(clearTimeout);
        resumeTimers = [0, 350, 800, 1600, 3200].map((ms, i, arr) => setTimeout(() => returnResumeStep(i === arr.length - 1), ms));
      }
    }
    // Browsers suspend the AudioContext when the tab is backgrounded/
    // throttled. If that happens mid-playback, every node downstream -
    // EQ and volume booster included - silently stops processing, so
    // audio keeps playing but reverts to its un-boosted level. Resume it
    // immediately whenever the tab comes back, and again whenever it goes
    // hidden (some browsers suspend a beat later rather than instantly).
    if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
  });

  // Some browsers suspend the AudioContext some time after backgrounding
  // rather than exactly on the visibilitychange event, so also poll for it
  // while something is actually playing and nudge it back awake. Cheap:
  // this only does anything when the context has actually gone suspended.
  //
  // Separately, some mobile browsers will silently pause the active media
  // element itself while the page is hidden - not just suspend the audio
  // graph - particularly for content whose container still has a video
  // track even when it's being played through the <audio> tag (e.g. a
  // track converted from video with the 🎧 button). Before this, nothing
  // ever tried to resume that until the page came back to the foreground,
  // so the track would just stay silently paused for the whole time it was
  // backgrounded. Poll for that too and resume it right away.
  // Watchdog for background playback. Hard rules so it can never create a
  // pause/start loop: (1) hands off during track transitions, (2) exponential
  // backoff on failures for BOTH play() and AudioContext.resume(), (3) flap
  // guard - if the element/context keeps flipping while hidden, stop
  // intervening entirely and mark playback paused so the user restarts it once
  // from the lock screen instead of hearing endless stutter.
  let wdFails = 0, wdNextAt = 0, ctxNextAt = 0, ctxFails = 0, wdMuteUntil = 0;
  const flapTimes = [];
  function noteFlap(){
    const now = Date.now();
    flapTimes.push(now);
    while (flapTimes.length && now - flapTimes[0] > 15000) flapTimes.shift();
    if (flapTimes.length >= 5){
      flapTimes.length = 0;
      wdMuteUntil = now + 60000;
      // Only reflect a pause that really happened; never pause audio that is audibly playing.
      if (isPlaying && media().paused){
        isPlaying = false;
        updatePlayIcon();
        updateMediaSession();
      }
    }
  }
  window.__noteFlap = noteFlap;
  ppEvery(() => {
    if (!document.hidden){ wdFails = 0; ctxFails = 0; ctxNextAt = 0; wdNextAt = 0; bgKeepAlive(false); return; }
    bgKeepAlive(!!(isPlaying && currentIndex !== -1 && !(window.PPNative && window.PPNative.active && window.PPNative.active() && !bgAudioActive)));
    const now = Date.now();
    if (now < wdMuteUntil) return;
    if ((isPlaying || cutterExporting) && audioCtx && audioCtx.state !== 'running' && now >= ctxNextAt){
      audioCtx.resume().then(() => { ctxFails = 0; }).catch(() => {});
      ctxFails++;
      ctxNextAt = now + Math.min(30000, 1000 * Math.pow(2, ctxFails));
      if (audioCtx.state === 'suspended' || audioCtx.state === 'interrupted') noteFlap();
    }
    if (!isPlaying || currentIndex === -1) return;
    if (now - lastTrackLoadTs < 5000) return; // track transition in progress
    const t = tracks[currentIndex];
    const usingPlainAudioPath = bgAudioActive || (t && t.kind !== 'video');
    const m = media();
    if (!usingPlainAudioPath || !m.paused || m.ended || m.seeking) return;
    if (now < wdNextAt) return;
    m.play().then(() => { wdFails = 0; }).catch(() => {
      wdFails++;
      wdNextAt = Date.now() + Math.min(30000, 2000 * Math.pow(2, wdFails));
    });
  }, 1000);

  // Stuck-picture watchdog: the video says "playing" but its clock isn't moving (typically after a
  // hide/show handoff, an audio-context interruption or a decoder hiccup). Escalates gently: wake the
  // audio context + nudge, then pause/play, then reload the source at the same position.
  let stuckLastT = -1, stuckTicks = 0, stuckBusy = false;
  function stuckRecover(stage, pos){
    const v = videoEl;
    if (stage === 1){
      try { if (audioCtx && audioCtx.state !== 'running') audioCtx.resume().catch(()=>{}); } catch(e){}
      try { v.currentTime = pos; } catch(e){}
      v.play().catch(()=>{});
    } else if (stage === 2){
      try { v.pause(); } catch(e){}
      Promise.race([resumeAudioCtx(), new Promise(r => setTimeout(r, 800))])
        .catch(()=>{}).then(() => { if (isPlaying && !document.hidden && media() === v) v.play().catch(()=>{}); });
    } else {
      stuckBusy = true;
      const done = () => { stuckBusy = false; };
      v.addEventListener('loadedmetadata', function onMeta(){
        v.removeEventListener('loadedmetadata', onMeta);
        try { v.currentTime = pos; } catch(e){}
        if (isPlaying && !document.hidden && media() === v) v.play().catch(()=>{});
        setTimeout(done, 1500);
      });
      setTimeout(done, 8000);
      try { v.load(); } catch(e){ done(); }
    }
  }
  ppEvery(() => {
    const v = videoEl;
    const watching = isPlaying && !document.hidden && currentIndex !== -1 && !bgAudioActive && !stuckBusy
      && media() === v && v.currentSrc && !v.paused && !v.ended && !v.seeking && v.playbackRate > 0
      && Date.now() - lastTrackLoadTs > 4000;
    if (!watching){ stuckTicks = 0; stuckLastT = -1; return; }
    const t = v.currentTime;
    if (stuckLastT < 0 || Math.abs(t - stuckLastT) > 0.01){ stuckLastT = t; stuckTicks = 0; return; }
    stuckTicks++;
    if (stuckTicks === 3) stuckRecover(1, t);
    else if (stuckTicks === 6) stuckRecover(2, t);
    else if (stuckTicks === 10){ stuckRecover(3, t); stuckTicks = 0; }
  }, 1000);

  // The other direction: sound is running but the app thinks it is paused (the play button shows Play, and leaving
  // the app does not hand the sound to the background because that only happens "while playing"). Whatever caused
  // it, once the clock has really moved for two seconds while visible, take the real state as the truth.
  let driftTicks = 0, driftT = -1;
  ppEvery(() => {
    const m = (!document.hidden && !isPlaying && currentIndex !== -1 && !cutterPreviewing && Date.now() - lastTrackLoadTs > 5000) ? media() : null;
    if (!m || m.paused || m.ended || m.seeking){ driftTicks = 0; driftT = -1; return; }
    const t = m.currentTime;
    driftTicks = (driftT >= 0 && t > driftT + 0.2) ? driftTicks + 1 : 0;
    driftT = t;
    if (driftTicks >= 2){ driftTicks = 0; driftT = -1; isPlaying = true; updatePlayIcon(); updateMediaSession(); }
  }, 1000);

  // Pauses the browser/OS does on its own: while visible, sync the UI; while
  // hidden, count them for the flap guard.
  [audioEl, videoEl, bgPlainEl, bgFxEl].forEach(el => {
    el.addEventListener('pause', (e) => {
      if (e.target !== media() || e.target.ended || e.target.seeking) return;
      if (Date.now() - lastTrackLoadTs < 5000) return;
      if (document.hidden){ if (isPlaying) noteFlap(); return; }
      if (!isPlaying) return;
      setTimeout(() => {
        if (e.target === media() && e.target.paused && !e.target.ended && !document.hidden && isPlaying &&
            !(resumeOnReturn && Date.now() < resumeGuardUntil)){
          isPlaying = false;
          updatePlayIcon();
          updateMediaSession();
        }
      }, 250);
    });
  });

