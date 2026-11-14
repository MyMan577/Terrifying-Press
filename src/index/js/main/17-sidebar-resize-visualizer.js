  // ---------- Sidebar resize / expand-to-fullscreen ----------
  (function initSidebarResize(){
    const appEl = document.getElementById('app');
    const sidebarEl = document.getElementById('sidebar');
    const handle = document.getElementById('sidebar-resize-handle');
    const SIDEBAR_WIDTH_KEY = 'playerSidebarWidth';
    const SIDEBAR_HEIGHT_KEY = 'playerSidebarHeight';
    const MIN_WIDTH = 240;
    const MIN_HEIGHT = 180;

    function isNarrow(){ return window.matchMedia('(max-width: 720px)').matches; }

    function applyWidth(px){
      appEl.style.gridTemplateColumns = px + 'px 1fr';
      resizeCanvas();
    }
    function applyHeight(px){
      sidebarEl.style.height = px + 'px';
      sidebarEl.style.maxHeight = px + 'px';
    }

    function loadWidth(){
      try {
        const v = parseInt(localStorage.getItem(SIDEBAR_WIDTH_KEY), 10);
        if (v && v >= MIN_WIDTH) applyWidth(Math.min(v, window.innerWidth - 80));
      } catch(e){}
    }
    function loadHeight(){
      try {
        const v = parseInt(localStorage.getItem(SIDEBAR_HEIGHT_KEY), 10);
        // A size dragged in an older version could leave the track list a sliver; keep it between a quarter and
        // three quarters of the screen.
        if (v && v >= MIN_HEIGHT) applyHeight(Math.max(Math.round(window.innerHeight * 0.25), Math.min(v, Math.round(window.innerHeight * 0.75))));
      } catch(e){}
    }

    // A width picked while wide (inline grid-template-columns) or a height
    // picked while narrow (inline sidebar max-height) is only meaningful in
    // the layout it was set for - left in place across a rotation, it fights
    // the other layout's own CSS (e.g. portrait's single-column grid rule
    // can't win against a leftover desktop column width, since inline style
    // always beats a stylesheet rule of equal or lesser specificity). Clear
    // whichever one doesn't apply to the current layout and reapply the
    // other from its saved value every time the breakpoint is crossed.
    let wasNarrow = isNarrow();
    function reconcileLayout(){
      const narrow = isNarrow();
      if (narrow === wasNarrow) return;
      wasNarrow = narrow;
      if (narrow){
        appEl.style.gridTemplateColumns = '';
        loadHeight();
      } else {
        sidebarEl.style.height = '';
        sidebarEl.style.maxHeight = '';
        loadWidth();
      }
    }
    window.addEventListener('resize', reconcileLayout);
    window.addEventListener('orientationchange', () => setTimeout(reconcileLayout, 60));

    if (isNarrow()) loadHeight(); else loadWidth();

    // --- Drag to resize (desktop side handle / portrait bottom handle) ---
    let dragging = false;
    handle.addEventListener('pointerdown', (e) => {
      dragging = true;
      handle.classList.add('active');
      handle.setPointerCapture(e.pointerId);
      e.preventDefault();
    });
    handle.addEventListener('pointermove', (e) => {
      if (!dragging) return;
      if (isNarrow()){
        const rect = sidebarEl.getBoundingClientRect();
        const max = Math.round(window.innerHeight * 0.75);
        const h = Math.max(Math.max(MIN_HEIGHT, Math.round(window.innerHeight * 0.25)), Math.min(e.clientY - rect.top, max));
        applyHeight(h);
      } else {
        const max = window.innerWidth - 80;
        const w = Math.max(MIN_WIDTH, Math.min(e.clientX, max));
        applyWidth(w);
      }
    });
    function endDrag(e){
      if (!dragging) return;
      dragging = false;
      handle.classList.remove('active');
      try {
        if (isNarrow()){
          const h = sidebarEl.getBoundingClientRect().height;
          localStorage.setItem(SIDEBAR_HEIGHT_KEY, String(Math.round(h)));
        } else {
          const w = sidebarEl.getBoundingClientRect().width;
          localStorage.setItem(SIDEBAR_WIDTH_KEY, String(Math.round(w)));
        }
      } catch(err){}
    }
    handle.addEventListener('pointerup', endDrag);
    handle.addEventListener('pointercancel', endDrag);

  })();

  let vizSensitivity = 1;       // effective multiplier currently in use (0.25 - 2.5)
  let globalVizSensitivity = 1; // universal ("all songs") sensitivity, kept aside while an override is active
  let trackVizSensOverrideActive = false;
  const TRACK_VIZ_SENS_KEY = 'playerTrackVizSensitivity';

  function loadTrackVizSensitivities(){
    try { return JSON.parse(localStorage.getItem(TRACK_VIZ_SENS_KEY)) || {}; }
    catch(e){ return {}; }
  }
  function saveTrackVizSensOverride(dbId, value){
    const all = loadTrackVizSensitivities();
    if (value == null) delete all[dbId];
    else all[dbId] = value;
    try { localStorage.setItem(TRACK_VIZ_SENS_KEY, JSON.stringify(all)); } catch(e){}
  }
  function getSavedTrackVizSens(dbId){
    const v = loadTrackVizSensitivities()[dbId];
    return typeof v === 'number' ? v : null; // null = no override for this track
  }

  // ---------- Visualizer ----------
  // 64 bars, mirrored left/right: bass at the top of the ring, treble at the bottom, so a kick is one clear
  // bulge instead of two or three random bars. Bands are spaced by pitch (log), 40 Hz - 14 kHz. The old layout
  // split the spectrum almost evenly by frequency, which gave everything below ~1.2 kHz (kick, bass, most of a
  // voice) a single bar and spent the other 47 on treble hiss.
  const VIZ_BANDS = 32;
  const vizLevel = new Float32Array(VIZ_BANDS);   // what is drawn, 0..1
  const vizAvg = new Float32Array(VIZ_BANDS);     // slow average per band: hits are measured against it
  const vizGroup = new Float32Array(VIZ_BANDS);   // level of a bar together with its neighbours (for the glow)
  const VIZ_BASS = 9;                             // the lowest bands (to about 200 Hz) get extra weight
  let vizBandPos = null, vizBandPosFor = '';      // [first bin, last bin] (fractional) per band
  let vizBassAvg = 0, vizPulse = 0, vizBeatAt = 0, vizWave = 0, vizScaleSet = '';
  const vizWaves = [];                            // 'pulse' style: several rings can be travelling at once
  const vizBandV = new Float32Array(VIZ_BANDS);  // each band's raw level this frame (for the beat tracker)
  // style: bars | blocks | pulse | wave | scope | disc3d (see 17b).  haptics: 0 off, 1 light, 2 strong
  const VIZ_STYLES = ['bars', 'blocks', 'pulse', 'wave', 'scope', 'disc3d'];
  let vizStyle = 'bars', hapticBass = 0;
  try { const v = localStorage.getItem('ppVizStyle'); if (VIZ_STYLES.includes(v)) vizStyle = v; } catch(e){}
  try { hapticBass = Math.max(0, Math.min(2, parseInt(localStorage.getItem('ppHapticBass'), 10) || 0)); } catch(e){}
  (function(){
    const styleSeg = document.getElementById('viz-style-seg'), hapSeg = document.getElementById('viz-haptic-seg');
    const paint = () => {
      styleSeg.querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.v === vizStyle));
      hapSeg.querySelectorAll('button').forEach(b => b.classList.toggle('on', +b.dataset.v === hapticBass));
    };
    styleSeg.addEventListener('click', (e) => {
      const b = e.target.closest('button'); if (!b) return;
      vizStyle = VIZ_STYLES.includes(b.dataset.v) ? b.dataset.v : 'bars';
      if (vizStyle === 'disc3d' && !v3Init()) vizStyle = 'bars';     // no WebGL: stay on the plain bars
      try { localStorage.setItem('ppVizStyle', vizStyle); } catch(x){}
      vizIdle = false;                                                // draw the new style even while paused
      paint();
    });
    hapSeg.addEventListener('click', (e) => {
      const b = e.target.closest('button'); if (!b) return;
      hapticBass = +b.dataset.v; try { localStorage.setItem('ppHapticBass', String(hapticBass)); } catch(x){}
      paint();
      if (hapticBass && navigator.vibrate){ try { navigator.vibrate(hapticBass === 2 ? 30 : 14); } catch(x){} }   // feel what was picked
    });
    paint();
    // Timing: only the native player can be shifted (the page's own analyser is already exactly on the sound).
    const trimRow = document.getElementById('viz-trim-row'), trim = document.getElementById('viz-trim'), trimVal = document.getElementById('viz-trim-value');
    if (trimRow && PPNative.enabled && PPNative.vizTrim){
      const show = (v) => { trimVal.textContent = v === 0 ? 'Automatic' : (v > 0 ? v + ' ms later' : -v + ' ms earlier'); };
      trimRow.style.display = '';
      trim.value = PPNative.vizTrim(); show(PPNative.vizTrim());
      trim.addEventListener('input', () => { const v = parseInt(trim.value, 10) || 0; show(v); PPNative.setVizTrim(v); });
    }
  })();
  let vizRgb = [110, 231, 208], vizRgbAt = 0;

  function vizBandBins(nBins, sampleRate){
    const binHz = sampleRate / (nBins * 2), lo = 40, hi = Math.min(14000, sampleRate * 0.45), out = [];
    for (let k = 0; k <= VIZ_BANDS; k++) out.push(lo * Math.pow(hi / lo, k / VIZ_BANDS) / binHz);
    return out;
  }
  // Loudest point of the spectrum between two (fractional) bins. Low bands are narrower than one bin, so the
  // value is interpolated there; averaging wide bands would water a single loud note down.
  function vizBandPeak(raw, a, b){
    const at = (x) => { const i = Math.max(0, Math.min(raw.length - 2, Math.floor(x))), f = Math.max(0, Math.min(1, x - i)); return raw[i] * (1 - f) + raw[i + 1] * f; };
    let m = Math.max(at(a), at(b), at((a + b) / 2));
    for (let i = Math.ceil(a); i <= Math.floor(b) && i < raw.length; i++) if (raw[i] > m) m = raw[i];
    return m / 255;
  }
  function vizAccent(now){
    if (now - vizRgbAt < 1000) return vizRgb;
    vizRgbAt = now;
    try {
      const m = /^#?([0-9a-f]{6})$/i.exec(getComputedStyle(document.documentElement).getPropertyValue('--accent').trim());
      if (m){ const n = parseInt(m[1], 16); vizRgb = [n >> 16, (n >> 8) & 255, n & 255]; }
    } catch(e){}
    return vizRgb;
  }
  function vizSetDiscScale(s){
    const v = s > 1.0005 ? s.toFixed(4) : '';
    if (v === vizScaleSet) return;
    vizScaleSet = v;
    try { artRing.style.scale = v; } catch(e){}
  }

  // Not drawn while the canvas is off screen (sidebar full screen, app in the background): offsetParent is
  // null whenever an ancestor is display:none.
  // The player-style layout keeps the closed player page drawn but invisible (visibility:hidden), so offsetParent
  // alone said "visible" and the ring was drawn every frame behind Home and the Library, slowing their animations.
  function vizIsVisible(){
    const b = document.body;
    if (b.classList.contains('player-layout') && !b.hasAttribute('data-pl-player')) return false;
    return !document.hidden && vizWrap.offsetParent !== null && vizWrap.style.display !== 'none';
  }
  let vizLast = 0, vizIdle = false, vizEverLive = false;
  function drawViz(ts){
    const vizLive = audioCtx && isPlaying && currentIndex !== -1;
    // Not visible, or paused with the bars already settled: check back in 250 ms instead of every frame.
    const vizShown = vizIsVisible();
    // Haptics follow the kick anywhere in the app, so the analysis keeps running (without drawing) while the
    // ring is off screen, as long as the app itself is on screen.
    const hapticOnly = !vizShown && hapticBass > 0 && vizLive && !document.hidden;
    if ((!vizShown && !hapticOnly) || (vizIdle && !vizLive)){ vizLast = 0; setTimeout(() => requestAnimationFrame(drawViz), document.hidden ? 250 : 100); return; }
    requestAnimationFrame(drawViz);
    if (ts - vizLast < (hapticOnly ? 30 : 15)) return;   // 60 fps: smooth falls and peaks without paying for 120
    const dt = vizLast ? Math.min(0.1, (ts - vizLast) / 1000) : 0.016;
    vizLast = ts;

    const w = canvas.width, h = canvas.height, S = Math.min(w, h);
    ctx.clearRect(0, 0, w, h);
    const cx = w / 2, cy = h / 2;

    let raw = null;
    if (vizLive){
      const g = currentGraph();
      g.analyser.getByteFrequencyData(g.dataArray);
      raw = g.dataArray;
      // The native player's spectrum is at the song's own sample rate, not the page's: with the wrong one every
      // bar sat about 8% off its pitch on 44.1 kHz songs, and songs at different rates looked different.
      const vizSr = (PPNative.vizRate && PPNative.vizRate()) || audioCtx.sampleRate;
      const key = raw.length + '|' + vizSr;
      if (key !== vizBandPosFor){ vizBandPos = vizBandBins(raw.length, vizSr); vizBandPosFor = key; }
      vizEverLive = true;
    } else if (!vizEverLive){
      return; // never had data to show yet, nothing to draw or decay
    }

    // --- levels ---
    const kAvg = 1 - Math.exp(-dt / 0.9), kRise = 1 - Math.exp(-dt / 0.028), kFall = 1 - Math.exp(-dt / 0.19);
    let bass = 0;
    for (let k = 0; k < VIZ_BANDS; k++){
      let target = 0;
      if (raw){
        // v is on the analyser's dB scale (0 = -100 dB, 1 = -30 dB), tilted up towards the treble, which is
        // naturally much quieter than the bass.
        const v = Math.min(1, vizBandPeak(raw, vizBandPos[k], vizBandPos[k + 1]) * (1 + 0.42 * k / (VIZ_BANDS - 1)));
        vizBandV[k] = v;
        if (k < 7) bass += v / 7;
        // Two parts: how loud the band is (curved, so "fairly loud" is not already a full bar), plus how far it
        // just jumped above its own recent average. The jump is what makes hits, notes and syllables visible.
        // The average only feeds the jump term, so a steady loud band cannot creep up to full on its own.
        const hit = Math.max(0, v - vizAvg[k]);
        vizAvg[k] += (v - vizAvg[k]) * kAvg;
        const bassW = k < VIZ_BASS ? 1.3 - 0.3 * k / VIZ_BASS : 1;      // the bass is the star: taller and punchier
        target = Math.min(1, (Math.pow(v, 2.6) * 0.62 + hit * 2.6 * bassW) * bassW * vizSensitivity);
      } else {
        vizAvg[k] *= 1 - kAvg;
      }
      vizLevel[k] += (target - vizLevel[k]) * (target > vizLevel[k] ? kRise : kFall);
    }

    // --- stems (if this song was split) and the beat (tracked and predicted, see 17b) ---
    const stems = vizStemsNow(dt);
    const beat = vizBeatStep(ts, raw ? vizBandV : null, stems);
    if (beat > 0){
      vizBeatAt = ts;
      vizPulse = Math.min(1, 0.5 + beat * 0.5);
      vizWave = 0.0001;
      vizWaves.push(0.0001); if (vizWaves.length > 4) vizWaves.shift();
      vizDraw3DBeat();
      if (hapticBass && navigator.vibrate && !document.hidden){
        try { navigator.vibrate(Math.round((hapticBass === 2 ? 34 : 16) * (0.6 + 0.4 * vizPulse))); } catch(e){}
      }
    }
    if (raw) vizBassAvg += (bass - vizBassAvg) * (1 - Math.exp(-dt / 0.35));
    vizPulse *= Math.exp(-dt / 0.14);
    if (vizWave > 0){ vizWave += dt / 0.45; if (vizWave >= 1) vizWave = 0; }
    for (let i = vizWaves.length - 1; i >= 0; i--){ vizWaves[i] += dt / 0.7; if (vizWaves[i] >= 1) vizWaves.splice(i, 1); }
    const pulse = Math.min(1, vizPulse * vizSensitivity);
    vizSetDiscScale(1 + pulse * 0.05);   // the disc thumps with the kick

    let maxLv = 0;
    for (let k = 0; k < VIZ_BANDS; k++) if (vizLevel[k] > maxLv) maxLv = vizLevel[k];
    vizIdle = !raw && maxLv < 0.004 && vizPulse < 0.01;
    if (!vizShown){ v3Tilt(false); return; }
    const wantsWave = vizStyle === 'wave' || vizStyle === 'scope';
    if (wantsWave) vizReadWave(raw ? currentGraph() : null, !!raw, dt);
    if (vizStyle === 'disc3d' && v3.failed) vizStyle = 'bars';
    vizSetMode(vizStyle);
    if (vizStyle !== 'disc3d') v3Tilt(false);

    // --- draw ---
    // The canvas is 20% larger than the ring box (see #viz), so the disc radius (0.36 of the box) is 0.30 here.
    const baseR = S * 0.307 * (1 + pulse * 0.05) + S * 0.006;
    const maxLen = S * 0.5 - baseR - S * 0.02;
    const [cr, cg, cb] = vizAccent(ts);
    const barW = Math.max(2, (Math.PI * 2 * baseR / (VIZ_BANDS * 2)) * 0.42);
    ctx.lineCap = 'butt';   // square ends
    const pal = vizPalette([cr, cg, cb]);
    if (vizStyle === 'disc3d' && vizDraw3D(ts, dt, pal, pulse, stems, !!raw)) return;
    if (vizStyle === 'wave' || vizStyle === 'scope'){
      let avg = 0; for (let k = 0; k < VIZ_BANDS; k++) avg += vizLevel[k] / VIZ_BANDS;
      if (vizStyle === 'wave'){ vizDrawWaveRing(ctx, cx, cy, baseR, maxLen, S, pal, pulse, stems, avg); return; }
      vizDrawScope(ts, pal, pulse, stems);
      // the ring around the disc keeps the beat rings and the stem glow, so it is not empty under the line
      vizDrawStemRing(ctx, cx, cy, baseR, maxLen, S, stems, pal);
      for (const wv of vizWaves){
        ctx.strokeStyle = vizRgba(pal.acc, 0.45 * (1 - wv) * (1 - wv)); ctx.lineWidth = S * 0.01 * (1 - wv) + 1;
        ctx.beginPath(); ctx.arc(cx, cy, baseR + maxLen * wv, 0, Math.PI * 2); ctx.stroke();
      }
      return;
    }

    if (vizStyle === 'pulse'){
      // Bass only: a band of light around the disc as thick as the bass is loud, rings thrown off by each kick,
      // and one thin line further out that follows everything above the bass.
      let bassLv = 0, restLv = 0;
      for (let k = 0; k < VIZ_BANDS; k++){ if (k < VIZ_BASS) bassLv += vizLevel[k] / VIZ_BASS; else restLv += vizLevel[k] / (VIZ_BANDS - VIZ_BASS); }
      if (stems && stems.has.bass) bassLv = Math.max(bassLv * 0.5, stems.bass);      // the bass stem itself, when there is one
      if (stems && stems.has.vocals) vizDrawStemRing(ctx, cx, cy, baseR, maxLen, S, { has: { vocals: true }, vocals: stems.vocals }, pal);
      for (const wv of vizWaves){
        ctx.strokeStyle = `rgba(${cr},${cg},${cb},${(0.5 * (1 - wv) * (1 - wv)).toFixed(3)})`;
        ctx.lineWidth = S * 0.012 * (1 - wv) + 1;
        ctx.beginPath(); ctx.arc(cx, cy, baseR + maxLen * wv, 0, Math.PI * 2); ctx.stroke();
      }
      const thick = S * 0.004 + Math.pow(bassLv, 1.6) * maxLen * 0.6;
      const grad = ctx.createRadialGradient(cx, cy, baseR, cx, cy, baseR + thick * 1.6);
      grad.addColorStop(0, `rgba(${cr},${cg},${cb},${(0.3 + bassLv * 0.5).toFixed(3)})`);
      grad.addColorStop(1, `rgba(${cr},${cg},${cb},0)`);
      ctx.fillStyle = grad;
      ctx.beginPath(); ctx.arc(cx, cy, baseR + thick * 1.6, 0, Math.PI * 2); ctx.arc(cx, cy, baseR, 0, Math.PI * 2, true); ctx.fill();
      const w2 = Math.round(cr + (255 - cr) * bassLv * 0.6), g3 = Math.round(cg + (255 - cg) * bassLv * 0.6), b3 = Math.round(cb + (255 - cb) * bassLv * 0.6);
      ctx.strokeStyle = `rgba(${w2},${g3},${b3},${(0.45 + bassLv * 0.55).toFixed(3)})`;
      ctx.lineWidth = thick;
      ctx.beginPath(); ctx.arc(cx, cy, baseR + thick / 2, 0, Math.PI * 2); ctx.stroke();
      ctx.strokeStyle = `rgba(255,255,255,${(0.12 + restLv * 0.6).toFixed(3)})`;
      ctx.lineWidth = Math.max(1, S * 0.003);
      ctx.beginPath(); ctx.arc(cx, cy, baseR + thick + S * 0.012 + restLv * maxLen * 0.35, 0, Math.PI * 2); ctx.stroke();
      return;
    }
    // 'blocks': the same bars cut into stacked segments, lit a whole segment at a time
    const blocks = vizStyle === 'blocks', VIZ_SEGS = 10, segStep = maxLen / VIZ_SEGS;

    vizDrawStemRing(ctx, cx, cy, baseR, maxLen, S, stems, pal);
    if (vizWave > 0){   // ring thrown off by a kick
      ctx.strokeStyle = `rgba(${cr},${cg},${cb},${(0.34 * (1 - vizWave)).toFixed(3)})`;
      ctx.lineWidth = S * 0.006 * (1 - vizWave) + 1;
      ctx.beginPath(); ctx.arc(cx, cy, baseR + maxLen * (0.15 + 0.85 * vizWave), 0, Math.PI * 2); ctx.stroke();
    }
    // Soft glow behind a GROUP of bars that are up together (not an outline around single bars): one faint
    // wedge of light per band, fading outwards, whose strength follows the band and its neighbours. Neighbouring
    // wedges overlap into one patch of light. The bass glows sooner and brighter, and flares on a kick.
    for (let k = 0; k < VIZ_BANDS; k++){
      const l0 = vizLevel[Math.max(0, k - 2)], l1 = vizLevel[Math.max(0, k - 1)], l3 = vizLevel[Math.min(VIZ_BANDS - 1, k + 1)], l4 = vizLevel[Math.min(VIZ_BANDS - 1, k + 2)];
      vizGroup[k] = Math.min(vizLevel[k], (l0 + l1 * 2 + vizLevel[k] * 3 + l3 * 2 + l4) / 9 * 1.25);   // a lone tall bar does not count
    }
    const step = Math.PI / VIZ_BANDS;
    for (let k = 0; k < VIZ_BANDS; k++){
      const isBass = k < VIZ_BASS, thr = isBass ? 0.34 : 0.5;
      let gl = (vizGroup[k] - thr) / (1 - thr);
      if (isBass) gl = Math.max(gl, 0) + pulse * 0.45 * (1 - k / VIZ_BASS);
      if (gl <= 0.02) continue;
      gl = Math.min(1, gl);
      const outer = Math.min(S * 0.5, baseR + (S * 0.006 + vizLevel[k] * maxLen) * 1.2 + S * 0.02);
      const grad = ctx.createRadialGradient(cx, cy, baseR, cx, cy, outer);
      const al = gl * (isBass ? 0.34 : 0.22);
      grad.addColorStop(0, `rgba(${cr},${cg},${cb},${al.toFixed(3)})`);
      grad.addColorStop(0.55, `rgba(${cr},${cg},${cb},${(al * 0.45).toFixed(3)})`);
      grad.addColorStop(1, `rgba(${cr},${cg},${cb},0)`);
      ctx.fillStyle = grad;
      for (let side = -1; side <= 1; side += 2){
        const mid = -Math.PI / 2 + side * (k + 0.5) * step, a0 = mid - step * 0.95, a1 = mid + step * 0.95;   // wider than one band: wedges blend
        ctx.beginPath(); ctx.arc(cx, cy, baseR, a0, a1); ctx.arc(cx, cy, outer, a1, a0, true); ctx.closePath(); ctx.fill();
      }
    }
    ctx.setLineDash(blocks ? [segStep * 0.68, segStep * 0.32] : []);
    for (let k = 0; k < VIZ_BANDS; k++){            // plain sharp bars, bass ones a little thicker
      const lv = vizLevel[k];
      const len = blocks ? Math.max(1, Math.round(lv * VIZ_SEGS)) * segStep - segStep * 0.32 : S * 0.006 + lv * maxLen;
      const white = lv * lv * 0.55;
      const r = Math.round(cr + (255 - cr) * white), g2 = Math.round(cg + (255 - cg) * white), b = Math.round(cb + (255 - cb) * white);
      ctx.strokeStyle = `rgba(${r},${g2},${b},${(0.35 + lv * 0.65).toFixed(3)})`;
      ctx.lineWidth = k < VIZ_BASS ? barW * (1.35 - 0.35 * k / VIZ_BASS) : barW;
      const off = (k + 0.5) / VIZ_BANDS * Math.PI;
      ctx.beginPath();
      for (let side = -1; side <= 1; side += 2){
        const a = -Math.PI / 2 + side * off, ca = Math.cos(a), sa = Math.sin(a);
        ctx.moveTo(cx + ca * baseR, cy + sa * baseR);
        ctx.lineTo(cx + ca * (baseR + len), cy + sa * (baseR + len));
      }
      ctx.stroke();
    }
    ctx.setLineDash([]);
    // base ring, brighter on a kick
    ctx.strokeStyle = `rgba(${cr},${cg},${cb},${(0.1 + pulse * 0.5).toFixed(3)})`;
    ctx.lineWidth = 1 + pulse * S * 0.004;
    ctx.beginPath(); ctx.arc(cx, cy, baseR - S * 0.004, 0, Math.PI * 2); ctx.stroke();
  }
  requestAnimationFrame(drawViz);

