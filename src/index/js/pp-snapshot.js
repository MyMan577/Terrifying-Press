/* Press Play addon: save the current video frame as a PNG (button next to PiP, or press S) */
(function(){
  const V=document.getElementById('video-el'), pip=document.getElementById('pip-btn');
  if(!V) return;
  const toast=m=>{try{showToast(m);}catch(e){}};
  function snap(){
    if(!V.currentSrc||!V.videoWidth){toast('Play a video to save a snapshot.');return;}
    if(window.PPNative&&PPNative.videoActive()){
      const t0=((document.getElementById('np-title')||{}).textContent||'snapshot').replace(/[^\w\- ]+/g,'').trim().slice(0,60)||'snapshot';
      PPNative.snapshot().then(b=>{window.ppSaveBlob(b, t0+' '+Math.floor(V.currentTime)+'s.png'); toast('Snapshot saved');}).catch(()=>toast('Snapshot failed.'));
      return;
    }
    try{
      const c=document.createElement('canvas'); c.width=V.videoWidth; c.height=V.videoHeight;
      const x=c.getContext('2d'), f=getComputedStyle(V).filter;
      if(f&&f!=='none'){try{x.filter=f;}catch(e){}}
      x.drawImage(V,0,0,c.width,c.height);
      const t=((document.getElementById('np-title')||{}).textContent||'snapshot').replace(/[^\w\- ]+/g,'').trim().slice(0,60)||'snapshot';
      c.toBlob(b=>{
        if(!b){toast('Snapshot failed.');return;}
        window.ppSaveBlob(b, t+' '+Math.floor(V.currentTime)+'s.png');
        toast('Snapshot saved');
      },'image/png');
    }catch(e){toast('This video source blocks snapshots.');}
  }
  if(pip&&pip.parentNode){
    const b=pip.cloneNode(false); b.id='snap-btn'; b.type='button'; b.title='Save snapshot (S)'; b.setAttribute('aria-label','Save snapshot');
    b.innerHTML='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/></svg>';
    b.addEventListener('click',snap); pip.parentNode.insertBefore(b,pip.nextSibling);
  }
  document.addEventListener('keydown',e=>{
    const t=e.target&&e.target.tagName; if(t==='INPUT'||t==='TEXTAREA'||t==='SELECT'||e.ctrlKey||e.metaKey||e.altKey) return;
    if(e.key==='s'||e.key==='S'){e.preventDefault(); snap();}
  });
})();
