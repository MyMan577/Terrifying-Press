/* Obby Builder: MASQUE, the mask dancer. Three masks, three fighters, and the dance between them mends her.
 *
 * ↓ + S (ground or air) is the MASK DANCE: she spins into the next mask (Fox → Owl → Turtle → Fox), with a burst
 * that knocks back anyone close and a little healing every time. The other three moves belong to the mask she wears.
 *
 *  🦊 FOX: fast and close. FOX FLURRY (a string of rapid claw swipes), POUNCE (a leaping tackle that bounces off),
 *     FLIP KICK (a rising backflip). Quick on her feet.
 *  🦉 OWL: far and high. FEATHER DARTS (three fast darts that cross the screen), GUST (a wall of wind that shoves
 *     foes away and pushes her back), THERMAL (a column of rising air that stays: it lifts her and launches foes).
 *     A third jump, and holding jump while falling GLIDES.
 *  🐢 TURTLE: slow, tough, and the healer. SHELL BASH (a wound-up headbutt: every foe it hits mends her),
 *     SHELL SLIDE (tucked in and armored, sliding through people), GEYSER (a spout that lifts her and anyone above).
 *     Standing still on the ground slowly mends her.
 *
 * Hold S to charge any move.
 */
(function () {
  'use strict';
  const FK = window.FKit; if (!FK) return;
  const ID = 'cb_masque';
  const C_ROBE = '#3b2a5c', C_ROBE2 = '#261a3d', C_SASH = '#f2c14e', C_SKIN = '#e8c39e', C_HAIR = '#1d1a26', C_MEND = '#7dffb0';
  const FORMS = [
    { id: 'fox',    name: 'FOX',    icon: '🦊', c: '#ff7a3c', c2: '#ffd9b8', stats: { speed: 1.32, jump: 1.12, maxJumps: 2 } },
    { id: 'owl',    name: 'OWL',    icon: '🦉', c: '#6fb6ff', c2: '#e8f3ff', stats: { speed: 1.02, jump: 1.2, maxJumps: 3 } },
    { id: 'turtle', name: 'TURTLE', icon: '🐢', c: '#58d68d', c2: '#d9ffe6', stats: { speed: 0.86, jump: 0.96, maxJumps: 2 } },
  ];
  const P = { hip: 9, torso: 10.5, neck: -2.8, head: 9.4, ua: 5, fa: 5, th: 4.6, sh: 4.6 };
  const U = 31, pose = FK.pose, { ex, ey, pcx, pcy } = FK;

  // tuck = how far she is pulled into the turtle shell (0..1), wing = owl wings spread (0..1)
  const PO = {
    idle:   pose({ y: 0.5, lean: 0.05, aF: [0.5, 0.8], aB: [-0.3, 0.6], lF: [0.3, -0.15], lB: [-0.3, -0.1], tuck: 0, wing: 0 }),
    jump:   pose({ aF: [1.5, 0.5], aB: [-1.2, 0.6], lF: [0.8, -1.3], lB: [0.1, -0.7], tuck: 0, wing: 0 }),
    fall:   pose({ aF: [2.3, 0.3], aB: [-2.0, 0.4], lF: [0.4, -0.5], lB: [-0.3, -0.3], tuck: 0, wing: 0 }),
    glide:  pose({ y: -0.5, lean: 0.5, aF: [2.0, 0.1], aB: [-2.0, 0.1], lF: [-0.5, -0.2], lB: [-0.8, -0.3], tuck: 0, wing: 1 }),
    spinA:  pose({ y: 2, lean: -0.2, aF: [1.6, 0.2], aB: [-1.6, 0.2], lF: [0.7, -0.8], lB: [-0.6, -0.4], tuck: 0, wing: 0 }),
    spinB:  pose({ y: -1.5, lean: 0.1, aF: [2.9, 0.2], aB: [-2.9, 0.2], lF: [0.2, -0.3], lB: [-0.6, -1.2], tuck: 0, wing: 0.5 }),
    // fox
    clawA:  pose({ y: 1.5, lean: 0.45, aF: [1.9, 0.1], aB: [-0.9, 1.4], lF: [0.9, -0.5], lB: [-0.8, -0.2], tuck: 0, wing: 0 }),
    clawB:  pose({ y: 1.5, lean: 0.35, aF: [0.2, 1.6], aB: [1.8, 0.1], lF: [0.7, -0.4], lB: [-0.9, -0.2], tuck: 0, wing: 0 }),
    crouch: pose({ y: 5, lean: 0.55, aF: [0.9, 0.6], aB: [0.6, 0.8], lF: [1.3, -2.0], lB: [-0.4, -1.6], tuck: 0, wing: 0 }),
    pounce: pose({ y: 0, lean: 1.0, aF: [2.3, 0.1], aB: [2.0, 0.2], lF: [-0.8, -0.3], lB: [-1.2, -0.2], tuck: 0, wing: 0 }),
    kick:   pose({ y: -1, lean: -0.7, aF: [-1.8, 0.4], aB: [-2.4, 0.3], lF: [2.2, -0.1], lB: [0.6, -1.4], tuck: 0, wing: 0 }),
    // owl
    dartA:  pose({ y: 0.8, lean: -0.3, aF: [-2.2, 0.5], aB: [0.8, 0.4], lF: [0.5, -0.3], lB: [-0.4, -0.2], tuck: 0, wing: 0.6 }),
    dartB:  pose({ y: 1.2, lean: 0.4, aF: [1.7, 0.05], aB: [-1.3, 0.3], lF: [0.9, -0.4], lB: [-0.8, -0.1], tuck: 0, wing: 0.3 }),
    gustA:  pose({ y: 1, lean: -0.35, aF: [-2.4, 0.3], aB: [-2.0, 0.4], lF: [0.5, -0.4], lB: [-0.5, -0.3], tuck: 0, wing: 1 }),
    gustB:  pose({ y: 1.5, lean: 0.5, aF: [1.5, 0.1], aB: [1.2, 0.2], lF: [0.9, -0.4], lB: [-0.9, -0.2], tuck: 0, wing: 1 }),
    soar:   pose({ y: -2, lean: 0, aF: [2.7, 0.1], aB: [-2.7, 0.1], lF: [0.2, -0.2], lB: [-0.2, -0.5], tuck: 0, wing: 1 }),
    // turtle
    bashA:  pose({ y: 3.5, lean: -0.45, head: 0.4, aF: [-0.8, 1.2], aB: [-1.0, 1.0], lF: [0.8, -0.8], lB: [-0.5, -0.6], tuck: 0.35, wing: 0 }),
    bashB:  pose({ y: 2, lean: 0.75, head: -0.3, aF: [-1.2, 0.4], aB: [-1.5, 0.3], lF: [1.0, -0.3], lB: [-1.1, -0.1], tuck: 0, wing: 0 }),
    shell:  pose({ y: 5.5, lean: 1.2, aF: [0.6, 1.8], aB: [0.4, 1.8], lF: [1.4, -2.2], lB: [1.2, -2.2], tuck: 1, wing: 0 }),
    spout:  pose({ y: -1, lean: -0.15, aF: [2.2, 0.6], aB: [-2.2, 0.6], lF: [0.9, -1.5], lB: [0.6, -1.4], tuck: 0.4, wing: 0 }),
  };

  const form = S => FORMS[S.form || 0];
  function startSeq(S, kind, o) { S.seq = Object.assign({ kind, t: 0, hits: new Set(), n: 0 }, o || {}); }
  function box(p, f, x0, x1, hh) { const cx = pcx(p), cy = pcy(p); return FK.foes().filter(e => { const dx = (ex(e) - cx) * f; return dx > x0 - (e.w || 0.9) / 2 && dx < x1 + (e.w || 0.9) / 2 && Math.abs(ey(e) - cy) < hh + (e.h || 0.9) / 2; }); }

  const SEQ = {
    // ---- the mask dance
    dance(p, dt, S, q) {
      const D = 0.34;
      S.target = q.t < 0.14 ? PO.spinA : PO.spinB; S.rate = 40; S.rot = FK.ease(q.t / D) * Math.PI * 2 * q.f;
      p.vy = Math.min(p.vy, 2);
      if (q.t >= 0.14 && !q.done) {
        q.done = 1; S.form = ((S.form || 0) + 1) % FORMS.length; S.maskT = 0.4;
        const F = form(S);
        S.fx.push({ k: 'ring', x: pcx(p), y: pcy(p), R: 1.9, c: F.c, t: 0, life: 0.4 }); S.fx.push({ k: 'flash', x: pcx(p), y: pcy(p), R: 1.0, c: F.c, t: 0, life: 0.2 });
        for (const e of FK.within(pcx(p), pcy(p), 1.8 + 0.6 * q.pw)) FK.hit(S, e, 1 + q.pw, { kx: (Math.sign(ex(e) - pcx(p)) || 1) * 8, ky: -6, stun: 0.35, c: F.c, big: true });
        FK.heal(S, p, 0.45 + 0.3 * q.pw, C_MEND);
        FK.label(S, p, F.icon + ' ' + F.name + '!', F.c, true);
        FK.tone([523, 440, 330][S.form], { dur: 0.22, vol: 0.16, type: 'triangle' }); FK.tone([784, 660, 494][S.form], { dur: 0.3, vol: 0.1, delay: 0.07, type: 'sine' });
      }
      if (q.t > D) { S.seq = null; S.rot = 0; }
    },
    // ---- fox
    flurry(p, dt, S, q) {
      const f = q.f, n = 4 + Math.round(3 * q.pw), step = 0.075;
      const i = Math.floor(q.t / step);
      S.target = i % 2 ? PO.clawB : PO.clawA; S.rate = 70;
      if (!p.onGround) p.vy = Math.min(p.vy, 1.2);
      while (q.n <= i && q.n < n) {
        const last = q.n === n - 1; q.n++;
        FK.moveX(p, f * 0.22);
        S.fx.push({ k: 'claw', x: pcx(p) + f * 1.0, y: pcy(p) + (q.n % 2 ? -0.15 : 0.2), f, up: q.n % 2, t: 0, life: 0.16 });
        FK.noise({ dur: 0.05, cut: 3400, q: 3, vol: 0.12 });
        for (const e of box(p, f, -0.2, 1.7, 0.9)) FK.hit(S, e, last ? 2 + q.pw : 0.9, last ? { kx: f * 10, ky: -7, stun: 0.5, c: FORMS[0].c, big: true, stop: 0.08 } : { kx: f * 0.6, ky: -1.2, stun: 0.25, c: FORMS[0].c });
      }
      if (q.t > n * step + 0.12) S.seq = null;
    },
    pounce(p, dt, S, q) {
      const f = q.f;
      if (q.t < 0.1) { S.target = PO.crouch; S.rate = 50; p.vx = 0; return; }
      if (!q.go) { q.go = 1; p.vx = f * (13 + 4 * q.pw); p.vy = -7.5; p.onGround = false; S.carry = { vx: f * 11, t: 0.3 }; FK.whoosh(false, true); }
      S.target = PO.pounce; S.rate = 45;
      for (const e of box(p, f, -0.3, 1.2, 0.9)) {
        if (q.hits.has(e)) continue; q.hits.add(e);
        FK.hit(S, e, 3 + 2 * q.pw, { kx: f * 9, ky: -8, stun: 0.5, c: FORMS[0].c, big: true, stop: 0.08 }); FK.smack(true);
        p.vx = -f * 4; p.vy = -9; S.carry = null; S.seq = null; return;   // bounces off
      }
      if (q.t > 0.5 || (p.onGround && q.t > 0.2)) S.seq = null;
    },
    flip(p, dt, S, q) {
      const f = q.f;
      if (!q.go) { q.go = 1; p.vy = -14 - 2 * q.pw; p.onGround = false; FK.whoosh(true, true); }
      S.target = PO.kick; S.rate = 45; S.rot = -FK.ease(Math.min(1, q.t / 0.36)) * Math.PI * 2 * f;
      if (q.t < 0.3) for (const e of FK.within(pcx(p) + f * 0.3, pcy(p) - 0.3, 1.25)) { if (q.hits.has(e)) continue; q.hits.add(e); FK.hit(S, e, 3 + q.pw, { kx: f * 3, ky: -12, stun: 0.5, c: FORMS[0].c, big: true, stop: 0.07 }); FK.smack(true); }
      if (q.t > 0.38) { S.seq = null; S.rot = 0; }
    },
    // ---- owl
    darts(p, dt, S, q) {
      const f = q.f, n = 3 + Math.round(2 * q.pw);
      S.target = FK.keyed([[0, PO.dartA], [0.09, PO.dartA], [0.15, PO.dartB], [0.36, PO.dartB]], q.t); S.rate = 55;
      if (!p.onGround) p.vy = Math.min(p.vy, 1);
      while (q.t >= 0.11 + q.n * 0.045 && q.n < n) {
        const sp = (q.n - (n - 1) / 2) * 0.9; q.n++;
        S.shots.push({ k: 'dart', x: pcx(p) + f * 0.7, y: pcy(p) - 0.2, vx: f * 23, vy: sp, t: 0, life: 0.55 + 0.1 * q.pw, dmg: 1.4, pierce: q.pw > 0.3, hits: new Set() });
        FK.tone(1500 - q.n * 120, { dur: 0.07, vol: 0.07, slide: 700 });
      }
      if (q.t > 0.36) S.seq = null;
    },
    gust(p, dt, S, q) {
      const f = q.f;
      S.target = FK.keyed([[0, PO.gustA], [0.1, PO.gustA], [0.17, PO.gustB], [0.4, PO.gustB]], q.t); S.rate = 55;
      if (q.t >= 0.12 && !q.done) {
        q.done = 1;
        S.shots.push({ k: 'gust', x: pcx(p) + f * 0.8, y: pcy(p), vx: f * (11 + 3 * q.pw), vy: 0, t: 0, life: 0.6 + 0.2 * q.pw, dmg: 1, hits: new Set(), f });
        if (!FK.blocked(p.x - f * 0.2, p.y + 0.02, p.w, p.h - 0.04)) { p.vx = -f * 8; S.carry = { vx: -f * 7, t: 0.22 }; }
        FK.whoosh(false, true); FK.noise({ dur: 0.5, cut: 700, cutEnd: 2200, q: 2, vol: 0.2 });
      }
      if (q.t > 0.4) S.seq = null;
    },
    thermal(p, dt, S, q) {
      S.target = PO.soar; S.rate = 40;
      if (!q.done) {
        q.done = 1;
        const fy = FK.floorAt(pcx(p), p.y + p.h - 0.4, 8);
        if (fy != null) { if (S.thermals.length >= 2) S.thermals.shift(); S.thermals.push({ x: pcx(p), fy, h: 6.5 + 2 * q.pw, w: 1.6, t: 0, life: 5 + 2 * q.pw, self: 0.5, cool: new Map() }); }
        p.vy = -15 - 2 * q.pw; p.onGround = false; FK.whoosh(true, true); FK.tone(330, { dur: 0.4, vol: 0.12, type: 'sine', slide: 990 });
      }
      if (q.t < 0.25) for (const e of FK.within(pcx(p), pcy(p) - 0.5, 1.2)) { if (q.hits.has(e)) continue; q.hits.add(e); FK.hit(S, e, 2, { kx: 0, ky: -12, stun: 0.4, c: FORMS[1].c, big: true }); }
      if (q.t > 0.32) S.seq = null;
    },
    // ---- turtle
    bash(p, dt, S, q) {
      const f = q.f, H = 0.2 + 0.25 * q.pw;
      if (q.t < H) { const u = q.t / H; S.target = pose(Object.assign({}, PO.bashA, { x: Math.sin(q.t * 70) * 0.4 * u * q.pw })); S.rate = 22; if (!p.onGround) p.vy = Math.min(p.vy, 1); return; }
      const t = q.t - H;
      S.target = t < 0.22 ? PO.bashB : PO.idle; S.rate = 60;
      if (t < 0.12) { FK.moveX(p, f * (11 + 5 * q.pw) * dt); if (!q.snd) { q.snd = 1; FK.whoosh(false, true); } }
      if (t < 0.18) for (const e of box(p, f, -0.2, 1.4, 0.9)) {
        if (q.hits.has(e)) continue; q.hits.add(e);
        FK.hit(S, e, 4 + 2 * q.pw, { kx: f * (9 + 4 * q.pw), ky: -7, stun: 0.55, c: FORMS[2].c, big: true, stop: 0.1, shake: 7 }); FK.thud(false);
        FK.heal(S, p, 1.1 + 0.6 * q.pw, C_MEND); S.fx.push({ k: 'mend', x: pcx(p), y: pcy(p), t: 0, life: 0.6 });
      }
      if (t > 0.36) S.seq = null;
    },
    slide(p, dt, S, q) {
      const f = q.f, D = 0.5 + 0.2 * q.pw;
      S.target = PO.shell; S.rate = 45; S.rot = q.t * 22 * f; S.selfMove = true;
      p._armorT = Math.max(p._armorT || 0, 0.1);
      if (!q.snd) { q.snd = 1; FK.noise({ dur: D, cut: 500, cutEnd: 1400, q: 2, vol: 0.18 }); }
      const sp = (12 + 3 * q.pw) * (1 - 0.4 * q.t / D);
      if (!FK.moveX(p, f * sp * dt)) { q.f = -f; FK.thud(false); q.hits = new Set(); }   // bounces off walls
      p.vx = f * sp * 0.3;
      for (const e of FK.within(pcx(p), pcy(p) + 0.1, 1.0)) { if (q.hits.has(e)) continue; q.hits.add(e); FK.hit(S, e, 2 + q.pw, { kx: f * 6, ky: -8, stun: 0.45, c: FORMS[2].c, big: true }); FK.smack(false); }
      if (q.t > D) { S.seq = null; S.rot = 0; }
    },
    geyser(p, dt, S, q) {
      S.target = PO.spout; S.rate = 40;
      if (!q.done) {
        q.done = 1; p.vy = -13.5 - 2 * q.pw; p.onGround = false;
        S.fx.push({ k: 'spout', x: pcx(p), y: p.y + p.h, h: 3.2 + q.pw, t: 0, life: 0.55 });
        FK.noise({ dur: 0.5, cut: 500, cutEnd: 2600, q: 1.5, vol: 0.26 });
        for (const e of FK.foes()) if (Math.abs(ex(e) - pcx(p)) < 1.0 && ey(e) < p.y + p.h + 0.3 && ey(e) > p.y - 3.2 - q.pw) FK.hit(S, e, 3 + q.pw, { kx: 0, ky: -13, stun: 0.5, c: FORMS[2].c, big: true });
      }
      if (q.t > 0.34) S.seq = null;
    },
  };
  const KIT = { fox: ['flurry', 'pounce', 'flip'], owl: ['darts', 'gust', 'thermal'], turtle: ['bash', 'slide', 'geyser'] };
  const NAMES = { flurry: 'FOX FLURRY', pounce: 'POUNCE', flip: 'FLIP KICK', darts: 'FEATHER DARTS', gust: 'GUST', thermal: 'THERMAL', bash: 'SHELL BASH', slide: 'SHELL SLIDE', geyser: 'GEYSER' };
  function use(slot) {
    return (p, f, pw, S) => {
      const kind = KIT[form(S).id][slot];
      if (slot === 2) S.airUp = true;
      startSeq(S, kind, { f, pw });
      return NAMES[kind];
    };
  }
  const dance = (p, f, pw, S) => { startSeq(S, 'dance', { f, pw }); return 'MASK DANCE'; };

  function stepWorld(p, dt, S, k) {
    const foes = FK.foes();
    for (let i = S.shots.length - 1; i >= 0; i--) {
      const b = S.shots[i]; b.t += dt; b.x += b.vx * dt; b.y += b.vy * dt;
      let gone = b.t >= b.life || FK.blocked(b.x - 0.08, b.y - 0.08, 0.16, 0.16);
      if (!gone) for (const e of foes) {
        if (b.hits.has(e)) continue;
        const rx = b.k === 'gust' ? 0.7 : 0.25, ry = b.k === 'gust' ? 1.2 : 0.25;
        if (Math.abs(ex(e) - b.x) < rx + (e.w || 0.9) / 2 && Math.abs(ey(e) - b.y) < ry + (e.h || 0.9) / 2) {
          b.hits.add(e);
          if (b.k === 'gust') FK.hit(S, e, b.dmg, { kx: b.f * 13, ky: -4, stun: 0.4, c: FORMS[1].c });
          else { FK.hit(S, e, b.dmg, { kx: Math.sign(b.vx) * 3, ky: -2, stun: 0.25, c: FORMS[1].c }); FK.smack(false); if (!b.pierce) { gone = true; break; } }
        }
      }
      if (gone) S.shots.splice(i, 1);
    }
    for (let i = S.thermals.length - 1; i >= 0; i--) {
      const v = S.thermals[i]; v.t += dt; v.self -= dt;
      for (const [e, c] of v.cool) { if (c - dt <= 0) v.cool.delete(e); else v.cool.set(e, c - dt); }
      for (const e of foes) if (!v.cool.has(e) && Math.abs(ex(e) - v.x) < v.w * 0.6 && ey(e) < v.fy + 0.2 && ey(e) > v.fy - v.h) { v.cool.set(e, 0.9); FK.hit(S, e, 1, { kx: 0, ky: -13, stun: 0.4, c: FORMS[1].c }); }
      // riding the thermal: a steady lift for as long as you stay in it (↓ lets you sink)
      if (v.self <= 0 && !k.down && Math.abs(pcx(p) - v.x) < v.w * 0.6 && p.y + p.h > v.fy - v.h && p.y < v.fy + 0.1) {
        p.vy = Math.max(-11, (p.vy || 0) - 60 * dt); if (p.vy > -3) p.vy = -3; p.onGround = false; S.airUp = false; S.lifted = 0.2;
      }
      if (v.t > v.life) S.thermals.splice(i, 1);
    }
  }

  const MOVES = {
    ground: { neutral: { name: 'Mask Strike', cd: 0.3 }, side: { name: 'Mask Rush', cd: 0.4 }, up: { name: 'Mask Rise', cd: 0.4 }, down: { name: 'Mask Dance', cd: 0.45 } },
    air:    { neutral: { name: 'Mask Strike', cd: 0.3 }, side: { name: 'Mask Rush', cd: 0.4 }, up: { name: 'Mask Rise', cd: 0.4 }, down: { name: 'Mask Dance', cd: 0.45 } },
  };
  const FD = { windup: 0.02, active: 0.06, endlag: 0.04, root: false };
  const MFD = {}; for (const st of ['ground', 'air']) for (const d of ['neutral', 'side', 'up', 'down']) MFD[st + '_' + d] = FD;

  // the mask itself, drawn on her face (head frame, radius hr)
  function mask(ctx, id, hr, t, F) {
    ctx.fillStyle = F.c2; ctx.strokeStyle = F.c; ctx.lineWidth = hr * 0.12;
    if (id === 'fox') {
      ctx.fillStyle = F.c; ctx.beginPath(); ctx.moveTo(-hr * 0.55, -hr * 0.6); ctx.lineTo(-hr * 0.35, -hr * 1.55); ctx.lineTo(hr * 0.1, -hr * 0.75); ctx.closePath(); ctx.fill();
      ctx.beginPath(); ctx.moveTo(hr * 0.35, -hr * 0.75); ctx.lineTo(hr * 0.8, -hr * 1.5); ctx.lineTo(hr * 0.95, -hr * 0.5); ctx.closePath(); ctx.fill();
      ctx.fillStyle = F.c2; ctx.beginPath(); ctx.moveTo(-hr * 0.7, -hr * 0.55); ctx.quadraticCurveTo(hr * 0.3, -hr * 1.0, hr * 1.0, -hr * 0.45); ctx.quadraticCurveTo(hr * 1.25, hr * 0.2, hr * 1.35, hr * 0.55); ctx.quadraticCurveTo(hr * 0.5, hr * 0.75, -hr * 0.5, hr * 0.55); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#1d1a26'; ctx.beginPath(); ctx.arc(hr * 1.3, hr * 0.5, hr * 0.12, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#d6342a'; ctx.lineWidth = hr * 0.09; ctx.beginPath(); ctx.moveTo(-hr * 0.2, hr * 0.3); ctx.lineTo(hr * 0.15, hr * 0.42); ctx.moveTo(-hr * 0.25, hr * 0.1); ctx.lineTo(hr * 0.1, hr * 0.2); ctx.stroke();
      FK.eyes(ctx, hr * 0.2, -hr * 0.1, hr * 0.17, hr * 0.5, { glow: '#ffb020' });
    } else if (id === 'owl') {
      ctx.beginPath(); ctx.ellipse(hr * 0.15, 0, hr * 0.95, hr * 0.85, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.fillStyle = F.c; ctx.beginPath(); ctx.moveTo(-hr * 0.55, -hr * 0.65); ctx.lineTo(-hr * 0.75, -hr * 1.3); ctx.lineTo(-hr * 0.1, -hr * 0.8); ctx.closePath(); ctx.fill();
      ctx.beginPath(); ctx.moveTo(hr * 0.45, -hr * 0.8); ctx.lineTo(hr * 1.0, -hr * 1.3); ctx.lineTo(hr * 0.9, -hr * 0.6); ctx.closePath(); ctx.fill();
      for (const dx of [-hr * 0.12, hr * 0.5]) { ctx.strokeStyle = F.c; ctx.lineWidth = hr * 0.08; ctx.beginPath(); ctx.arc(dx, -hr * 0.05, hr * 0.33, 0, Math.PI * 2); ctx.stroke(); }
      ctx.fillStyle = '#f2a13c'; ctx.beginPath(); ctx.moveTo(hr * 0.2, hr * 0.2); ctx.lineTo(hr * 0.55, hr * 0.3); ctx.lineTo(hr * 0.25, hr * 0.62); ctx.closePath(); ctx.fill();
      FK.eyes(ctx, -hr * 0.12, -hr * 0.05, hr * 0.17, hr * 0.62, { glow: '#fff3a8' });
    } else {
      ctx.beginPath(); ctx.roundRect(-hr * 0.7, -hr * 0.75, hr * 1.75, hr * 1.4, hr * 0.5); ctx.fill(); ctx.stroke();
      ctx.strokeStyle = F.c; ctx.lineWidth = hr * 0.07; ctx.beginPath(); ctx.moveTo(-hr * 0.1, -hr * 0.75); ctx.lineTo(hr * 0.15, -hr * 0.45); ctx.lineTo(hr * 0.6, -hr * 0.45); ctx.lineTo(hr * 0.8, -hr * 0.72); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(hr * 0.5, hr * 0.38); ctx.quadraticCurveTo(hr * 0.75, hr * 0.5, hr * 0.98, hr * 0.36); ctx.stroke();
      FK.eyes(ctx, hr * 0.1, -hr * 0.05, hr * 0.15, hr * 0.55, { glow: '#b6ffd0' });
    }
  }

  FK.define({
    id: ID, plug: 'masque',
    def: { name: 'Masque', icon: '🎭', tier: 'gold', color: '#c59bff', color2: '#ffd166',
      ability: 'Mask Dancer: three masks (Fox, Owl, Turtle), each its own moves; changing masks and the Turtle heal her',
      desc: 'A dancer with three masks. ↓ + S is the Mask Dance: it changes her mask, knocks back anyone close and mends her a little. 🦊 Fox is fast and close: Fox Flurry, Pounce, Flip Kick. 🦉 Owl fights from far and high: Feather Darts, Gust, a Thermal she can ride, a third jump and a glide (hold jump). 🐢 Turtle is slow and tough: Shell Bash heals her for every foe it hits, Shell Slide is armored, Geyser lifts her, and standing still mends her.' },
    stats: { speed: 1.1, jump: 1.1, maxJumps: 2, maxDashes: 1, hp: 3 },
    statMod: S => form(S).stats,
    moves: MOVES, mfd: MFD,
    fresh: () => ({ seq: null, pose: PO.idle, target: PO.idle, rate: 18, run: 0, form: 0, rot: 0, maskT: 0, shots: [], thermals: [], airUp: false, bank: 0, healT: 0, still: 0, carry: null, lifted: 0 }),
    busy: S => !!S.seq,
    can(key, S) { if (key === 'air_up' && S.airUp) return 'Comes back when you land'; return null; },
    act: {
      ground_neutral: use(0), ground_side: use(1), ground_up: use(2), ground_down: dance,
      air_neutral: use(0), air_side: use(1), air_up: use(2), air_down: dance,
    },
    onTeleport(p, S) { S.seq = null; S.rot = 0; S.thermals.length = 0; },
    step(p, dt, S, k) {
      if (p.hitstun > 0 && S.seq) { S.seq = null; S.rot = 0; }
      S.rate = 18;
      for (const n of ['maskT', 'healT', 'lifted']) if (S[n] > 0) S[n] = Math.max(0, S[n] - dt);
      if (S.seq) { S.seq.t += dt; const fn = SEQ[S.seq.kind]; if (fn) fn(p, dt, S, S.seq); else S.seq = null; }
      stepWorld(p, dt, S, k);
      const F = form(S);
      if (!S.seq) {
        // the owl glides while jump is held on the way down
        const gliding = F.id === 'owl' && !p.onGround && k.jump && (p.vy || 0) > 0;
        if (gliding) { p.vy = Math.min(p.vy, 2.6); S.target = PO.glide; }
        else S.target = FK.locomotion(S, p, dt, PO, { tuck: 0, wing: 0 });
        if (S.carry) { S.carry.t -= dt; if (S.carry.t <= 0 || (p.onGround && S.carry.t < 0.2)) S.carry = null; else if (Math.abs(p.vx || 0) < Math.abs(S.carry.vx)) p.vx = S.carry.vx; }
      }
      // the turtle mends while she stands still
      if (F.id === 'turtle' && p.onGround && !S.seq && Math.abs(p.vx || 0) < 0.3) { S.still += dt; if (S.still > 1.2) { S.still -= 0.5; FK.heal(S, p, 0.35, C_MEND); S.fx.push({ k: 'mend', x: pcx(p), y: pcy(p), t: 0, life: 0.6 }); } }
      else S.still = 0;
      if (p.onGround && S.lifted <= 0) S.airUp = false;
      S.pose = FK.lerpPose(S.pose, S.target, 1 - Math.exp(-dt * S.rate));
    },

    // ---------------- drawing: a robed dancer whose mask, trim and extras change with the form
    drawBody(ctx, px, py, pw, ph, t, S, p) {
      const q = S ? S.pose : PO.idle, s = ph / U, cx = px + pw / 2, fy = py + ph;
      const F = FORMS[(S && S.form) || 0], rot = (S && S.rot) || 0, tuck = q.tuck || 0, wing = q.wing || 0;
      if (rot) { ctx.translate(cx, fy - ph * 0.5); ctx.rotate(rot); ctx.translate(-cx, -(fy - ph * 0.5)); }
      const K = FK.skel(P, q, cx, fy, s);
      ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      ctx.shadowBlur = 9; ctx.shadowColor = F.c;
      // owl wings: feathered sleeves that open behind her
      if (F.id === 'owl') for (const A of [K.aB, K.aF]) {
        const sh = A[0], hd = A[2], ax = hd[0] - sh[0], ay = hd[1] - sh[1], n = 5;
        for (let i = 0; i < n; i++) { const u = (i + 1) / n, bx = sh[0] + ax * u, by = sh[1] + ay * u, L = (3 + 6 * wing) * s * (0.6 + 0.4 * u);
          ctx.fillStyle = i % 2 ? F.c : F.c2; ctx.beginPath(); ctx.ellipse(bx - 1.2 * s, by + L * 0.5, 1.5 * s, L * 0.6, 0.25, 0, Math.PI * 2); ctx.fill(); }
      }
      FK.limb(ctx, K.lB, 4.6 * s, C_ROBE2, 4.2 * s);
      FK.mitt(ctx, K.lB[2][0] + 0.8 * s, K.lB[2][1] - 0.3 * s, 2.5 * s, '#15101f');
      FK.limb(ctx, K.aB, 4.4 * s, C_ROBE2, 5 * s);
      FK.mitt(ctx, K.aB[2][0], K.aB[2][1], 2.3 * s, C_SKIN);
      // fox tail
      if (F.id === 'fox') { const hx = K.hip[0], hy = K.hip[1], w = Math.sin(t * 7) * 2 * s;
        ctx.strokeStyle = F.c; ctx.lineWidth = 4.6 * s; ctx.beginPath(); ctx.moveTo(hx - 3 * s, hy - 1 * s); ctx.quadraticCurveTo(hx - 11 * s, hy - 2 * s + w, hx - 12 * s, hy - 9 * s + w); ctx.stroke();
        ctx.strokeStyle = F.c2; ctx.lineWidth = 3.4 * s; ctx.beginPath(); ctx.moveTo(hx - 12 * s, hy - 7.5 * s + w); ctx.lineTo(hx - 12 * s, hy - 9.5 * s + w); ctx.stroke(); }
      // robe with a sash in the mask's colour
      ctx.save(); ctx.translate(K.hip[0], K.hip[1]); ctx.rotate(q.lean);
      const Lt = P.torso * s, W = 14.5 * s, swy = Math.sin(t * 5) * s * 0.7;
      const g = ctx.createLinearGradient(-W / 2, 0, W / 2, 0); g.addColorStop(0, C_ROBE2); g.addColorStop(0.6, C_ROBE); g.addColorStop(1, '#5a4390');
      ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(-W * 0.4, -Lt); ctx.lineTo(W * 0.4, -Lt); ctx.quadraticCurveTo(W * 0.56, -Lt * 0.3, W * 0.62 + swy, 4 * s); ctx.lineTo(-W * 0.62 + swy, 4 * s); ctx.quadraticCurveTo(-W * 0.56, -Lt * 0.3, -W * 0.4, -Lt); ctx.fill();
      ctx.shadowBlur = 0;
      ctx.fillStyle = F.c; ctx.fillRect(-W * 0.5, -Lt * 0.42, W, 2 * s);
      ctx.fillStyle = C_SASH; ctx.beginPath(); ctx.arc(W * 0.12, -Lt * 0.33, 1.6 * s, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = F.c; ctx.lineWidth = 1.2 * s; ctx.beginPath(); ctx.moveTo(-W * 0.6 + swy, 3.4 * s); ctx.lineTo(W * 0.6 + swy, 3.4 * s); ctx.stroke();
      // turtle shell on her back, growing as she tucks in
      if (F.id === 'turtle') { const R = (6.5 + 4.5 * tuck) * s; ctx.translate(-W * (0.3 - 0.3 * tuck), -Lt * 0.5);
        ctx.fillStyle = '#2f8f58'; ctx.beginPath(); ctx.ellipse(0, 0, R * 0.8, R, 0, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = '#1d5c38'; ctx.lineWidth = 1.1 * s; ctx.stroke(); ctx.beginPath(); ctx.moveTo(-R * 0.8, 0); ctx.lineTo(R * 0.8, 0); ctx.moveTo(0, -R); ctx.lineTo(0, R); ctx.stroke();
        ctx.fillStyle = F.c; ctx.globalAlpha = 0.5; ctx.beginPath(); ctx.ellipse(R * 0.2, -R * 0.35, R * 0.25, R * 0.3, 0, 0, Math.PI * 2); ctx.fill(); ctx.globalAlpha = 1; }
      ctx.restore();
      ctx.shadowBlur = 0;
      if (tuck < 0.8) {
        FK.limb(ctx, K.lF, 4.8 * s, C_ROBE, 4.4 * s);
        FK.mitt(ctx, K.lF[2][0] + 0.8 * s, K.lF[2][1] - 0.3 * s, 2.7 * s, '#1d1528');
        // head: dark hair in a bun, and the mask over her face (it flashes as it changes)
        ctx.save(); ctx.translate(K.head[0], K.head[1]); ctx.rotate(q.lean + q.head);
        const hr = K.hr * (1 - 0.3 * tuck);
        ctx.fillStyle = C_HAIR; ctx.beginPath(); ctx.arc(-hr * 0.15, -hr * 0.1, hr * 1.05, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(-hr * 0.75, -hr * 0.95, hr * 0.42, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = C_SASH; ctx.fillRect(-hr * 0.95, -hr * 0.78, hr * 0.5, hr * 0.14);
        ctx.fillStyle = C_SKIN; ctx.beginPath(); ctx.arc(hr * 0.08, hr * 0.08, hr * 0.88, 0, Math.PI * 2); ctx.fill();
        mask(ctx, F.id, hr * 0.82, t, F);
        const mt = S ? S.maskT || 0 : 0;
        if (mt > 0) { ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = Math.min(1, mt * 2.5); ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(hr * 0.15, 0, hr * 1.2, 0, Math.PI * 2); ctx.fill(); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over'; }
        ctx.restore();
        FK.limb(ctx, K.aF, 4.6 * s, C_ROBE, 5.2 * s);
        FK.mitt(ctx, K.aF[2][0], K.aF[2][1], 2.5 * s, C_SKIN);
        // fox claws on the leading hand
        if (F.id === 'fox') { const hx = K.aF[2][0], hy = K.aF[2][1], an = q.aF[0] + q.aF[1]; ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 0.9 * s;
          for (let i = -1; i <= 1; i++) { const a2 = an + i * 0.35; ctx.beginPath(); ctx.moveTo(hx + Math.sin(a2) * 2 * s, hy + Math.cos(a2) * 2 * s); ctx.lineTo(hx + Math.sin(a2) * 4.6 * s, hy + Math.cos(a2) * 4.6 * s); ctx.stroke(); } }
      }
    },
    drawWorld(ctx, V, S) {
      const p = V.p, T = V.T, F = form(S);
      for (const v of S.thermals) {
        const x = V.SX(v.x), y0 = V.SY(v.fy), h = v.h * T, w = v.w * T, a = Math.min(1, v.t / 0.2) * Math.min(1, (v.life - v.t) / 0.7);
        const g = ctx.createLinearGradient(0, y0, 0, y0 - h); g.addColorStop(0, 'rgba(111,182,255,0.32)'); g.addColorStop(1, 'rgba(111,182,255,0)');
        ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = a; ctx.fillStyle = g; ctx.fillRect(x - w / 2, y0 - h, w, h);
        for (let i = 0; i < 6; i++) { const u = ((V.now * 0.9 + i / 6) % 1), yy = y0 - u * h, sx = Math.sin(u * 9 + i) * w * 0.3;
          ctx.beginPath(); ctx.moveTo(x + sx - w * 0.18, yy + T * 0.2); ctx.lineTo(x + sx, yy); ctx.lineTo(x + sx + w * 0.18, yy + T * 0.2); FK.glow(ctx, '#e8f3ff', a * (1 - u) * 0.9); ctx.lineWidth = 2.5; ctx.stroke(); }
        ctx.beginPath(); ctx.ellipse(x, y0, w * 0.55, T * 0.12, 0, 0, Math.PI * 2); FK.glow(ctx, FORMS[1].c, a * 0.6); ctx.fill();
      }
      for (const b of S.shots) {
        const x = V.SX(b.x), y = V.SY(b.y), d = Math.sign(b.vx) || 1;
        if (b.k === 'dart') { const pts = []; for (let i = 0; i <= 6; i++) pts.push([x - d * i * T * 0.22, y - b.vy * i * 0.01 * T]); FK.taper(ctx, pts, T * 0.1, b.pierce ? '#ffffff' : FORMS[1].c, 0.9);
          FK.solid(ctx, '#ffffff', 1); ctx.beginPath(); ctx.moveTo(x + d * T * 0.22, y); ctx.lineTo(x - d * T * 0.1, y - T * 0.07); ctx.lineTo(x - d * T * 0.1, y + T * 0.07); ctx.closePath(); ctx.fill(); }
        else { const a = Math.min(1, (b.life - b.t) / 0.25); for (let i = 0; i < 3; i++) FK.crescent(ctx, x - d * i * T * 0.45, y, T * (1.1 - i * 0.15), d > 0 ? -1.0 : Math.PI - 1.0, d > 0 ? 1.0 : Math.PI + 1.0, T * 0.22, i ? FORMS[1].c : '#ffffff', a * (0.75 - i * 0.2)); }
      }
      if (S.healT > 0) { ctx.beginPath(); ctx.arc(V.SX(pcx(p)), V.SY(pcy(p)), T * (0.8 + 0.1 * Math.sin(V.now * 24)), 0, Math.PI * 2); FK.glow(ctx, C_MEND, Math.min(0.6, S.healT * 1.2)); ctx.lineWidth = 3; ctx.stroke(); }
      // which mask comes next, as three small pips over her head
      { const x = V.SX(pcx(p)), y = V.SY(p.y) - T * 0.42;
        FORMS.forEach((G, i) => { ctx.beginPath(); ctx.arc(x + (i - 1) * T * 0.22, y, T * (i === S.form ? 0.085 : 0.05), 0, Math.PI * 2); FK.solid(ctx, G.c, i === S.form ? 1 : 0.45); ctx.fill(); }); }
      // the turtle's standing-still mend: a slow ring filling at her feet
      if (F.id === 'turtle' && S.still > 0.2) { ctx.beginPath(); ctx.arc(V.SX(pcx(p)), V.SY(p.y + p.h), T * 0.6, Math.PI, Math.PI * (1 + Math.min(1, S.still / 1.2))); FK.glow(ctx, C_MEND, 0.7); ctx.lineWidth = 3; ctx.stroke(); }
    },
    drawFx(ctx, V, f, u, a) {
      const T = V.T;
      if (f.k === 'claw') { const x = V.SX(f.x), y = V.SY(f.y); for (let i = -1; i <= 1; i++) FK.crescent(ctx, x - f.f * T * 0.5, y + i * T * 0.2, T * (0.9 + u * 0.3), f.f > 0 ? (f.up ? -1.1 : -0.4) : Math.PI - (f.up ? 0.4 : 1.1), f.f > 0 ? (f.up ? 0.4 : 1.1) : Math.PI + (f.up ? 1.1 : 0.4), T * 0.12, i ? FORMS[0].c : '#ffffff', a); return true; }
      if (f.k === 'mend') { const x = V.SX(f.x), y = V.SY(f.y); for (let i = 0; i < 5; i++) { const xx = x + (i - 2) * T * 0.22, yy = y + T * 0.4 - u * T * (0.8 + (i % 2) * 0.4); FK.glow(ctx, C_MEND, a); ctx.fillRect(xx - 1.5, yy - 5, 3, 10); ctx.fillRect(xx - 5, yy - 1.5, 10, 3); } return true; }
      if (f.k === 'spout') { const x = V.SX(f.x), y0 = V.SY(f.y), h = f.h * T * Math.min(1, u * 3) * (1 - Math.max(0, u - 0.6) * 2.5), w = T * 0.9;
        const g = ctx.createLinearGradient(0, y0, 0, y0 - h); g.addColorStop(0, 'rgba(88,214,141,0.75)'); g.addColorStop(1, 'rgba(217,255,230,0.15)');
        ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = Math.min(1, a * 1.6); ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(x - w * 0.5, y0); ctx.quadraticCurveTo(x - w * 0.2, y0 - h * 0.5, x - w * 0.45, y0 - h); ctx.lineTo(x + w * 0.45, y0 - h); ctx.quadraticCurveTo(x + w * 0.2, y0 - h * 0.5, x + w * 0.5, y0); ctx.closePath(); ctx.fill();
        for (let i = 0; i < 6; i++) { ctx.beginPath(); ctx.arc(x + Math.sin(i * 2.3) * w * 0.6 * u, y0 - h - Math.sin(u * Math.PI) * T * (0.3 + (i % 3) * 0.2), T * 0.07, 0, Math.PI * 2); FK.glow(ctx, '#d9ffe6', a); ctx.fill(); }
        return true; }
      return false;
    },
    // Smash CPU: pick the mask for the distance, and heal up as the turtle when hurt
    ai(I) {
      const S = I.S || {};
      if (S.seq) return null;
      const id = FORMS[S.form || 0].id, want = I.adx > 5 ? 'owl' : I.adx < 2.2 ? (I.r < 0.5 ? 'fox' : 'turtle') : id;
      if (want !== id && I.r < 0.12) return { type: 'tap', v: 'down' };
      if (I.dy < -1.2 && I.adx < 2 && !S.airUp) return { type: 'tap', v: 'up' };
      if (id === 'owl') { if (I.adx < 12 && Math.abs(I.dy) < 1.2) return I.adx < 3 ? { type: 'tap', v: 'side' } : { type: 'tap', v: '' }; return null; }
      if (id === 'fox') { if (I.adx < 1.9 && Math.abs(I.dy) < 1.2) return { type: 'tap', v: '' }; if (I.adx < 5 && Math.abs(I.dy) < 1.5) return { type: 'tap', v: 'side' }; return null; }
      if (I.adx < 1.8 && Math.abs(I.dy) < 1.2) return I.killy ? { type: 'charge', v: '', hold: 0.5 } : { type: 'tap', v: '' };
      if (I.adx < 5 && Math.abs(I.dy) < 1) return { type: 'tap', v: 'side' };
      return null;
    },
  });
})();
