  var BUILTIN_ORDER = ['title','games','tagline','playground','tabs','hero','chips','videos','audio','history'];
  var NEW_ORDER = ['nowplaying','cover','seekbar','upnext','lyrics','viz','volume','speed','trackinfo','stack','action','shufpl','shortcuts','search','eq','sleeper','bookmarks','level','bloopy','game',
                   'clock','greeting','countdown','calendar','dayprog','stopwatch','battery','text','rotate','drawing','image','stats',
                   'recent','most','random','cont','genre','playlist','playlists','setting','setsec','spacer','divider'];

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
    if (ed === 'lite' || ed === 'premium' || ed === 'focus') order.push('hero');
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
  var EDIT_GROUPS = { player: ['player-top', 'player'], library: ['library', 'lib-mid'], playlists: ['playlists', 'pls-mid'],
    settings: ['set-top', 'set-play', 'set-lib', 'set-look', 'set-data', 'set-fun'] };
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
  // ---- areas between rows: partway down the Library list, among the playlists, and between the Settings groups ----
  // The Library list and the Playlists page are redrawn from scratch often, so each area is one element that is put
  // back after the chosen row whenever its list is redrawn (watched with a MutationObserver on the list itself).
  var MID = {
    'lib-mid': { list: function(){ return document.getElementById('playlist'); }, item: '.track', def: 3 },
    'pls-mid': { list: function(){ var h = document.getElementById('pl-home'); if (!h || body.dataset.plView !== 'playlists') return null; var p = h.querySelector('.ph-pl'); return p ? p.parentNode : null; }, item: '.ph-pl', def: 2 }
  };
  var midEls = {};
  function midAfter(z){ var o = (L.zopt && L.zopt[z]) || {}; return o.after != null ? Math.max(0, +o.after) : MID[z].def; }
  function placeMid(z){
    var el = midEls[z], m = MID[z], list = m.list();
    var has = !!((zoneItems(z, false) || []).length) || isEd(z);
    if (!list || !has){ if (el && el.parentNode && (!list || el.parentNode !== list || !has)) el.remove(); return; }
    var rows = list.querySelectorAll(':scope > ' + m.item), n = midAfter(z), ref = n <= 0 ? rows[0] || null : rows[n] || null;
    if (n > 0 && !rows[n - 1]) ref = null;
    if (el.parentNode === list && el.nextElementSibling === ref && (n <= 0 || el.previousElementSibling === rows[Math.min(n, rows.length) - 1])) return;
    list.insertBefore(el, ref);
  }
  function renderMid(z, force){
    var el = midEls[z]; if (!el){ el = midEls[z] = document.createElement('div'); el.className = 'ls-slot ls-mid'; el.dataset.slot = z; }
    var has = !!((zoneItems(z, false) || []).length) || isEd(z);
    if (has && (force || !el.firstChild || el.dataset.sig !== sigN + ':' + (editing || ''))){ el.innerHTML = renderZone(z, null); el.dataset.sig = sigN + ':' + (editing || ''); var K = kit(); if (K) K.observe(el); startTick(); liveUpdate(); }
    if (!has) el.innerHTML = '';
    placeMid(z);
  }
  function renderMids(){ renderMid('lib-mid', true); renderMid('pls-mid', true); }
  (function(){
    if (typeof MutationObserver !== 'function') return;
    var pl = document.getElementById('playlist'), home = document.getElementById('pl-home');
    if (pl) new MutationObserver(function(){ renderMid('lib-mid'); }).observe(pl, { childList:true });
    if (home) new MutationObserver(function(){ renderMid('pls-mid'); }).observe(home, { childList:true });
  })();
  // Settings: one area at the top and one after each group. They sit inside each group (after its card), so the
  // groups keep their order and the Arrange list's place-by-position rules still match.
  var SET_ZONES = ['set-top', 'set-play', 'set-lib', 'set-look', 'set-data', 'set-fun'], setEls = {};
  function renderSettingsZones(){
    var S = window.__ppSettings, root = document.getElementById('pp-sg-root'); if (!S || !root) return;
    SET_ZONES.forEach(function(z){
      var el = setEls[z]; if (!el){ el = setEls[z] = document.createElement('div'); el.className = 'ls-slot ls-set-slot'; el.dataset.slot = z; }
      var host = z === 'set-top' ? null : S.wrap(z.slice(4));
      var has = !!((zoneItems(z, false) || []).length) || isEd(z);
      if (z === 'set-top'){ if (el.nextSibling !== root || el.parentNode !== root.parentNode) root.parentNode.insertBefore(el, root); }
      else if (host && el.parentNode !== host) host.appendChild(el);
      el.hidden = !has;
      el.innerHTML = has ? renderZone(z, null) : '';
      // a group with only widgets still shows, so its widgets do too
      if (host && has && host.hidden) el.classList.add('ls-orphan'); else el.classList.remove('ls-orphan');
    });
    startTick(); liveUpdate();
  }

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
      ['sg-data','Backup & storage', SG(4), true], ['sg-fun','Rewards & games', SG(5), true], ['sg-credits','Credits', SG(6), true]] }
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
    // The text the app modes add to the header: the mode's name next to the title, and its tagline under it.
    body.classList.toggle('pw-no-edname', hide.indexOf('ed-name') >= 0);
    body.classList.toggle('pw-no-edtag', hide.indexOf('ed-tag') >= 0);
  }
  var HEADER_BITS = [['ed-name', 'Mode name by the title', 'Lite, Plus, Premium or Playground after “Press Play Media”'], ['ed-tag', 'Mode tagline', '“Everything unlocked.” and the like, under the title']];
  function toggleHide(k){ remember(); var h = L.hide = (L.hide || []).slice(), i = h.indexOf(k); if (i >= 0) h.splice(i, 1); else h.push(k); save(); applyHide(); }
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
    body.classList.toggle('pw-tabs-scroll', list.length > 5);
    // the arrows go at the two ends, around the tabs
    bar.insertBefore(tbArrowL, bar.firstChild); bar.appendChild(tbArrowR);
    syncTabs(); tbArrows();
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
    showActiveTab();
  }
  // Arrows at the ends of a bar that slides: shown when there are more tabs that way, a tap slides it a screen's worth.
  function tbArrowEl(side){
    var s = document.createElement('span'); s.className = 'pw-tb-arrow pw-tb-' + side;
    s.innerHTML = '<i role="button" aria-label="' + (side === 'l' ? 'Earlier tabs' : 'More tabs') + '">' + svg(side === 'l' ? 'chevl' : 'chevr') + '</i>';
    s.addEventListener('click', function(e){
      e.stopPropagation(); if (!bar) return;
      var w = bar.clientWidth, step = Math.max(1, Math.round(w / 5)) * 4;
      bar.scrollBy({ left: side === 'l' ? -step : step, behavior: 'smooth' });
    });
    return s;
  }
  var tbArrowL = tbArrowEl('l'), tbArrowR = tbArrowEl('r');
  function tbArrows(){
    if (!bar) return;
    var on = body.classList.contains('pw-tabs-scroll'), sl = bar.scrollLeft, max = bar.scrollWidth - bar.clientWidth;
    bar.classList.toggle('pw-more-l', on && sl > 4);
    bar.classList.toggle('pw-more-r', on && sl < max - 4);
  }
  if (bar){ bar.addEventListener('scroll', tbArrows, { passive:true }); window.addEventListener('resize', tbArrows); }
  // When the bar slides, keep the tab you are on in view.
  function showActiveTab(){
    if (!bar || !body.classList.contains('pw-tabs-scroll')) return;
    var a = bar.querySelector('button.active'); if (!a || !a.offsetWidth) return;
    var l = a.offsetLeft, r = l + a.offsetWidth, sl = bar.scrollLeft, w = bar.clientWidth;
    if (l < sl) bar.scrollTo({ left: l - 8, behavior: 'smooth' });
    else if (r > sl + w) bar.scrollTo({ left: r - w + 8, behavior: 'smooth' });
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
    bar.addEventListener('scroll', function(){ clearTimeout(lpTimer); }, { passive:true });
    bar.addEventListener('click', function(e){ if (lpFired){ lpFired = false; e.stopImmediatePropagation(); e.preventDefault(); } }, true);
    bar.addEventListener('contextmenu', function(e){ if (e.target.closest('.pw-tab')) e.preventDefault(); });
  }
  // Swiping between tabs (player-layout.js) goes through the tab bar as it is laid out: the built-in tabs and the
  // pages, in the bar's order. Tabs that run an action (the player, games, a button) are stepped over.
  window.__ppPwSwipe = {
    pageEl: pageEl,
    pageOpen: function(){ return openPageId; },
    targets: function(){
      var out = []; if (!bar) return out;
      bar.querySelectorAll('button[data-pl-view], .pw-tab').forEach(function(b){
        if (b.hidden) return;
        if (b.dataset.plView){ out.push({ view: b.dataset.plView }); return; }
        var t = tabList().find(function(x){ return x.id === b.dataset.pwTab; });
        if (t && t.type === 'page' && pageById(t.page)) out.push({ page: t.page });
      });
      return out;
    },
    openPage: openPage, closePage: closePage
  };
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
    renderPage(); renderPlayer(); renderLibrary(); renderMids(); renderSettingsZones(); applyTabs(); applyHide();
  }
  var dataTimer = null;
  function onData(){ clearTimeout(dataTimer); dataTimer = setTimeout(function(){ if (openPageId && !editing) renderPage(); if (!editing){ renderPlayer(); renderLibrary(); renderMids(); renderSettingsZones(); } }, 120); }
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

  /**
   * The tab on top of every editing sheet: drag the sheet down to see the screen behind it (it stops with its title
   * still showing), back up for all of it, or flick it away to close it. A tap on the tab moves it between the two.
   * While it is lowered the screen behind can be used. [wrap] gets 'pw-sheet-low' while lowered.
   * Shared with the layout studio (window.PPSheetDrag).
   */
  function sheetDrag(card, wrap, onClose){
    var grab = document.createElement('div'); grab.className = 'pw-grab'; grab.setAttribute('role', 'button'); grab.setAttribute('aria-label', 'Drag to move this panel'); grab.innerHTML = '<i></i>';
    card.insertBefore(grab, card.firstChild);
    var off = 0, drag = false, moved = false, pid = null, y0 = 0, start = 0, trail = [];
    function maxOff(){ var h = card.querySelector('.pw-sheet-head'); return Math.max(0, card.offsetHeight - grab.offsetHeight - (h ? h.offsetHeight : 40)); }
    function set(v, anim){
      off = Math.max(0, Math.min(maxOff(), v));
      card.style.transition = anim ? 'transform .24s cubic-bezier(.2,.8,.2,1)' : 'none';
      card.style.transform = off > 0.5 ? 'translateY(' + off.toFixed(1) + 'px)' : '';
      wrap.classList.toggle('pw-sheet-low', off > 8);
    }
    function down(e){
      if (e.target.closest && e.target.closest('button:not(.pw-grab), input, select, textarea, a')) return;
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      drag = true; moved = false; pid = e.pointerId; y0 = e.clientY; start = off; trail = [[performance.now(), e.clientY]];
      try { e.currentTarget.setPointerCapture(pid); } catch(x){}
    }
    function move(e){
      if (!drag || e.pointerId !== pid) return;
      var dy = e.clientY - y0; if (Math.abs(dy) > 4) moved = true;
      trail.push([performance.now(), e.clientY]); while (trail.length > 2 && performance.now() - trail[0][0] > 100) trail.shift();
      set(start + dy, false);
    }
    function up(e){
      if (!drag || e.pointerId !== pid) return; drag = false;
      if (!moved) return;
      var a = trail[0], b = trail[trail.length - 1], v = (b[1] - a[1]) / Math.max(16, b[0] - a[0]), m = maxOff();
      if (v > 0.5 && start >= m - 2){ set(0, false); onClose(); return; }      // flicked down from the lowest spot: away
      set(v > 0.45 ? m : v < -0.45 ? 0 : (off > m / 2 ? m : 0), true);
    }
    [grab, card.querySelector('.pw-sheet-head')].forEach(function(z){
      if (!z) return; z.style.touchAction = 'none';
      z.addEventListener('pointerdown', down); z.addEventListener('pointermove', move);
      z.addEventListener('pointerup', up); z.addEventListener('pointercancel', up);
    });
    grab.addEventListener('click', function(){ if (moved){ moved = false; return; } set(off > 8 ? 0 : maxOff(), true); });
    return { reset: function(){ set(0, false); }, low: function(){ return off > 8; } };
  }
  window.PPSheetDrag = sheetDrag;
  var sheetMove = sheetDrag(sheet.querySelector('.pw-sheet-card'), sheet, function(){ closeSheet(); });
  function openSheet(title, html){ sheetMove.reset(); sheetTitle.textContent = title; sheetBody.innerHTML = html; sheet.hidden = false; sheetBody.scrollTop = 0; }
  function closeSheet(){ sheet.hidden = true; sheetBody.innerHTML = ''; sheetMove.reset(); }
  sheet.addEventListener('click', function(e){ if (e.target === sheet || e.target.closest('.pw-sheet-x')) closeSheet(); });

  var ZNAMES = { home:'Home', player:'Above the controls', 'player-top':'Top of the player', video:'Over the video', playlists:'Top of Playlists', library:'Top of the Library',
    'lib-mid':'In the list', 'pls-mid':'Among your playlists', settings:'Settings', 'set-top':'Top of Settings', 'set-play':'After Playback', 'set-lib':'After Library & playlists',
    'set-look':'After Appearance & layout', 'set-data':'After Backup & storage', 'set-fun':'After Rewards & games' };
  function zoneName(z){ return ZNAMES[z] || ((pageById(z.slice(5)) || {}).name || 'Page'); }
  function sessionName(ed){ return ed === 'player' ? 'the player' : ed === 'video' ? 'the video overlay' : ed === 'library' ? 'the Library' : ed === 'playlists' ? 'Playlists' : ed === 'settings' ? 'Settings' : zoneName(ed); }
  function currentZoneOnScreen(){ var K = kit(); return openPageId ? 'page:' + openPageId : body.hasAttribute('data-pl-player') ? (body.classList.contains('pl-video') ? 'video' : 'player') : K && K.view() === 'playlists' ? 'playlists' : K && K.view() === 'library' ? 'library' : K && K.view() === 'settings' ? 'settings' : 'home'; }
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
    if (zone.indexOf('page:') === 0 || zone === 'home' || zone === 'playlists' || zone === 'library' || zone === 'settings'){ if (K.playerOpen && K.playerOpen() && K.closePlayer) K.closePlayer(); }
    if (zone === 'home' || zone === 'playlists'){ closePage(); K.setView(zone); }
    else if (zone === 'library'){ closePage(); K.setView('library'); }
    else if (zone === 'settings'){ closePage(); K.setView('settings'); }
    else if (zone === 'player' || zone === 'video'){ closePage(); K.openPlayer(); }
    else openPage(zone.slice(5));
    zonesOf(zone).forEach(function(z){ zoneItems(z, true); }); save();
    edZone = zone === 'player' ? 'player' : zone === 'settings' ? 'set-top' : zone;
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
    if (editing === 'home' || editing === 'playlists'){ var K = kit(); if (K) K.renderHome(true); if (editing === 'playlists') renderMid('pls-mid', true); }
    else if (editing === 'player') renderPlayer();
    else if (editing === 'library'){ renderLibrary(); renderMid('lib-mid', true); }
    else if (editing === 'settings') renderSettingsZones();
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
  function zoneKind(z){ return z.indexOf('page:') === 0 || z === 'playlists' || z === 'library' || z === 'lib-mid' || z === 'pls-mid' || z.indexOf('set-') === 0 ? 'page' : z === 'player-top' ? 'player' : z; }
  function addSheet(){
    if (!edZone || !isEd(edZone)) edZone = zonesOf(editing)[zonesOf(editing).length - 1];
    var zk = zoneKind(edZone), present = items().map(function(x){ return x.type; });
    var tile = function(type){ var d = T[type];
      return '<button type="button" class="pw-add-tile" data-type="' + type + '">' + svg(d.icon) + '<span><b>' + esc(d.name) + '</b>' + (d.desc ? '<small>' + esc(d.desc) + '</small>' : '') + '</span></button>'; };
    var fresh = NEW_ORDER.filter(function(t){ return T[t].zones.indexOf(zk) >= 0; }), fidg = FIDGET_ORDER.filter(function(t){ return T[t].zones.indexOf(zk) >= 0; });
    var ed = window.__ppEdition ? window.__ppEdition() : '';
    var back = BUILTIN_ORDER.filter(function(t){ return T[t].zones.indexOf(zk) >= 0 && present.indexOf(t) < 0 &&
      !(t === 'tagline' && !ed) && !(t === 'playground' && ed !== 'playground') && !(t === 'chips' && zk !== 'home'); });
    var grp = zonesOf(editing), where = grp.length > 1 ? '<div class="pw-f"><label>Put it</label><div class="pw-seg" data-where="1">' +
      grp.map(function(z){ return '<button type="button" data-z="' + z + '"' + (z === edZone ? ' class="on"' : '') + '>' + esc(zoneName(z)) + '</button>'; }).join('') + '</div></div>' : '';
    openSheet('Add to ' + (grp.length > 1 ? sessionName(editing) : zoneName(edZone || editing)),
      where + '<div class="pw-add-grid">' + fresh.map(tile).join('') + '</div>' +
      (fidg.length ? '<div class="pw-sh-h">Fidgets</div><p class="pw-note">Things to spin, pop, flick and squish. Each one can also do something in the app, and show the time, the date or a calendar.</p><div class="pw-add-grid">' + fidg.map(tile).join('') + '</div>' : '') +
      (back.length ? '<div class="pw-sh-h">Put back built-in parts</div><div class="pw-add-grid">' + back.map(tile).join('') + '</div>' : ''));
    sheetBody.querySelectorAll('[data-where] button').forEach(function(b){ b.addEventListener('click', function(){ edZone = b.dataset.z; addSheet(); }); });
    sheetBody.querySelectorAll('.pw-add-tile').forEach(function(b){
      b.addEventListener('click', function(){
        var type = b.dataset.type, it = { id:uid(), type:type, w: (zk === 'player' || zk === 'video') && type !== 'action' ? 'full' : T[type].w, o: T[type].o0 ? clone(T[type].o0) : {} };
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
    if (type === 'fidact') return row('<select data-k="' + k + '"><option value="">Nothing</option>' + Object.keys(ACTIONS).filter(function(a){ return ACTIONS[a].run && a !== 'page'; }).map(function(a){ return '<option value="' + a + '"' + (v === a ? ' selected' : '') + '>' + esc(ACTIONS[a].label) + '</option>'; }).join('') + '</select>');
    if (type === 'eqp'){ var eqs = Array.prototype.map.call(document.querySelectorAll('#eq-preset-row button[data-eq-preset]'), function(b){ return [b.dataset.eqPreset, b.textContent.trim()]; });
      return row('<select data-k="' + k + '"><option value=""' + (v === '' ? ' selected' : '') + '>None</option>' + eqs.map(function(x){ return '<option value="' + esc(x[0]) + '"' + (v === x[0] ? ' selected' : '') + '>' + esc(x[1]) + '</option>'; }).join('') + '</select>'); }
    if (type === 'game') return row('<select data-k="' + k + '"><option value="">Choose a game…</option>' + gameList().map(function(g){ return '<option value="' + esc(g.id) + '"' + (v === g.id ? ' selected' : '') + '>' + esc(g.name) + '</option>'; }).join('') + '</select>');
    if (type === 'genre'){ var gm = genreMap(), names = Object.keys(gm).sort(function(a, b){ return gm[b].length - gm[a].length; });
      if (v && !gm[v]) names.unshift(v);
      return row(names.length ? '<select data-k="' + k + '"><option value="">Choose a genre…</option>' + names.map(function(n){ return '<option value="' + esc(n) + '"' + (v === n ? ' selected' : '') + '>' + esc(n) + ' (' + ((gm[n] || []).length) + ')</option>'; }).join('') + '</select>'
        : '<p class="pw-note">No genres yet. Tag your songs with smart tags (Bloopy’s stems menu) and they show up here.</p>'); }
    if (type === 'setting') return stPickHTML(k, v, label);
    if (type === 'setsec') return stSecPickHTML(k, v, label);
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
    var zk = zoneKind(edZone || editing), add = NEW_ORDER.concat(FIDGET_ORDER).filter(function(t){ return stackable(t) && T[t].zones.indexOf(zk) >= 0; });
    return '<div class="pw-sh-h">In this stack</div>' + (rows ? '<div class="pw-tabs">' + rows + '</div>' : '<p class="pw-note">Nothing yet. Add widgets below; swipe sideways between them.</p>') +
      '<div class="pw-sh-h">Add to the stack</div><div class="pw-add-grid pw-add-small">' + add.map(function(t){ return '<button type="button" class="pw-add-tile" data-kadd="' + t + '">' + svg(T[t].icon) + '<span><b>' + esc(T[t].name) + '</b></span></button>'; }).join('') + '</div>';
  }
  function settingsSheet(id){
    var loc = locate(id); if (!loc) return;
    var it = loc.it, def = T[it.type], top = !loc.parent, isBox = def.kind === 'box'; it.o = it.o || {};
    var widths = isBox && top ? '<div class="pw-f"><label>Width</label><div class="pw-seg pw-wseg">' + W.map(function(w){ return '<button type="button" data-w="' + w + '"' + ((it.w || def.w) === w ? ' class="on"' : '') + '>' + W_LABEL[w] + '</button>'; }).join('') + '</div></div>' : '';
    var fields = (def.fields || []).filter(function(f){ return typeof f[4] === 'function' ? f[4](it.o) : !(f[2] === 'page' && it.o.action !== 'page'); }).map(function(f){ return fieldHTML(f, it.o); }).join('');
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
      var g = b.parentNode; g.querySelectorAll('button').forEach(function(x){ x.classList.toggle('on', x === b); }); set(g.dataset.k, b.dataset.v, RERENDER.concat(def.rerender || []).indexOf(g.dataset.k) >= 0); }); });
    sheetBody.querySelectorAll('input[type=range][data-k]').forEach(function(inp){
      var out = inp.nextElementSibling, unit = inp.dataset.unit;
      var tmr; inp.addEventListener('input', function(){ out.textContent = rangeLabel(unit, inp.value); clearTimeout(tmr); tmr = setTimeout(function(){ set(inp.dataset.k, +inp.value); }, 120); }); });
    sheetBody.querySelectorAll('input[type=color][data-k]').forEach(function(inp){
      var tmr; inp.addEventListener('input', function(){ clearTimeout(tmr); tmr = setTimeout(function(){ set(inp.dataset.k, inp.value); }, 120); }); });
    sheetBody.querySelectorAll('select[data-k]').forEach(function(s2){ s2.addEventListener('change', function(){ set(s2.dataset.k, s2.value, RERENDER.concat(def.rerender || []).indexOf(s2.dataset.k) >= 0); }); });
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
        var k = { id: uid(), type: b.dataset.kadd, o: T[b.dataset.kadd].o0 ? clone(T[b.dataset.kadd].o0) : {} }; change(function(){ kidsOf().push(k); }); keep();
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
        '<div class="pw-sh-h">Header</div>' + HEADER_BITS.map(function(x){ var shown = (L.hide || []).indexOf(x[0]) < 0;
          return '<label class="pw-lp-row pw-lp-tog"><div><b>' + esc(x[1]) + '</b><small>' + esc(x[2]) + '</small></div><input type="checkbox" data-lp-hdr="' + x[0] + '"' + (shown ? ' checked' : '') + ' aria-label="Show ' + esc(x[1]) + '"></label>'; }).join('') +
        '<div class="pw-sh-h">Screens</div>' +
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
    panel.addEventListener('change', function(e){ var c = e.target.closest && e.target.closest('[data-lp-hdr]'); if (c) toggleHide(c.dataset.lpHdr); });
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
    stopEdit: function(){ if (editing) stopEdit(); },
    editTabs: tabsSheet,
    openPage: openPage,
    closePage: closePage,
    addWidget: function(z, type, o){ if (!T[type]) return null; var it = { id:uid(), type:type, w:T[type].w, o:o || {} }; remember(); zoneItems(z, true).push(it); save(); refreshAll(); return it; },
    zopt: function(z, v){ if (v === undefined) return clone((L.zopt && L.zopt[z]) || {}); L.zopt = L.zopt || {}; L.zopt[z] = Object.assign({}, L.zopt[z] || {}, v); save(); refreshAll(); },
    zoneCount: function(z){ return ((L.zones[z]) || []).length; },
    actions: function(){ return Object.keys(ACTIONS).filter(function(a){ return ACTIONS[a].run && ['page','editlayout'].indexOf(a) < 0; }).map(function(a){ return { id:a, label:ACTIONS[a].label, icon:ACTIONS[a].icon }; }); },
    run: function(a){ runAction(a); },
    icon: function(n){ return svg(n); },
    layout: function(){ return clone(L); },
    // The Layout studio arranges the app's own rows with the same order and hide lists as the Arrange sheets.
    arrange: {
      list: function(gid){ var g = GROUPS.find(function(x){ return x.id === gid; }); if (!g) return null; var hide = L.hide || [];
        return groupItems(g).map(function(it){ return { key: it[0], label: it[1], canHide: !!it[3], shown: hide.indexOf(it[0]) < 0 }; }); },
      canOrder: function(gid){ var g = GROUPS.find(function(x){ return x.id === gid; }); return !!g && !g.noOrder; },
      move: function(gid, i, dir){
        var g = GROUPS.find(function(x){ return x.id === gid; }); if (!g || g.noOrder) return;
        var keys = groupItems(g).map(function(x){ return x[0]; }), j = i + dir; if (j < 0 || j >= keys.length) return;
        remember(); var t = keys[i]; keys[i] = keys[j]; keys[j] = t; L.order = L.order || {}; L.order[gid] = keys; save(); applyHide(); },
      toggle: function(k){ toggleHide(k); },
      reset: function(gid){
        var g = GROUPS.find(function(x){ return x.id === gid; }); if (!g) return;
        remember(); if (L.order) delete L.order[gid]; var keys = g.items.map(function(x){ return x[0]; });
        L.hide = (L.hide || []).filter(function(k){ return keys.indexOf(k) < 0; }); save(); applyHide(); }
    }
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
  function boot(){ settingsEntry(); applyTabs(); renderPlayer(); buildPanel(); renderMids(); renderSettingsZones(); setTimeout(renderSettingsZones, 1600); if (L.zones.home && kit()) kit().renderHome(true); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
  // Back button leaves a page or edit mode first.
  window.addEventListener('keydown', function(e){ if (e.key === 'Escape'){ if (!sheet.hidden) closeSheet(); else if (editing) stopEdit(); } });
})();
