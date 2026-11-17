  // =====================================================================
  // Extras: M3U export/import, bookmarks, LRC lyrics, ReplayGain, Open URL,
  // chapters. Everything below is self-contained and hooks into the player
  // through ppOnTrackLoaded / rgFactor / ppApplyCors (called from loadTrack
  // and the audio graph).
  // =====================================================================
  const PP_BM_KEY = 'playerBookmarksV1', PP_LRC_KEY = 'playerLyricsV1', PP_RG_KEY = 'playerReplayGainOn';
  const ppJson = (k) => { try { return JSON.parse(localStorage.getItem(k)) || {}; } catch(e){ return {}; } };
  const ppSave = (k, o) => { try { localStorage.setItem(k, JSON.stringify(o)); } catch(e){} };
  const ppEl = (id) => document.getElementById(id);
  const ppToast = (m) => { try { showToast(m); } catch(e){} };
  var rgEnabled = localStorage.getItem(PP_RG_KEY) !== '0';
  var ppLrc = [], ppLrcText = '', ppLrcIdx = -1, ppLrcRaf = 0;

  // ----- ReplayGain -----
  function rgFactor(){
    const t = (typeof currentIndex === 'number') ? tracks[currentIndex] : null;
    return (rgEnabled && t && t.rgGain) ? t.rgGain : 1;
  }
  async function ppLoadReplayGain(t){
    if (t.rgDone || t.remoteUrl) return;
    t.rgDone = true;
    try {
      const blob = await (await fetch(t.url)).blob();
      const dec = new TextDecoder('latin1');
      const head = dec.decode(await blob.slice(0, 4194304).arrayBuffer());
      const tail = blob.size > 4194304 ? dec.decode(await blob.slice(Math.max(0, blob.size - 262144)).arrayBuffer()) : '';
      const txt = (head + tail).replace(/\0/g, '');
      const num = (k) => { const m = txt.match(new RegExp(k + '[^\\d+-]{0,14}([-+]?\\d+(?:\\.\\d+)?)', 'i')); return m ? parseFloat(m[1]) : null; };
      let gain = num('replaygain_track_gain');
      if (gain == null) gain = num('replaygain_album_gain');
      const peak = num('replaygain_track_peak');
      if (gain != null && isFinite(gain)){
        let lin = Math.pow(10, gain / 20);
        if (peak > 0) lin = Math.min(lin, 1 / peak);   // never push a known peak past full scale
        t.rgGain = lin;
        if (tracks[currentIndex] === t) applyTrackBoostToCurrentGraph();
      }
    } catch(e){ /* unreadable: leave the track untouched */ }
  }
  ppEl('rg-toggle').checked = rgEnabled;
  ppEl('rg-toggle').addEventListener('change', (e) => {
    rgEnabled = e.target.checked;
    try { localStorage.setItem(PP_RG_KEY, rgEnabled ? '1' : '0'); } catch(err){}
    const t = tracks[currentIndex];
    if (rgEnabled && t && !t.rgDone) ppLoadReplayGain(t); else if (currentIndex !== -1) applyTrackBoostToCurrentGraph();
  });

  // ----- Open URL -----
  function ppApplyCors(el, t){
    // Streams need CORS for the EQ/FX chain (Web Audio outputs silence for
    // cross-origin media without it), so ask for it up front.
    if (t.remoteUrl) el.crossOrigin = 'anonymous'; else el.removeAttribute('crossorigin');
  }
  // Web links, streams (HLS, DASH, RTSP, RTMP, MMS...) and network-share files (SMB, FTP, SFTP, NFS) all become
  // "remote" tracks. ExoPlayer plays what it can; the VLC engine takes the rest (see 29b).
  const PP_REMOTE_SCHEMES = /^(https?|rtsps?|rtmps?|mms|mmsh|smb|ftps?|sftp|nfs|udp|rtp|srt|upnp):$/i;
  const PP_VIDEO_EXT = /^(mp4|webm|mov|m4v|ogv|mkv|avi|wmv|asf|flv|f4v|mpg|mpeg|m2v|ts|m2ts|mts|vob|3gp|3g2|rm|rmvb|divx|xvid|ogm|mxf|dv|wtv|iso|mpd|ism|m3u8)$/;
  function ppAddRemote(href, title, kindHint){
    let u; try { u = new URL(href); } catch(e){ return -1; }
    if (!PP_REMOTE_SCHEMES.test(u.protocol)) return -1;
    let name = u.hostname;
    try { name = decodeURIComponent(u.pathname.split('/').filter(Boolean).pop() || u.hostname); } catch(e){}
    if (/\/manifest$/i.test(u.pathname)) name = u.hostname + ' (Smooth Streaming)';
    const ext = ((name.match(/\.([a-z0-9]+)$/i) || [,''])[1] || '').toLowerCase();
    // Live camera / TV protocols carry video; for a bare HLS/DASH link video is the better guess (it still plays sound).
    const kind = kindHint || (PP_VIDEO_EXT.test(ext) || /^(rtsps?|rtmps?|mms|mmsh|udp|rtp|srt):$/i.test(u.protocol) ? 'video' : 'audio');
    const track = {
      dbId: 'u_' + Date.now() + '_' + Math.random().toString(36).slice(2, 9),
      url: u.href, remoteUrl: u.href, kind, ext: ext || (kind === 'video' ? 'mp4' : 'mp3'),
      title: (title || name.replace(/\.[^/.]+$/, '')), artist: 'Stream', duration: null,
      artUrl: null, artDbId: null, size: null, width: null, height: null, fileName: name,
      playlistIds: userPlaylistViewId() ? [userPlaylistViewId()] : []
    };
    tracks.push(track);
    if (kind === 'audio' && /^https?:$/.test(u.protocol)) probeAudioDuration(track).then(() => { saveLibraryMeta(); renderPlaylist(); }).catch(() => {});
    return tracks.length - 1;
  }
  function ppOpenUrl(){
    const href = (prompt('Paste a link to a file or stream: http(s), HLS (.m3u8), DASH (.mpd), rtsp, rtmp, mms, or a share (smb, ftp, sftp, nfs):') || '').trim();
    if (!href) return;
    const idx = ppAddRemote(href);
    if (idx < 0){ ppToast("That doesn't look like a link Press Play can open."); return; }
    saveLibraryMeta(); renderPlaylist(); renderPlaylistViewSelect(); renderPlaylistsManager();
    loadTrack(idx, true);
  }
  function ppStreamError(e){
    if (ppVlcOnWebError(e)) return;          // the VLC engine is taking it over (29b)
    const t = tracks[currentIndex];
    if (t && t.remoteUrl && e.target === media())
      ppToast("Couldn't play this link. It may not be a direct media file, or the server doesn't allow cross-origin audio (needed for the EQ and effects).");
  }
  audioEl.addEventListener('error', ppStreamError);
  videoEl.addEventListener('error', ppStreamError);

  // ----- M3U export / import -----
  function ppExportM3U(){
    let idxs = tracks.map((_, i) => i).filter(i => !tracks[i].stem), name = 'All tracks';
    if (activePlaylistView === STEMS_VIEW){ idxs = tracks.map((_, i) => i).filter(i => tracks[i].stem); name = 'Split tracks'; }
    else if (detailedPlaylistMode && activePlaylistView !== '__all__'){
      const pl = playlists.find(p => p.id === activePlaylistView);
      if (pl){ idxs = orderIndicesForPlaylist(idxs.filter(i => (tracks[i].playlistIds || []).includes(pl.id)), pl); name = pl.name; }
    }
    if (!idxs.length){ ppToast('Nothing to export yet.'); return; }
    const lines = ['#EXTM3U'];
    idxs.forEach(i => {
      const t = tracks[i], d = Math.round(t.duration || 0);
      const who = (t.artist && !/^(Unknown artist|Video|Stream)$/.test(t.artist)) ? t.artist + ' - ' : '';
      lines.push('#EXTINF:' + (d > 0 ? d : -1) + ',' + who + t.title);
      lines.push(t.remoteUrl || t.fileName || (t.title + '.' + t.ext));
    });
    const blob = new Blob([lines.join('\n') + '\n'], { type: 'audio/x-mpegurl;charset=utf-8' });
    window.ppSaveBlob(blob, name.replace(/[\\/:*?"<>|]+/g, '_') + '.m3u8');
    ppToast('Exported ' + idxs.length + ' track' + (idxs.length === 1 ? '' : 's') + ' to M3U.');
  }
  // ----- Playlist import: M3U / M3U8, PLS, XSPF, and CUE sheets -----
  const ppPlBase = (s) => { s = String(s).replace(/^file:\/\/\/?/i, ''); try { s = decodeURIComponent(s); } catch(e){} return s.split(/[\\/]/).pop().toLowerCase(); };
  const ppPlStripExt = (s) => s.replace(/\.[^.]+$/, '');
  const ppIsLink = (p) => /^[a-z][a-z0-9+.-]*:\/\//i.test(p) && !/^file:/i.test(p);
  /** The library track a playlist line points at (by file name, then by name without extension, then by title). */
  function ppFindByName(p, used){
    const b = ppPlBase(p), nb = ppPlStripExt(b);
    let idx = tracks.findIndex((t, i) => !used.has(i) && !t.cueOf && ((t.fileName || '').toLowerCase() === b || (t.title + '.' + t.ext).toLowerCase() === b));
    if (idx < 0) idx = tracks.findIndex((t, i) => !used.has(i) && !t.cueOf && (ppPlStripExt((t.fileName || '').toLowerCase()) === nb || (t.title || '').toLowerCase() === nb));
    return idx;
  }
  /** [{loc, title}] from the text of an M3U, PLS or XSPF file. */
  function ppParsePlaylist(name, text){
    const out = [];
    if (/\.pls$/i.test(name) || /^\s*\[playlist\]/i.test(text)){
      const files = {}, titles = {};
      text.split(/\r?\n/).forEach(l => {
        let m = /^\s*File(\d+)\s*=\s*(.+?)\s*$/i.exec(l); if (m){ files[m[1]] = m[2]; return; }
        m = /^\s*Title(\d+)\s*=\s*(.+?)\s*$/i.exec(l); if (m) titles[m[1]] = m[2];
      });
      Object.keys(files).sort((a, b) => a - b).forEach(k => out.push({ loc: files[k], title: titles[k] || '' }));
      return out;
    }
    if (/\.xspf$/i.test(name) || /<playlist[^>]+xspf/i.test(text)){
      const doc = new DOMParser().parseFromString(text, 'application/xml');
      doc.querySelectorAll('track').forEach(tr => {
        const loc = tr.querySelector('location'), ti = tr.querySelector('title'), cr = tr.querySelector('creator');
        if (loc && loc.textContent.trim()) out.push({ loc: loc.textContent.trim(), title: ti ? ti.textContent.trim() : '', artist: cr ? cr.textContent.trim() : '' });
      });
      return out;
    }
    let pending = '';
    text.split(/\r?\n/).forEach(raw => {
      const line = raw.trim();
      if (!line) return;
      if (/^#EXTINF:/i.test(line)){ pending = line.replace(/^#EXTINF:[^,]*,?/i, '').trim(); return; }
      if (line[0] === '#') return;
      out.push({ loc: line, title: pending }); pending = '';
    });
    return out;
  }
  async function ppImportPlaylist(file){
    const text = (await file.text()).replace(/^﻿/, '');
    if (/\.cue$/i.test(file.name) || (/^\s*(REM|PERFORMER|TITLE|FILE)\b/im.test(text) && /^\s*TRACK\s+\d+\s+AUDIO/im.test(text))) return ppImportCue(file.name, text);
    const entries = ppParsePlaylist(file.name, text);
    const used = new Set(), matched = [];
    let missing = 0;
    entries.forEach(e => {
      const p = e.loc;
      if (ppIsLink(p)){                     // web radio, streams, network shares
        const ex = tracks.findIndex(t => t.remoteUrl === p);
        const idx = ex >= 0 ? ex : ppAddRemote(p, e.title ? e.title.replace(/^.* - /, '') || e.title : undefined);
        if (idx >= 0 && ex < 0 && e.artist) tracks[idx].artist = e.artist;
        if (idx >= 0 && !used.has(idx)){ used.add(idx); matched.push(idx); } else if (idx < 0) missing++;
        return;
      }
      const idx = ppFindByName(p, used);
      if (idx < 0){ missing++; return; }
      used.add(idx); matched.push(idx);
    });
    if (!matched.length){ ppToast('No tracks in that playlist matched the library. Add the files first, then import again.'); return; }
    ppMakePlaylist(file.name.replace(/\.(m3u8?|pls|xspf|txt)$/i, '') || 'Imported playlist', matched,
      'Imported "%s": ' + matched.length + ' matched' + (missing ? ', ' + missing + ' not found in the library.' : '.'));
  }
  function ppMakePlaylist(name, idxs, msg){
    const tg = ppEl('detailed-mode-toggle');
    if (tg && tg.checked){ tg.checked = false; tg.dispatchEvent(new Event('change', { bubbles: true })); }
    const pl = { id: 'pl_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8), name };
    playlists.push(pl);
    idxs.forEach(i => { const t = tracks[i]; t.playlistIds = t.playlistIds || []; if (!t.playlistIds.includes(pl.id)) t.playlistIds.push(pl.id); });
    pl.order = idxs.map(i => tracks[i].dbId);
    savePlaylists(); saveLibraryMeta();
    renderPlaylistsManager(); renderPlaylistViewSelect();
    const sel = ppEl('playlist-view-select');
    if (sel){ sel.value = pl.id; sel.dispatchEvent(new Event('change', { bubbles: true })); }
    renderPlaylist();
    ppToast(msg.replace('%s', pl.name));
  }

  /**
   * A CUE sheet splits a whole-album file (one big FLAC / APE / WAV) into its songs. Each song becomes its own
   * library track that plays just its stretch of the album file (the native player clips it), with the sheet's titles.
   * The album file must already be in the library.
   */
  async function ppImportCue(name, text){
    const q = (s) => String(s || '').trim().replace(/^"(.*)"$/, '$1');
    const time = (s) => { const m = /(\d+):(\d+):(\d+)/.exec(s || ''); return m ? (+m[1]) * 60 + (+m[2]) + (+m[3]) / 75 : null; };
    const album = { title: '', performer: '', date: '', genre: '' }, files = [];
    let file = null, tr = null;
    text.split(/\r?\n/).forEach(raw => {
      const l = raw.trim(); let m;
      if ((m = /^FILE\s+(.+?)\s+\w+$/i.exec(l)) || (m = /^FILE\s+(.+)$/i.exec(l))){ file = { name: q(m[1]), tracks: [] }; files.push(file); tr = null; return; }
      if ((m = /^TRACK\s+(\d+)\s+(\w+)/i.exec(l))){ tr = file && /AUDIO/i.test(m[2]) ? { no: +m[1], title: '', performer: '', start: null } : null; if (tr) file.tracks.push(tr); return; }
      if ((m = /^TITLE\s+(.+)$/i.exec(l))){ if (tr) tr.title = q(m[1]); else album.title = q(m[1]); return; }
      if ((m = /^PERFORMER\s+(.+)$/i.exec(l))){ if (tr) tr.performer = q(m[1]); else album.performer = q(m[1]); return; }
      if ((m = /^REM\s+DATE\s+(.+)$/i.exec(l))){ album.date = q(m[1]); return; }
      if ((m = /^REM\s+GENRE\s+(.+)$/i.exec(l))){ album.genre = q(m[1]); return; }
      if ((m = /^INDEX\s+01\s+(\S+)/i.exec(l)) && tr) tr.start = time(m[1]);
    });
    const real = files.filter(f => f.tracks.some(t => t.start != null));
    if (!real.length){ ppToast("That CUE sheet has no tracks in it."); return; }
    const used = new Set(), made = [], notFound = [];
    for (const f of real){
      const pi = ppFindByName(f.name, used);
      if (pi < 0){ notFound.push(f.name); continue; }
      const parent = tracks[pi];
      if (!parent.nativeUri && window.PPNative && PPNative.ensureLocal){ try { await PPNative.ensureLocal(parent); } catch(e){} }
      if (!parent.nativeUri){ ppToast('CUE sheets need the Android app (the album file has to be on the phone).'); return; }
      const list = f.tracks.filter(t => t.start != null).sort((a, b) => a.start - b.start);
      list.forEach((t, k) => {
        const end = k + 1 < list.length ? list[k + 1].start : (parent.duration > t.start ? parent.duration : null);
        const dbId = 'cue_' + parent.dbId + '_' + t.no;
        let idx = tracks.findIndex(x => x.dbId === dbId);
        const fields = {
          dbId, cueOf: parent.dbId, cueStart: t.start, cueEnd: end,
          nativeUri: parent.nativeUri.split('#pp-cue=')[0] + '#pp-cue=' + t.no, nativeLocal: false, nativeArt: parent.nativeArt || null,
          url: parent.url, artUrl: parent.artUrl || null, artDbId: null, kind: 'audio', ext: parent.ext, fileName: parent.fileName,
          title: t.title || ('Track ' + t.no), artist: t.performer || album.performer || parent.artist,
          album: album.title || parent.album || '', trackNo: t.no, year: album.date || parent.year || null, genre: album.genre || parent.genre || '',
          duration: end != null ? end - t.start : null, size: null, width: null, height: null, folder: parent.folder || ''
        };
        if (idx >= 0) Object.assign(tracks[idx], fields);
        else { tracks.push(Object.assign({ playlistIds: [] }, fields)); idx = tracks.length - 1; }
        made.push(idx);
      });
    }
    if (!made.length){ ppToast('Add "' + notFound[0] + '" to your library first, then import the CUE sheet again.'); return; }
    ppMakePlaylist(album.title || name.replace(/\.cue$/i, '') || 'Album', made,
      'Split "%s" into ' + made.length + ' tracks' + (notFound.length ? '. Not in the library: ' + notFound.join(', ') : '.'));
  }
  ppEl('m3u-export-btn').addEventListener('click', ppExportM3U);
  ppEl('m3u-import-btn').addEventListener('click', () => ppEl('m3u-input').click());
  ppEl('m3u-input').addEventListener('change', (e) => { const f = e.target.files[0]; e.target.value = ''; if (f) ppImportPlaylist(f); });
  const ppCloseAdd = () => { ppEl('add-dropdown').classList.remove('open'); ppEl('add-btn').classList.remove('open'); };
  ppEl('add-url-btn').addEventListener('click', () => { ppCloseAdd(); ppOpenUrl(); });
  ppEl('add-m3u-btn').addEventListener('click', () => { ppCloseAdd(); ppEl('m3u-input').click(); });

  // ----- Panel shell -----
  const ppPanel = ppEl('extras-panel');
  function ppShowTab(name){
    ppPanel.querySelectorAll('.pp-tabs [data-pt]').forEach(b => b.classList.toggle('active', b.dataset.pt === name));
    ppPanel.querySelectorAll('.pp-pane').forEach(p => p.classList.toggle('active', p.dataset.pp === name));
  }
  ppPanel.querySelectorAll('.pp-tabs [data-pt]').forEach(b => b.addEventListener('click', () => ppShowTab(b.dataset.pt)));
  function ppTogglePanel(force){
    const open = force != null ? force : !ppPanel.classList.contains('open');
    ppPanel.classList.toggle('open', open);
    if (open){ ppRenderBookmarks(); ppRenderChapters(); ppRenderLyricsPane(); }
  }
  ppEl('extras-btn').addEventListener('click', (e) => { e.stopPropagation(); ppTogglePanel(); });
  ppEl('pp-close').addEventListener('click', () => ppTogglePanel(false));
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && ppPanel.classList.contains('open')) ppTogglePanel(false); });
  document.addEventListener('mousedown', (e) => {
    if (ppPanel.classList.contains('open') && !ppPanel.contains(e.target) && !ppEl('extras-btn').contains(e.target)) ppTogglePanel(false);
  });
  const ppSeek = (s) => { const m = media(); if (m && isFinite(s)) m.currentTime = Math.max(0, s); };

  // ----- Bookmarks -----
  const bmGet = (t) => (ppJson(PP_BM_KEY)[t.dbId] || []);
  function bmPut(t, list){
    const o = ppJson(PP_BM_KEY);
    if (list.length) o[t.dbId] = list; else delete o[t.dbId];
    ppSave(PP_BM_KEY, o);
  }
  function ppRenderBookmarks(){
    const box = ppEl('bm-list'), t = tracks[currentIndex];
    ppEl('bm-add').disabled = !t;
    ppEl('bm-now').textContent = fmtTime(media().currentTime || 0);
    if (!t){ box.innerHTML = '<div class="pp-empty">Play a track to add bookmarks.</div>'; return; }
    const list = bmGet(t);
    if (!list.length){ box.innerHTML = '<div class="pp-empty">No bookmarks for this track yet. Tap the button above to save the current position.</div>'; return; }
    box.innerHTML = '';
    list.forEach((b, i) => {
      const row = document.createElement('div'); row.className = 'pp-item';
      row.innerHTML = '<span class="pp-time"></span><span class="pp-text" title="Tap to jump · double-click to rename"></span><button class="pp-del" aria-label="Delete bookmark">×</button>';
      row.querySelector('.pp-time').textContent = fmtTime(b.t);
      row.querySelector('.pp-text').textContent = b.label;
      row.addEventListener('click', () => ppSeek(b.t));
      row.querySelector('.pp-text').addEventListener('dblclick', (e) => {
        e.stopPropagation();
        const n = prompt('Bookmark name:', b.label);
        if (n != null && n.trim()){ b.label = n.trim().slice(0, 60); bmPut(t, list); ppRenderBookmarks(); }
      });
      row.querySelector('.pp-del').addEventListener('click', (e) => { e.stopPropagation(); list.splice(i, 1); bmPut(t, list); ppRenderBookmarks(); });
      box.appendChild(row);
    });
  }
  ppEl('bm-add').addEventListener('click', () => {
    const t = tracks[currentIndex]; if (!t) return;
    const list = bmGet(t), at = Math.round((media().currentTime || 0) * 10) / 10;
    list.push({ t: at, label: 'Bookmark ' + (list.length + 1) });
    list.sort((a, b) => a.t - b.t);
    bmPut(t, list); ppRenderBookmarks(); ppToast('Bookmarked ' + fmtTime(at));
  });

  // ----- Chapters (MP4 chpl atom, ID3v2 CHAP frames) -----
  const ppFourcc = (u, o) => String.fromCharCode(u[o], u[o+1], u[o+2], u[o+3]);
  function ppBoxes(u, s, e){
    const out = [], dv = new DataView(u.buffer, u.byteOffset, u.byteLength);
    let p = s;
    while (p + 8 <= e){
      let size = dv.getUint32(p), hdr = 8;
      if (size === 1){ size = Number(dv.getBigUint64(p + 8)); hdr = 16; } else if (size === 0) size = e - p;
      if (size < hdr || p + size > e) break;
      out.push({ type: ppFourcc(u, p + 4), data: p + hdr, end: p + size });
      p += size;
    }
    return out;
  }
  async function ppMkvChapters(blob){
    const rd = async (p, n) => new Uint8Array(await blob.slice(p, p + n).arrayBuffer());
    const vint = (u, o, keep) => { let b = u[o], l = 1; while (l <= 8 && !(b & (0x80 >> (l - 1)))) l++; let v = keep ? b : b & (0xFF >> l); for (let i = 1; i < l; i++) v = v * 256 + u[o + i]; return [v, l]; };
    const hdr = async p => { const u = await rd(p, 16), [id, il] = vint(u, 0, true), [sz, sl] = vint(u, il, false); return { id, hl: il + sl, sz: sz >= Math.pow(2, 7 * sl) - 1 ? Infinity : sz }; };
    const walk = (u, f) => { let o = 0; while (o < u.length){ const [id, il] = vint(u, o, true), [sz, sl] = vint(u, o + il, false), s = o + il + sl; f(id, u.subarray(s, s + sz)); o = s + sz; } };
    const num = u => { let v = 0; for (const x of u) v = v * 256 + x; return v; };
    const out = [];
    const atom = u => { let t = 0, title = ''; walk(u, (id, d) => { if (id === 0x91) t = num(d) / 1e9; else if (id === 0x80) walk(d, (i2, d2) => { if (i2 === 0x85 && !title) title = new TextDecoder().decode(d2); }); else if (id === 0xB6) atom(d); }); out.push({ t, title: title || 'Chapter' }); };
    const eb = await hdr(0); if (eb.sz === Infinity) return [];
    const seg = await hdr(eb.hl + eb.sz), base = eb.hl + eb.sz + seg.hl;
    let q = base, want = -1;
    for (let n = 0; n < 400 && q < blob.size; n++){
      const c = await hdr(q);
      if (c.id === 0x1043A770){ if (c.sz > 5e6) return []; walk(await rd(q + c.hl, c.sz), (id, d) => { if (id === 0x45B9) walk(d, (i2, d2) => { if (i2 === 0xB6) atom(d2); }); }); break; }
      if (c.id === 0x114D9B74 && c.sz < 1e5){ walk(await rd(q + c.hl, c.sz), (id, d) => { if (id === 0x4DBB){ let sid = 0, pos = -1; walk(d, (i2, d2) => { if (i2 === 0x53AB) sid = num(d2); else if (i2 === 0x53AC) pos = num(d2); }); if (sid === 0x1043A770) want = pos; } }); }
      if (c.id === 0x1F43B675 && want < 0) break;
      if (want >= 0 && q < base + want){ q = base + want; continue; }
      if (c.sz === Infinity) break; q += c.hl + c.sz;
    }
    return out.sort((a, b) => a.t - b.t);
  }
  
async function ppMp4Chapters(blob){
    let pos = 0;
    while (pos + 8 <= blob.size){
      const d = new DataView(await blob.slice(pos, pos + 16).arrayBuffer());
      let size = d.getUint32(0), hdr = 8;
      const type = String.fromCharCode(d.getUint8(4), d.getUint8(5), d.getUint8(6), d.getUint8(7));
      if (size === 1){ size = Number(d.getBigUint64(8)); hdr = 16; } else if (size === 0) size = blob.size - pos;
      if (size < hdr) break;
      if (type === 'moov'){
        if (size > 5e7) return [];
        const u = new Uint8Array(await blob.slice(pos + hdr, pos + size).arrayBuffer());
        const udta = ppBoxes(u, 0, u.length).find(b => b.type === 'udta');
        const chpl = udta && ppBoxes(u, udta.data, udta.end).find(b => b.type === 'chpl');
        if (!chpl) return [];
        const dv = new DataView(u.buffer, u.byteOffset, u.byteLength);
        let o = chpl.data + 4;                       // version + flags
        if (u[chpl.data] === 1) o += 4;              // reserved (version 1)
        const n = u[o++], out = [], td = new TextDecoder('utf-8');
        for (let i = 0; i < n && o + 9 <= chpl.end; i++){
          const t100ns = Number(dv.getBigUint64(o)); o += 8;
          const len = u[o++];
          out.push({ t: t100ns / 1e7, title: td.decode(u.subarray(o, o + len)).trim() }); o += len;
        }
        return out;
      }
      pos += size;
    }
    return [];
  }
  function ppId3Text(b){
    const e = b[0], d = b.subarray(1); let label = 'utf-8';
    if (e === 0) label = 'windows-1252';
    else if (e === 1) label = (d[0] === 0xFE && d[1] === 0xFF) ? 'utf-16be' : 'utf-16le';
    else if (e === 2) label = 'utf-16be';
    return new TextDecoder(label).decode(d).replace(/\0+$/, '').replace(/^\uFEFF/, '').trim();
  }
  async function ppId3Chapters(blob, h){
    const syn = (a, o) => (a[o] << 21) | (a[o+1] << 14) | (a[o+2] << 7) | a[o+3];
    const total = syn(h, 6), ver = h[3];
    const u = new Uint8Array(await blob.slice(10, 10 + total).arrayBuffer());
    const dv = new DataView(u.buffer, u.byteOffset, u.byteLength), out = [];
    let p = 0;
    if (h[5] & 0x40){ const sz = ver === 4 ? syn(u, 0) : dv.getUint32(0) + 4; p = sz; }
    while (p + 10 <= u.length && u[p] !== 0){
      const id = ppFourcc(u, p), sz = ver === 4 ? syn(u, p + 4) : dv.getUint32(p + 4);
      const s = p + 10, e = s + sz; if (e > u.length) break;
      if (id === 'CHAP'){
        let o = s; while (o < e && u[o] !== 0) o++; o++;
        const start = dv.getUint32(o) / 1000; o += 16;
        let title = '';
        while (o + 10 <= e){
          const sid = ppFourcc(u, o), ssz = ver === 4 ? syn(u, o + 4) : dv.getUint32(o + 4);
          if (sid === 'TIT2' && ssz > 0) title = ppId3Text(u.subarray(o + 10, o + 10 + ssz));
          o += 10 + ssz;
        }
        out.push({ t: start, title: title || 'Chapter ' + (out.length + 1) });
      }
      p = e;
    }
    return out.sort((a, b) => a.t - b.t);
  }
  async function ppLoadChapters(t){
    if (t.chapters) return t.chapters;
    t.chapters = [];
    if (t.remoteUrl) return t.chapters;
    try {
      const blob = await (await fetch(t.url)).blob();
      const h = new Uint8Array(await blob.slice(0, 10).arrayBuffer());
      t.chapters = (h[0] === 0x49 && h[1] === 0x44 && h[2] === 0x33) ? await ppId3Chapters(blob, h) : (h[0] === 0x1A && h[1] === 0x45 && h[2] === 0xDF && h[3] === 0xA3) ? await ppMkvChapters(blob) : await ppMp4Chapters(blob);
    } catch(e){ /* unsupported container: no chapters */ }
    return t.chapters;
  }
  function ppActiveChapter(t){
    const ch = t && t.chapters; if (!ch || !ch.length) return -1;
    const now = media().currentTime || 0; let a = -1;
    for (let i = 0; i < ch.length; i++){ if (ch[i].t <= now + 0.05) a = i; else break; }
    return a;
  }
  function ppRenderChapters(){
    const box = ppEl('ch-list'), t = tracks[currentIndex];
    if (!t){ box.innerHTML = '<div class="pp-empty">Play a track to see its chapters.</div>'; return; }
    if (!t.chapters || !t.chapters.length){
      box.innerHTML = '<div class="pp-empty">' + (t.chapters ? 'No chapters found in this file. Chapters are read from MP4/M4B/M4A and MKV/WebM files and MP3s with ID3 chapter frames.' : 'Looking for chapters…') + '</div>'; return;
    }
    const act = ppActiveChapter(t); box.innerHTML = '';
    t.chapters.forEach((c, i) => {
      const row = document.createElement('div'); row.className = 'pp-item' + (i === act ? ' active' : '');
      row.innerHTML = '<span class="pp-time"></span><span class="pp-text"></span>';
      row.querySelector('.pp-time').textContent = fmtTime(c.t);
      row.querySelector('.pp-text').textContent = c.title;
      row.addEventListener('click', () => ppSeek(c.t));
      box.appendChild(row);
    });
  }

  // ----- Lyrics (LRC) -----
  const ppLrcSec = m => parseInt(m[1], 10) * 60 + parseInt(m[2], 10) + (m[3] ? parseInt(m[3].padEnd(3, '0').slice(0, 3), 10) / 1000 : 0);
  // Word timings from an "enhanced" LRC line: [00:12.00]<00:12.00>Some <00:12.40>words <00:12.90>here <00:13.50>
  // Returns { at: start of each word, end: when the last word ends (or null) }, or null if the line has none.
  function ppLrcWords(body, t0, offset){
    const wre = /<(\d{1,3}):(\d{1,2})(?:[.:](\d{1,3}))?>/g, marks = []; let clean = '', pos = 0, m;
    while ((m = wre.exec(body))){ clean += body.slice(pos, m.index); marks.push({ p: clean.length, t: Math.max(0, ppLrcSec(m) - offset) }); pos = wre.lastIndex; }
    clean += body.slice(pos);
    const ws = [], re = /\S+/g; while ((m = re.exec(clean))) ws.push({ a: m.index, b: m.index + m[0].length });
    if (!ws.length || !marks.length) return null;
    const at = ws.map((w, i) => { const lo = i ? ws[i - 1].b : 0; let t = null; for (const k of marks) if (k.p >= lo && k.p <= w.a) t = k.t; return t; });   // tags inside a word (syllables) are skipped
    if (at[0] == null) at[0] = Math.max(0, t0 - offset);
    let end = null; for (const k of marks) if (k.p >= ws[ws.length - 1].b){ end = k.t; break; }
    for (let i = 1; i < at.length; i++) if (at[i] == null){      // words without a tag of their own: spread them out between their neighbours
      let j = i; while (j < at.length && at[j] == null) j++;
      const b = j < at.length ? at[j] : end;
      for (let k = i; k < j; k++) at[k] = b != null ? at[i - 1] + (b - at[i - 1]) * (k - i + 1) / (j - i + 1) : at[k - 1] + 0.35;
      i = j;
    }
    for (let i = 1; i < at.length; i++) if (at[i] < at[i - 1]) at[i] = at[i - 1];
    return { at, end: end != null && end > at[at.length - 1] ? end : null };
  }
  function ppParseLrc(text){
    const lines = [], re = /\[(\d{1,3}):(\d{1,2})(?:[.:](\d{1,3}))?\]/g;
    let offset = 0;
    text.split(/\r?\n/).forEach(raw => {
      const om = raw.match(/^\s*\[offset:\s*([-+]?\d+)\s*\]/i);
      if (om){ offset = parseInt(om[1], 10) / 1000; return; }
      const stamps = []; let m, last = 0; re.lastIndex = 0;
      while ((m = re.exec(raw))){ stamps.push(ppLrcSec(m)); last = re.lastIndex; }
      if (!stamps.length) return;
      const body = raw.slice(last), line = body.replace(/<\d+:\d+(?:[.:]\d+)?>/g, '').trim();
      const w = stamps.length === 1 && /<\d+:\d+/.test(body) ? ppLrcWords(body, stamps[0], offset) : null;   // word tags are absolute times, so only for a line sung once
      stamps.forEach(s => lines.push({ t: Math.max(0, s - offset), text: line, w }));
    });
    return lines.sort((a, b) => a.t - b.t);
  }
  function ppStoreLyrics(dbId, text){
    const o = ppJson(PP_LRC_KEY);
    if (text) o[dbId] = text; else delete o[dbId];
    ppSave(PP_LRC_KEY, o);
  }
  function ppLoadLyricsFor(t){
    ppLrcText = (t && ppJson(PP_LRC_KEY)[t.dbId]) || '';
    ppLrc = ppParseLrc(ppLrcText); ppLrcIdx = -2;
    ppEl('lyrics-overlay').classList.toggle('show', ppLrc.length > 0);
    if (ppLrc.length) ppLrcKick(); else ppLrcDraw(-1);
    if (ppPanel.classList.contains('open')) ppRenderLyricsPane();
  }
  let ppLrcPace = 0, ppLrcPaceFor = null;   // how fast this song is sung, for the sing-along highlight
  function ppLrcDraw(i){
    const ov = ppEl('lyrics-overlay');
    const text = i >= 0 ? ppLrc[i].text : '';
    let n = ''; for (let j = i + 1; j < ppLrc.length; j++){ if (ppLrc[j].text){ n = ppLrc[j].text; break; } }
    const H = window.__ppSongText;       // vocal-separator.js draws the words (fitted to the screen, with the chosen look and effects)
    if (H && H.line){
      const s = i >= 0 ? ppLrc[i].t : -1, e = i >= 0 ? (i + 1 < ppLrc.length ? ppLrc[i + 1].t : s + 5) : -1;
      if (H.pace && ppLrcPaceFor !== ppLrc){ ppLrcPaceFor = ppLrc; ppLrcPace = H.pace(ppLrc.map((l, j) => ({ s: l.t, e: j + 1 < ppLrc.length ? ppLrc[j + 1].t : l.t + 5, text: l.text }))); }
      H.line(ov.querySelector('.ly-cur'), text, s, e, ppLrcPace, i >= 0 ? ppLrc[i].w : null); H.line(ov.querySelector('.ly-next'), n, -1, -1);
      return;
    }
    ov.querySelector('.ly-cur').textContent = text;
    ov.querySelector('.ly-next').textContent = n;
  }
  function ppLrcStep(){
    ppLrcRaf = 0;
    if (!ppLrc.length) return;
    const now = (media().currentTime || 0) - ((window.__ppSongSync && +window.__ppSongSync()) || 0); let a = -1;   // "Timing for this song" in the captions menu
    for (let i = 0; i < ppLrc.length; i++){ if (ppLrc[i].t <= now) a = i; else break; }
    if (a !== ppLrcIdx){
      ppLrcIdx = a; ppLrcDraw(a);
      if (ppPanel.classList.contains('open')) ppHighlightLyric();
    }
    if (media().paused) return;   // nothing moves while paused; play/seek/timeupdate restart it below
    ppLrcRaf = setTimeout(() => { ppLrcRaf = requestAnimationFrame(ppLrcStep); }, 70);
  }
  function ppLrcKick(){ if (!ppLrcRaf) ppLrcRaf = requestAnimationFrame(ppLrcStep); }
  ['audio', 'video-el'].forEach(id => { const e = document.getElementById(id); if (e) ['play', 'playing', 'seeked', 'timeupdate'].forEach(ev => e.addEventListener(ev, () => { if (ppLrc.length) ppLrcKick(); })); });
  function ppHighlightLyric(){
    const rows = ppEl('ly-list').querySelectorAll('.pp-item');
    rows.forEach((r, i) => r.classList.toggle('active', i === ppLrcIdx));
    const r = rows[ppLrcIdx]; if (r && r.scrollIntoView) r.scrollIntoView({ block: 'nearest' });
  }
  function ppRenderLyricsPane(){
    const box = ppEl('ly-list'), t = tracks[currentIndex];
    ppEl('ly-load').disabled = !t; ppEl('ly-clear').style.display = ppLrcText ? '' : 'none';
    if (!t){ box.innerHTML = '<div class="pp-empty">Play a track to load lyrics for it.</div>'; return; }
    if (!ppLrcText){ box.innerHTML = '<div class="pp-empty">No lyrics for this track. Load an .lrc file, or pick one together with the audio files (same name) when adding them.</div>'; return; }
    box.innerHTML = '';
    if (!ppLrc.length){ const pre = document.createElement('div'); pre.id = 'ly-plain'; pre.textContent = ppLrcText; box.appendChild(pre); return; }
    ppLrc.forEach(l => {
      const row = document.createElement('div'); row.className = 'pp-item';
      row.innerHTML = '<span class="pp-time"></span><span class="pp-text" style="white-space:normal"></span>';
      row.querySelector('.pp-time').textContent = fmtTime(l.t); row.querySelector('.pp-text').textContent = l.text || '♪';
      row.addEventListener('click', () => ppSeek(l.t));
      box.appendChild(row);
    });
    ppHighlightLyric();
  }
  ppEl('ly-load').addEventListener('click', () => ppEl('lrc-input').click());
  ppEl('ly-look').addEventListener('click', () => { const b = document.getElementById('ppv-acc'); if (!b || b.style.display === 'none'){ ppToast('Play a song first.'); return; } ppTogglePanel(false); b.click(); });
  ppEl('lrc-input').addEventListener('change', async (e) => {
    const f = e.target.files[0]; e.target.value = ''; const t = tracks[currentIndex];
    if (!f || !t) return;
    ppStoreLyrics(t.dbId, (await f.text()).replace(/^\uFEFF/, '')); ppLoadLyricsFor(t);
    ppToast(ppLrc.length ? 'Loaded ' + ppLrc.length + ' synced lines.' : 'Loaded lyrics (no timestamps, shown as plain text).');
  });
  ppEl('ly-clear').addEventListener('click', () => { const t = tracks[currentIndex]; if (!t) return; ppStoreLyrics(t.dbId, ''); ppLoadLyricsFor(t); });
  function ppSidecarLrc(track, file, fileList){
    const key = file.name.replace(/\.[^/.]+$/, '').toLowerCase();
    const lrc = fileList.find(f => /\.lrc$/i.test(f.name) && f.name.replace(/\.[^/.]+$/, '').toLowerCase() === key);
    if (lrc) lrc.text().then(txt => { ppStoreLyrics(track.dbId, txt.replace(/^\uFEFF/, '')); if (tracks[currentIndex] === track) ppLoadLyricsFor(track); });
  }
  function ppOnEmbeddedLyrics(track, l){
    const text = typeof l === 'string' ? l : (l && l.lyrics) || '';
    if (!text.trim() || ppJson(PP_LRC_KEY)[track.dbId]) return;
    ppStoreLyrics(track.dbId, text);
    if (tracks[currentIndex] === track) ppLoadLyricsFor(track);
  }

  // ---------- Override for this song (filters, visualizer, motion smoothing, picture enhance, FX, video fit) ----------
  // One shared layer for every menu that can keep its own settings per song. (EQ, volume boost and visualizer
  // sensitivity have their own older switches; speed, pitch and reverb have "Remember for this song".)
  // Each group knows how to read its current settings (get) and put a saved copy back (set). Ticking "Override for this
  // song" saves the current settings as the song's own; while that song plays, any change goes to the song (captured
  // when it changes and when the song is left). Other songs get the "all songs" settings, which are kept aside
  // (and in localStorage, in case the app closes mid-song) while a song's own are showing.
  const SONG_OV_KEY = 'ppSongOv', SONG_OV_BASE_KEY = 'ppSongOvBase';
  const songOvGroups = {
    filters: {
      host: 'filter-dropdown', where: 'start',
      get: () => ({ f: activeFilter, s: filterStrength, dd: duotoneDark, dl: duotoneLight, sh: sharpenAmount, cl: clarityAmount, al: !!autoLevelsOn }),
      set: (v) => {
        activeFilter = v.f; filterStrength = v.s; duotoneDark = v.dd; duotoneLight = v.dl; sharpenAmount = v.sh; clarityAmount = v.cl;
        filterGrid.querySelectorAll('button').forEach(b => b.classList.toggle('active', b.dataset.filter === activeFilter));
        refreshFilterExtrasUI();
        if (duotoneDarkInput) duotoneDarkInput.value = duotoneDark;
        if (duotoneLightInput) duotoneLightInput.value = duotoneLight;
        filterIntensity.value = filterStrength; sharpenIntensity.value = sharpenAmount; clarityIntensity.value = clarityAmount;
        updateSharpenMatrix(); updateClarityBoost();
        applyVideoFilter();
        setAutoLevels(!!v.al);
        filterBtn.classList.toggle('toggled', activeFilter !== 'none' || sharpenAmount > 0 || clarityAmount > 0 || !!v.al);
      }
    },
    viz: {
      host: 'viz-sens-dropdown', where: 'end', label: 'Override style for this song',
      get: () => ({ st: vizStyle, stems: !!vizStemsOn }),
      set: (v) => {
        const b = document.querySelector('#viz-style-seg button[data-v="' + v.st + '"]'); if (b) b.click();
        const t = document.getElementById('viz-stem-toggle');
        if (t && t.checked !== !!v.stems){ t.checked = !!v.stems; t.dispatchEvent(new Event('change')); }
      }
    },
    memc: {
      host: 'memc-dropdown', where: 'start',
      get: () => ({ m: memcMode, i: memcMaxIn, o: memcOutFps, s: memcStrength, q: memcQuality }),
      set: (v) => {
        memcMaxIn = v.i; memcOutFps = v.o; memcStrength = v.s;
        if (memcQuality !== v.q){ memcQuality = v.q; memcResKey = ''; memcInvalidate(); }
        try { localStorage.setItem(MEMC_IN_KEY, String(memcMaxIn)); localStorage.setItem(MEMC_OUT_KEY, String(memcOutFps)); localStorage.setItem(MEMC_Q_KEY, String(memcQuality)); localStorage.setItem(MEMC_STR_KEY, String(Math.round(memcStrength * 100))); } catch (e){}
        memcUpdateSliders(); memcUpdateStrength(); memcUpdateQualityUI();
        setMemcMode(v.m);
      }
    },
    enhance: {
      host: 'upscale-dropdown', where: 'start',
      get: () => ({ u: memcUpscale, sh: enhSharp, db: enhDeband, dk: enhDeblock, an: enhAnime, ai: enhAI, on: !!enhMaster }),
      set: (v) => {
        memcUpscale = v.u; enhSharp = v.sh; enhSharpSet = true; enhDeband = !!v.db; enhDeblock = !!v.dk; enhAnime = !!v.an;
        enhAI = ENH_AI_IDS.includes(v.ai) ? v.ai : 'off'; if (enhAI !== 'off') srEnsureLoaded().then(() => memcRepaint());
        enhMaster = v.on !== false;
        try { localStorage.setItem(MEMC_UP_KEY, String(memcUpscale)); } catch (e){}
        enhChanged(false);   // the song's own on/off, as saved
      }
    },
    fx: {   // reverb belongs to "Remember for this song" in the speed menu, so it is left out here
      host: 'fx-section', where: 'start',
      get: () => ({ b: bassBoost, f: filterAmount, d: distortionAmount, c: bitcrushAmount, e: echoMix, t: tremoloAmount }),
      set: (v) => {
        bassBoost = v.b; filterAmount = v.f; distortionAmount = v.d; bitcrushAmount = v.c; echoMix = v.e; tremoloAmount = v.t;
        refreshFxUI(); applyFxAll();
      }
    },
    view: {
      host: 'view-autoreset', where: 'after-label', label: 'Override fit & zoom for this video', videoOnly: true,
      get: () => ({ f: viewFitIdx, z: viewZoomIdx }),
      set: (v) => { viewFitIdx = v.f; viewZoomIdx = v.z; viewPanX = 0; viewPanY = 0; applyViewMode(); }
    }
  };
  let songOv = {}, songOvBase = {}, songOvTrack = null, songOvBooted = false;
  try { songOv = JSON.parse(localStorage.getItem(SONG_OV_KEY) || '{}') || {}; } catch (e){ songOv = {}; }
  try { songOvBase = JSON.parse(localStorage.getItem(SONG_OV_BASE_KEY) || '{}') || {}; } catch (e){ songOvBase = {}; }
  const songOvSave = () => { try { localStorage.setItem(SONG_OV_KEY, JSON.stringify(songOv)); localStorage.setItem(SONG_OV_BASE_KEY, JSON.stringify(songOvBase)); } catch (e){} };
  const songOvSafeSet = (g, v) => { try { songOvGroups[g].set(v); } catch (e){ console.warn('[song override]', g, e); } };
  function songOvActive(g){ const t = songOvTrack; return !!(t && songOv[t.dbId] && songOv[t.dbId][g]); }
  // Keep what was changed while this song played.
  function songOvCapture(t){
    const o = t && songOv[t.dbId]; if (!o) return;
    let changed = false;
    Object.keys(o).forEach(g => {
      if (!songOvGroups[g]) return;
      const v = songOvGroups[g].get();
      if (JSON.stringify(v) !== JSON.stringify(o[g])){ o[g] = v; changed = true; }
    });
    if (changed) songOvSave();
  }
  // Called by loadTrack (with the song being left and the new one).
  function songOvSwitch(prev, next){
    if (!songOvBooted){
      songOvBooted = true;
      Object.keys(songOvBase).forEach(g => { if (songOvGroups[g]) songOvSafeSet(g, songOvBase[g]); });   // the app closed mid-song
      songOvBase = {};
    } else if (prev && prev !== next) songOvCapture(prev);
    songOvTrack = next || null;
    const o = next ? songOv[next.dbId] : null;
    Object.keys(songOvGroups).forEach(g => {
      if (o && o[g]){
        if (!(g in songOvBase)) songOvBase[g] = songOvGroups[g].get();
        songOvSafeSet(g, o[g]);
      } else if (g in songOvBase){
        const b = songOvBase[g]; delete songOvBase[g]; songOvSafeSet(g, b);
      }
    });
    songOvSave();
    songOvPaint();
  }
  function songOvToggle(g, on){
    const t = songOvTrack; if (!t) return;
    if (on){
      if (!(g in songOvBase)) songOvBase[g] = songOvGroups[g].get();
      (songOv[t.dbId] = songOv[t.dbId] || {})[g] = songOvGroups[g].get();
      showToast('This song keeps its own ' + songOvName(g) + ' from now on');
    } else {
      if (songOv[t.dbId]){ delete songOv[t.dbId][g]; if (!Object.keys(songOv[t.dbId]).length) delete songOv[t.dbId]; }
      if (g in songOvBase){ const b = songOvBase[g]; delete songOvBase[g]; songOvSafeSet(g, b); }
      showToast('This song uses the ' + songOvName(g) + ' for all songs again');
    }
    songOvSave();
    songOvPaint();
  }
  function songOvName(g){ return { filters: 'filters', viz: 'visualizer style', memc: 'motion smoothing', enhance: 'picture enhance', fx: 'FX', view: 'fit & zoom' }[g] || 'settings'; }
  const songOvBoxes = {};
  function songOvPaint(){
    const t = songOvTrack;
    Object.keys(songOvBoxes).forEach(g => {
      const box = songOvBoxes[g];
      box.input.checked = songOvActive(g);
      box.input.disabled = !t || (songOvGroups[g].videoOnly && t.kind !== 'video');
      box.label.classList.toggle('is-on', box.input.checked);
    });
  }
  // The switch in each menu.
  Object.keys(songOvGroups).forEach(g => {
    const G = songOvGroups[g], host = document.getElementById(G.host); if (!host) return;
    const label = document.createElement('label');
    label.className = 'override-toggle song-ov-toggle';
    label.innerHTML = '<input type="checkbox"><span></span>';
    label.querySelector('span').textContent = G.label || 'Override for this song';
    const input = label.querySelector('input');
    input.addEventListener('change', () => songOvToggle(g, input.checked));
    label.addEventListener('click', (e) => e.stopPropagation());
    if (G.where === 'start'){ const x = host.querySelector(':scope > .pp-dd-x'); host.insertBefore(label, x ? x.nextSibling : host.firstChild); }   // after the menu's X, which stays top-right
    else if (G.where === 'after-label'){ const l = host.closest('label') || host; l.parentNode.insertBefore(label, l.nextSibling); }
    else host.appendChild(label);
    songOvBoxes[g] = { label, input };
  });
  songOvPaint();
  // Changes come from many places (menus, gestures, keys, the quick bar), so they are picked up by looking, not by listening.
  setInterval(() => { if (songOvTrack) songOvCapture(songOvTrack); }, 1500);
  window.addEventListener('pagehide', () => { if (songOvTrack) songOvCapture(songOvTrack); });
  document.addEventListener('visibilitychange', () => { if (document.hidden && songOvTrack) songOvCapture(songOvTrack); });

  // ---------- Sharper artwork (AI) ----------
  // Covers and video thumbnails are often far smaller than they are shown (a 300 px cover on the player, a 160 px video
  // frame on a home card). When one is shown at least 25% bigger than it is, it is redrawn once at 2x with QuickSRNet
  // medium (see "AI upscalers") on a small WebGL context of its own, and the sharper copy replaces it. Results are kept
  // for the session; the context is let go when idle. Settings > Sharper artwork (AI) turns it off.
  const ART_SHARP_KEY = 'ppArtSharp', ART_SHARP_MODEL = 'quicksrnet_medium';
  let artSharpOn = true;
  try { if (localStorage.getItem(ART_SHARP_KEY) === '0') artSharpOn = false; } catch (e){}
  const artSharpCache = new Map(), artSharpPending = new Map();
  let artCtx = null, artIdleTimer = 0;
  function artGetCtx(){
    if (artCtx) return artCtx;
    const cv = document.createElement('canvas');
    const gl = cv.getContext('webgl2', { alpha: false, antialias: false, depth: false, stencil: false, premultipliedAlpha: false });
    if (!gl) return null;
    const floatOk = !!(gl.getExtension('EXT_color_buffer_float') || gl.getExtension('EXT_color_buffer_half_float'));
    if (!floatOk) return null;
    artCtx = { gl, floatOk, flipY: false, nets: {}, status: '' };
    return artCtx;
  }
  function artLetGo(){
    clearTimeout(artIdleTimer);
    artIdleTimer = setTimeout(() => {
      if (!artCtx) return;
      try { srFreeAll(artCtx); artCtx.gl.getExtension('WEBGL_lose_context').loseContext(); } catch (e){}
      artCtx = null;
    }, 20000);
  }
  function artSharpen(src){
    if (artSharpCache.has(src)) return Promise.resolve(artSharpCache.get(src));
    if (artSharpPending.has(src)) return artSharpPending.get(src);
    const p = (async () => {
      let out = '';
      try {
        if (!(await srEnsureLoaded())) return '';
        const bmp = await createImageBitmap(await (await fetch(src)).blob());
        const w = bmp.width, h = bmp.height;
        if (w < 24 || h < 24 || w * h > 1100 * 1100){ bmp.close(); return ''; }
        const C = artGetCtx(); if (!C){ bmp.close(); return ''; }
        const gl = C.gl, t = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, t);
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, bmp);
        bmp.close();
        [gl.TEXTURE_MIN_FILTER, gl.TEXTURE_MAG_FILTER].forEach(q => gl.texParameteri(gl.TEXTURE_2D, q, gl.LINEAR));
        [gl.TEXTURE_WRAP_S, gl.TEXTURE_WRAP_T].forEach(q => gl.texParameteri(gl.TEXTURE_2D, q, gl.CLAMP_TO_EDGE));
        const hr = srRun(C, ART_SHARP_MODEL, { tex: t, w, h });
        gl.deleteTexture(t);
        artLetGo();
        if (!hr) return '';
        const px = new Uint8ClampedArray(hr.w * hr.h * 4);
        gl.bindFramebuffer(gl.FRAMEBUFFER, hr.fbo);
        gl.readPixels(0, 0, hr.w, hr.h, gl.RGBA, gl.UNSIGNED_BYTE, px);   // top row first, as uploaded
        const c2 = document.createElement('canvas'); c2.width = hr.w; c2.height = hr.h;
        c2.getContext('2d').putImageData(new ImageData(px, hr.w, hr.h), 0, 0);
        const blob = await new Promise(r => c2.toBlob(r, 'image/jpeg', 0.9));
        if (blob) out = URL.createObjectURL(blob);
      } catch (e){ out = ''; }   // e.g. a picture from another site that WebGL may not read
      return out;
    })();
    artSharpPending.set(src, p);
    return p.then(u => { artSharpPending.delete(src); artSharpCache.set(src, u); return u; });
  }
  // One <img>: once it has loaded, if it is shown much bigger than it is, swap in the sharpened copy.
  function artSharpImg(img){
    if (!artSharpOn || !img || !img.isConnected) return;
    const src = img.getAttribute('src');
    if (!src || src === img.dataset.sharpUrl) return;
    const go = () => {
      if (img.getAttribute('src') !== src) return;
      const need = Math.max(img.clientWidth, img.clientHeight) * (window.devicePixelRatio || 1);
      if (!img.naturalWidth || Math.max(img.naturalWidth, img.naturalHeight) * 1.25 >= need) return;
      artSharpen(src).then(u => {
        if (!u || !artSharpOn || img.getAttribute('src') !== src) return;
        img.dataset.sharpUrl = u; img.dataset.sharpOf = src;
        img.src = u;
      });
    };
    if (img.complete && img.naturalWidth) requestAnimationFrame(go); else img.addEventListener('load', go, { once: true });
  }
  // Where artwork is shown big: the player's cover, the home cards and the mini-player.
  (function(){
    const scan = (root) => { if (root) root.querySelectorAll('.ph-thumb img, #pl-mini-art img').forEach(artSharpImg); };
    const art = document.getElementById('art-img');
    if (art) new MutationObserver(() => artSharpImg(art)).observe(art, { attributes: true, attributeFilter: ['src', 'style'] });
    const home = document.getElementById('pl-home');
    if (home) new MutationObserver((muts) => {
      muts.forEach(m => {
        if (m.type === 'attributes' && m.target.tagName === 'IMG') artSharpImg(m.target);
        m.addedNodes && m.addedNodes.forEach(n => { if (n.nodeType !== 1) return; if (n.tagName === 'IMG') artSharpImg(n); else scan(n); });
      });
    }).observe(home, { childList: true, subtree: true, attributes: true, attributeFilter: ['src'] });
    const mini = document.querySelector('#pl-mini-art img');
    if (mini) new MutationObserver(() => artSharpImg(mini)).observe(mini, { attributes: true, attributeFilter: ['src'] });
    const tog = document.getElementById('art-sharp-toggle');
    if (tog){
      tog.checked = artSharpOn;
      tog.addEventListener('change', () => {
        artSharpOn = tog.checked;
        try { localStorage.setItem(ART_SHARP_KEY, artSharpOn ? '1' : '0'); } catch (e){}
        // switched off: put the original pictures back
        if (!artSharpOn) document.querySelectorAll('img[data-sharp-of]').forEach(i => { if (i.getAttribute('src') === i.dataset.sharpUrl){ i.src = i.dataset.sharpOf; } delete i.dataset.sharpOf; delete i.dataset.sharpUrl; });
        else { if (art) artSharpImg(art); scan(home); scan(document); }
      });
    }
    if (art) artSharpImg(art);
    scan(home);
  })();

