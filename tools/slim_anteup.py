#!/usr/bin/env python3
"""Ante Up for Press Play: no title screen (Press Play has its own loading
screen, so a run starts straight away) and plainer text.
usage: slim_anteup.py <in> <out>"""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from slimlib import Doc
d = Doc(sys.argv[1])

# ---- no title screen: a fresh visit deals straight in ----
d.cut('  if (state.overlay === "start") {\n    const overlay = document.createElement("div");', '    app.appendChild(overlay);\n  } else if (state.overlay === "cleared") {', keep_end=True)
d.sub('    app.appendChild(overlay);\n  } else if (state.overlay === "cleared") {', '  if (state.overlay === "cleared") {')
d.sub("""// Resume an in-progress run if one was saved; otherwise the default state
// (overlay: "start") renders the normal title screen.
loadGame();
render();""", """// Resume an in-progress run if one was saved; otherwise start a new one.
loadGame();
if (state.overlay === "start") startGame(); else render();""")
d.text([
 ["Use: stamps your leftmost card with an Azure Stamp", "Use: Azure Stamp on your leftmost card. If it's still in hand at round end, add a copy to your deck. Stacks with sleeves."],
 ["Use: stamps your leftmost card with a Crimson Stamp", "Use: Crimson Stamp on your leftmost card. It scores twice. Stacks with sleeves."],
 ["Use: stamps your leftmost card with a Gold Stamp", "Use: Gold Stamp on your leftmost card. Pays $3 when scored. Stacks with sleeves."],
 ["Grants +1 consumable slot while equipped.", "+1 item slot. Selling it removes the slot."],
 ["After 3 blinds played, when sold: duplicate", "Sell after 3 blinds to copy a random charm you own."],
 ["Gains X0.2 Mult per consecutive hand played without using", "X0.2 Mult for each hand in a row that isn't your most-played hand type."],
 ["Adds +2 Mult per card in your hand, but you lose $1", "+2 Mult per card in hand, but lose $1 for each unused play (max $4)."],
 ["You only get 1 hand to play this round", "Just 1 hand this round, but you only need Small Blind points."],
 ["Requires 75% more chips to beat this blind, and all Spade", "Needs 75% more chips, and Spades don't count."],
 ["Requires 50% more chips to beat this blind, hand size -1", "Needs 50% more chips. One less card in hand, and -1 Mult for each card you play."],
 ["Requires 50% more chips to beat this blind, and you cannot repeat", "Needs 50% more chips, and you can't play the same hand type twice."],
 ["Doubles the odds of all percent-chance charm and item effects", "Doubles the odds on every chance-based charm and item."],
 ["Adds +1 Mult for each consecutive hand played without discarding", "+1 Mult for every hand in a row without a discard. Discarding resets it."],
 ["Adds +2 Mult for each luck charm you own", "+2 Mult for each luck charm you own (Calculator, Camera, Horseshoe, Roulette, Coin)."],
 ["Use: your next played hand's Chips and Mult are averaged", "Use: your next hand's Chips and Mult both become their average."],
 ["Use: sleeves your leftmost card in a Tithe Sleeve", "Use: Tithe Sleeve on your leftmost card. It can't score, but discarding it pays $5."],
 ["Use: sleeves your leftmost card in a Molt Sleeve", "Use: Molt Sleeve on your leftmost card. Each round it hops to another card and leaves +1 Mult behind."],
 ["Use: sleeves your leftmost card in a Larva Sleeve", "Use: Larva Sleeve on your leftmost card. Keep it in hand to the end of a round and it copies itself into your deck."],
])
d.save(sys.argv[2])
