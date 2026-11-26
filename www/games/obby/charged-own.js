/* Obby Builder: OWN CHARGED SPECIALS for the Brawler, Slugger, Arch Mage, Conduit, the Press Play Prodigy
 * (a different set for each of its three EQ modes) and the Press Play Mixtape (a different set for each side of
 * the tape). Before, these six shared the strike engine's generic shapes (a beam, a pillar, a ring...); now each
 * has its own, like Gale, Phantom Ace, Chroma, the Elemental Spirit and the fighter-kit fighters.
 *
 * Hold S past the charge threshold and let go: the direction you hold (neutral / side / up / down) and whether
 * you are on the ground or in the air pick one of 8 specials. Holding longer (charge power) makes it hit harder
 * and reach further. In Smash the Arch Mage's and the Conduit's air up special is their recovery: once per
 * airtime, like before.
 *
 *  🥊 BRAWLER   ground: ONE-INCH PUNCH, METEOR RUSH (carries foes), RISING DRAGON (lifts), FAULT BREAKER
 *               air:    HURRICANE FISTS, COMET KNUCKLE, DRAGON ASCENT, METEOR DROP
 *  🥊 SLUGGER   ground: GLOVE GATLING, HOME RUN (tip it!), SKYLINE UPPERCUT (lifts), POUND TOWN
 *               air:    GLOVE BOOMERANGS, CORKSCREW CANNON, ROCKET HOOK, HAMMER STORM
 *  🧙 ARCH MAGE ground: ARCANE ORB, MAGIC MISSILES, METEOR CALL, RUNE PRISON
 *               air:    STARFALL HALO, FIRE SPEAR, ARCANE ASCENT (recovery), ARCANE COLLAPSE
 *  ⚡ CONDUIT   ground: TESLA COIL, RAILGUN, THUNDERHEAD, OVERLOAD NOVA
 *               air:    BALL LIGHTNING, LIGHTNING STEP, LIGHTNING RIDE (recovery), LIGHTNING ROD
 *  🎧 PRODIGY   🎼 CRESCENDO  ground: CHORD BLAST, LASER SYNTH, RISER BLAST, SIDECHAIN PUMP
 *                             air:    ARPEGGIO STORM, GLISSANDO, OCTAVE LEAP, KEY CHANGE (flips foes to your other side)
 *               🔊 TITAN BASS ground: BASS CANNON, WALL OF SOUND, WOOFER GEYSER, SUB DROP
 *                             air:    SPEAKER STACK, BASS DIVE, AMP LAUNCH, TITAN QUAKE
 *               🌊 DEEP RES.  ground: RESONANCE CASCADE, SONIC SPEAR, HARMONIC TOWER, SHATTERPOINT
 *                             air:    ECHO CHAMBER, DOPPLER DASH, OVERTONE RISE, GRAVE BELL
 *               (pressed on the beat: +25% damage)
 *  📼 MIXTAPE   SIDE A ground: TAPE TORNADO, REWIND RUSH, PAUSE / PLAY, SPOOL SNARE
 *                      air:    MIXTAPE MEDLEY, FAST FORWARD, LOOP PEDAL, EJECT METEOR
 *               RIBBON ground: RIBBON DANCE, LASSO, MAYPOLE, TRIPWIRE
 *                      air:    COCOON, SLINGSHOT, SKYHOOK SWING, BINDING PLUMMET
 *
 * The strike engine (index.html, "CHARGED SPECIALS") asks window.__ppOwn for the special, ticks and draws it, and
 * swaps its state for a second fighter (Smash CPU) along with its own.
 */
(function () {
  'use strict';
  const OWN = new Set(['brawler', 'cb_slugger', 'archmage', 'conduit', 'cb_pressplay', 'cb_pp_mixtape']);
  const fresh = () => ({ ents: [], fx: [] });
  let S = fresh();

  // ---------------------------------------------------------------- helpers
  const P = () => window._gamePlayer;
  const foes = () => (window._gameEnemies || []).filter(e => e && !e.dead);
  const pcx = p => p.x + p.w / 2, pcy = p => p.y + p.h / 2;
  const ex = e => e.x + (e.w || 0.9) / 2, ey = e => e.y + (e.h || 0.9) / 2;
  const nowS = () => (window.performance ? performance.now() : Date.now()) / 1000;
  const away = (e, x) => (ex(e) >= x ? 1 : -1);
  const SOLID = new Set(['solid', 'ice', 'crumble', 'mover', 'half']);
  function blocked(x, y, w, h) {
    const wd = window._gameWorld; if (!wd || !wd.tiles) return false;
    for (let tx = Math.floor(x); tx <= Math.floor(x + w - 1e-3); tx++) for (let ty = Math.floor(y); ty <= Math.floor(y + h - 1e-3); ty++) { const t = wd.tiles.get(tx + ',' + ty); if (t && SOLID.has(t.type)) return true; }
    return false;
  }
  const pointSolid = (x, y) => blocked(x - 0.05, y - 0.05, 0.1, 0.1);
  function floorBelow(x, y, maxD) { for (let d = 0; d < (maxD || 12); d += 0.25) if (pointSolid(x, y + d)) return Math.floor(y + d); return null; }
  function shake(n) { if (window._getScreenShake && window._setScreenShake) window._setScreenShake(Math.max(window._getScreenShake() || 0, n)); }
  function hitstop(s) { window._ppHitstop = Math.max(window._ppHitstop || 0, s); }
  function msg(s) { if (window._setMessage) window._setMessage(s); }
  function tele() { if (window.PPStrike && window.PPStrike._tele) window.PPStrike._tele(); }
  const inSmash = () => !!(window.__smash && window.__smash.active);
  function canDrag(e) {
    if (e._noKnockback || e._held) return false;
    const sm = window.__smash;
    return !(sm && sm.active && sm.__canHold && !sm.__canHold(e));
  }
  // pull a foe toward a point (sideways always; up and down only for Smash fighters and fliers)
  function drag(e, tx, ty, sp, dt) {
    if (!canDrag(e)) return;
    const w = e.w || 0.9, h = e.h || 0.9;
    const dx = tx - ex(e), sx = Math.sign(dx) * Math.min(Math.abs(dx), sp * dt);
    if (sx && !blocked(e.x + sx, e.y + 0.02, w, h - 0.08)) e.x += sx;
    if (ty != null && (inSmash() || e.flying || e.isFlying)) {
      const dy = ty - ey(e), sy = Math.sign(dy) * Math.min(Math.abs(dy), sp * 0.8 * dt);
      if (sy && !blocked(e.x, e.y + sy, w, h - 0.02)) e.y += sy;
    }
    e.vx = 0; if (ty != null) e.vy = 0;
  }
  function within(x, y, R) { return foes().filter(e => Math.hypot(ex(e) - x, ey(e) - y) < R + (e.w || 0.9) * 0.4); }
  function inBox(e, x0, x1, y0, y1) { const hw = (e.w || 0.9) / 2, hh = (e.h || 0.9) / 2, x = ex(e), y = ey(e); return x + hw > Math.min(x0, x1) && x - hw < Math.max(x0, x1) && y + hh > Math.min(y0, y1) && y - hh < Math.max(y0, y1); }
  function nearest(x, y, R, skip) { let b = null, bd = R; for (const e of foes()) { if (skip && skip.has(e)) continue; const d = Math.hypot(ex(e) - x, ey(e) - y); if (d < bd) { bd = d; b = e; } } return b; }
  function nearLine(e, x1, y1, x2, y2, w) {
    const dx = x2 - x1, dy = y2 - y1, L2 = dx * dx + dy * dy || 1, u = Math.max(0, Math.min(1, ((ex(e) - x1) * dx + (ey(e) - y1) * dy) / L2));
    return Math.hypot(ex(e) - (x1 + dx * u), ey(e) - (y1 + dy * u)) < w + (e.w || 0.9) * 0.4;
  }
  // o: kx, ky, stun, slow, burn, freeze, res (Deep Resonance stacks), c (spark colour), big (hit-stop + shake), tick (small rapid hit)
  function hit(e, dmg, o) {
    if (!e || e.dead) return;
    o = o || {};
    e.hp = Math.max(0, (e.hp || 1) - dmg);
    e.hitFlash = o.tick ? Math.max(e.hitFlash || 0, 0.2) : 0.5;
    if (!e._noKnockback) { if (o.kx != null) e.vx = o.kx; if (o.ky != null) e.vy = o.ky; }
    if (o.stun) e.stunTimer = Math.max(e.stunTimer || 0, o.stun);
    if (o.slow) e.slowTimer = Math.max(e.slowTimer || 0, o.slow);
    if (o.burn) e._ppBurn = Math.max(e._ppBurn || 0, o.burn);
    if (o.freeze) { e.stunTimer = Math.max(e.stunTimer || 0, o.freeze); e._ppFrozen = Math.max(e._ppFrozen || 0, o.freeze); }
    if (o.res) { e._ppRes = Math.min(4, (e._ppRes || 0) + o.res); e._ppResT = 5; }   // one short of the Prodigy's own shatter
    fxp({ k: 'spark', x: ex(e), y: ey(e), c: o.c || '#ffffff', life: 0.3, big: !!o.big });
    if (o.big) { hitstop(0.07); shake(7); }
    if (window.selectedCharacter === 'brawler' && window.__brCombo) window.__brCombo.land();   // the Brawler's specials build his combo
    if (e.hp <= 0 && window._killEnemy) window._killEnemy(e);
  }
  // each foe once per `gap` seconds of this entity's life (once ever without a gap)
  function once(o, e, gap) { o.hc = o.hc || new Map(); const t = o.hc.get(e); if (t != null && (gap == null || o.t - t < gap)) return false; o.hc.set(e, o.t); return true; }
  function add(o) { o.t = 0; S.ents.push(o); return o; }
  function after(d, fn) { return add({ life: d, end: fn }); }
  function fxp(o) { o.t = 0; o.life = o.life || 0.4; S.fx.push(o); return o; }
  function label(p, text, c) { fxp({ k: 'label', x: pcx(p), y: p.y - 0.6, text, c, life: 1.0 }); }
  function dust(x, y, c, n, sp) {
    const pt = window._gameParticles, T = window._TILE || 40; if (!pt) return;
    for (let i = 0; i < n; i++) { const a = Math.random() * Math.PI * 2, v = (sp || 5) * (0.4 + Math.random() * 0.6); pt.push({ x: x * T, y: y * T, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 1, life: 0.35 + Math.random() * 0.2, color: c, size: 2 + Math.random() * 3 }); }
  }
  // move the player, stopping at walls
  function slide(p, dx, dy) {
    const n = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dy)) / 0.2)); let moved = false;
    for (let i = 0; i < n; i++) {
      const nx = p.x + dx / n, ny = p.y + dy / n;
      if (!blocked(nx, ny + 0.02, p.w, p.h - 0.04)) { p.x = nx; p.y = ny; moved = true; }
      else if (dx && !blocked(nx, p.y + 0.02, p.w, p.h - 0.04)) { p.x = nx; moved = true; }
      else if (dy && !blocked(p.x, ny + 0.02, p.w, p.h - 0.04)) { p.y = ny; moved = true; }
      else return moved;
    }
    return moved;
  }
  // furthest clear distance along (dx, dy) up to D, for blinks
  function clearRun(p, dx, dy, D) { let d = 0; while (d + 0.25 <= D && !blocked(p.x + dx * (d + 0.25), p.y + dy * (d + 0.25) + 0.02, p.w, p.h - 0.04)) d += 0.25; return d; }

  // ---------------------------------------------------------------- building blocks
  // a dash that moves you: speed, dur, vy (sideways only without it), w (hit reach), onHit(e, me, p), end(me, p), draw
  function rush(p, f, o) {
    p.dashInvuln = Math.max(p.dashInvuln || 0, o.dur + 0.1);
    return add(Object.assign({ life: o.dur, f, trail: [] }, o, {
      step(me, dt, q) {
        const vy = typeof o.vy === 'function' ? o.vy(me) : (o.vy || 0);
        const ok = slide(q, f * o.speed * dt, vy * dt);
        q.vx = f * Math.min(o.speed, 6); if (!q.onGround || o.vy) q.vy = 0;
        me.trail.push([pcx(q), pcy(q)]); if (me.trail.length > 14) me.trail.shift();
        for (const e of foes()) if (Math.abs(ex(e) - pcx(q)) < (o.w || 1.0) + (e.w || 0.9) / 2 && Math.abs(ey(e) - pcy(q)) < 1.0 + (e.h || 0.9) / 2 && once(me, e, o.gap)) o.onHit(e, me, q);
        if (me.carry) for (const e of me.carry) if (!e.dead) drag(e, pcx(q) + f * 0.9, pcy(q), 40, dt);
        if (o.tick) o.tick(me, dt, q);
        if (!ok && o.wallStop !== false) { me.t = me.life; }
      },
    }));
  }
  // dive straight (or slanted) down until you land: vy, vx, onHit(e) on the way, land(x, fy, p)
  function dive(p, o) {
    p.vy = o.vy; p.dashInvuln = Math.max(p.dashInvuln || 0, 0.35);
    return add({ life: 1.8, o, step(me, dt, q) {
      q.vy = Math.max(q.vy, o.vy); if (o.vx != null) q.vx = o.vx;
      if (o.onHit) for (const e of foes()) if (Math.abs(ex(e) - pcx(q)) < 1.0 && ey(e) > q.y - 0.2 && ey(e) < q.y + q.h + 0.9 && once(me, e)) o.onHit(e, q);
      if (q.onGround && me.t > 0.02) { o.land(pcx(q), q.y + q.h, q); return true; }
    }, draw: o.draw });
  }
  // a projectile: x, y, vx, vy, g, life, r, pierce, home (turn rate), seek (radius), gap, wall ('stop' | 'pass'),
  // onHit(e, s), onEnd(s), draw(s, ctx, D)
  function shot(o) {
    return add(Object.assign({ life: 1.5, r: 0.35, pierce: 1, n: 0 }, o, {
      step(s, dt) {
        if (s.delay && s.t < s.delay) { if (s.hold) s.hold(s, dt); return; }
        if (s.home) {
          const tg = (s.tg && !s.tg.dead) ? s.tg : (s.tg = nearest(s.x, s.y, s.seek || 9));
          if (tg) { const a = Math.atan2(ey(tg) - s.y, ex(tg) - s.x), sp = Math.hypot(s.vx, s.vy) || 1, cur = Math.atan2(s.vy, s.vx);
            let da = a - cur; while (da > Math.PI) da -= Math.PI * 2; while (da < -Math.PI) da += Math.PI * 2;
            const na = cur + Math.max(-s.home * dt, Math.min(s.home * dt, da)); s.vx = Math.cos(na) * sp; s.vy = Math.sin(na) * sp; }
        }
        if (s.g) s.vy += s.g * dt;
        if (s.move) s.move(s, dt); else { s.x += s.vx * dt; s.y += s.vy * dt; }
        if (s.wall !== 'pass' && pointSolid(s.x, s.y)) { if (s.onEnd) s.onEnd(s); return true; }
        for (const e of foes()) {
          if (Math.abs(ex(e) - s.x) < (e.w || 0.9) / 2 + s.r && Math.abs(ey(e) - s.y) < (e.h || 0.9) / 2 + s.r && once(s, e, s.gap)) {
            s.onHit(e, s); s.n++;
            if (--s.pierce <= 0) { if (s.onEnd) s.onEnd(s); return true; }
          }
        }
        if (s.t >= s.life - 1e-3 && s.onEnd) { s.onEnd(s); return true; }
      },
    }));
  }
  // an area that stays a while: x, y (or follow: the player, with ox / oy), R, life, every (seconds between hits per foe),
  // onTick(e, z), pull (speed foes are drawn to its middle), end(z, p), draw
  function zone(o) {
    return add(Object.assign({ every: 0.25 }, o, {
      step(z, dt, q) {
        if (z.follow) { z.x = pcx(q) + (z.ox || 0); z.y = pcy(q) + (z.oy || 0); }
        if (z.move) z.move(z, dt, q);
        for (const e of foes()) {
          const d = Math.hypot(ex(e) - z.x, ey(e) - z.y); if (d > z.R + (e.w || 0.9) * 0.4) continue;
          if (z.pull) drag(e, z.x, z.y, z.pull, dt);
          if (z.onTick && once(z, e, z.every)) z.onTick(e, z);
        }
        if (z.tick) z.tick(z, dt, q);
      },
    }));
  }

  // ---------------------------------------------------------------- drawing helpers
  function glow(ctx, c, a) { ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = Math.max(0, Math.min(1, a)); ctx.strokeStyle = c; ctx.fillStyle = c; }
  function solid(ctx, c, a) { ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = Math.max(0, Math.min(1, a == null ? 1 : a)); ctx.strokeStyle = c; ctx.fillStyle = c; }
  function dot(ctx, x, y, r) { ctx.beginPath(); ctx.arc(x, y, Math.max(0.5, r), 0, Math.PI * 2); ctx.fill(); }
  function circ(ctx, x, y, r) { ctx.beginPath(); ctx.arc(x, y, Math.max(0.5, r), 0, Math.PI * 2); ctx.stroke(); }
  function zig(ctx, x1, y1, x2, y2, n, amp) { ctx.beginPath(); ctx.moveTo(x1, y1); for (let i = 1; i < n; i++) { const u = i / n; ctx.lineTo(x1 + (x2 - x1) * u + (Math.random() - 0.5) * amp, y1 + (y2 - y1) * u + (Math.random() - 0.5) * amp); } ctx.lineTo(x2, y2); ctx.stroke(); }
  function star(ctx, x, y, r, rot) { ctx.beginPath(); for (let i = 0; i < 10; i++) { const a = rot + i * Math.PI / 5, rr = i % 2 ? r * 0.45 : r; ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); } ctx.closePath(); ctx.fill(); }
  function glove(ctx, x, y, s, f, c) { solid(ctx, c, 1); ctx.beginPath(); ctx.ellipse(x, y, s, s * 0.8, 0, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = '#ffffff'; ctx.globalAlpha = 0.85; ctx.fillRect(x - f * s * 1.1, y - s * 0.45, s * 0.5, s * 0.9); ctx.globalAlpha = 0.5; ctx.beginPath(); ctx.arc(x + f * s * 0.3, y - s * 0.3, s * 0.25, 0, Math.PI * 2); ctx.fill(); }
  function cassette(ctx, x, y, s, rot, c) {
    ctx.save(); ctx.translate(x, y); ctx.rotate(rot); solid(ctx, '#2b2233', 1); ctx.fillRect(-s, -s * 0.62, s * 2, s * 1.24);
    ctx.fillStyle = c; ctx.fillRect(-s * 0.85, -s * 0.5, s * 1.7, s * 0.45); ctx.fillStyle = '#e8e0f0';
    dot(ctx, -s * 0.45, s * 0.18, s * 0.2); dot(ctx, s * 0.45, s * 0.18, s * 0.2); ctx.restore();
  }
  function note(ctx, x, y, s, c) { solid(ctx, c, 1); ctx.beginPath(); ctx.ellipse(x, y, s * 0.55, s * 0.4, -0.4, 0, Math.PI * 2); ctx.fill(); ctx.fillRect(x + s * 0.4, y - s * 1.6, s * 0.16, s * 1.6); ctx.fillRect(x + s * 0.4, y - s * 1.6, s * 0.6, s * 0.22); }
  function tapeLine(ctx, pts, c, w) {
    if (pts.length < 2) return;
    solid(ctx, '#3b2a22', 0.95); ctx.lineWidth = w + 2; ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]); for (const q of pts) ctx.lineTo(q[0], q[1]); ctx.stroke();
    glow(ctx, c, 0.8); ctx.lineWidth = Math.max(1, w * 0.35); ctx.stroke();
  }
  function rune(ctx, x, y, R, rot, c, a) {
    glow(ctx, c, a); ctx.lineWidth = 2; circ(ctx, x, y, R); circ(ctx, x, y, R * 0.72);
    ctx.beginPath(); for (let i = 0; i <= 5; i++) { const an = rot + i * Math.PI * 4 / 5; ctx.lineTo(x + Math.cos(an) * R * 0.72, y + Math.sin(an) * R * 0.72); } ctx.stroke();
  }
  function trail(ctx, D, pts, c, w) { if (pts.length < 2) return; for (let i = 1; i < pts.length; i++) { glow(ctx, c, i / pts.length * 0.7); ctx.lineWidth = w * i / pts.length; ctx.beginPath(); ctx.moveTo(D.SX(pts[i - 1][0]), D.SY(pts[i - 1][1])); ctx.lineTo(D.SX(pts[i][0]), D.SY(pts[i][1])); ctx.stroke(); } }
  const orbDraw = (c1, c2, k) => (s, ctx, D) => { if (s.delay && s.t < s.delay && !s.hold) return; const x = D.SX(s.x), y = D.SY(s.y), r = s.r * D.T * (k || 1); glow(ctx, c1, 0.45); dot(ctx, x, y, r * 1.6); glow(ctx, c1, 0.9); dot(ctx, x, y, r); glow(ctx, c2, 0.9); dot(ctx, x, y, r * 0.45); };

  // ---------------------------------------------------------------- shared effects
  function quakeRing(x, fy, R, dmg, o, c) { for (const e of foes()) if (Math.abs(ex(e) - x) < R && Math.abs(ey(e) - (fy - 0.5)) < 1.5) hit(e, dmg, Object.assign({ kx: away(e, x) * 9, ky: -9, stun: 0.6, c }, o)); fxp({ k: 'ring', x, y: fy, R, c, flat: 0.35, life: 0.45 }); shake(7); }
  function burstAt(x, y, R, dmg, o, c) { for (const e of within(x, y, R)) hit(e, dmg, Object.assign({ kx: away(e, x) * 10, ky: -8, stun: 0.6, c }, o)); fxp({ k: 'ring', x, y, R, c, life: 0.4 }); fxp({ k: 'flash', x, y, R: R * 0.7, c, life: 0.25 }); }
  // rise into the air; foes near you on the way up are hit
  function lift(p, vy, o) { p.vy = Math.min(p.vy, -vy); p.onGround = false; return o ? add(Object.assign({ life: 0.35 }, o)) : null; }

  // ================================================================ THE MOVES
  // each: (p, f, k) -> k.dmg(base) gives the damage (charge power and the Prodigy's beat added), k.pw the charge power
  const BR = ['#ffcf40', '#ef4444'], SL = ['#ff4d4d', '#ffcf40'], AM = ['#a78bfa', '#fef3c7'], AMF = '#ff6b35', CO = ['#7cdbff', '#ffffff'];
  const CR = ['#6ee7d0', '#8b5cff', '#ff5fd8'], TI = ['#ffb020', '#ff6a3d', '#ff2e63'], DE = ['#39d5ff', '#3d7bff', '#9b7bff'];
  const SA = ['#ff5fd8', '#ffb020', '#6ee7d0'], RB = ['#6ee7d0', '#8b5cff', '#ff5fd8'];

  const SETS = {
    // ===================== BRAWLER: raw fists, fire and stone
    brawler: {
      ground_neutral: ['ONE-INCH PUNCH', (p, f, k) => {
        p.vx = -f * 2;
        after(0.1, () => { const q = P(); if (!q) return; const x = pcx(q), y = pcy(q);
          for (const e of foes()) { const al = (ex(e) - x) * f; if (al > -0.2 && al < 2.3 + 0.5 * k.pw && Math.abs(ey(e) - y) < 1.1 + al * 0.25) hit(e, k.dmg(6), { kx: f * (20 + 6 * k.pw), ky: -6, stun: 0.8, c: BR[0], big: true }); }
          fxp({ k: 'cone', x: x + f * 0.4, y, f, L: 2.6, c: BR[0], life: 0.3 }); fxp({ k: 'flash', x: x + f * 0.6, y, R: 0.9, c: '#ffffff', life: 0.15 }); shake(9); });
      }],
      ground_side: ['METEOR RUSH', (p, f, k) => {
        rush(p, f, { speed: 17 + 4 * k.pw, dur: 0.3, carry: new Set(), onHit(e, me) { me.carry.add(e); hit(e, 1, { stun: 0.6, c: BR[0], tick: true }); },
          end(me, q) { for (const e of me.carry) hit(e, k.dmg(5), { kx: f * (16 + 4 * k.pw), ky: -9, stun: 0.8, c: BR[1], big: true }); fxp({ k: 'ring', x: pcx(q) + f * 0.9, y: pcy(q), R: 1.6, c: BR[1], life: 0.35 }); shake(8); },
          draw(me, ctx, D) { trail(ctx, D, me.trail, BR[1], D.T * 0.7); trail(ctx, D, me.trail, BR[0], D.T * 0.35); } });
      }],
      ground_up: ['RISING DRAGON', (p, f, k) => {
        lift(p, 17 + 3 * k.pw, { life: 0.45, step(me, dt, q) { for (const e of within(pcx(q), pcy(q) - 0.3, 1.4)) { drag(e, pcx(q) + f * 0.3, pcy(q) - 0.8, 30, dt); if (once(me, e, 0.08)) hit(e, 0.8, { ky: Math.min(-6, q.vy - 2), stun: 0.4, c: BR[0], tick: true }); } },
          end(me, q) { for (const e of within(pcx(q), pcy(q) - 0.5, 1.8)) hit(e, k.dmg(4), { kx: f * 3, ky: -16 - 3 * k.pw, stun: 0.7, c: BR[1], big: true }); },
          draw(me, ctx, D) { const q = P(); if (!q) return; const x = D.SX(pcx(q)), y = D.SY(pcy(q)), T = D.T; for (let i = 0; i < 12; i++) { const a = me.t * 18 + i * 0.6, yy = y + i * T * 0.22, r = T * (0.75 - i * 0.04); glow(ctx, i % 2 ? BR[0] : BR[1], 0.8 - i * 0.05); dot(ctx, x + Math.cos(a) * r, yy, T * (0.22 - i * 0.012)); } } });
      }],
      ground_down: ['FAULT BREAKER', (p, f, k) => {
        const x0 = pcx(p), fy = p.y + p.h, got = new Set(); shake(6);
        for (let i = 1; i <= 6; i++) for (const s of [-1, 1]) after(i * 0.06, () => { const x = x0 + s * i * (0.8 + 0.15 * k.pw);
          for (const e of foes()) if (!got.has(e) && Math.abs(ex(e) - x) < 0.6 && ey(e) < fy + 0.3 && ey(e) > fy - 2.2) { got.add(e); hit(e, k.dmg(i < 3 ? 4 : 3), { kx: s * 4, ky: -13 - 2 * k.pw, stun: 0.6, c: BR[0] }); }
          fxp({ k: 'spike', x, fy, h: 1.2 + 0.4 * Math.random(), c: '#b8a68f', c2: BR[0], life: 0.5 }); });
      }],
      air_neutral: ['HURRICANE FISTS', (p, f, k) => {
        zone({ follow: true, R: 2.1 + 0.4 * k.pw, life: 0.6, every: 0.07, pull: 9, onTick: e => hit(e, 0.8, { stun: 0.35, c: BR[0], tick: true }),
          tick(z, dt, q) { q.vy = Math.min(q.vy, 1.5); },
          end(z) { burstAt(z.x, z.y, z.R + 0.3, k.dmg(4), { kx: null, ky: -8 }, BR[1]); for (const e of within(z.x, z.y, z.R + 0.3)) e.vx = away(e, z.x) * 13; },
          draw(z, ctx, D) { const x = D.SX(z.x), y = D.SY(z.y), R = z.R * D.T; for (let i = 0; i < 6; i++) { const a = z.t * 22 + i * Math.PI / 3; glove(ctx, x + Math.cos(a) * R * 0.7, y + Math.sin(a) * R * 0.55, D.T * 0.2, Math.cos(a) > 0 ? 1 : -1, i % 2 ? BR[0] : BR[1]); } glow(ctx, BR[0], 0.35); ctx.lineWidth = 3; circ(ctx, x, y, R); } });
      }],
      air_side: ['COMET KNUCKLE', (p, f, k) => {
        rush(p, f, { speed: 20 + 4 * k.pw, dur: 0.32, vy: 2,
          onHit(e, me, q) { if (me.boom) return; me.boom = true; burstAt(ex(e), ey(e), 1.8, k.dmg(5), { kx: null, ky: -8, big: true }, BR[1]); for (const e2 of within(ex(e), ey(e), 1.8)) e2.vx = f * (15 + 4 * k.pw); me.t = me.life; },
          draw(me, ctx, D) { trail(ctx, D, me.trail, BR[1], D.T * 0.9); const q = P(); if (q) { glow(ctx, BR[0], 0.9); dot(ctx, D.SX(pcx(q) + f * 0.5), D.SY(pcy(q)), D.T * 0.35); } } });
      }],
      air_up: ['DRAGON ASCENT', (p, f, k) => {
        lift(p, 19 + 3 * k.pw, { life: 0.4, step(me, dt, q) { for (const e of foes()) if (Math.abs(ex(e) - pcx(q)) < 1.1 && ey(e) < pcy(q) + 0.5 && ey(e) > pcy(q) - 2.4 && once(me, e)) hit(e, k.dmg(4), { kx: f * 2, ky: -16 - 3 * k.pw, stun: 0.6, c: BR[1], big: true }); },
          draw(me, ctx, D) { const q = P(); if (!q) return; const x = D.SX(pcx(q)), y = D.SY(q.y + q.h); for (let i = 0; i < 8; i++) { glow(ctx, i % 2 ? BR[0] : BR[1], (1 - me.t / 0.4) * (0.9 - i * 0.08)); dot(ctx, x + Math.sin(me.t * 30 + i) * 6, y + i * D.T * 0.35, D.T * (0.4 - i * 0.03)); } } });
      }],
      air_down: ['METEOR DROP', (p, f, k) => {
        dive(p, { vy: 30, vx: 0, onHit: e => hit(e, k.dmg(4), { kx: 0, ky: 16, stun: 0.6, c: BR[1], big: true }),
          land: (x, fy) => { quakeRing(x, fy, 2.8 + 0.6 * k.pw, k.dmg(4), { ky: -10, kx: null }, BR[1]); for (const e of foes()) if (Math.abs(ex(e) - x) < 3 && Math.abs(ey(e) - fy) < 1.6) e.vx = away(e, x) * 11; for (let i = -3; i <= 3; i++) fxp({ k: 'spike', x: x + i * 0.45, fy, h: 0.6 + (3 - Math.abs(i)) * 0.25, c: '#b8a68f', c2: BR[1], life: 0.5 }); dust(x, fy, '#c8b8a0', 16, 8); },
          draw(me, ctx, D) { const q = P(); if (!q) return; const x = D.SX(pcx(q)), y = D.SY(pcy(q)); glow(ctx, BR[1], 0.6); ctx.lineWidth = D.T * 0.5; ctx.beginPath(); ctx.moveTo(x, y - D.T * 2); ctx.lineTo(x, y); ctx.stroke(); glow(ctx, BR[0], 0.9); dot(ctx, x, y + D.T * 0.3, D.T * 0.4); } });
      }],
    },

    // ===================== SLUGGER: boxing gloves and a big swing
    cb_slugger: {
      ground_neutral: ['GLOVE GATLING', (p, f, k) => {
        add({ life: 0.5, gl: [], step(me, dt, q) { q.vx = 0;
          if (once(me, me, 0.06)) { me.gl.push({ y: (Math.random() - 0.5) * 0.9, t: 0 }); for (const e of foes()) { const al = (ex(e) - pcx(q)) * f; if (al > -0.2 && al < 2.1 && Math.abs(ey(e) - pcy(q)) < 1.1) hit(e, 0.8, { kx: f * 1.5, ky: -1, stun: 0.4, c: SL[1], tick: true }); } }
          for (const g of me.gl) g.t += dt; me.gl = me.gl.filter(g => g.t < 0.12); },
          end(me, q) { for (const e of foes()) { const al = (ex(e) - pcx(q)) * f; if (al > -0.2 && al < 2.4 && Math.abs(ey(e) - pcy(q)) < 1.2) hit(e, k.dmg(4), { kx: f * (15 + 4 * k.pw), ky: -8, stun: 0.8, c: SL[0], big: true }); } fxp({ k: 'cone', x: pcx(q) + f * 0.4, y: pcy(q), f, L: 2.2, c: SL[0], life: 0.25 }); },
          draw(me, ctx, D) { const q = P(); if (!q) return; for (const g of me.gl) glove(ctx, D.SX(pcx(q) + f * (0.6 + g.t * 12)), D.SY(pcy(q) + g.y), D.T * 0.22, f, Math.random() < 0.5 ? SL[0] : '#ff8080'); } });
      }],
      ground_side: ['HOME RUN', (p, f, k) => {
        after(0.14, () => { const q = P(); if (!q) return; const x = pcx(q), y = pcy(q); let tip = false;
          for (const e of foes()) { const al = (ex(e) - x) * f; if (al > -0.3 && al < 2.9 + 0.4 * k.pw && Math.abs(ey(e) - y) < 1.4) { const t2 = al > 1.7; tip = tip || t2;
            hit(e, k.dmg(t2 ? 7 : 4), t2 ? { kx: f * (25 + 6 * k.pw), ky: -12, stun: 1, c: '#ffffff', big: true } : { kx: f * 13, ky: -8, stun: 0.7, c: SL[1] });
            if (t2) add({ life: 0.7, e, pts: [], step(me) { if (!me.e.dead) me.pts.push([ex(me.e), ey(me.e)]); if (me.pts.length > 18) me.pts.shift(); }, draw(me, ctx, D) { trail(ctx, D, me.pts, '#ffffff', D.T * 0.35); } }); } }
          fxp({ k: 'arc', x, y, f, R: 2.6, c: SL[1], life: 0.25 }); if (tip) { fxp({ k: 'label', x: x + f * 2, y: y - 1.5, text: 'HOME RUN!', c: '#ffffff', life: 1.1 }); shake(12); } });
      }],
      ground_up: ['SKYLINE UPPERCUT', (p, f, k) => {
        const x0 = pcx(p), fy = p.y + p.h;
        lift(p, 18 + 3 * k.pw, { life: 0.4, ghosts: [], step(me, dt, q) { if (once(me, me, 0.05)) me.ghosts.push([pcx(q), pcy(q)]); for (const e of within(pcx(q), pcy(q) - 0.4, 1.4)) if (once(me, e)) hit(e, k.dmg(4), { kx: f * 2, ky: -18 - 3 * k.pw, stun: 0.7, c: SL[0], big: true }); },
          draw(me, ctx, D) { for (const [gx, gy] of me.ghosts) { solid(ctx, SL[0], 0.35 * (1 - me.t / 0.4)); glove(ctx, D.SX(gx + f * 0.3), D.SY(gy - 0.3), D.T * 0.3, f, SL[0]); } solid(ctx, '#3a2a4a', 0.5 * (1 - me.t / 0.4)); for (let i = -2; i <= 2; i++) { const h = (1 + ((i * 7 + 9) % 4) * 0.5) * D.T; ctx.fillRect(D.SX(x0 + i * 0.45) - D.T * 0.2, D.SY(fy) - h, D.T * 0.4, h); } } });
      }],
      ground_down: ['POUND TOWN', (p, f, k) => {
        [0, 0.2, 0.42].forEach((d, i) => after(d, () => { const q = P(); if (!q) return; const x = pcx(q), fy = q.y + q.h, last = i === 2;
          quakeRing(x, fy, 1.6 + i * 0.6 + 0.4 * k.pw, last ? k.dmg(4) : 2, last ? { ky: -14 - 2 * k.pw, stun: 0.7, big: true } : { kx: 0, ky: -4, stun: 0.5 }, last ? SL[0] : SL[1]);
          fxp({ k: 'glovesDown', x, fy, c: i % 2 ? SL[1] : SL[0], life: 0.2 }); dust(x, fy, '#c8c2b8', 6, 5); }));
      }],
      air_neutral: ['GLOVE BOOMERANGS', (p, f, k) => {
        [-0.5, -0.15, 0.2, 0.55].forEach((a, i) => { const ang = (f > 0 ? 0 : Math.PI) + a * f, sp = 14 + 3 * k.pw;
          shot({ x: pcx(p), y: pcy(p), vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp, life: 1.1, r: 0.35, pierce: 99, gap: 0.3, wall: 'pass', ret: false,
            move(s, dt) { const q = P(); if (s.t > 0.32 && q) { const dx = pcx(q) - s.x, dy = pcy(q) - s.y, d = Math.hypot(dx, dy) || 1; s.vx = dx / d * 17; s.vy = dy / d * 17; if (d < 0.5) s.t = s.life; } s.x += s.vx * dt; s.y += s.vy * dt; },
            onHit: e => hit(e, k.dmg(2), { kx: away(e, pcx(P() || p)) * 6, ky: -6, stun: 0.5, c: SL[1] }),
            draw: (s, ctx, D) => { ctx.save(); ctx.translate(D.SX(s.x), D.SY(s.y)); ctx.rotate(s.t * 18); glove(ctx, 0, 0, D.T * 0.24, 1, i % 2 ? SL[0] : SL[1]); ctx.restore(); } }); });
      }],
      air_side: ['CORKSCREW CANNON', (p, f, k) => {
        rush(p, f, { speed: 15 + 4 * k.pw, dur: 0.42, carry: new Set(), gap: 0.08, onHit(e, me) { me.carry.add(e); hit(e, 0.8, { stun: 0.5, c: SL[1], tick: true }); },
          end(me) { for (const e of me.carry) hit(e, k.dmg(3), { kx: f * (14 + 4 * k.pw), ky: -6, stun: 0.6, c: SL[0], big: true }); },
          draw(me, ctx, D) { const q = P(); if (!q) return; const x = D.SX(pcx(q) + f * 0.7), y = D.SY(pcy(q)); glow(ctx, SL[1], 0.8); ctx.lineWidth = 2.5; for (let i = 0; i < 4; i++) { ctx.beginPath(); ctx.ellipse(x - f * i * D.T * 0.3, y, D.T * 0.15, D.T * (0.5 - i * 0.08), 0, me.t * 30 + i, me.t * 30 + i + 3.5); ctx.stroke(); } glove(ctx, x, y, D.T * 0.3, f, SL[0]); } });
      }],
      air_up: ['ROCKET HOOK', (p, f, k) => {
        const x = pcx(p), y = p.y + p.h;
        for (const e of foes()) if (Math.abs(ex(e) - x) < 1.2 && ey(e) > y - 0.3 && ey(e) < y + 2.5) hit(e, 2, { kx: 0, ky: 9, stun: 0.4, c: SL[1] });
        fxp({ k: 'ring', x, y: y + 0.3, R: 1.3, c: SL[1], flat: 0.35, life: 0.35 });
        lift(p, 19 + 3 * k.pw, { life: 0.38, step(me, dt, q) { for (const e of within(pcx(q), q.y - 0.2, 1.4)) if (once(me, e)) hit(e, k.dmg(4), { kx: f * 2, ky: -15 - 3 * k.pw, stun: 0.6, c: SL[0], big: true }); },
          draw(me, ctx, D) { const q = P(); if (!q) return; const x2 = D.SX(pcx(q)), y2 = D.SY(q.y + q.h); for (let i = 0; i < 6; i++) { glow(ctx, i % 2 ? '#ffd166' : SL[0], 0.8 - i * 0.12); dot(ctx, x2 + (Math.random() - 0.5) * 8, y2 + i * D.T * 0.25, D.T * (0.25 - i * 0.03)); } glove(ctx, D.SX(pcx(q)), D.SY(q.y - 0.1), D.T * 0.3, f, SL[0]); } });
      }],
      air_down: ['HAMMER STORM', (p, f, k) => {
        dive(p, { vy: 28, vx: 0, onHit: e => hit(e, k.dmg(4), { kx: 0, ky: 15, stun: 0.6, c: SL[0], big: true }),
          land: (x, fy) => { quakeRing(x, fy, 1.8, 3, { ky: -8 }, SL[0]);
            for (const s of [-1, 1]) shot({ x, y: fy - 0.35, vx: s * (11 + 3 * k.pw), vy: 0, life: 0.6, r: 0.4, pierce: 99, wall: 'stop', onHit: e => hit(e, k.dmg(3), { kx: s * 6, ky: -11, stun: 0.6, c: SL[1] }),
              draw: (sh, ctx, D) => { glove(ctx, D.SX(sh.x), D.SY(sh.y), D.T * 0.3, s, SL[1]); glow(ctx, '#ffffff', 0.4); ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(D.SX(sh.x - s * 0.8), D.SY(sh.y + 0.3)); ctx.lineTo(D.SX(sh.x), D.SY(sh.y + 0.3)); ctx.stroke(); } }); },
          draw(me, ctx, D) { const q = P(); if (!q) return; glove(ctx, D.SX(pcx(q) - 0.2), D.SY(q.y + q.h), D.T * 0.3, -1, SL[0]); glove(ctx, D.SX(pcx(q) + 0.2), D.SY(q.y + q.h), D.T * 0.3, 1, SL[0]); } });
      }],
    },

    // ===================== ARCH MAGE: spells
    archmage: {
      ground_neutral: ['ARCANE ORB', (p, f, k) => {
        shot({ x: pcx(p) + f * 0.8, y: pcy(p) - 0.2, vx: f * 3, vy: 0, life: 2 + 0.6 * k.pw, r: 0.45, pierce: 99, gap: 0.5, wall: 'stop',
          onHit: e => hit(e, 1, { stun: 0.4, c: AM[0] }),
          move(s, dt) { s.x += s.vx * dt; s.y += Math.sin(s.t * 5) * 0.3 * dt; if (once(s, s, 0.3)) { const e = nearest(s.x, s.y, 4.2); if (e) { hit(e, 1.5, { stun: 0.4, c: AM[1] }); fxp({ k: 'bolt', x1: s.x, y1: s.y, x2: ex(e), y2: ey(e), c: AM[0], life: 0.2 }); } } },
          onEnd: s => { burstAt(s.x, s.y, 2.1, k.dmg(4), { ky: -10, big: true }, AM[0]); },
          draw: (s, ctx, D) => { orbDraw(AM[0], AM[1], 1.2)(s, ctx, D); rune(ctx, D.SX(s.x), D.SY(s.y), s.r * D.T * 1.9, s.t * 3, AM[1], 0.5); } });
      }],
      ground_side: ['MAGIC MISSILES', (p, f, k) => {
        const n = 5 + Math.round(2 * k.pw);
        for (let i = 0; i < n; i++) { const a = (f > 0 ? 0 : Math.PI) + (i - (n - 1) / 2) * 0.35 * f - 0.4;
          shot({ x: pcx(p), y: pcy(p) - 0.3, vx: Math.cos(a) * 12, vy: Math.sin(a) * 12, delay: i * 0.05, life: 1.6, r: 0.25, home: 9, seek: 10, onHit: e => hit(e, k.dmg(2) * 0.5 + 0.5, { kx: f * 5, ky: -4, stun: 0.4, c: AM[0] }),
            pts: [], draw: (s, ctx, D) => { if (s.t < s.delay) return; s.pts.push([s.x, s.y]); if (s.pts.length > 8) s.pts.shift(); trail(ctx, D, s.pts, AM[0], D.T * 0.25); glow(ctx, AM[1], 1); star(ctx, D.SX(s.x), D.SY(s.y), D.T * 0.2, s.t * 10); } }); }
      }],
      ground_up: ['METEOR CALL', (p, f, k) => {
        const e0 = nearest(pcx(p), pcy(p), 10), tx = e0 ? ex(e0) : pcx(p) + f * 4;
        const gy = floorBelow(tx, e0 ? ey(e0) : pcy(p) - 1, 14), fy = gy != null ? gy : (e0 ? e0.y + (e0.h || 0.9) : p.y + p.h), R = 2.3 + 0.5 * k.pw;
        add({ life: 0.55, tx, fy, end() { burstAt(tx, fy - 0.5, R, k.dmg(7), { burn: 3, ky: -11, big: true }, AMF); for (let i = 0; i < 5; i++) fxp({ k: 'spike', x: tx + (i - 2) * 0.4, fy, h: 0.7, c: AMF, c2: '#ffd166', life: 0.45 }); shake(11); },
          draw(me, ctx, D) { const u = me.t / me.life, x = D.SX(tx), y = D.SY(fy); rune(ctx, x, y - D.T * 0.1, R * D.T * 0.6, me.t * 4, AM[0], 0.7); const mx = x + D.T * 4 * (1 - u), my = y - D.T * 9 * (1 - u);
            glow(ctx, AMF, 0.6); ctx.lineWidth = D.T * 0.5; ctx.beginPath(); ctx.moveTo(mx + D.T * 1.6, my - D.T * 3.6); ctx.lineTo(mx, my); ctx.stroke(); solid(ctx, '#ff8a3d'); dot(ctx, mx, my, D.T * 0.55); solid(ctx, '#5b3a2a'); dot(ctx, mx - D.T * 0.12, my + D.T * 0.06, D.T * 0.36); } });
      }],
      ground_down: ['RUNE PRISON', (p, f, k) => {
        const e0 = nearest(pcx(p), pcy(p), 7.5), x = e0 ? ex(e0) : pcx(p) + f * 2, y = e0 ? ey(e0) : pcy(p);
        zone({ x, y, R: 1.6 + 0.3 * k.pw, life: 1.2, every: 0.3, pull: 10, onTick: e => hit(e, 0.8, { stun: 1.0, kx: 0, ky: 0, c: AM[0], tick: true }),
          end(z) { burstAt(z.x, z.y, z.R + 0.3, k.dmg(5), { ky: -13, stun: 0.6, big: true }, AM[1]); fxp({ k: 'col', x: z.x, fy: z.y + 1, w: 1.6, h: 5, c: AM[0], life: 0.45 }); },
          draw(z, ctx, D) { const X = D.SX(z.x), Y = D.SY(z.y); rune(ctx, X, Y, z.R * D.T, z.t * 2, AM[0], 0.85); glow(ctx, AM[1], 0.5); ctx.lineWidth = 2; for (let i = 0; i < 6; i++) { const xx = X + (i - 2.5) * z.R * D.T * 0.35; ctx.beginPath(); ctx.moveTo(xx, Y - z.R * D.T); ctx.lineTo(xx, Y + z.R * D.T * 0.6); ctx.stroke(); } } });
      }],
      air_neutral: ['STARFALL HALO', (p, f, k) => {
        const n = 8;
        for (let i = 0; i < n; i++) { const a0 = i * Math.PI * 2 / n;
          shot({ x: pcx(p), y: pcy(p), vx: 0, vy: 0, life: 1.2, r: 0.28, delay: 0.4, a0,
            hold: (s) => { const q = P(); if (!q) return; const a = s.a0 + s.t * 7; s.x = pcx(q) + Math.cos(a) * 1.5; s.y = pcy(q) + Math.sin(a) * 1.3; s.vx = Math.cos(a) * (14 + 3 * k.pw); s.vy = Math.sin(a) * (14 + 3 * k.pw); q.vy = Math.min(q.vy, 1); },
            onHit: e => hit(e, k.dmg(2) * 0.6, { kx: away(e, pcx(P() || p)) * 8, ky: -6, stun: 0.5, c: AM[1] }),
            draw: (s, ctx, D) => { glow(ctx, AM[1], 1); star(ctx, D.SX(s.x), D.SY(s.y), D.T * 0.25, s.t * 8); glow(ctx, AM[0], 0.5); dot(ctx, D.SX(s.x), D.SY(s.y), D.T * 0.35); } }); }
      }],
      air_side: ['FIRE SPEAR', (p, f, k) => {
        p.vy = Math.min(p.vy, -2);
        shot({ x: pcx(p) + f * 0.5, y: pcy(p), vx: f * (22 + 4 * k.pw), vy: 0, life: 0.55, r: 0.35, pierce: 99, wall: 'stop',
          onHit: e => hit(e, k.dmg(4), { kx: f * 10, ky: -5, burn: 3, stun: 0.5, c: AMF }),
          move(s, dt) { s.x += s.vx * dt; if (once(s, s, 0.05)) zone({ x: s.x, y: s.y, R: 0.6, life: 1.2, every: 0.4, onTick: e => hit(e, 0.6, { burn: 2, c: AMF, tick: true }),
            draw(z, ctx, D) { for (let i = 0; i < 2; i++) { const ph = (z.t * 2 + i / 2) % 1; glow(ctx, i ? '#ffd166' : AMF, 0.7 * (1 - z.t / z.life) * (1 - ph)); dot(ctx, D.SX(z.x + (i - 0.5) * 0.3), D.SY(z.y) - ph * D.T * 0.6, D.T * 0.18); } } }); },
          draw: (s, ctx, D) => { const x = D.SX(s.x), y = D.SY(s.y); glow(ctx, AMF, 0.9); ctx.lineWidth = D.T * 0.18; ctx.beginPath(); ctx.moveTo(x - f * D.T * 1.4, y); ctx.lineTo(x, y); ctx.stroke(); glow(ctx, AM[1], 1); ctx.beginPath(); ctx.moveTo(x + f * D.T * 0.45, y); ctx.lineTo(x, y - D.T * 0.2); ctx.lineTo(x, y + D.T * 0.2); ctx.closePath(); ctx.fill(); } });
      }],
      air_up: ['ARCANE ASCENT', (p, f, k) => {
        const x0 = pcx(p), y0 = pcy(p), d = clearRun(p, 0, -1, 5.5 * (1 + 0.25 * k.pw));
        for (const e of within(x0, y0, 1.6)) hit(e, 3, { ky: -9, stun: 0.5, c: AM[0] });
        p.y -= d; p.vy = -5; p.vx *= 0.3; tele();
        for (const e of within(pcx(p), pcy(p), 1.6)) hit(e, k.dmg(3), { ky: -10, stun: 0.6, c: AM[1] });
        fxp({ k: 'runeFx', x: x0, y: y0, R: 1.3, c: AM[0], life: 0.45 }); fxp({ k: 'runeFx', x: pcx(p), y: pcy(p), R: 1.3, c: AM[1], life: 0.45 }); fxp({ k: 'bolt', x1: x0, y1: y0, x2: pcx(p), y2: pcy(p), c: AM[0], life: 0.3 });
      }, 'rec'],
      air_down: ['ARCANE COLLAPSE', (p, f, k) => {
        p.vy = -3;
        shot({ x: pcx(p), y: p.y + p.h + 0.2, vx: 0, vy: 16, g: 24, life: 1.6, r: 0.55, pierce: 99, onHit: e => hit(e, k.dmg(5), { kx: 0, ky: 17, stun: 0.6, c: AM[0], big: true }),
          onEnd: s => burstAt(s.x, s.y - 0.3, 2 + 0.4 * k.pw, 3, { ky: -8 }, AM[1]),
          draw: (s, ctx, D) => { rune(ctx, D.SX(s.x), D.SY(s.y), D.T * 0.6, s.t * 6, AM[0], 0.95); glow(ctx, AM[0], 0.3); ctx.fillRect(D.SX(s.x) - D.T * 0.3, D.SY(s.y) - D.T * 1.6, D.T * 0.6, D.T * 1.4); } });
      }],
    },

    // ===================== CONDUIT: lightning
    conduit: {
      ground_neutral: ['TESLA COIL', (p, f, k) => {
        for (let i = S.ents.length - 1; i >= 0; i--) if (S.ents[i].coil) S.ents.splice(i, 1);
        const x = pcx(p) + f * 0.6, fy = p.y + p.h;
        add({ coil: true, life: 2.4 + 0.8 * k.pw, step(me) { if (!once(me, me, 0.35)) return; const top = fy - 1.5; let from = [x, top]; const got = new Set();
          for (let j = 0; j < 3; j++) { const e = nearest(from[0], from[1], j ? 2.8 : 4.6, got); if (!e) break; got.add(e); hit(e, j ? 1 : k.dmg(1.5) * 0.6, { stun: 0.5, slow: 1, c: CO[0] }); fxp({ k: 'bolt', x1: from[0], y1: from[1], x2: ex(e), y2: ey(e), c: CO[0], life: 0.18 }); from = [ex(e), ey(e)]; } },
          draw(me, ctx, D) { const X = D.SX(x), Y = D.SY(fy), T = D.T; solid(ctx, '#3a4a5a'); ctx.fillRect(X - T * 0.12, Y - T * 1.3, T * 0.24, T * 1.3); ctx.fillRect(X - T * 0.3, Y - T * 0.15, T * 0.6, T * 0.15); glow(ctx, CO[0], 0.9); ctx.lineWidth = 2; for (let i = 0; i < 4; i++) { ctx.beginPath(); ctx.ellipse(X, Y - T * (0.35 + i * 0.25), T * 0.22, T * 0.06, 0, 0, Math.PI * 2); ctx.stroke(); } dot(ctx, X, Y - T * 1.5, T * (0.22 + 0.05 * Math.sin(me.t * 30))); } });
      }],
      ground_side: ['RAILGUN', (p, f, k) => {
        add({ life: 0.22, step(me, dt, q) { q.vx = 0; }, end(me, q) {
          const x0 = pcx(q), y0 = pcy(q); let L = 0; while (L < 12 && !pointSolid(x0 + f * (L + 0.25), y0)) L += 0.25;
          for (const e of foes()) { const al = (ex(e) - x0) * f; if (al > -0.3 && al < L + 0.3 && Math.abs(ey(e) - y0) < 0.6 + (e.h || 0.9) / 2) hit(e, k.dmg(7), { kx: f * (16 + 4 * k.pw), ky: -5, stun: 0.9, c: CO[1], big: true }); }
          fxp({ k: 'beam', x: x0, y: y0, f, L, w: 0.35, c: CO[0], life: 0.4 }); q.vx = -f * 7; shake(10); },
          draw(me, ctx, D) { const q = P(); if (!q) return; glow(ctx, CO[0], 0.5 + 0.5 * Math.sin(me.t * 60)); ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(D.SX(pcx(q)), D.SY(pcy(q))); ctx.lineTo(D.SX(pcx(q) + f * 12), D.SY(pcy(q))); ctx.stroke(); dot(ctx, D.SX(pcx(q) + f * 0.6), D.SY(pcy(q)), D.T * 0.15 * (1 + me.t * 8)); } });
      }],
      ground_up: ['THUNDERHEAD', (p, f, k) => {
        zone({ follow: true, oy: -3.6, R: 0, life: 2.5 + 0.7 * k.pw, tick(z) { if (!once(z, z, 0.4)) return; let b = null, bd = 5;
            for (const e of foes()) { const dx = Math.abs(ex(e) - z.x); if (ey(e) > z.y && dx < bd) { bd = dx; b = e; } }
            if (b) { hit(b, k.dmg(2) * 0.7, { stun: 0.6, ky: -3, c: CO[1] }); fxp({ k: 'bolt', x1: z.x + (Math.random() - 0.5), y1: z.y + 0.3, x2: ex(b), y2: ey(b), c: CO[0], life: 0.22 }); shake(3); } },
          draw(z, ctx, D) { const X = D.SX(z.x), Y = D.SY(z.y); solid(ctx, '#4a5568', 0.85); for (let i = 0; i < 5; i++) dot(ctx, X + (i - 2) * D.T * 0.45, Y + Math.sin(i * 2 + z.t) * D.T * 0.12, D.T * 0.48); glow(ctx, CO[0], 0.25 + 0.25 * Math.random()); dot(ctx, X, Y, D.T * 1.1); } });
      }],
      ground_down: ['OVERLOAD NOVA', (p, f, k) => {
        [0, 0.22, 0.44].forEach((d, i) => after(d, () => { const q = P(); if (!q) return; const last = i === 2, R = 2.2 + i * 0.6 + 0.4 * k.pw;
          for (const e of within(pcx(q), pcy(q), R)) hit(e, last ? k.dmg(4) : 1.5, last ? { kx: away(e, pcx(q)) * 9, ky: -10, slow: 3, stun: 0.6, c: CO[1], big: true } : { slow: 3, stun: 0.4, c: CO[0] });
          fxp({ k: 'ringBolt', x: pcx(q), y: pcy(q), R, c: CO[0], life: 0.35 }); shake(4 + i * 2); }));
      }],
      air_neutral: ['BALL LIGHTNING', (p, f, k) => {
        for (let i = 0; i < 3; i++) shot({ x: pcx(p), y: pcy(p), vx: 0, vy: 0, life: 1.8, r: 0.32, delay: 0.45, a0: i * Math.PI * 2 / 3, home: 10, seek: 10,
          hold: (s) => { const q = P(); if (!q) return; const a = s.a0 + s.t * 9; s.x = pcx(q) + Math.cos(a) * 1.2; s.y = pcy(q) + Math.sin(a) * 1.2; s.vx = Math.cos(a + Math.PI / 2) * 12; s.vy = Math.sin(a + Math.PI / 2) * 12; q.vy = Math.min(q.vy, 1); },
          onHit: e => hit(e, k.dmg(3) * 0.7, { kx: Math.sign(e.vx || f) * 4, ky: -6, stun: 0.6, c: CO[1] }),
          draw: (s, ctx, D) => { orbDraw(CO[0], CO[1])(s, ctx, D); glow(ctx, CO[1], 0.8); ctx.lineWidth = 1.5; zig(ctx, D.SX(s.x - 0.4), D.SY(s.y), D.SX(s.x + 0.4), D.SY(s.y), 4, D.T * 0.3); } });
      }],
      air_side: ['LIGHTNING STEP', (p, f, k) => {
        const x0 = pcx(p), y0 = pcy(p), d = clearRun(p, f, 0, 6 + 1.5 * k.pw);
        p.x += f * d; p.vx = f * 4; p.vy = Math.min(p.vy, -2); tele(); p.dashInvuln = Math.max(p.dashInvuln || 0, 0.3);
        const x1 = pcx(p);
        fxp({ k: 'bolt', x1: x0, y1: y0, x2: x1, y2: y0, c: CO[0], life: 0.25 });
        after(0.2, () => { for (const e of foes()) if (nearLine(e, x0, y0, x1, y0, 0.9)) hit(e, k.dmg(5), { kx: f * (12 + 3 * k.pw), ky: -7, stun: 0.8, c: CO[1], big: true }); fxp({ k: 'beam', x: x0, y: y0, f, L: Math.abs(x1 - x0), w: 0.5, c: CO[0], life: 0.3 }); shake(8); });
      }],
      air_up: ['LIGHTNING RIDE', (p, f, k) => {
        const x = pcx(p), y = p.y + p.h;
        lift(p, 19 * (1 + 0.15 * k.pw), { life: 0.35, step(me, dt, q) { for (const e of within(pcx(q), pcy(q), 1.6)) if (once(me, e)) hit(e, k.dmg(3), { kx: away(e, pcx(q)) * 3, ky: -9, stun: 0.9, c: CO[1] }); } });
        fxp({ k: 'bolt', x1: x, y1: y + 2.5, x2: x, y2: y - 3, c: CO[0], life: 0.4 }); fxp({ k: 'col', x, fy: y + 0.6, w: 1.2, h: 3.5, c: CO[0], life: 0.45 });
      }, 'rec'],
      air_down: ['LIGHTNING ROD', (p, f, k) => {
        const x = pcx(p), gy = floorBelow(x, p.y + p.h, 16), fy = gy != null ? gy : p.y + p.h + 10;
        for (const e of foes()) if (Math.abs(ex(e) - x) < 0.9 && ey(e) > p.y && ey(e) < fy + 0.3) hit(e, k.dmg(5), { kx: 0, ky: 18, stun: 0.8, c: CO[1], big: true });
        fxp({ k: 'strike', x, y1: p.y - 7, y2: fy, c: CO[0], life: 0.35 }); shake(9);
        dive(p, { vy: 24, land: (lx, lfy) => { for (const e of within(lx, lfy - 0.5, 1.8)) hit(e, 2, { kx: away(e, lx) * 7, ky: -7, stun: 0.6, c: CO[0] }); fxp({ k: 'ringBolt', x: lx, y: lfy - 0.4, R: 1.8, c: CO[0], life: 0.3 }); } });
      }],
    },

    // ===================== PRESS PLAY PRODIGY: CRESCENDO (synth waves)
    'cb_pressplay:cres': {
      ground_neutral: ['CHORD BLAST', (p, f, k) => {
        ['sq', 'saw', 'sine'].forEach((w, i) => { const a = (f > 0 ? 0 : Math.PI) + (i - 1) * 0.2 * f;
          shot({ x: pcx(p) + f * 0.5, y: pcy(p), vx: Math.cos(a) * (15 + 3 * k.pw), vy: Math.sin(a) * (15 + 3 * k.pw), life: 0.75, r: 0.35, pierce: 2, w, c: CR[i],
            onHit: e => hit(e, k.dmg(2), { kx: f * 8, ky: -5, stun: 0.5, c: CR[i] }),
            draw: (s, ctx, D) => { const x = D.SX(s.x), y = D.SY(s.y), T = D.T, h = T * 0.3; glow(ctx, s.c, 0.95); ctx.lineWidth = 3; ctx.beginPath();
              for (let j = 0; j <= 12; j++) { const u = j / 12, xx = x - f * T * (1 - u) * 1.1, ph = u * 4 + s.t * 10; const v = w === 'sq' ? (Math.floor(ph) % 2 ? h : -h) : w === 'saw' ? ((ph % 1) * 2 - 1) * h : Math.sin(ph * Math.PI) * h; ctx.lineTo(xx, y + v); } ctx.stroke(); } }); });
      }],
      ground_side: ['LASER SYNTH', (p, f, k) => {
        add({ life: 0.5, L: 7 + k.pw, step(me, dt, q) { q.vx = 0; const a = -0.55 + me.t / me.life * 1.5, x0 = pcx(q), y0 = pcy(q), x1 = x0 + f * Math.cos(a) * me.L, y1 = y0 + Math.sin(a) * me.L;
            me.seg = [x0, y0, x1, y1]; for (const e of foes()) if (nearLine(e, x0, y0, x1, y1, 0.35) && once(me, e, 0.1)) hit(e, 1.2 * k.m, { kx: f * 3, ky: -3, stun: 0.4, c: CR[2], tick: true }); },
          end(me) { if (me.seg) for (const e of foes()) if (nearLine(e, me.seg[0], me.seg[1], me.seg[2], me.seg[3], 0.5)) hit(e, k.dmg(3), { kx: f * 10, ky: -9, stun: 0.6, c: CR[0], big: true }); },
          draw(me, ctx, D) { if (!me.seg) return; const [a, b, c, d] = me.seg; for (let i = 0; i < 3; i++) { glow(ctx, CR[i], 0.85); ctx.lineWidth = D.T * (0.22 - i * 0.06); ctx.beginPath(); ctx.moveTo(D.SX(a), D.SY(b) + (i - 1) * 3); ctx.lineTo(D.SX(c), D.SY(d) + (i - 1) * 3); ctx.stroke(); } } });
      }],
      ground_up: ['RISER BLAST', (p, f, k) => {
        const x = pcx(p) + f * 0.6, fy = p.y + p.h;
        add({ life: 0.45, step(me, dt) { for (const e of foes()) if (Math.abs(ex(e) - x) < 2.2 && ey(e) < fy + 0.3 && ey(e) > fy - 5) drag(e, x, null, 6, dt); },
          end() { for (const e of foes()) if (Math.abs(ex(e) - x) < 1.1 && ey(e) < fy + 0.3 && ey(e) > fy - 6) hit(e, k.dmg(6), { kx: 0, ky: -18 - 3 * k.pw, stun: 0.8, c: CR[2], big: true }); fxp({ k: 'col', x, fy, w: 1.9, h: 6.5, c: CR[1], life: 0.5 }); fxp({ k: 'label', x, y: fy - 3, text: 'DROP!', c: CR[2], life: 0.7 }); shake(10); },
          draw(me, ctx, D) { const u = me.t / me.life, X = D.SX(x), Y = D.SY(fy); for (let i = 0; i < 8; i++) { const hgt = D.T * (0.3 + u * 4) * (0.6 + 0.4 * Math.abs(Math.sin(me.t * 25 + i))); glow(ctx, CR[i % 3], 0.6); ctx.fillRect(X + (i - 4) * D.T * 0.22, Y - hgt, D.T * 0.16, hgt); } } });
      }],
      ground_down: ['SIDECHAIN PUMP', (p, f, k) => {
        [0, 0.2, 0.4, 0.6].forEach((d, i) => after(d, () => { const q = P(); if (!q) return; const x = pcx(q), y = pcy(q), last = i === 3, R = 2.6 + 0.5 * k.pw;
          for (const e of within(x, y, R)) { if (last) hit(e, k.dmg(4), { kx: away(e, x) * 14, ky: -9, stun: 0.6, c: CR[2], big: true }); else { hit(e, 1 * k.m, { stun: 0.4, c: CR[i % 3], tick: true }); drag(e, x, null, 40, 0.05); } }
          fxp({ k: 'ring', x, y, R: last ? R : R * 0.7, c: CR[i % 3], life: 0.25, inward: !last }); shake(last ? 8 : 3); }));
      }],
      air_neutral: ['ARPEGGIO STORM', (p, f, k) => {
        p.vy = Math.min(p.vy, -2);
        for (let i = 0; i < 7; i++) { const a = -Math.PI / 2 + (i - 3) * 0.35;
          shot({ x: pcx(p), y: pcy(p), vx: Math.cos(a) * 9, vy: Math.sin(a) * 9, delay: i * 0.05, life: 1.6, r: 0.28, home: 8, seek: 10, c: CR[i % 3],
            onHit: e => hit(e, k.dmg(2) * 0.6, { kx: f * 3, ky: -5, stun: 0.4, c: CR[i % 3] }), draw: (s, ctx, D) => { if (s.t < s.delay) return; note(ctx, D.SX(s.x), D.SY(s.y), D.T * 0.32, s.c); } }); }
      }],
      air_side: ['GLISSANDO', (p, f, k) => {
        rush(p, f, { speed: 15 + 4 * k.pw, dur: 0.38, vy: me => Math.cos(me.t * 20) * 9, wallStop: false,
          onHit: e => hit(e, k.dmg(3), { kx: f * 10, ky: -6, stun: 0.6, c: CR[1] }),
          draw(me, ctx, D) { for (let i = 0; i < 3; i++) { const pts = me.trail.map(q => [q[0], q[1] + (i - 1) * 0.18]); trail(ctx, D, pts, CR[i], D.T * 0.22); } } });
      }],
      air_up: ['OCTAVE LEAP', (p, f, k) => {
        const x = pcx(p), y = pcy(p);
        for (const e of within(x, y + 0.6, 1.8)) hit(e, 3, { kx: away(e, x) * 4, ky: -10, stun: 0.5, c: CR[0] });
        lift(p, 19 + 3 * k.pw, { life: 0.4, step(me, dt, q) { for (const e of within(pcx(q), q.y, 1.4)) if (once(me, e)) hit(e, k.dmg(3), { ky: -13, stun: 0.6, c: CR[2] }); } });
        for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4; shot({ x, y, vx: Math.cos(a) * 7, vy: Math.sin(a) * 7, life: 0.35, r: 0.2, wall: 'pass', onHit: e => hit(e, 1, { c: CR[i % 3], tick: true }), draw: (s, ctx, D) => note(ctx, D.SX(s.x), D.SY(s.y), D.T * 0.25, CR[i % 3]) }); }
      }],
      air_down: ['KEY CHANGE', (p, f, k) => {
        dive(p, { vy: 27, onHit: e => hit(e, 2, { kx: 0, ky: 12, stun: 0.4, c: CR[1] }), land: (x, fy) => {
          let n = 0; for (const e of foes()) if (Math.abs(ex(e) - x) < 2.8 + 0.4 * k.pw && Math.abs(ey(e) - (fy - 0.5)) < 1.6) {
            const nx = 2 * x - ex(e) - (e.w || 0.9) / 2; if (canDrag(e) && !blocked(nx, e.y, e.w || 0.9, (e.h || 0.9) - 0.05)) { fxp({ k: 'bolt', x1: ex(e), y1: ey(e), x2: nx + (e.w || 0.9) / 2, y2: ey(e), c: CR[2], life: 0.25 }); e.x = nx; }
            hit(e, k.dmg(3), { kx: away(e, x) * 7, ky: -10, stun: 0.8, c: CR[2] }); n++; }
          fxp({ k: 'keys', x, fy, c: CR[1], life: 0.5 }); if (n) fxp({ k: 'label', x, y: fy - 2, text: 'KEY CHANGE x' + n, c: CR[0], life: 0.8 }); shake(7); } });
      }],
    },

    // ===================== PRODIGY: TITAN BASS (heavy low end)
    'cb_pressplay:titan': {
      ground_neutral: ['BASS CANNON', (p, f, k) => {
        p.vx = -f * 5;
        shot({ x: pcx(p) + f * 0.7, y: pcy(p), vx: f * (9 + 2 * k.pw), vy: 0, life: 0.9, r: 0.75, pierce: 99, wall: 'stop',
          onHit: e => hit(e, k.dmg(6), { kx: f * (18 + 4 * k.pw), ky: -7, stun: 0.8, c: TI[2], big: true }), onEnd: s => fxp({ k: 'ring', x: s.x, y: s.y, R: 1.4, c: TI[1], life: 0.3 }),
          draw: (s, ctx, D) => { const x = D.SX(s.x), y = D.SY(s.y), T = D.T; for (let i = 0; i < 4; i++) { glow(ctx, TI[i % 3], 0.85 - i * 0.18); ctx.lineWidth = 5 - i; ctx.beginPath(); ctx.arc(x - f * i * T * 0.3, y, T * (0.8 + i * 0.12), f > 0 ? -1 : Math.PI - 1, f > 0 ? 1 : Math.PI + 1); ctx.stroke(); } } });
      }],
      ground_side: ['WALL OF SOUND', (p, f, k) => {
        add({ life: 1.0 + 0.3 * k.pw, x: pcx(p) + f * 0.9, fy: p.y + p.h, carry: new Set(), step(me, dt) { const nx = me.x + f * 8 * dt, stop = blocked(nx - 0.2, me.fy - 1.8, 0.4, 1.6);
            if (!stop) me.x = nx; for (const e of foes()) if (Math.abs(ex(e) - me.x) < 0.8 && ey(e) > me.fy - 2.6 && ey(e) < me.fy + 0.3 && !me.carry.has(e)) { me.carry.add(e); hit(e, 1.5, { stun: 0.8, c: TI[0] }); }
            for (const e of me.carry) if (!e.dead) drag(e, me.x + f * 0.7, null, 18, dt);
            if (stop) me.t = me.life; },
          end(me) { for (const e of me.carry) hit(e, k.dmg(6), { kx: f * 14, ky: -10, stun: 0.7, c: TI[2], big: true }); fxp({ k: 'ring', x: me.x, y: me.fy - 1, R: 1.8, c: TI[1], life: 0.4 }); shake(8); },
          draw(me, ctx, D) { const X = D.SX(me.x), Y = D.SY(me.fy), T = D.T; solid(ctx, '#1f1a24', 0.95); ctx.fillRect(X - T * 0.45, Y - T * 2.4, T * 0.9, T * 2.4); for (let i = 0; i < 2; i++) { const cy = Y - T * (0.6 + i * 1.1), r = T * (0.3 + 0.04 * Math.sin(me.t * 40)); solid(ctx, '#3a3340'); dot(ctx, X, cy, r); glow(ctx, TI[i], 0.8); ctx.lineWidth = 2; circ(ctx, X, cy, r); }
            for (let i = 0; i < 3; i++) { glow(ctx, TI[i], 0.5); ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(X + f * T * (0.5 + i * 0.3), Y - T * 1.2, T * (0.5 + i * 0.3), -0.8, 0.8); ctx.stroke(); } } });
      }],
      ground_up: ['WOOFER GEYSER', (p, f, k) => {
        const x0 = pcx(p), fy = p.y + p.h;
        [1, 2.4, 3.8].forEach((d, i) => after(i * 0.12, () => { const x = x0 + f * d * (1 + 0.15 * k.pw);
          for (const e of foes()) if (Math.abs(ex(e) - x) < 0.8 && ey(e) < fy + 0.3 && ey(e) > fy - 4.5) hit(e, k.dmg(4), { kx: f * 2, ky: -16 - 2 * k.pw, stun: 0.6, c: TI[i] });
          fxp({ k: 'col', x, fy, w: 1.3, h: 4.5, c: TI[i], life: 0.4 }); fxp({ k: 'cone', x, y: fy - 0.2, f: 0, L: 1, c: TI[i], life: 0.3, up: true }); shake(5); }));
      }],
      ground_down: ['SUB DROP', (p, f, k) => {
        add({ life: 0.3, step(me, dt, q) { q.vx = 0; shake(3); }, end(me, q) { const x = pcx(q), fy = q.y + q.h, R = 4.5 + k.pw;
            for (const e of foes()) if (Math.abs(ex(e) - x) < R && Math.abs(ey(e) - (fy - 0.5)) < 1.4) hit(e, k.dmg(6), { kx: away(e, x) * 4, ky: -15 - 2 * k.pw, stun: 0.8, c: TI[2], big: true });
            fxp({ k: 'ring', x, y: fy, R, c: TI[1], flat: 0.3, life: 0.55 }); fxp({ k: 'ring', x, y: fy, R: R * 0.6, c: TI[2], flat: 0.3, life: 0.4 }); dust(x, fy, '#8a7a6a', 18, 9); shake(13); },
          draw(me, ctx, D) { const q = P(); if (!q) return; const X = D.SX(pcx(q)), Y = D.SY(q.y + q.h); glow(ctx, TI[0], 0.6); ctx.lineWidth = 2; for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.ellipse(X, Y, D.T * (3 - me.t * 8 + i), D.T * 0.3, 0, 0, Math.PI * 2); ctx.stroke(); } } });
      }],
      air_neutral: ['SPEAKER STACK', (p, f, k) => {
        [-3, 0, 3].forEach((v, i) => shot({ x: pcx(p), y: pcy(p) + 0.3, vx: v + f * 2, vy: -2 + i, g: 30, life: 2, r: 0.4, pierce: 1,
          onHit: (e, s) => {}, onEnd: s => { burstAt(s.x, s.y - 0.2, 1.8 + 0.3 * k.pw, k.dmg(4), { ky: -11, big: i === 1 }, TI[i]); },
          draw: (s, ctx, D) => { const x = D.SX(s.x), y = D.SY(s.y), T = D.T; solid(ctx, '#1f1a24'); ctx.fillRect(x - T * 0.35, y - T * 0.4, T * 0.7, T * 0.8); solid(ctx, '#3a3340'); dot(ctx, x, y, T * 0.25); glow(ctx, TI[i], 0.9); ctx.lineWidth = 2; circ(ctx, x, y, T * 0.25); } }));
      }],
      air_side: ['BASS DIVE', (p, f, k) => {
        dive(p, { vy: 17, vx: f * (13 + 3 * k.pw), onHit: e => hit(e, k.dmg(4), { kx: f * 8, ky: 10, stun: 0.6, c: TI[1], big: true }),
          land: (x, fy) => { for (const s of [-1, 1]) shot({ x, y: fy - 0.4, vx: s * 10, vy: 0, life: 0.5, r: 0.45, pierce: 99, onHit: e => hit(e, 3, { kx: s * 6, ky: -10, stun: 0.5, c: TI[0] }),
              draw: (sh, ctx, D) => { glow(ctx, TI[0], 0.8); ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(D.SX(sh.x), D.SY(sh.y + 0.4), D.T * 0.6, s > 0 ? -1.6 : Math.PI + 0.2, s > 0 ? -0.2 : Math.PI + 1.6, false); ctx.stroke(); } }); shake(7); },
          draw(me, ctx, D) { const q = P(); if (!q) return; for (let i = 0; i < 3; i++) { glow(ctx, TI[i], 0.6); ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(D.SX(pcx(q) - f * 0.3 * i), D.SY(pcy(q) - 0.3 * i), D.T * (0.7 + 0.2 * i), 0, Math.PI * 2); ctx.stroke(); } } });
      }],
      air_up: ['AMP LAUNCH', (p, f, k) => {
        const x = pcx(p), y = p.y + p.h;
        for (const e of foes()) if (Math.abs(ex(e) - x) < 1.6 && ey(e) > y - 0.5 && ey(e) < y + 3.5) hit(e, k.dmg(4), { kx: 0, ky: 14, stun: 0.6, c: TI[2], big: true });
        for (const e of within(x, pcy(p), 1.7)) if (ey(e) <= y - 0.5) hit(e, 3, { kx: away(e, x) * 9, ky: -6, stun: 0.5, c: TI[0] });
        lift(p, 21 + 3 * k.pw); fxp({ k: 'amp', x, y: y + 0.2, c: TI[1], life: 0.5 }); fxp({ k: 'ring', x, y: y + 0.4, R: 2, c: TI[0], flat: 0.4, life: 0.4 }); shake(6);
      }],
      air_down: ['TITAN QUAKE', (p, f, k) => {
        dive(p, { vy: 34, vx: 0, onHit: e => hit(e, 4, { kx: 0, ky: 16, stun: 0.6, c: TI[2], big: true }), land: (x, fy) => {
          quakeRing(x, fy, 4 + k.pw, k.dmg(7), { ky: -13, big: true }, TI[2]);
          [0.3, 0.6].forEach(d => after(d, () => quakeRing(x, fy, 5 + k.pw, 2, { ky: -6, kx: 0, stun: 0.5 }, TI[0]))); dust(x, fy, '#8a7a6a', 20, 10); shake(14); },
          draw(me, ctx, D) { const q = P(); if (!q) return; glow(ctx, TI[1], 0.5); ctx.lineWidth = D.T * 0.9; ctx.beginPath(); ctx.moveTo(D.SX(pcx(q)), D.SY(q.y - 1.5)); ctx.lineTo(D.SX(pcx(q)), D.SY(q.y + q.h)); ctx.stroke(); } });
      }],
    },

    // ===================== PRODIGY: DEEP RESONANCE (stacks, echoes and shattering)
    'cb_pressplay:deep': {
      ground_neutral: ['RESONANCE CASCADE', (p, f, k) => {
        const x = pcx(p), y = pcy(p), R = 4 + 0.8 * k.pw, got = new Set();
        add({ life: 1.0, step(me) { const r = Math.min(1, me.t / 0.4) * R; for (const e of within(x, y, r)) if (!got.has(e)) { got.add(e); hit(e, 1 * k.m, { res: 2, stun: 0.5, c: DE[0] }); } },
          end() { let n = 0; for (const e of got) if (!e.dead) { const st = e._ppRes || 0; e._ppRes = 0; hit(e, k.dmg(2) + 2 * st, { ky: -8, kx: away(e, x) * 5, stun: 0.8, c: '#ffffff', big: st >= 3 }); fxp({ k: 'shatter', x: ex(e), y: ey(e), c: DE[0], life: 0.45 }); n++; } if (n) fxp({ k: 'label', x, y: y - 2, text: 'CASCADE x' + n, c: DE[0], life: 0.8 }); },
          draw(me, ctx, D) { const r = Math.min(1, me.t / 0.4) * R * D.T; for (let i = 0; i < 3; i++) { glow(ctx, DE[i], 0.6 * (1 - me.t)); ctx.lineWidth = 3 - i; circ(ctx, D.SX(x), D.SY(y), r * (1 - i * 0.15)); } solid(ctx, '#d4af37', 0.9); ctx.beginPath(); ctx.moveTo(D.SX(x) - D.T * 0.4, D.SY(y - 1.2)); ctx.quadraticCurveTo(D.SX(x), D.SY(y - 2.2), D.SX(x) + D.T * 0.4, D.SY(y - 1.2)); ctx.closePath(); ctx.fill(); } });
      }],
      ground_side: ['SONIC SPEAR', (p, f, k) => {
        const x0 = pcx(p) + f * 0.5, y0 = pcy(p);
        shot({ x: x0, y: y0, vx: f * (18 + 3 * k.pw), vy: 0, life: 0.6, r: 0.3, pierce: 99, wall: 'pass', onHit: e => hit(e, k.dmg(2), { kx: f * 4, ky: -3, res: 2, stun: 0.5, c: DE[0] }),
          onEnd: s => { const hits = s.hc ? [...s.hc.keys()].filter(e => e !== s) : [], x1 = s.x;
            after(0.25, () => { for (const e of hits) if (!e.dead) hit(e, k.dmg(2), { kx: -f * 6, ky: -6, res: 1, stun: 0.5, c: DE[2] }); fxp({ k: 'beam', x: x1, y: y0, f: -f, L: Math.abs(x1 - x0), w: 0.2, c: DE[2], life: 0.3 }); }); },
          draw: (s, ctx, D) => { const x = D.SX(s.x), y = D.SY(s.y), T = D.T; glow(ctx, DE[0], 0.95); ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(x - f * T * 1.2, y); ctx.lineTo(x, y); ctx.stroke(); ctx.beginPath(); ctx.moveTo(x, y - T * 0.2); ctx.lineTo(x + f * T * 0.4, y - T * 0.2); ctx.moveTo(x, y + T * 0.2); ctx.lineTo(x + f * T * 0.4, y + T * 0.2); ctx.stroke(); glow(ctx, DE[1], 0.4); circ(ctx, x, y, T * (0.4 + 0.1 * Math.sin(s.t * 40))); } });
      }],
      ground_up: ['HARMONIC TOWER', (p, f, k) => {
        const x = pcx(p) + f * 0.8, fy = p.y + p.h, H = 5 + k.pw;
        add({ life: 2.4, step(me, dt) { for (const e of foes()) if (Math.abs(ex(e) - x) < 0.9 && ey(e) < fy + 0.3 && ey(e) > fy - H) { drag(e, x, fy - H * 0.55, 8, dt); if (!inSmash()) e.vy = Math.min(e.vy || 0, -2); if (once(me, e, 0.3)) hit(e, 0.8 * k.m, { res: 1, stun: 0.45, c: DE[me.t * 3 % 3 | 0], tick: true }); } },
          end() { for (const e of foes()) if (Math.abs(ex(e) - x) < 1.1 && ey(e) < fy + 0.3 && ey(e) > fy - H) hit(e, k.dmg(3), { kx: 0, ky: -14, stun: 0.6, c: '#ffffff', big: true }); fxp({ k: 'col', x, fy, w: 1.6, h: H, c: DE[0], life: 0.4 }); },
          draw(me, ctx, D) { const X = D.SX(x), Y = D.SY(fy), T = D.T, a = Math.min(1, me.t / 0.2) * Math.min(1, (me.life - me.t) / 0.3); for (let i = 0; i < 3; i++) { glow(ctx, DE[i], 0.7 * a); ctx.lineWidth = 2.5; ctx.beginPath(); for (let j = 0; j <= 30; j++) { const u = j / 30; ctx.lineTo(X + Math.sin(u * Math.PI * (2 + i) + me.t * 8) * T * 0.7 * Math.sin(me.t * 6 + i), Y - u * H * T); } ctx.stroke(); } } });
      }],
      ground_down: ['SHATTERPOINT', (p, f, k) => {
        const x = pcx(p), y = pcy(p); let n = 0;
        for (const e of within(x, y, 8)) { const st = e._ppRes || 0;
          if (st > 0) { e._ppRes = 0; hit(e, k.dmg(3) + 2 * st, { ky: -9, kx: away(e, x) * 6, stun: 0.9, c: '#ffffff', big: true }); fxp({ k: 'link', x1: x, y1: y, x2: ex(e), y2: ey(e), c: DE[0], life: 0.35 }); fxp({ k: 'shatter', x: ex(e), y: ey(e), c: DE[0], life: 0.5 }); n++; }
          else if (Math.hypot(ex(e) - x, ey(e) - y) < 2.6) hit(e, 2 * k.m, { res: 3, stun: 0.6, kx: away(e, x) * 4, ky: -4, c: DE[1] }); }
        fxp({ k: 'ring', x, y: p.y + p.h, R: 2.6, c: DE[1], flat: 0.35, life: 0.4 }); fxp({ k: 'label', x, y: y - 1.8, text: n ? 'SHATTERPOINT x' + n : 'TUNED IN', c: DE[0], life: 0.8 }); shake(n ? 9 : 4);
      }],
      air_neutral: ['ECHO CHAMBER', (p, f, k) => {
        const R = 2.2 + 0.4 * k.pw;
        [0, 0.4, 0.8].forEach((d, i) => after(d, () => { const q = P(); if (!q) return; for (const e of within(pcx(q), pcy(q), R)) hit(e, i === 2 ? k.dmg(3) : 2 * k.m, { res: 1, kx: away(e, pcx(q)) * (i === 2 ? 10 : 2), ky: i === 2 ? -9 : -2, stun: 0.5, c: DE[i] }); fxp({ k: 'ring', x: pcx(q), y: pcy(q), R, c: DE[i], life: 0.35 }); }));
        add({ life: 0.9, step(me, dt, q) { q.vy = Math.min(q.vy, 1); }, draw(me, ctx, D) { const q = P(); if (!q) return; glow(ctx, DE[0], 0.25); dot(ctx, D.SX(pcx(q)), D.SY(pcy(q)), R * D.T); glow(ctx, DE[2], 0.6); ctx.lineWidth = 2; circ(ctx, D.SX(pcx(q)), D.SY(pcy(q)), R * D.T); } });
      }],
      air_side: ['DOPPLER DASH', (p, f, k) => {
        rush(p, f, { speed: 18 + 4 * k.pw, dur: 0.26, onHit: e => hit(e, k.dmg(2), { kx: f * 6, ky: -4, res: 1, stun: 0.5, c: DE[0] }),
          end(me) { const victims = me.hc ? [...me.hc.keys()].filter(e => e !== me) : [], pts = me.trail.slice();
            add({ life: 0.4, pts, end() { for (const e of victims) if (!e.dead) hit(e, k.dmg(2), { kx: f * 10, ky: -7, res: 1, stun: 0.6, c: DE[2], big: true }); }, draw(g, ctx, D) { trail(ctx, D, g.pts, DE[2], D.T * 0.6 * (1 - g.t / 0.4)); } }); },
          draw(me, ctx, D) { trail(ctx, D, me.trail, DE[0], D.T * 0.5); } });
      }],
      air_up: ['OVERTONE RISE', (p, f, k) => {
        lift(p, 18 + 3 * k.pw, { life: 0.45, step(me, dt, q) { if (once(me, me, 0.12)) { const x = pcx(q), y = q.y + q.h; for (const e of within(x, y + 0.3, 1.5)) hit(e, 1.5 * k.m, { res: 1, ky: -8, stun: 0.4, c: DE[0] }); fxp({ k: 'ring', x, y, R: 1.3, c: DE[me.t * 7 % 3 | 0], flat: 0.35, life: 0.4 }); } } });
      }],
      air_down: ['GRAVE BELL', (p, f, k) => {
        p.vy = -4;
        shot({ x: pcx(p), y: p.y + p.h + 0.3, vx: 0, vy: 16, g: 30, life: 1.6, r: 0.55, pierce: 99, onHit: e => hit(e, k.dmg(3), { kx: 0, ky: 15, res: 2, stun: 0.6, c: DE[1], big: true }),
          onEnd: s => { for (const e of within(s.x, s.y - 0.3, 3)) hit(e, 2 * k.m, { res: 2, kx: away(e, s.x) * 6, ky: -7, stun: 0.6, c: DE[0] }); fxp({ k: 'ring', x: s.x, y: s.y, R: 3, c: DE[0], flat: 0.4, life: 0.5 }); fxp({ k: 'ring', x: s.x, y: s.y, R: 2, c: DE[2], flat: 0.4, life: 0.4 }); shake(6); },
          draw: (s, ctx, D) => { const x = D.SX(s.x), y = D.SY(s.y), T = D.T; solid(ctx, '#3d4a6b'); ctx.beginPath(); ctx.moveTo(x - T * 0.55, y + T * 0.4); ctx.quadraticCurveTo(x - T * 0.5, y - T * 0.6, x, y - T * 0.6); ctx.quadraticCurveTo(x + T * 0.5, y - T * 0.6, x + T * 0.55, y + T * 0.4); ctx.closePath(); ctx.fill(); glow(ctx, DE[0], 0.8); ctx.lineWidth = 2; ctx.stroke(); } });
      }],
    },

    // ===================== MIXTAPE: SIDE A (tape whip)
    'cb_pp_mixtape:a': {
      ground_neutral: ['TAPE TORNADO', (p, f, k) => {
        zone({ follow: true, R: 2.4 + 0.4 * k.pw, life: 0.8, every: 0.1, pull: 8, onTick: e => hit(e, 0.8, { stun: 0.4, c: SA[0], tick: true }),
          end(z) { for (const e of within(z.x, z.y, z.R + 0.3)) hit(e, k.dmg(3), { kx: away(e, z.x) * 3, ky: -15 - 2 * k.pw, stun: 0.6, c: SA[1], big: true }); },
          draw(z, ctx, D) { const X = D.SX(z.x), Y = D.SY(z.y), R = z.R * D.T; for (let j = 0; j < 2; j++) { const pts = []; for (let i = 0; i <= 40; i++) { const a = i / 40 * Math.PI * 4 + z.t * 14 + j * Math.PI, r = R * (0.3 + 0.7 * i / 40); pts.push([X + Math.cos(a) * r, Y + Math.sin(a) * r * 0.55 - i * 0.6]); } tapeLine(ctx, pts, SA[j], 4); } } });
      }],
      ground_side: ['REWIND RUSH', (p, f, k) => {
        const x0 = p.x;
        rush(p, f, { speed: 20 + 4 * k.pw, dur: 0.22, onHit: e => hit(e, k.dmg(3), { kx: f * 5, ky: -5, stun: 0.9, c: SA[0] }),
          end(me) { const victims = me.hc ? [...me.hc.keys()].filter(e => e !== me) : [];
            after(0.18, () => { const q = P(); if (!q || blocked(x0, q.y, q.w, q.h)) return; const xa = pcx(q); q.x = x0; tele(); const xb = pcx(q);
              for (const e of foes()) if (victims.includes(e) || nearLine(e, xa, pcy(q), xb, pcy(q), 0.8)) hit(e, k.dmg(3), { kx: -f * 9, ky: -7, stun: 0.6, c: SA[2], big: true });
              fxp({ k: 'vhs', x1: xa, x2: xb, y: pcy(q), c: SA[2], life: 0.4 }); fxp({ k: 'label', x: xb, y: q.y - 1.2, text: '⏪ REWIND', c: SA[2], life: 0.7 }); shake(7); }); },
          draw(me, ctx, D) { trail(ctx, D, me.trail, SA[0], D.T * 0.6); const q = P(); if (q) fxp({ k: 'ghost', x: pcx(q), y: pcy(q), c: SA[0], life: 0.2 }); } });
      }],
      ground_up: ['PAUSE / PLAY', (p, f, k) => {
        const x = pcx(p) + f * 1.2, y = pcy(p) - 0.4, R = 3 + 0.5 * k.pw, paused = within(x, y, R);
        for (const e of paused) { hit(e, 1, { stun: 1.0, kx: 0, ky: 0, c: SA[1] }); e._ppFrozen = Math.max(e._ppFrozen || 0, 0.8); }
        fxp({ k: 'ring', x, y, R, c: SA[1], life: 0.3 });
        add({ life: 0.8, paused, step(me) { for (const e of me.paused) if (!e.dead && canDrag(e)) { e.vx = 0; e.vy = 0; } },
          end(me) { for (const e of me.paused) if (!e.dead) { e._ppFrozen = 0; hit(e, k.dmg(5), { kx: f * 2, ky: -16 - 3 * k.pw, stun: 0.6, c: SA[0], big: true }); } fxp({ k: 'label', x, y: y - 1.5, text: '▶ PLAY', c: SA[2], life: 0.7 }); },
          draw(me, ctx, D) { for (const e of me.paused) { if (e.dead) continue; const X = D.SX(ex(e)), Y = D.SY(e.y) - D.T * 0.5; solid(ctx, '#ffffff', 0.9); ctx.fillRect(X - D.T * 0.22, Y - D.T * 0.25, D.T * 0.14, D.T * 0.5); ctx.fillRect(X + D.T * 0.08, Y - D.T * 0.25, D.T * 0.14, D.T * 0.5); glow(ctx, SA[1], 0.25); ctx.fillRect(D.SX(e.x) - 2, D.SY(e.y) - 2, (e.w || 0.9) * D.T + 4, (e.h || 0.9) * D.T + 4); } } });
      }],
      ground_down: ['SPOOL SNARE', (p, f, k) => {
        const fy = p.y + p.h, snared = new Set();
        for (const s of [-1, 1]) shot({ x: pcx(p), y: fy - 0.3, vx: s * (9 + 2 * k.pw), vy: 0, life: 0.7, r: 0.35, pierce: 99, sx: pcx(p),
          onHit: e => { snared.add(e); hit(e, 1, { stun: 1.2, c: SA[0] }); }, move(sh, dt) { sh.x += sh.vx * dt; for (const e of snared) if (!e.dead && Math.abs(ex(e) - sh.x) < 1.2) drag(e, sh.x, null, 30, dt); },
          draw: (sh, ctx, D) => { const q = P(); if (q) tapeLine(ctx, [[D.SX(pcx(q)), D.SY(fy - 0.2)], [D.SX(sh.x), D.SY(sh.y)]], SA[0], 3); solid(ctx, '#2b2233'); dot(ctx, D.SX(sh.x), D.SY(sh.y), D.T * 0.3); glow(ctx, SA[1], 0.9); ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(D.SX(sh.x), D.SY(sh.y), D.T * 0.2, sh.t * 20, sh.t * 20 + 4); ctx.stroke(); } });
        add({ life: 1.05, step(me, dt, q) { if (me.t > 0.7) for (const e of snared) if (!e.dead) drag(e, pcx(q), null, 30, dt); },
          end(me, q) { for (const e of snared) if (!e.dead) hit(e, k.dmg(4), { kx: f * 2, ky: -12 - 2 * k.pw, stun: 0.6, c: SA[1], big: true }); } });
      }],
      air_neutral: ['MIXTAPE MEDLEY', (p, f, k) => {
        p.vy = Math.min(p.vy, -2);
        for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2 + Math.PI / 4;
          shot({ x: pcx(p), y: pcy(p), vx: Math.cos(a) * 10, vy: Math.sin(a) * 10, delay: i * 0.06, life: 1.6, r: 0.35, home: 7, seek: 10, c: SA[i % 3],
            onHit: e => hit(e, k.dmg(2.5) * 0.7, { kx: Math.sign(e.vx || f) * 5, ky: -6, stun: 0.5, c: SA[i % 3] }), draw: (s, ctx, D) => { if (s.t < s.delay) return; cassette(ctx, D.SX(s.x), D.SY(s.y), D.T * 0.3, s.t * 12, s.c); } }); }
      }],
      air_side: ['FAST FORWARD', (p, f, k) => {
        rush(p, f, { speed: 24 + 5 * k.pw, dur: 0.24, onHit: e => hit(e, k.dmg(3), { kx: f * 12, ky: -5, stun: 0.6, c: SA[1] }),
          tick(me, dt, q) { if (once(me, me, 0.035)) fxp({ k: 'ghost', x: pcx(q), y: pcy(q), c: SA[me.t * 30 % 3 | 0], life: 0.25 }); },
          draw(me, ctx, D) { const q = P(); if (!q) return; glow(ctx, '#ffffff', 0.9); ctx.font = 'bold ' + Math.round(D.T * 0.5) + 'px sans-serif'; ctx.textAlign = 'center'; ctx.fillText(f > 0 ? '⏩' : '⏪', D.SX(pcx(q)), D.SY(q.y - 0.3)); } });
      }],
      air_up: ['LOOP PEDAL', (p, f, k) => {
        lift(p, 16 + 3 * k.pw, { life: 0.45, step(me, dt, q) { q.vx *= 0.9; for (const e of within(pcx(q), pcy(q), 1.6)) { drag(e, pcx(q), pcy(q) - 0.6, 25, dt); if (once(me, e, 0.1)) hit(e, 0.8, { ky: Math.min(-8, q.vy), stun: 0.4, c: SA[0], tick: true }); } },
          end(me, q) { for (const e of within(pcx(q), pcy(q), 1.9)) hit(e, k.dmg(3), { kx: f * 3, ky: -14, stun: 0.6, c: SA[1], big: true }); },
          draw(me, ctx, D) { const q = P(); if (!q) return; const X = D.SX(pcx(q)), Y = D.SY(pcy(q)), R = D.T * 1.3, pts = []; for (let i = 0; i <= 30; i++) { const a = i / 30 * Math.PI * 2 + me.t * 20; pts.push([X + Math.cos(a) * R, Y + Math.sin(a) * R * 0.8]); } tapeLine(ctx, pts, SA[0], 4); } });
      }],
      air_down: ['EJECT METEOR', (p, f, k) => {
        p.vy = -8;
        shot({ x: pcx(p), y: p.y + p.h + 0.2, vx: 0, vy: 26, life: 1.2, r: 0.45, pierce: 99, onHit: e => hit(e, k.dmg(5), { kx: 0, ky: 18, stun: 0.6, c: SA[0], big: true }),
          onEnd: s => burstAt(s.x, s.y - 0.3, 1.8 + 0.3 * k.pw, 3, { ky: -8 }, SA[1]),
          draw: (s, ctx, D) => { trail(ctx, D, [[s.x, s.y - 2], [s.x, s.y]], SA[0], D.T * 0.5); cassette(ctx, D.SX(s.x), D.SY(s.y), D.T * 0.4, 0, SA[1]); } });
      }],
    },

    // ===================== MIXTAPE: RIBBON (grappling ribbon)
    'cb_pp_mixtape:r': {
      ground_neutral: ['RIBBON DANCE', (p, f, k) => {
        const R = 2.6 + 0.5 * k.pw;
        add({ life: 1.0, step(me, dt, q) { for (const e of foes()) { const d = Math.hypot(ex(e) - pcx(q), ey(e) - pcy(q)); if (Math.abs(d - R) < 0.8 && once(me, e, 0.15)) hit(e, 1, { kx: away(e, pcx(q)) * 2, ky: -3, stun: 0.4, c: RB[me.t * 6 % 3 | 0], tick: true }); } },
          end(me, q) { for (const e of within(pcx(q), pcy(q), R + 0.6)) hit(e, k.dmg(3), { kx: away(e, pcx(q)) * 12, ky: -8, stun: 0.6, c: RB[2], big: true }); },
          draw(me, ctx, D) { const q = P(); if (!q) return; const X = D.SX(pcx(q)), Y = D.SY(pcy(q)); for (let j = 0; j < 3; j++) { const pts = []; for (let i = 0; i <= 24; i++) { const a = i / 24 * Math.PI * 1.3 + me.t * 9 + j * Math.PI * 2 / 3, r = R * D.T * (1 + 0.06 * Math.sin(i + me.t * 20)); pts.push([X + Math.cos(a) * r, Y + Math.sin(a) * r * 0.7]); } glow(ctx, RB[j], 0.9); ctx.lineWidth = 4; ctx.beginPath(); pts.forEach(q2 => ctx.lineTo(q2[0], q2[1])); ctx.stroke(); } } });
      }],
      ground_side: ['LASSO', (p, f, k) => {
        const caught = [];
        shot({ x: pcx(p), y: pcy(p), vx: f * 26, vy: 0, life: 0.3 + 0.08 * k.pw, r: 0.45, pierce: 3, onHit: e => { caught.push(e); hit(e, 1, { stun: 1.0, c: RB[0] }); },
          onEnd: s => { add({ life: 0.3, step(me, dt, q) { for (const e of caught) if (!e.dead) drag(e, pcx(q) + f * 1.1, pcy(q) - 0.5, 30, dt); },
            end(me, q) { for (const e of caught) if (!e.dead) hit(e, k.dmg(5), { kx: f * 3, ky: -12, stun: 0.7, c: RB[2], big: true }); fxp({ k: 'ring', x: pcx(q) + f * 1.1, y: q.y + q.h, R: 1.4, c: RB[2], flat: 0.4, life: 0.35 }); },
            draw(me, ctx, D) { const q = P(); if (!q) return; for (const e of caught) if (!e.dead) { glow(ctx, RB[0], 0.9); ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(D.SX(pcx(q)), D.SY(pcy(q))); ctx.lineTo(D.SX(ex(e)), D.SY(ey(e))); ctx.stroke(); circ(ctx, D.SX(ex(e)), D.SY(ey(e)), D.T * 0.55); } } }); },
          draw: (s, ctx, D) => { const q = P(); if (!q) return; glow(ctx, RB[0], 0.95); ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(D.SX(pcx(q)), D.SY(pcy(q))); ctx.lineTo(D.SX(s.x), D.SY(s.y)); ctx.stroke(); glow(ctx, RB[1], 0.9); ctx.lineWidth = 2.5; circ(ctx, D.SX(s.x), D.SY(s.y), D.T * 0.45); } });
      }],
      ground_up: ['MAYPOLE', (p, f, k) => {
        const ax = pcx(p), ay = p.y - 4;
        lift(p, 15 + 3 * k.pw, { life: 0.6, step(me, dt, q) { q.vx = (ax - pcx(q)) * 6;
            for (const e of within(pcx(q), pcy(q), 2.2)) { const a = Math.atan2(ey(e) - pcy(q), ex(e) - pcx(q)) + dt * 8; drag(e, pcx(q) + Math.cos(a) * 1.4, pcy(q) + Math.sin(a) * 0.9 - 0.5, 22, dt); if (once(me, e, 0.12)) hit(e, 0.8, { ky: -7, stun: 0.4, c: RB[me.t * 5 % 3 | 0], tick: true }); } },
          end(me, q) { for (const e of within(pcx(q), pcy(q), 2.4)) hit(e, k.dmg(3), { kx: away(e, pcx(q)) * 10, ky: -10, stun: 0.6, c: RB[2], big: true }); },
          draw(me, ctx, D) { const q = P(); if (!q) return; const X = D.SX(ax), Y = D.SY(ay); glow(ctx, RB[1], 0.9); dot(ctx, X, Y, D.T * 0.2); for (let j = 0; j < 3; j++) { glow(ctx, RB[j], 0.85); ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(X, Y); const a = me.t * 14 + j * 2.1; ctx.quadraticCurveTo(X + Math.cos(a) * D.T * 1.2, (Y + D.SY(pcy(q))) / 2, D.SX(pcx(q)) + Math.cos(a) * D.T * 0.6, D.SY(pcy(q))); ctx.stroke(); } } });
      }],
      ground_down: ['TRIPWIRE', (p, f, k) => {
        const x = pcx(p), fy = p.y + p.h, L = 4 + k.pw;
        add({ life: 3, step(me) { for (const e of foes()) if (Math.abs(ex(e) - x) < L && e.y + (e.h || 0.9) > fy - 0.6 && ey(e) < fy + 0.3 && once(me, e)) { hit(e, k.dmg(3), { kx: (e.vx || 0) > 0 ? 3 : -3, ky: -9, stun: 1.2, c: RB[2] }); fxp({ k: 'ring', x: ex(e), y: fy - 0.2, R: 0.8, c: RB[0], flat: 0.4, life: 0.3 }); } },
          draw(me, ctx, D) { const a = Math.min(1, (me.life - me.t) / 0.3), Y = D.SY(fy - 0.3); glow(ctx, RB[0], 0.85 * a); ctx.lineWidth = 2.5; ctx.beginPath(); for (let i = 0; i <= 30; i++) { const u = i / 30; ctx.lineTo(D.SX(x - L + u * L * 2), Y + Math.sin(u * 30 + me.t * 6) * 1.5); } ctx.stroke(); solid(ctx, RB[1], a); dot(ctx, D.SX(x - L), Y, D.T * 0.12); dot(ctx, D.SX(x + L), Y, D.T * 0.12); } });
      }],
      air_neutral: ['COCOON', (p, f, k) => {
        const e0 = nearest(pcx(p), pcy(p), 5.5 + k.pw);
        if (!e0) { burstAt(pcx(p), pcy(p), 1.6, 2, { ky: -5 }, RB[0]); return; }
        hit(e0, 1, { stun: 1.4, kx: 0, ky: 0, c: RB[0] }); e0._ppFrozen = Math.max(e0._ppFrozen || 0, 0.6);
        add({ life: 0.6, e: e0, step(me, dt, q) { q.vy = Math.min(q.vy, 1); if (!me.e.dead && canDrag(me.e)) { me.e.vx = 0; me.e.vy = 0; } },
          end(me) { if (me.e.dead) return; const x = ex(me.e), y = ey(me.e); me.e._ppFrozen = 0; hit(me.e, k.dmg(5), { kx: f * 12, ky: -10, stun: 0.6, c: RB[2], big: true }); for (const e of within(x, y, 1.8)) if (e !== me.e) hit(e, 2, { kx: away(e, x) * 8, ky: -6, c: RB[1] }); fxp({ k: 'ring', x, y, R: 1.8, c: RB[2], life: 0.35 }); },
          draw(me, ctx, D) { const q = P(); if (!q || me.e.dead) return; const X = D.SX(ex(me.e)), Y = D.SY(ey(me.e)), r = D.T * 0.6; glow(ctx, RB[0], 0.6); ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(D.SX(pcx(q)), D.SY(pcy(q))); ctx.lineTo(X, Y); ctx.stroke();
            for (let i = 0; i < 6; i++) { glow(ctx, RB[i % 3], 0.9); ctx.lineWidth = 3; ctx.beginPath(); ctx.ellipse(X, Y - r * 0.6 + i * r * 0.25, r, r * 0.2, Math.sin(me.t * 10 + i) * 0.3, 0, Math.PI * 2); ctx.stroke(); } } });
      }],
      air_side: ['SLINGSHOT', (p, f, k) => {
        const ax = pcx(p) + f * 6, ay = pcy(p);
        add({ life: 0.15, step(me, dt, q) { q.vx = -f * 3; q.vy = Math.min(q.vy, 0.5); },
          end(me, q) { rush(q, f, { speed: 26 + 5 * k.pw, dur: 0.26, onHit: e => hit(e, k.dmg(4), { kx: f * 13, ky: -7, stun: 0.6, c: RB[1], big: true }), draw(m2, ctx, D) { trail(ctx, D, m2.trail, RB[0], D.T * 0.5); } }); },
          draw(me, ctx, D) { const q = P(); if (!q) return; glow(ctx, RB[0], 0.9); ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(D.SX(ax), D.SY(ay - 0.8)); ctx.lineTo(D.SX(pcx(q)), D.SY(pcy(q))); ctx.lineTo(D.SX(ax), D.SY(ay + 0.8)); ctx.stroke(); } });
      }],
      air_up: ['SKYHOOK SWING', (p, f, k) => {
        const x0 = pcx(p), y0 = pcy(p), ax = x0 + f * 2.5, ay = y0 - 4.5;
        for (const e of foes()) if (nearLine(e, x0, y0, ax, ay, 0.6)) hit(e, k.dmg(3), { kx: f * 3, ky: -10, stun: 0.6, c: RB[0] });
        lift(p, 18 + 3 * k.pw); p.vx = f * 8;
        add({ life: 0.4, step(me, dt, q) { q.vx = f * 8; }, draw(me, ctx, D) { const q = P(); if (!q) return; glow(ctx, RB[0], 0.9 * (1 - me.t / 0.4)); ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(D.SX(ax), D.SY(ay)); ctx.lineTo(D.SX(pcx(q)), D.SY(pcy(q))); ctx.stroke(); glow(ctx, RB[1], 1); star(ctx, D.SX(ax), D.SY(ay), D.T * 0.3, me.t * 6); } });
      }],
      air_down: ['BINDING PLUMMET', (p, f, k) => {
        shot({ x: pcx(p), y: p.y + p.h, vx: 0, vy: 24, life: 0.4, r: 0.5, pierce: 1, wall: 'stop',
          onHit: e => { hit(e, k.dmg(4), { kx: 0, ky: 20, stun: 0.8, c: RB[2], big: true }); const q = P(); if (q) q.vy = Math.max(q.vy, 16); fxp({ k: 'ring', x: ex(e), y: ey(e), R: 1.2, c: RB[0], life: 0.3 }); },
          draw: (s, ctx, D) => { const q = P(); if (!q) return; glow(ctx, RB[0], 0.95); ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(D.SX(pcx(q)), D.SY(q.y + q.h)); for (let i = 1; i <= 8; i++) { const u = i / 8; ctx.lineTo(D.SX(pcx(q) + Math.sin(u * 12 + s.t * 30) * 0.15), D.SY(q.y + q.h + (s.y - q.y - q.h) * u)); } ctx.stroke(); glow(ctx, RB[1], 1); star(ctx, D.SX(s.x), D.SY(s.y), D.T * 0.3, s.t * 9); } });
      }],
    },
  };

  // ---------------------------------------------------------------- picking and firing
  function keyDir() {
    const keys = window._gameKeys || new Set(), mk = window.mobileKeys || {};
    const up = keys.has('arrowup') || keys.has('w') || !!mk.up, down = keys.has('arrowdown') || !!mk.down;
    const side = keys.has('arrowright') || keys.has('d') || !!mk.right || keys.has('arrowleft') || keys.has('a') || !!mk.left;
    return (down && !up) ? 'down' : (up && !down) ? 'up' : side ? 'side' : 'neutral';
  }
  function setFor(ch, s) {
    if (ch === 'cb_pressplay') return SETS['cb_pressplay:' + (s.variant || 'cres')] || SETS['cb_pressplay:cres'];
    if (ch === 'cb_pp_mixtape') return SETS['cb_pp_mixtape:' + (s.variant === 'r' ? 'r' : 'a')];
    return SETS[ch];
  }
  // the strike engine's charged special for one of these fighters: s = the move it was charging, pw = charge power
  function spec(ch, s, pw) {
    const p = P(); if (!p) return null;
    const set = setFor(ch, s); if (!set) return null;
    const air = !p.onGround, dir = keyDir(), mv = set[(air ? 'air_' : 'ground_') + dir]; if (!mv) return null;
    const [name, go, kind] = mv, col = ({ brawler: BR, cb_slugger: SL, archmage: AM, conduit: CO })[ch] || (ch === 'cb_pressplay' ? (s.variant === 'titan' ? TI : s.variant === 'deep' ? DE : CR) : (s.variant === 'r' ? RB : SA));
    const f = (s.dir || p.lastMoveDir || 1) >= 0 ? 1 : -1, m = s.beat ? 1.25 : 1;
    const moving = /RUSH|KNUCKLE|CANNON|DIVE|STEP|FAST FORWARD|SLINGSHOT|GLISSANDO|DASH|SWING/.test(name);
    return {
      fd: { windup: 0, sweet: 0.1, active: 0.45, endlag: air ? 0.28 : 0.4, sweetDmg: 1, sweetKb: 1.2, sweetStop: 0.1, sweetShake: 12, chargeDmg: 0, root: !moving && !air, hang: false, quiet: true },
      dir: f, color: col[0], aim: dir === 'neutral' ? 'side' : dir, variant: s.variant,
      fire: pw2 => {
        const q = P(); if (!q) return;
        const P2 = pw2 != null ? pw2 : pw;
        if (kind === 'rec' && inSmash()) {   // Smash: the recovery comes back when you land or grab a ledge
          if (q._smRecUsed) { msg('💨 ' + name + ' comes back when you land or grab a ledge'); return; }
          q._smRecUsed = true;
        }
        // the Brawler's charged specials cash in his combo: +1 damage per 3 hits (up to +5)
        const cash = ch === 'brawler' && window.__brCombo ? window.__brCombo.cashOut() : null, cb = cash && cash.n >= 2 ? cash.dmg : 0;
        const k = { pw: P2, m, air, dmg: b => Math.round((b + 3 * P2) * m) + cb };
        go(q, f, k);
        label(q, name, col[0]);
        msg('💥 ' + name + '! (charged ' + Math.round(P2 * 100) + '%' + (s.beat ? ', ON BEAT' : '') + (cb ? ', x' + cash.n + ' COMBO +' + cb + ' dmg' : '') + ')');
        shake(4 + 4 * P2);
      },
    };
  }

  function tick(dt) {
    const p = P(); if (!p) return;
    for (let i = S.ents.length - 1; i >= 0; i--) {
      const o = S.ents[i]; if (!o) continue;
      o.t += dt; let gone = false;
      try {
        if (o.step && o.step(o, dt, p)) gone = true;
        if (!gone && o.life != null && o.t >= o.life) { gone = true; if (o.end) o.end(o, p); }
      } catch (e) { gone = true; (window.__ppStrikeErr = window.__ppStrikeErr || []).push(String(e && e.stack || e)); }
      if (gone) { const j = S.ents.indexOf(o); if (j >= 0) S.ents.splice(j, 1); }
    }
    for (let i = S.fx.length - 1; i >= 0; i--) { S.fx[i].t += dt; if (S.fx[i].t >= S.fx[i].life) S.fx.splice(i, 1); }
  }

  function draw(ctx, SX, SY, T) {
    if (!S.ents.length && !S.fx.length) return;
    const D = { SX, SY, T };
    ctx.save(); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    for (const o of S.ents) if (o.draw) { ctx.save(); try { o.draw(o, ctx, D); } catch (e) {} ctx.restore(); }
    for (const f of S.fx) {
      const u = f.t / f.life, a = 1 - u; ctx.save();
      try {
        if (f.k === 'label') { solid(ctx, '#000000', 0.6 * a); ctx.font = 'bold ' + Math.round(T * 0.42) + 'px sans-serif'; ctx.textAlign = 'center'; const x = SX(f.x), y = SY(f.y) - u * T * 0.8; ctx.fillText(f.text, x + 2, y + 2); solid(ctx, f.c || '#ffffff', a); ctx.fillText(f.text, x, y); }
        else if (f.k === 'ring') { glow(ctx, f.c, a); ctx.lineWidth = 3 + 3 * a; const r = f.R * T * (f.inward ? 1 - 0.6 * u : 0.3 + 0.7 * u); ctx.beginPath(); ctx.ellipse(SX(f.x), SY(f.y), r, r * (f.flat || 1), 0, 0, Math.PI * 2); ctx.stroke(); }
        else if (f.k === 'ringBolt') { glow(ctx, f.c, a); ctx.lineWidth = 2; const r = f.R * T * (0.3 + 0.7 * u), x = SX(f.x), y = SY(f.y); ctx.beginPath(); for (let i = 0; i <= 24; i++) { const an = i / 24 * Math.PI * 2, rr = r + (Math.random() - 0.5) * T * 0.3; ctx.lineTo(x + Math.cos(an) * rr, y + Math.sin(an) * rr); } ctx.stroke(); }
        else if (f.k === 'spark') { glow(ctx, f.c, a); star(ctx, SX(f.x), SY(f.y), T * (f.big ? 0.5 : 0.3) * (0.6 + u), u * 3); }
        else if (f.k === 'flash') { glow(ctx, f.c, 0.7 * a); dot(ctx, SX(f.x), SY(f.y), f.R * T * (0.5 + 0.5 * u)); }
        else if (f.k === 'bolt') { glow(ctx, '#ffffff', a); ctx.lineWidth = 2.5; zig(ctx, SX(f.x1), SY(f.y1), SX(f.x2), SY(f.y2), 7, T * 0.3); glow(ctx, f.c, 0.5 * a); ctx.lineWidth = 6; zig(ctx, SX(f.x1), SY(f.y1), SX(f.x2), SY(f.y2), 7, T * 0.3); }
        else if (f.k === 'link') { glow(ctx, f.c, a); ctx.lineWidth = 2; ctx.setLineDash([4, 4]); ctx.beginPath(); ctx.moveTo(SX(f.x1), SY(f.y1)); ctx.lineTo(SX(f.x2), SY(f.y2)); ctx.stroke(); }
        else if (f.k === 'strike') { const x = SX(f.x); glow(ctx, '#ffffff', a); ctx.lineWidth = 3; zig(ctx, x, SY(f.y1), x, SY(f.y2), 12, T * 0.5); glow(ctx, f.c, 0.4 * a); ctx.lineWidth = 9; zig(ctx, x, SY(f.y1), x, SY(f.y2), 12, T * 0.5); }
        else if (f.k === 'beam') { const x0 = SX(f.x), y = SY(f.y), x1 = SX(f.x + f.f * f.L), w = f.w * T * (1 - 0.7 * u); glow(ctx, f.c, a); ctx.lineWidth = w * 2; ctx.beginPath(); ctx.moveTo(x0, y); ctx.lineTo(x1, y); ctx.stroke(); glow(ctx, '#ffffff', a); ctx.lineWidth = w * 0.7; ctx.stroke(); }
        else if (f.k === 'col') { const x = SX(f.x), fy = SY(f.fy), w = f.w * T, h = f.h * T * Math.min(1, u * 4); glow(ctx, f.c, 0.6 * a); ctx.fillRect(x - w / 2, fy - h, w, h); glow(ctx, '#ffffff', 0.5 * a); ctx.fillRect(x - w * 0.15, fy - h, w * 0.3, h); }
        else if (f.k === 'cone') { const x = SX(f.x), y = SY(f.y); glow(ctx, f.c, 0.8 * a); ctx.beginPath(); if (f.up) { ctx.moveTo(x - T * 0.4, y); ctx.lineTo(x - T * 0.9, y - T * 1.6 * u); ctx.lineTo(x + T * 0.9, y - T * 1.6 * u); ctx.lineTo(x + T * 0.4, y); } else { ctx.moveTo(x, y - T * 0.3); ctx.lineTo(x + f.f * f.L * T * (0.4 + 0.6 * u), y - T * 1.1); ctx.lineTo(x + f.f * f.L * T * (0.4 + 0.6 * u), y + T * 1.1); ctx.lineTo(x, y + T * 0.3); } ctx.closePath(); ctx.fill(); }
        else if (f.k === 'arc') { const x = SX(f.x), y = SY(f.y), R = f.R * T, s0 = f.f > 0 ? -1.6 : Math.PI + 1.6, s1 = f.f > 0 ? 1.0 : Math.PI - 1.0, cur = s0 + (s1 - s0) * Math.min(1, u * 3); glow(ctx, f.c, a); ctx.lineWidth = T * 0.35; ctx.beginPath(); ctx.arc(x, y, R, Math.min(s0, cur), Math.max(s0, cur)); ctx.stroke(); solid(ctx, '#c8a26b', a); ctx.lineWidth = T * 0.2; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(cur) * R, y + Math.sin(cur) * R); ctx.stroke(); }
        else if (f.k === 'spike') { const x = SX(f.x), fy = SY(f.fy), h = f.h * T * Math.sin(Math.min(1, u * 1.6) * Math.PI); solid(ctx, f.c, a); ctx.beginPath(); ctx.moveTo(x - T * 0.25, fy); ctx.lineTo(x, fy - h); ctx.lineTo(x + T * 0.25, fy); ctx.closePath(); ctx.fill(); glow(ctx, f.c2 || '#ffffff', 0.5 * a); ctx.lineWidth = 1.5; ctx.stroke(); }
        else if (f.k === 'glovesDown') { glove(ctx, SX(f.x - 0.3), SY(f.fy - 0.3), T * 0.3, -1, f.c); glove(ctx, SX(f.x + 0.3), SY(f.fy - 0.3), T * 0.3, 1, f.c); }
        else if (f.k === 'runeFx') { rune(ctx, SX(f.x), SY(f.y), f.R * T * (0.5 + 0.5 * u), u * 4, f.c, a); }
        else if (f.k === 'shatter') { glow(ctx, f.c, a); ctx.lineWidth = 2; for (let i = 0; i < 7; i++) { const an = i * 0.9, r = T * (0.2 + u * 1.1); ctx.beginPath(); ctx.moveTo(SX(f.x) + Math.cos(an) * r * 0.4, SY(f.y) + Math.sin(an) * r * 0.4); ctx.lineTo(SX(f.x) + Math.cos(an) * r, SY(f.y) + Math.sin(an) * r); ctx.stroke(); } }
        else if (f.k === 'keys') { for (let i = -5; i <= 5; i++) { const x = SX(f.x + i * 0.4), fy = SY(f.fy), h = T * 0.9 * Math.sin(Math.min(1, u * 2 + Math.abs(i) * 0.05) * Math.PI); solid(ctx, i % 2 ? '#1a1a22' : '#f4f4f8', a); ctx.fillRect(x - T * 0.17, fy - h, T * 0.34, h); glow(ctx, f.c, 0.4 * a); ctx.strokeRect(x - T * 0.17, fy - h, T * 0.34, h); } }
        else if (f.k === 'amp') { const x = SX(f.x), y = SY(f.y), T2 = T * (1 - 0.3 * u); solid(ctx, '#1f1a24', a); ctx.fillRect(x - T2 * 0.7, y, T2 * 1.4, T2 * 1.1); solid(ctx, '#3a3340', a); dot(ctx, x, y + T2 * 0.55, T2 * 0.38); glow(ctx, f.c, a); ctx.lineWidth = 2; circ(ctx, x, y + T2 * 0.55, T2 * 0.38); }
        else if (f.k === 'vhs') { const y = SY(f.y); for (let i = 0; i < 5; i++) { glow(ctx, i % 2 ? f.c : '#ffffff', 0.6 * a); ctx.fillRect(Math.min(SX(f.x1), SX(f.x2)), y - T * 0.6 + i * T * 0.28 + (Math.random() - 0.5) * 4, Math.abs(SX(f.x2) - SX(f.x1)), 2); } }
        else if (f.k === 'ghost') { glow(ctx, f.c, 0.45 * a); ctx.fillRect(SX(f.x) - T * 0.3, SY(f.y) - T * 0.5, T * 0.6, T * 1.0); }
      } catch (e) {}
      ctx.restore();
    }
    ctx.restore();
  }

  window.__ppOwn = {
    has: ch => OWN.has(ch),
    spec,
    tick,
    draw,
    busy: () => S.ents.length > 0 || S.fx.length > 0,
    // a second fighter (Smash CPU) keeps its own specials in flight: swap them in, run, swap back
    swap(s) { const out = S; S = s || fresh(); return out; },
    reset() { S.ents.length = 0; S.fx.length = 0; },
    _sets: SETS,
  };
})();
