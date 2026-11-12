    // ---------- Smart features: one place to switch every smart menu and automation on or off ----------
    // Menus only get hidden (nothing is deleted); automations stop. Tags, playlists and history stay as they are.
    // It lives in the app's Settings tab when there is one, otherwise at the bottom of the Stems panel.
    {
      const FEATS = [
        { g: 'Menus', id: 'tagmenu', label: 'Tagging menu (Library tab)', key: 'ppvShowTag', def: 1, ui: 1 },
        { id: 'savedmenu', label: 'Tagged tracks menu', key: 'ppvShowSaved', def: 1, ui: 1 },
        { id: 'savedvid', label: 'Tagged videos in that menu', key: 'ppvShowVid', def: 1, ui: 1 },
        { id: 'lyrics', label: 'Lyrics & subtitles (Whisper) menu', key: 'ppvShowLyr', def: 1, ui: 1 },
        { g: 'Automatic', id: 'live', label: 'Live smart playlists (follow tags)', key: 'ppvLive', def: 1, box: 'ppv-live' },
        { id: 'mixes', label: 'Auto mixes: For You, Ones You May Like, Your Pattern', key: 'ppvLiveMix', def: 1, box: 'ppv-lmix' },
        { id: 'surp', label: 'Surprise playlists', key: 'ppvSurp', def: 0, box: 'ppv-surp' },
        { id: 'bg', label: 'Background tagging while I am away', key: 'ppvBg', def: 0, box: 'ppv-bg' },
        { id: 'lyfetch', label: 'Fetch lyrics for my songs and music videos in the background, for offline use (sends song titles to lrclib.net and lyrics.ovh)', key: 'ppvLyAuto', def: 0 },
        { id: 'aeq', label: 'Auto-EQ when tagging', key: 'ppvAutoEq', def: 0, box: 'ppv-aeq' },
        { id: 'askip', label: 'Skip long intros', key: 'ppvAutoSkip', def: 0, box: 'ppv-askip' },
        { g: 'Bloopy', id: 'mascot', label: 'Bloopy, the mascot', box: 'ppv-mas', def: 1, get: () => h.mas.isOn() },
        { id: 'blbub', label: 'Bloopy speech bubbles over the app', key: 'ppvBlBubbles', def: 0, box: 'ppv-bub' },
        { id: 'blhdr', label: 'Bloopy headers at the top of AI sections', key: 'ppvBlHeaders', def: 0, box: 'ppv-hdr' },
        { id: 'assist', label: 'Bloopy assistant button', box: 'ppv-chat-on', def: 0, get: () => h.mas.chat.isOn() },
        { id: 'mini', label: 'Smarter understanding (MiniLM)', box: 'ppv-mini-on', def: 0, get: () => h.mas.voice.get('ppvMini') },
        { id: 'speak', label: 'Bloopy speaks (Kokoro)', box: 'ppv-voice-on', def: 0, get: () => h.mas.voice.get('ppvVoice') },
        { id: 'mic', label: 'Talk to Bloopy (Moonshine)', box: 'ppv-mic-on', def: 0, get: () => h.mas.voice.get('ppvMic') },
        { id: 'wake', label: 'Wake word', box: 'ppv-wake-on', def: 0, get: () => h.mas.voice.get('ppvWake') }
      ];
      const isOn = f => { if (f.get) return !!f.get(); const v = ls(f.key); return v == null ? f.def === 1 : v === '1'; };
      const show = (el, on) => { if (el) el.style.display = on ? '' : 'none'; };
      const F = id => FEATS.find(f => f.id === id), on = id => isOn(F(id));
      function applyShow() {
        show(libHost, on('tagmenu')); show(savedHost, on('savedmenu')); show(whHost, on('lyrics'));
        const hr = whHost.previousElementSibling; if (hr && hr.tagName === 'HR') hr.style.display = on('lyrics') ? '' : 'none';   // the divider the captions menu got
        const sf = $('#ppv-sf'), vo = sf && sf.querySelector('option[value="video"]'), vid = on('savedvid');
        if (vo) { vo.hidden = !vid; vo.disabled = !vid; if (!vid && sf.value === 'video') sf.value = 'all'; }
        try { renderSaved(); } catch (e) {}
      }
      const setF = (f, v) => {
        if (f.key) ls(f.key, v ? '1' : '0');
        const b = f.box && $('#' + f.box); if (b && b.checked !== v) { b.checked = v; b.dispatchEvent(new Event('change', { bubbles: true })); }   // runs that checkbox's own handler too
        if (f.ui) applyShow();
      };
      const box = document.createElement('div'); box.className = 'ppv-scope'; box.id = 'ppv-smartset';
      box.innerHTML = '<details open><summary>Smart features</summary>' +
        '<label class="ppv-c" style="display:block"><input type="checkbox" id="ppv-fs-all"> <b>All smart features</b></label>' +
        '<div class="ppv-note">Off hides the smart menus and stops the automatic playlists and background work. Tags, playlists and listening history are kept. Turning it back on restores everything.</div>' +
        FEATS.map(f => (f.g ? '<div style="margin-top:8px"><b>' + f.g + '</b></div>' : '') + '<label class="ppv-c" style="display:block"><input type="checkbox" id="ppv-fs-' + f.id + '"> ' + f.label + '</label>').join('') + '</details>';
      const syncBoxes = () => { FEATS.forEach(f => { const el = box.querySelector('#ppv-fs-' + f.id); if (el) el.checked = isOn(f); }); box.querySelector('#ppv-fs-all').checked = FEATS.some(isOn); };
      FEATS.forEach(f => { box.querySelector('#ppv-fs-' + f.id).onchange = e => { setF(f, e.target.checked); syncBoxes(); }; });
      box.querySelector('#ppv-fs-all').onchange = e => {
        if (!e.target.checked) { const snap = {}; FEATS.forEach(f => { snap[f.id] = isOn(f); }); if (Object.values(snap).some(Boolean)) ls('ppvSmartSnap', JSON.stringify(snap)); FEATS.forEach(f => setF(f, false)); }
        else { let snap = null; try { snap = JSON.parse(ls('ppvSmartSnap')); } catch (er) {} if (snap && !Object.values(snap).some(Boolean)) snap = null; FEATS.forEach(f => setF(f, snap ? !!snap[f.id] : f.def === 1)); }
        syncBoxes();
      };
      // keep these in step when the same switch is changed in its own panel
      document.addEventListener('change', e => { if (e.target && /^ppv-(live|lmix|surp|bg|aeq|askip|mas|bub|hdr|chat-on|mini-on|voice-on|mic-on|wake-on)$/.test(e.target.id)) syncBoxes(); });
      (document.getElementById('sidebar-pane-settings') || p).appendChild(box);
      if (sb) sb.addEventListener('click', () => setTimeout(applyShow, 0));
      if (eb) eb.addEventListener('click', () => setTimeout(applyShow, 0));
      syncBoxes(); applyShow(); lyStart(() => on('lyfetch'));
    }
  }

  // ---------- UI ----------
  // ---------- Bloopy, the little ball mascot ----------
  // Lives in the Stem separator panel (all the AI features). Reacts to the panel's own status messages, so every
  // feature (splitting, tagging, playlists, Whisper) gets it for free. Pops up as a small floating bubble when a
  // task finishes while the panel is closed. Can be switched off with the "Show Bloopy" checkbox.
  function mascot(panel) {
    let uid = 0, mood = 'idle', key = '', tmr = null, ftmr = null, greeted = false;
    const lsGet = k => { try { return localStorage.getItem(k); } catch (e) { return null; } };
    const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch (e) {} };
    let on = lsGet('ppvMascot') !== '0';
    const bubblesOn = () => lsGet('ppvBlBubbles') === '1';             // speech bubbles that pop up over the app (off by default)
    const pick = a => a[Math.floor(Math.random() * a.length)];
    const css = document.createElement('style');
    css.textContent = `
      .ppv-ball{width:44px;height:44px;flex:none;cursor:pointer;-webkit-tap-highlight-color:transparent;user-select:none}
      .ppv-ball svg{width:100%;height:100%;overflow:visible;display:block}
      .ppv-ball .body{transform-box:fill-box;transform-origin:50% 100%}
      .ppv-ball .eyes{transform-box:fill-box;transform-origin:center}
      .ppv-ball .spark{transform-box:fill-box;transform-origin:center}
      .ppv-ball .sh{fill:#000;opacity:.25}
      .ppv-ball .bd{fill:var(--accent,#7c5cff)}
      .ppv-ball .eye{fill:#fff}.ppv-ball .pu{fill:#1a1a22}
      .ppv-ball .m{fill:none;stroke:var(--bl-ink,#1a1a22);stroke-width:2.4;stroke-linecap:round;display:none}
      .ppv-ball .m.open{fill:var(--bl-ink,#1a1a22);stroke:none}
      .ppv-ball .xe{display:none;fill:none;stroke:var(--bl-eink,var(--bl-ink,#1a1a22));stroke-width:2.4;stroke-linecap:round}
      .ppv-ball .spark{display:none}.ppv-ball .spark path{fill:#ffd95a}
      .ppv-ball .fs{fill:none;stroke:var(--bl-ink,#1a1a22);stroke-width:2.4;stroke-linecap:round}.ppv-ball .fs[data-fe]{stroke:var(--bl-eink,var(--bl-ink,#1a1a22))}.ppv-ball .fm{fill:var(--bl-ink,#1a1a22)}.ppv-ball .sw{fill:#9fd8ff;opacity:.9}.ppv-ball .zz{font:700 9px system-ui,sans-serif;fill:#e9e4ff}
      .ppv-ball[data-face=talk] [data-fm=open]{animation:blMouth .28s ease-in-out infinite alternate;transform-box:fill-box;transform-origin:center}.ppv-ball[data-face=sleep] .zz{animation:blZ 2.4s ease-in-out infinite}
      @keyframes blMouth{from{transform:scaleY(.35)}to{transform:scaleY(1.25)}}@keyframes blZ{0%,100%{opacity:.2;transform:translateY(0)}50%{opacity:1;transform:translateY(-3px)}}
      .m-idle .m.smile,.m-greet .m.smile,.m-start .m.open,.m-work .m.flat,.m-done .m.open,.m-err .m.wavy{display:block}
      .m-err .eyes{display:none}.m-err .xe{display:block}
      .m-done .spark{display:block;animation:ppvTw .6s ease-in-out infinite alternate}
      .m-idle .body{animation:ppvBob 2.6s ease-in-out infinite}
      .m-idle .eyes{animation:ppvBlink 4.5s infinite}
      .m-greet .body{animation:ppvHop .55s ease-out 3}
      .m-start .body{animation:ppvHop .4s ease-out 1}
      .m-work .body{animation:ppvWob .7s ease-in-out infinite}
      .m-work .pu{animation:ppvLook 1.6s ease-in-out infinite}
      .m-done .body{animation:ppvHop .5s ease-out 4}
      .m-err .body{animation:ppvShake .5s ease-in-out 2}
      @keyframes ppvBob{0%,100%{transform:translateY(0) scale(1,1)}50%{transform:translateY(-2px) scale(1.03,.97)}}
      @keyframes ppvBlink{0%,92%,100%{transform:scaleY(1)}95%{transform:scaleY(.1)}}
      @keyframes ppvHop{0%{transform:translateY(0) scale(1.1,.88)}40%{transform:translateY(-12px) scale(.94,1.08)}70%{transform:translateY(0) scale(1.08,.92)}100%{transform:translateY(0) scale(1,1)}}
      @keyframes ppvWob{0%,100%{transform:rotate(-8deg)}50%{transform:rotate(8deg)}}
      @keyframes ppvLook{0%,100%{transform:translateX(-1.6px)}50%{transform:translateX(1.6px)}}
      @keyframes ppvShake{0%,100%{transform:translateX(0)}25%{transform:translateX(-3px) rotate(-4deg)}75%{transform:translateX(3px) rotate(4deg)}}
      @keyframes ppvTw{from{opacity:.4;transform:scale(.8)}to{opacity:1;transform:scale(1.1)}}
      @keyframes ppvIn{from{opacity:0;transform:translateY(10px)}}
      .ppv-ball .arm{fill:none;stroke-width:4.4;stroke-linecap:round}
      .ppv-ball .gear{transform-box:view-box;transform-origin:32px 58px}
      .m-idle .gear{animation:ppvBob 2.6s ease-in-out infinite}
      .m-greet .gear{animation:ppvHop .55s ease-out 3}
      .m-start .gear{animation:ppvHop .4s ease-out 1}
      .m-work .gear{animation:ppvWob .7s ease-in-out infinite}
      .m-done .gear{animation:ppvHop .5s ease-out 4}
      .m-err .gear{animation:ppvShake .5s ease-in-out 2}
      .ppv-ball.bl-eq .gear{animation:ppvHop .5s ease-out 1}
      .ppv-ball .pu{transition:translate .25s}
      .ppv-ball[data-props=phone] .pu{translate:1.6px 1.2px}
      .ppv-ball[data-props=glass] .pu{translate:1.2px 0}
      .ppv-ball[data-props=pencil] .pu{translate:.6px 1.8px}
      .ppv-ball[data-props=scissors] .pu{translate:-1.4px 1.2px}
      .ppv-ball[data-props=timer] .pu{translate:1.6px 1px}
      .ppv-ball[data-props=note] .pu{translate:1.4px -1.4px}
      .ppv-ball[data-props="wand,wizard"] .pu,.ppv-ball[data-props=wand] .pu{translate:1.4px -1px}
      .ppv-ball .blq,.ppv-ball .swh,.ppv-ball .scA,.ppv-ball .scB,.ppv-ball .blstar{transform-box:fill-box;transform-origin:50% 50%}
      .ppv-ball .blq{transform-origin:50% 100%;animation:blEq .7s ease-in-out infinite alternate}
      .ppv-ball .blq:nth-child(2){animation-delay:-.2s}.ppv-ball .blq:nth-child(3){animation-delay:-.4s}.ppv-ball .blq:nth-child(4){animation-delay:-.1s}
      .ppv-ball .swh{animation:blSw 6s linear infinite}
      .ppv-ball .scA{animation:blSnA 1s ease-in-out infinite alternate}.ppv-ball .scB{animation:blSnB 1s ease-in-out infinite alternate}
      .ppv-ball .blstar{animation:blStar .9s ease-in-out infinite alternate}
      @keyframes blEq{from{transform:scaleY(.35)}to{transform:scaleY(1)}}@keyframes blSw{to{transform:rotate(360deg)}}
      @keyframes blSnA{from{transform:rotate(-3deg)}to{transform:rotate(-13deg)}}@keyframes blSnB{from{transform:rotate(3deg)}to{transform:rotate(13deg)}}
      @keyframes blStar{from{transform:scale(.85) rotate(-8deg)}to{transform:scale(1.12) rotate(8deg)}}
      @media (prefers-reduced-motion:reduce){.ppv-ball *{animation:none!important}}
      #ppv-mrow{display:flex;align-items:center;gap:10px;position:sticky;top:-12px;z-index:3;background:#1b1c20;margin:4px -12px 0;padding:6px 12px}
      .ppv-bub{position:relative;flex:1;background:#2a2b31;color:#eee;border-radius:12px;padding:7px 10px;font:12.5px/1.35 system-ui,sans-serif;min-height:18px}
      #ppv-mrow .ppv-bub:before{content:"";position:absolute;left:-5px;top:50%;margin-top:-5px;border:5px solid transparent;border-left:0;border-right-color:#2a2b31}
      #ppv-mfloat{position:fixed;right:12px;bottom:calc(96px + env(safe-area-inset-bottom,0px));z-index:99999;display:none;align-items:center;gap:8px;max-width:min(300px,calc(100vw - 24px));animation:ppvIn .25s ease-out;cursor:pointer}
      #ppv-mfloat .ppv-bub{box-shadow:0 4px 16px #0008}`;
    document.head.appendChild(css);

    const star = (x, y, sc) => `<path transform="translate(${x} ${y}) scale(${sc})" d="M0-5L1.4-1.4 5 0 1.4 1.4 0 5-1.4 1.4-5 0-1.4-1.4z"/>`;
    // ---------- Bloopy's gear: shaded items, worn or held with hands, drawn in front of him (never behind). Same art feeds the menu icons. ----------
    const BL_DEFS = g => `<linearGradient id="${g}mt" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#f6f8fc"/><stop offset=".45" stop-color="#aeb5c2"/><stop offset=".55" stop-color="#6f7684"/><stop offset="1" stop-color="#cfd5de"/></linearGradient><linearGradient id="${g}dk" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#555770"/><stop offset="1" stop-color="#15161d"/></linearGradient><linearGradient id="${g}gd" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff3b0"/><stop offset=".45" stop-color="#f4c430"/><stop offset="1" stop-color="#a9780a"/></linearGradient><linearGradient id="${g}gl" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#e4f3ff" stop-opacity=".7"/><stop offset="1" stop-color="#7fb2e6" stop-opacity=".28"/></linearGradient><linearGradient id="${g}pu" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#7a58d6"/><stop offset="1" stop-color="#2c1a5e"/></linearGradient><linearGradient id="${g}pk" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffa6d2"/><stop offset="1" stop-color="#df3d8c"/></linearGradient><linearGradient id="${g}sc" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#78e6ff"/><stop offset="1" stop-color="#2a63ee"/></linearGradient><linearGradient id="${g}pp" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff"/><stop offset="1" stop-color="#dfe2ec"/></linearGradient><linearGradient id="${g}wd" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#b98355"/><stop offset=".5" stop-color="#7a4a27"/><stop offset="1" stop-color="#3f2411"/></linearGradient><linearGradient id="${g}ye" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#ffe98a"/><stop offset=".5" stop-color="#f5c21c"/><stop offset="1" stop-color="#cf9004"/></linearGradient><linearGradient id="${g}or" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffa45c"/><stop offset="1" stop-color="#d9501a"/></linearGradient><radialGradient id="${g}gw"><stop offset="0" stop-color="#fff2a6" stop-opacity=".9"/><stop offset="1" stop-color="#ffd95a" stop-opacity="0"/></radialGradient><radialGradient id="${g}rb" cx=".35" cy=".3" r=".8"><stop offset="0" stop-color="#ff9aa6"/><stop offset="1" stop-color="#b3122f"/></radialGradient><radialGradient id="${g}bl" cx=".35" cy=".3" r=".8"><stop offset="0" stop-color="#9fd0ff"/><stop offset="1" stop-color="#1f56c4"/></radialGradient><radialGradient id="${g}pl" cx=".35" cy=".3" r=".8"><stop offset="0" stop-color="#fff"/><stop offset="1" stop-color="#b9bfcc"/></radialGradient><linearGradient id="${g}ss" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ff5f9e"/><stop offset=".55" stop-color="#ff8a6a"/><stop offset="1" stop-color="#ffc15c"/></linearGradient><clipPath id="${g}bc"><circle cx="32" cy="34" r="24"/></clipPath>`;
    const blHand = (g, x, y, r) => `<circle class="hd" cx="${x}" cy="${y}" r="${r}" stroke="rgba(0,0,0,.35)" stroke-width=".8"/><circle cx="${x}" cy="${y}" r="${r}" fill="url(#${g})"/>`;
    const blArm = d => `<path class="arm" d="${d}"/>`;
    const BL_TICKS = (() => { let a = '', b = ''; for (let i = 0; i < 12; i++) { const t = i * Math.PI / 6, c = i % 3 === 0, r1 = c ? 5 : 5.7, s = `M${(Math.sin(t) * r1).toFixed(2)} ${(-Math.cos(t) * r1).toFixed(2)}L${(Math.sin(t) * 6.5).toFixed(2)} ${(-Math.cos(t) * 6.5).toFixed(2)}`; if (c) a += s; else b += s; } return `<path d="${b}" stroke="#2a2c36" stroke-width=".5"/><path d="${a}" stroke="#2a2c36" stroke-width="1" stroke-linecap="round"/>`; })();
    // each entry: vb = menu icon view box, place = where the item sits on Bloopy, item = the object alone, back = arms and extras behind the item, front = hands over it
    const BL_ART = {
      headphones: { vb: '0 4 64 48', place: '', back: () => '', front: () => '', item: g => {
        const cup = `<rect x="2" y="30" width="10" height="20" rx="5" fill="url(#${g}dk)"/><rect x="3.6" y="32.4" width="6.8" height="15.2" rx="3.4" fill="none" stroke="#fff" stroke-opacity=".2" stroke-width=".9"/><ellipse cx="6.4" cy="40" rx="1.9" ry="2.8" style="fill:var(--accent,#7c5cff)"/><rect x="10.4" y="32" width="3.4" height="16" rx="1.7" fill="#262733"/><path d="M4.2 34.5Q3.6 40 4.2 45.5" stroke="#fff" stroke-opacity=".35" stroke-width="1" fill="none" stroke-linecap="round"/>`;
        return `${cup}<g transform="translate(64 0) scale(-1 1)">${cup}</g>`; },
        rear: g => `<path d="M6 40A26 33 0 0 1 58 40" fill="none" stroke="url(#${g}dk)" stroke-width="4.6" stroke-linecap="round"/><path d="M6 40A26 33 0 0 1 58 40" pathLength="100" stroke-dasharray="22 200" stroke-dashoffset="-14" fill="none" stroke="#fff" stroke-opacity=".32" stroke-width="1.2" stroke-linecap="round"/>` },
      glasses: { vb: '7 21 50 21', place: '', back: () => '', front: () => '', item: g => `<path d="M17 28.5L9.6 26.6M47 28.5L54.4 26.6" stroke="#1c1d26" stroke-width="1.8" stroke-linecap="round"/><rect x="17" y="24.5" width="14" height="14" rx="5" fill="url(#${g}gl)" stroke="#1c1d26" stroke-width="2"/><rect x="33" y="24.5" width="14" height="14" rx="5" fill="url(#${g}gl)" stroke="#1c1d26" stroke-width="2"/><path d="M31 29Q32 27.4 33 29" fill="none" stroke="#1c1d26" stroke-width="1.8" stroke-linecap="round"/><path d="M19.4 29.6L22.6 26.4M20.4 32.6L25.2 27.8M35.4 29.6L38.6 26.4M36.4 32.6L41.2 27.8" stroke="#fff" stroke-opacity=".75" stroke-width="1.1" stroke-linecap="round"/>` },
      phone: { vb: '-9 -13 18 26', place: 'translate(49 48) rotate(14)', back: () => blArm('M40 55Q45 58 52 54'), front: g => blHand(g, 52.2, 53.2, 4.2) + blHand(g, 43.4, 52.4, 2.4),
        item: g => `<rect x="-7" y="-11" width="14" height="22" rx="3.2" fill="url(#${g}dk)" stroke="#0b0c10" stroke-width=".6"/><rect x="-5.8" y="-9.8" width="11.6" height="19.6" rx="2.3" fill="url(#${g}sc)"/><rect x="-1.9" y="-9.3" width="3.8" height="1.3" rx=".65" fill="#0b0c10"/><g fill="#fff" opacity=".92"><rect class="blq" x="-3.8" y="-2.5" width="1.5" height="3.5" rx=".6"/><rect class="blq" x="-1.7" y="-4.6" width="1.5" height="5.6" rx=".6"/><rect class="blq" x="0.4" y="-3.2" width="1.5" height="4.2" rx=".6"/><rect class="blq" x="2.5" y="-5.4" width="1.5" height="6.4" rx=".6"/></g><rect x="-4.2" y="4.4" width="8.4" height="1" rx=".5" fill="#fff" opacity=".35"/><rect x="-4.2" y="4.4" width="4.2" height="1" rx=".5" fill="#fff" opacity=".95"/><path d="M-5.8 -9.8H1.5L-5.8 2.6Z" fill="#fff" opacity=".14"/><rect x="7" y="-5" width=".9" height="4" rx=".4" fill="#8b90a0"/>` },
      glass: { vb: '-12 -12 24 41', place: 'translate(41 30) rotate(-40)', back: () => blArm('M44 50Q49 49 52.6 43.8'), front: g => blHand(g, 52.6, 43.8, 4.3),
        item: g => `<rect x="-2" y="12" width="4" height="15" rx="2" fill="url(#${g}wd)"/><path d="M-2 16H2M-2 19H2M-2 22H2" stroke="#2a1608" stroke-opacity=".45" stroke-width=".5"/><rect x="-2.2" y="25" width="4.4" height="2.4" rx="1.1" fill="url(#${g}mt)"/><rect x="-1.9" y="8.4" width="3.8" height="4.2" rx="1" fill="url(#${g}mt)"/><circle r="9" fill="url(#${g}gl)"/><circle r="9" fill="none" stroke="url(#${g}mt)" stroke-width="2.4"/><circle r="7.7" fill="none" stroke="#2a2c36" stroke-opacity=".5" stroke-width=".6"/><path d="M-5.5 -3.5A6.5 6.5 0 0 1 -1.5 -6.2" stroke="#fff" stroke-width="1.6" stroke-linecap="round" fill="none" opacity=".9"/><circle cx="3.6" cy="4.6" r=".8" fill="#fff" opacity=".6"/>` },
      pencil: { vb: '-5 -26 10 28', place: 'translate(40.5 57.5) rotate(35)',
        back: () => blArm('M26 52Q22 55 23.5 59') + `<g transform="rotate(-6 36 57)"><rect x="24" y="50" width="22" height="14" rx="1.5" fill="#000" opacity=".18" transform="translate(.8 1)"/><rect x="24" y="50" width="22" height="14" rx="1.5" fill="url(#GG)" stroke="#c3c7d6" stroke-width=".6"/><path d="M26 54.5H44M26 57.5H44M26 60.5H44" stroke="#aeb8d8" stroke-width=".5"/><path d="M26.4 50.4V63.6" stroke="#e58a8a" stroke-width=".5"/><g fill="#3b3d4a"><circle cx="28" cy="50" r=".9"/><circle cx="32" cy="50" r=".9"/><circle cx="36" cy="50" r=".9"/><circle cx="40" cy="50" r=".9"/><circle cx="44" cy="50" r=".9"/></g><path d="M28 57.5q1.2-2 2.4 0t2.4 0 2.4 0 2.4 0 2.4 0" fill="none" stroke="#3a3a48" stroke-width=".7" stroke-linecap="round"/></g>`,
        front: g => blHand(g, 45.7, 50.1, 4.2) + blHand(g, 23.5, 59, 4.2),
        item: g => `<rect x="-2.4" y="-24" width="4.8" height="3.6" rx="1.4" fill="#f08aa8"/><rect x="-2.7" y="-21" width="5.4" height="3.2" fill="url(#${g}mt)"/><path d="M-2.7 -19.9H2.7M-2.7 -18.9H2.7" stroke="#59606e" stroke-width=".4"/><rect x="-2.7" y="-17.8" width="5.4" height="13.2" fill="url(#${g}ye)"/><path d="M0 -17.8V-4.6" stroke="#b97d00" stroke-width=".5" opacity=".6"/><path d="M-2.7 -4.6L0 0L2.7 -4.6Z" fill="#f1cf9a"/><path d="M-1 -1.8L0 0L1 -1.8Z" fill="#2a2a32"/>` },
      note: { vb: '-2 -3 22 28', place: 'translate(52 2)', back: () => blArm('M50 40Q58 33 58.6 17'), front: g => blHand(g, 58.4, 14, 4.2),
        item: g => `<rect x="5.6" y="2" width="1.6" height="17" rx=".7" fill="#1d1e26"/><rect x="14.6" y="0" width="1.6" height="17" rx=".7" fill="#1d1e26"/><path d="M5.6 1.5L16.2 -.5V3.5L5.6 5.5Z" fill="url(#${g}gd)" stroke="#8a6208" stroke-width=".4"/><ellipse cx="3" cy="19" rx="3.9" ry="3" transform="rotate(-22 3 19)" fill="url(#${g}gd)" stroke="#8a6208" stroke-width=".4"/><ellipse cx="12" cy="17" rx="3.9" ry="3" transform="rotate(-22 12 17)" fill="url(#${g}gd)" stroke="#8a6208" stroke-width=".4"/><ellipse cx="2.2" cy="18.2" rx="1.4" ry=".8" transform="rotate(-22 2.2 18.2)" fill="#fff" opacity=".6"/><ellipse cx="11.2" cy="16.2" rx="1.4" ry=".8" transform="rotate(-22 11.2 16.2)" fill="#fff" opacity=".6"/>` },
      timer: { vb: '-11 -15 22 25', place: 'translate(50 46)', back: () => blArm('M42 57Q48 58 54.5 55'), front: g => blHand(g, 54.5, 54.5, 4.2),
        item: g => `<rect x="-1.8" y="-14.2" width="3.6" height="3.2" rx="1" fill="url(#${g}mt)"/><rect x="-1" y="-11.4" width="2" height="2.6" fill="#8d94a1"/><g transform="rotate(42)"><rect x="-1.4" y="-12.8" width="2.8" height="2.8" rx=".8" fill="url(#${g}mt)"/></g><circle r="9.4" fill="url(#${g}mt)" stroke="#59606e" stroke-width=".5"/><circle r="7.7" fill="#2a2c36"/><circle r="7.1" fill="url(#${g}pp)"/>${BL_TICKS}<g class="swh"><circle r="5" fill="none"/><path d="M0 1.4V-5" stroke="#e5383b" stroke-width=".9" stroke-linecap="round"/></g><circle r="1.1" fill="#2a2c36"/><path d="M-5.2 -2.8A6 6 0 0 1 -1.8 -5.8" stroke="#fff" stroke-width=".9" stroke-linecap="round" fill="none" opacity=".8"/>` },
      scissors: { vb: '-10 -28 20 50', place: 'translate(11 42) rotate(-28)', back: () => blArm('M26 52Q21 55 18 56.5'), front: g => blHand(g, 17.8, 56.5, 4.4),
        item: g => { const half = (cls, rot, flip) => `<g class="${cls}" transform="rotate(${rot})"><circle r="26" fill="none"/><g transform="scale(${flip} 1)"><path d="M-2.2 2.5L-1.7 -21L1.3 -26.5L1.9 -1Z" fill="url(#${g}mt)" stroke="#6b7280" stroke-width=".4"/><path d="M1.2 -24L1 -1" stroke="#fff" stroke-opacity=".7" stroke-width=".5"/><path d="M-2 2L-3.2 9" stroke="#7b8291" stroke-width="2.6" stroke-linecap="round"/><ellipse cx="-4.6" cy="14.5" rx="3.6" ry="5.4" transform="rotate(10 -4.6 14.5)" fill="none" stroke="url(#${g}or)" stroke-width="2.6"/></g></g>`;
          return half('scA', -9, 1) + half('scB', 9, -1) + `<circle r="2" fill="url(#${g}mt)" stroke="#59606e" stroke-width=".5"/><circle r=".6" fill="#2a2c36"/>`; } },
      wand: { vb: '-8 -36 16 40', place: 'translate(48 50) rotate(35)', back: () => blArm('M47 50Q50 47 52.6 43.4'), front: g => blHand(g, 52.6, 43.4, 4.2),
        item: g => `<rect x="-1.6" y="-20" width="3.2" height="20" rx="1.3" fill="url(#${g}dk)"/><path d="M-.6 -19V-1" stroke="#fff" stroke-opacity=".3" stroke-width=".6"/><rect x="-2" y="-4.4" width="4" height="4.4" rx="1.3" fill="url(#${g}gd)"/><rect x="-2" y="-22.4" width="4" height="3.6" rx="1.3" fill="url(#${g}gd)"/><circle cy="-27" r="8" fill="url(#${g}gw)"/><g transform="translate(0 -27)"><g class="blstar"><path d="M0 -5.2L1.29 -1.78L4.95 -1.61L2.09 .68L3.06 4.21L0 2.2L-3.06 4.21L-2.09 .68L-4.95 -1.61L-1.29 -1.78Z" fill="url(#${g}gd)" stroke="#a9780a" stroke-width=".5" stroke-linejoin="round"/></g></g><path d="M6 -33L6.6 -31.4L8.2 -30.8L6.6 -30.2L6 -28.6L5.4 -30.2L3.8 -30.8L5.4 -31.4Z" fill="#fff"/>` },
      wizard: { vb: '10 -20 44 44', place: '', back: () => '', front: () => '',
        item: g => `<ellipse cx="32" cy="18" rx="19" ry="3.6" fill="#000" opacity=".22"/><path d="M9 14.6A23 5.2 0 0 0 55 14.6Z" fill="url(#${g}pu)"/><path d="M9 14.6A23 5.2 0 0 0 55 14.6" fill="none" stroke="#1a1030" stroke-width=".8"/><path d="M17 14C21 7 27 -2 30 -9C32 -14 36 -17 42 -16C38 -13 38 -9 39 -5C40.5 1 44 8 47 14Z" fill="url(#${g}pu)" stroke="#1a1030" stroke-width=".8" stroke-linejoin="round"/><path d="M22 10C26 3 30 -4 33 -10" fill="none" stroke="#fff" stroke-opacity=".18" stroke-width="2" stroke-linecap="round"/><path d="M17.2 11.6Q32 17.8 46.8 11.6L47 14.8Q32 21 17 14.8Z" fill="#1a1030"/><rect x="29.2" y="13.2" width="5.6" height="4.4" rx="1" fill="none" stroke="url(#${g}gd)" stroke-width="1.3"/><path d="M31 -4L31.9 -1.9L34 -1L31.9 -.1L31 2L30.1 -.1L28 -1L30.1 -1.9Z" fill="url(#${g}gd)"/><path d="M37 4.4L37.6 5.6L38.8 6.2L37.6 6.8L37 8L36.4 6.8L35.2 6.2L36.4 5.6Z" fill="url(#${g}gd)"/>`,
        rear: g => `<ellipse cx="32" cy="14.6" rx="23" ry="5.2" fill="url(#${g}pu)" stroke="#1a1030" stroke-width=".8"/>` },
      party: { vb: '14 -18 36 42', place: '', back: () => '', front: () => '',
        item: g => `<ellipse cx="32" cy="17.4" rx="13" ry="2.4" fill="#000" opacity=".2"/><g transform="rotate(9 32 14)"><clipPath id="${g}pc"><path d="M20 15L32 -13L44 15Q32 19 20 15Z"/></clipPath><path d="M20 15L32 -13L44 15Q32 19 20 15Z" fill="url(#${g}pk)" stroke="#8a1f55" stroke-width=".8" stroke-linejoin="round"/><g clip-path="url(#${g}pc)"><path d="M12 6L52 -6M12 13L52 1M12 20L52 8" stroke="#ffd95a" stroke-width="2.6" opacity=".95"/><circle cx="28" cy="2" r="1" fill="#fff"/><circle cx="36" cy="8" r="1.1" fill="#fff"/><circle cx="31" cy="12" r="1" fill="#fff"/><circle cx="35" cy="-4" r=".9" fill="#fff"/></g><path d="M31 -12L28 14" stroke="#fff" stroke-opacity=".25" stroke-width="2"/><path d="M20 15Q32 19 44 15" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round" stroke-dasharray="1.6 2.2"/><circle cx="32" cy="-13" r="3.8" fill="url(#${g}gd)"/></g>` },
      crown: { vb: '12 -9 40 30', place: '', back: () => '', front: () => '',
        item: g => `<ellipse cx="32" cy="17.6" rx="15.5" ry="2.7" fill="#000" opacity=".2"/><g transform="rotate(-4 32 12)"><path d="M17 15L18 2L21.5 9L25 -1.5L28.5 9L32 -5L35.5 9L39 -1.5L42.5 9L46 2L47 15Q32 19.5 17 15Z" fill="url(#${g}gd)" stroke="#8a6208" stroke-width=".9" stroke-linejoin="round"/><path d="M17 11.4Q32 16 47 11.4L47 15Q32 19.5 17 15Z" fill="#c98f0e" opacity=".75"/><path d="M20.5 12.4L19.4 4.5" stroke="#fff" stroke-opacity=".55" stroke-width="1.1" stroke-linecap="round"/><circle cx="32" cy="14.4" r="2.1" fill="url(#${g}rb)" stroke="#7a0f20" stroke-width=".4"/><circle cx="24" cy="13.4" r="1.4" fill="url(#${g}bl)"/><circle cx="40" cy="13.4" r="1.4" fill="url(#${g}bl)"/><circle cx="18" cy="2" r="1.5" fill="url(#${g}pl)"/><circle cx="25" cy="-1.5" r="1.5" fill="url(#${g}pl)"/><circle cx="32" cy="-5" r="1.7" fill="url(#${g}pl)"/><circle cx="39" cy="-1.5" r="1.5" fill="url(#${g}pl)"/><circle cx="46" cy="2" r="1.5" fill="url(#${g}pl)"/></g>`,
        rear: g => `<g transform="rotate(-4 32 12)"><path d="M18 12L21.5 0L25 9L28.5 -3L32 8L35.5 -3L39 9L42.5 0L46 12Z" fill="#b8860b" stroke="#8a6208" stroke-width=".8" stroke-linejoin="round"/><path d="M23 9L21.5 2M37 9L35.5 -1" stroke="#fff" stroke-opacity=".25" stroke-width="1" stroke-linecap="round"/></g>` }
    };
    // the worn / held versions on Bloopy: arms and extras first, then the item in place, then the hands on top
    const BL_GEAR = g => ['headphones', 'glasses', 'phone', 'glass', 'pencil', 'note', 'timer', 'scissors', 'wand', 'wizard', 'party', 'crown'].map(k => { const a = BL_ART[k];
      return `<g class="prop" data-p="${k}">${a.back(g).replace(/url\(#GG\)/g, 'url(#' + g + 'pp)')}${a.place ? `<g transform="${a.place}">${a.item(g)}</g>` : a.item(g)}${a.front(g)}</g>`; }).join('');
    // ---------- Bloopy skins: real things and plain reskins. A skin sets his colours, and can add parts behind him (ears, tail), on his body (patterns, clipped to the ball) and in front (nose, beak, stem). ----------
    const blPent = (cx, cy, r) => { let d = ''; for (let i = 0; i < 5; i++) { const a = (i * 72 - 90) * Math.PI / 180; d += (i ? 'L' : 'M') + (cx + r * Math.cos(a)).toFixed(1) + ' ' + (cy + r * Math.sin(a)).toFixed(1); } return d + 'Z'; };
    const blMirror = s => `<g transform="translate(64 0) scale(-1 1)">${s}</g>`;
    const BL_SKINS = {
      orange: { name: 'Orange', color: '#ff9a1f', say: 'Fresh squeezed. Please do not peel me.',
        body: () => `<g fill="#b85400" opacity=".24"><circle cx="16" cy="28" r=".8"/><circle cx="22" cy="48" r=".8"/><circle cx="46" cy="24" r=".8"/><circle cx="50" cy="42" r=".8"/><circle cx="36" cy="54" r=".8"/><circle cx="14" cy="42" r=".8"/><circle cx="27" cy="16" r=".8"/><circle cx="44" cy="52" r=".8"/><circle cx="53" cy="32" r=".8"/><circle cx="40" cy="14" r=".8"/><circle cx="10" cy="34" r=".8"/><circle cx="31" cy="50" r=".8"/></g><ellipse cx="22" cy="18" rx="7" ry="4" fill="#fff" opacity=".2" transform="rotate(-30 22 18)"/>`,
        front: () => `<path d="M32 11Q32 7 33 5" stroke="#6b4a1c" stroke-width="1.8" stroke-linecap="round" fill="none"/><path d="M33 8Q39 2 46 5Q41 12 33 8Z" fill="#3fae4a" stroke="#27782f" stroke-width=".6" stroke-linejoin="round"/><path d="M34 7.5Q39 5.5 44 5.3" stroke="#fff" stroke-opacity=".4" stroke-width=".6" fill="none"/>` },
      pumpkin: { name: 'Pumpkin', color: '#f08a1c', say: 'Spooky season, any time of year.',
        body: () => `<path d="M32 10Q23 34 32 58M21 12Q8 34 21 56M43 12Q56 34 43 56" fill="none" stroke="#a84f08" stroke-opacity=".45" stroke-width="1.6" stroke-linecap="round"/>`,
        front: () => `<path d="M29 12Q29 4 34 2L37 5Q34 7 35 12Z" fill="#6a8a2a" stroke="#4a6418" stroke-width=".7" stroke-linejoin="round"/><path d="M36 6Q42 3 43 8Q44 11 41 11" fill="none" stroke="#5aa03a" stroke-width="1.1" stroke-linecap="round"/>` },
      basketball: { name: 'Basketball', color: '#e87a2f', say: 'Please do not dribble me.',
        body: () => `<path d="M32 10V21M32 49V58M8 34H15M49 34H56M14 15Q20 34 14 53M50 15Q44 34 50 53" fill="none" stroke="#2a1608" stroke-opacity=".85" stroke-width="1.4" stroke-linecap="round"/><g fill="#7a3a0a" opacity=".16"><circle cx="20" cy="22" r=".7"/><circle cx="44" cy="22" r=".7"/><circle cx="18" cy="50" r=".7"/><circle cx="46" cy="50" r=".7"/><circle cx="32" cy="55" r=".7"/><circle cx="12" cy="42" r=".7"/><circle cx="52" cy="42" r=".7"/></g>` },
      soccer: { name: 'Soccer ball', color: '#f5f5f8', say: 'Please do not kick me.',
        body: () => `<path d="${blPent(32, 16, 6)}${blPent(14, 32, 6)}${blPent(50, 32, 6)}${blPent(20, 52, 6)}${blPent(44, 52, 6)}" fill="#23242e"/><path d="M27.5 20Q19 22 15 27M36.5 20Q45 22 49 27M12 38Q13 46 17 48M52 38Q51 46 47 48M26 54Q32 57 38 54" fill="none" stroke="#9a9dac" stroke-width=".9" stroke-linecap="round"/>` },
      earth: { name: 'Earth', color: '#2f7fd6', say: 'Hello, world.',
        rear: () => `<circle cx="32" cy="34" r="27.5" fill="#8fd0ff" opacity=".35"/>`,
        body: () => `<path d="M10 22Q16 14 26 16Q30 20 24 26Q20 32 14 30Q8 28 10 22Z" fill="#4dbb5f"/><path d="M38 14Q48 12 54 22Q52 30 46 28Q42 34 40 28Q34 22 38 14Z" fill="#4dbb5f"/><path d="M20 44Q28 40 34 46Q32 54 24 56Q16 52 20 44Z" fill="#4dbb5f"/><path d="M12 40Q18 38 22 41M40 46Q46 44 50 47M30 12Q36 10 42 12" fill="none" stroke="#fff" stroke-opacity=".55" stroke-width="1.6" stroke-linecap="round"/>` },
      cat: { name: 'Cat', color: '#f2a65a', say: 'Meow. That was not in my script.',
        rear: () => { const ear = `<path d="M10.5 26L11.5 1.5L29.5 11.5Z" fill="#f2a65a" stroke="#b86e2a" stroke-width=".9" stroke-linejoin="round"/><path d="M14.5 20L15 7L24 12.5Z" fill="#f5a9b8"/>`; return `<path d="M50 50Q66 52 62 32" fill="none" stroke="#b86e2a" stroke-width="7" stroke-linecap="round"/><path d="M50 50Q66 52 62 32" fill="none" stroke="#f2a65a" stroke-width="5" stroke-linecap="round"/>${ear}${blMirror(ear)}`; },
        body: () => `<ellipse cx="32" cy="44" rx="9" ry="6.5" fill="#fff4e6" opacity=".85"/><path d="M32 11V17M26 12.5L27.5 17.5M38 12.5L36.5 17.5" fill="none" stroke="#c9792f" stroke-width="1.5" stroke-linecap="round"/>`,
        front: () => { const w = `<path d="M20 41L6 38.5M20 44L5 45.5M21 46.5L8 52" fill="none" stroke="#5a3a1e" stroke-opacity=".8" stroke-width=".8" stroke-linecap="round"/>`; return `<path d="M29.8 37.2H34.2L32 39.8Z" fill="#e8758b" stroke="#b84a64" stroke-width=".4" stroke-linejoin="round"/>${w}${blMirror(w)}`; } },
      bunny: { name: 'Bunny', color: '#f7f1f8', say: 'Hop hop.',
        rear: () => { const ear = `<ellipse cx="22" cy="5" rx="5.6" ry="15" transform="rotate(-9 22 5)" fill="#f7f1f8" stroke="#c9bfd0" stroke-width=".8"/><ellipse cx="22" cy="6" rx="2.9" ry="11" transform="rotate(-9 22 6)" fill="#f6b3c6"/>`; return `<circle cx="55" cy="52" r="5.5" fill="#fff" stroke="#c9bfd0" stroke-width=".8"/>${ear}${blMirror(ear)}`; },
        body: () => `<circle cx="16.5" cy="40" r="3.6" fill="#ff9fb8" opacity=".5"/><circle cx="47.5" cy="40" r="3.6" fill="#ff9fb8" opacity=".5"/>`,
        front: () => `<ellipse cx="32" cy="38" rx="2.2" ry="1.6" fill="#f08aa8"/>` },
      panda: { name: 'Panda', color: '#f8f8fb', hand: '#23242e', eink: '#fff', say: 'Bamboo break.',
        rear: () => `<circle cx="14.5" cy="14.5" r="7.5" fill="#23242e"/><circle cx="49.5" cy="14.5" r="7.5" fill="#23242e"/>`,
        body: () => `<ellipse cx="23" cy="32" rx="7.5" ry="8.5" transform="rotate(25 23 32)" fill="#23242e"/><ellipse cx="41" cy="32" rx="7.5" ry="8.5" transform="rotate(-25 41 32)" fill="#23242e"/>`,
        front: () => `<ellipse cx="32" cy="38" rx="3" ry="2.2" fill="#23242e"/>` },
      penguin: { name: 'Penguin', color: '#2a2b36', hand: '#2a2b36', say: 'Waddle waddle.',
        body: () => `<ellipse cx="32" cy="39" rx="17.5" ry="18.5" fill="#f4f5fa"/>`,
        front: () => `<path d="M27.5 37Q32 34.6 36.5 37Q32 40.5 27.5 37Z" fill="#ff9f1c" stroke="#c46f00" stroke-width=".5" stroke-linejoin="round"/><ellipse cx="23" cy="59.5" rx="6.5" ry="2.8" fill="#ff9f1c" stroke="#c46f00" stroke-width=".6"/><ellipse cx="41" cy="59.5" rx="6.5" ry="2.8" fill="#ff9f1c" stroke="#c46f00" stroke-width=".6"/>` },
      mint: { name: 'Mint', color: '#4fd1a5', say: 'Cool and fresh.',
        body: () => `<ellipse cx="22" cy="18" rx="8" ry="4.5" fill="#fff" opacity=".22" transform="rotate(-30 22 18)"/>` },
      sunset: { name: 'Sunset', color: '#ff8a6a', say: 'Golden hour.',
        body: g => `<rect x="8" y="10" width="48" height="48" fill="url(#${g}ss)"/>` },
      midnight: { name: 'Midnight', color: '#242b63', ink: '#e9e4ff', say: 'Night mode, for the soul.',
        body: () => `<g fill="#fff"><circle cx="16" cy="22" r=".9"/><circle cx="24" cy="15" r=".7"/><circle cx="34" cy="13" r="1"/><circle cx="52" cy="34" r=".8"/><circle cx="14" cy="46" r=".8"/><circle cx="22" cy="54" r=".7"/><circle cx="42" cy="55" r=".9"/><circle cx="53" cy="46" r=".7"/><circle cx="40" cy="47" r=".6"/></g><circle cx="47" cy="19" r="5" fill="#ffe9a8"/><circle cx="49.2" cy="17.6" r="4.4" fill="#242b63"/>` },
      gold: { name: 'Gold', color: '#e9b92e', say: 'Shiny.',
        body: g => `<rect x="8" y="10" width="48" height="48" fill="url(#${g}gd)"/><path d="M12 24A22 22 0 0 1 26 13" stroke="#fff" stroke-opacity=".6" stroke-width="2" fill="none" stroke-linecap="round"/>` }
    };
    const BL_SKIN_KEYS = Object.keys(BL_SKINS);
    const blSkinOne = (k, part, g) => { const s = BL_SKINS[k]; return s && s[part] ? `<g class="sk" data-sk="${k}"${part === 'body' ? ` clip-path="url(#${g}bc)"` : ''}>${s[part](g)}</g>` : ''; };
    const blSkinPart = (part, g) => BL_SKIN_KEYS.map(k => blSkinOne(k, part, g)).join('');
    const blSkinCss = document.createElement('style');
    blSkinCss.textContent = '.sk{display:none}.ppv-ball .bd{fill:var(--bl-skin,var(--accent,#7c5cff))}.ppv-ball .hd{fill:var(--bl-hand,var(--bl-skin,var(--accent,#7c5cff)))}.ppv-ball .arm{stroke:var(--bl-hand,var(--bl-skin,var(--accent,#7c5cff)))}' +
      BL_SKIN_KEYS.map(k => { const s = BL_SKINS[k]; return `[data-skin=${k}]{--bl-skin:${s.color};${s.hand ? '--bl-hand:' + s.hand + ';' : ''}${s.ink ? '--bl-ink:' + s.ink + ';' : ''}${s.eink ? '--bl-eink:' + s.eink + ';' : ''}}[data-skin=${k}] .sk[data-sk=${k}]{display:inline}`; }).join('') +
      '.ppv-ball[data-skin=soccer] .eye,.ppv-ball[data-skin=bunny] .eye,.ppv-ball[data-skin=penguin] .eye,.ppv-ball[data-skin=basketball] .eye{stroke:#b4b8c6;stroke-width:.8}';
    document.head.appendChild(blSkinCss);
    // small drawn preview of a skin for the menu (no key = the default Bloopy)
    const blSkinIcon = k => { const s = BL_SKINS[k], g = 'ppvs' + (++blIcId), ink = (s && s.ink) || '#1a1a22';
      return `<svg class="bl-ic"${s ? ` data-skin="${k}"` : ''} viewBox="-8 -14 80 80" width="22" height="22" aria-hidden="true" style="vertical-align:-6px;margin-right:5px;overflow:visible"><defs>${BL_DEFS(g)}<radialGradient id="${g}" cx=".35" cy=".3" r=".8"><stop offset="0" stop-color="#fff" stop-opacity=".45"/><stop offset=".55" stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".35"/></radialGradient></defs>${s ? blSkinOne(k, 'rear', g) : ''}<circle cx="32" cy="34" r="24" style="fill:${s ? s.color : 'var(--accent,#7c5cff)'}"/>${s ? blSkinOne(k, 'body', g) : ''}<circle cx="32" cy="34" r="24" fill="url(#${g})"/><circle cx="24" cy="31" r="5.5" fill="#fff" stroke="#b4b8c6" stroke-width=".8"/><circle cx="40" cy="31" r="5.5" fill="#fff" stroke="#b4b8c6" stroke-width=".8"/><circle cx="25" cy="32" r="2.6" fill="#1a1a22"/><circle cx="41" cy="32" r="2.6" fill="#1a1a22"/><path d="M25 43q7 6 14 0" fill="none" stroke="${ink}" stroke-width="2.4" stroke-linecap="round"/>${s ? blSkinOne(k, 'front', g) : ''}</svg>`; };
    // ---------- Skin voices: each skin has its own lines for greetings, pokes, status, results and command replies. A skin line is used about two times in three; the normal lines fill the rest. ----------
    const BL_SKIN_SAY = {
      orange: { open: ["Hey there! It's me, Bloopy, fresh and juicy!", "Zest in time! Bloopy here. What are we listening to?"], ready: ["Squeezed and ready.", "Peeled and ready when you are."],
        tap: ["Careful, I am ripe!", "Hey, no squeezing!", "That was a citrus-y poke."], poke: ["Hey, watch the peel!", "Squeeze me and you get juice. Do you want juice?", "I am full of vitamin C and opinions.", "Okay, okay, I am pith-ed off. Just kidding!"],
        dizzy: ["I am so dizzy I might turn into juice!", "Stop shaking me, I will make a smoothie out of myself!"], idle: ["Just hanging on the tree.", "Soaking up some sun.", "Orange you glad I am here?"],
        click: ["Click! Zesty.", "Nice press. Very fresh.", "Squeeze, click, done."], start: ["Zest in time!", "Let's squeeze this out!"], busy: ["Still squeezing, almost there!", "Juicing the data, one sec!"],
        done: ["Fresh squeezed and done!", "Easy peasy, orange squeezy!", "All peeled and ready."], err: ["Oops, I got squashed.", "That one turned out sour."], dl: ["Downloading my vitamins..."],
        sep: ["Peeling the song apart, segment by segment.", "Separating the segments gently."], tag: ["Tasting the song for flavour notes...", "Checking if this one is sweet or sour."],
        wh: ["Writing every word, nice and juicy.", "Catching every word like a drop of juice."], gen: ["Working on it, still juicy.", "Rolling along, round and orange."], panel: ["Stems menu! A song is just segments, like me.", "Pick your segments, I mean stems."],
        t: { play: ["Juicy beats incoming."], skip: ["Next slice!"], volume: ["Turned up the zest."], shuffle: ["Shaken, not squeezed."], playlist: ["A whole basket of songs!"], tag: ["Tasted it. Notes of bass and sunshine."], split: ["Peeled apart, segment by segment."], lyrics: ["Every word, fresh squeezed."], sleep: ["Sleep tight, I will keep the vitamins."], eq: ["Sweet tuning."], missing: ["Not in this orchard."] } },
      pumpkin: { open: ["Boo! Just kidding, it's Bloopy. Ask me anything!", "Happy spooky season! Bloopy here. What are we playing?"], ready: ["Carved and ready.", "Candle is lit. Ready when you are."],
        tap: ["Boo!", "Careful, I have a candle inside!", "Do not carve me!"], poke: ["Hey! I am not a pie yet.", "Poking a pumpkin is bad luck. Probably.", "My seeds are rattling!", "Spooky, but I am a friendly one."],
        dizzy: ["My seeds are all shaken up!", "I am going to go full pumpkin spice!"], idle: ["Just sitting on the porch.", "Waiting for the sun to go down.", "Autumn leaves are my favourite."],
        click: ["Click! Spooky.", "Nice press. Very festive.", "A pumpkin approves."], start: ["Let us carve this one out!", "Spooky time!"], busy: ["Still carving, almost there!", "Scooping out the data, one sec!"],
        done: ["Ta-da, carved to perfection!", "All done. Time for pie!", "Spooktacular!"], err: ["Oops, I got smashed.", "That one went bad, like old gourds."], dl: ["Collecting seeds... I mean, downloading."],
        sep: ["Carving the song into pieces.", "Scooping the vocals out gently."], tag: ["Sniffing out the spooky vibes...", "Listening for ghosts in the track."],
        wh: ["Writing every word by candlelight.", "Whispering the lyrics, very spooky."], gen: ["Carving away.", "Rolling along, orange and round."], panel: ["Stems menu! Carving time.", "Pick which parts to carve out."],
        t: { play: ["Spooky tunes on!"], skip: ["Next, before the candle burns out."], volume: ["Louder, so the ghosts can hear."], shuffle: ["Shuffled like a haunted deck."], playlist: ["A whole patch of songs!"], tag: ["Vibes: spooky and sweet."], split: ["Carved it right down the middle."], lyrics: ["Written in candlelight."], sleep: ["Sleep tight, ghosts included."], eq: ["Bass like a creaky door. Perfect."], missing: ["Not in this pumpkin patch."] } },
      basketball: { open: ["Hey there! It's Bloopy, ready to hoop!", "Tip off! Bloopy here. What are we listening to?"], ready: ["Warmed up and ready.", "On the court and ready when you are."],
        tap: ["Do not dribble me!", "Boing! That was a bounce pass!", "Swish!"], poke: ["Hey! I am not a basketball. Okay, I am a basketball.", "Dribble me again and I will foul you.", "Bounce, bounce, bounce.", "That was a good pass."],
        dizzy: ["Too much dribbling! I am dizzy!", "Time out, time out!"], idle: ["Just bouncing on the court.", "Waiting for someone to pass me the song.", "Practising my free throws in my head."],
        click: ["Click! Nothing but net.", "Nice press. Two points.", "Buzzer beater!"], start: ["Tip off!", "Game time!"], busy: ["Still on the court, almost there!", "Dribbling through the data, one sec!"],
        done: ["Slam dunk!", "Nothing but net!", "And that is the buzzer!"], err: ["Air ball. I missed that one.", "Foul! Something went wrong."], dl: ["Fetching my playbook..."],
        sep: ["Passing the stems out to the team.", "Splitting the song like a fast break."], tag: ["Scouting the track...", "Reading the play, tempo and key."],
        wh: ["Taking notes on every word, coach.", "Calling out every lyric from the bench."], gen: ["Working the ball up the court.", "Dribbling along."], panel: ["Stems menu! Pick your starting five.", "Choose which stems make the team."],
        t: { play: ["Game on!"], skip: ["Next play!"], volume: ["Crowd noise up!"], shuffle: ["Shuffled like a new rotation."], playlist: ["A whole roster of songs!"], tag: ["Scouting report is in."], split: ["Passed right through the defense."], lyrics: ["Every word on the scoreboard."], sleep: ["Final buzzer coming up."], eq: ["Tuned like a good bounce."], missing: ["Not on the roster."] } },
      soccer: { open: ["Hey there! It's Bloopy, ready to kick off!", "Kick off! Bloopy here. What are we playing?"], ready: ["On the pitch and ready.", "Boots laced. Ready when you are."],
        tap: ["Please do not kick me!", "Goal!", "Boing! That was a header!"], poke: ["Hey! Only the keeper can touch me. Wait, no.", "Do not kick me, kick the song!", "Offside!", "That was a clean tackle."],
        dizzy: ["I am spinning like a free kick!", "Referee, I need a break!"], idle: ["Just rolling on the pitch.", "Waiting for the next kick.", "Practising my bend."],
        click: ["Click! Goal!", "Nice press. Top corner.", "And the crowd goes wild!"], start: ["Kick off!", "Let's play!"], busy: ["Still on the ball, almost there!", "Dribbling past the data, one sec!"],
        done: ["Goal!", "What a strike!", "Full time, and we won!"], err: ["Own goal. Oops.", "Yellow card, something went wrong."], dl: ["Collecting my kit..."],
        sep: ["Passing each stem to its own player.", "Splitting the song into positions."], tag: ["Studying the match...", "Checking the tempo, like the clock on the pitch."],
        wh: ["Taking notes on every word, like a commentator.", "Calling every lyric live."], gen: ["Working on the ball.", "Rolling down the pitch."], panel: ["Stems menu! Pick your formation.", "Choose who plays which position."],
        t: { play: ["Kick off the music!"], skip: ["Substitution!"], volume: ["Crowd noise up!"], shuffle: ["Shuffled the line-up."], playlist: ["A whole squad of songs!"], tag: ["Scouting report is in."], split: ["Split like a through ball."], lyrics: ["Every word, like live commentary."], sleep: ["Full time soon."], eq: ["Tuned for the stadium."], missing: ["Not in the squad."] } },
      earth: { open: ["Hello, world! It's me, Bloopy!", "Greetings from orbit! Bloopy here. What are we listening to?"], ready: ["Orbiting and ready.", "Spinning and ready when you are."],
        tap: ["Hello, world!", "You just caused a small earthquake!", "Spin me again!"], poke: ["Careful, you poked a continent.", "I was in the middle of an orbit!", "That is how tides start.", "Poking Earth. Bold."],
        dizzy: ["I rotate once a day, not once a second!", "Too fast! The seasons are all mixed up!"], idle: ["Just orbiting the sun.", "Spinning slowly, nothing to see.", "Thinking about oceans."],
        click: ["Click! A tiny tremor.", "Nice press. Felt it in Asia.", "That moved the plates."], start: ["Here we go around the sun!", "Spinning up!"], busy: ["Still in orbit, almost there!", "Crossing time zones, one sec!"],
        done: ["Sunrise! All done!", "Mission accomplished, planet-wide!", "One small step for stems!"], err: ["Houston, we have a problem.", "Hit a meteor, oops."], dl: ["Beaming it down from space..."],
        sep: ["Splitting the song into continents.", "Separating the oceans from the land."], tag: ["Scanning the track from orbit...", "Reading the tempo like a weather map."],
        wh: ["Charting every word like a map.", "Mapping out the lyrics."], gen: ["Working on it, still spinning.", "Rolling around the sun."], panel: ["Stems menu! Pick your continents.", "Choose which parts of the planet to keep."],
        t: { play: ["Music across the globe!"], skip: ["Next stop on the world tour!"], volume: ["Loud enough to hear from space."], shuffle: ["Shuffled across time zones."], playlist: ["A whole atlas of songs!"], tag: ["Mapped out the vibes."], split: ["Split like tectonic plates."], lyrics: ["Every word on the map."], sleep: ["Night is falling, sleep well."], eq: ["Tuned to the planet."], missing: ["Not on any map."] } },
      cat: { open: ["Meow! It's me, Bloopy. Ask me anything!", "Hello, human. Bloopy here. What are we listening to?"], ready: ["Stretched and ready.", "Awake from my nap and ready."],
        tap: ["Meow!", "Purr... I mean, hello.", "I will knock something off the table now."], poke: ["Hey! I am not a toy. Well, maybe a little.", "You may pet me. Once.", "I was napping!", "Do that again and I will sit on your keyboard."],
        dizzy: ["The zoomies hit me!", "I am dizzy, and I blame the dog."], idle: ["Just napping in a sunbeam.", "Staring at nothing. Very important work.", "Plotting something small and mischievous."],
        click: ["Click! Meow.", "Nice press. I approve.", "Paws up for that one."], start: ["On it, human!", "Pounce!"], busy: ["Still hunting, almost there!", "Chasing the data, one sec!"],
        done: ["Purrfect!", "Caught it! Got the data.", "Another mouse, I mean job, done."], err: ["Hiss! That did not work.", "I knocked it off the table by accident."], dl: ["Fetching my toys..."],
        sep: ["Clawing the song apart, gently.", "Pulling the vocals out, like a ball of yarn."], tag: ["Sniffing out the vibe...", "Whiskers twitching, reading the tempo."],
        wh: ["Writing every word with my paw.", "Listening with both ears, very closely."], gen: ["Working on it, with my tail up.", "Stalking along."], panel: ["Stems menu! Pick your catnip.", "Choose which stems to chase."],
        t: { play: ["Purr-fect tune."], skip: ["Next, I got bored."], volume: ["Loud enough to wake me from a nap."], shuffle: ["Shuffled like a cat in a box."], playlist: ["A whole cat tree of songs!"], tag: ["Sniffed it. Smells like bass."], split: ["Clawed right through it."], lyrics: ["Wrote it all down with my paw."], sleep: ["Time for a cat nap."], eq: ["Tuned like a purr."], missing: ["Not in the box, I checked."] } },
      bunny: { open: ["Hop hop! It's me, Bloopy!", "Hi hi! Bloopy here. What are we listening to?"], ready: ["Hopped over and ready.", "Ears up and ready."],
        tap: ["Hop hop!", "My nose twitched!", "Boing boing!"], poke: ["Hey! My ears are sensitive!", "Careful, I will thump my foot.", "Do not squish the fluff!", "I did a binky!"],
        dizzy: ["I am all hopped out!", "My ears are spinning!"], idle: ["Just nibbling a carrot.", "Twitching my nose at nothing.", "Dreaming of clover."],
        click: ["Click! Hop.", "Nice press. Fluffy.", "My ears perked up."], start: ["Hop to it!", "Hopping in!"], busy: ["Still hopping, almost there!", "Digging a burrow through the data, one sec!"],
        done: ["Hoppy to report it is done!", "Carrot cake time!", "All done, with a binky!"], err: ["Oops, I tripped over my ears.", "That did not hop right."], dl: ["Hopping off to fetch it..."],
        sep: ["Splitting the song, hop by hop.", "Separating the stems carefully, with soft paws."], tag: ["Twitching my nose to find the vibe...", "Listening with my big ears."],
        wh: ["Writing every word with my paw.", "My long ears caught every word."], gen: ["Working on it, hop by hop.", "Bouncing along."], panel: ["Stems menu! Pick your carrots.", "Choose which stems to nibble."],
        t: { play: ["Hoppy tunes!"], skip: ["Hop, next song!"], volume: ["Loud enough for long ears."], shuffle: ["Shuffled like a hop in the grass."], playlist: ["A whole garden of songs!"], tag: ["My nose says it is a good one."], split: ["Split with a hop and a skip."], lyrics: ["Every word, in my burrow notes."], sleep: ["Sleep tight in the burrow."], eq: ["Fine tuned for big ears."], missing: ["Not in this burrow."] } },
      panda: { open: ["Hey there! It's Bloopy. I was just having a snack.", "Hello! Bloopy here. What are we listening to? I have time."], ready: ["Fed and ready.", "Bamboo break over. Ready."],
        tap: ["Mmm, snack time?", "I was napping!", "Roll with it!"], poke: ["Hey! I am not a pillow.", "Careful, I am fluffy and sleepy.", "I rolled over. Bye.", "You poked a panda. Bold."],
        dizzy: ["I rolled too much!", "I am so dizzy I forgot my bamboo!"], idle: ["Just chewing bamboo.", "Taking a nap, with my eyes open.", "Thinking about the next snack."],
        click: ["Click! Bamboo.", "Nice press. Very chill.", "A panda approves."], start: ["Okay, after this snack.", "Rolling in!"], busy: ["Still chewing on it, almost there!", "Slow and steady, one sec!"],
        done: ["Done! Time for a nap.", "Nice and easy, like bamboo.", "All done, and I did not even spill my snack."], err: ["Oops, I dropped my bamboo.", "That one rolled away."], dl: ["Fetching more bamboo... I mean data."],
        sep: ["Splitting the song, like a bamboo stalk.", "Peeling the stems apart, one leaf at a time."], tag: ["Chewing on the vibes...", "Slowly figuring out the tempo."],
        wh: ["Writing each word, one bite at a time.", "Listening to every word, slowly."], gen: ["Working on it, slowly.", "Rolling along."], panel: ["Stems menu! Pick your bamboo.", "Choose which stems to chew."],
        t: { play: ["Chill tunes on."], skip: ["Next, after a stretch."], volume: ["A little louder, for the bamboo grove."], shuffle: ["Rolled the order around."], playlist: ["A whole bamboo forest of songs!"], tag: ["Chewed on it. Tastes good."], split: ["Peeled like a bamboo shoot."], lyrics: ["Every word, one slow bite at a time."], sleep: ["Nap time, finally."], eq: ["Nice and mellow."], missing: ["Not in this bamboo forest."] } },
      penguin: { open: ["Hello! It's Bloopy, dressed for the occasion.", "Waddle waddle! Bloopy here. What are we listening to?"], ready: ["Waddled over and ready.", "Slid in on my belly, ready."],
        tap: ["Waddle waddle!", "Squawk!", "Brr, that was a cold poke."], poke: ["Hey! I am not an ice cube.", "Careful, I will slide away.", "My tuxedo is wrinkled now.", "That tickled my flippers."],
        dizzy: ["I slid on the ice and spun!", "I waddled in circles!"], idle: ["Just standing on the ice.", "Thinking about fish.", "Waiting for the iceberg to drift."],
        click: ["Click! Brr.", "Nice press. Very cool.", "A penguin approves."], start: ["Sliding in!", "Off we waddle!"], busy: ["Still sliding, almost there!", "Swimming through the data, one sec!"],
        done: ["Done, and I did not even slip!", "Fish for everyone!", "All done, nice and cool."], err: ["Oops, I slipped on the ice.", "That one fell through the ice."], dl: ["Waddling off to fetch it..."],
        sep: ["Splitting the colony, I mean the stems.", "Separating the stems, nice and neat."], tag: ["Waddling around the vibes...", "Checking the tempo, flipper by flipper."],
        wh: ["Writing every word, like a tuxedo scribe.", "Listening with my flippers on my hips."], gen: ["Working on it, with a waddle.", "Sliding along."], panel: ["Stems menu! Pick your fish.", "Choose which stems to slide."],
        t: { play: ["Cool tunes, coming right up."], skip: ["Next iceberg!"], volume: ["Loud enough for the whole colony."], shuffle: ["Shuffled like a huddle."], playlist: ["A whole colony of songs!"], tag: ["Waddled through the vibes."], split: ["Split, slid and done."], lyrics: ["Every word, on ice."], sleep: ["Time to huddle up and sleep."], eq: ["Tuned like a cold, clear day."], missing: ["Not on this iceberg."] } },
      mint: { open: ["Hey there! It's Bloopy, cool and fresh!", "Fresh start! Bloopy here. What are we listening to?"], ready: ["Cool and ready.", "Fresh and ready when you are."],
        tap: ["Cool!", "That was refreshing.", "Ahh, minty fresh."], poke: ["Hey! You will make me melt.", "Cool as a cucumber, but ticklish.", "Poke me and you get fresh breath.", "That was refreshing, actually."],
        dizzy: ["I am so dizzy I forgot to be cool!", "My freshness is spinning!"], idle: ["Just chilling.", "Staying fresh.", "Cool and calm, as usual."],
        click: ["Click! Fresh.", "Nice press. Very cool.", "Minty approval."], start: ["Cool, let's go!", "Fresh start!"], busy: ["Still cool, almost there!", "Keeping fresh, one sec!"],
        done: ["Cool and done!", "Fresh as ever!", "All done, with a minty finish."], err: ["Oops, I lost my cool.", "That one went stale."], dl: ["Fetching something fresh..."],
        sep: ["Splitting the song, nice and clean.", "Separating the stems, crisp and clear."], tag: ["Sniffing out a fresh vibe...", "Reading the tempo, cool and calm."],
        wh: ["Writing every word, clean and clear.", "Catching every word, crisp."], gen: ["Working on it, still cool.", "Rolling along, fresh."], panel: ["Stems menu! Keep it clean.", "Pick your stems, nice and fresh."],
        t: { play: ["Fresh tunes on."], skip: ["Next, fresh and cool."], volume: ["Crisp and loud."], shuffle: ["Fresh shuffle."], playlist: ["A fresh batch of songs!"], tag: ["Cool vibes, noted."], split: ["Clean split."], lyrics: ["Every word, crisp and clear."], sleep: ["Sleep cool."], eq: ["Fresh tuning."], missing: ["Not in this fresh batch."] } },
      sunset: { open: ["Hey there! It's Bloopy, glowing at golden hour.", "Good vibes only. Bloopy here. What are we listening to?"], ready: ["Glowing and ready.", "Warm and ready when you are."],
        tap: ["Warm greetings!", "That was a golden poke.", "Glow glow!"], poke: ["Hey! You are blocking my light.", "Poke me again and I will blush.", "I am already pink, stop making it worse.", "That felt warm."],
        dizzy: ["The horizon is spinning!", "I turned all the colours at once!"], idle: ["Just watching the horizon.", "Glowing softly.", "Thinking about the golden hour."],
        click: ["Click! Warm.", "Nice press. Golden.", "That was smooth."], start: ["Let us catch the light!", "Off to the horizon!"], busy: ["Still glowing, almost there!", "Chasing the horizon, one sec!"],
        done: ["Golden! All done.", "Beautiful, just like the sky.", "Done, and the sky is pink."], err: ["Oops, the clouds got in the way.", "That one faded away."], dl: ["Fetching a little more light..."],
        sep: ["Splitting the song into layers of colour.", "Separating the stems, like bands of sky."], tag: ["Reading the song's colours...", "Feeling the tempo, soft and warm."],
        wh: ["Writing every word in warm light.", "Catching each lyric as the light fades."], gen: ["Working on it, with a glow.", "Rolling toward the horizon."], panel: ["Stems menu! Pick your colours.", "Choose which stems to light up."],
        t: { play: ["Golden hour playlist, now playing."], skip: ["Next, as the sun sets."], volume: ["Turned up the glow."], shuffle: ["Mixed like a sky full of colours."], playlist: ["A whole horizon of songs!"], tag: ["The vibes are warm."], split: ["Split like light through clouds."], lyrics: ["Every word, painted on the sky."], sleep: ["Goodnight, the sun is down."], eq: ["Tuned like a warm evening."], missing: ["Not on this horizon."] } },
      midnight: { open: ["Hello, night owl. It's Bloopy.", "Under the stars... Bloopy here. What are we listening to?"], ready: ["Awake and ready.", "The stars are out. Ready when you are."],
        tap: ["Shh, the stars are sleeping.", "Twinkle twinkle.", "You woke me up!"], poke: ["Hey! I was counting stars.", "Careful, you will wake the moon.", "That tickled my crescent.", "I was dreaming."],
        dizzy: ["The stars are spinning!", "I am so dizzy I lost the moon!"], idle: ["Just counting stars.", "Watching the moon.", "Thinking quiet thoughts."],
        click: ["Click! Twinkle.", "Nice press. Quiet and clean.", "The stars approve."], start: ["Into the night!", "Off we go, under the stars."], busy: ["Still up, almost there!", "Counting stars, one sec!"],
        done: ["Done, and the stars are out.", "All done, quietly.", "Mission complete. Time to dream."], err: ["Oops, a cloud covered the moon.", "That one went dark."], dl: ["Fetching it from the night sky..."],
        sep: ["Splitting the song, star by star.", "Separating the stems in the dark, carefully."], tag: ["Reading the song like a night sky...", "Counting the beats like stars."],
        wh: ["Writing every word by moonlight.", "Listening in the quiet of the night."], gen: ["Working on it, quietly.", "Rolling through the night."], panel: ["Stems menu! Pick your stars.", "Choose which stems stay up late."],
        t: { play: ["Night tunes, softly."], skip: ["Next star."], volume: ["Not too loud, the neighbours are asleep."], shuffle: ["Shuffled like constellations."], playlist: ["A whole night sky of songs!"], tag: ["The vibes are deep and quiet."], split: ["Split like the Milky Way."], lyrics: ["Every word, by moonlight."], sleep: ["Goodnight, and sweet dreams."], eq: ["Tuned like a quiet night."], missing: ["Lost in the dark."] } },
      gold: { open: ["Hello there! It's Bloopy, 24 karat.", "Shiny day! Bloopy here. What are we listening to?"], ready: ["Polished and ready.", "Gleaming and ready when you are."],
        tap: ["Ooh, shiny!", "Careful, do not smudge the gold.", "Ka-ching!"], poke: ["Hey! I am very valuable.", "Careful, that is solid gold. Maybe hollow.", "You can see your face in me.", "Poke me again and I will charge a fee."],
        dizzy: ["I am so dizzy I lost my shine!", "Stop spinning, I am worth more standing up!"], idle: ["Just sitting in the vault.", "Gleaming quietly.", "Counting my coins."],
        click: ["Click! Ka-ching.", "Nice press. Golden.", "Worth every click."], start: ["Time to mine some gold!", "Let us make this shine!"], busy: ["Still polishing, almost there!", "Mining the data, one sec!"],
        done: ["Pure gold!", "All done, and worth every second.", "Another gold medal!"], err: ["Oops, I tarnished that one.", "That one turned out to be fool's gold."], dl: ["Fetching more gold..."],
        sep: ["Refining the song, layer by layer.", "Separating the gold from the rest."], tag: ["Appraising the track...", "Weighing the tempo, carat by carat."],
        wh: ["Engraving every word.", "Writing the lyrics in gold ink."], gen: ["Working on it, with a gleam.", "Rolling along, shiny."], panel: ["Stems menu! Pick your nuggets.", "Choose which stems are gold."],
        t: { play: ["Golden tunes!"], skip: ["Next treasure!"], volume: ["Turned up the bling."], shuffle: ["Shuffled the treasure chest."], playlist: ["A whole vault of songs!"], tag: ["Appraised it. Very valuable."], split: ["Refined it into gold."], lyrics: ["Engraved every word."], sleep: ["Lock the vault, sleep well."], eq: ["Polished the sound."], missing: ["Not in the vault."] } }
    };
    const BL_QUIP_TOPICS = ['volume', 'skip', 'play', 'shuffle', 'playlist', 'tag', 'split', 'lyrics', 'sleep', 'eq', 'speed', 'screen', 'missing', 'silent', 'undo', 'empty'];
    const blSkinKey = () => lsGet('ppvSkin') || '';
    // the skin's pool for a kind of line (about two times in three), else the normal one
    const blPool = (name, base) => { const p = (BL_SKIN_SAY[blSkinKey()] || {})[name]; return p && p.length && Math.random() < 0.65 ? p : base; };
    const blLine = (name, base) => pick(blPool(name, base));
    const blTopic = (name, base) => { const p = ((BL_SKIN_SAY[blSkinKey()] || {}).t || {})[name]; return p && p.length && Math.random() < 0.7 ? p : base; };
    const blSkinNote = () => { const s = BL_SKINS[blSkinKey()]; return s ? ' You are dressed as a ' + s.name.toLowerCase() + ' right now, and you can make a tiny joke about it, but only sometimes.' : ''; };
    // the parts that sit behind his body (back of a hat brim, the headband, the back of the crown)
    const BL_REAR = g => ['headphones', 'wizard', 'crown'].map(k => `<g class="prop" data-p="${k}">${BL_ART[k].rear(g)}</g>`).join('');
    // small drawn icon of the item alone, for the accessories menu
    let blIcId = 0;
    const blIcon = k => { const a = BL_ART[k]; if (!a) return ''; const g = 'ppvi' + (++blIcId);
      return `<svg class="bl-ic" viewBox="${a.vb}" width="18" height="18" aria-hidden="true" style="vertical-align:-4px;margin-right:5px;overflow:visible"><defs>${BL_DEFS(g)}</defs>${a.rear ? a.rear(g) : ''}${a.item(g)}</svg>`; };
    function ball() {
      const g = 'ppvg' + (++uid), d = document.createElement('div');
      d.className = 'ppv-ball m-idle'; d.setAttribute('role', 'img'); d.setAttribute('aria-label', 'Bloopy, the mascot'); { const sk = lsGet('ppvSkin'); if (sk && BL_SKINS[sk]) d.dataset.skin = sk; }
      d.innerHTML = `<svg viewBox="0 0 64 64" aria-hidden="true"><defs><radialGradient id="${g}" cx=".35" cy=".3" r=".8"><stop offset="0" stop-color="#fff" stop-opacity=".45"/><stop offset=".55" stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".35"/></radialGradient>${BL_DEFS(g)}</defs>
        <ellipse class="sh" cx="32" cy="60" rx="15" ry="3"/>
        <g class="behind"><g class="burst"><circle cx="8" cy="22" r="7" fill="#e9e3ff" opacity=".35"/><circle cx="56" cy="22" r="7" fill="#e9e3ff" opacity=".35"/><circle cx="6" cy="44" r="8" fill="#e9e3ff" opacity=".35"/><circle cx="58" cy="44" r="8" fill="#e9e3ff" opacity=".35"/><circle cx="32" cy="62" r="8" fill="#e9e3ff" opacity=".35"/><circle cx="18" cy="60" r="6" fill="#e9e3ff" opacity=".35"/><circle cx="46" cy="60" r="6" fill="#e9e3ff" opacity=".35"/><path d="M0-4L1.2-1.2L4-1.2L1.8.6L2.6 3.6L0 1.8L-2.6 3.6L-1.8.6L-4-1.2L-1.2-1.2Z" transform="translate(2 8) scale(1.2)" fill="#ffd95a"/><path d="M0-4L1.2-1.2L4-1.2L1.8.6L2.6 3.6L0 1.8L-2.6 3.6L-1.8.6L-4-1.2L-1.2-1.2Z" transform="translate(60 6) scale(1)" fill="#ffd95a"/><path d="M0-4L1.2-1.2L4-1.2L1.8.6L2.6 3.6L0 1.8L-2.6 3.6L-1.8.6L-4-1.2L-1.2-1.2Z" transform="translate(62 30) scale(1.3)" fill="#ffd95a"/><path d="M0-4L1.2-1.2L4-1.2L1.8.6L2.6 3.6L0 1.8L-2.6 3.6L-1.8.6L-4-1.2L-1.2-1.2Z" transform="translate(0 30) scale(1)" fill="#ffd95a"/><path d="M0-4L1.2-1.2L4-1.2L1.8.6L2.6 3.6L0 1.8L-2.6 3.6L-1.8.6L-4-1.2L-1.2-1.2Z" transform="translate(12 64) scale(1.1)" fill="#ffd95a"/><path d="M0-4L1.2-1.2L4-1.2L1.8.6L2.6 3.6L0 1.8L-2.6 3.6L-1.8.6L-4-1.2L-1.2-1.2Z" transform="translate(54 62) scale(1.2)" fill="#ffd95a"/><path d="M0-4L1.2-1.2L4-1.2L1.8.6L2.6 3.6L0 1.8L-2.6 3.6L-1.8.6L-4-1.2L-1.2-1.2Z" transform="translate(30 -2) scale(1)" fill="#ffd95a"/><path d="M0-4L1.2-1.2L4-1.2L1.8.6L2.6 3.6L0 1.8L-2.6 3.6L-1.8.6L-4-1.2L-1.2-1.2Z" transform="translate(64 50) scale(0.9)" fill="#ffd95a"/></g></g><g class="gear">${blSkinPart('rear', g)}${BL_REAR(g)}</g><g class="body"><circle class="bd" cx="32" cy="34" r="24"/>${blSkinPart('body', g)}<circle cx="32" cy="34" r="24" fill="url(#${g})"/>
        <g class="eyes" data-fe="round"><circle class="eye" cx="24" cy="31" r="5.5"/><circle class="eye" cx="40" cy="31" r="5.5"/><circle class="pu" cx="25" cy="32" r="2.6"/><circle class="pu" cx="41" cy="32" r="2.6"/></g>
        <path class="xe" data-fe="dizzy" d="M20 27l8 8M28 27l-8 8M36 27l8 8M44 27l-8 8"/>
        <path class="m smile" data-fm="smile" d="M25 43q7 6 14 0"/><ellipse class="m open" data-fm="open" cx="32" cy="44" rx="4" ry="3.2"/><path class="m flat" data-fm="flat" d="M27 44h10"/><path class="m wavy" data-fm="wavy" d="M25 44q3-3 7 0t7 0"/>
        <path class="fs" data-fe="happy" style="display:none" d="M18 33q6-7 12 0M34 33q6-7 12 0"/><path class="fs" data-fe="focus" style="display:none" d="M19 31h10M35 31h10"/><path class="fs" data-fe="sad" style="display:none" d="M18 35q6-5 12 0M34 35q6-5 12 0M17 26l8 2M47 26l-8 2"/><path class="fs" data-fe="sleepy" style="display:none" d="M18 32h12M34 32h12"/><path class="fs" data-fe="squint" style="display:none" d="M18 31l12-2M34 29l12 2"/><path class="fs" data-fe="worry" style="display:none" d="M17 24l9-3M47 24l-9-3"/><g data-fe="wide" style="display:none"><circle class="eye" cx="24" cy="31" r="7"/><circle class="eye" cx="40" cy="31" r="7"/><circle class="pu" cx="24" cy="32" r="3"/><circle class="pu" cx="40" cy="32" r="3"/></g><path class="fm" data-fm="grin" style="display:none" d="M24 41q8 10 16 0z"/><path class="fs" data-fm="frown" style="display:none" d="M25 47q7-6 14 0"/><circle class="pu" data-fm="o" style="display:none" cx="32" cy="44" r="2.4"/><path class="fs" data-fm="tiny" style="display:none" d="M29 44h6"/><path class="fs" data-fm="clench" style="display:none" d="M25 44h14M28 41v6M32 41v6M36 41v6"/><path class="sw" data-fx="sweat" style="display:none" d="M50 20q3 5 0 7q-3-2 0-7z"/><text class="zz" data-fx="zz" style="display:none" x="50" y="14">z</text><g class="spark" data-fx="spark">${star(8, 14, 1.3)}${star(56, 10, 1)}${star(58, 36, .8)}</g></g><g class="gear">${blSkinPart('front', g)}${BL_GEAR(g)}</g></svg>`;
      return d;
    }

    const row = document.createElement('div'); row.id = 'ppv-mrow';
    const pb = ball(), bub = document.createElement('div'); bub.className = 'ppv-bub'; row.append(pb, bub);
    const fl = document.createElement('div'); fl.id = 'ppv-mfloat';
    const fb = ball(), fbub = document.createElement('div'); fbub.className = 'ppv-bub'; fl.append(fbub, fb);
    document.body.appendChild(fl);
    panel.firstElementChild.after(row);
    if (!on) row.style.display = 'none';
    fl.onclick = () => { fl.style.display = 'none'; panel.style.display = 'block'; };

    const L = {
      start: ['On it!', "Let's go!", 'Rolling up my sleeves… well, my ball.', 'Here we go!', 'Bounce time!', 'Okay, I am on it!'],
      dl: ['Fetching the brains (one time only)…', 'Downloading my homework…', 'Grabbing the model, hang tight!', 'Loading my brain, it will not take long!'],
      dec: ['Listening closely…', 'Giving the track a good listen…', 'Reading the waveform like a map…'],
      sep: ['Pulling the song apart…', 'Teasing the vocals from the beat…', 'Sorting voice from band…', 'Unmixing the mix, carefully…', 'Every drum hit gets its own place…'],
      enc: ['Wrapping up the stems…', 'Packing it all up…', 'Putting each stem in its own box…'],
      tag: ['Sniffing out the vibe…', 'Checking the tempo and key…', 'Tapping my foot to find the BPM…', 'Asking the tags how they feel…'],
      wh: ['Writing down every word…', 'Listening for lyrics…', 'Catching every word, one line at a time…'],
      gen: ['Working on it…', 'Rolling along…', 'Still bouncing on it…'],
      done: ['Ta-da!', 'All done!', 'Nailed it!', 'Fresh out of the oven!', 'Tada! Your stems are ready.', 'Crisp as a fresh bounce!'],
      err: ['Oops, I got dizzy.', 'Hmm, that did not work.', 'Uh-oh. Check the message in the panel.', 'That one slipped through my fingers.'],
      idle: ['Ready for the next one!', 'What else can I do?', 'Got another song for me?', 'Psst, try saying "make a playlist"!', 'Want a joke? Just ask!', 'Still here, still bouncing.'],
      panel: ['Stems menu! Pick a model and the tracks you want.', 'Vocals, drums, bass? Your call.', 'Tick the stems you want, then tap split.', 'Splitting is my favourite kind of surgery.', 'Heavier model, better split. Lighter model, faster split.', 'Pick a track first, then I can take it apart.'],
      night: ['Still up? Tell me if you want something soft.', 'Late-night stems? Bold choice.', 'Shh, quiet hours. I can keep it low.'],
      tap: ['Boing!', 'Hehe, that tickles!', "I'm Bloopy!", 'Need stems? Lyrics? Tags?', 'Boing! Did you need something?', 'Hehe, do it again!'],
      busy: ['Busy rolling, one sec!', 'Almost there!', 'Working, working…']
    };
