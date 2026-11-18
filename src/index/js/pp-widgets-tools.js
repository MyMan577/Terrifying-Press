  // ===================== handy widgets: alarm, queue, playlists, tags, storage, practice =====================

  // The Music alarm is now part of Press Play Pendulum: alarms with their own tab (pp-widgets-pendulum.js).
  var ALARM_KEY = 'ppAlarmV1';   // the old widget's on / off state, read once to move its alarm over

  // ---------- Queue ----------
  // What plays next, with the time it all ends; add songs to play next by searching, take them out with ×.
  T.queue = { name:'Queue', icon:'queue', kind:'box', zones:['home','page','player'], w:'full', desc:'What plays next and when it ends. Search to add a song, × to take one out',
    fields:[['n','Show','seg',[['3','3'],['','5'],['8','8']]],['card','On a card','toggle',true]],
    render:function(o){
      return card(cardOn(o), '<div class="pw-qb" data-pw-live="queue" data-n="' + (+o.n || 5) + '"><div class="pw-wh"><span class="pw-wh-t">Queue</span><span class="pw-qb-end"></span></div>' +
        '<div class="pw-qb-l"></div><form class="pw-qb-f" data-pw-qb="1"><input type="search" placeholder="Add a song to play next…" aria-label="Find a song to play next" autocomplete="off"></form><div class="pw-qb-r"></div></div>');
    },
    live:function(el, st){
      var w = wapi(), A = api(); if (!w || !A) return;
      var t = A.tracks(), n = +el.dataset.n || 5, up = st.has ? w.upNext(60) : [], sig = (st.has ? st.t.dbId : '') + '|' + up.slice(0, n).join(',') + '|' + Math.floor(Date.now() / 30000);
      if (el._sig !== sig){
        el._sig = sig;
        el.querySelector('.pw-qb-l').innerHTML = !st.has ? '<p class="pw-otd-e">Play something to start a queue.</p>' : !up.length ? '<p class="pw-otd-e">Nothing after this one. Add a song below.</p>' :
          up.slice(0, n).map(function(i, k){ var x = t[i];
            return '<div class="pw-qb-i"><button type="button" class="pw-song" data-pw-act="jump" data-i="' + i + '"><em>' + (k + 1) + '</em>' + artHTML(x) + '<span class="pw-song-t"><b>' + esc(x.title) + '</b><small>' + esc(x.artist && x.artist !== 'Unknown artist' ? x.artist : '') + (x.duration ? (x.artist && x.artist !== 'Unknown artist' ? ' · ' : '') + fmtT(x.duration) : '') + '</small></span></button>' +
              '<button type="button" class="pw-tdo-x" data-pw-qb-rm="' + i + '" aria-label="Take out of the queue">' + svg('x') + '</button></div>'; }).join('') +
          (up.length > n ? '<p class="pw-qb-more">and ' + plural(up.length - n, 'more') + '</p>' : '');
      }
      // when it all ends: what is left of this one plus everything after it (only if every length is known)
      var tm = media2(), left = Math.max(0, tm.d - tm.t), known = st.has && tm.d > 0;
      up.forEach(function(i){ if (t[i].duration) left += t[i].duration; else known = false; });
      setText(el.querySelector('.pw-qb-end'), known && up.length ? 'ends ' + new Date(Date.now() + left * 1000).toLocaleTimeString(undefined, { hour:'numeric', minute:'2-digit' }) : up.length ? plural(up.length, 'song') + ' left' : '');
    } };
  document.addEventListener('input', function(e){
    var inp = e.target; if (!inp.closest || !inp.closest('[data-pw-qb]') || editing) return;
    var el = inp.closest('[data-pw-live="queue"]'), q = inp.value.trim().toLowerCase(), A = api(), r = el.querySelector('.pw-qb-r');
    if (!q || !A){ r.innerHTML = ''; return; }
    var t = A.tracks(), hits = playable().filter(function(i){ return (t[i].title + ' ' + (t[i].artist || '')).toLowerCase().indexOf(q) >= 0; }).slice(0, 6);
    r.innerHTML = hits.length ? hits.map(function(i){ return '<button type="button" class="pw-qb-hit" data-pw-qb-add="' + i + '">' + svg('plus') + '<span><b>' + esc(t[i].title) + '</b><small>' + esc(t[i].artist || '') + '</small></span></button>'; }).join('') : '<p class="pw-otd-e">No song matches that.</p>';
  });
  document.addEventListener('submit', function(e){ if (e.target.matches && e.target.matches('[data-pw-qb]')){ e.preventDefault(); var h = e.target.parentNode.querySelector('[data-pw-qb-add]'); if (h) h.click(); } });
  document.addEventListener('click', function(e){
    var b = e.target.closest && e.target.closest('[data-pw-qb-add], [data-pw-qb-rm]'); if (!b || editing) return;
    var w = wapi(), A = api(), K = kit(); if (!w || !A) return;
    var el = b.closest('[data-pw-live="queue"]');
    if (b.dataset.pwQbRm){ w.unqueue(+b.dataset.pwQbRm); }
    else {
      var i = +b.dataset.pwQbAdd, t = A.tracks()[i];
      if (!K || !K.hasTrack()){ playOne(i); }
      else if (w.playNext(i)) toast('“' + t.title + '” plays next.');
      var inp = el.querySelector('input'); inp.value = ''; el.querySelector('.pw-qb-r').innerHTML = '';
    }
    document.querySelectorAll('[data-pw-live="queue"]').forEach(function(x){ x._sig = null; }); liveSoon();
  });

  // ---------- Playlist tiles ----------
  // Your playlists as big tiles, the ones you play most first. Tap one to play it; the corner opens it.
  function plCover(pl, t){
    if (pl.thumb) return '<img alt="" loading="lazy" decoding="async" src="' + esc(pl.thumb) + '">';
    var arts = []; t.forEach(function(x){ if (arts.length < 4 && (x.playlistIds || []).indexOf(pl.id) >= 0){ var s = thumbOf(x); if (s && arts.indexOf(s) < 0) arts.push(s); } });
    if (arts.length >= 4) return '<span class="pw-plt-mo">' + arts.map(function(s){ return '<img alt="" loading="lazy" decoding="async" src="' + esc(s) + '">'; }).join('') + '</span>';
    if (arts.length) return '<img alt="" loading="lazy" decoding="async" src="' + esc(arts[0]) + '">';
    return '<span class="pw-plt-ph">' + svg('list') + '</span>';
  }
  T.pltiles = { name:'Playlist tiles', icon:'grid', kind:'box', zones:['home','page','player'], w:'full', desc:'Your playlists as big tiles, the most played first. Tap to play',
    fields:[['n','How many','seg',[['2','2'],['','4'],['6','6']]],['shuf','Play shuffled','toggle',false],['card','On a card','toggle',false]],
    render:function(o){
      var A = api(); if (!A) return '';
      var t = A.tracks(), pls = A.playlists().filter(function(p){ return !p.libOnly && !p.stemOf; }), K = kit();
      if (!pls.length) return '<div class="pw-empty">No playlists yet. Make one in the Playlists tab.</div>';
      var byId = new Map(t.map(function(x){ return [x.dbId, x]; })), score = {}, hist = K ? K.history() : [], tp = portfolio().trackPlays || {};
      t.forEach(function(x){ (x.playlistIds || []).forEach(function(id){ score[id] = (score[id] || 0) + ((tp[x.dbId] || {}).count || 0); }); });
      hist.slice(0, 30).forEach(function(h, k){ var x = byId.get(h.id); if (x) (x.playlistIds || []).forEach(function(id){ score[id] = (score[id] || 0) + (30 - k); }); });
      pls = pls.slice().sort(function(a, b){ return (score[b.id] || 0) - (score[a.id] || 0); }).slice(0, +o.n || 4);
      return card(o, '<div class="pw-plt pw-plt-' + pls.length + '">' + pls.map(function(pl){
        var n = t.filter(function(x){ return (x.playlistIds || []).indexOf(pl.id) >= 0; }).length;
        return '<div class="pw-plt-i"><button type="button" class="pw-plt-c" data-pw-plt="' + esc(pl.id) + '" data-shuf="' + (o.shuf ? 1 : 0) + '" aria-label="Play ' + esc(pl.name) + '">' + plCover(pl, t) +
          '<span class="pw-plt-t"><b>' + esc(pl.name) + '</b><small>' + plural(n, 'item') + '</small></span><i class="pw-plt-p">' + svg('play') + '</i></button>' +
          '<button type="button" class="pw-plt-o" data-pw-act="openpl" data-pl="' + esc(pl.id) + '" aria-label="Open ' + esc(pl.name) + '">' + svg('list') + '</button></div>'; }).join('') + '</div>');
    } };
  document.addEventListener('click', function(e){
    var b = e.target.closest && e.target.closest('[data-pw-plt]'); if (!b || editing) return;
    var A = api(), id = b.dataset.pwPlt; if (!A) return;
    var t = A.tracks(), mine = t.map(function(x, i){ return (x.playlistIds || []).indexOf(id) >= 0 && !x.stem ? i : -1; }).filter(function(i){ return i >= 0; });
    if (!mine.length){ toast('That playlist is empty.'); return; }
    var q = A.orderFor ? A.orderFor(mine, id) : mine; q = Array.isArray(q) ? q : mine;
    playQ(b.dataset.shuf === '1' ? shuffled(q) : q);
  });

  // ---------- Tag chips ----------
  // Genres and feels from the smart tags as chips; tap one to play those songs shuffled.
  var VIBE_NAMES = { chill:'Chill', party:'Party', happy:'Happy', sad:'Sad', energetic:'Energetic', aggressive:'Intense', instrumental:'Instrumental', vocals:'Vocals', dance:'Dance', focus:'Focus', romantic:'Romantic', dark:'Dark' };
  function tagSets(kind){
    var V = window.PPVocals, tags = null; try { tags = V && V.loadTags ? V.loadTags() : null; } catch(e){}
    var A = api(), sets = {}; if (!A || !tags) return sets;
    var t = A.tracks();
    playable().forEach(function(i){
      var c = tags[String(t[i].dbId)]; if (!c) return;
      if (kind !== 'vibe'){ var g = (c.gn || [])[0]; if (g){ var n = String(g[0]).split('---')[0].replace(/ music$/i, '').trim(); if (n) (sets['g:' + n] = sets['g:' + n] || { name: n, ids: [] }).ids.push(i); } }
      if (kind !== 'genre' && V.vibes){ var vb = []; try { vb = V.vibes(c) || []; } catch(x){}
        vb.forEach(function(v){ if (v === 'vocals' || v === 'speech') return; var nm = VIBE_NAMES[v] || (v.charAt(0).toUpperCase() + v.slice(1)); (sets['v:' + v] = sets['v:' + v] || { name: nm, ids: [], vibe: 1 }).ids.push(i); }); }
    });
    return sets;
  }
  T.tagchips = { name:'Tag chips', icon:'tag', kind:'box', zones:['home','page','player'], w:'full', desc:'Genres and feels from the smart tags. Tap one to play those songs',
    fields:[['kind','Show','seg',[['','Both'],['genre','Genres'],['vibe','Feels']]],['max','At most','seg',[['6','6'],['','12'],['24','24']]],['count','Show how many songs','toggle',true],['title','Heading','text',''],['card','On a card','toggle',false]],
    render:function(o){
      var sets = tagSets(o.kind), keys = Object.keys(sets).filter(function(k){ return sets[k].ids.length >= 2; }).sort(function(a, b){ return sets[b].ids.length - sets[a].ids.length; }).slice(0, +o.max || 12);
      if (!keys.length) return '<div class="pw-empty">No tags yet. Tag your songs with smart tags (Bloopy’s stems menu) and they show up here.</div>';
      return card(o, (o.title ? '<div class="pw-wh"><span class="pw-wh-t">' + esc(o.title) + '</span></div>' : '') + '<div class="pw-chips">' + keys.map(function(k){
        return '<button type="button" class="pw-chip' + (sets[k].vibe ? ' pw-chip-v' : '') + '" data-pw-tag="' + esc(k) + '" data-kind="' + esc(o.kind || '') + '">' + esc(sets[k].name) + (o.count === false ? '' : '<small>' + sets[k].ids.length + '</small>') + '</button>'; }).join('') + '</div>');
    } };
  document.addEventListener('click', function(e){
    var b = e.target.closest && e.target.closest('[data-pw-tag]'); if (!b || editing) return;
    var s = tagSets(b.dataset.kind)[b.dataset.pwTag]; if (!s) return;
    playQ(shuffled(s.ids)); toast(s.name + ': ' + plural(s.ids.length, 'song') + ', shuffled.');
  });

  // ---------- Storage ----------
  // How much room the library takes, split into videos and music, and the biggest files.
  function fmtBytes(n){ if (!n) return '0 MB'; var u = ['B','KB','MB','GB','TB'], i = Math.min(4, Math.floor(Math.log(n) / Math.log(1024))); return (n / Math.pow(1024, i)).toFixed(i >= 3 ? 1 : 0) + ' ' + u[i]; }
  var storeEst = null;
  try { if (navigator.storage && navigator.storage.estimate) navigator.storage.estimate().then(function(e){ storeEst = e; liveSoon(); }).catch(function(){}); } catch(e){}
  T.storage = { name:'Storage', icon:'folder', kind:'box', zones:['home','page'], w:'full', desc:'How much room your library takes, and its biggest files',
    fields:[['big','Show the biggest files','seg',[['0','None'],['','3'],['5','5']]],['card','On a card','toggle',true]],
    render:function(o){ return card(cardOn(o), '<div class="pw-sto" data-pw-live="storage" data-big="' + (o.big === '0' ? 0 : +o.big || 3) + '"></div>'); },
    live:function(el){
      var A = api(); if (!A) return;
      var t = A.tracks(), sig = t.length + '|' + (storeEst ? storeEst.usage : ''); if (el._sig === sig) return; el._sig = sig;
      var v = 0, a = 0, s = 0, nv = 0, na = 0, unknown = 0;
      t.forEach(function(x){ var z = +x.size || 0; if (!z) unknown++; if (x.stem) s += z; else if (x.kind === 'video'){ v += z; nv++; } else { a += z; na++; } });
      var tot = v + a + s || 1, big = +el.dataset.big;
      var top = t.map(function(x, i){ return [i, +x.size || 0]; }).filter(function(x){ return x[1]; }).sort(function(p, q){ return q[1] - p[1]; }).slice(0, big);
      if (!(v + a + s)){ el.innerHTML = '<div class="pw-wh"><span class="pw-wh-t">Storage</span></div><p class="pw-otd-e">' + (t.length ? 'The sizes of these ' + plural(t.length, 'file') + ' are not known: they stay on the phone or a share, and take no room in the app.' : 'Nothing in the library yet.') + '</p>' +
        (storeEst && storeEst.usage ? '<p class="pw-otd-e">The app’s own storage (copies, covers, models): ' + fmtBytes(storeEst.usage) + '.</p>' : ''); return; }
      el.innerHTML = '<div class="pw-wh"><span class="pw-wh-t">Storage</span><span>' + fmtBytes(v + a + s) + (unknown ? ' +' : '') + '</span></div>' +
        '<div class="pw-sto-bar">' + (v ? '<i class="pw-sto-v" style="width:' + (v / tot * 100).toFixed(1) + '%"></i>' : '') + (a ? '<i class="pw-sto-a" style="width:' + (a / tot * 100).toFixed(1) + '%"></i>' : '') + (s ? '<i class="pw-sto-s" style="width:' + (s / tot * 100).toFixed(1) + '%"></i>' : '') + '</div>' +
        '<div class="pw-sto-k">' + (nv ? '<span><i class="pw-sto-v"></i>Videos ' + fmtBytes(v) + ' <small>(' + nv + ')</small></span>' : '') + (na ? '<span><i class="pw-sto-a"></i>Music ' + fmtBytes(a) + ' <small>(' + na + ')</small></span>' : '') + (s ? '<span><i class="pw-sto-s"></i>Stems ' + fmtBytes(s) + '</span>' : '') + '</div>' +
        (storeEst && storeEst.usage ? '<p class="pw-otd-e">The app’s own storage (copies, covers, models): ' + fmtBytes(storeEst.usage) + (storeEst.quota ? ' of ' + fmtBytes(storeEst.quota) + ' allowed' : '') + '.</p>' : '') +
        (top.length ? '<div class="pw-sto-top">' + top.map(function(x){ var tr = t[x[0]]; return songRow(x[0], fmtBytes(x[1]) + ' · ' + (tr.kind === 'video' ? 'video' : (tr.ext || 'audio').toUpperCase())); }).join('') + '</div>' : '') +
        (unknown ? '<p class="pw-otd-e">' + plural(unknown, 'file') + ' without a known size (on the phone or a share) not counted.</p>' : '') +
        '<button type="button" class="pw-sto-go" data-pw-act="library">Tidy up in the Library</button>';
    } };

  // ---------- Practice loop ----------
  // The player's A-B loop on a widget: mark A and B while it plays, repeat it a set number of times, and practise from a
  // slower speed that rises each time round. Uses the player's own loop, so the A-B button and its panel stay in step.
  T.practice = { name:'Practice loop', icon:'history', kind:'box', zones:['home','page','player','video'], w:'full', desc:'Loop a part of a song: set A and B, repeat it, start slower and speed up',
    fields:[['card','On a card','toggle',true]],
    render:function(o){
      var seg = function(k, list){ return '<div class="pw-eq pw-pr-seg" data-pw-pr-k="' + k + '">' + list.map(function(x){ return '<button type="button" data-v="' + x[0] + '">' + x[1] + '</button>'; }).join('') + '</div>'; };
      return card(cardOn(o), '<div class="pw-pr" data-pw-live="practice"><div class="pw-wh"><span class="pw-wh-t">Practice loop</span><span class="pw-pr-sp"></span></div>' +
        '<div class="pw-pr-ab"><button type="button" data-pw-pr="a"><small>Set A</small><b>-</b></button><span class="pw-pr-line"><i></i></span><button type="button" data-pw-pr="b"><small>Set B</small><b>-</b></button></div>' +
        '<label class="pw-pr-l">Repeat</label>' + seg('ab-count', [['', 'Forever'], ['3', '3×'], ['5', '5×'], ['10', '10×']]) +
        '<label class="pw-pr-l">Start at</label>' + seg('ab-ramp', [['', 'Full speed'], ['50', '50%'], ['70', '70%'], ['85', '85%']]) +
        '<p class="pw-pr-st"></p><div class="pw-sw-b"><button type="button" data-pw-pr="clear">Clear loop</button></div></div>');
    },
    live:function(el, st){
      var a = document.getElementById('ab-a-time'), b = document.getElementById('ab-b-time'), status = document.getElementById('ab-status');
      if (!a) return;
      var av = a.textContent.trim(), bv = b.textContent.trim();
      setText(el.querySelector('[data-pw-pr="a"] b'), av); setText(el.querySelector('[data-pw-pr="b"] b'), bv);
      el.querySelector('[data-pw-pr="a"]').classList.toggle('on', av !== '-'); el.querySelector('[data-pw-pr="b"]').classList.toggle('on', bv !== '-');
      setText(el.querySelector('.pw-pr-st'), !st.has ? 'Play a song, then tap Set A where the part starts and Set B where it ends.' : status ? status.textContent : '');
      el.querySelectorAll('[data-pw-pr-k]').forEach(function(g){ var inp = document.getElementById(g.dataset.pwPrK), v = inp ? inp.value : ''; g.querySelectorAll('button').forEach(function(x){ x.classList.toggle('on', x.dataset.v === v); }); });
      var sp = document.getElementById('speed-slider'); setText(el.querySelector('.pw-pr-sp'), sp && +sp.value !== 1 ? Math.round(+sp.value * 100) + '% speed' : '');
      // where the loop sits in the song
      var tm = media2(), line = el.querySelector('.pw-pr-line i'), sec = function(s){ if (s === '-') return null; var p = s.split(':'); return +p[0] * 60 + +p[1]; }, A0 = sec(av), B0 = sec(bv);
      if (tm.d && A0 != null){ line.style.left = (A0 / tm.d * 100).toFixed(2) + '%'; line.style.width = (((B0 != null ? B0 : tm.t) - A0) / tm.d * 100).toFixed(2) + '%'; line.hidden = false; } else line.hidden = true;
    } };
  document.addEventListener('click', function(e){
    var b = e.target.closest && e.target.closest('[data-pw-pr], [data-pw-pr-k] button'); if (!b || editing) return;
    if (!kit() || !kit().hasTrack()){ toast('Play something first.'); return; }
    if (b.dataset.pwPr){ click(b.dataset.pwPr === 'clear' ? 'ab-clear' : 'ab-set-' + b.dataset.pwPr); }
    else { var inp = document.getElementById(b.parentNode.dataset.pwPrK); if (inp){ inp.value = b.dataset.v; inp.dispatchEvent(new Event('change', { bubbles:true })); } }
    e.stopPropagation(); liveSoon();
  });
