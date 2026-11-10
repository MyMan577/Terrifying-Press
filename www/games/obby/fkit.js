/* Obby Builder: FIGHTER KIT
 * Shared plumbing for the add-on fighters (Kodiak, Valka, Boiler, Sleight), so each fighter file is only
 * its moves, its animation and its look.
 *
 *  - PPParry: the parry outside Smash (Guardian's Counter and any fighter's _parryT). A close attacker is
 *    countered; a shot, or a hit from range, is reflected back at the nearest foe as a homing bolt.
 *    (Smash has its own version in smash.js.)
 *  - FKit.define(spec): registers a fighter. It owns the state swap for a second fighter (Smash CPU), the
 *    S button (S + direction, ground and air, held S charges), the per-frame tick, drawing hooks, the capsule
 *    roster entry, stats and the hit sparks / move titles every fighter shares.
 *  - FKit.skel / limb / lerpPose: a jointed body (torso, head, two-part arms and legs) posed by angles, so
 *    every move can be animated as choreography rather than a sprite that only leans.
 */
(function () {
  'use strict';
  const FK = window.FKit = {};

  // ---------------------------------------------------------------- audio (one shared context)
  let AC = null, out = null, nbuf = null;
  FK.ac = function () {
    if (AC) { if (AC.state === 'suspended') { try { AC.resume(); } catch (e) {} } return AC; }
    try {
      const C = window.AudioContext || window.webkitAudioContext; if (!C) return null;
      AC = new C(); out = AC.createGain(); out.gain.value = 0.22;
      const comp = AC.createDynamicsCompressor(); out.connect(comp); comp.connect(AC.destination);
    } catch (e) { AC = null; }
    return AC;
  };
  FK.tone = function (freq, o) {
    const a = FK.ac(); if (!a) return; o = o || {};
    const t = a.currentTime + (o.delay || 0), dur = o.dur || 0.15, v = o.vol == null ? 0.3 : o.vol;
    const osc = a.createOscillator(), g = a.createGain();
    osc.type = o.type || 'triangle'; osc.frequency.setValueAtTime(freq, t);
    if (o.slide) osc.frequency.exponentialRampToValueAtTime(Math.max(20, o.slide), t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(v, t + (o.att || 0.008)); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g); g.connect(out); osc.start(t); osc.stop(t + dur + 0.05);
  };
  FK.noise = function (o) {
    const a = FK.ac(); if (!a) return; o = o || {};
    if (!nbuf) { nbuf = a.createBuffer(1, a.sampleRate, a.sampleRate); const d = nbuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; }
    const t = a.currentTime + (o.delay || 0), dur = o.dur || 0.2, v = o.vol == null ? 0.25 : o.vol;
    const src = a.createBufferSource(); src.buffer = nbuf; src.loop = true;
    const fl = a.createBiquadFilter(); fl.type = o.ftype || 'bandpass'; fl.Q.value = o.q || 1.5;
    fl.frequency.setValueAtTime(o.cut || 1500, t); if (o.cutEnd) fl.frequency.exponentialRampToValueAtTime(o.cutEnd, t + dur);
    const g = a.createGain(); g.gain.setValueAtTime(v, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(fl); fl.connect(g); g.connect(out); src.start(t); src.stop(t + dur + 0.05);
  };
  FK.thud = function (big) { FK.tone(big ? 70 : 110, { type: 'sine', dur: big ? 0.5 : 0.25, slide: 35, vol: big ? 0.9 : 0.6 }); FK.noise({ dur: big ? 0.25 : 0.1, cut: big ? 600 : 1500, cutEnd: 200, q: 1, vol: big ? 0.35 : 0.2 }); };
  FK.whoosh = function (up, big) { FK.noise({ dur: big ? 0.3 : 0.18, cut: up ? 500 : 3000, cutEnd: up ? 3400 : 500, q: 3, vol: big ? 0.24 : 0.15 }); };
  FK.smack = function (big) { FK.noise({ dur: 0.06, cut: 2600, q: 1, vol: big ? 0.32 : 0.22 }); FK.tone(big ? 330 : 520, { dur: 0.08, slide: 180, vol: 0.14 }); };

  // ---------------------------------------------------------------- world helpers
  const BLOCK = FK.BLOCK = new Set(['solid', 'ice', 'crumble', 'mover', 'half']);
  FK.blocked = function (x, y, w, h) {
    const wd = window._gameWorld; if (!wd || !wd.tiles) return false;
    for (let tx = Math.floor(x); tx <= Math.floor(x + w - 1e-3); tx++)
      for (let ty = Math.floor(y); ty <= Math.floor(y + h - 1e-3); ty++) {
        const tl = wd.tiles.get(tx + ',' + ty); if (tl && BLOCK.has(tl.type)) return true;
      }
    return false;
  };
  FK.ex = e => e.x + (e.w || 0.9) / 2;
  FK.ey = e => e.y + (e.h || 0.9) / 2;
  FK.foes = () => (window._gameEnemies || []).filter(e => e && !e.dead);
  FK.within = (x, y, r) => FK.foes().filter(e => { const dx = FK.ex(e) - x, dy = FK.ey(e) - y; return dx * dx + dy * dy <= r * r; });
  FK.msg = s => { if (window._setMessage) window._setMessage(s); };
  FK.shake = n => { if (window._getScreenShake && window._setScreenShake) window._setScreenShake(Math.max(window._getScreenShake() || 0, n)); };
  FK.hitstop = s => { window._ppHitstop = Math.max(window._ppHitstop || 0, s); };
  FK.pcx = p => p.x + p.w / 2;
  FK.pcy = p => p.y + p.h / 2;
  FK.inSmash = () => !!(window.__smash && window.__smash.active);
  FK.face = p => (p.dashDir || p.lastMoveDir || 1) >= 0 ? 1 : -1;
  FK.ease = u => u < 0 ? 0 : u > 1 ? 1 : u * u * (3 - 2 * u);
  FK.easeOut = u => { u = Math.max(0, Math.min(1, u)); return 1 - (1 - u) * (1 - u); };
  FK.keys = function () {
    const keys = window._gameKeys || new Set(), mk = window.mobileKeys || {};
    return {
      up: keys.has('arrowup') || keys.has('w') || !!mk.up, down: keys.has('arrowdown') || !!mk.down,
      right: keys.has('arrowright') || keys.has('d') || !!mk.right, left: keys.has('arrowleft') || keys.has('a') || !!mk.left,
      jump: keys.has(' ') || keys.has('w') || keys.has('arrowup') || !!mk.jump,
    };
  };
  // hit a foe: damage, knockback, stun and a hit spark (Smash reads the damage and knockback as percent and launch)
  FK.hit = function (S, e, dmg, o) {
    o = o || {};
    e.hp = Math.max(0, (e.hp || 1) - Math.max(1, Math.round(dmg)));
    e.hitFlash = 0.5;
    if (o.stun) e.stunTimer = Math.max(e.stunTimer || 0, o.stun);
    if (!e._noKnockback) { if (o.kx != null) e.vx = o.kx; if (o.ky != null) e.vy = o.ky; }
    if (S) S.fx.push({ k: 'spark', x: FK.ex(e), y: FK.ey(e), ang: Math.atan2(o.ky || -1, o.kx || 0.001), t: 0, life: o.big ? 0.45 : 0.3, c: o.c || '#ffffff', big: !!o.big });
    if (o.big) FK.shake(o.shake || 6);
    if (o.stop) FK.hitstop(o.stop);
    if (e.hp <= 0 && !e.dead && window._killEnemy) window._killEnemy(e);
  };
  FK.label = function (S, p, text, c, big) { S.fx.push({ k: 'pop', x: FK.pcx(p), y: p.y - 0.25, t: 0, life: big ? 0.85 : 0.6, text, c: c || '#ffffff', big: !!big }); };

  // ---------------------------------------------------------------- drawing helpers (screen space)
  FK.glow = function (ctx, col, a) { ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = Math.max(0, Math.min(1, a)); ctx.fillStyle = col; ctx.strokeStyle = col; };
  FK.solid = function (ctx, col, a) { ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = a == null ? 1 : Math.max(0, Math.min(1, a)); ctx.fillStyle = col; ctx.strokeStyle = col; };
  // a ribbon through points, thick at the start and pointed at the end
  FK.taper = function (ctx, pts, w0, col, a, core) {
    if (pts.length < 2) return;
    const L = [], R = [];
    for (let i = 0; i < pts.length; i++) {
      const p0 = pts[Math.max(0, i - 1)], p1 = pts[Math.min(pts.length - 1, i + 1)];
      let nx = -(p1[1] - p0[1]), ny = p1[0] - p0[0]; const d = Math.hypot(nx, ny) || 1; nx /= d; ny /= d;
      const w = w0 * Math.pow(1 - i / (pts.length - 1), 0.7);
      L.push([pts[i][0] + nx * w, pts[i][1] + ny * w]); R.push([pts[i][0] - nx * w, pts[i][1] - ny * w]);
    }
    ctx.beginPath(); ctx.moveTo(L[0][0], L[0][1]); for (const q of L) ctx.lineTo(q[0], q[1]); for (let i = R.length - 1; i >= 0; i--) ctx.lineTo(R[i][0], R[i][1]); ctx.closePath();
    FK.glow(ctx, col, a * 0.85); ctx.fill();
    if (core !== false) { ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]); for (const q of pts) ctx.lineTo(q[0], q[1]); FK.glow(ctx, '#ffffff', a * 0.7); ctx.lineWidth = Math.max(1, w0 * 0.25); ctx.stroke(); }
  };
  // a crescent along an arc, tapered at both ends (sweeps, swings)
  FK.crescent = function (ctx, cx, cy, r, a0, a1, thick, col, a) {
    if (a1 < a0) { const t = a0; a0 = a1; a1 = t; }
    const n = 20; ctx.beginPath();
    for (let i = 0; i <= n; i++) { const an = a0 + (a1 - a0) * i / n; ctx.lineTo(cx + Math.cos(an) * r, cy + Math.sin(an) * r); }
    for (let i = n; i >= 0; i--) { const u = i / n, an = a0 + (a1 - a0) * u, rr = r - thick * Math.sin(Math.PI * u); ctx.lineTo(cx + Math.cos(an) * rr, cy + Math.sin(an) * rr); }
    ctx.closePath(); FK.glow(ctx, col, a); ctx.fill();
    ctx.beginPath(); for (let i = 0; i <= n; i++) { const an = a0 + (a1 - a0) * i / n; ctx.lineTo(cx + Math.cos(an) * r, cy + Math.sin(an) * r); }
    FK.glow(ctx, '#ffffff', a * 0.9); ctx.lineWidth = 1.5; ctx.stroke();
  };
  FK.star = function (ctx, x, y, r, rot, col, a, pts) {
    pts = pts || 4; ctx.beginPath();
    for (let i = 0; i < pts * 2; i++) { const an = rot + i * Math.PI / pts, rr = i % 2 ? r * 0.28 : r; ctx.lineTo(x + Math.cos(an) * rr, y + Math.sin(an) * rr); }
    ctx.closePath(); FK.glow(ctx, col, a); ctx.fill();
  };
  // a ground shockwave: a flat ring plus chunks of floor thrown up
  FK.shock = function (ctx, x, fy, R, u, col, T) {
    const a = 1 - u, r = R * (0.25 + 0.75 * FK.easeOut(u * 1.6));
    ctx.beginPath(); ctx.ellipse(x, fy, r, r * 0.22, 0, 0, Math.PI * 2); FK.glow(ctx, col, a); ctx.lineWidth = 6 * a + 1; ctx.stroke();
    ctx.beginPath(); ctx.ellipse(x, fy, r * 0.7, r * 0.15, 0, 0, Math.PI * 2); FK.glow(ctx, '#ffffff', a * 0.7); ctx.lineWidth = 2; ctx.stroke();
    for (let i = 0; i < 10; i++) {
      const s = i % 2 ? 1 : -1, d = (0.25 + (i * 0.37 % 1) * 0.75) * r, hgt = Math.sin(Math.min(1, u * 1.4) * Math.PI) * T * (0.4 + (i * 0.53 % 1) * 0.6);
      FK.solid(ctx, i % 3 ? '#8a7a6a' : '#b8a690', a); ctx.save(); ctx.translate(x + s * d, fy - hgt); ctx.rotate(u * 8 * s + i); ctx.fillRect(-T * 0.08, -T * 0.08, T * 0.16, T * 0.13); ctx.restore();
    }
  };
  FK.popText = function (ctx, text, x, y, u, c, big) {
    const sc = (u < 0.12 ? 0.5 + u / 0.12 * 0.75 : 1.25 - Math.min(0.25, (u - 0.12) * 0.9)) * (big ? 1.35 : 1);
    ctx.save(); ctx.translate(x, y); ctx.transform(1, 0, -0.2, 1, 0, 0); ctx.scale(sc, sc);
    ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = Math.min(1, (1 - u) * 1.8);
    ctx.font = '900 13px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.lineWidth = 5; ctx.strokeStyle = '#120d1a'; ctx.strokeText(text, 0, 0);
    ctx.lineWidth = 2; ctx.strokeStyle = c; ctx.strokeText(text, 0, 0);
    ctx.fillStyle = '#ffffff'; ctx.fillText(text, 0, 0); ctx.restore();
  };
  // the shared effects every fighter pushes into its state: hit sparks, move titles, bursts, rings
  FK.drawFx = function (ctx, V, list, custom) {
    const T = V.T;
    for (const f of list) {
      const u = f.t / f.life, a = 1 - u;
      if (custom && custom(ctx, V, f, u, a)) continue;
      if (f.k === 'spark') {
        const x = V.SX(f.x), y = V.SY(f.y), R = T * (f.big ? 1.0 : 0.6);
        FK.star(ctx, x, y, R * (0.5 + u), f.ang + u, '#ffffff', a);
        ctx.beginPath(); ctx.arc(x, y, R * (0.4 + u * 1.1), 0, Math.PI * 2); FK.glow(ctx, f.c, a); ctx.lineWidth = 3 * a + 1; ctx.stroke();
        for (let i = 0; i < 7; i++) { const an = f.ang + (i - 3) * 0.32, r1 = R * (0.5 + u), r2 = R * (0.9 + u * 1.8); ctx.beginPath(); ctx.moveTo(x + Math.cos(an) * r1, y + Math.sin(an) * r1); ctx.lineTo(x + Math.cos(an) * r2, y + Math.sin(an) * r2); FK.glow(ctx, f.c, a); ctx.lineWidth = 2.2; ctx.stroke(); }
      } else if (f.k === 'pop') FK.popText(ctx, f.text, V.SX(f.x), V.SY(f.y) - 14 - f.t * 22, u, f.c, f.big);
      else if (f.k === 'shock') FK.shock(ctx, V.SX(f.x), V.SY(f.y), f.R * T, u, f.c || '#ffd166', T);
      else if (f.k === 'ring') { ctx.beginPath(); ctx.arc(V.SX(f.x), V.SY(f.y), T * f.R * (0.3 + 0.7 * FK.easeOut(u)), 0, Math.PI * 2); FK.glow(ctx, f.c, a); ctx.lineWidth = 4 * a + 1; ctx.stroke(); }
      else if (f.k === 'flash') { ctx.beginPath(); ctx.arc(V.SX(f.x), V.SY(f.y), T * f.R * (0.6 + u), 0, Math.PI * 2); FK.glow(ctx, f.c || '#ffffff', a * 0.55); ctx.fill(); }
      else if (f.k === 'dust') { ctx.beginPath(); ctx.arc(V.SX(f.x) + (f.vx || 0) * f.t * T, V.SY(f.y) - u * T * 0.3, T * (0.08 + u * 0.22), 0, Math.PI * 2); FK.solid(ctx, f.c || '#d8d0c4', a * 0.5); ctx.fill(); }
    }
  };

  // ---------------------------------------------------------------- the jointed body
  // pose angles in radians: 0 points straight down, + swings toward the way the fighter faces.
  //  { x, y (offset in units, + = down), lean (torso, + = forward), head, aF/aB: [shoulder, elbow], lF/lB: [hip, knee] }
  //  F = the limb nearer the camera, B = the far one. Elbows bend + (forward), knees bend - (back).
  // P (proportions in units): { hip, torso, neck, head, ua, fa, th, sh }
  FK.pose = function (o) { return Object.assign({ x: 0, y: 0, lean: 0, head: 0, aF: [0.2, 0.4], aB: [-0.2, 0.4], lF: [0.1, -0.1], lB: [-0.1, -0.1] }, o || {}); };
  FK.lerpPose = function (a, b, u) {
    const o = {};
    for (const k in b) {
      const va = a[k], vb = b[k];
      if (Array.isArray(vb)) o[k] = [(va ? va[0] : vb[0]) + (vb[0] - (va ? va[0] : vb[0])) * u, (va ? va[1] : vb[1]) + (vb[1] - (va ? va[1] : vb[1])) * u];
      else if (typeof vb === 'number') o[k] = (va == null ? vb : va) + (vb - (va == null ? vb : va)) * u;
      else o[k] = vb;
    }
    return o;
  };
  // keyframes [[t, pose], ...] sampled at time t with smoothstep between frames
  FK.keyed = function (frames, t) {
    if (t <= frames[0][0]) return frames[0][1];
    for (let i = 1; i < frames.length; i++) if (t <= frames[i][0]) { const [t0, p0] = frames[i - 1], [t1, p1] = frames[i]; return FK.lerpPose(p0, p1, FK.ease((t - t0) / (t1 - t0))); }
    return frames[frames.length - 1][1];
  };
  FK.skel = function (P, q, cx, fy, s) {
    const hip = [cx + q.x * s, fy - P.hip * s + q.y * s];
    const dir = a => [Math.sin(a), Math.cos(a)];
    const neck = [hip[0] + Math.sin(q.lean) * P.torso * s, hip[1] - Math.cos(q.lean) * P.torso * s];
    const ha = q.lean + q.head, head = [neck[0] + Math.sin(ha) * (P.neck + P.head) * s, neck[1] - Math.cos(ha) * (P.neck + P.head) * s];
    const arm = (A, side) => { const sh = [neck[0] + side * s * 0.6, neck[1] + s * 0.8]; const d1 = dir(A[0]), el = [sh[0] + d1[0] * P.ua * s, sh[1] + d1[1] * P.ua * s]; const d2 = dir(A[0] + A[1]); return [sh, el, [el[0] + d2[0] * P.fa * s, el[1] + d2[1] * P.fa * s]]; };
    const leg = (L, side) => { const h = [hip[0] + side * s * 0.5, hip[1]]; const d1 = dir(L[0]), kn = [h[0] + d1[0] * P.th * s, h[1] + d1[1] * P.th * s]; const d2 = dir(L[0] + L[1]); return [h, kn, [kn[0] + d2[0] * P.sh * s, kn[1] + d2[1] * P.sh * s]]; };
    return { hip, neck, head, hr: P.head * s, aF: arm(q.aF, 1), aB: arm(q.aB, -1), lF: leg(q.lF, 1), lB: leg(q.lB, -1), lean: q.lean, s };
  };
  FK.limb = function (ctx, pts, w, col, w2) {
    ctx.strokeStyle = col; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.lineWidth = w; ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]); ctx.lineTo(pts[1][0], pts[1][1]); ctx.stroke();
    ctx.lineWidth = w2 || w; ctx.beginPath(); ctx.moveTo(pts[1][0], pts[1][1]); ctx.lineTo(pts[2][0], pts[2][1]); ctx.stroke();
  };
  // body-local point (forward/up offsets from a joint along the torso) in screen space, facing f
  FK.local = function (V, p, f, lx, ly) { return [V.SX(FK.pcx(p) + f * lx), V.SY(p.y + p.h - ly)]; };

  // ---------------------------------------------------------------- parry outside Smash
  const bolts = [];
  window.PPParry = {
    parry(proj) {
      const p = window._gamePlayer; if (!p) return;
      p._parryT = 0; p._protagRetaliateTimer = 0; p._parried = 0.45;
      p.hpInvuln = Math.max(p.hpInvuln || 0, 0.5);
      const cx = FK.pcx(p), cy = FK.pcy(p), list = FK.foes();
      let near = null, nd = 99, any = null, ad = 99;
      for (const e of list) { const d = Math.hypot(FK.ex(e) - cx, FK.ey(e) - cy); if (d < nd) { nd = d; near = e; } if (d < ad && d < 16) { ad = d; any = e; } }
      FK.hitstop(0.08); FK.shake(6); FK.tone(1200, { dur: 0.12, vol: 0.18 }); FK.tone(1800, { dur: 0.2, vol: 0.12, delay: 0.03 });
      const melee = !proj && near && nd < 2.8;
      p._parryFar = !melee; p._parryDir = near ? (Math.sign(FK.ex(near) - cx) || 1) : FK.face(p);
      if (melee) {
        if (p._parryGrab) {}   // a grappler's parry turns into its own grab
        else if (window.selectedCharacter === 'cb_protagonist' && window.protagFireRetaliateCounter) window.protagFireRetaliateCounter();
        else for (const e of list) if (Math.hypot(FK.ex(e) - cx, FK.ey(e) - cy) < 2.8) FK.hit(null, e, 3, { kx: (Math.sign(FK.ex(e) - cx) || 1) * 11, ky: -7, stun: 0.6 });
        FK.msg('🛡️ PARRY!');
      } else {
        const b = { x: cx, y: cy, tgt: any, t: 0, trail: [], vx: 0, vy: 0, dmg: 3 };
        if (!any && proj) { b.vx = -(proj.vx || 0) * 1.6; b.vy = -(proj.vy || 0) * 1.6; }
        bolts.push(b);
        FK.msg('🛡️ REFLECT!');
      }
    },
    bolts,
  };
  (window._rafHubTickers = window._rafHubTickers || []).push(function (dt) {
    const p = window._gamePlayer;
    if (p && p._parried > 0) p._parried -= dt;
    for (let i = bolts.length - 1; i >= 0; i--) {
      const b = bolts[i]; b.t += dt; b.trail.push([b.x, b.y]); if (b.trail.length > 8) b.trail.shift();
      if (b.tgt && !b.tgt.dead) {
        const dx = FK.ex(b.tgt) - b.x, dy = FK.ey(b.tgt) - b.y, d = Math.hypot(dx, dy) || 1, sp = 24 * dt;
        if (d < sp + 0.5) { FK.hit(null, b.tgt, b.dmg, { kx: Math.sign(dx || 1) * 9, ky: -6, stun: 0.5 }); bolts.splice(i, 1); continue; }
        b.x += dx / d * sp; b.y += dy / d * sp;
      } else { b.x += b.vx * dt; b.y += b.vy * dt; }
      if (b.t > 2.5) bolts.splice(i, 1);
    }
  });
  const _prevDraw = window.drifterDrawHook;
  window.drifterDrawHook = function (ctx, now2, cam) {
    if (_prevDraw) _prevDraw(ctx, now2, cam);
    if (!bolts.length) return;
    const T = window._TILE || 40, cx0 = cam ? cam.x : 0, cy0 = cam ? cam.y : 0;
    ctx.save();
    for (const b of bolts) {
      b.trail.forEach((q, j) => { const a = (j + 1) / b.trail.length; FK.glow(ctx, '#7cdbff', 0.5 * a); ctx.beginPath(); ctx.arc(q[0] * T - cx0, q[1] * T - cy0, T * 0.22 * a, 0, Math.PI * 2); ctx.fill(); });
      FK.glow(ctx, '#ffffff', 1); ctx.beginPath(); ctx.arc(b.x * T - cx0, b.y * T - cy0, T * 0.2, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
  };

  // ---------------------------------------------------------------- define a fighter
  // spec: { id, plug, def, stats, statMod(S), moves, mfd, fresh(), can(key,S,p), pressS(p,S,k), busy(S),
  //         act: { ground_neutral(p,f,pw,S) -> optional title, ... }, step(p,dt,S,k,jumpEdge), onTeleport(p,S),
  //         drawBody(ctx,px,py,pw,ph,t,S,p), drawWorld(ctx,V,S), drawFx(ctx,V,f,u,a) -> true if handled, ai(info), keys }
  FK.define = function (C) {
    const ID = C.id;
    const fresh = () => Object.assign({ active: false, atkCD: 0, fx: [], lastPX: null, lastPY: null, prevJump: false }, C.fresh());
    let S = fresh();
    try {
      const owned = JSON.parse(localStorage.getItem('obby_cbox_owned') || '[]');
      if (!owned.includes(ID)) { owned.push(ID); localStorage.setItem('obby_cbox_owned', JSON.stringify(owned)); }
    } catch (e) {}
    const isOwned = () => { try { return JSON.parse(localStorage.getItem('obby_cbox_owned') || '[]').includes(ID); } catch (e) { return false; } };
    const stats = () => Object.assign({}, C.stats, C.statMod ? C.statMod(S) : {});
    let statKey = '';
    const syncStats = force => {
      const st = stats(), key = JSON.stringify(st);
      if (!force && key === statKey) return; statKey = key;
      window._gtCharStatCache = window._gtCharStatCache || {}; window._gtCharStatCache[ID] = st;
    };
    const register = () => {
      if (window.CBOX_CHARS_DEF && !window.CBOX_CHARS_DEF.find(c => c.id === ID)) window.CBOX_CHARS_DEF.push(Object.assign({ id: ID }, C.def));
      if (window.cboxOwnedChars) window.cboxOwnedChars.add(ID);
      syncStats(true);
    };
    if (window.UNIVERSAL_PUNCH_EXCLUDED_CHARS) window.UNIVERSAL_PUNCH_EXCLUDED_CHARS.add(ID);
    // the body is posed by the fighter itself: the strike engine leaves it alone
    if (window.PPStrikeStyles) window.PPStrikeStyles[ID] = { ownAim: true, windup: () => ({}), live: () => ({}), endlag: () => ({}) };

    const _prevSlash = window.performSlash;
    window.performSlash = function () {
      if (window.selectedCharacter !== ID) { if (_prevSlash) return _prevSlash.apply(this, arguments); return; }
      const p = window._gamePlayer; if (!p) return;
      if (C.pressS && C.pressS(p, S, FK.keys())) return;
      if (S.atkCD > 0 || (C.busy && C.busy(S))) return;
      const pick = () => {
        const q = window._gamePlayer; if (!q || window.selectedCharacter !== ID || (C.busy && C.busy(S))) return null;
        const k = FK.keys(), stance = (q.onGround || (S.airT || 0) < 0.12) ? 'ground' : 'air';   // (↑ is also jump: ↑ + S on the ground is still the ground move)
        const dir = (k.down && !k.up) ? 'down' : (k.up && !k.down) ? 'up' : (k.left || k.right) ? 'side' : 'neutral';
        const key = stance + '_' + dir, mv = C.moves[stance][dir];
        const no = C.can ? C.can(key, S, q) : null; if (no) { FK.msg(C.def.icon + ' ' + no); return null; }
        return { key, mv, f: k.right ? 1 : k.left ? -1 : FK.face(q) };
      };
      const fire = (sel, pw) => {
        const q = window._gamePlayer; if (!q) return;
        pw = pw || 0; S.atkCD = sel.mv.cd;
        q.dashDir = sel.f; q.lastMoveDir = sel.f;
        const own = C.act[sel.key](q, sel.f, pw, S);
        const name = own || (pw > 0.3 && sel.mv.big ? sel.mv.big : sel.mv.name.toUpperCase());
        FK.label(S, q, name, pw > 0.3 || own ? C.def.color2 || '#ffd166' : C.def.color, pw > 0.3);
        FK.msg(C.def.icon + ' ' + name + '!');
      };
      if (window.PPStrike) {
        window.PPStrike.press(() => { const sel = pick(); return sel && { fd: C.mfd[sel.key] || {}, dir: sel.f, color: C.def.color, aim: sel.key.split('_')[1], fire: pw => fire(sel, pw) }; }, true);
        return;
      }
      const sel = pick(); if (sel) fire(sel, 0);
    };

    function step(dt) {
      const playing = window.selectedCharacter === ID && (!window._gameMode || window._gameMode() === 'play');
      if (!playing) { if (S.active) { const f = fresh(); for (const k in S) delete S[k]; Object.assign(S, f); } S.active = false; return; }
      const p = window._gamePlayer; if (!p) return;
      if (!S.active) { const keep = S.fx; Object.assign(S, fresh()); S.fx = keep; syncStats(true); }
      S.active = true;
      const k = FK.keys(), jumpEdge = k.jump && !S.prevJump;
      if (S.lastPX != null && (Math.abs(p.x - S.lastPX) > 4 || Math.abs(p.y - S.lastPY) > 4) && !S.selfMove) { if (C.onTeleport) C.onTeleport(p, S); }
      S.selfMove = false;
      if (S.atkCD > 0) S.atkCD = Math.max(0, S.atkCD - dt);
      if (p._parryT > 0) p._parryT = Math.max(0, p._parryT - dt);
      if (p._armorT > 0) p._armorT = Math.max(0, p._armorT - dt);
      if (p._grabInv > 0) p._grabInv = Math.max(0, p._grabInv - dt);
      if (window._fighterPass && p._parried > 0) p._parried -= dt;   // (yours wears off in PPParry's tick)
      S.airT = p.onGround ? 0 : (S.airT || 0) + dt;
      C.step(p, dt, S, k, jumpEdge);
      for (let i = S.fx.length - 1; i >= 0; i--) { S.fx[i].t += dt; if (S.fx[i].t >= S.fx[i].life) S.fx.splice(i, 1); }
      S.prevJump = k.jump; S.lastPX = p.x; S.lastPY = p.y;
      syncStats(false);
    }
    (window._rafHubTickers = window._rafHubTickers || []).push(step);

    const _origDraw = window.cboxCharDraw;
    window.cboxCharDraw = function (charId, ctx, px, py, pw, ph, now2) {
      if (charId !== ID) { if (_origDraw) return _origDraw(charId, ctx, px, py, pw, ph, now2); return; }
      if (!isFinite(px) || !isFinite(py) || !isFinite(pw) || !isFinite(ph) || pw <= 0 || ph <= 0) return;
      const p = window.selectedCharacter === ID ? window._gamePlayer : null;   // previews (menus) draw without a live body
      ctx.save();
      try { C.drawBody(ctx, px, py, pw, ph, now2 || Date.now() / 1000, p ? S : null, p); } catch (e) {}
      ctx.restore();
    };
    function drawWorld(ctx, cam) {
      const p = window._gamePlayer; if (!p || !S.active) return;
      const T = window._TILE || 40, cx0 = cam ? cam.x : 0, cy0 = cam ? cam.y : 0;
      const V = { T, SX: x => x * T - cx0, SY: y => y * T - cy0, now: performance.now() / 1000, p };
      ctx.save(); ctx.lineJoin = 'round'; ctx.lineCap = 'round'; ctx.shadowBlur = 0;
      try { if (C.drawWorld) C.drawWorld(ctx, V, S); } catch (e) {}
      FK.drawFx(ctx, V, S.fx, C.drawFx);
      ctx.restore();
    }
    const _prevHook = window.drifterDrawHook;
    window.drifterDrawHook = function (ctx, now2, cam) {
      if (_prevHook) _prevHook(ctx, now2, cam);
      if (window.selectedCharacter !== ID) return;
      try { drawWorld(ctx, cam); } catch (e) {}
    };
    // a second fighter (Smash CPU) playing this fighter keeps its own state; your buttons stay yours
    (window._fighterPlugins = window._fighterPlugins || []).push({ name: C.plug, char: ID,
      swap(s) { const o = S; S = s || fresh(); statKey = ''; syncStats(true); return o; },
      tick: dt => { if (window.selectedCharacter === ID) step(dt); },
      draw: (ctx, now2, cam) => { if (window.selectedCharacter === ID) drawWorld(ctx, cam); },
      keys: C.keys, ai: C.ai,
    });
    let tries = 0;
    (function hook() {
      if (!window.injectCboxCharButtons || !window.CBOX_CHARS_DEF) { if (++tries < 80) setTimeout(hook, 100); return; }
      const flag = '_fk_' + ID;
      if (!window.injectCboxCharButtons[flag]) {
        const orig = window.injectCboxCharButtons;
        window.injectCboxCharButtons = function () { if (isOwned()) register(); orig(); };
        for (const k in orig) if (k.indexOf('_') === 0) window.injectCboxCharButtons[k] = orig[k];
        window.injectCboxCharButtons[flag] = true;
      }
      if (isOwned()) { register(); window.injectCboxCharButtons(); }
    })();
    return { state: () => S };
  };
})();
