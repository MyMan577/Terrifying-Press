  // ---------- Clip file naming ----------
  const cutterNameStyle = document.getElementById('cutter-name-style');
  const cutterNameInput = document.getElementById('cutter-name-input');
  const cutterNamePreview = document.getElementById('cutter-name-preview');
  const CUTTER_NAME_KEY = 'playerCutterNameStyle';
  try {
    const v = localStorage.getItem(CUTTER_NAME_KEY);
    if (v && [...cutterNameStyle.options].some(o => o.value === v)) cutterNameStyle.value = v;
  } catch (e){}
  function cutterTimeTag(sec){
    sec = Math.max(0, Math.round(sec));
    return Math.floor(sec / 60) + 'm' + String(sec % 60).padStart(2, '0') + 's';
  }
  // The name (without extension) the clip will be saved under.
  function cutterFileBase(track, start, end){
    const title = track.title || 'clip';
    const hasArtist = track.artist && track.artist !== 'Unknown artist' && track.artist !== 'Video';
    let base;
    switch (cutterNameStyle.value){
      case 'artist_title': base = (hasArtist ? track.artist + ' - ' : '') + title + '_cut'; break;
      case 'title_time':   base = title + ' [' + cutterTimeTag(start) + '-' + cutterTimeTag(end) + ']'; break;
      case 'custom': {
        base = cutterNameInput.value.replace(/\.(mp3|wav|mp4|webm|mkv|mov|m4v|ogg)$/i, '').trim();
        if (!base) base = title + '_cut';
        break;
      }
      default: base = title + '_cut';
    }
    return safeFilename(base);
  }
  function cutterFormatExt(){
    if (cutterFormat === 'fast' || cutterFormat === 'encode') return 'mp4';
    if (cutterFormat === 'video') return (CUTTER_VIDEO_REC && CUTTER_VIDEO_REC.ext) || 'webm';
    return cutterFormat === 'mp3' ? 'mp3' : 'wav';
  }
  function updateCutterNamePreview(){
    cutterNameInput.classList.toggle('show', cutterNameStyle.value === 'custom');
    if (!cutterState) return;
    const track = tracks[cutterState.trackIndex];
    if (!track) return;
    cutterNamePreview.textContent = 'Saves as: ' + cutterFileBase(track, cutterState.start, cutterState.end) + '.' + cutterFormatExt();
  }
  cutterNameStyle.addEventListener('change', () => {
    try { localStorage.setItem(CUTTER_NAME_KEY, cutterNameStyle.value); } catch (e){}
    if (cutterNameStyle.value === 'custom' && !cutterNameInput.value && cutterState){
      const tr = tracks[cutterState.trackIndex];
      if (tr) cutterNameInput.value = (tr.title || 'clip') + '_cut';
    }
    updateCutterNamePreview();
  });
  cutterNameInput.addEventListener('input', updateCutterNamePreview);
  // The range and format change while the modal is open, so keep the preview current.
  setInterval(() => { if (cutterModalOverlay.classList.contains('open')) updateCutterNamePreview(); }, 400);

  cutterExportBtn.addEventListener('click', async () => {
    if (!cutterState || cutterExporting) return;
    const track = tracks[cutterState.trackIndex];
    if (!track) return;
    stopCutterPreview();
    const wasPlaying = !media().paused;
    media().pause();

    cutterExporting = true;
    cutterExportUiState(true);
    cutterExportBtn.disabled = true;
    cutterExportBtn.textContent = 'Exporting…';
    cutterErrorEl.classList.remove('active');
    setCutterProgress(0, cutterFormat === 'video' ? 'Preparing…' : (cutterFormat === 'fast' ? 'Copying clip…' : 'Encoding…'));
    const stopKeepAlive = startExportKeepAlive();

    try {
      const { start, end } = cutterState;
      const fxSnap = cutterFxSnapshot();
      if (fxSnap && cutterFormat === 'fast') throw new Error('Fast copy cannot apply effects. Choose Real-time or turn effects off.');
      let blob, ext;
      if (cutterFormat === 'fast'){
        setCutterProgress(0.3, 'Copying clip…');
        try {
          const src = await getCutterSource(track);
          const res = await MP4T.trim(src.blob, start, end);
          blob = res.blob;
        } catch (err){
          throw new Error((err && err.message ? err.message : 'Fast copy failed.') + ' Try the Real-time option instead.');
        }
        ext = 'mp4';
      } else if (cutterFormat === 'encode'){
        try {
          try {
            blob = await exportVideoClipFast(track, start, end, (p, label) => setCutterProgress(p, label), fxSnap);
          } catch (e1){
            if (!(e1 && e1.reorder)) throw e1;
            blob = await exportVideoClipFast(track, start, end, (p, label) => setCutterProgress(p, label), fxSnap, { noLowLatency: true });
          }
          ext = 'mp4';
        } catch (err){
          if ((err && err.cancelled) || !CUTTER_VIDEO_REC) throw err;
          console.warn('Fast re-encode failed, recording in real time instead:', err);
          setCutterProgress(0, 'Fast encode unavailable, recording in real time…');
          blob = await exportVideoClip(track, start, end, (p, label) => setCutterProgress(p, label), fxSnap);
          ext = CUTTER_VIDEO_REC.ext;
        }
      } else if (cutterFormat === 'video'){
        blob = await exportVideoClip(track, start, end, (p, label) => setCutterProgress(p, label), fxSnap);
        ext = CUTTER_VIDEO_REC.ext;
      } else if (cutterFormat === 'mp3'){
        const kbps = parseInt(cutterMp3Quality.value, 10) || 192;
        blob = await exportMp3Clip(track, start, end, kbps, (p, label) => setCutterProgress(p, label), fxSnap);
        ext = 'mp3';
      } else if (cutterFormat === 'wav'){
        blob = await exportAudioClip(track, start, end, fxSnap, (p, label) => setCutterProgress(p, label));
        ext = 'wav';
      } else {
        throw new Error('Unknown export format.');
      }
      setCutterProgress(1, 'Done');
      const savedName = `${cutterFileBase(track, start, end)}.${ext}`;
      downloadBlob(blob, savedName);
      showExportBanner('Clip exported', savedName);
    } catch (err){
      const failMsg = err && err.message ? err.message : 'unknown error';
      setCutterError('Export failed: ' + failMsg);
      // A cancel is the person's own doing, so it doesn't get a failure banner.
      if (!(err && (err.cancelled || failMsg === 'Export cancelled.'))) showExportBanner('Export failed', failMsg, 'err');
    } finally {
      stopKeepAlive();
      cutterExporting = false;
      cutterExportUiState(false);
      cutterExportBtn.disabled = false;
      cutterExportBtn.textContent = 'Export clip';
      cutterProgressWrap.classList.remove('active');
      if (wasPlaying) media().play().catch(()=>{});
    }
  });

  function restoreSettings(){
    const s = loadSettings();

    if (typeof s.detailedPlaylistMode === 'boolean'){
      detailedPlaylistMode = s.detailedPlaylistMode;
    }
    applyDetailedModeUI();

    if (typeof s.keepMp3Conversions === 'boolean'){
      keepMp3Conversions = s.keepMp3Conversions;
    }
    keepMp3ConversionsToggle.checked = keepMp3Conversions;

    if (typeof s.rememberPlaybackPosition === 'boolean'){
      rememberPlaybackPosition = s.rememberPlaybackPosition;
    }
    rememberPositionToggle.checked = rememberPlaybackPosition;

    if (typeof s.playbackPositionSaveIntervalMs === 'number' && s.playbackPositionSaveIntervalMs > 0){
      playbackPositionSaveIntervalMs = s.playbackPositionSaveIntervalMs;
    }
    playbackPositionIntervalInput.value = Math.round(playbackPositionSaveIntervalMs / 1000);
    updatePlaybackPositionIntervalVisibility();

    // Restore whichever playlist (or "All tracks") was last selected, but
    // only when detailed playlist mode is on - applyDetailedModeUI() above
    // already forces '__all__' otherwise, and that's the correct behavior
    // since the playlist selector is hidden outside detailed mode.
    if (detailedPlaylistMode && typeof s.activePlaylistView === 'string'){
      activePlaylistView = s.activePlaylistView;
    }

    if (typeof s.shuffleOn === 'boolean'){
      shuffleOn = s.shuffleOn;
      shuffleBtn.classList.toggle('toggled', shuffleOn);
      if (shuffleOn) buildShuffleOrder();
    }

    if (typeof s.repeatMode === 'number' && s.repeatMode >= 0 && s.repeatMode <= 2){
      repeatMode = s.repeatMode;
      repeatBtn.classList.toggle('toggled', repeatMode !== 0);
      repeatBtn.classList.toggle('repeat-one', repeatMode === 2);
      repeatBtn.title = repeatMode === 0 ? 'Repeat' : repeatMode === 1 ? 'Repeat all' : 'Repeat one';
      syncAudioLoop();
    }

    if (typeof s.playbackSpeed === 'number' && s.playbackSpeed >= SPEED_MIN && s.playbackSpeed <= SPEED_MAX){
      playbackSpeed = s.playbackSpeed;
      applySpeed();
    } else if (typeof s.speedIdx === 'number'){
      // Migrate from the old fixed-preset setting.
      const legacySpeeds = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];
      if (s.speedIdx >= 0 && s.speedIdx < legacySpeeds.length){
        playbackSpeed = legacySpeeds[s.speedIdx];
        applySpeed();
      }
    }

    if (s.volume != null){
      const v = Math.min(100, Math.max(0, parseFloat(s.volume)));
      if (!isNaN(v)){
        volume.value = v;
        const vol = v / 100;
        audioEl.volume = vol;
        videoEl.volume = vol;
        updateVolIcon();
      }
    }

    if (s.subtitleSize === 's' || s.subtitleSize === 'm' || s.subtitleSize === 'l'){
      subtitleSize = s.subtitleSize;
      subtitleOverlay.classList.remove('size-s','size-l');
      if (subtitleSize === 's') subtitleOverlay.classList.add('size-s');
      if (subtitleSize === 'l') subtitleOverlay.classList.add('size-l');
      subtitleSizeRow.querySelectorAll('button').forEach(b => {
        b.classList.toggle('active', b.dataset.size === subtitleSize);
      });
    }

    if (s.subtitlePos === 'top' || s.subtitlePos === 'bottom' || s.subtitlePos === 'custom'){
      subtitlePos = s.subtitlePos;
      if (isFinite(+s.subtitleX) && isFinite(+s.subtitleY)){
        subtitleX = Math.max(-1, Math.min(2, +s.subtitleX));
        subtitleY = Math.max(-1, Math.min(2, +s.subtitleY));
      } else if (subtitlePos === 'custom') subtitlePos = 'bottom';
      applySubtitlePos();
    }

    if (typeof s.subtitleColor === 'string' && /^#[0-9a-fA-F]{6}$/.test(s.subtitleColor)){
      applySubtitleColor(s.subtitleColor);
    } else {
      applySubtitleColor(subtitleColor);
    }

    if (typeof s.subtitleFont === 'string' && SUBTITLE_FONTS[s.subtitleFont]){
      applySubtitleFont(s.subtitleFont);
    } else {
      applySubtitleFont(subtitleFont);
    }
    if (s.subtitleStyle && typeof s.subtitleStyle === 'object'){
      const lim = { scale:[50,250], outline:[0,8], shadow:[0,10], bg:[0,100], lh:[100,200], bold:[0,1], sdh:[0,1] };
      Object.keys(lim).forEach(k => { const v = +s.subtitleStyle[k]; if (isFinite(v)) subtitleStyle[k] = Math.max(lim[k][0], Math.min(lim[k][1], v)); });
    }
    if (s.subtitleTrMode === 'orig' || s.subtitleTrMode === 'both' || s.subtitleTrMode === 'tr') subtitleTrMode = s.subtitleTrMode;
    applySubtitleStyle();

    const FILTER_IDS = new Set([...Object.keys(VIDEO_FILTERS), 'posterize', 'duotone']);
    if (typeof s.activeFilter === 'string' && FILTER_IDS.has(s.activeFilter)){
      activeFilter = s.activeFilter;
      filterGrid.querySelectorAll('button').forEach(b => {
        b.classList.toggle('active', b.dataset.filter === activeFilter);
      });
      refreshFilterExtrasUI();
    }
    if (typeof s.duotoneDark === 'string'){
      duotoneDark = s.duotoneDark;
      if (duotoneDarkInput) duotoneDarkInput.value = duotoneDark;
    }
    if (typeof s.duotoneLight === 'string'){
      duotoneLight = s.duotoneLight;
      if (duotoneLightInput) duotoneLightInput.value = duotoneLight;
    }
    if (typeof s.filterStrength === 'number' && s.filterStrength >= 0 && s.filterStrength <= 100){
      filterStrength = s.filterStrength;
      filterIntensity.value = filterStrength;
    }
    if (typeof s.sharpenAmount === 'number' && s.sharpenAmount >= 0 && s.sharpenAmount <= 100){
      sharpenAmount = s.sharpenAmount;
      sharpenIntensity.value = sharpenAmount;
      updateSharpenMatrix();
    }
    if (typeof s.clarityAmount === 'number' && s.clarityAmount >= 0 && s.clarityAmount <= 100){
      clarityAmount = s.clarityAmount;
      clarityIntensity.value = clarityAmount;
      updateClarityBoost();
    }
    filterBtn.classList.toggle('toggled', activeFilter !== 'none' || sharpenAmount > 0 || clarityAmount > 0 || !!s.autoLevelsOn);
    applyVideoFilter();
    if (typeof s.autoLevelsOn === 'boolean'){
      setAutoLevels(s.autoLevelsOn);
    }

    if (typeof s.vizSensitivity === 'number' && s.vizSensitivity >= 0.25 && s.vizSensitivity <= 2.5){
      globalVizSensitivity = s.vizSensitivity;
      vizSensitivity = globalVizSensitivity;
    }
    refreshVizSensUI();

    if (typeof s.subtitleLatencyMs === 'number' && s.subtitleLatencyMs >= -2000 && s.subtitleLatencyMs <= 2000){
      subtitleLatencyMs = s.subtitleLatencyMs;
      latencySlider.value = subtitleLatencyMs;
      updateLatencyDisplay();
      refreshVideoDelayState();
    }
    if (typeof s.latencyPresetMs === 'number' && s.latencyPresetMs >= -2000 && s.latencyPresetMs <= 2000){
      latencyPresetMs = s.latencyPresetMs;
      latencyPresetInput.value = latencyPresetMs;
    }
    refreshLatencyPresetBtn();

    if (Array.isArray(s.eqGains) && (s.eqGains = window.__ppEqNorm(s.eqGains)).length === EQ_BANDS.length && s.eqGains.every(v => typeof v === 'number')){
      globalEqGains = s.eqGains.slice();
      eqGains = globalEqGains.slice();
    }
    refreshEqSlidersUI();
    updateEqPresetHighlight();
    globalEqEnabled = !!s.eqEnabled;
    setEqEnabled(globalEqEnabled);
    refreshEqOverrideUI();

    if (typeof s.masterBoost === 'number' && s.masterBoost >= 1 && s.masterBoost <= 6){
      masterBoost = s.masterBoost;
    }
    applyMasterBoostAll();
    refreshBoostUI();

    if (typeof s.bassBoost === 'number' && s.bassBoost >= 0 && s.bassBoost <= 1){
      bassBoost = s.bassBoost;
    }
    if (typeof s.reverbMix === 'number' && s.reverbMix >= 0 && s.reverbMix <= 1){
      reverbMix = s.reverbMix;
    }
    if (typeof s.filterAmount === 'number' && s.filterAmount >= -1 && s.filterAmount <= 1){
      filterAmount = s.filterAmount;
    }
    if (typeof s.distortionAmount === 'number' && s.distortionAmount >= 0 && s.distortionAmount <= 1){
      distortionAmount = s.distortionAmount;
    }
    if (typeof s.bitcrushAmount === 'number' && s.bitcrushAmount >= 0 && s.bitcrushAmount <= 1){
      bitcrushAmount = s.bitcrushAmount;
    }
    if (typeof s.echoMix === 'number' && s.echoMix >= 0 && s.echoMix <= 1){
      echoMix = s.echoMix;
    }
    if (typeof s.tremoloAmount === 'number' && s.tremoloAmount >= 0 && s.tremoloAmount <= 1){
      tremoloAmount = s.tremoloAmount;
    }
    applyFxAll();
    refreshFxUI();
  }

  updateSeekFill();
  playlists = loadPlaylists();
  restoreSettings();
  const libP = restoreLibrary();
  libP.then(refreshStorageEstimate);
  window.__ppLibReady = libP.then(() => {}, () => {});

  // ================= Android native engine glue =================
  function ppNativePick(kind){
    if (!(window.PPNative && PPNative.enabled && PPNative.lib)) return false;
    const done = (r) => {
      if (!r || r.cancelled) return;
      if (r.entries) ppAddNative(r.entries, 'pick');
      if (r.tree) ppRememberFolder(r.tree);
    };
    (kind === 'folder' ? PPNative.lib.pickFolder() : PPNative.lib.pickFiles())
      .then(done).catch(e => showToast('Could not add: ' + ((e && e.message) || e), 'error'));
    if (kind === 'folder') showToast('Scanning folder…');
    return true;
  }
  // "Scan phone": asks for media access if needed, then adds every song and video the phone's media library knows about.
  async function ppScanDevice(){
    if (!(window.PPNative && PPNative.enabled && PPNative.lib && PPNative.lib.scanDevice)) return;
    try {
      let a = await PPNative.lib.mediaAccess();
      if (!a.audio && !a.video) a = await PPNative.lib.requestMediaAccess();
      if (!a.audio && !a.video){
        showToast('Media access is off. Allow it in Android Settings under Apps, Press Play, Permissions, or add files with Files or Folder.', 'error');
        return;
      }
      if (ppAutoScanP) await ppAutoScanP;   // a background look is running: let it finish so its finds do not land in the library
      showToast('Scanning this phone…');
      const r = await PPNative.lib.scanDevice(tracks.map(t => t.nativeUri).filter(Boolean), true);
      const n = (r && r.total) || 0;
      ppFoundPrune();
      showToast(n ? ('Added ' + n + ' new file' + (n === 1 ? '' : 's')) : 'No new music or videos found');
    } catch(e){ showToast('Could not scan: ' + ((e && e.message) || e), 'error'); }
  }
  const PP_FOLDERS_KEY = 'ppNativeFolders';
  function ppRememberFolder(tree){
    try {
      const l = JSON.parse(localStorage.getItem(PP_FOLDERS_KEY) || '[]');
      if (l.indexOf(tree) < 0){ l.push(tree); localStorage.setItem(PP_FOLDERS_KEY, JSON.stringify(l)); }
    } catch(e){}
  }
  async function ppAddNative(entries, src){
    if (!entries || !entries.length) return;
    if (src === 'scan' && ppInboxScans > 0){ ppFoundAdd(entries); return; }   // found by a background look: wait in the inbox
    const startIdx = tracks.length;
    const targetPlaylistId = src === 'inbox' ? null : userPlaylistViewId();
    const known = new Set(tracks.map(t => t.nativeUri).filter(Boolean));
    const fresh = [];
    for (const e of entries){
      if (!e || !e.uri || known.has(e.uri)) continue;
      known.add(e.uri);
      const kind = e.kind === 'video' ? 'video' : 'audio';
      const track = {
        dbId: 'n_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8),
        url: (window.Capacitor && Capacitor.convertFileSrc) ? Capacitor.convertFileSrc(e.uri) : '',
        nativeUri: e.uri, nativeArt: e.artPath || null, kind,
        ext: e.ext || (kind === 'video' ? 'mp4' : 'mp3'),
        title: e.title || (e.name || 'Untitled').replace(/\.[^/.]+$/, ''),
        artist: e.artist || (kind === 'video' ? 'Video' : 'Unknown artist'),
        album: e.album || '', duration: e.durationSec || null,
        genre: e.genre || '', trackNo: e.track || null, disc: e.disc || null, year: e.year || null, folder: e.folder || '', mdv: 1,
        artUrl: e.artPath ? PPNative.lib.fileSrc(e.artPath) : null, artDbId: null,
        size: e.size >= 0 ? e.size : null, width: e.width || null, height: e.height || null,
        fileName: e.name || null, playlistIds: targetPlaylistId ? [targetPlaylistId] : []
      };
      tracks.push(track);
      fresh.push({ track, e });
    }
    if (!fresh.length) return;
    saveLibraryMeta(); renderPlaylist(); renderPlaylistViewSelect();
    if (currentIndex === -1 && tracks.length > 0) loadTrack(startIdx, false);
    // lyrics / subtitle sidecars sitting next to the media
    const subFiles = [], videoPairs = [];
    for (const { track, e } of fresh){
      for (const sc of (e.sidecars || [])){
        try {
          const r = await PPNative.lib.readText(sc.uri);
          const f = new File([r.text || ''], sc.name, { type: 'text/plain' });
          if (/\.lrc$/i.test(sc.name)) ppSidecarLrc(track, new File([], e.name || ''), [f]);
          else subFiles.push(f);
        } catch(err){}
      }
      if (track.kind === 'video') videoPairs.push({ track, file: new File([], e.name || '') });
    }
    if (subFiles.length) attachSidecarSubtitles(subFiles, videoPairs, fresh.length);
  }
  // What should play after the current track? Mirrors onEnded() so native can advance on its own.
  let ppNextSig = '';
  function ppQueueNext(){
    let n = null;
    try {
      if (currentIndex !== -1 && repeatMode !== 2 && !(sleepTimer && sleepTimer.mode === 'track')){
        const isLast = shuffleOn ? shuffleOrder.indexOf(currentIndex) === shuffleOrder.length - 1 : currentIndex === tracks.length - 1;
        if (!(isLast && repeatMode === 0)){
          const ni = nextTrackIndex();
          if (ni >= 0 && ni !== currentIndex) n = tracks[ni];
        }
      }
    } catch(e){}
    PPNative.queueNext(n);
  }
  if (window.PPNative && PPNative.available){
    PPNative.hooks.getBlob = (t) => dbGet(t.dbId);
    PPNative.hooks.toast = (m, k) => showToast(m, k);
    PPNative.hooks.onMigrated = (t) => { saveLibraryMeta(); dbDelete(t.dbId).catch(()=>{}).then(refreshStorageEstimate); };
    PPNative.hooks.command = (c, ev) => {
      if (c === 'next') nextBtn.click();
      else if (c === 'prev') prevBtn.click();
      else if (c === 'play'){ if (!isPlaying) togglePlay(); }      // from the video notification (see ppMirrorSync)
      else if (c === 'pause'){ if (isPlaying) togglePlay(); }
      else if (c === 'seek'){ if (ev && ev.posMs != null && currentIndex !== -1){ try { media().currentTime = ev.posMs / 1000; } catch(e){} } }
      if (c === 'play' || c === 'pause' || c === 'seek') setTimeout(() => { try { ppMirrorSync(); } catch(e){} }, 700);   // confirm the real state back
    };
    PPNative.hooks.entries = (list, src) => ppAddNative(list, src);
    PPNative.hooks.syncTo = (uri) => {
      const i = tracks.findIndex(t => PPNative.sameUri(t.nativeUri || t.remoteUrl, uri));
      if (i >= 0 && i !== currentIndex){ PPNative.expectAdvance(uri); loadTrack(i, true); }
    };
    // Native moved on to an item the app would not have picked (e.g. a queue chosen in a car): follow it.
    PPNative.hooks.matchesNext = (uri) => {
      try { const t = tracks[nextTrackIndex()]; return !!t && PPNative.sameUri(t.nativeUri || t.remoteUrl, uri); } catch(e){ return true; }
    };
    // "Hey Google, play <name> on Press Play" / MEDIA_PLAY_FROM_SEARCH
    PPNative.hooks.voiceSearch = (q) => {
      q = String(q || '').toLowerCase().trim();
      if (!q){ if (currentIndex === -1 && tracks.length) loadTrack(0, true); else if (!isPlaying) playBtn.click(); return; }
      const toks = q.split(/\s+/); let best = -1, bestScore = 0;
      tracks.forEach((t, i) => {
        const hay = ((t.title || '') + ' ' + (t.artist || '') + ' ' + (t.album || '')).toLowerCase();
        let sc = 0; toks.forEach(k => { if (hay.indexOf(k) >= 0) sc++; });
        if (sc > bestScore){ bestScore = sc; best = i; }
      });
      if (best >= 0) loadTrack(best, true); else showToast('Nothing matching "' + q + '"');
    };
    // Mirror the library to Android (Auto, Assistant, Bluetooth car kits browse it without the UI)
    let ppCatSig = '', ppCatTimer = 0;
    const ppPushCatalog = () => PPNative.pushCatalog(
      tracks.filter(t => t.nativeUri || t.remoteUrl).map(t => ({
        id: String(t.dbId), uri: t.nativeUri || t.remoteUrl, kind: t.kind, title: t.title || '', artist: t.artist || '',
        album: t.album || '', durMs: t.duration > 0 ? Math.round(t.duration * 1000) : 0, art: t.nativeArt || '', pl: t.playlistIds || [], track: t.trackNo || 0
      })),
      playlists.map(p => ({ id: p.id, name: p.name })));
    const ppCatalogCheck = () => {
      const sig = [tracks.length, playlists.length, playlists.map(p => p.name).join('|'),
        tracks.reduce((a, t) => a + (t.title || '').length + (t.artist || '').length + (t.album || '').length + (t.trackNo || 0) + ((t.nativeUri || t.remoteUrl) ? 1 : 0) + (t.playlistIds || []).length, 0)].join('#');
      if (sig === ppCatSig) return;
      ppCatSig = sig; clearTimeout(ppCatTimer); ppCatTimer = setTimeout(ppPushCatalog, 1500);
    };
    window.ppMigrateLibrary = () => PPNative.migrateAll(tracks);   // run once from the console, or hook to a button
    PPNative.hooks.tick = () => {
      const sig = [currentIndex, shuffleOn, repeatMode, sleepTimer && sleepTimer.mode, tracks.length].join('|');
      if (sig !== ppNextSig){ ppNextSig = sig; syncAudioLoop(); ppQueueNext(); }
      ppCatalogCheck();
    };
    PPNative.setFxProvider(() => ({
      eqOn: !!eqEnabled,
      eq: Array.from({ length: 10 }, (_, i) => +eqGains[i] || 0),
      gain: (trackBoostOverrideActive ? trackBoost : masterBoost) * ((typeof rgFactor === 'function' && +rgFactor()) || 1),
      bass: bassBoost, reverb: reverbMix, filter: filterAmount, distortion: distortionAmount,
      bitcrush: bitcrushAmount, echo: echoMix, tremolo: tremoloAmount
    }));
    PPNative.hooks.mediaChanged = () => ppAutoScanSoon(6000);   // the phone's media library changed (a download, a transfer)
    libP.then(() => { PPNative.boot(); return ppAutoScan(); }).then(ppBackfillDetails, ppBackfillDetails);
    { const b = document.getElementById('add-device-btn'); if (b && PPNative.enabled) b.style.display = 'block'; }
  }
  loadCustomization();
  renderPlaylistsManager();
  requestPersistentStorage();
  refreshStorageEstimate();

  const storageExportBtn = document.getElementById('storage-export-btn');
  const storageImportBtn = document.getElementById('storage-import-btn');
  const libraryImportInput = document.getElementById('library-import-input');
  if (storageExportBtn) storageExportBtn.addEventListener('click', exportLibraryBackup);
  const backupSpeedSlider = document.getElementById('backup-speed-slider');
  const backupSpeedValue = document.getElementById('backup-speed-value');
  if (backupSpeedSlider){
    const labelFor = v => v >= 10 ? 'Max' : v >= 7 ? 'Fast' : v >= 4 ? 'Medium' : 'Gentle';
    const showSpeed = v => { backupSpeedValue.textContent = labelFor(v) + ' (' + v + '/10)'; };
    backupSpeedSlider.value = getBackupSpeed();
    showSpeed(getBackupSpeed());
    backupSpeedSlider.addEventListener('input', () => {
      const v = parseInt(backupSpeedSlider.value, 10);
      showSpeed(v);
      try { localStorage.setItem(BACKUP_SPEED_KEY, String(v)); } catch (e){}
    });
  }
  if (storageImportBtn && libraryImportInput){
    storageImportBtn.addEventListener('click', () => libraryImportInput.click());
    libraryImportInput.addEventListener('change', () => {
      const file = libraryImportInput.files && libraryImportInput.files[0];
      if (file) importLibraryBackup(file);
      libraryImportInput.value = '';
    });
  }

  const progressExportBtn = document.getElementById('progress-export-btn');
  const progressImportBtn = document.getElementById('progress-import-btn');
  const progressImportInput = document.getElementById('progress-import-input');
  if (progressExportBtn) progressExportBtn.addEventListener('click', exportProgressBackup);
  if (progressImportBtn && progressImportInput){
    progressImportBtn.addEventListener('click', () => progressImportInput.click());
    progressImportInput.addEventListener('change', () => {
      const file = progressImportInput.files && progressImportInput.files[0];
      if (file) importProgressBackup(file);
      progressImportInput.value = '';
    });
  }

  // Expose the bits of the customization system that the level-rewards
  // module (a separate IIFE further down the file) needs. That module
  // can't see uiCustomization/applyAllCustomization/etc. otherwise, since
  // they're declared inside this closure - without this, clicking an
  // unlocked background preset throws a silent ReferenceError and nothing
  // visually changes.
  window.PPXpCustomization = {
    uiCustomization,
    applyAllCustomization,
    saveCustomization,
    refreshCustomizeControls,
    getActiveTab: () => customizeActiveTab
  };

