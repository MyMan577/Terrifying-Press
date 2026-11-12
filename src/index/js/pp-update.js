// App updates: once a day, ask GitHub whether a newer build than this one has been released, and offer it.
// Only the public release list is read. Nothing about the phone or the library is sent. Can be switched off in Settings.
(function(){
  var API = 'https://api.github.com/repos/MyMan577/Terrifying-Press/releases/latest';
  var PAGE = 'https://github.com/MyMan577/Terrifying-Press/releases/latest';
  var build = +window.PP_BUILD || 0, found = null, busy = false;
  var $ = function(id){ return document.getElementById(id); };
  var get = function(k){ try { return localStorage.getItem(k); } catch(e){ return null; } };
  var set = function(k, v){ try { localStorage.setItem(k, v); } catch(e){} };
  var enabled = function(){ return get('ppUpdateCheck') !== '0'; };
  var name = function(n){ return n ? '1.0.' + n : 'a local build'; };

  function status(msg){
    var el = $('update-status');
    if (el) el.textContent = 'This is version ' + name(build) + '.' + (msg ? ' ' + msg : '');
  }
  function show(){
    var b = $('update-get-btn'); if (b) b.hidden = !found;
    if (found) status('Version ' + name(found.n) + ' is out.');
  }
  function banner(){
    var el = $('update-banner'); if (!el || !found) return;
    if (+get('ppUpdateLater') > Date.now()) return;
    $('update-banner-text').textContent = 'Press Play ' + name(found.n) + ' is out.';
    el.hidden = false;
  }
  function download(){
    if (!found) return;
    try { window.open(found.url, '_blank'); } catch(e){ location.href = found.url; }   // Android hands this to the browser
    var el = $('update-banner'); if (el) el.hidden = true;
  }
  function check(manual){
    if (busy) return;
    if (!build && !manual) return;                       // a local build has nothing to compare against
    busy = true;
    if (manual) status('Checking…');
    fetch(API, { headers: { Accept: 'application/vnd.github+json' }, cache: 'no-store' })
      .then(function(r){ if (!r.ok) throw new Error('GitHub answered ' + r.status); return r.json(); })
      .then(function(j){
        set('ppUpdateAt', String(Date.now()));
        var m = /(\d+)\s*$/.exec(String(j.tag_name || '')), n = m ? +m[1] : 0;
        var apk = (j.assets || []).filter(function(a){ return /\.apk$/i.test(a.name || ''); })[0];
        if (n > build && build){
          found = { n: n, url: (apk && apk.browser_download_url) || j.html_url || PAGE };
          show(); if (!manual) banner();
        } else {
          found = null; show();
          status(build ? 'You are up to date.' : 'The newest release is ' + name(n) + '.');
        }
      })
      .catch(function(e){ if (manual) status('Could not check: ' + ((e && e.message) || 'no connection') + '.'); })
      .then(function(){ busy = false; });
  }

  var tg = $('update-check-toggle');
  if (tg){
    tg.checked = enabled();
    tg.addEventListener('change', function(){ set('ppUpdateCheck', tg.checked ? '1' : '0'); if (tg.checked) check(true); });
  }
  var cb = $('update-check-btn'); if (cb) cb.addEventListener('click', function(){ check(true); });
  var gb = $('update-get-btn'); if (gb) gb.addEventListener('click', download);
  var bg = $('update-banner-get'); if (bg) bg.addEventListener('click', download);
  var bl = $('update-banner-later');
  if (bl) bl.addEventListener('click', function(){ set('ppUpdateLater', String(Date.now() + 3 * 24 * 3600 * 1000)); $('update-banner').hidden = true; });
  status('');
  if (enabled() && Date.now() - (+get('ppUpdateAt') || 0) > 24 * 3600 * 1000) setTimeout(function(){ check(false); }, 9000);
  window.__ppCheckUpdate = check;
})();
