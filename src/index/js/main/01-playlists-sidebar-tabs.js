(function(){
  // jsmediatags loads from a CDN via a plain <script> tag above. If a file
  // gets added before that request finishes (e.g. right after the page
  // loads, or on a slow connection), `window.jsmediatags` isn't defined yet
  // and tag/thumbnail reading was silently skipped forever for that file.
  // This promise resolves once the library is actually ready (or gives up
  // after a timeout so we don't hang forever if the CDN is blocked), and
  // every read waits on it instead of checking `window.jsmediatags` once.
  const jsmediatagsReady = new Promise((resolve) => {
    if (window.jsmediatags) { resolve(window.jsmediatags); return; }
    const tagScript = document.getElementById('jsmediatags-script');
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      resolve(window.jsmediatags || null);
    };
    if (tagScript){
      tagScript.addEventListener('load', finish);
      tagScript.addEventListener('error', finish);
    }
    setTimeout(finish, 8000);
  });

  const audioEl = PPNative.wrapMedia(document.getElementById('audio'), 'audio');
  const videoEl = PPNative.wrapMedia(document.getElementById('video-el'), 'video');
  const videoDelayCanvas = document.getElementById('video-delay-canvas');
  const vizWrap = document.getElementById('viz-wrap');
  const videoWrap = document.getElementById('video-wrap');

  const fileInput = document.getElementById('file-input');
  const folderInput = document.getElementById('folder-input');
  const addBtn = document.getElementById('add-btn');
  const addDropdown = document.getElementById('add-dropdown');
  const addFilesBtn = document.getElementById('add-files-btn');
  const addFolderBtn = document.getElementById('add-folder-btn');
  const playlistEl = document.getElementById('playlist');
  const emptyState = document.getElementById('empty-state');
  const trackCount = document.getElementById('track-count');
  const trackSearchInput = document.getElementById('track-search');
  const trackEditPopover = document.getElementById('track-edit-popover');

  const sortBtn = document.getElementById('sort-btn');
  const sortDropdown = document.getElementById('sort-dropdown');
  const sortModalOverlay = document.getElementById('sort-modal-overlay');
  const sortPoolEl = document.getElementById('sort-pool');
  const sortResultEl = document.getElementById('sort-result');
  const sortResultEmpty = document.getElementById('sort-result-empty');
  const sortResetBtn = document.getElementById('sort-reset-btn');
  const sortCancelBtn = document.getElementById('sort-cancel-btn');

  // ---------- Detailed playlist mode / multiple playlists ----------
  const sidebarTabBtns = document.querySelectorAll('.sidebar-tab');
  const sidebarPanes = { playlist: document.getElementById('sidebar-pane-playlist'), settings: document.getElementById('sidebar-pane-settings') };
  const detailedModeToggle = document.getElementById('detailed-mode-toggle');
  const playlistsManagerSection = document.getElementById('playlists-manager-section');
  const playlistsListEl = document.getElementById('playlists-list');
  const newPlaylistNameInput = document.getElementById('new-playlist-name');
  const newPlaylistBtn = document.getElementById('new-playlist-btn');
  const playlistViewRow = document.getElementById('playlist-view-row');
  const playlistViewSelect = document.getElementById('playlist-view-select');
  const trackPlPopover = document.getElementById('track-pl-popover');

  const PLAYLISTS_KEY = 'playerPlaylistsV1';
  let detailedPlaylistMode = true;
  let playlists = []; // [{ id, name }]
  let activePlaylistView = '__all__'; // '__all__' or a playlist id
  // On by default: this matches how conversion always behaved before this
  // setting existed - kind/ext were always saved, so a converted track
  // just stayed audio across reloads. Turning this off is what makes a
  // conversion temporary, reverting to video on the next load.
  let keepMp3Conversions = true;
  const keepMp3ConversionsToggle = document.getElementById('keep-mp3-conversions-toggle');
  keepMp3ConversionsToggle.addEventListener('change', () => {
    keepMp3Conversions = keepMp3ConversionsToggle.checked;
    saveSettings();
  });
  const rememberPositionToggle = document.getElementById('remember-position-toggle');
  const playbackPositionIntervalRow = document.getElementById('playback-position-interval-row');
  const playbackPositionIntervalInput = document.getElementById('playback-position-interval-input');
  function updatePlaybackPositionIntervalVisibility(){
    playbackPositionIntervalRow.style.display = rememberPositionToggle.checked ? '' : 'none';
  }
  rememberPositionToggle.addEventListener('change', () => {
    rememberPlaybackPosition = rememberPositionToggle.checked;
    updatePlaybackPositionIntervalVisibility();
    saveSettings();
  });
  playbackPositionIntervalInput.addEventListener('change', () => {
    let secs = parseInt(playbackPositionIntervalInput.value, 10);
    if (!isFinite(secs) || secs < 1) secs = 1;
    if (secs > 60) secs = 60;
    playbackPositionIntervalInput.value = secs;
    playbackPositionSaveIntervalMs = secs * 1000;
    saveSettings();
  });
  updatePlaybackPositionIntervalVisibility();

  function loadPlaylists(){
    try { return JSON.parse(localStorage.getItem(PLAYLISTS_KEY)) || []; }
    catch(e){ return []; }
  }
  function savePlaylists(){
    if (window.__ppOnChange) window.__ppOnChange();
    try { localStorage.setItem(PLAYLISTS_KEY, JSON.stringify(playlists)); } catch(e){ /* storage full or unavailable */ }
  }

  // A playlist without a stored manual order just falls back to the
  // order tracks appear in the full library ("All tracks" order).
  function orderIndicesForPlaylist(indices, pl){
    if (!pl || !Array.isArray(pl.order) || pl.order.length === 0) return indices;
    const byDbId = new Map();
    indices.forEach(i => byDbId.set(tracks[i].dbId, i));
    const ordered = [];
    pl.order.forEach(dbId => {
      if (byDbId.has(dbId)){ ordered.push(byDbId.get(dbId)); byDbId.delete(dbId); }
    });
    // Any tracks not yet in the saved order (newly added to the playlist)
    // are appended at the end, in their natural order.
    indices.forEach(i => { if (byDbId.has(tracks[i].dbId)) ordered.push(i); });
    return ordered;
  }

  function fmtFileSize(bytes){
    if (bytes == null) return '';
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024*1024) return (bytes/1024).toFixed(0) + ' KB';
    if (bytes < 1024*1024*1024) return (bytes/(1024*1024)).toFixed(1) + ' MB';
    return (bytes/(1024*1024*1024)).toFixed(2) + ' GB';
  }
  function buildTrackMetaLine(t){
    const parts = [];
    if (t.kind === 'video' && t.width && t.height) parts.push(`${t.width}×${t.height}`);
    if (t.size != null) parts.push(fmtFileSize(t.size));
    if (t.duration) parts.push(fmtTime(t.duration));
    return parts.join(' · ');
  }

  // ---------- Sidebar tabs ----------
  // Header title: "Press Play Media <Lite|Plus|Premium|Playground|Focus>", the edition word coloured;
  // " Settings" is added on the Settings tab. Nothing is added when no edition is on.
  function currentEdition(){
    try {
      if (localStorage.getItem('ppPlaygroundMode') === '1') return 'playground';
      if (localStorage.getItem('ppLiteMode') === '1') return 'lite';
      if (localStorage.getItem('ppPlusMode') === '1') return 'plus';
      if (localStorage.getItem('ppPremiumMode') === '1') return 'premium';
      if (localStorage.getItem('ppFocusMode') === '1') return 'focus';
    } catch(e){}
    return '';
  }
  const EDITION_NAMES = { lite: 'Lite', plus: 'Plus', premium: 'Premium', playground: 'Playground', focus: 'Focus' };
  window.__ppEdition = currentEdition;
  let lastEdition = null;
  function syncTitleMode(){
    const ed = currentEdition();
    document.body.dataset.edition = ed;
    if (lastEdition !== null && lastEdition !== ed && window.__ppRenderHomeNow) window.__ppRenderHomeNow();
    lastEdition = ed;
    const tg = document.getElementById('ed-tag');
    if (tg) tg.textContent = ({ lite: 'Just play.', plus: 'Everything unlocked.', premium: 'The full experience.', playground: 'Everything. Unlocked. Unleashed.', focus: 'Everything you need. Nothing you don\'t.' })[ed] || '';
    const html = ed ? ' <span class="title-mode" data-ed="' + ed + '">' + EDITION_NAMES[ed] + '</span>' : '';
    document.querySelectorAll('.ed-slot').forEach(el => { if (el.dataset.ed !== ed){ el.dataset.ed = ed; el.innerHTML = html; } });
    const tail = document.getElementById('title-tail');
    if (tail) tail.textContent = sidebarPanes.settings.classList.contains('active') ? ' Settings' : '';
  }
  // The mode scripts flip pp-lite / pp-plus / pp-premium / pp-focus on <body>; follow them.
  new MutationObserver(syncTitleMode).observe(document.body, { attributes: true, attributeFilter: ['class'] });
  window.__ppSyncTitle = syncTitleMode;
  sidebarTabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      if (selectMode) exitSelectMode();
      sidebarTabBtns.forEach(b => b.classList.toggle('active', b === btn));
      const target = btn.dataset.sidebarTab;
      Object.keys(sidebarPanes).forEach(key => {
        sidebarPanes[key].classList.toggle('active', key === target);
      });
      syncTitleMode();
    });
  });
  syncTitleMode();

  // ---------- Split-track (stem) views ----------
  // Stems made by the splitter are flagged t.stem. They never count as library tracks:
  // "All tracks" skips them and they live under their own "Split tracks" view. A playlist
  // with .stemOf is a per-song stem playlist; .libOnly hides it from the Playlists tab
  // (it stays in the library's view selector).
  const STEMS_VIEW = '__stems__';
  function hasStems(){ return tracks.some(t => t.stem); }
  function viewAllowed(id){
    if (id === '__all__') return true;
    if (id === STEMS_VIEW) return hasStems();
    const pl = playlists.find(p => p.id === id);
    return !!pl && (detailedPlaylistMode || !!pl.stemOf || !!pl.auto);
  }
  function effectiveView(){ return viewAllowed(activePlaylistView) ? activePlaylistView : '__all__'; }
  function userPlaylistViewId(){   // real user playlist being viewed (not All / Split tracks), for "add here" behavior
    return (detailedPlaylistMode && activePlaylistView !== '__all__' && activePlaylistView !== STEMS_VIEW) ? activePlaylistView : null;
  }
  // Optional: in the Split tracks view, give every split song its own collapsible section.
  let stemSections = false;
  try { stemSections = localStorage.getItem('ppStemSections') === '1'; } catch(e){}
  const stemCollapsed = new Set();
  const stemKey = t => t.stemOf || ('t:' + (t.stemSrc || ''));
  function syncViewRow(){ playlistViewRow.classList.toggle('active', detailedPlaylistMode || hasStems() || playlists.some(p => p.auto)); }

  // ---------- Detailed mode toggle ----------
  function applyDetailedModeUI(){
    detailedModeToggle.checked = !detailedPlaylistMode;
    const hint = document.getElementById('playlists-manager-hint');
    if (hint) hint.style.display = detailedPlaylistMode ? 'none' : '';
    if (!viewAllowed(activePlaylistView)) activePlaylistView = '__all__';
    syncViewRow();
  }
  detailedModeToggle.addEventListener('change', () => {
    detailedPlaylistMode = !detailedModeToggle.checked;
    applyDetailedModeUI();
    saveSettings();
    renderPlaylist();
  });

  // ---------- Playlist manager (Settings tab) ----------
  let plMgrSel = null;   // the playlists ticked while selecting here (null = not selecting)
  function renderPlaylistsManager(){
    playlistsListEl.innerHTML = '';
    if (plMgrSel) plMgrSel = new Set([...plMgrSel].filter(id => playlists.some(p => p.id === id)));
    if (playlists.length > 1){
      const bar = document.createElement('div');
      bar.className = 'pl-manager-selbar';
      bar.innerHTML = plMgrSel
        ? '<span>' + plMgrSel.size + ' selected</span><button type="button" data-ms="all">All</button>' +
          '<button type="button" data-ms="edit"' + (plMgrSel.size ? '' : ' disabled') + '>Edit…</button><button type="button" data-ms="done">Done</button>'
        : '<button type="button" data-ms="start">Select several</button>';
      bar.addEventListener('click', (e) => {
        const b = e.target.closest('[data-ms]'); if (!b || b.disabled) return;
        const k = b.dataset.ms;
        if (k === 'start') plMgrSel = new Set();
        else if (k === 'done') plMgrSel = null;
        else if (k === 'all') plMgrSel = new Set(plMgrSel && plMgrSel.size === playlists.length ? [] : playlists.map(p => p.id));
        else if (k === 'edit'){ openBatchPlaylistMenu([...plMgrSel], () => { plMgrSel = null; renderPlaylistsManager(); }); return; }
        renderPlaylistsManager();
      });
      playlistsListEl.appendChild(bar);
    }
    if (playlists.length === 0){
      const empty = document.createElement('div');
      empty.className = 'pl-manager-empty';
      empty.textContent = 'No playlists yet, create one below.';
      playlistsListEl.appendChild(empty);
    }
    playlists.forEach(pl => {
      const count = tracks.filter(t => (t.playlistIds||[]).includes(pl.id)).length;
      const row = document.createElement('div');
      row.className = 'pl-manager-item';
      row.innerHTML = `
        <button class="pl-manager-thumb" data-id="${pl.id}" title="Set playlist thumbnail" type="button">🖼️</button>
        <span class="pl-manager-name" data-id="${pl.id}" title="Click to rename">${escapeHtml(pl.name)}</span>
        <span class="pl-manager-count">${count} track${count!==1?'s':''}${pl.stemOf ? (pl.libOnly ? ' · split, library only' : ' · split') : pl.auto === 'smart' ? ' · smart (live)' : pl.auto === 'surprise' ? (pl.libOnly ? ' · surprise, library only' : ' · surprise') : ''}</span>
        <button class="pl-manager-btn pl-manager-shuf" data-id="${pl.id}" title="Shuffle this playlist's order" type="button">⇄</button>
        <button class="pl-manager-btn pl-manager-del" data-id="${pl.id}" title="Delete playlist" type="button">&times;</button>
      `;
      const nameEl = row.querySelector('.pl-manager-name');
      nameEl.addEventListener('click', () => startRenamePlaylist(nameEl, pl));
      const thumbBtn = row.querySelector('.pl-manager-thumb');
      if (pl.thumb){
        thumbBtn.textContent = '';
        thumbBtn.style.backgroundImage = 'url("' + pl.thumb + '")';
        thumbBtn.title = 'Change playlist thumbnail';
        const reset = document.createElement('button');
        reset.type = 'button'; reset.className = 'pl-manager-btn'; reset.textContent = '\u21ba';
        reset.title = "Use the first song or video's picture instead";
        reset.addEventListener('click', () => clearPlaylistThumb(pl.id));
        row.insertBefore(reset, row.querySelector('.pl-manager-shuf'));
      }
      thumbBtn.addEventListener('click', () => pickPlaylistThumb(pl.id));
      row.querySelector('.pl-manager-del').addEventListener('click', () => deletePlaylist(pl.id));
      row.querySelector('.pl-manager-shuf').addEventListener('click', () => shufflePlaylistOrder(pl.id));
      if (plMgrSel){
        const cb = document.createElement('input');
        cb.type = 'checkbox'; cb.className = 'pl-manager-check'; cb.checked = plMgrSel.has(pl.id);
        cb.setAttribute('aria-label', 'Select ' + pl.name);
        cb.addEventListener('change', () => { if (cb.checked) plMgrSel.add(pl.id); else plMgrSel.delete(pl.id); renderPlaylistsManager(); });
        row.insertBefore(cb, row.firstChild);
        row.classList.toggle('picked', cb.checked);
      }
      playlistsListEl.appendChild(row);
    });
    renderPlaylistViewSelect();
  }

  function startRenamePlaylist(nameEl, pl){
    const input = document.createElement('input');
    input.type = 'text';
    input.value = pl.name;
    input.maxLength = 40;
    nameEl.textContent = '';
    nameEl.appendChild(input);
    input.focus();
    input.select();
    const commit = () => {
      const v = input.value.trim();
      if (v) pl.name = v;
      savePlaylists();
      renderPlaylistsManager();
    };
    input.addEventListener('blur', commit);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') input.blur();
      if (e.key === 'Escape'){ input.value = pl.name; input.blur(); }
    });
  }

  // ---------- Playlist thumbnails ----------
  // A custom image is shrunk to a 16:9 JPEG (about 20-40 KB) so it fits comfortably in storage and backups.
  // Without one, the playlist shows its first video's thumbnail.
  let plThumbTarget = null;
  const plThumbInput = document.createElement('input');
  plThumbInput.type = 'file'; plThumbInput.accept = 'image/*'; plThumbInput.style.display = 'none';
  document.body.appendChild(plThumbInput);
  function playlistThumbFromFile(file){
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file), img = new Image();
      img.onload = () => {
        try {
          const W = 480, H = 270, c = document.createElement('canvas'); c.width = W; c.height = H;
          const sc = Math.max(W / img.naturalWidth, H / img.naturalHeight), w = img.naturalWidth * sc, h = img.naturalHeight * sc;
          c.getContext('2d').drawImage(img, (W - w) / 2, (H - h) / 2, w, h);
          resolve(c.toDataURL('image/jpeg', 0.82));
        } catch(e){ reject(e); }
        finally { URL.revokeObjectURL(url); }
      };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Unreadable image')); };
      img.src = url;
    });
  }
  let plThumbTargets = null;   // several playlists getting one picture (batch editing)
  plThumbInput.addEventListener('change', async () => {
    const f = plThumbInput.files && plThumbInput.files[0];
    const list = plThumbTargets ? plByIds(plThumbTargets) : playlists.filter(p => p.id === plThumbTarget);
    plThumbTargets = null;
    plThumbInput.value = '';
    if (!f || !list.length) return;
    try {
      const thumb = await playlistThumbFromFile(f);
      list.forEach(pl => { pl.thumb = thumb; });
      savePlaylists();
      renderPlaylistsManager();
      showToast(list.length > 1 ? 'Thumbnail set for ' + list.length + ' playlists' : 'Playlist thumbnail set');
    } catch(e){ showToast('Could not read that image'); }
  });
  function pickPlaylistThumb(id){ plThumbTargets = null; plThumbTarget = id; plThumbInput.click(); }
  function clearPlaylistThumb(id){
    const pl = playlists.find(p => p.id === id);
    if (!pl || !pl.thumb) return;
    delete pl.thumb;
    savePlaylists();
    renderPlaylistsManager();
  }

  function createPlaylist(name){
    const trimmed = (name || '').trim();
    const pl = { id: 'pl_' + Date.now() + '_' + Math.random().toString(36).slice(2,8), name: trimmed || 'Untitled playlist' };
    playlists.push(pl);
    savePlaylists();
    renderPlaylistsManager();
    return pl;
  }
  // ---------- Shuffle: really reorder a playlist, or make a shuffled copy ----------
  function ppShuffled(a){ a = a.slice(); for (let k = a.length - 1; k > 0; k--){ const r = Math.floor(Math.random() * (k + 1)); [a[k], a[r]] = [a[r], a[k]]; } return a; }
  // the songs of a playlist, or of the whole library (no split stems) when plId is empty
  function ppMembers(plId){ return tracks.filter(t => plId ? (t.playlistIds || []).includes(plId) : !t.stem).map(t => t.dbId); }
  function shufflePlaylistOrder(plId){
    const pl = playlists.find(p => p.id === plId); if (!pl) return null;
    const ids = ppMembers(plId); if (ids.length < 2){ showToast('Nothing to shuffle yet'); return pl; }
    pl.order = ppShuffled(ids);
    try { if (typeof sortViews === 'object' && sortViews[plId]){ delete sortViews[plId]; saveSortViews(); } } catch(e){ if (typeof ppCaught === "function") ppCaught(e); }   // a title/artist sort would hide the new order
    savePlaylists(); renderPlaylist(); renderPlaylistsManager();
    showToast('Shuffled “' + pl.name + '”');
    return pl;
  }
  function makeShuffledPlaylist(fromPlId){
    const src = fromPlId ? playlists.find(p => p.id === fromPlId) : null;
    const ids = ppMembers(fromPlId || null); if (!ids.length){ showToast('Nothing to shuffle yet'); return null; }
    const base = (src ? src.name : 'Everything') + ' (shuffled)';
    let name = base, n = 2; while (playlists.some(p => p.name === name)) name = base + ' ' + n++;
    const pl = createPlaylist(name), set = new Set(ids);
    tracks.forEach(t => { if (set.has(t.dbId)){ t.playlistIds = t.playlistIds || []; if (!t.playlistIds.includes(pl.id)) t.playlistIds.push(pl.id); } });
    pl.order = ppShuffled(ids);
    saveLibraryMeta(); savePlaylists(); renderPlaylistsManager(); renderPlaylist();
    showToast('Made “' + name + '” (' + ids.length + ' track' + (ids.length === 1 ? '' : 's') + ')');
    return pl;
  }
  // play a playlist (or everything) in a random order without changing its saved order
  function playShuffledOnce(plId){
    const ids = new Set(ppMembers(plId || null)), q = [];
    tracks.forEach((t, i) => { if (ids.has(t.dbId)) q.push(i); });
    if (!q.length) return;
    const order = ppShuffled(q);
    playQueue = order; shuffleOrder = []; loadTrack(order[0], true);
  }
  newPlaylistBtn.addEventListener('click', () => {
    createPlaylist(newPlaylistNameInput.value);
    newPlaylistNameInput.value = '';
    newPlaylistNameInput.focus();
  });
  newPlaylistNameInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter'){
      createPlaylist(newPlaylistNameInput.value);
      newPlaylistNameInput.value = '';
    }
  });

  function deletePlaylist(id){
    const pl = playlists.find(p => p.id === id);
    if (!pl) return;
    if (!confirm(`Delete playlist "${pl.name}"? Tracks will stay in the library.`)) return;
    playlists = playlists.filter(p => p.id !== id);
    tracks.forEach(t => { if (t.playlistIds) t.playlistIds = t.playlistIds.filter(pid => pid !== id); });
    if (activePlaylistView === id) activePlaylistView = '__all__';
    savePlaylists();
    saveLibraryMeta();
    renderPlaylistsManager();
    renderPlaylist();
  }

  // ---------- Batch playlist editing ----------
  // Several playlists at once, from Select on the Playlists page or in Settings > Playlists: merge them into a new
  // playlist, give them one picture, reset their pictures, shuffle each, or delete them. Tracks always stay in the library.
  function plByIds(ids){ return ids.map(id => playlists.find(p => p.id === id)).filter(Boolean); }
  function plIndices(pl){ const idxs = []; tracks.forEach((t, i) => { if ((t.playlistIds || []).includes(pl.id)) idxs.push(i); }); return orderIndicesForPlaylist(idxs, pl); }
  function afterBatchPl(){
    savePlaylists(); saveLibraryMeta(); renderPlaylistsManager(); renderPlaylist();
    if (window.__ppRenderHomeNow){ try { window.__ppRenderHomeNow(); } catch(e){ if (typeof ppCaught === "function") ppCaught(e); } }
  }
  function deletePlaylists(ids){
    const list = plByIds(ids); if (!list.length) return false;
    const n = list.length;
    if (!confirm(n === 1 ? `Delete playlist "${list[0].name}"? Tracks will stay in the library.` : `Delete ${n} playlists? Tracks will stay in the library.`)) return false;
    const gone = new Set(list.map(p => p.id));
    playlists = playlists.filter(p => !gone.has(p.id));
    tracks.forEach(t => { if (t.playlistIds) t.playlistIds = t.playlistIds.filter(pid => !gone.has(pid)); });
    if (gone.has(activePlaylistView)) activePlaylistView = '__all__';
    afterBatchPl();
    showToast(n === 1 ? 'Playlist deleted' : n + ' playlists deleted');
    return true;
  }
  function mergePlaylists(ids){
    const list = plByIds(ids); if (list.length < 2){ showToast('Pick at least two playlists to merge'); return false; }
    const guess = list.slice(0, 2).map(p => p.name).join(' + ') + (list.length > 2 ? ' + more' : '');
    const name = prompt('Name for the merged playlist (the originals are kept):', guess);
    if (name === null) return false;
    const order = [], seen = new Set();
    list.forEach(pl => plIndices(pl).forEach(i => { const id = tracks[i].dbId; if (!seen.has(id)){ seen.add(id); order.push(id); } }));
    const npl = createPlaylist(name);
    tracks.forEach(t => { if (seen.has(t.dbId)){ t.playlistIds = t.playlistIds || []; if (!t.playlistIds.includes(npl.id)) t.playlistIds.push(npl.id); } });
    npl.order = order;
    afterBatchPl();
    showToast('Made “' + npl.name + '” (' + order.length + ' track' + (order.length === 1 ? '' : 's') + ')');
    return true;
  }
  function pickPlaylistsThumb(ids){ plThumbTargets = ids.slice(); plThumbTarget = null; plThumbInput.click(); }
  function clearPlaylistsThumb(ids){
    const list = plByIds(ids).filter(p => p.thumb); if (!list.length) return false;
    list.forEach(p => { delete p.thumb; });
    afterBatchPl();
    showToast('Pictures reset on ' + list.length + ' playlist' + (list.length === 1 ? '' : 's'));
    return true;
  }
  function shufflePlaylists(ids){
    const list = plByIds(ids); let n = 0;
    list.forEach(pl => {
      const members = ppMembers(pl.id); if (members.length < 2) return;
      pl.order = ppShuffled(members); n++;
      try { if (typeof sortViews === 'object' && sortViews[pl.id]){ delete sortViews[pl.id]; saveSortViews(); } } catch(e){ if (typeof ppCaught === "function") ppCaught(e); }
    });
    if (!n){ showToast('Nothing to shuffle yet'); return false; }
    afterBatchPl();
    showToast('Shuffled ' + n + ' playlist' + (n === 1 ? '' : 's'));
    return true;
  }
  // The action sheet. done() runs after an action is picked, so the caller can leave its select mode.
  function openBatchPlaylistMenu(ids, done){
    const old = document.getElementById('batch-pl-menu'); if (old) old.remove();
    const list = plByIds(ids); if (!list.length) return;
    const n = list.length, withPic = list.filter(p => p.thumb).length;
    const o = document.createElement('div'); o.id = 'batch-pl-menu';
    o.innerHTML = '<div class="bcm-sheet"><div class="bcm-title">' + (n === 1 ? escapeHtml(list[0].name) : n + ' playlists') + '</div>' +
      (n > 1 ? '<button type="button" data-bp="merge">➕ Merge into a new playlist</button>' : '') +
      '<button type="button" data-bp="pic">🖼️ Set one picture for ' + (n === 1 ? 'it' : 'all of them') + '</button>' +
      (withPic ? '<button type="button" data-bp="unpic">↺ Reset pictures (' + withPic + ')</button>' : '') +
      '<button type="button" data-bp="shuffle">⇄ Shuffle the order of ' + (n === 1 ? 'it' : 'each') + '</button>' +
      '<button type="button" data-bp="delete" class="bcm-danger">🗑 Delete ' + (n === 1 ? 'it' : 'them') + '</button>' +
      '<button type="button" data-bp="cancel" class="bcm-cancel">Cancel</button></div>';
    o.addEventListener('click', (e) => {
      const b = e.target.closest('[data-bp]');
      if (e.target === o || (b && b.dataset.bp === 'cancel')){ o.remove(); return; }
      if (!b) return;
      o.remove();
      const k = b.dataset.bp;
      let changed = false;
      if (k === 'merge') changed = mergePlaylists(ids);
      else if (k === 'pic'){ pickPlaylistsThumb(ids); changed = true; }
      else if (k === 'unpic') changed = clearPlaylistsThumb(ids);
      else if (k === 'shuffle') changed = shufflePlaylists(ids);
      else if (k === 'delete') changed = deletePlaylists(ids);
      if (changed && done) done(k);
    });
    document.body.appendChild(o);
  }

