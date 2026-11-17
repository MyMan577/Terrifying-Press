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
    search:'<circle cx="11" cy="11" r="7"/><line x1="16.5" y1="16.5" x2="21" y2="21"/>'
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
    page:      { label:'Open a page', icon:'page', run:function(o){ if (o && o.page) openPage(o.page); else toast('Pick a page in this button’s settings.'); } }
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
        var first = t.find(function(x){ return (x.playlistIds || []).includes(pl.id) && (x.kind === 'video' || x.artUrl); });
        var n = t.filter(function(x){ return (x.playlistIds || []).includes(pl.id); }).length;
        var th = pl.thumb ? '<div class="ph-thumb has-img"><img src="' + esc(pl.thumb) + '" alt=""></div>' : K.thumbHTML(first, false);
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
  function artHTML(t, icon){ var s = thumbOf(t); return '<span class="pw-art">' + (s ? '<img alt="" src="' + esc(s) + '">' : svg(icon || (t && t.kind === 'video' ? 'video' : 'music'))) + '</span>'; }

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
      var inPlayer = !!el.closest('#pw-player-zone'), playerOpen = body.hasAttribute('data-pl-player');
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
      box.innerHTML = !st.has ? '<div class="pw-empty">Play something to see what comes next.</div>' : !list.length ? '<div class="pw-empty">Nothing after this one.</div>'
        : list.map(function(i){ var x = t[i]; if (!x) return '';
            return '<button type="button" class="pw-li" data-pw-act="jump" data-i="' + i + '">' + (art ? artHTML(x) : '') + '<span class="pw-li-t"><b>' + esc(x.title) + '</b><small>' + esc(subOf(x)) + '</small></span></button>'; }).join('');
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
  T.stack = { name:'Stack', icon:'layers', kind:'box', zones:['home','page','player','video'], w:'full', desc:'Several widgets in one spot, swipe between them',
    fields:[['dots','Show dots','toggle',true],['auto','Turn by itself','seg',[['','Off'],['5','5 s'],['10','10 s'],['20','20 s']]]],
    render:function(o, c, ctx, it){
      var kids = (it && it.kids) || [], pages = [];
      kids.forEach(function(k){
        var d = T[k.type]; if (!d) return;
        var h = itemHTML(k, c, ctx);
        if (!h){ if (!editing) return; h = '<div class="pw-hidden-note">' + esc(d.name) + '</div>'; }
        var sty = styleOf(k.o || {});
        pages.push('<div class="pw-stk-pg pw-t-' + k.type + sty.cls + '"' + sty.style + (editing ? '' : sty.data) + '>' + h + '</div>');
      });
      if (!pages.length) return editing ? '<div class="pw-empty">An empty stack. Open its settings to put widgets in it.</div>' : '';
      return '<div class="pw-stk" data-pw-live="stack" data-auto="' + (+o.auto || 0) + '"><div class="pw-stk-tr">' + pages.join('') + '</div>' +
        (o.dots === false || pages.length < 2 ? '' : '<div class="pw-stk-dots">' + pages.map(function(x, i){ return '<i' + (i ? '' : ' class="on"') + '></i>'; }).join('') + '</div>') + '</div>';
    },
    live:function(el){
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
    render:function(o){ return card(cardOn(o), '<div class="pw-bat pw-bat-' + esc(o.look || 'bar') + '" data-pw-live="battery"><div class="pw-bat-v"></div><div class="pw-bat-bar"><i></i></div></div>'); },
    live:function(el){
      var v = el.querySelector('.pw-bat-v');
      if (!batt){ setText(v, navigator.getBattery ? '…' : 'Not available'); return; }
      var p = Math.round(batt.level * 100);
      setText(v, p + '%' + (batt.charging ? ' ⚡' : ''));
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

  var BUILTIN_ORDER = ['title','games','tagline','playground','tabs','hero','chips','videos','audio','history'];
  var NEW_ORDER = ['nowplaying','cover','seekbar','upnext','lyrics','viz','volume','speed','trackinfo','stack','action','shortcuts','search','eq','sleeper','bookmarks','level','bloopy','game',
                   'clock','greeting','countdown','calendar','dayprog','stopwatch','battery','text','rotate','drawing','image','stats',
                   'recent','most','random','cont','genre','playlist','playlists','spacer','divider'];

  function subOf(t){ return t.kind === 'video' ? (t.height ? t.height + 'p' : (t.ext || '').toUpperCase()) : ((t.artist && t.artist !== 'Unknown artist') ? t.artist : (t.ext || '').toUpperCase()); }
  // Home hands its lists over; other zones work them out the same way.
  function data(c){
    if (c && c.vidIdx) return { vid:c.vidIdx, aud:c.audIdx, hist:c.histAll, vidSub:subOf, audSub:subOf };
    var A = api(), K = kit(), t = A ? A.tracks() : [], vid = [], aud = [];
    t.forEach(function(x, i){ if (x.kind === 'video') vid.push(i); else if (!x.stem) aud.push(i); });
    var byId = new Map(t.map(function(x, i){ return [x.dbId, i]; }));
    var hist = (K ? K.history() : []).map(function(h){ return { h:h, i:byId.get(h.id) }; }).filter(function(x){ return x.i != null; });
    return { vid:vid, aud:aud, hist:hist, vidSub:subOf, audSub:subOf };
  }
  function section(title, n, inner, extra, q){
    return '<section class="ph-sec"' + (q ? ' data-pw-q="' + q + '"' : '') + '><div class="ph-sec-head"><h2>' + esc(title) + '</h2><span class="ph-count">' + (n || '') + '</span><span class="ph-spacer"></span>' + (extra || '') + '</div>' + inner + '</section>';
  }
  // A row of tracks in one of three looks. Built-in rows in the plain 'row' look use the Home screen's own markup.
  function trackRow(o, defTitle, idxs, src, subFn, opt, c){
    var K = kit(), A = api(); if (!K || !A) return '';
    var t = A.tracks(), cur = A.currentIndex(), title = o.title || defTitle;
    var style = o.style || (opt.builtin && c && c.ed === 'lite' ? 'list' : 'row');
    var max = o.max != null ? +o.max : (opt.builtin ? 0 : opt.max || 12);
    var shown = max > 0 ? idxs.slice(0, max) : idxs;
    var mk = function(i){ return (style === 'list' ? K.listRowHTML : K.cardHTML)(t[i], i, src, subFn(t[i], i), i === cur); };
    if (opt.builtin && style === 'row' && !o.title && !(max > 0))
      return K.sectionHTML(opt.builtin, title, idxs.map(mk), opt.empty, opt.extra);
    var q = src === 'pw' ? idxs.join(',') : '';
    var more = opt.builtin && idxs.length > shown.length ? '<button type="button" class="ph-link" data-act="sec-open" data-sec="' + opt.builtin + '">See all</button>' : '';
    var inner = !shown.length ? '<div class="ph-empty">' + opt.empty + '</div>'
      : style === 'list' ? '<div class="ph-list">' + shown.map(mk).join('') + '</div>'
      : style === 'grid' ? '<div class="ph-row expanded ph-page-grid">' + shown.map(mk).join('') + '</div>'
      : '<div class="ph-row">' + shown.map(mk).join('') + '</div>';
    return section(title, idxs.length, inner, (opt.extra || '') + more, q);
  }
  // For widgets whose "On a card" setting is on unless switched off.
  function cardOn(o){ return Object.assign({}, o, { card: o.card !== false }); }
  function card(o, inner){
    return '<div class="pw-cardwrap' + (o.card ? ' pw-card' : '') + ' pw-al-' + (o.align || 'left') + '">' + inner + '</div>';
  }

  // ---------- defaults (what each zone looks like before the user changes it) ----------
  function homeDefault(){
    var ed = window.__ppEdition ? window.__ppEdition() : '';
    var order = ['title','games'];
    if (ed) order.push('tagline');
    if (ed === 'playground') order.push('playground');
    order.push('tabs');
    if (ed === 'lite' || ed === 'premium') order.push('hero');
    if (ed === 'plus') order.push('chips');
    order.push('videos','audio');
    if (ed !== 'lite') order.push('history');
    return order.map(function(type){ return { id:uid(), type:type, w:T[type].w, o:{} }; });
  }
  function pageDefault(name){
    return [{ id:uid(), type:'title', w:'full', o:{ text:name } }, { id:uid(), type:'greeting', w:'full', o:{} },
            { id:uid(), type:'clock', w:'half', o:{ card:true } }, { id:uid(), type:'action', w:'half', o:{ action:'shuffleall' } },
            { id:uid(), type:'nowplaying', w:'full', o:{} }, { id:uid(), type:'random', o:{} }];
  }
  function zoneItems(zone, create){
    if (!L.zones[zone] && create) L.zones[zone] = zone === 'home' ? homeDefault() : zone.indexOf('page:') === 0 ? pageDefault('My page') : [];
    var z = L.zones[zone];
    if (!z) return null;
    // Drop any broken entries (an empty slot from an older drag bug) so they can't stop the layout drawing.
    for (var i = z.length - 1; i >= 0; i--){
      var it = z[i];
      if (!it || typeof it !== 'object' || !it.type) z.splice(i, 1);
      else if (it.kids){ if (!Array.isArray(it.kids)) it.kids = []; else it.kids = it.kids.filter(function(k){ return k && typeof k === 'object' && k.type; }); }
    }
    return z;
  }

  // ---------- rendering a zone ----------
  var editing = null;   // what is being edited: a zone, or 'player' (both player areas at once)
  var edZone = null;    // the zone in that session that taps, Add and settings act on
  var EDIT_GROUPS = { player: ['player-top', 'player'] };
  function zonesOf(ed){ return EDIT_GROUPS[ed] || [ed]; }
  function isEd(zone){ return !!editing && zonesOf(editing).indexOf(zone) >= 0; }
  function okCol(v){ return typeof v === 'string' && /^#[0-9a-f]{3,8}$/i.test(v) ? v : ''; }
  function okImg(v){ return typeof v === 'string' && v.indexOf('data:image/') === 0 ? v : ''; }
  var RAD = { '0':0, s:8, m:16, l:24, xl:34 };
  var TZ = { xs:0.8, s:0.9, l:1.15, xl:1.3, xxl:1.5 };   // "Text size" for a whole widget
  // The look every widget can have (Settings > "Every widget"): what is behind it, corners, room inside, text colour,
  // height, and what a tap or a long press does. Used for boxes and for the pages of a stack.
  function styleOf(o){
    var cls = '', st = [], data = '';
    if (o.bx) cls += ' pw-bx-' + o.bx;
    if ((o.bx === 'color' || o.bx === 'gradient') && okCol(o.bxc)) st.push('--pw-bxc:' + o.bxc);
    if (o.bx === 'gradient' && okCol(o.bxc2)) st.push('--pw-bxc2:' + o.bxc2);
    if (o.bx === 'image'){ if (okImg(o.bxi)) st.push('--pw-bxi:url("' + o.bxi + '")'); st.push('--pw-bxd:' + ((o.bxd != null ? +o.bxd : 35) / 100)); }
    if (o.rad != null && RAD[o.rad] != null){ cls += ' pw-rad'; st.push('--pw-rad:' + RAD[o.rad] + 'px'); }
    if (o.pad) cls += ' pw-pad-' + o.pad;
    if (okCol(o.fg)){ cls += ' pw-fg'; st.push('--pw-fg:' + o.fg); }
    if (+o.minh > 0) st.push('min-height:' + Math.min(600, +o.minh) + 'px');
    var F = window.__ppFonts, fcss = o.font && F ? F.css(o.font) : '';
    if (fcss){ cls += ' pw-font'; st.push('--pw-font:' + fcss); }
    if (TZ[o.tz]){ cls += ' pw-tz'; st.push('--pw-tz:' + TZ[o.tz]); }
    if (o.bd && ['thin','thick','accent','dashed'].indexOf(o.bd) >= 0){ cls += ' pw-bd-' + o.bd; if (okCol(o.bdc)) st.push('--pw-bdc:' + o.bdc); }
    if (o.sh && ['soft','deep','glow'].indexOf(o.sh) >= 0) cls += ' pw-sh-' + o.sh;
    if (o.op != null && +o.op < 100) st.push('opacity:' + Math.max(0.15, +o.op / 100));
    if (+o.tilt) st.push('rotate:' + Math.max(-12, Math.min(12, +o.tilt)) + 'deg');
    if (o.an && ['fade','pop','float','pulse','wiggle'].indexOf(o.an) >= 0) cls += ' pw-an-' + o.an;
    if (o.caps) cls += ' pw-caps';
    if (o.tsh) cls += ' pw-tsh';
    if (o.va === 'top' || o.va === 'bottom') cls += ' pw-va-' + o.va;
    if (o.tap && ACTIONS[o.tap]){ cls += ' pw-tappable'; data += ' data-pw-tap="' + esc(o.tap) + '"' + (o.tpage ? ' data-pw-tpage="' + esc(o.tpage) + '"' : ''); }
    if (o.hold && ACTIONS[o.hold]) data += ' data-pw-hold="' + esc(o.hold) + '"' + (o.hpage ? ' data-pw-hpage="' + esc(o.hpage) + '"' : '');
    return { cls: cls, style: st.length ? ' style="' + esc(st.join(';')) + '"' : '', data: data };
  }
  function itemHTML(it, c, ctx){
    var def = T[it.type]; if (!def) return '';
    var html = '';
    try { html = def.render(it.o || {}, c, ctx, it) || ''; } catch(e){ html = '<div class="ph-empty">This widget hit a problem: ' + esc(e.message) + '</div>'; }
    return html;
  }
  function renderZone(zone, c){
    var items = zoneItems(zone, false) || [], ctx = { zone: zone.indexOf('page:') === 0 ? 'page' : zone };
    var rows = [], row = null, fill = 0;
    items.forEach(function(it){
      var def = T[it.type]; if (!def) return;
      var html = itemHTML(it, c, ctx);
      if (!html && !editing) return;
      if (!html) html = '<div class="pw-hidden-note">' + esc(def.name) + ' (shows only when there is something to show)</div>';
      var w = def.kind === 'block' ? 'full' : (it.w || def.w || 'full'), size = W_SIZE[w] || 1;
      var o = it.o || {}, sty = def.kind === 'box' ? styleOf(o) : { cls: o.when ? ' pw-when-' + o.when : '', style: '', data: '' };
      if (def.kind === 'box' && o.when) sty.cls += ' pw-when-' + o.when;
      var boxHTML = '<div class="pw-box pw-w-' + w + ' pw-k-' + def.kind + ' pw-t-' + it.type + sty.cls + (editing ? ' pw-ed' : '') + '" data-wid="' + it.id + '"' + sty.style + (editing ? '' : sty.data) + '>' + html +
        (editing ? '<div class="pw-shield" data-pw-edit="' + it.id + '"></div><div class="pw-tools">' +
          '<span class="pw-grip" data-pw-drag="' + it.id + '">' + svg('grip') + '</span><span class="pw-tname">' + esc(def.name) + (it.kids ? ' (' + it.kids.length + ')' : '') + '</span>' +
          '<button type="button" data-pw-edit="' + it.id + '" aria-label="Settings">' + svg('gear') + '</button>' +
          '<button type="button" data-pw-del="' + it.id + '" aria-label="Remove">' + svg('x') + '</button></div>' : '') + '</div>';
      if (def.kind === 'block'){ rows.push({ block:true, html:[boxHTML] }); row = null; return; }
      if (!row || fill + size > 1.001){ row = { block:false, html:[] }; rows.push(row); fill = 0; }
      row.html.push(boxHTML); fill += size;
    });
    var out = rows.map(function(r){ return '<div class="pw-row' + (r.block ? ' pw-row-block' : ' pw-row-box') + '">' + r.html.join('') + '</div>'; }).join('');
    var ed = isEd(zone), multi = ed && (zonesOf(editing).length > 1 || zone === 'video');
    if (ed) out += '<button type="button" class="pw-add-big' + (multi ? ' pw-add-slim' : '') + '" data-pw-add="1">' + svg('plus') + (multi ? 'Add here' : 'Add a widget') + '</button>';
    if (multi) out = '<div class="pw-zone-label">' + esc(zoneName(zone)) + '</div>' + out;
    return '<div class="pw-zone' + (ed ? ' pw-zone-ed' : '') + '" data-zone="' + esc(zone) + '">' + out + '</div>';
  }

  // ---------- live widgets ----------
  // Any element with data-pw-live="<type>" is kept up to date by T[<type>].live(el, state): twice a second, and
  // straight away when the song, play/pause or the lyrics line changes. The timer stops when no live widget is left.
  var tick = null, soonRaf = 0;
  function pad(n){ return (n < 10 ? '0' : '') + n; }
  function liveState(){
    var A = api(), K = kit(), i = A ? A.currentIndex() : -1, t = A && i >= 0 ? A.tracks()[i] : null;
    var pb = document.getElementById('play-btn');
    return { now: new Date(), A: A, K: K, W: A && A.w ? A.w : null, i: i, t: t, has: !!(K && K.hasTrack() && t),
             playing: !!(pb && pb.getAttribute('aria-label') === 'Pause') };
  }
  function liveUpdate(){
    var live = document.querySelectorAll('[data-pw-live]'); if (!live.length) return 0;
    var st = liveState();
    live.forEach(function(el){
      var d = T[el.dataset.pwLive];
      if (d && d.live){ try { d.live(el, st); } catch(e){ console.error(e); } }
    });
    return live.length;
  }
  function liveSoon(){ if (!soonRaf) soonRaf = requestAnimationFrame(function(){ soonRaf = 0; liveUpdate(); }); }
  function startTick(){
    if (tick) return;
    tick = setInterval(function(){
      if (document.visibilityState !== 'visible') return;
      if (!liveUpdate()){ clearInterval(tick); tick = null; }
    }, 500);
  }
  // Changes the widgets should show without waiting for the next tick (works for the native player too: these are
  // the page's own title, play button and lyrics line, which every player path updates).
  (function(){
    if (typeof MutationObserver !== 'function') return;
    var mo = new MutationObserver(liveSoon);
    ['np-title', 'np-artist'].forEach(function(id){ var e = document.getElementById(id); if (e) mo.observe(e, { childList:true, characterData:true, subtree:true }); });
    var pb = document.getElementById('play-btn'); if (pb) mo.observe(pb, { attributes:true, attributeFilter:['aria-label'] });
    var ly = document.getElementById('lyrics-overlay'); if (ly) mo.observe(ly, { childList:true, subtree:true, attributes:true, attributeFilter:['class'] });
  })();
  function fmtT(sec){ sec = Math.max(0, Math.round(sec || 0)); var h = Math.floor(sec / 3600), m = Math.floor(sec % 3600 / 60), x = sec % 60; return (h ? h + ':' + pad(m) : m) + ':' + pad(x); }
  function setText(el, v){ if (el && el.textContent !== v) el.textContent = v; }
  // Shrinks one line of text until it fits its box (wide fonts, big text sizes). Redone when the box, the text length or its width changes.
  function fitText(el){
    var key = el.clientWidth + ':' + el.textContent.length + ':' + el.scrollWidth; if (!el.clientWidth || el._fit === key) return;
    el.style.fontSize = ''; el._fit = key;
    for (var n = 0, over = el.scrollWidth / el.clientWidth; over > 1.01 && n < 6; n++, over = el.scrollWidth / el.clientWidth)
      el.style.fontSize = (parseFloat(getComputedStyle(el).fontSize) / (el.currentCSSZoom || 1) / over * 0.97).toFixed(1) + 'px';
    el._fit = el.clientWidth + ':' + el.textContent.length + ':' + el.scrollWidth;   // a font that loads later changes the width: fit again
  }
  // A widget that has nothing to show this moment (no lyrics, no bookmarks...) can hide its whole box.
  function liveHide(el, hide){ var b = el.closest('.pw-box, .pw-stk-pg'); if (b) b.classList.toggle('pw-live-hide', !!hide && !editing); }

  // ---------- stacks: several widgets in one place, swiped through ----------
  function stackDots(stk){
    var tr = stk.querySelector('.pw-stk-tr'), dots = stk.querySelectorAll('.pw-stk-dots i'); if (!tr || !dots.length) return;
    var n = Math.round(tr.scrollLeft / Math.max(1, tr.clientWidth));
    dots.forEach(function(d, i){ d.classList.toggle('on', i === n); });
  }
  document.addEventListener('scroll', function(e){
    var tr = e.target; if (!tr.classList || !tr.classList.contains('pw-stk-tr')) return;
    stackDots(tr.parentNode);
  }, true);
  ['pointerdown', 'touchstart'].forEach(function(ev){
    document.addEventListener(ev, function(e){ var stk = e.target.closest && e.target.closest('.pw-stk'); if (stk) stk._pwTouched = Date.now(); }, { capture:true, passive:true });
  });

  // ---------- zones on screen ----------
  var homeEl = document.getElementById('pl-home');
  function renderHome(c){ lastHomeCtx = c; startTick(); setTimeout(liveUpdate, 0); return renderZone('home', c); }
  var lastHomeCtx = null;

  // Pages the user makes, each opened from a tab or a button.
  var pageEl = document.createElement('div'); pageEl.id = 'pw-page'; pageEl.setAttribute('aria-label', 'Page'); body.appendChild(pageEl);
  var openPageId = null;
  function pageById(id){ return L.pages.find(function(p){ return p.id === id; }); }
  function openPage(id){
    if (!pageById(id)){ toast('That page no longer exists.'); return; }
    var K = kit(); if (K && K.on() && K.view() !== 'home'){ K.setView('home'); }
    openPageId = id; body.setAttribute('data-pw-page', id);
    renderPage(); pageEl.scrollTop = 0; syncTabs();
  }
  function closePage(){
    if (!openPageId) return;
    openPageId = null; body.removeAttribute('data-pw-page'); pageEl.innerHTML = ''; syncTabs();
  }
  function renderPage(){
    if (!openPageId) return;
    var top = pageEl.scrollTop;
    var editingThis = editing === 'page:' + openPageId, empty = !(L.zones['page:' + openPageId] || []).length;
    pageEl.innerHTML = renderZone('page:' + openPageId, null) +
      (empty && !editingThis ? '<div class="pw-page-empty">' + svg('page') + '<b>This page is empty</b><span>Long-press this page\u2019s tab, or use Your pages in Customize, to add a clock, buttons, rows of videos and more.</span></div>' : '');
    pageEl.scrollTop = top;
    if (kit()) kit().observe(pageEl);
    startTick(); liveUpdate();
  }

  // The music player has two areas: one at the top under the title, one just above the controls. Both are
  // empty (and take no room) until something is put in them; the cover shrinks to make room for what is.
  var playerZoneEl = document.createElement('div'); playerZoneEl.id = 'pw-player-zone';
  (function(){ var col = document.getElementById('controls-col'), np = document.getElementById('now-playing'); if (col && np) col.insertBefore(playerZoneEl, np); })();
  var playerTopEl = document.createElement('div'); playerTopEl.id = 'pw-player-top'; body.appendChild(playerTopEl);
  // Over a video: fades in and out with the controls (or stays), at the top or the bottom.
  var videoZoneEl = document.createElement('div'); videoZoneEl.id = 'pw-video-zone'; body.appendChild(videoZoneEl);
  if (typeof ResizeObserver === 'function') new ResizeObserver(function(){
    body.style.setProperty('--pw-top-h', (body.classList.contains('pw-has-player-top') ? Math.ceil(playerTopEl.getBoundingClientRect().height) : 0) + 'px');
  }).observe(playerTopEl);
  function fillZone(el, zone, cls){
    var items = zoneItems(zone, false), has = !!(items && items.length) || isEd(zone);
    body.classList.toggle(cls, has);
    el.innerHTML = has ? renderZone(zone, null) : '';
    if (!has) body.style.setProperty(zone === 'player-top' ? '--pw-top-h' : '--pw-none', '0px');
    return has;
  }
  // The Library tab: an area at the top of the list, above the Add / Sort buttons. Takes no room until used.
  var libZoneEl = document.createElement('div'); libZoneEl.id = 'pw-lib-zone';
  (function(){ var pane = document.getElementById('sidebar-pane-playlist'), ar = document.getElementById('action-row'); if (pane) pane.insertBefore(libZoneEl, ar && ar.parentNode === pane ? ar : pane.firstChild); })();
  function renderLibrary(){ if (fillZone(libZoneEl, 'library', 'pw-has-lib-zone')){ var K = kit(); if (K) K.observe(libZoneEl); startTick(); liveUpdate(); } }
  function renderPlayer(){
    var a = fillZone(playerZoneEl, 'player', 'pw-has-player-zone'), b = fillZone(playerTopEl, 'player-top', 'pw-has-player-top');
    if (a || b){ startTick(); liveUpdate(); }
    renderVideo();
  }
  function videoOpt(){ var o = (L.zopt && L.zopt.video) || {}; return { pos: o.pos === 'bottom' ? 'bottom' : 'top', show: o.show === 'always' ? 'always' : 'ui' }; }
  function renderVideo(){
    var vo = videoOpt();
    videoZoneEl.className = 'pw-vz-' + vo.pos + ' pw-vz-' + vo.show;
    if (fillZone(videoZoneEl, 'video', 'pw-has-video-zone')){ startTick(); liveUpdate(); }
  }
  // Touching something in the overlay keeps the controls (and so the overlay) up, like touching the controls does.
  videoZoneEl.addEventListener('pointerdown', function(){ if (!editing && window.__ppTap) window.__ppTap(); }, true);
  function videoAreaSheet(){
    var vo = videoOpt(), seg = function(k, label, opts){ return '<div class="pw-f"><label>' + label + '</label><div class="pw-seg" data-vo="' + k + '">' +
      opts.map(function(x){ return '<button type="button" data-v="' + x[0] + '"' + (vo[k] === x[0] ? ' class="on"' : '') + '>' + x[1] + '</button>'; }).join('') + '</div></div>'; };
    openSheet('Over the video', '<p class="pw-note">Where these widgets sit on a playing video.</p>' +
      seg('pos', 'Where', [['top','Top'],['bottom','Above the controls']]) + seg('show', 'Show them', [['ui','With the controls'],['always','All the time']]));
    sheetBody.querySelectorAll('[data-vo] button').forEach(function(b){ b.addEventListener('click', function(){
      remember(); L.zopt = L.zopt || {}; L.zopt.video = L.zopt.video || {}; L.zopt.video[b.parentNode.dataset.vo] = b.dataset.v; save(); renderVideo(); videoAreaSheet(); }); });
  }

  // ---------- arranging the app's own rows of buttons and sections ----------
  // Each group is a row of existing elements. They are never moved in the page: CSS `order` puts them in the
  // chosen order and `display:none` hides them, so every bit of code that finds them keeps working.
  // Item: [key, label, selector, canHide]. Keys are also the ids older versions stored in L.hide.
  var PL = 'body.player-layout[data-pl-player]:not(.pl-video) #controls-col > ';
  var VT = function(id){ return '#video-tools > :is(#' + id + ', :has(#' + id + '))'; };
  var SG = function(n){ return '#pp-sg-root > .pp-sg:nth-child(' + n + ')'; };
  var GROUPS = [
    { id:'rows', name:'Player rows', note:'The order of the rows on the music player page.', items:[
      ['now-playing','Title & artist', PL + '#now-playing', true], ['pw-player-zone','Your widgets', PL + '#pw-player-zone', false],
      ['seek-row','Seek bar', PL + '#seek-row', true], ['transport','Main buttons', PL + '#transport', false],
      ['extra-transport','Tools row', PL + '#extra-transport', true], ['controls-footer','Volume row', PL + '#controls-footer', true]] },
    { id:'transport', name:'Main buttons', note:'Play / pause always stays.', items:[
      ['shuffle-btn','Shuffle','#transport > #shuffle-btn', true], ['prev-btn','Previous','#transport > #prev-btn', true],
      ['play-btn','Play / pause','#transport > #play-btn', false], ['next-btn','Next','#transport > #next-btn', true],
      ['repeat-btn','Repeat','#transport > #repeat-btn', true]] },
    { id:'tools', name:'Tools row', note:'Hide tools here. To change their order or move them into the menu, use the player’s own menu (☰ > edit quick bar).', noOrder:true, items:[
      ['speed-btn','Speed','#speed-btn', true], ['extras-btn','Bookmarks & lyrics','#extras-btn', true], ['ab-loop-btn','A-B loop','#ab-loop-btn', true],
      ['cutter-btn','Trim & clip','#cutter-btn', true], ['sleep-btn','Sleep timer','#sleep-btn', true]] },
    { id:'video', name:'Video buttons', note:'The buttons over a playing video.', items:[
      ['subtitle-btn','Subtitles', VT('subtitle-btn'), true], ['filter-btn','Filters', VT('filter-btn'), true], ['pip-btn','Picture-in-picture', VT('pip-btn'), true],
      ['to-audio-btn','Switch to audio', VT('to-audio-btn'), true], ['rotate-btn','Rotate', VT('rotate-btn'), true], ['fullscreen-btn','Fullscreen', VT('fullscreen-btn'), true]] },
    { id:'mini', name:'Mini player', note:'The bar above the tabs while something plays.', items:[
      ['pl-mini-art','Cover','#pl-mini > #pl-mini-art', true], ['pl-mini-text','Title','#pl-mini > #pl-mini-text', false],
      ['pl-mini-prev','Previous','#pl-mini > #pl-mini-prev', true], ['pl-mini-play','Play / pause','#pl-mini > #pl-mini-play', false],
      ['pl-mini-next','Next','#pl-mini > #pl-mini-next', true], ['pl-mini-prog','Progress line','#pl-mini > #pl-mini-prog', true]] },
    { id:'seek', name:'Seek & volume', noOrder:true, items:[
      ['cur-time','Time played','#cur-time', true], ['dur-time','Length','#dur-time', true], ['vol-row','Volume slider','body.player-layout #vol-row', true]] },
    { id:'settings', name:'Settings sections', note:'Appearance always stays, so you can get back here.', items:[
      ['sg-play','Playback', SG(1), true], ['sg-lib','Library & playlists', SG(2), true], ['sg-look','Appearance & layout', SG(3), false],
      ['sg-data','Backup & storage', SG(4), true], ['sg-fun','Rewards & games', SG(5), true]] }
  ];
  function groupItems(g){
    var saved = (L.order || {})[g.id] || [], byKey = {};
    g.items.forEach(function(it){ byKey[it[0]] = it; });
    var out = saved.filter(function(k){ return byKey[k]; }).map(function(k){ return byKey[k]; });
    g.items.forEach(function(it){ if (out.indexOf(it) < 0) out.push(it); });
    return out;
  }
  var hideStyle = document.createElement('style'); hideStyle.id = 'pw-hide-css'; document.head.appendChild(hideStyle);
  function applyHide(){
    var css = [], hide = L.hide || [];
    GROUPS.forEach(function(g){
      var items = groupItems(g), ordered = !g.noOrder && L.order && L.order[g.id];
      items.forEach(function(it, i){
        if (ordered) css.push(it[2] + '{order:' + (i + 1) + '!important}');
        if (it[3] && hide.indexOf(it[0]) >= 0) css.push(it[2] + '{display:none!important}');
      });
      if (g.id === 'settings' && ordered) css.push('#pp-sg-root{display:flex;flex-direction:column}');
    });
    hideStyle.textContent = css.join('\n');
  }
  function arrangeSheet(gid){
    var g = GROUPS.find(function(x){ return x.id === gid; }), hide = L.hide || [];
    var list = groupItems(g);
    openSheet(g.name, (g.note ? '<p class="pw-note">' + esc(g.note) + '</p>' : '') + '<div class="pw-tabs">' + list.map(function(it, i){
      var shown = hide.indexOf(it[0]) < 0;
      return '<div class="pw-tabrow pw-arr' + (shown ? '' : ' pw-off') + '"><span class="pw-arr-name">' + esc(it[1]) + '</span>' +
        (g.noOrder ? '' : '<button type="button" class="pw-ic pw-v" data-mv="' + i + ':-1" aria-label="Move up">' + svg('up') + '</button><button type="button" class="pw-ic pw-v" data-mv="' + i + ':1" aria-label="Move down">' + svg('down') + '</button>') +
        (it[3] ? '<button type="button" class="pw-ic' + (shown ? ' pw-on' : '') + '" data-tg="' + it[0] + '" aria-label="' + (shown ? 'Hide' : 'Show') + '">' + svg('eye') + '</button>' : '<span class="pw-ic pw-lock">' + svg('eye') + '</span>') +
        '</div>';
    }).join('') + '</div><div class="pw-sh-actions"><button type="button" class="pw-mini" data-arrreset="1">Back to normal</button></div>');
    sheetBody.querySelectorAll('[data-mv]').forEach(function(b){ b.addEventListener('click', function(){
      var a = b.dataset.mv.split(':'), i = +a[0], j = i + (+a[1]); if (j < 0 || j >= list.length) return;
      remember(); L.order = L.order || {}; var keys = list.map(function(x){ return x[0]; }); var t = keys[i]; keys[i] = keys[j]; keys[j] = t;
      L.order[g.id] = keys; save(); applyHide(); arrangeSheet(gid); }); });
    sheetBody.querySelectorAll('[data-tg]').forEach(function(b){ b.addEventListener('click', function(){
      var k = b.dataset.tg; remember(); L.hide = (L.hide || []).filter(function(x){ return x !== k; });
      if (hide.indexOf(k) < 0) L.hide.push(k); save(); applyHide(); arrangeSheet(gid); }); });
    sheetBody.querySelector('[data-arrreset]').addEventListener('click', function(){
      remember(); if (L.order) delete L.order[g.id]; var keys = g.items.map(function(x){ return x[0]; });
      L.hide = (L.hide || []).filter(function(k){ return keys.indexOf(k) < 0; }); save(); applyHide(); arrangeSheet(gid); });
  }

  // ---------- tab bar ----------
  var bar = document.getElementById('pl-tabbar');
  var BUILTIN_TABS = ['home','playlists','library','settings'];
  function tabsDefault(){ return BUILTIN_TABS.map(function(v){ return { id:v, type:'view', view:v }; }); }
  function tabList(){ return L.tabs || tabsDefault(); }
  function tabInfo(t){
    if (t.type === 'view'){ var b = bar && bar.querySelector('button[data-pl-view="' + t.view + '"]'); return { label: t.label || ACTIONS[t.view].label, icon: t.icon || null }; }
    if (t.type === 'page'){ var p = pageById(t.page); return { label: t.label || (p ? p.name : 'Page'), icon: t.icon || 'page' }; }
    if (t.type === 'games') return { label: t.label || 'Games', icon: t.icon || 'game' };
    if (t.type === 'player') return { label: t.label || 'Playing', icon: t.icon || 'headphones' };
    var a = ACTIONS[t.action] || ACTIONS.shuffleall; return { label: t.label || a.label, icon: t.icon || a.icon };
  }
  var origLabels = {};
  function applyTabs(){
    if (!bar) return;
    bar.querySelectorAll('.pw-tab').forEach(function(b){ b.remove(); });
    var list = tabList(), ind = document.getElementById('pl-tab-ind');
    BUILTIN_TABS.forEach(function(v){
      var b = bar.querySelector('button[data-pl-view="' + v + '"]'); if (!b) return;
      if (!origLabels[v]) origLabels[v] = { label: b.querySelector('span').textContent, svg: b.querySelector('svg').outerHTML };
      var t = list.find(function(x){ return x.type === 'view' && x.view === v; });
      b.hidden = !t;
      b.querySelector('span').textContent = (t && t.label) || origLabels[v].label;
      var cur = b.querySelector('svg'), want = t && t.icon ? svg(t.icon) : origLabels[v].svg;
      if (cur.outerHTML !== want){ var tmp = document.createElement('div'); tmp.innerHTML = want; b.replaceChild(tmp.firstChild, cur); }
    });
    list.forEach(function(t){
      var el;
      if (t.type === 'view') el = bar.querySelector('button[data-pl-view="' + t.view + '"]');
      else {
        var info = tabInfo(t);
        el = document.createElement('button'); el.type = 'button'; el.className = 'pw-tab'; el.dataset.pwTab = t.id;
        if (t.type === 'games') el.setAttribute('data-pp-games', '');
        el.setAttribute('aria-label', info.label);
        el.innerHTML = svg(info.icon) + '<span>' + esc(info.label) + '</span>';
      }
      if (el) bar.insertBefore(el, ind || null);
    });
    body.style.setProperty('--pw-tabs', list.length);
    syncTabs();
  }
  function syncTabs(){
    if (!bar) return;
    bar.querySelectorAll('.pw-tab').forEach(function(b){
      var t = tabList().find(function(x){ return x.id === b.dataset.pwTab; });
      b.classList.toggle('active', !!(t && t.type === 'page' && t.page === openPageId));
    });
    if (openPageId) bar.querySelectorAll('button[data-pl-view]').forEach(function(b){ b.classList.remove('active'); });
    else {
      var K = kit(), v = K ? K.view() : 'home';
      bar.querySelectorAll('button[data-pl-view]').forEach(function(b){ b.classList.toggle('active', b.dataset.plView === v); });
    }
  }
  if (bar) bar.addEventListener('click', function(e){
    var b = e.target.closest('button'); if (!b) return;
    if (b.dataset.plView){
      if (openPageId){ var same = kit() && kit().view() === b.dataset.plView; closePage(); if (same){ e.stopImmediatePropagation(); syncTabs(); } }
      return;
    }
    var t = tabList().find(function(x){ return x.id === b.dataset.pwTab; }); if (!t) return;
    if (t.type === 'page') openPage(t.page);
    else if (t.type === 'player') runAction('player');
    else if (t.type === 'action') runAction(t.action, t);
  }, true);
  // Long-press a page's tab: open it in edit mode.
  var lpTimer = 0, lpFired = false;
  if (bar){
    bar.addEventListener('pointerdown', function(e){
      var b = e.target.closest('.pw-tab'); if (!b) return;
      var t = tabList().find(function(x){ return x.id === b.dataset.pwTab; }); if (!t || t.type !== 'page') return;
      lpFired = false; clearTimeout(lpTimer);
      lpTimer = setTimeout(function(){ lpFired = true; if (navigator.vibrate) try { navigator.vibrate(15); } catch(err){} startEdit('page:' + t.page); }, 550);
    });
    ['pointerup','pointercancel','pointerleave'].forEach(function(ev){ bar.addEventListener(ev, function(){ clearTimeout(lpTimer); }); });
    bar.addEventListener('click', function(e){ if (lpFired){ lpFired = false; e.stopImmediatePropagation(); e.preventDefault(); } }, true);
    bar.addEventListener('contextmenu', function(e){ if (e.target.closest('.pw-tab')) e.preventDefault(); });
  }
  function goView(v){
    closePage();
    var K = kit(); if (!K) return;
    if (!K.on()){ var s = document.querySelector('.sidebar-tab[data-sidebar-tab="' + (v === 'settings' ? 'settings' : 'playlist') + '"]'); if (s) s.click(); return; }
    K.goTab(v);
  }

  // ---------- clicks on widgets ----------
  document.addEventListener('click', function(e){
    var el = e.target.closest && e.target.closest('[data-pw-act]'); if (!el || editing) return;
    if (!el.closest('.pw-zone')) return;
    var act = el.dataset.pwAct;
    if (act === 'reshuffle'){ randomSeed = Math.random(); refreshAll(); return; }
    if (act === 'openpl'){ closePage(); var K = kit(); if (K) K.goTab('playlists'); setTimeout(function(){ if (window.__ppOpenPlaylist) window.__ppOpenPlaylist(el.dataset.pl); }, 50); return; }
    var w = wapi();
    if (act === 'jump'){ if (w) w.jump(+el.dataset.i); liveSoon(); return; }
    if (act === 'seek'){ if (w) w.seek(+el.dataset.s); return; }
    if (act === 'bmadd'){ if (!kit() || !kit().hasTrack()){ toast('Play something first.'); return; } if (click('bm-add')){ toast('Bookmark added.'); setTimeout(liveSoon, 50); } return; }
    if (act === 'eqp'){ var b = document.querySelector('#eq-preset-row button[data-eq-preset="' + el.dataset.p + '"]'); if (b){ b.click(); toast('Sound: ' + eqLabel(el.dataset.p)); } setTimeout(liveSoon, 30); return; }
    if (act === 'sleepset'){ if (!w) return; var m = el.dataset.m;
      if (m === 'off') runAction('sleepoff'); else if (m === 'end') runAction('sleepend'); else { w.sleepFor(+m); toast('Sleep timer: ' + (m === '60' ? '1 hour' : m + ' minutes') + '.'); liveSoon(); }
      return; }
    if (act === 'game'){ if (window.__ppGames) window.__ppGames.open(el.dataset.g); return; }
    if (act === 'mute'){ var vo = document.getElementById('volume'); if (!vo) return; if (+vo.value > 0){ volBefore = +vo.value; inputTo('volume', 0); } else inputTo('volume', volBefore || 80); liveSoon(); return; }
    if (act === 'speed'){ if (inputTo('speed-slider', el.dataset.v)) toast('Speed: ' + el.dataset.v + '×'); liveSoon(); return; }
    if (act === 'sw'){ var all = swAll(), s = all[el.dataset.id] || {};
      if (el.dataset.op === 'reset') s = {};
      else if (s.run){ s.acc = (s.acc || 0) + Date.now() - s.start; s.run = false; }
      else { s.start = Date.now(); s.run = true; }
      all[el.dataset.id] = s; swSave(all); startTick(); liveSoon(); return; }
    runAction(act, { page: el.dataset.pwPage });
  });
  // Sliders in widgets: the progress bar and the volume.
  document.addEventListener('input', function(e){
    var r = e.target; if (!r.dataset || !r.dataset.pwRange || editing) return;
    r._drag = true; r.style.setProperty('--p', (r.dataset.pwRange === 'seek' ? +r.value / 10 : +r.value) + '%');
    if (r.dataset.pwRange === 'vol'){ var v = document.getElementById('volume'); if (v){ v.value = r.value; v.dispatchEvent(new Event('input', { bubbles:true })); } }
    liveSoon();
  });
  document.addEventListener('change', function(e){
    var r = e.target; if (!r.dataset || !r.dataset.pwRange || editing) return;
    if (r.dataset.pwRange === 'seek'){ var w = wapi(), tm = media2(); if (w && tm.d) w.seek(+r.value / 1000 * tm.d); }
    else { var v = document.getElementById('volume'); if (v) v.dispatchEvent(new Event('change', { bubbles:true })); }
    setTimeout(function(){ r._drag = false; liveSoon(); }, 250);
  });
  document.addEventListener('submit', function(e){
    var f = e.target; if (!f.matches || !f.matches('[data-pw-search]')) return;
    e.preventDefault(); if (editing) return;
    var q = f.querySelector('input').value.trim();
    goView('library');
    setTimeout(function(){ var s = document.getElementById('track-search'); if (!s) return; s.value = q; s.dispatchEvent(new Event('input', { bubbles:true })); s.scrollIntoView({ block:'center' }); }, 120);
  });
  // "Ask Bloopy" boxes send what was typed into Bloopy's own chat.
  document.addEventListener('submit', function(e){
    var f = e.target; if (!f.matches || !f.matches('[data-pw-bloopy]')) return;
    e.preventDefault(); if (editing) return;
    var inp = f.querySelector('input'), v = inp.value.trim(); inp.value = ''; inp.blur();
    askBloopy(v);
  });
  // A tap or long press on a widget can run an action of its own (Settings > Every widget). The widget's own
  // buttons, rows and fields keep working: a tap on them is theirs.
  var holdT = 0, holdEl = null, holdX = 0, holdY = 0, ateClick = 0;
  function ownControl(t, box){ var c = t.closest('button, a, input, select, textarea, label, form, [data-pw-act], [data-act], .ph-card, .ph-row, .ph-list, canvas'); return c && box.contains(c) ? c : null; }
  function runTap(box, kind){ var a = box.getAttribute('data-pw-' + kind), pg = box.getAttribute('data-pw-' + (kind === 'tap' ? 'tpage' : 'hpage')); if (a) runAction(a, { page: pg }); }
  document.addEventListener('click', function(e){
    if (Date.now() - ateClick < 700){ ateClick = 0; e.preventDefault(); e.stopPropagation(); return; }
    if (editing || !e.target.closest) return;
    var box = e.target.closest('[data-pw-tap]'); if (!box || ownControl(e.target, box)) return;
    runTap(box, 'tap');
  }, true);
  document.addEventListener('pointerdown', function(e){
    if (editing || !e.target.closest || (e.pointerType === 'mouse' && e.button !== 0)) return;
    var box = e.target.closest('[data-pw-hold]'); if (!box) return;
    holdEl = box; holdX = e.clientX; holdY = e.clientY; clearTimeout(holdT);
    holdT = setTimeout(function(){
      if (!holdEl) return;
      var b = holdEl; holdEl = null; ateClick = Date.now();
      try { if (navigator.vibrate) navigator.vibrate(12); } catch(err){}
      runTap(b, 'hold');
    }, 520);
  }, true);
  document.addEventListener('pointermove', function(e){ if (holdEl && Math.hypot(e.clientX - holdX, e.clientY - holdY) > 10){ holdEl = null; clearTimeout(holdT); } }, true);
  ['pointerup', 'pointercancel'].forEach(function(ev){ document.addEventListener(ev, function(){ holdEl = null; clearTimeout(holdT); }, true); });
  document.addEventListener('contextmenu', function(e){ if (!editing && e.target.closest && e.target.closest('[data-pw-hold]')) e.preventDefault(); }, true);
  // Rows on a page / in the player play through Home's own handler, which these zones aren't inside.
  pageEl.addEventListener('click', function(e){
    if (editing) return;
    var c = e.target.closest('[data-act="play-video"]'); if (!c) return;
    var q = c.closest('[data-pw-q]'), A = api(), K = kit(); if (!A || !K) return;
    var i = +c.dataset.idx, queue = q ? q.dataset.pwQ.split(',').filter(Boolean).map(Number) : null;
    if (!queue){ var d = data(null); queue = c.dataset.src === 'audio' ? d.aud : c.dataset.src === 'history' ? d.hist.map(function(x){ return x.i; }) : d.vid; }
    K.playFrom(i, queue);
  });

  // ---------- refresh ----------
  function refreshAll(){
    var K = kit(); if (K) K.renderHome(true);
    renderPage(); renderPlayer(); renderLibrary(); applyTabs(); applyHide();
  }
  var dataTimer = null;
  function onData(){ clearTimeout(dataTimer); dataTimer = setTimeout(function(){ if (openPageId && !editing) renderPage(); if (!editing){ renderPlayer(); renderLibrary(); } }, 120); }
  // Rows on the Playlists page need re-rendering when the library changes, like Home's.

  // ======================= edit mode =======================
  var edBar = document.createElement('div'); edBar.id = 'pw-edbar'; edBar.hidden = true;
  edBar.innerHTML = '<button type="button" class="pw-ed-done" data-ed="done">Done</button><div class="pw-ed-title"></div>' +
    '<button type="button" data-ed="area" aria-label="Where it shows" hidden>' + svg('sliders') + '</button>' +
    '<button type="button" data-ed="undo" aria-label="Undo">' + svg('undo') + '</button><button type="button" class="pw-ed-add" data-ed="add">' + svg('plus') + 'Add</button>';
  body.appendChild(edBar);
  var sheet = document.createElement('div'); sheet.id = 'pw-sheet'; sheet.hidden = true;
  sheet.innerHTML = '<div class="pw-sheet-card" role="dialog" aria-modal="true"><div class="pw-sheet-head"><b></b><button type="button" class="pw-sheet-x" aria-label="Close">' + svg('x') + '</button></div><div class="pw-sheet-body"></div></div>';
  body.appendChild(sheet);
  var sheetBody = sheet.querySelector('.pw-sheet-body'), sheetTitle = sheet.querySelector('.pw-sheet-head b');
  function openSheet(title, html){ sheetTitle.textContent = title; sheetBody.innerHTML = html; sheet.hidden = false; sheetBody.scrollTop = 0; }
  function closeSheet(){ sheet.hidden = true; sheetBody.innerHTML = ''; }
  sheet.addEventListener('click', function(e){ if (e.target === sheet || e.target.closest('.pw-sheet-x')) closeSheet(); });

  var ZNAMES = { home:'Home', player:'Above the controls', 'player-top':'Top of the player', video:'Over the video', playlists:'Playlists', library:'Library' };
  function zoneName(z){ return ZNAMES[z] || ((pageById(z.slice(5)) || {}).name || 'Page'); }
  function sessionName(ed){ return ed === 'player' ? 'the player' : ed === 'video' ? 'the video overlay' : zoneName(ed); }
  function currentZoneOnScreen(){ var K = kit(); return openPageId ? 'page:' + openPageId : body.hasAttribute('data-pl-player') ? (body.classList.contains('pl-video') ? 'video' : 'player') : K && K.view() === 'playlists' ? 'playlists' : K && K.view() === 'library' ? 'library' : 'home'; }
  function startEdit(zone){
    var K = kit();
    if (!K || !K.on()){ toast('Layout editing works in the media player layout (Settings).'); return; }
    // Work out first whether the spot can be shown; if not, say why and leave everything as it is.
    if (zone.indexOf('page:') === 0 && !pageById(zone.slice(5))){ toast('That page no longer exists.'); return; }
    if (zone === 'player' || zone === 'video'){
      var A0 = api(), t0 = A0 && A0.currentIndex() >= 0 ? A0.tracks()[A0.currentIndex()] : null;
      if (!K.hasTrack() || !t0 || (zone === 'video' && t0.kind !== 'video')){ toast(zone === 'video' ? 'Play a video first, then edit what shows over it.' : 'Play something first, then edit the player.'); return; }
      if (zone === 'player' && t0.kind === 'video'){ toast('Play a song (not a video) to edit the music player.'); return; }
    }
    if (editing && editing !== zone){ editing = null; edZone = null; body.classList.remove('pw-editing'); edBar.hidden = true; closeSheet(); }
    var ov = document.getElementById('customize-modal-overlay'); if (ov) ov.classList.remove('open');
    // Home, Playlists and pages sit under the music/video player: close it so the spot is on screen.
    if (zone.indexOf('page:') === 0 || zone === 'home' || zone === 'playlists' || zone === 'library'){ if (K.playerOpen && K.playerOpen() && K.closePlayer) K.closePlayer(); }
    if (zone === 'home' || zone === 'playlists'){ closePage(); K.setView(zone); }
    else if (zone === 'library'){ closePage(); K.setView('library'); }
    else if (zone === 'player' || zone === 'video'){ closePage(); K.openPlayer(); }
    else openPage(zone.slice(5));
    zonesOf(zone).forEach(function(z){ zoneItems(z, true); }); save();
    edZone = zone === 'player' ? 'player' : zone;
    undoStack = [];
    editing = zone; body.classList.add('pw-editing');
    edBar.hidden = false;
    var ttl = edBar.querySelector('.pw-ed-title');
    if (zone.indexOf('page:') === 0){
      ttl.innerHTML = '<input type="text" maxlength="24" aria-label="Page name" value="' + esc(zoneName(zone)) + '">';
      var nm = ttl.firstChild, pid = zone.slice(5), tmr;
      nm.addEventListener('input', function(){ clearTimeout(tmr); tmr = setTimeout(function(){ var p = pageById(pid); if (p){ p.name = nm.value.trim() || 'Page'; save(); applyTabs(); } }, 250); });
    } else ttl.textContent = 'Editing ' + sessionName(zone);
    edBar.querySelector('[data-ed="area"]').hidden = zone !== 'video';
    refreshZone();
  }
  function stopEdit(){
    if (!editing) return;
    editing = null; edZone = null; body.classList.remove('pw-editing'); edBar.hidden = true; closeSheet();
    refreshAll(); toast('Layout saved.');
  }
  function refreshZone(){
    if (editing === 'home' || editing === 'playlists'){ var K = kit(); if (K) K.renderHome(true); }
    else if (editing === 'player') renderPlayer();
    else if (editing === 'library') renderLibrary();
    else if (editing === 'video') renderVideo();
    else if (editing) renderPage();
  }
  function items(){ return zoneItems(edZone || editing, true); }
  function find(id){ var a = items(); for (var i = 0; i < a.length; i++) if (a[i] && a[i].id === id) return i; return -1; }
  function change(fn){ remember(); fn(); save(); refreshZone(); }

  edBar.addEventListener('click', function(e){
    var b = e.target.closest('[data-ed]'); if (!b) return;
    var k = b.dataset.ed;
    if (k === 'done') stopEdit(); else if (k === 'undo'){ undo(); refreshZone(); } else if (k === 'add') addSheet(); else if (k === 'area') videoAreaSheet();
  });
  // Taps on boxes while editing: settings / remove / add. Capturing, so the app underneath never sees them.
  document.addEventListener('click', function(e){
    if (!editing) return;
    var t = e.target; if (!t.closest) return;
    var zoneEl = t.closest('.pw-zone-ed'); if (!zoneEl) return;
    e.preventDefault(); e.stopPropagation();
    edZone = zoneEl.dataset.zone;
    var del = t.closest('[data-pw-del]'), ed = t.closest('[data-pw-edit]'), add = t.closest('[data-pw-add]');
    if (del){
      var id = del.dataset.pwDel, i = find(id); if (i < 0) return;
      var name = T[items()[i].type].name;
      change(function(){ items().splice(i, 1); });
      toast(name + ' removed. Undo brings it back.');
    } else if (ed) settingsSheet(ed.dataset.pwEdit);
    else if (add) addSheet();
  }, true);
  // Long presses on cards would start selecting; nothing under the shields should react while editing.
  ['pointerdown','contextmenu'].forEach(function(ev){
    document.addEventListener(ev, function(e){ if (editing && e.target.closest && e.target.closest('.pw-shield')) e.stopPropagation(); }, true);
  });

  // ---- dragging a box by its handle ----
  var drag = null;
  document.addEventListener('pointerdown', function(e){
    if (!editing || !e.target.closest) return;
    var h = e.target.closest('[data-pw-drag]'); if (!h) return;
    var box = h.closest('.pw-box'); if (!box) return;
    e.preventDefault(); e.stopPropagation();
    var zEl = box.closest('.pw-zone'); if (zEl) edZone = zEl.dataset.zone;
    var r = box.getBoundingClientRect();
    drag = { id: h.dataset.pwDrag, box: box, x0: e.clientX, y0: e.clientY, target: null, after: false,
             scroller: box.closest('#pl-home, #pw-page, #controls-col') || document.scrollingElement, raf: 0, lastY: e.clientY };
    box.classList.add('pw-dragging');
    try { h.setPointerCapture(e.pointerId); } catch(err){}
    body.classList.add('pw-drag-on');
  }, true);
  document.addEventListener('pointermove', function(e){
    if (!drag) return;
    e.preventDefault();
    drag.box.style.translate = (e.clientX - drag.x0) + 'px ' + (e.clientY - drag.y0) + 'px';
    drag.lastY = e.clientY;
    var zoneEl = drag.box.closest('.pw-zone'), best = null, bestD = 1e9;
    zoneEl.querySelectorAll('.pw-box').forEach(function(b){
      if (b === drag.box) return;
      var r = b.getBoundingClientRect(), cx = Math.max(r.left, Math.min(e.clientX, r.right)), cy = Math.max(r.top, Math.min(e.clientY, r.bottom));
      var d = Math.hypot(cx - e.clientX, cy - e.clientY);
      if (d < bestD){ bestD = d; best = b; }
    });
    zoneEl.querySelectorAll('.pw-drop-before, .pw-drop-after').forEach(function(b){ b.classList.remove('pw-drop-before', 'pw-drop-after'); });
    if (best){
      var r = best.getBoundingClientRect(), sameLine = e.clientY > r.top && e.clientY < r.bottom && r.width < zoneEl.clientWidth * 0.9;
      var after = sameLine ? e.clientX > r.left + r.width / 2 : e.clientY > r.top + r.height / 2;
      best.classList.add(after ? 'pw-drop-after' : 'pw-drop-before');
      drag.target = best.dataset.wid; drag.after = after;
    }
    if (!drag.raf) drag.raf = requestAnimationFrame(function autoscroll(){
      if (!drag){ return; }
      var sc = drag.scroller, r = sc.getBoundingClientRect ? sc.getBoundingClientRect() : { top:0, bottom: innerHeight };
      var v = drag.lastY < r.top + 70 ? -12 : drag.lastY > r.bottom - 70 ? 12 : 0;
      if (v) sc.scrollTop += v;
      drag.raf = v ? requestAnimationFrame(autoscroll) : 0;
    });
  }, { capture:true, passive:false });
  function endDrag(){
    if (!drag) return;
    var d = drag; drag = null; body.classList.remove('pw-drag-on');
    d.box.classList.remove('pw-dragging'); d.box.style.translate = '';
    if (d.target && d.target !== d.id && find(d.id) >= 0 && find(d.target) >= 0){
      change(function(){
        var a = items(), from = find(d.id); var it = a.splice(from, 1)[0]; if (!it) return;
        var to = find(d.target); if (to < 0) to = a.length - 1;
        a.splice(d.after ? to + 1 : to, 0, it);
      });
    } else refreshZone();
  }
  document.addEventListener('pointerup', endDrag, true);
  document.addEventListener('pointercancel', endDrag, true);

  // ---- add sheet ----
  function zoneKind(z){ return z.indexOf('page:') === 0 || z === 'playlists' || z === 'library' ? 'page' : z === 'player-top' ? 'player' : z; }
  function addSheet(){
    if (!edZone || !isEd(edZone)) edZone = zonesOf(editing)[zonesOf(editing).length - 1];
    var zk = zoneKind(edZone), present = items().map(function(x){ return x.type; });
    var tile = function(type){ var d = T[type];
      return '<button type="button" class="pw-add-tile" data-type="' + type + '">' + svg(d.icon) + '<span><b>' + esc(d.name) + '</b>' + (d.desc ? '<small>' + esc(d.desc) + '</small>' : '') + '</span></button>'; };
    var fresh = NEW_ORDER.filter(function(t){ return T[t].zones.indexOf(zk) >= 0; });
    var ed = window.__ppEdition ? window.__ppEdition() : '';
    var back = BUILTIN_ORDER.filter(function(t){ return T[t].zones.indexOf(zk) >= 0 && present.indexOf(t) < 0 &&
      !(t === 'tagline' && !ed) && !(t === 'playground' && ed !== 'playground') && !(t === 'chips' && zk !== 'home'); });
    var grp = zonesOf(editing), where = grp.length > 1 ? '<div class="pw-f"><label>Put it</label><div class="pw-seg" data-where="1">' +
      grp.map(function(z){ return '<button type="button" data-z="' + z + '"' + (z === edZone ? ' class="on"' : '') + '>' + esc(zoneName(z)) + '</button>'; }).join('') + '</div></div>' : '';
    openSheet('Add to ' + (grp.length > 1 ? sessionName(editing) : zoneName(edZone || editing)),
      where + '<div class="pw-add-grid">' + fresh.map(tile).join('') + '</div>' +
      (back.length ? '<div class="pw-sh-h">Put back built-in parts</div><div class="pw-add-grid">' + back.map(tile).join('') + '</div>' : ''));
    sheetBody.querySelectorAll('[data-where] button').forEach(function(b){ b.addEventListener('click', function(){ edZone = b.dataset.z; addSheet(); }); });
    sheetBody.querySelectorAll('.pw-add-tile').forEach(function(b){
      b.addEventListener('click', function(){
        var type = b.dataset.type, it = { id:uid(), type:type, w: (zk === 'player' || zk === 'video') && type !== 'action' ? 'full' : T[type].w, o:{} };
        change(function(){ items().push(it); });
        closeSheet();
        setTimeout(function(){ var el = document.querySelector('.pw-box[data-wid="' + it.id + '"]'); if (el) el.scrollIntoView({ block:'center', behavior:'smooth' }); }, 60);
        if ((T[type].fields || []).length) setTimeout(function(){ settingsSheet(it.id); }, 260);
      });
    });
  }

  // ---- settings sheet for one box ----
  function fieldHTML(f, o){
    var k = f[0], label = f[1], type = f[2], def = f[3], v = o[k] != null ? o[k] : (type === 'range' ? null : def);
    var row = function(inner){ return '<div class="pw-f"><label>' + esc(label) + '</label>' + inner + '</div>'; };
    if (type === 'text') return row('<input type="text" data-k="' + k + '" value="' + esc(v || '') + '" placeholder="' + esc(def || '') + '" maxlength="80">');
    if (type === 'select') return row('<select data-k="' + k + '">' + def.map(function(x, i){ return '<option value="' + esc(x[0]) + '"' + ((o[k] ? o[k] === x[0] : i === 0) ? ' selected' : '') + '>' + esc(x[1]) + '</option>'; }).join('') + '</select>');
    if (type === 'date' || type === 'time') return row('<input type="' + type + '" data-k="' + k + '" value="' + esc(v || '') + '">');
    if (type === 'textarea') return row('<textarea data-k="' + k + '" rows="3" maxlength="600">' + esc(v || '') + '</textarea>');
    if (type === 'toggle') return '<label class="pw-f pw-f-tog"><span>' + esc(label) + '</span><input type="checkbox" data-k="' + k + '"' + (v ? ' checked' : '') + '></label>';
    if (type === 'seg'){ var blank = def.some(function(x){ return x[0] === ''; }), sv = o[k];
      if (sv === true || sv === false) sv = null;   // an older on/off setting that is now a choice
      return row('<div class="pw-seg" data-k="' + k + '">' + def.map(function(x, i){ var on = sv ? sv === x[0] : blank ? x[0] === '' : (i === 0 && k !== 'size'); return '<button type="button" data-v="' + x[0] + '"' + (on ? ' class="on"' : '') + '>' + esc(x[1]) + '</button>'; }).join('') + '</div>'); }
    if (type === 'range'){ var r = def, val = v == null ? (r[4] != null ? r[4] : r[3] === 'all' ? 0 : r[0] === 60 ? 160 : r[0] === 4 ? 24 : 12) : v;
      return row('<div class="pw-range"><input type="range" data-k="' + k + '" data-unit="' + esc(r[3] || '') + '" min="' + (r[3] === 'all' ? 0 : r[0]) + '" max="' + r[1] + '" step="' + r[2] + '" value="' + val + '"><output>' + rangeLabel(r[3], val) + '</output></div>'); }
    if (type === 'color') return row('<div class="pw-colrow"><input type="color" data-k="' + k + '" value="' + esc(v || '#6ee7d0') + '"' + (v ? '' : ' data-unset="1"') + '><button type="button" class="pw-mini" data-clear="' + k + '">' + (v ? 'Use theme colour' : 'Theme colour') + '</button></div>');
    if (type === 'action') return row('<select data-k="' + k + '">' + Object.keys(ACTIONS).map(function(a){ return '<option value="' + a + '"' + ((v || def) === a ? ' selected' : '') + '>' + esc(ACTIONS[a].label) + '</option>'; }).join('') + '</select>');
    if (type === 'action0') return row('<select data-k="' + k + '"><option value="none"' + (!v || v === 'none' ? ' selected' : '') + '>None</option>' + Object.keys(ACTIONS).map(function(a){ return '<option value="' + a + '"' + (v === a ? ' selected' : '') + '>' + esc(ACTIONS[a].label) + '</option>'; }).join('') + '</select>');
    if (type === 'tapact') return row('<select data-k="' + k + '"><option value="">Nothing extra</option>' + Object.keys(ACTIONS).filter(function(a){ return !ACTIONS[a].games; }).map(function(a){ return '<option value="' + a + '"' + (v === a ? ' selected' : '') + '>' + esc(ACTIONS[a].label) + '</option>'; }).join('') + '</select>');
    if (type === 'eqp'){ var eqs = Array.prototype.map.call(document.querySelectorAll('#eq-preset-row button[data-eq-preset]'), function(b){ return [b.dataset.eqPreset, b.textContent.trim()]; });
      return row('<select data-k="' + k + '"><option value=""' + (v === '' ? ' selected' : '') + '>None</option>' + eqs.map(function(x){ return '<option value="' + esc(x[0]) + '"' + (v === x[0] ? ' selected' : '') + '>' + esc(x[1]) + '</option>'; }).join('') + '</select>'); }
    if (type === 'game') return row('<select data-k="' + k + '"><option value="">Choose a game…</option>' + gameList().map(function(g){ return '<option value="' + esc(g.id) + '"' + (v === g.id ? ' selected' : '') + '>' + esc(g.name) + '</option>'; }).join('') + '</select>');
    if (type === 'genre'){ var gm = genreMap(), names = Object.keys(gm).sort(function(a, b){ return gm[b].length - gm[a].length; });
      if (v && !gm[v]) names.unshift(v);
      return row(names.length ? '<select data-k="' + k + '"><option value="">Choose a genre…</option>' + names.map(function(n){ return '<option value="' + esc(n) + '"' + (v === n ? ' selected' : '') + '>' + esc(n) + ' (' + ((gm[n] || []).length) + ')</option>'; }).join('') + '</select>'
        : '<p class="pw-note">No genres yet. Tag your songs with smart tags (Bloopy’s stems menu) and they show up here.</p>'); }
    if (type === 'page') return row('<select data-k="' + k + '"><option value="">Choose a page…</option>' + L.pages.map(function(p){ return '<option value="' + p.id + '"' + (v === p.id ? ' selected' : '') + '>' + esc(p.name) + '</option>'; }).join('') + '</select>');
    if (type === 'playlist'){ var A = api(), pls = A ? A.playlists().filter(function(p){ return !p.libOnly; }) : [];
      return row('<select data-k="' + k + '"><option value="">Choose a playlist…</option>' + pls.map(function(p){ return '<option value="' + esc(p.id) + '"' + (v === p.id ? ' selected' : '') + '>' + esc(p.name) + '</option>'; }).join('') + '</select>'); }
    if (type === 'icon') return row('<div class="pw-icons" data-k="' + k + '"><button type="button" data-v=""' + (!v ? ' class="on"' : '') + '>Auto</button>' + ICON_CHOICES.map(function(n){ return '<button type="button" data-v="' + n + '"' + (v === n ? ' class="on"' : '') + ' aria-label="' + n + '">' + svg(n) + '</button>'; }).join('') + '</div>');
    if (type === 'font'){ var FF = window.__ppFonts;
      return row('<select data-k="' + k + '"><option value="">Same as the app</option>' + (FF ? FF.groups.map(function(g){ return '<optgroup label="' + esc(g[0]) + '">' +
        g[1].map(function(x){ return '<option value="' + x[0] + '"' + (v === x[0] ? ' selected' : '') + ' style="font-family:' + esc(FF.css(x[0])) + '">' + esc(x[1]) + '</option>'; }).join('') + '</optgroup>'; }).join('') : '') + '</select>'); }
    if (type === 'image') return row('<div class="pw-colrow"><button type="button" class="pw-mini" data-pick="' + k + '">' + (v ? 'Change picture…' : 'Choose picture…') + '</button>' + (v ? '<button type="button" class="pw-mini" data-clear="' + k + '">Remove</button>' : '') + '<input type="file" accept="image/*" hidden data-file="' + k + '"></div>');
    return '';
  }
  function rangeLabel(unit, val){ return unit === 'all' && !+val ? 'All' : unit === 'autopx' ? (+val ? val + 'px' : 'Auto') : val + (unit && unit !== 'all' ? unit : ''); }
  // Where a widget is: in the zone itself, or a page of a stack in the zone.
  function locate(id){
    var a = items();
    for (var i = 0; i < a.length; i++){
      if (a[i].id === id) return { arr: a, i: i, it: a[i], parent: null };
      var k = a[i].kids; if (k) for (var j = 0; j < k.length; j++) if (k[j].id === id) return { arr: k, i: j, it: k[j], parent: a[i] };
    }
    return null;
  }
  function stackable(type){ var d = T[type]; return d && d.kind === 'box' && !d.builtin && !d.hidden && ['stack','spacer','divider'].indexOf(type) < 0; }
  // What every widget (box) can have: shown in each box's settings under "Every widget".
  function commonFields(it, top){
    var o = it.o, f = '<div class="pw-sh-h">Every widget</div>';
    if (top) f += fieldHTML(['when', 'Show it', 'seg', [['','Always'],['playing','While something plays'],['idle','When nothing plays']]], o);
    f += fieldHTML(['bx', 'Behind it', 'seg', [['','Nothing'],['card','Card'],['glass','Glass'],['accent','Accent'],['color','Colour'],['gradient','Gradient'],['image','Picture']]], o);
    if (o.bx === 'color' || o.bx === 'gradient') f += fieldHTML(['bxc', o.bx === 'gradient' ? 'First colour' : 'Background colour', 'color', ''], o);
    if (o.bx === 'gradient') f += fieldHTML(['bxc2', 'Second colour', 'color', ''], o);
    if (o.bx === 'image'){ f += fieldHTML(['bxi', 'Picture', 'image', ''], o); f += fieldHTML(['bxd', 'Darken it', 'range', [0, 80, 5, '%', 35]], o); }
    f += fieldHTML(['rad', 'Corners', 'seg', [['','Theme'],['0','Square'],['s','Slight'],['m','Round'],['l','Rounder'],['xl','Very round']]], o);
    f += fieldHTML(['pad', 'Room inside', 'seg', [['','Normal'],['0','None'],['s','Snug'],['l','Roomy']]], o);
    f += fieldHTML(['minh', 'Height at least', 'range', [0, 400, 10, 'autopx', 0]], o);
    f += fieldHTML(['va', 'Line up', 'seg', [['top','Top'],['','Middle'],['bottom','Bottom']]], o);
    f += fieldHTML(['bd', 'Border', 'seg', [['','None'],['thin','Thin'],['thick','Thick'],['dashed','Dashed'],['accent','Accent']]], o);
    if (o.bd && o.bd !== 'accent') f += fieldHTML(['bdc', 'Border colour', 'color', ''], o);
    f += fieldHTML(['sh', 'Shadow', 'seg', [['','None'],['soft','Soft'],['deep','Deep'],['glow','Glow']]], o);
    f += fieldHTML(['op', 'See-through', 'range', [15, 100, 5, '%', 100]], o);
    f += fieldHTML(['tilt', 'Tilt', 'range', [-12, 12, 1, '°', 0]], o);
    f += fieldHTML(['an', 'Animation', 'seg', [['','None'],['fade','Fade in'],['pop','Pop in'],['float','Float'],['pulse','Pulse'],['wiggle','Wiggle']]], o);
    f += '<div class="pw-sh-h">Text</div>';
    f += fieldHTML(['font', 'Font', 'font', ''], o);
    f += fieldHTML(['tz', 'Text size', 'seg', [['xs','XS'],['s','S'],['','Normal'],['l','L'],['xl','XL'],['xxl','XXL']]], o);
    f += fieldHTML(['fg', 'Text colour', 'color', ''], o);
    f += fieldHTML(['caps', 'All capitals', 'toggle', false], o);
    f += fieldHTML(['tsh', 'Text shadow (easier to read on pictures)', 'toggle', false], o);
    f += '<div class="pw-sh-h">Tap and hold</div><p class="pw-note">Runs on the widget itself. Its own buttons and rows keep doing what they do.</p>';
    f += fieldHTML(['tap', 'Tap it to', 'tapact', ''], o);
    if (o.tap === 'page') f += fieldHTML(['tpage', 'Page to open', 'page', ''], o);
    f += fieldHTML(['hold', 'Long press to', 'tapact', ''], o);
    if (o.hold === 'page') f += fieldHTML(['hpage', 'Page to open', 'page', ''], o);
    return f;
  }
  function stackFields(it){
    var kids = it.kids || [];
    var rows = kids.map(function(k, i){ var d = T[k.type] || { name:k.type, icon:'star' };
      return '<div class="pw-tabrow">' + svg(d.icon) + '<span class="pw-arr-name">' + esc(d.name) + '</span>' +
        '<button type="button" class="pw-ic pw-v" data-kup="' + i + '" aria-label="Earlier">' + svg('up') + '</button>' +
        '<button type="button" class="pw-ic pw-v" data-kdn="' + i + '" aria-label="Later">' + svg('down') + '</button>' +
        '<button type="button" class="pw-ic" data-ked="' + esc(k.id) + '" aria-label="Settings">' + svg('gear') + '</button>' +
        '<button type="button" class="pw-ic pw-danger" data-krm="' + i + '" aria-label="Remove">' + svg('x') + '</button></div>'; }).join('');
    var zk = zoneKind(edZone || editing), add = NEW_ORDER.filter(function(t){ return stackable(t) && T[t].zones.indexOf(zk) >= 0; });
    return '<div class="pw-sh-h">In this stack</div>' + (rows ? '<div class="pw-tabs">' + rows + '</div>' : '<p class="pw-note">Nothing yet. Add widgets below; swipe sideways between them.</p>') +
      '<div class="pw-sh-h">Add to the stack</div><div class="pw-add-grid pw-add-small">' + add.map(function(t){ return '<button type="button" class="pw-add-tile" data-kadd="' + t + '">' + svg(T[t].icon) + '<span><b>' + esc(T[t].name) + '</b></span></button>'; }).join('') + '</div>';
  }
  function settingsSheet(id){
    var loc = locate(id); if (!loc) return;
    var it = loc.it, def = T[it.type], top = !loc.parent, isBox = def.kind === 'box'; it.o = it.o || {};
    var widths = isBox && top ? '<div class="pw-f"><label>Width</label><div class="pw-seg pw-wseg">' + W.map(function(w){ return '<button type="button" data-w="' + w + '"' + ((it.w || def.w) === w ? ' class="on"' : '') + '>' + W_LABEL[w] + '</button>'; }).join('') + '</div></div>' : '';
    var fields = (def.fields || []).filter(function(f){ return !(f[2] === 'page' && it.o.action !== 'page'); }).map(function(f){ return fieldHTML(f, it.o); }).join('');
    if (it.type === 'stack') fields += stackFields(it);
    if (isBox) fields += commonFields(it, top);
    else if (top) fields += '<div class="pw-sh-h">Every widget</div>' + fieldHTML(['when', 'Show it', 'seg', [['','Always'],['playing','While something plays'],['idle','When nothing plays']]], it.o);
    var nextIt = top ? loc.arr[loc.i + 1] : null, canStack = top && isBox && stackable(it.type) && nextIt && (nextIt.type === 'stack' || stackable(nextIt.type));
    openSheet((loc.parent ? 'Stack · ' : '') + def.name,
      (loc.parent ? '<div class="pw-sh-actions pw-sh-top"><button type="button" class="pw-mini" data-back="1">' + svg('up') + 'Back to the stack</button></div>' : '') +
      widths + fields +
      (def.builtin && !(def.fields || []).length && def.kind === 'block' ? '<p class="pw-note">A built-in part of the app. Move it, or remove it and put something else in its place.</p>' : '') +
      '<div class="pw-sh-actions">' +
        '<button type="button" class="pw-mini" data-mv="-1">' + svg('up') + (loc.parent ? 'Earlier' : 'Move up') + '</button>' +
        '<button type="button" class="pw-mini" data-mv="1">' + svg('down') + (loc.parent ? 'Later' : 'Move down') + '</button>' +
        (def.builtin ? '' : '<button type="button" class="pw-mini" data-dup="1">' + svg('copy') + 'Duplicate</button>') +
        (canStack ? '<button type="button" class="pw-mini" data-stk="1">' + svg('layers') + 'Stack with the next one</button>' : '') +
        (it.type === 'stack' && (it.kids || []).length ? '<button type="button" class="pw-mini" data-unstk="1">' + svg('layers') + 'Unstack</button>' : '') +
        (loc.parent ? '<button type="button" class="pw-mini" data-out="1">' + svg('layers') + 'Take out of the stack</button>' : '') +
        '<button type="button" class="pw-mini pw-danger" data-rm="1">' + svg('x') + 'Remove</button>' +
      '</div>');
    var again = function(){ settingsSheet(id); };
    var keep = function(){ var y = sheetBody.scrollTop; again(); sheetBody.scrollTop = y; };
    var set = function(k, v, rerender){
      remember(); if (v === '' || v == null) delete it.o[k]; else it.o[k] = v; save(); refreshZone();
      if (rerender) keep();
    };
    var RERENDER = ['bx', 'action', 'tap', 'hold', 'bd', 'look', 'style'];
    sheetBody.querySelectorAll('.pw-wseg button').forEach(function(b){ b.addEventListener('click', function(){
      sheetBody.querySelectorAll('.pw-wseg button').forEach(function(x){ x.classList.toggle('on', x === b); });
      remember(); it.w = b.dataset.w; save(); refreshZone(); }); });
    sheetBody.querySelectorAll('input[type=text][data-k], textarea[data-k]').forEach(function(inp){
      var tmr; inp.addEventListener('input', function(){ clearTimeout(tmr); tmr = setTimeout(function(){ set(inp.dataset.k, inp.value); }, 250); }); });
    sheetBody.querySelectorAll('input[type=date][data-k], input[type=time][data-k]').forEach(function(inp){ inp.addEventListener('change', function(){ set(inp.dataset.k, inp.value); }); });
    sheetBody.querySelectorAll('input[type=checkbox][data-k]').forEach(function(inp){ inp.addEventListener('change', function(){ set(inp.dataset.k, inp.checked); }); });
    sheetBody.querySelectorAll('.pw-seg[data-k] button, .pw-icons button').forEach(function(b){ b.addEventListener('click', function(){
      var g = b.parentNode; g.querySelectorAll('button').forEach(function(x){ x.classList.toggle('on', x === b); }); set(g.dataset.k, b.dataset.v, RERENDER.indexOf(g.dataset.k) >= 0); }); });
    sheetBody.querySelectorAll('input[type=range][data-k]').forEach(function(inp){
      var out = inp.nextElementSibling, unit = inp.dataset.unit;
      var tmr; inp.addEventListener('input', function(){ out.textContent = rangeLabel(unit, inp.value); clearTimeout(tmr); tmr = setTimeout(function(){ set(inp.dataset.k, +inp.value); }, 120); }); });
    sheetBody.querySelectorAll('input[type=color][data-k]').forEach(function(inp){
      var tmr; inp.addEventListener('input', function(){ clearTimeout(tmr); tmr = setTimeout(function(){ set(inp.dataset.k, inp.value); }, 120); }); });
    sheetBody.querySelectorAll('select[data-k]').forEach(function(s2){ s2.addEventListener('change', function(){ set(s2.dataset.k, s2.value, RERENDER.indexOf(s2.dataset.k) >= 0); }); });
    sheetBody.querySelectorAll('[data-clear]').forEach(function(b){ b.addEventListener('click', function(){ set(b.dataset.clear, '', true); }); });
    sheetBody.querySelectorAll('[data-pick]').forEach(function(b){
      var file = sheetBody.querySelector('input[data-file="' + b.dataset.pick + '"]');
      b.addEventListener('click', function(){ file.click(); });
      file.addEventListener('change', function(){ if (file.files && file.files[0]) shrinkImage(file.files[0], function(url){ set(b.dataset.pick, url, true); }); });
    });
    var on = function(sel, fn){ var e = sheetBody.querySelector(sel); if (e) e.addEventListener('click', fn); };
    sheetBody.querySelectorAll('[data-mv]').forEach(function(b){ b.addEventListener('click', function(){
      var l = locate(id); if (!l) return; var k = l.i + (+b.dataset.mv); if (k < 0 || k >= l.arr.length) return;
      change(function(){ var x = l.arr[l.i]; l.arr[l.i] = l.arr[k]; l.arr[k] = x; }); }); });
    on('[data-back]', function(){ settingsSheet(loc.parent.id); });
    on('[data-dup]', function(){ var l = locate(id); if (!l) return; var c = clone(it); c.id = uid(); if (c.kids) c.kids.forEach(function(k){ k.id = uid(); });
      change(function(){ l.arr.splice(l.i + 1, 0, c); }); if (l.parent) settingsSheet(l.parent.id); else closeSheet(); });
    on('[data-rm]', function(){ var l = locate(id); if (!l) return; change(function(){ l.arr.splice(l.i, 1); });
      if (l.parent) settingsSheet(l.parent.id); else closeSheet(); toast(def.name + ' removed. Undo brings it back.'); });
    on('[data-stk]', function(){
      var l = locate(id); if (!l) return; var nx = l.arr[l.i + 1]; if (!nx) return;
      var stack;
      change(function(){
        var me = l.arr.splice(l.i, 1)[0], kid = { id: me.id, type: me.type, o: me.o || {} };
        if (nx.type === 'stack'){ nx.kids = nx.kids || []; nx.kids.unshift(kid); stack = nx; }
        else { var n2 = l.arr.splice(l.i, 1, null)[0]; stack = { id: uid(), type: 'stack', w: me.w || 'full', o: {}, kids: [kid, { id: n2.id, type: n2.type, o: n2.o || {} }] }; l.arr[l.i] = stack; }
      });
      settingsSheet(stack.id); toast('Stacked. Swipe sideways on it to move between them.');
    });
    on('[data-unstk]', function(){
      var l = locate(id); if (!l) return;
      change(function(){ var w = it.w; l.arr.splice.apply(l.arr, [l.i, 1].concat((it.kids || []).map(function(k){ return { id: k.id, type: k.type, w: w, o: k.o || {} }; }))); });
      closeSheet();
    });
    on('[data-out]', function(){
      var l = locate(id); if (!l) return; var pi = find(l.parent.id);
      change(function(){ var k = l.arr.splice(l.i, 1)[0]; items().splice(pi + 1, 0, { id: k.id, type: k.type, w: l.parent.w, o: k.o || {} }); });
      closeSheet();
    });
    if (it.type === 'stack'){
      var kidsOf = function(){ var l = locate(id); return l ? (l.it.kids = l.it.kids || []) : []; };
      sheetBody.querySelectorAll('[data-kadd]').forEach(function(b){ b.addEventListener('click', function(){
        var k = { id: uid(), type: b.dataset.kadd, o: {} }; change(function(){ kidsOf().push(k); }); keep();
        toast(T[k.type].name + ' added to the stack.'); }); });
      sheetBody.querySelectorAll('[data-ked]').forEach(function(b){ b.addEventListener('click', function(){ settingsSheet(b.dataset.ked); }); });
      sheetBody.querySelectorAll('[data-krm]').forEach(function(b){ b.addEventListener('click', function(){ change(function(){ kidsOf().splice(+b.dataset.krm, 1); }); keep(); }); });
      [['kup', -1], ['kdn', 1]].forEach(function(p2){ sheetBody.querySelectorAll('[data-' + p2[0] + ']').forEach(function(b){ b.addEventListener('click', function(){
        var a2 = kidsOf(), i2 = +b.dataset[p2[0]], j2 = i2 + p2[1]; if (j2 < 0 || j2 >= a2.length) return;
        change(function(){ var x = a2[i2]; a2[i2] = a2[j2]; a2[j2] = x; }); keep(); }); }); });
    }
  }
  // Pictures are scaled down (longest side 1280 px, JPEG) so the layout stays small enough to save.
  function shrinkImage(file, cb){
    var r = new FileReader();
    r.onload = function(){
      var img = new Image();
      img.onload = function(){
        var s = Math.min(1, 1280 / Math.max(img.width, img.height)), c = document.createElement('canvas');
        c.width = Math.round(img.width * s); c.height = Math.round(img.height * s);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        try { cb(c.toDataURL('image/jpeg', 0.84)); } catch(e){ cb(r.result); }
      };
      img.onerror = function(){ toast('That picture could not be opened.'); };
      img.src = r.result;
    };
    r.readAsDataURL(file);
  }

  // ======================= tab bar editor =======================
  function tabsSheet(){
    var list = tabList();
    var rows = list.map(function(t, i){
      var info = tabInfo(t), isView = t.type === 'view', icon = t.type === 'view' && !t.icon ? (origLabels[t.view] || {}).svg || svg(ACTIONS[t.view].icon) : svg(info.icon);
      return '<div class="pw-tabrow" data-i="' + i + '">' + icon +
        '<input type="text" value="' + esc(t.label || '') + '" placeholder="' + esc(info.label) + '" maxlength="18" data-label="' + i + '">' +
        '<button type="button" class="pw-ic" data-up="' + i + '" aria-label="Move left">' + svg('up') + '</button>' +
        '<button type="button" class="pw-ic" data-down="' + i + '" aria-label="Move right">' + svg('down') + '</button>' +
        '<button type="button" class="pw-ic" data-icon="' + i + '" aria-label="Icon">' + svg('palette') + '</button>' +
        (t.type === 'view' && t.view === 'settings' ? '<span class="pw-ic pw-lock" title="Settings always stays">' + svg('sliders') + '</span>'
          : '<button type="button" class="pw-ic pw-danger" data-rmt="' + i + '" aria-label="Remove">' + svg('x') + '</button>') +
        '</div><div class="pw-iconpick" data-for="' + i + '" hidden></div>';
    }).join('');
    var missing = BUILTIN_TABS.filter(function(v){ return !list.some(function(t){ return t.type === 'view' && t.view === v; }); });
    openSheet('Tab bar',
      '<p class="pw-note">Top of the list is the left of the bar. Settings always stays so you can get back here.</p>' +
      '<div class="pw-tabs">' + rows + '</div>' +
      '<div class="pw-sh-h">Add a tab</div><div class="pw-add-grid pw-add-small">' +
        missing.map(function(v){ return '<button type="button" class="pw-add-tile" data-addtab="view:' + v + '">' + svg(ACTIONS[v].icon) + '<span><b>' + ACTIONS[v].label + '</b></span></button>'; }).join('') +
        '<button type="button" class="pw-add-tile" data-addtab="games">' + svg('game') + '<span><b>Games</b></span></button>' +
        '<button type="button" class="pw-add-tile" data-addtab="player">' + svg('headphones') + '<span><b>Now playing</b><small>Opens the player</small></span></button>' +
        L.pages.map(function(p){ return '<button type="button" class="pw-add-tile" data-addtab="page:' + p.id + '">' + svg('page') + '<span><b>' + esc(p.name) + '</b><small>Your page</small></span></button>'; }).join('') +
        '<button type="button" class="pw-add-tile" data-addtab="newpage">' + svg('plus') + '<span><b>New page</b><small>Make one from widgets</small></span></button>' +
        '<button type="button" class="pw-add-tile" data-addtab="action">' + svg('bolt') + '<span><b>An action</b><small>Shuffle, random, sleep…</small></span></button>' +
      '</div>' +
      '<div class="pw-sh-actions"><button type="button" class="pw-mini" data-tabreset="1">Default tab bar</button></div>');
    var commit = function(fn){ remember(); L.tabs = L.tabs || tabsDefault(); fn(L.tabs); save(); applyTabs(); tabsSheet(); };
    sheetBody.querySelectorAll('[data-label]').forEach(function(inp){ var tmr; inp.addEventListener('input', function(){ clearTimeout(tmr); tmr = setTimeout(function(){
      remember(); L.tabs = L.tabs || tabsDefault(); var t = L.tabs[+inp.dataset.label]; if (inp.value.trim()) t.label = inp.value.trim(); else delete t.label; save(); applyTabs(); }, 250); }); });
    sheetBody.querySelectorAll('[data-up]').forEach(function(b){ b.addEventListener('click', function(){ var i = +b.dataset.up; if (i > 0) commit(function(a){ var x = a[i]; a[i] = a[i-1]; a[i-1] = x; }); }); });
    sheetBody.querySelectorAll('[data-down]').forEach(function(b){ b.addEventListener('click', function(){ var i = +b.dataset.down; commit(function(a){ if (i < a.length - 1){ var x = a[i]; a[i] = a[i+1]; a[i+1] = x; } }); }); });
    sheetBody.querySelectorAll('[data-rmt]').forEach(function(b){ b.addEventListener('click', function(){ var i = +b.dataset.rmt;
      commit(function(a){ if (a.length <= 1) return; a.splice(i, 1); }); }); });
    sheetBody.querySelectorAll('[data-icon]').forEach(function(b){ b.addEventListener('click', function(){
      var i = +b.dataset.icon, box = sheetBody.querySelector('.pw-iconpick[data-for="' + i + '"]');
      box.hidden = !box.hidden;
      if (!box.innerHTML) box.innerHTML = '<div class="pw-icons"><button type="button" data-v="">Auto</button>' + ICON_CHOICES.map(function(n){ return '<button type="button" data-v="' + n + '">' + svg(n) + '</button>'; }).join('') + '</div>';
      box.querySelectorAll('button').forEach(function(x){ x.onclick = function(){ commit(function(a){ if (x.dataset.v) a[i].icon = x.dataset.v; else delete a[i].icon; }); }; });
    }); });
    sheetBody.querySelectorAll('[data-addtab]').forEach(function(b){ b.addEventListener('click', function(){
      var k = b.dataset.addtab;
      if (k === 'newpage'){ createAndEditPage(); return; }
      if (k === 'action'){ actionTabSheet(); return; }
      commit(function(a){
        var t = k.indexOf('view:') === 0 ? { id:k.slice(5), type:'view', view:k.slice(5) } : k.indexOf('page:') === 0 ? { id:uid(), type:'page', page:k.slice(5) } : { id:uid(), type:k };
        a.splice(Math.max(0, a.length - 1), 0, t);
      });
    }); });
    sheetBody.querySelector('[data-tabreset]').addEventListener('click', function(){ remember(); L.tabs = null; save(); applyTabs(); tabsSheet(); });
  }
  function actionTabSheet(){
    var acts = Object.keys(ACTIONS).filter(function(a){ return ['page','editlayout','home','playlists','library','settings','games'].indexOf(a) < 0; });
    openSheet('Tab that runs an action', '<div class="pw-add-grid pw-add-small">' + acts.map(function(a){
      return '<button type="button" class="pw-add-tile" data-act="' + a + '">' + svg(ACTIONS[a].icon) + '<span><b>' + esc(ACTIONS[a].label) + '</b></span></button>'; }).join('') + '</div>');
    sheetBody.querySelectorAll('[data-act]').forEach(function(b){ b.addEventListener('click', function(){
      remember(); L.tabs = L.tabs || tabsDefault(); L.tabs.splice(L.tabs.length - 1, 0, { id:uid(), type:'action', action:b.dataset.act }); save(); applyTabs(); tabsSheet(); }); });
  }

  // ======================= pages =======================
  function newPage(name){
    var p = { id:uid(), name: name || 'Page ' + (L.pages.length + 1) };
    L.pages.push(p); L.zones['page:' + p.id] = pageDefault(p.name); save();
    return p;
  }
  function pageOnTabs(id){ return tabList().some(function(t){ return t.type === 'page' && t.page === id; }); }
  function addPageTab(id){ L.tabs = L.tabs || tabsDefault(); L.tabs.splice(Math.max(0, L.tabs.length - 1), 0, { id:uid(), type:'page', page:id }); }
  function createAndEditPage(){
    remember(); var p = newPage(); addPageTab(p.id); save(); applyTabs(); closeSheet(); startEdit('page:' + p.id);
  }
  function pagesSheet(){
    var rows = L.pages.map(function(p){
      var n = (L.zones['page:' + p.id] || []).length, onTabs = pageOnTabs(p.id);
      return '<div class="pw-pg-row" data-pg="' + p.id + '">' +
        '<input type="text" value="' + esc(p.name) + '" maxlength="24" data-pgname="' + p.id + '" aria-label="Page name">' +
        '<div class="pw-pg-meta">' + n + ' widget' + (n === 1 ? '' : 's') + (onTabs ? ' \u00b7 on the tab bar' : ' \u00b7 not on the tab bar') + '</div>' +
        '<div class="pw-pg-btns">' +
          '<button type="button" class="pw-mini pw-pg-main" data-pgact="edit">' + svg('grid') + 'Edit</button>' +
          '<button type="button" class="pw-mini" data-pgact="open">' + svg('eye') + 'Open</button>' +
          '<button type="button" class="pw-mini" data-pgact="tab">' + svg('tabs') + (onTabs ? 'Remove tab' : 'Add tab') + '</button>' +
          '<button type="button" class="pw-mini pw-danger" data-pgact="del">' + svg('x') + 'Delete</button>' +
        '</div></div>';
    }).join('');
    openSheet('Your pages',
      (L.pages.length ? '<p class="pw-note">Pages are your own screens made of widgets. Tip: long-press a page\u2019s tab to edit it.</p><div class="pw-pg-list">' + rows + '</div>'
        : '<p class="pw-note">You have no pages yet. A page is your own screen made of widgets, opened from its own tab.</p>') +
      '<div class="pw-sh-actions"><button type="button" class="pw-mini pw-pg-main" data-pgnew="1">' + svg('plus') + 'New page</button></div>');
    sheetBody.querySelector('[data-pgnew]').addEventListener('click', createAndEditPage);
    sheetBody.querySelectorAll('[data-pgname]').forEach(function(inp){ var tmr; inp.addEventListener('input', function(){ clearTimeout(tmr); tmr = setTimeout(function(){
      var p = pageById(inp.dataset.pgname); if (!p) return; p.name = inp.value.trim() || 'Page'; save(); applyTabs(); }, 250); }); });
    sheetBody.querySelectorAll('[data-pgact]').forEach(function(b){ b.addEventListener('click', function(){
      var id = b.closest('[data-pg]').dataset.pg, act = b.dataset.pgact;
      if (act === 'edit'){ closeSheet(); startEdit('page:' + id); }
      else if (act === 'open'){ closeSheet(); openPage(id); }
      else if (act === 'tab'){ remember(); if (pageOnTabs(id)){ L.tabs = tabList().filter(function(t){ return !(t.type === 'page' && t.page === id); }); } else addPageTab(id); save(); applyTabs(); pagesSheet(); }
      else if (act === 'del'){
        if (!b.dataset.armed){ b.dataset.armed = '1'; b.lastChild.textContent = 'Sure?'; setTimeout(function(){ if (b.isConnected){ delete b.dataset.armed; b.lastChild.textContent = 'Delete'; } }, 3000); return; }
        deletePage(id); pagesSheet(); toast('Page deleted.');
      }
    }); });
  }
  function deletePage(id){
    remember();
    L.pages = L.pages.filter(function(p){ return p.id !== id; });
    delete L.zones['page:' + id];
    if (L.tabs) L.tabs = L.tabs.filter(function(t){ return !(t.type === 'page' && t.page === id); });
    if (openPageId === id) closePage();
    save(); applyTabs();
  }

  // ======================= the Layout panel in Customize =======================
  function buildPanel(){
    var panel = document.getElementById('customize-layout-panel'); if (!panel) return;
    function draw(){
      var arrRows = GROUPS.map(function(g){ var n = g.items.filter(function(it){ return (L.hide || []).indexOf(it[0]) >= 0; }).length;
        return '<div class="pw-lp-row"><div><b>' + esc(g.name) + '</b><small>' + (L.order && L.order[g.id] ? 'Your order' : 'Normal order') + (n ? ' \u00b7 ' + n + ' hidden' : '') + '</small></div><button type="button" class="settings-toggle-btn" data-lp="arr:' + g.id + '">Arrange</button></div>'; }).join('');
      panel.innerHTML =
        '<p class="pw-note">Move, resize and swap anything, or add new widgets. Changes save as you go; Undo is in the bar at the top while editing.</p>' +
        '<div class="pw-lp-row"><div><b>Home screen</b><small>' + (L.zones.home ? 'Your layout' : 'The app’s default') + '</small></div><button type="button" class="settings-toggle-btn" data-lp="edit:home">Edit</button>' + (L.zones.home ? '<button type="button" class="settings-toggle-btn" data-lp="reset:home">Reset</button>' : '') + '</div>' +
        '<div class="pw-lp-row"><div><b>Playlists page</b><small>Widgets above your playlists</small></div><button type="button" class="settings-toggle-btn" data-lp="edit:playlists">Edit</button>' + (L.zones.playlists ? '<button type="button" class="settings-toggle-btn" data-lp="reset:playlists">Reset</button>' : '') + '</div>' +
        '<div class="pw-lp-row"><div><b>Library</b><small>Widgets above your songs and videos</small></div><button type="button" class="settings-toggle-btn" data-lp="edit:library">Edit</button>' + (L.zones.library ? '<button type="button" class="settings-toggle-btn" data-lp="reset:library">Reset</button>' : '') + '</div>' +
        '<div class="pw-lp-row"><div><b>Tab bar</b><small>' + tabList().length + ' tabs</small></div><button type="button" class="settings-toggle-btn" data-lp="tabs">Edit</button></div>' +
        '<div class="pw-lp-row"><div><b>Over the video</b><small>' + (L.zones.video && L.zones.video.length ? L.zones.video.length + ' widget' + (L.zones.video.length === 1 ? '' : 's') + ' · ' : '') + 'Fades in and out with the video controls</small></div><button type="button" class="settings-toggle-btn" data-lp="edit:video">Edit</button></div>' +
        '<div class="pw-lp-row"><div><b>Player widgets</b><small>At the top of the music player and above its controls</small></div><button type="button" class="settings-toggle-btn" data-lp="edit:player">Edit</button></div>' +
        '<div class="pw-sh-h">Your pages</div>' +
        (L.pages.length ? L.pages.map(function(p){ return '<div class="pw-lp-row"><div><input type="text" class="pw-pname" data-pname="' + p.id + '" value="' + esc(p.name) + '" maxlength="24"></div>' +
          '<button type="button" class="settings-toggle-btn" data-lp="edit:page:' + p.id + '">Edit</button><button type="button" class="settings-toggle-btn ppth-danger" data-lp="del:' + p.id + '">Delete</button></div>'; }).join('')
          : '<p class="pw-note">Pages are your own screens built from widgets, opened from a tab or a button.</p>') +
        '<div class="ppth-row"><button type="button" class="settings-toggle-btn" data-lp="newpage">New page</button></div>' +
        '<div class="pw-sh-h">Arrange the app\u2019s own parts</div>' + arrRows +
        '<div class="ppth-row ppth-io"><button type="button" class="settings-toggle-btn" data-lp="export">Export layout…</button><button type="button" class="settings-toggle-btn" data-lp="import">Import…</button>' +
          '<input type="file" accept="application/json,.json" hidden data-lp-file></div>' +
        '<div class="ppth-row"><button type="button" class="settings-toggle-btn ppth-danger" data-lp="resetall">Reset every layout</button></div>';
    }
    draw();
    panel.addEventListener('click', function(e){
      var b = e.target.closest('[data-lp]'); if (!b) return;
      var k = b.dataset.lp;
      if (k.indexOf('edit:') === 0) startEdit(k.slice(5));
      else if (k.indexOf('arr:') === 0){ var ov2 = document.getElementById('customize-modal-overlay'); if (ov2) ov2.classList.remove('open'); arrangeSheet(k.slice(4)); }
      else if (k === 'reset:playlists'){ remember(); delete L.zones.playlists; save(); refreshAll(); draw(); }
      else if (k === 'reset:library'){ remember(); delete L.zones.library; save(); refreshAll(); draw(); toast('Library widgets removed.'); }
      else if (k === 'reset:home'){ remember(); delete L.zones.home; save(); refreshAll(); draw(); toast('Home is back to the default.'); }
      else if (k === 'tabs'){ var ov = document.getElementById('customize-modal-overlay'); if (ov) ov.classList.remove('open'); tabsSheet(); }
      else if (k === 'newpage'){ var p = newPage(); remember(); L.tabs = L.tabs || tabsDefault(); L.tabs.splice(L.tabs.length - 1, 0, { id:uid(), type:'page', page:p.id }); save(); applyTabs(); startEdit('page:' + p.id); }
      else if (k.indexOf('del:') === 0){
        if (!b.dataset.armed){ b.dataset.armed = '1'; b.textContent = 'Sure?'; setTimeout(function(){ if (b.isConnected){ delete b.dataset.armed; b.textContent = 'Delete'; } }, 3000); return; }
        deletePage(k.slice(4)); draw();
      }
      else if (k === 'export') exportLayout();
      else if (k === 'import') panel.querySelector('[data-lp-file]').click();
      else if (k === 'resetall'){
        if (!b.dataset.armed){ b.dataset.armed = '1'; b.textContent = 'Tap again to reset'; setTimeout(function(){ if (b.isConnected){ delete b.dataset.armed; b.textContent = 'Reset every layout'; } }, 3000); return; }
        remember(); L = blank(); save(); closePage(); refreshAll(); draw(); toast('Layouts are back to the default.');
      }
    });
    panel.addEventListener('change', function(e){
      if (e.target.dataset && e.target.dataset.lpFile != null && e.target.files[0]){ importLayout(e.target.files[0], draw); e.target.value = ''; }
    });
    panel.addEventListener('input', function(e){
      var id = e.target.dataset && e.target.dataset.pname; if (!id) return;
      var p = pageById(id); if (!p) return; p.name = e.target.value.trim() || 'Page'; save(); applyTabs();
    });
    var btn = document.getElementById('customize-btn'); if (btn) btn.addEventListener('click', draw);
  }
  function exportLayout(){
    var blob = new Blob([JSON.stringify({ kind:'press-play-layout', v:1, layout:L }, null, 1)], { type:'application/json' });
    if (window.ppSaveBlob) window.ppSaveBlob(blob, 'press-play-layout.json');
  }
  function importLayout(file, after){
    var r = new FileReader();
    r.onload = function(){
      try {
        var d = JSON.parse(r.result); if (!d || d.kind !== 'press-play-layout' || !d.layout || d.layout.v !== 1) throw new Error('not a layout');
        var x = Object.assign(blank(), d.layout);
        var cleanO = function(o){ o = o && typeof o === 'object' ? o : {}; ['img', 'bxi'].forEach(function(k){ if (o[k] && !okImg(o[k])) delete o[k]; }); return o; };
        Object.keys(x.zones).forEach(function(z){ x.zones[z] = (Array.isArray(x.zones[z]) ? x.zones[z] : []).filter(function(it){ return it && T[it.type] && !T[it.type].hidden; }).map(function(it){
          var out = { id: String(it.id || uid()), type: it.type, w: W.indexOf(it.w) >= 0 ? it.w : undefined, o: cleanO(it.o) };
          if (it.type === 'stack') out.kids = (Array.isArray(it.kids) ? it.kids : []).filter(function(k){ return k && stackable(k.type); }).map(function(k){ return { id: String(k.id || uid()), type: k.type, o: cleanO(k.o) }; });
          return out; }); });
        remember(); L = x; save(); closePage(); refreshAll(); if (after) after(); toast('Layout loaded.');
      } catch(e){ toast('That file is not a Press Play layout.'); }
    };
    r.readAsText(file);
  }

  // ---------- start ----------
  window.PPWidgets = {
    has: function(z){ return !!L.zones[z]; },
    sig: function(){ return sigN + ':' + (editing || ''); },
    renderHome: renderHome,
    renderZone: function(z){ startTick(); setTimeout(liveUpdate, 0); return renderZone(z, null); },
    onData: onData,
    edit: startEdit,
    editTabs: tabsSheet,
    openPage: openPage,
    layout: function(){ return clone(L); }
  };
  applyHide();
  // The Customize button lives in the player's \u2630 menu, which Home and Settings don't show. This card in
  // Settings > Appearance & layout is the way in from anywhere.
  function settingsEntry(){
    var pane = document.getElementById('sidebar-pane-settings');
    if (!pane || document.getElementById('pw-customize-section')) return;
    var sec = document.createElement('div'); sec.className = 'settings-section'; sec.id = 'pw-customize-section';
    sec.innerHTML = '<div class="settings-row"><div class="settings-row-text"><div class="settings-row-title">Customize</div>' +
      '<div class="settings-row-sub">Colours, fonts and style, where everything goes, widgets, your own pages and backgrounds.</div></div></div>' +
      '<div class="pw-cz-grid">' +
        '<button type="button" class="pw-cz" data-cz="theme">' + svg('palette') + '<span>Theme</span></button>' +
        '<button type="button" class="pw-cz" data-cz="layout">' + svg('grid') + '<span>Layout</span></button>' +
        '<button type="button" class="pw-cz" data-cz="home">' + svg('home') + '<span>Home</span></button>' +
        '<button type="button" class="pw-cz" data-cz="pages">' + svg('page') + '<span>Pages</span></button>' +
        '<button type="button" class="pw-cz" data-cz="tabs">' + svg('tabs') + '<span>Tab bar</span></button>' +
      '</div>';
    pane.appendChild(sec);
    sec.addEventListener('click', function(e){
      var b = e.target.closest('[data-cz]'); if (!b) return;
      var k = b.dataset.cz;
      if (k === 'home') return startEdit('home');
      if (k === 'tabs') return tabsSheet();
      if (k === 'pages') return pagesSheet();
      var btn = document.getElementById('customize-btn'); if (!btn) return;
      btn.click();
      setTimeout(function(){ var t = document.querySelector('.ppth-switch button[data-p="' + k + '"]'); if (t) t.click(); }, 0);
    });
  }
  function boot(){ settingsEntry(); applyTabs(); renderPlayer(); buildPanel(); if (L.zones.home && kit()) kit().renderHome(true); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
  // Back button leaves a page or edit mode first.
  window.addEventListener('keydown', function(e){ if (e.key === 'Escape'){ if (!sheet.hidden) closeSheet(); else if (editing) stopEdit(); } });
})();
