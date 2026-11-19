// ===================== The alarm page: stand-ins for the app =====================
// The widgets were written for the whole app: they read the library through window.__ppApi / __ppHomeKit and work the
// player through its own controls (#play-btn, #next-btn, #volume, #np-title...). The alarm page has none of that, so
// here are small stand-ins for just those, driven by the phone's own player (window.PPAlarm, AlarmActivity.kt), which
// is already playing the alarm's songs when this page loads.
// "The library" here is not the whole library: it is what the ringing screen's widgets showed when the app last saved
// it ('ppRingSnapV1', pp-widgets-pendulum.js ringSnapSave), in library order, plus the alarm's own songs.
(function(){
  'use strict';
  var P = window.PPAlarm || null;           // the native side; missing when this page is opened in a browser (for tests)
  var AP = window.__ppAlarmPage;
  function parse(s, d){ try { return JSON.parse(s) || d; } catch(e){ return d; } }
  var INFO = P ? parse(P.info(), {}) : (window.__ppAlarmTest || {});
  AP.info = INFO;
  var SNAP = {}; try { SNAP = JSON.parse(localStorage.getItem('ppRingSnapV1')) || {}; } catch(e){}
  function artUrl(p){ return p ? (/^(https?:|data:|blob:)/.test(p) ? p : '/_capacitor_file_' + String(p).replace(/^file:\/\//, '')) : null; }

  // ---------- the library: the saved songs, then the alarm's songs that are not among them ----------
  var LIB = (SNAP.tracks || []).map(function(x){ var t = {}; for (var k in x) t[k] = x[k]; t.artUrl = artUrl(x.nativeArt); return t; });
  var byId = {};
  LIB.forEach(function(t, i){ byId[String(t.dbId)] = i; });
  (INFO.q || []).concat(INFO.tq || []).forEach(function(x, k){
    var id = String(x.id || ('q' + k)); if (byId[id] != null) return;
    byId[id] = LIB.length;
    LIB.push({ dbId: x.id || id, title: x.t || 'Song', artist: x.a || '', album: x.al || '', kind: 'audio', ext: '', u: x.u, nativeArt: x.art || null,
               artUrl: artUrl(x.art), cueStart: x.cs != null ? x.cs / 1000 : undefined, cueEnd: x.ce != null ? x.ce / 1000 : undefined, playlistIds: [] });
  });
  var PLS = SNAP.playlists || [], HIST = SNAP.hist || [];
  // smart tags, for the genre widget (only those of the saved songs)
  if (SNAP.tags) window.PPVocals = { loadTags: function(){ return SNAP.tags; } };

  // what the player is doing (S.i: its place in the player's list, S.id: the song, S.up: the songs after it): refreshed four times a second (cheap: the native side keeps it ready)
  var S = { i: -1, playing: false, pos: 0, dur: 0, vol: 100 };
  function pull(){ if (P) { var s = parse(P.state(), null); if (s) S = s; } else if (window.__ppAlarmTestState) S = window.__ppAlarmTestState; }
  pull();
  function cmd(c, v){ if (P) try { P.cmd(c, v == null ? '' : String(v)); } catch(e){} setTimeout(sync, 60); }
  AP.cmd = cmd; AP.state = function(){ return S; };
  function curIdx(){ return S.id != null && byId[String(S.id)] != null ? byId[String(S.id)] : -1; }

  // a song as the phone's player takes it; null when it is not kept on the phone itself
  function itemOf(i){
    var t = LIB[i]; if (!t || !t.u || t.kind === 'video') return null;
    var o = { id: String(t.dbId), u: t.u, t: t.title || 'Song' };
    if (t.artist) o.a = t.artist; if (t.album) o.al = t.album; if (t.nativeArt) o.art = t.nativeArt;
    if (t.cueStart != null){ o.cs = Math.round(t.cueStart * 1000); if (t.cueEnd > t.cueStart) o.ce = Math.round(t.cueEnd * 1000); }
    return o;
  }
  // plays song i, then the rest of q after it (as the app does)
  function playFrom(i, q){
    q = Array.isArray(q) && q.length ? q.slice() : [i];
    var at = q.indexOf(i); if (at < 0){ q.unshift(i); at = 0; }
    if (!itemOf(i)){ window.ppToast && window.ppToast(LIB[i] && LIB[i].kind === 'video' ? 'Videos don’t play on the alarm screen.' : 'That one isn’t kept on the phone itself, so it can’t play here.'); return; }
    var items = [];
    q.slice(at).concat(q.slice(0, at)).forEach(function(k){ var it = itemOf(k); if (it && items.length < 200) items.push(it); });
    cmd('queue', JSON.stringify({ items: items, start: 0 }));
  }
  // at: a place in the player's list (-1: the end)
  function insert(i, at){ var it = itemOf(i); if (!it) return false; cmd('insert', JSON.stringify({ items: [it], at: at })); return true; }
  function playNext(i){ return insert(i, S.i + 1); }
  function upcoming(n){ return (S.up || []).map(function(id){ return byId[String(id)]; }).filter(function(i){ return i != null; }).slice(0, n || 4); }

  // ---------- the player's own controls, hidden: the widgets click and read these ----------
  var box = document.createElement('div'); box.id = 'pp-alarm-standins'; box.hidden = true;
  box.innerHTML = '<button id="play-btn" type="button" aria-label="Play"></button><button id="next-btn" type="button"></button><button id="prev-btn" type="button"></button>' +
    '<span id="np-title"></span><span id="np-artist"></span><input id="seek" type="range" min="0" max="1000" value="0">' +
    '<input id="volume" type="range" min="0" max="100" value="100"><input id="speed-slider" type="range" min="0.25" max="3" step="0.05" value="1">';
  document.body.appendChild(box);
  var $ = function(id){ return document.getElementById(id); };
  $('play-btn').addEventListener('click', function(){ cmd(S.playing ? 'pause' : 'play'); S.playing = !S.playing; sync(true); });
  $('next-btn').addEventListener('click', function(){ cmd('next'); });
  $('prev-btn').addEventListener('click', function(){ cmd('prev'); });
  $('volume').addEventListener('input', function(){ S.vol = +this.value; cmd('vol', this.value); });
  $('seek').addEventListener('input', function(){ if (S.dur) cmd('seek', (+this.value / 1000) * S.dur); });
  var volBusy = 0;
  document.addEventListener('pointerdown', function(e){ if (e.target && e.target.closest && e.target.closest('input[type=range]')) volBusy = Date.now(); }, true);
  function setTxt(el, v){ if (el.textContent !== v) el.textContent = v; }
  var lastCur = null;
  function sync(keep){
    if (!keep) pull();
    var ci = curIdx(), t = LIB[ci] || null, pb = $('play-btn');
    var lbl = S.playing ? 'Pause' : 'Play'; if (pb.getAttribute('aria-label') !== lbl) pb.setAttribute('aria-label', lbl);
    setTxt($('np-title'), t ? t.title : ''); setTxt($('np-artist'), t ? t.artist || '' : '');
    $('seek').value = S.dur ? Math.round(S.pos / S.dur * 1000) : 0;
    if (Date.now() - volBusy > 1500) $('volume').value = Math.round(S.vol);
    if (ci !== lastCur){ lastCur = ci; try { document.dispatchEvent(new Event('pp-queue')); } catch(e){} }   // the queue widgets redraw
  }
  setInterval(sync, 250);
  sync(true);

  // ---------- the library and player API the widgets ask for ----------
  var api = {
    tracks: function(){ return LIB; },
    playlists: function(){ return PLS; },
    counts: SNAP.counts ? function(){ return SNAP.counts; } : null,
    currentIndex: curIdx,
    orderFor: function(idxs, plId){
      var pl = PLS.filter(function(p){ return p.id === plId; })[0];
      if (!pl || !Array.isArray(pl.order) || !pl.order.length) return idxs;
      var have = {}; idxs.forEach(function(i){ have[String(LIB[i].dbId)] = i; });
      var out = []; pl.order.forEach(function(id){ var i = have[String(id)]; if (i != null){ out.push(i); delete have[String(id)]; } });
      idxs.forEach(function(i){ if (have[String(LIB[i].dbId)] != null) out.push(i); });
      return out;
    },
    play: function(i, q){ playFrom(i, q); },
    w: {
      kind: function(){ return 'audio'; },
      time: function(){ return { t: S.pos, d: S.dur }; },
      seek: function(sec){ cmd('seek', sec); },
      upNext: upcoming,
      jump: function(i){ var p = upcoming(200).indexOf(i); if (p >= 0) cmd('playAt', S.i + 1 + p); else playFrom(i, [i]); },
      playNext: playNext,
      positions: function(){ return SNAP.pos || {}; },
      sleep: function(){ return { mode: 'off' }; }, sleepFor: function(){}, sleepEnd: function(){}, sleepOff: function(){}
    }
  };
  if (!api.counts) delete api.counts;
  window.__ppApi = api;
  // the queue, as the queue widgets read and change it
  window.__ppQueue = {
    state: function(n){ return { cur: curIdx(), up: upcoming(n || 200).map(function(i){ return { i: i }; }), picked: 0, shuffle: false, repeat: 'all', playingQueued: false, playing: !!S.playing }; },
    add: function(idxs, next){ var n = 0; (next ? (idxs || []).slice().reverse() : idxs || []).forEach(function(i){ if (next ? playNext(i) : insert(i, -1)) n++; }); return n; },
    removeAt: function(pos){ if (pos >= 0 && S.i >= 0) cmd('removeAt', S.i + 1 + pos); },
    jumpAt: function(pos){ if (pos >= 0 && S.i >= 0) cmd('playAt', S.i + 1 + pos); },
    moveAt: function(){}
  };

  // ---------- song cards and rows, drawn like the app's Home (player-layout.js) ----------
  var esc = function(v){ return String(v == null ? '' : v).replace(/[&<>"']/g, function(c){ return { '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]; }); };
  var fmtDur = function(sec){
    if (!isFinite(sec) || sec == null || sec <= 0) return '';
    sec = Math.round(sec); var h = Math.floor(sec / 3600), m = Math.floor(sec % 3600 / 60), r = sec % 60;
    return h ? h + ':' + String(m).padStart(2, '0') + ':' + String(r).padStart(2, '0') : m + ':' + String(r).padStart(2, '0');
  };
  var relTime = function(ts){
    var d = (Date.now() - ts) / 1000;
    if (d < 60) return 'Just now'; if (d < 3600) return Math.floor(d / 60) + ' min ago'; if (d < 86400) return Math.floor(d / 3600) + ' h ago';
    if (d < 86400 * 30) return Math.floor(d / 86400) + ' d ago'; return new Date(ts).toLocaleDateString();
  };
  var IC_PH = '<svg class="ph-ph" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="14" rx="2"/><polygon points="10 9 16 12 10 15 10 9" fill="currentColor"/></svg>';
  var IC_PH_AUDIO = '<svg class="ph-ph" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>';
  function thumbHTML(t, showDur){
    var src = t && t.artUrl, d = showDur && t ? fmtDur(t.duration) : '';
    return '<div class="ph-thumb' + (src ? ' has-img' : '') + '" data-thumb-id="' + esc(t ? t.dbId : '') + '">' + (src ? '<img src="' + esc(src) + '" alt="" loading="lazy" decoding="async">' : '') +
      (t && t.kind === 'audio' ? IC_PH_AUDIO : IC_PH) + (d ? '<span class="ph-dur">' + d + '</span>' : '') + '</div>';
  }
  function cardHTML(t, i, srcKey, sub, cur){
    return '<button type="button" class="ph-card' + (cur ? ' cur' : '') + '" data-act="play-video" data-src="' + srcKey + '" data-idx="' + i + '">' + thumbHTML(t, true) +
      '<div class="ph-title">' + esc(t.title) + '</div><div class="ph-sub">' + esc(sub) + '</div></button>';
  }
  function listRowHTML(t, i, srcKey, sub, cur){
    return '<button type="button" class="ph-card ph-lrow' + (cur ? ' cur' : '') + '" data-act="play-video" data-src="' + srcKey + '" data-idx="' + i + '">' + thumbHTML(t, true) +
      '<div class="ph-lrow-text"><div class="ph-title">' + esc(t.title) + '</div><div class="ph-sub">' + esc(sub) + '</div></div></button>';
  }
  function sectionHTML(key, title, items, emptyMsg, extraBtn){
    return '<section class="ph-sec"><div class="ph-sec-head"><h2>' + title + '</h2><span class="ph-count">' + (items.length || '') + '</span><span class="ph-spacer"></span>' + (extraBtn || '') + '</div>' +
      (items.length ? '<div class="ph-row">' + items.slice(0, 10).join('') + '</div>' : '<div class="ph-empty">' + emptyMsg + '</div>') + '</section>';
  }
  var noop = function(){};
  window.__ppHomeKit = {
    cardHTML: cardHTML, listRowHTML: listRowHTML, sectionHTML: sectionHTML, thumbHTML: thumbHTML, esc: esc, relTime: relTime, fmtDur: fmtDur,
    hasTrack: function(){ return curIdx() >= 0; },
    playFrom: playFrom,
    history: function(){ return HIST; },
    view: function(){ return 'home'; }, setView: noop, goTab: noop,
    openPlayer: noop, closePlayer: noop, playerOpen: function(){ return false; },
    on: function(){ return true; }, observe: noop, renderHome: noop
  };
  // a song card on the ringing screen plays it, and the rest of its row after it
  document.addEventListener('click', function(e){
    var c = e.target.closest && e.target.closest('#pp-ringscreen [data-act="play-video"]'); if (!c) return;
    var q = c.closest('[data-pw-q]'), i = +c.dataset.idx;
    var queue = q ? q.dataset.pwQ.split(',').filter(Boolean).map(Number) : [].map.call(c.parentNode.querySelectorAll('[data-act="play-video"]'), function(b){ return +b.dataset.idx; });
    playFrom(i, queue);
  });
  window.__ppThumbSrc = function(t){ return t && t.artUrl || null; };
  window.__ppEdition = function(){ try { return localStorage.getItem('ppPlaygroundMode') === '1' ? 'playground' : localStorage.getItem('ppPlusMode') === '1' ? 'plus' : localStorage.getItem('ppPremiumMode') === '1' ? 'premium' : localStorage.getItem('ppFocusMode') === '1' ? 'focus' : ''; } catch(e){ return ''; } };
  // a short message along the bottom (the widgets' toast)
  var tt = 0;
  window.ppToast = function(m){
    var el = $('pp-alarm-toast');
    if (!el){ el = document.createElement('div'); el.id = 'pp-alarm-toast'; document.body.appendChild(el); }
    el.textContent = String(m || ''); el.classList.add('on'); clearTimeout(tt); tt = setTimeout(function(){ el.classList.remove('on'); }, 2600);
  };
  window.ppCaught = function(e){ try { console.error(e); } catch(x){} };
  try { if (localStorage.getItem('ppRefinedLook') !== '0') document.body.classList.add('pp-refined'); } catch(e){ document.body.classList.add('pp-refined'); }
})();
