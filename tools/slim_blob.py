#!/usr/bin/env python3
"""Blob Barrage for Press Play, made from the owner's "Wormz".

The turn-based artillery engine is kept, but the game is made its own
instead of a copy of Worms:
  - the fighters are jelly blobs (mint body, two eyes, a shine) instead of
    pink worms, and every "worm" in the text says "blob",
  - the Worms signature weapons get new names, and the ones with Worms
    sprites get new art:
      Sheep -> Wind-up beetle         Old woman -> Big beetle
      Concrete moose -> Bouncing anvil Holy grenade -> Thunder grenade
      Banana bomb -> Popcorn bomb      Mail strike -> Parcel drop
      Ming vase -> Clay pot            Scales of justice -> Even split
      Armageddon -> Skyfall            Fire punch -> Flame uppercut
      Girder -> Steel beam
  - new name and logo.
usage: slim_blob.py <in> <out>"""
import sys, os, re
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from slimlib import Doc
d = Doc(sys.argv[1])
BLOB = '#8fe3b0'

# ---- name ----
d.sub('<title>Wormz</title>', '<title>Blob Barrage</title>')
d.sub('<i class="wm"></i>Wormz</b>', '<i class="wm"></i>Blob Barrage</b>')

# ---- worms -> blobs (all of these are visible text, checked by hand) ----
n = len(re.findall(r'\b[Ww]orms?\b', d.s))
if n != 23: sys.exit('expected 23 worm words, found %d' % n)
d.s = re.sub(r'\bworms\b', 'blobs', d.s)
d.s = re.sub(r'\bworm\b', 'blob', d.s)
d.s = re.sub(r'\bWorms\b', 'Blobs', d.s)
d.sub("'Wormy', 'Wiggles',", "'Bloop', 'Wobbles',")
d.sub("'wormy': 'coward', 'wiggles': 'coward'", "'bloop': 'coward', 'wobbles': 'coward'")

# ---- the fighter: a jelly blob ----
d.s = d.s.replace('#f7a8b8', BLOB)          # body and little hands, everywhere
d.sub("X.fillStyle='#fff';X.beginPath();X.arc(bx+w.dir*rx*.5,hy+2,2,0,7);X.fill();X.fillStyle='#000';X.beginPath();X.arc(bx+w.dir*(rx*.5+.5),hy+2,1,0,7);X.fill();",
      "X.fillStyle='#ffffff70';X.beginPath();X.ellipse(bx-w.dir*rx*.35,by-ry*.4,rx*.3,ry*.2,0,0,7);X.fill();"
      "for(const ex of[.12,.62]){X.fillStyle='#fff';X.beginPath();X.arc(bx+w.dir*rx*ex,hy+2,1.7,0,7);X.fill();X.fillStyle='#16202c';X.beginPath();X.arc(bx+w.dir*(rx*ex+.5),hy+2.2,.85,0,7);X.fill()}")

# ---- weapon names and text ----
d.sub("{n:'Holy grenade',c:'hg',u:'uh',d:'Throw like a grenade. Massive blast'}",
      "{n:'Thunder grenade',c:'hg',u:'uh',d:'Throw it like a grenade. Huge blast'}")
d.sub("{n:'Banana bomb',c:'bn',u:'un',d:'Grenade that splits into 5 bomblets'}",
      "{n:'Popcorn bomb',c:'bn',u:'un',d:'Pops into 5 smaller bombs'}")
d.text([
 ["Walks forward over hills, hops up ledges", "A wind-up beetle that marches forward, climbing ledges and hopping gaps. Blows up after about 5s, or tap Fire to set it off. Find it in crates."],
 ["Sets down a slow, shuffling old woman", "A big, slow beetle that crawls forward and then blows up hard (about 60 damage). Tap Fire to set it off early. Rare crate find."],
 ["Tap the map. A giant concrete moose drops", "Tap the map. A huge anvil drops from the sky, bouncing and digging deeper each time until it sinks. Epic crate find."],
 ["Tap the map to pick a target. A cargo plane scatters 8 parcel bombs", "Tap the map. A plane drops 8 parcels that bounce and go off at random."],
 ["Throw it like a grenade. It shatters into a dozen bouncing shards", "Throw it like a grenade. It smashes into a dozen bouncing shards that each go off. Rare crate find."],
 ["Every living blob on the map ends up with the same health", "Every blob on the map gets the same health: the average of all of them. Ends your turn. Epic crate find."],
 ["Calls down a storm of about 45 flaming meteors", "Around 45 flaming meteors rain on the whole map, yours included, so dig in. Mystery crates only, and very rare."],
 ["Flaming uppercut. You leap up and launch any blob", "Leap up in flames and launch anyone in reach into the air (30 damage). Starts with 1."],
 ["Tap the map to place a girder.", "Tap the map to place a steel beam. Aim tilts it. Doesn't end your turn. Starts with 2."],
 ["Tap the map. A red maple bomber drops 9 bombs", "Tap the map. A bomber drops 9 bombs in a tight line on that spot. Each one bounces a few times, exploding on every landing."],
])
for old, new in [("n:'Sheep'", "n:'Wind-up beetle'"), ("n:'Old woman'", "n:'Big beetle'"), ("n:'Concrete moose'", "n:'Bouncing anvil'"),
                 ("n:'Mail strike'", "n:'Parcel drop'"), ("n:'Ming vase'", "n:'Clay pot'"), ("n:'Scales of justice'", "n:'Even split'"),
                 ("n:'Armageddon'", "n:'Skyfall'"), ("n:'Fire punch'", "n:'Flame uppercut'"), ("n:'Girder'", "n:'Steel beam'")]:
    d.sub(old, new)
d.sub("s:'Girder '+w.gs+'/3'", "s:'Beam '+w.gs+'/3'")
d.sub("'Place girder '+(m.gs+1)+'/3'", "'Place beam '+(m.gs+1)+'/3'")

d.s = d.s.replace("s:'Moose incoming!'", "s:'Anvil incoming!'")
d.sub("s:'ARMAGEDDON!'", "s:'SKYFALL!'")
d.sub("s:'Justice!'", "s:'All even!'")
d.sub("s:ai?'Baa!':'Tap Fire to detonate'", "s:ai?'Tick tick!':'Tap Fire to set it off'")

# ---- fix: Setup button greyed out during a match ----
# It was disabled every frame unless the match was over, so it looked broken.
# Opening setup already pauses the match, Cancel resumes it, and Start match
# begins a new match with the new settings, so it is safe to allow any time.
d.sub("draw();syncW();mSet.disabled=state!='over';requestAnimationFrame(L)", "draw();syncW();requestAnimationFrame(L)")
d.sub("Tap a blob to switch it between Human and Bot. Options lock once a match starts.", "Tap a blob to switch it between Human and Bot. Start match begins a new match with these settings; Cancel goes back to this one.")

# ---- in-world art for the renamed weapons ----
BEETLE = ("const sw=Math.sin(p.age*.45)*1.6;X.fillStyle='#22262e';[[-4,sw],[-1,-sw],[2,sw],[5,-sw]].forEach(l=>X.fillRect(l[0]-.9+l[1]*.5,-3,1.8,3));"
          "X.fillStyle=SHELL;X.beginPath();X.ellipse(0,-4.5,6.6,5,0,Math.PI,0);X.closePath();X.fill();"
          "X.strokeStyle='#0004';X.lineWidth=.8;X.beginPath();X.moveTo(0,-9.4);X.lineTo(0,-4.5);X.stroke();"
          "X.fillStyle='#ffffff55';X.beginPath();X.ellipse(-2.6,-7.2,2,1,-.3,0,7);X.fill();"
          "X.fillStyle='#22262e';X.beginPath();X.arc(7,-5,2.6,0,7);X.fill();X.fillStyle='#fff';X.fillRect(7.6,-6.2,1.1,1.1);"
          "X.fillStyle='#d8b04a';X.fillRect(-.6,-13.4,1.2,4.2);X.beginPath();X.ellipse(-2.2,-13.8,1.9,1.2,0,0,7);X.fill();X.beginPath();X.ellipse(2.2,-13.8,1.9,1.2,0,0,7);X.fill();")
d.sub("if(p.sheep){X.scale(p.d,1);const sw=Math.sin(p.age*.45)*1.6;X.fillStyle='#2a2a2a';[[-4,sw],[-1,-sw],[2,sw],[5,-sw]].forEach(l=>X.fillRect(l[0]-.9+l[1]*.5,-3,1.8,3));X.fillStyle='#f4f4f4';[[0,-6,5.6],[-3.4,-7.4,3.8],[3,-8,3.8],[0,-9.4,3.6],[-5,-5,2.8]].forEach(c=>{X.beginPath();X.arc(c[0],c[1],c[2],0,7);X.fill()});X.fillStyle='#2a2a2a';X.beginPath();X.ellipse(7,-6.5,2.8,2.3,0,0,7);X.fill();X.fillStyle='#fff';X.fillRect(7.4,-7.6,1.2,1.2);X.fillStyle='#2a2a2a';X.beginPath();X.ellipse(5.2,-9,1.2,.7,.6,0,7);X.fill();",
      "if(p.sheep){X.scale(p.d,1);const SHELL='#3fae74';" + BEETLE)
d.sub("if(p.ow){X.scale(p.d,1);const sw=Math.sin(p.age*.3)*1.2;X.fillStyle='#4a3a30';X.fillRect(-2+sw*.4,-3,1.8,3);X.fillRect(1-sw*.4,-3,1.8,3);X.fillStyle='#7a4aa8';X.beginPath();X.moveTo(-4,-3);X.lineTo(-2.4,-11);X.lineTo(2.4,-11);X.lineTo(4,-3);X.closePath();X.fill();X.fillStyle='#e0a98a';X.beginPath();X.arc(.4,-13.2,3,0,7);X.fill();X.fillStyle='#eee';X.beginPath();X.arc(-.2,-16,2.2,0,7);X.fill();X.fillStyle='#8a5a2a';X.fillRect(3.4,-8+sw*.3,3.2,3);",
      "if(p.ow){X.scale(p.d*1.45,1.45);const SHELL='#7a4aa8';" + BEETLE.replace('p.age*.45', 'p.age*.3'))
d.sub("else if(p.cm){X.scale(2,2);X.fillStyle='#9aa0a6';X.strokeStyle='#5d6168';X.lineWidth=.8;X.fillRect(-12,-6,20,10);X.strokeRect(-12,-6,20,10);X.fillRect(-11,4,3,6);X.fillRect(-4,4,3,6);X.fillRect(2,4,3,6);X.fillRect(5,4,3,6);X.beginPath();X.moveTo(5,-6);X.lineTo(9,-12);X.lineTo(15,-10);X.lineTo(16,-6);X.lineTo(10,-5);X.closePath();X.fill();X.stroke();X.beginPath();X.moveTo(9,-12);X.lineTo(7,-17);X.lineTo(10,-15);X.lineTo(12,-19);X.lineTo(13,-15);X.lineTo(16,-17);X.lineTo(14,-11);X.stroke();X.fillStyle='#333';X.fillRect(12,-9,1.2,1.2)}",
      "else if(p.cm){X.scale(2,2);X.fillStyle='#5f666f';X.strokeStyle='#33383f';X.lineWidth=.8;X.beginPath();X.moveTo(-13,-9);X.lineTo(9,-9);X.quadraticCurveTo(18,-8,19,-5);X.quadraticCurveTo(12,-4.5,9,-3);X.lineTo(4,-3);X.lineTo(5,3);X.lineTo(9,3);X.lineTo(9,9);X.lineTo(-13,9);X.lineTo(-13,3);X.lineTo(-9,3);X.lineTo(-8,-3);X.lineTo(-13,-3);X.closePath();X.fill();X.stroke();X.fillStyle='#ffffff30';X.fillRect(-12,-8.4,20,1.6)}")
d.sub("if(p.mv){X.rotate(p.x*.05);X.fillStyle='#3d78d0';", "if(p.mv){X.rotate(p.x*.05);X.fillStyle='#c56a3a';")
d.sub("else if(p.g==5){X.fillStyle='#e0b030';X.beginPath();X.arc(0,0,5,0,7);X.fill();X.fillStyle='#fff3a0';X.beginPath();X.arc(-1.5,-1.5,2,0,7);X.fill();X.fillStyle='#7a3b0a';X.fillRect(-.8,-3.5,1.6,7);X.fillRect(-3,-1.2,6,1.6);X.fillStyle='#bbb';X.fillRect(-1.5,-7,3,2.5)}",
      "else if(p.g==5){X.fillStyle='#4b5be0';X.beginPath();X.arc(0,0,5,0,7);X.fill();X.fillStyle='#aab6ff';X.beginPath();X.arc(-1.6,-1.6,1.8,0,7);X.fill();X.fillStyle='#ffe45c';X.beginPath();X.moveTo(.8,-3.8);X.lineTo(-1.8,.4);X.lineTo(0,.4);X.lineTo(-.8,3.8);X.lineTo(1.9,-.6);X.lineTo(.1,-.6);X.closePath();X.fill();X.fillStyle='#bbb';X.fillRect(-1.5,-7,3,2.5)}")
d.sub("else{const r=p.g==6?6:4;X.strokeStyle='#f3d33a';X.lineWidth=p.g==6?4:2.6;X.lineCap='round';X.beginPath();X.arc(0,-2,r,.3,Math.PI-.3);X.stroke();X.strokeStyle='#5a4a1a';X.lineWidth=1.2;X.beginPath();X.arc(0,-2,r,.3,.5);X.stroke()}}",
      "else{const k=p.g==6?1.5:1;X.scale(k,k);X.fillStyle='#fff7e0';for(const c of[[-2,0,2.6],[1.8,-.6,2.6],[0,-2.6,2.4],[.2,1.8,2.2]]){X.beginPath();X.arc(c[0],c[1],c[2],0,7);X.fill()}X.fillStyle='#f3c93a';X.beginPath();X.arc(.6,.2,1.1,0,7);X.fill();X.beginPath();X.arc(-1.8,-.8,.8,0,7);X.fill()}}")

# ---- menu icons for the renamed weapons ----
CSS = {
 '.wm::before': ".wm::before{content:'';position:absolute;left:1px;top:2px;width:24px;height:14px;border-radius:12px 12px 6px 6px;background:radial-gradient(ellipse at 35% 30%,#ffffff90 0 18%,transparent 30%),linear-gradient(#a8f0c6,#58c98d)}",
 '.wm::after': ".wm::after{content:'';position:absolute;left:9px;top:6px;width:12px;height:5px;background:radial-gradient(circle at 2px 2.5px,#16202c 0 1.2px,#fff 1.4px 2.4px,transparent 2.6px),radial-gradient(circle at 9px 2.5px,#16202c 0 1.2px,#fff 1.4px 2.4px,transparent 2.6px)}",
 '.shp::before': ".shp::before{left:6px;top:8px;width:24px;height:15px;border-radius:12px 12px 2px 2px;background:radial-gradient(ellipse at 35% 30%,#ffffff70 0 15%,transparent 30%),linear-gradient(90deg,#2f8f5c,#4cc486 50%,#2f8f5c);box-shadow:inset -1px 0 0 #0003}",
 '.shp::after': ".shp::after{left:26px;top:13px;width:9px;height:9px;border-radius:50%;background:radial-gradient(circle at 65% 35%,#fff 0 1.2px,transparent 1.6px),#22262e}",
 '.shp b': ".shp b{left:9px;top:22px;width:3px;height:5px;background:#22262e;box-shadow:5px 0 0 #22262e,10px 0 0 #22262e,15px 0 0 #22262e}",
 '.olw::before': ".olw::before{left:4px;top:6px;width:28px;height:18px;border-radius:14px 14px 2px 2px;background:radial-gradient(ellipse at 35% 30%,#ffffff60 0 15%,transparent 30%),linear-gradient(90deg,#5a2f88,#9a64cc 50%,#5a2f88)}",
 '.olw::after': ".olw::after{left:29px;top:12px;width:10px;height:10px;border-radius:50%;background:radial-gradient(circle at 65% 35%,#fff 0 1.2px,transparent 1.6px),#22262e}",
 '.olw b': ".olw b{left:16px;top:0;width:3px;height:7px;background:#d8b04a;box-shadow:-3px -1px 0 0 #d8b04a,3px -1px 0 0 #d8b04a}",
 '.mse::before': ".mse::before{left:2px;top:7px;width:34px;height:20px;background:linear-gradient(#8a919a,#4f555d);clip-path:polygon(0 0,62% 0,100% 15%,62% 32%,48% 32%,52% 66%,64% 66%,64% 100%,0 100%,0 66%,14% 66%,18% 32%,0 32%)}",
 '.mse::after': ".mse::after{left:3px;top:7px;width:20px;height:2px;background:#ffffff50}",
 '.mse b': ".mse b{display:none}",
 '.hg::before': ".hg::before{left:11px;top:8px;width:19px;height:19px;border-radius:50%;background:radial-gradient(circle at 35% 30%,#aab6ff,#4b5be0 55%,#24308a)}",
 '.hg b': ".hg b{left:16px;top:11px;width:9px;height:13px;background:#ffe45c;clip-path:polygon(60% 0,0 58%,42% 58%,30% 100%,100% 38%,58% 38%)}",
 '.hg b::before': ".hg b::before{display:none}",
 '.bn': ".bn{transform:none}",
 '.bn::before': ".bn::before{left:6px;top:8px;width:26px;height:20px;background:radial-gradient(circle at 7px 12px,#fff7e0 0 6px,transparent 6.5px),radial-gradient(circle at 18px 11px,#fff7e0 0 6.5px,transparent 7px),radial-gradient(circle at 13px 6px,#fff7e0 0 6px,transparent 6.5px),radial-gradient(circle at 14px 14px,#f3c93a 0 2px,transparent 2.5px)}",
 '.bn::after': ".bn::after{display:none}",
 '.bn b': ".bn b{display:none}",
 '.mng::before': ".mng::before{left:11px;top:5px;width:18px;height:25px;background:linear-gradient(90deg,#9a4a24,#d9824e,#9a4a24);clip-path:polygon(30% 0,70% 0,70% 18%,100% 45%,85% 85%,65% 100%,35% 100%,15% 85%,0 45%,30% 18%)}",
 '.scl::before': ".scl::before{left:7px;top:10px;width:26px;height:4px;border-radius:2px;background:#d8b04a;box-shadow:0 9px 0 #d8b04a}",
 '.scl::after': ".scl::after{display:none}",
 '.scl b': ".scl b{display:none}",
 '.gd::before': ".gd::before{left:2px;top:10px;width:36px;height:9px;background:linear-gradient(#b8c0cc,#6f7884);border:1px solid #3e444d;box-sizing:border-box;box-shadow:inset 0 2px 0 #ffffff60}",
}
for sel, rule in CSS.items():
    m = re.search(r'^' + re.escape(sel) + r'\{[^}]*\}', d.s, re.M)
    if not m: sys.exit('css rule not found: ' + sel)
    d.s = d.s[:m.start()] + rule + d.s[m.end():]

# ---- fix: flamethrower hitbox ----
# Damage used an invisible 82px cone checked every 4 frames, while the visible
# flames fly up to ~120px and pass through walls. Now the flame puffs are the
# hitbox: each puff burns any blob it touches (3 dmg, at most every 4 frames per
# blob, same rate as before) and dies when it hits terrain.
OLD_FT_START = "function stepFt(){fts.forEach(f=>{const w=f.w;f.t--;if(w.hp<=0){f.t=0;return}"
i = d.s.index(OLD_FT_START); j = d.s.index("fts=fts.filter(f=>f.t>0)}", i) + len("fts=fts.filter(f=>f.t>0)}")
old = d.s[i:j]
assert "if(f.t%4==0){teams.forEach(t=>t.w.forEach(v=>{if(v===w||v.hp<=0)return;const dx=v.x-ox,dy=v.y-5-oy,d=Math.hypot(dx,dy);if(d>82||d<1)return;" in old
NEW_FT = ("function stepFt(){fts.forEach(f=>{const w=f.w;f.t--;f.ps=f.ps||[];f.hc=f.hc||new Map();if(w.hp<=0)f.t=0;"
 "const a=f.a*Math.PI/180,cx=Math.cos(a)*f.d,cy=-Math.sin(a),ox=w.x+cx*8,oy=w.y-6+cy*8;\n"
 " if(f.t>0)for(let i=0;i<3;i++){const sp=3.2+R()*2.4,sa=(R()-.5)*.34,c2=Math.cos(sa),s2=Math.sin(sa),q={x:ox,y:oy,vx:(cx*c2-cy*s2)*sp,vy:(cx*s2+cy*c2)*sp-.1,gr:-.01,l:13+R()*9,c:['#ff4a1c','#ff8a1f','#ffd23a'][i],r:2+R()*3.2};fx.push(q);f.ps.push(q)}\n"
 " f.ps=f.ps.filter(q=>{if(q.l<=0)return false;if(solid(q.x,q.y)){q.l=0;return false}\n"
 "  teams.forEach(t=>t.w.forEach(v=>{if(v===w||v.hp<=0)return;const dx=v.x-q.x,dy=v.y-5-q.y,rr=6+q.r*.6;if(dx*dx+dy*dy>rr*rr)return;if(fr-(f.hc.get(v)??-99)<4)return;f.hc.set(v,fr);hurt(v,3);v.lh=w;cnt(w,v)}));return true});\n"
 " if(f.t>0&&f.t%10==0){let x=ox,y=oy,hit=0;for(let k=0;k<82&&!hit;k+=3){x+=cx*3;y+=cy*3;if(solid(x,y))hit=1}if(!hit){let k=0;while(k++<40&&!solid(x,y))y++;hit=solid(x,y)}if(hit&&fires.length<200){let gy=y;while(gy>0&&solid(x,gy))gy--;fires.push({x,y:gy+1,e:fr+420,o:w})}}});"
 "fts=fts.filter(f=>f.t>0||f.ps.length)}")
d.s = d.s[:i] + NEW_FT + d.s[j:]

# ---- fix: Canadian strike lands on the marked spot ----
# Bombs left the plane already moving forward, drifting ~60-70px before the first
# landing, then every bounce carried them up to ~150px further. Now each bomb is
# released early by exactly its drift (fall simulated against the ground under
# its target), and each bounce hops at most ~12px forward.
d.sub("function plane(w,x0,xs,mk,k){const dir=x0>=w.x?1:-1,q=xs.map(d=>mk(Math.max(20,Math.min(W-20,x0+d)))).sort((a,b)=>dir*(a.x-b.x));",
      "function plane(w,x0,xs,mk,k){const dir=x0>=w.x?1:-1,q=xs.map(d=>mk(Math.max(20,Math.min(W-20,x0+d)))).map(p=>{if(p.cs){let y=-12,vy=p.vy,t=0;while(t<600&&y<WL&&!solid(p.x,y+2)){vy+=.15;y+=vy;t++}p.rx=p.x-dir*1.2*t}return p}).sort((a,b)=>dir*((a.rx??a.x)-(b.rx??b.x)));")
d.sub("while(pl.q.length&&(pl.dir>0?pl.x>=pl.q[0].x:pl.x<=pl.q[0].x)){const sp=pl.q.shift();sp.y=pl.y+6;if(sp.cs){sp.dr=pl.dir;sp.vx=pl.dir*1.2}proj.push(sp)}",
      "while(pl.q.length&&(pl.dir>0?pl.x>=(pl.q[0].rx??pl.q[0].x):pl.x<=(pl.q[0].rx??pl.q[0].x))){const sp=pl.q.shift();sp.y=pl.y+6;if(sp.cs){sp.dr=pl.dir;sp.vx=pl.dir*1.2;if(sp.rx!==undefined)sp.x=sp.rx}proj.push(sp)}")
d.sub("p.vy=-Math.max(2.6,Math.min(9.5,iv*.76));p.vx*=.94;break}",
      "p.vy=-Math.max(2.6,Math.min(9.5,iv*.76));p.vx=Math.sign(p.vx)*Math.min(Math.abs(p.vx)*.94,12*.15/(2*Math.abs(p.vy)));break}")

d.save(sys.argv[2])
