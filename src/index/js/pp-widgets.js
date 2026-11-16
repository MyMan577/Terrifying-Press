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
  function toast(m){ try { showToast(m); } catch(e){} }
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
    copy:'<rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>'
  };
  function svg(name){ return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + (P[name] || P.star) + '</svg>'; }
  var ICON_CHOICES = ['star','heart','music','video','headphones','play','shuffle','dice','game','moon','sun','clock','bolt','fire','sparkle','grid','list','library','folder','page','chart','history','user','palette','sliders','home'];

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
    eq:        { label:'Equalizer', icon:'sliders', run:function(){ if (!click('eq-btn')) toast('Equalizer is in Settings.'); } },
    customize: { label:'Customize', icon:'palette', run:function(){ click('customize-btn'); } },
    editlayout:{ label:'Edit this layout', icon:'grid', run:function(){ startEdit(currentZoneOnScreen()); } },
    page:      { label:'Open a page', icon:'page', run:function(o){ if (o && o.page) openPage(o.page); else toast('Pick a page in this button’s settings.'); } }
  };
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
    fields:[['text','Text','text','Press Play Media'],['size','Size','seg',SIZES]],
    render:function(o, c, ctx){
      var size = o.size ? ' pw-ts-' + o.size : '';
      return '<h1 class="ph-app-title pw-title' + size + '">' + esc(o.text || (ctx.zone === 'home' ? 'Press Play Media' : 'My page')) + (ctx.zone === 'home' ? '<span class="ed-slot"></span>' : '') + '</h1>';
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
  T.clock = { name:'Clock', icon:'clock', kind:'box', zones:['home','page','player'], w:'half', desc:'The time, and the date if you like',
    fields:[['size','Size','seg',SIZES],['date','Show the date','toggle',true],['secs','Show seconds','toggle',false],['h12','12-hour clock','toggle',false],['align','Align','seg',ALIGN],['card','On a card','toggle',true]],
    render:function(o){ return card(o, '<div class="pw-clock pw-ts-' + (o.size || 'l') + '" data-pw-live="clock" data-secs="' + (o.secs ? 1 : 0) + '" data-h12="' + (o.h12 ? 1 : 0) + '" data-date="' + (o.date === false ? 0 : 1) + '"><div class="pw-clock-t"></div><div class="pw-clock-d"></div></div>'); } };
  T.greeting = { name:'Greeting', icon:'sun', kind:'box', zones:['home','page','player'], w:'full', desc:'Good morning / evening, with your name',
    fields:[['name','Your name','text',''],['size','Size','seg',SIZES],['align','Align','seg',ALIGN],['card','On a card','toggle',false]],
    render:function(o){ return card(o, '<div class="pw-greet pw-ts-' + (o.size || 'm') + '" data-pw-live="greet" data-name="' + esc(o.name || '') + '"></div>'); } };
  T.nowplaying = { name:'Now playing', icon:'headphones', kind:'box', zones:['home','page','player'], w:'full', desc:'Cover, title and controls for what’s playing',
    fields:[['look','Look','seg',[['card','Card'],['big','Big'],['slim','Slim']]],['controls','Show controls','toggle',true],['progress','Show progress','toggle',true]],
    render:function(o){
      var look = o.look || 'card';
      return '<div class="pw-np pw-np-' + look + '" data-pw-live="np">' +
        '<button type="button" class="pw-np-art" data-pw-act="player"><img alt=""><span>' + svg('music') + '</span></button>' +
        '<div class="pw-np-text" data-pw-act="player"><div class="pw-np-t">Nothing playing</div><div class="pw-np-a">Tap shuffle to start</div>' +
          (o.progress === false ? '' : '<div class="pw-np-bar"><i></i></div>') + '</div>' +
        (o.controls === false ? '' : '<div class="pw-np-ctl"><button type="button" data-pw-act="prev" aria-label="Previous">' + svg('prev') + '</button>' +
          '<button type="button" class="pw-np-pp" data-pw-act="playpause" aria-label="Play or pause">' + svg('play') + '</button>' +
          '<button type="button" data-pw-act="next" aria-label="Next">' + svg('next') + '</button></div>') +
        '</div>';
    } };
  T.action = { name:'Button', icon:'bolt', kind:'box', zones:['home','page','player'], w:'half', desc:'Shuffle, open a page, sleep timer, games and more',
    fields:[['action','Does','action','shuffleall'],['page','Page to open','page',''],['label','Label','text',''],['icon','Icon','icon',''],
            ['look','Look','seg',[['tile','Tile'],['pill','Pill'],['icon','Icon only'],['big','Big']]],['color','Colour','color','']],
    render:function(o){
      var a = ACTIONS[o.action] || ACTIONS.shuffleall, look = o.look || 'tile';
      var label = o.label || (o.action === 'page' && o.page ? (pageById(o.page) || {}).name || a.label : a.label);
      var st = o.color ? ' style="--pw-c:' + esc(o.color) + '"' : '';
      return '<button type="button" class="pw-btn pw-btn-' + look + (o.color ? ' pw-colored' : '') + '"' + st +
        (a.games ? ' data-pp-games' : ' data-pw-act="' + esc(o.action || 'shuffleall') + '"') + (o.page ? ' data-pw-page="' + esc(o.page) + '"' : '') + ' aria-label="' + esc(label) + '">' +
        svg(o.icon || a.icon) + (look === 'icon' ? '' : '<span>' + esc(label) + '</span>') + '</button>';
    } };
  T.text = { name:'Text', icon:'text', kind:'box', zones:['home','page','player'], w:'full', desc:'A heading, a note, anything',
    fields:[['text','Text','textarea','Your text here'],['size','Size','seg',SIZES],['bold','Bold','toggle',false],['align','Align','seg',ALIGN],['color','Colour','color',''],['card','On a card','toggle',false]],
    render:function(o){
      var st = o.color ? ' style="color:' + esc(o.color) + '"' : '';
      return card(o, '<div class="pw-text pw-ts-' + (o.size || 'm') + (o.bold ? ' pw-bold' : '') + '"' + st + '>' + esc(o.text == null ? 'Your text here' : o.text).replace(/\n/g, '<br>') + '</div>');
    } };
  T.image = { name:'Picture', icon:'image', kind:'box', zones:['home','page','player'], w:'full', desc:'A photo or banner of your own',
    fields:[['img','Picture','image',''],['h','Height','range',[60, 420, 10, 'px']],['fit','Fit','seg',[['cover','Fill'],['contain','Whole picture']]]],
    render:function(o){
      var h = o.h || 160;
      if (!o.img) return '<div class="pw-img pw-img-empty" style="height:' + h + 'px">' + svg('image') + '<span>Pick a picture in this box’s settings</span></div>';
      return '<div class="pw-img" style="height:' + h + 'px"><img alt="" src="' + esc(o.img) + '" style="object-fit:' + (o.fit === 'contain' ? 'contain' : 'cover') + '"></div>';
    } };
  T.spacer = { name:'Space', icon:'space', kind:'box', zones:['home','page','player'], w:'full', desc:'Empty room between things',
    fields:[['h','Height','range',[4, 160, 4, 'px']]], render:function(o){ return '<div class="pw-space" style="height:' + (o.h || 24) + 'px"></div>'; } };
  T.divider = { name:'Line', icon:'minus', kind:'box', zones:['home','page','player'], w:'full', desc:'A thin dividing line',
    fields:[], render:function(){ return '<div class="pw-divider"></div>'; } };
  T.stats = { name:'Stats', icon:'chart', kind:'box', zones:['home','page','player'], w:'full', desc:'Your library and listening time at a glance',
    fields:[], render:function(){
      var A = api(), t = A ? A.tracks() : [], v = 0, a = 0;
      t.forEach(function(x){ if (x.stem) return; if (x.kind === 'video') v++; else a++; });
      var pls = A ? A.playlists().filter(function(p){ return !p.libOnly; }).length : 0, hrs = 0;
      try { var s = JSON.parse(localStorage.getItem('pppSaveV1')) || {}; hrs = (s.totalListenMs || 0) / 3600000; } catch(e){}
      var cell = function(n, l){ return '<div class="pw-stat"><b>' + n + '</b><span>' + l + '</span></div>'; };
      return '<div class="pw-stats">' + cell(v, 'videos') + cell(a, 'songs') + cell(pls, 'playlists') + cell(hrs < 10 ? hrs.toFixed(1) : Math.round(hrs), 'hours played') + '</div>';
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

  var BUILTIN_ORDER = ['title','games','tagline','playground','tabs','hero','chips','videos','audio','history'];
  var NEW_ORDER = ['nowplaying','action','clock','greeting','text','image','stats','recent','most','random','playlist','playlists','spacer','divider'];

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
    if (!L.zones[zone] && create) L.zones[zone] = zone === 'home' ? homeDefault() : zone === 'player' ? [] : pageDefault('My page');
    return L.zones[zone] || null;
  }

  // ---------- rendering a zone ----------
  var editing = null;   // zone being edited
  function renderZone(zone, c){
    var items = zoneItems(zone, false) || [], ctx = { zone: zone.indexOf('page:') === 0 ? 'page' : zone };
    var rows = [], row = null, fill = 0;
    items.forEach(function(it){
      var def = T[it.type]; if (!def) return;
      var html = '';
      try { html = def.render(it.o || {}, c, ctx) || ''; } catch(e){ html = '<div class="ph-empty">This widget hit a problem: ' + esc(e.message) + '</div>'; }
      if (!html && !editing) return;
      if (!html) html = '<div class="pw-hidden-note">' + esc(def.name) + ' (shows only when there is something to show)</div>';
      var w = def.kind === 'block' ? 'full' : (it.w || def.w || 'full'), size = W_SIZE[w] || 1;
      var boxHTML = '<div class="pw-box pw-w-' + w + ' pw-k-' + def.kind + (editing ? ' pw-ed' : '') + '" data-wid="' + it.id + '">' + html +
        (editing ? '<div class="pw-shield" data-pw-edit="' + it.id + '"></div><div class="pw-tools">' +
          '<span class="pw-grip" data-pw-drag="' + it.id + '">' + svg('grip') + '</span><span class="pw-tname">' + esc(def.name) + '</span>' +
          '<button type="button" data-pw-edit="' + it.id + '" aria-label="Settings">' + svg('gear') + '</button>' +
          '<button type="button" data-pw-del="' + it.id + '" aria-label="Remove">' + svg('x') + '</button></div>' : '') + '</div>';
      if (def.kind === 'block'){ rows.push({ block:true, html:[boxHTML] }); row = null; return; }
      if (!row || fill + size > 1.001){ row = { block:false, html:[] }; rows.push(row); fill = 0; }
      row.html.push(boxHTML); fill += size;
    });
    var out = rows.map(function(r){ return '<div class="pw-row' + (r.block ? ' pw-row-block' : ' pw-row-box') + '">' + r.html.join('') + '</div>'; }).join('');
    if (editing === zone) out += '<button type="button" class="pw-add-big" data-pw-add="1">' + svg('plus') + 'Add a widget</button>';
    return '<div class="pw-zone' + (editing === zone ? ' pw-zone-ed' : '') + '" data-zone="' + esc(zone) + '">' + out + '</div>';
  }

  // ---------- live widgets: clock, greeting, now playing ----------
  var tick = null;
  function pad(n){ return (n < 10 ? '0' : '') + n; }
  function liveUpdate(){
    var live = document.querySelectorAll('[data-pw-live]'); if (!live.length) return;
    var now = new Date();
    live.forEach(function(el){
      var k = el.dataset.pwLive;
      if (k === 'clock'){
        var h = now.getHours(), m = now.getMinutes(), h12 = el.dataset.h12 === '1';
        var hh = h12 ? ((h % 12) || 12) : pad(h);
        var txt = hh + ':' + pad(m) + (el.dataset.secs === '1' ? ':' + pad(now.getSeconds()) : '') + (h12 ? (h < 12 ? ' AM' : ' PM') : '');
        var tEl = el.firstChild; if (tEl.textContent !== txt) tEl.textContent = txt;
        var d = el.dataset.date === '1' ? now.toLocaleDateString(undefined, { weekday:'long', day:'numeric', month:'long' }) : '';
        if (el.lastChild.textContent !== d) el.lastChild.textContent = d;
      } else if (k === 'greet'){
        var hr = now.getHours(), g = hr < 5 ? 'Good night' : hr < 12 ? 'Good morning' : hr < 18 ? 'Good afternoon' : 'Good evening';
        var s = g + (el.dataset.name ? ', ' + el.dataset.name : '');
        if (el.textContent !== s) el.textContent = s;
      } else if (k === 'np') npUpdate(el);
    });
  }
  function npUpdate(el){
    var title = (document.getElementById('np-title') || {}).textContent || '', artist = (document.getElementById('np-artist') || {}).textContent || '';
    title = title.trim(); var has = kit() && kit().hasTrack() && title && title !== 'No track selected';
    var tEl = el.querySelector('.pw-np-t'), aEl = el.querySelector('.pw-np-a');
    var tt = has ? title : 'Nothing playing', at = has ? (artist.trim() === '-' ? '' : artist.trim()) : 'Tap shuffle to start';
    if (tEl.textContent !== tt) tEl.textContent = tt;
    if (aEl.textContent !== at) aEl.textContent = at;
    el.classList.toggle('pw-np-idle', !has);
    var pb = document.getElementById('play-btn'), playing = pb && pb.getAttribute('aria-label') === 'Pause';
    var pp = el.querySelector('.pw-np-pp');
    if (pp){
      if (!has){ pp.dataset.pwAct = 'shuffleall'; if (pp.dataset.st !== 'shuf'){ pp.innerHTML = svg('shuffle'); pp.dataset.st = 'shuf'; } }
      else { pp.dataset.pwAct = 'playpause'; var st = playing ? 'pause' : 'play'; if (pp.dataset.st !== st){ pp.innerHTML = svg(st); pp.dataset.st = st; } }
    }
    var bar = el.querySelector('.pw-np-bar i'), seek = document.getElementById('seek');
    if (bar && seek){ var mx = parseFloat(seek.max) || 100; bar.style.transform = 'scaleX(' + (has ? Math.max(0, Math.min(1, (parseFloat(seek.value) || 0) / mx)) : 0).toFixed(4) + ')'; }
    var img = el.querySelector('.pw-np-art img'), src = null;
    try { var A = api(), i = A.currentIndex(), t = i >= 0 ? A.tracks()[i] : null; if (has && t && window.__ppThumbSrc) src = window.__ppThumbSrc(t); } catch(e){}
    el.querySelector('.pw-np-art').classList.toggle('has-art', !!src);
    if (src && img.getAttribute('src') !== src) img.src = src;
  }
  function startTick(){
    if (tick) return;
    tick = setInterval(function(){ if (document.visibilityState === 'visible') liveUpdate(); }, 500);
  }

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
    pageEl.innerHTML = renderZone('page:' + openPageId, null);
    pageEl.scrollTop = top;
    if (kit()) kit().observe(pageEl);
    startTick(); liveUpdate();
  }

  // The strip of widgets in the player (audio player page), above the title.
  var playerZoneEl = document.createElement('div'); playerZoneEl.id = 'pw-player-zone';
  (function(){ var col = document.getElementById('controls-col'), np = document.getElementById('now-playing'); if (col && np) col.insertBefore(playerZoneEl, np); })();
  function renderPlayer(){
    var items = zoneItems('player', false);
    var has = !!(items && items.length) || editing === 'player';
    body.classList.toggle('pw-has-player-zone', has);
    playerZoneEl.innerHTML = has ? renderZone('player', null) : '';
    if (has){ startTick(); liveUpdate(); }
  }

  // Hiding the player's own buttons.
  var HIDEABLE = [['shuffle-btn','Shuffle'],['prev-btn','Previous'],['next-btn','Next'],['repeat-btn','Repeat'],['speed-btn','Speed'],
                  ['extras-btn','Bookmarks & lyrics'],['ab-loop-btn','A-B loop'],['cutter-btn','Trim & clip'],['sleep-btn','Sleep timer'],['vol-row','Volume slider'],['now-playing','Title & artist']];
  var hideStyle = document.createElement('style'); hideStyle.id = 'pw-hide-css'; document.head.appendChild(hideStyle);
  function applyHide(){
    hideStyle.textContent = (L.hide || []).filter(function(id){ return HIDEABLE.some(function(h){ return h[0] === id; }); })
      .map(function(id){ return 'body.player-layout #' + id; }).join(',') + ((L.hide || []).length ? '{display:none!important}' : '');
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
    runAction(act, { page: el.dataset.pwPage });
  });
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
    renderPage(); renderPlayer(); applyTabs(); applyHide();
  }
  var dataTimer = null;
  function onData(){ clearTimeout(dataTimer); dataTimer = setTimeout(function(){ if (openPageId && !editing) renderPage(); if (!editing) renderPlayer(); }, 120); }

  // ======================= edit mode =======================
  var edBar = document.createElement('div'); edBar.id = 'pw-edbar'; edBar.hidden = true;
  edBar.innerHTML = '<button type="button" class="pw-ed-done" data-ed="done">Done</button><div class="pw-ed-title"></div>' +
    '<button type="button" data-ed="undo" aria-label="Undo">' + svg('undo') + '</button><button type="button" class="pw-ed-add" data-ed="add">' + svg('plus') + 'Add</button>';
  body.appendChild(edBar);
  var sheet = document.createElement('div'); sheet.id = 'pw-sheet'; sheet.hidden = true;
  sheet.innerHTML = '<div class="pw-sheet-card" role="dialog" aria-modal="true"><div class="pw-sheet-head"><b></b><button type="button" class="pw-sheet-x" aria-label="Close">' + svg('x') + '</button></div><div class="pw-sheet-body"></div></div>';
  body.appendChild(sheet);
  var sheetBody = sheet.querySelector('.pw-sheet-body'), sheetTitle = sheet.querySelector('.pw-sheet-head b');
  function openSheet(title, html){ sheetTitle.textContent = title; sheetBody.innerHTML = html; sheet.hidden = false; sheetBody.scrollTop = 0; }
  function closeSheet(){ sheet.hidden = true; sheetBody.innerHTML = ''; }
  sheet.addEventListener('click', function(e){ if (e.target === sheet || e.target.closest('.pw-sheet-x')) closeSheet(); });

  function zoneName(z){ return z === 'home' ? 'Home' : z === 'player' ? 'Player' : ((pageById(z.slice(5)) || {}).name || 'Page'); }
  function currentZoneOnScreen(){ return openPageId ? 'page:' + openPageId : body.hasAttribute('data-pl-player') ? 'player' : 'home'; }
  function startEdit(zone){
    var K = kit();
    if (!K || !K.on()){ toast('Layout editing works in the media player layout (Settings).'); return; }
    var ov = document.getElementById('customize-modal-overlay'); if (ov) ov.classList.remove('open');
    if (zone === 'home'){ closePage(); K.setView('home'); }
    else if (zone === 'player'){
      if (!K.hasTrack()){ toast('Play something first, then edit the player.'); return; }
      closePage(); K.openPlayer();
    } else openPage(zone.slice(5));
    zoneItems(zone, true); save();
    undoStack = [];
    editing = zone; body.classList.add('pw-editing');
    edBar.hidden = false; edBar.querySelector('.pw-ed-title').textContent = 'Editing ' + zoneName(zone);
    refreshZone();
  }
  function stopEdit(){
    if (!editing) return;
    editing = null; body.classList.remove('pw-editing'); edBar.hidden = true; closeSheet();
    refreshAll(); toast('Layout saved.');
  }
  function refreshZone(){
    if (editing === 'home'){ var K = kit(); if (K) K.renderHome(true); }
    else if (editing === 'player') renderPlayer();
    else if (editing) renderPage();
  }
  function items(){ return zoneItems(editing, true); }
  function find(id){ var a = items(); for (var i = 0; i < a.length; i++) if (a[i].id === id) return i; return -1; }
  function change(fn){ remember(); fn(); save(); refreshZone(); }

  edBar.addEventListener('click', function(e){
    var b = e.target.closest('[data-ed]'); if (!b) return;
    var k = b.dataset.ed;
    if (k === 'done') stopEdit(); else if (k === 'undo'){ undo(); refreshZone(); } else if (k === 'add') addSheet();
  });
  // Taps on boxes while editing: settings / remove / add. Capturing, so the app underneath never sees them.
  document.addEventListener('click', function(e){
    if (!editing) return;
    var t = e.target; if (!t.closest) return;
    var zoneEl = t.closest('.pw-zone-ed'); if (!zoneEl) return;
    e.preventDefault(); e.stopPropagation();
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
    if (d.target && d.target !== d.id){
      change(function(){
        var a = items(), from = find(d.id); var it = a.splice(from, 1)[0];
        var to = find(d.target); a.splice(d.after ? to + 1 : to, 0, it);
      });
    } else refreshZone();
  }
  document.addEventListener('pointerup', endDrag, true);
  document.addEventListener('pointercancel', endDrag, true);

  // ---- add sheet ----
  function zoneKind(z){ return z.indexOf('page:') === 0 ? 'page' : z; }
  function addSheet(){
    var zk = zoneKind(editing), present = items().map(function(x){ return x.type; });
    var tile = function(type){ var d = T[type];
      return '<button type="button" class="pw-add-tile" data-type="' + type + '">' + svg(d.icon) + '<span><b>' + esc(d.name) + '</b>' + (d.desc ? '<small>' + esc(d.desc) + '</small>' : '') + '</span></button>'; };
    var fresh = NEW_ORDER.filter(function(t){ return T[t].zones.indexOf(zk) >= 0; });
    var ed = window.__ppEdition ? window.__ppEdition() : '';
    var back = BUILTIN_ORDER.filter(function(t){ return T[t].zones.indexOf(zk) >= 0 && present.indexOf(t) < 0 &&
      !(t === 'tagline' && !ed) && !(t === 'playground' && ed !== 'playground') && !(t === 'chips' && zk !== 'home'); });
    openSheet('Add to ' + zoneName(editing),
      '<div class="pw-add-grid">' + fresh.map(tile).join('') + '</div>' +
      (back.length ? '<div class="pw-sh-h">Put back built-in parts</div><div class="pw-add-grid">' + back.map(tile).join('') + '</div>' : ''));
    sheetBody.querySelectorAll('.pw-add-tile').forEach(function(b){
      b.addEventListener('click', function(){
        var type = b.dataset.type, it = { id:uid(), type:type, w: zk === 'player' && type !== 'action' ? 'full' : T[type].w, o:{} };
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
    if (type === 'textarea') return row('<textarea data-k="' + k + '" rows="3" maxlength="600">' + esc(v || '') + '</textarea>');
    if (type === 'toggle') return '<label class="pw-f pw-f-tog"><span>' + esc(label) + '</span><input type="checkbox" data-k="' + k + '"' + (v ? ' checked' : '') + '></label>';
    if (type === 'seg') return row('<div class="pw-seg" data-k="' + k + '">' + def.map(function(x, i){ var on = v ? v === x[0] : i === 0 && k !== 'size'; return '<button type="button" data-v="' + x[0] + '"' + (on ? ' class="on"' : '') + '>' + esc(x[1]) + '</button>'; }).join('') + '</div>');
    if (type === 'range'){ var r = def, val = v == null ? (r[3] === 'all' ? 0 : r[0] === 60 ? 160 : r[0] === 4 ? 24 : 12) : v;
      return row('<div class="pw-range"><input type="range" data-k="' + k + '" min="' + (r[3] === 'all' ? 0 : r[0]) + '" max="' + r[1] + '" step="' + r[2] + '" value="' + val + '"><output>' + (r[3] === 'all' && !+val ? 'All' : val + (r[3] && r[3] !== 'all' ? r[3] : '')) + '</output></div>'); }
    if (type === 'color') return row('<div class="pw-colrow"><input type="color" data-k="' + k + '" value="' + esc(v || '#6ee7d0') + '"' + (v ? '' : ' data-unset="1"') + '><button type="button" class="pw-mini" data-clear="' + k + '">' + (v ? 'Use theme colour' : 'Theme colour') + '</button></div>');
    if (type === 'action') return row('<select data-k="' + k + '">' + Object.keys(ACTIONS).map(function(a){ return '<option value="' + a + '"' + ((v || def) === a ? ' selected' : '') + '>' + esc(ACTIONS[a].label) + '</option>'; }).join('') + '</select>');
    if (type === 'page') return row('<select data-k="' + k + '"><option value="">Choose a page…</option>' + L.pages.map(function(p){ return '<option value="' + p.id + '"' + (v === p.id ? ' selected' : '') + '>' + esc(p.name) + '</option>'; }).join('') + '</select>');
    if (type === 'playlist'){ var A = api(), pls = A ? A.playlists().filter(function(p){ return !p.libOnly; }) : [];
      return row('<select data-k="' + k + '"><option value="">Choose a playlist…</option>' + pls.map(function(p){ return '<option value="' + esc(p.id) + '"' + (v === p.id ? ' selected' : '') + '>' + esc(p.name) + '</option>'; }).join('') + '</select>'); }
    if (type === 'icon') return row('<div class="pw-icons" data-k="' + k + '"><button type="button" data-v=""' + (!v ? ' class="on"' : '') + '>Auto</button>' + ICON_CHOICES.map(function(n){ return '<button type="button" data-v="' + n + '"' + (v === n ? ' class="on"' : '') + ' aria-label="' + n + '">' + svg(n) + '</button>'; }).join('') + '</div>');
    if (type === 'image') return row('<div class="pw-colrow"><button type="button" class="pw-mini" data-pick="' + k + '">' + (v ? 'Change picture…' : 'Choose picture…') + '</button>' + (v ? '<button type="button" class="pw-mini" data-clear="' + k + '">Remove</button>' : '') + '<input type="file" accept="image/*" hidden data-file="' + k + '"></div>');
    return '';
  }
  function settingsSheet(id){
    var i = find(id); if (i < 0) return;
    var it = items()[i], def = T[it.type]; it.o = it.o || {};
    var widths = def.kind === 'box' ? '<div class="pw-f"><label>Width</label><div class="pw-seg pw-wseg">' + W.map(function(w){ return '<button type="button" data-w="' + w + '"' + ((it.w || def.w) === w ? ' class="on"' : '') + '>' + W_LABEL[w] + '</button>'; }).join('') + '</div></div>' : '';
    var fields = (def.fields || []).filter(function(f){ return !(f[2] === 'page' && it.o.action !== 'page'); }).map(function(f){ return fieldHTML(f, it.o); }).join('');
    openSheet(def.name,
      widths + fields +
      (def.builtin && !(def.fields || []).length && def.kind === 'block' ? '<p class="pw-note">A built-in part of the app. Move it, or remove it and put something else in its place.</p>' : '') +
      '<div class="pw-sh-actions">' +
        '<button type="button" class="pw-mini" data-mv="-1">' + svg('up') + 'Move up</button>' +
        '<button type="button" class="pw-mini" data-mv="1">' + svg('down') + 'Move down</button>' +
        (def.builtin ? '' : '<button type="button" class="pw-mini" data-dup="1">' + svg('copy') + 'Duplicate</button>') +
        '<button type="button" class="pw-mini pw-danger" data-rm="1">' + svg('x') + 'Remove</button>' +
      '</div>');
    var set = function(k, v, rerender){
      remember(); if (v === '' || v == null) delete it.o[k]; else it.o[k] = v; save(); refreshZone();
      if (rerender) settingsSheet(id);
    };
    sheetBody.querySelectorAll('.pw-wseg button').forEach(function(b){ b.addEventListener('click', function(){
      sheetBody.querySelectorAll('.pw-wseg button').forEach(function(x){ x.classList.toggle('on', x === b); });
      remember(); it.w = b.dataset.w; save(); refreshZone(); }); });
    sheetBody.querySelectorAll('input[type=text][data-k], textarea[data-k]').forEach(function(inp){
      var tmr; inp.addEventListener('input', function(){ clearTimeout(tmr); tmr = setTimeout(function(){ set(inp.dataset.k, inp.value); }, 250); }); });
    sheetBody.querySelectorAll('input[type=checkbox][data-k]').forEach(function(inp){ inp.addEventListener('change', function(){ set(inp.dataset.k, inp.checked); }); });
    sheetBody.querySelectorAll('.pw-seg[data-k] button, .pw-icons button').forEach(function(b){ b.addEventListener('click', function(){
      var g = b.parentNode; g.querySelectorAll('button').forEach(function(x){ x.classList.toggle('on', x === b); }); set(g.dataset.k, b.dataset.v); }); });
    sheetBody.querySelectorAll('input[type=range][data-k]').forEach(function(inp){
      var out = inp.nextElementSibling, f = def.fields.find(function(x){ return x[0] === inp.dataset.k; }), unit = f[3][3];
      var tmr; inp.addEventListener('input', function(){ out.textContent = unit === 'all' && !+inp.value ? 'All' : inp.value + (unit && unit !== 'all' ? unit : ''); clearTimeout(tmr); tmr = setTimeout(function(){ set(inp.dataset.k, +inp.value); }, 120); }); });
    sheetBody.querySelectorAll('input[type=color][data-k]').forEach(function(inp){
      var tmr; inp.addEventListener('input', function(){ clearTimeout(tmr); tmr = setTimeout(function(){ set(inp.dataset.k, inp.value); }, 120); }); });
    sheetBody.querySelectorAll('select[data-k]').forEach(function(s){ s.addEventListener('change', function(){ set(s.dataset.k, s.value, s.dataset.k === 'action'); }); });
    sheetBody.querySelectorAll('[data-clear]').forEach(function(b){ b.addEventListener('click', function(){ set(b.dataset.clear, '', true); }); });
    sheetBody.querySelectorAll('[data-pick]').forEach(function(b){
      var file = sheetBody.querySelector('input[data-file="' + b.dataset.pick + '"]');
      b.addEventListener('click', function(){ file.click(); });
      file.addEventListener('change', function(){ if (file.files && file.files[0]) shrinkImage(file.files[0], function(url){ set(b.dataset.pick, url, true); }); });
    });
    sheetBody.querySelectorAll('[data-mv]').forEach(function(b){ b.addEventListener('click', function(){
      var a = items(), j = find(id), k = j + (+b.dataset.mv); if (k < 0 || k >= a.length) return;
      change(function(){ var x = a[j]; a[j] = a[k]; a[k] = x; }); }); });
    var dup = sheetBody.querySelector('[data-dup]');
    if (dup) dup.addEventListener('click', function(){ var c = clone(it); c.id = uid(); change(function(){ items().splice(find(id) + 1, 0, c); }); closeSheet(); });
    sheetBody.querySelector('[data-rm]').addEventListener('click', function(){ change(function(){ items().splice(find(id), 1); }); closeSheet(); toast(def.name + ' removed. Undo brings it back.'); });
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
      if (k === 'newpage'){ var p = newPage(); commit(function(a){ a.splice(a.length - 1, 0, { id:uid(), type:'page', page:p.id }); }); return; }
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
      var hideRows = HIDEABLE.map(function(h){ return '<label class="pw-f pw-f-tog"><span>' + h[1] + '</span><input type="checkbox" data-hide="' + h[0] + '"' + ((L.hide || []).indexOf(h[0]) < 0 ? ' checked' : '') + '></label>'; }).join('');
      panel.innerHTML =
        '<p class="pw-note">Move, resize and swap anything, or add new widgets. Changes save as you go; Undo is in the bar at the top while editing.</p>' +
        '<div class="pw-lp-row"><div><b>Home screen</b><small>' + (L.zones.home ? 'Your layout' : 'The app’s default') + '</small></div><button type="button" class="settings-toggle-btn" data-lp="edit:home">Edit</button>' + (L.zones.home ? '<button type="button" class="settings-toggle-btn" data-lp="reset:home">Reset</button>' : '') + '</div>' +
        '<div class="pw-lp-row"><div><b>Tab bar</b><small>' + tabList().length + ' tabs</small></div><button type="button" class="settings-toggle-btn" data-lp="tabs">Edit</button></div>' +
        '<div class="pw-lp-row"><div><b>Player widgets</b><small>A strip above the song title (music player)</small></div><button type="button" class="settings-toggle-btn" data-lp="edit:player">Edit</button></div>' +
        '<div class="pw-sh-h">Your pages</div>' +
        (L.pages.length ? L.pages.map(function(p){ return '<div class="pw-lp-row"><div><input type="text" class="pw-pname" data-pname="' + p.id + '" value="' + esc(p.name) + '" maxlength="24"></div>' +
          '<button type="button" class="settings-toggle-btn" data-lp="edit:page:' + p.id + '">Edit</button><button type="button" class="settings-toggle-btn ppth-danger" data-lp="del:' + p.id + '">Delete</button></div>'; }).join('')
          : '<p class="pw-note">Pages are your own screens built from widgets, opened from a tab or a button.</p>') +
        '<div class="ppth-row"><button type="button" class="settings-toggle-btn" data-lp="newpage">New page</button></div>' +
        '<div class="pw-sh-h">Player buttons</div>' + hideRows +
        '<div class="ppth-row ppth-io"><button type="button" class="settings-toggle-btn" data-lp="export">Export layout…</button><button type="button" class="settings-toggle-btn" data-lp="import">Import…</button>' +
          '<input type="file" accept="application/json,.json" hidden data-lp-file></div>' +
        '<div class="ppth-row"><button type="button" class="settings-toggle-btn ppth-danger" data-lp="resetall">Reset every layout</button></div>';
    }
    draw();
    panel.addEventListener('click', function(e){
      var b = e.target.closest('[data-lp]'); if (!b) return;
      var k = b.dataset.lp;
      if (k.indexOf('edit:') === 0) startEdit(k.slice(5));
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
      var h = e.target.dataset && e.target.dataset.hide;
      if (h){ remember(); L.hide = (L.hide || []).filter(function(x){ return x !== h; }); if (!e.target.checked) L.hide.push(h); save(); applyHide(); }
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
        Object.keys(x.zones).forEach(function(z){ x.zones[z] = (x.zones[z] || []).filter(function(it){ return it && T[it.type]; }).map(function(it){
          var o = it.o || {}; if (o.img && String(o.img).indexOf('data:image/') !== 0) delete o.img; return { id: String(it.id || uid()), type: it.type, w: W.indexOf(it.w) >= 0 ? it.w : undefined, o: o }; }); });
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
    onData: onData,
    edit: startEdit,
    editTabs: tabsSheet,
    openPage: openPage,
    layout: function(){ return clone(L); }
  };
  applyHide();
  function boot(){ applyTabs(); renderPlayer(); buildPanel(); if (L.zones.home && kit()) kit().renderHome(true); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
  // Back button leaves a page or edit mode first.
  window.addEventListener('keydown', function(e){ if (e.key === 'Escape'){ if (!sheet.hidden) closeSheet(); else if (editing) stopEdit(); } });
})();
