// ===================== Layout studio (Customize > Layout > Layout studio) =====================
// Changes how the app's own screens are built, not what sits on top of them: the music player, the video player,
// the Library list, the Playlists page and Settings. Each screen is made of parts (cover, title, seek bar, buttons,
// tools, volume; rows, thumbnails, text; group headers, descriptions...) and every part has its own choices.
// A preset sets several parts at once; any part can then be changed on its own.
// Nothing in the page is moved or rebuilt: each choice is a data-ls*-* attribute on <body> that the studio's CSS reads,
// so all the code that finds these elements keeps working. A choice left at its default sets no attribute, so an
// untouched screen looks exactly as it did before. Saved in localStorage 'ppStudioV1'.
(function(){
  'use strict';
  var KEY = 'ppStudioV1', FOLD_KEY = 'ppStudioFold';
  var body = document.body;
  var kit = function(){ return window.__ppHomeKit || null; };
  var api = function(){ return window.__ppApi || null; };
  function toast(m){ try { if (window.ppToast) window.ppToast(m); } catch(e){} }
  function esc(v){ return String(v == null ? '' : v).replace(/[&<>"']/g, function(c){ return { '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]; }); }
  function load(k, d){ try { var x = JSON.parse(localStorage.getItem(k) || 'null'); return x && typeof x === 'object' ? x : d; } catch(e){ return d; } }
  var S = load(KEY, {});
  function save(){ try { localStorage.setItem(KEY, JSON.stringify(S)); } catch(e){} }

  var IC = {
    music:'<path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>',
    video:'<rect x="3" y="5" width="18" height="14" rx="2"/><polygon points="10 9 16 12 10 15 10 9" fill="currentColor"/>',
    library:'<line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><circle cx="3.5" cy="6" r="1"/><circle cx="3.5" cy="12" r="1"/><circle cx="3.5" cy="18" r="1"/>',
    list:'<line x1="3" y1="6" x2="15" y2="6"/><line x1="3" y1="12" x2="15" y2="12"/><line x1="3" y1="18" x2="10" y2="18"/><polygon points="15 15 21 18.5 15 22 15 15" fill="currentColor"/>',
    sliders:'<line x1="4" y1="21" x2="4" y2="14"/><line x1="4" y1="10" x2="4" y2="3"/><line x1="12" y1="21" x2="12" y2="12"/><line x1="12" y1="8" x2="12" y2="3"/><line x1="20" y1="21" x2="20" y2="16"/><line x1="20" y1="12" x2="20" y2="3"/><line x1="1" y1="14" x2="7" y2="14"/><line x1="9" y1="8" x2="15" y2="8"/><line x1="17" y1="16" x2="23" y2="16"/>',
    eye:'<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>',
    up:'<polyline points="6 15 12 9 18 15"/>', down:'<polyline points="6 9 12 15 18 9"/>',
    x:'<line x1="6" y1="6" x2="18" y2="18"/><line x1="18" y1="6" x2="6" y2="18"/>',
    back10:'<path d="M3 12a9 9 0 1 0 3-6.7"/><polyline points="3 3 3 8 8 8"/><text x="12" y="15.5" font-size="8" font-weight="700" text-anchor="middle" fill="currentColor" stroke="none">10</text>',
    fwd10:'<path d="M21 12a9 9 0 1 1-3-6.7"/><polyline points="21 3 21 8 16 8"/><text x="12" y="15.5" font-size="8" font-weight="700" text-anchor="middle" fill="currentColor" stroke="none">10</text>',
    pin:'<line x1="12" y1="17" x2="12" y2="22"/><path d="M5 17h14v-1.8a2 2 0 0 0-1.1-1.8l-1.8-.9A2 2 0 0 1 15 10.8V6h1a2 2 0 0 0 0-4H8a2 2 0 0 0 0 4h1v4.8a2 2 0 0 1-1.1 1.8l-1.8.9A2 2 0 0 0 5 15.2z"/>',
    layers:'<polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/>'
  };
  function svg(k){ return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + (IC[k] || '') + '</svg>'; }

  // A tiny drawing of a layout for its preset tile: [x, y, w, h, radius, tone]. a = accent, t = text, d = dim, c = card.
  function sketch(r){
    var fill = { a:'var(--accent)', t:'var(--text)', d:'var(--text-dim)', c:'var(--line)' };
    return '<svg class="ls-sk" viewBox="0 0 36 60" aria-hidden="true">' + r.map(function(x){
      return '<rect x="' + x[0] + '" y="' + x[1] + '" width="' + x[2] + '" height="' + x[3] + '" rx="' + (x[4] || 0) + '" fill="' + fill[x[5] || 'd'] + '"' + (x[5] === 'd' || !x[5] ? ' opacity=".55"' : x[5] === 'c' ? ' opacity=".9"' : '') + '/>';
    }).join('') + '</svg>';
  }

  // ---------- what each screen is made of ----------
  // A part's choices: [value, label]. The first is the app's normal look and is never stored.
  var SEEK = { k:'seek', label:'Seek bar', c:[['normal','Normal'],['thin','Thin'],['thick','Thick']] };
  var TIMES = { k:'times', label:'Times', c:[['sides','Beside the bar'],['below','Under the bar'],['off','Hidden']] };
  var BTN = { k:'btn', label:'Button size', c:[['m','Medium'],['s','Small'],['l','Large']] };
  var PLAY = { k:'play', label:'Play button', c:[['plain','Plain'],['ring','Ring'],['filled','Filled circle']] };
  var SPREAD = { k:'spread', label:'Spacing', c:[['spread','Spread out'],['center','Grouped in the middle']] };
  var SURF = [
    { id:'aud', attr:'lsa', name:'Music', title:'Music player', icon:'music',
      presets:[
        { id:'compact', name:'Compact', v:{}, sk:[[3,3,18,2,1,'t'],[6,12,24,24,12],[3,42,30,2,1,'a'],[8,47,20,4,2,'t'],[3,54,30,2,1]] },
        { id:'classic', name:'Classic', v:{ title:'flow', talign:'center', tsize:'l', play:'filled', btn:'l', tools:'center', vol:'row' },
          sk:[[5,6,26,26,13],[8,35,20,3,1,'t'],[11,39,14,2,1],[3,44,30,2,1,'a'],[13,48,10,6,3,'a'],[6,56,24,2,1]] },
        { id:'bigcover', name:'Big cover', v:{ cover:'xl', shape:'square', title:'flow', tsize:'xl', play:'filled', seek:'thick' },
          sk:[[0,2,36,34,0],[3,39,22,3,1,'t'],[3,43,14,2,1],[3,47,30,3,1,'a'],[14,51,8,6,3,'a']] },
        { id:'card', name:'Card', v:{ cover:'m', shape:'round', title:'flow', talign:'center', play:'filled', panel:'card', times:'below' },
          sk:[[8,6,20,20,4],[2,32,32,26,4,'c'],[8,35,20,3,1,'t'],[5,41,26,2,1,'a'],[14,46,8,6,3,'a'],[6,54,24,2,1]] },
        { id:'glass', name:'Glass', v:{ shape:'circle', title:'flow', talign:'center', play:'ring', panel:'glass', spread:'center' },
          sk:[[6,4,24,24,12],[2,32,32,26,6,'c'],[8,35,20,3,1,'t'],[5,41,26,2,1,'a'],[14,46,8,6,4,'t'],[6,54,24,2,1]] },
        { id:'minimal', name:'Minimal', v:{ cover:'m', shape:'round', title:'flow', talign:'center', tsize:'l', tools:'off', vol:'off', btn:'l', play:'ring', spread:'center', seek:'thin', times:'below' },
          sk:[[9,8,18,18,4],[7,32,22,3,1,'t'],[11,36,14,2,1],[3,43,30,1,1,'a'],[13,48,10,8,4,'t']] }
      ],
      parts:[
        { name:'Title & artist', opts:[
          { k:'title', label:'Where', c:[['bar','In the top bar'],['flow','Above the controls'],['hide','Hidden']] },
          { k:'talign', label:'Line up', c:[['left','Left'],['center','Centre']], when:{ title:'flow' } },
          { k:'tsize', label:'Size', c:[['m','Medium'],['s','Small'],['l','Large'],['xl','Huge']], when:{ title:'flow' } }] },
        { name:'Cover', opts:[
          { k:'cover', label:'Size', c:[['l','Large'],['s','Small'],['m','Medium'],['xl','Edge to edge'],['off','Hidden']] },
          { k:'shape', label:'Shape', c:[['disc','Disc'],['circle','Full circle'],['round','Rounded'],['square','Square'],['squircle','Squircle'],['leaf','Leaf'],['arch','Arch'],['hexagon','Hexagon']] }] },
        { name:'Seek bar', opts:[SEEK, TIMES] },
        { name:'Main buttons', opts:[BTN, PLAY, SPREAD] },
        { name:'Tools & volume', opts:[
          { k:'tools', label:'Tools row', c:[['show','Beside the volume'],['center','Own row'],['off','Hidden']] },
          { k:'vol', label:'Volume', c:[['inline','Beside the tools'],['row','Own row'],['off','Hidden']] }] },
        { name:'Controls panel', opts:[
          { k:'panel', label:'Behind the controls', c:[['none','Nothing'],['fade','Dark fade'],['card','Card'],['glass','Frosted glass']] }] }
      ],
      order:'rows' },
    { id:'vid', attr:'lsv', name:'Video', title:'Video player', icon:'video',
      presets:[
        { id:'standard', name:'Standard', v:{}, sk:[[0,0,36,60,0,'c'],[3,3,16,2,1,'t'],[8,38,20,3,1],[3,44,30,2,1,'a'],[8,49,20,4,2,'t'],[3,55,22,2,1]] },
        { id:'cinema', name:'Cinema', v:{ bg:'none', title:'off', vtools:'off', tools:'off', vol:'off', seek:'thin', spread:'center' },
          sk:[[0,0,36,60,0,'c'],[3,48,30,1,1,'a'],[13,52,10,4,2,'t']] },
        { id:'bar', name:'Solid bar', v:{ bg:'bar', play:'filled', seek:'thick', vtools:'top' },
          sk:[[0,0,36,60,0,'c'],[20,4,14,3,1,'t'],[0,42,36,18,0,'d'],[3,45,30,3,1,'a'],[14,50,8,6,3,'a']] },
        { id:'glass', name:'Glass', v:{ bg:'glass', play:'ring', spread:'center', times:'below' },
          sk:[[0,0,36,60,0,'c'],[2,40,32,18,5,'t'],[5,44,26,2,1,'a'],[14,49,8,6,3,'a']] },
        { id:'big', name:'Big buttons', v:{ btn:'l', play:'filled', spread:'center', tools:'center', vol:'off' },
          sk:[[0,0,36,60,0,'c'],[3,40,30,2,1,'a'],[5,45,6,6,3,'t'],[14,44,8,8,4,'a'],[25,45,6,6,3,'t'],[6,55,24,2,1]] }
      ],
      parts:[
        { name:'Behind the controls', opts:[
          { k:'bg', label:'Background', c:[['fade','Soft fade'],['bar','Solid bar'],['glass','Frosted card'],['none','Nothing']] }] },
        { name:'Top bar', opts:[
          { k:'title', label:'Title', c:[['bar','Shown'],['off','Hidden']] },
          { k:'vtools', label:'Video tools', c:[['above','Above the seek bar'],['top','Under the top bar'],['off','Hidden']] }] },
        { name:'Seek bar', opts:[SEEK, TIMES] },
        { name:'Main buttons', opts:[BTN, PLAY, SPREAD] },
        { name:'Tools & volume', opts:[
          { k:'tools', label:'Tools row', c:[['show','Beside the volume'],['center','Own row'],['off','Hidden']] },
          { k:'vol', label:'Volume', c:[['inline','Shown'],['off','Hidden']] }] }
      ],
      order:'video' },
    { id:'lib', attr:'lsl', name:'Library', title:'Library list', icon:'library',
      presets:[
        { id:'detailed', name:'Detailed', v:{}, sk:[[2,4,8,8,2],[12,5,18,2,1,'t'],[12,9,12,2,1],[2,16,8,8,2],[12,17,18,2,1,'t'],[12,21,12,2,1],[2,28,8,8,2],[12,29,18,2,1,'t'],[12,33,12,2,1]] },
        { id:'compact', name:'Compact', v:{ view:'compact', thumb:'s', sub:'artist', num:'off', div:'lines' },
          sk:[[2,4,5,5,1],[9,5,20,2,1,'t'],[2,11,32,.6],[2,13,5,5,1],[9,14,20,2,1,'t'],[2,20,32,.6],[2,22,5,5,1],[9,23,20,2,1,'t'],[2,29,32,.6],[2,31,5,5,1],[9,32,20,2,1,'t']] },
        { id:'cards', name:'Cards', v:{ view:'cards', thumb:'l', num:'off', hl:'bar' },
          sk:[[1,3,34,15,3,'c'],[3,5,11,11,2],[16,7,16,2,1,'t'],[16,11,10,2,1],[1,21,34,15,3,'c'],[3,23,11,11,2],[16,25,16,2,1,'t'],[16,29,10,2,1]] },
        { id:'grid', name:'Grid', v:{ view:'grid2', sub:'artist' },
          sk:[[2,3,15,15,3],[19,3,15,15,3],[2,20,12,2,1,'t'],[19,20,12,2,1,'t'],[2,26,15,15,3],[19,26,15,15,3],[2,43,12,2,1,'t'],[19,43,12,2,1,'t']] },
        { id:'wall', name:'Wall', v:{ view:'grid3', sub:'off', top:'slim', tshape:'square' },
          sk:[[2,3,10,10,1],[13,3,10,10,1],[24,3,10,10,1],[2,16,10,10,1],[13,16,10,10,1],[24,16,10,10,1],[2,29,10,10,1],[13,29,10,10,1],[24,29,10,10,1]] },
        { id:'clean', name:'Clean', v:{ tshape:'circle', num:'off', acts:'off', top:'slim', hl:'bold' },
          sk:[[2,4,8,8,4],[12,6,18,2,1,'t'],[2,16,8,8,4,'a'],[12,18,18,2,1,'a'],[2,28,8,8,4],[12,30,18,2,1,'t']] }
      ],
      parts:[
        { name:'Rows', opts:[
          { k:'view', label:'Look', c:[['rows','Rows'],['compact','Compact rows'],['cards','Cards'],['grid2','Grid, 2 across'],['grid3','Grid, 3 across']] },
          { k:'div', label:'Lines between', c:[['off','None'],['lines','Thin lines']] },
          { k:'hl', label:'What is playing', c:[['soft','Soft highlight'],['bar','Accent bar'],['bold','Bold accent']] }] },
        { name:'Thumbnail', opts:[
          { k:'thumb', label:'Size', c:[['m','Medium'],['s','Small'],['l','Large'],['off','Hidden']] },
          { k:'tshape', label:'Shape', c:[['round','Rounded'],['square','Square'],['circle','Circle'],['squircle','Squircle'],['leaf','Leaf'],['arch','Arch'],['hexagon','Hexagon']] }] },
        { name:'Text & buttons', opts:[
          { k:'sub', label:'Under the title', c:[['all','Artist and details'],['artist','Artist only'],['off','Nothing']] },
          { k:'num', label:'Track numbers', c:[['show','Shown'],['off','Hidden']] },
          { k:'acts', label:'Edit buttons on rows', c:[['show','Shown'],['off','Hidden']] }] },
        { name:'Top of the list', opts:[
          { k:'top', label:'Extras', c:[['full','Everything'],['slim','Just Add, Sort and Search']] }] }
      ] },
    { id:'pls', attr:'lsp', name:'Playlists', title:'Playlists page', icon:'list',
      presets:[
        { id:'list', name:'List', v:{}, sk:[[2,4,14,8,2],[18,6,14,2,1,'t'],[18,9,9,1.5,1],[2,16,14,8,2],[18,18,14,2,1,'t'],[18,21,9,1.5,1],[2,28,14,8,2],[18,30,14,2,1,'t'],[18,33,9,1.5,1]] },
        { id:'compact', name:'Compact', v:{ view:'compact', cover:'s', counts:'off' },
          sk:[[2,4,8,5,1],[12,5,18,2,1,'t'],[2,12,8,5,1],[12,13,18,2,1,'t'],[2,20,8,5,1],[12,21,18,2,1,'t'],[2,28,8,5,1],[12,29,18,2,1,'t']] },
        { id:'cards', name:'Cards', v:{ view:'cards', cover:'l' },
          sk:[[1,3,34,16,3,'c'],[3,5,15,12,2],[20,8,12,2,1,'t'],[1,22,34,16,3,'c'],[3,24,15,12,2],[20,27,12,2,1,'t']] },
        { id:'grid', name:'Grid', v:{ view:'grid2', shape:'square', head:'hero' },
          sk:[[2,3,15,15,3],[19,3,15,15,3],[2,20,12,2,1,'t'],[19,20,12,2,1,'t'],[2,26,15,15,3],[19,26,15,15,3],[2,43,12,2,1,'t'],[19,43,12,2,1,'t']] },
        { id:'shelf', name:'Shelf', v:{ view:'grid3', shape:'square', counts:'off', dur:'off', head:'hero', trk:'compact' },
          sk:[[2,3,10,10,2],[13,3,10,10,2],[24,3,10,10,2],[2,15,8,1.5,1,'t'],[13,15,8,1.5,1,'t'],[24,15,8,1.5,1,'t'],[2,20,10,10,2],[13,20,10,10,2],[24,20,10,10,2]] }
      ],
      parts:[
        { name:'Your playlists', opts:[
          { k:'view', label:'Look', c:[['list','List'],['compact','Compact list'],['cards','Cards'],['grid2','Grid, 2 across'],['grid3','Grid, 3 across']] },
          { k:'cover', label:'Cover size', c:[['m','Medium'],['s','Small'],['l','Large']], when:{ view:['list','compact','cards'] } },
          { k:'counts', label:'Video and audio counts', c:[['show','Shown'],['off','Hidden']] },
          { k:'dur', label:'Total length', c:[['show','Shown'],['off','Hidden']] }] },
        { name:'Playlist covers', opts:[
          { k:'pshape', label:'Shape', c:[['round','Rounded'],['square','Square'],['circle','Circle'],['squircle','Squircle'],['leaf','Leaf'],['arch','Arch'],['hexagon','Hexagon']] },
          { k:'shape', label:'Proportions', c:[['wide','Wide'],['square','Square']] }] },
        { name:'An open playlist', opts:[
          { k:'head', label:'Header', c:[['side','Cover beside the name'],['hero','Big cover on top']] },
          { k:'trk', label:'Tracks', c:[['normal','Normal'],['compact','Compact'],['big','Big thumbnails']] }] },
        { name:'Song and video thumbnails', opts:[
          { k:'cshape', label:'Shape (Home and playlists)', c:[['round','Rounded'],['square','Square'],['circle','Circle'],['squircle','Squircle'],['leaf','Leaf'],['arch','Arch'],['hexagon','Hexagon']] }] }
      ] },
    { id:'set', attr:'lss', name:'Settings', title:'Settings', icon:'sliders',
      presets:[
        { id:'standard', name:'Standard', v:{}, sk:[[2,3,12,2,1,'t'],[1,7,34,22,3,'c'],[4,10,16,2,1,'t'],[4,14,22,1.5,1],[4,20,16,2,1,'t'],[4,24,22,1.5,1],[2,33,12,2,1,'t'],[1,37,34,18,3,'c']] },
        { id:'compact', name:'Compact', v:{ dens:'compact', desc:'off' },
          sk:[[2,3,12,2,1,'t'],[1,6,34,20,3,'c'],[4,8,16,2,1,'t'],[4,13,16,2,1,'t'],[4,18,16,2,1,'t'],[4,23,16,1.5,1,'t'],[2,30,12,2,1,'t'],[1,33,34,15,3,'c']] },
        { id:'flat', name:'Flat', v:{ style:'flat', heads:'accent' },
          sk:[[2,3,12,2,1,'a'],[2,8,16,2,1,'t'],[2,12,24,1.5,1],[2,16,32,.6],[2,19,16,2,1,'t'],[2,23,24,1.5,1],[2,30,12,2,1,'a'],[2,35,16,2,1,'t']] },
        { id:'tiles', name:'Tiles', v:{ style:'float', heads:'big' },
          sk:[[2,2,16,3,1,'t'],[1,7,34,10,3,'c'],[1,19,34,10,3,'c'],[1,31,34,10,3,'c'],[1,43,34,10,3,'c']] },
        { id:'tidy', name:'Folded', v:{ fold:'on', jump:'on', heads:'big', desc:'off' },
          sk:[[2,3,8,3,1.5,'a'],[11,3,8,3,1.5],[20,3,8,3,1.5],[2,10,20,3,1,'t'],[2,17,20,3,1,'t'],[2,24,20,3,1,'t'],[2,31,20,3,1,'t']] }
      ],
      parts:[
        { name:'Groups', opts:[
          { k:'style', label:'Look', c:[['cards','One card per group'],['float','A card per section'],['flat','Flat, no cards']] },
          { k:'heads', label:'Group headings', c:[['normal','Normal'],['big','Big'],['accent','Small accent caps']] },
          { k:'fold', label:'Fold groups', c:[['off','Always open'],['on','Tap a heading to fold']] },
          { k:'jump', label:'Jump bar', c:[['off','None'],['on','Group buttons on top']] }] },
        { name:'Rows', opts:[
          { k:'dens', label:'Room', c:[['normal','Normal'],['compact','Tight'],['roomy','Roomy']] },
          { k:'desc', label:'Descriptions', c:[['short','Two lines, More for the rest'],['full','In full'],['off','Hidden']] }] }
      ] }
  ];
  var byId = {}; SURF.forEach(function(s){ byId[s.id] = s; s.opt = {}; s.parts.forEach(function(p){ p.opts.forEach(function(o){ s.opt[o.k] = o; }); }); });

  function vals(s){ var v = S[s.id]; return v && typeof v === 'object' ? v : {}; }
  function val(s, k){ var o = s.opt[k], v = vals(s)[k]; return o.c.some(function(c){ return c[0] === v; }) ? v : o.c[0][0]; }
  function setVal(s, k, v){
    var o = s.opt[k]; if (!o) return;
    var cur = Object.assign({}, vals(s));
    if (v === o.c[0][0] || !o.c.some(function(c){ return c[0] === v; })) delete cur[k]; else cur[k] = v;
    if (Object.keys(cur).length) S[s.id] = cur; else delete S[s.id];
  }
  function presetOf(s){
    var cur = vals(s);
    var p = s.presets.find(function(p){
      var keys = Object.keys(s.opt);
      return keys.every(function(k){ return (p.v[k] || s.opt[k].c[0][0]) === val(s, k); });
    });
    return p ? p.id : (Object.keys(cur).length ? 'custom' : s.presets[0].id);
  }

  // ---------- applying ----------
  function apply(){
    SURF.forEach(function(s){
      var any = false;
      Object.keys(s.opt).forEach(function(k){
        var v = val(s, k), name = 'data-' + s.attr + '-' + k;
        if (v !== s.opt[k].c[0][0]){ any = true; if (body.getAttribute(name) !== v) body.setAttribute(name, v); }
        else body.removeAttribute(name);
      });
      if (any) body.setAttribute('data-' + s.attr, ''); else body.removeAttribute('data-' + s.attr);
    });
    settingsDom();
    // the controls change height: let the player re-measure, and anything sized to the window re-fit
    requestAnimationFrame(function(){ window.dispatchEvent(new Event('resize')); });
  }

  // ---------- Settings: folding groups and the jump bar ----------
  var folded = load(FOLD_KEY, {});
  function sgTitle(g){ var t = g.querySelector(':scope > .pp-sg-title'); return t ? t.textContent.trim() : ''; }
  function settingsDom(){
    var root = document.getElementById('pp-sg-root'); if (!root) return;
    var s = byId.set, fold = val(s, 'fold') === 'on', jump = val(s, 'jump') === 'on';
    var groups = Array.prototype.slice.call(root.querySelectorAll(':scope > .pp-sg'));
    groups.forEach(function(g){ g.classList.toggle('ls-folded', fold && !!folded[sgTitle(g)]); });
    var bar = document.getElementById('ls-jump');
    if (!jump){ if (bar) bar.remove(); return; }
    if (!bar){ bar = document.createElement('div'); bar.id = 'ls-jump'; bar.setAttribute('role', 'navigation'); bar.setAttribute('aria-label', 'Settings groups'); }
    if (bar.nextSibling !== root) root.parentNode.insertBefore(bar, root);
    var html = groups.filter(function(g){ return !g.hidden && getComputedStyle(g).display !== 'none'; }).map(function(g){
      var i = groups.indexOf(g); return '<button type="button" data-ls-jump="' + i + '">' + esc(sgTitle(g)) + '</button>'; }).join('');
    if (bar.innerHTML !== html) bar.innerHTML = html;
  }
  document.addEventListener('click', function(e){
    var j = e.target.closest && e.target.closest('[data-ls-jump]');
    if (j){
      var root = document.getElementById('pp-sg-root'), g = root && root.querySelectorAll(':scope > .pp-sg')[+j.dataset.lsJump];
      if (g){ if (g.classList.contains('ls-folded')){ delete folded[sgTitle(g)]; saveFold(); g.classList.remove('ls-folded'); } g.scrollIntoView({ block:'start', behavior:'smooth' }); }
      return;
    }
    var t = e.target.closest && e.target.closest('#pp-sg-root > .pp-sg > .pp-sg-title');
    if (t && val(byId.set, 'fold') === 'on'){
      var grp = t.parentNode, name = sgTitle(grp), now = !grp.classList.contains('ls-folded');
      grp.classList.toggle('ls-folded', now);
      if (now) folded[name] = 1; else delete folded[name];
      saveFold();
    }
  });
  function saveFold(){ try { localStorage.setItem(FOLD_KEY, JSON.stringify(folded)); } catch(e){} }

  // ======================= button spots =======================
  // Fixed places on the players where the user chooses the button: two in the top bar, the two outer places in the
  // main row (Shuffle's and Repeat's), two on the cover's corners (music) and three down the right edge (video).
  // A spot's button is a stand-in: it shows the real button's icon and state and presses the real button, or runs one
  // of the widget actions (skip 10 s, mute, sleep timer...). Saved as S.spots = { aud:{spot:value}, vid:{...} }.
  var SPOTS = {
    aud: [['tb1','Top bar, left of fullscreen'],['tb2','Top bar, further left'],['tl','Main row, far left (Shuffle)', 'shuffle-btn'],['tr','Main row, far right (Repeat)', 'repeat-btn'],
          ['cl','Cover, bottom left'],['cr','Cover, bottom right']],
    vid: [['tb1','Top bar, left of the menu'],['tb2','Top bar, further left'],['tl','Main row, far left (Shuffle)', 'shuffle-btn'],['tr','Main row, far right (Repeat)', 'repeat-btn'],
          ['r1','Right edge, top'],['r2','Right edge, middle'],['r3','Right edge, bottom']]
  };
  var EL_CHOICES = [['shuffle-btn','Shuffle'],['repeat-btn','Repeat'],['prev-btn','Previous'],['next-btn','Next'],['extras-btn','Bookmarks, chapters & lyrics'],
    ['cutter-btn','Trim & clip'],['eq-btn','Equalizer'],['menu-btn','Player menu'],['immersive-btn','Fullscreen (music)'],['fullscreen-btn','Fullscreen (video)'],
    ['snap-btn','Snapshot (video)'],['rotate-btn','Rotate (video)'],['to-audio-btn','Switch to audio (video)']];
  function spotVals(k){ var x = S.spots && S.spots[k]; return x && typeof x === 'object' ? x : {}; }
  function spotChoices(){
    var W = window.PPWidgets, acts = W && W.actions ? W.actions() : [];
    return { els: EL_CHOICES.filter(function(x){ return document.getElementById(x[0]); }), acts: acts };
  }
  function spotLabel(v){
    if (!v) return ''; var c = spotChoices();
    if (v.indexOf('el:') === 0){ var e = c.els.find(function(x){ return 'el:' + x[0] === v; }); return e ? e[1] : ''; }
    var a = c.acts.find(function(x){ return 'act:' + x.id === v; }); return a ? a.label : '';
  }
  var spotEls = [], spotObs = null, spotHosts = {};
  function spotHost(name, parent, cls){
    var h = spotHosts[name];
    if (!h){ h = spotHosts[name] = document.createElement('div'); h.className = 'ls-spots ' + cls; }
    if (parent && h.parentNode !== parent) parent.appendChild(h);
    return h;
  }
  function spotBtn(kind, spot, v, extra){
    var b = document.createElement('button'); b.type = 'button'; b.className = 'ls-spot' + (extra || ''); b.dataset.spotK = kind; b.dataset.spot = spot; b.dataset.spotV = v;
    b.setAttribute('aria-label', spotLabel(v) || 'Button');
    return b;
  }
  function studioOn(k){ return typeof open !== 'undefined' && open && cur === k; }
  function spotSync(b){
    if (b.classList.contains('ls-spot-empty')) return;
    var v = b.dataset.spotV, base = b.dataset.base || b.className;
    if (!b.dataset.base) b.dataset.base = base;
    if (v.indexOf('el:') === 0){
      var o = document.getElementById(v.slice(3)); if (!o){ b.hidden = true; return; }
      // the icon only: some buttons carry a text label the player hides (EQ, Marks)
      var ic = o.querySelector('svg'), h = ic ? ic.outerHTML : esc((o.textContent || '').trim().slice(0, 4));
      if (b.dataset.h !== h){ b.innerHTML = h; b.dataset.h = h; }
      ['active','toggled','on','is-on'].forEach(function(c){ b.classList.toggle(c, o.classList.contains(c)); });
      var pr = o.getAttribute('aria-pressed'); if (pr != null) b.setAttribute('aria-pressed', pr); else b.removeAttribute('aria-pressed');
      b.title = o.title || spotLabel(v);
    } else if (!b.firstChild){
      var W = window.PPWidgets, a = (spotChoices().acts.find(function(x){ return 'act:' + x.id === v; }) || {});
      b.innerHTML = IC[a.id] ? svg(a.id) : W && W.icon ? W.icon(a.icon || 'star') : ''; b.title = a.label || '';
    }
  }
  function applySpots(){
    spotEls.forEach(function(b){ b.remove(); }); spotEls = [];
    var transport = document.getElementById('transport'), viz = document.getElementById('viz-wrap');
    var tb = spotHost('tb', body, 'ls-tb'), rail = spotHost('rail', body, 'ls-rail'), cov = viz ? spotHost('cov', viz, 'ls-cov') : null;
    var hide = [], n = { aud:0, vid:0 };
    ['aud','vid'].forEach(function(k){
      var vals = spotVals(k);
      SPOTS[k].forEach(function(sp){
        var v = vals[sp[0]] || '';
        // while the studio edits this player, an empty spot shows as a dashed + to tap and fill
        var empty = studioOn(k) && (sp[2] ? v === 'none' : (!v || v === 'none' || !spotLabel(v)));
        if (empty) v = '';
        else if (sp[2] && v === 'none'){ hide.push(k + '-' + sp[0]); return; }
        else if (!v || v === 'none' || !spotLabel(v)) return;
        var b;
        if (sp[0] === 'tl' || sp[0] === 'tr'){
          var orig = document.getElementById(sp[2]); if (!transport || !orig) return;
          b = spotBtn(k, sp[0], v, ' ctrl-btn');
          if (empty) hide.push(k + '-' + sp[0]);
          // takes the place (and the Arrange order) of the button it stands in for
          b.style.order = getComputedStyle(orig).order;
          transport.insertBefore(b, sp[0] === 'tl' ? orig : orig.nextSibling);
          hide.push(k + '-' + sp[0]);
        } else if (sp[0].indexOf('tb') === 0){ b = spotBtn(k, sp[0], v, ''); tb.appendChild(b); n[k]++; }
        else if (sp[0].charAt(0) === 'r'){ b = spotBtn(k, sp[0], v, ''); rail.appendChild(b); }
        else if (cov){ b = spotBtn(k, sp[0], v, ' ls-cov-' + sp[0]); cov.appendChild(b); }
        if (b && empty){ b.classList.add('ls-spot-empty'); b.innerHTML = svg('plus'); b.setAttribute('aria-label', 'Empty spot: ' + sp[1]); spotEls.push(b); }
        else if (b){ spotSync(b); spotEls.push(b); }
      });
    });
    // the top bar's spots are listed right to left: tb1 sits next to the app's own buttons
    Array.prototype.slice.call(tb.children).sort(function(a, b){ return a.dataset.spot < b.dataset.spot ? 1 : -1; }).forEach(function(x){ tb.appendChild(x); });
    body.setAttribute('data-ls-hidebtn', hide.join(' '));
    body.style.setProperty('--ls-tb-aud', n.aud); body.style.setProperty('--ls-tb-vid', n.vid);
    // follow the real buttons' icons and states (Repeat one / all, Shuffle on / off ...)
    if (spotObs) spotObs.disconnect();
    if (typeof MutationObserver === 'function'){
      spotObs = new MutationObserver(function(){ spotEls.forEach(spotSync); });
      var seen = {};
      spotEls.forEach(function(b){ var v = b.dataset.spotV; if (v.indexOf('el:') !== 0 || seen[v]) return; seen[v] = 1;
        var o = document.getElementById(v.slice(3)); if (o) spotObs.observe(o, { attributes:true, childList:true, subtree:true, characterData:true }); });
    }
  }
  document.addEventListener('click', function(e){
    var b = e.target.closest && e.target.closest('.ls-spot'); if (!b || open) return;   // in the studio a tap picks the spot instead
    e.preventDefault(); e.stopPropagation();
    if (window.__ppTap && body.classList.contains('pl-video')) window.__ppTap();
    var v = b.dataset.spotV;
    if (v.indexOf('el:') === 0){ var o = document.getElementById(v.slice(3)); if (o) o.click(); }
    else if (window.PPWidgets && window.PPWidgets.run) window.PPWidgets.run(v.slice(4));
  }, true);

  // ======================= Settings sections: order, group, shown =======================
  var SA_KEY = 'ppSettingsArrV1';
  function sArr(){ var a = load(SA_KEY, {}); a.place = a.place || {}; a.order = a.order || {}; a.hide = a.hide || []; return a; }
  function sArrSave(a){ try { localStorage.setItem(SA_KEY, JSON.stringify(a)); } catch(e){} if (window.__ppSettings) window.__ppSettings.run(); }
  function secName(sec){
    var l = sec.querySelector('.settings-section-label'), t = sec.querySelector('.settings-row-title');
    var x = (l && l.textContent.trim()) || (t && t.textContent.replace(/\s+/g, ' ').trim()) || 'Section';
    return x.length > 46 ? x.slice(0, 44) + '…' : x;
  }
  function secLists(){
    var P = window.__ppSettings; if (!P) return [];
    var out = P.groups.map(function(g){ var c = P.card(g[0]);
      return { id:g[0], name:g[1], secs: c ? [].filter.call(c.children, function(x){ return x.classList.contains('settings-section'); }) : [] }; });
    var adv = P.adv(); if (adv) out.push({ id:'adv', name:'Playback › Advanced', secs: [].filter.call(adv.children, function(x){ return x.classList.contains('settings-section'); }) });
    return out;
  }
  function sectionsHTML(){
    var P = window.__ppSettings; if (!P) return '';
    var a = sArr(), lists = secLists(), opts = lists.map(function(g){ return [g.id, g.name]; });
    return '<div class="ls-part"><div class="ls-pname">Sections of Settings</div><p class="ls-note">Move any part of Settings up or down, into another group, hide it, or put it on Home as a widget.</p>' +
      lists.map(function(g){
        return '<div class="ls-sgh">' + esc(g.name) + '</div>' + (g.secs.length ? g.secs.map(function(sec, i){
          var k = P.key(sec), off = a.hide.indexOf(k) >= 0, canOrder = g.id !== 'adv';
          return '<div class="ls-orow ls-secrow' + (off ? ' ls-off' : '') + '"><span>' + esc(secName(sec)) + '</span>' +
            (canOrder ? '<button type="button" class="ls-ic" data-sec-mv="' + esc(g.id) + '|' + i + '|-1" aria-label="Move up"' + (i ? '' : ' disabled') + '>' + svg('up') + '</button>' +
              '<button type="button" class="ls-ic" data-sec-mv="' + esc(g.id) + '|' + i + '|1" aria-label="Move down"' + (i < g.secs.length - 1 ? '' : ' disabled') + '>' + svg('down') + '</button>' : '') +
            '<select class="ls-secto" data-sec-to="' + esc(k) + '" aria-label="Move to group">' + opts.map(function(o){ return '<option value="' + o[0] + '"' + (o[0] === g.id ? ' selected' : '') + '>' + esc(o[1]) + '</option>'; }).join('') + '</select>' +
            '<button type="button" class="ls-ic' + (off ? '' : ' on') + '" data-sec-hide="' + esc(k) + '" aria-label="' + (off ? 'Show' : 'Hide') + '">' + svg('eye') + '</button>' +
            '<button type="button" class="ls-ic" data-sec-pin="' + esc(k) + '" aria-label="Put on Home as a widget">' + svg('pin') + '</button></div>';
        }).join('') : '<div class="ls-note">Nothing here.</div>');
      }).join('') +
      '<div class="ls-foot"><button type="button" data-sec-reset="1"' + (Object.keys(a.place).length || Object.keys(a.order).length || a.hide.length ? '' : ' disabled') + '>Put every section back</button></div></div>';
  }
  function secMove(gid, i, dir){
    var P = window.__ppSettings, g = secLists().find(function(x){ return x.id === gid; }); if (!P || !g) return;
    var keys = g.secs.map(function(x){ return P.key(x); }), j = i + dir; if (j < 0 || j >= keys.length) return;
    var t = keys[i]; keys[i] = keys[j]; keys[j] = t;
    var a = sArr(); a.order[gid] = keys; sArrSave(a);
  }
  function secTo(k, gid){
    var a = sArr(); a.place[k] = gid;
    Object.keys(a.order).forEach(function(g){ a.order[g] = a.order[g].filter(function(x){ return x !== k; }); });
    if (gid !== 'adv'){ var g = secLists().find(function(x){ return x.id === gid; }), P = window.__ppSettings;
      a.order[gid] = (g ? g.secs.map(function(x){ return P.key(x); }) : []).filter(function(x){ return x !== k; }).concat([k]); }
    sArrSave(a);
  }

  // ======================= widgets between rows =======================
  function midHTML(z, title, note, steps){
    var W = window.PPWidgets; if (!W || !W.zopt) return '';
    var o = W.zopt(z), after = o.after != null ? +o.after : (z === 'lib-mid' ? 3 : 2), n = W.zoneCount(z);
    return '<div class="ls-part"><div class="ls-pname">' + esc(title) + '</div><p class="ls-note">' + esc(note) + (n ? ' ' + n + ' widget' + (n === 1 ? '' : 's') + ' there now.' : '') + '</p>' +
      '<div class="ls-opt"><label>Where</label><div class="ls-seg">' + steps.map(function(x){
        return '<button type="button" data-mid="' + z + '|' + x[0] + '"' + (after === x[0] ? ' class="on"' : '') + '>' + esc(x[1]) + '</button>'; }).join('') + '</div></div>' +
      '<div class="ls-foot"><button type="button" class="ls-go" data-ls-edit="' + (z === 'lib-mid' ? 'library' : 'playlists') + '">' + (n ? 'Edit these widgets' : 'Add widgets here') + '</button></div></div>';
  }
  function setZonesHTML(){
    var W = window.PPWidgets, n = W && W.zoneCount ? ['set-top','set-play','set-lib','set-look','set-data','set-fun'].reduce(function(t, z){ return t + W.zoneCount(z); }, 0) : 0;
    return '<div class="ls-part"><div class="ls-pname">Widgets in Settings</div><p class="ls-note">Put widgets at the top of Settings or after any group: a clock, buttons, a Setting widget with the switches you use most...' +
      (n ? ' ' + n + ' there now.' : '') + '</p><div class="ls-foot"><button type="button" class="ls-go" data-ls-edit="settings">' + (n ? 'Edit them' : 'Add widgets') + '</button></div></div>';
  }
  function spotsHTML(k){
    return '<div class="ls-part"><div class="ls-pname">Button spots</div><p class="ls-note">Choose the button for each place. A spot left empty shows nothing.</p>' + SPOTS[k].map(function(sp){ return spotRowHTML(k, sp); }).join('') + '</div>';
  }
  function spotRowHTML(k, sp){
    var c = spotChoices(), vals = spotVals(k);
    return (function(){
      var v = vals[sp[0]] || '';
      return '<div class="ls-opt ls-spotrow"><label>' + esc(sp[1]) + '</label><select data-spotset="' + k + '|' + sp[0] + '">' +
        (sp[2] ? '<option value=""' + (!v ? ' selected' : '') + '>Normal (' + esc(sp[2] === 'shuffle-btn' ? 'Shuffle' : 'Repeat') + ')</option><option value="none"' + (v === 'none' ? ' selected' : '') + '>Nothing</option>'
               : '<option value=""' + (!v ? ' selected' : '') + '>Empty</option>') +
        '<optgroup label="The player’s buttons">' + c.els.map(function(x){ return '<option value="el:' + x[0] + '"' + (v === 'el:' + x[0] ? ' selected' : '') + '>' + esc(x[1]) + '</option>'; }).join('') + '</optgroup>' +
        '<optgroup label="Actions">' + c.acts.map(function(x){ return '<option value="act:' + x.id + '"' + (v === 'act:' + x.id ? ' selected' : '') + '>' + esc(x.label) + '</option>'; }).join('') + '</optgroup></select></div>';
    })();
  }

  // ======================= the studio: edited on the screen itself =======================
  // Works like the page and tab editor: the bar at the top (Done, which screen, undo, presets), every part of the
  // screen outlined with a dashed line and a tag, and a small sheet with just that part's choices when you tap it.
  // The sheet has a tab to drag it down out of the way, so the change can be seen as it is made.
  IC.undo = '<path d="M3 7v6h6"/><path d="M21 17a9 9 0 0 0-15-6.7L3 13"/>';
  IC.menu = '<line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/>';
  IC.plus = '<line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>';
  IC.grid = '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>';
  // Where each part is on the screen: the elements it changes. wrap: it holds other parts (its tag goes on the left).
  // first: only the first one on screen is outlined (a row's thumbnail), though a tap on any of them opens it.
  var PART_EL = {
    aud: { 'Title & artist':{ sel:['#now-playing'] }, 'Cover':{ sel:['#viz-wrap'] }, 'Seek bar':{ sel:['#seek-row'] }, 'Main buttons':{ sel:['#transport'] },
           'Tools & volume':{ sel:['#extra-transport', '#controls-footer'] }, 'Controls panel':{ sel:['#controls-col'], wrap:true } },
    vid: { 'Behind the controls':{ sel:['#controls-col'], wrap:true }, 'Top bar':{ sel:['#now-playing', '#video-tools'] }, 'Seek bar':{ sel:['#seek-row'] },
           'Main buttons':{ sel:['#transport'] }, 'Tools & volume':{ sel:['#extra-transport', '#controls-footer'] } },
    lib: { 'Rows':{ sel:['#playlist'], wrap:true }, 'Thumbnail':{ sel:['#playlist .track-thumb'], first:true }, 'Text & buttons':{ sel:['#playlist .track-info', '#playlist .track-num'], first:true },
           'Top of the list':{ sel:['#action-row', '#search-row', '#playlist-view-row', '#browse-row', '#ppv-libhost', '#ppv-savedhost'] } },
    pls: { 'Your playlists':{ sel:['#pl-home > .ph-sec'], wrap:true }, 'An open playlist':{ sel:['#pl-home .ph-detail-head'] },
           'Playlist covers':{ sel:['#pl-home .ph-pl-head .ph-thumb', '#pl-home .ph-detail-head .ph-thumb', '#pl-home .pw-pl-card .ph-thumb'], first:true },
           'Song and video thumbnails':{ sel:['#pl-home .ph-trk .ph-thumb', '#pl-home .ph-card:not(.pw-pl-card) .ph-thumb'], first:true } },
    set: { 'Groups':{ sel:['#pp-sg-root'], wrap:true }, 'Rows':{ sel:['#pp-sg-root .settings-row'], first:true } }
  };
  SURF.forEach(function(sf){ sf.parts.forEach(function(p){ p.at = (PART_EL[sf.id] || {})[p.name] || { sel:[] }; }); });

  // Every single thing on the screen, outlined on its own and opened with a tap: each button of the players (main row,
  // quick bar, video tools, top bar, button spots), the times and volume; each row, heading and section of the lists.
  // kind: what its sheet offers. part: a list item that opens the choices of that part.
  var PLAYER_ITEMS = [
    { sel:'#transport > .ctrl-btn:not(.ls-spot)', kind:'tb' },
    { sel:'#transport > .ls-spot, .ls-spots > .ls-spot', kind:'spot' },
    { sel:'#extra-transport > [data-item-wrapper]', kind:'qb' },
    { sel:'#pl-back, #immersive-btn, #menu-btn, #pl-pin-btn', kind:'top' },
    { sel:'#cur-time, #dur-time, #vol-row', kind:'sv' },
    { sel:'#np-title, #np-artist', part:'Title & artist' }
  ];
  var ITEMS = {
    aud: PLAYER_ITEMS,
    vid: PLAYER_ITEMS.concat([{ sel:'#video-tools > *', kind:'vt' }]).map(function(x){ return x.part === 'Title & artist' ? { sel:x.sel, part:'Top bar' } : x; }),
    lib: [{ sel:'#playlist > .track', part:'Rows' }, { sel:'#action-row > *, #search-row, #playlist-view-row, #browse-row > *', part:'Top of the list' }],
    pls: [{ sel:'#pl-home .ph-card, #pl-home .ph-row, #pl-home .ph-chip, #pl-home .ph-trk', part:'Your playlists' }],
    set: [{ sel:'#pp-sg-root > .pp-sg > .pp-sg-title', part:'Groups' }, { sel:'#pp-sg-root .settings-section', kind:'sec' }, { sel:'#pp-sg-root .settings-row', part:'Rows' }]
  };
  function itemEls(){
    var out = [], seen = [], vh = window.innerHeight, vw = window.innerWidth;
    (ITEMS[cur] || []).forEach(function(d){
      document.querySelectorAll(d.sel).forEach(function(x){
        if (seen.indexOf(x) >= 0 || x.closest('#ls-edbar, #ls-studio, #ls-marks, #menu-overlay') || !visible(x)) return;
        var r = x.getBoundingClientRect(); if (r.bottom < 0 || r.top > vh || r.right < 0 || r.left > vw) return;
        seen.push(x); out.push({ el:x, d:d });
      });
    });
    return out.slice(0, 160);
  }
  function itemName(x){
    var b = x.matches('button, [role=button]') ? x : x.querySelector('button') || x;
    var n = b.getAttribute('aria-label') || b.title || (x.dataset.itemWrapper ? qbLabel(x.dataset.itemWrapper) : '') || (x.textContent || '').replace(/\s+/g, ' ').trim();
    if (x.classList.contains('ls-spot')){ var sp = (SPOTS[x.dataset.spotK] || []).find(function(q){ return q[0] === x.dataset.spot; }); if (sp) return sp[1].replace(/ \(.*\)$/, ''); }
    var known = { 'cur-time':'Time played', 'dur-time':'Length', 'vol-row':'Volume' }; if (known[x.id]) n = known[x.id];
    return n.length > 40 ? n.slice(0, 38) + '…' : (n || 'Button');
  }
  function qbLabel(id){ var Q = window.__ppQuickBar, it = Q && Q.list().find(function(x){ return x.id === id; }); return it ? it.label : id; }

  var curItem = null, cur = 'aud', open = false, keepUi = null, sheetKind = null, sheetPart = -1, undoS = [];

  // the bar at the top, as in the page editor
  var bar = document.createElement('div'); bar.id = 'ls-edbar'; bar.hidden = true;
  bar.innerHTML = '<button type="button" class="pw-ed-done" data-lb="done">Done</button>' +
    '<button type="button" class="ls-ed-title" data-lb="screens" aria-label="Which screen"><span></span>' + svg('down') + '</button>' +
    '<button type="button" data-lb="hidden" aria-label="Hidden parts" hidden>' + svg('eye') + '</button>' +
    '<button type="button" data-lb="menu" aria-label="Buttons in the menu" hidden>' + svg('menu') + '</button>' +
    '<button type="button" data-lb="arrange" aria-label="Arrange" hidden>' + svg('list') + '</button>' +
    '<button type="button" data-lb="undo" aria-label="Undo">' + svg('undo') + '</button>' +
    '<button type="button" class="pw-ed-add" data-lb="presets" aria-label="Presets">' + svg('grid') + '</button>';
  var UI = document.documentElement; UI.appendChild(bar);

  // the sheet: one part (or the presets, or the screens) at a time, never the whole studio at once
  var el = document.createElement('div'); el.id = 'ls-studio'; el.hidden = true;
  el.innerHTML = '<div class="pw-sheet-card ls-card" role="dialog" aria-label="Layout studio"><div class="pw-sheet-head"><b></b>' +
    '<button type="button" class="pw-sheet-x" data-ls="x" aria-label="Close">' + svg('x') + '</button></div><div class="pw-sheet-body ls-body"></div></div>';
  UI.appendChild(el);
  var card = el.querySelector('.ls-card'), bodyEl = el.querySelector('.ls-body'), sheetTitle = el.querySelector('.pw-sheet-head b');
  var sheetMove = window.PPSheetDrag ? window.PPSheetDrag(card, el, function(){ closeSheet(); }) : { reset: function(){} };

  // the dashed outlines and their tags
  var marks = document.createElement('div'); marks.id = 'ls-marks'; marks.hidden = true; UI.appendChild(marks);

  function firstOf(kind){ var A = api(); if (!A) return -1; var t = A.tracks(); for (var i = 0; i < t.length; i++) if (kind === 'video' ? t[i].kind === 'video' : (t[i].kind !== 'video' && !t[i].stem)) return i; return -1; }
  function curKind(){ var A = api(), K = kit(); if (!A || !K || !K.hasTrack()) return null; var t = A.tracks()[A.currentIndex()]; return t ? (t.kind === 'video' ? 'video' : 'audio') : null; }
  // Show the screen being changed behind the studio, so every change is seen as it is made.
  function showScreen(){
    var K = kit(); if (!K) return '';
    if (window.PPWidgets && window.PPWidgets.closePage) window.PPWidgets.closePage();
    if (cur === 'aud' || cur === 'vid'){
      var want = cur === 'vid' ? 'video' : 'audio';
      if (curKind() !== want){
        if (K.playerOpen()) K.closePlayer();
        return firstOf(want) >= 0 ? '<div class="ls-need"><span>Play ' + (want === 'video' ? 'a video' : 'a song') + ' to see your changes on the real player.</span><button type="button" data-ls="play">Play one</button></div>'
          : '<div class="ls-need"><span>Add ' + (want === 'video' ? 'a video' : 'a song') + ' to your library to see these changes on the player.</span></div>';
      }
      if (!K.playerOpen()) K.openPlayer();
      return '';
    }
    if (K.playerOpen()) K.closePlayer();
    K.setView(cur === 'lib' ? 'library' : cur === 'pls' ? 'playlists' : 'settings');
    if (cur === 'set') setTimeout(settingsDom, 50);
    return '';
  }
  function keepVideoUi(){
    clearInterval(keepUi); keepUi = null;
    if (open && cur === 'vid'){ var tap = function(){ if (window.__ppTap && body.classList.contains('pl-video')) window.__ppTap(); }; tap(); keepUi = setInterval(tap, 1500); }
  }

  function seg(s, o){
    var v = val(s, o.k);
    return '<div class="ls-opt"><label>' + esc(o.label) + '</label><div class="ls-seg" data-k="' + o.k + '">' + o.c.map(function(c){
      return '<button type="button" data-v="' + c[0] + '"' + (c[0] === v ? ' class="on" aria-pressed="true"' : ' aria-pressed="false"') + '>' + esc(c[1]) + '</button>'; }).join('') + '</div></div>';
  }
  function shown(s, o){
    if (!o.when) return true;
    return Object.keys(o.when).every(function(k){ var w = o.when[k], v = val(s, k); return Array.isArray(w) ? w.indexOf(v) >= 0 : v === w; });
  }
  function orderHTML(s){
    var W = window.PPWidgets, A = W && W.arrange; if (!s.order || !A) return '';
    var list = A.list(s.order); if (!list) return '';
    return '<div class="ls-part"><div class="ls-pname">' + (s.id === 'aud' ? 'Order of the rows' : 'Video tools') + '</div><div class="ls-order" data-g="' + s.order + '">' + list.map(function(it, i){
      return '<div class="ls-orow' + (it.shown ? '' : ' ls-off') + '"><span>' + esc(it.label) + '</span>' +
        (A.canOrder(s.order) ? '<button type="button" class="ls-ic" data-mv="' + i + ':-1" aria-label="Move ' + esc(it.label) + ' up"' + (i ? '' : ' disabled') + '>' + svg('up') + '</button>' +
          '<button type="button" class="ls-ic" data-mv="' + i + ':1" aria-label="Move ' + esc(it.label) + ' down"' + (i < list.length - 1 ? '' : ' disabled') + '>' + svg('down') + '</button>' : '') +
        (it.canHide ? '<button type="button" class="ls-ic' + (it.shown ? ' on' : '') + '" data-tg="' + esc(it.key) + '" aria-label="' + (it.shown ? 'Hide ' : 'Show ') + esc(it.label) + '">' + svg('eye') + '</button>' : '<span class="ls-ic ls-lock">' + svg('eye') + '</span>') +
        '</div>'; }).join('') + '</div></div>';
  }

  function visible(x){
    if (x.checkVisibility) { if (!x.checkVisibility({ visibilityProperty: true, opacityProperty: false })) return false; }
    else if (!x.offsetParent && getComputedStyle(x).position !== 'fixed') return false;
    var r = x.getBoundingClientRect(); return r.width > 2 && r.height > 2;
  }
  /** The elements of part [p] that are showing. all: every one (to find which part a tap is in), not just the first. */
  function partEls(p, all){
    var out = [];
    p.at.sel.forEach(function(q){ document.querySelectorAll(q).forEach(function(x){ if (out.indexOf(x) < 0 && visible(x)) out.push(x); }); });
    if (p.at.first && !all){
      var vh = window.innerHeight, on = out.filter(function(x){ var r = x.getBoundingClientRect(); return r.bottom > 70 && r.top < vh - 40; });
      return on.slice(0, 1);
    }
    return out;
  }
  function hiddenParts(){ var sf = byId[cur]; return sf.parts.map(function(p, i){ return partEls(p, true).length ? -1 : i; }).filter(function(i){ return i >= 0; }); }

  var marksQueued = false;
  function marksSoon(){ if (!marksQueued && open){ marksQueued = true; requestAnimationFrame(function(){ marksQueued = false; drawMarks(); }); } }
  function drawMarks(){
    if (!open){ marks.hidden = true; return; }
    var sf = byId[cur], vw = window.innerWidth, vh = window.innerHeight, html = '', tags = [], placed = [];
    function clip(r){
      if (r.bottom < 0 || r.top > vh || r.right < 0 || r.left > vw) return null;
      return { left: Math.max(2, r.left), top: Math.max(2, r.top), right: Math.min(vw - 2, r.right), bottom: Math.min(vh - 2, r.bottom) };
    }
    function box(c, cls){ return '<div class="ls-mark' + cls + '" style="left:' + c.left.toFixed(0) + 'px;top:' + c.top.toFixed(0) + 'px;width:' + Math.max(0, c.right - c.left).toFixed(0) + 'px;height:' + Math.max(0, c.bottom - c.top).toFixed(0) + 'px"></div>'; }
    sf.parts.forEach(function(p, i){
      var els = partEls(p, !!p.at.first), rs = els.map(function(x){ return x.getBoundingClientRect(); });
      if (p.at.first) rs = rs.filter(function(r){ return r.bottom > 0 && r.top < vh; });
      else if (rs.length > 1)                                    // one part made of several pieces: one outline around them all
        rs = [rs.reduce(function(a, r){ return { left: Math.min(a.left, r.left), top: Math.min(a.top, r.top), right: Math.max(a.right, r.right), bottom: Math.max(a.bottom, r.bottom) }; })];
      var on = i === sheetPart && sheetKind === 'part', first = true;
      rs.forEach(function(r){
        var c = clip(r); if (!c) return;
        html += box(c, (p.at.wrap ? ' ls-wrap' : '') + (on ? ' on' : ''));
        if (first){ tags.push({ i:i, c:c, name:p.name, wrap:!!p.at.wrap, on:on }); first = false; }   // one tag per part
      });
    });
    itemEls().forEach(function(it){
      var c = clip(it.el.getBoundingClientRect()); if (!c) return;
      html += box(c, ' ls-item' + (sheetKind === 'item' && curItem && curItem.el === it.el ? ' on' : ''));
    });
    // tags: never on top of each other or under the bar at the top
    var barB = bar.getBoundingClientRect().bottom + 4;
    tags.sort(function(a, b){ return a.wrap - b.wrap; }).forEach(function(t){
      var w = Math.min(190, 34 + t.name.length * 6.4), h = 26, c = t.c;
      var tries = [], ys = [c.top - 12, c.top + 4, c.bottom - h - 4, c.top - 12 + h + 2, c.top + 4 + 2 * (h + 2)];
      ys.forEach(function(y){ tries.push([t.wrap ? c.left + 2 : c.right - w - 2, y]); tries.push([t.wrap ? c.right - w - 2 : c.left + 2, y]); tries.push([(c.left + c.right - w) / 2, y]); });
      var pos = null;
      for (var k = 0; k < tries.length && !pos; k++){
        var x = Math.max(4, Math.min(vw - w - 4, tries[k][0])), y = Math.max(barB, Math.min(vh - h - 4, tries[k][1]));
        if (!placed.some(function(q){ return x < q.x + q.w + 3 && q.x < x + w + 3 && y < q.y + h + 3 && q.y < y + h + 3; })) pos = { x:x, y:y };
      }
      if (!pos) pos = { x: Math.max(4, Math.min(vw - w - 4, c.right - w)), y: Math.max(barB, c.top - 12) };
      placed.push({ x:pos.x, y:pos.y, w:w });
      html += '<button type="button" class="ls-tag' + (t.on ? ' on' : '') + '" data-part="' + t.i + '" style="left:' + pos.x.toFixed(0) + 'px;top:' + pos.y.toFixed(0) + 'px;max-width:' + w.toFixed(0) + 'px">' + svg('sliders') + '<span>' + esc(t.name) + '</span></button>';
    });
    if (marks._h !== html){ marks.innerHTML = html; marks._h = html; }
    marks.hidden = false;
    var hb = bar.querySelector('[data-lb="hidden"]'), hp = hiddenParts(); hb.hidden = !hp.length;
    hb.setAttribute('aria-label', hp.length + ' hidden part' + (hp.length === 1 ? '' : 's'));
  }
  window.addEventListener('scroll', marksSoon, true);
  window.addEventListener('resize', marksSoon);
  var marksTick = 0;

  function openSheet(kind, title, html, part){
    sheetKind = kind; sheetPart = part == null ? -1 : part; if (kind !== 'item') curItem = null;
    sheetTitle.textContent = title; bodyEl.innerHTML = html; el.hidden = false; bodyEl.scrollTop = 0;
    if (kind !== 'part' || !el._shown) sheetMove.reset();          // a tag tapped while the sheet is down keeps it down
    el._shown = true;
    marksSoon();
  }
  function closeSheet(){ curItem = null; el.hidden = true; el._shown = false; sheetKind = null; sheetPart = -1; bodyEl.innerHTML = ''; sheetMove.reset(); marksSoon(); }

  function partHTML(i){
    var sf = byId[cur], part = sf.parts[i]; if (!part) return '';
    var opts = part.opts.filter(function(o){ return shown(sf, o); });
    return opts.map(function(o){ return seg(sf, o); }).join('') + (partEls(part, true).length ? '' : '<p class="pw-note">Hidden on this screen right now. Pick a choice above to bring it back.</p>') +
      (part.name === 'Tools & volume' ? menuButtonsHTML() : '');
  }
  // ---- one button (or row) on its own ----
  function menuButtonsHTML(){
    var Q = window.__ppQuickBar; if (!Q) return '';
    var list = Q.list(), onL = list.filter(function(x){ return x.on; });
    return '<div class="ls-part"><div class="ls-pname">Buttons in the ☰ menu</div><p class="ls-note">Every button of the player’s menu. Turn one on to put it on the player’s quick bar (' + Q.used() + ' of ' + Q.max() + ' places used); off, it stays in the ☰ menu.</p>' +
      '<div class="ls-order">' + list.map(function(it){
        var j = onL.indexOf(it);
        return '<div class="ls-orow ls-qbrow' + (it.on ? '' : ' ls-off') + '"><i class="ls-qbic">' + it.icon + '</i><span>' + esc(it.label) + (it.weight > 1 ? ' <small>(' + it.weight + ' places)</small>' : '') + '</span>' +
          (it.on ? '<button type="button" class="ls-ic" data-qb-mv="' + it.id + '|-1" aria-label="Move ' + esc(it.label) + ' left"' + (j ? '' : ' disabled') + '>' + svg('up') + '</button>' +
            '<button type="button" class="ls-ic" data-qb-mv="' + it.id + '|1" aria-label="Move ' + esc(it.label) + ' right"' + (j < onL.length - 1 ? '' : ' disabled') + '>' + svg('down') + '</button>' : '') +
          '<button type="button" class="ls-ic' + (it.on ? ' on' : '') + '" data-qb-tg="' + it.id + '" aria-label="' + (it.on ? 'Take ' + esc(it.label) + ' off the quick bar' : 'Put ' + esc(it.label) + ' on the quick bar') + '">' + svg('eye') + '</button></div>';
      }).join('') + '</div><div class="ls-foot"><button type="button" data-qb-reset="1">Menu order</button></div></div>';
  }
  function arrRow(gid, key, what){
    var A = window.PPWidgets && window.PPWidgets.arrange; if (!A) return '';
    var list = A.list(gid) || [], i = list.findIndex(function(x){ return x.key === key; }); if (i < 0) return '';
    var it = list[i], h = '';
    if (it.canHide) h += '<div class="ls-opt"><label>On the screen</label><div class="ls-seg"><button type="button" data-it-tg="' + esc(key) + '"' + (it.shown ? ' class="on"' : '') + '>Shown</button><button type="button" data-it-tg="' + esc(key) + '"' + (it.shown ? '' : ' class="on"') + '>Hidden</button></div></div>';
    else h += '<p class="pw-note">' + esc(it.label) + ' always stays.</p>';
    if (A.canOrder(gid)) h += '<div class="ls-opt"><label>Place in the ' + what + '</label><div class="ls-seg"><button type="button" data-it-mv="' + gid + '|' + esc(key) + '|-1"' + (i ? '' : ' disabled') + '>‹ Earlier</button><button type="button" data-it-mv="' + gid + '|' + esc(key) + '|1"' + (i < list.length - 1 ? '' : ' disabled') + '>Later ›</button></div></div>';
    return h;
  }
  function spotPickHTML(k, sp){
    var c = spotChoices(), v = spotVals(k)[sp[0]] || '', W = window.PPWidgets;
    function tile(val, label, icon){
      return '<button type="button" class="ls-pick' + (v === val ? ' on' : '') + '" data-spot-pick="' + k + '|' + sp[0] + '|' + esc(val) + '">' + (icon || svg('x')) + '<span>' + esc(label) + '</span></button>';
    }
    var base = sp[2] ? tile('', 'Normal (' + (sp[2] === 'shuffle-btn' ? 'Shuffle' : 'Repeat') + ')', (document.getElementById(sp[2]) || {}).querySelector ? (document.getElementById(sp[2]).querySelector('svg') || {}).outerHTML : '') + tile('none', 'Nothing', svg('x'))
                     : tile('', 'Empty', svg('x'));
    return '<div class="ls-part"><div class="ls-pname">' + esc(sp[1]) + '</div><p class="ls-note">Tap a button to put it here.</p><div class="ls-picks">' + base + '</div>' +
      '<div class="ls-pname">The player’s buttons</div><div class="ls-picks">' + c.els.map(function(x){ var o = document.getElementById(x[0]), ic = o && o.querySelector('svg'); return tile('el:' + x[0], x[1], ic ? ic.outerHTML : ''); }).join('') + '</div>' +
      '<div class="ls-pname">Actions</div><div class="ls-picks">' + c.acts.map(function(x){ return tile('act:' + x.id, x.label, IC[x.id] ? svg(x.id) : W && W.icon ? W.icon(x.icon || 'star') : ''); }).join('') + '</div></div>';
  }
  function setSpot(k, spot, v){
    remember(); S.spots = S.spots || {}; S.spots[k] = Object.assign({}, S.spots[k]);
    if (v) S.spots[k][spot] = v; else delete S.spots[k][spot];
    if (!Object.keys(S.spots[k]).length) delete S.spots[k]; if (!Object.keys(S.spots).length) delete S.spots;
    save();
    // the spot's button is rebuilt: the sheet follows it (redrawSheet finds it again by its place)
    if (sheetKind === 'item' && curItem) curItem.spot = [k, spot];
    change();
  }
  function partBtn(name){ var i = byId[cur].parts.findIndex(function(p){ return p.name === name; }); return i < 0 ? '' : '<div class="ls-foot"><button type="button" data-part="' + i + '">' + esc(name) + ': every choice</button></div>'; }
  function itemHTML(it){
    var x = it.el, k = it.d.kind, sid = cur, h = '';
    if (k === 'tb'){
      h = arrRow('transport', x.id, 'main row');
      var sp = SPOTS[sid] && SPOTS[sid].find(function(q){ return q[2] === x.id; });
      if (sp) h += spotPickHTML(sid, sp);
      return h + partBtn('Main buttons');
    }
    if (k === 'spot'){ var s2 = SPOTS[x.dataset.spotK].find(function(q){ return q[0] === x.dataset.spot; }); return s2 ? spotPickHTML(x.dataset.spotK, s2) : ''; }
    if (k === 'qb'){
      var id = x.dataset.itemWrapper, Q = window.__ppQuickBar, list = Q ? Q.list().filter(function(q){ return q.on; }) : [], j = list.findIndex(function(q){ return q.id === id; });
      h = '<div class="ls-opt"><label>Where</label><div class="ls-seg"><button type="button" class="on">On the quick bar</button><button type="button" data-qb-tg="' + id + '">Only in the ☰ menu</button></div></div>' +
        '<div class="ls-opt"><label>Place on the bar</label><div class="ls-seg"><button type="button" data-qb-mv="' + id + '|-1"' + (j > 0 ? '' : ' disabled') + '>‹ Left</button><button type="button" data-qb-mv="' + id + '|1"' + (j >= 0 && j < list.length - 1 ? '' : ' disabled') + '>Right ›</button></div></div>';
      return h + menuButtonsHTML() + partBtn('Tools & volume');
    }
    if (k === 'vt'){ var b = x.matches('button') ? x : x.querySelector('button'); return (b ? arrRow('video', b.id, 'video tools') : '') + partBtn('Top bar'); }
    if (k === 'sv') return arrRow('seek', x.id, 'row') + partBtn(x.id === 'vol-row' ? 'Tools & volume' : 'Seek bar');
    if (k === 'top'){
      if (x.id === 'menu-btn') return menuButtonsHTML();
      return '<p class="pw-note">' + esc(itemName(x)) + ' always stays. Tap a dashed + beside it to add your own button there.</p>';
    }
    if (k === 'sec') return sectionsHTML();
    return '';
  }
  function openItem(it){
    if (it.d.part){ var i = byId[cur].parts.findIndex(function(p){ return p.name === it.d.part; }); if (i >= 0) openPart(i); return; }
    curItem = it; openSheet('item', itemName(it.el), itemHTML(it));
  }
  function presetsHTML(){
    var sf = byId[cur], p = presetOf(sf);
    return '<div class="ls-pname">' + esc(sf.title) + (p === 'custom' ? ' <em>· your own mix</em>' : '') + '</div>' +
      '<div class="ls-presets">' + sf.presets.map(function(x){
        return '<button type="button" class="ls-pre' + (x.id === p ? ' on' : '') + '" data-pre="' + x.id + '">' + sketch(x.sk) + '<span>' + esc(x.name) + '</span></button>'; }).join('') + '</div>' +
      '<div class="ls-foot"><button type="button" data-ls="reset"' + (S[sf.id] || (S.spots && S.spots[sf.id]) ? '' : ' disabled') + '>Back to the normal ' + esc(sf.title.toLowerCase()) + '</button></div>';
  }
  function arrangeHTML(){
    var sf = byId[cur];
    return orderHTML(sf) + (SPOTS[sf.id] ? menuButtonsHTML() + spotsHTML(sf.id) : '') +
      (sf.id === 'lib' ? midHTML('lib-mid', 'Widgets in the list', 'A row of widgets partway down your songs and videos: a clock, buttons, a Setting widget, anything.', [[0,'At the top'],[1,'After 1'],[3,'After 3'],[5,'After 5'],[10,'After 10'],[25,'After 25']]) : '') +
      (sf.id === 'pls' ? midHTML('pls-mid', 'Widgets among your playlists', 'Widgets between your playlists, in the list or the grid.', [[0,'Before the first'],[1,'After 1'],[2,'After 2'],[4,'After 4'],[8,'After 8']]) : '') +
      (sf.id === 'set' ? setZonesHTML() + sectionsHTML() : '');
  }
  function screensHTML(){
    return '<div class="pw-tabs ls-screens">' + SURF.map(function(sf){
      return '<button type="button" class="pw-lp-row' + (sf.id === cur ? ' on' : '') + '" data-ls-tab="' + sf.id + '">' + svg(sf.icon) + '<b>' + esc(sf.title) + '</b></button>'; }).join('') + '</div>';
  }
  function hiddenHTML(){
    var sf = byId[cur];
    return '<p class="pw-note">These parts are hidden on this screen. Tap one to change it.</p><div class="pw-tabs ls-screens">' + hiddenParts().map(function(i){
      return '<button type="button" class="pw-lp-row" data-part="' + i + '">' + svg('eye') + '<b>' + esc(sf.parts[i].name) + '</b></button>'; }).join('') + '</div>';
  }
  function redrawSheet(){
    if (el.hidden || !sheetKind) return;
    var top = bodyEl.scrollTop;
    if (sheetKind === 'part') bodyEl.innerHTML = partHTML(sheetPart);
    else if (sheetKind === 'presets') bodyEl.innerHTML = presetsHTML();
    else if (sheetKind === 'arrange') bodyEl.innerHTML = arrangeHTML();
    else if (sheetKind === 'menu') bodyEl.innerHTML = menuButtonsHTML();
    else if (sheetKind === 'item'){
      if (curItem && !document.contains(curItem.el) && curItem.spot){ var nb = document.querySelector('.ls-spot[data-spot-k="' + curItem.spot[0] + '"][data-spot="' + curItem.spot[1] + '"]'); if (nb) curItem = { el:nb, d:{ kind:'spot' }, spot:curItem.spot }; }
      if (!curItem || !document.contains(curItem.el)){ curItem = null; closeSheet(); return; } bodyEl.innerHTML = itemHTML(curItem); }
    else if (sheetKind === 'screens') bodyEl.innerHTML = screensHTML();
    else if (sheetKind === 'hidden'){ if (!hiddenParts().length){ closeSheet(); return; } bodyEl.innerHTML = hiddenHTML(); }
    bodyEl.scrollTop = top;
  }
  function openPart(i){ var part = byId[cur].parts[i]; if (part) openSheet('part', part.name, partHTML(i), i); }
  /** Puts the screen being edited behind the bar; when it cannot be shown (nothing to play) says why in a sheet. */
  function enterScreen(){
    var need = showScreen();
    bar.querySelector('.ls-ed-title span').textContent = byId[cur].title;
    bar.querySelector('[data-lb="arrange"]').hidden = !arrangeHTML();
    bar.querySelector('[data-lb="menu"]').hidden = !(SPOTS[cur] && window.__ppQuickBar);
    body.setAttribute('data-ls-scr', cur);
    // the player's own top bar would sit under the studio's bar: the player is shrunk to fit the room below it
    var cs = getComputedStyle(body); [bar, el, marks].forEach(function(x){ x.style.fontFamily = cs.fontFamily; x.style.color = cs.color; });
    var top = Math.ceil(bar.getBoundingClientRect().bottom + 6), vh = window.innerHeight;
    UI.style.setProperty('--ls-top', top + 'px'); UI.style.setProperty('--ls-sc', ((vh - top) / vh).toFixed(4));
    keepVideoUi();
    if (need) openSheet('need', byId[cur].title, need); else if (sheetKind === 'need' || sheetKind === 'screens') closeSheet();
    setTimeout(marksSoon, 80); setTimeout(marksSoon, 450);
  }
  // a quick-bar button taken off leaves the screen: its sheet turns into the full list of the menu's buttons
  function afterQb(){
    if (sheetKind === 'item' && curItem && curItem.d.kind === 'qb' && (!document.contains(curItem.el) || curItem.el.closest('#menu-overlay'))) openSheet('menu', 'Buttons in the ☰ menu', menuButtonsHTML());
    applySpots(); redrawSheet(); setTimeout(marksSoon, 60); setTimeout(marksSoon, 400);
  }
  function remember(){ undoS.push(JSON.stringify(S)); if (undoS.length > 40) undoS.shift(); }
  function change(){ save(); apply(); applySpots(); redrawSheet(); setTimeout(marksSoon, 60); setTimeout(marksSoon, 400); }

  bar.addEventListener('click', function(e){
    var b = e.target.closest('[data-lb]'); if (!b) return;
    var k = b.dataset.lb;
    if (k === 'done') close();
    else if (k === 'screens') openSheet('screens', 'Which screen', screensHTML());
    else if (k === 'presets') openSheet('presets', 'Presets', presetsHTML());
    else if (k === 'arrange') openSheet('arrange', 'Arrange', arrangeHTML());
    else if (k === 'menu') openSheet('menu', 'Buttons in the ☰ menu', menuButtonsHTML());
    else if (k === 'hidden') openSheet('hidden', 'Hidden parts', hiddenHTML());
    else if (k === 'undo'){
      if (!undoS.length){ toast('Nothing to undo.'); return; }
      S = JSON.parse(undoS.pop()); change();
    }
  });

  // While the studio is open a tap on the screen picks the part under it (the innermost one) instead of doing what
  // it normally does; scrolling still works, so long lists can be looked through.
  document.addEventListener('click', function(e){
    if (!open || !e.isTrusted) return; var t = e.target; if (!t || !t.closest) return;   // the app's own clicks (switching panes) go through
    if (t.closest('#ls-edbar, #ls-studio, #pw-sheet, .modal-overlay.open')) return;
    var tag = t.closest('.ls-tag');
    e.preventDefault(); e.stopPropagation();
    if (tag){ openPart(+tag.dataset.part); return; }
    var sf = byId[cur], best = -1, bestIt = null, area = Infinity;
    sf.parts.forEach(function(p, i){ partEls(p, true).forEach(function(x){ if (x.contains(t)){ var r = x.getBoundingClientRect(), ar = r.width * r.height; if (ar < area){ area = ar; best = i; } } }); });
    itemEls().forEach(function(it){ if (it.el.contains(t)){ var r = it.el.getBoundingClientRect(), ar = r.width * r.height; if (ar <= area){ area = ar; bestIt = it; } } });
    if (bestIt) openItem(bestIt); else if (best >= 0) openPart(best);
  }, true);

  el.addEventListener('click', function(e){
    var t = e.target, b;
    if (t.closest('[data-ls="x"]')){ closeSheet(); return; }
    if ((b = t.closest('[data-ls-tab]'))){ cur = b.dataset.lsTab; undoS = []; enterScreen(); applySpots(); if (sheetKind === 'screens') closeSheet(); return; }
    if ((b = t.closest('[data-part]'))){ openPart(+b.dataset.part); return; }
    if ((b = t.closest('[data-pre]'))){
      var sf = byId[cur], pr = sf.presets.find(function(x){ return x.id === b.dataset.pre; });
      if (pr){ remember(); if (Object.keys(pr.v).length) S[sf.id] = Object.assign({}, pr.v); else delete S[sf.id]; change(); }
      return;
    }
    if ((b = t.closest('.ls-seg[data-k] button'))){ remember(); setVal(byId[cur], b.parentNode.dataset.k, b.dataset.v); change(); return; }
    var A = window.PPWidgets && window.PPWidgets.arrange, Q = window.__ppQuickBar;
    if ((b = t.closest('[data-spot-pick]'))){ var sk = b.dataset.spotPick.split('|'); setSpot(sk[0], sk[1], sk.slice(2).join('|')); return; }
    if ((b = t.closest('[data-qb-tg]')) && Q){ Q.toggle(b.dataset.qbTg); afterQb(); return; }
    if ((b = t.closest('[data-qb-mv]')) && Q){ var qm = b.dataset.qbMv.split('|'); Q.move(qm[0], +qm[1]); afterQb(); return; }
    if ((b = t.closest('[data-qb-reset]')) && Q){ Q.reset(); afterQb(); return; }
    if ((b = t.closest('[data-it-tg]')) && A){ var on = !b.classList.contains('on'); if (on){ A.toggle(b.dataset.itTg); change(); } return; }
    if ((b = t.closest('[data-it-mv]')) && A){ var im = b.dataset.itMv.split('|'), il = A.list(im[0]) || [], ii = il.findIndex(function(x){ return x.key === im[1]; }); if (ii >= 0){ A.move(im[0], ii, +im[2]); change(); } return; }
    if ((b = t.closest('[data-mv]')) && A){ var g = b.closest('[data-g]').dataset.g, m = b.dataset.mv.split(':'); A.move(g, +m[0], +m[1]); change(); return; }
    if ((b = t.closest('[data-tg]')) && A){ A.toggle(b.dataset.tg); change(); return; }
    if ((b = t.closest('[data-mid]'))){ var mm = b.dataset.mid.split('|'); window.PPWidgets.zopt(mm[0], { after: +mm[1] }); change(); return; }
    if ((b = t.closest('[data-ls-edit]'))){ var zz = b.dataset.lsEdit; close(); if (window.PPWidgets) window.PPWidgets.edit(zz); return; }
    if ((b = t.closest('[data-sec-mv]'))){ var sm = b.dataset.secMv.split('|'); secMove(sm[0], +sm[1], +sm[2]); change(); return; }
    if ((b = t.closest('[data-sec-hide]'))){ var sa = sArr(), hk = b.dataset.secHide, hi = sa.hide.indexOf(hk); if (hi >= 0) sa.hide.splice(hi, 1); else sa.hide.push(hk); sArrSave(sa); change(); return; }
    if ((b = t.closest('[data-sec-pin]'))){ if (window.PPWidgets && window.PPWidgets.addWidget('home', 'setsec', { sec: b.dataset.secPin })) toast('Added to Home as a widget. Move it with Edit layout.'); return; }
    if ((b = t.closest('[data-sec-reset]'))){ sArrSave({}); change(); toast('Every section is back in its place.'); return; }
    if (!(b = t.closest('[data-ls]'))) return;
    var k = b.dataset.ls;
    if (k === 'play'){
      var kind = cur === 'vid' ? 'video' : 'audio', i = firstOf(kind), Ap = api();
      // play() needs the queue to walk next/previous through: every track of the same kind, as Home's rows do
      var q = Ap ? Ap.tracks().map(function(t, n){ return n; }).filter(function(n){ var t = Ap.tracks()[n]; return kind === 'video' ? t.kind === 'video' : (t.kind !== 'video' && !t.stem); }) : [];
      if (i >= 0 && Ap){ Ap.play(i, q); setTimeout(function(){ var K = kit(); if (K && !K.playerOpen()) K.openPlayer(); closeSheet(); enterScreen(); }, 350); }
    }
    else if (k === 'reset'){
      var sr = byId[cur]; remember(); delete S[sr.id]; if (S.spots){ delete S.spots[sr.id]; applySpots(); }
      if (A && sr.order) A.reset(sr.order);
      change(); toast(sr.title + ' is back to normal.');
    }
  });

  el.addEventListener('change', function(e){
    var t = e.target;
    if (t.dataset.spotset){ var p = t.dataset.spotset.split('|'); remember(); S.spots = S.spots || {}; S.spots[p[0]] = Object.assign({}, S.spots[p[0]]);
      if (t.value) S.spots[p[0]][p[1]] = t.value; else delete S.spots[p[0]][p[1]];
      if (!Object.keys(S.spots[p[0]]).length) delete S.spots[p[0]]; if (!Object.keys(S.spots).length) delete S.spots;
      save(); applySpots(); change(); return; }
    if (t.dataset.secTo){ secTo(t.dataset.secTo, t.value); change(); }
  });
  function openStudio(which){
    if (which && byId[which]) cur = which;
    else {
      var K = kit();
      cur = K && K.playerOpen() ? (body.classList.contains('pl-video') ? 'vid' : 'aud') : K && K.view() === 'library' ? 'lib' : K && K.view() === 'playlists' ? 'pls' : K && K.view() === 'settings' ? 'set' : 'aud';
    }
    var ov = document.getElementById('customize-modal-overlay'); if (ov) ov.classList.remove('open');
    if (!body.classList.contains('player-layout')){ toast('The layout studio needs the phone layout (Settings > Appearance).'); }
    if (window.PPWidgets && window.PPWidgets.stopEdit) window.PPWidgets.stopEdit();
    open = true; undoS = []; bar.hidden = false; body.classList.add('ls-open', 'ls-editing');
    enterScreen(); applySpots();
    clearInterval(marksTick); marksTick = setInterval(marksSoon, 500);   // the screen moves by itself too (the video's controls, a list growing)
  }
  function close(){
    open = false; bar.hidden = true; closeSheet(); marks.hidden = true; marks.innerHTML = ''; marks._h = '';
    body.classList.remove('ls-open', 'ls-editing'); body.removeAttribute('data-ls-scr');
    clearInterval(keepUi); keepUi = null; clearInterval(marksTick); marksTick = 0;
    applySpots();
    toast('Layout saved.');
  }
  window.addEventListener('keydown', function(e){ if (e.key === 'Escape' && open){ if (!el.hidden) closeSheet(); else close(); } });
  // The phone's back button arrives as Escape in this app: it closes the sheet first, then the studio.

  // ---------- ways in ----------
  function entryRow(){
    var panel = document.getElementById('customize-layout-panel'); if (!panel || panel.querySelector('.ls-entry')) return;
    var row = document.createElement('div'); row.className = 'ls-entry';
    row.innerHTML = '<div class="ls-entry-ic">' + svg('layers') + '</div><div><b>Layout studio</b><small>Rebuild the music player, video player, Library, Playlists and Settings: presets, and every part on its own.</small></div>' +
      '<button type="button" class="settings-toggle-btn" data-ls-open="1">Open</button>';
    panel.insertBefore(row, panel.firstChild);
  }
  document.addEventListener('click', function(e){
    if (e.target.closest && e.target.closest('[data-ls-open]')) openStudio();
  });
  function settingsButton(){
    var grid = document.querySelector('#pw-customize-section .pw-cz-grid'); if (!grid || grid.querySelector('[data-ls-open]')) return;
    var b = document.createElement('button'); b.type = 'button'; b.className = 'pw-cz'; b.dataset.lsOpen = '1';
    b.innerHTML = svg('layers') + '<span>Studio</span>'; grid.insertBefore(b, grid.children[2] || null);
  }
  // The Layout panel redraws itself whenever Customize opens, so the studio's row is put back each time.
  function watchPanel(){
    var panel = document.getElementById('customize-layout-panel'); if (!panel || typeof MutationObserver !== 'function') return;
    new MutationObserver(function(){ if (!panel.querySelector('.ls-entry')) entryRow(); }).observe(panel, { childList:true });
  }
  // Settings groups are built after this script runs; keep the fold state and jump bar in step with them.
  function watchSettings(){
    var pane = document.getElementById('sidebar-pane-settings'); if (!pane || typeof MutationObserver !== 'function') return;
    var t = null;
    new MutationObserver(function(){ clearTimeout(t); t = setTimeout(settingsDom, 60); }).observe(pane, { childList:true });
  }

  window.PPStudio = { open: openStudio, close: close, apply: apply, get: function(){ return JSON.parse(JSON.stringify(S)); },
    set: function(id, v){ if (!byId[id]) return; if (v && typeof v === 'object' && Object.keys(v).length) S[id] = v; else delete S[id]; save(); apply(); } };

  apply();
  function boot(){ applySpots(); setTimeout(applySpots, 1200); entryRow(); watchPanel(); settingsButton(); watchSettings(); settingsDom(); setTimeout(settingsDom, 1500); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
