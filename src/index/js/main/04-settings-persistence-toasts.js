  // ---------- General settings persistence (everything except PiP state,
  // which is a live OS/browser window mode, not a preference to restore) ----------
  function saveSettings(){
    const settings = {
      shuffleOn,
      repeatMode,
      playbackSpeed,
      volume: volume.value,
      subtitleSize,
      subtitlePos,
      subtitleX,
      subtitleY,
      subtitleColor,
      subtitleFont,
      subtitleStyle,
      subtitleTrMode,
      activeFilter,
      filterStrength,
      duotoneDark,
      duotoneLight,
      sharpenAmount,
      clarityAmount,
      autoLevelsOn,
      vizSensitivity: globalVizSensitivity,
      eqGains: globalEqGains,
      eqEnabled: globalEqEnabled,
      masterBoost,
      bassBoost,
      reverbMix,
      filterAmount,
      distortionAmount,
      bitcrushAmount,
      echoMix,
      tremoloAmount,
      subtitleLatencyMs,
      latencyPresetMs,
      detailedPlaylistMode,
      activePlaylistView,
      keepMp3Conversions,
      rememberPlaybackPosition,
      playbackPositionSaveIntervalMs
    };
    try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); } catch(e){ /* storage full or unavailable */ }
  }
  function loadSettings(){
    try { return JSON.parse(localStorage.getItem(SETTINGS_KEY)) || {}; }
    catch(e){ return {}; }
  }
  let dbPromise = null;
  function openDB(){
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open('playerMediaDB', 1);
      req.onupgradeneeded = () => req.result.createObjectStore('media');
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    return dbPromise;
  }
  async function dbPut(id, value){
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('media', 'readwrite');
      tx.objectStore('media').put(value, id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }
  async function dbGet(id){
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('media', 'readonly');
      const req = tx.objectStore('media').get(id);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
  }
  async function dbDelete(id){
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('media', 'readwrite');
      tx.objectStore('media').delete(id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  // ---------- Toasts ----------
  function showToast(msg, kind){
    const stack = document.getElementById('toast-stack');
    if (!stack) return;
    const el = document.createElement('div');
    el.className = 'toast' + (kind ? (' toast-' + kind) : '');
    el.textContent = msg;
    stack.appendChild(el);
    setTimeout(() => el.remove(), 4300);
  }

  // Ask the browser not to evict our IndexedDB library under storage
  // pressure. Silent - no UI, just improves reliability in the background.
  function requestPersistentStorage(){
    if (navigator.storage && navigator.storage.persist){
      navigator.storage.persist().catch(() => {});
    }
  }

  async function refreshStorageEstimate(){
    const textEl = document.getElementById('storage-usage-text');
    const fillEl = document.getElementById('storage-usage-fill');
    if (!textEl || !fillEl) return;
    // Android app: show the phone's real storage, not the WebView's small quota.
    try {
      const SP = window.Capacitor && Capacitor.Plugins && Capacitor.Plugins.PPStorage;
      if (SP && Capacitor.isNativePlatform && Capacitor.isNativePlatform()){
        const d = await SP.info();
        const pct = d.total ? Math.min(100, ((d.total - d.free) / d.total) * 100) : 0;
        fillEl.style.width = pct + '%';
        fillEl.classList.toggle('storage-warn', pct >= 85 && pct < 95);
        fillEl.classList.toggle('storage-danger', pct >= 95);
        textEl.textContent = 'App ' + formatBytes(d.used) + ' · ' + formatBytes(d.free) + ' free of ' + formatBytes(d.total);
        return;
      }
    } catch(e){ /* fall back to the browser estimate */ }
    if (!(navigator.storage && navigator.storage.estimate)) return;
    try {
      const { usage, quota } = await navigator.storage.estimate();
      const pct = quota ? Math.min(100, (usage / quota) * 100) : 0;
      fillEl.style.width = pct + '%';
      fillEl.classList.toggle('storage-warn', pct >= 70 && pct < 90);
      fillEl.classList.toggle('storage-danger', pct >= 90);
      textEl.textContent = formatBytes(usage) + ' / ' + formatBytes(quota);
    } catch(e){ /* ignore */ }
  }
  function formatBytes(n){
    if (n == null) return '?';
    if (n < 1024) return n + ' B';
    const units = ['KB','MB','GB','TB'];
    let u = -1;
    do { n /= 1024; u++; } while (n >= 1024 && u < units.length - 1);
    return n.toFixed(n < 10 ? 2 : 1) + ' ' + units[u];
  }

  // A save that silently fails (quota exceeded, private browsing limits,
  // etc.) means the track plays fine this session but is gone on reload
  // with zero warning. Surface it instead, and try once to get persistent
  // storage before giving up, since some browsers only enforce the tight
  // "best-effort" quota until persistence is granted.
  async function persistTrackBytes(dbId, blob, label){
    try {
      await dbPut(dbId, blob);
      return true;
    } catch(e){
      try {
        await navigator.storage.persist();
        await dbPut(dbId, blob);
        return true;
      } catch(e2){
        showToast('"' + (label || 'Track') + '" couldn\u2019t be saved to storage (probably full). It will disappear on reload.', 'error');
        refreshStorageEstimate();
        return false;
      }
    }
  }

  let jszipReadyPromise = null;
  function loadJSZip(){
    if (window.JSZip) return Promise.resolve(window.JSZip);
    if (jszipReadyPromise) return jszipReadyPromise;
    jszipReadyPromise = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = 'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js';
      s.onload = () => resolve(window.JSZip);
      s.onerror = () => reject(new Error('Failed to load JSZip'));
      document.head.appendChild(s);
    });
    return jszipReadyPromise;
  }

  // Streaming, store-only ZIP writer. JSZip reads every file fully into RAM
  // (and then builds the whole archive in RAM again), which crashes the tab
  // on any sizeable library. Here each file is only read in small slices to
  // compute its CRC; the final archive is a Blob that just references the
  // original (disk-backed) blobs, so memory use stays tiny.
  const BACKUP_SPEED_KEY = 'pp_backup_speed';
  function getBackupSpeed(){
    try {
      const v = parseInt(localStorage.getItem(BACKUP_SPEED_KEY), 10);
      if (v >= 1 && v <= 10) return v;
    } catch (e){}
    return 10;
  }
  // Pause (ms) after each 4 MB slice. Speed 10 = just yield to the browser.
  function backupThrottleMs(){ return (10 - getBackupSpeed()) * 25; }
  function backupPause(ms){
    return new Promise(r => setTimeout(r, Math.max(ms, 0)));
  }
  const CRC_TABLE = (() => {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++){
      let c = n;
      for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
      t[n] = c >>> 0;
    }
    return t;
  })();
  // Slicing-by-8: handles 8 bytes per step instead of 1 (about 4-6x faster than the plain table loop; identical result).
  const CRC8 = (() => {
    const t = new Int32Array(8 * 256);
    for (let i = 0; i < 256; i++) t[i] = CRC_TABLE[i] | 0;
    for (let i = 0; i < 256; i++){
      let c = t[i];
      for (let k = 1; k < 8; k++){ c = t[c & 0xFF] ^ (c >>> 8); t[k * 256 + i] = c; }
    }
    return t;
  })();
  function crc32Update(crc, bytes){
    const t = CRC8, n = bytes.length, end = n - (n & 7);
    let i = 0;
    for (; i < end; i += 8){
      const lo = crc ^ (bytes[i] | (bytes[i + 1] << 8) | (bytes[i + 2] << 16) | (bytes[i + 3] << 24));
      crc = t[1792 + (lo & 0xFF)] ^ t[1536 + ((lo >>> 8) & 0xFF)] ^ t[1280 + ((lo >>> 16) & 0xFF)] ^ t[1024 + (lo >>> 24)]
          ^ t[768 + bytes[i + 4]] ^ t[512 + bytes[i + 5]] ^ t[256 + bytes[i + 6]] ^ t[bytes[i + 7]];
    }
    for (; i < n; i++) crc = CRC_TABLE[(crc ^ bytes[i]) & 0xFF] ^ (crc >>> 8);
    return crc;
  }
  async function crc32OfBlob(blob){
    let crc = 0xFFFFFFFF;
    const CHUNK = 8 * 1024 * 1024, ms = backupThrottleMs();
    // read the next slice while the current one is being checksummed
    let next = blob.size ? blob.slice(0, CHUNK).arrayBuffer() : null;
    for (let off = 0; off < blob.size; off += CHUNK){
      const buf = await next;
      next = (off + CHUNK < blob.size) ? blob.slice(off + CHUNK, off + 2 * CHUNK).arrayBuffer() : null;
      crc = crc32Update(crc, new Uint8Array(buf));
      if (ms > 0) await backupPause(ms);          // only the gentler speed settings pause; Max just keeps going
    }
    return (crc ^ 0xFFFFFFFF) >>> 0;
  }
  function createStoreZip(){
    const parts = [], central = [];
    let offset = 0;
    const enc = new TextEncoder();
    const d = new Date();
    const dosTime = (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1);
    const dosDate = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
    async function add(name, data){
      const isBlob = (typeof Blob !== 'undefined') && data instanceof Blob;
      const size = isBlob ? data.size : data.length;
      if (size >= 0xFFFFFFFF || offset >= 0xFFFFFFFF) throw new Error('Library is too large for a single backup file (4 GB limit).');
      const crc = isBlob ? await crc32OfBlob(data) : (crc32Update(0xFFFFFFFF, data) ^ 0xFFFFFFFF) >>> 0;
      const nameBytes = enc.encode(name);
      const lh = new DataView(new ArrayBuffer(30));
      lh.setUint32(0, 0x04034b50, true); lh.setUint16(4, 20, true); lh.setUint16(6, 0x0800, true);
      lh.setUint16(8, 0, true); lh.setUint16(10, dosTime, true); lh.setUint16(12, dosDate, true);
      lh.setUint32(14, crc, true); lh.setUint32(18, size, true); lh.setUint32(22, size, true);
      lh.setUint16(26, nameBytes.length, true); lh.setUint16(28, 0, true);
      const ch = new DataView(new ArrayBuffer(46));
      ch.setUint32(0, 0x02014b50, true); ch.setUint16(4, 20, true); ch.setUint16(6, 20, true);
      ch.setUint16(8, 0x0800, true); ch.setUint16(10, 0, true); ch.setUint16(12, dosTime, true);
      ch.setUint16(14, dosDate, true); ch.setUint32(16, crc, true); ch.setUint32(20, size, true);
      ch.setUint32(24, size, true); ch.setUint16(28, nameBytes.length, true);
      ch.setUint32(42, offset, true);
      central.push(new Uint8Array(ch.buffer), nameBytes);
      parts.push(new Uint8Array(lh.buffer), nameBytes, data);
      offset += 30 + nameBytes.length + size;
    }
    function finish(){
      if (central.length / 2 > 0xFFFF) throw new Error('Too many files for a single backup.');
      let cdSize = 0;
      central.forEach(c => { cdSize += c.length; });
      const e = new DataView(new ArrayBuffer(22));
      e.setUint32(0, 0x06054b50, true);
      e.setUint16(8, central.length / 2, true); e.setUint16(10, central.length / 2, true);
      e.setUint32(12, cdSize, true); e.setUint32(16, offset, true);
      return new Blob([...parts, ...central, new Uint8Array(e.buffer)], { type: 'application/zip' });
    }
    return { add, finish };
  }

  async function exportLibraryBackup(){
    const btn = document.getElementById('storage-export-btn');
    if (tracks.length === 0){ showToast('Library is empty.'); return; }
    const originalLabel = btn ? btn.textContent : '';
    if (btn){ btn.disabled = true; btn.textContent = 'Preparing…'; }
    try {
      const zip = createStoreZip();
      const manifest = [];
      let done = 0;
      for (const t of tracks){
        if (btn) btn.textContent = 'Preparing ' + (++done) + '/' + tracks.length + '…';
        await backupPause(backupThrottleMs() * 2);
        const blob = await dbGet(t.dbId);
        if (!blob) continue;
        // Human-readable names in the zip itself, not just in manifest.json -
        // opening the archive (or importing it somewhere that isn't this
        // player) used to show a folder of bare dbId numbers with no way to
        // tell tracks apart without cross-referencing the manifest. The dbId
        // suffix stays, just shrunk and tucked on the end, so two tracks
        // that happen to share a title/artist still can't collide.
        const label = (t.artist && t.artist !== 'Unknown artist' && t.artist !== 'Video')
          ? `${t.artist} - ${t.title}` : (t.title || 'track');
        const idSuffix = String(t.dbId).slice(-6);
        const fileName = safeFilename(label) + '_' + idSuffix + '.' + (t.ext || 'bin');
        await zip.add('media/' + fileName, blob);
        let artFile = null;
        if (t.artDbId){
          const artBlob = await dbGet(t.artDbId);
          if (artBlob){
            artFile = safeFilename(label) + '_' + idSuffix + '.img';
            await zip.add('art/' + artFile, artBlob);
          }
        }
        manifest.push({
          dbId: t.dbId, artDbId: t.artDbId || null, kind: t.kind, ext: t.ext || 'mp4',
          title: t.title, artist: t.artist, duration: t.duration, size: t.size != null ? t.size : null,
          width: t.width || null, height: t.height || null, playlistIds: t.playlistIds || [],
          stem: t.stem || undefined, stemOf: t.stemOf || undefined, stemSrc: t.stemSrc || undefined,
          mediaFile: 'media/' + fileName, artFile: artFile ? 'art/' + artFile : null
        });
      }
      // Every track is packed now. What is left is writing the whole archive out, which used to show no progress at all and looked frozen on the last song.
      if (btn) btn.textContent = 'Finishing…';
      await zip.add('manifest.json', new TextEncoder().encode(JSON.stringify({ version: 1, playlists, tracks: manifest }, null, 2)));
      const blob = zip.finish();
      await backupPause(0);
      await window.ppSaveBlob(blob, 'press-play-library-backup-' + new Date().toISOString().slice(0,10) + '.zip', (f, phase) => {
        if (btn) btn.textContent = phase === 'finish' ? 'Saving to device…' : 'Saving ' + Math.round(f * 100) + '%…';
      });
      showToast('Backup exported.');
    } catch(e){
      showToast('Backup failed: ' + (e && e.message ? e.message : 'unknown error'), 'error');
    } finally {
      if (btn){ btn.disabled = false; btn.textContent = originalLabel; }
    }
  }

  // Low-memory ZIP reader for store-only archives (what the exporter writes).
  // JSZip.loadAsync(file) reads the entire backup into RAM, which can crash the
  // tab on big libraries. This reads just the directory, then slices out each
  // entry on demand. Anything it can't handle (compressed or zip64 archives)
  // falls back to JSZip.
  async function openBackupZip(file){
    try {
      const tailLen = Math.min(file.size, 65557);
      const tail = new Uint8Array(await file.slice(file.size - tailLen).arrayBuffer());
      const tv = new DataView(tail.buffer);
      let e = -1;
      for (let i = tail.length - 22; i >= 0; i--){
        if (tv.getUint32(i, true) === 0x06054b50){ e = i; break; }
      }
      if (e < 0) throw new Error('no EOCD');
      const count = tv.getUint16(e + 10, true);
      const cdSize = tv.getUint32(e + 12, true);
      const cdOff = tv.getUint32(e + 16, true);
      if (count === 0xFFFF || cdSize === 0xFFFFFFFF || cdOff === 0xFFFFFFFF) throw new Error('zip64');
      const cd = new Uint8Array(await file.slice(cdOff, cdOff + cdSize).arrayBuffer());
      const cv = new DataView(cd.buffer);
      const dec = new TextDecoder('utf-8');
      const entries = new Map();
      let p = 0;
      for (let i = 0; i < count; i++){
        if (cv.getUint32(p, true) !== 0x02014b50) throw new Error('bad directory');
        const method = cv.getUint16(p + 10, true);
        const csize = cv.getUint32(p + 20, true);
        const nlen = cv.getUint16(p + 28, true), xlen = cv.getUint16(p + 30, true), clen = cv.getUint16(p + 32, true);
        const off = cv.getUint32(p + 42, true);
        if (method !== 0) throw new Error('compressed');
        entries.set(dec.decode(cd.subarray(p + 46, p + 46 + nlen)), { csize, off });
        p += 46 + nlen + xlen + clen;
      }
      const dataBlob = async (name) => {
        const en = entries.get(name);
        if (!en) return null;
        const lh = new DataView(await file.slice(en.off, en.off + 30).arrayBuffer());
        const start = en.off + 30 + lh.getUint16(26, true) + lh.getUint16(28, true);
        return file.slice(start, start + en.csize);
      };
      return {
        has: (name) => entries.has(name),
        blob: dataBlob,
        text: async (name) => { const b = await dataBlob(name); return b ? await b.text() : null; }
      };
    } catch (err){
      const JSZip = await loadJSZip();
      const zip = await JSZip.loadAsync(file);
      return {
        has: (name) => !!zip.file(name),
        blob: async (name) => { const f = zip.file(name); return f ? await f.async('blob') : null; },
        text: async (name) => { const f = zip.file(name); return f ? await f.async('string') : null; }
      };
    }
  }

  async function importLibraryBackup(file){
    const btn = document.getElementById('storage-import-btn');
    const originalLabel = btn ? btn.textContent : '';
    if (btn){ btn.disabled = true; btn.textContent = 'Restoring…'; }
    try {
      const zip = await openBackupZip(file);
      if (!zip.has('manifest.json')) throw new Error('Invalid backup file');
      const manifest = JSON.parse(await zip.text('manifest.json'));
      let restored = 0, failed = 0, done = 0;
      const total = (manifest.tracks || []).length;
      for (const m of (manifest.tracks || [])){
        if (btn) btn.textContent = 'Restoring ' + (++done) + '/' + total + '…';
        await backupPause(backupThrottleMs() * 2);
        const mediaBlob = (m.mediaFile && zip.has(m.mediaFile)) ? await zip.blob(m.mediaFile) : null;
        if (!mediaBlob){ failed++; continue; }
        const ok = await persistTrackBytes(m.dbId, mediaBlob, m.title);
        await backupPause(backupThrottleMs());
        if (!ok){ failed++; continue; }
        let artUrl = null;
        if (m.artFile){
          const artBlob = zip.has(m.artFile) ? await zip.blob(m.artFile) : null;
          if (artBlob){
            await persistTrackBytes(m.artDbId, artBlob, m.title + ' artwork');
            artUrl = URL.createObjectURL(artBlob);
          }
        }
        if (tracks.some(t => t.dbId === m.dbId)) continue;
        tracks.push({
          dbId: m.dbId, artDbId: m.artDbId || null, url: URL.createObjectURL(mediaBlob), artUrl,
          kind: m.kind, ext: m.ext, title: m.title, artist: m.artist, duration: m.duration,
          size: m.size, width: m.width, height: m.height, playlistIds: m.playlistIds || [],
          stem: m.stem || undefined, stemOf: m.stemOf || null, stemSrc: m.stemSrc || null
        });
        restored++;
      }
      if (btn) btn.textContent = 'Finishing…';
      await backupPause(0);
      // Each closing step is guarded on its own, so one failing screen refresh can no longer leave the restore hanging on the last track.
      const step = fn => { try { fn(); } catch(err){ console.error('restore finish step failed', err); } };
      if (manifest.playlists && Array.isArray(manifest.playlists)){
        manifest.playlists.forEach(p => {
          if (!playlists.some(existing => existing.id === p.id)) playlists.push(p);
        });
        step(savePlaylists);
        step(renderPlaylistsManager);
      }
      step(saveLibraryMeta);
      step(renderPlaylist);
      step(renderPlaylistViewSelect);
      step(refreshStorageEstimate);
      showToast('Restored ' + restored + ' track' + (restored === 1 ? '' : 's') + (failed ? (', ' + failed + ' failed') : '') + '.', failed ? 'warn' : undefined);
    } catch(e){
      showToast('Restore failed: ' + (e && e.message ? e.message : 'invalid file'), 'error');
    } finally {
      if (btn){ btn.disabled = false; btn.textContent = originalLabel; }
    }
  }

