// ===================== Widgets & layout (Customize > Layout) =====================
// Zones hold boxes. A zone is the Home screen, a page the user made, or the strip in the player.
// Every box is a widget: either a built-in part of the app (title, Games button, the Videos row...) or a new one
// (clock, now-playing card, action buttons, text, images, more rows...). Boxes sit in rows by width, can be moved,
// resized, set up, removed and added in edit mode on the page itself. The tab bar has its own list.
// Saved in localStorage 'ppLayoutV1'. A zone with nothing saved renders exactly as before.
(function(){
  'use strict';
  var KEY = 'ppLayoutV1';
  var body = document.body;
  var kit = function(){ return window.__ppHomeKit || null; };
  var api = function(){ return window.__ppApi || null; };
  function toast(m){ try { if (window.ppToast) window.ppToast(m); } catch(e){} }
  function esc(v){ return String(v == null ? '' : v).replace(/[&<>"']/g, function(c){ return { '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]; }); }
  function uid(){ return Math.random().toString(36).slice(2, 9); }
  function clone(x){ return JSON.parse(JSON.stringify(x)); }

  // ---------- icons ----------
  var P = {
    home:'<path d="M3 11l9-8 9 8"/><path d="M5 10v10h5v-6h4v6h5V10"/>',
    list:'<line x1="3" y1="6" x2="15" y2="6"/><line x1="3" y1="12" x2="15" y2="12"/><line x1="3" y1="18" x2="10" y2="18"/><polygon points="15 15 21 18.5 15 22 15 15" fill="currentColor"/>',
    library:'<line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><circle cx="3.5" cy="6" r="1"/><circle cx="3.5" cy="12" r="1"/><circle cx="3.5" cy="18" r="1"/>',
    sliders:'<line x1="4" y1="21" x2="4" y2="14"/><line x1="4" y1="10" x2="4" y2="3"/><line x1="12" y1="21" x2="12" y2="12"/><line x1="12" y1="8" x2="12" y2="3"/><line x1="20" y1="21" x2="20" y2="16"/><line x1="20" y1="12" x2="20" y2="3"/><line x1="1" y1="14" x2="7" y2="14"/><line x1="9" y1="8" x2="15" y2="8"/><line x1="17" y1="16" x2="23" y2="16"/>',
    game:'<rect x="2" y="7" width="20" height="11" rx="5"/><path d="M7 10.5v3M5.5 12h3"/><circle cx="16" cy="11" r=".9" fill="currentColor"/><circle cx="18" cy="13.2" r=".9" fill="currentColor"/>',
    play:'<polygon points="7 4 20 12 7 20 7 4" fill="currentColor"/>',
    pause:'<rect x="6" y="5" width="4" height="14" fill="currentColor"/><rect x="14" y="5" width="4" height="14" fill="currentColor"/>',
    next:'<polygon points="5 5 15 12 5 19 5 5" fill="currentColor"/><line x1="19" y1="5" x2="19" y2="19"/>',
    prev:'<polygon points="19 5 9 12 19 19 19 5" fill="currentColor"/><line x1="5" y1="5" x2="5" y2="19"/>',
    shuffle:'<path d="M16 3h5v5M4 20L21 3M21 16v5h-5M15 15l6 6M4 4l5 5"/>',
    dice:'<rect x="3" y="3" width="18" height="18" rx="4"/><circle cx="8" cy="8" r="1.3" fill="currentColor"/><circle cx="16" cy="16" r="1.3" fill="currentColor"/><circle cx="12" cy="12" r="1.3" fill="currentColor"/>',
    moon:'<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/>',
    star:'<polygon points="12 2 15.1 8.3 22 9.3 17 14.1 18.2 21 12 17.8 5.8 21 7 14.1 2 9.3 8.9 8.3 12 2"/>',
    heart:'<path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21.2l8.8-8.8a5.5 5.5 0 0 0 0-7.8z"/>',
    music:'<path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>',
    video:'<rect x="3" y="5" width="18" height="14" rx="2"/><polygon points="10 9 16 12 10 15 10 9" fill="currentColor"/>',
    clock:'<circle cx="12" cy="12" r="9"/><polyline points="12 7 12 12 15 14"/>',
    bolt:'<polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>',
    grid:'<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
    headphones:'<path d="M3 18v-6a9 9 0 0 1 18 0v6"/><path d="M21 19a2 2 0 0 1-2 2h-1v-6h3zM3 19a2 2 0 0 0 2 2h1v-6H3z"/>',
    fire:'<path d="M12 22c4 0 7-3 7-7 0-5-4-7-5-11-2 2-3 4-3 6-1-1-2-2-2-4-2 2-4 5-4 9 0 4 3 7 7 7z"/>',
    sparkle:'<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"/><path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z"/>',
    palette:'<circle cx="12" cy="12" r="9"/><circle cx="8" cy="10" r="1.2" fill="currentColor"/><circle cx="12" cy="7.5" r="1.2" fill="currentColor"/><circle cx="16" cy="10" r="1.2" fill="currentColor"/><path d="M12 21a2 2 0 0 1 0-4h2a3 3 0 0 0 3-3"/>',
    page:'<path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><polyline points="14 3 14 9 20 9"/>',
    user:'<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
    folder:'<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
    chart:'<line x1="6" y1="20" x2="6" y2="12"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="18" y1="20" x2="18" y2="9"/>',
    text:'<polyline points="4 7 4 4 20 4 20 7"/><line x1="9" y1="20" x2="15" y2="20"/><line x1="12" y1="4" x2="12" y2="20"/>',
    image:'<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/>',
    minus:'<line x1="4" y1="12" x2="20" y2="12"/>',
    check:'<polyline points="20 6 9 17 4 12"/>',
    space:'<line x1="12" y1="3" x2="12" y2="21"/><polyline points="8 7 12 3 16 7"/><polyline points="8 17 12 21 16 17"/>',
    sun:'<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
    history:'<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><polyline points="3 3 3 8 8 8"/><polyline points="12 7 12 12 15 14"/>',
    tabs:'<rect x="3" y="4" width="18" height="16" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="9" y1="4" x2="9" y2="9"/>',
    title:'<path d="M4 6h16M4 12h10M4 18h7"/>',
    plus:'<line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>',
    gear:'<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
    x:'<line x1="6" y1="6" x2="18" y2="18"/><line x1="18" y1="6" x2="6" y2="18"/>',
    grip:'<circle cx="9" cy="6" r="1.3" fill="currentColor"/><circle cx="15" cy="6" r="1.3" fill="currentColor"/><circle cx="9" cy="12" r="1.3" fill="currentColor"/><circle cx="15" cy="12" r="1.3" fill="currentColor"/><circle cx="9" cy="18" r="1.3" fill="currentColor"/><circle cx="15" cy="18" r="1.3" fill="currentColor"/>',
    up:'<polyline points="6 15 12 9 18 15"/>', down:'<polyline points="6 9 12 15 18 9"/>',
    undo:'<path d="M9 14L4 9l5-5"/><path d="M4 9h11a5 5 0 0 1 0 10h-3"/>',
    eye:'<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>',
    copy:'<rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>',
    layers:'<polygon points="12 2 22 7 12 12 2 7 12 2"/><polyline points="2 12 12 17 22 12"/><polyline points="2 17 12 22 22 17"/>',
    bookmark:'<path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/>',
    wave:'<line x1="4" y1="10" x2="4" y2="14"/><line x1="8" y1="6" x2="8" y2="18"/><line x1="12" y1="3" x2="12" y2="21"/><line x1="16" y1="7" x2="16" y2="17"/><line x1="20" y1="10" x2="20" y2="14"/>',
    trophy:'<path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0z"/><path d="M17 5h3a3 3 0 0 1-3 4M7 5H4a3 3 0 0 0 3 4"/>',
    chat:'<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>',
    send:'<line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2" fill="currentColor"/>',
    queue:'<line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="15" y2="12"/><line x1="3" y1="18" x2="11" y2="18"/><polyline points="17 15 21 18 17 21"/>',
    tag:'<path d="M20.6 13.4l-7.2 7.2a2 2 0 0 1-2.8 0L3 13V3h10l7.6 7.6a2 2 0 0 1 0 2.8z"/><circle cx="7.5" cy="7.5" r="1.5" fill="currentColor"/>',
    film:'<rect x="2" y="3" width="20" height="18" rx="2"/><line x1="7" y1="3" x2="7" y2="21"/><line x1="17" y1="3" x2="17" y2="21"/><line x1="2" y1="12" x2="22" y2="12"/>',
    vol:'<polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" fill="currentColor"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/><path d="M19 5a10 10 0 0 1 0 14"/>',
    mute:'<polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" fill="currentColor"/><line x1="16" y1="9" x2="22" y2="15"/><line x1="22" y1="9" x2="16" y2="15"/>',
    search:'<circle cx="11" cy="11" r="7"/><line x1="16.5" y1="16.5" x2="21" y2="21"/>',
    chevl:'<polyline points="15 18 9 12 15 6"/>',
    chevr:'<polyline points="9 18 15 12 9 6"/>',
    spinner:'<circle cx="12" cy="12" r="2.5"/><circle cx="12" cy="5" r="3"/><circle cx="5.9" cy="15.5" r="3"/><circle cx="18.1" cy="15.5" r="3"/>',
    swirl:'<path d="M12 12a2 2 0 1 1 2-2c0 3-3 5-6 4.5S3 11 4.5 7.5 11 2 15 3.5s6.5 6 5 10-6 7-10.5 6.5"/><circle cx="19" cy="5" r=".6" fill="currentColor"/><circle cx="5" cy="19" r=".6" fill="currentColor"/>',
    bubbles:'<circle cx="7" cy="7" r="3"/><circle cx="17" cy="7" r="3"/><circle cx="7" cy="17" r="3"/><circle cx="17" cy="17" r="3" fill="currentColor"/>',
    toggle:'<rect x="2" y="7" width="20" height="10" rx="5"/><circle cx="16" cy="12" r="3" fill="currentColor"/>',
    knob:'<circle cx="12" cy="12" r="7"/><line x1="12" y1="12" x2="15" y2="8"/><line x1="12" y1="1.5" x2="12" y2="3"/><line x1="22.5" y1="12" x2="21" y2="12"/><line x1="1.5" y1="12" x2="3" y2="12"/><line x1="19.4" y1="4.6" x2="18.3" y2="5.7"/><line x1="4.6" y1="4.6" x2="5.7" y2="5.7"/>',
    blob:'<path d="M12 3c4.5 0 8.5 3 8.5 8.5S17 21 12 21 3.5 17.5 3.5 12 7.5 3 12 3z"/><circle cx="9.5" cy="11" r=".9" fill="currentColor"/><circle cx="14.5" cy="11" r=".9" fill="currentColor"/><path d="M10 14.5q2 1.5 4 0"/>'
  };
  function svg(name){ return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + (P[name] || P.star) + '</svg>'; }
  var ICON_CHOICES = ['star','heart','music','video','headphones','play','shuffle','dice','game','moon','sun','clock','bolt','fire','sparkle','grid','list','library','folder','page','chart','history','user','palette','sliders','home','wave','trophy','chat','bookmark','queue','tag','film','layers'];

  // ---------- actions (buttons and tabs can run any of these) ----------
  function click(id){ var e = document.getElementById(id); if (e) e.click(); return !!e; }
  function playable(){ var A = api(); if (!A) return []; var t = A.tracks(), q = []; t.forEach(function(x, i){ if (!x.stem) q.push(i); }); return q; }
  function shuffled(q){ q = q.slice(); for (var k = q.length - 1; k > 0; k--){ var r = Math.floor(Math.random() * (k + 1)); var x = q[k]; q[k] = q[r]; q[r] = x; } return q; }
  function playQ(q){ var K = kit(); if (!K || !q.length){ toast('Nothing to play yet. Add files from the Library tab.'); return; } K.playFrom(q[0], q); }
  function kindQ(kind){ var A = api(); return playable().filter(function(i){ return A.tracks()[i].kind === kind; }); }
  var ACTIONS = {
    playpause: { label:'Play / pause', icon:'play', run:function(){ click('play-btn'); } },
    next:      { label:'Next track', icon:'next', run:function(){ click('next-btn'); } },
    prev:      { label:'Previous track', icon:'prev', run:function(){ click('prev-btn'); } },
    shuffleall:{ label:'Shuffle everything', icon:'shuffle', run:function(){ playQ(shuffled(playable())); } },
    shufflevid:{ label:'Shuffle videos', icon:'video', run:function(){ playQ(shuffled(kindQ('video'))); } },
    shuffleaud:{ label:'Shuffle music', icon:'music', run:function(){ playQ(shuffled(kindQ('audio'))); } },
    random:    { label:'Random track', icon:'dice', run:function(){ var q = playable(); if (!q.length) return playQ(q); var i = q[Math.floor(Math.random() * q.length)]; kit().playFrom(i, q); } },
    resume:    { label:'Resume', icon:'history', run:function(){
      var A = api(), K = kit(); if (!A || !K) return; var t = A.tracks(), byId = new Map(t.map(function(x, i){ return [x.dbId, i]; }));
      var h = K.history().map(function(x){ return byId.get(x.id); }).filter(function(i){ return i != null; });
      if (h.length) K.playFrom(h[0], h); else toast('Nothing played yet.'); } },
    player:    { label:'Open player', icon:'headphones', run:function(){ var K = kit(); if (K && K.hasTrack()) K.openPlayer(); else toast('Play something first.'); } },
    games:     { label:'Games', icon:'game', games:true },
    home:      { label:'Home', icon:'home', run:function(){ goView('home'); } },
    playlists: { label:'Playlists', icon:'list', run:function(){ goView('playlists'); } },
    library:   { label:'Library', icon:'library', run:function(){ goView('library'); } },
    settings:  { label:'Settings', icon:'sliders', run:function(){ goView('settings'); } },
    sleep:     { label:'Sleep timer', icon:'moon', run:function(){ var K = kit(); if (K && K.hasTrack()){ K.openPlayer(); setTimeout(function(){ click('sleep-btn'); }, 350); } else toast('Play something first.'); } },
    sleep30:   { label:'Sleep in 30 minutes', icon:'moon', run:function(){ var w = wapi(); if (w){ w.sleepFor(30); toast('Sleep timer: 30 minutes.'); liveSoon(); } } },
    sleepend:  { label:'Sleep after this track', icon:'moon', run:function(){ var w = wapi(); if (w){ w.sleepEnd(); toast('Stopping at the end of this track.'); liveSoon(); } } },
    sleepoff:  { label:'Sleep timer off', icon:'moon', run:function(){ var w = wapi(); if (w){ w.sleepOff(); toast('Sleep timer off.'); liveSoon(); } } },
    bloopy:    { label:'Chat with Bloopy', icon:'chat', run:function(){ askBloopy(''); } },
    eq:        { label:'Equalizer', icon:'sliders', run:function(){ if (!click('eq-btn')) toast('Equalizer is in Settings.'); } },
    customize: { label:'Customize', icon:'palette', run:function(){ click('customize-btn'); } },
    editlayout:{ label:'Edit this layout', icon:'grid', run:function(){ startEdit(currentZoneOnScreen()); } },
    page:      { label:'Open a page', icon:'page', run:function(o){ if (o && o.page) openPage(o.page); else toast('Pick a page in this button’s settings.'); } },
    shufpl:    { label:'New shuffled playlist of everything', icon:'shuffle', run:function(){
      var A = api(); if (!A || !A.makeShuffledPlaylist) return;
      var pl = A.makeShuffledPlaylist(null); if (!pl) return;
      goView('playlists'); setTimeout(function(){ if (window.__ppOpenPlaylist) window.__ppOpenPlaylist(pl.id); }, 50); } },
    mute:      { label:'Mute / unmute', icon:'mute', run:function(){ var vo = document.getElementById('volume'); if (!vo) return; if (+vo.value > 0){ volBefore = +vo.value; inputTo('volume', 0); } else inputTo('volume', volBefore || 80); liveSoon(); } },
    volup:     { label:'Volume up', icon:'vol', run:function(){ var vo = document.getElementById('volume'); if (vo) inputTo('volume', Math.min(100, +vo.value + 10)); liveSoon(); } },
    voldown:   { label:'Volume down', icon:'vol', run:function(){ var vo = document.getElementById('volume'); if (vo) inputTo('volume', Math.max(0, +vo.value - 10)); liveSoon(); } },
    fwd10:     { label:'Skip ahead 10 s', icon:'next', run:function(){ var w = wapi(), tm = media2(); if (w && tm.d) w.seek(Math.min(tm.d - 0.5, tm.t + 10)); else toast('Play something first.'); } },
    back10:    { label:'Back 10 s', icon:'prev', run:function(){ var w = wapi(), tm = media2(); if (w && tm.d) w.seek(Math.max(0, tm.t - 10)); else toast('Play something first.'); } }
  };
  function wapi(){ var A = api(); return A && A.w ? A.w : null; }
  function runAction(name, o){
    var a = ACTIONS[name]; if (!a || !a.run) return;
    try { a.run(o); } catch(e){ toast('That did not work: ' + e.message); }
  }

  // ---------- layout state ----------
  var L = load();
  function blank(){ return { v:1, zones:{}, tabs:null, pages:[], hide:[] }; }
  function load(){
    try {
      var x = JSON.parse(localStorage.getItem(KEY));
      if (x && x.v === 1 && x.zones) return Object.assign(blank(), x);
    } catch(e){}
    return blank();
  }
  var undoStack = [], sigN = 0;
  function save(noUndo){
    sigN++;
    try { localStorage.setItem(KEY, JSON.stringify(L)); }
    catch(e){ toast('Could not save the layout: the phone’s app storage is full (big images?).'); }
  }
  function remember(){ undoStack.push(JSON.stringify(L)); if (undoStack.length > 40) undoStack.shift(); }
  function undo(){
    if (!undoStack.length){ toast('Nothing to undo.'); return; }
    L = Object.assign(blank(), JSON.parse(undoStack.pop())); save(); refreshAll();
  }

  // ---------- the widget catalogue ----------
  // kind 'block': full width, brings its own side padding (the app's built-in rows). kind 'box': sits in rows by width.
  var W = ['full','twothird','half','third','quarter','auto','fill'];
  var W_LABEL = { full:'Full', twothird:'⅔', half:'½', third:'⅓', quarter:'¼', auto:'Fit', fill:'Rest' };
  var W_SIZE = { full:1, twothird:0.6667, half:0.5, third:0.3334, quarter:0.25, auto:0.22, fill:0.36 };
  var ROW_STYLES = [['row','Scrolling row'],['grid','Grid'],['list','List']];
  var SIZES = [['s','Small'],['m','Medium'],['l','Large'],['xl','Huge']];
  var ALIGN = [['left','Left'],['center','Centre'],['right','Right']];

  var T = {};
  // --- built-in parts of the Home screen ---
  T.title = { name:'App title', icon:'title', kind:'box', builtin:true, zones:['home','page'], w:'fill',
    fields:[['text','Text','text','Press Play Media'],['size','Size','seg',SIZES],['align','Align','seg',ALIGN]],
    render:function(o, c, ctx){
      var size = o.size ? ' pw-ts-' + o.size : '';
      return '<h1 class="ph-app-title pw-title' + size + (o.align && o.align !== 'left' ? ' pw-al-' + o.align : '') + '">' + esc(o.text || (ctx.zone === 'home' ? 'Press Play Media' : 'My page')) + (ctx.zone === 'home' ? '<span class="ed-slot"></span>' : '') + '</h1>';
    } };
  T.games = { name:'Games button', icon:'game', kind:'box', builtin:true, zones:['home','page','player'], w:'auto',
    fields:[['label','Label','text','Games'],['look','Look','seg',[['pill','Pill'],['icon','Icon only'],['tile','Big tile']]]],
    render:function(o){
      var look = o.look || 'pill', label = esc(o.label || 'Games');
      var gi = '<span class="pp-gi"><svg viewBox="0 0 24 24" aria-hidden="true"><path fill="#fff" d="M7.6 6.5h8.8a5.2 5.2 0 0 1 5.1 4.2l.9 4.9a2.7 2.7 0 0 1-4.7 2.3l-2.1-2.4H8.4l-2.1 2.4a2.7 2.7 0 0 1-4.7-2.3l.9-4.9a5.2 5.2 0 0 1 5.1-4.2z"/><path fill="#5a3fc4" d="M6.6 9.3h1.6v1.6h1.6v1.6H8.2v1.6H6.6v-1.6H5v-1.6h1.6z"/><circle cx="16.2" cy="10.2" r="1.15" fill="#5a3fc4"/><circle cx="18" cy="12.3" r="1.15" fill="#5a3fc4"/></svg></span>';
      if (look === 'tile') return '<button type="button" class="pw-games-tile" data-pp-games aria-label="' + label + '">' + gi + '<span>' + label + '</span><small>Play something while you listen</small></button>';
      return '<button type="button" class="pp-games-btn' + (look === 'icon' ? ' pw-icon-only' : '') + '" data-pp-games aria-label="' + label + '">' + gi + (look === 'icon' ? '' : '<span>' + label + '</span>') + '</button>';
    } };
  T.tagline = { name:'Edition tagline', icon:'text', kind:'block', builtin:true, zones:['home'], render:function(o, c){ return c.tagline || ''; } };
  T.tabs = { name:'All / Videos / Audio tabs', icon:'tabs', kind:'block', builtin:true, zones:['home'], render:function(o, c){ return c.tabs || ''; } };
  T.hero = { name:'Featured video', icon:'star', kind:'block', builtin:true, zones:['home'], render:function(o, c){ return c.hero || ''; } };
  T.chips = { name:'Shuffle & Resume chips', icon:'shuffle', kind:'block', builtin:true, zones:['home'], render:function(o, c){ return c.chips || ''; } };
  T.playground = { name:'Playground strip', icon:'sparkle', kind:'block', builtin:true, zones:['home'], render:function(o, c){ return c.playground || ''; } };
  var ROW_FIELDS = [['title','Heading','text',''],['style','Look','seg',ROW_STYLES],['max','Show at most','range',[0, 40, 1, 'all']]];
  T.videos = { name:'Videos row', icon:'video', kind:'block', builtin:true, zones:['home','page'], fields:ROW_FIELDS,
    render:function(o, c){ var d = data(c); return trackRow(o, 'Videos', d.vid, 'videos', d.vidSub, { builtin:'videos', empty:'No videos yet. Add files from the Library tab.' }, c); } };
  T.audio = { name:'Audio row', icon:'music', kind:'block', builtin:true, zones:['home','page'], fields:ROW_FIELDS,
    render:function(o, c){ var d = data(c); return trackRow(o, 'Audio', d.aud, 'audio', d.audSub, { builtin:'audio', empty:'No audio yet. Add files from the Library tab.' }, c); } };
  T.history = { name:'History row', icon:'history', kind:'block', builtin:true, zones:['home','page'], fields:ROW_FIELDS,
    render:function(o, c){ var d = data(c), K = kit();
      var subs = new Map(d.hist.map(function(x){ return [x.i, K.relTime(x.h.at)]; }));
      return trackRow(o, 'History', d.hist.map(function(x){ return x.i; }), 'history', function(t, i){ return subs.get(i) || ''; },
        { builtin:'history', empty:'Played tracks show up here.', extra: d.hist.length ? '<button type="button" class="ph-link dim" data-act="clear-history">Clear</button>' : '' }, c); } };
  // --- new widgets ---
  T.clock = { name:'Clock', icon:'clock', kind:'box', zones:['home','page','player','video'], w:'half', desc:'The time, and the date if you like',
    fields:[['look','Look','seg',[['digital','Digital'],['analog','Analog']]],['size','Size','seg',SIZES],['date','Show the date','seg',[['long','Full'],['short','Short'],['day','Day only'],['off','Off']]],
            ['secs','Show seconds','toggle',false],['h12','12-hour clock','toggle',false],['align','Align','seg',ALIGN],['card','On a card','toggle',true]],
    render:function(o){
      var date = o.date === false ? 'off' : o.date === true || !o.date ? 'long' : o.date;
      var face = o.look === 'analog' ? '<svg class="pw-clock-face" viewBox="0 0 100 100" aria-hidden="true"><circle cx="50" cy="50" r="47" class="pw-cf-rim"/>' +
          Array.apply(null, Array(12)).map(function(x, i){ var a = i * Math.PI / 6, r1 = i % 3 ? 40 : 36; return '<line x1="' + (50 + Math.sin(a) * r1).toFixed(1) + '" y1="' + (50 - Math.cos(a) * r1).toFixed(1) + '" x2="' + (50 + Math.sin(a) * 44).toFixed(1) + '" y2="' + (50 - Math.cos(a) * 44).toFixed(1) + '" class="pw-cf-tick' + (i % 3 ? '' : ' pw-cf-big') + '"/>'; }).join('') +
          '<line x1="50" y1="54" x2="50" y2="27" class="pw-cf-h"/><line x1="50" y1="56" x2="50" y2="15" class="pw-cf-m"/>' + (o.secs ? '<line x1="50" y1="60" x2="50" y2="12" class="pw-cf-s"/>' : '') + '<circle cx="50" cy="50" r="3" class="pw-cf-pin"/></svg>' : '<div class="pw-clock-t"></div>';
      return card(o, '<div class="pw-clock pw-ts-' + (o.size || 'l') + (o.look === 'analog' ? ' pw-clock-an' : '') + '" data-pw-live="clock" data-secs="' + (o.secs ? 1 : 0) + '" data-h12="' + (o.h12 ? 1 : 0) + '" data-date="' + date + '">' + face + '<div class="pw-clock-d"></div></div>');
    } };
  T.greeting = { name:'Greeting', icon:'sun', kind:'box', zones:['home','page','player','video'], w:'full', desc:'Good morning / evening, with your name',
    fields:[['name','Your name','text',''],['size','Size','seg',SIZES],['emoji','Sun / moon emoji','toggle',false],['sub','Second line','text',''],['align','Align','seg',ALIGN],['card','On a card','toggle',false]],
    render:function(o){ return card(o, '<div class="pw-greet pw-ts-' + (o.size || 'm') + '" data-pw-live="greeting" data-name="' + esc(o.name || '') + '" data-emoji="' + (o.emoji ? 1 : 0) + '"></div>' +
      (o.sub ? '<div class="pw-greet-sub">' + esc(o.sub) + '</div>' : '')); } };
  T.nowplaying = { name:'Now playing', icon:'headphones', kind:'box', zones:['home','page','player'], w:'full', desc:'Cover, title and controls for what’s playing',
    fields:[['look','Look','seg',[['card','Card'],['big','Big'],['slim','Slim']]],['art','Show the cover','toggle',true],['round','Round cover','toggle',false],['artist','Show the artist','toggle',true],
            ['controls','Show controls','toggle',true],['progress','Show progress','toggle',true],['upnext','Show what plays next','toggle',false]],
    render:function(o){
      var look = o.look || 'card';
      return '<div class="pw-np pw-np-' + look + (o.round ? ' pw-np-round' : '') + '" data-pw-live="np">' +
        (o.art === false ? '' : '<button type="button" class="pw-np-art" data-pw-act="player"><img alt=""><span>' + svg('music') + '</span></button>') +
        '<div class="pw-np-text" data-pw-act="player"><div class="pw-np-t">Nothing playing</div><div class="pw-np-a"' + (o.artist === false ? ' hidden' : '') + '>Tap shuffle to start</div>' +
          (o.upnext ? '<div class="pw-np-up"></div>' : '') + (o.progress === false ? '' : '<div class="pw-np-bar"><i></i></div>') + '</div>' +
        (o.controls === false ? '' : '<div class="pw-np-ctl"><button type="button" data-pw-act="prev" aria-label="Previous">' + svg('prev') + '</button>' +
          '<button type="button" class="pw-np-pp" data-pw-act="playpause" aria-label="Play or pause">' + svg('play') + '</button>' +
          '<button type="button" data-pw-act="next" aria-label="Next">' + svg('next') + '</button></div>') +
        '</div>';
    } };
  T.action = { name:'Button', icon:'bolt', kind:'box', zones:['home','page','player','video'], w:'half', desc:'Shuffle, open a page, sleep timer, games and more',
    fields:[['action','Does','action','shuffleall'],['page','Page to open','page',''],['label','Label','text',''],['sub','Second line','text',''],['icon','Icon','icon',''],
            ['look','Look','seg',[['tile','Tile'],['pill','Pill'],['icon','Icon only'],['big','Big']]],['color','Colour','color','']],
    render:function(o){
      var a = ACTIONS[o.action] || ACTIONS.shuffleall, look = o.look || 'tile';
      var label = o.label || (o.action === 'page' && o.page ? (pageById(o.page) || {}).name || a.label : a.label);
      var st = o.color ? ' style="--pw-c:' + esc(o.color) + '"' : '';
      return '<button type="button" class="pw-btn pw-btn-' + look + (o.color ? ' pw-colored' : '') + '"' + st +
        (a.games ? ' data-pp-games' : ' data-pw-act="' + esc(o.action || 'shuffleall') + '"') + (o.page ? ' data-pw-page="' + esc(o.page) + '"' : '') + ' aria-label="' + esc(label) + '">' +
        svg(o.icon || a.icon) + (look === 'icon' ? '' : o.sub ? '<span class="pw-btn-2"><span>' + esc(label) + '</span><small>' + esc(o.sub) + '</small></span>' : '<span>' + esc(label) + '</span>') + '</button>';
    } };
  T.shortcuts = { name:'Shortcuts', icon:'grid', kind:'box', zones:['home','page','player','video'], w:'full', desc:'A row of up to four icon buttons',
    fields:[['a1','First','action0','shuffleall'],['a2','Second','action0','random'],['a3','Third','action0','resume'],['a4','Fourth','action0','sleep'],['a5','Fifth','action0',''],['a6','Sixth','action0',''],
            ['labels','Show names','toggle',true],['look','Look','seg',[['soft','Soft'],['accent','Accent'],['plain','Plain']]],['shape','Icon shape','seg',[['','Rounded'],['circle','Circle'],['square','Square']]]],
    render:function(o){
      var acts = ['a1','a2','a3','a4','a5','a6'].map(function(k, i){ return o[k] != null ? o[k] : ['shuffleall','random','resume','sleep','',''][i]; }).filter(function(a){ return ACTIONS[a]; });
      return '<div class="pw-shortcuts pw-sc-' + (o.look || 'soft') + (o.shape ? ' pw-sc-' + o.shape : '') + '">' + acts.map(function(a){ var A = ACTIONS[a];
        return '<button type="button"' + (A.games ? ' data-pp-games' : ' data-pw-act="' + a + '"') + ' aria-label="' + esc(A.label) + '"><i>' + svg(A.icon) + '</i>' + (o.labels === false ? '' : '<span>' + esc(A.label) + '</span>') + '</button>'; }).join('') + '</div>';
    } };
  T.text = { name:'Text', icon:'text', kind:'box', zones:['home','page','player','video'], w:'full', desc:'A heading, a note, anything',
    fields:[['text','Text','textarea','Your text here'],['size','Size','seg',SIZES],['bold','Bold','toggle',false],['italic','Italic','toggle',false],
            ['lh','Line spacing','seg',[['tight','Tight'],['','Normal'],['loose','Loose']]],['align','Align','seg',ALIGN],['color','Colour','color',''],['card','On a card','toggle',false]],
    render:function(o){
      var st = okCol(o.color) ? ' style="color:' + esc(o.color) + '"' : '';
      return card(o, '<div class="pw-text pw-ts-' + (o.size || 'm') + (o.bold ? ' pw-bold' : '') + (o.italic ? ' pw-italic' : '') + (o.lh ? ' pw-lh-' + o.lh : '') + '"' + st + '>' + esc(o.text == null ? 'Your text here' : o.text).replace(/\n/g, '<br>') + '</div>');
    } };
  T.image = { name:'Picture', icon:'image', kind:'box', zones:['home','page','player','video'], w:'full', desc:'A photo or banner of your own',
    fields:[['img','Picture','image',''],['h','Height','range',[60, 420, 10, 'px']],['fit','Fit','seg',[['cover','Fill'],['contain','Whole picture']]],
            ['cap','Caption','text',''],['capat','Caption on','seg',[['','The picture'],['below','Below it']]],['gray','Black and white','toggle',false]],
    render:function(o){
      var h = o.h || 160;
      if (!o.img) return '<div class="pw-img pw-img-empty" style="height:' + h + 'px">' + svg('image') + '<span>Pick a picture in this box’s settings</span></div>';
      var cap = o.cap ? '<div class="pw-img-cap' + (o.capat === 'below' ? ' pw-img-cap-below' : '') + '">' + esc(o.cap) + '</div>' : '';
      return '<div class="pw-img' + (o.capat === 'below' ? ' pw-img-below' : '') + '" style="height:' + h + 'px"><img alt="" src="' + esc(o.img) + '" style="object-fit:' + (o.fit === 'contain' ? 'contain' : 'cover') + (o.gray ? ';filter:grayscale(1)' : '') + '">' + (o.capat === 'below' ? '' : cap) + '</div>' + (o.capat === 'below' ? cap : '');
    } };
  T.spacer = { name:'Space', icon:'space', kind:'box', zones:['home','page','player','video'], w:'full', desc:'Empty room between things',
    fields:[['h','Height','range',[4, 160, 4, 'px']]], render:function(o){ return '<div class="pw-space" style="height:' + (o.h || 24) + 'px"></div>'; } };
  T.divider = { name:'Line', icon:'minus', kind:'box', zones:['home','page','player'], w:'full', desc:'A thin dividing line',
    fields:[['ls','Style','seg',[['','Solid'],['dashed','Dashed'],['dotted','Dotted'],['fade','Fades out']]],['th','Thickness','range',[1, 8, 1, 'px', 1]],
            ['len','Length','seg',[['','Full'],['m','Middle'],['s','Short']]],['color','Colour','color','']],
    render:function(o){
      var th = Math.max(1, Math.min(8, +o.th || 1)), c = okCol(o.color) || 'var(--r-line-strong, var(--line))';
      var bg = o.ls === 'fade' ? 'linear-gradient(90deg, transparent, ' + c + ', transparent)' : o.ls === 'dashed' || o.ls === 'dotted' ? 'none' : c;
      var border = o.ls === 'dashed' || o.ls === 'dotted' ? ';height:0;border-top:' + th + 'px ' + o.ls + ' ' + c : '';
      return '<div class="pw-divider' + (o.len ? ' pw-div-' + o.len : '') + '" style="height:' + th + 'px;background:' + bg + border + '"></div>';
    } };
  T.stats = { name:'Stats', icon:'chart', kind:'box', zones:['home','page','player'], w:'full', desc:'Your library and listening time at a glance',
    fields:[['sv','Videos','toggle',true],['sa','Songs','toggle',true],['sp','Playlists','toggle',true],['shr','Hours played','toggle',true],['look','Look','seg',[['','Tiles'],['plain','Plain'],['line','One line']]]],
    render:function(o){
      var A = api(), t = A ? A.tracks() : [], v = 0, a = 0;
      t.forEach(function(x){ if (x.stem) return; if (x.kind === 'video') v++; else a++; });
      var pls = A ? A.playlists().filter(function(p){ return !p.libOnly; }).length : 0, hrs = 0;
      try { var s = JSON.parse(localStorage.getItem('pppSaveV1')) || {}; hrs = (s.totalListenMs || 0) / 3600000; } catch(e){}
      var cell = function(n, l){ return '<div class="pw-stat"><b>' + n + '</b><span>' + l + '</span></div>'; };
      var cells = (o.sv === false ? '' : cell(v, 'videos')) + (o.sa === false ? '' : cell(a, 'songs')) + (o.sp === false ? '' : cell(pls, 'playlists')) + (o.shr === false ? '' : cell(hrs < 10 ? hrs.toFixed(1) : Math.round(hrs), 'hours played'));
      var n = [o.sv, o.sa, o.sp, o.shr].filter(function(x){ return x !== false; }).length;
      return n ? '<div class="pw-stats' + (o.look ? ' pw-stats-' + o.look : '') + '" style="--pw-sn:' + n + '">' + cells + '</div>' : '<div class="pw-empty">Switch on something to show in this box’s settings.</div>';
    } };
  var NEWROW = [['title','Heading','text',''],['style','Look','seg',ROW_STYLES],['max','Show at most','range',[1, 40, 1, '']]];
  T.recent = { name:'Recently added', icon:'sparkle', kind:'block', zones:['home','page'], desc:'The newest files in your library', fields:NEWROW,
    render:function(o, c){ var q = playable().reverse(); return trackRow(o, 'Recently added', q, 'pw', subOf, { empty:'Nothing added yet.', max:12 }, c); } };
  T.most = { name:'Most played', icon:'fire', kind:'block', zones:['home','page'], desc:'What you come back to most', fields:NEWROW,
    render:function(o, c){
      var A = api(), plays = {}; try { plays = (JSON.parse(localStorage.getItem('pppSaveV1')) || {}).trackPlays || {}; } catch(e){}
      var t = A ? A.tracks() : [];
      var q = playable().filter(function(i){ return plays[t[i].dbId] && plays[t[i].dbId].count; })
        .sort(function(x, y){ return plays[t[y].dbId].count - plays[t[x].dbId].count; });
      return trackRow(o, 'Most played', q, 'pw', function(tr){ var n = plays[tr.dbId].count; return n + ' play' + (n === 1 ? '' : 's'); }, { empty:'Play a few things and your favourites show up here.', max:12 }, c);
    } };
  var randomSeed = Math.random();
  T.random = { name:'Random picks', icon:'dice', kind:'block', zones:['home','page'], desc:'A fresh handful each time you open the app',
    fields:NEWROW.concat([['kind','From','seg',[['all','Everything'],['video','Videos'],['audio','Music']]]]),
    render:function(o, c){
      var A = api(), t = A ? A.tracks() : [], q = playable();
      if (o.kind === 'video' || o.kind === 'audio') q = q.filter(function(i){ return t[i].kind === o.kind; });
      var seed = randomSeed; q = q.map(function(i){ seed = (seed * 9301 + 49297) % 233280; return [seed / 233280 + (i * 0.6180339) % 1, i]; })
        .sort(function(a, b){ return (a[0] % 1) - (b[0] % 1); }).map(function(x){ return x[1]; });
      return trackRow(o, 'Random picks', q, 'pw', subOf, { empty:'Add some files first.', max:10,
        extra:'<button type="button" class="ph-link" data-pw-act="reshuffle">Shuffle</button>' }, c);
    } };
  T.playlist = { name:'A playlist', icon:'list', kind:'block', zones:['home','page'], desc:'One playlist’s tracks as a row',
    fields:[['pl','Playlist','playlist','']].concat(NEWROW),
    render:function(o, c){
      var A = api(); var pl = A && A.playlists().find(function(p){ return p.id === o.pl; });
      if (!pl) return section(o.title || 'Playlist', '', '<div class="ph-empty">Pick a playlist in this box’s settings.</div>');
      var t = A.tracks(), q = []; t.forEach(function(x, i){ if ((x.playlistIds || []).includes(pl.id)) q.push(i); });
      if (A.orderFor) q = A.orderFor(q, pl.id);
      return trackRow(o, pl.name, q, 'pw', subOf, { empty:'This playlist is empty.', max:20,
        extra:'<button type="button" class="ph-link" data-pw-act="openpl" data-pl="' + esc(pl.id) + '">Open</button>' }, c);
    } };
  T.playlists = { name:'Playlists', icon:'folder', kind:'block', zones:['home','page'], desc:'Your playlists as cards',
    fields:[['title','Heading','text','']],
    render:function(o, c){
      var A = api(), K = kit(); if (!A || !K) return '';
      var t = A.tracks(), pls = A.playlists().filter(function(p){ return !p.libOnly; });
      var cards = pls.map(function(pl){
        var mine = t.map(function(x, i){ return (x.playlistIds || []).includes(pl.id) ? i : -1; }).filter(function(i){ return i >= 0; });
        var ord = A.orderFor ? A.orderFor(mine, pl.id) : mine;          // the playlist's own order, so the cover is its first song or video with a picture
        var first = (Array.isArray(ord) ? ord : mine).map(function(i){ return t[i]; }).find(function(x){ return x && (x.kind === 'video' || x.artUrl); });
        var n = t.filter(function(x){ return (x.playlistIds || []).includes(pl.id); }).length;
        var th = pl.thumb ? '<div class="ph-thumb has-img"><img src="' + esc(pl.thumb) + '" alt="" loading="lazy" decoding="async"></div>' : K.thumbHTML(first, false);
        return '<button type="button" class="ph-card pw-pl-card" data-pw-act="openpl" data-pl="' + esc(pl.id) + '">' + th +
          '<div class="ph-title">' + esc(pl.name) + '</div><div class="ph-sub">' + n + ' item' + (n === 1 ? '' : 's') + '</div></button>';
      });
      return section(o.title || 'Playlists', cards.length, cards.length ? '<div class="ph-row">' + cards.join('') + '</div>' : '<div class="ph-empty">No playlists yet.</div>');
    } };

  // --- live parts of the first widgets ---
  T.clock.live = function(el, st){
    var now = st.now, h = now.getHours(), m = now.getMinutes(), sec = now.getSeconds(), h12 = el.dataset.h12 === '1';
    var t = el.querySelector('.pw-clock-t');
    if (t){ var hh = h12 ? ((h % 12) || 12) : pad(h); setText(t, hh + ':' + pad(m) + (el.dataset.secs === '1' ? ':' + pad(sec) : '') + (h12 ? (h < 12 ? ' AM' : ' PM') : '')); fitText(t); }
    else {
      var rot = function(sel, deg){ var x = el.querySelector(sel); if (x) x.setAttribute('transform', 'rotate(' + deg.toFixed(1) + ' 50 50)'); };
      rot('.pw-cf-h', (h % 12) * 30 + m / 2); rot('.pw-cf-m', m * 6 + sec / 10); rot('.pw-cf-s', sec * 6);
    }
    var d = el.dataset.date, fmt = d === 'short' ? { weekday:'short', day:'numeric', month:'short' } : d === 'day' ? { weekday:'long' } : { weekday:'long', day:'numeric', month:'long' };
    setText(el.querySelector('.pw-clock-d'), d === 'off' || d === '0' ? '' : now.toLocaleDateString(undefined, fmt));
  };
  T.greeting.live = function(el, st){
    var hr = st.now.getHours(), g = hr < 5 ? 'Good night' : hr < 12 ? 'Good morning' : hr < 18 ? 'Good afternoon' : 'Good evening';
    var e = el.dataset.emoji === '1' ? (hr < 5 || hr >= 21 ? '\uD83C\uDF19 ' : hr < 18 ? '\u2600\uFE0F ' : '\uD83C\uDF07 ') : '';
    setText(el, e + g + (el.dataset.name ? ', ' + el.dataset.name : ''));
  };
  T.np = { name:'Now playing', kind:'box', zones:[], hidden:true, render:function(){ return ''; }, live:function(el, st){
    var title = ((document.getElementById('np-title') || {}).textContent || '').trim(), artist = ((document.getElementById('np-artist') || {}).textContent || '').trim();
    var has = st.has && title && title !== 'No track selected';
    setText(el.querySelector('.pw-np-t'), has ? title : 'Nothing playing');
    setText(el.querySelector('.pw-np-a'), has ? (artist === '-' ? '' : artist) : 'Tap shuffle to start');
    el.classList.toggle('pw-np-idle', !has);
    var pp = el.querySelector('.pw-np-pp');
    if (pp){
      if (!has){ pp.dataset.pwAct = 'shuffleall'; if (pp.dataset.st !== 'shuf'){ pp.innerHTML = svg('shuffle'); pp.dataset.st = 'shuf'; } }
      else { pp.dataset.pwAct = 'playpause'; var s2 = st.playing ? 'pause' : 'play'; if (pp.dataset.st !== s2){ pp.innerHTML = svg(s2); pp.dataset.st = s2; } }
    }
    var bar = el.querySelector('.pw-np-bar i'), seek = document.getElementById('seek');
    if (bar && seek){ var mx = parseFloat(seek.max) || 100; bar.style.transform = 'scaleX(' + (has ? Math.max(0, Math.min(1, (parseFloat(seek.value) || 0) / mx)) : 0).toFixed(4) + ')'; }
    var up = el.querySelector('.pw-np-up');
    if (up){ var nx = has && st.W ? st.W.upNext(1)[0] : null, nt = nx != null ? st.A.tracks()[nx] : null; setText(up, nt ? 'Next: ' + nt.title : ''); }
    var img = el.querySelector('.pw-np-art img'), src = null; if (!img) return;
    try { if (has && window.__ppThumbSrc) src = window.__ppThumbSrc(st.t); } catch(e){}
    el.querySelector('.pw-np-art').classList.toggle('has-art', !!src);
    if (src && img.getAttribute('src') !== src) img.src = src;
  } };

  // ===================== more widgets =====================
  function thumbOf(t){ try { return t && window.__ppThumbSrc ? window.__ppThumbSrc(t) : null; } catch(e){ return null; } }
  function artHTML(t, icon){ var s = thumbOf(t); return '<span class="pw-art">' + (s ? '<img alt="" loading="lazy" decoding="async" src="' + esc(s) + '">' : svg(icon || (t && t.kind === 'video' ? 'video' : 'music'))) + '</span>'; }

  // Makes a new playlist of everything in a random order and opens it (this used to sit on the Playlists page by itself).
  T.shufpl = { name:'Shuffled playlist', icon:'shuffle', kind:'box', zones:['home','page','player'], w:'full', desc:'A button that makes a new playlist of everything in a random order',
    fields:[['label','Label','text','New shuffled playlist of everything'],['look','Look','seg',[['','Chip'],['pill','Button'],['tile','Tile']]]],
    render:function(o){
      var label = esc(o.label || 'New shuffled playlist of everything');
      if (o.look === 'pill' || o.look === 'tile') return '<button type="button" class="pw-btn pw-btn-' + o.look + '" data-pw-act="shufpl" aria-label="' + label + '">' + svg('shuffle') + '<span>' + label + '</span></button>';
      return '<div class="ph-chips pw-shufpl"><button type="button" class="ph-chip" data-pw-act="shufpl">' + svg('shuffle') + label + '</button></div>';
    } };

  // Visualiser: the same levels the player's ring uses, drawn into the widget's own canvas.
  T.viz = { name:'Visualiser', icon:'wave', kind:'box', zones:['home','page','player','video'], w:'full', desc:'Bars that move with the music',
    fields:[['look','Look','seg',[['bars','Bars'],['mirror','Mirror'],['line','Line'],['dots','Dots']]],['n','Bars','range',[8, 32, 4, '', 24]],
            ['h','Height','range',[40, 320, 10, 'px', 90]],['color','Colour','color','']],
    render:function(o){
      return '<div class="pw-viz" data-pw-live="viz" style="height:' + (+o.h || 90) + 'px' + (okCol(o.color) ? ';--pw-vc:' + o.color : '') + '"><canvas data-look="' + esc(o.look || 'bars') + '" data-n="' + (+o.n || 24) + '"></canvas></div>';
    },
    live:function(el){ if (!el._pwRun) vizLoop(el); } };
  function vizLoop(el){
    el._pwRun = true;
    var cv = el.querySelector('canvas'), g = cv.getContext('2d'), lv = new Float32Array(32), last = 0, col = '', colAt = 0;
    function onScreen(){
      if (document.hidden || !el.offsetParent) return false;
      if (el.closest('#pp-ringscreen')) return true;
      var inPlayer = !!el.closest('#pw-player-zone, #pw-player-top, #pw-video-zone'), playerOpen = body.hasAttribute('data-pl-player');
      return inPlayer ? playerOpen : !playerOpen;
    }
    function frame(ts){
      if (!el.isConnected){ el._pwRun = false; return; }
      if (!onScreen()){ setTimeout(function(){ requestAnimationFrame(frame); }, 300); return; }
      requestAnimationFrame(frame);
      if (ts - last < 15) return;
      last = ts;
      window.__ppVizWant = performance.now();
      if (ts - colAt > 1000){ col = getComputedStyle(el).color; colAt = ts; }
      var dpr = Math.min(3, window.devicePixelRatio || 1), w = Math.max(1, Math.round(el.clientWidth * dpr)), h = Math.max(1, Math.round(el.clientHeight * dpr));
      if (cv.width !== w || cv.height !== h){ cv.width = w; cv.height = h; }
      var src = window.__ppVizLevels ? window.__ppVizLevels() : null, bands = src ? src.bands : null, n = +cv.dataset.n || 24, look = cv.dataset.look;
      for (var k = 0; k < n; k++){
        var v = 0;
        if (bands){ var a = Math.floor(k * bands.length / n), b = Math.max(a + 1, Math.floor((k + 1) * bands.length / n)); for (var j = a; j < b; j++) v = Math.max(v, bands[j] || 0); }
        lv[k] += (v - lv[k]) * 0.5;
      }
      g.clearRect(0, 0, w, h); g.fillStyle = g.strokeStyle = col || '#6ee7d0';
      var gap = Math.max(1, Math.round(w / n * 0.28)), bw = (w - gap * (n - 1)) / n, base = 0.04;
      if (look === 'line'){
        g.lineWidth = Math.max(2, 2.5 * dpr); g.lineJoin = 'round'; g.beginPath();
        for (k = 0; k < n; k++){ var x = n === 1 ? w / 2 : k * w / (n - 1), y = h - (base + lv[k] * (1 - base)) * h * 0.92 - g.lineWidth; if (k) g.lineTo(x, y); else g.moveTo(x, y); }
        g.stroke(); return;
      }
      for (k = 0; k < n; k++){
        var bh = (base + lv[k] * (1 - base)) * h, x0 = k * (bw + gap);
        if (look === 'dots'){ var r = Math.min(bw, h) / 2, cy = h - bh + r; g.globalAlpha = 0.35 + 0.65 * lv[k]; g.beginPath(); g.arc(x0 + bw / 2, Math.min(h - r, cy), r * (0.6 + 0.4 * lv[k]), 0, Math.PI * 2); g.fill(); g.globalAlpha = 1; }
        else if (look === 'mirror'){ g.fillRect(x0, (h - bh) / 2, bw, bh); }
        else g.fillRect(x0, h - bh, bw, bh);
      }
    }
    requestAnimationFrame(frame);
  }

  // Lyrics: the line being sung (and the next one), taken from the player's own lyrics line.
  T.lyrics = { name:'Lyrics', icon:'text', kind:'box', zones:['home','page','player','video'], w:'full', desc:'The line being sung right now',
    fields:[['next','Show the next line','toggle',true],['size','Size','seg',SIZES],['glow','Highlight the line in the accent colour','toggle',false],['align','Align','seg',ALIGN],['card','On a card','toggle',true],['hide','Hide when a song has no lyrics','toggle',false]],
    render:function(o){
      return card(cardOn(o), '<div class="pw-lyr pw-ts-' + (o.size || 'm') + (o.glow ? ' pw-lyr-glow' : '') + '" data-pw-live="lyrics" data-next="' + (o.next === false ? 0 : 1) + '" data-hide="' + (o.hide ? 1 : 0) + '"><div class="pw-lyr-c">♪</div><div class="pw-lyr-n"></div></div>');
    },
    live:function(el, st){
      var ov = document.getElementById('lyrics-overlay'), has = st.has && ov && ov.classList.contains('show');
      var cur = has ? (ov.querySelector('.ly-cur') || {}).textContent || '' : '', nx = has ? (ov.querySelector('.ly-next') || {}).textContent || '' : '';
      el.classList.toggle('pw-dim', !has);
      setText(el.firstChild, !st.has ? 'Nothing playing' : !has ? 'No lyrics for this song' : (cur.trim() || '♪'));
      setText(el.lastChild, has && el.dataset.next === '1' ? nx.trim() : '');
      liveHide(el, (el.dataset.hide === '1' || !!el.closest('#pw-video-zone')) && !has);   // over a video, no lyrics = no box
    } };

  // Up next: the next few in the queue. Tap one to play it.
  T.upnext = { name:'Up next', icon:'queue', kind:'box', zones:['home','page','player','video'], w:'full', desc:'What plays after this, tap to jump',
    fields:[['title','Heading','text','Up next'],['n','How many','range',[1, 10, 1, '', 4]],['art','Show covers','toggle',true],['num','Number them','toggle',false],['card','On a card','toggle',true]],
    render:function(o){
      return card(cardOn(o), '<div class="pw-un' + (o.num ? ' pw-un-num' : '') + '" data-pw-live="upnext" data-n="' + (+o.n || 4) + '" data-art="' + (o.art === false ? 0 : 1) + '"><div class="pw-wh"><span class="pw-wh-t">' + esc(o.title || 'Up next') + '</span></div><div class="pw-un-l"></div></div>');
    },
    live:function(el, st){
      var list = st.has && st.W ? st.W.upNext(+el.dataset.n || 4) : [], sig = st.i + ':' + list.join(',');
      if (el._sig === sig) return; el._sig = sig;
      var t = st.A ? st.A.tracks() : [], art = el.dataset.art === '1', box = el.querySelector('.pw-un-l');
      if (qDragging(el)) return;
      if (list.length > 1) box.setAttribute('data-pq-sort', 'live'); else box.removeAttribute('data-pq-sort');
      box.innerHTML = !st.has ? '<div class="pw-empty">Play something to see what comes next.</div>' : !list.length ? '<div class="pw-empty">Nothing after this one.</div>'
        : list.map(function(i, pos){ var x = t[i]; if (!x) return '';
            return '<div class="pw-q-row" data-pq-row><button type="button" class="pw-li" data-pw-act="qjump" data-pos="' + pos + '">' + (art ? artHTML(x) : '') + '<span class="pw-li-t"><b>' + esc(x.title) + '</b><small>' + esc(subOf(x)) + '</small></span></button></div>'; }).join('');
    } };

  // ===================== queue widgets =====================
  // All three read the live queue (window.__ppQueue). Rows drag to reorder (pp-queue.js: data-pq-sort / data-pq-row).
  function qApi(){ return window.__ppQueue || null; }
  function qDragging(el){ return !!el.querySelector('.pq-dragging'); }
  function qState(st, n){ var q = qApi(); return q && st.has ? q.state(n) : null; }
  function qSig(st, s, n){ return st.i + '|' + st.playing + '|' + (s ? s.repeat + ':' + s.up.length + ':' + s.up.slice(0, n).map(function(e){ return e.i + (e.k != null ? 'p' : ''); }).join(',') : '-'); }
  function qMore(n, shown){ return n > shown ? '<button type="button" class="pw-q-more" data-pw-act="qopen">' + (n - shown) + ' more in the queue</button>' : ''; }

  // 1. Queue: the list itself, with search-to-add, the time it ends and drag to reorder, is in pp-widgets-tools.js.

  // 2. Up next card: just the next song, big, with Skip to it and Open queue.
  T.queuecard = { name:'Up next card', icon:'queue', kind:'box', zones:['home','page','player','video'], w:'full', desc:'The next song, big, one tap from the queue',
    fields:[['look','Look','seg',[['card','Card'],['big','Big cover'],['slim','Slim']]],['card','On a card','toggle',true]],
    render:function(o){ return card(cardOn(o), '<div class="pw-qc pw-qc-' + esc(o.look || 'card') + '" data-pw-live="queuecard"></div>'); },
    live:function(el, st){
      var s = qState(st, 400), sig = qSig(st, s, 1);
      if (el._sig === sig) return; el._sig = sig;
      var t = st.A ? st.A.tracks() : [], e = s && s.up[0], x = e ? t[e.i] : null, more = s ? Math.max(0, s.up.length - 1) : 0;
      if (!x){
        el.innerHTML = '<button type="button" class="pw-qc-main" data-pw-act="' + (st.has ? 'qadd' : 'qopen') + '"><span class="pw-qc-art">' + svg('queue') + '</span><span class="pw-qc-t"><small>Up next</small><b>' + (st.has ? 'Nothing after this' : 'Nothing playing') + '</b><i>' + (st.has ? 'Tap to add songs' : 'Your queue shows up here') + '</i></span></button>';
        return;
      }
      el.innerHTML = '<button type="button" class="pw-qc-main" data-pw-act="qopen" aria-label="Open the queue">' + artHTML(x).replace('pw-art', 'pw-art pw-qc-art') +
          '<span class="pw-qc-t"><small>Up next' + (e.k != null ? ' · added by you' : '') + '</small><b>' + esc(x.title) + '</b><i>' + esc(subOf(x)) + (more ? ' · ' + more + ' more' : '') + '</i></span></button>' +
        '<button type="button" class="pw-qc-skip" data-pw-act="qjump" data-pos="0" aria-label="Play ' + esc(x.title) + ' now">' + svg('next') + '</button>';
    } };

  // 3. Queue covers: a sideways row of what's coming, dragged left and right.
  T.queuestrip = { name:'Queue covers', icon:'queue', kind:'box', zones:['home','page','player'], w:'full', desc:'A row of covers for what’s coming, drag to reorder',
    fields:[['title','Heading','text','Coming up'],['n','How many','range',[4, 30, 1, '', 12]],['size','Size','seg',[['s','Small'],['m','Medium'],['l','Large']]],['card','On a card','toggle',false]],
    render:function(o){
      return card(o, '<div class="pw-qs pw-qs-sz-' + esc(o.size || 'm') + '" data-pw-live="queuestrip" data-n="' + (+o.n || 12) + '">' +
        '<div class="pw-wh"><span class="pw-wh-t">' + esc(o.title || 'Coming up') + '</span><button type="button" class="ph-link" data-pw-act="qopen">Queue</button></div>' +
        '<div class="pw-qs-row no-swipe"></div></div>');
    },
    live:function(el, st){
      var n = +el.dataset.n || 12, s = qState(st, 400), sig = qSig(st, s, n);
      if (el._sig === sig || qDragging(el)) return; el._sig = sig;
      var t = st.A ? st.A.tracks() : [], box = el.querySelector('.pw-qs-row'), shown = s ? s.up.slice(0, n) : [];
      if (shown.length > 1){ box.setAttribute('data-pq-sort', 'live'); box.setAttribute('data-pq-axis', 'x'); } else box.removeAttribute('data-pq-sort');
      box.innerHTML = !st.has ? '<div class="pw-empty">Play something to see what’s coming.</div>' : !shown.length ? '<div class="pw-empty">Nothing after this one.</div>'
        : shown.map(function(e, pos){ var x = t[e.i]; if (!x) return '';
            return '<div class="pw-qs-it' + (e.k != null ? ' pw-q-picked' : '') + '" data-pq-row><button type="button" data-pw-act="qjump" data-pos="' + pos + '" aria-label="Play ' + esc(x.title) + '">' +
              artHTML(x) + '<b>' + esc(x.title) + '</b></button></div>'; }).join('') +
          (s.up.length > shown.length ? '<button type="button" class="pw-qs-more" data-pw-act="qopen">+' + (s.up.length - shown.length) + '</button>' : '');
    } };

  // Sound: one-tap EQ presets.
  var EQ_DEF = ['bass', 'vocal', 'rock', 'electronic', 'latenight', 'flat'];
  function eqLabel(p){ var b = document.querySelector('#eq-preset-row button[data-eq-preset="' + p + '"]'); return b ? b.textContent.trim() : p; }
  T.eq = { name:'Sound presets', icon:'sliders', kind:'box', zones:['home','page','player','video'], w:'full', desc:'Bass, Vocal, Rock… one tap',
    fields:[['p1','First','eqp',EQ_DEF[0]],['p2','Second','eqp',EQ_DEF[1]],['p3','Third','eqp',EQ_DEF[2]],['p4','Fourth','eqp',EQ_DEF[3]],['p5','Fifth','eqp',EQ_DEF[4]],['p6','Sixth','eqp',EQ_DEF[5]],
            ['look','Look','seg',[['chips','Chips'],['grid','Grid']]]],
    render:function(o){
      var ps = ['p1','p2','p3','p4','p5','p6'].map(function(k, i){ return o[k] != null ? o[k] : EQ_DEF[i]; }).filter(function(p){ return p && document.querySelector('#eq-preset-row button[data-eq-preset="' + p + '"]'); });
      if (!ps.length) return '<div class="pw-empty">Pick some presets in this box’s settings.</div>';
      return '<div class="pw-eq pw-eq-' + (o.look || 'chips') + '" data-pw-live="eq">' + ps.map(function(p){ return '<button type="button" data-pw-act="eqp" data-p="' + esc(p) + '">' + esc(eqLabel(p)) + '</button>'; }).join('') + '</div>';
    },
    live:function(el){
      var act = document.querySelector('#eq-preset-row button.active[data-eq-preset]'), on = !window.PPXpEq || window.PPXpEq.isEnabled();
      var cur = act && on ? act.dataset.eqPreset : '';
      el.querySelectorAll('button').forEach(function(b){ b.classList.toggle('on', b.dataset.p === cur); });
    } };

  // Level & streak from the rewards system.
  T.level = { name:'Level & streak', icon:'trophy', kind:'box', zones:['home','page','player','video'], w:'full', desc:'Your level, rank, XP and daily streak',
    fields:[['rank','Show rank','toggle',true],['bar','Show XP bar','toggle',true],['streak','Show streak','toggle',true],['card','On a card','toggle',true]],
    render:function(o){
      return card(cardOn(o), '<div class="pw-lvl" data-pw-live="level" data-rank="' + (o.rank === false ? 0 : 1) + '" data-bar="' + (o.bar === false ? 0 : 1) + '" data-streak="' + (o.streak === false ? 0 : 1) + '"></div>');
    },
    live:function(el){
      var X = window.PPXpApi;
      if (!X){ if (!el._sig){ el._sig = 'x'; el.innerHTML = '<div class="pw-empty">Levels are not available in this edition.</div>'; } return; }
      var info = X.levelInfo ? X.levelInfo() : { level: X.getLevel(), xpIntoLevel: 0, xpForNext: 1 }, rank = X.getRank ? X.getRank() : null, sk = X.getStreak ? X.getStreak() : null;
      var pct = Math.max(0, Math.min(100, info.xpIntoLevel / Math.max(1, info.xpForNext) * 100));
      var sig = [info.level, Math.round(pct), rank && rank.name, sk && sk.days].join('|'); if (el._sig === sig) return; el._sig = sig;
      el.innerHTML = '<div class="pw-lvl-top"><b>Level ' + info.level + '</b>' + (el.dataset.rank === '1' && rank && rank.name ? '<span>' + esc(rank.name) + '</span>' : '') +
        (el.dataset.streak === '1' && sk ? '<em>' + svg('fire') + sk.days + ' day' + (sk.days === 1 ? '' : 's') + '</em>' : '') + '</div>' +
        (el.dataset.bar === '1' ? '<div class="pw-lvl-bar"><i style="width:' + pct.toFixed(1) + '%"></i></div><small>' + Math.round(info.xpIntoLevel) + ' / ' + Math.round(info.xpForNext) + ' XP to level ' + (info.level + 1) + '</small>' : '');
    } };

  // Sleep timer with its countdown.
  T.sleeper = { name:'Sleep timer', icon:'moon', kind:'box', zones:['home','page','player','video'], w:'full', desc:'Start, see and stop the sleep timer',
    fields:[['compact','Compact (no heading)','toggle',false],['card','On a card','toggle',true]],
    render:function(o){
      return card(cardOn(o), '<div class="pw-sl' + (o.compact ? ' pw-sl-compact' : '') + '" data-pw-live="sleeper"><div class="pw-sl-h">' + svg('moon') + '<b>Sleep timer</b><small></small></div><div class="pw-sl-b">' +
        [['15','15 min'],['30','30 min'],['60','1 hour'],['end','End of track'],['off','Off']].map(function(x){ return '<button type="button" data-pw-act="sleepset" data-m="' + x[0] + '">' + x[1] + '</button>'; }).join('') + '</div></div>');
    },
    live:function(el, st){
      var s = st.W ? st.W.sleep() : { mode:'off' }, txt = s.mode === 'duration' ? fmtT(s.ms / 1000) + ' left' : s.mode === 'track' ? 'Stops at the end of this track' : s.mode === 'tracks' ? s.left + ' tracks left' : 'Off';
      setText(el.querySelector('small'), txt);
      el.classList.toggle('pw-sl-on', s.mode !== 'off');
    } };

  // Bookmarks of the song that is playing.
  T.bookmarks = { name:'Bookmarks', icon:'bookmark', kind:'box', zones:['home','page','player','video'], w:'full', desc:'Jump to the spots you saved in this song',
    fields:[['title','Heading','text','Bookmarks'],['add','Show “Add” button','toggle',true],['card','On a card','toggle',true],['hide','Hide when there are none','toggle',false]],
    render:function(o){
      return card(cardOn(o), '<div class="pw-bm" data-pw-live="bookmarks" data-add="' + (o.add === false ? 0 : 1) + '" data-hide="' + (o.hide ? 1 : 0) + '"><div class="pw-wh"><span class="pw-wh-t">' + esc(o.title || 'Bookmarks') + '</span>' +
        (o.add === false ? '' : '<button type="button" class="ph-link" data-pw-act="bmadd">Add</button>') + '</div><div class="pw-bm-l"></div></div>');
    },
    live:function(el, st){
      var raw = ''; try { raw = localStorage.getItem('playerBookmarksV1') || ''; } catch(e){}
      var sig = (st.has ? st.t.dbId : '') + ':' + raw.length + ':' + raw.slice(-40); if (el._sig === sig) return; el._sig = sig;
      var list = []; if (st.has){ try { list = (JSON.parse(raw || '{}') || {})[st.t.dbId] || []; } catch(e){} }
      el.querySelector('.pw-bm-l').innerHTML = !st.has ? '<div class="pw-empty">Play something to see its bookmarks.</div>' : !list.length ? '<div class="pw-empty">No bookmarks in this song yet.</div>'
        : list.map(function(b){ return '<button type="button" class="pw-li" data-pw-act="seek" data-s="' + (+b.t || 0) + '"><span class="pw-bm-t">' + fmtT(b.t) + '</span><span class="pw-li-t"><b>' + esc(b.label || 'Bookmark') + '</b></span></button>'; }).join('');
      liveHide(el, el.dataset.hide === '1' && !list.length);
    } };

  // A game of your choice.
  function gameList(){ return (window.__ppGames && window.__ppGames.list) || []; }
  T.game = { name:'A game', icon:'game', kind:'box', zones:['home','page','player'], w:'half', desc:'Start one game straight away',
    fields:[['g','Game','game',''],['look','Look','seg',[['tile','Tile'],['wide','Wide'],['icon','Icon only']]]],
    render:function(o){
      var g = gameList().find(function(x){ return x.id === o.g; });
      if (!g) return '<div class="pw-empty">Pick a game in this box’s settings.</div>';
      var look = o.look || 'tile';
      return '<button type="button" class="pw-game pw-game-' + look + '" data-pw-act="game" data-g="' + esc(g.id) + '" style="--pw-gbg:' + esc(okCol(g.bg) || '#222') + '" aria-label="' + esc(g.name) + '">' +
        '<img alt="" src="' + esc(g.icon || '') + '">' + (look === 'icon' ? '' : '<span><b>' + esc(g.name) + '</b>' + (look === 'wide' && g.tag ? '<small>' + esc(g.tag) + '</small>' : '') + '</span>') + '</button>';
    } };

  // Ask Bloopy without opening the chat first.
  T.bloopy = { name:'Ask Bloopy', icon:'chat', kind:'box', zones:['home','page','player','video'], w:'full', desc:'Type a question or a command for Bloopy',
    fields:[['ph','Hint text','text','Ask Bloopy anything…']],
    render:function(o){
      return '<form class="pw-bl" data-pw-bloopy="1" autocomplete="off"><span class="pw-bl-i">' + svg('chat') + '</span><input type="text" enterkeyhint="send" maxlength="300" placeholder="' + esc(o.ph || 'Ask Bloopy anything…') + '">' +
        '<button type="submit" aria-label="Send">' + svg('send') + '</button></form>';
    } };
  function askBloopy(text){
    var fab = document.getElementById('ppv-cfab'), chat = document.getElementById('ppv-chat');
    if (!fab || !chat){ toast('Bloopy is not switched on.'); return; }
    if (chat.style.display !== 'flex') fab.click();
    if (!text) return;
    var inp = chat.querySelector('input'); if (!inp) return;
    inp.value = text;
    inp.dispatchEvent(new KeyboardEvent('keydown', { key:'Enter', bubbles:true, cancelable:true }));
  }

  // Rows of tracks: one genre from the smart tags, and what you stopped in the middle of.
  function genreMap(){
    var V = window.PPVocals, tags = null; try { tags = V && V.loadTags ? V.loadTags() : null; } catch(e){}
    var A = api(), t = A ? A.tracks() : [], by = {};
    if (!tags) return by;
    playable().forEach(function(i){ var c = tags[String(t[i].dbId)], g = c && (c.gn || [])[0]; if (!g) return; var name = String(g[0]).split('---')[0].trim(); if (name) (by[name] = by[name] || []).push(i); });
    return by;
  }
  T.genre = { name:'A genre', icon:'tag', kind:'block', zones:['home','page'], desc:'Songs of one genre, from Bloopy’s smart tags',
    fields:[['g','Genre','genre','']].concat(NEWROW),
    render:function(o, c){
      if (!o.g) return section(o.title || 'Genre', '', '<div class="ph-empty">Pick a genre in this box’s settings. Genres come from smart tags (Bloopy’s stems menu).</div>');
      return trackRow(o, o.g, genreMap()[o.g] || [], 'pw', subOf, { empty:'No songs tagged ' + esc(o.g) + ' yet.', max:12 }, c);
    } };
  T.cont = { name:'Continue watching', icon:'film', kind:'block', zones:['home','page'], desc:'Videos and long tracks you stopped part way',
    fields:NEWROW,
    render:function(o, c){
      var A = api(), K = kit(), W2 = wapi(); if (!A || !K || !W2) return '';
      var pos = W2.positions() || {}, t = A.tracks(), byId = new Map(t.map(function(x, i){ return [x.dbId, i]; })), seen = {}, q = [];
      var ok = function(i){ var x = t[i], p = x && pos[x.dbId]; if (!p || x.stem || seen[i]) return false; if (x.kind !== 'video' && !(x.duration > 600)) return false; return p > 15 && !(x.duration && p > x.duration - 20); };
      K.history().forEach(function(h){ var i = byId.get(h.id); if (i != null && ok(i)){ seen[i] = 1; q.push(i); } });
      t.forEach(function(x, i){ if (ok(i)){ seen[i] = 1; q.push(i); } });
      return trackRow(o, 'Continue watching', q, 'pw', function(x){ var p = pos[x.dbId]; return x.duration ? fmtT(x.duration - p) + ' left' : 'At ' + fmtT(p); },
        { empty:'Nothing half watched. Videos you stop part way show up here.', max:12 }, c);
    } };

  // Stack: several widgets in one place. Swipe between them, or let it turn by itself.
  // A fidget takes every touch that starts on it, so a page holding one gets a thin strip down each side that is the
  // stack's: swipe from an edge to change pages, or tap it for the next or previous page. The rest is the fidget's.
  var EDGES = '<i class="pw-stk-edge pw-stk-el" data-stk-go="-1" aria-hidden="true"></i><i class="pw-stk-edge pw-stk-er" data-stk-go="1" aria-hidden="true"></i>';
  var STK_PAGE = {};   // the page each stack is on, by widget id (kept while the app is open)
  T.stack = { name:'Stack', icon:'layers', kind:'box', zones:['home','page','player','video'], w:'full', desc:'Several widgets in one spot, swipe between them',
    fields:[['dots','Show dots','toggle',true],['auto','Turn by itself','seg',[['','Off'],['5','5 s'],['10','10 s'],['20','20 s']]]],
    render:function(o, c, ctx, it){
      var kids = (it && it.kids) || [], pages = [];
      kids.forEach(function(k){
        var d = T[k.type]; if (!d) return;
        var h = itemHTML(k, c, ctx);
        if (!h){ if (!editing) return; h = '<div class="pw-hidden-note">' + esc(d.name) + '</div>'; }
        var sty = styleOf(k.o || {});
        pages.push('<div class="pw-stk-pg pw-t-' + k.type + sty.cls + '"' + sty.style + (editing ? '' : sty.data) + '>' + h + (d.fidget || (k.o && FX_WORD[k.o.fx] && (k.type === 'image' || k.type === 'drawing')) ? EDGES : '') + '</div>');
      });
      if (pages.length < 2 || editing) pages = pages.map(function(x){ return x.replace(EDGES, ''); });
      if (!pages.length) return editing ? '<div class="pw-empty">An empty stack. Open its settings to put widgets in it.</div>' : '';
      return '<div class="pw-stk" data-pw-live="stack" data-auto="' + (+o.auto || 0) + '"><div class="pw-stk-tr">' + pages.join('') + '</div>' +
        (o.dots === false || pages.length < 2 ? '' : '<div class="pw-stk-dots">' + pages.map(function(x, i){ return '<i data-stk-to="' + i + '"' + (i ? '' : ' class="on"') + '></i>'; }).join('') + '</div>') + '</div>';
    },
    live:function(el){
      // Home is drawn again when a song starts (and on other changes): come back to the page the stack was on
      if (!el._pwRest){
        el._pwRest = 1;
        var box = el.closest('[data-wid]'), pg = box ? STK_PAGE[box.dataset.wid] : 0, tr0 = el.firstChild;
        if (pg && tr0 && tr0.children.length > pg){ tr0.scrollLeft = pg * tr0.clientWidth; }
      }
      var sec = +el.dataset.auto; if (!sec || editing) return;
      var now = Date.now(), tr = el.firstChild, n = tr.children.length; if (n < 2) return;
      if (!el._pwAt) el._pwAt = now;
      if (now - (el._pwTouched || 0) < sec * 1000 || now - el._pwAt < sec * 1000) return;
      el._pwAt = now;
      var i = (Math.round(tr.scrollLeft / Math.max(1, tr.clientWidth)) + 1) % n;
      tr.scrollTo({ left: i * tr.clientWidth, behavior: 'smooth' });
    } };

  // ===================== even more widgets =====================
  function media2(){ var w = wapi(); return w && w.time ? w.time() : { t:0, d:0 }; }
  function inputTo(id, v){ var e = document.getElementById(id); if (!e) return false; e.value = v; e.dispatchEvent(new Event('input', { bubbles:true })); e.dispatchEvent(new Event('change', { bubbles:true })); return true; }

  // Progress bar you can drag, with the times.
  T.seekbar = { name:'Progress bar', icon:'clock', kind:'box', zones:['home','page','player','video'], w:'full', desc:'Where you are in the track, drag to move',
    fields:[['times','Show the times','toggle',true],['left','Show time left','toggle',false],['title','Show the title','toggle',false],['card','On a card','toggle',false]],
    render:function(o){
      return card(o, '<div class="pw-sk" data-pw-live="seekbar" data-left="' + (o.left ? 1 : 0) + '">' + (o.title ? '<div class="pw-sk-n">Nothing playing</div>' : '') +
        '<input type="range" min="0" max="1000" step="1" value="0" data-pw-range="seek" aria-label="Position">' +
        (o.times === false ? '' : '<div class="pw-sk-t"><span>0:00</span><span>0:00</span></div>') + '</div>');
    },
    live:function(el, st){
      var r = el.querySelector('input'), tm = st.has ? media2() : { t:0, d:0 };
      if (!r._drag){ var v = tm.d ? Math.round(tm.t / tm.d * 1000) : 0; if (+r.value !== v) r.value = v; r.style.setProperty('--p', (v / 10) + '%'); }
      r.disabled = !st.has || !tm.d;
      var sp = el.querySelectorAll('.pw-sk-t span'), t = r._drag ? +r.value / 1000 * tm.d : tm.t;
      if (sp.length){ setText(sp[0], fmtT(t)); setText(sp[1], el.dataset.left === '1' ? '-' + fmtT(tm.d - t) : fmtT(tm.d)); }
      var n = el.querySelector('.pw-sk-n'); if (n) setText(n, st.has ? st.t.title : 'Nothing playing');
    } };

  // Volume slider, the same volume as the player's.
  T.volume = { name:'Volume', icon:'headphones', kind:'box', zones:['home','page','player','video'], w:'full', desc:'Turn it up or down, tap the speaker to mute',
    fields:[['pct','Show the number','toggle',true],['card','On a card','toggle',false]],
    render:function(o){
      return card(o, '<div class="pw-vol" data-pw-live="volume"><button type="button" data-pw-act="mute" aria-label="Mute">' + svg('vol') + '</button>' +
        '<input type="range" min="0" max="100" step="1" value="80" data-pw-range="vol" aria-label="Volume">' + (o.pct === false ? '' : '<b>80</b>') + '</div>');
    },
    live:function(el){
      var src = document.getElementById('volume'), r = el.querySelector('input'); if (!src) return;
      if (!r._drag && r.value !== src.value) r.value = src.value;
      r.style.setProperty('--p', r.value + '%');
      var b = el.querySelector('b'); if (b) setText(b, r.value);
      var mb = el.querySelector('[data-pw-act="mute"]'), ic = +r.value === 0 ? 'mute' : 'vol';
      if (mb && mb.dataset.ic !== ic){ mb.innerHTML = svg(ic); mb.dataset.ic = ic; mb.setAttribute('aria-label', ic === 'mute' ? 'Unmute' : 'Mute'); }
    } };
  var volBefore = 80;

  // Playback speed in one tap.
  var SPEEDS = ['0.5','0.75','1','1.25','1.5','2'];
  T.speed = { name:'Speed', icon:'bolt', kind:'box', zones:['home','page','player','video'], w:'full', desc:'0.5× to 2×, one tap',
    fields:[['look','Look','seg',[['chips','Chips'],['grid','Grid']]]],
    render:function(o){
      return '<div class="pw-eq pw-eq-' + (o.look || 'chips') + ' pw-spd" data-pw-live="speed">' + SPEEDS.map(function(s){ return '<button type="button" data-pw-act="speed" data-v="' + s + '">' + s + '×</button>'; }).join('') + '</div>';
    },
    live:function(el){
      var sl = document.getElementById('speed-slider'), cur = sl ? parseFloat(sl.value) : 1;
      el.querySelectorAll('button').forEach(function(b){ b.classList.toggle('on', Math.abs(parseFloat(b.dataset.v) - cur) < 0.01); });
    } };

  // The cover of what's playing, big.
  T.cover = { name:'Cover art', icon:'image', kind:'box', zones:['home','page','player','video'], w:'half', desc:'The cover of what is playing, tap to open the player',
    fields:[['shape','Shape','seg',[['','Rounded'],['square','Square'],['circle','Circle']]],['spin','Spin while playing (circle)','toggle',false],['title','Title underneath','toggle',true]],
    render:function(o){
      return '<div class="pw-cov' + (o.shape ? ' pw-cov-' + o.shape : '') + (o.spin && o.shape === 'circle' ? ' pw-cov-spin' : '') + '" data-pw-live="cover">' +
        '<button type="button" class="pw-cov-a" data-pw-act="player" aria-label="Open the player"><img alt=""><span>' + svg('music') + '</span></button>' +
        (o.title === false ? '' : '<div class="pw-cov-t"><b>Nothing playing</b><small></small></div>') + '</div>';
    },
    live:function(el, st){
      var img = el.querySelector('img'), src = st.has ? thumbOf(st.t) : null;
      el.querySelector('.pw-cov-a').classList.toggle('has-art', !!src);
      if (src && img.getAttribute('src') !== src) img.src = src;
      el.classList.toggle('pw-cov-on', !!st.playing);
      var b = el.querySelector('.pw-cov-t b'); if (b){ setText(b, st.has ? st.t.title : 'Nothing playing'); setText(el.querySelector('.pw-cov-t small'), st.has ? subOf(st.t) : ''); }
    } };

  // Details of the track.
  T.trackinfo = { name:'Track details', icon:'tag', kind:'box', zones:['home','page','player','video'], w:'full', desc:'Format, quality, length and place in the queue',
    fields:[['title','Show the title','toggle',true],['card','On a card','toggle',true]],
    render:function(o){ return card(cardOn(o), '<div class="pw-ti" data-pw-live="trackinfo" data-title="' + (o.title === false ? 0 : 1) + '"></div>'); },
    live:function(el, st){
      var tm = st.has ? media2() : { d:0 }, t = st.t, sig = st.has ? st.i + ':' + Math.round(tm.d) : 'none'; if (el._sig === sig) return; el._sig = sig;
      if (!st.has){ el.innerHTML = '<div class="pw-empty">Play something to see its details.</div>'; return; }
      var rows = [], add = function(k, v){ if (v) rows.push('<div><span>' + k + '</span><b>' + esc(v) + '</b></div>'); };
      add('Type', t.kind === 'video' ? 'Video' : 'Audio'); add('Format', (t.ext || '').toUpperCase());
      if (t.kind === 'video' && t.height) add('Quality', (t.width ? t.width + '×' : '') + t.height + 'p');
      add('Length', tm.d ? fmtT(tm.d) : t.duration ? fmtT(t.duration) : '');
      if (t.artist && t.artist !== 'Unknown artist') add('Artist', t.artist);
      if (t.album) add('Album', t.album);
      var A = st.A, n = A ? A.tracks().filter(function(x){ return !x.stem; }).length : 0; add('In library', n ? (st.i + 1) + ' of ' + n : '');
      el.innerHTML = (el.dataset.title === '1' ? '<div class="pw-ti-n">' + esc(t.title) + '</div>' : '') + '<div class="pw-ti-g">' + rows.join('') + '</div>';
    } };

  // Search the library from anywhere.
  T.search = { name:'Search', icon:'library', kind:'box', zones:['home','page','player'], w:'full', desc:'Type to search your library',
    fields:[['ph','Hint text','text','Search songs and videos…']],
    render:function(o){
      return '<form class="pw-bl pw-srch" data-pw-search="1" autocomplete="off"><span class="pw-bl-i">' + svg('search') + '</span><input type="search" enterkeyhint="search" maxlength="80" placeholder="' + esc(o.ph || 'Search songs and videos…') + '">' +
        '<button type="submit" aria-label="Search">' + svg('send') + '</button></form>';
    } };

  // Countdown to a date.
  T.countdown = { name:'Countdown', icon:'clock', kind:'box', zones:['home','page','player','video'], w:'full', desc:'Days and hours until something',
    fields:[['label','What for','text','Until the weekend'],['date','Date','date',''],['time','Time','time',''],['secs','Show seconds','toggle',false],['size','Size','seg',SIZES],['align','Align','seg',ALIGN],['card','On a card','toggle',true]],
    render:function(o){
      return card(cardOn(o), '<div class="pw-cd pw-ts-' + (o.size || 'm') + '" data-pw-live="countdown" data-at="' + esc((o.date || '') + (o.date ? 'T' + (o.time || '00:00') : '')) + '" data-secs="' + (o.secs ? 1 : 0) + '">' +
        '<div class="pw-cd-l">' + esc(o.label || 'Until the weekend') + '</div><div class="pw-cd-v"></div></div>');
    },
    live:function(el, st){
      var at = el.dataset.at ? new Date(el.dataset.at) : null;
      if (!at || isNaN(at)){ var d = new Date(st.now); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() + ((6 - d.getDay() + 7) % 7 || 7)); at = d; }   // next Saturday
      var ms = at - st.now, v = el.querySelector('.pw-cd-v');
      if (ms <= 0){ setText(v, 'Now!'); return; }
      var s = Math.floor(ms / 1000), dd = Math.floor(s / 86400), hh = Math.floor(s % 86400 / 3600), mm = Math.floor(s % 3600 / 60);
      setText(v, (dd ? dd + 'd ' : '') + hh + 'h ' + pad(mm) + 'm' + (el.dataset.secs === '1' ? ' ' + pad(s % 60) + 's' : ''));
    } };

  // This month's calendar.
  T.calendar = { name:'Calendar', icon:'grid', kind:'box', zones:['home','page'], w:'full', desc:'This month, with today marked',
    fields:[['mon','Weeks start on Monday','toggle',true],['card','On a card','toggle',true]],
    render:function(o){ return card(cardOn(o), '<div class="pw-cal" data-pw-live="calendar" data-mon="' + (o.mon === false ? 0 : 1) + '"></div>'); },
    live:function(el, st){
      var now = st.now, sig = now.toDateString(); if (el._sig === sig) return; el._sig = sig;
      var mon = el.dataset.mon === '1', y = now.getFullYear(), m = now.getMonth(), first = new Date(y, m, 1), days = new Date(y, m + 1, 0).getDate();
      var lead = (first.getDay() - (mon ? 1 : 0) + 7) % 7, names = [];
      for (var k = 0; k < 7; k++) names.push(new Date(2024, 0, (mon ? 1 : 7) + k).toLocaleDateString(undefined, { weekday:'narrow' }));
      var cells = names.map(function(n){ return '<i>' + esc(n) + '</i>'; }).join('');
      for (k = 0; k < lead; k++) cells += '<span></span>';
      for (k = 1; k <= days; k++) cells += '<span' + (k === now.getDate() ? ' class="on"' : '') + '>' + k + '</span>';
      el.innerHTML = '<div class="pw-cal-h">' + esc(now.toLocaleDateString(undefined, { month:'long', year:'numeric' })) + '</div><div class="pw-cal-g">' + cells + '</div>';
    } };

  // How far through the day / week / month / year.
  T.dayprog = { name:'Time progress', icon:'chart', kind:'box', zones:['home','page','player','video'], w:'full', desc:'How much of the day, week, month or year has gone',
    fields:[['of','Of the','seg',[['day','Day'],['week','Week'],['month','Month'],['year','Year']]],['card','On a card','toggle',true]],
    render:function(o){ return card(cardOn(o), '<div class="pw-dp" data-pw-live="dayprog" data-of="' + esc(o.of || 'day') + '"><div class="pw-dp-h"><b></b><span></span></div><div class="pw-lvl-bar"><i></i></div></div>'); },
    live:function(el, st){
      var n = st.now, of = el.dataset.of, a, b;
      if (of === 'year'){ a = new Date(n.getFullYear(), 0, 1); b = new Date(n.getFullYear() + 1, 0, 1); }
      else if (of === 'month'){ a = new Date(n.getFullYear(), n.getMonth(), 1); b = new Date(n.getFullYear(), n.getMonth() + 1, 1); }
      else if (of === 'week'){ a = new Date(n); a.setHours(0, 0, 0, 0); a.setDate(a.getDate() - (a.getDay() + 6) % 7); b = new Date(a); b.setDate(b.getDate() + 7); }
      else { a = new Date(n); a.setHours(0, 0, 0, 0); b = new Date(a); b.setDate(b.getDate() + 1); }
      var p = Math.max(0, Math.min(1, (n - a) / (b - a)));
      setText(el.querySelector('b'), { day:'Today', week:'This week', month:'This month', year:'This year' }[of] || 'Today');
      setText(el.querySelector('.pw-dp-h span'), (p * 100).toFixed(of === 'year' ? 1 : 0) + '%');
      el.querySelector('i').style.width = (p * 100).toFixed(2) + '%';
    } };

  // Stopwatch. Keeps running (and keeps its time) when you leave the app.
  var SW_KEY = 'ppStopwatchV1';
  function swAll(){ try { return JSON.parse(localStorage.getItem(SW_KEY)) || {}; } catch(e){ return {}; } }
  function swSave(a){ try { localStorage.setItem(SW_KEY, JSON.stringify(a)); } catch(e){} }
  T.stopwatch = { name:'Stopwatch', icon:'clock', kind:'box', zones:['home','page','player','video'], w:'full', desc:'Start, pause, reset',
    fields:[['tenths','Show tenths','toggle',false],['size','Size','seg',SIZES],['card','On a card','toggle',true]],
    render:function(o, c, ctx, it){
      var id = it ? it.id : 'x';
      return card(cardOn(o), '<div class="pw-sw pw-ts-' + (o.size || 'l') + '" data-pw-live="stopwatch" data-id="' + esc(id) + '" data-tenths="' + (o.tenths ? 1 : 0) + '"><div class="pw-sw-t">0:00</div><div class="pw-sw-b">' +
        '<button type="button" data-pw-act="sw" data-op="go" data-id="' + esc(id) + '">Start</button><button type="button" data-pw-act="sw" data-op="reset" data-id="' + esc(id) + '">Reset</button></div></div>');
    },
    live:function(el, st){
      var s = swAll()[el.dataset.id] || {}, ms = (s.acc || 0) + (s.run ? Date.now() - s.start : 0), sec = ms / 1000;
      var h = Math.floor(sec / 3600), m = Math.floor(sec % 3600 / 60), x = Math.floor(sec % 60);
      setText(el.querySelector('.pw-sw-t'), (h ? h + ':' + pad(m) : m) + ':' + pad(x) + (el.dataset.tenths === '1' ? '.' + Math.floor(ms % 1000 / 100) : ''));
      fitText(el.querySelector('.pw-sw-t'));
      var go = el.querySelector('[data-op="go"]'); setText(go, s.run ? 'Pause' : ms ? 'Go on' : 'Start'); go.classList.toggle('on', !!s.run);
    } };

  // Battery (the phone's).
  var batt = null;
  if (navigator.getBattery) try { navigator.getBattery().then(function(b){ batt = b; ['levelchange','chargingchange'].forEach(function(ev){ b.addEventListener(ev, liveSoon); }); liveSoon(); }).catch(function(){}); } catch(e){}
  T.battery = { name:'Battery', icon:'bolt', kind:'box', zones:['home','page','player','video'], w:'half', desc:'How much charge the phone has',
    fields:[['look','Look','seg',[['bar','Bar'],['ring','Ring'],['text','Just the number']]],['card','On a card','toggle',true]],
    // the look's class is pw-bat-l-*: "pw-bat-bar" is the bar inside, and the Bar look used to get that same class,
    // which squashed the whole widget to the bar's 10 px and cut the number off
    render:function(o){ return card(cardOn(o), '<div class="pw-bat pw-bat-l-' + esc(o.look || 'bar') + '" data-pw-live="battery"><div class="pw-bat-v"></div><div class="pw-bat-bar"><i></i></div><div class="pw-bat-cap"></div></div>'); },
    live:function(el){
      var v = el.querySelector('.pw-bat-v');
      if (!batt){ setText(v, navigator.getBattery ? '…' : 'Not available'); return; }
      var p = Math.round(batt.level * 100), key = p + '|' + !!batt.charging;
      // the number big, the % smaller, and a drawn bolt (not the emoji) while charging
      if (v._k !== key){ v._k = key; v.innerHTML = '<b>' + p + '</b><small>%</small>' + (batt.charging ? '<svg class="pw-bat-bolt" viewBox="0 0 24 24" aria-hidden="true"><path d="M13 2 4 14h7l-1 8 9-12h-7z" fill="currentColor"/></svg>' : ''); v.setAttribute('aria-label', p + '%' + (batt.charging ? ', charging' : '')); }
      setText(el.querySelector('.pw-bat-cap'), batt.charging ? (p >= 100 ? 'Charged' : 'Charging') : p <= 15 ? 'Low battery' : 'Battery');
      el.style.setProperty('--p', p + '%'); el.classList.toggle('pw-bat-low', p <= 15 && !batt.charging); el.classList.toggle('pw-bat-chg', !!batt.charging);
    } };

  // A drawing made only of CSS shapes: decoration that moves with the music.
  var DRAWINGS = [['vinyl','Record'],['cassette','Cassette'],['bars','Equalizer'],['speaker','Speaker'],['sunset','Retro sunset'],['night','Night sky'],['waves','Waves'],['lava','Lava lamp'],['mountains','Mountains']];
  var DRAW_HTML = {
    vinyl:'<div class="pw-dr-vinyl"><i></i></div>',
    cassette:'<div class="pw-dr-cass"><div class="pw-dr-cass-win"><i></i><i></i></div><b></b></div>',
    bars:'<div class="pw-dr-bars">' + '<i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i>' + '</div>',
    speaker:'<div class="pw-dr-spk"><i></i><i></i></div>',
    sunset:'<div class="pw-dr-sun"><i></i><b></b></div>',
    night:'<div class="pw-dr-night"><i></i><b></b><b></b></div>',
    waves:'<div class="pw-dr-waves"><i></i><i></i><i></i></div>',
    lava:'<div class="pw-dr-lava"><i></i><i></i><i></i></div>',
    mountains:'<div class="pw-dr-mtn"><i></i><i></i><i></i><b></b></div>'
  };
  T.drawing = { name:'Drawing', icon:'palette', kind:'box', zones:['home','page','player','video'], w:'half', desc:'A record, cassette, sunset, night sky and more, drawn in your colours',
    fields:[['pic','Drawing','select',DRAWINGS],['h','Height','range',[60, 320, 10, 'px', 140]],['color','Colour','color',''],['move','Moves','seg',[['','While music plays'],['always','All the time'],['never','Never']]]],
    render:function(o){
      var pic = DRAW_HTML[o.pic] ? o.pic : 'vinyl', col = okCol(o.color), hh = Math.max(60, Math.min(320, +o.h || 140));
      return '<div class="pw-dr pw-dr-' + pic + (o.move === 'always' ? ' pw-dr-always' : o.move === 'never' ? ' pw-dr-never' : '') + '" data-pw-live="drawing" style="height:' + hh + 'px;--h:' + hh + 'px' + (col ? ';--dc:' + col : '') + '">' + DRAW_HTML[pic] + '</div>';
    },
    live:function(el, st){ el.classList.toggle('pw-dr-on', !!st.playing); } };

  // A line of your own, a different one each day (or each time, or every few seconds).
  T.rotate = { name:'Changing text', icon:'sparkle', kind:'box', zones:['home','page','player','video'], w:'full', desc:'Your own lines, a different one each day or each visit',
    fields:[['lines','Lines (one per line)','textarea','Turn it up.\nOne more song.\nPress play on a good day.\nNew favourite incoming.'],['every','Change','seg',[['day','Each day'],['open','Each visit'],['10','Every 10 s'],['30','Every 30 s']]],
            ['size','Size','seg',SIZES],['italic','Italic','toggle',false],['align','Align','seg',ALIGN],['card','On a card','toggle',false]],
    render:function(o){
      var lines = String(o.lines == null ? 'Turn it up.\nOne more song.\nPress play on a good day.\nNew favourite incoming.' : o.lines).split('\n').map(function(x){ return x.trim(); }).filter(Boolean);
      if (!lines.length) return '<div class="pw-empty">Write some lines in this box’s settings.</div>';
      return card(o, '<div class="pw-text pw-rot pw-ts-' + (o.size || 'm') + (o.italic ? ' pw-italic' : '') + '" data-pw-live="rotate" data-every="' + esc(o.every || 'day') + '" data-lines="' + esc(JSON.stringify(lines)) + '"></div>');
    },
    live:function(el, st){
      var lines = []; try { lines = JSON.parse(el.dataset.lines); } catch(e){}
      if (!lines.length) return;
      var ev = el.dataset.every, i;
      if (ev === 'day'){ var d = st.now; i = (d.getFullYear() * 372 + d.getMonth() * 31 + d.getDate()) % lines.length; }
      else if (ev === 'open'){ if (el._pick == null) el._pick = Math.floor(Math.random() * lines.length); i = el._pick; }
      else { i = Math.floor(Date.now() / (+ev * 1000)) % lines.length; }
      if (el._i !== i){ el._i = i; el.classList.remove('pw-rot-in'); void el.offsetWidth; el.classList.add('pw-rot-in'); setText(el, lines[i]); }
    } };

