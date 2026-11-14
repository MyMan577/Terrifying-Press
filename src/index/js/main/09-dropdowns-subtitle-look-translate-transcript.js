  // ---------- Keep anchored dropdowns on-screen ----------
  // The EQ/speed/sleep/viz-sensitivity/latency/subtitle/filter popovers
  // all anchor to their trigger button and open either above or below
  // it. On short viewports (a phone in landscape) there isn't always
  // room for the dropdown's full height on whichever side it opens, so
  // clamp it to whatever room is actually available and let it scroll
  // internally instead of running off-screen with no way to reach it.
  //
  // That only ever fixed vertical clipping. Horizontally these are all
  // anchored (left:0, right:0, or centered) relative to their own small
  // pill button, with no awareness of the viewport - a pill sitting near
  // the left or right edge of the screen (quick bar pills wrap/scroll on
  // narrow layouts, and the row itself can sit close to either edge) ends
  // up with its dropdown spilling off that edge and getting visually cut
  // off with no way to reach the clipped part. Every clamped dropdown gets
  // a `transform: translateX(var(--clamp-shift-x, 0px))` (additive to any
  // base transform, e.g. eq-dropdown's centering translateX(-50%)) that we
  // set here to nudge it back fully into view.
  function clampDropdownToViewport(dropdown){
    if (!dropdown || !dropdown.classList.contains('open')) return;
    dropdown.style.maxHeight = '';
    dropdown.style.overflowY = '';
    dropdown.style.setProperty('--clamp-shift-x', '0px');
    // Dropdowns relocated into the settings menu become static, in-flow
    // content inside that panel's own scroll area, they don't need this.
    if (getComputedStyle(dropdown).position !== 'absolute') return;
    const margin = 10;
    const rect = dropdown.getBoundingClientRect();
    const vh = window.innerHeight;
    const vw = window.innerWidth;
    let maxAllowed = null;
    if (rect.top < margin){
      maxAllowed = rect.bottom - margin;
    } else if (rect.bottom > vh - margin){
      maxAllowed = vh - rect.top - margin;
    }
    if (maxAllowed && maxAllowed > 60 && maxAllowed < rect.height){
      dropdown.style.maxHeight = maxAllowed + 'px';
      dropdown.style.overflowY = 'auto';
    }
    let shiftX = 0;
    if (rect.left < margin) shiftX = margin - rect.left;
    else if (rect.right > vw - margin) shiftX = (vw - margin) - rect.right;
    if (shiftX !== 0) dropdown.style.setProperty('--clamp-shift-x', shiftX + 'px');
  }
  const CLAMPED_DROPDOWN_IDS = ['subtitle-dropdown','filter-dropdown','pip-dropdown','viz-sens-dropdown','latency-dropdown','speed-dropdown','sleep-dropdown','ab-dropdown','eq-dropdown','memc-dropdown','upscale-dropdown','boost-dropdown','fx-dropdown'];
  function clampOpenDropdowns(){
    CLAMPED_DROPDOWN_IDS.forEach(id => clampDropdownToViewport(document.getElementById(id)));
  }
  window.addEventListener('resize', clampOpenDropdowns);
  window.addEventListener('orientationchange', () => setTimeout(clampOpenDropdowns, 60));

  // ---- Hoist open dropdowns above everything (incl. media controls) ----
  const PP_HOIST_IDS = CLAMPED_DROPDOWN_IDS.concat(['add-dropdown','sort-dropdown']);
  const ppHoisted = new Map(); // dropdown -> placeholder comment
  const ppPopupHost = () => document.fullscreenElement || document.body;
  function ppHoist(d){
    if (ppHoisted.has(d) || !d.classList.contains('open')) return;
    if (getComputedStyle(d).position !== 'absolute') return; // skip static ones in the settings menu
    d.style.transition = 'none';   // Refined look eases popovers in: measure where it ends up, not where the ease starts
    const r = d.getBoundingClientRect();
    d.style.transition = '';
    const ph = document.createComment('dropdown');
    d.parentNode.replaceChild(ph, d);
    ppHoisted.set(d, ph);
    ppPopupHost().appendChild(d);
    Object.assign(d.style, { position:'fixed', left:r.left+'px', top:r.top+'px', right:'auto', bottom:'auto', transform:'none', width:r.width+'px', zIndex:'99980', pointerEvents:'auto' });
  }
  function ppUnhoist(d){
    const ph = ppHoisted.get(d); if (!ph) return;
    ppHoisted.delete(d);
    if (ph.parentNode) ph.parentNode.replaceChild(d, ph);
    ['position','left','top','right','bottom','transform','width','zIndex','pointerEvents'].forEach(p => { d.style[p] = ''; });
  }
  function ppRefreshPopups(e){
    if (e && e.target && e.target.closest && e.target.closest('[id$="-dropdown"]') && ppHoisted.has(e.target.closest('[id$="-dropdown"]'))) return;
    Array.from(ppHoisted.keys()).forEach(d => {
      const st = d.scrollTop;
      ppUnhoist(d);
      clampDropdownToViewport(d);
      ppHoist(d);
      d.scrollTop = st;
    });
  }
  PP_HOIST_IDS.forEach(id => {
    const d = document.getElementById(id); if (!d) return;
    new MutationObserver(() => {
      if (d.classList.contains('open')){ if (ppHoisted.has(d)) d.style.pointerEvents = 'auto'; else ppHoist(d); return; }
      if (!ppHoisted.has(d)) return;
      // Refined look: leave it in place while it fades out (moving it back in the page would cut the fade short)
      if (!document.body.classList.contains('pp-refined')){ ppUnhoist(d); return; }
      d.style.pointerEvents = 'none';
      setTimeout(() => { if (!d.classList.contains('open')) ppUnhoist(d); }, 320);
    })
      .observe(d, { attributes:true, attributeFilter:['class'] });
  });
  window.addEventListener('resize', ppRefreshPopups);
  window.addEventListener('orientationchange', () => setTimeout(ppRefreshPopups, 80));
  document.addEventListener('fullscreenchange', ppRefreshPopups);
  document.addEventListener('scroll', ppRefreshPopups, true);

  subtitleBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    subtitleDropdown.classList.toggle('open');
    clampDropdownToViewport(subtitleDropdown);
  });
  subtitleDropdown.addEventListener('click', (e) => e.stopPropagation());
  document.addEventListener('click', () => subtitleDropdown.classList.remove('open'));

  subtitleLoadBtn.addEventListener('click', () => subtitleInput.click());
  subtitleInput.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    subtitleInput.value = '';
    if (!file) return;
    const cues = await readSubtitleFile(file);
    if (!cues.length){
      showToast('No subtitle lines found in \u201c' + file.name + '\u201d. Supported: .vtt, .srt, .ass, .ssa', 'error');
      return;                                  // keep whatever was loaded before
    }
    setSubtitleCues(cues, { on:true, offset:0, name:file.name });
    if (currentIndex !== -1){
      const ok = writeSubtitleEntry(tracks[currentIndex].dbId, { cues, on:true, offset:0, name:file.name });
      showToast('Loaded ' + cues.length + ' subtitle lines' + (ok ? '.' : ' (too large to keep after reload).'), ok ? '' : 'error');
    }
    subtitleDropdown.classList.remove('open');
  });
  subtitleOffBtn.addEventListener('click', () => {
    if (!subtitleCues.length) return;
    subtitlesOn = !subtitlesOn;
    subtitleLastText = null;
    updateSubtitleBtnState();
    renderSubtitleFrame();
    kickSubtitleLoop();
    persistSubtitleState(true);
    subtitleDropdown.classList.remove('open');
  });
  subtitleRemoveBtn.addEventListener('click', () => {
    if (currentIndex !== -1) writeSubtitleEntry(tracks[currentIndex].dbId, null);
    setSubtitleCues([]);
    subtitleDropdown.classList.remove('open');
  });
  subtitleOffsetRow.querySelectorAll('button').forEach(btn => {
    btn.addEventListener('click', () => {
      const d = parseFloat(btn.dataset.d);
      subtitleOffsetSec = d === 0 ? 0 : Math.max(-600, Math.min(600, Math.round((subtitleOffsetSec + d) * 10) / 10));
      subtitleLastText = null;
      updateSubtitleBtnState();
      renderSubtitleFrame();
      persistSubtitleState(false);
    });
  });
  subtitleSizeRow.querySelectorAll('button').forEach(btn => {
    btn.addEventListener('click', () => {
      subtitleSizeRow.querySelectorAll('button').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      subtitleSize = btn.dataset.size;
      subtitleOverlay.classList.remove('size-s','size-l');
      if (subtitleSize === 's') subtitleOverlay.classList.add('size-s');
      if (subtitleSize === 'l') subtitleOverlay.classList.add('size-l');
      saveSettings();
    });
  });
  subtitlePosRow.querySelectorAll('button').forEach(btn => {
    btn.addEventListener('click', () => {
      subtitlePosRow.querySelectorAll('button').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      subtitlePos = btn.dataset.pos;
      applySubtitlePos();
      saveSettings();
    });
  });

  // Where the picture sits inside the video box (which also holds the black bars), as fractions of that box.
  function subtitlePicRect(){
    const vs = window.__ppViewScale;                                      // a forced aspect ratio: the picture is that shape, centred in the box
    if (vs) return { x:(1 - vs.sx) / 2, y:(1 - vs.sy) / 2, w:vs.sx, h:vs.sy };
    const area = subtitleOverlay.parentElement, W = area.clientWidth, H = area.clientHeight, vw = videoEl.videoWidth, vh = videoEl.videoHeight;
    if (!W || !H || !vw || !vh) return { x:0, y:0, w:1, h:1 };           // audio or not loaded yet: the whole box
    let cover = false; try { cover = getComputedStyle(window.PPNative && PPNative.raw ? PPNative.raw(videoEl) : videoEl).objectFit === 'cover'; } catch(err){}   // in native mode videoEl is a Proxy, which getComputedStyle rejects: use the real element
    const sc = cover ? Math.max(W / vw, H / vh) : Math.min(W / vw, H / vh);
    const w = vw * sc / W, h = vh * sc / H;
    return { x:(1 - w) / 2, y:(1 - h) / 2, w, h };
  }
  // The saved spot (relative to the picture) turned into a spot in the box right now, kept inside the box.
  function subtitleBoxPos(){
    const r = subtitlePicRect(), area = subtitleOverlay.parentElement, W = area.clientWidth, H = area.clientHeight;
    let x = r.x + subtitleX * r.w, y = r.y + subtitleY * r.h;
    if (W && H){
      const hw = Math.min(0.5, subtitleText.offsetWidth / 2 / W), hh = Math.min(0.5, subtitleText.offsetHeight / 2 / H);
      x = Math.max(hw, Math.min(1 - hw, x)); y = Math.max(hh, Math.min(1 - hh, y));
    }
    return { x, y };
  }

  function applySubtitlePos(){
    subtitleOverlay.classList.toggle('pos-top', subtitlePos === 'top');
    subtitleOverlay.classList.toggle('pos-custom', subtitlePos === 'custom');
    const bp = subtitleBoxPos();
    subtitleOverlay.style.setProperty('--sub-x', bp.x);
    subtitleOverlay.style.setProperty('--sub-y', bp.y);
    subtitlePosRow.querySelectorAll('button').forEach(b => {
      b.classList.toggle('active', b.dataset.pos === subtitlePos);
    });
  }

  // Drag the subtitle line anywhere on the video. Presets stay as one-tap resets.
  (function(){
    let drag = null;
    subtitleText.addEventListener('click', e => e.stopPropagation());
    subtitleText.addEventListener('pointerdown', e => {
      if (e.button !== undefined && e.button !== 0) return;
      e.preventDefault();
      e.stopPropagation();
      const area = subtitleOverlay.parentElement.getBoundingClientRect();
      const r = subtitleText.getBoundingClientRect();
      if (!area.width || !area.height) return;
      const pr = subtitlePicRect();
      drag = {
        id: e.pointerId, area, pr,
        dx: (e.clientX - (r.left + r.width / 2)) / area.width,
        dy: (e.clientY - (r.top + r.height / 2)) / area.height,
        moved: false
      };
      subtitleX = ((r.left + r.width / 2 - area.left) / area.width - pr.x) / pr.w;   // stored relative to the picture
      subtitleY = ((r.top + r.height / 2 - area.top) / area.height - pr.y) / pr.h;
      subtitlePos = 'custom';
      applySubtitlePos();
      subtitleOverlay.classList.add('dragging');
      try { subtitleText.setPointerCapture(e.pointerId); } catch(err){}
    });
    subtitleText.addEventListener('pointermove', e => {
      if (!drag || e.pointerId !== drag.id) return;
      const { area } = drag;
      const hw = Math.min(0.5, subtitleText.offsetWidth / 2 / area.width);
      const hh = Math.min(0.5, subtitleText.offsetHeight / 2 / area.height);
      const x = (e.clientX - area.left) / area.width - drag.dx;
      const y = (e.clientY - area.top) / area.height - drag.dy;
      const bx = Math.max(hw, Math.min(1 - hw, x)), by = Math.max(hh, Math.min(1 - hh, y));
      subtitleX = (bx - drag.pr.x) / drag.pr.w;
      subtitleY = (by - drag.pr.y) / drag.pr.h;
      drag.moved = true;
      subtitleOverlay.style.setProperty('--sub-x', bx);
      subtitleOverlay.style.setProperty('--sub-y', by);
    });
    const end = e => {
      if (!drag || e.pointerId !== drag.id) return;
      drag = null;
      subtitleOverlay.classList.remove('dragging');
      subtitleX = +subtitleX.toFixed(4);
      subtitleY = +subtitleY.toFixed(4);
      saveSettings();
    };
    subtitleText.addEventListener('pointerup', end);
    subtitleText.addEventListener('pointercancel', end);

    // Rotation, fullscreen, window resize, or a new video all change the box and the picture inside it: put the line back on the same spot of the picture.
    const refit = () => { if (subtitlePos === 'custom' && !drag) applySubtitlePos(); };
    try { new ResizeObserver(refit).observe(subtitleOverlay.parentElement); } catch(err){}
    videoEl.addEventListener('loadedmetadata', refit);
    videoEl.addEventListener('resize', refit);
    window.addEventListener('pp-viewscale', refit);
    window.addEventListener('orientationchange', () => setTimeout(refit, 120));

    // Sample line while the menu is open, so there is something to grab even between cues.
    new MutationObserver(() => {
      subtitlePreview = subtitleDropdown.classList.contains('open');
      subtitleLastText = null;
      renderSubtitleFrame();
    }).observe(subtitleDropdown, { attributes:true, attributeFilter:['class'] });
  })();

  // ---------- Subtitle look: presets, sliders, outline/shadow/background ----------
  const SUB_PRESETS = {
    box:     { scale:100, outline:0, shadow:0,  bg:70, lh:140, bold:0 },
    outline: { scale:100, outline:3, shadow:3,  bg:0,  lh:140, bold:1 },
    cinema:  { scale:110, outline:2, shadow:6,  bg:0,  lh:135, bold:0 }
  };
  const SUB_SLIDERS = [
    ['sub-scale', 'scale', v => v + '%'], ['sub-outline', 'outline', v => (v / 2) + 'px'], ['sub-shadow', 'shadow', v => v + 'px'],
    ['sub-bg', 'bg', v => v + '%'], ['sub-lh', 'lh', v => (v / 100).toFixed(1)]
  ];
  function applySubtitleStyle(){
    const st = subtitleStyle, o = st.outline / 2, sh = st.shadow, ts = [];
    if (o > 0) [[1,0],[-1,0],[0,1],[0,-1],[.7,.7],[-.7,.7],[.7,-.7],[-.7,-.7]].forEach(d => ts.push((d[0] * o).toFixed(2) + 'px ' + (d[1] * o).toFixed(2) + 'px 0 #000'));
    if (sh > 0) ts.push('0 ' + (sh / 3).toFixed(1) + 'px ' + sh + 'px rgba(0,0,0,.85)');
    const css = subtitleOverlay.style;
    css.setProperty('--sub-scale', st.scale / 100); css.setProperty('--sub-bg', st.bg / 100); css.setProperty('--sub-lh', st.lh / 100);
    css.setProperty('--sub-weight', st.bold ? 700 : 400); css.setProperty('--sub-ts', ts.join(',') || 'none');
    SUB_SLIDERS.forEach(([id, key, fmt]) => { const el = document.getElementById(id), lb = document.getElementById(id + '-val'); if (el) el.value = st[key]; if (lb) lb.textContent = fmt(st[key]); });
    document.querySelectorAll('#subtitle-toggle-row button').forEach(b => b.classList.toggle('active', !!st[b.dataset.tg]));
    document.querySelectorAll('#subtitle-preset-row button').forEach(b => { const pr = SUB_PRESETS[b.dataset.preset]; b.classList.toggle('active', Object.keys(pr).every(k => pr[k] === st[k])); });
    document.querySelectorAll('#sub-tr-mode-row button').forEach(b => b.classList.toggle('active', b.dataset.m === subtitleTrMode));
    subtitleLastText = null; renderSubtitleFrame();
  }
  SUB_SLIDERS.forEach(([id, key]) => {
    const el = document.getElementById(id);
    el.addEventListener('input', () => { subtitleStyle[key] = +el.value; applySubtitleStyle(); });
    el.addEventListener('change', saveSettings);
  });
  document.querySelectorAll('#subtitle-preset-row button').forEach(b => b.addEventListener('click', () => { Object.assign(subtitleStyle, SUB_PRESETS[b.dataset.preset]); applySubtitleStyle(); saveSettings(); }));
  document.querySelectorAll('#subtitle-toggle-row button').forEach(b => b.addEventListener('click', () => { subtitleStyle[b.dataset.tg] = subtitleStyle[b.dataset.tg] ? 0 : 1; applySubtitleStyle(); saveSettings(); }));

  // ---------- Translate subtitles (device translator, Android app only) ----------
  const subNT = () => window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.PPTranslate;
  const SUB_TR_LANGS = [['en','English'],['es','Spanish'],['fr','French'],['de','German'],['it','Italian'],['pt','Portuguese'],['nl','Dutch'],['tr','Turkish'],['id','Indonesian'],['sv','Swedish'],['pl','Polish'],['ru','Russian'],['uk','Ukrainian'],['ar','Arabic'],['hi','Hindi'],['ja','Japanese'],['ko','Korean'],['zh','Chinese'],['th','Thai'],['he','Hebrew'],['el','Greek']];
  const subTrLang = document.getElementById('sub-tr-lang'), subTrGo = document.getElementById('sub-tr-go'), subTrBlock = document.getElementById('sub-tr-block');
  subTrLang.innerHTML = SUB_TR_LANGS.map(l => '<option value="' + l[0] + '">' + l[1] + '</option>').join('');
  subTrLang.value = 'en';
  let subTrBusy = false;
  function subTrUi(has){
    subTrBlock.style.display = subNT() ? '' : 'none';
    const any = subtitleCues.some(c => c.tr);
    subTrGo.disabled = !has || subTrBusy;
    document.querySelectorAll('#sub-tr-mode-row button').forEach(b => { b.disabled = !any; });
  }
  async function translateSubtitles(to){
    const NT = subNT(); if (!NT || !subtitleCues.length || subTrBusy) return;
    subTrBusy = true; subTrUi(true);
    const cues = subtitleCues, texts = cues.map(c => c.text.replace(/\s*\n\s*/g, ' ').trim()), uniq = Array.from(new Set(texts.filter(Boolean))), map = new Map();
    let from = '';
    try {
      for (let a = 0; a < uniq.length; a += 15){
        subtitleStatus.textContent = 'Translating ' + a + ' of ' + uniq.length + ' lines' + (a ? '' : ' (first use downloads a language pack)') + '…';
        const r = await NT.translate({ lines: uniq.slice(a, a + 15), from, to });
        if (cues !== subtitleCues) throw new Error('The video changed.');
        if (!from && r.from) from = r.from;
        (r.lines || []).forEach((l, k) => map.set(uniq[a + k], String(l || '').trim()));
      }
      let n = 0; cues.forEach((c, i) => { const tr = map.get(texts[i]); c.tr = tr && tr !== texts[i] ? tr : ''; if (c.tr) n++; });
      if (!n) showToast('These subtitles already look like ' + subTrLang.options[subTrLang.selectedIndex].text + '.', 'error');
      else { subtitleTrLang = to; if (subtitleTrMode === 'orig') subtitleTrMode = 'both'; persistSubtitleState(true); saveSettings(); showToast('Translated ' + n + ' lines. Choose Original, Both or Translation under Show.'); }
    } catch (e){ showToast('Could not translate: ' + String((e && e.message) || e).slice(0, 120), 'error'); }
    subTrBusy = false; subtitleLastText = null; updateSubtitleBtnState(); applySubtitleStyle();
  }
  subTrGo.addEventListener('click', () => translateSubtitles(subTrLang.value));
  document.querySelectorAll('#sub-tr-mode-row button').forEach(b => b.addEventListener('click', () => { subtitleTrMode = b.dataset.m; applySubtitleStyle(); saveSettings(); }));

  // ---------- Transcript: tap a line to jump, search, and a two-mark sync/drift fix ----------
  const subTx = document.getElementById('sub-tx'), subTxList = document.getElementById('sx-list'), subTxQ = document.getElementById('sx-q'), subTxInfo = document.getElementById('sx-info');
  const subTxApply = document.getElementById('sx-apply'), subTxUndoBtn = document.getElementById('sx-undo');
  let txOpen = false, txAnch = [], txUndo = null, txActive = -1, txEls = [];
  const txFmt = x => { x = Math.max(0, x); const h = Math.floor(x / 3600), m = Math.floor(x % 3600 / 60), sc = Math.floor(x % 60); return (h ? h + ':' + String(m).padStart(2, '0') : m) + ':' + String(sc).padStart(2, '0'); };
  const txLat = () => Math.max(effLatencyMs(), 0) / 1000 + memcExtraSec;
  function txBuild(){
    subTxList.textContent = ''; txEls = []; txActive = -1;
    const fr = document.createDocumentFragment();
    subtitleCues.forEach((c, i) => {
      const r = document.createElement('div'); r.className = 'sx-row'; r.dataset.i = i;
      const t = document.createElement('span'); t.className = 'sx-t'; t.textContent = txFmt(c.start + subtitleOffsetSec);
      const x = document.createElement('span'); x.className = 'sx-x'; x.textContent = c.text;
      if (c.tr){ const y = document.createElement('span'); y.className = 'sx-tr'; y.textContent = c.tr; x.appendChild(y); }
      const m = document.createElement('button'); m.className = 'sx-m'; m.textContent = 'Mark';
      r.appendChild(t); r.appendChild(x); r.appendChild(m); fr.appendChild(r); txEls.push(r);
    });
    subTxList.appendChild(fr); txFilter(); txMarks();
  }
  function txFilter(){
    const q = subTxQ.value.trim().toLowerCase();
    txEls.forEach((r, i) => { const c = subtitleCues[i]; r.style.display = !q || (c.text + ' ' + (c.tr || '')).toLowerCase().indexOf(q) !== -1 ? '' : 'none'; });
  }
  function txMarks(){
    txEls.forEach((r, i) => { const on = txAnch.some(a => a.i === i); r.classList.toggle('mk', on); r.querySelector('.sx-m').textContent = on ? 'Marked' : 'Mark'; });
    subTxInfo.textContent = txAnch.length === 0 ? 'No marks' : txAnch.length === 1 ? '1 mark: shifts all lines. Add a second far away to fix drift.' : '2 marks: shifts and stretches to fit.';
    subTxApply.disabled = txAnch.length === 0; subTxUndoBtn.disabled = !txUndo;
  }
  function txMark(i){
    if (txAnch.some(a => a.i === i)){ txAnch = txAnch.filter(a => a.i !== i); }
    else { if (txAnch.length >= 2) txAnch.shift(); txAnch.push({ i, s: subtitleCues[i].start + subtitleOffsetSec, p: videoEl.currentTime - txLat() }); }
    txMarks();
  }
  function txApply(){
    if (!txAnch.length) return;
    const an = txAnch.slice().sort((a, b) => a.s - b.s); let a = 1, b = an[0].p - an[0].s;
    if (an.length === 2){
      if (Math.abs(an[1].s - an[0].s) < 60){ showToast('Pick two lines at least a minute apart.', 'error'); return; }
      a = (an[1].p - an[0].p) / (an[1].s - an[0].s);
      if (!(a > 0.8 && a < 1.25)){ showToast('Those marks do not line up (speed ' + a.toFixed(3) + 'x). Check which lines you marked.', 'error'); return; }
      b = an[0].p - a * an[0].s;
    }
    txUndo = { cues: subtitleCues.map(c => Object.assign({}, c)), offset: subtitleOffsetSec };
    const out = subtitleCues.map(c => Object.assign({}, c, { start: Math.max(0, a * (c.start + subtitleOffsetSec) + b), end: Math.max(0.1, a * (c.end + subtitleOffsetSec) + b) }));
    setSubtitleCues(out, { on: subtitlesOn, offset: 0, name: subtitleFileName, trLang: subtitleTrLang });
    persistSubtitleState(true); txAnch = []; txBuild();
    showToast('Sync fixed' + (an.length === 2 ? ' (speed ' + a.toFixed(4) + 'x).' : '.'));
  }
  function txRefresh(){ if (txOpen){ txAnch = []; txBuild(); } }
  function txTick(){
    if (!txOpen || !subtitleCues.length) return;
    const t = videoEl.currentTime - txLat() - subtitleOffsetSec; let lo = 0, hi = subtitleCues.length - 1, idx = -1;
    while (lo <= hi){ const mid = (lo + hi) >> 1; if (subtitleCues[mid].start <= t){ idx = mid; lo = mid + 1; } else hi = mid - 1; }
    if (idx === txActive) return;
    if (txActive >= 0 && txEls[txActive]) txEls[txActive].classList.remove('on');
    txActive = idx; const el = txEls[idx];
    if (el){ el.classList.add('on'); if (!subTxQ.value.trim() && el.style.display !== 'none') el.scrollIntoView({ block: 'center' }); }
  }
  function txSet(on){ txOpen = on; subTx.classList.toggle('open', on); if (on){ txAnch = []; txBuild(); txTick(); } }
  document.getElementById('sub-tx-btn').addEventListener('click', () => { subtitleDropdown.classList.remove('open'); if (subtitleCues.length) txSet(true); });
  document.getElementById('sx-close').addEventListener('click', () => txSet(false));
  document.getElementById('sx-clear').addEventListener('click', () => { txAnch = []; txMarks(); });
  subTxApply.addEventListener('click', txApply);
  subTxUndoBtn.addEventListener('click', () => {
    if (!txUndo) return; const u = txUndo; txUndo = null;
    setSubtitleCues(u.cues, { on: subtitlesOn, offset: u.offset, name: subtitleFileName, trLang: subtitleTrLang }); persistSubtitleState(true); txAnch = []; txBuild(); showToast('Sync change undone.');
  });
  subTxQ.addEventListener('input', txFilter);
  subTxList.addEventListener('click', e => {
    const r = e.target.closest('.sx-row'); if (!r) return; const i = +r.dataset.i;
    if (e.target.classList.contains('sx-m')){ txMark(i); return; }
    videoEl.currentTime = Math.max(0, subtitleCues[i].start + subtitleOffsetSec + txLat() - 0.05);
  });
  videoEl.addEventListener('timeupdate', txTick); videoEl.addEventListener('seeked', txTick);

  function applySubtitleColor(color){
    subtitleColor = color;
    subtitleOverlay.style.setProperty('--subtitle-color', color);
    subtitleColorCustom.value = color;
    subtitleColorRow.querySelectorAll('button[data-color]').forEach(b => {
      b.classList.toggle('active', b.dataset.color.toLowerCase() === color.toLowerCase());
    });
  }
  function applySubtitleFont(font){
    subtitleFont = font;
    subtitleOverlay.style.setProperty('--subtitle-font', SUBTITLE_FONTS[font] || SUBTITLE_FONTS.default);
    subtitleFontRow.querySelectorAll('button').forEach(b => {
      b.classList.toggle('active', b.dataset.font === font);
    });
  }
  subtitleColorRow.querySelectorAll('button[data-color]').forEach(btn => {
    btn.addEventListener('click', () => {
      applySubtitleColor(btn.dataset.color);
      saveSettings();
    });
  });
  subtitleColorCustom.addEventListener('input', () => {
    applySubtitleColor(subtitleColorCustom.value);
    saveSettings();
  });
  subtitleFontRow.querySelectorAll('button').forEach(btn => {
    btn.addEventListener('click', () => {
      applySubtitleFont(btn.dataset.font);
      saveSettings();
    });
  });

