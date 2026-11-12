    /* ---------- Two-finger gestures ---------- */
    function pts(e){
      const a = e.touches[0], b = e.touches[1];
      return { d: Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY),
               cx: (a.clientX + b.clientX) / 2, cy: (a.clientY + b.clientY) / 2 };
    }
    function beginMulti(e){
      multi = true;
      clearTimeout(longPressTimer);
      cancelTapSequence();
      const p = pts(e);
      mStartDist = mRefDist = p.d;
      mStartCx = mCx = p.cx; mStartCy = mCy = p.cy;
      panBegin(p.cx, p.cy);
      mStartT = Date.now();
      mPinched = false; mPanned = false; mMaxMove = 0; mMaxDistDelta = 0; mEvaluated = false;
    }
    function moveMulti(e){
      if (e.touches.length < 2) return;
      const p = pts(e);
      mCx = p.cx; mCy = p.cy;
      if (panMove(p.cx, p.cy)) mPanned = true;
      mMaxMove = Math.max(mMaxMove, Math.hypot(p.cx - mStartCx, p.cy - mStartCy));
      mMaxDistDelta = Math.max(mMaxDistDelta, Math.abs(p.d - mStartDist));
      if (!mRefDist) return;
      const ratio = p.d / mRefDist;
      // Fires repeatedly as the fingers keep spreading / closing, so a long
      // pinch can step through several zoom levels.
      if (ratio >= PINCH_STEP){
        mPinched = true; mRefDist = p.d;
        runGesture(wrapEl, 'pinchOut', 'any');
      } else if (ratio <= 1 / PINCH_STEP){
        mPinched = true; mRefDist = p.d;
        runGesture(wrapEl, 'pinchIn', 'any');
      }
    }
    function endMulti(){
      panEnd();
      if (mPinched || mPanned) return;
      const dt = Date.now() - mStartT;
      const dx = mCx - mStartCx, dy = mCy - mStartCy;
      if (mMaxMove > SWIPE_MIN_PX && mMaxDistDelta < 50){
        if (Math.abs(dx) > Math.abs(dy)) runGesture(wrapEl, dx > 0 ? 'twoSwipeRight' : 'twoSwipeLeft', 'any');
        else runGesture(wrapEl, dy > 0 ? 'twoSwipeDown' : 'twoSwipeUp', 'any');
      } else if (dt < TWO_TAP_MAX_MS && mMaxMove < TAP_MOVE_TOLERANCE * 1.5 && mMaxDistDelta < 24){
        runGesture(wrapEl, 'twoFingerTap', 'any');
      }
    }

    layer.addEventListener('touchstart', (e) => {
      lastTouchTime = Date.now();
      if (e.touches.length >= 2){
        if (isInteractive(e.target)) return;
        beginMulti(e);
        return;
      }
      if (multi) return;
      const t = e.touches[0];
      onStart(t.clientX, t.clientY, e.target);
    }, { passive: true });
    layer.addEventListener('touchend', (e) => {
      lastTouchTime = Date.now();
      if (multi){
        // Evaluate once, when the first finger lifts. The remaining finger is
        // ignored until it lifts too so it can't be mistaken for a tap/swipe.
        if (!mEvaluated){ mEvaluated = true; endMulti(); }
        if (e.touches.length === 0) multi = false;
        return;
      }
      const t = e.changedTouches[0];
      onEnd(t.clientX, t.clientY);
    }, { passive: true });
    layer.addEventListener('touchmove', (e) => {
      if (multi){ moveMulti(e); return; }
      if (!startedOnControl && e.touches.length === 1 && panMove(e.touches[0].clientX, e.touches[0].clientY)) return;
      // Any real movement cancels a pending long-press so scrolling/
      // swiping doesn't also fire the press action.
      if (!longPressFired) clearTimeout(longPressTimer);
    }, { passive: true });
    layer.addEventListener('touchcancel', () => {
      multi = false; clearTimeout(longPressTimer); panEnd();
    }, { passive: true });
    // iOS Safari reports pinches as proprietary gesture events and would
    // otherwise zoom the whole page.
    ['gesturestart', 'gesturechange', 'gestureend'].forEach(n =>
      layer.addEventListener(n, (e) => e.preventDefault()));

    // Desktop: trackpad pinch arrives as a ctrl+wheel event.
    let wheelAcc = 0, wheelLast = 0;
    layer.addEventListener('wheel', (e) => {
      if (!e.ctrlKey){
        // Zoomed in: trackpad / wheel scrolling pans the view.
        if (canPan && viewIsZoomed()){ e.preventDefault(); panViewBy(-e.deltaX, -e.deltaY); }
        return;
      }
      e.preventDefault();
      const now = Date.now();
      if (now - wheelLast > 400) wheelAcc = 0;
      wheelLast = now;
      wheelAcc += e.deltaY;
      if (Math.abs(wheelAcc) >= 40){
        runGesture(wrapEl, wheelAcc < 0 ? 'pinchOut' : 'pinchIn', 'any');
        wheelAcc = 0;
      }
    }, { passive: false });

    // Mouse support (desktop trackpad "tap", click-drag as swipe) so the
    // same zones work when testing without a touchscreen. Touchscreens
    // also fire a synthetic mousedown/mouseup shortly after every real
    // touch, which would otherwise be re-processed as a second tap and
    // land inside the multi-tap window; skip mouse events that closely
    // follow a real touch on this surface.
    let mouseDown = false;
    layer.addEventListener('mousedown', (e) => {
      if (Date.now() - lastTouchTime < 800) return;
      mouseDown = true;
      onStart(e.clientX, e.clientY, e.target);
    });
    window.addEventListener('mouseup', (e) => {
      if (Date.now() - lastTouchTime < 800) return;
      if (!mouseDown) return;
      mouseDown = false;
      onEnd(e.clientX, e.clientY);
    });
    layer.addEventListener('mousemove', (e) => {
      if (mouseDown && panMove(e.clientX, e.clientY)) return;
      if (mouseDown && !longPressFired) clearTimeout(longPressTimer);
    });
  }

  setupGestureSurface(vizWrap);
  setupGestureSurface(videoWrap);

  // ---------- UI Customization (background color / gradient / image) ----------
  const sidebarEl = document.getElementById('sidebar');
  const controlsColEl = document.getElementById('controls-col');
  const mainEl = document.getElementById('main');
  const customizeBtn = document.getElementById('customize-btn');
  const customizeModalOverlay = document.getElementById('customize-modal-overlay');
  const customizeTabs = document.querySelectorAll('.customize-tab');
  const customizePreview = document.getElementById('customize-preview');
  const customizeTypeBtns = document.querySelectorAll('.customize-type-btn');
  const customizeGroupColor = document.getElementById('customize-group-color');
  const customizeGroupGradient = document.getElementById('customize-group-gradient');
  const customizeGroupImage = document.getElementById('customize-group-image');
  const customizeColorInput = document.getElementById('customize-color-input');
  const customizeGradientColor1 = document.getElementById('customize-gradient-color1');
  const customizeGradientColor2 = document.getElementById('customize-gradient-color2');
  const customizeGradientAngle = document.getElementById('customize-gradient-angle');
  const customizeGradientAngleValue = document.getElementById('customize-gradient-angle-value');
  const customizeImageInput = document.getElementById('customize-image-input');
  const customizeImageUploadBtn = document.getElementById('customize-image-upload-btn');
  const customizeImageUploadLabel = document.getElementById('customize-image-upload-label');
  const customizeImageName = document.getElementById('customize-image-name');
  const customizeImageFit = document.getElementById('customize-image-fit');
  const customizeImageDim = document.getElementById('customize-image-dim');
  const customizeImageDimValue = document.getElementById('customize-image-dim-value');
  const customizeResetBtn = document.getElementById('customize-reset-btn');
  const customizeDoneBtn = document.getElementById('customize-done-btn');
  const customizeTabHint = document.getElementById('customize-tab-hint');
  const customizeButtonColorRow = document.getElementById('customize-button-color-row');
  const customizeButtonColorInput = document.getElementById('customize-button-color-input');
  const customizeButtonColorResetBtn = document.getElementById('customize-button-color-reset-btn');

  const CUSTOMIZE_KEY = 'playerUICustomization';
  const CUSTOMIZE_TARGETS = ['app','playlist','controls','immersive'];
  let uiCustomization = {
    app: { type: 'default' },
    playlist: { type: 'default' },
    controls: { type: 'default' },
    immersive: { type: 'default' }
  };
  let customizeActiveTab = 'app';

  function buildBackgroundCSS(cfg){
    if (!cfg || cfg.type === 'default') return null;
    if (cfg.type === 'color'){
      return { backgroundColor: cfg.color || '#0c0d10', backgroundImage: 'none' };
    }
    if (cfg.type === 'gradient'){
      const c1 = cfg.color1 || '#0c0d10', c2 = cfg.color2 || '#3a5f57';
      const ang = cfg.angle != null ? cfg.angle : 135;
      return { backgroundImage: `linear-gradient(${ang}deg, ${c1}, ${c2})`, backgroundColor: 'transparent' };
    }
    if (cfg.type === 'animated'){
      // Same idea as 'gradient' but with the start color repeated at the far
      // end and a much larger background-size (see .ppxp-anim-bg), so the
      // slow position animation has room to drift instead of looping a
      // visible seam. Unlocked cosmetic reward - see the Press Play XP block.
      const c1 = cfg.color1 || '#0c0d10', c2 = cfg.color2 || '#3a5f57';
      const ang = cfg.angle != null ? cfg.angle : 135;
      return { backgroundImage: `linear-gradient(${ang}deg, ${c1}, ${c2}, ${c1})`, backgroundColor: 'transparent' };
    }
    if (cfg.type === 'image' && cfg.dataUrl){
      const dim = (cfg.dim != null ? cfg.dim : 30) / 100;
      const overlay = dim > 0 ? `linear-gradient(rgba(0,0,0,${dim}), rgba(0,0,0,${dim})), ` : '';
      let size = 'cover', repeat = 'no-repeat';
      if (cfg.fit === 'contain'){ size = 'contain'; }
      else if (cfg.fit === 'tile'){ size = 'auto'; repeat = 'repeat'; }
      return {
        backgroundImage: `${overlay}url("${cfg.dataUrl}")`,
        backgroundSize: size,
        backgroundRepeat: repeat,
        backgroundPosition: 'center',
        backgroundColor: 'transparent'
      };
    }
    return null;
  }

  function clearCustomStyle(el){
    el.style.backgroundImage = '';
    el.style.backgroundColor = '';
    el.style.backgroundSize = '';
    el.style.backgroundRepeat = '';
    el.style.backgroundPosition = '';
    el.style.removeProperty('--flat-c1');
    el.style.removeProperty('--flat-c2');
  }

  function applyStyleTo(el, cfg){
    if (el === sidebarEl && window.__ppOnCustomize) window.__ppOnCustomize();
    clearCustomStyle(el);
    const css = buildBackgroundCSS(cfg);
    el.classList.toggle('custom-bg-active', !!css);
    el.classList.toggle('ppxp-anim-bg', !!(cfg && cfg.type === 'animated'));
    if (!css) return;
    Object.keys(css).forEach(k => { el.style[k] = css[k]; });
    // Colours the 'flatten gradients while video plays' mode blends into a solid fill.
    if (cfg && (cfg.type === 'gradient' || cfg.type === 'animated')){
      el.style.setProperty('--flat-c1', cfg.color1 || '#0c0d10');
      el.style.setProperty('--flat-c2', cfg.color2 || '#3a5f57');
    }
  }

  // Recolors the actual transport/pill buttons (not just the panel behind
  // them) by overriding --accent/--accent-dim only within #controls-col;
  // every button in there already reads its highlight color from those
  // two variables, so this cascades to them without touching each button's
  // own CSS rule. Buttons outside controls-col (sidebar, settings menu)
  // aren't descendants of this element, so they keep the app-wide accent.
  function hexToRgb(hex){
    const clean = hex.replace('#','');
    const full = clean.length === 3 ? clean.split('').map(c => c + c).join('') : clean;
    const n = parseInt(full, 16);
    return { r:(n>>16)&255, g:(n>>8)&255, b:n&255 };
  }
  function rgbToHex(r, g, b){
    return '#' + [r,g,b].map(v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2,'0')).join('');
  }
  function darkenHex(hex, factor){
    const { r, g, b } = hexToRgb(hex);
    return rgbToHex(r*factor, g*factor, b*factor);
  }
  function applyButtonColor(){
    const color = uiCustomization.controls.buttonColor;
    if (color){
      controlsColEl.style.setProperty('--accent', color);
      controlsColEl.style.setProperty('--accent-dim', darkenHex(color, 0.45));
    } else {
      controlsColEl.style.removeProperty('--accent');
      controlsColEl.style.removeProperty('--accent-dim');
    }
  }

  // "Media & controls" always targets the actual controls column (now
  // playing info, transport, seek/volume), not the whole main panel, so it
  // no longer paints over the visualizer/video area behind it.
  function applyControlsBackground(){
    applyStyleTo(controlsColEl, uiCustomization.controls);
    applyButtonColor();
  }

  // "Fullscreen" (immersive/zen mode) is its own separate area: the full
  // #main panel, but only while immersive mode is actually active. Outside
  // of immersive mode it's cleared so it can't be mistaken for (or bleed
  // into) the controls styling above.
  function applyImmersiveBackground(){
    if (document.body.classList.contains('immersive')){
      applyStyleTo(mainEl, uiCustomization.immersive);
    } else {
      clearCustomStyle(mainEl);
      mainEl.classList.remove('custom-bg-active');
    }
  }

  function applyAllCustomization(){
    applyStyleTo(document.body, uiCustomization.app);
    applyStyleTo(sidebarEl, uiCustomization.playlist);
    applyControlsBackground();
    applyImmersiveBackground();
  }

  function saveCustomization(){
    try { localStorage.setItem(CUSTOMIZE_KEY, JSON.stringify(uiCustomization)); } catch(e){}
  }

  function loadCustomization(){
    try {
      const saved = JSON.parse(localStorage.getItem(CUSTOMIZE_KEY));
      if (saved && typeof saved === 'object'){
        CUSTOMIZE_TARGETS.forEach(t => { if (saved[t]) uiCustomization[t] = saved[t]; });
      }
    } catch(e){}
    applyAllCustomization();
  }

  function refreshCustomizePreview(){
    const cfg = uiCustomization[customizeActiveTab] || { type: 'default' };
    clearCustomStyle(customizePreview);
    const css = buildBackgroundCSS(cfg);
    if (css){
      Object.keys(css).forEach(k => { customizePreview.style[k] = css[k]; });
    } else {
      customizePreview.style.backgroundColor = 'var(--bg)';
    }
  }

  function refreshCustomizeControls(){
    const cfg = uiCustomization[customizeActiveTab] || { type: 'default' };
    customizeTabHint.textContent = customizeActiveTab === 'controls'
      ? 'Styles the now-playing/transport panel background, plus a color for the buttons below.'
      : customizeActiveTab === 'immersive'
        ? 'Only visible while immersive mode is on (the eye icon, top left).'
        : '';
    customizeTypeBtns.forEach(b => b.classList.toggle('active', b.dataset.type === cfg.type));
    customizeGroupColor.classList.toggle('show', cfg.type === 'color');
    customizeGroupGradient.classList.toggle('show', cfg.type === 'gradient');
    customizeGroupImage.classList.toggle('show', cfg.type === 'image');

    customizeColorInput.value = cfg.color || '#0c0d10';
    customizeGradientColor1.value = cfg.color1 || '#0c0d10';
    customizeGradientColor2.value = cfg.color2 || '#3a5f57';
    const ang = cfg.angle != null ? cfg.angle : 135;
    customizeGradientAngle.value = ang;
    customizeGradientAngleValue.textContent = ang + '°';
    customizeImageFit.value = cfg.fit || 'cover';
    const dim = cfg.dim != null ? cfg.dim : 30;
    customizeImageDim.value = dim;
    customizeImageDimValue.textContent = dim + '%';
    customizeImageName.textContent = cfg.imageName || '';
    customizeImageUploadLabel.textContent = cfg.dataUrl ? 'Change image…' : 'Choose image…';

    customizeButtonColorRow.style.display = customizeActiveTab === 'controls' ? '' : 'none';
    customizeButtonColorInput.value = uiCustomization.controls.buttonColor || '#6ee7d0';

    refreshCustomizePreview();
  }

  function applyActiveTabLive(){
    if (customizeActiveTab === 'app') applyStyleTo(document.body, uiCustomization.app);
    else if (customizeActiveTab === 'playlist') applyStyleTo(sidebarEl, uiCustomization.playlist);
    else if (customizeActiveTab === 'controls') applyControlsBackground();
    else applyImmersiveBackground();
    saveCustomization();
    refreshCustomizePreview();
  }

  customizeBtn.addEventListener('click', () => {
    customizeModalOverlay.classList.add('open');
    refreshCustomizeControls();
  });
  customizeDoneBtn.addEventListener('click', () => customizeModalOverlay.classList.remove('open'));
  customizeModalOverlay.addEventListener('click', (e) => {
    if (e.target === customizeModalOverlay) customizeModalOverlay.classList.remove('open');
  });

  customizeTabs.forEach(tab => {
    tab.addEventListener('click', () => {
      customizeTabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      customizeActiveTab = tab.dataset.target;
      refreshCustomizeControls();
    });
  });

  customizeTypeBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      customizeTypeBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const type = btn.dataset.type;
      const cfg = uiCustomization[customizeActiveTab] || {};
      cfg.type = type;
      uiCustomization[customizeActiveTab] = cfg;
      customizeGroupColor.classList.toggle('show', type === 'color');
      customizeGroupGradient.classList.toggle('show', type === 'gradient');
      customizeGroupImage.classList.toggle('show', type === 'image');
      applyActiveTabLive();
    });
  });

  customizeColorInput.addEventListener('input', () => {
    const cfg = uiCustomization[customizeActiveTab] || {};
    cfg.type = 'color';
    cfg.color = customizeColorInput.value;
    uiCustomization[customizeActiveTab] = cfg;
    applyActiveTabLive();
  });

  function updateGradient(){
    const cfg = uiCustomization[customizeActiveTab] || {};
    cfg.type = 'gradient';
    cfg.color1 = customizeGradientColor1.value;
    cfg.color2 = customizeGradientColor2.value;
    cfg.angle = parseInt(customizeGradientAngle.value, 10);
    uiCustomization[customizeActiveTab] = cfg;
    customizeGradientAngleValue.textContent = cfg.angle + '°';
    applyActiveTabLive();
  }
  customizeGradientColor1.addEventListener('input', updateGradient);
  customizeGradientColor2.addEventListener('input', updateGradient);
  customizeGradientAngle.addEventListener('input', updateGradient);

  customizeImageUploadBtn.addEventListener('click', () => customizeImageInput.click());
  customizeImageInput.addEventListener('change', () => {
    const file = customizeImageInput.files && customizeImageInput.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const cfg = uiCustomization[customizeActiveTab] || {};
      cfg.type = 'image';
      cfg.dataUrl = reader.result;
      cfg.imageName = file.name;
      if (!cfg.fit) cfg.fit = 'cover';
      if (cfg.dim == null) cfg.dim = 30;
      uiCustomization[customizeActiveTab] = cfg;
      customizeTypeBtns.forEach(b => b.classList.toggle('active', b.dataset.type === 'image'));
      customizeGroupColor.classList.remove('show');
      customizeGroupGradient.classList.remove('show');
      customizeGroupImage.classList.add('show');
      customizeImageName.textContent = file.name;
      customizeImageUploadLabel.textContent = 'Change image…';
      applyActiveTabLive();
    };
    reader.readAsDataURL(file);
  });

  function updateImageOptions(){
    const cfg = uiCustomization[customizeActiveTab] || {};
    cfg.fit = customizeImageFit.value;
    cfg.dim = parseInt(customizeImageDim.value, 10);
    uiCustomization[customizeActiveTab] = cfg;
    customizeImageDimValue.textContent = cfg.dim + '%';
    applyActiveTabLive();
  }
  customizeImageFit.addEventListener('change', updateImageOptions);
  customizeImageDim.addEventListener('input', updateImageOptions);

  customizeResetBtn.addEventListener('click', () => {
    uiCustomization[customizeActiveTab] = { type: 'default' };
    customizeImageInput.value = '';
    applyActiveTabLive();
    refreshCustomizeControls();
  });

  customizeButtonColorInput.addEventListener('input', () => {
    uiCustomization.controls.buttonColor = customizeButtonColorInput.value;
    applyControlsBackground();
    saveCustomization();
  });
  customizeButtonColorResetBtn.addEventListener('click', () => {
    delete uiCustomization.controls.buttonColor;
    customizeButtonColorInput.value = '#6ee7d0';
    applyControlsBackground();
    saveCustomization();
  });

