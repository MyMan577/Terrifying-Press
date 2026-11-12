    // ---- building ----
    async function sBuild(sp) {
      const A = window.__ppApi, tr = A.tracks(), tg = loadTags(), real = sReal();
      if (!real.length) throw new Error('Your library is empty.');
      const F = new Map(real.map(i => [i, sFeat(tg[tr[i].dbId])])), taste = sTaste(), art = i => sNrm(tr[i].artist || '');
      const size = Math.max(5, Math.min(100, sp.size || 20)), exSet = new Set(sp.exclude), inc = [...new Set(sp.include)].filter(i => !exSet.has(i));
      let pool = real.filter(i => !exSet.has(i) && !sp.exArtists.includes(art(i)));
      if (sp.exVibes.length || sp.exWords.length) pool = pool.filter(i => { const c = tg[tr[i].dbId]; if (!c) return true; const v = vibes(c), tw = ' ' + tagWords(c) + ' '; return !sp.exVibes.some(x => v.includes(x)) && !sp.exWords.some(x => tw.includes(' ' + x + ' ')); });
      if (sp.themeSet) { const st = new Set(sp.themeSet); pool = pool.filter(i => st.has(i)); }
      const forced = [...new Set((sp.kind === 'similar' ? sp.seeds : []).concat(inc))].filter(i => !exSet.has(i)).slice(0, size), fs = new Set(forced), cand = pool.filter(i => !fs.has(i));
      if (!cand.length && !forced.length) throw new Error('Nothing in your library fits that. Tagging more tracks helps me match moods and styles.');
      const seeds = sp.kind === 'similar' ? sp.seeds : sp.kind === 'custom' ? inc : taste.anchors.map(a => a[0]), wts = sp.kind === 'similar' || sp.kind === 'custom' ? null : taste.anchors.map(a => a[1]);
      let emb = null; if (seeds.length && sp.kind !== 'redisc') { try { emb = await sEmbScores(seeds, wts); } catch (e) { console.warn(e); } }
      if (sp.kind === 'similar' && !emb && sp.seeds.every(i => !F.get(i))) throw new Error('Tag \u201c' + (sp.seeds.length ? tr[sp.seeds[0]].title : 'that song') + '\u201d first, so I can tell what it sounds like.');
      let lo = 9, hi = -9; if (emb) cand.forEach(i => { const e = emb.get(i); if (e != null) { if (e < lo) lo = e; if (e > hi) hi = e; } }); const span = (hi - lo) || 1, R = new Map(), nPlay = i => taste.count.get(i) || 0;
      cand.forEach(i => {
        let r;
        if (sp.kind === 'redisc') r = Math.log(1 + nPlay(i)) / 4;
        else if (!seeds.length) r = .5;
        else { let a = 0, b = 0; seeds.forEach((sd, k) => { const ww = wts ? wts[k] : 1; a += ww * sFSim(F.get(i), F.get(sd)); b += ww; }); const e = emb && emb.get(i); r = e != null ? .65 * ((e - lo) / span) + .35 * (a / b) : a / b; }
        R.set(i, r + (Math.random() - .5) * .06);
      });
      let list = cand;
      if (sp.kind === 'discover') { list = cand.filter(i => !nPlay(i)); if (list.length < 5) throw new Error('You have already played almost everything, so there is not much new to find.'); }
      if (sp.kind === 'redisc') { const old = d => cand.filter(i => nPlay(i) >= 2 && (!taste.last.get(i) || Date.now() - taste.last.get(i) > d * 864e5)); list = old(30); if (list.length < 8) list = old(14); if (list.length < 5) throw new Error('I do not see enough songs you have drifted away from yet.'); }
      const need = Math.max(0, size - forced.length), lam = { foryou: .62, discover: .65, redisc: .7, similar: .8, custom: .6 }[sp.kind];
      const cap = sp.noCap ? 1e9 : sp.kind === 'foryou' || sp.kind === 'discover' ? Math.max(1, Math.round(size / 10)) : Math.max(2, Math.ceil(size / (sp.kind === 'similar' ? 5 : 6)));
      const pick = (arr, k, al) => sMMR(arr, i => R.get(i) || 0, F, k, lam, cap, tr, al), usedHistory = taste.anchors.length > 0;
      let picked;
      if (sp.kind === 'foryou' && usedHistory) {   // ~70% songs you know that fit your taste, ~30% you have not played yet
        const un = list.filter(i => !nPlay(i)), pn = pick(un, Math.min(un.length, Math.round(need * .3)), forced), po = pick(list.filter(i => nPlay(i)), need - pn.length, forced.concat(pn));
        picked = pn.concat(po); if (picked.length < need) { const ps = new Set(picked); picked = picked.concat(pick(list.filter(i => !ps.has(i)), need - picked.length, forced.concat(picked))); }
      } else picked = pick(list, need, forced);
      const all = forced.concat(picked); if (!all.length) throw new Error('Nothing in your library fits that.');
      const first = sp.kind === 'similar' ? sp.seeds[0] : all.slice().sort((a, b) => (R.get(b) || 0) - (R.get(a) || 0))[0];
      const idx = sFlow(all, F, tr, first);
      return { idx, ids: idx.map(i => tr[i].dbId), newN: idx.filter(i => !nPlay(i)).length, artists: new Set(idx.map(art)).size, usedHistory, emb: !!emb, forced: forced.length };
    }
    async function sMakePl(sp, note, again) {
      const A = window.__ppApi, r = await sBuild(sp), tr = A.tracks(), day = new Date().toLocaleDateString(undefined, { weekday: 'short' }), th = sp.theme ? sp.theme.replace(/\b\w/g, c => c.toUpperCase()).slice(0, 28) : '';
      const name = (sp.name || ({ foryou: '\u2728 For you \u00b7 ' + (th || day), discover: '\ud83e\udded Discover' + (th ? ' \u00b7 ' + th : ''), redisc: '\ud83d\udd70\ufe0f Forgotten favorites', similar: '\ud83d\udd17 Like ' + (sp.seeds.length ? tr[sp.seeds[0]].title.slice(0, 26) : 'songs') + (sp.seeds.length > 1 && !(sp.said.seed[0] || '').startsWith('\u201c') ? '' : sp.seeds.length > 1 ? ' +' + (sp.seeds.length - 1) : ''), custom: '\ud83e\udd16 ' + (th || 'Custom mix') }[sp.kind])).slice(0, 60);
      const pl = A.createPlaylist(name); r.ids.forEach(id => A.addToPlaylist(id, pl.id)); pl.order = r.ids.slice(); pl.bloop = sp.kind; pl.bname = pl.name; pl.bat = Date.now();
      if (sp.kind === 'foryou' || sp.kind === 'discover' || sp.kind === 'redisc') A.playlists().filter(p => p.bloop === sp.kind && p.id !== pl.id && p.name === p.bname).sort((x, y) => (y.bat || 0) - (x.bat || 0)).slice(2).forEach(p => A.deletePlaylistQuiet(p.id));
      A.commitPlaylists();
      const n = r.idx.length, plural = (k, w) => k + ' ' + w + (k === 1 ? '' : 's');
      let msg = '\u2713 Made \u201c' + pl.name + '\u201d with ' + plural(n, 'track') + '. ';
      if (sp.kind === 'foryou') msg += r.usedHistory ? (n - r.newN) + ' you already like and ' + r.newN + ' you have not played yet, across ' + plural(r.artists, 'artist') + '.' : 'I have no listening history yet, so this is a varied mix from your tags. It gets personal as you listen.';
      else if (sp.kind === 'discover') msg += 'All unplayed, picked to sit close to your taste' + (r.usedHistory ? '' : ' (no history yet, so mostly variety)') + '.';
      else if (sp.kind === 'redisc') msg += 'Songs you used to play and have not lately.';
      else if (sp.kind === 'similar') msg += 'Starts with ' + sp.said.seed.join(', ') + ', then the closest ' + (r.emb ? 'by sound' : 'by tags (analysing the song with the tagger gives better matches)') + ', spread over ' + plural(r.artists, 'artist') + '.';
      else msg += r.forced ? plural(r.forced, 'song') + ' you asked for, and the rest picked to fit them.' : '';
      if (sp.said.exc.length) msg += ' Left out: ' + sp.said.exc.join(', ') + '.';
      if (sp.said.inc.length && !r.forced) msg += ' Included: ' + sp.said.inc.join(', ') + '.';
      if (sp.miss.length) msg += ' I could not find ' + sp.miss.map(x => '\u201c' + x + '\u201d').join(', ') + ', so I skipped ' + (sp.miss.length > 1 ? 'those' : 'it') + '.';
      note.textContent = msg.trim();
      smartSt.pu = { at: Date.now(), label: 'Deleted \u201c' + pl.name + '\u201d.', undo: () => { A.deletePlaylistQuiet(pl.id); A.commitPlaylists(); } };
      actions([['\u25b6 Play it', () => { A.play(r.idx[0], r.idx); }], ['\ud83d\udd04 Another take', (b, d) => { d.remove(); smartSt.pu = null; A.deletePlaylistQuiet(pl.id); A.commitPlaylists(); sRunPl(sp); }]]);
    }
    function sRunPl(sp) {
      unloadModel(); const note = add('bot', '\u2026 working out your picks');
      sMakePl(sp, note).catch(e => { console.error(e); note.textContent = 'I could not build that: ' + e.message; });
    }
    // ---- add / remove by name: "add Hello to my gym playlist", "take the slow songs out of chill", "remove Drake from road trip" ----
    function sParseEdit(t) {
      const CURW = /^(?:this|it|that|the current|current)(?: song| track| one)?$/i; let m;
      if ((m = t.match(/^(?:add|put|throw|drop|stick)\s+(.+?)\s+(?:to|into|in|onto)\s+(?:my |the )?(.+?)(?:\s+playlist)?$/i)) && !CURW.test(m[1].trim())) return { op: 'add', what: m[1], pl: m[2] };
      if ((m = t.match(/^(?:remove|take|drop|delete|get rid of|kick|pull|cut|clear)\s+(.+?)\s+(?:from|out of|off(?: of)?)\s+(?:my |the )?(.+?)(?:\s+playlist)?$/i)) && !CURW.test(m[1].trim())) return { op: 'remove', what: m[1], pl: m[2] };
      return null;
    }
    function sEdit(ed, t) {
      const A = window.__ppApi, tr = A.tracks(), pls = A.playlists().filter(p => !p.stemOf), want = sNrm(ed.pl);
      const pl = want && (pls.find(p => sNrm(p.name) === want) || pls.find(p => sNrm(p.name).includes(want)));
      if (!pl && !/\bplaylist\b/i.test(t)) return false;   // "drop the bass from this song" is not a playlist edit
      if (!pl) return sSay('I cannot find a playlist called \u201c' + ed.pl + '\u201d.' + (pls.length ? ' You have: ' + pls.slice(0, 6).map(p => p.name).join(', ') + '.' : ''));
      const tg = loadTags(), real = sReal(), inPl = i => (tr[i].playlistIds || []).includes(pl.id), miss = [], labels = []; let hit = [];
      sMentions(ed.what).forEach(m => {
        const r = sResolve(m); if (!r || r.none) { miss.push(m); return; }
        let idx = r.vibes ? real.filter(i => { const c = tg[tr[i].dbId]; return c && r.vibes.every(v => vibes(c).includes(v)); }) : r.tracks;
        labels.push(sLabel(r, m)); hit = hit.concat(r.vibes || r.words ? idx.slice(0, 50) : idx);
      });
      hit = [...new Set(hit)]; const missTxt = miss.length ? ' I could not find ' + miss.map(x => '\u201c' + x + '\u201d').join(', ') + '.' : '';
      if (ed.op === 'add') {
        const todo = hit.filter(i => !inPl(i)); if (!todo.length) return sSay(hit.length ? 'Those are already in ' + pl.name + '.' + missTxt : 'I could not match that to any songs.' + missTxt);
        todo.forEach(i => A.addToPlaylist(tr[i].dbId, pl.id)); A.commitPlaylists();
        smartSt.pu = { at: Date.now(), label: 'Took them back out of ' + pl.name + '.', undo: () => { todo.forEach(i => A.removeFromPlaylist(tr[i].dbId, pl.id)); A.commitPlaylists(); } };
        return sDone('Added ' + todo.length + ' track' + (todo.length === 1 ? '' : 's') + ' (' + labels.join(', ') + ') to ' + pl.name + (hit.length > todo.length ? '; ' + (hit.length - todo.length) + ' were already in it' : '') + '.' + missTxt);
      }
      const del = hit.filter(inPl); if (!del.length) return sSay(hit.length ? 'None of those are in ' + pl.name + '.' + missTxt : 'I could not match that to any songs.' + missTxt);
      const go = () => { del.forEach(i => A.removeFromPlaylist(tr[i].dbId, pl.id)); A.commitPlaylists(); smartSt.pu = { at: Date.now(), label: 'Put them back in ' + pl.name + '.', undo: () => { del.forEach(i => A.addToPlaylist(tr[i].dbId, pl.id)); A.commitPlaylists(); } }; sDone('Removed ' + del.length + ' track' + (del.length === 1 ? '' : 's') + ' (' + labels.join(', ') + ') from ' + pl.name + '. They stay in your library.' + missTxt); };
      if (del.length > 8) askYN('Remove ' + del.length + ' tracks from \u201c' + pl.name + '\u201d? They stay in your library, and I can undo it.', go); else go();
      return true;
    }
    function sPlaylistCmd(t) {
      if (!window.__ppApi || t.length > 220) return false;
      const ed = sParseEdit(t); if (ed && sEdit(ed, t)) { smartSt.last = t; smartSt.at = Date.now(); return true; }
      const sp = sParsePl(t); if (!sp) return false;
      smartSt.last = t; smartSt.at = Date.now(); sRunPl(sp); return true;
    }
    // PLAYLISTS END

    // LIVE MIXES START
    // ---------- Live mixes: ✨ For You, 💜 Ones You May Like, 🔗 Your Pattern ----------
    // Real playlists that keep changing while you use the player. Each pass drops songs that had their turn (played), got skipped,
    // were removed by you, or are stale, then refills from your taste. "Your Pattern" is driven by what you play next to what:
    // a small co-listening matrix learned from your own play history (videos included), blended with sound similarity.
    // Songs you add yourself are never touched. Switch off with the "Auto mixes" checkbox in the Library tab.
    const lvLs = (k, v) => { try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch (e) {} };
    const lvOn = () => lvLs('ppvLiveMix') !== '0';
    const LV_DAY = 864e5;
    let lvS = null, lvCur = null, lvBusy = false, lvLast = 0, lvTimer = null, lvTagVer = -1;
    const lvState = () => { if (lvS) return lvS; try { lvS = JSON.parse(lvLs('ppvLiveV1')) || {}; } catch (e) { lvS = {}; } lvS.seq = lvS.seq || []; lvS.co = lvS.co || {}; lvS.sk = lvS.sk || {}; lvS.meta = lvS.meta || {}; lvS.dk = lvS.dk || Date.now(); lvS.blocked = lvS.blocked || {}; return lvS; };
    const lvSave = () => lvLs('ppvLiveV1', JSON.stringify(lvS));
    function lvBump(a, b, w) {
      const co = lvState().co, row = co[a] || (co[a] = {}); row[b] = (row[b] || 0) + w;
      const ks = Object.keys(row); if (ks.length > 30) { ks.sort((x, y) => row[x] - row[y]); ks.slice(0, ks.length - 30).forEach(k => delete row[k]); }
    }
    function lvDecay() {   // old habits fade: x0.9 per day since the last pass
      const s = lvState(), days = Math.floor((Date.now() - s.dk) / LV_DAY); if (days < 1) return;
      const f = Math.pow(0.9, Math.min(days, 30)); s.dk = Date.now();
      Object.keys(s.co).forEach(a => { const r = s.co[a]; Object.keys(r).forEach(b => { r[b] *= f; if (r[b] < 0.05) delete r[b]; }); if (!Object.keys(r).length) delete s.co[a]; });
      const ks = Object.keys(s.co); if (ks.length > 600) ks.map(a => [a, Object.values(s.co[a]).reduce((x, y) => x + y, 0)]).sort((x, y) => x[1] - y[1]).slice(0, ks.length - 500).forEach(x => delete s.co[x[0]]);
    }
    function lvEnd() {   // a track just stopped being current: skipped, partly heard or finished?
      if (!lvCur) return; const s = lvState(), { id, frac, secs } = lvCur; lvCur = null; if (secs < 5) return;
      const now = Date.now(), skipped = frac < 0.25 && secs < 45;
      if (skipped) { const k = s.sk[id] || [0, 0]; s.sk[id] = [k[0] + 1, now]; }
      else if (frac >= 0.8 && s.sk[id]) s.sk[id][0] = Math.max(0, s.sk[id][0] - 1);   // finishing a song forgives an old skip
      if (!skipped && frac >= 0.4) {
        const prev = s.seq.filter(e => now - e[1] < 30 * 60000).slice(-3);
        prev.forEach((e, k) => { if (e[0] === id) return; const w = (frac >= 0.8 ? 1 : 0.6) * (k === prev.length - 1 ? 1 : 0.5); lvBump(e[0], id, w); lvBump(id, e[0], w); });
        s.seq.push([id, now, +frac.toFixed(2)]); if (s.seq.length > 500) s.seq.splice(0, s.seq.length - 500);
      }
      lvSave();
    }
    function lvPoll() {
      const A = window.__ppApi; if (!A || !A.tracks || !lvOn()) return;
      const tr = A.tracks(), i = A.currentIndex(), t = i >= 0 ? tr[i] : null, id = t && !t.stem ? String(t.dbId) : null;
      const m = [...document.querySelectorAll('audio,video')].find(x => !x.paused && !x.ended);
      if (lvCur && m && id === lvCur.id && m.duration > 0) { lvCur.frac = Math.max(lvCur.frac, m.currentTime / m.duration); lvCur.secs = Math.max(lvCur.secs, m.currentTime); }
      if ((lvCur ? lvCur.id : null) !== id) { lvEnd(); lvCur = id ? { id, frac: 0, secs: 0 } : null; lvKick(8000); }
      if (tagVer !== lvTagVer) { lvTagVer = tagVer; lvKick(30000); }
    }
    function lvKick(ms) { if (!lvOn()) return; clearTimeout(lvTimer); lvTimer = setTimeout(() => lvRefresh().catch(e => console.warn('live mixes', e)), Math.max(ms, lvLast + 120000 - Date.now())); }
    const lvSp = (kind, size, exclude, include) => ({ kind, seeds: [], include, exclude, exArtists: [], exVibes: [], exWords: [], themeWords: [], themeSet: null, theme: '', size, name: '', miss: [], said: { seed: [], inc: [], exc: [] }, noCap: true });
    const lvViaBuild = kind => async (need, banned, kept, size) => { const r = await sBuild(lvSp(kind, size, [...banned], [...kept])); return r.idx.filter(i => !kept.has(i)).slice(0, need); };
    async function lvPattern(need, banned, kept, size) {
      const A = window.__ppApi, tr = A.tracks(), s = lvState(), tg = loadTags(), real = sReal(), idx = new Map(tr.map((t, i) => [String(t.dbId), i])), anchors = new Map();
      s.seq.slice(-30).reverse().forEach((e, k) => { const i = idx.get(e[0]); if (i != null) anchors.set(i, (anchors.get(i) || 0) + e[2] * Math.exp(-k / 12)); });
      if (!anchors.size) sTaste().anchors.slice(0, 8).forEach(([i, w]) => anchors.set(i, w));   // no session history yet: use overall taste
      if (!anchors.size) return lvViaBuild('foryou')(need, banned, kept, size);   // nothing to correlate yet: still fill it
      const cs = new Map();   // co-listening: how often each song showed up next to what you played lately
      anchors.forEach((w, a) => { const row = s.co[String(tr[a].dbId)]; if (!row) return; const tot = Object.values(row).reduce((x, y) => x + y, 0) || 1; Object.entries(row).forEach(([b, v]) => { const j = idx.get(b); if (j != null) cs.set(j, (cs.get(j) || 0) + w * v / tot); }); });
      let cmax = 0; cs.forEach(v => { if (v > cmax) cmax = v; });
      const ids = [...anchors.keys()], wts = ids.map(i => anchors.get(i)); let emb = null; try { emb = await sEmbScores(ids, wts); } catch (e) {}
      let lo = 9, hi = -9; if (emb) emb.forEach(e => { if (e < lo) lo = e; if (e > hi) hi = e; }); const span = (hi - lo) || 1;
      const F = new Map(real.map(i => [i, sFeat(tg[tr[i].dbId])])), now = Date.now(), R = new Map();
      const tagS = i => { let a = 0, b = 0; ids.forEach((sd, k) => { a += wts[k] * sFSim(F.get(i), F.get(sd)); b += wts[k]; }); return b ? a / b : 0; };
      const cand = real.filter(i => !banned.has(i) && !kept.has(i) && !anchors.has(i));
      cand.forEach(i => {
        const e = emb && emb.get(i), sk = s.sk[String(tr[i].dbId)], pen = sk && sk[0] > 0 && now - sk[1] < 21 * LV_DAY ? 0.15 * sk[0] : 0;
        R.set(i, 0.5 * (cmax ? (cs.get(i) || 0) / cmax : 0) + 0.3 * (e != null ? (e - lo) / span : 0) + 0.2 * tagS(i) - pen + Math.random() * 0.04);
      });
      return sMMR(cand, i => R.get(i) || 0, F, need, 0.75, 1e9, tr, [...kept]);
    }
    const LV_MIXES = [
      { key: 'foryou', name: '✨ For You', size: 25, ttl: 3, block: 3, pick: lvViaBuild('foryou') },
      { key: 'maylike', name: '💜 Ones You May Like', size: 20, ttl: 7, block: 30, pick: lvViaBuild('discover') },
      { key: 'pattern', name: '🔗 Your Pattern', size: 20, ttl: 5, block: 3, pick: lvPattern }
    ];
    async function lvSync(mx) {
      const A = window.__ppApi, s = lvState(), tr = A.tracks(), now = Date.now(); if (!sReal().length) return;
      const meta = s.meta[mx.key] || (s.meta[mx.key] = { added: {}, block: {} }), byId = new Map(tr.map((t, i) => [String(t.dbId), i]));
      let pl = A.playlists().find(p => p.liveKey === mx.key) || A.playlists().find(p => p.name === mx.name);
      const members = pl ? tr.map((t, i) => i).filter(i => !tr[i].stem && (tr[i].playlistIds || []).includes(pl.id)) : [], mem = new Set(members.map(i => String(tr[i].dbId)));
      const removedNow = new Set(); Object.keys(meta.added).forEach(id => { if (pl && !mem.has(id)) { if (byId.has(id)) removedNow.add(byId.get(id)); delete meta.added[id]; } });   // you took it out: no block, it is only skipped for this pass (use Block to keep it out)
      const cur = A.currentIndex() >= 0 ? String(tr[A.currentIndex()].dbId) : null, lastPlay = {}; s.seq.forEach(e => { lastPlay[e[0]] = Math.max(lastPlay[e[0]] || 0, e[1]); });
      const drop = members.filter(i => s.blocked[String(tr[i].dbId)]).map(i => String(tr[i].dbId)); let aged = 0;   // blocked songs always leave const maxAged = Math.ceil(mx.size * 0.3);
      Object.entries(meta.added).forEach(([id, at]) => {
        if (id === cur || drop.includes(id)) return;              // never pull the song that is playing
        const sk = s.sk[id], played = (lastPlay[id] || 0) > at, skipped = sk && sk[1] > at && sk[0] >= 2;
        if (skipped) { drop.push(id); meta.block[id] = now + 7 * LV_DAY; }
        else if (played && mx.key === 'maylike') { drop.push(id); meta.block[id] = now + mx.block * LV_DAY; }   // no longer new to you
        else if (now - at > mx.ttl * LV_DAY && aged < maxAged) { drop.push(id); aged++; meta.block[id] = now + 2 * LV_DAY; }
      });
      Object.keys(meta.block).forEach(id => { if (meta.block[id] < now) delete meta.block[id]; });
      const banned = new Set(removedNow); Object.keys(meta.block).forEach(id => { if (byId.has(id)) banned.add(byId.get(id)); });
      Object.keys(s.blocked).forEach(id => { if (byId.has(id)) banned.add(byId.get(id)); });   // manual blocks
      const dset = new Set(drop), kept = new Set(members.filter(i => !dset.has(String(tr[i].dbId)))), need = mx.size - kept.size;
      let adds = []; if (need > 0) { try { adds = await mx.pick(need, banned, kept, mx.size); } catch (e) { console.info('live mix', mx.key, e.message); } }
      if (!drop.length && !adds.length) return;
      if (!pl) { if (!adds.length) return; pl = A.createPlaylist(mx.name); }
      pl.auto = 'live'; pl.liveKey = mx.key;
      drop.forEach(id => { if (byId.has(id)) A.removeFromPlaylist(tr[byId.get(id)].dbId, pl.id); delete meta.added[id]; });
      const added = []; adds.forEach(i => { if (A.addToPlaylist(tr[i].dbId, pl.id)) { meta.added[String(tr[i].dbId)] = now; added.push(tr[i].dbId); } });
      const keepIds = members.filter(i => !dset.has(String(tr[i].dbId))).map(i => tr[i].dbId), old = (pl.order || []).filter(id => keepIds.some(k => String(k) === String(id)));
      pl.order = old.concat(keepIds.filter(id => !old.some(o => String(o) === String(id))), added);
      A.commitPlaylists();
    }
    async function lvRefresh(force) {
      const A = window.__ppApi; if (lvBusy || !lvOn() || !A || !A.tracks || !A.playlists) return;
      if (!force && Date.now() - lvLast < 120000) return;
      lvBusy = true;
      try { lvEnd(); lvDecay(); for (const mx of LV_MIXES) { try { await lvSync(mx); } catch (e) { console.warn('live mix', mx.key, e); } } lvLast = Date.now(); lvSave(); } finally { lvBusy = false; }
    }
    const lvBlock = (ids, on) => { const s = lvState(); [].concat(ids).forEach(id => { if (on) s.blocked[String(id)] = Date.now(); else delete s.blocked[String(id)]; }); lvSave(); lvRefresh(true).catch(() => {}); };
    window.__ppLiveMixes = { refresh: () => lvRefresh(true), block: id => lvBlock(id, true), unblock: id => lvBlock(id, false), blocked: () => Object.keys(lvState().blocked) };
    setInterval(lvPoll, 1500); setInterval(() => lvKick(0), 15 * 60000); lvKick(10000);
    // LIVE MIXES END

    // CHAT HELPERS START
    // ---------- Chat box: quick-action chips, type-ahead, guided playlist, mix commands (all with undo) ----------
    { const st = document.createElement('style'); st.textContent = '#ppv-chat .ch-chips,#ppv-chat .ch-sug{display:flex;gap:6px;overflow-x:auto;padding:4px 8px;flex-shrink:0}#ppv-chat .ch-sug:empty{display:none}#ppv-chat .ch-chips button,#ppv-chat .ch-sug button{white-space:nowrap;border-radius:14px;padding:5px 10px;border:1px solid #555;background:#2f3037;color:#eee;font-size:12px;cursor:pointer}#ppv-chat .ch-menu:empty{display:none}#ppv-chat .ch-menu{flex-wrap:wrap;overflow-x:visible;overflow-y:auto;max-height:96px}#ppv-chat .ch-chips button.on{background:var(--accent,#7c3aed);border-color:var(--accent,#7c3aed)}'; document.head.appendChild(st); }
    const lcSug = document.createElement('div'), lcChipBar = document.createElement('div'), lcMenuBtns = document.createElement('div'), lcMenuBar = document.createElement('div'); lcSug.className = 'ch-sug'; lcChipBar.className = 'ch-chips'; lcMenuBtns.className = 'ch-chips'; lcMenuBar.className = 'ch-chips ch-menu';
    cbox.querySelector('.ch-i').before(lcSug, lcChipBar, lcMenuBtns, lcMenuBar);
    const lcUndo = (label, undo) => { smartSt.pu = { at: Date.now(), label, undo }; };
    const lcChoice = (q, opts) => { add('bot', q); actions(opts.map(([t, fn]) => [t, (b, d) => { d.remove(); fn(); }])); };
    const lcSize = fn => lcChoice('How many songs?', [['10', () => fn(10)], ['20', () => fn(20)], ['40', () => fn(40)]]);
    function lcPlayMix(key) {
      const A = window.__ppApi, tr = A.tracks(), pl = A.playlists().find(p => p.liveKey === key); if (!pl) return null;
      const idx = tr.map((t, i) => i).filter(i => !tr[i].stem && (tr[i].playlistIds || []).includes(pl.id)); if (!idx.length) return null;
      const ord = (pl.order || []).map(id => tr.findIndex(t => String(t.dbId) === String(id))).filter(i => idx.includes(i)), q = ord.length ? ord : idx;
      A.play(q[0], q); return pl.name;
    }
    function lcPlaySomething() {
      const A = window.__ppApi, n = lcPlayMix('foryou') || lcPlayMix('pattern') || lcPlayMix('maylike');
      if (n) return add('bot', '\u25b6 Playing ' + n + '.');
      const r = sReal(); if (!r.length) return add('bot', 'Your library is empty.');
      const q = r.slice().sort(() => Math.random() - 0.5).slice(0, 30); A.play(q[0], q); add('bot', '\u25b6 Playing a random pick from your library.');
    }
    function guidePl() {
      const A = window.__ppApi, ci = A.currentIndex(), cur = ci >= 0 ? A.tracks()[ci] : null, tr = A.tracks();
      const moods = () => lcChoice('Which mood?', [['Chill', 'chill'], ['Happy', 'happy'], ['Workout', 'workout'], ['Focus', 'focus'], ['Party', 'party'], ['Sad', 'sad']].map(([t, id]) => [t, () => moodPlaylist(id)]));
      const artists = () => {
        const cnt = {}, nm = {}; sReal().forEach(i => { const a = sNrm(tr[i].artist || ''); if (a) { cnt[a] = (cnt[a] || 0) + 1; nm[a] = tr[i].artist; } });
        const top = Object.keys(cnt).sort((x, y) => cnt[y] - cnt[x]).slice(0, 6); if (!top.length) return add('bot', 'I do not see artist names on your tracks yet.');
        lcChoice('Which artist?', top.map(a => [nm[a], () => lcSize(n => { const idx = sReal().filter(i => sNrm(tr[i].artist || '') === a); const sp = lvSp('custom', n, [], idx.slice(0, 6)); sp.name = '\ud83c\udfa4 ' + nm[a]; sRunPl(sp); })]));
      };
      const opts = [['\ud83d\ude0c A mood', moods]];
      if (cur) opts.push(['\ud83d\udd17 Like this song', () => lcSize(n => { const sp = lvSp('similar', n, [], []); sp.seeds = [ci]; sp.said.seed = ['\u201c' + cur.title + '\u201d']; sRunPl(sp); })]);
      opts.push(['\ud83c\udfa4 An artist', artists], ['\ud83c\udfb2 Surprise me', () => send('surprise me', true)]);
      lcChoice('What kind of playlist?', opts);
    }
    function lcWhy() {
      const A = window.__ppApi, i = A.currentIndex(); if (i < 0) return 'Play a track first.';
      const tr = A.tracks(), t = tr[i], id = String(t.dbId), s = lvState(), tg = loadTags(), mixes = A.playlists().filter(p => p.liveKey && (t.playlistIds || []).includes(p.id));
      if (!mixes.length) return '\u201c' + t.title + '\u201d is not in any of your auto mixes right now.';
      const why = [], title = x => { const j = tr.find(q => String(q.dbId) === x); return j && j.title; };
      const near = [...new Set(s.seq.slice(-15).map(e => e[0]))].filter(x => x !== id && s.co[x] && s.co[x][id] > 0).slice(0, 2).map(title).filter(Boolean);
      if (near.length) why.push('you often play it near ' + near.map(x => '\u201c' + x + '\u201d').join(' and '));
      const F = sFeat(tg[t.dbId]);
      if (F) { let best = -1, bs = 0; sTaste().anchors.slice(0, 5).forEach(([a]) => { const sc = sFSim(F, sFeat(tg[tr[a].dbId])); if (sc > bs) { bs = sc; best = a; } });
        if (best >= 0 && bs > 0.25) { const G = sFeat(tg[tr[best].dbId]), sh = [...F.v, ...F.g].filter(x => G.v.has(x) || G.g.has(x)).slice(0, 3); why.push('it sounds like \u201c' + tr[best].title + '\u201d, one you play a lot' + (sh.length ? ' (' + sh.join(', ') + ')' : '')); } }
      const pf = sPF(); if (!((pf[t.dbId] || pf[id] || {}).count > 0)) why.push('you have not played it yet, so it counts as a new find');
      return '\u201c' + t.title + '\u201d is in ' + mixes.map(p => p.name).join(' and ') + ' because ' + (why.length ? why.join('; ') : 'it fits your overall taste') + '.';
    }
    // ---------- Bloopy extras: about 20 more commands, "why is <song> in my <playlist or mixes>" for any song, and phrases you teach him ----------
    const blNrm = x => String(x).toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');
    const blSay = s => { add('bot', blTone(s)); return true; };
    const blDone = s => blSay('\u2713 ' + s);
    const blCtx = { id: null };                                      // the song you last asked about, so "why is it in..." works
    const blSave = () => { try { if (window.PPPortfolioApi && window.PPPortfolioApi.flush) window.PPPortfolioApi.flush(); } catch (e) {} try { return JSON.parse(localStorage.getItem('pppSaveV1')) || {}; } catch (e) { return {}; } };
    const blDayKey = d => d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate();
    const blMin = ms => { const mn = Math.round(ms / 60000); return mn < 1 ? 'under a minute' : mn < 60 ? mn + ' min' : Math.floor(mn / 60) + ' h ' + (mn % 60) + ' min'; };
    const blPls = () => window.__ppApi.playlists().filter(p => !p.stemOf);
    const blIn = (t, p) => (t.playlistIds || []).includes(p.id);
    const blFindPl = name => { const w = blNrm(name); if (!w) return null; const pls = blPls(); return pls.find(p => blNrm(p.name) === w) || pls.find(p => blNrm(p.name).includes(w)) || null; };
    const blIdx = id => window.__ppApi.tracks().findIndex(x => String(x.dbId) === String(id));
    const blFindSong = q => { const tr = window.__ppApi.tracks(), w = blNrm(String(q).replace(/["\u201c\u201d'\u2018\u2019]/g, '')), ids = sReal(); if (!w) return -1; return ids.find(i => blNrm(tr[i].title) === w) ?? ids.find(i => blNrm(tr[i].title).includes(w)) ?? -1; };
    const BL_MIXKEY = [[/^for ?you$/i, 'foryou'], [/^(?:ones? you may like|may like|maylike)$/i, 'maylike'], [/^(?:your )?pattern$/i, 'pattern']];
    const BL_NUM = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, fifteen: 15, twenty: 20 };
    // what a phrase names: all mixes, one mix, all playlists, or one playlist (null if nothing matches)
    function blTarget(s) {
      const x = String(s).trim().replace(/[?!.]+$/, '').replace(/^(?:(?:my|the|your|any|all|all of my)\s+)+/i, '').trim();
      if (/^(?:auto |live |auto-|live-)?mix(?:es|tapes?)?$/i.test(x)) return { kind: 'mixes' };
      if (/^playlists?$/i.test(x)) return { kind: 'any' };
      const mk = BL_MIXKEY.find(([re]) => re.test(x.replace(/\s+mix(?:es)?$/i, '')));
      if (mk) return { kind: 'mixes', key: mk[1] };
      const pl = blFindPl(x.replace(/\s+playlist$/i, ''));
      return pl ? { kind: 'pl', pl } : null;
    }
    // "X in Y": tries every " in " split, keeping the first where the right side names a playlist or mix (songs can contain "in")
    function blParseWhy(rest) {
      const cuts = [], re = /\s+(?:in|on|inside|part of)\s+/gi; let m;
      while ((m = re.exec(rest))) cuts.push([rest.slice(0, m.index), rest.slice(m.index + m[0].length)]);
      for (const [s, tg] of cuts) if (s.trim() && blTarget(tg)) return { song: s.trim(), tgt: tg.trim() };
      return cuts.length ? { song: cuts[0][0].trim(), tgt: cuts[cuts.length - 1][1].trim() } : null;
    }
    // Why a track is in a mix: the same reasons the live mixes use (co-listening, sound and tag match, new finds)
    function blReasons(i) {
      const A = window.__ppApi, tr = A.tracks(), t = tr[i], id = String(t.dbId), s = lvState(), tg = loadTags(), why = [];
      const title = x => { const j = tr.find(q => String(q.dbId) === x); return j && j.title; };
      const near = [...new Set(s.seq.slice(-15).map(e => e[0]))].filter(x => x !== id && s.co[x] && s.co[x][id] > 0).slice(0, 2).map(title).filter(Boolean);
      if (near.length) why.push('you often play it near ' + near.map(x => '\u201c' + x + '\u201d').join(' and '));
      const F = sFeat(tg[t.dbId]);
      if (F) {
        let best = -1, bs = 0;
        sTaste().anchors.slice(0, 5).forEach(([a]) => { const sc = sFSim(F, sFeat(tg[tr[a].dbId])); if (sc > bs) { bs = sc; best = a; } });
        if (best >= 0 && bs > 0.25) { const G = sFeat(tg[tr[best].dbId]), sh = [...F.v, ...F.g].filter(x => G.v.has(x) || G.g.has(x)).slice(0, 3); why.push('it sounds like \u201c' + tr[best].title + '\u201d, one you play a lot' + (sh.length ? ' (' + sh.join(', ') + ')' : '')); }
      }
      const pf = sPF(); if (!((pf[t.dbId] || pf[id] || {}).count > 0)) why.push('you have not played it yet, so it counts as a new find');
      return why;
    }
    function blWhyPl(i, pl) {
      const A = window.__ppApi, t = A.tracks()[i], tgc = loadTags()[t.dbId];
      if (pl.liveKey) { const why = blReasons(i); return '\u201c' + t.title + '\u201d is in ' + pl.name + ' because ' + (why.length ? why.join('; ') : 'it fits your overall taste') + '.'; }
      if (/^[^\p{L}\p{N}\s]/u.test(pl.name)) {                        // Bloopy-made playlists have an emoji at the start of the name
        if (!tgc) return '\u201c' + t.title + '\u201d is in ' + pl.name + '. Bloopy made that playlist from your tags, but this song is not tagged, so I cannot say more. Tag it and ask again.';
        return '\u201c' + t.title + '\u201d is in ' + pl.name + '. Bloopy made that playlist from your tags, and this song is tagged ' + (vibes(tgc).slice(0, 4).join(', ') || 'with no clear mood') + (tgc.bpm ? ', at ' + tgc.bpm + ' BPM' : '') + '.';
      }
      return '\u201c' + t.title + '\u201d is in ' + pl.name + ', one of your own playlists. You added it by hand, and I do not keep a record of why.';
    }
    function blWhy(songQ, tgtQ) {
      const A = window.__ppApi, tr = A.tracks(); let i;
      if (/^(?:this|it|that|this (?:one|song|track)|that (?:one|song|track)|(?:the )?current(?: song| track)?)$/i.test(songQ.trim())) {
        i = A.currentIndex(); if (i < 0 && blCtx.id != null) i = blIdx(blCtx.id);
        if (i < 0) return blSay('Play a song first, or tell me its name.');
      } else { i = blFindSong(songQ); if (i < 0) return blSay('I cannot find \u201c' + songQ + '\u201d in your library.'); }
      blCtx.id = tr[i].dbId;
      const tt = blTarget(tgtQ);
      if (!tt) { const names = blPls().filter(p => !p.liveKey).slice(0, 8).map(p => p.name); return blSay('I do not have a playlist called \u201c' + tgtQ + '\u201d.' + (names.length ? ' Your playlists: ' + names.join(', ') + '.' : '')); }
      if (tt.kind === 'pl') return blSay(blIn(tr[i], tt.pl) ? blWhyPl(i, tt.pl) : '\u201c' + tr[i].title + '\u201d is not in ' + tt.pl.name + '.');
      if (tt.kind === 'mixes') { const mx = blPls().filter(p => p.liveKey && (!tt.key || p.liveKey === tt.key) && blIn(tr[i], p)); return blSay(mx.length ? mx.map(p => blWhyPl(i, p)).join('\n') : '\u201c' + tr[i].title + '\u201d is not in ' + (tt.key ? 'that mix' : 'any of your mixes') + ' right now.'); }
      const pls = blPls().filter(p => blIn(tr[i], p));
      return blSay(pls.length ? pls.slice(0, 8).map(p => blWhyPl(i, p)).join('\n') : '\u201c' + tr[i].title + '\u201d is not in any playlist.');
    }
    // ---- commands you teach him: stored on this device only, checked before everything else ----
    const blTaughtGet = () => { try { const v = JSON.parse(localStorage.getItem('ppvBloopTaught')); return Array.isArray(v) ? v.filter(e => e && e.p && e.c) : []; } catch (e) { return []; } };
    const blTaughtSet = v => { try { localStorage.setItem('ppvBloopTaught', JSON.stringify(v.slice(-40))); } catch (e) {} };
    const blNormPhrase = s => String(s).toLowerCase().replace(/^["\u201c\u201d'\s]+|["\u201c\u201d'\s]+$/g, '').replace(/[?!.]+$/, '').replace(/\s+/g, ' ').trim();
    // "*" in a phrase is a slot: "play * vibes" matches "play happy vibes", and "*" in the command is filled with that word
    function blAlias(text) {
      const s = blNormPhrase(text);
      for (const e of blTaughtGet()) {
        if (!e.p) continue;
        const re = new RegExp('^' + e.p.split('*').map(x => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('(.+?)') + '$', 'i');
        const m = s.match(re); if (!m) continue;
        let k = 1; return e.c.replace(/\*/g, () => m[k++] || '');
      }
      return null;
    }
    function blTeachSave(p0, c0) {
      const p = blNormPhrase(String(p0).replace(/\s+that$/i, '')), c = String(c0).trim().replace(/[.!?"'\u201d]+$/, '').trim();
      if (p.length < 2 || !c) return blSay('Tell me both parts, like: teach yourself \u201cchill out\u201d means \u201cplay something chill\u201d.');
      if (p === blNormPhrase(c)) return blSay('That would loop forever. Pick a different command.');
      if (/^(?:teach|learn|forget|when i|new command|make a command|add a command)/i.test(c)) return blSay('I will not learn a command that changes what I learn.');
      const L = blTaughtGet().filter(e => e.p !== p); L.push({ p, c }); blTaughtSet(L);
      return blDone('Learned it. When you say \u201c' + p + '\u201d, I will do \u201c' + c + '\u201d.' + (p.includes('*') ? ' The * stands for whatever word you put there.' : ''));
    }
    // ---------- Keyword matching: commands from any wording. Words are normalised (synonyms, endings, filler words) and each
    // intent lists groups of words; an intent fires when every group has a word in the message and no excluded word is there.
    const KW_FILLER = new Set(['the', 'a', 'an', 'please', 'can', 'could', 'would', 'will', 'you', 'your', 'i', 'im', 'me', 'to', 'of', 'just', 'now', 'some', 'bit', 'little', 'bloop', 'bloopy', 'hey', 'ok', 'okay', 'do', 'so', 'be', 'maybe', 'kinda', 'kind', 'sort', 'slightly', 'perhaps', 'really']);
    const KW_SYN = { loud: 'volume', sound: 'volume', tunes: 'music', tune: 'song', songs: 'song', tracks: 'track', whats: 'what', louder: 'up', raise: 'up', increase: 'up', boost: 'up', bump: 'up', crank: 'up', higher: 'up', quieter: 'down', softer: 'down', lower: 'down', reduce: 'down', decrease: 'down', pause: 'stop', halt: 'stop', hold: 'stop', freeze: 'stop', unpause: 'resume', continue: 'resume', skip: 'next', another: 'next', prev: 'previous', back: 'back', silence: 'mute', randomize: 'shuffle', random: 'shuffle', quicker: 'faster', quick: 'faster', slow: 'slow', heard: 'hear', similar: 'similar', lyrics: 'lyric', words: 'lyric', separate: 'split', karaoke: 'split', isolate: 'split', analyse: 'analyze', tempo: 'bpm', collection: 'library', remaining: 'left', remain: 'left' };
    const blFrame = s => String(s).replace(/^\s*(?:(?:bloopy?|hey|hi|ok|okay)[,:]?\s+)?(?:why (?:don['\u2019]?t|do not|not|dont) you|why not|how about|could you|would you|will you|can you|can u|do you think you could|would it be possible to|i need you to|i want you to|i'?d like you to|please)\s+/i, '').replace(/\b(?:maybe|kinda|kind of|sort of|perhaps|just real quick)\b,?\s*/gi, '');
    const KW_EQ = [['hip hop', 'hiphop'], ['late night', 'latenight'], ['v shape', 'vshape'], ['v-shape', 'vshape'], ['loudness', 'loudness'], ['classical', 'classical'], ['electronic', 'electronic'], ['acoustic', 'acoustic'], ['podcast', 'podcast'], ['bass', 'bass'], ['treble', 'treble'], ['vocal', 'vocal'], ['pop', 'pop'], ['rock', 'rock'], ['jazz', 'jazz'], ['edm', 'electronic'], ['rap', 'hiphop'], ['flat', 'flat'], ['off', 'flat'], ['normal', 'flat'], ['reset', 'flat']];
    const KW_NUMW = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, fifteen: 15, twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, hundred: 100 };
    const kwTok = s => String(s).toLowerCase().replace(/['\u2019]/g, '').replace(/[^\p{L}\p{N}\s]/gu, ' ').split(/\s+/).filter(w => w && !KW_FILLER.has(w)).map(w => { const b = KW_SYN[w] || (w.length > 4 ? w.replace(/(?:ing|ed|es|s)$/, '') : w); return KW_SYN[b] || b; });
    const kwNum = s => { const m = String(s).match(/\d+(?:\.\d+)?/); if (m) return +m[0]; const w = String(s).toLowerCase().split(/\W+/).find(x => KW_NUMW[x] != null); return w ? KW_NUMW[w] : null; };
    // n: groups (each needs one of its words), x: words that rule the intent out, q: also allowed when the message is a question
    const KW_INTENTS = [
      { c: 'pause', n: [['stop']], x: ['after', 'in', 'min', 'minute', 'hour', 'sleep', 'timer', 'loop', 'repeat', 'playlist', 'eq', 'speed', 'volume', 'split', 'lyric', 'tag', 'shuffle', 'mute', 'for'] },
      { c: 'resume', n: [['resume', 'keep', 'start']], x: ['again', 'from', 'over', 'new', 'something', 'playlist', 'speed', 'volume', 'split', 'lyric', 'tag'] },
      { c: 'next', n: [['next', 'skip', 'another', 'change'], ['song', 'track', 'one', 'tune', 'music', 'this', 'it', 'that']], x: ['second', 'sec', 'minute', 'min', 'ahead', 'back', 'intro', 'part', 'section', 'bit', 'frame', 'filter', 'eq', 'preset', 'speed', 'volume', 'time'] },
      { c: 'previous', n: [['previous', 'prev', 'last', 'back'], ['song', 'track', 'one', 'tune']], x: ['frame', 'second', 'sec', 'minute', 'min', 'rewind', 'time', 'playlist'] },
      { c: (s) => (s.has('off') || s.has('stop') || s.has('no')) ? 'shuffle off' : 'shuffle on', n: [['shuffle']], x: ['playlist', 'split', 'lyric', 'tag', 'is', 'what', 'list'] },
      { c: 'volume up', n: [['up'], ['volume', 'music', 'it']], x: ['down', 'sleep', 'timer', 'speed', 'fast', 'slow', 'bass', 'eq', 'treble', 'playlist', 'fullscreen'] },
      { c: 'volume down', n: [['down'], ['volume', 'music', 'it']], x: ['sleep', 'timer', 'speed', 'slow', 'bass', 'eq', 'treble', 'playlist', 'fullscreen'] },
      { c: 'mute', n: [['mute']], x: ['unmute'] },
      { c: 'unmute', n: [['unmute', 'back', 'on'], ['volume', 'sound']], x: [] },
      { c: 'faster', n: [['speed', 'faster'], ['up', 'faster', 'fast']], x: ['volume', 'bass', 'sleep', 'timer'] },
      { c: 'slower', n: [['speed', 'slow'], ['down', 'slow']], x: ['volume', 'bass', 'sleep', 'timer'] },
      { c: 'fullscreen', n: [['fullscreen', 'full']], x: ['exit', 'leave', 'out', 'off', 'close', 'volume'] },
      { c: (s, num) => (s.has('timer') || (s.has('sleep') && num)) && num ? 'sleep timer ' + num + ' minutes' : (s.has('timer') ? 'sleep timer' : null), n: [['sleep', 'timer']], x: ['playlist', 'shuffle', 'cancel', 'off', 'remove', 'clear', 'stop', 'end', 'disable'] },
      { c: (s, num) => (num != null && num <= 100) ? 'volume ' + num : null, n: [['volume', 'sound', 'loud']], x: ['up', 'down', 'raise', 'lower'] },
      { c: 'tag this song', n: [['tag', 'analyze', 'bpm', 'key', 'analysis']], x: ['all', 'everything', 'library', 'untagged', 'every', 'my', 'many', 'how'] },
      { c: 'get the lyrics', n: [['lyric', 'transcribe']], x: ['my', 'find', 'search', 'from'] },
      { c: 'split this song', n: [['split', 'stem', 'karaoke', 'isolate']], x: ['playlist', 'all', 'library', 'my'] },
      { c: 'more like this', n: [['similar', 'like', 'more']], x: ['playlist', 'mix', 'make', 'my', 'dislike', 'dont', 'not'], g: [['this', 'song', 'track', 'one', 'that']] },
      { c: 'library stats', n: [['library'], ['stat', 'big', 'size', 'many', 'summary', 'info', 'how']], x: ['playlist', 'track', 'play', 'add'], q: true },
      { c: 'my playlists', n: [['playlist'], ['my', 'list', 'show', 'what', 'which', 'have']], x: ['make', 'create', 'play', 'add', 'remove', 'delete', 'rename', 'shuffle', 'duplicate', 'empty', 'new', 'called', 'named', 'why', 'in', 'to', 'from', 'of', 'copy', 'clear', 'build', 'start'], q: true },
      { c: 'how long is left', n: [['left'], ['time', 'long', 'much']], x: ['playlist'], q: true },
      { c: "what's this song", n: [['what', 'who', 'name', 'which'], ['this', 'playing', 'sing', 'track', 'current']], x: ['have', 'library', 'my', 'playlist', 'most', 'like', 'repeat', 'loop'], q: true },
      { c: 'zoom out', n: [['zoom'], ['out', 'smaller', 'wider', 'further']], x: ['in', 'closer', 'bigger', 'larger', 'enlarge'] },
      { c: 'zoom in', n: [['zoom'], ['in', 'closer', 'bigger', 'larger', 'enlarge']], x: ['out', 'smaller', 'wider', 'further'] },
      { c: (s, num, r) => { if (!['forward', 'back', 'rewind', 'ahead', 'skip', 'jump', 'ff', 'backward'].some(w => s.has(w))) return null; const mins = s.has('minute') || s.has('min'), secs = s.has('second') || s.has('sec'); if (!num && !mins && !secs) return null; const back = s.has('back') || s.has('rewind') || s.has('backward'); return (back ? 'rewind ' : 'skip forward ') + (num || (mins ? 1 : 10)) + (mins ? ' minutes' : ' seconds'); }, n: [['forward', 'back', 'rewind', 'ahead', 'skip', 'jump', 'ff', 'backward']], x: ['song', 'track', 'previous', 'playlist', 'volume', 'speed', 'frame', 'next', 'loop', 'sleep', 'timer', 'tag', 'lyric', 'split', 'eq', 'fit', 'zoom', 'go', 'to'] },
      { c: (s, num, r) => { const m = r.match(/\b(\d{1,2}:\d{2}(?::\d{2})?)\b/); if (m) return 'go to ' + m[1]; const p = r.match(/\b(middle|halfway|half way|start|beginning|end)\b/); return p ? 'go to ' + p[1].replace('half way', 'halfway') : null; }, n: [['go', 'jump', 'skip', 'seek', 'move', 'take']], x: [] },
      { c: 'restart', n: [['restart', 'replay', 'beginning', 'top']], x: ['playlist', 'speed', 'volume', 'eq', 'go', 'jump', 'skip', 'seek'] },
      { c: (s, num, r) => (num != null && num >= 0.25 && num <= 4 && (s.has('speed') || s.has('tempo') || s.has('pace') || s.has('x') || s.has('times'))) ? 'speed ' + num : null, n: [['speed', 'tempo', 'pace', 'x', 'times']], x: ['volume', 'sleep', 'timer', 'bass', 'eq', 'seek', 'skip', 'playlist'] },
      { c: 'normal speed', n: [['normal', 'regular', 'default', 'reset', 'original'], ['speed', 'tempo', 'pace']], x: ['zoom', 'fit', 'video', 'picture', 'screen'] },
      { c: (s, num, r) => { const k = KW_EQ.find(([w]) => r.includes(w)); return k ? 'eq ' + k[1] : null; }, n: [['eq', 'equalizer', 'equaliser', 'equalise', 'preset']], x: ['next', 'change', 'switch', 'cycle', 'another', 'auto', 'open', 'show'] },
      { c: (s) => s.has('treble') ? 'eq treble' : s.has('vocal') || s.has('vocals') ? 'eq vocal' : 'eq bass', n: [['bass', 'treble', 'vocal', 'vocals']], g: [['boost', 'more', 'up', 'louder', 'stronger', 'needs', 'stronger']], x: ['volume', 'speed'] },
      { c: 'pip', n: [['pip', 'picture'], ['pip', 'picture', 'in', 'mode', 'on', 'open', 'enter', 'switch', 'turn']], x: [] },
      { c: 'rotate', n: [['rotate', 'rotation', 'spin']], x: [] },
      { c: 'reset zoom', n: [['reset', 'undo', 'clear', 'fit'], ['zoom', 'fit', 'picture', 'video', 'screen', 'view']], x: ['change', 'switch', 'cycle', 'next', 'filter'] },
      { c: 'change fit', n: [['change', 'switch', 'cycle', 'next', 'another', 'different'], ['fit', 'aspect', 'ratio']], x: ['reset', 'zoom'] },
      { c: 'next filter', n: [['filter'], ['next', 'change', 'switch', 'cycle', 'another']], x: ['search', 'find', 'look'] },
      { c: (s) => (s.has('back') || s.has('backward') || s.has('previous')) ? 'frame back' : 'frame forward', n: [['frame']], x: ['zoom', 'speed', 'volume'] },
      { c: (s) => (s.has('off') || s.has('exit') || s.has('leave') || s.has('stop')) ? 'exit immersive' : (s.has('on') || s.has('enter') || s.has('start')) ? 'immersive on' : 'immersive', n: [['immersive']], x: [] },
      { c: (s, num, r) => { const m = r.match(/^(?:add|put|save|stick|throw|drop)\s+(?:this|it|the current|current|the song|the track|song|track)\s+(?:to|into|in|onto)\s+(?:my |the )?(.+?)(?: playlist)?$/); return m ? 'add this to ' + m[1] : null; }, n: [['add', 'put', 'save', 'stick', 'throw', 'drop']], x: ['volume', 'speed', 'sleep', 'timer', 'eq', 'zoom', 'loop', 'shuffle', 'repeat'] },
      { c: (s, num, r) => { const m = r.match(/^(?:remove|take|delete|pull)\s+(?:this|it|the current|current|the song|the track|song|track)\s+(?:from|out of|off)\s+(?:my |the )?(.+?)(?: playlist)?$/); return m ? 'remove this from ' + m[1] : null; }, n: [['remove', 'take', 'delete', 'pull']], x: ['volume', 'speed', 'sleep', 'timer', 'eq', 'zoom', 'loop', 'shuffle', 'repeat'] },
      { c: (s, num, r) => { const m = r.match(/^(?:delete|remove|get rid of|erase)\s+(?:my |the )?playlist\s+(.+)$/) || r.match(/^(?:delete|remove|get rid of|erase)\s+(?:my |the )?(.+?)\s+playlist$/); return m ? 'delete playlist ' + m[1] : null; }, n: [['delete', 'remove', 'erase', 'rid'], ['playlist']], x: ['this', 'it', 'from', 'song', 'track', 'current'] },
      { c: (s, num, r) => { const m = r.match(/^(?:play|start|put on|shuffle|listen to)\s+(?:my |the )?(?:playlist )?(.+?)(?: playlist)?$/); return m && !/^(?:this|it|something|some|music|songs?|random)$/.test(m[1]) ? 'play ' + m[1] + ' playlist' : null; }, n: [['play', 'shuffle', 'listen', 'start'], ['playlist']], x: ['make', 'create', 'add', 'remove', 'delete', 'rename', 'my'] },
      { c: (s, num, r) => { const m = r.match(/^(?:search|find|look|filter)(?: (?:for|up|by))?\s+(.+)$/); return m ? 'search ' + m[1] : null; }, n: [['search', 'find', 'look', 'filter']], x: ['playlist', 'my', 'this', 'it', 'next', 'clear', 'reset', 'close', 'make', 'add', 'play', 'song', 'track', 'current'] },
      { c: 'clear search', n: [['search', 'filter']], g: [['clear', 'reset', 'close', 'remove']], x: [] },
      { c: (s, num, r) => { const o = [['equalizer', 'equalizer'], ['eq', 'equalizer'], ['sleep', 'sleep timer'], ['speed', 'speed'], ['effects', 'effects'], ['subtitles', 'subtitles'], ['captions', 'subtitles'], ['menu', 'menu'], ['settings', 'settings'], ['setting', 'settings'], ['playlists', 'playlist'], ['playlist', 'playlist'], ['library', 'library'], ['queue', 'queue'], ['tracks', 'tracks']].find(([w]) => s.has(w)); return o ? 'open ' + o[1] : null; }, n: [['open', 'show', 'go', 'take', 'bring']], x: ['my', 'list', 'what', 'which', 'have', 'make', 'create', 'play', 'shuffle', 'mix', 'close', 'hide', 'add', 'remove', 'delete'] },
      { c: 'close menu', n: [['close', 'hide']], g: [['menu']], x: [] },
      { c: 'cancel sleep timer', n: [['sleep', 'timer']], g: [['cancel', 'off', 'remove', 'clear', 'stop', 'end', 'disable']], x: [] },
      { c: 'stop after this song', n: [['after'], ['song', 'track', 'this', 'current']], g: [['stop', 'sleep', 'pause', 'end', 'halt']], x: ['minute', 'min', 'hour'] },
      { c: 'mute', n: [['off', 'mute', 'silence']], g: [['volume', 'sound']], x: ['unmute', 'back', 'on', 'sleep', 'timer', 'eq', 'bass', 'shuffle', 'repeat', 'loop', 'playlist'] },
      { c: (s, num, r) => (s.has('clear') || s.has('cancel') || s.has('remove') || s.has('off')) ? 'clear loop' : (s.has('end') || s.has('stop') || s.has('finish') || s.has('point') && s.has('b')) ? 'set loop end' : 'set loop start', n: [['loop']], g: [['start', 'begin', 'end', 'finish', 'clear', 'cancel', 'remove', 'off', 'point', 'mark', 'here', 'stop']], x: ['playlist', 'song', 'track', 'this', 'all', 'everything'] },
      { c: (s) => 'undo', n: [['undo', 'revert', 'take']], g: [['that', 'it', 'back', 'this', 'last', 'change']], x: ['song', 'track'] },
      { c: 'help', n: [['help', 'command']], x: [], q: true },
      { c: (s) => (s.has('all') || s.has('everything') || s.has('playlist')) ? 'repeat all' : (s.has('off') || s.has('stop') || s.has('quit')) ? 'repeat off' : 'repeat this song', n: [['repeat', 'loop']], x: ['point', 'start', 'section', 'part', 'shuffle', 'end'] }
    ];
    // Returns {cmd} for one clear match, {ask: [cmd, cmd]} for a tie, or null. Only short messages are read this way.
    function kwRoute(t) {
      const s0 = String(t).toLowerCase().trim().replace(/^(?:why (?:don['’]?t|do not|not) you|why not|how about|could you|would you|will you|can you|do you think you could)\s+/i, ''), words = kwTok(s0);
      if (!words.length || words.length > 9) return null;
      if (/\d\s*x\b/.test(s0)) words.push('x');
      const set = new Set(words), num = kwNum(s0), question = /^(?:what|who|which|how|why|where|when|is|are|am|do|does|did|was|were|can|could)\b/.test(s0);
      const found = [];
      for (const it of KW_INTENTS) {
        if (question && !it.q) continue;
        if (it.x && it.x.some(w => set.has(w))) continue;
        if (!it.n.every(g => g.some(w => set.has(w)))) continue;
        if (it.g && !it.g.every(g => g.some(w => set.has(w)))) continue;
        const cmd = typeof it.c === 'function' ? it.c(set, num, s0) : it.c; if (!cmd) continue;
        found.push({ cmd, score: it.n.length + (it.g ? it.g.length : 0) });
      }
      if (!found.length) return null;
      found.sort((a, b) => b.score - a.score);
      const best = found.filter(f => f.score === found[0].score).map(f => f.cmd), uniq = [...new Set(best)];
      return uniq.length === 1 ? { cmd: uniq[0] } : { ask: uniq.slice(0, 2) };
    }
    // Did-you-mean for commands: the whole message is compared with the closest known phrasings. Nothing changes until you pick one.
    const TYPO_CAT = ['pause', 'resume', 'next song', 'previous song', 'shuffle on', 'shuffle off', 'volume up', 'volume down', 'mute', 'unmute', 'faster', 'slower', 'fullscreen', 'repeat this song', 'restart', 'undo', 'again', 'help', 'library stats', 'my playlists', 'how long is left', "what's this song", 'tag this song', 'get the lyrics', 'split this song', 'more like this', 'surprise me', 'skip intro', 'sleep timer 30 minutes', 'open settings', 'make a playlist', 'auto eq', 'stop after this song', 'what is in my library', 'play something chill', 'play something happy'];
    const kwNorm = s => String(s).toLowerCase().replace(/['\u2019]/g, '').replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim();
    function typoCands(t) {
      const q = kwNorm(t); if (q.length < 3 || q.length > 40) return [];
      return TYPO_CAT.map(p => [p, 1 - sLev(q, p) / Math.max(q.length, p.length)]).filter(x => x[1] >= 0.7 && x[0] !== q).sort((a, b) => b[1] - a[1]).slice(0, 2).map(x => x[0]);
    }
    function kwPick(list, q) {
      add('bot', q);
      actions(list.map(c => ['\u25b6 ' + c, (b, d) => { d.remove(); sExec(c); }]).concat([['Neither', (b, d) => { d.remove(); add('bot', 'Okay. Tell me another way, or say \u201chelp\u201d.'); }]]));
      return true;
    }
