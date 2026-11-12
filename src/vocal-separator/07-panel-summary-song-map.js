  // ---------- Panel: library tools + lyrics ----------
  // ---------- AI summary: the tags say what it SOUNDS like, the lyrics/subtitles say what it is ABOUT ----------
  const SUM_KEY = 'ppSummaryV1';
  // Summaries live in their own IndexedDB (one record per track), not in localStorage: localStorage is one small shared budget
  // (about 5 MB for lyrics, subtitles, tags and settings too) and a full one used to make a save fail without a word.
  // sumLoad() stays instant: it returns an in-memory copy that is filled from the database at start-up.
  // The old localStorage blob is read once, copied into the database, and only then removed.
  let sumCache = (() => { try { return JSON.parse(localStorage.getItem(SUM_KEY)) || {}; } catch (e) { return {}; } })(), sumDbP = null;
  const sumDb = () => sumDbP || (sumDbP = new Promise((res, rej) => {
    try { const r = indexedDB.open('ppSummariesDB', 1); r.onupgradeneeded = () => r.result.createObjectStore('sums', { keyPath: 'id' }); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); } catch (e) { rej(e); }
  }).catch(e => { sumDbP = null; throw e; }));
  const sumTx = async (mode, fn) => {
    const db = await sumDb();
    return new Promise((res, rej) => { const tx = db.transaction('sums', mode); let out; fn(tx.objectStore('sums'), v => { out = v; }); tx.oncomplete = () => res(out); tx.onerror = tx.onabort = () => rej(tx.error); });
  };
  const sumLoad = () => sumCache;
  const sumPing = () => { try { document.dispatchEvent(new Event('ppv-sums')); } catch (e) {} };
  async function sumInit() {
    try {
      const rows = await sumTx('readonly', (st, set) => { const q = st.getAll(); q.onsuccess = () => set(q.result || []); });
      const have = new Set(rows.map(r => String(r.id)));
      rows.forEach(r => { if (r && r.id != null && r.v && (!sumCache[r.id] || (r.v.ts || 0) >= (sumCache[r.id].ts || 0))) sumCache[r.id] = r.v; });
      let legacy = null; try { legacy = JSON.parse(localStorage.getItem(SUM_KEY) || 'null'); } catch (e) {}
      if (legacy && typeof legacy === 'object') {
        const mv = Object.entries(legacy).filter(([id, v]) => v && v.t && !have.has(String(id)));
        if (mv.length) await sumTx('readwrite', st => { mv.forEach(([id, v]) => st.put({ id: String(id), v })); });
        try { localStorage.removeItem(SUM_KEY); } catch (e) {}                 // only after every record is safely in the database
      }
    } catch (e) { console.warn('summary store unavailable, using localStorage', e); }
    sumPing();
  }
  async function sumSave(id, v) {                                      // resolves true when the summary is safely stored on the device
    sumCache[id] = v; let ok = false;
    try { await sumTx('readwrite', st => { st.put({ id: String(id), v }); }); ok = true; } catch (e) { console.warn('summary save failed', e); }
    if (!ok) { try { localStorage.setItem(SUM_KEY, JSON.stringify(sumCache)); ok = true; } catch (e) {} }   // database unavailable: fall back to the old place
    try { if (ok && navigator.storage && navigator.storage.persist) navigator.storage.persist(); } catch (e) {}   // ask the browser not to clear it when space is low
    sumPing(); return ok;
  }
  async function sumDelete(id) {
    delete sumCache[id];
    try { await sumTx('readwrite', st => { st.delete(String(id)); }); } catch (e) {}
    try { const o = JSON.parse(localStorage.getItem(SUM_KEY) || 'null'); if (o && id in o) { delete o[id]; localStorage.setItem(SUM_KEY, JSON.stringify(o)); } } catch (e) {}
    sumPing();
  }
  sumInit();
  const andJoin = a => a.length < 2 ? (a[0] || '') : a.slice(0, -1).join(', ') + ' and ' + a[a.length - 1];
  function getTranscript(dbId) {                                       // subtitle cues first, else the saved lyrics; repeated lines (choruses, "yeah") counted once
    let lines = [];
    try { const e = (JSON.parse(localStorage.getItem('playerSubtitles')) || {})[dbId]; if (e && e.c) lines = e.c.map(c => String(c[2] || '').trim()); } catch (x) {}
    if (!lines.length) { try { const l = (JSON.parse(localStorage.getItem('playerLyricsV1')) || {})[dbId]; if (l) lines = String(l).split('\n').map(q => q.replace(/\[[^\]]*\]/g, '').trim()); } catch (x) {} }
    const seen = new Set(), out = [];
    for (const q of lines) { const k = q.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim(); if (!k || seen.has(k)) continue; seen.add(k); out.push(q); }
    return { lines: out, words: out.join(' ').split(/\s+/).filter(Boolean).length };
  }
  // ---------- Number guard for AI replies ----------
  // Small models garble numbers they copy ("98 BPM" + "78%" came out as "9878 BPM"). Fix what is clearly wrong:
  // a tempo that does not match the real one (allowing half/double time) becomes the real one, an impossible one is dropped,
  // and percentages over 100 are removed.
  function fixNums(text, bpms) {
    const known = (bpms || []).filter(b => b > 0);
    let out = String(text || '').replace(/\b(\d[\d,]*(?:\.\d+)?)\s*(BPM|bpm|beats per minute)\b/g, (all, num, unit) => {
      const raw = num.replace(/,/g, ''), n = +raw;
      const near = b => [b, b / 2, b * 2].some(x => Math.abs(n - x) <= 3);
      if (known.some(near)) return all;
      const inside = known.find(b => raw.includes(String(b)));
      if (inside) return inside + ' ' + unit;
      if (known.length === 1) return known[0] + ' ' + unit;
      if (n >= 40 && n <= 250 && !known.length) return all;
      return 'an unclear tempo';
    });
    out = out.replace(/\s*\(\s*(\d+(?:\.\d+)?)\s*%\s*\)/g, (all, n) => +n > 100 ? '' : all)
      .replace(/\b(\d+(?:\.\d+)?)\s*%/g, (all, n) => +n > 100 ? '' : all)
      .replace(/\b([Aa])bout an unclear tempo/g, '$1n unclear tempo').replace(/[ \t]{2,}/g, ' ').replace(/ ([,.;:])/g, '$1');
    return out;
  }
  // ---------- Song map: where the song changes (intro, verse, chorus, bridge, outro), from the lyrics AND the sound ----------
  // Lyrics (timed subtitle cues, else LRC, else plain stanzas) are cut into blocks at pauses and at the sound-section edges.
  // Blocks whose lines come back are the chorus; a one-off block after the second chorus is the bridge; the rest are verses.
  // Stretches with no singing keep the sound analysis label (Intro, Outro, Instrumental, Breakdown, Drop...).
  // Used by the AI summary (lyrics laid out by section), Song Talk and the tag view.
  function songMap(dbId, c) {
    c = c || loadTags()[dbId];
    const sc = c && c.sc && c.sc.length ? c.sc : null;
    let cues = [], timed = true;
    try { const e = (JSON.parse(localStorage.getItem('playerSubtitles')) || {})[dbId]; if (e && e.c) cues = e.c.map(q => [+q[0], +q[1], String(q[2] || '').trim()]).filter(q => q[2] && isFinite(q[0])); } catch (x) {}
    if (cues.length < 6) {
      let raw = ''; try { raw = String((JSON.parse(localStorage.getItem('playerLyricsV1')) || {})[dbId] || ''); } catch (x) {}
      const re = /\[(\d{1,3}):(\d{1,2})(?:[.:](\d{1,3}))?\]/g, lrc = [];
      raw.split(/\r?\n/).forEach(l => { const ts = []; let m; re.lastIndex = 0; while ((m = re.exec(l))) ts.push(+m[1] * 60 + +m[2] + (m[3] ? +('0.' + m[3]) : 0)); const tx = l.replace(re, '').trim(); if (tx && !/^\[[a-z]+:/i.test(l)) ts.forEach(t => lrc.push([t, NaN, tx])); });
      if (lrc.length >= 6) cues = lrc.sort((a, b) => a[0] - b[0]);
      else if (raw.trim()) {                                              // plain lyrics: stanzas (blank lines) are the blocks, no times
        timed = false; let k = 0; cues = [];
        raw.replace(/\[[^\]]*\]/g, '').split(/\r?\n/).forEach(l => { l = l.trim(); if (!l) { k++; return; } cues.push([k, NaN, l]); });
      }
    }
    cues.forEach((q, i) => { if (!isFinite(q[1]) || q[1] <= q[0]) q[1] = timed ? (cues[i + 1] ? Math.min(cues[i + 1][0], q[0] + 6) : q[0] + 4) : q[0]; });
    if (cues.length < 6 && !sc) return null;
    const nz = q => q.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
    const secAt = t => sc ? sc.findIndex(x => t >= x[0] - 0.5 && t < x[1]) : -1;
    const lc = new Map(); cues.forEach(q => { const k = nz(q[2]); if (k.length >= 4) lc.set(k, (lc.get(k) || 0) + 1); });
    const rp = i => cues[i] && lc.get(nz(cues[i][2])) >= 2;
    const flip = i => i > 0 && rp(i) !== rp(i - 1) && rp(i) === rp(i + 1) && rp(i - 1) === rp(i - 2);   // repeated lines start or stop (two lines either side agree)
    const blocks = []; let cur = null;
    cues.forEach((q, i) => {
      const si = timed ? secAt(q[0]) : -1, brk = !cur || (timed ? q[0] - cues[i - 1][1] > 3.5 || (sc && si !== cur.si && cur.lines.length >= 2) || (cur.lines.length >= 2 && flip(i)) : q[0] !== cues[i - 1][0]) || cur.lines.length >= 12;
      if (brk) { cur = { t0: q[0], t1: q[1], si, lines: [] }; blocks.push(cur); }
      cur.lines.push(q[2]); cur.t1 = q[1];
    });
    // repeats: how often each line is sung, and which blocks are (nearly) the same block again
    blocks.forEach(b => { b.keys = new Set(b.lines.map(nz).filter(k => k.length >= 4)); b.rep = b.keys.size ? [...b.keys].filter(k => lc.get(k) >= 2).length / b.keys.size : 0; });
    const jac = (a, b) => { let n = 0; a.keys.forEach(k => { if (b.keys.has(k)) n++; }); const u = a.keys.size + b.keys.size - n; return u ? n / u : 0; };
    const grp = []; blocks.forEach(b => { if (b.rep < 0.5) return; let g = grp.find(g => g.some(x => jac(x, b) >= 0.34)); if (!g) grp.push(g = []); g.push(b); });
    grp.sort((a, b) => b.length - a.length || b.reduce((n, x) => n + x.lines.length, 0) - a.reduce((n, x) => n + x.lines.length, 0));
    const chorus = new Set(grp[0] && grp[0].length >= 2 ? grp[0] : []), refrain = new Set(grp.slice(1).filter(g => g.length >= 2).flat());
    const audioLab = b => b.si >= 0 && sc ? String(sc[b.si][2]).replace(/\s+\d+$/, '') : '';
    let seenCh = 0;
    blocks.forEach((b, i) => {
      if (chorus.has(b)) { b.lab = 'Chorus'; seenCh++; return; }
      if (refrain.has(b)) { b.lab = 'Refrain'; return; }
      const laterCh = blocks.slice(i + 1).some(x => chorus.has(x)), al = audioLab(b);
      if (chorus.size && seenCh >= 2 && (laterCh || i >= blocks.length - 2) && !blocks.slice(i + 1).some(x => x.lab === 'Bridge') && !blocks.some(x => x.lab === 'Bridge')) b.lab = 'Bridge';
      else if (!chorus.size && /^(Chorus|Bridge|Drop)$/.test(al)) b.lab = al === 'Drop' ? 'Chorus' : al;
      else b.lab = 'Verse';
    });
    // a verse that runs straight into a chorus with no pause and is short is a pre-chorus
    blocks.forEach((b, i) => { const nx = blocks[i + 1]; if (b.lab === 'Verse' && nx && nx.lab === 'Chorus' && b.lines.length <= 3 && i > 0 && blocks[i - 1].lab === 'Verse' && timed && nx.t0 - b.t1 < 2) b.lab = 'Pre-chorus'; });
    // merge neighbours with the same label (a verse cut by a breath)
    const parts = [];
    blocks.forEach(b => { const p = parts[parts.length - 1]; if (p && p.lab === b.lab && b.lab === 'Verse' && p.lines.length + b.lines.length <= 14 && (!timed || b.t0 - p.t1 < 6)) { p.lines.push(...b.lines); p.t1 = b.t1; } else parts.push({ t0: b.t0, t1: b.t1, lab: b.lab, lines: b.lines.slice(), sung: true }); });
    // stretches with no singing, from the sound analysis
    if (sc && timed && blocks.length) sc.forEach(x => {
      const a = x[0], z = x[1]; if (z - a < 6) return;
      if (parts.some(p => p.sung && p.t0 < z - 2 && p.t1 > a + 2)) return;
      const lab = String(x[2]).replace(/\s+\d+$/, ''); parts.push({ t0: a, t1: z, lab: /^(Verse|Chorus|Bridge)$/.test(lab) ? 'Instrumental' : lab, lines: [], sung: false });
    });
    if (!blocks.length && sc) sc.forEach(x => parts.push({ t0: x[0], t1: x[1], lab: String(x[2]).replace(/\s+\d+$/, ''), lines: [], sung: false, audio: true }));
    if (timed) parts.sort((a, b) => a.t0 - b.t0);
    if (timed && parts.length && !parts[0].sung && parts[0].lab === 'Instrumental') parts[0].lab = 'Intro';
    if (timed && parts.length > 1 && !parts[parts.length - 1].sung && parts[parts.length - 1].lab === 'Instrumental') parts[parts.length - 1].lab = 'Outro';
    const tot = {}, n = {}; parts.forEach(p => { tot[p.lab] = (tot[p.lab] || 0) + 1; });
    parts.forEach(p => { if (/^(Verse|Instrumental|Breakdown|Interlude)$/.test(p.lab) && tot[p.lab] > 1) { n[p.lab] = (n[p.lab] || 0) + 1; p.name = p.lab + ' ' + n[p.lab]; } else p.name = p.lab; });
    if (!parts.length) return null;
    // what each part sounds like (from the sound sections it overlaps) and what changes from the part before
    if (sc && timed) {
      const ie = (c && c.ie) || [], nrg = e => e >= 66 ? 'loud' : e >= 33 ? 'medium' : 'quiet', vlev = v => v >= 50 ? 2 : v >= 20 ? 1 : 0;
      const and = a => a.length <= 1 ? a.join('') : a.slice(0, -1).join(', ') + ' and ' + a[a.length - 1];
      parts.forEach(p => {
        const t1 = Math.max(p.t1, p.t0 + 1); let w = 0, voc = 0, en = 0; const ins = {}, vg = {};
        sc.forEach(x => {
          const ov = Math.min(t1, x[1]) - Math.max(p.t0, x[0]); if (ov <= 0) return;
          w += ov; voc += x[3] * ov; en += x[4] * ov;
          String(x[5] || '').split('+').filter(n => n && n !== 'vocals').forEach(n => { ins[n] = (ins[n] || 0) + ov; });
          if (x[8]) { const g = String(x[8]).split(':')[0]; vg[g] = (vg[g] || 0) + ov; }
        });
        if (!w) return;
        const gv = Object.entries(vg).sort((a, b) => b[1] - a[1])[0];
        p.snd = { voc: voc / w, en: en / w, inst: Object.keys(ins).filter(n => ins[n] >= 0.5 * w), voice: gv && gv[1] >= 0.5 * w ? gv[0] : '' };
        p.inside = ie.filter(e => e[0] > p.t0 + 4 && e[0] < t1 - 2).slice(0, 3).map(e => { const many = String(e[1]).includes('+'); return String(e[1]).split('+').join(' and ') + (e[2] ? (many ? ' come in' : ' comes in') : (many ? ' drop out' : ' drops out')) + ' at ' + mmss(e[0]); });
      });
      let prev = null, prevSung = null, mainV = '';
      parts.forEach(p => {
        const d = p.snd; if (!d) return;
        const ch = [];
        if (!prev) ch.push(nrg(d.en) + ' start' + (d.inst.length ? ' with ' + and(d.inst) : ''));
        else {
          const q = prev.snd, de = d.en - q.en;
          if (de >= 35) ch.push('much louder'); else if (de >= 15) ch.push('louder'); else if (de <= -35) ch.push('much quieter'); else if (de <= -15) ch.push('quieter');
          const inn = d.inst.filter(n => !q.inst.includes(n)), out = q.inst.filter(n => !d.inst.includes(n));
          if (inn.length) ch.push(and(inn) + (inn.length > 1 ? ' come' : ' comes') + ' in');
          if (out.length) ch.push(and(out) + (out.length > 1 ? ' drop' : ' drops') + ' out');
          const a = vlev(q.voc), b = vlev(d.voc);
          if (a === 0 && b > 0) ch.push('singing starts'); else if (a > 0 && b === 0) ch.push('singing stops'); else if (b > a) ch.push('more singing'); else if (b < a) ch.push('less singing');
          if (!ch.length) ch.push('much the same sound');
        }
        if (d.voice && !mainV) mainV = d.voice;
        if (d.voice && prevSung && prevSung.snd.voice && d.voice !== prevSung.snd.voice) ch.push(d.voice === mainV ? 'back to the ' + d.voice + ' voice' : 'a ' + d.voice + ' voice takes over (maybe a second singer)');
        if (p.inside.length) ch.push('then ' + p.inside.join(', '));
        p.change = ch.join('; ');
        p.sound = [nrg(d.en), d.inst.length ? and(d.inst) : '', vlev(d.voc) === 2 ? 'full vocals' : vlev(d.voc) === 1 ? 'some vocals' : 'no vocals', d.voice ? d.voice + ' voice' : ''].filter(Boolean).join(', ');
        prev = p; if (vlev(d.voc) > 0) prevSung = p;
      });
      if (new Set(parts.filter(p => p.snd && p.snd.voice).map(p => p.snd.voice)).size > 1) parts.duet = true;
    }
    const form = parts.map(p => p.name).join(', ');
    return { parts, form, text: songMap.fmt(parts, timed), timed, lyrics: blocks.length > 0, chorus: chorus.size, duet: !!parts.duet };
  }
  songMap.fmt = (parts, timed) => {
    const nz = q => q.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim(); let firstCh = null;
    return parts.map(p => {
      const note = p.change ? ' \u2014 ' + p.change : '';
      if (!p.sung) return '[' + p.name + (timed ? ' ' + mmss(p.t0) + '-' + mmss(p.t1) : '') + (p.audio ? '' : ', no singing') + note + ']';
      const key = p.lines.map(nz).join('|'), same = p.lab === 'Chorus' && firstCh === key;
      if (p.lab === 'Chorus' && !firstCh) firstCh = key;
      return '[' + p.name + (timed ? ' ' + mmss(p.t0) : '') + note + ']\n' + (same ? '(same words as the first chorus)' : p.lines.join('\n'));
    }).join('\n\n');
  };
  // one line for the tag view / Song Talk: "Intro 0:00 · Verse 1 0:14 · Chorus 0:48 ..."
  const songMapLine = m => m ? m.parts.slice(0, 16).map(p => p.name + (m.timed ? ' ' + mmss(p.t0) : '')).join(' · ') : '';
  // one row per part with what changes: "1:54 Bridge: quieter; drums drop out; piano comes in"
  const songMapRows = m => m ? m.parts.slice(0, 16).map(p => '  ' + (m.timed ? mmss(p.t0) + ' ' : '') + p.name + (p.change ? ': ' + p.change : '')) : [];
  function soundProfile(c, kind) {                                     // plain-language description straight from the saved tags, no AI involved
    if (!c) return { line: '', hint: '' };
    const nm = q => String(q).replace(/\s*\([^)]*\)$/, '').replace(/ music$/i, '').toLowerCase();
    const INSTN = { acousticguitar: 'acoustic guitar', electricguitar: 'electric guitar', classicalguitar: 'classical guitar', acousticbassguitar: 'acoustic bass', electricpiano: 'electric piano', drummachine: 'drum machine', pipeorgan: 'pipe organ', doublebass: 'double bass' };
    if (c.mu != null && c.mu < 30) { const q = 'Mostly speech or non-musical sound (' + c.mu + '% music).'; return { line: q, hint: q }; }
    const bpm = c.bpm, tempo = !bpm ? '' : bpm < 70 ? 'slow' : bpm < 100 ? 'mid-tempo' : bpm < 128 ? 'upbeat' : 'fast';
    const genres = ((c.st && c.st.length ? c.st : c.gn) || []).slice(0, 2).map(v => nm(v[0]));
    const feel = Object.entries(c.hd || {}).filter(e => e[1] >= 50 && ['happy', 'sad', 'relaxed', 'aggressive', 'party', 'danceable'].includes(e[0])).sort((u, v) => v[1] - u[1]).slice(0, 3).map(e => e[0]);
    const moods = feel.length ? feel : (c.md || []).slice(0, 2).map(v => nm(v[0]));
    const inst = (c.in || []).filter(v => v[0] !== 'voice').slice(0, 3).map(v => INSTN[v[0]] || v[0]);
    const voc = c.v == null ? '' : c.v >= 50 ? 'with vocals' : 'mostly instrumental';
    let head = [tempo, genres.join(' / '), kind === 'video' ? 'video soundtrack' : 'track'].filter(Boolean).join(' '); head = head.charAt(0).toUpperCase() + head.slice(1);
    const tail = [bpm ? 'about ' + bpm + ' BPM' : '', c.key ? 'key of ' + c.key : '', voc].filter(Boolean);
    let line = head + (tail.length ? ', ' + tail.join(', ') : '') + '.';
    if (moods.length) line += ' Feels ' + andJoin(moods) + '.';
    if (inst.length) line += ' Instruments heard: ' + inst.join(', ') + '.';
    { const ss = structSentence(c); if (ss) line += ' ' + ss; }
    return { line, hint: line };
  }
  const sumOk = r => { const L = (r.match(/\p{L}/gu) || []).length, W = (r.match(/\p{L}{2,}/gu) || []).length; return r.length >= 20 && L / r.length >= 0.6 && W >= 4; };
  // Long videos are read in pieces (each piece summarized, then the pieces combined). At most 5 pieces, spread over the whole thing, so it stays quick.
  // Summary length choices: how much to ask for (words), how many tokens the reply may use (tok), for long videos how long each piece summary may be (part),
  // and the hard caps that are enforced afterwards: max words (max) and, for the bullet style, max bullets (nb).
  const SUM_LENS = {
    short:    { label: 'Short (2 to 3 sentences, max 70 words)', words: '2 or 3 sentences', adj: 'short', tok: 150, part: 80, max: 70, nb: 3 },
    medium:   { label: 'Medium (one paragraph, max 130 words)', words: 'one paragraph of 4 to 6 sentences', adj: 'medium-length', tok: 260, part: 110, max: 130, nb: 5 },
    detailed: { label: 'Two paragraphs (max 250 words, default)', words: 'exactly two paragraphs separated by a blank line. Paragraph one: what the song is about, the story or situation and who is speaking. Paragraph two: its message, themes and significance, and why it hits people the way it does', adj: 'two-paragraph', tok: 480, part: 160, paras: 2, max: 250, nb: 8 },
    long:     { label: 'Long (three paragraphs, max 360 words)', words: 'three paragraphs separated by blank lines: what it is about, its message and themes, then its significance and context', adj: 'detailed', tok: 680, part: 180, paras: 3, max: 360, nb: 10 }
  };
  const sumLenKey = () => { try { const k = localStorage.getItem('ppvSumLen'); return SUM_LENS[k] ? k : 'detailed'; } catch (e) { return 'detailed'; } };
  // ---------- Reply length + reply style menus ----------
  // Chat menus (ppvChatLen / ppvChatStyle) shape regular chat and Song Talk. Summary menus (ppvSumLen / ppvSumStyle) shape the AI summaries.
  // Each menu exists in the Assistant settings, and the summary ones also under Lyrics & subtitles: a change in one is copied to the others.
  const ppvLs = k => { try { return localStorage.getItem(k); } catch (e) { return null; } };
  // The user's favourite topics (assistant setting, or learned from "my favourite topics are ..."), so Bloop chats about them too.
  const favTopics = () => String(ppvLs('ppvTopics') || '').replace(/\s+/g, ' ').trim().slice(0, 200);
  const setFavTopics = v => { try { localStorage.setItem('ppvTopics', String(v || '').replace(/\s+/g, ' ').trim().slice(0, 200)); } catch (e) {} document.querySelectorAll('#ppv-topics').forEach(x => { x.value = favTopics(); }); };
  const CHAT_LENS = {
    short:  { label: 'Short (one sentence)', say: 'in one short plain sentence', bul: 'in two short bullet points', talk: 'in one short paragraph of two or three sentences', mul: 0.5 },
    normal: { label: 'Normal (one or two sentences, default)', say: 'in one or two short plain sentences', bul: 'in three short bullet points', talk: 'in one to three short paragraphs', mul: 1 },
    medium: { label: 'Medium (a short paragraph)', say: 'in one short paragraph of three to five sentences', bul: 'in four or five bullet points', talk: 'in two or three paragraphs', mul: 1.4 },
    long:   { label: 'Long (two paragraphs)', say: 'in two short paragraphs separated by a blank line', bul: 'in six to eight bullet points', talk: 'in three or four paragraphs with detail', mul: 1.9 }
  };
  const CHAT_STYLES = {
    bloop:   { label: 'Bloop (playful, default)', persona: true, intro: ' You are friendly, playful and a little silly.', fmt: 'No lists, no markdown, no emoji.', talk: '' },
    plain:   { label: 'Plain and factual', intro: ' You are calm, clear and to the point.', fmt: 'No jokes, no puns, no exclamation marks, no lists, no markdown, no emoji.', talk: 'Keep a calm, factual tone with no jokes.' },
    simple:  { label: 'Simple (easy words)', intro: ' You explain things simply, as if to a curious ten-year-old.', fmt: 'Use short, easy words and short sentences, no jargon, no lists, no markdown, no emoji.', talk: 'Use short, easy words and explain any technical term.' },
    deep:    { label: 'Thoughtful (gives the reason)', intro: ' You are thoughtful and like to explain why.', fmt: 'Give the answer first, then briefly say why. No lists, no markdown, no emoji.', talk: 'After each answer, briefly say why.' },
    bullets: { label: 'Bullet points', bul: true, intro: ' You are organized and to the point.', fmt: 'Write the reply as a list with one point per line, each line starting with "- ". No other markdown, no emoji.', talk: 'Write the answer as short bullet points, each line starting with "- ".' }
  };
  const SUM_STYLES = {
    plain:    { label: 'Plain (default)', say: 'Plain English, no lists, no headings.' },
    simple:   { label: 'Simple (easy words)', say: 'Use short, easy words and short sentences, as if explaining to a curious ten-year-old. No lists, no headings.' },
    casual:   { label: 'Casual (like telling a friend)', say: 'Write in a relaxed, conversational voice, like telling a friend about it. No lists, no headings.' },
    analytic: { label: 'Analytical (themes and imagery)', say: 'Write like a thoughtful critic: name the themes, the imagery and symbols, and how the wording supports the message. No lists, no headings.' },
    bullets:  { label: 'Bullet points', say: 'Write only bullet points, one per line, each starting with "- " and holding one short sentence. No headings and no other formatting.',
                bul: { short: 'three bullet points', medium: 'five bullet points', detailed: 'six to eight bullet points', long: 'eight to ten bullet points' } }
  };
  const chatLenKey = () => { const k = ppvLs('ppvChatLen'); return CHAT_LENS[k] ? k : 'normal'; };
  const chatStyleKey = () => { const k = ppvLs('ppvChatStyle'); return CHAT_STYLES[k] ? k : 'bloop'; };
  const sumStyleKey = () => { const k = ppvLs('ppvSumStyle'); return SUM_STYLES[k] ? k : 'plain'; };
  // Enforces a length choice: cut back to the whole sentences (or whole bullets) that fit the word cap w and bullet cap nb.
  const sumCap = (r, w, nb) => {
    r = String(r || '').trim(); if (!w) return r;
    const wc = x => (x.replace(/^\s*[-•*]\s+/gm, '').match(/\S+/g) || []).length, isB = l => /^\s*[-•*]\s/.test(l);
    const lines = r.split('\n');
    if (lines.filter(isB).length >= 2) {                                 // bullets: keep whole bullets that fit both caps
      const out = []; let n = 0, b = 0;
      for (const l of lines) { if (!l.trim()) continue; const k = wc(l); if (out.length && (n + k > w || (nb && b >= nb))) break; out.push(l); n += k; b += isB(l) ? 1 : 0; }
      return out.join('\n').trim();
    }
    if (wc(r) <= w) return r;
    const re = /[^.!?…]+[.!?…]+["'”’)]*\s*/g; let m, out = '', n = 0;   // prose: keep whole sentences that fit, paragraph breaks included
    while ((m = re.exec(r))) { const k = wc(m[0]); if (n + k > w) break; out += m[0]; n += k; }
    out = out.trim();
    if (wc(out) >= Math.min(8, w)) return out;
    return r.split(/\s+/).slice(0, w).join(' ').replace(/[\s,;:\-]+$/, '') + '…'; // one very long sentence: cut by words
  };
  const menuOpts = o => Object.keys(o).map(k => '<option value="' + k + '">' + o[k].label + '</option>').join('');
  document.addEventListener('change', e => {                          // keep copies of the same menu in step, and save the choice
    const sel = e.target; if (!sel || !sel.dataset || !sel.dataset.sync) return;
    try { localStorage.setItem(sel.dataset.sync, sel.value); } catch (x) {}
    document.querySelectorAll('select[data-sync="' + sel.dataset.sync + '"]').forEach(o => { if (o !== sel) o.value = sel.value; });
  });
  // A summary that hit the token cap ends mid-sentence: cut back to the last full sentence.
  const sumTrim = r => {
    r = String(r).trim(); if (!r || /[.!?…)"'”’]$/.test(r)) return r;
    let end = -1, m; const re = /[.!?…](?=["'”’)]*(?:\s|$))/g; while ((m = re.exec(r))) end = m.index + 1;
    return end >= 20 && end >= r.length * 0.4 ? r.slice(0, end) : r.replace(/[\s,;:\-]+$/, '') + '…';
  };
  // Small models often ignore "two paragraphs": split at the sentence boundaries nearest the even cut points.
  const sumParas = (r, n) => {
    r = String(r).replace(/^\s*(?:paragraph \d[:.]?|\*\*[^*]+\*\*)\s*/gim, '').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
    if (!n || n < 2 || r.split(/\n\s*\n/).length >= n) return r;
    const flat = r.replace(/\s*\n\s*/g, ' '), ends = []; let m; const re = /[.!?…]["'”’)]*\s+(?=[A-Z“"'])/g;
    while ((m = re.exec(flat))) ends.push(m.index + m[0].length);
    if (ends.length < n - 1) return r;
    const cuts = []; for (let k = 1; k < n; k++) { const want = flat.length * k / n; cuts.push(ends.reduce((a, e) => Math.abs(e - want) < Math.abs(a - want) ? e : a, ends[0])); }
    const uniq = [...new Set(cuts)].sort((x, y) => x - y), out = []; let st = 0;
    uniq.forEach(c => { out.push(flat.slice(st, c).trim()); st = c; }); out.push(flat.slice(st).trim());
    return out.filter(Boolean).join('\n\n');
  };
  // Writes what a song (or video) MEANS: story, message, themes, significance. The sound is deliberately left out: the tags
  // line under it covers that, and feeding tempo/instruments to a small model made it describe the sound instead.
  // With no lyrics it may still answer from what it reliably knows about a well-known song; if it doesn't know it, it says UNKNOWN.
  async function aiSummary(t, c, tr, ask, say, lenKey, ctx) {
    const kind = t.kind === 'video' ? 'video' : 'song', LN = SUM_LENS[lenKey] || SUM_LENS.detailed, ST = SUM_STYLES[sumStyleKey()] || SUM_STYLES.plain;
    const wd = (ST.bul ? ST.bul[SUM_LENS[lenKey] ? lenKey : 'detailed'] : LN.words) +          // how much to write: the length menu, worded for the chosen style
      '. Never go over ' + LN.max + ' words in total; stop as soon as the point is made';   // the cap is also enforced after writing (sumCap)
    const who = t.artist && !/^(unknown artist|video|stream)$/i.test(t.artist) ? t.artist : '';
    const sys = kind === 'song'
      ? 'You explain songs for a music app. Write about what the song MEANS: the story or situation, who is speaking and to whom, the feelings, the message and themes, and why it matters to people. ' +
        'Do NOT describe how it sounds: no tempo, genre, instruments, production or vocal style. ' +
        'Base it on the lyrics you are given. You may add what you reliably know about this specific song and artist (what it is widely understood to be about, the story behind it), but never invent facts; when unsure, stay with the lyrics. ' +
        'Describe the lyrics in your own words instead of quoting them. ' +
        'When the lyrics are marked by section ([Verse 1], [Chorus], [Bridge] ...), use that: the chorus usually carries the main message, the verses build the story, and a bridge often brings a turn, a doubt or a new angle. Explain how the meaning develops through the song, but do not list the sections or give timestamps. ' +
        'A FEEL line may give the mood and themes the audio analysis heard, and a note after a section name may say how the music changes there (louder, quieter, instruments in or out, another voice). Use these only as hints for the meaning, for example a stripped-back bridge as a vulnerable moment or a second voice as the other person answering, and never describe the sound itself. ' + ST.say + ' Write ' + wd + '.'
      : 'You summarize videos for a media app. Write about what the video is about: its subject, main points or story, and why it matters. Do not describe the audio. ' +
        'Use only the transcript you are given; never invent names or events. ' + ST.say + ' Write ' + wd + '.';
    const opt = { max_new_tokens: LN.tok, do_sample: true, temperature: 0.4, top_p: 0.9, repetition_penalty: 1.08 };
    let feel = '';
    if (kind === 'song' && c) {                                        // hints from the audio tags that help with MEANING (themes, voice), not with the sound
      const th = ((c.hm || {}).theme || []).map(x => String(x[0]).replace(/_/g, ' ')), gv = ((c.hm || {}).gender || [])[0];
      const md = (c.md || []).map(x => String(x[0])).filter(x => !th.includes(x));
      const bits = th.concat(md).slice(0, 6);
      feel = (bits.length ? 'mood and themes: ' + bits.join(', ') : '') + (gv && gv[1] >= 65 && (c.v == null || c.v >= 50) ? (bits.length ? '; ' : '') + 'the lead singer sounds ' + gv[0] : '');
    }
    let head = 'Title: ' + t.title + (who ? '\nArtist: ' + who : '') + '\nType: ' + kind + (feel ? '\nFEEL (audio analysis, a hint only): ' + feel : '');
    const map = kind === 'song' && t.dbId != null ? (() => { try { return songMap(t.dbId, c); } catch (e) { console.warn('song map', e); return null; } })() : null;
    if (map && map.duet) head += (feel ? '' : '\nFEEL (audio analysis, a hint only): ') + (feel ? '; ' : '') + 'the voice changes between parts, so there may be two singers';
    let user;
    if (tr.words < 12) {
      if (kind !== 'song' || !who) return '';
      user = head + '\nNo lyrics are saved for this song.\n\nIf you genuinely know this exact song, explain what it is about and what it means in ' + wd + '. If you do not know it, reply with only the word UNKNOWN.';
    } else if (tr.words <= 600) {
      // Fit the lyrics to the model's context instead of shrinking the answer: keep the reply budget, drop lyric lines from the end.
      const room = ctx ? Math.floor(ctx * 0.92) - opt.max_new_tokens - Math.ceil((sys.length + head.length + 160) / 3) : Infinity;
      if (map && map.lyrics && map.chorus) {                           // lyrics laid out by section (verse / chorus / bridge), so the model sees how the song is built
        let ps = map.parts.slice(), txt = map.text, cut = false;
        while (ps.length > 3 && Math.ceil(txt.length / 3) > room) { ps.pop(); cut = true; txt = songMap.fmt(ps, map.timed); }
        user = head + '\nSong form: ' + map.form + '\nLyrics by section (automatic, may contain mistakes' + (cut ? ', shortened' : '') + '):\n' + txt + '\n\nExplain what this ' + kind + ' is about and what it means.';
      } else {
        let lines = tr.lines.slice();
        while (lines.length > 6 && Math.ceil(lines.join('\n').length / 3) > room) lines.pop();
        user = head + (map && map.form ? '\nSong form: ' + map.form : '') + '\nLyrics (automatic transcript, may contain mistakes' + (lines.length < tr.lines.length ? ', shortened' : '') + '):\n' + lines.join('\n') + '\n\nExplain what this ' + kind + ' is about and what it means.';
      }
    } else {
      let chunks = [], cur = [], n = 0;
      for (const q of tr.lines) { cur.push(q); n += q.split(/\s+/).length; if (n >= 320) { chunks.push(cur.join('\n')); cur = []; n = 0; } }
      if (cur.length) chunks.push(cur.join('\n'));
      const sampled = chunks.length > 5; if (sampled) chunks = [0, 1, 2, 3, 4].map(i => chunks[Math.round(i * (chunks.length - 1) / 4)]);
      const parts = [];
      for (let i = 0; i < chunks.length; i++) {
        say('Reading part ' + (i + 1) + ' of ' + chunks.length + '…');
        const r = await ask([{ role: 'system', content: sys }, { role: 'user', content: 'Part ' + (i + 1) + ' of ' + chunks.length + ' of a ' + kind + ' transcript (automatic, may contain mistakes):\n' + chunks[i] + '\n\nIn one or two sentences, what happens or is said in this part?' }], Object.assign({}, opt, { max_new_tokens: LN.part }), say);
        if (sumOk(r)) parts.push(r.replace(/\s+/g, ' '));
      }
      if (!parts.length) return '';
      say('Putting it together…');
      user = head + '\nWhat each ' + (sampled ? 'sampled ' : '') + 'part says, in order:\n- ' + parts.join('\n- ') + '\n\nExplain what the whole ' + kind + ' is about and what it means.';
    }
    say('Writing the summary…');
    const out = String(await ask([{ role: 'system', content: sys }, { role: 'user', content: user }], opt, say) || '').trim();
    if (/^\W*unknown\W*$/i.test(out) || /^(?:i(?:'m| am) not (?:familiar|sure)|i don'?t know)/i.test(out)) return '';
    return sumOk(out) ? sumCap(fixNums(sumParas(sumTrim(out), ST.bul ? 0 : LN.paras || 0), c && c.bpm ? [c.bpm] : []), LN.max, ST.bul ? LN.nb : 0) : '';
  }
  function smartUI(p, h) {
    const css = document.createElement('style');
    css.textContent = '#ppv-panel details,.ppv-scope details{margin-top:10px;border-top:1px solid #333;padding-top:8px}#ppv-panel summary,.ppv-scope summary{cursor:pointer;font-weight:600;padding:2px 0}#ppv-panel input[type=text],.ppv-scope input[type=text]{width:100%;box-sizing:border-box;margin-top:6px;padding:7px;border-radius:8px;background:#2a2b31;color:#eee;border:1px solid #444}#ppv-panel .ppv-note,.ppv-scope .ppv-note{opacity:.6;font-size:11px;margin-top:4px}#ppv-panel .ppv-out,.ppv-scope .ppv-out{margin-top:6px;font-size:12px;white-space:pre-wrap}#ppv-panel .ppv-row,.ppv-scope .ppv-row{display:flex;gap:6px}#ppv-panel .ppv-row button,.ppv-scope .ppv-row button{margin-top:8px}#ppv-panel .ppv-grid label,.ppv-scope .ppv-grid label{display:block;margin:4px 0}.ppv-scope{color:var(--text,#eee);font:13px system-ui,sans-serif;margin:8px 0;padding:0 2px}.ppv-scope button{width:100%;margin-top:8px;padding:9px;border-radius:8px;border:0;background:var(--accent,#7c3aed);color:#fff;font:600 13px system-ui}.ppv-scope button:disabled{opacity:.5}.ppv-scope button.ppv-sec{background:transparent;border:1px solid var(--line,#555);color:inherit;font-weight:500;font-size:12px;padding:6px}.ppv-scope select{width:100%;margin-top:6px;padding:7px;border-radius:8px;background:var(--bg,#2a2b31);color:inherit;border:1px solid var(--line,#444)}.ppv-scope label.ppv-c{display:inline-block;margin:6px 10px 0 0}.ppv-scope details{border-top-color:var(--line,#333)}#ppv-edrows .er{display:flex;gap:4px;align-items:center;margin-top:5px}#ppv-edrows .er input{margin:0!important;padding:6px!important}#ppv-edrows .et{width:74px!important;flex:none;text-align:center}#ppv-edrows .er button{width:auto;margin:0;padding:5px 8px;flex:none}#ppv-edrows .er.on input{border-color:var(--accent,#7c3aed)}.ppv-pbar{height:6px;background:var(--line,#333);border-radius:3px;margin-top:8px}.ppv-pbar i{display:block;height:100%;width:0;background:var(--accent,#7c3aed);border-radius:3px}';
    document.head.appendChild(css);
    const d1 = document.createElement('details'), d2 = document.createElement('details');
    d1.innerHTML = '<summary>Library tools (tags)</summary>' +
      '<div id="ppv-count" class="ppv-note"></div>' +
      '<label class="ppv-c"><input type="checkbox" id="ppv-deep"> Scan the whole track (slower, finds first vocals)</label>' +
      '<label class="ppv-c"><input type="checkbox" id="ppv-moods"> Mood &amp; theme models (13 tiny files, ~6 MB, downloaded once)</label>' +
      '<label class="ppv-c"><input type="checkbox" id="ppv-aeq"> Auto-EQ from genre when tagging</label>' +
      '<label class="ppv-c"><input type="checkbox" id="ppv-askip"> Skip long intros (needs whole-track tags)</label>' +
'<details id="ppv-bgd"><summary>Background tagging &amp; surprise playlists</summary>' +
      '<div class="ppv-note">Runs only while this page is open and idle.</div>' +
      '<label class="ppv-c" style="display:block"><input type="checkbox" id="ppv-bg"> Tag untagged tracks while idle</label>' +
      '<select id="ppv-bgidle"><option value="1">Away = 1 minute idle</option><option value="5">Away = 5 minutes idle</option><option value="15">Away = 15 minutes idle</option></select>' +
      '<label class="ppv-c" style="display:block"><input type="checkbox" id="ppv-bgplay"> Also while music is playing</label>' +
      '<label class="ppv-c" id="ppv-bgchl" style="display:block"><input type="checkbox" id="ppv-bgchg"> Only while charging</label>' +
      '<label class="ppv-c" style="display:block"><input type="checkbox" id="ppv-live"> Keep smart playlists up to date as tracks get tagged</label>' +
      '<label class="ppv-c" style="display:block"><input type="checkbox" id="ppv-lmix"> Auto mixes: For You, Ones You May Like, Your Pattern (they change with listening)</label>' +
      '<button id="ppv-lmixblk" class="ppv-sec">Block current track from auto mixes</button><div id="ppv-lmixlist" class="ppv-note"></div>' +
      '<label class="ppv-c" style="display:block"><input type="checkbox" id="ppv-surp"> Assemble surprise playlists</label>' +
      '<select id="ppv-surpev"><option value="6">New surprise every 6 hours</option><option value="24">New surprise every day</option><option value="72">New surprise every 3 days</option><option value="168">New surprise every week</option></select>' +
      '<select id="ppv-surpmax"><option value="3">Keep the newest 3</option><option value="5">Keep the newest 5</option><option value="10">Keep the newest 10</option></select>' +
      '<label class="ppv-c" style="display:block"><input type="checkbox" id="ppv-surptab"> Show surprise playlists in the Playlists tab</label>' +
      '<div class="ppv-note">Off = library playlist selector only. Tap Keep on the reveal to stop one from being replaced.</div>' +
      '<button id="ppv-surpnow" class="ppv-sec">Surprise me now</button><div id="ppv-bgst" class="ppv-note"></div></details>' +
      '<div style="margin-top:10px"><b>Smart playlists</b></div><div id="ppv-smart" class="ppv-grid"></div>' +
      '<button id="ppv-mk">Create / update ticked playlists</button>' +
      '<input type="text" id="ppv-q" placeholder="Playlist from search, e.g. piano slow"><button id="ppv-mkq" class="ppv-sec">Make playlist from this search</button>' +
      '<div style="margin-top:10px"><b>More like this</b></div><select id="ppv-sim"><option value="sound">Similar sound</option><option value="tempo">Similar sound, same tempo</option><option value="mix">Mix-friendly (tempo + compatible key)</option></select>' +
      '<button id="ppv-simgo">Play more like the current track</button><button id="ppv-skipgo" class="ppv-sec">Jump to first vocals</button>' +
      '<button id="ppv-eqall" class="ppv-sec">Apply auto-EQ to all tagged tracks</button><button id="ppv-heads" class="ppv-sec">Refresh mood models</button>' +
      '<div id="ppv-lib" class="ppv-out"></div>';
    d2.innerHTML = '<summary>Lyrics &amp; subtitles (Whisper)</summary>' +
      '<select id="ppv-wsize">' + Object.entries(WH).filter(e => whOk(e[0])).map(([k, v]) => '<option value="' + k + '">' + v[1] + '</option>').join('') + '</select>' +
      '<select id="ppv-wlang">' + LANGS.map(l => '<option value="' + l[0] + '">' + l[1] + '</option>').join('') + '</select>' +
      '<select id="ppv-wtask"><option value="transcribe">Write what is said</option><option value="translate">Translate to English</option></select>' +
      '<select id="ppv-wacc"><option value="0">Accuracy: Standard (1 pass, fastest)</option><option value="1">Accuracy: Careful (2 passes + beam search, ~2x slower)</option><option value="2">Accuracy: Max (3 passes, ~3x slower)</option></select>' +
      '<div class="ppv-note">Careful and Max pass over the song more than once and compare repeated lines such as choruses. Other wordings are kept for choosing in the editor.</div>' +
      '<label class="ppv-c"><input type="checkbox" id="ppv-wclean"> Remove the music first (uses Spleeter, or previously split vocals; on by default for songs)</label>' +
      '<label class="ppv-c" id="ppv-wgpu-l"><input type="checkbox" id="ppv-wgpu"> Use the GPU (experimental, much faster on supported devices)</label>' +
      '<div class="ppv-note">Songs get synced lyrics (Lyrics tab), videos get subtitles. Both can be exported as .srt or .lrc from the editor below. The music-removal step always uses Spleeter. If the song was already split, its saved vocals are reused and nothing is split again.</div>' +
      '<button id="ppv-wgo">Transcribe current track</button><button id="ppv-wsrt" class="ppv-sec" style="display:none">Download .srt</button><button id="ppv-wfree" class="ppv-sec">Free up Whisper download</button>' +
      '<div id="ppv-wout" class="ppv-out"></div>' +
      '<label class="ppv-c" style="display:block;margin-top:10px">Summary length: <select id="ppv-sumlen" data-sync="ppvSumLen" style="width:100%;display:block">' + Object.keys(SUM_LENS).map(k => '<option value="' + k + '">' + SUM_LENS[k].label + '</option>').join('') + '</select></label>' +
      '<label class="ppv-c" style="display:block;margin-top:10px">Summary style: <select id="ppv-sumstyle" data-sync="ppvSumStyle" style="width:100%;display:block">' + menuOpts(SUM_STYLES) + '</select></label>' +
      '<button id="ppv-sumgo" class="ppv-sec" style="margin-top:10px">Summarize current track (AI)</button>' +
      '<div class="ppv-note">Combines the track\u2019s tags (tempo, key, genre, mood, instruments) with its lyrics or subtitles, so it knows both how it sounds and what it is about. Tags are made first if missing. The written part uses the Bloop AI brain (one-time download). Without lyrics or subtitles you get the sound summary only.</div>' +
      '<div id="ppv-sumout" class="ppv-out"></div>' +
      '<button id="ppv-sumtalk" class="ppv-sec" style="display:none;margin-top:8px">\ud83d\udcac Talk about this song in chat</button>' +
      '<details id="ppv-sumlist"><summary id="ppv-sumlist-h">Saved summaries</summary><div id="ppv-sumlist-b"></div></details>' +
      '<button id="ppv-lyfix" class="ppv-sec" style="margin-top:8px">\u270e Fix this song\u2019s lyrics with AI (in chat)</button>' +
      '<button id="ppv-edopen" class="ppv-sec" style="margin-top:12px;padding:10px;font-size:13px">✎ Open full-screen editor (lyrics &amp; timestamps)</button>';
    // AI tools no longer live in the one panel: tagging + smart playlists go to the Library tab, Whisper goes to captions (video) or Lyrics (songs)
    d1.querySelector('summary').textContent = 'AI tagging & smart playlists';
    d1.insertAdjacentHTML('afterbegin', '<div class="ppv-stx ppv-note">Ready</div><div class="ppv-pbar ppv-bar-tag"><i></i></div><select id="ppv-scope"><option value="cur">Tag: current track</option><option value="pick">Tag: a chosen track</option><option value="all">Tag: all tracks</option></select><select id="ppv-pick" style="display:none"></select><label class="ppv-c" id="ppv-redo-l" style="display:none"><input type="checkbox" id="ppv-redo"> Also redo tracks that already have tags</label><div class="ppv-row"><button id="ppv-tag">Tag current track</button><button id="ppv-stop" class="ppv-sec" style="display:none;width:auto;padding:6px 14px" data-keep="1">Stop</button></div><div id="ppv-tags" class="ppv-out"></div><details id="ppv-saved" open><summary>Tagged tracks <span id="ppv-scount" style="opacity:.6;font-weight:400"></span></summary><input type="text" id="ppv-ss" placeholder="Filter by title, artist or tag (e.g. piano, 120 bpm)"><select id="ppv-sf"><option value="all">Everything tagged</option><option value="audio">Songs</option><option value="video">Videos</option></select><div id="ppv-slist" class="ppv-note"></div></details>');
    d2.insertAdjacentHTML('afterbegin', '<div class="ppv-stx ppv-note">Ready</div><div class="ppv-pbar ppv-bar-wh"><i></i></div>');
    d2.style.borderTop = '0'; d2.style.marginTop = '4px';
    const libHost = document.createElement('div'); libHost.className = 'ppv-scope'; libHost.id = 'ppv-libhost'; libHost.appendChild(d1);
    const whHost = document.createElement('div'); whHost.className = 'ppv-scope'; whHost.id = 'ppv-whhost'; whHost.appendChild(d2);
    d1.open = false; d2.open = true;
    const pane = document.getElementById('sidebar-pane-playlist'), srow = document.getElementById('search-row');
    if (pane && srow) srow.after(libHost); else if (pane) pane.prepend(libHost); else p.appendChild(libHost);   // fallback: old panel
    const savedEl = d1.querySelector('#ppv-saved');
    const savedHost = document.createElement('div'); savedHost.className = 'ppv-scope'; savedHost.id = 'ppv-savedhost';
    savedHost.style.cssText = 'padding:0 20px 10px';
    savedHost.appendChild(savedEl); savedEl.style.marginTop = '0';
    libHost.after(savedHost);
    const capDrop = document.getElementById('subtitle-dropdown'), lyPane = document.querySelector('#extras-panel .pp-pane[data-pp="ly"]');
    // the Whisper block sits in whichever place fits the current track: captions menu for video, Lyrics tab for songs
    let audPanel = null;
    const placeWhisper = where => {
      if (where === 'cap' && capDrop) { if (whHost.parentNode !== capDrop) { capDrop.appendChild(document.createElement('hr')); capDrop.appendChild(whHost); } }
      else if (where === 'aud' && audPanel) { if (whHost.parentNode !== audPanel) audPanel.appendChild(whHost); }
      else if (where === 'ly' && lyPane) { if (whHost.parentNode !== lyPane) lyPane.appendChild(whHost); }
    };
    const curKind = () => { const a = window.__ppApi, t = a && a.tracks()[a.currentIndex()]; return t ? t.kind : null; };
    placeWhisper('cap');
    if (!capDrop && !lyPane) p.appendChild(whHost);
    const sb = document.getElementById('subtitle-btn'), eb = document.getElementById('extras-btn');
    if (sb) sb.addEventListener('click', () => placeWhisper('cap'), true);
    if (eb) eb.addEventListener('click', () => { if (curKind() !== 'video') placeWhisper('ly'); }, true);
    const $ = s => document.querySelector(s), A = () => window.__ppApi, cur = () => { const a = A(); return a && a.tracks()[a.currentIndex()]; };
    const ls = (k, v) => { try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch (e) {} };
    let isBusy = false;
    const busy = on => { isBusy = on; document.querySelectorAll('#ppv-panel button, .ppv-scope button').forEach(b => { if (!b.dataset.keep && !b.classList.contains('ppv-x')) b.disabled = on; }); };
    const deep = $('#ppv-deep'), aeq = $('#ppv-aeq'), ask = $('#ppv-askip'), lib = $('#ppv-lib'), cnt = $('#ppv-count');
    const mo = $('#ppv-moods'); mo.checked = moodsOn(); mo.onchange = () => ls('ppvMoods', mo.checked ? '1' : '0');
    deep.checked = ls('ppvDeep') === '1'; aeq.checked = ls('ppvAutoEq') === '1'; ask.checked = ls('ppvAutoSkip') === '1';
    deep.onchange = () => ls('ppvDeep', deep.checked ? '1' : '0'); aeq.onchange = () => ls('ppvAutoEq', aeq.checked ? '1' : '0'); ask.onchange = () => ls('ppvAutoSkip', ask.checked ? '1' : '0');
    const lst = a => (a || []).map(v => v[0] + ' ' + v[1] + '%').join(', ');
    const fmtStored = c => {                                           // saved (compact) tags -> readable lines
      const L = [];
      if (c.bpm || c.key) L.push([c.bpm ? 'Tempo: ' + c.bpm + ' BPM' : '', c.key ? 'Key: ' + c.key + (c.ck ? ' (' + c.ck + ')' : '') : ''].filter(Boolean).join(' · '));
      structLines(c).forEach(x => L.push(x));
      if (c.sh && c.sh.length) L.push('Shifts' + (c.shs ? ' (' + mmss(c.shs[0]) + '-' + mmss(c.shs[1]) + ')' : '') + ': ' + c.sh.map(x => mmss(x[0]) + ' ' + x[1]).join(' | '));
      if (c.v != null) L.push((c.v >= 50 ? 'Vocals: yes (' + c.v + '%)' : 'Instrumental (' + (100 - c.v) + '%)') + (c.fv != null ? ' · first vocals at ' + mmss(c.fv) : ''));
      if (c.gp && c.gp.length) L.push('Genre: ' + lst(c.gp));
      if (c.st && c.st.length) L.push('Style: ' + lst(c.st));
      if (c.gn && c.gn.length) L.push('Also sounds like: ' + lst(c.gn));
      if (c.md && c.md.length) L.push('Mood: ' + lst(c.md));
      const feels = Object.entries(c.hd || {}).filter(e => e[1] >= 50).sort((u, v) => v[1] - u[1]).map(e => [e[0].replace(/^mood_/, '').replace(/_/g, ' '), e[1]]);
      if (feels.length) L.push('Feels: ' + lst(feels.slice(0, 6))); else { const w = Object.entries(c.hd || {}).sort((u, v) => v[1] - u[1]).slice(0, 3).map(e => [e[0].replace(/^mood_/, '').replace(/_/g, ' '), e[1]]); if (w.length) L.push('Feels (leaning): ' + lst(w)); }
      if (c.in && c.in.length) L.push('Instruments: ' + lst(c.in));
      Object.entries(c.hm || {}).forEach(([id, a]) => { if (a && a.length) L.push(id.replace(/_/g, ' ') + ': ' + lst(a)); });
      if (c.d) L.push('Length: ' + mmss(c.d) + (c.w ? ' (whole track scanned)' : ''));
      if (c.ts) L.push('Tagged ' + new Date(c.ts).toLocaleDateString());
      return L.join('\n') || 'No details saved.';
    };
    let savedLimit = 100;
    const renderSaved = () => {
      const a = A(), box = $('#ppv-slist'), f = $('#ppv-sf').value; if (!a || !box) return;
      const q = ($('#ppv-ss').value || '').trim().toLowerCase(), words = q ? q.split(/\s+/) : [];
      const tg = loadTags(), vidOk = ls('ppvShowVid') !== '0', all = a.tracks().filter(t => tg[t.dbId] && (vidOk || t.kind !== 'video') && (f === 'all' || (f === 'video') === (t.kind === 'video')));
      const rows = words.length ? all.filter(t => { const hay = (t.title + ' ' + t.artist + ' ' + tagWords(tg[t.dbId])).toLowerCase(); return words.every(w => hay.includes(w)); }) : all;
      $('#ppv-scount').textContent = '(' + (words.length ? rows.length + ' of ' + all.length : all.length) + ')';
      box.textContent = '';
      if (!rows.length) { box.textContent = words.length ? 'No tagged tracks match that.' : (f === 'video' ? 'No tagged videos yet. Pick a video with the Tag button above.' : 'Nothing tagged yet. Use the tag buttons above.'); return; }
      rows.slice(0, savedLimit).forEach(t => {
        const c = tg[t.dbId], row = document.createElement('div'), head = document.createElement('div'), body = document.createElement('div');
        row.style.cssText = 'border-top:1px solid var(--line,#333);padding:6px 0;cursor:pointer';
        head.innerHTML = '<b></b><div style="opacity:.7;font-size:11px"></div>';
        head.firstChild.textContent = (t.kind === 'video' ? '🎬 ' : '🎵 ') + (t.artist && !/^(Unknown artist|Video|Stream)$/.test(t.artist) ? t.artist + ' – ' : '') + t.title;
        head.lastChild.textContent = [c.bpm ? c.bpm + ' BPM' : '', c.key || '', c.gp && c.gp[0] ? c.gp[0][0] : '', c.st && c.st[0] ? c.st[0][0].replace(/ \(.*\)$/, '') : '', c.md && c.md[0] ? c.md[0][0] : '', c.v != null ? (c.v >= 50 ? 'vocals' : 'instrumental') : ''].filter(Boolean).join(' · ') || 'tagged';
        body.style.cssText = 'display:none;white-space:pre-wrap;font-size:12px;margin-top:6px'; body.textContent = fmtStored(c) + (() => { if (t.kind === 'video') return ''; try { const m = songMap(t.dbId, c); return m && m.lyrics ? '\nSong map (lyrics + sound):\n' + songMapRows(m).join('\n') : ''; } catch (e) { return ''; } })();
        const play = document.createElement('button'); play.className = 'ppv-sec'; play.textContent = 'Play this track'; play.style.display = 'none';
        play.onclick = ev => { ev.stopPropagation(); const i = a.tracks().indexOf(t); if (i >= 0) a.play(i, a.tracks().map((_, k) => k)); };
        row.onclick = () => { const open = body.style.display === 'none'; body.style.display = open ? 'block' : 'none'; play.style.display = open ? 'block' : 'none'; };
        row.append(head, body, play); box.appendChild(row);
      });
      if (rows.length > savedLimit) { const m = document.createElement('button'); m.className = 'ppv-sec'; m.textContent = 'Show more (' + (rows.length - savedLimit) + ' left)'; m.onclick = () => { savedLimit += 100; renderSaved(); }; box.appendChild(m); }
    };
    const refreshCount = () => { const a = A(); if (!a) return; try { syncSmartLive(); } catch (e) {} const tg = loadTags(), n = a.tracks().filter(t => tg[t.dbId]).length; cnt.textContent = n + ' of ' + a.tracks().length + ' tracks tagged'; renderSmart(); try { renderSaved(); } catch (e) {} };
    function renderSmart() {
      const a = A(), tg = loadTags(), box = $('#ppv-smart'); if (!a) return;
      const ticked = new Set([...box.querySelectorAll('input:checked')].map(i => i.value));
      const rows = a.tracks().map(t => tg[t.dbId]).filter(Boolean).map(c => [c, vibes(c)]);
      box.innerHTML = SMART.map(s => '<label><input type="checkbox" value="' + s.id + '"' + (ticked.has(s.id) ? ' checked' : '') + '> ' + s.name + ' <span style="opacity:.6">(' + rows.filter(r => s.test(r[0], r[1])).length + ')</span></label>').join('');
    }
    d1.addEventListener('toggle', () => { if (d1.open) refreshCount(); });
    try { if (localStorage.getItem('ppvSavedOpen') === '0') savedEl.open = false; } catch (e) {}   // remember open/closed across launches
    savedEl.addEventListener('toggle', () => { try { localStorage.setItem('ppvSavedOpen', savedEl.open ? '1' : '0'); } catch (e) {} if (savedEl.open) renderSaved(); }); $('#ppv-sf').onchange = () => { savedLimit = 100; renderSaved(); }; $('#ppv-ss').oninput = () => { savedLimit = 100; renderSaved(); };
    $('#ppv-heads').onclick = async () => { await resetHeads(); h.status('Mood models will be downloaded again on the next tagging run.'); };

    // single track tagging (replaces the old button behaviour so results are kept)
    h.tagBtn = $('#ppv-tag'); h.tagOut = $('#ppv-tags');
    const tagOne = async t0 => {
      busy(true); h.tagOut.textContent = '';
      let last = Date.now(), lastTxt = '', stalled = false;               // if nothing reports progress for 90 s, unlock the buttons and say where it stopped
      const stat = t => { last = Date.now(); lastTxt = t; if (!stalled) h.status(t); };
      const iv = setInterval(() => { if (!stalled && Date.now() - last > 90000) { stalled = true; busy(false); h.status('Stalled at "' + lastTxt + '". Buttons unlocked. Try again, or untick Mood models.'); } }, 3000);
      try {
        const t = t0 || cur(); if (!t) throw new Error('Play or select a track first.');
        h.prog(0);
        const r = await tagTrack(t.url, stat, h.LV(), { deep: deep.checked, progress: f => { last = Date.now(); h.prog(f); } });
        const ok = await persistTags(t.dbId, r, aeq.checked);
        h.tagOut.textContent = fmtTags(r) + (ok ? '' : '\n! Could not save the tags (storage is full).'); h.status('Tagged and saved.'); refreshCount();
      } catch (e) { console.error(e); h.status('Error: ' + errText(e)); }
      clearInterval(iv); busy(false);
    };

    // scope: current track / a track you pick / all tracks
    const scope = $('#ppv-scope'), pick = $('#ppv-pick'), redoL = $('#ppv-redo-l');
    const fillPick = () => {
      const a = A(); if (!a) return; const keep = pick.value, ci = a.currentIndex(), tl = a.tracks(), tg = loadTags();
      pick.textContent = '';
      tl.forEach((t, i) => { const o = document.createElement('option'); o.value = String(t.dbId); o.textContent = (tg[t.dbId] ? '✓ ' : '') + (t.artist ? t.artist + ' – ' : '') + t.title; pick.appendChild(o); if (!keep && i === ci) o.selected = true; });
      if (keep && [...pick.options].some(o => o.value === keep)) pick.value = keep;
    };
    const syncScope = () => {
      const v = scope.value; pick.style.display = v === 'pick' ? '' : 'none'; redoL.style.display = v === 'all' ? '' : 'none';
      h.tagBtn.textContent = v === 'all' ? 'Tag all tracks' : v === 'pick' ? 'Tag chosen track' : 'Tag current track';
      if (v === 'pick') fillPick();
    };
    scope.onchange = syncScope; syncScope();
    h.tagBtn.onclick = () => {
      if (scope.value === 'all') return runAll();
      if (scope.value === 'pick') { const a = A(), t = a && a.tracks().find(x => String(x.dbId) === pick.value); if (!t) { h.status('Choose a track first.'); return; } return tagOne(t); }
      return tagOne(null);
    };

    // batch
    let stopFlag = false; const stopB = $('#ppv-stop');
    stopB.onclick = () => { stopFlag = true; h.status('Stopping after this track…'); };
    const runAll = async () => {
      const a = A(); if (!a) return; stopFlag = false; busy(true); stopB.style.display = ''; stopB.disabled = false;
      const lv = h.LV(), cache = lv ? null : {}, list = a.tracks().filter(t => !t.stem); let done = 0, fail = 0, skip = 0;
      let wl = null; try { if (lv && lv.wake && navigator.wakeLock) wl = await navigator.wakeLock.request('screen'); } catch (e) {}
      try {
        for (let i = 0; i < list.length && !stopFlag; i++) {
          const t = list[i];
          if (!$('#ppv-redo').checked && loadTags()[t.dbId]) { skip++; continue; }
          const tt0 = performance.now(); h.status('Tagging ' + (i + 1) + ' of ' + list.length + ': ' + t.title);
          try {
            const r = await tagTrack(t.url, s => h.status('(' + (i + 1) + '/' + list.length + ') ' + s), lv, { deep: deep.checked, cache, progress: f => h.prog((i + f) / list.length) });
            if (!r.emb && !r.genre) throw new Error(r.errors.join('; ') || 'nothing detected');
            await persistTags(t.dbId, r, aeq.checked); done++;
          } catch (e) { console.warn('tag failed', t.title, e); fail++; }
          await tick(); await ease(performance.now() - tt0, 0, 'track');
        }
      } finally { if (cache) Object.values(cache).forEach(s => s && s.release && s.release()); wl && wl.release().catch(() => {}); }
      h.status((stopFlag ? 'Stopped. ' : 'Done. ') + done + ' tagged' + (skip ? ', ' + skip + ' already had tags' : '') + (fail ? ', ' + fail + ' failed' : '') + '.');
      stopB.style.display = 'none'; busy(false); refreshCount();
    };

    // smart playlists
    function ensureDetailed() { const dm = document.getElementById('detailed-mode-toggle'); if (dm && !dm.checked) { dm.checked = true; dm.dispatchEvent(new Event('change')); } }
    function fill(name, pick, flags) {
      const a = A(), pl = a.playlists().find(x => x.name === name) || a.createPlaylist(name); let n = 0;
      if (flags) Object.assign(pl, flags);
      a.tracks().forEach(t => { if (!t.stem && pick(t) && a.addToPlaylist(t.dbId, pl.id)) n++; });
      return n;
    }
    $('#ppv-mk').onclick = () => {
      const a = A(), tg = loadTags(), ids = [...document.querySelectorAll('#ppv-smart input:checked')].map(i => i.value);
      if (!ids.length) { h.status('Tick at least one playlist.'); return; }
      const msg = [];
      SMART.filter(s => ids.includes(s.id)).forEach(s => { const n = fill('✨ ' + s.name, t => { const c = tg[t.dbId]; return c && s.test(c, vibes(c)); }, { auto: 'smart', smartKey: s.id }); msg.push(s.name + ': ' + n); });
      a.commitPlaylists(); lib.textContent = msg.join('\n'); h.status('Playlists updated. They are real playlists now: find them in the Playlists tab or the library view selector' + (live() ? ', and they keep updating as tracks get tagged.' : '.'));
    };
    $('#ppv-mkq').onclick = () => {
      const q = $('#ppv-q').value.trim().toLowerCase(), a = A(); if (!q) { h.status('Type a search first.'); return; }
      ensureDetailed(); const words = q.split(/\s+/);
      const n = fill('🔎 ' + q, t => { const hay = (t.title + ' ' + t.artist + ' ' + window.__ppTagText(t.dbId)).toLowerCase(); return words.every(w => hay.includes(w)); });
      a.commitPlaylists(); h.status('Playlist made with ' + n + ' track' + (n === 1 ? '' : 's') + '.');
    };

