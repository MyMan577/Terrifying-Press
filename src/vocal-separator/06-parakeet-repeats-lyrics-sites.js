  // ---------- Parakeet TDT 0.6B (Android app): native preprocessor + encoder + token-and-duration decoder ----------
  // Model files: istupakov/parakeet-tdt-0.6b-v2-onnx (the onnx-asr export). Native side: ParakeetNative.java. One encoder frame = 80 ms.
  const PK_BASE = 'https://huggingface.co/istupakov/parakeet-tdt-0.6b-v2-onnx/resolve/main/';
  const PK_FILES = [['pk_pre', 'nemo128.onnx'], ['pk_enc', 'encoder-model.int8.onnx'], ['pk_dec', 'decoder_joint-model.int8.onnx']];
  let pkVoc = null;
  async function pkVocab() {                                           // vocab.txt lines look like "▁the 42"; saved after the first download so it works offline
    if (pkVoc) return pkVoc;
    let txt = ''; try { txt = localStorage.getItem('ppvPkVocab') || ''; } catch (e) {}
    if (!txt) { txt = await (await fetch(PK_BASE + 'vocab.txt')).text(); try { localStorage.setItem('ppvPkVocab', txt); } catch (e) {} }
    const toks = []; let blank = -1;
    for (const line of txt.split('\n')) {
      const l = line.replace(/\r$/, ''); if (!l) continue;
      const i = l.lastIndexOf(' '), id = +l.slice(i + 1), tk = l.slice(0, i);
      if (!(id >= 0)) continue; toks[id] = tk; if (tk === '<blk>') blank = id;
    }
    if (!toks.length) throw new Error('empty Parakeet vocabulary');
    if (blank < 0) blank = toks.length - 1;
    return (pkVoc = { toks, blank, V: toks.length });
  }
  async function pkFiles(status) {
    for (const [k, f] of PK_FILES) if (!(await NP.exists({ id: k })).ready) { status('Downloading ' + f + '…'); await nativeFetch(k, PK_BASE + f, status); }
  }
  function pkCues(words) {                                             // words -> subtitle lines: sentence ends, pauses, and a length cap
    const cues = []; let cur = null;
    const flush = () => { if (cur) { cues.push({ start: cur.s, end: cur.e, text: cur.t.join(' ') }); cur = null; } };
    for (const w of words) {
      if (cur) { const len = cur.t.join(' ').length; if (w.s - cur.e > 0.9 || w.e - cur.s > 8 || len + w.text.length > 84) flush(); }
      if (!cur) cur = { s: w.s, e: w.e, t: [] };
      cur.t.push(w.text); cur.e = Math.max(cur.e, w.e);
      const len = cur.t.join(' ').length;
      if ((/[.!?]["')\]]?$/.test(w.text) && len >= 24) || (/[,;:]$/.test(w.text) && len >= 60)) flush();
    }
    flush(); return cues;
  }
  async function parakeetNative(x, regs, o, status) { return pkCues(await parakeetWords(x, regs, o, status)); }
  async function parakeetWords(x, regs, o, status) {   // every heard word with its start and end: [{ s, e, text }]
    status('Preparing Parakeet…');
    const vo = await pkVocab();
    await pkFiles(status);
    const OWN = 30, OV = 3, FR = 0.08, pieces = [], words = [];
    for (const [ra, rb] of regs) for (let q = ra; q < rb - 0.01; q += OWN) pieces.push({ own0: q, own1: Math.min(rb, q + OWN), ra, rb });
    const total = pieces.reduce((n, p) => n + p.own1 - p.own0, 0) || 1; let doneS = 0;
    for (const p of pieces) {
      const t0 = performance.now();
      status('Transcribing… ' + Math.round(doneS / total * 100) + '%'); await tick();
      const s0 = Math.max(p.ra, p.own0 - OV), s1 = Math.min(p.rb, p.own1 + OV), last = p.own1 >= p.rb - 1e-6;
      const pcm = x.subarray(Math.floor(s0 * 16000), Math.min(x.length, Math.ceil(s1 * 16000)));
      if (pcm.length >= 3200) {
        const r = await NP.parakeetRun({ pre: 'pk_pre', enc: 'pk_enc', dec: 'pk_dec', pcm: await toB64(pcm), n: pcm.length, vocab: vo.V, blank: vo.blank });
        const tk = r.tokens || [], fr = r.frames || [], du = r.durs || []; let w = null;
        const push = () => { if (w && w.text) { const st = s0 + w.f0 * FR; if (!(st < p.own0 - 1e-3 || (!last && st >= p.own1))) words.push({ s: st, e: s0 + w.f1 * FR, text: w.text }); } w = null; };
        for (let i = 0; i < tk.length; i++) {
          const pc = vo.toks[tk[i]]; if (pc == null || /^<.*>$/.test(pc)) continue;
          const startsWord = pc.charAt(0) === '\u2581', txt = pc.replace(/\u2581/g, '');
          if (startsWord || !w) { push(); w = { f0: fr[i], f1: fr[i] + Math.max(1, du[i] || 1), text: '' }; }
          w.text += txt; w.f1 = Math.max(w.f1, fr[i] + Math.max(1, du[i] || 1));
        }
        push();
      }
      doneS += p.own1 - p.own0;
      await ease(performance.now() - t0, 0, 'whn', s1 - s0);
    }
    words.sort((a, b) => a.s - b.s);
    for (let i = 0; i + 1 < words.length; i++) if (words[i].e > words[i + 1].s) words[i].e = Math.max(words[i].s + 0.04, words[i + 1].s);
    return words;
  }

  // ---------- Repeat tracker: finds lines that were sung more than once, votes on the wording, aligns known lyrics ----------
  const rpNorm = s => String(s).toLowerCase().replace(/[’‘`]/g, "'").replace(/[^a-z0-9\u00c0-\uffff' ]+/g, ' ').replace(/\s+/g, ' ').trim();
  const rpLev = (a, b) => {
    if (a === b) return 0; const n = a.length, m = b.length; if (!n) return m; if (!m) return n;
    let p = new Array(m + 1), c = new Array(m + 1); for (let j = 0; j <= m; j++) p[j] = j;
    for (let i = 1; i <= n; i++) { c[0] = i; for (let j = 1; j <= m; j++) c[j] = Math.min(p[j] + 1, c[j - 1] + 1, p[j - 1] + (a.charCodeAt(i - 1) === b.charCodeAt(j - 1) ? 0 : 1)); const t = p; p = c; c = t; }
    return p[m];
  };
  const rpSim = (a, b) => { a = rpNorm(a); b = rpNorm(b); const L = Math.max(a.length, b.length); return L ? 1 - rpLev(a, b) / L : 1; };
  // ---------- Word timings for lyrics a song already has (the "Time the words" button). The text is never changed. ----------
  const WT_RE = /\[(\d{1,3}):(\d{1,2})(?:[.:](\d{1,3}))?\]/g, WT_TAG = /<\d{1,3}:\d{1,2}(?:[.:]\d{1,3})?>/g;
  const wtSec = m => +m[1] * 60 + +m[2] + (m[3] ? +m[3].padEnd(3, '0').slice(0, 3) / 1000 : 0);
  const wtNorm = w => String(w).toLowerCase().replace(/[’‘`']/g, '').replace(/[^a-z0-9À-￿]+/g, '');
  // The lines that can be timed: one time stamp and some words. s/next are song times (the file's offset and the per-song timing applied).
  function wtLines(raw, sync) {
    const rows = String(raw).split(/\r?\n/), lines = [], starts = []; let off = 0;
    rows.forEach((r, ri) => {
      const om = r.match(/^\s*\[offset:\s*([-+]?\d+)\s*\]/i); if (om) { off = parseInt(om[1], 10) / 1000; return; }
      const st = []; let m, last = 0; WT_RE.lastIndex = 0;
      while ((m = WT_RE.exec(r))) { st.push(wtSec(m) - off + sync); last = WT_RE.lastIndex; }
      if (!st.length) return; st.forEach(x => starts.push(x));
      const words = r.slice(last).replace(WT_TAG, '').match(/\S+/g) || [];
      if (st.length === 1 && words.length) lines.push({ ri, s: st[0], words, off, head: r.slice(0, last) });
    });
    starts.sort((a, b) => a - b);
    lines.forEach(l => { const n = starts.find(x => x > l.s + 1e-3); l.next = n != null ? n : l.s + 8; });
    return { rows, lines };
  }
  // Lines the lyric words up with the heard words, in order (like a diff). A heard word only counts for a lyric word if it is
  // the same word (or nearly) and was sung near that line's time. Words in between are spread out; a line where too few
  // words were heard is left alone. Returns the lyrics with a <mm:ss.xx> tag before each word.
  function wtApply(raw, plan, heard, sync) {
    const L = [], H = heard.map(w => ({ s: w.s, e: w.e, n: wtNorm(w.text) })).filter(w => w.n && isFinite(w.s));
    plan.lines.forEach((l, li) => l.words.forEach((w, k) => L.push({ li, k, n: wtNorm(w) })));
    const n = L.length, m = H.length, W = 4, C = m + 1;
    if (!n || !m || n * m > 6e6) return { text: raw, timed: 0 };
    const sim = (i, j) => {
      const a = L[i].n, b = H[j].n, l = plan.lines[L[i].li];
      if (!a || H[j].s < l.s - W || H[j].s > l.next + W) return 0;
      if (a === b) return 1;
      const mx = Math.max(a.length, b.length); if (mx < 3) return 0;
      const r = 1 - rpLev(a, b) / mx; return r >= 0.6 ? r * 0.8 : 0;
    };
    const S = new Float32Array((n + 1) * C), D = new Uint8Array((n + 1) * C);
    for (let i = 1; i <= n; i++) for (let j = 1; j <= m; j++) {
      let best = S[(i - 1) * C + j], d = 1; const lf = S[i * C + j - 1]; if (lf > best) { best = lf; d = 2; }
      const q = sim(i - 1, j - 1); if (q > 0 && S[(i - 1) * C + j - 1] + q > best) { best = S[(i - 1) * C + j - 1] + q; d = 3; }
      S[i * C + j] = best; D[i * C + j] = d;
    }
    const T = plan.lines.map(l => l.words.map(() => null)), E = plan.lines.map(l => l.words.map(() => null));
    for (let i = n, j = m; i > 0 && j > 0;) { const d = D[i * C + j]; if (d === 3) { const x = L[i - 1]; T[x.li][x.k] = H[j - 1].s; E[x.li][x.k] = H[j - 1].e; i--; j--; } else if (d === 1) i--; else j--; }
    const rows = plan.rows.slice(), fmt = v => { v = Math.max(0, v); const mm = Math.floor(v / 60); return '<' + pad2(mm) + ':' + (v - mm * 60).toFixed(2).padStart(5, '0') + '>'; };
    let timed = 0;
    plan.lines.forEach((l, li) => {
      const t = T[li], K = t.length, idx = []; t.forEach((v, k) => { if (v != null) idx.push(k); });
      if (idx.length < Math.max(1, Math.ceil(K * 0.4))) return;
      const f = idx[0], z = idx[idx.length - 1];
      for (let k = 0; k < f; k++) { const lo = Math.min(l.s, t[f] - 0.25 * f); t[k] = lo + (t[f] - lo) * k / f; }
      for (let a = 0; a + 1 < idx.length; a++) { const p = idx[a], q = idx[a + 1]; for (let k = p + 1; k < q; k++) t[k] = t[p] + (t[q] - t[p]) * (k - p) / (q - p); }
      const ez = E[li][z] != null ? E[li][z] : t[z] + 0.3;
      if (z < K - 1) { const hi = Math.max(t[z], Math.min(l.next - 0.05, ez + 0.35 * (K - 1 - z))); for (let k = z + 1; k < K; k++) t[k] = t[z] + (hi - t[z]) * (k - z) / (K - z); }
      for (let k = 1; k < K; k++) if (t[k] < t[k - 1]) t[k] = t[k - 1];
      const end = z === K - 1 ? Math.min(ez, l.next) : null, lrc = v => v - sync + l.off;   // back into the file's own time
      rows[l.ri] = l.head + l.words.map((w, k) => fmt(lrc(t[k])) + w).join(' ') + (end != null && end > t[K - 1] ? ' ' + fmt(lrc(end)) : '');
      timed++;
    });
    return { text: rows.join('\n'), timed };
  }
  // small speech features (12 MFCC-like numbers every 40 ms) so two sung lines can be compared by sound, not only by the words Whisper guessed
  let rpFB = null;
  const rpInit = () => {
    if (rpFB) return rpFB;
    const NF = 512, NM = 24, sr = 16000, mel = f => 2595 * Math.log10(1 + f / 700), imel = m => 700 * (Math.pow(10, m / 2595) - 1), lo = mel(80), hi = mel(7600), pts = [];
    for (let i = 0; i < NM + 2; i++) pts.push(Math.floor((NF + 1) * imel(lo + (hi - lo) * i / (NM + 1)) / sr));
    const fb = []; for (let m = 1; m <= NM; m++) { const f = new Float32Array(NF / 2 + 1); for (let k = pts[m - 1]; k < pts[m]; k++) f[k] = (k - pts[m - 1]) / Math.max(1, pts[m] - pts[m - 1]); for (let k = pts[m]; k < pts[m + 1]; k++) f[k] = (pts[m + 1] - k) / Math.max(1, pts[m + 1] - pts[m]); fb.push(f); }
    const win = new Float32Array(400); for (let i = 0; i < 400; i++) win[i] = 0.5 - 0.5 * Math.cos(2 * Math.PI * i / 399);
    const dct = []; for (let c = 1; c <= 12; c++) { const r = new Float32Array(NM); for (let m = 0; m < NM; m++) r[m] = Math.cos(Math.PI * c * (m + 0.5) / NM); dct.push(r); }
    const cos = new Float32Array(NF / 2), sin = new Float32Array(NF / 2); for (let i = 0; i < NF / 2; i++) { cos[i] = Math.cos(2 * Math.PI * i / NF); sin[i] = -Math.sin(2 * Math.PI * i / NF); }
    const rev = new Uint16Array(NF); for (let i = 0; i < NF; i++) { let r = 0, v = i; for (let b = 0; b < 9; b++) { r = (r << 1) | (v & 1); v >>= 1; } rev[i] = r; }
    return (rpFB = { NF, NM, fb, win, dct, cos, sin, rev });
  };
  const rpFft = (re, im, T) => {
    const n = T.NF;
    for (let i = 0; i < n; i++) { const j = T.rev[i]; if (j > i) { let t = re[i]; re[i] = re[j]; re[j] = t; t = im[i]; im[i] = im[j]; im[j] = t; } }
    for (let len = 2; len <= n; len <<= 1) { const h = len >> 1, st = n / len; for (let i = 0; i < n; i += len) for (let k = 0; k < h; k++) { const wr = T.cos[k * st], wi = T.sin[k * st], a = i + k, b = a + h, xr = re[b] * wr - im[b] * wi, xi = re[b] * wi + im[b] * wr; re[b] = re[a] - xr; im[b] = im[a] - xi; re[a] += xr; im[a] += xi; } }
  };
  const rpFeat = (x, s, e) => {
    const T = rpInit(), a = Math.max(0, Math.floor(s * 16000)), b = Math.min(x.length, Math.floor(Math.min(e, s + 8) * 16000)), out = [];
    const re = new Float32Array(T.NF), im = new Float32Array(T.NF), pw = new Float32Array(T.NF / 2 + 1), me = new Float32Array(T.NM);
    for (let p = a; p + 400 <= b; p += 640) {
      re.fill(0); im.fill(0); let pre = 0; for (let i = 0; i < 400; i++) { const v = x[p + i]; re[i] = (v - pre * 0.97) * T.win[i]; pre = v; }
      rpFft(re, im, T); for (let k = 0; k <= T.NF / 2; k++) pw[k] = re[k] * re[k] + im[k] * im[k];
      for (let m = 0; m < T.NM; m++) { let sum = 0; const f = T.fb[m]; for (let k = 0; k <= T.NF / 2; k++) sum += f[k] * pw[k]; me[m] = Math.log(sum + 1e-6); }
      const c = new Float32Array(12); for (let d = 0; d < 12; d++) { let sum = 0; for (let m = 0; m < T.NM; m++) sum += T.dct[d][m] * me[m]; c[d] = sum; } out.push(c);
    }
    if (out.length < 5) return null;
    const mu = new Float32Array(12); out.forEach(c => { for (let d = 0; d < 12; d++) mu[d] += c[d] / out.length; });
    out.forEach(c => { let n2 = 0; for (let d = 0; d < 12; d++) { c[d] -= mu[d]; n2 += c[d] * c[d]; } n2 = Math.sqrt(n2) || 1; for (let d = 0; d < 12; d++) c[d] /= n2; });
    return out;
  };
  const rpDtw = (A, B) => {
    const n = A.length, m = B.length, INF = 1e9; let prev = new Float32Array(m + 1).fill(INF), cur = new Float32Array(m + 1); prev[0] = 0;
    for (let i = 1; i <= n; i++) { cur[0] = INF; const a = A[i - 1]; for (let j = 1; j <= m; j++) { const b = B[j - 1]; let d = 0; for (let k = 0; k < 12; k++) d += a[k] * b[k]; cur[j] = (1 - d) + Math.min(prev[j], cur[j - 1], prev[j - 1]); } const t = prev; prev = cur; cur = t; }
    return prev[m] / (n + m);
  };
  // cues: [{s, e, text}]. Returns groups of cue indexes that are the same line sung again. With audio x (16 kHz mono) it also
  // links lines that sound alike even when Whisper wrote them differently (the text still has to share a little with the other line).
  async function rpFind(cues, x) {
    const n = cues.length, par = Array.from({ length: n }, (_, i) => i);
    const find = i => { while (par[i] !== i) { par[i] = par[par[i]]; i = par[i]; } return i; }, uni = (a, b) => { a = find(a); b = find(b); if (a !== b) par[b] = a; };
    const nt = cues.map(c => rpNorm(c.text)), du = cues.map(c => Math.max(0.1, c.e - c.s)), memo = new Map();
    const S = (i, j) => { const k = i * n + j; let v = memo.get(k); if (v === undefined) { v = 1 - rpLev(nt[i], nt[j]) / Math.max(nt[i].length, nt[j].length, 1); memo.set(k, v); } return v; };
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) if (nt[i] && nt[j] && Math.abs(nt[i].length - nt[j].length) <= 0.5 * Math.max(nt[i].length, nt[j].length) && S(i, j) >= 0.72) uni(i, j);
    if (x && n > 2) {
      const feats = new Array(n), F = i => (feats[i] === undefined ? (feats[i] = rpFeat(x, cues[i].s, cues[i].e)) : feats[i]), okDur = (i, j) => { const r = du[i] / du[j]; return r >= 0.6 && r <= 1.67; };
      const cand = [], base = [], stride = Math.max(1, Math.floor(n * n / 2 / 70)); let q = 0;
      for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) { if (!okDur(i, j) || !nt[i] || !nt[j]) continue; if ((q++ % stride) === 0) base.push([i, j]); if (find(i) !== find(j) && S(i, j) >= 0.3) cand.push([i, j, S(i, j)]); }
      cand.sort((a, b) => b[2] - a[2]); if (cand.length > 2500) cand.length = 2500;
      const dist = async (i, j) => { const a = F(i), b = F(j); return a && b ? rpDtw(a, b) : 9; };
      const bd = []; for (const [i, j] of base.slice(0, 70)) bd.push(await dist(i, j)); await tick();
      bd.sort((a, b) => a - b); const med = bd.length ? bd[bd.length >> 1] : 0.5, thr = Math.max(0.12, Math.min(0.45, med * 0.62));   // "much closer than a typical pair of lines"
      let k = 0; for (const [i, j] of cand) { if (find(i) !== find(j) && (await dist(i, j)) <= thr) uni(i, j); if (++k % 40 === 0) await tick(); }
    }
    const g = new Map(); for (let i = 0; i < n; i++) { if (!nt[i]) continue; const r = find(i); if (!g.has(r)) g.set(r, []); g.get(r).push(i); }
    return [...g.values()].filter(a => a.length >= 2);
  }
  // Votes on the best wording for a group. Each member offers its own text plus any alternatives from other passes (alternatives count a little less).
  const rpVote = ms => {
    const cand = new Map(), offers = m => [m.text].concat(m.alts || []);
    ms.forEach(m => offers(m).forEach(t => { const k = rpNorm(t); if (k && !cand.has(k)) cand.set(k, t); }));
    let best = null;
    cand.forEach((t, k) => {
      let sc = 0, sup = 0;
      ms.forEach(m => { let b = 0; offers(m).forEach((u, ui) => { const v = rpSim(t, u) * (ui ? 0.85 : 1); if (v > b) b = v; }); sc += b; if (rpNorm(m.text) === k) sup++; });
      if (!best || sc > best.sc + 1e-9 || (Math.abs(sc - best.sc) < 1e-9 && sup > best.sup)) best = { text: t, sc, sup };
    });
    return best;
  };
  // Lines up known lyrics (array of strings) with timed lines that Whisper heard (src: [{s, e, text}]). Returns start times per lyric line.
  function rpAlign(src, lines) {
    const A = [], B = [];
    src.forEach(r => { const w = rpNorm(r.text).split(' ').filter(Boolean), tot = w.reduce((a, x) => a + x.length + 1, 0) || 1; let acc = 0; w.forEach(x => { A.push({ w: x, t: r.s + (r.e - r.s) * acc / tot }); acc += x.length + 1; }); });
    lines.forEach((l, li) => rpNorm(l).split(' ').filter(Boolean).forEach(w => B.push({ w, li })));
    const n = A.length, m = B.length, W = m + 1, H = new Int16Array((n + 1) * W), TR = new Uint8Array((n + 1) * W);
    if (!n || !m) return { starts: lines.map(() => 0), anchored: lines.map(() => false), ratio: 0 };
    const ms = (a, b) => a === b ? 2 : (a.length >= 4 && b.length >= 4 && Math.abs(a.length - b.length) <= 2 && rpLev(a, b) <= (a.length >= 7 ? 2 : 1)) ? 1 : -1;
    for (let i = 1; i <= n; i++) { H[i * W] = -i; TR[i * W] = 1; }
    for (let j = 1; j <= m; j++) { H[j] = -j; TR[j] = 2; }
    for (let i = 1; i <= n; i++) for (let j = 1; j <= m; j++) {
      const d = H[(i - 1) * W + j - 1] + ms(A[i - 1].w, B[j - 1].w), u = H[(i - 1) * W + j] - 1, l = H[i * W + j - 1] - 1; let v = d, t = 0;
      if (u > v) { v = u; t = 1; } if (l > v) { v = l; t = 2; } H[i * W + j] = v; TR[i * W + j] = t;
    }
    const T = new Array(m).fill(null); let i = n, j = m, hit = 0;
    while (i > 0 || j > 0) { const t = TR[i * W + j]; if (i > 0 && j > 0 && t === 0) { if (ms(A[i - 1].w, B[j - 1].w) > 0) { T[j - 1] = A[i - 1].t; hit++; } i--; j--; } else if (i > 0 && (t === 1 || j === 0)) i--; else j--; }
    const nl = lines.length, first = new Array(nl).fill(-1), cnt = new Array(nl).fill(0); B.forEach((b, k) => { if (first[b.li] < 0) first[b.li] = k; cnt[b.li]++; });
    const starts = new Array(nl).fill(null), anchored = new Array(nl).fill(false);
    for (let li = 0; li < nl; li++) { for (let k = 0; k < cnt[li]; k++) { const t = T[first[li] + k]; if (t != null) { starts[li] = Math.max(0, t - k * 0.3); anchored[li] = true; break; } } }
    const ids = starts.map((s, k) => s != null ? k : -1).filter(k => k >= 0);
    if (!ids.length) return { starts: lines.map((_, k) => k * 4), anchored, ratio: 0 };
    const wc = k => Math.max(1, cnt[k]);
    for (let k = 0; k < nl; k++) {
      if (starts[k] != null) continue;
      let p = k - 1; while (p >= 0 && starts[p] == null) p--; let q = k + 1; while (q < nl && starts[q] == null) q++;
      if (p >= 0 && q < nl) { let tot = 0, up = 0; for (let z = p; z < q; z++) { tot += wc(z); if (z < k) up += wc(z); } starts[k] = starts[p] + (starts[q] - starts[p]) * up / tot; }
      else if (p >= 0) { let up = 0; for (let z = p; z < k; z++) up += wc(z); starts[k] = starts[p] + up * 0.4; }
      else { let dn = 0; for (let z = k; z < q; z++) dn += wc(z); starts[k] = Math.max(0, starts[q] - dn * 0.4); }
    }
    for (let k = 1; k < nl; k++) if (starts[k] < starts[k - 1] + 0.2) starts[k] = starts[k - 1] + 0.2;
    return { starts, anchored, ratio: hit / m };
  }
  const rpAltsLoad = id => { try { return (JSON.parse(localStorage.getItem('ppvAlts') || '{}')[id]) || []; } catch (e) { return []; } };
  const rpAltsSave = (id, items) => {
    try { const all = JSON.parse(localStorage.getItem('ppvAlts') || '{}'), list = items.filter(c => c.alts && c.alts.length).map(c => [Math.round((c.s != null ? c.s : c.start) * 100) / 100, c.alts.slice(0, 3)]); if (list.length) all[id] = list; else delete all[id]; localStorage.setItem('ppvAlts', JSON.stringify(all)); } catch (e) {}
  };
  // Merge extra passes into alternatives, find repeated lines, and unify the wording when most repeats agree.
  async function rpFinish(passes, x) {
    const main = passes[0].map(c => ({ start: c.start, end: c.end, text: c.text, alts: [] }));
    for (let k = 1; k < passes.length; k++) for (const m of main) {
      const part = passes[k].filter(c => { const mid = (c.start + c.end) / 2; return mid >= m.start - 0.3 && mid <= m.end + 0.3; });
      if (!part.length) continue;
      const t = part.map(c => c.text).join(' ').replace(/\s+/g, ' ').trim();
      if (t && rpSim(t, m.text) < 0.97 && !m.alts.some(a => rpSim(a, t) >= 0.97)) m.alts.push(t);
    }
    const rep = window.__ppvRep = { fixed: 0, unsure: 0 };
    try {
      const groups = await rpFind(main.map(c => ({ s: c.start, e: c.end, text: c.text })), x);
      for (const ix of groups) {
        const ms = ix.map(i => main[i]), vs = new Set(ms.map(c => rpNorm(c.text)));
        if (vs.size < 2 && !ms.some(c => c.alts.length)) continue;
        const v = rpVote(ms); if (!v) continue;
        if (vs.size > 1 && ms.length >= 3 && v.sup >= 2 && v.sc / ms.length >= 0.8) { ms.forEach(c => { if (rpNorm(c.text) !== rpNorm(v.text)) { c.alts.unshift(c.text); c.text = v.text; rep.fixed++; } }); }
        else if (vs.size > 1) rep.unsure++;
      }
    } catch (e) { console.warn('repeat check failed', e); }
    main.forEach(c => { c.alts = c.alts.slice(0, 3); });
    return main;
  }
  const rpRms = (x, s, e) => { const a = Math.max(0, Math.floor(s * 16000)), b = Math.min(x.length, Math.max(a + 1, Math.floor(e * 16000))); let q = 0; for (let i = a; i < b; i++) q += x[i] * x[i]; return Math.sqrt(q / (b - a)); };
  const rpRef = x => { const F = 8000, n = Math.floor(x.length / F); if (n < 4) return 0; const r = new Float32Array(n); for (let i = 0; i < n; i++) { let s = 0; for (let j = 0; j < F; j++) { const v = x[i * F + j]; s += v * v; } r[i] = Math.sqrt(s / F); } return Array.from(r).sort((u, v) => u - v)[Math.floor(n * 0.9)]; };

  // A song that was already split keeps its stems in the library. Find the vocals one so lyrics can reuse it instead of splitting again.
  const isVocalsStem = x => !!x && !!x.stem && (/\(\s*vocals?\s*\)\s*$/i.test(x.title || '') || (typeof x.stem === 'string' && /vocal/i.test(x.stem)));
  const findVocalsStem = (list, t) => {
    if (!t || t.stem) return null; const id = String(t.dbId), title = String(t.title || '');
    return (list || []).find(x => isVocalsStem(x) && x.dbId !== t.dbId && ((x.stemOf != null && String(x.stemOf) === id) || (!x.stemOf && x.stemSrc && x.stemSrc === title))) || null;
  };
  let heavyJob = false;                                               // stem split or Whisper running: two at once runs out of memory
  async function transcribe(t, o, status) {
    if (heavyJob) throw new Error('Another split or transcription is still running. Wait for it to finish.');
    heavyJob = true; let wl = null;
    if (NATIVE) NP.keepAlive({ on: true }).catch(() => {});
    try {
      if (o.lv && o.lv.wake && navigator.wakeLock) { try { wl = await navigator.wakeLock.request('screen'); } catch (e) {} }
      const cues = await transcribeRun(t, o, status);
      try { rpAltsSave(t.dbId, cues); } catch (e) {}                  // alternative wordings live beside the subtitles, for the editor's Repeats tab
      return cues.map(c => ({ start: c.start, end: c.end, text: c.text }));
    } finally { if (NATIVE) NP.keepAlive({ on: false }).catch(() => {}); wl && wl.release().catch(() => {}); heavyJob = false; }
  }
  // The song as 16 kHz mono for speech models. With o.clean the music is removed first (or previously split vocals are reused).
  async function whAudio(t, o, status) {
    let x; window.__ppvSaved = false;
    if (o.clean) {                                                    // pull the vocals out first: far fewer made-up lines on songs
      const A0 = window.__ppApi, vs = findVocalsStem(A0 && A0.tracks(), t);
      if (vs || isVocalsStem(t)) {                                    // already split (or this IS the vocals): never split again
        status(vs ? 'Using the previously split vocals…' : 'This is already a vocals track…'); x = await decodeMono((vs || t).url, 16000);
      } else {
      const SPM = 'spleeter2';                                        // the music-removal step always uses Spleeter (Fast 2 stems), whatever model is picked for splitting
      await downloadModel(SPM, status, !!(o.lv && o.lv.blob));
      // In the app the whole separation runs natively (no JavaScript copy of the song, no JavaScript FFTs); elsewhere it runs in the page.
      const nat = NATIVE;
      status('Decoding audio…'); let pcm = nat ? null : await decode(t.url);
      const res = await run(SPM, pcm, ['Vocals'], { strength: o.strength, gpu: false, lv: o.lv, quality: 1, gate: 0, track: t, nnapi: NATIVE ? wantNnapi(SPM) : false, pathOnly: nat }, status, f => status('Separating vocals… ' + Math.round(f * 100) + '%'));
      pcm = null; const v = res.Vocals; status('Reading vocals…');
      let eb = null, eext = v.ext || 'wav';
      if (v.path) {                                                   // app: the vocals sit in a temp file; read it once so it can be decoded AND kept
        try { eb = await (await fetch(window.Capacitor.convertFileSrc(v.path))).blob(); } catch (e) { console.warn('Could not read the vocals file', e); }
        try { if (eb) { const u = URL.createObjectURL(eb); try { x = await decodeMono(u, 16000); } finally { URL.revokeObjectURL(u); } } else x = await decodeMono(window.Capacitor.convertFileSrc(v.path), 16000); }
        finally { NP.deleteFiles({ paths: [v.path] }).catch(() => {}); }
      } else {
        const e = v.blob ? v : encode(v); eb = e.blob; eext = e.ext || eext; const u = URL.createObjectURL(e.blob); try { x = await decodeMono(u, 16000); } finally { URL.revokeObjectURL(u); }
      }
      // Keep the vocals as a split track, exactly like a normal split, so the next transcription (or a split) reuses them.
      if (eb && !t.stem) {
        try {
          const mk = ls0('ppvMkPl') === '1';
          addSplit([new File([eb], t.title + ' (Vocals).' + eext, { type: eb.type || 'audio/wav' })], { srcId: t.dbId, srcTitle: t.title, makePlaylist: mk, showInTab: mk && ls0('ppvPlTab') === '1' });
          window.__ppvSaved = true; status('Saved the vocals to Split tracks.');
        } catch (e) { console.warn('Could not save the vocals', e); }
      }
      eb = null;
      }
    } else { status('Decoding audio…'); x = await decodeMono(t.url, 16000); }
    return x;
  }
  // Word timings for the sing-along highlight: listens to the song and returns every heard word with its time, [{ s, e, text }].
  // Parakeet gives word times by itself. Whisper needs a model exported with its attention weights; if the chosen one was not, a
  // Whisper Base built for word timings is used instead. Native Whisper only times whole lines, so the web version is used here.
  async function transcribeWords(t, o, status) {
    if (heavyJob) throw new Error('Another split or transcription is still running. Wait for it to finish.');
    heavyJob = true; let wl = null;
    if (NATIVE) NP.keepAlive({ on: true }).catch(() => {});
    try {
      if (o.lv && o.lv.wake && navigator.wakeLock) { try { wl = await navigator.wakeLock.request('screen'); } catch (e) {} }
      const x = await whAudio(t, o, status), regs = speechRegions(x, 16000);
      if (whPk(o.size) && NATIVE) {
        try { return await parakeetWords(x, regs, o, status); }
        catch (e) { console.warn('Parakeet failed', e); status('Parakeet failed: ' + errText(e) + ' Using Whisper instead…'); }
        finally { NP.parakeetUnload().catch(() => {}); }
      }
      const ids = [whPk(o.size) || !WH[o.size] ? WH.base_en[0] : WH[o.size][0], 'onnx-community/whisper-base_timestamped'];
      let err = null;
      for (const id of ids) {
        try { return await whWordsWith(id, x, regs, o, status); }
        catch (e) { console.warn('Word timings failed with ' + id, e); err = e; if (id !== ids[ids.length - 1]) status('This model cannot time single words. Trying Whisper Base for word timings…'); }
      }
      throw err;
    } finally { if (NATIVE) NP.keepAlive({ on: false }).catch(() => {}); wl && wl.release().catch(() => {}); heavyJob = false; }
  }
  async function whWordsWith(id, x, regs, o, status) {
    const pipe = await getAsr(id, status), SL = 26, OV = 2, words = [], pieces = [];
    const en = Object.values(WH).some(v => v[0] === id && v[2] && v[2].en);
    for (const [ra, rb] of regs) for (let q = ra; q < rb - 0.01; q += SL) pieces.push({ own0: q, own1: Math.min(rb, q + SL), ra, rb });
    const total = pieces.reduce((n, p) => n + p.own1 - p.own0, 0) || 1; let doneS = 0;
    for (const p of pieces) {
      const t0 = performance.now();
      status('Listening for each word… ' + Math.round(doneS / total * 100) + '%'); await tick();
      const s0 = Math.max(p.ra, p.own0 - OV), s1 = Math.min(p.rb, p.own1 + OV), last = p.own1 >= p.rb - 1e-6;
      const kw = { return_timestamps: 'word', chunk_length_s: 30, stride_length_s: 5 };
      if (!en) { kw.task = 'transcribe'; if (o.lang) kw.language = o.lang; }
      const out = await pipe(x.subarray(Math.floor(s0 * 16000), Math.min(x.length, Math.ceil(s1 * 16000))), kw);
      for (const c of (out && out.chunks) || []) {                    // a word belongs to the piece it starts in, so none is counted twice
        const ts = c.timestamp || [], a = s0 + (+ts[0] || 0), txt = String(c.text || '').trim();
        if (!txt || !isFinite(a) || a < p.own0 - 1e-3 || (!last && a >= p.own1)) continue;
        words.push({ s: a, e: ts[1] != null && isFinite(+ts[1]) ? s0 + +ts[1] : a + 0.3, text: txt });
      }
      doneS += p.own1 - p.own0;
      await ease(performance.now() - t0, 0, 'whn', s1 - s0);
    }
    return words.sort((a, b) => a.s - b.s);
  }
  async function transcribeRun(t, o, status) {
    let pipe = null;
    if (o.task === 'translate' && whEn(o.size)) { o = Object.assign({}, o, { size: 'base' }); status('Translating needs the multilingual Base model…'); }
    const x = await whAudio(t, o, status);
    const dur = x.length / 16000, acc = Math.max(0, Math.min(2, Math.round(+o.acc || 0)));
    // Only the parts with speech or singing go to Whisper. Each part is cut into 90 s pieces that overlap by 4 s, and a line belongs to the
    // piece it starts in, so nothing is cut at a seam. Between pieces it can rest if the phone is hot.
    // Accuracy 1/2 decodes the song 2/3 times with the piece boundaries moved, so every line is heard from a different angle. The versions are
    // compared, the repeated lines (choruses) are voted on, and the other wordings are kept as alternatives for the editor's Repeats tab.
    const regs = speechRegions(x, 16000);
    window.__ppvRep = null;
    if (whPk(o.size)) {
      try { if (!NATIVE) throw new Error('Parakeet only runs in the Android app'); return await rpFinish([cleanCues(await parakeetNative(x, regs, o, status), dur, x)], x); }
      catch (e) { console.warn('Parakeet failed', e); status('Parakeet failed: ' + errText(e) + ' Using English Base instead…'); o = Object.assign({}, o, { size: 'base_en' }); }
      finally { if (NATIVE) NP.parakeetUnload().catch(() => {}); }          // give the memory back
    }
    const decodeOnce = async (xx, rg, oo, st, k) => {
      const d2 = xx.length / 16000, SL = 90, OV = 4, raw = [];
      if (whNativeOn()) {                                                // Android app: native Whisper first
        try { return cleanCues(await whisperNative(xx, rg, oo, st), d2, xx); }
        catch (e) { console.warn('Native Whisper failed, using the web version', e); wNativeFailed = true; st('Native Whisper unavailable, using the web version…'); }
      }
      let pipe = await getAsr(WH[oo.size][0], st);
      const pieces = [];
      for (const [ra, rb] of rg) for (let q = ra; q < rb - 0.01; q += SL) pieces.push({ own0: q, own1: Math.min(rb, q + SL), ra, rb });
      const total = pieces.reduce((n, p) => n + p.own1 - p.own0, 0) || 1; let doneS = 0;
      for (const p of pieces) {
        const t0 = performance.now();
        st('Transcribing… ' + Math.round(doneS / total * 100) + '%'); await tick();
        const s0 = Math.max(p.ra, p.own0 - OV), s1 = Math.min(p.rb, p.own1 + OV), last = p.own1 >= p.rb - 1e-6;
        const kw = { return_timestamps: true, chunk_length_s: 30, stride_length_s: 5 };
        if (acc > 0 && k === 0) kw.num_beams = 4;                       // beam search: weighs several wordings before choosing one (slower)
        if (acc > 1 && k === 2) { kw.do_sample = true; kw.temperature = 0.3; }   // a slightly different roll of the dice for the third opinion
        if (!whEn(oo.size)) { kw.task = oo.task || 'transcribe'; if (oo.lang) kw.language = oo.lang; }
        const part = xx.subarray(Math.floor(s0 * 16000), Math.min(xx.length, Math.ceil(s1 * 16000)));
        let out;
        try { out = await pipe(part, kw); }
        catch (e) {
          if (kw.num_beams || kw.do_sample) { console.warn('Beam search / sampling failed, using normal decoding', e); delete kw.num_beams; delete kw.do_sample; delete kw.temperature; try { out = await pipe(part, kw); } catch (e2) { e = e2; } }
          if (!out) {                                                   // the GPU path broke mid-run: finish on the CPU instead of failing
            if (!/webgpu$/.test(asrId)) throw e;
            console.warn('Whisper GPU run failed, retrying on the CPU', e); wGpuFailed = true; pipe = await getAsr(WH[oo.size][0], st); out = await pipe(part, kw);
          }
        }
        for (const c of (out.chunks || [])) {
          const a = c.timestamp && c.timestamp[0] != null ? c.timestamp[0] : 0, b = c.timestamp && c.timestamp[1] != null ? c.timestamp[1] : null, stt = a + s0;
          if (stt < p.own0 - 1e-3 || (!last && stt >= p.own1)) continue;   // that line sits in the overlap and the neighbouring piece owns it
          raw.push({ start: stt, end: b == null ? 0 : b + s0, text: c.text });
        }
        doneS += p.own1 - p.own0;
        await ease(performance.now() - t0, 0, 'wh', s1 - s0);
      }
      return cleanCues(raw, d2, xx);
    };
    const offs = [0, 15, 7].slice(0, 1 + acc), passes = [];
    for (let k = 0; k < offs.length; k++) {
      const off = offs[k], xx = off ? x.subarray(Math.floor(off * 16000)) : x, rg = off ? regs.map(r => [Math.max(0, r[0] - off), r[1] - off]).filter(r => r[1] - r[0] > 0.5) : regs;
      const st = offs.length > 1 ? (m => status('Pass ' + (k + 1) + ' of ' + offs.length + ': ' + m)) : status;
      let c; try { c = await decodeOnce(xx, rg, o, st, k); } catch (e) { if (!k) throw e; console.warn('Extra pass failed, keeping what we have', e); break; }
      passes.push(off ? c.map(q => ({ start: q.start + off, end: q.end + off, text: q.text })) : c);
    }
    status(passes.length > 1 ? 'Comparing the passes and the repeated lines…' : 'Checking repeated lines…'); await tick();
    return await rpFinish(passes, x);
  }

  // ---------- Free lyrics sites, language guess, translation, background fetch ----------
  const LY_LANGS = [['', 'Any language'], ['en', 'English'], ['es', 'Spanish'], ['fr', 'French'], ['de', 'German'], ['it', 'Italian'], ['pt', 'Portuguese'], ['nl', 'Dutch'], ['tr', 'Turkish'], ['id', 'Indonesian'], ['sv', 'Swedish'], ['pl', 'Polish'], ['ru', 'Russian'], ['uk', 'Ukrainian'], ['ar', 'Arabic'], ['hi', 'Hindi'], ['ja', 'Japanese'], ['ko', 'Korean'], ['zh', 'Chinese'], ['th', 'Thai'], ['he', 'Hebrew'], ['el', 'Greek']];
  const lyName = c => { const l = LY_LANGS.find(x => x[0] === c); return l ? l[1] : c; };
  const LY_STOP = {
    en: "the you and to it me my is in of that on we be this for with your are i'm don't just like love", es: 'que el los una por con para te mi tu es lo las pero como yo si muy más está',
    fr: 'le les des une est pas que je tu il nous vous dans pour mon ma qui avec', de: 'der die das und ich du nicht ist ein eine mit den von zu sie wir auf mir dir',
    it: 'che non per con sono una gli il mi ti ma più come anche', pt: 'que não uma para com você os as do da em eu meu minha mas está',
    nl: 'de het een en ik je niet van dat is op te zijn maar', tr: 'bir ve ben sen bu da de ne için çok ama gibi',
    id: 'yang dan aku kamu di ini itu tidak untuk dengan ada', sv: 'och jag du det är en som på inte att med', pl: 'nie to się na że jestem ty ja w z jak tak'
  };
  const LY_STOPSET = {}; for (const k in LY_STOP) LY_STOPSET[k] = new Set(LY_STOP[k].split(' '));
  const LY_CHARS = { es: /[ñ¿¡]/, pt: /[ãõ]/, de: /[ßäöü]/, tr: /[şğı]/, pl: /[łąęż]/, sv: /[åäö]/, fr: /[èêçœ]/ };
  // Rough guess from the text alone: script first (kana, hangul, cyrillic...), then common words. Returns '' when unsure.
  function guessLang(txt) {
    txt = String(txt || '').slice(0, 4000).toLowerCase(); const letters = (txt.match(/\p{L}/gu) || []).length; if (letters < 12) return '';
    const cnt = re => (txt.match(re) || []).length;
    const sc = { ja: cnt(/[\u3040-\u30ff]/g), ko: cnt(/[\uac00-\ud7af]/g), zh: cnt(/[\u4e00-\u9fff]/g), ru: cnt(/[\u0400-\u04ff]/g), ar: cnt(/[\u0600-\u06ff]/g), hi: cnt(/[\u0900-\u097f]/g), th: cnt(/[\u0e00-\u0e7f]/g), he: cnt(/[\u0590-\u05ff]/g), el: cnt(/[\u0370-\u03ff]/g) };
    if (sc.ja >= 3 && (sc.ja + sc.zh) / letters > 0.3) return 'ja';
    for (const k of ['ko', 'zh', 'ru', 'ar', 'hi', 'th', 'he', 'el']) if (sc[k] / letters > 0.3) return k === 'ru' && /[іїєґ]/.test(txt) ? 'uk' : k;
    const words = txt.match(/[\p{L}']+/gu) || [], score = {};
    for (const k in LY_STOPSET) { let n = 0; for (const w of words) if (LY_STOPSET[k].has(w)) n++; if (LY_CHARS[k] && LY_CHARS[k].test(txt)) n += 3; score[k] = n; }
    const top = Object.keys(score).sort((a, b) => score[b] - score[a]);
    return score[top[0]] >= 3 && score[top[0]] >= score[top[1]] * 1.3 ? top[0] : '';
  }
  const lyLines = txt => String(txt).split(/\r?\n/).map(l => l.replace(/^\s*(\[\d{1,3}:\d{2}(?:[.:]\d{1,3})?\]\s*)+/, '').trim()).filter(l => l && !/^\[[^\]]*\]$/.test(l));
  const lyText = it => lyLines(it.syncedLyrics || it.plainLyrics || '').slice(0, 60).join('\n');
  const lyLrcLine = (sec, text) => '[' + String(Math.floor(sec / 60)).padStart(2, '0') + ':' + (sec % 60).toFixed(2).padStart(5, '0') + ']' + text;
  const lyNorm = s => String(s || '').toLowerCase().replace(/\.(mp3|m4a|wav|flac|ogg|mp4|mkv|webm)$/i, '').replace(/\s*[\(\[][^\)\]]*[\)\]]/g, '').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
  const lyArtistOk = a => !!a && !/^(Unknown artist|Video|Stream)$/i.test(a);
  // Is the artist already a separate part of the title, e.g. "Adele - Hello", "Hello by Adele", "Blinding Lights (The Weeknd)",
  // or a near spelling ("Beyonce" for "Beyoncé", "ACDC" for "AC/DC")? A title that only happens to share a word ("Queen of Hearts"
  // by Queen, "Blurred Lines" by Blur) does not count. Returns null, or { br: true if the artist was in brackets, rest: title without it }.
  const lyWords = s => String(s || '').toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^\p{L}\p{N}]+/gu, ' ').trim().split(' ').filter(Boolean);
  function lyEdits(a, b, max) {                                       // Levenshtein distance, stops early once it is over max
    if (Math.abs(a.length - b.length) > max) return max + 1;
    let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
    for (let i = 1; i <= a.length; i++) {
      const cur = [i]; let best = i;
      for (let j = 1; j <= b.length; j++) { cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)); best = Math.min(best, cur[j]); }
      if (best > max) return max + 1; prev = cur;
    }
    return prev[b.length];
  }
  const lyClose = (x, y) => { if (x === y) return true; if (Math.min(x.length, y.length) < 4) return false; const m = x.length >= 8 ? 2 : 1; return lyEdits(x, y, m) <= m; };
  function lyArtistPart(t) {
    if (!lyArtistOk(t.artist) || !t.title) return null;
    const aw = lyWords(t.artist).filter(w => w !== 'the'); if (!aw.length) return null;
    const isArtist = seg => {                                         // the segment is the artist, maybe with a little extra ("feat. X", "official")
      const sw = lyWords(seg).filter(w => w !== 'the'); if (!sw.length || sw.length > aw.length + 3) return false;
      if (sw.join('') === aw.join('') || sw.slice(0, aw.length + 1).join('').startsWith(aw.join(''))) return true;
      return aw.filter(w => sw.some(v => lyClose(w, v))).length / aw.length >= 0.75;
    };
    const raw = String(t.title).replace(/\.(mp3|m4a|wav|flac|ogg|mp4|mkv|webm)$/i, '');
    const br = [...raw.matchAll(/[\(\[\{]([^\)\]\}]*)[\)\]\}]/g)].map(m => m[1]);
    const main = raw.replace(/[\(\[\{][^\)\]\}]*[\)\]\}]/g, ' ').split(/\s+[-\u2013\u2014~|:]\s+|\s*[\u2013\u2014|]\s*|\s+by\s+/i).map(x => x.trim()).filter(Boolean);
    if (main.length >= 2) { const i = main.findIndex(isArtist); if (i >= 0) return { br: false, rest: lyNorm(main.filter((_, k) => k !== i).join(' ')) }; }
    if (br.some(isArtist)) return { br: true, rest: lyNorm(raw) };
    return null;
  }
  const lyArtistInTitle = t => !!lyArtistPart(t);
  const lyTitleNoArtist = t => { const p = lyArtistPart(t); return p ? p.rest : ''; };
  // Bracketed parts are dropped from the search text, so an artist found only in brackets is still added in front.
  // Videos (and files) often have no real artist but a title like "Adele - Hello (Official Video)": take the artist from the title.
  function lySong(t) {
    if (lyArtistOk(t.artist) || !t.title) return t;
    const parts = String(t.title).split(/\s+[-\u2013\u2014|]\s+/);
    if (parts.length < 2 || !parts[0].trim() || !parts.slice(1).join(' ').trim()) return t;
    return Object.assign({}, t, { artist: parts[0].trim(), title: parts.slice(1).join(' - ').trim() });
  }
  // Second try after a miss: strip what video uploads add to titles (1080p, 4K, 16:9, 60fps, HDR, "Official Music Video",
  // "Remastered 2011", "Lyrics"...) and channel names ("AdeleVEVO", "Adele - Topic"). Not used on the first try,
  // so a song that really is called "Audio" or "Lyrics" is still found under its own name.
  const LY_JUNK = [
    /\b\d{3,4}\s?[pi]\b/gi,                                            // 720p, 1080p, 2160p, 1080i
    /\b\d{3,4}\s?[x\u00d7]\s?\d{3,4}\b/gi,                               // 1920x1080
    /(?<![\d.])(16\s?:\s?9|9\s?:\s?16|4\s?:\s?3|3\s?:\s?4|21\s?:\s?9|32\s?:\s?9|1\s?:\s?1|2\.35\s?:\s?1|2\.39\s?:\s?1|1\.85\s?:\s?1)(?![\d.])/g,   // aspect ratios
    /\b(8k|4k|2k|uhd|fhd|qhd|full\s?hd|hd|hq|sd|hdr10\+?|hdr|sdr|dolby\s?(vision|atmos)|\d{2,3}\s?fps|imax)\b/gi,
    /\b(\d{4}\s+)?(digitally\s+)?remaster(ed)?(\s+(version|\d{4}))?\b/gi,
    /\b(official\s+)?((music|lyrics?|hd|4k|audio)\s+)?(video|visuali[sz]er|audio|mv|clip)\b/gi,
    /\b(with\s+)?lyrics?\b|\b(explicit|clean)(\s+version)?\b/gi
  ];
  function lyStrip(t) {
    let ti = String(t.title || '').replace(/\.(mp3|m4a|wav|flac|ogg|mp4|mkv|webm)$/i, '').replace(/[\(\[\{][^\)\]\}]*[\)\]\}]/g, ' ');
    for (const re of LY_JUNK) ti = ti.replace(re, ' ');
    ti = ti.replace(/(\s*[-\u2013\u2014|:~]\s*)+$/, '').replace(/^(\s*[-\u2013\u2014|:~]\s*)+/, '').replace(/(\s+[-\u2013\u2014|:~])(\s+[-\u2013\u2014|:~])+/g, '$1').replace(/\s+/g, ' ').trim();
    const ar = String(t.artist || '').replace(/\s*-\s*topic$/i, '').replace(/(?<=\S)\s*vevo$/i, '').replace(/\s+official$/i, '').trim();
    return Object.assign({}, t, { title: ti, artist: ar || t.artist });
  }
  const lyQuery = t0 => { const t = lySong(t0), p = lyArtistPart(t); return ((lyArtistOk(t.artist) && (!p || p.br) ? t.artist + ' ' : '') + lyNorm(t.title)).trim(); };
  // Every source returns [{src, trackName, artistName, duration, syncedLyrics?, plainLyrics?, load?}]. load() fills plainLyrics for sources that need a second request.
  const LY_SRC = {
    lrclib: { name: 'LRCLIB', auto: 1, async find(q) {
      const r = await fetch('https://lrclib.net/api/search?q=' + encodeURIComponent(q)); if (!r.ok) throw new Error('HTTP ' + r.status); const j = await r.json();
      return (Array.isArray(j) ? j : []).filter(it => it.plainLyrics || it.syncedLyrics).map(it => ({ src: 'LRCLIB', trackName: it.trackName, artistName: it.artistName, duration: it.duration, syncedLyrics: it.syncedLyrics, plainLyrics: it.plainLyrics }));
    } },
    ovh: { name: 'Lyrics.ovh', auto: 1, async find(q) {
      const r = await fetch('https://api.lyrics.ovh/suggest/' + encodeURIComponent(q)); if (!r.ok) throw new Error('HTTP ' + r.status); const j = await r.json();
      return (j.data || []).slice(0, 6).map(d => { const it = { src: 'Lyrics.ovh', trackName: d.title_short || d.title, artistName: d.artist && d.artist.name, duration: d.duration };
        it.load = async () => { const x = await fetch('https://api.lyrics.ovh/v1/' + encodeURIComponent(it.artistName || '') + '/' + encodeURIComponent(it.trackName || '')); if (!x.ok) throw new Error('HTTP ' + x.status); const k = await x.json(); it.plainLyrics = String(k.lyrics || '').replace(/\r/g, '').replace(/^Paroles de la chanson[^\n]*\n/i, '').trim(); };
        return it; });
    } },
    textyl: { name: 'Textyl', auto: 0, async find(q) {   // timed lyrics, no title in the reply, so it is only used when the person searches by hand
      const r = await fetch('https://api.textyl.co/api/lyrics?q=' + encodeURIComponent(q)); if (r.status === 404) return []; if (!r.ok) throw new Error('HTTP ' + r.status); const j = await r.json();
      return Array.isArray(j) && j.length ? [{ src: 'Textyl', trackName: q, artistName: '', syncedLyrics: j.map(x => lyLrcLine(+x.seconds || 0, String(x.lyrics || ''))).join('\n') }] : [];
    } }
  };
  async function lyEnsure(it) { if (it.load) { const f = it.load; it.load = null; try { await f(); } catch (e) { it.plainLyrics = ''; throw e; } } }
  async function lySearch(q, keys) {
    const rs = await Promise.allSettled(keys.map(k => LY_SRC[k].find(q))), items = [], failed = [];
    rs.forEach((r, i) => { if (r.status === 'fulfilled') items.push(...r.value); else failed.push(LY_SRC[keys[i]].name); });
    return { items, failed };
  }
  // Translation. Both return an array the same length as lines (a line that could not be translated stays as it was).
  const lyChunks = (lines, max) => { const out = []; let cur = [], n = 0; lines.forEach((l, i) => { if (cur.length && n + l.length > max) { out.push(cur); cur = []; n = 0; } cur.push(i); n += l.length + 1; }); if (cur.length) out.push(cur); return out; };
  const lyWait = ms => new Promise(r => setTimeout(r, ms));
  async function lyTrNative(NT, lines, from, to, prog, alive) {
    const out = lines.slice();
    for (let a = 0; a < lines.length; a += 12) {
      if (!alive()) return null; prog(a, lines.length);
      const r = await NT.translate({ lines: lines.slice(a, a + 12), from: from || '', to });
      (r.lines || []).forEach((l, k) => { if (l && String(l).trim()) out[a + k] = String(l).trim(); });
    }
    return out;
  }
  async function lyTrAi(lines, to, ask, say, prog, alive) {
    const out = lines.slice(), sys = 'You translate song lyrics into ' + lyName(to) + '. The user sends numbered lines. Reply with the same numbered lines translated, one per line, same numbers. Keep the meaning and the feel. No notes, no extra text.';
    let done = 0;
    for (let a = 0; a < lines.length; a += 8) {
      if (!alive()) return null; prog(done, lines.length);
      const idx = lines.slice(a, a + 8).map((_, k) => a + k), r = await ask([{ role: 'system', content: sys }, { role: 'user', content: idx.map((i, k) => (k + 1) + '. ' + lines[i]).join('\n') }], { max_new_tokens: 420, do_sample: false, repetition_penalty: 1.05 }, say);
      String(r).split(/\r?\n/).forEach(l => { const m = /^\s*(\d+)[.)]\s*(.+)$/.exec(l); if (m && +m[1] >= 1 && +m[1] <= idx.length) out[idx[+m[1] - 1]] = m[2].trim(); });
      done += idx.length;
    }
    return out;
  }
  // Background fetch: while online, quietly saves lyrics for songs that have none, so they are there offline. Only a near-exact title (and artist or length) match is accepted.
  const lyParseLrc = txt => { const out = [], re = /\[(\d{1,3}):(\d{1,2})(?:[.:](\d{1,3}))?\]/g; String(txt).split(/\r?\n/).forEach(raw => { const st = []; let m, last = 0; re.lastIndex = 0; while ((m = re.exec(raw))) { st.push(+m[1] * 60 + +m[2] + (m[3] ? +m[3].padEnd(3, '0').slice(0, 3) / 1000 : 0)); last = re.lastIndex; } const tx = raw.slice(last).trim(); if (st.length && tx) st.forEach(s => out.push({ start: s, text: tx })); }); out.sort((a, b) => a.start - b.start); return out.map((c, i) => ({ start: c.start, end: out[i + 1] ? out[i + 1].start : c.start + 4, text: c.text })); };
  // lyTried: dbId -> the title that was looked up this session (a miss is retried once the title changes, or after the app reloads).
  // ppvLyAutoTitles (saved): dbId -> the title that lyrics were downloaded for. When the title changes, those lyrics are looked up again
  // and replaced if the new title finds a match. Lyrics from Whisper, files or the user's own search are never touched.
  let lyRunning = false, lyAgain = false; const lyTried = {};
  const lyKey = t => lyNorm(t.title);
  // Not 'ppvLyAuto': that key is the on/off switch for this feature.
  const lyAutoGet = () => { try { const m = JSON.parse(localStorage.getItem('ppvLyAutoTitles')); return m && typeof m === 'object' ? m : {}; } catch (e) { return {}; } };
  const lyAutoPut = m => { try { localStorage.setItem('ppvLyAutoTitles', JSON.stringify(m)); } catch (e) {} };
  async function lyPrefetch(enabled) {
    if (lyRunning) { lyAgain = true; return; }
    if (!enabled() || !navigator.onLine) return; const A = window.__ppApi, lyr = window.__ppLyrics; if (!A || !lyr || !A.tracks) return;
    lyRunning = true; lyAgain = false;
    try {
      let subs = {}; try { subs = JSON.parse(localStorage.getItem('playerSubtitles') || '{}') || {}; } catch (e) {}
      const tags = loadTags(), keys = Object.keys(LY_SRC).filter(k => LY_SRC[k].auto), auto = lyAutoGet();
      const todo = A.tracks().filter(t => {
        if (t.stem || t.dbId == null || !t.title || lyTried[t.dbId] === lyKey(t)) return false;
        if (!lyr.has(t.dbId) && !subs[t.dbId]) return true;                                    // no lyrics yet
        return auto[t.dbId] != null && auto[t.dbId] !== lyKey(t);                                // downloaded for an older title
      });
      for (const t of todo) {
        if (!enabled() || !navigator.onLine) break;
        // Videos: only with an artist (own or from the title), so a random clip never gets song lyrics. A music video is often longer
        // than the song (intro, outro), so a length mismatch is allowed for videos, but then only plain lyrics are saved:
        // synced lines would be shifted against the video.
        const q = lySong(t), vid = t.kind === 'video';
        const dur = tags[t.dbId] && tags[t.dbId].d || t.duration || 0, art = lyArtistOk(q.artist);
        if (!art && (vid || !dur)) { lyTried[t.dbId] = lyKey(t); continue; }   // title alone is too vague to trust
        const durOk = it => !dur || !it.duration || Math.abs(it.duration - dur) <= 4;
        const qs = [q], qc = lyStrip(q);                                // a miss is tried again with the junk taken out of the title
        if (lyNorm(qc.title) && (lyNorm(qc.title) !== lyNorm(q.title) || lyNorm(qc.artist) !== lyNorm(q.artist))) qs.push(qc);
        let got = null, offline = false;
        for (const q of qs) {
        const { items, failed } = await lySearch(lyQuery(q), keys); if (failed.length === keys.length) { offline = true; break; }   // offline or blocked: try again next time
        const tt = lyNorm(q.title), ta = lyNorm(q.artist), tt2 = lyArtistInTitle(q) ? lyTitleNoArtist(q) : '';
        const ok = items.filter(it => (lyNorm(it.trackName) === tt || (tt2 && lyNorm(it.trackName) === tt2)) && (!art || (() => { const a = lyNorm(it.artistName).replace(/ /g, ''), b = ta.replace(/ /g, ''); return !!a && (a === b || a.includes(b) || b.includes(a)); })()) && (durOk(it) || (vid && art)));
        const rank = it => (it.syncedLyrics && durOk(it) ? 2 : 0) + (durOk(it) ? 1 : 0);
        ok.sort((a, b) => rank(b) - rank(a));
        for (const it of ok) { try { await lyEnsure(it); } catch (e) { continue; } if (lyLines(it.syncedLyrics || it.plainLyrics || '').length >= 4) { got = it; break; } }
        if (got) break;
        }
        if (offline) break;
        lyTried[t.dbId] = lyKey(t);
        if (got) { try { if (got.syncedLyrics && durOk(got)) { const cues = lyParseLrc(got.syncedLyrics); lyr.set(t.dbId, got.syncedLyrics); if (cues.length) { try { A.setSubtitles(t.dbId, cues, 'Online.lrc'); } catch (e) {} } } else lyr.set(t.dbId, got.plainLyrics || lyLines(got.syncedLyrics || '').join('\n')); const m = lyAutoGet(); m[t.dbId] = lyKey(t); lyAutoPut(m); } catch (e) { console.warn('lyrics save failed', e); } }
        await lyWait(1500);
      }
    } catch (e) { console.warn('lyrics background fetch', e); }
    lyRunning = false;
    if (lyAgain) setTimeout(() => lyPrefetch(enabled), 1000);             // a title changed while this run was busy
  }
  // Every library save: if a title changed, remember what the old lyrics were downloaded for, then look the track up again.
  let lySeen = null;
  function lyTitlesChanged(enabled) {
    const A = window.__ppApi; if (!A || !A.tracks) return;
    const now = {}; A.tracks().forEach(t => { if (t.dbId != null) now[t.dbId] = lyKey(t); });
    if (!lySeen) { lySeen = now; return; }
    const changed = Object.keys(now).filter(id => lySeen[id] != null && lySeen[id] !== now[id]); lySeen = now;
    if (!changed.length) return;
    let subs = {}; try { subs = JSON.parse(localStorage.getItem('playerSubtitles') || '{}') || {}; } catch (e) {}
    const auto = lyAutoGet(); let upd = false;
    for (const id of changed) {                                         // lyrics downloaded before this was tracked are known by their 'Online.lrc' name
      const e = subs[id]; if (auto[id] == null && e && !Array.isArray(e) && e.n === 'Online.lrc') { auto[id] = '\u0000old'; upd = true; }
    }
    if (upd) lyAutoPut(auto);
    clearTimeout(lyTitlesChanged.tm); lyTitlesChanged.tm = setTimeout(() => lyPrefetch(enabled), 2500);   // wait for a batch rename to finish
  }
  let lyStarted = false;
  function lyStart(enabled) { if (lyStarted) return; lyStarted = true;
    lyTitlesChanged(enabled); window.addEventListener('pp-library-saved', () => lyTitlesChanged(enabled)); setTimeout(() => lyPrefetch(enabled), 20000); window.addEventListener('online', () => setTimeout(() => lyPrefetch(enabled), 4000)); }

