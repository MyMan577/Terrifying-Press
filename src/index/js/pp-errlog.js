/* Error log: problems the app runs into are noted on this phone only (the last 60), so they can be copied into a bug
   report from Settings. Nothing is sent anywhere. Loaded first so it also catches errors while the app starts. */
(function(){
  var KEY = 'ppErrorLog', MAX = 60, buf = null, timer = 0;
  function load(){ if (!buf){ try { buf = JSON.parse(localStorage.getItem(KEY)) || []; } catch(e){ buf = []; } } return buf; }
  function save(){ clearTimeout(timer); timer = setTimeout(function(){ try { localStorage.setItem(KEY, JSON.stringify(load())); } catch(e){} sync(); }, 800); }
  function add(kind, msg, where){
    try {
      var l = load(), last = l[l.length - 1];
      msg = String(msg == null ? '' : msg).slice(0, 700);
      if (!msg) return;
      if (last && last.k === kind && last.m === msg){ last.n = (last.n || 1) + 1; last.t = Date.now(); }
      else { l.push({ t: Date.now(), k: kind, m: msg, w: where || '' }); if (l.length > MAX) l.splice(0, l.length - MAX); }
      save();
    } catch(e){}
  }
  function stack(e, n){ return e && e.stack ? '\n' + String(e.stack).split('\n').slice(0, n).join('\n') : ''; }
  window.addEventListener('error', function(e){
    if (!e) return;
    if (e.message) add('error', e.message + stack(e.error, 4), String(e.filename || '').split('/').pop() + ':' + (e.lineno || 0) + ':' + (e.colno || 0));
    else if (e.target && e.target.tagName === 'SCRIPT') add('load', 'A script did not load: ' + (e.target.src || ''));
  }, true);
  window.addEventListener('unhandledrejection', function(e){
    var r = e && e.reason;
    add('promise', ((r && r.message) || String(r)) + stack(r, 4));
  });
  var ce = console.error;
  console.error = function(){
    try {
      add('console', [].map.call(arguments, function(a){
        if (a && a.stack) return String(a.stack).split('\n').slice(0, 3).join('\n');
        if (a && typeof a === 'object'){ try { return JSON.stringify(a); } catch(e){ return String(a); } }
        return String(a);
      }).join(' '));
    } catch(e){}
    return ce.apply(console, arguments);
  };
  function text(){
    var l = load(), out = ['Press Play ' + (+window.PP_BUILD ? '1.0.' + window.PP_BUILD : 'local build'), navigator.userAgent, 'Copied ' + new Date().toISOString(), ''];
    if (!l.length) out.push('No errors noted.');
    l.forEach(function(x){
      out.push('[' + new Date(x.t).toISOString() + '] ' + x.k + (x.n > 1 ? ' (x' + x.n + ')' : '') + (x.w ? ' at ' + x.w : ''));
      out.push(x.m); out.push('');
    });
    return out.join('\n');
  }
  function sync(){
    var el = document.getElementById('errlog-status'); if (!el) return;
    var n = load().length;
    el.textContent = n ? n + ' problem' + (n === 1 ? '' : 's') + ' noted. The newest was ' + new Date(load()[n - 1].t).toLocaleString() + '.' : 'No problems noted.';
  }
  function flash(btn, msg){ var o = btn.textContent; btn.textContent = msg; setTimeout(function(){ btn.textContent = o; }, 1800); }
  function copy(btn){
    var t = text();
    var fallback = function(){
      try {
        var ta = document.createElement('textarea'); ta.value = t; ta.style.position = 'fixed'; ta.style.opacity = '0';
        document.body.appendChild(ta); ta.select(); var ok = document.execCommand('copy'); ta.remove();
        flash(btn, ok ? 'Copied' : 'Could not copy');
      } catch(e){ flash(btn, 'Could not copy'); }
    };
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(t).then(function(){ flash(btn, 'Copied'); }, fallback);
      else fallback();
    } catch(e){ fallback(); }
  }
  window.ppErrorLog = { add: add, text: text, clear: function(){ buf = []; try { localStorage.removeItem(KEY); } catch(e){} sync(); } };
  document.addEventListener('DOMContentLoaded', function(){
    var c = document.getElementById('errlog-copy-btn'), s = document.getElementById('errlog-share-btn'), x = document.getElementById('errlog-clear-btn');
    if (c) c.addEventListener('click', function(){ copy(c); });
    if (x) x.addEventListener('click', function(){ window.ppErrorLog.clear(); });
    var Sh = window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.Share;
    if (s && Sh && Sh.share){
      s.hidden = false;
      s.addEventListener('click', function(){ Sh.share({ title: 'Press Play error log', text: text() }).catch(function(){}); });
    }
    sync();
  });
})();
