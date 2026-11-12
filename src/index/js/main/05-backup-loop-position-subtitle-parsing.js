  // ---------- Progress & settings backup (everything EXCEPT media bytes) ----------
  // Distinct from exportLibraryBackup/importLibraryBackup above, which move
  // the actual audio/video files. This one is small, plain-JSON, and grabs
  // every localStorage key the app writes: playback prefs, EQ/FX, gestures,
  // UI customization, quick bar, per-track loops/subtitles/EQ, sidebar
  // layout, playlists, and the side-game saves (disc clicker, adventures,
  // XP/accent). Since most of these are only read into memory once at
  // startup by their own separate modules, the simplest reliable way to
  // apply a restored snapshot is to write it to localStorage and reload,
  // rather than trying to live-patch a dozen independent closures.
  const PROGRESS_BACKUP_KEYS = [
    'playerSettings',
    'playerGestureSettings',
    'playerUICustomization',
    'playerQuickBar',
    'playerTrackEq',
    'playerTrackBoosts',
    'playerTrackVizSensitivity',
    'playerABLoops',
    'playerSubtitles',
    'playerBookmarksV1',
    'playerLyricsV1',
    'playerReplayGainOn',
    'playerSidebarWidth',
    'playerSidebarHeight',
    'playerPlaylistsV1',
    'playerPlaylistMeta',
    'ppTagsV2',
    'discClickerSaveV1',
    'discClickerHiddenV1',
    'discClickerBackgroundEarnV1',
    'pppSaveV1',
    'ppXpSaveV1',
    'ppxpAccentColorV1',
    'ppxpQuizBestV2',
    'ppxpQuizPlusOneV2',
    'ppMarathonBestV1',
    'ppMarathonBgV1',
    'ppModeGateV1',
    'playerPerfModeV1',
    'playerMemcSpeedAware',
    'playerLayoutMode',
    'playerHistoryV1',
    'playerGestureMapPlayerMode',
    'ppPointsV1',
    'ppShopUnlocksV1'
  ];

  function exportProgressBackup(){
    const btn = document.getElementById('progress-export-btn');
    const originalLabel = btn ? btn.textContent : '';
    if (btn){ btn.disabled = true; btn.textContent = 'Preparing…'; }
    try {
      // Portfolio (and XP) stats are written to localStorage on a debounce,
      // not immediately on every change - force any pending write out first
      // so the export reflects what's actually on screen right now.
      if (window.PPPortfolioApi && window.PPPortfolioApi.flush) window.PPPortfolioApi.flush();
      if (window.PPXpApi && window.PPXpApi.flush) window.PPXpApi.flush();
      const data = {};
      PROGRESS_BACKUP_KEYS.forEach(key => {
        const v = localStorage.getItem(key);
        if (v !== null) data[key] = v;
      });
      if (Object.keys(data).length === 0){ showToast('Nothing to export yet.'); return; }
      const payload = { version: 1, exportedAt: new Date().toISOString(), data };
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
      window.ppSaveBlob(blob, 'press-play-progress-backup-' + new Date().toISOString().slice(0,10) + '.json');
      showToast('Progress & settings exported.');
    } catch(e){
      showToast('Export failed: ' + (e && e.message ? e.message : 'unknown error'), 'error');
    } finally {
      if (btn){ btn.disabled = false; btn.textContent = originalLabel; }
    }
  }

  function importProgressBackup(file){
    const btn = document.getElementById('progress-import-btn');
    const originalLabel = btn ? btn.textContent : '';
    if (btn){ btn.disabled = true; btn.textContent = 'Restoring…'; }
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(reader.result);
        const data = parsed && typeof parsed.data === 'object' ? parsed.data : null;
        if (!data) throw new Error('Invalid backup file');
        let restored = 0;
        PROGRESS_BACKUP_KEYS.forEach(key => {
          if (Object.prototype.hasOwnProperty.call(data, key)){
            try { localStorage.setItem(key, data[key]); restored++; } catch(e){ /* quota */ }
          }
        });
        if (restored === 0) throw new Error('Backup contains no recognized settings');
        showToast('Progress & settings restored. Reloading…');
        // Stop the disc clicker/portfolio/XP modules' own beforeunload
        // saves from firing on this reload and overwriting the values just
        // written above with whatever they still have in memory.
        window.__ppSkipUnloadSave = true;
        setTimeout(() => location.reload(), 900);
      } catch(e){
        showToast('Restore failed: ' + (e && e.message ? e.message : 'invalid file'), 'error');
        if (btn){ btn.disabled = false; btn.textContent = originalLabel; }
      }
    };
    reader.onerror = () => {
      showToast('Restore failed: could not read file', 'error');
      if (btn){ btn.disabled = false; btn.textContent = originalLabel; }
    };
    reader.readAsText(file);
  }

  function saveLibraryMeta(){
    const meta = tracks.map(t => ({
      dbId: t.dbId,
      artDbId: t.artDbId || null,
      kind: t.kind,
      ext: t.ext || 'mp4',
      title: t.title,
      artist: t.artist,
      duration: t.duration,
      size: t.size != null ? t.size : null,
      width: t.width || null,
      height: t.height || null,
      playlistIds: t.playlistIds || [],
      stem: t.stem || undefined, stemOf: t.stem ? (t.stemOf || null) : undefined, stemSrc: t.stem ? (t.stemSrc || null) : undefined,
      remoteUrl: t.remoteUrl || null,
      fileName: t.fileName || null,
      nativeUri: t.nativeUri || null, nativeArt: t.nativeArt || null, nativeLocal: t.nativeLocal || false, album: t.album || undefined,
      convertedFromVideo: t.convertedFromVideo || false,
      origExt: t.convertedFromVideo ? (t._origExt || 'mp4') : undefined,
      origArtist: t.convertedFromVideo ? (t._origArtist != null ? t._origArtist : 'Video') : undefined,
      origWidth: t.convertedFromVideo ? (t._origWidth || null) : undefined,
      origHeight: t.convertedFromVideo ? (t._origHeight || null) : undefined
    }));
    try { localStorage.setItem(PLAYLIST_KEY, JSON.stringify(meta)); } catch(e){ /* storage full or unavailable */ }
    try { window.dispatchEvent(new Event('pp-library-saved')); } catch(e){}   // vocal-separator.js re-fetches lyrics for tracks whose title changed
  }

  async function restoreLibrary(){
    let meta;
    try { meta = JSON.parse(localStorage.getItem(PLAYLIST_KEY)) || []; }
    catch(e){ meta = []; }
    if (meta.length === 0) return;

    let anyAutoReverted = false;
    // A song whose file is really a video: it was turned into a song with "To MP3". Tracks stored on the device
    // used to lose that mark on reload, which left them stuck as songs with no way back. The file name still tells.
    const videoExtOf = (m) => {
      for (const n of [m.fileName, m.nativeUri]){
        if (!n) continue;
        let x = String(n); try { x = decodeURIComponent(x); } catch(e){}
        const k = /\.(mp4|m4v|mkv|webm|mov|avi|3gp|ts|flv|wmv|mpg|mpeg|ogv)$/i.exec(x.split(/[?#]/)[0]);
        if (k) return k[1].toLowerCase();
      }
      return '';
    };
    for (const m of meta){
      try {
        if (m.remoteUrl){
          tracks.push({ dbId: m.dbId, artDbId: null, url: m.remoteUrl, remoteUrl: m.remoteUrl, artUrl: null, kind: m.kind, ext: m.ext || 'mp3',
            title: m.title, artist: m.artist, duration: m.duration, size: null, width: m.width || null, height: m.height || null,
            playlistIds: Array.isArray(m.playlistIds) ? m.playlistIds : [], fileName: m.fileName || null });
          continue;
        }
        if (m.nativeUri){   // lives on the device (SAF reference or app storage), no IndexedDB copy
          let artUrl = null;
          if (m.nativeArt && window.PPNative && PPNative.lib) artUrl = PPNative.lib.fileSrc(m.nativeArt);
          else if (m.artDbId){ const ab = await dbGet(m.artDbId); if (ab) artUrl = URL.createObjectURL(ab); }
          const vx = videoExtOf(m);
          const lost = !m.convertedFromVideo && m.kind === 'audio' && m.ext === 'mp3' && !!vx && !m.stem;   // stuck by the old bug
          const conv = !!m.convertedFromVideo || lost, back = conv && !keepMp3Conversions;
          if (back || lost) anyAutoReverted = true;                    // save the repaired state
          const oExt = m.origExt || vx || 'mp4', oArtist = m.origArtist != null ? m.origArtist : (lost && m.artist && m.artist !== 'Unknown artist' ? m.artist : 'Video');
          tracks.push({ dbId: m.dbId, artDbId: m.artDbId || null, url: (window.Capacitor && Capacitor.convertFileSrc) ? Capacitor.convertFileSrc(m.nativeUri) : '',
            nativeUri: m.nativeUri, nativeArt: m.nativeArt || null, nativeLocal: !!m.nativeLocal, album: m.album || '', artUrl,
            kind: back ? 'video' : m.kind, ext: back ? oExt : (m.ext || 'mp4'), title: m.title, artist: back ? oArtist : m.artist, duration: m.duration, size: m.size != null ? m.size : null,
            width: back ? (m.origWidth || null) : (m.width || null), height: back ? (m.origHeight || null) : (m.height || null),
            playlistIds: Array.isArray(m.playlistIds) ? m.playlistIds : [], fileName: m.fileName || null,
            stem: m.stem || undefined, stemOf: m.stemOf || null, stemSrc: m.stemSrc || null,
            convertedFromVideo: conv && !back,
            _origExt: conv && !back ? oExt : undefined, _origArtist: conv && !back ? oArtist : undefined,
            _origWidth: conv && !back ? (m.origWidth != null ? m.origWidth : null) : undefined,
            _origHeight: conv && !back ? (m.origHeight != null ? m.origHeight : null) : undefined });
          continue;
        }
        const blob = await dbGet(m.dbId);
        if (!blob) continue; // bytes missing (cleared storage, etc.), skip silently
        const url = URL.createObjectURL(blob);
        let artUrl = null;
        if (m.artDbId){
          const artBlob = await dbGet(m.artDbId);
          if (artBlob) artUrl = URL.createObjectURL(artBlob);
        }
        // Auto-revert path: when the "keep conversions on reload" setting is
        // off, a track that was converted to MP3 loads back in as the video
        // it originally was, using the original values stashed at
        // conversion time - same effect as calling revertToVideo() right
        // after restore, just without the toast/UI churn.
        const wasConverted = !!m.convertedFromVideo;
        const autoRevert = wasConverted && !keepMp3Conversions;
        if (autoRevert) anyAutoReverted = true;
        tracks.push({
          dbId: m.dbId,
          artDbId: m.artDbId || null,
          url,
          artUrl,
          kind: autoRevert ? 'video' : m.kind,
          ext: autoRevert ? (m.origExt || 'mp4') : (m.ext || 'mp4'),
          title: m.title,
          artist: autoRevert ? (m.origArtist != null ? m.origArtist : 'Video') : m.artist,
          duration: m.duration,
          size: m.size != null ? m.size : null,
          width: autoRevert ? (m.origWidth != null ? m.origWidth : null) : (m.width || null),
          height: autoRevert ? (m.origHeight != null ? m.origHeight : null) : (m.height || null),
          playlistIds: Array.isArray(m.playlistIds) ? m.playlistIds : [],
          fileName: m.fileName || null,
          stem: m.stem || undefined, stemOf: m.stemOf || null, stemSrc: m.stemSrc || null,
          convertedFromVideo: autoRevert ? false : wasConverted,
          _origExt: autoRevert ? undefined : m.origExt,
          _origArtist: autoRevert ? undefined : m.origArtist,
          _origWidth: autoRevert ? undefined : (m.origWidth != null ? m.origWidth : null),
          _origHeight: autoRevert ? undefined : (m.origHeight != null ? m.origHeight : null)
        });
      } catch(e){ /* skip any track that fails to restore */ }
    }
    // Persist the auto-reverted state so it doesn't need to reconstruct
    // from origExt/origArtist a second time on the next reload.
    if (anyAutoReverted) saveLibraryMeta();
    renderPlaylist();
    renderPlaylistViewSelect();
    renderPlaylistsManager();
  }

  // ---------- A/B loop persistence ----------
  function loadABLoops(){
    try { return JSON.parse(localStorage.getItem(AB_LOOP_KEY)) || {}; }
    catch(e){ return {}; }
  }
  function saveABLoop(dbId, loop){
    const all = loadABLoops();
    if (loop && loop.a != null && loop.b != null) all[dbId] = loop;
    else delete all[dbId];
    try { localStorage.setItem(AB_LOOP_KEY, JSON.stringify(all)); } catch(e){}
  }
  function getSavedABLoop(dbId){
    return loadABLoops()[dbId] || null;
  }

  // ---------- Playback position persistence ----------
  function loadPlaybackPositions(){
    try { return JSON.parse(localStorage.getItem(PLAYBACK_POSITION_KEY)) || {}; }
    catch(e){ return {}; }
  }
  function savePlaybackPosition(dbId, seconds){
    const all = loadPlaybackPositions();
    if (seconds != null && seconds > 0) all[dbId] = seconds;
    else delete all[dbId];
    try { localStorage.setItem(PLAYBACK_POSITION_KEY, JSON.stringify(all)); } catch(e){ /* storage full or unavailable */ }
  }
  function getSavedPlaybackPosition(dbId){
    const v = loadPlaybackPositions()[dbId];
    return typeof v === 'number' ? v : null;
  }

  // ---------- Subtitles: decoding, parsing, storage, lookup ----------
  // <subtitle-core>
  const SUBTITLE_EXT_RE = /\.(vtt|srt|ass|ssa)$/i;

  // Subtitle files in the wild are UTF-8, UTF-8 with BOM, UTF-16 (Windows
  // tools) or a legacy 8-bit codepage. Reading everything as UTF-8 turned
  // the last two into mojibake; detect instead, falling back to
  // windows-1252 when the bytes are not valid UTF-8.
  function decodeSubtitleBuffer(buf){
    const u8 = new Uint8Array(buf);
    let enc = null, skip = 0;
    if (u8[0] === 0xEF && u8[1] === 0xBB && u8[2] === 0xBF){ enc = 'utf-8'; skip = 3; }
    else if (u8[0] === 0xFF && u8[1] === 0xFE){ enc = 'utf-16le'; skip = 2; }
    else if (u8[0] === 0xFE && u8[1] === 0xFF){ enc = 'utf-16be'; skip = 2; }
    else if (u8.length >= 4 && u8[0] !== 0 && u8[1] === 0 && u8[2] !== 0 && u8[3] === 0) enc = 'utf-16le';
    else if (u8.length >= 4 && u8[0] === 0 && u8[1] !== 0 && u8[2] === 0 && u8[3] !== 0) enc = 'utf-16be';
    try {
      if (enc) return new TextDecoder(enc).decode(u8.subarray(skip));
      return new TextDecoder('utf-8', { fatal: true }).decode(u8);
    } catch(e){
      try { return new TextDecoder('windows-1252').decode(u8); }
      catch(e2){ return new TextDecoder().decode(u8); }
    }
  }

  const SUB_ENTITIES = { amp:'&', lt:'<', gt:'>', quot:'"', apos:"'", nbsp:' ', lrm:'', rlm:'' };
  // Strips markup (<i>, <font ...>, VTT <c.x>/<v Name>/<00:01.000>, ASS {\an8}),
  // decodes entities and keeps real line breaks (one per displayed line).
  function cleanSubtitleText(t){
    t = String(t)
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/\{\\[^}]*\}/g, '')
      .replace(/<\d{1,2}:\d{2}(?::\d{2})?[.,]\d{1,3}>/g, '')
      .replace(/<\/?[a-zA-Z][^>]*>/g, '')
      .replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
        if (e[0] === '#'){
          const code = (e[1] === 'x' || e[1] === 'X') ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
          try { return code > 0 && code <= 0x10FFFF ? String.fromCodePoint(code) : m; } catch(err){ return m; }
        }
        const v = SUB_ENTITIES[e.toLowerCase()];
        return v === undefined ? m : v;
      });
    return t.split('\n').map(l => l.replace(/[ \t\u00a0]+/g, ' ').trim()).filter(Boolean).join('\n');
  }

  const SUB_TIME_RE = /(?:(\d+):)?(\d{1,2}):(\d{1,2})(?:[.,](\d{1,3}))?\s*-+>\s*(?:(\d+):)?(\d{1,2}):(\d{1,2})(?:[.,](\d{1,3}))?/;
  function subToSec(h, m, s, ms){
    return (h ? (+h) * 3600 : 0) + (+m) * 60 + (+s) + (ms ? (+((ms + '00').slice(0, 3))) / 1000 : 0);
  }

  // WebVTT + SRT. Scans line by line instead of splitting on blank lines, so
  // whitespace-only separators, a missing blank line between cues, cue
  // identifiers, cue settings and NOTE/STYLE/REGION blocks all survive.
  function parseVttSrt(text){
    const lines = text.split('\n');
    const cues = [];
    for (let i = 0; i < lines.length; i++){
      if ((i === 0 || lines[i - 1].trim() === '') && /^(NOTE|STYLE|REGION)(\s|$)/.test(lines[i])){
        while (i < lines.length && lines[i].trim() !== '') i++;
        continue;
      }
      const m = lines[i].match(SUB_TIME_RE);
      if (!m) continue;
      const buf = [];
      let j = i + 1;
      for (; j < lines.length; j++){
        const ln = lines[j];
        if (ln.trim() === '') break;
        if (SUB_TIME_RE.test(ln)) break;
        if (/^\d+$/.test(ln.trim()) && j + 1 < lines.length && SUB_TIME_RE.test(lines[j + 1])) break;
        buf.push(ln);
      }
      i = j - 1;
      cues.push({
        start: subToSec(m[1], m[2], m[3], m[4]),
        end: subToSec(m[5], m[6], m[7], m[8]),
        text: cleanSubtitleText(buf.join('\n'))
      });
    }
    return cues;
  }

  // Advanced SubStation Alpha (.ass/.ssa): dialogue text only, no styling.
  function parseASS(text){
    const assTime = str => {
      const m = String(str).trim().match(/^(\d+):(\d{1,2}):(\d{1,2})(?:[.:](\d{1,3}))?$/);
      return m ? (+m[1]) * 3600 + (+m[2]) * 60 + (+m[3]) + (m[4] ? (+m[4]) / Math.pow(10, m[4].length) : 0) : NaN;
    };
    const cues = [];
    let inEvents = false, inStyles = false, inInfo = false, names = null, styleNames = null, resX = 0, resY = 0;
    const styles = {};
    const assCol = c => { const m = String(c).trim().match(/&H([0-9a-f]{6,8})&?/i); if (!m) return ''; const h = m[1].slice(-6); const r = '#' + h.slice(4,6) + h.slice(2,4) + h.slice(0,2); return /^#f{6}$/i.test(r) ? '' : r; };
    text.split('\n').forEach(raw => {
      const line = raw.trim();
      if (/^\[.*\]$/.test(line)){ inEvents = /^\[events\]$/i.test(line); inStyles = /^\[v4\+? styles\]$/i.test(line); inInfo = /^\[script info\]$/i.test(line); return; }
      if (inInfo){ const m = line.match(/^playres([xy])\s*:\s*(\d+)/i); if (m){ if (m[1].toLowerCase() === 'x') resX = +m[2]; else resY = +m[2]; } return; }
      if (inStyles){
        if (/^format\s*:/i.test(line)) styleNames = line.replace(/^format\s*:/i, '').split(',').map(x => x.trim().toLowerCase());
        else if (/^style\s*:/i.test(line) && styleNames){
          const v = line.replace(/^style\s*:\s?/i, '').split(',');
          const g = k => v[styleNames.indexOf(k)];
          styles[String(g('name')).trim()] = { c: assCol(g('primarycolour') || ''), b: /^(-1|1)$/.test(String(g('bold')).trim()), i: /^(-1|1)$/.test(String(g('italic')).trim()), an: +g('alignment') || 2, fs: +g('fontsize') || 0, ml: +g('marginl') || 10, mr: +g('marginr') || 10, mv: +g('marginv') || 10, u: /^(-1|1)$/.test(String(g('underline')).trim()), s: /^(-1|1)$/.test(String(g('strikeout')).trim()) };
        }
        return;
      }
      if (!inEvents) return;
      if (/^format\s*:/i.test(line)){
        names = line.replace(/^format\s*:/i, '').split(',').map(x => x.trim().toLowerCase());
        return;
      }
      if (!/^dialogue\s*:/i.test(line)) return;
      const cols = names || ['layer','start','end','style','name','marginl','marginr','marginv','effect','text'];
      const parts = line.replace(/^dialogue\s*:\s?/i, '').split(',');
      if (parts.length < cols.length) return;
      const si = cols.indexOf('start'), ei = cols.indexOf('end');
      if (si < 0 || ei < 0) return;
      const txt = parts.slice(cols.length - 1).join(',');
      if (/\{[^}]*\\p[1-9]/.test(txt)) return;                 // vector drawing, not text
      const base = styles[String(parts[cols.indexOf('style')] || '').trim().replace(/^\*/, '')] || {};
      const cm = txt.match(/\\(?:1c|c)(&H[0-9a-f]{6,8}&?)/i), bm = txt.match(/\\b([01])(?![0-9a-z])/i), im = txt.match(/\\i([01])(?![0-9a-z])/i);
      const st = { c: cm ? assCol(cm[1]) : (base.c || ''), b: bm ? bm[1] === '1' : !!base.b, i: im ? im[1] === '1' : !!base.i };
      let an = +(base.an || 2);
      const am = txt.match(/\\an([1-9])(?!\d)/);
      if (am) an = +am[1];
      else { const lm = txt.match(/\\a(\d{1,2})(?!\d)/); if (lm){ const mp = {1:1,2:2,3:3,5:7,6:8,7:9,9:4,10:5,11:6}; if (mp[+lm[1]]) an = mp[+lm[1]]; } }
      const pm = txt.match(/\\pos\(\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)\s*\)/), fm = txt.match(/\\fad\(\s*(\d+)\s*,\s*(\d+)\s*\)/), sm = txt.match(/\\fs(\d+(?:\.\d+)?)/);
      const um = txt.match(/\\u([01])(?![0-9a-z])/i), stm = txt.match(/\\s([01])(?![0-9a-z])/i);
      const fx = (an !== 2 || pm || fm) ? { an, x: pm ? +pm[1] : null, y: pm ? +pm[2] : null, fs: sm ? +sm[1] : (base.fs || 0), ml: base.ml || 10, mr: base.mr || 10, mv: base.mv || 10, fad: fm ? [+fm[1], +fm[2]] : null, u: um ? um[1] === '1' : !!base.u, s: stm ? stm[1] === '1' : !!base.s, rx: resX, ry: resY } : null;
      cues.push({
        fx,
        start: assTime(parts[si]),
        end: assTime(parts[ei]),
        style: (st.c || st.b || st.i) ? st : null,
        text: cleanSubtitleText(txt.replace(/\\N/g, '\n').replace(/\\n/g, '\n').replace(/\\h/g, ' '))
      });
    });
    return cues;
  }

  // Drops unusable cues and sorts by start time (the lookup below relies on it).
  function finalizeSubtitleCues(cues){
    const out = [];
    cues.forEach(c => {
      if (!c || !c.text || !isFinite(c.start) || !isFinite(c.end)) return;
      const start = Math.max(0, c.start);
      if (c.end <= start) return;
      out.push({ start, end: c.end, text: c.text, tr: c.tr || '', style: c.style || null, fx: c.fx || null });
    });
    out.sort((a, b) => (a.start - b.start) || (a.end - b.end));
    return out;
  }

  // Parses WebVTT, SRT or ASS/SSA text into a sorted [{start, end, text}] array.
  function parseSubtitles(raw){
    const text = String(raw == null ? '' : raw).replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
    if (/^\s*\[(?:script info|events)\]/im.test(text) && /^\s*dialogue\s*:/im.test(text)){
      return finalizeSubtitleCues(parseASS(text));
    }
    return finalizeSubtitleCues(parseVttSrt(text));
  }
  // </subtitle-core>

