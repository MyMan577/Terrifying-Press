  // =====================================================================
  // VLC engine: plays what the in-app players cannot, and browses network shares.
  //  - Video the WebView / ExoPlayer cannot open (WMV, RealMedia, VC-1, MPEG-2 in odd containers, DTS soundtracks,
  //    RTSP/RTMP/MMS in the web player, files on SMB/FTP/SFTP/NFS shares) opens in the full-screen VLC player.
  //  - Audio ExoPlayer cannot decode is converted natively (NativePlayerPlugin.vlcRescue), so nothing is needed here
  //    unless the native engine is off.
  //  - "Network shares" in + Add browses SMB / UPnP-DLNA / NFS / FTP / SFTP servers and adds files from them.
  // Everything is skipped when the VLC engine is missing (plain browser, or a phone that is not 64-bit ARM).
  // =====================================================================
  const PPVlc = (window.PPNative && PPNative.vlc) || null;
  const VLC_AUTO_KEY = 'ppVlcAuto';
  const NET_SERVERS_KEY = 'ppNetServersV1';
  let vlcAuto = localStorage.getItem(VLC_AUTO_KEY) !== '0';
  let vlcOk = null;               // null = not asked yet
  let vlcTrack = null;            // the track the VLC player has right now
  let vlcOpening = false;

  // Containers the WebView's <video> cannot open at all. With the web player in use they go straight to VLC.
  const VLC_WEB_NO_VIDEO = /^(avi|wmv|asf|flv|f4v|rm|rmvb|vob|mpg|mpeg|m2v|ts|m2ts|mts|tp|trp|divx|xvid|ogm|dv|mxf|wtv|iso|3g2|evo|nsv|amv)$/;
  // Network shares: only libVLC can read them. Native audio copies the file first (SourceResolver); video streams in VLC.
  const VLC_SHARE = /^(smb|ftps?|sftp|nfs|upnp):/i;
  // Stream protocols neither player handles (ExoPlayer does RTSP, RTMP, HLS, DASH; the web player does HLS at most).
  const VLC_ONLY_STREAM = /^(mms|mmsh|udp|rtp|srt):/i;
  const VLC_NATIVE_STREAM = /^(rtsps?|rtmps?):/i;

  function vlcNativeVideo(){
    try { return !!(PPNative.enabled && PPNative.nativeVideoSetting && PPNative.nativeVideoSetting()); } catch(e){ return false; }
  }
  function vlcAvailable(){
    if (!PPVlc) return Promise.resolve(false);
    if (vlcOk !== null) return Promise.resolve(vlcOk);
    return PPVlc.available().then(r => (vlcOk = !!(r && r.ok))).catch(() => (vlcOk = false));
  }

  /** True when [t] cannot play anywhere but the VLC engine, so loading it should not even try the normal players. */
  function ppVlcWants(t){
    if (!t || !PPVlc || vlcOk === false) return false;
    const link = t.remoteUrl || '';
    if (VLC_ONLY_STREAM.test(link)) return true;
    if (t._vlc) return true;                                  // a normal player already failed on it this session
    if (!vlcAuto) return false;
    const video = t.kind === 'video';
    if (VLC_SHARE.test(link)) return video || !PPNative.enabled;
    if (VLC_NATIVE_STREAM.test(link)) return video ? !vlcNativeVideo() : !PPNative.enabled;
    if (video && !vlcNativeVideo() && VLC_WEB_NO_VIDEO.test(String(t.ext || '').toLowerCase())) return true;
    return false;
  }

  /** loadTrack's stand-in for setSrc when the track belongs to VLC: leave the element empty, open VLC if asked to play. */
  function ppVlcPark(el, t, autoplay){
    try { const raw = PPNative.raw(el); raw.removeAttribute('src'); raw.load(); } catch(e){}
    isPlaying = false; updatePlayIcon();
    if (autoplay) ppVlcOpen(t);
  }

  function vlcUriFor(t){
    if (t.remoteUrl) return Promise.resolve(t.remoteUrl);
    if (t.nativeUri) return Promise.resolve(t.nativeUri);
    if (PPNative.ensureLocal) return PPNative.ensureLocal(t);       // a file still in browser storage: put it on disk
    return Promise.reject(new Error('This file is not on the device storage'));
  }

  function ppVlcOpen(t, why){
    if (!PPVlc || vlcOpening) return Promise.resolve(false);
    vlcOpening = true;
    return vlcAvailable().then(ok => {
      if (!ok){ ppToast('This file needs the VLC engine, which runs on 64-bit ARM phones only.'); return false; }
      return vlcUriFor(t).then(uri => {
        if (tracks[currentIndex] !== t) return false;            // the user moved on meanwhile
        let start = 0;
        const m = media();
        if (vlcTrack !== t && m && isFinite(m.currentTime) && m.currentTime > 1 && !m.error) start = m.currentTime;
        if (!start && rememberPlaybackPosition){ const p = getSavedPlaybackPosition(t.dbId); if (p != null && p > 3) start = p; }
        try { m.pause(); } catch(e){}
        isPlaying = false; updatePlayIcon();
        vlcTrack = t;
        if (why) ppToast(why);
        return PPVlc.open({ uri, title: t.title || '', kind: t.kind === 'video' ? 'video' : 'audio', startMs: Math.round(start * 1000) }).then(() => true);
      });
    }).catch(e => { ppToast("Couldn't open the VLC engine: " + ((e && e.message) || e)); return false; })
      .finally(() => { vlcOpening = false; });
  }

  /** Called from ppStreamError for every media error. True when the VLC engine takes the track over. */
  function ppVlcOnWebError(e){
    if (!PPVlc || !vlcAuto || vlcOk === false) return false;
    const t = tracks[currentIndex];
    if (!t || e.target !== media() || t._vlc) return false;
    // Audio with the native engine on was already handed to VLC for conversion; a second try would fail the same way.
    if (t.kind !== 'video' && PPNative.enabled && !t.remoteUrl) return false;
    t._vlc = true;
    ppVlcOpen(t, "The normal player can't open this. Playing it in the VLC engine…");
    return true;
  }

  // ExoPlayer (native video) opened the file but has no decoder for its picture or its soundtrack.
  if (window.PPNative && PPNative.hooks){
    PPNative.hooks.unsupported = (t, d) => {
      if (!PPVlc || !vlcAuto || !t || t !== tracks[currentIndex] || t._vlc || t.kind !== 'video') return;
      t._vlc = true;
      ppVlcOpen(t, d && d.video ? "This video's picture format needs the VLC engine. Opening it there…"
                                : "This video's sound format needs the VLC engine. Opening it there…");
    };
  }

  // The web <video> can also play "successfully" with no picture (a codec it cannot decode, e.g. 10-bit HEVC on some
  // phones) or no sound (AC-3 / DTS / WMA in an MKV). Chromium counts decoded bytes, so a few seconds in, nothing
  // decoded means a stream was dropped. VLC is asked whether the file really has that stream before switching.
  let vlcSilentTimer = 0;
  videoEl.addEventListener('playing', () => {
    clearTimeout(vlcSilentTimer);
    if (!PPVlc || !vlcAuto || vlcNativeVideo()) return;
    const t = tracks[currentIndex];
    if (!t || t.kind !== 'video' || t._vlc || t._vlcChecked) return;
    const raw = PPNative.raw(videoEl);
    if (!('webkitAudioDecodedByteCount' in raw)) return;
    vlcSilentTimer = setTimeout(() => {
      if (tracks[currentIndex] !== t || raw.paused || raw.currentTime < 2) return;
      const noSound = raw.webkitAudioDecodedByteCount === 0;
      const noPicture = raw.webkitVideoDecodedByteCount === 0 || !raw.videoWidth;
      if (!noSound && !noPicture){ t._vlcChecked = true; return; }
      vlcAvailable().then(ok => ok ? vlcUriFor(t) : null).then(uri => uri && PPVlc.probe({ uri })).then(info => {
        t._vlcChecked = true;
        if (!info || tracks[currentIndex] !== t) return;
        const lost = (noSound && info.audio > 0) ? 'sound' : (noPicture && info.video > 0) ? 'picture' : '';
        if (!lost) return;
        t._vlc = true;
        ppVlcOpen(t, 'This video\'s ' + lost + ' format (' + (info.codecs || 'unknown') + ") isn't supported here. Playing it in the VLC engine…");
      }).catch(() => { t._vlcChecked = true; });
    }, 3500);
  });
  videoEl.addEventListener('pause', () => clearTimeout(vlcSilentTimer));

  if (PPVlc){
    PPVlc.addListener('closed', e => {
      const t = vlcTrack; vlcTrack = null;
      if (!t) return;
      if (e && e.error) t._vlcFailed = true;
      const pos = ((e && e.posMs) || 0) / 1000;
      if (e && e.ended){
        if (rememberPlaybackPosition) savePlaybackPosition(t.dbId, null);
        if (tracks[currentIndex] === t){
          if (repeatMode === 2) { ppVlcOpen(t); return; }   // repeat one: straight back in
          onEnded({ target: media() });                      // the usual end-of-track logic: next, repeat, sleep timer
        }
      } else if (rememberPlaybackPosition && pos > 3){
        savePlaybackPosition(t.dbId, pos);
      }
    });
    PPVlc.addListener('login', e => {
      const host = (e && e.host) || 'this server';
      setTimeout(() => {
        const user = prompt('"' + host + '" needs a login.\nUser name (leave empty to cancel):', '');
        if (!user) return;
        const pass = prompt('Password for ' + user + ' on ' + host + ':', '');
        if (pass == null) return;
        PPVlc.setLogin({ host: e.host || '', user, pass }).then(() => {
          ppToast('Login saved on this phone. Trying again…');
          if (netState.open) netRefresh();
        }).catch(() => {});
      }, 50);
    });
    // Stream and share links opened from other apps ("Open with Press Play").
    const openLink = url => {
      const idx = ppAddRemote(url);
      if (idx < 0) return;
      saveLibraryMeta(); renderPlaylist(); renderPlaylistViewSelect(); renderPlaylistsManager();
      loadTrack(idx, true);
    };
    PPVlc.addListener('openUrl', e => { if (e && e.url) openLink(e.url); });
    setTimeout(() => { PPVlc.takeUrls().then(r => (r && r.urls || []).forEach(openLink)).catch(() => {}); }, 1500);
    vlcAvailable();
  }

  // ----- Settings: the automatic hand-over -----
  (function(){
    const row = ppEl('vlc-auto-row'), tog = ppEl('vlc-auto-toggle');
    if (!row || !tog || !PPVlc) return;
    vlcAvailable().then(ok => {
      row.style.display = '';
      tog.checked = vlcAuto;
      if (!ok){ tog.disabled = true; const sub = ppEl('vlc-auto-sub'); if (sub) sub.textContent = 'The VLC engine runs on 64-bit ARM phones only, so it is not available on this one.'; }
    });
    tog.addEventListener('change', () => {
      vlcAuto = tog.checked;
      try { localStorage.setItem(VLC_AUTO_KEY, vlcAuto ? '1' : '0'); } catch(e){}
    });
  })();

  // ----- Network shares browser -----
  const NET_MEDIA_EXT = /\.(mp3|m4a|aac|flac|alac|wav|aif|aiff|ogg|oga|opus|wma|ape|wv|mpc|tta|ac3|dts|mka|amr|mid|midi|mod|xm|s3m|it|dsf|dff|mp4|m4v|mkv|webm|mov|avi|wmv|asf|flv|f4v|mpg|mpeg|m2v|ts|m2ts|mts|vob|3gp|3g2|rm|rmvb|ogv|divx|xvid|mxf|wtv|iso)$/i;
  const netState = { open: false, stack: [], items: [], busy: false };

  function netSaved(){ try { return JSON.parse(localStorage.getItem(NET_SERVERS_KEY)) || []; } catch(e){ return []; } }
  function netSaveServer(uri, name){
    const list = netSaved().filter(s => s.uri !== uri);
    list.unshift({ uri, name: name || uri });
    try { localStorage.setItem(NET_SERVERS_KEY, JSON.stringify(list.slice(0, 20))); } catch(e){}
  }
  function netForget(uri){
    try { localStorage.setItem(NET_SERVERS_KEY, JSON.stringify(netSaved().filter(s => s.uri !== uri))); } catch(e){}
  }

  function netEnsureUi(){
    if (ppEl('net-modal-overlay')) return;
    const css = document.createElement('style');
    css.textContent = `
      #net-modal-overlay{display:none;position:fixed;inset:0;background:rgba(0,0,0,.6);z-index:120;align-items:center;justify-content:center}
      #net-modal-overlay.open{display:flex}
      #net-modal{background:var(--bg-elev);border:1px solid var(--line);border-radius:calc(14px*var(--ui-round,1));width:min(640px,94vw);max-height:84vh;display:flex;flex-direction:column;overflow:hidden;color:var(--text)}
      #net-head{padding:14px 16px 10px;border-bottom:1px solid var(--line);display:flex;align-items:center;gap:8px}
      #net-head h2{margin:0;font-size:15px;font-weight:600;flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
      #net-path{font-size:11px;color:var(--text-dim);padding:6px 16px 0;word-break:break-all}
      #net-list{flex:1;overflow-y:auto;padding:8px 8px 12px}
      .net-item{display:flex;align-items:center;gap:10px;width:100%;text-align:left;background:none;border:0;color:var(--text);padding:11px 10px;border-radius:calc(9px*var(--ui-round,1));font-size:14px;cursor:pointer}
      .net-item:hover,.net-item:focus-visible{background:var(--accent-soft)}
      .net-item .ic{width:22px;text-align:center;flex:none}
      .net-item .nm{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
      .net-item .x{flex:none;color:var(--text-dim);font-size:12px;padding:2px 6px}
      .net-label{font-size:11px;color:var(--text-dim);padding:10px 10px 4px;text-transform:uppercase;letter-spacing:.04em}
      .net-note{font-size:13px;color:var(--text-dim);padding:14px 10px}
      #net-foot{display:flex;gap:8px;padding:10px 12px;border-top:1px solid var(--line);flex-wrap:wrap}
      #net-foot button,#net-head button{background:var(--accent-soft);color:var(--text);border:1px solid var(--line);border-radius:calc(9px*var(--ui-round,1));padding:8px 12px;font-size:13px;cursor:pointer}
      #net-foot .grow{flex:1}`;
    document.head.appendChild(css);
    const ov = document.createElement('div');
    ov.id = 'net-modal-overlay';
    ov.innerHTML = '<div id="net-modal" role="dialog" aria-modal="true" aria-labelledby="net-title">'
      + '<div id="net-head"><button type="button" id="net-back" aria-label="Back">‹ Back</button><h2 id="net-title">Network shares</h2><button type="button" id="net-close" aria-label="Close">✕</button></div>'
      + '<div id="net-path"></div><div id="net-list"></div>'
      + '<div id="net-foot"><button type="button" id="net-connect">Connect to a server…</button><span class="grow"></span>'
      + '<button type="button" id="net-refresh">Refresh</button><button type="button" id="net-addall">Add all here</button></div></div>';
    document.body.appendChild(ov);
    ov.addEventListener('click', e => { if (e.target === ov) netClose(); });
    ppEl('net-close').addEventListener('click', netClose);
    ppEl('net-back').addEventListener('click', () => { if (netState.stack.length){ netState.stack.pop(); netRefresh(); } else netClose(); });
    ppEl('net-refresh').addEventListener('click', netRefresh);
    ppEl('net-connect').addEventListener('click', netConnect);
    ppEl('net-addall').addEventListener('click', netAddAll);
  }

  function netOpen(){
    if (!PPVlc){ ppToast('Network shares need the Android app.'); return; }
    vlcAvailable().then(ok => {
      if (!ok){ ppToast('Network shares use the VLC engine, which runs on 64-bit ARM phones only.'); return; }
      netEnsureUi();
      netState.open = true; netState.stack = [];
      ppEl('net-modal-overlay').classList.add('open');
      netRefresh();
    });
  }
  function netClose(){ netState.open = false; const o = ppEl('net-modal-overlay'); if (o) o.classList.remove('open'); }

  function netRow(icon, name, onClick, extra){
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'net-item';
    const ic = document.createElement('span'); ic.className = 'ic'; ic.textContent = icon;
    const nm = document.createElement('span'); nm.className = 'nm'; nm.textContent = name;
    b.append(ic, nm);
    if (extra) b.appendChild(extra);
    b.addEventListener('click', onClick);
    return b;
  }
  function netLabel(text){ const d = document.createElement('div'); d.className = 'net-label'; d.textContent = text; return d; }
  function netNote(text){ const d = document.createElement('div'); d.className = 'net-note'; d.textContent = text; return d; }

  let netSeq = 0;
  function netRefresh(){
    const list = ppEl('net-list'); if (!list) return;
    const here = netState.stack[netState.stack.length - 1] || null;
    ppEl('net-title').textContent = here ? here.name : 'Network shares';
    ppEl('net-path').textContent = here ? here.uri : 'Servers on your Wi-Fi (Windows / SMB shares, UPnP-DLNA media servers, NFS) and the ones you added.';
    ppEl('net-addall').style.display = here ? '' : 'none';
    list.replaceChildren(netNote(here ? 'Opening…' : 'Looking for servers on your network…'));
    const seq = ++netSeq;
    netState.busy = true;
    PPVlc.browse({ uri: here ? here.uri : '', waitMs: here ? 15000 : 5000 }).then(r => {
      if (seq !== netSeq || !netState.open) return;
      netState.busy = false;
      const items = (r && r.items) || [];
      netState.items = items;
      list.replaceChildren();
      if (!here){
        const saved = netSaved();
        if (saved.length){
          list.appendChild(netLabel('Saved'));
          saved.forEach(s => {
            const x = document.createElement('span'); x.className = 'x'; x.textContent = 'Forget';
            x.addEventListener('click', ev => { ev.stopPropagation(); netForget(s.uri); netRefresh(); });
            list.appendChild(netRow('★', s.name, () => netEnter(s.uri, s.name), x));
          });
        }
        list.appendChild(netLabel('On this network'));
      }
      const dirs = items.filter(i => i.dir).sort((a, b) => a.name.localeCompare(b.name));
      const files = items.filter(i => !i.dir && NET_MEDIA_EXT.test(i.uri)).sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
      dirs.forEach(i => list.appendChild(netRow(here ? '📁' : '🖥', i.name, () => netEnter(i.uri, i.name))));
      files.forEach(i => list.appendChild(netRow(netIsVideo(i.uri) ? '🎬' : '🎵', i.name, () => netPlay(i))));
      if (!dirs.length && !files.length){
        list.appendChild(netNote(here ? (r && r.error ? "Couldn't open it: " + r.error : 'No music or videos in this folder.')
          : 'Nothing found yet. Make sure the phone is on the same Wi-Fi, tap Refresh, or use "Connect to a server…".'));
      }
    }).catch(err => {
      if (seq !== netSeq) return;
      netState.busy = false;
      list.replaceChildren(netNote("Couldn't open it: " + ((err && err.message) || err)));
    });
  }
  function netEnter(uri, name){ netState.stack.push({ uri, name }); netRefresh(); }
  function netIsVideo(uri){ const m = String(uri).match(/\.([a-z0-9]+)$/i); return !!m && PP_VIDEO_EXT.test(m[1].toLowerCase()); }

  function netConnect(){
    const raw = (prompt('Server address, for example:\nsmb://192.168.1.20/Music\nsmb://MYPC\nftp://nas.local/media\nsftp://user@server/home\nnfs://192.168.1.5/export', 'smb://') || '').trim();
    if (!raw || raw === 'smb://') return;
    let uri = raw;
    if (!/^[a-z]+:\/\//i.test(uri)) uri = 'smb://' + uri.replace(/^\\\\/, '').replace(/\\/g, '/');   // "\\PC\share" or "PC/share"
    let u; try { u = new URL(uri); } catch(e){ ppToast("That isn't a server address."); return; }
    if (!/^(smb|ftps?|sftp|nfs|https?):$/i.test(u.protocol)){ ppToast('Use an smb://, ftp://, sftp:// or nfs:// address.'); return; }
    const name = u.hostname + (u.pathname && u.pathname !== '/' ? u.pathname : '');
    netSaveServer(u.href, name);
    netEnter(u.href, name);
  }

  function netAddTrack(item){
    const idx = ppAddRemote(item.uri, item.name.replace(/\.[^/.]+$/, ''), netIsVideo(item.uri) ? 'video' : 'audio');
    if (idx >= 0){
      const here = netState.stack[0];
      tracks[idx].artist = here ? here.name : 'Network share';
      tracks[idx].fileName = item.name;
    }
    return idx;
  }
  function netPlay(item){
    const existing = tracks.findIndex(t => t.remoteUrl === item.uri);
    const idx = existing >= 0 ? existing : netAddTrack(item);
    if (idx < 0){ ppToast("Couldn't add that file."); return; }
    saveLibraryMeta(); renderPlaylist(); renderPlaylistViewSelect(); renderPlaylistsManager();
    netClose();
    if (!netIsVideo(item.uri) && PPNative.enabled) ppToast('Fetching "' + item.name + '" from the share…');
    loadTrack(idx, true);
  }
  function netAddAll(){
    const files = netState.items.filter(i => !i.dir && NET_MEDIA_EXT.test(i.uri));
    let n = 0;
    files.forEach(i => { if (!tracks.some(t => t.remoteUrl === i.uri) && netAddTrack(i) >= 0) n++; });
    if (!n){ ppToast(files.length ? 'All of these are already in your library.' : 'No music or videos in this folder.'); return; }
    saveLibraryMeta(); renderPlaylist(); renderPlaylistViewSelect(); renderPlaylistsManager();
    ppToast('Added ' + n + ' file' + (n === 1 ? '' : 's') + ' from the share. They play straight from it while you are on this network.');
  }

  (function(){
    const b = ppEl('add-net-btn');
    if (!b) return;
    if (!PPVlc){ b.style.display = 'none'; return; }
    b.addEventListener('click', () => { ppCloseAdd(); netOpen(); });
  })();
