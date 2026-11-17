  // ---------- Effects on clips ----------
  // "Apply my current effects" bakes whatever is live in the player (equalizer, volume boost,
  // DJ effects, speed, latency, video look) into the exported clip. Audio exports are rendered
  // offline through a copy of the live Web Audio chain; real-time video exports run the sound
  // through the same chain and draw the picture through the same CSS/SVG filter string.
  const CUTTER_FX_KEY = 'playerCutterFx';
  const cutterFxMaster = document.getElementById('cutter-fx-master-input');
  const cutterFxList = document.getElementById('cutter-fx-list');
  const cutterFxNote = document.getElementById('cutter-fx-note');
  const CUTTER_CTX_FILTER = (() => { try { const c = document.createElement('canvas').getContext('2d'); return !!c && 'filter' in c; } catch(e){ return false; } })();
  let cutterFxOn = false;
  let cutterFxSig = '';
  const cutterFxPick = { eq: true, gain: true, fx: true, speed: true, latency: true, look: true };
  try {
    const s = JSON.parse(localStorage.getItem(CUTTER_FX_KEY) || 'null');
    if (s){
      cutterFxOn = !!s.on;
      Object.keys(cutterFxPick).forEach(k => { if (s.pick && typeof s.pick[k] === 'boolean') cutterFxPick[k] = s.pick[k]; });
    }
  } catch(e){}
  function saveCutterFx(){ try { localStorage.setItem(CUTTER_FX_KEY, JSON.stringify({ on: cutterFxOn, pick: cutterFxPick })); } catch(e){} }

  function cutterFxLive(){
    return {
      eq: eqEnabled ? eqGains.slice() : null,
      eqActive: eqEnabled && eqGains.some(g => Math.abs(g) > 0.01),
      gain: (trackBoostOverrideActive ? trackBoost : masterBoost) * rgFactor(),
      bass: bassBoost, reverb: reverbMix, filter: filterAmount, dist: distortionAmount,
      crush: bitcrushAmount, echo: echoMix, trem: tremoloAmount,
      speed: playbackSpeed,
      latency: subtitleLatencyMs,
      // Hidden decode compensation (the Settings toggle): same +300 ms playback adds to videos.
      comp: (decodeComp && cutterState && tracks[cutterState.trackIndex] && tracks[cutterState.trackIndex].kind === 'video') ? DECODE_COMP_MS : 0,
      look: buildVideoFilterString()
    };
  }
  function cutterLookNames(){
    const n = [];
    if (activeFilter !== 'none') n.push(activeFilter);
    if (sharpenAmount > 0) n.push('Sharpen ' + Math.round(sharpenAmount) + '%');
    if (clarityAmount > 0) n.push('Local contrast ' + Math.round(clarityAmount) + '%');
    if (autoLevelsOn) n.push('Auto levels');
    const a = window.__ppAdj;
    if (a && (a.b != 100 || a.c != 100 || a.s != 100 || a.h != 0)) n.push('Picture adjust');
    return n;
  }
  function cutterFxItems(live, kind, fmt){
    const videoOut = kind === 'video' && (fmt === 'video' || fmt === 'fast' || fmt === 'encode');
    const items = [];
    items.push({ id: 'eq', label: 'Equalizer', active: live.eqActive, detail: live.eqActive ? 'custom curve' : 'off' });
    items.push({ id: 'gain', label: 'Volume boost', active: Math.abs(live.gain - 1) > 0.005, detail: Math.round(live.gain * 100) + '%' });
    const pct = v => Math.round(v * 100) + '%';
    const names = [];
    if (live.bass > 0) names.push('Bass ' + pct(live.bass));
    if (live.reverb > 0) names.push('Reverb ' + pct(live.reverb));
    if (live.filter !== 0) names.push((live.filter < 0 ? 'Low-pass ' : 'High-pass ') + pct(Math.abs(live.filter)));
    if (live.dist > 0) names.push('Distortion ' + pct(live.dist));
    if (live.crush > 0) names.push('Bitcrush ' + pct(live.crush));
    if (live.echo > 0) names.push('Echo ' + pct(live.echo));
    if (live.trem > 0) names.push('Tremolo ' + pct(live.trem));
    items.push({ id: 'fx', label: 'DJ effects', active: names.length > 0, detail: names.length ? names.join(', ') : 'all off' });
    items.push({ id: 'speed', label: 'Speed', active: Math.abs(live.speed - 1) > 0.001, detail: (+live.speed.toFixed(2)) + 'x, pitch kept' });
    const comp = (videoOut && fmt !== 'fast') ? (live.comp || 0) : 0;   // Fast copy can't carry a delay, so it never includes it
    const lat = Math.round(live.latency + comp);
    let latActive = false, latDetail = '0 ms';
    if (lat > 0){
      if (videoOut){ latActive = true; latDetail = 'picture ' + lat + ' ms behind sound' + (comp ? ' (incl. ' + comp + ' ms decode comp.)' : ''); }
      else latDetail = lat + ' ms (picture only)';
    } else if (lat < 0){ latActive = true; latDetail = 'sound ' + (-lat) + ' ms behind picture'; }
    items.push({ id: 'latency', label: 'Latency', active: latActive, detail: latDetail });
    if (kind === 'video'){
      const ln = cutterLookNames();
      let d = ln.length ? ln.join(', ') : 'none';
      let act = ln.length > 0 && live.look !== 'none';
      if (act && !videoOut){ act = false; d = 'video export only'; }
      else if (act && !CUTTER_CTX_FILTER){ act = false; d = 'not supported on this phone'; }
      items.push({ id: 'look', label: 'Video look', active: act, detail: d });
    }
    return items;
  }
  // Everything the chosen export needs to know, or null when nothing would change.
  function cutterFxSnapshot(fmt){
    if (!cutterFxOn || !cutterState) return null;
    const track = tracks[cutterState.trackIndex];
    if (!track) return null;
    fmt = fmt || cutterFormat;
    const live = cutterFxLive();
    const items = cutterFxItems(live, track.kind, fmt);
    const on = id => { const it = items.find(i => i.id === id); return !!(it && it.active && cutterFxPick[id]); };
    const videoOut = track.kind === 'video' && (fmt === 'video' || fmt === 'fast' || fmt === 'encode');
    const lat = Math.round(live.latency + ((videoOut && fmt !== 'fast') ? (live.comp || 0) : 0));   // slider + decode compensation (re-encoding formats only)
    const a = { eq: on('eq') ? live.eq : null, gain: on('gain') ? live.gain : 1,
      bass: 0, reverb: 0, filter: 0, dist: 0, crush: 0, echo: 0, trem: 0,
      delaySec: (on('latency') && lat < 0) ? Math.min(2, -lat / 1000) : 0 };
    if (on('fx')){ a.bass = live.bass; a.reverb = live.reverb; a.filter = live.filter; a.dist = live.dist; a.crush = live.crush; a.echo = live.echo; a.trem = live.trem; }
    const speed = on('speed') ? live.speed : 1;
    const hasAudio = !!a.eq || Math.abs(a.gain - 1) > 0.005 || a.bass > 0 || a.reverb > 0 || a.filter !== 0 ||
      a.dist > 0 || a.crush > 0 || a.echo > 0 || a.trem > 0 || a.delaySec > 0;
    const look = on('look') ? live.look : null;
    const picDelay = (on('latency') && lat > 0) ? lat : 0;
    if (!hasAudio && speed === 1 && !look && !picDelay) return null;
    return { speed, audio: hasAudio ? a : null, look, picDelay };
  }

  function updateCutterFxUI(){
    if (!cutterState) return;
    const track = tracks[cutterState.trackIndex];
    if (!track) return;
    const live = cutterFxLive();
    const items = cutterFxItems(live, track.kind, cutterFormat);
    const sig = JSON.stringify(items.map(i => [i.id, i.active, i.detail])) + cutterFxOn + JSON.stringify(cutterFxPick) + cutterFormat;
    if (sig !== cutterFxSig){
      cutterFxSig = sig;
      cutterFxList.innerHTML = '';
      items.forEach(it => {
        const row = document.createElement('label');
        row.className = 'cutter-fx-item' + (it.active ? '' : ' off');
        const cb = document.createElement('input');
        cb.type = 'checkbox'; cb.dataset.fx = it.id;
        cb.checked = it.active && cutterFxPick[it.id];
        cb.disabled = !it.active;
        const nm = document.createElement('span'); nm.className = 'cutter-fx-name'; nm.textContent = it.label;
        const dt = document.createElement('span'); dt.className = 'cutter-fx-detail'; dt.textContent = it.detail;
        row.append(cb, nm, dt);
        cutterFxList.appendChild(row);
      });
    }
    cutterFxMaster.checked = cutterFxOn;
    cutterFxList.classList.toggle('show', cutterFxOn);

    // Fast copy only moves the original bytes, so it can't carry effects.
    const snapVideo = track.kind === 'video' ? cutterFxSnapshot('fast') : cutterFxSnapshot('mp3');
    const blockFast = !!snapVideo;
    cutterFormatBtnsEl.querySelectorAll('.cutter-format-btn').forEach(b => {
      if (b.dataset.format === 'fast'){
        b.disabled = blockFast;
        b.title = blockFast ? 'Fast copy keeps the original bytes, so it cannot apply effects' : '';
      }
    });
    if (blockFast && cutterFormat === 'fast'){
      const alt = [...cutterFormatBtnsEl.querySelectorAll('.cutter-format-btn')].find(b => b.dataset.format !== 'fast');
      if (alt) alt.click();
    }

    const notes = [];
    const snap = cutterFxSnapshot();
    if (cutterFxOn && !items.some(i => i.active)) notes.push('No effects are switched on in the player right now. Turn some on (equalizer, FX, speed and so on) and they will appear here.');
    if (cutterFxOn && blockFast && track.kind === 'video') notes.push('Fast copy is unavailable while effects are applied; the clip is re-encoded instead.');
    if (snap && snap.speed !== 1){
      const len = Math.max(0, cutterState.end - cutterState.start) / snap.speed;
      notes.push('Exported length: about ' + fmtTime(len) + ' at ' + (+snap.speed.toFixed(2)) + 'x.');
    }
    if (snap && snap.audio && (snap.audio.reverb > 0 || snap.audio.echo > 0) && (cutterFormat === 'wav' || cutterFormat === 'mp3'))
      notes.push('Reverb and echo tails ring out a little past the end of the clip.');
    if (cutterFxOn && track.kind === 'video' && !CUTTER_CTX_FILTER && cutterLookNames().length)
      notes.push('This phone cannot apply picture effects to exports, so the video look is skipped.');
    cutterFxNote.textContent = notes.join(' ');
    cutterFxNote.classList.toggle('show', cutterFxOn && notes.length > 0);
  }
  cutterFxMaster.addEventListener('change', () => { cutterFxOn = cutterFxMaster.checked; saveCutterFx(); cutterFxSig = ''; updateCutterFxUI(); });
  cutterFxList.addEventListener('change', (e) => {
    const id = e.target && e.target.dataset && e.target.dataset.fx;
    if (!id) return;
    cutterFxPick[id] = e.target.checked; saveCutterFx(); cutterFxSig = ''; updateCutterFxUI();
  });
  // The player's own controls can change while this window is open, so keep the list current.
  setInterval(() => { if (cutterModalOverlay.classList.contains('open') && !cutterExporting) updateCutterFxUI(); }, 500);

  // Bitcrusher for offline/real-time chains. The live context already has the worklet registered;
  // an offline context needs its own registration, and a ScriptProcessor covers browsers without worklets.
  async function cutterMakeCrush(ctx, amt){
    try {
      if (ctx.audioWorklet && typeof AudioWorkletNode !== 'undefined'){
        if (ctx === audioCtx){
          try { await bitcrusherWorkletReady; } catch(e){}
          if (bitcrusherWorkletResolved && !bitcrusherWorkletFailed){
            const n = new AudioWorkletNode(ctx, 'bitcrusher-processor', { numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [2] });
            n.parameters.get('amount').value = amt;
            return n;
          }
        } else {
          const url = URL.createObjectURL(new Blob([BITCRUSHER_WORKLET_SRC], { type: 'application/javascript' }));
          await ctx.audioWorklet.addModule(url);
          URL.revokeObjectURL(url);
          const n = new AudioWorkletNode(ctx, 'bitcrusher-processor', { numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [2] });
          n.parameters.get('amount').value = amt;
          return n;
        }
      }
    } catch(e){ /* fall through to the ScriptProcessor version */ }
    const sp = ctx.createScriptProcessor(4096, 2, 2);
    const hold = [0, 0], counter = [0, 0];
    sp.onaudioprocess = (e) => {
      const input = e.inputBuffer, output = e.outputBuffer;
      const chs = Math.min(input.numberOfChannels, output.numberOfChannels);
      const bits = 16 - amt * 13, step = Math.pow(0.5, bits), holdEvery = 1 + Math.round(amt * 38);
      for (let ch = 0; ch < chs; ch++){
        const inD = input.getChannelData(ch), outD = output.getChannelData(ch);
        let c = counter[ch], h = hold[ch];
        for (let i = 0; i < inD.length; i++){
          c++;
          if (c >= holdEvery){ c = 0; h = Math.round(inD[i] / step) * step; }
          outD[i] = h;
        }
        counter[ch] = c; hold[ch] = h;
      }
    };
    return sp;
  }

  // The live chain (EQ -> boost -> bass -> filter -> distortion -> bitcrush -> tremolo -> echo -> reverb
  // -> limiter -> latency delay), built from a fixed snapshot instead of the live knobs.
  async function cutterBuildFxChain(ctx, input, output, p){
    const nodes = [], oscs = [];
    const add = (n) => { nodes.push(n); return n; };
    const biq = (type, freq, q, gain) => { const f = add(ctx.createBiquadFilter()); f.type = type; f.frequency.value = freq; f.Q.value = q; if (gain != null) f.gain.value = gain; return f; };
    let node = input;
    if (p.eq){
      EQ_BANDS.forEach((band, i) => { const f = biq('peaking', band.freq, 1, p.eq[i] || 0); node.connect(f); node = f; });
    }
    const g = add(ctx.createGain()); g.gain.value = p.gain;
    node.connect(g); node = g;
    const out = add(ctx.createGain()); out.gain.value = 1;

    if (p.bass > 0){
      const t = easeOut(p.bass, 2);
      const sub = biq('highpass', 28, 0.5);
      const shelf = biq('lowshelf', BASS_BOOST_FREQ, 1, t * BASS_BOOST_MAX_DB);
      const peak = biq('peaking', BASS_PEAK_FREQ, 0.9, t * BASS_PEAK_MAX_DB);
      node.connect(sub); sub.connect(shelf); shelf.connect(peak);
      const exLP = biq('lowpass', BASS_PEAK_FREQ * 4.2, 0.7);
      const exShaper = add(ctx.createWaveShaper()); exShaper.oversample = '4x'; exShaper.curve = makeDistortionCurve(Math.min(1, t * 0.6));
      const exHP = biq('highpass', BASS_PEAK_FREQ * 3, 0.7);
      const exGain = add(ctx.createGain()); exGain.gain.value = t * EXCITER_MAX_GAIN;
      sub.connect(exLP); exLP.connect(exShaper); exShaper.connect(exHP); exHP.connect(exGain); exGain.connect(out);
      node = peak;
    }
    if (p.filter !== 0){
      const t = easeIn(p.filter, 1.5);
      const lp = biq('lowpass', t < 0 ? 20000 * Math.pow(FILTER_LP_MIN_FREQ / 20000, -t) : 20000, 0.7);
      const hp = biq('highpass', t > 0 ? 20 * Math.pow(FILTER_HP_MAX_FREQ / 20, t) : 20, 0.7);
      node.connect(lp); lp.connect(hp); node = hp;
    }
    if (p.dist > 0){
      const d = add(ctx.createWaveShaper()); d.curve = makeDistortionCurve(p.dist); d.oversample = '4x';
      node.connect(d); node = d;
    }
    if (p.crush > 0){
      const c = add(await cutterMakeCrush(ctx, easeIn(p.crush, 1.8)));
      node.connect(c); node = c;
    }
    if (p.trem > 0){
      const t = easeOut(p.trem, 2);
      const tg = add(ctx.createGain()); tg.gain.value = 1 - t / 2;
      const lfo = ctx.createOscillator(); lfo.type = 'sine'; lfo.frequency.value = TREMOLO_RATE_HZ;
      const depth = add(ctx.createGain()); depth.gain.value = t / 2;
      lfo.connect(depth); depth.connect(tg.gain); lfo.start(); oscs.push(lfo);
      node.connect(tg); node = tg;
    }
    if (p.echo > 0){
      const dl = add(ctx.createDelay(1.0)); dl.delayTime.value = ECHO_DELAY_SEC;
      const fb = add(ctx.createGain()); fb.gain.value = p.echo * ECHO_FEEDBACK_MAX;
      const wet = add(ctx.createGain()); wet.gain.value = p.echo * ECHO_WET_MAX;
      node.connect(dl); dl.connect(wet); wet.connect(out); dl.connect(fb); fb.connect(dl);
    }
    if (p.reverb > 0){
      const dry = add(ctx.createGain()); dry.gain.value = 1 - p.reverb * 0.7;
      const hp = biq('highpass', 120, 0.5), lp = biq('lowpass', 5200, 0.5);
      const conv = add(ctx.createConvolver()); conv.buffer = getReverbImpulse(ctx); conv.normalize = true;
      const wet = add(ctx.createGain()); wet.gain.value = p.reverb;
      node.connect(dry); dry.connect(out);
      node.connect(hp); hp.connect(lp); lp.connect(conv); conv.connect(wet); wet.connect(out);
    } else node.connect(out);

    const lim = add(ctx.createDynamicsCompressor());
    lim.threshold.value = -2; lim.knee.value = 3; lim.ratio.value = 10; lim.attack.value = 0.002; lim.release.value = 0.12;
    out.connect(lim);
    let last = lim;
    if (p.delaySec > 0){
      const d = add(ctx.createDelay(2.0)); d.delayTime.value = p.delaySec;
      lim.connect(d); last = d;
    }
    last.connect(output);
    return { nodes, oscs };
  }

  // Pitch-preserving time stretch (WSOLA), matching how the player's speed keeps pitch.
  // Yield to the event loop without setTimeout. Hidden tabs clamp timers to once a second (or worse),
  // while a MessageChannel message is delivered straight away, so long export loops keep their
  // speed when the page is in the background.
  const cutterYield = (() => {
    let ch = null;
    const q = [];
    return () => new Promise(res => {
      if (typeof MessageChannel === 'undefined'){ setTimeout(res, 0); return; }
      if (!ch){ ch = new MessageChannel(); ch.port1.onmessage = () => { const f = q.shift(); if (f) f(); }; }
      q.push(res);
      ch.port2.postMessage(0);
    });
  })();

  async function cutterTimeStretch(buf, rate, ctx, onProgress){
    const sr = buf.sampleRate, chs = buf.numberOfChannels, n = buf.length;
    let N = Math.round(sr * 0.046); N += N % 2;
    const Hs = N / 2, S = Math.round(sr * 0.012), pad = N + S * 2 + 16;
    const outLen = Math.max(1, Math.floor(n / rate));
    const inp = [], outs = [];
    const mono = new Float32Array(n + pad);
    for (let c = 0; c < chs; c++){
      const d = new Float32Array(n + pad);
      d.set(buf.getChannelData(c));
      inp.push(d);
      outs.push(new Float32Array(outLen + N));
      for (let i = 0; i < n; i++) mono[i] += d[i] / chs;
    }
    const win = new Float32Array(N);
    for (let i = 0; i < N; i++) win[i] = 0.5 - 0.5 * Math.cos(2 * Math.PI * i / N);
    const L = Hs, stride = 4, step = 2;
    const frames = Math.ceil(outLen / Hs) + 1;
    let prev = 0;
    for (let k = 0; k < frames; k++){
      const outPos = k * Hs;
      const ideal = Math.round(k * Hs * rate);
      let pos = 0;
      if (k > 0){
        const tgt = prev + Hs;
        const lo = Math.max(0, ideal - S), hi = Math.min(n, ideal + S);
        let best = -Infinity, bestPos = Math.min(Math.max(ideal, 0), n);
        for (let c0 = lo; c0 <= hi; c0 += step){
          let sum = 0, e = 1e-9;
          for (let i = 0; i < L; i += stride){ const b = mono[c0 + i]; sum += mono[tgt + i] * b; e += b * b; }
          const score = sum / Math.sqrt(e);
          if (score > best){ best = score; bestPos = c0; }
        }
        pos = bestPos;
      }
      for (let c = 0; c < chs; c++){
        const o = outs[c], ic = inp[c];
        for (let i = 0; i < N; i++){
          const idx = outPos + i;
          if (idx >= o.length) break;
          let w = win[i];
          if (k === 0 && i < Hs) w = 1;
          o[idx] += ic[pos + i] * w;
        }
      }
      prev = pos;
      if (k % 80 === 0){
        if (onProgress) onProgress(Math.min(0.9, k / frames * 0.9), 'Changing speed…');
        await cutterYield();
      }
    }
    const res = ctx.createBuffer(chs, outLen, sr);
    for (let c = 0; c < chs; c++) res.copyToChannel(outs[c].subarray(0, outLen), c, 0);
    return res;
  }

  // Decode, cut to the selection and (optionally) run speed + effects. Returns an AudioBuffer.
  async function cutterRenderAudio(track, start, end, fx, onProgress){
    if (onProgress) onProgress(0, 'Decoding audio…');
    const resp = await fetch(track.url);
    const arrayBuf = await resp.arrayBuffer();
    const ctx = ensureAudioCtx();
    const decoded = await ctx.decodeAudioData(arrayBuf.slice(0));
    const sampleRate = decoded.sampleRate;
    const startSample = Math.max(0, Math.floor(start * sampleRate));
    const endSample = Math.min(decoded.length, Math.floor(end * sampleRate));
    const frameCount = Math.max(1, endSample - startSample);
    const numChannels = decoded.numberOfChannels;
    let buf = ctx.createBuffer(numChannels, frameCount, sampleRate);
    for (let ch = 0; ch < numChannels; ch++){
      buf.copyToChannel(decoded.getChannelData(ch).subarray(startSample, endSample), ch, 0);
    }
    if (!fx) return buf;
    if (fx.speed !== 1) buf = await cutterTimeStretch(buf, fx.speed, ctx, onProgress);
    const p = fx.audio;
    if (p){
      if (onProgress) onProgress(0.92, 'Applying effects…');
      let tail = 0;
      if (p.reverb > 0) tail = Math.max(tail, REVERB_DURATION + 0.05);
      if (p.echo > 0){
        const fb = p.echo * ECHO_FEEDBACK_MAX;
        tail = Math.max(tail, Math.min(10, Math.ceil(Math.log(0.001) / Math.log(fb))) * ECHO_DELAY_SEC);
      }
      const extra = Math.ceil((Math.min(3.5, tail) + p.delaySec) * buf.sampleRate);
      const octx = new OfflineAudioContext(2, buf.length + extra, buf.sampleRate);
      const srcNode = octx.createBufferSource();
      srcNode.buffer = buf;
      await cutterBuildFxChain(octx, srcNode, octx.destination, p);
      srcNode.start();
      buf = await octx.startRendering();
    }
    return buf;
  }

  async function exportAudioClip(track, start, end, fx, onProgress){
    const buf = await cutterRenderAudio(track, start, end, fx, onProgress);
    return audioBufferToWav(buf);
  }

