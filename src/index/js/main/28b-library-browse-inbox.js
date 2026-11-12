  // ================= Library: browse by album / artist / genre / folder =================
  // State is declared with var and read through functions: renderPlaylist can run before this part of the file does.
  var ppBrowse = null, ppBrowseScroll = 0;
  function ppBrowseState(){
    if (!ppBrowse){
      let m = 'songs'; try { m = localStorage.getItem('ppBrowseMode') || 'songs'; } catch(e){}
      ppBrowse = { mode: ['songs', 'albums', 'artists', 'genres', 'folders'].includes(m) ? m : 'songs', key: null, name: '' };
    }
    return ppBrowse;
  }
  // The browse state when a grouped view applies to the list being shown, otherwise null (plain song list).
  function ppBrowseActive(stemsView){
    const b = ppBrowseState();
    return (detailedPlaylistMode && !stemsView && b.mode !== 'songs') ? b : null;
  }
  function ppTrackFolder(t){
    if (t.folder) return t.folder;
    const u = t.nativeUri || '';
    if (/^content:/.test(u)){
      const m = /\/document\/([^/?#]+)$/.exec(u);
      if (m){
        try {
          const id = decodeURIComponent(m[1]), p = id.slice(id.indexOf(':') + 1), i = p.lastIndexOf('/');
          return i > 0 ? p.slice(0, i) : 'Storage root';
        } catch(e){}
      }
      return '';
    }
    if (/^file:/.test(u)) return 'Saved in Press Play';
    if (t.remoteUrl) return 'Web streams';
    return '';
  }
  // The groups a track belongs to in a mode, as [key, name] pairs. Empty: the track is left out of that view.
  function ppGroupsOf(t, mode){
    if (mode === 'folders'){
      const f = ppTrackFolder(t);
      return [[f.toLowerCase(), f ? f.split('/').filter(Boolean).pop() : 'Other']];
    }
    if (t.kind !== 'audio') return [];
    if (mode === 'albums'){ const a = (t.album || '').trim(); return [[a.toLowerCase(), a || 'Unknown album']]; }
    if (mode === 'artists'){ const a = (t.artist || '').trim(); return [[a.toLowerCase(), a || 'Unknown artist']]; }
    const gs = String(t.genre || '').split(';').map(x => x.trim()).filter(Boolean);
    return gs.length ? gs.map(g => [g.toLowerCase(), g]) : [['', 'Unknown genre']];
  }
  function ppInGroup(t, mode, key){ return ppGroupsOf(t, mode).some(g => g[0] === key); }
  function ppAlbumOrder(a, b){
    return ((a.disc || 1) - (b.disc || 1)) || ((a.trackNo || 9999) - (b.trackNo || 9999));
  }
  function ppBuildGroups(indices, mode){
    const map = new Map();
    indices.forEach(i => {
      const t = tracks[i];
      ppGroupsOf(t, mode).forEach(([key, name]) => {
        let g = map.get(key);
        if (!g){ g = { key, name, count: 0, art: null, artists: new Set(), albums: new Set(), path: '' }; map.set(key, g); }
        g.count++;
        if (!g.art && t.artUrl) g.art = t.artUrl;
        if (t.artist) g.artists.add(t.artist);
        if (t.album) g.albums.add(t.album.toLowerCase());
        if (mode === 'folders' && !g.path) g.path = ppTrackFolder(t);
      });
    });
    const n = (c, w) => c + ' ' + w + (c === 1 ? '' : 's');
    const out = [...map.values()];
    out.forEach(g => {
      g.sub = mode === 'albums' ? ((g.artists.size === 1 ? [...g.artists][0] : 'Various artists') + ' · ' + n(g.count, 'song'))
        : mode === 'artists' ? (n(g.count, 'song') + (g.albums.size ? ' · ' + n(g.albums.size, 'album') : ''))
        : mode === 'folders' ? (n(g.count, 'file') + (g.path && g.path !== g.name ? ' · ' + g.path : ''))
        : n(g.count, 'song');
    });
    out.sort((a, b) => (!a.key - !b.key) || a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
    return out;
  }
  function ppSyncBrowseRow(stemsView){
    const row = document.getElementById('browse-row');
    if (!row) return;
    const b = ppBrowseState();
    row.classList.toggle('active', detailedPlaylistMode && !stemsView && tracks.some(t => !t.stem));
    row.querySelectorAll('button').forEach(x => {
      const on = x.dataset.browse === b.mode;
      x.classList.toggle('active', on); x.setAttribute('aria-selected', on ? 'true' : 'false');
    });
  }
  function ppRenderGroups(indices, mode){
    const words = { albums: 'album', artists: 'artist', genres: 'genre', folders: 'folder' }[mode];
    let groups = ppBuildGroups(indices, mode);
    const total = groups.length;
    if (trackSearchQuery){
      const ws = trackSearchQuery.split(/\s+/);
      groups = groups.filter(g => { const hay = (g.name + ' ' + g.sub).toLowerCase(); return ws.every(w => hay.includes(w)); });
    }
    trackCount.textContent = (trackSearchQuery ? groups.length + ' of ' : '') + total + ' ' + words + (total === 1 ? '' : 's');
    if (!groups.length){
      const empty = document.createElement('div');
      empty.className = 'playlist-filter-empty';
      empty.textContent = trackSearchQuery ? 'No ' + words + 's match “' + trackSearchInput.value.trim() + '”.'
        : mode === 'folders' ? 'Nothing here yet.' : 'No songs here yet.';
      playlistEl.appendChild(empty);
      return;
    }
    const wrap = document.createElement('div');
    wrap.className = 'lib-groups' + (mode === 'albums' ? ' grid' : '');
    const icon = { albums: '💿', artists: '🎤', genres: '🎵', folders: '📁' }[mode];
    groups.forEach(g => {
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'lib-group';
      b.innerHTML = '<span class="lib-group-art' + (mode === 'artists' ? ' round' : '') + '">' +
        (g.art && mode !== 'folders' && mode !== 'genres' ? '<img src="' + g.art + '" alt="" loading="lazy">' : icon) + '</span>' +
        '<span class="lib-group-text"><span class="lib-group-name" style="display:block">' + escapeHtml(g.name) +
        '</span><span class="lib-group-sub" style="display:block">' + escapeHtml(g.sub) + '</span></span>';
      b.addEventListener('click', () => ppOpenGroup(g.key, g.name));
      wrap.appendChild(b);
    });
    playlistEl.appendChild(wrap);
    if (ppBrowseScroll){ playlistEl.scrollTop = ppBrowseScroll; ppBrowseScroll = 0; }
  }
  function ppOpenGroup(key, name){
    const b = ppBrowseState();
    ppBrowseScroll = playlistEl.scrollTop;
    b.key = key; b.name = name;
    try { history.pushState({ ppBrowse: 1 }, ''); } catch(e){}
    if (trackSearchQuery){ trackSearchInput.value = ''; trackSearchQuery = ''; }
    renderPlaylist();
    playlistEl.scrollTop = 0;
  }
  function ppCloseGroup(){
    if (history.state && history.state.ppBrowse){ history.back(); return; }   // popstate does the rest
    const b = ppBrowseState();
    if (b.key == null) return;
    b.key = null; renderPlaylist();
  }
  window.addEventListener('popstate', () => {
    const b = ppBrowseState();
    if (b.key != null && !(history.state && history.state.ppBrowse)){ if (selectMode) exitSelectMode(); b.key = null; renderPlaylist(); }
  });
  function ppGroupHeader(b, ctx){
    const head = document.createElement('div');
    head.className = 'lib-group-head';
    let secs = 0; ctx.forEach(i => { secs += tracks[i].duration || 0; });
    const mins = Math.round(secs / 60);
    head.innerHTML = '<button type="button" class="lib-back" aria-label="Back"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg></button>' +
      '<div class="lib-group-text"><div class="lib-group-name">' + escapeHtml(b.name) + '</div><div class="lib-group-sub">' +
      ctx.length + (b.mode === 'folders' ? ' file' : ' song') + (ctx.length === 1 ? '' : 's') +
      (mins ? ' · ' + (mins >= 60 ? Math.floor(mins / 60) + ' h ' + (mins % 60) + ' min' : mins + ' min') : '') + '</div></div>' +
      '<button type="button" class="lib-shuffle" aria-label="Shuffle"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 3h5v5"/><path d="M4 20L21 3"/><path d="M21 16v5h-5"/><path d="M15 15l6 6"/><path d="M4 4l5 5"/></svg></button>' +
      '<button type="button" class="lib-play">Play</button>';
    head.querySelector('.lib-back').addEventListener('click', ppCloseGroup);
    const start = (shuffle) => {
      if (!ctx.length) return;
      playQueue = ctx.slice();
      if (shuffle !== shuffleOn) shuffleBtn.click();
      shuffleOrder = [];
      loadTrack(shuffle ? ctx[Math.floor(Math.random() * ctx.length)] : ctx[0], true);
    };
    head.querySelector('.lib-play').addEventListener('click', () => start(false));
    head.querySelector('.lib-shuffle').addEventListener('click', () => start(true));
    return head;
  }
  { const row = document.getElementById('browse-row');
    if (row) row.addEventListener('click', (e) => {
      const btn = e.target.closest('button[data-browse]');
      if (!btn) return;
      const b = ppBrowseState();
      if (selectMode) exitSelectMode();
      const hadGroup = b.key != null;
      b.mode = btn.dataset.browse; b.key = null; ppBrowseScroll = 0;
      try { localStorage.setItem('ppBrowseMode', b.mode); } catch(e){}
      if (hadGroup && history.state && history.state.ppBrowse){ try { history.back(); } catch(e){} }
      renderPlaylist();
      playlistEl.scrollTop = 0;
    });
  }

  // ================= New on this phone: what rescans find waits here, in bundles =================
  // Rescans never add to the library on their own. Each find is kept here (not in `tracks`), sorted into a bundle
  // by what it looks like, until the owner adds or dismisses it.
  var ppFound = null, ppInboxScans = 0, ppAutoScanP = null, ppAutoScanAt = 0, ppAutoScanTimer = 0, ppFoundOpen = null;
  function ppFoundList(){
    if (!ppFound){ try { ppFound = JSON.parse(localStorage.getItem('ppFoundV1')) || []; } catch(e){ ppFound = []; } }
    return ppFound;
  }
  function ppFoundSave(){
    try { localStorage.setItem('ppFoundV1', JSON.stringify(ppFoundList())); } catch(e){ /* storage full or unavailable */ }
    ppFoundSync();
  }
  // Files the owner removed from the library or dismissed: rescans leave these alone. Scan phone brings them back.
  function ppIgnoredUris(){ try { return JSON.parse(localStorage.getItem('ppIgnoredUris')) || []; } catch(e){ return []; } }
  function ppIgnoreUris(uris){
    uris = (uris || []).filter(u => /^content:/.test(u || ''));
    if (!uris.length) return;
    const l = ppIgnoredUris(), have = new Set(l);
    uris.forEach(u => { if (!have.has(u)){ have.add(u); l.push(u); } });
    try { localStorage.setItem('ppIgnoredUris', JSON.stringify(l.slice(-4000))); } catch(e){}
  }
  function ppFoundAdd(entries){
    const l = ppFoundList(), have = new Set(l.map(e => e.uri));
    tracks.forEach(t => { if (t.nativeUri) have.add(t.nativeUri); });
    let added = 0;
    for (const e of (entries || [])){
      if (!e || !e.uri || have.has(e.uri) || l.length >= 2500) continue;
      have.add(e.uri);
      const o = {};
      ['uri', 'name', 'kind', 'ext', 'title', 'artist', 'album', 'durationSec', 'artPath', 'size', 'width', 'height', 'genre', 'track', 'disc', 'year', 'folder']
        .forEach(k => { if (e[k] != null && e[k] !== '') o[k] = e[k]; });
      if (e.sidecars && e.sidecars.length) o.sidecars = e.sidecars;
      l.push(o); added++;
    }
    if (added) ppFoundSave();
  }
  // Drop finds that have since reached the library some other way, and un-ignore anything that is back in it.
  function ppFoundPrune(){
    const lib = new Set(tracks.map(t => t.nativeUri).filter(Boolean));
    const l = ppFoundList(), kept = l.filter(e => !lib.has(e.uri));
    if (kept.length !== l.length){ ppFound = kept; ppFoundSave(); }
    const ig = ppIgnoredUris(), ig2 = ig.filter(u => !lib.has(u));
    if (ig2.length !== ig.length){ try { localStorage.setItem('ppIgnoredUris', JSON.stringify(ig2)); } catch(e){} }
  }
  // What a file most likely is, from where it sits, what it is called, how long it runs and its tags. Only a guess.
  function ppGuessKind(e){
    const f = String(e.folder || '').toLowerCase(), n = String(e.name || '').toLowerCase(), d = +e.durationSec || 0, g = String(e.genre || '').toLowerCase();
    if (e.kind === 'video'){
      if (/screen[ _-]?(record|capture|cast)/.test(f + ' ' + n)) return 'screen';
      if (/(^|\/)(dcim|camera)(\/|$)/.test(f)) return 'camera';
      if (/whatsapp|telegram|signal|messenger|snapchat|instagram|tiktok|facebook|twitter|discord/.test(f)) return 'social';
      if (d >= 1200) return 'movie';
      if (d && d < 60) return 'clip';
      return 'video';
    }
    if (/whatsapp|telegram|signal|voice[ _-]?(rec|note|memo|message)|(^|\/)recordings?(\/|$)|call[ _-]?rec|sound[ _-]?rec/.test(f) || /^(aud|ptt|rec|recording|voice)[-_ ]?\d/.test(n)) return 'voice';
    if (/audio ?book/.test(f + ' ' + g)) return 'audiobook';
    if (/podcast/.test(f + ' ' + g)) return 'podcast';
    if (d >= 1500) return 'long';
    if (d && d < 30 && !e.artist && !e.album) return 'sound';
    return 'music';
  }
  function ppFoundBundles(){
    const LABEL = { songs: 'Songs', voice: 'Voice messages and recordings', podcast: 'Podcasts', audiobook: 'Audiobooks', long: 'Long audio (mixes, talks)',
      sound: 'Short sounds', movie: 'Movies and shows', video: 'Videos', clip: 'Short clips', camera: 'Camera videos', screen: 'Screen recordings',
      social: 'Videos from chat and social apps' };
    const ORDER = ['album', 'songs', 'podcast', 'audiobook', 'long', 'movie', 'video', 'clip', 'camera', 'screen', 'social', 'voice', 'sound'];
    const list = ppFoundList(), kinds = new Map(), albumN = new Map();
    list.forEach(e => {
      const k = ppGuessKind(e); kinds.set(e, k);
      if (k === 'music' && e.album){ const a = e.album.trim().toLowerCase(); albumN.set(a, (albumN.get(a) || 0) + 1); }
    });
    const map = new Map();
    list.forEach(e => {
      let type = kinds.get(e), id = type, name = LABEL[type];
      if (type === 'music'){
        const a = (e.album || '').trim();
        if (a && albumN.get(a.toLowerCase()) >= 2){ type = 'album'; id = 'album:' + a.toLowerCase(); name = 'Album: ' + a; }
        else { type = id = 'songs'; name = LABEL.songs; }
      }
      let b = map.get(id);
      if (!b){ b = { id, type, name, items: [] }; map.set(id, b); }
      b.items.push(e);
    });
    const out = [...map.values()];
    out.forEach(b => {
      if (b.type === 'album') b.items.sort((x, y) => ((x.disc || 1) - (y.disc || 1)) || ((x.track || 9999) - (y.track || 9999)));
      const artists = new Set(b.items.map(e => e.artist).filter(Boolean)), folders = new Set(b.items.map(e => e.folder).filter(Boolean));
      const word = b.items[0].kind === 'video' ? 'video' : (b.type === 'album' || b.type === 'songs') ? 'song' : 'file';
      b.sub = b.items.length + ' ' + word + (b.items.length === 1 ? '' : 's') +
        (b.type === 'album' ? ' · ' + (artists.size === 1 ? [...artists][0] : artists.size ? 'Various artists' : 'Unknown artist') : '') +
        (folders.size === 1 ? ' · ' + [...folders][0] : '');
    });
    out.sort((a, b) => (ORDER.indexOf(a.type) - ORDER.indexOf(b.type)) || a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
    return out;
  }
  function ppFoundSync(){
    const n = ppFoundList().length, row = document.getElementById('found-row'), cnt = document.getElementById('found-row-count');
    if (row) row.hidden = n === 0;
    if (cnt) cnt.textContent = n;
    const ov = document.getElementById('found-overlay');
    if (ov && ov.classList.contains('open')) ppFoundRender();
  }
  // Move finds into the library (not into any playlist), or dismiss them so rescans stop offering them.
  function ppFoundTake(items, add){
    const set = new Set(items.map(e => e.uri));
    ppFound = ppFoundList().filter(e => !set.has(e.uri));
    if (add) ppAddNative(items, 'inbox'); else ppIgnoreUris([...set]);
    ppFoundSave();
    if (!ppFoundList().length) ppFoundClose();
  }
  function ppFoundRender(){
    const body = document.getElementById('found-body');
    if (!body) return;
    const keep = body.scrollTop;
    body.innerHTML = '';
    const bundles = ppFoundBundles();
    if (!bundles.length){ body.innerHTML = '<div class="found-empty">Nothing new right now.</div>'; return; }
    bundles.forEach(b => {
      const el = document.createElement('div');
      el.className = 'found-bundle' + (ppFoundOpen === b.id ? ' open' : '');
      const art = b.items.find(e => e.artPath);
      const artSrc = art && window.PPNative && PPNative.lib && PPNative.lib.fileSrc ? PPNative.lib.fileSrc(art.artPath) : '';
      el.innerHTML = '<div class="found-bundle-head" role="button" tabindex="0" aria-expanded="' + (ppFoundOpen === b.id) + '"><span class="found-caret">▶</span>' +
        '<span class="lib-group-art">' + (artSrc ? '<img src="' + artSrc + '" alt="" loading="lazy">' : (b.items[0].kind === 'video' ? '🎬' : b.type === 'album' ? '💿' : '🎵')) + '</span>' +
        '<div class="lib-group-text"><div class="lib-group-name">' + escapeHtml(b.name) + '</div><div class="lib-group-sub">' + escapeHtml(b.sub) + '</div></div>' +
        '<button type="button" class="found-add">Add</button><button type="button" class="found-skip" aria-label="Dismiss this bundle">✕</button></div>' +
        '<div class="found-items"></div>';
      const head = el.querySelector('.found-bundle-head');
      head.addEventListener('click', (ev) => {
        if (ev.target.closest('button')) return;
        ppFoundOpen = ppFoundOpen === b.id ? null : b.id; ppFoundRender();
      });
      el.querySelector('.found-add').addEventListener('click', () => {
        ppFoundTake(b.items, true);
        showToast('Added ' + b.items.length + ' to your library');
      });
      el.querySelector('.found-skip').addEventListener('click', () => ppFoundTake(b.items, false));
      if (ppFoundOpen === b.id){
        const box = el.querySelector('.found-items');
        b.items.slice(0, 200).forEach(e => {
          const r = document.createElement('div');
          r.className = 'found-item';
          const title = e.title || String(e.name || 'Untitled').replace(/\.[^/.]+$/, '');
          const sub = [e.artist, e.durationSec ? fmtTime(e.durationSec) : '', e.folder].filter(Boolean).join(' · ');
          r.innerHTML = '<div class="lib-group-text"><div class="lib-group-name">' + escapeHtml(title) + '</div><div class="lib-group-sub">' + escapeHtml(sub) + '</div></div>' +
            '<button type="button" class="found-item-add" aria-label="Add to library">+</button><button type="button" class="found-item-skip" aria-label="Dismiss">✕</button>';
          r.querySelector('.found-item-add').addEventListener('click', () => ppFoundTake([e], true));
          r.querySelector('.found-item-skip').addEventListener('click', () => ppFoundTake([e], false));
          box.appendChild(r);
        });
        if (b.items.length > 200){
          const more = document.createElement('div'); more.className = 'found-more';
          more.textContent = 'And ' + (b.items.length - 200) + ' more in this bundle.';
          box.appendChild(more);
        }
      }
      body.appendChild(el);
    });
    body.scrollTop = keep;
  }
  function ppFoundShow(){
    const ov = document.getElementById('found-overlay');
    if (!ov) return;
    ov.classList.add('open'); ppFoundRender();
  }
  function ppFoundClose(){ const ov = document.getElementById('found-overlay'); if (ov) ov.classList.remove('open'); }
  { const on = (id, fn) => { const el = document.getElementById(id); if (el) el.addEventListener('click', fn); };
    on('found-row', ppFoundShow);
    on('found-close', ppFoundClose);
    on('found-overlay', (e) => { if (e.target.id === 'found-overlay') ppFoundClose(); });
    on('found-add-all', () => { const all = ppFoundList().slice(); if (all.length){ ppFoundTake(all, true); showToast('Added ' + all.length + ' to your library'); } });
    on('found-skip-all', () => { const all = ppFoundList().slice(); if (all.length) ppFoundTake(all, false); });
    const tg = document.getElementById('auto-scan-toggle');
    if (tg){
      tg.checked = ppAutoScanOn();
      tg.addEventListener('change', () => {
        try { localStorage.setItem('ppAutoScan', tg.checked ? '1' : '0'); } catch(e){}
        if (tg.checked) ppAutoScan();
      });
    }
    ppFoundSync();
  }
  function ppAutoScanOn(){ try { return localStorage.getItem('ppAutoScan') !== '0'; } catch(e){ return true; } }
  // Looks through the folders added earlier and, when media access was already given, the whole phone. Never asks for
  // permission and never adds to the library: everything new goes to the inbox above.
  function ppAutoScan(){
    if (!(window.PPNative && PPNative.enabled && PPNative.lib && PPNative.lib.scanDevice) || !ppAutoScanOn()) return Promise.resolve();
    if (ppAutoScanP) return ppAutoScanP;
    ppAutoScanP = (async () => {
      const before = ppFoundList().length;
      const known = () => tracks.map(t => t.nativeUri).filter(Boolean).concat(ppFoundList().map(e => e.uri), ppIgnoredUris());
      ppInboxScans++;
      try {
        let l = []; try { l = JSON.parse(localStorage.getItem(PP_FOLDERS_KEY) || '[]'); } catch(e){}
        for (const tree of l){ try { await PPNative.lib.rescan(tree, known()); } catch(e){} }
        if (ppFoundList().length < 2500){
          const a = await PPNative.lib.mediaAccess();
          if (a && (a.audio || a.video)) await PPNative.lib.scanDevice(known(), true);
        }
        await new Promise(r => setTimeout(r, 400));   // let the last batch of finds arrive
      } catch(e){}
      finally { ppInboxScans--; ppAutoScanAt = Date.now(); ppAutoScanP = null; }
      const n = ppFoundList().length - before;
      if (n > 0) showToast(n + ' new file' + (n === 1 ? '' : 's') + ' on this phone. See New on this phone in the Library.');
    })();
    return ppAutoScanP;
  }
  function ppAutoScanSoon(ms){ clearTimeout(ppAutoScanTimer); ppAutoScanTimer = setTimeout(ppAutoScan, ms); }
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && Date.now() - ppAutoScanAt > 10 * 60 * 1000) ppAutoScanSoon(1500);
  });
  // Tracks added before folders, genres and track numbers were read: fetch those once, in the background.
  async function ppBackfillDetails(){
    if (!(window.PPNative && PPNative.enabled && PPNative.lib && PPNative.lib.mediaDetails)) return;
    const todo = tracks.filter(t => t.nativeUri && !t.mdv && /^content:/.test(t.nativeUri));
    for (let i = 0; i < todo.length; i += 150){
      const chunk = todo.slice(i, i + 150);
      let r; try { r = await PPNative.lib.mediaDetails(chunk.map(t => t.nativeUri)); } catch(e){ return; }
      const by = new Map(((r && r.items) || []).map(o => [o.uri, o]));
      chunk.forEach(t => {
        const o = by.get(t.nativeUri); if (!o) return;
        if (!t.album && o.album) t.album = o.album;
        if (o.genre) t.genre = o.genre;
        if (o.track) t.trackNo = o.track;
        if (o.disc) t.disc = o.disc;
        if (o.year) t.year = o.year;
        if (o.folder) t.folder = o.folder;
        t.mdv = 1;
      });
      saveLibraryMeta();
    }
    if (todo.length && ppBrowseState().mode !== 'songs') renderPlaylist();
  }
