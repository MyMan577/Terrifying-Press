  // ---------- Track tag editing ----------
  function closeTrackEditPopover(){
    trackEditPopover.classList.remove('open');
    trackEditPopover.innerHTML = '';
  }
  // Below the row it was opened from, or above it when the keyboard leaves no room below; always inside the part of the
  // screen that is not covered (the keyboard shrinks the page or the visual viewport, and both are followed).
  let trackEditAnchor = null;
  function placeTrackEditPopover(){
    if (!trackEditPopover.classList.contains('open') || !trackEditAnchor) return;
    const vv = window.visualViewport, top0 = vv ? vv.offsetTop : 0, H = vv ? Math.min(vv.height, window.innerHeight) : window.innerHeight;
    const rect = trackEditAnchor.getBoundingClientRect(), h = trackEditPopover.offsetHeight || 170;
    let top = rect.bottom + 4;
    if (top + h > top0 + H - 8) top = rect.top - h - 4;
    top = Math.max(top0 + 8, Math.min(top, top0 + H - h - 8));
    trackEditPopover.style.left = Math.max(8, Math.min(rect.left, window.innerWidth - 232)) + 'px';
    trackEditPopover.style.top = top + 'px';
  }
  window.addEventListener('resize', placeTrackEditPopover);
  if (window.visualViewport){ visualViewport.addEventListener('resize', placeTrackEditPopover); visualViewport.addEventListener('scroll', placeTrackEditPopover); }
  function openTrackEditPopover(anchorEl, idx){
    const t = tracks[idx];
    if (!t) return;
    trackEditPopover.innerHTML = `
      <div class="track-edit-field">
        <label>Title</label>
        <input type="text" id="track-edit-title" maxlength="200">
      </div>
      <div class="track-edit-field">
        <label>Artist</label>
        <input type="text" id="track-edit-artist" maxlength="200">
      </div>
      <div class="track-edit-actions">
        <button type="button" id="track-edit-cancel">Cancel</button>
        <button type="button" id="track-edit-save">Save</button>
      </div>
    `;
    const titleInput = trackEditPopover.querySelector('#track-edit-title');
    const artistInput = trackEditPopover.querySelector('#track-edit-artist');
    titleInput.value = t.title;
    artistInput.value = t.artist;

    trackEditAnchor = anchorEl;
    trackEditPopover.classList.add('open');
    placeTrackEditPopover();
    setTimeout(placeTrackEditPopover, 250); setTimeout(placeTrackEditPopover, 600);   // again once the keyboard is up
    titleInput.focus();
    titleInput.select();

    trackEditPopover.querySelector('#track-edit-cancel').addEventListener('click', closeTrackEditPopover);
    trackEditPopover.querySelector('#track-edit-save').addEventListener('click', () => saveTrackEdit(idx));
    [titleInput, artistInput].forEach(inp => {
      inp.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') saveTrackEdit(idx);
        if (e.key === 'Escape') closeTrackEditPopover();
      });
    });
  }
  function saveTrackEdit(idx){
    const t = tracks[idx];
    if (!t || !trackEditPopover.classList.contains('open')) return closeTrackEditPopover();
    const titleInput = trackEditPopover.querySelector('#track-edit-title');
    const artistInput = trackEditPopover.querySelector('#track-edit-artist');
    const newTitle = titleInput.value.trim();
    const newArtist = artistInput.value.trim();
    if (newTitle) t.title = newTitle;
    if (newArtist) t.artist = newArtist;
    saveLibraryMeta();
    renderPlaylist();
    if (idx === currentIndex){
      npTitleTrack.textContent = t.title;
      npArtist.textContent = t.artist;
      document.title = `${t.title} · Player`;
      requestAnimationFrame(() => setupMarquee(npTitle));
      updateMediaSession();
    }
    closeTrackEditPopover();
  }
  document.addEventListener('click', (e) => {
    if (!trackEditPopover.contains(e.target) && !e.target.closest('.track-edit-btn')){
      closeTrackEditPopover();
    }
  });

  // ---------- Track thumbnail editing ----------
  const thumbnailModalOverlay = document.getElementById('thumbnail-modal-overlay');
  const thumbnailModalTrackName = document.getElementById('thumbnail-modal-track-name');
  const thumbnailPreviewImg = document.getElementById('thumbnail-preview-img');
  const thumbnailPreviewFallback = document.getElementById('thumbnail-preview-fallback');
  const thumbnailFramePicker = document.getElementById('thumbnail-frame-picker');
  const thumbnailScrubVideo = document.getElementById('thumbnail-scrub-video');
  const thumbnailScrubRange = document.getElementById('thumbnail-scrub-range');
  const thumbnailUseFrameBtn = document.getElementById('thumbnail-use-frame-btn');
  const thumbnailUploadBtn = document.getElementById('thumbnail-upload-btn');
  const thumbnailRemoveBtn = document.getElementById('thumbnail-remove-btn');
  const thumbnailFileInput = document.getElementById('thumbnail-file-input');
  const thumbnailCloseBtn = document.getElementById('thumbnail-close-btn');
  let thumbnailModalIdx = -1;

  function refreshThumbnailPreview(){
    const t = tracks[thumbnailModalIdx];
    if (t && t.artUrl){
      thumbnailPreviewImg.src = t.artUrl;
      thumbnailPreviewImg.style.display = 'block';
      thumbnailPreviewFallback.style.display = 'none';
    } else {
      thumbnailPreviewImg.style.display = 'none';
      thumbnailPreviewFallback.style.display = 'flex';
    }
    thumbnailRemoveBtn.style.display = (t && t.artUrl) ? '' : 'none';
  }

  function onThumbScrubMetaOnce(){
    const dur = thumbnailScrubVideo.duration;
    thumbnailScrubRange.max = isFinite(dur) && dur > 0 ? dur : 100;
    thumbnailScrubRange.value = 0;
    thumbnailScrubVideo.currentTime = 0;
    thumbnailUseFrameBtn.disabled = false;
  }

  function openThumbnailModal(idx){
    const t = tracks[idx];
    if (!t) return;
    thumbnailModalIdx = idx;
    thumbnailModalTrackName.textContent = t.title;
    refreshThumbnailPreview();

    if (t.kind === 'video'){
      thumbnailFramePicker.classList.add('show');
      thumbnailUseFrameBtn.disabled = true;
      thumbnailScrubVideo.addEventListener('loadedmetadata', onThumbScrubMetaOnce, { once:true });
      thumbnailScrubVideo.src = t.url;
    } else {
      thumbnailFramePicker.classList.remove('show');
      thumbnailScrubVideo.removeAttribute('src');
    }
    thumbnailModalOverlay.classList.add('open');
  }
  function closeThumbnailModal(){
    thumbnailModalOverlay.classList.remove('open');
    thumbnailScrubVideo.pause();
    thumbnailScrubVideo.removeAttribute('src');
    thumbnailScrubVideo.load();
    thumbnailModalIdx = -1;
  }

  function applyNewThumbnail(idx, blob){
    const t = tracks[idx];
    if (!t || !blob) return;
    if (t.artUrl) URL.revokeObjectURL(t.artUrl);
    t.artUrl = URL.createObjectURL(blob);
    t.artDbId = t.dbId + '_art';
    persistTrackBytes(t.artDbId, blob, t.title + ' artwork');
    saveLibraryMeta();
    renderPlaylist();
    if (idx === currentIndex){
      if (t.kind !== 'video'){
        artImg.src = t.artUrl;
        artImg.style.display = 'block';
        artFallback.style.display = 'none';
      }
      updateMediaSession();
    }
    if (idx === thumbnailModalIdx) refreshThumbnailPreview();
  }

  thumbnailScrubRange.addEventListener('input', () => {
    thumbnailScrubVideo.currentTime = parseFloat(thumbnailScrubRange.value) || 0;
  });
  thumbnailScrubVideo.addEventListener('timeupdate', () => {
    thumbnailScrubRange.value = thumbnailScrubVideo.currentTime;
  });

  thumbnailUseFrameBtn.addEventListener('click', () => {
    const v = thumbnailScrubVideo;
    if (!v.videoWidth || !v.videoHeight) return;
    const c = document.createElement('canvas');
    c.width = 320;
    c.height = Math.round(320 * (v.videoHeight / v.videoWidth));
    try {
      c.getContext('2d').drawImage(v, 0, 0, c.width, c.height);
    } catch(e){
      console.warn('thumbnail: could not capture frame', e);
      return;
    }
    c.toBlob((blob) => applyNewThumbnail(thumbnailModalIdx, blob), 'image/jpeg', 0.85);
  });

  thumbnailUploadBtn.addEventListener('click', () => thumbnailFileInput.click());
  thumbnailFileInput.addEventListener('change', () => {
    const file = thumbnailFileInput.files[0];
    thumbnailFileInput.value = '';
    if (file) applyNewThumbnail(thumbnailModalIdx, file);
  });

  thumbnailRemoveBtn.addEventListener('click', () => {
    const t = tracks[thumbnailModalIdx];
    if (!t) return;
    if (t.artUrl) URL.revokeObjectURL(t.artUrl);
    if (t.artDbId) dbDelete(t.artDbId).catch(()=>{});
    t.artUrl = null;
    t.artDbId = null;
    saveLibraryMeta();
    renderPlaylist();
    if (thumbnailModalIdx === currentIndex){
      showFallbackArt();
      updateMediaSession();
    }
    refreshThumbnailPreview();
  });

  thumbnailCloseBtn.addEventListener('click', closeThumbnailModal);
  thumbnailModalOverlay.addEventListener('click', (e) => {
    if (e.target === thumbnailModalOverlay) closeThumbnailModal();
  });

  function removeTrack(i, skipRefresh){
    const wasCurrent = i === currentIndex;
    const removed = tracks[i];
    URL.revokeObjectURL(removed.url);
    if (removed.artUrl) URL.revokeObjectURL(removed.artUrl);
    dbDelete(removed.dbId).catch(()=>{}).then(refreshStorageEstimate);
    if (removed.nativeLocal && window.PPNative && PPNative.lib) PPNative.lib.deleteLocal(removed.nativeUri).catch(()=>{});
    if (removed.artDbId) dbDelete(removed.artDbId).catch(()=>{});
    if (removed.nativeUri && !removed.nativeLocal) ppIgnoreUris([removed.nativeUri]);   // so a background look does not offer it again
    clearTimeout(subtitleSaveTimer);
    writeSubtitleEntry(removed.dbId, null);
    if (wasCurrent) setSubtitleCues([]);
    tracks.splice(i,1);
    // Drop the removed slot from the queue/shuffle order and shift every
    // index after it down by one, so they keep pointing at the same songs.
    const reindex = (arr) => arr.filter(idx => idx !== i).map(idx => idx > i ? idx - 1 : idx);
    playQueue = reindex(playQueue);
    shuffleOrder = reindex(shuffleOrder);
    if (i < currentIndex) currentIndex--;
    else if (wasCurrent){
      audioEl.pause();
      videoEl.pause();
      currentIndex = -1;
      isPlaying = false;
      updatePlayIcon();
      npTitle.classList.remove('marquee-active');
      npTitleTrack.textContent = 'No track selected';
      npArtist.textContent = '-';
      showFallbackArt();
    }
    if (skipRefresh) return; // batch caller saves and re-renders once at the end
    saveLibraryMeta();
    renderPlaylist();
    renderPlaylistsManager();
  }

  function showFallbackArt(){
    artImg.style.display = 'none';
    artFallback.style.display = 'flex';
  }

  function showAudioView(){
    vizWrap.style.display = 'flex';
    try { refreshToVideoBtn(); } catch(e){}
    videoWrap.style.display = 'none';
    refreshVideoDelayState();
    // If the window (or sidebar) was resized while a video was showing,
    // vizWrap was display:none at that moment and its bounding rect read
    // as 0x0 - resizeCanvas silently zeroed the canvas then, and nothing
    // since has re-measured it. Re-measure now that it's visible again, or
    // the disc shows but the bars never draw (they're rendering into a
    // 0x0 canvas). requestAnimationFrame so the display:flex above has
    // actually taken effect and the rect is real.
    requestAnimationFrame(resizeCanvas);
  }
  function showVideoView(){
    vizWrap.style.display = 'none';
    videoWrap.style.display = 'block';
    refreshVideoDelayState();
  }

  // Doesn't touch the underlying file bytes - browsers can already decode
  // just the audio track out of an mp4 via the <audio> element (that's how
  // background-audio-takeover already works elsewhere in this file). This
  // just flips the track's kind so the player treats it like any other
  // audio file from here on: <audio> instead of <video>, disc/thumbnail +
  // visualizer instead of the video frame, "mp3" as the displayed kind.
  // Reversible: the original kind/ext/artist/dimensions are stashed on the
  // track so revertToVideo() can put it back exactly as it was.
  async function convertToMp3(i){
    const t = tracks[i];
    if (!t || t.kind !== 'video') return;
    const wasCurrent = i === currentIndex;
    const wasPlaying = wasCurrent && isPlaying;
    t._origExt = t.ext;
    t._origArtist = t.artist;
    t._origWidth = t.width;
    t._origHeight = t.height;
    t._origUrl = t.url;
    // t.url's Blob still reports the original container's MIME type (e.g.
    // video/mp4) even though we're about to hand it to <audio> - and on
    // several mobile browsers, a track the OS still sees as "video" doesn't
    // qualify for the background-audio execution grant, so it (and the
    // visualizer that depends on the same playback staying alive) freezes
    // the moment the app is backgrounded. Re-wrap the same bytes in a Blob
    // explicitly typed as audio so it's indistinguishable from any other
    // audio file from here on, including in the background.
    let rewrapOk = false;
    // A file on the device plays through the native player, which does not care what the file is labelled as:
    // nothing to re-wrap. (This used to read the whole video into memory and save a second copy of it.)
    if (t.nativeUri || t.remoteUrl) rewrapOk = true;
    else try {
      const origBlob = await (await fetch(t.url)).blob();
      const audioBlob = new Blob([origBlob], { type: 'audio/mp4' });
      t.url = URL.createObjectURL(audioBlob);
      // The rewrap above only changes what's in memory for this session -
      // without also overwriting the stored copy, a reload (including the
      // kind mobile browsers force on a page that's been backgrounded a
      // while) pulls the original video-typed bytes back out of IndexedDB
      // and undoes this fix right when backgrounding is what we're trying
      // to survive. Persist the re-typed bytes under the same dbId so the
      // track comes back as real audio next time too.
      rewrapOk = await persistTrackBytes(t.dbId, audioBlob, t.title);
    } catch(e){
      // Re-wrap failed (e.g. the blob URL already expired) - fall back to
      // the original URL. Still plays fine in the foreground, just not
      // guaranteed to survive backgrounding.
    }
    t.convertedFromVideo = true;
    t.kind = 'audio';
    t.ext = 'mp3';
    if (t.artist === 'Video') t.artist = 'Unknown artist';
    t.width = null;
    t.height = null;
    saveLibraryMeta();
    renderPlaylist();
    if (wasCurrent) loadTrack(i, wasPlaying);
    showToast(rewrapOk
      ? `"${t.title}" converted to audio-only`
      : `"${t.title}" converted, but may not play in the background reliably`);
  }

  async function revertToVideo(i){
    const t = tracks[i];
    if (!t || !t.convertedFromVideo) return;
    const wasCurrent = i === currentIndex;
    const wasPlaying = wasCurrent && isPlaying;
    // Drop the re-wrapped audio-typed Blob URL made by convertToMp3 and go
    // back to the original video URL, so the video element gets its native
    // container/type back rather than the audio-relabeled copy.
    if (t._origUrl && t._origUrl !== t.url){
      try {
        // Restore the original (video-typed) bytes in storage too, so the
        // stored copy matches what convertToMp3 overwrote it with - a
        // reload right after reverting should come back as video, not the
        // audio-typed rewrap.
        const origBlob = await (await fetch(t._origUrl)).blob();
        await persistTrackBytes(t.dbId, origBlob, t.title);
      } catch(e){ /* best effort - the in-memory revert below still works */ }
      try { URL.revokeObjectURL(t.url); } catch(e){}
      t.url = t._origUrl;
    }
    t.kind = 'video';
    t.ext = t._origExt || 'mp4';
    t.artist = t._origArtist != null ? t._origArtist : 'Video';
    t.width = t._origWidth != null ? t._origWidth : null;
    t.height = t._origHeight != null ? t._origHeight : null;
    t.convertedFromVideo = false;
    delete t._origExt;
    delete t._origArtist;
    delete t._origWidth;
    delete t._origHeight;
    delete t._origUrl;
    saveLibraryMeta();
    renderPlaylist();
    if (wasCurrent) loadTrack(i, wasPlaying);
    showToast(`"${t.title}" reverted to video`);
  }

  // Small bridge for the media-player layout (Home screen).
  window.__ppApi = {
    tracks: () => tracks,
    playlists: () => playlists,
    pickPlaylistThumb: id => pickPlaylistThumb(id),
    clearPlaylistThumb: id => clearPlaylistThumb(id),
    currentIndex: () => currentIndex,
    shufflePlaylist: id => shufflePlaylistOrder(id),
    makeShuffledPlaylist: id => makeShuffledPlaylist(id || null),
    playShuffled: id => playShuffledOnce(id || null),
    orderFor: (idxs, plId) => orderIndicesForPlaylist(idxs, playlists.find(p => p.id === plId)),
    gestureActions: () => GESTURE_ACTIONS,
    applyPlaylistStyle: el => applyStyleTo(el, uiCustomization.playlist),
    clearStyle: el => { clearCustomStyle(el); el.classList.remove('custom-bg-active', 'ppxp-anim-bg'); },
    play: (i, queue) => { playQueue = queue; shuffleOrder = []; loadTrack(i, true); },
    detailedMode: () => !!detailedPlaylistMode,
