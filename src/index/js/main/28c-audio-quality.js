  // ================= Audio quality: hi-res output, decoder choice, and what is playing technically =================
  // Native engine only. The choices are saved on the Android side and used when its playback service next starts.
  (function(){
    const P = window.PPNative;
    if (!(P && P.enabled && P.audioInfo && P.audioOptions)) return;
    const npFmt = document.getElementById('np-format'), nowEl = document.getElementById('audio-quality-now');
    const note = document.getElementById('audio-quality-note');
    const hiTg = document.getElementById('hires-toggle'), aSel = document.getElementById('adec-select'), vSel = document.getElementById('vdec-select');
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
        if (i.outBits) out = ' Played at ' + (i.outFloat ? '32-bit float' : i.outBits + '-bit') + (i.rate ? ', ' + khz(i.rate) : '') + '.';
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
    const changed = () => { if (note && saved) note.hidden = !(hiTg.checked !== saved.hiRes || aSel.value !== saved.adec || vSel.value !== saved.vdec); };
    const save = () => { P.audioOptions.set({ hiRes: hiTg.checked, adec: aSel.value, vdec: vSel.value }).catch(() => {}); changed(); };
    if (hiTg && aSel && vSel){
      P.audioOptions.get().then(o => {
        // "saved" is what the running player was started with, so the restart note shows until the two agree
        saved = { hiRes: !!o.activeHiRes, adec: o.adec || 'auto', vdec: o.vdec || 'auto' };
        hiTg.checked = !!o.hiRes; aSel.value = o.adec || 'auto'; vSel.value = o.vdec || 'auto';
        changed();
      }).catch(() => {});
      hiTg.addEventListener('change', save); aSel.addEventListener('change', save); vSel.addEventListener('change', save);
    }
  })();
