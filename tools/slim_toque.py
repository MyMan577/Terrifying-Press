#!/usr/bin/env python3
"""Slim Toque & Spear for Press Play: no Guardian Trials, no Transfer Save
codes (Press Play's own backup covers saves). usage: slim_toque.py <in> <out>"""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from slimlib import Doc
d = Doc(sys.argv[1])

# ---- Guardian Trials ----
d.cut_line('id="villageGuardianBtn">Guardian Trials</div>')
d.cut('  <div id="guardianSelectPanel" class="hidden">', '    <div class="goBtn shopClose" id="guardianSelectCloseBtn">Back</div>\n    </div>\n  </div>\n')
d.cut("const guardianSelectPanel = document.getElementById('guardianSelectPanel');", "const guardianSelectCloseBtn = document.getElementById('guardianSelectCloseBtn');\n")
d.cut('// Guardian Trials picker - always shown', "function chooseGuardianTrial(){\n  return new Promise(resolve=>{ renderGuardianSelect(resolve); });\n}\n")
d.cut_line("const villageGuardianBtn = document.getElementById('villageGuardianBtn');")
d.cut("villageGuardianBtn.addEventListener('click', ()=>{", "res('guardian'); }\n});\n")
d.sub("""    if(choice === 'guardian'){
      villageInteractive = false;""", """    if(false){
      villageInteractive = false;""")
d.cut("    if(false){\n      villageInteractive = false;", "      continue;\n    }\n")
d.sub("""  let choice, pickedGuardianId = null;""", """  let choice;""")
d.sub("""  } else if(choice === 'guardian'){
    startGuardianFight(pickedGuardianId);
  } else {""", """  } else {""")
d.cut('// A Guardian Trial: full normal battle rules', "function continueAfterEnd(){", keep_end=True)
d.sub("""  } else if(state.inGuardianFight){
    startGuardianFight(state.currentGuardianId); // retry the same Guardian Trial
""", "")
d.cut("    // Guardian Trials are handled entirely by endGuardianFight", "      return true;\n    }\n")
# the three bosses: their battle sprites and registry entries (the Great Bison
# spirit drawing stays: the Ancient Warden fusion reuses it)
d.cut('// The Great Bison - a Guardian Trial boss.', 'function drawGreatBisonSpirit(t){', keep_end=True)
d.cut('// The Cinderhorn Elder - Guardian Trial boss', 'function drawEnemyLynx(t){', keep_end=True)
d.cut('\nregisterGuardian({\n  id: ', '\n// ---- Generic (stage-less) fusion', keep_end=True)  # all three registrations

# ---- Transfer Save ----
d.cut('    <div id="saveActions" class="hidden">', '    </div>\n')
d.cut('  <div id="transferPanel" class="hidden">', '    <div class="goBtn shopClose" id="transferCloseBtn">Back</div>\n    </div>\n  </div>\n')
d.cut_line("const saveActions = document.getElementById('saveActions');")
d.cut("const transferSaveBtn = document.getElementById('transferSaveBtn');", "const transferCloseBtn = document.getElementById('transferCloseBtn');\n")
d.cut('// ---------- Transfer Save: export/import', "transferCloseBtn.addEventListener('touchstart', e=>{ e.preventDefault(); closeTransferPanel(); }, {passive:false});\n")
d.cut_line("saveActions.classList.", count=2)
d.sub("textarea, input, button, #transferPanel, #rebirthPanel", "textarea, input, button, #rebirthPanel")

# ---- plainer text ----
d.text([
 ["The fire is warm and the line has held a while longer.", "The fire is warm. Rest up, then tap the butcher, the forge or your tent to trade."],
 ["Mementos won from finishing off a foe", "Trophies come from finishing a foe, not sparing it. Use them here."],
 ["Kanata lets go of everything he has carried", "Kanata lets go of everything and starts again, keeping only what he has learned."],
 ["All story progress and chapter unlocks, Kanata", "Story progress, Kanata's level, spirit levels (not the spirits), all gold, and everything bought at the butcher and forge."],
 ["Every spirit you've ever bonded with stays", "Every spirit stays, at Lv.1. You keep your Mastery Points and earn more: 1 per 10 spirit levels past Lv.1, and 1 per 10,000 gold you carry."],
 ["Permanent unlocks bought with Mastery Points", "Permanent unlocks bought with Mastery Points. They never reset."],
 ["Choose an Area you've fought in, then a creature", "Pick an area and a creature that lives there. For 5 minutes it shows up 70% of the time. Costs half your gold (at least 5,000g)."],
 ["Choose two bonded spirits to fuse into something stronger.", "Pick two spirits to fuse into a stronger one."],
 ["Curated pairings only - unlisted pairs still fuse", "Only listed pairs are shown. Other pairs still fuse into a borrowed shape."],
 ["Pick where Kanata will hunt.", "Pick where Kanata hunts. Tougher ground, more XP."],
 ["Passive. Every gold, XP, or rare-encounter buff granted by a trophy", "Passive. Trophy buffs last 5 real minutes instead of a number of battles."],
 ["Passive. Raises the base number of trophy/item rolls", "Passive. 5 trophy rolls per kill instead of 3, and rare-encounter buffs stack up to 12 instead of 8."],
 ["Double-edged. Passive. Doubles gold from every source", "Passive. Double gold from everything, but enemies hit 50% harder and have 50% more HP."],
 ["Passive. The Golden Beaver shows up roughly 75% more often", "Passive. The Golden Beaver shows up 75% more and never runs away."],
 ["Passive. Invasive Species costs no gold to cast", "Passive. Invasive Species is free and lasts 10 minutes."],
 ["Passive. Every future rebirth grants 25% more Mastery Points", "Passive. +25% Mastery Points from every rebirth."],
 ["Passive. Stacks with Deeper Roots I", "Passive. With Deeper Roots I, +60% Mastery Points from every rebirth."],
 ["Unlocks a second spirit slot in the Spirit Den.", "A second spirit slot. Every Spirit Surge adds half that spirit's damage and its special."],
 ["Unlocks a village action: for 50% of your gold", "Unlocks Invasive Species in the village: pay half your gold (at least 5,000g) to make a creature common in an area for 5 minutes."],
])

d.save(sys.argv[2])
