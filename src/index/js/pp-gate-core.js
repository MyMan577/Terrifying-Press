/* Mode gate: runs before the app so it can tell people who already have saved data from brand-new users. */
(function(){
  var K='ppModeGateV1', MODE_KEYS={lite:'ppLiteMode',plus:'ppPlusMode',premium:'ppPremiumMode',playground:'ppPlaygroundMode'}, CLEAN_GOAL=3600000, PLUS_PASS=75;
  function rd(k){try{return localStorage.getItem(k)}catch(e){return null}}
  function wr(k,v){try{localStorage.setItem(k,v)}catch(e){}}
  var st=null; try{st=JSON.parse(rd(K)||'null')}catch(e){}
  if(!st||typeof st!=='object'){
    var had=false;
    try{ for(var i=0;i<localStorage.length;i++){ var k=localStorage.key(i)||''; if(/^(player|pp|disc)/i.test(k)&&k!==K){had=true;break} } }catch(e){}
    st={v:1,legacy:had,lite:false,plus:false,premium:false,playground:false,clean:0,notice:false};
    wr(K,JSON.stringify(st));
  }
  st.clean=st.clean||0;
  var ticks=0;
  function save(){wr(K,JSON.stringify(st))}
  function quizBest(){return parseInt(rd('ppxpQuizBestV2')||'0',10)||0}
  function marathonBest(){return parseInt(rd('ppMarathonBestV1')||'0',10)||0}
  // The quiz counts as passed above 70% (15/20, shown as 75%+); that is also when it pays its one-time bonus.
  function quizPassed(){return quizBest()>=PLUS_PASS||rd('ppxpQuizPlusOneV2')==='1'}
  function fire(m){try{window.dispatchEvent(new CustomEvent('ppgate',{detail:m}))}catch(e){}}
  var G=window.PPModeGate={
    state:function(){return st},
    legacy:function(){return !!st.legacy},
    quizBest:quizBest, marathonBest:marathonBest,
    cleanGoal:CLEAN_GOAL, plusPass:PLUS_PASS,
    unlocked:function(m){
      if(m==='playground')return !!st.playground;   // bought in the Points shop, so saves with old data do not get it for free
      if(!m||st.legacy)return true;
      if(m==='premium'&&!st.premium&&marathonBest()>=100){st.premium=true;save()}
      if(m==='plus'&&!st.plus&&quizPassed()){st.plus=true;save()}
      return !!st[m];
    },
    done:function(m){ if(st.legacy||st[m])return; st[m]=true; save(); fire(m); },
    grant:function(m){ if(m!=='playground'||st.playground)return false; st.playground=true; save(); fire(m); return true; },
    check:function(){
      if(st.legacy)return;
      if(!st.plus&&quizPassed()){st.plus=true;save();fire('plus')}
      if(!st.premium&&marathonBest()>=100){st.premium=true;save();fire('premium')}
    },
    // Lite: time spent playing with nothing layered on top (see plain() in the mode menu script).
    addClean:function(ms){
      if(st.legacy||st.lite)return;
      st.clean=(st.clean||0)+ms;
      if(st.clean>=CLEAN_GOAL){st.lite=true;save();fire('lite');return}
      if(++ticks%5===0)save();
    }
  };
  // A locked mode can never be active for someone who hasn't earned it (before any app script reads these flags).
  for(var m in MODE_KEYS){ if(rd(MODE_KEYS[m])==='1'&&!G.unlocked(m))wr(MODE_KEYS[m],'0'); }
  window.addEventListener('pagehide',save);
})();
