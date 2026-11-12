  // ---------- Subtitle persistence ----------
  // One entry per track: {v:2, n:fileName, on:0|1, o:offsetSeconds, c:[[start,end,text],...]}.
  // Older builds stored a bare [{start,end,text}] array; both are read.
  function loadSubtitleStore(){
    try {
      const o = JSON.parse(localStorage.getItem(SUBTITLE_KEY));
      return (o && typeof o === 'object' && !Array.isArray(o)) ? o : {};
    } catch(e){ return {}; }
  }
  function readSubtitleEntry(raw){
    if (!raw) return null;
    let cues = null, on = true, offset = 0, name = '';
    if (Array.isArray(raw)){
      cues = raw;
    } else if (typeof raw === 'object' && Array.isArray(raw.c)){
      cues = raw.c.map(t => Array.isArray(t) ? { start:+t[0], end:+t[1], text:String(t[2]), tr:t[3] ? String(t[3]) : '' } : null);
      on = raw.on !== 0 && raw.on !== false;
      offset = isFinite(+raw.o) ? +raw.o : 0;
      name = typeof raw.n === 'string' ? raw.n : '';
    }
    if (!cues) return null;
    cues = finalizeSubtitleCues(cues);
    return cues.length ? { cues, on, offset, name, trLang: (raw && typeof raw.tl === 'string') ? raw.tl : '' } : null;
  }
  function getSavedSubtitleEntry(dbId){
    return readSubtitleEntry(loadSubtitleStore()[dbId]);
  }
  // Returns true if the entry is persisted. When storage is full, older
  // tracks' subtitles are evicted (oldest first) until this one fits.
  function writeSubtitleEntry(dbId, entry){
    const all = loadSubtitleStore();
    delete all[dbId];
    if (entry){
      all[dbId] = {
        v: 2, n: entry.name || '', on: entry.on ? 1 : 0, o: +entry.offset || 0, tl: entry.trLang || '',
        c: entry.cues.map(c => c.tr ? [+c.start.toFixed(3), +c.end.toFixed(3), c.text, c.tr] : [+c.start.toFixed(3), +c.end.toFixed(3), c.text])
      };
    }
    for (;;){
      try { localStorage.setItem(SUBTITLE_KEY, JSON.stringify(all)); return true; }
      catch(e){
        const victim = Object.keys(all).find(k => k !== dbId);
        if (!victim) return false;
        delete all[victim];
      }
    }
  }

  // ---------- Subtitle state, lookup, rendering ----------
  let subtitleMaxDur = 0;
  let subtitleOffsetSec = 0;       // subtitle-only shift: positive = subtitles appear later
  let subtitleFileName = '';
  let subtitleLastText = null;
  let subtitleSaveTimer = 0;
  let subtitleRaf = 0;

  function setSubtitleCues(cues, opts){
    opts = opts || {};
    subtitleCues = cues || [];
    subtitleMaxDur = subtitleCues.reduce((m, c) => Math.max(m, c.end - c.start), 0);
    subtitlesOn = subtitleCues.length > 0 && opts.on !== false;
    subtitleOffsetSec = +opts.offset || 0;
    subtitleFileName = opts.name || '';
    subtitleTrLang = opts.trLang || '';
    subtitleLastText = null;
    updateSubtitleBtnState();
    renderSubtitleFrame();
    kickSubtitleLoop();
  }
  function applySavedSubtitles(dbId){
    const e = getSavedSubtitleEntry(dbId);
    if (e) setSubtitleCues(e.cues, { on:e.on, offset:e.offset, name:e.name, trLang:e.trLang });
    else setSubtitleCues([]);
  }
  // Saves on/off, offset and cues for the current track (debounced unless immediate).
  function persistSubtitleState(immediate){
    clearTimeout(subtitleSaveTimer);
    const run = () => {
      const t = currentIndex !== -1 ? tracks[currentIndex] : null;
      if (!t || !subtitleCues.length) return;
      writeSubtitleEntry(t.dbId, { cues:subtitleCues, on:subtitlesOn, offset:subtitleOffsetSec, name:subtitleFileName, trLang:subtitleTrLang });
    };
    if (immediate) run(); else subtitleSaveTimer = setTimeout(run, 500);
  }

  function updateSubtitleBtnState(){
    const has = subtitleCues.length > 0;
    subtitleBtn.classList.toggle('toggled', subtitlesOn);
    subtitleOffBtn.textContent = subtitlesOn ? 'Turn off' : 'Turn on';
    subtitleOffBtn.disabled = !has;
    subtitleRemoveBtn.disabled = !has;
    subtitleStatus.textContent = has
      ? subtitleCues.length + ' line' + (subtitleCues.length === 1 ? '' : 's') + (subtitleFileName ? ' \u00b7 ' + subtitleFileName : '')
      : 'No subtitles loaded';
    subtitleOffsetVal.textContent = (subtitleOffsetSec > 0 ? '+' : '') + subtitleOffsetSec.toFixed(1) + 's';
    subtitleOffsetRow.querySelectorAll('button').forEach(b => { b.disabled = !has; });
    { const txb = document.getElementById('sub-tx-btn'); if (txb) txb.disabled = !has; }
    try { subTrUi(has); txRefresh(); } catch(e){ /* panels not built yet during early init */ }
  }

  // Every cue active at time t (overlapping cues stack instead of the first
  // one hiding the rest). Binary search + a bounded look-back, so it stays
  // cheap on feature-length files.
  const subSdh = l => /^[-\u2013\s]*[\[\(][^\]\)]*[\]\)]\s*$/.test(l) || /^[\s-]*[\u266a\u266b\u266c]|[\u266a\u266b\u266c]\s*$/.test(l);
  // What one cue shows: original, translation or both, with sound-tag lines optionally removed.
  function subDisp(c){
    let main = c.text, tr = c.tr || '';
    if (subtitleStyle.sdh){ const f = x => x.split('\n').filter(l => !subSdh(l)).join('\n').trim(); main = f(main); if (tr) tr = f(tr); }
    if (!main) return '';
    if (!tr) return main;
    return subtitleTrMode === 'tr' ? tr : subtitleTrMode === 'orig' ? main : main + '\n' + tr;
  }
  function activeSubtitleText(t){
    const n = subtitleCues.length;
    window.__ppSubSt = null;
    if (!n) return '';
    let lo = 0, hi = n - 1, idx = -1;
    while (lo <= hi){
      const mid = (lo + hi) >> 1;
      if (subtitleCues[mid].start <= t){ idx = mid; lo = mid + 1; } else hi = mid - 1;
    }
    const hits = [];
    for (let i = idx; i >= 0 && hits.length < 4; i--){
      const c = subtitleCues[i];
      if (c.start < t - subtitleMaxDur) break;
      const dsp = t < c.end ? subDisp(c) : '';
      if (dsp && hits.indexOf(dsp) === -1){ if (window.__ppAssOn && c.fx){ (window.__ppSubFx = window.__ppSubFx || []).push(c); hits.push(null); continue; } if (!hits.length) window.__ppSubSt = c.style || null; hits.push(dsp); }
    }
    return hits.reverse().filter(x => x !== null).join('\n');
  }

  function renderSubtitleFrame(){
    let text = ''; window.__ppSubFx = []; window.__ppSubT = 0;
    if (subtitlesOn && subtitleCues.length && videoWrap.style.display !== 'none'){
      const t = videoEl.currentTime - (Math.max(effLatencyMs(), 0) / 1000) - memcExtraSec - subtitleOffsetSec;
      window.__ppSubT = t;
      text = activeSubtitleText(t);
    }
    if (window.__ppAssFrame) window.__ppAssFrame();
    if (!text && subtitlePreview && videoWrap.style.display !== 'none') text = 'Drag to move subtitles';
    if (text === subtitleLastText) return;       // no DOM work unless the line changed
    subtitleLastText = text;
    if (text){
      subtitleText.textContent = text;
      { const st = window.__ppAssOn ? window.__ppSubSt : null;
        subtitleText.style.color = st && st.c ? st.c : ''; subtitleText.style.fontWeight = st && st.b ? '700' : ''; subtitleText.style.fontStyle = st && st.i ? 'italic' : ''; }
      subtitleText.classList.add('on');
    } else {
      subtitleText.classList.remove('on');
    }
  }

  // 'timeupdate' only fires ~4x/second, so lines could show up to 250ms late.
  // While a video plays with subtitles on, follow it every animation frame.
  function subtitleLoop(){
    subtitleRaf = 0;
    if (!subtitlesOn || videoEl.paused || videoEl.ended) return;
    renderSubtitleFrame();
    subtitleRaf = requestAnimationFrame(subtitleLoop);
  }
  function kickSubtitleLoop(){
    if (!subtitleRaf && subtitlesOn && !videoEl.paused) subtitleRaf = requestAnimationFrame(subtitleLoop);
  }
  ['play', 'playing', 'seeked', 'seeking', 'pause', 'ratechange', 'loadeddata'].forEach(ev =>
    videoEl.addEventListener(ev, () => { renderSubtitleFrame(); kickSubtitleLoop(); }));

  // Reads, decodes and parses a subtitle File. Resolves to the cue array
  // (possibly empty); never throws.
  async function readSubtitleFile(file){
    try { return parseSubtitles(decodeSubtitleBuffer(await file.arrayBuffer())); }
    catch(e){ console.warn('Subtitle read failed for', file && file.name, e); return []; }
  }

  // ---------- Video delay engine (actual picture delay, not just subtitles) ----------
  // Bluetooth output delay happens after audio leaves the page - nothing
  // in JS can make the sound arrive at your ears sooner. What IS fixable
  // in software is the picture: video paints the instant a frame is
  // decoded, so once Bluetooth has delayed the matching sound by (say)
  // 150ms, the picture is now 150ms ahead of what you're hearing. This
  // holds the picture back to match, using the same slider/value as the
  // subtitle offset above so one number keeps subtitles, video and audio
  // all lined up with what actually reaches your ears.
  //
  // Mechanism: the visible canvas (#video-delay-canvas) is drawn from a
  // rolling buffer of {canvas, t} frames captured off the real <video>
  // element (which keeps decoding and playing audio normally, just with
  // its own paint hidden via opacity:0). Every time the real video
  // decodes a new frame, the canvas is repainted with whichever buffered
  // frame's timestamp is closest to (that new frame's time - delaySec) -
  // i.e. genuinely showing an earlier moment's picture, not a CSS trick.
  //
  // This used to capture with createImageBitmap(videoEl): one full-source-
  // resolution bitmap per decoded frame, pushed into a growing/shrinking
  // array. createImageBitmap is async and, at full source resolution
  // (often far larger than the player ever displays), slow enough that
  // captures fall behind the video's real decode rate under normal load -
  // a first source of stutter, fixed by capturing synchronously (plain
  // drawImage, no promises) into a fixed pool of reused, resolution-capped
  // canvases instead. That removed the allocation/GC churn, but a second,
  // independent source of jitter was still there: presentation ran on its
  // own requestAnimationFrame loop, polling "what's the closest buffered
  // frame to currentTime - delaySec" on every vsync, completely decoupled
  // from the callback that actually fills the buffer. Two independently-
  // scheduled clocks like that don't stay in lockstep - depending on
  // exactly when a given rAF happens to land relative to the rVFC that
  // just captured a new frame, a poll can occasionally just miss a frame
  // that a tick earlier or later would have caught, holding one frame a
  // little too long and then jumping two frames' worth on the next tick.
  // That's a genuine, irregular stutter, not just an occasional slow
  // capture, and no amount of making capture faster fixes it, because the
  // bug is the polling architecture itself.
  //
  // Real fix: don't poll. Present synchronously, inside the exact same
  // requestVideoFrameCallback that captures each new decoded frame -
  // capture-then-immediately-present, one atomic step per source frame,
  // with no separate clock in between. This makes the delayed canvas
  // update at exactly the same cadence and the same trigger as the source
  // video's own decode, which is structurally how native <video> painting
  // works in the first place, leaving no independent clock for
  // buffer-search jitter to sneak in through. (Capture stays synchronous
  // and resolution-capped as before, so this doesn't reopen the earlier
  // allocation/GC problem either.)
  // Everything below still captures and presents as one atomic step per
  // source frame (see above), but WHERE that step runs now branches:
  //
  //   Mode A (worker) - when the browser can hand a canvas's rendering
  //   over to a Worker (transferControlToOffscreen), capture produces one
  //   ImageBitmap per frame on the main thread and posts it off; the
  //   Worker keeps its own ring buffer and does the timestamp search +
  //   drawImage composite itself, on its own thread. That composite draw
  //   was the actual tax described above (software raster copies
  //   competing with layout/input on the main thread) - moving it off
  //   doesn't reduce the total work done, but it stops stealing frames
  //   from the rest of the UI.
  //
  //   Mode B (fallback) - browsers without that support get the original
  //   design unchanged: a fixed-size pool of reused, resolution-capped
  //   canvases, captured into and drawn from synchronously on the main
  //   thread.
  //
  // One wrinkle ties the two modes together: sharpen/clarity/posterize/
  // duotone are all implemented as SVG <filter> primitives, referenced
  // from CSS as url(#some-id). A url() filter reference can only resolve
  // against elements in the same document, so it cannot be applied inside
  // a Worker (which has no DOM at all). Mode A therefore still bakes the
  // filter on the main thread via Canvas2D - the same cost this engine
  // has always paid - but only in that specific case; whenever the active
  // filter is 'none' or one of the plain CSS functions (a color preset,
  // auto-levels), capture hands the Worker a raw frame and lets it apply
  // that filter itself at composite time, so nothing is drawn or filtered
  // on the main thread at all for the common case.
  const VIDEO_DELAY_CAN_USE_WORKER = ('OffscreenCanvas' in window)
    && ('Worker' in window)
    && typeof videoDelayCanvas.transferControlToOffscreen === 'function';

  // Preferred capture: read the element's captured video track inside the
  // worker (Chromium). Falls back to the rVFC path below elsewhere, and
  // whenever a url() filter needs baking on the main thread.
  const VIDEO_DELAY_CAN_USE_TRACK = VIDEO_DELAY_CAN_USE_WORKER
    && typeof MediaStreamTrackProcessor === 'function'
    && typeof videoEl.captureStream === 'function';
  let videoDelayTrackOn = false;

  let videoDelayRafId = null;
  let videoDelayVfcId = null;
  let videoDelayBufW = 0, videoDelayBufH = 0;
  let videoDelayCapacity = 0;
  const VIDEO_DELAY_MAX_SEC = 2.5;        // matches the slider's 2000ms max plus headroom
  const VIDEO_DELAY_ASSUMED_MAX_FPS = 60; // sizes the ring; source video is essentially never higher
  const VIDEO_DELAY_MIN_CAPACITY = 12;
  const VIDEO_DELAY_MAX_CAPACITY = 170;
  const VIDEO_DELAY_MIN_BUFFER_WIDTH = 640;   // never store frames narrower than this
  const VIDEO_DELAY_TOP_BUFFER_WIDTH = 1920; // widest frame stored (short delays on big videos)
  const VIDEO_DELAY_BUFFER_BUDGET = 512 * 1048576; // bytes of RGBA frames the delay may hold (Auto)
  const VIDEO_DELAY_FIXED_BUDGET = 2048 * 1048576; // hard ceiling when a fixed width is chosen

  // Mode B (fallback) state - unchanged from the original implementation.
  let videoDelayCtx = null;
  let videoDelayRing = [];        // fixed-size array of {canvas, ctx, t, valid}
  let videoDelayWriteIdx = 0;

  // Mode A (worker) state.
  let videoDelayWorker = null;
  let videoDelayBakeCanvas = null, videoDelayBakeCtx = null; // scratch canvas, url()-filter case only
  let videoDelayCapCanvas = null, videoDelayCapCtx = null;   // reused OffscreenCanvas for synchronous frame capture

  // The worker owns presentation timing. Each frame carries the wall-clock
  // time it was due to hit the screen (expectedDisplayTime from rVFC); it is
  // shown at that time plus the delay, on the worker's own vsync-locked
  // rAF loop. Showing frames when their bitmaps happen to arrive (the old
  // approach) let async createImageBitmap jitter land frames on the wrong
  // vsync, which read as dropped/uneven frames.
  const VIDEO_DELAY_WORKER_SRC = `
    let canvas = null, ctx = null, ring = [], writeIdx = 0;
    let delaySec = 0, lastDrawn = null, lastT = -1;
    let trackFilter = 'none', pumpToken = 0, pumpReader = null;
    let lastFrameWall = 0, stallSent = false;
    let lastActivity = 0, loopOn = false, stallTimer = 0;
    let fx = 0, fv = 0, fHave = 0; // smoothed frame arrival time (alpha-beta filter)
    let MAX_W = ${VIDEO_DELAY_MIN_BUFFER_WIDTH};
    const HAS_RAF = typeof requestAnimationFrame === 'function';
    function nowAbs(ts){
      return performance.timeOrigin + (ts === undefined ? performance.now() : ts);
    }
    function clearRing(){
      for (const s of ring) if (s && s.bitmap) s.bitmap.close();
      ring.fill(null);
      writeIdx = 0;
      lastDrawn = null;
    }
    function ensureCapacity(n){
      if (ring.length === n) return;
      // Resize in place: keep the newest frames (oldest first) instead of
      // wiping the ring, so nudging the latency slider doesn't throw away
      // the history the delayed picture is drawn from.
      const kept = [];
      for (let i = 0; i < ring.length; i++){
        const s = ring[(writeIdx + i) % ring.length];
        if (s) kept.push(s);
      }
      const drop = Math.max(0, kept.length - n);
      for (let i = 0; i < drop; i++) kept[i].bitmap.close();
      const next = new Array(n).fill(null);
      for (let i = drop; i < kept.length; i++) next[i - drop] = kept[i];
      ring = next;
      writeIdx = (kept.length - drop) % n;
    }
    function addFrame(bitmap, t, disp, filter){
      startLoop();
      if (!ring.length){ bitmap.close(); return; }
      const prev = ring[writeIdx];
      if (prev && prev.bitmap) prev.bitmap.close();
      ring[writeIdx] = { bitmap, t, disp, filter };
      writeIdx = (writeIdx + 1) % ring.length;
    }
    // Track mode: frames are read straight off the video's captured stream
    // in this worker, so capture never depends on the main thread getting
    // a rendering turn (rVFC on the main thread coalesces frames whenever
    // the page is busy, and every missed frame is a hole in the delayed
    // picture). Arrival times are jittery by a few ms, which would flip
    // frames between vsyncs, so they are smoothed into a regular timeline.
    function stopPump(){
      pumpToken++;
      if (pumpReader){ try { pumpReader.cancel(); } catch (e) {} pumpReader = null; }
    }
    async function pump(readable){
      const token = ++pumpToken;
      const reader = readable.getReader();
      pumpReader = reader;
      fHave = 0;
      lastFrameWall = performance.now(); stallSent = false; armStall(); startLoop();
      try {
        while (token === pumpToken){
          const r = await reader.read();
          if (r.done){ if (token === pumpToken) postMessage({ type: 'trackdone' }); break; }
          const frame = r.value;
          lastFrameWall = performance.now(); stallSent = false; armStall();
          if (!ring.length){ frame.close(); continue; }
          const z = performance.timeOrigin + performance.now();
          if (fHave === 0){ fx = z; fv = 0; fHave = 1; }
          else if (fHave === 1){ fv = z - fx; fx = z; fHave = 2; }
          else {
            const res = z - (fx + fv);
            if (Math.abs(res) > 200){ fx = z; fv = 0; fHave = 1; }
            else { fx = fx + fv + 0.1 * res; fv = fv + 0.005 * res; }
          }
          const disp = fx;
          const scale = Math.min(1, MAX_W / frame.displayWidth);
          const w = Math.max(1, Math.round(frame.displayWidth * scale));
          const h = Math.max(1, Math.round(frame.displayHeight * scale));
          const filter = trackFilter;
          createImageBitmap(frame, { resizeWidth: w, resizeHeight: h })
            .then(bmp => { if (token === pumpToken) addFrame(bmp, 0, disp, filter); else bmp.close(); })
            .catch(() => {})
            .finally(() => frame.close());
        }
      } catch (e) {}
      if (pumpReader === reader) pumpReader = null;
    }
    function draw(s){
      if (canvas.width !== s.bitmap.width || canvas.height !== s.bitmap.height){
        canvas.width = s.bitmap.width;
        canvas.height = s.bitmap.height;
      }
      const f = s.filter || 'none';
      if (f !== 'none') ctx.filter = f;
      ctx.drawImage(s.bitmap, 0, 0);
      if (f !== 'none') ctx.filter = 'none';
      lastDrawn = s;
    }
    function present(ts){
      if (!ctx || !ring.length) return;
      const now = nowAbs(ts);
      const delayMs = delaySec * 1000;
      let best = null, oldest = null;
      for (const s of ring){
        if (!s) continue;
        if (!oldest || s.disp < oldest.disp) oldest = s;
        if (s.disp + delayMs <= now && (!best || s.disp > best.disp)) best = s;
      }
      // Nothing on screen yet: show the oldest frame rather than a blank
      // canvas, then hold it until real frames come due.
      if (!best && !lastDrawn) best = oldest;
      if (best && best !== lastDrawn) draw(best);
    }
    // The draw loop parks itself once frames have stopped and the delay has run out (the last frame is on screen),
    // instead of spinning at the display's refresh rate for as long as the page lives. Any new frame restarts it.
    function loop(ts){
      present(ts);
      if (performance.now() - lastActivity < delaySec * 1000 + 1500) requestAnimationFrame(loop);
      else loopOn = false;
    }
    function startLoop(){
      lastActivity = performance.now();
      if (HAS_RAF && ctx && !loopOn){ loopOn = true; requestAnimationFrame(loop); }
    }
    // Tell the page if the stream goes quiet, so it can restart capture (end of video, loop, new source).
    // The timer only exists while a stream is attached and hasn't been reported stalled.
    function armStall(){
      if (stallTimer) return;
      stallTimer = setInterval(() => {
        if (!pumpReader || stallSent){ clearInterval(stallTimer); stallTimer = 0; return; }
        if (performance.now() - lastFrameWall > 900){ stallSent = true; postMessage({ type: 'stalled' }); }
      }, 400);
    }
    onmessage = (e) => {
      const m = e.data;
      if (m.type === 'init'){
        canvas = m.canvas;
        ctx = canvas.getContext('2d', { alpha: false });
        startLoop();
      } else if (m.type === 'capacity'){
        if (m.maxW) MAX_W = m.maxW;
        ensureCapacity(m.n);
      } else if (m.type === 'clear'){
        clearRing();
        lastT = -1;
      } else if (m.type === 'track'){
        stopPump();
        delaySec = m.delaySec;
        trackFilter = m.filter;
        pump(m.readable);
      } else if (m.type === 'untrack'){
        stopPump();
      } else if (m.type === 'delay'){
        delaySec = m.delaySec; startLoop();
      } else if (m.type === 'filter'){
        trackFilter = m.filter; startLoop();
      } else if (m.type === 'frame'){
        if (!ring.length){ m.bitmap.close(); return; }
        // Media time went backwards or jumped (seek, loop, stall): the
        // buffered history is from another timeline, so start over.
        if (m.t < lastT || m.t - lastT > 0.5) clearRing();
        lastT = m.t;
        delaySec = m.delaySec;
        addFrame(m.bitmap, m.t, m.disp, m.filter);
        if (!HAS_RAF) present();
      }
    };
  `;

  function ensureVideoDelayWorker(){
    // transferControlToOffscreen() can only ever be called once for a
    // given canvas, and only if getContext() was never called on it from
    // the main thread first - which is why mode B's videoDelayCtx is
    // created lazily and only when mode A isn't in use (see
    // ensureVideoDelayBuffers below). Which mode runs is decided once by
    // feature detection above and never changes at runtime, so the two
    // never collide over ownership of the same canvas.
    if (videoDelayWorker || !VIDEO_DELAY_CAN_USE_WORKER) return videoDelayWorker;
    videoDelayWorker = new Worker(URL.createObjectURL(new Blob([VIDEO_DELAY_WORKER_SRC], { type: 'text/javascript' })));
    videoDelayWorker.onmessage = onVideoDelayWorkerMessage;
    const offscreen = videoDelayCanvas.transferControlToOffscreen();
    videoDelayWorker.postMessage({ type: 'init', canvas: offscreen }, [offscreen]);
    return videoDelayWorker;
  }

  function videoDelayActive(){
    if (window.PPNative && PPNative.videoActive()) return false;
    return !memcActive && effLatencyMs() > 0 && videoWrap.style.display !== 'none'
      && currentIndex !== -1 && tracks[currentIndex] && tracks[currentIndex].kind === 'video';
  }

  function videoDelayRingCapacity(){
    const neededSec = Math.min(Math.max(effLatencyMs(), 0) / 1000 + 0.35, VIDEO_DELAY_MAX_SEC);
    const cap = Math.ceil(neededSec * VIDEO_DELAY_ASSUMED_MAX_FPS) + 4;
    return Math.min(VIDEO_DELAY_MAX_CAPACITY, Math.max(VIDEO_DELAY_MIN_CAPACITY, cap));
  }

  function videoDelayBufferSize(){
    const vw = videoEl.videoWidth, vh = videoEl.videoHeight;
    if (!vw || !vh) return null;
    // Only lossless mode raises the width; otherwise the original 640 px cap.
    let maxW = VIDEO_DELAY_MIN_BUFFER_WIDTH;
    if (losslessLatency){
      const cap = videoDelayRingCapacity();
      if (losslessQuality === 'auto'){
        // Spend the memory budget on resolution: short delays need few buffered
        // frames so they get sharp ones, long delays on big videos get fewer pixels.
        const px = VIDEO_DELAY_BUFFER_BUDGET / (4 * cap);
        maxW = Math.floor(Math.sqrt(px * vw / vh) / 160) * 160; // steps, so dragging the slider doesn't resize constantly
        maxW = Math.max(VIDEO_DELAY_MIN_BUFFER_WIDTH, Math.min(VIDEO_DELAY_TOP_BUFFER_WIDTH, maxW));
      } else {
        const want = parseInt(losslessQuality, 10);
        const px = VIDEO_DELAY_FIXED_BUDGET / (4 * cap);
        const fit = Math.floor(Math.sqrt(px * vw / vh) / 160) * 160;
        maxW = Math.max(VIDEO_DELAY_MIN_BUFFER_WIDTH, Math.min(want, fit));
      }
    }
    const scale = Math.min(1, maxW / vw);
    return { w: Math.max(1, Math.round(vw * scale)), h: Math.max(1, Math.round(vh * scale)), maxW };
  }

  function videoDelayFilterHasUrlRef(){
    const f = videoEl.style.filter;
    return !!f && f.indexOf('url(') !== -1;
  }

  function ensureVideoDelayBuffers(){
    // Idempotent and cheap (a couple of comparisons) when nothing has
    // changed, so it's safe to call from the hot capture path every
    // frame - the actual (re)allocation only happens when the source
    // resolution or the needed capacity genuinely changes.
    const size = videoDelayBufferSize();
    if (!size) return false; // video metadata not ready yet
    const capacity = videoDelayRingCapacity();
    if (size.w === videoDelayBufW && size.h === videoDelayBufH && capacity === videoDelayCapacity){
      return true;
    }
    const sizeChanged = size.w !== videoDelayBufW || size.h !== videoDelayBufH;
    videoDelayBufW = size.w; videoDelayBufH = size.h; videoDelayCapacity = capacity;
    if (VIDEO_DELAY_CAN_USE_WORKER){
      ensureVideoDelayWorker().postMessage({ type: 'capacity', n: capacity, maxW: size.maxW });
      videoDelayBakeCanvas = null; // resized lazily next time a url()-filter frame needs baking
    } else {
      if (!videoDelayCtx) videoDelayCtx = videoDelayCanvas.getContext('2d', { alpha: false });
      if (sizeChanged || videoDelayRing.length === 0){
        videoDelayRing = new Array(capacity);
        for (let i = 0; i < capacity; i++) videoDelayRing[i] = makeVideoDelaySlot(size.w, size.h);
        videoDelayWriteIdx = 0;
      } else {
        resizeVideoDelayRing(capacity, size.w, size.h);
      }
    }
    return true;
  }

  function makeVideoDelaySlot(w, h){
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    return { canvas: c, ctx: c.getContext('2d', { alpha: false }), t: 0, valid: false };
  }

  // Mode B capacity change without wiping history: keep the newest valid
  // slots (oldest first), reuse dropped canvases for the new empty slots.
  function resizeVideoDelayRing(capacity, w, h){
    const len = videoDelayRing.length;
    const kept = [], spare = [];
    for (let i = 0; i < len; i++){
      const s = videoDelayRing[(videoDelayWriteIdx + i) % len];
      (s.valid ? kept : spare).push(s);
    }
    const drop = Math.max(0, kept.length - capacity);
    for (let i = 0; i < drop; i++) spare.push(kept[i]);
    const keep = kept.slice(drop);
    const next = new Array(capacity);
    for (let i = 0; i < capacity; i++){
      if (i < keep.length) next[i] = keep[i];
      else {
        const s = spare.pop() || makeVideoDelaySlot(w, h);
        s.valid = false;
        next[i] = s;
      }
    }
    videoDelayRing = next;
    videoDelayWriteIdx = keep.length % capacity;
  }

  function ensureVideoDelayBakeCanvas(){
    if (videoDelayBakeCanvas && videoDelayBakeCanvas.width === videoDelayBufW && videoDelayBakeCanvas.height === videoDelayBufH){
      return;
    }
    videoDelayBakeCanvas = document.createElement('canvas');
    videoDelayBakeCanvas.width = videoDelayBufW;
    videoDelayBakeCanvas.height = videoDelayBufH;
    videoDelayBakeCtx = videoDelayBakeCanvas.getContext('2d', { alpha: false });
  }

  function captureVideoFrameWorker(mediaTime, dispAbs){
    const worker = ensureVideoDelayWorker();
    const delaySec = effLatencyMs() / 1000;
    // Wall-clock time this frame was due on screen (epoch ms), so the worker
    // can re-time it against its own clock.
    const disp = dispAbs === undefined ? performance.timeOrigin + performance.now() : dispAbs;
    if (videoDelayFilterHasUrlRef()){
      ensureVideoDelayBakeCanvas();
      videoDelayBakeCtx.filter = videoEl.style.filter;
      videoDelayBakeCtx.drawImage(videoEl, 0, 0, videoDelayBufW, videoDelayBufH);
      videoDelayBakeCtx.filter = 'none';
      createImageBitmap(videoDelayBakeCanvas).then(bitmap => {
        worker.postMessage({ type: 'frame', bitmap, t: mediaTime, disp, delaySec, filter: 'none' }, [bitmap]);
      }).catch(() => {});
    } else {
      // createImageBitmap(video) is async and slow enough to miss frames at
      // full frame rate, and every missed capture is a hole in the delayed
      // picture. drawImage into a reused OffscreenCanvas plus
      // transferToImageBitmap is synchronous and hands off the pixels
      // without a copy, so every decoded frame gets captured.
      if (!videoDelayCapCanvas || videoDelayCapCanvas.width !== videoDelayBufW || videoDelayCapCanvas.height !== videoDelayBufH){
        videoDelayCapCanvas = new OffscreenCanvas(videoDelayBufW, videoDelayBufH);
        videoDelayCapCtx = videoDelayCapCanvas.getContext('2d', { alpha: false });
      }
      videoDelayCapCtx.drawImage(videoEl, 0, 0, videoDelayBufW, videoDelayBufH);
      const bitmap = videoDelayCapCanvas.transferToImageBitmap();
      worker.postMessage({ type: 'frame', bitmap, t: mediaTime, disp, delaySec, filter: videoEl.style.filter || 'none' }, [bitmap]);
    }
  }

  function captureVideoFrameMainThread(mediaTime){
    const slot = videoDelayRing[videoDelayWriteIdx];
    // videoEl.style.filter already holds the fully-composed color preset +
    // sharpen/clarity string (kept in sync by applyVideoFilter() on every
    // change), so reuse it here rather than recomputing - drawImage from a
    // <video> element ignores the source's own CSS filter entirely, which
    // is exactly why the delayed canvas used to come out unfiltered.
    // Setting ctx.filter is a known slow path in Canvas2D, so only touch
    // it when a filter is actually active - the context is left at 'none'
    // below whenever we do set one, so skipping both calls when there's
    // nothing to apply is safe (no stale filter can be sitting on it).
    const filterStr = videoEl.style.filter;
    const hasFilter = !!filterStr && filterStr !== 'none';
    if (hasFilter) slot.ctx.filter = filterStr;
    slot.ctx.drawImage(videoEl, 0, 0, videoDelayBufW, videoDelayBufH);
    if (hasFilter) slot.ctx.filter = 'none';
    slot.t = mediaTime;
    slot.valid = true;
    videoDelayWriteIdx = (videoDelayWriteIdx + 1) % videoDelayRing.length;
  }

  function captureVideoFrame(mediaTime, dispAbs){
    if (videoEl.readyState < 2 || videoEl.videoWidth === 0) return false;
    if (!ensureVideoDelayBuffers()) return false;
    if (VIDEO_DELAY_CAN_USE_WORKER) captureVideoFrameWorker(mediaTime, dispAbs);
    else captureVideoFrameMainThread(mediaTime);
    return true;
  }

  function presentDelayedFrame(nowT){
    // Mode A composites inside the worker as part of handling each
    // 'frame' message (see VIDEO_DELAY_WORKER_SRC) - nothing to do here.
    if (VIDEO_DELAY_CAN_USE_WORKER) return;
    if (!videoDelayActive() || videoDelayRing.length === 0) return;
    const delaySec = effLatencyMs() / 1000;
    const targetT = nowT - delaySec;
    // Ring is small (tens up to ~170 slots) so a linear scan for the
    // closest valid timestamp is cheap and simpler than a binary search.
    let best = null;
    let bestDiff = Infinity;
    for (let i = 0; i < videoDelayRing.length; i++){
      const slot = videoDelayRing[i];
      if (!slot.valid) continue;
      const diff = Math.abs(slot.t - targetT);
      if (diff < bestDiff){ best = slot; bestDiff = diff; }
    }
    if (!best) return;
    if (videoDelayCanvas.width !== best.canvas.width || videoDelayCanvas.height !== best.canvas.height){
      videoDelayCanvas.width = best.canvas.width;
      videoDelayCanvas.height = best.canvas.height;
    }
    videoDelayCtx.drawImage(best.canvas, 0, 0);
  }

  // Capture and present happen back-to-back, driven by one clock, so the
  // decision "what does the screen show right now" is made exactly once
  // per source frame, atomically, right after that frame is safely in the
  // ring - never by a second loop guessing at it later. (In mode A the
  // actual composite lands slightly later, after the ImageBitmap promise
  // resolves and the Worker processes it - but it's still exactly one
  // downstream action per source frame, with no independent polling clock
  // for the two to drift apart on.)
  function captureAndPresent(nowT, dispAbs){
    captureVideoFrame(nowT, dispAbs);
    presentDelayedFrame(nowT);
  }

  // Every captureStream() call attaches another capture sink to the <video>. They used to pile up on each
  // restart (pause/play, seek, loop), which can leave playback frozen and silent. Stop the old one first.
  let videoDelayCapStream = null;
  function releaseCapturedStream(){
    if (!videoDelayCapStream) return;
    try { videoDelayCapStream.getTracks().forEach(t => t.stop()); } catch (_){}
    videoDelayCapStream = null;
  }
  function startTrackCapture(){
    if (!ensureVideoDelayBuffers()) return false;
    let readable;
    try {
      releaseCapturedStream();
      const stream = videoEl.captureStream();
      const track = stream.getVideoTracks()[0];
      if (!track){ try { stream.getTracks().forEach(t => t.stop()); } catch (_){} return false; } // metadata not loaded yet
      videoDelayCapStream = stream;
      readable = new MediaStreamTrackProcessor({ track }).readable;
    } catch (e){ return false; }
    ensureVideoDelayWorker().postMessage({
      type: 'track', readable,
      delaySec: effLatencyMs() / 1000,
      filter: videoEl.style.filter || 'none'
    }, [readable]);
    videoDelayTrackOn = true;
    return true;
  }

  function startFrameCapture(){
    if (VIDEO_DELAY_CAN_USE_TRACK && !videoDelayFilterHasUrlRef() && startTrackCapture()) return;
    if ('requestVideoFrameCallback' in videoEl){
      const onFrame = (now, metadata) => {
        captureAndPresent(metadata.mediaTime, performance.timeOrigin + (metadata.expectedDisplayTime || now));
        videoDelayVfcId = videoEl.requestVideoFrameCallback(onFrame);
      };
      videoDelayVfcId = videoEl.requestVideoFrameCallback(onFrame);
    } else {
      // Fallback sampler for browsers without requestVideoFrameCallback:
      // capture and present together once per rAF tick, using the
      // element's own currentTime as the timestamp. Less precise than
      // rVFC's actual per-frame media time, but still a single clock
      // driving both steps, so it can't develop the two-loop drift a
      // separate poller would.
      const sample = () => {
        captureAndPresent(videoEl.currentTime);
        videoDelayRafId = requestAnimationFrame(sample);
      };
      videoDelayRafId = requestAnimationFrame(sample);
    }
  }

  function stopFrameCapture(){
    if (videoDelayTrackOn){
      videoDelayTrackOn = false;
      if (videoDelayWorker) videoDelayWorker.postMessage({ type: 'untrack' });
    }
    releaseCapturedStream();
    if (videoDelayVfcId != null && 'cancelVideoFrameCallback' in videoEl){
      videoEl.cancelVideoFrameCallback(videoDelayVfcId);
    }
    videoDelayVfcId = null;
    if (videoDelayRafId != null) cancelAnimationFrame(videoDelayRafId);
    videoDelayRafId = null;
  }

  function refreshVideoDelayState(){
    audioLeadUpdate();
    applyAudioDelayAll();
    memcSync();
    const active = videoDelayActive();
    document.body.classList.toggle('video-delay-active', active);
    // Cheap no-op unless the delay amount actually changed the needed
    // capacity, so it's fine to call this on every settings change.
    if (active) ensureVideoDelayBuffers();
    if (videoDelayWorker) videoDelayWorker.postMessage({ type: 'delay', delaySec: effLatencyMs() / 1000 });
    if (active && videoDelayVfcId == null && videoDelayRafId == null && !videoDelayTrackOn){
      startFrameCapture();
      // Paint immediately from the live frame rather than leaving the
      // canvas blank until the next decode - matters right after turning
      // the delay on while paused, where no new frame may arrive for a
      // while.
      captureAndPresent(videoEl.currentTime);
    } else if (!active){
      stopFrameCapture();
      if (VIDEO_DELAY_CAN_USE_WORKER){
        if (videoDelayWorker) videoDelayWorker.postMessage({ type: 'clear' });
      } else {
        // Mark the pool empty rather than tearing it down - the canvases
        // are reused as-is the next time the delay is turned back on, so
        // toggling it never re-triggers allocation.
        for (let i = 0; i < videoDelayRing.length; i++) videoDelayRing[i].valid = false;
      }
    }
  }

  // The captured stream can end or go quiet when the video ends, loops or is replaced, which
  // used to leave the delayed picture frozen on the last frame until the setting was toggled.
  let videoDelayNeedRestart = false;
  function onVideoDelayWorkerMessage(e){
    const type = e.data && e.data.type;
    if (type !== 'trackdone' && type !== 'stalled') return;
    if (!videoDelayTrackOn || !videoDelayActive()) return;
    if (videoEl.paused || videoEl.ended || videoEl.readyState < 3){ videoDelayNeedRestart = true; return; }
    restartVideoDelayCapture();
  }
  videoEl.addEventListener('ended', () => { videoDelayNeedRestart = true; });
  ['playing', 'seeked'].forEach(ev => videoEl.addEventListener(ev, () => {
    if (!videoDelayNeedRestart || !videoDelayTrackOn || !videoDelayActive() || videoEl.paused) return;
    videoDelayNeedRestart = false;
    restartVideoDelayCapture();
  }));

  // Track mode follows the source: a new file means a new captured track,
  // and a url() filter toggling on/off flips which capture path is valid.
  function restartVideoDelayCapture(){
    stopFrameCapture();
    if (videoDelayWorker) videoDelayWorker.postMessage({ type: 'clear' });
    startFrameCapture();
  }
  videoEl.addEventListener('loadedmetadata', () => {
    if (VIDEO_DELAY_CAN_USE_TRACK && videoDelayActive()) restartVideoDelayCapture();
  });
  if (VIDEO_DELAY_CAN_USE_TRACK){
    new MutationObserver(() => {
      if (!videoDelayWorker) return;
      videoDelayWorker.postMessage({ type: 'filter', filter: videoEl.style.filter || 'none' });
      if (videoDelayActive() && (!videoDelayFilterHasUrlRef()) !== videoDelayTrackOn) restartVideoDelayCapture();
    }).observe(PPNative.raw(videoEl), { attributes: true, attributeFilter: ['style'] });
  }

