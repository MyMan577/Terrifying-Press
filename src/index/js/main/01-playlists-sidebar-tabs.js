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
  // Header title: "Press Play Media <Lite|Plus|Premium>", the edition word coloured;
  // " Settings" is added on the Settings tab. Nothing is added when no edition is on.
  function currentEdition(){
    try {
      if (localStorage.getItem('ppPlaygroundMode') === '1') return 'playground';
      if (localStorage.getItem('ppLiteMode') === '1') return 'lite';
      if (localStorage.getItem('ppPlusMode') === '1') return 'plus';
      if (localStorage.getItem('ppPremiumMode') === '1') return 'premium';
    } catch(e){}
    return '';
  }
  const EDITION_NAMES = { lite: 'Lite', plus: 'Plus', premium: 'Premium', playground: 'Playground' };
  window.__ppEdition = currentEdition;
  let lastEdition = null;
  function syncTitleMode(){
    const ed = currentEdition();
    document.body.dataset.edition = ed;
    if (lastEdition !== null && lastEdition !== ed && window.__ppRenderHomeNow) window.__ppRenderHomeNow();
    lastEdition = ed;
    const tg = document.getElementById('ed-tag');
    if (tg) tg.textContent = ({ lite: 'Just play.', plus: 'Everything unlocked.', premium: 'The full experience.', playground: 'Everything. Unlocked. Unleashed.' })[ed] || '';
    const html = ed ? ' <span class="title-mode" data-ed="' + ed + '">' + EDITION_NAMES[ed] + '</span>' : '';
    document.querySelectorAll('.ed-slot').forEach(el => { if (el.dataset.ed !== ed){ el.dataset.ed = ed; el.innerHTML = html; } });
    const tail = document.getElementById('title-tail');
    if (tail) tail.textContent = sidebarPanes.settings.classList.contains('active') ? ' Settings' : '';
  }
  // The mode scripts flip pp-lite / pp-plus / pp-premium on <body>; follow them.
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
  function renderPlaylistsManager(){
    playlistsListEl.innerHTML = '';
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
        <button class="pl-manager-btn" data-id="${pl.id}" title="Delete playlist" type="button">&times;</button>
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
        reset.title = "Use the first video's thumbnail instead";
        reset.addEventListener('click', () => clearPlaylistThumb(pl.id));
        row.insertBefore(reset, row.querySelector('.pl-manager-btn'));
      }
      thumbBtn.addEventListener('click', () => pickPlaylistThumb(pl.id));
      row.querySelector('.pl-manager-btn').addEventListener('click', () => deletePlaylist(pl.id));
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
  plThumbInput.addEventListener('change', async () => {
    const f = plThumbInput.files && plThumbInput.files[0];
    const pl = playlists.find(p => p.id === plThumbTarget);
    plThumbInput.value = '';
    if (!f || !pl) return;
    try {
      pl.thumb = await playlistThumbFromFile(f);
      savePlaylists();
      renderPlaylistsManager();
      showToast('Playlist thumbnail set');
    } catch(e){ showToast('Could not read that image'); }
  });
  function pickPlaylistThumb(id){ plThumbTarget = id; plThumbInput.click(); }
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

