#!/usr/bin/env python3
"""Bastion Brawl for Press Play, made from the owner's "Crown Clash".

Generic fantasy names (Knight, Valkyrie, Witch, Baby Dragon...) stay. Only
the names that are Clash Royale's own get new ones, along with the game's
name. Online multiplayer (PeerJS) is removed: bot battles only.
usage: slim_bastion.py <in> <out>"""
import sys, os, re
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from slimlib import Doc
d = Doc(sys.argv[1])

RENAME = [  # longest first so "Mini P.E.K.K.A" goes before "P.E.K.K.A"
 ('Mini P.E.K.K.A', 'Mini Mech'), ('P.E.K.K.A', 'Iron Mech'),
 ('Mega Knight', 'Heavy Knight'), ('Hog Rider', 'Boar Rider'), ('The Log', 'Rolling Log'),
 ('Sparky', 'Volt Cart'), ('Lava Hound', 'Lava Behemoth'),
 ('Inferno Dragon', 'Blaze Drake'), ('Inferno Tower', 'Blaze Tower'),
 ('Electro Wiz.', 'Storm Mage'), ('Electro Wizard', 'Storm Mage'), ('Electro Spirit', 'Spark Sprite'),
 ('Electro Dragon', 'Storm Drake'), ('Electro Giant', 'Storm Giant'),
 ('Royal Giant', 'Siege Giant'), ('Royal Delivery', 'Air Drop'), ('Royal Recruits', 'Shield Squad'),
 ('Royal Hogs', 'Boar Pack'), ('Royal Ghost', 'Phantom Blade'),
 ('Dark Prince', 'Shadow Prince'), ('Archer Queen', 'Ranger Queen'), ('Skeleton King', 'Bone King'),
 ('Golden Knight', 'Gilded Knight'), ('Mighty Miner', 'Heavy Miner'), ('Little Prince', 'Young Prince'),
 ('Goblinstein', 'Patchwork Goblin'),
 ('Skel. Army', 'Bone Army'), ('Skeleton Army', 'Bone Army'), ('Skel. Barrel', 'Bone Balloon'),
 ('Skeleton Barrel', 'Bone Balloon'), ('Skeleton Dragons', 'Bone Drakes'),
 ('Three Musketeers', 'Rifle Trio'), ('Mega Minion', 'Heavy Minion'), ('Wall Breakers', 'Bomb Runners'),
 ('Zappies', 'Spark Carts'), ('Elixir Collector', 'Elixir Well'), ('X-Bow', 'Crossbow Tower'),
 ('Giant Snowball', 'Snowball'),
 ('Goblin Barrel', 'Goblin Drop'), ('Goblin Giant', 'Goblin Hauler'), ('Goblin Drill', 'Goblin Burrow'),
 ('Goblin Cage', 'Goblin Pen'), ('Goblin Demolisher', 'Goblin Wrecker'), ('Goblin Machine', 'Goblin Walker'),
 ('Princess Tower', 'Archer Tower'), ('Dagger Duchess', 'Dagger Dame'),
 ('Crown Clash', 'Bastion Brawl'),
]
# These names only ever appear in visible text (multi-word, or single words
# that no identifier spells the same way), so a whole-word swap is safe.
for old, new in RENAME:
    pat = r'(?<![A-Za-z0-9_])' + re.escape(old) + r'(?![A-Za-z0-9_])'
    d.s, n = re.subn(pat, new, d.s)
    if n == 0 and old not in ('Electro Wizard', 'Skeleton Army', 'Skeleton Barrel'):
        sys.exit('name not found: ' + old)
# Goblinstein's monster half is just called "Monster" - rename only its card name

d.s = re.sub(r"(id\s*:\s*'goblinmonster'\s*,\s*name\s*:\s*)'Monster'", r"\1'Patchwork Brute'", d.s)

# ---- fix: Goblin Pen never released its Goblin Brawler ----
# Death spawns were pushed onto state.units while state.units was being
# filtered, and the filter's new array replaced it, dropping the spawn. Collect
# them and add them after the filter instead (same for Goblin Hauler's fallback).
FILTER_START = "  state.units = state.units.filter(u => {\n    if (!isFinite(u.hp)) { u.hp = 1; return true; }"
i = d.s.index(FILTER_START)
j = d.s.index("    return isAlive;\n  });\n", i)
block = d.s[i:j]
if block.count('state.units.push(') != 3: sys.exit('expected 3 death-spawn pushes')
block = block.replace('state.units.push(', '_deathSpawns.push(')
d.s = (d.s[:i] + "  const _deathSpawns = [];\n" + block +
       "    return isAlive;\n  });\n  if (_deathSpawns.length) state.units.push(..._deathSpawns);\n" +
       d.s[j + len("    return isAlive;\n  });\n"):])

# ---- fix: the Bot Deck button sat on top of the title on phone-width screens ----
# It was pinned to the top-left corner; now it takes its own line above the title.
d.sub("""  #botDeckBtn {
    position: absolute; top: 16px; left: 16px;""", """  #botDeckBtn {
    position: relative; top: auto; left: auto; align-self: flex-start; margin: 0 0 6px; flex-shrink: 0;""")

# ---- online multiplayer out ----
d.cut_line('<script src="https://cdnjs.cloudflare.com/ajax/libs/peerjs/1.5.4/peerjs.min.js"></script>')
d.cut_line('<button id="multiplayerBtn" onclick="openMpModal()">')
d.cut('<!-- Multiplayer Modal -->', '<button class="mp-btn-ghost" onclick="closeMpModal()">← Back to Deck</button>\n</div>\n')
d.cut('// ── Room code generation', 'const DLC_CLAIMED_KEY', keep_end=True)
d.cut('function openMpModal() {', 'function toggleMute() {', keep_end=True)

d.save(sys.argv[2])
