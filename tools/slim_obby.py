#!/usr/bin/env python3
"""Build the slim Obby Builder bundled in Press Play.

Takes index.html from the MyMan577/Obby-Builder repo and writes a cut-down
copy: removes the gauntlet, Aibot/Architect, skin/omen/godly/prestige/
singularity boxes, exotic and alley characters, Y-Saur and K-Puffball.
Keeps the 20 starters, the Silver/Gold/Retro capsules, the special characters
(M Man, L-Brother, P-Princess, Chameleon, Grand Pebble), the cosmetic mystery
boxes, the alley, the arcade, story, speedruns and the builder.

usage: slim_obby.py <upstream index.html> <output index.html>
"""
import re, sys

src = open(sys.argv[1], encoding='utf-8').read()
lines = src.split('\n')
problems = []

def find_line(marker, start=0):
    for i in range(start, len(lines)):
        if lines[i] is not None and marker in lines[i]:
            return i
    return -1

def cut(a, b):
    """Blank lines a..b inclusive (kept as None so indexes stay stable)."""
    for i in range(a, b + 1):
        lines[i] = None

def cut_iife(marker):
    """Remove the column-0 IIFE that contains marker."""
    i = find_line(marker)
    if i < 0: problems.append('iife marker not found: ' + marker); return
    a = i
    while a >= 0 and not (lines[a] is not None and re.match(r'^\((function|\(\) =>)', lines[a])): a -= 1
    b = i
    while b < len(lines) and not (lines[b] is not None and re.match(r'^\}\)\(\);?\s*$', lines[b])): b += 1
    cut(a, b)

def cut_tag_block(marker, tag):
    """Remove the whole <script>/<style> element that contains marker."""
    i = find_line(marker)
    if i < 0: problems.append('%s marker not found: %s' % (tag, marker)); return
    a = i
    while '<' + tag not in (lines[a] or ''): a -= 1
    b = i
    while '</' + tag + '>' not in (lines[b] or ''): b += 1
    cut(a, b)

# Grand Pebble stays, but its definition sits inside the godly-character code
# that gets cut. Lift it out now and put it back in Grand Pebble's own script.
_gp = re.search(r"\n  const GRAND_PEBBLE = \{.*?\n  \};\n", src, re.S)
if not _gp: problems.append('Grand Pebble definition not found')
GP_DEF = _gp.group(0).replace('const GRAND_PEBBLE =', 'window.GRAND_PEBBLE_DEF =') if _gp else ''

# --- whole <script>/<style> elements -----------------------------------
cut_tag_block("@keyframes architectPulse", 'style')          # Architect styles
cut_tag_block("const CHAR_ID = 'arch_architect';", 'script')  # Architect + Aibot (AI chat)
cut_tag_block("#gauntletRoot {", 'style')                     # Gauntlet styles
cut_tag_block("gt-start-btn", 'script')                       # Gauntlet mode
cut_tag_block("nmbox-coll-tabs{", 'script')                   # Godly relic boxes + godly chars
cut_tag_block("const YSAUR_ID = 'cb_ysaur_godly';", 'script') # Y-Saur
cut_tag_block("const KPUFF_ID = 'cb_kpuffball_ref';", 'script')  # K-Puffball

# gauntlet HUD/overlay markup sits loose between its style and script
i = find_line('<div id="gt-hud">')
if i >= 0:
    a = i
    while lines[a - 1] is not None and lines[a - 1].strip() == '': a -= 1
    b = i
    while b < len(lines) and lines[b] is not None and '<script' not in lines[b]: b += 1
    cut(a, b - 1)

# --- top-level IIFEs inside the main script ------------------------------
for m in ["const SBOX_TIERS = [",          # skin boxes
          "const OBOX_TIERS",              # omen boxes
          "const PRESTIGE_PRISMATIC_ITEMS",# prestige shop
          "const ASTRAL_DRIFTER",          # godly characters
          "let drifterAttackEndlag",       # godly character moves
          "const PRESTIGE_CHARS",          # prestige characters
          "const REGULAR_PRESTIGE_ITEMS",  # prestige equip
          "const SINGULARITY_BOX_ID",      # singularity crate
          "const ALLEY_CHAR_IDS",          # alley/exotic characters
          "const COINS_PER_TICKET",        # alley tickets (only bought exotics)
          "const VASKAR_ID"]:              # exotic warriors
    cut_iife(m)

out = '\n'.join(l for l in lines if l is not None)

_gpi = out.find("  window.unlockGrandPebble = function()")
if _gpi < 0: problems.append('Grand Pebble script not found')
else: out = out[:_gpi] + GP_DEF.lstrip('\n') + out[_gpi:]

# In the full game M Man is unlocked for everyone from the start (another
# character's code registered him). That code is cut, so register him here.
if out.count("      if (saved.includes(MARIO_ID)) {") != 1: problems.append('M Man unlock not found')
out = out.replace("      if (saved.includes(MARIO_ID)) {", "      if (true) { // free from the start, as in the full game")

# --- HTML sections --------------------------------------------------------
def cut_element(html, start_pat):
    m = re.search(start_pat, html)
    if not m:
        problems.append('element not found: ' + start_pat); return html
    a = html.rfind('<', 0, m.end())
    tag = re.match(r'<(\w+)', html[a:]).group(1)
    depth, pos = 0, a
    rx = re.compile(r'<(/?)%s\b[^>]*?(/?)>' % tag)
    for t in rx.finditer(html, a):
        if t.group(2): continue
        depth += -1 if t.group(1) else 1
        if depth == 0:
            return html[:a] + html[t.end():]
    problems.append('unclosed element: ' + start_pat); return html

for sid in ['newMysteryBoxSection', 'skinBoxSection', 'omenBoxSection',
            'singularityBoxSection', 'prestigeShopSection', 'prestigeEquipSection',
            'prestigeBoxSection', 'gauntletSection']:
    out = cut_element(out, r'<div [^>]*id="%s"' % sid)
out = re.sub(r'\s*<button class="stab" data-stab="gauntlet">.*?</button>', '', out)
# --- capsules: Silver, Gold, Retro only ------------------------------------
out = re.sub(r"\n\s*\{ id:'cb_prismatic',.*?color:'#ff70d0' \},", '', out, count=1, flags=re.S)
for cid in ['cb_dawnblade', 'cb_abyssal', 'cb_riftwalker', 'cb_ironclad', 'cb_stormcaller']:
    out, n = re.subn(r"\n\s*\{ id:'%s',.*?\n\s*color:'#[0-9a-f]+' \}," % cid, '', out, count=1, flags=re.S)
    if not n: problems.append('capsule char not found: ' + cid)

# --- no service worker inside the app ------------------------------------
out = out.replace("navigator.serviceWorker.register('sw.js')", "Promise.reject('no sw in Press Play')")

# --- text rewrites ---------------------------------------------------------
# Each entry is [start of the original text, new text]. The whole text node
# (HTML) or string literal (JS) that starts with that prefix is replaced.
import json, os
here = os.path.dirname(os.path.abspath(__file__))
for prefix, new in json.load(open(os.path.join(here, 'slim_obby_text.json'), encoding='utf-8')):
    count = 0
    pos = 0
    while True:
        i = out.find(prefix, pos)
        if i < 0: break
        before = out[i - 1]
        if before == "'":
            j = i
            while True:
                j = out.index("'", j)
                if out[j - 1] != '\\': break
                j += 1
            rep = new.replace("'", "\\'")
        else:
            j = out.index('<', i)
            rep = new
        out = out[:i] + rep + out[j:]
        pos = i + len(rep)
        count += 1
    if not count:
        problems.append('text not found: ' + prefix[:60])

open(sys.argv[2], 'w', encoding='utf-8').write(out)
print('lines: %d -> %d' % (src.count('\n'), out.count('\n')))
for p in problems: print('WARN', p)
