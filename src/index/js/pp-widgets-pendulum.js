  // ===================== Press Play Pendulum: alarms and the Pomodoro =====================
  // A tab of its own with two parts. Alarms: daily (or one-off) alarms that start your music, the volume rising slowly;
  // on Android they are also set as real alarm clocks, so they ring with the app closed (NotifyPlugin.alarms in
  // JobsPlugin.kt). Pomodoro: a focus timer with its own tab: focus, a short break, focus again, and a long break every few rounds. It can start
  // your music when you focus and fade it out for breaks, keeps what you worked on, and shows today, the week and your
  // streak. The Pomodoro widget is a small window onto the same timer. Everything is kept in localStorage 'ppPomoV1'.
  // Times are kept as end times, so the timer is right after the app was in the background or closed: on coming back,
  // the phases that ended meanwhile are counted (and with "Start the next one by itself", it carries on from there).
  var POMO_ID = '__clock', PO_KEY = 'ppPomoV1';   // POMO_ID: the tab's page id (pp-widgets-layout.js treats it as this tab)
  var PO_DEF = { focus: 25, short: 5, long: 15, every: 4, auto: true, goal: 8, chime: true, buzz: true, awake: false, fm: 'resume', bm: 'pause' };
  var PO_NAME = { focus: 'Focus', short: 'Short break', long: 'Long break' };
  var PO = (function(){
    var p = {}; try { p = JSON.parse(localStorage.getItem(PO_KEY)) || {}; } catch(e){}
    p.s = Object.assign({}, PO_DEF, p.s || {});
    if (!PO_NAME[p.ph]) p.ph = 'focus';
    p.round = +p.round || 0; p.log = p.log || {}; p.hist = p.hist || []; p.task = p.task || '';
    return p;
  })();
  function poSave(){ try { localStorage.setItem(PO_KEY, JSON.stringify(PO)); } catch(e){} }
  function poLen(ph){ return Math.max(1, +PO.s[ph] || PO_DEF[ph]) * 60000; }
  function poLeft(){ return PO.run ? Math.max(0, PO.end - Date.now()) : PO.left != null ? PO.left : poLen(PO.ph); }
  function poToday(){ return PO.log[dayKey(new Date())] || { n: 0, ms: 0 }; }
  function poNext(){ return PO.ph !== 'focus' ? 'focus' : (PO.round + 1) % Math.max(1, +PO.s.every || 4) === 0 ? 'long' : 'short'; }

  // ---------- going from one phase to the next ----------
  function poFinish(at, counted){
    if (PO.ph === 'focus' && counted){
      var k = dayKey(new Date(at)), d = PO.log[k] = PO.log[k] || { n: 0, ms: 0 };
      d.n++; d.ms += poLen('focus');
      PO.hist.unshift({ at: at, task: PO.task || '', min: Math.round(poLen('focus') / 60000) }); PO.hist = PO.hist.slice(0, 40);
      // a year of days is plenty
      var keys = Object.keys(PO.log); if (keys.length > 400) keys.sort(function(a, b){ return dayNum(a) - dayNum(b); }).slice(0, keys.length - 370).forEach(function(x){ delete PO.log[x]; });
    }
    var next = poNext();
    if (PO.ph === 'focus' && counted) PO.round++;
    PO.ph = next; PO.left = null;
    if (PO.s.auto){ PO.run = true; PO.end = at + poLen(next); } else { PO.run = false; }
    return next;
  }
  function poTick(){
    if (!PO.run || Date.now() < PO.end) return false;
    var next, n = 0, focusDone = 0;
    while (PO.run && Date.now() >= PO.end && n++ < 12){ if (PO.ph === 'focus') focusDone++; next = poFinish(PO.end, true); }
    poSave();
    poAlert(next, focusDone);
    poMusic(next, true);
    poPaint();
    return true;
  }
  setInterval(function(){ if (!poTick() && PO.run) poPaint(); }, 1000);
  document.addEventListener('visibilitychange', function(){ if (!document.hidden){ poTick(); poPaint(); } });

  function poAlert(next, focusDone){
    var t = poToday(), goal = +PO.s.goal || 0;
    var msg = next === 'focus' ? 'Break over. Back to it!' : (focusDone ? 'Nice work! ' + (goal && t.n === goal ? 'That’s your goal for today. ' : '') : '') + (next === 'long' ? 'Time for a long break.' : 'Take a short break.');
    if (!(RS.pomo && !document.hidden)) toast('🍅 ' + msg);
    if (PO.s.buzz) try { navigator.vibrate && navigator.vibrate(next === 'focus' ? [120, 80, 120] : [250, 120, 250, 120, 250]); } catch(e){}
    if (PO.s.chime) poChime(next);
  }
  // a soft bell: up for a break, down to go back to work
  function chimeAt(c, out, t0, next){
    var notes = next === 'focus' ? [1046.5, 784, 659.3] : [659.3, 784, 1046.5];
    notes.forEach(function(f, k){
      var t = t0 + k * 0.22;
      [1, 2.76].forEach(function(m, j){
        var o = c.createOscillator(), g = c.createGain(); o.type = 'sine'; o.frequency.value = f * m;
        g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(j ? 0.05 : 0.22, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + (j ? 0.5 : 1.4));
        o.connect(g); g.connect(out); o.start(t); o.stop(t + 1.5);
      });
    });
  }
  function poChime(next){
    // on Android it plays through the phone (speaker or headphones, Settings in the Pomodoro); here, in the page
    if (nativeSound()){ soundWav('chime-' + (next === 'focus' ? 'down' : 'up')).then(function(w){ if (w) nativeSound().playSound({ wav: w, loop: false, speaker: PO.s.out === 'speaker', louder: false }).catch(function(){}); }); return; }
    var c = sfxCtx(); if (!c) return;
    chimeAt(c, sfxOut, c.currentTime + 0.05, next);
  }

  // ---------- music for each phase ----------
  function poPlaylists(){ var A = api(); return A ? A.playlists().filter(function(p){ return !p.libOnly && !p.stemOf; }) : []; }
  function poPlayPl(id){
    var A = api(); if (!A) return false;
    var t = A.tracks(), mine = t.map(function(x, i){ return (x.playlistIds || []).indexOf(id) >= 0 && !x.stem ? i : -1; }).filter(function(i){ return i >= 0; });
    if (!mine.length) return false;
    var st = liveState();
    if (st.playing && st.t && (st.t.playlistIds || []).indexOf(id) >= 0) return true;    // already playing from it
    var q = A.orderFor ? A.orderFor(mine, id) : mine; playQ(Array.isArray(q) ? q : mine); return true;
  }
  var fadeT = 0;
  function poFadePause(){
    var vo = document.getElementById('volume'); if (!liveState().playing) return;
    if (!vo){ click('play-btn'); return; }
    clearInterval(fadeT);
    var v0 = +vo.value, k = 0;
    fadeT = setInterval(function(){
      k++; inputTo('volume', Math.round(v0 * (1 - k / 12)));
      if (k >= 12){ clearInterval(fadeT); if (liveState().playing) click('play-btn'); setTimeout(function(){ inputTo('volume', v0); }, 250); }
    }, 200);
  }
  function poMusic(ph, auto){
    var s = PO.s, st = liveState(), K = kit();
    if (ph === 'focus'){
      if (!PO.run) return;
      if (s.fm === 'resume'){ if (!st.playing){ if (K && K.hasTrack()) click('play-btn'); else runAction('shuffleall'); } }
      else if (s.fm === 'shuffle'){ if (!st.playing) runAction('shuffleall'); }
      else if (s.fm && s.fm !== 'none'){ if (!poPlayPl(s.fm) && !st.playing) runAction('shuffleall'); }
    } else {
      if (s.bm === 'pause') poFadePause();
      else if (s.bm && s.bm !== 'keep' && PO.run) poPlayPl(s.bm);
    }
  }

  // ---------- what the buttons do (the tab and the widget share them) ----------
  function poDo(op, v){
    if (op === 'go'){
      if (PO.run){ PO.left = Math.max(0, PO.end - Date.now()); PO.run = false; }
      else { PO.end = Date.now() + poLeft(); PO.left = null; PO.run = true; poMusic(PO.ph); }
    }
    else if (op === 'reset'){ PO.run = false; PO.left = null; }
    else if (op === 'skip'){ var was = PO.run; PO.run = true; var nx = poFinish(Date.now(), false); if (!was && !PO.s.auto){ PO.run = false; } toast('🍅 ' + PO_NAME[nx] + (PO.run ? ' started.' : '.')); poMusic(nx); }
    else if (op === 'phase'){ if (PO.run) return; PO.ph = v; PO.left = null; }
    else if (op === 'cycle'){ PO.run = false; PO.left = null; PO.ph = 'focus'; PO.round = 0; }
    poSave(); poWake(); poPaint();
  }

  // keeps the screen on while the timer runs and its tab is open (Settings in the tab)
  var wakeLock = null;
  function poWake(){
    var want = PO.s.awake && PO.run && openPageId === POMO_ID && !document.hidden;
    if (want && !wakeLock && navigator.wakeLock) navigator.wakeLock.request('screen').then(function(l){ wakeLock = l; l.addEventListener('release', function(){ wakeLock = null; }); }).catch(function(){});
    if (!want && wakeLock){ try { wakeLock.release(); } catch(e){} wakeLock = null; }
  }
  document.addEventListener('visibilitychange', poWake);

  // ---------- the tab ----------
  function fmtClock(ms){ var s = Math.ceil(ms / 1000), h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60); return (h ? h + ':' + pad(m) : m) + ':' + pad(s % 60); }
  function poStreak(){
    var d = dayNum(dayKey(new Date())), n = 0, has = {};
    Object.keys(PO.log).forEach(function(k){ if (PO.log[k].n) has[dayNum(k)] = 1; });
    if (!has[d]) d--; while (has[d]){ n++; d--; }
    return n;
  }
  function seg(k, list, cur){ return '<div class="pw-seg ppp-seg" data-ppp-set="' + k + '">' + list.map(function(x){ return '<button type="button" data-v="' + x[0] + '"' + (String(cur) === String(x[0]) ? ' class="on"' : '') + '>' + x[1] + '</button>'; }).join('') + '</div>'; }
  function tog(k, label, sub){ return '<label class="ppp-tog"><span><b>' + label + '</b>' + (sub ? '<small>' + sub + '</small>' : '') + '</span><input type="checkbox" data-ppp-set="' + k + '"' + (PO.s[k] ? ' checked' : '') + '></label>'; }
  function opts(list, cur){ return list.map(function(x){ return '<option value="' + esc(x[0]) + '"' + (String(cur) === String(x[0]) ? ' selected' : '') + '>' + esc(x[1]) + '</option>'; }).join(''); }
  var R = 46, CIRC = 2 * Math.PI * R;
  var PEND_SEC_KEY = 'ppPendSec', pendSec = (function(){ try { return localStorage.getItem(PEND_SEC_KEY) === 'pomo' ? 'pomo' : 'alarms'; } catch(e){ return 'alarms'; } })();
  function pendGo(sec){ pendSec = sec; try { localStorage.setItem(PEND_SEC_KEY, sec); } catch(e){} if (openPageId === POMO_ID) renderPage(); else openPage(POMO_ID); }
  function pomoPage(el){
    el.innerHTML = '<div class="ppd" data-sec="' + pendSec + '"><header class="ppp-h"><div><small>Press Play</small><h1>Pendulum</h1></div>' +
      (pendSec === 'pomo' ? '<div class="ppp-today"><b class="ppp-tn">0</b><span class="ppp-tg"></span><small>today</small></div>' : '<div class="ppa-next-pill"></div>') + '</header>' +
      '<div class="ppd-sw"><button type="button" data-pend="alarms"' + (pendSec === 'alarms' ? ' class="on"' : '') + '>' + svg('alarm') + 'Alarms</button><button type="button" data-pend="pomo"' + (pendSec === 'pomo' ? ' class="on"' : '') + '>' + svg('tomato') + 'Pomodoro</button></div>' +
      '<div class="ppd-body"></div></div>';
    var bodyEl = el.querySelector('.ppd-body');
    if (pendSec === 'pomo') pomoSection(bodyEl); else alarmsSection(bodyEl);
    var top = el.querySelector('.ppd'); el._pppSig = null; poPaint(); alPaint();
  }
  function pomoSection(el){
    var s = PO.s, pls = poPlaylists().map(function(p){ return [p.id, 'Play “' + p.name + '”']; });
    var mins = function(list){ return list.map(function(n){ return [n, n + ' min']; }); };
    el.innerHTML = '<div class="ppp" data-ppp="1">' +
      '<div class="ppp-phases">' + ['focus', 'short', 'long'].map(function(ph){ return '<button type="button" data-ppp="phase" data-v="' + ph + '">' + PO_NAME[ph] + '</button>'; }).join('') + '</div>' +
      '<div class="ppp-ring"><svg viewBox="0 0 100 100" aria-hidden="true"><circle class="ppp-tr" cx="50" cy="50" r="' + R + '"/><circle class="ppp-pr" cx="50" cy="50" r="' + R + '" stroke-dasharray="' + CIRC.toFixed(2) + '"/></svg>' +
        '<div class="ppp-in"><small class="ppp-ph"></small><b class="ppp-t" role="timer" aria-live="off"></b><span class="ppp-end"></span><span class="ppp-dots"></span></div></div>' +
      '<input class="ppp-task" type="text" maxlength="80" placeholder="What are you working on?" value="' + esc(PO.task) + '" aria-label="What you are working on">' +
      '<div class="ppp-ctl"><button type="button" class="ppp-sm" data-ppp="reset" aria-label="Start this one again">' + svg('undo') + '<span>Reset</span></button>' +
        '<button type="button" class="ppp-go" data-ppp="go"><span class="ppp-go-i"></span><span class="ppp-go-t"></span></button>' +
        '<button type="button" class="ppp-sm" data-ppp="skip" aria-label="Skip to the next one">' + svg('next') + '<span>Skip</span></button></div>' +
      '<p class="ppp-next"></p>' +
      '<section class="ppp-card"><h2>' + svg('music') + 'Music</h2>' +
        '<label class="ppp-f"><span>When you focus</span><select data-ppp-set="fm">' + opts([['resume', 'Play my music (carry on)'], ['shuffle', 'Shuffle everything'], ['none', 'Leave the music alone']].concat(pls), s.fm) + '</select></label>' +
        '<label class="ppp-f"><span>On breaks</span><select data-ppp-set="bm">' + opts([['pause', 'Fade it out and pause'], ['keep', 'Keep it playing']].concat(pls), s.bm) + '</select></label>' +
        '<div class="ppp-np"></div></section>' +
      '<section class="ppp-card"><h2>' + svg('clock') + 'Timer</h2>' +
        '<div class="ppp-f"><span>Focus for</span>' + seg('focus', mins([15, 20, 25, 30, 45, 50, 60]), s.focus) + '</div>' +
        '<div class="ppp-f"><span>Short break</span>' + seg('short', mins([3, 5, 10]), s.short) + '</div>' +
        '<div class="ppp-f"><span>Long break</span>' + seg('long', mins([10, 15, 20, 30]), s.long) + '</div>' +
        '<div class="ppp-f"><span>Long break after</span>' + seg('every', [[2, '2 rounds'], [3, '3'], [4, '4'], [5, '5'], [6, '6']], s.every) + '</div>' +
        '<div class="ppp-f"><span>Daily goal</span>' + seg('goal', [[0, 'None'], [4, '4'], [6, '6'], [8, '8'], [10, '10'], [12, '12']], s.goal) + '</div>' +
        tog('auto', 'Start the next one by itself', 'A break starts when focus ends, and focus when the break ends.') + tog('chime', 'Chime') +
        (nativeSound() ? '<div class="ppp-f ppp-f-in"><span>The chime plays through</span>' + seg('out', [['speaker', 'Speaker, even with headphones in'], ['phones', 'Headphones when they’re in']], PO.s.out || 'phones') + '</div>' : '') + tog('buzz', 'Vibrate') +
        tog('awake', 'Keep the screen on', 'While the timer runs and this tab is open.') + '</section>' +
      '<section class="ppp-card"><h2>' + svg('chart') + 'Progress</h2><div class="ppp-stats"></div><div class="ppp-week"></div><div class="ppp-hist"></div>' +
        '<button type="button" class="ppp-link" data-ppp="cycle">Start a new set of rounds</button></section>' +
      '</div>';
  }
  function poPaint(){
    if (openPageId === POMO_ID){ var el = pageEl.querySelector('.ppp[data-ppp]'); if (el) poPaintTab(el); }
    document.querySelectorAll('[data-pw-live="focus"]').forEach(function(w){ T.focus.live(w, null); });
  }
  function poPaintTab(el){
    var left = poLeft(), len = poLen(PO.ph), t = poToday(), goal = +PO.s.goal || 0, every = Math.max(1, +PO.s.every || 4);
    el.dataset.ph = PO.ph; el.classList.toggle('ppp-run', !!PO.run);
    setText(el.querySelector('.ppp-t'), fmtClock(left));
    setText(el.querySelector('.ppp-ph'), PO_NAME[PO.ph] + (PO.ph === 'focus' ? ' · round ' + (PO.round % every + 1) + ' of ' + every : ''));
    setText(el.querySelector('.ppp-end'), PO.run ? 'until ' + new Date(PO.end).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }) : PO.left != null ? 'Paused' : 'Ready');
    el.querySelector('.ppp-pr').style.strokeDashoffset = (CIRC * (left / len)).toFixed(2);
    var dots = ''; for (var k = 0; k < every; k++) dots += '<i' + (k < PO.round % every ? ' class="on"' : '') + '></i>';
    var dd = el.querySelector('.ppp-dots'); if (dd._h !== dots){ dd._h = dots; dd.innerHTML = dots; }
    el.querySelectorAll('.ppp-phases button').forEach(function(b){ b.classList.toggle('on', b.dataset.v === PO.ph); b.disabled = !!PO.run && b.dataset.v !== PO.ph; });
    var go = el.querySelector('.ppp-go'); var gl = PO.run ? 'Pause' : PO.left != null ? 'Carry on' : PO.ph === 'focus' ? 'Start focus' : 'Start break';
    if (go._l !== gl){ go._l = gl; go.querySelector('.ppp-go-i').innerHTML = svg(PO.run ? 'pause' : 'play'); setText(go.querySelector('.ppp-go-t'), gl); }
    var hd = pageEl.querySelector('.ppp-today');
    if (hd){ setText(hd.querySelector('.ppp-tn'), String(t.n)); setText(hd.querySelector('.ppp-tg'), goal ? '/' + goal : ''); hd.classList.toggle('ppp-won', !!goal && t.n >= goal); }
    var nx = poNext(); setText(el.querySelector('.ppp-next'), 'Next: ' + PO_NAME[nx].toLowerCase() + ', ' + Math.round(poLen(nx) / 60000) + ' min');
    var st = liveState(), np = st.has ? '<span>' + svg(st.playing ? 'music' : 'pause') + '</span><b>' + esc(st.t.title) + '</b><small>' + (st.playing ? 'playing' : 'paused') + '</small>' : '<small>Nothing playing. Focus can start your music.</small>';
    var npEl = el.querySelector('.ppp-np'); if (npEl._h !== np){ npEl._h = np; npEl.innerHTML = np; }
    // the progress part changes only when a session is done
    var sig = JSON.stringify([PO.hist.length && PO.hist[0].at, t.n, dayKey(new Date())]);
    if (el._pppSig === sig) return; el._pppSig = sig;
    var week = 0, days = [], max = 1;
    for (var i = 6; i >= 0; i--){ var d = new Date(); d.setDate(d.getDate() - i); var e = PO.log[dayKey(d)] || { n: 0, ms: 0 }; week += e.ms; days.push([d, e.n]); max = Math.max(max, e.n, goal); }
    var streak = poStreak(), total = Object.keys(PO.log).reduce(function(a, k){ return a + (PO.log[k].n || 0); }, 0);
    el.querySelector('.ppp-stats').innerHTML = [[String(t.n), 'sessions today'], [fmtMin(t.ms), 'focused today'], [fmtMin(week), 'this week'], [plural(streak, 'day'), 'streak'], [String(total), 'all time']]
      .map(function(x){ return '<div><b>' + esc(x[0]) + '</b><small>' + x[1] + '</small></div>'; }).join('');
    el.querySelector('.ppp-week').innerHTML = days.map(function(x, k){ return '<div class="ppp-bar' + (k === 6 ? ' ppp-bar-now' : '') + '"><i style="height:' + (x[1] / max * 100).toFixed(1) + '%"><em>' + (x[1] || '') + '</em></i><small>' + esc(x[0].toLocaleDateString(undefined, { weekday: 'narrow' })) + '</small></div>'; }).join('') +
      (goal ? '<span class="ppp-goal" style="bottom:calc(' + (goal / max * 100).toFixed(1) + '% * .78 + 20px)"></span>' : '');
    el.querySelector('.ppp-hist').innerHTML = PO.hist.length ? '<h3>Recent sessions</h3>' + PO.hist.slice(0, 8).map(function(h){
      var d = new Date(h.at), today = dayKey(d) === dayKey(new Date());
      return '<div class="ppp-hi"><span>' + svg('check') + '</span><b>' + esc(h.task || 'Focus') + '</b><small>' + esc((today ? '' : d.toLocaleDateString(undefined, { weekday: 'short' }) + ' ') + d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })) + ' · ' + h.min + ' min</small></div>'; }).join('')
      : '<p class="pw-otd-e">Finished focus sessions show up here, with what you worked on.</p>';
  }
  function fmtMin(ms){ var m = Math.round(ms / 60000); return m >= 60 ? Math.floor(m / 60) + 'h ' + (m % 60) + 'm' : m + ' min'; }
  document.addEventListener('click', function(e){
    var b = e.target.closest && e.target.closest('[data-ppp]:not(.ppp)'); if (!b || editing) return;
    poDo(b.dataset.ppp, b.dataset.v);
    if (b.dataset.ppp === 'cycle') toast('🍅 A new set of rounds: round 1.');
  });
  document.addEventListener('click', function(e){
    var b = e.target.closest && e.target.closest('.ppp-seg[data-ppp-set] button'); if (!b) return;
    var k = b.parentNode.dataset.pppSet, v = b.dataset.v; PO.s[k] = v !== '' && !isNaN(+v) ? +v : v;
    b.parentNode.querySelectorAll('button').forEach(function(x){ x.classList.toggle('on', x === b); });
    if (PO.left != null && (k === PO.ph)) PO.left = Math.min(PO.left, poLen(PO.ph));
    poSave(); var el = pageEl.querySelector('.ppp[data-ppp]'); if (el) el._pppSig = null; poPaint();
  });
  document.addEventListener('change', function(e){
    var x = e.target; if (!x.dataset || !x.dataset.pppSet || x.closest('.ppp-seg')) return;
    PO.s[x.dataset.pppSet] = x.type === 'checkbox' ? x.checked : x.value; poSave(); poWake();
  });
  document.addEventListener('input', function(e){ if (e.target.classList && e.target.classList.contains('ppp-task')){ PO.task = e.target.value.slice(0, 80); clearTimeout(e.target._t); e.target._t = setTimeout(poSave, 400); } });

  // ---------- the widget: a small window onto the same timer ----------
  T.focus = { name:'Pomodoro', icon:'tomato', kind:'box', zones:['home','page','player','video'], w:'full', desc:'Focus and breaks, with your music. The full timer is in the Pendulum tab',
    fields:[['look','Look','seg',[['','Ring'],['bar','Slim']]],['card','On a card','toggle',true]],
    render:function(o){
      if (o.look === 'bar') return card(cardOn(o), '<div class="pw-po pw-po-bar" data-pw-live="focus"><button type="button" class="pw-po-go" data-ppp="go" aria-label="Start or pause"></button>' +
        '<div class="pw-po-m"><div class="pw-po-l"><b class="pw-po-t"></b><small class="pw-po-p"></small></div><div class="pw-lvl-bar"><i></i></div></div><button type="button" class="pw-po-open" data-pw-act="pomodoro" aria-label="Open the Pomodoro">' + svg('chevr') + '</button></div>');
      return card(cardOn(o), '<div class="pw-po" data-pw-live="focus"><div class="pw-po-ring"><svg viewBox="0 0 100 100" aria-hidden="true"><circle class="ppp-tr" cx="50" cy="50" r="' + R + '"/><circle class="ppp-pr" cx="50" cy="50" r="' + R + '" stroke-dasharray="' + CIRC.toFixed(2) + '"/></svg><div class="pw-po-in"><b class="pw-po-t"></b><small class="pw-po-p"></small></div></div>' +
        '<div class="pw-po-side"><div class="pw-po-h"><b>Pomodoro</b><small class="pw-po-d"></small></div><div class="pw-po-task"></div><div class="pw-sw-b"><button type="button" class="pw-po-go" data-ppp="go"></button><button type="button" data-ppp="skip">Skip</button><button type="button" data-pw-act="pomodoro">Open</button></div></div></div>');
    },
    live:function(el){
      var left = poLeft(), len = poLen(PO.ph), t = poToday(), goal = +PO.s.goal || 0;
      el.dataset.ph = PO.ph; el.classList.toggle('pw-po-run', !!PO.run);
      setText(el.querySelector('.pw-po-t'), fmtClock(left));
      setText(el.querySelector('.pw-po-p'), PO_NAME[PO.ph]);
      var pr = el.querySelector('.ppp-pr'); if (pr) pr.style.strokeDashoffset = (CIRC * (left / len)).toFixed(2);
      var bar = el.querySelector('.pw-lvl-bar i'); if (bar) bar.style.width = ((1 - left / len) * 100).toFixed(2) + '%';
      var go = el.querySelector('.pw-po-go'), gl = PO.run ? 'Pause' : PO.left != null ? 'Carry on' : 'Start';
      if (go._l !== gl){ go._l = gl; go.innerHTML = el.classList.contains('pw-po-bar') ? svg(PO.run ? 'pause' : 'play') : esc(gl); }
      go.classList.toggle('on', !!PO.run);
      setText(el.querySelector('.pw-po-d'), t.n + (goal ? ' of ' + goal : '') + ' today');
      setText(el.querySelector('.pw-po-task'), PO.task ? 'On: ' + PO.task : '');
    } };
  P.tomato = '<path d="M12 7.5c-4.6 0-8 2.9-8 6.6S7.4 21 12 21s8-3.2 8-6.9-3.4-6.6-8-6.6z"/><path d="M12 7.5c-.6-1.8-2.3-2.9-4.4-3 .9 1.6 2.5 2.6 4.4 3zm0 0c.6-1.8 2.3-2.9 4.4-3-.9 1.6-2.5 2.6-4.4 3zM12 7.5V3.5"/>';
  ACTIONS.pomodoro = { label:'Pomodoro (Pendulum)', icon:'tomato', run:function(){ pendGo('pomo'); } };
  ACTIONS.alarms = { label:'Alarms (Pendulum)', icon:'alarm', run:function(){ pendGo('alarms'); } };
  P.alarm = '<circle cx="12" cy="13" r="8"/><polyline points="12 9 12 13 14.5 15"/><path d="M5 3 2 6M19 3l3 3M7 20l-1.5 2M17 20l1.5 2"/>';

  // The Pendulum tab: added once to the tab bar (before Settings); it can be moved or removed like any other.
  setTimeout(function(){
    try {
      if (localStorage.getItem('ppPendTabV1')) return;
      localStorage.setItem('ppPendTabV1', '1');
      L.tabs = L.tabs || tabsDefault();
      if (L.tabs.some(function(t){ return t.type === 'page' && t.page === POMO_ID; })) return;
      var at = L.tabs.findIndex(function(t){ return t.type === 'view' && t.view === 'settings'; });
      L.tabs.splice(at < 0 ? L.tabs.length : at, 0, { id: 'pomo', type: 'page', page: POMO_ID });
      save(true); applyTabs();
    } catch(e){}
  }, 0);

  // ===================== Pendulum: alarms =====================
  // Each alarm: { id, on, time 'HH:MM', days [0-6] ([] = once), label, music ('' shuffle everything, 'resume', 'none',
  // or a playlist id), fade (minutes the volume takes to rise), snooze (minutes), pomo (start a focus session when it is
  // stopped), last (the last time it went off: it never rings twice for one time), snoozeAt }. Kept in 'ppAlarmsV2'.
  var AL_KEY = 'ppAlarmsV2', DAY_N = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
  var AL = (function(){ var a = []; try { a = JSON.parse(localStorage.getItem(AL_KEY)) || []; } catch(e){} return Array.isArray(a) ? a : []; })();
  var alOpen = null, RING = null;   // the alarm being edited in the tab; the alarm ringing now
  function alSave(){ try { localStorage.setItem(AL_KEY, JSON.stringify(AL)); } catch(e){} alNative(); }
  function alById(id){ return AL.filter(function(a){ return a.id === id; })[0] || null; }
  function alNew(){ return { id: 'a' + uid(), on: true, time: '07:30', days: [1, 2, 3, 4, 5], label: '', wake: 'sound', tone: 'classic', louder: true, out: 'speaker', music: '', fade: 1, snooze: 9, pomo: false, last: Date.now() }; }
  // what an alarm wakes you to: 'sound' (an alarm tone), 'both' (the tone, then music after 30 s) or 'music'
  // (alarms made before tones existed: music, or "just the alarm sound" for music 'none')
  function alWake(a){ return a.wake || (a.music === 'none' ? 'sound' : 'music'); }
  // the next time it goes off after `from`
  function alNext(a, from){
    if (!a.on) return null;
    if (a.snoozeAt && a.snoozeAt > from) return a.snoozeAt;
    var p = String(a.time || '07:30').split(':'), d = new Date(from); d.setSeconds(0, 0); d.setHours(+p[0] || 0, +p[1] || 0);
    for (var k = 0; k < 9; k++){
      if (d.getTime() > from && (!a.days || !a.days.length || a.days.indexOf(d.getDay()) >= 0)) return d.getTime();
      d.setDate(d.getDate() + 1);
    }
    return null;
  }
  function alSoonest(){ var best = null; AL.forEach(function(a){ var t = alNext(a, Date.now()); if (t && (!best || t < best.at)) best = { a: a, at: t }; }); return best; }
  function fmtTime(hm){ var p = String(hm).split(':'), d = new Date(); d.setHours(+p[0] || 0, +p[1] || 0, 0, 0); return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }); }
  function fmtIn(ms){ var m = Math.max(0, Math.round(ms / 60000)), d = Math.floor(m / 1440), h = Math.floor(m % 1440 / 60); return (d ? d + 'd ' : '') + (d || h ? h + 'h ' : '') + (m % 60) + 'm'; }
  function daysText(days){
    if (!days || !days.length) return 'Once';
    var s = days.slice().sort().join(',');
    if (s === '0,1,2,3,4,5,6') return 'Every day'; if (s === '1,2,3,4,5') return 'Weekdays'; if (s === '0,6') return 'Weekends';
    return days.slice().sort(function(x, y){ return ((x + 6) % 7) - ((y + 6) % 7); }).map(function(d){ return new Date(2024, 0, 7 + d).toLocaleDateString(undefined, { weekday: 'short' }); }).join(', ');
  }
  function wakeText(a){
    var w = alWake(a), t = toneName(a.tone);
    return w === 'sound' ? t : w === 'both' ? t + ', then ' + musicText(a.music) : musicText(a.music);
  }
  function musicText(m){
    if (m === 'none') return 'Alarm sound only'; if (m === 'resume') return 'What you last played'; if (!m) return 'Everything, shuffled';
    var pl = poPlaylists().filter(function(p){ return p.id === m; })[0]; return pl ? pl.name : 'Everything, shuffled';
  }

  // ---------- ringing ----------
  function alTick(){
    var now = Date.now(), changed = false;
    AL.forEach(function(a){
      if (!a.on) return;
      var due = alNext(a, a.last || now - 60000);
      if (!due || due > now) return;
      a.last = due; a.snoozeAt = null; changed = true;
      if (!a.days || !a.days.length) a.on = false;   // a one-off alarm switches itself off
      if (now - due < 30 * 60000) alRing(a, due);       // missed by more than half an hour (the phone was off): let it go
    });
    if (changed){ alSave(); alPaint(); }
  }
  setInterval(alTick, 1000);
  document.addEventListener('visibilitychange', function(){
    if (!document.hidden){
      alTick();
      var N = window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.PPNotify;
      if (RING && RING.native && N && N.dismiss){ N.dismiss({ id: RING.native }).catch(function(){}); RING.native = null; }
      if (RING){ pendSec = 'alarms'; if (openPageId !== POMO_ID) openPage(POMO_ID); else renderPage(); }
    } else alNative();
  });
  window.addEventListener('pagehide', alNative);
  var beepT = 0, fadeUpT = 0;
  function alRing(a, at){
    alStopSound();
    RING = { id: a.id, at: at, t0: Date.now() };
    var N = window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.PPNotify;
    // the app plays it now: quiet the phone's own alarm. Not while the app is in the background, where Android may keep
    // the app's sound quiet: the phone's alarm rings on, and is quieted when you come back to the app.
    if (N && N.dismiss && !document.hidden) N.dismiss({ id: a.id + '_' + at }).catch(function(){});
    else RING.native = a.id + '_' + at;
    var vo = document.getElementById('volume'), target = vo ? Math.max(30, +vo.value || 70) : 70;
    RING.vol = target;
    var wake = alWake(a);
    var startMusic = function(){
      if (!RING || RING.id !== a.id) return;
      if (a.music === 'resume') runAction('resume');
      else if (a.music && a.music !== 'none' && !poPlayPl(a.music)) runAction('shuffleall');
      else if (!a.music || a.music === 'none') runAction('shuffleall');
      if (+a.fade && vo){
        inputTo('volume', 4);
        var ms = +a.fade * 60000, t0 = Date.now();
        fadeUpT = setInterval(function(){ var f = Math.min(1, (Date.now() - t0) / ms); inputTo('volume', Math.round(4 + (target - 4) * f)); if (f >= 1) clearInterval(fadeUpT); }, 1000);
      }
    };
    if (wake === 'music') startMusic();
    else {
      if (liveState().playing) click('play-btn');   // the alarm sound on its own, not over a song
      if (!(a.tone === 'phone' && RING.native)) tonePlay(a.tone || 'classic', { louder: a.louder !== false, id: a.id, label: a.label, speaker: a.out !== 'phones' });   // (the phone's own alarm is already ringing)
      if (wake === 'both') beepT = setTimeout(function(){ toneStop(); startMusic(); RING && (RING.music = true); alPaint(); }, 30000);
    }
    try { navigator.vibrate && navigator.vibrate([500, 250, 500, 250, 500]); } catch(e){}
    if (!(RS.alarm && !document.hidden)) toast('⏰ ' + (a.label || 'Alarm') + ' · ' + fmtTime(a.time));   // the ringing screen says it already
    // show it: the Alarms part of the Pendulum tab, with Snooze and Stop
    if (!document.hidden){ pendSec = 'alarms'; if (openPageId !== POMO_ID) openPage(POMO_ID); else renderPage(); }
    alPaint();
    // after 30 minutes it stops by itself
    setTimeout(function(){ if (RING && RING.id === a.id && RING.at === at) alStop(false); }, 30 * 60000);
  }
  function alStopSound(){ clearTimeout(beepT); clearInterval(fadeUpT); beepT = fadeUpT = 0; toneStop(); }
  function alStop(snooze){
    if (!RING) return;
    var a = alById(RING.id), vol = RING.vol;
    alStopSound(); RING = null;
    var focusNow = a && !snooze && a.pomo;
    if (liveState().playing && !(focusNow && alWake(a) !== 'sound')) click('play-btn');   // "then focus": the music carries on as focus music
    if (vol) setTimeout(function(){ inputTo('volume', vol); }, 200);
    if (a && snooze){ a.snoozeAt = Date.now() + (+a.snooze || 9) * 60000; a.on = true; toast('Snoozing for ' + (+a.snooze || 9) + ' minutes.'); }
    if (focusNow){ pendSec = 'pomo'; PO.ph = 'focus'; PO.left = null; PO.run = false; poDo('go'); renderPage(); toast('🍅 Focus started.'); }
    alSave(); alPaint();
  }

  // ---------- Android: the alarms are real alarm clocks too ----------
  // The next two times of each alarm (and a snooze) go to the phone, which rings them even with the app closed.
  // Tapping the notification opens the app, which starts the music (alTick finds the alarm due) and quiets the ring.
  var natT = 0, natExact = null;
  function alNative(){
    clearTimeout(natT);
    natT = setTimeout(function(){
      var N = window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.PPNotify; if (!N || !N.alarms) return;
      var items = [], now = Date.now();
      AL.forEach(function(a){
        var t = alNext(a, now), n = 0;
        while (t && n++ < 2){
          items.push({ id: a.id + '_' + t, at: t, title: '⏰ ' + (a.label || 'Alarm') + ' · ' + fmtTime(a.time), text: alWake(a) === 'sound' ? 'Tap to stop it.' : 'Tap to start your music (' + musicText(a.music) + ').' });
          if (!a.days || !a.days.length || a.snoozeAt === t) break;
          t = alNext(Object.assign({}, a, { snoozeAt: null }), t);
        }
      });
      N.alarms({ items: items }).then(function(r){ natExact = r && r.exact; alPaint(); }).catch(function(){});
    }, 300);
  }
  setTimeout(alNative, 2500);

  // ---------- the Alarms part of the tab ----------
  function alarmsSection(el){
    el.innerHTML = '<div class="ppa">' +
      '<div class="ppa-ring" hidden></div>' +
      '<div class="ppa-list"></div>' +
      '<button type="button" class="ppa-add" data-ppa="add">' + svg('plus') + 'Add an alarm</button>' +
      '<p class="ppa-note"></p></div>';
    el._sig = null; alPaint();
  }
  function alRowHTML(a){
    var at = alNext(a, Date.now()), open = alOpen === a.id, p = String(a.time).split(':'), d = new Date(); d.setHours(+p[0] || 0, +p[1] || 0, 0, 0);
    var tp = d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }), m = tp.match(/^(.*?)(\s?[AaPp]\.?\s?[Mm]\.?)$/);
    var sub = [daysText(a.days), wakeText(a)].concat(a.pomo ? ['then focus'] : []).join(' · ');
    var h = '<div class="ppa-al' + (a.on ? ' on' : '') + (open ? ' open' : '') + '" data-al="' + esc(a.id) + '">' +
      '<button type="button" class="ppa-main" data-ppa="edit"><span class="ppa-t">' + esc(m ? m[1] : tp) + (m ? '<small>' + esc(m[2].trim()) + '</small>' : '') + '</span>' +
        '<span class="ppa-m"><b>' + esc(a.label || 'Alarm') + '</b><small>' + esc(sub) + '</small>' + (a.on && at ? '<small class="ppa-in">' + (a.snoozeAt && a.snoozeAt > Date.now() ? 'Snoozed · ' : '') + 'in ' + fmtIn(at - Date.now()) + '</small>' : '') + '</span></button>' +
      '<button type="button" class="pw-al-sw" role="switch" aria-checked="' + !!a.on + '" data-ppa="tog" aria-label="Alarm on or off"><i></i></button>';
    if (open){
      var pls = poPlaylists().map(function(pl){ return [pl.id, pl.name]; });
      h += '<div class="ppa-ed">' +
        '<label class="ppp-f"><span>Time</span><input type="time" class="ppa-time" data-ppa-set="time" value="' + esc(a.time) + '"></label>' +
        '<label class="ppp-f"><span>Name</span><input type="text" class="ppa-in-t" data-ppa-set="label" maxlength="40" placeholder="Alarm" value="' + esc(a.label || '') + '"></label>' +
        '<div class="ppp-f"><span>Repeat</span><div class="ppa-days">' + DAY_N.map(function(n, k){ var dk = (k + 1) % 7; return '<button type="button" data-ppa="day" data-v="' + dk + '"' + ((a.days || []).indexOf(dk) >= 0 ? ' class="on"' : '') + ' aria-label="' + esc(new Date(2024, 0, 7 + dk).toLocaleDateString(undefined, { weekday: 'long' })) + '">' + DAY_N[dk] + '</button>'; }).join('') + '</div>' +
          '<div class="ppa-quick">' + [['once', 'Once'], ['all', 'Every day'], ['wk', 'Weekdays'], ['we', 'Weekends']].map(function(x){ return '<button type="button" data-ppa="days" data-v="' + x[0] + '">' + x[1] + '</button>'; }).join('') + '</div></div>' +
        '<div class="ppp-f"><span>Wake up to</span>' + alSegS('wake', [['sound', 'Alarm sound'], ['both', 'Sound, then music'], ['music', 'Music']], alWake(a)) + '</div>' +
        (alWake(a) !== 'music' ? '<div class="ppp-f"><span>Alarm sound</span><div class="ppa-tone"><select data-ppa-set="tone">' + opts(TONES.concat(phoneTone() ? [['phone', 'The phone’s alarm sound']] : []), a.tone || 'classic') + '</select>' +
          '<button type="button" data-ppa="hear">' + svg('play') + 'Hear it</button></div></div>' +
          '<label class="ppp-tog"><span><b>Gets louder</b><small>Starts quiet and rises over half a minute.</small></span><input type="checkbox" data-ppa-set="louder"' + (a.louder !== false ? ' checked' : '') + '></label>' +
          (nativeSound() ? '<div class="ppp-f"><span>Plays through</span>' + alSegS('out', [['speaker', 'Speaker, even with headphones in'], ['phones', 'Headphones when they’re in']], a.out === 'phones' ? 'phones' : 'speaker') + '</div>' : '') : '') +
        (alWake(a) !== 'sound' ? '<label class="ppp-f"><span>' + (alWake(a) === 'both' ? 'Then the music (after 30 s)' : 'Music') + '</span><select data-ppa-set="music">' + opts([['', 'Everything, shuffled'], ['resume', 'What I last played']].concat(pls), a.music === 'none' ? '' : a.music || '') + '</select></label>' +
          '<div class="ppp-f"><span>Music volume rises over</span>' + alSeg('fade', [[0, 'No fade'], [1, '1 min'], [3, '3 min'], [10, '10 min']], a.fade) + '</div>' : '') +
        '<div class="ppp-f"><span>Snooze for</span>' + alSeg('snooze', [[5, '5 min'], [9, '9 min'], [10, '10 min'], [15, '15 min']], a.snooze) + '</div>' +
        '<label class="ppp-tog"><span><b>Then start a Pomodoro</b><small>Stopping the alarm starts a focus session.</small></span><input type="checkbox" data-ppa-set="pomo"' + (a.pomo ? ' checked' : '') + '></label>' +
        '<div class="ppa-ed-b"><button type="button" data-ppa="test">' + svg('play') + 'Try it</button><button type="button" class="pw-danger" data-ppa="del">' + svg('x') + 'Delete</button><button type="button" class="on" data-ppa="done">Done</button></div>' +
      '</div>';
    }
    return h + '</div>';
  }
  function alSegS(k, list, cur){ return '<div class="pw-seg ppp-seg" data-ppa-segs="' + k + '">' + list.map(function(x){ return '<button type="button" data-v="' + x[0] + '"' + (cur === x[0] ? ' class="on"' : '') + '>' + x[1] + '</button>'; }).join('') + '</div>'; }
  function alSeg(k, list, cur){ return '<div class="pw-seg ppp-seg" data-ppa-seg="' + k + '">' + list.map(function(x){ return '<button type="button" data-v="' + x[0] + '"' + (+cur === x[0] ? ' class="on"' : '') + '>' + x[1] + '</button>'; }).join('') + '</div>'; }
  function alPaint(){
    // the tab
    var box = openPageId === POMO_ID ? pageEl.querySelector('.ppa') : null, nx = alSoonest();
    var pill = openPageId === POMO_ID ? pageEl.querySelector('.ppa-next-pill') : null;
    if (pill) setText(pill, nx ? 'Next in ' + fmtIn(nx.at - Date.now()) : 'No alarm set');
    if (box){
      var ring = box.querySelector('.ppa-ring'), ra = RING && alById(RING.id);
      ring.hidden = !ra;
      if (ra && ring._id !== RING.id + RING.at){ ring._id = RING.id + RING.at;
        ring.innerHTML = '<div class="ppa-ring-i">' + svg('alarm') + '</div><b>' + esc(fmtTime(ra.time)) + '</b><span>' + esc(ra.label || 'Alarm') + '</span>' +
          '<div class="ppa-ring-b"><button type="button" data-ppa="snooze">Snooze ' + (+ra.snooze || 9) + ' min</button><button type="button" class="on" data-ppa="stop">' + (ra.pomo ? 'Stop and focus' : 'Stop') + '</button></div>'; }
      if (!ra) ring._id = null;
      var list = box.querySelector('.ppa-list'), sig = JSON.stringify([AL, alOpen, Math.floor(Date.now() / 30000), poPlaylists().length]);
      if (list._sig !== sig){
        var keep = document.activeElement && list.contains(document.activeElement) && document.activeElement.matches('input[type=text], input[type=time]');
        if (!keep){ list._sig = sig; list.innerHTML = AL.length ? AL.slice().sort(function(x, y){ return String(x.time).localeCompare(String(y.time)); }).map(alRowHTML).join('') : '<p class="ppa-empty">No alarms yet. Add one, and wake up to your music.</p>'; }
      }
      var N = window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.PPNotify;
      setText(box.querySelector('.ppa-note'), !N ? 'In this browser alarms ring while Press Play is open. In the Android app they ring like a clock alarm, even with the app closed.'
        : natExact === false ? 'Android has not allowed exact alarms for Press Play, so an alarm may come a few minutes late. You can allow it in the phone’s settings under Alarms & reminders.'
        : 'Alarms ring even with the app closed. Tap the alarm to start your music.');
    }
    document.querySelectorAll('[data-pw-live="alarm"]').forEach(function(w){ T.alarm.live(w); });
  }
  document.addEventListener('click', function(e){
    var b = e.target.closest && e.target.closest('[data-pend]'); if (b){ pendGo(b.dataset.pend); return; }
    b = e.target.closest && e.target.closest('[data-ppa]'); if (!b || editing) return;
    var op = b.dataset.ppa, row = b.closest('[data-al]'), a = row ? alById(row.dataset.al) : null;
    if (op === 'add'){ var n = alNew(); AL.push(n); alOpen = n.id; alSave(); alPaint(); var r = pageEl.querySelector('[data-al="' + n.id + '"]'); if (r) r.scrollIntoView({ block: 'center', behavior: 'smooth' }); return; }
    if (op === 'stop' || op === 'snooze'){ alStop(op === 'snooze'); return; }
    if (!a) return;
    if (op === 'edit') alOpen = alOpen === a.id ? null : a.id;
    else if (op === 'done') alOpen = null;
    else if (op === 'tog'){ a.on = !a.on; a.snoozeAt = null; a.last = Date.now(); if (a.on){ var t = alNext(a, Date.now()); if (t) toast('Alarm in ' + fmtIn(t - Date.now()) + '.'); } }
    else if (op === 'day'){ var dv = +b.dataset.v, ds = a.days = (a.days || []).slice(), i = ds.indexOf(dv); if (i >= 0) ds.splice(i, 1); else ds.push(dv); a.last = Date.now(); }
    else if (op === 'days'){ a.days = { once: [], all: [0, 1, 2, 3, 4, 5, 6], wk: [1, 2, 3, 4, 5], we: [0, 6] }[b.dataset.v] || []; a.last = Date.now(); }
    else if (op === 'del'){ AL = AL.filter(function(x){ return x !== a; }); alOpen = null; toast('Alarm deleted.'); }
    else if (op === 'test'){ alRing(a, Date.now()); return; }
    else if (op === 'hear'){
      var label = function(on){ b.innerHTML = svg(on ? 'pause' : 'play') + (on ? 'Stop' : 'Hear it'); };
      if (toneNow && toneNow.preview){ toneStop(); label(false); return; }
      tonePlay(a.tone || 'classic', { preview: true, louder: false, id: a.id + '_try', label: a.label, speaker: a.out !== 'phones' }); label(true);
      var mine = toneNow; setTimeout(function(){ if (toneNow === mine) toneStop(); if (b.isConnected) label(false); }, 4000);
      return;
    }
    alSave(); alPaint();
  });
  document.addEventListener('click', function(e){
    var b = e.target.closest && e.target.closest('[data-ppa-segs] button'); if (!b) return;
    var a = alById(b.closest('[data-al]').dataset.al); if (!a) return;
    a[b.parentNode.dataset.ppaSegs] = b.dataset.v; if (a.music === 'none') a.music = ''; alSave(); alPaint();
  });
  document.addEventListener('click', function(e){
    var b = e.target.closest && e.target.closest('[data-ppa-seg] button'); if (!b) return;
    var a = alById(b.closest('[data-al]').dataset.al); if (!a) return;
    a[b.parentNode.dataset.ppaSeg] = +b.dataset.v; alSave(); alPaint();
  });
  document.addEventListener('change', function(e){
    var x = e.target; if (!x.dataset || !x.dataset.ppaSet) return;
    var a = alById(x.closest('[data-al]').dataset.al); if (!a) return;
    var k = x.dataset.ppaSet; a[k] = x.type === 'checkbox' ? x.checked : x.value;
    if (k === 'time'){ a.on = true; a.last = Date.now(); a.snoozeAt = null; }
    alSave(); if (k !== 'label') { x.blur(); alPaint(); }
  });
  document.addEventListener('input', function(e){ var x = e.target; if (x.dataset && x.dataset.ppaSet === 'label'){ var a = alById(x.closest('[data-al]').dataset.al); if (a){ a.label = x.value.slice(0, 40); clearTimeout(x._t); x._t = setTimeout(alSave, 400); } } });

  // ---------- the Alarms widget (it was the Music alarm) ----------
  T.alarm = { name:'Alarms', icon:'alarm', kind:'box', zones:['home','page','player'], w:'full', desc:'Your next alarm and quick on / off switches. Alarms live in the Pendulum tab',
    fields:[['n','Show','seg',[['0','Next alarm only'],['','3 alarms'],['6','6 alarms']]],['card','On a card','toggle',true]],
    render:function(o){ return card(cardOn(o), '<div class="pw-alw" data-pw-live="alarm" data-n="' + (o.n === '0' ? 0 : +o.n || 3) + '"></div>'); },
    live:function(el){
      var nx = alSoonest(), n = +el.dataset.n, ra = RING && alById(RING.id);
      var sig = JSON.stringify([AL, !!ra, Math.floor(Date.now() / 30000)]); if (el._sig === sig) return; el._sig = sig;
      var h = '<div class="pw-alw-h"><div><b class="pw-alw-t">' + (nx ? esc(fmtTime(nx.a.time)) : 'No alarm') + '</b><small>' + (nx ? esc((nx.a.label || 'Alarm') + ' · in ' + fmtIn(nx.at - Date.now())) : 'Set one in the Pendulum tab') + '</small></div>' +
        '<button type="button" class="pw-po-open" data-pw-act="alarms" aria-label="Open the alarms">' + svg('chevr') + '</button></div>';
      if (ra) h += '<div class="pw-sw-b"><button type="button" data-ppa="snooze">Snooze</button><button type="button" class="on" data-ppa="stop">Stop</button></div>';
      if (n) h += AL.slice().sort(function(x, y){ return String(x.time).localeCompare(String(y.time)); }).slice(0, n).map(function(a){
        return '<div class="pw-alw-r" data-al="' + esc(a.id) + '"><span><b>' + esc(fmtTime(a.time)) + '</b><small>' + esc((a.label ? a.label + ' · ' : '') + daysText(a.days)) + '</small></span><button type="button" class="pw-al-sw" role="switch" aria-checked="' + !!a.on + '" data-ppa="tog" aria-label="Alarm on or off"><i></i></button></div>'; }).join('');
      el.innerHTML = h;
    } };

  // ---------- moving the old Music alarm widgets' alarms over (once) ----------
  setTimeout(function(){
    try {
      if (localStorage.getItem('ppAlarmsMoved')) return; localStorage.setItem('ppAlarmsMoved', '1');
      var old = kept(ALARM_KEY), found = [];
      var walk = function(arr){ (arr || []).forEach(function(it){ if (it.type === 'alarm') found.push(it); if (it.kids) walk(it.kids); }); };
      Object.keys(L.zones || {}).forEach(function(z){ walk(L.zones[z]); });
      found.forEach(function(it){
        var o = it.o || {}, s = old[it.id] || {};
        if (!s.on && !o.time) return;   // a widget never set up: nothing to move
        AL.push({ id: 'a' + uid(), on: !!s.on, time: o.time || '07:30', days: o.days === 'wk' ? [1, 2, 3, 4, 5] : o.days === 'we' ? [0, 6] : [0, 1, 2, 3, 4, 5, 6],
          label: '', music: o.pl || '', fade: o.fade == null || o.fade === '' ? 1 : +o.fade, snooze: 9, pomo: false, last: Date.now() });
      });
      if (found.length) alSave();
    } catch(e){}
  }, 0);

  // ===================== alarm sounds =====================
  // Made on the spot with Web Audio (nothing to download), each a pattern that repeats until the alarm is stopped:
  // classic alarm-clock beeps, a digital watch, an old mechanical bell, a buzzer, gentle chimes and a soft sunrise sweep.
  // "Gets louder" starts them at a quarter of full volume and rises over half a minute. On Android, "The phone's alarm
  // sound" rings the phone's own alarm ringtone through the Alarms notification channel (NotifyPlugin.show, kind alarm).
  var TONES = [['classic', 'Classic beeps'], ['digital', 'Digital watch'], ['bell', 'Old bell'], ['buzzer', 'Buzzer'], ['chimes', 'Gentle chimes'], ['rise', 'Sunrise (soft)']];
  function toneName(k){ if (k === 'phone') return phoneTone() ? 'The phone’s alarm sound' : 'Classic beeps'; var t = TONES.filter(function(x){ return x[0] === k; })[0]; return t ? t[1] : 'Classic beeps'; }
  function phoneTone(){ var N = window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.PPNotify; return !!(N && N.show && N.dismiss); }
  var toneNow = null;
  var TONE_PAT = {
    // [period in s, function(ctx, out, t) that schedules one round from time t]
    classic: [1.4, function(c, out, t){ for (var k = 0; k < 4; k++) beep(c, out, t + k * 0.2, 0.1, 'square', 1000, 0.5); }],
    digital: [1.0, function(c, out, t){ [0, 0.14, 0.42, 0.56].forEach(function(d){ beep(c, out, t + d, 0.07, 'square', 2600, 0.35); }); }],
    buzzer: [1.0, function(c, out, t){ beep(c, out, t, 0.6, 'sawtooth', 220, 0.45); beep(c, out, t, 0.6, 'sawtooth', 233, 0.35); }],
    bell: [3.0, function(c, out, t){
      // a hammer striking a bell eighteen times a second for two seconds
      for (var k = 0; k < 36; k++) [2350, 3720, 5150].forEach(function(f, j){ beep(c, out, t + k / 18, 0.05, 'sine', f * (1 + (k % 2) * 0.004), [0.5, 0.25, 0.12][j], 0.002); });
    }],
    chimes: [2.6, function(c, out, t){ [1046.5, 1318.5, 1568, 2093].forEach(function(f, k){ beep(c, out, t + k * 0.28, 1.3, 'sine', f, 0.4, 0.004, true); beep(c, out, t + k * 0.28, 0.9, 'sine', f * 2.01, 0.06, 0.004, true); }); }],
    rise: [2.6, function(c, out, t){
      var o = c.createOscillator(), g = c.createGain(), lfo = c.createOscillator(), lg = c.createGain();
      o.type = 'sine'; o.frequency.setValueAtTime(420, t); o.frequency.exponentialRampToValueAtTime(880, t + 2.1);
      lfo.frequency.value = 6; lg.gain.value = 0.12; lfo.connect(lg); lg.connect(g.gain);
      g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.45, t + 1.8); g.gain.linearRampToValueAtTime(0.0001, t + 2.3);
      o.connect(g); g.connect(out); o.start(t); o.stop(t + 2.4); lfo.start(t); lfo.stop(t + 2.4);
    }]
  };
  function beep(c, out, t, dur, type, f, peak, att, ring){
    var o = c.createOscillator(), g = c.createGain(); o.type = type; o.frequency.value = f;
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + (att || 0.005));
    if (ring) g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    else { g.gain.setValueAtTime(peak, t + dur - 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + dur); }
    o.connect(g); g.connect(out); o.start(t); o.stop(t + dur + 0.02);
  }
  function tonePlay(key, o){
    toneStop(); o = o || {};
    if (key === 'phone' && phoneTone()){
      var N = window.Capacitor.Plugins.PPNotify, id = 'ring_' + (o.id || 'x');
      N.show({ id: id, title: '⏰ ' + (o.label || 'Alarm'), text: 'Tap to open Press Play.', kind: 'alarm' }).catch(function(){});
      toneNow = { phone: id, preview: !!o.preview }; return;
    }
    if (key === 'phone') key = 'classic';   // a preview, or no phone sound here: the classic beeps
    // on Android: the phone plays it, through the speaker or the headphones as chosen (see AlarmSound in JobsPlugin.kt)
    if (nativeSound()){
      var NT = toneNow = { native: true, preview: !!o.preview };
      soundWav(TONE_PAT[key] ? key : 'classic').then(function(w){
        if (toneNow !== NT || !w) return;
        nativeSound().playSound({ wav: w, loop: true, speaker: o.speaker !== false, louder: !!(o.louder || key === 'rise') }).catch(function(){});
      });
      return;
    }
    var c = sfxCtx(); if (!c) return;
    var pat = TONE_PAT[key] || TONE_PAT.classic, out = c.createGain(), comp = c.createDynamicsCompressor();
    out.connect(comp); comp.connect(c.destination);
    var full = 0.9, t0 = c.currentTime + 0.05;
    if (o.louder || key === 'rise'){ out.gain.setValueAtTime(full * 0.25, t0); out.gain.linearRampToValueAtTime(full, t0 + 30); } else out.gain.value = full;
    var next = t0, T = toneNow = { out: out, preview: !!o.preview };
    var tick = function(){
      if (toneNow !== T) return;
      while (next < c.currentTime + 0.4){ pat[1](c, out, next); next += pat[0]; }
      T.timer = setTimeout(tick, 150);
    };
    tick();
  }
  function toneStop(){
    var T = toneNow; toneNow = null; if (!T) return;
    if (T.phone){ var N = window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.PPNotify; if (N && N.dismiss) N.dismiss({ id: T.phone }).catch(function(){}); return; }
    if (T.native){ var NS = nativeSound(); if (NS) NS.stopSound().catch(function(){}); return; }
    clearTimeout(T.timer);
    try { var c = sfxCtx(); T.out.gain.cancelScheduledValues(c.currentTime); T.out.gain.setValueAtTime(T.out.gain.value, c.currentTime); T.out.gain.linearRampToValueAtTime(0, c.currentTime + 0.05); setTimeout(function(){ try { T.out.disconnect(); } catch(e){} }, 120); } catch(e){}
  }

  // ---------- the sounds as WAV files, for the phone to play ----------
  // Each tone is rendered once (a few rounds of its pattern, so it loops seamlessly) with an OfflineAudioContext.
  function nativeSound(){ var N = window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.PPNotify; return N && N.playSound && N.stopSound ? N : null; }
  var wavCache = {};
  function soundWav(key){
    if (wavCache[key]) return wavCache[key];
    var OAC = window.OfflineAudioContext || window.webkitOfflineAudioContext; if (!OAC) return Promise.resolve(null);
    var chime = key.indexOf('chime-') === 0, pat = TONE_PAT[key];
    var sr = 32000, secs = chime ? 2 : pat[0] * Math.max(1, Math.ceil(5 / pat[0]));
    var c = new OAC(1, Math.round(sr * secs), sr), out = c.createGain(), comp = c.createDynamicsCompressor();
    out.gain.value = chime ? 1 : 0.9; out.connect(comp); comp.connect(c.destination);
    if (chime) chimeAt(c, out, 0.02, key === 'chime-down' ? 'focus' : 'short');
    else for (var t = 0; t < secs - 0.001; t += pat[0]) pat[1](c, out, t);
    wavCache[key] = c.startRendering().then(function(buf){ return wavBase64(buf.getChannelData(0), sr); }).catch(function(){ delete wavCache[key]; return null; });
    return wavCache[key];
  }
  function wavBase64(x, sr){
    var n = x.length, b = new Uint8Array(44 + n * 2), v = new DataView(b.buffer);
    var w = function(o, s){ for (var i = 0; i < s.length; i++) b[o + i] = s.charCodeAt(i); };
    w(0, 'RIFF'); v.setUint32(4, 36 + n * 2, true); w(8, 'WAVE'); w(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
    v.setUint32(24, sr, true); v.setUint32(28, sr * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true); w(36, 'data'); v.setUint32(40, n * 2, true);
    for (var i = 0; i < n; i++) v.setInt16(44 + i * 2, Math.max(-1, Math.min(1, x[i])) * 32767, true);
    var s = '', CH = 0x8000; for (i = 0; i < b.length; i += CH) s += String.fromCharCode.apply(null, b.subarray(i, i + CH));
    return btoa(s);
  }

  // ===================== the ringing screen =====================
  // A full screen that comes up when an alarm goes off or a Pomodoro phase ends (each can be switched off; both are on
  // to start with). It is a blank slate: a background (a preset, the cover of what is playing, or your own picture) and
  // what it needs (Snooze and Stop, or the next Pomodoro step), plus whatever widgets you put on it. Its widgets are the
  // layout zone 'ring', edited like a page (Edit what's on it); its settings are kept in 'ppRingV1'.
  var RS_KEY = 'ppRingV1', RS_IMG_KEY = 'ppRingImgV1';
  var RS = (function(){ var r = {}; try { r = JSON.parse(localStorage.getItem(RS_KEY)) || {}; } catch(e){} return Object.assign({ alarm: true, pomo: true, bg: 'sunrise', dim: 20 }, r); })();
  function rsSave(){ try { localStorage.setItem(RS_KEY, JSON.stringify(RS)); } catch(e){} }
  function rsImg(){ try { return localStorage.getItem(RS_IMG_KEY) || ''; } catch(e){ return ''; } }
  var RS_BGS = [['sunrise', 'Sunrise'], ['night', 'Night sky'], ['aurora', 'Aurora'], ['ocean', 'Ocean'], ['ember', 'Ember'], ['theme', 'Theme colour'], ['plain', 'Plain'], ['cover', 'Cover art'], ['custom', 'Your picture']];
  var ringEl = document.createElement('div'); ringEl.id = 'pp-ringscreen'; ringEl.hidden = true; ringEl.setAttribute('role', 'dialog'); ringEl.setAttribute('aria-modal', 'true');
  body.appendChild(ringEl);
  var RSNOW = null;   // { kind: 'alarm' | 'pomo' | 'preview', next }
  function rsOn(){ return !ringEl.hidden; }
  function rsShow(kind, info){
    RSNOW = Object.assign({ kind: kind }, info || {});
    ringEl.hidden = false; body.classList.add('pp-ring-open');
    rsRender();
  }
  function rsHide(kind){
    if (kind && (!RSNOW || RSNOW.kind !== kind)) return;
    if (editing === 'ring') return;      // still being edited: Done closes it
    RSNOW = null; ringEl.hidden = true; body.classList.remove('pp-ring-open'); ringEl.innerHTML = '';
  }
  function rsBgHTML(){
    var bg = RS.bg, st = '';
    if (bg === 'custom'){ var im = rsImg(); if (im) st = ' style="background-image:url(&quot;' + esc(im) + '&quot;)"'; else bg = 'sunrise'; }
    if (bg === 'cover'){ var t = liveState(), s = t.has ? thumbOf(t.t) : null; if (s) st = ' style="background-image:url(&quot;' + esc(s) + '&quot;)"'; else bg = 'night'; }
    return '<div class="prs-bg prs-bg-' + bg + '"' + st + '><i></i><i></i><i></i></div><div class="prs-dim" style="opacity:' + (Math.max(0, Math.min(80, +RS.dim || 0)) / 100) + '"></div>';
  }
  function rsRender(){
    if (!RSNOW) return;
    var k = RSNOW.kind, ed = editing === 'ring', a = k === 'alarm' && RING ? alById(RING.id) : null, top = '', act = '';
    if (k === 'alarm' && a){
      top = '<div class="prs-tag">' + svg('alarm') + '<b>' + esc(a.label || 'Alarm') + '</b><span>' + esc(fmtTime(a.time)) + '</span></div>';
      act = '<button type="button" data-prs="snooze">Snooze ' + (+a.snooze || 9) + ' min</button><button type="button" class="on" data-prs="stop">' + (a.pomo ? 'Stop and focus' : 'Stop') + '</button>';
    } else if (k === 'pomo'){
      var nx = PO.ph, word = nx === 'focus' ? 'Break over' : 'Focus done';
      top = '<div class="prs-tag prs-tag-po">' + svg('tomato') + '<b>' + word + '</b><span class="prs-po-t"></span></div>';
      act = PO.run ? '<button type="button" data-prs="skip">' + (nx === 'focus' ? 'Skip focus' : 'Skip the break') + '</button><button type="button" class="on" data-prs="close">Got it</button>'
                   : '<button type="button" data-prs="close">Not now</button><button type="button" class="on" data-prs="go">' + (nx === 'focus' ? 'Start focus' : 'Start the break') + '</button>';
    } else {
      top = '<div class="prs-tag">' + svg('eye') + '<b>Preview</b><span>The ringing screen</span></div>';
      act = ed ? '' : '<button type="button" data-prs="edit">' + svg('grid') + 'Edit what’s on it</button><button type="button" class="on" data-prs="close">Close</button>';
    }
    var items0 = zoneItems('ring', false) || [], empty = !items0.length;
    ringEl.innerHTML = rsBgHTML() + '<div class="prs-in">' + top +
      '<div class="prs-zone">' + renderZone('ring', null) + (empty && (k === 'preview' || ed) && !ed ? '<div class="prs-empty">' + svg('grid') + '<b>A blank slate</b><span>Put a clock, the date, pictures, Bloopy or anything else here with Edit what’s on it.</span></div>' : '') + '</div>' +
      '<div class="prs-act">' + act + '</div></div>';
    ringEl.scrollTop = 0;   // it never scrolls as a whole (only its middle does)
    startTick(); liveSoon(); rsTick();
  }
  function rsTick(){
    if (!RSNOW || RSNOW.kind !== 'pomo') return;
    var t = ringEl.querySelector('.prs-po-t'); if (t) setText(t, PO_NAME[PO.ph] + ' · ' + fmtClock(poLeft()) + (PO.run ? '' : ' (not started)'));
  }
  setInterval(rsTick, 1000);
  ringEl.addEventListener('click', function(e){
    var b = e.target.closest('[data-prs]'); if (!b || editing) return;
    var op = b.dataset.prs;
    if (op === 'snooze' || op === 'stop'){ alStop(op === 'snooze'); return; }
    if (op === 'close'){ rsHide(); return; }
    if (op === 'skip'){ poDo('skip'); rsHide(); return; }
    if (op === 'go'){ poDo('go'); rsHide(); return; }
    if (op === 'edit'){ startEdit('ring'); return; }
  });
  // the alarm and the Pomodoro bring it up (when it is switched on for them)
  (function(){
    var ring0 = alRing;
    alRing = function(a, at){
      ring0(a, at);
      if (RS.alarm && !document.hidden) rsShow('alarm');
    };
    var stop0 = alStop;
    alStop = function(snooze){ stop0(snooze); rsHide('alarm'); };
    var alert0 = poAlert;
    poAlert = function(next, done){ alert0(next, done); if (RS.pomo && !document.hidden && !(RSNOW && RSNOW.kind === 'alarm')) rsShow('pomo', { next: next }); };
  })();
  // coming back to the app while an alarm rings: the screen is waiting
  document.addEventListener('visibilitychange', function(){ if (!document.hidden && RING && RS.alarm && !rsOn()) rsShow('alarm'); });

  // ---------- its settings, in both parts of the Pendulum tab ----------
  function rsCardHTML(){
    var im = rsImg();
    return '<section class="ppp-card prs-card"><h2>' + svg('image') + 'Ringing screen</h2>' +
      '<p class="ppp-sub">A full screen when an alarm goes off or a Pomodoro round ends. It starts blank: put a clock, the date or anything else on it.</p>' +
      '<label class="ppp-tog"><span><b>When an alarm goes off</b></span><input type="checkbox" data-prs-set="alarm"' + (RS.alarm ? ' checked' : '') + '></label>' +
      '<label class="ppp-tog"><span><b>When a Pomodoro round ends</b></span><input type="checkbox" data-prs-set="pomo"' + (RS.pomo ? ' checked' : '') + '></label>' +
      '<div class="ppp-f"><span>Background</span><div class="prs-bgs">' + RS_BGS.map(function(x){
        var sty = x[0] === 'custom' && im ? ' style="background-image:url(&quot;' + esc(im) + '&quot;)"' : '';
        return '<button type="button" class="prs-sw prs-bg-' + x[0] + (RS.bg === x[0] ? ' on' : '') + '" data-prs-bg="' + x[0] + '"' + sty + '><span>' + x[1] + '</span></button>'; }).join('') + '</div>' +
        '</div>' +
      (RS.bg === 'custom' ? '<div class="ppp-f"><button type="button" class="ppp-link" data-prs-pick="1">' + (im ? 'Change the picture' : 'Choose a picture') + '</button></div>' : '') +
      '<div class="ppp-f"><span>Darken it</span><div class="pw-range"><input type="range" min="0" max="80" step="5" value="' + (+RS.dim || 0) + '" data-prs-set="dim"><output>' + (+RS.dim || 0) + '%</output></div></div>' +
      '<div class="ppa-ed-b"><button type="button" data-prs-do="preview">' + svg('eye') + 'Preview</button><button type="button" class="on" data-prs-do="edit">' + svg('grid') + 'Edit what’s on it</button></div></section>';
  }
  (function(){
    var a0 = alarmsSection; alarmsSection = function(el){ a0(el); el.insertAdjacentHTML('beforeend', rsCardHTML()); };
    var p0 = pomoSection; pomoSection = function(el){ p0(el); var c = el.querySelector('.ppp'); (c || el).insertAdjacentHTML('beforeend', rsCardHTML()); };
  })();
  function rsCardRefresh(){ var c = pageEl.querySelector('.prs-card'); if (c){ var y = pageEl.scrollTop; c.outerHTML = rsCardHTML(); pageEl.scrollTop = y; } }
  document.addEventListener('change', function(e){
    var x = e.target; if (!x.dataset || !x.dataset.prsSet || x.type !== 'checkbox') return;
    RS[x.dataset.prsSet] = x.checked; rsSave();
  });
  document.addEventListener('input', function(e){
    var x = e.target; if (!x.dataset || x.dataset.prsSet !== 'dim') return;
    RS.dim = +x.value; x.nextElementSibling.textContent = x.value + '%'; rsSave();
    if (rsOn()){ var d = ringEl.querySelector('.prs-dim'); if (d) d.style.opacity = RS.dim / 100; }
  });
  document.addEventListener('click', function(e){
    var b = e.target.closest && e.target.closest('[data-prs-bg], [data-prs-do], [data-prs-pick]'); if (!b || editing) return;
    if (b.dataset.prsBg){
      if (b.dataset.prsBg === 'custom' && !rsImg()){ rsFile.click(); return; }   // set once the picture is chosen
      RS.bg = b.dataset.prsBg; rsSave();
      rsCardRefresh(); if (rsOn()) rsRender(); return;
    }
    if (b.dataset.prsPick){ rsFile.click(); return; }
    if (b.dataset.prsDo === 'preview') rsShow('preview');
    else if (b.dataset.prsDo === 'edit'){ rsShow('preview'); startEdit('ring'); }
  });
  // one picker for the picture, kept on the page (the settings card is drawn again while it is open)
  var rsFile = document.createElement('input'); rsFile.type = 'file'; rsFile.accept = 'image/*'; rsFile.hidden = true; body.appendChild(rsFile);
  rsFile.addEventListener('change', function(){
    var f = rsFile; if (!f.files || !f.files[0]) return;
    shrinkImage(f.files[0], function(url){
      f.value = '';
      try { localStorage.setItem(RS_IMG_KEY, url); } catch(x){ toast('That picture is too big to keep. Try a smaller one.'); return; }
      RS.bg = 'custom'; rsSave(); rsCardRefresh(); if (rsOn()) rsRender(); toast('Picture set for the ringing screen.');
    });
  });
