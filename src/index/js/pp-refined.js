(function(){
  var KEY = 'ppRefinedLook', body = document.body;
  function want(){ try { return localStorage.getItem(KEY) !== '0'; } catch(e){ return true; } }
  var tg = document.getElementById('pp-refined-toggle');
  // sliding tab indicator
  var bar = document.getElementById('pl-tabbar'), ind = null;
  if (bar){ ind = document.createElement('span'); ind.id = 'pl-tab-ind'; ind.setAttribute('aria-hidden', 'true'); bar.appendChild(ind); }
  function placeInd(){
    if (!ind || !body.classList.contains('pp-refined')) return;
    var a = bar.querySelector('button.active'); if (!a) return;
    var br = bar.getBoundingClientRect(), r = a.getBoundingClientRect(); if (!r.width) return;
    ind.style.transform = 'translateX(' + Math.round(r.left - br.left + r.width / 2 - 28) + 'px)';
  }
  function apply(v){
    body.classList.toggle('pp-refined', v);
    if (tg) tg.checked = v;
    requestAnimationFrame(placeInd);
  }
  apply(want());
  if (tg) tg.addEventListener('change', function(){ try { localStorage.setItem(KEY, tg.checked ? '1' : '0'); } catch(e){} apply(tg.checked); });
  if (bar){
    new MutationObserver(function(){ requestAnimationFrame(placeInd); }).observe(bar, { subtree: true, attributes: true, attributeFilter: ['class'] });
    window.addEventListener('resize', function(){ requestAnimationFrame(placeInd); });
  }
  // restart an animation class on an element
  function play(el, cls){ if (!el) return; el.classList.remove(cls); void el.offsetWidth; el.classList.add(cls); }
  function stagger(root, sel, max){
    if (!root) return;
    var items = root.querySelectorAll(sel), n = 0;
    for (var i = 0; i < items.length && n < max; i++){
      var it = items[i], r = it.getBoundingClientRect();
      if (r.bottom < 0 || r.top > innerHeight) continue;          // only what's on screen
      it.style.setProperty('--i', n++); play(it, 'pp-r-stag');
    }
  }
  function onView(){
    if (!body.classList.contains('pp-refined') || !body.classList.contains('player-layout')) return;
    var v = body.dataset.plView;
    requestAnimationFrame(function(){ requestAnimationFrame(function(){   // after the screen has rendered
      if (v === 'home' || v === 'playlists'){
        var h = document.getElementById('pl-home'); play(h, 'pp-r-in');
        stagger(h, '.ph-sec, .ph-card, .ph-pl, .ph-trk', 14);
      } else {
        var s = document.getElementById('sidebar'); play(s, 'pp-r-in');
        stagger(s, v === 'settings' ? '.pp-sg' : '.track', 12);
      }
    }); });
  }
  var lastView = body.dataset.plView, hadPlayer = body.hasAttribute('data-pl-player'), hadTrack = body.classList.contains('pl-has-track');
  new MutationObserver(function(){
    if (body.dataset.plView !== lastView){ lastView = body.dataset.plView; onView(); }
    var p = body.hasAttribute('data-pl-player');
    hadPlayer = p;
    var t = body.classList.contains('pl-has-track');
    if (t && !hadTrack && !p && body.classList.contains('pp-refined')) play(document.getElementById('pl-mini'), 'pp-r-rise');
    hadTrack = t;
  }).observe(body, { attributes: true, attributeFilter: ['data-pl-view', 'data-pl-player', 'class'] });
  // ---- motion, part two ----
  function refined(){ return body.classList.contains('pp-refined'); }
  function after(fn){ requestAnimationFrame(function(){ requestAnimationFrame(fn); }); }
  // Home and Playlists: opening a playlist or a section moves forward, its return button moves back
  var home = document.getElementById('pl-home');
  if (home) home.addEventListener('click', function(e){
    var el = e.target.closest && e.target.closest('[data-act]'); if (!el || !refined()) return;
    var a = el.dataset.act, cls = (a === 'pl-open' || a === 'sec-open') ? 'pp-r-fwd' : (a === 'pl-back' || a === 'sec-back') ? 'pp-r-back' : a === 'home-tab' ? 'pp-r-in' : null;
    if (!cls) return;
    after(function(){ play(home, cls); stagger(home, '.ph-sec, .ph-card, .ph-pl, .ph-trk', 14); });
  }, true);
  // mini-player: the play/pause icon pops when it flips, the title and art ease over when the track changes
  var mPlay = document.getElementById('pl-mini-play'), mText = document.getElementById('pl-mini-text'), mTitle = document.getElementById('pl-mini-title'), mArt = document.getElementById('pl-mini-art');
  if (mPlay && mTitle){
    var lastLbl = mPlay.getAttribute('aria-label'), lastTitle = mTitle.textContent;
    new MutationObserver(function(){
      var l = mPlay.getAttribute('aria-label');
      if (l !== lastLbl){ lastLbl = l; if (refined()) play(mPlay, 'pp-r-pop'); }
    }).observe(mPlay, { attributes: true, attributeFilter: ['aria-label'] });
    new MutationObserver(function(){
      var t = mTitle.textContent; if (t === lastTitle) return;
      var had = !!lastTitle; lastTitle = t;
      if (had && t && refined()){ play(mText, 'pp-r-swap'); play(mArt, 'pp-r-swap'); }
    }).observe(mTitle, { childList: true, characterData: true, subtree: true });
  }
  // Games: cards follow one another in, and the Points tabs slide the way you are going
  var HUB_TABS = ['quests', 'ach', 'shop'], hubTab = null;
  function watchShown(el, fn){
    var was = el.classList.contains('shown');
    new MutationObserver(function(){ var is = el.classList.contains('shown'); if (is && !was && refined()) fn(); was = is; }).observe(el, { attributes: true, attributeFilter: ['class'] });
  }
  function hubNow(h){ var b = h.querySelector('.ppx-tab.on'); return b ? b.getAttribute('data-t') : null; }
  var games = document.getElementById('pp-games'), hub = document.getElementById('ppx-hub');
  if (games) watchShown(games, function(){ stagger(games, '.ppx-tile, .ppg-card', 16); });
  if (hub){
    watchShown(hub, function(){ hubTab = hubNow(hub); stagger(hub, '.ppx-body > *', 12); });
    hub.addEventListener('click', function(e){
      if (!refined() || !e.target.closest) return;
      var body2 = hub.querySelector('.ppx-body'), seg = e.target.closest('[data-seg]');
      if (e.target.closest('.ppx-tab') || seg) after(function(){
        var t = hubNow(hub);
        if (seg){ stagger(hub, '.ppx-body > *:not(.ppx-seg)', 12); return; }
        if (t === hubTab) return;
        play(body2, HUB_TABS.indexOf(t) > HUB_TABS.indexOf(hubTab) ? 'pp-r-fwd' : 'pp-r-back'); hubTab = t;
      });
    }, true);
  }
  // ---- the player's own controls ----
  var calm = window.matchMedia ? matchMedia('(prefers-reduced-motion: reduce)') : { matches: false };
  // immersive: the disc grows into the room the controls leave, and settles back when they return
  var wasImm = body.classList.contains('immersive');
  new MutationObserver(function(){
    var im = body.classList.contains('immersive'); if (im === wasImm) return; wasImm = im;
    if (refined() && body.hasAttribute('data-pl-player') && !body.classList.contains('pl-video')) play(document.getElementById('viz-wrap'), im ? 'pp-r-zin' : 'pp-r-zout');
  }).observe(body, { attributes: true, attributeFilter: ['class'] });
  // quick-bar pills: when one is added, removed or changes width, the others slide into place and a new one pops in
  ['extra-transport', 'transport'].forEach(function(id){
    var bar = document.getElementById(id); if (!bar || !bar.animate) return;
    var seen = null, queued = false;
    function snap(){
      var m = new Map(), b = bar.getBoundingClientRect();   // measured from the bar itself, so the bar moving as a whole doesn't count
      for (var i = 0; i < bar.children.length; i++){ var c = bar.children[i]; if (!c.offsetWidth) continue; var r = c.getBoundingClientRect(); m.set(c, [r.left - b.left, r.top - b.top]); }
      return m;
    }
    function run(){
      queued = false;
      if (!bar.offsetWidth){ seen = null; return; }
      var now = snap(), was = seen; seen = now;
      if (!was || !refined() || calm.matches || !body.hasAttribute('data-pl-player')) return;
      now.forEach(function(p, c){
        var o = was.get(c);
        if (!o){ c.animate([{ scale: '.5', opacity: 0 }, { scale: '1', opacity: 1 }], { duration: 340, easing: 'cubic-bezier(.3,1.45,.45,1)' }); return; }
        var dx = o[0] - p[0], dy = o[1] - p[1];
        if ((Math.abs(dx) > .5 || Math.abs(dy) > .5) && Math.abs(dx) < 400 && Math.abs(dy) < 200) c.animate([{ translate: dx + 'px ' + dy + 'px' }, { translate: '0 0' }], { duration: 360, easing: 'cubic-bezier(.2,.8,.2,1)' });
      });
    }
    function queue(){ if (!queued){ queued = true; requestAnimationFrame(run); } }
    new MutationObserver(queue).observe(bar, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['style', 'hidden', 'class'] });
    new MutationObserver(queue).observe(body, { attributes: true, attributeFilter: ['class', 'data-pl-player'] });
    window.addEventListener('resize', function(){ seen = null; queue(); });
    queue();
  });
  // ---- things grow out of where you touched, and shrink back into it ----
  var EASE = 'cubic-bezier(.3,0,.15,1)', GROW = 'cubic-bezier(.34,1.3,.5,1)';   // EASE starts gently so you can watch it leave the spot you touched
  var tap = null;   // the last touch: where it landed and what it was on
  function noteTap(e){
    if (!e.target || !e.target.closest) return;
    var c = e.target.closest('.ph-card, .ph-trk'), row = e.target.closest('.track');
    tap = { x: e.clientX, y: e.clientY, t: performance.now(), mini: !!e.target.closest('#pl-mini'),
            card: c ? c.getBoundingClientRect() : null, row: row ? row.getBoundingClientRect() : null };
  }
  document.addEventListener('pointerdown', noteTap, { capture: true, passive: true });
  document.addEventListener('click', function(e){ if (e.clientX || e.clientY) noteTap(e); }, true);
  function fresh(){ return tap && performance.now() - tap.t < 900 ? tap : null; }
  function motionOk(){ return refined() && !calm.matches; }
  function onOpen(el, fn){   // fn(true) when .open is added, fn(false) when it goes
    if (!el) return;
    var was = el.classList.contains('open');
    new MutationObserver(function(){ var is = el.classList.contains('open'); if (is !== was){ was = is; if (motionOk() && el.animate) fn(is); } }).observe(el, { attributes: true, attributeFilter: ['class'] });
  }
  // popovers and dialogs: scale out of the button that opened them
  function grower(el, small){
    var panel = function(){ return el; };
    return function(open){
      var t = panel(); if (!t) return;
      if (open){
        var r = t.getBoundingClientRect(), f = fresh();
        t.__ppO = f && r.width ? Math.max(0, Math.min(r.width, f.x - r.left)) + 'px ' + Math.max(0, Math.min(r.height, f.y - r.top)) + 'px' : '50% 50%';
        t.style.transformOrigin = t.__ppO;
        t.animate([{ scale: String(small) }, { scale: '1' }], { duration: 420, easing: GROW });
      } else {
        t.animate([{ scale: '1', opacity: 1 }, { scale: String(small + .2), opacity: 1, offset: .65 }, { scale: String(small), opacity: 0 }], { duration: 260, easing: 'cubic-bezier(.4,0,.7,.6)', fill: 'forwards' }).onfinish = function(){ this.cancel(); };
      }
    };
  }
  ['sort-dropdown', 'add-dropdown', 'track-edit-popover', 'track-pl-popover', 'select-pl-menu', 'viz-sens-dropdown', 'subtitle-dropdown', 'sleep-dropdown', 'filter-dropdown', 'pip-dropdown', 'speed-dropdown', 'latency-dropdown', 'memc-dropdown', 'upscale-dropdown', 'boost-dropdown', 'fx-dropdown', 'eq-dropdown', 'extras-panel'].forEach(function(id){ var d = document.getElementById(id); if (d) onOpen(d, function(o){ if (!d.closest('#menu-panel')) grower(d, .4)(o); }); });
  ['sort-modal-overlay', 'rename-modal-overlay', 'thumbnail-modal-overlay', 'cutter-modal-overlay', 'customize-modal-overlay', 'ppxp-rank-modal-overlay', 'ppxp-expshop-modal-overlay', 'ppxp-quiz-modal-overlay', 'pp-mar-overlay'].forEach(function(id){ var o = document.getElementById(id); if (o && o.firstElementChild) onOpen(o, grower(o.firstElementChild, .6)); });
  // full pages (Games, Points, a game): a circle opens from the touch and closes back onto it
  function circler(el, keepOpacity){
    return function(open){
      var W = innerWidth, H = innerHeight, f = fresh();
      if (open) el.__ppO = f ? [f.x, f.y] : [W / 2, H / 2];
      var o = el.__ppO || [W / 2, H / 2], R = Math.hypot(Math.max(o[0], W - o[0]), Math.max(o[1], H - o[1])) + 4;
      var at = ' at ' + o[0] + 'px ' + o[1] + 'px)', a = { clipPath: 'circle(0px' + at }, b = { clipPath: 'circle(' + R + 'px' + at };
      if (keepOpacity){ a.opacity = b.opacity = 1; a.transform = b.transform = 'none'; }
      if (el.__ppA) el.__ppA.cancel();
      el.__ppA = open ? el.animate([a, b], { duration: 600, easing: EASE }) : el.animate([b, a], { duration: 420, easing: EASE, fill: 'forwards' });
      if (!open) el.__ppA.onfinish = function(){ this.cancel(); };
    };
  }
  onOpen(document.getElementById('pp-games'), circler(document.getElementById('pp-games'), true));
  onOpen(document.getElementById('ppx-hub'), circler(document.getElementById('ppx-hub'), true));
  (function(){ var g = document.getElementById('pp-game'); if (g){ var c = circler(g, false); onOpen(g, function(o){ if (o) c(true); }); } })();
  // the player page: from the mini-player it rises (it sits right there). Opened from a card on Home it grows out of that
  // card; from a row in the Library it opens outwards from that row's line. Closing takes it back into the playing card or row.
  var mainEl = document.getElementById('main'), cameFrom = null, mAnim = null;
  function inset(r, round){
    var W = innerWidth, H = innerHeight;
    return 'inset(' + Math.max(0, r.top) + 'px ' + Math.max(0, W - r.right) + 'px ' + Math.max(0, H - r.bottom) + 'px ' + Math.max(0, r.left) + 'px round ' + round + 'px)';
  }
  function onScreen(r){ return r && r.width > 0 && r.height > 0 && r.bottom > 8 && r.top < innerHeight - 8 && r.right > 8 && r.left < innerWidth - 8; }
  function target(kind, r){   // the clip the page starts from / ends at
    if (kind === 'row') return inset({ top: r.top, bottom: r.bottom, left: 0, right: innerWidth }, 0);
    return inset(r, 14);
  }
  // With the native video player the picture is drawn by Android under a see-through page, so this clip can't shape it,
  // and while the clip grows the page under the player (the Library) shows through and covers the video. Videos there
  // rise like they do from the mini-player instead.
  function nativeVideoShown(){
    try { return body.classList.contains('pl-video') && !!(window.PPNative && PPNative.enabled && PPNative.nativeVideoSetting && PPNative.nativeVideoSetting()); } catch(e){ return false; }
  }
  function morphPlayer(opening){
    if (!mainEl || !mainEl.animate || !motionOk()) return;
    if (mAnim){ mAnim.cancel(); mAnim = null; }
    if (nativeVideoShown()){ cameFrom = null; return; }
    var kind = null, r = null, f;
    if (opening){
      f = fresh(); cameFrom = null;
      if (f && !f.mini && onScreen(f.card)){ kind = 'card'; r = f.card; }
      else if (f && !f.mini && onScreen(f.row)){ kind = 'row'; r = f.row; }
      cameFrom = kind;
    } else {
      if (!cameFrom) return;                      // came up from the mini-player: sinks back down to it
      var v = body.dataset.plView, el = (v === 'home' || v === 'playlists')
        ? document.querySelector('#pl-home .ph-card.cur, #pl-home .ph-trk.cur') : document.querySelector('#playlist .track.active');
      r = el && el.getBoundingClientRect();
      if (!onScreen(r)) return;                   // the playing song isn't on screen: plain sink
      kind = el.classList.contains('track') ? 'row' : 'card';
    }
    if (!kind) return;
    var small = target(kind, r), full = 'inset(0px 0px 0px 0px round 0px)', video = body.classList.contains('pl-video');
    var base = { translate: '0 0', visibility: 'visible' }; if (video) base.background = '#000';
    function k(o){ for (var n in base) o[n] = base[n]; return o; }
    mAnim = opening
      ? mainEl.animate([k({ clipPath: small, opacity: .6 }), k({ clipPath: full, opacity: 1 })], { duration: 540, easing: EASE })
      : mainEl.animate([k({ clipPath: full, opacity: 1 }), k({ clipPath: small, opacity: 1, offset: .82 }), k({ clipPath: small, opacity: 0 })], { duration: 460, easing: EASE });
    mAnim.onfinish = mAnim.oncancel = function(){ mAnim = null; };
  }
  var hadP2 = body.hasAttribute('data-pl-player');
  new MutationObserver(function(){
    var p = body.hasAttribute('data-pl-player'); if (p === hadP2) return; hadP2 = p; morphPlayer(p);
  }).observe(body, { attributes: true, attributeFilter: ['data-pl-player'] });
  // ---- touch feedback ----
  // CSS :active is gone the instant a quick tap ends, so on a phone most taps showed nothing. Here every tap gets the
  // whole motion: the control squeezes under the finger, springs back when let go (even after the shortest tap), and a
  // soft glow spreads from the exact spot touched. Rows and cards wait a moment first, so scrolling a list doesn't set them off.
  var TAP = 'button, [role="button"], summary, select.pill-btn, .ph-card, .ph-pl, .ph-trk, .track, .ppg-card',
      TAP_BIG = '.ph-card, .ph-pl, .ph-trk, .track, .ppg-card, .ppx-tile, .ppx-card, #pl-mini',
      SPRING = 'cubic-bezier(.3,1.45,.45,1)';
  var press = null;   // { el, t, anim, timer, x, y, big }
  function ripple(el, x, y){
    var r = el.getBoundingClientRect(); if (!r.width || !r.height) return;
    var box = document.createElement('span'), dot = document.createElement('i');
    box.className = 'pp-r-ripple';
    box.style.cssText = 'left:' + r.left + 'px;top:' + r.top + 'px;width:' + r.width + 'px;height:' + r.height + 'px;border-radius:' + getComputedStyle(el).borderRadius;
    var lx = x - r.left, ly = y - r.top, d = 2 * Math.hypot(Math.max(lx, r.width - lx), Math.max(ly, r.height - ly)) * 1.4;
    dot.style.cssText = 'left:' + lx + 'px;top:' + ly + 'px;width:' + d + 'px;height:' + d + 'px';
    box.appendChild(dot); (document.fullscreenElement || body).appendChild(box);
    var grow = dot.animate([{ scale: '.12', opacity: 1 }, { scale: '1', opacity: 1 }], { duration: Math.min(520, 260 + d * .5), easing: 'cubic-bezier(.2,.8,.2,1)', fill: 'forwards' });
    return { box: box, dot: dot, grow: grow };
  }
  function fade(rp){
    if (!rp) return;
    var a = rp.box.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 380, easing: 'ease-out', fill: 'forwards' });
    a.onfinish = a.oncancel = function(){ if (rp.box.parentNode) rp.box.parentNode.removeChild(rp.box); };
  }
  function pressDown(p){
    if (p.down || !p.el.isConnected) return;
    p.down = true; p.t = performance.now();
    p.anim = p.el.animate([{ scale: p.big ? '.965' : '.9' }], { duration: 110, easing: 'cubic-bezier(.2,.8,.2,1)', fill: 'forwards' });
    p.rp = ripple(p.el, p.x, p.y);
  }
  function pressUp(p, cancelled){
    clearTimeout(p.timer);
    if (!p.down){ if (cancelled) return; pressDown(p); }   // a tap quicker than the wait still gets its motion
    var wait = Math.max(0, 90 - (performance.now() - p.t));
    setTimeout(function(){
      try { p.anim.cancel(); } catch(e){}
      if (p.el.isConnected) p.el.animate([{ scale: p.big ? '.965' : '.9' }, { scale: p.big ? '1.008' : '1.03', offset: .55 }, { scale: '1' }], { duration: cancelled ? 220 : 420, easing: 'cubic-bezier(.2,.8,.2,1)' });
      fade(p.rp);
    }, cancelled ? 0 : wait);
  }
  document.addEventListener('pointerdown', function(e){
    if (press){ pressUp(press, true); press = null; }
    if (!refined() || calm.matches || (e.pointerType === 'mouse' && e.button !== 0) || !e.target.closest) return;
    var el = e.target.closest(TAP + ', ' + TAP_BIG);
    if (!el || el.disabled || el.getAttribute('aria-disabled') === 'true' || !el.animate || el.closest('.no-press')) return;
    var p = press = { el: el, x: e.clientX, y: e.clientY, big: el.matches(TAP_BIG), down: false, id: e.pointerId };
    if (p.big && e.pointerType !== 'mouse') p.timer = setTimeout(function(){ pressDown(p); }, 70); else pressDown(p);
  }, { capture: true, passive: true });
  function end(cancelled){ return function(e){ if (press && (e.pointerId == null || e.pointerId === press.id)){ var p = press; press = null; pressUp(p, cancelled); } }; }
  document.addEventListener('pointerup', end(false), { capture: true, passive: true });
  document.addEventListener('pointercancel', end(true), { capture: true, passive: true });
  window.addEventListener('blur', end(true));
  // a finger that slides well off its starting point is dragging, not tapping
  document.addEventListener('pointermove', function(e){
    if (press && e.pointerId === press.id && Math.hypot(e.clientX - press.x, e.clientY - press.y) > 14 && press.big){ var p = press; press = null; pressUp(p, true); }
  }, { capture: true, passive: true });
  ['pp-r-in', 'pp-r-up', 'pp-r-rise', 'pp-r-stag', 'pp-r-fwd', 'pp-r-back', 'pp-r-pop', 'pp-r-swap', 'pp-r-zin', 'pp-r-zout'].forEach(function(c){
    document.addEventListener('animationend', function(e){ if (e.target.classList && e.target.classList.contains(c)) e.target.classList.remove(c); }, true);
  });
})();
