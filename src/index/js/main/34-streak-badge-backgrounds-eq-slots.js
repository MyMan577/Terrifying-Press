    // ---------- Streak (rewards showing up) ----------
    // Compounding: XP multiplier = 1.08 ^ streak days, capped at 5x (reached
    // around day 21). Miss ONE day and the streak survives (grace day); miss
    // more and it drops by 1 for the first day past grace, plus 1 more for each
    // further missed day (never below 1). First listen each day also
    // pays a bonus worth 10 minutes of XP that compounds 15% per streak day
    // (max 120 min), doubled on every 7th day.
    const STREAK_GROWTH = 1.08, STREAK_MULT_MAX = 5;
    const STREAK_DAILY_GROWTH = 1.15, STREAK_DAILY_MAX_MIN = 120;
    function localDayNumber(){ const d = new Date(); return Math.floor((d.getTime() - d.getTimezoneOffset() * 60000) / 86400000); }
    function streakMultiplier(){
      const st = state.streak;
      if (!st.count) return 1;
      return Math.min(STREAK_MULT_MAX, Math.pow(STREAK_GROWTH, st.count));
    }
    function touchStreak(){
      const st = state.streak, today = localDayNumber();
      if (st.lastDay === today) return 0;
      const gap = st.lastDay ? today - st.lastDay : 0;
      if (!st.lastDay) st.count = 1;
      else if (gap <= 2) st.count += 1;                  // next day, or one missed day (grace)
      else st.count = Math.max(1, st.count - (gap - 2));   // longer break: lose 1 for the first day past grace, +1 more for each further missed day
      st.lastDay = today;
      st.best = Math.max(st.best || 0, st.count);
      let bonus = 0;
      if (st.bonusDay !== today){
        st.bonusDay = today;
        bonus = Math.round(XP_PER_MINUTE * Math.min(STREAK_DAILY_MAX_MIN, 10 * Math.pow(STREAK_DAILY_GROWTH, st.count - 1)) * (st.count % 7 === 0 ? 2 : 1));
      }
      markDirty();
      if (typeof showToast === 'function'){
        showToast('🔥 ' + st.count + '-day streak! +' + Math.round((streakMultiplier() - 1) * 100) + '% XP' +
          (bonus ? ' and a +' + bonus + ' XP daily bonus' : ''));
      }
      return bonus;
    }

    function recordWatchTime(ms){
      if (!isFinite(ms) || ms <= 0) return;
      const dailyBonus = touchStreak();
      state.xpPending = (state.xpPending || 0) + (ms / 60000) * XP_PER_MINUTE * effectiveXpMultiplier() * streakMultiplier() + dailyBonus;
      markDirty();
      if (state.xpPending < 3) return;
      const amount = Math.floor(state.xpPending);
      state.xpPending -= amount;
      const before = levelInfo(state.xp).level;
      state.xp += amount;
      const after = levelInfo(state.xp).level;
      renderBadge(amount, after > before);
      if (after > before) handleLevelUp(before, after);
    }
    window.PPXpApi = {
      recordCompletion,
      recordWatchTime,
      getLevel: currentLevel,
      getStreak: () => ({ days: state.streak.count, best: state.streak.best, multiplier: streakMultiplier() }),
      getRank: () => rankForLevel(currentLevel()),
      isUnlocked,
      refreshUnlocks: () => refreshAllUnlockUI(),
      // ---- rewards bought with Press Play Points (Games > Shop) ----
      shopLevelPct: (pct) => {
        const before = levelInfo(state.xp).level, info = levelInfo(state.xp);
        const amount = Math.max(1, Math.round(info.xpForNext * pct));
        state.xp += amount;
        markDirty(); saveState();
        const after = levelInfo(state.xp).level;
        renderBadge(amount, after > before);
        if (after > before) handleLevelUp(before, after);
        return amount;
      },
      shopTempBoost: (mult, ms) => {
        const now = Date.now(), still = state.expMods.tempEndsAt && now < state.expMods.tempEndsAt;
        state.expMods.tempMult = still ? Math.max(state.expMods.tempMult || 1, mult) : mult;
        state.expMods.tempEndsAt = (still ? state.expMods.tempEndsAt : now) + ms;
        markDirty(); saveState();
        return true;
      },
      shopLocked: () => ({
        bg: BG_PRESETS.filter(p => !p.pg && !presetUnlocked(p)).sort((a, b) => (a.unlock ? 1e4 : a.level) - (b.unlock ? 1e4 : b.level))
          .map(p => ({ id: p.id, name: p.name, level: p.level, marathon: p.unlock === 'marathon', c1: p.color1, c2: p.color2, angle: p.angle })),
        eq: Object.keys(EQ_PRO_PRESETS).filter(k => !EQ_PRO_PRESETS[k].pg && !eqProUnlocked(k)).sort((a, b) => EQ_PRO_PRESETS[a].level - EQ_PRO_PRESETS[b].level)
          .map(k => ({ id: k, name: EQ_PRO_PRESETS[k].label, level: EQ_PRO_PRESETS[k].level }))
      }),
      shopUnlock: (kind, id) => {
        if ((kind === 'bg' && !BG_PRESETS.some(p => p.id === id)) || (kind === 'eq' && !EQ_PRO_PRESETS[id])) return false;
        const u = shopUnlocks();
        if (!u[kind] || u[kind].indexOf(id) >= 0) return false;
        u[kind].push(id);
        try { localStorage.setItem(SHOP_UNLOCK_KEY, JSON.stringify(u)); } catch(e){ return false; }
        refreshAllUnlockUI();
        return true;
      },
      flush: () => { if (dirty) saveState(); }
    };

    function handleLevelUp(before, after){
      const beforeRank = rankForLevel(before), afterRank = rankForLevel(after);
      const newRewards = REWARDS.filter(r => r.level > before && r.level <= after);
      if (typeof showToast === 'function'){
        if (afterRank.name !== beforeRank.name){
          showToast('🎉 Rank up! New rank: "' + afterRank.name + '" (Lv ' + after + ')' +
            (newRewards.length ? ' — ' + newRewards.map(r => r.desc).join(' ') : ''));
        } else if (newRewards.length){
          showToast('🎉 Level ' + after + ' — ' + newRewards.map(r => r.desc).join(' '));
        }
      }
      refreshAllUnlockUI();
    }

    // Re-checks every locked-until-level UI element. Called once at load
    // and again after every level-up so a session that levels up mid-play
    // immediately shows the new options, without needing a reload.
    function refreshAllUnlockUI(){
      refreshBgPresetLocks();
      refreshEqProLocks();
      refreshEqBandLocks();
      renderEqCustom();
      refreshPerks();
      ensureAccentColorSetting();
      refreshBadgeRankTier();
    }

    // ---------- Badge UI ----------
    // Lives in its own slot in the sidebar (below "Press Play Media", above
    // the Playlist/Settings tabs) rather than tucked into now-playing, so
    // it stays visible and prominent no matter what's playing.
    const badgeSlot = document.getElementById('ppxp-badge-slot');
    let badge = null, fillEl = null, textEl = null, gainEl = null, rankEl = null;
    if (badgeSlot){
      const style = document.createElement('style');
      style.textContent = `
        #ppxp-badge{
          display:flex; align-items:center; gap:7px;
          position:relative; flex-wrap:wrap;
        }
        #ppxp-badge-track{
          flex:1; height:4px; border-radius:2px;
          background:var(--line, #232429); overflow:hidden;
        }
        #ppxp-badge-fill{
          height:100%; width:0%; border-radius:2px;
          background:var(--accent, #6ee7d0);
          transition:width .4s ease;
        }
        #ppxp-badge-text{
          font-size:10.5px; color:var(--text-dim, #8b8c93);
          white-space:nowrap; letter-spacing:.2px;
        }
        #ppxp-gain{
          position:absolute; right:0; top:-4px;
          font-size:11px; font-weight:600; color:var(--accent, #6ee7d0);
          opacity:0; transform:translateY(0);
          transition:opacity .3s ease, transform .3s ease;
          pointer-events:none;
        }
        #ppxp-gain.show{ opacity:1; transform:translateY(-6px); }
      `;
      badgeSlot.appendChild(style);
      badge = document.createElement('div');
      badge.id = 'ppxp-badge';
      badge.innerHTML = `
        <div id="ppxp-badge-track"><div id="ppxp-badge-fill"></div></div>
        <div id="ppxp-badge-text">Lv 1</div>
        <div id="ppxp-badge-rank" style="width:100%;"></div>
        <div id="ppxp-gain">+0 XP</div>
      `;
      badgeSlot.appendChild(badge);
      fillEl = badge.querySelector('#ppxp-badge-fill');
      textEl = badge.querySelector('#ppxp-badge-text');
      gainEl = badge.querySelector('#ppxp-gain');
      rankEl = badge.querySelector('#ppxp-badge-rank');
    }

    function refreshBadgeRankTier(){
      if (!badge || !rankEl) return;
      const level = currentLevel();
      const rank = rankForLevel(level);
      const isMonarch = level >= 60;
      const isCaesar = level >= 160;
      const icon = level >= 500 ? '♾️' : (level >= 400 ? '💫' : (level >= 300 ? '🌟' : (isCaesar ? '🌿' : (isMonarch ? '👑' : ''))));
      rankEl.innerHTML = (icon ? '<span class="ppxp-crown">' + icon + '</span>' : '') + rank.name;
      badge.classList.toggle('ppxp-legend', level >= 45);
      badge.classList.toggle('ppxp-caesar', isCaesar && level < 215);
      badge.classList.toggle('ppxp-platinum', level >= 215 && level < 300);
      badge.classList.toggle('ppxp-immortal', level >= 300 && level < 400);
      badge.classList.toggle('ppxp-celestial', level >= 400 && level < 500);
      badge.classList.toggle('ppxp-eternal', level >= 500);
    }

    let gainTimeout = null;
    function renderBadge(gain, leveledUp){
      const info = levelInfo(state.xp);
      if (fillEl) fillEl.style.width = Math.min(100, Math.round((info.xpIntoLevel / info.xpForNext) * 100)) + '%';
      if (textEl) textEl.textContent = 'Lv ' + info.level + (leveledUp ? ' - Level up' : '');
      refreshBadgeRankTier();
      if (gain > 0 && gainEl){
        gainEl.textContent = '+' + gain + ' XP';
        gainEl.classList.add('show');
        if (gainTimeout) clearTimeout(gainTimeout);
        gainTimeout = setTimeout(() => gainEl.classList.remove('show'), 1600);
      }
      if (leveledUp && textEl){
        setTimeout(() => { textEl.textContent = 'Lv ' + info.level; }, 2200);
      }
    }

    // ---------- Unlockable backgrounds (Customize appearance modal) ----------
    // Injected as a swatch grid above the existing Default/Color/Gradient/
    // Image row so the stock customization options are untouched; picking
    // an unlocked swatch just writes the same uiCustomization shape those
    // options already produce.
    let bgPresetGrid = null;
    function setupBgPresets(){
      const typeRow = document.querySelector('.customize-type-row');
      if (!typeRow || document.getElementById('ppxp-bg-presets')) return;
      const wrap = document.createElement('div');
      wrap.id = 'ppxp-bg-presets';
      wrap.innerHTML = '<p class="ppxp-bg-presets-label">Unlockable presets (level up to earn more)</p>' +
        '<div class="ppxp-bg-presets-grid"></div>';
      typeRow.parentNode.insertBefore(wrap, typeRow);
      bgPresetGrid = wrap.querySelector('.ppxp-bg-presets-grid');
      BG_PRESETS.forEach(p => {
        const sw = document.createElement('button');
        sw.type = 'button';
        sw.className = 'ppxp-bg-swatch';
        sw.dataset.presetId = p.id;
        if (p.pg) sw.dataset.pg = '1';
        sw.title = p.unlock === 'marathon' ? p.name + ' (The Marathon, 80%)' : p.name + ' (Level ' + p.level + ')';
        sw.style.backgroundImage = `linear-gradient(135deg, ${p.color1}, ${p.color2})`;
        sw.innerHTML = '<span class="ppxp-bg-swatch-lock">🔒</span><span class="ppxp-bg-swatch-name">' + p.name + '</span>';
        sw.addEventListener('click', () => {
          if (!presetUnlocked(p)){
            if (typeof showToast === 'function') showToast(p.unlock === 'marathon' ? '🔒 "' + p.name + '" unlocks by scoring 80% on The Marathon (Settings)' : '🔒 "' + p.name + '" unlocks at Level ' + p.level);
            return;
          }
          const api = window.PPXpCustomization;
          if (!api){
            if (typeof showToast === 'function') showToast('⚠️ Could not apply background - customization system unavailable.');
            return;
          }
          const target = api.getActiveTab() || 'app';
          api.uiCustomization[target] = { type: p.type, color1: p.color1, color2: p.color2, angle: p.angle };
          api.saveCustomization();
          api.applyAllCustomization();
          api.refreshCustomizeControls();
        });
        bgPresetGrid.appendChild(sw);
      });
      refreshBgPresetLocks();
    }
    function refreshBgPresetLocks(){
      if (!bgPresetGrid) return;
      bgPresetGrid.querySelectorAll('.ppxp-bg-swatch').forEach(sw => {
        const preset = BG_PRESETS.find(x => x.id === sw.dataset.presetId);
        if (preset) sw.classList.toggle('locked', !presetUnlocked(preset));
      });
    }

    // ---------- Expanded equalizer (pro presets + extra bands) ----------
    function setupEqPro(){
      const eq = window.PPXpEq;
      if (!eq || !eq.presetRow || document.getElementById('ppxp-eq-pro-added')) return;
      const eqPresetRow = eq.presetRow;
      const marker = document.createElement('span');
      marker.id = 'ppxp-eq-pro-added';
      marker.style.display = 'none';
      eqPresetRow.appendChild(marker);
      Object.keys(EQ_PRO_PRESETS).forEach(key => {
        const cfg = EQ_PRO_PRESETS[key];
        const btn = document.createElement('button');
        btn.dataset.eqPreset = key;
        btn.dataset.reqLevel = String(cfg.level);
        btn.className = 'ppxp-eq-pro-btn';
        if (cfg.pg) btn.dataset.pg = '1';
        btn.innerHTML = '<span class="ppxp-lock">🔒</span>' + cfg.label;
        btn.addEventListener('click', () => {
          if (!eqProUnlocked(key)){
            if (typeof showToast === 'function') showToast('🔒 "' + cfg.label + '" EQ preset unlocks at Level ' + cfg.level);
            return;
          }
          eq.setGains(cfg.gains);
          eq.refreshSlidersUI();
          eq.updatePresetHighlight();
          if (!eq.isEnabled()) eq.enable();
          else eq.applyAll();
          eq.commitState();
        });
        eqPresetRow.appendChild(btn);
      });
      refreshEqProLocks();
    }
    function refreshEqProLocks(){
      const eq = window.PPXpEq;
      if (!eq || !eq.presetRow) return;
      eq.presetRow.querySelectorAll('.ppxp-eq-pro-btn').forEach(btn => {
        btn.classList.toggle('locked', !eqProUnlocked(btn.dataset.eqPreset));
      });
    }
    // Reveals the two extra bands (500Hz, 6K) once unlocked, instead of
    // widening the dB range of the existing bands - changing min/max on
    // sliders that already hold preset values visually shifted every
    // preset's thumb position (and their look on the slider track) even
    // though the underlying gain never changed, which made presets look
    // "broken" right as they unlocked. Bands the graph already has (see
    // EQ_BANDS) just get shown, so no preset or slider value moves.
    function refreshEqBandLocks(){
      const eq = window.PPXpEq;
      if (!eq || !eq.bandWraps || !eq.bandWraps.length) return;
      const unlocked = isUnlocked(6) || plusOn();
      eq.bandWraps.forEach((wrap, i) => {
        if (eq.bands[i] && eq.bands[i].pro){
          wrap.classList.toggle('unlocked', unlocked);
        }
      });
    }

    // ---------- Custom EQ slots (Level 320+) ----------
    // Lets you save your own equalizer curves and recall them with one tap.
    // 5 slots, unlocking one at a time as you climb (levels below). Works only through the
    // same PPXpEq bridge the built-in presets use, so it never touches the audio chain.
    const EQ_CUSTOM_KEY = 'ppxpEqCustomV1';
    const EQ_CUSTOM_SLOT_LEVELS = [320, 360, 400, 450, 500];
    function loadEqCustom(){
      try {
        const arr = JSON.parse(localStorage.getItem(EQ_CUSTOM_KEY));
        if (Array.isArray(arr)){
          return EQ_CUSTOM_SLOT_LEVELS.map((_, i) => {
            const v = arr[i];
            const ok = v && typeof v.name === 'string' && Array.isArray(v.gains) &&
              v.gains.every(g => typeof g === 'number' && isFinite(g) && g >= -12 && g <= 12);
            return ok ? { name: v.name.slice(0, 16), gains: window.__ppEqNorm(v.gains) } : null;
          });
        }
      } catch(e){ /* ignore */ }
      return EQ_CUSTOM_SLOT_LEVELS.map(() => null);
    }
    function saveEqCustom(){
      try { localStorage.setItem(EQ_CUSTOM_KEY, JSON.stringify(eqCustom)); } catch(e){ /* storage full */ }
    }
    let eqCustom = loadEqCustom();
    let eqCustomEditing = false;
    let eqCustomWrap = null;
    function eqcToast(msg){ if (typeof showToast === 'function') showToast(msg); }
    function eqcCurrentGains(){
      const eq = window.PPXpEq;
      return eq.sliders.map(sl => parseFloat(sl.value) || 0);
    }
    function eqcSave(i){
      const eq = window.PPXpEq;
      if (!eq || !eq.sliders || !eq.sliders.length) return;
      const name = eqCustom[i] ? eqCustom[i].name : 'Custom ' + (i + 1);
      eqCustom[i] = { name, gains: eqcCurrentGains() };
      saveEqCustom();
      eqcToast('💾 Saved current EQ to "' + name + '"');
      renderEqCustom();
    }
    function eqcApply(i){
      const eq = window.PPXpEq, slot = eqCustom[i];
      if (!eq || !slot) return;
      if (slot.gains.length !== eq.bands.length){
        eqcToast('⚠️ That preset was saved for a different EQ layout.');
        return;
      }
      eq.setGains(slot.gains);
      eq.refreshSlidersUI();
      eq.updatePresetHighlight();
      if (!eq.isEnabled()) eq.enable(); else eq.applyAll();
      eq.commitState();
      eqcToast('🎚️ ' + slot.name);
    }
    function eqcRename(i){
      if (!eqCustom[i]) return;
      let n = null;
      try { n = window.prompt('Name this preset', eqCustom[i].name); } catch(e){ /* prompt blocked */ }
      if (n && n.trim()){
        eqCustom[i].name = n.trim().slice(0, 16);
        saveEqCustom();
        renderEqCustom();
      }
    }
    function eqcDelete(i){
      eqCustom[i] = null;
      saveEqCustom();
      renderEqCustom();
    }
    function eqcBtn(cls, text, onClick, title){
      const b = document.createElement('button');
      b.type = 'button'; b.className = cls; b.textContent = text;
      if (title) b.title = title;
      b.addEventListener('click', onClick);
      return b;
    }
    function renderEqCustom(){
      if (!eqCustomWrap || !window.PPXpEq) return;
      const level = plusOn() ? EQ_CUSTOM_SLOT_LEVELS[EQ_CUSTOM_SLOT_LEVELS.length - 1] : currentLevel();
      if (level < EQ_CUSTOM_SLOT_LEVELS[0]){ eqCustomWrap.style.display = 'none'; return; }
      eqCustomWrap.style.display = '';
      eqCustomWrap.textContent = '';
      const head = document.createElement('div');
      head.className = 'ppxp-eqc-head';
      const lab = document.createElement('span');
      lab.textContent = eqCustomEditing ? 'My presets: tap a slot to overwrite it' : 'My presets';
      head.appendChild(lab);
      head.appendChild(eqcBtn('ppxp-eqc-edit' + (eqCustomEditing ? ' on' : ''), eqCustomEditing ? 'Done' : 'Edit', () => {
        eqCustomEditing = !eqCustomEditing; renderEqCustom();
      }));
      eqCustomWrap.appendChild(head);
      const grid = document.createElement('div');
      grid.className = 'ppxp-eqc-grid';
      EQ_CUSTOM_SLOT_LEVELS.forEach((req, i) => {
        const slot = document.createElement('div');
        slot.className = 'ppxp-eqc-slot';
        const saved = eqCustom[i];
        if (level < req){
          slot.appendChild(eqcBtn('ppxp-eqc-main locked', '🔒 Lv ' + req, () => eqcToast('🔒 This slot unlocks at Level ' + req)));
        } else if (!saved){
          slot.appendChild(eqcBtn('ppxp-eqc-main empty', '+ Save here', () => eqcSave(i), 'Save the current EQ here'));
        } else {
          slot.appendChild(eqcBtn('ppxp-eqc-main', saved.name, () => { if (eqCustomEditing) eqcSave(i); else eqcApply(i); }, saved.name));
          if (eqCustomEditing){
            slot.appendChild(eqcBtn('ppxp-eqc-mini', '✎', () => eqcRename(i), 'Rename'));
            slot.appendChild(eqcBtn('ppxp-eqc-mini', '✕', () => eqcDelete(i), 'Delete'));
          }
        }
        grid.appendChild(slot);
      });
      eqCustomWrap.appendChild(grid);
    }
    function setupEqCustom(){
      const eq = window.PPXpEq;
      if (!eq || !eq.presetRow || document.getElementById('ppxp-eq-custom')) return;
      eqCustomWrap = document.createElement('div');
      eqCustomWrap.id = 'ppxp-eq-custom';
      eq.presetRow.parentNode.insertBefore(eqCustomWrap, eq.presetRow.nextSibling);
      renderEqCustom();
    }

