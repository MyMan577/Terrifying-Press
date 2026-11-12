  // ---------- Helpers ----------
  function fmtTime(s){
    if (!isFinite(s) || s < 0) s = 0;
    const m = Math.floor(s/60);
    const sec = Math.floor(s%60).toString().padStart(2,'0');
    return `${m}:${sec}`;
  }

  function updateSeekFill(){
    const pct = seek.max > 0 ? (seek.value/seek.max)*100 : 0;
    seek.style.setProperty('--seek-pct', pct + '%');
  }

  function renderPlaylist(){
    if (window.__ppOnChange) window.__ppOnChange();
    if (selectMode){
      for (const st of [...selectedTracks]) if (!tracks.includes(st)) selectedTracks.delete(st);
      if (selectedTracks.size === 0) exitSelectMode();
    }
    playlistEl.innerHTML = '';
    const libCount = tracks.filter(t => !t.stem).length;
    const curView = effectiveView(), stemsView = curView === STEMS_VIEW;
    ppSyncBrowseRow(stemsView);
    if (tracks.length === 0 || (libCount === 0 && curView === '__all__')){
      playlistEl.appendChild(emptyState);
      trackCount.textContent = tracks.length === 0 ? 'No tracks loaded' : 'No tracks loaded · ' + (tracks.length) + ' split';
      return;
    }

    let indices = tracks.map((_, i) => i);
    const filteringByPlaylist = curView !== '__all__';
    const activePl = (filteringByPlaylist && !stemsView) ? playlists.find(p => p.id === curView) : null;
    if (stemsView){
      indices = indices.filter(i => tracks[i].stem);
    } else if (filteringByPlaylist){
      indices = indices.filter(i => (tracks[i].playlistIds||[]).includes(curView));
      indices = orderIndicesForPlaylist(indices, activePl);
    } else {
      indices = indices.filter(i => !tracks[i].stem);
    }
    // Albums / Artists / Genres / Folders: either the list of groups, or the tracks of the one that was opened.
    const br = ppBrowseActive(stemsView);
    if (br && br.key != null){
      const inGroup = indices.filter(i => ppInGroup(tracks[i], br.mode, br.key));
      if (inGroup.length) indices = inGroup; else br.key = null;   // the group is gone (its last track was removed)
    }
    if (br && br.key == null){ selectContextIndices = []; dragScopeIndices = []; markActiveSort(); ppRenderGroups(indices, br.mode); return; }
    // Snapshot the playlist-ordered indices before the search box narrows
    // things down further - this is the actual queue a click should start
    // playing through, so a track started mid-search still plays out the
    // whole playlist afterward rather than just the search results.
    // Title/artist/duration sorts are a view over the saved order, never a
    // rewrite of it, so "Default order" always brings the original back.
    const sortMode = activeSortMode();
    if (sortMode){
      const cmp = sortCompareFor(sortMode);
      indices = indices.slice().sort((a, b) => cmp(tracks[a], tracks[b]));
    } else if (br && br.mode === 'albums'){
      indices = indices.map((i, n) => [i, n]).sort((a, b) => ppAlbumOrder(tracks[a[0]], tracks[b[0]]) || (a[1] - b[1])).map(x => x[0]);
    }
    markActiveSort();
    const contextIndices = indices.slice();
    selectContextIndices = contextIndices;
    if (br) playlistEl.appendChild(ppGroupHeader(br, contextIndices));
    const searching = trackSearchQuery.length > 0;
    if (searching){
      indices = indices.filter(i => {
        const t = tracks[i];
        const hay = (t.title + ' ' + t.artist + ' ' + (window.__ppTagText ? window.__ppTagText(t.dbId) : '')).toLowerCase();
        return trackSearchQuery.split(/\s+/).every(w => hay.includes(w));
      });
    }

    trackCount.textContent = stemsView
      ? `${indices.length}${searching ? ' of ' + tracks.filter(t => t.stem).length : ''} split track${indices.length!==1?'s':''}`
      : (filteringByPlaylist || searching)
        ? `${indices.length} of ${libCount} track${libCount>1?'s':''}`
        : `${libCount} track${libCount>1?'s':''}`;
    if (br && !searching) trackCount.textContent = `${indices.length} track${indices.length!==1?'s':''}`;
    if (sortMode) trackCount.textContent += ` · sorted by ${sortMode}`;

    if (indices.length === 0){
      const empty = document.createElement('div');
      empty.className = 'playlist-filter-empty';
      empty.textContent = searching
        ? `No tracks match “${trackSearchInput.value.trim()}”.`
        : 'No tracks in this playlist yet. Use the 🗂️ icon on a track to add one.';
      playlistEl.appendChild(empty);
      return;
    }

    // Reordering by drag needs a stable, unambiguous list of positions -
    // that holds for the full library or a single playlist, just not
    // while a text search is narrowing things down.
    if (stemsView && stemSections){          // keep each song's stems together, groups in order of first appearance
      const order = new Map(); indices.forEach(i => { const k = stemKey(tracks[i]); if (!order.has(k)) order.set(k, order.size); });
      indices = indices.map((i, n) => [i, n]).sort((a, b) => (order.get(stemKey(tracks[a[0]])) - order.get(stemKey(tracks[b[0]]))) || (a[1] - b[1])).map(x => x[0]);
    }
    let lastStemKey = null, stemSecHidden = false;
    const dragEnabled = !searching && !sortMode && !stemsView && !br;
    dragScopeIndices = indices;
    dragScopePlaylist = filteringByPlaylist ? activePl : null;

    indices.forEach((i, pos) => {
      const t = tracks[i];
      const row = document.createElement('div');
      row.className = 'track' + (i === currentIndex ? ' active' : '') + (detailedPlaylistMode ? ' detailed' : '');
      row.dataset.dragIdx = i;
      if (selectedTracks.has(t)) row.classList.add('selected');
      const typeIcon = t.kind === 'video'
        ? '<svg class="track-type-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="5" width="15" height="14" rx="2"/><path d="M17 10l5-3v10l-5-3"/></svg>'
        : '<svg class="track-type-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>';
      const dragHandle = dragEnabled ? `<span class="track-drag-handle" title="Drag to reorder">⠿</span>` : '';

      if (detailedPlaylistMode){
        const thumbInner = t.artUrl ? `<img src="${t.artUrl}" alt="">` : typeIcon;
        const metaLine = buildTrackMetaLine(t);
        const removeTitle = filteringByPlaylist ? 'Remove from this playlist' : 'Remove';
        const hasPl = (t.playlistIds||[]).length > 0;
        row.innerHTML = `
          ${dragHandle}
          <span class="track-num">${pos+1}</span>
          <div class="track-thumb">${thumbInner}</div>
          <div class="track-info">
            <div class="track-title marquee"><span class="marquee-track">${escapeHtml(t.title)}</span></div>
            <div class="track-artist">${escapeHtml(t.artist)}</div>
            ${metaLine ? `<div class="track-meta">${metaLine}</div>` : ''}
          </div>
          <div class="track-detailed-actions">
            ${t.kind === 'video' ? `<span class="track-convert-btn" data-idx="${i}" title="Convert to MP3 (audio only)">🎧</span>` : ''}
            ${t.convertedFromVideo ? `<span class="track-revert-btn" data-idx="${i}" title="Revert to video">🎬</span>` : ''}
            <span class="track-pl-btn${hasPl ? ' has-playlists' : ''}" data-idx="${i}" title="Add to playlist">🗂️</span>
            <span class="track-thumb-btn" data-idx="${i}" title="Change thumbnail">🖼️</span>
            <span class="track-edit-btn" data-idx="${i}" title="Edit title/artist">✏️</span>
            <span class="track-remove" data-idx="${i}" title="${removeTitle}">&times;</span>
          </div>
        `;
      } else {
        row.innerHTML = `
          ${dragHandle}
          <span class="track-num">${pos+1}</span>
          ${typeIcon}
          <div class="track-info">
            <div class="track-title marquee"><span class="marquee-track">${escapeHtml(t.title)}</span></div>
            <div class="track-artist">${escapeHtml(t.artist)}</div>
          </div>
          <span class="track-dur">${t.duration ? fmtTime(t.duration) : ''}</span>
          ${t.kind === 'video' ? `<span class="track-convert-btn" data-idx="${i}" title="Convert to MP3 (audio only)">🎧</span>` : ''}
          ${t.convertedFromVideo ? `<span class="track-revert-btn" data-idx="${i}" title="Revert to video">🎬</span>` : ''}
          <span class="track-thumb-btn" data-idx="${i}" title="Change thumbnail">🖼️</span>
          <span class="track-edit-btn" data-idx="${i}" title="Edit title/artist">✏️</span>
          <span class="track-remove" data-idx="${i}" title="Remove">&times;</span>
        `;
      }

      const selCheck = document.createElement('span');
      selCheck.className = 'track-sel-check';
      row.insertBefore(selCheck, row.firstChild);

      row.addEventListener('click', (e) => {
        if (performance.now() < selectSuppressClickUntil) return;
        if (selectMode){ toggleSelected(t, row); return; }
        if (e.target.classList.contains('track-remove')
          || e.target.classList.contains('track-pl-btn')
          || e.target.classList.contains('track-edit-btn')
          || e.target.classList.contains('track-thumb-btn')
          || e.target.classList.contains('track-convert-btn')
          || e.target.classList.contains('track-revert-btn')
          || e.target.classList.contains('track-drag-handle')) return;
        playQueue = contextIndices;
        shuffleOrder = []; // rebuilt lazily against the new queue on next shuffle-advance
        loadTrack(i, true);
      });
      const convertBtn = row.querySelector('.track-convert-btn');
      if (convertBtn){
        convertBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          convertToMp3(i);
        });
      }
      const revertBtn = row.querySelector('.track-revert-btn');
      if (revertBtn){
        revertBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          revertToVideo(i);
        });
      }
      row.querySelector('.track-remove').addEventListener('click', (e) => {
        e.stopPropagation();
        if (filteringByPlaylist) removeTrackFromPlaylist(i, activePlaylistView);
        else removeTrack(i);
      });
      const plBtn = row.querySelector('.track-pl-btn');
      if (plBtn){
        plBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          openTrackPlPopover(plBtn, i);
        });
      }
      const editBtn = row.querySelector('.track-edit-btn');
      if (editBtn){
        editBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          openTrackEditPopover(editBtn, i);
        });
      }
      const thumbBtn = row.querySelector('.track-thumb-btn');
      if (thumbBtn){
        thumbBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          openThumbnailModal(i);
        });
      }
      attachDragHandlers(row, i);
      attachSelectHandlers(row, t);
      if (stemsView && stemSections){
        const k = stemKey(t);
        if (k !== lastStemKey){
          lastStemKey = k;
          const n = indices.filter(j => stemKey(tracks[j]) === k).length;
          stemSecHidden = stemCollapsed.has(k);
          const head = document.createElement('div');
          head.className = 'stem-section-head';
          head.innerHTML = `<span class="stem-section-caret">${stemSecHidden ? '\u25b8' : '\u25be'}</span><span class="stem-section-name">${escapeHtml(t.stemSrc || 'Other splits')}</span><span class="stem-section-count">${n}</span>`;
          head.addEventListener('click', () => { if (stemCollapsed.has(k)) stemCollapsed.delete(k); else stemCollapsed.add(k); renderPlaylist(); });
          playlistEl.appendChild(head);
        }
        if (stemSecHidden) return;
      }
      playlistEl.appendChild(row);
    });
    updateSelectBar();
    // Measure after layout so scrollWidth is accurate.
    requestAnimationFrame(() => {
      playlistEl.querySelectorAll('.marquee').forEach(setupMarquee);
    });
  }

  // ---------- Shared marquee helper ----------
  // Applies a slow back-and-forth scroll to any .marquee > .marquee-track
  // whose content overflows its container. No-ops (and cleans up) otherwise.
  function setupMarquee(container){
    const track = container.querySelector('.marquee-track');
    if (!track) return;
    const overflow = track.scrollWidth - container.clientWidth;
    if (overflow > 2){
      const distance = overflow + 4; // small buffer past the edge
      const duration = Math.max(4, distance / 22); // ~22px/sec, floor for short overflows
      container.style.setProperty('--marquee-shift', `-${distance}px`);
      container.style.setProperty('--marquee-duration', `${duration}s`);
      container.classList.add('marquee-active');
    } else {
      container.classList.remove('marquee-active');
      container.style.removeProperty('--marquee-shift');
      container.style.removeProperty('--marquee-duration');
    }
  }

  function escapeHtml(s){
    const d = document.createElement('div');
    d.textContent = s;
    return d.innerHTML;
  }

  // ---------- Drag-to-reorder ----------
  // Pointer Events (not native HTML5 drag-and-drop) so this works with
  // touch as well as mouse - plain HTML5 DnD largely doesn't fire from
  // touch input on mobile browsers, and this player is used on mobile.
  let dragFromIndex = null;
  let dragActive = false;
  let dragoverRow = null;
  let dragInsertAfter = false;
  let dragScopeIndices = [];   // absolute track indices, in the order currently displayed
  let dragScopePlaylist = null; // the playlist object being viewed, or null for "All tracks"

  // Auto-scroll while dragging near the top/bottom edge of the list.
  // Speed ramps up the longer the finger/pointer is held over the edge,
  // reaching full speed after AUTOSCROLL_RAMP_MS.
  const dragScrollContainer = document.getElementById('sidebar-pane-playlist');
  const AUTOSCROLL_EDGE = 10;
  const AUTOSCROLL_MIN_SPEED = 1.5;
  const AUTOSCROLL_MAX_SPEED = 9;
  const AUTOSCROLL_RAMP_MS = 3000;
  let dragClientX = 0;
  let dragClientY = 0;
  let autoScrollDirection = 0;
  let autoScrollHeldSince = null;
  let autoScrollRAF = null;

  // In the normal layout the playlist pane scrolls. In the media player layout the
  // pane is overflow:visible and the whole #sidebar scrolls instead, with a docked
  // tab bar / mini-player covering its bottom, so that is the container (and the
  // visible area) the edge check has to use.
  const sidebarScrollEl = document.getElementById('sidebar');
  function getDragScroller(){
    return document.body.classList.contains('player-layout') ? sidebarScrollEl : dragScrollContainer;
  }
  function getAutoScrollZone(){
    const scroller = getDragScroller();
    const rect = scroller.getBoundingClientRect();
    if (!document.body.classList.contains('player-layout')){
      return { scroller, top: rect.top + AUTOSCROLL_EDGE, bottom: rect.bottom - AUTOSCROLL_EDGE };
    }
    const EDGE = 64; // wider zone: a thumb covers the 10px strip used on desktop
    let bottomLimit = rect.bottom;
    const mini = document.getElementById('pl-mini');
    if (mini && mini.getClientRects().length){
      bottomLimit = Math.min(bottomLimit, mini.getBoundingClientRect().top);
    }
    return { scroller, top: rect.top + EDGE, bottom: bottomLimit - EDGE };
  }

  function clearDragIndicators(){
    playlistEl.querySelectorAll('.drag-target-before, .drag-target-after').forEach(el => {
      el.classList.remove('drag-target-before', 'drag-target-after');
    });
  }

  function updateDragTarget(clientX, clientY, draggedRow){
    const target = document.elementFromPoint(clientX, clientY);
    const targetRow = target ? target.closest('.track') : null;
    clearDragIndicators();
    if (targetRow && targetRow !== draggedRow && playlistEl.contains(targetRow)){
      const rect = targetRow.getBoundingClientRect();
      const before = clientY < rect.top + rect.height / 2;
      targetRow.classList.add(before ? 'drag-target-before' : 'drag-target-after');
      dragoverRow = targetRow;
      dragInsertAfter = !before;
    } else {
      dragoverRow = null;
    }
  }

  function autoScrollStep(draggedRow){
    if (!dragActive){ autoScrollRAF = null; autoScrollHeldSince = null; autoScrollDirection = 0; return; }
    const zone = getAutoScrollZone();
    const scroller = zone.scroller;
    if (dragClientY < zone.top) autoScrollDirection = -1;
    else if (dragClientY > zone.bottom) autoScrollDirection = 1;
    else autoScrollDirection = 0;

    if (autoScrollDirection !== 0){
      if (autoScrollHeldSince == null) autoScrollHeldSince = performance.now();
      const heldMs = performance.now() - autoScrollHeldSince;
      const ramp = Math.pow(Math.min(1, heldMs / AUTOSCROLL_RAMP_MS), 2);
      const speed = AUTOSCROLL_MIN_SPEED + (AUTOSCROLL_MAX_SPEED - AUTOSCROLL_MIN_SPEED) * ramp;
      const before = scroller.scrollTop;
      scroller.scrollTop += speed * autoScrollDirection;
      // Content shifted under a possibly-stationary pointer, so recheck the drop target.
      if (scroller.scrollTop !== before){
        updateDragTarget(dragClientX, dragClientY, draggedRow);
      }
    } else {
      autoScrollHeldSince = null;
    }
    autoScrollRAF = requestAnimationFrame(() => autoScrollStep(draggedRow));
  }

  function attachDragHandlers(row, i){
    const handle = row.querySelector('.track-drag-handle');
    if (!handle) return; // dragging disabled for this render (filtered/searching)

    handle.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      dragFromIndex = i;
      dragActive = true;
      dragoverRow = null;
      dragClientX = e.clientX;
      dragClientY = e.clientY;
      autoScrollDirection = 0;
      autoScrollHeldSince = null;
      row.classList.add('dragging-row');
      document.body.classList.add('track-drag-active');
      try { handle.setPointerCapture(e.pointerId); } catch(err){ /* ignore */ }
      if (autoScrollRAF == null) autoScrollRAF = requestAnimationFrame(() => autoScrollStep(row));
    });

    handle.addEventListener('pointermove', (e) => {
      if (!dragActive) return;
      dragClientX = e.clientX;
      dragClientY = e.clientY;
      updateDragTarget(e.clientX, e.clientY, row);
    });

    function finishDrag(e){
      if (!dragActive) return;
      dragActive = false;
      if (autoScrollRAF != null){ cancelAnimationFrame(autoScrollRAF); autoScrollRAF = null; }
      autoScrollDirection = 0;
      autoScrollHeldSince = null;
      row.classList.remove('dragging-row');
      document.body.classList.remove('track-drag-active');
      clearDragIndicators();
      try { handle.releasePointerCapture(e.pointerId); } catch(err){ /* ignore */ }
      if (dragoverRow){
        const targetIdx = parseInt(dragoverRow.dataset.dragIdx, 10);
        if (dragScopePlaylist) reorderWithinPlaylist(dragFromIndex, targetIdx, dragInsertAfter, dragScopePlaylist);
        else reorderTrack(dragFromIndex, targetIdx, dragInsertAfter);
      }
      dragFromIndex = null;
      dragoverRow = null;
    }
    handle.addEventListener('pointerup', finishDrag);
    handle.addEventListener('pointercancel', finishDrag);
  }

  function reorderTrack(fromIdx, targetIdx, after){
    if (fromIdx === targetIdx) return;
    const currentTrack = currentIndex !== -1 ? tracks[currentIndex] : null;
    const queuedTracks = playQueue.map(i => tracks[i]);
    const shuffledTracks = shuffleOrder.map(i => tracks[i]);
    const [moved] = tracks.splice(fromIdx, 1);
    let insertAt = targetIdx;
    if (fromIdx < targetIdx) insertAt -= 1; // account for the removed slot shifting later indices down
    if (after) insertAt += 1;
    insertAt = Math.max(0, Math.min(tracks.length, insertAt));
    tracks.splice(insertAt, 0, moved);
    if (currentTrack) currentIndex = tracks.indexOf(currentTrack);
    playQueue = queuedTracks.map(t => tracks.indexOf(t)).filter(i => i !== -1);
    shuffleOrder = shuffledTracks.map(t => tracks.indexOf(t)).filter(i => i !== -1);
    saveLibraryMeta();
    renderPlaylist();
  }

  // Reordering inside a single custom playlist doesn't touch the global
  // library order - it just records a per-playlist manual order (by
  // track dbId, since library order can change independently).
  function reorderWithinPlaylist(fromAbsIdx, targetAbsIdx, after, pl){
    if (fromAbsIdx === targetAbsIdx) return;
    const orderIds = dragScopeIndices.map(i => tracks[i].dbId);
    const fromDbId = tracks[fromAbsIdx].dbId;
    const targetDbId = tracks[targetAbsIdx].dbId;
    const fromPos = orderIds.indexOf(fromDbId);
    if (fromPos === -1) return;
    orderIds.splice(fromPos, 1);
    let targetPos = orderIds.indexOf(targetDbId);
    if (targetPos === -1) return;
    if (after) targetPos += 1;
    orderIds.splice(targetPos, 0, fromDbId);
    pl.order = orderIds;
    savePlaylists();
    renderPlaylist();
  }

