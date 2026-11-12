  // ---------- Video filters ----------
  const VIDEO_FILTERS = {
    none:      { saturate:1,    contrast:1,    brightness:1,    sepia:0,    grayscale:0, hueRotate:0,   invert:0 },
    vibrant:   { saturate:1.7,  contrast:1.12, brightness:1.03, sepia:0,    grayscale:0, hueRotate:0,   invert:0 },
    warm:      { saturate:1.25, contrast:1.05, brightness:1.03, sepia:0.25, grayscale:0, hueRotate:0,   invert:0 },
    cool:      { saturate:1.15, contrast:1.05, brightness:1.0,  sepia:0,    grayscale:0, hueRotate:190, invert:0 },
    bw:        { saturate:0,    contrast:1.1,  brightness:1.0,  sepia:0,    grayscale:1, hueRotate:0,   invert:0 },
    sepia:     { saturate:1,    contrast:1,    brightness:1.0,  sepia:0.75, grayscale:0, hueRotate:0,   invert:0 },
    contrast:  { saturate:1.15, contrast:1.4,  brightness:1.0,  sepia:0,    grayscale:0, hueRotate:0,   invert:0 },
    fade:      { saturate:0.75, contrast:0.88, brightness:1.08, sepia:0.12, grayscale:0, hueRotate:0,   invert:0 },
    noir:      { saturate:0,    contrast:1.35, brightness:0.92, sepia:0,    grayscale:1, hueRotate:0,   invert:0 },
    vintage:   { saturate:0.85, contrast:0.95, brightness:1.05, sepia:0.4,  grayscale:0, hueRotate:-10, invert:0 },
    dream:     { saturate:1.3,  contrast:0.85, brightness:1.15, sepia:0.15, grayscale:0, hueRotate:0,   invert:0 },
    cinematic: { saturate:1.1,  contrast:1.2,  brightness:0.95, sepia:0.08, grayscale:0, hueRotate:200, invert:0 },
    moonlight: { saturate:0.6,  contrast:1.15, brightness:0.85, sepia:0,    grayscale:0, hueRotate:210, invert:0 },
    sunset:    { saturate:1.4,  contrast:1.08, brightness:1.05, sepia:0.35, grayscale:0, hueRotate:-20, invert:0 },
    vivid_cool:{ saturate:1.35, contrast:1.15, brightness:1.05, sepia:0,    grayscale:0, hueRotate:170, invert:0 },
    crimson:   { saturate:1.5,  contrast:1.15, brightness:0.98, sepia:0.2,  grayscale:0, hueRotate:-40, invert:0 },
    muted:     { saturate:0.4,  contrast:0.95, brightness:1.02, sepia:0.05, grayscale:0, hueRotate:0,   invert:0 },
    invert:    { saturate:1,    contrast:1,    brightness:1,    sepia:0,    grayscale:0, hueRotate:180, invert:1 }
  };
  let activeFilter = 'none';
  let filterStrength = 100; // 0-100, blends the preset toward "none"
  let duotoneDark = '#0c0d10';
  let duotoneLight = '#6ee7d0';
  let sharpenAmount = 0;    // 0-100, user-driven - 0 is a true identity kernel, no visual change at rest
  let clarityAmount = 0;    // 0-100, user-driven local-contrast ("clarity") boost - 0 is a true no-op
  // Auto levels is the one enhancement that isn't user-dialed - it inspects
  // actual frame brightness and adjusts things on its own. That's exactly
  // the kind of change that can go wrong in ways a slider at "0" can't:
  // a deliberately dark/moody scene, film grain, or a stylized low-key
  // grade can all get silently "corrected" into something flatter or
  // washed out, working against what the video is actually going for. So
  // unlike sharpen/clarity, this defaults to off, is a plain on/off toggle
  // rather than an intensity a user has to guess at, and its correction
  // strength is capped conservatively rather than fully normalizing every
  // frame - a nudge on genuinely washed-out footage, not a relentless
  // auto-corrector fighting the source.
  let autoLevelsOn = false;

  function lerp(a, b, t){ return a + (b - a) * t; }

  function hexToUnitRgb(hex){
    const m = /^#?([0-9a-f]{6})$/i.exec(hex || '');
    if (!m) return [0,0,0];
    const n = parseInt(m[1], 16);
    return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
  }

  // "Amount of colors" - fewer table entries means more input values get
  // snapped to the same output shade. 2 = maximum posterization (roughly
  // 8 possible on-screen colors once R/G/B combine); 20+ is indistinguishable
  // from the untouched source. Strength 0-100 maps linearly across that range
  // so the slider behaves like every other filter's intensity control.
  function updatePosterizeTable(strength){
    const levels = Math.max(2, Math.round(lerp(24, 2, strength / 100)));
    const table = [];
    for (let i = 0; i < levels; i++) table.push((i / (levels - 1)).toFixed(3));
    const tableStr = table.join(' ');
    ['posterize-r','posterize-g','posterize-b'].forEach(id => {
      document.getElementById(id).setAttribute('tableValues', tableStr);
    });
    const hintEl = document.getElementById('posterize-level-count');
    if (hintEl) hintEl.textContent = levels;
  }

  // Duotone: table[0] is what pure black maps to, table[1] is what pure
  // white maps to. At strength 0 that's still "0 1" (plain grayscale,
  // since duotone is meaningless without any tint); as strength rises the
  // two endpoints slide toward the chosen shadow/highlight colors.
  function updateDuotoneTable(strength){
    const t = strength / 100;
    const dark = hexToUnitRgb(duotoneDark);
    const light = hexToUnitRgb(duotoneLight);
    const chans = [['duotone-r',0], ['duotone-g',1], ['duotone-b',2]];
    chans.forEach(([id, i]) => {
      const lo = lerp(0, dark[i], t).toFixed(3);
      const hi = lerp(1, light[i], t).toFixed(3);
      document.getElementById(id).setAttribute('tableValues', lo + ' ' + hi);
    });
  }

  function buildFilterCss(name, strength){
    const preset = VIDEO_FILTERS[name] || VIDEO_FILTERS.none;
    const base = VIDEO_FILTERS.none;
    const t = strength / 100;
    const saturate   = lerp(base.saturate, preset.saturate, t);
    const contrast   = lerp(base.contrast, preset.contrast, t);
    const brightness = lerp(base.brightness, preset.brightness, t);
    const sepia      = lerp(base.sepia, preset.sepia, t);
    const grayscale  = lerp(base.grayscale, preset.grayscale, t);
    const hueRotate  = lerp(base.hueRotate, preset.hueRotate, t);
    const invert     = lerp(base.invert || 0, preset.invert || 0, t);
    if (name === 'none') return null;
    return `saturate(${saturate.toFixed(2)}) contrast(${contrast.toFixed(2)}) brightness(${brightness.toFixed(2)}) sepia(${sepia.toFixed(2)}) grayscale(${grayscale.toFixed(2)}) hue-rotate(${hueRotate.toFixed(0)}deg) invert(${invert.toFixed(2)})`;
  }

  // Sharpen: identity kernel at 0 (center=1, all else=0 - byte-for-byte
  // passthrough), scaling toward a standard edge-enhance kernel as the
  // slider rises. The four cardinal neighbors get the negative weight;
  // corners stay untouched, which keeps the effect looking like sharpening
  // rather than introducing diagonal artifacts.
  function updateSharpenMatrix(){
    const t = sharpenAmount / 100;
    const edge = -t * 1.2;
    const center = 1 + t * 4.8;
    sharpenMatrixEl.setAttribute('kernelMatrix',
      `0 ${edge.toFixed(2)} 0 ${edge.toFixed(2)} ${center.toFixed(2)} ${edge.toFixed(2)} 0 ${edge.toFixed(2)} 0`);
  }

  // Clarity/local contrast: the boost feComposite's k2 (its "slope") is 0 at
  // rest (the unsharp-mask "detail" layer contributes nothing, output ==
  // source exactly), rising toward ~1.4x as the slider goes up. The detail
  // layer arrives biased to mid-gray (0.5) so it survives clamping in both
  // directions (see the clarity-filter comment above); k4 (its "intercept")
  // has to move in lockstep with k2 so that an input of exactly 0.5 (i.e.
  // "no local difference here") always maps back to 0.5 output, no matter
  // the slider position - otherwise raising clarity would tint flat areas.
  function updateClarityBoost(){
    const slope = (clarityAmount / 100) * 1.4;
    const intercept = 0.5 * (1 - slope);
    clarityBoostEl.setAttribute('k2', slope.toFixed(3));
    clarityBoostEl.setAttribute('k4', intercept.toFixed(3));
  }

  // Combines the color preset (CSS filter functions) with the sharpen/
  // clarity SVG filters (url() references) and, if auto levels is on, the
  // auto-computed brightness/contrast nudge - all independently optional,
  // all composing rather than overriding one another.
  function buildVideoFilterString(){
    const parts = [];
    if (activeFilter === 'posterize'){
      updatePosterizeTable(filterStrength);
      parts.push('url(#posterize-filter)');
    } else if (activeFilter === 'duotone'){
      updateDuotoneTable(filterStrength);
      parts.push('url(#duotone-filter)');
    } else {
      const preset = buildFilterCss(activeFilter, filterStrength);
      if (preset) parts.push(preset);
    }
    if (autoLevelsOn && autoLevelsCss) parts.push(autoLevelsCss);
    if (sharpenAmount > 0) parts.push('url(#sharpen-filter)');
    if (clarityAmount > 0) parts.push('url(#clarity-filter)');
    if (window.__ppAdjCss){ const a = window.__ppAdjCss(); if (a) parts.push(a); }
    return parts.length ? parts.join(' ') : 'none';
  }

  function applyVideoFilter(){
    videoEl.style.filter = perfLightActive() ? '' : buildVideoFilterString();
    if (window.PPNative) PPNative.setVideoFilterCss(videoEl.style.filter);
  }
  window.__ppApplyVF = applyVideoFilter;

  filterBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    filterDropdown.classList.toggle('open');
    clampDropdownToViewport(filterDropdown);
  });
  filterDropdown.addEventListener('click', (e) => e.stopPropagation());
  document.addEventListener('click', () => filterDropdown.classList.remove('open'));

  const posterizeHint = document.getElementById('posterize-hint');
  const duotoneColorsRow = document.getElementById('duotone-colors-row');
  const duotoneDarkInput = document.getElementById('duotone-dark-color');
  const duotoneLightInput = document.getElementById('duotone-light-color');

  function refreshFilterExtrasUI(){
    if (posterizeHint) posterizeHint.style.display = activeFilter === 'posterize' ? 'block' : 'none';
    if (duotoneColorsRow) duotoneColorsRow.style.display = activeFilter === 'duotone' ? 'flex' : 'none';
  }

  filterGrid.querySelectorAll('button').forEach(btn => {
    btn.addEventListener('click', () => {
      activeFilter = btn.dataset.filter;
      filterGrid.querySelectorAll('button').forEach(b => b.classList.toggle('active', b === btn));
      filterBtn.classList.toggle('toggled', activeFilter !== 'none');
      refreshFilterExtrasUI();
      applyVideoFilter();
      saveSettings();
      if (activeFilter !== 'none' && window.PPPortfolioApi) window.PPPortfolioApi.recordFilter(btn.textContent.trim());
    });
  });

  if (duotoneDarkInput) duotoneDarkInput.addEventListener('input', () => {
    duotoneDark = duotoneDarkInput.value;
    applyVideoFilter();
  });
  if (duotoneDarkInput) duotoneDarkInput.addEventListener('change', () => saveSettings());
  if (duotoneLightInput) duotoneLightInput.addEventListener('input', () => {
    duotoneLight = duotoneLightInput.value;
    applyVideoFilter();
  });
  if (duotoneLightInput) duotoneLightInput.addEventListener('change', () => saveSettings());

  filterIntensity.addEventListener('input', () => {
    filterStrength = parseFloat(filterIntensity.value);
    applyVideoFilter();
  });
  filterIntensity.addEventListener('change', () => saveSettings());

  sharpenIntensity.addEventListener('input', () => {
    sharpenAmount = parseFloat(sharpenIntensity.value);
    updateSharpenMatrix();
    applyVideoFilter();
  });
  sharpenIntensity.addEventListener('change', () => saveSettings());

  clarityIntensity.addEventListener('input', () => {
    clarityAmount = parseFloat(clarityIntensity.value);
    updateClarityBoost();
    applyVideoFilter();
  });
  clarityIntensity.addEventListener('change', () => saveSettings());

  // ---------- Auto levels ----------
  // Off by default and a plain toggle rather than a slider - see the note
  // by autoLevelsOn above for why this one gets treated more cautiously
  // than sharpen/clarity. Samples a heavily downscaled copy of the current
  // frame onto an offscreen canvas every 500ms (cheap: the analysis canvas
  // is tiny, and this only runs at all while a video is loaded, playing,
  // and the setting is on), finds the darkest/brightest luma percentile,
  // and stretches brightness/contrast just enough to use more of the
  // available range - capped well short of a full auto-stretch so it reads
  // as "less washed out," not "reprocessed."
  let autoLevelsCss = null;
  const autoLevelsCanvas = document.createElement('canvas');
  autoLevelsCanvas.width = 32; autoLevelsCanvas.height = 18;
  const autoLevelsCtx = autoLevelsCanvas.getContext('2d', { willReadFrequently: true });
  const AUTO_LEVELS_MAX_BRIGHTNESS_LIFT = 0.18; // caps how far a dark scene can be pushed
  const AUTO_LEVELS_MAX_CONTRAST_LIFT = 0.25;   // caps how far contrast can be stretched

  // Native video (beta): the page can't read native frames, so the renderer hands over the same 32x18 luma grid.
  let autoLevelsNativeBusy = false;
  function sampleAutoLevels(){
    if (autoLevelsOn && window.PPNative && PPNative.videoActive() && !document.hidden && !videoEl.paused && videoWrap.style.display !== 'none'){
      if (autoLevelsNativeBusy) return;
      autoLevelsNativeBusy = true;
      PPNative.sampleLuma().then(r => { autoLevelsCss = autoLevelsFromLuma(r.luma || []); }, () => { autoLevelsCss = null; })
        .then(() => { autoLevelsNativeBusy = false; applyVideoFilter(); });
      return;
    }
    if (!autoLevelsOn || document.hidden || videoEl.paused || videoEl.readyState < 2 || videoWrap.style.display === 'none'){
      autoLevelsCss = null;
    } else {
      try {
        autoLevelsCtx.drawImage(videoEl, 0, 0, autoLevelsCanvas.width, autoLevelsCanvas.height);
        const { data } = autoLevelsCtx.getImageData(0, 0, autoLevelsCanvas.width, autoLevelsCanvas.height);
        const lumas = [];
        for (let i = 0; i < data.length; i += 4) lumas.push(data[i]*0.299 + data[i+1]*0.587 + data[i+2]*0.114);
        autoLevelsCss = autoLevelsFromLuma(lumas);
      } catch(e){ autoLevelsCss = null; } // e.g. cross-origin frame data - just skip this sample
    }
    applyVideoFilter();
  }
  function autoLevelsFromLuma(lumas){
    let lo = 255, hi = 0, sum = 0, n = 0;
    for (const luma of lumas){
      if (luma < lo) lo = luma;
      if (luma > hi) hi = luma;
      sum += luma; n++;
    }
    if (!n) return null;
    const mean = sum / n;
    const range = Math.max(1, hi - lo);
    // Only correct when the frame is genuinely using a narrow slice of
    // the available range (washed-out/flat) or is quite dark overall -
    // a frame that already spans close to full range, or one that's
    // dark because that's the shot, gets left alone rather than forced.
    const rangeDeficit = Math.max(0, 1 - range / 200); // 0 = full range already, 1 = very narrow
    const contrastLift = Math.min(AUTO_LEVELS_MAX_CONTRAST_LIFT, rangeDeficit * AUTO_LEVELS_MAX_CONTRAST_LIFT);
    const darkDeficit = Math.max(0, (100 - mean) / 100) * (mean < 90 ? 1 : 0);
    const brightnessLift = Math.min(AUTO_LEVELS_MAX_BRIGHTNESS_LIFT, darkDeficit * AUTO_LEVELS_MAX_BRIGHTNESS_LIFT * 0.6);
    if (contrastLift > 0.01 || brightnessLift > 0.01){
      return `brightness(${(1 + brightnessLift).toFixed(3)}) contrast(${(1 + contrastLift).toFixed(3)})`;
    }
    return null;
  }

  let autoLevelsIntervalId = null;
  function setAutoLevels(on){
    autoLevelsOn = on;
    autoLevelsToggle.checked = on;
    filterBtn.classList.toggle('toggled', on || activeFilter !== 'none' || sharpenAmount > 0 || clarityAmount > 0);
    if (autoLevelsIntervalId){ clearInterval(autoLevelsIntervalId); autoLevelsIntervalId = null; }
    if (on){
      sampleAutoLevels();
      autoLevelsIntervalId = setInterval(sampleAutoLevels, 500);
    } else {
      autoLevelsCss = null;
      applyVideoFilter();
    }
  }
  autoLevelsToggle.addEventListener('change', () => {
    setAutoLevels(autoLevelsToggle.checked);
    saveSettings();
  });

  vizSensBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    vizSensDropdown.classList.toggle('open');
    vizSensBtn.classList.toggle('open', vizSensDropdown.classList.contains('open'));
    clampDropdownToViewport(vizSensDropdown);
  });
  vizSensDropdown.addEventListener('click', (e) => e.stopPropagation());
  document.addEventListener('click', () => {
    vizSensDropdown.classList.remove('open');
    vizSensBtn.classList.remove('open');
  });

  vizSensitivityInput.addEventListener('input', () => {
    const pct = parseFloat(vizSensitivityInput.value) || 100;
    globalVizSensitivity = pct / 100;
    vizSensValue.textContent = pct + '%';
    if (!trackVizSensOverrideActive){
      vizSensitivity = globalVizSensitivity;
      vizSensPillLabel.textContent = pct + '%';
      vizSensTrackInput.value = pct;
      vizSensTrackValue.textContent = pct + '%';
    }
  });
  vizSensitivityInput.addEventListener('change', () => saveSettings());

  // A song can optionally override the universal sensitivity with its own
  // value - the two never combine, only whichever is active actually drives
  // the visualizer.
  vizSensOverrideToggle.addEventListener('change', () => {
    trackVizSensOverrideActive = vizSensOverrideToggle.checked;
    vizSensitivity = globalVizSensitivity; // seed from (or revert to) the universal value
    refreshVizSensUI();
    if (currentIndex !== -1){
      saveTrackVizSensOverride(tracks[currentIndex].dbId, trackVizSensOverrideActive ? vizSensitivity : null);
    }
  });

  vizSensTrackInput.addEventListener('input', () => {
    if (!trackVizSensOverrideActive) return;
    const pct = parseFloat(vizSensTrackInput.value) || 100;
    vizSensitivity = pct / 100;
    vizSensTrackValue.textContent = pct + '%';
    vizSensPillLabel.textContent = pct + '%';
  });
  vizSensTrackInput.addEventListener('change', () => {
    if (currentIndex !== -1 && trackVizSensOverrideActive) saveTrackVizSensOverride(tracks[currentIndex].dbId, vizSensitivity);
  });

  function refreshVizSensUI(){
    const gPct = Math.round(globalVizSensitivity * 100);
    vizSensitivityInput.value = gPct;
    vizSensValue.textContent = gPct + '%';

    vizSensOverrideToggle.checked = trackVizSensOverrideActive;
    vizSensTrackInput.disabled = !trackVizSensOverrideActive;
    const effective = trackVizSensOverrideActive ? vizSensitivity : globalVizSensitivity;
    const ePct = Math.round(effective * 100);
    vizSensTrackInput.value = ePct;
    vizSensTrackValue.textContent = ePct + '%';
    vizSensPillLabel.textContent = ePct + '%';
  }

  function updateLatencyDisplay(){
    const ms = Math.round(subtitleLatencyMs);
    const text = (ms > 0 ? '+' : '') + ms + ' ms';
    latencyLabel.textContent = text;
    latencyDropdownValue.textContent = text;
  }

  latencyBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    latencyDropdown.classList.toggle('open');
    latencyBtn.classList.toggle('open', latencyDropdown.classList.contains('open'));
    clampDropdownToViewport(latencyDropdown);
  });
  latencyDropdown.addEventListener('click', (e) => e.stopPropagation());
  document.addEventListener('click', () => {
    latencyDropdown.classList.remove('open');
    latencyBtn.classList.remove('open');
  });

  (function(){
    const v = document.getElementById('master-boost-val'), pl = document.getElementById('boost-pill-label');
    if (!v || !pl) return;
    const sync = () => { pl.textContent = v.textContent; };
    new MutationObserver(sync).observe(v, { childList:true, characterData:true, subtree:true });
    sync();
  })();
  // Pill dropdowns for the items split out of Latency / EQ (same open/close behaviour as Latency).
  [['memc-btn','memc-dropdown'],['upscale-btn','upscale-dropdown'],['boost-btn','boost-dropdown'],['fx-btn','fx-dropdown']].forEach(([bid, did]) => {
    const b = document.getElementById(bid), d = document.getElementById(did);
    if (!b || !d) return;
    b.addEventListener('click', (e) => {
      e.stopPropagation();
      d.classList.toggle('open');
      b.classList.toggle('open', d.classList.contains('open'));
      b.setAttribute('aria-expanded', d.classList.contains('open') ? 'true' : 'false');
      clampDropdownToViewport(d);
    });
    d.addEventListener('click', (e) => e.stopPropagation());
    document.addEventListener('click', () => { d.classList.remove('open'); b.classList.remove('open'); b.setAttribute('aria-expanded', 'false'); });
  });

  latencySlider.addEventListener('input', () => {
    subtitleLatencyMs = parseFloat(latencySlider.value) || 0;
    updateLatencyDisplay();
    refreshVideoDelayState();
    refreshLatencyPresetBtn();
  });
  latencySlider.addEventListener('change', () => saveSettings());

  latencyResetBtn.addEventListener('click', () => {
    subtitleLatencyMs = 0;
    latencySlider.value = 0;
    updateLatencyDisplay();
    refreshVideoDelayState();
    refreshLatencyPresetBtn();
    saveSettings();
  });

  function clampLatencyPreset(v){
    return Math.max(-2000, Math.min(2000, Math.round(v / 50) * 50));
  }

  // Lights up whenever the slider is already sitting exactly on the saved
  // preset, so the button doubles as a quick "is it on right now" glance
  // instead of only being a one-shot action.
  function refreshLatencyPresetBtn(){
    latencyPresetBtnValue.textContent = latencyPresetMs;
    latencyPresetBtn.classList.toggle('toggled', subtitleLatencyMs === latencyPresetMs);
  }

  latencyPresetInput.addEventListener('input', () => {
    const v = parseFloat(latencyPresetInput.value);
    if (!Number.isFinite(v)) return;
    latencyPresetMs = clampLatencyPreset(v);
    refreshLatencyPresetBtn();
  });
  latencyPresetInput.addEventListener('change', () => {
    latencyPresetInput.value = latencyPresetMs;
    saveSettings();
  });

  // A toggle, not a one-shot apply: tapping it again while the preset is
  // already active restores whatever the slider was set to right before
  // the preset was turned on - not always 0 - so switching earbuds off
  // doesn't clobber some other latency value that was already dialed in.
  // The one exception is when that prior value happens to equal the
  // preset itself (nothing to "go back" to), which falls back to 0.
  let latencyPreviousMs = 0;
  latencyPresetBtn.addEventListener('click', () => {
    if (subtitleLatencyMs === latencyPresetMs){
      subtitleLatencyMs = (latencyPreviousMs === latencyPresetMs) ? 0 : latencyPreviousMs;
    } else {
      latencyPreviousMs = subtitleLatencyMs;
      subtitleLatencyMs = latencyPresetMs;
    }
    latencySlider.value = subtitleLatencyMs;
    updateLatencyDisplay();
    refreshVideoDelayState();
    refreshLatencyPresetBtn();
    saveSettings();
  });

