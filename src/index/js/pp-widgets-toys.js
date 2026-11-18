  // ===================== toys: beat pad, tap tempo, guess the song, cover globe, Bloopy pet, record player =====================
  var sfx = null, sfxOut = null;
  function sfxCtx(){
    if (!sfx){ var AC = window.AudioContext || window.webkitAudioContext; if (!AC) return null; sfx = new AC(); sfxOut = sfx.createGain(); sfxOut.gain.value = 0.7; sfxOut.connect(sfx.destination); }
    if (sfx.state === 'suspended') sfx.resume();
    return sfx;
  }
  function tagOf(t){ var V = window.PPVocals; try { var tg = V && V.loadTags ? V.loadTags() : null; return tg && t ? tg[String(t.dbId)] || null : null; } catch(e){ return null; } }
  function songBpm(st){ var c = st && st.has ? tagOf(st.t) : null; return c && c.bpm ? +c.bpm : 0; }

  // ---------- Beat pad ----------
  // Nine drum pads made from synthesised sounds (no samples to download), lit up as you hit them. Loop records two bars
  // at the song's tempo (from the smart tags; 100 BPM otherwise) and plays them round until you stop it.
  var PADS = [['kick','Kick','#ff5f6d'],['snare','Snare','#ffc371'],['hat','Hi-hat','#42e695'],['clap','Clap','#3bb2b8'],['tom','Tom','#a18cd1'],['open','Open hat','#5ee7df'],['cow','Cowbell','#f6d365'],['rim','Rim','#fbc2eb'],['zap','Zap','#7f7fd5']];
  var noiseBuf = null;
  function noise(c){ if (noiseBuf) return noiseBuf; noiseBuf = c.createBuffer(1, c.sampleRate, c.sampleRate); var d = noiseBuf.getChannelData(0); for (var i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; return noiseBuf; }
  function drum(kind, when){
    var c = sfxCtx(); if (!c) return; var t = when || c.currentTime, out = sfxOut;
    var env = function(g, a, peak, dec){ g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + a); g.gain.exponentialRampToValueAtTime(0.0001, t + a + dec); };
    var osc = function(type, f0, f1, dur, peak){ var o = c.createOscillator(), g = c.createGain(); o.type = type; o.frequency.setValueAtTime(f0, t); if (f1) o.frequency.exponentialRampToValueAtTime(f1, t + dur); env(g, 0.003, peak, dur); o.connect(g); g.connect(out); o.start(t); o.stop(t + dur + 0.05); return o; };
    var nz = function(type, freq, dur, peak, q){ var s = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain(); s.buffer = noise(c); f.type = type; f.frequency.value = freq; if (q) f.Q.value = q; env(g, 0.002, peak, dur); s.connect(f); f.connect(g); g.connect(out); s.start(t); s.stop(t + dur + 0.05); };
    if (kind === 'kick'){ osc('sine', 160, 42, 0.42, 1); }
    else if (kind === 'snare'){ nz('highpass', 1200, 0.18, 0.55); osc('triangle', 230, 160, 0.12, 0.35); }
    else if (kind === 'hat'){ nz('highpass', 7000, 0.05, 0.35); }
    else if (kind === 'open'){ nz('highpass', 6500, 0.32, 0.3); }
    else if (kind === 'clap'){ [0, 0.012, 0.024].forEach(function(d){ var s = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain(), tt = t + d; s.buffer = noise(c); f.type = 'bandpass'; f.frequency.value = 1500; f.Q.value = 0.8; g.gain.setValueAtTime(0.0001, tt); g.gain.exponentialRampToValueAtTime(0.6, tt + 0.002); g.gain.exponentialRampToValueAtTime(0.0001, tt + (d === 0.024 ? 0.16 : 0.03)); s.connect(f); f.connect(g); g.connect(out); s.start(tt); s.stop(tt + 0.2); }); }
    else if (kind === 'tom'){ osc('sine', 220, 95, 0.32, 0.8); }
    else if (kind === 'cow'){ [540, 800].forEach(function(fq){ var o = c.createOscillator(), f = c.createBiquadFilter(), g = c.createGain(); o.type = 'square'; o.frequency.value = fq; f.type = 'bandpass'; f.frequency.value = 900; g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.18, t + 0.002); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.28); o.connect(f); f.connect(g); g.connect(out); o.start(t); o.stop(t + 0.3); }); }
    else if (kind === 'rim'){ osc('square', 1800, 900, 0.03, 0.25); nz('bandpass', 3000, 0.02, 0.3, 4); }
    else if (kind === 'zap'){ osc('sawtooth', 1400, 90, 0.22, 0.22); }
  }
  T.beatpad = { name:'Beat pad', icon:'grid', kind:'box', zones:FZ, w:'full', desc:'Nine drum pads to play along with. Record a loop at the song’s tempo',
    fields:[['n','Pads','seg',[['4','4'],['6','6'],['','9']]],['names','Show names','toggle',true],['loop','Loop button','toggle',true],['buzz','Vibrate','toggle',true]],
    render:function(o, c, ctx, it){
      var n = +o.n || 9, id = it ? it.id : 'x';
      return '<div class="pw-fd pw-bp pw-bp-' + n + '" data-pw-live="beatpad" data-id="' + esc(id) + '" data-buzz="' + (o.buzz === false ? 0 : 1) + '">' +
        '<div class="pw-bp-g">' + PADS.slice(0, n).map(function(p){ return '<button type="button" class="pw-bp-p" data-pad="' + p[0] + '" style="--pc:' + p[2] + '">' + (o.names === false ? '' : '<span>' + p[1] + '</span>') + '</button>'; }).join('') + '</div>' +
        (o.loop === false ? '' : '<div class="pw-bp-b"><button type="button" class="pw-bp-rec" data-bp="rec"><i></i><span>Record a loop</span></button><span class="pw-bp-bar"><i></i></span><small class="pw-bp-bpm"></small></div>') + '</div>';
    },
    live:function(el, st){
      if (!el._bp) bpInit(el);
      var L0 = el._bp.loop, bpm = songBpm(st) || 100, b = el.querySelector('.pw-bp-bpm');
      if (b && !L0) setText(b, bpm + ' BPM');
      el.classList.toggle('pw-bp-recording', !!(L0 && L0.rec)); el.classList.toggle('pw-bp-looping', !!(L0 && !L0.rec));
      if (L0 && L0.label) setText(el.querySelector('.pw-bp-rec span'), L0.label);
      el.style.setProperty('--beat', (60 / bpm).toFixed(3) + 's'); el.classList.toggle('pw-bp-pulse', !!st.playing);
    } };
  function bpInit(el){
    var B = el._bp = fdMem('bp:' + el.dataset.id, { loop: null });
    el.querySelectorAll('.pw-bp-p').forEach(function(p){
      p.addEventListener('pointerdown', function(e){
        if (editing) return; e.preventDefault();
        drum(p.dataset.pad); bpFlash(p);
        if (el.dataset.buzz === '1') try { navigator.vibrate && navigator.vibrate(8); } catch(x){}
        var L2 = B.loop; if (L2 && L2.rec){ var c = sfxCtx(); L2.hits.push([((c.currentTime - L2.t0) % L2.len + L2.len) % L2.len, p.dataset.pad]); }
      });
      p.addEventListener('touchstart', function(e){ e.ppNoTabSwipe = true; }, { passive: true });
    });
    var rec = el.querySelector('[data-pw-bp="rec"], [data-bp="rec"]');
    if (rec) rec.addEventListener('click', function(){ if (editing) return; if (B.loop) bpStop(el, B); else bpRec(el); });
  }
  function bpFlash(p){ p.classList.remove('hit'); void p.offsetWidth; p.classList.add('hit'); }
  function bpEl(id){ return document.querySelector('[data-pw-live="beatpad"][data-id="' + id + '"]'); }
  function bpRec(el0){
    var c = sfxCtx(); if (!c) return;
    var id = el0.dataset.id, el = el0, gone = 0;
    var B = el._bp, bpm = songBpm(liveState()) || 100, beat = 60 / bpm, len = beat * 8;
    // a count-in of four clicks, then two bars of recording, then it plays round
    var t0 = c.currentTime + beat * 4 + 0.05;
    for (var k = 0; k < 4; k++) drum('rim', c.currentTime + 0.05 + k * beat);
    B.loop = { rec: true, t0: t0, len: len, hits: [], beat: beat, next: 0, done: 0 };
    var say = function(s){ B.loop.label = s; if (el.isConnected) setText(el.querySelector('.pw-bp-rec span'), s); };
    el.classList.add('pw-bp-recording');
    say('Get ready…');
    var tick = function(){
      var L2 = B.loop; if (!L2) return;
      // Home can be drawn again while it plays: carry on with the widget's new copy; stop if it is gone a while
      if (!el.isConnected){ var n2 = bpEl(id); if (n2){ el = n2; gone = 0; T.beatpad.live(el, liveState()); } else if (++gone > 80){ bpStop(null, B); return; } }
      var now = c.currentTime, pos = now - L2.t0;
      if (pos >= 0 && L2.rec && L2.label !== 'Recording… tap the pads') say('Recording… tap the pads');
      if (L2.rec && pos >= L2.len){ L2.rec = false; L2.next = L2.t0 + L2.len; say(L2.hits.length ? 'Looping. Tap to stop' : 'Nothing recorded. Tap to stop'); el.classList.remove('pw-bp-recording'); el.classList.add('pw-bp-looping'); }
      // play the loop: schedule the next pass a little ahead
      if (!L2.rec && L2.hits.length && L2.next - now < 0.15){
        var base = L2.next; L2.hits.forEach(function(h){ drum(h[1], base + h[0]); setTimeout(function(){ var p = el.isConnected && el.querySelector('[data-pad="' + h[1] + '"]'); if (p) bpFlash(p); }, Math.max(0, (base + h[0] - c.currentTime) * 1000)); });
        L2.next += L2.len;
      }
      // the metronome while recording
      if (L2.rec && pos >= -0.01){ var bi = Math.floor(pos / L2.beat + 1e-6); if (bi > L2.done - 1 && bi < 8){ L2.done = bi + 1; drum('rim', L2.t0 + bi * L2.beat); } }
      var bar = el.isConnected && el.querySelector('.pw-bp-bar i'); if (bar) bar.style.width = (pos < 0 ? 0 : ((pos % L2.len) / L2.len * 100)).toFixed(1) + '%';
      L2.timer = setTimeout(tick, 25);
    };
    tick();
  }
  function bpStop(el, B){
    if (B.loop) clearTimeout(B.loop.timer); B.loop = null;
    if (!el || !el.isConnected) return;
    el.classList.remove('pw-bp-recording', 'pw-bp-looping');
    var s = el.querySelector('.pw-bp-rec span'); if (s) setText(s, 'Record a loop');
    var bar = el.querySelector('.pw-bp-bar i'); if (bar) bar.style.width = '0';
    T.beatpad.live(el, liveState());
  }

  // ---------- Tap tempo ----------
  // Tap along; it shows the beats per minute and can play the songs in your library with that tempo.
  T.taptempo = { name:'Tap tempo', icon:'bolt', kind:'box', zones:['home','page','player','video'], w:'full', desc:'Tap along to find the BPM, then play songs with the same tempo',
    fields:[['card','On a card','toggle',true]],
    render:function(o, c, ctx, it){
      return card(cardOn(o), '<div class="pw-tt" data-pw-live="taptempo" data-id="' + esc(it ? it.id : 'x') + '">' +
        '<button type="button" class="pw-tt-b" data-pw-tt="tap"><b>Tap</b><small>along to the beat</small></button>' +
        '<div class="pw-tt-r"><div class="pw-tt-v"><b>–</b><small>BPM</small></div><p class="pw-tt-s"></p><button type="button" class="pw-tt-go" data-pw-tt="find" disabled>' + svg('shuffle') + 'Songs at this tempo</button></div></div>');
    },
    live:function(el, st){
      var m = fdMem('tt:' + el.dataset.id, { taps: [], bpm: 0 }), sb = songBpm(st);
      setText(el.querySelector('.pw-tt-v b'), m.bpm ? String(m.bpm) : '–');
      el.querySelector('[data-pw-tt="find"]').disabled = !m.bpm;
      setText(el.querySelector('.pw-tt-s'), sb ? 'This song: ' + sb + ' BPM' + (m.bpm ? (Math.abs(m.bpm - sb) <= 3 || Math.abs(m.bpm * 2 - sb) <= 4 || Math.abs(m.bpm - sb * 2) <= 4 ? ' · spot on!' : '') : '') : m.taps.length === 1 ? 'Keep tapping…' : m.bpm ? m.taps.length + ' taps' : 'Tap at least four times.');
    } };
  function ttMatches(bpm){
    var V = window.PPVocals, tags = null; try { tags = V && V.loadTags ? V.loadTags() : null; } catch(e){}
    var A = api(); if (!A || !tags) return [];
    var t = A.tracks();
    return playable().filter(function(i){ var c = tags[String(t[i].dbId)], b = c && +c.bpm; if (!b) return false; return [b, b * 2, b / 2].some(function(x){ return Math.abs(x - bpm) / bpm <= 0.05; }); });
  }
  document.addEventListener('pointerdown', function(e){
    var b = e.target.closest && e.target.closest('[data-pw-tt="tap"]'); if (!b || editing) return;
    var el = b.closest('[data-pw-live="taptempo"]'), m = fdMem('tt:' + el.dataset.id, { taps: [], bpm: 0 }), now = performance.now();
    if (m.taps.length && now - m.taps[m.taps.length - 1] > 2500){ m.taps = []; m.bpm = 0; }
    m.taps.push(now); if (m.taps.length > 9) m.taps.shift();
    if (m.taps.length >= 4){ var d = (m.taps[m.taps.length - 1] - m.taps[0]) / (m.taps.length - 1); m.bpm = Math.round(60000 / d); }
    b.classList.remove('hit'); void b.offsetWidth; b.classList.add('hit');
    try { navigator.vibrate && navigator.vibrate(6); } catch(x){}
    T.taptempo.live(el, liveState());
  });
  document.addEventListener('click', function(e){
    var b = e.target.closest && e.target.closest('[data-pw-tt="find"]'); if (!b || editing) return;
    var el = b.closest('[data-pw-live="taptempo"]'), m = fdMem('tt:' + el.dataset.id, { taps: [], bpm: 0 });
    var q = ttMatches(m.bpm);
    if (!q.length){ toast(window.PPVocals ? 'No tagged songs near ' + m.bpm + ' BPM. Smart tags (Bloopy’s stems menu) give songs their tempo.' : 'Songs get their tempo from smart tags.'); return; }
    playQ(shuffled(q)); toast(plural(q.length, 'song') + ' around ' + m.bpm + ' BPM.');
  });

  // ---------- Guess the song ----------
  // A few seconds from the middle of one of your songs, and four titles to pick from. Your best run is kept.
  var GUESS_KEY = 'ppGuessV1', GUESS = { a: null, wasPlaying: false };
  T.guess = { name:'Guess the song', icon:'game', kind:'box', zones:['home','page'], w:'full', desc:'Hear a few seconds of one of your songs and pick the title',
    fields:[['secs','Clip','seg',[['3','3 s'],['','5 s'],['8','8 s']]],['card','On a card','toggle',true]],
    render:function(o, c, ctx, it){
      return card(cardOn(o), '<div class="pw-gs" data-pw-live="guess" data-id="' + esc(it ? it.id : 'x') + '" data-secs="' + (+o.secs || 5) + '">' +
        '<div class="pw-wh"><span class="pw-wh-t">Guess the song</span><span class="pw-gs-sc"></span></div><div class="pw-gs-m"></div></div>');
    },
    live:function(el){ var g = fdMem('gs:' + el.dataset.id, { phase: 'start', score: 0 }); if (el._ph !== g.phase + g.round){ el._ph = g.phase + g.round; gsDraw(el, g); } } };
  function gsBest(){ try { return (JSON.parse(localStorage.getItem(GUESS_KEY)) || {}).best || 0; } catch(e){ return 0; } }
  function gsDraw(el, g){
    var t = api() ? api().tracks() : [], m = el.querySelector('.pw-gs-m');
    setText(el.querySelector('.pw-gs-sc'), g.score ? 'Run: ' + g.score : gsBest() ? 'Best: ' + gsBest() : '');
    if (g.phase === 'start'){ m.innerHTML = '<p class="pw-otd-e">You hear a few seconds from the middle of a song. Pick its title before the time runs out.</p><button type="button" class="pw-gs-go" data-pw-gs="go">' + svg('play') + 'Start</button>'; return; }
    if (g.phase === 'load'){ m.innerHTML = '<div class="pw-gs-wave"><i></i><i></i><i></i><i></i><i></i></div><p class="pw-otd-e">Listen…</p>'; return; }
    var ok = g.phase === 'right', done = g.phase === 'right' || g.phase === 'wrong';
    m.innerHTML = '<div class="pw-gs-wave' + (done ? ' pw-gs-still' : '') + '"><i></i><i></i><i></i><i></i><i></i></div>' + (done ? '' : '<div class="pw-gs-time"><i style="animation-duration:' + (+el.dataset.secs + 6) + 's"></i></div>') +
      '<div class="pw-gs-o">' + g.opts.map(function(i){ var cls = !done ? '' : i === g.ans ? ' ok' : i === g.pick ? ' no' : ' dim'; return '<button type="button" class="pw-gs-a' + cls + '" data-pw-gs="pick" data-i="' + i + '"' + (done ? ' disabled' : '') + '><b>' + esc(t[i].title) + '</b><small>' + esc(t[i].artist && t[i].artist !== 'Unknown artist' ? t[i].artist : '') + '</small></button>'; }).join('') + '</div>' +
      (done ? '<p class="pw-gs-res">' + (ok ? 'Yes! ' + (g.score > 1 ? g.score + ' in a row.' : '') : g.pick == null ? 'Time’s up.' : 'Not that one.') + '</p><div class="pw-sw-b"><button type="button" class="on" data-pw-gs="go">Next</button><button type="button" data-pw-gs="play" data-i="' + g.ans + '">Play it</button><button type="button" data-pw-gs="quit">Stop</button></div>' : '');
  }
  function gsClip(stop){ if (GUESS.a){ try { GUESS.a.pause(); } catch(e){} if (stop){ GUESS.a.removeAttribute('src'); try { GUESS.a.load(); } catch(e){} GUESS.a = null; } } }
  function gsRound(el){
    var g = fdMem('gs:' + el.dataset.id, { phase: 'start', score: 0 }), A = api(); if (!A) return;
    var t = A.tracks(), pool = playable().filter(function(i){ return t[i].kind !== 'video' && t[i].url; });
    if (pool.length < 4){ toast('Guess the song needs at least four songs in your library.'); return; }
    var st = liveState(); if (st.playing){ GUESS.wasPlaying = true; click('play-btn'); }
    var ans = pool[Math.floor(Math.random() * pool.length)], others = shuffled(pool.filter(function(i){ return i !== ans && t[i].title !== t[ans].title; })).slice(0, 3);
    g.ans = ans; g.opts = shuffled(others.concat([ans])); g.pick = null; g.round = (g.round || 0) + 1; g.phase = 'load'; gsDraw(el, g); el._ph = g.phase + g.round;
    gsClip(true);
    var a = GUESS.a = new Audio(), secs = +el.dataset.secs || 5, round = g.round;
    a.preload = 'auto'; a.src = t[ans].url;
    a.addEventListener('loadedmetadata', function(){ var d = isFinite(a.duration) ? a.duration : 60; try { a.currentTime = Math.max(0, d * (0.3 + Math.random() * 0.35) - secs / 2); } catch(e){} });
    a.addEventListener('seeked', function once(){
      a.removeEventListener('seeked', once); if (g.round !== round) return;
      a.play().then(function(){ g.phase = 'ask'; gsDraw(el, g); el._ph = g.phase + g.round; }).catch(function(){ toast('That song could not be played here.'); g.phase = 'start'; gsDraw(el, g); });
      setTimeout(function(){ if (GUESS.a === a) a.pause(); }, secs * 1000);
      setTimeout(function(){ if (g.round === round && g.phase === 'ask'){ g.phase = 'wrong'; g.score = 0; gsDraw(el, g); el._ph = g.phase + g.round; } }, (secs + 6) * 1000);
    });
    a.addEventListener('error', function(){ if (g.round !== round) return; toast('That song could not be played here.'); g.phase = 'start'; gsDraw(el, g); });
  }
  document.addEventListener('click', function(e){
    var b = e.target.closest && e.target.closest('[data-pw-gs]'); if (!b || editing) return;
    var el = b.closest('[data-pw-live="guess"]'), g = fdMem('gs:' + el.dataset.id, { phase: 'start', score: 0 }), op = b.dataset.pwGs;
    if (op === 'go') gsRound(el);
    else if (op === 'pick' && g.phase === 'ask'){
      g.pick = +b.dataset.i; var ok = g.pick === g.ans;
      g.phase = ok ? 'right' : 'wrong'; g.score = ok ? g.score + 1 : 0;
      if (ok && g.score > gsBest()) try { localStorage.setItem(GUESS_KEY, JSON.stringify({ best: g.score })); } catch(x){}
      try { navigator.vibrate && navigator.vibrate(ok ? [20, 40, 20] : 120); } catch(x){}
      gsDraw(el, g); el._ph = g.phase + g.round;
    }
    else if (op === 'play'){ gsClip(true); GUESS.wasPlaying = false; g.phase = 'start'; g.score = 0; playOne(+b.dataset.i); gsDraw(el, g); }
    else if (op === 'quit'){ gsClip(true); g.phase = 'start'; g.score = 0; gsDraw(el, g); if (GUESS.wasPlaying && !liveState().playing) click('play-btn'); GUESS.wasPlaying = false; }
  });

  // ---------- Cover globe ----------
  // Your covers floating in a snow globe. Swirl them with a finger or shake the phone; tap one to play it.
  var imgCache = {};
  function imgOf(src){ if (!imgCache[src]){ var im = new Image(); im.decoding = 'async'; im.src = src; imgCache[src] = im; } return imgCache[src]; }
  T.globe = { name:'Cover globe', icon:'sparkle', kind:'box', zones:FZ, w:'full', desc:'Your covers in a snow globe: swirl them, shake the phone, tap one to play it',
    fields:[['n','Covers','seg',[['8','8'],['','14'],['20','20']]],['snow','Snow','toggle',true],['shake','Shake the phone to swirl','toggle',true],['h','Size','range',[160, 400, 10, 'px', 260]]],
    render:function(o, c, ctx, it){
      var h = Math.max(160, Math.min(400, +o.h || 260));
      return fdBox(o, fdData(it, o, ['n','snow','shake']) + ' data-pw-live="globe"><canvas></canvas></div>', 'pw-fd-globe', h);
    },
    live:function(el, st){ if (!el._fd) globeInit(el); var f = el._fd; f.cur = st.has ? st.t.dbId : null; fdWake(el); } };
  function globeInit(el){
    var f = fdSetup(el, step, 2), o = f.o, A = api(), t = A ? A.tracks() : [], max = +o.n || 14, items = [];
    f.hit = fdRound(0.47);
    // the covers: the songs with a picture, the ones you play most first, then the rest
    var tp = portfolio().trackPlays || {};
    var withArt = playable().filter(function(i){ return thumbOf(t[i]); }).sort(function(a, b){ return ((tp[t[b].dbId] || {}).count || 0) - ((tp[t[a].dbId] || {}).count || 0); }).slice(0, max);
    withArt.forEach(function(i, k){ var a = k / withArt.length * Math.PI * 2; items.push({ i: i, id: t[i].dbId, img: imgOf(thumbOf(t[i])), x: Math.cos(a) * 0.45, y: Math.sin(a) * 0.45, vx: 0, vy: 0, r: 0.15 + Math.random() * 0.05, rot: Math.random() * 6, vr: 0 }); });
    var snow = []; if (o.snow !== false) for (var s = 0; s < 70; s++) snow.push({ x: Math.random() * 2 - 1, y: Math.random() * 2 - 1, vx: 0, vy: 0, r: 0.006 + Math.random() * 0.012 });
    var down = null, last = null, t0 = 0;
    fdPointer(f, {
      down: function(p){ var q = toUnit(p); down = q; last = q; t0 = performance.now(); },
      move: function(p){ var q = toUnit(p); if (!last) return; var dx = q.x - last.x, dy = q.y - last.y; stir(q.x, q.y, dx * 40, dy * 40); last = q; },
      up: function(p){
        var q = toUnit(p);
        if (down && Math.hypot(q.x - down.x, q.y - down.y) < 0.04 && performance.now() - t0 < 350){
          var hit = items.slice().reverse().filter(function(it){ return Math.hypot(it.x - q.x, it.y - q.y) < it.r * 1.1; })[0];
          if (hit && !editing){ hit.vr += 6; playOne(hit.i, items.map(function(x){ return x.i; })); fdBuzz(o, 12); }
          else stir(q.x, q.y, 0, -2.5);
        }
        down = last = null;
      }
    });
    function toUnit(p){ var R = Math.min(f.w, f.h) * 0.47; return { x: (p.x - f.w / 2) / R, y: (p.y - f.h / 2) / R }; }
    function stir(x, y, fx, fy){
      items.forEach(function(it){ var d = Math.hypot(it.x - x, it.y - y), k = Math.exp(-d * d * 6); it.vx += fx * k + (Math.random() - 0.5) * 0.4 * k; it.vy += fy * k + (Math.random() - 0.5) * 0.4 * k; it.vr += (fx - fy) * k * 0.6; });
      snow.forEach(function(s2){ var d = Math.hypot(s2.x - x, s2.y - y), k = Math.exp(-d * d * 4); s2.vx += fx * k * 1.4 + (Math.random() - 0.5) * k; s2.vy += fy * k * 1.4 + (Math.random() - 0.5) * k; });
      fdWake(el);
    }
    f.shake = function(mag){ stir(0, 0, (Math.random() - 0.5) * mag, (Math.random() - 0.5) * mag); items.forEach(function(it){ it.vx += (Math.random() - 0.5) * mag * 0.5; it.vy += (Math.random() - 0.5) * mag * 0.5; }); };
    if (o.shake !== false) globeShakers.push(el);
    var time = 0;
    function step(dt){
      time += dt;
      var moving = false;
      items.forEach(function(it, k){
        // a slow drift around the middle, things pushing each other apart, the glass wall
        var a = time * 0.15 + k * 2.4; it.vx += (Math.cos(a) * 0.02 - it.x * 0.05) * dt * 3; it.vy += (Math.sin(a) * 0.02 - it.y * 0.05 + 0.01) * dt * 3;
        items.forEach(function(j){ if (j === it) return; var dx = it.x - j.x, dy = it.y - j.y, d = Math.hypot(dx, dy) || 0.001, min = (it.r + j.r) * 0.9; if (d < min){ var push = (min - d) * 4 * dt; it.vx += dx / d * push * 8; it.vy += dy / d * push * 8; } });
        var damp = Math.exp(-1.6 * dt); it.vx *= damp; it.vy *= damp; it.vr *= Math.exp(-1.2 * dt);
        it.x += it.vx * dt; it.y += it.vy * dt; it.rot += it.vr * dt;
        var d2 = Math.hypot(it.x, it.y), lim = 0.95 - it.r; if (d2 > lim){ it.x *= lim / d2; it.y *= lim / d2; var dot = (it.vx * it.x + it.vy * it.y) / (d2 || 1); it.vx -= 1.6 * dot * it.x / (d2 || 1); it.vy -= 1.6 * dot * it.y / (d2 || 1); }
        if (Math.abs(it.vx) + Math.abs(it.vy) > 0.02) moving = true;
      });
      snow.forEach(function(s2){ s2.vy += 0.05 * dt; var dmp = Math.exp(-1.1 * dt); s2.vx *= dmp; s2.vy *= dmp; s2.x += s2.vx * dt; s2.y += (s2.vy + 0.04) * dt; if (Math.hypot(s2.x, s2.y) > 0.94){ s2.y = -0.55 - Math.random() * 0.3; var wmax = Math.sqrt(0.9 * 0.9 - s2.y * s2.y); s2.x = (Math.random() * 2 - 1) * wmax; s2.vx = s2.vy = 0; } });
      draw();
      return true;   // a gentle drift all the time while on screen
    }
    function draw(){
      var g = f.g, w = f.w, h = f.h, R = Math.min(w, h) * 0.47, cx = w / 2, cy = h / 2;
      g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, w, h);
      var col = fdCol(el);
      // the base under the globe
      g.fillStyle = mixC(col, BLACK, 0.55); g.beginPath(); g.ellipse(cx, cy + R * 0.92, R * 0.62, R * 0.16, 0, 0, Math.PI * 2); g.fill();
      // the water inside
      var bg = g.createRadialGradient(cx - R * 0.3, cy - R * 0.4, R * 0.1, cx, cy, R); bg.addColorStop(0, mixC(col, WHITE, 0.15, 0.35)); bg.addColorStop(1, mixC(col, BLACK, 0.6, 0.55));
      g.save(); g.beginPath(); g.arc(cx, cy, R, 0, Math.PI * 2); g.fillStyle = bg; g.fill(); g.clip();
      items.forEach(function(it){
        var x = cx + it.x * R, y = cy + it.y * R, r = it.r * R, playing = it.id === f.cur;
        g.save(); g.translate(x, y); g.rotate(Math.sin(it.rot) * 0.4);
        if (playing){ g.shadowColor = mixC(col, WHITE, 0.3); g.shadowBlur = r * 0.8; }
        g.beginPath(); g.arc(0, 0, r, 0, Math.PI * 2); g.closePath(); g.fillStyle = mixC(col, BLACK, 0.3); g.fill(); g.shadowBlur = 0;
        g.clip();
        if (it.img.complete && it.img.naturalWidth) g.drawImage(it.img, -r, -r, r * 2, r * 2);
        g.restore();
        if (playing){ g.strokeStyle = mixC(col, WHITE, 0.4); g.lineWidth = Math.max(2, r * 0.08); g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.stroke(); }
      });
      g.fillStyle = 'rgba(255,255,255,.85)';
      snow.forEach(function(s2){ g.beginPath(); g.arc(cx + s2.x * R, cy + s2.y * R, s2.r * R, 0, Math.PI * 2); g.fill(); });
      g.restore();
      // the glass: a rim and a highlight
      g.strokeStyle = 'rgba(255,255,255,.35)'; g.lineWidth = Math.max(2, R * 0.025); g.beginPath(); g.arc(cx, cy, R, 0, Math.PI * 2); g.stroke();
      var hl = g.createLinearGradient(cx - R, cy - R, cx, cy); hl.addColorStop(0, 'rgba(255,255,255,.35)'); hl.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = hl; g.beginPath(); g.ellipse(cx - R * 0.42, cy - R * 0.5, R * 0.28, R * 0.12, -0.7, 0, Math.PI * 2); g.fill();
      if (!items.length){ g.fillStyle = 'rgba(255,255,255,.7)'; g.font = Math.round(R * 0.09) + 'px sans-serif'; g.textAlign = 'center'; g.fillText('Songs with covers float here', cx, cy); }
    }
  }
  var globeShakers = [], lastShake = 0;
  window.addEventListener('devicemotion', function(e){
    var a = e.accelerationIncludingGravity || e.acceleration; if (!a || !globeShakers.length) return;
    var m = Math.hypot(a.x || 0, a.y || 0, a.z || 0); if (Math.abs(m - 9.8) < 6 || Date.now() - lastShake < 120) return;
    lastShake = Date.now();
    globeShakers = globeShakers.filter(function(el){ return el.isConnected; });
    globeShakers.forEach(function(el){ if (el._fd && el._fd.shake && fdVisible(el)){ el._fd.shake(Math.min(14, Math.abs(m - 9.8))); fdWake(el); } });
  });

  // ---------- Bloopy pet ----------
  // Bloopy living in a widget: dances to fast songs, sways to slow ones, dozes when nothing plays for a while, and
  // loves a pat. Uses Bloopy's own look (skin and accessories) when the mascot is on.
  var PET_KEY = 'ppPetV1';
  var PET_SAY = {
    dance: ['This one slaps!', 'Can’t stop bouncing!', 'Turn it up!', 'Dance break!', 'Ooh, this beat.'],
    sway: ['Nice and easy.', 'Mmm, smooth.', 'Good one.', 'I like this.', 'So chill.'],
    idle: ['Play something?', 'I’m bored…', 'Got any tunes?', 'Hi there!', 'Pat me!'],
    sleep: ['Zzz…', 'Five more minutes…', 'Zzz… mmm, music…'],
    pat: ['Hehe!', 'That tickles!', '♥', 'Again!', 'Best friend!'] };
  function petBall(){
    var src = document.querySelector('.ppv-ball svg');
    if (src){ var d = document.createElement('div'); d.className = 'ppv-ball m-idle pw-pet-ball'; var sk = document.querySelector('.ppv-ball[data-skin]'); if (sk) d.dataset.skin = sk.dataset.skin; d.innerHTML = src.outerHTML; return d.outerHTML; }
    // the mascot is switched off: a plain Bloopy
    return '<div class="pw-pet-ball pw-pet-own"><svg viewBox="0 0 64 64" aria-hidden="true"><ellipse cx="32" cy="60" rx="15" ry="3" fill="#000" opacity=".25"/><g class="body"><circle cx="32" cy="36" r="22" fill="var(--pw-fc, #7c5cff)"/><circle cx="32" cy="36" r="22" fill="url(#pwPetG)"/>' +
      '<g class="eyes"><circle cx="24" cy="31" r="5.5" fill="#fff"/><circle cx="40" cy="31" r="5.5" fill="#fff"/><circle cx="25" cy="32" r="2.6" fill="#1a1a22"/><circle cx="41" cy="32" r="2.6" fill="#1a1a22"/></g>' +
      '<path class="pw-pet-happy" d="M18 33q6-7 12 0M34 33q6-7 12 0" fill="none" stroke="#1a1a22" stroke-width="2.4" stroke-linecap="round"/><path class="pw-pet-sleepy" d="M18 32h12M34 32h12" fill="none" stroke="#1a1a22" stroke-width="2.4" stroke-linecap="round"/>' +
      '<path class="pw-pet-smile" d="M25 43q7 6 14 0" fill="none" stroke="#1a1a22" stroke-width="2.4" stroke-linecap="round"/></g>' +
      '<defs><radialGradient id="pwPetG" cx=".35" cy=".3" r=".8"><stop offset="0" stop-color="#fff" stop-opacity=".45"/><stop offset=".55" stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".35"/></radialGradient></defs></svg></div>';
  }
  T.pet = { name:'Bloopy pet', icon:'blob', kind:'box', zones:['home','page','player'], w:'full', desc:'Bloopy lives here: dances to fast songs, naps when it’s quiet, loves a pat',
    fields:[['talk','Talks','toggle',true],['h','Size','range',[120, 320, 10, 'px', 180]],['color','Colour (when the mascot is off)','color','']],
    render:function(o, c, ctx, it){
      var h = Math.max(120, Math.min(320, +o.h || 180));
      return '<div class="pw-pet" data-pw-live="pet" data-id="' + esc(it ? it.id : 'x') + '" data-talk="' + (o.talk === false ? 0 : 1) + '" style="height:' + h + 'px' + (okCol(o.color) ? ';--pw-fc:' + o.color : '') + '">' +
        '<div class="pw-pet-bub" hidden></div><button type="button" class="pw-pet-me" data-pw-pet="1" aria-label="Pat Bloopy">' + petBall() + '<span class="pw-pet-zz">z<i>z</i><b>z</b></span></button>' +
        '<div class="pw-pet-st"><span class="pw-pet-h"></span><small></small></div></div>';
    },
    live:function(el, st){
      var P = kept(PET_KEY), now = Date.now(), m = fdMem('pet:' + el.dataset.id, { last: now, sayAt: 0, said: '', song: null, patUntil: 0 });
      if (st.playing) m.last = now;
      var bpm = songBpm(st), mood = now < m.patUntil ? 'pat' : st.playing ? (bpm && bpm < 100 ? 'sway' : 'dance') : now - m.last > 3 * 60000 ? 'sleep' : 'idle';
      el.dataset.mood = mood;
      el.style.setProperty('--beat', (60 / (bpm || 118)).toFixed(3) + 's');
      var ball = el.querySelector('.ppv-ball');
      if (ball){
        ball.classList.remove('m-idle', 'm-done', 'm-greet', 'm-work');
        ball.classList.add(mood === 'pat' ? 'm-done' : mood === 'sleep' ? 'm-work' : 'm-idle');
        ball.dataset.face = mood === 'sleep' ? 'sleep' : '';
        petFace(ball, mood);
      }
      // what Bloopy says: a new line now and then, and something about each new song
      var bub = el.querySelector('.pw-pet-bub'), talk = el.dataset.talk === '1';
      if (talk){
        var song = st.has ? st.t.dbId : null, line = null;
        if (song && song !== m.song && st.playing){ m.song = song; line = pick(['Ooh, “' + st.t.title + '”!', 'Yes! “' + st.t.title + '”!', 'I love this one.']); }
        else if (now - m.sayAt > 22000) line = pick(PET_SAY[mood]);
        if (mood === 'pat' && m.said.indexOf('♥') < 0 && now - m.sayAt > 1500) line = pick(PET_SAY.pat);
        if (line){ m.sayAt = now; m.said = line; setText(bub, line); bub.hidden = false; bub.classList.remove('in'); void bub.offsetWidth; bub.classList.add('in'); }
        if (now - m.sayAt > 6000) bub.hidden = true;
      } else bub.hidden = true;
      // happiness: today's listening and pats
      var day = dayKey(new Date()), mins = Math.round((((portfolio().x || {}).dayMs || {})[day] || 0) / 60000), pats = (P.d === day ? P.n : 0) || 0;
      var hearts = Math.max(0, Math.min(5, Math.floor(mins / 12) + Math.floor(pats / 5)));
      el.querySelector('.pw-pet-h').innerHTML = [0, 1, 2, 3, 4].map(function(k){ return '<i' + (k < hearts ? ' class="on"' : '') + '>♥</i>'; }).join('');
      setText(el.querySelector('.pw-pet-st small'), { dance:'Dancing', sway:'Grooving', idle:'Awake', sleep:'Napping', pat:'Happy' }[mood] + (pats ? ' · ' + plural(pats, 'pat') + ' today' : ''));
    } };
  function pick(a){ return a[Math.floor(Math.random() * a.length)]; }
  function petFace(ball, mood){
    var show = function(sel, on){ ball.querySelectorAll(sel).forEach(function(n){ n.style.display = on ? '' : 'none'; }); };
    if (ball.classList.contains('pw-pet-own')) return;
    show('.eyes', mood !== 'sleep' && mood !== 'pat'); show('[data-fe="happy"]', mood === 'pat' || mood === 'dance'); show('[data-fe="sleepy"]', mood === 'sleep');
    if (mood === 'dance') show('.eyes', false);
    show('[data-fx="zz"]', mood === 'sleep');
  }
  document.addEventListener('click', function(e){
    var b = e.target.closest && e.target.closest('[data-pw-pet]'); if (!b || editing) return;
    var el = b.closest('[data-pw-live="pet"]'), m = fdMem('pet:' + el.dataset.id, { last: Date.now(), sayAt: 0, said: '', song: null, patUntil: 0 });
    m.patUntil = Date.now() + 2200; m.last = Date.now(); m.said = '';
    var P = kept(PET_KEY), day = dayKey(new Date()); if (P.d !== day){ P.d = day; P.n = 0; } P.n++; keep(PET_KEY, P);
    for (var k = 0; k < 4; k++){ var h = document.createElement('span'); h.className = 'pw-pet-heart'; h.textContent = '♥'; h.style.left = (35 + Math.random() * 30) + '%'; h.style.animationDelay = (k * 0.12) + 's'; el.appendChild(h); setTimeout(function(x){ x.remove(); }.bind(null, h), 1500); }
    try { navigator.vibrate && navigator.vibrate(10); } catch(x){}
    T.pet.live(el, liveState());
  });

  // ---------- Record player ----------
  // A turntable with the cover as the label. It turns while the music plays; tap it to play or pause, spin it with your
  // finger to scratch through the song (round and round, forwards or back), and drag the arm to move through the song.
  var RPM = 33.3, ARM_REST = 4, ARM_OUT = 18, ARM_IN = 38;
  T.turntable = { name:'Record player', icon:'spinner', kind:'box', zones:FZ, w:'full', desc:'The cover on a spinning record. Scratch it to move through the song, drag the arm to jump',
    fields:[['h','Size','range',[160, 380, 10, 'px', 240]],['deck','Deck','seg',[['','Wood'],['black','Black'],['white','White'],['theme','Theme colour']]],['buzz','Vibrate','toggle',true]],
    render:function(o, c, ctx, it){
      var h = Math.max(160, Math.min(380, +o.h || 240));
      return '<div class="pw-fd pw-tt2 pw-tt2-' + esc(o.deck || 'wood') + '"' + fdData(it, o, ['buzz']) + ' data-pw-live="turntable" style="height:' + h + 'px">' +
        '<div class="pw-tt2-deck"><div class="pw-tt2-plat"><div class="pw-tt2-rec"><div class="pw-tt2-lab"><img alt="" hidden><span>' + svg('music') + '</span></div></div></div>' +
        '<div class="pw-tt2-arm"><i class="pw-tt2-pivot"></i><i class="pw-tt2-rod"></i><i class="pw-tt2-head"></i></div>' +
        '<div class="pw-tt2-info"><b></b><small></small></div></div></div>';
    },
    live:function(el, st){
      if (!el._fd) ttInit(el);
      var f = el._fd, img = el.querySelector('.pw-tt2-lab img'), src = st.has ? thumbOf(st.t) : null;
      if ((src || '') !== (img._s || '')){ img._s = src || ''; if (src) img.src = src; img.hidden = !src; el.querySelector('.pw-tt2-lab span').hidden = !!src; }
      setText(el.querySelector('.pw-tt2-info b'), st.has ? st.t.title : 'No record on');
      setText(el.querySelector('.pw-tt2-info small'), st.has ? fmtT(media2().t) + ' / ' + fmtT(media2().d) : 'Play something');
      f.playing = st.playing; f.has = st.has;
      if (!f.armDrag){ var tm = media2(); f.armT = tm.d ? tm.t / tm.d : 0; }
      fdWake(el);
    } };
  function ttInit(el){
    var plat = el.querySelector('.pw-tt2-plat'), rec = el.querySelector('.pw-tt2-rec'), arm = el.querySelector('.pw-tt2-arm'), deck = el.querySelector('.pw-tt2-deck');
    var f = fdSetup(el, step), o = f.o; f.pad = plat;
    f.hit = function(x, y, w, h){ return Math.hypot(x - w / 2, y - h / 2) <= Math.min(w, h) / 2 + 6; };
    var ang = fdMem('tt2:' + f.id, { a: 0 }), spin = 0, grab = null, scratch = 0, lastA = 0, lastT = 0, moved = 0;
    f.armT = 0;
    fdPointer(f, {
      down: function(p){ var r = plat.getBoundingClientRect(); grab = { cx: r.width / 2, cy: r.height / 2 }; lastA = Math.atan2(p.y - grab.cy, p.x - grab.cx); moved = 0; scratch = 0; lastT = performance.now(); },
      move: function(p){
        if (!grab) return;
        var a = Math.atan2(p.y - grab.cy, p.x - grab.cx), d = angDiff(a, lastA); lastA = a; ang.a += d; moved += Math.abs(d);
        if (!f.has) return;
        // one turn of the record is 60 / 33.3 = 1.8 s of the song
        scratch += d / (Math.PI * 2) * (60 / RPM);
        var now = performance.now(); if (now - lastT > 90 && Math.abs(scratch) > 0.05){ var w = wapi(), tm = media2(); if (w && tm.d) w.seek(Math.max(0, Math.min(tm.d - 0.3, tm.t + scratch))); scratch = 0; lastT = now; fdBuzz(o, 5); }
      },
      up: function(){
        if (grab && moved < 0.12 && !editing){ if (f.has) click('play-btn'); else runAction('shuffleall'); fdBuzz(o, 10); }
        grab = null; liveSoon();
      }
    });
    // the arm: drag it across the record to move through the song
    var armId = null;
    arm.style.touchAction = 'none';
    arm.addEventListener('touchstart', function(e){ e.ppNoTabSwipe = true; }, { passive: true });
    arm.addEventListener('pointerdown', function(e){ if (editing || !f.has) return; armId = e.pointerId; try { arm.setPointerCapture(armId); } catch(x){} f.armDrag = true; e.preventDefault(); e.stopPropagation(); });
    arm.addEventListener('pointermove', function(e){
      if (e.pointerId !== armId) return;
      // the arm hangs down from its pivot and turns clockwise towards the middle of the record: the angle from the
      // pivot to the finger (0 = straight down, more = further left) picks the place in the song
      var pv = arm.querySelector('.pw-tt2-pivot').getBoundingClientRect(), px = pv.left + pv.width / 2, py = pv.top + pv.height / 2;
      var phi = Math.atan2(-(e.clientX - px), e.clientY - py) * 180 / Math.PI;
      f.armT = Math.max(0, Math.min(1, (phi - ARM_OUT) / (ARM_IN - ARM_OUT)));
      paint();
    });
    var armUp = function(e){ if (e.pointerId !== armId) return; armId = null; f.armDrag = false; var w = wapi(), tm = media2(); if (w && tm.d) w.seek(f.armT * tm.d); fdBuzz(o, 10); liveSoon(); };
    arm.addEventListener('pointerup', armUp); arm.addEventListener('pointercancel', armUp);
    function step(dt){
      var target = f.playing && !grab ? RPM / 60 * Math.PI * 2 : 0;
      spin += (target - spin) * Math.min(1, dt * (f.playing ? 2.2 : 3.5));   // speeds up and slows down like a real deck
      if (!grab) ang.a += spin * dt;
      paint();
      return !!(grab || f.armDrag || f.playing || Math.abs(spin) > 0.01);
    }
    function paint(){
      rec.style.transform = 'rotate(' + ang.a.toFixed(4) + 'rad)';
      // the arm rests off the record, and moves from the outer groove to the inner one
      var deg = f.has ? ARM_OUT + (ARM_IN - ARM_OUT) * f.armT : ARM_REST;
      arm.style.transform = 'rotate(' + deg.toFixed(2) + 'deg)';
    }
    paint();
  }
  // in the Fidgets list of the Add sheet, and stacks give them edges to swipe on
  FIDGET_ORDER.push('beatpad', 'globe', 'turntable');
  ['beatpad', 'globe', 'turntable'].forEach(function(k){ T[k].fidget = true; });
