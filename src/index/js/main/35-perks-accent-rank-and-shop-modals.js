    // ---------- Playback perks (Level 340+) ----------
    // Quick speed buttons (340), skip intro/outro (360), jump buttons (380) and
    // quick boost buttons (425). All of them drive the app's own controls or
    // media elements - none touch the audio chain. Lite mode switches them off.
    const PERK_LEVELS = { speed: 340, skip: 360, jump: 380, boost: 425 };
    const PERKS_KEY = 'ppxpPerksV1';
    const QUICK_SPEEDS = [0.75, 1, 1.25, 1.5, 1.75, 2, 2.5, 3];
    const QUICK_BOOSTS = [100, 125, 150, 200, 300];
    const JUMP_OPTIONS = [0, 5, 10, 15, 30];
    const perks = { introSec: 0, outroSec: 0, jumpSec: 10, jumpPrev: 10 };
    (function loadPerks(){
      try {
        const v = JSON.parse(localStorage.getItem(PERKS_KEY));
        if (v && typeof v === 'object'){
          if (typeof v.introSec === 'number') perks.introSec = Math.max(0, Math.min(60, Math.round(v.introSec)));
          if (typeof v.outroSec === 'number') perks.outroSec = Math.max(0, Math.min(60, Math.round(v.outroSec)));
          if (JUMP_OPTIONS.indexOf(v.jumpSec) >= 0) perks.jumpSec = v.jumpSec;
          if (JUMP_OPTIONS.indexOf(v.jumpPrev) > 0) perks.jumpPrev = v.jumpPrev;
          else if (perks.jumpSec > 0) perks.jumpPrev = perks.jumpSec;
        }
      } catch(e){ /* ignore */ }
    })();
    function savePerks(){ try { localStorage.setItem(PERKS_KEY, JSON.stringify(perks)); } catch(e){ /* storage full */ } }
    function liteOn(){ try { return localStorage.getItem('ppLiteMode') === '1'; } catch(e){ return false; } }
    // Press Play PLUS keeps the leveling system but unlocks every perk from the start.
    function plusOn(){ try { return !liteOn() && (localStorage.getItem('ppPlusMode') === '1' || localStorage.getItem('ppPremiumMode') === '1' || localStorage.getItem('ppPlaygroundMode') === '1'); } catch(e){ return false; } }
    function perkOn(name){ return !liteOn() && (plusOn() || isUnlocked(PERK_LEVELS[name])); }
    function setRange(el, v){
      el.value = String(v);
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    }
    function perkMedia(){
      const V = document.getElementById('video-el'), A = document.getElementById('audio');
      return (V && V.currentSrc && V.videoWidth > 0) ? V : A;
    }
    function makeChips(id, values, fmt, onPick){
      const wrap = document.createElement('div');
      wrap.id = id; wrap.className = 'ppxp-quick';
      values.forEach(v => {
        const b = document.createElement('button');
        b.type = 'button'; b.className = 'ppxp-chip';
        b.dataset.v = String(v); b.textContent = fmt(v);
        b.addEventListener('click', () => onPick(v));
        wrap.appendChild(b);
      });
      return wrap;
    }
    function paintChips(id, current){
      const w = document.getElementById(id);
      if (!w) return;
      w.querySelectorAll('.ppxp-chip').forEach(b => b.classList.toggle('active', Math.abs(parseFloat(b.dataset.v) - current) < 0.001));
    }
    function paintQuickSpeed(){
      const sl = document.getElementById('speed-slider');
      if (sl) paintChips('ppxp-quick-speed', parseFloat(sl.value));
    }
    function paintQuickBoost(){
      const sl = document.getElementById('master-boost-slider');
      if (sl) paintChips('ppxp-quick-boost', parseFloat(sl.value));
    }
    function setupQuickSpeed(){
      const dd = document.getElementById('speed-dropdown'), reset = document.getElementById('speed-reset-btn'), sl = document.getElementById('speed-slider');
      if (!dd || !reset || !sl || document.getElementById('ppxp-quick-speed')) return;
      const wrap = makeChips('ppxp-quick-speed', QUICK_SPEEDS, v => v + 'x', v => { setRange(sl, v); paintQuickSpeed(); });
      dd.insertBefore(wrap, reset);
      sl.addEventListener('input', paintQuickSpeed);
      reset.addEventListener('click', () => setTimeout(paintQuickSpeed, 0));
      const sb = document.getElementById('speed-btn');
      if (sb) sb.addEventListener('click', () => setTimeout(paintQuickSpeed, 0));
    }
    function setupQuickBoost(){
      const sl = document.getElementById('master-boost-slider');
      if (!sl || document.getElementById('ppxp-quick-boost')) return;
      const row = sl.closest('.boost-row');
      if (!row) return;
      const wrap = makeChips('ppxp-quick-boost', QUICK_BOOSTS, v => v + '%', v => { setRange(sl, v); paintQuickBoost(); });
      row.insertAdjacentElement('afterend', wrap);
      sl.addEventListener('input', paintQuickBoost);
      const dd = document.getElementById('eq-dropdown');
      if (dd) dd.addEventListener('click', () => setTimeout(paintQuickBoost, 0));
      const eb = document.getElementById('eq-btn');
      if (eb) eb.addEventListener('click', () => setTimeout(paintQuickBoost, 0));
    }
    function jumpBy(dir){
      const m = perkMedia();
      if (!m || !isFinite(m.duration) || perks.jumpSec <= 0) return;
      m.currentTime = Math.max(0, Math.min(m.duration, m.currentTime + dir * perks.jumpSec));
    }
    function setupJump(){
      const host = document.getElementById('extra-transport');
      if (!host || document.getElementById('ppxp-jump-back')) return;
      const mk = (id, title, dir) => {
        const b = document.createElement('button');
        b.type = 'button'; b.id = id; b.className = 'pill-btn ppxp-jump';
        b.title = title; b.setAttribute('aria-label', title);
        b.innerHTML = '<span></span>';
        b.addEventListener('click', () => jumpBy(dir));
        return b;
      };
      host.insertBefore(mk('ppxp-jump-fwd', 'Jump forward', 1), host.firstChild);
      host.insertBefore(mk('ppxp-jump-back', 'Jump back', -1), host.firstChild);
    }
    function setupSkip(){
      ['audio', 'video-el'].forEach(id => {
        const el = document.getElementById(id);
        if (!el || el.__ppxpSkip) return;
        el.__ppxpSkip = true;
        el.addEventListener('loadedmetadata', () => {
          el.__ppxpLastT = 0;
          if (el !== perkMedia() || !perkOn('skip') || perks.introSec <= 0) return;
          const d = el.duration;
          // Only when nothing else (like a saved resume point) has already moved the playhead.
          if (isFinite(d) && d > perks.introSec * 3 && el.currentTime < 1){
            try { el.currentTime = perks.introSec; } catch(e){ /* not seekable yet */ }
          }
        });
        el.addEventListener('timeupdate', () => {
          const t = el.currentTime;
          const last = (typeof el.__ppxpLastT === 'number') ? el.__ppxpLastT : t;
          el.__ppxpLastT = t;
          if (el !== perkMedia() || !perkOn('skip') || perks.outroSec <= 0 || el.paused) return;
          const d = el.duration;
          if (!isFinite(d) || d <= perks.outroSec * 3) return;
          const edge = d - perks.outroSec;
          // Fire only when playback crosses the edge on its own, not when you seek into the outro.
          if (last < edge && t >= edge && t - last < 2){
            try { el.currentTime = Math.max(0, d - 0.05); } catch(e){ /* ignore */ }
          }
        });
      });
    }
    // Jump buttons also get a plain on/off switch in the Menu panel, next to Playback speed.
    function setupJumpMenuItem(){
      if (document.getElementById('ppxp-jump-menu-item')) return;
      const speedItem = document.querySelector('.menu-item-slot[data-slot="speed"]');
      const after = speedItem && speedItem.closest('.menu-item');
      if (!after) return;
      const item = document.createElement('div');
      item.className = 'menu-item'; item.id = 'ppxp-jump-menu-item';
      item.innerHTML =
        '<div class="menu-item-head"><div class="menu-item-title">' +
          '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/></svg>' +
          '<span>Jump buttons</span></div>' +
          '<label class="qb-toggle"><input type="checkbox" id="ppxp-jump-menu-cb"> Quick bar</label></div>';
      after.insertAdjacentElement('afterend', item);
      item.querySelector('#ppxp-jump-menu-cb').addEventListener('change', e => {
        if (e.target.checked){ perks.jumpSec = perks.jumpPrev > 0 ? perks.jumpPrev : 10; }
        else { if (perks.jumpSec > 0) perks.jumpPrev = perks.jumpSec; perks.jumpSec = 0; }
        savePerks(); refreshPerks();
      });
    }
    function setupPerksSection(){
      const pane = document.getElementById('sidebar-pane-settings');
      if (!pane || document.getElementById('ppxp-perks-section')) return;
      const sec = document.createElement('div');
      sec.className = 'settings-section';
      sec.id = 'ppxp-perks-section';
      sec.innerHTML =
        '<div class="settings-section-label">Level perks</div>' +
        '<div class="settings-row" data-perk="skip"><div class="settings-row-text">' +
          '<div class="settings-row-title">Skip intro <span id="ppxp-intro-val"></span></div>' +
          '<div class="settings-row-sub">Jump past the start of every track.</div></div>' +
          '<input type="range" id="ppxp-intro" min="0" max="60" step="5"></div>' +
        '<div class="settings-row" data-perk="skip" style="margin-top:12px;"><div class="settings-row-text">' +
          '<div class="settings-row-title">Skip outro <span id="ppxp-outro-val"></span></div>' +
          '<div class="settings-row-sub">Move on to the next track this long before the end.</div></div>' +
          '<input type="range" id="ppxp-outro" min="0" max="60" step="5"></div>' +
        '<div class="settings-row" data-perk="jump" style="margin-top:12px;"><div class="settings-row-text">' +
          '<div class="settings-row-title">Jump buttons</div>' +
          '<div class="settings-row-sub">Skip back and forward buttons next to Speed.</div></div>' +
          '<select id="ppxp-jump"><option value="0">Hidden</option><option value="5">5 s</option><option value="10">10 s</option><option value="15">15 s</option><option value="30">30 s</option></select></div>';
      pane.appendChild(sec);
      const intro = sec.querySelector('#ppxp-intro'), outro = sec.querySelector('#ppxp-outro'), jump = sec.querySelector('#ppxp-jump');
      intro.value = perks.introSec; outro.value = perks.outroSec; jump.value = String(perks.jumpSec);
      intro.addEventListener('input', () => { perks.introSec = parseInt(intro.value, 10) || 0; savePerks(); refreshPerks(); });
      outro.addEventListener('input', () => { perks.outroSec = parseInt(outro.value, 10) || 0; savePerks(); refreshPerks(); });
      jump.addEventListener('change', () => { perks.jumpSec = parseInt(jump.value, 10) || 0; if (perks.jumpSec > 0) perks.jumpPrev = perks.jumpSec; savePerks(); refreshPerks(); });
    }
    function refreshPerks(){
      const show = (el, on) => { if (el) el.style.display = on ? '' : 'none'; };
      show(document.getElementById('ppxp-quick-speed'), perkOn('speed'));
      show(document.getElementById('ppxp-quick-boost'), perkOn('boost'));
      const showJump = perkOn('jump') && perks.jumpSec > 0;
      const back = document.getElementById('ppxp-jump-back'), fwd = document.getElementById('ppxp-jump-fwd');
      show(back, showJump); show(fwd, showJump);
      setupJumpMenuItem();
      const jmItem = document.getElementById('ppxp-jump-menu-item'), jmCb = document.getElementById('ppxp-jump-menu-cb');
      show(jmItem, perkOn('jump'));
      if (jmCb) jmCb.checked = perks.jumpSec > 0;
      const jmSel = document.getElementById('ppxp-jump'); if (jmSel) jmSel.value = String(perks.jumpSec);
      if (back) back.firstChild.textContent = '\u21BA ' + perks.jumpSec + 's';
      if (fwd) fwd.firstChild.textContent = perks.jumpSec + 's \u21BB';
      const sec = document.getElementById('ppxp-perks-section');
      if (sec){
        const skipOn = perkOn('skip'), jumpOn = perkOn('jump');
        sec.querySelectorAll('[data-perk="skip"]').forEach(r => show(r, skipOn));
        sec.querySelectorAll('[data-perk="jump"]').forEach(r => show(r, jumpOn));
        show(sec, skipOn || jumpOn);
        const iv = sec.querySelector('#ppxp-intro-val'), ov = sec.querySelector('#ppxp-outro-val');
        if (iv) iv.textContent = perks.introSec > 0 ? perks.introSec + ' s' : 'Off';
        if (ov) ov.textContent = perks.outroSec > 0 ? perks.outroSec + ' s' : 'Off';
      }
      paintQuickSpeed(); paintQuickBoost();
    }

    // ---------- New setting: app-wide accent color (Level 15) ----------
    const ACCENT_KEY = 'ppxpAccentColorV1';
    function accentDarken(hex){
      const clean = hex.replace('#','');
      const full = clean.length === 3 ? clean.split('').map(c => c + c).join('') : clean;
      const n = parseInt(full, 16);
      const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
      return '#' + [r, g, b].map(v => Math.max(0, Math.round(v * 0.45)).toString(16).padStart(2, '0')).join('');
    }
    function applyAccentColor(color){
      if (color){
        document.documentElement.style.setProperty('--accent', color);
        document.documentElement.style.setProperty('--accent-dim', accentDarken(color));
      } else {
        document.documentElement.style.removeProperty('--accent');
        document.documentElement.style.removeProperty('--accent-dim');
      }
    }
    function ensureAccentColorSetting(){
      if (!isUnlocked(15)) return;
      if (document.getElementById('ppxp-accent-section')) return;
      const settingsPaneEl = document.getElementById('sidebar-pane-settings');
      if (!settingsPaneEl) return;
      const section = document.createElement('div');
      section.className = 'settings-section';
      section.id = 'ppxp-accent-section';
      section.innerHTML = `
        <div class="settings-row">
          <div class="settings-row-text">
            <div class="settings-row-title">Accent color</div>
            <div class="settings-row-sub">Unlocked at Pro Media Player (Lv 15) — recolor the whole app.</div>
          </div>
          <input type="color" id="ppxp-accent-input" class="customize-color-input" value="#6ee7d0">
        </div>
        <div class="settings-row" style="margin-top:10px;">
          <button class="settings-toggle-btn" id="ppxp-accent-reset-btn">Use default</button>
        </div>
      `;
      settingsPaneEl.appendChild(section);
      const input = section.querySelector('#ppxp-accent-input');
      const resetBtn = section.querySelector('#ppxp-accent-reset-btn');
      let saved = null;
      try { saved = localStorage.getItem(ACCENT_KEY); } catch(e){ /* ignore */ }
      if (saved){ input.value = saved; applyAccentColor(saved); }
      input.addEventListener('input', () => {
        applyAccentColor(input.value);
        try { localStorage.setItem(ACCENT_KEY, input.value); } catch(e){ /* ignore */ }
      });
      resetBtn.addEventListener('click', () => {
        input.value = '#6ee7d0';
        applyAccentColor(null);
        try { localStorage.removeItem(ACCENT_KEY); } catch(e){ /* ignore */ }
      });
    }
    function restoreAccentColorOnLoad(){
      try {
        const saved = localStorage.getItem(ACCENT_KEY);
        if (saved) applyAccentColor(saved);
      } catch(e){ /* ignore */ }
    }

    // ---------- "View your rank & rewards" modal ----------
    function buildRankModal(){
      const overlay = document.createElement('div');
      overlay.id = 'ppxp-rank-modal-overlay';
      overlay.innerHTML = `
        <div id="ppxp-rank-modal">
          <div id="ppxp-rank-modal-header">
            <h2>Rank</h2>
            <p>Levels come from time actually spent listening and watching. Skipped sections don't count. Each rank unlocks something new.</p>
          </div>
          <div id="ppxp-rank-modal-body"></div>
          <div id="ppxp-rank-modal-footer">
            <button class="sort-footer-btn" id="ppxp-rank-modal-close">Close</button>
          </div>
        </div>
      `;
      document.body.appendChild(overlay);
      const body = overlay.querySelector('#ppxp-rank-modal-body');
      const closeBtn = overlay.querySelector('#ppxp-rank-modal-close');
      function render(){
        const level = currentLevel();
        body.innerHTML = RANKS.map(r => {
          const achieved = level >= r.level;
          const isCurrent = rankForLevel(level).name === r.name;
          const rewards = rewardsAtLevel(r.level).concat(r.level === 1 ? [] : []);
          const rewardHtml = rewards.length
            ? '<div class="ppxp-rank-reward">' + rewards.map(x => x.desc).join(' ') + '</div>'
            : '';
          return `
            <div class="ppxp-rank-row ${achieved ? 'achieved' : 'locked'} ${isCurrent ? 'current' : ''}">
              <div class="ppxp-rank-badge">${achieved ? (r.level >= 500 ? '♾️' : (r.level >= 400 ? '💫' : (r.level >= 300 ? '🌟' : (r.level >= 160 ? '🌿' : (r.level >= 60 ? '👑' : '✓'))))) : '🔒'}</div>
              <div>
                <div class="ppxp-rank-name">${r.name}</div>
                <div class="ppxp-rank-level">Level ${r.level}${isCurrent ? ' — current rank' : ''}</div>
                ${rewardHtml}
              </div>
            </div>
          `;
        }).join('');
      }
      function open(){ render(); overlay.classList.add('open'); }
      function close(){ overlay.classList.remove('open'); }
      closeBtn.addEventListener('click', close);
      overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
      return { open };
    }

    // ---------- EXP shop modal ----------
    function formatMs(ms){
      if (ms <= 0) return '0s';
      const totalSec = Math.ceil(ms / 1000);
      const h = Math.floor(totalSec / 3600);
      const m = Math.floor((totalSec % 3600) / 60);
      const s = totalSec % 60;
      if (h > 0) return h + 'h ' + m + 'm';
      if (m > 0) return m + 'm ' + s + 's';
      return s + 's';
    }
    function formatMult(n){
      return (Math.round(n * 100) / 100).toString() + 'x';
    }

    function buildExpShopModal(){
      const overlay = document.createElement('div');
      overlay.id = 'ppxp-expshop-modal-overlay';
      overlay.innerHTML = `
        <div id="ppxp-expshop-modal">
          <div id="ppxp-expshop-modal-header">
            <h2>EXP shop</h2>
            <p>Spend grooves earned in the minigame on XP boosts.</p>
          </div>
          <div id="ppxp-expshop-status">
            <div class="ppxp-expshop-status-row"><span>Grooves</span><span id="ppxp-expshop-grooves-val">0</span></div>
            <div class="ppxp-expshop-status-row"><span>Current XP multiplier</span><span id="ppxp-expshop-mult-val">1x</span></div>
            <div class="ppxp-expshop-status-row"><span>Multiplier cap</span><span id="ppxp-expshop-cap-val">3x</span></div>
            <div class="ppxp-expshop-status-row"><span>Daily streak bonus</span><span id="ppxp-expshop-streak-val">-</span></div>
          </div>
          <div id="ppxp-expshop-sprint-status" style="display:none;"></div>
          <div id="ppxp-expshop-modal-body"></div>
          <div id="ppxp-expshop-modal-footer">
            <button class="sort-footer-btn" id="ppxp-expshop-modal-close">Close</button>
          </div>
        </div>
      `;
      document.body.appendChild(overlay);
      const body = overlay.querySelector('#ppxp-expshop-modal-body');
      const closeBtn = overlay.querySelector('#ppxp-expshop-modal-close');
      const groovesValEl = overlay.querySelector('#ppxp-expshop-grooves-val');
      const multValEl = overlay.querySelector('#ppxp-expshop-mult-val');
      const capValEl = overlay.querySelector('#ppxp-expshop-cap-val');
      const sprintStatusEl = overlay.querySelector('#ppxp-expshop-sprint-status');

      const fmt = (n) => (window.PPXpGrooves ? window.PPXpGrooves.formatNum(n) : Math.round(n).toString());

      function itemRow(item, sub, buyLabel, disabled, onBuy){
        const row = document.createElement('div');
        row.className = 'ppxp-expshop-item';
        row.innerHTML = `
          <div class="ppxp-expshop-item-info">
            <div class="ppxp-expshop-item-name">${item.name}</div>
            <div class="ppxp-expshop-item-sub">${item.description}</div>
            <div class="ppxp-expshop-item-sub">${sub}</div>
          </div>
          <button class="ppxp-expshop-buy-btn" type="button">${buyLabel}</button>
        `;
        const btn = row.querySelector('button');
        btn.disabled = disabled;
        btn.addEventListener('click', onBuy);
        body.appendChild(row);
      }

      function render(){
        processSprintDrain();
        const grooves = window.PPXpGrooves ? window.PPXpGrooves.getGrooves() : 0;
        groovesValEl.textContent = fmt(grooves);
        multValEl.textContent = formatMult(effectiveXpMultiplier());
        capValEl.textContent = expMultiplierCap() + 'x';
        const streakValEl = overlay.querySelector('#ppxp-expshop-streak-val');
        if (streakValEl) streakValEl.textContent = state.streak.count ? ('🔥 ' + state.streak.count + ' days (+' + Math.round((streakMultiplier() - 1) * 100) + '%)') : 'Play today to start';

        if (isSprintActive()){
          const payoffCap = state.sprint.initialCost * SPRINT_PAYOFF_MULT;
          const nextDrainAt = state.sprint.startedAt + (state.sprint.hoursProcessed + 1) * SPRINT_HOUR_MS;
          sprintStatusEl.style.display = '';
          sprintStatusEl.innerHTML = `
            <div class="ppxp-sprint-title">⚠ Sprint active - ${formatMult(state.sprint.mult)} XP</div>
            <div class="ppxp-expshop-status-row"><span>Drained so far</span><span>${fmt(state.sprint.totalDrained)} / ${fmt(payoffCap)}</span></div>
            <div class="ppxp-expshop-status-row"><span>Next drain in</span><span>${formatMs(nextDrainAt - Date.now())}</span></div>
            <button id="ppxp-expshop-sprint-cancel-btn" type="button">Cancel sprint</button>
          `;
          sprintStatusEl.querySelector('#ppxp-expshop-sprint-cancel-btn').addEventListener('click', () => {
            cancelSprint();
            render();
            if (typeof showToast === 'function') showToast('Sprint cancelled.');
          });
        } else {
          sprintStatusEl.style.display = 'none';
          sprintStatusEl.innerHTML = '';
        }

        body.innerHTML = '';

        const sprintLabel = document.createElement('div');
        sprintLabel.className = 'ppxp-expshop-section-label';
        sprintLabel.textContent = 'Sprint upgrades';
        body.appendChild(sprintLabel);
        const sprintActive = isSprintActive();
        SPRINT_ITEMS.forEach(item => {
          const affordable = grooves >= item.cost;
          const isThisOne = state.sprint.activeId === item.id;
          let sub = 'Cost: ' + fmt(item.cost) + ' grooves. Drains grooves every hour, 40% more each hour, ' +
            'and ends when grooves run out or the total paid reaches ' + SPRINT_PAYOFF_MULT + 'x the up-front cost.';
          let label = 'Activate';
          let disabled = !affordable;
          if (isThisOne){ label = 'Active'; disabled = true; sub = 'This sprint is currently active.'; }
          else if (sprintActive){ label = 'Cancel active first'; disabled = true; }
          itemRow(item, sub, label, disabled, () => {
            const result = activateSprint(item);
            if (result === true) render();
            else if (result === 'active'){
              if (typeof showToast === 'function') showToast('Cancel the active sprint before starting another.');
            } else if (typeof showToast === 'function') showToast('Not enough grooves for "' + item.name + '".');
          });
        });

        const tempLabel = document.createElement('div');
        tempLabel.className = 'ppxp-expshop-section-label';
        tempLabel.textContent = 'Temporary boosts';
        body.appendChild(tempLabel);
        const tempActive = state.expMods.tempEndsAt && Date.now() < state.expMods.tempEndsAt;
        TEMP_EXP_ITEMS.forEach(item => {
          const affordable = grooves >= item.cost;
          const sub = 'Cost: ' + fmt(item.cost) + ' grooves.' +
            (tempActive ? ' Stacks with the time remaining on the active boost.' : '');
          itemRow(item, sub, 'Activate', !affordable, () => {
            const ok = buyTempExpItem(item);
            if (ok) render();
            else if (typeof showToast === 'function') showToast('Not enough grooves for "' + item.name + '".');
          });
        });

        const instantLabel = document.createElement('div');
        instantLabel.className = 'ppxp-expshop-section-label';
        instantLabel.textContent = 'Instant level ups';
        body.appendChild(instantLabel);
        INSTANT_LEVEL_ITEMS.forEach(item => {
          const readyAt = state.instantCooldowns[item.id] || 0;
          const onCooldown = Date.now() < readyAt;
          const affordable = grooves >= item.cost;
          const sub = onCooldown
            ? 'Ready in ' + formatMs(readyAt - Date.now()) + '.'
            : 'Cost: ' + fmt(item.cost) + ' grooves. Cooldown: ' + formatMs(item.cooldownMs) + '.';
          itemRow(item, sub, onCooldown ? 'On cooldown' : 'Use', onCooldown || !affordable, () => {
            const result = buyInstantLevelItem(item);
            if (result === true) render();
            else if (result === 'cooldown'){
              if (typeof showToast === 'function') showToast('"' + item.name + '" is still on cooldown.');
            } else if (typeof showToast === 'function') showToast('Not enough grooves for "' + item.name + '".');
          });
        });
      }

      let tickInterval = null;
      function open(){
        render();
        overlay.classList.add('open');
        if (tickInterval) clearInterval(tickInterval);
        tickInterval = setInterval(render, 1000);
      }
      function close(){
        overlay.classList.remove('open');
        if (tickInterval){ clearInterval(tickInterval); tickInterval = null; }
      }
      closeBtn.addEventListener('click', close);
      overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
      return { open };
    }

    // Inserted directly after the level bar (rather than appended to the
    // bottom of the settings pane like the other reward sections below),
    // since it's meant to sit right below it.
    function setupExpShopEntry(){
      const badgeSlotEl = document.getElementById('ppxp-badge-slot');
      if (!badgeSlotEl || document.getElementById('ppxp-expshop-entry-section')) return;
      const modal = buildExpShopModal();
      const section = document.createElement('div');
      section.className = 'settings-section';
      section.id = 'ppxp-expshop-entry-section';
      section.innerHTML = `
        <div class="settings-row" id="ppxp-expshop-open-row">
          <div class="settings-row-text">
            <div class="settings-row-title">EXP shop</div>
            <div class="settings-row-sub">Spend grooves from the minigame on XP boosts and instant level ups.</div>
          </div>
        </div>
      `;
      badgeSlotEl.insertAdjacentElement('afterend', section);
      section.querySelector('#ppxp-expshop-open-row').addEventListener('click', modal.open);
    }

