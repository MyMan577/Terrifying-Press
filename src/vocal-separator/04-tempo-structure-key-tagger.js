  // ---------- Tempo (BPM) from the log-mel frames we already have ----------
  function tempoFromMel(mel, nF) {
    const NB = 96, FPS = 16000 / 256;
    if (nF < FPS * 12) return null;
    const o = new Float32Array(nF);
    for (let f = 1; f < nF; f++) { let a = 0; for (let b = 0; b < NB; b++) { const d = mel[f * NB + b] - mel[(f - 1) * NB + b]; if (d > 0) a += d; } o[f] = a; }
    const W = 16, pre = new Float64Array(nF + 1), z = new Float32Array(nF);
    for (let i = 0; i < nF; i++) pre[i + 1] = pre[i] + o[i];
    for (let i = 0; i < nF; i++) { const a = Math.max(0, i - W), b = Math.min(nF, i + W + 1); z[i] = Math.max(0, o[i] - (pre[b] - pre[a]) / (b - a)); }
    let s = 0; for (let i = 0; i < nF; i++) s += z[i] * z[i]; s = Math.sqrt(s / nF) || 1; for (let i = 0; i < nF; i++) z[i] /= s;
    const acf = lag => {                                               // autocorrelation at a fractional lag
      const L0 = Math.floor(lag), fr = lag - L0, n = nF - L0 - 1; if (n < FPS * 4) return 0;
      let a = 0; for (let i = 0; i < n; i++) a += z[i] * (z[i + L0] * (1 - fr) + z[i + L0 + 1] * fr);
      return a / n;
    };
    let best = 0, bpm = 0, sum = 0, cnt = 0;
    for (let t = 60; t <= 200; t += 0.5) {
      const L = FPS * 60 / t;
      let v = Math.max(0, acf(L)) + 0.5 * Math.max(0, acf(2 * L)) + 0.5 * Math.max(0, acf(4 * L));
      v *= Math.exp(-0.5 * Math.pow(Math.log2(t / 115) / 0.9, 2));       // gentle preference for everyday tempos
      sum += v; cnt++; if (v > best) { best = v; bpm = t; }
    }
    if (!bpm || best <= 0) return null;
    return { bpm: Math.round(bpm), conf: Math.max(0, Math.min(1, (best / (sum / cnt) - 1) / 4)) };
  }

  // ---------- Shifts: where a song changes pace or sound (uses the same log-mel frames as the tempo code) ----------
  // Finds (1) sound changes: the average spectrum before a point differs from the average after it,
  // (2) tempo changes: tempo measured in short windows, folded to the song's main tempo octave.
  // Each shift is described by comparing the stretch before it with the stretch after it (loudness, brightness, rhythm density, tempo).
  function shiftsFromMel(mel, nF, off0, bpm0) {
    const NB = 96, FPS = 16000 / 256, BL = Math.round(FPS), L = 6;
    if (nF < FPS * 24) return null;
    const o = new Float32Array(nF);
    for (let f = 1; f < nF; f++) { let a = 0; for (let b = 0; b < NB; b++) { const d = mel[f * NB + b] - mel[(f - 1) * NB + b]; if (d > 0) a += d; } o[f] = a; }
    const nb = Math.floor(nF / BL);
    const bv = new Float32Array(nb * NB), loud = new Float32Array(nb), dens = new Float32Array(nb), bright = new Float32Array(nb);
    for (let i = 0; i < nb; i++) {
      let lo = 0, hi = 0, od = 0;
      for (let f = i * BL; f < (i + 1) * BL; f++) { for (let b = 0; b < NB; b++) { const v = mel[f * NB + b]; bv[i * NB + b] += v / BL; if (b < NB / 2) lo += v; else hi += v; } od += o[f]; }
      loud[i] = (lo + hi) / (BL * NB); bright[i] = (hi - lo) / (BL * NB / 2); dens[i] = od / BL;
    }
    const sd = a => { let m = 0; for (const v of a) m += v; m /= a.length; let s = 0; for (const v of a) s += (v - m) * (v - m); return Math.sqrt(s / a.length) || 1e-6; };
    const sL = sd(loud), sB = sd(bright), sD = sd(dens);
    // 1) sound novelty
    const nov = new Float32Array(nb);
    for (let i = L; i <= nb - L; i++) {
      let d = 0;
      for (let b = 0; b < NB; b++) { let A = 0, B = 0; for (let k = 1; k <= L; k++) { A += bv[(i - k) * NB + b]; B += bv[(i + k - 1) * NB + b]; } const x = (A - B) / L; d += x * x; }
      nov[i] = Math.sqrt(d / NB);
    }
    let m = 0, c = 0; for (let i = L; i <= nb - L; i++) { m += nov[i]; c++; } m /= c || 1;
    let s = 0; for (let i = L; i <= nb - L; i++) s += (nov[i] - m) * (nov[i] - m); s = Math.sqrt(s / (c || 1)) || 1e-6;
    const cand = [], nm = Array.from(nov.subarray(L, nb - L + 1)).sort((p, q) => p - q), medN = nm[nm.length >> 1] || 1e-6;
    for (let i = L; i <= nb - L; i++) {
      if (nov[i] < m + 1.5 * s || nov[i] < 2.2 * medN || nov[i] < 0.12) continue;
      let top = true; for (let k = Math.max(L, i - 5); k <= Math.min(nb - L, i + 5); k++) if (nov[k] > nov[i]) { top = false; break; }
      if (top) cand.push({ i, sc: (nov[i] - m) / s, snd: true });
    }
    // 2) tempo windows
    const W = Math.round(FPS * 10), H = Math.round(FPS * 5), tw = [];
    const z = new Float32Array(nF), WW = 16, pre = new Float64Array(nF + 1);
    for (let i = 0; i < nF; i++) pre[i + 1] = pre[i] + o[i];
    for (let i = 0; i < nF; i++) { const a = Math.max(0, i - WW), b = Math.min(nF, i + WW + 1); z[i] = Math.max(0, o[i] - (pre[b] - pre[a]) / (b - a)); }
    for (let a0 = 0; a0 + W <= nF; a0 += H) {
      const acf = lag => { const L0 = Math.floor(lag), fr = lag - L0, n = W - L0 - 1; if (n < FPS * 3) return 0; let a = 0; for (let i = 0; i < n; i++) a += z[a0 + i] * (z[a0 + i + L0] * (1 - fr) + z[a0 + i + L0 + 1] * fr); return a / n; };
      let best = 0, bp = 0, sum = 0, cnt = 0;
      for (let t = 60; t <= 200; t += 1) { const lg = FPS * 60 / t; const v = Math.max(0, acf(lg)) + 0.5 * Math.max(0, acf(2 * lg)); sum += v; cnt++; if (v > best) { best = v; bp = t; } }
      tw.push({ a0, bpm: best > 0 && best / (sum / cnt) > 1.8 ? bp : 0 });
    }
    const ref = bpm0 || (() => { const v = tw.map(x => x.bpm).filter(Boolean).sort((p, q) => p - q); return v[v.length >> 1] || 0; })();
    const fold = v => { if (!v || !ref) return 0; let x = v; while (x < ref * 0.72) x *= 2; while (x > ref * 1.45) x /= 2; return x; };
    const ft = tw.map(x => fold(x.bpm)), med2 = (p, q) => p && q ? (p + q) / 2 : (p || q || 0);
    for (let k = 2; k < tw.length - 1; k++) {
      const a = med2(ft[k - 2], ft[k - 1]), b = med2(ft[k], ft[k + 1]);
      if (a && b && Math.abs(b / a - 1) > 0.06) cand.push({ i: Math.round((tw[k].a0 + W / 2) / BL) , sc: 3, tempo: [Math.round(a), Math.round(b)] });
    }
    // merge: keep strongest within 8 s, then describe each one
    cand.sort((p, q) => q.sc - p.sc); const keep = [];
    for (const cd of cand) { if (keep.some(k => Math.abs(k.i - cd.i) < 8)) { const k = keep.find(k => Math.abs(k.i - cd.i) < 8); if (cd.tempo && !k.tempo) k.tempo = cd.tempo; continue; } keep.push(cd); }
    keep.sort((p, q) => p.i - q.i);
    const mean = (arr, a, b) => { let t = 0, n = 0; for (let i = Math.max(0, a); i < Math.min(arr.length, b); i++) { t += arr[i]; n++; } return n ? t / n : 0; };
    const out = [];
    for (const k of keep.slice(0, 16)) {
      const w = [], dl = (mean(loud, k.i, k.i + L) - mean(loud, k.i - L, k.i)) / sL, db = (mean(bright, k.i, k.i + L) - mean(bright, k.i - L, k.i)) / sB, dd = (mean(dens, k.i, k.i + L) - mean(dens, k.i - L, k.i)) / sD;
      if (k.tempo) { const fb = k.i * BL, bef = [], aft = []; tw.forEach((x, j) => { if (!ft[j]) return; if (x.a0 + W <= fb) bef.push(ft[j]); else if (x.a0 >= fb) aft.push(ft[j]); }); const md = a => { a = a.slice(-3).sort((p, q) => p - q); return a.length ? a[a.length >> 1] : 0; }, mA = md(bef), mB = md(aft.slice(0, 3)); if (mA && mB) k.tempo = [Math.round(mA), Math.round(mB)]; }
      if (k.tempo) w.push(k.tempo[1] > k.tempo[0] ? 'faster (~' + k.tempo[0] + ' to ~' + k.tempo[1] + ' BPM)' : 'slower (~' + k.tempo[0] + ' to ~' + k.tempo[1] + ' BPM)');
      if (dl > 0.6) w.push('louder'); else if (dl < -0.6) w.push('quieter');
      if (db > 0.6) w.push('brighter'); else if (db < -0.6) w.push('darker');
      if (dd > 0.6) w.push('busier rhythm'); else if (dd < -0.6) w.push('sparser rhythm');
      if (!w.length) w.push('texture change');
      out.push([Math.round(off0 + k.i * BL / FPS), w.join(', ')]);
    }
    return { list: out, from: Math.round(off0), to: Math.round(off0 + nF / FPS) };
  }

  // ---------- Structure: sections, per-section tags and instrument entries/exits ----------
  // Works on the per-second "patches" the tagger already scores (embedding, 40 instrument classes, vocal chance, loudness, genre, mood heads).
  // 1) boundaries: where the sound stops resembling what came just before (checkerboard novelty on a similarity matrix), plus clear loudness / vocal steps
  // 2) repeats: sections that sound alike get the same letter
  // 3) labels (a guess from repeats, loudness and vocals): Intro, Verse, Chorus (Drop when there are few vocals), Bridge, Breakdown, Outro
  const STEM_GROUPS = [
    ['drums', ['drums', 'drummachine', 'beat', 'percussion']], ['bass', ['bass', 'acousticbassguitar', 'doublebass']], ['vocals', null],
    ['guitar', ['guitar', 'acousticguitar', 'electricguitar', 'classicalguitar']], ['keys', ['piano', 'keyboard', 'electricpiano', 'rhodes', 'organ', 'pipeorgan']],
    ['synth', ['synthesizer', 'pad', 'sampler', 'computer']], ['strings', ['strings', 'violin', 'viola', 'cello', 'orchestra']],
    ['horns', ['brass', 'trumpet', 'trombone', 'horn', 'saxophone', 'flute', 'clarinet', 'oboe']]
  ];
  function structureFromPatches(P) {
    const n = P.t.length, D = 1280, sig = v => 1 / (1 + Math.exp(-v));
    if (n < 24) return null;
    const smooth = (a, r) => { const o = new Float32Array(a.length); for (let i = 0; i < a.length; i++) { let s = 0, c = 0; for (let k = Math.max(0, i - r); k <= Math.min(a.length - 1, i + r); k++) { s += a[k]; c++; } o[i] = s / c; } return o; };
    const avg = (a, i0, i1) => { let s = 0, c = 0; for (let i = Math.max(0, i0); i < Math.min(a.length, i1); i++) { s += a[i]; c++; } return c ? s / c : 0; };
    const pct = (a, q) => { const b = Array.from(a).sort((x, y) => x - y); return b[Math.min(b.length - 1, Math.floor(b.length * q))]; };
    // embeddings: centred on the song's average, lightly smoothed, unit length
    const mu = new Float64Array(D); for (let i = 0; i < n; i++) for (let d = 0; d < D; d++) mu[d] += P.emb[i * D + d] / n;
    const E = new Float32Array(n * D);
    for (let i = 0; i < n; i++) {
      let nr = 0;
      for (let d = 0; d < D; d++) { let s = 0, c = 0; for (let k = Math.max(0, i - 1); k <= Math.min(n - 1, i + 1); k++) { s += P.emb[k * D + d] - mu[d]; c++; } const v = s / c; E[i * D + d] = v; nr += v * v; }
      nr = Math.sqrt(nr) || 1; for (let d = 0; d < D; d++) E[i * D + d] /= nr;
    }
    const SM = new Float32Array(n * n).fill(NaN);
    const sim = (i, j) => { const k = i * n + j; if (SM[k] === SM[k]) return SM[k]; let s = 0; for (let d = 0; d < D; d++) s += E[i * D + d] * E[j * D + d]; SM[k] = SM[j * n + i] = s; return s; };
    const en0 = smooth(P.loud, 1), elo = pct(en0, 0.05), ehi = pct(en0, 0.95), en = en0.map(v => Math.max(0, Math.min(1, (v - elo) / ((ehi - elo) || 1))));
    const vs = smooth(Float32Array.from(P.voice), 1);
    // instrument groups: on/off over time
    let ilo = Infinity, ihi = -Infinity; for (let i = 0; i < P.inst.length; i++) { const v = P.inst[i]; if (v < ilo) ilo = v; if (v > ihi) ihi = v; }
    const iraw = ilo < 0 || ihi > 1, groups = [];
    for (const [name, list] of STEM_GROUPS) {
      let s = new Float32Array(n);
      if (!list) s = Float32Array.from(P.voice);
      else { const ci = list.map(x => P.INST40.indexOf(x)).filter(x => x >= 0); for (let i = 0; i < n; i++) { let m = 0; for (const c of ci) { let v = P.inst[i * 40 + c]; if (iraw) v = sig(v); if (v > m) m = v; } s[i] = m; } }
      s = smooth(s, 1); const p90 = pct(s, 0.9); if (p90 < 0.3) continue;
      const hi = Math.max(0.3, 0.6 * p90), lo = Math.max(0.18, 0.35 * p90), on = new Uint8Array(n); let st = s[0] >= hi ? 1 : 0;
      for (let i = 0; i < n; i++) { if (st && s[i] <= lo) st = 0; else if (!st && s[i] >= hi) st = 1; on[i] = st; }
      for (let i = 0; i < n;) { let j = i; while (j < n && on[j] === on[i]) j++; if (j - i < 4 && i > 0 && j < n) for (let k = i; k < j; k++) on[k] = on[i - 1]; i = j; }   // runs shorter than ~4 s are blips
      groups.push({ name, on });
    }
    // boundaries
    const K = Math.min(8, n >> 2), w = Array.from({ length: K }, (_, a) => Math.exp(-0.5 * Math.pow((a + 0.5) / (K * 0.6), 2)));
    const nov = new Float32Array(n);
    for (let i = K; i <= n - K; i++) { let s = 0, ws = 0; for (let a = 0; a < K; a++) for (let b = 0; b < K; b++) { const ww = w[a] * w[b]; s += ww * (sim(i - 1 - a, i - 1 - b) + sim(i + a, i + b) - sim(i - 1 - a, i + b) - sim(i + a, i - 1 - b)); ws += ww; } nov[i] = s / ws; }
    let m = 0, c = 0; for (let i = K; i <= n - K; i++) { m += nov[i]; c++; } m /= c || 1; let sd = 0; for (let i = K; i <= n - K; i++) sd += (nov[i] - m) * (nov[i] - m); sd = Math.sqrt(sd / (c || 1)) || 1e-6;
    const cand = [], isMax = (arr, i, r) => { for (let k = Math.max(0, i - r); k <= Math.min(n - 1, i + r); k++) if (arr[k] > arr[i]) return false; return true; };
    for (let i = K; i <= n - K; i++) if (nov[i] > 0.05 && nov[i] > m + 0.6 * sd && isMax(nov, i, 4)) cand.push({ i, sc: (nov[i] - m) / sd });
    const de = new Float32Array(n), dv = new Float32Array(n), W6 = 6;
    for (let i = W6; i <= n - W6; i++) { de[i] = Math.abs(avg(en, i, i + W6) - avg(en, i - W6, i)); dv[i] = Math.abs(avg(vs, i, i + W6) - avg(vs, i - W6, i)); }
    for (let i = W6; i <= n - W6; i++) { if (de[i] > 0.3 && isMax(de, i, 4)) cand.push({ i, sc: de[i] / 0.12 }); if (dv[i] > 0.5 && isMax(dv, i, 4)) cand.push({ i, sc: dv[i] / 0.2 }); }
    cand.sort((p, q) => q.sc - p.sc); const maxB = Math.max(2, Math.round(n / 14)), bnd = [];
    for (const cd of cand) { if (bnd.length >= maxB) break; if (cd.i < 6 || cd.i > n - 6) continue; if (bnd.some(x => Math.abs(x - cd.i) < 6)) continue; bnd.push(cd.i); }
    bnd.sort((p, q) => p - q);
    const edges = [0, ...bnd, n], segs = [];
    for (let k = 0; k + 1 < edges.length; k++) {
      const a = edges[k], b = edges[k + 1], ce = new Float32Array(D); let nr = 0;
      for (let i = a; i < b; i++) for (let d = 0; d < D; d++) ce[d] += E[i * D + d];
      for (let d = 0; d < D; d++) nr += ce[d] * ce[d]; nr = Math.sqrt(nr) || 1; for (let d = 0; d < D; d++) ce[d] /= nr;
      segs.push({ a, b, ce, dur: b - a, e: avg(en, a, b), voc: avg(vs, a, b) });
    }
    // repeats: greedy grouping by similarity of the average sound
    const cl = [], cos = (p, q) => { let s = 0; for (let d = 0; d < D; d++) s += p[d] * q[d]; return s; };
    for (const sg of segs) {
      let best = -1, bs = 0.7; cl.forEach((q, k) => { const v = cos(sg.ce, q.ce); if (v > bs) { bs = v; best = k; } });
      if (best < 0) { cl.push({ ce: Float32Array.from(sg.ce), n: 1, dur: sg.dur, es: sg.e * sg.dur, vs: sg.voc * sg.dur }); sg.k = cl.length - 1; }
      else { const q = cl[best]; q.n++; q.dur += sg.dur; q.es += sg.e * sg.dur; q.vs += sg.voc * sg.dur; let nr = 0; for (let d = 0; d < D; d++) { q.ce[d] += sg.ce[d] / q.n; nr += q.ce[d] * q.ce[d]; } nr = Math.sqrt(nr) || 1; for (let d = 0; d < D; d++) q.ce[d] /= nr; sg.k = best; }
    }
    cl.forEach(q => { q.e = q.es / q.dur; q.voc = q.vs / q.dur; });
    const vMean = avg(vs, 0, n), instr = vMean < 0.35;
    let chorus = -1, bsc = -1;
    cl.forEach((q, k) => { if (q.n < 2) return; const sc = q.e * 0.6 + q.voc * 0.2 + Math.min(1, q.dur / n * 2) * 0.2; if (sc > bsc) { bsc = sc; chorus = k; } });
    const last = segs.length - 1, cnt = {}, tot = {};
    segs.forEach((sg, i) => {
      const q = cl[sg.k]; let lab;
      if (P.whole && i === 0 && sg.k !== chorus && (q.n < 2 || sg.voc < 0.3) && sg.dur <= 0.2 * n) lab = 'Intro';
      else if (P.whole && i === last && sg.k !== chorus && (q.n < 2 || sg.voc < 0.3) && sg.dur <= 0.2 * n) lab = 'Outro';
      else if (sg.k === chorus) lab = instr ? 'Drop' : 'Chorus';
      else if (q.n >= 2) lab = sg.voc >= 0.4 ? 'Verse' : 'Instrumental';
      else if (sg.e < 0.35) lab = 'Breakdown';
      else lab = sg.voc >= 0.4 ? 'Bridge' : 'Interlude';
      sg.lab = lab; tot[lab] = (tot[lab] || 0) + 1;
    });
    segs.forEach(sg => { cnt[sg.lab] = (cnt[sg.lab] || 0) + 1; if (tot[sg.lab] > 1) sg.lab += ' ' + cnt[sg.lab]; });
    // per-section tags
    const MOODS = ['happy', 'sad', 'relaxed', 'aggressive', 'party'], mh = (P.heads || []).filter(h => h.kind === 'binary' && MOODS.includes(h.id)).map(h => { let lo = Infinity, hi = -Infinity; for (const v of h.v) { if (v < lo) lo = v; if (v > hi) hi = v; } return Object.assign({ raw: lo < 0 || hi > 1 }, h); });
    // singer's voice per section (gender head), only where there is real singing: lets the map spot a second singer / duet
    const gh = (P.heads || []).find(h => h.group === 'gender' && h.classes && h.classes.length === h.n && h.n >= 2);
    const voiceOf = sg => {
      if (!gh || sg.voc < 0.45) return '';
      const acc = new Float64Array(gh.n); let c2 = 0;
      for (let p = sg.a; p < sg.b; p++) { if (P.voice[p] < 0.5) continue; for (let k = 0; k < gh.n; k++) acc[k] += gh.v[p * gh.n + k]; c2++; }
      if (c2 < 3) return '';
      let pr = Array.from(acc, v => v / c2); if (pr.some(v => v < 0 || v > 1)) { const mx = Math.max(...pr), ex = pr.map(v => Math.exp(v - mx)), sm = ex.reduce((a, b) => a + b, 0); pr = ex.map(v => v / sm); }
      const sm = pr.reduce((a, b) => a + b, 0) || 1; let bi = 0; pr.forEach((v, k) => { if (v > pr[bi]) bi = k; });
      const conf = Math.round(pr[bi] / sm * 100); return conf >= 62 ? gh.classes[bi] + ':' + conf : '';
    };
    const sections = segs.map((sg, i) => {
      const inst = groups.filter(g => avg(g.on, sg.a, sg.b) >= 0.6).map(g => g.name);
      let gen = ''; if (P.gen) { const acc = new Float64Array(400); for (let p = sg.a; p < sg.b; p++) for (let c2 = 0; c2 < 400; c2++) { let v = P.gen[p * 400 + c2]; if (!Number.isFinite(v)) v = 0; acc[c2] += P.genRaw ? sig(v) : v; } let bi = 0; for (let c2 = 1; c2 < 400; c2++) if (acc[c2] > acc[bi]) bi = c2; gen = String(P.DISCOGS[bi]).replace(/\s*\([^)]*\)$/, ''); }
      let md = '', bv = 0.45; for (const h of mh) { let v = 0; for (let p = sg.a; p < sg.b; p++) { const x = h.v[p * h.n + h.pos]; v += h.raw ? sig(x) : x; } v /= (sg.b - sg.a); if (v > bv) { bv = v; md = h.id; } }
      return { t0: i === 0 ? Math.max(0, Math.round(P.t[0] - 1)) : Math.round(P.t[sg.a] - 0.5), t1: i === last ? Math.round(P.dur ? Math.min(P.dur, P.t[n - 1] + 1) : P.t[n - 1] + 1) : Math.round(P.t[segs[i + 1].a] - 0.5),
        label: sg.lab, group: String.fromCharCode(65 + sg.k), voc: Math.round(sg.voc * 100), en: Math.round(sg.e * 100), inst, gen, md, vg: voiceOf(sg) };
    });
    // entries and exits (merged when several arrive together)
    let ev = []; for (const g of groups) for (let i = 1; i < n; i++) if (g.on[i] !== g.on[i - 1] && i >= 3 && i <= n - 3) ev.push([Math.round(P.t[i] - 0.5), g.name, g.on[i]]);
    ev.sort((p, q) => p[0] - q[0]);
    const merged = []; for (const e of ev) { const p = merged.find(x => x[2] === e[2] && Math.abs(x[0] - e[0]) <= 2); if (p) p[1] += '+' + e[1]; else merged.push(e.slice()); }
    return { sections, events: merged.slice(0, 24), from: Math.max(0, Math.round(P.t[0] - 1)), to: sections[sections.length - 1].t1 };
  }
  // compact form for saving, and plain-language lines for the tag view and for the AI
  function compactStruct(r) {
    if (!r.sections || !r.sections.length) return null;
    return { sc: r.sections.map(s => [s.t0, s.t1, s.label, s.voc, s.en, s.inst.join('+'), s.gen, s.md, s.vg || '']), ie: (r.stemEv || []).map(e => [e[0], e[1], e[2]]), scs: r.structSpan, scw: r.structWhole ? 1 : 0 };
  }
  function structLines(c) {
    if (!c || !c.sc || !c.sc.length) return [];
    const mode = k => { const f = {}; c.sc.forEach(s => { if (s[k]) f[s[k]] = (f[s[k]] || 0) + (s[1] - s[0]); }); const e = Object.entries(f).sort((p, q) => q[1] - p[1])[0]; return e ? e[0] : ''; }, mg = mode(6), mm = mode(7);
    const nrg = e => e >= 66 ? 'loud' : e >= 33 ? 'medium' : 'quiet';
    const L = ['Sections' + (c.scs ? ' (' + mmss(c.scs[0]) + '-' + mmss(c.scs[1]) + (c.scw ? '' : ', middle part only') + ')' : '') + ':'];
    c.sc.forEach(s => { const bits = [nrg(s[4]), s[3] >= 50 ? 'vocals' : s[3] >= 20 ? 'some vocals' : 'no vocals']; if (s[5]) bits.push(s[5].split('+').filter(x => x !== 'vocals').join(', ')); if (s[6] && s[6] !== mg) bits.push(s[6]); if (s[7] && s[7] !== mm) bits.push(s[7]); if (s[8]) bits.push(String(s[8]).split(':')[0] + ' voice'); L.push('  ' + mmss(s[0]) + ' ' + s[2] + ' (' + bits.filter(Boolean).join('; ') + ')'); });
    if (c.ie && c.ie.length) L.push('Enter/exit: ' + c.ie.map(e => mmss(e[0]) + ' ' + e[1] + (e[2] ? ' in' : ' out')).join(' · '));
    return L;
  }
  function structSentence(c) {
    if (!c || !c.sc || !c.sc.length) return '';
    let t = 'Structure: ' + c.sc.slice(0, 10).map(s => s[2] + ' at ' + mmss(s[0])).join(', ') + '.';
    if (c.ie && c.ie.length) t += ' Parts come in and out: ' + c.ie.slice(0, 6).map(e => e[1] + ' ' + (e[2] ? 'enters' : 'drops out') + ' at ' + mmss(e[0])).join(', ') + '.';
    return t;
  }

  // ---------- Musical key (chroma + Krumhansl profiles) ----------
  const NOTES = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];
  const CAM_MAJ = [8, 3, 10, 5, 12, 7, 2, 9, 4, 11, 6, 1], CAM_MIN = [5, 12, 7, 2, 9, 4, 11, 6, 1, 8, 3, 10];
  const KS_MAJ = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88], KS_MIN = [6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17];
  async function chromaKey(x) {
    const M = 8192, SRq = 16000, hop = 8000;
    if (x.length < M * 2) return null;
    const fftS = makeFFT(M), nF = Math.floor((x.length - M) / hop) + 1, take = Math.min(nF, 160), w = new Float64Array(M);
    for (let i = 0; i < M; i++) w[i] = 0.5 - 0.5 * Math.cos(2 * Math.PI * i / M);
    const re = new Float64Array(M), im = new Float64Array(M), mag = new Float64Array(M / 2 + 2);
    const kmin = Math.ceil(65 * M / SRq), kmax = Math.min(M / 2 - 2, Math.floor(2000 * M / SRq)), pk = [];
    for (let q = 0; q < take; q++) {
      const st = Math.floor(q * (nF - 1) / Math.max(1, take - 1)) * hop; let e = 0;
      for (let i = 0; i < M; i++) { const v = x[st + i] * w[i]; re[i] = v; im[i] = 0; e += v * v; }
      if (e < 1e-4) continue;
      fftS(re, im);
      let mx = 0; for (let k = kmin - 1; k <= kmax + 1; k++) { mag[k] = Math.hypot(re[k], im[k]); if (mag[k] > mx) mx = mag[k]; }
      const thr = mx * 0.05;
      for (let k = kmin; k <= kmax; k++) {
        const b = mag[k]; if (b < thr || b <= mag[k - 1] || b < mag[k + 1]) continue;
        const a = Math.log(mag[k - 1] + 1e-9), bb = Math.log(b + 1e-9), c = Math.log(mag[k + 1] + 1e-9), d = a - 2 * bb + c;
        const f = (k + (d < 0 ? 0.5 * (a - c) / d : 0)) * SRq / M;
        pk.push([69 + 12 * Math.log2(f / 440), Math.sqrt(b / mx)]);
      }
      if (q % 20 === 19) await tick();
    }
    if (pk.length < 30) return null;
    let sc = 0, ss = 0; for (const [m, wt] of pk) { const fr = m - Math.round(m); sc += wt * Math.cos(2 * Math.PI * fr); ss += wt * Math.sin(2 * Math.PI * fr); }
    const tune = Math.atan2(ss, sc) / (2 * Math.PI), ch = new Float64Array(12);   // how far the recording is tuned from A=440
    for (const [m, wt] of pk) ch[((Math.round(m - tune) % 12) + 12) % 12] += wt;
    const pear = (prof, t) => {
      let ma = 0, mb = 0; for (let i = 0; i < 12; i++) { ma += ch[i]; mb += prof[i]; } ma /= 12; mb /= 12;
      let n = 0, da = 0, db = 0; for (let i = 0; i < 12; i++) { const a = ch[i] - ma, b = prof[(i - t + 12) % 12] - mb; n += a * b; da += a * a; db += b * b; }
      return n / (Math.sqrt(da * db) || 1);
    };
    let best = -2, second = -2, bt = 0, bm = false;
    for (let t = 0; t < 12; t++) for (const minor of [false, true]) {
      const v = pear(minor ? KS_MIN : KS_MAJ, t);
      if (v > best) { second = best; best = v; bt = t; bm = minor; } else if (v > second) second = v;
    }
    return { name: NOTES[bt] + (bm ? ' minor' : ' major'), camelot: (bm ? CAM_MIN : CAM_MAJ)[bt] + (bm ? 'A' : 'B'), conf: Math.max(0, Math.min(1, (best - second) * 5 + 0.3)) };
  }

  // ---------- Embedding storage (int8, ~1.3 KB per track, in IndexedDB) ----------
  async function saveEmb(dbId, e) {
    let m = 0; for (let i = 0; i < e.length; i++) m = Math.max(m, Math.abs(e[i]));
    const sc = m / 127 || 1, buf = new Uint8Array(4 + e.length), dv = new DataView(buf.buffer), q = new Int8Array(buf.buffer, 4);
    dv.setFloat32(0, sc, true); for (let i = 0; i < e.length; i++) q[i] = Math.round(e[i] / sc);
    await idbPut('emb_' + dbId, buf.buffer);
  }
  async function loadEmb(dbId) {
    const b = await idbGet('emb_' + dbId); if (!b || !(b instanceof ArrayBuffer)) return null;
    const sc = new DataView(b).getFloat32(0, true), q = new Int8Array(b, 4), f = new Float32Array(q.length);
    for (let i = 0; i < q.length; i++) f[i] = q[i] * sc;
    return f;
  }

  // ---------- The tagger ----------
  // opt.deep  : scan the whole track (default = the middle ~2 minutes). Also gives "first vocals at".
  // opt.cache : object that keeps ONNX sessions alive between tracks (batch mode).
  async function tagTrack(url, status, lv, opt) {
    opt = opt || {};
    const P = f => { try { opt.progress && opt.progress(Math.max(0, Math.min(1, f))); } catch (e) {} };
    P(0); await loadOrt();
    const low = !!(lv && lv.blob), r = { errors: [] }, own = [], dg = {};
    const TF = ['tg_effnet', 'tg_hinst', 'tg_hvoice', 'tg_mel', 'tg_mn10'];
    for (let i = 0; i < TF.length; i++) { await ensureTagFile(TF[i], status, low, (g, t) => P(0.1 * (i + (t ? g / t : 0.5)) / TF.length)); P(0.1 * (i + 1) / TF.length); await tick(); }
    let hasGenre = true; try { await ensureTagFile('tg_hgenre', status, low); } catch (e) { hasGenre = false; }
    let hasStyleNet = false;
    if (!hasGenre) { try { await ensureTagFile('tg_effstyle', status, low); hasStyleNet = true; } catch (e) { r.errors.push('Styles model download failed: ' + e.message); } }
    let heads = await loadHeads(status, low, moodsOn(), f => P(0.10 + 0.10 * f));
    P(0.2); await tick();
    if (moodsOn() && headsLog.length) r.errors.push('Moods: ' + headsLog.join('; '));
    const S = async key => {
      if (opt.cache) return opt.cache[key] || (opt.cache[key] = await makeSession(key, false, lv));
      const s = await makeSession(key, false, lv); own.push(s); return s;
    };
    let tagWins = null;                                           // the AudioSet windows, cut out of the single decode below
    // 1) Discogs-EffNet (+ heads, tempo, key, vocal timeline, embedding)
    try {
      status('Listening (1 of 2)…');
      let full = await decodeMono(url, 32000);                    // decoded ONCE: EffNet (16 kHz) and the AudioSet windows (32 kHz) both come from this
      r.dur = full.length / 32000;
      tagWins = audiosetWindows(full);                            // cut out now, so the long array can go
      const SEC = 140 * 16000, n16 = full.length >> 1, mid = !opt.deep && n16 > SEC; let off = 0;
      if (mid) off = (n16 - SEC) >> 1;                            // the middle ~2 minutes is plenty
      let x = down2(full, off * 2, mid ? SEC : n16); full = null;
      const whole = !!opt.deep || r.dur <= 142;
      status('Finding the key…'); await tick();
      try { const k = await chromaKey(x); if (k) { r.key = k.name; r.camelot = k.camelot; r.keyConf = k.conf; } } catch (e) { r.errors.push('Key: ' + e.message); }
      status('Analysing sound (1 of 2)…'); await tick();
      const mel = await effnetMel(x, parseNpy(await getPart('tg_mel'))); x = null;
      const nF = mel.length / 96;
      try { const t = tempoFromMel(mel, nF); if (t) { r.bpm = t.bpm; r.bpmConf = t.conf; } } catch (e) { r.errors.push('Tempo: ' + e.message); }
      try { const sh = shiftsFromMel(mel, nF, mid ? off / 16000 : 0, r.bpm); if (sh) { r.shifts = sh.list; r.shiftSpan = [sh.from, sh.to]; } } catch (e) { r.errors.push('Shifts: ' + e.message); }
      const nP = nF >= 128 ? Math.floor((nF - 128) / 62) + 1 : 1, take = Math.min(nP, opt.deep ? 400 : 128);
      const idx = Array.from({ length: take }, (_, i) => Math.floor(i * nP / take));
      // Loudness of each patch (mean log-mel). Near-silent patches (intros, fades, gaps) say nothing about genre or mood,
      // and averaging them in pulled every score towards "unsure". They still count for the vocal timeline.
      const pLoud = idx.map(p => { const s0 = p * 62 * 96, e0 = Math.min(mel.length, s0 + 128 * 96); let a = 0; for (let q = s0; q < e0; q++) a += mel[q]; return e0 > s0 ? a / (e0 - s0) : 0; });
      const loudRef = pLoud.slice().sort((a, b) => b - a)[Math.floor(pLoud.length * 0.2)] || 0;
      const useP = pLoud.map(v => pLoud.length < 4 || v >= loudRef * 0.45);
      const eff = await S('tg_effnet'), hI = await S('tg_hinst'), hV = await S('tg_hvoice');
      const hG = hasGenre ? await S('tg_hgenre') : null;
      const sNet = hasStyleNet ? await S('tg_effstyle') : null;
      const hs = [], okHeads = [];
      for (const h of heads) { try { hs.push(await S('tgh_' + h.id)); okHeads.push(h); status('Loading mood models ' + okHeads.length + ' of ' + heads.length + '…'); P(0.2 + 0.05 * okHeads.length / heads.length); await tick(); } catch (e) { console.warn('mood head unusable', h.id, e); try { await idbDel('tgh_' + h.id); await idbDel('tghm_' + h.id); } catch (e2) {} headsMemo = null; } }
      const heads0 = heads; heads = okHeads; if (!okHeads.length && heads0.length) r.errors.push('Moods skipped: the mood models would not load (they will be re-downloaded next run).');
      // Reads a classifier head's answer by its own output shape. If a head hands back one row for the whole batch instead of one per patch
      // (or fewer values than expected), that row is used for every patch instead of reading past the end and producing NaN.
      const runHead = async (sess, E, cnt, name) => {
        const run1 = async t => (await sess.run({ [sess.inputNames[0]]: t }))[sess.outputNames[0]];
        let o = null, n = 0, per = false, note = '';
        if (!sess.__rows) {
          o = await run1(E); n = (o.dims && o.dims[o.dims.length - 1]) || Math.max(1, Math.round(o.data.length / 64));
          per = o.data.length >= cnt * n;
          note = 'dims ' + (o.dims ? '[' + Array.from(o.dims).join(',') + ']' : '?') + ', ' + o.data.length + ' values';
          if (!per && !sess.__broke) sess.__rows = 1;                                    // this model folds the whole batch into one row
        }
        if (sess.__rows) {                                               // so feed it one patch at a time to get a real answer per patch
          try {
            const em = E.data; let outd = null;
            for (let i = 0; i < cnt; i++) {
              const row = em.slice(i * 1280, (i + 1) * 1280); let oi;
              if (!sess.__rep) { try { oi = await run1(new ort.Tensor('float32', row, [1, 1280])); } catch (e1) { if (i) throw e1; sess.__rep = 1; } }
              if (sess.__rep) { const rep = new Float32Array(64 * 1280); for (let k = 0; k < 64; k++) rep.set(row, k * 1280); oi = await run1(new ort.Tensor('float32', rep, [64, 1280])); }
              n = (oi.dims && oi.dims[oi.dims.length - 1]) || oi.data.length;
              if (!outd) outd = new Float32Array(cnt * n);
              outd.set(oi.data.subarray(0, n), i * n);
            }
            o = { data: outd, dims: [cnt, n] }; per = true; note = (note || 'batch-folding model') + ', run one patch at a time';
          } catch (e) { sess.__rows = 0; sess.__broke = 1; if (!o) o = await run1(E); note = (note || '') + ', one row for the whole batch'; per = false; }
        }
        if (!dg[name]) dg[name] = note;
        return { n, at: (i, c) => { const v = per ? o.data[i * n + c] : o.data[c]; return Number.isFinite(v) ? v : 0; } };
      };
      const inst = new Float32Array(40), g400 = new Float32Array(400), embSum = new Float64Array(1280), hacc = heads.map(() => null), pv = [];
      let voice = 0, rows = 0, used = 0, gotG = false, styleSrc = hG ? 'genre head' : 'effnet styles', styleLo = Infinity, styleHi = -Infinity, styleBad = 0, styleBadAt = -1; const pg = [];
      const embAll = new Float32Array(take * 1280), instAll = new Float32Array(take * 40), gAll = new Float32Array(take * 400), hper = heads.map(() => null); let gAny = false;   // per-second records, for the structure pass
      for (let b = 0; b < take; b += 64) {
        const tb0 = performance.now(), cnt = Math.min(64, take - b), X = new Float32Array(64 * 128 * 96);      // the graph wants exactly 64 patches
        for (let i = 0; i < cnt; i++) { const s0 = idx[b + i] * 62 * 96; X.set(mel.subarray(s0, Math.min(mel.length, s0 + 128 * 96)), i * 128 * 96); }
        status('Listening… ' + Math.min(b + 64, take) + ' of ' + take + ' patches'); P(0.25 + 0.6 * b / take); await tick();
        const res = await eff.run({ [eff.inputNames[0]]: new ort.Tensor('float32', X, [64, 128, 96]) });
        let emb = null, p400 = null;
        for (const n of eff.outputNames) { const o = res[n], d = o.dims[o.dims.length - 1]; if (d === 1280) emb = o.data; else if (d === 400) p400 = o.data; }
        if (!emb) throw new Error('embedding output not found');
        const E = new ort.Tensor('float32', emb, [64, 1280]);
        const yi = await runHead(hI, E, cnt, 'instrument head'), yv = await runHead(hV, E, cnt, 'vocal head');
        let yg = hG ? (await hG.run({ [hG.inputNames[0]]: E }))[hG.outputNames[0]].data : p400;
        if (!yg && sNet) {                                              // official Discogs-EffNet: dynamic batch, [n,128,96] in, 400 style activations out
          const rs = await sNet.run({ [sNet.inputNames[0]]: new ort.Tensor('float32', X.subarray(0, cnt * 128 * 96), [cnt, 128, 96]) });
          for (const n of sNet.outputNames) { const o = rs[n]; if (o.dims[o.dims.length - 1] === 400) { yg = new Float32Array(64 * 400); yg.set(o.data.subarray(0, cnt * 400)); break; } }
          if (!yg && !dg.styleOut) { dg.styleOut = 1; r.errors.push('Styles: the styles model returned no 400-value output (got ' + sNet.outputNames.join(', ') + ')'); }
        }
        for (let j = 0; j < hs.length; j++) {
          if (!hs[j]) continue;
          let y; try { y = await runHead(hs[j], E, cnt, 'mood head ' + heads[j].id); } catch (e) { console.warn('mood head failed', heads[j].id, e); hs[j] = null; continue; }
          const n = y.n;
          if (!hacc[j]) hacc[j] = new Float64Array(n);
          for (let i = 0; i < cnt; i++) if (useP[b + i]) for (let c = 0; c < n; c++) hacc[j][c] += y.at(i, c);
          if (!hper[j]) { hper[j] = new Float32Array(take * n); hper[j].n = n; }
          for (let i = 0; i < cnt; i++) for (let c = 0; c < n; c++) hper[j][(b + i) * n + c] = y.at(i, c);
        }
        for (let i = 0; i < cnt; i++) {
          for (let c = 0; c < 40; c++) instAll[(b + i) * 40 + c] = yi.at(i, c);
          embAll.set(emb.subarray(i * 1280, i * 1280 + 1280), (b + i) * 1280);
          if (yg) { gAll.set(yg.slice(i * 400, i * 400 + 400), (b + i) * 400); gAny = true; }
          for (let c = 0; c < 40; c++) inst[c] = Math.max(inst[c], yi.at(i, c));
          { const vv = yv.at(i, 1); voice += vv; pv.push(vv); }                // classes: instrumental, voice
          if (!useP[b + i]) continue;
          for (let c = 0; c < 1280; c++) embSum[c] += emb[i * 1280 + c];
          if (yg) { gotG = true; const row = yg.slice(i * 400, i * 400 + 400); for (let c = 0; c < 400; c++) { let v = row[c]; if (!Number.isFinite(v)) { styleBad++; if (styleBadAt < 0) styleBadAt = c; row[c] = v = 0; } if (v < styleLo) styleLo = v; if (v > styleHi) styleHi = v; } pg.push(row); }
          used++;
        }
        rows += cnt; await tick();
        await ease(performance.now() - tb0, opt.rest, 'eff', cnt);
      }
      r.voice = voice / rows;
      { let lo = Infinity, hi = -Infinity; for (let i = 0; i < rows * 40 && i < instAll.length; i++) { const v = instAll[i]; if (v < lo) lo = v; if (v > hi) hi = v; }
        const raw = lo < -0.01 || hi > 1.01;                          // the instrument head gave raw scores (logits), not 0..1: squash them, or 4.2 shows as 420%
        r.inst = INST40.map((n, i) => [n, raw ? 1 / (1 + Math.exp(-inst[i])) : Math.max(0, Math.min(1, inst[i]))]); }
      const ur = Math.max(1, used);                                    // averages over the patches that had sound in them
      let nrm = 0; const em = new Float32Array(1280); for (let c = 0; c < 1280; c++) { em[c] = embSum[c] / ur; nrm += em[c] * em[c]; }
      nrm = Math.sqrt(nrm) || 1; for (let c = 0; c < 1280; c++) em[c] /= nrm; r.emb = em;
      if (gotG) {
        const raw = styleLo < 0 || styleHi > 1;                       // raw scores (logits) instead of probabilities
        const kk = Math.max(1, Math.ceil(pg.length / 2)), col = new Float32Array(pg.length);
        for (let c = 0; c < 400; c++) {
          for (let i = 0; i < pg.length; i++) col[i] = raw ? 1 / (1 + Math.exp(-pg[i][c])) : pg[i][c];
          col.sort(); let sm = 0; for (let i = 0; i < kk; i++) sm += col[pg.length - 1 - i]; g400[c] = sm / kk;
        }
        r.style = DISCOGS.map((n, i) => [n, g400[i]]);
        const tp = r.style.slice().sort((a, b) => b[1] - a[1]).slice(0, 3).map(v => v[0] + ' ' + v[1].toFixed(3)).join(', ');
        r.styleDbg = styleSrc + ', raw ' + styleLo.toFixed(3) + '..' + styleHi.toFixed(3) + (raw ? ' (sigmoid applied)' : '') + ', top ' + tp + (styleBad ? ', NaN values: ' + styleBad + ' of ' + pg.length * 400 + ' (first at ' + DISCOGS[styleBadAt] + ')' : '');
      } else r.errors.push('Styles skipped: the styles model could not be downloaded or has no 400-style output.');
      r.heads = {};
      heads.forEach((h, j) => {
        if (!hacc[j]) return;
        const p = Array.from(hacc[j], v => v / ur); let lo = Infinity, hi = -Infinity; p.forEach(v => { lo = Math.min(lo, v); hi = Math.max(hi, v); });
        if (lo < 0 || hi > 1) for (let c = 0; c < p.length; c++) p[c] = 1 / (1 + Math.exp(-p[c]));
        r.heads[h.id] = { label: h.label, kind: h.kind, group: h.group, classes: h.classes, pos: h.pos, p };
      });
      if (!heads.length && moodsOn()) r.errors.push('Moods skipped: the mood models could not be downloaded.');
      // when the singing starts and stops (only meaningful if we looked at the whole track)
      if (whole && pv.length >= 3) {
        const sm = pv.map((v, i) => ((pv[i - 1] != null ? pv[i - 1] : v) + v + (pv[i + 1] != null ? pv[i + 1] : v)) / 3), tm = i => off / 16000 + idx[i] * 62 * 256 / 16000;
        let a = -1, z = -1; for (let i = 0; i < sm.length - 1; i++) if (sm[i] >= 0.5 && sm[i + 1] >= 0.5) { a = i; break; }
        for (let i = sm.length - 1; i >= 0; i--) if (sm[i] >= 0.5) { z = i; break; }
        if (a >= 0) { r.firstVocal = Math.max(0, tm(a)); r.lastVocal = tm(z) + 2; }
        r.whole = true;
      }
      try {                                                            // sections, per-section tags, instrument entries/exits
        const stp = { t: Float32Array.from(idx, q => off / 16000 + q * 62 * 256 / 16000 + 1), emb: embAll, inst: instAll, gen: gAny ? gAll : null, genRaw: styleLo < 0 || styleHi > 1, voice: pv, loud: pLoud, whole: !!whole, dur: r.dur, INST40, DISCOGS,
          heads: heads.map((h, j) => hper[j] ? { id: h.id, kind: h.kind, group: h.group, classes: h.classes, pos: h.pos, n: hper[j].n, v: hper[j] } : null).filter(Boolean) };
        const sr = structureFromPatches(stp); if (sr) { r.sections = sr.sections; r.stemEv = sr.events; r.structSpan = [sr.from, sr.to]; r.structWhole = !!whole; }
      } catch (e) { console.error(e); r.errors.push('Structure: ' + e.message); }
    } catch (e) { console.error(e); r.errors.push('EffNet: ' + e.message); }
    finally { own.forEach(s => s.release && s.release()); own.length = 0; }
    // 2) AudioSet tagger
    try {
      status('Listening (2 of 2)…');
      const wins = tagWins || audiosetWindows(await decodeMono(url, 32000)); tagWins = null;   // normally already cut out during the first pass
      const W = wins.length ? wins[0].length : 160000, nW = wins.length, probs = new Float32Array(527), per = [];
      const sess = await S('tg_mn10');
      try {
        for (let w = 0; w < nW; w++) {
          const tw0 = performance.now(), wav = wins[w];
          const res = await sess.run({ [sess.inputNames[0]]: new ort.Tensor('float32', wav, [1, W]) });
          // The model can export more than one output (scores + an embedding): take the one with the 527 AudioSet classes.
          let out = null; for (const n of sess.outputNames) { const o = res[n]; if (o && o.data && o.data.length === 527) { out = o; break; } }
          if (!out) throw new Error('no 527-class output (' + sess.outputNames.map(n => n + ':' + (res[n] && res[n].data ? res[n].data.length : '?')).join(', ') + ')');
          const y = Float32Array.from(out.data);
          let lo = Infinity, hi = -Infinity; for (let c = 0; c < 527; c++) { lo = Math.min(lo, y[c]); hi = Math.max(hi, y[c]); }
          if (lo < 0 || hi > 1) for (let c = 0; c < 527; c++) y[c] = 1 / (1 + Math.exp(-y[c]));   // raw scores -> probabilities, per window
          per.push(y);
          status('Listening (2 of 2)… ' + (w + 1) + ' of ' + nW); P(0.85 + 0.15 * (w + 1) / nW); await tick();
          await ease(performance.now() - tw0, opt.rest, 'mn', 1);
        }
      } finally { own.forEach(s => s.release && s.release()); own.length = 0; }
      // A plain average over windows waters a tag down: a genre heard clearly in half the song came out at half its strength,
      // and quiet intros/outros dragged everything towards zero. Each class takes the mean of its strongest half of the windows.
      const k = Math.max(1, Math.ceil(per.length / 2));
      for (let c = 0; c < 527; c++) { const v = per.map(y => y[c]).sort((a, b) => b - a); let sm = 0; for (let i = 0; i < k; i++) sm += v[i]; probs[c] = sm / k; }
      const pick = (lo, hi) => { const o = []; for (let i = lo; i <= hi; i++) o.push([AUDIOSET[i], probs[i]]); return o; };
      r.genre = pick(AS_GENRE[0], AS_GENRE[1]); r.mood = pick(AS_MOOD[0], AS_MOOD[1]); r.music = probs[137];
      r.inst2 = []; for (let i = 140; i <= 213; i++) if (asInst(i)) r.inst2.push([AUDIOSET[i], probs[i]]);
    } catch (e) { console.error(e); r.errors.push('AudioSet: ' + e.message); }
    if (r.voice != null && !Number.isFinite(r.voice)) { delete r.voice; r.errors.push('Vocal detector gave no usable result' + (dg['vocal head'] ? ' (' + dg['vocal head'] + ')' : '') + '.'); }
    else if (dg['vocal head'] && /one row/.test(dg['vocal head'])) r.errors.push('Vocal detector: ' + dg['vocal head'] + '.');
    if (dg['instrument head'] && /one row/.test(dg['instrument head'])) r.errors.push('Instrument model: ' + dg['instrument head'] + '.');
    P(1);
    return r;
  }
  const mmss = s => Math.floor(s / 60) + ':' + String(Math.floor(s % 60)).padStart(2, '0');
  function fmtTags(r) {
    const pct = p => Math.round(p * 100) + '%', top = (a, n, min) => a.filter(v => v[1] >= min).sort((u, v) => v[1] - u[1]).slice(0, n).map(v => v[0] + ' ' + pct(v[1])).join(', ') || 'none';
    const L = [];
    if (r.music != null && r.music < 0.3) L.push('Mostly not music (' + pct(r.music) + ')');
    if (r.bpm || r.key) L.push([r.bpm ? 'Tempo: ' + r.bpm + ' BPM' : '', r.key ? 'Key: ' + r.key + ' (' + r.camelot + ')' : ''].filter(Boolean).join(' · '));
    if (r.shifts && r.shifts.length) L.push('Shifts (' + mmss(r.shiftSpan[0]) + '-' + mmss(r.shiftSpan[1]) + '): ' + r.shifts.map(x => mmss(x[0]) + ' ' + x[1]).join(' | '));
    { const cs = compactStruct(r); if (cs) structLines(cs).forEach(x => L.push(x)); }
    if (r.voice != null) L.push((r.voice >= 0.5 ? 'Vocals: yes (' + pct(r.voice) + ')' : 'Instrumental (' + pct(1 - r.voice) + ')') + (r.firstVocal != null ? ' · first vocals at ' + mmss(r.firstVocal) : ''));
    // Genre and mood come from the music models (Discogs-EffNet and its mood heads), the same ones the saved tags use.
    // AudioSet is a general sound model: its genre guesses are only an extra hint, and its mood classes are near noise.
    const parents = {}; (r.style || []).forEach(([n, p]) => { const m = n.match(/\(([^)]*)\)$/), g = m ? m[1] : n; parents[g] = Math.max(parents[g] || 0, p); });
    const gp = Object.entries(parents).filter(v => v[1] > 0);
    const topRel = (a, n) => { const m = Math.max(0, ...a.map(v => v[1])); return m > 0 ? top(a, n, m * 0.35) : 'none'; };
    const gpMax = Math.max(0, ...gp.map(v => v[1])), dOK = gpMax >= 0.15;   // Discogs genres only when they are confident; otherwise the AudioSet genre (the one that worked in the older build)
    if (dOK) L.push('Genre: ' + topRel(gp, 3));
    else if (r.genre) { const g = top(r.genre, 3, 0.1); L.push(g === 'none' ? 'Genre (unclear): ' + top(r.genre, 2, 0) : 'Genre: ' + g); }
    if (r.style && topRel(r.style, 4) !== 'none') L.push('Style: ' + topRel(r.style, 4));
    if (r.styleDbg) L.push('(styles: ' + r.styleDbg + ')');
    if (dOK && r.genre) { const g = top(r.genre, 2, 0.15); if (g !== 'none') L.push('Also sounds like: ' + g); }
    const hd = Object.values(r.heads || {}), MOODS = ['happy', 'sad', 'relaxed', 'aggressive', 'party'];
    const moods = Object.entries(r.heads || {}).filter(([id, h]) => MOODS.includes(id) && h.kind === 'binary').map(([id, h]) => [h.label, h.p[h.pos]]);
    if (moods.length >= 3) { const m = top(moods, 3, 0.5); L.push(m === 'none' ? 'Mood (leaning): ' + top(moods, 2, 0) : 'Mood: ' + m); }
    else if (r.mood) { const m = top(r.mood, 2, 0.1); L.push(m === 'none' ? 'Mood (unclear): ' + top(r.mood, 2, 0) : 'Mood: ' + m); }
    const bin = Object.entries(r.heads || {}).filter(([id, h]) => h.kind === 'binary' && !(moods.length >= 3 && MOODS.includes(id))).map(([id, h]) => [h.label, h.p[h.pos]]);
    if (bin.length) { const f5 = top(bin, 5, 0.5); L.push(f5 === 'none' ? 'Feels (leaning): ' + top(bin, 3, 0) : 'Feels: ' + f5); }
    hd.filter(h => h.kind !== 'binary' && h.group !== 'gender').forEach(h => { const mx = Math.max(0, ...h.p); L.push(h.label + ': ' + top(h.p.map((p, i) => [h.classes[i], p]), h.group === 'theme' ? 5 : 4, h.group === 'theme' ? Math.max(0.05, mx * 0.45) : 0.1)); });
    const g = hd.find(h => h.group === 'gender'); if (g && r.voice >= 0.5) L.push('Voice: ' + top(g.p.map((p, i) => [g.classes[i], p]), 1, 0.5));
    if (r.inst) L.push('Instruments: ' + top(r.inst, 6, 0.4));
    if (r.inst2) L.push('Also heard: ' + top(r.inst2, 6, 0.2));
    (r.errors || []).forEach(e => L.push('! ' + e));
    return L.join('\n') || 'Nothing found.';
  }

