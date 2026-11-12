  // ---------- Multi-select ----------
  // Long-press a track to start selecting, then tap others to add or remove
  // them. Selection is keyed by the track object (not its index) so it
  // survives reorders, deletes and re-renders.
  let selectMode = false;
  const selectedTracks = new Set();
  let selectContextIndices = [];   // absolute indices of the current list (playlist order, before search)
  let selectSuppressClickUntil = 0;
  let selectMenuMode = null;       // 'add' | 'move' while the playlist menu is open
  let selectCtxPl = null;          // playlist id when selecting from a Home-screen playlist page
  function selFromPl(){ return selectCtxPl || activePlaylistView; }
  function notifySelect(){ if (window.__ppOnSelect){ try { window.__ppOnSelect(); } catch(e){} } }
  const SELECT_LONGPRESS_MS = 450;
  const SELECT_MOVE_TOLERANCE = 10;
  const selectBar = document.getElementById('select-bar');
  const selectCountEl = document.getElementById('select-count');
  const selectAllBtn = document.getElementById('select-all-btn');
  const selectPlMenu = document.getElementById('select-pl-menu');

  function viewedPlaylist(){
    return (detailedPlaylistMode && activePlaylistView !== '__all__')
      ? (playlists.find(p => p.id === activePlaylistView) || null) : null;
  }

  function enterSelectMode(t, row){
    selectMode = true;
    selectedTracks.clear();
    selectedTracks.add(t);
    closeTrackPlPopover();
    closeTrackEditPopover();
    document.body.classList.add('select-mode');
    row.classList.add('selected');
    if (navigator.vibrate){ try { navigator.vibrate(12); } catch(e){ /* unsupported */ } }
    updateSelectBar();
  }

  function exitSelectMode(){
    if (!selectMode) return;
    selectMode = false;
    selectedTracks.clear();
    selectCtxPl = null;
    closeSelectPlMenu();
    document.body.classList.remove('select-mode');
    playlistEl.querySelectorAll('.track.selected').forEach(el => el.classList.remove('selected'));
    notifySelect();
  }

  // Home screen (media-player layout): same selection state and actions as the
  // Library, started by long-press on a card / playlist row.
  function enterSelectFromHome(t, plId){
    selectMode = true;
    selectedTracks.clear();
    selectedTracks.add(t);
    selectCtxPl = plId || null;
    closeTrackPlPopover();
    closeTrackEditPopover();
    if (navigator.vibrate){ try { navigator.vibrate(12); } catch(e){ /* unsupported */ } }
    updateSelectBar();
  }
  function toggleSelectedFromHome(t){
    if (!selectMode) return;
    if (selectedTracks.has(t)) selectedTracks.delete(t); else selectedTracks.add(t);
    if (selectedTracks.size === 0) exitSelectMode(); else updateSelectBar();
  }
  function selectAllOfIndices(idxs){
    if (!selectMode) return;
    const list = idxs.map(i => tracks[i]).filter(Boolean);
    const allSel = list.length > 0 && list.every(t => selectedTracks.has(t));
    list.forEach(t => { if (allSel) selectedTracks.delete(t); else selectedTracks.add(t); });
    if (selectedTracks.size === 0) exitSelectMode(); else updateSelectBar();
  }

  function toggleSelected(t, row){
    if (selectedTracks.has(t)) selectedTracks.delete(t);
    else selectedTracks.add(t);
    row.classList.toggle('selected', selectedTracks.has(t));
    if (selectedTracks.size === 0) exitSelectMode();
    else updateSelectBar();
  }

  function updateSelectBar(){
    if (!selectMode) return;
    const n = selectedTracks.size;
    selectCountEl.textContent = `${n} selected`;
    const visible = dragScopeIndices.map(i => tracks[i]);
    const allSel = visible.length > 0 && visible.every(t => selectedTracks.has(t));
    selectAllBtn.textContent = allSel ? 'Deselect all' : 'Select all';
    const inPl = !!viewedPlaylist();
    const q = (act) => selectBar.querySelector(`[data-act="${act}"]`);
    q('playlist').hidden = !detailedPlaylistMode;
    q('move-pl').hidden = !inPl;
    q('remove-pl').hidden = !inPl;
    q('top').hidden = q('up').hidden = q('down').hidden = q('bottom').hidden = !!activeSortMode();
    q('convert').hidden = ![...selectedTracks].some(t => t.kind === 'video');
    notifySelect();
  }

  function attachSelectHandlers(row, t){
    let timer = null, startX = 0, startY = 0, fired = false;
    const cancel = () => { if (timer){ clearTimeout(timer); timer = null; } };
    row.addEventListener('pointerdown', (e) => {
      if (selectMode) return;
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      if (e.target.closest('.track-drag-handle, .track-remove, .track-pl-btn, .track-edit-btn, .track-thumb-btn, .track-convert-btn, .track-revert-btn')) return;
      cancel();
      fired = false;
      startX = e.clientX;
      startY = e.clientY;
      timer = setTimeout(() => {
        timer = null;
        fired = true;
        enterSelectMode(t, row);
      }, SELECT_LONGPRESS_MS);
    });
    row.addEventListener('pointermove', (e) => {
      if (timer && Math.hypot(e.clientX - startX, e.clientY - startY) > SELECT_MOVE_TOLERANCE) cancel();
    });
    row.addEventListener('pointerup', () => {
      // The click that follows releasing a long-press must not toggle the row straight back off.
      if (fired){ selectSuppressClickUntil = performance.now() + 400; fired = false; }
      cancel();
    });
    row.addEventListener('pointercancel', cancel);
    row.addEventListener('pointerleave', cancel);
    row.addEventListener('contextmenu', (e) => { if (selectMode) e.preventDefault(); });
  }

  function selectAllVisible(){
    const visible = dragScopeIndices.map(i => tracks[i]);
    const allSel = visible.length > 0 && visible.every(t => selectedTracks.has(t));
    visible.forEach(t => { if (allSel) selectedTracks.delete(t); else selectedTracks.add(t); });
    if (selectedTracks.size === 0){ exitSelectMode(); return; }
    playlistEl.querySelectorAll('.track').forEach(el => {
      const t = tracks[parseInt(el.dataset.dragIdx, 10)];
      el.classList.toggle('selected', selectedTracks.has(t));
    });
    updateSelectBar();
  }

  // -- Playlist menu (add / move) --
  function closeSelectPlMenu(){
    selectPlMenu.classList.remove('open');
    selectMenuMode = null;
  }
  function openSelectPlMenu(mode, anchor){
    selectMenuMode = mode;
    const sel = [...selectedTracks];
    const skipPl = mode === 'move' ? selFromPl() : selectCtxPl;   // never offer the playlist being viewed on the Home screen
    const list = skipPl ? playlists.filter(p => p.id !== skipPl) : playlists;
    selectPlMenu.innerHTML = '';
    if (list.length === 0){
      selectPlMenu.innerHTML = `<div class="track-pl-popover-empty">${playlists.length === 0 ? 'No playlists yet.<br>Create one in Settings.' : 'No other playlists.'}</div>`;
    } else {
      list.forEach(pl => {
        const item = document.createElement('div');
        item.className = 'track-pl-popover-item';
        if (mode === 'add'){
          const count = sel.filter(t => (t.playlistIds||[]).includes(pl.id)).length;
          const cb = document.createElement('input');
          cb.type = 'checkbox';
          cb.checked = sel.length > 0 && count === sel.length;
          cb.indeterminate = count > 0 && count < sel.length;
          item.appendChild(cb);
        }
        const name = document.createElement('span');
        name.textContent = pl.name;
        item.appendChild(name);
        item.addEventListener('click', () => {
          if (mode === 'move') moveSelectedToPlaylist(pl.id);
          else { toggleSelectedInPlaylist(pl.id); openSelectPlMenu('add', anchor); }
        });
        selectPlMenu.appendChild(item);
      });
    }
    selectPlMenu.classList.add('open');
    const rect = anchor.getBoundingClientRect();
    selectPlMenu.style.left = Math.max(8, Math.min(rect.left, window.innerWidth - 190)) + 'px';
    selectPlMenu.style.top = Math.max(8, rect.top - selectPlMenu.offsetHeight - 6) + 'px';
  }
  document.addEventListener('click', (e) => {
    if (!selectPlMenu.contains(e.target) && !e.target.closest('#select-bar, #ph-select-bar')) closeSelectPlMenu();
  });

  function refreshAfterPlaylistChange(){
    saveLibraryMeta();
    renderPlaylistsManager();
    renderPlaylistViewSelect();
    renderPlaylist();
  }

  // Everything already in the playlist -> remove from it; otherwise add all.
  function toggleSelectedInPlaylist(plId){
    const sel = [...selectedTracks];
    const allIn = sel.every(t => (t.playlistIds||[]).includes(plId));
    sel.forEach(t => {
      t.playlistIds = t.playlistIds || [];
      const pos = t.playlistIds.indexOf(plId);
      if (allIn){ if (pos !== -1) t.playlistIds.splice(pos, 1); }
      else if (pos === -1) t.playlistIds.push(plId);
    });
    refreshAfterPlaylistChange();
  }

  function moveSelectedToPlaylist(targetId){
    const from = selFromPl();
    const target = playlists.find(p => p.id === targetId);
    const n = selectedTracks.size;
    selectedTracks.forEach(t => {
      t.playlistIds = t.playlistIds || [];
      if (!t.playlistIds.includes(targetId)) t.playlistIds.push(targetId);
      t.playlistIds = t.playlistIds.filter(id => id !== from);
    });
    exitSelectMode();
    refreshAfterPlaylistChange();
    showToast(`Moved ${n} track${n > 1 ? 's' : ''} to "${target ? target.name : 'playlist'}"`);
  }

  function removeSelectedFromPlaylist(){
    const from = selFromPl();
    const n = selectedTracks.size;
    selectedTracks.forEach(t => {
      if (t.playlistIds) t.playlistIds = t.playlistIds.filter(id => id !== from);
    });
    exitSelectMode();
    refreshAfterPlaylistChange();
    showToast(`Removed ${n} track${n > 1 ? 's' : ''} from this playlist`);
  }

  // Replaces the library order with `list` (same tracks, new order) and keeps
  // the current track, play queue and shuffle order pointing at the same songs.
  function setLibraryOrder(list){
    const currentTrack = currentIndex !== -1 ? tracks[currentIndex] : null;
    const queuedTracks = playQueue.map(i => tracks[i]);
    const shuffledTracks = shuffleOrder.map(i => tracks[i]);
    tracks.splice(0, tracks.length, ...list);
    if (currentTrack) currentIndex = tracks.indexOf(currentTrack);
    playQueue = queuedTracks.map(t => tracks.indexOf(t)).filter(i => i !== -1);
    shuffleOrder = shuffledTracks.map(t => tracks.indexOf(t)).filter(i => i !== -1);
    saveLibraryMeta();
  }

  // Nudges the selected tracks one step up (-1) or down (+1) among the tracks
  // currently shown. A selected block that's already at the edge stays put,
  // and selection mode stays on so it can be pressed repeatedly.
  function shiftSelected(dir){
    const pl = viewedPlaylist();
    const ctx = pl ? selectContextIndices.map(i => tracks[i]) : tracks.slice();
    const shown = new Set(dragScopeIndices.map(i => tracks[i]));
    const slots = [];
    ctx.forEach((t, i) => { if (shown.has(t)) slots.push(i); });
    const vis = slots.map(i => ctx[i]);
    const sel = (t) => selectedTracks.has(t);
    if (dir < 0){
      for (let i = 1; i < vis.length; i++){
        if (sel(vis[i]) && !sel(vis[i-1])) [vis[i-1], vis[i]] = [vis[i], vis[i-1]];
      }
    } else {
      for (let i = vis.length - 2; i >= 0; i--){
        if (sel(vis[i]) && !sel(vis[i+1])) [vis[i], vis[i+1]] = [vis[i+1], vis[i]];
      }
    }
    slots.forEach((slot, k) => { ctx[slot] = vis[k]; });
    if (pl){
      pl.order = ctx.map(t => t.dbId);
      savePlaylists();
    } else {
      setLibraryOrder(ctx);
    }
    renderPlaylist();
  }

  // Moves the selected tracks to the top or bottom of the list being viewed
  // (the whole library, or one playlist's own manual order), keeping their
  // relative order.
  function moveSelectedToEdge(toTop){
    const pl = viewedPlaylist();
    if (pl){
      const ctx = selectContextIndices.map(i => tracks[i]);
      const picked = ctx.filter(t => selectedTracks.has(t));
      const others = ctx.filter(t => !selectedTracks.has(t));
      pl.order = (toTop ? picked.concat(others) : others.concat(picked)).map(t => t.dbId);
      savePlaylists();
    } else {
      const picked = tracks.filter(t => selectedTracks.has(t));
      const others = tracks.filter(t => !selectedTracks.has(t));
      setLibraryOrder(toTop ? picked.concat(others) : others.concat(picked));
    }
    const n = selectedTracks.size;
    exitSelectMode();
    renderPlaylist();
    showToast(`Moved ${n} track${n > 1 ? 's' : ''} to the ${toTop ? 'top' : 'bottom'}`);
  }

  function deleteSelected(){
    const n = selectedTracks.size;
    if (!n) return;
    if (!confirm(`Delete ${n} track${n > 1 ? 's' : ''} from the library?`)) return;
    const idxs = [];
    tracks.forEach((t, i) => { if (selectedTracks.has(t)) idxs.push(i); });
    exitSelectMode();
    idxs.reverse().forEach(i => removeTrack(i, true)); // high to low so earlier indices stay valid
    saveLibraryMeta();
    renderPlaylist();
    renderPlaylistsManager();
    showToast(`Deleted ${idxs.length} track${idxs.length > 1 ? 's' : ''}`);
  }

  // Selected tracks in the order they appear in the list (any selected tracks
  // currently hidden by a search follow at the end).
  function selectedInViewOrder(){
    const seen = new Set();
    const out = [];
    dragScopeIndices.forEach(i => {
      const t = tracks[i];
      if (selectedTracks.has(t) && !seen.has(t)){ seen.add(t); out.push(t); }
    });
    tracks.forEach(t => { if (selectedTracks.has(t) && !seen.has(t)) out.push(t); });
    return out;
  }

  async function convertSelected(){
    const vids = tracks.filter(t => selectedTracks.has(t) && t.kind === 'video');
    exitSelectMode();
    for (const t of vids){
      const i = tracks.indexOf(t);
      if (i !== -1) await convertToMp3(i);
    }
  }

  selectBar.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-act]');
    if (!btn || !selectMode) return;
    runSelectAct(btn.dataset.act, btn);
  });
  function runSelectAct(act, btn){
    switch (act){
      case 'cancel': exitSelectMode(); break;
      case 'all': selectAllVisible(); break;
      case 'playlist':
      case 'move-pl': {
        const mode = act === 'playlist' ? 'add' : 'move';
        if (selectPlMenu.classList.contains('open') && selectMenuMode === mode) closeSelectPlMenu();
        else openSelectPlMenu(mode, btn);
        break;
      }
      case 'remove-pl': removeSelectedFromPlaylist(); break;
      case 'top': moveSelectedToEdge(true); break;
      case 'up': shiftSelected(-1); break;
      case 'down': shiftSelected(1); break;
      case 'bottom': moveSelectedToEdge(false); break;
      case 'rename': openRenameSelection('title'); break;
      case 'rename-artist': openRenameSelection('artist'); break;
      case 'convert': convertSelected(); break;
      case 'delete': deleteSelected(); break;
    }
  }
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && selectMode) exitSelectMode();
  });

