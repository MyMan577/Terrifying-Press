  // ---------- Fullscreen ----------
  fullscreenBtn.addEventListener('click', () => {
    if (document.fullscreenElement){
      document.exitFullscreen();
    } else {
      videoWrap.requestFullscreen().catch(()=>{});
    }
  });
  document.addEventListener('fullscreenchange', () => {
    fullscreenBtn.classList.toggle('toggled', !!document.fullscreenElement);
    if (!document.fullscreenElement){ releaseRotation(); return; }
    // Entering fullscreen on a video turns the screen to match it (landscape video -> landscape), like any video app.
    // The Rotate button's own choice wins if it is already in charge.
    if (!rotationLocked && document.fullscreenElement === videoWrap && currentIndex !== -1 && tracks[currentIndex] && tracks[currentIndex].kind === 'video'){
      lockOrientation(videoOrientation()).then(() => { orientAuto = true; }).catch(() => {});
    }
  });

  // ---------- Force rotate ----------
  // Flips the phone between landscape and portrait. Browsers only allow an orientation
  // lock while fullscreen, so this enters fullscreen first. Not available on iOS Safari.
  const rotateBtn = document.getElementById('rotate-btn');
  let rotationLocked = false;   // the Rotate button forced an orientation
  let orientAuto = false;       // fullscreen matched the screen to the video
  // Tries, in order: the Capacitor Screen Orientation plugin (the Android app's WebView has no web lock),
  // then the browser's screen.orientation.lock (which needs fullscreen).
  const capOrient = () => { try { return (window.Capacitor && Capacitor.Plugins && Capacitor.Plugins.ScreenOrientation) || null; } catch(e){ return null; } };
  async function lockOrientation(target){
    const cap = capOrient();
    if (cap && typeof cap.lock === 'function'){ await cap.lock({ orientation: target }); return; }
    const so = screen.orientation;
    if (!so || typeof so.lock !== 'function') throw new Error('unsupported');
    try { await so.lock(target); }
    catch(e){ await new Promise(r => setTimeout(r, 200)); await so.lock(target); }   // right after entering fullscreen the first try can be refused
  }
  function unlockOrientation(){
    try { const cap = capOrient(); if (cap && typeof cap.unlock === 'function') cap.unlock(); else screen.orientation.unlock(); } catch(e){}
  }
  function videoOrientation(){
    return videoEl.videoWidth && videoEl.videoHeight && videoEl.videoHeight > videoEl.videoWidth ? 'portrait' : 'landscape';
  }
  function releaseRotation(){
    if (!rotationLocked && !orientAuto) return;
    rotationLocked = false; orientAuto = false;
    rotateBtn.classList.remove('toggled');
    unlockOrientation();
  }
  rotateBtn.addEventListener('click', async () => {
    const cur = (screen.orientation && screen.orientation.type) || (window.innerWidth > window.innerHeight ? 'landscape' : 'portrait');
    const target = /^landscape/.test(cur) ? 'portrait' : 'landscape';
    const hadLock = rotationLocked, hadAuto = orientAuto;
    rotationLocked = true;   // so the fullscreen auto-lock does not fight this choice
    try {
      try { if (!document.fullscreenElement) await videoWrap.requestFullscreen(); }
      catch(e){ if (!capOrient()) throw e; }   // the plugin does not need fullscreen
      await lockOrientation(target);
      orientAuto = false;
      rotateBtn.classList.add('toggled');
    } catch(e){
      rotationLocked = hadLock; orientAuto = hadAuto;
      showToast(e && e.message === 'unsupported'
        ? 'This phone can\u2019t lock the screen. Turn on auto-rotate and turn your phone.'
        : 'Couldn\u2019t rotate the screen here.', 'error');
    }
  });

  // ---------- Picture-in-Picture ----------
  const immersiveBtn = document.getElementById('immersive-btn');
  immersiveBtn.addEventListener('click', () => {
    document.body.classList.toggle('immersive');
    applyImmersiveBackground();
  });

  // ---------- Gesture / tap controls ----------
  // Tap zones split each surface (disc / video) into left / center / right
  // thirds. Every zone independently recognizes: single tap, double tap,
  // long-press, and the four swipe directions. Actions are looked up from
  // GESTURE_MAP, which presets fill in and "Custom" lets the user edit
  // per-slot via the settings dropdowns.
  const GESTURE_ACTIONS = {
    none:          { label: 'Nothing', run: () => {} },
    playPause:     { label: 'Play / Pause', run: () => togglePlay() },
    next:          { label: 'Next track', run: () => { if (currentIndex !== -1) loadTrack(nextTrackIndex(), true); } },
    prev:          { label: 'Previous track', run: () => { if (currentIndex !== -1) loadTrack(prevTrackIndex(), true); } },
    seekFwd10:     { label: 'Seek +10s', run: () => { media().currentTime = (isFinite(media().duration) && media().duration > 0) ? Math.min(media().duration, media().currentTime + 10) : media().currentTime + 10; } },
    seekBack10:    { label: 'Seek -10s', run: () => { media().currentTime = Math.max(0, media().currentTime - 10); } },
    seekFwd30:     { label: 'Seek +30s', run: () => { media().currentTime = (isFinite(media().duration) && media().duration > 0) ? Math.min(media().duration, media().currentTime + 30) : media().currentTime + 30; } },
    seekBack30:    { label: 'Seek -30s', run: () => { media().currentTime = Math.max(0, media().currentTime - 30); } },
    volUp:         { label: 'Volume +10%', run: () => { volume.value = Math.min(100, parseFloat(volume.value) + 10); volume.dispatchEvent(new Event('input')); saveSettings(); } },
    volDown:       { label: 'Volume -10%', run: () => { volume.value = Math.max(0, parseFloat(volume.value) - 10); volume.dispatchEvent(new Event('input')); saveSettings(); } },
    mute:          { label: 'Mute / unmute', run: () => { const m = media(); m.muted = !m.muted; updateVolIcon(); } },
    fullscreen:    { label: 'Toggle fullscreen', run: () => {
        if (document.fullscreenElement) document.exitFullscreen();
        else if (currentIndex !== -1 && tracks[currentIndex] && tracks[currentIndex].kind === 'video') videoWrap.requestFullscreen().catch(()=>{});
      } },
    immersive:     { label: 'Toggle immersive', run: () => { document.body.classList.toggle('immersive'); applyImmersiveBackground(); } },
    nextFilter:    { label: 'Next video filter', run: () => {
        const names = Object.keys(VIDEO_FILTERS);
        const idx = (names.indexOf(activeFilter) + 1) % names.length;
        const name = names[idx];
        activeFilter = name;
        filterGrid.querySelectorAll('button').forEach(b => b.classList.toggle('active', b.dataset.filter === name));
        filterBtn.classList.toggle('toggled', name !== 'none');
        applyVideoFilter();
        saveSettings();
      } },
    nextEqPreset:  { label: 'Next EQ preset', run: () => {
        const names = Object.keys(EQ_PRESETS);
        let idx = names.findIndex(n => EQ_PRESETS[n].every((v,i)=>Math.abs(v-eqGains[i])<0.01));
        idx = (idx + 1) % names.length;
        eqGains = EQ_PRESETS[names[idx]].slice();
        refreshEqSlidersUI();
        updateEqPresetHighlight();
        if (names[idx] !== 'flat' && !eqEnabled) setEqEnabled(true); else applyEqAll();
        saveSettings();
      } },
    frameBack:     { label: 'Step back one frame', run: () => stepFrame(-1) },
    frameFwd:      { label: 'Step forward one frame', run: () => stepFrame(1) },
    cycleFit:      { label: 'Cycle video fit', run: () => cycleViewFit() },
    cycleZoom:     { label: 'Cycle video zoom', run: () => cycleViewZoom() },
    shuffle:       { label: 'Toggle shuffle', run: () => shuffleBtn.click() },
    repeat:        { label: 'Cycle repeat mode', run: () => repeatBtn.click() },
    zoomIn:        { label: 'Zoom in', run: () => stepViewZoom(1) },
    zoomOut:       { label: 'Zoom out', run: () => stepViewZoom(-1) },
    zoomReset:     { label: 'Reset zoom & fit', run: () => resetViewMode() },
    speedUp:       { label: 'Speed +0.25x', run: () => stepSpeed(0.25) },
    speedDown:     { label: 'Speed -0.25x', run: () => stepSpeed(-0.25) },
    speedReset:    { label: 'Reset speed to 1x', run: () => setSpeedTo(1) },
    restart:       { label: 'Restart track', run: () => { const m = media(); if (m) m.currentTime = 0; } },
    seekFwd60:     { label: 'Seek +60s', run: () => { media().currentTime = (isFinite(media().duration) && media().duration > 0) ? Math.min(media().duration, media().currentTime + 60) : media().currentTime + 60; } },
    seekBack60:    { label: 'Seek -60s', run: () => { media().currentTime = Math.max(0, media().currentTime - 60); } }
  };

  // Slots: which zone/gesture combos are configurable. "zone" is left/
  // center/right (ignored for swipe & longPress, which act on the whole
  // surface no matter where they start).
  const GESTURE_SLOTS = [
    { id: 'tapLeft',      zone: 'left',   kind: 'tap',        label: 'Tap left' },
    { id: 'tapCenter',    zone: 'center', kind: 'tap',        label: 'Tap center' },
    { id: 'tapRight',     zone: 'right',  kind: 'tap',        label: 'Tap right' },
    { id: 'doubleLeft',   zone: 'left',   kind: 'doubletap',  label: 'Double-tap left' },
    { id: 'doubleCenter', zone: 'center', kind: 'doubletap',  label: 'Double-tap center' },
    { id: 'doubleRight',  zone: 'right',  kind: 'doubletap',  label: 'Double-tap right' },
    { id: 'tripleLeft',   zone: 'left',   kind: 'tripletap',  label: 'Triple-tap left' },
    { id: 'tripleCenter', zone: 'center', kind: 'tripletap',  label: 'Triple-tap center' },
    { id: 'tripleRight',  zone: 'right',  kind: 'tripletap',  label: 'Triple-tap right' },
    { id: 'longPress',    zone: 'any',    kind: 'longpress',  label: 'Long-press' },
    { id: 'pinchOut',     zone: 'any',    kind: 'pinchout',   label: 'Pinch out (spread)' },
    { id: 'pinchIn',      zone: 'any',    kind: 'pinchin',    label: 'Pinch in' },
    { id: 'twoFingerTap', zone: 'any',    kind: 'twotap',     label: 'Two-finger tap' },
    { id: 'twoSwipeUp',   zone: 'any',    kind: 'twoswipeup', label: 'Two-finger swipe up' },
    { id: 'twoSwipeDown', zone: 'any',    kind: 'twoswipedown', label: 'Two-finger swipe down' },
    { id: 'twoSwipeLeft', zone: 'any',    kind: 'twoswipeleft', label: 'Two-finger swipe left' },
    { id: 'twoSwipeRight',zone: 'any',    kind: 'twoswiperight', label: 'Two-finger swipe right' },
    { id: 'swipeUp',      zone: 'any',    kind: 'swipeup',    label: 'Swipe up' },
    { id: 'swipeDown',    zone: 'any',    kind: 'swipedown',  label: 'Swipe down' },
    { id: 'swipeLeft',    zone: 'any',    kind: 'swipeleft',  label: 'Swipe left' },
    { id: 'swipeRight',   zone: 'any',    kind: 'swiperight', label: 'Swipe right' }
  ];

  const GESTURE_PRESETS = {
    standard: {
      tapLeft: 'none', tapCenter: 'playPause', tapRight: 'none',
      doubleLeft: 'seekBack10', doubleCenter: 'playPause', doubleRight: 'seekFwd10',
      tripleLeft: 'prev', tripleCenter: 'mute', tripleRight: 'next',
      longPress: 'fullscreen',
      pinchOut: 'zoomIn', pinchIn: 'zoomOut', twoFingerTap: 'playPause',
      twoSwipeUp: 'speedUp', twoSwipeDown: 'speedDown', twoSwipeLeft: 'seekBack60', twoSwipeRight: 'seekFwd60',
      swipeUp: 'volUp', swipeDown: 'volDown', swipeLeft: 'prev', swipeRight: 'next'
    },
    minimal: {
      tapLeft: 'none', tapCenter: 'playPause', tapRight: 'none',
      doubleLeft: 'none', doubleCenter: 'none', doubleRight: 'none',
      tripleLeft: 'none', tripleCenter: 'none', tripleRight: 'none',
      longPress: 'none',
      pinchOut: 'none', pinchIn: 'none', twoFingerTap: 'none',
      twoSwipeUp: 'none', twoSwipeDown: 'none', twoSwipeLeft: 'none', twoSwipeRight: 'none',
      swipeUp: 'none', swipeDown: 'none', swipeLeft: 'none', swipeRight: 'none'
    },
    oneHanded: {
      tapLeft: 'prev', tapCenter: 'playPause', tapRight: 'next',
      doubleLeft: 'seekBack10', doubleCenter: 'mute', doubleRight: 'seekFwd10',
      tripleLeft: 'seekBack30', tripleCenter: 'fullscreen', tripleRight: 'seekFwd30',
      longPress: 'immersive',
      pinchOut: 'zoomIn', pinchIn: 'zoomOut', twoFingerTap: 'mute',
      twoSwipeUp: 'speedUp', twoSwipeDown: 'speedDown', twoSwipeLeft: 'prev', twoSwipeRight: 'next',
      swipeUp: 'volUp', swipeDown: 'volDown', swipeLeft: 'seekBack30', swipeRight: 'seekFwd30'
    }
  };

  let gesturesEnabled = true;
  let gesturePreset = 'standard';
  let gestureMap = Object.assign({}, GESTURE_PRESETS.standard);
  const GESTURE_KEY = 'playerGestureSettings';

  function loadGestureSettings(){
    try { return JSON.parse(localStorage.getItem(GESTURE_KEY)) || {}; }
    catch(e){ return {}; }
  }
  function saveGestureSettings(){
    try {
      localStorage.setItem(GESTURE_KEY, JSON.stringify({ gesturesEnabled, gesturePreset, gestureMap }));
    } catch(e){}
  }

  const gesturesEnabledToggle = document.getElementById('gestures-enabled-toggle');
  const gesturesConfig = document.getElementById('gestures-config');
  const gesturePresetRow = document.getElementById('gesture-preset-row');
  const gestureMapList = document.getElementById('gesture-map-list');

  function renderGestureMapList(){
    gestureMapList.innerHTML = '';
    GESTURE_SLOTS.forEach(slot => {
      const row = document.createElement('div');
      row.className = 'gesture-map-row';
      const zoneNote = slot.zone === 'any' ? '' : `<small>${slot.zone} zone</small>`;
      row.innerHTML = `
        <span class="gesture-map-label">${slot.label}${zoneNote}</span>
        <select class="gesture-map-select" data-slot="${slot.id}"></select>
      `;
      const select = row.querySelector('select');
      Object.keys(GESTURE_ACTIONS).forEach(key => {
        const opt = document.createElement('option');
        opt.value = key;
        opt.textContent = GESTURE_ACTIONS[key].label;
        select.appendChild(opt);
      });
      select.value = gestureMap[slot.id] || 'none';
      select.addEventListener('change', () => {
        gestureMap[slot.id] = select.value;
        gesturePreset = 'custom';
        updateGesturePresetHighlight();
        saveGestureSettings();
      });
      gestureMapList.appendChild(row);
    });
  }

  function updateGesturePresetHighlight(){
    gesturePresetRow.querySelectorAll('button').forEach(b => {
      b.classList.toggle('active', b.dataset.gesturePreset === gesturePreset);
    });
  }

  function setGesturesEnabled(on){
    gesturesEnabled = on;
    gesturesEnabledToggle.checked = on;
    gesturesConfig.style.display = on ? '' : 'none';
  }

  gesturesEnabledToggle.addEventListener('change', () => {
    setGesturesEnabled(gesturesEnabledToggle.checked);
    saveGestureSettings();
  });

  gesturePresetRow.querySelectorAll('button[data-gesture-preset]').forEach(btn => {
    btn.addEventListener('click', () => {
      const name = btn.dataset.gesturePreset;
      if (name === 'custom'){
        gesturePreset = 'custom';
        updateGesturePresetHighlight();
        saveGestureSettings();
        return;
      }
      gestureMap = Object.assign({}, GESTURE_PRESETS[name]);
      gesturePreset = name;
      renderGestureMapList();
      updateGesturePresetHighlight();
      saveGestureSettings();
    });
  });

  function restoreGestureSettings(){
    const s = loadGestureSettings();
    if (typeof s.gesturesEnabled === 'boolean') setGesturesEnabled(s.gesturesEnabled);
    else setGesturesEnabled(true);
    if (s.gestureMap && typeof s.gestureMap === 'object'){
      gestureMap = Object.assign({}, GESTURE_PRESETS.standard, s.gestureMap);
    }
    gesturePreset = (typeof s.gesturePreset === 'string' && (GESTURE_PRESETS[s.gesturePreset] || s.gesturePreset === 'custom'))
      ? s.gesturePreset : 'standard';
    renderGestureMapList();
    updateGesturePresetHighlight();
  }
  restoreGestureSettings();

  // ---------- Gesture recognition ----------
  // Small icon set for the toast, reusing the same stroke style as the
  // rest of the transport icons.
  const GESTURE_ICONS = {
    playPause: '<path d="M8 5v14l11-7z"/>',
    next: '<path d="M16 6h2v12h-2zM6 6l8.5 6L6 18z"/>',
    prev: '<path d="M6 6h2v12H6zm3.5 6l8.5 6V6z"/>',
    seekFwd10: '<path d="M13 3a9 9 0 1 1-8.94 10"/><path d="M4 3v6h6"/>',
    seekBack10: '<path d="M11 3a9 9 0 1 0 8.94 10"/><path d="M20 3v6h-6"/>',
    seekFwd30: '<path d="M13 3a9 9 0 1 1-8.94 10"/><path d="M4 3v6h6"/>',
    seekBack30: '<path d="M11 3a9 9 0 1 0 8.94 10"/><path d="M20 3v6h-6"/>',
    volUp: '<path d="M11 5 6 9H2v6h4l5 4z"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"/>',
    volDown: '<path d="M11 5 6 9H2v6h4l5 4z"/><line x1="23" y1="9" x2="17" y2="15"/><line x1="17" y1="9" x2="23" y2="15"/>',
    mute: '<path d="M11 5 6 9H2v6h4l5 4z"/><line x1="23" y1="9" x2="17" y2="15"/><line x1="17" y1="9" x2="23" y2="15"/>',
    fullscreen: '<path d="M8 3H5a2 2 0 0 0-2 2v3M16 3h3a2 2 0 0 1 2 2v3M8 21H5a2 2 0 0 1-2-2v-3M16 21h3a2 2 0 0 0 2-2v-3"/>',
    immersive: '<path d="M8 3H5a2 2 0 0 0-2 2v3M16 3h3a2 2 0 0 1 2 2v3M8 21H5a2 2 0 0 1-2-2v-3M16 21h3a2 2 0 0 0 2-2v-3"/>',
    nextFilter: '<circle cx="12" cy="12" r="9"/><path d="M12 3a9 9 0 0 0 0 18"/><path d="M12 7a5 5 0 0 0 0 10"/>',
    nextEqPreset: '<line x1="4" y1="21" x2="4" y2="14"/><line x1="4" y1="10" x2="4" y2="3"/><line x1="12" y1="21" x2="12" y2="12"/><line x1="12" y1="8" x2="12" y2="3"/><line x1="20" y1="21" x2="20" y2="16"/><line x1="20" y1="12" x2="20" y2="3"/>',
    shuffle: '<polyline points="16 3 21 3 21 8"/><line x1="4" y1="20" x2="21" y2="3"/><polyline points="21 16 21 21 16 21"/><line x1="15" y1="15" x2="21" y2="21"/><line x1="4" y1="4" x2="9" y2="9"/>',
    zoomIn: '<circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.5" y2="16.5"/><line x1="11" y1="8" x2="11" y2="14"/><line x1="8" y1="11" x2="14" y2="11"/>',
    zoomOut: '<circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.5" y2="16.5"/><line x1="8" y1="11" x2="14" y2="11"/>',
    zoomReset: '<circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.5" y2="16.5"/>',
    speedUp: '<polygon points="13 19 22 12 13 5 13 19"/><polygon points="2 19 11 12 2 5 2 19"/>',
    speedDown: '<polygon points="11 19 2 12 11 5 11 19"/><polygon points="22 19 13 12 22 5 22 19"/>',
    speedReset: '<circle cx="12" cy="12" r="9"/><polyline points="12 7 12 12 15 14"/>',
    restart: '<path d="M3 12a9 9 0 1 0 3-6.7"/><path d="M3 4v5h5"/>',
    seekFwd60: '<path d="M13 3a9 9 0 1 1-8.94 10"/><path d="M4 3v6h6"/>',
    seekBack60: '<path d="M11 3a9 9 0 1 0 8.94 10"/><path d="M20 3v6h-6"/>',
    repeat: '<polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/>'
  };

  function showGestureToast(surfaceEl, actionKey){
    const toast = surfaceEl.querySelector('.gesture-toast');
    if (!toast) return;
    const action = GESTURE_ACTIONS[actionKey];
    if (!action || actionKey === 'none') return;
    const icon = GESTURE_ICONS[actionKey];
    toast.innerHTML = (icon ? `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${icon}</svg>` : '') +
      `<span>${action.label}</span>`;
    toast.classList.add('show');
    clearTimeout(toast._hideTimer);
    toast._hideTimer = setTimeout(() => toast.classList.remove('show'), 550);
  }

  function flashZone(surfaceEl, zone){
    const el = surfaceEl.querySelector(`.gesture-flash-${zone === 'any' ? 'center' : zone}`);
    if (!el) return;
    el.classList.add('show');
    clearTimeout(el._flashTimer);
    el._flashTimer = setTimeout(() => el.classList.remove('show'), 180);
  }

  function runGesture(surfaceEl, slotId, zone){
    if (window.__ppTap && (slotId === 'tapLeft' || slotId === 'tapCenter' || slotId === 'tapRight') && window.__ppTap()) return;
    if (!gesturesEnabled) return;
    const actionKey = ((window.__ppGestureMap && window.__ppGestureMap()) || gestureMap)[slotId] || 'none';
    const action = GESTURE_ACTIONS[actionKey];
    if (!action || actionKey === 'none') return;
    // Pinching is continuous, so skip the zone highlight and action callout for it.
    if (slotId !== 'pinchOut' && slotId !== 'pinchIn'){
      flashZone(surfaceEl, zone);
      showGestureToast(surfaceEl, actionKey);
      action.run();
    } else {
      window.__ppQuietZoom = true;
      try { action.run(); } finally { window.__ppQuietZoom = false; }
    }
  }

  function setupGestureSurface(wrapEl){
    const layer = wrapEl.querySelector('.gesture-layer');
    if (!layer) return;

    const MULTI_MS = 300;          // max gap between taps in a double / triple tap
    const LONGPRESS_MS = 550;
    const SWIPE_MIN_PX = 40;
    const TAP_MOVE_TOLERANCE = 12;
    const PINCH_STEP = 1.28;       // finger-distance ratio that counts as one pinch step
    const TWO_TAP_MAX_MS = 350;

    let tapCount = 0;
    let lastTapZone = null;
    let tapTimer = null;
    let longPressTimer = null;
    let longPressFired = false;
    let startX = 0, startY = 0, startedOnControl = false;
    let lastTouchTime = 0;
    // pan-when-zoomed state (only active on the video surface)
    const canPan = wrapEl === videoWrap;
    let panLastX = 0, panLastY = 0, panMoved = 0, panning = false;
    function panBegin(x, y){ if (canPan && viewIsZoomed()) refreshViewSize(); panLastX = x; panLastY = y; panMoved = 0; panning = false; }
    function panMove(x, y){
      if (!canPan || !viewIsZoomed()) return false;
      const dx = x - panLastX, dy = y - panLastY;
      panLastX = x; panLastY = y;
      panMoved += Math.hypot(dx, dy);
      if (panMoved > TAP_MOVE_TOLERANCE){
        if (!panning){
          panning = true; clearTimeout(longPressTimer); cancelTapSequence();
          wrapEl.setAttribute('data-vpanning','');
        }
        panViewBy(dx, dy);
      }
      return panning;
    }
    function panEnd(){
      const was = panning;
      panning = false; panMoved = 0;
      wrapEl.removeAttribute('data-vpanning');
      return was;
    }

    // two-finger state
    let multi = false;             // true from the 2nd finger down until all fingers lift
    let mStartDist = 0, mRefDist = 0, mStartT = 0;
    let mStartCx = 0, mStartCy = 0, mCx = 0, mCy = 0;
    let mPinched = false, mPanned = false, mMaxMove = 0, mMaxDistDelta = 0, mEvaluated = false;

    function zoneFromX(x){
      const rect = layer.getBoundingClientRect();
      const frac = (x - rect.left) / rect.width;
      if (frac < 1/3) return 'left';
      if (frac > 2/3) return 'right';
      return 'center';
    }

    function isInteractive(target){
      // Don't hijack taps on the real controls (subtitle/filter/pip/
      // fullscreen buttons, their dropdowns, or the art image itself).
      return !!target.closest('button, a, input, select, .video-tool-btn, #subtitle-overlay');
    }

    function slotAction(id){
      return ((window.__ppGestureMap && window.__ppGestureMap()) || gestureMap)[id] || 'none';
    }

    function cancelTapSequence(){
      clearTimeout(tapTimer);
      tapCount = 0;
      lastTapZone = null;
    }

    function onStart(x, y, target){
      startedOnControl = isInteractive(target);
      if (startedOnControl) return;
      startX = x; startY = y;
      panBegin(x, y);
      longPressFired = false;
      longPressTimer = setTimeout(() => {
        longPressFired = true;
        cancelTapSequence();
        runGesture(wrapEl, 'longPress', 'any');
      }, LONGPRESS_MS);
    }

    function onEnd(x, y){
      clearTimeout(longPressTimer);
      if (startedOnControl) return;
      if (panEnd()) return; // it was a pan drag, not a swipe/tap
      const dx = x - startX, dy = y - startY;
      const dist = Math.hypot(dx, dy);
      if (longPressFired) return; // already handled on the timer

      if (dist > SWIPE_MIN_PX){
        cancelTapSequence();
        if (Math.abs(dx) > Math.abs(dy)){
          runGesture(wrapEl, dx > 0 ? 'swipeRight' : 'swipeLeft', 'any');
        } else {
          runGesture(wrapEl, dy > 0 ? 'swipeDown' : 'swipeUp', 'any');
        }
        return;
      }
      if (dist > TAP_MOVE_TOLERANCE) return; // an ambiguous drag, not a tap

      const zone = zoneFromX(x);
      const zoneCap = zone.charAt(0).toUpperCase() + zone.slice(1);
      // Taps in a different zone restart the count.
      if (lastTapZone !== zone) tapCount = 0;
      lastTapZone = zone;
      tapCount++;
      clearTimeout(tapTimer);

      const hasTriple = slotAction('triple' + zoneCap) !== 'none';
      const fire = (n) => {
        const id = (n >= 3 ? 'triple' : n === 2 ? 'double' : 'tap') + zoneCap;
        tapCount = 0; lastTapZone = null;
        runGesture(wrapEl, id, zone);
      };

      if (tapCount >= 3){
        fire(3);
      } else if (tapCount === 2 && !hasTriple){
        fire(2); // nothing is bound to a triple tap here, so keep double-tap instant
      } else {
        const n = tapCount;
        tapTimer = setTimeout(() => fire(n), MULTI_MS);
      }
    }

