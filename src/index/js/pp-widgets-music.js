  // ===================== music widgets: memories, moods, stems and singing =====================
  // On this day, Song of the day, Listening recap, Mood dial, Stem mixer and Sing-along.

  // ---------- a day-by-day play log ----------
  // The portfolio keeps play counts per song but not per day, and Home's history only keeps the last 60 songs, so
  // "On this day" and the weekly / monthly recap need their own log: { 'Y-M-D': { dbId: plays } }, about 400 days of it.
  var LOG_KEY = 'ppPlayLogV1';
  function dayKey(d){ return d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate(); }
  function playLog(){ try { return JSON.parse(localStorage.getItem(LOG_KEY)) || {}; } catch(e){ return {}; } }
  (function(){
    var prev = window.__ppOnPlay;
    window.__ppOnPlay = function(t){
      try {
        if (t && t.dbId && !t.stem){
          var log = playLog(), k = dayKey(new Date()), day = log[k] = log[k] || {};
          day[t.dbId] = (day[t.dbId] || 0) + 1;
          var keys = Object.keys(log);
          if (keys.length > 420) keys.sort(function(a, b){ return dayNum(a) - dayNum(b); }).slice(0, keys.length - 400).forEach(function(x){ delete log[x]; });
          localStorage.setItem(LOG_KEY, JSON.stringify(log));
        }
      } catch(e){}
      if (prev) return prev.apply(this, arguments);
    };
  })();
  function dayNum(k){ var p = k.split('-'); return Math.round(Date.UTC(+p[0], +p[1] - 1, +p[2]) / 864e5); }
  function portfolio(){ try { return JSON.parse(localStorage.getItem('pppSaveV1')) || {}; } catch(e){ return {}; } }
  function byDbId(){ var A = api(), m = new Map(); if (A) A.tracks().forEach(function(x, i){ if (!x.stem) m.set(String(x.dbId), i); }); return m; }
  function trackAt(i){ var A = api(); return A ? A.tracks()[i] : null; }
  function playOne(i, q){ var K = kit(); if (!K || i == null) return; K.playFrom(i, q && q.length ? q : [i]); }
  function artOf(t, icon){ return artHTML(t, icon); }
  function plural(n, w, ws){ return n + ' ' + (n === 1 ? w : (ws || w + 's')); }
  function monthsAgoLabel(days){
    if (days >= 360) { var y = Math.round(days / 365); return y === 1 ? 'A year ago today' : y + ' years ago today'; }
    if (days >= 28){ var m = Math.round(days / 30.4); return m === 1 ? 'A month ago today' : m + ' months ago today'; }
    return days === 7 ? 'A week ago today' : days + ' days ago';
  }
  // A track row that plays when tapped: cover, title, a line under it.
  function songRow(i, sub, act){
    var t = trackAt(i); if (!t) return '';
    return '<button type="button" class="pw-song" data-pw-play="' + i + '"' + (act ? ' data-pw-q="' + esc(act) + '"' : '') + '>' + artOf(t) +
      '<span class="pw-song-t"><b>' + esc(t.title) + '</b><small>' + esc(sub || t.artist || '') + '</small></span><i class="pw-song-p">' + svg('play') + '</i></button>';
  }
  document.addEventListener('click', function(e){
    var b = e.target.closest && e.target.closest('[data-pw-play]'); if (!b || editing) return;
    var q = b.dataset.pwQ ? b.dataset.pwQ.split(',').map(Number) : null;
    playOne(+b.dataset.pwPlay, q);
  });

  // ---------- On this day ----------
  var ANNIV = [365 * 3, 365 * 2, 365, 182, 91, 30, 7];
  T.onthisday = { name:'On this day', icon:'history', kind:'box', zones:['home','page','player'], w:'full', desc:'What you played a week, a month or a year ago today',
    fields:[['n','Show up to','seg',[['1','1 song'],['','3 songs'],['5','5 songs']]],['hide','Hide when there is nothing from this day','toggle',false],['card','On a card','toggle',true]],
    render:function(o){ return card(cardOn(o), '<div class="pw-otd" data-pw-live="onthisday" data-n="' + (+o.n || 3) + '" data-hide="' + (o.hide ? 1 : 0) + '"></div>'); },
    live:function(el, st){
      var sig = dayKey(st.now) + '|' + (api() ? api().tracks().length : 0); if (el._sig === sig) return; el._sig = sig;
      var log = playLog(), map = byDbId(), today = dayNum(dayKey(st.now)), found = null;
      // the longest-ago anniversary that has something on it
      for (var a = 0; a < ANNIV.length && !found; a++){
        var d = new Date(st.now); d.setDate(d.getDate() - ANNIV[a]);
        var day = log[dayKey(d)];
        if (day){ var ids = Object.keys(day).filter(function(id){ return map.has(id); }).sort(function(x, y){ return day[y] - day[x]; }); if (ids.length) found = { days: ANNIV[a], ids: ids }; }
      }
      // before the log has a week in it: songs whose last play fell on an anniversary
      if (!found){
        var tp = portfolio().trackPlays || {};
        ANNIV.some(function(n){
          var ids = Object.keys(tp).filter(function(id){ return map.has(id) && tp[id].lastPlayed && today - dayNum(dayKey(new Date(tp[id].lastPlayed))) === n; });
          if (ids.length){ found = { days: n, ids: ids }; return true; } return false;
        });
      }
      var max = +el.dataset.n || 3;
      liveHide(el, el.dataset.hide === '1' && !found);
      if (!found){ el.innerHTML = '<div class="pw-wh"><span class="pw-wh-t">On this day</span></div><p class="pw-otd-e">Nothing from this day yet. Keep listening: a week from now this shows what you played today.</p>'; return; }
      var idx = found.ids.slice(0, max).map(function(id){ return map.get(id); }), q = idx.join(',');
      el.innerHTML = '<div class="pw-wh"><span class="pw-wh-t">' + esc(monthsAgoLabel(found.days)) + '</span><span>' + esc(new Date(Date.now() - found.days * 864e5).toLocaleDateString(undefined, { day:'numeric', month:'short', year: found.days >= 300 ? 'numeric' : undefined })) + '</span></div>' +
        idx.map(function(i){ var t = trackAt(i), n = (log[dayKey(new Date(Date.now() - found.days * 864e5))] || {})[t.dbId]; return songRow(i, (t.artist && t.artist !== 'Unknown artist' ? t.artist + ' · ' : '') + (n ? plural(n, 'play') + ' that day' : 'played that day'), q); }).join('');
    } };

  // ---------- Song of the day ----------
  // One song a day you have not played for a while (a favourite gone quiet first), the same all day. Skip picks another.
  var SOTD_KEY = 'ppSongOfDayV1';
  function sotdPick(skip){
    var A = api(); if (!A) return null;
    var t = A.tracks(), tp = portfolio().trackPlays || {}, now = Date.now(), k = dayKey(new Date()), saved = {};
    try { saved = JSON.parse(localStorage.getItem(SOTD_KEY)) || {}; } catch(e){}
    if (saved.d !== k) saved = { d: k, seen: [] };
    var cur = saved.id != null ? byDbId().get(String(saved.id)) : null;
    if (!skip && cur != null) return { i: cur, why: saved.why };
    var pool = playable().filter(function(i){ return t[i].kind !== 'video' && saved.seen.indexOf(String(t[i].dbId)) < 0; }), why = '';
    var quiet = pool.filter(function(i){ var p = tp[t[i].dbId]; return p && p.count >= 2 && now - (p.lastPlayed || 0) > 21 * 864e5; })
      .sort(function(a, b){ return tp[t[b].dbId].count - tp[t[a].dbId].count; }).slice(0, 25);
    var fresh = pool.filter(function(i){ return !tp[t[i].dbId]; });
    var from = quiet.length ? quiet : fresh.length ? fresh : pool;
    if (!from.length){ saved.seen = []; from = playable().filter(function(i){ return t[i].kind !== 'video'; }); }
    if (!from.length) return null;
    var i = from[Math.floor(Math.random() * from.length)], p = tp[t[i].dbId];
    why = from === quiet ? 'You played it ' + plural(p.count, 'time') + ', last on ' + new Date(p.lastPlayed).toLocaleDateString(undefined, { day:'numeric', month:'short' }) + '.'
        : from === fresh ? 'You have never played this one.' : 'A pick from your library.';
    saved.id = String(t[i].dbId); saved.why = why; saved.seen.push(saved.id);
    try { localStorage.setItem(SOTD_KEY, JSON.stringify(saved)); } catch(e){ if (typeof ppCaught === "function") ppCaught(e); }
    return { i: i, why: why };
  }
  T.sotd = { name:'Song of the day', icon:'sparkle', kind:'box', zones:['home','page','player'], w:'full', desc:'One song a day you have not played in a while',
    fields:[['look','Look','seg',[['','Card'],['big','Big cover']]],['card','On a card','toggle',true]],
    render:function(o){ return card(cardOn(o), '<div class="pw-sotd' + (o.look === 'big' ? ' pw-sotd-big' : '') + '" data-pw-live="sotd"></div>'); },
    live:function(el, st, force){
      var sig = dayKey(st.now) + '|' + (api() ? api().tracks().length : 0); if (el._sig === sig && !force) return; el._sig = sig;
      var p = sotdPick(force === 'skip');
      if (!p){ el.innerHTML = '<div class="pw-wh"><span class="pw-wh-t">Song of the day</span></div><p class="pw-otd-e">Add some music from the Library tab.</p>'; return; }
      var t = trackAt(p.i);
      el.innerHTML = '<div class="pw-wh"><span class="pw-wh-t">Song of the day</span><span>' + esc(st.now.toLocaleDateString(undefined, { weekday:'short', day:'numeric', month:'short' })) + '</span></div>' +
        '<div class="pw-sotd-m"><button type="button" class="pw-sotd-art" data-pw-play="' + p.i + '" aria-label="Play">' + artOf(t) + '<i>' + svg('play') + '</i></button>' +
        '<div class="pw-sotd-t"><b>' + esc(t.title) + '</b><small>' + esc(t.artist && t.artist !== 'Unknown artist' ? t.artist : '') + '</small><p>' + esc(p.why) + '</p>' +
        '<div class="pw-sotd-b"><button type="button" data-pw-play="' + p.i + '">' + svg('play') + 'Play</button><button type="button" data-pw-sotd="skip">Another</button></div></div></div>';
    } };
  document.addEventListener('click', function(e){
    var b = e.target.closest && e.target.closest('[data-pw-sotd]'); if (!b || editing) return;
    var st = liveState(); document.querySelectorAll('[data-pw-live="sotd"]').forEach(function(el, n){ T.sotd.live(el, st, n ? 'redraw' : 'skip'); });
  });

  // ---------- Listening recap ----------
  // This week, this month or all time, one fact at a time: tap it for the next.
  T.recap = { name:'Listening recap', icon:'trophy', kind:'box', zones:['home','page','player'], w:'full', desc:'Your week, month or all time: hours, top song, top artist, streak. Tap for the next',
    fields:[['of','For','seg',[['week','This week'],['','This month'],['all','All time']]],['card','On a card','toggle',true]],
    render:function(o, c, ctx, it){ return card(cardOn(o), '<div class="pw-rc" data-pw-live="recap" data-id="' + esc(it ? it.id : 'x') + '" data-of="' + esc(o.of || 'month') + '" role="button" tabindex="0" aria-label="Next fact"></div>'); },
    live:function(el, st){
      var facts = recapFacts(el.dataset.of, st.now), mem = fdMem('rc:' + el.dataset.id, { i: 0 }), i = mem.i % facts.length, f = facts[i];
      var sig = i + '|' + JSON.stringify(f); if (el._sig === sig) return; el._sig = sig;
      el.innerHTML = '<div class="pw-wh"><span class="pw-wh-t">' + esc({ week:'This week', month:'This month', all:'All time' }[el.dataset.of] || 'This month') + '</span><span class="pw-rc-dots">' +
        facts.map(function(x, j){ return '<i' + (j === i ? ' class="on"' : '') + '></i>'; }).join('') + '</span></div>' +
        '<div class="pw-rc-f">' + (f.i != null ? artOf(trackAt(f.i)) : '<span class="pw-rc-ic">' + svg(f.icon) + '</span>') + '<div><small>' + esc(f.label) + '</small><b>' + esc(f.value) + '</b>' + (f.sub ? '<span>' + esc(f.sub) + '</span>' : '') + '</div></div>';
    } };
  function recapFacts(of, now){
    var pf = portfolio(), x = pf.x || {}, map = byDbId(), log = playLog(), plays = {}, ms = 0, start;
    if (of === 'all'){
      ms = pf.totalListenMs || 0;
      Object.keys(pf.trackPlays || {}).forEach(function(id){ plays[id] = pf.trackPlays[id].count || 0; });
    } else {
      start = new Date(now); start.setHours(0, 0, 0, 0);
      if (of === 'week') start.setDate(start.getDate() - (start.getDay() + 6) % 7); else start.setDate(1);
      var s0 = dayNum(dayKey(start));
      Object.keys(x.dayMs || {}).forEach(function(k){ if (dayNum(k) >= s0) ms += x.dayMs[k]; });
      Object.keys(log).forEach(function(k){ if (dayNum(k) >= s0) Object.keys(log[k]).forEach(function(id){ plays[id] = (plays[id] || 0) + log[k][id]; }); });
    }
    var ids = Object.keys(plays).filter(function(id){ return plays[id] > 0; }), total = ids.reduce(function(s, id){ return s + plays[id]; }, 0);
    var top = ids.filter(function(id){ return map.has(id); }).sort(function(a, b){ return plays[b] - plays[a]; })[0];
    var arts = {}; ids.forEach(function(id){ var i = map.get(id), t = i != null ? trackAt(i) : null, a = t ? t.artist : (pf.trackPlays && pf.trackPlays[id] || {}).artist; if (a && a !== 'Unknown artist' && a !== 'Video') arts[a] = (arts[a] || 0) + plays[id]; });
    var topA = Object.keys(arts).sort(function(a, b){ return arts[b] - arts[a]; })[0];
    // streak: days in a row (ending today or yesterday) with any listening
    var days = {}; Object.keys(x.dayMs || {}).forEach(function(k){ if (x.dayMs[k] > 60000) days[dayNum(k)] = 1; });
    var d = dayNum(dayKey(now)), streak = 0; if (!days[d]) d--; while (days[d]){ streak++; d--; }
    var hrs = ms / 3600000, f = [];
    f.push({ icon:'headphones', label:'Listening time', value: hrs >= 1 ? (hrs < 10 ? hrs.toFixed(1) : Math.round(hrs)) + ' hours' : Math.round(ms / 60000) + ' minutes', sub: total ? plural(total, 'play') : '' });
    if (top) f.push({ i: map.get(top), label:'Top song', value: trackAt(map.get(top)).title, sub: plural(plays[top], 'play') });
    if (topA) f.push({ icon:'user', label:'Top artist', value: topA, sub: plural(arts[topA], 'play') });
    f.push({ icon:'fire', label:'Streak', value: plural(streak, 'day'), sub: streak ? 'in a row with music' : 'Play something today to start one' });
    if (ids.length > 1) f.push({ icon:'music', label:'Different songs', value: String(ids.length), sub: of === 'all' ? 'since you started' : 'so far' });
    return f;
  }
  document.addEventListener('click', function(e){
    var el = e.target.closest && e.target.closest('[data-pw-live="recap"]'); if (!el || editing) return;
    var mem = fdMem('rc:' + el.dataset.id, { i: 0 }); mem.i++;
    T.recap.live(el, liveState());
    var f = el.querySelector('.pw-rc-f'); if (f){ f.classList.remove('pw-rc-in'); void f.offsetWidth; f.classList.add('pw-rc-in'); }
  });

  // ---------- Mood dial ----------
  // Turn it from Sleepy to Hype and it plays songs of that energy, from the smart tags (tempo, and how danceable,
  // party, aggressive, happy or relaxed each song is). Songs are ranked by energy, so each stop gets a fair share.
  var MOODS = [['Sleepy','moon'],['Calm','wave'],['Easy','sun'],['Upbeat','music'],['Hype','fire']];
  function energyOf(c){
    if (!c) return null;
    var h = c.hd, bpm = c.bpm, be = bpm ? Math.max(0, Math.min(1, (bpm - 60) / 110)) : null, he = null;
    if (h && Object.keys(h).length) he = Math.max(0, Math.min(1, 0.32 + ((h.party || 0) * 0.35 + (h.danceable || 0) * 0.25 + (h.aggressive || 0) * 0.25 + (h.happy || 0) * 0.15 - (h.relaxed || 0) * 0.35 - (h.sad || 0) * 0.1) / 100));
    if (he == null && be == null) return null;
    return he == null ? be : be == null ? he : he * 0.55 + be * 0.45;
  }
  function moodQueue(stop){
    var V = window.PPVocals, tags = null; try { tags = V && V.loadTags ? V.loadTags() : null; } catch(e){ if (typeof ppCaught === "function") ppCaught(e); }
    var A = api(); if (!A || !tags) return null;
    var t = A.tracks(), rated = [];
    playable().forEach(function(i){ var e = energyOf(tags[String(t[i].dbId)]); if (e != null && t[i].kind !== 'video') rated.push([i, e]); });
    if (rated.length < 5) return null;
    rated.sort(function(a, b){ return a[1] - b[1]; });
    var n = rated.length, mid = (stop + 0.5) / 5, half = Math.max(0.12, 3 / n);
    var pick = rated.filter(function(r, k){ return Math.abs((k + 0.5) / n - mid) <= half; }).map(function(r){ return r[0]; });
    return shuffled(pick).slice(0, 60);
  }
  T.mood = { name:'Mood dial', icon:'knob', kind:'box', zones:['home','page','player'], w:'full', desc:'Turn from Sleepy to Hype and it plays songs with that energy',
    fields:[['play','Plays when you let go','toggle',true],['color','Colour','color',''],['card','On a card','toggle',true]],
    render:function(o, c, ctx, it){
      var id = it ? it.id : 'x', m = fdMem('mood:' + id, { s: 2 });
      return card(cardOn(o), '<div class="pw-md" data-pw-live="mood" data-id="' + esc(id) + '" data-play="' + (o.play === false ? 0 : 1) + '"' + (okCol(o.color) ? ' style="--pw-fc:' + o.color + '"' : '') + '>' +
        '<div class="pw-md-dial"><div class="pw-md-knob" style="--a:' + (m.s * 45 - 90) + 'deg" role="slider" aria-label="Mood" aria-valuemin="0" aria-valuemax="4" aria-valuenow="' + m.s + '" tabindex="0"><i></i></div>' +
        MOODS.map(function(x, k){ var a = (k * 45 - 180) * Math.PI / 180; return '<button type="button" class="pw-md-st' + (k === m.s ? ' on' : '') + '" data-pw-mood="' + k + '" style="left:' + (50 + Math.cos(a) * 39).toFixed(1) + '%;top:' + (66 + Math.sin(a) * 60).toFixed(1) + '%">' + svg(x[1]) + '<span>' + x[0] + '</span></button>'; }).join('') +
        '</div><div class="pw-md-now"><b>' + MOODS[m.s][0] + '</b><button type="button" class="pw-md-go" data-pw-mood-go="1">' + svg('play') + 'Play</button></div></div>');
    },
    live:function(el){ if (!el._md) moodInit(el); } };
  function moodSet(el, s, go){
    var m = fdMem('mood:' + el.dataset.id, { s: 2 });
    if (s !== m.s){ m.s = s; try { if (navigator.vibrate) navigator.vibrate(6); } catch(x){} }
    el.querySelector('.pw-md-knob').style.setProperty('--a', (s * 45 - 90) + 'deg');
    el.querySelector('.pw-md-knob').setAttribute('aria-valuenow', s);
    el.querySelectorAll('.pw-md-st').forEach(function(b, k){ b.classList.toggle('on', k === s); });
    setText(el.querySelector('.pw-md-now b'), MOODS[s][0]);
    if (go) moodPlay(s);
  }
  function moodPlay(s){
    var q = moodQueue(s);
    if (!q){ toast('The mood dial needs smart tags: tag your songs in Bloopy’s stems menu (Smart tags). Shuffling everything for now.'); runAction('shuffleall'); return; }
    if (!q.length){ toast('No songs found for that mood.'); return; }
    var K = kit(); if (K) K.playFrom(q[0], q);
    toast(MOODS[s][0] + ': ' + plural(q.length, 'song') + '.');
  }
  function moodInit(el){
    el._md = true;
    var knob = el.querySelector('.pw-md-knob'), dial = el.querySelector('.pw-md-dial'), id = null, s0 = 0;
    knob.style.touchAction = 'none';
    function at(e){
      var r = knob.getBoundingClientRect(), a = Math.atan2(e.clientY - (r.top + r.height / 2), e.clientX - (r.left + r.width / 2)) * 180 / Math.PI;   // -180..180, up = -90
      if (a > 90) a -= 360;                         // below-left counts as the far left
      return Math.max(0, Math.min(4, Math.round((a + 180) / 45)));
    }
    knob.addEventListener('pointerdown', function(e){ if (editing) return; id = e.pointerId; s0 = fdMem('mood:' + el.dataset.id, { s: 2 }).s; try { knob.setPointerCapture(id); } catch(x){} e.preventDefault(); });
    knob.addEventListener('pointermove', function(e){ if (e.pointerId === id) moodSet(el, at(e), false); });
    var up = function(e){ if (e.pointerId !== id) return; id = null; var s = fdMem('mood:' + el.dataset.id, { s: 2 }).s; if (s !== s0 && el.dataset.play === '1') moodPlay(s); };
    knob.addEventListener('pointerup', up); knob.addEventListener('pointercancel', up);
    knob.addEventListener('touchstart', function(e){ e.ppNoTabSwipe = true; }, { passive: true });
    knob.addEventListener('keydown', function(e){ var s = fdMem('mood:' + el.dataset.id, { s: 2 }).s; if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') moodSet(el, Math.max(0, s - 1)); if (e.key === 'ArrowRight' || e.key === 'ArrowUp') moodSet(el, Math.min(4, s + 1)); if (e.key === 'Enter') moodPlay(s); });
    dial.addEventListener('click', function(e){ var b = e.target.closest('[data-pw-mood]'); if (b && !editing) moodSet(el, +b.dataset.pwMood, el.dataset.play === '1'); });
    el.querySelector('[data-pw-mood-go]').addEventListener('click', function(){ if (!editing) moodPlay(fdMem('mood:' + el.dataset.id, { s: 2 }).s); });
  }

  // ---------- stems: playing a split song's parts together ----------
  // Each stem plays in its own audio element (streamed, so a long song does not fill the memory), with its own volume.
  // The song itself pauses while the stems play, and carries on from the same spot when you go back to it.
  var ROLES = [['vocals','Vocals','chat'],['drums','Drums','grid'],['bass','Bass','wave'],['other','Music','music']];
  function stemRole(t){
    var m = /\(\s*([a-z]+)\s*\)\s*$/i.exec(t.title || ''), n = (m ? m[1] : '').toLowerCase();
    if (/^vocals?$/.test(n)) return 'vocals'; if (n === 'drums') return 'drums'; if (n === 'bass') return 'bass';
    if (/^(other|instrumental|accompaniment|guitar|piano|music)$/.test(n)) return 'other';
    return null;
  }
  function stemsOf(t){
    var A = api(); if (!A || !t || t.stem) return [];
    var id = String(t.dbId);
    return A.tracks().filter(function(x){ return x && x.stem && x !== t && x.kind === 'audio' && (x.stemOf != null ? String(x.stemOf) === id : (x.stemSrc && x.stemSrc === t.title)) && stemRole(x); });
  }
  var MIX = { on: false, forId: null, els: [], lv: { vocals: 1, drums: 1, bass: 1, other: 1 }, sync: 0, own: 0 };
  function mixRoles(){ var r = {}; MIX.els.forEach(function(e){ r[e._role] = 1; }); return r; }
  function mixApply(){ MIX.els.forEach(function(e){ e.volume = Math.max(0, Math.min(1, MIX.lv[e._role] != null ? MIX.lv[e._role] : 1)); }); }
  function mixLead(){ return MIX.els[0] || null; }
  function mixPos(){ var l = mixLead(); return l ? l.currentTime || 0 : 0; }
  function mixStart(levels){
    var st = liveState();
    if (!st.has || !st.t){ toast('Play a song first.'); return false; }
    var stems = stemsOf(st.t);
    if (!stems.length){ toast('This song has not been split yet. Split it in Bloopy’s stems menu.'); return false; }
    if (levels) Object.keys(levels).forEach(function(k){ MIX.lv[k] = levels[k]; });
    if (MIX.forId !== st.t.dbId){
      mixStop(false, true);
      MIX.els = stems.map(function(s){ var a = new Audio(); a.preload = 'auto'; a.src = s.url; a._role = stemRole(s); return a; });
      MIX.forId = st.t.dbId;
    }
    var pos = media2().t || 0;
    MIX.own = Date.now();
    if (st.playing) click('play-btn');
    mixApply();
    MIX.els.forEach(function(a){ try { a.currentTime = pos; } catch(e){} });
    Promise.all(MIX.els.map(function(a){ return a.play(); })).catch(function(){ toast('The stems could not be played.'); mixStop(false); });
    MIX.on = true;
    clearInterval(MIX.sync);
    MIX.sync = setInterval(function(){
      var l = mixLead(); if (!l || !MIX.on) return;
      MIX.els.forEach(function(a){ if (a !== l && Math.abs(a.currentTime - l.currentTime) > 0.06) try { a.currentTime = l.currentTime; } catch(e){} });
      if (l.ended){ mixStop(false); return; }
      liveSoon();
    }, 400);
    liveSoon();
    return true;
  }
  // Stops the stems. back: carry on with the song itself from the same spot.
  function mixStop(back, quiet){
    var was = MIX.on, pos = mixPos();
    MIX.on = false; clearInterval(MIX.sync);
    MIX.els.forEach(function(a){ try { a.pause(); } catch(e){} });
    if (quiet){ MIX.els.forEach(function(a){ a.removeAttribute('src'); try { a.load(); } catch(e){ if (typeof ppCaught === "function") ppCaught(e); } }); MIX.els = []; MIX.forId = null; }
    if (was && back){ var w = wapi(); if (w) w.seek(pos); MIX.own = Date.now(); if (!liveState().playing) click('play-btn'); }
    liveSoon();
  }
  // The song starting again (its play button, the notification, the next track) ends the stems.
  ['audio', 'video-el'].forEach(function(id){ var m = document.getElementById(id); if (m) m.addEventListener('play', function(){ if (MIX.on && Date.now() - MIX.own > 600) mixStop(false); }); });
  var MIX_PRESETS = [['all','Everything',{ vocals:1, drums:1, bass:1, other:1 }],['karaoke','Karaoke',{ vocals:0, drums:1, bass:1, other:1 }],
                     ['acap','Just vocals',{ vocals:1, drums:0, bass:0, other:0 }],['drums','Just drums',{ vocals:0, drums:1, bass:0, other:0 }],['nodrums','No drums',{ vocals:1, drums:0, bass:1, other:1 }]];
  T.stems = { name:'Stem mixer', icon:'sliders', kind:'box', zones:['home','page','player','video'], w:'full', desc:'Turn the vocals, drums, bass and music of a split song up or down. Karaoke in one tap',
    fields:[['pre','Show quick mixes','toggle',true],['card','On a card','toggle',true]],
    render:function(o){
      return card(cardOn(o), '<div class="pw-mx" data-pw-live="stems">' +
        '<div class="pw-wh"><span class="pw-wh-t">Stem mixer</span><span class="pw-mx-s"></span></div>' +
        '<div class="pw-mx-rows">' + ROLES.map(function(r){
          return '<div class="pw-mx-r" data-role="' + r[0] + '"><button type="button" class="pw-mx-m" data-pw-mx-mute="' + r[0] + '" aria-label="Mute ' + r[1] + '">' + svg(r[2]) + '</button><span>' + r[1] + '</span>' +
            '<input type="range" min="0" max="100" step="1" value="100" data-pw-mx="' + r[0] + '" aria-label="' + r[1] + ' volume"></div>'; }).join('') + '</div>' +
        (o.pre === false ? '' : '<div class="pw-eq pw-mx-pre">' + MIX_PRESETS.map(function(p){ return '<button type="button" data-pw-mx-pre="' + p[0] + '">' + p[1] + '</button>'; }).join('') + '</div>') +
        '<div class="pw-mx-b"><button type="button" class="pw-mx-go" data-pw-mx-go="1">' + svg('play') + '<span>Play the mix</span></button><button type="button" data-pw-mx-back="1">Back to the song</button></div>' +
        '<p class="pw-mx-e"></p></div>');
    },
    live:function(el, st){
      var stems = st.has ? stemsOf(st.t) : [], has = {}; stems.forEach(function(s){ has[stemRole(s)] = 1; });
      if (MIX.on && (!st.t || MIX.forId !== st.t.dbId)) mixStop(false, true);
      el.classList.toggle('pw-mx-none', !stems.length); el.classList.toggle('pw-mx-on', MIX.on);
      setText(el.querySelector('.pw-mx-s'), MIX.on ? fmtT(mixPos()) : stems.length ? plural(stems.length, 'stem') : '');
      setText(el.querySelector('.pw-mx-e'), !st.has ? 'Play a song to mix its parts.' : !stems.length ? 'This song has not been split yet. Split it in Bloopy’s stems menu, then mix it here.' : '');
      el.querySelectorAll('.pw-mx-r').forEach(function(r){
        var role = r.dataset.role, inp = r.querySelector('input'), v = Math.round((MIX.lv[role] != null ? MIX.lv[role] : 1) * 100);
        r.hidden = stems.length > 0 && !has[role];
        if (!inp._drag && +inp.value !== v) inp.value = v;
        inp.style.setProperty('--p', v + '%'); r.classList.toggle('pw-mx-off', v === 0);
      });
      var lv = MIX.lv; el.querySelectorAll('[data-pw-mx-pre]').forEach(function(b){ var p = MIX_PRESETS.filter(function(x){ return x[0] === b.dataset.pwMxPre; })[0][2];
        b.classList.toggle('on', Object.keys(p).every(function(k){ return !has[k] || Math.abs((lv[k] != null ? lv[k] : 1) - p[k]) < 0.01; })); });
      var go = el.querySelector('[data-pw-mx-go]'); go.innerHTML = svg(MIX.on ? 'pause' : 'play') + '<span>' + (MIX.on ? 'Pause the mix' : 'Play the mix') + '</span>';
      go.disabled = !stems.length; el.querySelector('[data-pw-mx-back]').hidden = !MIX.on;
    } };
  document.addEventListener('input', function(e){
    var r = e.target; if (!r.dataset || !r.dataset.pwMx || editing) return;
    r._drag = true; MIX.lv[r.dataset.pwMx] = +r.value / 100; mixApply(); r.style.setProperty('--p', r.value + '%');
    clearTimeout(r._t); r._t = setTimeout(function(){ r._drag = false; }, 300); liveSoon();
  });
  document.addEventListener('click', function(e){
    var b = e.target.closest && e.target.closest('[data-pw-mx-go], [data-pw-mx-back], [data-pw-mx-pre], [data-pw-mx-mute]'); if (!b || editing) return;
    if (b.dataset.pwMxGo){ if (MIX.on){ MIX.els.forEach(function(a){ a.pause(); }); MIX.on = false; clearInterval(MIX.sync); liveSoon(); } else mixStart(); return; }
    if (b.dataset.pwMxBack){ mixStop(true); return; }
    if (b.dataset.pwMxMute){ var k = b.dataset.pwMxMute; MIX.lv[k] = MIX.lv[k] > 0 ? 0 : 1; mixApply(); liveSoon(); return; }
    var p = MIX_PRESETS.filter(function(x){ return x[0] === b.dataset.pwMxPre; })[0]; if (!p) return;
    Object.keys(p[2]).forEach(function(k2){ MIX.lv[k2] = p[2][k2]; }); mixApply();
    if (!MIX.on) mixStart(); else liveSoon();
  });

  // ---------- Sing-along ----------
  // A bigger lyrics view: the line before, the line now with each word lighting up as it is sung (word times from
  // Parakeet or an enhanced .lrc; otherwise the line fills in over its length), and the next line. "Vocals off" plays
  // the split stems without the singing, so you are the singer.
  function parseLrc(text){
    var lines = [], off = 0, re = /\[(\d{1,3}):(\d{1,2})(?:[.:](\d{1,3}))?\]/g, wre = /<(\d{1,3}):(\d{1,2})(?:[.:](\d{1,3}))?>/g;
    var sec = function(m){ return +m[1] * 60 + +m[2] + (m[3] ? +String(m[3]).padEnd(3, '0').slice(0, 3) / 1000 : 0); };
    String(text || '').split(/\r?\n/).forEach(function(raw){
      var om = raw.match(/^\s*\[offset:\s*([-+]?\d+)\s*\]/i); if (om){ off = +om[1] / 1000; return; }
      var st = [], m, last = 0; re.lastIndex = 0;
      while ((m = re.exec(raw))){ st.push(sec(m)); last = re.lastIndex; }
      if (!st.length) return;
      var body = raw.slice(last), words = [], wm, pos = 0, cur = null;
      wre.lastIndex = 0;
      while ((wm = wre.exec(body))){ var chunk = body.slice(pos, wm.index); if (cur != null && chunk.trim()) words.push({ s: cur, w: chunk.trim() }); cur = sec(wm) - off; pos = wre.lastIndex; }
      var tail = body.slice(pos).trim(); if (cur != null && tail) words.push({ s: cur, w: tail });
      var text2 = body.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
      st.forEach(function(s){ lines.push({ t: Math.max(0, s - off), text: text2, w: st.length === 1 && words.length > 1 ? words : null, end: st.length === 1 && cur != null ? cur : null }); });
    });
    return lines.sort(function(a, b){ return a.t - b.t; });
  }
  var lrcCache = { id: null, lines: [] };
  function lyricsFor(t){
    if (!t) return [];
    if (lrcCache.id === t.dbId) return lrcCache.lines;
    var all = {}; try { all = JSON.parse(localStorage.getItem('playerLyricsV1')) || {}; } catch(e){}
    lrcCache = { id: t.dbId, lines: parseLrc(all[t.dbId]) };
    return lrcCache.lines;
  }
  T.singalong = { name:'Sing-along', icon:'chat', kind:'box', zones:['home','page','player','video'], w:'full', desc:'Big lyrics with each word lighting up as it is sung, and a vocals-off button',
    fields:[['size','Size','seg',[['m','Medium'],['','Large'],['xl','Huge']]],['vox','Vocals off button','toggle',true],['hide','Hide when a song has no lyrics','toggle',false],['card','On a card','toggle',true]],
    render:function(o){
      return card(cardOn(o), '<div class="pw-sa pw-sa-' + esc(o.size || 'l') + '" data-pw-live="singalong" data-hide="' + (o.hide ? 1 : 0) + '">' +
        '<div class="pw-sa-p"></div><div class="pw-sa-c"></div><div class="pw-sa-n"></div>' +
        (o.vox === false ? '' : '<button type="button" class="pw-sa-v" data-pw-sa-vox="1" hidden>' + svg('mute') + '<span>Vocals off</span></button>') + '</div>');
    },
    live:function(el, st){ saDraw(el, st); if (st.playing || MIX.on) saLoop(el); } };
  function saNow(){ return MIX.on ? mixPos() : media2().t || 0; }
  function saDraw(el, st){
    var lines = st.has ? lyricsFor(st.t) : [], now = saNow() - ((window.__ppSongSync && +window.__ppSongSync()) || 0), i = -1;
    for (var k = 0; k < lines.length; k++){ if (lines[k].t <= now) i = k; else break; }
    liveHide(el, el.dataset.hide === '1' && !lines.length);
    var vb = el.querySelector('[data-pw-sa-vox]');
    if (vb){ var can = st.has && stemsOf(st.t).some(function(s){ return stemRole(s) === 'vocals'; }), off = MIX.on && MIX.lv.vocals === 0; vb.hidden = !can; vb.classList.toggle('on', off); setText(vb.querySelector('span'), off ? 'Vocals back' : 'Vocals off'); }
    var c = el.querySelector('.pw-sa-c');
    if (!lines.length){ el._li = null; setText(el.querySelector('.pw-sa-p'), ''); setText(el.querySelector('.pw-sa-n'), ''); setText(c, !st.has ? 'Nothing playing' : 'No lyrics for this song'); el.classList.add('pw-dim'); return; }
    el.classList.remove('pw-dim');
    var key = (st.t && st.t.dbId) + ':' + i;
    if (el._li !== key){
      el._li = key;
      var nextText = ''; for (var j = i + 1; j < lines.length; j++) if (lines[j].text){ nextText = lines[j].text; break; }
      var prevText = ''; for (j = i - 1; j >= 0; j--) if (lines[j].text){ prevText = lines[j].text; break; }
      setText(el.querySelector('.pw-sa-p'), prevText);
      setText(el.querySelector('.pw-sa-n'), nextText);
      var L = lines[i];
      if (!L || !L.text){ c.textContent = '♪'; c._w = null; }
      else {
        var ws = L.w ? L.w : L.text.split(' ').map(function(w){ return { w: w }; });
        c.innerHTML = ws.map(function(w){ return '<span>' + esc(w.w) + '</span> '; }).join('');
        c._w = c.querySelectorAll('span');
      }
      c.classList.remove('pw-sa-in'); void c.offsetWidth; c.classList.add('pw-sa-in');
    }
    // light the words up to now
    var L2 = lines[i]; if (!c._w || !L2) return;
    var end = L2.end || (i + 1 < lines.length ? lines[i + 1].t : L2.t + 5), spans = c._w, n = spans.length;
    for (var q = 0; q < n; q++){
      var s = L2.w ? L2.w[q].s : L2.t + (end - L2.t) * 0.92 * q / n;
      var e2 = L2.w ? (q + 1 < n ? L2.w[q + 1].s : end) : L2.t + (end - L2.t) * 0.92 * (q + 1) / n;
      var p = Math.max(0, Math.min(1, (now - s) / Math.max(0.05, e2 - s)));
      if (spans[q]._p !== p){ spans[q]._p = p; spans[q].style.setProperty('--w', (p * 100).toFixed(0) + '%'); spans[q].classList.toggle('on', p >= 1); }
    }
  }
  function saLoop(el){
    if (el._saRaf) return;
    var frame = function(){
      el._saRaf = 0;
      if (!el.isConnected || document.hidden) return;
      var st = liveState(); saDraw(el, st);
      if (st.playing || MIX.on) el._saRaf = requestAnimationFrame(frame);
    };
    el._saRaf = requestAnimationFrame(frame);
  }
  document.addEventListener('click', function(e){
    var b = e.target.closest && e.target.closest('[data-pw-sa-vox]'); if (!b || editing) return;
    if (MIX.on && MIX.lv.vocals === 0){ mixStop(true); return; }
    mixStart({ vocals: 0, drums: 1, bass: 1, other: 1 });
  });
