(function(){
  var BEST='ppMarathonBestV1', BG='ppMarathonBgV1', LEN=30, XP_N=6, SECS=10, BG_NEED=24;   // 24/30 = 80%
  var ls={g:function(k){try{return localStorage.getItem(k)}catch(e){return null}},s:function(k,v){try{localStorage.setItem(k,v)}catch(e){}}};
  var toast=function(m){try{showToast(m)}catch(e){}};
  var G=window.PPModeGate||{unlocked:function(){return true},legacy:function(){return true},check:function(){}};
  var css=document.createElement('style');
  css.textContent='body.pp-lite #pp-marathon-section{display:none}'
    +'#pp-mar-overlay{display:none;position:fixed;inset:0;background:rgba(0,0,0,.7);z-index:99990;align-items:center;justify-content:center}'
    +'#pp-mar-overlay.open{display:flex}'
    +'#pp-mar{background:var(--bg-elev);border:1px solid var(--line);border-radius:14px;width:min(480px,94vw);max-height:90vh;display:flex;flex-direction:column;overflow:hidden}'
    +'#pp-mar-head{padding:16px 22px 12px;border-bottom:1px solid var(--line)}'
    +'#pp-mar-head h2{margin:0 0 3px;font-size:15px;font-weight:600}#pp-mar-head p{margin:0;font-size:12px;color:var(--text-dim)}'
    +'#pp-mar-timer{height:5px;background:var(--line);display:none}#pp-mar-timer i{display:block;height:100%;width:100%;background:var(--accent);transition:none}'
    +'#pp-mar-timer.low i{background:var(--danger,#e0667a)}'
    +'#pp-mar-body{padding:16px 22px;overflow-y:auto}'
    +'#pp-mar-foot{padding:12px 22px 16px;border-top:1px solid var(--line);text-align:right}'
    +'.pp-mar-secs{float:right;font-weight:700;color:var(--text)}.pp-mar-secs.low{color:var(--danger,#e0667a)}'
    +'.pp-mar-list{margin:10px 0 4px;padding-left:18px;font-size:12.5px;color:var(--text-dim);line-height:1.6}'
    +'#pp-marathon-section .pp-mar-stat{font-size:11.5px;color:var(--accent);margin-top:4px}';
  document.head.appendChild(css);

  function shuffle(a){a=a.slice();for(var i=a.length-1;i>0;i--){var j=Math.floor(Math.random()*(i+1)),t=a[i];a[i]=a[j];a[j]=t}return a}
  function best(){return parseInt(ls.g(BEST)||'0',10)||0}
  function bgHave(){return ls.g(BG)==='1'}
  function mk(tag,cls,text){var e=document.createElement(tag);if(cls)e.className=cls;if(text!=null)e.textContent=text;return e}

  var overlay,modal,body,head,foot,timerBar,timerFill,tick=null,statEl=null;
  var set=[],qi=0,right=0,missed=[],deadline=0,running=false;

  function status(){
    var bits=['Best: '+best()+'%'];
    bits.push(bgHave()?'Finish Line background unlocked':'80% unlocks the Finish Line background');
    bits.push(G.unlocked('premium')?(G.legacy()?'Premium is unlocked':'Premium unlocked'):'100% grants Premium');
    return bits.join('  \u00b7  ');
  }
  function refreshStatus(){if(statEl)statEl.textContent=status()}
  function stopTick(){if(tick){clearInterval(tick);tick=null}}
  function close(){stopTick();running=false;overlay.classList.remove('open');refreshStatus()}

  function build(){
    var pane=document.getElementById('sidebar-pane-settings');
    if(!pane||document.getElementById('pp-marathon-section'))return;
    var sec=mk('div','settings-section');sec.id='pp-marathon-section';
    sec.innerHTML='<div class="settings-row" id="pp-marathon-row"><div class="settings-row-text"><div class="settings-row-title">The Marathon</div>'
      +'<div class="settings-row-sub">30 questions, 10 seconds each. Score 80% to unlock the Finish Line background, or 100% to earn Press Play PREMIUM.</div>'
      +'<div class="pp-mar-stat"></div></div></div>';
    pane.appendChild(sec);
    statEl=sec.querySelector('.pp-mar-stat');refreshStatus();
    sec.querySelector('#pp-marathon-row').addEventListener('click',openIntro);
    overlay=mk('div');overlay.id='pp-mar-overlay';
    overlay.innerHTML='<div id="pp-mar"><div id="pp-mar-head"><h2>The Marathon</h2><p>30 questions \u00b7 10 seconds each</p></div><div id="pp-mar-timer"><i></i></div><div id="pp-mar-body"></div><div id="pp-mar-foot"><button class="sort-footer-btn" id="pp-mar-close" type="button">Close</button></div></div>';
    document.body.appendChild(overlay);
    modal=overlay.querySelector('#pp-mar');body=overlay.querySelector('#pp-mar-body');head=overlay.querySelector('#pp-mar-head');
    timerBar=overlay.querySelector('#pp-mar-timer');timerFill=timerBar.firstChild;
    overlay.querySelector('#pp-mar-close').addEventListener('click',close);
    overlay.addEventListener('click',function(e){if(e.target===overlay&&!running)close()});
  }

  function openIntro(){
    var B=window.__ppQuizBank;
    stopTick();running=false;timerBar.style.display='none';overlay.classList.add('open');body.innerHTML='';
    if(!B||!B.app||!B.xp||B.app.length<LEN-XP_N||B.xp.length<XP_N){body.appendChild(mk('div','ppxp-quiz-explain','The question bank is not available right now. Try again after the app finishes loading.'));return}
    body.appendChild(mk('div','ppxp-quiz-question','Ready for the Marathon?'));
    var ul=mk('ul','pp-mar-list');
    ['30 random questions, mostly about the app.','Each question has 10 seconds. Running out of time counts as a miss, and the clock keeps running when switching away.','Score 80% (24 right) to unlock the Finish Line background.','Score 100% to earn Press Play PREMIUM.','Closing this window ends the run.'].forEach(function(t){ul.appendChild(mk('li',null,t))});
    body.appendChild(ul);
    body.appendChild(mk('div','ppxp-quiz-progress',status()));
    var go=mk('button','ppxp-quiz-next-btn','Start the Marathon');go.type='button';go.addEventListener('click',start);body.appendChild(go);
  }

  function start(){
    var B=window.__ppQuizBank;
    set=shuffle(shuffle(B.xp).slice(0,XP_N).concat(shuffle(B.app).slice(0,LEN-XP_N))).map(function(it){return{q:it.q,correct:it.correct,explain:it.explain,options:shuffle(it.options)}});
    qi=0;right=0;missed=[];running=true;timerBar.style.display='block';ask();
  }

  function ask(){
    var it=set[qi],answered=false;
    body.innerHTML='';
    var prog=mk('div','ppxp-quiz-progress','Question '+(qi+1)+' of '+set.length+'  \u00b7  '+right+' right');
    var secs=mk('span','pp-mar-secs',String(SECS));prog.appendChild(secs);
    body.appendChild(prog);body.appendChild(mk('div','ppxp-quiz-question',it.q));
    var btns=[];
    function finish(choice){
      if(answered)return;answered=true;stopTick();
      if(choice===it.correct)right++;else missed.push(it);
      btns.forEach(function(b){b.disabled=true;if(b.textContent===it.correct)b.classList.add('correct');else if(b.textContent===choice)b.classList.add('incorrect')});
      body.appendChild(mk('div','ppxp-quiz-explain',(choice==null?'Time is up. ':(choice===it.correct?'Correct. ':'Not quite. '))+it.explain));
      var nx=mk('button','ppxp-quiz-next-btn',qi+1<set.length?'Next question':'See result');nx.type='button';
      nx.addEventListener('click',function(){qi++;if(qi<set.length)ask();else result()});
      body.appendChild(nx);
    }
    it.options.forEach(function(o){var b=mk('button','ppxp-quiz-option',o);b.type='button';b.addEventListener('click',function(){finish(o)});btns.push(b);body.appendChild(b)});
    deadline=performance.now()+SECS*1000;
    timerFill.style.width='100%';timerBar.classList.remove('low');
    stopTick();
    tick=setInterval(function(){
      var left=Math.max(0,deadline-performance.now());
      timerFill.style.width=(left/(SECS*1000)*100)+'%';
      var low=left<=3000;timerBar.classList.toggle('low',low);secs.classList.toggle('low',low);
      secs.textContent=String(Math.ceil(left/1000));
      if(left<=0)finish(null);
    },100);
  }

  function result(){
    stopTick();running=false;timerBar.style.display='none';
    var total=set.length,pct=Math.round(right/total*100),prev=best(),was=G.unlocked('premium');   // read before saving, so a first perfect run is reported as new
    if(pct>prev)ls.s(BEST,String(pct));
    var lines=[];
    if(right>=BG_NEED){
      if(!bgHave()){ls.s(BG,'1');lines.push('Finish Line unlocked. Find it under Customize appearance \u2192 Unlockable presets.');toast('Finish Line background unlocked');try{window.PPXpApi&&window.PPXpApi.refreshUnlocks&&window.PPXpApi.refreshUnlocks()}catch(e){}}
      else lines.push('Finish Line background: already unlocked.');
    }else lines.push(BG_NEED+' of '+total+' (80%) needed for the Finish Line background.');
    if(right===total){
      try{G.check()}catch(e){}
      lines.push(G.legacy()||was?'A perfect run! Premium was already unlocked.':'A perfect run! Press Play PREMIUM is unlocked. Find it under Settings \u2192 App mode.');
    }else lines.push('Only a perfect 30 of 30 earns Press Play PREMIUM.');
    body.innerHTML='';
    var res=mk('div','ppxp-quiz-result');
    res.appendChild(mk('div','ppxp-quiz-result-score',right+' / '+total+' correct ('+pct+'%)'));
    lines.forEach(function(t){res.appendChild(mk('div','ppxp-quiz-result-sub',t))});
    res.appendChild(mk('div','ppxp-quiz-result-sub','Best: '+best()+'%. Every run draws a fresh random set.'));
    body.appendChild(res);
    if(missed.length){
      body.appendChild(mk('div','ppxp-quiz-progress','Review the misses:'));
      missed.forEach(function(m){body.appendChild(mk('div','ppxp-quiz-question',m.q));body.appendChild(mk('div','ppxp-quiz-explain','Answer: '+m.correct+'. '+m.explain))});
    }
    var again=mk('button','ppxp-quiz-next-btn','Run it again');again.type='button';again.addEventListener('click',openIntro);body.appendChild(again);
    refreshStatus();
  }

  window.__ppMarathonOpen=openIntro;
  build();setTimeout(build,1000);setTimeout(build,3000);
})();
