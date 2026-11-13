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
  var calm = window.matchMedia ? matchMedia('(prefers-reduced-motion: reduce)') : { matches: false };
  // The little entrance motions, run with the Web Animations API. Restarting a CSS class needed a forced re-layout
  // for every element (a long stall before a list could start moving); these start without one, and only touch
  // opacity and movement, so the phone's GPU runs them even while the page script is busy.
  var OUT = 'cubic-bezier(.2,.8,.2,1)';
  var FX = {
    'pp-r-in':   [[{ opacity: 0, translate: '0 10px' }, { opacity: 1, translate: '0 0' }], 380],
    'pp-r-stag': [[{ opacity: 0, translate: '0 10px' }, { opacity: 1, translate: '0 0' }], 420],
    'pp-r-rise': [[{ opacity: 0, translate: '0 24px', scale: '.96' }, { opacity: 1, translate: '0 -3px', scale: '1.01', offset: .7 }, { opacity: 1, translate: '0 0', scale: '1' }], 550],
    'pp-r-fwd':  [[{ opacity: 0, translate: '30px 0' }, { opacity: 1, translate: '0 0' }], 340],
    'pp-r-back': [[{ opacity: 0, translate: '-30px 0' }, { opacity: 1, translate: '0 0' }], 340],
    'pp-r-pop':  [[{ scale: '.55', opacity: .2, rotate: '-25deg' }, { scale: '1.14', opacity: 1, rotate: '0deg', offset: .6 }, { scale: '1', opacity: 1, rotate: '0deg' }], 380],
    'pp-r-swap': [[{ opacity: 0, translate: '0 7px' }, { opacity: 1, translate: '0 0' }], 320],
    'pp-r-zin':  [[{ scale: '.8', opacity: .5 }, { scale: '1', opacity: 1 }], 500],
    'pp-r-zout': [[{ scale: '1.18', opacity: .6 }, { scale: '1', opacity: 1 }], 450]
  };
  // Another animation already moving the element (the tab slide moves the whole page) would make the GPU give up on
  // both and hand them to the busy page thread, so in that case the element is left alone.
  function busy(el){
    if (!el.getAnimations) return false;
    var a = el.getAnimations();
    for (var i = 0; i < a.length; i++) if (a[i] !== el.__ppFx && a[i].playState === 'running') return true;
    return false;
  }
  function play(el, cls, delay){
    var fx = FX[cls]; if (!el || !el.animate || !fx || calm.matches) return;
    if (el.__ppFx){ el.__ppFx.cancel(); el.__ppFx = null; }
    if (busy(el)) return;
    var a = el.__ppFx = el.animate(fx[0], { duration: fx[1], delay: delay || 0, easing: OUT, fill: 'backwards' });
    a.onfinish = function(){ if (el.__ppFx === a) el.__ppFx = null; };
  }
  function stagger(root, sel, max){
    if (!root || calm.matches) return;
    // measure everything first, then start everything: no layout work between one item and the next
    var items = root.querySelectorAll(sel), pick = [];
    for (var i = 0; i < items.length && pick.length < max; i++){
      var r = items[i].getBoundingClientRect();
      if (r.height && r.bottom > 0 && r.top < innerHeight) pick.push(items[i]);   // only what's on screen
    }
    for (var j = 0; j < pick.length; j++) play(pick[j], 'pp-r-stag', j * 32);
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
    // changes inside an open menu (a slider's value while it is dragged) can't move the pills: measuring the bar on
    // every one of them cost a layout each frame
    new MutationObserver(function(list){
      for (var i = 0; i < list.length; i++){
        var t = list[i].target, el = t.nodeType === 1 ? t : t.parentElement;
        if (!el || !el.closest || !el.closest('[id$="-dropdown"]')) return queue();
      }
    }).observe(bar, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['style', 'hidden', 'class'] });
    new MutationObserver(queue).observe(body, { attributes: true, attributeFilter: ['class', 'data-pl-player'] });
    window.addEventListener('resize', function(){ seen = null; queue(); });
    queue();
  });
  // ---- things grow out of where you touched, and shrink back into it ----
  var GROW = 'cubic-bezier(.34,1.3,.5,1)';
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
  // full pages (Games, Points, a game): the page grows out of the spot touched and shrinks back into it.
  // Only scale and opacity, which the GPU runs by itself. (This used to be a circular clip-path, which this WebView
  // redraws on the page thread every frame, right when that thread is busy building the page: it stuttered.)
  function circler(el){
    return function(open){
      var f = fresh(), r = el.getBoundingClientRect();
      if (open) el.__ppO = f ? [f.x - r.left, f.y - r.top] : null;
      var o = el.__ppO;
      el.style.transformOrigin = o ? o[0] + 'px ' + o[1] + 'px' : '50% 50%';
      if (el.__ppA) el.__ppA.cancel();
      var small = { opacity: 0, transform: 'scale(.55)' }, full = { opacity: 1, transform: 'none' };
      el.__ppA = open
        ? el.animate([small, { opacity: 1, offset: .45 }, full], { duration: 460, easing: OUT })
        : el.animate([full, { opacity: 1, offset: .3 }, small], { duration: 320, easing: 'cubic-bezier(.4,0,.8,.4)', fill: 'forwards' });
      if (!open) el.__ppA.onfinish = function(){ this.cancel(); };
    };
  }
  onOpen(document.getElementById('pp-games'), circler(document.getElementById('pp-games')));
  onOpen(document.getElementById('ppx-hub'), circler(document.getElementById('ppx-hub')));
  (function(){ var g = document.getElementById('pp-game'); if (g){ var c = circler(g); onOpen(g, function(o){ if (o) c(true); }); } })();
  // the player page: from the mini-player it rises (it sits right there). Opened from a card on Home it grows out of that
  // card; from a row in the Library it opens outwards from that row's line. Closing takes it back into the playing card or row.
  // Only opacity and scale are animated, so the GPU runs it by itself even while the page thread is busy opening the
  // song. (It used to be a clip-path, which this WebView redraws on the page thread every frame: it stuttered.)
  var mainEl = document.getElementById('main'), cameFrom = null, mAnim = null;
  function onScreen(r){ return r && r.width > 0 && r.height > 0 && r.bottom > 8 && r.top < innerHeight - 8 && r.right > 8 && r.left < innerWidth - 8; }
  function target(kind, r){   // where the page grows from / shrinks into: [origin x, origin y, starting scale]
    var W = innerWidth, H = innerHeight, cy = (r.top + r.bottom) / 2;
    if (kind === 'row') return [W / 2, cy, .9];   // a row is the full width already: the page opens outwards from its line
    return [(r.left + r.right) / 2, cy, Math.max(.3, Math.min(.8, Math.max(r.width / W, r.height / H)))];
  }
  // With the native video player the picture is drawn by Android under a see-through page, so this clip can't shape it,
  // and while the clip grows the page under the player (the Library) shows through and covers the video. Videos there
  // rise like they do from the mini-player instead.
  function nativeVideoShown(){
    try { return body.classList.contains('pl-video') && !!(window.PPNative && PPNative.enabled && PPNative.nativeVideoSetting && PPNative.nativeVideoSetting()); } catch(e){ return false; }
  }
  function morphPlayer(opening){
    if (!mainEl || !mainEl.animate || !motionOk()) return;
    if (mAnim){ var old = mAnim; mAnim = null; old.cancel(); mainEl.style.transformOrigin = mainEl.style.visibility = mainEl.style.backgroundColor = ''; }
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
    var t = target(kind, r), small = { opacity: 0, transform: 'scale(' + t[2] + ')', translate: '0px 0px' }, full = { opacity: 1, transform: 'none', translate: '0px 0px' };
    // kept visible (and black behind a video) by inline style for the run, not by keyframes: a keyframe property the
    // GPU can't animate would send the whole animation back to the page thread
    var st = mainEl.style;
    st.transformOrigin = t[0] + 'px ' + t[1] + 'px'; st.visibility = 'visible';
    if (body.classList.contains('pl-video')) st.backgroundColor = '#000';
    var a = mAnim = opening
      ? mainEl.animate([small, { opacity: 1, offset: .4 }, full], { duration: 480, easing: OUT })
      : mainEl.animate([full, { opacity: 1, offset: .35 }, small], { duration: 360, easing: 'cubic-bezier(.4,0,.8,.4)' });
    a.onfinish = a.oncancel = function(){
      if (mAnim !== a) return;
      mAnim = null; st.transformOrigin = ''; st.visibility = ''; st.backgroundColor = '';
    };
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
})();
