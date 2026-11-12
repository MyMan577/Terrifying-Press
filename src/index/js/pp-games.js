(function(){
  'use strict';
  var GAMES = [
    { id:'obby', name:'Obby Builder', tag:'Build a course, then beat it.', icon:'games/obby/icon.png', loading:'games/obby/loading.jpg', src:'games/obby/index.html', bg:'#101634', ownMusic:true },
    { id:'nebula', name:'Nebula Touch', tag:'Stir a field of light with your fingers.', icon:'games/nebula/icon.png', src:'games/nebula/index.html', bg:'#07060d', loading:'games/nebula/loading.jpg', loadCenter:true },
    { id:'toque', icon:'games/toque/icon.png', loading:'games/toque/loading.jpg', name:'Toque & Spear', tag:'Hunt, fight and bond with the spirits of the wild.', src:'games/toque/index.html', bg:'#2b1530', mono:'TS', grad:['#ff8a5c','#7a3fa8'] },
    { id:'weaponball', icon:'games/weaponball/icon.png', loading:'games/weaponball/loading.jpg', name:'Weapon Ball', tag:'Pick your balls and watch them fight it out.', src:'games/weaponball/index.html', bg:'#e9edf5', mono:'WB', grad:['#ff5a5a','#3a7bff'], ownMusic:true },
    { id:'anteup', icon:'games/anteup/icon.png', loading:'games/anteup/loading.jpg', name:'Ante Up', tag:'Play poker hands to beat ten antes.', src:'games/anteup/index.html', bg:'#0f2a1c', mono:'AU', grad:['#e8c15a','#1f6a45'] },
    { id:'lastcard', icon:'games/lastcard/icon.png', loading:'games/lastcard/loading.jpg', name:'Last Card', tag:'Match colours and numbers. Be first to empty your hand.', src:'games/lastcard/index.html', bg:'#14403f', mono:'LC', grad:['#ff5a4e','#14b8a6'] },
    { id:'blob', icon:'games/blob/icon.png', loading:'games/blob/loading.jpg', name:'Blob Barrage', tag:'Turn-based blob battles with silly weapons.', src:'games/blob/index.html', bg:'#dfe5f3', mono:'BB', grad:['#8fe3b0','#2f7fd0'] },
    { id:'bastion', icon:'games/bastion/icon.png', loading:'games/bastion/loading.jpg', name:'Bastion Brawl', tag:'Send troops in and knock down the towers.', src:'games/bastion/index.html', bg:'#1a1430', mono:'BB', grad:['#ffb84d','#8b5cff'] },
    { id:'kitchen', icon:'games/kitchen/icon.png', loading:'games/kitchen/loading.jpg', name:'Kitchen Rush', tag:'Cook every order before the clock runs out.', src:'games/kitchen/index.html', bg:'#2c241a', mono:'KR', grad:['#ffa53a','#7a4a2a'] },
    { id:'cube', icon:'games/cube/icon.png', loading:'games/cube/loading.jpg', name:'Dashcube Knight', tag:'Tap to dash through stages of monsters.', src:'games/cube/index.html', bg:'#62bfe8', mono:'DK', grad:['#62bfe8','#45a23f'] }
  ];
  // Until a game has its own icon, it gets a coloured tile with its initials.
  function artHTML(g){
    if (g.icon) return '<img src="' + g.icon + '" alt="" loading="lazy">';
    return '<div class="ppg-mono" style="background:linear-gradient(135deg,' + g.grad[0] + ',' + g.grad[1] + ')"><span>' + esc(g.mono) + '</span></div>';
  }
  var PAD = '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="#fff" d="M7.6 6.5h8.8a5.2 5.2 0 0 1 5.1 4.2l.9 4.9a2.7 2.7 0 0 1-4.7 2.3l-2.1-2.4H8.4l-2.1 2.4a2.7 2.7 0 0 1-4.7-2.3l.9-4.9a5.2 5.2 0 0 1 5.1-4.2z"/><path fill="#5a3fc4" d="M6.6 9.3h1.6v1.6h1.6v1.6H8.2v1.6H6.6v-1.6H5v-1.6h1.6z"/><circle cx="16.2" cy="10.2" r="1.15" fill="#5a3fc4"/><circle cx="18" cy="12.3" r="1.15" fill="#5a3fc4"/></svg>';
  var CHEV = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>';
  var X = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><line x1="6" y1="6" x2="18" y2="18"/><line x1="18" y1="6" x2="6" y2="18"/></svg>';

  function esc(s){ return String(s).replace(/[&<>"]/g, function(c){ return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]; }); }

  // ---- the Games buttons (markup is in the page: sidebar header and Home title row) ----
  document.addEventListener('click', function(e){
    var b = e.target.closest && e.target.closest('[data-pp-games]');
    if (!b) return;
    e.preventDefault(); e.stopPropagation();
    openGrid();
  }, true);

  // Classic layout: the window's Menu/Fullscreen buttons sit in the top-right corner.
  // When the sidebar reaches under them (phones), the Games button moves to their left.
  (function(){
    var btn = document.querySelector('.pp-games-btn-side'), hdr = document.getElementById('sidebar-header');
    if (!btn || !hdr) return;
    function place(){
      var m = document.getElementById('menu-btn'), right = 14;
      if (m && m.getClientRects().length){
        var hr = hdr.getBoundingClientRect(), mr = m.getBoundingClientRect();
        if (mr.left < hr.right && mr.bottom > hr.top) right = Math.round(hr.right - mr.left) + 8;
      }
      btn.style.right = right + 'px';
    }
    place();
    if (window.ResizeObserver) new ResizeObserver(place).observe(hdr);
    window.addEventListener('resize', place);
    new MutationObserver(place).observe(document.body, { attributes:true, attributeFilter:['class'] });   // layout switch
  })();

  // ---- games page ----
  var grid = document.createElement('div');
  grid.id = 'pp-games';
  grid.setAttribute('role', 'dialog'); grid.setAttribute('aria-label', 'Games');
  grid.innerHTML = '<div class="ppg-head"><button type="button" class="ppg-back" aria-label="Back">' + CHEV + '</button><h1 class="ppg-title">Games</h1></div>' +
    '<div class="ppg-sub">' + GAMES.length + (window.__ppWeb ? ' games. Progress is saved in this browser.' : ' games. Your music keeps playing.') + '</div>' +
    '<div class="ppg-grid">' + GAMES.map(function(g){
      return '<button type="button" class="ppg-card" data-game="' + g.id + '"><div class="ppg-art" style="background:' + g.bg + '">' + artHTML(g) + '</div>' +
        '<div class="ppg-name">' + esc(g.name) + '</div><div class="ppg-tag">' + esc(g.tag) + '</div></button>';
    }).join('') + '</div>';
  document.body.appendChild(grid);
  window.__ppGames = { list: GAMES, grid: grid, art: artHTML, open: function(id){ openGame(id); } };   // read by the Press Play Points hub below
  grid.querySelector('.ppg-back').addEventListener('click', closeGrid);
  grid.addEventListener('click', function(e){
    var c = e.target.closest('.ppg-card'); if (c) openGame(c.getAttribute('data-game'));
  });

  function openGrid(){
    if (grid.classList.contains('open')) return;
    grid.classList.add('open');
    requestAnimationFrame(function(){ grid.classList.add('shown'); });
    try { history.pushState({ ppGames:1 }, ''); } catch(e){}
  }
  function hideGrid(){ if (window.__ppWeb) return; grid.classList.remove('open', 'shown'); }   // the website (games-site) has no app behind the grid
  function closeGrid(){
    if (history.state && history.state.ppGames) history.back(); else hideGrid();
  }

  // ---- game view ----
  var view = document.createElement('div');
  view.id = 'pp-game';
  document.body.appendChild(view);
  var current = null, frame = null, playObs = null;

  function appPlaying(){ var b = document.getElementById('play-btn'); return !!(b && b.classList.contains('is-playing')); }
  function syncGameMusic(){
    if (!current || !current.ownMusic || !frame) return;
    try { var w = frame.contentWindow; if (w && w.__ppHostMute) w.__ppHostMute(appPlaying()); } catch(e){}
  }
  function gameMode(on){
    try { var P = window.Capacitor && Capacitor.Plugins && Capacitor.Plugins.PPGameMode; if (P) (on ? P.enter() : P.exit()).catch(function(){}); } catch(e){}
  }

  // ---- In-game now-playing card ------------------------------------------------------------
  // A mini button on the right of the game's top bar opens a small card: artwork on the left, title, seek bar and
  // previous / play / next beside it, then Shuffle, Repeat, Speed and Sleep pills below. Every control presses the
  // app's own button (or sets its own slider), so behaviour and saved state are exactly the player's.
  window.__ppNowCard = (function(){
    var I = {
      prev: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M6 6h2v12H6zm3.5 6l8.5 6V6z"/></svg>',
      next: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M16 6h2v12h-2zM6 6l8.5 6L6 18z"/></svg>',
      play: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>',
      pause: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M6 5h4v14H6zM14 5h4v14h-4z"/></svg>',
      note: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>'
    };
    var $ = function(id){ return document.getElementById(id); };
    var card = null, mini = null, host = null, timer = 0, dragging = false, openPill = null, sub = null, peek = null;
    // pills whose whole tool is too big for the card: tapping one shows the player itself until "Back to game"
    var BIG = { stems:1, mashup:1, appearance:1, marks:1, cutter:1 };
    function api(){ return window.__ppApi; }
    function cur(){ var a = api(); if (!a) return null; var i = a.currentIndex(), t = a.tracks(); return i >= 0 && t[i] ? t[i] : null; }
    function playing(){ var b = $('play-btn'); return !!(b && b.classList.contains('is-playing')); }
    function fmt(s){ s = Math.max(0, s || 0); var m = Math.floor(s / 60), x = Math.floor(s % 60); return m + ':' + (x < 10 ? '0' : '') + x; }
    function fire(el, ev){ el.dispatchEvent(new Event(ev, { bubbles: true })); }
    function visible(el){ return getComputedStyle(el).display !== 'none' && !el.hidden; }
    // The quick-bar pills as the player shows them right now (same items, same order).
    function quickPills(){
      var row = $('extra-transport'); if (!row) return [];
      return [].slice.call(row.children).filter(visible).map(function(w){
        var name = w.getAttribute('data-item-wrapper') || w.id;
        var btns = w.matches('button') ? [w] : [].slice.call(w.querySelectorAll(':scope > button'));
        var dd = w.matches('button') ? null : [].slice.call(w.children).filter(function(c){ return c.tagName !== 'BUTTON'; })[0] || null;
        return { name: name, w: w, btns: btns, dd: dd };
      });
    }
    function isOn(b){ return b.classList.contains('active') || b.classList.contains('toggled') || b.classList.contains('selected') || b.getAttribute('aria-pressed') === 'true'; }
    function labelFor(el){
      var l = el.closest('label'); if (l) return l.textContent.trim();
      if (el.id){ var f = document.querySelector('label[for="' + el.id + '"]'); if (f) return f.textContent.trim(); }
      var prev = el.previousElementSibling;
      while (prev && !prev.textContent.trim()) prev = prev.previousElementSibling;
      if (prev && prev.tagName !== 'BUTTON' && prev.textContent.trim().length < 40) return prev.textContent.trim();
      var row = el.parentElement && el.parentElement.previousElementSibling;
      if (row && row.textContent.trim().length < 40) return row.textContent.trim().replace(/\s+\S+$/, '') || row.textContent.trim();
      return el.getAttribute('aria-label') || el.title || '';
    }
    // Build a compact copy of a dropdown: its sliders, toggles, number fields and option buttons, nothing else.
    function buildSub(dd){
      sub.innerHTML = '';
      var group = null, groupKey = null;
      [].slice.call(dd.querySelectorAll('input, select, button')).forEach(function(el){
        if (!visible(el) && el.type !== 'checkbox') return;
        if (el.type === 'checkbox' && el.closest('label') && !visible(el.closest('label'))) return;
        if (el.tagName === 'BUTTON'){
          var key = Object.keys(el.dataset).filter(function(k){ return k !== 'reqLevel'; })[0] || 'solo';
          if (!group || key !== groupKey || key === 'solo' && group.dataset.solo !== '1'){
            group = document.createElement('div'); group.className = 'np-chips'; if (key === 'solo') group.dataset.solo = '1'; sub.appendChild(group); groupKey = key;
          }
          var c = document.createElement('button'); c.type = 'button'; c.className = 'np-chip';
          c._src = el; c._label = function(){   // a bare On/Off (like EQ power) gets its name: "EQ: Off"
            var t = el.textContent.trim().replace(/\s+/g, ' ');
            if (/^(on|off)$/i.test(t)){
              var nm = (el.getAttribute('aria-label') || el.title || 'Power').replace(/^(turn|toggle)\s+/i, '').replace(/\s+on(\s*\/\s*|\s+or\s+)off\b.*$/i, '').split(/[,(]/)[0].trim();
              return nm.charAt(0).toUpperCase() + nm.slice(1) + ': ' + t;
            }
            return t || el.title || '•';
          };
          c.textContent = c._label();
          c.addEventListener('click', function(){ el.click(); setTimeout(syncSub, 40); });
          group.appendChild(c); return;
        }
        group = null;
        var row = document.createElement('div'); row.className = 'np-row';
        var name = document.createElement('span'); name.textContent = labelFor(el) || el.id; row.appendChild(name);
        var m;
        if (el.type === 'range'){
          m = document.createElement('input'); m.type = 'range'; m.min = el.min; m.max = el.max; m.step = el.step || 'any';
          m.addEventListener('input', function(){ el.value = m.value; fire(el, 'input'); paint(m); v.textContent = el.value; });
          m.addEventListener('change', function(){ el.value = m.value; fire(el, 'change'); });
          var v = document.createElement('span'); v.className = 'v'; row.appendChild(m); row.appendChild(v); m._v = v;
        } else if (el.type === 'checkbox'){
          m = document.createElement('button'); m.type = 'button'; m.className = 'np-chip'; m.textContent = el.checked ? 'On' : 'Off';
          m.addEventListener('click', function(){ el.click(); setTimeout(syncSub, 40); });
          row.style.justifyContent = 'space-between'; row.appendChild(m);
        } else if (el.type === 'number'){
          m = document.createElement('input'); m.type = 'number'; m.min = el.min; m.max = el.max; m.step = el.step || 'any';
          m.addEventListener('change', function(){ el.value = m.value; fire(el, 'input'); fire(el, 'change'); });
          row.appendChild(m);
        } else if (el.tagName === 'SELECT'){
          m = document.createElement('select'); m.innerHTML = el.innerHTML; m.className = 'np-chip';
          m.addEventListener('change', function(){ el.value = m.value; fire(el, 'change'); });
          row.appendChild(m);
        } else return;
        m._src = el; sub.appendChild(row);
      });
      syncSub();
    }
    function syncSub(){
      if (!sub) return;
      [].slice.call(sub.querySelectorAll('.np-chip, input, select')).forEach(function(m){
        var el = m._src; if (!el) return;
        if (m.tagName === 'BUTTON' && el.tagName === 'BUTTON'){ if (m._label){ var lt = m._label(); if (m.textContent !== lt) m.textContent = lt; } m.classList.toggle('on', isOn(el)); m.disabled = el.disabled; m.classList.toggle('lock', el.classList.contains('locked')); }
        else if (el.type === 'checkbox'){ m.textContent = el.checked ? 'On' : 'Off'; m.classList.toggle('on', el.checked); m.disabled = el.disabled; }
        else if (el.type === 'range' && document.activeElement !== m){ m.value = el.value; paint(m); if (m._v) m._v.textContent = el.value; }
        else if ((el.type === 'number' || el.tagName === 'SELECT') && document.activeElement !== m) m.value = el.value;
      });
    }
    // Big tools: show the player over the game (the game stays loaded) with a "Back to game" button.
    function showPlayerFor(btn){
      close();
      host.style.visibility = 'hidden'; document.body.classList.remove('pp-gaming');
      peek = document.createElement('button'); peek.id = 'ppg-back'; peek.type = 'button'; peek.textContent = '‹ Back to game';
      peek.addEventListener('click', endPeek); document.body.appendChild(peek);
      setTimeout(function(){ btn.click(); }, 30);
    }
    function endPeek(){ if (peek){ peek.remove(); peek = null; } if (host){ host.style.visibility = ''; if (host.classList.contains('open')) document.body.classList.add('pp-gaming'); } }
    function renderPills(){
      var box = card.querySelector('.np-pills'), items = quickPills();
      var sig = items.map(function(it){ return it.name; }).join(',');
      if (box.dataset.sig !== sig){
        box.dataset.sig = sig; box.innerHTML = '';
        items.forEach(function(it){
          it.btns.forEach(function(src, k){
            var b = document.createElement('button'); b.type = 'button'; b.className = 'np-pill'; b._it = it; b._src = src; b._k = k;
            b.addEventListener('click', function(){
              if (it.dd && k === 0){
                if (openPill === it.name){ openPill = null; sub.innerHTML = ''; }
                else { openPill = it.name; buildSub(it.dd); }
              } else if (BIG[it.name]) showPlayerFor(src);
              else src.click();
              setTimeout(refresh, 60);
            });
            box.appendChild(b);
          });
        });
        if (openPill && !items.some(function(it){ return it.name === openPill; })){ openPill = null; sub.innerHTML = ''; }
      }
      [].slice.call(box.children).forEach(function(b){
        var src = b._src, ic = src.querySelector('svg');
        var txt = src.textContent.trim().replace(/\s+/g, ' ') || src.title || b._it.name;
        var looping = src.id === 'ab-loop-btn' && /^Looping/.test(src.title || '');
        if (src.id === 'ab-loop-btn' && /point B/.test(src.title || '')) txt = 'A…';   // A set, waiting for B
        var html = (ic ? ic.outerHTML : '') + '<span>' + txt + '</span>';
        if (b._html !== html){ b._html = html; b.innerHTML = html; }
        b.classList.toggle('on', isOn(src) || looping);
        b.classList.toggle('open', openPill === b._it.name && b._k === 0);
      });
    }
    function build(){
      card = document.createElement('div'); card.id = 'ppg-np'; card.setAttribute('role', 'dialog'); card.setAttribute('aria-label', 'Now playing');
      card.innerHTML =
        '<div class="np-top"><div class="np-side"><div class="np-art"></div><div class="np-nat">' +
            '<button type="button" data-a="shuf" aria-label="Shuffle"></button><button type="button" data-a="rep" aria-label="Repeat"></button></div></div>' +
          '<div class="np-main">' +
            '<div><div class="np-t"></div><div class="np-a"></div></div>' +
            '<div class="np-seek"><span class="np-c">0:00</span><input type="range" min="0" max="100" step="0.1" value="0" aria-label="Seek"><span class="np-d">0:00</span></div>' +
            '<div class="np-ctl"><button type="button" class="sk" data-a="prev" aria-label="Previous">' + I.prev + '</button>' +
              '<button type="button" class="pp" data-a="play" aria-label="Play or pause"></button>' +
              '<button type="button" class="sk" data-a="next" aria-label="Next">' + I.next + '</button></div>' +
          '</div></div>' +
        '<div class="np-pills"></div><div class="np-sub"></div>';
      sub = card.querySelector('.np-sub');
      // the natural buttons reuse the player's own icons
      var sh = $('shuffle-btn'), rp = $('repeat-btn');
      card.querySelector('[data-a="shuf"]').innerHTML = sh && sh.querySelector('svg') ? sh.querySelector('svg').outerHTML : 'S';
      card.querySelector('[data-a="rep"]').innerHTML = (rp && rp.querySelector('svg') ? rp.querySelector('svg').outerHTML : 'R') + '<span class="one"></span>';
      card.addEventListener('click', function(e){
        var b = e.target.closest('[data-a]'); if (!b) return;
        var a = b.getAttribute('data-a');
        var map = { prev: 'prev-btn', next: 'next-btn', play: 'play-btn', shuf: 'shuffle-btn', rep: 'repeat-btn' };
        if (map[a] && $(map[a])) $(map[a]).click();
        setTimeout(refresh, 60);
      });
      var r = card.querySelector('.np-seek input');
      r.addEventListener('input', function(){ dragging = true; card.querySelector('.np-c').textContent = fmt(+r.value); paint(r); });
      r.addEventListener('change', function(){
        var s = $('seek'); if (s){ s.value = r.value; fire(s, 'input'); fire(s, 'change'); }
        dragging = false; setTimeout(refresh, 80);
      });
      host.appendChild(card);
    }
    function paint(r){ var lo = +r.min || 0, mx = (+r.max || 1) - lo; r.style.setProperty('--p', Math.max(0, Math.min(100, ((+r.value - lo) / (mx || 1)) * 100)) + '%'); }
    function refresh(){
      if (card && !card.isConnected){ clearInterval(timer); card = null; return; }
      var p = playing();
      if (mini){ mini.classList.toggle('playing', p); }
      if (!card || card.style.display === 'none') return;
      var t = cur();
      card.querySelector('.np-t').textContent = t ? (t.title || 'Untitled') : 'Nothing playing';
      card.querySelector('.np-a').textContent = t ? (t.artist && t.artist !== '-' ? t.artist : (t.kind === 'video' ? 'Video' : 'Press Play')) : 'Pick a song from your library';
      var art = card.querySelector('.np-art'), src = t && window.__ppThumbSrc ? window.__ppThumbSrc(t) : null;
      if (art.dataset.src !== (src || '')){ art.dataset.src = src || ''; art.style.backgroundImage = src ? 'url("' + src.replace(/"/g, '%22') + '")' : ''; art.innerHTML = src ? '' : I.note; }
      card.querySelector('.pp').innerHTML = p ? I.pause : I.play;
      var s = $('seek'), r = card.querySelector('.np-seek input');
      if (s && !dragging){ r.max = s.max || 100; r.value = s.value || 0; paint(r); card.querySelector('.np-c').textContent = fmt(+s.value); card.querySelector('.np-d').textContent = fmt(+s.max); }
      var sh = $('shuffle-btn'), rp = $('repeat-btn');
      card.querySelector('[data-a="shuf"]').classList.toggle('on', !!(sh && sh.classList.contains('toggled')));
      card.querySelector('[data-a="rep"]').classList.toggle('on', !!(rp && rp.classList.contains('toggled')));
      card.querySelector('[data-a="rep"] .one').textContent = rp && rp.classList.contains('repeat-one') ? '1' : '';
      renderPills(); syncSub();
    }
    function open(){ if (!host) return; if (!card) build(); card.style.display = ''; mini.classList.add('on'); refresh(); clearInterval(timer); timer = setInterval(refresh, 250); }
    function close(){
      if (card) card.style.display = 'none'; if (mini) mini.classList.remove('on');
      clearInterval(timer); timer = setInterval(function(){ if (!mini || !mini.isConnected){ clearInterval(timer); return; } mini.classList.toggle('playing', playing()); }, 1000);
    }
    function isOpen(){ return !!(card && card.style.display !== 'none'); }
    // a tap anywhere else (the game frame takes focus, so the app window blurs) closes it
    document.addEventListener('pointerdown', function(e){ if (isOpen() && !card.contains(e.target) && !mini.contains(e.target)) close(); }, true);
    window.addEventListener('blur', function(){ if (isOpen()) close(); });
    return {
      attach: function(bar, view){
        endPeek(); host = view; card = null; sub = null; openPill = null; clearInterval(timer);
        mini = document.createElement('button'); mini.type = 'button'; mini.className = 'ppg-mini'; mini.setAttribute('aria-label', 'Now playing');
        mini.innerHTML = '<span class="eq"><i></i><i></i><i></i></span>';
        mini.addEventListener('click', function(){ isOpen() ? close() : open(); });
        bar.appendChild(mini);
        close();
      },
      endPeek: endPeek
    };
  })();

  function openGame(id){
    var g = GAMES.filter(function(x){ return x.id === id; })[0];
    if (!g || current) return;
    current = g;
    view.innerHTML = '';
    var load = document.createElement('div');
    load.className = 'ppg-load';
    load.style.backgroundColor = g.bg;
    var info = '<div class="ppg-lart">' + artHTML(g) + '</div><div class="ppg-lname">' + esc(g.name) + '</div><div class="ppg-bar"></div>';
    if (g.loading && g.loadCenter) {
      load.style.backgroundImage = 'url(' + g.loading + ')';
      load.innerHTML = info;
    } else if (g.loading) {
      // a scene from the game, shown whole (portrait or landscape) over a blurred copy of itself
      load.classList.add('scene');
      load.innerHTML = '<div class="ppg-lbg" style="background-image:url(' + g.loading + ')"></div>' +
        '<div class="ppg-limg" style="background-image:url(' + g.loading + ')"></div><div class="ppg-linfo">' + info + '</div>';
    } else load.innerHTML = info;
    var bar = document.createElement('div');
    bar.className = 'ppg-topbar';
    bar.innerHTML = '<button type="button" class="ppg-exit" aria-label="Exit game">' + X + 'Exit</button><div class="ppg-tname">' + esc(g.name) + '</div>';
    bar.querySelector('.ppg-exit').addEventListener('click', closeGame);
    if (window.__ppNowCard) window.__ppNowCard.attach(bar, view);
    // src is set before the frame joins the page, so loading it adds no Back step
    frame = document.createElement('iframe');
    frame.src = g.src;
    frame.setAttribute('allow', 'fullscreen; autoplay; camera');
    var started = Date.now();
    frame.addEventListener('load', function(){
      syncGameMusic();
      setTimeout(function(){ load.classList.add('done'); }, Math.max(0, 700 - (Date.now() - started)));
    });
    view.appendChild(frame); view.appendChild(load); view.appendChild(bar);
    view.classList.add('open');
    document.body.classList.add('pp-gaming');
    if (window.__ppHub) window.__ppHub.sessionStart(g.id);
    slowApp(true);
    gameMode(true);
    var pb = document.getElementById('play-btn');
    if (g.ownMusic && pb){ playObs = new MutationObserver(syncGameMusic); playObs.observe(pb, { attributes:true, attributeFilter:['class'] }); }
    try { history.pushState({ ppGame:id }, ''); } catch(e){}
  }
  function hideGame(){
    if (!current) return;
    if (window.__ppNowCard) window.__ppNowCard.endPeek();
    if (playObs){ playObs.disconnect(); playObs = null; }
    if (window.__ppHub) window.__ppHub.sessionEnd();
    view.classList.remove('open');
    view.innerHTML = '';   // unloads the game and its sound
    frame = null; current = null;
    document.body.classList.remove('pp-gaming');
    slowApp(false);
    gameMode(false);
  }
  function closeGame(){
    if (history.state && history.state.ppGame) history.back(); else hideGame();
  }

  window.addEventListener('popstate', function(){
    var st = history.state || {};
    if (current && !st.ppGame) hideGame();
    if (grid.classList.contains('open') && !st.ppGames && !st.ppGame && !st.ppHub) hideGrid();
  });
  document.addEventListener('keydown', function(e){
    if (e.key !== 'Escape') return;
    if (current) closeGame(); else if (grid.classList.contains('open')) closeGrid();
  });

  // ---- slow the app's own animation loops while a game runs ----
  // The game frame has its own requestAnimationFrame and is not affected.
  var realRAF = window.requestAnimationFrame.bind(window), realCAF = window.cancelAnimationFrame.bind(window);
  var slow = false, queue = new Map(), nextId = 1e9, timer = null;
  function flush(){
    timer = null;
    var cbs = Array.from(queue.values()); queue.clear();
    var t = performance.now();
    cbs.forEach(function(cb){ try { cb(t); } catch(err){ setTimeout(function(){ throw err; }); } });
  }
  window.requestAnimationFrame = function(cb){
    if (!slow) return realRAF(cb);
    var id = ++nextId; queue.set(id, cb);
    if (!timer) timer = setTimeout(flush, 250);
    return id;
  };
  window.cancelAnimationFrame = function(id){ if (!queue.delete(id)) realCAF(id); };
  function slowApp(on){
    slow = on;
    if (!on && queue.size){ if (timer){ clearTimeout(timer); timer = null; } realRAF(flush); }
  }
})();
