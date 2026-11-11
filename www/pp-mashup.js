/*
 * Press Play mashup mode: the vocals of one song over the backing of another, tempo-matched.
 *
 * Uses what the app already has: stems made by the splitter ("<title> (Vocals)" / "(Instrumental)", flagged t.stem
 * with t.stemOf = the source song) and the tempo / key found by AI tagging (PPVocals.loadTags()).
 * Playback is two plain <audio> elements of its own, apart from the main player: the backing is the clock and
 * the vocals are kept on it. Works while the app is on screen.
 */
(function () {
  'use strict';
  var API = function () { return window.__ppApi; };
  var $ = function (id) { return document.getElementById(id); };
  var back = null, voc = null, timer = 0, open = false;
  var st = { rate: 1, auto: 1, nudge: 0, vVol: 1, bVol: 0.9, bpmV: 0, bpmB: 0 };

  function tagsOf(t) {
    try {
      var all = window.PPVocals && window.PPVocals.loadTags ? window.PPVocals.loadTags() : {};
      return all[t.stemOf] || all[t.dbId] || {};
    } catch (e) { return {}; }
  }
  // The speed that brings the vocals to the backing's tempo. Double/half tempo counts as the same beat, so the
  // answer is always the smallest change (never more than about 40% either way).
  function autoRate(bpmV, bpmB) {
    if (!bpmV || !bpmB) return 1;
    var r = bpmB / bpmV;
    while (r > 1.42) r /= 2;
    while (r < 0.71) r *= 2;
    return Math.round(r * 1000) / 1000;
  }
  // Camelot wheel: same code, one step round the wheel, or the same number in the other letter all blend.
  function keyFit(a, b) {
    var m = /^(\d+)([AB])$/.exec(a || ''), n = /^(\d+)([AB])$/.exec(b || '');
    if (!m || !n) return '';
    var d = Math.abs(+m[1] - +n[1]); d = Math.min(d, 12 - d);
    if (d === 0 && m[2] === n[2]) return 'same key';
    if ((d === 1 && m[2] === n[2]) || (d === 0 && m[2] !== n[2])) return 'keys blend';
    return 'keys may clash';
  }
  function isVocals(t) { return !!t.stem && /\(vocals\)\s*$/i.test(t.title || ''); }
  function isInst(t) { return !!t.stem && /\(instrumental\)\s*$/i.test(t.title || ''); }
  function fmt(s) { if (!isFinite(s) || s < 0) s = 0; var m = Math.floor(s / 60), x = Math.floor(s % 60); return m + ':' + (x < 10 ? '0' : '') + x; }

  function css() {
    if ($('ppm-css')) return;
    var s = document.createElement('style'); s.id = 'ppm-css';
    s.textContent =
      '#ppm{position:fixed;inset:0;z-index:9000;background:var(--bg,#0c0d10);color:var(--text,#eee);display:none;flex-direction:column;font-size:14px}' +
      '#ppm.open{display:flex}' +
      '#ppm header{display:flex;align-items:center;gap:10px;padding:14px 16px;border-bottom:1px solid var(--line,#2a2b31)}' +
      '#ppm header h2{margin:0;font-size:17px;flex:1}' +
      '#ppm .ppm-x{background:none;border:1px solid var(--line,#2a2b31);color:inherit;border-radius:8px;padding:7px 12px;font-size:14px}' +
      '#ppm .ppm-body{flex:1;overflow-y:auto;padding:16px;display:flex;flex-direction:column;gap:14px;max-width:560px;width:100%;margin:0 auto;box-sizing:border-box}' +
      '#ppm label{display:block;font-size:12px;color:var(--text-dim,#9a9ca5);margin-bottom:6px}' +
      '#ppm select{width:100%;padding:11px 10px;background:var(--bg-elev,#17181c);color:inherit;border:1px solid var(--line,#2a2b31);border-radius:8px;font-size:14px}' +
      '#ppm input[type=range]{width:100%}' +
      '#ppm .ppm-info{font-size:13px;color:var(--text-dim,#9a9ca5);line-height:1.5;min-height:20px}' +
      '#ppm .ppm-info b{color:var(--accent,#6ee7d0);font-weight:600}' +
      '#ppm .ppm-row{display:flex;align-items:center;gap:10px}' +
      '#ppm .ppm-row > span:first-child{flex:0 0 96px;font-size:12px;color:var(--text-dim,#9a9ca5)}' +
      '#ppm .ppm-row > span:last-child{flex:0 0 58px;text-align:right;font-size:12px;font-variant-numeric:tabular-nums}' +
      '#ppm .ppm-row input{flex:1}' +
      '#ppm .ppm-btns{display:flex;gap:8px;flex-wrap:wrap}' +
      '#ppm .ppm-btns button{flex:1;min-width:64px;padding:10px 6px;background:none;border:1px solid var(--line,#2a2b31);color:inherit;border-radius:8px;font-size:13px}' +
      '#ppm #ppm-play{flex:0 0 auto;align-self:center;width:72px;height:72px;border-radius:50%;border:2px solid var(--accent,#6ee7d0);background:none;color:var(--accent,#6ee7d0);font-size:15px;font-weight:600}' +
      '#ppm .ppm-time{display:flex;justify-content:space-between;font-size:12px;color:var(--text-dim,#9a9ca5);font-variant-numeric:tabular-nums}' +
      '#ppm .ppm-empty{padding:18px;border:1px dashed var(--line,#2a2b31);border-radius:10px;line-height:1.5;color:var(--text-dim,#9a9ca5)}';
    document.head.appendChild(s);
  }

  function build() {
    if ($('ppm')) return;
    css();
    var d = document.createElement('div'); d.id = 'ppm';
    d.innerHTML =
      '<header><h2>Mashup</h2><button class="ppm-x" id="ppm-close">Close</button></header>' +
      '<div class="ppm-body">' +
        '<div class="ppm-empty" id="ppm-empty" style="display:none"></div>' +
        '<div id="ppm-main" style="display:flex;flex-direction:column;gap:14px">' +
          '<div><label for="ppm-voc">Vocals from</label><select id="ppm-voc"></select></div>' +
          '<div><label for="ppm-back">Over the music of</label><select id="ppm-back"></select></div>' +
          '<div class="ppm-info" id="ppm-info"></div>' +
          '<button id="ppm-play">Play</button>' +
          '<div><input type="range" id="ppm-seek" min="0" max="100" step="0.1" value="0"><div class="ppm-time"><span id="ppm-cur">0:00</span><span id="ppm-dur">0:00</span></div></div>' +
          '<div class="ppm-row"><span>Vocals speed</span><input type="range" id="ppm-rate" min="0.6" max="1.6" step="0.005" value="1"><span id="ppm-rate-v">1.00x</span></div>' +
          '<div class="ppm-btns"><button id="ppm-rate-auto">Match tempo</button><button id="ppm-rate-1">Original speed</button></div>' +
          '<div class="ppm-row"><span>Vocals start</span><input type="range" id="ppm-nudge" min="-8" max="30" step="0.01" value="0"><span id="ppm-nudge-v">0.00s</span></div>' +
          '<div class="ppm-btns"><button data-n="-1">&minus; 1 beat</button><button data-n="-0.25">&minus; &frac14;</button><button data-n="0.25">+ &frac14;</button><button data-n="1">+ 1 beat</button></div>' +
          '<div class="ppm-row"><span>Vocals volume</span><input type="range" id="ppm-vvol" min="0" max="1" step="0.01" value="1"><span id="ppm-vvol-v">100%</span></div>' +
          '<div class="ppm-row"><span>Music volume</span><input type="range" id="ppm-bvol" min="0" max="1" step="0.01" value="0.9"><span id="ppm-bvol-v">90%</span></div>' +
          '<div class="ppm-info">Tempo is matched from the songs\' tags. Line the vocals up with the beat using Vocals start: slide it, or step by beats while it plays.</div>' +
        '</div>' +
      '</div>';
    document.body.appendChild(d);
    back = new Audio(); voc = new Audio();
    back.preload = voc.preload = 'auto';
    try { voc.preservesPitch = true; } catch (e) {}

    $('ppm-close').onclick = close;
    $('ppm-voc').onchange = function () { load(true); };
    $('ppm-back').onchange = function () { load(true); };
    $('ppm-play').onclick = toggle;
    $('ppm-seek').oninput = function () { if (isFinite(back.duration)) { back.currentTime = +this.value; syncVocals(true); paint(); } };
    $('ppm-rate').oninput = function () { st.rate = +this.value; applyRate(); syncVocals(true); };
    $('ppm-rate-auto').onclick = function () { st.rate = st.auto; applyRate(); syncVocals(true); };
    $('ppm-rate-1').onclick = function () { st.rate = 1; applyRate(); syncVocals(true); };
    $('ppm-nudge').oninput = function () { st.nudge = +this.value; paintNudge(); syncVocals(true); remember(); };
    d.querySelectorAll('[data-n]').forEach(function (b) {
      b.onclick = function () {
        var beat = st.bpmB ? 60 / st.bpmB : 0.5;
        st.nudge = Math.max(-8, Math.min(30, Math.round((st.nudge + (+b.dataset.n) * beat) * 1000) / 1000));
        $('ppm-nudge').value = st.nudge; paintNudge(); syncVocals(true); remember();
      };
    });
    $('ppm-vvol').oninput = function () { st.vVol = +this.value; voc.volume = st.vVol; $('ppm-vvol-v').textContent = Math.round(st.vVol * 100) + '%'; };
    $('ppm-bvol').oninput = function () { st.bVol = +this.value; back.volume = st.bVol; $('ppm-bvol-v').textContent = Math.round(st.bVol * 100) + '%'; };
    back.addEventListener('loadedmetadata', paint);
    back.addEventListener('ended', function () { voc.pause(); paint(); });
    back.addEventListener('pause', paint); back.addEventListener('play', paint);
    back.addEventListener('error', function () { toast('Could not open the music track for the mashup.'); });
    voc.addEventListener('error', function () { toast('Could not open the vocals for the mashup.'); });
    document.addEventListener('visibilitychange', function () { if (document.hidden && open && !back.paused) { back.pause(); voc.pause(); } });
  }
  function toast(m) { try { var s = $('toast-stack'); if (!s) return; var e = document.createElement('div'); e.className = 'toast'; e.textContent = m; s.appendChild(e); setTimeout(function () { e.remove(); }, 3500); } catch (x) {} }

  function byId(id) { var a = API(); return a ? a.tracks().filter(function (t) { return String(t.dbId) === String(id); })[0] : null; }
  function fill() {
    var a = API(), all = a ? a.tracks().filter(function (t) { return t.kind !== 'video' && t.url; }) : [];
    var vs = all.filter(isVocals), insts = all.filter(isInst), songs = all.filter(function (t) { return !t.stem; });
    var opt = function (t, label) { var o = document.createElement('option'); o.value = t.dbId; o.textContent = label || t.title || 'Untitled'; return o; };
    var sv = $('ppm-voc'), sb = $('ppm-back'), pv = sv.value, pb = sb.value;
    sv.innerHTML = ''; sb.innerHTML = '';
    vs.forEach(function (t) { sv.appendChild(opt(t, (t.stemSrc || t.title).replace(/\s*\(vocals\)\s*$/i, ''))); });
    if (insts.length) { var g1 = document.createElement('optgroup'); g1.label = 'Instrumentals (split)'; insts.forEach(function (t) { g1.appendChild(opt(t, (t.stemSrc || t.title).replace(/\s*\(instrumental\)\s*$/i, ''))); }); sb.appendChild(g1); }
    if (songs.length) { var g2 = document.createElement('optgroup'); g2.label = 'Whole songs (their own vocals stay in)'; songs.forEach(function (t) { g2.appendChild(opt(t)); }); sb.appendChild(g2); }
    var ok = vs.length > 0 && (insts.length + songs.length) > 0;
    $('ppm-main').style.display = ok ? 'flex' : 'none';
    var em = $('ppm-empty'); em.style.display = ok ? 'none' : 'block';
    if (!ok) em.textContent = vs.length ? 'Add another song to use as the music.' : 'A mashup needs the vocals of a song on their own. Split a song first (Library, then Split vocals) and come back: its vocals will be listed here.';
    if (pv && byId(pv)) sv.value = pv;
    if (pb && byId(pb)) sb.value = pb;
    else if (ok) {                                 // default: music from a different song than the vocals
      var v0 = byId(sv.value), other = insts.concat(songs).filter(function (t) { return (t.stemOf || t.dbId) !== (v0.stemOf || v0.dbId); })[0];
      if (other) sb.value = other.dbId;
    }
    return ok;
  }
  function pairKey() { return 'ppMashup:' + $('ppm-voc').value + '>' + $('ppm-back').value; }
  function remember() { try { localStorage.setItem(pairKey(), JSON.stringify({ n: st.nudge, r: st.rate })); } catch (e) {} }

  function load(stop) {
    var v = byId($('ppm-voc').value), b = byId($('ppm-back').value);
    if (!v || !b) return;
    if (stop) { back.pause(); voc.pause(); }
    var tv = tagsOf(v), tb = tagsOf(b);
    st.bpmV = +tv.bpm || 0; st.bpmB = +tb.bpm || 0;
    st.auto = autoRate(st.bpmV, st.bpmB);
    st.rate = st.auto; st.nudge = 0;
    try { var sv = JSON.parse(localStorage.getItem(pairKey()) || 'null'); if (sv) { if (isFinite(sv.n)) st.nudge = sv.n; if (sv.r > 0.5 && sv.r < 2) st.rate = sv.r; } } catch (e) {}
    if (back.getAttribute('src') !== b.url) back.src = b.url;
    if (voc.getAttribute('src') !== v.url) voc.src = v.url;
    back.volume = st.bVol; voc.volume = st.vVol;
    $('ppm-nudge').value = st.nudge; paintNudge();
    applyRate();
    var bits = [];
    if (st.bpmV && st.bpmB) {
      var pct = Math.round((st.auto - 1) * 100);
      bits.push('Vocals <b>' + st.bpmV + ' BPM</b>, music <b>' + st.bpmB + ' BPM</b>: vocals ' + (pct === 0 ? 'already match' : (pct > 0 ? 'sped up ' : 'slowed ') + Math.abs(pct) + '%') + '.');
    } else {
      bits.push('Tempo is not known for ' + (!st.bpmV && !st.bpmB ? 'either song' : !st.bpmV ? 'the vocals\' song' : 'the music') + '. Tag it (Library, AI tagging) to match automatically, or set Vocals speed by ear.');
    }
    var kf = keyFit(tv.ck, tb.ck);
    if (kf) bits.push((tv.key || tv.ck) + ' over ' + (tb.key || tb.ck) + ': <b>' + kf + '</b>.');
    $('ppm-info').innerHTML = bits.join(' ');
    $('ppm-rate-auto').disabled = !(st.bpmV && st.bpmB);
    paint();
  }
  function applyRate() {
    voc.playbackRate = st.rate;
    $('ppm-rate').value = st.rate; $('ppm-rate-v').textContent = st.rate.toFixed(2) + 'x';
    remember();
  }
  function paintNudge() { $('ppm-nudge-v').textContent = (st.nudge >= 0 ? '+' : '') + st.nudge.toFixed(2) + 's'; }

  // Where the vocals should be for the backing's current position. Negative = the vocals have not come in yet.
  function vocTarget() { return (back.currentTime - st.nudge) * st.rate; }
  function syncVocals(hard) {
    if (!voc.src) return;
    var want = vocTarget(), dur = voc.duration;
    if (want < 0 || (isFinite(dur) && want >= dur)) { if (!voc.paused) voc.pause(); return; }
    var err = voc.currentTime - want;
    if (hard || Math.abs(err) > 0.12) { try { voc.currentTime = want; } catch (e) {} voc.playbackRate = st.rate; }
    else if (Math.abs(err) > 0.02) voc.playbackRate = st.rate * (err > 0 ? 0.97 : 1.03);   // ease back on to the beat without a jump
    else voc.playbackRate = st.rate;
    if (!back.paused && voc.paused) voc.play().catch(function () {});
    if (back.paused && !voc.paused) voc.pause();
  }
  function paint() {
    if (!open) return;
    var d = back.duration;
    $('ppm-play').textContent = back.paused ? 'Play' : 'Pause';
    if (isFinite(d) && d > 0) { $('ppm-seek').max = d; $('ppm-dur').textContent = fmt(d); }
    $('ppm-seek').value = back.currentTime || 0;
    $('ppm-cur').textContent = fmt(back.currentTime);
  }
  function stopMainPlayer() {
    try { var p = $('play-btn'); if (p && p.classList.contains('is-playing')) p.click(); } catch (e) {}
  }
  function toggle() {
    if (!back.src) load(false);
    if (back.paused) {
      stopMainPlayer();
      back.play().then(function () { syncVocals(true); }).catch(function () { toast('Could not start the mashup.'); });
    } else { back.pause(); voc.pause(); }
    paint();
  }
  function show() {
    build();
    open = true;
    $('ppm').classList.add('open');
    if (fill()) load(false);
    clearInterval(timer);
    timer = setInterval(function () { if (!back.paused) syncVocals(false); paint(); }, 200);
  }
  function close() {
    open = false;
    clearInterval(timer); timer = 0;
    if (back) { back.pause(); voc.pause(); }
    var d = $('ppm'); if (d) d.classList.remove('open');
  }
  window.PPMashup = { open: show, close: close, _els: function () { return [back, voc]; }, _autoRate: autoRate, _keyFit: keyFit };

  function wire() {
    var b = $('mashup-btn'); if (b) b.addEventListener('click', show);
    // starting the main player again ends the mashup's sound, so the two never play over each other
    ['audio', 'video-el'].forEach(function (id) { var el = $(id); if (el) el.addEventListener('play', function () { if (back && !back.paused) { back.pause(); voc.pause(); } }); });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', wire); else wire();
})();
