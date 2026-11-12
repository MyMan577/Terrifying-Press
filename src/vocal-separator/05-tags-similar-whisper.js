  // ---------- Saved tags (small, in localStorage) ----------
  const TAGS_KEY = 'ppTagsV2';
  let tagStore = null, tagVer = 0;
  const loadTags = () => {
    if (tagStore) return tagStore; try { tagStore = JSON.parse(localStorage.getItem(TAGS_KEY)) || {}; } catch (e) { tagStore = {}; }
    // Older builds could save instrument scores from raw model output (e.g. 420%). Squash those once, the same way the tagger now does.
    let fixed = false; const sq = v => Math.round(100 / (1 + Math.exp(-v / 100)));
    Object.values(tagStore).forEach(c => {
      if (!c) return;
      if (Array.isArray(c.in) && c.in.some(x => x && (x[1] > 100 || x[1] < 0))) { c.in = c.in.map(x => [x[0], x[1] > 100 || x[1] < 0 ? sq(x[1]) : x[1]]).sort((a, b) => b[1] - a[1]); fixed = true; }
      if (c.bpm && (c.bpm < 30 || c.bpm > 300)) { delete c.bpm; fixed = true; }
      if (c.v != null && (c.v > 100 || c.v < 0)) { c.v = Math.max(0, Math.min(100, c.v)); fixed = true; }
    });
    if (fixed) try { localStorage.setItem(TAGS_KEY, JSON.stringify(tagStore)); } catch (e) {}
    return tagStore;
  };
  const saveTagStore = () => { tagVer++; try { localStorage.setItem(TAGS_KEY, JSON.stringify(tagStore)); return true; } catch (e) { return false; } };
  function compactTags(r) {
    const top = (a, n, min) => (a || []).filter(v => v[1] >= min).sort((u, v) => v[1] - u[1]).slice(0, n).map(v => [v[0], Math.round(v[1] * 100)]);
    const c = { ts: Date.now() };
    if (r.voice != null) c.v = Math.round(r.voice * 100);
    if (r.music != null) c.mu = Math.round(r.music * 100);
    if (r.bpm) c.bpm = r.bpm;
    if (r.key) { c.key = r.key; c.ck = r.camelot; }
    if (r.shifts && r.shifts.length) { c.sh = r.shifts; c.shs = r.shiftSpan; }
    { const cs = compactStruct(r); if (cs) Object.assign(c, cs); }
    if (r.firstVocal != null) { c.fv = Math.round(r.firstVocal); c.lv = Math.round(r.lastVocal); }
    if (r.dur) c.d = Math.round(r.dur);
    if (r.whole) c.w = 1;
    if (r.style) {
      const par = {}; r.style.forEach(([n, p]) => { const m = n.match(/\(([^)]*)\)$/), g = m ? m[1] : n; par[g] = Math.max(par[g] || 0, p); });
      const rel = (a, n) => { const m = Math.max(0, ...a.map(v => v[1])); return m > 0 ? top(a, n, m * 0.35) : []; };
      c.gp = rel(Object.entries(par), 3); c.st = rel(r.style, 5);   // relative to the strongest style: the absolute level varies a lot between models   // averaged style activations are small by nature, so the cut-offs are low
    }
    c.gn = top(r.genre, 3, 0.08); c.md = top(r.mood, 3, 0.08);
    if (c.gp && c.gp.length && c.gp[0][1] >= 15) c.gn = c.gp; else if (c.gp) c.gp = [];   // weak Discogs genres: keep the AudioSet genre                              // Discogs-EffNet genres are far stronger than AudioSet's
    if (r.genre && !c.gn.length) c.gn = top(r.genre, 2, 0); if (r.mood && !c.md.length) c.md = top(r.mood, 2, 0);
    const ins = {}; (r.inst || []).forEach(([n, p]) => { if (p >= 0.4) ins[n] = p; }); (r.inst2 || []).forEach(([n, p]) => { if (p >= 0.2) ins[n] = Math.max(ins[n] || 0, p); });
    c.in = top(Object.entries(ins), 8, 0);
    c.hd = {}; c.hm = {};
    Object.entries(r.heads || {}).forEach(([id, h]) => {
      if (h.kind === 'binary') c.hd[id] = Math.round(h.p[h.pos] * 100);
      else if (h.group === 'theme') { const a = h.p.map((p, i) => [h.classes[i], p]), mx = Math.max(0, ...h.p); c.hm[id] = mx >= 0.05 ? top(a, 5, mx * 0.45) : []; }
      else c.hm[id] = top(h.p.map((p, i) => [h.classes[i], p]), 5, 0.1);
    });
    {                                                                  // Mood from the Essentia mood heads when they ran; AudioSet's mood classes are near noise
      const MOODIDS = ['happy', 'sad', 'relaxed', 'aggressive', 'party'], mm = MOODIDS.filter(id => c.hd[id] != null).map(id => [id, c.hd[id] / 100]).sort((u, v) => v[1] - u[1]);
      if (mm.length >= 3) { const strong = mm.filter(v => v[1] >= 0.4); c.md = (strong.length ? strong : mm.slice(0, 2)).slice(0, 3).map(v => [v[0], Math.round(v[1] * 100)]); }
    }
    return c;
  }
  async function persistTags(dbId, r, autoEq) {
    const old = loadTags()[dbId], c = compactTags(r);
    if (autoEq) {
      const name = eqPresetFor(c), A = window.__ppApi;
      let eqs = {}; try { eqs = JSON.parse(localStorage.getItem('playerTrackEq')) || {}; } catch (e) {}
      if (name && A && A.setTrackEqPreset && (!eqs[dbId] || (old && old.ae))) { if (A.setTrackEqPreset(dbId, name)) c.ae = name; }
    } else if (old && old.ae) c.ae = old.ae;
    loadTags()[dbId] = c;
    const ok = saveTagStore();
    if (r.emb) { try { await saveEmb(dbId, r.emb); } catch (e) { console.warn('embedding not saved', e); } }
    return ok;
  }

  // ---------- What the tags mean ----------
  const PARENT_EQ = { 'Rock': 'rock', 'Electronic': 'electronic', 'Hip Hop': 'hiphop', 'Jazz': 'jazz', 'Classical': 'classical', 'Pop': 'pop', 'Folk, World, & Country': 'acoustic', 'Funk / Soul': 'pop', 'Blues': 'jazz', 'Reggae': 'bass', 'Latin': 'pop', 'Stage & Screen': 'classical', "Children's": 'pop', 'Brass & Military': 'classical', 'Non-Music': 'podcast' };
  const AS_EQ = { 'Pop music': 'pop', 'Hip hop music': 'hiphop', 'Rock music': 'rock', 'Heavy metal': 'rock', 'Punk rock': 'rock', 'Grunge': 'rock', 'Progressive rock': 'rock', 'Rock and roll': 'rock', 'Psychedelic rock': 'rock', 'Ska': 'rock', 'Rhythm and blues': 'pop', 'Soul music': 'pop', 'Funk': 'pop', 'Reggae': 'bass', 'Country': 'acoustic', 'Bluegrass': 'acoustic', 'Folk music': 'acoustic', 'Jazz': 'jazz', 'Swing music': 'jazz', 'Blues': 'jazz', 'Classical music': 'classical', 'Opera': 'classical', 'Electronic music': 'electronic', 'House music': 'electronic', 'Techno': 'electronic', 'Dubstep': 'electronic', 'Drum and bass': 'electronic', 'Electronica': 'electronic', 'Electronic dance music': 'electronic', 'Trance music': 'electronic', 'Disco': 'electronic', 'Ambient music': 'latenight' };
  function eqPresetFor(c) {
    if (c.mu != null && c.mu < 30) return 'podcast';
    const gp = (c.gp || [])[0]; if (gp && gp[1] >= 20 && PARENT_EQ[gp[0]]) return PARENT_EQ[gp[0]];
    const gn = (c.gn || [])[0]; if (gn && AS_EQ[gn[0]]) return AS_EQ[gn[0]];
    return null;
  }
  function vibes(c) {
    const h = c.hd || {}, md = {}, gn = {}; (c.md || []).forEach(x => md[x[0]] = x[1]); (c.gn || []).forEach(x => gn[x[0]] = x[1]);
    const g = (o, k) => o[k] || 0, ins = (c.in || []).map(x => x[0]), bpm = c.bpm || 0;
    const relaxed = h.relaxed != null ? h.relaxed : (g(md, 'Tender music') >= 25 || g(gn, 'Ambient music') >= 25 || g(gn, 'New-age music') >= 25 ? 70 : 0);
    const agg = h.aggressive != null ? h.aggressive : (g(md, 'Angry music') >= 25 ? 70 : 0);
    const party = h.party != null ? h.party : (g(md, 'Exciting music') >= 25 ? 65 : 0);
    const happy = h.happy != null ? h.happy : (g(md, 'Happy music') >= 25 ? 65 : 0);
    const sad = h.sad != null ? h.sad : (g(md, 'Sad music') >= 25 ? 65 : 0);
    const out = [], instr = c.v != null && c.v < 40, music = c.mu == null || c.mu >= 30;
    if (!music) { out.push('speech'); return out; }
    out.push(instr ? 'instrumental' : 'vocals');
    if (relaxed >= 60 || (bpm && bpm < 90 && agg < 40 && party < 50)) out.push('chill');
    if (party >= 55 || (h.danceable || 0) >= 65) out.push('party');
    if ((agg >= 55 || party >= 60 || (h.danceable || 0) >= 70) && bpm >= 115) out.push('workout');
    if (bpm >= 145 && agg >= 35) out.push('workout');
    if (happy >= 60) out.push('happy');
    if (sad >= 60) out.push('sad');
    if (agg >= 60) out.push('aggressive');
    if (instr && (relaxed >= 45 || (bpm && bpm < 115)) && agg < 40) out.push('focus');
    if (instr && relaxed >= 60 && (!bpm || bpm < 90)) out.push('sleep');
    if ((h.acoustic || 0) >= 60 || (ins.some(n => /acoustic|classicalguitar|piano|strings|cello|violin/.test(n)) && (h.electronic || 0) < 50 && !ins.includes('synthesizer'))) out.push('acoustic');
    if (bpm) out.push(bpm < 90 ? 'slow' : bpm < 120 ? 'mid-tempo' : bpm < 150 ? 'fast' : 'very-fast');
    return out;
  }
  const SMART = [
    { id: 'instr', name: 'Instrumentals', test: (c, v) => v.includes('instrumental') },
    { id: 'vocals', name: 'With vocals', test: (c, v) => v.includes('vocals') },
    { id: 'chill', name: 'Chill', test: (c, v) => v.includes('chill') },
    { id: 'party', name: 'Party / dance', test: (c, v) => v.includes('party') },
    { id: 'workout', name: 'Workout', test: (c, v) => v.includes('workout') },
    { id: 'happy', name: 'Happy', test: (c, v) => v.includes('happy') },
    { id: 'sad', name: 'Sad', test: (c, v) => v.includes('sad') },
    { id: 'focus', name: 'Focus', test: (c, v) => v.includes('focus') },
    { id: 'sleep', name: 'Sleep', test: (c, v) => v.includes('sleep') },
    { id: 'acoustic', name: 'Acoustic', test: (c, v) => v.includes('acoustic') },
    { id: 'slow', name: 'Slow (under 90 BPM)', test: (c, v) => v.includes('slow') },
    { id: 'mid', name: 'Mid-tempo (90-120 BPM)', test: (c, v) => v.includes('mid-tempo') },
    { id: 'fast', name: 'Fast (120-150 BPM)', test: (c, v) => v.includes('fast') },
    { id: 'rush', name: 'Very fast (150+ BPM)', test: (c, v) => v.includes('very-fast') },
    { id: 'speech', name: 'Speech / podcasts', test: (c, v) => v.includes('speech') }
  ];
  function tagWords(c) {
    const w = vibes(c);
    if (c.bpm) w.push('bpm' + c.bpm, c.bpm + 'bpm');
    if (c.key) w.push(c.key.toLowerCase(), c.ck.toLowerCase());
    (c.gp || []).forEach(x => w.push(x[0].toLowerCase())); (c.st || []).forEach(x => w.push(x[0].toLowerCase())); (c.gn || []).forEach(x => w.push(x[0].toLowerCase()));
    (c.md || []).forEach(x => w.push(x[0].toLowerCase())); (c.in || []).forEach(x => w.push(x[0].toLowerCase()));
    Object.entries(c.hd || {}).forEach(([id, p]) => { if (p >= 60) w.push(id.replace(/^mood_/, '').replace(/_/g, ' ')); });
    Object.values(c.hm || {}).forEach(a => a.forEach(x => w.push(x[0].toLowerCase().replace(/_/g, ' '))));
    return w.join(' ');
  }
  // Used by the search box in index.html: tag words + lyrics/subtitle text of a track.
  const strip = s => String(s).replace(/\[\d+:\d+(?:[.:]\d+)?\]/g, ' ');
  let txtAt = 0, txtSig = '', txtTags = new Map(), txtLyr = new Map(), txtTagVer = -1;
  window.__ppTagText = id => {
    const now = Date.now();
    if (now - txtAt > 1500 || txtTagVer !== tagVer) {
      txtAt = now;
      let l1 = '', l2 = ''; try { l1 = localStorage.getItem('playerLyricsV1') || ''; l2 = localStorage.getItem('playerSubtitles') || ''; } catch (e) {}
      const sig = l1.length + ':' + l2.length;
      if (sig !== txtSig) {
        txtSig = sig; txtLyr.clear();
        try { const o = JSON.parse(l1) || {}; for (const k in o) txtLyr.set(k, strip(o[k]).toLowerCase().slice(0, 8000)); } catch (e) {}
        try { const o = JSON.parse(l2) || {}; for (const k in o) { const v = o[k], cues = Array.isArray(v) ? v.map(c => c.text) : (v && v.c ? v.c.map(c => c[2]) : []); txtLyr.set(k, ((txtLyr.get(k) || '') + ' ' + cues.join(' ').toLowerCase()).slice(0, 8000)); } } catch (e) {}
      }
      if (txtTagVer !== tagVer) { txtTagVer = tagVer; txtTags.clear(); }
    }
    const k = String(id);
    let t = txtTags.get(k); if (t == null) { const c = loadTags()[k]; t = c ? tagWords(c) : ''; txtTags.set(k, t); }
    return t + ' ' + (txtLyr.get(k) || '');
  };

  // ---------- "More like this" ----------
  const camOk = (a, b) => {
    if (!a || !b) return false; const na = parseInt(a, 10), nb = parseInt(b, 10), la = a.slice(-1), lb = b.slice(-1);
    return na === nb || (la === lb && (Math.abs(na - nb) === 1 || Math.abs(na - nb) === 11));
  };
  const bpmNear = (a, b, tol) => a && b && [1, 2, 0.5].some(m => Math.abs(a * m - b) / b <= tol);
  async function similarTo(curIdx, mode) {
    const A = window.__ppApi, tr = A.tracks(), tags = loadTags();
    const embs = await Promise.all(tr.map(t => loadEmb(t.dbId).catch(() => null)));
    if (!embs[curIdx]) throw new Error('Tag this track first.');
    const have = tr.map((_, i) => i).filter(i => embs[i]);
    const mean = new Float32Array(1280); have.forEach(i => { for (let c = 0; c < 1280; c++) mean[c] += embs[i][c] / have.length; });
    const norm = i => { const v = new Float32Array(1280); let n = 0; for (let c = 0; c < 1280; c++) { v[c] = embs[i][c] - mean[c]; n += v[c] * v[c]; } n = Math.sqrt(n) || 1; for (let c = 0; c < 1280; c++) v[c] /= n; return v; };
    const q = norm(curIdx), cur = tags[tr[curIdx].dbId] || {};
    let list = have.filter(i => i !== curIdx).map(i => { const v = norm(i); let s = 0; for (let c = 0; c < 1280; c++) s += q[c] * v[c]; return { i, s, c: tags[tr[i].dbId] || {} }; });
    if (mode === 'tempo') list = list.filter(o => cur.bpm && bpmNear(o.c.bpm, cur.bpm, 0.08));
    if (mode === 'mix') {
      list = list.filter(o => cur.bpm && bpmNear(o.c.bpm, cur.bpm, 0.06) && camOk(cur.ck, o.c.ck));
      list.forEach(o => { o.s += 0.3 - Math.abs(o.c.bpm - cur.bpm) / cur.bpm; });
    }
    return list.sort((a, b) => b.s - a.s).map(o => o.i);
  }

  // ---------- Lyrics / subtitles with Whisper (transformers.js, runs on-device) ----------
  // The library and the model files come from jsDelivr / Hugging Face on first use and are cached by the browser.
  const TF_URL = 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.7.2/dist/transformers.min.js';
  // English-only models (".en") are noticeably more accurate than the multilingual ones at the same size. The third item marks them:
  // en = no language/task options, gpuDec = decoder precision on WebGPU (q4 is smaller but a little less accurate).
  const WH = {
    base_en: ['Xenova/whisper-base.en', 'English Base (~75 MB, recommended)', { en: 1, gpuDec: 'fp32' }],
    parakeet: ['Xenova/whisper-base.en', 'English Parakeet TDT (~650 MB, best accuracy, app only)', { en: 1, pk: 1, big: 650, noGpu: 1 }],
    distil_en: ['onnx-community/distil-small.en', 'English Distil-Small (~170 MB, near Small accuracy, 2x faster)', { en: 1 }],
    small_en: ['Xenova/whisper-small.en', 'English Small (~250 MB, most accurate, slow)', { en: 1 }],
    tiny_en: ['Xenova/whisper-tiny.en', 'English Tiny (~40 MB, fastest)', { en: 1, gpuDec: 'fp32' }],
    tiny: ['Xenova/whisper-tiny', 'Any language: Tiny (~40 MB)'],
    base: ['Xenova/whisper-base', 'Any language: Base (~75 MB)'],
    small: ['Xenova/whisper-small', 'Any language: Small (~250 MB)'],
    distil_med_en: ['distil-whisper/distil-medium.en', 'English Distil-Medium (~400 MB, very accurate, big phones)', { en: 1, big: 400, noGpu: 1 }],
    medium_en: ['Xenova/whisper-medium.en', 'English Medium (~750 MB, most accurate, flagship phones, slow)', { en: 1, big: 750, noGpu: 1 }],
    turbo: ['onnx-community/whisper-large-v3-turbo', 'Any language: Large-v3 Turbo (~1 GB, experimental, flagship phones)', { big: 1000, mel: 128, noGpu: 1 }]
  };
  const whEn = k => !!(WH[k] && WH[k][2] && WH[k][2].en);
  const whPk = k => !!(WH[k] && WH[k][2] && WH[k][2].pk);
  const whOk = k => !!WH[k] && (!whPk(k) || NATIVE);   // Parakeet only exists in the app
  const LANGS = [['', 'Auto-detect'], ['english', 'English'], ['spanish', 'Spanish'], ['french', 'French'], ['german', 'German'], ['italian', 'Italian'], ['portuguese', 'Portuguese'], ['dutch', 'Dutch'], ['russian', 'Russian'], ['polish', 'Polish'], ['turkish', 'Turkish'], ['arabic', 'Arabic'], ['hindi', 'Hindi'], ['japanese', 'Japanese'], ['korean', 'Korean'], ['chinese', 'Chinese'], ['indonesian', 'Indonesian'], ['swedish', 'Swedish'], ['ukrainian', 'Ukrainian']];
  let tfMod = null, asr = null, asrId = '';
  // Optional: run Whisper on the phone's GPU (WebGPU). Off unless ticked in the Whisper panel; any failure drops back to the CPU for the rest of the session.
  let wGpuFailed = false;
  const wGpu = () => { try { return !wGpuFailed && !!navigator.gpu && localStorage.getItem('ppvWGpu') === '1'; } catch (e) { return false; } };
  async function getAsr(id, status) {
    const ent0 = Object.values(WH).find(v => v[0] === id), dev = wGpu() && !(ent0 && ent0[2] && ent0[2].noGpu) ? 'webgpu' : 'wasm', key = id + '|' + dev;   // the biggest models are too large for the GPU path
    if (asr && asrId === key) return asr;
    if (asr) { try { await asr.dispose(); } catch (e) {} asr = null; asrId = ''; }
    if (!tfMod) { status('Loading Whisper…'); tfMod = await import(TF_URL); }
    const cb = p => { if (p && p.status === 'progress' && p.file) status('Downloading ' + p.file.split('/').pop() + ' ' + Math.round(p.progress || 0) + '%'); else if (p && p.status === 'ready') status('Whisper ready.'); };
    if (dev === 'webgpu') {
      try {
        const ent = Object.values(WH).find(v => v[0] === id), dd = (ent && ent[2] && ent[2].gpuDec) || 'q4';
        asr = await tfMod.pipeline('automatic-speech-recognition', id, { device: 'webgpu', dtype: { encoder_model: 'fp32', decoder_model_merged: dd }, progress_callback: cb });
        asrId = key; return asr;
      } catch (e) { console.warn('Whisper on the GPU failed, using the CPU', e); wGpuFailed = true; status('GPU not available here, using the CPU…'); }
    }
    asr = await tfMod.pipeline('automatic-speech-recognition', id, { progress_callback: cb });
    asrId = id + '|wasm'; return asr;
  }
  const pad2 = n => String(n).padStart(2, '0');
  const toLrc = cues => cues.map(c => '[' + pad2(Math.floor(c.start / 60)) + ':' + (c.start % 60).toFixed(2).padStart(5, '0') + ']' + c.text).join('\n');
  const srtT = s => { const ms = Math.round(s * 1000); return pad2(Math.floor(ms / 3600000)) + ':' + pad2(Math.floor(ms / 60000) % 60) + ':' + pad2(Math.floor(ms / 1000) % 60) + ',' + String(ms % 1000).padStart(3, '0'); };
  const toSrt = cues => cues.map((c, i) => (i + 1) + '\n' + srtT(c.start) + ' --> ' + srtT(c.end) + '\n' + c.text + '\n').join('\n');
  // Whisper invents text over silence and music. Drop the usual junk and runs of the same line.
  function cleanCues(raw, dur, xx) {
    const out = [];
    for (const c of raw) {
      let t = String(c.text || '').replace(/[♪♫]+/g, ' ').replace(/\[[^\]]*(music|silence|applause|laughter)[^\]]*\]|\([^)]*(music|silence|applause|laughter)[^)]*\)/gi, ' ').replace(/\s+/g, ' ').trim();
      if (t.length < 2 || /^(thanks for watching|thank you\.?$|subtitles by|subtitle by|amara\.org|please subscribe)/i.test(t)) continue;
      out.push({ start: c.start, end: c.end, text: t });
    }
    // A line sung 3+ times in a row is real in a lot of songs ("hey, hey, hey"). It is only dropped when it looks like Whisper looping over
    // silence: the audio under it is quiet, the lines overlap in time, or the run is very long.
    const res = [], ref = xx ? rpRef(xx) : 0; let run = 0;
    for (let i = 0; i < out.length; i++) {
      run = i && out[i].text.toLowerCase() === out[i - 1].text.toLowerCase() ? run + 1 : 1;
      if (run >= 3) {
        const c = out[i], pv = out[i - 1], e = c.end > c.start ? c.end : c.start + 3, pe = pv.end > pv.start ? pv.end : pv.start + 3;
        const sung = xx && ref > 0 ? rpRms(xx, c.start, e) >= ref * 0.2 : e - c.start >= 0.4;
        if (!(run <= 10 && c.start >= pe - 0.15 && sung)) continue;
      }
      res.push(out[i]);
    }
    res.forEach((c, i) => { const nx = res[i + 1]; if (!(c.end > c.start)) c.end = nx ? Math.min(nx.start, c.start + 6) : c.start + 3; if (dur) c.end = Math.min(c.end, dur); });
    return res;
  }
  // o: {size, lang, task, clean, model, strength, lv}. Returns [{start,end,text}].
  // ---------- Native Whisper (Android app) ----------
  // int8 Whisper on the phone's CPU cores through native ONNX Runtime, with KV-cache decoding in Java, instead of single-threaded WebAssembly.
  // JavaScript only prepares the log-mel features, walks the audio window by window and turns token ids back into text.
  // Any failure drops back to the web version for the rest of the session. To switch it off: localStorage.ppvWNative = '0'.
  const WHN = { tiny: 'wh_tiny', base: 'wh_base', small: 'wh_small', tiny_en: 'wh_tiny_en', distil_med_en: 'wh_distil_med_en', medium_en: 'wh_medium_en', turbo: 'wh_turbo', base_en: 'wh_base_en', small_en: 'wh_small_en', distil_en: 'wh_distil_en' };
  const WH_CODE = { english: 'en', spanish: 'es', french: 'fr', german: 'de', italian: 'it', portuguese: 'pt', dutch: 'nl', russian: 'ru', polish: 'pl', turkish: 'tr', arabic: 'ar', hindi: 'hi', japanese: 'ja', korean: 'ko', chinese: 'zh', indonesian: 'id', swedish: 'sv', ukrainian: 'uk' };
  let wNativeFailed = false;
  const whNativeOn = () => { try { return !!NATIVE && !wNativeFailed && localStorage.getItem('ppvWNative') !== '0'; } catch (e) { return !!NATIVE && !wNativeFailed; } };
  // Phone GPU/NPU for subtitles (app only): the encoder (the heavy part) can run through NNAPI. It needs the float encoder file, not the int8 one.
  const whNativeGpu = size => { try { return !!NATIVE && localStorage.getItem('ppvWGpu') === '1' && !(WH[size] && WH[size][2] && (WH[size][2].noGpu || WH[size][2].pk)); } catch (e) { return false; } };
  async function whNativeFiles(size, status, gpu) {
    const base = 'https://huggingface.co/' + WH[size][0] + '/resolve/main/onnx/';
    for (const [k, f] of [[WHN[size] + '_enc', 'encoder_model_quantized.onnx'], [WHN[size] + '_dec', 'decoder_model_merged_quantized.onnx']].concat(gpu ? [[WHN[size] + '_encf', 'encoder_model.onnx']] : [])) {
      if ((await NP.exists({ id: k })).ready) continue;
      status('Downloading ' + f + '…'); await nativeFetch(k, base + f, status);
    }
  }
  const whCfg = {};
  async function whConfig(size) {                                       // token ids come from the model's own generation_config.json
    if (whCfg[size]) return whCfg[size];
    const g = await (await fetch('https://huggingface.co/' + WH[size][0] + '/resolve/main/generation_config.json')).json();
    const c = { sot: g.decoder_start_token_id, eot: g.eos_token_id, noTs: g.no_timestamps_token_id, suppress: g.suppress_tokens || [], beginSuppress: g.begin_suppress_tokens || [], lang: g.lang_to_id || null, task: g.task_to_id || null };
    if (!(c.sot > 0 && c.eot > 0 && c.noTs > 0)) throw new Error('unusable generation_config');
    c.tsBegin = c.noTs + 1;
    return (whCfg[size] = c);
  }
  let whTok = null, whTokId = '';
  async function whTokenizer(repo, status) {
    if (whTok && whTokId === repo) return whTok;
    if (!tfMod) { status('Loading text tools…'); tfMod = await import(TF_URL); }
    whTok = await tfMod.AutoTokenizer.from_pretrained(repo); whTokId = repo; return whTok;
  }
  let whBankCache = null, whFft = null, whWin = null;
  function whBank(nMel) {                                               // Slaney mel filters, exactly as Whisper's feature extractor builds them
    if (whBankCache && whBankCache.n === nMel) return whBankCache;
    const sr = 16000, nF = 201, f2m = f => f < 1000 ? 3 * f / 200 : 15 + Math.log(f / 1000) * 27 / Math.log(6.4);
    const m2f = m => m < 15 ? 200 * m / 3 : 1000 * Math.exp(Math.log(6.4) / 27 * (m - 15));
    const m0 = f2m(0), m1 = f2m(sr / 2), fr = new Float64Array(nMel + 2);
    for (let i = 0; i < nMel + 2; i++) fr[i] = m2f(m0 + (m1 - m0) * i / (nMel + 1));
    const w = new Float32Array(nMel * nF), lo = new Int32Array(nMel), hi = new Int32Array(nMel);
    for (let m = 0; m < nMel; m++) {
      const d1 = fr[m + 1] - fr[m], d2 = fr[m + 2] - fr[m + 1], en = 2 / (fr[m + 2] - fr[m]); let l = nF, h = -1;
      for (let k = 0; k < nF; k++) {
        const f = k * (sr / 2) / (nF - 1), v = Math.max(0, Math.min((f - fr[m]) / d1, (fr[m + 2] - f) / d2)) * en;
        w[m * nF + k] = v; if (v > 0) { if (k < l) l = k; h = k; }
      }
      lo[m] = l; hi[m] = h;
    }
    return (whBankCache = { n: nMel, w, lo, hi });
  }
  function whMel(x, start, end, nMel) {                                 // log-mel [nMel, 3000] of the 30 s that start at sample `start` (zero-padded)
    const N = 480000, M = 400, H = 160, NFR = 3000, K = 201, bk = whBank(nMel);
    if (!whFft) { whFft = makeFFT(M); whWin = new Float64Array(M); for (let i = 0; i < M; i++) whWin[i] = 0.5 - 0.5 * Math.cos(2 * Math.PI * i / M); }
    const a = new Float32Array(N), e = Math.min(end, start + N, x.length); if (e > start) a.set(x.subarray(start, e));
    const at = j => a[j < 0 ? -j : j >= N ? 2 * (N - 1) - j : j];       // reflect padding, like torch.stft(center=True)
    const re = new Float64Array(M), im = new Float64Array(M), pw = new Float64Array(K), out = new Float32Array(nMel * NFR);
    let mx = -Infinity;
    for (let f = 0; f < NFR; f++) {
      const b0 = f * H - M / 2;
      for (let j = 0; j < M; j++) { re[j] = at(b0 + j) * whWin[j]; im[j] = 0; }
      whFft(re, im);
      for (let k = 0; k < K; k++) pw[k] = re[k] * re[k] + im[k] * im[k];
      for (let m = 0; m < nMel; m++) {
        let sum = 0; const o = m * K, h = bk.hi[m];
        for (let k = bk.lo[m]; k <= h; k++) sum += bk.w[o + k] * pw[k];
        const v = Math.log10(Math.max(sum, 1e-10)); out[m * NFR + f] = v; if (v > mx) mx = v;
      }
    }
    const fl = mx - 8;
    for (let i = 0; i < out.length; i++) { const v = out[i] < fl ? fl : out[i]; out[i] = (v + 4) / 4; }
    return out;
  }
  function whParse(toks, tsB) {                                         // token ids -> [{s, e, ids}] (e is null if the window ended mid-line)
    const segs = []; let s = null, ids = [];
    for (const t of toks) {
      if (t >= tsB) {
        const ts = (t - tsB) * 0.02;
        if (s === null) { s = ts; ids = []; }
        else if (ids.length) { segs.push({ s, e: ts, ids }); s = null; ids = []; }
        else s = ts;
      } else { if (s === null) s = segs.length ? segs[segs.length - 1].e : 0; ids.push(t); }
    }
    if (s !== null && ids.length) segs.push({ s, e: null, ids });
    return segs;
  }
  async function whisperNative(x, regs, o, status) {
    const size = o.size, k = WHN[size], nMel = (WH[size][2] && WH[size][2].mel) || 80;   // Large-v3 uses 128 mel bins, the rest 80
    status('Preparing native Whisper…');
    const [c, tok] = await Promise.all([whConfig(size), whTokenizer(WH[size][0], status)]);
    const gpuOn = whNativeGpu(size);
    try { await whNativeFiles(size, status, gpuOn); } catch (e) { if (!gpuOn) throw e; console.warn('float encoder download failed, using the CPU', e); await whNativeFiles(size, status, false); }
    const hasF = gpuOn && (await NP.exists({ id: k + '_encf' })).ready;
    const code = o.lang ? WH_CODE[o.lang] : '';
    let langId = c.lang && code ? (c.lang['<|' + code + '|>'] || 0) : 0;   // 0 = let the model detect it on the first window, then keep it
    const langIds = c.lang ? Object.values(c.lang) : [], taskId = c.task ? (o.task === 'translate' ? c.task.translate : c.task.transcribe) : 0;
    const total = regs.reduce((n, r) => n + r[1] - r[0], 0) || 1, raw = []; let done = 0, gpuNote = '';
    for (const [ra, rb] of regs) {
      let seek = ra;
      while (seek < rb - 0.3) {
        const t0 = performance.now(), wl = Math.min(30, rb - seek);
        status('Transcribing… ' + Math.round((done + seek - ra) / total * 100) + '%'); await tick();
        const mel = whMel(x, Math.floor(seek * 16000), Math.floor((seek + wl) * 16000), nMel);
        const r = await NP.whisperRun({ enc: k + '_enc', dec: k + '_dec', mel: await toB64(mel), dims: [1, nMel, 3000], sot: c.sot, eot: c.eot, noTs: c.noTs, tsBegin: c.tsBegin, useLang: !!c.lang, lang: langId, langIds: langId ? [] : langIds, task: taskId, suppress: c.suppress, beginSuppress: c.beginSuppress, timestamps: true, maxTokens: 224, encFloat: hasF ? k + '_encf' : undefined });
        if (r.lang) langId = r.lang;
        if (hasF && !gpuNote) {                                          // first window tells us where the encoder really ran
          gpuNote = r.accel === 'GPU' ? 'Subtitles: encoder is running on the phone GPU/NPU.' : 'The phone GPU was not faster than the CPU here, so the CPU is used. The GPU option was turned off.';
          if (r.accel !== 'GPU') { try { localStorage.setItem('ppvWGpu', '0'); const cb = document.getElementById('ppv-wgpu'); if (cb) cb.checked = false; await NP.remove({ id: k + '_encf' }); } catch (e) {} }
          status(gpuNote); await tick();
        }
        const segs = whParse(r.tokens || [], c.tsBegin), complete = segs.filter(g => g.e != null);
        let adv = wl;                                                   // next window starts where the last finished line ended, so no line is cut in half
        if (complete.length) { const le = complete[complete.length - 1].e; if (le >= 1 && le < wl - 0.5) adv = le; }
        for (const g of (adv < wl ? complete : segs)) {
          const text = tok.decode(g.ids, { skip_special_tokens: true });
          if (text && text.trim()) raw.push({ start: seek + g.s, end: g.e == null ? 0 : seek + g.e, text });
        }
        seek += adv;
        if (!o.quick) await ease(performance.now() - t0, 0, 'whn', wl);   // quick: one spoken sentence for Bloop, no rest needed
      }
      done += rb - ra;
    }
    return raw;
  }

