/* Obby Builder: play the host's course together.
 * Two phones link with QR Link (../qrlink). The host's course is sent to the
 * guest, both play it at once, and each phone runs its own player and camera.
 * The other player is drawn with their own character and a name tag.
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
    b.addEventListener('click', openLink);
    reset.insertAdjacentElement('afterend', b);
  }
  addButton();

  function status(t){ document.getElementById('obNetTxt').textContent = t; }
  function say(t){ var g = G(); if (g) g.setMessage(t); }

  function openLink(){
    if (conn) return;
    if (!window.QRLink){ say("Playing together isn't available."); return; }
    QRLink.open({
      app: 'obby', accent: '#7c9cff',
      title: 'Play together',
      hint: 'You both play the host’s course, each with your own character. One phone hosts, the other joins.',
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
    if (role === 'host') { sendCourse(); startPlay(); }
    else { var g = G(); try { guestOwnCourse = g.exportLevel(); } catch(e) { guestOwnCourse = null; } }
  }

  function leave(byMe){
    var c = conn; conn = null; remote = null; prev = null; incoming = null;
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
      remote = m;
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
        status('🤝 Together');
      }
      return;
    }
    if (m.t === 'play' && role === 'guest') {
      g.resetPlayer(); g.setMode('play'); lastMode = 'play';
      say('Playing the host’s course. Reach the goal together!');
      status('🤝 Together');
      return;
    }
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
        swordMode: p.swordMode, char: g.char, mode: g.mode, won: !!g.won });
    }

    // draw the other player only while you're both playing
    if (!remote || remote.mode !== 'play' || g.mode !== 'play') return;
    var a = Math.min(1, (now - lastAt) / gap);
    var fx = prev ? prev.x : remote.x, fy = prev ? prev.y : remote.y;
    if (Math.abs(remote.x - fx) > 6 || Math.abs(remote.y - fy) > 6) { fx = remote.x; fy = remote.y; } // respawned: jump, don't slide
    blendX = fx + (remote.x - fx) * a; blendY = fy + (remote.y - fy) * a;
    var s = {}; for (var k in remote) s[k] = remote[k];
    s.x = blendX; s.y = blendY;
    g.drawAs(s, role === 'host' ? 'Friend' : 'Host');
  }
  function r2(v){ return Math.round((v || 0) * 100) / 100; }

  window.__obbyNet = { frame: frame };
})();
