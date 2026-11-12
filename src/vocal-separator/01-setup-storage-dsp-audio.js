/* Stem separator + smart tagger + Whisper lyrics for the player.
   Tagger extras: BPM, key, mood heads (public Essentia ONNX, optional checkbox), saved tags, search, smart playlists, auto-EQ, more-like-this.
   Lyrics: Whisper via transformers.js (needs internet the first time).
   Stem separator for the player. Models live on Hugging Face, app lives on GitHub.
   1) Set HF_BASE.  2) Upload the model files (names in MODELS below) to that repo.
   3) <script src="./vocal-separator.js" defer></script> before </body> in index.html. */
(() => {
  const HF_BASE = 'https://huggingface.co/Myman577/Splitter/resolve/main/';
  const SP4 = 'https://huggingface.co/Best-Practice/spleeter-4stems-onnx/resolve/main/';   // fallback host if a 4-stem file isn't in HF_BASE
  const MODELS = {
    spleeter2: { label: 'Fast · 2 stems (~80 MB)', kind: 'spleeter', files: { vocals: 'spleeter-vocals.onnx', accomp: 'spleeter-accompaniment.onnx' }, sources: [] },
    spleeter4: { label: 'Spleeter · 4 stems (~79 MB)', kind: 'sp4', files: { vocals: 'vocals.fp16.onnx', drums: 'drums.fp16.onnx', bass: 'bass.fp16.onnx', other: 'other.fp16.onnx' }, sources: ['vocals', 'drums', 'bass', 'other'] },
    mdx_voc:   { label: 'Cleaner vocals · MDX-Net (~67 MB)', kind: 'mdx', file: 'UVR-MDX-NET-Voc_FT.onnx', sources: [], nfft: 7680, dimF: 3072, comp: 1.021 },
    demucs4:   { label: 'Best · 4 stems (316 MB)', kind: 'demucs', file: 'htdemucs.onnx',    sources: ['drums', 'bass', 'other', 'vocals'] },
    demucs6:   { label: '6 stems + guitar/piano (~316 MB)', kind: 'demucs', file: 'htdemucs_6s.onnx', sources: ['drums', 'bass', 'other', 'vocals', 'guitar', 'piano'] }
  };
  const ORT = 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.22.0/dist/';
  const SR = 44100, N = 4096, HOP = 1024, T = 512, F = 1024, BINS = N / 2 + 1, PAD = N - HOP, DEMUCS_SEG = 343980, CTX = 64;
  const cap = w => w[0].toUpperCase() + w.slice(1);
  // ORT/emscripten often throws a bare number or an object with no .message, which showed up as "undefined".
  const OOM_HINT = ' Most likely the device ran out of memory: pick a lighter model (Fast 2 stems or Spleeter 4), set Optimization to Medium/Max, close other tabs, then retry.';
  let engineDead = false;                                             // set when the wasm engine aborts: it cannot be revived without reloading the page
  const errText = e => {
    if (e == null) return 'Unknown error.' + OOM_HINT;
    if (typeof e === 'number') return 'The audio engine crashed (code ' + e + ').' + OOM_HINT;
    let m = e.message || (typeof e === 'string' ? e : '');
    if (!m) { try { m = JSON.stringify(e); } catch (x) {} if (!m || m === '{}') m = String(e); }
    if (/abort|assertions|out of memory|memory access|alloc|bad_alloc|RangeError/i.test(m)) m += OOM_HINT;
    return m;
  };
  // Optimization levels, each one includes the one below it. [0] = off.
  //  1 Light  : the big RAM hogs only (CPU only, low-RAM download, basic graph optimization)
  //  2 Medium : + lean ONNX runtime, pauses between chunks, skip work for stems you didn't tick
  //  3 Max    : + longer pauses, UI yields inside the DSP loops, screen wake lock
  const LEVELS = [null,
    { name: 'Light', info: 'Basic savings: lowest memory use.', blob: true, lean: false, pause: [0, 0], skip: false, ye: 0, wake: false },
    { name: 'Medium', info: 'Light, plus short pauses and skipping unused stems.', blob: true, lean: true, pause: [80, 150], skip: true, ye: 0, wake: false },
    { name: 'Max', info: 'Medium, plus longer pauses and keeping the screen awake. Slowest, safest.', blob: true, lean: true, pause: [250, 400], skip: true, ye: 64, wake: true }
  ];
  // Custom level (option 4): the person picks each setting. Stored as JSON under ppvCustom.
  const CUSTOM_DEFAULT = { threads: 0, rest: 0, lean: false, skip: true, smooth: false, wake: false, blob: false, spin: false };
  const customLoad = () => { try { return Object.assign({}, CUSTOM_DEFAULT, JSON.parse(localStorage.getItem('ppvCustom') || '{}')); } catch (e) { return Object.assign({}, CUSTOM_DEFAULT); } };
  const customLevel = () => {
    const c = customLoad(), d = Math.max(0, Math.min(1, (+c.rest || 0) / 100));     // rest = % of each chunk's working time spent idle
    return { name: 'Custom', custom: true, info: 'Custom mix. Pick each setting below.', blob: !!c.blob, lean: !!c.lean, skip: !!c.skip, ye: c.smooth ? 64 : 0, wake: !!c.wake,
      threads: Math.max(0, +c.threads || 0), spin: !!c.spin, duty: d, pause: [Math.round(500 * d), Math.round(800 * d)] };   // native sleeps via duty, the web path via the pause values (ms)
  };

  // ---------- native ONNX bridge (Android app only; the web version is unchanged) ----------
  const NATIVE = !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());
  const NP = NATIVE ? window.Capacitor.Plugins.OnnxSeparator : null;
  let curStatus = null;
  if (NATIVE) {
    // The separator only needs ort.Tensor from ORT; the real inference happens natively.
    if (!window.ort) window.ort = { Tensor: class { constructor(type, data, dims) { this.type = type; this.data = data; this.dims = dims; } } };
    NP.addListener('download', e => { if (curStatus) curStatus('Downloading ' + e.id.replace(/^sp4?_/, '') + ' ' + e.percent + '%'); });
  }
  const toB64Slow = f32 => {
    const u = new Uint8Array(f32.buffer, f32.byteOffset, f32.byteLength); let s = '';
    for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000));
    return btoa(s);
  };
  const fromB64Slow = b64 => { const bin = atob(b64), u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return new Float32Array(u.buffer); };
  // Base64 done by the browser's own native code instead of a JavaScript loop over every byte (these tensors are megabytes).
  // If the WebView refuses either trick it switches to the loops above and stays there.
  let b64Fast = true;
  const toB64 = async f32 => {
    if (b64Fast) {
      try {
        const url = await new Promise((res, rej) => { const fr = new FileReader(); fr.onload = () => res(String(fr.result)); fr.onerror = () => rej(fr.error); fr.readAsDataURL(new Blob([f32])); });
        const i = url.indexOf(','); if (i > 0) return url.slice(i + 1);
      } catch (e) { b64Fast = false; }
    }
    return toB64Slow(f32);
  };
  const fromB64 = async b64 => {
    if (b64Fast) {
      try { const buf = await (await fetch('data:application/octet-stream;base64,' + b64)).arrayBuffer(); if (buf.byteLength % 4 === 0) return new Float32Array(buf); }
      catch (e) { b64Fast = false; }
    }
    return fromB64Slow(b64);
  };
  async function nativeFetch(key, file, status) {
    const urls = /^https?:/.test(file) ? [file] : [HF_BASE + file, SP4 + file];   // same fallback as the web path
    let last = null;
    for (const url of urls) {
      try { curStatus = status; await NP.download({ id: key, url }); curStatus = null; return; }
      catch (e) { last = e; }
    }
    curStatus = null;
    throw new Error('Download failed for ' + file + ': ' + errText(last));
  }
  // NNAPI (phone GPU/NPU) for everything except Demucs, whose transformer ops run better on CPU. The Java side falls back to CPU by itself.
  // The tiny classifier heads (a few hundred KB) lose time compiling for NNAPI and copying data over: CPU is faster for them.
  const cpuOnly = new Set((() => { try { return JSON.parse(localStorage.getItem('ppvCpuOnly') || '[]'); } catch (e) { return []; } })());   // models whose NNAPI output came back NaN: always CPU
  const markCpu = key => { cpuOnly.add(key); try { localStorage.setItem('ppvCpuOnly', JSON.stringify([...cpuOnly])); } catch (e) {} };
  const hasBad = d => { if (!d || !d.length) return true; const st = Math.max(1, (d.length / 512) | 0); for (let i = 0; i < d.length; i += st) if (!Number.isFinite(d[i])) return true; return !Number.isFinite(d[d.length - 1]); };
  const wantNnapi = key => { if (cpuOnly.has(key) || /^demucs/.test(key) || /^(tgh_|tg_hinst$|tg_hvoice$|tg_hgenre$|tg_effnet$|tg_effstyle$|tg_mn10$|ww_)/.test(key)) return false;   // tagger models stay on CPU: NNAPI fp16 blurs the embedding and the in-graph log-mel, so every score came out weak
     try { return localStorage.getItem('ppvNnapi') !== '0'; } catch (e) { return true; } };
  const b64Memo = new WeakMap();
  async function nativeSession(key) {
    let info = await NP.load({ id: key, nnapi: wantNnapi(key), tune: false });   // no NNAPI-vs-CPU timing pass: the NaN check below already falls back to CPU if NNAPI misbehaves
    window.__ppLastSep = ' (on ' + info.accel + ')';
    const once = async feed => {
      const t = Object.values(feed)[0];
      let b = null;
      const small = /^(tgh_|tg_hinst$|tg_hvoice$|tg_hgenre$)/.test(key);   // the ~10 classifier heads all get the very same embedding: encode it once
      if (small) b = b64Memo.get(t.data);
      if (!b) { b = await toB64(t.data); if (small) b64Memo.set(t.data, b); }
      const r = await NP.run({ id: key, data: b, dims: Array.from(t.dims) });
      return { name: r.outputName, data: await fromB64(r.data), dims: r.dims };
    };
    return {
      inputNames: [info.inputName], outputNames: [info.outputName],
      run: async feed => {
        let o = await once(feed);
        if (hasBad(o.data) && wantNnapi(key)) {                      // NNAPI (fp16) overflowed: reload this model on the CPU and redo the call
          console.warn('NaN from NNAPI for', key, '- switching to CPU');
          markCpu(key); try { await NP.unload({ id: key }); } catch (e) {}
          info = await NP.load({ id: key, nnapi: false });
          o = await once(feed);
        }
        if (hasBad(o.data)) throw new Error('model ' + key + ' returned invalid numbers');
        return { [o.name]: { data: o.data, dims: o.dims } };
      },
      release: () => { NP.unload({ id: key }).catch(() => {}); }
    };
  }

  // ---------- model storage (own IndexedDB, survives sw.js cache cleanup) ----------
  const idb = () => new Promise((res, rej) => {
    const r = indexedDB.open('ppSpleeterDB', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('models');
    r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
  });
  const idbGet = async k => { const db = await idb(); return new Promise((res, rej) => { const q = db.transaction('models').objectStore('models').get(k); q.onsuccess = () => res(q.result || null); q.onerror = () => rej(q.error); }); };
  const idbPut = async (k, v) => { const db = await idb(); return new Promise((res, rej) => { const tx = db.transaction('models', 'readwrite'); tx.objectStore('models').put(v, k); tx.oncomplete = res; tx.onerror = () => rej(tx.error); }); };
  const idbDel = async k => { const db = await idb(); return new Promise((res, rej) => { const tx = db.transaction('models', 'readwrite'); tx.objectStore('models').delete(k); tx.oncomplete = res; tx.onerror = () => rej(tx.error); }); };
  // [storage key, file name] pairs a model needs
  const parts = id => { const m = MODELS[id]; return m.kind === 'spleeter' ? Object.entries(m.files).map(([k, f]) => ['sp_' + k, f]) : m.kind === 'sp4' ? Object.entries(m.files).map(([k, f]) => ['sp4_' + k, f]) : [[id, m.file]]; };
  const legacyKey = k => k.replace('sp_', '');                      // v1 stored spleeter files as 'vocals'/'accomp'
  const getPart = async k => { const v = (await idbGet(k)) || (k.startsWith('sp_') ? await idbGet(legacyKey(k)) : null); return v instanceof Blob ? v.arrayBuffer() : v; };

  async function fetchPart(key, file, onProgress, low) {
    const abs = /^https?:/.test(file), alt = !abs && /^(vocals|drums|bass|other)(\.fp16)?\.onnx$/.test(file) ? SP4 + file : null;
    let r = await fetch(abs ? file : HF_BASE + file, { mode: 'cors' }).catch(e => { if (!alt) throw e; return { ok: false }; });
    if (!r.ok && alt) r = await fetch(alt, { mode: 'cors' });
    if (!r.ok) throw new Error('Download failed (' + r.status + ') for ' + file + '. Is it uploaded to the public HF repo?');
    const total = +r.headers.get('content-length') || 0, rd = r.body.getReader();
    if (low) {                                                       // chunks -> Blob: IndexedDB keeps it on disk instead of cloning 316 MB of RAM
      const bl = []; let n = 0;
      for (;;) { const { done, value } = await rd.read(); if (done) break; bl.push(value); n += value.length; onProgress && onProgress(n, total); }
      await idbPut(key, new Blob(bl)); return;
    }
    let out = total ? new Uint8Array(total) : null, chunks = [], got = 0;   // preallocate: avoids a 2x memory spike on the 316 MB files
    for (;;) {
      const { done, value } = await rd.read(); if (done) break;
      if (out && got + value.length <= out.length) out.set(value, got); else { if (out) { chunks.push(out.subarray(0, got)); out = null; } chunks.push(value); }
      got += value.length; onProgress && onProgress(got, total);
    }
    if (!out) { out = new Uint8Array(got); let o = 0; for (const c of chunks) { out.set(c, o); o += c.length; } }
    await idbPut(key, out.buffer);
  }

  // ---------- DSP ----------
  const cosT = new Float32Array(N / 2), sinT = new Float32Array(N / 2), rev = new Uint16Array(N);
  for (let i = 0; i < N / 2; i++) { cosT[i] = Math.cos(2 * Math.PI * i / N); sinT[i] = -Math.sin(2 * Math.PI * i / N); }
  for (let i = 0, b = Math.log2(N); i < N; i++) { let r = 0; for (let j = 0; j < b; j++) r |= ((i >> j) & 1) << (b - 1 - j); rev[i] = r; }
  const win = new Float32Array(N); for (let i = 0; i < N; i++) win[i] = 0.5 - 0.5 * Math.cos(2 * Math.PI * i / N); // periodic Hann
  function fft(re, im) {
    for (let i = 0; i < N; i++) { const j = rev[i]; if (j > i) { let t = re[i]; re[i] = re[j]; re[j] = t; t = im[i]; im[i] = im[j]; im[j] = t; } }
    for (let size = 2; size <= N; size <<= 1) {
      const half = size >> 1, step = N / size;
      for (let s = 0; s < N; s += size) for (let k = 0, w = 0; k < half; k++, w += step) {
        const a = s + k, b = a + half, wr = cosT[w], wi = sinT[w];
        const tr = re[b] * wr - im[b] * wi, ti = re[b] * wi + im[b] * wr;
        re[b] = re[a] - tr; im[b] = im[a] - ti; re[a] += tr; im[a] += ti;
      }
    }
  }
  const tick = () => new Promise(r => setTimeout(r));

  // ---------- pacing: rest when the phone is hot ----------
  // Call after a unit of heavy work (a batch, a slice, a track). Sleeps a share of that unit's own time when the phone is warm.
  // In the Android app the thermal reading comes from the native side. Anywhere else (no thermal data) it watches for the chip slowing
  // down: a unit much slower than the fastest unit of the same kind (per `size`) means throttling, so it rests.
  const EASE_BEST = {}; let thermalDead = false;
  async function ease(workMs, rest, key, size) {
    let f = rest || 0;
    if (NATIVE && NP && !thermalDead) { try { f = Math.max(f, (await NP.thermal()).factor || 0); } catch (e) { thermalDead = true; } }
    if (key && workMs > 400) {
      const per = workMs / (size || 1), b = EASE_BEST[key];
      if (!b || per < b) EASE_BEST[key] = per;
      else if (per > b * 1.6) f = Math.max(f, Math.min(1, (per / b - 1.6) / 1.4));
    }
    const ms = Math.min(8000, workMs * f);
    if (ms > 20) await new Promise(r => setTimeout(r, ms));
  }

  // 2:1 decimation 32 kHz -> 16 kHz with a 63-tap half-band low-pass (only 33 taps are non-zero), so ONE decode feeds both taggers.
  const HB = (() => {
    const n = 63, c = 31, ix = [], w = []; let sum = 0;
    for (let i = 0; i < n; i++) {
      const k = i - c; if (k !== 0 && k % 2 === 0) continue;                  // every even tap but the centre is exactly zero
      const h = (k === 0 ? 0.5 : Math.sin(Math.PI * k / 2) / (Math.PI * k)) * (0.5 - 0.5 * Math.cos(2 * Math.PI * i / (n - 1)));
      ix.push(k); w.push(h); sum += h;
    }
    return { ix: Int16Array.from(ix), w: Float32Array.from(w.map(v => v / sum)) };
  })();
  function down2(a, start, n) {                                                // n output samples; output i sits at input sample start + 2i
    const out = new Float32Array(n), L = a.length, ix = HB.ix, w = HB.w, T = ix.length;
    for (let i = 0; i < n; i++) {
      const p = start + 2 * i; let s = 0;
      if (p >= 31 && p + 31 < L) for (let t = 0; t < T; t++) s += a[p + ix[t]] * w[t];
      else for (let t = 0; t < T; t++) { const j = p + ix[t]; if (j >= 0 && j < L) s += a[j] * w[t]; }
      out[i] = s;
    }
    return out;
  }
  // The few 5 s windows the AudioSet tagger looks at (same positions as before), cut from an already decoded 32 kHz track.
  function audiosetWindows(x) {
    const W = 160000, nW = Math.max(1, Math.min(6, Math.floor(x.length / W))), out = [];   // 5 s at 32 kHz: the fixed input length of mn10_as.onnx (160000 samples)
    for (let w = 0; w < nW; w++) {
      const wav = new Float32Array(W), st = x.length > W ? Math.floor((x.length - W) * (w + 0.5) / nW) : 0;
      wav.set(x.subarray(st, st + W)); out.push(wav);
    }
    return out;
  }
  // Finds the stretches of a clip that hold speech or singing, so silence (intros, gaps, instrumental breaks) is never sent to Whisper.
  // Returns [[startSec, endSec], ...]. Gaps under 4 s stay inside a stretch, each stretch gets 1.5 s of padding, and if less than
  // 10% would be skipped (or the clip is too quiet to judge) the whole clip is returned unchanged.
  function speechRegions(x, sr) {
    const dur = x.length / sr, F = Math.round(sr * 0.5), n = Math.floor(x.length / F);
    if (n < 16) return [[0, dur]];
    const rms = new Float32Array(n);
    for (let i = 0; i < n; i++) { let s = 0; const a = i * F; for (let j = 0; j < F; j++) { const v = x[a + j]; s += v * v; } rms[i] = Math.sqrt(s / F); }
    const ref = Array.from(rms).sort((u, v) => u - v)[Math.floor(n * 0.9)];
    if (!(ref > 0.002)) return [[0, dur]];
    const thr = ref * 0.035, HOLD = 8, PAD = 3, spans = [];
    let a = -1, last = -1;
    for (let i = 0; i < n; i++) {
      if (rms[i] <= thr) continue;
      if (a >= 0 && i - last > HOLD) { spans.push([a, last]); a = -1; }
      if (a < 0) a = i;
      last = i;
    }
    if (a >= 0) spans.push([a, last]);
    if (!spans.length) return [[0, dur]];
    const out = [];
    for (const [u, v] of spans) {
      const s0 = Math.max(0, u - PAD) * 0.5, s1 = v + PAD + 1 >= n ? dur : Math.min(dur, (v + PAD + 1) * 0.5);
      if (out.length && s0 <= out[out.length - 1][1] + 0.01) out[out.length - 1][1] = Math.max(out[out.length - 1][1], s1); else out.push([s0, s1]);
    }
    const kept = out.reduce((m, r) => m + r[1] - r[0], 0);
    return kept > dur * 0.9 ? [[0, dur]] : out;
  }

  // pcm: [L, R] Float32Array at 44.1k. Finished audio is streamed to sink(vocals:[L,R], accomp:[L,R], startSample) one
  // segment at a time, so peak RAM stays flat. Without a sink it collects everything and returns {vocals, accomp}.
  // o.ctx   : frames of context the model sees on each side of a segment but doesn't keep (hides the seams between segments)
  // o.shift : also run a copy of the audio delayed by this many samples and average both (cuts artifacts, ~2x time)
  async function separate(pcm, sessions, onProgress, sharp = 1, sink, o = {}) {
    const { pause = 0, need = null, ye = 0, ctx = 0, shift = 0 } = o;
    const len = pcm[0].length, D = shift, Te = T - 2 * ctx, passes = D ? [0, D] : [0], np = passes.length;
    let L = PAD + len + PAD + D; L += (HOP - ((L - N) % HOP)) % HOP;
    const nFrames = (L - N) / HOP + 1, SEG = Te * HOP, RB = SEG + N + D;
    const nSeg = Math.max(Math.ceil(nFrames / Te), Math.ceil((PAD + len + D) / SEG));
    let full = null;
    if (!sink) {
      full = { vocals: [new Float32Array(len), new Float32Array(len)], accomp: [new Float32Array(len), new Float32Array(len)] };
      sink = (v, a, at) => { for (let c = 0; c < 2; c++) { full.vocals[c].set(v[c], at); full.accomp[c].set(a[c], at); } };
    }
    const outV = [new Float32Array(RB), new Float32Array(RB)], outA = [new Float32Array(RB), new Float32Array(RB)];   // rolling: index 0 = padded sample s*SEG - D
    const re = new Float32Array(N), im = new Float32Array(N), m = new Float32Array(BINS);
    const specRe = [new Float32Array(T * BINS), new Float32Array(T * BINS)], specIm = [new Float32Array(T * BINS), new Float32Array(T * BINS)];
    const x = new Float32Array(2 * T * F);
    for (let s = 0; s < nSeg; s++) {
      const fr0 = s * Te - ctx;
      if (s * Te < nFrames) for (let pi = 0; pi < np; pi++) {
        const sh = passes[pi];
        x.fill(0); specRe.forEach(a => a.fill(0)); specIm.forEach(a => a.fill(0));
        for (let c = 0; c < 2; c++) for (let t = 0; t < T; t++) {
          const fr = fr0 + t; if (fr < 0) continue; if (fr >= nFrames) break;
          const o0 = fr * HOP - PAD - sh, src = pcm[c];
          for (let i = 0; i < N; i++) { const j = o0 + i; re[i] = (j >= 0 && j < len ? src[j] : 0) * win[i]; im[i] = 0; }
          fft(re, im);
          for (let k = 0; k < BINS; k++) { specRe[c][t * BINS + k] = re[k]; specIm[c][t * BINS + k] = im[k]; }
          for (let k = 0; k < F; k++) x[c * T * F + t * F + k] = Math.hypot(re[k], im[k]);
          if (ye && (t + 1) % ye === 0) await tick();
        }
        const mkFeed = () => ({ x: new ort.Tensor('float32', x.slice(), [2, 1, T, F]) });   // a copy per run: the engine may take ownership of (detach) what it is given
        const V = (await sessions.vocals.run(mkFeed())).y.data;
        await tick();
        const A = sessions.accomp ? (await sessions.accomp.run(mkFeed())).y.data : null;
        for (let c = 0; c < 2; c++) for (let t = ctx; t < T - ctx; t++) {      // only the centre frames are kept
          const fr = fr0 + t; if (fr >= nFrames) break;
          const base = c * T * F + t * F;
          for (let k = 0; k < F; k++) {
            if (A) { const v2 = V[base + k] ** 2, a2 = A[base + k] ** 2; m[k] = (v2 + 5e-11) / (v2 + a2 + 1e-10); }
            else m[k] = Math.min(1, V[base + k] / Math.max(x[base + k], 1e-9));
          }
          if (sharp !== 1) for (let k = 0; k < F; k++) { const a = Math.pow(m[k], sharp), b = Math.pow(1 - m[k], sharp); m[k] = a / (a + b + 1e-12); } // sharpen: less bleed, more artifacts
          let avg = 0; for (let k = F - 64; k < F; k++) avg += m[k]; avg /= 64;
          for (let k = F; k < BINS; k++) m[k] = avg;           // Spleeter zeroes >11kHz; hold the mask instead
          for (let pass = 0; pass < 2; pass++) {
            if (need && !(pass ? need.a : need.v)) continue;     // stem not requested: skip its inverse FFT
            const out = pass ? outA : outV;
            for (let k = 0; k < BINS; k++) {
              const g = pass ? 1 - m[k] : m[k], r = specRe[c][t * BINS + k] * g, i = specIm[c][t * BINS + k] * g;
              re[k] = r; im[k] = -i;                            // conj for inverse-via-forward
              if (k > 0 && k < N / 2) { re[N - k] = r; im[N - k] = i; }
            }
            fft(re, im);
            const bo = (t - ctx) * HOP + D - sh, ob = out[c];     // the delayed pass is written back at its true position
            for (let i = 0; i < N; i++) ob[bo + i] += (re[i] / N) * win[i] / 1.5;
          }
          if (ye && (t + 1) % ye === 0) await tick();
        }
        onProgress && onProgress(Math.min(1, (s * np + pi + 1) / (nSeg * np)));
        await tick(); if (pause) await new Promise(r => setTimeout(r, pause));
      }
      // buffer index 0 = padded sample s*SEG - D; everything before index SEG is final now. Hand it off, then slide.
      const a = Math.max(0, s * SEG - D - PAD), b = Math.min(len, (s + 1) * SEG - D - PAD);
      if (b > a) {
        const bs = a + PAD + D - s * SEG, sc = 1 / np, cut = ob => { const r = ob.slice(bs, bs + b - a); if (np > 1) for (let i = 0; i < r.length; i++) r[i] *= sc; return r; };
        sink(outV.map(cut), outA.map(cut), a);
      }
      for (const ob of outV.concat(outA)) { ob.copyWithin(0, SEG, RB); ob.fill(0, RB - SEG); }
    }
    onProgress && onProgress(1);
    return full;
  }

  // ---------- audio in/out ----------
  async function decode(url) {
    const buf = await (await fetch(url)).arrayBuffer();
    const ctx = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: SR });
    const ab = await ctx.decodeAudioData(buf); ctx.close && ctx.close();
    const l = ab.getChannelData(0), r = ab.numberOfChannels > 1 ? ab.getChannelData(1) : l;
    return [l, r];                                                       // views into the AudioBuffer, no extra copy
  }
  const i16 = f => { const o = new Int16Array(f.length); for (let i = 0; i < f.length; i++) { const v = Math.max(-1, Math.min(1, f[i])); o[i] = v < 0 ? v * 32768 : v * 32767; } return o; };
  // Mutes the gaps between sung lines. Follows the vocal level, compares it with a slowly decaying recent peak,
  // and fades the stem down while it stays far below that peak. Keeps its state across chunks; edits chunks in place.
  const GATES = [null, { thr: 0.02, floor: 0.1 }, { thr: 0.05, floor: 0.03 }, { thr: 0.1, floor: 0 }];   // Gentle, Normal, Strong
  function makeGate(level) {
    const g = GATES[level]; if (!g) return null;
    const k = ms => 1 - Math.exp(-1 / (ms / 1000 * SR)), kEnvA = k(1), kEnvR = k(50), kGainA = k(4), kGainR = k(120), refDecay = Math.pow(0.5, 1 / (15 * SR)), holdN = Math.round(0.15 * SR);
    let env = 0, ref = 0, gain = 1, hold = 0;
    return {
      process(Lc, Rc) {
        for (let i = 0; i < Lc.length; i++) {
          const a = Math.max(Math.abs(Lc[i]), Math.abs(Rc[i]));
          env += (a - env) * (a > env ? kEnvA : kEnvR);
          ref = Math.max(env, ref * refDecay);
          if (env >= g.thr * ref) hold = holdN; else if (hold > 0) hold--;
          const target = hold > 0 ? 1 : g.floor;
          gain += (target - gain) * (target > gain ? kGainA : kGainR);
          Lc[i] *= gain; Rc[i] *= gain;
        }
      }
    };
  }

