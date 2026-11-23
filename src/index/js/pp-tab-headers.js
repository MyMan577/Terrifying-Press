/* Settings, Headers and Games button: hide the title and/or the Games button at the top of each tab.
   Home and the user's own pages already do this with widgets (Customize, Layout); this covers Playlists, Library,
   Pendulum and Settings. Saved per tab as ppTabHeadV1 = { library: { head: false, games: false }, ... }.
   Applied as body classes (pp-th-<tab>-head / pp-th-<tab>-games = hidden), which pp-tab-headers.css reads together
   with body[data-pl-view] (the tab that is showing). */
(function(){
  var KEY = 'ppTabHeadV1', TABS = ['playlists', 'library', 'pendulum', 'settings'];
  function load(){ try { var o = JSON.parse(localStorage.getItem(KEY) || '{}'); return o && typeof o === 'object' ? o : {}; } catch(e){ return {}; } }
  function save(o){ try { localStorage.setItem(KEY, JSON.stringify(o)); } catch(e){ if (typeof ppCaught === "function") ppCaught(e); } }
  function apply(o){
    var b = document.body; if (!b) return;
    TABS.forEach(function(t){
      var s = o[t] || {};
      b.classList.toggle('pp-th-' + t + '-head', s.head === false);
      b.classList.toggle('pp-th-' + t + '-games', s.games === false);
    });
  }
  var st = load();
  apply(st);
  document.querySelectorAll('[data-th]').forEach(function(cb){
    var p = cb.getAttribute('data-th').split(':'), t = p[0], what = p[1];
    cb.checked = !(st[t] && st[t][what] === false);
    cb.addEventListener('change', function(){
      st[t] = st[t] || {}; st[t][what] = cb.checked;
      save(st); apply(st);
    });
  });
})();
