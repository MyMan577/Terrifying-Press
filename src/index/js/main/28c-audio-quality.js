  // ================= Audio quality: hi-res output, decoder choice, and what is playing technically =================
  // Native engine only. The choices are saved on the Android side and used when its playback service next starts.
  (function(){
    const P = window.PPNative;
    if (!(P && P.enabled && P.audioInfo && P.audioOptions)) return;
    const npFmt = document.getElementById('np-format'), nowEl = document.getElementById('audio-quality-now');
    const note = document.getElementById('audio-quality-note');
    const hiTg = document.getElementById('hires-toggle'), upTg = document.getElementById('up16-toggle'), aSel = document.getElementById('adec-select'), vSel = document.getElementById('vdec-select');
    const CODEC = { 'audio/flac': 'FLAC', 'audio/mpeg': 'MP3', 'audio/mp4a-latm': 'AAC', 'audio/opus': 'Opus', 'audio/vorbis': 'Vorbis', 'audio/raw': 'PCM',
      'audio/alac': 'ALAC', 'audio/ac3': 'Dolby Digital', 'audio/eac3': 'Dolby Digital Plus', 'audio/amr-wb': 'AMR-WB', 'audio/3gpp': 'AMR', 'audio/x-ms-wma': 'WMA',
      'audio/mpeg-L2': 'MP2', 'audio/vnd.dts': 'DTS', 'audio/true-hd': 'TrueHD' };
    const khz = r => (r % 1000 === 0 ? r / 1000 : (r / 1000).toFixed(1)) + ' kHz';
    const chans = c => c === 1 ? 'mono' : c === 2 ? 'stereo' : c === 6 ? '5.1' : c === 8 ? '7.1' : c + ' channels';
    function clear(){ if (npFmt){ npFmt.hidden = true; npFmt.textContent = ''; } }
    function render(i){
      if (!i || !i.mime){ clear(); return; }
      const name = CODEC[i.mime] || String(i.mime).replace(/^audio\//, '').toUpperCase();
      const hi = (i.bits >= 24) || (i.rate > 48000);
      const parts = [name];
      if (i.bits) parts.push(i.bits + '-bit');
      if (i.rate) parts.push(khz(i.rate));
      if (npFmt){
        npFmt.innerHTML = (hi ? '<span class="hr">HI-RES</span>' : '') + escapeHtml(parts.join(' · '));
        npFmt.hidden = false;
      }
      if (nowEl){
        const full = parts.slice();
        if (i.ch) full.push(chans(i.ch));
        if (i.bitrate) full.push(Math.round(i.bitrate / 1000).toLocaleString() + ' kbps');
        let out = '';
        if (i.outBits) out = ' Played at ' + (i.outFloat ? '32-bit float' : i.outBits + '-bit') + (i.upconverted ? ' (upconverted from 16-bit)' : '') + (i.rate ? ', ' + khz(i.rate) : '') + '.';
        if (i.bits > 16 && !i.outFloat) out += i.hiRes ? '' : ' Turn on Hi-res output to play it at full depth.';
        nowEl.textContent = 'Now playing: ' + full.join(' · ') + '.' + (i.decoder ? ' Decoder: ' + i.decoder + '.' : '') + out;
      }
    }
    let timer = 0;
    function refresh(){
      clearTimeout(timer);
      timer = setTimeout(() => {
        if (currentIndex === -1 || !P.active()){ clear(); return; }
        P.audioInfo().then(render).catch(() => {});
      }, 600);
    }
    [audioEl, videoEl].forEach(el => ['playing', 'loadedmetadata', 'emptied'].forEach(ev => el.addEventListener(ev, refresh)));

    // Settings
    let saved = null;
    const changed = () => { if (note && saved) note.hidden = !(hiTg.checked !== saved.hiRes || (upTg && upTg.checked !== saved.up16) || aSel.value !== saved.adec || vSel.value !== saved.vdec); };
    const save = () => { P.audioOptions.set({ hiRes: hiTg.checked, up16: !!(upTg && upTg.checked), adec: aSel.value, vdec: vSel.value }).catch(() => {}); changed(); };
    if (hiTg && aSel && vSel){
      P.audioOptions.get().then(o => {
        // "saved" is what the running player was started with, so the restart note shows until the two agree
        saved = { hiRes: !!o.activeHiRes, up16: !!o.activeUp16, adec: o.adec || 'auto', vdec: o.vdec || 'auto' };
        hiTg.checked = !!o.hiRes; if (upTg) upTg.checked = !!o.up16; aSel.value = o.adec || 'auto'; vSel.value = o.vdec || 'auto';
        changed();
      }).catch(() => {});
      hiTg.addEventListener('change', save); if (upTg) upTg.addEventListener('change', save); aSel.addEventListener('change', save); vSel.addEventListener('change', save);
    }
  })();

  // ================= Save a high bit depth copy: a permanent 24-bit or 32-bit float WAV of the playing song =================
  // Decoded and written in the page with mediabunny (WebCodecs), so it works with or without the native engine. The original
  // file is left as it is; the copy is a new library track. For a video, the copy is its sound only.
  (function(){
    const btn = document.getElementById('hd-copy-btn'), sel = document.getElementById('hd-copy-bits'), msg = document.getElementById('hd-copy-msg');
    if (!btn || !sel) return;
    const MB = 'https://cdn.jsdelivr.net/npm/mediabunny@1.65.0/dist/bundles/mediabunny.min.mjs';
    const say = s => { if (msg){ msg.hidden = !s; msg.textContent = s || ''; } };
    let busy = false;
    btn.addEventListener('click', async () => {
      if (busy) return;
      const t = currentIndex !== -1 ? tracks[currentIndex] : null;
      if (!t || !t.url){ say('Play a song first, then save its copy.'); return; }
      if (t.remoteUrl){ say('A stream can’t be copied. Save the file to your phone first.'); return; }
      const bits = sel.value === '32' ? 32 : 24;
      busy = true; btn.disabled = true; say('Reading “' + (t.title || 'song') + '”…');
      try {
        const mb = await import(MB);
        const src = await (await fetch(t.url)).blob();
        const input = new mb.Input({ source: new mb.BlobSource(src), formats: mb.ALL_FORMATS });
        const output = new mb.Output({ format: new mb.WavOutputFormat(), target: new mb.BufferTarget() });
        const conv = await mb.Conversion.init({ input, output, video: { discard: true },
          audio: { codec: bits === 32 ? 'pcm-f32' : 'pcm-s24', forceTranscode: true } });
        if (!conv.isValid) throw new Error('this file’s sound can’t be decoded here');
        conv.onProgress = p => say('Converting… ' + Math.round(p * 100) + '%');
        await conv.execute();
        const name = String(t.title || 'Song').replace(/[\\/:*?"<>|]+/g, '_') + ' (' + (bits === 32 ? '32-bit float' : '24-bit') + ').wav';
        const file = new File([output.target.buffer], name, { type: 'audio/wav' });
        window.__ppApi.addLibraryFiles([file]);
        say('Added “' + name + '” to your library, ' + (file.size / 1048576).toFixed(1) + ' MB' + (t.kind === 'video' ? ' (the sound only)' : '') + '.');
      } catch(e){
        say('Could not make the copy: ' + ((e && e.message) || e) + '.');
        if (typeof ppCaught === 'function') ppCaught(e);
      }
      busy = false; btn.disabled = false;
    });
  })();
