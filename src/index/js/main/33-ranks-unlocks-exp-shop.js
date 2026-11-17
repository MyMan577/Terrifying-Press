    // ---------- Ranks ----------
    // Every title works in "Press", "Play", and/or "Media" so the whole
    // ladder reads as one idea from bottom to top. Thresholds land on the
    // level curve above so early ranks come quickly and later ones take a
    // real investment of listening time.
    const RANKS = [
      { level: 1,  name: 'New Presser' },
      { level: 3,  name: 'Casual Player' },
      { level: 6,  name: 'Experienced Player' },
      { level: 10, name: 'Media Enthusiast' },
      { level: 15, name: 'Pro Media Player' },
      { level: 21, name: 'Media Virtuoso' },
      { level: 28, name: 'Press Play Elite' },
      { level: 36, name: 'Media Maestro' },
      { level: 45, name: 'Press Play Legend' },
      { level: 60, name: "Press Play's Media Monarch" },
      { level: 75,  name: 'Regent of the Realm' },
      { level: 90,  name: 'Grand Duke of Media' },
      { level: 105, name: 'Sovereign of Sound' },
      { level: 120, name: "Press Play's Emperor" },
      { level: 140, name: 'Warlord of the Waves' },
      { level: 160, name: "Press Play Media's Caesar" },
      { level: 175, name: 'Archon of the Airwaves' },
      { level: 195, name: 'Press Play Pharaoh' },
      { level: 215, name: 'Maestro of Millennia' },
      { level: 235, name: 'Celestial Conductor' },
      { level: 255, name: 'Media Demigod' },
      { level: 275, name: 'Press Play Titan' },
      { level: 290, name: 'Eternal Encore' },
      { level: 300, name: "Press Play Media's Immortal" },
      { level: 320, name: 'Ascendant of the Airwaves' },
      { level: 340, name: 'Keeper of the Crescendo' },
      { level: 360, name: 'Sovereign of the Spectrum' },
      { level: 380, name: 'Press Play Paragon' },
      { level: 400, name: 'Grandmaster of Groove' },
      { level: 425, name: 'Archmage of Audio' },
      { level: 450, name: 'Oracle of Overtones' },
      { level: 475, name: 'Mythic Maestro' },
      { level: 500, name: "Press Play Media's Eternal" }
    ];
    function rankForLevel(level){
      let current = RANKS[0];
      for (const r of RANKS){ if (level >= r.level) current = r; else break; }
      return current;
    }
    function nextRank(level){
      return RANKS.find(r => r.level > level) || null;
    }

    // ---------- Cosmetic unlocks ----------
    // Nothing here touches how the player sounds by default or what anyone
    // starts with - it only ever adds optional extras once a level is
    // reached. `desc` is shown in the rank-up toast and the rank list.
    const REWARDS = [
      { level: 3,  desc: 'New backgrounds: Deep Space & Sunset Groove.' },
      { level: 6,  desc: 'Expanded equalizer: Symphonic & Basshead Pro presets, plus two extra EQ bands (500Hz & 6K).' },
      { level: 10, desc: 'New backgrounds: Neon Wave & Aurora Drift.' },
      { level: 15, desc: 'New setting: pick a custom app-wide accent color.' },
      { level: 21, desc: 'New backgrounds: Midnight Amber & Retro Grid, plus Cinematic & Crystal Air EQ presets.' },
      { level: 28, desc: 'New background type: slow animated gradients.' },
      { level: 36, desc: 'New backgrounds: Royal Purple & Golden Hour.' },
      { level: 45, desc: 'The level badge now glows with a legendary gold finish.' },
      { level: 60, desc: 'The crown: an exclusive Monarch\u2019s Gold background and a crowned badge.' },
      { level: 75,  desc: 'New backgrounds: Emerald Canopy & Desert Mirage.' },
      { level: 90,  desc: 'New EQ presets: Warm Vinyl & Stadium Live.' },
      { level: 105, desc: 'New backgrounds: Harvest Fields & Stormy Coast.' },
      { level: 120, desc: 'New backgrounds: Autumn Ember & Frontier Bronze.' },
      { level: 140, desc: 'New EQ preset: Caesar\u2019s Laurel, and the badge picks up a bronze finish.' },
      { level: 160, desc: 'A grand milestone: an exclusive Imperial Marble background and a laurelled badge for Press Play Media\u2019s Caesar.' },
      { level: 175, desc: 'New backgrounds: Nebula Bloom & Obsidian Tide.' },
      { level: 195, desc: 'New backgrounds: Sandstone Sun & Nile Teal, plus the Pharaoh\u2019s Pulse EQ preset.' },
      { level: 215, desc: 'New EQ presets: Concert Hall & Deep Resonance, and the badge picks up a platinum finish.' },
      { level: 235, desc: 'New backgrounds: Celestial Dusk & Starlit Indigo.' },
      { level: 255, desc: 'New EQ presets: Titan Bass & Silk Highs.' },
      { level: 275, desc: 'New backgrounds: Titan Steel & Molten Core.' },
      { level: 290, desc: 'New EQ preset: Eternal Encore.' },
      { level: 300, desc: 'An exclusive Immortal Prism animated background and a star-crowned, rainbow-finish badge for Press Play Media\u2019s Immortal.' },
      { level: 320, desc: 'Custom EQ presets: save custom equalizer curves (1 slot), plus the Crimson Eclipse background.' },
      { level: 340, desc: 'Quick speed buttons in the speed menu and the Crescendo EQ preset.' },
      { level: 360, desc: 'Skip intro & outro: automatically skip the start and end of every track (Settings > Level perks). A second custom EQ slot and the Arctic Night background.' },
      { level: 380, desc: 'Jump buttons: skip back and forward by 5, 10, 15 or 30 seconds with buttons right by Speed.' },
      { level: 400, desc: 'A third custom EQ slot, the Club Floor EQ preset, an exclusive Solar Flare animated background and a celestial badge finish.' },
      { level: 425, desc: 'Quick boost buttons in the volume booster, plus the Twilight Orchid background.' },
      { level: 450, desc: 'A fourth custom EQ slot and the Cyber Dawn animated background.' },
      { level: 475, desc: 'The Mythic Mix EQ preset.' },
      { level: 500, desc: 'The summit: the fifth and final custom EQ slot, the Eternal Reference EQ preset, an exclusive Eternal Aurora animated background and a flowing, rainbow eternal badge finish for Press Play Media\u2019s Eternal.' }
    ];
    function rewardsAtLevel(level){ return REWARDS.filter(r => r.level === level); }
    function rewardsUpTo(level){ return REWARDS.filter(r => r.level <= level); }

    const BG_PRESETS = [
      { id:'deep-space',     name:'Deep Space',      level:3,  type:'gradient', color1:'#0c0d10', color2:'#1b1440', angle:135 },
      { id:'sunset-groove',  name:'Sunset Groove',   level:3,  type:'gradient', color1:'#2b0f1a', color2:'#6e3a1f', angle:120 },
      { id:'neon-wave',      name:'Neon Wave',       level:10, type:'gradient', color1:'#0c0d10', color2:'#0f3d3a', angle:150 },
      { id:'aurora-drift',   name:'Aurora Drift',    level:10, type:'gradient', color1:'#0a1f1c', color2:'#123a52', angle:160 },
      { id:'midnight-amber', name:'Midnight Amber',  level:21, type:'gradient', color1:'#1a1305', color2:'#3d2a0a', angle:145 },
      { id:'retro-grid',     name:'Retro Grid',      level:21, type:'gradient', color1:'#150a24', color2:'#3a0f4d', angle:110 },
      { id:'aurora-pulse',   name:'Aurora Pulse',    level:28, type:'animated', color1:'#08131a', color2:'#0f4d3a', angle:135 },
      { id:'royal-purple',   name:'Royal Purple',    level:36, type:'gradient', color1:'#120a24', color2:'#4b1580', angle:135 },
      { id:'golden-hour',    name:'Golden Hour',     level:36, type:'gradient', color1:'#1a1005', color2:'#6b4210', angle:125 },
      { id:'monarch-gold',   name:"Monarch's Gold",  level:60, type:'animated', color1:'#1a1405', color2:'#8a6410', angle:135 },
      { id:'emerald-canopy', name:'Emerald Canopy',  level:75,  type:'gradient', color1:'#08150d', color2:'#1f5c34', angle:140 },
      { id:'desert-mirage',  name:'Desert Mirage',   level:75,  type:'gradient', color1:'#2b1708', color2:'#8a5a24', angle:125 },
      { id:'harvest-fields', name:'Harvest Fields',  level:105, type:'gradient', color1:'#1a1608', color2:'#6b5a1a', angle:130 },
      { id:'stormy-coast',   name:'Stormy Coast',    level:105, type:'gradient', color1:'#0c1620', color2:'#2f4a5c', angle:150 },
      { id:'autumn-ember',   name:'Autumn Ember',    level:120, type:'gradient', color1:'#1a0906', color2:'#8a3312', angle:120 },
      { id:'frontier-bronze',name:'Frontier Bronze', level:120, type:'gradient', color1:'#160f08', color2:'#6b4420', angle:135 },
      { id:'imperial-marble',name:'Imperial Marble', level:160, type:'animated', color1:'#1c1a16', color2:'#d4af57', angle:135 },
      { id:'nebula-bloom',    name:'Nebula Bloom',    level:175, type:'gradient', color1:'#14081f', color2:'#5a1a5c', angle:140 },
      { id:'obsidian-tide',   name:'Obsidian Tide',   level:175, type:'gradient', color1:'#050709', color2:'#1a2a3a', angle:155 },
      { id:'sandstone-sun',   name:'Sandstone Sun',   level:195, type:'gradient', color1:'#1f1508', color2:'#a87a2e', angle:130 },
      { id:'nile-teal',       name:'Nile Teal',       level:195, type:'gradient', color1:'#06161a', color2:'#1a6b6b', angle:145 },
      { id:'celestial-dusk',  name:'Celestial Dusk',  level:235, type:'animated', color1:'#0e0a26', color2:'#4a2a7a', angle:135 },
      { id:'starlit-indigo',  name:'Starlit Indigo',  level:235, type:'gradient', color1:'#070a1f', color2:'#1f2f7a', angle:150 },
      { id:'titan-steel',     name:'Titan Steel',     level:275, type:'gradient', color1:'#0e1114', color2:'#4a5560', angle:140 },
      { id:'molten-core',     name:'Molten Core',     level:275, type:'animated', color1:'#1a0600', color2:'#c2410c', angle:125 },
      { id:'immortal-prism',  name:'Immortal Prism',  level:300, type:'animated', color1:'#0f1a2e', color2:'#c78cff', angle:135 },
      { id:'crimson-eclipse', name:'Crimson Eclipse', level:320, type:'gradient', color1:'#1a0508', color2:'#7a1226', angle:140 },
      { id:'arctic-night',    name:'Arctic Night',    level:360, type:'gradient', color1:'#050d1a', color2:'#1d5f8f', angle:150 },
      { id:'solar-flare',     name:'Solar Flare',     level:400, type:'animated', color1:'#1a0800', color2:'#f59e0b', angle:135 },
      { id:'twilight-orchid', name:'Twilight Orchid', level:425, type:'gradient', color1:'#150a1f', color2:'#8a3fa8', angle:120 },
      { id:'cyber-dawn',      name:'Cyber Dawn',      level:450, type:'animated', color1:'#0b0a1f', color2:'#ec4899', angle:130 },
      { id:'eternal-aurora',  name:'Eternal Aurora',  level:500, type:'animated', color1:'#0a0f24', color2:'#7cf0d0', angle:135 },
      // Not a level reward: earned by scoring 80% or better on The Marathon (Settings).
      { id:'finish-line',     name:'Finish Line',     level:0,   unlock:'marathon', type:'animated', color1:'#06141c', color2:'#a3e635', angle:135 },
      // Press Play Playground only: free in that mode, hidden everywhere else
      { id:'pg-arcade',    name:'Neon Arcade',     level:0, pg:true, type:'animated', color1:'#0b0a1f', color2:'#ff5fd8', angle:130 },
      { id:'pg-prodigy',   name:'Prodigy Pulse',   level:0, pg:true, type:'animated', color1:'#120a2e', color2:'#6ee7d0', angle:135 },
      { id:'pg-titan',     name:'Titan Quake',     level:0, pg:true, type:'animated', color1:'#1a0800', color2:'#ff6a3d', angle:125 },
      { id:'pg-deep',      name:'Deep Resonance',  level:0, pg:true, type:'animated', color1:'#02101f', color2:'#39d5ff', angle:140 },
      { id:'pg-paladin',   name:'Paladin Violet',  level:0, pg:true, type:'gradient', color1:'#1a1038', color2:'#8b5cff', angle:135 },
      { id:'pg-cartridge', name:'Cartridge Green', level:0, pg:true, type:'gradient', color1:'#06100a', color2:'#3ddc84', angle:150 }
    ];
    // Backgrounds and EQ presets bought early with Press Play Points (Games > Shop).
    const SHOP_UNLOCK_KEY = 'ppShopUnlocksV1';
    function shopUnlocks(){
      try { const o = JSON.parse(localStorage.getItem(SHOP_UNLOCK_KEY) || '{}'); return { bg: Array.isArray(o.bg) ? o.bg : [], eq: Array.isArray(o.eq) ? o.eq : [] }; }
      catch(e){ return { bg: [], eq: [] }; }
    }
    function presetUnlocked(p){
      if (p.pg){ try { return localStorage.getItem('ppPlaygroundMode') === '1'; } catch(e){ return false; } }
      if (shopUnlocks().bg.indexOf(p.id) >= 0) return true;
      if (p.unlock === 'marathon'){ try { return localStorage.getItem('ppMarathonBgV1') === '1'; } catch(e){ return false; } }
      return isUnlocked(p.level);
    }
    function eqProUnlocked(key){
      const cfg = EQ_PRO_PRESETS[key];
      if (cfg && cfg.pg){ try { return localStorage.getItem('ppPlaygroundMode') === '1'; } catch(e){ return false; } }
      return !!cfg && (isUnlocked(cfg.level) || shopUnlocks().eq.indexOf(key) >= 0);
    }
    const EQ_PRO_PRESETS = {
      symphonic:   { label:'Symphonic',    level:6,  gains:[3, 2, 0.5, 0.75, 1, 2, 2.7, 3.5] },
      bassheadpro: { label:'Basshead Pro', level:6,  gains:[8, 6, 2, 0.5, -1, -1.5, -1.75, -2] },
      cinematic:   { label:'Cinematic',    level:21, gains:[4, 2, -1, -0.5, 0, 2.5, 3.5, 4.5] },
      crystalair:  { label:'Crystal Air',  level:21, gains:[-2, -1, 0, 1, 2, 4.5, 5.5, 6.5] },
      warmvinyl:    { label:'Warm Vinyl',      level:90,  gains:[4, 3, 2, 1, 0, -1, -1.5, -2] },
      stadiumlive:  { label:'Stadium Live',    level:90,  gains:[5, 4, 1, 0, 1, 3, 4, 5] },
      caesarslaurel:{ label:"Caesar's Laurel", level:140, gains:[3, 2.5, 1.5, 1, 1, 2, 3, 3.5] },
      pharaohspulse:{ label:"Pharaoh's Pulse", level:195, gains:[6, 4.5, 1.5, 0, -0.5, 1, 2, 3] },
      concerthall:  { label:'Concert Hall',    level:215, gains:[2, 1.5, 1, 0.5, 1, 2.5, 3, 3.5] },
      deepresonance:{ label:'Deep Resonance',  level:215, gains:[7, 5, 3, 1, -0.5, -1, -1.5, -1] },
      titanbass:    { label:'Titan Bass',      level:255, gains:[9, 7, 3, 0.5, -1.5, -2, -2, -2.5] },
      silkhighs:    { label:'Silk Highs',      level:255, gains:[-1, -0.5, 0, 0.5, 1.5, 3.5, 5, 6] },
      eternalencore:{ label:'Eternal Encore',  level:290, gains:[4, 3, 1.5, 1, 1.5, 3, 4, 4.5] },
      crescendo:    { label:'Crescendo',       level:340, gains:[5, 4, 2, 1, 0.5, 2, 3, 4.5] },
      clubfloor:    { label:'Club Floor',      level:400, gains:[8, 6.5, 2.5, 0, -1, 1, 2, 3] },
      mythicmix:    { label:'Mythic Mix',      level:475, gains:[3.5, 3, 1, 0.5, 1, 2.5, 3.5, 4] },
      eternalref:   { label:'Eternal Reference',level:500, gains:[2, 1.5, 0.5, 0.5, 1, 2, 2.5, 3] },
      // Press Play Playground only, named after the exclusives in the games
      pgprodigy:    { label:'Prodigy',         level:0, pg:true, gains:[6, 4, 1, 0, 1, 3, 5, 6] },
      pgmaestro:    { label:'Maestro',         level:0, pg:true, gains:[2, 1, 0, 1, 3, 4, 3, 2] },
      pgphantom:    { label:'Phantom',         level:0, pg:true, gains:[-1, 0, 2, 3, 3, 2, 0, -1] },
      pgparagon:    { label:'Paragon',         level:0, pg:true, gains:[5, 3, 1, 0, 0, 1, 3, 5] },
      pgpanther:    { label:'Panther',         level:0, pg:true, gains:[7, 5, 2, 0, -1, 0, 1, 2] },
      pgpaladin:    { label:'Paladin',         level:0, pg:true, gains:[3, 3, 2, 1, 1, 2, 3, 3] }
    };

    function currentLevel(){ return levelInfo(state.xp).level; }
    function isUnlocked(level){ try { if ((localStorage.getItem('ppPlusMode') === '1' || localStorage.getItem('ppPremiumMode') === '1' || localStorage.getItem('ppPlaygroundMode') === '1') && localStorage.getItem('ppLiteMode') !== '1') return true; } catch(e){} return currentLevel() >= level; }

    // ---------- EXP shop ----------
    // Spends grooves (the minigame currency, owned by a separate closure
    // and only ever touched through window.PPXpGrooves) on XP boosts.
    // Hard ceiling on the TOTAL XP multiplier (shop boosts and sprints combined).
    function expMultiplierCap(){ return 3; }

    // All shop XP boosts are time-based. Shorter boosts hit harder (max 3x).
    const TEMP_EXP_ITEMS = [
      { id: 'temp-1h',  name: 'Groove Focus',     description: 'Multiplies XP gain by 3x for 1 hour.',
        mult: 3,   durationMs: 1 * 60 * 60 * 1000,  cost: 4000000000000 },
      { id: 'temp-5h',  name: 'Groove Momentum',  description: 'Multiplies XP gain by 2.5x for 5 hours.',
        mult: 2.5, durationMs: 5 * 60 * 60 * 1000,  cost: 12000000000000 },
      { id: 'temp-10h', name: 'Groove Endurance', description: 'Multiplies XP gain by 2x for 10 hours.',
        mult: 2,   durationMs: 10 * 60 * 60 * 1000, cost: 16000000000000 },
      { id: 'temp-24h', name: 'Groove Marathon',  description: 'Multiplies XP gain by 1.5x for 24 hours.',
        mult: 1.5, durationMs: 24 * 60 * 60 * 1000, cost: 20000000000000 }
    ];

    // Only the top item guarantees a full level (that's the one item that
    // should ever instantly complete a level). The other two just grant a
    // percentage of the current level's total bar, which may or may not
    // be enough to cross into the next level.
    const INSTANT_LEVEL_ITEMS = [
      { id: 'instant-half', name: 'Groove Boost', description: 'Instantly fills 50% of the current level bar.',
        pct: 0.5, cooldownMs: 45 * 60 * 1000,      cost: 2000000000000 },
      { id: 'instant-70',   name: 'Groove Surge',  description: 'Instantly fills 70% of the current level bar.',
        pct: 0.7, cooldownMs: 90 * 60 * 1000,      cost: 6000000000000 },
      { id: 'instant-full', name: 'Instant Level Up', description: 'Immediately completes the current level.',
        levels: 1, cooldownMs: 4 * 60 * 60 * 1000,  cost: 20000000000000 }
    ];

    const SPRINT_HOUR_MS = 60 * 60 * 1000;
    const SPRINT_DRAIN_BASE_PCT = 0.10;   // first hour drains 10% of the initial price
    const SPRINT_DRAIN_GROWTH   = 1.4;    // each following hour drains 40% more than the last
    const SPRINT_PAYOFF_MULT    = 20;     // sprint ends once this many multiples of the up-front cost have drained

    const SPRINT_ITEMS = [
      { id: 'sprint-1', name: 'Quick Sprint',   description: 'Multiplies XP gain by 1.5x while active.',
        mult: 1.5, cost: 1000000000000 },
      { id: 'sprint-2', name: 'Hard Sprint',    description: 'Multiplies XP gain by 2x while active.',
        mult: 2,   cost: 5000000000000 },
      { id: 'sprint-3', name: 'Overdrive Sprint', description: 'Multiplies XP gain by 2.5x while active.',
        mult: 2.5, cost: 25000000000000 },
      { id: 'sprint-4', name: 'Red Line Sprint', description: 'Multiplies XP gain by 3x while active.',
        mult: 3,   cost: 100000000000000 }
    ];

    function isSprintActive(){ return !!state.sprint.activeId; }

    function endSprint(){
      state.sprint = { activeId: null, initialCost: 0, mult: 1, startedAt: 0, hoursProcessed: 0, totalDrained: 0 };
    }

    // Catches the drain up to "now": for every full hour that's elapsed
    // since the sprint started (tracked by count, not wall-clock drift, so
    // it's safe to compute in one jump even after the tab's been closed
    // for a while), takes another - and bigger - bite out of grooves. Stops
    // itself early, mid-catch-up, the moment either payoff condition hits.
    function processSprintDrain(){
      if (!isSprintActive() || !window.PPXpGrooves) return;
      const now = Date.now();
      const elapsedHours = Math.floor((now - state.sprint.startedAt) / SPRINT_HOUR_MS);
      let changed = false;
      while (isSprintActive() && state.sprint.hoursProcessed < elapsedHours){
        const hourIndex = state.sprint.hoursProcessed;
        const payoffCap = state.sprint.initialCost * SPRINT_PAYOFF_MULT;
        let due = state.sprint.initialCost * SPRINT_DRAIN_BASE_PCT * Math.pow(SPRINT_DRAIN_GROWTH, hourIndex);
        if (state.sprint.totalDrained + due >= payoffCap){
          due = Math.max(0, payoffCap - state.sprint.totalDrained);
        }
        const taken = window.PPXpGrooves.forceDeductGrooves(due);
        state.sprint.totalDrained += taken;
        state.sprint.hoursProcessed += 1;
        changed = true;
        if (typeof showToast === 'function' && due > 0){
          showToast('Sprint drained ' + window.PPXpGrooves.formatNum(taken) + ' grooves.');
        }
        if (state.sprint.totalDrained >= payoffCap){
          if (typeof showToast === 'function') showToast('Sprint fully paid - multiplier ended.');
          endSprint();
          break;
        }
        if (taken < due){
          // Ran out of money before the hour's due amount could be fully paid.
          if (typeof showToast === 'function') showToast('Out of grooves - sprint ended.');
          endSprint();
          break;
        }
      }
      if (changed){ markDirty(); saveState(); }
    }

    function activateSprint(item){
      if (isSprintActive()) return 'active';
      if (!window.PPXpGrooves || !window.PPXpGrooves.spendGrooves(item.cost)) return false;
      state.sprint = {
        activeId: item.id, initialCost: item.cost, mult: item.mult,
        startedAt: Date.now(), hoursProcessed: 0, totalDrained: 0
      };
      markDirty(); saveState();
      return true;
    }

    function cancelSprint(){
      if (!isSprintActive()) return false;
      endSprint();
      markDirty(); saveState();
      return true;
    }

    function sprintMultiplier(){
      processSprintDrain();
      return isSprintActive() ? state.sprint.mult : 1;
    }

    function activeTempMultiplier(){
      return (state.expMods.tempEndsAt && Date.now() < state.expMods.tempEndsAt) ? (state.expMods.tempMult || 1) : 1;
    }
    function pgXp(){ try { return window.PPPlayground && window.PPPlayground.mult ? window.PPPlayground.mult('xp') : 1; } catch(e){ return 1; } }
    function effectiveXpMultiplier(){
      const raw = (state.expMods.permanentMult || 1) * activeTempMultiplier();
      // Sprints stack with timed boosts, but the combined shop total can
      // never exceed the hard cap (3x). The streak bonus is separate.
      return Math.min(raw * sprintMultiplier(), expMultiplierCap()) * pgXp();
    }

    // Keeps the drain moving forward even if the EXP shop modal is never
    // opened - otherwise a sprint would only ever get caught up the next
    // time the player happens to check the shop.
    setInterval(processSprintDrain, 30 * 1000);

    function buyTempExpItem(item){
      if (!window.PPXpGrooves || !window.PPXpGrooves.spendGrooves(item.cost)) return false;
      const now = Date.now();
      const stillActive = state.expMods.tempEndsAt && now < state.expMods.tempEndsAt;
      const base = stillActive ? state.expMods.tempEndsAt : now;
      state.expMods.tempMult = stillActive ? Math.max(state.expMods.tempMult || 1, item.mult) : item.mult;
      state.expMods.tempEndsAt = base + item.durationMs;
      markDirty(); saveState();
      return true;
    }

    function buyInstantLevelItem(item){
      const now = Date.now();
      const readyAt = state.instantCooldowns[item.id] || 0;
      if (now < readyAt) return 'cooldown';
      if (!window.PPXpGrooves || !window.PPXpGrooves.spendGrooves(item.cost)) return false;
      const before = levelInfo(state.xp).level;
      let xpGranted = 0;
      if (item.levels){
        // Guaranteed full level(s): grants exactly enough XP to complete
        // the current level (only the top-tier item uses this).
        let simulatedXp = state.xp;
        for (let i = 0; i < item.levels; i++){
          const info = levelInfo(simulatedXp);
          const toNext = info.xpForNext - info.xpIntoLevel;
          xpGranted += toNext;
          simulatedXp += toNext;
        }
      } else if (item.pct){
        // Percentage of the current level's total bar - may or may not be
        // enough to cross into the next level.
        const info = levelInfo(state.xp);
        xpGranted = Math.max(1, Math.round(info.xpForNext * item.pct));
      }
      state.xp += xpGranted;
      state.instantCooldowns[item.id] = now + item.cooldownMs;
      markDirty(); saveState();
      const after = levelInfo(state.xp).level;
      renderBadge(xpGranted, after > before);
      if (after > before) handleLevelUp(before, after);
      return true;
    }

    // XP is now time-based (see recordWatchTime), so finishing a track no longer
    // awards anything by itself. Kept as a no-op for the player's existing calls.
    function recordCompletion(){}

    // Called with the media time actually played (ms). Seeking is allowed, but
    // skipped sections never reach here, so they earn nothing. Fractions carry
    // over and XP is granted in small batches to keep the badge calm.
