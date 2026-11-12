    // ---------- live smart playlists, background tagging, surprise playlists ----------
    const live = () => ls('ppvLive') !== '0';
    function syncSmartLive() {
      const a = A(); if (!a || !live()) return; const tg = loadTags(); let changed = false;
      a.playlists().filter(p => p.auto === 'smart').forEach(pl => {
        const s = SMART.find(x => x.id === pl.smartKey); if (!s) return;
        a.tracks().forEach(t => {
          const c = tg[t.dbId]; if (t.stem || !c) return;
          const m = s.test(c, vibes(c)), has = (t.playlistIds || []).includes(pl.id);
          if (m && !has) { a.addToPlaylist(t.dbId, pl.id); changed = true; } else if (!m && has) { a.removeFromPlaylist(t.dbId, pl.id); changed = true; }
        });
      });
      if (changed) a.commitPlaylists();
    }
    const rnd = n => Math.floor(Math.random() * n);
    const shuf = arr => { const x = arr.slice(); for (let i = x.length - 1; i > 0; i--) { const j = rnd(i + 1); const v = x[i]; x[i] = x[j]; x[j] = v; } return x; };
    const VIBE_NAMES = { chill: 'Slow-down hour', party: 'Pre-game', workout: 'Second wind', happy: 'Good-mood grab bag', sad: 'Rainy window', focus: 'Deep focus', sleep: 'Wind down', acoustic: 'Unplugged', instr: 'No words needed' };
    async function buildSurprise() {
      const a = A(), tg = loadTags(), tr = a.tracks();
      const tagged = tr.map((t, i) => ({ t, i, c: tg[t.dbId] })).filter(o => o.c && !o.t.stem);
      if (tagged.length < 12) return null;
      const ids = m => m.map(o => o.t.dbId), themes = [];
      SMART.forEach(s => { const nm = VIBE_NAMES[s.id]; if (!nm) return; const m = tagged.filter(o => s.test(o.c, vibes(o.c))); if (m.length >= 8) themes.push({ key: 'v:' + s.id, name: nm, ids: ids(shuf(m).slice(0, 20)) }); });
      const gen = {}; tagged.forEach(o => { const g = o.c.gp && o.c.gp[0] && o.c.gp[0][0]; if (g) (gen[g] = gen[g] || []).push(o); });
      Object.keys(gen).forEach(g => { if (gen[g].length >= 8) themes.push({ key: 'g:' + g, name: g + ' spotlight', ids: ids(shuf(gen[g]).slice(0, 20)) }); });
      const bp = tagged.filter(o => o.c.bpm);
      if (bp.length >= 12) {
        const sub = shuf(bp).slice(0, Math.max(12, Math.ceil(bp.length * 0.6))).sort((x, y) => x.c.bpm - y.c.bpm), n = Math.min(18, sub.length), pk = [];
        for (let k = 0; k < n; k++) pk.push(sub[Math.round(k * (sub.length - 1) / (n - 1))]);
        themes.push({ key: 'ramp', name: 'Slow burn to full speed', ids: ids(pk) });
      }
      try {
        const o = tagged[rnd(tagged.length)], order = await similarTo(o.i, 'sound');
        const l = [o.t.dbId].concat(order.map(i => tr[i]).filter(t => t && !t.stem).slice(0, 19).map(t => t.dbId));
        if (l.length >= 8) themes.push({ key: 's:' + o.t.dbId, name: 'More like ' + o.t.title, ids: l });
      } catch (e) {}
      if (!themes.length) return null;
      let recent = []; try { recent = JSON.parse(ls('ppvSurpRecent')) || []; } catch (e) {}
      const pool = themes.filter(t => !recent.includes(t.key)), th = (pool.length ? pool : themes)[rnd((pool.length ? pool : themes).length)];
      recent.push(th.key); ls('ppvSurpRecent', JSON.stringify(recent.slice(-8)));
      return th;
    }
    function toast(pl, n) {
      const old = document.getElementById('ppv-toast'); if (old) old.remove();
      const a = A(), d = document.createElement('div'); d.id = 'ppv-toast';
      d.style.cssText = 'position:fixed;left:50%;transform:translateX(-50%);bottom:84px;z-index:99999;max-width:92vw;background:#23242a;color:#eee;border:1px solid #555;border-radius:12px;padding:10px 12px;box-shadow:0 6px 24px #0008;font-size:13px;display:flex;gap:8px;align-items:center;flex-wrap:wrap';
      const m = document.createElement('span'); m.textContent = 'A surprise playlist is ready: ' + pl.name + ' (' + n + ' tracks)';
      const bt = (txt, fn) => { const b = document.createElement('button'); b.textContent = txt; b.style.cssText = 'padding:5px 10px;border-radius:8px;border:1px solid #555;background:#2f3037;color:#eee;cursor:pointer'; b.onclick = fn; return b; };
      const tr = a.tracks();
      d.append(m,
        bt('Play', () => { const q = (pl.order || []).map(id => tr.findIndex(t => t.dbId === id)).filter(i => i >= 0); if (q.length) a.play(q[0], q); d.remove(); }),
        bt('Keep', () => { pl.auto = null; pl.at = undefined; a.commitPlaylists(); d.remove(); }),
        bt('\u00d7', () => d.remove()));
      document.body.appendChild(d);
    }
    async function makeSurprise() {
      const a = A(), th = await buildSurprise(); if (!th) return null;
      const pl = a.createPlaylist('\ud83c\udf81 ' + th.name);
      pl.auto = 'surprise'; pl.at = Date.now(); pl.libOnly = ls('ppvSurpTab') === '0'; pl.order = th.ids.slice();
      th.ids.forEach(id => a.addToPlaylist(id, pl.id));
      const max = parseInt(ls('ppvSurpMax') || '5', 10);
      a.playlists().filter(p => p.auto === 'surprise' && p.id !== pl.id).sort((x, y) => (y.at || 0) - (x.at || 0)).slice(Math.max(0, max - 1)).forEach(p => a.deletePlaylistQuiet(p.id));
      a.commitPlaylists(); ls('ppvSurpLast', String(Date.now()));
      toast(pl, th.ids.length);
      return pl;
    }
    const bgSt = $('#ppv-bgst'), setBg = s => { bgSt.textContent = s; };
    [['ppv-bg', 'ppvBg', '0'], ['ppv-bgplay', 'ppvBgPlay', '0'], ['ppv-bgchg', 'ppvBgChg', '0'], ['ppv-surp', 'ppvSurp', '0'], ['ppv-surptab', 'ppvSurpTab', '1']].forEach(([id, k, def]) => {
      const el = $('#' + id); el.checked = (ls(k) == null ? def : ls(k)) === '1'; el.onchange = () => ls(k, el.checked ? '1' : '0');
    });
    const lv2 = $('#ppv-live'); lv2.checked = live(); lv2.onchange = () => { ls('ppvLive', lv2.checked ? '1' : '0'); syncSmartLive(); };
    const lmx = $('#ppv-lmix'); lmx.checked = ls('ppvLiveMix') !== '0'; lmx.onchange = () => { ls('ppvLiveMix', lmx.checked ? '1' : '0'); if (lmx.checked && window.__ppLiveMixes) window.__ppLiveMixes.refresh(); };
    const lmxList = () => {
      const box = $('#ppv-lmixlist'), a = A(), api = window.__ppLiveMixes; if (!box || !a || !api) return; const ids = api.blocked(); box.textContent = '';
      if (!ids.length) { box.textContent = 'No blocked tracks.'; return; }
      ids.forEach(id => { const t = a.tracks().find(x => String(x.dbId) === id), r = document.createElement('div'), bt = document.createElement('button'); r.textContent = (t ? t.title : 'Removed track') + ' '; bt.textContent = 'Unblock'; bt.className = 'ppv-sec'; bt.onclick = () => { api.unblock(id); lmxList(); }; r.appendChild(bt); box.appendChild(r); });
    };
    $('#ppv-lmixblk').onclick = () => { const t = cur(); if (!t || !window.__ppLiveMixes) { h.status('Play or pick a track first.'); return; } window.__ppLiveMixes.block(t.dbId); h.status('\u201c' + t.title + '\u201d is blocked from auto mixes.'); lmxList(); };
    setTimeout(lmxList, 1500);
    [['ppv-bgidle', 'ppvBgIdle', '5'], ['ppv-surpev', 'ppvSurpEv', '24'], ['ppv-surpmax', 'ppvSurpMax', '5']].forEach(([id, k, def]) => {
      const el = $('#' + id); el.value = ls(k) || def; el.onchange = () => ls(k, el.value);
    });
    if (!navigator.getBattery) $('#ppv-bgchl').style.display = 'none';
    $('#ppv-surpnow').onclick = async () => {
      setBg('Assembling a surprise\u2026');
      try { const pl = await makeSurprise(); setBg(pl ? 'Made ' + pl.name + '.' : 'Tag at least 12 tracks first (stems are skipped).'); } catch (e) { console.error(e); setBg('Error: ' + errText(e)); }
    };
    let lastInput = Date.now(), bgBusy = false, bgCache = null; const bgFailed = new Set();
    ['pointerdown', 'keydown', 'touchstart', 'wheel', 'mousemove'].forEach(ev => addEventListener(ev, () => { lastInput = Date.now(); }, { passive: true, capture: true }));
    const mediaPlaying = () => [...document.querySelectorAll('audio,video')].some(m => !m.paused && !m.ended && m.readyState > 2);
    async function isAway() {
      if (isBusy) return false;
      if (Date.now() - lastInput < parseInt(ls('ppvBgIdle') || '5', 10) * 60000) return false;
      if (ls('ppvBgPlay') !== '1' && mediaPlaying()) return false;
      if (ls('ppvBgChg') === '1' && navigator.getBattery) { try { const b = await navigator.getBattery(); if (!b.charging) return false; } catch (e) {} }
      return true;
    }
    const freeBg = () => { if (bgCache) { Object.values(bgCache).forEach(s => s && s.release && s.release()); bgCache = null; } };
    const surpDue = () => Date.now() - (parseInt(ls('ppvSurpLast') || '0', 10)) >= parseInt(ls('ppvSurpEv') || '24', 10) * 3600000;
    async function bgTick() {
      if (bgBusy) return; const bgOn = ls('ppvBg') === '1', surpOn = ls('ppvSurp') === '1'; const a = A();
      if (!a || (!bgOn && !surpOn)) { freeBg(); return; }
      if (!(await isAway())) { freeBg(); return; }
      bgBusy = true;
      try {
        while (ls('ppvBg') === '1' && await isAway()) {
          const tg = loadTags(), list = a.tracks().filter(x => !x.stem), t = list.find(x => !tg[x.dbId] && !bgFailed.has(x.dbId));
          if (!t) break;
          const lv = h.LV(); if (!lv && !bgCache) bgCache = {}; const tb0 = performance.now();
          setBg('Background: tagging ' + t.title + ' (' + list.filter(x => !tg[x.dbId] && !bgFailed.has(x.dbId)).length + ' left)\u2026');
          try { const r = await tagTrack(t.url, () => {}, lv, { deep: deep.checked, cache: lv ? null : bgCache, rest: 0.3 }); if (!r.emb && !r.genre) throw new Error('nothing detected'); await persistTags(t.dbId, r, aeq.checked); }
          catch (e) { console.warn('background tag failed', t.title, e); bgFailed.add(t.dbId); }
          try { refreshCount(); } catch (e) {}
          await tick(); await ease(performance.now() - tb0, 0.3, 'bg');   // background work is deliberately gentle
        }
        if (ls('ppvSurp') === '1' && surpDue() && await isAway()) {
          setBg('Background: assembling a surprise\u2026');
          const pl = await makeSurprise(); setBg(pl ? 'Made ' + pl.name + '.' : 'Waiting for more tagged tracks.');
        } else if (bgOn) setBg('Background: nothing left to tag.');
      } catch (e) { console.warn('background task', e); } finally { bgBusy = false; if (!(await isAway())) freeBg(); }
    }
    setInterval(() => { bgTick().catch(e => console.warn(e)); }, 15000);

    // more like this + intro skip
    $('#ppv-simgo').onclick = async () => {
      busy(true);
      try {
        const a = A(), t = cur(); if (!t) throw new Error('Play a track first.');
        const order = await similarTo(a.currentIndex(), $('#ppv-sim').value);
        if (!order.length) throw new Error('Nothing close enough. Tag more tracks, or try "Similar sound".');
        const q = order.slice(0, 30); a.play(q[0], q); h.status('Playing ' + q.length + ' similar tracks.');
        lib.textContent = q.slice(0, 5).map(i => a.tracks()[i].title).join('\n');
      } catch (e) { console.error(e); h.status('Error: ' + errText(e)); }
      busy(false);
    };
    const mediaOf = t => document.getElementById(t.kind === 'video' ? 'video-el' : 'audio');
    $('#ppv-skipgo').onclick = () => {
      const t = cur(), c = t && loadTags()[t.dbId];
      if (!t) return h.status('Play a track first.');
      if (!c || c.fv == null) return h.status('No vocal timing yet. Tick "Scan the whole track" and tag this track.');
      mediaOf(t).currentTime = Math.max(0, c.fv - 1); h.status('Jumped to ' + mmss(c.fv) + '.');
    };
    let pendingSkip = false;
    ['audio', 'video-el'].forEach(id => {
      const el = document.getElementById(id); if (!el) return;
      el.addEventListener('loadedmetadata', () => { pendingSkip = true; });
      el.addEventListener('playing', () => {
        if (!pendingSkip) return; pendingSkip = false;
        if (!ask.checked) return;
        const t = cur(), c = t && loadTags()[t.dbId];
        if (t && c && c.w && c.fv >= 10 && (c.v || 0) >= 50 && el.currentTime < 1.5 && mediaOf(t) === el) el.currentTime = Math.max(0, c.fv - 1);
      });
    });
    $('#ppv-eqall').onclick = () => {
      const a = A(), tg = loadTags(); let n = 0, eqs = {}; try { eqs = JSON.parse(localStorage.getItem('playerTrackEq')) || {}; } catch (e) {}
      a.tracks().forEach(t => { const c = tg[t.dbId]; if (!c || (eqs[t.dbId] && !c.ae)) return; const name = eqPresetFor(c); if (name && a.setTrackEqPreset(t.dbId, name)) { c.ae = name; n++; } });
      saveTagStore(); h.status('Auto-EQ set on ' + n + ' track' + (n === 1 ? '' : 's') + ' (custom EQ settings were left alone).');
    };

    // Whisper
    const wsize = $('#ppv-wsize'), wlang = $('#ppv-wlang'), wtask = $('#ppv-wtask'), wclean = $('#ppv-wclean'), wout = $('#ppv-wout'), wsrt = $('#ppv-wsrt');
    if (ls('ppvWDef') !== '2') { ls('ppvWDef', '2'); ls('ppvWSize', 'base_en'); ls('ppvWLang', 'english'); }   // one-time move to the English models
    wsize.value = whOk(ls('ppvWSize')) ? ls('ppvWSize') : 'base_en'; wlang.value = ls('ppvWLang') === null ? 'english' : ls('ppvWLang'); wtask.value = ls('ppvWTask') || 'transcribe'; wclean.checked = ls('ppvWClean') === '1';
    const syncEn = () => { wlang.disabled = whEn(wsize.value) && wtask.value !== 'translate'; };   // English models need no language; translating does
    wsize.onchange = () => { ls('ppvWSize', wsize.value); syncEn(); }; wlang.onchange = () => ls('ppvWLang', wlang.value); wtask.onchange = () => { ls('ppvWTask', wtask.value); syncEn(); }; wclean.onchange = () => ls('ppvWClean', wclean.checked ? '1' : '0');
    { const wg = $('#ppv-wgpu'); wg.checked = ls('ppvWGpu') === '1'; wg.onchange = () => ls('ppvWGpu', wg.checked ? '1' : '0'); if (NATIVE) { const l = $('#ppv-wgpu-l'); l.lastChild.textContent = ' Use the phone GPU/NPU (experimental). Downloads a bigger model file once; if it is not faster it switches itself off'; } else if (!navigator.gpu) $('#ppv-wgpu-l').style.display = 'none'; }
    syncEn();
    { const wa = $('#ppv-wacc'); wa.value = ls('ppvWAcc') || '0'; wa.onchange = () => ls('ppvWAcc', wa.value); }
    let lastSrt = null;
    $('#ppv-wgo').onclick = async () => {
      busy(true); wout.textContent = ''; wsrt.style.display = 'none';
      try {
        const a = A(), t = cur(); if (!t) throw new Error('Play or select a track first.');
        const lyr = window.__ppLyrics;
        { const m = WH[wsize.value][2]; if (m && m.big && localStorage.getItem('ppvWBig_' + wsize.value) !== '1') { if (!confirm('This model is a ~' + m.big + ' MB download and needs plenty of free memory. Continue?')) { busy(false); return; } try { localStorage.setItem('ppvWBig_' + wsize.value, '1'); } catch (e) {} } }
        if (ls('ppvWClean') === null) wclean.checked = t.kind !== 'video';   // untouched: songs get their vocals separated first, videos do not
        if (t.kind !== 'video' && lyr && lyr.has(t.dbId) && !confirm('This track already has lyrics. Replace them?')) { busy(false); return; }
        document.querySelectorAll('.ppv-bar-wh i').forEach(e => e.style.width = '0');
        const wst = t => { h.status(t); const m = /(\d+)%/.exec(t); if (m) document.querySelectorAll('.ppv-bar-wh i').forEach(e => e.style.width = m[1] + '%'); };
        const cues = await transcribe(t, { size: wsize.value, lang: wlang.disabled ? '' : wlang.value, task: wtask.value, clean: wclean.checked, acc: +$('#ppv-wacc').value, model: h.sel.value, strength: +h.sl.value, lv: h.LV() }, wst);
        if (!cues.length) throw new Error('No speech found.');
        if (t.kind === 'video' || !lyr) a.setSubtitles(t.dbId, cues, 'Whisper.srt'); else lyr.set(t.dbId, toLrc(cues)); if (t.kind !== 'video' && lyr) { try { a.setSubtitles(t.dbId, cues, 'Whisper.srt'); } catch (e) {} }
        lastSrt = { name: t.title, text: toSrt(cues) }; wsrt.style.display = '';
        wout.textContent = cues.length + ' lines added as ' + (t.kind === 'video' ? 'subtitles' : 'synced lyrics and subtitles (tap CC on the disc to show them)') + '.\n' + cues.slice(0, 4).map(c => mmss(c.start) + '  ' + c.text).join('\n');
        { const rp = window.__ppvRep; if (rp && (rp.fixed || rp.unsure)) wout.textContent += '\n' + (rp.fixed ? rp.fixed + ' repeated line' + (rp.fixed === 1 ? '' : 's') + ' made consistent. ' : '') + (rp.unsure ? rp.unsure + ' repeated line' + (rp.unsure === 1 ? ' is' : 's are') + ' still unsure: open the editor, Repeats tab, to choose the right wording.' : ''); }
        if (window.__ppvSaved) wout.textContent += '\nVocals saved to Split tracks, so this song never needs splitting again for lyrics.';
        h.status('Done.');
      } catch (e) { console.error(e); h.status('Error: ' + errText(e)); }
      busy(false);
    };
    wsrt.onclick = () => {
      if (!lastSrt) return;
      const blob = new Blob([lastSrt.text], { type: 'text/plain' }), name = lastSrt.name.replace(/[\\/:*?"<>|]+/g, '_') + '.srt';
      if (window.ppSaveBlob) { window.ppSaveBlob(blob, name); return; }   // works inside the Android app
      const u = URL.createObjectURL(blob), a = document.createElement('a');
      a.href = u; a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(u), 10000);
    };
    $('#ppv-wfree').onclick = async () => {
      try { if (NATIVE) { const ids = PK_FILES.map(f => f[0]).concat(Object.values(WHN).flatMap(k => [k + '_enc', k + '_dec', k + '_encf'])); for (const id of ids) { try { await NP.remove({ id }); } catch (e) {} } } if (asr) { await asr.dispose(); asr = null; asrId = ''; } const ks = await caches.keys(); for (const k of ks) if (/transformers/i.test(k)) await caches.delete(k); h.status('Whisper download removed.'); } catch (e) { h.status('Error: ' + errText(e)); }
    };
    // ---------- AI summary ----------
    { const ss = $('#ppv-sumstyle'); if (ss) ss.value = sumStyleKey(); }
    { const sl = $('#ppv-sumlen'); sl.value = sumLenKey(); sl.onchange = () => { try { localStorage.setItem('ppvSumLen', sl.value); } catch (e) {} }; }
    $('#ppv-lyfix').onclick = () => { const a = window.__ppApi, i = a ? a.currentIndex() : -1; if (i < 0) { h.status('Play or select a track first.'); return; } if (h.mas && h.mas.lyricFix) h.mas.lyricFix(i); };
    $('#ppv-sumtalk').onclick = () => { const a = window.__ppApi, i = a ? a.currentIndex() : -1; if (i < 0) { h.status('Play or select a track first.'); return; } if (h.mas && h.mas.songTalk) h.mas.songTalk(i); };
    $('#ppv-sumgo').onclick = async () => {
      const sumout = $('#ppv-sumout'); busy(true); sumout.textContent = '';
      try {
        const t = cur(); if (!t) throw new Error('Play or select a track first.');
        const old = sumLoad()[t.dbId];
        if (old && !confirm('This track already has a saved summary. Make a new one?')) { sumout.textContent = old.t; $('#ppv-sumtalk').style.display = 'block'; busy(false); return; }
        const say = x => h.status(x);
        let c = loadTags()[t.dbId];
        if (!c) { say('Tagging first, so the summary knows what it hears…'); const r = await tagTrack(t.url, say, h.LV(), {}); await persistTags(t.dbId, r, false); c = loadTags()[t.dbId]; }
        const tr = getTranscript(t.dbId), prof = soundProfile(c, t.kind), ch = h.mas.chat;
        let ai = '', note = '';
        if (tr.words >= 12 || (t.kind !== 'video' && t.artist && !/^(unknown artist|video|stream)$/i.test(t.artist))) {
          if (!ch.ready() && !confirm('The written summary uses the AI brain: a one-time download of about ' + ch.mb() + ' MB. Continue? (Cancel keeps just the sound summary.)')) note = 'No AI brain download, so this is the sound summary only.';
          else { try { const askLive = (msgs, opts, sy) => { let acc = ''; return ch.ask(msgs, Object.assign({}, opts, { onText: x => { acc += x; sumout.textContent = acc; } }), sy); };
            ai = await aiSummary(t, c, tr, askLive, say, $('#ppv-sumlen').value, ch.ctx && ch.ctx()); } catch (e) { console.warn(e); note = 'The AI brain could not run: ' + errText(e); } if (!ai && !note) note = tr.words >= 12 ? 'The AI summary came out unusable, so only the sound summary is shown.' : 'No lyrics are saved and the AI brain does not know this song, so only the sound summary is shown. Tap "Transcribe current track" above for a fuller summary.'; }
        } else note = 'No lyrics or subtitles saved for this track, so this is based on the sound only. Tap "Transcribe current track" above for a fuller summary.';
        const text = [ai, prof.line ? 'Sound: ' + prof.line : ''].filter(Boolean).join('\n\n');
        if (!text) throw new Error('Nothing to summarize yet. Tag the track first.');
        const kept = await sumSave(t.dbId, { t: text, ts: Date.now(), len: $('#ppv-sumlen').value, sty: sumStyleKey() });
        if (!kept) note = (note ? note + ' ' : '') + 'It could not be saved on this device (storage is full or blocked), so copy it now if you want to keep it.';
        sumout.textContent = text + (note ? '\n\n' + note : '');
        $('#ppv-sumtalk').style.display = 'block';
        h.status('Done.');
      } catch (e) { console.error(e); h.status('Error: ' + errText(e)); }
      busy(false);
    };
    // ---------- Saved summaries: every summary on this device, any length, to read, copy, download or delete ----------
    {
      const det = $('#ppv-sumlist'), hd = $('#ppv-sumlist-h'), bd = $('#ppv-sumlist-b');
      const nameOf = id => { const a = A(), t = a && a.tracks().find(x => String(x.dbId) === String(id)); return t ? t.title + (t.artist && !/^(unknown artist|video|stream)$/i.test(t.artist) ? ' \u2013 ' + t.artist : '') : 'Removed track'; };
      const safe = x => String(x).replace(/[\\/:*?"<>|]+/g, '').trim().slice(0, 80) || 'summary';
      const save = (name, text) => { const u = URL.createObjectURL(new Blob([text], { type: 'text/plain' })), a = document.createElement('a'); a.href = u; a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(u), 4000); };
      const mk = (label, fn) => { const b = document.createElement('button'); b.className = 'ppv-sec'; b.style.cssText = 'width:auto;padding:4px 10px'; b.textContent = label; b.onclick = fn; return b; };
      const render = () => {
        const all = Object.entries(sumLoad()).filter(([, v]) => v && v.t).sort((x, y) => (y[1].ts || 0) - (x[1].ts || 0));
        hd.textContent = 'Saved summaries (' + all.length + ')';
        if (!det.open) return;
        bd.textContent = '';
        if (!all.length) { const n = document.createElement('div'); n.className = 'ppv-note'; n.textContent = 'Nothing saved yet. Each summary you make is kept here on this device, in its own storage, so long ones are safe too.'; bd.appendChild(n); return; }
        const top = document.createElement('div'); top.style.cssText = 'display:flex;gap:6px;flex-wrap:wrap;margin:6px 0';
        top.appendChild(mk('Download all (.txt)', () => save('summaries.txt', all.map(([id, v]) => nameOf(id) + '\n' + '='.repeat(Math.min(40, nameOf(id).length)) + '\n' + v.t).join('\n\n\n'))));
        bd.appendChild(top);
        all.forEach(([id, v]) => {
          const d = document.createElement('details'), sm = document.createElement('summary'), meta = document.createElement('div'), body = document.createElement('div'), row = document.createElement('div');
          const words = v.t.split(/\s+/).filter(Boolean).length;
          sm.textContent = nameOf(id); meta.className = 'ppv-note'; meta.textContent = (v.ts ? new Date(v.ts).toLocaleString() + ' \u00b7 ' : '') + words + ' words' + (v.len && SUM_LENS[v.len] ? ' \u00b7 ' + SUM_LENS[v.len].label.replace(/ \(.*/, '') : '') + (v.sty && SUM_STYLES[v.sty] ? ' \u00b7 ' + SUM_STYLES[v.sty].label.replace(/ \(.*/, '') : '');
          body.style.cssText = 'white-space:pre-wrap;max-height:260px;overflow:auto;margin:6px 0;font-size:13px;line-height:1.45;user-select:text'; body.textContent = v.t;
          row.style.cssText = 'display:flex;gap:6px;flex-wrap:wrap';
          row.append(
            mk('Copy', async () => { try { await navigator.clipboard.writeText(v.t); h.status('Copied.'); } catch (e) { h.status('Could not copy. Press and hold the text to select it.'); } }),
            mk('Download .txt', () => save(safe(nameOf(id)) + ' summary.txt', nameOf(id) + '\n\n' + v.t)),
            mk('Delete', async () => { if (confirm('Delete the saved summary for \u201c' + nameOf(id) + '\u201d?')) { await sumDelete(id); h.status('Summary deleted.'); } }));
          d.append(sm, meta, body, row); bd.appendChild(d);
        });
      };
      det.addEventListener('toggle', render); document.addEventListener('ppv-sums', render); render();
    }
    // ---------- Lyrics & timestamp editor ----------
    {
      const edet = { open: false }, mkEl = (t, c, h) => { const e = document.createElement(t); if (c) e.className = c; if (h != null) e.innerHTML = h; return e; };
      let edTrack = null;
      const fut = [];   // redo stack
      let rows = [], hist = [], edId = null;   // rows: {s: seconds, e: seconds|null, text}
      const fmtT = x => { x = Math.max(0, x); const m = Math.floor(x / 60); return m + ':' + (x - m * 60).toFixed(2).padStart(5, '0'); };
      const parseT = v => { v = String(v).trim().replace(',', '.'); let m = /^(?:(\d+):)?(\d+):(\d+(?:\.\d+)?)$/.exec(v); if (m) return (+(m[1] || 0)) * 3600 + (+m[2]) * 60 + (+m[3]); m = /^(\d+(?:\.\d+)?)$/.exec(v); return m ? +m[1] : NaN; };
      const snap = () => { hist.push(JSON.stringify(rows)); if (hist.length > 80) hist.shift(); fut.length = 0; };
      const parseLrcText = txt => { const out = [], re = /\[(\d{1,3}):(\d{1,2})(?:[.:](\d{1,3}))?\]/g; String(txt).split(/\r?\n/).forEach(raw => { const st = []; let m, last = 0; re.lastIndex = 0; while ((m = re.exec(raw))) { st.push(+m[1] * 60 + +m[2] + (m[3] ? +m[3].padEnd(3, '0').slice(0, 3) / 1000 : 0)); last = re.lastIndex; } if (!st.length) return; const tx = raw.slice(last).replace(/<\d+:\d+(?:[.:]\d+)?>/g, '').trim(); st.forEach(x => out.push({ s: x, e: null, text: tx })); }); return out.sort((a, b) => a.s - b.s); };
      const parseSrtText = txt => { const out = []; String(txt).replace(/\r/g, '').split(/\n{2,}/).forEach(b => { const l = b.split('\n'), i = l.findIndex(x => x.includes('-->')); if (i < 0) return; const m = /([\d:.,]+)\s*-->\s*([\d:.,]+)/.exec(l[i]); if (!m) return; const s = parseT(m[1]), e = parseT(m[2]); if (isNaN(s)) return; out.push({ s, e: isNaN(e) ? null : e, text: l.slice(i + 1).join('\n').replace(/<[^>]+>/g, '').trim() }); }); return out.sort((a, b) => a.s - b.s); };
      const plain = v => v.split(/\r?\n/).filter(x => x.trim()).map((x, i) => ({ s: i * 4, e: null, text: x.trim() }));
      const toCues = () => { const r = rows.filter(x => x.text.trim() && isFinite(x.s)).slice().sort((a, b) => a.s - b.s); return r.map((x, i) => { const nx = r[i + 1]; let e = x.e != null && x.e > x.s ? x.e : (nx ? nx.s : x.s + 4); return { start: x.s, end: Math.max(e, x.s + 0.3), text: x.text.trim() }; }); };
      const media = () => { const t = edTrack || cur(); return t ? mediaOf(t) : null; };
      // ================= Full-screen editor page =================
      const ecss = document.createElement('style');
      ecss.textContent = '#ppv-edpage{position:fixed;inset:0;z-index:100000;display:none;flex-direction:column;background:var(--bg,#15161a);color:var(--text,#eee);font:14px system-ui,sans-serif}#ppv-edpage.open{display:flex}' +
        '#ppv-edpage button{font:inherit;cursor:pointer;color:inherit;background:rgba(127,127,127,.16);border:1px solid var(--line,#444);border-radius:10px;padding:8px 12px;margin:0;width:auto}#ppv-edpage button:disabled{opacity:.4}' +
        '#ppv-edpage button.pri{background:var(--accent,#7c3aed);border-color:transparent;color:#fff;font-weight:700}#ppv-edpage button.danger{color:#ff6b6b}' +
        '#ppv-edpage input,#ppv-edpage select,#ppv-edpage textarea{font:inherit;color:inherit;background:rgba(127,127,127,.12);border:1px solid var(--line,#444);border-radius:8px;padding:7px;box-sizing:border-box;margin:0;width:auto}' +
        '#ppv-edpage .eh{display:flex;align-items:center;gap:10px;padding:calc(8px + env(safe-area-inset-top,0px)) 12px 8px;border-bottom:1px solid var(--line,#333)}#ppv-edpage .eh .tt{flex:1;min-width:0}#ppv-edpage .eh b{display:block;font-size:15px}#ppv-edpage .eh small{display:block;opacity:.65;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}' +
        '#ppv-edpage .ebadge{font-size:11px;padding:3px 8px;border-radius:99px;background:rgba(127,127,127,.2)}#ppv-edpage .ebadge.dirty{background:#b45309;color:#fff}' +
        '#ppv-edpage .etr{display:flex;align-items:center;gap:6px;padding:8px 12px;border-bottom:1px solid var(--line,#333);flex-wrap:wrap}#ppv-edpage .etr input[type=range]{flex:1;min-width:120px;padding:0;accent-color:var(--accent,#7c3aed)}#ppv-edpage .etime{font-variant-numeric:tabular-nums;font-size:12px;opacity:.85;min-width:92px;text-align:center}' +
        '#ppv-edpage .etabs{display:flex;gap:6px;padding:8px 12px 0;overflow-x:auto}#ppv-edpage .etabs button{white-space:nowrap;border-radius:99px;padding:6px 14px;font-size:13px}#ppv-edpage .etabs button.on{background:var(--accent,#7c3aed);color:#fff;border-color:transparent}' +
        '#ppv-edpage .etool{display:none;padding:8px 12px;gap:8px;flex-wrap:wrap;align-items:center;border-bottom:1px solid var(--line,#333);max-height:34vh;overflow:auto}#ppv-edpage .etool.on{display:flex}#ppv-edpage .etool label{font-size:12px;opacity:.8;display:flex;align-items:center;gap:6px}#ppv-edpage .etool .sep{flex-basis:100%;height:0}' +
        '#ppv-edpage .ebanner{display:none;padding:8px 12px;background:#b45309;color:#fff;font-size:13px;align-items:center;gap:8px}#ppv-edpage .ebanner.on{display:flex}#ppv-edpage .ebanner span{flex:1}' +
        '#ppv-edpage .efilter{padding:8px 12px 0;display:flex;gap:8px;align-items:center}#ppv-edpage .efilter input{flex:1}#ppv-edpage .ecount{font-size:12px;opacity:.65}' +
        '#ppv-edpage .elist{flex:1;overflow:auto;padding:8px 12px 16px;-webkit-overflow-scrolling:touch}#ppv-edpage .eempty{opacity:.6;text-align:center;padding:40px 10px}' +
        '#ppv-edpage .er{border:1px solid var(--line,#3a3a40);border-radius:12px;padding:8px;margin-top:8px;background:rgba(127,127,127,.07)}#ppv-edpage .er.on{border-color:var(--accent,#7c3aed);box-shadow:0 0 0 1px var(--accent,#7c3aed) inset}#ppv-edpage .er.sel{background:rgba(124,58,237,.14)}' +
        '#ppv-edpage .er .r1{display:flex;gap:6px;align-items:center;flex-wrap:wrap}#ppv-edpage .er .n{font-size:11px;opacity:.6;width:26px;text-align:center}#ppv-edpage .er .et{width:84px;text-align:center;font-variant-numeric:tabular-nums}#ppv-edpage .er .arrow{opacity:.5}' +
        '#ppv-edpage .er textarea{display:block;width:100%;margin-top:6px;resize:none;line-height:1.35;overflow:hidden;min-height:calc(1.35em + 16px)}#ppv-edpage.fs-s .er textarea{font-size:13px}#ppv-edpage.fs-l .er textarea{font-size:17px}#ppv-edpage.fs-x .er textarea{font-size:20px}' +
        '#ppv-edpage .er .r3{display:flex;gap:5px;margin-top:6px;flex-wrap:wrap}#ppv-edpage .er .r3 button{padding:5px 9px;font-size:12px}#ppv-edpage .er.hide{display:none}#ppv-edpage .er.bad .et{border-color:#ff6b6b}' +
        '#ppv-edpage .etap{display:none;padding:8px 12px;border-top:1px solid var(--line,#333);text-align:center}#ppv-edpage .etap.on{display:block}#ppv-edpage .etap button{width:100%;padding:18px;font-size:18px;font-weight:700}#ppv-edpage .etap small{display:block;opacity:.7;margin-bottom:6px}' +
        '#ppv-edpage .ebar{display:flex;align-items:center;gap:8px;padding:10px 12px calc(10px + env(safe-area-inset-bottom,0px));border-top:1px solid var(--line,#333);background:var(--bg,#15161a)}#ppv-edpage .ebar .st{flex:1;font-size:12px;opacity:.8;min-width:0}#ppv-edpage .ebar .go{padding:13px 18px;font-size:15px}' +
        '#ppv-edpage .etoast{position:absolute;left:50%;bottom:calc(86px + env(safe-area-inset-bottom,0px));transform:translateX(-50%);background:#23242a;color:#eee;border:1px solid #555;border-radius:12px;padding:9px 14px;font-size:13px;max-width:88vw;display:none;z-index:3;box-shadow:0 6px 24px #0008}' +
        '#ppv-edpage .emod{position:absolute;inset:0;background:#000a;display:none;align-items:center;justify-content:center;z-index:4;padding:16px}#ppv-edpage .emod.on{display:flex}#ppv-edpage .emod .box{background:var(--bg,#1b1c21);border:1px solid var(--line,#444);border-radius:14px;padding:14px;width:min(520px,100%);max-height:88vh;overflow:auto;display:flex;flex-direction:column;gap:8px}#ppv-edpage .emod textarea,#ppv-edpage .emod input[type=text]{width:100%}#ppv-edpage .emod textarea{min-height:180px}#ppv-edpage .emod .acts{display:flex;gap:8px;justify-content:flex-end;margin-top:4px}';
      document.head.appendChild(ecss);
      const ov = mkEl('div'); ov.id = 'ppv-edpage';
      ov.innerHTML =
        '<div class="eh"><button id="e-back" data-keep="1">‹ Back</button><div class="tt"><b>Edit lyrics &amp; subtitles</b><small id="e-track">No track</small></div><span class="ebadge" id="e-badge">Saved</span></div>' +
        '<div class="ebanner" id="e-ban"><span>The player moved to another track.</span><button id="e-banload">Edit that track</button></div>' +
        '<div class="etr"><button id="e-b5" title="Back 5 seconds">−5s</button><button id="e-pp" class="pri" style="min-width:48px">▶</button><button id="e-f5" title="Forward 5 seconds">+5s</button><span class="etime" id="e-time">0:00.00 / 0:00</span><input type="range" id="e-scrub" min="0" max="1" step="0.05" value="0"><select id="e-rate" title="Playback speed"><option value="0.5">0.5×</option><option value="0.75">0.75×</option><option value="1" selected>1×</option><option value="1.25">1.25×</option><option value="1.5">1.5×</option></select></div>' +
        '<div class="etabs" id="e-tabs"><button data-t="lines" class="on">Lines</button><button data-t="timing">Timing</button><button data-t="text">Text</button><button data-t="rep">Repeats</button><button data-t="file">File</button><button data-t="view">View</button></div>' +
        '<div class="etool on" data-p="lines"><button id="e-undo">↶ Undo</button><button id="e-redo">↷ Redo</button><button id="e-add">+ Add line at playhead</button><button id="e-tap">⏱ Tap-sync mode</button><button id="e-sort">Sort by time</button></div>' +
        '<div class="etool" data-p="timing">' +
          '<label>Shift by <input type="number" id="e-sh" value="0.5" step="0.1" min="0" style="width:74px"> s</label>' +
          '<label>Apply to <select id="e-scope"><option value="all">all lines</option><option value="from">selected line and after</option><option value="sel">selected line only</option></select></label>' +
          '<div class="sep"></div><button id="e-shm">− Earlier</button><button id="e-shp">+ Later</button>' +
          '<div class="sep"></div><label>Stretch ×<input type="number" id="e-st" value="1.000" step="0.001" style="width:88px"></label><button id="e-stgo">Apply stretch</button>' +
          '<div class="sep"></div><button id="e-fit">Fit ends to next line</button><button id="e-auto">Reset ends to auto</button><button id="e-ovl">Remove overlaps</button><button id="e-rnd">Round to 0.1s</button>' +
          '<div class="sep"></div><label>Min length<input type="number" id="e-min" value="1" step="0.1" min="0.3" style="width:70px"> s</label><button id="e-mingo">Make short lines longer</button></div>' +
        '<div class="etool" data-p="text"><button id="e-fr">Find &amp; replace…</button><button id="e-trim">Trim spaces</button><button id="e-cap">Capitalise first letter</button><button id="e-up">UPPER</button><button id="e-low">lower</button><button id="e-brk">Remove [bracketed] text</button><button id="e-empty">Delete empty lines</button><button id="e-dup">Delete repeated lines</button></div>' +
        '<div class="etool" data-p="rep"><button id="e-rscan">Scan repeated lines</button><button id="e-rscanA">Scan with audio</button><button id="e-rall" class="pri">Apply to selected groups</button><button id="e-rsel">Select all</button><button id="e-rnone">Select none</button><label><input type="checkbox" id="e-rshow"> Also show repeats that already agree</label></div>' +
        '<div class="etool" data-p="file"><button id="e-sync">Sync my own lyrics…</button><button id="e-net">Find lyrics online…</button><button id="e-tr">Translate lyrics…</button><div class="sep"></div><button id="e-paste">Paste text…</button><button id="e-loadf">Open file…</button><button id="e-revert">Revert to saved</button><div class="sep"></div><button id="e-dsrt">Download .srt</button><button id="e-dlrc">Download .lrc</button><button id="e-dtxt">Download .txt</button><input type="file" id="e-file" accept=".srt,.vtt,.lrc,.txt" style="display:none"></div>' +
        '<div class="etool" data-p="view"><label><input type="checkbox" id="e-follow" checked> Follow playback</label><label><input type="checkbox" id="e-ends" checked> Show end times</label><label>Text size <select id="e-fs"><option value="s">Small</option><option value="m" selected>Medium</option><option value="l">Large</option><option value="x">Extra large</option></select></label></div>' +
        '<div class="efilter"><input type="text" id="e-q" placeholder="Search lines…"><span class="ecount" id="e-cnt"></span></div>' +
        '<div class="elist" id="e-list"></div>' +
        '<div class="etap" id="e-tapbar"><small id="e-tapinfo"></small><button id="e-tapbtn" class="pri">TAP — set start of selected line</button></div>' +
        '<div class="ebar"><button id="e-cancel" data-keep="1">Cancel</button><div class="st" id="e-st2">No changes</div><button id="e-save">Save</button><button id="e-ok" class="pri go" data-keep="1">✓ Confirm &amp; close</button></div>' +
        '<div class="etoast" id="e-toast"></div><div class="emod" id="e-mod"><div class="box" id="e-modbox"></div></div>';
      document.body.appendChild(ov);
      const $e = s => ov.querySelector(s), rowsEl = $e('#e-list');
      let sel = null, savedSnap = '[]', tapOn = false, prevRate = 1, toastT = 0;
      const toast = m => { const t = $e('#e-toast'); t.textContent = m; t.style.display = 'block'; clearTimeout(toastT); toastT = setTimeout(() => { t.style.display = 'none'; }, 2600); };
      const autoEnd = i => rows[i + 1] ? rows[i + 1].s : rows[i].s + 4;
      const endOf = i => { const r = rows[i]; return r.e != null && r.e > r.s ? r.e : autoEnd(i); };
      const sortRows = () => rows.sort((a, b) => a.s - b.s);
      const isDirty = () => JSON.stringify(rows) !== savedSnap;
      const upBar = () => { const d = isDirty(); $e('#e-badge').textContent = d ? 'Unsaved' : 'Saved'; $e('#e-badge').classList.toggle('dirty', d); $e('#e-st2').textContent = (d ? 'Unsaved changes · ' : 'All changes saved · ') + rows.filter(x => x.text.trim()).length + ' lines'; $e('#e-undo').disabled = !hist.length; $e('#e-redo').disabled = !fut.length; };
      const mut = fn => { snap(); fn(); render(); };
      const fixE = r => { if (r.e != null && r.e <= r.s) r.e = null; };
      const kind = () => (edTrack && edTrack.kind === 'video') ? 'subtitles' : 'synced lyrics';
      const modal = (title, body, acts) => { const b = $e('#e-modbox'); b.innerHTML = '<b>' + title + '</b>'; b.appendChild(body); const a = mkEl('div', 'acts'); acts.forEach(x => { const bt = mkEl('button', x.pri ? 'pri' : '', x.label); bt.onclick = () => { if (x.fn && x.fn() === false) return; if (!x.keep) $e('#e-mod').classList.remove('on'); }; a.appendChild(bt); }); b.appendChild(a); $e('#e-mod').classList.add('on'); };
      const closeModal = () => $e('#e-mod').classList.remove('on');
      const render = () => {
        const el = media(), now = el ? el.currentTime : -1, q = $e('#e-q').value.trim().toLowerCase(), showE = $e('#e-ends').checked;
        rowsEl.textContent = '';
        if (!rows.length) { rowsEl.appendChild(mkEl('div', 'eempty', 'No lines yet.<br>Use “+ Add line at playhead”, open the File tab to paste text or load a file, or generate with Whisper.')); upBar(); $e('#e-cnt').textContent = ''; return; }
        let shown = 0;
        rows.forEach((r, i) => {
          const d = mkEl('div', 'er' + (now >= r.s && now < endOf(i) ? ' on' : '') + (r === sel ? ' sel' : '') + (r.e != null && r.e <= r.s ? ' bad' : ''));
          if (q && r.text.toLowerCase().indexOf(q) < 0) d.classList.add('hide'); else shown++;
          d.onclick = ev => { if (ev.target.tagName === 'BUTTON') return; sel = r; rowsEl.querySelectorAll('.er.sel').forEach(x => x.classList.remove('sel')); d.classList.add('sel'); if (tapOn) tapInfo(); };
          const r1 = mkEl('div', 'r1'), num = mkEl('span', 'n', String(i + 1));
          const tin = mkEl('input', 'et'); tin.type = 'text'; tin.value = fmtT(r.s); tin.inputMode = 'decimal'; tin.title = 'Start time';
          tin.onchange = () => { const v = parseT(tin.value); if (isNaN(v)) { tin.value = fmtT(r.s); return; } snap(); r.s = v; fixE(r); sortRows(); render(); };
          const ein = mkEl('input', 'et'); ein.type = 'text'; ein.value = r.e != null ? fmtT(r.e) : ''; ein.placeholder = fmtT(autoEnd(i)); ein.title = 'End time (leave empty for automatic)'; ein.inputMode = 'decimal';
          ein.onchange = () => { const s = ein.value.trim(); snap(); if (!s) r.e = null; else { const v = parseT(s); if (isNaN(v)) { hist.pop(); ein.value = r.e != null ? fmtT(r.e) : ''; return; } r.e = v; } render(); };
          const nm = mkEl('button', '', '−.1'), np = mkEl('button', '', '+.1'); nm.title = 'Start 0.1s earlier'; np.title = 'Start 0.1s later';
          nm.onclick = () => mut(() => { r.s = Math.max(0, r.s - 0.1); if (r.e != null) r.e = Math.max(0, r.e - 0.1); sortRows(); }); np.onclick = () => mut(() => { r.s += 0.1; if (r.e != null) r.e += 0.1; sortRows(); });
          r1.append(num, tin); if (showE) r1.append(mkEl('span', 'arrow', '→'), ein); r1.append(nm, np);
          const tx = mkEl('textarea'); tx.value = r.text; tx.rows = 1; tx.placeholder = 'Line text'; let first = true;
          const fit = () => { if (!tx.offsetWidth) return; tx.style.height = 'auto'; tx.style.height = (tx.scrollHeight + 2) + 'px'; };   // hidden (width 0) -> leave it to the observer below
          if (window.ResizeObserver) { let lw = 0; new ResizeObserver(() => { const w = tx.offsetWidth; if (w && w !== lw) { lw = w; fit(); } }).observe(tx); }   // refit when the page is shown, rotated or the text size changes
          tx.oninput = () => { if (first) { snap(); first = false; } r.text = tx.value; fit(); upBar(); }; tx.onfocus = () => { sel = r; first = true; };
          const r3 = mkEl('div', 'r3');
          const B = (t, ttl, fn, cls) => { const b = mkEl('button', cls || '', t); b.title = ttl; b.onclick = fn; r3.appendChild(b); return b; };
          B('▶ Play', 'Jump here and play', () => { const e2 = media(); if (e2) { e2.currentTime = Math.max(0, r.s - 0.05); if (e2.play) e2.play().catch(() => {}); } sel = r; });
          B('⏱ Start', 'Set start to current time', () => { const e2 = media(); if (!e2) return; mut(() => { r.s = e2.currentTime; fixE(r); sortRows(); }); });
          B('⏱ End', 'Set end to current time', () => { const e2 = media(); if (!e2) return; if (e2.currentTime <= r.s) { toast('End must be after the start.'); return; } mut(() => { r.e = e2.currentTime; }); });
          B('＋ Below', 'Insert a new line after this one', () => { snap(); const n = { s: Math.min(endOf(i), r.s + 30), e: null, text: '' }; rows.splice(i + 1, 0, n); sel = n; render(); const t2 = rowsEl.querySelectorAll('textarea')[i + 1]; if (t2) t2.focus(); });
          B('⧉ Copy', 'Duplicate line', () => mut(() => { rows.splice(i + 1, 0, { s: endOf(i), e: null, text: r.text }); }));
          B('✂ Split', 'Split at the text cursor', () => { const p = tx.selectionStart; if (!r.text.trim() || p <= 0 || p >= tx.value.length) { toast('Tap inside the text at the split point first.'); return; } mut(() => { const a = r.text.slice(0, p).trim(), b = r.text.slice(p).trim(), mid = r.s + (endOf(i) - r.s) * (p / tx.value.length), oe = r.e; r.text = a; r.e = mid; rows.splice(i + 1, 0, { s: mid, e: oe, text: b }); }); });
          if (rows[i + 1]) B('⤵ Merge', 'Merge with the next line', () => mut(() => { const n = rows[i + 1]; r.text = (r.text.trim() + ' ' + n.text.trim()).trim(); r.e = n.e != null ? n.e : null; rows.splice(i + 1, 1); }));
          B('✕ Delete', 'Delete line', () => mut(() => { rows.splice(i, 1); if (sel === r) sel = null; }), 'danger');
          d.append(r1, tx, r3); rowsEl.appendChild(d); fit();
        });
        $e('#e-cnt').textContent = q ? shown + ' of ' + rows.length : rows.length + ' lines';
        upBar();
      };
      const load = () => {
        const t = cur(); if (!t) { toast('Play or select a track first.'); return false; }
        edTrack = t; edId = t.dbId; hist = []; fut.length = 0; rows = []; sel = null;
        try {
          if (t.kind === 'video') { const o = JSON.parse(localStorage.getItem('playerSubtitles') || '{}')[t.dbId]; const c = o && (Array.isArray(o) ? o.map(x => [x.start, x.end, x.text]) : o.c); if (c) rows = c.map(x => ({ s: +x[0], e: +x[1], text: String(x[2]) })); }
          else { const o = JSON.parse(localStorage.getItem('playerLyricsV1') || '{}')[t.dbId]; if (o) { rows = parseLrcText(o); if (!rows.length) rows = plain(String(o)); } if (!rows.length) { const s = JSON.parse(localStorage.getItem('playerSubtitles') || '{}')[t.dbId], c = s && (Array.isArray(s) ? s.map(x => [x.start, x.end, x.text]) : s.c); if (c) rows = c.map(x => ({ s: +x[0], e: +x[1], text: String(x[2]) })); } }
        } catch (e) {}
        { const am = rpAltsLoad(t.dbId); rows.forEach(r => { let b = null; am.forEach(a => { const d = Math.abs(a[0] - r.s); if (d < 1.0 && (!b || d < b.d)) b = { d, a: a[1] }; }); if (b) r.alts = b.a.slice(); }); }
        savedSnap = JSON.stringify(rows); $e('#e-track').textContent = t.title + ' · ' + (t.kind === 'video' ? 'subtitles' : 'lyrics'); $e('#e-ban').classList.remove('on');
        render(); return true;
      };
      const open = () => { if (!edTrack || (cur() && cur().dbId !== edId)) { if (!load()) return; } else render(); ov.classList.add('open'); edet.open = true; document.body.style.overflow = 'hidden'; const m = media(); if (m) { prevRate = m.playbackRate || 1; m.playbackRate = +$e('#e-rate').value; } tickT(); };
      const close = () => { ov.classList.remove('open'); edet.open = false; closeModal(); document.body.style.overflow = ''; const m = media(); if (m) m.playbackRate = prevRate; tapOn = false; $e('#e-tapbar').classList.remove('on'); $e('#e-tap').classList.remove('pri'); };
      const back = () => { if (isDirty() && !confirm('Discard unsaved changes?')) return; close(); };
      const save = () => {
        const t = edTrack || cur(); if (!t) { toast('Play or select a track first.'); return false; }
        const cues = toCues(); if (!cues.length) { toast('Nothing to save: add at least one line with text.'); return false; }
        const a = A(), lyr = window.__ppLyrics;
        if (t.kind === 'video' || !lyr) a.setSubtitles(t.dbId, cues, 'Edited.srt'); else lyr.set(t.dbId, toLrc(cues)); if (t.kind !== 'video' && lyr) { try { a.setSubtitles(t.dbId, cues, 'Edited.srt'); } catch (e) {} }
        lastSrt = { name: t.title, text: toSrt(cues) }; wsrt.style.display = '';
        edId = t.dbId; savedSnap = JSON.stringify(rows); try { rpAltsSave(t.dbId, rows.map(r => ({ s: r.s, alts: r.alts }))); } catch (e) {} upBar(); toast('Saved ' + cues.length + ' lines as ' + (t.kind === 'video' ? 'subtitles' : 'synced lyrics') + '.'); return true;
      };
      const dlFile = ext => {
        const t = edTrack || cur(); if (!t) return; const cues = toCues(); if (!cues.length) { toast('Nothing to download yet.'); return; }
        const body = ext === 'srt' ? toSrt(cues) : ext === 'lrc' ? toLrc(cues) : cues.map(c => c.text).join('\n'), blob = new Blob([body], { type: 'text/plain' }), name = t.title.replace(/[\\/:*?"<>|]+/g, '_') + '.' + ext;
        if (window.ppSaveBlob) { window.ppSaveBlob(blob, name); return; }
        const u = URL.createObjectURL(blob), a = document.createElement('a'); a.href = u; a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(u), 10000);
      };
