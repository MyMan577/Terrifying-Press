/* Press Play addons: extra shortcuts, track picker (audio + embedded subtitles), screen wake lock */
(function(){
  const V = document.getElementById('video-el'), A = document.getElementById('audio');
  if (!V || !A) return;
  const toast = (m) => { try { showToast(m); } catch(e){} };
  const act = () => (V.currentSrc && V.videoWidth > 0) ? V : A;

  // ---- Extra keyboard shortcuts (existing: Space, arrows, , . A Z Esc) ----
  const SPEEDS = [0.25,0.5,0.75,1,1.25,1.5,1.75,2,3,4];
  document.addEventListener('keydown', (e) => {
    const t = e.target.tagName;
    if (t === 'INPUT' || t === 'TEXTAREA' || t === 'SELECT' || e.ctrlKey || e.metaKey || e.altKey) return;
    const m = act(), k = e.key;
    if (k === 'm' || k === 'M'){ m.muted = !m.muted; toast(m.muted ? 'Muted' : 'Unmuted'); }
    else if (k === 'f' || k === 'F'){ const b = document.getElementById('fullscreen-btn'); if (b) b.click(); }
    else if (k === 'ArrowUp' || k === 'ArrowDown'){
      e.preventDefault();
      m.volume = Math.max(0, Math.min(1, m.volume + (k === 'ArrowUp' ? 0.05 : -0.05)));
      toast('Volume ' + Math.round(m.volume * 100) + '%');
    }
    else if (k === 'j' || k === 'J') m.currentTime = Math.max(0, m.currentTime - 10);
    else if (k === 'l' || k === 'L') m.currentTime = Math.min(m.duration || 0, m.currentTime + 10);
    else if (k === '[' || k === ']'){
      let i = SPEEDS.findIndex(s => s >= m.playbackRate - 0.001); if (i < 0) i = 3;
      i = Math.max(0, Math.min(SPEEDS.length - 1, i + (k === ']' ? 1 : -1)));
      m.playbackRate = SPEEDS[i]; toast('Speed ' + SPEEDS[i] + 'x');
    }
    else if (k === 'Backspace'){ m.playbackRate = 1; toast('Speed 1x'); }
    else if (/^[0-9]$/.test(k) && isFinite(m.duration)){ m.currentTime = m.duration * (+k / 10); }
  });

  // ---- Screen wake lock while video plays ----
  let lock = null;
  async function wl(){
    try {
      if (!('wakeLock' in navigator)) return;
      const want = !V.paused && !V.ended && V.videoWidth > 0 && document.visibilityState === 'visible';
      if (want && !lock){ lock = await navigator.wakeLock.request('screen'); lock.addEventListener('release', () => { lock = null; }); }
      else if (!want && lock){ await lock.release(); lock = null; }
    } catch(e){}
  }
  ['play','pause','ended','loadeddata'].forEach(ev => V.addEventListener(ev, wl));
  document.addEventListener('visibilitychange', wl);

  // ---- Track picker: audio tracks + embedded subtitle tracks ----
  const anchor = document.getElementById('subtitle-btn');
  if (!anchor) return;
  const btn = document.createElement('button');
  btn.className = anchor.className; btn.id = 'tracks-btn'; btn.type = 'button';
  btn.title = 'Audio & subtitle tracks'; btn.setAttribute('aria-label', 'Audio and subtitle tracks');
  btn.style.display = 'none';
  btn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 18v-6a9 9 0 0 1 18 0v6"/><path d="M21 19a2 2 0 0 1-2 2h-1v-6h3zM3 19a2 2 0 0 0 2 2h1v-6H3z"/></svg>';
  anchor.parentNode.insertBefore(btn, anchor.nextSibling);

  const pop = document.createElement('div');
  pop.style.cssText = 'position:fixed;z-index:9999;display:none;min-width:200px;max-width:80vw;max-height:60vh;overflow:auto;background:var(--bg-elev,#16171b);color:var(--text,#e8e8ea);border:1px solid var(--line,#232429);border-radius:10px;padding:6px;font:13px Inter,sans-serif;box-shadow:0 8px 28px rgba(0,0,0,.5)';
  document.body.appendChild(pop);

  const subs = () => Array.from(V.textTracks || []).filter(t => t.kind === 'subtitles' || t.kind === 'captions');
  const auds = () => V.audioTracks ? Array.from(V.audioTracks) : [];
  const label = (t, i, what) => (t.label || t.language || (what + ' ' + (i + 1))) + (t.language && t.label ? ' (' + t.language + ')' : '');

  function refresh(){ btn.style.display = (auds().length > 1 || subs().length > 0) ? '' : 'none'; }
  function row(text, on, fn){
    const b = document.createElement('button');
    b.type = 'button'; b.textContent = (on ? '● ' : '○ ') + text;
    b.style.cssText = 'display:block;width:100%;text-align:left;background:none;border:0;color:inherit;padding:9px 10px;border-radius:6px;cursor:pointer;font:inherit' + (on ? ';color:var(--accent,#6ee7d0)' : '');
    b.onclick = () => { fn(); build(); };
    pop.appendChild(b);
  }
  function head(t){ const d = document.createElement('div'); d.textContent = t; d.style.cssText = 'padding:6px 10px 2px;font-size:11px;text-transform:uppercase;letter-spacing:.5px;color:var(--text-dim,#8b8c93)'; pop.appendChild(d); }
  function build(){
    pop.innerHTML = '';
    const a = auds();
    if (a.length > 1){
      head('Audio');
      a.forEach((t, i) => row(label(t, i, 'Track'), t.enabled, () => { a.forEach(x => x.enabled = (x === t)); toast('Audio: ' + label(t, i, 'Track')); }));
    }
    const s = subs();
    if (s.length){
      head('Embedded subtitles');
      row('Off', s.every(t => t.mode !== 'showing'), () => s.forEach(t => t.mode = 'disabled'));
      s.forEach((t, i) => row(label(t, i, 'Subtitle'), t.mode === 'showing', () => s.forEach(x => x.mode = (x === t) ? 'showing' : 'disabled')));
    }
  }
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    if (pop.style.display === 'block'){ pop.style.display = 'none'; return; }
    build();
    const r = btn.getBoundingClientRect();
    pop.style.display = 'block';
    pop.style.left = Math.max(8, Math.min(innerWidth - pop.offsetWidth - 8, r.left)) + 'px';
    pop.style.top = Math.max(8, r.top - pop.offsetHeight - 8) + 'px';
  });
  document.addEventListener('click', (e) => { if (!pop.contains(e.target)) pop.style.display = 'none'; });

  ['loadedmetadata','emptied'].forEach(ev => V.addEventListener(ev, () => setTimeout(refresh, 150)));
  try { V.audioTracks && V.audioTracks.addEventListener('addtrack', refresh); } catch(e){}
  try { V.textTracks && V.textTracks.addEventListener('addtrack', refresh); } catch(e){}
  refresh();
})();
