(function(){
  // The queue board.
  //  - Swipe up on the mini player: it flips over and shows what plays next ("Up next").
  //  - Tap the flipped side (or swipe up again): the board grows up out of the mini player.
  //  - The board's pages swipe sideways: the live queue first, then saved queues, then presets.
  //  - The live page is one list: songs you picked and the songs that follow from where you were playing,
  //    in play order. Every song can be dragged anywhere (the grip, or a long-press on the row).
  //  - Lists in the queue widgets drag the same way (see Sortable below).
  // Playback itself (what plays next, picked songs) lives in main (window.__ppQueue).
  var Q = function(){ return window.__ppQueue; };
  var A = function(){ return window.__ppApi; };
  var SAVES_KEY = 'ppQueueSaves';
  var LIST_MAX = 120;            // rows drawn per list; the rest is counted
  var reduce = function(){ return !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches); };

  function esc(s){ return String(s == null ? '' : s).replace(/[&<>"']/g, function(c){ return { '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]; }); }
  function toast(m){ try { if (window.ppToast) window.ppToast(m); } catch(e){} }
  function tracks(){ var a = A(); return a ? a.tracks() : []; }
  function thumb(t){ try { return t && window.__ppThumbSrc ? window.__ppThumbSrc(t) : (t && t.artUrl) || null; } catch(e){ return null; } }
  function buzz(){ try { if (navigator.vibrate) navigator.vibrate(10); } catch(e){} }
  var SVG = function(d, fill){ return '<svg viewBox="0 0 24 24" fill="' + (fill ? 'currentColor' : 'none') + '" stroke="' + (fill ? 'none' : 'currentColor') + '" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + d + '</svg>'; };
  var I = {
    queue: SVG('<path d="M4 6h12M4 12h12M4 18h7"/><path d="M16 15l5 3-5 3z" fill="currentColor"/>'),
    up: SVG('<path d="M6 15l6-6 6 6"/>'),
    x: SVG('<path d="M6 6l12 12M18 6L6 18"/>'),
    grip: SVG('<circle cx="9" cy="6" r="1.4"/><circle cx="15" cy="6" r="1.4"/><circle cx="9" cy="12" r="1.4"/><circle cx="15" cy="12" r="1.4"/><circle cx="9" cy="18" r="1.4"/><circle cx="15" cy="18" r="1.4"/>', true),
    note: SVG('<path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>'),
    plus: SVG('<path d="M12 5v14M5 12h14"/>'),
    play: SVG('<path d="M7 4.5v15l13-7.5z"/>', true),
    save: SVG('<path d="M6 3h12v18l-6-4-6 4z"/>'),
    shuffle: SVG('<path d="M16 3h5v5M4 20L21 3M21 16v5h-5M15 15l6 6M4 4l5 5"/>'),
    clock: SVG('<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>'),
    fire: SVG('<path d="M12 3c1 4 5 5 5 10a5 5 0 01-10 0c0-2 1-3 2-4 0 2 1 3 2 3 0-3-1-6 1-9z"/>'),
    film: SVG('<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 9h18M3 15h18M8 5v14M16 5v14"/>'),
    pen: SVG('<path d="M12 20h9M16.5 3.5a2.1 2.1 0 013 3L7 19l-4 1 1-4z"/>'),
    trash: SVG('<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>'),
    search: SVG('<circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/>'),
    check: SVG('<path d="M5 12l5 5 9-10"/>')
  };

  // ---------- Saved queues ----------
  function loadSaves(){ try { var s = JSON.parse(localStorage.getItem(SAVES_KEY) || '[]'); return Array.isArray(s) ? s.filter(function(x){ return x && Array.isArray(x.ids); }) : []; } catch(e){ return []; } }
  function storeSaves(list){ try { localStorage.setItem(SAVES_KEY, JSON.stringify(list)); } catch(e){ toast('Could not save the queue'); } }
  function idxsOf(ids){
    var at = new Map(); tracks().forEach(function(t, i){ at.set(t.dbId, i); });
    return ids.filter(function(id){ return at.has(id); }).map(function(id){ return at.get(id); });
  }

  // ---------- Presets (made fresh each time the board opens) ----------
  function playable(){ var out = []; tracks().forEach(function(t, i){ if (!t.stem) out.push(i); }); return out; }
  function presets(){
    var t = tracks(), all = playable(), plays = {};
    try { plays = (JSON.parse(localStorage.getItem('pppSaveV1')) || {}).trackPlays || {}; } catch(e){}
    var songs = all.filter(function(i){ return t[i].kind !== 'video'; });
    var mix = songs.slice();
    for (var k = mix.length - 1; k > 0; k--){ var j = Math.floor(Math.random() * (k + 1)); var x = mix[k]; mix[k] = mix[j]; mix[j] = x; }
    var most = all.filter(function(i){ return plays[t[i].dbId] && plays[t[i].dbId].count; })
      .sort(function(a, b){ return plays[t[b].dbId].count - plays[t[a].dbId].count; }).slice(0, 100);
    return [
      { id:'p-mix', kind:'preset', name:'Shuffle everything', icon:I.shuffle, sub:'All your songs, mixed', idxs:mix, empty:'No songs in your library yet.' },
      { id:'p-new', kind:'preset', name:'Recently added', icon:I.clock, sub:'Newest first', idxs:all.slice().reverse().slice(0, 100), empty:'Nothing added yet.' },
      { id:'p-most', kind:'preset', name:'Most played', icon:I.fire, sub:'What you come back to', idxs:most, empty:'Play a few things and your favourites show up here.' },
      { id:'p-vid', kind:'preset', name:'Videos', icon:I.film, sub:'Every video, in library order', idxs:all.filter(function(i){ return t[i].kind === 'video'; }), empty:'No videos in your library yet.' }
    ];
  }

  // ---------- Sortable: drag any row of any queue list ----------
  // A list is an element with data-pq-sort ("live", "save:<id>" or "preset:<id>"; data-pq-axis="x" for a sideways
  // row). Its rows are the children with data-pq-row. A row drags at once from its .pq-grip, or after a
  // long-press anywhere on it. Dropping calls the list's owner: the live queue moves the song in playback.
  var Sortable = (function(){
    var LONG = 360, drag = null, pend = null, suppressUntil = 0;
    function rowsOf(list){ return [].slice.call(list.children).filter(function(el){ return el.hasAttribute('data-pq-row'); }); }
    function scroller(el, axis){
      for (var n = el.parentElement; n && n !== document.body; n = n.parentElement){
        var cs = getComputedStyle(n), o = axis === 'x' ? cs.overflowX : cs.overflowY;
        if ((o === 'auto' || o === 'scroll') && (axis === 'x' ? n.scrollWidth > n.clientWidth : n.scrollHeight > n.clientHeight)) return n;
      }
      return document.scrollingElement || document.documentElement;
    }
    function begin(row, list, e){
      var rows = rowsOf(list), from = rows.indexOf(row); if (from < 0) return;
      var axis = list.dataset.pqAxis === 'x' ? 'x' : 'y';
      var r0 = rows[0].getBoundingClientRect(), r1 = rows[1] ? rows[1].getBoundingClientRect() : null, rr = row.getBoundingClientRect();
      var step = r1 ? (axis === 'x' ? r1.left - r0.left : r1.top - r0.top) : (axis === 'x' ? rr.width : rr.height);
      drag = { row: row, list: list, rows: rows, from: from, to: from, axis: axis, step: step || 1, p0: axis === 'x' ? e.clientX : e.clientY, id: e.pointerId, sc: scroller(list, axis), auto: 0, last: e };
      row.classList.add('pq-dragging'); list.classList.add('pq-sorting');
      document.body.classList.add('pq-drag-on');
      buzz();
      autoScroll();
    }
    function move(e){
      var d = drag; if (!d) return;
      d.last = e;
      var delta = (d.axis === 'x' ? e.clientX : e.clientY) - d.p0 + d.scrolled();
      d.row.style.transform = d.axis === 'x' ? 'translateX(' + delta + 'px) scale(1.04)' : 'translateY(' + delta + 'px) scale(1.02)';
      var to = Math.max(0, Math.min(d.rows.length - 1, d.from + Math.round(delta / d.step)));
      if (to === d.to) return;
      d.to = to;
      d.rows.forEach(function(el, k){
        if (el === d.row) return;
        var s = (d.from < to && k > d.from && k <= to) ? -d.step : (d.from > to && k >= to && k < d.from) ? d.step : 0;
        el.style.transform = s ? (d.axis === 'x' ? 'translateX(' : 'translateY(') + s + 'px)' : '';
      });
      try { if (navigator.vibrate) navigator.vibrate(4); } catch(err){}
    }
    function autoScroll(){
      var d = drag; if (!d) return;
      var sc = d.sc, start = d.axis === 'x' ? sc.scrollLeft : sc.scrollTop;
      d.scrolled = function(){ return (d.axis === 'x' ? sc.scrollLeft : sc.scrollTop) - start; };
      (function loop(){
        if (drag !== d) return;
        var e = d.last, r = sc === document.scrollingElement || sc === document.documentElement ? { top: 0, bottom: innerHeight, left: 0, right: innerWidth } : sc.getBoundingClientRect();
        var p = d.axis === 'x' ? e.clientX : e.clientY, lo = d.axis === 'x' ? r.left : r.top, hi = d.axis === 'x' ? r.right : r.bottom, v = 0;
        if (p < lo + 50) v = -Math.ceil((lo + 50 - p) / 6); else if (p > hi - 50) v = Math.ceil((p - hi + 50) / 6);
        if (v){ if (d.axis === 'x') sc.scrollLeft += v; else sc.scrollTop += v; move(e); }
        requestAnimationFrame(loop);
      })();
    }
    function finish(cancel){
      var d = drag; if (!d) return; drag = null;
      d.rows.forEach(function(el){ el.style.transform = ''; });
      d.row.classList.remove('pq-dragging'); d.list.classList.remove('pq-sorting');
      document.body.classList.remove('pq-drag-on');
      suppressUntil = performance.now() + 400;
      if (!cancel && d.to !== d.from) dropped(d.list, d.from, d.to, d.rows.length);
    }
    document.addEventListener('pointerdown', function(e){
      if (drag || (e.pointerType === 'mouse' && e.button !== 0)) return;
      var row = e.target.closest && e.target.closest('[data-pq-row]'); if (!row) return;
      var list = row.parentElement; if (!list || !list.hasAttribute('data-pq-sort')) return;
      if (document.body.classList.contains('pw-editing') && !list.closest('#pq-root')) return;   // the layout editor moves widgets
      if (rowsOf(list).length < 2) return;
      if (e.target.closest('.pq-grip')){ e.preventDefault(); begin(row, list, e); return; }
      if (e.target.closest('.pq-rm, .pq-pill, .pq-plus, input')) return;
      pend = { row: row, list: list, x: e.clientX, y: e.clientY, id: e.pointerId, ev: e,
        t: setTimeout(function(){ var p = pend; pend = null; if (p && p.row.isConnected) begin(p.row, p.list, p.ev); }, LONG) };
    }, true);
    document.addEventListener('pointermove', function(e){
      if (pend && e.pointerId === pend.id){
        pend.ev = e;
        if (Math.hypot(e.clientX - pend.x, e.clientY - pend.y) > 9){ clearTimeout(pend.t); pend = null; }
        return;
      }
      if (drag && e.pointerId === drag.id) move(e);
    }, true);
    function up(e){
      if (pend && e.pointerId === pend.id){ clearTimeout(pend.t); pend = null; }
      if (drag && e.pointerId === drag.id) finish(e.type === 'pointercancel');
    }
    document.addEventListener('pointerup', up, true);
    document.addEventListener('pointercancel', up, true);
    // While dragging by long-press, the page must not scroll under the finger.
    document.addEventListener('touchmove', function(e){ if (drag) e.preventDefault(); }, { passive: false, capture: true });
    // The tap that ends a drag must not also play the song.
    document.addEventListener('click', function(e){ if (performance.now() < suppressUntil && e.target.closest && e.target.closest('[data-pq-sort]')){ e.stopImmediatePropagation(); e.preventDefault(); } }, true);
    document.addEventListener('contextmenu', function(e){ if (e.target.closest && e.target.closest('[data-pq-sort] [data-pq-row]')) e.preventDefault(); }, true);
    return { active: function(){ return !!drag; } };
  })();
  function dropped(list, from, to, n){
    var key = list.dataset.pqSort || '';
    if (key === 'live'){ var q = Q(); if (q) q.moveAt(from, to, n); return; }
    if (key.indexOf('save:') === 0){
      var id = key.slice(5), saves = loadSaves(), s = saves.find(function(x){ return x.id === id; }); if (!s) return;
      var t = tracks(), ids = idxsOf(s.ids).map(function(i){ return t[i].dbId; });   // songs no longer in the library drop out
      var m = ids.splice(from, 1)[0]; ids.splice(to, 0, m);
      s.ids = ids; storeSaves(saves); render(true); return;
    }
    if (key.indexOf('preset:') === 0 && presetCache){
      var p = presetCache.find(function(x){ return x.id === key.slice(7); }); if (!p) return;
      var v = p.idxs.splice(from, 1)[0]; p.idxs.splice(to, 0, v); render(true);
    }
  }

  // ---------- The flipped mini player ----------
  var mini = document.getElementById('pl-mini');
  var flippedOn = false, flipBusy = false;
  var back = document.createElement('div');
  back.id = 'pq-back';
  back.setAttribute('aria-hidden', 'true');
  back.innerHTML = '<div class="pq-b-art"></div><div class="pq-b-text"><div class="pq-b-lbl">Up next</div><div class="pq-b-title"></div></div>' +
    '<span class="pq-b-more"></span><span class="pq-b-open">' + I.up + '</span>';
  if (mini) mini.appendChild(back);

  function syncBack(){
    if (!mini) return;
    var q = Q(), s = q ? q.state(400) : null, t = tracks(), first = s && s.up[0] ? t[s.up[0].i] : null, more = s ? Math.max(0, s.up.length - 1) : 0;
    var art = back.querySelector('.pq-b-art'), title = back.querySelector('.pq-b-title'), moreEl = back.querySelector('.pq-b-more');
    if (s && s.repeat === 2 && !(s.up[0] && s.up[0].k != null)) title.textContent = 'This song again (repeat one)';
    else title.innerHTML = first ? '<b>' + esc(first.title || 'Untitled') + '</b>' + (first.artist ? '<span> · ' + esc(first.artist) + '</span>' : '') : '<span>Nothing after this. Tap to add songs</span>';
    var src = first ? thumb(first) : null;
    art.innerHTML = src ? '<img alt="" src="' + esc(src) + '">' : I.note;
    moreEl.textContent = more ? '+' + more : '';
    moreEl.hidden = !more;
    mini.setAttribute('aria-label', flippedOn ? 'Open the queue' : 'Open player');
  }
  function flip(on){
    if (!mini || flipBusy || on === flippedOn) return;
    var swap = function(){ flippedOn = on; mini.classList.toggle('pq-flipped', on); back.setAttribute('aria-hidden', on ? 'false' : 'true'); syncBack(); };
    if (reduce() || !mini.animate){ swap(); return; }
    flipBusy = true;
    var dir = on ? 1 : -1;
    var a = mini.animate([{ transform:'perspective(700px) rotateX(0deg)' }, { transform:'perspective(700px) rotateX(' + (90 * dir) + 'deg)' }], { duration:150, easing:'cubic-bezier(.5,0,1,.6)' });
    a.onfinish = function(){
      swap();
      var b = mini.animate([{ transform:'perspective(700px) rotateX(' + (-90 * dir) + 'deg)' }, { transform:'perspective(700px) rotateX(' + (8 * dir) + 'deg)', offset:.75 }, { transform:'perspective(700px) rotateX(0deg)' }], { duration:300, easing:'cubic-bezier(0,.4,.4,1)' });
      b.onfinish = b.oncancel = function(){ flipBusy = false; };
    };
    a.oncancel = function(){ swap(); flipBusy = false; };
    buzz();
  }
  if (mini){
    // On the flipped side a tap opens the board instead of the player (capture: runs before the player's own tap).
    mini.addEventListener('click', function(e){
      if (!flippedOn) return;
      e.stopImmediatePropagation(); e.preventDefault();
      open();
    }, true);
    mini.addEventListener('keydown', function(e){ if (flippedOn && (e.key === 'Enter' || e.key === ' ') && e.target === mini){ e.preventDefault(); e.stopImmediatePropagation(); open(); } }, true);
  }

  // ---------- The board ----------
  var root = document.createElement('div');
  root.id = 'pq-root';
  root.hidden = true;
  root.innerHTML =
    '<div class="pq-scrim"></div>' +
    '<section class="pq-panel" role="dialog" aria-modal="true" aria-label="Queue">' +
      '<div class="pq-grab" aria-hidden="true"><i></i></div>' +
      '<header class="pq-head"><div class="pq-titles"><div class="pq-kicker">Queue</div><div class="pq-title">Now playing</div></div>' +
        '<button type="button" class="pq-iconbtn pq-close" aria-label="Close the queue">' + I.x + '</button></header>' +
      '<nav class="pq-chips no-swipe" aria-label="Queues"></nav>' +
      '<div class="pq-pager no-swipe"></div>' +
      '<div class="pq-add" hidden>' +
        '<div class="pq-add-head"><label class="pq-search">' + I.search + '<input type="search" placeholder="Search your library" aria-label="Search your library" enterkeyhint="search"></label>' +
        '<button type="button" class="pq-btn pq-add-done">Done</button></div>' +
        '<div class="pq-add-list" role="list"></div>' +
      '</div>' +
    '</section>';
  document.body.appendChild(root);
  var panel = root.querySelector('.pq-panel'), pager = root.querySelector('.pq-pager'), chips = root.querySelector('.pq-chips');
  var titleEl = root.querySelector('.pq-title'), kickerEl = root.querySelector('.pq-kicker');
  var addBox = root.querySelector('.pq-add'), addInput = addBox.querySelector('input'), addList = addBox.querySelector('.pq-add-list');

  var pages = [], pageIdx = 0, isOpen = false, presetCache = null, editing = null;   // editing: {kind:'save'|'rename', page, id, value}

  function buildPages(){
    var saves = loadSaves();
    if (!presetCache) presetCache = presets();
    pages = [{ id:'live', kind:'live', name:'Now playing' }]
      .concat(saves.map(function(s){ return { id:'s-' + s.id, kind:'save', save:s, name:s.name, icon:I.save }; }))
      .concat(presetCache);
  }

  // opts: pos (place in the list), act (tap), remove (x action), picked (added by you)
  function rowHtml(i, opts){
    var t = tracks()[i]; if (!t) return '';
    var src = thumb(t);
    return '<div class="pq-row' + (opts.picked ? ' pq-picked' : '') + '" role="listitem" data-pq-row data-i="' + i + '" data-pos="' + opts.pos + '">' +
      '<span class="pq-grip" aria-hidden="true">' + I.grip + '</span>' +
      '<span class="pq-art">' + (src ? '<img alt="" loading="lazy" draggable="false" src="' + esc(src) + '">' : I.note) + '</span>' +
      '<button type="button" class="pq-main" data-act="' + opts.act + '"><span class="pq-t">' + esc(t.title || 'Untitled') + '</span><span class="pq-a">' +
        (opts.picked ? '<em>Added by you</em> · ' : '') + esc(t.artist || (t.kind === 'video' ? 'Video' : 'Unknown artist')) + '</span></button>' +
      (opts.remove ? '<button type="button" class="pq-iconbtn pq-rm" data-act="' + opts.remove + '" aria-label="Remove ' + esc(t.title || 'song') + ' from the queue">' + I.x + '</button>' : '') +
    '</div>';
  }
  function moreHtml(n){ return n > 0 ? '<div class="pq-more">and ' + n + ' more</div>' : ''; }

  function livePage(){
    var q = Q(), s = q ? q.state(LIST_MAX + 400) : { cur:-1, up:[], picked:0 }, t = tracks(), h = '';
    var cur = s.cur >= 0 ? t[s.cur] : null;
    if (cur){
      var src = thumb(cur);
      h += '<div class="pq-now"><span class="pq-art pq-art-big">' + (src ? '<img alt="" src="' + esc(src) + '">' : I.note) + '</span>' +
        '<div class="pq-now-text"><div class="pq-lbl">' + (s.playing ? '<span class="pq-eq" aria-hidden="true"><i></i><i></i><i></i></span>Playing' : 'Paused') + (s.playingQueued ? ' · picked by you' : '') + '</div>' +
        '<div class="pq-t">' + esc(cur.title || 'Untitled') + '</div><div class="pq-a">' + esc(cur.artist || '') + '</div></div></div>';
    } else {
      h += '<div class="pq-empty">Nothing is playing. Add songs below and they start straight away.</div>';
    }
    var how = s.repeat === 2 ? 'repeat one is on' : s.shuffle ? 'shuffled' : s.repeat === 1 ? 'repeats' : '';
    h += '<div class="pq-sec"><div class="pq-sec-h"><span>Up next</span><small>' + esc([s.up.length ? s.up.length + (s.up.length >= LIST_MAX + 400 ? '+' : '') + (s.up.length === 1 ? ' song' : ' songs') : '', how].filter(Boolean).join(' · ')) + '</small>' +
      (s.picked ? '<button type="button" class="pq-link" data-act="clear">Clear picked</button>' : '') + '</div>';
    if (s.up.length){
      h += '<div class="pq-list" role="list" data-pq-sort="live">' + s.up.slice(0, LIST_MAX).map(function(e, pos){ return rowHtml(e.i, { pos: pos, act: 'jump', remove: 'rm', picked: e.k != null }); }).join('') + '</div>' + moreHtml(s.up.length - LIST_MAX);
      if (!s.picked) h += '<div class="pq-hint">Drag any song to move it. Long-press songs in Home or the Library and choose Play next or Add to queue, or use Add songs below.</div>';
    } else {
      h += '<div class="pq-hint">' + (cur ? 'Nothing else after this. Playback stops at the end.' : 'Swipe left for saved queues and presets.') + '</div>';
    }
    return h + '</div>';
  }
  function listPage(p){
    var idxs = p.kind === 'save' ? idxsOf(p.save.ids) : p.idxs, h = '';
    var sub = p.kind === 'save' ? (idxs.length + (idxs.length === 1 ? ' song' : ' songs') + (p.save.ts ? ' · saved ' + new Date(p.save.ts).toLocaleDateString() : '')) : p.sub + ' · ' + idxs.length + (idxs.length === 1 ? ' song' : ' songs');
    h += '<div class="pq-sub">' + esc(sub) + '</div>';
    if (!idxs.length) return h + '<div class="pq-empty">' + esc(p.kind === 'save' ? 'None of these songs are in your library any more.' : p.empty) + '</div>';
    var key = p.kind === 'save' ? 'save:' + p.save.id : 'preset:' + p.id;
    // Only fully drawn lists can be dragged: moving a row of a cut-off list would leave the rest behind.
    return h + '<div class="pq-list" role="list"' + (idxs.length <= LIST_MAX ? ' data-pq-sort="' + esc(key) + '"' : '') + '>' + idxs.slice(0, LIST_MAX).map(function(i, k){ return rowHtml(i, { pos: k, act: 'play-from' }); }).join('') + '</div>' + moreHtml(idxs.length - LIST_MAX);
  }
  function footHtml(p){
    if (editing && editing.page === p.id){
      return '<form class="pq-foot pq-name"><input type="text" maxlength="60" aria-label="Queue name" placeholder="Name this queue" value="' + esc(editing.value || '') + '">' +
        '<button type="submit" class="pq-btn pq-btn-main">Save</button><button type="button" class="pq-btn" data-act="cancel-name">Cancel</button></form>';
    }
    if (p.kind === 'live') return '<div class="pq-foot"><button type="button" class="pq-btn pq-btn-main" data-act="add-songs">' + I.plus + 'Add songs</button><button type="button" class="pq-btn" data-act="save-live">' + I.save + 'Save queue</button></div>';
    var f = '<div class="pq-foot"><button type="button" class="pq-btn pq-btn-main" data-act="play-all">' + I.play + 'Play</button><button type="button" class="pq-btn" data-act="queue-all">' + I.plus + 'Add to queue</button>';
    if (p.kind === 'save') f += '<button type="button" class="pq-iconbtn" data-act="rename" aria-label="Rename this queue">' + I.pen + '</button><button type="button" class="pq-iconbtn pq-danger" data-act="delete" aria-label="Delete this queue">' + I.trash + '</button>';
    return f + '</div>';
  }

  function render(keepScroll){
    if (!isOpen) return;
    var scrolls = {};
    if (keepScroll) pager.querySelectorAll('.pq-page').forEach(function(el){ var b = el.querySelector('.pq-body'); if (b) scrolls[el.dataset.id] = b.scrollTop; });
    var curId = pages[pageIdx] && pages[pageIdx].id;
    buildPages();
    var at = pages.findIndex(function(p){ return p.id === curId; });
    pageIdx = at >= 0 ? at : Math.min(pageIdx, pages.length - 1);
    chips.innerHTML = pages.map(function(p, k){
      return '<button type="button" class="pq-chip' + (k === pageIdx ? ' on' : '') + '" data-page="' + k + '" aria-current="' + (k === pageIdx ? 'true' : 'false') + '">' + (p.kind === 'live' ? I.queue : p.icon || '') + '<span>' + esc(p.kind === 'live' ? 'Now' : p.name) + '</span></button>';
    }).join('');
    pager.innerHTML = pages.map(function(p){
      return '<div class="pq-page" data-id="' + esc(p.id) + '" data-kind="' + p.kind + '"><div class="pq-body">' + (p.kind === 'live' ? livePage() : listPage(p)) + '</div>' + footHtml(p) + '</div>';
    }).join('');
    pager.querySelectorAll('.pq-page').forEach(function(el){ var b = el.querySelector('.pq-body'); if (b && scrolls[el.dataset.id]) b.scrollTop = scrolls[el.dataset.id]; });
    setPage(pageIdx, true);
    var nameIn = pager.querySelector('.pq-name input'); if (nameIn){ nameIn.focus(); nameIn.select(); }
  }
  function setTitle(){
    var p = pages[pageIdx]; if (!p) return;
    kickerEl.textContent = p.kind === 'live' ? 'Queue' : p.kind === 'save' ? 'Saved queue' : 'Preset';
    titleEl.textContent = p.kind === 'live' ? 'Now playing' : p.name;
  }
  function setPage(k, instant){
    pageIdx = Math.max(0, Math.min(pages.length - 1, k));
    var w = pager.clientWidth || 1;
    if (instant) pager.scrollLeft = pageIdx * w;
    else pager.scrollTo({ left: pageIdx * w, behavior: reduce() ? 'auto' : 'smooth' });
    chips.querySelectorAll('.pq-chip').forEach(function(c, i){ c.classList.toggle('on', i === pageIdx); c.setAttribute('aria-current', i === pageIdx ? 'true' : 'false'); });
    var on = chips.querySelector('.pq-chip.on');
    if (on){ var cr = chips.getBoundingClientRect(), r = on.getBoundingClientRect(); if (r.left < cr.left + 8 || r.right > cr.right - 8) chips.scrollBy({ left: r.left - cr.left - cr.width / 2 + r.width / 2, behavior: instant || reduce() ? 'auto' : 'smooth' }); }
    setTitle();
  }
  var scrollT = 0;
  pager.addEventListener('scroll', function(){
    clearTimeout(scrollT);
    scrollT = setTimeout(function(){
      var k = Math.round(pager.scrollLeft / (pager.clientWidth || 1));
      if (k !== pageIdx){ if (editing){ editing = null; pageIdx = k; render(true); return; } setPage(k, true); buzz(); }
    }, 90);
  }, { passive: true });
  chips.addEventListener('click', function(e){ var c = e.target.closest('.pq-chip'); if (c) setPage(+c.dataset.page); });

  // ---------- Open / close ----------
  function clipFrom(r, pr, round){ return 'inset(' + Math.max(0, r.top - pr.top) + 'px ' + Math.max(0, pr.right - r.right) + 'px ' + Math.max(0, pr.bottom - r.bottom) + 'px ' + Math.max(0, r.left - pr.left) + 'px round ' + round + 'px)'; }
  // opts.from: an element to grow out of (defaults to the mini player); opts.add: go straight to Add songs.
  function open(opts){
    opts = opts && opts.nodeType ? {} : (opts || {});
    var q = Q(); if (!q) return;
    if (isOpen){ if (opts.add) openAdd(); return; }
    isOpen = true; presetCache = null; editing = null; pageIdx = 0;
    root.hidden = false;
    document.body.classList.add('pq-open');
    try { history.pushState({ ppQueue: 1 }, ''); } catch(e){}   // Android back closes the board
    render();
    var src = opts.from && opts.from.getClientRects().length ? opts.from : mini && mini.getClientRects().length ? mini : null;
    var r = src ? src.getBoundingClientRect() : null, pr = panel.getBoundingClientRect();
    if (!reduce() && panel.animate){
      if (r && r.width){
        // Grow up out of the mini player (or the widget tapped): start clipped to its rectangle.
        panel.animate([{ clipPath: clipFrom(r, pr, 14) }, { clipPath: 'inset(0px 0px 0px 0px round 22px)' }], { duration: 380, easing: 'cubic-bezier(.2,.9,.25,1)' });
        panel.querySelectorAll('.pq-head, .pq-chips, .pq-pager').forEach(function(el, k){ el.animate([{ opacity: 0, transform: 'translateY(18px)' }, { opacity: 1, transform: 'none' }], { duration: 300, delay: 90 + k * 40, easing: 'ease-out', fill: 'backwards' }); });
      } else {
        panel.animate([{ transform: 'translateY(100%)' }, { transform: 'none' }], { duration: 320, easing: 'cubic-bezier(.2,.9,.25,1)' });
      }
      root.querySelector('.pq-scrim').animate([{ opacity: 0 }, { opacity: 1 }], { duration: 300 });
    }
    if (opts.add) setTimeout(openAdd, 200);
    else setTimeout(function(){ try { root.querySelector('.pq-close').focus({ preventScroll: true }); } catch(e){} }, 50);
    buzz();
  }
  // Closing from the board itself goes through history, so the entry open() pushed does not linger.
  function requestClose(){
    if (!isOpen) return;
    if (history.state && history.state.ppQueue) history.back();   // popstate closes it
    else close();
  }
  function close(){
    if (!isOpen) return;
    isOpen = false; editing = null;
    closeAdd(true);
    var done = function(){ root.hidden = true; document.body.classList.remove('pq-open'); pager.innerHTML = ''; panel.style.transform = ''; };
    if (reduce() || !panel.animate){ done(); return; }
    var r = mini && mini.getClientRects().length ? mini.getBoundingClientRect() : null, pr = panel.getBoundingClientRect(), a;
    if (r && r.width && !panel.style.transform){
      var to = clipFrom(r, pr, 14);
      a = panel.animate([{ clipPath: 'inset(0px 0px 0px 0px round 22px)', opacity: 1 }, { clipPath: to, opacity: 1, offset: .85 }, { clipPath: to, opacity: 0 }], { duration: 300, easing: 'cubic-bezier(.4,0,.6,1)', fill: 'forwards' });
    } else {
      a = panel.animate([{ transform: panel.style.transform || 'none' }, { transform: 'translateY(100%)' }], { duration: 220, easing: 'ease-in', fill: 'forwards' });
    }
    root.querySelector('.pq-scrim').animate([{ opacity: 1 }, { opacity: 0 }], { duration: 260, fill: 'forwards' });
    a.onfinish = function(){
      done();
      [panel, root.querySelector('.pq-scrim')].forEach(function(el){ el.getAnimations().forEach(function(x){ x.cancel(); }); });
    };
  }
  root.querySelector('.pq-scrim').addEventListener('click', requestClose);
  root.querySelector('.pq-close').addEventListener('click', requestClose);
  document.addEventListener('keydown', function(e){
    if (!isOpen || e.key !== 'Escape') return;
    e.stopPropagation();
    if (!addBox.hidden) closeAdd(); else requestClose();
  }, true);
  // Android back button / gesture: leaves the history entry open() pushed.
  window.addEventListener('popstate', function(){ if (isOpen && !(history.state && history.state.ppQueue)) close(); });

  // Drag the grab bar (or the header) down to close.
  (function(){
    var sy = 0, dy = 0, on = false, t0 = 0;
    function start(e){ if (e.target.closest('button')) return; on = true; sy = e.clientY; dy = 0; t0 = performance.now(); panel.style.transition = 'none'; try { e.currentTarget.setPointerCapture(e.pointerId); } catch(err){} }
    function move(e){ if (!on) return; dy = Math.max(0, e.clientY - sy); panel.style.transform = dy ? 'translateY(' + dy + 'px)' : ''; }
    function end(){
      if (!on) return; on = false;
      var v = dy / Math.max(1, performance.now() - t0);
      if (dy > 120 || (v > 0.6 && dy > 30)){ requestClose(); return; }
      panel.style.transition = 'transform .3s cubic-bezier(.3,1.4,.5,1)'; panel.style.transform = '';
      setTimeout(function(){ panel.style.transition = ''; }, 320);
    }
    [root.querySelector('.pq-grab'), root.querySelector('.pq-head')].forEach(function(el){
      el.style.touchAction = 'none';
      el.addEventListener('pointerdown', start); el.addEventListener('pointermove', move);
      el.addEventListener('pointerup', end); el.addEventListener('pointercancel', end);
    });
  })();

  // ---------- Actions on the pages ----------
  function curPage(){ return pages[pageIdx]; }
  function pageIdxs(p){ return p.kind === 'save' ? idxsOf(p.save.ids) : p.idxs || []; }
  pager.addEventListener('click', function(e){
    var b = e.target.closest('[data-act]'); if (!b || b.disabled) return;
    var q = Q(); if (!q) return;
    var pg = b.closest('.pq-page'), act = b.dataset.act, row = b.closest('.pq-row');
    var p = (pg && pages.find(function(x){ return x.id === pg.dataset.id; })) || curPage();
    var pos = row ? +row.dataset.pos : -1;
    switch (act){
      case 'jump': q.jumpAt(pos); break;
      case 'rm': removeRow(row, function(){ q.removeAt(pos); }); return;
      case 'clear': q.clearAdded(); toast('Cleared the songs you picked'); break;
      case 'add-songs': openAdd(); return;
      case 'save-live': {
        var s = q.state(1);
        if (s.cur < 0 && !s.up.length){ toast('The queue is empty'); return; }
        editing = { kind:'save', page:p.id, value:'Queue ' + (loadSaves().length + 1) }; render(true); return;
      }
      case 'rename': editing = { kind:'rename', page:p.id, id:p.save.id, value:p.save.name }; render(true); return;
      case 'cancel-name': editing = null; render(true); return;
      case 'delete': {
        if (b.dataset.sure !== '1'){ b.dataset.sure = '1'; b.classList.add('pq-sure'); b.setAttribute('aria-label', 'Tap again to delete'); toast('Tap again to delete "' + p.name + '"'); setTimeout(function(){ if (b.isConnected){ b.dataset.sure = ''; b.classList.remove('pq-sure'); } }, 3000); return; }
        storeSaves(loadSaves().filter(function(x){ return x.id !== p.save.id; }));
        toast('Deleted "' + p.name + '"'); pageIdx = Math.max(0, pageIdx - 1); render(); return;
      }
      case 'play-all': {
        var ids = pageIdxs(p); if (!ids.length) return;
        q.playList(ids, 0); toast('Playing ' + p.name); pageIdx = 0; render(); return;
      }
      case 'play-from': q.playList(pageIdxs(p), pos); toast('Playing ' + p.name); pageIdx = 0; render(); return;
      case 'queue-all': {
        var n = q.add(pageIdxs(p), false); if (!n) return;
        toast(n + (n === 1 ? ' song' : ' songs') + ' added to the queue');
        if (q.state(1).cur < 0) q.jumpAt(0);
        return;
      }
    }
  });
  pager.addEventListener('submit', function(e){
    e.preventDefault();
    var input = e.target.querySelector('input'), name = (input.value || '').trim().slice(0, 60);
    if (!name){ input.focus(); return; }
    var list = loadSaves();
    if (editing && editing.kind === 'rename'){
      list.forEach(function(x){ if (x.id === editing.id) x.name = name; });
      storeSaves(list); editing = null; toast('Renamed'); render(true); return;
    }
    var q = Q(), s = q.state(100000), t = tracks();
    var ids = (s.cur >= 0 ? [s.cur] : []).concat(s.up.map(function(x){ return x.i; })).map(function(i){ return t[i] && t[i].dbId; }).filter(function(x){ return x != null; });
    var id = Date.now().toString(36);
    list.push({ id: id, name: name, ids: ids, ts: Date.now() });
    storeSaves(list); editing = null;
    toast('Saved "' + name + '". Swipe left to find it');
    render(true);
  });
  function removeRow(row, then){
    if (!row || reduce() || !row.animate){ then(); return; }
    var h = row.offsetHeight;
    var a = row.animate([{ opacity: 1, transform: 'none', height: h + 'px' }, { opacity: 0, transform: 'translateX(40px)', height: h + 'px', offset: .6 }, { opacity: 0, transform: 'translateX(40px)', height: '0px', paddingTop: 0, paddingBottom: 0 }], { duration: 260, easing: 'ease-in', fill: 'forwards' });
    a.onfinish = then;
  }

  // ---------- Add songs ----------
  var addedNow = new Set(), addT = 0;
  function openAdd(){
    addedNow = new Set();
    addBox.hidden = false; addInput.value = '';
    renderAdd();
    if (!reduce() && addBox.animate) addBox.animate([{ transform: 'translateY(30px)', opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: 240, easing: 'cubic-bezier(.2,.9,.25,1)' });
    setTimeout(function(){ try { addInput.focus(); } catch(e){} }, 60);
  }
  function closeAdd(silent){
    if (addBox.hidden) return;
    addBox.hidden = true; addList.innerHTML = '';
    if (!silent && addedNow.size) toast(addedNow.size + (addedNow.size === 1 ? ' song' : ' songs') + ' added');
  }
  function renderAdd(){
    var t = tracks(), q = (addInput.value || '').trim().toLowerCase(), words = q ? q.split(/\s+/) : [];
    var hits = playable().filter(function(i){
      if (!words.length) return true;
      var s = ((t[i].title || '') + ' ' + (t[i].artist || '') + ' ' + (t[i].album || '')).toLowerCase();
      return words.every(function(w){ return s.indexOf(w) !== -1; });
    });
    if (!words.length) hits = hits.reverse();   // newest first until you type
    var shown = hits.slice(0, LIST_MAX);
    addList.innerHTML = shown.length ? shown.map(function(i){
      var tr = t[i], src = thumb(tr), on = addedNow.has(i);
      return '<div class="pq-row' + (on ? ' pq-added-now' : '') + '" role="listitem" data-i="' + i + '">' +
        '<span class="pq-art">' + (src ? '<img alt="" loading="lazy" src="' + esc(src) + '">' : I.note) + '</span>' +
        '<button type="button" class="pq-main" data-act="add-end"><span class="pq-t">' + esc(tr.title || 'Untitled') + '</span><span class="pq-a">' + esc(tr.artist || (tr.kind === 'video' ? 'Video' : 'Unknown artist')) + '</span></button>' +
        '<button type="button" class="pq-pill" data-act="add-next" aria-label="Play ' + esc(tr.title || 'song') + ' next">Next</button>' +
        '<button type="button" class="pq-iconbtn pq-plus" data-act="add-end" aria-label="Add ' + esc(tr.title || 'song') + ' to the queue">' + (on ? I.check : I.plus) + '</button>' +
      '</div>';
    }).join('') + moreHtml(hits.length - LIST_MAX) : '<div class="pq-empty">' + (words.length ? 'No songs match "' + esc(q) + '".' : 'Your library is empty.') + '</div>';
  }
  addInput.addEventListener('input', function(){ clearTimeout(addT); addT = setTimeout(renderAdd, 120); });
  addBox.querySelector('.pq-add-done').addEventListener('click', function(){ closeAdd(); });
  addList.addEventListener('click', function(e){
    var b = e.target.closest('[data-act]'); if (!b) return;
    var row = b.closest('.pq-row'), i = +row.dataset.i, q = Q(); if (!q) return;
    var next = b.dataset.act === 'add-next';
    q.add([i], next);
    addedNow.add(i);
    row.classList.add('pq-added-now');
    var plus = row.querySelector('.pq-plus'); if (plus) plus.innerHTML = I.check;
    if (!reduce() && row.animate) row.animate([{ background: 'color-mix(in srgb, var(--accent) 22%, transparent)' }, { background: 'transparent' }], { duration: 500 });
    buzz();
    if (q.state(1).cur < 0) q.jumpAt(0);   // nothing was playing: start with it
    else if (next) toast('"' + (tracks()[i].title || 'Song') + '" plays next');
  });

  // ---------- Keep everything current ----------
  var liveT = 0;
  function refresh(){
    if (flippedOn) syncBack();
    if (!isOpen) return;
    clearTimeout(liveT);
    liveT = setTimeout(function(){
      if (editing || Sortable.active()) return;   // don't redraw under a name being typed or a drag
      render(true);
    }, 60);
  }
  document.addEventListener('pp-queue', refresh);
  var np = document.getElementById('np-title');
  if (np && window.MutationObserver) new MutationObserver(refresh).observe(np, { childList: true, subtree: true, characterData: true });
  var pb = document.getElementById('play-btn');
  if (pb && window.MutationObserver) new MutationObserver(refresh).observe(pb, { attributes: true, attributeFilter: ['aria-label'] });
  window.addEventListener('resize', function(){ if (isOpen) setPage(pageIdx, true); });

  // The "Up next" widget's heading opens the board too (a way in when the mini player is off).
  document.addEventListener('click', function(e){
    var h = e.target.closest && e.target.closest('.pw-un .pw-wh');
    if (h && !document.body.classList.contains('pw-editing')){ e.preventDefault(); e.stopPropagation(); open({ from: h.closest('.pw-cardwrap') || h }); }
  }, true);

  window.ppOpenQueue = open;
  window.__ppQueueBoard = {
    flipped: function(){ return flippedOn; },
    flip: flip,
    miniUp: function(){ if (flippedOn) open(); else flip(true); },
    open: open,
    close: requestClose,
    dragging: function(){ return Sortable.active(); }
  };
})();
