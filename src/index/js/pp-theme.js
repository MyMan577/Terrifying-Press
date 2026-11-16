// ===================== Theme (Settings > Customize > Theme) =====================
// A theme is a handful of colours, a corner roundness and a font. From those this builds one <style> that sets
// the app's CSS variables (--bg, --accent, ...), the --g-xxxxxx variables the stylesheets use in place of their
// fixed dark greys, and --ui-round, which every border-radius is multiplied by. The CSS is also cached in
// localStorage so pp-theme-boot.js can put it in place before first paint.
// No theme saved = nothing is added and the app looks exactly as it always did.
(function(){
  'use strict';
  var KEY = 'ppThemeV1', CSS_KEY = 'ppThemeCssV1', BAR_KEY = 'ppThemeBarV1', SAVED_KEY = 'ppThemeSavedV1';
  var STOCK = { bg:'#0c0d10', surface:'#16171b', line:'#232429', text:'#e8e8ea', dim:'#8b8c93', accent:'#6ee7d0', danger:'#e0667a' };
  // Every fixed grey the stylesheets route through var(--g-xxxxxx, #xxxxxx). Keep in step with the CSS.
  var GREYS = ['0c0d10','101114','111216','131419','14151b','16171c','17181c','1a1b20','1c1d22','1c1e26','1d1e23',
               '1d1f26','1e1f26','22242a','23242c','2a2b31','2a2c33','2b2d35','333333'];
  var FONTS = {
    'default':   { label:'App default', css:null },
    'jakarta':   { label:'Plus Jakarta Sans', css:"'Plus Jakarta Sans','Inter',sans-serif" },
    'system':    { label:'Phone default (Roboto)', css:"Roboto,'Google Sans',sans-serif" },
    'condensed': { label:'Condensed', css:"'sans-serif-condensed','Roboto Condensed','Arial Narrow',sans-serif" },
    'serif':     { label:'Serif', css:"'Noto Serif','Droid Serif',Georgia,serif" },
    'mono':      { label:'Monospace', css:"'Roboto Mono','Droid Sans Mono',ui-monospace,monospace" },
    'casual':    { label:'Casual', css:"'Coming Soon',casual,cursive" },
    'script':    { label:'Handwritten', css:"'Dancing Script',cursive" }
  };
  var PRESETS = [
    { id:'default',  name:'Default' },
    { id:'midnight', name:'Midnight',  c:{ bg:'#0a0e1a', surface:'#121829', line:'#1f2840', text:'#e6ebf5', dim:'#8590a8', accent:'#6aa8ff', danger:'#ff6b81' } },
    { id:'amoled',   name:'True black', c:{ bg:'#000000', surface:'#0b0b0d', line:'#1a1a1e', text:'#f2f2f2', dim:'#8a8a90', accent:'#6ee7d0', danger:'#ff5c72' } },
    { id:'ember',    name:'Ember',     c:{ bg:'#120c0a', surface:'#1c1411', line:'#2e211c', text:'#f3e9e4', dim:'#a38f86', accent:'#ff8a4c', danger:'#ff5470' } },
    { id:'forest',   name:'Forest',    c:{ bg:'#0a110d', surface:'#111a15', line:'#1d2b23', text:'#e5efe8', dim:'#85998c', accent:'#7bd88f', danger:'#ff6b6b' } },
    { id:'grape',    name:'Grape',     c:{ bg:'#0f0b16', surface:'#181222', line:'#281e38', text:'#ece6f5', dim:'#978ba8', accent:'#b58cff', danger:'#ff6b9a' } },
    { id:'rose',     name:'Rose',      c:{ bg:'#140b0f', surface:'#1e1217', line:'#321e27', text:'#f5e6ec', dim:'#a8899a', accent:'#ff7aa8', danger:'#ff5c5c' } },
    { id:'gold',     name:'Gold',      c:{ bg:'#0e0e0c', surface:'#171714', line:'#262621', text:'#efeee6', dim:'#9a988a', accent:'#e8c15a', danger:'#ff6b6b' } },
    { id:'ocean',    name:'Ocean',     c:{ bg:'#071214', surface:'#0d1c1f', line:'#172e33', text:'#e2f1f2', dim:'#7f9fa3', accent:'#3fd0e0', danger:'#ff7070' } },
    { id:'mono',     name:'Mono',      c:{ bg:'#0d0d0d', surface:'#161616', line:'#262626', text:'#ededed', dim:'#8c8c8c', accent:'#e0e0e0', danger:'#ff6b6b' } }
  ];
  var COLOR_FIELDS = [
    ['accent',  'Accent',         'Buttons, sliders, highlights'],
    ['bg',      'Background',     'Behind everything'],
    ['surface', 'Panels',         'Cards, sidebar, menus'],
    ['line',    'Lines',          'Borders and dividers'],
    ['text',    'Text',           ''],
    ['dim',     'Secondary text', 'Hints, artists, times'],
    ['danger',  'Warning',        'Delete and error colour']
  ];

  // Style: the shape and feel of the bars, buttons and cards. '' or a missing key means the app's own look.
  var STYLE = [
    ['text',      'Size of Home and your pages', 'range', [85, 130, 5, 100, '%']],
    ['space',     'Room between sections', 'range', [50, 170, 10, 100, '%']],
    ['card',      'Thumbnails on Home', 'seg', [['','Auto'],['s','Small'],['m','Medium'],['l','Large'],['xl','Huge']]],
    ['head',      'Headings', 'seg', [['','Auto'],['light','Light'],['bold','Bold'],['heavy','Heavy']]],
    ['tabbar',    'Tab bar', 'seg', [['','Normal'],['icons','Icons only'],['labels','Words only'],['float','Floating']]],
    ['mini',      'Mini player', 'seg', [['','Normal'],['compact','Compact'],['accent','Accent'],['float','Floating']]],
    ['playShape', 'Play button shape', 'seg', [['','Circle'],['rounded','Rounded'],['square','Square']]],
    ['playFill',  'Play button fill', 'seg', [['','Standard'],['accent','Accent'],['gradient','Gradient'],['outline','Outline']]],
    ['accent2',   'Gradient’s second colour', 'color', '#b58cff'],
    ['seek',      'Seek bar', 'seg', [['','Normal'],['thin','Thin'],['thick','Thick'],['nothumb','No knob']]],
    ['glass',     'Bars at the bottom', 'seg', [['','Glass'],['off','Solid'],['strong','Extra blur']]],
    ['depth',     'Shadows', 'seg', [['','Normal'],['flat','Flat'],['deep','Deep']]]
  ];
  function cleanStyle(x){
    var out = {};
    if (!x || typeof x !== 'object') return out;
    STYLE.forEach(function(f){
      var v = x[f[0]];
      if (f[2] === 'range'){ v = +v; if (isFinite(v) && v !== f[3][3]) out[f[0]] = Math.max(f[3][0], Math.min(f[3][1], Math.round(v))); }
      else if (f[2] === 'seg'){ if (v && f[3].some(function(o){ return o[0] === v; })) out[f[0]] = v; }
      else if (f[2] === 'color'){ if (okHex(v)) out[f[0]] = v.toLowerCase(); }
    });
    return out;
  }
  function styleCss(st, c){
    var P = 'html[data-pp-theme] body', css = [], r = 'var(--ui-round,1)';
    if (st.text){ css.push(P + ' #pl-home > *,' + P + ' #pw-page > *{zoom:' + (st.text / 100) + '}'); }
    if (st.space){ var k = st.space / 100;
      css.push(P + ' #pl-home .ph-sec,' + P + ' #pw-page .ph-sec{margin-top:' + Math.round(22 * k) + 'px!important}',
               P + ' .pw-row-box + .pw-row-box{margin-top:' + Math.round(12 * k) + 'px}',
               P + ' #pl-home .ph-chips{padding-top:' + Math.round(14 * k) + 'px}'); }
    if (st.card){ var w = { s:116, m:156, l:204, xl:256 }[st.card];
      css.push(P + ' #pl-home .ph-row:not(.expanded) .ph-card,' + P + ' #pw-page .ph-row:not(.expanded) .ph-card{flex-basis:' + w + 'px!important;width:' + w + 'px}'); }
    if (st.head){ var fw = { light:500, bold:700, heavy:850 }[st.head];
      css.push(P + ' .ph-app-title,' + P + ' .ph-sec-head h2,' + P + ' .pw-title,' + P + ' .pp-sg-title{font-weight:' + fw + '!important}'); }
    if (st.glass === 'off') css.push(P + ' #pl-tabbar,' + P + ' #pl-mini{-webkit-backdrop-filter:none!important;backdrop-filter:none!important;background:var(--bg-elev)!important}');
    if (st.glass === 'strong') css.push(P + ' #pl-tabbar,' + P + ' #pl-mini{-webkit-backdrop-filter:blur(40px) saturate(1.9)!important;backdrop-filter:blur(40px) saturate(1.9)!important;background:color-mix(in srgb, var(--bg-elev) 50%, transparent)!important}');
    if (st.tabbar === 'icons') css.push(P + ' #pl-tabbar button span{display:none!important}', P + ' #pl-tabbar button svg{width:26px!important;height:26px!important}');
    if (st.tabbar === 'labels') css.push(P + ' #pl-tabbar button svg{display:none!important}', P + ' #pl-tabbar button{font-size:13.5px!important;font-weight:700!important}');
    if (st.tabbar === 'float') css.push(P + '.player-layout #pl-tabbar{left:12px!important;right:12px!important;bottom:calc(env(safe-area-inset-bottom,0px) + 8px)!important;height:calc(var(--pl-bar) - 4px)!important;padding-bottom:0!important;' +
      'border:1px solid var(--line)!important;border-radius:calc(22px*' + r + ')!important;box-shadow:0 12px 32px -10px rgba(0,0,0,.75)!important;overflow:hidden}');
    if (st.mini === 'compact') css.push(P + '.player-layout.pl-has-track:not([data-pl-player]) #pl-mini{height:calc(var(--pl-mini) - 16px)!important}', P + ' #pl-mini-art{width:30px!important;height:30px!important}', P + ' #pl-mini-artist{display:none!important}');
    if (st.mini === 'accent') css.push(P + '.player-layout #pl-mini{background:var(--accent)!important;border-color:transparent!important;color:var(--on-accent)!important}',
      P + ' #pl-mini :is(#pl-mini-title,#pl-mini-artist,button){color:var(--on-accent)!important}', P + ' #pl-mini #pl-mini-artist{opacity:.75}', P + ' #pl-mini-prog i{background:var(--on-accent)!important}');
    if (st.mini === 'float') css.push(P + '.player-layout.pl-has-track:not([data-pl-player]) #pl-mini{left:16px!important;right:16px!important;border-radius:calc(20px*' + r + ')!important;box-shadow:0 14px 34px -8px rgba(0,0,0,.8)!important;' +
      'bottom:calc(var(--pl-bar) + env(safe-area-inset-bottom, 0px) + 10px)!important}');
    var PB = P + ' #play-btn,' + P + ' .pw-np-pp';
    if (st.playShape) css.push(PB + '{border-radius:' + (st.playShape === 'rounded' ? 'calc(22px*' + r + ')' : 'calc(8px*' + r + ')') + '!important}');
    if (st.playFill === 'accent') css.push(PB + '{background:var(--accent)!important;color:var(--on-accent)!important}');
    if (st.playFill === 'gradient') css.push(PB + '{background:linear-gradient(135deg,var(--accent),' + (st.accent2 || '#b58cff') + ')!important;color:var(--on-accent)!important}');
    if (st.playFill === 'outline') css.push(PB + '{background:transparent!important;color:var(--accent)!important;box-shadow:0 0 0 2px var(--accent) inset!important}');
    if (st.seek === 'thin') css.push(P + '.player-layout #seek{height:3px!important}');
    if (st.seek === 'thick') css.push(P + '.player-layout #seek{height:10px!important;border-radius:calc(5px*' + r + ')!important}');
    if (st.seek === 'nothumb') css.push(P + ' #seek::-webkit-slider-thumb{opacity:0!important}', P + '.player-layout #seek{height:6px!important}');
    if (st.depth === 'flat') css.push(P + '{--r-shadow:none}', P + ' .ph-thumb,' + P + ' #play-btn,' + P + ' #pl-mini,' + P + ' .pw-np{box-shadow:none!important}');
    if (st.depth === 'deep') css.push(P + '{--r-shadow:0 1px 0 rgba(255,255,255,.06) inset,0 20px 44px -14px rgba(0,0,0,.95)}', P + ' .ph-thumb{box-shadow:0 0 0 1px rgba(255,255,255,.06) inset,0 16px 32px -10px rgba(0,0,0,.95)!important}',
      P + ' .pw-np,' + P + ' .pw-btn,' + P + ' .pw-card{box-shadow:0 16px 34px -14px rgba(0,0,0,.9)}');
    return css.join('\n');
  }

  // ---------- colour helpers ----------
  function okHex(h){ return typeof h === 'string' && /^#[0-9a-f]{6}$/i.test(h); }
  function rgb(h){ var n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
  function hex(c){ return '#' + c.map(function(v){ return Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0'); }).join(''); }
  function mix(a, b, t){ var x = rgb(a), y = rgb(b); return hex([0,1,2].map(function(i){ return x[i] + (y[i] - x[i]) * t; })); }
  function scale(a, f){ return hex(rgb(a).map(function(v){ return v * f; })); }
  function avg(h){ var c = rgb(h); return (c[0] + c[1] + c[2]) / 3; }
  function lum(h){
    var c = rgb(h).map(function(v){ v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); });
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  }
  function hsl2hex(h, s, l){
    s /= 100; l /= 100;
    var k = function(n){ return (n + h / 30) % 12; }, a = s * Math.min(l, 1 - l);
    var f = function(n){ return l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1))); };
    return hex([f(0) * 255, f(8) * 255, f(4) * 255]);
  }
  function hue(h){
    var c = rgb(h).map(function(v){ return v / 255; }), mx = Math.max.apply(null, c), mn = Math.min.apply(null, c), d = mx - mn;
    if (!d) return 0;
    var r = c[0], g = c[1], b = c[2], x = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
    return (x * 60 + 360) % 360;
  }

  // ---------- theme model ----------
  function clean(t){
    if (!t || typeof t !== 'object') return null;
    var c = {};
    Object.keys(STOCK).forEach(function(k){ c[k] = okHex(t.c && t.c[k]) ? t.c[k].toLowerCase() : STOCK[k]; });
    var r = +t.round; if (!isFinite(r)) r = 1;
    return { v:1, name: typeof t.name === 'string' ? t.name.slice(0, 40) : '', preset: typeof t.preset === 'string' ? t.preset : null,
             c:c, round: Math.max(0, Math.min(2, r)), font: FONTS[t.font] ? t.font : 'default', s: cleanStyle(t.s) };
  }
  function isStock(t){
    return !t || (stockColors(t) && t.round === 1 && t.font === 'default' && !Object.keys(t.s || {}).length);
  }
  function stockColors(t){ return Object.keys(STOCK).every(function(k){ return t.c[k] === STOCK[k]; }); }
  function load(){ try { return clean(JSON.parse(localStorage.getItem(KEY))); } catch(e){ return null; } }
  function stockTheme(){ return clean({ c: STOCK }); }

  // A stock grey -> the matching shade of the theme, by where its brightness sits between the stock anchors.
  function greyMap(t){
    var A = [['#000000','#000000'], [STOCK.bg, t.c.bg], [STOCK.surface, t.c.surface], [STOCK.line, t.c.line],
             [STOCK.dim, t.c.dim], [STOCK.text, t.c.text], ['#ffffff', '#ffffff']];
    return function(g){
      var L = avg(g);
      for (var i = 1; i < A.length; i++){
        var lo = avg(A[i-1][0]), hi = avg(A[i][0]);
        if (L <= hi){ return mix(A[i-1][1], A[i][1], hi === lo ? 0 : (L - lo) / (hi - lo)); }
      }
      return A[A.length - 1][1];
    };
  }

  function buildCss(t){
    var c = t.c, map = greyMap(t), v = [];
    var ac = rgb(c.accent);
    var dark = scale(c.accent, 0.07), la = lum(c.accent);   // text on accent: whichever of near-black / white reads better
    var onAccent = (la + 0.05) / (lum(dark) + 0.05) >= 1.05 / (la + 0.05) ? dark : '#ffffff';
    v.push('--bg:' + c.bg, '--bg-elev:' + c.surface, '--line:' + c.line, '--text:' + c.text, '--text-dim:' + c.dim,
           '--accent:' + c.accent, '--accent-dim:' + scale(c.accent, 0.45), '--accent-soft:' + mix(c.bg, c.accent, 0.11),
           '--accent-rgb:' + ac.join(','), '--on-accent:' + onAccent, '--danger:' + c.danger, '--ui-round:' + t.round);
    GREYS.forEach(function(g){ var m = map('#' + g); v.push('--g-' + g + ':' + m, '--g-' + g + '-rgb:' + rgb(m).join(',')); });
    var decl = v.join(';');
    // html[data-pp-theme] body beats body.pp-refined and the shop accent (set inline on <html>, inherited by body).
    // Stock colours with only corners / font / style changed: leave every colour as the app has it.
    var css = stockColors(t) ? 'html[data-pp-theme] body{--ui-round:' + t.round + '}\n' :
              'html[data-pp-theme]{' + decl + ';background:' + c.bg + '}\n' +
              'html[data-pp-theme] body{' + decl + '}\n' +
              'html[data-pp-theme] body.pp-refined{--line:' + map('#2b2d35') + '}\n';
    var f = FONTS[t.font] && FONTS[t.font].css;
    if (f){
      css += 'html[data-pp-theme] body,html[data-pp-theme] body.pp-refined{font-family:' + f + '}\n' +
             ':where(html[data-pp-theme]) :where(button,input,select,textarea){font-family:inherit}\n';
    }
    return css + styleCss(t.s || {}, c);
  }

  var styleEl = null, pending = null, rafId = 0;
  function paint(t){
    var root = document.documentElement, meta = document.querySelector('meta[name="theme-color"]');
    styleEl = styleEl || document.getElementById('pp-theme-live');
    if (!t || isStock(t)){
      root.removeAttribute('data-pp-theme');
      if (styleEl) styleEl.textContent = '';
      if (meta) meta.setAttribute('content', STOCK.bg);
      return;
    }
    if (!styleEl){ styleEl = document.createElement('style'); styleEl.id = 'pp-theme-live'; document.head.appendChild(styleEl); }
    styleEl.textContent = buildCss(t);
    root.setAttribute('data-pp-theme', '');
    if (meta) meta.setAttribute('content', t.c.bg);
  }
  // Slider and colour-wheel drags fire many times a frame; restyle the page at most once a frame.
  function paintSoon(t){
    pending = t;
    if (!rafId) rafId = requestAnimationFrame(function(){ rafId = 0; paint(pending); });
  }
  function persist(t){
    try {
      if (!t || isStock(t)){ localStorage.removeItem(KEY); localStorage.removeItem(CSS_KEY); localStorage.removeItem(BAR_KEY); }
      else { localStorage.setItem(KEY, JSON.stringify(t)); localStorage.setItem(CSS_KEY, buildCss(t)); localStorage.setItem(BAR_KEY, t.c.bg); }
    } catch(e){}
  }

  var current = load();
  paint(current);   // repaints what the boot script put up, in case the stylesheet rules moved on since it was cached
  persist(current);

  var saveTimer = 0;
  function setTheme(t, now){
    current = clean(t);
    paintSoon(current);
    clearTimeout(saveTimer);
    saveTimer = setTimeout(function(){ persist(current); }, now ? 0 : 300);
    if (ui) ui.sync();
  }
  function fromAccent(a){
    var h = hue(a);
    return { bg: hsl2hex(h, 28, 5), surface: hsl2hex(h, 24, 9), line: hsl2hex(h, 18, 15),
             text: hsl2hex(h, 20, 92), dim: hsl2hex(h, 10, 60), accent: a, danger: '#ff6b81' };
  }

  // ---------- export / import ----------
  function bgApi(){ return window.PPXpCustomization || null; }
  function exportTheme(withBackgrounds){
    var t = current || stockTheme();
    var out = { kind:'press-play-theme', v:1, theme: { name: t.name, c: t.c, round: t.round, font: t.font, s: t.s } };
    var api = bgApi();
    if (withBackgrounds && api) out.backgrounds = JSON.parse(JSON.stringify(api.uiCustomization));
    var blob = new Blob([JSON.stringify(out, null, 2)], { type:'application/json' });
    var name = (t.name || 'theme').replace(/[^\w -]+/g, '').trim().replace(/\s+/g, '-') || 'theme';
    if (window.ppSaveBlob) window.ppSaveBlob(blob, 'press-play-' + name + '.pptheme.json');
  }
  var BG_TYPES = { 'default':1, color:1, gradient:1, animated:1, image:1 };
  function importTheme(file){
    var r = new FileReader();
    r.onload = function(){
      var data;
      try { data = JSON.parse(r.result); } catch(e){ toast('That file is not a Press Play theme.'); return; }
      if (!data || data.kind !== 'press-play-theme' || !data.theme){ toast('That file is not a Press Play theme.'); return; }
      setTheme(data.theme, true);
      var api = bgApi(), b = data.backgrounds;
      if (api && b && typeof b === 'object'){
        ['app','playlist','controls','immersive'].forEach(function(k){
          var x = b[k];
          if (!x || !BG_TYPES[x.type]) return;
          if (x.type === 'image' && !(typeof x.dataUrl === 'string' && x.dataUrl.indexOf('data:image/') === 0)) return;
          api.uiCustomization[k] = x;
        });
        api.applyAllCustomization(); api.saveCustomization();
      }
      toast('Theme loaded' + (data.theme.name ? ': ' + data.theme.name : '') + '.');
    };
    r.readAsText(file);
  }
  function toast(m){ try { showToast(m); } catch(e){} }

  // ---------- saved themes ----------
  function savedList(){ try { var a = JSON.parse(localStorage.getItem(SAVED_KEY)); return Array.isArray(a) ? a.map(clean).filter(Boolean) : []; } catch(e){ return []; } }
  function writeSaved(a){ try { localStorage.setItem(SAVED_KEY, JSON.stringify(a.slice(0, 30))); } catch(e){ toast('Could not save: storage is full.'); } }

  // ---------- editor (in the Customize sheet) ----------
  var ui = null;
  function el(tag, cls, html){ var e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; }
  function esc(s){ return String(s).replace(/[&<>"]/g, function(ch){ return { '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;' }[ch]; }); }
  function swatch(c){
    return '<span class="ppth-sw" style="background:' + c.bg + '"><i style="background:' + c.surface + '"></i><b style="background:' + c.accent + '"></b></span>';
  }

  function buildEditor(){
    var body = document.getElementById('customize-modal-body');
    var footerReset = document.getElementById('customize-reset-btn');
    var header = document.querySelector('#customize-modal-header p');
    if (!body) return;

    // Theme | Backgrounds switch. The existing background controls move, untouched, into their own panel.
    var bgPanel = el('div', 'ppth-panel'); bgPanel.id = 'customize-bg-panel';
    while (body.firstChild) bgPanel.appendChild(body.firstChild);
    var switcher = el('div', 'ppth-switch',
      '<button type="button" data-p="theme" class="active">Theme</button><button type="button" data-p="layout">Layout</button><button type="button" data-p="bg">Backgrounds</button>');
    var panel = el('div', 'ppth-panel'); panel.id = 'customize-theme-panel';
    var layoutPanel = el('div', 'ppth-panel'); layoutPanel.id = 'customize-layout-panel';   // filled by pp-widgets.js
    body.appendChild(switcher); body.appendChild(panel); body.appendChild(layoutPanel); body.appendChild(bgPanel);
    bgPanel.hidden = true;
    if (header) header.textContent = 'Colours and fonts, where everything goes, and backgrounds';
    function show(p){
      switcher.querySelectorAll('button').forEach(function(b){ b.classList.toggle('active', b.dataset.p === p); });
      panel.hidden = p !== 'theme'; bgPanel.hidden = p !== 'bg'; layoutPanel.hidden = p !== 'layout';
      if (footerReset) footerReset.style.display = p === 'bg' ? '' : 'none';
    }
    switcher.addEventListener('click', function(e){ var b = e.target.closest('button'); if (b) show(b.dataset.p); });
    show('theme');

    panel.innerHTML =
      '<div class="ppth-h">Presets</div><div class="ppth-presets"></div>' +
      '<div class="ppth-h">Colours</div><div class="ppth-colors"></div>' +
      '<div class="ppth-row"><button type="button" class="settings-toggle-btn" id="ppth-from-accent">Build the rest from the accent</button></div>' +
      '<div class="ppth-h">Shape</div>' +
      '<div class="customize-row"><label>Corner roundness <span class="customize-range-value" id="ppth-round-v"></span></label>' +
      '<input type="range" class="customize-range" id="ppth-round" min="0" max="200" step="10"></div>' +
      '<div class="ppth-h">Font</div>' +
      '<div class="customize-row"><select class="customize-select" id="ppth-font"></select>' +
      '<div class="ppth-font-sample" id="ppth-font-sample">The quick brown fox · 0:42 / 3:17</div></div>' +
      '<div class="ppth-h">Style</div><div class="ppth-style"></div>' +
      '<div class="ppth-h">My themes</div>' +
      '<div class="ppth-row ppth-save"><input type="text" id="ppth-name" maxlength="40" placeholder="Name this theme"><button type="button" class="settings-toggle-btn" id="ppth-save">Save</button></div>' +
      '<div class="ppth-saved"></div>' +
      '<div class="ppth-row ppth-io">' +
        '<button type="button" class="settings-toggle-btn" id="ppth-export">Export…</button>' +
        '<button type="button" class="settings-toggle-btn" id="ppth-import">Import…</button>' +
        '<input type="file" id="ppth-import-file" accept="application/json,.json" hidden>' +
      '</div>' +
      '<label class="ppth-check"><input type="checkbox" id="ppth-export-bg"> Include backgrounds when exporting</label>' +
      '<div class="ppth-row"><button type="button" class="settings-toggle-btn ppth-danger" id="ppth-reset">Back to the default look</button></div>';

    var presetsEl = panel.querySelector('.ppth-presets');
    PRESETS.forEach(function(p){
      var b = el('button', 'ppth-preset', swatch(p.c || STOCK) + '<span>' + esc(p.name) + '</span>');
      b.type = 'button'; b.dataset.id = p.id;
      b.addEventListener('click', function(){
        if (p.id === 'default'){ setTheme(null, true); return; }
        var t = current || stockTheme();
        setTheme({ name: p.name, preset: p.id, c: p.c, round: t.round, font: t.font, s: t.s }, true);
      });
      presetsEl.appendChild(b);
    });

    var colorsEl = panel.querySelector('.ppth-colors'), inputs = {};
    COLOR_FIELDS.forEach(function(f){
      var row = el('label', 'ppth-color', '<span><b>' + f[1] + '</b>' + (f[2] ? '<small>' + f[2] + '</small>' : '') + '</span>');
      var inp = el('input', 'customize-color-input'); inp.type = 'color';
      inp.addEventListener('input', function(){
        var t = current || stockTheme(); t = clean(t); t.c[f[0]] = inp.value.toLowerCase(); t.preset = null;
        setTheme(t);
      });
      row.appendChild(inp); colorsEl.appendChild(row); inputs[f[0]] = inp;
    });

    panel.querySelector('#ppth-from-accent').addEventListener('click', function(){
      var t = clean(current || stockTheme()); t.c = fromAccent(t.c.accent); t.preset = null; setTheme(t, true);
    });

    var round = panel.querySelector('#ppth-round'), roundV = panel.querySelector('#ppth-round-v');
    round.addEventListener('input', function(){
      var t = clean(current || stockTheme()); t.round = (+round.value) / 100; setTheme(t);
    });

    var font = panel.querySelector('#ppth-font'), sample = panel.querySelector('#ppth-font-sample');
    Object.keys(FONTS).forEach(function(k){ var o = el('option', null, esc(FONTS[k].label)); o.value = k; font.appendChild(o); });
    font.addEventListener('change', function(){ var t = clean(current || stockTheme()); t.font = font.value; setTheme(t, true); });

    var styleEl2 = panel.querySelector('.ppth-style'), styleInputs = {};
    STYLE.forEach(function(f){
      var k = f[0], row = el('div', 'customize-row ppth-st');
      if (f[2] === 'range'){
        row.innerHTML = '<label>' + f[1] + ' <span class="customize-range-value"></span></label><input type="range" class="customize-range" min="' + f[3][0] + '" max="' + f[3][1] + '" step="' + f[3][2] + '">';
        var inp = row.querySelector('input'), val = row.querySelector('span');
        inp.addEventListener('input', function(){ var t = clean(current || stockTheme()); t.s[k] = +inp.value; val.textContent = inp.value + '%'; setTheme(t); });
        styleInputs[k] = function(st){ var v = st[k] || f[3][3]; inp.value = v; val.textContent = v + '%'; };
      } else if (f[2] === 'seg'){
        row.innerHTML = '<label>' + f[1] + '</label><div class="pw-seg">' + f[3].map(function(o){ return '<button type="button" data-v="' + o[0] + '">' + esc(o[1]) + '</button>'; }).join('') + '</div>';
        row.querySelectorAll('button').forEach(function(b){ b.addEventListener('click', function(){ var t = clean(current || stockTheme()); if (b.dataset.v) t.s[k] = b.dataset.v; else delete t.s[k]; setTheme(t, true); }); });
        styleInputs[k] = function(st){ row.querySelectorAll('button').forEach(function(b){ b.classList.toggle('on', b.dataset.v === (st[k] || '')); }); };
      } else {
        row.innerHTML = '<label>' + f[1] + '</label><input type="color" class="customize-color-input">';
        var ci = row.querySelector('input');
        ci.addEventListener('input', function(){ var t = clean(current || stockTheme()); t.s[k] = ci.value; setTheme(t); });
        styleInputs[k] = function(st){ row.hidden = st.playFill !== 'gradient'; if (document.activeElement !== ci) ci.value = st[k] || f[3]; };
      }
      styleEl2.appendChild(row);
    });
    var nameIn = panel.querySelector('#ppth-name'), savedEl = panel.querySelector('.ppth-saved');
    panel.querySelector('#ppth-save').addEventListener('click', function(){
      var name = nameIn.value.trim() || ('Theme ' + (savedList().length + 1));
      var t = clean(current || stockTheme()); t.name = name; t.preset = null;
      var list = savedList().filter(function(x){ return x.name !== name; });
      list.unshift(t); writeSaved(list); nameIn.value = '';
      current = t; persist(t); renderSaved(); toast('Saved "' + name + '".');
    });
    function renderSaved(){
      var list = savedList();
      savedEl.innerHTML = list.length ? '' : '<div class="ppth-empty">Themes you save show up here.</div>';
      list.forEach(function(t, i){
        var row = el('div', 'ppth-saved-row', swatch(t.c) + '<span class="ppth-saved-name">' + esc(t.name) + '</span>');
        var use = el('button', 'settings-toggle-btn', 'Use'); use.type = 'button';
        use.addEventListener('click', function(){ setTheme(t, true); });
        var del = el('button', 'settings-toggle-btn ppth-danger', 'Delete'); del.type = 'button';
        del.addEventListener('click', function(){
          if (del.dataset.armed){ var l = savedList(); l.splice(i, 1); writeSaved(l); renderSaved(); return; }
          del.dataset.armed = '1'; del.textContent = 'Sure?';
          setTimeout(function(){ if (del.isConnected){ delete del.dataset.armed; del.textContent = 'Delete'; } }, 3000);
        });
        row.appendChild(use); row.appendChild(del); savedEl.appendChild(row);
      });
    }

    var exportBg = panel.querySelector('#ppth-export-bg');
    panel.querySelector('#ppth-export').addEventListener('click', function(){ exportTheme(exportBg.checked); });
    var file = panel.querySelector('#ppth-import-file');
    panel.querySelector('#ppth-import').addEventListener('click', function(){ file.click(); });
    file.addEventListener('change', function(){ if (file.files && file.files[0]) importTheme(file.files[0]); file.value = ''; });

    var reset = panel.querySelector('#ppth-reset');
    reset.addEventListener('click', function(){
      if (!reset.dataset.armed){
        reset.dataset.armed = '1'; reset.textContent = 'Tap again to reset';
        setTimeout(function(){ delete reset.dataset.armed; reset.textContent = 'Back to the default look'; }, 3000);
        return;
      }
      delete reset.dataset.armed; reset.textContent = 'Back to the default look';
      setTheme(null, true);
    });

    function sync(){
      var t = current || stockTheme();
      Object.keys(inputs).forEach(function(k){ if (document.activeElement !== inputs[k]) inputs[k].value = t.c[k]; });
      round.value = Math.round(t.round * 100);
      roundV.textContent = t.round === 0 ? 'Square' : Math.round(t.round * 100) + '%';
      font.value = t.font;
      sample.style.fontFamily = FONTS[t.font].css || '';
      Object.keys(styleInputs).forEach(function(k){ styleInputs[k](t.s || {}); });
      var active = !current || isStock(current) ? 'default' : current.preset;
      presetsEl.querySelectorAll('.ppth-preset').forEach(function(b){ b.classList.toggle('active', b.dataset.id === active); });
    }
    ui = { sync: sync };
    sync(); renderSaved();
    var openBtn = document.getElementById('customize-btn');
    if (openBtn) openBtn.addEventListener('click', function(){ sync(); renderSaved(); });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', buildEditor);
  else buildEditor();

  window.PPTheme = {
    get: function(){ return current ? JSON.parse(JSON.stringify(current)) : null; },
    set: function(t){ setTheme(t, true); },
    reset: function(){ setTheme(null, true); },
    presets: PRESETS.map(function(p){ return p.id; })
  };
})();
