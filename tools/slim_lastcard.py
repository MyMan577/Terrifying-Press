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

# ---- fix: "Draw until playable" kept drawing past playable cards ----
# With a deck modifier on, draws are a weighted random pick (dpop), but your
# draw loop judged "playable?" by looking at the TOP card of the deck, which
# is usually not the card you got. Now the next card is picked once (dnext)
# and both the check and the draw use that same card.
d.sub("""function dpop(){const px=S.dpct||{};if(!Object.keys(px).length||!G.deck.length)return G.deck.pop();
 const w=G.deck.map(c=>{const pc=px['x'+c.c+c.v];return pc===undefined?1:Math.max(0,pc)/100});
 const tot=w.reduce((x,y)=>x+y,0);if(tot<=0)return G.deck.pop();
 let r=Math.random()*tot,pick=-1;for(let i=0;i<w.length;i++){if(w[i]<=0)continue;pick=i;r-=w[i];if(r<0)break}
 return G.deck.splice(pick,1)[0]}""",
"""function dnext(){if(!G.deck.length)return null;if(G.nx&&G.deck.includes(G.nx))return G.nx;
 const px=S.dpct||{};let pick=G.deck.length-1;
 if(Object.keys(px).length){const w=G.deck.map(c=>{const pc=px['x'+c.c+c.v];return pc===undefined?1:Math.max(0,pc)/100});
  const tot=w.reduce((x,y)=>x+y,0);if(tot>0){let r=Math.random()*tot;pick=-1;for(let i=0;i<w.length;i++){if(w[i]<=0)continue;pick=i;r-=w[i];if(r<0)break}}}
 return G.nx=G.deck[pick]}
function dpop(){const c=dnext();G.nx=null;if(!c)return G.deck.pop();G.deck.splice(G.deck.indexOf(c),1);return c}""")
d.sub("""function drawReveal(c){const p=me();G.deck.pop();""", """function drawReveal(c){const p=me();{const k=G.deck.indexOf(c);if(k>=0)G.deck.splice(k,1);G.nx=null}""")
# Draw-until keeps drawing until you draw a playable card (even if your hand
# already has one), checking the card that is actually coming next.
d.sub("""if(S.mode!=='attack'&&!(S.liar&&S.bluff)){let top=G.deck[G.deck.length-1];while(S.until&&top&&!ok(top)){await draw(0,1);top=G.deck[G.deck.length-1]}if(top&&ok(top))return drawReveal(top)}""",
"""if(S.mode!=='attack'&&!(S.liar&&S.bluff)){let top=dnext();while(S.until&&top&&!ok(top)){await draw(0,1);top=dnext()}if(top&&ok(top))return drawReveal(top)}""")

# ---- fix: Control / Almighty orders could make someone draw forever ----
# The ordered card also had to be playable on the pile, so ordering a colour
# the pile isn't could never be met (they drew up to the 30-card safety cap).
# An order overrides the pile: any card matching the order can be placed.
d.sub("""function obeyTurn(t,r,by=t){const p=G.p[t],m=()=>p.hand.filter(c=>fmatch(r,c)&&ok(c));""",
      """function obeyTurn(t,r,by=t){const p=G.p[t],m=()=>p.hand.filter(c=>fmatch(r,c));""")
d.sub("""'Place '+fdesc(r)+'.',z=>fmatch(r,z)&&ok(z));""", """'Place '+fdesc(r)+'.',z=>fmatch(r,z));""")

# ---- fix: the deck could run dry and drawing just stopped ----
# When the draw pile and the discard pile are both used up (every card is in
# someone's hand), a fresh pack is shuffled in.
d.sub("""function draw0(i,n,pre){if(n>1)G.know[i].v.clear();const out=[];for(let k=0;k<n;k++){if(!G.deck.length){const t=G.disc.pop();G.deck=sh(G.disc.map(x=>x.real||x).filter(x=>!x.fk));G.disc=[t]}""",
      """function draw0(i,n,pre){if(n>1)G.know[i].v.clear();const out=[];for(let k=0;k<n;k++){if(!G.deck.length){const t=G.disc.pop();G.deck=sh(G.disc.map(x=>x.real||x).filter(x=>!x.fk));G.disc=[t]}
 if(!G.deck.length&&!(pre&&!k)){G.packs=(G.packs||4)+1;const o=G.packs*1000;G.deck=mkDeck().map(x=>({...x,id:x.id+o}));G.nx=null;toast('New pack shuffled in')}""")

# ---- fix: big hands went off screen ----
# The hand fans out in an arc whose drop grew with hand size (130px+ at 40
# cards, off the bottom), and tight overlap buried cards. The arc's drop is
# now capped, and when cards would be too squeezed the hand becomes a flat row
# you swipe sideways, each card's corner showing (scroll position is kept).
d.sub("""function renderHand(){const h=$('#hand');h.innerHTML='';""", """function renderHand(){const h=$('#hand'),sl=h.scrollLeft;h.innerHTML='';""")
d.sub("""  e.style.setProperty('--rot',m*Math.min(3,18/n)+'deg');e.style.setProperty('--ty',m*m*(n>8?.35:.6)+'px');""",
      """  const hw=(n-1)/2||1;e.style.setProperty('--rot',m*Math.min(3,18/n)+'deg');e.style.setProperty('--ty',m*m*Math.min(n>8?.35:.6,22/(hw*hw))+'px');""")
d.sub("""const w=h.firstChild?h.firstChild.offsetWidth:0;h.style.setProperty('--ov',(n>1?Math.round((Math.min(w*.62,(h.clientWidth-16-w)/(n-1))-w)*(devicePixelRatio||1))/(devicePixelRatio||1):0)+'px');""",
      """const w=h.firstChild?h.firstChild.offsetWidth:0,fit=n>1?(h.clientWidth-16-w)/(n-1):w,tight=n>1&&fit<w*.36;h.classList.toggle('scroll',tight);
 if(tight)h.querySelectorAll('.card').forEach(e=>{e.style.setProperty('--rot','0deg');e.style.setProperty('--ty','0px')});
 const step=tight?w*.4:Math.min(w*.62,fit);h.style.setProperty('--ov',(n>1?Math.round((step-w)*(devicePixelRatio||1))/(devicePixelRatio||1):0)+'px');if(tight)h.scrollLeft=sl;""")
d.sub("""#hand .card:first-child{margin-left:0}""",
      """#hand .card:first-child{margin-left:0}
#hand.scroll{justify-content:flex-start;overflow-x:auto;overflow-y:hidden;height:calc(var(--ch)*1.3 + 40px);padding:0 14px;scrollbar-width:none;-webkit-overflow-scrolling:touch}#hand.scroll::-webkit-scrollbar{display:none}
#hand.scroll .card:last-child{margin-right:76px}""")

# ---- fix: deck modifier card tiles felt random to tap ----
# Each tile held two buttons: the tile toggled the boost (and did nothing at
# all once the card was out of the deck), while the small tick in its corner
# took the card in or out. Where a tap landed decided which one fired. Now the
# whole tile is one button cycling normal -> boosted -> off -> normal, and the
# tick only shows the state.
d.sub("""L.querySelectorAll('[data-x]').forEach(b=>b.onclick=()=>{const k=b.dataset.x;if((S.dex||{})[k])return;dmSetCount(k,m[k]?0:1);renderDM()});""",
      """L.querySelectorAll('.dmcd[data-x]').forEach(b=>b.onclick=()=>{const k=b.dataset.x,dx={...(S.dex||{})},dm={...(S.dmod||{})};if(dx[k])delete dx[k];else if(!dm[k])dm[k]=1;else{delete dm[k];dx[k]=1}S.dex=dx;S.dmod=dm;dmSave();renderDM()});""")
d.sub("""L.querySelectorAll('[data-ck]').forEach(b=>b.onclick=e=>{e.stopPropagation();const k=b.dataset.ck,dx={...(S.dex||{})},dm={...(S.dmod||{})};if(dx[k])delete dx[k];else{dx[k]=1;delete dm[k]}S.dex=dx;S.dmod=dm;dmSave();renderDM()});""", "")
d.sub("</style>", ".dmck{pointer-events:none}.dmcd[data-x] *{pointer-events:none}\n</style>")

# ---- one button per section instead of "Check all" + "Boost all" ----
# Each colour section (and the top "all cards" row) gets a single button that
# moves every card in it through the same cycle as one tile:
# normal -> boosted -> off -> normal. If the section is mixed, the next step is
# "boost all". The label says what the next tap does. Classes keep their own
# Boost all / Clear boosts (they can't be taken out of the deck).
d.sub("""  const head=(id,title,keys)=>'<div class="dmsechd"><button type="button" class="dmsecT" data-scol="'+id+'">'+(dmCol[id]?'\\u25B8 ':'\\u25BE ')+title+'</button>'+btn(id,keys)+(id==='cls'?'':boostBtn(id,keys))+'</div>';""",
      """  const grpSt=keys=>{const dx=S.dex||{},dm=S.dmod||{};if(keys.length&&keys.every(k=>dx[k]))return 'off';if(keys.length&&keys.every(k=>!dx[k]&&dm[k]))return 'boosted';if(keys.length&&keys.every(k=>!dx[k]&&!dm[k]))return 'normal';return 'mixed'};
  const cycBtn=(sec,keys,big)=>{const st=grpSt(keys),w=big?'all cards':'all',lbl=st==='boosted'?'Turn '+w+' off':st==='off'?'Turn '+w+' on':'Boost '+w;return '<button type="button" class="dmall'+(big?' big':'')+(st==='boosted'?' on':'')+'" data-cyc="'+sec+'">'+lbl+'</button>'};
  const head=(id,title,keys)=>'<div class="dmsechd"><button type="button" class="dmsecT" data-scol="'+id+'">'+(dmCol[id]?'\\u25B8 ':'\\u25BE ')+title+'</button>'+(id==='cls'?btn(id,keys):cycBtn(id,keys))+'</div>';""")
d.sub("""+'<button type="button" class="dmall big'+(allIn(cardKeys)?' on':'')+'" data-sec="all">'+(allIn(cardKeys)?'Uncheck all cards':'Check all cards')+'</button> <button type="button" class="dmall big'+(bOn(cardKeys)?' on':'')+'" data-bsec="all">'+(bOn(cardKeys)?'Clear boosts':'Boost all cards')+'</button></div>'""",
      """+cycBtn('all',cardKeys,1)+'</div>'""")
d.sub("""L.querySelectorAll('[data-scol]').forEach(b=>b.onclick=()=>{""",
      """L.querySelectorAll('[data-cyc]').forEach(b=>b.onclick=()=>{const keys=dmSecKeys[b.dataset.cyc]||[],dx={...(S.dex||{})},dm={...(S.dmod||{})};
 const st=keys.length&&keys.every(k=>dx[k])?'off':keys.length&&keys.every(k=>!dx[k]&&dm[k])?'boosted':'other';
 keys.forEach(k=>{if(st==='boosted'){delete dm[k];dx[k]=1}else if(st==='off'){delete dx[k]}else{delete dx[k];dm[k]=dm[k]||1}});
 S.dex=dx;S.dmod=dm;dmSave();renderDM()});
L.querySelectorAll('[data-scol]').forEach(b=>b.onclick=()=>{""")

d.save(sys.argv[2])
