  // ---------- Fast re-encode (WebCodecs) ----------
  // Demuxes the MP4 with the app's own sample-table reader, decodes the chosen range with VideoDecoder,
  // draws each frame through the same filter string the player uses (canvas), re-encodes with
  // VideoEncoder and muxes with mp4-muxer. Audio is rendered offline (speed + effects) and encoded
  // with AudioEncoder. Errors flagged `fallback` make the caller drop back to real-time recording.
  async function exportVideoClipFast(track, start, end, onProgress, fx, opts){
    const fail = (m) => { const e = new Error(m); e.fallback = true; return e; };
    const lowLatency = !(opts && opts.noLowLatency);   // decoder low-latency hint (retried without it if frames come out of order)
    if (!CUTTER_WEBCODECS) throw fail('This phone has no WebCodecs support.');
    const srcFile = await getCutterSource(track);
    if (!srcFile.isMp4) throw fail('Fast re-encode needs an MP4 or MOV source.');
    if (onProgress) onProgress(0, 'Reading video…');
    const info = await MP4T.readForDecode(srcFile.blob);
    const tr = info.track, ts = tr.timescale, offSec = tr.offset0 / ts;
    const speed = (fx && fx.speed) || 1;
    const picDelay = ((fx && fx.picDelay) || 0) / 1000;
    const lookStr = (fx && fx.look && CUTTER_CTX_FILTER) ? fx.look : null;
    const outDur = Math.max(0.05, (end - start) / speed);

    // Which samples to decode: from the keyframe at/before the start, through a few past the end.
    const S = Math.round(start * ts) + tr.offset0, E = Math.round(end * ts) + tr.offset0;
    let k = -1;
    for (let i = 0; i < tr.n; i++){
      if (tr.dts[i] > S && k >= 0) break;
      if (tr.sync[i] && tr.dts[i] + tr.cto[i] <= S) k = i;
    }
    if (k < 0){ k = 0; while (k < tr.n && !tr.sync[k]) k++; if (k >= tr.n) k = 0; }
    let m = k;
    for (let i = k; i < tr.n; i++){ if (tr.dts[i] < E) m = i; else break; }
    m = Math.min(tr.n - 1, m + 8);              // frames reorder, so decode a little past the end
    let bytesTotal = 0;
    for (let i = k; i <= m; i++) bytesTotal += tr.size[i];
    const srcDur = Math.max(0.1, (tr.dts[m] + tr.delta[m] - tr.dts[k]) / ts);
    const fps = Math.min(120, Math.max(1, (m - k + 1) / srcDur));
    const encFps = Math.min(60, fps * Math.max(1, speed));
    const bitrate = Math.round(Math.min(60e6, Math.max(2e6, bytesTotal * 8 / srcDur * 1.15)));
    const eW = info.width + (info.width & 1), eH = info.height + (info.height & 1);

    // Prefer the device's video hardware for decoding; fall back to whatever the browser picks.
    let dcfg = null;
    for (const hw of ['prefer-hardware', 'no-preference']){
      const c = { codec: info.codec, codedWidth: info.width, codedHeight: info.height, description: info.description, hardwareAcceleration: hw, optimizeForLatency: lowLatency };
      const ds = await VideoDecoder.isConfigSupported(c).catch(() => ({ supported: false }));
      if (ds.supported){ dcfg = c; break; }
    }
    if (!dcfg) throw fail('This phone cannot decode this video.');
    const px = eW * eH;
    const lvl = px <= 921600 ? '1f' : px <= 2097152 ? '28' : px <= 8912896 ? '33' : '34';
    // Hardware encoder first (any H.264 profile), then the browser's default (may be a slow software encoder).
    let ecfg = null;
    for (const hw of ['prefer-hardware', 'no-preference']){
      for (const codec of ['avc1.6400' + lvl, 'avc1.4d00' + lvl, 'avc1.4200' + lvl]){
        const c = { codec, width: eW, height: eH, bitrate, framerate: encFps, latencyMode: 'realtime', hardwareAcceleration: hw, avc: { format: 'avc' } };
        const s = await VideoEncoder.isConfigSupported(c).catch(() => ({ supported: false }));
        if (s.supported){ ecfg = c; break; }
      }
      if (ecfg) break;
    }
    if (!ecfg) throw fail('This phone cannot encode H.264 video.');

    let aborted = false, failure = null;
    const closers = [];
    cutterExportAbort = () => { aborted = true; };
    const check = () => {
      if (aborted){ const e = new Error('Export cancelled.'); e.cancelled = true; throw e; }
      if (failure) throw failure;
    };
    // Wait for a codec queue to drain (event based, so it isn't slowed by background-tab timer throttling).
    const waitDrain = (codec) => new Promise(res => {
      const f = () => { codec.removeEventListener('dequeue', f); clearTimeout(t); res(); };
      const t = setTimeout(f, 60);
      codec.addEventListener('dequeue', f);
    });

    try {
      // ----- audio: render offline with speed + effects, then encode -----
      let audio = null;
      let abuf = null;
      try {
        abuf = await cutterRenderAudio(track, start, end, fx || { speed: 1, audio: null }, (p, l) => { if (onProgress) onProgress(p * 0.15, l); });
      } catch (e){ abuf = null; }       // a video with no sound has nothing to decode
      check();
      if (abuf){
        const sr = abuf.sampleRate, ch = Math.min(2, abuf.numberOfChannels);
        const maxFrames = Math.min(abuf.length, Math.ceil(outDur * sr));
        let acodec = null, acfg = null;
        for (const c of ['mp4a.40.2', 'opus']){
          const cfg = { codec: c, sampleRate: sr, numberOfChannels: ch, bitrate: 192000 };
          const s = await AudioEncoder.isConfigSupported(cfg).catch(() => ({ supported: false }));
          if (s.supported){ acodec = c; acfg = cfg; break; }
        }
        if (!acodec) throw fail('This phone has no audio encoder for MP4.');
        const chunks = [];
        const aenc = new AudioEncoder({ output: (chunk, meta) => { chunks.push({ chunk, meta }); }, error: (e) => { failure = e; } });
        closers.push(() => { if (aenc.state !== 'closed') aenc.close(); });
        aenc.configure(acfg);
        const BLK = 8192;
        for (let i = 0; i < maxFrames; i += BLK){
          const n = Math.min(BLK, maxFrames - i);
          const data = new Float32Array(n * ch);
          for (let c = 0; c < ch; c++) data.set(abuf.getChannelData(c).subarray(i, i + n), c * n);
          const ad = new AudioData({ format: 'f32-planar', sampleRate: sr, numberOfFrames: n, numberOfChannels: ch, timestamp: Math.round(i / sr * 1e6), data });
          aenc.encode(ad); ad.close();
          if (aenc.encodeQueueSize > 16) await waitDrain(aenc);
          check();
        }
        await aenc.flush();
        check();
        audio = { chunks, codec: acodec === 'opus' ? 'opus' : 'aac', ch, sr };
      }
      abuf = null;

      // ----- muxer + video encoder -----
      const target = new Mp4Muxer.ArrayBufferTarget();
      const muxer = new Mp4Muxer.Muxer({
        target,
        video: { codec: 'avc', width: eW, height: eH, rotation: info.rotation },
        ...(audio ? { audio: { codec: audio.codec, numberOfChannels: audio.ch, sampleRate: audio.sr } } : {}),
        fastStart: 'in-memory',
        firstTimestampBehavior: 'offset'
      });
      let ai = 0;
      const flushAudio = (tsUs) => {
        if (!audio) return;
        while (ai < audio.chunks.length && audio.chunks[ai].chunk.timestamp <= tsUs){
          muxer.addAudioChunk(audio.chunks[ai].chunk, audio.chunks[ai].meta);
          ai++;
        }
      };
      const venc = new VideoEncoder({
        output: (chunk, meta) => { try { flushAudio(chunk.timestamp); muxer.addVideoChunk(chunk, meta); } catch(e){ failure = e; } },
        error: (e) => { failure = e; }
      });
      closers.push(() => { if (venc.state !== 'closed') venc.close(); });
      venc.configure(ecfg);

      let canvas = null, cctx = null, lastOut = -1, frameIdx = 0, firstDone = false, lastFrameTs = -Infinity;
      const frameDur = (1 / fps) / speed;
      const gop = Math.max(1, Math.round(encFps * 2));
      const minGap = speed > 1 ? 0.9 / 60 : 0;
      const encodeOne = (srcFrame, drawn, tsSec, durSec) => {
        const init = { timestamp: Math.round(tsSec * 1e6), duration: Math.max(1, Math.round(durSec * 1e6)) };
        const vf = drawn ? new VideoFrame(canvas, init) : new VideoFrame(srcFrame, init);
        venc.encode(vf, { keyFrame: (frameIdx++ % gop) === 0 });
        vf.close();
      };
      const onFrame = (frame) => {
        try {
          if (lowLatency){
            // Low-latency decoding can emit B-frame video out of order; bail out so the caller retries without it.
            if (frame.timestamp < lastFrameTs){ const e = new Error('Decoder returned frames out of order.'); e.reorder = true; throw e; }
            lastFrameTs = frame.timestamp;
          }
          const srcT = frame.timestamp / 1e6 - offSec;
          if (srcT < start - 0.5 / fps || srcT >= end - 0.0005) return;       // lead-in / beyond the selection
          const outT = Math.max(0, (srcT - start) / speed) + picDelay;
          if (outT > outDur + 1e-4) return;
          if (lastOut >= 0 && outT - lastOut < minGap) return;
          let drawn = false;
          if (lookStr || frame.displayWidth !== eW || frame.displayHeight !== eH){
            if (!canvas){
              canvas = document.createElement('canvas');
              canvas.width = eW; canvas.height = eH;
              cctx = canvas.getContext('2d');
              if (lookStr) cctx.filter = lookStr;
            }
            cctx.drawImage(frame, 0, 0, eW, eH);
            drawn = true;
          }
          if (!firstDone){
            firstDone = true;
            if (picDelay > 0) encodeOne(frame, drawn, 0, picDelay);          // hold the first picture while the delay runs
          }
          encodeOne(frame, drawn, outT, frameDur);
          lastOut = outT;
        } catch(e){ failure = e; }
        finally { frame.close(); }
      };

      // ----- decode the selected samples -----
      const vdec = new VideoDecoder({ output: onFrame, error: (e) => { failure = e; } });
      closers.push(() => { if (vdec.state !== 'closed') vdec.close(); });
      vdec.configure(dcfg);

      let win = null, winStart = 0;
      const WIN = 16 * 1024 * 1024;
      const bytes = async (off, size) => {
        if (!win || off < winStart || off + size > winStart + win.length){
          winStart = off;
          win = new Uint8Array(await srcFile.blob.slice(off, off + Math.max(size, WIN)).arrayBuffer());
        }
        return win.subarray(off - winStart, off - winStart + size);
      };
      for (let i = k; i <= m; i++){
        check();
        const data = await bytes(tr.off[i], tr.size[i]);
        vdec.decode(new EncodedVideoChunk({
          type: tr.sync[i] ? 'key' : 'delta',
          timestamp: Math.round((tr.dts[i] + tr.cto[i]) / ts * 1e6),
          duration: Math.round(tr.delta[i] / ts * 1e6),
          data
        }));
        while (vdec.decodeQueueSize > 16 || venc.encodeQueueSize > 12){
          check();
          await waitDrain(vdec.decodeQueueSize > 16 ? vdec : venc);
        }
        if (onProgress && (i & 7) === 0) onProgress(0.15 + 0.8 * Math.min(1, (i - k) / Math.max(1, m - k)), 'Encoding clip…');
      }
      await vdec.flush(); check();
      await venc.flush(); check();
      if (!frameIdx) throw fail('No frames were decoded from the selection.');
      flushAudio(Infinity);
      muxer.finalize();
      if (onProgress) onProgress(1, 'Done');
      return new Blob([target.buffer], { type: 'video/mp4' });
    } finally {
      closers.forEach(f => { try { f(); } catch(e){} });
      cutterExportAbort = null;
    }
  }

  // Video clip export: play a hidden copy of the source from `start` to `end`
  // and record it with MediaRecorder. Audio is routed through Web Audio into a
  // MediaStreamDestination (never to the speakers), so the export is silent
  // and doesn't touch the main player or its effects chain.
  async function exportVideoClip(track, start, end, onProgress, fx){
    if (!CUTTER_VIDEO_REC) throw new Error('This phone cannot record video clips. Export audio only instead.');
    const v = document.createElement('video');
    v.playsInline = true;
    v.preload = 'auto';
    v.src = track.url;
    v.style.cssText = 'position:fixed;left:0;top:0;width:2px;height:2px;opacity:0;pointer-events:none;';
    document.body.appendChild(v);

    let recorder = null, rafId = null, pollId = null, canvasDraw = null;
    let aborted = false, audioSrc = null, audioDest = null, fxChain = null, delayQueue = null;
    const cleanup = () => {
      if (pollId) clearInterval(pollId);
      if (rafId) cancelAnimationFrame(rafId);
      canvasDraw = null;
      try { v.pause(); } catch(e){}
      try { if (audioSrc) audioSrc.disconnect(); } catch(e){}
      try { if (fxChain){ fxChain.oscs.forEach(o => { try { o.stop(); } catch(e){} }); fxChain.nodes.forEach(n => { try { n.disconnect(); } catch(e){} }); } } catch(e){}
      try { if (delayQueue) delayQueue.forEach(q => { try { q.b.close(); } catch(e){} }); } catch(e){}
      v.removeAttribute('src');
      try { v.load(); } catch(e){}
      v.remove();
      cutterExportAbort = null;
    };

    try {
      if (onProgress) onProgress(0, 'Loading video…');
      await new Promise((resolve, reject) => {
        if (v.readyState >= 1) return resolve();
        v.addEventListener('loadedmetadata', resolve, { once: true });
        v.addEventListener('error', () => reject(new Error('Could not open the video for export.')), { once: true });
      });
      const speed = (fx && fx.speed) || 1;
      if (speed !== 1){
        try { v.preservesPitch = true; v.mozPreservesPitch = true; v.webkitPreservesPitch = true; } catch(e){}
        v.playbackRate = speed;
      }
      await new Promise((resolve) => {
        const done = () => { v.removeEventListener('seeked', done); resolve(); };
        v.addEventListener('seeked', done);
        v.currentTime = start;
        setTimeout(done, 4000);
      });

      // Video track: prefer the element's own capture (keeps running when the
      // tab is hidden). Fall back to a canvas for browsers without it (Safari).
      // Picture effects (look filters, picture delay) need every frame drawn through a canvas.
      const needCanvas = !!(fx && (fx.look || fx.picDelay));
      let stream;
      if (!needCanvas && (typeof v.captureStream === 'function' || typeof v.mozCaptureStream === 'function')){
        const cap = (v.captureStream || v.mozCaptureStream).call(v);
        stream = new MediaStream(cap.getVideoTracks());
      } else {
        const canvas = document.createElement('canvas');
        canvas.width = v.videoWidth || 1280;
        canvas.height = v.videoHeight || 720;
        const cctx = canvas.getContext('2d');
        if (fx && fx.look && CUTTER_CTX_FILTER) cctx.filter = fx.look;
        const delayMs = (fx && fx.picDelay) || 0;
        let scale = 1;
        if (delayMs > 0){
          // Held-back frames live in memory, so shrink them if a long delay would use too much.
          delayQueue = [];
          const held = Math.ceil(delayMs / 1000 * 30) + 3;
          scale = Math.min(1, Math.sqrt((280 * 1024 * 1024) / (held * canvas.width * canvas.height * 4)));
        }
        let pending = false;
        canvasDraw = () => {
          if (delayMs > 0){
            const now = performance.now();
            if (!pending && v.readyState >= 2){
              pending = true;
              const o = scale < 1 ? { resizeWidth: Math.max(2, Math.round(canvas.width * scale)), resizeHeight: Math.max(2, Math.round(canvas.height * scale)) } : undefined;
              createImageBitmap(v, o).then(b => { pending = false; delayQueue.push({ t: now, b }); }).catch(() => { pending = false; });
            }
            while (delayQueue.length > 1 && delayQueue[1].t <= now - delayMs) delayQueue.shift().b.close();
            if (delayQueue.length) cctx.drawImage(delayQueue[0].b, 0, 0, canvas.width, canvas.height);
          } else {
            cctx.drawImage(v, 0, 0, canvas.width, canvas.height);
          }
          rafId = requestAnimationFrame(canvasDraw);
        };
        stream = canvas.captureStream(30);
      }

      // Audio track via Web Audio, so it never plays out loud.
      try {
        const ctx = ensureAudioCtx();
        if (ctx.state === 'suspended') await ctx.resume().catch(()=>{});
        audioSrc = ctx.createMediaElementSource(v);
        audioDest = ctx.createMediaStreamDestination();
        if (fx && fx.audio) fxChain = await cutterBuildFxChain(ctx, audioSrc, audioDest, fx.audio);
        else audioSrc.connect(audioDest);
        audioDest.stream.getAudioTracks().forEach(t => stream.addTrack(t));
      } catch(e){
        if (fx && fx.audio) throw new Error('Could not apply the audio effects: ' + (e && e.message ? e.message : e));
        /* no audio track available - record video only */
      }

      const chunks = [];
      const rec = new MediaRecorder(stream, {
        mimeType: CUTTER_VIDEO_REC.mime,
        videoBitsPerSecond: 8000000,
        audioBitsPerSecond: 192000
      });
      recorder = rec;
      rec.ondataavailable = (e) => { if (e.data && e.data.size > 0) chunks.push(e.data); };
      const stopped = new Promise((resolve, reject) => {
        rec.onstop = resolve;
        rec.onerror = (e) => reject((e && e.error) || new Error('Recording failed.'));
      });

      cutterExportAbort = () => {
        aborted = true;
        try { if (rec.state !== 'inactive') rec.stop(); } catch(e){}
      };

      const finish = () => {
        if (pollId) { clearInterval(pollId); pollId = null; }
        try { v.pause(); } catch(e){}
        try { if (rec.state !== 'inactive') rec.stop(); } catch(e){}
      };
      const check = () => {
        const t = v.currentTime;
        if (onProgress) onProgress(Math.min(0.99, Math.max(0, (t - start) / Math.max(0.01, end - start))), 'Recording clip…');
        if (t >= end || v.ended) finish();
      };
      v.addEventListener('timeupdate', check);
      v.addEventListener('ended', finish);

      if (canvasDraw) canvasDraw();
      rec.start(250);
      await v.play();
      pollId = setInterval(check, 40);
      await stopped;

      if (aborted) throw new Error('Export cancelled.');
      if (!chunks.length) throw new Error('No video data was recorded.');
      if (onProgress) onProgress(1, 'Done');
      return new Blob(chunks, { type: CUTTER_VIDEO_REC.mime.split(';')[0] });
    } finally {
      cleanup();
    }
  }

  function floatTo16BitPCM(input){
    const output = new Int16Array(input.length);
    for (let i = 0; i < input.length; i++){
      let s = Math.max(-1, Math.min(1, input[i]));
      output[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
    }
    return output;
  }

  // MP3 encoding via lamejs (a pure-JS port of LAME), loaded from a CDN.
  // Works for both plain audio files and the audio track of a video file,
  // decodeAudioData pulls the PCM out of either container, so this is what
  // powers "convert to MP3" for both kinds of source.
  async function exportMp3Clip(track, start, end, kbps, onProgress, fx){
    if (typeof lamejs === 'undefined'){
      throw new Error('The MP3 encoder failed to load (check the connection), try WAV or the video clip instead.');
    }
    const rendered = await cutterRenderAudio(track, start, end, fx, onProgress);
    const sampleRate = rendered.sampleRate;
    const numChannels = Math.min(2, rendered.numberOfChannels);
    const left = floatTo16BitPCM(rendered.getChannelData(0));
    const right = numChannels > 1 ? floatTo16BitPCM(rendered.getChannelData(1)) : null;

    const encoder = new lamejs.Mp3Encoder(numChannels, sampleRate, kbps);
    const blockSize = 1152;
    const mp3Chunks = [];
    const total = Math.max(1, left.length);

    if (onProgress) onProgress(0, 'Encoding MP3…');
    for (let i = 0; i < left.length; i += blockSize){
      const leftChunk = left.subarray(i, i + blockSize);
      let buf;
      if (right){
        buf = encoder.encodeBuffer(leftChunk, right.subarray(i, i + blockSize));
      } else {
        buf = encoder.encodeBuffer(leftChunk);
      }
      if (buf.length > 0) mp3Chunks.push(buf);
      // Yield to the main thread periodically so the tab stays responsive
      // and the progress bar can actually repaint on long files.
      if (i % (blockSize * 300) === 0){
        if (onProgress) onProgress(Math.min(0.98, i / total), 'Encoding MP3…');
        await cutterYield();
      }
    }
    const endBuf = encoder.flush();
    if (endBuf.length > 0) mp3Chunks.push(endBuf);
    if (onProgress) onProgress(1, 'Done');
    return new Blob(mp3Chunks, { type: 'audio/mpeg' });
  }


  // Banner shown when an export finishes. Same look and slide-in as the mode banners (Lite style).
  // If the page is hidden at that moment it waits until you're back, so it isn't missed.
  function showExportBanner(title, sub, kind){
    if (!document.getElementById('pp-export-banner-style')){
      const st = document.createElement('style');
      st.id = 'pp-export-banner-style';
      st.textContent = '#pp-export-banner{position:fixed;top:0;left:0;right:0;z-index:99999;box-sizing:border-box;text-align:center;padding:calc(18px + env(safe-area-inset-top,0px)) 16px 18px;transform:translateY(-110%);transition:transform .55s cubic-bezier(.2,.9,.3,1);overflow:hidden;pointer-events:none;background:var(--bg-elev);color:var(--text);border-bottom:1px solid var(--accent)}'
        + '#pp-export-banner.show{transform:none}'
        + '#pp-export-banner.err{border-bottom-color:var(--danger)}#pp-export-banner.err .t{color:var(--danger)}#pp-export-banner.err small{white-space:normal;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical}'
        + '#pp-export-banner .t{display:block;font:600 17px system-ui,sans-serif;letter-spacing:.2px}'
        + '#pp-export-banner small{display:block;margin-top:4px;font:400 12.5px system-ui,sans-serif;color:var(--text-dim);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}';
      document.head.appendChild(st);
    }
    const show = () => {
      const old = document.getElementById('pp-export-banner');
      if (old) old.remove();
      const el = document.createElement('div');
      el.id = 'pp-export-banner';
      if (kind) el.className = kind;
      const t = document.createElement('span'); t.className = 't'; t.textContent = title;
      const s = document.createElement('small'); s.textContent = sub;
      el.append(t, s);
      document.body.appendChild(el);
      requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add('show')));
      setTimeout(() => { el.classList.remove('show'); setTimeout(() => el.remove(), 700); }, kind === 'err' ? 6500 : 4500);
    };
    if (document.hidden){
      const f = () => { if (!document.hidden){ document.removeEventListener('visibilitychange', f); show(); } };
      document.addEventListener('visibilitychange', f);
    } else show();
  }

  // The exporter pauses playback before it starts, which is exactly the
  // audio session mobile browsers use to decide a hidden tab still deserves
  // CPU time - without it, backgrounding mid-export (switching apps, locking
  // the screen) can freeze the encode loop until the person comes back.
  // A fully silent, looping buffer source on the same AudioContext costs
  // nothing audible but keeps that "actively playing audio" signal alive
  // for as long as the export runs.
  function startExportKeepAlive(){
    let stopped = false, releaseLock = null, source = null;
    // Holding a Web Lock stops Chromium from freezing the hidden tab part-way through an export.
    try {
      if (navigator.locks && navigator.locks.request){
        navigator.locks.request('pp-clip-export', { mode: 'shared' }, () => new Promise(res => {
          if (stopped) res(); else releaseLock = res;
        })).catch(() => {});
      }
    } catch(e){}
    try {
      const ctx = ensureAudioCtx();
      // A suspended context plays nothing, so the keep-alive would do nothing. The click that
      // started the export lets us resume it.
      if (ctx.state === 'suspended') ctx.resume().catch(() => {});
      const buffer = ctx.createBuffer(1, 1, 22050);
      source = ctx.createBufferSource();
      source.buffer = buffer;
      source.loop = true;
      const gain = ctx.createGain();
      gain.gain.value = 0;
      source.connect(gain).connect(ctx.destination);
      source.start();
    } catch(e){ source = null; }
    return () => {
      stopped = true;
      if (releaseLock){ try { releaseLock(); } catch(e){} releaseLock = null; }
      try { if (source) source.stop(); } catch(e){}
    };
  }

