  // ---------- runtime ----------
  const loadOrt = () => window.ort ? Promise.resolve() : new Promise((res, rej) => {
    const s = document.createElement('script'); s.src = ORT + 'ort.all.min.js'; s.onload = res; s.onerror = () => rej(new Error('Could not load onnxruntime-web'));
    document.head.appendChild(s);
  });
  async function makeSession(key, gpu, lv) {
    if (NATIVE) {
      if (engineDead) throw new Error('The audio engine crashed earlier. Reload the app, then try again.');
      try { return await nativeSession(key); }
      catch (e) { throw new Error('Could not load model "' + key + '": ' + errText(e)); }
    }
    if (engineDead) throw new Error('The audio engine crashed earlier and cannot recover until the app is reloaded. Reload the app, then try again.');
    const buf = await getPart(key);
    if (!buf) throw new Error('Model file "' + key + '" is missing. Press Split again to download it.');
    const u8 = new Uint8Array(buf);
    if (u8.length < 1024 || u8[0] === 0x3C) {                          // a 404/HTML page or truncated file got saved: drop it so the next run re-downloads
      await idbDel(key).catch(() => {});
      throw new Error('The downloaded model "' + key + '" was not a valid ONNX file (' + u8.length + ' bytes). I deleted it: press Split again to re-download.');
    }
    ort.env.wasm.wasmPaths = ORT;
    const threads = lv && lv.custom ? (self.crossOriginIsolated && lv.threads ? Math.min(lv.threads, navigator.hardwareConcurrency || lv.threads) : 1) : !lv && self.crossOriginIsolated ? Math.min(4, navigator.hardwareConcurrency || 2) : 1;   // custom: the person's pick
    const big = u8.length > 100e6;                                       // Demucs (316 MB): keep every extra copy of the weights out of memory
    const base = { graphOptimizationLevel: lv || big || key === 'mdx_voc' ? 'basic' : 'all' };
    if (big) { base.enableCpuMemArena = false; base.enableMemPattern = false; base.executionMode = 'sequential'; }   // MDX: 'all' makes the load slow and memory hungry
    if (lv && lv.lean) { base.enableCpuMemArena = false; base.enableMemPattern = false; base.executionMode = 'sequential'; }
    // try in order: WebGPU (if asked) -> wasm with threads -> wasm single thread, basic optimization (smallest memory)
    const tries = [];
    if (gpu && !lv && navigator.gpu) tries.push({ eps: ['webgpu', 'wasm'], th: threads, opt: base.graphOptimizationLevel });
    tries.push({ eps: ['wasm'], th: threads, opt: base.graphOptimizationLevel });
    if (threads > 1 || base.graphOptimizationLevel !== 'basic') tries.push({ eps: ['wasm'], th: 1, opt: 'basic' });
    if (key.startsWith('sp4_')) tries.length = 1;                        // fp16 files: one quick attempt, the caller falls back to the full-precision files
    let last = null, first = null;
    for (const t of tries) {
      try {
        ort.env.wasm.numThreads = t.th;
        ort.env.wasm.proxy = false;   // worker mode hands our input buffers to the worker (detaching them), and our loops reuse those buffers
        await new Promise(r => setTimeout(r, 30));          // let the status text paint first
        return await ort.InferenceSession.create(u8, Object.assign({}, base, { executionProviders: t.eps, graphOptimizationLevel: t.opt }));
      } catch (e) {
        last = e; if (!first) first = e; console.warn('session create failed', key, t, e);
        if (/abort|not initialized|initializeWebAssembly/i.test(errText(e))) { engineDead = true; break; }   // retrying after an abort only produces "WebAssembly is not initialized yet" and hides the real cause
        await new Promise(r => setTimeout(r, 50));
      }
    }
    throw new Error('Could not load model "' + key + '": ' + errText(first || last) + (engineDead ? ' The engine has crashed, so reload the app before trying again. If Multi-thread is ticked, untick it for this model.' : ''));
  }
  async function haveModel(id) {
    if (NATIVE) { for (const [k] of parts(id)) if (!(await NP.exists({ id: k })).ready) return false; return true; }
    for (const [k] of parts(id)) if (!(await getPart(k))) return false; return true; }
  async function downloadModel(id, status, low) {
    if (NATIVE) { for (const [k, f] of parts(id)) { if ((await NP.exists({ id: k })).ready) continue; status('Downloading ' + f.split('/').pop() + '…'); await nativeFetch(k, f, status); } return; }
    for (const [k, f] of parts(id)) { if (await getPart(k)) continue; await fetchPart(k, f, (g, t) => status('Downloading ' + f.split('/').pop() + ' ' + (t ? Math.round(g / t * 100) + '%' : (g / 1048576 | 0) + ' MB')), low); }
  }
  async function deleteModel(id) {
    if (NATIVE) { for (const [k] of parts(id)) { await NP.remove({ id: k }); if (k.startsWith('sp_')) await idbDel(legacyKey(k)).catch(() => {}); } return; } for (const [k] of parts(id)) { await idbDel(k); if (k.startsWith('sp_')) await idbDel(legacyKey(k)); if (k.startsWith('sp4_')) await idbDel('sp4f_' + k.slice(4)); } }

  // Native 4-stem, MDX and Demucs path (Android app): decode, STFT, model and WAV output all run in Java.
  const nativeGrab = async p => new Blob([await (await fetch(window.Capacitor.convertFileSrc(p))).arrayBuffer()], { type: 'audio/wav' });
  const ls0 = k => { try { return localStorage.getItem(k); } catch (e) { return null; } };
  // Subtitle mute for the native engines: the Java side rewrites the finished WAVs in place (OnnxSeparator.maskStems).
  // nm = { spans, floor, fade }. Never fails the split: on an error the stems are kept as they came out, with a note.
  async function nativeMask(nm, vocals, extras, status) {
    if (!nm || !vocals) return '';
    try { status('Muting non-vocal parts…'); await NP.maskStems({ vocals, extras: extras.filter(Boolean), spans: nm.spans, floor: nm.floor, fade: nm.fade }); return ''; }
    catch (e) { console.warn('native subtitle mute failed', e); return ' Subtitle mute failed (' + errText(e) + '), so the stems were left as they came out.'; }
  }
  // Length of a track in seconds without decoding it (0 if the WebView can't tell).
  function mediaDur(url) {
    return new Promise(res => {
      const a = document.createElement('audio'); let done = false;
      const end = d => { if (done) return; done = true; clearTimeout(tm); a.removeAttribute('src'); try { a.load(); } catch (e) {} res(isFinite(d) && d > 0 ? d : 0); };
      const tm = setTimeout(() => end(0), 8000);
      a.preload = 'metadata'; a.onloadedmetadata = () => end(a.duration); a.onerror = () => end(0); a.src = url;
    });
  }

  async function nativeStems(m, id, track, wanted, opts, status, onProgress) {
    const SS = window.Capacitor.Plugins.SpleeterSeparator;
    status('Preparing audio…');
    const blob = await (await fetch(track.url)).blob();
    const b64 = await new Promise((res, rej) => { const fr = new FileReader(); fr.onload = () => res(String(fr.result).split(',')[1]); fr.onerror = () => rej(fr.error); fr.readAsDataURL(blob); });
    const saved = await SS.writeInput({ name: 'track-' + Date.now() + '.audio', data: b64 });
    window.__ppLastSep = '';
    const h = await NP.addListener('progress', e => { onProgress(e.fraction); status('Separating… ' + Math.round(e.fraction * 100) + '%'); });
    const nm = opts.nmask || null, hid = !!nm && !wanted.includes('Vocals') && (wanted.includes('Instrumental') || wanted.includes('Other'));
    const W = hid ? wanted.concat('Vocals') : wanted;                 // vocals are needed to put the removed sound back
    const accKey = 'ppvAccel_' + id, remembered = ls0(accKey);
    const useNn = opts.nnapi !== false && !/^demucs/.test(id) && !cpuOnly.has(id) && remembered !== 'cpu';   // Demucs is always CPU; a model that already lost or gave NaN stays on CPU
    const base = { tune: false, input: saved.path, stems: W, nnapi: useNn, duty: opts.lv ? (opts.lv.custom ? opts.lv.duty : ({ Light: 0, Medium: 0.2, Max: 0.5 }[opts.lv.name] || 0)) : 0,
      threads: opts.lv && opts.lv.custom ? opts.lv.threads : 0, spin: !!(opts.lv && opts.lv.custom && opts.lv.spin), lean: !!(opts.lv && opts.lv.custom && opts.lv.lean) };
    let out;
    try {
      status('Loading models…');
      if (m.kind === 'sp4') {
        try { out = await NP.separate(Object.assign({ kind: 'sp4', prefix: 'sp4_' }, base)); }
        catch (e) {                                                   // half precision rejected: use the full precision files
          if (!/Could not load model/.test(errText(e))) throw e;
          for (const n of ['vocals', 'drums', 'bass', 'other']) if (!(await NP.exists({ id: 'sp4f_' + n })).ready) await nativeFetch('sp4f_' + n, n + '.onnx', status);
          status('Loading models…');
          out = await NP.separate(Object.assign({ kind: 'sp4', prefix: 'sp4f_' }, base));
        }
      } else if (m.kind === 'demucs') out = await NP.separate(Object.assign({ kind: 'demucs', model: id, sources: m.sources }, base));
      else out = await NP.separate(Object.assign({ kind: 'mdx', model: id, nfft: m.nfft, dimF: m.dimF, comp: m.comp }, base));
    } finally { h.remove(); }
    window.__ppLastSep = ' (' + Math.round(out.seconds) + ' s on ' + out.accel + ')';
    try { localStorage.setItem(accKey, /nnapi|npu|gpu/i.test(String(out.accel)) ? 'nnapi' : 'cpu'); } catch (e) {}
    if (nm) {
      window.__ppLastSep += await nativeMask(nm, out.files.Vocals, ['Instrumental', 'Other'].map(n => out.files[n]), status);
      if (hid) { NP.deleteFiles({ paths: [out.files.Vocals] }).catch(() => {}); delete out.files.Vocals; }
    }
    const res = {};
    if (opts.pathOnly) { for (const n of wanted) res[n] = { path: out.files[n], ext: 'wav' }; return res; }   // caller reads and deletes the file itself
    for (const n of wanted) res[n] = { blob: await nativeGrab(out.files[n]), ext: 'wav' };
    NP.deleteFiles({ paths: Object.values(out.files) }).catch(() => {});
    return res;
  }

  // Native 2-stem path (Android app): the whole separation runs in Java, not in this page.
  async function nativeSpleeter(track, wanted, opts, status, onProgress) {
    const SS = window.Capacitor.Plugins.SpleeterSeparator;
    status('Preparing audio…');
    const blob = await (await fetch(track.url)).blob();
    const b64 = await new Promise((res, rej) => {
      const fr = new FileReader();
      fr.onload = () => res(String(fr.result).split(',')[1]);
      fr.onerror = () => rej(fr.error);
      fr.readAsDataURL(blob);
    });
    const saved = await SS.writeInput({ name: 'track-' + Date.now() + '.audio', data: b64 });
    window.__ppLastSep = '';
    const h = await SS.addListener('progress', e => { onProgress(e.fraction); status('Separating… ' + Math.round(e.fraction * 100) + '%'); });
    let out;
    try { out = await SS.separate({ input: saved.path, sharp: opts.strength, nnapi: opts.nnapi !== false && ls0('ppvAccel_spleeter2') !== 'cpu' && !cpuOnly.has('spleeter2'), tune: false }); try { localStorage.setItem('ppvAccel_spleeter2', /nnapi|npu|gpu/i.test(String(out.accel)) ? 'nnapi' : 'cpu'); } catch (e) {} }
    finally { h.remove(); }
    window.__ppLastSep = ' (' + Math.round(out.seconds) + ' s on ' + out.accel + ')';
    if (opts.nmask) window.__ppLastSep += await nativeMask(opts.nmask, out.vocals, [out.instrumental], status);
    const grab = async p => new Blob([await (await fetch(window.Capacitor.convertFileSrc(p))).arrayBuffer()], { type: 'audio/wav' });
    const res = {};
    if (wanted.includes('Vocals')) res.Vocals = opts.pathOnly ? { path: out.vocals, ext: 'wav' } : { blob: await grab(out.vocals), ext: 'wav' };
    if (wanted.includes('Instrumental')) res.Instrumental = { blob: await grab(out.instrumental), ext: 'wav' };
    return res;
  }

  // Runs the chosen model; returns {outputName: [L, R]} for just the wanted outputs.
  async function run(id, pcm, wanted, opts, status, onProgress) {
    const m = MODELS[id]; await loadOrt();
    const mkGate = n => n === 'Vocals' ? makeGate(opts.gate) : null;
    const mask = opts.mask || null;                                   // subtitle mask (JS engines only)
    const hid = !!mask && !wanted.includes('Vocals') && (wanted.includes('Instrumental') || wanted.includes('Other'));   // vocals are needed internally to put the removed sound back
    const W = hid ? wanted.concat('Vocals') : wanted;
    const mkEnc = n => n === 'Vocals' && hid ? { push() {}, finish() { return null; } } : makeEncoder(mkGate(n));
    if (m.kind === 'spleeter' && NATIVE && !pcm) return nativeSpleeter(opts.track, wanted, opts, status, onProgress);
    if ((m.kind === 'sp4' || m.kind === 'mdx' || m.kind === 'demucs') && NATIVE && !pcm) return nativeStems(m, id, opts.track, wanted, opts, status, onProgress);
    if (m.kind === 'spleeter') {
      status('Loading models…');
      const sess = { vocals: await makeSession('sp_vocals', false, opts.lv), accomp: await makeSession('sp_accomp', false, opts.lv) };
      try {
        const enc = {}; W.forEach(n => enc[n] = mkEnc(n));      // encode while separating, no full-length stems in RAM
        const sink = (v, a) => { if (mask && v && a) mask.process(v[0], v[1], [a]); if (enc.Vocals) enc.Vocals.push(v[0], v[1]); if (enc.Instrumental) enc.Instrumental.push(a[0], a[1]); };
        const lv = opts.lv;
        const q = opts.quality || 0;
        await separate(pcm, sess, onProgress, opts.strength, sink, { pause: lv ? lv.pause[0] : 0, need: lv && lv.skip && !mask ? { v: !!enc.Vocals, a: !!enc.Instrumental } : null, ye: lv ? lv.ye : 0, ctx: q >= 1 ? CTX : 0, shift: q >= 2 ? 512 : 0 });
        const out = {}; wanted.forEach(n => out[n] = enc[n].finish()); return out;   // already {blob, ext}
      } finally { sess.vocals.release && sess.vocals.release(); sess.accomp.release && sess.accomp.release(); }
    }
    if (m.kind === 'sp4') {
      status('Loading models…');
      const names = ['vocals', 'drums', 'bass', 'other'];
      let sess = [];
      const load = async pre => { sess = []; for (const n of names) sess.push(await makeSession(pre + n, false, opts.lv)); };
      try {
        try { await load('sp4_'); }
        catch (e) {                                                       // half precision rejected here: use the 39 MB full precision files
          sess.forEach(x => x.release && x.release());
          for (const n of names) if (!(await getPart('sp4f_' + n))) await fetchPart('sp4f_' + n, n + '.onnx', (g, t) => status('Downloading ' + n + '.onnx ' + (t ? Math.round(g / t * 100) + '%' : (g / 1048576 | 0) + ' MB')), opts.lv && opts.lv.blob);
          status('Loading models…'); await load('sp4f_');
        }
        const idx = { Vocals: [0], Drums: [1], Bass: [2], Other: [3], Instrumental: [1, 2, 3] };
        const outs = W.map(n => ({ name: n, idx: idx[n] })), enc = outs.map(o => mkEnc(o.name)), lv = opts.lv, nm = outs.map(o => o.name);
        await separate4(pcm, sess, outs, onProgress, chunks => { maskChunks(mask, nm, chunks); chunks.forEach((c, k) => enc[k].push(c[0], c[1])); }, lv ? lv.pause[0] : 0, lv ? lv.ye : 0);
        return Object.fromEntries(outs.map((o, k) => [o.name, enc[k].finish()]).filter(q => q[1]));   // already {blob, ext}
      } finally { sess.forEach(x => x.release && x.release()); }
    }
    if (m.kind === 'mdx') {
      status('Loading model…');
      const sess = await makeSession(id, opts.gpu, opts.lv);
      try {
        const enc = {}; W.forEach(n => enc[n] = mkEnc(n));
        const sink = (v, a) => { if (mask && v && a) mask.process(v[0], v[1], [a]); if (enc.Vocals) enc.Vocals.push(v[0], v[1]); if (enc.Instrumental) enc.Instrumental.push(a[0], a[1]); };
        await separateMdx(pcm, sess, m, onProgress, sink, opts.lv ? opts.lv.pause[1] : 0, opts.lv ? opts.lv.ye : 0);
        const out = {}; wanted.forEach(n => out[n] = enc[n].finish()); return out;   // already {blob, ext}
      } finally { sess.release && sess.release(); }
    }
    status('Loading model… (can take a moment)');
    const sess = await makeSession(id, opts.gpu, opts.lv);
    try {
      const outs = W.map(n => ({ name: n, rows: n === 'Instrumental' ? m.sources.map((s, i) => s === 'vocals' ? -1 : i).filter(i => i >= 0) : [m.sources.indexOf(n.toLowerCase())] }));
      const enc = outs.map(o => mkEnc(o.name)), nm = outs.map(o => o.name);             // encode while separating, no full-length stems in RAM
      await separateDemucs(pcm, sess, outs, onProgress, chunks => { maskChunks(mask, nm, chunks); chunks.forEach((c, k) => enc[k].push(c[0], c[1])); }, opts.lv ? opts.lv.pause[1] : 0);
      return Object.fromEntries(outs.map((o, k) => [o.name, enc[k].finish()]).filter(q => q[1]));   // already {blob, ext}
    } finally { sess.release && sess.release(); }                       // free RAM right away
  }
  const stemNames = id => MODELS[id].kind === 'spleeter' ? ['Vocals', 'Instrumental'] : ['Vocals', 'Instrumental'].concat(MODELS[id].sources.filter(s => s !== 'vocals').map(cap));

  // ---------- Auto-tagging ----------
  // 1) Essentia Discogs-EffNet (16 MB) + small heads: instruments, voice or instrumental, Discogs styles. CC BY-NC-SA 4.0 (non-commercial).
  // 2) EfficientAT mn10 (24 MB, MIT): AudioSet genre, mood and instruments. Its mel front end is inside the graph.
  const HFM = 'https://huggingface.co/';
  const TAG_FILES = {
    tg_effnet: HFM + 'swillsoftware/describesong-tagger/resolve/main/effnet.onnx',
    tg_hinst: HFM + 'swillsoftware/describesong-tagger/resolve/main/head-instrument.onnx',
    tg_hvoice: HFM + 'swillsoftware/describesong-tagger/resolve/main/head-voice.onnx',
    tg_mel: HFM + 'swillsoftware/describesong-tagger/resolve/main/melbank_96x257.npy',
    tg_mn10: HFM + 'minhducjp/webdonhac-models/resolve/main/mn10_as.onnx',
    tg_hgenre: 'genre_discogs400-discogs-effnet-1.onnx',                // looked up in your HF_BASE repo first; Essentia is the fallback (TAG_FALLBACK)
    // Public fallback for the Styles section: MTG/Essentia's unmodified Discogs-EffNet ONNX (also outputs the 400 Discogs style activations).
    tg_effstyle: HFM + 'Heyian/discogs-effnet-onnx/resolve/main/discogs-effnet-bsdynamic-1.onnx'
  };
  const INST40 = ["accordion","acousticbassguitar","acousticguitar","bass","beat","bell","bongo","brass","cello","clarinet","classicalguitar","computer","doublebass","drummachine","drums","electricguitar","electricpiano","flute","guitar","harmonica","harp","horn","keyboard","oboe","orchestra","organ","pad","percussion","piano","pipeorgan","rhodes","sampler","saxophone","strings","synthesizer","trombone","trumpet","viola","violin","voice"], DISCOGS = ["Boogie Woogie (Blues)","Chicago Blues (Blues)","Country Blues (Blues)","Delta Blues (Blues)","Electric Blues (Blues)","Harmonica Blues (Blues)","Jump Blues (Blues)","Louisiana Blues (Blues)","Modern Electric Blues (Blues)","Piano Blues (Blues)","Rhythm & Blues (Blues)","Texas Blues (Blues)","Brass Band (Brass & Military)","Marches (Brass & Military)","Military (Brass & Military)","Educational (Children's)","Nursery Rhymes (Children's)","Story (Children's)","Baroque (Classical)","Choral (Classical)","Classical (Classical)","Contemporary (Classical)","Impressionist (Classical)","Medieval (Classical)","Modern (Classical)","Neo-Classical (Classical)","Neo-Romantic (Classical)","Opera (Classical)","Post-Modern (Classical)","Renaissance (Classical)","Romantic (Classical)","Abstract (Electronic)","Acid (Electronic)","Acid House (Electronic)","Acid Jazz (Electronic)","Ambient (Electronic)","Bassline (Electronic)","Beatdown (Electronic)","Berlin-School (Electronic)","Big Beat (Electronic)","Bleep (Electronic)","Breakbeat (Electronic)","Breakcore (Electronic)","Breaks (Electronic)","Broken Beat (Electronic)","Chillwave (Electronic)","Chiptune (Electronic)","Dance-pop (Electronic)","Dark Ambient (Electronic)","Darkwave (Electronic)","Deep House (Electronic)","Deep Techno (Electronic)","Disco (Electronic)","Disco Polo (Electronic)","Donk (Electronic)","Downtempo (Electronic)","Drone (Electronic)","Drum n Bass (Electronic)","Dub (Electronic)","Dub Techno (Electronic)","Dubstep (Electronic)","Dungeon Synth (Electronic)","EBM (Electronic)","Electro (Electronic)","Electro House (Electronic)","Electroclash (Electronic)","Euro House (Electronic)","Euro-Disco (Electronic)","Eurobeat (Electronic)","Eurodance (Electronic)","Experimental (Electronic)","Freestyle (Electronic)","Future Jazz (Electronic)","Gabber (Electronic)","Garage House (Electronic)","Ghetto (Electronic)","Ghetto House (Electronic)","Glitch (Electronic)","Goa Trance (Electronic)","Grime (Electronic)","Halftime (Electronic)","Hands Up (Electronic)","Happy Hardcore (Electronic)","Hard House (Electronic)","Hard Techno (Electronic)","Hard Trance (Electronic)","Hardcore (Electronic)","Hardstyle (Electronic)","Hi NRG (Electronic)","Hip Hop (Electronic)","Hip-House (Electronic)","House (Electronic)","IDM (Electronic)","Illbient (Electronic)","Industrial (Electronic)","Italo House (Electronic)","Italo-Disco (Electronic)","Italodance (Electronic)","Jazzdance (Electronic)","Juke (Electronic)","Jumpstyle (Electronic)","Jungle (Electronic)","Latin (Electronic)","Leftfield (Electronic)","Makina (Electronic)","Minimal (Electronic)","Minimal Techno (Electronic)","Modern Classical (Electronic)","Musique Concr\u00e8te (Electronic)","Neofolk (Electronic)","New Age (Electronic)","New Beat (Electronic)","New Wave (Electronic)","Noise (Electronic)","Nu-Disco (Electronic)","Power Electronics (Electronic)","Progressive Breaks (Electronic)","Progressive House (Electronic)","Progressive Trance (Electronic)","Psy-Trance (Electronic)","Rhythmic Noise (Electronic)","Schranz (Electronic)","Sound Collage (Electronic)","Speed Garage (Electronic)","Speedcore (Electronic)","Synth-pop (Electronic)","Synthwave (Electronic)","Tech House (Electronic)","Tech Trance (Electronic)","Techno (Electronic)","Trance (Electronic)","Tribal (Electronic)","Tribal House (Electronic)","Trip Hop (Electronic)","Tropical House (Electronic)","UK Garage (Electronic)","Vaporwave (Electronic)","African (Folk, World, & Country)","Bluegrass (Folk, World, & Country)","Cajun (Folk, World, & Country)","Canzone Napoletana (Folk, World, & Country)","Catalan Music (Folk, World, & Country)","Celtic (Folk, World, & Country)","Country (Folk, World, & Country)","Fado (Folk, World, & Country)","Flamenco (Folk, World, & Country)","Folk (Folk, World, & Country)","Gospel (Folk, World, & Country)","Highlife (Folk, World, & Country)","Hillbilly (Folk, World, & Country)","Hindustani (Folk, World, & Country)","Honky Tonk (Folk, World, & Country)","Indian Classical (Folk, World, & Country)","La\u00efk\u00f3 (Folk, World, & Country)","Nordic (Folk, World, & Country)","Pacific (Folk, World, & Country)","Polka (Folk, World, & Country)","Ra\u00ef (Folk, World, & Country)","Romani (Folk, World, & Country)","Soukous (Folk, World, & Country)","S\u00e9ga (Folk, World, & Country)","Volksmusik (Folk, World, & Country)","Zouk (Folk, World, & Country)","\u00c9ntekhno (Folk, World, & Country)","Afrobeat (Funk / Soul)","Boogie (Funk / Soul)","Contemporary R&B (Funk / Soul)","Disco (Funk / Soul)","Free Funk (Funk / Soul)","Funk (Funk / Soul)","Gospel (Funk / Soul)","Neo Soul (Funk / Soul)","New Jack Swing (Funk / Soul)","P.Funk (Funk / Soul)","Psychedelic (Funk / Soul)","Rhythm & Blues (Funk / Soul)","Soul (Funk / Soul)","Swingbeat (Funk / Soul)","UK Street Soul (Funk / Soul)","Bass Music (Hip Hop)","Boom Bap (Hip Hop)","Bounce (Hip Hop)","Britcore (Hip Hop)","Cloud Rap (Hip Hop)","Conscious (Hip Hop)","Crunk (Hip Hop)","Cut-up/DJ (Hip Hop)","DJ Battle Tool (Hip Hop)","Electro (Hip Hop)","G-Funk (Hip Hop)","Gangsta (Hip Hop)","Grime (Hip Hop)","Hardcore Hip-Hop (Hip Hop)","Horrorcore (Hip Hop)","Instrumental (Hip Hop)","Jazzy Hip-Hop (Hip Hop)","Miami Bass (Hip Hop)","Pop Rap (Hip Hop)","Ragga HipHop (Hip Hop)","RnB/Swing (Hip Hop)","Screw (Hip Hop)","Thug Rap (Hip Hop)","Trap (Hip Hop)","Trip Hop (Hip Hop)","Turntablism (Hip Hop)","Afro-Cuban Jazz (Jazz)","Afrobeat (Jazz)","Avant-garde Jazz (Jazz)","Big Band (Jazz)","Bop (Jazz)","Bossa Nova (Jazz)","Contemporary Jazz (Jazz)","Cool Jazz (Jazz)","Dixieland (Jazz)","Easy Listening (Jazz)","Free Improvisation (Jazz)","Free Jazz (Jazz)","Fusion (Jazz)","Gypsy Jazz (Jazz)","Hard Bop (Jazz)","Jazz-Funk (Jazz)","Jazz-Rock (Jazz)","Latin Jazz (Jazz)","Modal (Jazz)","Post Bop (Jazz)","Ragtime (Jazz)","Smooth Jazz (Jazz)","Soul-Jazz (Jazz)","Space-Age (Jazz)","Swing (Jazz)","Afro-Cuban (Latin)","Bai\u00e3o (Latin)","Batucada (Latin)","Beguine (Latin)","Bolero (Latin)","Boogaloo (Latin)","Bossanova (Latin)","Cha-Cha (Latin)","Charanga (Latin)","Compas (Latin)","Cubano (Latin)","Cumbia (Latin)","Descarga (Latin)","Forr\u00f3 (Latin)","Guaguanc\u00f3 (Latin)","Guajira (Latin)","Guaracha (Latin)","MPB (Latin)","Mambo (Latin)","Mariachi (Latin)","Merengue (Latin)","Norte\u00f1o (Latin)","Nueva Cancion (Latin)","Pachanga (Latin)","Porro (Latin)","Ranchera (Latin)","Reggaeton (Latin)","Rumba (Latin)","Salsa (Latin)","Samba (Latin)","Son (Latin)","Son Montuno (Latin)","Tango (Latin)","Tejano (Latin)","Vallenato (Latin)","Audiobook (Non-Music)","Comedy (Non-Music)","Dialogue (Non-Music)","Education (Non-Music)","Field Recording (Non-Music)","Interview (Non-Music)","Monolog (Non-Music)","Poetry (Non-Music)","Political (Non-Music)","Promotional (Non-Music)","Radioplay (Non-Music)","Religious (Non-Music)","Spoken Word (Non-Music)","Ballad (Pop)","Bollywood (Pop)","Bubblegum (Pop)","Chanson (Pop)","City Pop (Pop)","Europop (Pop)","Indie Pop (Pop)","J-pop (Pop)","K-pop (Pop)","Kay\u014dkyoku (Pop)","Light Music (Pop)","Music Hall (Pop)","Novelty (Pop)","Parody (Pop)","Schlager (Pop)","Vocal (Pop)","Calypso (Reggae)","Dancehall (Reggae)","Dub (Reggae)","Lovers Rock (Reggae)","Ragga (Reggae)","Reggae (Reggae)","Reggae-Pop (Reggae)","Rocksteady (Reggae)","Roots Reggae (Reggae)","Ska (Reggae)","Soca (Reggae)","AOR (Rock)","Acid Rock (Rock)","Acoustic (Rock)","Alternative Rock (Rock)","Arena Rock (Rock)","Art Rock (Rock)","Atmospheric Black Metal (Rock)","Avantgarde (Rock)","Beat (Rock)","Black Metal (Rock)","Blues Rock (Rock)","Brit Pop (Rock)","Classic Rock (Rock)","Coldwave (Rock)","Country Rock (Rock)","Crust (Rock)","Death Metal (Rock)","Deathcore (Rock)","Deathrock (Rock)","Depressive Black Metal (Rock)","Doo Wop (Rock)","Doom Metal (Rock)","Dream Pop (Rock)","Emo (Rock)","Ethereal (Rock)","Experimental (Rock)","Folk Metal (Rock)","Folk Rock (Rock)","Funeral Doom Metal (Rock)","Funk Metal (Rock)","Garage Rock (Rock)","Glam (Rock)","Goregrind (Rock)","Goth Rock (Rock)","Gothic Metal (Rock)","Grindcore (Rock)","Grunge (Rock)","Hard Rock (Rock)","Hardcore (Rock)","Heavy Metal (Rock)","Indie Rock (Rock)","Industrial (Rock)","Krautrock (Rock)","Lo-Fi (Rock)","Lounge (Rock)","Math Rock (Rock)","Melodic Death Metal (Rock)","Melodic Hardcore (Rock)","Metalcore (Rock)","Mod (Rock)","Neofolk (Rock)","New Wave (Rock)","No Wave (Rock)","Noise (Rock)","Noisecore (Rock)","Nu Metal (Rock)","Oi (Rock)","Parody (Rock)","Pop Punk (Rock)","Pop Rock (Rock)","Pornogrind (Rock)","Post Rock (Rock)","Post-Hardcore (Rock)","Post-Metal (Rock)","Post-Punk (Rock)","Power Metal (Rock)","Power Pop (Rock)","Power Violence (Rock)","Prog Rock (Rock)","Progressive Metal (Rock)","Psychedelic Rock (Rock)","Psychobilly (Rock)","Pub Rock (Rock)","Punk (Rock)","Rock & Roll (Rock)","Rockabilly (Rock)","Shoegaze (Rock)","Ska (Rock)","Sludge Metal (Rock)","Soft Rock (Rock)","Southern Rock (Rock)","Space Rock (Rock)","Speed Metal (Rock)","Stoner Rock (Rock)","Surf (Rock)","Symphonic Rock (Rock)","Technical Death Metal (Rock)","Thrash (Rock)","Twist (Rock)","Viking Metal (Rock)","Y\u00e9-Y\u00e9 (Rock)","Musical (Stage & Screen)","Score (Stage & Screen)","Soundtrack (Stage & Screen)","Theme (Stage & Screen)"], AUDIOSET = ["Speech","Male speech, man speaking","Female speech, woman speaking","Child speech, kid speaking","Conversation","Narration, monologue","Babbling","Speech synthesizer","Shout","Bellow","Whoop","Yell","Battle cry","Children shouting","Screaming","Whispering","Laughter","Baby laughter","Giggle","Snicker","Belly laugh","Chuckle, chortle","Crying, sobbing","Baby cry, infant cry","Whimper","Wail, moan","Sigh","Singing","Choir","Yodeling","Chant","Mantra","Male singing","Female singing","Child singing","Synthetic singing","Rapping","Humming","Groan","Grunt","Whistling","Breathing","Wheeze","Snoring","Gasp","Pant","Snort","Cough","Throat clearing","Sneeze","Sniff","Run","Shuffle","Walk, footsteps","Chewing, mastication","Biting","Gargling","Stomach rumble","Burping, eructation","Hiccup","Fart","Hands","Finger snapping","Clapping","Heart sounds, heartbeat","Heart murmur","Cheering","Applause","Chatter","Crowd","Hubbub, speech noise, speech babble","Children playing","Animal","Domestic animals, pets","Dog","Bark","Yip","Howl","Bow-wow","Growling","Whimper (dog)","Cat","Purr","Meow","Hiss","Caterwaul","Livestock, farm animals, working animals","Horse","Clip-clop","Neigh, whinny","Cattle, bovinae","Moo","Cowbell","Pig","Oink","Goat","Bleat","Sheep","Fowl","Chicken, rooster","Cluck","Crowing, cock-a-doodle-doo","Turkey","Gobble","Duck","Quack","Goose","Honk","Wild animals","Roaring cats (lions, tigers)","Roar","Bird","Bird vocalization, bird call, bird song","Chirp, tweet","Squawk","Pigeon, dove","Coo","Crow","Caw","Owl","Hoot","Bird flight, flapping wings","Canidae, dogs, wolves","Rodents, rats, mice","Mouse","Patter","Insect","Cricket","Mosquito","Fly, housefly","Buzz","Bee, wasp, etc.","Frog","Croak","Snake","Rattle","Whale vocalization","Music","Musical instrument","Plucked string instrument","Guitar","Electric guitar","Bass guitar","Acoustic guitar","Steel guitar, slide guitar","Tapping (guitar technique)","Strum","Banjo","Sitar","Mandolin","Zither","Ukulele","Keyboard (musical)","Piano","Electric piano","Organ","Electronic organ","Hammond organ","Synthesizer","Sampler","Harpsichord","Percussion","Drum kit","Drum machine","Drum","Snare drum","Rimshot","Drum roll","Bass drum","Timpani","Tabla","Cymbal","Hi-hat","Wood block","Tambourine","Rattle (instrument)","Maraca","Gong","Tubular bells","Mallet percussion","Marimba, xylophone","Glockenspiel","Vibraphone","Steelpan","Orchestra","Brass instrument","French horn","Trumpet","Trombone","Bowed string instrument","String section","Violin, fiddle","Pizzicato","Cello","Double bass","Wind instrument, woodwind instrument","Flute","Saxophone","Clarinet","Harp","Bell","Church bell","Jingle bell","Bicycle bell","Tuning fork","Chime","Wind chime","Change ringing (campanology)","Harmonica","Accordion","Bagpipes","Didgeridoo","Shofar","Theremin","Singing bowl","Scratching (performance technique)","Pop music","Hip hop music","Beatboxing","Rock music","Heavy metal","Punk rock","Grunge","Progressive rock","Rock and roll","Psychedelic rock","Rhythm and blues","Soul music","Reggae","Country","Swing music","Bluegrass","Funk","Folk music","Middle Eastern music","Jazz","Disco","Classical music","Opera","Electronic music","House music","Techno","Dubstep","Drum and bass","Electronica","Electronic dance music","Ambient music","Trance music","Music of Latin America","Salsa music","Flamenco","Blues","Music for children","New-age music","Vocal music","A capella","Music of Africa","Afrobeat","Christian music","Gospel music","Music of Asia","Carnatic music","Music of Bollywood","Ska","Traditional music","Independent music","Song","Background music","Theme music","Jingle (music)","Soundtrack music","Lullaby","Video game music","Christmas music","Dance music","Wedding music","Happy music","Funny music","Sad music","Tender music","Exciting music","Angry music","Scary music","Wind","Rustling leaves","Wind noise (microphone)","Thunderstorm","Thunder","Water","Rain","Raindrop","Rain on surface","Stream","Waterfall","Ocean","Waves, surf","Steam","Gurgling","Fire","Crackle","Vehicle","Boat, Water vehicle","Sailboat, sailing ship","Rowboat, canoe, kayak","Motorboat, speedboat","Ship","Motor vehicle (road)","Car","Vehicle horn, car horn, honking","Toot","Car alarm","Power windows, electric windows","Skidding","Tire squeal","Car passing by","Race car, auto racing","Truck","Air brake","Air horn, truck horn","Reversing beeps","Ice cream truck, ice cream van","Bus","Emergency vehicle","Police car (siren)","Ambulance (siren)","Fire engine, fire truck (siren)","Motorcycle","Traffic noise, roadway noise","Rail transport","Train","Train whistle","Train horn","Railroad car, train wagon","Train wheels squealing","Subway, metro, underground","Aircraft","Aircraft engine","Jet engine","Propeller, airscrew","Helicopter","Fixed-wing aircraft, airplane","Bicycle","Skateboard","Engine","Light engine (high frequency)","Dental drill, dentist's drill","Lawn mower","Chainsaw","Medium engine (mid frequency)","Heavy engine (low frequency)","Engine knocking","Engine starting","Idling","Accelerating, revving, vroom","Door","Doorbell","Ding-dong","Sliding door","Slam","Knock","Tap","Squeak","Cupboard open or close","Drawer open or close","Dishes, pots, and pans","Cutlery, silverware","Chopping (food)","Frying (food)","Microwave oven","Blender","Water tap, faucet","Sink (filling or washing)","Bathtub (filling or washing)","Hair dryer","Toilet flush","Toothbrush","Electric toothbrush","Vacuum cleaner","Zipper (clothing)","Keys jangling","Coin (dropping)","Scissors","Electric shaver, electric razor","Shuffling cards","Typing","Typewriter","Computer keyboard","Writing","Alarm","Telephone","Telephone bell ringing","Ringtone","Telephone dialing, DTMF","Dial tone","Busy signal","Alarm clock","Siren","Civil defense siren","Buzzer","Smoke detector, smoke alarm","Fire alarm","Foghorn","Whistle","Steam whistle","Mechanisms","Ratchet, pawl","Clock","Tick","Tick-tock","Gears","Pulleys","Sewing machine","Mechanical fan","Air conditioning","Cash register","Printer","Camera","Single-lens reflex camera","Tools","Hammer","Jackhammer","Sawing","Filing (rasp)","Sanding","Power tool","Drill","Explosion","Gunshot, gunfire","Machine gun","Fusillade","Artillery fire","Cap gun","Fireworks","Firecracker","Burst, pop","Eruption","Boom","Wood","Chop","Splinter","Crack","Glass","Chink, clink","Shatter","Liquid","Splash, splatter","Slosh","Squish","Drip","Pour","Trickle, dribble","Gush","Fill (with liquid)","Spray","Pump (liquid)","Stir","Boiling","Sonar","Arrow","Whoosh, swoosh, swish","Thump, thud","Thunk","Electronic tuner","Effects unit","Chorus effect","Basketball bounce","Bang","Slap, smack","Whack, thwack","Smash, crash","Breaking","Bouncing","Whip","Flap","Scratch","Scrape","Rub","Roll","Crushing","Crumpling, crinkling","Tearing","Beep, bleep","Ping","Ding","Clang","Squeal","Creak","Rustle","Whir","Clatter","Sizzle","Clicking","Clickety-clack","Rumble","Plop","Jingle, tinkle","Hum","Zing","Boing","Crunch","Silence","Sine wave","Harmonic","Chirp tone","Sound effect","Pulse","Inside, small room","Inside, large room or hall","Inside, public space","Outside, urban or manmade","Outside, rural or natural","Reverberation","Echo","Noise","Environmental noise","Static","Mains hum","Distortion","Sidetone","Cacophony","White noise","Pink noise","Throbbing","Vibration","Television","Radio","Field recording"];
  const TAG_FALLBACK = { tg_hgenre: 'https://essentia.upf.edu/models/classification-heads/genre_discogs400/genre_discogs400-discogs-effnet-1.onnx' };
  const AS_GENRE = [216, 265], AS_MOOD = [276, 282], AS_NOT_INST = new Set([145, 146, 166, 167, 192]);
  const asInst = i => (i >= 140 && i <= 199 && !AS_NOT_INST.has(i)) || [208, 209, 210, 211, 213].includes(i);

  async function ensureTagFile(key, status, low, pr) {
    const f = TAG_FILES[key];
    if (NATIVE && /\.onnx$/.test(f)) {                                 // the app's native engine reads its own model store, not IndexedDB
      if ((await NP.exists({ id: key })).ready) return;
      status('Downloading ' + f.split('/').pop() + '…');
      try { await nativeFetch(key, f, status); } catch (e) { if (!TAG_FALLBACK[key]) throw e; await nativeFetch(key, TAG_FALLBACK[key], status); }
      return;
    }
    if (await idbGet(key)) return;
    await fetchPart(key, f, (g, t) => { status('Downloading ' + f.split('/').pop() + ' ' + (t ? Math.round(g / t * 100) + '%' : (g / 1048576 | 0) + ' MB')); pr && pr(g, t); }, low);
  }
  async function decodeMono(url, sr) {
    const buf = await (await fetch(url)).arrayBuffer();
    const ctx = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: sr });
    const ab = await ctx.decodeAudioData(buf); ctx.close && ctx.close();
    const a = ab.getChannelData(0), b = ab.numberOfChannels > 1 ? ab.getChannelData(1) : null, o = new Float32Array(a.length);
    for (let i = 0; i < o.length; i++) o[i] = b ? (a[i] + b[i]) * 0.5 : a[i];
    return o;
  }
  function parseNpy(buf) {                                              // float32/float64 C-order array -> Float32Array
    const dv = new DataView(buf), v2 = dv.getUint8(6) >= 2, hl = v2 ? dv.getUint32(8, true) : dv.getUint16(8, true), off = (v2 ? 12 : 10) + hl;
    const head = new TextDecoder().decode(new Uint8Array(buf, v2 ? 12 : 10, hl));
    if (/fortran_order'?:\s*True/.test(head)) throw new Error('melbank.npy is Fortran order');
    const raw = buf.slice(off);
    return Float32Array.from(/<f8/.test(head) ? new Float64Array(raw) : new Float32Array(raw));
  }
  // 16 kHz mono -> log-mel frames [nFrames * 96], the recipe the Discogs-EffNet export was checked against
  async function effnetMel(x, bank) {
    const M = 512, H = 256, NB = 96, K = 257, nF = Math.floor(x.length / H) + 1, fftS = makeFFT(M);
    if (bank.length !== NB * K) throw new Error('melbank has the wrong size');
    const w = new Float64Array(M); for (let i = 0; i < M; i++) w[i] = 0.5 - 0.5 * Math.cos(2 * Math.PI * i / (M - 1));   // symmetric Hann
    const mel = new Float32Array(nF * NB), re = new Float64Array(M), im = new Float64Array(M), pw = new Float64Array(K);
    const blo = new Int32Array(NB), bhi = new Int32Array(NB);                // where each mel filter is non-zero: skip the rest of the 257 bins
    for (let b = 0; b < NB; b++) { let lo = K, hi = -1; for (let k = 0; k < K; k++) if (bank[b * K + k] !== 0) { if (k < lo) lo = k; hi = k; } blo[b] = lo; bhi[b] = hi; }
    for (let f = 0; f < nF; f++) {
      const st = f * H - H;                                           // frame centred on f*256 (256 zeros in front)
      for (let j = 0; j < M; j++) { const q = st + j; re[j] = (q >= 0 && q < x.length ? x[q] : 0) * w[j]; im[j] = 0; }
      fftS(re, im);
      for (let k = 0; k < K; k++) pw[k] = re[k] * re[k] + im[k] * im[k];
      for (let b = 0; b < NB; b++) { let a = 0; const o = b * K, hi = bhi[b]; for (let k = blo[b]; k <= hi; k++) a += bank[o + k] * pw[k]; mel[f * NB + b] = Math.log10(1 + 10000 * a); }
      if (f % 300 === 299) await tick();
    }
    return mel;
  }
  // ---------- Extra mood/trait heads (optional) ----------
  // Small classifiers that run on the same 1280-number Discogs-EffNet embedding, so they cost almost nothing.
  // Convert them once with convert_heads.py, upload the .onnx files + tagger-heads.json to HF_BASE. Missing = skipped.
  let headsMemo = null;
  // Built-in mood heads: MTG/Essentia's public ONNX classifiers for the Discogs-EffNet embedding (~0.5 MB each, ~4 MB total).
  // The ids match what the smart playlists / auto-EQ read (relaxed, aggressive, party, happy, sad, danceable, acoustic, electronic).
  // Your own tagger-heads.json in HF_BASE still wins if you upload one. Turn the whole thing off with the "Mood models" checkbox.
  const ESS = 'https://essentia.upf.edu/models/classification-heads/';
  const BUILTIN_HEADS = [
    ['happy', 'mood_happy', 'Happy', 0], ['sad', 'mood_sad', 'Sad', 1], ['relaxed', 'mood_relaxed', 'Relaxed', 1], ['aggressive', 'mood_aggressive', 'Aggressive', 0],
    ['party', 'mood_party', 'Party', 1], ['acoustic', 'mood_acoustic', 'Acoustic', 0], ['electronic', 'mood_electronic', 'Electronic', 0], ['danceable', 'danceability', 'Danceable', 0]
  ].map(([id, dir, label, pos]) => ({ id, label, pos, base: dir + '-discogs-effnet-1', file: ESS + dir + '/' + dir + '-discogs-effnet-1.onnx', info: ESS + dir + '/' + dir + '-discogs-effnet-1.json' }));
  // Extra heads on the same embedding (each ~0.5 MB, almost free to run): 56 moods/themes, singer's voice, bright/dark tone,
  // how approachable (mainstream) and how engaging a track is. Same download routes as the mood heads. Any that cannot be
  // downloaded are skipped (and not retried for 3 days), so they never block tagging. Multi-class heads need their .json
  // (class names); two-class ones fall back to the names below.
  const EXTRA_HEADS = [
    ['theme', 'mtg_jamendo_moodtheme', 'Mood/theme', 'multi', 'theme', null],
    ['gender', 'gender', 'Voice', 'class', 'gender', ['female', 'male']],
    ['tone', 'nsynth_bright_dark', 'Tone', 'class', 'timbre', ['bright', 'dark']],
    ['approachable', 'approachability_2c', 'Approachable', 'binary', 'feel', ['not_approachable', 'approachable']],
    ['engaging', 'engagement_2c', 'Engaging', 'binary', 'feel', ['not_engaging', 'engaging']]
  ].map(([id, dir, label, kind, group, classes]) => ({ id, label, kind, group, classes, pos: 1, extra: true, base: dir + '-discogs-effnet-1', file: ESS + dir + '/' + dir + '-discogs-effnet-1.onnx', info: ESS + dir + '/' + dir + '-discogs-effnet-1.json' }));
  const HEAD_MISS = 'ppvHeadMiss', MISS_MS = 3 * 864e5;
  const headMiss = () => { try { return JSON.parse(localStorage.getItem(HEAD_MISS)) || {}; } catch (e) { return {}; } };
  const setHeadMiss = (id, on) => { const m = headMiss(); if (on) m[id] = Date.now(); else delete m[id]; try { localStorage.setItem(HEAD_MISS, JSON.stringify(m)); } catch (e) {} };
  const moodsOn = () => { try { return localStorage.getItem('ppvMoods') !== '0'; } catch (e) { return true; } };
  // Fetch with a hard deadline (response start AND stalls mid-download), so a dead host can never freeze the app.
  async function fetchTimed(url, ms, onProgress) {
    const ac = new AbortController(); let t = setTimeout(() => ac.abort(), ms);
    try {
      const r = await fetch(url, { mode: 'cors', signal: ac.signal });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const total = +r.headers.get('content-length') || 0, rd = r.body.getReader(), chunks = []; let n = 0;
      for (;;) { clearTimeout(t); t = setTimeout(() => ac.abort(), ms); const { done, value } = await rd.read(); if (done) break; chunks.push(value); n += value.length; onProgress && onProgress(n, total); }
      const out = new Uint8Array(n); let o = 0; for (const c of chunks) { out.set(c, o); o += c.length; }
      return out.buffer;
    } catch (e) { throw ac.signal.aborted ? new Error('timed out') : e; }
    finally { clearTimeout(t); }
  }
  let headsFailed = false;                                           // set when every route failed this session, so we stop retrying every track
  // Routes to try, in order: your own HF repo (if you uploaded the file), Essentia directly, then public CORS relays
  // (they only ever see the public model file URL, never your music). The route that works is tried first next time.
  const HEAD_ROUTES = [
    (u, f) => HF_BASE + f,
    (u) => u,
    (u) => 'https://corsproxy.io/?url=' + encodeURIComponent(u),
    (u) => 'https://api.allorigins.win/raw?url=' + encodeURIComponent(u),
    (u) => 'https://api.codetabs.com/v1/proxy/?quest=' + u
  ];
  let headRoute = 0;
  async function fetchHeadFile(b, ext, ms, onProgress) {
    const u = ext === 'onnx' ? b.file : b.info, f = b.base + '.' + ext, order = [headRoute, ...HEAD_ROUTES.keys()].filter((v, i, a) => a.indexOf(v) === i);
    let last = null;
    for (const i of order) {
      try {
        const buf = await fetchTimed(HEAD_ROUTES[i](u, f), ms, onProgress);
        if (ext === 'onnx') { const hd = new Uint8Array(buf, 0, Math.min(16, buf.byteLength)); if (buf.byteLength < 1024 || hd[0] === 0x3C) throw new Error('not an ONNX file'); }
        headRoute = i; return buf;
      } catch (e) { last = e; console.warn('mood route', i, 'failed for', f, e && e.message); }
    }
    throw last || new Error('all routes failed');
  }
  // App: the mood models used to come only from essentia.upf.edu, so when that server was down every one failed.
  // Now your own Hugging Face repo (HF_BASE) is tried first, under Essentia's file name or the short one
  // (mood_happy-discogs-effnet-1.onnx or mood_happy.onnx), then Essentia itself.
  async function nativeHeadFetch(b) {
    const short = b.base.replace(/-discogs-effnet-1$/, '');
    const tries = [b.base + '.onnx', short + '.onnx', b.file];
    let last = null;
    for (const f of tries) {
      try { await nativeFetch('tgh_' + b.id, f, () => {}); return; }
      catch (e) { last = e; }
    }
    throw new Error('not found in your Hugging Face repo or on essentia.upf.edu (' + errText(last) + ')');
  }
  let headsLog = [];                                                 // why each mood model failed, shown in the tag result
  async function builtinHeads(status, low, prog) {
    if (headsFailed) return [];
    const miss = headMiss(), LIST = BUILTIN_HEADS.concat(EXTRA_HEADS.filter(b => !(miss[b.id] && Date.now() - miss[b.id] < MISS_MS)));
    const ok = new Array(LIST.length).fill(null); let got = 0;
    const one = async (b, k) => {
      try {
        let h = null; try { const c = await idbGet('tghm_' + b.id); if (c) h = JSON.parse(c); } catch (e) {}
        if (!h || !(NATIVE ? (await NP.exists({ id: 'tgh_' + b.id })).ready : await idbGet('tgh_' + b.id))) {
          h = { id: b.id, label: b.label, kind: b.kind || 'binary', group: b.group || 'mood', pos: b.pos, classes: b.classes ? b.classes.slice() : null };
          const buf = NATIVE ? (await nativeHeadFetch(b), null) : await fetchHeadFile(b, 'onnx', 8000);
          let j = null; try { j = JSON.parse(new TextDecoder().decode(await fetchHeadFile(b, 'json', 4000))); } catch (e) {}
          if (j && Array.isArray(j.classes) && j.classes.length >= 2 && (h.kind === 'multi' || j.classes.length === 2)) h.classes = j.classes;
          if (h.kind === 'binary' && h.classes && h.classes.length === 2) { const p = h.classes.findIndex(c => !/^(non|not)[_ -]/i.test(c)); if (p >= 0) h.pos = p; }
          if (h.kind !== 'binary' && !h.classes) throw new Error('class names (.json) not found');
          if (buf) await idbPut('tgh_' + b.id, buf);
          await idbPut('tghm_' + b.id, JSON.stringify(h));
        }
        ok[k] = h; headsFailed = false; if (b.extra) setHeadMiss(b.id, false);
      } catch (e) { if (b.extra) setHeadMiss(b.id, true); else headsLog.push(b.label + ': ' + ((e && e.message) || e)); console.warn('mood head skipped', b.id, e); }
      finally { got++; status('Mood & theme models: ' + got + ' of ' + LIST.length + ' ready…'); prog && prog(got / LIST.length); }
    };
    status('Mood & theme models: checking…');
    const all = Promise.all(LIST.map(one));                           // all at once, so the wait is the slowest one, not the sum
    await Promise.race([all, new Promise(r => setTimeout(r, 25000))]);   // never hold up tagging for more than 25 s
    if (got < LIST.length) headsLog.push('some are still downloading in the background, they will be ready next run');
    const out = ok.filter(Boolean);
    if (!out.some(h => !EXTRA_HEADS.some(b => b.id === h.id))) headsFailed = true;                              // skip the wait on the next tracks (cleared if a background download succeeds, or by Refresh)
    return out;
  }
  async function loadHeads(status, low, enabled, prog) {
    headsLog = [];
    if (enabled === false) return [];
    if (headsMemo) return headsMemo;
    let man = null;
    try { const c = await idbGet('tg_manifest'); if (c) man = JSON.parse(c); } catch (e) {}
    if (!man) {
      try { man = JSON.parse(new TextDecoder().decode(await fetchTimed(HF_BASE + 'tagger-heads.json', 6000))); await idbPut('tg_manifest', JSON.stringify(man)); } catch (e) { man = null; }
    }
    const heads = [];
    for (const h of ((man && man.heads) || [])) {
      try {
        if (NATIVE) { if (!(await NP.exists({ id: 'tgh_' + h.id })).ready) await nativeFetch('tgh_' + h.id, h.file, () => {}); }
        else if (!(await idbGet('tgh_' + h.id))) await fetchPart('tgh_' + h.id, h.file, (g, t) => status('Downloading ' + h.file + ' ' + (t ? Math.round(g / t * 100) + '%' : '')), low);
        heads.push(h);
      } catch (e) { console.warn('head skipped', h.id, e); }
    }
    let custom = heads.length > 0;
    if (!custom) heads.push(...await builtinHeads(status, low, prog));
    const core = heads.filter(h => BUILTIN_HEADS.some(b => b.id === h.id)).length;
    return heads.length && (custom || core === BUILTIN_HEADS.length) ? (headsMemo = heads) : heads;   // only remember a complete set       // don't remember an empty result, so a later run can try again
  }
  async function resetHeads() {
    headsMemo = null; headsFailed = false;
    try { const c = await idbGet('tg_manifest'); if (c) for (const h of (JSON.parse(c).heads || [])) await idbDel('tgh_' + h.id); } catch (e) {}
    await idbDel('tg_manifest').catch(() => {});
    try { localStorage.removeItem(HEAD_MISS); } catch (e) {}
    for (const b of BUILTIN_HEADS.concat(EXTRA_HEADS)) { if (NATIVE) await NP.remove({ id: 'tgh_' + b.id }).catch(() => {}); await idbDel('tgh_' + b.id).catch(() => {}); await idbDel('tghm_' + b.id).catch(() => {}); }
  }

