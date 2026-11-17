(function(){
  var KEYS={playground:'ppPlaygroundMode',lite:'ppLiteMode',plus:'ppPlusMode',premium:'ppPremiumMode',focus:'ppFocusMode'};
  var ls={g:function(k){try{return localStorage.getItem(k)}catch(e){return null}},s:function(k,v){try{localStorage.setItem(k,v)}catch(e){}}};
  var toast=function(m){try{window.ppToast(m)}catch(e){}};
  var cur=function(){for(var k in KEYS){if(ls.g(KEYS[k])==='1')return k}return null};
  // Task gate (see pp-gate-core). If it somehow failed to load, nothing is locked.
  var G=window.PPModeGate||{unlocked:function(){return true},legacy:function(){return true},state:function(){return {}},check:function(){},done:function(){},addClean:function(){},addPlay:function(){},quizBest:function(){return 0},marathonBest:function(){return 0},playGoal:10800000,plusPass:75,premiumPass:90};
  var NAMES={lite:'Press Play Lite',plus:'Press Play PLUS',premium:'Press Play PREMIUM',playground:'Press Play Playground',focus:'Press Play Focus'};
  function hmm(ms){var t=Math.floor(ms/60000);return Math.floor(t/60)+'h '+('0'+(t%60)).slice(-2)+'m'}
  function taskText(m){
    var st=G.state();
    if(m==='playground')return 'Playground is sold in the shop: open Games \u2192 Points \u2192 Shop \u2192 For Press Play and buy Press Play Playground.';
    var played=hmm(Math.min(G.playGoal,(st.played||0)))+' / '+hmm(G.playGoal);
    if(m==='plus'||m==='focus')return 'pass the Press Play quiz in Settings (75% or better; best so far: '+G.quizBest()+'%), or just use the app: '+Math.round(G.playGoal/3600000)+' hours of listening or watching ('+played+' so far).';
    return 'score 90% (27 of 30) in The Marathon in Settings (best so far: '+G.marathonBest()+'%).';
  }
  // Count real listening/watching time: 3 hours earns PLUS and Focus.
  (function(){
    var A=document.getElementById('audio'),V=document.getElementById('video-el');
    ppEvery(function(){
      var gs=G.state(); if(G.legacy()||(gs.plus&&gs.focus))return;
      var playing=(V&&V.currentSrc&&!V.paused&&!V.ended)||(A&&A.currentSrc&&!A.paused&&!A.ended);
      if(playing)G.addPlay(1000);
    },1000);
    ppEvery(function(){G.check()},2000);
    window.addEventListener('ppgate',function(e){toast((NAMES[e.detail]||'A mode')+' unlocked. Find it under Settings \u2192 App mode.')});
  })();
  // One-time notice for people who already had data before modes became earned.
  function notice(){
    if(!G.legacy()||G.state().notice||document.getElementById('pp-gate-notice'))return;
    var d=document.createElement('div'); d.id='pp-gate-notice';
    d.style.cssText='position:fixed;left:12px;right:12px;bottom:calc(12px + env(safe-area-inset-bottom,0px));z-index:99998;max-width:460px;margin:0 auto;box-sizing:border-box;background:var(--bg-elev);color:var(--text);border:1px solid var(--accent-dim,var(--line));border-radius:14px;padding:14px 16px;box-shadow:0 10px 30px rgba(0,0,0,.55);font-size:12.5px;line-height:1.5';
    d.innerHTML='<div style="font-weight:700;font-size:14px;margin-bottom:6px">How app modes unlock</div>'
      +'<div style="color:var(--text-dim)"><b>Lite</b> is free for everyone. <b>PLUS</b> and the new <b>Focus</b> mode unlock by passing the quiz or after 3 hours of listening, and <b>PREMIUM</b> by scoring 90% in The Marathon.</div>'
      +'<div style="margin-top:8px"><b style="color:var(--accent)">Nothing changes.</b> Existing data was found, so every mode except Playground stays unlocked, the new Focus mode included, and progress, levels and settings are untouched.</div>'
      +'<button type="button" id="pp-gate-ok" style="margin-top:12px;padding:8px 16px;border-radius:8px;border:1px solid var(--accent-dim,var(--line));background:transparent;color:var(--accent);font:600 12.5px system-ui,sans-serif;cursor:pointer">Got it</button>';
    document.body.appendChild(d);
    d.querySelector('#pp-gate-ok').addEventListener('click',function(){G.state().notice=true;try{localStorage.setItem('ppModeGateV1',JSON.stringify(G.state()))}catch(e){}d.remove()});
  }
  setTimeout(notice,1500);
  var st=document.createElement('style');
  st.textContent='body.pp-premium #ppxp-badge-slot,body.pp-premium #ppxp-expshop-entry-section,body.pp-premium #ppxp-quiz-entry-section,body.pp-premium #ppxp-rank-entry-section,body.pp-premium #dc-widget,body.pp-premium .settings-section:has(#dc-sidebar-toggle),body.pp-premium .settings-section:has(#dc-background-earn-toggle){display:none !important}';
  document.head.appendChild(st);
  // Focus: everything Premium hides, plus the games, the Points entry, Bloopy's mascot and pop-ups, and the clicker.
  // Decoration that repaints the screen non-stop is frozen: animated backgrounds and frosted-glass blur.
  var stF=document.createElement('style');
  stF.textContent='body.pp-focus #ppxp-badge-slot,body.pp-focus #ppxp-expshop-entry-section,body.pp-focus #ppxp-quiz-entry-section,body.pp-focus #ppxp-rank-entry-section,body.pp-focus #ppp-entry-section,body.pp-focus #pp-marathon-section,body.pp-focus #dc-widget,body.pp-focus .settings-section:has(#dc-sidebar-toggle),body.pp-focus .settings-section:has(#dc-background-earn-toggle),body.pp-focus .pp-games-btn,body.pp-focus [data-pp-games],body.pp-focus #ppv-mrow,body.pp-focus #ppv-mfloat,body.pp-focus #pgr-fab{display:none !important}'
    +'body.pp-focus .ppxp-anim-bg{animation:none !important}'
    +'body.pp-focus *,body.pp-focus *::before,body.pp-focus *::after{backdrop-filter:none !important;-webkit-backdrop-filter:none !important}';
  document.head.appendChild(stF);
  var st2=document.createElement('style'); st2.textContent='#pp-mode-banner{position:fixed;top:0;left:0;right:0;z-index:99999;box-sizing:border-box;text-align:center;padding:calc(18px + env(safe-area-inset-top,0px)) 16px 18px;transform:translateY(-110%);transition:transform .55s cubic-bezier(.2,.9,.3,1);overflow:hidden;pointer-events:none}#pp-mode-banner.show{transform:none}#pp-mode-banner .t{display:block;position:relative;z-index:1}#pp-mode-banner small{display:block;position:relative;z-index:1;margin-top:4px}#pp-mode-banner.lite{background:var(--bg-elev);color:var(--text);border-bottom:1px solid var(--accent)}#pp-mode-banner.lite .t{font:600 17px system-ui,sans-serif;letter-spacing:.2px}#pp-mode-banner.lite small{font:400 12.5px system-ui,sans-serif;color:var(--text-dim)}#pp-mode-banner.plus{background:linear-gradient(90deg,#f59e0b,#ec4899,#8b5cf6,#22d3ee,#f59e0b);background-size:200% 100%;color:#fff;animation:ppmFlow 4s linear infinite,ppmGlow 2s ease-in-out infinite}#pp-mode-banner.plus .t{font:800 clamp(15px,5.2vw,21px) system-ui,sans-serif;white-space:nowrap;text-shadow:0 0 12px rgba(255,255,255,.9),0 2px 6px rgba(0,0,0,.35)}#pp-mode-banner.plus small{font:600 13px system-ui,sans-serif;text-shadow:0 1px 4px rgba(0,0,0,.35)}#pp-mode-banner.plus::after{content:\'\';position:absolute;top:0;bottom:0;left:-60%;width:40%;background:linear-gradient(100deg,transparent,rgba(255,255,255,.65),transparent);transform:skewX(-20deg);animation:ppmShine 1.6s ease-in-out infinite}#pp-mode-banner.premium{background:radial-gradient(120% 160% at 50% 0%,#3a1a6b 0%,#1b0a33 70%);border-bottom:2px solid #d4af57;box-shadow:0 6px 30px rgba(212,175,87,.35)}#pp-mode-banner.premium .t{font:700 clamp(15px,5.4vw,23px) Georgia,serif;letter-spacing:.03em;white-space:nowrap}#pp-mode-banner.premium .cr{-webkit-text-fill-color:initial}#pp-mode-banner.premium .g{display:inline-block;font:inherit;letter-spacing:inherit;background:linear-gradient(100deg,#b8892d,#f6e3a1,#d4af57,#f6e3a1,#b8892d);background-size:250% 100%;-webkit-background-clip:text;background-clip:text;color:transparent;-webkit-text-fill-color:transparent;animation:ppmGold 3.5s linear infinite}#pp-mode-banner.focus{background:var(--bg-elev);color:var(--text);border-bottom:2px solid #34d399}#pp-mode-banner.focus .t{font:700 clamp(15px,5.2vw,20px) system-ui,sans-serif;letter-spacing:.3px}#pp-mode-banner.focus small{font:400 12.5px system-ui,sans-serif;color:var(--text-dim)}#pp-mode-banner.premium small{font:italic 400 14px Georgia,\'Times New Roman\',serif;color:#e6d49a;letter-spacing:.04em}@keyframes ppmFlow{to{background-position:200% 0}}@keyframes ppmGold{to{background-position:250% 0}}@keyframes ppmShine{0%{left:-60%}100%{left:140%}}@keyframes ppmGlow{0%,100%{box-shadow:0 4px 20px rgba(124,58,237,.6)}50%{box-shadow:0 6px 40px rgba(236,72,153,.95),0 0 60px rgba(34,211,238,.5)}}@media (prefers-reduced-motion:reduce){#pp-mode-banner,#pp-mode-banner *{animation:none !important;transition:none !important}}'; document.head.appendChild(st2);
  var bt=null;
  function banner(m){
    var old=document.getElementById('pp-mode-banner'); if(old)old.remove(); clearTimeout(bt);
    var d={playground:['\uD83C\uDFAA Press Play Playground \uD83C\uDFAA','Everything unlocked. Everything unleashed.'],lite:['Press Play Lite','Simple. Just play.'],focus:['\u25C9 Press Play Focus','Everything unlocked. Nothing in the way. Easy on the battery.'],plus:['\u2728 Press Play PLUS \u2728','Everything unlocked. Turn it up.'],premium:['<span class="cr">\uD83D\uDC51</span> <span class="g">Press Play PREMIUM</span> <span class="cr">\uD83D\uDC51</span>','Welcome. Everything is unlocked.']}[m];
    var el=document.createElement('div'); el.id='pp-mode-banner'; el.className=m; el.innerHTML='<span class="t">'+d[0]+'</span><small>'+d[1]+'</small>'; document.body.appendChild(el);
    requestAnimationFrame(function(){requestAnimationFrame(function(){el.classList.add('show')})});
    bt=setTimeout(function(){el.classList.remove('show');setTimeout(function(){el.remove()},700)}, m==='premium'?6000:4500);
  }
  // Levels/EXP are paused in Lite, Premium and Focus so no rank-up pop-ups appear. Saved levels are untouched and resume when switched off.
  function xp(pause){var a=window.PPXpApi; if(!a)return; if(!window.__ppXpO)window.__ppXpO={w:a.recordWatchTime,c:a.recordCompletion};
    if(pause){a.recordWatchTime=function(){};a.recordCompletion=function(){};}else{a.recordWatchTime=window.__ppXpO.w;a.recordCompletion=window.__ppXpO.c;}}
  // Focus's native side. Returns true when the app is about to reload (switching video players needs a fresh page).
  //  - Video goes through Android's own player: hardware decoding straight to the screen, with no frame copies
  //    through the page. It is only switched on if it was off, and switched back off when Focus ends.
  //  - The screen is held at 60 Hz instead of 120 Hz while the app is open.
  // Everything else Focus does is read from body.pp-focus by the parts that care (visualizer, tagger, wake word...).
  var FOCUS_NV='ppFocusNativeVideo';
  // switching: true when the user just picked the mode (at start-up a video player the user changed by hand is left alone).
  function focusPower(on,switching){
    var was=!!window.ppFocus; window.ppFocus=!!on;
    if(was!==!!on){try{window.dispatchEvent(new CustomEvent('ppfocus',{detail:!!on}))}catch(e){}}
    try{var GM=window.Capacitor&&Capacitor.Plugins&&Capacitor.Plugins.PPGameMode; if(GM&&GM.cap)GM.cap({on:!!on}).catch(function(){})}catch(e){}
    try{
      var N=window.PPNative, native=N&&N.setNativeVideo&&N.nativeVideoSetting&&window.Capacitor&&Capacitor.isNativePlatform&&Capacitor.isNativePlatform();
      if(!native)return false;
      if(on&&switching&&!N.nativeVideoSetting()){ls.s(FOCUS_NV,'1');N.setNativeVideo(true);return true}
      if(!on&&ls.g(FOCUS_NV)==='1'){try{localStorage.removeItem(FOCUS_NV)}catch(e){} if(N.nativeVideoSetting()){N.setNativeVideo(false);return true}}
    }catch(e){}
    return false;
  }
  function apply(m){
    if(m&&!G.unlocked(m))return;
    for(var k in KEYS){ls.s(KEYS[k],k===m?'1':'0'); document.body.classList.toggle('pp-'+k,k===m);}
    xp(m==='lite'||m==='premium'||m==='focus');
    try{window.PPXpApi&&window.PPXpApi.refreshUnlocks&&window.PPXpApi.refreshUnlocks()}catch(e){}
    if(m==='playground'){try{window.PPClicker&&window.PPClicker.show()}catch(e){}}
    return focusPower(m==='focus',true);
    if(m==='lite'){ // simple layout: no custom accent, and the two extra EQ bands stay usable
      document.documentElement.style.removeProperty('--accent');document.documentElement.style.removeProperty('--accent-dim');
      document.querySelectorAll('.eq-band-pro').forEach(function(b){b.classList.add('unlocked')});
    }
  }
  var MODES=[['lite','Press Play Lite','Simple layout: fewer EQ presets and filters, no levels, EXP or games. Every audio and video tool stays.'],
    ['plus','Press Play PLUS','Everything unlocked from the start: presets, EQ bands, backgrounds, colors and perks. Levels, EXP and games stay on.'],
    ['premium','Press Play PREMIUM','Everything unlocked, every tool kept, and levels, EXP and games hidden.'],
    ['focus','Press Play Focus','Press Play, focused: every perk, preset and background unlocked, with levels, games, the mascot and the clicker out of the way. Built for battery: the video player uses the phone\'s own decoder, the screen runs at 60 Hz, the visualizer draws at 30 fps, moving backgrounds and blur hold still, and Bloopy\'s wake word and background tagging wait for the charger. Every audio and video tool stays.'],
    ['playground','Press Play Playground','Everything unlocked, the clicker out (hide it in Settings if you like), every game exclusive free, and a Playground of orders, charms, a daily wheel and more. Levels, EXP and games stay on.']];
  var EDGE={focus:'#34d399',lite:'var(--accent)',plus:'#ec4899',premium:'#d4af57',playground:'#b05cff'};
  function label(){var c=cur(),n=MODES.filter(function(x){return x[0]===c})[0];return n?n[1]:'Standard'}
  function refreshRow(){var el=document.getElementById('pp-mode-current');if(el)el.textContent=label()}
  function closeMenu(){var o=document.getElementById('pp-mode-menu');if(o)o.remove()}
  function openMenu(){
    closeMenu(); var c=cur();
    var o=document.createElement('div'); o.id='pp-mode-menu';
    o.style.cssText='position:fixed;inset:0;z-index:99997;background:rgba(0,0,0,.6);display:flex;align-items:flex-end;justify-content:center';
    var sh=document.createElement('div');
    sh.style.cssText='background:var(--bg-elev);color:var(--text);border:1px solid var(--line);border-radius:16px 16px 0 0;padding:16px 16px calc(16px + env(safe-area-inset-bottom,0px));width:min(480px,100%);max-height:86vh;overflow:auto';
    sh.innerHTML='<div style="font-weight:600;font-size:15px;margin-bottom:6px">App mode</div>'+MODES.map(function(m){var on=m[0]===c,lk=!G.unlocked(m[0]);
      return '<button type="button" data-mode="'+m[0]+'" style="display:block;width:100%;text-align:left;margin:8px 0;padding:12px 14px;border-radius:12px;background:var(--bg);color:var(--text);font:inherit;cursor:pointer;opacity:'+(lk?'.7':'1')+';border:'+(on?'2px':'1px')+' solid '+(on?EDGE[m[0]]:'var(--line)')+'"><span style="display:flex;justify-content:space-between;font-weight:600;font-size:14px"><span>'+m[1]+'</span><span style="font-size:12px;color:'+EDGE[m[0]]+'">'+(on?'On':(lk?'\uD83D\uDD12 Locked':''))+'</span></span><span style="display:block;margin-top:4px;font-size:12px;color:var(--text-dim);line-height:1.4;font-weight:400">'+m[2]+'</span>'+(lk?'<span style="display:block;margin-top:6px;font-size:11.5px;color:'+EDGE[m[0]]+'">To unlock: '+taskText(m[0])+'</span>':'')+'</button>'}).join('')
      +'<div style="font-size:11px;color:var(--text-dim);margin-top:8px;line-height:1.45">Tap the active mode again to return to standard. Switching never stops playback.'+(G.legacy()?' Everything is already unlocked.':' Locked modes unlock by completing their task.')+'</div>';
    o.appendChild(sh); document.body.appendChild(o);
    o.addEventListener('click',function(e){
      if(e.target===o){closeMenu();return}
      var b=e.target.closest&&e.target.closest('button[data-mode]'); if(!b)return;
      if(b.dataset.mode!==cur()&&!G.unlocked(b.dataset.mode)){toast('Locked: '+taskText(b.dataset.mode));return}
      var m=b.dataset.mode===cur()?null:b.dataset.mode;
      var reloading=apply(m); closeMenu(); refreshRow();
      if(reloading){try{sessionStorage.setItem('ppModeBanner',m||'')}catch(e){}return}
      if(m){banner(m)}else{toast('Standard mode.')}
    });
  }
  document.addEventListener('keydown',function(e){if(e.key==='Escape')closeMenu()});
  function build(){
    var host=document.getElementById('gestures-section'); if(!host||document.getElementById('pp-modes-section'))return;
    var sec=document.createElement('div'); sec.className='settings-section'; sec.id='pp-modes-section';
    sec.innerHTML='<div class="settings-row"><div class="settings-row-text"><div class="settings-row-title">App mode</div><div class="settings-row-sub" id="pp-mode-current"></div></div><button type="button" class="settings-toggle-btn" id="pp-mode-open">Choose</button></div>';
    host.parentNode.appendChild(sec); refreshRow();
    sec.querySelector('#pp-mode-open').addEventListener('click',openMenu);
  }
  var c0=cur(); if(c0){document.body.classList.add('pp-'+c0); if(c0==='premium'||c0==='focus')setTimeout(function(){xp(true);try{window.PPXpApi.refreshUnlocks()}catch(e){}},1000);}
  if(c0==='focus')focusPower(true); else focusPower(false);
  try{var pb=sessionStorage.getItem('ppModeBanner');if(pb!==null){sessionStorage.removeItem('ppModeBanner');setTimeout(function(){if(pb)banner(pb);else toast('Standard mode.')},600)}}catch(e){}
  build(); setTimeout(build,1000); setTimeout(build,3000);
})();
