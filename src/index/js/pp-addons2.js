/* Press Play addons: optional ASS styling + remappable shortcuts (Settings > Subtitles & shortcuts) */
(function(){
  const anchor = document.getElementById('storage-section');
  if (!anchor) return;
  const ls = { g: k => { try { return localStorage.getItem(k); } catch(e){ return null; } }, s: (k, v) => { try { localStorage.setItem(k, v); } catch(e){} } };
  window.__ppAssOn = ls.g('ppAssStyle') === '1';
  let keyOn = ls.g('ppKeysOn') === '1', map = {};
  try { map = JSON.parse(ls.g('ppKeymap') || '{}'); } catch(e){}
  const ACTIONS = [
    ['play','Play / pause',{code:'Space',key:' '}], ['seekFwd','Seek +5 s',{code:'ArrowRight',key:'ArrowRight'}], ['seekBack','Seek −5 s',{code:'ArrowLeft',key:'ArrowLeft'}],
    ['next','Next track',{code:'ArrowRight',key:'ArrowRight',shiftKey:true}], ['prev','Previous track',{code:'ArrowLeft',key:'ArrowLeft',shiftKey:true}],
    ['fFwd','Frame forward',{code:'Period',key:'.'}], ['fBack','Frame back',{code:'Comma',key:','}], ['fit','Video fit',{code:'KeyA',key:'a'}], ['zoom','Video zoom',{code:'KeyZ',key:'z'}],
    ['mute','Mute',{code:'KeyM',key:'m'}], ['full','Fullscreen',{code:'KeyF',key:'f'}], ['vUp','Volume up',{code:'ArrowUp',key:'ArrowUp'}], ['vDn','Volume down',{code:'ArrowDown',key:'ArrowDown'}],
    ['b10','Back 10 s',{code:'KeyJ',key:'j'}], ['f10','Forward 10 s',{code:'KeyL',key:'l'}], ['sUp','Speed up',{code:'BracketRight',key:']'}], ['sDn','Speed down',{code:'BracketLeft',key:'['}], ['s1','Speed 1x',{code:'Backspace',key:'Backspace'}], ['snap','Save snapshot',{code:'KeyS',key:'s'}]
  ];
  const sec = document.createElement('div');
  sec.className = 'settings-section';
  sec.innerHTML =
    '<div class="settings-section-label">Subtitles &amp; shortcuts</div>' +
    '<div class="settings-row"><div class="settings-row-text"><div class="settings-row-title">ASS subtitle styling</div>' +
    '<div class="settings-row-sub">Shows styled .ass/.ssa subtitles (colors, fonts, positions). Reload the subtitle file after turning this on.</div></div>' +
    '<label class="settings-switch"><input type="checkbox" id="pp-ass-toggle"><span class="settings-switch-track"><span class="settings-switch-thumb"></span></span></label></div>' +
    '<div class="settings-row" style="margin-top:12px;"><div class="settings-row-text"><div class="settings-row-title">Custom shortcuts</div>' +
    '<div class="settings-row-sub">Add custom keys. They override the defaults.</div></div>' +
    '<label class="settings-switch"><input type="checkbox" id="pp-keys-toggle"><span class="settings-switch-track"><span class="settings-switch-thumb"></span></span></label></div>' +
    '<div id="pp-keys-list" style="display:none;margin-top:8px;"></div>';
  anchor.parentNode.insertBefore(sec, anchor);
  const at = sec.querySelector('#pp-ass-toggle'), kt = sec.querySelector('#pp-keys-toggle'), list = sec.querySelector('#pp-keys-list');
  at.checked = window.__ppAssOn; kt.checked = keyOn;
  at.onchange = () => { window.__ppAssOn = at.checked; ls.s('ppAssStyle', at.checked ? '1' : '0'); };
  kt.onchange = () => { keyOn = kt.checked; ls.s('ppKeysOn', keyOn ? '1' : '0'); list.style.display = keyOn ? '' : 'none'; };
  list.style.display = keyOn ? '' : 'none';
  let capturing = null;
  const nice = k => k === ' ' ? 'Space' : k;
  function paint(){
    list.innerHTML = '';
    ACTIONS.forEach(([id, name]) => {
      const r = document.createElement('div');
      r.style.cssText = 'display:flex;justify-content:space-between;align-items:center;padding:5px 0;font-size:12.5px;';
      const b = document.createElement('button');
      b.type = 'button'; b.textContent = capturing === id ? 'Press a key…' : (map[id] ? nice(map[id]) : '—');
      b.style.cssText = 'min-width:90px;background:var(--bg,#0c0d10);color:var(--text,#e8e8ea);border:1px solid var(--line,#232429);border-radius:6px;padding:5px 8px;cursor:pointer;font:inherit';
      b.onclick = () => { capturing = id; paint(); };
      r.innerHTML = '<span>' + name + '</span>'; r.appendChild(b); list.appendChild(r);
    });
    const rs = document.createElement('button');
    rs.type = 'button'; rs.textContent = 'Reset custom keys'; rs.className = 'full-row';
    rs.onclick = () => { map = {}; ls.s('ppKeymap', '{}'); paint(); };
    list.appendChild(rs);
  }
  paint();
  const norm = k => k.length === 1 ? k.toLowerCase() : k;
  document.addEventListener('keydown', (e) => {
    if (capturing){
      e.preventDefault(); e.stopImmediatePropagation();
      if (e.key !== 'Escape'){
        if (e.key === 'Delete') delete map[capturing];
        else if (!['Shift','Control','Alt','Meta'].includes(e.key)){ Object.keys(map).forEach(x => { if (map[x] === norm(e.key)) delete map[x]; }); map[capturing] = norm(e.key); }
        else return;
        ls.s('ppKeymap', JSON.stringify(map));
      }
      capturing = null; paint(); return;
    }
    if (!keyOn || !e.isTrusted || e.ctrlKey || e.metaKey || e.altKey) return;
    const t = e.target.tagName; if (t === 'INPUT' || t === 'TEXTAREA' || t === 'SELECT') return;
    const hit = ACTIONS.find(a => map[a[0]] === norm(e.key));
    if (!hit) return;
    e.preventDefault(); e.stopImmediatePropagation();
    const d = hit[2];
    document.dispatchEvent(new KeyboardEvent('keydown', { key: d.key, code: d.code, shiftKey: !!d.shiftKey, bubbles: true, cancelable: true }));
  }, true);

  // ---- ASS positioned/effect layer: alignment (\an, \a), \pos, \fad, \fs, underline/strike ----
  (function(){
    const ov = document.getElementById('subtitle-overlay'), V = document.getElementById('video-el');
    if (!ov || !V) return;
    const layer = document.createElement('div');
    layer.id = 'pp-ass-layer';
    layer.style.cssText = 'position:absolute;inset:0;pointer-events:none;overflow:hidden;z-index:5';
    ov.parentNode.appendChild(layer);
    const els = new Map();
    window.__ppAssFrame = function(){
      const list = window.__ppAssOn ? (window.__ppSubFx || []) : [], t = window.__ppSubT || 0;
      els.forEach((el, c) => { if (list.indexOf(c) < 0){ el.remove(); els.delete(c); } });
      if (!list.length) return;
      const W = layer.clientWidth, H = layer.clientHeight, vw = V.videoWidth || W, vh = V.videoHeight || H;
      const sc = Math.min(W / vw, H / vh), vidW = vw * sc, vidH = vh * sc, ox = (W - vidW) / 2, oy = (H - vidH) / 2;
      list.forEach(c => {
        let el = els.get(c);
        if (!el){
          el = document.createElement('div'); el.textContent = c.text;
          el.style.cssText = 'position:absolute;white-space:pre-line;line-height:1.15;color:#fff;font-weight:600;text-shadow:0 0 3px #000,0 0 3px #000,1px 1px 2px #000';
          layer.appendChild(el); els.set(c, el);
        }
        const f = c.fx, st = c.style || {}, ry = f.ry || 288, rx = f.rx || ry * vw / vh;
        const col = (f.an - 1) % 3, row = Math.floor((f.an - 1) / 3);          // col 0 L,1 C,2 R; row 0 bottom,1 middle,2 top
        el.style.fontSize = Math.max(10, (f.fs || 20) / ry * vidH) + 'px';
        el.style.color = st.c || '#fff'; el.style.fontWeight = st.b ? '800' : '600'; el.style.fontStyle = st.i ? 'italic' : 'normal';
        el.style.textDecoration = [f.u ? 'underline' : '', f.s ? 'line-through' : ''].filter(Boolean).join(' ') || 'none';
        el.style.textAlign = ['left', 'center', 'right'][col];
        const tx = ['0%', '-50%', '-100%'][col], ty = ['-100%', '-50%', '0%'][row];
        if (f.x != null){
          el.style.left = (ox + f.x / rx * vidW) + 'px'; el.style.top = (oy + f.y / ry * vidH) + 'px';
          el.style.right = 'auto'; el.style.bottom = 'auto'; el.style.width = 'auto'; el.style.maxWidth = vidW + 'px';
          el.style.transform = 'translate(' + tx + ',' + ty + ')';
        } else {
          const ml = f.ml / rx * vidW, mr = f.mr / rx * vidW, mv = f.mv / ry * vidH;
          el.style.left = (ox + ml) + 'px'; el.style.width = (vidW - ml - mr) + 'px'; el.style.right = 'auto'; el.style.maxWidth = 'none';
          if (row === 0){ el.style.top = 'auto'; el.style.bottom = (H - oy - vidH + mv) + 'px'; el.style.transform = 'none'; }
          else if (row === 2){ el.style.bottom = 'auto'; el.style.top = (oy + mv) + 'px'; el.style.transform = 'none'; }
          else { el.style.bottom = 'auto'; el.style.top = (oy + vidH / 2) + 'px'; el.style.transform = 'translateY(-50%)'; }
        }
        let o = 1;
        if (f.fad){
          const a = f.fad[0] / 1000, b = f.fad[1] / 1000;
          if (a > 0 && t - c.start < a) o = Math.max(0, (t - c.start) / a);
          if (b > 0 && c.end - t < b) o = Math.min(o, Math.max(0, (c.end - t) / b));
        }
        el.style.opacity = o;
      });
    };
  })();
})();
