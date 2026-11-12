  // ---------- Cutter (trim & export) ----------
  let cutterState = null;     // {trackIndex, duration, start, end}
  let cutterPreviewing = false;
  let cutterPlayheadRAF = null;
  let cutterExporting = false;
  let cutterExportAbort = null; // set while a video clip is recording; call to cancel
  let cutterFormat = 'mp3';  // 'fast' | 'video' | 'wav' | 'mp3'

  // Video clips are recorded with MediaRecorder, so the container depends on
  // what this browser can encode: MP4 (H.264/AAC) where available, else WebM.
  function pickVideoRecorderMime(){
    if (typeof MediaRecorder === 'undefined' || !MediaRecorder.isTypeSupported) return null;
    const candidates = [
      { mime: 'video/mp4;codecs=avc1.640028,mp4a.40.2', ext: 'mp4' },
      { mime: 'video/mp4;codecs=avc1,mp4a.40.2', ext: 'mp4' },
      { mime: 'video/mp4', ext: 'mp4' },
      { mime: 'video/webm;codecs=vp9,opus', ext: 'webm' },
      { mime: 'video/webm;codecs=vp8,opus', ext: 'webm' },
      { mime: 'video/webm', ext: 'webm' }
    ];
    for (const c of candidates){
      try { if (MediaRecorder.isTypeSupported(c.mime)) return c; } catch(e){}
    }
    return null;
  }
  const CUTTER_VIDEO_REC = pickVideoRecorderMime();
  // WebCodecs fast re-encode: decode -> filter -> encode on the device's video hardware, faster than real time.
  const CUTTER_WEBCODECS = typeof VideoDecoder !== 'undefined' && typeof VideoEncoder !== 'undefined' &&
    typeof AudioEncoder !== 'undefined' && typeof AudioData !== 'undefined' && typeof Mp4Muxer !== 'undefined';

  const CUTTER_FORMAT_OPTIONS = {
    video: [
      ...(CUTTER_VIDEO_REC ? [{ id: 'video', label: 'Real-time (.' + CUTTER_VIDEO_REC.ext + ')' }] : []),
      { id: 'mp3', label: 'Audio only (.mp3)' }
    ],
    audio: [
      { id: 'wav', label: 'WAV' },
      { id: 'mp3', label: 'MP3' }
    ]
  };

  const CUTTER_HINTS = {
    fast: 'Instant and lossless: the original video data is copied without re-encoding, so quality is unchanged and the clip starts and ends exactly at the chosen points.',
    encode: 'Re-encodes the clip, usually much faster than real time, and applies any enabled effects. Quality is very close to the original but not bit-for-bit. Falls back to real-time recording if the browser cannot do it.',
    video: 'Re-records the selection in real time, so a 30 second clip takes about 30 seconds. Use when Fast copy is not available for the file. Keep the app open while it runs.'
  };
  function applyCutterFormatHints(){
    cutterMp3QualityRow.classList.toggle('show', cutterFormat === 'mp3');
    const h = CUTTER_HINTS[cutterFormat];
    cutterVideoHint.textContent = h || '';
    cutterVideoHint.classList.toggle('show', !!h);
    if (typeof updateCutterFxUI === 'function') updateCutterFxUI();
  }

  function renderCutterFormatOptions(kind, canFast){
    let opts = CUTTER_FORMAT_OPTIONS[kind] || CUTTER_FORMAT_OPTIONS.audio;
    if (kind === 'video' && canFast) opts = [{ id: 'fast', label: 'Fast copy (.mp4)' }, ...(CUTTER_WEBCODECS ? [{ id: 'encode', label: 'Fast re-encode (.mp4)' }] : []), ...opts];
    cutterFormat = opts[0].id;
    cutterFormatBtnsEl.innerHTML = '';
    opts.forEach(opt => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'cutter-format-btn' + (opt.id === cutterFormat ? ' active' : '');
      btn.textContent = opt.label;
      btn.dataset.format = opt.id;
      btn.addEventListener('click', () => {
        cutterFormat = opt.id;
        cutterFormatBtnsEl.querySelectorAll('.cutter-format-btn').forEach(b => {
          b.classList.toggle('active', b.dataset.format === cutterFormat);
        });
        applyCutterFormatHints();
      });
      cutterFormatBtnsEl.appendChild(btn);
    });
    applyCutterFormatHints();
  }

  // Cache of the source file as a Blob (a cheap reference, not a copy) plus
  // whether it is an MP4/MOV that Fast copy can handle.
  let cutterSourceCache = null; // { url, blob, isMp4 }
  async function getCutterSource(track){
    if (cutterSourceCache && cutterSourceCache.url === track.url) return cutterSourceCache;
    const blob = await (await fetch(track.url)).blob();
    cutterSourceCache = { url: track.url, blob, isMp4: await MP4T.looksLikeMp4(blob) };
    return cutterSourceCache;
  }

  function parseTimeInput(str, fallback){
    if (!str) return fallback;
    str = str.trim();
    if (str === '') return fallback;
    const parts = str.split(':');
    let secs;
    if (parts.length === 2){
      const m = parseFloat(parts[0]);
      const s = parseFloat(parts[1]);
      if (isNaN(m) || isNaN(s)) return fallback;
      secs = m * 60 + s;
    } else {
      const s = parseFloat(str);
      if (isNaN(s)) return fallback;
      secs = s;
    }
    return isFinite(secs) ? secs : fallback;
  }

  function updateCutterUI(){
    if (!cutterState) return;
    const { duration, start, end } = cutterState;
    const startPct = duration > 0 ? (start / duration) * 100 : 0;
    const endPct = duration > 0 ? (end / duration) * 100 : 100;
    cutterHandleStart.style.left = startPct + '%';
    cutterHandleEnd.style.left = endPct + '%';
    cutterRangeFill.style.left = startPct + '%';
    cutterRangeFill.style.width = Math.max(0, endPct - startPct) + '%';
    cutterStartInput.value = fmtTime(start);
    cutterEndInput.value = fmtTime(end);
    cutterDurationLabel.textContent = fmtTime(Math.max(0, end - start));
    cutterExportBtn.disabled = (end - start) < 0.1 || cutterExporting;
    cutterHandleStart.setAttribute('aria-valuenow', start.toFixed(2));
    cutterHandleEnd.setAttribute('aria-valuenow', end.toFixed(2));
  }

  function startCutterPlayheadLoop(){
    stopCutterPlayheadLoop();
    const step = () => {
      if (!cutterModalOverlay.classList.contains('open')) return;
      if (cutterState){
        const m = media();
        const pct = cutterState.duration > 0 ? (m.currentTime / cutterState.duration) * 100 : 0;
        cutterPlayhead.style.left = Math.min(100, Math.max(0, pct)) + '%';
        cutterPlayhead.style.display = (m.paused && !cutterPreviewing) ? 'none' : 'block';
      }
      cutterPlayheadRAF = requestAnimationFrame(step);
    };
    cutterPlayheadRAF = requestAnimationFrame(step);
  }
  function stopCutterPlayheadLoop(){
    if (cutterPlayheadRAF) cancelAnimationFrame(cutterPlayheadRAF);
    cutterPlayheadRAF = null;
  }

  function openCutterModal(){
    // An export is already running (window was hidden): just bring its window back, don't reset anything.
    if (cutterExporting){ cutterReopenDuringExport(); return; }
    if (currentIndex === -1 || !tracks[currentIndex]) return;
    const t = tracks[currentIndex];
    const dur = media().duration;
    if (!dur || !isFinite(dur)) return; // metadata not ready yet
    cutterState = { trackIndex: currentIndex, duration: dur, start: 0, end: dur };
    cutterTrackName.textContent = t.title;
    cutterNameInput.value = '';
    cutterFxSig = '';
    renderCutterFormatOptions(t.kind);
    cutterErrorEl.classList.remove('active');
    cutterErrorEl.textContent = '';
    cutterProgressWrap.classList.remove('active');
    cutterExporting = false;
    cutterExportBtn.disabled = false;
    cutterExportBtn.textContent = 'Export clip';
    stopCutterPreview();
    updateCutterUI();
    cutterModalOverlay.classList.add('open');
    startCutterPlayheadLoop();
    if (t.kind === 'video'){
      const state = cutterState;
      getCutterSource(t).then(src => {
        if (cutterState !== state || cutterExporting || !src.isMp4) return;
        renderCutterFormatOptions('video', true);
      }).catch(() => {});
    }
  }
  function closeCutterModal(){
    if (cutterExportAbort) cutterExportAbort();
    cutterModalOverlay.classList.remove('open');
    stopCutterPreview();
    stopCutterPlayheadLoop();
  }

  function cutterPointToTime(clientX){
    const rect = cutterRangeWrap.getBoundingClientRect();
    const pct = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    return pct * cutterState.duration;
  }

  function setupCutterDrag(handle, which){
    handle.addEventListener('pointerdown', (e) => {
      if (!cutterState) return;
      e.preventDefault();
      handle.setPointerCapture(e.pointerId);
      const onMove = (ev) => {
        let t = cutterPointToTime(ev.clientX);
        if (which === 'start') cutterState.start = Math.max(0, Math.min(t, cutterState.end - 0.05));
        else cutterState.end = Math.min(cutterState.duration, Math.max(t, cutterState.start + 0.05));
        updateCutterUI();
      };
      const onUp = () => {
        try { handle.releasePointerCapture(e.pointerId); } catch(err){}
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
      };
      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
    });
    handle.addEventListener('keydown', (e) => {
      if (!cutterState) return;
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
      e.preventDefault();
      const delta = (e.key === 'ArrowRight' ? 1 : -1) * (e.shiftKey ? 5 : 1);
      if (which === 'start') cutterState.start = Math.max(0, Math.min(cutterState.start + delta, cutterState.end - 0.05));
      else cutterState.end = Math.min(cutterState.duration, Math.max(cutterState.end + delta, cutterState.start + 0.05));
      updateCutterUI();
    });
  }
  setupCutterDrag(cutterHandleStart, 'start');
  setupCutterDrag(cutterHandleEnd, 'end');

  // Clicking the bare track (not a handle) nudges whichever handle is closer.
  cutterRangeWrap.addEventListener('pointerdown', (e) => {
    if (!cutterState) return;
    if (e.target === cutterHandleStart || e.target === cutterHandleEnd) return;
    const t = cutterPointToTime(e.clientX);
    const distStart = Math.abs(t - cutterState.start);
    const distEnd = Math.abs(t - cutterState.end);
    if (distStart <= distEnd) cutterState.start = Math.min(t, cutterState.end - 0.05);
    else cutterState.end = Math.max(t, cutterState.start + 0.05);
    updateCutterUI();
  });

  cutterStartInput.addEventListener('change', () => {
    if (!cutterState) return;
    const v = parseTimeInput(cutterStartInput.value, cutterState.start);
    cutterState.start = Math.max(0, Math.min(v, cutterState.end - 0.05));
    updateCutterUI();
  });
  cutterEndInput.addEventListener('change', () => {
    if (!cutterState) return;
    const v = parseTimeInput(cutterEndInput.value, cutterState.end);
    cutterState.end = Math.min(cutterState.duration, Math.max(v, cutterState.start + 0.05));
    updateCutterUI();
  });
  cutterStartNowBtn.addEventListener('click', () => {
    if (!cutterState) return;
    const t = media().currentTime;
    cutterState.start = Math.max(0, Math.min(t, cutterState.end - 0.05));
    updateCutterUI();
  });
  cutterEndNowBtn.addEventListener('click', () => {
    if (!cutterState) return;
    const t = media().currentTime;
    cutterState.end = Math.min(cutterState.duration, Math.max(t, cutterState.start + 0.05));
    updateCutterUI();
  });

  function cutterPreviewWatcher(){
    if (!cutterPreviewing || !cutterState) return;
    if (media().currentTime >= cutterState.end){
      media().pause();
      stopCutterPreview();
    }
  }
  function stopCutterPreview(){
    if (cutterPreviewing) media().removeEventListener('timeupdate', cutterPreviewWatcher);
    cutterPreviewing = false;
    cutterPreviewLabel.textContent = 'Preview selection';
    cutterPreviewBtn.classList.remove('toggled');
  }
  cutterPreviewBtn.addEventListener('click', () => {
    if (!cutterState) return;
    if (cutterPreviewing){
      media().pause();
      stopCutterPreview();
      return;
    }
    const m = media();
    m.currentTime = cutterState.start;
    m.play().catch(()=>{});
    cutterPreviewing = true;
    cutterPreviewLabel.textContent = 'Stop preview';
    cutterPreviewBtn.classList.add('toggled');
    m.addEventListener('timeupdate', cutterPreviewWatcher);
  });

  cutterBtn.addEventListener('click', openCutterModal);
  cutterCancelBtn.addEventListener('click', closeCutterModal);
  cutterModalOverlay.addEventListener('click', (e) => {
    if (e.target !== cutterModalOverlay) return;
    if (cutterExporting) cutterHideDuringExport();   // a stray tap outside must not cancel a running export
    else closeCutterModal();
  });
  // ---- Hide the export window without cancelling the export ----
  const cutterHideBtn = document.getElementById('cutter-hide-btn');
  const cutterChip = document.getElementById('cutter-export-chip');
  const cutterChipText = document.getElementById('cutter-chip-text');
  const cutterChipFill = document.getElementById('cutter-chip-fill');
  let cutterLastPct = 0, cutterLastLabel = 'Exporting…';
  function updateCutterChip(){
    cutterChipFill.style.width = Math.round(cutterLastPct * 100) + '%';
    cutterChipText.textContent = cutterLastLabel + ' ' + Math.round(cutterLastPct * 100) + '%  (tap to open)';
  }
  function cutterHideDuringExport(){
    if (!cutterExporting) return;
    cutterModalOverlay.classList.remove('open');
    stopCutterPlayheadLoop();
    updateCutterChip();
    cutterChip.classList.add('show');
  }
  function cutterReopenDuringExport(){
    cutterChip.classList.remove('show');
    cutterModalOverlay.classList.add('open');
    startCutterPlayheadLoop();
  }
  function cutterExportUiState(on){
    cutterHideBtn.style.display = on ? '' : 'none';
    cutterCancelBtn.textContent = on ? 'Cancel export' : 'Close';
    if (!on) cutterChip.classList.remove('show');
  }
  cutterHideBtn.addEventListener('click', cutterHideDuringExport);
  cutterChip.addEventListener('click', cutterReopenDuringExport);
  cutterChip.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' '){ e.preventDefault(); cutterReopenDuringExport(); } });
  // Closing the browser tab does end the export (it runs in the page), so ask first.
  window.addEventListener('beforeunload', (e) => {
    if (!cutterExporting) return;
    e.preventDefault();
    e.returnValue = '';
  });

  function setCutterError(msg){
    cutterErrorEl.textContent = msg;
    cutterErrorEl.classList.add('active');
  }
  function setCutterProgress(pct, label){
    cutterLastPct = pct;
    if (label) cutterLastLabel = label;
    if (cutterChip.classList.contains('show')) updateCutterChip();
    cutterProgressWrap.classList.add('active');
    cutterProgressFill.style.width = Math.round(pct * 100) + '%';
    if (label) cutterProgressLabel.textContent = label;
  }
  function safeFilename(name){
    return (name || 'clip').replace(/[\\/:*?"<>|]+/g, '_').trim().slice(0, 80) || 'clip';
  }
  function downloadBlob(blob, filename){ return window.ppSaveBlob(blob, filename); }

  // 16-bit PCM WAV encoder, used to export trimmed audio without
  // depending on any external library.
  function audioBufferToWav(buffer){
    const numChannels = buffer.numberOfChannels;
    const sampleRate = buffer.sampleRate;
    const numFrames = buffer.length;
    const blockAlign = numChannels * 2;
    const dataSize = numFrames * blockAlign;
    const out = new ArrayBuffer(44 + dataSize);
    const view = new DataView(out);
    function writeStr(offset, str){
      for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
    }
    writeStr(0, 'RIFF');
    view.setUint32(4, 36 + dataSize, true);
    writeStr(8, 'WAVE');
    writeStr(12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, numChannels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * blockAlign, true);
    view.setUint16(32, blockAlign, true);
    view.setUint16(34, 16, true);
    writeStr(36, 'data');
    view.setUint32(40, dataSize, true);

    const channelData = [];
    for (let ch = 0; ch < numChannels; ch++) channelData.push(buffer.getChannelData(ch));
    let offset = 44;
    for (let i = 0; i < numFrames; i++){
      for (let ch = 0; ch < numChannels; ch++){
        let sample = Math.max(-1, Math.min(1, channelData[ch][i]));
        sample = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
        view.setInt16(offset, sample, true);
        offset += 2;
      }
    }
    return new Blob([out], { type: 'audio/wav' });
  }

