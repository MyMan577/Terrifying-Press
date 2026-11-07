// ── Online play over QR Link ─────────────────────────────────────
// The two phones connect by scanning each other's QR code (../qrlink).
// HOST runs the only simulation (normal gameLoop, no AI) and sends the
// joiner a snapshot ~30 times a second. JOINER only draws: it sends its
// card plays, abilities and emotes to the host. Coordinates are mirrored
// so each player sees their own side at the bottom.
//
// Compared with the old PeerJS version: no server, smaller snapshots
// (rounded numbers, no hands/decks), smooth movement on the joiner
// (positions are blended between snapshots), particles and damage numbers
// show on both phones, emotes appear on the right side, rematches without
// scanning again, and both sides play the Classic King with Chaos Mode off
// so neither player gets a bonus the other can't see.

function openMpModal() {
  const err = validateDeck(playerDeck);
  if (err) { alert(err); return; }
  if (!window.QRLink) { alert("Online play isn't available."); return; }
  if (mp.conn && mp.conn.open) { mpSendHello(); return; }
  QRLink.open({
    app: 'bastion', accent: '#7de8ff',
    title: 'Play a friend',
    hint: 'Both players need a valid deck. One phone hosts, the other joins.',
    onConnected: (conn, role) => mpStart(conn, role === 'host'),
  });
}
function closeMpModal() {}

function mpStart(conn, isHost) {
  mp.conn = conn;
  mp.isHost = isHost;
  mp.active = true;
  mp.inMatch = false;
  mp.meReady = mp.themReady = false;
  conn.on('data', mpOnMessage);
  conn.on('close', mpOnClose);
  mpSendHello();
}

function mpSendHello() {
  if (!mp.conn) return;
  mp.conn.send({ type: 'hello', towerTroopId: selectedTowerTroop.id });
}

function mpOnMessage(msg) {
  if (!msg) return;
  if (msg.type === 'hello') {
    if (mp.isHost) { mp.joinerTowerTroopId = msg.towerTroopId || 'princess'; mpBeginMatch(); }
    return;
  }
  if (msg.type === 'start' && !mp.isHost) {
    mp.hostTowerTroopId = msg.hostTowerTroopId || 'princess';
    startMultiplayerJoiner();
    return;
  }
  if (msg.type === 'input' && mp.isHost && state && state.running && mp.inMatch) {
    for (const p of (msg.plays || [])) applyRemotePlay(p);
    return;
  }
  if (msg.type === 'state' && !mp.isHost && state && state.running && mp.inMatch) {
    applyHostState(msg.snap);
    return;
  }
  if (msg.type === 'end') {
    if (state && state.running && mp.inMatch) {
      mp.inMatch = false; // so our endGame doesn't echo it back
      const myResult = msg.result === 'win' ? 'lose' : (msg.result === 'lose' ? 'win' : 'draw');
      endGame(myResult, mpFlipMsg(msg.msg, msg.result));
    }
    return;
  }
  if (msg.type === 'rematch') {
    mp.themReady = true;
    mpRefreshOverlay();
    if (mp.isHost && mp.meReady) mpBeginMatch();
  }
}

// Turn the host's end message into one that reads right for the joiner.
function mpFlipMsg(m, hostResult) {
  if (hostResult === 'draw') return m || 'Draw!';
  if (/left the match/i.test(m || '')) return 'Your opponent left the match.';
  return hostResult === 'win' ? 'Their bastion held.' : 'You brought their king down!';
}

function mpOnClose() {
  const wasInMatch = mp.inMatch && state && state.running;
  mp.active = false; mp.inMatch = false; mp.conn = null;
  mp.meReady = mp.themReady = false;
  if (wasInMatch) endGame('win', 'Your opponent left the match.');
  else mpRefreshOverlay();
}

// ── HOST: start (or restart) a match ────────────────────────────
function mpBeginMatch() {
  mp.meReady = mp.themReady = false;
  mp.inMatch = true;
  mp.conn.send({ type: 'start', hostTowerTroopId: selectedTowerTroop.id });
  startMultiplayerHost();
}

function startMultiplayerHost() {
  mp.lastSyncTime = 0;
  mp.pendingLocalPlays = [];
  mp.netIds = new WeakMap(); mp.nextNetId = 1;

  document.getElementById('deckPicker').style.display = 'none';
  document.getElementById('overlay').style.display = 'none';
  document.getElementById('muteBtn').style.display = 'flex';

  // Same rules on both sides: Classic King, no Chaos Mode.
  const savedKing = selectedKingTroop, savedChaos = chaosModeActive;
  selectedKingTroop = KING_TROOPS[0]; chaosModeActive = false;
  try { startGame([...playerDeck], true); }
  finally { selectedKingTroop = savedKing; chaosModeActive = savedChaos; }

  const joinerTT = TOWER_TROOPS.find(t => t.id === (mp.joinerTowerTroopId || 'princess')) || TOWER_TROOPS[0];
  ['enemyLeft', 'enemyRight'].forEach(key => {
    const t = state.towers[key];
    t.hp = joinerTT.hp; t.maxHp = joinerTT.hp;
    t.dmg = joinerTT.dmg; t.attackSpeed = joinerTT.attackSpeed;
    t.troopType = joinerTT.id;
    Object.assign(t, buildTowerTroopState(joinerTT));
  });
  document.getElementById('leaveBtn').style.display = 'flex';
  if (state.loop) cancelAnimationFrame(state.loop);
  state.loop = requestAnimationFrame(gameLoop);
}

// ── HOST: send a snapshot (called from gameLoop) ────────────────
function hostBroadcastState() {
  if (!mp.conn || !mp.active || !mp.inMatch) return;
  const now = performance.now();
  if (now - mp.lastSyncTime < SYNC_MS) return;
  // link backed up: skip this one rather than queue stale snapshots
  if (mp.conn.buffered && mp.conn.buffered() > 96 * 1024) return;
  mp.lastSyncTime = now;
  let text;
  try { text = JSON.stringify({ type: 'state', snap: buildFullSnapshot() }, mpRound); }
  catch (e) { mpLearnBadKeys(); return; }
  mp.conn.sendText(text);
}

// Two decimals is plenty for drawing, and roughly halves the snapshot size.
function mpRound(k, v) {
  return (typeof v === 'number' && !Number.isInteger(v)) ? Math.round(v * 100) / 100 : v;
}

// If a snapshot ever fails to serialise, find which unit fields caused it and
// leave them out from then on.
function mpLearnBadKeys() {
  for (const u of state.units) for (const k in u) {
    if (MP_UNIT_SKIP.has(k) || !u[k] || typeof u[k] !== 'object') continue;
    try { JSON.stringify(u[k]); } catch (e) { MP_UNIT_SKIP.add(k); }
  }
}

function mpNetId(o) {
  let id = mp.netIds.get(o);
  if (!id) { id = mp.nextNetId++; mp.netIds.set(o, id); }
  return id;
}

function buildFullSnapshot() {
  // only particles / float texts created since the last snapshot
  const newParticles = [];
  for (const p of state.particles) { if (!p._sent) { p._sent = 1; if (newParticles.length < 150) newParticles.push(p); } }
  const newTexts = [];
  for (const t of state.floatTexts) { if (!t._sent) { t._sent = 1; newTexts.push(t); } }
  return {
    emotes:  state.emotes,
    timeSec: state.timeSec,
    lastPlayedCard: state.lastPlayedCard ? { id: state.lastPlayedCard.id, emoji: state.lastPlayedCard.emoji, cost: state.lastPlayedCard.cost } : null,
    towers: Object.fromEntries(
      Object.entries(state.towers).map(([k, t]) => [k, {
        hp: t.hp, maxHp: t.maxHp,
        troopType: t.troopType,
        _ddDaggers: t._ddDaggers, _ddMaxDaggers: t._ddMaxDaggers,
        _cwCharges: t._cwCharges, _cwRewinding: t._cwRewinding, _cwRewindTimer: t._cwRewindTimer,
        _cwReloadDelayTimer: t._cwReloadDelayTimer, _cwReloadTimer: t._cwReloadTimer,
        _eclipsePhase: t._eclipsePhase, _eclipseTimer: t._eclipseTimer, _eclipseCharging: t._eclipseCharging,
        _beeTimer: t._beeTimer,
        _mirrorCooldown: t._mirrorCooldown,
        _mimicTimer: t._mimicTimer, _mimicCurrentTT: t._mimicCurrentTT,
        _taxmanAbilityActive: t._taxmanAbilityActive, _taxmanAbilityTimer: t._taxmanAbilityTimer, _taxmanCooldownTimer: t._taxmanCooldownTimer,
      }])
    ),
    units: state.units.map(serializeUnit),
    projectiles: state.projectiles.map(serializeProjectile),
    particles: newParticles.map(p => ({ x: p.x, y: p.y, vx: p.vx, vy: p.vy, life: p.life, maxLife: p.maxLife, size: p.size, color: p.color })),
    floatTexts: newTexts.map(t => ({ x: t.x, y: t.y, text: t.text, color: t.color, life: t.life, vy: t.vy, big: t.big })),
  };
}

// A unit or tower object hanging off another unit: never send those, they
// can loop back on themselves and would bloat every snapshot.
function mpLooksLive(o) { return !!o && typeof o === 'object' && 'hp' in o && 'team' in o && 'x' in o; }

const MP_UNIT_SKIP = new Set(['target', '_lockedTarget', '_hookTarget', '_hookCandidate', '_dashTarget',
  '_rebelDashTarget', '_jumpTarget', '_chargeTarget', '_siegeTarget', '_getawayTarget', '_fx', '_fy', '_tx', '_ty']);

function serializeUnit(u) {
  const s = {};
  for (const k in u) {
    if (MP_UNIT_SKIP.has(k)) continue;
    const v = u[k];
    if (typeof v === 'function') continue;
    if (v && typeof v === 'object') {
      if (Array.isArray(v)) { if (v.length && mpLooksLive(v[0])) continue; }
      else if (Object.getPrototypeOf(v) !== Object.prototype || mpLooksLive(v)) continue; // Sets, Maps, other units
    }
    s[k] = v;
  }
  s._n = mpNetId(u);
  return s;
}

function serializeProjectile(p) {
  const s = { ...p };
  if (s.targetRef) { s.targetRefN = mp.netIds.get(s.targetRef) || null; s.targetRefId = s.targetRef.id || null; delete s.targetRef; }
  if (s.shooterRef) { s.shooterRefN = mp.netIds.get(s.shooterRef) || null; s.shooterRefId = s.shooterRef.id || null; delete s.shooterRef; }
  if (s.hit && s.hit instanceof Set) { s.hitArr = [...s.hit]; delete s.hit; }
  s._n = mpNetId(p);
  return s;
}

// ── JOINER: start as a pure renderer ────────────────────────────
function startMultiplayerJoiner() {
  mp.pendingLocalPlays = [];
  mp.inMatch = true;
  mp.meReady = mp.themReady = false;
  mp.lastSnapAt = 0; mp.snapGap = SYNC_MS; mp.shown = new Map();

  const L = layout();
  const myTT    = selectedTowerTroop;
  const enemyTT = TOWER_TROOPS.find(t => t.id === (mp.hostTowerTroopId || 'princess')) || TOWER_TROOPS[0];
  const pool = shuffle([...playerDeck]);
  state = {
    elixir: 5, maxElixir: 10,
    gameTime: 300, timeSec: 0,
    units: [], particles: [], floatTexts: [], projectiles: [],
    emotes: [], emoteMenuOpen: false,
    selectedCard: null,
    hand: pool.slice(0, 4),
    deck: pool.slice(4),
    playerPool: [...playerDeck],
    aiElixir: 5, aiPlayTimer: 999,
    aiHand: [], aiDeck: [],
    isMultiplayer: true,
    towers: {
      playerKing : { x:L.W/2,    y:L.PLAYER_KING_Y,  hp:4824, maxHp:4824, team:'player', isKing:true,  size:22, dmg:109, attackSpeed:1.0 },
      playerLeft : { x:L.LANE_L, y:L.PLAYER_TOWER_Y, hp:myTT.hp,    maxHp:myTT.hp,    team:'player', isKing:false, size:16, dmg:myTT.dmg,    attackSpeed:myTT.attackSpeed,    troopType:myTT.id,    ...buildTowerTroopState(myTT) },
      playerRight: { x:L.LANE_R, y:L.PLAYER_TOWER_Y, hp:myTT.hp,    maxHp:myTT.hp,    team:'player', isKing:false, size:16, dmg:myTT.dmg,    attackSpeed:myTT.attackSpeed,    troopType:myTT.id,    ...buildTowerTroopState(myTT) },
      enemyKing  : { x:L.W/2,    y:L.ENEMY_KING_Y,   hp:4824, maxHp:4824, team:'enemy',  isKing:true,  size:22, dmg:109, attackSpeed:1.0 },
      enemyLeft  : { x:L.LANE_L, y:L.ENEMY_TOWER_Y,  hp:enemyTT.hp, maxHp:enemyTT.hp, team:'enemy',  isKing:false, size:16, dmg:enemyTT.dmg, attackSpeed:enemyTT.attackSpeed, troopType:enemyTT.id, ...buildTowerTroopState(enemyTT) },
      enemyRight : { x:L.LANE_R, y:L.ENEMY_TOWER_Y,  hp:enemyTT.hp, maxHp:enemyTT.hp, team:'enemy',  isKing:false, size:16, dmg:enemyTT.dmg, attackSpeed:enemyTT.attackSpeed, troopType:enemyTT.id, ...buildTowerTroopState(enemyTT) },
    },
    running: true, lastTime: null, rageZones: [], healZones: [], poisonZones: [], graveyards: [], tornadoZones: [], maelstromZones: [], lavaPuddles: [], stormZones: [], mudPuddles: [], supplyCrates: [],
    lastPlayedCard: null, myLastPlayedCard: null,
    _loanDouble: 0, _loanHalf: 0,
  };

  canvas.addEventListener('pointerdown',  onPointerDown);
  canvas.addEventListener('pointermove',  onPointerMove);
  canvas.addEventListener('pointerup',    onPointerUp);
  canvas.addEventListener('pointercancel',onPointerCancel);
  document.getElementById('muteBtn').style.display = 'flex';
  document.getElementById('leaveBtn').style.display = 'flex';
  document.getElementById('deckPicker').style.display = 'none';
  document.getElementById('overlay').style.display = 'none';
  hideSaviorPanelIfAny();

  if (state.loop) cancelAnimationFrame(state.loop);
  state.loop = requestAnimationFrame(joinerLoop);
}

function hideSaviorPanelIfAny() {
  // startGame hides the side panel for the host; do the same on the joiner
  const sp = document.getElementById('saviorPanel'), st = document.getElementById('saviorPanelTab');
  if (sp) { sp.classList.remove('open'); sp.style.display = 'none'; }
  if (st) { st.classList.remove('open'); st.style.display = 'none'; }
}

// ── JOINER: apply a snapshot ────────────────────────────────────
// Mirror convention: host's 'player' = joiner's 'enemy' and vice versa,
// and the arena is rotated 180°.
const MP_MIRROR_KEY = { playerKing:'enemyKing',  enemyKing:'playerKing',
                        playerLeft:'enemyRight', enemyLeft:'playerRight',
                        playerRight:'enemyLeft', enemyRight:'playerLeft' };
const MP_TOWER_FIELDS = ['_ddDaggers','_ddMaxDaggers','_cwCharges','_cwRewinding','_cwRewindTimer',
                         '_cwReloadDelayTimer','_cwReloadTimer',
                         '_eclipsePhase','_eclipseTimer','_eclipseCharging','_beeTimer','_mirrorCooldown',
                         '_mimicTimer','_mimicCurrentTT',
                         '_taxmanAbilityActive','_taxmanAbilityTimer','_taxmanCooldownTimer'];

function applyHostState(snap) {
  const L = layout();
  const W = L.W, H = L.ARENA_H;
  const flipTeam = t => t === 'player' ? 'enemy' : (t === 'enemy' ? 'player' : t);

  // how often snapshots really arrive, smoothed, so blending matches the link
  const now = performance.now();
  if (mp.lastSnapAt) mp.snapGap = Math.min(150, Math.max(16, mp.snapGap * 0.85 + (now - mp.lastSnapAt) * 0.15));
  mp.lastSnapAt = now;

  state.timeSec = snap.timeSec;   // the match ends only on the host's 'end' message
  if (snap.lastPlayedCard) state.lastPlayedCard = { ...snap.lastPlayedCard };

  state.emotes = (snap.emotes || []).map(e => ({ ...e, x: W - e.x, y: H - e.y, team: flipTeam(e.team) }));

  for (const [k, v] of Object.entries(snap.towers)) {
    const t = state.towers[MP_MIRROR_KEY[k]];
    if (!t) continue;
    t.hp = v.hp; t.maxHp = v.maxHp;
    for (const f of MP_TOWER_FIELDS) if (v[f] !== undefined) t[f] = v[f];
  }

  // Blend from where each thing is drawn now toward its new position.
  const shown = mp.shown;
  const far = W * 0.25;
  function blend(o) {
    const prev = shown.get(o._n);
    o._tx = o.x; o._ty = o.y;
    if (prev && Math.abs(prev.x - o.x) < far && Math.abs(prev.y - o.y) < far) { o._fx = prev.x; o._fy = prev.y; }
    else { o._fx = o.x; o._fy = o.y; }
  }

  state.units = snap.units.map(su => {
    const u = su;
    u.x = W - su.x; u.y = H - su.y;
    u.team = flipTeam(su.team);
    blend(u);
    return u;
  });
  const byN = new Map(), byId = {};
  for (const u of state.units) { byN.set(u._n, u); if (u.id !== undefined) byId[u.id] = u; }

  state.projectiles = snap.projectiles.map(sp => {
    const p = sp;
    p.x = W - sp.x; p.y = H - sp.y;
    if (sp.tx !== undefined) p.tx = W - sp.tx;
    if (sp.ty !== undefined) p.ty = H - sp.ty;
    if (sp.ox !== undefined) p.ox = W - sp.ox;
    if (sp.oy !== undefined) p.oy = H - sp.oy;
    p.team = flipTeam(sp.team);
    if (sp.targetRefN != null || sp.targetRefId != null) p.targetRef = byN.get(sp.targetRefN) || byId[sp.targetRefId] || null;
    if (sp.shooterRefN != null || sp.shooterRefId != null) p.shooterRef = byN.get(sp.shooterRefN) || byId[sp.shooterRefId] || null;
    if (sp.hitArr) { p.hit = new Set(sp.hitArr); delete p.hitArr; }
    blend(p);
    return p;
  });

  for (const p of (snap.particles || [])) {
    state.particles.push({ ...p, x: W - p.x, y: H - p.y, vx: -p.vx, vy: -p.vy });
  }
  for (const t of (snap.floatTexts || [])) {
    state.floatTexts.push({ ...t, x: W - t.x, y: H - t.y });
  }
}

// Position of everything for this frame, between the last two snapshots.
function mpBlendPositions() {
  const a = Math.min(1, Math.max(0, (performance.now() - mp.lastSnapAt) / mp.snapGap));
  const shown = new Map();
  const step = o => {
    if (o._fx === undefined) return;
    o.x = o._fx + (o._tx - o._fx) * a;
    o.y = o._fy + (o._ty - o._fy) * a;
    shown.set(o._n, { x: o.x, y: o.y });
  };
  state.units.forEach(step);
  state.projectiles.forEach(step);
  mp.shown = shown;
}

function joinerFlushInputs() {
  if (!mp.conn || !mp.active || mp.pendingLocalPlays.length === 0) return;
  try { mp.conn.send({ type: 'input', plays: mp.pendingLocalPlays }); } catch (e) {}
  mp.pendingLocalPlays = [];
}

// ── JOINER: draw loop (no simulation) ───────────────────────────
function joinerLoop(ts) {
  if (!state || !state.running) return;

  if (!state._joinerLastTs) state._joinerLastTs = ts;
  const elapsed = ts - state._joinerLastTs;
  state._joinerLastTs = ts;
  const dt = Math.min(elapsed / 1000, 0.05);

  // Elixir runs locally so the bar is smooth; same rules as the host uses.
  const remaining = Math.max(0, state.gameTime - state.timeSec);
  const doubleElixir = remaining <= 120;
  const elixirRate = doubleElixir ? 0.357 * 2 : 0.357;

  // Taxman Tower: if the opponent's Frozen Assets is on, our regen drops.
  const oppTaxActive = ['enemyLeft','enemyRight'].some(k => state.towers[k] && state.towers[k].isTaxman && state.towers[k]._taxmanAbilityActive);
  const tt_defTaxJ = TOWER_TROOPS.find(t => t.id === 'taxman');
  const taxPenaltyJ = tt_defTaxJ ? tt_defTaxJ.taxmanEnemyRegenPenalty : 0.30;
  const myElixirMult = oppTaxActive ? (1 - taxPenaltyJ) : 1;

  if (state._loanDouble > 0) {
    state._loanDouble -= dt;
    if (state._loanDouble <= 0) {
      state._loanDouble = 0;
      state._loanHalf = CARDS.find(c => c.isLoan)?.loanHalfDur ?? 15;
    }
    const loanMult = doubleElixir ? 4 : 2;
    state.elixir = Math.min(state.maxElixir, state.elixir + dt * elixirRate * loanMult * myElixirMult);
  } else if (state._loanHalf > 0) {
    state._loanHalf -= dt;
    if (state._loanHalf < 0) state._loanHalf = 0;
    state.elixir = Math.min(state.maxElixir, state.elixir + dt * elixirRate * 0.5 * myElixirMult);
  } else {
    state.elixir = Math.min(state.maxElixir, state.elixir + dt * elixirRate * myElixirMult);
  }

  SFX.tick(state);
  joinerFlushInputs();
  updateParticles(dt);
  mpBlendPositions();

  const L = layout();
  state.towers.playerKing.x  = L.W/2;    state.towers.playerKing.y  = L.PLAYER_KING_Y;
  state.towers.playerLeft.x  = L.LANE_L; state.towers.playerLeft.y  = L.PLAYER_TOWER_Y;
  state.towers.playerRight.x = L.LANE_R; state.towers.playerRight.y = L.PLAYER_TOWER_Y;
  state.towers.enemyKing.x   = L.W/2;    state.towers.enemyKing.y   = L.ENEMY_KING_Y;
  state.towers.enemyLeft.x   = L.LANE_L; state.towers.enemyLeft.y   = L.ENEMY_TOWER_Y;
  state.towers.enemyRight.x  = L.LANE_R; state.towers.enemyRight.y  = L.ENEMY_TOWER_Y;

  const { sx, sy, ox, oy, hsx } = renderScale();
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.save();
  ctx.translate(ox, oy);
  ctx.scale(sx, sy);
  if (state._shakeX || state._shakeY) {
    ctx.translate(state._shakeX || 0, state._shakeY || 0);
    state._shakeX *= 0.85; state._shakeY *= 0.85;
    if (Math.abs(state._shakeX) < 0.1) state._shakeX = 0;
    if (Math.abs(state._shakeY) < 0.1) state._shakeY = 0;
  }
  drawArena(dt);
  drawSpellPreview();
  Object.values(state.towers).forEach(drawTower);
  state.units.forEach(drawUnit);
  drawProjectiles();
  drawParticles();
  drawFloatTexts();
  drawEmotes(L);
  ctx.restore();

  ctx.save();
  ctx.translate(0, oy);
  ctx.scale(hsx, sy);
  drawHud(remaining);
  ctx.restore();

  ctx.save();
  ctx.font = 'bold 13px "Exo 2", sans-serif';
  ctx.fillStyle = '#7de8ff';
  ctx.textAlign = 'right';
  ctx.globalAlpha = 0.9;
  ctx.fillText('🌐 ONLINE', canvas.width - 12, 20);
  ctx.restore();

  state.loop = requestAnimationFrame(joinerLoop);
}

// ── HOST: apply the joiner's play ───────────────────────────────
function applyRemotePlay(p) {
  if (p.type === 'emote') {
    playEmote(p.emoteId, 'enemy');
    return;
  }
  if (p.type === 'ability') {
    if (p.abilityType === 'archerQueen') {
      const aq = state.units.find(u => u.isArcherQueen && u.team === 'enemy' && u.hp > 0 && !u._cloakActive);
      if (aq) activateArcherQueenAbility(aq);
    } else if (p.abilityType === 'bossBandit') {
      const bb = state.units.find(u => u.isBossBandit && u.team === 'enemy' && u.hp > 0 && !u._getawayTimer && !u._dashing);
      if (bb) { const ts = layout().ARENA_H / 32; _bossBanditGetaway(bb, ts); }
    } else if (p.abilityType === 'taxman') {
      activateTaxmanAbility('enemy');
    }
    return;
  }
  const cardDef = p.cardDef || CARDS.find(c => c.id === p.cardId);
  if (!cardDef) return;
  const L = layout();
  const x = (1 - p.nx) * L.W;
  let y = (1 - p.ny) * L.ARENA_H;

  // Placement rules for the joiner's side (top half on the host's screen),
  // including the pockets that open when one of the host's towers falls.
  const towerSizeR = state.towers.playerLeft.size || 16;
  const pocketTopR    = L.PLAYER_TOWER_Y - towerSizeR * 0.9;
  const pocketBottomR = L.RIVER_Y + 22;
  const leftPocketOpenR  = state.towers.playerLeft.hp  <= 0;
  const rightPocketOpenR = state.towers.playerRight.hp <= 0;
  const inLeftPocketR  = leftPocketOpenR  && x < L.W / 2 && y > pocketTopR && y < pocketBottomR;
  const inRightPocketR = rightPocketOpenR && x >= L.W / 2 && y > pocketTopR && y < pocketBottomR;
  const inPocketR = inLeftPocketR || inRightPocketR;

  if (cardDef.isLog || cardDef.isBerserkerBarrel) {
    if (y >= L.RIVER_Y - 10 && !inPocketR) y = L.RIVER_Y - 11;
  } else if (cardDef.isGoblinBarrel) {
    if (y <= L.RIVER_Y + 10) y = L.RIVER_Y + 11;
  } else if (!cardDef.isMiner && !cardDef.isGoblinDrill && cardDef.type !== 'spell') {
    if (y >= L.RIVER_Y && !inPocketR) return;
  }
  if (cardDef.isRoyalDelivery && y >= L.RIVER_Y) return;

  playCard({ ...cardDef }, x, y, 'enemy', true);
}

// ── placeSelectedCard calls this in online matches ──────────────
function mpQueuePlay(card, mx, my) {
  const L = layout();
  if (mp.isHost) {
    playCard({ ...card }, mx, my, 'player');
    state.lastPlayedCard = { ...card };
    state.myLastPlayedCard = { ...card };
  } else {
    mp.pendingLocalPlays.push({ cardId: card.id, cardDef: { ...card }, nx: mx / L.W, ny: my / L.ARENA_H });
    state.lastPlayedCard = { ...card };
    state.myLastPlayedCard = { ...card };
  }
}

function mpQueueAbility(abilityType) {
  if (mp.isHost) {
    if (abilityType === 'archerQueen') {
      const aq = state.units.find(u => u.isArcherQueen && u.team === 'player' && u.hp > 0 && !u._cloakActive);
      if (aq) activateArcherQueenAbility(aq);
    } else if (abilityType === 'bossBandit') {
      const bb = state.units.find(u => u.isBossBandit && u.team === 'player' && u.hp > 0 && !u._getawayTimer && !u._dashing);
      if (bb) { const ts = layout().ARENA_H / 32; _bossBanditGetaway(bb, ts); }
    } else if (abilityType === 'taxman') {
      activateTaxmanAbility('player');
    }
  } else {
    mp.pendingLocalPlays.push({ type: 'ability', abilityType });
  }
}

// ── After a match: rematch or leave ─────────────────────────────
function mpOnEnd(result, msg) {
  if (!state || !state.isMultiplayer) return;
  if (mp.inMatch && mp.conn) {
    try { mp.conn.send({ type: 'end', result, msg }); } catch (e) {}
  }
  mp.inMatch = false;
  mp.meReady = mp.themReady = false;
  mpRefreshOverlay();
}

function mpRefreshOverlay() {
  const ov = document.getElementById('overlay');
  const btn = document.getElementById('restartBtn');
  let leave = document.getElementById('mpLeaveBtn');
  if (!state || !state.isMultiplayer || ov.style.display === 'none') return;
  if (!leave) {
    leave = document.createElement('button');
    leave.id = 'mpLeaveBtn';
    leave.className = 'mp-btn-ghost';
    leave.style.marginTop = '10px';
    leave.textContent = 'Back to deck';
    leave.onclick = mpLeave;
    btn.insertAdjacentElement('afterend', leave);
  }
  leave.style.display = '';
  if (mp.conn && mp.conn.open) {
    btn.onclick = mpRematch;
    btn.disabled = mp.meReady;
    btn.textContent = mp.meReady ? 'Waiting for them…' : (mp.themReady ? 'Rematch! They’re ready' : 'Rematch');
  } else {
    btn.onclick = mpLeave;
    btn.disabled = false;
    btn.textContent = 'They left. Back to deck';
    leave.style.display = 'none';
  }
}

function mpRematch() {
  if (!mp.conn || !mp.conn.open || mp.meReady) return;
  mp.meReady = true;
  mp.conn.send({ type: 'rematch' });
  mpRefreshOverlay();
  if (mp.isHost && mp.themReady) mpBeginMatch();
}

function mpLeave() {
  const c = mp.conn;
  mp.conn = null; mp.active = false; mp.inMatch = false; mp.meReady = mp.themReady = false;
  try { if (c) c.close(); } catch (e) {}
  const btn = document.getElementById('restartBtn');
  btn.onclick = initGame; btn.disabled = false; btn.textContent = 'Play Again';
  const leave = document.getElementById('mpLeaveBtn');
  if (leave) leave.style.display = 'none';
  initGame();
}

