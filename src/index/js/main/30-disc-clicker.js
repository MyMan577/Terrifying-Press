  // ----- Per-track hook + live updates -----
  function ppOnTrackLoaded(t){
    if (!t) return;
    ppLoadLyricsFor(t);
    if (!t.rgDone) ppLoadReplayGain(t);
    ppLoadChapters(t).then(() => { if (tracks[currentIndex] === t && ppPanel.classList.contains('open')) ppRenderChapters(); });
    if (ppPanel.classList.contains('open')){ ppRenderBookmarks(); ppRenderChapters(); }
  }
  let ppLastChap = -2;
  function ppTick(e){
    if (!ppPanel.classList.contains('open') || e.target !== media()) return;
    ppEl('bm-now').textContent = fmtTime(media().currentTime || 0);
    const t = tracks[currentIndex], a = ppActiveChapter(t);
    if (a !== ppLastChap){ ppLastChap = a; ppEl('ch-list').querySelectorAll('.pp-item').forEach((r, i) => r.classList.toggle('active', i === a)); }
  }
  audioEl.addEventListener('timeupdate', ppTick);
  videoEl.addEventListener('timeupdate', ppTick);
  window.__ppLyrics = {
    has: (dbId) => !!ppJson(PP_LRC_KEY)[dbId],
    get: (dbId) => ppJson(PP_LRC_KEY)[dbId] || '',
    set: (dbId, lrc) => { ppStoreLyrics(dbId, lrc); const t = tracks[currentIndex]; if (t && t.dbId === dbId) ppLoadLyricsFor(t); }
  };

})();

  /* =====================================================================
     Disc Clicker, small isolated side-game. Self-contained, its own
     storage key, own class/id namespace (dc-*), no dependency on the
     player's internal state.
  ===================================================================== */
  (function(){
    const SAVE_KEY = 'discClickerSaveV1';

    const GENERATORS = [
      { id:'needle',  name:'Spare Needle',  icon:'🪡', baseCost:15,    ps:0.1  },
      { id:'speaker', name:'Speaker',       icon:'🔊', baseCost:100,   ps:1    },
      { id:'booth',   name:'DJ Booth',      icon:'🎚️', baseCost:600,   ps:6    },
      { id:'radio',   name:'Radio Station', icon:'📡', baseCost:4000,  ps:35   },
      { id:'label',   name:'Record Label',  icon:'🏷️', baseCost:25000, ps:180  },
      { id:'streaming', name:'Streaming Platform',      icon:'🎧', baseCost:150000,    ps:1000    },
      { id:'festival',  name:'Music Festival',          icon:'🎪', baseCost:900000,    ps:6000    },
      { id:'chart',     name:'Global Chart Domination', icon:'📊', baseCost:5500000,   ps:35000   },
      { id:'tour',      name:'World Tour Empire',       icon:'🌍', baseCost:33000000,  ps:200000  },
      { id:'monopoly',  name:'Music Industry Monopoly', icon:'👑', baseCost:200000000, ps:1200000 },
      { id:'metaverse',    name:'Music Metaverse',          icon:'🕶️', baseCost:1300000000,        ps:7500000        },
      { id:'interstellar', name:'Interstellar Broadcast',   icon:'🛰️', baseCost:8500000000,        ps:48000000       },
      { id:'galactic',     name:'Galactic Fanbase',         icon:'🌌', baseCost:55000000000,       ps:300000000      },
      { id:'universal',    name:'Universal Anthem',         icon:'🎇', baseCost:350000000000,      ps:2000000000     },
      { id:'multiverse',   name:'Multiverse Tour',          icon:'🌀', baseCost:2200000000000,     ps:13000000000    },
      { id:'cosmic',       name:'Cosmic Record Label',      icon:'🪐', baseCost:14000000000000,    ps:85000000000    },
      { id:'timetravel',   name:'Time-Traveling DJ',        icon:'⏳', baseCost:90000000000000,    ps:550000000000   },
      { id:'dimensional',  name:'Dimensional Soundwave',    icon:'🌈', baseCost:580000000000000,   ps:3500000000000  },
      { id:'reality',      name:'Reality Remix Engine',     icon:'🔮', baseCost:3700000000000000,  ps:22000000000000 },
      { id:'singularity',  name:'Infinite Groove Singularity', icon:'♾️', baseCost:24000000000000000, ps:145000000000000 },
    ];
    const CLICK_UPGRADES = [
      { id:'cu1',  name:'Better Needle',    icon:'✨', cost:50,          add:1     },
      { id:'cu2',  name:'Vinyl Polish',     icon:'🧴', cost:300,         add:2     },
      { id:'cu3',  name:'Amp Boost',        icon:'📢', cost:1500,        add:5     },
      { id:'cu4',  name:'Gold Cartridge',   icon:'🏆', cost:8000,        add:12    },
      { id:'cu5',  name:'Turntable Tune-up',icon:'🎛️', cost:40000,       add:30    },
      { id:'cu6',  name:'Diamond Stylus',   icon:'💎', cost:200000,      add:75    },
      { id:'cu7',  name:'Studio Monitor',   icon:'🎧', cost:1000000,     add:180   },
      { id:'cu8',  name:'Mixing Console',   icon:'🎚️', cost:5000000,     add:420   },
      { id:'cu9',  name:'Mastering Suite',  icon:'🎼', cost:25000000,    add:1000  },
      { id:'cu10', name:'Signature Series', icon:'✒️', cost:125000000,   add:2400  },
      { id:'cu11', name:'Platinum Pressing',icon:'🥇', cost:600000000,   add:5500  },
      { id:'cu12', name:'Legendary Groove', icon:'🌟', cost:3000000000,  add:13000 },
    ];

    // Per-generator multiplier upgrades: unlock once you own enough of that
    // generator, then multiply that generator's individual output. Stacks
    // multiplicatively with other tiers on the same generator.
    const GEN_UPGRADES = [
      { id:'gu-needle-1',  name:'Needle Calibration',  icon:'🔧', cost:500,      gen:'needle',  requires:10, mult:2 },
      { id:'gu-needle-2',  name:'Needle Assembly Line',icon:'🏭', cost:5000,     gen:'needle',  requires:25, mult:2 },
      { id:'gu-needle-3',  name:'Needle Automation',   icon:'🤖', cost:50000,    gen:'needle',  requires:50, mult:2 },
      { id:'gu-speaker-1', name:'Speaker Tuning',      icon:'🎼', cost:3000,     gen:'speaker', requires:10, mult:2 },
      { id:'gu-speaker-2', name:'Stadium Speakers',    icon:'🏟️', cost:30000,    gen:'speaker', requires:25, mult:2 },
      { id:'gu-speaker-3', name:'Arena Speakers',      icon:'🎪', cost:300000,   gen:'speaker', requires:50, mult:2 },
      { id:'gu-booth-1',   name:'Booth Soundproofing', icon:'🧱', cost:18000,    gen:'booth',   requires:10, mult:2 },
      { id:'gu-booth-2',   name:'Booth Network',       icon:'🌐', cost:180000,   gen:'booth',   requires:25, mult:2 },
      { id:'gu-radio-1',   name:'Radio Syndication',   icon:'📶', cost:120000,   gen:'radio',   requires:10, mult:2 },
      { id:'gu-radio-2',   name:'Satellite Uplink',    icon:'🛰️', cost:1200000,  gen:'radio',   requires:25, mult:2 },
      { id:'gu-label-1',   name:'Label Marketing',     icon:'📣', cost:750000,   gen:'label',   requires:10, mult:2 },
      { id:'gu-label-2',   name:'Global Distribution', icon:'🌍', cost:7500000,  gen:'label',   requires:25, mult:2 },
      { id:'gu-needle-4',  name:'Needle Precision Array',   icon:'🎯', cost:500000,     gen:'needle',  requires:100, mult:2 },
      { id:'gu-needle-5',  name:'Needle AI Tracking',       icon:'🧠', cost:5000000,    gen:'needle',  requires:200, mult:2 },
      { id:'gu-speaker-4', name:'Concert Hall Speakers',    icon:'🏛️', cost:3000000,    gen:'speaker', requires:100, mult:2 },
      { id:'gu-speaker-5', name:'Festival Sound System',    icon:'🎆', cost:30000000,   gen:'speaker', requires:200, mult:2 },
      { id:'gu-booth-3',   name:'Booth Holographic Deck',   icon:'🌀', cost:1800000,    gen:'booth',   requires:50,  mult:2 },
      { id:'gu-booth-4',   name:'Booth AI DJ',              icon:'🤖', cost:18000000,   gen:'booth',   requires:100, mult:2 },
      { id:'gu-radio-3',   name:'Global Broadcast Network', icon:'🌐', cost:12000000,   gen:'radio',   requires:50,  mult:2 },
      { id:'gu-radio-4',   name:'Interstellar Signal',      icon:'🛸', cost:120000000,  gen:'radio',   requires:100, mult:2 },
      { id:'gu-label-3',   name:'Label Franchise',          icon:'🏢', cost:75000000,   gen:'label',   requires:50,  mult:2 },
      { id:'gu-label-4',   name:'Label Empire',             icon:'👑', cost:750000000,  gen:'label',   requires:100, mult:2 },
    ];

    // Global multipliers: apply on top of everything else, to either click
    // power or total generator output.
    const GLOBAL_UPGRADES = [
      { id:'gl1', name:'Fan Mail',        icon:'💌', cost:10000,       kind:'click', mult:1.5  },
      { id:'gl2', name:'Radio Airplay',   icon:'📻', cost:60000,       kind:'ps',    mult:1.25 },
      { id:'gl3', name:'World Tour',      icon:'🌎', cost:300000,      kind:'click', mult:1.5  },
      { id:'gl4', name:'Chart Topper',    icon:'📈', cost:1500000,     kind:'ps',    mult:1.25 },
      { id:'gl5', name:'Award Season',    icon:'🏅', cost:8000000,     kind:'click', mult:2    },
      { id:'gl6', name:'Streaming Deal',  icon:'💽', cost:40000000,    kind:'ps',    mult:1.5  },
      { id:'gl7', name:'Hall of Fame',    icon:'🎖️', cost:200000000,   kind:'click', mult:2    },
      { id:'gl8', name:'Legacy Label',    icon:'🏛️', cost:1000000000,  kind:'ps',    mult:2    },
      { id:'gl9', name:'Greatest Hits',   icon:'💿', cost:5000000000,  kind:'click', mult:2.5  },
      { id:'gl10',name:'Music Icon',      icon:'👑', cost:20000000000, kind:'ps',    mult:2.5  },
    ];

    let state = {
      grooves: 0,
      generatorCounts: {},
      upgradesBought: {},
    };

    function loadState(){
      try {
        const saved = JSON.parse(localStorage.getItem(SAVE_KEY));
        if (saved && typeof saved === 'object'){
          state.grooves = typeof saved.grooves === 'number' ? saved.grooves : 0;
          state.generatorCounts = saved.generatorCounts || {};
          state.upgradesBought = saved.upgradesBought || {};
        }
      } catch(e){ /* ignore */ }
    }
    function saveState(){
      try { localStorage.setItem(SAVE_KEY, JSON.stringify(state)); } catch(e){ /* storage full */ }
    }

    // Press Play Playground charms, the album and the Groove Storm scale click power and production.
    const pgMult = k => { try { return (window.PPPlayground && window.PPPlayground.mult) ? window.PPPlayground.mult(k) : 1; } catch(e){ return 1; } };
    function generatorCost(gen){
      const owned = state.generatorCounts[gen.id] || 0;
      return Math.round(gen.baseCost * Math.pow(1.15, owned));
    }
    // Click power and total production are derived on the fly from which
    // upgrades are owned (rather than stored/mutated directly), so
    // multiplier upgrades stack correctly regardless of purchase order.
    function clickPower(){
      let power = 1 + CLICK_UPGRADES.reduce((sum, u) => sum + (state.upgradesBought[u.id] ? u.add : 0), 0);
      GLOBAL_UPGRADES.forEach(u => {
        if (u.kind === 'click' && state.upgradesBought[u.id]) power *= u.mult;
      });
      return power * pgMult('click');
    }
    function totalPs(){
      let sum = GENERATORS.reduce((total, gen) => {
        const owned = state.generatorCounts[gen.id] || 0;
        let mult = 1;
        GEN_UPGRADES.forEach(u => {
          if (u.gen === gen.id && state.upgradesBought[u.id]) mult *= u.mult;
        });
        return total + owned * gen.ps * mult;
      }, 0);
      GLOBAL_UPGRADES.forEach(u => {
        if (u.kind === 'ps' && state.upgradesBought[u.id]) sum *= u.mult;
      });
      return sum * pgMult('ps');
    }
    function formatNum(n){
      if (n < 1000) return (Math.round(n * 10) / 10).toString();
      if (n < 1e6) return (n/1e3).toFixed(n < 1e4 ? 2 : 1) + 'K';
      if (n < 1e9) return (n/1e6).toFixed(2) + 'M';
      if (n < 1e12) return (n/1e9).toFixed(2) + 'B';
      if (n < 1e15) return (n/1e12).toFixed(2) + 'T';
      if (n < 1e18) return (n/1e15).toFixed(2) + 'Qa';
      return (n/1e18).toFixed(2) + 'Qi';
    }

    // ---------- Build DOM ----------
    const root = document.createElement('div');
    root.id = 'dc-widget';
    root.innerHTML = `
      <div id="dc-panel">
        <div id="dc-header">
          <span id="dc-title">🎵 Disc Clicker</span>
        </div>
        <div id="dc-stats">
          <div id="dc-groove-count">0 grooves</div>
          <div id="dc-ps">0 / sec</div>
        </div>
        <div id="dc-disc-wrap">
          <button id="dc-disc" aria-label="Click the disc" type="button">
            <svg viewBox="0 0 120 120" width="100" height="100">
              <circle cx="60" cy="60" r="58" fill="url(#dc-grad)" stroke="var(--line)" stroke-width="1"/>
              <circle cx="60" cy="60" r="48" fill="none" stroke="rgba(0,0,0,0.35)" stroke-width="1"/>
              <circle cx="60" cy="60" r="38" fill="none" stroke="rgba(0,0,0,0.3)" stroke-width="1"/>
              <circle cx="60" cy="60" r="28" fill="none" stroke="rgba(0,0,0,0.25)" stroke-width="1"/>
              <circle cx="60" cy="60" r="16" fill="var(--bg-elev)" stroke="var(--line)" stroke-width="1"/>
              <circle cx="60" cy="60" r="4" fill="var(--accent)"/>
              <defs>
                <radialGradient id="dc-grad" cx="50%" cy="50%" r="70%">
                  <stop offset="0%" stop-color="#2a2b31"/>
                  <stop offset="100%" stop-color="#111116"/>
                </radialGradient>
              </defs>
            </svg>
          </button>
          <div id="dc-click-power">+<span id="dc-click-power-val">1</span> per click</div>
        </div>
        <div id="dc-shop">
          <div class="dc-shop-section">
            <div class="dc-shop-label">Click upgrades</div>
            <div id="dc-click-upgrades"></div>
          </div>
          <div class="dc-shop-section">
            <div class="dc-shop-label">Generators</div>
            <div id="dc-generators"></div>
          </div>
          <div class="dc-shop-section">
            <div class="dc-shop-label">Generator upgrades</div>
            <div id="dc-gen-upgrades"></div>
          </div>
          <div class="dc-shop-section">
            <div class="dc-shop-label">Global upgrades</div>
            <div id="dc-global-upgrades"></div>
          </div>
        </div>
      </div>
      <button id="dc-tab" type="button" aria-label="Open disc clicker game" aria-expanded="false">🎵</button>
    `;
    document.body.appendChild(root);

    const style = document.createElement('style');
    style.textContent = `
      #dc-widget{
        position:fixed; left:0; top:50%;
        transform:translateY(-50%) translateX(-280px);
        display:flex; flex-direction:row; align-items:stretch;
        z-index:60;
        transition:transform .3s ease;
        font-family:'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;
        user-select:none; -webkit-user-select:none; -moz-user-select:none;
        -webkit-tap-highlight-color:transparent;
      }
      #dc-widget *{
        -webkit-tap-highlight-color:transparent;
      }
      #dc-widget button{
        -webkit-touch-callout:none;
      }
      #dc-disc, #dc-disc svg, #dc-disc *{
        outline:none;
      }
      #dc-disc:focus{ outline:none; }
      #dc-disc::-moz-focus-inner{ border:0; }
      #dc-widget.dc-open{ transform:translateY(-50%) translateX(0); }
      #dc-panel{
        width:280px;
        max-height:78vh;
        background:var(--bg-elev);
        border:1px solid var(--line);
        border-left:none;
        border-radius:0 14px 14px 0;
        box-shadow:0 10px 30px rgba(0,0,0,0.45);
        display:flex; flex-direction:column;
        overflow:hidden;
      }
      #dc-tab{
        width:22px; flex-shrink:0;
        background:var(--bg-elev);
        border:1px solid var(--line);
        border-left:none;
        border-radius:0 8px 8px 0;
        color:var(--text-dim);
        font-size:12px;
        cursor:pointer;
        display:flex; align-items:center; justify-content:center;
        writing-mode:vertical-rl;
        align-self:center;
        height:64px;
        transition:color .15s, background .15s;
      }
      #dc-tab:hover{ color:var(--accent); background:#1a2422; }
      #dc-header{
        padding:14px 16px 10px 16px;
        border-bottom:1px solid var(--line);
        flex-shrink:0;
      }
      #dc-title{ font-size:13px; font-weight:600; color:var(--text); }
      #dc-stats{
        padding:10px 16px 0 16px;
        flex-shrink:0;
      }
      #dc-groove-count{ font-size:18px; font-weight:700; color:var(--text); }
      #dc-ps{ font-size:11px; color:var(--text-dim); margin-top:2px; }
      #dc-disc-wrap{
        display:flex; flex-direction:column; align-items:center;
        padding:14px 16px 10px 16px;
        flex-shrink:0;
      }
      #dc-disc{
        background:none; border:none; padding:0; cursor:pointer;
        border-radius:50%;
        line-height:0;
        transition:transform .08s ease;
      }
      #dc-disc:active{ transform:scale(0.94); }
      #dc-disc.dc-wobble{ animation:dc-wobble-kf .38s ease; }
      @keyframes dc-wobble-kf{
        0%{ transform:rotate(0deg) scale(1); }
        20%{ transform:rotate(-9deg) scale(1.05); }
        45%{ transform:rotate(7deg) scale(1.03); }
        70%{ transform:rotate(-4deg) scale(1.01); }
        100%{ transform:rotate(0deg) scale(1); }
      }
      #dc-click-power{ font-size:11px; color:var(--text-dim); margin-top:8px; }
      #dc-click-power-val{ color:var(--accent); font-weight:600; }
      #dc-shop{
        flex:1;
        overflow-y:auto;
        padding:6px 12px 14px 12px;
      }
      .dc-shop-label{
        font-size:10px; letter-spacing:0.4px; text-transform:uppercase;
        color:var(--text-dim); margin:10px 4px 6px 4px;
      }
      .dc-item{
        display:flex; align-items:center; gap:10px;
        width:100%;
        background:var(--bg);
        border:1px solid var(--line);
        border-radius:9px;
        padding:8px 10px;
        margin-bottom:6px;
        cursor:pointer;
        text-align:left;
        color:var(--text);
        transition:border-color .12s, opacity .12s;
      }
      .dc-item:hover:not(:disabled){ border-color:var(--accent-dim); }
      .dc-item:disabled{ opacity:0.45; cursor:default; }
      .dc-item-icon{ font-size:17px; flex-shrink:0; width:20px; text-align:center; }
      .dc-item-info{ flex:1; min-width:0; }
      .dc-item-name{ font-size:12px; font-weight:600; }
      .dc-item-sub{ font-size:10.5px; color:var(--text-dim); margin-top:1px; }
      .dc-item-cost{ font-size:11px; color:var(--accent); font-weight:600; white-space:nowrap; }
      .dc-floater{
        position:absolute;
        font-size:13px; font-weight:700; color:var(--accent);
        pointer-events:none;
        animation:dc-float-kf .8s ease forwards;
      }
      @keyframes dc-float-kf{
        0%{ opacity:1; transform:translate(-50%, 0); }
        100%{ opacity:0; transform:translate(-50%, -36px); }
      }
    `;
    document.head.appendChild(style);

    const tabBtn = root.querySelector('#dc-tab');
    const discBtn = root.querySelector('#dc-disc');
    const grooveCountEl = root.querySelector('#dc-groove-count');
    const psEl = root.querySelector('#dc-ps');
    const clickPowerValEl = root.querySelector('#dc-click-power-val');
    const clickUpgradesWrap = root.querySelector('#dc-click-upgrades');
    const generatorsWrap = root.querySelector('#dc-generators');
    const genUpgradesWrap = root.querySelector('#dc-gen-upgrades');
    const globalUpgradesWrap = root.querySelector('#dc-global-upgrades');
    const sidebarToggleBtn = document.getElementById('dc-sidebar-toggle');

    const HIDDEN_KEY = 'discClickerHiddenV1';
    function isHidden(){
      try { return localStorage.getItem(HIDDEN_KEY) === '1'; } catch(e){ return false; }
    }
    function setHidden(hidden){
      root.style.display = hidden ? 'none' : '';
      if (hidden) root.classList.remove('dc-open');
      if (sidebarToggleBtn){
        sidebarToggleBtn.textContent = hidden ? '🎵 Show game tab' : '🎵 Hide game tab';
      }
      try { localStorage.setItem(HIDDEN_KEY, hidden ? '1' : '0'); } catch(e){ /* ignore */ }
    }
    if (sidebarToggleBtn){
      sidebarToggleBtn.addEventListener('click', () => {
        setHidden(!isHidden());
      });
    }
    setHidden(isHidden());

    // Off by default: with the panel closed (or the tab backgrounded), the
    // tick interval skips both the groove accrual math and - more
    // importantly - the renderShop() DOM rebuild it triggers, since neither
    // does anything useful when nobody can see the numbers change. That's
    // a straight performance-vs-idle-progress tradeoff, so it's a setting
    // rather than just always-on or always-off: some people want their
    // generators to keep earning no matter what, others would rather the
    // game not spend any cycles while it's tucked away.
    const BACKGROUND_EARN_KEY = 'discClickerBackgroundEarnV1';
    const backgroundEarnToggle = document.getElementById('dc-background-earn-toggle');
    function isBackgroundEarnOn(){
      try { return localStorage.getItem(BACKGROUND_EARN_KEY) === '1'; } catch(e){ return false; }
    }
    function setBackgroundEarn(on){
      if (backgroundEarnToggle) backgroundEarnToggle.checked = on;
      try { localStorage.setItem(BACKGROUND_EARN_KEY, on ? '1' : '0'); } catch(e){ /* ignore */ }
    }
    if (backgroundEarnToggle){
      backgroundEarnToggle.checked = isBackgroundEarnOn();
      backgroundEarnToggle.addEventListener('change', () => {
        setBackgroundEarn(backgroundEarnToggle.checked);
        renderAll();
      });
    }
    // The panel is "active" (worth spending cycles on) when it's open, or
    // whenever background earning is explicitly turned on.
    function shouldRunGameLoop(){
      if (document.hidden) return isBackgroundEarnOn();
      return root.classList.contains('dc-open') || isBackgroundEarnOn();
    }

    tabBtn.addEventListener('click', () => {
      const open = root.classList.toggle('dc-open');
      tabBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
      if (open) renderAll(); // catch up the display after any skipped ticks while closed
    });

    // Rapid clicking can trigger the browser's native text-selection
    // highlight on surrounding content; blocking mousedown's default
    // stops that without interfering with the click event itself.
    discBtn.addEventListener('mousedown', (e) => e.preventDefault());
    tabBtn.addEventListener('mousedown', (e) => e.preventDefault());

    discBtn.addEventListener('click', (e) => {
      const power = clickPower();
      state.grooves += power;
      try { if (window.PPPlayground) window.PPPlayground.stat('clicks', 1); } catch(e2){}
      discBtn.classList.remove('dc-wobble');
      void discBtn.offsetWidth; // restart animation
      discBtn.classList.add('dc-wobble');

      const floater = document.createElement('div');
      floater.className = 'dc-floater';
      floater.textContent = '+' + formatNum(power);
      const rect = discBtn.getBoundingClientRect();
      const wrapRect = root.querySelector('#dc-disc-wrap').getBoundingClientRect();
      floater.style.left = (rect.left - wrapRect.left + rect.width/2) + 'px';
      floater.style.top = '0px';
      root.querySelector('#dc-disc-wrap').style.position = 'relative';
      root.querySelector('#dc-disc-wrap').appendChild(floater);
      setTimeout(() => floater.remove(), 800);

      renderStats();
      renderShop();
      saveState();
    });

    function buyGenerator(gen){
      const cost = generatorCost(gen);
      if (state.grooves < cost) return;
      state.grooves -= cost;
      state.generatorCounts[gen.id] = (state.generatorCounts[gen.id] || 0) + 1;
      renderAll();
      saveState();
    }
    // Shared by click upgrades, generator upgrades, and global upgrades:
    // all of them just flip an upgradesBought flag and deduct cost, since
    // their effects are read live by clickPower()/totalPs().
    function buyUpgrade(up){
      if (state.upgradesBought[up.id]) return;
      if (state.grooves < up.cost) return;
      state.grooves -= up.cost;
      state.upgradesBought[up.id] = true;
      renderAll();
      saveState();
    }

    function renderStats(){
      grooveCountEl.textContent = formatNum(state.grooves) + ' grooves';
      psEl.textContent = formatNum(totalPs()) + ' / sec';
      clickPowerValEl.textContent = formatNum(clickPower());
    }

    function renderShop(){
      clickUpgradesWrap.innerHTML = '';
      CLICK_UPGRADES.forEach(up => {
        const bought = !!state.upgradesBought[up.id];
        const btn = document.createElement('button');
        btn.className = 'dc-item';
        btn.type = 'button';
        btn.disabled = bought || state.grooves < up.cost;
        btn.innerHTML = `
          <span class="dc-item-icon">${up.icon}</span>
          <span class="dc-item-info">
            <div class="dc-item-name">${up.name}</div>
            <div class="dc-item-sub">+${formatNum(up.add)} per click</div>
          </span>
          <span class="dc-item-cost">${bought ? 'Owned' : formatNum(up.cost)}</span>
        `;
        if (!bought) btn.addEventListener('click', () => buyUpgrade(up));
        clickUpgradesWrap.appendChild(btn);
      });

      generatorsWrap.innerHTML = '';
      GENERATORS.forEach(gen => {
        const cost = generatorCost(gen);
        const owned = state.generatorCounts[gen.id] || 0;
        const btn = document.createElement('button');
        btn.className = 'dc-item';
        btn.type = 'button';
        btn.disabled = state.grooves < cost;
        btn.innerHTML = `
          <span class="dc-item-icon">${gen.icon}</span>
          <span class="dc-item-info">
            <div class="dc-item-name">${gen.name} ${owned ? '<span style="color:var(--text-dim)">x'+owned+'</span>' : ''}</div>
            <div class="dc-item-sub">+${formatNum(gen.ps)}/sec each</div>
          </span>
          <span class="dc-item-cost">${formatNum(cost)}</span>
        `;
        btn.addEventListener('click', () => buyGenerator(gen));
        generatorsWrap.appendChild(btn);
      });

      genUpgradesWrap.innerHTML = '';
      GEN_UPGRADES.forEach(up => {
        const bought = !!state.upgradesBought[up.id];
        const genName = GENERATORS.find(g => g.id === up.gen).name;
        const btn = document.createElement('button');
        btn.className = 'dc-item';
        btn.type = 'button';
        btn.disabled = bought || state.grooves < up.cost;
        btn.innerHTML = `
          <span class="dc-item-icon">${up.icon}</span>
          <span class="dc-item-info">
            <div class="dc-item-name">${up.name}</div>
            <div class="dc-item-sub">${genName} x${up.mult} output</div>
          </span>
          <span class="dc-item-cost">${bought ? 'Owned' : formatNum(up.cost)}</span>
        `;
        if (!bought) btn.addEventListener('click', () => buyUpgrade(up));
        genUpgradesWrap.appendChild(btn);
      });

      globalUpgradesWrap.innerHTML = '';
      GLOBAL_UPGRADES.forEach(up => {
        const bought = !!state.upgradesBought[up.id];
        const btn = document.createElement('button');
        btn.className = 'dc-item';
        btn.type = 'button';
        btn.disabled = bought || state.grooves < up.cost;
        btn.innerHTML = `
          <span class="dc-item-icon">${up.icon}</span>
          <span class="dc-item-info">
            <div class="dc-item-name">${up.name}</div>
            <div class="dc-item-sub">${up.kind === 'click' ? 'Click power' : 'All production'} x${up.mult}</div>
          </span>
          <span class="dc-item-cost">${bought ? 'Owned' : formatNum(up.cost)}</span>
        `;
        if (!bought) btn.addEventListener('click', () => buyUpgrade(up));
        globalUpgradesWrap.appendChild(btn);
      });
    }

    function renderAll(){
      renderStats();
      renderShop();
    }
    // Used by Press Play Playground: orders, the wheel, rewards and games add grooves, and charms can spend them.
    window.PPClicker = {
      grooves: () => state.grooves,
      ps: () => totalPs(),
      clickPower: () => clickPower(),
      fmt: formatNum,
      add: (n) => { if (!(n > 0)) return; state.grooves += n; renderStats(); saveState(); },
      spend: (n) => { if (!(n > 0) || state.grooves < n) return false; state.grooves -= n; renderAll(); saveState(); return true; },
      isHidden: () => isHidden(),
      show: () => { setHidden(false); root.classList.add('dc-open'); tabBtn.setAttribute('aria-expanded', 'true'); renderAll(); }
    };

