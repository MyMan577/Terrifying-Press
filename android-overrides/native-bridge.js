/*
 * Press Play native bridge.
 *
 * On Android (Capacitor) this swaps the WebView <audio>/<video> engine for the native ExoPlayer
 * service while the rest of the app keeps talking to the same `audioEl` / `videoEl` objects.
 * In a normal browser nothing here activates and the app behaves exactly as before.
 *
 * Exposed as window.PPNative. Loaded before the main app script.
 */
(function () {
  'use strict';
  var Cap = window.Capacitor;
  var isAndroid = !!(Cap && Cap.isNativePlatform && Cap.isNativePlatform() && Cap.getPlatform && Cap.getPlatform() === 'android');
  var Plug = (isAndroid && Cap.Plugins) || {};
  var Player = Plug.PPPlayer, Lib = Plug.PPLibrary, Jobs = Plug.PPJobs;
  var pref = null;
  try { pref = localStorage.getItem('ppNativeEngine'); } catch (e) {}
  var enabled = !!(isAndroid && Player && Lib) && pref !== 'off';

  var N = { available: !!(isAndroid && Player && Lib), enabled: enabled, hooks: {} };
  window.PPNative = N;
  if (!N.available) {            // plain browser: expose inert helpers so patched call sites stay one-liners
    N.wrapMedia = function (el) { return el; };
    N.setSrc = function (el, t) { el.src = t.url; return Promise.resolve(); };
    N.raw = function (el) { return el; };
    N.active = N.videoActive = function () { return false; };
    N.decorateAnalyser = N.queueNext = N.updateMeta = N.setFxProvider = N.setVideoFilterCss = N.screenOn = N.scheduleRect = N.resync = N.enterPip = function () {};
    N.boot = function () { return Promise.resolve(); };
    N.pushCatalog = N.migrateAll = function () {};
    N.snapshot = function () { return Promise.reject(new Error('not native')); };
    N.sameUri = function () { return false; };
    N.expectAdvance = function () {};
    N.jobs = { run: function (title, fn) { return fn(function () {}); } };
    N.lib = null;
    return;
  }

  // ---------- helpers ----------
  var wrappers = {};            // 'audio' | 'video' -> proxy
  var cur = null;               // state object of the wrapper that currently owns the native player
  function norm(u) { try { return decodeURIComponent(String(u)); } catch (e) { return String(u); } }
  function sameUri(a, b) { return !!a && !!b && (String(a) === String(b) || norm(a) === norm(b)); }
  function now() { return performance.now(); }
  function emit(S, type) {
    try {
      var ev = new Event(type);
      Object.defineProperty(ev, 'target', { value: S.proxy });   // app code compares e.target with media()
      S.raw.dispatchEvent(ev);
    } catch (e) {}
  }
  function fakeRanges(S) {
    return { length: 1, start: function () { return 0; }, end: function () { return S.durMs >= 0 ? S.durMs / 1000 : 0; } };
  }
  function curTime(S) {
    var t = S.base;
    if (S.pwr && S.playing && !S.seeking) t += (now() - S.baseAt) * S.rate;
    if (S.durMs >= 0 && t > S.durMs) t = S.durMs;
    return Math.max(0, t) / 1000;
  }
  function call(fn) { try { var p = fn(); if (p && p.catch) p.catch(function () {}); return p; } catch (e) { return Promise.resolve(); } }

  // ---------- media-element facade ----------
  function makeWrapper(raw, kind) {
    var S = {
      kind: kind, raw: raw, proxy: null, active: false, track: null, uri: null,
      pwr: false, playing: false, state: 'idle', ready: false, ended: false, seeking: false,
      base: 0, baseAt: 0, durMs: NaN, rate: 1, vol: 1, muted: false, loop: false, vw: 0, vh: 0,
      preservePitch: true, loadId: 0, loading: Promise.resolve(), err: null, localAt: 0,
      advancedUri: null, adopting: false, seekTimer: 0
    };
    S.after = function (fn) { var id = S.loadId; S.loading = S.loading.then(function () { if (id === S.loadId && S.active) return fn(); }); return S.loading; };
    S.play = function () {
      S.pwr = true; S.ended = false; S.localAt = now(); emit(S, 'play');
      return S.after(function () { return Player.play(); }).then(function () {});
    };
    S.pause = function () {
      if (S.adopting) return Promise.resolve();     // JS is just re-syncing after a native auto-advance
      S.localAt = now();
      if (S.pwr) { S.pwr = false; emit(S, 'pause'); }
      return S.after(function () { return Player.pause(); }).then(function () {});
    };
    S.seek = function (sec) {
      if (!isFinite(sec)) return;
      S.seeking = true; S.base = Math.max(0, sec * 1000); S.baseAt = now(); S.ended = false;
      emit(S, 'seeking');
      clearTimeout(S.seekTimer);
      S.seekTimer = setTimeout(function () { if (S.seeking) { S.seeking = false; emit(S, 'seeked'); emit(S, 'timeupdate'); } }, 1500);
      S.after(function () { return Player.seek({ ms: Math.round(sec * 1000) }); });
    };
    S.applyRate = function () { S.after(function () { return Player.setRate({ rate: S.rate, preservePitch: S.preservePitch }); }); };
    S.applyVol = function () { S.after(function () { return Player.setVolume({ volume: S.muted ? 0 : S.vol }); }); };

    var proxy = new Proxy(raw, {
      get: function (target, prop) {
        if (prop === '__pp') return S;
        if (prop === '__raw') return target;
        if (S.active) {
          switch (prop) {
            case 'currentTime': return curTime(S);
            case 'duration': return S.durMs >= 0 ? S.durMs / 1000 : NaN;
            case 'paused': return !S.pwr;
            case 'ended': return S.ended;
            case 'seeking': return S.seeking;
            case 'readyState': return S.ready ? 4 : (S.state === 'buffering' ? 2 : 0);
            case 'networkState': return 1;
            case 'playbackRate': case 'defaultPlaybackRate': return S.rate;
            case 'volume': return S.vol;
            case 'muted': return S.muted;
            case 'loop': return S.loop;
            case 'error': return S.err ? { code: 4, message: S.err } : null;
            case 'src': case 'currentSrc': return (S.track && (S.track.url || S.uri)) || '';
            case 'videoWidth': return S.vw;
            case 'videoHeight': return S.vh;
            case 'buffered': case 'seekable': case 'played': return fakeRanges(S);
            case 'play': return function () { return S.play(); };
            case 'pause': return function () { S.pause(); };
            case 'load': return function () {};
            case 'canPlayType': return function () { return 'maybe'; };
            case 'removeAttribute': return function (n) { if (n !== 'src') target.removeAttribute(n); };
            case 'getVideoPlaybackQuality': return function () {
              return { droppedVideoFrames: 0, corruptedVideoFrames: 0, totalVideoFrames: Math.floor(curTime(S) * 30), creationTime: now() };
            };
          }
        }
        var v = Reflect.get(target, prop, target);
        return typeof v === 'function' ? v.bind(target) : v;
      },
      set: function (target, prop, value) {
        switch (prop) {
          case 'playbackRate': S.rate = +value || 1; if (S.active) S.applyRate(); break;
          case 'volume': S.vol = Math.max(0, Math.min(1, +value)); if (S.active) S.applyVol(); break;
          case 'muted': S.muted = !!value; if (S.active) S.applyVol(); break;
          case 'loop': S.loop = !!value; if (S.active) S.after(function () { return Player.setLoop({ loop: S.loop }); }); break;
          case 'preservesPitch': case 'mozPreservesPitch': case 'webkitPreservesPitch':
            S.preservePitch = !!value; if (S.active) S.applyRate(); break;
          case 'currentTime': if (S.active) { S.seek(+value); return true; } break;
          case 'src': if (S.active) return true; break;     // native owns the source; ignore stray writes
        }
        Reflect.set(target, prop, value, target);
        return true;
      }
    });
    S.proxy = proxy;
    wrappers[kind] = proxy;
    return proxy;
  }

  var origGetById = document.getElementById.bind(document);
  // Video uses the normal web <video> (MEMC, CSS filters, no transparent WebView) unless localStorage.ppNativeVideo = 'on'.
  var nativeVideo = false; try { nativeVideo = localStorage.getItem('ppNativeVideo') === 'on'; } catch (e) {}
  N.wrapMedia = function (el, kind) {
    if (!enabled || !el) return el;
    if (kind === 'video' && !nativeVideo) return el;
    if (el.__pp) return el;
    return makeWrapper(el, kind);
  };
  // Every other script in the page looks the elements up by id; hand them the same facade so
  // gestures, subtitles, XP counters etc. all read the native player's clock.
  if (enabled) {
    document.getElementById = function (id) {
      if (id === 'video-el' && wrappers.video) return wrappers.video;
      if (id === 'audio' && wrappers.audio) return wrappers.audio;
      return origGetById(id);
    };
  }
  N.raw = function (el) { return (el && el.__raw) || el; };
  N.sameUri = sameUri;
  var expect = null;
  N.expectAdvance = function (uri) {
    expect = uri; setTimeout(function () { if (expect === uri) expect = null; }, 4000);
    if (cur && cur.active) { cur.advancedUri = uri; cur.adopting = true; }
  };
  N.active = function () { return !!(cur && cur.active); };
  N.videoActive = function () { return !!(cur && cur.active && cur.kind === 'video'); };

  function deactivate(S) {
    if (!S || !S.active) return;
    S.active = false; S.playing = false; S.pwr = false; S.loadId++; S.adopting = false; S.advancedUri = null;
    if (cur === S) cur = null;
  }

  // ---------- legacy IndexedDB blobs -> files on disk ----------
  var moving = {};
  function b64(blob) {
    return new Promise(function (res, rej) {
      var r = new FileReader();
      r.onload = function () { res(String(r.result).split(',')[1] || ''); };
      r.onerror = function () { rej(r.error); };
      r.readAsDataURL(blob);
    });
  }
  function ensureLocal(t) {
    if (t.nativeUri) return Promise.resolve(t.nativeUri);
    if (t.remoteUrl) return Promise.resolve(t.remoteUrl);
    if (moving[t.dbId]) return moving[t.dbId];
    var p = (async function () {
      var blob = N.hooks.getBlob ? await N.hooks.getBlob(t) : null;
      if (!blob) {
        var r = await fetch(t.url); blob = await r.blob();       // blob: URL still alive this session
      }
      var CH = 3 * 1024 * 1024, name = t.dbId + '.' + (t.ext || (t.kind === 'video' ? 'mp4' : 'mp3')), uri = null, size = 0;
      if (blob.size > 64 * 1024 * 1024 && N.hooks.toast) N.hooks.toast('Moving "' + (t.title || 'track') + '" to device storage…');
      for (var off = 0; off < blob.size || off === 0; off += CH) {
        var res = await Lib.writeChunk({ name: name, first: off === 0, base64: await b64(blob.slice(off, off + CH)) });
        uri = res.uri; size = res.size;
        if (blob.size === 0) break;
      }
      if (size !== blob.size) throw new Error('size mismatch after copy');
      t.nativeUri = uri; t.nativeLocal = true;
      if (N.hooks.onMigrated) N.hooks.onMigrated(t);             // saves library meta, deletes the IndexedDB copy
      return uri;
    })();
    moving[t.dbId] = p;
    p.then(function () { delete moving[t.dbId]; }, function () { delete moving[t.dbId]; });
    return p;
  }
  N.ensureLocal = ensureLocal;

  function artFor(t) {
    var o = {};
    if (t.nativeArt) o.artUri = 'file://' + t.nativeArt.replace(/^file:\/\//, '');
    return o;
  }
  function metaFor(t, uri) {
    var o = { id: String(t.dbId || uri), uri: uri, kind: t.kind, title: t.title || '', artist: t.artist || '', album: t.album || '' };
    var a = artFor(t); for (var k in a) o[k] = a[k];
    return o;
  }

  // ---------- loading ----------
  N.setSrc = function (el, t) {
    var S = el && el.__pp;
    if (!S || !enabled) {
      // plain web <video>: make sure the native player is not still playing something else
      if (enabled && cur && cur.active) { var o = cur; deactivate(o); call(function () { return Player.stop(); }); }
      el.src = t.url; return Promise.resolve();
    }
    var other = wrappers[S.kind === 'video' ? 'audio' : 'video'];
    if (other) deactivate(other.__pp);
    if (S.kind === 'audio') { var wv = origGetById('video-el'); if (wv && !wv.__pp) { try { wv.pause(); } catch (e) {} } }
    var id = ++S.loadId;
    S.active = true; S.track = t; S.uri = null; S.ready = false; S.ended = false; S.playing = false; S.pwr = false;
    S.seeking = false; S.base = 0; S.baseAt = now(); S.durMs = NaN; S.vw = S.vh = 0; S.err = null; S.state = 'idle';
    cur = S;
    emit(S, 'loadstart');

    S.loading = (async function () {
      var uri;
      try { uri = await ensureLocal(t); }
      catch (e) {
        if (id !== S.loadId) return;
        deactivate(S);                                   // couldn't hand it to native: use the web engine
        call(function () { return Player.stop(); });
        el.src = t.url;
        return;
      }
      if (id !== S.loadId) return;
      S.uri = uri;
      if ((S.advancedUri && sameUri(S.advancedUri, uri)) || (expect && sameUri(expect, uri))) {  // native already moved on to this item by itself
        S.advancedUri = null; S.adopting = false; expect = null;
        var snap = await Player.getState();
        if (id !== S.loadId) return;
        applySnap(S, snap, true);
        return;
      }
      S.adopting = false; S.advancedUri = null;
      await Player.loadMedia(Object.assign(metaFor(t, uri), { autoplay: false }));
      await Player.setLoop({ loop: S.loop });
      await Player.setVolume({ volume: S.muted ? 0 : S.vol });
      await Player.setRate({ rate: S.rate, preservePitch: S.preservePitch });
      pushFx(true);
      syncViz();
      scheduleRect();
      if (S.kind === 'video') { lastFilterJson = ''; pushFilter(S.raw.style.filter || '', true); }
    })();
    return S.loading;
  };

  N.updateMeta = function (t) {
    if (!cur || !cur.active || !cur.uri || cur.track !== t) return;
    call(function () { return Player.updateMeta(metaFor(t, cur.uri)); });
  };

  // Queue the track JS will play next so ExoPlayer advances gaplessly and while the screen is off.
  var nextToken = 0;
  N.queueNext = function (t) {
    var tok = ++nextToken;
    if (!cur || !cur.active) return;
    if (!t) { call(function () { return Player.setNext({ uri: '' }); }); return; }
    ensureLocal(t).then(function (uri) {
      if (tok !== nextToken || !cur || !cur.active) return;
      return Player.setNext(metaFor(t, uri));
    }).catch(function () {});
  };

  // ---------- native -> JS events ----------
  function applySnap(S, s, adopted) {
    if (!S.active) return;
    if (s.uri && S.uri && !sameUri(s.uri, S.uri)) return;     // stale event from the previous item
    var recentLocal = (now() - S.localAt) < 600;              // JS just pressed play/pause: don't let an old snapshot undo it
    var wasPwr = S.pwr, wasPlaying = S.playing;
    if (!recentLocal) S.pwr = !!s.playWhenReady;
    S.playing = !!s.playing; S.state = s.state;
    S.base = s.posMs || 0; S.baseAt = now();
    S.durMs = s.durMs >= 0 ? s.durMs : NaN;
    if (s.rate) S.rate = s.rate;
    if (s.vw) { S.vw = s.vw; S.vh = s.vh; }
    if ((s.state === 'ready' || adopted) && !S.ready) {
      S.ready = true;
      ['durationchange', 'loadedmetadata', 'loadeddata', 'canplay', 'canplaythrough'].forEach(function (e) { emit(S, e); });
    }
    if (s.state === 'buffering' && S.ready) emit(S, 'waiting');
    if (s.state === 'ended') {
      if (!S.ended) { S.ended = true; S.pwr = false; emit(S, 'timeupdate'); emit(S, 'pause'); emit(S, 'ended'); }
      return;
    }
    if (s.playing && !wasPlaying) emit(S, 'playing');
    if (!recentLocal) {
      if (!S.pwr && wasPwr && !S.ended) emit(S, 'pause');     // paused from the notification / headset / audio focus loss
      if (S.pwr && !wasPwr) emit(S, 'play');                  // started from outside the page
    }
    if (s.why === 'seeked' && S.seeking) { S.seeking = false; clearTimeout(S.seekTimer); emit(S, 'seeked'); emit(S, 'timeupdate'); }
    if (s.why === 'rate') emit(S, 'ratechange');
    if (s.why === 'size') emit(S, 'resize');
    syncViz();
  }

  var listenersReady = false;
  function wireEvents() {
    if (listenersReady) return; listenersReady = true;
    Player.addListener('state', function (s) { if (cur) applySnap(cur, s); });
    Player.addListener('time', function (t) {
      var S = cur; if (!S || !S.active || S.seeking) return;
      S.base = t.posMs; S.baseAt = now();
      if (t.durMs >= 0) S.durMs = t.durMs;
      emit(S, 'timeupdate');
    });
    Player.addListener('advanced', function (s) {
      var S = cur; if (!S || !S.active) return;
      if (N.hooks.matchesNext && N.hooks.syncTo && !N.hooks.matchesNext(s.uri)) { N.hooks.syncTo(s.uri); return; }  // e.g. a car queue
      // Native already started the queued item. Let the app run its normal "track ended" logic; it will
      // call loadTrack(next) and setSrc() will adopt the playing item instead of reloading it.
      S.advancedUri = s.uri; S.adopting = true;
      setTimeout(function () { if (S.adopting) { S.adopting = false; N.resync(); } }, 2500);
      S.ended = true; S.pwr = false;
      emit(S, 'timeupdate'); emit(S, 'pause'); emit(S, 'ended');
    });
    Player.addListener('error', function (e) {
      var S = cur; if (!S || !S.active) return;
      S.err = e.message || e.code || 'error'; emit(S, 'error');
      if (N.hooks.toast) N.hooks.toast('Playback error: ' + S.err, 'error');
    });
    Player.addListener('external', function (s) {          // Android Auto / Assistant / car kit started something
      if (N.hooks.syncTo && s.uri) N.hooks.syncTo(s.uri);
    });
    Player.addListener('cmd', function (c) {
      if (N.hooks.command) N.hooks.command(c.name);
    });
    Player.addListener('fft', function (e) {
      fftF = dec(e.f); fftT = dec(e.t);
    });
    Player.addListener('pip', function (e) {
      document.documentElement.classList.toggle('pp-pip', !!e.on);
      if (!e.on) scheduleRect();
    });
    if (Lib) {
      Lib.addListener('scanBatch', function (e) { if (N.hooks.entries) N.hooks.entries(e.entries || [], 'scan'); });
      Lib.addListener('scanProgress', function (e) { if (N.hooks.scanProgress) N.hooks.scanProgress(e); });
      Lib.addListener('voiceSearch', function (e) { if (N.hooks.voiceSearch) N.hooks.voiceSearch(e.query || ''); });
      Lib.addListener('openUris', function (e) { if (N.hooks.entries) N.hooks.entries(e.entries || [], 'open'); });
    }
    document.addEventListener('visibilitychange', function () { if (!document.hidden) N.resync(); syncViz(); });
  }
  wireEvents();

  // If JS was throttled while native advanced on its own, line the UI back up with what is actually playing.
  N.resync = async function () {
    var S = cur; if (!S || !S.active) return;
    try {
      var s = await Player.getState();
      if (s.uri && S.uri && !sameUri(s.uri, S.uri) && N.hooks.syncTo) N.hooks.syncTo(s.uri);
      else applySnap(S, s);
    } catch (e) {}
  };

  // ---------- effects ----------
  var fxFn = null, fxLast = '';
  function pushFx(force) {
    if (!fxFn || !cur || !cur.active) return;
    var f; try { f = fxFn(); } catch (e) { return; }
    var j = JSON.stringify(f);
    if (!force && j === fxLast) return;
    fxLast = j; call(function () { return Player.setFx(f); });
  }
  N.setFxProvider = function (fn) { fxFn = fn; setInterval(function () { pushFx(false); try { pollFilter(); } catch (e) {} if (N.hooks.tick) { try { N.hooks.tick(); } catch (e) {} } }, 400); };

  // ---------- visualizer ----------
  var fftF = null, fftT = null, smooth = null, vizOn = false;
  function dec(s) { var b = atob(s), a = new Uint8Array(b.length); for (var i = 0; i < b.length; i++) a[i] = b.charCodeAt(i); return a; }
  function syncViz() {
    var want = !!(cur && cur.active && cur.kind === 'audio' && cur.playing && !document.hidden);
    if (want === vizOn) return; vizOn = want;
    call(function () { return Player.setViz({ on: want }); });
  }
  N.decorateAnalyser = function (an) {
    var of = an.getByteFrequencyData.bind(an), ot = an.getByteTimeDomainData.bind(an);
    an.getByteFrequencyData = function (arr) {
      if (!(cur && cur.active && cur.playing && fftF)) return of(arr);
      var sm = an.smoothingTimeConstant == null ? 0.8 : an.smoothingTimeConstant;
      if (!smooth || smooth.length !== fftF.length) smooth = new Float32Array(fftF.length);
      for (var i = 0; i < arr.length; i++) {
        var v = i < fftF.length ? fftF[i] : 0;
        if (i < smooth.length) { smooth[i] = sm * smooth[i] + (1 - sm) * v; v = smooth[i]; }
        arr[i] = v;
      }
    };
    an.getByteTimeDomainData = function (arr) {
      if (!(cur && cur.active && cur.playing && fftT)) return ot(arr);
      for (var i = 0; i < arr.length; i++) arr[i] = fftT[Math.min(fftT.length - 1, Math.floor(i * fftT.length / arr.length))];
    };
  };

  // ---------- video surface placement ----------
  var rectRaf = 0, lastRect = '', rectTimer = 0, holeNodes = [], lastBackdrop = '';
  // The page must be see-through above the video box: clear the backgrounds of everything that contains it,
  // and give the window itself the page colour so the rest of the screen looks unchanged.
  function markHole(el) {
    if (!el) { holeNodes.forEach(function (n) { n.classList.remove('pp-hole-anc'); }); holeNodes = []; return; }
    if (holeNodes.length) return;
    var bg = getComputedStyle(document.body).backgroundColor, m = /rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(bg);
    for (var n = el.parentElement; n; n = n.parentElement) { n.classList.add('pp-hole-anc'); holeNodes.push(n); }
    if (m && bg !== lastBackdrop) {
      lastBackdrop = bg;
      var hex = '#' + [m[1], m[2], m[3]].map(function (x) { return ('0' + (+x).toString(16)).slice(-2); }).join('');
      call(function () { return Player.setBackdrop({ color: hex }); });
    }
  }
  function sendRect() {
    rectRaf = 0;
    var S = wrappers.video && wrappers.video.__pp;
    var show = !!(S && S.active && S.track && S.track.kind === 'video');
    document.documentElement.classList.toggle('pp-native-video', show);
    markHole(show ? S.raw : null);
    var r = { x: 0, y: 0, w: 0, h: 0, visible: false };
    if (show) {
      var b = S.raw.getBoundingClientRect(), dpr = window.devicePixelRatio || 1;
      var vis = b.width > 2 && b.height > 2 && getComputedStyle(S.raw).display !== 'none' && !document.hidden;
      r = { x: Math.round(b.left * dpr), y: Math.round(b.top * dpr), w: Math.round(b.width * dpr), h: Math.round(b.height * dpr), visible: vis };
    }
    var j = JSON.stringify(r);
    if (j !== lastRect) { lastRect = j; call(function () { return Player.setVideoRect(r); }); }
    if (show && !rectTimer) rectTimer = setInterval(scheduleRect, 300);
    if (!show && rectTimer) { clearInterval(rectTimer); rectTimer = 0; }
  }
  function scheduleRect() { if (!rectRaf) rectRaf = requestAnimationFrame(sendRect); }
  window.addEventListener('resize', scheduleRect);
  window.addEventListener('orientationchange', scheduleRect);
  document.addEventListener('transitionend', scheduleRect, true);
  document.addEventListener('animationend', scheduleRect, true);
  document.addEventListener('scroll', scheduleRect, true);
  N.scheduleRect = scheduleRect;

  // ---------- video filters: the page's whole CSS filter chain -> one GPU shader ----------
  // The app composes `videoEl.style.filter` from presets (saturate/contrast/brightness/sepia/grayscale/hue-rotate/invert),
  // auto-levels, posterize, duotone, sharpen and clarity (SVG filters) and the Adjust sliders. We read that string,
  // resolve the url(#...) parts from the same SVG attributes the page already maintains, and send an ordered op list.
  var lastFilterJson = '', lastCss = '';
  function attr(id, name) { var el = origGetById(id); return el ? el.getAttribute(name) : null; }
  function nums(a) { return String(a || '').trim().split(/\s+/).filter(Boolean).map(Number); }
  function buildOps(css, scale) {
    var ops = [], re = /([a-z-]+)\(([^)]*)\)/g, m;
    while ((m = re.exec(css))) {
      var fn = m[1], arg = m[2].trim();
      if (fn === 'url') {
        var id = arg.replace(/["'#\s]/g, '');
        if (id === 'posterize-filter') {
          var n = nums(attr('posterize-r', 'tableValues')).length;
          if (n >= 2) ops.push([7, n, 0, 0, 0, 0, 0, 0]);
        } else if (id === 'duotone-filter') {
          var lo = [], hi = [];
          ['duotone-r', 'duotone-g', 'duotone-b'].forEach(function (k) {
            var t = nums(attr(k, 'tableValues')); lo.push(t.length ? t[0] : 0); hi.push(t.length ? t[t.length - 1] : 1);
          });
          ops.push([8, lo[0], lo[1], lo[2], hi[0], hi[1], hi[2], 0]);
        } else if (id === 'sharpen-filter') {
          var km = nums(attr('sharpen-matrix', 'kernelMatrix'));
          if (km.length >= 9 && Math.abs(km[4] - 1) > 0.001) ops.push([9, km[4], km[1], 0, 0, 0, 0, 0]);
        } else if (id === 'clarity-filter') {
          var k2 = parseFloat(attr('clarity-boost', 'k2')) || 0;
          if (k2 > 0.001) ops.push([10, 2 * k2, 4 * scale, 0, 0, 0, 0, 0]);   // page formula: out = src + 2*slope*(src - blur)
        }
        continue;
      }
      var v = parseFloat(arg); if (isNaN(v)) continue;
      if (/%$/.test(arg)) v /= 100;
      switch (fn) {
        case 'brightness': if (Math.abs(v - 1) > 0.001) ops.push([0, v, 0, 0, 0, 0, 0, 0]); break;
        case 'contrast': if (Math.abs(v - 1) > 0.001) ops.push([1, v, 0, 0, 0, 0, 0, 0]); break;
        case 'saturate': if (Math.abs(v - 1) > 0.001) ops.push([2, v, 0, 0, 0, 0, 0, 0]); break;
        case 'sepia': if (v > 0.001) ops.push([3, Math.min(1, v), 0, 0, 0, 0, 0, 0]); break;
        case 'grayscale': if (v > 0.001) ops.push([4, Math.min(1, v), 0, 0, 0, 0, 0, 0]); break;
        case 'invert': if (v > 0.001) ops.push([6, Math.min(1, v), 0, 0, 0, 0, 0, 0]); break;
        case 'hue-rotate':
          var deg = /rad$/.test(arg) ? v * 180 / Math.PI : (/turn$/.test(arg) ? v * 360 : v);
          if (Math.abs(deg) > 0.01) ops.push([5, Math.cos(deg * Math.PI / 180), Math.sin(deg * Math.PI / 180), 0, 0, 0, 0, 0]);
          break;
      }
    }
    return ops;
  }
  function pushFilter(css, force) {
    if (css != null) lastCss = css;
    var S = wrappers.video && wrappers.video.__pp;
    if (!S || !S.active || !S.track || S.track.kind !== 'video') return;
    var scale = 1;
    try { scale = Math.max(0.5, Math.min(8, (S.vh || 720) / Math.max(1, S.raw.getBoundingClientRect().height))); } catch (e) {}
    var flat = [].concat.apply([], (!lastCss || lastCss === 'none') ? [] : buildOps(lastCss, scale));
    var j = JSON.stringify(flat);
    if (!force && j === lastFilterJson) return;
    lastFilterJson = j;
    call(function () { return Player.setVideoFilter({ ops: flat }); });
  }
  N.setVideoFilterCss = function (css) { pushFilter(css, false); };
  function pollFilter() {       // sliders change the SVG attributes without changing the filter string, so watch both
    var S = wrappers.video && wrappers.video.__pp;
    if (S && S.active && S.track && S.track.kind === 'video') pushFilter(S.raw.style.filter || '', false);
  }
  N.snapshot = async function () {
    var r = await Player.snapshot(), bin = atob(r.png), a = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) a[i] = bin.charCodeAt(i);
    return new Blob([a], { type: 'image/png' });
  };
  N._buildOps = buildOps;       // exposed for tests

  document.addEventListener('click', function (e) {
    var b = e.target && e.target.closest && e.target.closest('#pip-btn');
    if (b && N.videoActive()) { e.stopImmediatePropagation(); e.preventDefault(); N.enterPip(); }
  }, true);
  N.screenOn = function () {};     // native keeps the screen on while video plays (see NativePlayerPlugin)
  N.enterPip = function () { return Player.enterPip(); };
  N.getTracks = function () { return Player.getTracks(); };
  N.selectTrack = function (o) { return Player.selectTrack(o); };
  N.stop = function () { return Player.stop(); };

  // ---------- library / files ----------
  N.lib = {
    pickFiles: function () { return Lib.pickFiles(); },
    pickFolder: function () { return Lib.pickFolder(); },
    rescan: function (tree, known) { return Lib.rescan({ tree: tree, known: known || [] }); },
    listFolders: function () { return Lib.listFolders(); },
    readText: function (uri) { return Lib.readText({ uri: uri }); },
    getPendingOpen: function () { return Lib.getPendingOpen(); },
    deleteLocal: function (uri) { return Lib.deleteLocal({ uri: uri }); },
    saveToDevice: function (o) { return Lib.saveToDevice(o); },
    fileSrc: function (path) { return Cap.convertFileSrc('file://' + String(path).replace(/^file:\/\//, '')); }
  };

  // ---------- background jobs ----------
  N.jobs = {
    run: async function (title, fn) {
      if (!Jobs) return fn(function () {});
      var id = 'j' + Date.now() + Math.random().toString(36).slice(2, 6);
      await Jobs.start({ id: id, title: title, text: 'Starting…', progress: -1 });
      var ok = true;
      try {
        return await fn(function (pct, text) { Jobs.update({ id: id, title: title, text: text || '', progress: pct == null ? -1 : Math.round(pct) }); });
      } catch (e) { ok = false; throw e; }
      finally { Jobs.finish({ id: id, title: title, ok: ok, text: ok ? 'Tap to open' : 'Something went wrong' }); }
    }
  };

  // ---------- library catalog for Android Auto / Assistant / car kits ----------
  N.pushCatalog = function (items, playlists) { call(function () { return Player.setCatalog({ items: items, playlists: playlists }); }); };
  // Move every legacy IndexedDB track onto disk so the whole library is playable/browsable natively.
  N.migrateAll = async function (tracks) {
    var todo = (tracks || []).filter(function (t) { return !t.nativeUri && !t.remoteUrl; }), i = 0;
    await N.jobs.run('Moving library to device storage', async function (progress) {
      for (; i < todo.length; i++) {
        progress(100 * i / Math.max(1, todo.length), (i + 1) + ' of ' + todo.length + ': ' + (todo[i].title || ''));
        try { await ensureLocal(todo[i]); } catch (e) {}
      }
    });
  };

  // ---------- boot ----------
  N.boot = async function () {
    try {
      var p = await Lib.getPendingOpen();
      if (p.entries && p.entries.length && N.hooks.entries) N.hooks.entries(p.entries, 'open');
      if (p.query != null && N.hooks.voiceSearch) N.hooks.voiceSearch(p.query);
    } catch (e) {}
  };
})();
