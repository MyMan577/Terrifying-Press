  // ---------- Lossless MP4/MOV trimmer (stream copy) ----------
  // Reads the source's sample tables, copies the raw bytes of the chosen range
  // (starting at the keyframe at/before the start point) and writes a fresh MP4
  // index around them. An edit list then hides the lead-in frames so the clip
  // begins exactly at the chosen start time. Nothing is decoded or re-encoded,
  // so it is near-instant and the quality is bit-for-bit the original's.
  const MP4T = (() => {
    const fourcc = (u8, o) => String.fromCharCode(u8[o], u8[o+1], u8[o+2], u8[o+3]);
    const dvOf = (u8) => new DataView(u8.buffer, u8.byteOffset, u8.byteLength);

    function readBoxes(u8, start, end){
      const out = [];
      const dv = dvOf(u8);
      let p = start;
      while (p + 8 <= end){
        let size = dv.getUint32(p);
        const type = fourcc(u8, p + 4);
        let hdr = 8;
        if (size === 1){ size = Number(dv.getBigUint64(p + 8)); hdr = 16; }
        else if (size === 0){ size = end - p; }
        if (size < hdr || p + size > end) break;
        out.push({ type, start: p, hdr, size, data: p + hdr, end: p + size });
        p += size;
      }
      return out;
    }
    const kids = (u8, box) => readBoxes(u8, box.data, box.end);
    const child = (u8, box, type) => kids(u8, box).find(b => b.type === type);

    // Cheap check of the first bytes: does this look like an ISO/QuickTime file?
    async function looksLikeMp4(blob){
      if (!blob || blob.size < 12) return false;
      const h = new Uint8Array(await blob.slice(0, 12).arrayBuffer());
      const t = fourcc(h, 4);
      return t === 'ftyp' || t === 'moov' || t === 'mdat' || t === 'wide' || t === 'free' || t === 'skip';
    }

    // Walk top-level boxes with tiny reads until the moov box is found, so the
    // (potentially multi-GB) media data is never loaded into memory.
    async function readMoov(blob){
      let pos = 0, guard = 0;
      const size = blob.size;
      while (pos + 8 <= size && guard++ < 100000){
        const head = new Uint8Array(await blob.slice(pos, Math.min(size, pos + 16)).arrayBuffer());
        const dv = dvOf(head);
        let bs = dv.getUint32(0);
        const type = fourcc(head, 4);
        let hdr = 8;
        if (bs === 1){
          if (head.length < 16) break;
          bs = Number(dv.getBigUint64(8)); hdr = 16;
        } else if (bs === 0){ bs = size - pos; }
        if (bs < hdr) break;
        if (type === 'moov') return new Uint8Array(await blob.slice(pos, pos + bs).arrayBuffer());
        pos += bs;
      }
      return null;
    }

    function parseTrack(u8, trak){
      const dv = dvOf(u8);
      const tkhd = child(u8, trak, 'tkhd');
      const mdia = child(u8, trak, 'mdia');
      if (!tkhd || !mdia) return null;
      const tv = u8[tkhd.data];
      const mOff = tkhd.data + (tv === 1 ? 52 : 40);
      const t = {
        matrix: u8.slice(mOff, mOff + 36),
        width: dv.getUint32(mOff + 36),
        height: dv.getUint32(mOff + 40),
        volume: dv.getUint16(tkhd.data + (tv === 1 ? 48 : 36))
      };
      const mdhd = child(u8, mdia, 'mdhd');
      const hdlr = child(u8, mdia, 'hdlr');
      const minf = child(u8, mdia, 'minf');
      if (!mdhd || !hdlr || !minf) return null;
      const mv = u8[mdhd.data];
      t.timescale = dv.getUint32(mdhd.data + (mv === 1 ? 20 : 12));
      t.lang = dv.getUint16(mdhd.data + (mv === 1 ? 32 : 20));
      t.handler = fourcc(u8, hdlr.data + 8);
      if (t.handler !== 'vide' && t.handler !== 'soun') return null;
      t.hdlrRaw = u8.subarray(hdlr.start, hdlr.end);

      const stbl = child(u8, minf, 'stbl');
      if (!stbl) return null;
      const mh = kids(u8, minf).find(b => b.type === 'vmhd' || b.type === 'smhd');
      t.mediaHeaderRaw = mh ? u8.subarray(mh.start, mh.end) : null;
      const dinf = child(u8, minf, 'dinf');
      t.dinfRaw = dinf ? u8.subarray(dinf.start, dinf.end) : null;

      const b = {};
      kids(u8, stbl).forEach(x => { b[x.type] = x; });
      if (!b.stsd || !b.stts || !b.stsc || !b.stsz || !(b.stco || b.co64)) return null;
      t.stsdRaw = u8.subarray(b.stsd.start, b.stsd.end);

      // sizes
      const szv = b.stsz.data + 4;
      const fixed = dv.getUint32(szv);
      const n = dv.getUint32(szv + 4);
      const size = new Uint32Array(n);
      for (let i = 0; i < n; i++) size[i] = fixed ? fixed : dv.getUint32(szv + 8 + i * 4);
      t.n = n;
      t.size = size;

      // timing
      const delta = new Uint32Array(n);
      const dts = new Float64Array(n);
      {
        const cnt = dv.getUint32(b.stts.data + 4);
        let p = b.stts.data + 8, i = 0, acc = 0;
        for (let e = 0; e < cnt && i < n; e++, p += 8){
          const c = dv.getUint32(p), d = dv.getUint32(p + 4);
          for (let j = 0; j < c && i < n; j++, i++){ delta[i] = d; dts[i] = acc; acc += d; }
        }
      }
      t.delta = delta; t.dts = dts;
      const cto = new Int32Array(n);
      if (b.ctts){
        const cnt = dv.getUint32(b.ctts.data + 4);
        let p = b.ctts.data + 8, i = 0;
        for (let e = 0; e < cnt && i < n; e++, p += 8){
          const c = dv.getUint32(p), o = dv.getInt32(p + 4);
          for (let j = 0; j < c && i < n; j++, i++) cto[i] = o;
        }
      }
      t.cto = cto;
      const sync = new Uint8Array(n);
      if (b.stss){
        const cnt = dv.getUint32(b.stss.data + 4);
        for (let e = 0; e < cnt; e++){
          const s = dv.getUint32(b.stss.data + 8 + e * 4) - 1;
          if (s >= 0 && s < n) sync[s] = 1;
        }
      } else sync.fill(1);
      t.sync = sync;

      // byte offsets
      const chunkCount = dv.getUint32((b.stco || b.co64).data + 4);
      const is64 = !b.stco;
      const stscCnt = dv.getUint32(b.stsc.data + 4);
      const stsc = [];
      for (let e = 0; e < stscCnt; e++){
        const p = b.stsc.data + 8 + e * 12;
        stsc.push([dv.getUint32(p), dv.getUint32(p + 4)]);
      }
      const off = new Float64Array(n);
      {
        let si = 0, e = 0;
        for (let c = 1; c <= chunkCount && si < n; c++){
          while (e + 1 < stsc.length && stsc[e + 1][0] <= c) e++;
          const spc = stsc[e][1];
          const cb = (b.stco || b.co64).data + 8;
          let o = is64 ? Number(dv.getBigUint64(cb + (c - 1) * 8)) : dv.getUint32(cb + (c - 1) * 4);
          for (let j = 0; j < spc && si < n; j++, si++){ off[si] = o; o += size[si]; }
        }
      }
      t.off = off;

      // existing edit list -> presentation offset (e.g. B-frame delay, AAC priming)
      t.offset0 = 0;
      const edts = child(u8, trak, 'edts');
      const elst = edts && child(u8, edts, 'elst');
      if (elst){
        const ev = u8[elst.data];
        const cnt = dv.getUint32(elst.data + 4);
        let p = elst.data + 8;
        for (let e = 0; e < cnt; e++){
          const mt = ev === 1 ? Number(dv.getBigInt64(p + 8)) : dv.getInt32(p + 4);
          if (mt >= 0){ t.offset0 = mt; break; }
          p += ev === 1 ? 20 : 12;
        }
      }
      return t;
    }

    // ----- box writing helpers -----
    const cat = (arr) => {
      let len = 0; arr.forEach(a => { len += a.length; });
      const out = new Uint8Array(len);
      let p = 0; arr.forEach(a => { out.set(a, p); p += a.length; });
      return out;
    };
    const u32 = (v) => { const a = new Uint8Array(4); new DataView(a.buffer).setUint32(0, v >>> 0); return a; };
    const i32 = (v) => { const a = new Uint8Array(4); new DataView(a.buffer).setInt32(0, v | 0); return a; };
    const u16 = (v) => { const a = new Uint8Array(2); new DataView(a.buffer).setUint16(0, v & 0xffff); return a; };
    const zeros = (n) => new Uint8Array(n);
    const str4 = (s) => Uint8Array.from([s.charCodeAt(0), s.charCodeAt(1), s.charCodeAt(2), s.charCodeAt(3)]);
    const box = (type, ...parts) => {
      const body = cat(parts);
      const out = new Uint8Array(8 + body.length);
      new DataView(out.buffer).setUint32(0, out.length);
      out.set(str4(type), 4);
      out.set(body, 8);
      return out;
    };
    const full = (type, ver, flags, ...parts) => box(type, u32(((ver & 0xff) << 24) | (flags & 0xffffff)), ...parts);
    const IDENTITY = cat([u32(0x00010000), u32(0), u32(0), u32(0), u32(0x00010000), u32(0), u32(0), u32(0), u32(0x40000000)]);

    function buildTrackBox(tr, id, mdatStart, use64){
      const segMs = tr.segMs;
      const tkhd = full('tkhd', 0, 3,
        u32(0), u32(0), u32(id), u32(0), u32(segMs), zeros(8),
        u16(0), u16(0), u16(tr.handler === 'soun' ? 0x0100 : 0), u16(0),
        tr.matrix || IDENTITY, u32(tr.width), u32(tr.height));
      const edts = box('edts', full('elst', 0, 0, u32(1), u32(segMs), i32(tr.mediaTime), u32(0x00010000)));

      const mdhd = full('mdhd', 0, 0, u32(0), u32(0), u32(tr.timescale), u32(tr.mediaDuration), u16(tr.lang), u16(0));

      // stts (run-length)
      const runs = [];
      for (let i = 0; i < tr.cnt; i++){
        const d = tr.delta[i];
        if (runs.length && runs[runs.length - 1][1] === d) runs[runs.length - 1][0]++;
        else runs.push([1, d]);
      }
      const stts = new Uint8Array(8 + runs.length * 8);
      { const v = dvOf(stts); v.setUint32(4, runs.length); runs.forEach((r, i) => { v.setUint32(8 + i * 8, r[0]); v.setUint32(12 + i * 8, r[1]); }); }
      const sttsBox = box('stts', stts);

      // ctts (only if needed)
      let cttsBox = new Uint8Array(0);
      if (tr.cto.some(x => x !== 0)){
        const cr = [];
        let neg = false;
        for (let i = 0; i < tr.cnt; i++){
          const o = tr.cto[i]; if (o < 0) neg = true;
          if (cr.length && cr[cr.length - 1][1] === o) cr[cr.length - 1][0]++;
          else cr.push([1, o]);
        }
        const c = new Uint8Array(8 + cr.length * 8);
        const v = dvOf(c); c[0] = neg ? 1 : 0; v.setUint32(4, cr.length);
        cr.forEach((r, i) => { v.setUint32(8 + i * 8, r[0]); v.setInt32(12 + i * 8, r[1]); });
        cttsBox = box('ctts', c);
      }

      // stss (only if not all sync)
      let stssBox = new Uint8Array(0);
      let allSync = true;
      for (let i = 0; i < tr.cnt; i++) if (!tr.sync[i]){ allSync = false; break; }
      if (!allSync){
        const idx = [];
        for (let i = 0; i < tr.cnt; i++) if (tr.sync[i]) idx.push(i + 1);
        const s = new Uint8Array(8 + idx.length * 4);
        const v = dvOf(s); v.setUint32(4, idx.length);
        idx.forEach((x, i) => v.setUint32(8 + i * 4, x));
        stssBox = box('stss', s);
      }

      // stsc
      const sc = [];
      tr.chunks.forEach((c, i) => { if (!sc.length || sc[sc.length - 1][1] !== c.count) sc.push([i + 1, c.count]); });
      const stscB = new Uint8Array(8 + sc.length * 12);
      { const v = dvOf(stscB); v.setUint32(4, sc.length); sc.forEach((e, i) => { v.setUint32(8 + i * 12, e[0]); v.setUint32(12 + i * 12, e[1]); v.setUint32(16 + i * 12, 1); }); }
      const stscBox = box('stsc', stscB);

      // stsz
      const stszB = new Uint8Array(12 + tr.cnt * 4);
      { const v = dvOf(stszB); v.setUint32(8, tr.cnt); for (let i = 0; i < tr.cnt; i++) v.setUint32(12 + i * 4, tr.size[i]); }
      const stszBox = box('stsz', stszB);

      // stco / co64
      let stcoBox;
      if (use64){
        const b = new Uint8Array(8 + tr.chunks.length * 8);
        const v = dvOf(b); v.setUint32(4, tr.chunks.length);
        tr.chunks.forEach((c, i) => v.setBigUint64(8 + i * 8, BigInt(mdatStart + c.rel)));
        stcoBox = box('co64', b);
      } else {
        const b = new Uint8Array(8 + tr.chunks.length * 4);
        const v = dvOf(b); v.setUint32(4, tr.chunks.length);
        tr.chunks.forEach((c, i) => v.setUint32(8 + i * 4, mdatStart + c.rel));
        stcoBox = box('stco', b);
      }

      const stbl = box('stbl', tr.stsdRaw, sttsBox, cttsBox, stssBox, stscBox, stszBox, stcoBox);
      const dinf = tr.dinfRaw || box('dinf', full('dref', 0, 0, u32(1), full('url ', 0, 1)));
      const mh = tr.mediaHeaderRaw || (tr.handler === 'soun' ? full('smhd', 0, 0, u16(0), u16(0)) : full('vmhd', 0, 1, zeros(8)));
      const minf = box('minf', mh, dinf, stbl);
      const mdia = box('mdia', mdhd, tr.hdlrRaw, minf);
      return box('trak', tkhd, edts, mdia);
    }

    function buildMoov(trs, mdatStart, use64){
      const movDur = Math.max(...trs.map(t => t.segMs));
      const mvhd = full('mvhd', 0, 0,
        u32(0), u32(0), u32(1000), u32(movDur), u32(0x00010000), u16(0x0100), zeros(10),
        IDENTITY, zeros(24), u32(trs.length + 1));
      return box('moov', mvhd, ...trs.map((t, i) => buildTrackBox(t, i + 1, mdatStart, use64)));
    }

    // Everything a VideoDecoder needs from an MP4/MOV: the sample table, codec string and
    // codec config (avcC/hvcC), coded size and display rotation.
    async function readForDecode(blob){
      const moovBuf = await readMoov(blob);
      if (!moovBuf) throw new Error('This file has no MP4 index (moov).');
      const moov = readBoxes(moovBuf, 0, moovBuf.length)[0];
      if (child(moovBuf, moov, 'mvex')) throw new Error('Fragmented MP4 files are not supported by the fast encoder.');
      const trs = kids(moovBuf, moov).filter(b => b.type === 'trak').map(tk => parseTrack(moovBuf, tk)).filter(Boolean);
      const track = trs.find(t => t.handler === 'vide' && t.n > 0);
      if (!track) throw new Error('No video track found in this file.');
      const u8 = track.stsdRaw, dv = dvOf(u8);
      const entry = 16;                                   // first sample entry inside stsd
      const type = fourcc(u8, entry + 4);
      const esize = dv.getUint32(entry);
      const width = dv.getUint16(entry + 32), height = dv.getUint16(entry + 34);
      const subs = readBoxes(u8, entry + 86, Math.min(u8.length, entry + esize));
      const avcC = subs.find(b => b.type === 'avcC');
      const hvcC = subs.find(b => b.type === 'hvcC');
      let codec, description;
      if (avcC){
        const d = u8.subarray(avcC.data, avcC.end);
        codec = 'avc1.' + [d[1], d[2], d[3]].map(x => x.toString(16).padStart(2, '0')).join('');
        description = d.slice();
      } else if (hvcC){
        const d = u8.subarray(hvcC.data, hvcC.end);
        const ps = d[1] >> 6, tier = (d[1] >> 5) & 1, prof = d[1] & 31;
        const compat = ((d[2] << 24) | (d[3] << 16) | (d[4] << 8) | d[5]) >>> 0;
        let rev = 0;
        for (let i = 0; i < 32; i++) rev = ((rev << 1) | ((compat >>> i) & 1)) >>> 0;
        const cons = Array.from(d.subarray(6, 12));
        while (cons.length > 1 && cons[cons.length - 1] === 0) cons.pop();
        codec = (type === 'hev1' ? 'hev1' : 'hvc1') + '.' + (ps ? 'ABC'[ps - 1] : '') + prof + '.' + rev.toString(16) + '.' + (tier ? 'H' : 'L') + d[12] + cons.map(x => '.' + x.toString(16).toUpperCase()).join('');
        description = d.slice();
      } else {
        throw new Error('Only H.264 and HEVC sources are supported by the fast encoder.');
      }
      const mv = dvOf(track.matrix);
      let rot = Math.round(Math.atan2(mv.getInt32(4) / 65536, mv.getInt32(0) / 65536) * 180 / Math.PI / 90) * 90;
      rot = ((rot % 360) + 360) % 360;
      return { track, codec, description, width, height, rotation: rot };
    }

    // Returns { blob, startShiftSec } - the clip as a new MP4 Blob.
    async function trim(blob, startSec, endSec){
      const moovBuf = await readMoov(blob);
      if (!moovBuf) throw new Error('This file has no MP4 index (moov), so it cannot be copied losslessly.');
      const moov = readBoxes(moovBuf, 0, moovBuf.length)[0];
      if (child(moovBuf, moov, 'mvex')) throw new Error('Fragmented MP4 files cannot be copied losslessly.');
      const parsed = kids(moovBuf, moov).filter(b => b.type === 'trak').map(tk => parseTrack(moovBuf, tk)).filter(Boolean);
      const video = parsed.find(t => t.handler === 'vide' && t.n > 0);
      const audio = parsed.find(t => t.handler === 'soun' && t.n > 0);
      if (!video) throw new Error('No video track found in this file.');
      const trs = [video, audio].filter(Boolean);

      trs.forEach(t => {
        const ts = t.timescale;
        const S = Math.round(startSec * ts) + t.offset0;
        const E = Math.round(endSec * ts) + t.offset0;
        let k = -1;
        if (t.handler === 'vide'){
          for (let i = 0; i < t.n; i++){
            if (t.dts[i] > S && k >= 0) break;
            if (t.sync[i] && t.dts[i] + t.cto[i] <= S) k = i;
          }
          if (k < 0) { k = 0; while (k < t.n && !t.sync[k]) k++; if (k >= t.n) k = 0; }
        } else {
          for (let i = 0; i < t.n; i++){ if (t.dts[i] <= S) k = i; else break; }
          k = Math.max(0, k - 1); // one frame of decoder priming
        }
        let m = k;
        for (let i = k; i < t.n; i++){ if (t.dts[i] < E) m = i; else break; }

        t.cnt = m - k + 1;
        t.delta = t.delta.subarray(k, m + 1);
        t.cto = t.cto.subarray(k, m + 1);
        t.sync = t.sync.subarray(k, m + 1);
        t.size = t.size.subarray(k, m + 1);
        t.off = t.off.subarray(k, m + 1);
        const d0 = t.dts[k];
        let dur = 0; for (let i = 0; i < t.cnt; i++) dur += t.delta[i];
        t.mediaDuration = dur;
        t.mediaTime = Math.max(0, Math.round(S - d0));
        t.segMs = Math.max(1, Math.round((endSec - startSec) * 1000));
        t.firstSec = d0 / ts;

        // group samples into ~1s chunks so audio and video stay interleaved
        t.chunks = [];
        let cur = null, acc = 0;
        for (let i = 0; i < t.cnt; i++){
          if (!cur){ cur = { t, first: i, count: 0, size: 0, startSec: (t.dts[k + i] - d0) / ts, ranges: [] }; acc = 0; }
          cur.count++; cur.size += t.size[i]; acc += t.delta[i];
          const last = cur.ranges[cur.ranges.length - 1];
          if (last && last[1] === t.off[i]) last[1] += t.size[i];
          else cur.ranges.push([t.off[i], t.off[i] + t.size[i]]);
          if (acc >= ts || t.handler === 'soun' && cur.count >= 64 && acc >= ts * 0.5){ t.chunks.push(cur); cur = null; }
        }
        if (cur) t.chunks.push(cur);
      });

      // lay chunks out in time order
      const order = [];
      trs.forEach(t => t.chunks.forEach(c => order.push(c)));
      order.sort((a, b) => (a.startSec - b.startSec) || (a.t === video ? -1 : 1));
      let rel = 0;
      order.forEach(c => { c.rel = rel; rel += c.size; });
      const use64 = rel > 0xF0000000;
      const mdatHdr = (rel + 8 > 0xFFFFFFFF) ? 16 : 8;

      const ftyp = box('ftyp', str4('isom'), u32(512), str4('isom'), str4('iso2'), str4('mp41'));
      let moovOut = buildMoov(trs, 0, use64);
      const mdatStart = ftyp.length + moovOut.length + mdatHdr;
      moovOut = buildMoov(trs, mdatStart, use64);

      const mdatHead = mdatHdr === 8
        ? cat([u32(8 + rel), str4('mdat')])
        : cat([u32(1), str4('mdat'), (() => { const a = new Uint8Array(8); new DataView(a.buffer).setBigUint64(0, BigInt(16 + rel)); return a; })()]);

      const parts = [ftyp, moovOut, mdatHead];
      order.forEach(c => c.ranges.forEach(r => parts.push(blob.slice(r[0], r[1]))));
      return { blob: new Blob(parts, { type: 'video/mp4' }), leadInSec: Math.max(0, startSec - video.firstSec) };
    }

    return { looksLikeMp4, trim, readForDecode };
  })();

