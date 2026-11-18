  // ===================== extras: pictures that move to the beat, slideshows, the cover behind a widget =====================

  // ---------- picture fidgets bounce to the music ----------
  // "Bounces to the music": while something plays, the picture swells on each beat (the player's own beat detection,
  // the one the visualiser and haptics use). It uses the CSS scale property, so it adds to a spin or a squish.
  (function(){
    [T.image, T.drawing, T.picfx].forEach(function(d){
      var at = d.fields.findIndex(function(f){ return f[0] === 'fxshow'; });
      d.fields.splice(at, 0, ['beat', 'Bounces to the music', 'toggle', false, fxOn]);
    });
    var prevLive = ifxLive;
    ifxLive = function(el, st){
      prevLive(el, st);
      var o = el._fd && el._fd.o;
      if (o && o.beat && st.playing && !el._beat) beatLoop(el);
    };
    T.ifx.live = function(el, st){ ifxLive(el, st); };
    T.picfx.live = function(el, st){ ifxLive(el, st); };
  })();
  function beatLoop(el){
    el._beat = true;
    var obj = el.querySelector('.pw-ifx-obj'), s = 1;
    function frame(){
      var st = liveState();
      if (!el.isConnected || !st.playing || !fdVisible(el)){ obj.style.scale = ''; el._beat = false; return; }
      window.__ppVizWant = performance.now();                 // asks the player to keep its sound analysis running
      var lv = window.__ppVizLevels ? window.__ppVizLevels() : null, p = lv ? lv.pulse || 0 : 0;
      var target = 1 + Math.min(1, p) * 0.14;
      s += (target - s) * (target > s ? 0.6 : 0.14);           // jumps up on the beat, eases back down
      obj.style.scale = s.toFixed(4);
      requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  }
  // fdData is what the fidget reads its options from: keep "beat" in it too
  (function(){
    var prev = fdData;
    fdData = function(it, o, keys){ return prev(it, o, keys.indexOf('fx') >= 0 && keys.indexOf('beat') < 0 ? keys.concat(['beat']) : keys); };
  })();

  // ---------- Slideshow ----------
  // Up to five pictures of your own, or covers from your library, one after the other.
  var SLIDE_N = 5;
  T.slides = { name:'Slideshow', icon:'image', kind:'box', zones:['home','page','player','video'], w:'full', desc:'Your pictures, or covers from your library, one after another',
    rerender:['src'],
    fields:[['src','Pictures','seg',[['','Your own'],['covers','Covers from your library'],['recent','Covers of what you played']]]].concat(
      [1, 2, 3, 4, 5].map(function(n){ return ['img' + n, 'Picture ' + n, 'image', '', function(o){ return !o.src && (n === 1 || !!o['img' + (n - 1)]); }]; }),
      [['every','Change','seg',[['5','5 s'],['','10 s'],['30','30 s'],['tap','On a tap']]],['fx','Change with','seg',[['','Fade'],['slide','Slide'],['zoom','Slow zoom']]],
       ['h','Height','range',[80, 420, 10, 'px', 180]],['fit','Fit','seg',[['','Fill'],['contain','Whole picture']]],['dots','Show dots','toggle',true]]),
    render:function(o, c, ctx, it){
      var pics = slidePics(o), h = Math.max(80, Math.min(420, +o.h || 180));
      if (!pics.length) return '<div class="pw-img pw-img-empty" style="height:' + h + 'px">' + svg('image') + '<span>' + (o.src ? 'No covers yet' : 'Pick some pictures in this box’s settings') + '</span></div>';
      return '<div class="pw-sl2 pw-sl2-' + esc(o.fx || 'fade') + (o.fit === 'contain' ? ' pw-sl2-contain' : '') + '" data-pw-live="slides" data-id="' + esc(it ? it.id : 'x') + '" data-every="' + esc(o.every || '10') + '" style="height:' + h + 'px">' +
        pics.map(function(p, k){ return '<div class="pw-sl2-i' + (k ? '' : ' on') + '"><img alt="" decoding="async" loading="lazy" src="' + esc(p.src) + '">' + (p.cap ? '<span class="pw-sl2-cap">' + esc(p.cap) + '</span>' : '') + '</div>'; }).join('') +
        (o.dots === false || pics.length < 2 ? '' : '<div class="pw-sl2-dots">' + pics.map(function(p, k){ return '<i' + (k ? '' : ' class="on"') + '></i>'; }).join('') + '</div>') + '</div>';
    },
    live:function(el){
      var items = el.querySelectorAll('.pw-sl2-i'), n = items.length; if (n < 2) return;
      var m = fdMem('sl2:' + el.dataset.id, { i: 0, at: Date.now() }), ev = el.dataset.every;
      if (ev !== 'tap' && Date.now() - m.at >= (+ev || 10) * 1000){ m.i = (m.i + 1) % n; m.at = Date.now(); }
      slideShow(el, m.i);
    } };
  function slidePics(o){
    if (!o.src) return [1, 2, 3, 4, 5].map(function(n){ return o['img' + n]; }).filter(function(v){ return typeof v === 'string' && v.indexOf('data:image/') === 0; }).map(function(s){ return { src: s }; });
    var A = api(), K = kit(); if (!A) return [];
    var t = A.tracks(), out = [], seen = {};
    var add = function(x){ var s = x && thumbOf(x); if (s && !seen[s] && out.length < 12){ seen[s] = 1; out.push({ src: s, cap: x.title }); } };
    if (o.src === 'recent' && K){ var byId = new Map(t.map(function(x){ return [x.dbId, x]; })); K.history().forEach(function(h){ add(byId.get(h.id)); }); }
    else shuffled(playable()).forEach(function(i){ add(t[i]); });
    return out;
  }
  function slideShow(el, i){
    if (el._i === i) return; el._i = i;
    el.querySelectorAll('.pw-sl2-i').forEach(function(x, k){ x.classList.toggle('on', k === i); x.classList.toggle('was', k !== i && x.classList.contains('on')); });
    el.querySelectorAll('.pw-sl2-dots i').forEach(function(x, k){ x.classList.toggle('on', k === i); });
  }
  document.addEventListener('click', function(e){
    var el = e.target.closest && e.target.closest('[data-pw-live="slides"]'); if (!el || editing) return;
    var n = el.querySelectorAll('.pw-sl2-i').length; if (n < 2) return;
    var m = fdMem('sl2:' + el.dataset.id, { i: 0, at: Date.now() }), r = el.getBoundingClientRect();
    m.i = (m.i + (e.clientX < r.left + r.width * 0.3 ? n - 1 : 1)) % n; m.at = Date.now();
    slideShow(el, m.i);
  });

  // ---------- the cover of what is playing, behind any widget ----------
  // "Behind it: Cover art" in Every widget: the cover, blurred (or not) and darkened, changing with the song.
  var coverNow = null;
  function coverSync(){
    if (!document.querySelector('.pw-bx-cover')) return;
    var st = liveState(), s = st.has ? thumbOf(st.t) : null;
    if (s === coverNow) return; coverNow = s;
    document.body.style.setProperty('--pw-cover', s ? 'url("' + String(s).replace(/"/g, '%22') + '")' : 'none');
  }
  setInterval(coverSync, 1000);
  (function(){ var prev = liveUpdate; liveUpdate = function(){ coverSync(); return prev.apply(this, arguments); }; })();
