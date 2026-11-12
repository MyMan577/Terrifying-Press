(function(){
  var KEY='ppLiteMode';
  function get(){try{return localStorage.getItem(KEY)==='1';}catch(e){return false;}}
  function plusOn(){try{return localStorage.getItem('ppPlusMode')==='1';}catch(e){return false;}}
  var on=get();
  if(on)document.body.classList.add('pp-lite');
  function applyLiteBits(){
    if(!get())return;
    try{var a=window.PPXpApi;if(a){window.__ppXpO=window.__ppXpO||{w:a.recordWatchTime,c:a.recordCompletion};a.recordWatchTime=function(){};a.recordCompletion=function(){};}}catch(e){}
    try{document.documentElement.style.removeProperty('--accent');document.documentElement.style.removeProperty('--accent-dim');}catch(e){}
    // make sure the extra EQ bands are usable regardless of level
    document.querySelectorAll('.eq-band-pro').forEach(function(b){b.classList.add('unlocked');});
  }
  function ask(turningOn,cb){
    var sec=document.getElementById('pp-lite-section');if(!sec)return;
    var old=document.getElementById('pp-lite-confirm');if(old){old.remove();}
    var c=document.createElement('div');c.id='pp-lite-confirm';
    c.innerHTML='<div class="pl-q">'+(turningOn?'Switch to Press Play Lite?':'Switch back to full Press Play?')+'</div><div class="pl-d">'+(turningOn?'The app will reset and reopen with a simpler layout: fewer presets and backgrounds, no levels, EXP or games. Progress is kept.'+(plusOn()?' This also turns off Press Play PLUS.':''):'The app will reset and reopen with all features, levels and games restored.')+'</div><button type="button" class="pl-yes">'+(turningOn?'Yes, go Lite':'Yes, restore everything')+'</button><button type="button" class="pl-no">Cancel</button>';
    sec.appendChild(c);
    var tb=document.getElementById('pp-lite-toggle');if(tb)tb.style.display='none';
    function close(){c.remove();if(tb)tb.style.display='';}
    c.querySelector('.pl-no').addEventListener('click',close);
    c.querySelector('.pl-yes').addEventListener('click',function(){close();cb();});
    try{c.scrollIntoView({block:'nearest'});}catch(e){}
  }
  function toggle(){
    var turningOn=!get();
    ask(turningOn,function(){
      try{
        window.__ppSkipUnloadSave=true;
        localStorage.setItem(KEY,turningOn?'1':'0');
        if(turningOn){localStorage.setItem('ppPlusMode','0');localStorage.setItem('ppPremiumMode','0');}
        sessionStorage.setItem('ppLiteBanner',turningOn?'on':'off');
      }catch(e){}
      try{location.reload();}catch(e){}
      // fallback if reload is blocked by the host: apply live
      setTimeout(function(){
        document.body.classList.toggle('pp-lite',turningOn);
        var bt=document.getElementById('pp-lite-toggle');
        if(bt)bt.textContent=turningOn?'Turn off':'Turn on';
        banner();applyLiteBits();
      },800);
    });
  }
  var HIDE_KEY='ppLiteHidden', SEEN_KEY='ppLiteFirstSeen', NEW_DAYS=7;
  function isHidden(){try{return localStorage.getItem(HIDE_KEY)==='1';}catch(e){return false;}}
  function setHidden(v){try{if(v)localStorage.setItem(HIDE_KEY,'1');else localStorage.removeItem(HIDE_KEY);}catch(e){}}
  function showNew(){
    try{
      var t=parseInt(localStorage.getItem(SEEN_KEY),10);
      if(!t){localStorage.setItem(SEEN_KEY,String(Date.now()));return true;}
      return (Date.now()-t)<NEW_DAYS*86400000;
    }catch(e){return true;}
  }
  function build(){return;
    var host=document.getElementById('gestures-section');
    if(!host)return;
    var sec=document.getElementById('pp-lite-section');
    var rest=document.getElementById('pp-lite-restore');
    // Hiding only applies while Lite is off, so people can always turn it off again
    if(isHidden()&&!get()){
      if(sec)sec.remove();
      if(!rest){
        rest=document.createElement('button');rest.type='button';rest.id='pp-lite-restore';
        rest.textContent='Show Press Play Lite option';
        rest.addEventListener('click',function(){setHidden(false);rest.remove();build();});
      }
      if(host.parentNode.lastElementChild!==rest)host.parentNode.appendChild(rest);
      return;
    }
    if(rest)rest.remove();
    if(!sec){
      sec=document.createElement('div');
      sec.className='settings-section';sec.id='pp-lite-section';
      var tag=showNew()?'<span class="pp-lite-tag">NEW</span>':'';
      sec.innerHTML='<div class="pp-lite-row"><div class="pp-lite-text"><div class="pp-lite-title">Press Play Lite'+tag+'</div><p>Fewer presets and backgrounds. No levels, games or EXP. All audio and video tools stay.</p></div><button id="pp-lite-toggle" type="button" onclick="window.__ppLiteToggle&&window.__ppLiteToggle(event)"></button></div>'+(get()?'':'<button type="button" class="pp-lite-hide">Don\'t show this</button>');
      sec.querySelector('#pp-lite-toggle').textContent=get()?'Turn off':'Turn on';
      var hide=sec.querySelector('.pp-lite-hide');
      if(hide)hide.addEventListener('click',function(){setHidden(true);build();});
    }
    if(host.parentNode.lastElementChild!==sec)host.parentNode.appendChild(sec);
  }
  function banner(){
    var v;try{v=sessionStorage.getItem('ppLiteBanner');sessionStorage.removeItem('ppLiteBanner');}catch(e){}
    if(!v)return;
    var b=document.createElement('div');b.id='pp-lite-banner';
    b.innerHTML=v==='on'?'<span class="pp-lite-bt"><span class="pp-lite-spark">\u2728</span>Press Play Lite<span class="pp-lite-spark">\u2728</span></span><small>Press Play, without the clutter.</small>':'<span class="pp-lite-bt"><span class="pp-lite-spark">\u{1F389}</span>Full Press Play restored<span class="pp-lite-spark">\u{1F389}</span></span><small>All features are back.</small>';
    document.body.appendChild(b);
    requestAnimationFrame(function(){requestAnimationFrame(function(){b.classList.add('show');});});
    setTimeout(function(){b.classList.remove('show');setTimeout(function(){b.remove();},700);},5000);
  }
  var lastT=0;
  window.__ppLiteToggle=function(e){var n=Date.now();if(n-lastT<600)return;lastT=n;if(e&&e.preventDefault)e.preventDefault();toggle();};
  ['click'].forEach(function(ev){
    document.addEventListener(ev,function(e){
      var t=e.target&&e.target.closest&&e.target.closest('#pp-lite-toggle');
      if(t)window.__ppLiteToggle(e);
    },true);
  });
  build();banner();setTimeout(build,1000);setTimeout(build,3000);
  applyLiteBits();
  setTimeout(applyLiteBits,500);setTimeout(applyLiteBits,2000);
  if(on){var n=0,iv=setInterval(function(){applyLiteBits();if(++n>20)clearInterval(iv);},1000);}
})();
