/* Press Play Playground: the fourth app mode, bought in the Points shop (Games > Points > Shop > For Press Play).
   While it is on: everything is unlocked, the Disc Clicker stays out, every game exclusive is free, and this file adds
   the Playground itself (a hub with a daily wheel, orders, charms and links into the EQ and backgrounds).
   Other Playground scripts add tabs with PPPlayground.registerTab(). */
(function(){
  'use strict';
  var KEY = 'ppPlaygroundV1', MODE = 'ppPlaygroundMode';
  var COL = ['#6ee7d0', '#8b5cff', '#ff5fd8', '#ffb36e'];

  function on(){ try { return localStorage.getItem(MODE) === '1'; } catch(e){ return false; } }
  function esc(s){ return String(s).replace(/[&<>"]/g, function(c){ return { '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;' }[c]; }); }
  function dayKey(){ var d = new Date(); return d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate(); }
  function toast(m){ try { if (typeof showToast === 'function') showToast(m); } catch(e){} }
  function fmt(n){
    try { if (window.PPClicker && window.PPClicker.fmt) return window.PPClicker.fmt(n); } catch(e){}
    return Math.round(n).toLocaleString();
  }
  function pick(a){ return a[Math.floor(Math.random() * a.length)]; }

  /* ------------------------------------------------------------------ saved state */
  function fresh(){
    return { v:1, stars:0, total:0, spins:0, lastSpin:'', slots:3,
      charms:{ own:{}, eq:[] }, orders:{ list:[], streak:0, done:0, seq:0 },
      stats:{}, opts:{ fab:true, sfx:true }, storm:{ until:0, mult:2 }, gameStarMs:0 };
  }
  function load(){
    var o = null, f = fresh();
    try { o = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch(e){}
    if (!o || typeof o !== 'object') return f;
    Object.keys(f).forEach(function(k){ if (!(k in o)) o[k] = f[k]; });
    ['charms', 'orders', 'opts', 'storm'].forEach(function(k){
      if (!o[k] || typeof o[k] !== 'object') o[k] = f[k];
      Object.keys(f[k]).forEach(function(j){ if (!(j in o[k])) o[k][j] = f[k][j]; });
    });
    if (!o.stats || typeof o.stats !== 'object') o.stats = {};
    return o;
  }
  var S = load(), saveT = null;
  function save(now){
    if (now){ clearTimeout(saveT); saveT = null; try { localStorage.setItem(KEY, JSON.stringify(S)); } catch(e){} return; }
    if (saveT) return;
    saveT = setTimeout(function(){ saveT = null; try { localStorage.setItem(KEY, JSON.stringify(S)); } catch(e){} }, 400);
  }
  window.addEventListener('pagehide', function(){ save(true); });

  /* ------------------------------------------------------------------ the module API */
  var multFns = [], tabs = [], PP = window.PPPlayground = {
    S: S, on: on, save: save, esc: esc, fmt: fmt, toast: toast, pick: pick, dayKey: dayKey, COL: COL
  };
  PP.addMult = function(fn){ multFns.push(fn); };
  PP.registerTab = function(def){ tabs = tabs.filter(function(t){ return t.id !== def.id; }); tabs.push(def); tabs.sort(function(a, b){ return (a.order || 50) - (b.order || 50); }); if (hubOpen()) renderTabs(); };
  PP.stat = function(kind, n){
    if (!on()) return;
    S.stats[kind] = (S.stats[kind] || 0) + (n == null ? 1 : n);
    save();
  };
  PP.get = function(kind){ return S.stats[kind] || 0; };
  PP.addStars = function(n, why, quiet){
    n = Math.round(n); if (!(n > 0)) return 0;
    S.stars += n; S.total += n; save();
    if (!quiet) toast('+' + n + ' ⭐ ' + (why || ''));
    refreshBalance(); checkAch();
    return n;
  };
  PP.spendStars = function(n){ if (S.stars < n) return false; S.stars -= n; save(); refreshBalance(); return true; };
  PP.addGrooves = function(n){ try { if (window.PPClicker && n > 0){ window.PPClicker.add(n); return true; } } catch(e){} return false; };
  PP.ps = function(){ try { return window.PPClicker ? window.PPClicker.ps() : 0; } catch(e){ return 0; } };

  /* multipliers: charms, the Groove Storm, the album and the mode's own bonus */
  function stormActive(){ return S.storm.until > Date.now(); }
  PP.stormActive = stormActive;
  PP.mult = function(kind){
    if (!on()) return 1;
    var m = 1;
    S.charms.eq.forEach(function(id){ var c = charmById(id); if (c && c.fx && c.fx[kind]) m *= c.fx[kind]; });
    if (stormActive() && (kind === 'click' || kind === 'ps')) m *= S.storm.mult;
    if (kind === 'xp') m *= 1.25;   // the mode's own bonus: 25% more EXP
    multFns.forEach(function(fn){ try { m *= (fn(kind) || 1); } catch(e){} });
    return m;
  };

  /* ------------------------------------------------------------------ sound (small synth blips) */
  var AC = null;
  function blip(f, d, type, v, delay){
    if (!S.opts.sfx) return;
    try {
      var Ctor = window.AudioContext || window.webkitAudioContext; if (!Ctor) return;
      if (!AC) AC = new Ctor();
      if (AC.state === 'suspended') AC.resume();
      var t = AC.currentTime + (delay || 0), o = AC.createOscillator(), g = AC.createGain();
      o.type = type || 'triangle'; o.frequency.setValueAtTime(f, t);
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(v || 0.12, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + (d || 0.12));
      o.connect(g); g.connect(AC.destination); o.start(t); o.stop(t + (d || 0.12) + 0.05);
    } catch(e){}
  }
  PP.blip = blip;
  function chime(){ [523.25, 659.25, 783.99, 1046.5].forEach(function(f, i){ blip(f, 0.16, 'triangle', 0.1, i * 0.07); }); }
  PP.chime = chime;

  /* ------------------------------------------------------------------ charms (Ante Up) */
  var CHARMS = [
    { id:'magnet',  icon:'🧲', n:'Coin Magnet',     rar:'Common',    p:30,   fx:{ click:1.25 },            d:'Disc clicks give 25% more.' },
    { id:'metro',   icon:'⏱️', n:'Metronome',       rar:'Common',    p:35,   fx:{ ps:1.15 },               d:'Groove production +15%.' },
    { id:'clover',  icon:'🍀', n:'Lucky Clover',    rar:'Common',    p:40,   fx:{ spin:1.25 },             d:'Wheel rewards are 25% bigger.' },
    { id:'halo',    icon:'🎧', n:'Headphone Halo',  rar:'Rare',      p:90,   fx:{ points:1.1 },            d:'Press Play Points earned +10%.' },
    { id:'mic',     icon:'🎤', n:'Encore Mic',      rar:'Rare',      p:110,  fx:{ order:1.25 },            d:'Order rewards are 25% bigger.' },
    { id:'study',   icon:'📚', n:'Study Buddy',     rar:'Rare',      p:120,  fx:{ xp:1.15 },               d:'App EXP +15% on top of the mode bonus.' },
    { id:'bass',    icon:'🔊', n:'Bass Boost',      rar:'Rare',      p:140,  fx:{ click:1.5 },             d:'Disc clicks give 50% more.' },
    { id:'vinyl',   icon:'💿', n:'Vinyl Spinner',   rar:'Rare',      p:170,  fx:{ ps:1.3 },                d:'Groove production +30%.' },
    { id:'crown',   icon:'👑', n:'Crown',           rar:'Epic',      p:400,  fx:{ click:1.2, ps:1.2 },     d:'Clicks and production +20%.' },
    { id:'storm',   icon:'🌩️', n:'Storm Caller',    rar:'Legendary', p:900,  fx:{},                        d:'Groove Storms last twice as long and give ×3.' },
    { id:'infinity',icon:'♾️', n:'Infinity Mix',    rar:'Legendary', p:1500, fx:{ ps:2 },                  d:'Groove production ×2.' }
  ];
  function charmById(id){ for (var i = 0; i < CHARMS.length; i++) if (CHARMS[i].id === id) return CHARMS[i]; return null; }
  PP.CHARMS = CHARMS; PP.charmEquipped = function(id){ return S.charms.eq.indexOf(id) >= 0; };
  var RAR = { Common:'#9aa3b2', Rare:'#6ea8ff', Epic:'#b05cff', Legendary:'#ffb36e' };

  /* ------------------------------------------------------------------ the Groove Storm */
  function startStorm(ms){
    var strong = PP.charmEquipped('storm');
    var dur = ms * (strong ? 2 : 1), m = strong ? 3 : 2, now = Date.now();
    S.storm = { until: Math.max(now, S.storm.until) + dur, mult: Math.max(m, stormActive() ? S.storm.mult : 0) };
    save(); toast('🌩️ Groove Storm! Clicks and grooves ×' + S.storm.mult + ' for ' + Math.round(dur / 60000) + ' min');
    try { if (window.PPClicker) window.PPClicker.show(); } catch(e){}
  }

  /* ------------------------------------------------------------------ the daily wheel */
  var SEGS = [
    { k:'g1',   t:'🎵', l:'Grooves',     c:'#6ee7d0', w:24 },
    { k:'s5',   t:'+5',  l:'+5 Stars',   c:'#8b5cff', w:22 },
    { k:'g2',   t:'🎶', l:'Big Grooves', c:'#ff5fd8', w:10 },
    { k:'s15',  t:'+15', l:'+15 Stars',  c:'#ffb36e', w:12 },
    { k:'free', t:'🎟️', l:'Free Spin',  c:'#39d5ff', w:9 },
    { k:'storm',t:'🌩️', l:'Groove Storm',c:'#b79bff', w:9 },
    { k:'s25',  t:'+25', l:'+25 Stars',  c:'#3ddc84', w:10 },
    { k:'jack', t:'💎', l:'JACKPOT +60', c:'#ff6a3d', w:4 }
  ];
  var wheelAngle = 0, spinning = false;
  function spinReady(){ return S.lastSpin !== dayKey() || S.spins > 0; }
  PP.spinReady = spinReady;
  function pickSeg(){
    var tot = 0; SEGS.forEach(function(s){ tot += s.w; });
    var r = Math.random() * tot, i = 0;
    for (; i < SEGS.length; i++){ r -= SEGS[i].w; if (r < 0) break; }
    return Math.min(i, SEGS.length - 1);
  }
  function drawWheel(cv, ang){
    var ctx = cv.getContext('2d'), W = cv.width, R = W / 2 - 8, cx = W / 2, cy = W / 2, n = SEGS.length, sg = Math.PI * 2 / n;
    ctx.clearRect(0, 0, W, W);
    ctx.save(); ctx.shadowColor = 'rgba(139,92,255,.55)'; ctx.shadowBlur = 16;
    ctx.beginPath(); ctx.arc(cx, cy, R + 4, 0, 7); ctx.fillStyle = '#16171b'; ctx.fill(); ctx.restore();
    for (var i = 0; i < n; i++){
      var a0 = ang + i * sg - Math.PI / 2;
      ctx.beginPath(); ctx.moveTo(cx, cy); ctx.arc(cx, cy, R, a0, a0 + sg); ctx.closePath();
      ctx.fillStyle = SEGS[i].c; ctx.globalAlpha = 0.9; ctx.fill(); ctx.globalAlpha = 1;
      ctx.strokeStyle = 'rgba(12,13,16,.8)'; ctx.lineWidth = 2; ctx.stroke();
      ctx.save(); ctx.translate(cx, cy); ctx.rotate(a0 + sg / 2); ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
      ctx.fillStyle = '#0c0d10'; ctx.font = 'bold 36px sans-serif'; ctx.fillText(SEGS[i].t, R - 16, 0);
      ctx.restore();
    }
    ctx.beginPath(); ctx.arc(cx, cy, 20, 0, 7); ctx.fillStyle = '#0c0d10'; ctx.fill();
    ctx.lineWidth = 3; ctx.strokeStyle = '#6ee7d0'; ctx.stroke();
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.moveTo(cx - 5, cy - 8); ctx.lineTo(cx - 5, cy + 8); ctx.lineTo(cx + 9, cy); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.moveTo(cx - 12, 2); ctx.lineTo(cx + 12, 2); ctx.lineTo(cx, 26); ctx.closePath();   // pointer
    ctx.fillStyle = '#fff'; ctx.shadowColor = '#000'; ctx.shadowBlur = 4; ctx.fill(); ctx.shadowBlur = 0;
  }
  function reward(seg){
    var sm = PP.mult('spin'), ps = PP.ps(), msg = '';
    switch (seg.k){
      case 'g1': { var g = Math.round(Math.max(500, ps * 600) * sm); PP.addGrooves(g); msg = '+' + fmt(g) + ' grooves'; break; }
      case 'g2': { var g2 = Math.round(Math.max(4000, ps * 3600) * sm); PP.addGrooves(g2); msg = '+' + fmt(g2) + ' grooves'; break; }
      case 's5': PP.addStars(5 * sm, '', true); msg = '+' + Math.round(5 * sm) + ' ⭐'; break;
      case 's15': PP.addStars(15 * sm, '', true); msg = '+' + Math.round(15 * sm) + ' ⭐'; break;
      case 's25': PP.addStars(25 * sm, '', true); msg = '+' + Math.round(25 * sm) + ' ⭐'; break;
      case 'jack': PP.addStars(60 * sm, '', true); msg = 'JACKPOT! +' + Math.round(60 * sm) + ' ⭐'; break;
      case 'free': S.spins++; msg = 'a free spin'; break;
      case 'storm': startStorm(10 * 60000); msg = 'a Groove Storm'; break;
    }
    return msg;
  }
  function doSpin(){
    if (spinning || !spinReady()) return;
    var free = S.lastSpin !== dayKey();
    if (free) S.lastSpin = dayKey(); else S.spins--;
    var idx = pickSeg(), n = SEGS.length, sg = Math.PI * 2 / n;
    var target = -((idx + 0.5) * sg) + Math.PI * 2 * (5 + Math.floor(Math.random() * 2));
    var start = wheelAngle % (Math.PI * 2), t0 = performance.now(), dur = 3400, cv = document.getElementById('pgr-wheel');
    spinning = true; PP.stat('spins', 1); save(true); updateSpinBtn();
    var last = -1;
    (function frame(now){
      var k = Math.min(1, (now - t0) / dur), e = 1 - Math.pow(1 - k, 3);
      wheelAngle = start + (target - start) * e;
      var tick = Math.floor(((wheelAngle % (Math.PI * 2)) + Math.PI * 2) / sg);
      if (tick !== last){ last = tick; if (k < 1) blip(900 + (tick % 4) * 90, 0.03, 'square', 0.04); }
      cv = document.getElementById('pgr-wheel'); if (cv) drawWheel(cv, wheelAngle);
      if (k < 1) return requestAnimationFrame(frame);
      spinning = false;
      var msg = reward(SEGS[idx]);
      chime(); toast('🎡 ' + SEGS[idx].l + ': ' + msg);
      var r = document.getElementById('pgr-spin-res'); if (r) r.textContent = SEGS[idx].l + ' → ' + msg;
      updateSpinBtn(); refreshBalance(); checkAch(); save(true);
    })(t0);
  }

  /* ------------------------------------------------------------------ orders (Kitchen Rush) */
  var ORDER_KINDS = [
    { id:'clicks', stat:'clicks',  unit:'',    t:function(n){ return 'Click the disc ' + n + ' times'; },          tgt:[40, 120, 300] },
    { id:'game',   stat:'gameMs',  unit:'ms',  t:function(n){ return 'Play games for ' + n + ' min'; },             tgt:[3, 8, 15] },
    { id:'listen', stat:'listenMs',unit:'ms',  t:function(n){ return 'Listen to music for ' + n + ' min'; },        tgt:[5, 12, 25] },
    { id:'spin',   stat:'spins',   unit:'',    t:function(n){ return n === 1 ? 'Spin the wheel' : 'Spin the wheel ' + n + ' times'; }, tgt:[1, 2, 3] },
    { id:'eq',     stat:'eq',      unit:'',    t:function(n){ return n === 1 ? 'Try an EQ preset from the Stage' : 'Try ' + n + ' EQ presets from the Stage'; }, tgt:[1, 2, 4] },
    { id:'charm',  stat:'equips',  unit:'',    t:function(n){ return n === 1 ? 'Equip a charm' : 'Equip ' + n + ' charms'; }, tgt:[1, 2, 3] }
  ];
  var ORDER_STARS = [4, 9, 18], ORDER_MIN = [5, 15, 40], ORDER_TIME = 2 * 3600000;
  function orderKind(id){ for (var i = 0; i < ORDER_KINDS.length; i++) if (ORDER_KINDS[i].id === id) return ORDER_KINDS[i]; return null; }
  function orderTarget(o){ var k = orderKind(o.kind); return k.unit === 'ms' ? o.target * 60000 : o.target; }
  function orderProgress(o){ var k = orderKind(o.kind); return Math.min(orderTarget(o), Math.max(0, (S.stats[k.stat] || 0) - o.base)); }
  function newOrder(usedKinds){
    var pool = ORDER_KINDS.filter(function(k){ return usedKinds.indexOf(k.id) < 0; });
    if (!pool.length) pool = ORDER_KINDS;
    var k = pick(pool), tier = Math.random() < 0.5 ? 0 : (Math.random() < 0.65 ? 1 : 2);
    return { id: ++S.orders.seq, kind: k.id, tier: tier, target: k.tgt[tier], base: S.stats[k.stat] || 0, until: Date.now() + ORDER_TIME, done: false };
  }
  function fillOrders(){
    var L = S.orders.list, changed = false, now = Date.now();
    for (var i = L.length - 1; i >= 0; i--){
      var o = L[i];
      if (!orderKind(o.kind)){ L.splice(i, 1); changed = true; continue; }
      if (!o.done && o.until < now){ L.splice(i, 1); S.orders.streak = 0; changed = true; }
    }
    while (L.length < 3){ L.push(newOrder(L.map(function(o){ return o.kind; }))); changed = true; }
    if (changed) save();
    return changed;
  }
  function orderReady(o){ return !o.done && orderProgress(o) >= orderTarget(o); }
  PP.claimable = function(){ var c = 0; S.orders.list.forEach(function(o){ if (orderReady(o)) c++; }); return c; };
  function claimOrder(id){
    var L = S.orders.list, o = null, i;
    for (i = 0; i < L.length; i++) if (L[i].id === id) o = L[i];
    if (!o || !orderReady(o)) return;
    var streak = S.orders.streak + 1, bonus = 1 + Math.min(0.5, S.orders.streak * 0.1), om = PP.mult('order');
    var stars = Math.round(ORDER_STARS[o.tier] * bonus * om), grooves = Math.round(Math.max([300, 900, 2400][o.tier], PP.ps() * ORDER_MIN[o.tier] * 60) * om);
    PP.addStars(stars, '', true); PP.addGrooves(grooves);
    S.orders.streak = streak; S.orders.done++; PP.stat('orders', 1);
    L.splice(L.indexOf(o), 1); fillOrders(); save(true);
    chime(); toast('🧾 Order up! +' + stars + ' ⭐ and +' + fmt(grooves) + ' grooves' + (streak > 1 ? ' (streak ×' + streak + ')' : ''));
    renderActive(); refreshBalance(); checkAch();
  }
  function timeLeft(ms){ var m = Math.max(0, Math.ceil(ms / 60000)); return m >= 60 ? Math.floor(m / 60) + 'h ' + (m % 60) + 'm' : m + 'm'; }

  /* ------------------------------------------------------------------ the hub */
  var css = document.createElement('style');
  css.id = 'pgr-style';
  css.textContent = [
    'body:not(.pp-playground) #pgr-fab,body:not(.pp-playground) #pgr-settings-section,body:not(.pp-playground) .ppxp-bg-swatch[data-pg],body:not(.pp-playground) .ppxp-eq-pro-btn[data-pg]{display:none!important}',
    '#pp-mode-banner.playground,#pp-mode-banner.playground *{color:#0c0d10!important;-webkit-text-fill-color:#0c0d10!important}',
    '#pp-mode-banner.playground{background:linear-gradient(90deg,#6ee7d0,#8b5cff,#ff5fd8,#ffb36e,#6ee7d0)!important;background-size:200% 100%;box-shadow:0 6px 30px rgba(139,92,255,.6)}',
    '#pgr-fab{position:fixed;right:12px;top:46%;z-index:61;width:52px;height:52px;border-radius:50%;border:2px solid transparent;line-height:1;cursor:pointer;padding:0;color:#fff;overflow:visible;',
    ' background:linear-gradient(#16171b,#16171b) padding-box,linear-gradient(135deg,#6ee7d0,#8b5cff 55%,#ff5fd8) border-box;box-shadow:0 6px 22px rgba(139,92,255,.45);-webkit-tap-highlight-color:transparent}',
    '#pgr-fab:active{transform:scale(.92)}',
    '.pgr-emb{display:block;width:100%;height:100%;border-radius:50%;overflow:hidden}.pgr-emb.sm{display:inline-block;width:20px;height:20px;border-radius:6px;vertical-align:-5px}',
    '#pgr-fab .pgr-dot{position:absolute;top:-4px;right:-4px;min-width:18px;height:18px;border-radius:9px;background:#ff5f7a;color:#fff;font:700 11px/18px system-ui,sans-serif;text-align:center;padding:0 4px;box-sizing:border-box;box-shadow:0 0 0 2px #0c0d10}',
    '#pgr-hub{position:fixed;inset:0;z-index:99980;display:none;flex-direction:column;color:var(--text,#e8e8ea);font-family:Inter,-apple-system,system-ui,sans-serif;',
    ' background:radial-gradient(120% 50% at 50% -10%,rgba(139,92,255,.16),transparent 60%),radial-gradient(80% 40% at 100% 100%,rgba(255,95,216,.08),transparent 60%),var(--bg,#0c0d10);',
    ' padding:env(safe-area-inset-top,0) 0 env(safe-area-inset-bottom,0);opacity:0;transform:translateY(12px);transition:opacity .18s,transform .22s}',
    '#pgr-hub.open{display:flex}#pgr-hub.shown{opacity:1;transform:none}',
    '.pgr-head{display:flex;align-items:center;gap:8px;padding:12px 14px 6px 8px}',
    '.pgr-back{width:40px;height:40px;border-radius:12px;border:0;background:transparent;color:inherit;cursor:pointer;display:flex;align-items:center;justify-content:center}',
    '.pgr-back svg{width:22px;height:22px}',
    '.pgr-title{font-size:19px;font-weight:700;margin:0;white-space:nowrap}',
    '.pgr-rb{background:linear-gradient(90deg,#6ee7d0,#8b5cff,#ff5fd8,#ffb36e,#6ee7d0);background-size:200% 100%;-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent;color:transparent;animation:ppgTitleFlow 6s linear infinite}',
    '.pgr-bal{margin-left:auto;display:flex;align-items:center;gap:10px;font-weight:800;font-size:15px}',
    '.pgr-bal span{padding:6px 10px;border-radius:999px;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.08);white-space:nowrap}',
    '.pgr-tabs{display:flex;gap:8px;overflow-x:auto;padding:6px 14px 10px;scrollbar-width:none;flex:0 0 auto}',
    '.pgr-tabs::-webkit-scrollbar{display:none}',
    '.pgr-tab{flex:0 0 auto;padding:9px 14px;border-radius:999px;border:1px solid var(--line,#232429);background:var(--bg-elev,#16171b);color:var(--text-dim,#8b8c93);font:600 13px inherit;font-family:inherit;cursor:pointer;white-space:nowrap;position:relative}',
    '.pgr-tab.on{color:#0c0d10;border-color:transparent;background:linear-gradient(90deg,#6ee7d0,#b79bff)}',
    '.pgr-tab .pgr-dot{position:absolute;top:-4px;right:-2px;min-width:16px;height:16px;border-radius:8px;background:#ff5f7a;color:#fff;font:700 10px/16px system-ui,sans-serif;text-align:center;padding:0 3px;box-sizing:border-box}',
    '.pgr-body{flex:1;overflow-y:auto;padding:4px 14px 28px;-webkit-overflow-scrolling:touch}',
    '.pgr-card{background:var(--bg-elev,#16171b);border:1px solid var(--line,#232429);border-radius:16px;padding:14px;margin-bottom:12px}',
    '.pgr-card h3{margin:0 0 4px;font-size:15px;font-weight:700}.pgr-sub{font-size:12px;color:var(--text-dim,#8b8c93);line-height:1.45;margin:0 0 10px}',
    '.pgr-hero{background:linear-gradient(120deg,rgba(110,231,208,.1),rgba(139,92,255,.16) 60%,rgba(255,95,216,.12));border-color:rgba(139,92,255,.5)}',
    '.pgr-chips{display:flex;flex-wrap:wrap;gap:6px;margin-top:8px}',
    '.pgr-chip{padding:5px 9px;border-radius:999px;background:rgba(255,255,255,.07);font-size:12px;font-weight:600}',
    '.pgr-btn{display:inline-flex;align-items:center;justify-content:center;gap:6px;padding:10px 16px;border-radius:12px;border:0;font:700 14px inherit;font-family:inherit;cursor:pointer;color:#0c0d10;background:linear-gradient(90deg,#6ee7d0,#b79bff);-webkit-tap-highlight-color:transparent}',
    '.pgr-btn:active{transform:scale(.96)}.pgr-btn[disabled]{opacity:.45;cursor:default;transform:none}',
    '.pgr-btn.alt{background:rgba(255,255,255,.08);color:var(--text,#e8e8ea)}',
    '.pgr-btn.sm{padding:7px 12px;font-size:12px;border-radius:10px}',
    '.pgr-wheelwrap{display:flex;flex-direction:column;align-items:center;gap:10px}',
    '#pgr-wheel{width:min(260px,78vw);height:auto;aspect-ratio:1}',
    '.pgr-row{display:flex;flex-wrap:wrap;gap:8px}',
    '.pgr-pre{padding:8px 12px;border-radius:10px;border:1px solid var(--line,#232429);background:var(--bg,#0c0d10);color:var(--text,#e8e8ea);font:600 12.5px inherit;font-family:inherit;cursor:pointer}',
    '.pgr-pre:active{background:rgba(255,255,255,.1)}',
    '.pgr-sw{width:56px;height:40px;border-radius:10px;border:1px solid rgba(255,255,255,.14);cursor:pointer;position:relative;overflow:hidden;padding:0}',
    '.pgr-sw span{position:absolute;left:0;right:0;bottom:0;font:700 9px/14px system-ui,sans-serif;background:rgba(0,0,0,.55);color:#fff;text-align:center;white-space:nowrap;overflow:hidden}',
    '.pgr-games{display:grid;grid-template-columns:repeat(auto-fill,minmax(92px,1fr));gap:10px}',
    '.pgr-g{position:relative;border:0;background:none;color:inherit;font:inherit;padding:0;text-align:center;cursor:pointer;-webkit-tap-highlight-color:transparent}',
    '.pgr-g .a{aspect-ratio:1;border-radius:16px;overflow:hidden;border:1px solid rgba(255,255,255,.1)}.pgr-g .a img{width:100%;height:100%;object-fit:cover;display:block}',
    '.pgr-g b{display:block;font-size:11.5px;margin-top:5px;line-height:1.2}',
    '.pgr-free{position:absolute;top:5px;left:5px;padding:2px 5px;border-radius:6px;font:800 8.5px/1.2 system-ui,sans-serif;letter-spacing:.04em;color:#0c0d10;background:linear-gradient(90deg,#6ee7d0,#ff5fd8)}',
    '.pgr-stats{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}',
    '.pgr-stat{background:var(--bg,#0c0d10);border-radius:12px;padding:10px 6px;text-align:center}.pgr-stat b{display:block;font-size:17px}.pgr-stat small{font-size:10.5px;color:var(--text-dim,#8b8c93)}',
    '.pgr-order{display:flex;align-items:center;gap:12px;padding:12px;border-radius:14px;background:var(--bg,#0c0d10);border:1px solid var(--line,#232429);margin-bottom:10px}',
    '.pgr-order.ready{border-color:rgba(110,231,208,.7);box-shadow:0 0 18px rgba(110,231,208,.18)}',
    '.pgr-order .m{flex:1;min-width:0}.pgr-order b{font-size:13.5px;display:block}',
    '.pgr-bar{height:7px;border-radius:4px;background:rgba(255,255,255,.08);margin:7px 0 5px;overflow:hidden}.pgr-bar i{display:block;height:100%;background:linear-gradient(90deg,#6ee7d0,#8b5cff,#ff5fd8)}',
    '.pgr-meta{font-size:11px;color:var(--text-dim,#8b8c93)}',
    '.pgr-tier{font-size:10px;font-weight:800;letter-spacing:.05em;text-transform:uppercase;padding:2px 6px;border-radius:6px;margin-left:6px;vertical-align:1px;color:#0c0d10}',
    '.pgr-slots{display:flex;gap:10px;margin-bottom:6px;flex-wrap:wrap}',
    '.pgr-slot{width:64px;height:76px;border-radius:14px;border:2px dashed rgba(255,255,255,.2);display:flex;flex-direction:column;align-items:center;justify-content:center;font-size:26px;background:var(--bg,#0c0d10);cursor:pointer;position:relative}',
    '.pgr-slot small{font-size:9.5px;color:var(--text-dim,#8b8c93);margin-top:2px;text-align:center;line-height:1.1;padding:0 3px}',
    '.pgr-slot.full{border-style:solid;border-color:rgba(139,92,255,.7)}.pgr-slot.lock{opacity:.55;font-size:20px}',
    '.pgr-charm{display:flex;align-items:center;gap:12px;padding:12px;border-radius:14px;background:var(--bg,#0c0d10);border:1px solid var(--line,#232429);margin-bottom:10px}',
    '.pgr-charm .i{font-size:28px;width:40px;text-align:center}.pgr-charm .m{flex:1;min-width:0}.pgr-charm b{font-size:13.5px}',
    '.pgr-rar{font-size:9.5px;font-weight:800;letter-spacing:.05em;text-transform:uppercase;margin-left:6px}',
    '.pgr-strip{display:flex;gap:8px;overflow-x:auto;padding:2px 2px 10px;scrollbar-width:none}.pgr-strip::-webkit-scrollbar{display:none}',
    '.pgr-sb{flex:0 0 auto;display:flex;align-items:center;gap:6px;padding:9px 13px;border-radius:14px;border:1px solid transparent;color:var(--text,#e8e8ea);font:700 12.5px inherit;font-family:inherit;cursor:pointer;position:relative;',
    ' background:linear-gradient(var(--bg-elev,#16171b),var(--bg-elev,#16171b)) padding-box,linear-gradient(120deg,#6ee7d0,#8b5cff 60%,#ff5fd8) border-box;-webkit-tap-highlight-color:transparent}',
    '.pgr-sb .pgr-dot{position:absolute;top:-5px;right:-3px;min-width:17px;height:17px;border-radius:9px;background:#ff5f7a;color:#fff;font:700 10px/17px system-ui,sans-serif;text-align:center;padding:0 3px;box-sizing:border-box}',
    '.pgr-note{font-size:11.5px;color:var(--text-dim,#8b8c93);line-height:1.5;margin:8px 2px}',
    '#pgr-settings-section .pgr-set-row{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:8px 0}',
    '@media (prefers-reduced-motion:reduce){.pgr-rb,.title-mode[data-ed="playground"]{animation:none}}'
  ].join('\n');
  document.head.appendChild(css);

  var hub = document.createElement('div');
  hub.id = 'pgr-hub'; hub.setAttribute('role', 'dialog'); hub.setAttribute('aria-label', 'Press Play Playground');
  hub.innerHTML = '<div class="pgr-head"><button type="button" class="pgr-back" aria-label="Back"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg></button>' +
    '<h1 class="pgr-title">Press Play <span class="pgr-rb">Playground</span></h1><div class="pgr-bal"><span id="pgr-bal-stars">⭐ 0</span></div></div>' +
    '<div class="pgr-tabs" id="pgr-tabs"></div><div class="pgr-body" id="pgr-body"></div>';
  document.body.appendChild(hub);
  var tabsEl = hub.querySelector('#pgr-tabs'), bodyEl = hub.querySelector('#pgr-body'), curTab = 'stage', activeDef = null;

  function hubOpen(){ return hub.classList.contains('open'); }
  function refreshBalance(){
    var e = document.getElementById('pgr-bal-stars'); if (e) e.textContent = '⭐ ' + fmt(S.stars);
    updateFab(); updateSpinBtn();
  }

  /* tabs: Stage, Orders and Charms live here; other scripts add more */
  var CORE_TABS = [
    { id:'stage',  label:'🎪 Stage',  order:10, render:renderStage, live:liveStage },
    { id:'orders', label:'🧾 Orders', order:20, render:renderOrders, live:liveOrders, badge:function(){ return PP.claimable(); } },
    { id:'charms', label:'🧿 Charms', order:30, render:renderCharms }
  ];
  CORE_TABS.forEach(function(t){ tabs.push(t); });
  tabs.sort(function(a, b){ return (a.order || 50) - (b.order || 50); });

  function renderTabs(){
    var html = tabs.map(function(t){
      var b = t.badge ? t.badge() : 0;
      return '<button type="button" class="pgr-tab' + (t.id === curTab ? ' on' : '') + '" data-pgr-tab="' + t.id + '">' + t.label + (b ? '<span class="pgr-dot">' + b + '</span>' : '') + '</button>';
    }).join('');
    if (tabsEl.__h !== html){ tabsEl.innerHTML = html; tabsEl.__h = html; }
  }
  function renderActive(){
    if (!hubOpen()) return;
    var t = null; tabs.forEach(function(x){ if (x.id === curTab) t = x; });
    if (!t){ curTab = 'stage'; t = tabs[0]; }
    if (activeDef && activeDef !== t && activeDef.onHide) { try { activeDef.onHide(); } catch(e){} }
    var y = bodyEl.scrollTop;
    activeDef = t; renderTabs();
    bodyEl.innerHTML = '';
    try { t.render(bodyEl); } catch(e){ bodyEl.innerHTML = '<p class="pgr-note">This tab could not load.</p>'; }
    bodyEl.scrollTop = y;
  }
  function setTab(id){
    if (curTab === id && activeDef) return;
    if (activeDef && activeDef.onHide){ try { activeDef.onHide(); } catch(e){} }
    curTab = id; activeDef = null; bodyEl.scrollTop = 0; renderActive();
  }
  PP.open = function(tab){
    if (!on()){ toast('Turn on Press Play Playground in Settings → App mode.'); return; }
    fillOrders(); refreshBalance();
    if (!hubOpen()){
      if (tab) curTab = tab;
      hub.classList.add('open'); activeDef = null; renderActive();
      requestAnimationFrame(function(){ hub.classList.add('shown'); });
      try { history.pushState({ ppPg: 1 }, ''); } catch(e){}
    } else if (tab){ setTab(tab); }
    updateFab();
  };
  function hideHub(){
    if (activeDef && activeDef.onHide){ try { activeDef.onHide(); } catch(e){} }
    hub.classList.remove('open', 'shown'); activeDef = null; updateFab();
  }
  PP.close = function(){ if (history.state && history.state.ppPg) history.back(); else hideHub(); };
  window.addEventListener('popstate', function(){ if (hubOpen() && !(history.state && history.state.ppPg)) hideHub(); });
  document.addEventListener('keydown', function(e){ if (e.key === 'Escape' && hubOpen() && !document.body.classList.contains('pp-gaming')){ e.stopImmediatePropagation(); PP.close(); } }, true);   // a game on top owns Escape
  hub.querySelector('.pgr-back').addEventListener('click', PP.close);
  tabsEl.addEventListener('click', function(e){ var b = e.target.closest('[data-pgr-tab]'); if (b){ blip(660, 0.05, 'triangle', 0.06); setTab(b.getAttribute('data-pgr-tab')); } });
  document.addEventListener('click', function(e){ var b = e.target.closest && e.target.closest('[data-pgr-open]'); if (b){ e.preventDefault(); PP.open(b.getAttribute('data-pgr-open')); } });

  /* ------------------------------------------------------------------ Stage */
  var EQ_LINKS = [['crescendo', 'Crescendo'], ['titanbass', 'Titan Bass'], ['deepresonance', 'Deep Resonance'], ['pgprodigy', 'Prodigy'], ['pgmaestro', 'Maestro'], ['pgphantom', 'Phantom'], ['pgparagon', 'Paragon'], ['pgpanther', 'Panther'], ['pgpaladin', 'Paladin']];
  var BACKDROPS = [['pg-arcade', 'Neon Arcade', '#0b0a1f', '#ff5fd8'], ['pg-prodigy', 'Prodigy Pulse', '#120a2e', '#6ee7d0'], ['pg-titan', 'Titan Quake', '#1a0800', '#ff6a3d'], ['pg-deep', 'Deep Resonance', '#02101f', '#39d5ff'], ['pg-paladin', 'Paladin Violet', '#1a1038', '#8b5cff'], ['pg-cartridge', 'Cartridge Green', '#06100a', '#3ddc84']];
  function stagePerks(){
    var out = S.charms.eq.map(function(id){ var c = charmById(id); return c ? '<span class="pgr-chip">' + c.icon + ' ' + esc(c.n) + '</span>' : ''; }).join('');
    return out || '<span class="pgr-chip">No charms equipped. Visit the Charms tab.</span>';
  }
  function renderStage(el){
    var games = (window.__ppGames && window.__ppGames.list) || [];
    el.innerHTML =
      '<div class="pgr-card pgr-hero"><h3>Welcome to the Playground</h3>' +
      '<p class="pgr-sub" style="margin:0">Everything in the app is unlocked, the clicker stays out, and every game exclusive is free. Earn <b>⭐ Stars</b> from orders, the wheel and playing games, then spend them on charms. Your EXP grows 25% faster here.</p>' +
      '<div class="pgr-chips" id="pgr-chips"></div></div>' +
      '<div class="pgr-card"><h3>Daily Spin</h3><p class="pgr-sub">One free spin a day. Grooves, Stars, free spins and Groove Storms.</p>' +
      '<div class="pgr-wheelwrap"><canvas id="pgr-wheel" width="520" height="520"></canvas><div class="pgr-meta" id="pgr-spin-res">&nbsp;</div>' +
      '<button type="button" class="pgr-btn" id="pgr-spin"></button></div></div>' +
      '<div class="pgr-card"><h3>Sound &amp; look</h3><p class="pgr-sub">One tap sets your real equalizer. Playground adds six presets named after the game exclusives.</p>' +
      '<div class="pgr-row" id="pgr-eq">' + EQ_LINKS.map(function(p){ return '<button type="button" class="pgr-pre" data-eq="' + p[0] + '">' + esc(p[1]) + '</button>'; }).join('') + '</div>' +
      '<p class="pgr-sub" style="margin:12px 0 8px">Backdrops (they apply to the tab you have open in Settings → Appearance, or the app by default):</p>' +
      '<div class="pgr-row" id="pgr-bg">' + BACKDROPS.map(function(b){ return '<button type="button" class="pgr-sw" data-bg="' + b[0] + '" style="background:linear-gradient(135deg,' + b[2] + ',' + b[3] + ')"><span>' + esc(b[1]) + '</span></button>'; }).join('') + '</div></div>' +
      '<div class="pgr-card"><h3>Games <span class="pgr-tier" style="background:linear-gradient(90deg,#6ee7d0,#ff5fd8)">Free play</span></h3><p class="pgr-sub">Every Press Play exclusive that a game checks for is yours while Playground is on. Playing earns ⭐ Stars (1 a minute).</p>' +
      '<div class="pgr-games">' + games.map(function(g){ return '<button type="button" class="pgr-g" data-game="' + esc(g.id) + '"><span class="pgr-free">FREE PLAY</span><div class="a" style="background:' + esc(g.bg) + '">' + (window.__ppGames && window.__ppGames.art ? window.__ppGames.art(g) : '') + '</div><b>' + esc(g.name) + '</b></button>'; }).join('') + '</div></div>' +
      '<div class="pgr-card"><h3>Your Playground</h3><div class="pgr-stats" id="pgr-stats"></div></div>' +
      '<p class="pgr-note">Perks you get in this mode: EXP +25%, every level unlock and Press Play shop perk, six Playground EQ presets and six Playground backdrops.</p>';
    var cv = el.querySelector('#pgr-wheel'); if (cv) drawWheel(cv, wheelAngle);
    liveStage();
  }
  function updateSpinBtn(){
    var b = document.getElementById('pgr-spin'); if (!b) return;
    var free = S.lastSpin !== dayKey();
    b.disabled = spinning || !spinReady();
    b.textContent = spinning ? 'Spinning…' : free ? '🎡 Spin (free today)' : S.spins > 0 ? '🎟️ Spin (' + S.spins + ' left)' : 'Back tomorrow';
  }
  function liveStage(){
    var c = document.getElementById('pgr-chips');
    if (c){
      var storm = stormActive() ? '<span class="pgr-chip" style="background:rgba(183,155,255,.25)">🌩️ Storm ×' + S.storm.mult + ' · ' + timeLeft(S.storm.until - Date.now()) + '</span>' : '';
      var html = '<span class="pgr-chip">🎵 ' + fmt(PP.ps()) + ' grooves/s</span>' + storm + stagePerks();
      if (c.__h !== html){ c.innerHTML = html; c.__h = html; }
    }
    var st = document.getElementById('pgr-stats');
    if (st){
      var html2 = [['⭐', fmt(S.total), 'Stars earned'], ['🧾', S.orders.done, 'Orders'], ['🎡', PP.get('spins'), 'Spins'], ['🖱️', fmt(PP.get('clicks')), 'Clicks'], ['🎮', Math.floor(PP.get('gameMs') / 60000), 'Game min'], ['🎧', Math.floor(PP.get('listenMs') / 60000), 'Listen min']]
        .map(function(x){ return '<div class="pgr-stat"><b>' + x[0] + ' ' + x[1] + '</b><small>' + x[2] + '</small></div>'; }).join('');
      if (st.__h !== html2){ st.innerHTML = html2; st.__h = html2; }
    }
    updateSpinBtn();
  }
  bodyEl.addEventListener('click', function(e){
    var b;
    if ((b = e.target.closest('#pgr-spin'))){ doSpin(); return; }
    if ((b = e.target.closest('[data-eq]'))){
      var key = b.getAttribute('data-eq'), btn = document.querySelector('.ppxp-eq-pro-btn[data-eq-preset="' + key + '"]');
      if (btn){ btn.click(); PP.stat('eq', 1); blip(440, 0.1, 'sawtooth', 0.06); toast('🎚️ EQ: ' + b.textContent); checkAch(); }
      else toast('The equalizer is still loading. Try again in a moment.');
      return;
    }
    if ((b = e.target.closest('[data-bg]'))){
      var sw = document.querySelector('.ppxp-bg-swatch[data-preset-id="' + b.getAttribute('data-bg') + '"]');
      if (sw){ sw.click(); blip(520, 0.1, 'triangle', 0.06); toast('🖼️ Backdrop: ' + b.textContent); }
      else toast('Backgrounds are still loading. Try again in a moment.');
      return;
    }
    if ((b = e.target.closest('[data-game]'))){
      var id = b.getAttribute('data-game');
      if (window.__ppGames && window.__ppGames.open){ blip(600, 0.08, 'triangle', 0.06); window.__ppGames.open(id); }
      return;
    }
    if ((b = e.target.closest('[data-claim]'))){ claimOrder(+b.getAttribute('data-claim')); return; }
    if ((b = e.target.closest('[data-charm]'))){ charmAction(b.getAttribute('data-charm'), b.getAttribute('data-do')); return; }
    if ((b = e.target.closest('[data-slot]'))){ slotAction(+b.getAttribute('data-slot')); return; }
  });

  /* ------------------------------------------------------------------ Orders tab */
  function renderOrders(el){
    fillOrders();
    var rows = S.orders.list.map(function(o){
      var k = orderKind(o.kind), tgt = orderTarget(o), prog = orderProgress(o), ready = orderReady(o), pct = Math.round(prog / tgt * 100);
      var shownProg = k.unit === 'ms' ? Math.floor(prog / 60000) : prog, shownTgt = k.unit === 'ms' ? o.target : o.target;
      var tc = ['#9aa3b2', '#6ea8ff', '#ffb36e'][o.tier], tn = ['Easy', 'Medium', 'Hard'][o.tier];
      return '<div class="pgr-order' + (ready ? ' ready' : '') + '"><div class="m"><b>' + esc(k.t(o.target)) + '<span class="pgr-tier" style="background:' + tc + '">' + tn + '</span></b>' +
        '<div class="pgr-bar"><i style="width:' + pct + '%"></i></div><div class="pgr-meta">' + shownProg + ' / ' + shownTgt + ' · ⭐ ' + ORDER_STARS[o.tier] + ' + grooves · <span data-left="' + o.id + '">' + timeLeft(o.until - Date.now()) + '</span> left</div></div>' +
        (ready ? '<button type="button" class="pgr-btn sm" data-claim="' + o.id + '">Claim</button>' : '') + '</div>';
    }).join('');
    var bonus = Math.round(Math.min(0.5, S.orders.streak * 0.1) * 100);
    el.innerHTML = '<div class="pgr-card pgr-hero"><h3>Orders</h3><p class="pgr-sub" style="margin:0">Three orders are always on the pass. Finish them for ⭐ Stars and grooves. A streak of finished orders adds up to +50%; letting one run out resets it.</p>' +
      '<div class="pgr-chips"><span class="pgr-chip">🔥 Streak ' + S.orders.streak + (bonus ? ' (+' + bonus + '%)' : '') + '</span><span class="pgr-chip">🧾 ' + S.orders.done + ' done</span></div></div>' + rows;
    el.__sig = ordersSig();
  }
  function ordersSig(){ return S.orders.list.map(function(o){ return o.id + ':' + o.done + ':' + orderProgress(o); }).join('|'); }
  function liveOrders(){
    var changed = fillOrders();
    if (changed || bodyEl.__sig !== ordersSig()){ renderActive(); return; }
    S.orders.list.forEach(function(o){ var s = bodyEl.querySelector('[data-left="' + o.id + '"]'); if (s) s.textContent = timeLeft(o.until - Date.now()); });
  }

  /* ------------------------------------------------------------------ Charms tab */
  function renderCharms(el){
    var slots = '';
    for (var i = 0; i < 5; i++){
      var id = S.charms.eq[i], c = id ? charmById(id) : null;
      if (i >= S.slots) slots += '<div class="pgr-slot lock" data-slot="' + i + '">🔒<small>' + (i === 3 ? '150 ⭐' : '600 ⭐') + '</small></div>';
      else slots += c ? '<div class="pgr-slot full" data-slot="' + i + '">' + c.icon + '<small>' + esc(c.n) + '</small></div>' : '<div class="pgr-slot" data-slot="' + i + '">＋<small>Empty</small></div>';
    }
    var list = CHARMS.map(function(c){
      var own = !!S.charms.own[c.id], eq = S.charms.eq.indexOf(c.id) >= 0;
      var btn = !own ? '<button type="button" class="pgr-btn sm" data-charm="' + c.id + '" data-do="buy"' + (S.stars < c.p ? ' style="opacity:.55"' : '') + '>⭐ ' + c.p + '</button>'
        : eq ? '<button type="button" class="pgr-btn sm alt" data-charm="' + c.id + '" data-do="unequip">Unequip</button>'
        : '<button type="button" class="pgr-btn sm" data-charm="' + c.id + '" data-do="equip">Equip</button>';
      return '<div class="pgr-charm"><div class="i">' + c.icon + '</div><div class="m"><b>' + esc(c.n) + '</b><span class="pgr-rar" style="color:' + RAR[c.rar] + '">' + c.rar + '</span><div class="pgr-meta">' + esc(c.d) + '</div></div>' + btn + '</div>';
    }).join('');
    el.innerHTML = '<div class="pgr-card pgr-hero"><h3>Charms</h3><p class="pgr-sub" style="margin:0">Buy charms with ⭐ Stars and equip up to ' + S.slots + ' (more slots can be unlocked). Their effects stack and reach the Disc Clicker, the wheel, orders, Points and your EXP.</p></div>' +
      '<div class="pgr-slots">' + slots + '</div>' + list;
  }
  function charmAction(id, act){
    var c = charmById(id); if (!c) return;
    if (act === 'buy'){
      if (S.charms.own[id]) return;
      if (!PP.spendStars(c.p)){ toast('You need ' + (c.p - S.stars) + ' more ⭐ Stars'); return; }
      S.charms.own[id] = 1; save(true); chime(); toast(c.icon + ' ' + c.n + ' is yours. Equip it!');
    } else if (act === 'equip'){
      if (S.charms.eq.length >= S.slots){ toast('All slots are full. Unequip a charm first.'); return; }
      if (!S.charms.own[id] || S.charms.eq.indexOf(id) >= 0) return;
      S.charms.eq.push(id); PP.stat('equips', 1); save(true); blip(700, 0.1, 'triangle', 0.08);
    } else if (act === 'unequip'){
      S.charms.eq = S.charms.eq.filter(function(x){ return x !== id; }); save(true); blip(400, 0.08, 'triangle', 0.06);
    }
    renderActive(); checkAch();
  }
  function slotAction(i){
    if (i < S.slots) return;
    var cost = i === 3 ? 150 : 600;
    if (i !== S.slots){ toast('Unlock the slots in order.'); return; }
    if (!PP.spendStars(cost)){ toast('You need ' + (cost - S.stars) + ' more ⭐ Stars'); return; }
    S.slots++; save(true); chime(); toast('🔓 Charm slot ' + (i + 1) + ' unlocked'); renderActive();
  }

  /* ------------------------------------------------------------------ the floating button, Home strip, games grid, settings */
  var fab = document.createElement('button');
  fab.id = 'pgr-fab'; fab.type = 'button'; fab.setAttribute('aria-label', 'Open the Playground');
  function emblem(){ try { return window.__ppEmblem ? window.__ppEmblem() : ''; } catch(e){ return ''; } }
  fab.innerHTML = '<span class="pgr-emb">' + emblem() + '</span>';
  fab.addEventListener('click', function(){ blip(600, 0.07, 'triangle', 0.07); PP.open(); });
  document.body.appendChild(fab);
  function updateFab(){
    var show = on() && S.opts.fab && !hubOpen();
    fab.style.display = show ? '' : 'none';
    var n = PP.claimable() + (spinReady() ? 1 : 0), d = fab.querySelector('.pgr-dot');
    if (n && show){ if (!d){ d = document.createElement('span'); d.className = 'pgr-dot'; fab.appendChild(d); } d.textContent = n; } else if (d) d.remove();
  }
  PP.homeStrip = function(){
    var oc = PP.claimable();
    return '<div class="pgr-strip">' +
      '<button type="button" class="pgr-sb" data-pgr-open="stage"><span class="pgr-emb sm">' + emblem() + '</span> Playground' + (spinReady() ? '<span class="pgr-dot">1</span>' : '') + '</button>' +
      '<button type="button" class="pgr-sb" data-pgr-open="orders">🧾 Orders' + (oc ? '<span class="pgr-dot">' + oc + '</span>' : '') + '</button>' +
      '<button type="button" class="pgr-sb" data-pgr-open="charms">🧿 Charms</button>' +
      '<span class="pgr-sb" style="cursor:default">⭐ ' + fmt(S.stars) + '</span></div>';
  };

  function decorateGrid(){
    var g = window.__ppGames && window.__ppGames.grid; if (!g) return;
    g.querySelectorAll('.ppg-card').forEach(function(c){
      var r = c.querySelector('.pgr-free-ribbon');
      if (on()){
        if (!r){ r = document.createElement('span'); r.className = 'pgr-free pgr-free-ribbon'; r.textContent = 'FREE PLAY'; c.style.position = 'relative'; c.appendChild(r); }
      } else if (r) r.remove();
    });
  }
  function buildSettings(){
    if (document.getElementById('pgr-settings-section')) return;
    var host = document.getElementById('pp-modes-section'); if (!host || !host.parentNode) return;
    var sec = document.createElement('div');
    sec.className = 'settings-section'; sec.id = 'pgr-settings-section';
    sec.innerHTML = '<div class="settings-row"><div class="settings-row-text"><div class="settings-row-title">Playground</div><div class="settings-row-sub">Orders, charms, the daily wheel and more.</div></div><button type="button" class="settings-toggle-btn" id="pgr-open-btn">Open</button></div>' +
      '<div class="settings-row"><div class="settings-row-text"><div class="settings-row-title">Playground button</div><div class="settings-row-sub">The floating 🎪 button on the right edge.</div></div><label class="settings-switch"><input type="checkbox" id="pgr-opt-fab"><span class="settings-slider"></span></label></div>' +
      '<div class="settings-row"><div class="settings-row-text"><div class="settings-row-title">Playground sounds</div><div class="settings-row-sub">Small chimes and clicks.</div></div><label class="settings-switch"><input type="checkbox" id="pgr-opt-sfx"><span class="settings-slider"></span></label></div>';
    host.parentNode.insertBefore(sec, host.nextSibling);
    sec.querySelector('#pgr-open-btn').addEventListener('click', function(){ PP.open(); });
    var f = sec.querySelector('#pgr-opt-fab'), s = sec.querySelector('#pgr-opt-sfx');
    f.checked = !!S.opts.fab; s.checked = !!S.opts.sfx;
    f.addEventListener('change', function(){ S.opts.fab = f.checked; save(true); updateFab(); });
    s.addEventListener('change', function(){ S.opts.sfx = s.checked; save(true); });
  }

  /* ------------------------------------------------------------------ Points achievements */
  var ACH = [
    ['pg_on',     'Welcome to the Playground', 'Turn on Press Play Playground',      50,  function(){ return on() ? 1 : 0; }, 1],
    ['pg_spin1',  'First Spin',                'Spin the daily wheel',               15,  function(){ return PP.get('spins'); }, 1],
    ['pg_spin25', 'Spin Doctor',               'Spin the wheel 25 times',            60,  function(){ return PP.get('spins'); }, 25],
    ['pg_ord1',   'Order Up!',                 'Finish an order',                    15,  function(){ return S.orders.done; }, 1],
    ['pg_ord25',  'Dinner Rush',               'Finish 25 orders',                   80,  function(){ return S.orders.done; }, 25],
    ['pg_charm1', 'Charmed',                   'Buy a charm',                        20,  function(){ return Object.keys(S.charms.own).length; }, 1],
    ['pg_full',   'Full House',                'Have 3 charms equipped',             40,  function(){ return S.charms.eq.length; }, 3],
    ['pg_star250','Star Collector',            'Earn 250 Stars',                     50,  function(){ return S.total; }, 250],
    ['pg_star2k', 'Star Hoarder',              'Earn 2,000 Stars',                   150, function(){ return S.total; }, 2000],
    ['pg_game30', 'Free Player',               'Play games for 30 minutes in Playground', 40, function(){ return PP.get('gameMs') / 60000; }, 30],
    ['pg_click1k','Disc Jockey',               'Click the disc 1,000 times in Playground', 40, function(){ return PP.get('clicks'); }, 1000],
    ['pg_eq10',   'Well Tuned',                'Set the equalizer from the Stage 10 times', 25, function(){ return PP.get('eq'); }, 10]
  ];
  PP.registerAch = function(list){
    var T = window.__ppPoints; if (!T || !T.META) return;
    list.forEach(function(a){
      if (T.META.some(function(m){ return m.id === a[0]; })) return;
      T.META.push({ id:a[0], n:a[1], d:a[2], p:a[3], f:a[4], v:a[5] });
    });
  };
  var achT = null;
  function checkAch(){ clearTimeout(achT); achT = setTimeout(function(){ try { if (window.__ppPoints && window.__ppPoints.check) window.__ppPoints.check(); } catch(e){} }, 250); }
  PP.checkAch = checkAch;
  PP.registerAch(ACH);

  /* ------------------------------------------------------------------ the one-second heartbeat */
  var lastTick = Date.now(), beat = 0;
  setInterval(function(){
    var now = Date.now(), dt = Math.min(5000, now - lastTick); lastTick = now; beat++;
    if (!on()){ updateFab(); return; }
    var A = document.getElementById('audio'), V = document.getElementById('video-el');
    var playing = (V && V.currentSrc && !V.paused && !V.ended) || (A && A.currentSrc && !A.paused && !A.ended);
    if (playing) S.stats.listenMs = (S.stats.listenMs || 0) + dt;
    if (document.body.classList.contains('pp-gaming')){
      S.stats.gameMs = (S.stats.gameMs || 0) + dt; S.gameStarMs += dt;
      while (S.gameStarMs >= 60000){ S.gameStarMs -= 60000; PP.addStars(1, 'for playing', true); }
    }
    if (beat % 5 === 0){ decorateGrid(); buildSettings(); checkAch(); save(); }
    if (hubOpen()){
      refreshBalance();
      if (activeDef && activeDef.live) { try { activeDef.live(); } catch(e){} }
      renderTabs();
    } else updateFab();
  }, 1000);

  /* react to the mode being switched */
  var lastOn = on();
  new MutationObserver(function(){
    var now = on();
    if (now !== lastOn){
      lastOn = now;
      if (now){ fillOrders(); chime(); setTimeout(function(){ toast('🎪 Playground is on. Tap the 🎪 button to open it.'); }, 900); }
      else if (hubOpen()) hideHub();
      decorateGrid(); updateFab();
    }
  }).observe(document.body, { attributes: true, attributeFilter: ['class'] });
  window.addEventListener('ppgate', function(e){ if (e.detail === 'playground') chime(); });

  fillOrders(); updateFab(); decorateGrid();
  setTimeout(buildSettings, 800); setTimeout(buildSettings, 3000);
})();
