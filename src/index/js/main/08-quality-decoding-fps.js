  // ---------- Quality / upscale settings ----------
  const memcQBtns = document.querySelectorAll('[data-memc-q]');
  const memcUpBtns = document.querySelectorAll('[data-memc-up]');
  function memcUpdateQualityUI(){
    memcQBtns.forEach(b => b.classList.toggle('toggled', parseInt(b.dataset.memcQ, 10) === memcQuality));
  }
  function memcUpdateUpscaleUI(){
    memcUpBtns.forEach(b => b.classList.toggle('toggled', parseInt(b.dataset.memcUp, 10) === memcUpscale));
    const pl = document.getElementById('upscale-pill-label');
    if (pl) pl.textContent = !memcEnhOn() ? 'Off' : enhAI !== 'off' ? 'AI' : memcUpscale ? (MEMC_UP_CAPS[memcUpscale] === 2160 ? '4K' : MEMC_UP_CAPS[memcUpscale] + 'p') : 'On';
    const sl = document.getElementById('enh-sharp'), sv = document.getElementById('enh-sharp-val');
    if (sl) sl.value = enhSharp;
    if (sv) sv.textContent = enhSharp ? enhSharp + '%' : 'Off';
    [['enh-deblock-toggle', enhDeblock], ['enh-deband-toggle', enhDeband], ['enh-anime-toggle', enhAnime], ['enh-compare-toggle', enhCompare]]
      .forEach(([id, v]) => { const el = document.getElementById(id); if (el) el.checked = v; });
    const ub = document.getElementById('upscale-btn'); if (ub) ub.classList.toggle('toggled', memcEnhOn());
    const ai = document.getElementById('enh-ai-select'); if (ai && ai.value !== enhAI) ai.value = enhAI;
    // the Apply button: says plainly whether the settings above are being applied
    const ap = document.getElementById('enh-apply'), dd = document.getElementById('upscale-dropdown');
    if (ap){
      const on = memcEnhOn();
      ap.classList.toggle('on', on);
      ap.setAttribute('aria-pressed', on ? 'true' : 'false');
      ap.textContent = on ? 'Enhancements on \u00b7 tap to turn off' : enhMaster ? 'On, but nothing is set above' : 'Apply enhancements';
    }
    if (dd) dd.classList.toggle('enh-off', !memcEnhOn());
  }
  // ---- Compare: the before | after line, dragged on the video ----
  // The picture on the left of the line is without Picture enhance, on the right with it. The line and its grip are
  // drawn here (over the video box) so they can be dragged; the GPU only splits the picture at the same place.
  // Positions are fractions of the picture itself, which can be narrower than the box (black bars).
  const enhSplit = document.createElement('div');
  enhSplit.id = 'enh-split';
  enhSplit.innerHTML = '<span class="es-tag es-l">Before</span><span class="es-tag es-r">After</span><i class="es-line"></i>'
    + '<b class="es-grip" aria-label="Drag to compare" role="slider" aria-valuemin="0" aria-valuemax="100"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M9 7l-5 5 5 5M15 7l5 5-5 5"/></svg></b>';
  videoWrap.appendChild(enhSplit);
  // The picture's rectangle inside the video box (object-fit: contain).
  function enhPicRect(){
    const r = videoWrap.getBoundingClientRect();
    const vw = videoEl.videoWidth || (window.PPNative && PPNative.videoSize && PPNative.videoSize().w) || r.width;
    const vh = videoEl.videoHeight || (window.PPNative && PPNative.videoSize && PPNative.videoSize().h) || r.height;
    const a = vw / Math.max(1, vh);
    let w = r.width, h = r.height;
    if (r.width / Math.max(1, r.height) > a) w = r.height * a; else h = r.width / a;
    return { left: (r.width - w) / 2, top: (r.height - h) / 2, w, h };
  }
  function enhSplitPaint(){
    const show = enhCompare && enhAnyOn() && currentIndex !== -1 && tracks[currentIndex] && tracks[currentIndex].kind === 'video';
    enhSplit.classList.toggle('on', !!show);
    if (!show) return;
    const p = enhPicRect();
    enhSplit.style.left = (p.left + p.w * enhCompareX) + 'px';
    enhSplit.style.top = p.top + 'px';
    enhSplit.style.height = p.h + 'px';
    enhSplit.querySelector('.es-grip').setAttribute('aria-valuenow', Math.round(enhCompareX * 100));
  }
  function enhAnyOn(){ return memcEnhOn(); }
  let enhDrag = null;
  enhSplit.addEventListener('pointerdown', (e) => {
    e.preventDefault(); e.stopPropagation();
    enhDrag = { id: e.pointerId };
    try { enhSplit.setPointerCapture(e.pointerId); } catch (x){}
    enhSplit.classList.add('drag');
  });
  enhSplit.addEventListener('pointermove', (e) => {
    if (!enhDrag || e.pointerId !== enhDrag.id) return;
    e.preventDefault(); e.stopPropagation();
    const r = videoWrap.getBoundingClientRect(), p = enhPicRect();
    enhCompareX = Math.max(0.02, Math.min(0.98, (e.clientX - r.left - p.left) / Math.max(1, p.w)));
    enhSplitPaint();
    if (memcActive) memcRepaint();
    try { nativeMemcPush(); } catch (x){}
  });
  const enhDragEnd = (e) => { if (!enhDrag) return; e.stopPropagation(); enhDrag = null; enhSplit.classList.remove('drag'); };
  enhSplit.addEventListener('pointerup', enhDragEnd);
  enhSplit.addEventListener('pointercancel', enhDragEnd);
  // keep the video's own taps and swipes from reacting to the handle
  ['click', 'dblclick', 'touchstart', 'touchmove', 'touchend', 'mousedown'].forEach(n => enhSplit.addEventListener(n, (e) => e.stopPropagation(), { passive: n.startsWith('touch') }));
  window.addEventListener('resize', enhSplitPaint);
  document.addEventListener('fullscreenchange', () => setTimeout(enhSplitPaint, 60));
  try { new ResizeObserver(enhSplitPaint).observe(videoWrap); } catch (e){}
  videoEl.addEventListener('loadedmetadata', enhSplitPaint);

  // Any enhance change: start/stop the GPU engine as needed, resize its output, and show the result (also while paused).
  // auto (default): a setting was changed, which turns the enhancements on so its effect shows straight away.
  function enhChanged(auto){
    if (auto !== false && memcEnhSettings()) enhMaster = true;
    enhSave(); memcUpdateUpscaleUI(); enhSplitPaint();
    refreshVideoDelayState();
    if (memcActive){ memcApplyOutSize(); memcRepaint(); }
  }
  function memcRepaint(){
    memcLastKey = '';
    if (memcActive && videoEl.paused) try { memcPresent(videoEl.currentTime, true); } catch (e){}
  }
  memcQBtns.forEach(b => b.addEventListener('click', () => {
    memcQuality = parseInt(b.dataset.memcQ, 10) || 0;
    try { localStorage.setItem(MEMC_Q_KEY, String(memcQuality)); } catch (e){}
    memcUpdateQualityUI();
    memcResKey = ''; memcInvalidate();      // ring is rebuilt on the next captured frame
    if (memcActive) memcCaptureNow();
  }));
  memcUpBtns.forEach(b => b.addEventListener('click', () => {
    memcUpscale = parseInt(b.dataset.memcUp, 10) || 0;
    try { localStorage.setItem(MEMC_UP_KEY, String(memcUpscale)); } catch (e){}
    if (memcUpscale && !enhSharpSet){ enhSharp = 50; enhSharpSet = true; }   // upscaling on its own looks like nothing: start with some sharpening
    enhChanged();
  }));
  (function(){
    const ai = document.getElementById('enh-ai-select'), st = document.getElementById('enh-ai-status');
    if (ai){
      ai.addEventListener('change', () => {
        enhAI = ENH_AI_IDS.includes(ai.value) ? ai.value : 'off';
        if (enhAI !== 'off'){ srStatus = 'Loading\u2026'; srEnsureLoaded().then(ok => { if (!ok) srStatus = 'Could not load the AI models.'; memcApplyOutSize(); memcRepaint(); }); }
        enhChanged();
      });
      if (enhAI !== 'off') srEnsureLoaded();
      // what the AI upscaler is doing right now, while the menu is open
      setInterval(() => {
        const dd = document.getElementById('upscale-dropdown');
        if (!st || !dd || !dd.classList.contains('open')) return;
        const nat = window.PPNative && PPNative.videoActive && PPNative.videoActive();
        st.textContent = enhAI === 'off' ? '' : nat ? ((PPNative.memcStatus && PPNative.memcStatus.ai) || 'Starts when a video plays.') : (srStatus || (memcActive ? 'Waiting for a video frame\u2026' : 'Starts when a video plays.'));
      }, 500);
    }
    const cb = document.getElementById('enh-copy-btn'), cc = document.getElementById('enh-copy-cancel'), cs = document.getElementById('enh-copy-status');
    const csz = document.getElementById('enh-copy-size');
    if (csz){
      try { const v = localStorage.getItem('ppEnhCopySize'); if (v && csz.querySelector('option[value="' + v + '"]')) csz.value = v; } catch (e){}
      // what "this video" would become, so the choice is clear before starting
      const show = () => {
        const t = currentIndex !== -1 ? tracks[currentIndex] : null;
        if (!t || t.kind !== 'video' || !cb || cb.disabled) return;
        const vw = t.width || videoEl.videoWidth, vh = t.height || videoEl.videoHeight, s = enhCopyTarget(csz.value, vw, vh);
        const sh = Math.min(vw || 0, vh || 0);
        cs.textContent = !sh ? '' : !s ? 'This video is already 4K or bigger.' : s < sh * 1.05 ? 'This video is already ' + sh + 'p: pick a bigger size.'
          : 'This video: ' + sh + 'p \u2192 ' + (s >= 2160 ? '4K' : s + 'p') + (s / sh > 2.05 ? ' (two AI passes, slower)' : '');
      };
      csz.addEventListener('change', () => { try { localStorage.setItem('ppEnhCopySize', csz.value); } catch (e){} show(); });
      document.getElementById('upscale-btn').addEventListener('click', () => setTimeout(show, 0));
    }
    if (cb){
      cb.addEventListener('click', async (e) => {
        e.stopPropagation();
        cb.disabled = true; cc.hidden = false;
        try { await enhMakeCopy((txt) => { cs.textContent = txt; }, csz ? csz.value : 'auto'); }
        finally { cb.disabled = false; cc.hidden = true; }
      });
      cc.addEventListener('click', (e) => { e.stopPropagation(); if (cutterExportAbort) cutterExportAbort(); });
    }
    const sl = document.getElementById('enh-sharp');
    if (sl) sl.addEventListener('input', () => { enhSharp = parseInt(sl.value, 10) || 0; enhSharpSet = true; enhChanged(); });
    [['enh-deblock-toggle', v => { enhDeblock = v; }], ['enh-deband-toggle', v => { enhDeband = v; }],
     ['enh-anime-toggle', v => { enhAnime = v; }], ['enh-compare-toggle', v => { enhCompare = v; }]].forEach(([id, set]) => {
      const el = document.getElementById(id);
      if (el) el.addEventListener('change', () => { set(el.checked); enhChanged(id !== 'enh-compare-toggle'); });
    });
    const ap = document.getElementById('enh-apply');
    if (ap) ap.addEventListener('click', (e) => {
      e.stopPropagation();
      enhMaster = !memcEnhOn();
      if (enhMaster && !memcEnhSettings()){ enhMaster = true; showToast('Pick an upscaler or a setting above first.'); }
      if (enhMaster && enhAI !== 'off') srEnsureLoaded().then(() => memcRepaint());
      enhChanged(false);
    });
  })();
  memcUpdateQualityUI(); memcUpdateUpscaleUI();
  if ('ResizeObserver' in window){
    new ResizeObserver(() => { if (memcActive){ memcApplyOutSize(); memcRepaint(); } }).observe(memcCanvas);
  }

  // ---------- Video decoding / frame-drop protection ----------
  (function(){
    const VIDEO_UI_KEY = 'playerVideoUiLite';
    let videoUiMode = 'anim';
    try { const v = localStorage.getItem(VIDEO_UI_KEY); if (v === 'off' || v === 'anim' || v === 'flat') videoUiMode = v; } catch (e){}
    function applyVideoUi(){
      const playing = !videoEl.paused && !videoEl.ended && videoWrap.style.display !== 'none'
        && currentIndex !== -1 && tracks[currentIndex] && tracks[currentIndex].kind === 'video';
      document.body.classList.toggle('video-ui-lite', playing && videoUiMode !== 'off');
      document.body.classList.toggle('video-ui-flat', playing && videoUiMode === 'flat');
    }
    ['play', 'playing', 'pause', 'ended', 'emptied', 'loadstart', 'loadeddata'].forEach(ev => videoEl.addEventListener(ev, applyVideoUi));
    const vuSel = document.getElementById('video-ui-select');
    if (vuSel){
      vuSel.value = videoUiMode;
      vuSel.addEventListener('change', () => {
        videoUiMode = vuSel.value;
        try { localStorage.setItem(VIDEO_UI_KEY, videoUiMode); } catch (e){}
        applyVideoUi();
      });
    }
    applyVideoUi();
    const nvTog = document.getElementById('native-video-toggle'), nvRow = document.getElementById('native-video-row');
    if (nvTog && nvRow && window.PPNative && PPNative.setNativeVideo && window.Capacitor && Capacitor.isNativePlatform && Capacitor.isNativePlatform()){
      nvRow.style.display = '';
      nvTog.checked = PPNative.nativeVideoSetting();
      nvTog.addEventListener('change', () => PPNative.setNativeVideo(nvTog.checked));
    }
    const alTog = document.getElementById('audio-lead-toggle');
    if (alTog){
      alTog.checked = audioLeadOn;
      alTog.addEventListener('change', () => {
        audioLeadOn = alTog.checked;
        try { localStorage.setItem(AUDIO_LEAD_KEY, audioLeadOn ? '1' : '0'); } catch (e){}
        refreshVideoDelayState();
        memcLastKey = '';
      });
    }
    const llTog = document.getElementById('lossless-latency-toggle');
    const llQRow = document.getElementById('lossless-quality-row');
    const llQSel = document.getElementById('lossless-quality-select');
    const syncLlQ = () => { if (llQRow) llQRow.style.display = losslessLatency ? '' : 'none'; };
    if (llQSel){
      llQSel.value = losslessQuality;
      llQSel.addEventListener('change', () => {
        losslessQuality = llQSel.value;
        try { localStorage.setItem(LOSSLESS_Q_KEY, losslessQuality); } catch (e){}
        refreshVideoDelayState();
      });
    }
    syncLlQ();
    if (llTog){
      llTog.checked = losslessLatency;
      llTog.addEventListener('change', () => {
        losslessLatency = llTog.checked;
        syncLlQ();
        try { localStorage.setItem(LOSSLESS_LAT_KEY, losslessLatency ? '1' : '0'); } catch (e){}
        refreshVideoDelayState();
        // Switching engines mid-playback: restart track capture so the worker starts fresh.
        if (VIDEO_DELAY_CAN_USE_TRACK && videoDelayActive()) restartVideoDelayCapture();
      });
    }
    const sel = document.getElementById('perf-mode-select');
    const sub = document.getElementById('perf-mode-sub');
    const checkBtn = document.getElementById('perf-check-btn');
    const out = document.getElementById('perf-check-out');
    const baseSub = sub ? sub.textContent : '';
    const q = () => { try { return videoEl.getVideoPlaybackQuality ? videoEl.getVideoPlaybackQuality() : null; } catch (e){ return null; } };

    // Re-apply everything that depends on light mode being on or off.
    function applyPerf(){
      document.body.classList.toggle('perf-light', perfLightActive());
      applyVideoFilter();
      refreshVideoDelayState();
      memcResetStream();
      if (sub) sub.textContent = baseSub + (perfMode === 'auto' && perfAutoTripped ? ' (Light is on for this video: frames were dropping.)' : '');
    }
    if (sel){
      sel.value = perfMode;
      sel.addEventListener('change', () => {
        perfMode = sel.value;
        perfAutoTripped = false;
        try { localStorage.setItem(PERF_KEY, perfMode); } catch (e){}
        applyPerf();
      });
    }
    // Initial state only: the normal startup path applies the filter and delay
    // engines later (and honours light mode), so don't touch them this early.
    document.body.classList.toggle('perf-light', perfLightActive());

    // Auto: watch the browser's dropped-frame counter while playing. A few
    // drops now and then are normal; 3+/s for most of 4 seconds is not.
    let last = null, hist = [], settleUntil = 0;
    function resetWatch(){ last = null; hist = []; settleUntil = performance.now() + 3000; }
    ['seeking', 'seeked', 'play', 'playing', 'ratechange', 'loadstart', 'emptied'].forEach(ev => videoEl.addEventListener(ev, resetWatch));
    videoEl.addEventListener('loadstart', () => {
      if (perfAutoTripped){ perfAutoTripped = false; applyPerf(); } // each video gets a fresh chance
    });
    ppEvery(() => {
      if (perfMode !== 'auto' || perfAutoTripped) return;
      const now = performance.now();
      if (document.hidden || videoEl.paused || videoEl.ended || videoEl.seeking || videoEl.readyState < 3
          || videoWrap.style.display === 'none' || now < settleUntil){ last = null; return; }
      const s = q(); if (!s) return;
      if (last != null){
        hist.push(Math.max(0, s.droppedVideoFrames - last));
        if (hist.length > 4) hist.shift();
        if (hist.length === 4 && hist.filter(d => d >= 3).length >= 3){
          perfAutoTripped = true;
          applyPerf();
          showToast('Frames were dropping, so Light video mode is on for this video.');
        }
      }
      last = s.droppedVideoFrames;
    }, 1000);

    // Ask the browser how well it can decode the usual codecs at this video's size.
    async function checkSupport(){
      if (!out) return;
      out.style.display = 'block';
      if (!navigator.mediaCapabilities || !navigator.mediaCapabilities.decodingInfo){
        out.textContent = 'This phone can\u2019t report decoding support.'; return;
      }
      let w = videoEl.videoWidth, h = videoEl.videoHeight, assumed = false;
      if (!w || !h){ w = 1920; h = 1080; assumed = true; }
      let fps = 30;
      const s = q();
      if (s && videoEl.currentTime > 2 && s.totalVideoFrames > 30) fps = Math.min(120, Math.max(10, Math.round(s.totalVideoFrames / videoEl.currentTime)));
      const big = w * h > 2200000;
      const tests = [
        ['H.264 (AVC)', 'video/mp4; codecs="' + (big ? 'avc1.640033' : 'avc1.640028') + '"'],
        ['H.265 (HEVC)', 'video/mp4; codecs="' + (big ? 'hvc1.1.6.L153.B0' : 'hvc1.1.6.L120.B0') + '"'],
        ['VP9', 'video/webm; codecs="vp09.00.' + (big ? '51' : '40') + '.08"'],
        ['AV1', 'video/mp4; codecs="av01.0.' + (big ? '12M' : '08M') + '.08"']
      ];
      out.textContent = 'Checking ' + w + '\u00d7' + h + ' @ ' + fps + ' fps' + (assumed ? ' (no video loaded, assuming 1080p30)' : '') + '\u2026';
      const lines = [];
      for (const [name, type] of tests){
        try {
          const r = await navigator.mediaCapabilities.decodingInfo({
            type: 'file',
            video: { contentType: type, width: w, height: h, bitrate: Math.round(w * h * fps * 0.1), framerate: fps }
          });
          const verdict = !r.supported ? 'not supported'
            : (r.smooth ? 'smooth' : 'may skip frames') + (r.powerEfficient ? ', hardware decode' : ', software decode');
          lines.push(name + ': ' + verdict);
        } catch (e){ lines.push(name + ': unknown'); }
      }
      lines.push('', 'Videos in a format marked software or may-skip are the ones that drop frames. Light mode helps there.');
      out.textContent = w + '\u00d7' + h + ' @ ' + fps + ' fps' + (assumed ? ' (no video loaded, assuming 1080p30)' : '') + '\n' + lines.join('\n');
    }
    if (checkBtn) checkBtn.addEventListener('click', checkSupport);
  })();

  // ---------- Accurate FPS counter ----------
  // Source: unique video frames per media-second (independent of playback speed).
  // Shown: canvas redraws (smoothing on) or presented video frames (smoothing off) per wall-second.
  // Screen: measured display refresh (requestAnimationFrame rate) - the hard ceiling for "Shown".
  (function(){
    const el = document.getElementById('fps-counter'), tog = document.getElementById('fps-counter-toggle');
    if (!el || !tog) return;
    const KEY = 'playerFpsCounter', FULL_KEY = 'playerFpsCounterFull';
    const fullTog = document.getElementById('fps-counter-full-toggle');
    let on = false, full = false;
    try { on = localStorage.getItem(KEY) === '1'; full = localStorage.getItem(FULL_KEY) === '1'; } catch (e){}
    // Short form: one small line ("60 fps · 120 Hz", plus drops when there are any) that sits in the player's top bar.
    function compact(shown, hz, dRate){
      el.classList.add('compact');
      el.innerHTML = '';
      el.appendChild(document.createTextNode((shown == null ? '--' : Math.round(shown)) + ' fps \u00b7 ' + (hz == null ? '--' : Math.round(hz)) + ' Hz'));
      if (dRate != null && dRate >= 0.5){
        const d = document.createElement('span');
        d.className = 'fps-drop';
        d.textContent = ' \u00b7 ' + dRate.toFixed(dRate < 10 ? 1 : 0) + ' drop/s';
        el.appendChild(d);
      }
    }
    let vfcId = null, rafId = null, timer = null;
    let vf = [];       // {w: wall ms, m: media s} per presented video frame
    let rafT = [];     // rAF timestamps
    let dropBase = 0;
    let dropHist = [];   // {w, d} samples of the browser's dropped-frame total
    const dropped = () => { try { const q = videoEl.getVideoPlaybackQuality && videoEl.getVideoPlaybackQuality(); return q ? q.droppedVideoFrames : 0; } catch (e){ return 0; } };

    function onVfc(now, meta){
      vfcId = null;
      if (!on) return;
      vfcId = videoEl.requestVideoFrameCallback(onVfc);
      const w = performance.now();
      const last = vf[vf.length - 1];
      if (!last || meta.mediaTime !== last.m) vf.push({ w, m: meta.mediaTime });
      while (vf.length && w - vf[0].w > 1000) vf.shift();
    }
    function onRaf(ts){
      rafId = null;
      if (!on) return;
      rafId = requestAnimationFrame(onRaf);
      rafT.push(ts);
      while (rafT.length && ts - rafT[0] > 1000) rafT.shift();
    }
    function render(){
      const visible = videoWrap.style.display !== 'none';
      el.classList.toggle('on', on && visible);
      if (!on || !visible) return;
      const now = performance.now();
      // Native video: the page's <video> is a stand-in (no frame callbacks, no drop counter), so read the native renderer's numbers instead.
      if (window.PPNative && PPNative.videoActive && PPNative.videoActive()){
        while (rafT.length && now - rafT[0] > 1000) rafT.shift();
        const st = PPNative.memcStatus || {}, playingN = !videoEl.paused && !videoEl.ended, rate = videoEl.playbackRate || 1;
        const srcN = st.inFps > 0 ? st.inFps : ((PPNative.videoFps && PPNative.videoFps()) || null);
        const hzN = rafT.length > 2 ? (rafT.length - 1) * 1000 / (rafT[rafT.length - 1] - rafT[0]) : null;
        const smN = !!(st.smoothing && !st.failed && !st.bypass);
        let shownN = null;
        if (playingN){
          if (smN) shownN = hzN != null ? Math.min(st.outFps || hzN, hzN) : (st.outFps || null);
          else if (srcN != null) shownN = hzN != null ? Math.min(srcN * rate, hzN) : srcN * rate;
        }
        if (!full){ compact(shownN, hzN, null); return; }
        el.classList.remove('compact');
        const fN = v => v == null ? '--' : v.toFixed(1);
        let modeN = 'native renderer';
        if (st.failed) modeN += ', smoothing unsupported';
        else if (st.bypass) modeN += ', smoothing skipped (over ' + memcMaxIn + ' fps)';
        else if (smN) modeN += ', smoothing: ' + (st.mode === 'ultra' ? 'ultra' : st.mode === 'motion' ? 'advanced' : 'simple');
        el.textContent =
          'Source  ' + fN(srcN) + ' fps\n' +
          'Shown   ' + fN(shownN) + ' fps\n' +
          'Screen  ' + (hzN == null ? '--' : Math.round(hzN)) + ' Hz\n' +
          'Dropped n/a (native)\n' +
          (st.ring && smN ? 'Render  ' + st.ring + '\n' : '') +
          modeN;
        return;
      }
      while (vf.length && now - vf[0].w > 1000) vf.shift();
      const playing = !videoEl.paused && !videoEl.ended && vf.length >= 2 && now - vf[vf.length - 1].w < 500;
      let src = null;
      if (playing){
        const span = vf[vf.length - 1].m - vf[0].m;
        if (span > 0) src = (vf.length - 1) / span;
      }
      let shown = null, smoothed = false;
      if (playing){
        if (memcActive && !memcFailed){
          while (memcDrawStamps.length && now - memcDrawStamps[0] > 1000) memcDrawStamps.shift();
          const n = memcDrawStamps.length;
          shown = n > 1 ? (n - 1) * 1000 / (memcDrawStamps[n - 1] - memcDrawStamps[0]) : 0;
          smoothed = true;
        } else {
          shown = (vf.length - 1) * 1000 / (vf[vf.length - 1].w - vf[0].w);
        }
      }
      let hz = null;
      if (rafT.length > 2) hz = (rafT.length - 1) * 1000 / (rafT[rafT.length - 1] - rafT[0]);
      const dTot = Math.max(0, dropped() - dropBase);
      dropHist.push({ w: now, d: dTot });
      while (dropHist.length > 1 && now - dropHist[0].w > 1000) dropHist.shift();
      let dRate = null;
      if (playing && dropHist.length > 1){
        const a = dropHist[0], b = dropHist[dropHist.length - 1];
        if (b.w > a.w) dRate = Math.max(0, (b.d - a.d) * 1000 / (b.w - a.w));
      }
      if (!full){ compact(shown, hz, dRate); return; }
      el.classList.remove('compact');
      const overScreen = src != null && hz != null && src > hz + 1.5;
      const f1 = v => v == null ? '--' : v.toFixed(1);
      let mode = 'native';
      if (memcMode !== 'off'){
        if (memcFailed) mode = 'unsupported';
        else if (memcBypass) mode = 'skipped (over ' + memcMaxIn + ' fps)' + (memcActive ? ', delay: GPU' : '');
        else if (memcActive) mode = 'smoothing: ' + (memcMode === 'ultra' ? 'ultra' : memcMode === 'motion' ? 'advanced' : 'simple');
      } else if (memcActive) mode = 'delay: GPU';
      el.textContent =
        'Source  ' + f1(src) + ' fps\n' +
        'Shown   ' + f1(shown) + ' fps' + (smoothed ? '' : '') + '\n' +
        'Screen  ' + (hz == null ? '--' : Math.round(hz)) + ' Hz\n' +
        'Dropped ' + (dRate == null ? '--' : dRate.toFixed(1)) + '/s (' + dTot + ' total)\n' +
        (overScreen ? 'Source > screen: drops expected\n' : '') +
        (memcActive && memcRingW ? 'Render  ' + memcRingW + 'x' + memcRingH + (memcOutW > memcRingW ? ' \u2192 ' + memcOutW + 'x' + memcOutH : '') + '\n' : '') +
        mode;
    }
    function start(){
      memcCountDraws = true;
      if (vfcId == null && 'requestVideoFrameCallback' in videoEl) vfcId = videoEl.requestVideoFrameCallback(onVfc);
      if (rafId == null) rafId = requestAnimationFrame(onRaf);
      if (timer == null) timer = setInterval(render, 250);
      dropBase = dropped(); dropHist = [];
      render();
    }
    function stop(){
      memcCountDraws = false; memcDrawStamps.length = 0;
      if (vfcId != null && 'cancelVideoFrameCallback' in videoEl) videoEl.cancelVideoFrameCallback(vfcId);
      vfcId = null;
      if (rafId != null) cancelAnimationFrame(rafId);
      rafId = null;
      if (timer != null) clearInterval(timer);
      timer = null;
      vf = []; rafT = [];
      el.classList.remove('on');
    }
    tog.checked = on;
    if (fullTog){
      fullTog.checked = full;
      fullTog.addEventListener('change', () => {
        full = fullTog.checked;
        try { localStorage.setItem(FULL_KEY, full ? '1' : '0'); } catch (e){}
        if (on) render();
      });
    }
    tog.addEventListener('change', () => {
      on = tog.checked;
      try { localStorage.setItem(KEY, on ? '1' : '0'); } catch (e){}
      if (on) start(); else stop();
    });
    videoEl.addEventListener('loadedmetadata', () => { vf = []; dropHist = []; dropBase = dropped(); });
    videoEl.addEventListener('seeked', () => { vf = []; });
    if (on) start();
  })();

  videoEl.addEventListener('loadedmetadata', () => { memcResetSource(); refreshVideoDelayState(); });
  videoEl.addEventListener('emptied', () => { memcResetSource(); });
  videoEl.addEventListener('seeking', () => { if (memcActive) memcResetStream(); });
  videoEl.addEventListener('ratechange', () => {
    memcOffValid = false;
    // Speed changes the effective source rate: un-skip when it now fits under the limit.
    if (memcBypass && memcPeriodN >= 30 && memcMode !== 'off'
        && !(memcRate() / memcUniqGap() > memcMaxIn + 1.5 || memcPeriod / memcRate() > 0.125)){
      memcBypass = false;
      memcResetStream();
      refreshVideoDelayState();
    }
  });
  videoEl.addEventListener('pause', () => {
    memcOffValid = false;
    if (memcActive) try { memcPresent(videoEl.currentTime, true); } catch (e){ memcFailHard(e); }
  });
  videoEl.addEventListener('playing', () => { memcOffValid = false; memcKickRaf(); });
  videoEl.addEventListener('play', () => { memcOffValid = false; memcKickRaf(); });

  // The canvas is filtered exactly like the <video> it replaces.
  new MutationObserver(() => { memcCanvas.style.filter = videoEl.style.filter || ''; })
    .observe(PPNative.raw(videoEl), { attributes: true, attributeFilter: ['style'] });
  memcCanvas.style.filter = videoEl.style.filter || '';
  memcUpdateUI();

