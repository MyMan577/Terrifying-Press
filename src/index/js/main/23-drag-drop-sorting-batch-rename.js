  // ---------- Drag & drop (bonus convenience, sidebar area) ----------
  ['dragover','drop'].forEach(evt => {
    document.body.addEventListener(evt, e => e.preventDefault());
  });
  document.body.addEventListener('drop', (e) => {
    e.preventDefault();
    const files = Array.from(e.dataTransfer.files).filter(f => detectKind(f));
    if (files.length) addFiles(files);
  });

  // ---------- Sorting ----------
  let sortOrder = []; // array of track indices (into `tracks`), in chosen order
  let sortModalScope = null; // playlist object being sorted, or null for "All tracks"
  let sortModalTrackIndices = []; // absolute track indices eligible in this modal session
  const sortPoolLabel = document.getElementById('sort-pool-label');

  sortBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    sortDropdown.classList.toggle('open');
    sortBtn.classList.toggle('open');
  });
  document.addEventListener('click', () => {
    sortDropdown.classList.remove('open');
    sortBtn.classList.remove('open');
  });
  sortDropdown.addEventListener('click', (e) => e.stopPropagation());

  sortDropdown.querySelectorAll('button[data-sort]').forEach(btn => {
    btn.addEventListener('click', () => {
      sortDropdown.classList.remove('open');
      sortBtn.classList.remove('open');
      const mode = btn.dataset.sort;
      if (mode === 'manual'){
        openSortModal();
      } else {
        applyAutoSort(mode);
      }
    });
  });

  function sortScopePlaylist(){
    return (detailedPlaylistMode && activePlaylistView !== '__all__')
      ? playlists.find(p => p.id === activePlaylistView)
      : null;
  }
  function sortScopeIndices(pl){
    return pl
      ? tracks.map((_, i) => i).filter(i => (tracks[i].playlistIds||[]).includes(pl.id))
      : tracks.map((_, i) => i).filter(i => !tracks[i].stem);
  }
  function sortCompareFor(mode){
    if (mode === 'title') return (a,b) => a.title.localeCompare(b.title, undefined, {sensitivity:'base'});
    if (mode === 'artist') return (a,b) => a.artist.localeCompare(b.artist, undefined, {sensitivity:'base'});
    return (a,b) => (a.duration||0) - (b.duration||0);
  }

  // Sort views: which regular sort (if any) is showing, per scope ("__all__"
  // or a playlist id). The saved order itself is only ever changed by
  // Manual order or drag-reorder, so it stays the baseline for every sort.
  const SORT_VIEWS_KEY = 'playerSortViewsV1';
  let sortViews = (() => {
    try { return JSON.parse(localStorage.getItem(SORT_VIEWS_KEY)) || {}; }
    catch(e){ return {}; }
  })();
  function saveSortViews(){
    try { localStorage.setItem(SORT_VIEWS_KEY, JSON.stringify(sortViews)); } catch(e){ /* storage full or unavailable */ }
  }
  function sortViewKey(){
    const pl = sortScopePlaylist();
    return pl ? pl.id : '__all__';
  }
  function activeSortMode(){
    return sortViews[sortViewKey()] || null;
  }
  function markActiveSort(){
    const mode = activeSortMode() || 'default';
    sortDropdown.querySelectorAll('button[data-sort]').forEach(b => {
      b.classList.toggle('active', b.dataset.sort === mode);
    });
  }

  function applyAutoSort(mode){
    if (sortScopeIndices(sortScopePlaylist()).length === 0) return;
    if (mode === 'default') delete sortViews[sortViewKey()];
    else sortViews[sortViewKey()] = mode;
    saveSortViews();
    renderPlaylist();
  }

  function openSortModal(){
    const pl = sortScopePlaylist();
    sortModalScope = pl;
    sortModalTrackIndices = sortScopeIndices(pl);
    if (sortModalTrackIndices.length === 0) return;
    sortPoolLabel.textContent = pl ? `${pl.name}` : 'All tracks';
    // Defaults to the current order of every track in scope, so applying
    // without changes is a no-op rather than forcing the user to click
    // each track individually just to rebuild the existing order.
    sortOrder = orderIndicesForPlaylist(sortModalTrackIndices, pl);
    renderSortPool();
    renderSortResult();
    sortModalOverlay.classList.add('open');
  }
  function closeSortModal(){
    sortModalOverlay.classList.remove('open');
  }

  // ---------- Batch rename ----------
  // One popup, four actions on keyword-matched tracks: set artist, rename the
  // track name, remove text, add text. The same popup also serves the Rename
  // buttons in selection mode (renameSelMode), where the selected tracks are
  // the targets instead of a keyword match.
  const renameArtistsBtn = document.getElementById('rename-artists-btn');
  const renameModalOverlay = document.getElementById('rename-modal-overlay');
  const renameModeSelect = document.getElementById('rename-mode');
  const renameModeField = document.getElementById('rename-mode-field');
  const renameKeywordsInput = document.getElementById('rename-keywords');
  const renameKeywordsField = renameKeywordsInput.closest('.rename-field');
  const renameKeywordsLabel = document.querySelector('label[for="rename-keywords"]');
  const renameMatchBy = document.getElementById('rename-match-by');
  const renameKeywordsHint = document.getElementById('rename-keywords-hint');
  const renameNewNameInput = document.getElementById('rename-new-name');
  const renameNewNameLabel = document.querySelector('label[for="rename-new-name"]');
  const renameValueHint = document.getElementById('rename-value-hint');
  const renameExtraField = document.getElementById('rename-extra-field');
  const renameFieldSelect = document.getElementById('rename-field-select');
  const renamePosSelect = document.getElementById('rename-pos-select');
  const renameMatchesLabel = document.getElementById('rename-matches-label');
  const renameMatchesList = document.getElementById('rename-matches-list');
  const renameMatchCount = document.getElementById('rename-match-count');
  const renameApplyBtn = document.getElementById('rename-apply-btn');
  const renameCancelBtn = document.getElementById('rename-cancel-btn');
  const renameHeaderTitle = document.querySelector('#rename-modal-header h2');
  const renameHeaderText = document.querySelector('#rename-modal-header p');
  const renameDefaults = { title: renameHeaderTitle.textContent, text: renameHeaderText.innerHTML };

  const RENAME_MODES = {
    artist: { label: 'New artist name', placeholder: 'New artist name', hint: '', needKeywords: true },
    title:  { label: 'New track name', placeholder: 'e.g. {title} (Live)', needKeywords: true,
              hint: 'Use {n} for a running number and {title} for the current name.' },
    remove: { label: 'Text to remove', placeholder: 'e.g. (Official Video), [HD]', needKeywords: false,
              hint: 'Comma-separated, case-insensitive. Empty brackets and stray separators left behind are tidied up. Keywords are optional here: leave them empty to check every track.' },
    add:    { label: 'Text to add', placeholder: 'e.g. (Live)', needKeywords: true,
              hint: 'Added with a space between it and the existing text.' }
  };
  let renameSelMode = null;   // null = keyword flow, or 'artist' / 'title' for selected tracks
  let renameSelTracks = [];

  function parseRenameKeywords(){
    return renameKeywordsInput.value
      .split(',')
      .map(k => k.trim().toLowerCase())
      .filter(Boolean);
  }

  function matchedTracksForRename(keywords){
    if (keywords.length === 0) return [];
    const field = renameMatchBy.value; // 'title' or 'artist'
    return tracks.filter(t => {
      const text = (t[field] || '').toLowerCase();
      return keywords.some(k => text.includes(k));
    });
  }

  function stripRenameText(str, terms){
    let out = str;
    terms.forEach(term => {
      out = out.replace(new RegExp(term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'), '');
    });
    if (out === str) return str; // nothing was removed, leave it exactly as it was
    return out
      .replace(/\(\s*\)|\[\s*\]|\{\s*\}/g, '')
      .replace(/\s{2,}/g, ' ')
      .replace(/^[\s\-\u2013_|:]+|[\s\-\u2013_|:]+$/g, '');
  }

  // The change one action makes to one track, or null when it changes nothing.
  // n is the track's 1-based position among the targets (for {n}).
  function renameChangeFor(mode, t, n){
    const v = renameNewNameInput.value.trim();
    if (!v) return null;
    if (mode === 'artist') return { field: 'artist', val: v };
    if (mode === 'title'){
      const nv = v.replace(/\{n\}/g, () => String(n)).replace(/\{title\}/g, () => t.title).trim();
      return nv ? { field: 'title', val: nv } : null;
    }
    const field = renameFieldSelect.value;
    const old = t[field] || '';
    if (mode === 'add'){
      const nv = !old ? v : (renamePosSelect.value === 'start' ? `${v} ${old}` : `${old} ${v}`);
      return { field, val: nv };
    }
    const terms = v.split(',').map(x => x.trim()).filter(Boolean);
    const nv = stripRenameText(old, terms);
    if (nv === old) return null;
    if (field === 'title' && !nv) return null; // never blank out a track name
    return { field, val: nv };
  }

  function currentRenameMode(){
    return renameSelMode || renameModeSelect.value;
  }

  function collectRenameChanges(){
    const mode = currentRenameMode();
    let list;
    if (renameSelMode) list = renameSelTracks;
    else {
      const keywords = parseRenameKeywords();
      list = keywords.length ? matchedTracksForRename(keywords) : (mode === 'remove' ? tracks.slice() : []);
    }
    const changes = [];
    list.forEach((t, k) => {
      const c = renameChangeFor(mode, t, k + 1);
      if (c) changes.push({ t, field: c.field, val: c.val });
    });
    return { mode, list, changes };
  }

  function renameRowHtml(t, field, val){
    const shown = escapeHtml(val === '' ? '(empty)' : val);
    const showArtist = field === 'artist' || (!renameSelMode && renameMatchBy.value === 'artist');
    return showArtist
      ? `<div class="rename-match-row">
          <span class="rename-match-title">${escapeHtml(t.title)}</span>
          <span class="rename-match-artist">${escapeHtml(t.artist || '')}</span>
          <span class="rename-match-arrow">→</span>
          <span class="rename-match-new">${shown}</span>
        </div>`
      : `<div class="rename-match-row">
          <span class="rename-match-title">${escapeHtml(t.title)}</span>
          <span class="rename-match-arrow">→</span>
          <span class="rename-match-new">${shown}</span>
        </div>`;
  }

  // Shows only the controls the current action needs.
  function syncRenameUI(){
    const sel = !!renameSelMode;
    const mode = currentRenameMode();
    const cfg = RENAME_MODES[mode];
    renameModeField.style.display = sel ? 'none' : '';
    renameKeywordsField.style.display = sel ? 'none' : '';
    const where = renameMatchBy.value === 'artist' ? 'artist' : 'track name';
    renameKeywordsLabel.textContent = cfg.needKeywords ? `Match keywords (${where})` : `Match keywords (${where}, optional)`;
    renameKeywordsHint.textContent = `Comma-separated. Any track whose ${where === 'artist' ? 'artist' : 'title'} contains one of these (case-insensitive) will match.`;
    renameNewNameLabel.textContent = cfg.label;
    renameNewNameInput.placeholder = cfg.placeholder;
    renameValueHint.textContent = cfg.hint;
    renameValueHint.style.display = cfg.hint ? '' : 'none';
    renameExtraField.style.display = (!sel && (mode === 'remove' || mode === 'add')) ? '' : 'none';
    renamePosSelect.style.display = mode === 'add' ? '' : 'none';
  }

  function renderRenameMatches(){
    const sel = !!renameSelMode;
    const mode = currentRenameMode();
    const cfg = RENAME_MODES[mode];
    const hasValue = !!renameNewNameInput.value.trim();
    const keywords = sel ? [] : parseRenameKeywords();
    const verb = (mode === 'artist' || mode === 'title') ? 'Rename' : 'Apply to';
    const idle = (msg, html) => {
      renameMatchesLabel.textContent = msg;
      renameMatchesList.innerHTML = html || '';
      renameMatchCount.textContent = '';
      renameApplyBtn.disabled = true;
      renameApplyBtn.textContent = verb === 'Rename' ? 'Rename' : 'Apply';
    };

    if (!sel && cfg.needKeywords && keywords.length === 0){
      idle('Enter keywords above to preview matches');
      return;
    }
    if (!sel && !cfg.needKeywords && !hasValue){
      idle('Enter the text to remove above to preview matches');
      return;
    }

    const { list, changes } = collectRenameChanges();
    if (!sel && keywords.length > 0 && list.length === 0){
      idle('Matching tracks', '<div class="rename-no-matches">No tracks match those keywords.</div>');
      return;
    }
    if (mode === 'remove' && hasValue && changes.length === 0){
      idle('Matching tracks', '<div class="rename-no-matches">No tracks contain that text.</div>');
      return;
    }

    // No value typed yet: still preview who would be affected, with a placeholder result.
    const placeholderField = mode === 'artist' ? 'artist' : (mode === 'title' ? 'title' : renameFieldSelect.value);
    const rows = hasValue ? changes : list.map(t => ({ t, field: placeholderField, val: '…' }));
    renameMatchesLabel.textContent = `${sel ? 'Selected' : 'Matching'} tracks (${rows.length})`;
    renameMatchesList.innerHTML = rows.map(r => renameRowHtml(r.t, r.field, r.val)).join('');
    const n = changes.length;
    renameMatchCount.textContent = hasValue
      ? `${n} track${n === 1 ? '' : 's'} will be ${verb === 'Rename' ? 'renamed' : 'changed'}`
      : '';
    renameApplyBtn.disabled = n === 0;
    renameApplyBtn.textContent = n > 0 ? `${verb} ${n}` : (verb === 'Rename' ? 'Rename' : 'Apply');
  }

  function openRenameModal(){
    if (tracks.length === 0) return;
    renameSelMode = null;
    renameSelTracks = [];
    renameHeaderTitle.textContent = renameDefaults.title;
    renameHeaderText.innerHTML = renameDefaults.text;
    renameModeSelect.value = 'artist';
    renameMatchBy.value = 'title';
    renameFieldSelect.value = 'title';
    renamePosSelect.value = 'end';
    renameKeywordsInput.value = '';
    renameNewNameInput.value = '';
    syncRenameUI();
    renderRenameMatches();
    renameModalOverlay.classList.add('open');
    requestAnimationFrame(() => renameKeywordsInput.focus());
  }

  // Selection mode: rename the picked tracks (mode is 'artist' or 'title').
  function openRenameSelection(mode){
    const list = selectedInViewOrder();
    if (list.length === 0) return;
    renameSelMode = mode;
    renameSelTracks = list;
    syncRenameUI();
    if (mode === 'artist'){
      renameHeaderTitle.textContent = 'Rename artist';
      renameHeaderText.textContent = 'Set the artist for every selected track.';
      renameNewNameInput.value = '';
    } else {
      renameHeaderTitle.textContent = 'Rename tracks';
      renameHeaderText.textContent = 'Rename every selected track.';
      renameNewNameInput.value = '{title}';
    }
    renderRenameMatches();
    renameModalOverlay.classList.add('open');
    requestAnimationFrame(() => renameNewNameInput.focus());
  }

  function closeRenameModal(){
    renameModalOverlay.classList.remove('open');
  }

  // On phones the on-screen keyboard covers the bottom of the page without resizing it, so this fixed, centred dialog ended up
  // behind the keyboard. Size the overlay to the visible area (visualViewport) while it is open, so the dialog sits above the keyboard
  // and the focused field is scrolled into view.
  (function(){
    const vv = window.visualViewport;
    if (!vv) return;
    const fit = () => {
      if (!renameModalOverlay.classList.contains('open')) return;
      renameModalOverlay.style.top = vv.offsetTop + 'px';
      renameModalOverlay.style.bottom = 'auto';
      renameModalOverlay.style.height = vv.height + 'px';
      renameModalOverlay.style.setProperty('--vv-h', vv.height + 'px');
      const a = document.activeElement;
      if (a && renameModalOverlay.contains(a) && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName)) a.scrollIntoView({ block:'nearest' });
    };
    const clear = () => {
      renameModalOverlay.style.top = ''; renameModalOverlay.style.bottom = ''; renameModalOverlay.style.height = '';
      renameModalOverlay.style.removeProperty('--vv-h');
    };
    vv.addEventListener('resize', fit);
    vv.addEventListener('scroll', fit);
    renameModalOverlay.addEventListener('focusin', () => { setTimeout(fit, 120); setTimeout(fit, 350); });   // again after the keyboard finishes sliding up
    new MutationObserver(() => { renameModalOverlay.classList.contains('open') ? fit() : clear(); })
      .observe(renameModalOverlay, { attributes:true, attributeFilter:['class'] });
  })();

  renameArtistsBtn.addEventListener('click', openRenameModal);
  renameCancelBtn.addEventListener('click', closeRenameModal);
  renameModalOverlay.addEventListener('click', (e) => {
    if (e.target === renameModalOverlay) closeRenameModal();
  });
  renameModeSelect.addEventListener('change', () => {
    renameNewNameInput.value = renameModeSelect.value === 'title' ? '{title}' : '';
    syncRenameUI();
    renderRenameMatches();
  });
  renameMatchBy.addEventListener('change', () => { syncRenameUI(); renderRenameMatches(); });
  [renameFieldSelect, renamePosSelect].forEach(el => el.addEventListener('change', renderRenameMatches));
  renameKeywordsInput.addEventListener('input', renderRenameMatches);
  renameNewNameInput.addEventListener('input', renderRenameMatches);

  renameApplyBtn.addEventListener('click', () => {
    const { changes } = collectRenameChanges();
    if (changes.length === 0) return;
    changes.forEach(c => { c.t[c.field] = c.val; });
    saveLibraryMeta();
    renderPlaylist();
    const cur = currentIndex !== -1 ? tracks[currentIndex] : null;
    if (cur && changes.some(c => c.t === cur)){
      npTitleTrack.textContent = cur.title;
      npArtist.textContent = cur.artist;
      document.title = `${cur.title} · Player`;
      requestAnimationFrame(() => setupMarquee(npTitle));
      updateMediaSession();
    }
    const fromSelection = !!renameSelMode;
    closeRenameModal();
    if (fromSelection) exitSelectMode();
  });

  const HEADPHONE_ICON_SVG = '<svg class="sort-tile-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M3 14v-3a9 9 0 0 1 18 0v3"/><path d="M21 14v4a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3z"/><path d="M3 14v4a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3z"/></svg>';

  function tileMediaHtml(t){
    return t.artUrl
      ? `<img src="${t.artUrl}" alt="">`
      : HEADPHONE_ICON_SVG;
  }

  function renderSortPool(){
    sortPoolEl.innerHTML = '';
    sortModalTrackIndices.forEach((i) => {
      const t = tracks[i];
      const wrap = document.createElement('div');
      wrap.className = 'sort-tile-wrap';
      const item = document.createElement('div');
      item.className = 'sort-tile';
      item.innerHTML = `${tileMediaHtml(t)}`;
      // The top row is a fixed source list: it never changes when tracks are
      // removed from the result below. Clicking adds a track to the result
      // (ignored if it's already there, so no duplicates).
      item.addEventListener('click', () => {
        if (sortOrder.includes(i)) return;
        sortOrder.push(i);
        renderSortResult();
      });
      const label = document.createElement('div');
      label.className = 'sort-tile-title marquee';
      label.innerHTML = `<span class="marquee-track">${escapeHtml(t.title)}</span>`;
      wrap.appendChild(item);
      wrap.appendChild(label);
      sortPoolEl.appendChild(wrap);
    });
    requestAnimationFrame(() => {
      sortPoolEl.querySelectorAll('.marquee').forEach(setupMarquee);
    });
  }

  function renderSortResult(){
    sortResultEl.innerHTML = '';
    if (sortOrder.length === 0){
      sortResultEl.appendChild(sortResultEmpty);
      sortApplyBtn.disabled = true;
      return;
    }
    sortOrder.forEach((trackIdx, pos) => {
      const t = tracks[trackIdx];
      const wrap = document.createElement('div');
      wrap.className = 'sort-result-wrap';
      const tile = document.createElement('div');
      tile.className = 'sort-result-tile';
      tile.innerHTML = `
        ${tileMediaHtml(t)}
        <span class="sort-result-num">${pos+1}</span>
        <span class="sort-result-remove" title="Remove">&times;</span>
      `;
      tile.querySelector('.sort-result-remove').addEventListener('click', (ev) => {
        ev.stopPropagation();
        sortOrder.splice(pos, 1);
        renderSortResult();
      });
      const label = document.createElement('div');
      label.className = 'sort-tile-title marquee';
      label.innerHTML = `<span class="marquee-track">${escapeHtml(t.title)}</span>`;
      wrap.appendChild(tile);
      wrap.appendChild(label);
      sortResultEl.appendChild(wrap);
    });
    sortApplyBtn.disabled = sortOrder.length !== sortModalTrackIndices.length;
    requestAnimationFrame(() => {
      sortResultEl.querySelectorAll('.marquee').forEach(setupMarquee);
    });
  }

  sortResetBtn.addEventListener('click', () => {
    sortOrder = orderIndicesForPlaylist(sortModalTrackIndices, sortModalScope);
    renderSortPool();
    renderSortResult();
  });
  sortCancelBtn.addEventListener('click', closeSortModal);
  sortModalOverlay.addEventListener('click', (e) => {
    if (e.target === sortModalOverlay) closeSortModal();
  });
  sortApplyBtn.addEventListener('click', () => {
    if (sortOrder.length !== sortModalTrackIndices.length) return;
    if (sortModalScope){
      sortModalScope.order = sortOrder.map(i => tracks[i].dbId);
      savePlaylists();
      delete sortViews[sortModalScope.id];
      saveSortViews();
      renderPlaylist();
      closeSortModal();
      return;
    }
    const currentTrack = currentIndex !== -1 ? tracks[currentIndex] : null;
    const queuedTracks = playQueue.map(i => tracks[i]);
    const shuffledTracks = shuffleOrder.map(i => tracks[i]);
    tracks = sortOrder.map(i => tracks[i]);
    if (currentTrack) currentIndex = tracks.indexOf(currentTrack);
    playQueue = queuedTracks.map(t => tracks.indexOf(t)).filter(i => i !== -1);
    shuffleOrder = shuffledTracks.map(t => tracks.indexOf(t)).filter(i => i !== -1);
    delete sortViews['__all__'];
    saveSortViews();
    saveLibraryMeta();
    renderPlaylist();
    closeSortModal();
  });

