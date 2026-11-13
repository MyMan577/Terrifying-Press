      // ---- transport ----
      const fmtS = x => { x = Math.max(0, x || 0); const m = Math.floor(x / 60); return m + ':' + (x - m * 60).toFixed(2).padStart(5, '0'); };
      const tickT = () => {
        if (!edet.open) return; const m = media(); if (!m) return; const dur = isFinite(m.duration) ? m.duration : 0;
        $e('#e-time').textContent = fmtS(m.currentTime) + ' / ' + mmss(dur); const sc = $e('#e-scrub'); sc.max = dur || 1; if (document.activeElement !== sc) sc.value = m.currentTime;
        $e('#e-pp').textContent = m.paused ? '▶' : '⏸';
        const t = cur(); $e('#e-ban').classList.toggle('on', !!(t && edTrack && t.dbId !== edTrack.dbId));
        const n = m.currentTime; let act = -1; rows.forEach((r, i) => { if (n >= r.s && n < endOf(i)) act = i; });
        const els = rowsEl.querySelectorAll('.er'); els.forEach((d, i) => d.classList.toggle('on', i === act));
        if (act >= 0 && $e('#e-follow').checked && !m.paused && !ov.contains(document.activeElement.tagName === 'TEXTAREA' || document.activeElement.tagName === 'INPUT' ? document.activeElement : null) && els[act]) els[act].scrollIntoView({ block: 'center', behavior: 'smooth' });
      };
      ['audio', 'video-el'].forEach(id => { const e = document.getElementById(id); if (e) ['timeupdate', 'play', 'pause', 'seeked', 'loadedmetadata'].forEach(ev => e.addEventListener(ev, tickT)); });
      $e('#e-pp').onclick = () => { const m = media(); if (!m) return; if (m.paused) m.play().catch(() => {}); else m.pause(); };
      $e('#e-b5').onclick = () => { const m = media(); if (m) m.currentTime = Math.max(0, m.currentTime - 5); };
      $e('#e-f5').onclick = () => { const m = media(); if (m) m.currentTime = m.currentTime + 5; };
      $e('#e-scrub').oninput = () => { const m = media(); if (m) m.currentTime = +$e('#e-scrub').value; };
      $e('#e-rate').onchange = () => { const m = media(); if (m) m.playbackRate = +$e('#e-rate').value; };
      // ---- tabs ----
      $e('#e-tabs').onclick = ev => { const b = ev.target.closest('button[data-t]'); if (!b) return; $e('#e-tabs').querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b)); ov.querySelectorAll('.etool').forEach(p => p.classList.toggle('on', p.dataset.p === b.dataset.t)); const rp = b.dataset.t === 'rep'; rowsEl.style.display = rp ? 'none' : ''; const re = $e('#e-replist'); if (re) { re.style.display = rp ? '' : 'none'; if (rp) repRender(); } $e('.efilter').style.display = rp ? 'none' : ''; };
      // ---- lines tab ----
      $e('#e-undo').onclick = () => { if (!hist.length) return; fut.push(JSON.stringify(rows)); rows = JSON.parse(hist.pop()); sel = null; render(); };
      $e('#e-redo').onclick = () => { if (!fut.length) return; hist.push(JSON.stringify(rows)); rows = JSON.parse(fut.pop()); sel = null; render(); };
      $e('#e-add').onclick = () => { const m = media(); snap(); const n = { s: m ? m.currentTime : 0, e: null, text: '' }; rows.push(n); sortRows(); sel = n; render(); const i = rows.indexOf(n), t2 = rowsEl.querySelectorAll('textarea')[i]; if (t2) { t2.scrollIntoView({ block: 'center' }); t2.focus(); } };
      $e('#e-sort').onclick = () => mut(() => sortRows());
      const tapInfo = () => { const i = rows.indexOf(sel); $e('#e-tapinfo').textContent = sel ? 'Selected line ' + (i + 1) + ': ' + (sel.text.slice(0, 60) || '(empty)') : 'Tap a line to select it first.'; };
      $e('#e-tap').onclick = () => { tapOn = !tapOn; $e('#e-tapbar').classList.toggle('on', tapOn); $e('#e-tap').classList.toggle('pri', tapOn); if (tapOn) { if (!sel && rows[0]) sel = rows[0]; render(); tapInfo(); const m = media(); if (m && m.paused) m.play().catch(() => {}); toast('Play the track, then tap at the start of each line.'); } };
      $e('#e-tapbtn').onclick = () => {
        const m = media(); if (!m || !sel) { tapInfo(); return; } snap(); sel.s = m.currentTime; fixE(sel); const i0 = rows.indexOf(sel); sortRows(); const i = rows.indexOf(sel), nx = rows[i + 1] || null;
        if (i > 0 && rows[i - 1].e != null) rows[i - 1].e = null; sel = nx || sel; render(); tapInfo(); const els = rowsEl.querySelectorAll('.er'), idx = rows.indexOf(sel); if (els[idx]) els[idx].scrollIntoView({ block: 'center', behavior: 'smooth' });
      };
      // ---- timing tab ----
      const inScope = r => { const sc = $e('#e-scope').value; if (sc === 'all') return true; if (!sel) return false; return sc === 'sel' ? r === sel : r.s >= sel.s; };
      const shiftBy = d => { if (!rows.length) return; if ($e('#e-scope').value !== 'all' && !sel) { toast('Tap a line to select it first.'); return; } mut(() => { rows.forEach(r => { if (!inScope(r)) return; r.s = Math.max(0, r.s + d); if (r.e != null) r.e = Math.max(0, r.e + d); }); sortRows(); }); };
      $e('#e-shm').onclick = () => shiftBy(-Math.abs(+$e('#e-sh').value || 0)); $e('#e-shp').onclick = () => shiftBy(Math.abs(+$e('#e-sh').value || 0));
      $e('#e-stgo').onclick = () => { const f = +$e('#e-st').value; if (!(f > 0.5 && f < 2)) { toast('Use a factor between 0.5 and 2, e.g. 1.001.'); return; } mut(() => { rows.forEach(r => { r.s *= f; if (r.e != null) r.e *= f; }); }); };
      $e('#e-fit').onclick = () => mut(() => { rows.forEach((r, i) => { if (rows[i + 1]) r.e = rows[i + 1].s; }); });
      $e('#e-auto').onclick = () => mut(() => { rows.forEach(r => { r.e = null; }); });
      $e('#e-ovl').onclick = () => mut(() => { rows.forEach((r, i) => { if (rows[i + 1] && r.e != null && r.e > rows[i + 1].s) r.e = rows[i + 1].s; }); });
      $e('#e-rnd').onclick = () => mut(() => { const q = x => Math.round(x * 10) / 10; rows.forEach(r => { r.s = q(r.s); if (r.e != null) r.e = q(r.e); }); });
      $e('#e-mingo').onclick = () => { const mn = +$e('#e-min').value || 1; let n = 0; mut(() => { rows.forEach((r, i) => { const e = endOf(i); if (e - r.s < mn) { const lim = rows[i + 1] ? rows[i + 1].s : r.s + mn; r.e = Math.min(r.s + mn, lim); if (r.e > r.s) n++; else r.e = null; } }); }); toast(n + ' line' + (n === 1 ? '' : 's') + ' lengthened (never past the next line).'); };
      // ---- text tab ----
      const mapText = fn => { if (!rows.length) return; mut(() => { rows.forEach(r => { r.text = fn(r.text); }); }); };
      $e('#e-trim').onclick = () => mapText(s => s.replace(/[ \t]+/g, ' ').trim());
      $e('#e-cap').onclick = () => mapText(s => s.replace(/^(\s*)(\S)/, (m, a, b) => a + b.toUpperCase()));
      $e('#e-up').onclick = () => mapText(s => s.toUpperCase()); $e('#e-low').onclick = () => mapText(s => s.toLowerCase());
      $e('#e-brk').onclick = () => mapText(s => s.replace(/\[[^\]]*\]|\([^)]*\)/g, '').replace(/\s{2,}/g, ' ').trim());
      $e('#e-empty').onclick = () => { const n = rows.filter(r => !r.text.trim()).length; if (!n) { toast('No empty lines.'); return; } mut(() => { rows = rows.filter(r => r.text.trim()); sel = null; }); toast(n + ' empty line' + (n === 1 ? '' : 's') + ' deleted.'); };
      $e('#e-dup').onclick = () => { let n = 0; mut(() => { rows = rows.filter((r, i) => { const dup = i > 0 && r.text.trim() && r.text.trim().toLowerCase() === rows[i - 1].text.trim().toLowerCase(); if (dup) n++; return !dup; }); }); toast(n ? n + ' repeated line' + (n === 1 ? '' : 's') + ' deleted.' : 'No repeated lines.'); };
      $e('#e-fr').onclick = () => {
        const w = mkEl('div'); w.style.cssText = 'display:flex;flex-direction:column;gap:8px';
        w.innerHTML = '<input type="text" id="e-fa" placeholder="Find"><input type="text" id="e-fb" placeholder="Replace with"><label style="font-size:12px"><input type="checkbox" id="e-fc"> Match case</label><div id="e-fn" style="font-size:12px;opacity:.7"></div>';
        const cnt = () => { const f = w.querySelector('#e-fa').value, cs = w.querySelector('#e-fc').checked; if (!f) { w.querySelector('#e-fn').textContent = ''; return 0; } const re = new RegExp(f.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), cs ? 'g' : 'gi'); let n = 0; rows.forEach(r => { const m = r.text.match(re); if (m) n += m.length; }); w.querySelector('#e-fn').textContent = n + ' match' + (n === 1 ? '' : 'es'); return n; };
        w.oninput = cnt; w.onchange = cnt;
        modal('Find & replace', w, [{ label: 'Cancel' }, { label: 'Replace all', pri: 1, fn: () => { const f = w.querySelector('#e-fa').value, rp = w.querySelector('#e-fb').value, cs = w.querySelector('#e-fc').checked; if (!f) return false; const re = new RegExp(f.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), cs ? 'g' : 'gi'); const n = cnt(); mut(() => { rows.forEach(r => { r.text = r.text.replace(re, () => rp); }); }); toast(n + ' replaced.'); } }]);
        setTimeout(() => w.querySelector('#e-fa').focus(), 50);
      };
      // ---- file tab ----
      $e('#e-paste').onclick = () => {
        const w = mkEl('div'); w.style.cssText = 'display:flex;flex-direction:column;gap:8px';
        w.innerHTML = '<div style="font-size:12px;opacity:.7">Paste .lrc, .srt, or plain text (one line per row). Plain text is spaced 4 seconds apart for re-timing.</div><textarea id="e-pt" placeholder="Paste here…"></textarea><label style="font-size:12px"><input type="checkbox" id="e-pa"> Add to the existing lines instead of replacing them</label>';
        modal('Paste text', w, [{ label: 'Cancel' }, { label: 'Import', pri: 1, fn: () => { const v = w.querySelector('#e-pt').value; if (!v.trim()) return false; let r = /-->/.test(v) ? parseSrtText(v) : parseLrcText(v); if (!r.length) r = plain(v); mut(() => { rows = w.querySelector('#e-pa').checked ? rows.concat(r) : r; sortRows(); sel = null; }); toast(r.length + ' lines imported. Not saved until confirmed.'); } }]);
      };
      $e('#e-loadf').onclick = () => $e('#e-file').click();
      $e('#e-file').onchange = async ev => { const f = ev.target.files[0]; ev.target.value = ''; if (!f) return; const txt = (await f.text()).replace(/^\uFEFF/, ''); let r = /-->/.test(txt) ? parseSrtText(txt) : parseLrcText(txt); if (!r.length) r = plain(txt); if (!r.length) { toast('Could not read any lines from that file.'); return; } mut(() => { rows = r; sel = null; }); toast(r.length + ' lines loaded from ' + f.name + '. Not saved until confirmed.'); };
      $e('#e-revert').onclick = () => { if (isDirty() && !confirm('Discard edits and go back to the last saved version?')) return; load(); };
      $e('#e-dsrt').onclick = () => dlFile('srt'); $e('#e-dlrc').onclick = () => dlFile('lrc'); $e('#e-dtxt').onclick = () => dlFile('txt');
      // ---- view ----
      $e('#e-ends').onchange = render; $e('#e-q').oninput = render;
      $e('#e-fs').onchange = () => { ov.classList.remove('fs-s', 'fs-l', 'fs-x'); const v = $e('#e-fs').value; if (v !== 'm') ov.classList.add('fs-' + v); render(); };
      // ---- header / footer ----
      $e('#e-back').onclick = back; $e('#e-cancel').onclick = back;
      $e('#e-save').onclick = save;
      $e('#e-ok').onclick = () => { if (!rows.filter(r => r.text.trim()).length) { toast('Add at least one line with text first.'); return; } if (!isDirty()) { close(); return; } if (save()) close(); };
      $e('#e-banload').onclick = () => { if (isDirty() && !confirm('Discard unsaved changes and edit the new track instead?')) return; load(); };
      document.addEventListener('keydown', ev => { if (edet.open && ev.key === 'Escape' && !$e('#e-mod').classList.contains('on')) back(); else if (edet.open && ev.key === 'Escape') closeModal(); });
      window.addEventListener('beforeunload', ev => { if (edet.open && isDirty()) { ev.preventDefault(); ev.returnValue = ''; } });
      // ================= Repeats tab: pick the right wording for lines that were sung more than once =================
      const rcss = document.createElement('style');
      rcss.textContent = '#ppv-edpage .rg{border:1px solid var(--line,#3a3a40);border-radius:12px;padding:10px;margin-top:10px;background:rgba(127,127,127,.07)}#ppv-edpage .rg h4{margin:0 0 6px;font-size:13px}#ppv-edpage .rg .tms{display:flex;gap:5px;flex-wrap:wrap;margin-bottom:8px}#ppv-edpage .rg .tms button{padding:3px 8px;font-size:12px}' +
        '#ppv-edpage .rv{display:flex;gap:8px;align-items:flex-start;padding:8px;border:1px solid var(--line,#444);border-radius:10px;margin-top:6px;cursor:pointer}#ppv-edpage .rv.on{border-color:var(--accent,#7c3aed);background:rgba(124,58,237,.14)}#ppv-edpage .rv input[type=radio]{margin-top:3px;accent-color:var(--accent,#7c3aed)}#ppv-edpage .rv .tx{flex:1;line-height:1.35}#ppv-edpage .rv .bd{font-size:11px;opacity:.75;white-space:nowrap}#ppv-edpage .rv input[type=text]{flex:1;width:100%}' +
        '#ppv-edpage .rg .ap{width:100%;margin-top:8px;padding:11px}#ppv-edpage .rnote{font-size:12px;opacity:.7;margin-top:8px}';
      rcss.textContent += '#ppv-edpage .rg h4{display:flex;align-items:center;gap:8px}#ppv-edpage .rg .occs{margin-bottom:8px}#ppv-edpage .rg .occ{display:flex;gap:8px;align-items:flex-start;padding:5px 0;border-top:1px solid rgba(127,127,127,.25);cursor:pointer}#ppv-edpage .rg .occ:first-of-type{border-top:0}#ppv-edpage .rg .occ button{padding:3px 8px;font-size:12px;flex:none}#ppv-edpage .rg .occ .ot{flex:1;min-width:0;font-size:13px;word-break:break-word}#ppv-edpage .rg .occ input{margin-top:5px;flex:none}#ppv-edpage .rg .osel{display:flex;gap:6px;margin-bottom:4px}#ppv-edpage .rg .osel button{padding:2px 8px;font-size:11px}';
      document.head.appendChild(rcss);
      const repEl = mkEl('div', 'elist'); repEl.id = 'e-replist'; repEl.style.display = 'none'; rowsEl.after(repEl);
      let repGroups = [];                                                // [{rows:[row refs], pick:string|null, own:string}]
      const repVariants = g => {
        const m = new Map(); g.rows.forEach(r => { const k = rpNorm(r.text); if (!k) return; if (!m.has(k)) m.set(k, { text: r.text, n: 0, alt: false }); m.get(k).n++; });
        g.rows.forEach(r => (r.alts || []).forEach(a => { const k = rpNorm(a); if (k && !m.has(k)) m.set(k, { text: a, n: 0, alt: true }); }));
        return [...m.values()].sort((a, b) => b.n - a.n);
      };
      const repScan = async audio => {
        if (!rows.length) { toast('No lines to check yet.'); return; }
        const t = edTrack || cur(); let x = null; const b1 = $e('#e-rscan'), b2 = $e('#e-rscanA'); b1.disabled = b2.disabled = true;
        try {
          if (audio) { if (!t) { toast('Play or select a track first.'); return; } toast('Listening to the track… this can take a moment.'); const vs0 = findVocalsStem(A() && A().tracks(), t); x = await decodeMono(((vs0 || t).url), 16000); }
          const items = rows.map((r, i) => ({ s: r.s, e: endOf(i), text: r.text })), gs = await rpFind(items, x); x = null;
          repGroups = gs.map(ix => ({ rows: ix.map(i => rows[i]), pick: null, own: '' }));
          repRender(); const n = repGroups.filter(g => repVariants(g).length > 1).length; toast(n ? n + ' repeated line' + (n === 1 ? ' has' : 's have') + ' different wordings.' : 'Every repeated line already matches.');
        } catch (e) { console.error(e); toast('Scan failed: ' + errText(e)); }
        b1.disabled = b2.disabled = false;
      };
      // Several wordings can be right (a chorus that really changes between passes), so they are ticked, not picked.
      // Applying: a line whose wording is ticked keeps it; any other line gets the CLOSEST ticked wording (a mishearing sits
      // nearest to what was really sung); the per-line menu still overrides both.
      const repSimTxt = (a, b) => { a = rpNorm(a); b = rpNorm(b); if (!a || !b) return 0; const n = a.length, m = b.length; let prev = Array.from({ length: m + 1 }, (_, j) => j); for (let i = 1; i <= n; i++) { const cur = [i]; for (let j = 1; j <= m; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)); prev = cur; } return 1 - prev[m] / Math.max(n, m); };
      const repPicked = g => {                                            // ticked wordings as text, own wording included when ticked
        const vs = repVariants(g), out = vs.filter(v => g.picks && g.picks.has(rpNorm(v.text))).map(v => v.text);
        if (g.ownOn && String(g.own || '').trim()) out.push(String(g.own).trim());
        return out;
      };
      const repTarget = (g, r, picked) => {
        const a = g.asg && g.asg.get(r); if (a) return a;
        if (!picked.length) return null;
        if (picked.some(p => rpNorm(p) === rpNorm(r.text))) return r.text;   // already one of the right wordings: keep it
        return picked.slice().sort((x, y) => repSimTxt(r.text, y) - repSimTxt(r.text, x))[0];
      };
      const repApply = (g, text) => {
        const tgt = g.rows.filter(r => !(g.off && g.off.has(r))); if (!tgt.length) { toast('Tick at least one line first.'); return; }
        let picked = repPicked(g); if (!picked.length && String(text || '').trim()) picked = [String(text).trim()];
        if (!picked.length && tgt.some(r => !(g.asg && g.asg.get(r)))) { toast('Tick at least one right wording, or write your own.'); return; }
        snap(); let ch = 0, kept = 0;
        tgt.forEach(r => { const nt = repTarget(g, r, picked); if (nt == null) return; if (nt === r.text) kept++; else { r.text = nt; ch++; } });
        render(); repRender();
        toast((ch ? 'Changed ' + ch + ' line' + (ch === 1 ? '' : 's') : 'Nothing needed changing') + (kept ? ', kept ' + kept + ' that already had a right wording' : '') + (tgt.length < g.rows.length ? ' (' + (g.rows.length - tgt.length) + ' unticked left as they were)' : '') + '.');
      };
      const repSuggest = g => { const v = rpVote(g.rows.map(r => ({ text: r.text, alts: r.alts }))); return v ? v.text : ''; };
      const repSelBtn = () => { const n = repGroups.filter(g => g.on !== false && repVariants(g).filter(v => !v.alt).length >= 2 && g.rows.some(r => !(g.off && g.off.has(r)))).length; const b = $e('#e-rall'); if (b) b.textContent = n ? 'Apply to ' + n + ' selected group' + (n === 1 ? '' : 's') : 'Apply to selected groups'; };
      function repRender() {
        repEl.textContent = '';
        const showAll = $e('#e-rshow').checked; let shown = 0;
        repGroups.forEach((g, gi) => {
          const vs = repVariants(g), real = vs.filter(v => !v.alt).length;
          if (real < 2 && !showAll && !(real === 1 && vs.length > 1)) return;
          if (real < 2 && !showAll && !g.rows.some(r => r.alts && r.alts.length)) return;
          shown++;
          const sug = repSuggest(g), cur0 = g.pick != null ? g.pick : sug, card = mkEl('div', 'rg');
          { const h4 = mkEl('h4'), gc = mkEl('input'); gc.type = 'checkbox'; gc.checked = g.on !== false; gc.title = 'Include this group when applying to selected groups'; gc.onchange = () => { g.on = gc.checked; repSelBtn(); }; h4.append(gc, document.createTextNode('Sung ' + g.rows.length + '× · ' + real + ' version' + (real === 1 ? '' : 's') + ' heard')); card.appendChild(h4); }
          g.off = g.off || new Set(); g.asg = g.asg || new Map(); let apBtn = null;
          const upApply = () => { if (!apBtn) return; const n = g.rows.filter(r => !g.off.has(r)).length; apBtn.textContent = 'Apply to ' + (n === g.rows.length ? 'all ' : '') + n + ' selected line' + (n === 1 ? '' : 's'); apBtn.disabled = !n; };
          const tms = mkEl('div', 'occs'), osel = mkEl('div', 'osel');
          const setAll = v => { g.rows.forEach(r => { if (v) g.off.delete(r); else g.off.add(r); }); tms.querySelectorAll('input').forEach(c => { c.checked = v; }); upApply(); repSelBtn(); };
          { const a1 = mkEl('button', '', 'All lines'), a2 = mkEl('button', '', 'None'); a1.onclick = () => setAll(true); a2.onclick = () => setAll(false); osel.append(a1, a2); }
          card.appendChild(osel);
          g.rows.forEach(r => {
            const lab = mkEl('label', 'occ'), cb = mkEl('input'); cb.type = 'checkbox'; cb.checked = !g.off.has(r);
            cb.onchange = () => { if (cb.checked) g.off.delete(r); else g.off.add(r); upApply(); repSelBtn(); };
            const pb = mkEl('button', '', '▶ ' + fmtT(r.s).replace(/\.\d+$/, '')); pb.title = 'Listen to this one';
            pb.onclick = ev => { ev.preventDefault(); ev.stopPropagation(); const m = media(); if (m) { m.currentTime = Math.max(0, r.s - 0.2); m.play && m.play().catch(() => {}); } };
            const tt = mkEl('span', 'ot'), tl = mkEl('div'), ss = mkEl('select'); tl.textContent = r.text; ss.title = 'Which wording this line gets';
            ss.style.cssText = 'width:100%;margin-top:4px;font-size:12px;padding:4px';
            { const o0 = mkEl('option'); o0.value = ''; o0.textContent = 'Gets the picked wording below'; ss.appendChild(o0); vs.forEach((v, vi) => { const o = mkEl('option'); o.value = String(vi); o.textContent = (v.text.length > 60 ? v.text.slice(0, 58) + '…' : v.text) + (v.n ? ' (×' + v.n + ')' : ' (other pass)'); ss.appendChild(o); });
              const cv = g.asg.get(r); if (cv) { const k = vs.findIndex(v => v.text === cv); if (k >= 0) ss.value = String(k); } }
            ss.onclick = ev => ev.stopPropagation();
            ss.onchange = () => { if (ss.value === '') g.asg.delete(r); else { g.asg.set(r, vs[+ss.value].text); if (!cb.checked) { cb.checked = true; g.off.delete(r); } } upApply(); repSelBtn(); };
            tt.append(tl, ss); lab.append(cb, pb, tt); tms.appendChild(lab);
          });
          card.appendChild(tms);
          if (!g.picks) g.picks = new Set(cur0 ? [rpNorm(cur0)] : []);        // starts with the suggested wording ticked
          const togglePick = txt => { const k = rpNorm(txt); if (g.picks.has(k)) g.picks.delete(k); else g.picks.add(k); repRender(); };
          card.appendChild(mkEl('div', 'rnote', 'Tick every wording that is right. Lines that already have a ticked wording keep it; the others get the closest ticked one.'));
          vs.forEach(v => {
            const on = g.picks.has(rpNorm(v.text)), d = mkEl('label', 'rv' + (on ? ' on' : '')), rd = mkEl('input'); rd.type = 'checkbox'; rd.checked = on;
            const tx = mkEl('span', 'tx'); tx.textContent = v.text; const bd = mkEl('span', 'bd', (v.n ? '×' + v.n : 'other pass') + (rpNorm(v.text) === rpNorm(sug) ? ' · suggested' : ''));
            d.append(rd, tx, bd); d.onclick = ev => { ev.preventDefault(); togglePick(v.text); }; card.appendChild(d);
          });
          const own = mkEl('label', 'rv' + (g.ownOn ? ' on' : '')), orad = mkEl('input'); orad.type = 'checkbox'; orad.checked = !!g.ownOn;
          orad.onclick = ev => { ev.stopPropagation(); g.ownOn = orad.checked; own.classList.toggle('on', g.ownOn); };
          const oin = mkEl('input'); oin.type = 'text'; oin.placeholder = 'None of these — write my own'; oin.value = g.own || '';
          oin.oninput = () => { g.own = oin.value; g.ownOn = !!oin.value.trim(); orad.checked = g.ownOn; own.classList.toggle('on', g.ownOn); };   // typing ticks it; other ticks stay
          own.append(orad, oin); card.appendChild(own);
          const ap = mkEl('button', 'pri ap', ''); apBtn = ap; upApply(); ap.onclick = () => repApply(g, ''); card.appendChild(ap);
          repEl.appendChild(card);
        });
        if (!shown) repEl.appendChild(mkEl('div', 'eempty', repGroups.length ? 'Nothing to decide: every repeated line already has the same wording.' : 'Tap “Scan repeated lines” to find lines that were sung more than once and choose the right wording.<br><br>“Scan with audio” also catches repeats that Whisper wrote differently each time.'));
        else repEl.appendChild(mkEl('div', 'rnote', 'Tip: tap ▶ to hear each time the line is sung. Use the menu under a line to give it a specific wording. If none of the versions is right, tick only the lines that should change (a line that was changed on purpose can be left out), or write a custom version.'));
        repSelBtn();
      }
      $e('#e-rscan').onclick = () => repScan(false); $e('#e-rscanA').onclick = () => repScan(true); $e('#e-rshow').onchange = repRender;
      $e('#e-rall').onclick = () => { let n = 0, k = 0; snap(); repGroups.forEach(g => { if (g.on === false || repVariants(g).filter(v => !v.alt).length < 2) return; let picked = repPicked(g); if (!picked.length) { const sg = repSuggest(g); if (!sg) return; picked = [sg]; } const tg = g.rows.filter(r => !(g.off && g.off.has(r))); if (!tg.length) return; tg.forEach(r => { const nt = repTarget(g, r, picked); if (nt != null && nt !== r.text) { r.text = nt; k++; } }); n++; }); if (!n) { hist.pop(); toast('Nothing to apply. Tick at least one group.'); return; } render(); repRender(); toast('Applied the ticked wordings: ' + k + ' line' + (k === 1 ? '' : 's') + ' in ' + n + ' group' + (n === 1 ? '' : 's') + '.'); };
      $e('#e-rsel').onclick = () => { repGroups.forEach(g => { g.on = true; if (g.off) g.off.clear(); }); repRender(); };
      $e('#e-rnone').onclick = () => { repGroups.forEach(g => { g.on = false; }); repRender(); };
      // ================= Lyrics you already know: line them up with what the audio says =================
      const lyricLines = txt => String(txt).split(/\r?\n/).map(l => l.replace(/^\s*(\[\d{1,3}:\d{2}(?:[.:]\d{1,3})?\]\s*)+/, '').trim()).filter(l => l && !/^\[[^\]]*\]$/.test(l));
      const srcRows = () => rows.filter(r => r.text.trim()).map(r => ({ s: r.s, e: endOf(rows.indexOf(r)), text: r.text }));
      const needSrc = () => { const s = srcRows(); if (s.length < 2) { toast('Transcribe the track with Whisper first (or add lines), so there is something to match the lyrics to.'); return null; } return s; };
      const useAligned = (lines, al) => { mut(() => { rows = lines.map((l, i) => ({ s: al.starts[i], e: null, text: l })); sel = null; }); toast('Lyrics synced. ' + Math.round(al.ratio * 100) + '% of the words matched the audio.' + (al.ratio < 0.5 ? ' Low match: check the timing.' : '')); };
      $e('#e-sync').onclick = () => {
        const w = mkEl('div'); w.style.cssText = 'display:flex;flex-direction:column;gap:8px';
        w.innerHTML = '<div style="font-size:12px;opacity:.75">Paste the correct lyrics, one line per row. The words stay exactly as typed; only the timing comes from the audio, using the lines currently in the editor as a guide. Lines like [Chorus] are ignored.</div><textarea id="e-lt" placeholder="Paste lyrics here…"></textarea>';
        modal('Sync my own lyrics', w, [{ label: 'Cancel' }, { label: 'Sync', pri: 1, fn: () => { const lines = lyricLines(w.querySelector('#e-lt').value); if (!lines.length) { toast('Paste some lyrics first.'); return false; } const src = needSrc(); if (!src) return false; const al = rpAlign(src, lines); if (al.ratio < 0.2) { toast('These lyrics barely match the audio (' + Math.round(al.ratio * 100) + '%). Is it the right song?'); return false; } useAligned(lines, al); } }]);
      };
      const lrcShift = (lrc, src) => { const al = rpAlign(src, lrc.map(r => r.text)), d = []; lrc.forEach((r, i) => { if (al.anchored[i]) d.push(al.starts[i] - r.s); }); d.sort((a, b) => a - b); return { ratio: al.ratio, shift: d.length >= 3 ? d[d.length >> 1] : 0, n: d.length }; };
      $e('#e-net').onclick = () => {
        const t = edTrack || cur(); if (!t) { toast('Play or select a track first.'); return; }
        const w = mkEl('div'); w.style.cssText = 'display:flex;flex-direction:column;gap:8px';
        const q0 = lyQuery(t);
        w.innerHTML = '<div style=\"font-size:12px;opacity:.75\">Looks the song up on free lyrics sites (LRCLIB, Lyrics.ovh, Textyl). Only the text shown below is sent, and only when Search is tapped. Whatever is picked is checked against the audio before use. The language filter is a guess from the lyrics text.</div><input type=\"text\" id=\"e-nq\"><select id=\"e-nsrc\"><option value=\"all\">All sites</option>' + Object.keys(LY_SRC).map(k => '<option value=\"' + k + '\">' + LY_SRC[k].name + '</option>').join('') + '</select><select id=\"e-nlang\">' + LY_LANGS.map(l => '<option value=\"' + l[0] + '\">' + l[1] + '</option>').join('') + '</select><button id=\"e-nsearch\" class=\"pri\">Search</button><div id=\"e-nres\" style=\"display:flex;flex-direction:column;gap:6px\"></div>';
        w.querySelector('#e-nq').value = q0; const res = w.querySelector('#e-nres');
        const choose = async it => {
          res.textContent = 'Loading…'; try { await lyEnsure(it); } catch (e) { res.textContent = 'Could not load those lyrics (' + errText(e).slice(0, 80) + ')'; return; }
          const syn = it.syncedLyrics ? parseLrcText(it.syncedLyrics).filter(r => r.text) : [], plain2 = lyricLines(it.plainLyrics || ''), src = srcRows(); res.textContent = '';
          res.appendChild(mkEl('div', '', '<b>' + (it.trackName || '') + '</b><br><small style="opacity:.7">' + (it.artistName || '') + (it.duration ? ' · ' + mmss(it.duration) : '') + '</small>'));
          const add = (label, fn, pri, note) => { const b = mkEl('button', pri ? 'pri' : '', label); b.onclick = () => { closeModal(); fn(); }; res.appendChild(b); if (note) res.appendChild(mkEl('div', 'rnote', note)); };
          const lines = syn.length ? syn.map(r => r.text) : plain2;
          if (!lines.length) { res.appendChild(mkEl('div', 'rnote', 'That entry has no lyrics.')); return; }
          if (src.length >= 2) {
            const al = rpAlign(src, lines), pc = Math.round(al.ratio * 100);
            res.appendChild(mkEl('div', 'rnote', 'Match with the audio: ' + pc + '%' + (al.ratio < 0.35 ? '. That is low, it may be a different song or version.' : '')));
            add('Use these lyrics, timed from my audio', () => useAligned(lines, al), 1, 'Best choice: the words from the database, the timing from the track itself.');
            if (syn.length) { const sh = lrcShift(syn, src), s = Math.abs(sh.shift) > 0.25 ? sh.shift : 0; add('Use their timestamps' + (s ? ' (shifted ' + (s > 0 ? '+' : '') + s.toFixed(1) + 's to fit)' : ''), () => { mut(() => { rows = syn.map(r => ({ s: Math.max(0, r.s + s), e: null, text: r.text })); sel = null; }); toast('Loaded ' + syn.length + ' lines with the database timing.'); }, 0, s ? 'Their timing was measured against the audio and corrected.' : ''); }
          } else {
            if (syn.length) add('Use their timestamps (not checked against the audio)', () => { mut(() => { rows = syn.map(r => ({ s: r.s, e: null, text: r.text })); sel = null; }); toast('Loaded ' + syn.length + ' lines. Transcribe with Whisper later to verify them.'); }, 1);
            if (plain2.length) add('Use plain text (lines 4 seconds apart)', () => { mut(() => { rows = plain2.map((l, i) => ({ s: i * 4, e: null, text: l })); sel = null; }); toast('Loaded. Re-time the lines, or transcribe with Whisper and use Sync.'); });
          }
          add('‹ Back to results', () => { $e('#e-mod').classList.add('on'); }, 0);
        };
        const search = async () => {
          const q = w.querySelector('#e-nq').value.trim(); if (!q) return; res.textContent = 'Searching…';
          const sv = w.querySelector('#e-nsrc').value, lg = w.querySelector('#e-nlang').value; ls('ppvLySrc', sv); ls('ppvLyLang', lg);
          const m = media(), du = m && isFinite(m.duration) ? m.duration : 0;
          let { items: j, failed } = await lySearch(q, sv === 'all' ? Object.keys(LY_SRC) : [sv]);
          j = j.filter(it => it.load || it.plainLyrics || it.syncedLyrics); if (du) j.sort((a, b) => Math.abs((a.duration || 1e4) - du) - Math.abs((b.duration || 1e4) - du)); j = j.slice(0, lg ? 12 : 8);
          if (lg) { res.textContent = 'Checking languages…'; await Promise.all(j.map(it => lyEnsure(it).catch(() => {}))); j = j.filter(it => (it.plainLyrics || it.syncedLyrics) && guessLang(lyText(it)) === lg); }
          res.textContent = '';
          if (failed.length) res.appendChild(mkEl('div', 'rnote', 'Could not reach: ' + failed.join(', ') + '.'));
          if (!j.length) { res.appendChild(mkEl('div', '', failed.length && sv !== 'all' || failed.length === Object.keys(LY_SRC).length ? 'Could not reach the lyrics sites. This needs an internet connection.' : (lg ? 'No lyrics found in ' + lyName(lg) + '. Try Any language or fewer words.' : 'No lyrics found. Try fewer words, e.g. just the song title.'))); return; }
          j.forEach(it => { const gl = (it.plainLyrics || it.syncedLyrics) ? guessLang(lyText(it)) : '', b = mkEl('button', '', '<b>' + (it.trackName || '?') + '</b> · ' + (it.artistName || '?') + '<br><small style=\"opacity:.7\">' + it.src + (gl ? ' · ' + lyName(gl) : '') + (it.duration ? ' · ' + mmss(it.duration) : '') + (du && it.duration ? ' (this track ' + mmss(du) + ')' : '') + (it.syncedLyrics ? ' · has timestamps' : ' · text only') + '</small>'); b.style.textAlign = 'left'; b.onclick = () => choose(it); res.appendChild(b); });
        };
        w.querySelector('#e-nsrc').value = ls('ppvLySrc') || 'all'; w.querySelector('#e-nlang').value = ls('ppvLyLang') || '';
        w.querySelector('#e-nsearch').onclick = search; w.querySelector('#e-nq').onkeydown = ev => { if (ev.key === 'Enter') search(); };
        modal('Find lyrics online', w, [{ label: 'Close' }]); search();
      };
      $e('#e-tr').onclick = () => {
        const src = rows.filter(r => r.text.trim()); if (!src.length) { toast('Nothing to translate. Add or find lyrics first.'); return; }
        const NT = window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.PPTranslate;
        const w = mkEl('div'); w.style.cssText = 'display:flex;flex-direction:column;gap:8px';
        w.innerHTML = '<div style=\"font-size:12px;opacity:.75\">Replaces the text of each line with its translation. Timing stays the same. Undo or Revert to saved brings the original back until you save. Nothing leaves the device.</div><select id=\"e-trl\">' + LY_LANGS.filter(l => l[0]).map(l => '<option value=\"' + l[0] + '\">' + l[1] + '</option>').join('') + '</select><select id=\"e-tre\">' + (NT ? '<option value=\"nat\">Device translator (Google ML Kit): fast, offline after a one-time language download</option>' : '') + '<option value=\"ai\">On-device AI (Bloopy brain): rougher</option></select><div id=\"e-trs\" class=\"rnote\"></div>';
        const tl = w.querySelector('#e-trl'), te = w.querySelector('#e-tre'), ts = w.querySelector('#e-trs'); tl.value = ls('ppvTrLang') || 'en'; te.value = ls('ppvTrEng') === 'ai' || !NT ? 'ai' : 'nat';
        let running = false; const alive = () => $e('#e-mod').classList.contains('on');
        const run = async () => {
          if (running) return; const to = tl.value, eng = te.value; ls('ppvTrLang', to); ls('ppvTrEng', eng);
          const lines = src.map(r => r.text.replace(/\s+/g, ' ').trim()), from = guessLang(lines.join('\n'));
          if (from === to) { ts.textContent = 'These lyrics already look like ' + lyName(to) + '. Pick another language.'; return; }
          const ch = h.mas.chat; if (eng === 'ai' && !ch.ready() && !confirm('The on-device translator uses the AI brain: a one-time download of about ' + ch.mb() + ' MB. Continue?')) return;
          running = true; ts.textContent = eng === 'nat' ? 'Preparing the translator. The first time for a language it downloads a small pack, so it needs internet once…' : 'Starting…';
          try {
            const prog = (d, n) => { ts.textContent = 'Translating… ' + d + ' of ' + n + ' lines'; };
            const out = eng === 'ai' ? await lyTrAi(lines, to, ch.ask, x => { ts.textContent = x; }, prog, alive) : await lyTrNative(NT, lines, from, to, prog, alive);
            if (!out) { running = false; return; }
            const n = out.filter((x, i) => x !== lines[i]).length;
            if (!n) { ts.textContent = 'Nothing came back. Try the other translator.'; running = false; return; }
            mut(() => { src.forEach((r, i) => { if (out[i]) r.text = out[i]; }); }); closeModal(); toast('Translated ' + n + ' lines to ' + lyName(to) + '.');
          } catch (e) { ts.textContent = 'Could not translate: ' + errText(e).slice(0, 120); }
          running = false;
        };
        modal('Translate lyrics', w, [{ label: 'Cancel' }, { label: 'Translate', pri: 1, fn: () => { run(); return false; } }]);
      };
      $('#ppv-edopen').onclick = open;
      // refresh the editor after Whisper writes new text
      const origGo = $('#ppv-wgo').onclick;
      $('#ppv-wgo').onclick = async function () { await origGo.apply(this, arguments); if (edet.open) load(); };
      // ---------- Subtitles for audio tracks (CC button + line under the disc) ----------
      {
        const viz = document.getElementById('viz-wrap'), aud = document.getElementById('audio');
        if (viz && aud) {
          // ---------- Song text: captions and lyrics share one box that always fits the screen, with its own look ----------
          const ST_CSS = '#ppv-st{position:absolute;z-index:4;pointer-events:none;display:flex;flex-direction:column;align-items:center;gap:4px;overflow:hidden;text-align:center;font-family:var(--st-font);--st-k:1}' +
            '#ppv-st.p-below{justify-content:flex-start}#ppv-st.p-over{justify-content:center}#ppv-st.p-above{justify-content:flex-end}' +
            '#ppv-st.c-rainbow{animation:st-hue 6s linear infinite}' +
            '#ppv-st #ppv-asub,#ppv-st #lyrics-overlay{position:static;max-width:100%;flex:0 0 auto;transform:scale(var(--st-beat,1));transition:transform .09s linear}' +
            '#ppv-st .st-l{display:inline-block;max-width:100%;min-height:0;overflow-wrap:anywhere;white-space:normal;line-height:1.3;border-radius:6px;padding:.15em .5em;font-weight:var(--st-weight);text-transform:var(--st-caps);text-shadow:var(--st-ts);background:rgba(0,0,0,var(--st-bg));color:var(--st-color);font-size:calc(16px*var(--st-size)*var(--st-k))}' +
            '#ppv-st .ly-next.st-l{display:block;font-size:calc(12.5px*var(--st-size)*var(--st-k));opacity:.6;margin-top:2px;font-weight:400;background:none}#ppv-st.nonext .ly-next,#ppv-st.tight .ly-next{display:none}' +
            '.st-w{display:inline-block;transition:opacity .18s,transform .18s,text-shadow .18s}.st-hl .st-w{opacity:.42}.st-hl .st-w.on{opacity:1}.st-hl .st-w.now{transform:scale(1.1);position:relative;color:color-mix(in srgb,var(--st-color) 42%,transparent);text-shadow:none}.st-hl .st-w.now::after{content:attr(data-w);position:absolute;left:0;top:0;white-space:nowrap;color:var(--st-color);text-shadow:0 0 .45em var(--st-color),var(--st-ts);clip-path:inset(-1em calc(100% - var(--p,0) * (100% + 1em)) -1em -1em)}' +
            '@keyframes st-hue{to{filter:hue-rotate(360deg)}}@keyframes st-fade{from{opacity:0}}@keyframes st-pop{from{opacity:0;transform:scale(.6)}60%{transform:scale(1.07)}}@keyframes st-slide{from{opacity:0;transform:translateY(.8em)}}@keyframes st-blur{from{opacity:0;filter:blur(8px)}}@keyframes st-word{from{opacity:0;transform:translateY(.5em)}}@keyframes st-wave{0%{opacity:0}35%{opacity:1;transform:translateY(-.4em)}70%{transform:translateY(.08em)}}@keyframes st-flip{from{opacity:0;transform:rotateX(90deg)}}' +
            '#ppv-st.fx-fade .st-in{animation:st-fade .28s ease-out}#ppv-st.fx-pop .st-in{animation:st-pop .32s cubic-bezier(.2,1.3,.4,1)}#ppv-st.fx-slide .st-in{animation:st-slide .28s ease-out}#ppv-st.fx-blur .st-in{animation:st-blur .36s ease-out}#ppv-st.fx-flip .st-in{animation:st-flip .34s ease-out}' +
            '#ppv-st.fx-words .st-in .st-w{animation:st-word .3s ease-out backwards;animation-delay:calc(var(--i)*55ms)}#ppv-st.fx-wave .st-in .st-w{animation:st-wave .45s ease-out backwards;animation-delay:calc(var(--i)*45ms)}' +
            '#ppv-apanel .st-lab{font-size:12px;opacity:.75;margin:10px 0 4px;display:flex;justify-content:space-between}#ppv-apanel .st-row{display:flex;flex-wrap:wrap;gap:6px}#ppv-apanel .st-row button{width:auto;flex:0 0 auto;margin:0;padding:6px 10px;border:1px solid var(--line,#444);background:transparent;color:var(--text,#eee);border-radius:8px;font-size:12.5px;cursor:pointer}#ppv-apanel .st-row button.on{background:var(--accent,#7c3aed);color:#000;border-color:transparent;font-weight:700}#ppv-apanel .st-row input[type=color]{width:38px;height:30px;padding:0;border:1px solid var(--line,#444);border-radius:8px;background:none}#ppv-apanel input[type=range]{width:100%}';
          const st = document.createElement('style');
          st.textContent = '#ppv-acc{position:absolute;top:-6px;right:-6px;z-index:6;width:34px;height:34px;border-radius:50%;border:1px solid var(--line,#555);background:var(--bg,#1b1c21);color:var(--text,#eee);font:700 11px system-ui;cursor:pointer;display:none;padding:0}#ppv-acc.on{background:var(--accent,#7c3aed);color:#fff;border-color:transparent}#ppv-asub{text-align:center;pointer-events:none;display:none}#ppv-apanel{position:fixed;z-index:9999;left:50%;top:50%;transform:translate(-50%,-50%);width:min(92vw,420px);max-height:78vh;overflow:auto;background:var(--bg,#1b1c21);color:var(--text,#eee);border:1px solid var(--line,#444);border-radius:12px;padding:12px;display:none}#ppv-apanel.open{display:block}' + ST_CSS;
          document.head.appendChild(st);
          const btn = document.createElement('button'); btn.id = 'ppv-acc'; btn.textContent = 'CC'; btn.title = 'Captions and lyrics'; btn.setAttribute('aria-label', 'Captions and lyrics');
          const box = document.createElement('div'); box.id = 'ppv-asub'; const sp = document.createElement('span'); box.appendChild(sp);
          const panel = document.createElement('div'); panel.id = 'ppv-apanel'; panel.className = 'ppv-scope';
          panel.innerHTML = '<div class="ppv-row"><b style="flex:1;align-self:center">Captions &amp; lyrics</b><button class="ppv-sec" id="ppv-apx" style="width:auto;padding:4px 12px" data-keep="1">Close</button></div><div class="ppv-note" id="ppv-ast">No subtitles</div><button id="ppv-aton" class="ppv-sec">Turn on</button><button id="ppv-ald" class="ppv-sec">Load subtitle file (.srt/.vtt/.lrc)</button><button id="ppv-arm" class="ppv-sec">Remove from this track</button><input type="file" id="ppv-af" accept=".srt,.vtt,.lrc,.txt" style="display:none"><div id="ppv-stui"></div><hr style="border:0;border-top:1px solid var(--line,#444);margin:10px 0">';
          viz.append(btn, box); document.body.appendChild(panel);
          audPanel = panel;
          let cues = [], off = 0, lastId = null, shown = '', cuePace = 0;
          const isOn = () => ls('ppvAudSub') === '1';
          const loadCues = () => {
            cues = []; off = 0; const t = cur(); lastId = t ? t.dbId : null; if (!t || t.kind === 'video') return;
            try { const o = JSON.parse(localStorage.getItem('playerSubtitles') || '{}')[t.dbId]; const c = o && (Array.isArray(o) ? o.map(x => [x.start, x.end, x.text]) : o.c); if (c) { cues = c.map(x => ({ s: +x[0], e: +x[1], text: String(x[2]) })).sort((a, b) => a.s - b.s); off = (!Array.isArray(o) && isFinite(+o.o)) ? +o.o : 0; } } catch (e) {}
            cuePace = stPace(cues);
          };
          const status = () => { $('#ppv-ast').textContent = cues.length ? cues.length + ' lines' + (cues.length ? '' : '') : 'No subtitles for this track yet. Generate them with Whisper below, or load a file.'; $('#ppv-aton').textContent = isOn() ? 'Turn off' : 'Turn on'; $('#ppv-aton').disabled = !cues.length; $('#ppv-arm').disabled = !cues.length; btn.classList.toggle('on', isOn() && cues.length > 0); };
          const ST_DEF = { size: 100, pos: 'below', color: '#ffffff', font: 'default', look: 'outline', bg: 0, bold: 1, caps: 0, fx: 'fade', hl: 0, beat: 0, next: 1, sdh: 0 };
          const ST_FONTS = { default: 'inherit', serif: 'Georgia,serif', mono: "'Courier New',monospace", arial: 'Arial,Helvetica,sans-serif', condensed: "'Arial Narrow',sans-serif-condensed,Arial,sans-serif", impact: "Impact,'Arial Narrow Bold',sans-serif", casual: "'Comic Sans MS','Chalkboard SE',cursive" };
          const ST_LOOKS = { box: { bg: 70 }, outline: { bg: 0 }, cinema: { bg: 0 }, neon: { bg: 0 }, plain: { bg: 0 } };
          const ST = Object.assign({}, ST_DEF); try { Object.assign(ST, JSON.parse(ls('ppvSongText') || '{}')); } catch (e) {}
          const wrap = document.createElement('div'); wrap.id = 'ppv-st';
          const lyEl = document.getElementById('lyrics-overlay');
          viz.appendChild(wrap); wrap.appendChild(box); if (lyEl) wrap.appendChild(lyEl);
          sp.className = 'st-l';
          let stSync = 0, stDirty = true, stKey = '', preview = false;
          const syncMap = () => { try { return JSON.parse(ls('ppvSongSync') || '{}') || {}; } catch (e) { return {}; } };
          window.__ppSongSync = () => stSync;
          const stApply = () => {
            const c = wrap.style, col = ST.color === 'accent' ? 'var(--accent,#6ee7d0)' : ST.color === 'rainbow' ? '#ff6b6b' : ST.color;
            const o = '#000', ol = [[1, 0], [-1, 0], [0, 1], [0, -1], [.7, .7], [-.7, .7], [.7, -.7], [-.7, -.7]].map(d => (d[0] * 1.4).toFixed(1) + 'px ' + (d[1] * 1.4).toFixed(1) + 'px 0 ' + o).join(',');
            const ts = ST.look === 'outline' ? ol + ',0 1px 6px rgba(0,0,0,.8)' : ST.look === 'cinema' ? '0 2px 10px rgba(0,0,0,.95),0 0 2px #000' : ST.look === 'neon' ? '0 0 .2em ' + col + ',0 0 .6em ' + col + ',0 0 1.1em ' + col : ST.look === 'plain' ? 'none' : '0 0 0 transparent';
            c.setProperty('--st-size', ST.size / 100); c.setProperty('--st-color', ST.look === 'neon' ? '#fff' : col); c.setProperty('--st-font', ST_FONTS[ST.font] || 'inherit');
            c.setProperty('--st-weight', ST.bold ? 700 : 400); c.setProperty('--st-caps', ST.caps ? 'uppercase' : 'none'); c.setProperty('--st-ts', ts); c.setProperty('--st-bg', ST.bg / 100);
            wrap.className = 'p-' + ST.pos + ' fx-' + ST.fx + (ST.next ? '' : ' nonext') + (ST.color === 'rainbow' ? ' c-rainbow' : '');
            if (!ST.beat) c.setProperty('--st-beat', 1);
            stDirty = true;
          };
          const stClean = t => !ST.sdh ? t : String(t).split('\n').map(l => l.replace(/\[[^\]]*\]|\([^)]*\)|[♪♫]+/g, ' ').replace(/\s+/g, ' ').trim()).filter(Boolean).join('\n');
          // How fast this song is sung, in seconds per letter, worked out from its own lines. A line's time slot is never shorter than
          // the singing in it, so the tighter slots show the real speed. 0 = too few lines to tell.
          const stUnits = text => String(text || '').split(/\s+/).filter(Boolean).reduce((n, w) => n + w.length + 1.5, 0);
          function stPace(lines) {
            const rs = [];
            for (const l of lines || []) { const d = l.e - l.s, t = stClean(l.text); if (d > 0.4 && d < 15 && t.split(/\s+/).filter(Boolean).length >= 3) rs.push(d / stUnits(t)); }
            if (rs.length < 4) return 0;
            rs.sort((a, b) => a - b);
            return Math.max(0.025, Math.min(0.12, rs[Math.floor(rs.length * 0.4)] * 1.1));
          }
          // Puts a line into an element one word at a time, so words can come in and light up on their own.
          // wt = real word timings from the lyrics file ({ at: [start of each word], end }), when it has them.
          const stFill = (el, text, s, e, pace, wt) => {
            el.__stRaw = text || ''; text = stClean(text || '');
            if (el.__stT === text && el.__stS === s) return;
            el.__stT = text; el.__stS = s; el.__stE = e; el.__stP = pace; el.__stWt = wt || null; el.textContent = ''; el.classList.add('st-l');
            const ws = []; let i = 0;
            text.split('\n').forEach((line, li) => {
              if (li) el.appendChild(document.createElement('br'));
              line.split(/\s+/).filter(Boolean).forEach((w, wi) => { if (wi) el.appendChild(document.createTextNode(' ')); const x = document.createElement('span'); x.className = 'st-w'; x.style.setProperty('--i', i++); x.textContent = w; x.dataset.w = w; el.appendChild(x); ws.push(x); });
            });
            let tot = 0; const len = ws.map(x => { const n = x.textContent.length + 1.5; tot += n; return n; });
            el.__stW = ws;
            if (wt && wt.at && wt.at.length === ws.length && ws.length) {   // the file says when each word starts
              const L = wt.at[ws.length - 1];
              el.__stAt = wt.at.slice(); el.__stWE = wt.end > L ? wt.end : Math.min(e > L ? e : L + 1, L + 0.25 + len[ws.length - 1] * (pace || 0.07));
            } else {
              // No word timings, so each word gets a share of the line by its length, at the song's own pace. Long gaps after a line are not sung.
              const dur = Math.max(0.3, Math.min(e > s ? e - s : 3, pace > 0 ? 0.15 + tot * pace : 0.5 + ws.length * 0.42 + tot * 0.03)); let acc = 0;
              el.__stAt = len.map(n => { const a = s + dur * acc / tot; acc += n; return a; }); el.__stWE = s + dur;
            }
            el.classList.remove('st-in'); void el.offsetWidth; if (text) el.classList.add('st-in');
            stDirty = true;
          };
          const stMark = (el, now) => {
            const ws = el && el.__stW, at = el && el.__stAt; if (!ws) return;
            const hl = !!ST.hl && el.__stS >= 0; el.classList.toggle('st-hl', hl); if (!hl) return;
            now += 0.09;                                             // a word takes a moment to light up, so start it slightly early
            for (let i = 0; i < ws.length; i++) {
              const w = ws[i], nx = i + 1 < ws.length ? at[i + 1] : el.__stE, a = now >= at[i], c = a && now < nx, st = c ? 2 : a ? 1 : 0;
              if (w.__s !== st) { w.__s = st; w.classList.toggle('on', a); w.classList.toggle('now', c); }
              if (c) {                                               // the word being sung fills in from left to right
                const we = Math.min(nx, i + 1 < ws.length ? nx : el.__stWE), v = (we > at[i] ? Math.min(1, (now - at[i]) / (we - at[i])) : 1).toFixed(3);
                if (w.__p !== v) { w.__p = v; w.style.setProperty('--p', v); }
              }
            }
          };
          // While a song plays with the highlight on, the words are redrawn every frame so the fill moves smoothly.
          let stRaf = 0;
          const stFrame = () => {
            stRaf = 0; if (!ST.hl || aud.paused) return;
            const now = aud.currentTime - stSync, lc = lyEl && lyEl.classList.contains('show') ? lyEl.querySelector('.ly-cur') : null;
            if (!shown && !lc) return;
            if (shown) stMark(sp, now - off);
            if (lc) stMark(lc, now);
            stRaf = requestAnimationFrame(stFrame);
          };
          // The lyric lines in the main page are drawn through here too, so both kinds of text look and behave the same.
          window.__ppSongText = { line: stFill, pace: stPace };
          // Where the box goes: always inside the screen, never over the song title. Text that is still too tall gets smaller.
          const stLayout = () => {
            const r = viz.getBoundingClientRect(); if (r.width < 20) return;
            const vw = window.innerWidth, vh = window.innerHeight, m = 10;
            let top, bot;
            if (ST.pos === 'over') { top = r.top + r.height * 0.22; bot = r.top + r.height * 0.78; }
            else if (ST.pos === 'above') { bot = r.top - 10; top = Math.max(56, bot - 150); if (bot - top < 44) { top = r.top + 4; bot = top + 120; } }   // clear of the CC button; no room above (landscape): top of the disc instead
            else {
              top = r.top + r.height * 0.875; bot = Math.min(vh - 8, r.bottom + 70);
              const np = document.getElementById('now-playing'), nr = np && np.offsetParent ? np.getBoundingClientRect() : null;
              if (nr && nr.top > r.top + r.height / 2) bot = Math.min(bot, nr.top - 4);
              if (bot - top < 44) top = bot - 44;                    // very little room under the disc: let it ride up over the edge of it
            }
            const key = [Math.round(r.left), Math.round(top), Math.round(bot), vw, ST.size].join(',');
            if (key !== stKey) { stKey = key; stDirty = true; wrap.style.left = (m - r.left) + 'px'; wrap.style.width = (vw - 2 * m) + 'px'; wrap.style.top = (top - r.top) + 'px'; wrap.style.height = (bot - top) + 'px'; }
            if (!stDirty) return; stDirty = false;
            const room = bot - top, need = () => { let h = 0, n = 0; for (const ch of wrap.children) { if (ch.offsetHeight) { h += ch.offsetHeight; n++; } } return h + Math.max(0, n - 1) * 4; };
            let k = 1; wrap.classList.remove('tight'); wrap.style.setProperty('--st-k', k);
            while (need() > room && k > 0.72) { k -= 0.07; wrap.style.setProperty('--st-k', k.toFixed(2)); }
            if (need() > room) { wrap.classList.add('tight'); k = 1; wrap.style.setProperty('--st-k', k); while (need() > room && k > 0.5) { k -= 0.07; wrap.style.setProperty('--st-k', k.toFixed(2)); } }
          };
          const tick = () => {
            const t = cur(), a = t && t.kind !== 'video';
            btn.style.display = a ? 'block' : 'none';
            if (!a) { box.style.display = 'none'; lastId = null; return; }
            if (t.dbId !== lastId) { loadCues(); status(); stSync = +syncMap()[t.dbId] || 0; stSyncUi(); }
            const now = aud.currentTime - stSync, n = now - off; let txt = '', s0 = -1, e0 = -1;
            if (isOn() && cues.length) for (const c of cues) { if (c.s > n) break; if (n < c.e) { txt += (txt ? '\n' : '') + c.text; if (s0 < 0) s0 = c.s; e0 = Math.max(e0, c.e); } }
            const lyOn = !!(lyEl && lyEl.classList.contains('show'));
            if (!txt && preview && !lyOn) { txt = 'This is how the words will look'; s0 = n - (n % 4); e0 = s0 + 4; }
            if (txt !== shown) { shown = txt; stFill(sp, txt, s0, e0, cuePace); }
            box.style.display = txt && sp.__stT ? 'block' : 'none';
            stMark(sp, n);
            if (lyOn) stMark(lyEl.querySelector('.ly-cur'), now);
            if (ST.beat) { let lv = -1; try { lv = aud.paused ? 0 : window.__ppBassLevel(); } catch (e) {} wrap.style.setProperty('--st-beat', (1 + Math.min(0.14, Math.max(0, lv - 0.02) * 0.7)).toFixed(3)); }
            if (txt || lyOn) stLayout();
            if (ST.hl && !aud.paused && !stRaf && (txt || lyOn)) stRaf = requestAnimationFrame(stFrame);
          };
          setInterval(tick, 60);
          window.addEventListener('resize', () => { stKey = ''; });
          // ----- the controls -----
          const ui = panel.querySelector('#ppv-stui');
          const row = (label, key, opts) => '<div class="st-lab"><span>' + label + '</span></div><div class="st-row" data-k="' + key + '">' + opts.map(o => '<button data-v="' + o[0] + '"' + (o[2] ? ' style="' + o[2] + '"' : '') + '>' + o[1] + '</button>').join('') + '</div>';
          ui.innerHTML = '<hr style="border:0;border-top:1px solid var(--line,#444);margin:10px 0"><b>Look and effects</b><div class="ppv-note">For captions and lyrics on songs. The words always stay inside the screen.</div>' +
            '<div class="st-lab"><span>Timing for this song</span><span id="st-sync-v">0.0s</span></div><div class="st-row" id="st-sync"><button data-d="-0.5">−0.5</button><button data-d="-0.1">−0.1</button><button data-d="0.1">+0.1</button><button data-d="0.5">+0.5</button><button data-d="0">Reset</button></div>' +
            row('Where', 'pos', [['below', 'Under the disc'], ['over', 'On the disc'], ['above', 'Above the disc']]) +
            '<div class="st-lab"><span>Text size</span><span id="st-size-v"></span></div><input type="range" id="st-size" min="60" max="220" step="5">' +
            row('Style', 'look', [['outline', 'Outline'], ['box', 'Box'], ['cinema', 'Cinema'], ['neon', 'Neon glow'], ['plain', 'Plain']]) +
            '<div class="st-lab"><span>Background</span><span id="st-bg-v"></span></div><input type="range" id="st-bg" min="0" max="100" step="5">' +
            '<div class="st-lab"><span>Color</span></div><div class="st-row" data-k="color">' + [['#ffffff', 'White'], ['#ffe14d', 'Yellow'], ['#6ee7d0', 'Aqua'], ['#7CFC7C', 'Green'], ['#7db8ff', 'Blue'], ['#ff8ad8', 'Pink'], ['#ffa94d', 'Orange'], ['#ff6b6b', 'Red']].map(o => '<button data-v="' + o[0] + '" style="color:' + o[0] + '">' + o[1] + '</button>').join('') + '<button data-v="accent">Theme</button><button data-v="rainbow">Rainbow</button><input type="color" id="st-col" value="#ffffff" title="Custom color"></div>' +
            row('Font', 'font', [['default', 'Sans'], ['serif', 'Serif', 'font-family:Georgia,serif'], ['mono', 'Mono', "font-family:'Courier New',monospace"], ['arial', 'Arial', 'font-family:Arial'], ['condensed', 'Narrow', "font-family:'Arial Narrow',sans-serif-condensed"], ['impact', 'Impact', 'font-family:Impact'], ['casual', 'Casual', "font-family:'Comic Sans MS',cursive"]]) +
            row('How a new line comes in', 'fx', [['none', 'None'], ['fade', 'Fade'], ['pop', 'Pop'], ['slide', 'Slide up'], ['blur', 'Focus'], ['flip', 'Flip'], ['words', 'Word by word'], ['wave', 'Wave']]) +
            '<div class="st-lab"><span>Extras</span></div><div class="st-row" id="st-tg"><button data-t="hl" title="Words light up as they are sung">Sing-along highlight</button><button data-t="beat" title="The words pulse with the bass">Pulse with the beat</button><button data-t="next" title="Shows the next lyric line under the current one">Next lyric line</button><button data-t="bold">Bold</button><button data-t="caps">ALL CAPS</button><button data-t="sdh" title="Hides lines like [music], (sighs) and music notes">Hide [sounds]</button></div>';
          const stPaint = () => {
            ui.querySelectorAll('.st-row[data-k]').forEach(r => r.querySelectorAll('button').forEach(b => b.classList.toggle('on', String(ST[r.dataset.k]) === b.dataset.v)));
            ui.querySelectorAll('#st-tg button').forEach(b => b.classList.toggle('on', !!ST[b.dataset.t]));
            ui.querySelector('#st-size').value = ST.size; ui.querySelector('#st-size-v').textContent = ST.size + '%';
            ui.querySelector('#st-bg').value = ST.bg; ui.querySelector('#st-bg-v').textContent = ST.bg + '%';
            if (/^#[0-9a-f]{6}$/i.test(ST.color)) ui.querySelector('#st-col').value = ST.color;
          };
          function stSyncUi() { const v = ui.querySelector('#st-sync-v'); if (v) v.textContent = (stSync > 0 ? '+' : '') + stSync.toFixed(1) + 's' + (stSync > 0 ? ' later' : stSync < 0 ? ' earlier' : ''); }
          // Any change replays the line, so the effect that was just picked is seen straight away.
          const stChanged = () => { ls('ppvSongText', JSON.stringify(ST)); stApply(); stPaint(); shown = null; sp.__stT = null; const lc = lyEl && lyEl.querySelector('.ly-cur'); if (lc && lc.__stT) { const tx = lc.__stRaw != null ? lc.__stRaw : lc.__stT; lc.__stT = null; stFill(lc, tx, lc.__stS, lc.__stE, lc.__stP, lc.__stWt); } tick(); };
          ui.addEventListener('click', e => {
            const b = e.target.closest('button'); if (!b) return;
            const r = b.parentElement;
            if (r.id === 'st-sync') { const t = cur(); if (!t) return; const d = +b.dataset.d; stSync = d === 0 ? 0 : Math.max(-30, Math.min(30, +(stSync + d).toFixed(2))); const m = syncMap(); if (stSync) m[t.dbId] = stSync; else delete m[t.dbId]; ls('ppvSongSync', JSON.stringify(m)); stSyncUi(); tick(); return; }
            if (r.id === 'st-tg') { ST[b.dataset.t] = ST[b.dataset.t] ? 0 : 1; stChanged(); return; }
            if (r.dataset.k) { ST[r.dataset.k] = b.dataset.v; if (r.dataset.k === 'look') ST.bg = ST_LOOKS[b.dataset.v].bg; stChanged(); }
          });
          ui.querySelector('#st-size').addEventListener('input', e => { ST.size = +e.target.value; stChanged(); });
          ui.querySelector('#st-bg').addEventListener('input', e => { ST.bg = +e.target.value; stChanged(); });
          ui.querySelector('#st-col').addEventListener('input', e => { ST.color = e.target.value; stChanged(); });
          new MutationObserver(() => { preview = panel.classList.contains('open'); shown = null; tick(); }).observe(panel, { attributes: true, attributeFilter: ['class'] });
          stApply(); stPaint(); stSyncUi();
          try { const a = A(); if (a && a.setSubtitles && !a.__ppvW) { const o = a.setSubtitles; a.setSubtitles = function () { const r = o.apply(this, arguments); lastId = null; return r; }; a.__ppvW = 1; } } catch (e) {}
          btn.onclick = () => { loadCues(); status(); placeWhisper('aud'); panel.classList.toggle('open'); };
          $('#ppv-apx').onclick = () => panel.classList.remove('open');
          $('#ppv-aton').onclick = () => { ls('ppvAudSub', isOn() ? '0' : '1'); status(); tick(); };
          $('#ppv-arm').onclick = () => { const t = cur(); if (!t) return; try { const all = JSON.parse(localStorage.getItem('playerSubtitles') || '{}'); delete all[t.dbId]; localStorage.setItem('playerSubtitles', JSON.stringify(all)); } catch (e) {} loadCues(); status(); tick(); };
          $('#ppv-ald').onclick = () => $('#ppv-af').click();
          $('#ppv-af').onchange = async e => {
            const f = e.target.files[0]; e.target.value = ''; const t = cur(); if (!f || !t) return;
            const txt = (await f.text()).replace(/^﻿/, ''); let r = /-->/.test(txt) ? parseSrtText(txt) : parseLrcText(txt);
            rows = r; const c = toCues(); if (!c.length) { status(); $('#ppv-ast').textContent = 'Could not read any subtitles from that file.'; return; }
            A().setSubtitles(t.dbId, c, f.name); ls('ppvAudSub', '1'); loadCues(); status(); tick();
          };
        }
      }
    }
    refreshCount();
    // the list is always visible now, so keep it current as the library loads and tags change
    let lastSig = '';
    setInterval(() => { const a = A(); if (!a) return; const sig = a.tracks().length + ':' + tagVer; if (sig !== lastSig) { lastSig = sig; refreshCount(); } }, 1500);

