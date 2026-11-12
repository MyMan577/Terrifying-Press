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
  function ppAddRemote(href, title){
    let u; try { u = new URL(href); } catch(e){ return -1; }
    if (!/^https?:$/.test(u.protocol)) return -1;
    let name = u.hostname;
    try { name = decodeURIComponent(u.pathname.split('/').filter(Boolean).pop() || u.hostname); } catch(e){}
    const ext = ((name.match(/\.([a-z0-9]+)$/i) || [,''])[1] || '').toLowerCase();
    const kind = /^(mp4|webm|mov|m4v|ogv)$/.test(ext) ? 'video' : 'audio';
    const track = {
      dbId: 'u_' + Date.now() + '_' + Math.random().toString(36).slice(2, 9),
      url: u.href, remoteUrl: u.href, kind, ext: ext || (kind === 'video' ? 'mp4' : 'mp3'),
      title: (title || name.replace(/\.[^/.]+$/, '')), artist: 'Stream', duration: null,
      artUrl: null, artDbId: null, size: null, width: null, height: null, fileName: name,
      playlistIds: userPlaylistViewId() ? [userPlaylistViewId()] : []
    };
    tracks.push(track);
    if (kind === 'audio') probeAudioDuration(track).then(() => { saveLibraryMeta(); renderPlaylist(); }).catch(() => {});
    return tracks.length - 1;
  }
  function ppOpenUrl(){
    const href = (prompt('Paste a direct link to an audio or video file (http/https):') || '').trim();
    if (!href) return;
    const idx = ppAddRemote(href);
    if (idx < 0){ ppToast("That doesn't look like a valid http(s) link."); return; }
    saveLibraryMeta(); renderPlaylist(); renderPlaylistViewSelect(); renderPlaylistsManager();
    loadTrack(idx, true);
  }
  function ppStreamError(e){
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
  async function ppImportM3U(file){
    const text = (await file.text()).replace(/^\uFEFF/, '');
    const entries = [];
    text.split(/\r?\n/).forEach(raw => {
      const line = raw.trim();
      if (!line || line[0] === '#') return;
      entries.push(line);
    });
    const base = (s) => { s = s.replace(/^file:\/\/\/?/i, ''); try { s = decodeURIComponent(s); } catch(e){} return s.split(/[\\/]/).pop().toLowerCase(); };
    const stripExt = (s) => s.replace(/\.[^.]+$/, '');
    const used = new Set(), matched = [];
    let missing = 0;
    entries.forEach(p => {
      if (/^https?:\/\//i.test(p)){
        const ex = tracks.findIndex(t => t.remoteUrl === p);
        const idx = ex >= 0 ? ex : ppAddRemote(p);
        if (idx >= 0 && !used.has(idx)){ used.add(idx); matched.push(idx); } else if (idx < 0) missing++;
        return;
      }
      const b = base(p), nb = stripExt(b);
      let idx = tracks.findIndex((t, i) => !used.has(i) && ((t.fileName || '').toLowerCase() === b || (t.title + '.' + t.ext).toLowerCase() === b));
      if (idx < 0) idx = tracks.findIndex((t, i) => !used.has(i) && (stripExt((t.fileName || '').toLowerCase()) === nb || (t.title || '').toLowerCase() === nb));
      if (idx < 0){ missing++; return; }
      used.add(idx); matched.push(idx);
    });
    if (!matched.length){ ppToast('No tracks in that M3U matched the library. Add the files first, then import again.'); return; }
    const tg = ppEl('detailed-mode-toggle');
    if (tg && tg.checked){ tg.checked = false; tg.dispatchEvent(new Event('change', { bubbles: true })); }
    const pl = { id: 'pl_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8), name: file.name.replace(/\.(m3u8?|txt)$/i, '') || 'Imported playlist' };
    playlists.push(pl);
    matched.forEach(i => { const t = tracks[i]; t.playlistIds = t.playlistIds || []; if (!t.playlistIds.includes(pl.id)) t.playlistIds.push(pl.id); });
    pl.order = matched.map(i => tracks[i].dbId);
    savePlaylists(); saveLibraryMeta();
    renderPlaylistsManager(); renderPlaylistViewSelect();
    const sel = ppEl('playlist-view-select');
    if (sel){ sel.value = pl.id; sel.dispatchEvent(new Event('change', { bubbles: true })); }
    renderPlaylist();
    ppToast('Imported "' + pl.name + '": ' + matched.length + ' matched' + (missing ? ', ' + missing + ' not found in the library.' : '.'));
  }
  ppEl('m3u-export-btn').addEventListener('click', ppExportM3U);
  ppEl('m3u-import-btn').addEventListener('click', () => ppEl('m3u-input').click());
  ppEl('m3u-input').addEventListener('change', (e) => { const f = e.target.files[0]; e.target.value = ''; if (f) ppImportM3U(f); });
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
  function ppParseLrc(text){
    const lines = [], re = /\[(\d{1,3}):(\d{1,2})(?:[.:](\d{1,3}))?\]/g;
    let offset = 0;
    text.split(/\r?\n/).forEach(raw => {
      const om = raw.match(/^\s*\[offset:\s*([-+]?\d+)\s*\]/i);
      if (om){ offset = parseInt(om[1], 10) / 1000; return; }
      const stamps = []; let m, last = 0; re.lastIndex = 0;
      while ((m = re.exec(raw))){ stamps.push(parseInt(m[1], 10) * 60 + parseInt(m[2], 10) + (m[3] ? parseInt(m[3].padEnd(3, '0').slice(0, 3), 10) / 1000 : 0)); last = re.lastIndex; }
      if (!stamps.length) return;
      const line = raw.slice(last).replace(/<\d+:\d+(?:[.:]\d+)?>/g, '').trim();
      stamps.forEach(s => lines.push({ t: Math.max(0, s - offset), text: line }));
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
  function ppLrcDraw(i){
    const ov = ppEl('lyrics-overlay');
    const text = i >= 0 ? ppLrc[i].text : '';
    let n = ''; for (let j = i + 1; j < ppLrc.length; j++){ if (ppLrc[j].text){ n = ppLrc[j].text; break; } }
    const H = window.__ppSongText;       // vocal-separator.js draws the words (fitted to the screen, with the chosen look and effects)
    if (H && H.line){
      const s = i >= 0 ? ppLrc[i].t : -1, e = i >= 0 ? (i + 1 < ppLrc.length ? ppLrc[i + 1].t : s + 5) : -1;
      H.line(ov.querySelector('.ly-cur'), text, s, e); H.line(ov.querySelector('.ly-next'), n, -1, -1);
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

