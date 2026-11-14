  // ---------- Playlist view selector (Playlist tab) ----------
  function renderPlaylistViewSelect(){
    const prev = activePlaylistView;
    playlistViewSelect.innerHTML = `<option value="__all__">All tracks (${tracks.filter(t => !t.stem).length})</option>`;
    const stemCount = tracks.filter(t => t.stem).length;
    if (stemCount){
      const so = document.createElement('option');
      so.value = STEMS_VIEW; so.textContent = `Split tracks (${stemCount})`;
      playlistViewSelect.appendChild(so);
    }
    playlists.forEach(pl => {
      if (!detailedPlaylistMode && !pl.stemOf && !pl.auto) return;
      const count = tracks.filter(t => (t.playlistIds||[]).includes(pl.id)).length;
      const opt = document.createElement('option');
      opt.value = pl.id;
      opt.textContent = `${pl.name} (${count})`;
      playlistViewSelect.appendChild(opt);
    });
    activePlaylistView = viewAllowed(prev) ? prev : '__all__';
    playlistViewSelect.value = activePlaylistView;
    syncViewRow();
  }
  (function(){
    const btn = document.getElementById('pl-shuffle-btn'), menu = document.getElementById('pl-shuffle-menu');
    if (!btn || !menu) return;
    const show = (on) => { menu.hidden = !on; btn.setAttribute('aria-expanded', on ? 'true' : 'false'); };
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const plId = userPlaylistViewId();
      // All tracks: only "play shuffled" and "make a shuffled playlist of everything" make sense
      menu.querySelector('[data-shuf="order"]').hidden = !plId;
      menu.querySelector('[data-shuf="copy"]').textContent = plId ? 'Make a shuffled copy' : 'Make a shuffled playlist of everything';
      show(menu.hidden);
    });
    menu.addEventListener('click', (e) => {
      const b = e.target.closest('[data-shuf]'); if (!b) return;
      const plId = userPlaylistViewId();
      show(false);
      if (b.dataset.shuf === 'play') playShuffledOnce(plId);
      else if (b.dataset.shuf === 'order') shufflePlaylistOrder(plId);
      else { const pl = makeShuffledPlaylist(plId); if (pl){ playlistViewSelect.value = pl.id; playlistViewSelect.dispatchEvent(new Event('change')); } }
    });
    document.addEventListener('click', (e) => { if (!menu.hidden && !menu.contains(e.target)) show(false); });
  })();
  playlistViewSelect.addEventListener('change', () => {
    if (selectMode) exitSelectMode();
    activePlaylistView = playlistViewSelect.value;
    saveSettings();
    renderPlaylist();
  });

  // ---------- Add-to-playlist popover ----------
  let plPopoverTrackIdx = null;
  let plPopoverAnchor = null;
  function closeTrackPlPopover(){
    trackPlPopover.classList.remove('open');
    plPopoverTrackIdx = null;
    plPopoverAnchor = null;
  }
  function openTrackPlPopover(anchorEl, idx){
    plPopoverTrackIdx = idx;
    plPopoverAnchor = anchorEl;
    const t = tracks[idx];
    if (playlists.length === 0){
      trackPlPopover.innerHTML = `<div class="track-pl-popover-empty">No playlists yet.<br>Create one in Settings.</div>`;
    } else {
      trackPlPopover.innerHTML = '';
      playlists.forEach(pl => {
        const checked = (t.playlistIds||[]).includes(pl.id);
        const item = document.createElement('div');
        item.className = 'track-pl-popover-item';
        item.innerHTML = `<input type="checkbox" ${checked ? 'checked' : ''}><span>${escapeHtml(pl.name)}</span>`;
        item.addEventListener('click', () => toggleTrackInPlaylist(idx, pl.id));
        trackPlPopover.appendChild(item);
      });
    }
    const rect = anchorEl.getBoundingClientRect();
    trackPlPopover.style.left = Math.min(rect.left, window.innerWidth - 190) + 'px';
    trackPlPopover.style.top = (rect.bottom + 4) + 'px';
    trackPlPopover.classList.add('open');
  }
  document.addEventListener('click', (e) => {
    if (!trackPlPopover.contains(e.target) && !e.target.closest('.track-pl-btn')){
      closeTrackPlPopover();
    }
  });

  function toggleTrackInPlaylist(idx, playlistId){
    const t = tracks[idx];
    if (!t) return;
    t.playlistIds = t.playlistIds || [];
    const pos = t.playlistIds.indexOf(playlistId);
    if (pos === -1) t.playlistIds.push(playlistId);
    else t.playlistIds.splice(pos, 1);
    saveLibraryMeta();
    if (plPopoverAnchor) openTrackPlPopover(plPopoverAnchor, idx); // refresh checkbox state
    renderPlaylistsManager();
    renderPlaylistViewSelect();
    if (activePlaylistView !== '__all__') renderPlaylist();
  }

  function removeTrackFromPlaylist(idx, playlistId){
    const t = tracks[idx];
    if (!t || !t.playlistIds) return;
    t.playlistIds = t.playlistIds.filter(pid => pid !== playlistId);
    saveLibraryMeta();
    renderPlaylistsManager();
    renderPlaylistViewSelect();
    renderPlaylist();
  }

  const sortApplyBtn = document.getElementById('sort-apply-btn');


  const playBtn = document.getElementById('play-btn');
  const playIcon = document.getElementById('play-icon');
  const prevBtn = document.getElementById('prev-btn');
  const nextBtn = document.getElementById('next-btn');
  const shuffleBtn = document.getElementById('shuffle-btn');
  const repeatBtn = document.getElementById('repeat-btn');

  const seek = document.getElementById('seek');
  const curTimeEl = document.getElementById('cur-time');
  const durTimeEl = document.getElementById('dur-time');
  const volume = document.getElementById('volume');
  const volIcon = document.getElementById('vol-icon');

  const vizSensBtn = document.getElementById('viz-sens-btn');
  const vizSensDropdown = document.getElementById('viz-sens-dropdown');
  const vizSensitivityInput = document.getElementById('viz-sensitivity');
  const vizSensValue = document.getElementById('viz-sens-value');
  const vizSensPillLabel = document.getElementById('viz-sens-label');
  const vizSensOverrideToggle = document.getElementById('viz-sens-override');
  const vizSensTrackInput = document.getElementById('viz-sensitivity-track');
  const vizSensTrackValue = document.getElementById('viz-sens-track-value');

  const menuBtn = document.getElementById('menu-btn');
  const menuOverlay = document.getElementById('menu-overlay');
  const menuCloseBtn = document.getElementById('menu-close-btn');
  const quickBarEl = document.getElementById('extra-transport');

  const latencyBtn = document.getElementById('latency-btn');
  const latencyLabel = document.getElementById('latency-label');
  const latencyDropdown = document.getElementById('latency-dropdown');
  const latencySlider = document.getElementById('latency-slider');
  const latencyDropdownValue = document.getElementById('latency-dropdown-value');
  const latencyResetBtn = document.getElementById('latency-reset-btn');
  const latencyPresetInput = document.getElementById('latency-preset-input');
  const latencyPresetBtn = document.getElementById('latency-preset-btn');
  const latencyPresetBtnValue = document.getElementById('latency-preset-btn-value');
  const latencyMetronomeToggle = document.getElementById('latency-metronome-toggle');

  const videoTools = document.getElementById('video-tools');
  const fullscreenBtn = document.getElementById('fullscreen-btn');

  const filterBtn = document.getElementById('filter-btn');
  const filterDropdown = document.getElementById('filter-dropdown');
  const filterGrid = document.getElementById('filter-grid');
  const filterIntensity = document.getElementById('filter-intensity');
  const sharpenIntensity = document.getElementById('sharpen-intensity');
  const clarityIntensity = document.getElementById('clarity-intensity');
  const autoLevelsToggle = document.getElementById('auto-levels-toggle');
  const sharpenMatrixEl = document.getElementById('sharpen-matrix');
  const clarityBoostEl = document.getElementById('clarity-boost');
  const pipBtn = document.getElementById('pip-btn');
  const subtitleBtn = document.getElementById('subtitle-btn');
  const subtitleDropdown = document.getElementById('subtitle-dropdown');
  const subtitleLoadBtn = document.getElementById('subtitle-load-btn');
  const subtitleOffBtn = document.getElementById('subtitle-off-btn');
  const subtitleInput = document.getElementById('subtitle-input');
  const subtitleSizeRow = document.getElementById('subtitle-size-row');
  const subtitlePosRow = document.getElementById('subtitle-pos-row');
  const subtitleColorRow = document.getElementById('subtitle-color-row');
  const subtitleColorCustom = document.getElementById('subtitle-color-custom');
  const subtitleFontRow = document.getElementById('subtitle-font-row');
  const subtitleRemoveBtn = document.getElementById('subtitle-remove-btn');
  const subtitleStatus = document.getElementById('subtitle-status');
  const subtitleOffsetRow = document.getElementById('subtitle-offset-row');
  const subtitleOffsetVal = document.getElementById('subtitle-offset-val');
  const subtitleOverlay = document.getElementById('subtitle-overlay');
  const subtitleText = document.getElementById('subtitle-text');

  const speedBtn = document.getElementById('speed-btn');
  const speedLabel = document.getElementById('speed-label');
  const speedDropdown = document.getElementById('speed-dropdown');
  const speedSlider = document.getElementById('speed-slider');
  const speedDropdownValue = document.getElementById('speed-dropdown-value');
  const speedResetBtn = document.getElementById('speed-reset-btn');
  const abLoopBtn = document.getElementById('ab-loop-btn');
  const abLoopLabel = document.getElementById('ab-loop-label');
  const abMarkerA = document.getElementById('ab-marker-a');
  const abMarkerB = document.getElementById('ab-marker-b');
  const sleepBtn = document.getElementById('sleep-btn');
  const sleepLabel = document.getElementById('sleep-label');
  const sleepDropdown = document.getElementById('sleep-dropdown');

  const eqBtn = document.getElementById('eq-btn');
  const eqDropdown = document.getElementById('eq-dropdown');
  const eqPowerBtn = document.getElementById('eq-power-btn');
  const eqOverrideToggle = document.getElementById('eq-override-toggle');
  const eqPresetRow = document.getElementById('eq-preset-row');
  const eqBandsWrap = document.getElementById('eq-bands');
  const eqResetBtn = document.getElementById('eq-reset-btn');
  const masterBoostSlider = document.getElementById('master-boost-slider');
  const masterBoostVal = document.getElementById('master-boost-val');
  const trackBoostSlider = document.getElementById('track-boost-slider');
  const trackBoostVal = document.getElementById('track-boost-val');
  const trackBoostOverrideToggle = document.getElementById('track-boost-override');
  const bassBoostKnobEl = document.getElementById('bass-boost-knob');
  const bassBoostVal = document.getElementById('bass-boost-val');
  const reverbKnobEl = document.getElementById('reverb-knob');
  const reverbVal = document.getElementById('reverb-val');
  const filterKnobEl = document.getElementById('filter-knob');
  const filterVal = document.getElementById('filter-val');
  const distortionKnobEl = document.getElementById('distortion-knob');
  const distortionVal = document.getElementById('distortion-val');
  const bitcrushKnobEl = document.getElementById('bitcrush-knob');
  const bitcrushVal = document.getElementById('bitcrush-val');
  const echoKnobEl = document.getElementById('echo-knob');
  const echoVal = document.getElementById('echo-val');
  const tremoloKnobEl = document.getElementById('tremolo-knob');
  const tremoloVal = document.getElementById('tremolo-val');
  const fxResetBtn = document.getElementById('fx-reset-btn');
  const boostResetBtn = document.getElementById('boost-reset-btn');

  const cutterBtn = document.getElementById('cutter-btn');
  const cutterModalOverlay = document.getElementById('cutter-modal-overlay');
  const cutterTrackName = document.getElementById('cutter-modal-track-name');
  const cutterRangeWrap = document.getElementById('cutter-range-wrap');
  const cutterRangeFill = document.getElementById('cutter-range-fill');
  const cutterPlayhead = document.getElementById('cutter-playhead');
  const cutterHandleStart = document.getElementById('cutter-handle-start');
  const cutterHandleEnd = document.getElementById('cutter-handle-end');
  const cutterStartInput = document.getElementById('cutter-start-input');
  const cutterEndInput = document.getElementById('cutter-end-input');
  const cutterStartNowBtn = document.getElementById('cutter-start-now-btn');
  const cutterEndNowBtn = document.getElementById('cutter-end-now-btn');
  const cutterDurationLabel = document.getElementById('cutter-duration-label');
  const cutterFormatBtnsEl = document.getElementById('cutter-format-btns');
  const cutterMp3QualityRow = document.getElementById('cutter-mp3-quality-row');
  const cutterVideoHint = document.getElementById('cutter-video-hint');
  const cutterMp3Quality = document.getElementById('cutter-mp3-quality');

  const cutterPreviewBtn = document.getElementById('cutter-preview-btn');
  const cutterPreviewLabel = document.getElementById('cutter-preview-label');
  const cutterProgressWrap = document.getElementById('cutter-progress-wrap');
  const cutterProgressFill = document.getElementById('cutter-progress-fill');
  const cutterProgressLabel = document.getElementById('cutter-progress-label');
  const cutterErrorEl = document.getElementById('cutter-error');
  const cutterCancelBtn = document.getElementById('cutter-cancel-btn');
  const cutterExportBtn = document.getElementById('cutter-export-btn');

  const npTitle = document.getElementById('np-title');
  const npTitleTrack = npTitle.querySelector('.marquee-track');
  const npArtist = document.getElementById('np-artist');
  const artImg = document.getElementById('art-img');
  const artFallback = document.getElementById('art-fallback');
  const artRing = document.getElementById('art-ring');

  const canvas = document.getElementById('viz');
  const ctx = canvas.getContext('2d');

  let tracks = [];      // {dbId, url, title, artist, duration, artUrl, kind: 'audio'|'video'}
  let currentIndex = -1;
  // Ordered list of indices (into `tracks`) representing the queue that
  // next/prev navigate through - i.e. whichever playlist (or "All Songs")
  // was being viewed when the current track was started. This is captured
  // when a track is played so that switching the sidebar to a different
  // playlist view afterward (or backgrounding the app) doesn't cause
  // next/prev to fall back to the full library order instead of the
  // playlist the song was actually played from.
  let playQueue = [];
  let isPlaying = false;
  let bgAudioActive = false; // true while audioEl is substituting for a backgrounded video
  let bgAudioManual = false; // the web-audio button: keep audioEl in charge even while the app is in the foreground
  // Background sound is carried by a plain element that is NEVER routed through Web Audio. audioEl/videoEl
  // are wired into the AudioContext, which mobile OSes suspend/interrupt after the first background, so a
  // handoff onto them can "play" silently or be killed. This element has no such dependency, and it is
  // wiped after every use so each handoff starts exactly like the first one did.
  // bgPlainEl stays outside Web Audio (robust). bgFxEl is routed through the EQ/FX graph ('bg') and is only
  // used when EQ/FX are actually active and the AudioContext is running; otherwise we fall back to bgPlainEl.
  const bgPlainEl = new Audio();
  const bgFxEl = new Audio();
  [bgPlainEl, bgFxEl].forEach(el => { el.preload = 'auto'; el.setAttribute('playsinline', ''); });
  let bgEl = bgPlainEl;          // whichever of the two currently carries the background sound
  let bgFxFailUntil = 0;         // after a failed FX handoff, use the plain element until this time
  let bgUnlocked = false, bgUnlockBusy = false, bgUnlockTries = 0;
  function makeSilentWavUrl(){
    const n = 800, buf = new ArrayBuffer(44 + n), v = new DataView(buf);
    const w = (o, str) => { for (let i = 0; i < str.length; i++) v.setUint8(o + i, str.charCodeAt(i)); };
    w(0,'RIFF'); v.setUint32(4, 36 + n, true); w(8,'WAVE'); w(12,'fmt '); v.setUint32(16,16,true);
    v.setUint16(20,1,true); v.setUint16(22,1,true); v.setUint32(24,8000,true); v.setUint32(28,8000,true);
    v.setUint16(32,1,true); v.setUint16(34,8,true); w(36,'data'); v.setUint32(40,n,true);
    for (let i = 0; i < n; i++) v.setUint8(44 + i, 128);
    return URL.createObjectURL(new Blob([buf], { type: 'audio/wav' }));
  }
  // iOS only lets an element start sound without a tap if it was started once from a tap. Do that once,
  // silently, on the first touch/click.
  function unlockBgEl(){
    if (bgUnlocked || bgUnlockBusy || bgAudioActive || bgUnlockTries >= 5) return;
    bgUnlockTries++;   // a failing unlock must not reload both elements on every tap while a video plays
    bgUnlockBusy = true;
    const els = [bgPlainEl, bgFxEl];
    let left = els.length, okAll = true;
    const finish = (el, ok) => {
      if (!(el === bgEl && (bgAudioActive || bgEnteringOp))){
        try { el.pause(); el.muted = false; el.removeAttribute('src'); el.load(); } catch(e){}
      }
      if (!ok) okAll = false;
      if (--left === 0){ bgUnlockBusy = false; if (okAll) bgUnlocked = true; }
    };
    const silent = makeSilentWavUrl();
    els.forEach(el => {
      try {
        el.muted = true;
        el.src = silent;
        const p = el.play();
        if (p && p.then) p.then(() => finish(el, true), () => finish(el, false));
        else finish(el, true);
      } catch(e){ finish(el, false); }
    });
  }
  ['touchend', 'click'].forEach(ev => document.addEventListener(ev, unlockBgEl, { passive: true }));
  let shuffleOn = false;
  let repeatMode = 0;   // 0 off, 1 all, 2 one
  let shuffleOrder = [];

  const SPEED_MIN = 0.25, SPEED_MAX = 4;
  let playbackSpeed = 1;

  // A/B loop: {a, b} in seconds, or null slots while being set. Keyed per
  // track (by dbId) in localStorage so a loop survives reloads/track switches.
  let abLoop = { a: null, b: null };
  const AB_LOOP_KEY = 'playerABLoops';

  // Subtitles: parsed cues for the currently-loaded track, plus small
  // style prefs. Cues are cached per track (by dbId) in localStorage,
  // subtitle text is tiny compared to the media itself.
  let subtitleCues = [];
  let subtitlesOn = false;
  let subtitleSize = 'm';
  let subtitlePos = 'bottom';   // 'bottom' | 'top' | 'custom'
  let subtitleX = 0.5, subtitleY = 0.85; // custom placement: centre of the text, as a fraction of the PICTURE (can go past 0..1 into the black bars)
  let subtitlePreview = false;  // show a sample line while the subtitle menu is open so it can be dragged
  let subtitleColor = '#ffffff';
  let subtitleFont = 'default';
  let subtitleStyle = { scale:100, outline:0, shadow:0, bg:70, lh:140, bold:0, sdh:0 };   // slider units, see applySubtitleStyle
  let subtitleTrMode = 'both';  // 'orig' | 'both' | 'tr'
  let subtitleTrLang = '';
  let subtitleLatencyMs = 0; // shifts subtitle timing AND delays the picture itself (see videoDelayEngine) to match audio arriving late over Bluetooth
  // Motion smoothing state (engine is further down, near the delay engine).
  const memcCanvas = document.getElementById('memc-canvas');
  const memcStatusEl = document.getElementById('memc-status');
  const memcModeBtns = document.querySelectorAll('[data-memc-mode]');
  const MEMC_KEY = 'playerMemcMode';
  const memcThreshEl = document.getElementById('memc-thresh');
  const memcOutEl = document.getElementById('memc-out');
  const memcThreshValEl = document.getElementById('memc-thresh-val');
  const memcOutValEl = document.getElementById('memc-out-val');
  const MEMC_IN_KEY = 'playerMemcMaxIn', MEMC_OUT_KEY = 'playerMemcOutFps';
  let memcMaxIn = 50;     // smooth videos up to this many fps; faster ones are skipped
  let memcOutFps = 120;   // never present more than this many frames per second
  try {
    const a = parseInt(localStorage.getItem(MEMC_IN_KEY), 10), b = parseInt(localStorage.getItem(MEMC_OUT_KEY), 10);
    if (a >= 10 && a <= 120) memcMaxIn = a;
    if (b >= 10 && b <= 120) memcOutFps = b;
  } catch (e){}
  const MEMC_SPEED_KEY = 'playerMemcSpeedAware';
  let memcSpeedAware = true;   // count playback speed when judging source rate / output spacing
  try { if (localStorage.getItem(MEMC_SPEED_KEY) === '0') memcSpeedAware = false; } catch (e){}
  const memcRate = () => memcSpeedAware ? (videoEl.playbackRate || 1) : 1;
  let memcMode = 'off';   // 'off' | 'blend' (Simple) | 'motion' (Advanced)
  try { const m = localStorage.getItem(MEMC_KEY); if (m === 'blend' || m === 'motion' || m === 'ultra') memcMode = m; } catch (e){}
  // Processing-quality tiers: how large the frame ring is, how much GPU memory it may use,
  // and how fine the motion analysis is. Tier 0 is the original behaviour.
  const MEMC_TIERS = [
    { name: 'Low',    motionW: 960,  simpleW: 1280, mb: 96,   ana: 384 },
    { name: 'Medium', motionW: 1600, simpleW: 1920, mb: 256,  ana: 448 },
    { name: 'High',   motionW: 2560, simpleW: 2560, mb: 512,  ana: 576 },
    { name: '4K',     motionW: 3840, simpleW: 3840, mb: 1024, ana: 704 }
  ];
  const MEMC_UP_CAPS = [0, 1080, 1440, 2160];   // upscale output height cap; 0 = off
  const MEMC_Q_KEY = 'playerMemcQuality', MEMC_UP_KEY = 'playerMemcUpscale';
  let memcQuality = 0, memcUpscale = 0, memcOutW = 0, memcOutH = 0;
  try {
    const q = parseInt(localStorage.getItem(MEMC_Q_KEY), 10), u = parseInt(localStorage.getItem(MEMC_UP_KEY), 10);
    if (q >= 0 && q < MEMC_TIERS.length) memcQuality = q;
    if (u >= 0 && u < MEMC_UP_CAPS.length) memcUpscale = u;
  } catch (e){}
  const MEMC_DELAY_KEY = 'playerMemcDelayGL';
  let memcDelayGL = true;   // carry the picture delay on the GPU engine when smoothing is off/skipped
  // Hidden decode compensation: a fixed extra picture delay added to every video to cover the
  // browser's own decoding lag. It is never shown on (or saved with) the latency slider.
  const DECODE_COMP_KEY = 'playerDecodeComp';
  const DECODE_COMP_MS = 300;
  let decodeComp = true;
  try { if (localStorage.getItem(DECODE_COMP_KEY) === '0') decodeComp = false; } catch (e){}
  // Total delay the picture/subtitles would normally get: slider + hidden decode compensation.
  function netLatencyMs(){
    const isVideo = currentIndex !== -1 && tracks[currentIndex] && tracks[currentIndex].kind === 'video';
    return subtitleLatencyMs + (decodeComp && isVideo ? DECODE_COMP_MS : 0);
  }
  // What the picture engines, subtitles and sound-delay use. While audio lead is running the
  // picture is left alone (zero delay) and the sound plays ahead instead.
  function effLatencyMs(){
    const n = netLatencyMs();
    return (audioLeadActive && n > 0) ? 0 : n;
  }

