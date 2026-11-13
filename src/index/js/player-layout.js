(function(){
  const KEY = 'playerLayoutMode';
  const body = document.body;
  const toggle = document.getElementById('player-layout-toggle');
  const tabs = Array.from(document.querySelectorAll('#pl-tabbar button'));
  const mini = document.getElementById('pl-mini');
  const miniTitle = document.getElementById('pl-mini-title');
  const miniArtist = document.getElementById('pl-mini-artist');
  const miniPlay = document.getElementById('pl-mini-play');
  const miniNext = document.getElementById('pl-mini-next');
  const miniPrev = document.getElementById('pl-mini-prev');
  const miniFill = document.querySelector('#pl-mini-prog i');
  const miniArt = document.getElementById('pl-mini-art');
  const miniArtImg = miniArt.querySelector('img');
  const backBtn = document.getElementById('pl-back');
  const npTitle = document.getElementById('np-title');
  const npArtist = document.getElementById('np-artist');
  const artImg = document.getElementById('art-img');
  const videoWrap = document.getElementById('video-wrap');
  const playlistEl = document.getElementById('playlist');
  const playBtn = document.getElementById('play-btn');
  const nextBtn = document.getElementById('next-btn');
  const prevBtn = document.getElementById('prev-btn');
  const seek = document.getElementById('seek');
  const PLAY = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>';
  const PAUSE = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M6 5h4v14H6zm8 0h4v14h-4z"/></svg>';
  const ACTION_CLASSES = ['track-remove','track-pl-btn','track-edit-btn','track-thumb-btn','track-convert-btn','track-revert-btn','track-drag-handle'];
  let view = 'home', on = false, timer = null;

  const resize = () => requestAnimationFrame(() => window.dispatchEvent(new Event('resize')));

  // Dismissing the mini-player (Delete key) hides it for the current track; it comes back when another track loads.
  let miniDismissed = null;
  const miniKey = () => (npTitle.textContent || '').trim() + '\u0001' + (npArtist.textContent || '').trim();
  function syncMini(){
    const title = (npTitle.textContent || '').trim();
    const artist = (npArtist.textContent || '').trim();
    body.classList.toggle('pl-has-track', !!title && title !== 'No track selected' && miniKey() !== miniDismissed);
    miniTitle.textContent = title;
    miniArtist.textContent = artist === '-' ? '' : artist;
    const playing = playBtn.getAttribute('aria-label') === 'Pause';
    miniPlay.innerHTML = playing ? PAUSE : PLAY;
    miniPlay.setAttribute('aria-label', playing ? 'Pause' : 'Play');
    // Thumbnail of the track that's playing: its own art or a captured video frame (as on Home). The big player's
    // art image only changes for audio tracks, so copying it showed the last audio track's art while a video played.
    let src = null;
    try {
      const A = window.__ppApi, i = A ? A.currentIndex() : -1, t = i >= 0 ? A.tracks()[i] : null;
      if (t){
        src = thumbSrc(t);
        if (!src && t.kind === 'video') requestThumb(t);   // syncMini runs again once it's captured
        if (!src && t.kind !== 'video' && artImg.style.display === 'block') src = artImg.getAttribute('src');
      }
    } catch(e){ /* the thumbnail helpers are set up a little later on first load */ }
    miniArt.classList.toggle('has-art', !!src);
    if (src && miniArtImg.getAttribute('src') !== src) miniArtImg.src = src;
  }
  function syncProgress(){
    const max = parseFloat(seek.max) || 100;
    // scaleX instead of width: the bar's glide then runs on the GPU, not as a layout of the page every frame
    miniFill.style.transform = 'scaleX(' + Math.max(0, Math.min(1, (parseFloat(seek.value) || 0) / max)).toFixed(4) + ')';
  }

  // ----- Browse screens (Library / Settings) -----
  function setView(v){
    view = v;
    if (v !== 'playlists') openPlId = null;
    openSec = null;
    if (window.__ppApi && window.__ppApi.sel) window.__ppApi.sel.exit();
    body.dataset.plView = v;
    syncHomeBg();
    tabs.forEach(b => b.classList.toggle('active', b.dataset.plView === v));
    if (v === 'home' || v === 'playlists'){ renderHome(true); return; }
    const t = document.querySelector('.sidebar-tab[data-sidebar-tab="' + (v === 'library' ? 'playlist' : 'settings') + '"]');
    if (t) t.click();
  }

  // ----- Player page -----
  function openPlayer(){
    if (!on || body.hasAttribute('data-pl-player')) return;
    body.setAttribute('data-pl-player', '1');
    syncVideoMode();
    try { history.pushState({ ppPlayer: 1 }, ''); } catch(e){}
    resize();
  }
  function hidePlayer(){
    if (!body.hasAttribute('data-pl-player')) return;
    body.removeAttribute('data-pl-player');
    body.classList.remove('pl-ui-show');
    clearTimeout(uiTimer);
    resize();
  }
  function closePlayer(){
    if (history.state && history.state.ppPlayer){ history.back(); } // popstate hides it
    else hidePlayer();
  }
  window.addEventListener('popstate', hidePlayer);
  backBtn.addEventListener('click', closePlayer);
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && body.hasAttribute('data-pl-player') && !document.querySelector('.modal-open, [aria-modal="true"]:not([hidden])')) closePlayer();
  });

  // Tapping a video in the list opens the player page; audio keeps playing
  // from the mini-player, which opens the page when tapped.
  // Remember (before the row's own handler runs) whether this tap happened in select mode: tapping the
  // last selected row exits select mode synchronously, so checking later would wrongly say "not selecting".
  let tapWasSelecting = false;
  playlistEl.addEventListener('click', () => { const A = window.__ppApi; tapWasSelecting = !!(A && A.sel && A.sel.active()); }, true);
  playlistEl.addEventListener('click', e => {
    if (!on || tapWasSelecting) return;
    const row = e.target.closest('.track');
    if (!row || ACTION_CLASSES.some(c => e.target.classList.contains(c))) return;
    setTimeout(() => { if (getComputedStyle(videoWrap).display !== 'none') openPlayer(); }, 0);
  });

  function apply(next){
    on = next;
    body.classList.toggle('player-layout', on);
    if (window.__ppSyncTitle) window.__ppSyncTitle();
    try { renderStrip(true); } catch(e){}
    toggle.checked = !on;
    if (on){
      syncMini(); syncProgress();
      syncVideoMode();
      setView(view);
      if (!timer) timer = setInterval(syncProgress, 500);
    } else {
      hidePlayer();
      delete body.dataset.plView;
      syncHomeBg();
      clearInterval(timer); timer = null;
    }
    resize();
  }

  // ----- Sliding between tabs (tap or swipe) -----
  // The page you are on slides out, the next one slides in from the matching side. Only on the main tab pages:
  // never while the full player page is open, while selecting, or with reduced-motion turned on.
  const TAB_ORDER = ['home', 'playlists', 'library', 'settings'];
  let slideBusy = false, slidePending = null;
  const tabPane = v => (v === 'home' || v === 'playlists') ? document.getElementById('pl-home') : document.getElementById('sidebar');
  const canSlide = () => {
    const A = window.__ppApi;
    return on && !body.hasAttribute('data-pl-player') && !(A && A.sel && A.sel.active()) && !(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
  };
  // One slide: the pane slides out, apply() switches what it shows, the pane slides in from the other side.
  // dir: 1 = going forward (new page comes from the right), -1 = going back.
  function slideRun(dir, outEl, apply, inElFn){
    slideBusy = true;
    const prevOverflow = body.style.overflowX; body.style.overflowX = 'hidden';
    const done = () => {
      slideBusy = false; body.style.overflowX = prevOverflow;
      if (slidePending){ const f = slidePending; slidePending = null; f(); }
    };
    const out = outEl.animate(
      [{ transform: 'translateX(0)', opacity: 1 }, { transform: 'translateX(' + (-dir * 100) + '%)', opacity: 0 }],
      { duration: 150, easing: 'cubic-bezier(.4,0,1,1)', fill: 'forwards' });
    out.onfinish = () => {
      apply();
      const inEl = inElFn();
      if (!inEl || !inEl.animate){ out.cancel(); done(); return; }
      const inn = inEl.animate(
        [{ transform: 'translateX(' + (dir * 100) + '%)', opacity: 0 }, { transform: 'translateX(0)', opacity: 1 }],
        { duration: 230, easing: 'cubic-bezier(.2,.8,.2,1)' });
      out.cancel();
      inn.onfinish = inn.oncancel = done;
    };
  }
  function slideTo(v){
    if (v === view){ setView(v); return; }
    const outEl = tabPane(view);
    if (slideBusy){ slidePending = () => { if (v !== view) slideTo(v); }; return; }
    if (!canSlide() || !outEl || !outEl.animate){ setView(v); return; }
    slideRun(TAB_ORDER.indexOf(v) > TAB_ORDER.indexOf(view) ? 1 : -1, outEl, () => setView(v), () => tabPane(v));
  }
  // Sub pages: inside an open playlist, swiping right goes to the next playlist and left to the previous one; inside an open Home section
  // (Videos / History), it flips to the other section. Returns true when it handled the swipe (even if at the end of the list).
  function slideSub(step){
    const A = window.__ppApi, pane = document.getElementById('pl-home');
    if (!A || !pane || !pane.animate) return false;
    if (view === 'playlists' && openPlId){
      // Reversed on purpose: swipe left = previous playlist (up the list), swipe right = next (down). The slide still follows the finger.
      const pls = A.playlists().filter(p => !p.libOnly), n = pls.findIndex(p => p.id === openPlId) - step;
      if (n >= 0 && n < pls.length) slideRun(step, pane, () => { openPlId = pls[n].id; renderHome(true); }, () => pane);
      return true;
    }
    if (view === 'home' && openSec){
      const tr = A.tracks(), byId = new Map(tr.map((t, i) => [t.dbId, i]));
      const avail = [];
      if (tr.some(t => t.kind === 'video')) avail.push('videos');
      if (tr.some(t => t.kind === 'audio' && !t.stem)) avail.push('audio');
      if (playHistory.some(h => byId.get(h.id) != null)) avail.push('history');
      const n = avail.indexOf(openSec) + step;
      if (n >= 0 && n < avail.length) slideRun(step, pane, () => { openSec = avail[n]; renderHome(true); }, () => pane);
      return true;
    }
    return false;
  }
  const goTab = v => { if (v === 'playlists') openPlId = null; slideTo(v); };
  // Bloopy ("open my Chill playlist"): shows that playlist's own page on the Playlists tab, closing the full player first.
  window.__ppOpenPlaylist = id => {
    if (!body.classList.contains('player-layout')) return false;
    if (body.hasAttribute('data-pl-player')) closePlayer();
    openPlId = id;
    if (view === 'playlists') renderHome(true); else slideTo('playlists');
    return true;
  };
  tabs.forEach(b => b.addEventListener('click', () => goTab(b.dataset.plView)));

  // Swipe sideways to move to the neighbouring tab (no wrap-around at the ends).
  { let tx = 0, ty = 0, tt = 0, ok = false;
    const blocked = el => {
      if (!el || !el.closest) return true;
      if (el.closest('input, select, textarea, [contenteditable], [type="range"], #pl-mini, #pl-tabbar, #select-bar, #ph-select-bar, .modal-open, [aria-modal="true"], [role="dialog"], [role="slider"], .no-swipe')) return true;
      for (let n = el; n && n !== document.body; n = n.parentElement){        // sideways-scrolling rows keep their own swipe
        if (n.scrollWidth > n.clientWidth + 2){ const ox = getComputedStyle(n).overflowX; if (ox === 'auto' || ox === 'scroll') return true; }
      }
      return false;
    };
    document.addEventListener('touchstart', e => {
      ok = false;
      if (e.touches.length !== 1 || !canSlide() || slideBusy) return;
      if (blocked(e.target)) return;
      ok = true; tx = e.touches[0].clientX; ty = e.touches[0].clientY; tt = performance.now();
    }, { passive: true });
    document.addEventListener('touchend', e => {
      if (!ok) return; ok = false;
      const t = e.changedTouches[0]; if (!t) return;
      const dx = t.clientX - tx, dy = t.clientY - ty, ax = Math.abs(dx), v = ax / Math.max(1, performance.now() - tt);
      if (ax < 40 || ax < Math.abs(dy) * 1.6 || (ax < 70 && v < 0.45)) return;   // must be a clear, deliberate sideways swipe
      const step = dx < 0 ? 1 : -1;
      if (slideSub(step)) return;                               // on a sub page: move between playlists / sections instead of tabs
      const i = TAB_ORDER.indexOf(view), n = i + step;
      if (i < 0 || n < 0 || n >= TAB_ORDER.length) return;
      goTab(TAB_ORDER[n]);
    }, { passive: true });
    document.addEventListener('touchcancel', () => { ok = false; }, { passive: true });
  }
  mini.addEventListener('click', e => { if (!e.target.closest('button')) openPlayer(); });
  mini.addEventListener('keydown', e => {
    if ((e.key === 'Enter' || e.key === ' ') && e.target === mini){ e.preventDefault(); openPlayer(); }
  });
  // The mini-player has a bit of give: drag it any way and it follows with growing resistance (a rubber band), then
  // springs back to its place with a small overshoot when you let go. A drag never counts as a tap.
  { let sx = 0, sy = 0, down = false, locked = false, clickBlock = 0;
    mini.style.touchAction = 'none';
    const band = (d, lim) => Math.sign(d) * lim * (1 - 1 / (Math.abs(d) / lim * 0.6 + 1));   // ~lim px at most
    mini.addEventListener('pointerdown', e => {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      down = true; locked = false; sx = e.clientX; sy = e.clientY;
    });
    mini.addEventListener('pointermove', e => {
      if (!down) return;
      const dx = e.clientX - sx, dy = e.clientY - sy;
      if (!locked){
        if (Math.hypot(dx, dy) < 6) return;
        locked = true; try { mini.setPointerCapture(e.pointerId); } catch(err){}
        mini.style.transition = 'none';
      }
      const ox = band(dx, 46), oy = band(dy, 30);
      mini.style.transform = 'translate(' + ox.toFixed(1) + 'px,' + oy.toFixed(1) + 'px) rotate(' + (ox * 0.04).toFixed(2) + 'deg) scale(' + (1 - Math.min(0.03, Math.hypot(ox, oy) / 1500)).toFixed(3) + ')';
    });
    const end = () => {
      if (!down) return; down = false;
      if (!locked) return;
      clickBlock = performance.now() + 350;       // the click that follows a drag must not open the player
      mini.style.transition = 'transform .5s cubic-bezier(.3,1.6,.5,1)';
      mini.style.transform = '';
      setTimeout(() => { if (!down) mini.style.transition = ''; }, 520);
    };
    mini.addEventListener('pointerup', end);
    mini.addEventListener('pointercancel', end);
    mini.addEventListener('click', e => { if (performance.now() < clickBlock){ e.stopImmediatePropagation(); e.preventDefault(); } }, true);
    mini.addEventListener('keydown', e => { if ((e.key === 'Delete' || e.key === 'Backspace') && e.target === mini){ e.preventDefault(); miniDismissed = miniKey(); syncMini(); } });
  }
  miniPlay.addEventListener('click', () => playBtn.click());
  miniPrev.addEventListener('click', () => prevBtn.click());
  miniNext.addEventListener('click', () => nextBtn.click());

  const obs = new MutationObserver(syncMini);
  obs.observe(npTitle, { childList:true, subtree:true, characterData:true });
  obs.observe(npArtist, { childList:true, subtree:true, characterData:true });
  obs.observe(playBtn, { attributes:true, attributeFilter:['aria-label','title'], childList:true });
  obs.observe(artImg, { attributes:true, attributeFilter:['src','style'] });

  toggle.addEventListener('change', () => {
    try { localStorage.setItem(KEY, toggle.checked ? '0' : '1'); } catch(e){}
    apply(!toggle.checked);
  });


  // ================= Home screen: Videos / History / Playlists =================
  const homeEl = document.getElementById('pl-home');
  const HKEY = 'playerHistoryV1';
  let playHistory = [];
  try { playHistory = JSON.parse(localStorage.getItem(HKEY)) || []; } catch(e){}
  var openSec = null;   // 'videos' | 'audio' | 'history': that section's own full page on the Home tab
  var openPlId = null;   // playlist whose own page is open on the Playlists tab
  let lastSig = '', lastView = '', homeTimer = null;
  const thumbCache = new Map();   // dbId -> dataURL | null (failed)
  const thumbQueue = [], thumbPending = new Set();
  let thumbRunning = 0;

  const esc = v => String(v == null ? '' : v).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const fmtDur = sec => {
    if (!isFinite(sec) || sec == null || sec <= 0) return '';
    sec = Math.round(sec);
    const h = Math.floor(sec / 3600), m = Math.floor(sec % 3600 / 60), r = sec % 60;
    return h ? h + ':' + String(m).padStart(2,'0') + ':' + String(r).padStart(2,'0') : m + ':' + String(r).padStart(2,'0');
  };
  const relTime = ts => {
    const d = (Date.now() - ts) / 1000;
    if (d < 60) return 'Just now';
    if (d < 3600) return Math.floor(d / 60) + ' min ago';
    if (d < 86400) return Math.floor(d / 3600) + ' h ago';
    if (d < 86400 * 30) return Math.floor(d / 86400) + ' d ago';
    return new Date(ts).toLocaleDateString();
  };
  const IC_PH = '<svg class="ph-ph" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="14" rx="2"/><polygon points="10 9 16 12 10 15 10 9" fill="currentColor"/></svg>';
  const IC_PH_AUDIO = '<svg class="ph-ph" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>';
  const IC_VID = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="14" rx="2"/><polygon points="10 9 16 12 10 15 10 9" fill="currentColor"/></svg>';
  const IC_AUD = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>';
  const IC_CHEV = '<svg class="ph-pl-chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 6 15 12 9 18"/></svg>';
  const IC_SHUF = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 3h5v5M4 20L21 3M21 16v5h-5M15 15l6 6M4 4l5 5"/></svg>';
  const IC_PLAYSM = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>';
  const IC_BACK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>';

  // --- thumbnails: custom art if the track has it, otherwise a captured video frame ---
  function thumbSrc(t){ return t.artUrl || thumbCache.get(t.dbId) || null; }
  window.__ppThumbSrc = thumbSrc;   // also used by the in-game now-playing card
  function makeThumb(url){
    return new Promise(resolve => {
      const v = document.createElement('video');
      v.muted = true; v.playsInline = true; v.preload = 'metadata';
      let done = false;
      const fin = d => { if (done) return; done = true; try { v.removeAttribute('src'); v.load(); } catch(e){} resolve(d); };
      v.onloadedmetadata = () => { try { v.currentTime = Math.min(1, (v.duration || 2) * 0.1); } catch(e){ fin(null); } };
      v.onseeked = () => {
        try {
          const w = 320, h = Math.round(w * (v.videoHeight || 9) / (v.videoWidth || 16));
          const c = document.createElement('canvas'); c.width = w; c.height = h;
          c.getContext('2d').drawImage(v, 0, 0, w, h);
          fin(c.toDataURL('image/jpeg', 0.7));
        } catch(e){ fin(null); }
      };
      v.onerror = () => fin(null);
      setTimeout(() => fin(null), 8000);
      v.src = url;
    });
  }
  // Phones only have a few hardware decoder sessions. Don't spend one on a thumbnail while the real
  // video is playing (it can starve the player into a frozen/silent state), and do one at a time.
  let thumbDeferTimer = null;
  function mainVideoBusy(){
    const V = document.getElementById('video-el');
    return !!(V && V.currentSrc && !V.paused && !V.ended);
  }
  function pumpThumbs(){
    if (thumbQueue.length && mainVideoBusy()){
      if (!thumbDeferTimer) thumbDeferTimer = setTimeout(() => { thumbDeferTimer = null; pumpThumbs(); }, 1500);
      return;
    }
    while (thumbRunning < 1 && thumbQueue.length){
      const t = thumbQueue.shift(); thumbRunning++;
      makeThumb(t.url).then(d => {
        thumbCache.set(t.dbId, d); thumbPending.delete(t.dbId);
        try { syncMini(); } catch(e){}
        if (d) homeEl.querySelectorAll('.ph-thumb').forEach(el => {
          if (el.dataset.thumbId !== t.dbId || el.querySelector('img')) return;
          const img = document.createElement('img'); img.alt = ''; img.src = d;
          el.insertBefore(img, el.firstChild); el.classList.add('has-img');
        });
      }).finally(() => { thumbRunning--; pumpThumbs(); });
    }
  }
  function requestThumb(t){
    if (!t || t.kind !== 'video' || t.artUrl || thumbCache.has(t.dbId) || thumbPending.has(t.dbId)) return;
    thumbPending.add(t.dbId); thumbQueue.push(t); pumpThumbs();
  }
  const thumbObserver = ('IntersectionObserver' in window) ? new IntersectionObserver(entries => {
    entries.forEach(e => {
      if (!e.isIntersecting) return;
      thumbObserver.unobserve(e.target);
      const A = window.__ppApi; if (!A) return;
      requestThumb(A.tracks().find(t => t.dbId === e.target.dataset.thumbId));
    });
  }, { rootMargin:'200px' }) : null;

  function thumbHTML(t, showDur){
    const src = t && thumbSrc(t);
    const d = showDur && t ? fmtDur(t.duration) : '';
    return '<div class="ph-thumb' + (src ? ' has-img' : '') + '" data-thumb-id="' + esc(t ? t.dbId : '') + '">' +
      (src ? '<img src="' + esc(src) + '" alt="">' : '') +
      (t && t.kind === 'audio' ? IC_PH_AUDIO : IC_PH) +
      (d ? '<span class="ph-dur">' + d + '</span>' : '') + '</div>';
  }
  function cardHTML(t, i, srcKey, sub, cur){
    return '<button type="button" class="ph-card' + (cur ? ' cur' : '') + '" data-act="play-video" data-src="' + srcKey + '" data-idx="' + i + '">' +
      thumbHTML(t, true) +
      '<div class="ph-title">' + esc(t.title) + '</div>' +
      '<div class="ph-sub">' + esc(sub) + '</div></button>';
  }
  // A playlist's own picture, else its first video's thumbnail (see plInfo)
  function plThumbHTML(pl, first){
    if (pl && pl.thumb) return '<div class="ph-thumb has-img"><img src="' + esc(pl.thumb) + '" alt=""></div>';
    return thumbHTML(first, false);
  }
  function sectionHTML(key, title, items, emptyMsg, extraBtn){
    const COLLAPSED = 10;
    const n = items.length;
    const shown = items.slice(0, COLLAPSED);
    return '<section class="ph-sec"><div class="ph-sec-head"><h2>' + title + '</h2><span class="ph-count">' + (n ? n : '') + '</span><span class="ph-spacer"></span>' +
      (extraBtn || '') +
      (n > 3 ? '<button type="button" class="ph-link" data-act="sec-open" data-sec="' + key + '">See all</button>' : '') +
      '</div>' +
      (n ? '<div class="ph-row">' + shown.join('') + '</div>'
         : '<div class="ph-empty">' + emptyMsg + '</div>') + '</section>';
  }



  // ----- Edition strip at the top of the Library list (normal layout) -----
  const edStrip = document.getElementById('ed-strip');
  let stripSig = '';
  function renderStrip(force){
    try {
      const el = document.getElementById('ed-strip'); if (!el) return;
      const A = window.__ppApi; if (!A) return;
      const ed = window.__ppEdition ? window.__ppEdition() : '';
      if (!ed || document.body.classList.contains('player-layout')){ if (el.innerHTML) el.innerHTML = ''; stripSig = ''; el.dataset.ed = ''; return; }
      const tracks = A.tracks(), cur = A.currentIndex();
      const byId = new Map(tracks.map((t, i) => [t.dbId, i]));
      const hist = playHistory.map(h => byId.get(h.id)).filter(i => i != null);
      const heroI = (cur >= 0 && tracks[cur]) ? cur : (hist.length ? hist[0] : -1);
      const sig = JSON.stringify([ed, heroI, heroI >= 0 ? tracks[heroI].title : '', tracks.length, hist.length > 0, heroI >= 0 && thumbCache.has(tracks[heroI].dbId)]);
      if (!force && sig === stripSig) return;
      stripSig = sig; el.dataset.ed = ed;
      if (!tracks.length){ el.innerHTML = ''; return; }
      if (ed === 'plus'){
        el.innerHTML = '<div class="ph-chips eds-chips"><button type="button" class="ph-chip" data-act="shuffle-all">' + IC_SHUF + 'Shuffle all</button>' +
          (hist.length ? '<button type="button" class="ph-chip" data-act="resume">' + IC_PLAYSM + 'Resume</button>' : '') + '</div>';
      } else if (heroI >= 0){
        const label = (cur >= 0 && tracks[cur]) ? 'NOW PLAYING' : 'CONTINUE';
        el.innerHTML = '<button type="button" class="eds-card" data-act="strip-play" data-idx="' + heroI + '">' + thumbHTML(tracks[heroI], false) +
          '<div class="eds-text"><div class="eds-label">' + label + '</div><div class="eds-title">' + esc(tracks[heroI].title) + '</div></div></button>';
        if (thumbObserver) el.querySelectorAll('.ph-thumb:not(.has-img)').forEach(t => thumbObserver.observe(t));
      } else el.innerHTML = '';
    } catch(e){ /* not ready yet */ }
  }
  if (edStrip) edStrip.addEventListener('click', e => {
    const el = e.target.closest('[data-act]'); if (!el) return;
    const A = window.__ppApi; if (!A) return;
    const tracks = A.tracks(), all = tracks.map((t, k) => k).filter(k => !tracks[k].stem), act = el.dataset.act;
    if (A.sel && A.sel.active()){ if (act === 'strip-play'){ const t = tracks[+el.dataset.idx]; if (t) A.sel.toggle(t); } return; }
    if (act === 'strip-play') playFrom(+el.dataset.idx, all);
    else if (act === 'shuffle-all'){
      const q = all.slice();
      for (let k = q.length - 1; k > 0; k--){ const r = Math.floor(Math.random() * (k + 1)); [q[k], q[r]] = [q[r], q[k]]; }
      if (q.length) playFrom(q[0], q);
    } else if (act === 'resume'){
      const byId = new Map(tracks.map((t, k) => [t.dbId, k]));
      const h = playHistory.map(x => byId.get(x.id)).find(k => k != null);
      if (h != null) playFrom(h, all);
    }
  });

  // ----- Edition layouts (Lite / Plus / Premium each get their own Home) -----
  const TAGLINES = { lite: 'Just play.', plus: 'Everything unlocked.', premium: 'The full experience.', playground: 'Everything. Unlocked. Unleashed.' };
  function listRowHTML(t, i, srcKey, sub, cur){
    return '<button type="button" class="ph-card ph-lrow' + (cur ? ' cur' : '') + '" data-act="play-video" data-src="' + srcKey + '" data-idx="' + i + '">' +
      thumbHTML(t, true) +
      '<div class="ph-lrow-text"><div class="ph-title">' + esc(t.title) + '</div><div class="ph-sub">' + esc(sub) + '</div></div></button>';
  }
  function heroHTML(t, i, label, sub){
    return '<div class="ph-hero-wrap"><button type="button" class="ph-card ph-hero' + '" data-act="play-video" data-src="videos" data-idx="' + i + '">' +
      thumbHTML(t, true) +
      '<div class="ph-hero-label">' + label + '</div>' +
      '<div class="ph-title">' + esc(t.title) + '</div>' +
      '<div class="ph-sub">' + esc(sub) + '</div></button></div>';
  }

  function renderHome(force){
    if (!on || (view !== 'home' && view !== 'playlists')) return;
    const A = window.__ppApi; if (!A) return;
    const tracks = A.tracks(), pls = A.playlists().filter(p => !p.libOnly), cur = A.currentIndex();
    const byId = new Map(tracks.map((t, i) => [t.dbId, i]));
    const vidIdx = [];
    tracks.forEach((t, i) => { if (t.kind === 'video') vidIdx.push(i); });
    const hist = playHistory.map(h => ({ h, i: byId.get(h.id) })).filter(x => x.i != null && tracks[x.i].kind === 'video');
    const audIdx = [];
    tracks.forEach((t, i) => { if (t.kind === 'audio' && !t.stem) audIdx.push(i); });
    const histAll = playHistory.map(h => ({ h, i: byId.get(h.id) })).filter(x => x.i != null);
    const plData = pls.map(pl => {
      const idxs = []; tracks.forEach((t, i) => { if ((t.playlistIds || []).includes(pl.id)) idxs.push(i); });
      return { pl, idxs };
    });

    const sig = JSON.stringify([
      tracks.map(t => [t.dbId, t.title, t.kind, t.duration, !!t.artUrl, thumbCache.has(t.dbId), t.playlistIds]),
      pls, view, histAll.map(x => [x.h.id, x.h.at]), tracks.map(t => t.artist), cur, openSec, openPlId, (window.__ppEdition ? window.__ppEdition() : '')
    ]);
    if (!force && sig === lastSig) return;
    lastSig = sig;

    // Videos
    const vCards = vidIdx.map(i => cardHTML(tracks[i], i, 'videos', tracks[i].height ? tracks[i].height + 'p' : (tracks[i].ext || '').toUpperCase(), i === cur));
    // History
    const audSub = t => (t.artist && t.artist !== 'Unknown artist') ? t.artist : (t.ext || '').toUpperCase();
    const aCards = audIdx.map(i => cardHTML(tracks[i], i, 'audio', audSub(tracks[i]), i === cur));
    const hCards = histAll.map(x => cardHTML(tracks[x.i], x.i, 'history', relTime(x.h.at), x.i === cur));
    const SEC_TITLE = { videos:'Videos', audio:'Audio', history:'History' };
    const tabsHTML = active => '<div class="ph-chips ph-tabs">' + [['all','All'],['videos','Videos'],['audio','Audio'],['history','History']].map(t =>
      '<button type="button" class="ph-chip' + (active === t[0] ? ' on' : '') + '" data-act="home-tab" data-tab="' + t[0] + '">' + t[1] + '</button>').join('') + '</div>';
    // Playlists
    let plHTML;
    function plInfo(idxs){
      const vc = idxs.filter(i => tracks[i].kind === 'video').length, ac = idxs.length - vc;
      const total = idxs.reduce((a, i) => a + (isFinite(tracks[i].duration) ? tracks[i].duration : 0), 0);
      const first = idxs.map(i => tracks[i]).find(t => t.kind === 'video') || idxs.map(i => tracks[i]).find(t => t.artUrl) || (idxs.length ? tracks[idxs[0]] : null);
      const counts = '<div class="ph-pl-counts"><span title="Videos">' + IC_VID + vc + ' video' + (vc === 1 ? '' : 's') + '</span><span title="Audio tracks">' + IC_AUD + ac + ' audio</span></div>';
      return { total, first, counts };
    }
    if (openPlId && !plData.some(d => d.pl.id === openPlId)) openPlId = null;
    if (openPlId){
      // One playlist on its own page
      const d = plData.find(x => x.pl.id === openPlId), pl = d.pl, n = plInfo(d.idxs);
      const rows = d.idxs.map(i => {
        const t = tracks[i];
        return '<button type="button" class="ph-trk' + (i === cur ? ' cur' : '') + '" data-act="pl-play" data-id="' + esc(pl.id) + '" data-idx="' + i + '">' +
          thumbHTML(t, false) + (t.kind === 'video' ? IC_VID : IC_AUD) +
          '<span class="ph-trk-title">' + esc(t.title) + '</span><span class="ph-trk-dur">' + fmtDur(t.duration) + '</span></button>';
      }).join('');
      plHTML = '<div class="ph-detail">' +
        '<button type="button" class="ph-back" data-act="pl-back">' + IC_BACK + 'Playlists</button>' +
        '<div class="ph-detail-head">' + plThumbHTML(pl, n.first) +
          '<div class="ph-pl-text"><div class="ph-detail-name">' + esc(pl.name) + '</div>' + n.counts +
          '<div class="ph-detail-dur">' + (fmtDur(n.total) || '') + '</div>' +
          '<div class="ph-detail-actions"><button type="button" class="ph-detail-link" data-act="pl-thumb" data-id="' + esc(pl.id) + '">' + (pl.thumb ? 'Change thumbnail' : 'Set thumbnail') + '</button>' +
          (pl.thumb ? '<button type="button" class="ph-detail-link dim" data-act="pl-thumb-reset" data-id="' + esc(pl.id) + '">Reset</button>' : '') + '</div></div></div>' +
        '<div class="ph-detail-tracks">' + (d.idxs.length
          ? '<button type="button" class="ph-pl-playall" data-act="pl-play" data-id="' + esc(pl.id) + '" data-idx="' + d.idxs[0] + '"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>Play all</button>' + rows
          : '<div class="ph-empty" style="padding:6px 0;">This playlist is empty.</div>') + '</div></div>';
    } else if (!plData.length){
      plHTML = '<div class="ph-empty">No playlists yet. Turn off \u201cSimple playlist mode\u201d in Settings to create them.</div>';
    } else {
      plHTML = plData.map(({ pl, idxs }) => {
        const n = plInfo(idxs);
        return '<div class="ph-pl"><button type="button" class="ph-pl-head" data-act="pl-open" data-id="' + esc(pl.id) + '">' +
          plThumbHTML(pl, n.first) +
          '<div class="ph-pl-text"><div class="ph-pl-name">' + esc(pl.name) + '</div>' + n.counts + '</div>' +
          '<span class="ph-pl-dur">' + (fmtDur(n.total) || '\u2013') + '</span>' + IC_CHEV +
        '</button></div>';
      }).join('');
    }

    const top = homeEl.scrollTop;
    if (view === 'playlists'){
      homeEl.innerHTML =
        (openPlId ? '' : '<h1 class="ph-app-title">Playlists</h1>') +
        '<section class="ph-sec" style="margin-top:' + (openPlId ? 0 : 14) + 'px;">' + plHTML + '</section>';
    } else if (openSec){
      // One section on its own page: every item in a grid
      const items = openSec === 'videos' ? vCards : (openSec === 'audio' ? aCards : hCards);
      homeEl.innerHTML =
        tabsHTML(openSec) +
        '<div class="ph-sec-head ph-page-head"><h1 class="ph-app-title ph-page-title">' + SEC_TITLE[openSec] + '</h1>' +
          '<span class="ph-count">' + (items.length || '') + '</span><span class="ph-spacer"></span>' +
          (openSec === 'history' && items.length ? '<button type="button" class="ph-link dim" data-act="clear-history">Clear</button>' : '') + '</div>' +
        (items.length ? '<div class="ph-row expanded ph-page-grid">' + items.join('') + '</div>'
          : '<div class="ph-empty">' + (openSec === 'videos' ? 'No videos yet. Add files from the Library tab.' : openSec === 'audio' ? 'No audio yet. Add files from the Library tab.' : 'Played tracks show up here.') + '</div>');
    }
    const ed = window.__ppEdition ? window.__ppEdition() : '';
    homeEl.dataset.ed = ed;
    if (!(view === 'home' && openSec) && view !== 'playlists'){
      const histBtn = hCards.length ? '<button type="button" class="ph-link dim" data-act="clear-history">Clear</button>' : '';
      const vSec = sectionHTML('videos', 'Videos', vCards, 'No videos yet. Add files from the Library tab.');
      const aSec = sectionHTML('audio', 'Audio', aCards, 'No audio yet. Add files from the Library tab.');
      const hSec = sectionHTML('history', 'History', hCards, 'Played tracks show up here.', histBtn);
      const tabs = tabsHTML('all');
      // Featured video: what's playing, else the last one watched, else the first video
      const curIsVid = cur >= 0 && tracks[cur] && tracks[cur].kind === 'video';
      const heroI = curIsVid ? cur : (hist.length ? hist[0].i : (vidIdx.length ? vidIdx[0] : -1));
      const heroLabel = curIsVid ? 'NOW PLAYING' : (hist.length ? 'CONTINUE' : 'START HERE');
      const heroSub = heroI >= 0 ? (tracks[heroI].height ? tracks[heroI].height + 'p' : (tracks[heroI].ext || '').toUpperCase()) : '';
      const hero = heroI >= 0 ? heroHTML(tracks[heroI], heroI, heroLabel, heroSub) : '';
      const head = '<div class="ph-title-row"><h1 class="ph-app-title">Press Play Media<span class="ed-slot"></span></h1>' +
        '<button type="button" class="pp-games-btn" data-pp-games aria-label="Games"><span class="pp-gi"><svg viewBox="0 0 24 24" aria-hidden="true"><path fill="#fff" d="M7.6 6.5h8.8a5.2 5.2 0 0 1 5.1 4.2l.9 4.9a2.7 2.7 0 0 1-4.7 2.3l-2.1-2.4H8.4l-2.1 2.4a2.7 2.7 0 0 1-4.7-2.3l.9-4.9a5.2 5.2 0 0 1 5.1-4.2z"/><path fill="#5a3fc4" d="M6.6 9.3h1.6v1.6h1.6v1.6H8.2v1.6H6.6v-1.6H5v-1.6h1.6z"/><circle cx="16.2" cy="10.2" r="1.15" fill="#5a3fc4"/><circle cx="18" cy="12.3" r="1.15" fill="#5a3fc4"/></svg></span><span>Games</span></button></div>' +
        (ed ? '<div class="ph-tag">' + TAGLINES[ed] + '</div>' : '');
      if (ed === 'lite'){
        const rows = vidIdx.map(i => listRowHTML(tracks[i], i, 'videos', tracks[i].height ? tracks[i].height + 'p' : (tracks[i].ext || '').toUpperCase(), i === cur));
        const aRows = audIdx.map(i => listRowHTML(tracks[i], i, 'audio', audSub(tracks[i]), i === cur));
        homeEl.innerHTML = head + tabs + hero +
          '<section class="ph-sec"><div class="ph-sec-head"><h2>Videos</h2><span class="ph-count">' + (rows.length || '') + '</span></div>' +
          (rows.length ? '<div class="ph-list">' + rows.join('') + '</div>' : '<div class="ph-empty">No videos yet. Add files from the Library tab.</div>') + '</section>' +
          '<section class="ph-sec"><div class="ph-sec-head"><h2>Audio</h2><span class="ph-count">' + (aRows.length || '') + '</span></div>' +
          (aRows.length ? '<div class="ph-list">' + aRows.join('') + '</div>' : '<div class="ph-empty">No audio yet. Add files from the Library tab.</div>') + '</section>';
      } else if (ed === 'plus'){
        const chips = vidIdx.length
          ? '<div class="ph-chips"><button type="button" class="ph-chip" data-act="shuffle-all">' + IC_SHUF + 'Shuffle all</button>' +
            (hist.length ? '<button type="button" class="ph-chip" data-act="resume">' + IC_PLAYSM + 'Resume</button>' : '') + '</div>'
          : '';
        homeEl.innerHTML = head + tabs + chips + vSec + aSec + hSec;
      } else if (ed === 'premium'){
        homeEl.innerHTML = head + tabs + hero + vSec + aSec + hSec;
      } else if (ed === 'playground'){
        homeEl.innerHTML = head + (window.PPPlayground && window.PPPlayground.homeStrip ? window.PPPlayground.homeStrip() : '') + tabs + vSec + aSec + hSec;
      } else {
        homeEl.innerHTML = head + tabs + vSec + aSec + hSec;
      }
    }
    const pageKey = view + ':' + (openPlId || '') + ':' + (openSec || '');
    homeEl.scrollTop = (lastView === pageKey) ? top : 0;
    lastView = pageKey;
    syncSelUI();
    if (window.__ppSyncTitle) window.__ppSyncTitle();
    if (thumbObserver) homeEl.querySelectorAll('.ph-thumb:not(.has-img)').forEach(el => thumbObserver.observe(el));
  }
  function scheduleHome(){
    if (homeTimer) return;
    homeTimer = setTimeout(() => { homeTimer = null; renderHome(false); renderStrip(false); }, 250);
  }

  function playFrom(i, queue){
    const A = window.__ppApi; if (!A) return;
    A.play(i, queue);
    if (A.tracks()[i] && A.tracks()[i].kind === 'video') openPlayer();
  }
  homeEl.addEventListener('click', e => {
    const el = e.target.closest('[data-act]'); if (!el) return;
    const A = window.__ppApi; if (!A) return;
    const tracks = A.tracks(), act = el.dataset.act;
    if (act === 'shuffle-all'){
      const q = []; tracks.forEach((t, k) => { if (t.kind === 'video') q.push(k); });
      for (let k = q.length - 1; k > 0; k--){ const r = Math.floor(Math.random() * (k + 1)); [q[k], q[r]] = [q[r], q[k]]; }
      if (q.length) playFrom(q[0], q);
    }
    else if (act === 'resume'){
      const byId = new Map(tracks.map((t, k) => [t.dbId, k]));
      const h = playHistory.map(x => byId.get(x.id)).find(k => k != null && tracks[k].kind === 'video');
      if (h != null){ const q = []; tracks.forEach((t, k) => { if (t.kind === 'video') q.push(k); }); playFrom(h, q); }
    }
    else if (act === 'sec-open'){ openSec = el.dataset.sec; renderHome(true); }
    else if (act === 'sec-back'){ openSec = null; renderHome(true); }
    else if (act === 'home-tab'){ openSec = el.dataset.tab === 'all' ? null : el.dataset.tab; renderHome(true); }
    else if (act === 'clear-history'){
      playHistory = [];
      try { localStorage.setItem(HKEY, '[]'); } catch(err){}
      renderHome(true);
    }
    else if (act === 'play-video'){
      const i = +el.dataset.idx;
      let queue;
      if (el.dataset.src === 'history'){
        const byId = new Map(tracks.map((t, k) => [t.dbId, k]));
        queue = playHistory.map(h => byId.get(h.id)).filter(k => k != null);
      } else if (el.dataset.src === 'audio'){
        queue = []; tracks.forEach((t, k) => { if (t.kind === 'audio' && !t.stem) queue.push(k); });
      } else {
        queue = []; tracks.forEach((t, k) => { if (t.kind === 'video') queue.push(k); });
      }
      playFrom(i, queue);
    }
    else if (act === 'pl-open'){ openPlId = el.dataset.id; renderHome(true); }
    else if (act === 'pl-back'){ openPlId = null; renderHome(true); }
    else if (act === 'pl-thumb'){ if (A.pickPlaylistThumb) A.pickPlaylistThumb(el.dataset.id); }
    else if (act === 'pl-thumb-reset'){ if (A.clearPlaylistThumb) A.clearPlaylistThumb(el.dataset.id); }
    else if (act === 'pl-play'){
      const id = el.dataset.id, queue = [];
      tracks.forEach((t, k) => { if ((t.playlistIds || []).includes(id)) queue.push(k); });
      playFrom(+el.dataset.idx, queue);
    }
  });

  // ----- Selecting (long-press), same state and actions as Library multi-select -----
  const SVG = d => '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' + d + '</svg>';
  const selBar = document.createElement('div');
  selBar.id = 'ph-select-bar';
  selBar.setAttribute('role', 'toolbar');
  selBar.innerHTML =
    '<div class="phs-top">' +
      '<button type="button" class="phs-x" data-act="cancel" aria-label="Cancel selection">' + SVG('<path d="M6 6l12 12M18 6L6 18"/>') + '</button>' +
      '<div class="phs-count"><span id="phs-n">0</span> selected</div>' +
      '<button type="button" class="phs-all" data-act="all" id="phs-all">Select all</button>' +
    '</div>' +
    '<div class="phs-actions">' +
      '<button type="button" class="phs-act" data-act="playlist">' + SVG('<path d="M4 6h12M4 12h8M4 18h8M17 14v6M14 17h6"/>') + 'Playlists</button>' +
      '<button type="button" class="phs-act" data-act="move-pl">' + SVG('<path d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z"/>') + 'Move to</button>' +
      '<button type="button" class="phs-act" data-act="remove-pl">' + SVG('<path d="M5 12h14"/><circle cx="12" cy="12" r="9"/>') + 'Remove</button>' +
      '<button type="button" class="phs-act" data-act="rename">' + SVG('<path d="M12 20h9M16.5 3.5a2.1 2.1 0 013 3L7 19l-4 1 1-4z"/>') + 'Rename</button>' +
      '<button type="button" class="phs-act" data-act="rename-artist">' + SVG('<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0116 0"/>') + 'Artist</button>' +
      '<button type="button" class="phs-act" data-act="convert">' + SVG('<path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>') + 'To MP3</button>' +
      '<button type="button" class="phs-act danger" data-act="delete">' + SVG('<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>') + 'Delete</button>' +
    '</div>';
  document.body.appendChild(selBar);

  function homeScopeIdxs(){
    const seen = new Set(), out = [];
    homeEl.querySelectorAll('.ph-card[data-idx], .ph-trk[data-idx]').forEach(el => {
      const i = +el.dataset.idx; if (!seen.has(i)){ seen.add(i); out.push(i); }
    });
    return out;
  }
  function selContextPl(){ return (view === 'playlists' && openPlId) ? openPlId : null; }
  function syncSelUI(){
    const A = window.__ppApi, act = !!(A && on && A.sel.active() && (view === 'home' || view === 'playlists'));
    body.classList.toggle('ph-selecting', act);
    if (!act){ homeEl.querySelectorAll('.sel').forEach(el => el.classList.remove('sel')); return; }
    const tr = A.tracks();
    let all = true, any = false;
    homeEl.querySelectorAll('.ph-card[data-idx], .ph-trk[data-idx]').forEach(el => {
      const t = tr[+el.dataset.idx], on_ = !!t && A.sel.has(t);
      el.classList.toggle('sel', on_);
      any = true; if (!on_) all = false;
    });
    selBar.querySelector('#phs-n').textContent = A.sel.count();
    selBar.querySelector('#phs-all').textContent = (any && all) ? 'Deselect all' : 'Select all';
    const q = a => selBar.querySelector('[data-act="' + a + '"]');
    const inPl = !!selContextPl();
    q('playlist').hidden = !A.playlists().some(p => p.id !== selContextPl());
    q('move-pl').hidden = !inPl;
    q('remove-pl').hidden = !inPl;
    q('convert').hidden = !A.sel.hasVideo();
  }
  window.__ppOnSelect = syncSelUI;

  selBar.addEventListener('click', e => {
    const btn = e.target.closest('[data-act]'); if (!btn) return;
    const A = window.__ppApi; if (!A) return;
    if (btn.dataset.act === 'all') A.sel.all(homeScopeIdxs());
    else A.sel.act(btn.dataset.act, btn);
  });

  // Long-press a card / playlist row to start selecting
  let selTimer = null, selFired = false, selSuppressUntil = 0, selX = 0, selY = 0;
  const selCancel = () => { if (selTimer){ clearTimeout(selTimer); selTimer = null; } };
  homeEl.addEventListener('pointerdown', e => {
    const A = window.__ppApi; if (!A || A.sel.active()) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    const el = e.target.closest('.ph-card[data-idx], .ph-trk[data-idx]'); if (!el) return;
    selCancel(); selFired = false; selX = e.clientX; selY = e.clientY;
    selTimer = setTimeout(() => {
      selTimer = null;
      const t = A.tracks()[+el.dataset.idx]; if (!t) return;
      selFired = true;
      A.sel.enter(t, selContextPl());
    }, 450);
  });
  homeEl.addEventListener('pointermove', e => {
    if (selTimer && Math.hypot(e.clientX - selX, e.clientY - selY) > 10) selCancel();
  });
  homeEl.addEventListener('pointerup', () => {
    if (selFired){ selSuppressUntil = performance.now() + 400; selFired = false; }
    selCancel();
  });
  homeEl.addEventListener('pointercancel', selCancel);
  homeEl.addEventListener('pointerleave', selCancel);
  homeEl.addEventListener('contextmenu', e => {
    const A = window.__ppApi;
    if ((A && A.sel.active()) || performance.now() < selSuppressUntil || selFired) e.preventDefault();
  });
  // Runs before the normal click handler: swallow the release click of a long-press,
  // and turn taps into toggles while selecting.
  homeEl.addEventListener('click', e => {
    const A = window.__ppApi; if (!A) return;
    if (performance.now() < selSuppressUntil){ e.stopImmediatePropagation(); e.preventDefault(); return; }
    if (!A.sel.active()) return;
    const el = e.target.closest('[data-act]'); if (!el) return;
    const act = el.dataset.act;
    if (act === 'play-video' || act === 'pl-play'){
      e.stopImmediatePropagation();
      const t = A.tracks()[+el.dataset.idx];
      if (t) A.sel.toggle(t);
    } else if (act === 'shuffle-all' || act === 'resume'){
      e.stopImmediatePropagation(); e.preventDefault();   // would start playback and open the player page mid-selection
    } else if (act === 'sec-open' || act === 'sec-back' || act === 'home-tab' || act === 'pl-open' || act === 'pl-back'){
      A.sel.exit();   // leaving the page ends the selection, like switching playlists in Library
    }
  }, true);
  // Backgrounds from the Customize panel: Home shows the App background (the
  // page behind it); Playlists uses the Playlist background, same as Library.
  function syncHomeBg(){
    const A = window.__ppApi; if (!A || !A.applyPlaylistStyle) return;
    if (on && view === 'playlists') A.applyPlaylistStyle(homeEl); else A.clearStyle(homeEl);
  }
  window.__ppOnCustomize = syncHomeBg;
  window.__ppRenderHomeNow = () => { try { renderHome(true); } catch(e){} renderStrip(true); };
  window.__ppOnChange = scheduleHome;
  window.__ppOnPlay = t => {
    if (miniDismissed){ miniDismissed = null; syncMini(); }   // playing a track again brings the mini-player back
    if (!t || !t.dbId) return;
    playHistory = playHistory.filter(h => h.id !== t.dbId);
    playHistory.unshift({ id:t.dbId, at:Date.now(), kind:t.kind });
    playHistory = playHistory.slice(0, 60);
    try { localStorage.setItem(HKEY, JSON.stringify(playHistory)); } catch(e){}
    scheduleHome();
  };


  // ================= Video page: tap to show / hide the controls =================
  const videoEl = document.getElementById('video-el');
  const controlsCol = document.getElementById('controls-col');
  let uiTimer = null;
  const isVideoMode = () => body.classList.contains('pl-video') && body.hasAttribute('data-pl-player');
  const uiShown = () => body.classList.contains('pl-ui-show');
  const videoTools = document.getElementById('video-tools');
  const subtitleLine = document.getElementById('subtitle-text');
  let uiBusy = false;   // a control or the subtitle line is being held / dragged
  // Pin button, 3 states: 0 = normal auto-hide, 1 = pinned open, 2 = pinned hidden. Each tap moves to the next.
  const PIN_KEY = 'ppPlayerControlsMode';
  const pinBtn = document.getElementById('pl-pin-btn');
  let uiMode = 0;
  try { uiMode = parseInt(localStorage.getItem(PIN_KEY), 10) || 0; } catch(e){}
  if (uiMode < 0 || uiMode > 2) uiMode = 0;
  const PIN_LABELS = ['Controls: auto-hide (tap to keep open)', 'Controls: kept open (tap to keep hidden)', 'Controls: kept hidden (tap for auto-hide)'];
  function syncPinBtn(){
    body.classList.toggle('pl-ctl-hide', uiMode === 2);
    if (!pinBtn) return;
    pinBtn.classList.toggle('pinned', uiMode === 1);
    pinBtn.classList.toggle('hidden-mode', uiMode === 2);
    pinBtn.title = PIN_LABELS[uiMode];
    pinBtn.setAttribute('aria-label', PIN_LABELS[uiMode]);
  }
  syncPinBtn();
  // Any open menu counts: dropdowns anywhere (bottom bar, video toolbar, sidebar), the settings
  // menu and every modal. All of them show/hide with display, so a visible box means open.
  const OPEN_MENU_SEL = '[id$="-dropdown"], [id$="-modal-overlay"], #menu-overlay, #ppp-overlay';
  const dropdownOpen = () => Array.from(document.querySelectorAll(OPEN_MENU_SEL))
    .some(d => getComputedStyle(d).display !== 'none' && d.getClientRects().length > 0);
  function armHide(){
    clearTimeout(uiTimer);
    uiTimer = setTimeout(() => {
      if (!isVideoMode() || !uiShown()) return;
      if (uiMode === 1) return;                              // pinned open: controls stay up
      if (uiBusy || dropdownOpen()){ armHide(); return; }   // stay up while a menu is open or in use
      hideUi();
    }, 3000);
  }
  function showUi(){ if (uiMode === 2) return; body.classList.add('pl-ui-show'); armHide(); }   // mode 2: stays hidden
  function hideUi(){ body.classList.remove('pl-ui-show'); clearTimeout(uiTimer); }
  if (pinBtn) pinBtn.addEventListener('click', () => {
    uiMode = (uiMode + 1) % 3;
    try { localStorage.setItem(PIN_KEY, String(uiMode)); } catch(e){}
    syncPinBtn();
    if (uiMode === 2) hideUi();
    else showUi();   // mode 1 stays up; mode 0 resumes the normal timer
  });
  function kickVideoLayer(){
    if (!body.classList.contains('pl-video')) return;
    body.classList.add('pl-kick');
    requestAnimationFrame(() => requestAnimationFrame(() => body.classList.remove('pl-kick')));
  }
  function syncVideoMode(){
    const v = on && getComputedStyle(videoWrap).display !== 'none';
    body.classList.toggle('pl-video', v);
    if (!v){ hideUi(); }
    else if (body.hasAttribute('data-pl-player')){ showUi(); kickVideoLayer(); }
    resize();
  }
  ['loadeddata', 'playing'].forEach(ev => videoEl.addEventListener(ev, kickVideoLayer));
  const menuOv = document.getElementById('menu-overlay');
  if (menuOv) new MutationObserver(kickVideoLayer).observe(menuOv, { attributes:true, attributeFilter:['style', 'class'] });
  new MutationObserver(syncVideoMode).observe(videoWrap, { attributes:true, attributeFilter:['style'] });
  window.__ppTap = () => {
    if (!isVideoMode()) return false;
    showUi();            // a tap only shows / keeps the controls; it never hides them
    return true;
  };
  // Publish the controls bar height so bottom subtitles can sit above it.
  if ('ResizeObserver' in window){
    new ResizeObserver(() => {
      document.documentElement.style.setProperty('--pl-ctl-h', Math.ceil(controlsCol.getBoundingClientRect().height) + 'px');
    }).observe(controlsCol);
  }
  // Using any control keeps the bar up a little longer.
  [controlsCol, videoTools].forEach(el => {
    ['pointerdown', 'input', 'keydown'].forEach(ev =>
      el.addEventListener(ev, () => { if (uiShown()) armHide(); }, true));
    el.addEventListener('pointerdown', () => { uiBusy = true; }, true);
  });
  subtitleLine.addEventListener('pointerdown', () => { uiBusy = true; if (uiShown()) armHide(); });
  ['pointerup', 'pointercancel'].forEach(ev =>
    window.addEventListener(ev, () => { if (uiBusy){ uiBusy = false; if (uiShown()) armHide(); } }, true));
  videoEl.addEventListener('play', () => { if (isVideoMode() && uiShown()) armHide(); });
  videoEl.addEventListener('pause', () => { if (isVideoMode()) showUi(); });

  // ================= Gesture map for Media player mode (no one-tap gestures) =================
  const PM_GKEY = 'playerGestureMapPlayerMode';
  const PM_SLOTS = [
    { id:'doubleLeft',   zone:'left',   label:'Double-tap left' },
    { id:'doubleCenter', zone:'center', label:'Double-tap center' },
    { id:'doubleRight',  zone:'right',  label:'Double-tap right' },
    { id:'tripleLeft',   zone:'left',   label:'Triple-tap left' },
    { id:'tripleCenter', zone:'center', label:'Triple-tap center' },
    { id:'tripleRight',  zone:'right',  label:'Triple-tap right' },
    { id:'longPress',    zone:'any',    label:'Long-press' },
    { id:'pinchOut',     zone:'any',    label:'Pinch out (spread)' },
    { id:'pinchIn',      zone:'any',    label:'Pinch in' },
    { id:'twoFingerTap', zone:'any',    label:'Two-finger tap' },
    { id:'twoSwipeUp',   zone:'any',    label:'Two-finger swipe up' },
    { id:'twoSwipeDown', zone:'any',    label:'Two-finger swipe down' },
    { id:'twoSwipeLeft', zone:'any',    label:'Two-finger swipe left' },
    { id:'twoSwipeRight',zone:'any',    label:'Two-finger swipe right' },
    { id:'swipeUp',      zone:'any',    label:'Swipe up' },
    { id:'swipeDown',    zone:'any',    label:'Swipe down' },
    { id:'swipeLeft',    zone:'any',    label:'Swipe left' },
    { id:'swipeRight',   zone:'any',    label:'Swipe right' }
  ];
  const PM_DEFAULTS = {
    doubleLeft:'seekBack10', doubleCenter:'playPause', doubleRight:'seekFwd10',
    tripleLeft:'prev', tripleCenter:'mute', tripleRight:'next',
    longPress:'fullscreen',
    pinchOut:'zoomIn', pinchIn:'zoomOut', twoFingerTap:'playPause',
    twoSwipeUp:'speedUp', twoSwipeDown:'speedDown', twoSwipeLeft:'seekBack60', twoSwipeRight:'seekFwd60',
    swipeUp:'volUp', swipeDown:'volDown', swipeLeft:'prev', swipeRight:'next'
  };
  let pmMap = Object.assign({}, PM_DEFAULTS);
  try {
    const saved = JSON.parse(localStorage.getItem(PM_GKEY));
    if (saved && typeof saved === 'object') pmMap = Object.assign({}, PM_DEFAULTS, saved);
  } catch(e){}
  const pmList = document.getElementById('gesture-pm-list');
  const gConfig = document.getElementById('gestures-config');
  function savePmMap(){ try { localStorage.setItem(PM_GKEY, JSON.stringify(pmMap)); } catch(e){} }
  function renderPmList(){
    const A = window.__ppApi; if (!A || !A.gestureActions) return;
    const actions = A.gestureActions();
    pmList.innerHTML = '';
    PM_SLOTS.forEach(slot => {
      const row = document.createElement('div');
      row.className = 'gesture-map-row';
      row.innerHTML = '<span class="gesture-map-label">' + slot.label + (slot.zone === 'any' ? '' : '<small>' + slot.zone + ' zone</small>') + '</span>' +
        '<select class="gesture-map-select"></select>';
      const sel = row.querySelector('select');
      Object.keys(actions).forEach(k => {
        const o = document.createElement('option'); o.value = k; o.textContent = actions[k].label; sel.appendChild(o);
      });
      sel.value = pmMap[slot.id] || 'none';
      sel.addEventListener('change', () => { pmMap[slot.id] = sel.value; savePmMap(); });
      pmList.appendChild(row);
    });
  }
  document.querySelectorAll('[data-gm-tab]').forEach(b => b.addEventListener('click', () => {
    gConfig.dataset.gm = b.dataset.gmTab;
    document.querySelectorAll('[data-gm-tab]').forEach(x => x.classList.toggle('toggled', x === b));
  }));
  document.getElementById('gesture-pm-reset').addEventListener('click', () => {
    pmMap = Object.assign({}, PM_DEFAULTS); savePmMap(); renderPmList();
  });
  window.__ppGestureMap = () => on ? pmMap : null;
  renderPmList();

  let saved = true;
  try { const v = localStorage.getItem(KEY); if (v !== null) saved = v === '1'; } catch(e){}
  apply(saved);
})();
