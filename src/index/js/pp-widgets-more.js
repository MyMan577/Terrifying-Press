  // ===================== pictures you can play with =====================
  // A picture of your own (the Picture widget), a Drawing, or "Your picture" in the Fidgets list can be spun, bounced,
  // squished, flipped like a coin or thrown around its box. The picture itself moves (CSS transforms, no canvas), on the
  // same drawing loop as the other fidgets: only while it is on screen and only while it moves.
  var FX = [['','Just look at it'],['spin','Spin'],['boing','Boing'],['squish','Squish'],['flip','Flip'],['toss','Throw']];
  var FX_WORD = { spin:['spin','spins'], boing:['boing','boings'], squish:['squish','squishes'], flip:['flip','flips'], toss:['throw','throws'] };
  function fxOn(o){ return !!FX_WORD[o.fx]; }
  function fxIs(m){ return function(o){ return o.fx === m; }; }
  function fxFields(withNone){
    return [['fx','Play with it','seg', withNone ? FX : FX.slice(1)],
      ['shape','Shape','seg',[['','As it is'],['round','Round'],['soft','Rounded']], fxOn],
      ['fxshow','Show the count','toggle',false, fxOn],
      ['buzz','Vibrate','toggle',true, fxOn], ['snd','Clicks and pops','toggle',false, fxOn],
      ['ontap','Tapping it does','fidact','', fxOn],
      ['onbig','A hard flick does','fidact','', fxIs('spin')],
      ['onbig','Pulling it far and letting go does','fidact','', fxIs('boing')],
      ['onbig','Squeezing it (hold) does','fidact','', fxIs('squish')],
      ['onbig','A flurry of flips does','fidact','', fxIs('flip')],
      ['onbig','A hard throw does','fidact','', fxIs('toss')]];
  }
  function fxBox(it, o, inner, h, cls){
    var hh = Math.max(60, Math.min(420, +h || 160)), sh = o.shape === 'round' ? ' pw-ifx-round' : o.shape === 'soft' ? ' pw-ifx-soft' : '';
    return '<div class="pw-fd pw-ifx pw-ifx-' + o.fx + sh + (cls ? ' ' + cls : '') + '"' + fdData(it, o, ['fx','buzz','snd','ontap','onbig']) + ' data-pw-live="ifx" style="height:' + hh + 'px">' +
      '<div class="pw-ifx-obj">' + inner + '</div>' + (o.fxshow ? '<span class="pw-ifx-n"></span>' : '') + '</div>';
  }
  function fxImg(src, o){ return '<img alt="" draggable="false" src="' + esc(src) + '"' + (o.gray ? ' class="pw-ifx-gray"' : '') + '>'; }
  function fxDrawing(o){
    var pic = DRAW_HTML[o.pic] ? o.pic : 'vinyl', col = okCol(o.color);
    return '<div class="pw-dr pw-dr-' + pic + (o.move === 'always' ? ' pw-dr-always' : o.move === 'never' ? ' pw-dr-never' : '') + '" data-pw-live="drawing" style="--h:' + Math.round((+o.h || 140) * 0.8) + 'px' + (col ? ';--dc:' + col : '') + '">' + DRAW_HTML[pic] + '</div>';
  }

  // The Picture and Drawing widgets get a "Play with it" setting.
  (function(){
    var img = T.image, imgRender = img.render;
    img.fields = img.fields.concat(fxFields(true)); img.rerender = (img.rerender || []).concat(['fx']);
    img.render = function(o, c, ctx, it){
      if (!fxOn(o) || !o.img) return imgRender(o, c, ctx, it);
      return fxBox(it, o, fxImg(o.img, o), o.h || 160, 'pw-ifx-pic') + (o.cap ? '<div class="pw-img-cap pw-img-cap-below">' + esc(o.cap) + '</div>' : '');
    };
    var dr = T.drawing, drRender = dr.render;
    dr.fields = dr.fields.concat(fxFields(true)); dr.rerender = (dr.rerender || []).concat(['fx']);
    dr.render = function(o, c, ctx, it){ return fxOn(o) ? fxBox(it, o, fxDrawing(o), o.h || 140, 'pw-ifx-dr') : drRender(o, c, ctx, it); };
  })();

  // "Your picture" in the Fidgets list: a picture, the cover of what is playing, or a drawing, ready to spin.
  T.picfx = { name:'Your picture', icon:'image', kind:'box', zones:FZ, w:'half', desc:'Any picture of yours, the cover art or a drawing, to spin, boing, squish, flip or throw',
    o0:{ fx:'spin', shape:'round' }, rerender:['fx','src'],
    fields:[['src','Picture','seg',[['','Your own'],['cover','Cover art'],['drawing','A drawing']]],['img','Your picture','image','', function(o){ return !o.src; }],
            ['pic','Drawing','select',DRAWINGS, function(o){ return o.src === 'drawing'; }],['color','Colour','color','', function(o){ return o.src === 'drawing'; }],
            ['h','Size','range',[80, 360, 10, 'px', 170]]].concat(fxFields(false)),
    render:function(o, c, ctx, it){
      var oo = fxOn(o) ? o : Object.assign({}, o, { fx:'spin' }), inner;
      if (o.src === 'drawing') inner = fxDrawing(Object.assign({}, o, { h: o.h || 170 }));
      else if (o.src === 'cover') inner = '<img alt="" draggable="false" data-pw-cover="1" hidden><span class="pw-ifx-ph">' + svg('music') + '</span>';
      else inner = o.img ? fxImg(o.img, o) : '<span class="pw-ifx-ph">' + svg('image') + '<small>Pick a picture in its settings</small></span>';
      return fxBox(it, oo, inner, o.h || 170, 'pw-ifx-solo');
    },
    live:function(el, st){ ifxLive(el, st); } };
  T.picfx.fidget = true;
  FIDGET_ORDER.push('picfx');

  T.ifx = { name:'Picture fidget', kind:'box', zones:[], hidden:true, render:function(){ return ''; }, live:function(el, st){ ifxLive(el, st); } };
  function ifxLive(el, st){
    if (!el._fd) ifxInit(el);
    var cov = el.querySelector('img[data-pw-cover]');
    if (cov){
      var s = st.has ? thumbOf(st.t) : null;
      if ((s || '') !== (cov._s || '')){ cov._s = s || ''; if (s) cov.src = s; cov.hidden = !s; var ph = el.querySelector('.pw-ifx-ph'); if (ph) ph.hidden = !!s; }
    }
    ifxCount(el);
  }
  function ifxCount(el){
    var n = el.querySelector('.pw-ifx-n'), f = el._fd; if (!n || !f) return;
    var c = Math.floor(f.k.n), w = FX_WORD[f.o.fx] || FX_WORD.spin;
    setText(n, c.toLocaleString() + ' ' + (c === 1 ? w[0] : w[1]));
  }
  function ifxInit(el){
    var f = fdSetup(el, step), o = f.o, mode = FX_WORD[o.fx] ? o.fx : 'spin', obj = el.querySelector('.pw-ifx-obj');
    f.pad = el;
    f.hit = function(x, y){
      var pr = el.getBoundingClientRect(), r = obj.getBoundingClientRect(), px = x + pr.left, py = y + pr.top;
      if (el.classList.contains('pw-ifx-round')) return Math.hypot(px - (r.left + r.right) / 2, py - (r.top + r.bottom) / 2) <= Math.max(r.width, r.height) / 2 + 10;
      return px >= r.left - 10 && px <= r.right + 10 && py >= r.top - 10 && py <= r.bottom + 10;
    };
    var s = fdMem(f.id + ':' + mode, { a:0, va:0, x:0, y:0, vx:0, vy:0, q:0, vq:0, fa:0, vfa:0, ft:null }), k = f.k = fdKeep(f.id, { n:0 });
    var drag = false, moved = false, p0 = null, t0 = 0, samples = [], lastAng = 0, ox = 0, oy = 0, gx = 0, gy = 0, fa0 = 0;
    var press = null, W = 1, H = 1, lastSide = Math.round(s.fa / 180), lastN = -1, spinDir = 1;
    function count(d){ k.n += d; fdSave(); }
    function size(){ W = el.clientWidth || 1; H = el.clientHeight || 1; }
    fdPointer(f, {
      down: function(p){
        size(); drag = true; moved = false; p0 = p; t0 = performance.now(); samples = [[t0, p.x, p.y, s.a]];
        if (mode === 'spin'){ s.va = 0; lastAng = Math.atan2(p.y - H / 2, p.x - W / 2); }
        else if (mode === 'boing'){ ox = s.x; oy = s.y; }
        else if (mode === 'squish'){ press = { t0: t0, fired: false }; count(1); fdBuzz(o, 8); fdSound(o, 'pop'); }
        else if (mode === 'flip'){ s.vfa = 0; s.ft = null; fa0 = s.fa; }
        else if (mode === 'toss'){ gx = p.x - s.x; gy = p.y - s.y; s.vx = s.vy = 0; s.va *= 0.3; }
      },
      move: function(p){
        if (!drag) return;
        var now = performance.now();
        if (Math.hypot(p.x - p0.x, p.y - p0.y) > 8) moved = true;
        if (mode === 'spin'){
          var dx = p.x - W / 2, dy = p.y - H / 2;
          if (Math.hypot(dx, dy) >= 10){ var a = Math.atan2(dy, dx), d = angDiff(a, lastAng); lastAng = a; s.a += d; count(Math.abs(d) / (Math.PI * 2)); }
        } else if (mode === 'boing'){
          var rb = function(d){ return d / (1 + Math.abs(d) / 150); };
          s.x = ox + rb(p.x - p0.x); s.y = oy + rb(p.y - p0.y); s.a = s.x * 0.004;
        } else if (mode === 'flip'){ s.fa = fa0 + (p.x - p0.x) * 0.9; }
        else if (mode === 'toss'){ var b = bounds(); s.x = Math.max(-b[0], Math.min(b[0], p.x - gx)); s.y = Math.max(-b[1], Math.min(b[1], p.y - gy)); }
        samples.push([now, p.x, p.y, s.a]);
        while (samples.length > 2 && now - samples[0][0] > 90) samples.shift();
      },
      up: function(p){
        if (!drag) return;
        drag = false;
        var now = performance.now(), a = samples[0], b = samples[samples.length - 1], dt = a && b && b[0] - a[0] > 8 && now - b[0] < 70 ? (b[0] - a[0]) / 1000 : 0;
        var vx = dt ? (b[1] - a[1]) / dt : 0, vy = dt ? (b[2] - a[2]) / dt : 0, va = dt ? (b[3] - a[3]) / dt : 0;
        var tap = !moved && now - t0 < 350;
        if (mode === 'squish'){
          var held = (now - press.t0) / 1000; press = null;
          s.vq += 2.5 + Math.min(1, held) * 5;
          if (tap) fdFire(el, o.ontap, 'tap');
        } else if (tap){
          fdFire(el, o.ontap, 'tap');
          if (mode === 'spin'){ s.va += 9 * spinDir; fdBuzz(o, 10); fdSound(o, 'click'); }
          else if (mode === 'boing'){ s.vq -= 7; s.vy -= 560; s.va += (Math.random() - 0.5) * 6; count(1); fdBuzz(o, 12); fdSound(o, 'pop'); }
          else if (mode === 'flip'){ s.ft = Math.round(s.fa / 180) * 180 + 180; fdSound(o, 'click'); }
          else if (mode === 'toss'){ s.vx = (Math.random() - 0.5) * 1600; s.vy = -(500 + Math.random() * 700); s.va += (Math.random() - 0.5) * 14; count(1); fdBuzz(o, 10); }
        } else if (mode === 'spin'){
          s.va = Math.max(-80, Math.min(80, va)); if (s.va) spinDir = s.va > 0 ? 1 : -1;
          if (Math.abs(s.va) > 14){ fdBuzz(o, 14); fdFire(el, o.onbig, 'big'); }
        } else if (mode === 'boing'){
          var far = Math.hypot(s.x - ox, s.y - oy); s.vx = vx * 0.2; s.vy = vy * 0.2;
          if (far > 40){ count(1); s.vq -= Math.min(6, far / 25); fdBuzz(o, 14); fdSound(o, 'pop'); }
          if (far > 85) fdFire(el, o.onbig, 'big');
        } else if (mode === 'flip'){
          s.vfa = Math.max(-5000, Math.min(5000, vx * 1.6));
          if (Math.abs(s.vfa) > 2200){ fdBuzz(o, 14); fdFire(el, o.onbig, 'big'); }
        } else if (mode === 'toss'){
          s.vx = Math.max(-4000, Math.min(4000, vx)); s.vy = Math.max(-4000, Math.min(4000, vy)); s.va += s.vx * 0.006;
          var sp = Math.hypot(s.vx, s.vy);
          if (sp > 300) count(1);
          if (sp > 1900){ fdBuzz(o, 16); fdFire(el, o.onbig, 'big'); }
        }
        fdSave();
      }
    });
    function bounds(){ return [Math.max(0, (W - obj.offsetWidth) / 2), Math.max(0, (H - obj.offsetHeight) / 2)]; }
    function spring(key, vkey, target, kk, c, dt){ s[vkey] += (kk * (target - s[key]) - c * s[vkey]) * dt; s[key] += s[vkey] * dt; }
    function step(dt){
      size();
      var sub = dt > 1 / 70 ? 3 : 2, h = dt / sub, i;
      for (i = 0; i < sub; i++){
        if (mode === 'spin'){
          if (!drag && s.va){
            var sign = s.va > 0 ? 1 : -1;
            s.va *= Math.exp(-0.26 * h); s.va -= sign * 0.45 * h;
            if (s.va * sign <= 0.04) s.va = 0;
            s.a += s.va * h; count(Math.abs(s.va * h) / (Math.PI * 2));
          }
          spring('q', 'vq', 0, 300, 10, h);
        } else if (mode === 'boing'){
          if (!drag){ spring('x', 'vx', 0, 170, 9, h); spring('y', 'vy', 0, 170, 9, h); spring('a', 'va', s.x * 0.004, 160, 7, h); }
          spring('q', 'vq', 0, 320, 9, h);
        } else if (mode === 'squish'){
          var held = press ? (performance.now() - press.t0) / 1000 : 0;
          if (press && !press.fired && held > 0.7){ press.fired = true; fdBuzz(o, 26); fdFire(el, o.onbig, 'big'); }
          spring('q', 'vq', press ? -(0.12 + 0.22 * Math.min(1, held / 0.6)) : 0, 260, press ? 18 : 6, h);
        } else if (mode === 'flip'){
          if (!drag){
            if (Math.abs(s.vfa) > 260 && s.ft == null){ s.vfa *= Math.exp(-1.1 * h); s.fa += s.vfa * h; }
            else spring('fa', 'vfa', s.ft != null ? s.ft : Math.round(s.fa / 180) * 180, 110, 12, h);
          }
          var side = Math.round(s.fa / 180);
          if (side !== lastSide){ count(Math.abs(side - lastSide)); lastSide = side; fdBuzz(o, 5); fdSound(o, 'tick'); }
        } else if (mode === 'toss'){
          if (!drag){
            var fr = Math.exp(-1.3 * h), b = bounds();
            s.vx *= fr; s.vy *= fr; s.x += s.vx * h; s.y += s.vy * h;
            [[0, 'x', 'vx'], [1, 'y', 'vy']].forEach(function(z){
              var lim = b[z[0]], v = s[z[2]];
              if (Math.abs(s[z[1]]) > lim){
                s[z[1]] = lim * (s[z[1]] > 0 ? 1 : -1); s[z[2]] = -v * 0.62;
                var hit = Math.abs(v); if (hit > 120){ s.vq -= Math.min(5, hit / 500); s.va += (z[0] ? s.vx : -s.vy) * 0.002; if (hit > 400){ fdBuzz(o, 6); fdSound(o, 'tick'); } }
              }
            });
            var speed = Math.hypot(s.vx, s.vy);
            if (speed < 80){ s.vx -= s.x * 4 * h; s.vy -= s.y * 4 * h; s.va += -angDiff(s.a, 0) * 10 * h; }
            s.va *= Math.exp(-1.6 * h); s.a += s.va * h;
          }
          spring('q', 'vq', 0, 320, 12, h);
        }
      }
      paint();
      var c = Math.floor(k.n); if (c !== lastN){ lastN = c; ifxCount(el); }
      var still = !drag && !press && Math.abs(s.vq) < 0.01 && Math.abs(s.q) < 0.003 &&
        (mode === 'spin' ? !s.va : mode === 'flip' ? Math.abs(s.vfa) < 1 && Math.abs(s.fa - Math.round(s.fa / 180) * 180) < 0.3 :
         Math.abs(s.vx) + Math.abs(s.vy) < 2 && Math.abs(s.x) + Math.abs(s.y) < 0.6 && Math.abs(s.va) < 0.01 && Math.abs(angDiff(s.a, 0)) < 0.004);
      if (still){
        s.q = s.vq = 0;
        if (mode === 'flip'){ s.fa = Math.round(s.fa / 180) * 180; s.vfa = 0; s.ft = null; }
        else if (mode !== 'spin'){ s.x = s.y = s.vx = s.vy = s.va = 0; s.a = 0; }
        paint(); fdSave(); return false;
      }
      return true;
    }
    function paint(){
      var q = s.q, sy = 1 + q, sx = 1 - q * 0.75, lift = mode === 'flip' ? 1 + 0.1 * Math.abs(Math.sin(s.fa * Math.PI / 180)) : 1;
      obj.style.transform = 'translate(' + s.x.toFixed(1) + 'px,' + s.y.toFixed(1) + 'px) rotate(' + s.a.toFixed(4) + 'rad)' +
        (mode === 'flip' ? ' rotateY(' + s.fa.toFixed(2) + 'deg)' : '') + ' scale(' + (sx * lift).toFixed(4) + ',' + (sy * lift).toFixed(4) + ')';
      if (mode === 'flip') obj.style.setProperty('--b', Math.cos(s.fa * Math.PI / 180) < 0 ? '.72' : '1');
    }
    paint();
    fdWake(el);
  }

  // ===================== still more widgets =====================
  function kept(key){ try { return JSON.parse(localStorage.getItem(key)) || {}; } catch(e){ return {}; } }
  function keep(key, v){ try { localStorage.setItem(key, JSON.stringify(v)); } catch(e){} }
  function sameId(type, id, fn){ document.querySelectorAll('[data-pw-live="' + type + '"][data-id="' + id + '"]').forEach(fn); }

  // To-do list: tick things off, add them right on the widget.
  var TODO_KEY = 'ppTodoV1';
  T.todo = { name:'To-do list', icon:'list', kind:'box', zones:['home','page','player','video'], w:'full', desc:'Things to do, ticked off right on the widget',
    fields:[['title','Heading','text','To do'],['done','Ticked things','seg',[['','Crossed out'],['hide','Hidden'],['bottom','Move to the bottom']]],['card','On a card','toggle',true]],
    render:function(o, c, ctx, it){
      var id = it ? it.id : 'x';
      return card(cardOn(o), '<div class="pw-tdo" data-pw-live="todo" data-id="' + esc(id) + '" data-done="' + esc(o.done || '') + '">' +
        (o.title === '' ? '' : '<div class="pw-wh"><span class="pw-wh-t">' + esc(o.title || 'To do') + '</span><span class="pw-tdo-c"></span></div>') +
        '<ul class="pw-tdo-l"></ul><form class="pw-tdo-f" data-pw-todo="' + esc(id) + '"><input type="text" maxlength="120" placeholder="Add something…" enterkeyhint="done" aria-label="Add something to do">' +
        '<button type="submit" aria-label="Add">' + svg('plus') + '</button></form></div>');
    },
    live:function(el){
      var list = kept(TODO_KEY)[el.dataset.id] || [], mode = el.dataset.done, sig = JSON.stringify(list) + mode + editing;
      if (el._sig === sig) return; el._sig = sig;
      var rows = list.map(function(x, i){ return { x:x, i:i }; });
      if (mode === 'hide') rows = rows.filter(function(r){ return !r.x.d; });
      if (mode === 'bottom') rows.sort(function(a, b){ return (a.x.d ? 1 : 0) - (b.x.d ? 1 : 0) || a.i - b.i; });
      var left = list.filter(function(x){ return !x.d; }).length, done = list.length - left;
      el.querySelector('.pw-tdo-l').innerHTML = rows.map(function(r){
        return '<li' + (r.x.d ? ' class="on"' : '') + '><button type="button" class="pw-tdo-t" data-pw-todo-op="tog" data-i="' + r.i + '" role="checkbox" aria-checked="' + !!r.x.d + '"><i>' + svg('check') + '</i><span>' + esc(r.x.t) + '</span></button>' +
          '<button type="button" class="pw-tdo-x" data-pw-todo-op="del" data-i="' + r.i + '" aria-label="Remove">' + svg('x') + '</button></li>'; }).join('') +
        (!list.length ? '<li class="pw-tdo-e">Nothing yet. Add something below.</li>' : !left ? '<li class="pw-tdo-e">All done. Nice.</li>' : '');
      setText(el.querySelector('.pw-tdo-c'), list.length ? left + ' left' : '');
      var clr = el.querySelector('.pw-tdo-clr');
      if (done && !clr){ clr = document.createElement('button'); clr.type = 'button'; clr.className = 'pw-tdo-clr'; clr.dataset.pwTodoOp = 'clear'; el.appendChild(clr); }
      if (clr){ clr.hidden = !done; setText(clr, 'Clear ' + done + ' ticked'); }
    } };
  function todoChange(id, fn){ var all = kept(TODO_KEY), l = all[id] || []; fn(l); all[id] = l; keep(TODO_KEY, all); sameId('todo', id, function(el){ T.todo.live(el); }); }
  document.addEventListener('click', function(e){
    var b = e.target.closest && e.target.closest('[data-pw-todo-op]'); if (!b || editing) return;
    var el = b.closest('[data-pw-live="todo"]'); if (!el) return;
    var op = b.dataset.pwTodoOp, i = +b.dataset.i;
    todoChange(el.dataset.id, function(l){
      if (op === 'tog' && l[i]){ l[i].d = !l[i].d; if (l[i].d){ try { if (navigator.vibrate) navigator.vibrate(8); } catch(x){} } }
      else if (op === 'del') l.splice(i, 1);
      else if (op === 'clear') for (var k2 = l.length - 1; k2 >= 0; k2--) if (l[k2].d) l.splice(k2, 1);
    });
  });
  document.addEventListener('submit', function(e){
    var f = e.target; if (!f.matches || !f.matches('[data-pw-todo]')) return;
    e.preventDefault(); if (editing) return;
    var inp = f.querySelector('input'), v = inp.value.trim(); if (!v) return;
    inp.value = '';
    todoChange(f.dataset.pwTodo, function(l){ l.push({ t: v.slice(0, 120), d: false }); if (l.length > 60) l.shift(); });
  });

  // Tally counter.
  var TALLY_KEY = 'ppTallyV1';
  T.tally = { name:'Counter', icon:'plus', kind:'box', zones:['home','page','player','video'], w:'half', desc:'Count anything: tap the number to add one',
    fields:[['label','What it counts','text','Count'],['step','Each tap adds','seg',[['','1'],['5','5'],['10','10']]],['goal','Goal','range',[0, 500, 5, 'goal', 0]],
            ['size','Size','seg',SIZES],['card','On a card','toggle',true]],
    render:function(o, c, ctx, it){
      var id = it ? it.id : 'x', st = esc(o.step || '1');
      return card(cardOn(o), '<div class="pw-tc pw-ts-' + (o.size || 'l') + '" data-pw-live="tally" data-id="' + esc(id) + '" data-goal="' + (+o.goal || 0) + '">' +
        '<div class="pw-tc-l">' + esc(o.label || 'Count') + '</div>' +
        '<button type="button" class="pw-tc-v" data-pw-tc="' + st + '" aria-label="Add ' + st + '">0</button>' +
        (+o.goal ? '<div class="pw-lvl-bar"><i></i></div>' : '') +
        '<div class="pw-tc-b"><button type="button" data-pw-tc="-' + st + '" aria-label="Take ' + st + ' away">' + svg('minus') + '</button>' +
        '<button type="button" data-pw-tc="0" class="pw-tc-r">Reset</button><button type="button" data-pw-tc="' + st + '" aria-label="Add ' + st + '">' + svg('plus') + '</button></div></div>');
    },
    live:function(el){
      var n = kept(TALLY_KEY)[el.dataset.id] || 0, g = +el.dataset.goal, v = el.querySelector('.pw-tc-v');
      setText(v, g ? n + ' / ' + g : String(n)); fitText(v);
      var bar = el.querySelector('.pw-lvl-bar i'); if (bar) bar.style.width = Math.min(100, g ? n / g * 100 : 0) + '%';
      el.classList.toggle('pw-tc-won', !!g && n >= g);
    } };
  document.addEventListener('click', function(e){
    var b = e.target.closest && e.target.closest('[data-pw-tc]'); if (!b || editing) return;
    var el = b.closest('[data-pw-live="tally"]'); if (!el) return;
    var all = kept(TALLY_KEY), id = el.dataset.id, d = +b.dataset.pwTc, before = all[id] || 0, g = +el.dataset.goal;
    all[id] = b.dataset.pwTc === '0' ? 0 : Math.max(0, before + d); keep(TALLY_KEY, all);
    try { if (navigator.vibrate) navigator.vibrate(g && before < g && all[id] >= g ? [30, 60, 30] : 6); } catch(x){}
    if (g && before < g && all[id] >= g) toast('Goal reached: ' + g + '!');
    if (b.classList.contains('pw-tc-v')){ b.classList.remove('pw-tc-bump'); void b.offsetWidth; b.classList.add('pw-tc-bump'); }
    sameId('tally', id, function(x){ T.tally.live(x); });
  });

  // Focus timer: work, then a break, round and round. Can start the music for work and pause it for breaks.
  var FOCUS_KEY = 'ppFocusV1';
  T.focus = { name:'Focus timer', icon:'clock', kind:'box', zones:['home','page','player','video'], w:'full', desc:'Work, break, repeat. Can play music while you work and pause it for breaks',
    fields:[['work','Work for','seg',[['15','15 min'],['','25 min'],['45','45 min'],['60','1 hour']]],['rest','Breaks','seg',[['','5 min'],['10','10 min'],['15','15 min']]],
            ['music','Music','seg',[['','Leave it'],['play','Play for work, pause for breaks']]],['buzz','Vibrate when it changes','toggle',true],['card','On a card','toggle',true]],
    render:function(o, c, ctx, it){
      var id = it ? it.id : 'x';
      return card(cardOn(o), '<div class="pw-fo" data-pw-live="focus" data-id="' + esc(id) + '" data-work="' + (+o.work || 25) + '" data-rest="' + (+o.rest || 5) + '" data-music="' + esc(o.music || '') + '" data-buzz="' + (o.buzz === false ? 0 : 1) + '">' +
        '<div class="pw-fo-ring"><div class="pw-fo-in"><b>25:00</b><small>Focus</small></div></div>' +
        '<div class="pw-fo-side"><div class="pw-fo-r"></div><div class="pw-sw-b"><button type="button" data-pw-fo="go">Start</button><button type="button" data-pw-fo="skip">Skip</button><button type="button" data-pw-fo="reset">Reset</button></div></div></div>');
    },
    live:function(el){
      var all = kept(FOCUS_KEY), id = el.dataset.id, s = all[id] || {}, ph = s.ph || 'work', len = (ph === 'work' ? +el.dataset.work : +el.dataset.rest) * 60000;
      var left = s.run ? s.end - Date.now() : s.left != null ? s.left : len;
      if (s.run && left <= 0){ focusNext(el, s, ph); all[id] = s; keep(FOCUS_KEY, all); return T.focus.live(el); }
      left = Math.max(0, left);
      var sec = Math.ceil(left / 1000);
      setText(el.querySelector('.pw-fo-in b'), Math.floor(sec / 60) + ':' + pad(sec % 60));
      setText(el.querySelector('.pw-fo-in small'), ph === 'work' ? 'Focus' : 'Break');
      el.style.setProperty('--p', ((1 - left / len) * 100).toFixed(2) + '%');
      el.classList.toggle('pw-fo-rest', ph !== 'work'); el.classList.toggle('pw-fo-run', !!s.run);
      setText(el.querySelector('.pw-fo-r'), (s.done || 0) ? (s.done === 1 ? '1 round done today' : s.done + ' rounds done today') : 'Ready when you are');
      setText(el.querySelector('[data-pw-fo="go"]'), s.run ? 'Pause' : s.left != null ? 'Go on' : 'Start');
    } };
  function focusNext(el, s, ph){
    var day = new Date().toDateString(); if (s.day !== day){ s.day = day; s.done = 0; }
    if (ph === 'work') s.done = (s.done || 0) + 1;
    s.ph = ph === 'work' ? 'rest' : 'work';
    s.end = Date.now() + (s.ph === 'work' ? +el.dataset.work : +el.dataset.rest) * 60000; s.left = null;
    toast(s.ph === 'work' ? 'Break over. Back to it.' : 'Nice work. Time for a break.');
    if (el.dataset.buzz === '1'){ try { if (navigator.vibrate) navigator.vibrate([180, 90, 180]); } catch(x){} }
    focusMusic(el, s.ph);
  }
  function focusMusic(el, ph){
    if (el.dataset.music !== 'play') return;
    var playing = liveState().playing, K = kit();
    if (ph === 'work' && !playing){ if (K && K.hasTrack()) click('play-btn'); else runAction('shuffleall'); }
    if (ph !== 'work' && playing) click('play-btn');
  }
  document.addEventListener('click', function(e){
    var b = e.target.closest && e.target.closest('[data-pw-fo]'); if (!b || editing) return;
    var el = b.closest('[data-pw-live="focus"]'); if (!el) return;
    var all = kept(FOCUS_KEY), id = el.dataset.id, s = all[id] || {}, op = b.dataset.pwFo, ph = s.ph || 'work';
    var len = (ph === 'work' ? +el.dataset.work : +el.dataset.rest) * 60000;
    if (op === 'reset') s = { day: s.day, done: s.done };
    else if (op === 'skip'){ s.run = true; focusNext(el, s, ph); }
    else if (s.run){ s.left = Math.max(0, s.end - Date.now()); s.run = false; }
    else { s.end = Date.now() + (s.left != null ? s.left : len); s.left = null; s.run = true; s.ph = ph; focusMusic(el, ph); }
    all[id] = s; keep(FOCUS_KEY, all); startTick();
    sameId('focus', id, function(x){ T.focus.live(x); });
  });

  // World clock: the time in up to three other places.
  var CITIES = [['America/Los_Angeles','Los Angeles'],['America/Denver','Denver'],['America/Chicago','Chicago'],['America/New_York','New York'],['America/Toronto','Toronto'],
    ['America/Mexico_City','Mexico City'],['America/Sao_Paulo','São Paulo'],['America/Argentina/Buenos_Aires','Buenos Aires'],['Atlantic/Reykjavik','Reykjavík'],['Europe/London','London'],
    ['Europe/Dublin','Dublin'],['Europe/Lisbon','Lisbon'],['Europe/Paris','Paris'],['Europe/Berlin','Berlin'],['Europe/Madrid','Madrid'],['Europe/Rome','Rome'],['Europe/Stockholm','Stockholm'],
    ['Europe/Athens','Athens'],['Europe/Istanbul','Istanbul'],['Europe/Moscow','Moscow'],['Africa/Cairo','Cairo'],['Africa/Lagos','Lagos'],['Africa/Johannesburg','Johannesburg'],
    ['Asia/Dubai','Dubai'],['Asia/Karachi','Karachi'],['Asia/Kolkata','Mumbai / Delhi'],['Asia/Bangkok','Bangkok'],['Asia/Singapore','Singapore'],['Asia/Shanghai','Beijing'],
    ['Asia/Hong_Kong','Hong Kong'],['Asia/Manila','Manila'],['Asia/Seoul','Seoul'],['Asia/Tokyo','Tokyo'],['Australia/Perth','Perth'],['Australia/Sydney','Sydney'],
    ['Pacific/Auckland','Auckland'],['Pacific/Honolulu','Honolulu']];
  var CITY_OPTS = [['','None']].concat(CITIES);
  T.world = { name:'World clock', icon:'sun', kind:'box', zones:['home','page','player','video'], w:'full', desc:'The time in up to three other places',
    o0:{ c1:'America/New_York', c2:'Europe/London', c3:'Asia/Tokyo' },
    fields:[['c1','First place','select',CITY_OPTS],['c2','Second place','select',CITY_OPTS],['c3','Third place','select',CITY_OPTS],['h12','12-hour clock','toggle',false],['card','On a card','toggle',true]],
    render:function(o){
      var zs = [o.c1, o.c2, o.c3].filter(function(z){ return CITIES.some(function(c){ return c[0] === z; }); });
      if (!zs.length) return '<div class="pw-empty">Pick some places in this box’s settings.</div>';
      return card(cardOn(o), '<div class="pw-wc" data-pw-live="world" data-h12="' + (o.h12 ? 1 : 0) + '">' + zs.map(function(z){
        var name = CITIES.filter(function(c){ return c[0] === z; })[0][1];
        return '<div class="pw-wc-c" data-tz="' + esc(z) + '"><small>' + esc(name) + '</small><b></b><span></span></div>'; }).join('') + '</div>');
    },
    live:function(el, st){
      var now = st.now, h12 = el.dataset.h12 === '1';
      el.querySelectorAll('[data-tz]').forEach(function(c){
        var tz = c.dataset.tz, t, there;
        try { t = now.toLocaleTimeString(undefined, { hour:'numeric', minute:'2-digit', hour12:h12, timeZone:tz }); there = new Date(now.toLocaleString('en-US', { timeZone:tz })); } catch(e){ t = '—'; there = now; }
        var here = new Date(now.toLocaleString('en-US')), diff = Math.round((there - here) / 1800000) / 2;
        var dd = there.getDate() !== here.getDate() ? (there > here ? 'Tomorrow, ' : 'Yesterday, ') : 'Today, ';
        setText(c.querySelector('b'), t);
        setText(c.querySelector('span'), dd + (diff === 0 ? 'same time' : (diff > 0 ? '+' : '−') + Math.abs(diff) + 'h'));
        c.classList.toggle('pw-wc-night', there.getHours() < 6 || there.getHours() >= 21);
      });
    } };

  // Breathe: a circle to breathe along with.
  var BREATHE = { '': [['in', 4], ['out', 4]], box: [['in', 4], ['hold', 4], ['out', 4], ['hold2', 4]], '478': [['in', 4], ['hold', 7], ['out', 8]] };
  var BR_WORD = { in:'Breathe in', hold:'Hold', out:'Breathe out', hold2:'Hold' };
  T.breathe = { name:'Breathe', icon:'wave', kind:'box', zones:['home','page','player','video'], w:'full', desc:'A calm circle to breathe along with. Tap to start',
    fields:[['pat','Rhythm','seg',[['','Calm (4, 4)'],['box','Box (4, 4, 4, 4)'],['478','Relax (4, 7, 8)']]],['h','Size','range',[120, 320, 10, 'px', 180]],['color','Colour','color',''],['card','On a card','toggle',false]],
    render:function(o, c, ctx, it){
      var h = Math.max(120, Math.min(320, +o.h || 180));
      return card(o, '<div class="pw-br" data-pw-live="breathe" data-id="' + esc(it ? it.id : 'x') + '" data-pat="' + esc(BREATHE[o.pat] ? o.pat : '') + '" style="height:' + h + 'px' + (okCol(o.color) ? ';--pw-fc:' + o.color : '') + '">' +
        '<button type="button" class="pw-br-c" data-pw-br="1" aria-label="Start or stop breathing"><i></i><span>Tap to start</span></button><small class="pw-br-n"></small></div>');
    },
    live:function(el){ var m = FDM['br:' + el.dataset.id]; if (m && m.run && !el._brT) brPhase(el, m); } };
  function brPhase(el, m){
    clearTimeout(el._brT); el._brT = 0;
    if (!el.isConnected || !m.run) return;
    var pat = BREATHE[el.dataset.pat] || BREATHE[''], ph = pat[m.i % pat.length], i = el.querySelector('i');
    i.style.transitionDuration = ph[1] + 's';
    if (ph[0] === 'in') i.style.transform = 'scale(1)';
    if (ph[0] === 'out') i.style.transform = 'scale(.42)';
    setText(el.querySelector('span'), BR_WORD[ph[0]]);
    setText(el.querySelector('.pw-br-n'), m.rounds ? (m.rounds === 1 ? '1 breath' : m.rounds + ' breaths') : '');
    el._brT = setTimeout(function(){ m.i++; if (m.i % pat.length === 0) m.rounds++; brPhase(el, m); }, ph[1] * 1000);
  }
  document.addEventListener('click', function(e){
    var b = e.target.closest && e.target.closest('[data-pw-br]'); if (!b || editing) return;
    var el = b.closest('[data-pw-live="breathe"]'); if (!el) return;
    var m = fdMem('br:' + el.dataset.id, { run:false, i:0, rounds:0 });
    m.run = !m.run;
    if (m.run){ m.i = 0; m.rounds = 0; brPhase(el, m); }
    else { clearTimeout(el._brT); el._brT = 0; var i = el.querySelector('i'); i.style.transitionDuration = '.6s'; i.style.transform = ''; setText(el.querySelector('span'), 'Tap to start'); }
  });

  // Dice, a coin, a number, yes / no or a magic answer. Rolling can also run an action.
  var MAGIC = ['Yes.', 'No.', 'Definitely.', 'Ask again later.', 'Without a doubt.', 'Don’t count on it.', 'Most likely.', 'Very doubtful.', 'Signs point to yes.', 'Better not tell you now.', 'Absolutely!', 'Not a chance.'];
  T.dice = { name:'Dice & coin', icon:'dice', kind:'box', zones:['home','page','player','video'], w:'half', desc:'Roll dice, flip a coin, pick a number or ask a yes / no question',
    rerender:['kind'],
    fields:[['kind','Roll','seg',[['','A die'],['two','Two dice'],['coin','Coin'],['num','Number'],['yesno','Yes / no'],['magic','Magic answer']]],
            ['max','From 1 to','range',[2, 1000, 1, '', 100], function(o){ return o.kind === 'num'; }],
            ['after','Rolling also does','fidact',''],['card','On a card','toggle',true]],
    render:function(o, c, ctx, it){
      var id = it ? it.id : 'x';
      return card(cardOn(o), '<div class="pw-dice-w" data-pw-live="dice" data-id="' + esc(id) + '"><button type="button" class="pw-dice pw-dice-' + esc(o.kind || 'die') + '" data-pw-dice="' + esc(id) + '"' +
        ' data-kind="' + esc(o.kind || '') + '" data-max="' + Math.max(2, Math.min(1000, +o.max || 100)) + '" data-after="' + esc(o.after || '') + '" aria-label="Roll"></button><small>Tap to roll</small></div>');
    },
    live:function(el){ var b = el.querySelector('.pw-dice'); if (!b._done){ b._done = true; diceShow(b, (FDM['dice:' + el.dataset.id] || {}).r); } } };
  function pips(n){ var on = { 1:[4], 2:[0, 8], 3:[0, 4, 8], 4:[0, 2, 6, 8], 5:[0, 2, 4, 6, 8], 6:[0, 2, 3, 5, 6, 8] }[n] || [];
    var h = '<span class="pw-die">'; for (var i = 0; i < 9; i++) h += '<i' + (on.indexOf(i) >= 0 ? ' class="on"' : '') + '></i>'; return h + '</span>'; }
  function diceRoll(kind, max){
    var r = function(n){ return 1 + Math.floor(Math.random() * n); };
    if (kind === 'two') return [r(6), r(6)];
    if (kind === 'coin') return Math.random() < 0.5 ? 'Heads' : 'Tails';
    if (kind === 'num') return r(max);
    if (kind === 'yesno') return Math.random() < 0.5 ? 'Yes' : 'No';
    if (kind === 'magic') return MAGIC[r(MAGIC.length) - 1];
    return [r(6)];
  }
  function diceShow(b, r){
    var kind = b.dataset.kind;
    if (r == null){ b.innerHTML = kind === 'two' ? pips(6) + pips(6) : kind === 'coin' ? '<span class="pw-coin">?</span>' : kind === '' ? pips(6) : '<span class="pw-dice-t">?</span>'; return; }
    if (Array.isArray(r)) b.innerHTML = r.map(pips).join('') + (r.length > 1 ? '<em>' + (r[0] + r[1]) + '</em>' : '');
    else if (kind === 'coin') b.innerHTML = '<span class="pw-coin' + (r === 'Tails' ? ' pw-coin-t' : '') + '">' + esc(r) + '</span>';
    else b.innerHTML = '<span class="pw-dice-t' + (String(r).length > 6 ? ' pw-dice-long' : '') + '">' + esc(String(r)) + '</span>';
  }
  document.addEventListener('click', function(e){
    var b = e.target.closest && e.target.closest('[data-pw-dice]'); if (!b || editing || b.classList.contains('pw-rolling')) return;
    var el = b.closest('[data-pw-live="dice"]'), r = diceRoll(b.dataset.kind, +b.dataset.max), n = 0;
    b.classList.add('pw-rolling');
    try { if (navigator.vibrate) navigator.vibrate([8, 40, 8, 40, 8]); } catch(x){}
    var shuffle = setInterval(function(){ n++; diceShow(b, diceRoll(b.dataset.kind, +b.dataset.max)); }, 90);
    setTimeout(function(){
      clearInterval(shuffle); b.classList.remove('pw-rolling'); diceShow(b, r);
      fdMem('dice:' + el.dataset.id, {}).r = r;
      try { if (navigator.vibrate) navigator.vibrate(18); } catch(x){}
      if (b.dataset.after && ACTIONS[b.dataset.after] && ACTIONS[b.dataset.after].run) runAction(b.dataset.after);
    }, 620);
  });
