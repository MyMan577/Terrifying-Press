// ===================== The alarm page: stand-ins for the app =====================
// The widgets were written for the whole app: they read the library through window.__ppApi / __ppHomeKit and work the
// player through its own controls (#play-btn, #next-btn, #volume, #np-title...). The alarm page has none of that, so
// here are small stand-ins for just those, driven by the phone's own player (window.PPAlarm, AlarmActivity.kt), which
// is already playing the alarm's songs when this page loads. "The library" is the alarm's songs, in the order they play.
(function(){
  'use strict';
  var P = window.PPAlarm || null;           // the native side; missing when this page is opened in a browser (for tests)
  var AP = window.__ppAlarmPage;
  function parse(s, d){ try { return JSON.parse(s) || d; } catch(e){ return d; } }
  var INFO = P ? parse(P.info(), {}) : (window.__ppAlarmTest || {});
  AP.info = INFO;
  var Q = (INFO.q || []).map(function(x, k){
    return { dbId: x.id || ('q' + k), title: x.t || 'Song', artist: x.a || '', album: x.al || '', kind: 'audio', ext: '',
             artUrl: x.art ? (x.art.indexOf('http') === 0 ? x.art : '/_capacitor_file_' + String(x.art).replace(/^file:\/\//, '')) : null };
  });
  // what the player is doing: refreshed four times a second (cheap: the native side keeps it ready)
  var S = { i: -1, playing: false, pos: 0, dur: 0, vol: 100 };
  function pull(){ if (P) { var s = parse(P.state(), null); if (s) S = s; } else if (window.__ppAlarmTestState) S = window.__ppAlarmTestState; }
  pull();
  function cmd(c, v){ if (P) try { P.cmd(c, v == null ? '' : String(v)); } catch(e){} setTimeout(sync, 60); }
  AP.cmd = cmd; AP.state = function(){ return S; };

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
  function sync(keep){
    if (!keep) pull();
    var t = Q[S.i] || null, pb = $('play-btn');
    var lbl = S.playing ? 'Pause' : 'Play'; if (pb.getAttribute('aria-label') !== lbl) pb.setAttribute('aria-label', lbl);
    setTxt($('np-title'), t ? t.title : ''); setTxt($('np-artist'), t ? t.artist : '');
    $('seek').value = S.dur ? Math.round(S.pos / S.dur * 1000) : 0;
    if (Date.now() - volBusy > 1500) $('volume').value = Math.round(S.vol);
  }
  setInterval(sync, 250);
  sync(true);

  // ---------- the library and player API the widgets ask for ----------
  var api = {
    tracks: function(){ return Q; },
    playlists: function(){ return []; },
    currentIndex: function(){ return S.i; },
    orderFor: function(idxs){ return idxs; },
    play: function(i){ cmd('playAt', i); },
    w: {
      kind: function(){ return 'audio'; },
      time: function(){ return { t: S.pos, d: S.dur }; },
      seek: function(sec){ cmd('seek', sec); },
      upNext: function(n){ var out = []; for (var k = S.i + 1; k < Q.length && out.length < (n || 4); k++) out.push(k); return out; },
      jump: function(i){ cmd('playAt', i); },
      playNext: function(){},
      sleep: function(){ return { mode: 'off' }; }, sleepFor: function(){}, sleepEnd: function(){}, sleepOff: function(){}
    }
  };
  window.__ppApi = api;
  var noop = function(){}, empty = function(){ return ''; };
  window.__ppHomeKit = {
    hasTrack: function(){ return S.i >= 0 && !!Q[S.i]; },
    playFrom: function(i){ cmd('playAt', i); },
    history: function(){ return []; },
    view: function(){ return 'home'; }, setView: noop, goTab: noop,
    openPlayer: noop, closePlayer: noop, playerOpen: function(){ return false; },
    on: noop, observe: noop, renderHome: noop,
    cardHTML: empty, listRowHTML: empty, sectionHTML: empty, thumbHTML: empty,
    relTime: function(){ return ''; }
  };
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
