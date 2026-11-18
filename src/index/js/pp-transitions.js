/* Press Play addon: gapless / crossfade between songs (Settings > Transitions)
 *
 * The rule every path follows: a transition only happens when a song really follows this one, by the same rules as
 * the end of a song (window.__ppQueue.peekNext): never with repeat one (the song just loops), never at the end of the
 * queue with repeat off, never when the sleep timer stops after this track or an A-B loop is set. And only from a
 * song to a song: videos keep their normal cut.
 *
 * On the phone (native engine) ExoPlayer plays the songs:
 *  - Gapless: nothing to do here. The next song is queued in ExoPlayer (ppQueueNext in main) and it runs straight
 *    on from the last sample of this one.
 *  - Crossfade: a little before the fade is due this asks ExoPlayer to do it (PPNative.crossfade). The old song's
 *    ending keeps playing on its own, with the same effects, while the next one fades in over it.
 * In a browser (or with the native engine off) the page plays the songs itself:
 *  - Gapless: the next song is started the moment this one ends (main's onEnded); no tricks that clip the ending.
 *  - Crossfade: the ending is carried by a hidden player that is opened and parked at the fade point ahead of time,
 *    started exactly when the song reaches it, while the next song starts and fades in.
 */
(function(){
  const nextBtn = document.getElementById('next-btn') || document.querySelector('button[title="Next"]');
  const anchor = document.getElementById('storage-section');
  if (!nextBtn || !anchor) return;
  const KEY = 'ppTransition';
  let cfg = { mode: 'off', secs: 5, album: true };
  try { Object.assign(cfg, JSON.parse(localStorage.getItem(KEY) || '{}')); } catch(e){}
  cfg.secs = Math.max(1, Math.min(12, +cfg.secs || 5));
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(cfg)); } catch(e){} };

  // ---- Settings UI ----
  const sec = document.createElement('div');
  sec.className = 'settings-section';
  sec.innerHTML =
    '<div class="settings-section-label">Transitions</div>' +
    '<div class="settings-row"><div class="settings-row-text">' +
      '<div class="settings-row-title">Between songs</div>' +
      '<div class="settings-row-sub">Off: normal. Gapless: the next song starts the instant this one ends. Crossfade: this song fades out as the next fades in. Repeat one, the end of the queue and the sleep timer are always respected.</div>' +
    '</div><select id="xf-mode"><option value="off">Off</option><option value="gapless">Gapless</option><option value="crossfade">Crossfade</option></select></div>' +
    '<div class="settings-row" id="xf-secs-row" style="margin-top:12px;"><div class="settings-row-text">' +
      '<div class="settings-row-title">Crossfade length <span id="xf-secs-val"></span></div></div>' +
      '<input type="range" id="xf-secs" min="1" max="12" step="1"></div>' +
    '<div class="settings-row" id="xf-album-row" style="margin-top:12px;"><div class="settings-row-text">' +
      '<div class="settings-row-title">Keep albums gapless</div>' +
      '<div class="settings-row-sub">No crossfade between songs of the same album, so live albums and DJ mixes flow as recorded.</div></div>' +
      '<label class="settings-switch"><input type="checkbox" id="xf-album"><span class="settings-switch-track"><span class="settings-switch-thumb"></span></span></label></div>';
  anchor.parentNode.insertBefore(sec, anchor);
  const selMode = sec.querySelector('#xf-mode'), rng = sec.querySelector('#xf-secs'), val = sec.querySelector('#xf-secs-val'),
        rrow = sec.querySelector('#xf-secs-row'), arow = sec.querySelector('#xf-album-row'), alb = sec.querySelector('#xf-album');
  const paint = () => {
    selMode.value = cfg.mode; rng.value = cfg.secs; val.textContent = cfg.secs + ' s'; alb.checked = cfg.album !== false;
    rrow.style.display = arow.style.display = cfg.mode === 'crossfade' ? '' : 'none';
  };
  selMode.onchange = () => { cfg.mode = selMode.value; save(); paint(); reset(); };
  rng.oninput = () => { cfg.secs = +rng.value; save(); paint(); reset(); };
  alb.onchange = () => { cfg.album = alb.checked; save(); reset(); };
  paint();

  // ---- What plays, and what comes next ----
  const N = window.PPNative;
  const Q = () => window.__ppQueue;
  const tracks = () => (window.__ppApi ? window.__ppApi.tracks() : []);
  const audio = () => document.getElementById('audio');          // the native facade on the phone, the page's <audio> otherwise
  const native = () => !!(N && N.active && N.active());
  // The song after this one if a crossfade should lead into it, else null.
  function fadeTarget(){
    const q = Q(); if (!q || !q.peekNext) return null;
    const i = q.current(), j = q.peekNext(), t = tracks();
    const a = t[i], b = t[j];
    if (!a || !b || a.kind === 'video' || b.kind === 'video') return null;
    if (cfg.album !== false && a.album && b.album && a.album === b.album) return null;   // keep albums gapless
    return { i, j, a, b };
  }
  const remaining = el => (el.duration - el.currentTime) / (el.playbackRate || 1);

  // ---- Phone: ExoPlayer does the fade ----
  let askedFor = '';      // the song (index:dbId) a fade was asked for, so it is asked once
  function nativeStep(el){
    if (cfg.mode !== 'crossfade') return 1000;
    if (el.paused || !isFinite(el.duration) || el.duration <= 0) return 500;
    const tg = fadeTarget(), key = tg ? tg.i + ':' + tg.a.dbId : '';
    const rem = remaining(el), lead = cfg.secs;
    if (rem > lead + 4 && askedFor){ askedFor = ''; }                       // seeked back: ask again later
    if (!tg){ if (askedFor){ N.cancelCrossfade(); askedFor = ''; } return 500; }
    if (el.duration < lead * 2 + 2) return 1000;                          // too short to fade
    if (askedFor !== key && rem <= lead + 2.5 && rem > 0.6){
      askedFor = key;
      N.crossfade(lead * 1000);   // if it can't be set up, ExoPlayer just runs on into the next song gaplessly
    }
    return rem > lead + 4 ? Math.max(200, Math.min(1000, (rem - lead - 3) * 1000)) : 150;
  }

  // ---- Browser: a hidden player carries the ending ----
  let web = null;         // { h, key, startAt, phase: 'park' | 'fade', t0, len, target }
  function webStop(){
    if (!web) return;
    const w = web; web = null;
    clearInterval(w.timer);
    try { w.h.pause(); w.h.removeAttribute('src'); w.h.load(); w.h.remove(); } catch(e){}
    const el = audio(); if (el && w.target != null && el.volume < w.target) el.volume = w.target;
  }
  function webStep(el){
    if (cfg.mode !== 'crossfade'){ webStop(); return 1000; }
    if (web && web.phase === 'fade') return 200;                          // the fade runs on its own timer
    if (el.paused || !isFinite(el.duration) || el.duration <= 0){ if (web) web.h.pause(); return 500; }
    const tg = fadeTarget(), lead = cfg.secs, rem = remaining(el);
    const key = tg ? tg.i + ':' + tg.a.dbId : '';
    if (web && (web.key !== key || el.currentTime > web.startAt + 0.3 || el.currentTime < web.startAt - lead - 6)) webStop();
    if (!tg || el.duration < lead * 2 + 2) return 500;
    if (!web && rem <= lead + 4 && rem > lead * 0.5){
      // Open the same song in a hidden player and park it where the fade starts.
      const h = document.createElement('audio');
      h.preload = 'auto'; h.style.display = 'none'; document.body.appendChild(h);
      const startAt = Math.max(el.currentTime + 1, el.duration - lead);
      h.src = el.currentSrc || el.src; h.playbackRate = el.playbackRate || 1; h.volume = 0;
      try { h.preservesPitch = el.preservesPitch; } catch(e){}
      h.addEventListener('loadedmetadata', () => { try { h.currentTime = startAt; } catch(e){} }, { once: true });
      web = { h, key, startAt, phase: 'park', target: el.volume, timer: 0 };
    }
    if (web && web.phase === 'park'){
      const ready = web.h.readyState >= 3 && !web.h.seeking && Math.abs(web.h.currentTime - web.startAt) < 0.25;
      if (ready && el.currentTime >= web.startAt - 0.02) webFade(el);
      return 15;
    }
    return rem > lead + 5 ? Math.max(200, Math.min(1000, (rem - lead - 4.5) * 1000)) : 60;
  }
  function webFade(el){
    const w = web, target = el.volume, len = Math.max(0.5, (el.duration - w.startAt) / (el.playbackRate || 1)) * 1000;
    w.phase = 'fade'; w.target = target;
    w.h.volume = el.muted ? 0 : target;
    w.h.play().catch(() => {});
    el.volume = 0;
    nextBtn.click();                     // the app's own next: the same song peekNext promised
    let elapsed = 0, last = performance.now();
    w.timer = setInterval(() => {
      if (web !== w){ clearInterval(w.timer); return; }
      const cur = audio(), now = performance.now();
      if (cur && !cur.paused) elapsed += now - last;
      last = now;
      if (cur && cur.paused !== w.h.paused){ if (cur.paused) w.h.pause(); else w.h.play().catch(() => {}); }
      const f = Math.min(1, elapsed / len);
      const vin = Math.sin(f * Math.PI / 2), vout = Math.cos(f * Math.PI / 2);   // equal power: steady loudness
      if (cur) cur.volume = Math.max(0, Math.min(1, target * vin));
      w.h.volume = Math.max(0, Math.min(1, (cur && cur.muted ? 0 : target) * vout));
      if (f >= 1 || w.h.ended) webStop();
    }, 30);
  }

  function reset(){ askedFor = ''; webStop(); if (native() && N.cancelCrossfade) N.cancelCrossfade(); }

  // ---- The loop: sleeps while far from the end, ticks fast only around the fade point ----
  (function poll(){
    let wait = 1000;
    try {
      const el = audio();
      if (cfg.mode !== 'off' && el){
        wait = native() ? nativeStep(el) : webStep(el);
      } else if (web) webStop();
    } catch(e){ wait = 1000; }
    setTimeout(poll, wait);
  })();

  // Picking another song (Next, Previous, a tap in a list) during a browser fade ends the old song's tail at once.
  document.addEventListener('click', e => {
    if (!e.isTrusted || !web || web.phase !== 'fade') return;
    if (e.target.closest && e.target.closest('#next-btn, #prev-btn, #pl-mini-next, #pl-mini-prev, [data-idx], .pq-row, [data-pw-act="qjump"], [data-pw-act="jump"]')) webStop();
  }, true);
})();
