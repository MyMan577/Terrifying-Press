/* Obby Builder: play the host's course together, or build it together.
 * Two phones link with QR Link (../qrlink). The host's course is sent to the
 * guest, both play it at once, and each phone runs its own player and camera.
 * The other player is drawn with their own character and a name tag.
 * Build together: both phones edit the host's course in build mode. Every
 * quarter second each phone sends the blocks it changed, and puts in the
 * blocks the other phone changed (a "Friend" tag shows where). When the host
 * presses Play, both play it.
 * Each phone keeps its own copy of the course (crumbling blocks, enemies and
 * so on are per phone); only the players are shared.
 */
(function(){
  'use strict';
  var G = function(){ return window.__obby; };
  var SEND_MS = 50;            // own position, 20 times a second
  var CHUNK = 48 * 1024;       // courses go over in pieces

  var conn = null, role = null;
  var remote = null;           // latest state from the other phone
  var prev = null, lastAt = 0, gap = SEND_MS;
  var lastSend = 0, lastMode = null, lastCourseKey = '';
  var guestOwnCourse = null;   // guest's own course, put back afterwards
  var incoming = null;         // course pieces being received
  var remoteWon = false;
  var kind = 'play';           // 'play' or 'build' (chosen by the host)
  var shared = null;           // key -> tile as both phones last agreed (JSON)
  var sharedGoal = '', sharedSpawn = '';
  var pendingEd = [];          // edits that arrived while this phone was playing
  var lastSync = 0, SYNC_MS = 250;
  var friendMark = null;       // where the friend last built

  // ---------- UI ----------
  var css = document.createElement('style');
  css.textContent =
    '#obNetBtn{margin-top:6px}' +
    '#obNetChip{position:fixed;top:8px;left:50%;transform:translateX(-50%);z-index:9000;display:none;align-items:center;gap:8px;' +
    'padding:6px 8px 6px 12px;border-radius:999px;background:rgba(15,18,32,.88);color:#e8ecff;font:600 13px system-ui,sans-serif;box-shadow:0 4px 14px rgba(0,0,0,.4)}' +
    '#obNetChip button{border:0;border-radius:999px;padding:5px 10px;background:rgba(255,255,255,.14);color:#fff;font:600 12px system-ui,sans-serif}';
  document.head.appendChild(css);

  var chip = document.createElement('div');
  chip.id = 'obNetChip';
  chip.innerHTML = '<span id="obNetTxt">🤝 Together</span><button type="button" id="obNetLeave">Leave</button>';
  document.body.appendChild(chip);
  document.getElementById('obNetLeave').addEventListener('click', function(){ leave(true); });

  function addButton(){
    var reset = document.getElementById('clearBtn');
    if (!reset || document.getElementById('obNetBtn')) return;
    var b = document.createElement('button');
    b.id = 'obNetBtn'; b.type = 'button'; b.textContent = '🤝 Play together';
    b.addEventListener('click', function(){ openLink('play'); });
    reset.insertAdjacentElement('afterend', b);
    var bb = document.createElement('button');
    bb.id = 'obNetBuildBtn'; bb.type = 'button'; bb.textContent = '🧱 Build together';
    bb.style.marginTop = '6px';
    bb.addEventListener('click', function(){ openLink('build'); });
    b.insertAdjacentElement('afterend', bb);
  }
  addButton();

  function status(t){ document.getElementById('obNetTxt').textContent = t; }
  function say(t){ var g = G(); if (g) g.setMessage(t); }

  function openLink(k){
    if (conn) return;
    if (!window.QRLink){ say("Playing together isn't available."); return; }
    kind = k === 'build' ? 'build' : 'play';
    QRLink.open({
      app: 'obby', accent: '#7c9cff',
      title: kind === 'build' ? 'Build together' : 'Play together',
      hint: kind === 'build'
        ? 'You both build the host’s course at the same time, then play it together. One phone hosts, the other joins.'
        : 'You both play the host’s course, each with your own character. One phone hosts, the other joins.',
      onConnected: start
    });
  }

  // ---------- session ----------
  function start(c, r){
    conn = c; role = r; remote = null; prev = null; remoteWon = false; lastCourseKey = '';
    chip.style.display = 'flex';
    status(role === 'host' ? '🤝 Together · sending your course' : '🤝 Together · getting the course');
    c.on('data', onMessage);
    c.on('close', function(){ if (conn === c) leave(false); });
    shared = null; pendingEd = []; friendMark = null;
    if (role === 'host') {
      conn.send({ t: 'kind', kind: kind });
      sendCourse(); baseline();
      if (kind === 'build') { status('🧱 Building together'); say('Building together: everything either of you builds shows up on both phones. Press Play when you are ready.'); }
      else startPlay();
    }
    else { var g = G(); try { guestOwnCourse = g.exportLevel(); } catch(e) { guestOwnCourse = null; } }
  }

  function leave(byMe){
    var c = conn; conn = null; remote = null; prev = null; incoming = null; shared = null; pendingEd = []; friendMark = null;
    chip.style.display = 'none';
    if (byMe && c) { try { c.close(); } catch(e){} }
    var g = G();
    if (role === 'guest' && guestOwnCourse && g) {
      try { g.importLevel(guestOwnCourse); g.setMode('build'); } catch(e){}
    }
    guestOwnCourse = null; role = null;
    say(byMe ? 'You left. Your own course is back.' : 'Your friend left.');
  }

  // A stable fingerprint of the course, ignoring the export's name and timestamp.
  function courseKey(json){
    try { var d = JSON.parse(json); return JSON.stringify([d.world, d.movers]); } catch(e){ return json; }
  }

  function sendCourse(){
    var g = G(); if (!g || !conn) return;
    var json = g.exportLevel();
    lastCourseKey = courseKey(json);
    var id = Date.now() + '' + Math.floor(Math.random() * 1000);
    var n = Math.ceil(json.length / CHUNK) || 1;
    for (var i = 0; i < n; i++) conn.send({ t: 'course', id: id, i: i, n: n, d: json.slice(i * CHUNK, (i + 1) * CHUNK) });
  }

  function startPlay(){
    var g = G(); if (!g) return;
    g.resetPlayer();
    g.setMode('play');
    lastMode = 'play';
    if (conn) conn.send({ t: 'play' });
  }

  function onMessage(m){
    if (!m) return;
    var g = G();
    if (m.t === 's') {
      prev = remote ? { x: shown().x, y: shown().y } : null;
      remote = m; m._at = performance.now();
      var now = performance.now();
      if (lastAt) gap = Math.min(200, Math.max(20, gap * 0.85 + (now - lastAt) * 0.15));
      lastAt = now;
      if (m.won && !remoteWon) say('Your friend reached the goal!');
      remoteWon = !!m.won;
      return;
    }
    if (m.t === 'course' && role === 'guest') {
      if (!incoming || incoming.id !== m.id) incoming = { id: m.id, n: m.n, parts: [], got: 0 };
      if (incoming.parts[m.i] === undefined) { incoming.parts[m.i] = m.d; incoming.got++; }
      if (incoming.got === incoming.n) {
        var json = incoming.parts.join(''); incoming = null;
        try { g.importLevel(json); } catch(e){ say("Couldn't load the host's course."); return; }
        baseline(); pendingEd = [];
        status(kind === 'build' ? '🧱 Building together' : '🤝 Together');
        if (kind === 'build' && g.mode === 'build') say('Building together: everything either of you builds shows up on both phones.');
      }
      return;
    }
    if (m.t === 'kind') { kind = m.kind === 'build' ? 'build' : 'play'; return; }
    if (m.t === 'ed') {   // the other phone's block changes
      if (g && g.mode === 'build') applyEd(m); else pendingEd.push(m);
      return;
    }
    if (m.t === 'play' && role === 'guest') {
      g.resetPlayer(); g.setMode('play'); lastMode = 'play';
      say('Playing the host’s course. Reach the goal together!');
      status('🤝 Together');
      return;
    }
  }

  // ---------- building together ----------
  function W(){ return window._gameWorld; }
  function baseline(){
    var w = W(); if (!w) return;
    shared = new Map(); w.tiles.forEach(function(t, k){ shared.set(k, JSON.stringify(t)); });
    sharedGoal = JSON.stringify(w.goal || null); sharedSpawn = JSON.stringify(w.spawn || null);
  }
  // send what this phone changed since the last agreed state
  function syncOut(){
    var w = W(); if (!w || !shared || !conn) return;
    var set = [], del = [];
    w.tiles.forEach(function(t, k){ var j = JSON.stringify(t); if (shared.get(k) !== j) { set.push([k, JSON.parse(j)]); shared.set(k, j); } });
    shared.forEach(function(j, k){ if (!w.tiles.has(k)) { del.push(k); } });
    for (var i = 0; i < del.length; i++) shared.delete(del[i]);
    var gj = JSON.stringify(w.goal || null), sj = JSON.stringify(w.spawn || null);
    var goal = gj !== sharedGoal ? w.goal : null, spawn = sj !== sharedSpawn ? w.spawn : null;
    sharedGoal = gj; sharedSpawn = sj;
    if (!set.length && !del.length && !goal && !spawn) return;
    for (var a = 0; a < set.length; a += 400) conn.send({ t: 'ed', set: set.slice(a, a + 400), del: a ? [] : del, goal: a ? null : goal, spawn: a ? null : spawn });
    if (!set.length) conn.send({ t: 'ed', set: [], del: del, goal: goal, spawn: spawn });
  }
  // put the other phone's changes in, and note them as agreed so they aren't sent back
  function applyEd(m){
    var g = G(), w = W(); if (!g || !w || !g.applyEdits) return;
    g.applyEdits(m.set, m.del, m.goal, m.spawn);
    if (!shared) baseline();
    (m.set || []).forEach(function(p){ var t = w.tiles.get(p[0]); if (t) shared.set(p[0], JSON.stringify(t)); });
    (m.del || []).forEach(function(k){ shared.delete(k); });
    if (m.goal) sharedGoal = JSON.stringify(w.goal); if (m.spawn) sharedSpawn = JSON.stringify(w.spawn);
    var first = (m.set && m.set[0] && m.set[0][1]) || null, k0 = !first && m.del && m.del[0];
    if (first) friendMark = { x: first.x, y: first.y, at: performance.now() };
    else if (k0) { var xy = String(k0).split(','); friendMark = { x: +xy[0], y: +xy[1], at: performance.now() }; }
  }

  // ---------- every frame (called from the game's draw) ----------
  var blendX = 0, blendY = 0;
  function shown(){ return { x: blendX, y: blendY }; }

  function frame(){
    var g = G(); if (!g || !conn) return;
    var p = g.player, now = performance.now();

    // host pressed Play again after editing: send the new course first
    if (role === 'host' && g.mode !== lastMode) {
      if (g.mode === 'play') {
        var json = g.exportLevel();
        if (courseKey(json) !== lastCourseKey) { sendCourse(); conn.send({ t: 'play' }); }
      }
      lastMode = g.mode;
    } else if (role === 'guest') lastMode = g.mode;

    if (now - lastSend >= SEND_MS) {
      lastSend = now;
      conn.send({ t: 's', x: r2(p.x), y: r2(p.y), vx: r2(p.vx), vy: r2(p.vy), w: p.w, h: p.h,
        onGround: p.onGround, dashDir: p.dashDir, isDashing: p.isDashing, gravityFlipped: p.gravityFlipped,
        isWallSliding: p.isWallSliding, onWall: p.onWall, wallSide: p.wallSide, slashTimer: r2(p.slashTimer || 0),
        swordMode: p.swordMode, char: g.char, mode: g.mode, won: !!g.won,
        em: window.PPEmote ? window.PPEmote.netState() : null });
    }

    // building together: send this phone's changes, put in any that waited while it was playing
    if (g.mode === 'build' && shared) {
      if (pendingEd.length) { var q = pendingEd; pendingEd = []; q.forEach(applyEd); }
      if (now - lastSync >= SYNC_MS) { lastSync = now; syncOut(); }
      if (friendMark && g.drawTag) { var age = now - friendMark.at; if (age < 2500) g.drawTag(friendMark.x, friendMark.y, role === 'host' ? 'Friend' : 'Host', 1 - age / 2500); }
    }

    // draw the other player only while you're both playing
    if (!remote || remote.mode !== 'play' || g.mode !== 'play') return;
    var a = Math.min(1, (now - lastAt) / gap);
    var fx = prev ? prev.x : remote.x, fy = prev ? prev.y : remote.y;
    if (Math.abs(remote.x - fx) > 6 || Math.abs(remote.y - fy) > 6) { fx = remote.x; fy = remote.y; } // respawned: jump, don't slide
    blendX = fx + (remote.x - fx) * a; blendY = fy + (remote.y - fy) * a;
    var s = {}; for (var k in remote) s[k] = remote[k];
    s.x = blendX; s.y = blendY;
    // their emote, played forward from when it was sent
    s.em = remote.em && remote.em.id ? { id: remote.em.id, t: remote.em.t + (now - (remote._at || now)) / 1000 } : null;
    g.drawAs(s, role === 'host' ? 'Friend' : 'Host');
  }
  function r2(v){ return Math.round((v || 0) * 100) / 100; }

  // role while linked ('host' or 'guest'), so the course autosave can leave a friend's course alone
  window.__obbyNet = { frame: frame, get role(){ return conn ? role : null; } };
})();
