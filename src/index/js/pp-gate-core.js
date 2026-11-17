/* Mode gate: runs before the app so it can tell people who already have saved data from brand-new users.
   How each mode is earned:
     Lite        free from the start (making the app simpler should never be a chore)
     PLUS        pass the Press Play quiz (75%+), or listen/watch for 3 hours in total
     Focus       the same as PLUS: it is Press Play with everything unlocked and the extras switched off
     PREMIUM     score 90% (27 of 30) in The Marathon
     Playground  bought in the Points shop */
(function(){
  var K='ppModeGateV1', MODE_KEYS={lite:'ppLiteMode',plus:'ppPlusMode',premium:'ppPremiumMode',playground:'ppPlaygroundMode',focus:'ppFocusMode'},
      PLAY_GOAL=3*3600000, PLUS_PASS=75, PREMIUM_PASS=90;
  function rd(k){try{return localStorage.getItem(k)}catch(e){return null}}
  function wr(k,v){try{localStorage.setItem(k,v)}catch(e){}}
  var st=null; try{st=JSON.parse(rd(K)||'null')}catch(e){}
  if(!st||typeof st!=='object'){
    var had=false;
    try{ for(var i=0;i<localStorage.length;i++){ var k=localStorage.key(i)||''; if(/^(player|pp|disc)/i.test(k)&&k!==K){had=true;break} } }catch(e){}
    st={v:2,legacy:had,lite:true,plus:false,premium:false,playground:false,focus:false,played:0,notice:false};
    wr(K,JSON.stringify(st));
  }
  st.lite=true;                                   // Lite no longer has a task
  st.played=st.played||0;
  var ticks=0;
  function save(){wr(K,JSON.stringify(st))}
  function quizBest(){return parseInt(rd('ppxpQuizBestV2')||'0',10)||0}
  function marathonBest(){return parseInt(rd('ppMarathonBestV1')||'0',10)||0}
  // The quiz counts as passed above 70% (15/20, shown as 75%+); that is also when it pays its one-time bonus.
  function quizPassed(){return quizBest()>=PLUS_PASS||rd('ppxpQuizPlusOneV2')==='1'}
  function earned(m){
    if(m==='plus'||m==='focus')return quizPassed()||st.played>=PLAY_GOAL;
    if(m==='premium')return marathonBest()>=PREMIUM_PASS;
    return false;
  }
  function fire(m){try{window.dispatchEvent(new CustomEvent('ppgate',{detail:m}))}catch(e){}}
  var G=window.PPModeGate={
    state:function(){return st},
    legacy:function(){return !!st.legacy},
    quizBest:quizBest, marathonBest:marathonBest,
    playGoal:PLAY_GOAL, plusPass:PLUS_PASS, premiumPass:PREMIUM_PASS,
    unlocked:function(m){
      if(m==='playground')return !!st.playground;   // bought in the Points shop, so saves with old data do not get it for free
      if(!m||m==='lite'||st.legacy)return true;
      if(!st[m]&&earned(m)){st[m]=true;save()}
      return !!st[m];
    },
    done:function(m){ if(st.legacy||st[m])return; st[m]=true; save(); fire(m); },
    grant:function(m){ if(m!=='playground'||st.playground)return false; st.playground=true; save(); fire(m); return true; },
    check:function(){
      if(st.legacy)return;
      ['plus','focus','premium'].forEach(function(m){ if(!st[m]&&earned(m)){st[m]=true;save();fire(m)} });
    },
    // Real listening/watching time, counted by the mode menu script once a second while something plays.
    addPlay:function(ms){
      if(st.legacy||(st.plus&&st.focus))return;
      st.played=(st.played||0)+ms;
      if(st.played>=PLAY_GOAL){G.check();return}
      if(++ticks%10===0)save();
    },
    addClean:function(){}                          // the old Lite task; kept so nothing that still calls it breaks
  };
  // A locked mode can never be active for someone who hasn't earned it (before any app script reads these flags).
  for(var m in MODE_KEYS){ if(rd(MODE_KEYS[m])==='1'&&!G.unlocked(m))wr(MODE_KEYS[m],'0'); }
  window.addEventListener('pagehide',save);
})();
