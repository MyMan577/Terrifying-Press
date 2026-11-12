  // ---------- Subtitle mask: use the lyrics/subtitles to know where singing is ----------
  // Solos, breaks and other non-vocal sound that leaks into the Vocals stem get faded out of it, and the removed sound is ADDED to
  // Instrumental (and Other) so nothing is lost. Cue starts are trusted; cue ends are not, because online LRC lyrics end a line
  // exactly when the next one starts (so a solo between two lines would look like singing). The end is estimated from the text instead.
  const MASKS = [null, { pre: 0.35, post: 0.6, fade: 0.12, floor: 0.15 }, { pre: 0.25, post: 0.4, fade: 0.08, floor: 0.03 }, { pre: 0.15, post: 0.25, fade: 0.05, floor: 0 }];   // Gentle, Normal, Strong
  const NOVOCAL = /^[\s\[\]()\u266a\u266b*\-\u2013\u2014]*(instrumental|solo|guitar solo|music|interlude|intro|outro|break)?[\s\[\]()\u266a\u266b*\-\u2013\u2014]*$/i;
  function sungSecs(text) {                                          // rough time a line takes to sing, with room for held notes
    const t = String(text || '').trim(), cjk = (t.match(/[\u3040-\u30ff\u3400-\u9fff\uac00-\ud7af]/g) || []).length;
    return 0.8 + 0.4 * Math.max(t.split(/\s+/).filter(Boolean).length, cjk / 2, t.length / 7);
  }
  // Returns { spans: [[startSec, endSec], ...] } or { skip: 'why' } when the lyrics can't be trusted to cover the whole song.
  function subtitleSpans(dbId, level, dur, tag, ov) {
    const m = MASKS[level]; if (!m) return { skip: '' };
    let e; try { e = (JSON.parse(localStorage.getItem('playerSubtitles')) || {})[dbId]; } catch (x) {}
    const raw = ov && ov.length ? ov.map(q => [q.start, q.end, q.text, q.m]) : e && (Array.isArray(e) ? e.map(q => [q.start, q.end, q.text]) : e.c);
    if (!raw || raw.length < 3) return { skip: ' Subtitle mute skipped: this track has no synced lyrics or subtitles.' };
    const off = !ov && e && !Array.isArray(e) && isFinite(+e.o) ? +e.o : 0;     // positive offset = lines appear later (re-timed cues are already in media time)
    const trusted = !!(e && !Array.isArray(e) && /^whisper/i.test(e.n || ''));   // Whisper ends are measured, online ones are just "next line starts"
    const sp = [];
    for (const c of raw) {
      const s0 = +c[0], e0 = +c[1], txt = String(c[2] || '');
      if (!isFinite(s0) || !txt.trim() || NOVOCAL.test(txt)) continue;
      const len = sungSecs(txt), cap = trusted || c[3] ? len * 2 + 1.5 : len * 1.5 + 1;   // c[3]: line was re-timed from Whisper's own timestamps
      const end = e0 > s0 ? Math.min(e0, s0 + cap) : s0 + cap;
      sp.push([Math.max(0, s0 + off - m.pre), end + off + m.post]);
    }
    sp.sort((a, b) => a[0] - b[0]);
    const out = [];
    for (const q of sp) { const l = out[out.length - 1]; if (l && q[0] <= l[1] + 0.2) l[1] = Math.max(l[1], q[1]); else out.push([q[0], q[1]]); }
    if (!out.length) return { skip: ' Subtitle mute skipped: no sung lines found.' };
    const covered = out.reduce((n, q) => n + q[1] - q[0], 0), lastEnd = out[out.length - 1][1], firstStart = out[0][0];
    // Safety: if the lyrics stop early or start late, muting outside them would cut real singing. Use the tagger's first/last vocal time when known.
    if (tag && tag.lv != null && tag.lv > lastEnd + 3) return { skip: ' Subtitle mute skipped: the lyrics end before the singing does.' };
    if (tag && tag.fv != null && tag.fv < firstStart - 3) return { skip: ' Subtitle mute skipped: the singing starts before the lyrics do.' };
    if (dur && (covered < dur * 0.15 || (!(tag && tag.lv != null) && lastEnd < dur * 0.6))) return { skip: ' Subtitle mute skipped: the lyrics look incomplete.' };
    return { spans: out };
  }
  // Gain follows the spans with short fades. process(L, R, extra): scales the vocal chunk in place and adds what it removed to every [L, R] in extra.
  function makeMask(spans, level) {
    const m = MASKS[level]; if (!m || !spans || !spans.length) return null;
    const A = spans.map(q => Math.round(q[0] * SR)), B = spans.map(q => Math.round(q[1] * SR)), step = (1 - m.floor) / Math.max(1, Math.round(m.fade * SR));
    let pos = 0, si = 0, gain = m.floor;
    return {
      process(Lc, Rc, extra) {
        const n = Math.min(Lc.length, Rc.length), ex = (extra || []).filter(q => q && q[0] && q[0].length >= n && q[1].length >= n);
        for (let i = 0; i < n; i++, pos++) {
          while (si < A.length && pos >= B[si]) si++;
          const target = si < A.length && pos >= A[si] ? 1 : m.floor;
          gain += target > gain ? Math.min(step, target - gain) : -Math.min(step, gain - target);
          if (gain < 1) {
            const l = Lc[i], r = Rc[i], k = 1 - gain; Lc[i] = l * gain; Rc[i] = r * gain;
            for (const q of ex) { q[0][i] += l * k; q[1][i] += r * k; }
          }
        }
      }
    };
  }
  function maskChunks(mask, names, chunks) {                          // multi-stem models: chunks line up with names
    if (!mask) return; const vi = names.indexOf('Vocals'); if (vi < 0 || !chunks[vi]) return;
    mask.process(chunks[vi][0], chunks[vi][1], ['Instrumental', 'Other'].map(n => names.indexOf(n)).filter(i => i >= 0).map(i => chunks[i]));
  }
  // Re-time lyric lines (e.g. online LRC) against measured cues (e.g. Whisper): each line takes the start/end of the best-matching measured cue within 20 s.
  function alignLines(cues, ref) {
    const nz = t => String(t || '').toLowerCase().replace(/[^\p{L}\p{N}\s]+/gu, ' ').split(/\s+/).filter(Boolean);
    const rw = ref.map(r => ({ r, w: new Set(nz(r.text)) }));
    return cues.map(c => {
      const w = nz(c.text); if (!w.length) return c; let best = null, bs = 0;
      for (const q of rw) {
        if (Math.abs(q.r.start - c.start) > 20 || !q.w.size) continue;
        let hit = 0; for (const x of w) if (q.w.has(x)) hit++;
        const sc = hit / (w.length + q.w.size - hit); if (sc > bs) { bs = sc; best = q.r; }
      }
      return best && bs >= 0.35 ? { start: best.start, end: best.end > best.start ? best.end : c.end, text: c.text, m: true } : c;
    });
  }

  // Whisper first: lyrics that were not made by Whisper (online LRC, loaded files) have unreliable timing, so Whisper listens to the song
  // (vocals only) and each lyric line takes the start/end of the Whisper line it matches. Nothing is saved over the user's lyrics.
  // Returns { cues, matched, total } in media time, or null when there is nothing to re-time (no lyrics, or Whisper already made them).
  async function alignedCues(t, o, status) {
    let e; try { e = (JSON.parse(localStorage.getItem('playerSubtitles')) || {})[t.dbId]; } catch (x) {}
    if (!e || (!Array.isArray(e) && /^whisper/i.test(e.n || ''))) return null;
    const off = Array.isArray(e) || !isFinite(+e.o) ? 0 : +e.o;
    const raw = (Array.isArray(e) ? e.map(q => [q.start, q.end, q.text]) : e.c || []).map(q => ({ start: +q[0] + off, end: +q[1] + off, text: String(q[2] || '') })).filter(q => isFinite(q.start) && q.text.trim());
    if (raw.length < 3) return null;
    const sig = (Array.isArray(e) ? '' : e.n || '') + '|' + raw.length + '|' + raw[0].start.toFixed(2) + '|' + raw[raw.length - 1].start.toFixed(2);
    let cache = {}; try { cache = JSON.parse(localStorage.getItem('ppvAlign')) || {}; } catch (x) {}
    const hit = cache[t.dbId];
    if (hit && hit.sig === sig) { const cues = hit.c.map(q => ({ start: q[0], end: q[1], text: q[2], m: !!q[3] })); return { cues, matched: cues.filter(q => q.m).length, total: cues.length, cached: true }; }
    const sz0 = ls0('ppvWSize'), m0 = sz0 && WH[sz0] && WH[sz0][2], size = whOk(sz0) && m0 && !m0.big ? sz0 : 'base_en';   // never pops a big-download prompt mid-split
    const lg = ls0('ppvWLang');
    let ref;
    try { status('Whisper is checking where the lines really are…'); ref = await transcribeRun(t, { size, lang: whEn(size) ? '' : (lg === null ? 'english' : lg), task: 'transcribe', clean: true, acc: 0, strength: o.strength, lv: o.lv }, status); }
    finally { if (asr) { try { await asr.dispose(); } catch (x) {} asr = null; asrId = ''; } }   // give the memory back before the real split
    const cues = alignLines(raw, (ref || []).map(q => ({ start: q.start, end: q.end, text: q.text })));
    const out = { cues, matched: cues.filter(q => q.m).length, total: cues.length };
    try { cache[t.dbId] = { sig, c: cues.map(q => [+q.start.toFixed(2), +q.end.toFixed(2), q.text, q.m ? 1 : 0]) }; localStorage.setItem('ppvAlign', JSON.stringify(cache)); } catch (x) {}
    return out;
  }

  function makeEncoder(gate) {
    const mp3 = !!window.lamejs, enc = mp3 ? new lamejs.Mp3Encoder(2, SR, 192) : null, out = [];
    let cl = new Int16Array(0), cr = new Int16Array(0), n = 0;
    const cat = (a, b) => { if (!a.length) return b; const o = new Int16Array(a.length + b.length); o.set(a); o.set(b, a.length); return o; };
    const blk = (l, r) => { const b = enc.encodeBuffer(l, r); if (b.length) out.push(new Uint8Array(b)); };
    return {
      push(Lc, Rc) {
        if (gate) gate.process(Lc, Rc);
        const l = i16(Lc), r = i16(Rc); n += l.length;
        if (!mp3) { out.push(l, r); return; }
        const a = cat(cl, l), b = cat(cr, r), e = a.length - a.length % 1152;
        for (let i = 0; i < e; i += 1152) blk(a.subarray(i, i + 1152), b.subarray(i, i + 1152));
        cl = a.slice(e); cr = b.slice(e);
      },
      finish() {
        if (mp3) { if (cl.length) blk(cl, cr); const f = enc.flush(); if (f.length) out.push(new Uint8Array(f)); return { blob: new Blob(out, { type: 'audio/mpeg' }), ext: 'mp3' }; }
        const dv = new DataView(new ArrayBuffer(44 + n * 4)); const w = (o, s) => [...s].forEach((c, i) => dv.setUint8(o + i, c.charCodeAt(0)));
        w(0, 'RIFF'); dv.setUint32(4, 36 + n * 4, true); w(8, 'WAVEfmt '); dv.setUint32(16, 16, true); dv.setUint16(20, 1, true); dv.setUint16(22, 2, true);
        dv.setUint32(24, SR, true); dv.setUint32(28, SR * 4, true); dv.setUint16(32, 4, true); dv.setUint16(34, 16, true); w(36, 'data'); dv.setUint32(40, n * 4, true);
        let o = 44; for (let k = 0; k < out.length; k += 2) { const l = out[k], r = out[k + 1]; for (let i = 0; i < l.length; i++, o += 4) { dv.setInt16(o, l[i], true); dv.setInt16(o + 2, r[i], true); } }
        return { blob: new Blob([dv], { type: 'audio/wav' }), ext: 'wav' };
      }
    };
  }
  function encode(ch) { const e = makeEncoder(); e.push(ch[0], ch[1]); return e.finish(); }
  function addSplit(files, info) {        // split tracks: kept out of "All tracks", grouped under "Split tracks"
    const A = window.__ppApi;
    if (A && A.addStemFiles) A.addStemFiles(files, info); else addToLibrary(files);
  }
  // Fast path: remux instead of re-record. The original video packets are copied as-is (no decode, no re-encode),
  // and only the stem's audio is added. Takes a second or two per stem instead of the full song length.
  const MB = 'https://cdn.jsdelivr.net/npm/mediabunny@1.65.0/dist/bundles/mediabunny.min.mjs';
  let mbLib = null, videoBlobFor = null, videoBlobCache = null;
  async function muxVideo(videoUrl, audioBlob, onFrac) {
    try { return await muxVideoFast(videoUrl, audioBlob, onFrac); }
    catch (e) { console.warn('Fast video mux failed, using real-time re-record:', e); return muxVideoSlow(videoUrl, audioBlob, onFrac); }
  }
  async function muxVideoFast(videoUrl, audioBlob, onFrac) {
    const mb = mbLib || (mbLib = await import(MB));
    if (videoBlobFor !== videoUrl) { videoBlobCache = await (await fetch(videoUrl)).blob(); videoBlobFor = videoUrl; }   // fetched once, reused for every stem
    const vin = new mb.Input({ source: new mb.BlobSource(videoBlobCache), formats: mb.ALL_FORMATS });
    const vtrack = await vin.getPrimaryVideoTrack(); if (!vtrack) throw new Error('No video track.');
    const vcodec = vtrack.codec, vcfg = await vtrack.getDecoderConfig();
    const fmt = vcodec === 'vp8' ? new mb.WebMOutputFormat() : new mb.Mp4OutputFormat({ fastStart: 'in-memory' });
    if (!fmt.getSupportedCodecs().includes(vcodec)) throw new Error('Video codec ' + vcodec + ' not supported by the container.');
    const ain = new mb.Input({ source: new mb.BlobSource(audioBlob), formats: mb.ALL_FORMATS });
    const atrack = await ain.getPrimaryAudioTrack(); if (!atrack) throw new Error('No audio in stem.');
    const out = new mb.Output({ format: fmt, target: new mb.BufferTarget() });
    const vsrc = new mb.EncodedVideoPacketSource(vcodec); out.addVideoTrack(vsrc);
    const dur = await vtrack.computeDuration();
    let asrc, copyAudio = fmt.getSupportedCodecs().includes(atrack.codec);          // mp3 stems go straight into mp4 untouched; wav gets encoded
    let encAudio = null;
    if (copyAudio) { asrc = new mb.EncodedAudioPacketSource(atrack.codec); }
    else {
      const codec = await mb.getFirstEncodableAudioCodec(fmt.getSupportedAudioCodecs ? fmt.getSupportedAudioCodecs() : ['aac', 'opus'], { numberOfChannels: 2, sampleRate: SR });
      if (!codec) throw new Error('No audio encoder available.');
      asrc = new mb.AudioBufferSource({ codec, bitrate: 192000 });
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      try { encAudio = await ctx.decodeAudioData(await audioBlob.arrayBuffer()); } finally { ctx.close && ctx.close(); }
    }
    out.addAudioTrack(asrc);
    await out.start();
    const vp = (async () => {
      const sink = new mb.EncodedPacketSink(vtrack); let first = true;
      for await (const pk of sink.packets()) {
        await vsrc.add(pk, first ? { decoderConfig: vcfg } : undefined); first = false;
        if (onFrac && dur) onFrac(Math.min(1, pk.timestamp / dur) * 0.9);
      }
      vsrc.close();
    })();
    const ap = (async () => {
      if (copyAudio) {
        const acfg = await atrack.getDecoderConfig(), sink = new mb.EncodedPacketSink(atrack); let first = true;
        for await (const pk of sink.packets()) { await asrc.add(pk, first ? { decoderConfig: acfg } : undefined); first = false; }
      } else await asrc.add(encAudio);
      asrc.close();
    })();
    await Promise.all([vp, ap]);
    await out.finalize(); onFrac && onFrac(1);
    return new Blob([out.target.buffer], { type: fmt.mimeType });
  }
  // Slow fallback: re-records the original video with a split stem as its sound. Real time: one pass per stem.
  async function muxVideoSlow(videoUrl, audioBlob, onFrac) {
    const mime = ['video/mp4;codecs=avc1.42E01E,mp4a.40.2', 'video/mp4', 'video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'].find(m => window.MediaRecorder && MediaRecorder.isTypeSupported(m));
    if (!mime) throw new Error('This device cannot record video.');
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const v = document.createElement('video');
    try {
      const ab = await ctx.decodeAudioData(await audioBlob.arrayBuffer());
      v.src = videoUrl; v.muted = true; v.playsInline = true; v.preload = 'auto';
      await new Promise((res, rej) => { v.onloadedmetadata = res; v.onerror = () => rej(new Error('Could not load the original video.')); });
      const cs = v.captureStream || v.mozCaptureStream; if (!cs) throw new Error('Video capture is not supported here.');
      const dest = ctx.createMediaStreamDestination(), src = ctx.createBufferSource(); src.buffer = ab; src.connect(dest);
      const rec = new MediaRecorder(new MediaStream([...cs.call(v).getVideoTracks(), ...dest.stream.getAudioTracks()]), { mimeType: mime }), chunks = [];
      rec.ondataavailable = e => { if (e.data.size) chunks.push(e.data); };
      const stopped = new Promise(res => { rec.onstop = res; }), ended = new Promise(res => { v.onended = res; });
      v.ontimeupdate = () => onFrac && v.duration && onFrac(v.currentTime / v.duration);
      await ctx.resume(); rec.start(1000); v.currentTime = 0; await v.play(); src.start();
      await ended; rec.stop(); await stopped;
      return new Blob(chunks, { type: mime.split(';')[0] });
    } finally { try { v.pause(); v.removeAttribute('src'); v.load(); } catch (e) {} ctx.close && ctx.close(); }
  }
  function addToLibrary(files) {
    const inp = document.getElementById('file-input'); if (!inp) throw new Error('file-input not found');
    const dt = new DataTransfer(); files.forEach(f => dt.items.add(f));
    inp.files = dt.files; inp.dispatchEvent(new Event('change', { bubbles: true }));
  }

  // ---------- Demucs (waveform in, stems out; STFT is inside the ONNX graph) ----------
  // outs: [{name, rows:[source indices to sum]}]. 25% overlap with linear cross-fades, like demucs-onnx.
  async function separateDemucs(pcm, session, outs, onProgress, sink, pause = 0) {
    const len = pcm[0].length, overlap = DEMUCS_SEG >> 2, stride = DEMUCS_SEG - overlap, nChunks = Math.max(1, Math.ceil(len / stride));
    let full = null;
    if (!sink) {
      full = outs.map(() => [new Float32Array(len), new Float32Array(len)]);
      sink = (chunks, at) => chunks.forEach((c, k) => { full[k][0].set(c[0], at); full[k][1].set(c[1], at); });
    }
    // rolling buffers: index 0 = sample i*stride. After chunk i, samples before (i+1)*stride are final and get handed to the sink.
    const acc = outs.map(() => [new Float32Array(DEMUCS_SEG), new Float32Array(DEMUCS_SEG)]), weight = new Float32Array(DEMUCS_SEG);
    const x = new Float32Array(2 * DEMUCS_SEG), w = new Float32Array(DEMUCS_SEG);
    for (let i = 0; i < nChunks; i++) {
      const start = i * stride, end = Math.min(start + DEMUCS_SEG, len), cl = end - start, last = i === nChunks - 1;
      x.fill(0); x.set(pcm[0].subarray(start, end), 0); x.set(pcm[1].subarray(start, end), DEMUCS_SEG);
      const res = await session.run({ mix: new ort.Tensor('float32', x.slice(), [1, 2, DEMUCS_SEG]) }), y = res.stems.data;   // [1, S, 2, SEG]
      for (let j = 0; j < cl; j++) {
        let g = 1;
        if (i > 0 && j < overlap) g = j / (overlap - 1);                       // fade in (not on the very first chunk)
        if (end < len && j >= DEMUCS_SEG - overlap) g = Math.min(g, (DEMUCS_SEG - 1 - j) / (overlap - 1)); // fade out (not on the last)
        w[j] = g; weight[j] += g;
      }
      outs.forEach((o, k) => { for (let c = 0; c < 2; c++) { const a = acc[k][c]; for (const r of o.rows) { const base = (r * 2 + c) * DEMUCS_SEG; for (let j = 0; j < cl; j++) a[j] += y[base + j] * w[j]; } } });
      for (const r of Object.values(res)) r.dispose && r.dispose();           // release the output tensors right away
      const n = last ? cl : stride;
      sink(acc.map(ch => ch.map(a => { const o = new Float32Array(n); for (let j = 0; j < n; j++) o[j] = a[j] / Math.max(weight[j], 1e-8); return o; })), start);
      if (!last) { for (const ch of acc) for (const a of ch) { a.copyWithin(0, stride); a.fill(0, DEMUCS_SEG - stride); } weight.copyWithin(0, stride); weight.fill(0, DEMUCS_SEG - stride); }
      onProgress && onProgress((i + 1) / nChunks);
      await tick(); if (pause) await new Promise(r => setTimeout(r, pause));
    }
    return full && Object.fromEntries(outs.map((o, k) => [o.name, full[k]]));
  }

  // ---------- Spleeter 4 stems: one U-Net per stem, same STFT as the 2-stem path ----------
  // Ratio masks across all four stems sum to 1, so the stems add back up to the mix. Band above 11 kHz: per-frame mean mask.
  // Streams sink(chunks, startSample), chunks aligned with outs = [{ name, idx: [stem indices to sum] }].
  async function separate4(pcm, sessions, outs, onProgress, sink, pause = 0, ye = 0) {
    const len = pcm[0].length, ns = sessions.length;
    let L = PAD + len + PAD; L += (HOP - ((L - N) % HOP)) % HOP;
    const nFrames = (L - N) / HOP + 1, nSeg = Math.ceil(nFrames / T), SEG = T * HOP, RB = SEG + N;
    const out = outs.map(() => [new Float32Array(RB), new Float32Array(RB)]);
    const re = new Float32Array(N), im = new Float32Array(N), mk = new Float32Array(BINS);
    const specRe = [new Float32Array(T * BINS), new Float32Array(T * BINS)], specIm = [new Float32Array(T * BINS), new Float32Array(T * BINS)];
    const x = new Float32Array(2 * T * F), den = new Float32Array(2 * T * F);
    const inName = sessions[0].inputNames[0], outName = sessions[0].outputNames[0];
    for (let s = 0; s < nSeg; s++) {
      x.fill(0); specRe.forEach(a => a.fill(0)); specIm.forEach(a => a.fill(0));
      for (let c = 0; c < 2; c++) for (let t = 0; t < T; t++) {
        const fr = s * T + t; if (fr >= nFrames) break;
        const o0 = fr * HOP - PAD, src = pcm[c];
        for (let i = 0; i < N; i++) { const j = o0 + i; re[i] = (j >= 0 && j < len ? src[j] : 0) * win[i]; im[i] = 0; }
        fft(re, im);
        for (let k = 0; k < BINS; k++) { specRe[c][t * BINS + k] = re[k]; specIm[c][t * BINS + k] = im[k]; }
        for (let k = 0; k < F; k++) x[c * T * F + t * F + k] = Math.hypot(re[k], im[k]);
        if (ye && (t + 1) % ye === 0) await tick();
      }
      const mkFeed = () => ({ [inName]: new ort.Tensor('float32', x.slice(), [2, 1, T, F]) });
      den.fill(1e-10); const Vs = [];
      for (let i = 0; i < ns; i++) {
        const V = (await sessions[i].run(mkFeed()))[outName].data; Vs.push(V);
        for (let j = 0; j < den.length; j++) den[j] += V[j] * V[j];
        await tick();
      }
      for (let c = 0; c < 2; c++) for (let t = 0; t < T; t++) {
        const fr = s * T + t; if (fr >= nFrames) break;
        const base = c * T * F + t * F;
        for (let oi = 0; oi < outs.length; oi++) {
          for (let k = 0; k < F; k++) { let a = 0; for (const si of outs[oi].idx) { const v = Vs[si][base + k]; a += v * v + 2.5e-11; } mk[k] = a / den[base + k]; }
          let avg = 0; for (let k = 0; k < F; k++) avg += mk[k]; avg /= F;
          for (let k = F; k < BINS; k++) mk[k] = avg;
          for (let k = 0; k < BINS; k++) {
            const g = mk[k], r = specRe[c][t * BINS + k] * g, i = specIm[c][t * BINS + k] * g;
            re[k] = r; im[k] = -i;                                // conj for inverse-via-forward
            if (k > 0 && k < N / 2) { re[N - k] = r; im[N - k] = i; }
          }
          fft(re, im);
          const bo = t * HOP, ob = out[oi][c];
          for (let i = 0; i < N; i++) ob[bo + i] += (re[i] / N) * win[i] / 1.5;
        }
        if (ye && (t + 1) % ye === 0) await tick();
      }
      const a = Math.max(0, s * SEG - PAD), b = Math.min(len, (s + 1) * SEG - PAD);
      if (b > a) { const bs = a + PAD - s * SEG; sink(out.map(ch => ch.map(o => o.slice(bs, bs + b - a))), a); }
      for (const ch of out) for (const o of ch) { o.copyWithin(0, SEG, RB); o.fill(0, RB - SEG); }
      onProgress && onProgress((s + 1) / nSeg);
      await tick(); if (pause) await new Promise(r => setTimeout(r, pause));
    }
  }

  // ---------- MDX-Net (UVR) ----------
  // The ONNX graph takes a spectrogram [1, 4, dimF, 256] = [L re, L im, R re, R im] and returns the vocal spectrogram.
  // n_fft (7680 = 2^9*3*5) isn't a power of two, so this has its own mixed-radix FFT (radix 2/3/5, Stockham).
  function makeFFT(n) {
    const fac = []; let t = n; for (const r of [5, 3, 2]) while (t % r === 0) { fac.push(r); t /= r; }
    if (t !== 1) throw new Error('FFT size ' + n + ' not supported');
    const stages = []; let len = n, s = 1;
    for (const r of fac) {
      const m = len / r, wr = new Float64Array(r * r), wi = new Float64Array(r * r), tr = new Float64Array(m * r), ti = new Float64Array(m * r);
      for (let u = 0; u < r; u++) for (let k = 0; k < r; k++) { const a = -2 * Math.PI * ((u * k) % r) / r; wr[u * r + k] = Math.cos(a); wi[u * r + k] = Math.sin(a); }
      for (let p = 0; p < m; p++) for (let u = 0; u < r; u++) { const a = -2 * Math.PI * p * u / len; tr[p * r + u] = Math.cos(a); ti[p * r + u] = Math.sin(a); }
      stages.push({ r, m, s, wr, wi, tr, ti }); len = m; s *= r;
    }
    const yr = new Float64Array(n), yi = new Float64Array(n), gr = new Float64Array(5), gi = new Float64Array(5);
    return (xr, xi) => {                                              // in place, forward, Float64Array in
      let ar = xr, ai = xi, br = yr, bi = yi;
      for (const { r, m, s, wr, wi, tr, ti } of stages) {
        for (let p = 0; p < m; p++) for (let q = 0; q < s; q++) {
          for (let k = 0; k < r; k++) { const idx = q + s * (p + k * m); gr[k] = ar[idx]; gi[k] = ai[idx]; }
          for (let u = 0; u < r; u++) {
            let sr = 0, si = 0;
            for (let k = 0; k < r; k++) { const cr = wr[u * r + k], ci = wi[u * r + k]; sr += gr[k] * cr - gi[k] * ci; si += gr[k] * ci + gi[k] * cr; }
            const c = tr[p * r + u], d = ti[p * r + u], o = q + s * (r * p + u);
            br[o] = sr * c - si * d; bi[o] = sr * d + si * c;
          }
        }
        let tmp = ar; ar = br; br = tmp; tmp = ai; ai = bi; bi = tmp;
      }
      if (ar !== xr) { xr.set(ar); xi.set(ai); }
    };
  }

  // Chunks of 255 hops (256 frames). Each chunk keeps its middle and drops n_fft/2 samples at both ends, like UVR.
  // Streams sink(vocals:[L,R], instrumental:[L,R], startSample); instrumental = mix - vocals.
  async function separateMdx(pcm, session, cfg, onProgress, sink, pause = 0, ye = 0) {
    ye = ye || 16;                                                    // always give the UI a turn: this DSP is heavy even on a fast phone
    const NF = cfg.nfft, H = 1024, DF = cfg.dimF, DT = 256, half = NF >> 1, chunk = H * (DT - 1), gen = chunk - NF;
    const len = pcm[0].length, nChunks = Math.max(1, Math.ceil(len / gen)), fftN = makeFFT(NF);
    const w = new Float64Array(NF); for (let i = 0; i < NF; i++) w[i] = 0.5 - 0.5 * Math.cos(2 * Math.PI * i / NF);
    const env = new Float64Array(chunk);                              // sum of squared windows, for the inverse STFT
    for (let t = 0; t < DT; t++) for (let i = 0; i < NF; i++) { const q = t * H - half + i; if (q >= 0 && q < chunk) env[q] += w[i] * w[i]; }
    const re = new Float64Array(NF), im = new Float64Array(NF), X = new Float32Array(4 * DF * DT), acc = [new Float32Array(chunk), new Float32Array(chunk)];
    const inName = session.inputNames[0], outName = session.outputNames[0];
    for (let j = 0; j < nChunks; j++) {
      const base = j * gen - half; X.fill(0);
      for (let t = 0; t < DT; t++) {                                  // L in the real part, R in the imaginary part: one FFT does both channels
        const st = t * H - half;
        for (let i = 0; i < NF; i++) {
          let q = st + i; if (q < 0) q = -q; else if (q >= chunk) q = 2 * (chunk - 1) - q;   // reflect padding (center=True)
          const a = base + q, ok = a >= 0 && a < len;
          re[i] = (ok ? pcm[0][a] : 0) * w[i]; im[i] = (ok ? pcm[1][a] : 0) * w[i];
        }
        fftN(re, im);
        for (let k = 3; k < DF; k++) {                                // split the two real signals back apart
          const a = re[k], b = im[k], c2 = re[NF - k], d = im[NF - k];
          X[(0 * DF + k) * DT + t] = (a + c2) / 2; X[(1 * DF + k) * DT + t] = (b - d) / 2;          // L re, L im   (lowest 3 bins stay zero, like UVR)
          X[(2 * DF + k) * DT + t] = (b + d) / 2;  X[(3 * DF + k) * DT + t] = (c2 - a) / 2;          // R re, R im
        }
        if (ye && (t + 1) % ye === 0) await tick();
      }
      const res = await session.run({ [inName]: new ort.Tensor('float32', X.slice(), [1, 4, DF, DT]) }), Y = res[outName].data;
      await tick();
      acc[0].fill(0); acc[1].fill(0);
      for (let t = 0; t < DT; t++) {
        re.fill(0); im.fill(0);
        for (let k = 0; k < DF; k++) {
          const Ar = Y[k * DT + t], Ai = k ? Y[(DF + k) * DT + t] : 0, Br = Y[(2 * DF + k) * DT + t], Bi = k ? Y[(3 * DF + k) * DT + t] : 0;
          const zr = Ar - Bi, zi = Ai + Br;                           // Z = A + iB, so one inverse gives L (real) and R (imaginary)
          re[k] = zr; im[k] = -zi;                                    // conj for inverse-via-forward
          if (k > 0) { re[NF - k] = Ar + Bi; im[NF - k] = Ai - Br; }  // conj of Z[NF-k] = Ar+Bi + i(Ai-Br)
        }
        fftN(re, im);
        const st = t * H - half, o0 = acc[0], o1 = acc[1];
        for (let i = 0; i < NF; i++) { const q = st + i; if (q >= 0 && q < chunk) { const g = w[i] / NF; o0[q] += re[i] * g; o1[q] -= im[i] * g; } }
        if (ye && (t + 1) % ye === 0) await tick();
      }
      for (const r of Object.values(res)) r.dispose && r.dispose();
      const start = j * gen, n = Math.min(gen, len - start);
      const voc = acc.map(a => { const o = new Float32Array(n); for (let i = 0; i < n; i++) o[i] = a[half + i] / Math.max(env[half + i], 1e-8) * cfg.comp; return o; });
      const ins = voc.map((v, c) => { const o = new Float32Array(n); for (let i = 0; i < n; i++) o[i] = pcm[c][start + i] - v[i]; return o; });
      sink(voc, ins, start);
      onProgress && onProgress((j + 1) / nChunks);
      await tick(); if (pause) await new Promise(r => setTimeout(r, pause));
    }
  }

