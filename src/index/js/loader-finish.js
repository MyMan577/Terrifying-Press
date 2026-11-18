/* Loading screen: stays up until the page, fonts, saved library and first Home render are ready. */
(function(){
  var el = document.getElementById('pp-loader'); if (!el) return;
  var t0 = performance.now(), MIN = 350, finished = false;
  function finish(){
    if (finished) return; finished = true;
    var wait = Math.max(0, MIN - (performance.now() - t0));
    setTimeout(function(){
      el.classList.add('done');
      setTimeout(function(){ if (el.parentNode) el.parentNode.removeChild(el); }, 450);
    }, wait);
  }
  // The page's own code has run once this script runs (it is near the end of the page). Not waiting for the
  // window's load event: that waits for every image on the page too, and with a big library the list and Home hold
  // hundreds of covers, which kept the loading screen up for 10 seconds and more. Covers fill in as they arrive.
  var pageLoaded = document.readyState !== 'loading'
    ? Promise.resolve()
    : new Promise(function(r){ document.addEventListener('DOMContentLoaded', r, { once:true }); });
  var fonts = (document.fonts && document.fonts.ready) ? document.fonts.ready.catch(function(){}) : Promise.resolve();
  var fontsOrTimeout = Promise.race([fonts, new Promise(function(r){ setTimeout(r, 2500); })]);
  var lib = window.__ppLibReady || Promise.resolve();
  Promise.all([pageLoaded, fontsOrTimeout, lib]).then(function(){
    try { if (window.__ppRenderHomeNow) window.__ppRenderHomeNow(); } catch(e){ if (typeof ppCaught === "function") ppCaught(e); }
    requestAnimationFrame(function(){ requestAnimationFrame(finish); });
  }, finish);
  setTimeout(finish, 12000);
})();
