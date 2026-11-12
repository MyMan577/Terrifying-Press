(function(){
  var st=document.createElement('style');
  st.textContent='#eq-bands,#eq-bands .eq-band-slider-wrap{touch-action:none}#eq-bands .eq-band-slider-wrap input[type=range]{pointer-events:none;touch-action:none}';
  document.head.appendChild(st);
  function wire(wrap){
    var inp=wrap.querySelector('input[type=range]'); if(!inp||wrap._ppEqTouch)return; wrap._ppEqTouch=1;
    var act=false,moved=false;
    function set(e){
      var r=wrap.getBoundingClientRect(),pad=8;
      var t=1-Math.min(1,Math.max(0,(e.clientY-r.top-pad)/Math.max(1,r.height-2*pad)));
      var min=+inp.min,max=+inp.max,step=+inp.step||0.5;
      var v=Math.min(max,Math.max(min,Math.round((min+t*(max-min))/step)*step));
      if(+inp.value!==v){inp.value=v;moved=true;inp.dispatchEvent(new Event('input',{bubbles:true}));}
    }
    wrap.addEventListener('pointerdown',function(e){act=true;moved=false;try{wrap.setPointerCapture(e.pointerId)}catch(x){}e.preventDefault();e.stopPropagation();set(e)});
    wrap.addEventListener('pointermove',function(e){if(act){e.preventDefault();set(e)}});
    function end(){if(act&&moved)inp.dispatchEvent(new Event('change',{bubbles:true}));act=false}
    ['pointerup','pointercancel'].forEach(function(n){wrap.addEventListener(n,end)});
    wrap.addEventListener('touchmove',function(e){e.preventDefault()},{passive:false});
  }
  function all(){document.querySelectorAll('#eq-bands .eq-band-slider-wrap').forEach(wire)}
  all(); setTimeout(all,800);
  var host=document.getElementById('eq-bands'); if(host&&window.MutationObserver)new MutationObserver(all).observe(host,{childList:true,subtree:true});
})();
