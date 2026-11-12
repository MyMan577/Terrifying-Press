(function(){
  const $=id=>document.getElementById(id), ls={g:k=>{try{return localStorage.getItem(k)}catch(e){return null}},s:(k,v)=>{try{localStorage.setItem(k,v)}catch(e){}}};
  const toast=(m,t)=>{try{showToast(m,t)}catch(e){}};
  /* ---- Video adjustment sliders (filter dropdown) ---- */
  const D={b:100,c:100,s:100,h:0}; try{Object.assign(D,JSON.parse(ls.g('ppVidAdj')||'{}'))}catch(e){}
  const adj=window.__ppAdj={...D}; const dd=$('filter-dropdown');
  const css=()=>{const a=window.__ppAdj,p=[]; if(a.b!=100)p.push('brightness('+a.b/100+')'); if(a.c!=100)p.push('contrast('+a.c/100+')'); if(a.s!=100)p.push('saturate('+a.s/100+')'); if(a.h!=0)p.push('hue-rotate('+a.h+'deg)'); return p.join(' ')};
  window.__ppAdjCss=css;
  if(dd){
    const box=document.createElement('div'); box.style.cssText='padding:10px 12px;border-top:1px solid var(--line);font-size:12px';
    const rows=[['b','Brightness',50,150,'%'],['c','Contrast',50,150,'%'],['s','Saturation',0,200,'%'],['h','Hue',-180,180,'°']];
    box.innerHTML='<div style="font-weight:600;margin-bottom:6px">Adjust picture</div>'+rows.map(r=>'<label style="display:flex;align-items:center;gap:8px;margin:5px 0"><span style="width:76px">'+r[1]+'</span><input type="range" data-adj="'+r[0]+'" min="'+r[2]+'" max="'+r[3]+'" value="'+adj[r[0]]+'" style="flex:1"><span data-adjv="'+r[0]+'" style="width:44px;text-align:right">'+adj[r[0]]+r[4]+'</span></label>').join('')+'<button type="button" id="pp-adj-reset" class="full-row" style="margin-top:6px">Reset adjustments</button>';
    dd.appendChild(box);
    const apply=()=>{ls.s('ppVidAdj',JSON.stringify(window.__ppAdj)); window.__ppApplyVF&&window.__ppApplyVF()};
    box.addEventListener('input',e=>{const k=e.target.dataset&&e.target.dataset.adj; if(!k)return; window.__ppAdj[k]=+e.target.value; box.querySelector('[data-adjv="'+k+'"]').textContent=e.target.value+(k==='h'?'°':'%'); apply()});
    $('pp-adj-reset').onclick=()=>{Object.assign(window.__ppAdj,{b:100,c:100,s:100,h:0}); box.querySelectorAll('[data-adj]').forEach(i=>{i.value=window.__ppAdj[i.dataset.adj]; box.querySelector('[data-adjv="'+i.dataset.adj+'"]').textContent=i.value+(i.dataset.adj==='h'?'°':'%')}); apply()};
    setTimeout(()=>window.__ppApplyVF&&window.__ppApplyVF(),600);
  }
})();
