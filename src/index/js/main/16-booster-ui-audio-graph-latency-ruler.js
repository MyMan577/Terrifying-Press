  // ---------- Volume booster UI ----------
  // Master: a straight percentage gain applied to everything, on top of the
  // 0-100 volume slider (which caps at "normal" loudness). A song can
  // optionally override master with its own value instead - the two never
  // stack, so the "This song" slider is disabled until its checkbox is on.
  function refreshBoostUI(){
    const mPct = Math.round(masterBoost * 100);
    masterBoostSlider.value = mPct;
    masterBoostVal.textContent = mPct + '%';

    trackBoostOverrideToggle.checked = trackBoostOverrideActive;
    trackBoostSlider.disabled = !trackBoostOverrideActive;
    const effective = trackBoostOverrideActive ? trackBoost : masterBoost;
    const tPct = Math.round(effective * 100);
    trackBoostSlider.value = tPct;
    trackBoostVal.textContent = tPct + '%';
  }

  masterBoostSlider.addEventListener('input', () => {
    masterBoost = parseFloat(masterBoostSlider.value) / 100;
    masterBoostVal.textContent = Math.round(masterBoost * 100) + '%';
    if (!trackBoostOverrideActive){
      trackBoostSlider.value = masterBoostSlider.value;
      trackBoostVal.textContent = masterBoostVal.textContent;
    }
    ensureAudioCtx();
    if (currentIndex !== -1) getGraphFor(tracks[currentIndex].kind === 'video' ? 'video' : 'audio');
    applyMasterBoostAll();
  });
  masterBoostSlider.addEventListener('change', () => saveSettings());

  trackBoostOverrideToggle.addEventListener('change', () => {
    trackBoostOverrideActive = trackBoostOverrideToggle.checked;
    trackBoost = trackBoostOverrideActive ? masterBoost : 1; // seed from the current effective level
    refreshBoostUI();
    ensureAudioCtx();
    if (currentIndex !== -1) getGraphFor(tracks[currentIndex].kind === 'video' ? 'video' : 'audio');
    applyMasterBoostAll();
    applyTrackBoostToCurrentGraph();
    if (currentIndex !== -1){
      saveTrackBoostOverride(tracks[currentIndex].dbId, trackBoostOverrideActive ? trackBoost : null);
    }
  });

  trackBoostSlider.addEventListener('input', () => {
    if (!trackBoostOverrideActive) return;
    trackBoost = parseFloat(trackBoostSlider.value) / 100;
    trackBoostVal.textContent = Math.round(trackBoost * 100) + '%';
    ensureAudioCtx();
    if (currentIndex !== -1) getGraphFor(tracks[currentIndex].kind === 'video' ? 'video' : 'audio');
    applyTrackBoostToCurrentGraph();
  });
  trackBoostSlider.addEventListener('change', () => {
    if (currentIndex !== -1 && trackBoostOverrideActive) saveTrackBoostOverride(tracks[currentIndex].dbId, trackBoost);
  });

  boostResetBtn.addEventListener('click', () => {
    masterBoost = 1;
    trackBoost = 1;
    trackBoostOverrideActive = false;
    refreshBoostUI();
    applyMasterBoostAll();
    applyTrackBoostToCurrentGraph();
    if (currentIndex !== -1) saveTrackBoostOverride(tracks[currentIndex].dbId, null);
    saveSettings();
  });

  const ICONS = {
    play: '<path d="M8 5v14l11-7z"/>',
    pause: '<rect x="6" y="5" width="4" height="14"/><rect x="14" y="5" width="4" height="14"/>'
  };

  // The "active" media element mirrors whichever track is loaded, unless
  // we've substituted the audio element in for a backgrounded video.
  function media(){
    if (bgAudioActive) return bgEl;
    return (currentIndex !== -1 && tracks[currentIndex] && tracks[currentIndex].kind === 'video')
      ? videoEl : audioEl;
  }

  // ---------- Audio graph for visualizer + equalizer ----------
  // Each media element gets its own analyser, created lazily on first use,
  // since a MediaElementSource can only be attached once per element.
  let audioCtx;
  const graphs = {}; // key: 'audio' | 'video' -> { analyser, dataArray, source, filters, masterGain, trackGain }

  // The bitcrusher used to run as a ScriptProcessorNode, whose callback
  // executes on the main thread. That put it in direct competition with
  // page rendering, layout, and localStorage writes for CPU time - and on
  // a thin 'interactive' buffer, losing that race for even a few
  // milliseconds is exactly what caused audible crackle, worst of all over
  // Bluetooth's extra encode/radio hop. The old fix for that was a bigger
  // buffer (the Bluetooth crackle fix toggle), which trades latency for
  // headroom against a main-thread stall.
  //
  // AudioWorkletProcessor removes the actual cause instead: its process()
  // runs on the dedicated audio rendering thread, which the main thread
  // can't block or delay. With the bitcrusher off the main thread, there's
  // no main-thread stall left for a bigger buffer to guard against, so the
  // smallest ('interactive') buffer is safe unconditionally - no toggle,
  // no reload, no latency/stability tradeoff for anyone.
  //
  // The processor is registered from a Blob URL (no separate file to ship
  // or host) once, eagerly, at load - by the time any track can play,
  // registration has finished, so every caller of getGraphFor() below can
  // stay fully synchronous instead of needing to await module load.
  const BITCRUSHER_WORKLET_SRC = `
    class BitcrusherProcessor extends AudioWorkletProcessor {
      static get parameterDescriptors(){
        return [{ name: 'amount', defaultValue: 0, minValue: 0, maxValue: 1, automationRate: 'k-rate' }];
      }
      constructor(){
        super();
        this._hold = [0, 0];
        this._counter = [0, 0];
      }
      process(inputs, outputs, parameters){
        const input = inputs[0], output = outputs[0];
        const amt = parameters.amount[0];
        if (amt <= 0.001){
          for (let ch = 0; ch < output.length; ch++){
            if (input[ch]) output[ch].set(input[ch]);
          }
          return true;
        }
        // Mirrors the easeIn(amt, 1.8) curve applied before this param is
        // set, and the same bit-depth / hold-sample-count mapping the old
        // ScriptProcessor version used, so the sound is unchanged.
        const bits = 16 - amt * 13;
        const step = Math.pow(0.5, bits);
        const holdEvery = 1 + Math.round(amt * 38);
        for (let ch = 0; ch < output.length; ch++){
          const inCh = input[ch], outCh = output[ch];
          if (!inCh){ continue; }
          let counter = this._counter[ch] || 0;
          let hold = this._hold[ch] || 0;
          for (let i = 0; i < inCh.length; i++){
            counter++;
            if (counter >= holdEvery){
              counter = 0;
              hold = Math.round(inCh[i] / step) * step;
            }
            outCh[i] = hold;
          }
          this._counter[ch] = counter;
          this._hold[ch] = hold;
        }
        return true;
      }
    }
    registerProcessor('bitcrusher-processor', BitcrusherProcessor);
  `;
  let bitcrusherWorkletReady = null;
  let bitcrusherWorkletResolved = false; // flips true once addModule() actually finishes
  let bitcrusherWorkletFailed = false;   // flips true if the browser can't support it at all
  function ensureBitcrusherWorklet(ctx){
    if (!bitcrusherWorkletReady){
      if (!ctx.audioWorklet){
        bitcrusherWorkletFailed = true;
        bitcrusherWorkletReady = Promise.reject(new Error('AudioWorklet unsupported'));
        bitcrusherWorkletReady.catch(() => {}); // this promise is only polled via the flags below, never awaited - silence the unhandled-rejection warning that would otherwise fire
        return bitcrusherWorkletReady;
      }
      const blob = new Blob([BITCRUSHER_WORKLET_SRC], { type: 'application/javascript' });
      const url = URL.createObjectURL(blob);
      bitcrusherWorkletReady = ctx.audioWorklet.addModule(url)
        .then(() => { bitcrusherWorkletResolved = true; })
        .catch(err => {
          // If a browser lacks (or fails to register) AudioWorklet, fall
          // back to the main-thread ScriptProcessor path further down
          // rather than leaving bitcrush silently broken.
          console.warn('Bitcrusher AudioWorklet unavailable, falling back to ScriptProcessor', err);
          bitcrusherWorkletFailed = true;
        });
    }
    return bitcrusherWorkletReady;
  }
  // Builds the bitcrush node for a graph: the real AudioWorkletNode once
  // registration has resolved, or a ScriptProcessor in the rare case a
  // graph is built before registration finishes (e.g. a track started
  // within the same tick as first load) or the browser can't support
  // AudioWorklet at all. Every graph built after the (near-instant, one
  // time) registration settles gets the worklet version.
  function createBitcrusherNode(ctx){
    if (bitcrusherWorkletResolved && !bitcrusherWorkletFailed){
      const node = new AudioWorkletNode(ctx, 'bitcrusher-processor', {
        numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [2]
      });
      node._isFallbackScriptProcessor = false;
      return node;
    }
    const node = ctx.createScriptProcessor(4096, 2, 2);
    node._isFallbackScriptProcessor = true;
    return node;
  }
  // Kick registration off immediately so it's long done before any track
  // can actually start playing.
  function ensureAudioCtx(){
    // A thin 'interactive' buffer is safe now for everyone: the bitcrusher
    // (formerly the main thread's biggest audio-adjacent cost) runs on the
    // dedicated audio-rendering thread via AudioWorklet, so page-thread
    // hiccups (GC pauses, layout, localStorage writes) no longer compete
    // with audio rendering for the same thread. No latencyHint override,
    // no crackle-vs-latency tradeoff, no toggle needed.
    if (!audioCtx){
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      ensureBitcrusherWorklet(audioCtx);
    }
    if (audioCtx.state === 'suspended') audioCtx.resume();
    return audioCtx;
  }

  // Once a media element is wired into the Web Audio graph via
  // createMediaElementSource(), its actual audio output depends on the
  // AudioContext being in the 'running' state - not just "not yet
  // suspended". ensureAudioCtx() kicks off resume() but doesn't wait for
  // it, and on Android Chrome/Samsung Internet, calling play() on an
  // element whose output has nowhere to go yet (context still resuming)
  // makes playback sit in a stalled/buffering state until the context
  // catches up - which looks like a stall right at track start, sometimes
  // followed by the element resetting position once it does catch up.
  // Actually awaiting resume() before play() avoids that race.
  async function resumeAudioCtx(){
    const ctx = ensureAudioCtx();
    if (ctx.state === 'suspended'){
      try { await ctx.resume(); } catch(e) { /* ignore, play() will surface any real problem */ }
    }
    return ctx;
  }

  // ---------- Latency ruler ----------
  // A ruler with numbered bars every 200ms across a fixed 2000ms loop
  // (matching the slider's positive range, since Bluetooth lag is
  // essentially always positive delay). A thin playhead line sweeps
  // across at constant speed and a click plays at the exact instant the
  // playhead's position reaches each bar. Both the audible click and the
  // visual "hit" flash are driven from one continuously-read audio-clock
  // position, computed fresh every animation frame - not two separately
  // scheduled events (an audio-clock click plus a setTimeout flash) that
  // can drift apart under any main-thread delay. Whichever bar's number
  // you hear the click land on IS the delay: read it and set the slider
  // to that.
  const RULER_LOOP_MS = 2000;
  const RULER_BAR_STEP_MS = 200;
  const RULER_VIEW_W = 300;
  const RULER_VIEW_H = 60;
  let rulerRafId = null;
  let rulerStartTime = 0;      // audioCtx.currentTime at which the loop began
  let rulerClicksScheduled = -1; // last loop index whose clicks have been scheduled
  let rulerLastHitBarMs = -1;  // which bar (by ms) most recently got its flash triggered, this loop
  let rulerLastLoopIndex = -1;
  const rulerBars = []; // {ms, lineEl, labelEl}

  function buildRulerSvg(){
    const svg = document.getElementById('latency-ruler');
    svg.innerHTML = '';
    const ns = 'http://www.w3.org/2000/svg';
    rulerBars.length = 0;
    for (let ms = 0; ms <= RULER_LOOP_MS; ms += RULER_BAR_STEP_MS){
      const x = (ms / RULER_LOOP_MS) * RULER_VIEW_W;
      const line = document.createElementNS(ns, 'line');
      line.setAttribute('class', 'ruler-bar');
      line.setAttribute('x1', x); line.setAttribute('x2', x);
      line.setAttribute('y1', 14); line.setAttribute('y2', 44);
      svg.appendChild(line);
      const label = document.createElementNS(ns, 'text');
      label.setAttribute('class', 'ruler-label');
      label.setAttribute('x', Math.min(Math.max(x, 12), RULER_VIEW_W - 12));
      label.setAttribute('y', 54);
      label.textContent = ms;
      svg.appendChild(label);
      rulerBars.push({ ms, lineEl: line, labelEl: label });
    }
    const playhead = document.createElementNS(ns, 'line');
    playhead.setAttribute('class', 'ruler-playhead');
    playhead.setAttribute('id', 'latency-ruler-playhead');
    playhead.setAttribute('y1', 6); playhead.setAttribute('y2', 54);
    svg.appendChild(playhead);
  }

  function playRulerClick(atTime){
    const ctx = ensureAudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = 1000;
    gain.gain.setValueAtTime(0, atTime);
    gain.gain.linearRampToValueAtTime(0.5, atTime + 0.001);
    gain.gain.exponentialRampToValueAtTime(0.0001, atTime + 0.05);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(atTime);
    osc.stop(atTime + 0.06);
  }

  // Schedules every bar's click for a given loop index, all at once,
  // ahead of when the playhead will reach them - the audio clock's own
  // scheduling queue keeps these sample-accurate regardless of any
  // main-thread jank. Called one loop ahead of the one currently
  // playing, so every bar (including ms=0) always gets a click scheduled
  // before the playhead reaches it - unlike scheduling the current loop
  // reactively, which could schedule a bar's click after the playhead
  // had already passed its position, silently skipping it.
  function scheduleRulerClicksForLoop(loopIndex){
    if (loopIndex <= rulerClicksScheduled) return;
    rulerClicksScheduled = loopIndex;
    const loopStartTime = rulerStartTime + (loopIndex * RULER_LOOP_MS) / 1000;
    rulerBars.forEach(bar => {
      if (bar.ms >= RULER_LOOP_MS) return; // ms=2000 is the same instant as next loop's ms=0; don't double-click it
      playRulerClick(loopStartTime + bar.ms / 1000);
    });
  }

  function flashRulerBar(bar){
    bar.lineEl.classList.add('hit');
    bar.labelEl.classList.add('hit');
    setTimeout(() => {
      bar.lineEl.classList.remove('hit');
      bar.labelEl.classList.remove('hit');
    }, 120);
  }

  function drawRulerPlayhead(){
    rulerRafId = requestAnimationFrame(drawRulerPlayhead);
    const ctx = ensureAudioCtx();
    const elapsedMs = (ctx.currentTime - rulerStartTime) * 1000;
    const loopIndex = Math.floor(elapsedMs / RULER_LOOP_MS);
    const posMs = elapsedMs - loopIndex * RULER_LOOP_MS;

    // Always keep the NEXT loop's clicks scheduled ahead of the playhead
    // reaching them, not just the current one - this is what guarantees
    // every bar gets a click before drawing ever needs to show it as hit.
    scheduleRulerClicksForLoop(loopIndex);
    scheduleRulerClicksForLoop(loopIndex + 1);

    if (loopIndex !== rulerLastLoopIndex){
      rulerLastLoopIndex = loopIndex;
      rulerLastHitBarMs = -1; // fresh loop: no bar has been flashed yet
    }

    // The flash fires here, driven by the exact same posMs used to place
    // the playhead line below - not a separate setTimeout - so the visual
    // hit and the playhead's on-screen position crossing the bar are
    // necessarily the same frame, and (because playRulerClick above used
    // this same clock) the same moment the click actually plays.
    rulerBars.forEach(bar => {
      if (bar.ms < RULER_LOOP_MS && posMs >= bar.ms && bar.ms > rulerLastHitBarMs){
        flashRulerBar(bar);
        rulerLastHitBarMs = bar.ms;
      }
    });

    const x = (posMs / RULER_LOOP_MS) * RULER_VIEW_W;
    const playhead = document.getElementById('latency-ruler-playhead');
    if (playhead){
      playhead.setAttribute('x1', x);
      playhead.setAttribute('x2', x);
    }
  }

  async function startRuler(){
    const ctx = await resumeAudioCtx();
    buildRulerSvg();
    rulerStartTime = ctx.currentTime;
    rulerClicksScheduled = -1;
    rulerLastHitBarMs = -1;
    rulerLastLoopIndex = -1;
    drawRulerPlayhead();
  }

  function stopRuler(){
    if (rulerRafId != null) cancelAnimationFrame(rulerRafId);
    rulerRafId = null;
  }

  latencyMetronomeToggle.addEventListener('change', () => {
    const on = latencyMetronomeToggle.checked;
    document.getElementById('latency-ruler-wrap').style.display = on ? 'block' : 'none';
    latencyDropdown.classList.toggle('ruler-open', on);
    if (on) startRuler(); else stopRuler();
  });

  function getGraphFor(kind){
    if (graphs[kind]) return graphs[kind];
    const ctx = ensureAudioCtx();
    const el = kind === 'video' ? videoEl : kind === 'bg' ? bgFxEl : audioEl;
    const analyser = ctx.createAnalyser();
    PPNative.decorateAnalyser(analyser);
    // Finer resolution than the default 256 so the bass end isn't crammed
    // into one or two bins that every low-frequency bar ends up sharing.
    analyser.fftSize = 1024;
    analyser.smoothingTimeConstant = 0;   // the visualizer does its own rise/fall; 0.8 here smeared every hit
    const dataArray = new Uint8Array(analyser.frequencyBinCount);
    const source = ctx.createMediaElementSource(PPNative.raw(el));

    // Chain: source -> band1 -> band2 -> ... -> trackGain -> masterGain -> analyser -> destination.
    // Filters sit ahead of the analyser so the visualizer reacts to the
    // EQ'd (and boosted) signal, not the untouched original. trackGain
    // compensates for this specific song being too quiet/loud; masterGain
    // is the overall volume-booster applied to everything.
    const filters = EQ_BANDS.map((band, i) => {
      const f = ctx.createBiquadFilter();
      f.type = 'peaking';
      f.frequency.value = band.freq;
      f.Q.value = 1;
      f.gain.value = eqEnabled ? eqGains[i] : 0;
      return f;
    });
    const trackGain = ctx.createGain();
    trackGain.gain.value = (trackBoostOverrideActive ? trackBoost : 1) * rgFactor();
    const masterGain = ctx.createGain();
    masterGain.gain.value = trackBoostOverrideActive ? 1 : masterBoost;

    // Bass boost: a low-shelf filter plus a resonant "punch" peak just above
    // it, both sitting after the EQ/volume stages so "bass boost" always
    // means the same absolute low-end lift regardless of where the EQ bands
    // are set. The peak is what makes it feel like a felt boost rather than
    // a subtle tone tilt. A subsonic highpass ahead of both keeps them from
    // piling gain onto near-DC rumble that's inaudible but still eats
    // headroom (and headroom is exactly what turns a boost into clipping/
    // crackle).
    const subsonicFilter = ctx.createBiquadFilter();
    subsonicFilter.type = 'highpass';
    subsonicFilter.frequency.value = 28;
    subsonicFilter.Q.value = 0.5;
    const bassFilter = ctx.createBiquadFilter();
    bassFilter.type = 'lowshelf';
    bassFilter.frequency.value = BASS_BOOST_FREQ;
    bassFilter.gain.value = easeOut(bassBoost, 2) * BASS_BOOST_MAX_DB;
    const bassPeak = ctx.createBiquadFilter();
    bassPeak.type = 'peaking';
    bassPeak.frequency.value = BASS_PEAK_FREQ;
    bassPeak.Q.value = 0.9;
    bassPeak.gain.value = easeOut(bassBoost, 2) * BASS_PEAK_MAX_DB;

    // Harmonic exciter: on phone/laptop speakers, the ~60-110Hz range the
    // shelf/peak above boost typically can't be reproduced by the driver at
    // all, so gain there is inaudible no matter how high it's turned up.
    // This branch taps the same low band, drives it through a waveshaper to
    // generate its upper harmonics (2nd/3rd, etc. - which small speakers
    // *can* reproduce), strips the original fundamental back out with a
    // highpass, and mixes only those harmonics back in. The ear reconstructs
    // a sense of the missing fundamental from its harmonics, which is what
    // makes bass "boost" actually audible on hardware that can't play bass.
    const exciterBandpass = ctx.createBiquadFilter();
    exciterBandpass.type = 'lowpass';
    exciterBandpass.frequency.value = BASS_PEAK_FREQ * 4.2;
    exciterBandpass.Q.value = 0.7;
    const exciterShaper = ctx.createWaveShaper();
    exciterShaper.oversample = '4x';
    const exciterHighpass = ctx.createBiquadFilter();
    exciterHighpass.type = 'highpass';
    exciterHighpass.frequency.value = BASS_PEAK_FREQ * 3;
    exciterHighpass.Q.value = 0.7;
    const exciterGain = ctx.createGain();
    const initExciterT = easeOut(bassBoost, 2);
    exciterShaper.curve = makeDistortionCurve(Math.min(1, initExciterT * 0.6));
    exciterGain.gain.value = initExciterT * EXCITER_MAX_GAIN;

    // Filter: classic single-knob DJ filter. Two always-in-chain filters
    // sit fully open (lowpass maxed out, highpass bottomed out) at rest, so
    // there's no audible effect until the knob is turned off-center.
    const initFilterT = easeIn(filterAmount, 1.5);
    const filterLP = ctx.createBiquadFilter();
    filterLP.type = 'lowpass';
    filterLP.Q.value = 0.7;
    filterLP.frequency.value = initFilterT < 0 ? 20000 * Math.pow(FILTER_LP_MIN_FREQ / 20000, -initFilterT) : 20000;
    const filterHP = ctx.createBiquadFilter();
    filterHP.type = 'highpass';
    filterHP.Q.value = 0.7;
    filterHP.frequency.value = initFilterT > 0 ? 20 * Math.pow(FILTER_HP_MAX_FREQ / 20, initFilterT) : 20;

    // Distortion: a WaveShaperNode with a soft-clip curve; oversampling
    // reduces the aliasing that clipping introduces.
    const distortion = ctx.createWaveShaper();
    distortion.curve = makeDistortionCurve(distortionAmount);
    distortion.oversample = '4x';

    // Bitcrush: real bit-depth + sample-rate reduction. Runs as an
    // AudioWorkletNode (see BITCRUSHER_WORKLET_SRC / ensureBitcrusherWorklet
    // above) so the actual crunching happens on the dedicated audio
    // rendering thread instead of the main thread - eliminating the
    // main-thread contention that used to force a choice between a bigger
    // (higher-latency) buffer and audible crackle. Registration is kicked
    // off eagerly at load and is essentially always finished by the time a
    // graph is first built; createBitcrusherNode() below covers the
    // rare cases (registration still in flight, or no AudioWorklet support
    // at all) with a synchronous ScriptProcessor fallback so bitcrush never
    // silently breaks.
    const bitcrusher = createBitcrusherNode(ctx);
    const crushHold = [0, 0];
    const crushCounter = [0, 0];
    if (bitcrusher._isFallbackScriptProcessor) bitcrusher.onaudioprocess = (e) => {
      // easeIn: the first half of the knob's travel stays fairly mild -
      // full-on crunch is reserved for the back half, not the first nudge.
      const amt = easeIn(bitcrushAmount, 1.8);
      const input = e.inputBuffer, output = e.outputBuffer;
      const channels = Math.min(input.numberOfChannels, output.numberOfChannels);
      if (amt <= 0.001){
        for (let ch = 0; ch < channels; ch++) output.getChannelData(ch).set(input.getChannelData(ch));
        return;
      }
      const bits = 16 - amt * 13;          // 16-bit down to ~3-bit
      const step = Math.pow(0.5, bits);
      const holdEvery = 1 + Math.round(amt * 38); // effective sample-rate reduction
      for (let ch = 0; ch < channels; ch++){
        const inData = input.getChannelData(ch);
        const outData = output.getChannelData(ch);
        let counter = crushCounter[ch];
        let hold = crushHold[ch];
        for (let i = 0; i < inData.length; i++){
          counter++;
          if (counter >= holdEvery){
            counter = 0;
            hold = Math.round(inData[i] / step) * step;
          }
          outData[i] = hold;
        }
        crushCounter[ch] = counter;
        crushHold[ch] = hold;
      }
    };

    // Echo: a single delay line with feedback, tapped in parallel like the
    // reverb below (it adds repeats on top of the dry signal rather than
    // replacing it). Fixed delay time keeps this a classic slap-back echo
    // rather than a tempo-synced effect - the knob only controls how loud
    // the repeats are and how many of them you hear before they die out.
    const echoDelay = ctx.createDelay(1.0);
    echoDelay.delayTime.value = ECHO_DELAY_SEC;
    const echoFeedback = ctx.createGain();
    echoFeedback.gain.value = echoMix * ECHO_FEEDBACK_MAX;
    const echoWetGain = ctx.createGain();
    echoWetGain.gain.value = echoMix * ECHO_WET_MAX;
    // The feedback loop (delay -> feedback -> back into delay) is wired once
    // here and left permanently connected - it's silent on its own with no
    // signal reaching the delay's input, so there's no cost to leaving it
    // wired even while the echo tap itself is bypassed at rest.
    echoDelay.connect(echoFeedback);
    echoFeedback.connect(echoDelay);

    // Tremolo: amplitude modulation via an LFO driving a gain node. The
    // oscillator runs continuously from creation (oscillators can only be
    // started once) at a fixed classic tremolo rate; only the modulation
    // depth is knob-controlled. gain.value holds the center level the LFO
    // swings around, and tremoloDepth scales how wide that swing is - at
    // depth 0 the gain node sits at a steady 1 (silent no-op).
    const tremoloGain = ctx.createGain();
    tremoloGain.gain.value = 1;
    const tremoloLFO = ctx.createOscillator();
    tremoloLFO.type = 'sine';
    tremoloLFO.frequency.value = TREMOLO_RATE_HZ;
    const tremoloDepth = ctx.createGain();
    tremoloDepth.gain.value = 0;
    tremoloLFO.connect(tremoloDepth);
    tremoloDepth.connect(tremoloGain.gain);
    tremoloLFO.start();

    // Reverb: a parallel wet/dry split around a ConvolverNode, summed back
    // together into outGain. This is a real convolution reverb (not a
    // preset/EQ trick) - reverbWetGain/reverbDryGain are what the mix slider
    // actually controls. A lowpass + gentle highpass sit in the wet path
    // only, trimming the top-end hiss and low-end rumble that raw convolved
    // noise otherwise carries, so the tail reads as a room, not static.
    const convolver = ctx.createConvolver();
    convolver.buffer = getReverbImpulse(ctx);
    convolver.normalize = true;
    const wetDampLP = ctx.createBiquadFilter();
    wetDampLP.type = 'lowpass';
    wetDampLP.frequency.value = 5200;
    wetDampLP.Q.value = 0.5;
    const wetDampHP = ctx.createBiquadFilter();
    wetDampHP.type = 'highpass';
    wetDampHP.frequency.value = 120;
    wetDampHP.Q.value = 0.5;
    const reverbDryGain = ctx.createGain();
    reverbDryGain.gain.value = 1 - reverbMix * 0.7;
    const reverbWetGain = ctx.createGain();
    reverbWetGain.gain.value = reverbMix;
    const outGain = ctx.createGain();
    outGain.gain.value = 1;

    // Safety-net limiter: bass boost, distortion, and volume booster can all
    // add gain, and stacked together (or even one pushed hard on its own)
    // they can push samples past 0dBFS - which is what "crackly" was: not a
    // bug in one effect, but plain digital clipping at the output. A fast
    // brick-wall-ish compressor right before the destination catches that
    // regardless of which combination of knobs caused it, instead of every
    // effect having to individually guess at safe headroom.
    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -2;
    limiter.knee.value = 3;
    limiter.ratio.value = 10;
    limiter.attack.value = 0.002;
    limiter.release.value = 0.12;

    // Everything from masterGain through outGain is wired up lazily by
    // rewireFxChain() below rather than connected here, so a fresh graph
    // starts with every FX stage - including the ScriptProcessor bitcrusher -
    // fully bypassed until a knob actually asks for it.
    trackGain.connect(masterGain);
    outGain.connect(limiter);
    limiter.connect(analyser);
    analyser.connect(ctx.destination);
    // Negative latency = hold the SOUND back (for when the picture arrives
    // late). Only wired in while in use, so it costs nothing at 0.
    const audioDelay = ctx.createDelay(2.0);
    audioDelay.delayTime.value = 0;

    graphs[kind] = {
      analyser, dataArray, source, filters, masterGain, trackGain, filtersConnected: null,
      subsonicFilter, bassFilter, bassPeak, filterLP, filterHP, distortion, bitcrusher, lastDistortionAmount: distortionAmount,
      exciterBandpass, exciterShaper, exciterHighpass, exciterGain, lastExciterAmount: -1,
      convolver, wetDampLP, wetDampHP, reverbDryGain, reverbWetGain, outGain, limiter,
      echoDelay, echoFeedback, echoWetGain, tremoloGain, tremoloLFO, tremoloDepth,
      audioDelay, audioDelayOn: false,
      fxWiring: null
    };
    rewireFilterChain(graphs[kind]);
    rewireFxChain(graphs[kind]);
    applyAudioDelay(graphs[kind]);
    return graphs[kind];
  }

  // Wires source -> filters... -> trackGain when the EQ is on, or
  // source -> trackGain directly when it's off. Running audio through six
  // cascaded biquad filters at effectively-unity gain is still six extra
  // IIR stages of real-time processing for no audible benefit, and combined
  // with a media element playing at an altered rate (which itself adds
  // real-time resampling work) that's more than enough headroom pressure
  // on the audio thread to explain audible crackle even while sitting
  // still at a fixed, only-slightly-off speed like 0.95x. Skipping the
  // filter chain entirely when the EQ is off removes that extra load.
  function rewireFilterChain(g){
    const useFilters = eqEnabled;
    if (g.filtersConnected === useFilters) return; // already wired this way
    g.source.disconnect();
    g.filters.forEach(f => f.disconnect());
    if (useFilters){
      let node = g.source;
      g.filters.forEach(f => { node.connect(f); node = f; });
      node.connect(g.trackGain);
    } else {
      g.source.connect(g.trackGain);
    }
    g.filtersConnected = useFilters;
  }

  // Every stage from masterGain to outGain used to be permanently wired in,
  // running full audio-rate DSP (six biquads' worth of bass/filter shaping,
  // a waveshaper, a convolution reverb, and - worst of all - a
  // ScriptProcessorNode bitcrusher whose JS callback runs on the main
  // thread) even when every knob sat at its no-op default. That's extra
  // real-time work competing with page rendering for CPU time on every
  // single track, which is exactly the kind of headroom pressure that
  // causes audible crackle even while just listening passively - not only
  // while a knob is actively being turned.
  //
  // This reconnects the chain to route around whichever stages are at rest,
  // so idle FX cost nothing. "At rest" is checked against the same values
  // that already make each stage a no-op (0 gain, 0 mix, dead-center
  // filter), so audible behavior is identical - this only changes whether
  // silent pass-through nodes are sitting in the graph doing the work of
  // proving that to themselves on every sample.
  function fxStagesActive(){
    return {
      bass: bassBoost > 0,
      filter: filterAmount !== 0,
      distortion: distortionAmount > 0,
      bitcrush: bitcrushAmount > 0,
      tremolo: tremoloAmount > 0,
      echo: echoMix > 0,
      reverb: reverbMix > 0
    };
  }
  function rewireFxChain(g){
    const active = fxStagesActive();
    const key = active.bass + ',' + active.filter + ',' + active.distortion + ',' + active.bitcrush + ',' + active.tremolo + ',' + active.echo + ',' + active.reverb;
    if (g.fxWiring === key) return; // already wired this way

    // Disconnect every node in the segment before re-linking it; cheap and
    // avoids having to track every possible prior edge individually.
    // echoFeedback is intentionally left out of this list: it's wired once
    // permanently into echoDelay at graph creation and that inbound edge
    // isn't touched by disconnecting other nodes, so it survives every
    // rewire without needing to be restored.
    [g.masterGain, g.subsonicFilter, g.bassFilter, g.bassPeak, g.filterLP, g.filterHP,
     g.distortion, g.bitcrusher, g.tremoloGain, g.echoDelay, g.echoWetGain, g.wetDampHP, g.wetDampLP, g.convolver,
     g.reverbDryGain, g.reverbWetGain,
     g.exciterBandpass, g.exciterShaper, g.exciterHighpass, g.exciterGain].forEach(n => n.disconnect());
    // Disconnecting echoDelay above also clears its outgoing edge into
    // echoFeedback, so that leg of the feedback loop needs restoring before
    // the rest of the chain is wired around it.
    g.echoDelay.connect(g.echoFeedback);

    let node = g.masterGain;
    if (active.bass){
      node.connect(g.subsonicFilter);
      g.subsonicFilter.connect(g.bassFilter);
      g.bassFilter.connect(g.bassPeak);
      node = g.bassPeak;
      // Exciter taps from the pre-boost point (before the shelf/peak add
      // their own gain) so its input level tracks the source material only -
      // not the shelf/peak's up-to-13dB lift too, which was compounding into
      // clipping once the shaper and exciterGain added their own gain on
      // top of an already-hot signal.
      g.subsonicFilter.connect(g.exciterBandpass);
      g.exciterBandpass.connect(g.exciterShaper);
      g.exciterShaper.connect(g.exciterHighpass);
      g.exciterHighpass.connect(g.exciterGain);
      g.exciterGain.connect(g.outGain);
    }
    if (active.filter){
      node.connect(g.filterLP);
      g.filterLP.connect(g.filterHP);
      node = g.filterHP;
    }
    if (active.distortion){
      node.connect(g.distortion);
      node = g.distortion;
    }
    if (active.bitcrush){
      node.connect(g.bitcrusher);
      node = g.bitcrusher;
    }
    if (active.tremolo){
      node.connect(g.tremoloGain);
      node = g.tremoloGain;
    }
    if (active.echo){
      // Parallel tap, like reverb below: echo adds repeats on top of the
      // signal rather than replacing it, so "node" itself isn't reassigned.
      node.connect(g.echoDelay);
      g.echoDelay.connect(g.echoWetGain);
      g.echoWetGain.connect(g.outGain);
    }
    if (active.reverb){
      node.connect(g.reverbDryGain);
      node.connect(g.wetDampHP);
      g.wetDampHP.connect(g.wetDampLP);
      g.wetDampLP.connect(g.convolver);
      g.convolver.connect(g.reverbWetGain);
      g.reverbDryGain.connect(g.outGain);
      g.reverbWetGain.connect(g.outGain);
    } else {
      node.connect(g.outGain);
    }
    g.fxWiring = key;
  }
  function applyAudioDelay(g){
    if (!g || !g.audioDelay) return;
    const sec = Math.min(2, Math.max(-effLatencyMs(), 0) / 1000);
    const on = sec > 0;
    if (on !== g.audioDelayOn && g.live !== false){
      g.limiter.disconnect();
      if (on){ g.limiter.connect(g.audioDelay); g.audioDelay.connect(g.analyser); }
      else { g.audioDelay.disconnect(); g.limiter.connect(g.analyser); }
      g.audioDelayOn = on;
    }
    // Eased so dragging the slider glides instead of clicking.
    const ctx = g.audioDelay.context;
    g.audioDelay.delayTime.setTargetAtTime(sec, ctx.currentTime, 0.04);
  }
  function applyAudioDelayAll(){ try { Object.values(graphs).forEach(applyAudioDelay); } catch (e){ /* graphs not created yet during early init */ } }
  function rewireFxChainAll(){
    Object.values(graphs).forEach(rewireFxChain);
  }

  // Setting an AudioParam's .value directly is an instantaneous step -
  // fine for a one-off initial value, but EQ/boost sliders fire their
  // 'input' handler dozens of times a second while being dragged, so a
  // stream of steps is a stream of tiny clicks that reads as crackle.
  // setTargetAtTime ramps to the new value over a few milliseconds
  // instead, which is inaudible as a ramp but still feels instant.
  function rampParam(param, value){
    if (audioCtx) param.setTargetAtTime(value, audioCtx.currentTime, 0.015);
    else param.value = value;
  }

  function applyEqToGraph(g){
    if (!g.filters) return;
    g.filters.forEach((f, i) => { rampParam(f.gain, eqEnabled ? eqGains[i] : 0); });
  }
  function applyEqAll(){
    Object.values(graphs).forEach(applyEqToGraph);
  }

  // Bridge for the separate "Press Play XP" closure further down the page:
  // eqPresetRow/eqSliders/eqGains/eqEnabled etc. are all local consts/lets
  // in *this* closure, so the leveling code (which adds the unlockable EQ
  // presets and widens the gain range) can't see them directly. Without
  // this, setupEqPro()/refreshEqBandLocks() over there silently no-op via
  // their own `typeof x === 'undefined'` guards - which is exactly why
  // leveling up looked like it did nothing to the equalizer.
  window.PPXpEq = {
    get presetRow(){ return eqPresetRow; },
    get sliders(){ return eqSliders; },
    get bandWraps(){ return eqBandWraps; },
    get bands(){ return EQ_BANDS; },
    setGains(gains){ eqGains = window.__ppEqNorm(gains); },
    refreshSlidersUI(){ refreshEqSlidersUI(); },
    updatePresetHighlight(){ updateEqPresetHighlight(); },
    isEnabled(){ return eqEnabled; },
    enable(){ setEqEnabled(true); },
    applyAll(){ applyEqAll(); },
    commitState(){ commitEqState(); }
  };

  function applyMasterBoostAll(){
    // Only one of master/track boost is ever actually applied - when a
    // track override is active, master's gain node is neutralized so the
    // two don't stack.
    const value = trackBoostOverrideActive ? 1 : masterBoost;
    Object.values(graphs).forEach(g => { if (g.masterGain) rampParam(g.masterGain.gain, value); });
  }
  function applyTrackBoostToCurrentGraph(){
    // Apply to EVERY graph, not just the "current" one. While a video plays with
    // audio-lead active, the sound comes out of the 'audio' graph even though the
    // current track is a video, so updating only currentGraph() left the audible
    // graph's trackGain stale. Master gain is neutralised on all graphs when the
    // override is on, so the track gain has to be kept in step on all of them too.
    const v = (trackBoostOverrideActive ? trackBoost : 1) * rgFactor();
    Object.values(graphs).forEach(g => { if (g && g.trackGain) rampParam(g.trackGain.gain, v); });
  }

  // For games (the Obby Prodigy's beat lock): how loud the low end (kick, bass) of the playing song is
  // right now. It reads the analyser's raw waveform, which keeps no state, so the visualizer is unaffected,
  // and it never builds a graph that isn't there. -1 when there is nothing to read.
  let _bassBuf = null;
  window.__ppBassLevel = function(){
    try {
      const kind = (bgAudioActive && bgEl === bgFxEl) ? 'bg' : (currentIndex !== -1 && tracks[currentIndex] && tracks[currentIndex].kind === 'video') ? 'video' : 'audio';
      const g = graphs[kind]; if (!g || !g.analyser) return -1;
      const an = g.analyser, n = an.fftSize;
      if (!_bassBuf || _bassBuf.length !== n) _bassBuf = new Uint8Array(n);
      an.getByteTimeDomainData(_bassBuf);
      const sr = (audioCtx && audioCtx.sampleRate) || 48000, k = 1 - Math.exp(-2 * Math.PI * 150 / sr);   // one-pole low-pass at 150 Hz
      let lp = (_bassBuf[0] - 128) / 128, e = 0;
      for (let i = 1; i < n; i++) { lp += k * ((_bassBuf[i] - 128) / 128 - lp); e += lp * lp; }
      return Math.sqrt(e / n);
    } catch (e) { return -1; }
  };

  function currentGraph(){
    if (bgAudioActive && bgEl === bgFxEl) return getGraphFor('bg');
    const kind = (currentIndex !== -1 && tracks[currentIndex] && tracks[currentIndex].kind === 'video') ? 'video' : 'audio';
    return getGraphFor(kind);
  }

  function resizeCanvas(){
    const box = canvas.parentElement;                         // layout size, so a zoom animation on the box can't shrink the canvas
    const dpr = Math.min(3, window.devicePixelRatio || 1);   // real pixels, so the bars are sharp on a phone screen
    canvas.width = Math.round(box.offsetWidth * 1.2 * dpr);  // #viz is 20% larger than its box (inset:-10%)
    canvas.height = Math.round(box.offsetHeight * 1.2 * dpr);
  }
  window.addEventListener('resize', resizeCanvas);
  window.addEventListener('resize', () => {
    document.querySelectorAll('.marquee').forEach(setupMarquee);
  });
  resizeCanvas();

