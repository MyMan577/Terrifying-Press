  // ===================== fidgets =====================
  // Things to spin, pop, flick and squish. Each one can also run an action of the app (a hard flick plays the next
  // track, popping every bubble shuffles...) and most can show the time, the date, a calendar page or a count.
  // Canvas fidgets draw only while on screen, and the ones that can rest (spinner, knob) stop drawing when still.
  // What should outlive a restart (spin counts, popped bubbles, switch states) is kept in localStorage 'ppFidgetsV1'.
  var FZ = ['home','page','player'];
  var FD_KEY = 'ppFidgetsV1', FDS = (function(){ try { return JSON.parse(localStorage.getItem(FD_KEY)) || {}; } catch(e){ return {}; } })(), fdSaveT = 0, FDM = {};
  function fdKeep(id, def){ if (!FDS[id] || typeof FDS[id] !== 'object') FDS[id] = def; return FDS[id]; }    // kept across restarts
  function fdMem(id, def){ if (!FDM[id]) FDM[id] = def; return FDM[id]; }                                    // kept across re-renders
  function fdSave(){ clearTimeout(fdSaveT); fdSaveT = setTimeout(function(){ try { localStorage.setItem(FD_KEY, JSON.stringify(FDS)); } catch(e){} }, 700); }
  function fdOpts(el){ try { return JSON.parse(el.dataset.o || '{}') || {}; } catch(e){ return {}; } }
  function fdData(it, o, keys){ var x = {}; keys.forEach(function(k){ if (o[k] != null && o[k] !== '') x[k] = o[k]; }); return ' data-id="' + esc(it ? it.id : 'x') + '" data-o="' + esc(JSON.stringify(x)) + '"'; }
  function fdBuzz(o, ms){ if (o.buzz === false || !navigator.vibrate) return; try { navigator.vibrate(ms); } catch(e){} }
  // Short synthesised clicks and pops (off unless switched on: some phones duck the music for any other sound).
  var fdCtx = null;
  function fdSound(o, kind){
    if (!o.snd) return;
    try {
      if (!fdCtx){ var AC = window.AudioContext || window.webkitAudioContext; if (!AC) return; fdCtx = new AC(); }
      if (fdCtx.state === 'suspended') fdCtx.resume();
      var t = fdCtx.currentTime, os = fdCtx.createOscillator(), g = fdCtx.createGain();
      if (kind === 'pop'){ os.type = 'sine'; os.frequency.setValueAtTime(520 + Math.random() * 160, t); os.frequency.exponentialRampToValueAtTime(140, t + 0.07); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.22, t + 0.004); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.09); }
      else { os.type = 'square'; os.frequency.setValueAtTime(kind === 'tick' ? 2400 : 1500, t); g.gain.setValueAtTime(kind === 'tick' ? 0.025 : 0.06, t); g.gain.exponentialRampToValueAtTime(0.0001, t + (kind === 'tick' ? 0.012 : 0.03)); }
      os.connect(g); g.connect(fdCtx.destination); os.start(t); os.stop(t + 0.12);
    } catch(e){}
  }
  // Runs the action a fidget was set up with, and flashes the widget so you can see it did.
  var fdLast = {};
  function fdFire(el, a, key){
    if (!a || editing || !ACTIONS[a] || !ACTIONS[a].run || a === 'page') return false;
    var k = (el.dataset.id || '') + key, now = Date.now(); if (now - (fdLast[k] || 0) < 900) return false; fdLast[k] = now;
    el.classList.remove('pw-fd-fired'); void el.offsetWidth; el.classList.add('pw-fd-fired');
    runAction(a); liveSoon(); return true;
  }
  // What a fidget can show in its middle.
  function fdFaceHTML(kind, st, count, countLabel){
    var n = st.now;
    if (kind === 'time') return '<b>' + esc(n.toLocaleTimeString(undefined, { hour:'numeric', minute:'2-digit' })) + '</b>';
    if (kind === 'date') return '<small>' + esc(n.toLocaleDateString(undefined, { weekday:'long' })) + '</small><b>' + esc(n.toLocaleDateString(undefined, { day:'numeric', month:'short' })) + '</b>';
    if (kind === 'cal') return '<span class="pw-fd-cal"><i>' + esc(n.toLocaleDateString(undefined, { month:'short' })) + '</i><b>' + n.getDate() + '</b><small>' + esc(n.toLocaleDateString(undefined, { weekday:'short' })) + '</small></span>';
    if (kind === 'np') return st.has ? '<small>Now playing</small><b class="pw-fd-np">' + esc(st.t.title) + '</b>' : '<small>Nothing playing</small>';
    if (kind === 'count') return '<b>' + (count || 0).toLocaleString() + '</b><small>' + esc(countLabel || '') + '</small>';
    return '';
  }
  function fdFace(el, html){ var f = el.querySelector('.pw-fd-face'); if (f && f._h !== html){ f._h = html; f.innerHTML = html; f.classList.toggle('pw-fd-face-on', !!html); } }
  var FACE = [['time','Time'],['date','Date'],['cal','Calendar']];
  function faceSeg(first, extra){ return [first].concat(FACE, extra || []); }
  // Drawing loop: one per fidget, only while it is on screen and (for the ones that can rest) while it moves.
  function fdVisible(el){
    if (document.hidden || !el.offsetParent) return false;
    if (el.closest('#pp-ringscreen')) return true;   // the ringing screen covers everything (pp-widgets-pendulum.js)
    var inPlayer = !!el.closest('#pw-player-zone, #pw-player-top, #pw-video-zone'), playerOpen = body.hasAttribute('data-pl-player');
    return inPlayer ? playerOpen : !playerOpen;
  }
  function fdWake(el){
    var f = el._fd; if (!f || f.awake) return;
    f.awake = true; var last = 0;
    function frame(ts){
      if (!el.isConnected || !fdVisible(el)){ f.awake = false; return; }
      var dt = last ? Math.min(0.05, (ts - last) / 1000) : 1 / 60; last = ts;
      if (f.cv) fdSize(f);
      if (f.step(dt, ts) === false){ f.awake = false; return; }
      requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  }
  function fdSize(f){
    var dpr = Math.min(f.maxDpr || 3, window.devicePixelRatio || 1), w = Math.max(1, Math.round(f.cv.clientWidth * dpr)), h = Math.max(1, Math.round(f.cv.clientHeight * dpr));
    if (f.cv.width !== w || f.cv.height !== h){ f.cv.width = w; f.cv.height = h; f.dirty = true; f.sprite = null; }
    f.w = w; f.h = h; f.dpr = dpr;
  }
  function fdSetup(el, step, maxDpr){
    var cv = el.querySelector('canvas');
    var f = el._fd = { o: fdOpts(el), id: el.dataset.id || 'x', step: step, awake: false, cv: cv, g: cv ? cv.getContext('2d') : null, maxDpr: maxDpr, dirty: true, w: 1, h: 1, dpr: 1 };
    if (cv){ cv.style.touchAction = 'pan-y'; fdSize(f); }      // the page can still scroll over it (see fdPointer)
    return f;
  }
  // Where the pointer is on the canvas, in canvas pixels.
  function fdPt(f, e){ var r = (f.cv || f.pad).getBoundingClientRect(); return { x: (e.clientX - r.left) * f.dpr, y: (e.clientY - r.top) * f.dpr }; }
  // Whether a touch at (x, y) (page pixels) is on the fidget itself. f.hit tells for the round ones: the canvas is a
  // whole rectangle, and a touch on the empty part around a spinner or a knob is the page's (it scrolls).
  function fdOwns(f, x, y){
    if (!f.hit) return true;
    var r = (f.cv || f.pad).getBoundingClientRect();
    return f.hit(x - r.left, y - r.top, r.width, r.height);
  }
  /** A circle in the middle of the canvas, [k] of the shorter side across (plus a little to spare for fingers). */
  function fdRound(k){ return function(x, y, w, h){ return Math.hypot(x - w / 2, y - h / 2) <= Math.min(w, h) * k + 10; }; }
  // Fidgets and scrolling: a touch that starts on the fidget is the fidget's, and the page does not move under it;
  // anywhere else on the widget the page scrolls as usual. A fidget that fills its whole box (the nebula) lets the
  // page have a swipe that starts clearly up or down, and takes everything else. Neither ever switches tabs.
  function fdPointer(f, h){
    // the canvas, or (a picture fidget) the box the picture moves in
    var cv = f.cv || f.pad, id = null, tOwn = false, tDecided = false, tx = 0, ty = 0;
    cv.addEventListener('touchstart', function(e){
      var t = e.touches[0];
      tOwn = !editing && e.touches.length === 1 && !!t && fdOwns(f, t.clientX, t.clientY); tDecided = false;
      if (t){ tx = t.clientX; ty = t.clientY; }
      if (tOwn) e.ppNoTabSwipe = true;                       // read by the tab swipe (player-layout.js)
    }, { passive: true });
    cv.addEventListener('touchmove', function(e){
      if (!tOwn) return;
      var t = e.touches[0];
      if (!tDecided && t){
        var dx = t.clientX - tx, dy = t.clientY - ty;
        if (f.scrollVertical){
          if (Math.hypot(dx, dy) < 8) return;               // not yet clear which way: decide on the next move
          tDecided = true;
          if (Math.abs(dy) > Math.abs(dx) * 1.3){ tOwn = false; return; }   // a scroll: the page takes it
        } else tDecided = true;
      }
      if (e.cancelable) e.preventDefault();
    }, { passive: false });
    cv.addEventListener('pointerdown', function(e){
      if (editing || id != null) return;
      if (!fdOwns(f, e.clientX, e.clientY)) return;          // on the empty part of the canvas: not the fidget's
      id = e.pointerId; try { cv.setPointerCapture(id); } catch(x){} e.preventDefault(); h.down(fdPt(f, e), e); fdWake(f.cv ? cv.parentNode : cv);
    });
    cv.addEventListener('pointermove', function(e){ if (e.pointerId !== id) return; h.move(fdPt(f, e), e); });
    var up = function(e){ if (e.pointerId !== id) return; id = null; h.up(fdPt(f, e), e); fdWake(f.cv ? cv.parentNode : cv); };
    cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);
  }
  // Colours: the widget's colour (or the theme's accent) as numbers, and mixes of it.
  function rgbOf(s){
    var m = /color\(srgb ([\d.]+) ([\d.]+) ([\d.]+)/.exec(s); if (m) return [m[1] * 255, m[2] * 255, m[3] * 255].map(Math.round);
    m = /rgba?\(([^)]+)\)/.exec(s); if (m){ var p = m[1].split(/[\s,\/]+/).map(parseFloat); if (p.length >= 3) return p.slice(0, 3).map(Math.round); }
    return [110, 231, 208];
  }
  function mixC(a, b, t, al){ var c = [0, 1, 2].map(function(i){ return Math.round(a[i] + (b[i] - a[i]) * t); }); return al == null ? 'rgb(' + c.join(',') + ')' : 'rgba(' + c.join(',') + ',' + al + ')'; }
  var WHITE = [255, 255, 255], BLACK = [0, 0, 0];
  function fdCol(el){ return rgbOf(getComputedStyle(el).color); }
  function angDiff(a, b){ var d = a - b; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2; return d; }
  function fdBox(o, inner, cls, h){ return '<div class="pw-fd ' + cls + '"' + (h ? ' style="height:' + h + 'px' + (okCol(o.color) ? ';--pw-fc:' + o.color : '') + '"' : okCol(o.color) ? ' style="--pw-fc:' + o.color + '"' : '') + inner; }

  // ---------- Fidget spinner ----------
  var SPIN_FR = { short: [0.6, 1.2], '': [0.26, 0.45], long: [0.1, 0.18] };
  T.spinner = { name:'Fidget spinner', icon:'spinner', kind:'box', zones:FZ, w:'half', desc:'Flick it and watch it go. A hard flick or the stop can play something',
    fields:[['arms','Arms','seg',[['2','2'],['','3'],['4','4'],['5','5'],['6','6']]],['look','Look','seg',[['','Classic'],['ring','Ring'],['petal','Petals']]],
            ['spin','Spins for','seg',[['short','A moment'],['','A while'],['long','Ages']]],['h','Size','range',[100, 320, 10, 'px', 170]],['color','Colour','color',''],
            ['show','In the middle','seg',faceSeg(['','Nothing'],[['count','Spins'],['rpm','Speed']])],['buzz','Vibrate','toggle',true],
            ['onspin','A hard flick does','fidact',''],['onstop','When it stops after a spin','fidact','']],
    render:function(o, c, ctx, it){
      var h = Math.max(100, Math.min(320, +o.h || 170));
      return fdBox(o, fdData(it, o, ['arms','look','spin','show','buzz','onspin','onstop']) + ' data-pw-live="spinner"><canvas></canvas><div class="pw-fd-face"></div></div>', 'pw-fd-spin', h);
    },
    live:function(el, st){
      if (!el._fd) spinInit(el);
      var f = el._fd, s = f.s, show = f.o.show, cs = getComputedStyle(el).color;
      if (cs !== f.cs){ if (f.cs) f.sprite = null; f.cs = cs; f.dirty = true; }
      fdFace(el, show === 'rpm' ? '<b>' + Math.round(Math.abs(s.v) * 60 / (Math.PI * 2)) + '</b><small>rpm</small>' : fdFaceHTML(show, st, Math.floor(f.k.spins), 'spins'));
      if (f.dirty || s.v) fdWake(el);
    } };
  function spinInit(el){
    var f = fdSetup(el, step, 3), o = f.o, arms = Math.max(2, Math.min(6, +o.arms || 3)), fr = SPIN_FR[o.spin] || SPIN_FR[''];
    f.hit = fdRound(0.5);
    var s = f.s = fdMem(f.id, { a: 0, v: 0, peak: 0 }), k = f.k = fdKeep(f.id, { spins: 0 });
    var samples = [], lastAng = 0, lastMove = 0, faceAt = 0, seg = 0;
    fdPointer(f, {
      down: function(p){ f.drag = true; s.v = 0; lastAng = Math.atan2(p.y - f.h / 2, p.x - f.w / 2); samples = [[performance.now(), s.a]]; lastMove = performance.now(); seg = Math.floor(s.a / (Math.PI * 2 / arms)); },
      move: function(p){
        var dx = p.x - f.w / 2, dy = p.y - f.h / 2; if (Math.hypot(dx, dy) < 10 * f.dpr) return;
        var a = Math.atan2(dy, dx), d = angDiff(a, lastAng); lastAng = a;
        s.a += d; k.spins += Math.abs(d) / (Math.PI * 2);
        var now = performance.now(); samples.push([now, s.a]); lastMove = now;
        while (samples.length > 2 && now - samples[0][0] > 90) samples.shift();
        var sg = Math.floor(s.a / (Math.PI * 2 / arms)); if (sg !== seg){ seg = sg; fdBuzz(o, 4); }
      },
      up: function(){
        f.drag = false; var now = performance.now(), a = samples[0], b = samples[samples.length - 1];
        s.v = a && b && b[0] - a[0] > 8 && now - lastMove < 70 ? (b[1] - a[1]) / ((b[0] - a[0]) / 1000) : 0;
        s.v = Math.max(-80, Math.min(80, s.v)); s.peak = Math.max(s.peak, Math.abs(s.v));
        if (Math.abs(s.v) > 14){ fdBuzz(o, 14); fdFire(el, o.onspin, 'spin'); }
        fdSave();
      }
    });
    function step(dt, ts){
      if (!f.drag && s.v){
        var sign = s.v > 0 ? 1 : -1;
        s.v *= Math.exp(-fr[0] * dt); s.v -= sign * fr[1] * dt;
        if (s.v * sign <= 0.04){ s.v = 0; if (s.peak > 6) fdFire(el, o.onstop, 'stop'); s.peak = 0; fdSave(); }
        var da = s.v * dt; s.a += da; k.spins += Math.abs(da) / (Math.PI * 2);
      }
      draw();
      if ((o.show === 'rpm' || o.show === 'count') && ts - faceAt > 120){ faceAt = ts; T.spinner.live(el, liveState()); }
      f.dirty = false;
      return !!(s.v || f.drag);
    }
    function sprite(){
      var col = fdCol(el), R = Math.min(f.w, f.h) / 2 * 0.95, S = Math.ceil(R * 2 + 4), c = document.createElement('canvas'); c.width = c.height = S;
      var g = c.getContext('2d'), m = S / 2, look = o.look || '', u = Math.PI * 2 / arms;
      var d = look === 'ring' ? R * 0.83 : R * 0.6, lr = look === 'ring' ? R * 0.15 : Math.min(R * 0.37, d * Math.sin(Math.PI / arms) * 1.02, R - d);
      g.translate(m, m);
      var grad = g.createRadialGradient(-R * 0.3, -R * 0.35, R * 0.05, 0, 0, R);
      grad.addColorStop(0, mixC(col, WHITE, 0.35)); grad.addColorStop(0.6, mixC(col, WHITE, 0)); grad.addColorStop(1, mixC(col, BLACK, 0.3));
      g.fillStyle = grad;
      var fillCirc = function(x, y, r){ g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill(); };
      fillCirc(0, 0, R * 0.34);
      for (var i = 0; i < arms; i++){
        var an = i * u - Math.PI / 2, x = Math.cos(an) * d, y = Math.sin(an) * d;
        g.save(); g.rotate(an);
        if (look === 'petal'){ g.beginPath(); g.moveTo(0, -R * 0.2); g.quadraticCurveTo(d * 0.9, -lr * 1.5, d + lr, 0); g.quadraticCurveTo(d * 0.9, lr * 1.5, 0, R * 0.2); g.fill(); }
        else { var hw = look === 'ring' ? R * 0.08 : lr * 0.62; g.fillRect(0, -hw, d, hw * 2); }
        g.restore();
        if (look !== 'petal') fillCirc(x, y, lr);
      }
      if (look === 'ring'){ g.beginPath(); g.arc(0, 0, R * 0.97, 0, Math.PI * 2); g.arc(0, 0, R * 0.74, 0, Math.PI * 2, true); g.fill('evenodd'); }
      // a rim of light along the top edge, a shadow along the bottom
      g.globalCompositeOperation = 'source-atop';
      var sh = g.createLinearGradient(0, -R, 0, R); sh.addColorStop(0, 'rgba(255,255,255,.18)'); sh.addColorStop(0.5, 'rgba(255,255,255,0)'); sh.addColorStop(1, 'rgba(0,0,0,.22)');
      g.fillStyle = sh; g.fillRect(-m, -m, S, S);
      g.globalCompositeOperation = 'source-over';
      // bearings in the weights
      for (i = 0; i < arms; i++){
        var a2 = i * u - Math.PI / 2, bx = Math.cos(a2) * (look === 'petal' ? d * 0.82 : d), by = Math.sin(a2) * (look === 'petal' ? d * 0.82 : d), br = (look === 'petal' ? R * 0.13 : lr * 0.62);
        bearing(g, bx, by, br);
      }
      return c;
    }
    function bearing(g, x, y, r){
      var mg = g.createLinearGradient(x - r, y - r, x + r, y + r); mg.addColorStop(0, '#f6f8fa'); mg.addColorStop(0.5, '#a9b0b8'); mg.addColorStop(1, '#5d636b');
      g.fillStyle = mg; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#25282d'; g.beginPath(); g.arc(x, y, r * 0.72, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#c9ced4'; for (var j = 0; j < 7; j++){ var ja = j * Math.PI * 2 / 7; g.beginPath(); g.arc(x + Math.cos(ja) * r * 0.5, y + Math.sin(ja) * r * 0.5, r * 0.14, 0, Math.PI * 2); g.fill(); }
      g.fillStyle = mg; g.beginPath(); g.arc(x, y, r * 0.3, 0, Math.PI * 2); g.fill();
    }
    function draw(){
      var g = f.g; if (!f.sprite) f.sprite = sprite();
      var sp = f.sprite, w = f.w, h = f.h, R = Math.min(w, h) / 2 * 0.95, fast = Math.abs(s.v), n = fast > 9 ? 5 : 1;
      g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, w, h);
      // a soft shadow under it
      var shd = g.createRadialGradient(w / 2, h / 2 + R * 0.08, R * 0.5, w / 2, h / 2 + R * 0.08, R * 1.05); shd.addColorStop(0, 'rgba(0,0,0,.28)'); shd.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = shd; g.fillRect(0, 0, w, h);
      for (var i = n - 1; i >= 0; i--){
        g.save(); g.globalAlpha = i ? 0.2 * (1 - i / n) : 1; g.translate(w / 2, h / 2); g.rotate(s.a - s.v * i * 0.0065);
        g.drawImage(sp, -sp.width / 2, -sp.height / 2); g.restore();
      }
      if (fast > 25){ g.strokeStyle = 'rgba(255,255,255,' + Math.min(0.18, (fast - 25) / 300) + ')'; g.lineWidth = R * 0.05; g.beginPath(); g.arc(w / 2, h / 2, R * 0.75, 0, Math.PI * 2); g.stroke(); }
      // the cap in the middle stays still, so what it shows stays readable
      var cr = o.show ? R * 0.33 : R * 0.2, cg = g.createRadialGradient(w / 2 - cr * 0.35, h / 2 - cr * 0.4, cr * 0.1, w / 2, h / 2, cr);
      cg.addColorStop(0, '#ffffff'); cg.addColorStop(0.7, '#dfe3e8'); cg.addColorStop(1, '#9aa1aa');
      g.fillStyle = cg; g.beginPath(); g.arc(w / 2, h / 2, cr, 0, Math.PI * 2); g.fill();
      g.strokeStyle = 'rgba(0,0,0,.25)'; g.lineWidth = Math.max(1, R * 0.012); g.stroke();
    }
  }

  // ---------- Nebula (and fireflies, ripples) ----------
  var NEB_PAL = { '': ['#7b5cff', '#ff5fd8', '#5cc8ff', '#ffffff'], aurora: ['#3dffb5', '#29c7ff', '#9d6bff', '#d6fff3'], ember: ['#ff7a2e', '#ffcf4a', '#ff3d6e', '#fff1d6'], ocean: ['#2f7bff', '#2ee6d6', '#a8f0ff', '#ffffff'] };
  T.nebula = { name:'Nebula', icon:'swirl', kind:'box', zones:FZ, w:'full', desc:'A glowing cloud to swirl with your finger. Fireflies and ripples too',
    fields:[['look','Kind','seg',[['','Nebula'],['fire','Fireflies'],['rip','Ripples']]],['pal','Colours','seg',[['','Galaxy'],['theme','Theme'],['aurora','Aurora'],['ember','Ember'],['ocean','Ocean']]],
            ['dens','How much','seg',[['low','Calm'],['','Normal'],['high','Busy']]],['h','Height','range',[80, 400, 10, 'px', 180]],['bg','Dark space behind it','toggle',true],
            ['music','Moves with the music','toggle',true],['show','Shows','seg',faceSeg(['','Nothing'],[['np','Now playing']])],
            ['onswirl','Swirling it does','fidact',''],['ontap2','A double-tap does','fidact','']],
    render:function(o, c, ctx, it){
      var h = Math.max(80, Math.min(400, +o.h || 180));
      return fdBox(o, fdData(it, o, ['look','pal','dens','music','show','onswirl','ontap2']) + ' data-pw-live="nebula"><canvas></canvas><div class="pw-fd-face"></div></div>', 'pw-fd-neb' + (o.bg === false ? '' : ' pw-fd-space'), h);
    },
    live:function(el, st){
      if (!el._fd) nebInit(el);
      var cs = getComputedStyle(el).color; if (cs !== el._fd.cs){ if (el._fd.cs && el._fd.o.pal === 'theme') el._fd.dirty = true; el._fd.cs = cs; }
      el._fd.playing = st.playing; fdFace(el, fdFaceHTML(el._fd.o.show, st)); fdWake(el); } };
  function nebInit(el){
    var f = fdSetup(el, step, 2.5), o = f.o, look = o.look || '', parts = [], rings = [], ptr = null, pulse = 0, rainAt = 0, beatAt = 0;
    f.scrollVertical = true;
    var N = look === 'fire' ? { low: 22, '': 40, high: 70 }[o.dens || ''] : { low: 70, '': 130, high: 220 }[o.dens || ''];
    var pal = o.pal === 'theme' ? null : NEB_PAL[o.pal || ''] || NEB_PAL[''], cols = [], sprites = [];
    var path = 0, swirled = false, lastDown = 0, lastDownP = null, prevP = null, lastRingP = null;
    function makeSprites(){
      var base = pal ? pal.map(rgbOf2) : (function(c){ return [c, rgbOf2(mixC(c, WHITE, 0.5)), rgbOf2(mixC(c, [255, 95, 216], 0.5)), WHITE]; })(fdCol(el));
      cols = base; sprites = base.map(function(c){
        var cv = document.createElement('canvas'); cv.width = cv.height = 64; var g = cv.getContext('2d'), gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
        gr.addColorStop(0, mixC(c, WHITE, 0.45, 1)); gr.addColorStop(0.16, mixC(c, c, 0, 0.7)); gr.addColorStop(0.5, mixC(c, c, 0, 0.16)); gr.addColorStop(1, mixC(c, c, 0, 0));
        g.fillStyle = gr; g.fillRect(0, 0, 64, 64); return cv;
      });
    }
    function rgbOf2(hex){ if (Array.isArray(hex)) return hex; if (hex.charAt(0) === '#'){ var n = parseInt(hex.slice(1), 16); return [n >> 16 & 255, n >> 8 & 255, n & 255]; } return rgbOf(hex); }
    function spawn(p, spark, at){
      var w = f.w, h = f.h, a = Math.random() * Math.PI * 2, r = 0.25 + Math.random() * 0.7;
      p = p || {};
      p.x = at ? at.x : w / 2 + Math.cos(a) * r * w * 0.45; p.y = at ? at.y : h / 2 + Math.sin(a) * r * h * 0.42;
      p.vx = at ? (Math.random() - 0.5) * 160 * f.dpr : 0; p.vy = at ? (Math.random() - 0.5) * 160 * f.dpr : 0;
      p.c = Math.floor(Math.random() * sprites.length); p.s = (look === 'fire' ? 3 + Math.random() * 5 : spark ? 4 + Math.random() * 6 : 8 + Math.random() * 22) * f.dpr;
      p.ph = Math.random() * 6.3; p.rr = 0.12 + Math.pow(Math.random(), 0.7) * 0.85; p.age = 0; p.life = spark ? 1 : -1; p.wx = Math.random() * 6.3; return p;
    }
    fdPointer(f, {
      down: function(p){
        var now = performance.now();
        if (lastDownP && now - lastDown < 320 && Math.hypot(p.x - lastDownP.x, p.y - lastDownP.y) < 40 * f.dpr) fdFire(el, o.ontap2, 'tap2');
        lastDown = now; lastDownP = p; ptr = p; prevP = p; path = 0; swirled = false;
        if (look === 'rip'){ rings.push({ x: p.x, y: p.y, r: 0, a: 1, c: Math.floor(Math.random() * 4) }); lastRingP = p; }
      },
      move: function(p){
        if (!ptr) return;
        path += Math.hypot(p.x - prevP.x, p.y - prevP.y) / f.dpr; prevP = p; ptr = p;
        if (!swirled && path > Math.max(600, el.clientWidth * 3)){ swirled = true; fdBuzz(o, 20); fdFire(el, o.onswirl, 'swirl'); }
        if (look === 'rip' && Math.hypot(p.x - lastRingP.x, p.y - lastRingP.y) > 26 * f.dpr){ rings.push({ x: p.x, y: p.y, r: 0, a: 0.8, c: Math.floor(Math.random() * 4) }); lastRingP = p; }
        else if (look === '' && parts.length < N + 90){ for (var i = 0; i < 2; i++) parts.push(spawn(null, true, p)); }
      },
      up: function(){ ptr = null; }
    });
    function step(dt, ts){
      var g = f.g, w = f.w, h = f.h, dpr = f.dpr;
      if (f.dirty || !sprites.length){ makeSprites(); parts = []; for (var i = 0; i < N; i++) parts.push(spawn()); for (i = 0; i < parts.length; i++) parts[i].age = Math.random() * 20; }
      f.dirty = false;
      if (o.music !== false && f.playing && window.__ppVizLevels){
        window.__ppVizWant = performance.now();   // keeps the player's level analysis running while this shows
        var lv = window.__ppVizLevels(), want = Math.min(1, (lv && lv.pulse) || 0);
        pulse += (want - pulse) * (want > pulse ? 0.6 : 0.12);
      } else pulse *= 0.9;
      g.setTransform(1, 0, 0, 1, 0, 0);
      if (look === 'rip') return ripples(g, w, h, dt, ts, dpr);
      // fade what was drawn before: trails for the nebula, almost none for fireflies
      g.globalCompositeOperation = 'destination-out';
      g.fillStyle = 'rgba(0,0,0,' + (1 - Math.pow(1 - (look === 'fire' ? 0.45 : 0.16), dt * 60)).toFixed(3) + ')'; g.fillRect(0, 0, w, h);
      g.globalCompositeOperation = 'lighter';
      var cx = w / 2, cy = h / 2, speed = (look === 'fire' ? 14 : 34) * dpr * (1 + pulse * 1.6);
      for (i = parts.length - 1; i >= 0; i--){
        var p = parts[i]; p.age += dt;
        if (p.life >= 0){ p.life -= dt * 0.9; if (p.life <= 0){ parts.splice(i, 1); continue; } }
        var nx = (p.x - cx) / (w / 2), ny = (p.y - cy) / (h / 2), nr = Math.hypot(nx, ny) + 1e-3;
        if (look === 'fire'){
          p.wx += (Math.random() - 0.5) * dt * 3;
          p.vx += Math.cos(p.wx) * speed * dt * 3 - nx * 6 * dpr * dt; p.vy += Math.sin(p.wx) * speed * dt * 3 - ny * 6 * dpr * dt;
        } else {
          var tx = -ny / nr * (w / 2), ty = nx / nr * (h / 2), tl = Math.hypot(tx, ty) + 1e-3, want = speed * (0.6 + 0.8 / (0.4 + nr));
          var pull = (p.rr - nr) * 26 * dpr;
          p.vx += ((tx / tl) * want + nx / nr * pull - p.vx) * 0.9 * dt + (Math.random() - 0.5) * 30 * dpr * dt;
          p.vy += ((ty / tl) * want + ny / nr * pull - p.vy) * 0.9 * dt + (Math.random() - 0.5) * 30 * dpr * dt;
        }
        if (ptr){
          var dx = ptr.x - p.x, dy = ptr.y - p.y, d = Math.hypot(dx, dy) + 20 * dpr, near = Math.min(1, 140 * dpr / d);
          var at = (look === 'fire' ? 260 : 900) * dpr * near, sw = (look === 'fire' ? 200 : 1300) * dpr * near;
          p.vx += (dx / d * at - dy / d * sw) * dt; p.vy += (dy / d * at + dx / d * sw) * dt;
          p.vx *= 1 - 1.4 * dt; p.vy *= 1 - 1.4 * dt;
        }
        var vm = Math.hypot(p.vx, p.vy), cap = 900 * dpr; if (vm > cap){ p.vx *= cap / vm; p.vy *= cap / vm; }
        p.x += p.vx * dt; p.y += p.vy * dt;
        if (p.x < -40 * dpr || p.x > w + 40 * dpr || p.y < -40 * dpr || p.y > h + 40 * dpr){ if (p.life >= 0){ parts.splice(i, 1); continue; } spawn(p); }
        var al = look === 'fire' ? Math.pow(Math.max(0, Math.sin(p.age * 1.3 + p.ph)), 3) * 0.95 + 0.05 : (0.5 + 0.5 * Math.sin(p.age * 1.7 + p.ph)) * (p.life >= 0 ? p.life * 0.8 : 0.32);
        var sz = p.s * (1 + pulse * 0.7) * (look === 'fire' ? 1 + al : 1);
        g.globalAlpha = Math.max(0, Math.min(1, al)); g.drawImage(sprites[p.c], p.x - sz, p.y - sz, sz * 2, sz * 2);
      }
      g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
      return true;
    }
    function ripples(g, w, h, dt, ts, dpr){
      g.clearRect(0, 0, w, h);
      if (ts - rainAt > 1300 + Math.random() * 900){ rainAt = ts; rings.push({ x: Math.random() * w, y: Math.random() * h, r: 0, a: 0.55, c: Math.floor(Math.random() * 4) }); }
      if (pulse > 0.55 && ts - beatAt > 280){ beatAt = ts; rings.push({ x: w / 2, y: h / 2, r: 0, a: 0.5 + pulse * 0.4, c: Math.floor(Math.random() * 4) }); }
      g.globalCompositeOperation = 'lighter';
      for (var i = rings.length - 1; i >= 0; i--){
        var r = rings[i]; r.r += 95 * dpr * dt * (1 + pulse); r.a -= dt * 0.55;
        if (r.a <= 0){ rings.splice(i, 1); continue; }
        var c = cols[r.c % cols.length];
        for (var k = 0; k < 3; k++){
          var rr = r.r - k * 11 * dpr; if (rr <= 0) continue;
          g.strokeStyle = mixC(c, c, 0, (r.a * (1 - k * 0.3)).toFixed(3)); g.lineWidth = (2.2 - k * 0.5) * dpr;
          g.beginPath(); g.ellipse(r.x, r.y, rr, rr * 0.62, 0, 0, Math.PI * 2); g.stroke();
        }
      }
      g.globalCompositeOperation = 'source-over';
      if (rings.length > 80) rings.splice(0, rings.length - 80);
      return true;
    }
  }

  // ---------- Pop-it ----------
  var POP_SIZE = { s: [4, 3], '': [5, 4], l: [6, 5], xl: [8, 6] };
  T.popit = { name:'Pop-it', icon:'bubbles', kind:'box', zones:FZ, w:'full', desc:'Bubbles to pop. Pop them all and it flips over, and can play something',
    fields:[['size','Bubbles','seg',[['s','12'],['','20'],['l','30'],['xl','48']]],['pal','Colours','seg',[['','Rainbow'],['theme','Theme'],['pastel','Pastel'],['neon','Neon'],['mono','Grey']]],
            ['shape','Shape','seg',[['','Round'],['square','Square']]],['show','Above the bubbles','seg',faceSeg(['','Nothing'],[['count','Sheets popped']])],
            ['buzz','Vibrate','toggle',true],['snd','Pop sounds','toggle',false],['ondone','Popping every bubble does','fidact','']],
    render:function(o, c, ctx, it){
      var sz = POP_SIZE[o.size || ''] || POP_SIZE[''], cols = sz[0], rows = sz[1], btns = '';
      for (var i = 0; i < cols * rows; i++){ var r = Math.floor(i / cols); btns += '<button type="button" data-pw-pop="' + i + '" style="--hue:' + Math.round(r / rows * 300) + '" aria-label="Bubble"></button>'; }
      return '<div class="pw-fd pw-fd-pop pw-fd-pop-' + esc(o.pal || 'rainbow') + (o.shape === 'square' ? ' pw-fd-pop-sq' : '') + '"' + fdData(it, o, ['show','buzz','snd','ondone']) + ' data-pw-live="popit" data-n="' + cols * rows + '" style="--cols:' + cols + (okCol(o.color) ? ';--pw-fc:' + o.color : '') + '">' +
        '<div class="pw-fd-face pw-fd-line"></div><div class="pw-fd-pop-g">' + btns + '</div></div>';
    },
    live:function(el, st){
      var o = fdOpts(el), id = el.dataset.id, k = fdKeep(id, { p: '', sheets: 0 }), n = +el.dataset.n;
      if (k.p.length !== n) k.p = new Array(n + 1).join('0');
      if (el._p !== k.p){ el._p = k.p; el.querySelectorAll('[data-pw-pop]').forEach(function(b, i){ b.classList.toggle('on', k.p.charAt(i) === '1'); }); }
      fdFace(el, fdFaceHTML(o.show, st, k.sheets, k.sheets === 1 ? 'sheet popped' : 'sheets popped'));
    } };
  document.addEventListener('click', function(e){
    var b = e.target.closest && e.target.closest('[data-pw-pop]'); if (!b || editing) return;
    var el = b.closest('.pw-fd-pop'); if (!el || el.classList.contains('pw-fd-flipping')) return;
    var o = fdOpts(el), id = el.dataset.id, n = +el.dataset.n, k = fdKeep(id, { p: '', sheets: 0 }), i = +b.dataset.pwPop;
    if (k.p.length !== n) k.p = new Array(n + 1).join('0');
    var on = k.p.charAt(i) !== '1';
    k.p = k.p.slice(0, i) + (on ? '1' : '0') + k.p.slice(i + 1); el._p = k.p;
    b.classList.toggle('on', on); fdBuzz(o, on ? 9 : 5); if (on) fdSound(o, 'pop');
    if (k.p.indexOf('0') < 0){
      k.sheets++; el.classList.add('pw-fd-flipping'); fdBuzz(o, [12, 60, 24]);
      setTimeout(function(){ k.p = new Array(n + 1).join('0'); el._p = null; liveSoon(); }, 330);
      setTimeout(function(){ el.classList.remove('pw-fd-flipping'); fdFire(el, o.ondone, 'done'); }, 680);
    }
    fdSave(); liveSoon();
  });

  // ---------- Switches ----------
  var SW_DO = [['','Just for fun'],['play','Play / pause'],['sound','Sound on / off'],['sleep','Sleep timer (30 min)'],['custom','Your own actions']];
  function swN(o){ return Math.max(1, Math.min(4, +o.n || 3)); }
  var swFields = [['n','How many','seg',[['1','1'],['2','2'],['','3'],['4','4']]],['look','Look','seg',[['','Toggle'],['rocker','Rocker'],['arcade','Arcade button'],['lever','Lever']]],
                  ['color','Colour','color',''],['names','Show names','toggle',true],['buzz','Vibrate','toggle',true],['snd','Click sounds','toggle',false]];
  [1, 2, 3, 4].forEach(function(i){
    var shown = function(o){ return swN(o) >= i; }, custom = function(o){ return swN(o) >= i && o['d' + i] === 'custom'; };
    swFields.push(['d' + i, 'Switch ' + i + ' does', 'select', SW_DO, shown], ['l' + i, 'Switch ' + i + ' name', 'text', '', shown],
                  ['on' + i, 'Switch ' + i + ': turning on does', 'fidact', '', custom], ['off' + i, 'Switch ' + i + ': turning off does', 'fidact', '', custom]);
  });
  var SW_NAME = { '': 'Switch', play: 'Play', sound: 'Sound', sleep: 'Sleep', custom: 'Switch' };
  T.switches = { name:'Switches', icon:'toggle', kind:'box', zones:FZ, w:'full', desc:'Satisfying switches to flick. Link them to play, sound, the sleep timer or anything',
    fields:swFields, rerender:['n','d1','d2','d3','d4'], o0:{ d1:'play', d2:'sound', d3:'sleep' },
    render:function(o, c, ctx, it){
      var n = swN(o), keys = ['look','buzz','snd'], h = '';
      for (var i = 1; i <= n; i++){
        keys.push('d' + i, 'on' + i, 'off' + i);
        var name = o['l' + i] || SW_NAME[o['d' + i] || ''] || 'Switch';
        h += '<div class="pw-fd-sw"><button type="button" role="switch" aria-checked="false" data-pw-fsw="' + i + '" aria-label="' + esc(name) + '"><i></i><em></em></button>' + (o.names === false ? '' : '<span>' + esc(name) + '</span>') + '</div>';
      }
      return '<div class="pw-fd pw-fd-sws pw-fd-sw-' + esc(o.look || 'toggle') + '"' + fdData(it, o, keys) + ' data-pw-live="switches"' + (okCol(o.color) ? ' style="--pw-fc:' + o.color + '"' : '') + '>' + h + '</div>';
    },
    live:function(el, st){
      var o = fdOpts(el), k = fdKeep(el.dataset.id, { s: {} });
      el.querySelectorAll('[data-pw-fsw]').forEach(function(b){
        if (Date.now() - (b._at || 0) < 1200) return;   // just flicked: give the app a moment to catch up
        var on = swState(o, b.dataset.pwFsw, st, k);
        if (b.getAttribute('aria-checked') !== String(on)) b.setAttribute('aria-checked', String(on));
      });
    } };
  function swState(o, i, st, k){
    var d = o['d' + i];
    if (d === 'play') return !!st.playing;
    if (d === 'sound'){ var v = document.getElementById('volume'); return !v || +v.value > 0; }
    if (d === 'sleep'){ var s = st.W && st.W.sleep ? st.W.sleep() : null; return !!(s && s.mode !== 'off'); }
    return !!k.s[i];
  }
  document.addEventListener('click', function(e){
    var b = e.target.closest && e.target.closest('[data-pw-fsw]'); if (!b || editing) return;
    var el = b.closest('.pw-fd-sws'); if (!el) return;
    var o = fdOpts(el), i = b.dataset.pwFsw, d = o['d' + i], k = fdKeep(el.dataset.id, { s: {} }), on = b.getAttribute('aria-checked') !== 'true', st = liveState();
    b.setAttribute('aria-checked', String(on)); b._at = Date.now();
    fdBuzz(o, on ? 16 : 10); fdSound(o, 'click');
    if (d === 'play'){ if (!st.has) runAction('shuffleall'); else if (on !== !!st.playing) runAction('playpause'); }
    else if (d === 'sound'){ var v = document.getElementById('volume'); if (v && (+v.value > 0) !== on) runAction('mute'); }
    else if (d === 'sleep') runAction(on ? 'sleep30' : 'sleepoff');
    else { k.s[i] = on; fdSave(); if (d === 'custom') fdFire(el, o[(on ? 'on' : 'off') + i], 'sw' + i + on); }
    setTimeout(function(){ b._at = 0; liveSoon(); }, 900);
  });

  // ---------- Clicky knob ----------
  T.knob = { name:'Clicky knob', icon:'knob', kind:'box', zones:FZ, w:'half', desc:'Turn it for the clicks. Or let it turn the volume, speed, track or place in the song',
    fields:[['link','Turning it changes','seg',[['','Nothing'],['vol','Volume'],['speed','Speed'],['seek','Place in song'],['track','Track']]],
            ['show','In the middle','seg',faceSeg(['','Clicks'],[['none','Nothing']]),function(o){ return !o.link; }],
            ['step','Clicks per turn','seg',[['12','12'],['','24'],['36','36']]],['h','Size','range',[100, 320, 10, 'px', 170]],['color','Colour','color',''],['buzz','Vibrate','toggle',true],['snd','Click sounds','toggle',false]],
    rerender:['link'],
    render:function(o, c, ctx, it){
      var h = Math.max(100, Math.min(320, +o.h || 170));
      return fdBox(o, fdData(it, o, ['link','show','step','buzz','snd']) + ' data-pw-live="knob"><canvas></canvas><div class="pw-fd-face"></div></div>', 'pw-fd-knob', h);
    },
    live:function(el, st){
      if (!el._fd) knobInit(el);
      var f = el._fd, o = f.o, link = o.link, html, cs = getComputedStyle(el);
      if (cs.color !== f.col){ f.col = cs.color; f.dim = (cs.getPropertyValue('--text-dim') || '').trim() || '#888'; f.dirty = true; }
      if (link === 'vol'){ var v = document.getElementById('volume'); html = '<b>' + (v ? Math.round(+v.value) : 0) + '</b><small>volume</small>'; }
      else if (link === 'speed'){ var sl = document.getElementById('speed-slider'); html = '<b>' + (sl ? +parseFloat(sl.value).toFixed(2) : 1) + '×</b><small>speed</small>'; }
      else if (link === 'seek'){ var tm = st.has ? media2() : { t:0, d:0 }; html = st.has ? '<b>' + fmtT(tm.t) + '</b><small>of ' + fmtT(tm.d) + '</small>' : '<small>Nothing playing</small>'; }
      else if (link === 'track') html = st.has ? '<small>Turn for</small><b class="pw-fd-np">' + esc(st.t.title) + '</b>' : '<small>Turn to play</small>';
      else html = o.show === 'none' ? '' : fdFaceHTML(o.show || 'count', st, f.k.clicks, 'clicks');
      fdFace(el, html);
      var want = knobTarget(o);
      if (want != null && !f.drag && Math.abs(want - f.s.a) > 0.002) f.dirty = true;
      if (f.dirty) fdWake(el);
    } };
  var KNOB_SWEEP = Math.PI * 1.5;
  function knobTarget(o){
    if (o.link === 'vol'){ var v = document.getElementById('volume'); return v ? -KNOB_SWEEP / 2 + (+v.value / 100) * KNOB_SWEEP : null; }
    if (o.link === 'speed'){ var sl = document.getElementById('speed-slider'), x = sl ? parseFloat(sl.value) : 1, i = SPEEDS.map(Number).reduce(function(b, s, j, a){ return Math.abs(s - x) < Math.abs(a[b] - x) ? j : b; }, 0); return -KNOB_SWEEP / 2 + i / (SPEEDS.length - 1) * KNOB_SWEEP; }
    if (o.link === 'seek'){ var tm = media2(); return tm.d ? -KNOB_SWEEP / 2 + tm.t / tm.d * KNOB_SWEEP : null; }
    return null;
  }
  function knobInit(el){
    var f = fdSetup(el, step, 3), o = f.o, n = +o.step || 24, u = Math.PI * 2 / n;
    f.hit = fdRound(0.5);
    var s = f.s = fdMem(f.id, { a: 0, fa: 0 }), k = f.k = fdKeep(f.id, { clicks: 0 });
    var lastAng = 0, det = 0, trackAcc = 0, glow = 0;
    fdPointer(f, {
      down: function(p){ f.drag = true; lastAng = Math.atan2(p.y - f.h / 2, p.x - f.w / 2); s.fa = s.a; det = Math.round(s.fa / u); },
      move: function(p){
        var dx = p.x - f.w / 2, dy = p.y - f.h / 2; if (Math.hypot(dx, dy) < 8 * f.dpr) return;
        var a = Math.atan2(dy, dx); s.fa += angDiff(a, lastAng); lastAng = a;
        var d2 = Math.round(s.fa / u);
        while (d2 !== det){ var dir = d2 > det ? 1 : -1; det += dir; click(dir); }
        if (!o.link || o.link === 'track') s.a = det * u;
        f.dirty = true;
      },
      up: function(){ f.drag = false; fdSave(); f.dirty = true; }
    });
    function click(dir){
      k.clicks++; glow = 1; fdBuzz(o, 5); fdSound(o, 'tick');
      var w = wapi();
      if (o.link === 'vol'){ var v = document.getElementById('volume'); if (v) inputTo('volume', Math.max(0, Math.min(100, Math.round(+v.value) + dir * 4))); }
      else if (o.link === 'speed'){ var sl = document.getElementById('speed-slider'), x = sl ? parseFloat(sl.value) : 1, sp = SPEEDS.map(Number), i = sp.reduce(function(b, q, j){ return Math.abs(q - x) < Math.abs(sp[b] - x) ? j : b; }, 0);
        i = Math.max(0, Math.min(sp.length - 1, i + dir)); inputTo('speed-slider', SPEEDS[i]); }
      else if (o.link === 'seek'){ var tm = media2(); if (w && tm.d) w.seek(Math.max(0, Math.min(tm.d - 0.5, tm.t + dir * 5))); }
      else if (o.link === 'track'){ trackAcc += dir; if (Math.abs(trackAcc) >= 4){ if (!kit() || !kit().hasTrack()) runAction('shuffleall'); else runAction(trackAcc > 0 ? 'next' : 'prev'); trackAcc = 0; fdBuzz(o, 18); } }
      liveSoon();
    }
    function step(dt){
      var want = knobTarget(o);
      if (want != null) s.a += (want - s.a) * Math.min(1, dt * 14);
      glow = Math.max(0, glow - dt * 4);
      draw(want);
      var moving = want != null && Math.abs(want - s.a) > 0.002;
      f.dirty = false;
      return !!(f.drag || moving || glow > 0);
    }
    function draw(want){
      var g = f.g, w = f.w, h = f.h, cx = w / 2, cy = h / 2, R = Math.min(w, h) / 2 * 0.95, col = rgbOf(f.col || getComputedStyle(el).color), dim = f.dim || '#888';
      g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, w, h);
      // the scale around it: a lit arc for a value, or the clicks
      var lin = o.link === 'vol' || o.link === 'speed' || o.link === 'seek';
      var ticks = lin ? 28 : n;
      for (var i = 0; i < ticks; i++){
        var t = lin ? -KNOB_SWEEP / 2 + i / (ticks - 1) * KNOB_SWEEP : i * u, an = t - Math.PI / 2;
        var lit = lin ? t <= s.a + 0.01 : Math.abs(angDiff(t, s.a)) < u / 2;
        g.strokeStyle = lit ? mixC(col, WHITE, lin ? 0 : glow * 0.5) : dim; g.globalAlpha = lit ? 1 : 0.35;
        g.lineWidth = Math.max(1.5, R * (lit ? 0.035 : 0.022)); g.lineCap = 'round';
        g.beginPath(); g.moveTo(cx + Math.cos(an) * R * 0.86, cy + Math.sin(an) * R * 0.86); g.lineTo(cx + Math.cos(an) * R * (i % (lin ? 27 : 6) === 0 ? 1 : 0.95), cy + Math.sin(an) * R * (i % (lin ? 27 : 6) === 0 ? 1 : 0.95)); g.stroke();
      }
      g.globalAlpha = 1;
      // the knob: shadow, knurled edge, face
      var kr = R * 0.74, sh = g.createRadialGradient(cx, cy + kr * 0.12, kr * 0.7, cx, cy + kr * 0.12, kr * 1.15); sh.addColorStop(0, 'rgba(0,0,0,.45)'); sh.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = sh; g.beginPath(); g.arc(cx, cy, kr * 1.15, 0, Math.PI * 2); g.fill();
      var body2 = g.createLinearGradient(cx - kr, cy - kr, cx + kr, cy + kr); body2.addColorStop(0, '#5b616b'); body2.addColorStop(1, '#17191d');
      g.fillStyle = body2; g.beginPath(); g.arc(cx, cy, kr, 0, Math.PI * 2); g.fill();
      g.save(); g.translate(cx, cy); g.rotate(s.a); g.strokeStyle = 'rgba(255,255,255,.13)'; g.lineWidth = Math.max(1, kr * 0.02);
      for (i = 0; i < 48; i++){ var ka = i * Math.PI / 24; g.beginPath(); g.moveTo(Math.cos(ka) * kr * 0.88, Math.sin(ka) * kr * 0.88); g.lineTo(Math.cos(ka) * kr * 0.99, Math.sin(ka) * kr * 0.99); g.stroke(); }
      g.restore();
      var face = g.createRadialGradient(cx - kr * 0.3, cy - kr * 0.35, kr * 0.05, cx, cy, kr * 0.85); face.addColorStop(0, '#4a5059'); face.addColorStop(1, '#202329');
      g.fillStyle = face; g.beginPath(); g.arc(cx, cy, kr * 0.84, 0, Math.PI * 2); g.fill();
      // the pointer dot
      var pa = s.a - Math.PI / 2, px = cx + Math.cos(pa) * kr * 0.68, py = cy + Math.sin(pa) * kr * 0.68;
      g.shadowColor = mixC(col, col, 0, 0.9); g.shadowBlur = R * (0.06 + glow * 0.12);
      g.fillStyle = mixC(col, WHITE, glow * 0.4); g.beginPath(); g.arc(px, py, kr * 0.075, 0, Math.PI * 2); g.fill();
      g.shadowBlur = 0;
    }
  }

  // ---------- Squishy ----------
  var SQ_FEEL = { '': [170, 5, 34], firm: [420, 14, 60], slime: [70, 3, 22] };
  T.squishy = { name:'Squishy', icon:'blob', kind:'box', zones:FZ, w:'half', desc:'A wobbly jelly to poke and squeeze. Squeezing it can do something',
    fields:[['show','On it','seg',[['','Cute face'],['none','Nothing']].concat(FACE, [['count','Squishes']])],['feel','Feels','seg',[['','Jelly'],['firm','Bouncy'],['slime','Slime']]],
            ['h','Size','range',[100, 320, 10, 'px', 170]],['color','Colour','color',''],['buzz','Vibrate','toggle',true],['onsqueeze','Squeezing it (hold) does','fidact','']],
    render:function(o, c, ctx, it){
      var h = Math.max(100, Math.min(320, +o.h || 170));
      return fdBox(o, fdData(it, o, ['show','feel','buzz','onsqueeze']) + ' data-pw-live="squishy"><canvas></canvas><div class="pw-fd-face"></div></div>', 'pw-fd-sq', h);
    },
    live:function(el, st){ if (!el._fd) sqInit(el); var o = el._fd.o; fdFace(el, !o.show || o.show === 'none' ? '' : fdFaceHTML(o.show, st, el._fd.k.n, 'squishes')); fdWake(el); } };
  function sqInit(el){
    var f = fdSetup(el, step, 2.5), o = f.o, K = 36, d = new Float32Array(K), v = new Float32Array(K), feel = SQ_FEEL[o.feel || ''] || SQ_FEEL[''];
    f.hit = fdRound(0.46);
    var k = f.k = fdKeep(f.id, { n: 0 }), press = null, t = 0, blinkAt = 2 + Math.random() * 3, col = null, colAt = -9;
    fdPointer(f, {
      down: function(p){ press = { x: p.x, y: p.y, t0: t, fired: false }; k.n++; fdBuzz(o, 8); },
      move: function(p){ if (press){ press.x = p.x; press.y = p.y; } },
      up: function(){ if (!press) return; var held = t - press.t0; press = null; for (var i = 0; i < K; i++) v[i] += (2 + Math.min(1, held) * 4) * f.dpr * 30; fdSave(); }
    });
    function step(dt){
      t += dt;
      var w = f.w, h = f.h, cx = w / 2, cy = h / 2, R0 = Math.min(w, h) * 0.34, i, held = press ? t - press.t0 : 0;
      if (press && !press.fired && held > 0.7){ press.fired = true; fdBuzz(o, 26); fdFire(el, o.onsqueeze, 'sq'); }
      var target = new Float32Array(K), pa = 0, pd = 0, mean = 0;
      if (press){ pa = Math.atan2(press.y - cy, press.x - cx); pd = Math.min(1.2, Math.hypot(press.x - cx, press.y - cy) / R0); }
      for (i = 0; i < K; i++){
        var th = i / K * Math.PI * 2;
        if (press){
          // pressed near the middle: squashes all round; near an edge: dents that side
          var near = Math.exp(-Math.pow(angDiff(th, pa), 2) / (2 * 0.5 * 0.5)), depth = R0 * (0.14 + 0.2 * Math.min(1, held / 0.6));
          target[i] = -depth * (pd < 0.45 ? 0.55 : near * (0.5 + pd * 0.6));
        }
        target[i] += R0 * 0.025 * Math.sin(t * 1.9 + (press ? 0 : Math.sin(th * 2) * 0.3));
        mean += target[i];
      }
      mean /= K;
      // keep its volume: a dent on one side bulges the others
      if (press) for (i = 0; i < K; i++) if (target[i] > -R0 * 0.05) target[i] -= mean * 1.6;
      var sub = dt > 1 / 70 ? 2 : 1, h2 = dt / sub;
      for (var q = 0; q < sub; q++) for (i = 0; i < K; i++){
        var lap = d[(i + K - 1) % K] + d[(i + 1) % K] - 2 * d[i];
        v[i] += (feel[0] * (target[i] - d[i]) - feel[1] * v[i] + feel[2] * lap * 4) * h2;
        d[i] += v[i] * h2;
      }
      if (t - colAt > 1){ col = fdCol(el); colAt = t; }
      draw(cx, cy, R0, held);
      return true;
    }
    function draw(cx, cy, R0, held){
      var g = f.g, w = f.w, h = f.h, i, pts = [];
      g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, w, h);
      var sh = g.createRadialGradient(cx, cy + R0 * 1.05, 0, cx, cy + R0 * 1.05, R0 * 1.1); sh.addColorStop(0, 'rgba(0,0,0,.32)'); sh.addColorStop(1, 'rgba(0,0,0,0)');
      g.save(); g.translate(cx, cy + R0 * 1.02); g.scale(1, 0.22); g.translate(-cx, -(cy + R0 * 1.02)); g.fillStyle = sh; g.beginPath(); g.arc(cx, cy + R0 * 1.02, R0 * 1.1, 0, Math.PI * 2); g.fill(); g.restore();
      var sx = 0, sy = 0;
      for (i = 0; i < K; i++){ var th = i / K * Math.PI * 2, r = R0 + d[i]; pts.push([cx + Math.cos(th) * r, cy + Math.sin(th) * r * 0.92]); sx += pts[i][0]; sy += pts[i][1]; }
      sx /= K; sy /= K;
      g.beginPath();
      for (i = 0; i <= K; i++){ var a = pts[i % K], b = pts[(i + 1) % K], mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2; if (!i) g.moveTo(mx, my); else g.quadraticCurveTo(a[0], a[1], mx, my); }
      g.closePath();
      var gr = g.createRadialGradient(sx - R0 * 0.35, sy - R0 * 0.4, R0 * 0.08, sx, sy, R0 * 1.25);
      gr.addColorStop(0, mixC(col, WHITE, 0.5)); gr.addColorStop(0.55, mixC(col, WHITE, 0.05)); gr.addColorStop(1, mixC(col, BLACK, 0.35));
      g.fillStyle = gr; g.fill();
      g.save(); g.clip();
      g.fillStyle = 'rgba(255,255,255,.38)'; g.beginPath(); g.ellipse(sx - R0 * 0.38, sy - R0 * 0.5, R0 * 0.26, R0 * 0.13, -0.55, 0, Math.PI * 2); g.fill();
      g.fillStyle = 'rgba(255,255,255,.5)'; g.beginPath(); g.arc(sx - R0 * 0.08, sy - R0 * 0.66, R0 * 0.05, 0, Math.PI * 2); g.fill();
      g.restore();
      if (o.show) return;
      // the cute face
      var squeeze = held > 0.05, fy = sy + R0 * 0.02, ink = 'rgba(25,22,35,.9)';
      g.fillStyle = ink; g.strokeStyle = ink; g.lineWidth = Math.max(2, R0 * 0.045); g.lineCap = 'round';
      if (t > blinkAt + 0.14) blinkAt = t + 2.5 + Math.random() * 3.5;
      var bl = t > blinkAt ? 0.12 : 1;
      [-1, 1].forEach(function(sd){
        var ex = sx + sd * R0 * 0.3, ey = fy - R0 * 0.08;
        if (squeeze){ g.beginPath(); g.moveTo(ex - sd * R0 * 0.08, ey - R0 * 0.07); g.lineTo(ex + sd * R0 * 0.05, ey); g.lineTo(ex - sd * R0 * 0.08, ey + R0 * 0.07); g.stroke(); }
        else { g.beginPath(); g.ellipse(ex, ey, R0 * 0.07, R0 * 0.09 * bl, 0, 0, Math.PI * 2); g.fill();
          if (bl > 0.5){ g.fillStyle = 'rgba(255,255,255,.85)'; g.beginPath(); g.arc(ex + R0 * 0.025, ey - R0 * 0.035, R0 * 0.022, 0, Math.PI * 2); g.fill(); g.fillStyle = ink; } }
        g.fillStyle = 'rgba(255,110,150,.35)'; g.beginPath(); g.ellipse(ex + sd * R0 * 0.1, ey + R0 * 0.16, R0 * 0.1, R0 * 0.055, 0, 0, Math.PI * 2); g.fill(); g.fillStyle = ink;
      });
      g.beginPath();
      if (squeeze) g.ellipse(sx, fy + R0 * 0.16, R0 * 0.07, R0 * 0.09, 0, 0, Math.PI * 2);
      else g.arc(sx, fy + R0 * 0.06, R0 * 0.12, Math.PI * 0.18, Math.PI * 0.82);
      if (squeeze) g.fill(); else g.stroke();
    }
  }

  var FIDGET_ORDER = ['spinner','nebula','popit','switches','knob','squishy'];
  FIDGET_ORDER.forEach(function(k){ if (T[k]) T[k].fidget = true; });   // a stack gives these pages edges to swipe on (pp-widgets.js)

