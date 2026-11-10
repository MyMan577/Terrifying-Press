/* Obby Builder: GALE, a wind runner built for Smash.
 *
 * MOVEMENT (what makes Gale fun to move with):
 *  - TAILWIND: run in one direction and the wind builds behind you (up to +40% speed). Turning or
 *    stopping lets it die down. Streaks behind you show how much you have.
 *  - GLIDE: hold jump while falling to ride the wind: you fall slowly and keep your speed.
 *  - WALL RUN: with a strong Tailwind, run into a wall in the air and you sprint up it for a moment.
 *  - Crosswind Kick refreshes when it hits, and Dive Kick pogos off whoever it lands on, so you can
 *    chain hits through the air.
 *
 * 8 MOVES (S / ⚔️ plus a direction, on the ground or in the air):
 *  Ground: neutral GALE PALM (stronger with Tailwind), side CYCLONE DASH, up UPDRAFT (launcher),
 *          down DOWNBURST (sweeps both sides).
 *  Air:    neutral WHIRL (all round), side CROSSWIND KICK (air dash, refreshes on hit),
 *          up JETSTREAM (recovery, once per jump), down DIVE KICK (diagonal spike, pogo).
 *  Holding S lets loose the specials (CYCLONE RUSH / UPDRAFT GEYSER / TWISTER), set in index.html.
 *
 * Works for a second fighter (Smash CPU) through window._fighterPlugins, like the Mixtape.
 */
(function () {
  'use strict';
  const ID = 'cb_gale';
  const DEF = {
    id: ID, name: 'Gale', icon: '🪁', tier: 'gold',
    ability: 'Wind Runner: Tailwind, Glide, Wall Run + 8 moves (S / ⚔️ + a direction)',
    desc: 'A wind runner with a kite-tail scarf. Run to build TAILWIND (faster, harder Gale Palm), hold jump while falling to GLIDE, and with a strong Tailwind run up walls. 8 moves on S / ⚔️ plus a direction: Gale Palm, Cyclone Dash, Updraft, Downburst on the ground; Whirl, Crosswind Kick (refreshes on hit), Jetstream and Dive Kick (spikes and pogos) in the air.',
    color: '#5ee6c8'
  };
  const STATS = { speed: 1.15, jump: 1.2, maxJumps: 2, maxDashes: 1, hp: 3 };
  const C_MINT = '#5ee6c8', C_SKY = '#8fd3ff', C_WHITE = '#f2fffb', C_KITE = '#ff7a59', C_DARK = '#173b3a';

  // Gale is free: it joins your roster the first time the game loads
  try {
    const owned = JSON.parse(localStorage.getItem('obby_cbox_owned') || '[]');
    if (!owned.includes(ID)) { owned.push(ID); localStorage.setItem('obby_cbox_owned', JSON.stringify(owned)); }
  } catch (e) {}
  function isOwned() {
    try { return JSON.parse(localStorage.getItem('obby_cbox_owned') || '[]').includes(ID); } catch (e) { return false; }
  }
  function register() {
    if (window.CBOX_CHARS_DEF && !window.CBOX_CHARS_DEF.find(c => c.id === ID)) window.CBOX_CHARS_DEF.push(DEF);
    if (window.cboxOwnedChars) window.cboxOwnedChars.add(ID);
    window._gtCharStatCache = window._gtCharStatCache || {};
    window._gtCharStatCache[ID] = stats();
  }
  if (window.UNIVERSAL_PUNCH_EXCLUDED_CHARS) window.UNIVERSAL_PUNCH_EXCLUDED_CHARS.add(ID);

  const MOVES = {
    ground: { neutral: { name: 'Gale Palm', cd: 0.4 }, side: { name: 'Cyclone Dash', cd: 0.75 }, up: { name: 'Updraft', cd: 0.8 }, down: { name: 'Downburst', cd: 1.0 } },
    air:    { neutral: { name: 'Whirl', cd: 0.45 }, side: { name: 'Crosswind Kick', cd: 0.55 }, up: { name: 'Jetstream', cd: 0.6 }, down: { name: 'Dive Kick', cd: 0.7 } },
  };
  // strike-engine frame data: light, fast moves
  const MFD = {
    ground_neutral: { windup: 0.05, active: 0.10, endlag: 0.10, sweetDmg: 1, sweetKb: 1.4 },
    ground_side:    { windup: 0.06, sweet: 0.05, active: 0.22, endlag: 0.16, sweetDmg: 1, sweetKb: 1.3 },
    ground_up:      { windup: 0.09, sweet: 0.06, active: 0.12, endlag: 0.20, sweetDmg: 1, sweetKb: 1.4, sweetStop: 0.1, sweetShake: 9 },
    ground_down:    { windup: 0.10, active: 0.12, endlag: 0.22, sweetDmg: 1, sweetKb: 1.2 },
    air_neutral:    { windup: 0.04, active: 0.14, endlag: 0.10, root: false, sweetDmg: 1, sweetKb: 1.3 },
    air_side:       { windup: 0.03, sweet: 0.0, active: 0.2, endlag: 0.10, root: false },
    air_up:         { windup: 0.03, sweet: 0.0, active: 0.2, endlag: 0.10, root: false, hang: false },
    air_down:       { windup: 0.06, sweet: 0.0, active: 0.5, endlag: 0.14, root: false, hang: false, stop: 0.06, shake: 5 },
  };
  const TW_BUILD = 1.1, TW_DECAY = 1.6, GLIDE_FALL = 3.0, WALLRUN_T = 0.45;

  // ---- per-fighter state (swapped for the Smash CPU) ----
  let active = false, atkCD = 0, tw = 0, twSaid = 0, airUpUsed = false, airSideUsed = false, gliding = false, wallRunT = 0;
  let lastPX = null, lastPY = null, prevJump = false, lastDir = 1, cxkick = null, dive = null, cdash = null, carry = null, spinT = 0;
  const fx = [];

  // ---- sound: airy whooshes (its own AudioContext) ----
  let AC = null, out = null, noiseBuf = null;
  function ac() {
    if (AC) { if (AC.state === 'suspended') { try { AC.resume(); } catch (e) {} } return AC; }
    try {
      const Ctor = window.AudioContext || window.webkitAudioContext; if (!Ctor) return null;
      AC = new Ctor(); out = AC.createGain(); out.gain.value = 0.22;
      const comp = AC.createDynamicsCompressor(); out.connect(comp); comp.connect(AC.destination);
    } catch (e) { AC = null; }
    return AC;
  }
  function tone(freq, o) {
    const a = ac(); if (!a) return; o = o || {};
    const t = a.currentTime + (o.delay || 0), dur = o.dur || 0.15, v = o.vol == null ? 0.3 : o.vol;
    const osc = a.createOscillator(), g = a.createGain();
    osc.type = o.type || 'triangle';
    osc.frequency.setValueAtTime(freq, t);
    if (o.slide) osc.frequency.exponentialRampToValueAtTime(Math.max(20, o.slide), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(v, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g); g.connect(out); osc.start(t); osc.stop(t + dur + 0.05);
  }
  function noise(o) {
    const a = ac(); if (!a) return; o = o || {};
    if (!noiseBuf) {
      noiseBuf = a.createBuffer(1, a.sampleRate, a.sampleRate);
      const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    const t = a.currentTime + (o.delay || 0), dur = o.dur || 0.2, v = o.vol == null ? 0.25 : o.vol;
    const src = a.createBufferSource(); src.buffer = noiseBuf; src.loop = true;
    const fl = a.createBiquadFilter(); fl.type = 'bandpass'; fl.Q.value = o.q || 1.5;
    fl.frequency.setValueAtTime(o.cut || 1500, t);
    if (o.cutEnd) fl.frequency.exponentialRampToValueAtTime(o.cutEnd, t + dur);
    const g = a.createGain(); g.gain.setValueAtTime(v, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(fl); fl.connect(g); g.connect(out); src.start(t); src.stop(t + dur + 0.05);
  }
  function whoosh(up, big) { noise({ dur: big ? 0.3 : 0.18, cut: up ? 500 : 3000, cutEnd: up ? 3200 : 500, q: 3, vol: big ? 0.24 : 0.16 }); }
  function smack() { noise({ dur: 0.05, cut: 2600, q: 1, vol: 0.22 }); tone(520, { dur: 0.07, slide: 260, vol: 0.14 }); }

  // ---- helpers ----
  const BLOCK = new Set(['solid', 'ice', 'crumble', 'mover', 'half']);
  function blocked(x, y, w, h) {
    const wd = window._gameWorld; if (!wd || !wd.tiles) return false;
    for (let tx = Math.floor(x); tx <= Math.floor(x + w - 1e-3); tx++)
      for (let ty = Math.floor(y); ty <= Math.floor(y + h - 1e-3); ty++) {
        const tl = wd.tiles.get(tx + ',' + ty);
        if (tl && BLOCK.has(tl.type)) return true;
      }
    return false;
  }
  function ex(e) { return e.x + (e.w || 0.9) / 2; }
  function ey(e) { return e.y + (e.h || 0.9) / 2; }
  function foes() { return (window._gameEnemies || []).filter(e => e && !e.dead); }
  function within(x, y, r) { return foes().filter(e => { const dx = ex(e) - x, dy = ey(e) - y; return dx * dx + dy * dy <= r * r; }); }
  function msg(s) { if (window._setMessage) window._setMessage(s); }
  function shake(n) { if (window._getScreenShake && window._setScreenShake) window._setScreenShake(Math.max(window._getScreenShake() || 0, n)); }
  function pcx(p) { return p.x + p.w / 2; }
  function pcy(p) { return p.y + p.h / 2; }
  function inSmash() { return !!(window.__smash && window.__smash.active); }
  function stats() { return Object.assign({}, STATS, { speed: STATS.speed + 0.4 * tw }); }
  let statKey = -1;
  function syncStats() {
    const k = Math.round(tw * 20);
    if (k === statKey) return; statKey = k;
    if (window._gtCharStatCache) window._gtCharStatCache[ID] = stats();
  }
  function hit(e, dmg, o) {
    o = o || {};
    e.hp = Math.max(0, (e.hp || 1) - Math.max(1, Math.round(dmg)));
    e.hitFlash = 0.5;
    if (o.stun) e.stunTimer = Math.max(e.stunTimer || 0, o.stun);
    if (!e._noKnockback) { if (o.kx != null) e.vx = o.kx; if (o.ky != null) e.vy = o.ky; }
    fx.push({ k: 'hit', x: ex(e), y: ey(e), t: 0, life: 0.3, c: o.c || C_MINT });
    if (e.hp <= 0 && !e.dead && window._killEnemy) window._killEnemy(e);
  }
  function keyDirs() {
    const keys = window._gameKeys || new Set(), mk = window.mobileKeys || {};
    return {
      up: keys.has('arrowup') || keys.has('w') || !!mk.up,
      down: keys.has('arrowdown') || !!mk.down,
      right: keys.has('arrowright') || keys.has('d') || !!mk.right,
      left: keys.has('arrowleft') || keys.has('a') || !!mk.left,
      jump: keys.has(' ') || keys.has('w') || keys.has('arrowup') || !!mk.jump,
    };
  }
  function facing(p, k) { return k.right ? 1 : k.left ? -1 : ((p.dashDir || p.lastMoveDir || 1) >= 0 ? 1 : -1); }
  function resetKit() {
    fx.length = 0; cxkick = dive = cdash = carry = null;
    atkCD = 0; airUpUsed = airSideUsed = false; gliding = false; wallRunT = 0; spinT = 0; tw = 0;
    lastPX = lastPY = null;
  }

  // ---- the 8 moves ----
  const ACT = {
    // Gale Palm: a blast of wind straight ahead; the more Tailwind, the harder it shoves
    ground_neutral(p, f) {
      const x = pcx(p), y = pcy(p), k = 1 + 0.8 * tw;
      for (const e of foes()) { const al = (ex(e) - x) * f; if (al > -0.2 && al < 2.0 + 0.6 * tw && Math.abs(ey(e) - y) < 0.9) hit(e, 2 + (tw > 0.7 ? 1 : 0), { kx: f * 7 * k, ky: -4 * k, stun: 0.35 }); }
      fx.push({ k: 'palm', x, y, f, R: 2.0 + 0.6 * tw, t: 0, life: 0.28 });
      whoosh(false); smack();
    },
    // Cyclone Dash: spin forward through everything and come out of it at full Tailwind
    ground_side(p, f) {
      cdash = { t: 0, dur: 0.22, f, speed: 15 + 6 * tw, hitSet: new Set(), x0: pcx(p), y: pcy(p) };
      p.dashInvuln = Math.max(p.dashInvuln || 0, 0.25);
      whoosh(false, true);
    },
    // Updraft: a column of wind lifts foes overhead; you get a small hop
    ground_up(p, f) {
      const x = pcx(p) + f * 0.3;
      for (const e of foes()) if (Math.abs(ex(e) - x) < 1.1 && ey(e) < p.y + p.h && ey(e) > p.y - 2.6) hit(e, 3, { ky: -13, kx: f * 1.5, stun: 0.5 });
      p.vy = Math.min(p.vy, -8); p.onGround = false;
      fx.push({ k: 'column', x, y: p.y + p.h, t: 0, life: 0.45 });
      whoosh(true, true);
    },
    // Downburst: a gust slams down and sweeps out both ways, popping foes up
    ground_down(p) {
      const x = pcx(p), fy = p.y + p.h;
      for (const e of foes()) if (Math.abs(ex(e) - x) < 2.5 && Math.abs(ey(e) - (fy - 0.5)) < 1.1) hit(e, 2, { kx: (ex(e) >= x ? 1 : -1) * 5, ky: -7, stun: 0.5, c: C_SKY });
      fx.push({ k: 'sweep', x, y: fy, t: 0, life: 0.45 });
      noise({ dur: 0.3, cut: 2500, cutEnd: 400, q: 2, vol: 0.22 }); shake(3);
    },
    // Whirl: a spinning ring of wind all around you; you hang in the air a moment
    air_neutral(p) {
      const x = pcx(p), y = pcy(p);
      for (const e of within(x, y, 1.7)) hit(e, 2, { kx: (ex(e) >= x ? 1 : -1) * 6, ky: -5, stun: 0.4 });
      p.vy = Math.min(p.vy, 1);
      fx.push({ k: 'whirl', x, y, t: 0, life: 0.3 }); spinT = 0.3;
      whoosh(false);
    },
    // Crosswind Kick: an air dash kick; once per jump, but it comes back when it connects
    air_side(p, f) {
      airSideUsed = true;
      cxkick = { t: 0, dur: 0.2, f, hitSet: new Set(), x0: pcx(p), y: pcy(p), landed: false };
      whoosh(false, true);
    },
    // Jetstream: a jet of wind carries you straight up and hits whatever is above (once per jump)
    air_up(p) {
      airUpUsed = true;
      p.vy = Math.min(p.vy, -14);
      for (const e of within(pcx(p), pcy(p) - 0.9, 1.3)) hit(e, 2, { ky: -10, stun: 0.4 });
      fx.push({ k: 'jet', x: pcx(p), y: p.y + p.h, t: 0, life: 0.45 });
      whoosh(true, true);
    },
    // Dive Kick: a steep diagonal kick that spikes, and you pogo off whoever it lands on
    air_down(p, f) {
      dive = { t: 0, f, hitSet: new Set() };
      tone(900, { dur: 0.12, slide: 300, vol: 0.12 });
    },
  };

  const _prevSlash = window.performSlash;
  window.performSlash = function () {
    if (window.selectedCharacter !== ID) { if (_prevSlash) return _prevSlash.apply(this, arguments); return; }
    const p = window._gamePlayer;
    if (!p || atkCD > 0) return;
    const pick = () => {
      const q = window._gamePlayer; if (!q || window.selectedCharacter !== ID) return null;
      const k = keyDirs();
      const stance = q.onGround ? 'ground' : 'air';
      const dir = (k.down && !k.up) ? 'down' : (k.up && !k.down) ? 'up' : (k.left || k.right) ? 'side' : 'neutral';
      const mv = MOVES[stance][dir];
      if (stance === 'air' && dir === 'up' && airUpUsed) { msg('🪁 Jetstream is used up until you land'); return null; }
      if (stance === 'air' && dir === 'side' && airSideUsed) { msg('🪁 Crosswind Kick comes back when you land or land a hit'); return null; }
      return { key: stance + '_' + dir, mv, f: facing(q, k) };
    };
    const fire = sel => {
      const q = window._gamePlayer; if (!q) return;
      atkCD = sel.mv.cd;
      ACT[sel.key](q, sel.f);
      msg('🪁 ' + sel.mv.name.toUpperCase() + '!');
    };
    if (window.PPStrike) {
      window.PPStrike.press(() => { const sel = pick(); return sel && { fd: MFD[sel.key], dir: sel.f, color: C_MINT, aim: sel.key.split('_')[1], fire: () => fire(sel) }; }, true);
      return;
    }
    const sel = pick(); if (sel) fire(sel);
  };

  // ---- per-frame update (runs after the game has moved the player) ----
  function step(dt) {
    const playing = window.selectedCharacter === ID && (!window._gameMode || window._gameMode() === 'play');
    if (!playing) { if (active) resetKit(); active = false; return; }
    const p = window._gamePlayer; if (!p) return;
    if (!active) { resetKit(); syncStats(); }
    active = true;
    const k = keyDirs(), enemies = foes();

    // respawned or teleported (or knocked far in Smash): drop moves in progress
    if (lastPX != null && (Math.abs(p.x - lastPX) > 4 || Math.abs(p.y - lastPY) > 4)) { cxkick = dive = cdash = carry = null; tw = 0; }

    if (atkCD > 0) atkCD = Math.max(0, atkCD - dt);
    if (spinT > 0) spinT -= dt;
    if (p.onGround) { airUpUsed = false; airSideUsed = false; wallRunT = 0; }

    // TAILWIND: builds while you run one way, fades when you stop or turn
    const inX = (k.right ? 1 : 0) - (k.left ? 1 : 0);
    if (inX) { if (inX !== lastDir) { tw *= 0.35; lastDir = inX; } }
    const before = tw;
    if (p.onGround) {
      if (inX && Math.abs(p.vx || 0) > 3 && Math.sign(p.vx) === inX) tw = Math.min(1, tw + dt / TW_BUILD);
      else tw = Math.max(0, tw - dt * TW_DECAY);
    } else if (!inX) tw = Math.max(0, tw - dt * 0.3);
    if (before < 1 && tw >= 1 && twSaid <= 0) { twSaid = 3; msg('🪁 FULL TAILWIND! Run up walls, hit harder'); tone(880, { dur: 0.12, vol: 0.12 }); tone(1320, { dur: 0.15, vol: 0.12, delay: 0.06 }); }
    if (twSaid > 0) twSaid -= dt;
    syncStats();

    // GLIDE: hold jump while falling
    const busy = cxkick || dive || cdash;
    const wasGliding = gliding;
    gliding = !p.onGround && !busy && k.jump && (p.vy || 0) > 0 && !(p.hitstun > 0);
    if (gliding) {
      p.vy = Math.min(p.vy, GLIDE_FALL);
      const want = inX * (7 + 4 * tw);
      if (inX && Math.abs(p.vx || 0) < Math.abs(want)) p.vx = (p.vx || 0) + (want - (p.vx || 0)) * Math.min(1, dt * 8);
      if (!wasGliding) whoosh(true);
      if (Math.random() < dt * 20) fx.push({ k: 'puff', x: pcx(p) - (p.vx >= 0 ? 0.4 : -0.4), y: p.y + p.h * 0.3, t: 0, life: 0.4 });
    }

    // WALL RUN: with a strong Tailwind, run straight up a wall
    if (!p.onGround && !busy && tw > 0.5 && inX && wallRunT < WALLRUN_T) {
      const touching = blocked(inX > 0 ? p.x + p.w + 0.02 : p.x - 0.08, p.y + 0.1, 0.06, p.h - 0.2);
      if (touching && !blocked(p.x, p.y - 0.3, p.w, 0.3)) {
        if (wallRunT === 0) { msg('🪁 WALL RUN!'); whoosh(true); }
        wallRunT += dt;
        p.vy = -9.5;
        if (Math.random() < dt * 25) fx.push({ k: 'puff', x: inX > 0 ? p.x + p.w : p.x, y: p.y + p.h, t: 0, life: 0.35 });
      }
    }

    // a carried speed burst (after Cyclone Dash / Crosswind Kick) the game's friction would eat at once
    if (carry) {
      carry.t -= dt;
      const s = Math.sign(carry.vx);
      carry.vx -= s * 14 * dt;
      if (carry.t <= 0 || Math.sign(carry.vx) !== s) carry = null;
      else if (Math.abs(p.vx || 0) < Math.abs(carry.vx) && !(inX && inX !== s)) p.vx = carry.vx;
    }

    // Cyclone Dash
    if (cdash) {
      const prevT = cdash.t; cdash.t = Math.min(cdash.dur, cdash.t + dt);
      const stp = cdash.f * cdash.speed * (cdash.t - prevT);
      if (!blocked(p.x + stp, p.y + 0.02, p.w, p.h - 0.04)) p.x += stp; else cdash.t = cdash.dur;
      p.vy = Math.min(p.vy, 0.5);
      p.dashInvuln = Math.max(p.dashInvuln || 0, 0.1);
      for (const e of enemies) {
        if (cdash.hitSet.has(e)) continue;
        if (ex(e) > p.x - 0.4 && ex(e) < p.x + p.w + 0.4 && ey(e) > p.y - 0.4 && ey(e) < p.y + p.h + 0.4) {
          cdash.hitSet.add(e); hit(e, 3, { kx: cdash.f * 6, ky: -7, stun: 0.5 }); smack();
        }
      }
      if (cdash.t >= cdash.dur) {
        fx.push({ k: 'trail', x0: cdash.x0, x1: pcx(p), y: cdash.y, t: 0, life: 0.35 });
        tw = 1; lastDir = cdash.f; carry = { vx: cdash.f * 11, t: 0.5 }; cdash = null;
      }
    }

    // Crosswind Kick
    if (cxkick) {
      const c = cxkick, prevT = c.t; c.t = Math.min(c.dur, c.t + dt);
      const stp = c.f * (17 + 4 * tw) * (c.t - prevT);
      if (!blocked(p.x + stp, p.y + 0.02, p.w, p.h - 0.04)) p.x += stp; else c.t = c.dur;
      p.vy = 0;
      for (const e of enemies) {
        if (c.hitSet.has(e)) continue;
        if (ex(e) > p.x - 0.45 && ex(e) < p.x + p.w + 0.45 && ey(e) > p.y - 0.4 && ey(e) < p.y + p.h + 0.4) {
          c.hitSet.add(e); c.landed = true;
          hit(e, 3, { kx: c.f * 9, ky: -5, stun: 0.45 }); smack(); shake(3);
        }
      }
      if (c.t >= c.dur) {
        fx.push({ k: 'trail', x0: c.x0, x1: pcx(p), y: c.y, t: 0, life: 0.3 });
        if (c.landed) { airSideUsed = false; atkCD = Math.min(atkCD, 0.12); fx.push({ k: 'label', x: pcx(p), y: p.y - 0.2, t: 0, life: 0.6, text: 'REFRESH!' }); }
        carry = { vx: c.f * 8, t: 0.3 }; cxkick = null;
      }
    }

    // Dive Kick: down and forward at a steep angle
    if (dive) {
      dive.t += dt;
      p.vy = 21; p.vx = dive.f * 11;
      let landed = null;
      for (const e of enemies) {
        if (dive.hitSet.has(e)) continue;
        if (ex(e) > p.x - 0.3 && ex(e) < p.x + p.w + 0.3 && ey(e) > p.y + p.h * 0.3 && e.y < p.y + p.h + 0.3) { landed = e; break; }
      }
      if (landed) {
        dive.hitSet.add(landed);
        hit(landed, 3, { kx: dive.f * 3, ky: 14, stun: 0.5, c: C_KITE });
        fx.push({ k: 'burst', x: ex(landed), y: landed.y, t: 0, life: 0.35 });
        smack(); shake(5);
        if (!inSmash()) p.vy = -12;               // Smash does its own pogo for meteor hits
        p.vx = dive.f * 4; airUpUsed = false; dive = null;
      } else if (p.onGround && dive.t > 0.03) {
        for (const e of within(pcx(p), p.y + p.h - 0.4, 1.4)) hit(e, 1, { kx: (ex(e) >= pcx(p) ? 1 : -1) * 4, ky: -5, stun: 0.3 });
        fx.push({ k: 'sweep', x: pcx(p), y: p.y + p.h, t: 0, life: 0.3 });
        p.vx = dive.f * 6; carry = { vx: dive.f * 9, t: 0.3 };   // you skid out of it
        noise({ dur: 0.15, cut: 900, vol: 0.18 }); dive = null;
      } else if (dive.t > 0.5) dive = null;
    }

    for (let i = fx.length - 1; i >= 0; i--) { fx[i].t += dt; if (fx[i].t >= fx[i].life) fx.splice(i, 1); }
    prevJump = k.jump;
    lastPX = p.x; lastPY = p.y;
  }
  (window._rafHubTickers = window._rafHubTickers || []).push(step);

  // ---- drawing ----
  // the player: hooded wind runner with goggles and a long kite-tail scarf
  const _origDraw = window.cboxCharDraw;
  window.cboxCharDraw = function (charId, ctx, px, py, pw, ph, now2) {
    if (charId !== ID) { if (_origDraw) return _origDraw(charId, ctx, px, py, pw, ph, now2); return; }
    if (!isFinite(px) || !isFinite(py) || !isFinite(pw) || !isFinite(ph) || pw <= 0 || ph <= 0) return;
    const t = now2 || Date.now() / 1000, cx = px + pw / 2, s = pw / 20;
    ctx.save();
    // kite-tail scarf: longer and wilder with more Tailwind, flat out while gliding
    const len = 4 + Math.round(tw * 4), flap = gliding ? 0.6 : 1.4;
    ctx.lineCap = 'round';
    ctx.strokeStyle = C_KITE; ctx.lineWidth = s * 2;
    ctx.beginPath(); ctx.moveTo(cx - pw * 0.05, py + ph * 0.42);
    const pts = [];
    for (let i = 1; i <= len; i++) {
      const x = cx - pw * (0.05 + i * 0.11), y = py + ph * (0.42 + i * (gliding ? 0.0 : 0.025)) + Math.sin(t * 10 + i * 0.9) * s * flap * (1 + i * 0.2);
      pts.push([x, y]); ctx.lineTo(x, y);
    }
    ctx.stroke();
    // little kite bows along the tail
    for (let i = 1; i < pts.length; i += 2) {
      const [bx, by] = pts[i];
      ctx.fillStyle = i % 4 === 1 ? C_MINT : C_WHITE;
      ctx.beginPath(); ctx.moveTo(bx, by - s * 1.3); ctx.lineTo(bx + s * 1.1, by); ctx.lineTo(bx, by + s * 1.3); ctx.lineTo(bx - s * 1.1, by); ctx.closePath(); ctx.fill();
    }
    ctx.shadowBlur = 6 + tw * 10; ctx.shadowColor = 'rgba(94,230,200,0.75)';
    // body: a light jacket
    ctx.fillStyle = '#2b8f86';
    ctx.beginPath(); ctx.roundRect(px + pw * 0.2, py + ph * 0.4, pw * 0.6, ph * 0.4, s * 2); ctx.fill();
    ctx.shadowBlur = 0;
    ctx.fillStyle = C_MINT; ctx.fillRect(px + pw * 0.2, py + ph * 0.56, pw * 0.6, ph * 0.05);
    // wind swirl emblem
    ctx.strokeStyle = C_WHITE; ctx.lineWidth = s * 0.8;
    ctx.beginPath(); ctx.arc(cx, py + ph * 0.68, s * 2.2, t * 6, t * 6 + Math.PI * 1.4); ctx.stroke();
    // legs (a running stride that speeds up with Tailwind)
    ctx.fillStyle = C_DARK;
    const stride = window._gamePlayer && window._gamePlayer.onGround && Math.abs(window._gamePlayer.vx || 0) > 1 ? Math.sin(t * (12 + tw * 10)) * s * 2 : 0;
    ctx.fillRect(px + pw * 0.27 + stride, py + ph * 0.8, pw * 0.15, ph * 0.12);
    ctx.fillRect(px + pw * 0.58 - stride, py + ph * 0.8, pw * 0.15, ph * 0.12);
    // hooded head
    ctx.fillStyle = '#2b8f86';
    ctx.beginPath(); ctx.arc(cx, py + ph * 0.25, pw * 0.29, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#f1d3b5';
    ctx.beginPath(); ctx.arc(cx + pw * 0.06, py + ph * 0.27, pw * 0.2, 0, Math.PI * 2); ctx.fill();
    // goggles, looking forward (the game mirrors the drawing when facing left)
    ctx.fillStyle = C_DARK; ctx.fillRect(cx - pw * 0.08, py + ph * 0.215, pw * 0.36, s * 2.6);
    ctx.fillStyle = C_SKY;
    ctx.beginPath(); ctx.arc(cx + pw * 0.04, py + ph * 0.235, s * 1.5, 0, Math.PI * 2); ctx.arc(cx + pw * 0.18, py + ph * 0.235, s * 1.5, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.beginPath(); ctx.arc(cx + pw * 0.035, py + ph * 0.225, s * 0.5, 0, Math.PI * 2); ctx.arc(cx + pw * 0.175, py + ph * 0.225, s * 0.5, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  };

  function neon(ctx, col, w, a) {
    ctx.globalAlpha = 0.28 * a; ctx.strokeStyle = col; ctx.lineWidth = w * 3; ctx.stroke();
    ctx.globalAlpha = a; ctx.lineWidth = w; ctx.stroke();
  }
  function drawWorld(ctx, cam) {
    const p = window._gamePlayer; if (!p || !active) return;
    const T = window._TILE || 40, cx0 = cam ? cam.x : 0, cy0 = cam ? cam.y : 0;
    const SX = x => x * T - cx0, SY = y => y * T - cy0, now = performance.now() / 1000;
    const hx = SX(pcx(p)), hy = SY(pcy(p));
    ctx.save();
    ctx.lineJoin = 'round'; ctx.lineCap = 'round'; ctx.shadowBlur = 0;
    ctx.globalCompositeOperation = 'lighter';
    // Tailwind streaks behind you
    if (tw > 0.15) {
      const d = (p.vx || lastDir) >= 0 ? -1 : 1, n = 1 + Math.round(tw * 3);
      for (let i = 0; i < n; i++) {
        const yy = hy + (i - (n - 1) / 2) * T * 0.2, L = T * (0.5 + ((now * 6 + i * 0.31) % 1) * 1.2 * tw);
        ctx.beginPath(); ctx.moveTo(hx + d * T * 0.45, yy); ctx.quadraticCurveTo(hx + d * (T * 0.45 + L * 0.5), yy - 4, hx + d * (T * 0.45 + L), yy);
        neon(ctx, i % 2 ? C_SKY : C_MINT, 1.2, 0.35 + 0.4 * tw);
      }
    }
    // gliding: a soft wing of wind over your head
    if (gliding) { ctx.beginPath(); ctx.ellipse(hx, hy - T * 0.55, T * 0.75, T * 0.18, 0, Math.PI, Math.PI * 2); neon(ctx, C_WHITE, 1.5, 0.7); }
    // dive kick: a spear of wind along the dive
    if (dive) { ctx.beginPath(); ctx.moveTo(hx, hy); ctx.lineTo(hx - dive.f * T * 1.1, hy - T * 2.1); neon(ctx, C_KITE, 2.5, 0.7); }
    if (cdash || cxkick) { for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.arc(hx, hy, T * (0.5 + i * 0.15), now * 25 + i * 2, now * 25 + i * 2 + Math.PI); neon(ctx, i % 2 ? C_SKY : C_MINT, 1.4, 0.75); } }
    if (spinT > 0) { ctx.beginPath(); ctx.arc(hx, hy, T * 1.2, now * 22, now * 22 + Math.PI * 1.5); neon(ctx, C_WHITE, 1.6, spinT / 0.3); }
    // Tailwind meter: a small arc under your feet
    if (tw > 0.02) { ctx.beginPath(); ctx.arc(hx, SY(p.y + p.h) + 4, T * 0.4, Math.PI * 0.15, Math.PI * (0.15 + 0.7 * tw)); neon(ctx, tw >= 1 ? C_WHITE : C_MINT, 1.5, 0.8); }

    for (const f of fx) {
      const u = f.t / f.life, a = 1 - u;
      if (f.k === 'hit') { ctx.beginPath(); ctx.arc(SX(f.x), SY(f.y), T * (0.2 + u * 0.45), 0, Math.PI * 2); neon(ctx, f.c, 2, a); }
      else if (f.k === 'palm') {
        for (let i = 0; i < 3; i++) { const x = SX(f.x) + f.f * T * f.R * Math.min(1, u * 2) * (0.5 + i * 0.25); ctx.beginPath(); ctx.arc(x, SY(f.y), T * (0.3 + i * 0.15), f.f > 0 ? -1 : Math.PI - 1, f.f > 0 ? 1 : Math.PI + 1); neon(ctx, i % 2 ? C_SKY : C_MINT, 1.8, a); }
      } else if (f.k === 'column') {
        const x = SX(f.x), y = SY(f.y), H = T * 3 * Math.min(1, u * 3);
        for (let i = 0; i < 4; i++) { const yy = y - H * ((u * 2 + i / 4) % 1); ctx.beginPath(); ctx.ellipse(x, yy, T * (0.7 - i * 0.08), T * 0.15, 0, 0, Math.PI * 2); neon(ctx, i % 2 ? C_SKY : C_MINT, 1.6, a); }
      } else if (f.k === 'sweep') {
        for (const d of [1, -1]) { ctx.beginPath(); ctx.moveTo(SX(f.x), SY(f.y) - 3); ctx.quadraticCurveTo(SX(f.x) + d * T * 1.2 * (0.3 + u), SY(f.y) - T * 0.6, SX(f.x) + d * T * 2.5 * (0.3 + u * 0.7), SY(f.y) - 3); neon(ctx, C_SKY, 2, a); }
      } else if (f.k === 'whirl') { ctx.beginPath(); ctx.arc(SX(f.x), SY(f.y), T * 1.7 * (0.5 + u * 0.5), u * 12, u * 12 + Math.PI * 1.8); neon(ctx, C_MINT, 2, a); }
      else if (f.k === 'jet') { ctx.beginPath(); ctx.moveTo(SX(f.x) - T * 0.25, SY(f.y)); ctx.lineTo(SX(f.x), SY(f.y) + T * (0.4 + u * 1.2)); ctx.lineTo(SX(f.x) + T * 0.25, SY(f.y)); neon(ctx, C_WHITE, 1.6, a); }
      else if (f.k === 'trail') { ctx.beginPath(); ctx.moveTo(SX(f.x0), SY(f.y)); ctx.lineTo(SX(f.x1), SY(f.y)); neon(ctx, C_MINT, 3 * a + 0.5, a); }
      else if (f.k === 'burst') { for (let i = 0; i < 6; i++) { const an = Math.PI * (0.1 + i * 0.16), r = T * (0.2 + u * 0.9); ctx.beginPath(); ctx.moveTo(SX(f.x) + Math.cos(an) * r * 0.4, SY(f.y) + Math.sin(an) * r * 0.4); ctx.lineTo(SX(f.x) + Math.cos(an) * r, SY(f.y) + Math.sin(an) * r); neon(ctx, C_KITE, 1.6, a); } }
      else if (f.k === 'puff') { ctx.beginPath(); ctx.arc(SX(f.x), SY(f.y) + u * 6, T * (0.08 + u * 0.18), 0, Math.PI * 2); neon(ctx, C_WHITE, 1, a * 0.6); }
      else if (f.k === 'label') {
        ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = a;
        ctx.font = 'bold 12px sans-serif'; ctx.textAlign = 'center'; ctx.lineWidth = 3; ctx.strokeStyle = C_DARK;
        const x = SX(f.x), y = SY(f.y) - f.t * 30 - 12;
        ctx.strokeText(f.text, x, y); ctx.fillStyle = C_MINT; ctx.fillText(f.text, x, y);
        ctx.globalCompositeOperation = 'lighter';
      }
    }
    ctx.restore();
  }
  const _prevDrawHook = window.drifterDrawHook;
  window.drifterDrawHook = function (ctx, now2, cam) {
    if (_prevDrawHook) _prevDrawHook(ctx, now2, cam);
    if (window.selectedCharacter !== ID) return;
    try { drawWorld(ctx, cam); } catch (e) {}
  };

  // A second fighter (Smash CPU) playing Gale keeps its own Tailwind, moves in progress and effects.
  (window._fighterPlugins = window._fighterPlugins || []).push({ name: 'gale', char: ID,
    swap(s) {
      const o = { active, atkCD, tw, twSaid, airUpUsed, airSideUsed, gliding, wallRunT, lastPX, lastPY, prevJump, lastDir, cxkick, dive, cdash, carry, spinT, fx: fx.splice(0) };
      s = s || { active: true };
      active = !!s.active; atkCD = s.atkCD || 0; tw = s.tw || 0; twSaid = s.twSaid || 0; airUpUsed = !!s.airUpUsed; airSideUsed = !!s.airSideUsed;
      gliding = !!s.gliding; wallRunT = s.wallRunT || 0; lastPX = s.lastPX != null ? s.lastPX : null; lastPY = s.lastPY != null ? s.lastPY : null;
      prevJump = !!s.prevJump; lastDir = s.lastDir || 1; cxkick = s.cxkick || null; dive = s.dive || null; cdash = s.cdash || null; carry = s.carry || null; spinT = s.spinT || 0;
      if (s.fx) fx.push(...s.fx);
      statKey = -1; if (window._gtCharStatCache && window._gtCharStatCache[ID]) window._gtCharStatCache[ID] = stats();   // speed follows whoever's turn it is
      return o;
    },
    tick: dt => { if (window.selectedCharacter === ID) step(dt); },
    draw: (ctx, now2, cam) => { if (window.selectedCharacter === ID) drawWorld(ctx, cam); },
  });

  // join the character list once the capsule system is ready
  let tries = 0;
  function hook() {
    if (!window.injectCboxCharButtons || !window.CBOX_CHARS_DEF) { if (++tries < 80) setTimeout(hook, 100); return; }
    if (!window.injectCboxCharButtons._galePatch) {
      const orig = window.injectCboxCharButtons;
      window.injectCboxCharButtons = function () { if (isOwned()) register(); orig(); };
      window.injectCboxCharButtons._galePatch = true;
    }
    if (isOwned()) { register(); window.injectCboxCharButtons(); }
  }
  setTimeout(hook, 250);
})();
