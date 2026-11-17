(function(){
  var pane=document.getElementById('sidebar-pane-settings'); if(!pane)return;
  var GROUPS=[['play','Playback'],['lib','Library & playlists'],['look','Appearance & layout'],['data','Backup & storage'],['fun','Rewards & games'],['credits','Credits']];
  var root=null,cards={},wraps={},advD=null,advBody=null;

  function build(){
    if(root&&root.parentNode===pane)return;
    root=document.createElement('div'); root.id='pp-sg-root';
    GROUPS.forEach(function(g){
      var w=document.createElement('div'); w.className='pp-sg'; w.hidden=true; w.dataset.sg=g[0];
      var t=document.createElement('div'); t.className='pp-sg-title'; t.textContent=g[1];
      var c=document.createElement('div'); c.className='pp-sg-card';
      w.appendChild(t); w.appendChild(c); root.appendChild(w);
      cards[g[0]]=c; wraps[g[0]]=w;
    });
    advD=document.createElement('details'); advD.className='pp-adv';
    var sm=document.createElement('summary'); sm.textContent='Advanced';
    advBody=document.createElement('div'); advBody.className='pp-adv-body';
    advD.appendChild(sm); advD.appendChild(advBody);
    pane.appendChild(root);
  }

  // A section's name that lasts between versions: its id, or else its first setting's title.
  function key(sec){
    if(sec.id)return sec.id;
    var t=sec.querySelector('.settings-row-title')||sec.querySelector('.settings-section-label');
    return t?'t:'+(t.textContent||'').replace(/\s+/g,' ').trim().slice(0,48):'';
  }
  // The user's own arrangement (Layout studio > Settings > Sections): { place:{key:group}, order:{group:[keys]}, hide:[keys] }
  function arr(){ try{ var a=JSON.parse(localStorage.getItem('ppSettingsArrV1')||'null'); return a&&typeof a==='object'?a:{}; }catch(e){ return {}; } }
  var A0={};
  function pick(sec){
    var id=sec.id||'';
    if(id==='ppxp-badge-slot')return null;
    var k=key(sec),pl=A0.place&&A0.place[k];
    if(pl&&(cards[pl]||pl==='adv'))return pl;
    if(id==='credits-section')return 'credits';   // always last, on its own
    var ft=((sec.querySelector('.settings-row-title')||{}).textContent||'').trim();
    if(id==='decoding-section'||id==='gestures-section'||sec.querySelector('#pp-ass-toggle'))return 'adv';
    if(id==='playback-position-section'||id==='audio-quality-section'||sec.querySelector('#xf-mode'))return 'play';
    if(id==='extras-settings-section'||id==='playlists-manager-section'||sec.querySelector('#detailed-mode-toggle')||/^Keep MP3 conversions/.test(ft))return 'lib';
    if(id==='auto-scan-section')return 'lib';
    if(id==='storage-section'||id==='progress-section'||id==='update-section'||id==='errlog-section')return 'data';
    if(id==='pw-customize-section'||/^Retro layout/.test(ft)||id==='pp-refined-section'||id==='ppxp-accent-section'||id==='pp-modes-section')return 'look';
    return 'fun';
  }

  function organize(){
    build(); A0=arr();
    var list=pane.querySelectorAll('.settings-section');
    for(var i=0;i<list.length;i++){
      var s=list[i];
      if(s.parentNode&&s.parentNode.closest&&s.parentNode.closest('.settings-section'))continue;
      var g=pick(s); if(!g)continue;
      var dest=g==='adv'?advBody:cards[g];
      if(s.parentNode!==dest)dest.appendChild(s);
    }
    // Advanced fold sits at the end of Playback, only if it has content
    if(advBody.firstElementChild){ if(advD.parentNode!==cards.play||cards.play.lastElementChild!==advD)cards.play.appendChild(advD); }
    else if(advD.parentNode)advD.parentNode.removeChild(advD);
    // Backup speed tucked into its own fold
    var bs=document.getElementById('backup-speed-row');
    if(bs&&!bs.closest('.pp-adv-inline')){
      var d=document.createElement('details'); d.className='pp-adv pp-adv-inline';
      var sm=document.createElement('summary'); sm.textContent='Backup speed'; d.appendChild(sm);
      bs.parentNode.insertBefore(d,bs); d.appendChild(bs);
    }
    var cz=document.getElementById('pw-customize-section');   // Customize leads the Appearance card
    if(cz&&cz.parentNode===cards.look&&cards.look.firstElementChild!==cz&&!((A0.order||{}).look||[]).length)cards.look.insertBefore(cz,cards.look.firstElementChild);
    // the user's order inside each group: only moved when it differs, so this never sets off another pass
    GROUPS.forEach(function(g){
      var want=(A0.order||{})[g[0]]; if(!Array.isArray(want)||!want.length)return;
      var card=cards[g[0]], secs=[].filter.call(card.children,function(x){return x.classList.contains('settings-section');});
      var rank=function(x){ var i=want.indexOf(key(x)); return i<0?1e6+secs.indexOf(x):i; };
      var sorted=secs.slice().sort(function(a,b){return rank(a)-rank(b);});
      if(sorted.every(function(x,i){return x===secs[i];}))return;
      var anchor=secs[secs.length-1].nextSibling;
      sorted.forEach(function(x){ card.insertBefore(x,anchor); });
    });
    var hid=A0.hide||[], all=pane.querySelectorAll('.settings-section');
    for(var j=0;j<all.length;j++){ var on=hid.indexOf(key(all[j]))>=0; if(all[j].classList.contains('ls-sec-hidden')!==on)all[j].classList.toggle('ls-sec-hidden',on); }
    GROUPS.forEach(function(g){ wraps[g[0]].hidden=!cards[g[0]].querySelector('.settings-section'); });
  }

  function clamp(){
    var subs=pane.querySelectorAll('.settings-row-text > .settings-row-sub');
    for(var i=0;i<subs.length;i++){
      (function(s){
        if(s.dataset.ppc)return;
        var row=s.closest('.settings-row');
        if(!row||!row.querySelector('.settings-switch,.settings-toggle-btn,select,input'))return;
        if((s.textContent||'').length<90)return;
        s.dataset.ppc='1'; s.classList.add('pp-clamp');
        var b=document.createElement('button'); b.type='button'; b.className='pp-more'; b.textContent='More';
        b.addEventListener('click',function(e){e.stopPropagation();var o=s.classList.toggle('pp-open');b.textContent=o?'Less':'More';});
        s.parentNode.insertBefore(b,s.nextSibling);
      })(subs[i]);
    }
  }

  var busy=false,queued=false;
  function run(){ if(busy)return; busy=true; try{organize();clamp();}catch(e){} busy=false; }
  function sched(){ if(queued)return; queued=true; setTimeout(function(){queued=false;run();},30); }
  run(); setTimeout(run,1000); setTimeout(run,3000);
  // Widgets placed in Settings update themselves often; their changes are not new settings, so they don't set off a pass.
  if(window.MutationObserver)new MutationObserver(function(ms){
    if(busy)return;
    for(var i=0;i<ms.length;i++){ var t=ms[i].target; t=t&&t.nodeType===1?t:t&&t.parentElement; if(!t||!t.closest||!t.closest('.ls-slot')){ sched(); return; } }
  }).observe(pane,{childList:true,subtree:true});
  window.__ppSettings={ key:key, groups:GROUPS, card:function(g){ build(); return cards[g]; }, wrap:function(g){ build(); return wraps[g]; }, adv:function(){ return advBody; }, run:function(){ run(); } };
})();
