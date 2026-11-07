#!/usr/bin/env python3
"""Last Card for Press Play, made from the owner's "UNO Lite".

The rules engine is kept, but the game is made its own:
  - new name ("Last Card") and call ("Last card!") instead of UNO's,
  - new card face (upright rounded badge) and card back (striped, with the
    Last Card mark) instead of UNO's tilted white oval and red/yellow back,
  - new logo.
usage: slim_lastcard.py <in> <out>"""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from slimlib import Doc
d = Doc(sys.argv[1])

# ---- name and call ----
d.sub('<title>Uno</title>', '<title>Last Card</title>')
d.sub('<button class="btn" id="uno" hidden>UNO!</button>', '<button class="btn" id="uno" hidden>Last card!</button>')
d.sub('<div class="logo">UNO</div>', '<div class="logo">Last<br>Card</div>')
d.sub("""e.innerHTML='<div class="face"><div class="oval"><b>UNO</b></div></div>'""", """e.innerHTML='<div class="face"><div class="oval"><b>LAST<br>CARD</b></div></div>'""")
d.sub("if(p.hand.length===1&&k)say(k,'UNO!');", "if(p.hand.length===1&&k)say(k,'Last card!');")
d.sub("if(G.called||G.nb||G.ji)return toast('UNO!');toast('Forgot UNO! Draw 2')", "if(G.called||G.nb||G.ji)return toast('Last card!');toast('You forgot to call it. Draw 2')")
d.sub("toast(p.name+': UNO!')", "toast(p.name+': Last card!')")
d.sub("toast(p.name+' forgot UNO')", "toast(p.name+' forgot to call it')")
d.sub("$('#uno').hidden=true;$('#uno').classList.remove('hot');toast('UNO!')", "$('#uno').hidden=true;$('#uno').classList.remove('hot');toast('Last card!')")
d.sub("{n:'Say UNO',h:'Tap the moment UNO appears'", "{n:'Call it',h:'Tap the moment LAST CARD shows up'")
d.sub("e.textContent='UNO!'", "e.textContent='LAST CARD!'")

# ---- card face, back and logo ----
d.sub(".oval{position:absolute;left:50%;top:50%;width:86%;height:64%;transform:translate(-50%,-50%) rotate(-28deg);background:#fff;border-radius:50%}",
      ".oval{position:absolute;left:50%;top:50%;width:68%;aspect-ratio:1;height:auto;transform:translate(-50%,-50%);background:#fff;border-radius:32%;box-shadow:0 0 0 calc(var(--cw)*.03) #ffffff55,inset 0 -3px 0 #0001}"
      ".face{background:radial-gradient(circle at 25% 15%,#ffffff38,transparent 50%),linear-gradient(160deg,transparent 60%,#0000001f),var(--cc)}")
d.sub(".oval b{position:absolute;inset:0;display:grid;place-items:center;transform:rotate(28deg);", ".oval b{position:absolute;inset:0;display:grid;place-items:center;")
d.sub(".back .oval{background:var(--r)}.back .oval b{color:var(--y);font-size:calc(var(--cw)*.3);text-shadow:2px 2px 0 #000}",
      ".back .face{background:repeating-linear-gradient(135deg,#1d2132 0 6px,#262b40 6px 12px)}"
      ".back .oval{width:74%;border-radius:26%;background:linear-gradient(135deg,var(--r),var(--y) 34%,var(--g) 66%,var(--b));box-shadow:0 0 0 2px #ffffff40}"
      ".back .oval b{color:#fff;font-size:calc(var(--cw)*.15);line-height:1.05;text-align:center;letter-spacing:.5px;text-shadow:0 2px 0 #0006}")
d.sub(".fan>i{position:absolute;bottom:0;width:var(--mw);height:var(--mh);border-radius:4px;background:radial-gradient(ellipse at center,var(--r) 0 28%,var(--k) 31%);",
      ".fan>i{position:absolute;bottom:0;width:var(--mw);height:var(--mh);border-radius:4px;background:linear-gradient(135deg,var(--r),var(--y) 34%,var(--g) 66%,var(--b)) center/60% 44% no-repeat,repeating-linear-gradient(135deg,#1d2132 0 3px,#262b40 3px 6px);")
d.sub(".logo{width:150px;margin:-6px auto 14px;padding:6px 0 0;text-align:center;font:400 62px/1 'Lilita One',sans-serif;color:var(--y);background:var(--r);border-radius:50%;transform:rotate(-8deg);text-shadow:3px 3px 0 #000;border:5px solid #fff;box-shadow:0 8px 0 #0005}",
      ".logo{margin:0 auto 14px;text-align:center;font:400 44px/.95 'Lilita One',sans-serif;letter-spacing:1px;background:linear-gradient(135deg,var(--r),var(--y) 34%,var(--g) 66%,var(--b));-webkit-background-clip:text;background-clip:text;color:transparent;filter:drop-shadow(0 3px 0 #0006)}")

d.save(sys.argv[2])
