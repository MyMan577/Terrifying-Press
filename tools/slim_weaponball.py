#!/usr/bin/env python3
"""Slim Weapon Ball for Press Play: no betting, no cosmetics (and so no coin
wallet, which only paid for those two). usage: slim_weaponball.py <in> <out>"""
import sys, os, re
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from slimlib import Doc
d = Doc(sys.argv[1])

# ---- cosmetics: the four side panels, the shop/data, and the drawing hooks ----
for side in ['Red', 'Blue', 'Green', 'Orange']:
    d.cut('    <div class="cosm-section" id="cosmSection%s">' % side, '        <div class="cosm-row" id="cosmAura%s"></div>\n      </div>\n    </div>\n' % side)
d.cut('// ─── COSMETICS ', '// Call buildCosmPanels on load\nbuildCosmPanels();\n')
d.sub("  if (typeof applyCosmetics === 'function') applyCosmetics(newBall);\n", "")
for call in ['decoy', 'companion', 'fourth', 'ball']:
    d.cut_line('applyCosmetics(%s);' % call)
d.sub("""  // Trails (cosmetic-aware)
  balls.forEach(b => {
    if (!b.alive) return;
    ctx.save();
    if (b.cosm && b.cosm.trail && b.cosm.trail.draw) {
      b.cosm.trail.draw(b, ctx);
    } else if (!b.cosm || !b.cosm.trail || b.cosm.trail.id === 'none') {
      // default trail — fading dot chain (only when no cosmetic trail equipped)
      b.trail.forEach((pt, i) => {""", """  // Trails
  balls.forEach(b => {
    if (!b.alive) return;
    ctx.save();
    {
      b.trail.forEach((pt, i) => {""")
d.cut("    // Aura cosmetic (drawn behind ball body)\n", "      b.cosm.aura.draw(b, ctx);\n    }\n")
d.cut("    // Hat cosmetic (drawn above ball body)\n", "      b.cosm.hat.draw(b, ctx);\n    }\n")

d.cut('  /* ── Cosmetics panel ── */', '  /* ── 3/4 Ball Mode Toggle ── */', keep_end=True)

# ---- betting + coin wallet ----
d.cut('    <!-- ── BETTING STRIP', '        <div id="betPayoutHint" style="font-size:0.58rem; color:#7a6a20; min-height:12px;"></div>\n      </div>\n    </div>\n')
d.cut('// ─── BETTING SYSTEM ', "    refreshBetUI();\n  }, 0);\n})();\n")
d.sub("""  // Award coins for winning (non-roguelite, non-draft)
  if (!RL.active) {
    const reward = 25 + Math.floor(Math.random() * 26); // 25–50 coins
    if (typeof addCoins === 'function') {
      addCoins(reward);
      log(`🪙 +${reward} coins awarded! Balance: ${getCoins().toLocaleString()}`, 'sys');
    }
  }
""", "")
d.sub("""  // Award coins for winning
  if (typeof addCoins === 'function') {
    const reward = 25 + Math.floor(Math.random() * 26); // 25–50 coins
    addCoins(reward);
    log(`🪙 +${reward} coins awarded! Balance: ${getCoins().toLocaleString()}`, 'sys');
  }
""", "")
d.cut_line("window._betRefreshCoinDisplay === 'function'", count=2)

# ---- Press Play bridge: game music only while Press Play is silent ----
# Press Play calls __ppHostMute(true) while its own music plays. Only the music
# bus is muted; sound effects keep playing.
d.sub("""  musicGain = audioCtx.createGain();
  musicGain.gain.value = 0.28;""", """  musicGain = audioCtx.createGain();
  musicGain.gain.value = window.__ppMusicMuted ? 0 : 0.28;""")
d.sub("function initMusic() {", """window.__ppHostMute = function(m) {
  window.__ppMusicMuted = !!m;
  if (musicGain) musicGain.gain.value = m ? 0 : 0.28;
};
function initMusic() {""")

# ---- plainer text: the longest ball descriptions ----
d.text([
 ["Life-drain shots heal self for 40% of damage dealt", "Shots heal it for 40% of the damage. Attacks faster the more it has healed."],
 ["Spawns up to 5 clones every 5s.", "Makes clones every 5s (up to 5). If it dies, 3 clones can merge into a new one."],
 ["Summons a Wraith every 4s (up to 3 active).", "Summons up to 3 wraiths that chase and shoot, then explode on contact for 60."],
 ["As HP drops: attack speed +50%", "Gets faster and hits harder as it loses HP. Rages below 30%."],
 ["Heals 10% max HP every 8s. At full HP", "Heals every 8s. Double damage at full HP. Throws a spear that pins enemies to the wall."],
 ["Spews fire DoT. Summons an egg every 15s", "Burns enemies. Lays eggs that hatch baby phoenixes, and drops one more egg when it dies."],
 ["Each shot plants a ghost echo.", "Every shot leaves echoes that fire again, smaller each time."],
 ["Hurls arcane orbs every 1.5s", "Throws arcane orbs. Misses turn into little turrets. In Play Mode, the Ability button drops a turret."],
 ["Low damage shots that burst into 6 petals", "Weak shots that burst into petals. Plants roses that slow and burn."],
 ["5 lives — each \"death\" pops", "5 lives. Each death pops out a smaller, faster doll. Fires leeches that drain HP."],
 ["6 balls total — 1 original (100 HP)", "1 real ball and 5 decoys. When hit, the real one swaps places with a decoy."],
 ["Fires poison darts that deal 5-10 instant damage", "Poison darts that stack up. Special: a flask that bursts into glass and a poison cloud."],
 ["Commands a swarm of drone balls.", "Summons up to 4 drones that dive-bomb enemies. Stings poison."],
 ["A rallying commander. Every 10s blows a war horn", "Every 10s calls in a random ally for 12s. Nearby allies hit 20% harder."],
 ["Wields a scythe of shadow.", "Every 12s reaps the weakest enemy. Comes back once after dying."],
 ["All for one! The lead ball is the Attacker", "A team of 3: a fast attacker, a tough defender and an engineer with turrets. Beat all 3."],
 ["Launches a sticky bubble that traps one enemy briefly", "Bubbles trap enemies, float them away and pop. Ability: BIG BUBBLE."],
 ["Throws a tempting snack pickup.", "Throws a snack. Gourmet eats it to heal; enemies who eat it get slowed. Ability: SNACK TRAP."],
 ["Places mirrors on wall bounces", "Bounces lasers between mirrors. Each bounce adds damage. Never shoots directly."],
 ["Clings to walls to charge up", "Clings to walls to power up, but can't shoot while clinging. 700 HP."],
 ["No ranged attack. Passively gains +5 flat damage", "No shooting. Gets stronger while moving, then rams with a shockwave."],
])

# ---- fix: the mode buttons ran off the sides of a phone screen ----
# The row (1v1 ... ROGUELITE, DRAFT) never wrapped, so on a phone its label
# was cut off on the left and Roguelite / Draft on the right. Let it wrap.
d.sub("</head>", "<style>.mode-toggle-wrap{flex-wrap:wrap;justify-content:center;row-gap:6px;max-width:100%;padding:0 8px;box-sizing:border-box}</style>\n</head>")

d.save(sys.argv[2])
