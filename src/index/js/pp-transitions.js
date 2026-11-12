/* Press Play addon: optional gapless / crossfade between audio tracks (Settings > Transitions) */
(function(){
  const A = document.getElementById('audio'), V = document.getElementById('video-el');
  const nextBtn = document.querySelector('button[title="Next"]');
  const anchor = document.getElementById('storage-section');
  if (!A || !nextBtn || !anchor) return;
  const KEY = 'ppTransition';
  let cfg = { mode: 'off', secs: 5 };
  try { Object.assign(cfg, JSON.parse(localStorage.getItem(KEY) || '{}')); } catch(e){}
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(cfg)); } catch(e){} };

  // ---- Settings UI ----
  const sec = document.createElement('div');
  sec.className = 'settings-section';
  sec.innerHTML =
    '<div class="settings-section-label">Transitions</div>' +
    '<div class="settings-row"><div class="settings-row-text">' +
      '<div class="settings-row-title">Between songs</div>' +
      '<div class="settings-row-sub">Off: normal. Gapless: no pause between songs. Crossfade: one song fades out as the next fades in.</div>' +
    '</div><select id="xf-mode"><option value="off">Off</option><option value="gapless">Gapless</option><option value="crossfade">Crossfade</option></select></div>' +
    '<div class="settings-row" id="xf-secs-row" style="margin-top:12px;"><div class="settings-row-text">' +
      '<div class="settings-row-title">Crossfade length <span id="xf-secs-val"></span></div></div>' +
      '<input type="range" id="xf-secs" min="1" max="12" step="1"></div>';
  anchor.parentNode.insertBefore(sec, anchor);
  const selMode = sec.querySelector('#xf-mode'), rng = sec.querySelector('#xf-secs'),
        val = sec.querySelector('#xf-secs-val'), rrow = sec.querySelector('#xf-secs-row');
  const paint = () => { selMode.value = cfg.mode; rng.value = cfg.secs; val.textContent = cfg.secs + ' s'; rrow.style.display = cfg.mode === 'crossfade' ? '' : 'none'; };
  selMode.onchange = () => { cfg.mode = selMode.value; save(); paint(); };
  rng.oninput = () => { cfg.secs = +rng.value; save(); paint(); };
  paint();

    // ---- Engine (audio + video) ----
  let armed = true, helper = null, rampTimer = null, tok = 0;
  // Gapless timing: how long (s) the device takes from pressing Next to the new song actually playing. Learned and saved.
  let lat = 0.5; try { const v = parseFloat(localStorage.getItem('ppGapLat')); if (v > 0.05 && v < 3) lat = v; } catch(e){}
  const activeEl = () => {
    if (V && V.currentSrc && V.videoWidth > 0 && !V.paused) return V;
    if (!A.paused && A.currentSrc) return A;
    return null;
  };
  const killHelper = () => { if (helper){ try { helper.pause(); helper.removeAttribute('src'); helper.load(); helper.remove(); } catch(e){} helper = null; } };
  const ramp = (el, from, to, secs, done) => {
    const t0 = performance.now(), id = ++tok;
    clearInterval(rampTimer);
    rampTimer = setInterval(() => {
      if (id !== tok) return clearInterval(rampTimer);
      const p = Math.min(1, (performance.now() - t0) / (secs * 1000));
      el.volume = Math.max(0, Math.min(1, from + (to - from) * p));
      if (p >= 1){ clearInterval(rampTimer); done && done(); }
    }, 30);
  };

  function start(cur){
    armed = false;
    const tA = A.volume, tV = V ? V.volume : 1, target = cur.volume, oldA = A.currentSrc, oldV = V ? V.currentSrc : '';
    const rem = (cur.duration - cur.currentTime) / (cur.playbackRate || 1);
    const plannedEnd = performance.now() + rem * 1000;   // when the old song's tail finishes
    const fade = cfg.mode === 'crossfade' ? Math.min(cfg.secs, rem) : 0;
    // The old song's/video's sound continues on a hidden helper; for video the picture cuts to the next item.
    killHelper();
    const h = helper = document.createElement('video');
    h.style.display = 'none'; h.setAttribute('playsinline', ''); document.body.appendChild(h);
    h.src = cur.currentSrc; h.currentTime = cur.currentTime; h.playbackRate = cur.playbackRate; h.volume = cur.muted ? 0 : target;
    h.play().catch(() => {});
    h.onended = () => { if (helper === h) killHelper(); };
    if (fade > 0){
      const hid = setInterval(() => {
        if (helper !== h) return clearInterval(hid);
        const left = (h.duration - h.currentTime) / (h.playbackRate || 1);
        h.volume = Math.max(0, Math.min(target, target * (left / fade)));
      }, 30);
    }
    A.volume = 0; if (V) V.volume = 0;
    nextBtn.click();
    const restore = () => { A.volume = tA; if (V) V.volume = tV; };
    // If nothing changed (e.g. last track), undo.
    setTimeout(() => { if (A.currentSrc === oldA && (!V || V.currentSrc === oldV)){ killHelper(); restore(); tok++; } }, 900);
    const onPlaying = (ev) => {
      const el = ev.target;
      if ((el === A && A.currentSrc === oldA) || (el === V && V.currentSrc === oldV)) return;
      A.removeEventListener('playing', onPlaying); if (V) V.removeEventListener('playing', onPlaying);
      if (cfg.mode === 'gapless'){ const e = performance.now() - plannedEnd; if (Math.abs(e) < 3000){ lat = Math.min(3, Math.max(0.1, lat + 0.7 * e / 1000)); try { localStorage.setItem('ppGapLat', String(lat)); } catch(x){} } }
      const tgt = el === A ? tA : tV;
      if (el !== A) A.volume = tA; else if (V) V.volume = tV;
      if (fade > 0) ramp(el, 0, tgt, fade); else el.volume = tgt;
    };
    A.addEventListener('playing', onPlaying); if (V) V.addEventListener('playing', onPlaying);
    setTimeout(() => { if (!A.muted && A.volume === 0 && V && V.volume === 0) restore(); else { if (A.volume === 0) A.volume = tA; if (V && V.volume === 0) V.volume = tV; } }, (fade + 4) * 1000);
  }

  // Adaptive poll: sleeps 1 s when the feature is off, up to 0.5 s while the end is far away,
  // and only runs at 40 ms in the last moments before the fade/handoff is due.
  (function xfPoll(){
    let wait = 1000;
    try {
      if (cfg.mode !== 'off'){
        const cur = activeEl();
        wait = 500;
        if (cur && isFinite(cur.duration) && cur.duration >= 4){
          const rem = (cur.duration - cur.currentTime) / (cur.playbackRate || 1);
          const lead = cfg.mode === 'crossfade' ? Math.min(cfg.secs, cur.duration / 2) : Math.min(lat, cur.duration / 2);
          if (rem > lead + 1) armed = true;
          if (armed && rem <= lead && rem > 0.05) start(cur);
          if (!cur.paused) wait = rem > lead + 1.5 ? Math.max(40, Math.min(500, (rem - lead - 1) * 1000)) : 40;
        }
      }
    } catch (e) { wait = 1000; }
    setTimeout(xfPoll, wait);
  })();

  A.addEventListener('loadedmetadata', () => { armed = true; });
  if (V) V.addEventListener('loadedmetadata', () => { armed = true; });
  const syncP = () => { if (helper) helper.pause(); }, syncR = () => { if (helper) helper.play().catch(() => {}); };
  [A, V].forEach(el => { if (el){ el.addEventListener('pause', syncP); el.addEventListener('play', syncR); } });
  nextBtn.addEventListener('click', (e) => { if (e.isTrusted) killHelper(); }, true);
  const prev = document.querySelector('button[title="Previous"]');
  if (prev) prev.addEventListener('click', (e) => { if (e.isTrusted) killHelper(); }, true);
})();
