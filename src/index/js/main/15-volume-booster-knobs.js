  // ---------- Volume booster ----------
  // Web Audio gain, applied on top of the plain <audio>/<video> volume
  // (which caps at 100%). masterBoost is the universal ("all songs") level;
  // an individual song can optionally override it instead of stacking on
  // top of it - only one of the two is ever actually applied at once.
  let masterBoost = 1;   // 1 = 100% (no boost), up to 6 = 600%
  let trackBoost = 1;    // this song's own boost, only used while the override is on
  let trackBoostOverrideActive = false;
  const TRACK_BOOST_KEY = 'playerTrackBoosts';

  function loadTrackBoosts(){
    try { return JSON.parse(localStorage.getItem(TRACK_BOOST_KEY)) || {}; }
    catch(e){ return {}; }
  }
  function saveTrackBoostOverride(dbId, value){
    const all = loadTrackBoosts();
    if (value == null) delete all[dbId];
    else all[dbId] = value;
    try { localStorage.setItem(TRACK_BOOST_KEY, JSON.stringify(all)); } catch(e){}
  }
  function getSavedTrackBoost(dbId){
    const v = loadTrackBoosts()[dbId];
    return typeof v === 'number' ? v : null; // null = no override for this track
  }


  // Real DSP, not EQ presets: bassBoost drives a low-shelf + resonant peak
  // pair for actual felt low-end (continuous, up to +18dB shelf plus a punch
  // peak around 60Hz), reverbMix drives a convolution reverb blended in via
  // a wet/dry split, filterAmount drives a classic single-knob DJ filter
  // (lowpass sweep one way, highpass sweep the other), distortionAmount
  // drives a soft-clip waveshaper, and bitcrushAmount drives a bit-depth +
  // sample-rate reducer. All are applied universally (no per-track override,
  // unlike EQ/boost above - these are "character"/effect settings rather
  // than per-song loudness compensation).
  //
  // Displayed knob position (0-100%) and actual effect intensity are
  // deliberately NOT the same curve. A linear knob-to-parameter mapping
  // makes drive/crush effects slam into harsh territory the instant you
  // nudge the knob, and makes a gentle effect like bass boost feel like it
  // does nothing until you're most of the way round. easeIn()/easeOut() are
  // "audio taper" curves - the digital equivalent of the taper built into a
  // real mixer pot - that shape how each knob's displayed percentage maps
  // onto the number actually fed to the Web Audio node.
  function easeIn(v, curve){ return Math.sign(v) * Math.pow(Math.abs(v), curve); }  // gentle start, steep finish
  function easeOut(v, curve){ return Math.sign(v) * (1 - Math.pow(1 - Math.abs(v), curve)); } // steep start, gentle finish

  let bassBoost = 0;        // 0-1 knob position, eased with easeOut so low turns already bring up real bass
  let reverbMix = 0;        // 0-1, 0 = fully dry, 1 = fully wet
  let filterAmount = 0;     // -1 (full lowpass sweep) .. 0 (off) .. 1 (full highpass sweep)
  let distortionAmount = 0; // 0-1 knob position, eased with easeIn so it stays tame until you push past halfway
  let bitcrushAmount = 0;   // 0-1 knob position, eased with easeIn for the same reason
  let echoMix = 0;          // 0-1 knob position - drives both wet level and feedback (repeat count) together
  let tremoloAmount = 0;    // 0-1 knob position - drives the depth of the volume-pulse modulation
  const BASS_BOOST_MAX_DB = 9;     // shelf gain at full boost
  const BASS_PEAK_MAX_DB = 4;      // extra "punch" peak gain at full boost
  const BASS_BOOST_FREQ = 110;     // shelf corner - low enough to be true bass, not low-mids
  const BASS_PEAK_FREQ = 65;       // resonant punch peak, sub-bass "thump" territory
  const EXCITER_MAX_GAIN = 0.85;   // linear gain on the generated-harmonics branch at full boost
  const REVERB_DURATION = 2.8;     // seconds - length of the generated impulse response
  const REVERB_DECAY = 2.4;        // higher = faster tail falloff
  const REVERB_PREDELAY_MS = 18;   // brief silence before the tail starts, so it reads as a space, not a click
  const REVERB_DAMPING = 0.12;     // 0-1, smooths the raw noise so the tail sounds like a wash, not hiss/static
  const FILTER_LP_MIN_FREQ = 150;   // fully-left cutoff
  const FILTER_HP_MAX_FREQ = 6000;  // fully-right cutoff
  const ECHO_DELAY_SEC = 0.24;      // slap-back-style delay time between repeats
  const ECHO_FEEDBACK_MAX = 0.42;   // capped well under 1 so repeats always die out instead of self-oscillating
  const ECHO_WET_MAX = 0.55;        // caps wet level so echoes blend in rather than burying the dry signal
  const TREMOLO_RATE_HZ = 5.2;      // classic tremolo pulse rate

  // The impulse response only depends on the AudioContext's sample rate, so
  // it's generated once per context and shared by every graph (audio/video)
  // rather than rebuilt per ConvolverNode.
  let reverbImpulseBuffer = null;
  function getReverbImpulse(ctx){
    if (reverbImpulseBuffer && reverbImpulseBuffer.sampleRate === ctx.sampleRate) return reverbImpulseBuffer;
    const length = Math.round(ctx.sampleRate * REVERB_DURATION);
    const predelaySamples = Math.round(ctx.sampleRate * REVERB_PREDELAY_MS / 1000);
    const impulse = ctx.createBuffer(2, length, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++){
      const data = impulse.getChannelData(ch);
      let smoothed = 0;
      for (let i = 0; i < length; i++){
        if (i < predelaySamples){ data[i] = 0; continue; }
        const raw = Math.random() * 2 - 1;
        // A one-pole lowpass over the raw noise before the decay envelope is
        // applied - this is what turns "hiss/static" into something that
        // reads as a decaying room tone instead of broadband noise.
        smoothed += (raw - smoothed) * REVERB_DAMPING;
        const t = (i - predelaySamples) / length;
        data[i] = smoothed * Math.pow(1 - t, REVERB_DECAY);
      }
    }
    reverbImpulseBuffer = impulse;
    return impulse;
  }

  // Standard soft-clip waveshaper curve (the "Soundcorset" formula) - k=0 is
  // an almost-straight line (no audible effect), rising k pushes the curve
  // toward a harder S-bend for more clipping/drive.
  function makeDistortionCurve(amount){
    const k = easeIn(amount, 2.2) * 320;
    const nSamples = 1024;
    const curve = new Float32Array(nSamples);
    const deg = Math.PI / 180;
    for (let i = 0; i < nSamples; i++){
      const x = (i * 2) / nSamples - 1;
      curve[i] = ((3 + k) * x * 20 * deg) / (Math.PI + k * Math.abs(x));
    }
    return curve;
  }

  function formatPct(v){ return Math.round(v * 100) + '%'; }

  // ---------- Generic DJ-style rotary knob ----------
  // Turns a plain div into a draggable/scrollable/keyboard-operable knob.
  // Drag vertically (up = increase, matching hardware mixer knobs, since a
  // circular drag gesture is awkward with a mouse/finger); wheel and arrow
  // keys work too for fine adjustment and accessibility.
  const KNOB_SWEEP_DEG = 270;
  const KNOB_DRAG_PX_FOR_FULL_SWEEP = 160; // px of vertical drag = knob min to max
  function createKnob(el, opts){
    // opts: { min, max, initial, step, format(v), onInput(v), onChange(v) }
    const indicator = el.querySelector('.dj-knob-indicator');
    let value = opts.initial;

    function angleFor(v){
      const pct = (v - opts.min) / (opts.max - opts.min);
      return -135 + pct * KNOB_SWEEP_DEG;
    }
    function render(){
      const pct = (value - opts.min) / (opts.max - opts.min);
      el.style.setProperty('--knob-pct', pct);
      indicator.style.transform = `translate(-50%, 0) rotate(${angleFor(value)}deg)`;
      el.setAttribute('aria-valuenow', Math.round(value));
      const label = opts.format ? opts.format(value) : Math.round(value) + '%';
      el.setAttribute('aria-valuetext', label);
      if (opts.valEl) opts.valEl.textContent = label;
    }
    function clamp(v){ return Math.min(opts.max, Math.max(opts.min, v)); }
    function setValue(v, silent){
      value = clamp(v);
      render();
      if (!silent && opts.onInput) opts.onInput(value);
    }

    const perPixel = (opts.max - opts.min) / KNOB_DRAG_PX_FOR_FULL_SWEEP;
    let dragging = false, startY = 0, startValue = 0;

    el.addEventListener('pointerdown', (e) => {
      dragging = true;
      startY = e.clientY;
      startValue = value;
      el.classList.add('dragging');
      el.focus();
      try { el.setPointerCapture(e.pointerId); } catch(err){}
      e.preventDefault();
    });
    el.addEventListener('pointermove', (e) => {
      if (!dragging) return;
      setValue(startValue + (startY - e.clientY) * perPixel);
    });
    function endDrag(){
      if (!dragging) return;
      dragging = false;
      el.classList.remove('dragging');
      if (opts.onChange) opts.onChange(value);
    }
    el.addEventListener('pointerup', endDrag);
    el.addEventListener('pointercancel', endDrag);

    el.addEventListener('wheel', (e) => {
      e.preventDefault();
      setValue(value + (e.deltaY < 0 ? opts.step : -opts.step));
      if (opts.onChange) opts.onChange(value);
    }, { passive: false });

    el.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowUp' || e.key === 'ArrowRight'){
        setValue(value + opts.step); opts.onChange && opts.onChange(value); e.preventDefault();
      } else if (e.key === 'ArrowDown' || e.key === 'ArrowLeft'){
        setValue(value - opts.step); opts.onChange && opts.onChange(value); e.preventDefault();
      } else if (e.key === 'Home'){
        setValue(opts.min); opts.onChange && opts.onChange(value); e.preventDefault();
      } else if (e.key === 'End'){
        setValue(opts.max); opts.onChange && opts.onChange(value); e.preventDefault();
      }
    });

    el.addEventListener('dblclick', () => {
      setValue(opts.initial);
      opts.onChange && opts.onChange(value);
    });

    render();
    return { setValue: (v) => setValue(v, true), getValue: () => value };
  }

  const bassBoostKnob = createKnob(bassBoostKnobEl, {
    min: 0, max: 100, initial: 0, step: 2,
    valEl: bassBoostVal,
    onInput: (v) => { bassBoost = v / 100; applyFxAll(); },
    onChange: () => saveSettings()
  });
  const reverbKnob = createKnob(reverbKnobEl, {
    min: 0, max: 100, initial: 0, step: 2,
    valEl: reverbVal,
    onInput: (v) => { reverbMix = v / 100; applyFxAll(); },
    onChange: () => saveSettings()
  });
  const filterKnob = createKnob(filterKnobEl, {
    min: -100, max: 100, initial: 0, step: 4,
    valEl: filterVal,
    format: (v) => v === 0 ? 'Off' : (v < 0 ? 'LP ' + Math.round(-v) + '%' : 'HP ' + Math.round(v) + '%'),
    onInput: (v) => { filterAmount = v / 100; applyFxAll(); },
    onChange: () => saveSettings()
  });
  const distortionKnob = createKnob(distortionKnobEl, {
    min: 0, max: 100, initial: 0, step: 2,
    valEl: distortionVal,
    onInput: (v) => { distortionAmount = v / 100; applyFxAll(); },
    onChange: () => saveSettings()
  });
  const bitcrushKnob = createKnob(bitcrushKnobEl, {
    min: 0, max: 100, initial: 0, step: 2,
    valEl: bitcrushVal,
    onInput: (v) => { bitcrushAmount = v / 100; applyFxAll(); },
    onChange: () => saveSettings()
  });
  const echoKnob = createKnob(echoKnobEl, {
    min: 0, max: 100, initial: 0, step: 2,
    valEl: echoVal,
    onInput: (v) => { echoMix = v / 100; applyFxAll(); },
    onChange: () => saveSettings()
  });
  const tremoloKnob = createKnob(tremoloKnobEl, {
    min: 0, max: 100, initial: 0, step: 2,
    valEl: tremoloVal,
    onInput: (v) => { tremoloAmount = v / 100; applyFxAll(); },
    onChange: () => saveSettings()
  });

  function refreshFxUI(){
    bassBoostKnob.setValue(Math.round(bassBoost * 100));
    reverbKnob.setValue(Math.round(reverbMix * 100));
    filterKnob.setValue(Math.round(filterAmount * 100));
    distortionKnob.setValue(Math.round(distortionAmount * 100));
    bitcrushKnob.setValue(Math.round(bitcrushAmount * 100));
    echoKnob.setValue(Math.round(echoMix * 100));
    tremoloKnob.setValue(Math.round(tremoloAmount * 100));
  }

  function applyFxToGraph(g){
    if (!g.bassFilter) return;
    // easeOut: an early turn already gives most of the low-end lift, so
    // "bass boost" is actually audible well before the knob is maxed out.
    const bassT = easeOut(bassBoost, 2);
    rampParam(g.bassFilter.gain, bassT * BASS_BOOST_MAX_DB);
    rampParam(g.bassPeak.gain, bassT * BASS_PEAK_MAX_DB);

    // Exciter amount rides the same curve as the shelf/peak above, so it
    // ramps in alongside them rather than needing its own knob. The curve
    // itself (not just its gain) needs rebuilding as the amount changes,
    // same reasoning as the distortion waveshaper below.
    if (g.lastExciterAmount !== bassT){
      g.exciterShaper.curve = makeDistortionCurve(Math.min(1, bassT * 0.6));
      g.lastExciterAmount = bassT;
    }
    rampParam(g.exciterGain.gain, bassT * EXCITER_MAX_GAIN);

    // Single-knob DJ filter: left of center sweeps a lowpass down from wide
    // open, right of center sweeps a highpass up from wide open. Only one
    // side is ever actually engaged at a time - the other sits at its
    // fully-open frequency and is inaudible.
    const filterT = easeIn(filterAmount, 1.5);
    const lpFreq = filterT < 0
      ? 20000 * Math.pow(FILTER_LP_MIN_FREQ / 20000, -filterT)
      : 20000;
    const hpFreq = filterT > 0
      ? 20 * Math.pow(FILTER_HP_MAX_FREQ / 20, filterT)
      : 20;
    rampParam(g.filterLP.frequency, lpFreq);
    rampParam(g.filterHP.frequency, hpFreq);

    // WaveShaper curves aren't AudioParams, so they can't be ramped - just
    // skip the (cheap but not free) rebuild when the amount hasn't changed.
    if (g.lastDistortionAmount !== distortionAmount){
      g.distortion.curve = makeDistortionCurve(distortionAmount);
      g.lastDistortionAmount = distortionAmount;
    }

    // Bitcrush now runs as an AudioWorkletNode (see ensureBitcrusherWorklet)
    // instead of a main-thread ScriptProcessorNode, so its knob is a real
    // AudioParam and rides the same rampParam smoothing as everything else
    // here instead of being read live inside a JS audio callback. The
    // easeIn curve is applied here, once per change, rather than inside
    // process() on every 128-sample render quantum.
    if (g.bitcrusher && g.bitcrusher.parameters){
      rampParam(g.bitcrusher.parameters.get('amount'), easeIn(bitcrushAmount, 1.8));
    }

    rampParam(g.reverbWetGain.gain, reverbMix);
    // Equal-power-ish dry compensation: keep dry signal at full level until
    // the mix is mostly wet, then taper it so a 100% mix isn't just "dry +
    // loud wet" but actually reads as fully wet.
    rampParam(g.reverbDryGain.gain, 1 - reverbMix * 0.7);

    // Echo: wet level and feedback (repeat count) both ride the same knob,
    // capped well below 1 so the delay line always decays instead of
    // ringing forever.
    rampParam(g.echoWetGain.gain, echoMix * ECHO_WET_MAX);
    rampParam(g.echoFeedback.gain, echoMix * ECHO_FEEDBACK_MAX);

    // Tremolo: gain.value is the center point the LFO swings around, and
    // tremoloDepth is the size of that swing - together they keep the
    // average loudness roughly constant as the knob is turned, rather than
    // the whole track getting quieter as depth increases.
    const tremT = easeOut(tremoloAmount, 2);
    rampParam(g.tremoloGain.gain, 1 - tremT / 2);
    rampParam(g.tremoloDepth.gain, tremT / 2);
  }
  function applyFxAll(){
    rewireFxChainAll();
    Object.values(graphs).forEach(applyFxToGraph);
  }

  fxResetBtn.addEventListener('click', () => {
    bassBoost = 0;
    reverbMix = 0;
    filterAmount = 0;
    distortionAmount = 0;
    bitcrushAmount = 0;
    echoMix = 0;
    tremoloAmount = 0;
    refreshFxUI();
    applyFxAll();
    saveSettings();
  });

  const eqSliders = [];
  const eqGainLabels = [];

  function formatEqGain(v){
    const r = Math.round(v * 10) / 10;
    return (r > 0 ? '+' : '') + r + 'dB';
  }

  const eqBandWraps = [];

  EQ_BANDS.forEach((band, i) => {
    const wrap = document.createElement('div');
    wrap.className = 'eq-band' + (band.pro ? ' eq-band-pro' : '');
    wrap.innerHTML = `
      <span class="eq-band-gain"></span>
      <div class="eq-band-slider-wrap">
        <input type="range" min="-12" max="12" step="0.5" value="0">
      </div>
      <span class="eq-band-freq">${band.label}</span>
    `;
    eqBandsWrap.appendChild(wrap);
    eqBandWraps.push(wrap);
    const gainLabel = wrap.querySelector('.eq-band-gain');
    const slider = wrap.querySelector('input[type=range]');
    eqSliders.push(slider);
    eqGainLabels.push(gainLabel);
    gainLabel.textContent = formatEqGain(0);
    slider.addEventListener('input', () => {
      eqGains[i] = parseFloat(slider.value);
      gainLabel.textContent = formatEqGain(eqGains[i]);
      if (!eqEnabled) setEqEnabled(true);
      else applyEqAll();
      updateEqPresetHighlight();
    });
    slider.addEventListener('change', () => commitEqState());
  });

  function refreshEqSlidersUI(){
    eqGains.forEach((g, i) => {
      eqSliders[i].value = g;
      eqGainLabels[i].textContent = formatEqGain(g);
    });
  }

  function updateEqPresetHighlight(){
    let matched = null;
    Object.keys(EQ_PRESETS).forEach(name => {
      const preset = EQ_PRESETS[name];
      const isMatch = preset.every((v, i) => Math.abs(v - eqGains[i]) < 0.01);
      if (isMatch) matched = name;
    });
    eqPresetRow.querySelectorAll('button').forEach(b => {
      b.classList.toggle('active', b.dataset.eqPreset === matched);
    });
  }

  // EQ edits go to a per-track override once one is active for the current
  // song, otherwise to the universal ("all songs") settings - never both,
  // so there's no silent stacking to reason about.
  function commitEqState(){
    if (trackEqOverrideActive && currentIndex !== -1){
      saveTrackEqOverride(tracks[currentIndex].dbId, { gains: eqGains.slice(), enabled: eqEnabled });
    } else {
      globalEqGains = eqGains.slice();
      globalEqEnabled = eqEnabled;
      saveSettings();
    }
  }

  function refreshEqPowerUI(){
    eqPowerBtn.textContent = eqEnabled ? 'On' : 'Off';
    eqPowerBtn.classList.toggle('on', eqEnabled);
    eqBtn.classList.toggle('toggled', eqEnabled);
  }
  function refreshEqOverrideUI(){
    eqOverrideToggle.checked = trackEqOverrideActive;
  }

  function setEqEnabled(on){
    eqEnabled = on;
    refreshEqPowerUI();
    Object.values(graphs).forEach(rewireFilterChain);
    applyEqAll();
  }

  eqBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    eqDropdown.classList.toggle('open');
    clampDropdownToViewport(eqDropdown);
  });
  eqDropdown.addEventListener('click', (e) => e.stopPropagation());
  document.addEventListener('click', () => eqDropdown.classList.remove('open'));

  eqPowerBtn.addEventListener('click', () => {
    setEqEnabled(!eqEnabled);
    commitEqState();
  });

  eqOverrideToggle.addEventListener('change', () => {
    trackEqOverrideActive = eqOverrideToggle.checked;
    if (!trackEqOverrideActive){
      // Revert to whatever the universal settings currently are.
      eqGains = globalEqGains.slice();
      eqEnabled = globalEqEnabled;
    }
    refreshEqSlidersUI();
    updateEqPresetHighlight();
    refreshEqPowerUI();
    Object.values(graphs).forEach(rewireFilterChain);
    applyEqAll();
    if (currentIndex !== -1){
      saveTrackEqOverride(tracks[currentIndex].dbId, trackEqOverrideActive ? { gains: eqGains.slice(), enabled: eqEnabled } : null);
    }
  });

  eqPresetRow.querySelectorAll('button[data-eq-preset]').forEach(btn => {
    btn.addEventListener('click', () => {
      const preset = EQ_PRESETS[btn.dataset.eqPreset];
      if (!preset) return;
      eqGains = preset.slice();
      refreshEqSlidersUI();
      updateEqPresetHighlight();
      if (btn.dataset.eqPreset !== 'flat' && !eqEnabled) setEqEnabled(true);
      else applyEqAll();
      commitEqState();
    });
  });

  eqResetBtn.addEventListener('click', () => {
    eqGains = EQ_PRESETS.flat.slice();
    refreshEqSlidersUI();
    updateEqPresetHighlight();
    applyEqAll();
    commitEqState();
  });

