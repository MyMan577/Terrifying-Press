/* One shared 1 s heartbeat for the small periodic checks, so they wake the CPU together instead of six separate times a second. */
window.ppEvery = (function(){
  var jobs = [], timer = 0, n = 0;
  /* Parked while the page is hidden AND nothing is playing (window.ppIdleCheck is set once the player exists).
     Woken by visibilitychange and by ppWake() (called when play state changes), so an idle backgrounded app
     does not wake the CPU every second. The jobs run one last time before parking, so their off-switches fire. */
  function idle(){ try { return !!(document.hidden && window.ppIdleCheck && window.ppIdleCheck()); } catch (e) { return false; } }
  function start(){ if (!timer && jobs.length) timer = setInterval(tick, 1000); }
  function tick(){
    n++;
    for (var i = 0; i < jobs.length; i++){ if (n % jobs[i].k === 0){ try { jobs[i].fn(); } catch (e) { console.error(e); } } }
    if (timer && idle()){ clearInterval(timer); timer = 0; }
  }
  window.ppWake = start;
  document.addEventListener('visibilitychange', start);
  return function(fn, ms){ jobs.push({ fn: fn, k: Math.max(1, Math.round(ms / 1000)) }); start(); };
})();

/* Universal save helper: works in browsers AND inside Android WebView APKs,
   where <a download> + blob: URLs are silently ignored. */
window.ppSaveBlob = async function(blob, filename, onProgress){
  const mime = blob.type || 'application/octet-stream';
  const toB64 = b => new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result).split(',')[1]);
    r.onerror = () => rej(r.error);
    r.readAsDataURL(b);
  });
  try {
    const C = window.Capacitor, P = C && C.Plugins;
    // 1) Capacitor (your APK): write to app cache in chunks (no storage permission,
    //    no giant base64 string), then open the share sheet -> "Save to device / Files / Drive"
    // 0) Android app, big file: stream it straight into Download/Press Play with the native BackupPlugin. One copy, no cache file,
    //    so a backup no longer needs twice its size in free space. Any failure falls through to the older cache-then-save route below.
    if (P && P.PPBackup && blob.size > 32 * 1024 * 1024){
      let began = false;
      try {
        await P.PPBackup.begin({ name: filename, mime });
        began = true;
        const CH0 = 6 * 1024 * 1024;               // multiple of 3 keeps base64 pieces aligned
        let nextB64 = toB64(blob.slice(0, CH0));
        for (let off = 0; off < blob.size; off += CH0){
          const data = await nextB64;
          nextB64 = (off + CH0 < blob.size) ? toB64(blob.slice(off + CH0, off + 2 * CH0)) : null;   // encode the next piece while this one is written
          await P.PPBackup.write({ data });
          if (onProgress){ try { onProgress(Math.min(1, (off + CH0) / blob.size), 'write'); } catch(e){} }
        }
        const r = await P.PPBackup.end({});
        if (window.PPNative && PPNative.hooks && PPNative.hooks.toast) PPNative.hooks.toast('Saved to ' + ((r && r.location) || 'Downloads'));
        return true;
      } catch(e){
        console.warn('streaming save failed, using the cache route', e);
        if (began){ try { await P.PPBackup.abort({}); } catch(e2){} }
      }
    }
    if (P && P.Filesystem){
      const CH = 6 * 1024 * 1024;               // multiple of 3 keeps base64 chunks aligned (bigger chunks = fewer trips over the bridge)
      const path = 'export_' + Date.now() + '_' + filename.replace(/[^\w.\- ]+/g, '_');
      let nextB64 = toB64(blob.slice(0, CH));
      for (let off = 0, first = true; off < blob.size || first; off += CH, first = false){
        const data = await nextB64;
        nextB64 = (off + CH < blob.size) ? toB64(blob.slice(off + CH, off + 2 * CH)) : null;   // encode the next chunk while this one is written
        if (first) await P.Filesystem.writeFile({ path, data, directory: 'CACHE' });
        else await P.Filesystem.appendFile({ path, data, directory: 'CACHE' });
        if (onProgress){ try { onProgress(Math.min(1, (off + CH) / Math.max(1, blob.size)), 'write'); } catch(e){} }
      }
      if (onProgress){ try { onProgress(1, 'finish'); } catch(e){} }
      const { uri } = await P.Filesystem.getUri({ path, directory: 'CACHE' });
      if (window.PPNative && PPNative.lib){
        try {
          const kind = /^audio\//.test(mime) ? 'audio' : /^video\//.test(mime) ? 'video' : 'other';
          const r = await PPNative.lib.saveToDevice({ path: uri, name: filename, mime, kind });
          if (PPNative.hooks.toast) PPNative.hooks.toast('Saved to ' + (r.location || 'device storage'));
          return true;
        } catch(e){ /* Android 9 or older, or MediaStore refused: use the share sheet below */ }
      }
      if (P.Share){ try { await P.Share.share({ title: filename, url: uri, dialogTitle: 'Save ' + filename }); } catch(e){ if (!(e && /cancel/i.test(e.message||''))) throw e; } }
      return true;
    }
    // 2) Custom Android bridge (e.g. addJavascriptInterface named AndroidBridge)
    if (window.AndroidBridge && window.AndroidBridge.saveFile){
      window.AndroidBridge.saveFile(await toB64(blob), filename, mime);
      return true;
    }
    // 3) Web Share with files (system "Save to / Share" sheet)
    const file = new File([blob], filename, { type: mime });
    if (navigator.canShare && navigator.canShare({ files: [file] })){
      await navigator.share({ files: [file], title: filename });
      return true;
    }
  } catch(e){
    if (e && e.name === 'AbortError') return true; // user closed share sheet
    console.warn('native save failed, falling back', e);
  }
  // 4) Normal browser download
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
  return true;
};
