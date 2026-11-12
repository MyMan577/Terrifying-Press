(function(){
  var KEY='ppPlusMode', LITE='ppLiteMode', HIDE='ppPlusHidden', SEEN='ppPlusFirstSeen', NEW_DAYS=7;
  function rd(k){try{return localStorage.getItem(k);}catch(e){return null;}}
  function get(){return rd(KEY)==='1';}
  function liteOn(){return rd(LITE)==='1';}
  function hidden(){return rd(HIDE)==='1';}
  function setHidden(v){try{if(v)localStorage.setItem(HIDE,'1');else localStorage.removeItem(HIDE);}catch(e){}}
  function showNew(){
    try{
      var t=parseInt(localStorage.getItem(SEEN),10);
      if(!t){localStorage.setItem(SEEN,String(Date.now()));return true;}
      return (Date.now()-t)<NEW_DAYS*86400000;
    }catch(e){return true;}
  }
  if(get()&&!liteOn())document.body.classList.add('pp-plus');
  function ask(turningOn,cb){
    var sec=document.getElementById('pp-plus-section');if(!sec)return;
    var old=document.getElementById('pp-plus-confirm');if(old){old.remove();}
    var c=document.createElement('div');c.id='pp-plus-confirm';
    var d=turningOn
      ?'The app will reset and reopen with every level reward unlocked from the start: all EQ presets and bands, custom EQ slots, backgrounds, accent color, quick speed and boost buttons, skip intro/outro, and jump buttons. Levels and EXP stay.'+(liteOn()?' This also turns off Press Play Lite.':'')
      :'The app will reset and reopen with perks unlocking by level again. Progress is kept.';
    c.innerHTML='<div class="pl-q">'+(turningOn?'Switch to Press Play PLUS?':'Switch back to normal Press Play?')+'</div><div class="pl-d">'+d+'</div><button type="button" class="pl-yes">'+(turningOn?'Yes, go PLUS':'Yes, switch back')+'</button><button type="button" class="pl-no">Cancel</button>';
    sec.appendChild(c);
    var tb=document.getElementById('pp-plus-toggle');if(tb)tb.style.display='none';
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
        if(turningOn){localStorage.setItem(LITE,'0');localStorage.setItem('ppPremiumMode','0');}
        sessionStorage.setItem('ppPlusBanner',turningOn?'on':'off');
      }catch(e){}
      try{location.reload();}catch(e){}
      // fallback if reload is blocked by the host: apply live
      setTimeout(function(){
        document.body.classList.toggle('pp-plus',turningOn);
        if(turningOn)document.body.classList.remove('pp-lite');
        var bt=document.getElementById('pp-plus-toggle');
        if(bt)bt.textContent=turningOn?'Turn off':'Turn on';
        try{if(window.PPXpApi&&window.PPXpApi.refreshUnlocks)window.PPXpApi.refreshUnlocks();}catch(e){}
        banner();
      },800);
    });
  }
  function build(){return;
    var host=document.getElementById('gestures-section');
    if(!host)return;
    var sec=document.getElementById('pp-plus-section');
    var rest=document.getElementById('pp-plus-restore');
    var anchor=document.getElementById('pp-lite-section')||document.getElementById('pp-lite-restore');
    function place(el){
      // sit just above the Press Play Lite card when it exists, otherwise at the end
      if(anchor){if(el.nextElementSibling!==anchor)anchor.parentNode.insertBefore(el,anchor);}
      else if(host.parentNode.lastElementChild!==el)host.parentNode.appendChild(el);
    }
    if(hidden()&&!get()){
      if(sec)sec.remove();
      if(!rest){
        rest=document.createElement('button');rest.type='button';rest.id='pp-plus-restore';
        rest.textContent='Show Press Play PLUS option';
        rest.addEventListener('click',function(){setHidden(false);rest.remove();build();});
      }
      place(rest);
      return;
    }
    if(rest)rest.remove();
    if(!sec){
      sec=document.createElement('div');
      sec.className='settings-section';sec.id='pp-plus-section';
      var tag=showNew()?'<span class="pp-plus-tag">NEW</span>':'';
      sec.innerHTML='<div class="pp-plus-row"><div class="pp-plus-text"><div class="pp-plus-title">Press Play PLUS'+tag+'</div><p>Every level reward unlocked from the start: presets, backgrounds, colors and perks. Levels and EXP stay.</p></div><button id="pp-plus-toggle" type="button"></button></div>'+(get()?'':'<button type="button" class="pp-plus-hide">Don\'t show this</button>');
      sec.querySelector('#pp-plus-toggle').textContent=get()?'Turn off':'Turn on';
      var hide=sec.querySelector('.pp-plus-hide');
      if(hide)hide.addEventListener('click',function(){setHidden(true);build();});
    }
    place(sec);
  }
  function banner(){
    var v;try{v=sessionStorage.getItem('ppPlusBanner');sessionStorage.removeItem('ppPlusBanner');}catch(e){}
    if(!v)return;
    var b=document.createElement('div');b.id='pp-lite-banner';b.className='plus';
    b.innerHTML=v==='on'
      ?'<span class="pp-lite-bt"><span class="pp-lite-spark">\u2728</span>Press Play PLUS<span class="pp-lite-spark">\u2728</span></span><small>Every reward unlocked. Levels and EXP kept.</small>'
      :'<span class="pp-lite-bt">Back to normal Press Play</span><small>Perks unlock by level again.</small>';
    document.body.appendChild(b);
    requestAnimationFrame(function(){requestAnimationFrame(function(){b.classList.add('show');});});
    setTimeout(function(){b.classList.remove('show');setTimeout(function(){b.remove();},700);},5000);
  }
  var lastT=0;
  window.__ppPlusToggle=function(e){var n=Date.now();if(n-lastT<600)return;lastT=n;if(e&&e.preventDefault)e.preventDefault();toggle();};
  document.addEventListener('click',function(e){
    var t=e.target&&e.target.closest&&e.target.closest('#pp-plus-toggle');
    if(t)window.__ppPlusToggle(e);
  },true);
  build();banner();setTimeout(build,1000);setTimeout(build,3000);
})();
