  // ---------- Keyboard shortcuts ----------
  document.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT') return;
    if (e.code === 'Escape'){
      if (document.body.classList.contains('immersive')){
        document.body.classList.remove('immersive');
        applyImmersiveBackground();
      }
      return;
    }
    if (e.code === 'Space'){
      e.preventDefault();
      togglePlay();
    } else if (e.code === 'ArrowRight'){
      if (e.shiftKey && currentIndex !== -1) loadTrack(nextTrackIndex(), true);
      else media().currentTime = Math.min(media().duration||0, media().currentTime + 5);
    } else if (e.code === 'ArrowLeft'){
      if (e.shiftKey && currentIndex !== -1) loadTrack(prevTrackIndex(), true);
      else media().currentTime = Math.max(0, media().currentTime - 5);
    }
  });


  // ---------- Frame stepping + video fit/zoom ----------
  let frameDur = 1/30;           // refined from presented frames while playing
  (function trackFrameDur(){
    if (!videoEl.requestVideoFrameCallback) return;
    let lastMT = null, lastW = null;
    const cb = (now, meta) => {
      if (lastMT !== null && meta.mediaTime > lastMT){
        const d = (meta.mediaTime - lastMT) / Math.max(1, (meta.presentedFrames - (cb.pf || 0)) || 1);
        if (d > 1/240 && d < 1/5 && videoEl.playbackRate > 0) frameDur = frameDur * 0.8 + d * 0.2;
      }
      cb.pf = meta.presentedFrames; lastMT = meta.mediaTime;
      videoEl.requestVideoFrameCallback(cb);
    };
    videoEl.requestVideoFrameCallback(cb);
  })();
  function stepFrame(dir){
    const m = media();
    if (!m || !isFinite(m.duration)) return;
    if (!m.paused) m.pause();
    const nfps = (m === videoEl && window.PPNative && PPNative.videoFps) ? PPNative.videoFps() : 0;   // native video: the stream's real rate
    const fd = (m === videoEl) ? (nfps > 0 ? 1 / nfps : frameDur) : 1/30;
    m.currentTime = Math.min(m.duration, Math.max(0, m.currentTime + dir * fd));
  }
  // The first three are the classic fit modes; entries with a third value force an aspect ratio. The Fit pill and the A key cycle through all of them.
  const VIEW_FITS = [['contain','Fit'],['cover','Fill (crop)'],['fill','Stretch'],
    ['ratio','16:9',16/9],['ratio','4:3',4/3],['ratio','3:2',3/2],['ratio','16:10',16/10],['ratio','5:4',5/4],['ratio','1:1',1],
    ['ratio','21:9',21/9],['ratio','2.39:1',2.39],['ratio','4:5',4/5],['ratio','9:16',9/16]];
  const VIEW_ZOOMS = [1, 1.25, 1.5, 2, 3];
  let viewFitIdx = 0, viewZoomIdx = 0;
  try {
    viewFitIdx = Math.max(0, Math.min(VIEW_FITS.length-1, parseInt(localStorage.getItem('playerViewFit'),10) || 0));
    viewZoomIdx = Math.max(0, Math.min(VIEW_ZOOMS.length-1, parseInt(localStorage.getItem('playerViewZoom'),10) || 0));
  } catch(e){}
  let viewPanX = 0, viewPanY = 0;
  function viewIsZoomed(){ return VIEW_ZOOMS[viewZoomIdx] > 1; }
  // Pan is written straight to the elements' inline transform (not via CSS
  // variables on the wrapper, which would restyle the whole subtree on every
  // move) and coalesced to one write per animation frame. The wrapper size is
  // cached so dragging never forces a layout.
  const viewTargets = [videoEl, document.getElementById('video-delay-canvas'), document.getElementById('memc-canvas')];
  let viewW = 0, viewH = 0, viewRaf = 0;
  function refreshViewSize(){ const r = videoWrap.getBoundingClientRect(); viewW = r.width; viewH = r.height; }
  function clampViewPan(){
    const z = VIEW_ZOOMS[viewZoomIdx];
    if (!viewW) refreshViewSize();
    const mx = Math.max(0, (z - 1) * viewW / 2), my = Math.max(0, (z - 1) * viewH / 2);
    viewPanX = Math.max(-mx, Math.min(mx, viewPanX));
    viewPanY = Math.max(-my, Math.min(my, viewPanY));
  }
  // A forced aspect ratio is the element drawn stretched over its whole box (object-fit: fill), then scaled down on one axis so the
  // picture has that shape and sits centred in the box. Returns null when no ratio is forced.
  function viewRatioScale(){
    const A = VIEW_FITS[viewFitIdx][2];
    if (!A) return null;
    if (!viewW || !viewH) refreshViewSize();
    if (!viewW || !viewH) return null;
    return viewW / viewH > A ? { sx: viewH * A / viewW, sy: 1 } : { sx: 1, sy: viewW / A / viewH };
  }
  function writeViewTransform(){
    viewRaf = 0;
    const rs = viewRatioScale(), z = VIEW_ZOOMS[viewZoomIdx];
    const prev = window.__ppViewScale;
    window.__ppViewScale = rs;   // lets the subtitle placement know where the picture really is
    const t = (viewIsZoomed() || rs)
      ? 'translate3d(' + viewPanX + 'px,' + viewPanY + 'px,0) scale(' + (z * (rs ? rs.sx : 1)) + ',' + (z * (rs ? rs.sy : 1)) + ')'
      : '';
    viewTargets.forEach(el => { if (el) el.style.transform = t; });
    if ((prev && prev.sx) !== (rs && rs.sx) || (prev && prev.sy) !== (rs && rs.sy)) window.dispatchEvent(new Event('pp-viewscale'));
  }
  function panViewBy(dx, dy){
    if (!viewIsZoomed()) return false;
    viewPanX += dx; viewPanY += dy;
    clampViewPan();
    if (!viewRaf) viewRaf = requestAnimationFrame(writeViewTransform);
    return true;
  }
  // The box changes shape on rotation, fullscreen, resize, or when a video of another shape loads: redo the ratio scaling too.
  function refreshViewTransform(){
    refreshViewSize();
    if (viewIsZoomed()) clampViewPan();
    if (viewIsZoomed() || VIEW_FITS[viewFitIdx][2]) writeViewTransform();
  }
  window.addEventListener('resize', refreshViewTransform);
  document.addEventListener('fullscreenchange', refreshViewTransform);
  try { new ResizeObserver(refreshViewTransform).observe(videoWrap); } catch(e){}
  function applyViewMode(){
    refreshViewSize();
    if (!viewIsZoomed()){ viewPanX = 0; viewPanY = 0; }
    else clampViewPan();
    writeViewTransform();
    if (viewIsZoomed()) videoWrap.setAttribute('data-vzoomed',''); else videoWrap.removeAttribute('data-vzoomed');
    const isDefault = viewFitIdx === 0 && viewZoomIdx === 0;
    if (isDefault) videoWrap.removeAttribute('data-vfit'); else videoWrap.setAttribute('data-vfit', VIEW_FITS[viewFitIdx][0]);
    videoWrap.style.setProperty('--vfit', VIEW_FITS[viewFitIdx][2] ? 'fill' : VIEW_FITS[viewFitIdx][0]);   // a forced ratio draws stretched, then scales (see viewRatioScale)
    videoWrap.style.setProperty('--vzoom', VIEW_ZOOMS[viewZoomIdx]);
    const fl = document.getElementById('view-fit-label'), zl = document.getElementById('view-zoom-label');
    if (fl) fl.textContent = VIEW_FITS[viewFitIdx][2] ? 'Ratio ' + VIEW_FITS[viewFitIdx][1] : VIEW_FITS[viewFitIdx][1];
    if (zl) zl.textContent = VIEW_ZOOMS[viewZoomIdx] + 'x';
    const fs = document.getElementById('view-fit-select'), rb = document.getElementById('view-reset-btn');
    if (fs && fs.value !== String(viewFitIdx)) fs.value = String(viewFitIdx);
    if (rb){ rb.style.opacity = isDefault ? '.5' : '1'; rb.style.borderColor = isDefault ? '' : 'var(--accent)'; }   // lit up whenever the picture is not in normal view
    try { localStorage.setItem('playerViewFit', viewFitIdx); localStorage.setItem('playerViewZoom', viewZoomIdx); } catch(e){}
  }
  function cycleViewFit(){
    viewFitIdx = (viewFitIdx + 1) % VIEW_FITS.length; applyViewMode();   // Fit, Fill, Stretch, then each aspect ratio, then back to Fit
    if (typeof showToast === 'function') showToast(VIEW_FITS[viewFitIdx][2] ? 'Aspect ratio: ' + VIEW_FITS[viewFitIdx][1] : 'Video: ' + VIEW_FITS[viewFitIdx][1]);
  }
  function stepViewZoom(dir){
    const next = Math.max(0, Math.min(VIEW_ZOOMS.length - 1, viewZoomIdx + dir));
    const quiet = !!window.__ppQuietZoom;
    if (next === viewZoomIdx){
      if (!quiet && typeof showToast === 'function') showToast(dir > 0 ? 'Max zoom (' + VIEW_ZOOMS[viewZoomIdx] + 'x)' : 'Zoom: 1x');
      return;
    }
    viewZoomIdx = next; applyViewMode();
    if (!quiet && typeof showToast === 'function') showToast('Zoom: ' + VIEW_ZOOMS[viewZoomIdx] + 'x');
  }
  function resetViewMode(quiet){
    viewFitIdx = 0; viewZoomIdx = 0; viewPanX = 0; viewPanY = 0; applyViewMode();
    viewTargets.forEach(el => { try { if (el) el.style.transform = ''; } catch(e){} });   // belt and braces: nothing may keep an old crop or zoom
    if (quiet !== true && typeof showToast === 'function') showToast('Zoom & fit reset');
  }
  function cycleViewZoom(){
    viewZoomIdx = (viewZoomIdx + 1) % VIEW_ZOOMS.length; applyViewMode();
    if (typeof showToast === 'function') showToast('Zoom: ' + VIEW_ZOOMS[viewZoomIdx] + 'x');
  }
  // Manual controls: pick a fit straight from the list, Reset (also the R key) puts everything back to normal, and an optional
  // tick returns to normal view whenever a new video loads, so a Fill or ratio chosen for one video does not follow you to the next.
  (function wireViewControls(){
    const fs = document.getElementById('view-fit-select'), rb = document.getElementById('view-reset-btn'), ar = document.getElementById('view-autoreset');
    if (fs){
      fs.innerHTML = VIEW_FITS.map((f, i) => '<option value="' + i + '">' + (f[2] ? 'Ratio ' + f[1] : f[1]) + '</option>').join('');
      fs.value = String(viewFitIdx);
      fs.addEventListener('change', () => {
        viewFitIdx = Math.max(0, Math.min(VIEW_FITS.length - 1, parseInt(fs.value, 10) || 0)); applyViewMode();
        if (typeof showToast === 'function') showToast(VIEW_FITS[viewFitIdx][2] ? 'Aspect ratio: ' + VIEW_FITS[viewFitIdx][1] : 'Video: ' + VIEW_FITS[viewFitIdx][1]);
      });
    }
    if (rb) rb.addEventListener('click', () => resetViewMode());
    let auto = false; try { auto = localStorage.getItem('playerViewAutoReset') === '1'; } catch(e){}
    if (ar){
      ar.checked = auto;
      ar.addEventListener('change', () => { auto = ar.checked; try { localStorage.setItem('playerViewAutoReset', auto ? '1' : '0'); } catch(e){} if (auto && (viewFitIdx || viewZoomIdx)) resetViewMode(); });
    }
    try { videoEl.addEventListener('loadedmetadata', () => { if (auto && (viewFitIdx || viewZoomIdx)) resetViewMode(true); }); } catch(e){}
  })();
  applyViewMode();
  document.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT' || e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key === ',' ) { e.preventDefault(); stepFrame(-1); }
    else if (e.key === '.') { e.preventDefault(); stepFrame(1); }
    else if (e.key === 'a' || e.key === 'A') cycleViewFit();
    else if (e.key === 'z' || e.key === 'Z') cycleViewZoom();
    else if (e.key === 'r' || e.key === 'R') resetViewMode();
  });

  // ---------- File loading ----------
  addBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    addDropdown.classList.toggle('open');
    addBtn.classList.toggle('open');
  });
  document.addEventListener('click', () => {
    addDropdown.classList.remove('open');
    addBtn.classList.remove('open');
  });
  addDropdown.addEventListener('click', (e) => e.stopPropagation());
  addFilesBtn.addEventListener('click', () => {
    addDropdown.classList.remove('open');
    addBtn.classList.remove('open');
    if (!ppNativePick('files')) fileInput.click();
  });
  const addDeviceBtn = document.getElementById('add-device-btn');
  if (addDeviceBtn) addDeviceBtn.addEventListener('click', () => {
    addDropdown.classList.remove('open');
    addBtn.classList.remove('open');
    if (typeof ppScanDevice === 'function') ppScanDevice();
  });
  addFolderBtn.addEventListener('click', () => {
    addDropdown.classList.remove('open');
    addBtn.classList.remove('open');
    if (!ppNativePick('folder')) folderInput.click();
  });
  fileInput.addEventListener('change', (e) => {
    addFiles(Array.from(e.target.files));
    fileInput.value = '';
  });
  folderInput.addEventListener('change', (e) => {
    // Non-media files picked up from the folder (images, .DS_Store, etc.)
    // are silently skipped inside addFiles via detectKind().
    addFiles(Array.from(e.target.files));
    folderInput.value = '';
  });

  // ---------- Library search ----------
  let trackSearchQuery = '';
  trackSearchInput.addEventListener('input', () => {
    trackSearchQuery = trackSearchInput.value.trim().toLowerCase();
    renderPlaylist();
  });

  function detectKind(file){
    if (file.type.startsWith('video/')) return 'video';
    if (file.type.startsWith('audio/')) return 'audio';
    if (/\.(mp4|webm|mov|m4v|ogv)$/i.test(file.name)) return 'video';
    if (/\.(mp3|wav|ogg|m4a|flac|aac)$/i.test(file.name)) return 'audio';
    return null;
  }

  // Thumbnail generation opens its own <video> element to seek/draw a
  // frame, decoding the exact same blob a track uses to actually play.
  // Mobile devices (Android in particular) only have a handful of hardware
  // video-decode sessions available; running a second decode of the same
  // file at the same time the real player is trying to play it starves
  // both, and shows up as playback that never advances past frame 0. So:
  // thumbnails are generated one at a time, and never while a video is
  // actually playing - queued and only processed once nothing's mid-play.
  const thumbnailQueue = [];
  let thumbnailBusy = false;
  function isVideoActivelyPlaying(){
    return isPlaying && currentIndex !== -1 && tracks[currentIndex] && tracks[currentIndex].kind === 'video';
  }
  function processThumbnailQueue(){
    if (thumbnailBusy || thumbnailQueue.length === 0) return;
    if (isVideoActivelyPlaying()){
      setTimeout(processThumbnailQueue, 400);
      return;
    }
    thumbnailBusy = true;
    const { track, resolve } = thumbnailQueue.shift();
    generateVideoThumbnail(track).then(() => {
      thumbnailBusy = false;
      resolve();
      processThumbnailQueue();
    });
  }
  function queueVideoThumbnail(track){
    return new Promise((resolve) => {
      thumbnailQueue.push({ track, resolve });
      processThumbnailQueue();
    });
  }

  function generateVideoThumbnail(track){
    return new Promise((resolve) => {
      const v = document.createElement('video');
      v.preload = 'metadata';
      v.src = track.url;
      v.muted = true;
      v.playsInline = true;
      // Release the decoder session for real (src = '' can leave it allocated), once, and never hang:
      // a probe that never fires 'seeked' used to hold both a decoder and the queue forever.
      let finished = false;
      const guard = setTimeout(() => { if (!finished){ cleanup(); resolve(); } }, 8000);
      const cleanup = () => {
        if (finished) return;
        finished = true; clearTimeout(guard);
        try { v.removeAttribute('src'); v.load(); } catch(e){}
        v.remove();
      };
      v.addEventListener('loadedmetadata', () => {
        if (isFinite(v.duration)) track.duration = v.duration;
        track.width = v.videoWidth || null;
        track.height = v.videoHeight || null;
        v.currentTime = Math.min(1, (v.duration || 2) / 2);
      });
      v.addEventListener('seeked', () => {
        try {
          const c = document.createElement('canvas');
          c.width = 160;
          c.height = 160 * (v.videoHeight / v.videoWidth || 1);
          const cctx = c.getContext('2d');
          cctx.drawImage(v, 0, 0, c.width, c.height);
          c.toBlob((blob) => {
            if (blob){
              track.artUrl = URL.createObjectURL(blob);
              track._artBlob = blob; // staged for IndexedDB write in addFiles
            }
            cleanup();
            resolve();
          }, 'image/jpeg', 0.75);
          return;
        } catch(e) { /* tainted canvas or decode issue, skip thumbnail */ }
        cleanup();
        resolve();
      });
      v.addEventListener('error', () => { cleanup(); resolve(); });
    });
  }

  // Lightweight metadata probe for audio files (no thumbnail needed) so
  // duration is available for the playlist list before the track is played.
  function probeAudioDuration(track){
    return new Promise((resolve) => {
      const a = document.createElement('audio');
      a.preload = 'metadata';
      a.src = track.url;
      const cleanup = () => { a.src = ''; a.remove(); };
      a.addEventListener('loadedmetadata', () => {
        if (isFinite(a.duration)) track.duration = a.duration;
        cleanup();
        resolve();
      });
      a.addEventListener('error', () => { cleanup(); resolve(); });
    });
  }

  // ---------- Sidecar subtitles: movie.mp4 + movie.srt picked together ----------
  function subtitleKeys(file){
    const dir = (file.webkitRelativePath || '').replace(/[^/]*$/, '').toLowerCase();
    const base = file.name.replace(/\.[^.]+$/, '').toLowerCase();
    // movie.en.srt / movie.pt-BR.srt / movie.en.forced.srt -> movie
    const bare = base.replace(/\.(?:[a-z]{2,3}|[a-z]{2}-[a-z]{2,4})(?:\.(?:forced|sdh|cc|hi))?$/, '');
    return { exact: dir + base, bare: dir + bare };
  }
  function commitSubtitles(track, cues, name){
    const ok = writeSubtitleEntry(track.dbId, { cues, on:true, offset:0, name });
    if (currentIndex !== -1 && tracks[currentIndex] === track) setSubtitleCues(cues, { on:true, offset:0, name });
    return ok;
  }
  async function attachSidecarSubtitles(subFiles, videoPairs, addedCount){
    if (!subFiles.length) return;
    // Only a subtitle file was picked: it belongs to the video that is open.
    if (!videoPairs.length && addedCount === 0 && subFiles.length === 1){
      const t = currentIndex !== -1 ? tracks[currentIndex] : null;
      if (!t || t.kind !== 'video'){ showToast('Open a video first, then pick its subtitle file.', 'error'); return; }
      const cues = await readSubtitleFile(subFiles[0]);
      if (!cues.length){ showToast('No subtitle lines found in \u201c' + subFiles[0].name + '\u201d.', 'error'); return; }
      const ok = commitSubtitles(t, cues, subFiles[0].name);
      showToast('Loaded ' + cues.length + ' subtitle lines' + (ok ? '.' : ' (too large to keep after reload).'), ok ? '' : 'error');
      return;
    }
    if (!videoPairs.length) return;
    const byExact = new Map(), byBare = new Map();
    subFiles.forEach(f => {
      const k = subtitleKeys(f);
      if (!byExact.has(k.exact)) byExact.set(k.exact, f);
      const prefer = /\.(?:en|eng)(?:\.|$)/i.test(f.name.replace(/\.[^.]+$/, '') + '.');
      if (!byBare.has(k.bare) || prefer) byBare.set(k.bare, f);
    });
    let attached = 0;
    for (const { track, file } of videoPairs){
      const key = subtitleKeys(file).exact;
      const sub = byExact.get(key) || byBare.get(key);
      if (!sub) continue;
      const cues = await readSubtitleFile(sub);
      if (!cues.length) continue;
      commitSubtitles(track, cues, sub.name);
      attached++;
    }
    if (attached) showToast('Attached subtitles to ' + attached + ' video' + (attached === 1 ? '' : 's') + '.');
  }

  function addFiles(fileList, stemInfo){
    const startIdx = tracks.length;
    const newTracks = [];
    const subFiles = fileList.filter(f => SUBTITLE_EXT_RE.test(f.name));
    const videoPairs = [];
    // If you're looking at a specific playlist (not "All tracks") when you
    // add files, they should land in that playlist too, not just the
    // overall library - otherwise a track you just dropped in while viewing
    // a playlist mysteriously doesn't show up in it.
    // Split tracks never follow the viewed playlist; they only go to their own per-song playlist (if enabled).
    const targetPlaylistId = stemInfo ? (stemInfo.playlistId || null) : userPlaylistViewId();
    fileList.forEach((file) => {
      const kind = detectKind(file);
      if (!kind) return;
      const url = URL.createObjectURL(file);
      const dbId = 'm_' + Date.now() + '_' + Math.random().toString(36).slice(2, 9);
      const track = {
        dbId,
        url,
        kind,
        ext: (file.name.match(/\.([a-z0-9]+)$/i) || [,'mp4'])[1].toLowerCase(),
        title: file.name.replace(/\.[^/.]+$/, ''),
        artist: kind === 'video' ? 'Video' : 'Unknown artist',
        duration: null,
        artUrl: null,
        artDbId: null,
        size: file.size,
        width: null,
        height: null,
        fileName: file.name,
        playlistIds: targetPlaylistId ? [targetPlaylistId] : []
      };
      if (stemInfo){ track.stem = true; track.stemOf = stemInfo.srcId || null; track.stemSrc = stemInfo.srcTitle || null; }
      tracks.push(track);
      newTracks.push(track);
      ppSidecarLrc(track, file, fileList);
      if (kind === 'video') videoPairs.push({ track, file });
      const idx = tracks.length - 1;

      // Persist the raw bytes right away so the track survives a reload
      // even before tags/thumbnail finish resolving. Failures (quota, etc)
      // are surfaced instead of swallowed, since a track that plays this
      // session but never saved would otherwise vanish silently on reload.
      persistTrackBytes(dbId, file, track.title);

      if (kind === 'audio'){
        jsmediatagsReady.then((jsmediatags) => {
          if (!jsmediatags) return;
          try {
            jsmediatags.read(file, {
              onSuccess: (tag) => {
                const tags = tag.tags;
                if (tags.title) track.title = tags.title;
                if (tags.artist) track.artist = tags.artist;
                ppOnEmbeddedLyrics(track, tags.lyrics);
                if (tags.picture){
                  const { data, format } = tags.picture;
                  const bytes = new Uint8Array(data);
                  const blob = new Blob([bytes], { type: format || 'image/jpeg' });
                  track.artUrl = URL.createObjectURL(blob);
                  track.artDbId = dbId + '_art';
                  persistTrackBytes(track.artDbId, blob, track.title + ' artwork');
                  if (idx === currentIndex){
                    artImg.src = track.artUrl;
                    artImg.style.display = 'block';
                    artFallback.style.display = 'none';
                  }
                }
                saveLibraryMeta();
                renderPlaylist();
              },
              onError: (error) => {
                // Keep the filename-derived title/artist; log so it's
                // possible to tell "no tags" apart from "reader choked"
                // when debugging a specific file.
                console.warn('jsmediatags: could not read tags for', file.name, error);
              }
            });
          } catch (error){
            console.warn('jsmediatags: threw while reading', file.name, error);
          }
        });
      }

      if (kind === 'audio'){
        probeAudioDuration(track).then(() => {
          saveLibraryMeta();
          renderPlaylist();
        });
      }

      if (kind === 'video'){
        queueVideoThumbnail(track).then(() => {
          if (track._artBlob){
            track.artDbId = dbId + '_art';
            persistTrackBytes(track.artDbId, track._artBlob, track.title + ' thumbnail');
            delete track._artBlob;
          }
          saveLibraryMeta();
          renderPlaylist();
        });
      }
    });
    saveLibraryMeta();
    renderPlaylist();
    renderPlaylistViewSelect();
    if (currentIndex === -1 && tracks.length > 0){
      loadTrack(startIdx, false);
    }
    attachSidecarSubtitles(subFiles, videoPairs, newTracks.length);
    refreshStorageEstimate();
  }

