  // ================= Visualizer: beat tracking, stem visuals, wave modes and the 3D disc =================
  // drawViz (above) computes the band levels and calls in here. Everything below is only used by it.

  // ---------- small colour helpers ----------
  function vizHueShift(rgb, deg, light){
    let [r, g, b] = rgb.map(x => x / 255);
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2, d = mx - mn;
    let h = 0, s = 0;
    if (d > 1e-6){
      s = d / (1 - Math.abs(2 * l - 1));
      h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
      h *= 60;
    }
    h = (h + deg + 720) % 360;
    const L = Math.max(0, Math.min(1, l + (light || 0))), S2 = Math.max(s, 0.55);
    const c = (1 - Math.abs(2 * L - 1)) * S2, x = c * (1 - Math.abs((h / 60) % 2 - 1)), m = L - c / 2;
    const [a1, b1, c1] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
    return [Math.round((a1 + m) * 255), Math.round((b1 + m) * 255), Math.round((c1 + m) * 255)];
  }
  let vizPalKey = '', vizPal = null;
  // drums / beat = the accent, bass a little deeper, vocals on the other side of the colour wheel
  function vizPalette(rgb){
    const k = rgb.join(',');
    if (k !== vizPalKey){ vizPalKey = k; vizPal = { acc: rgb, bass: vizHueShift(rgb, -38, -0.04), voc: vizHueShift(rgb, 150, 0.08), other: vizHueShift(rgb, 60, 0.12) }; }
    return vizPal;
  }
  const vizRgba = (c, a) => `rgba(${c[0]},${c[1]},${c[2]},${Math.max(0, Math.min(1, a)).toFixed(3)})`;

  // ---------- beat tracking ----------
  // The old beat was "the bass jumped above its average", which fired twice on some kicks and missed others.
  // Now: an onset curve (how much the spectrum just rose, weighted to the low end, or the drums stem when the
  // song has one), an adaptive threshold, and the tempo found from that curve's autocorrelation over the last
  // 6 s. Once the onsets keep landing on the tempo grid the beats are *predicted*, so the ring and haptics land
  // exactly on the beat and stay steady through fills; any onset nudges the grid back into place.
  const VB_FPS = 60, VB_N = 360, VB_MS = 1000 / VB_FPS;
  const vb = {
    env: new Float32Array(VB_N), lastBin: -1, prevV: new Float32Array(VIZ_BANDS), prevKick: 0, prevDrums: 0,
    period: 0, cand: 0, candN: 0, conf: 0, lastTempoBin: 0,
    next: 0, lock: 0, matchedAt: 0, onsetAt: 0, firedAt: 0, peak: 0.05, strength: 0.7, quietSince: 0, trackIdx: -2
  };
  function vbReset(){
    vb.env.fill(0); vb.lastBin = -1; vb.prevV.fill(0); vb.period = 0; vb.cand = 0; vb.candN = 0; vb.conf = 0;
    vb.next = 0; vb.lock = 0; vb.matchedAt = 0; vb.onsetAt = 0; vb.firedAt = 0; vb.peak = 0.05;
  }
  function vbBpm(){ return vb.period > 0 ? 60 * VB_FPS / vb.period : 0; }
  function vbLocked(ts){ return vb.period > 0 && vb.lock >= 0.5 && ts - vb.matchedAt < 3.2 * vb.period * VB_MS; }
  function vbTempo(bin){
    // autocorrelation of the (mean-removed, clipped) onset curve, lags for 70..180 BPM, a soft preference near 120
    const N = VB_N, e = new Float32Array(N);
    let mean = 0; for (let i = 0; i < N; i++){ e[i] = vb.env[(bin - N + 1 + i + N * 4) % N]; mean += e[i]; }
    mean /= N; for (let i = 0; i < N; i++) e[i] = Math.max(0, e[i] - mean);
    const lo = Math.floor(60 * VB_FPS / 180), hi = Math.ceil(60 * VB_FPS / 70), ac = new Float32Array(hi + 2);
    const acAt = (L) => { let s = 0; for (let i = L; i < N; i++) s += e[i] * e[i - L]; return s / (N - L); };
    for (let L = lo - 1; L <= hi + 1; L++) ac[L] = acAt(L);
    let best = -1, bestL = 0, sum = 0, cnt = 0;
    for (let L = lo; L <= hi; L++){
      const bpm = 60 * VB_FPS / L, prior = Math.exp(-0.5 * Math.pow(Math.log2(bpm / 120) / 0.85, 2));
      const L2 = L * 2, dbl = L2 < N / 2 ? acAt(L2) : 0;           // a real beat also lines up two beats later
      const sc = (ac[L] + 0.5 * dbl) * prior;
      sum += sc; cnt++;
      if (sc > best){ best = sc; bestL = L; }
    }
    if (best <= 0 || !bestL) return;
    const a = ac[bestL - 1], b = ac[bestL], c = ac[bestL + 1], den = a - 2 * b + c;   // fractional lag
    const L = bestL + (den < 0 ? Math.max(-0.5, Math.min(0.5, 0.5 * (a - c) / den)) : 0);
    vb.conf = Math.max(0, Math.min(1, (best / (sum / cnt) - 1) / 1.5));
    if (vb.conf < 0.12) return;
    if (!vb.period){ vb.period = L; return; }
    if (Math.abs(L - vb.period) / vb.period < 0.06){ vb.period += (L - vb.period) * 0.25; vb.candN = 0; return; }
    // a different tempo has to show up twice in a row before the grid jumps to it
    if (vb.cand && Math.abs(L - vb.cand) / vb.cand < 0.06){ if (++vb.candN >= 2){ vb.period = L; vb.lock = 0; vb.candN = 0; } }
    else { vb.cand = L; vb.candN = 1; }
  }
  // Returns the strength (0..1) of a beat that lands on this frame, or 0.
  function vizBeatStep(ts, v, st){
    if (currentIndex !== vb.trackIdx){ vb.trackIdx = currentIndex; vbReset(); }
    if (!v){ if (!vb.quietSince) vb.quietSince = ts; else if (ts - vb.quietSince > 1500){ vbReset(); vb.quietSince = ts; } return 0; }
    vb.quietSince = 0;
    // --- onset strength ---
    let o = 0, lowO = 0;
    for (let k = 0; k < VIZ_BANDS; k++){
      const d = v[k] - vb.prevV[k]; vb.prevV[k] = v[k];
      if (d > 0){ const w = k < VIZ_BASS ? 1.6 : k < 20 ? 0.75 : 0.45; o += d * w; if (k < VIZ_BASS) lowO += d * w; }
    }
    o /= 10; lowO /= 10;
    if (st && st.has.drums){
      const dk = Math.max(0, st.kickRaw - vb.prevKick), dd = Math.max(0, st.drumsRaw - vb.prevDrums);
      vb.prevKick = st.kickRaw; vb.prevDrums = st.drumsRaw;
      const so = dk * 1.4 + dd * 0.6;
      o = o * 0.3 + so; lowO = lowO * 0.3 + dk * 1.4;
    }
    // --- onto the fixed 60 Hz grid ---
    const bin = Math.floor(ts / VB_MS);
    if (vb.lastBin < 0 || bin - vb.lastBin > VB_N){ vb.env.fill(0); vb.lastBin = bin - 1; }
    for (let b = vb.lastBin + 1; b <= bin; b++) vb.env[b % VB_N] = 0;
    const slot = bin % VB_N; if (o > vb.env[slot]) vb.env[slot] = o;
    vb.lastBin = Math.max(vb.lastBin, bin);
    if (bin - vb.lastTempoBin >= 30){ vb.lastTempoBin = bin; vbTempo(bin); }
    // --- onset? (above mean + 1.5 sd of the last second, refractory 110 ms) ---
    let m = 0, m2 = 0;
    for (let i = 1; i <= 60; i++){ const x = vb.env[(bin - i + VB_N * 4) % VB_N]; m += x; m2 += x * x; }
    m /= 60; const sd = Math.sqrt(Math.max(0, m2 / 60 - m * m));
    let onset = 0;
    if (o > m + 1.5 * sd && o > 0.012 && ts - vb.onsetAt > 110){
      vb.onsetAt = ts; onset = o;
      vb.peak += (o - vb.peak) * (o > vb.peak ? 0.3 : 0.08);
    }
    vb.peak *= 0.9995;
    const pMs = vb.period * VB_MS;
    let fire = 0;
    if (onset){
      const sNorm = Math.max(0.25, Math.min(1, onset / Math.max(0.02, vb.peak * 1.1)));
      if (pMs > 0){
        if (!vb.next) vb.next = ts + pMs;
        // distance to the nearest point of the grid
        const k = Math.round((ts - vb.next) / pMs), err = ts - (vb.next + k * pMs);
        if (Math.abs(err) < 0.2 * pMs && lowO > 0.25 * o){
          vb.next += err * 0.45; vb.matchedAt = ts; vb.lock = Math.min(1, vb.lock + 0.25);
          vb.strength += (sNorm - vb.strength) * 0.4;
          // the predicted beat already fired a moment ago: this onset was it, do not pulse twice
        } else if (Math.abs(err) >= 0.2 * pMs){ vb.lock = Math.max(0, vb.lock - 0.12); }
      }
      // not locked yet: follow the kicks themselves
      if (!vbLocked(ts) && lowO > 0.35 * o && ts - vb.firedAt > Math.max(170, 0.45 * pMs)){ vb.firedAt = ts; fire = sNorm; }
    }
    if (pMs > 0 && vb.next){
      while (vb.next < ts - pMs) vb.next += pMs;         // after a stall, skip the missed beats
      if (ts >= vb.next - VB_MS * 0.5){
        vb.next += pMs;
        if (vbLocked(ts) && ts - vb.matchedAt < 2.2 * pMs && ts - vb.firedAt > 0.5 * pMs){ vb.firedAt = ts; fire = Math.max(fire, vb.strength); }
      }
    }
    return fire;
  }

  // ---------- stem visuals ----------
  // A song that was split has its stems in the library (stemOf = the song's id). Once per song (cached), each stem
  // is decoded at 22 kHz and boiled down to a loudness curve at 50 frames a second (plus a kick curve from the
  // drums' low end). While the song plays, the curves are read at the playback position, so this works the same
  // with the native player, the web player and the background player.
  const VS_FPS = 50;
  let vizStemsOn = true;
  try { vizStemsOn = localStorage.getItem('ppVizStems') !== '0'; } catch(e){}
  const vs = { forId: null, curves: null, roles: [], busy: false, status: 'none', lastT: -1,
               lv: { vocals: 0, drums: 0, kick: 0, bass: 0, other: 0 } };
  function vsRole(t){
    const m = /\(\s*([a-z]+)\s*\)\s*$/i.exec(t.title || ''), n = (m ? m[1] : '').toLowerCase();
    if (/^vocals?$/.test(n)) return 'vocals';
    if (n === 'drums') return 'drums';
    if (n === 'bass') return 'bass';
    if (/^(other|instrumental|accompaniment|guitar|piano|music)$/.test(n)) return 'other';
    return null;
  }
  function vsStemsOf(t){
    if (!t || t.stem) return [];
    const id = String(t.dbId);
    return tracks.filter(x => x && x.stem && x !== t && x.kind === 'audio' &&
      (x.stemOf != null ? String(x.stemOf) === id : (x.stemSrc && x.stemSrc === t.title)) && vsRole(x));
  }
  let vsDbP = null;
  function vsDb(){
    if (!vsDbP) vsDbP = new Promise((res, rej) => {
      const r = indexedDB.open('ppVizCache', 1);
      r.onupgradeneeded = () => { r.result.createObjectStore('stems'); };
      r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
    });
    return vsDbP;
  }
  async function vsCacheGet(key){
    try { const db = await vsDb(); return await new Promise(res => { const q = db.transaction('stems').objectStore('stems').get(key); q.onsuccess = () => res(q.result || null); q.onerror = () => res(null); }); }
    catch(e){ return null; }
  }
  async function vsCachePut(key, val){
    try { const db = await vsDb(); db.transaction('stems', 'readwrite').objectStore('stems').put(val, key); } catch(e){}
  }
  const vsYield = () => new Promise(r => setTimeout(r, 0));
  // loudness curve (0..255) of one channel-mixed signal: 40 ms RMS every 20 ms, in dB, scaled to the stem's own loud parts
  async function vsCurve(x, sr){
    const hop = Math.round(sr / VS_FPS), win = hop * 2, n = Math.max(1, Math.floor(x.length / hop)), db = new Float32Array(n);
    for (let f = 0; f < n; f++){
      const a = f * hop - (win >> 2), b = Math.min(x.length, a + win);
      let s = 0, c = 0; for (let i = Math.max(0, a); i < b; i++){ s += x[i] * x[i]; c++; }
      db[f] = 10 * Math.log10(s / Math.max(1, c) + 1e-10);
      if ((f & 4095) === 4095) await vsYield();
    }
    const sorted = Float32Array.from(db).sort(), top = sorted[Math.floor(sorted.length * 0.97)] || -20;
    const out = new Uint8Array(n);
    for (let f = 0; f < n; f++) out[f] = Math.max(0, Math.min(255, Math.round((db[f] - (top - 36)) / 36 * 255)));
    return out;
  }
  async function vsAnalyse(t, stems, key){
    const curves = {}, has = {};
    for (const s of stems){
      const role = vsRole(s);
      const buf = await (await fetch(s.url)).arrayBuffer();
      const ac = new OfflineAudioContext(1, 1, 22050);
      const ab = await ac.decodeAudioData(buf);
      const sr = ab.sampleRate, n = ab.length, mono = new Float32Array(n);
      for (let c = 0; c < ab.numberOfChannels; c++){ const d = ab.getChannelData(c); for (let i = 0; i < n; i++) mono[i] += d[i] / ab.numberOfChannels; }
      await vsYield();
      const cur = await vsCurve(mono, sr);
      if (curves[role]){ const old = curves[role]; for (let i = 0; i < Math.min(old.length, cur.length); i++) old[i] = Math.max(old[i], cur[i]); }
      else curves[role] = cur;
      has[role] = true;
      if (role === 'drums'){
        // kick: the drums through a two-pole low-pass at ~120 Hz
        const k = 1 - Math.exp(-2 * Math.PI * 120 / sr); let y1 = 0, y2 = 0;
        for (let i = 0; i < n; i++){ y1 += (mono[i] - y1) * k; y2 += (y1 - y2) * k; mono[i] = y2; }
        await vsYield();
        curves.kick = await vsCurve(mono, sr);
      }
      await vsYield();
    }
    const val = { v: 1, fps: VS_FPS, curves, has };
    vsCachePut(key, val);
    return val;
  }
  async function vsLoad(t){
    const stems = vsStemsOf(t);
    vs.roles = [...new Set(stems.map(vsRole))];
    if (!stems.length){ vs.status = 'none'; return; }
    const key = 'v1|' + t.dbId + '|' + stems.map(s => s.dbId).sort().join(',');
    vs.status = 'loading'; vs.busy = true;
    try {
      const val = (await vsCacheGet(key)) || await vsAnalyse(t, stems, key);
      if (vs.forId === t.dbId){ vs.curves = val; vs.status = 'ready'; }
    } catch(e){ if (vs.forId === t.dbId) vs.status = 'error'; }
    vs.busy = false;
  }
  // The stem levels right now (smoothed for drawing), or null if this song has none.
  function vizStemsNow(dt){
    const t = currentIndex !== -1 ? tracks[currentIndex] : null;
    if (!vizStemsOn || !t || t.kind !== 'audio'){ vs.forId = null; vs.curves = null; vs.status = 'none'; return null; }
    if (vs.forId !== t.dbId){ vs.forId = t.dbId; vs.curves = null; vs.status = 'none'; if (!vs.busy) vsLoad(t); }
    else if (!vs.curves && !vs.busy && vs.status === 'none' && vsStemsOf(t).length) vsLoad(t);   // split while playing
    if (!vs.curves) return null;
    let time = 0; try { time = media().currentTime || 0; } catch(e){}
    const C = vs.curves.curves, f = time * vs.curves.fps, i = Math.floor(f), fr = f - i;
    const at = (a) => { if (!a || i < 0 || i >= a.length - 1) return 0; return (a[i] * (1 - fr) + a[i + 1] * fr) / 255; };
    const raw = { vocals: at(C.vocals), drums: at(C.drums), kick: at(C.kick), bass: at(C.bass), other: at(C.other) };
    const kR = 1 - Math.exp(-dt / 0.03), kF = 1 - Math.exp(-dt / 0.22);
    for (const k in vs.lv){ const x = raw[k]; vs.lv[k] += (x - vs.lv[k]) * (x > vs.lv[k] ? kR : kF); }
    return { vocals: vs.lv.vocals, drums: vs.lv.drums, kick: vs.lv.kick, bass: vs.lv.bass, other: vs.lv.other,
             kickRaw: raw.kick, drumsRaw: raw.drums, has: vs.curves.has };
  }

  // ---------- menu: stem switch, beat + stem readout ----------
  (function(){
    const seg = document.getElementById('viz-stem-seg'), info = document.getElementById('viz-stem-info'), beatInfo = document.getElementById('viz-beat-info');
    if (!seg) return;
    const paint = () => seg.querySelectorAll('button').forEach(b => b.classList.toggle('on', (b.dataset.v === '1') === vizStemsOn));
    seg.addEventListener('click', (e) => {
      const b = e.target.closest('button'); if (!b) return;
      vizStemsOn = b.dataset.v === '1'; try { localStorage.setItem('ppVizStems', vizStemsOn ? '1' : '0'); } catch(x){}
      paint();
    });
    paint();
    const dd = document.getElementById('viz-sens-dropdown');
    const names = { vocals: 'vocals', drums: 'drums', bass: 'bass', other: 'the rest' };
    setInterval(() => {
      if (!dd || !dd.classList.contains('open')) return;
      const bpm = Math.round(vbBpm()), locked = vbLocked(performance.now());
      beatInfo.textContent = !isPlaying ? 'Beat: paused' : bpm ? (locked ? 'Beat: locked on, ' + bpm + ' BPM' : 'Beat: finding it (about ' + bpm + ' BPM)') : 'Beat: listening';
      if (!vizStemsOn) info.textContent = 'Off: every song uses the full mix.';
      else if (vs.status === 'ready') info.textContent = 'This song: ' + vs.roles.map(r => names[r]).join(', ') + '. The drums drive the beat, the bass the disc, the vocals a glow of their own.';
      else if (vs.status === 'loading') info.textContent = 'Reading this song’s stems…';
      else if (vs.status === 'error') info.textContent = 'Could not read this song’s stems.';
      else info.textContent = 'This song has no stems. Split it (Stems button) and it gets its own visuals: the drums drive the beat, the bass the disc, the vocals a glow of their own.';
    }, 500);
  })();

  // ---------- extra canvases ----------
  const vizFront = document.getElementById('viz-front'), vizGl = document.getElementById('viz-gl');
  let vizFctx = null, vizModeShown = '';
  function vizSyncCanvas(c){ if (c.width !== canvas.width || c.height !== canvas.height){ c.width = canvas.width; c.height = canvas.height; } }
  function vizSetMode(m){
    if (m === vizModeShown) return;
    vizModeShown = m;
    vizWrap.classList.toggle('viz-3d', m === 'disc3d');
    vizWrap.classList.toggle('viz-scope', m === 'scope');
    if (m !== 'scope' && vizFctx) vizFctx.clearRect(0, 0, vizFront.width, vizFront.height);
  }
  // the waveform, -1..1, kept (and faded) while paused so the line settles instead of vanishing
  const vizWav = new Float32Array(1024), vizWavPrev = new Float32Array(1024);
  let vizWavBuf = null, vizWavPeak = 0.3;
  function vizReadWave(g, live, dt){
    vizWavPrev.set(vizWav);
    if (live && g){
      if (!vizWavBuf || vizWavBuf.length !== g.analyser.fftSize) vizWavBuf = new Uint8Array(g.analyser.fftSize);
      g.analyser.getByteTimeDomainData(vizWavBuf);
      const n = vizWavBuf.length; let pk = 0;
      for (let i = 0; i < 1024; i++){ const x = (vizWavBuf[Math.floor(i * n / 1024)] - 128) / 128; vizWav[i] = x; if (Math.abs(x) > pk) pk = Math.abs(x); }
      vizWavPeak += (pk - vizWavPeak) * (pk > vizWavPeak ? 0.2 : 0.02);
    } else {
      const k = Math.exp(-dt / 0.12); for (let i = 0; i < 1024; i++) vizWav[i] *= k;
    }
  }
  const vizWavGain = () => 1 / Math.max(0.12, vizWavPeak);   // quiet songs still move the line
  // The wave ring shows the line minus its low end (a moving average of ~1.5 ms each side): the bass is one slow
  // swell that would bend the whole ring into a blob, and it already moves the ring's size.
  const vizWavHp = new Float32Array(1024), vizWavHpPrev = new Float32Array(1024);
  function vizHighPass(src, dst){
    const R = 24; let s = 0;
    for (let i = 0; i < 2 * R + 1; i++) s += src[Math.min(1023, i)];
    for (let i = 0; i < 1024; i++){
      dst[i] = src[i] - s / (2 * R + 1);
      const a = i - R, b = i + R + 1;
      s += src[Math.min(1023, Math.max(0, b))] - src[Math.min(1023, Math.max(0, a))];
    }
    let pk = 0; for (let i = 0; i < 1024; i++) if (Math.abs(dst[i]) > pk) pk = Math.abs(dst[i]);
    return pk;
  }
  let vizHpPeak = 0.2;

  // ---------- stem overlays for the 2D ring styles ----------
  function vizDrawStemRing(ctx, cx, cy, baseR, maxLen, S, st, pal){
    if (!st) return;
    if (st.has.bass && st.bass > 0.02){             // bass: a warm band hugging the disc
      const th = S * 0.01 + st.bass * st.bass * maxLen * 0.35;
      const g = ctx.createRadialGradient(cx, cy, baseR, cx, cy, baseR + th);
      g.addColorStop(0, vizRgba(pal.bass, 0.35 * st.bass)); g.addColorStop(1, vizRgba(pal.bass, 0));
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, cy, baseR + th, 0, Math.PI * 2); ctx.arc(cx, cy, baseR, 0, Math.PI * 2, true); ctx.fill();
    }
    if (st.has.vocals && st.vocals > 0.02){         // vocals: their own halo out past the bars, breathing with the voice
      const r = baseR + maxLen * (0.7 + st.vocals * 0.25), w = S * 0.05 * (0.4 + st.vocals);
      const g = ctx.createRadialGradient(cx, cy, Math.max(0, r - w), cx, cy, r + w);
      g.addColorStop(0, vizRgba(pal.voc, 0)); g.addColorStop(0.5, vizRgba(pal.voc, 0.32 * st.vocals)); g.addColorStop(1, vizRgba(pal.voc, 0));
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, cy, r + w, 0, Math.PI * 2); ctx.arc(cx, cy, Math.max(0, r - w), 0, Math.PI * 2, true); ctx.fill();
      ctx.strokeStyle = vizRgba(pal.voc, 0.25 + st.vocals * 0.6); ctx.lineWidth = Math.max(1, S * 0.003);
      ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke();
    }
  }

  // ---------- 'wave': the waveform wrapped round the disc ----------
  // The right half runs top to bottom and the left half mirrors it, so the line has no seam.
  function vizDrawWaveRing(ctx, cx, cy, baseR, maxLen, S, pal, pulse, st, lvAvg){
    vizWavHpPrev.set(vizWavHp);
    const pk = vizHighPass(vizWav, vizWavHp);
    vizHpPeak += (pk - vizHpPeak) * (pk > vizHpPeak ? 0.2 : 0.02);
    const P = 200, gain = 1 / Math.max(0.06, vizHpPeak), amp = maxLen * 0.36 * Math.min(1.6, 0.55 + lvAvg * 1.6);
    const r0 = baseR + S * 0.03 + (st && st.has.bass ? st.bass * maxLen * 0.18 : pulse * maxLen * 0.12);
    const path = (w, rr, a) => {
      ctx.beginPath();
      for (let side = -1; side <= 1; side += 2){
        for (let i = 0; i <= P; i++){
          const j = 256 + Math.floor(i / P * 511), taper = 0.25 + 0.75 * Math.sin(Math.PI * i / P);   // soft where the halves meet
          const x = Math.max(-1, Math.min(1, w[j] * gain)) * taper;
          const ang = -Math.PI / 2 + side * (i / P) * Math.PI, r = rr + x * a;
          const px = cx + Math.cos(ang) * r, py = cy + Math.sin(ang) * r;
          if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
        }
      }
    };
    if (st) vizDrawStemRing(ctx, cx, cy, baseR, maxLen, S, st, pal);
    for (const wv of vizWaves){                      // beat rings
      ctx.strokeStyle = vizRgba(pal.acc, 0.42 * (1 - wv) * (1 - wv)); ctx.lineWidth = S * 0.01 * (1 - wv) + 1;
      ctx.beginPath(); ctx.arc(cx, cy, r0 + maxLen * 0.8 * wv, 0, Math.PI * 2); ctx.stroke();
    }
    path(vizWavHpPrev, r0 + S * 0.012, amp * 0.9);     // echo of the last frame, a little further out
    ctx.strokeStyle = vizRgba(st && st.has.vocals ? pal.voc : pal.acc, 0.22 + (st && st.has.vocals ? st.vocals * 0.4 : 0));
    ctx.lineWidth = Math.max(1, S * 0.004); ctx.stroke();
    path(vizWavHp, r0, amp);
    ctx.strokeStyle = vizRgba(pal.acc, 0.2 + pulse * 0.25); ctx.lineWidth = S * 0.016; ctx.lineJoin = 'round'; ctx.stroke();   // glow
    const white = 0.25 + pulse * 0.45, c = pal.acc.map(v => Math.round(v + (255 - v) * white));
    ctx.strokeStyle = vizRgba(c, 0.95); ctx.lineWidth = Math.max(1.5, S * 0.005); ctx.stroke();
    ctx.strokeStyle = vizRgba(pal.acc, 0.1 + pulse * 0.5); ctx.lineWidth = 1 + pulse * S * 0.004;
    ctx.beginPath(); ctx.arc(cx, cy, baseR - S * 0.004, 0, Math.PI * 2); ctx.stroke();
  }

  // ---------- 'scope': an oscilloscope line across the player, over the album art ----------
  function vizDrawScope(ts, pal, pulse, st){
    vizSyncCanvas(vizFront);
    if (!vizFctx) vizFctx = vizFront.getContext('2d');
    const c = vizFctx, W = vizFront.width, H = vizFront.height, S = Math.min(W, H), cy = H / 2;
    // phosphor: the old line fades over a few frames instead of vanishing
    c.globalCompositeOperation = 'destination-out'; c.fillStyle = 'rgba(0,0,0,0.42)'; c.fillRect(0, 0, W, H);
    c.globalCompositeOperation = 'source-over';
    // hold the line still: start every frame at the same rising zero crossing
    let s0 = 0;
    for (let i = 1; i < 512; i++) if (vizWav[i - 1] < -0.01 && vizWav[i] >= 0){ s0 = i; break; }
    const N = 512, gain = vizWavGain(), amp = H * 0.2 * (st && st.has.bass ? 0.8 + st.bass * 0.5 : 1);
    const grad = c.createLinearGradient(0, 0, W, 0);
    const lineC = pal.acc.map(v => Math.round(v + (255 - v) * (0.3 + pulse * 0.5)));
    grad.addColorStop(0, vizRgba(lineC, 0)); grad.addColorStop(0.12, vizRgba(lineC, 1)); grad.addColorStop(0.88, vizRgba(lineC, 1)); grad.addColorStop(1, vizRgba(lineC, 0));
    if (st && st.has.vocals && st.vocals > 0.03){    // vocals: a soft band of their own colour behind the line
      const g2 = c.createLinearGradient(0, cy - H * 0.2, 0, cy + H * 0.2);
      g2.addColorStop(0, vizRgba(pal.voc, 0)); g2.addColorStop(0.5, vizRgba(pal.voc, 0.16 * st.vocals)); g2.addColorStop(1, vizRgba(pal.voc, 0));
      c.fillStyle = g2; c.fillRect(0, cy - H * 0.2, W, H * 0.4);
    }
    c.beginPath();
    for (let i = 0; i < N; i++){
      const x = W * i / (N - 1), edge = Math.sin(Math.PI * i / (N - 1));   // ends pinned to the centre line
      const y = cy - Math.max(-1, Math.min(1, vizWav[s0 + i] * gain)) * amp * edge;
      if (i) c.lineTo(x, y); else c.moveTo(x, y);
    }
    c.lineJoin = 'round';
    c.strokeStyle = vizRgba(pal.acc, 0.16 + pulse * 0.2); c.lineWidth = S * (0.02 + pulse * 0.012); c.stroke();
    c.strokeStyle = vizRgba(pal.acc, 0.4); c.lineWidth = S * 0.008; c.stroke();
    c.strokeStyle = grad; c.lineWidth = Math.max(1.5, S * 0.0032); c.stroke();
  }

  // ---------- '3D disc': WebGL ----------
  // The album art as a record tilted away from you, 64 bars standing round its edge (bass at the back), their
  // reflections below, a shockwave across the floor on each beat, the bass lifting the disc and lighting its rim,
  // and (with stems) the vocals as a glowing ring floating over the record. The view sways a little on its own and
  // follows the phone's tilt.
  const v3 = { gl: null, failed: false, P: null, buf: {}, tex: null, artKey: '', spin: 0, sway: 0,
               tilt: { b: 0, g: 0, b0: null, g0: null, on: false }, waves: [], bars: null, lift: 0 };
  function v3Shader(gl, vs, fs){
    const mk = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s)); return s; };
    const p = gl.createProgram(); gl.attachShader(p, mk(gl.VERTEX_SHADER, vs)); gl.attachShader(p, mk(gl.FRAGMENT_SHADER, fs)); gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
    const u = {}, a = {};
    for (let i = 0; i < gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS); i++){ const n = gl.getActiveUniform(p, i).name.replace(/\[0\]$/, ''); u[n] = gl.getUniformLocation(p, n); }
    for (let i = 0; i < gl.getProgramParameter(p, gl.ACTIVE_ATTRIBUTES); i++){ const n = gl.getActiveAttrib(p, i).name; a[n] = gl.getAttribLocation(p, n); }
    return { p, u, a };
  }
  function v3Init(){
    if (v3.gl) return true;
    if (v3.failed) return false;
    try {
      const gl = vizGl.getContext('webgl', { alpha: true, antialias: true, premultipliedAlpha: true, depth: true });
      if (!gl) throw new Error('no webgl');
      const disc = v3Shader(gl,
        'attribute vec2 aP; uniform mat4 uM; uniform float uLift, uScale; varying vec2 vP;' +
        'void main(){ vP = aP; gl_Position = uM * vec4(aP.x * uScale, uLift, aP.y * uScale, 1.0); }',
        'precision mediump float; varying vec2 vP; uniform sampler2D uT; uniform float uSpin, uBass, uView; uniform vec3 uRim;' +
        'void main(){ float r = length(vP); if (r > 1.0) discard;' +
        ' float c = cos(uSpin), s = sin(uSpin); vec2 q = vec2(c * vP.x - s * vP.y, s * vP.x + c * vP.y);' +
        ' vec3 art = texture2D(uT, q * 0.5 + 0.5).rgb;' +
        ' float th = atan(vP.y, vP.x); float sheen = pow(abs(cos(th - uView)), 18.0);' +
        ' vec3 vinyl = vec3(0.05) + 0.025 * sin(r * 520.0) + sheen * 0.22 + uRim * uBass * smoothstep(0.96, 1.0, r) * 0.9;' +
        ' float edge = smoothstep(0.915, 0.93, r);' +
        ' vec3 col = mix(art * (0.92 + 0.12 * sheen), vinyl, edge) * (1.0 - 0.35 * smoothstep(0.9, 0.93, r) * (1.0 - edge));' +
        ' gl_FragColor = vec4(col, 1.0); }');
      const bar = v3Shader(gl,
        'attribute vec3 aP, aN; attribute vec4 aC; uniform mat4 uM; uniform float uMir; varying vec4 vC; varying vec3 vN; varying float vY, vMir;' +
        'void main(){ vC = aC; vN = aN; vY = aP.y; vMir = uMir; gl_Position = uM * vec4(aP.x, aP.y * uMir, aP.z, 1.0); }',
        'precision mediump float; varying vec4 vC; varying vec3 vN; varying float vY, vMir; uniform float uA; uniform vec3 uEm;' +
        'void main(){ float d = 0.45 + 0.55 * max(dot(normalize(vN), normalize(vec3(0.35, 0.9, 0.45))), 0.0);' +
        ' vec3 col = vC.rgb * mix(d, 1.25, vC.a) + uEm;' +
        ' float a = vMir > 0.0 ? 1.0 : uA * clamp(1.0 - vY / 0.7, 0.0, 1.0);' +
        ' gl_FragColor = vec4(col * a, a); }');
      const fx = v3Shader(gl,
        'attribute vec2 aP; uniform mat4 uM; uniform float uY, uS; varying vec2 vP;' +
        'void main(){ vP = aP * uS; gl_Position = uM * vec4(vP.x, uY, vP.y, 1.0); }',
        'precision mediump float; varying vec2 vP; uniform int uMode; uniform vec3 uC, uC2; uniform float uBass, uVoc, uR; uniform vec2 uW[4];' +
        'void main(){ float r = length(vP); vec3 col = vec3(0.0);' +
        ' if (uMode == 0){ if (r < 1.0) discard; float sh = 0.0;' +
        '  for (int i = 0; i < 4; i++){ float d = (r - uW[i].x) / 0.04; sh += uW[i].y * exp(-d * d); }' +
        '  col = (uC * (sh + uBass * 0.6 * exp(-(r - 1.0) * 3.0)) + uC2 * sh * 0.25) * smoothstep(2.8, 2.1, r);' +
        ' } else { float d1 = (r - uR) / 0.022, d2 = (r - uR) / 0.14; col = uC * uVoc * (exp(-d1 * d1) * 0.95 + exp(-d2 * d2) * 0.35); }' +
        ' gl_FragColor = vec4(col, 0.0); }');
      v3.gl = gl; v3.P = { disc, bar, fx };
      const quad = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, quad);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]), gl.STATIC_DRAW);
      v3.buf.quad = quad; v3.buf.bars = gl.createBuffer();
      // the record's edge: a short dark band under the rim (bar format: pos, normal, colour)
      const E = 96, ev = [];
      for (let i = 0; i < E; i++){
        const a0 = i / E * Math.PI * 2, a1 = (i + 1) / E * Math.PI * 2, p = [];
        for (const a of [a0, a1]) p.push([Math.cos(a), Math.sin(a)]);
        const quadV = [[p[0], 0], [p[1], 0], [p[0], -0.07], [p[0], -0.07], [p[1], 0], [p[1], -0.07]];
        for (const [[x, z], y] of quadV) ev.push(x, y, z, x, 0, z, 0.08, 0.08, 0.09, 0);
      }
      v3.buf.edge = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, v3.buf.edge); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(ev), gl.STATIC_DRAW);
      v3.edgeN = ev.length / 10;
      v3.tex = gl.createTexture(); v3.artKey = '';
      vizGl.addEventListener('webglcontextlost', (e) => { e.preventDefault(); v3.gl = null; }, { once: true });
      vizGl.addEventListener('webglcontextrestored', () => { vizIdle = false; }, { once: true });
      return true;
    } catch(e){
      v3.failed = true; v3.gl = null;
      try { console.warn('3D disc: ' + (e && e.message)); } catch(x){}
      try { showToast('3D disc is not available on this device'); } catch(x){}
      return false;
    }
  }
  // album art (or a plain record label) into the disc texture
  function v3Art(rgb){
    const img = artImg, has = img && img.style.display !== 'none' && img.complete && img.naturalWidth > 0;
    const key = has ? img.currentSrc || img.src : 'none|' + rgb.join(',');
    if (key === v3.artKey) return;
    if (has && !img.complete) return;
    v3.artKey = key;
    const gl = v3.gl, cv = document.createElement('canvas'); cv.width = cv.height = 512;
    const c = cv.getContext('2d');
    const label = () => {
      const g = c.createRadialGradient(256, 256, 20, 256, 256, 256);
      g.addColorStop(0, vizRgba(rgb, 1)); g.addColorStop(0.35, vizRgba(rgb.map(v => v * 0.45), 1)); g.addColorStop(1, '#111216');
      c.fillStyle = g; c.fillRect(0, 0, 512, 512);
      c.strokeStyle = 'rgba(255,255,255,0.06)'; c.lineWidth = 2;
      for (let r = 60; r < 256; r += 14){ c.beginPath(); c.arc(256, 256, r, 0, Math.PI * 2); c.stroke(); }
    };
    if (has){
      const w = img.naturalWidth, h = img.naturalHeight, s = Math.min(w, h);
      try { c.drawImage(img, (w - s) / 2, (h - s) / 2, s, s, 0, 0, 512, 512); } catch(e){ label(); }
    } else label();
    c.fillStyle = '#0c0c0f'; c.beginPath(); c.arc(256, 256, 7, 0, Math.PI * 2); c.fill();   // the spindle hole
    gl.bindTexture(gl.TEXTURE_2D, v3.tex);
    try { gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, cv); }
    catch(e){ label(); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, cv); }   // art from another site
    gl.generateMipmap(gl.TEXTURE_2D);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  }
  if (artImg) artImg.addEventListener('load', () => { vizIdle = false; });
  // phone tilt: only the movement counts (the rest position drifts along), so holding the phone any way works
  function v3Orient(e){
    if (e.beta == null) return;
    const t = v3.tilt;
    if (t.b0 == null){ t.b0 = e.beta; t.g0 = e.gamma || 0; }
    t.b0 += (e.beta - t.b0) * 0.02; t.g0 += ((e.gamma || 0) - t.g0) * 0.02;
    t.b = Math.max(-25, Math.min(25, e.beta - t.b0)); t.g = Math.max(-25, Math.min(25, (e.gamma || 0) - t.g0));
  }
  function v3Tilt(on){
    if (on === v3.tilt.on) return;
    v3.tilt.on = on;
    if (on) window.addEventListener('deviceorientation', v3Orient); else { window.removeEventListener('deviceorientation', v3Orient); v3.tilt.b0 = null; v3.tilt.b = v3.tilt.g = 0; }
  }
  // column-major 4x4 helpers
  function m4persp(fy, asp, n, f){ const t = 1 / Math.tan(fy / 2), r = new Float32Array(16); r[0] = t / asp; r[5] = t; r[10] = (f + n) / (n - f); r[11] = -1; r[14] = 2 * f * n / (n - f); return r; }
  function m4look(e, c, up){
    let zx = e[0] - c[0], zy = e[1] - c[1], zz = e[2] - c[2], l = Math.hypot(zx, zy, zz); zx /= l; zy /= l; zz /= l;
    let xx = up[1] * zz - up[2] * zy, xy = up[2] * zx - up[0] * zz, xz = up[0] * zy - up[1] * zx; l = Math.hypot(xx, xy, xz); xx /= l; xy /= l; xz /= l;
    const yx = zy * xz - zz * xy, yy = zz * xx - zx * xz, yz = zx * xy - zy * xx;
    return new Float32Array([xx, yx, zx, 0, xy, yy, zy, 0, xz, yz, zz, 0, -(xx * e[0] + xy * e[1] + xz * e[2]), -(yx * e[0] + yy * e[1] + yz * e[2]), -(zx * e[0] + zy * e[1] + zz * e[2]), 1]);
  }
  function m4mul(a, b){ const r = new Float32Array(16); for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++){ let s = 0; for (let k = 0; k < 4; k++) s += a[k * 4 + j] * b[i * 4 + k]; r[i * 4 + j] = s; } return r; }
  function v3Bars(pal, st){
    const NB = VIZ_BANDS * 2, out = v3.bars || (v3.bars = new Float32Array(NB * 30 * 10));
    let o = 0;
    const R = 1.1;
    const push = (x, y, z, nx, ny, nz, c, g) => { out[o++] = x; out[o++] = y; out[o++] = z; out[o++] = nx; out[o++] = ny; out[o++] = nz; out[o++] = c[0]; out[o++] = c[1]; out[o++] = c[2]; out[o++] = g; };
    for (let side = -1; side <= 1; side += 2){
      for (let k = 0; k < VIZ_BANDS; k++){
        const lv = vizLevel[k], isB = k < VIZ_BASS;
        const phi = side * (k + 0.5) / VIZ_BANDS * Math.PI;
        const px = Math.sin(phi) * R, pz = -Math.cos(phi) * R;              // k = 0 at the back
        const tx = Math.cos(phi), tz = Math.sin(phi), nx = Math.sin(phi), nz = -Math.cos(phi);
        // shorter towards the front, so the bars never hide the record
        const hw = (isB ? 0.034 : 0.026), hd = 0.022, h = 0.025 + lv * (isB ? 0.9 : 0.7) * (0.45 + 0.55 * (1 + Math.cos(phi)) / 2);
        const white = lv * lv * 0.55;
        let base = pal.acc;
        if (st && st.has.bass && isB) base = pal.bass;
        else if (st && st.has.vocals && k >= 10 && k < 22) base = pal.acc.map((v, i) => v + (pal.voc[i] - v) * Math.min(1, st.vocals * 0.8));
        const col = base.map(v => (v + (255 - v) * white) / 255), top = col.map(v => Math.min(1, v * 1.15 + 0.08)), g = Math.min(1, lv * 0.6);
        const C = (a, b) => [px + tx * a + nx * b, pz + tz * a + nz * b];       // corner at (tangent a, radial b)
        const c00 = C(-hw, -hd), c10 = C(hw, -hd), c11 = C(hw, hd), c01 = C(-hw, hd);
        const face = (p, q, n, cc) => {     // vertical quad p->q
          push(p[0], 0, p[1], n[0], 0, n[1], cc, g); push(q[0], 0, q[1], n[0], 0, n[1], cc, g); push(p[0], h, p[1], n[0], 0, n[1], cc, g);
          push(p[0], h, p[1], n[0], 0, n[1], cc, g); push(q[0], 0, q[1], n[0], 0, n[1], cc, g); push(q[0], h, q[1], n[0], 0, n[1], cc, g);
        };
        face(c00, c10, [-nx, -nz], col); face(c10, c11, [tx, tz], col); face(c11, c01, [nx, nz], col); face(c01, c00, [-tx, -tz], col);
        push(c00[0], h, c00[1], 0, 1, 0, top, g); push(c10[0], h, c10[1], 0, 1, 0, top, g); push(c11[0], h, c11[1], 0, 1, 0, top, g);
        push(c00[0], h, c00[1], 0, 1, 0, top, g); push(c11[0], h, c11[1], 0, 1, 0, top, g); push(c01[0], h, c01[1], 0, 1, 0, top, g);
      }
    }
    return o / 10;
  }
  function v3Attr(gl, prog, name, size, stride, off){ const a = prog.a[name]; if (a == null || a < 0) return; gl.enableVertexAttribArray(a); gl.vertexAttribPointer(a, size, gl.FLOAT, false, stride, off); }
  function v3Off(gl, prog){ for (const n in prog.a) if (prog.a[n] >= 0) gl.disableVertexAttribArray(prog.a[n]); }
  function vizDraw3D(ts, dt, pal, pulse, st, live){
    if (!v3Init()) return false;
    const gl = v3.gl;
    vizSyncCanvas(vizGl);
    v3Art(pal.acc);
    v3Tilt(true);
    const W = vizGl.width, H = vizGl.height;
    gl.viewport(0, 0, W, H);
    gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    if (live) v3.spin += dt * 0.32; v3.sway += dt;
    const bassLv = st && st.has.bass ? st.bass : (vizLevel[0] + vizLevel[1] + vizLevel[2] + vizLevel[3]) / 4;
    v3.lift += (pulse * 0.07 + bassLv * 0.03 - v3.lift) * Math.min(1, dt / 0.05);
    const T = v3.tilt, d2r = Math.PI / 180;
    const el = 0.54 + 0.04 * Math.sin(v3.sway * 0.17) + T.b * d2r * 0.3, az = 0.1 * Math.sin(v3.sway * 0.21) + T.g * d2r * 0.35;
    const Rc = 6.2, eye = [Rc * Math.cos(el) * Math.sin(az), Rc * Math.sin(el), Rc * Math.cos(el) * Math.cos(az)];
    const M = m4mul(m4persp(30 * d2r, W / H, 0.5, 30), m4look(eye, [0, 0.28, 0], [0, 1, 0]));
    const P = v3.P;
    gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LEQUAL); gl.depthMask(true); gl.disable(gl.BLEND);
    // record
    gl.useProgram(P.disc.p); gl.bindBuffer(gl.ARRAY_BUFFER, v3.buf.quad); v3Attr(gl, P.disc, 'aP', 2, 8, 0);
    gl.uniformMatrix4fv(P.disc.u.uM, false, M);
    gl.uniform1f(P.disc.u.uLift, v3.lift); gl.uniform1f(P.disc.u.uScale, 1 + pulse * 0.025);
    gl.uniform1f(P.disc.u.uSpin, v3.spin); gl.uniform1f(P.disc.u.uBass, Math.min(1, bassLv * 1.2 + pulse * 0.5));
    gl.uniform1f(P.disc.u.uView, Math.PI / 2 + az * 2 + 0.6);
    const rim = (st && st.has.bass ? pal.bass : pal.acc).map(v => v / 255); gl.uniform3fv(P.disc.u.uRim, rim);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, v3.tex); gl.uniform1i(P.disc.u.uT, 0);
    gl.drawArrays(gl.TRIANGLES, 0, 6); v3Off(gl, P.disc);
    // record edge + bars + reflections (one program)
    gl.useProgram(P.bar.p);
    const edgeM = m4mul(M, new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, v3.lift, 0, 1]));
    gl.uniformMatrix4fv(P.bar.u.uM, false, edgeM); gl.uniform1f(P.bar.u.uMir, 1); gl.uniform1f(P.bar.u.uA, 1);
    gl.uniform3fv(P.bar.u.uEm, rim.map(v => v * Math.min(1, bassLv + pulse) * 0.5));
    gl.bindBuffer(gl.ARRAY_BUFFER, v3.buf.edge); v3Attr(gl, P.bar, 'aP', 3, 40, 0); v3Attr(gl, P.bar, 'aN', 3, 40, 12); v3Attr(gl, P.bar, 'aC', 4, 40, 24);
    gl.drawArrays(gl.TRIANGLES, 0, v3.edgeN);
    const nv = v3Bars(pal, st);
    gl.bindBuffer(gl.ARRAY_BUFFER, v3.buf.bars); gl.bufferData(gl.ARRAY_BUFFER, v3.bars.subarray(0, nv * 10), gl.DYNAMIC_DRAW);
    v3Attr(gl, P.bar, 'aP', 3, 40, 0); v3Attr(gl, P.bar, 'aN', 3, 40, 12); v3Attr(gl, P.bar, 'aC', 4, 40, 24);
    gl.uniformMatrix4fv(P.bar.u.uM, false, M); gl.uniform3fv(P.bar.u.uEm, [0, 0, 0]);
    gl.drawArrays(gl.TRIANGLES, 0, nv);
    gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA); gl.depthMask(false);
    gl.uniform1f(P.bar.u.uMir, -1); gl.uniform1f(P.bar.u.uA, 0.28);
    gl.drawArrays(gl.TRIANGLES, 0, nv); v3Off(gl, P.bar);
    // floor light (beat shockwaves, bass glow) and the vocal halo, both added on top
    for (let i = v3.waves.length - 1; i >= 0; i--){ v3.waves[i] += dt / 0.8; if (v3.waves[i] >= 1) v3.waves.splice(i, 1); }
    const wv = new Float32Array(8);
    v3.waves.forEach((w, i) => { wv[i * 2] = 1.1 + w * 1.5; wv[i * 2 + 1] = 0.9 * (1 - w) * (1 - w); });
    gl.useProgram(P.fx.p); gl.bindBuffer(gl.ARRAY_BUFFER, v3.buf.quad); v3Attr(gl, P.fx, 'aP', 2, 8, 0);
    gl.uniformMatrix4fv(P.fx.u.uM, false, M);
    gl.uniform1i(P.fx.u.uMode, 0); gl.uniform1f(P.fx.u.uY, -0.002); gl.uniform1f(P.fx.u.uS, 2.8);
    gl.uniform3fv(P.fx.u.uC, (st && st.has.drums ? pal.acc : pal.acc).map(v => v / 255)); gl.uniform3fv(P.fx.u.uC2, [1, 1, 1]);
    gl.uniform1f(P.fx.u.uBass, Math.min(1, bassLv * 0.8 + pulse * 0.4)); gl.uniform2fv(P.fx.u.uW, wv);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
    if (st && st.has.vocals && st.vocals > 0.01){
      gl.uniform1i(P.fx.u.uMode, 1); gl.uniform1f(P.fx.u.uY, v3.lift + 0.3 + st.vocals * 0.16); gl.uniform1f(P.fx.u.uS, 1.4);
      gl.uniform1f(P.fx.u.uR, 0.82 + st.vocals * 0.12); gl.uniform1f(P.fx.u.uVoc, Math.min(1, st.vocals * 1.3));
      gl.uniform3fv(P.fx.u.uC, pal.voc.map(v => v / 255));
      gl.drawArrays(gl.TRIANGLES, 0, 6);
    }
    v3Off(gl, P.fx);
    gl.depthMask(true); gl.disable(gl.BLEND);
    return true;
  }
  function vizDraw3DBeat(){ v3.waves.push(0.0001); if (v3.waves.length > 4) v3.waves.shift(); }
