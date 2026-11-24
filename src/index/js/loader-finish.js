/* Loading screen: stays up until the app is ready to use. That is: the page, fonts, saved library and first Home
   render are ready, the covers on the first screen have arrived, and the start-up work that follows them (the
   Library's rows, the phone scan, the catalog for Android Auto, the scripts that load last) has calmed down. It used
   to go as soon as Home was drawn, while that work still kept the app busy: for about 10 seconds after it, rows
   scrolled (the browser does that by itself) but taps did nothing. */
(function(){
  var el = document.getElementById('pp-loader'); if (!el){ window.__ppLoading = false; return; }
  var t0 = performance.now(), MIN = 350, CAP = 25000, QUIET = 700, BUSY = 50, finished = false;
  window.__ppLoading = true;
  // Long tasks (anything holding the page for more than 50 ms). Where the browser reports them, they are the measure
  // of "busy"; elsewhere a timer that comes back late stands in for them.
  var lastBusy = performance.now(), busyMs = 0, busyN = 0, after = null, lt = null;
  try {
    lt = new PerformanceObserver(function(l){
      l.getEntries().forEach(function(e){
        var end = e.startTime + e.duration;
        if (end > lastBusy) lastBusy = end;
        if (after){ after.ms += e.duration; after.n++; if (e.duration > after.max) after.max = e.duration; }
        else { busyMs += e.duration; busyN++; }
      });
    });
    lt.observe({ type: 'longtask', buffered: true });
  } catch(e){ lt = null; }
  var marks = {};
  function mark(k){ marks[k] = Math.round(performance.now() - t0); }
  function finish(why){
    if (finished) return; finished = true;
    mark('done'); marks.why = why || 'ready';
    var wait = Math.max(0, MIN - (performance.now() - t0));
    setTimeout(function(){
      window.__ppLoading = false;
      el.classList.add('done');
      setTimeout(function(){ if (el.parentNode) el.parentNode.removeChild(el); }, 450);
      watchAfter();
    }, wait);
  }
  // The covers of the first screen of Home: the screen should not open with empty squares that fill in one by one.
  function coversShown(){
    var imgs = [].slice.call(document.querySelectorAll('#pl-home img')), vh = innerHeight, vw = innerWidth;
    var waits = imgs.filter(function(im){
      if (im.complete) return false;
      var r = im.getBoundingClientRect();
      return r.width > 0 && r.bottom > 0 && r.top < vh && r.right > 0 && r.left < vw;
    }).slice(0, 40).map(function(im){
      im.loading = 'eager';   // lazy images under a full-screen cover may never be asked for
      return new Promise(function(r){ im.addEventListener('load', r, { once:true }); im.addEventListener('error', r, { once:true }); });
    });
    return Promise.race([Promise.all(waits), new Promise(function(r){ setTimeout(r, 4000); })]);
  }
  // Resolves once the page has gone QUIET ms without being busy.
  function quiet(){
    return new Promise(function(done){
      var prev = performance.now();
      (function tick(){
        if (finished) return done();
        var now = performance.now();
        if (!lt && now - prev > 16 + BUSY) lastBusy = now;           // no long-task reports here: a late timer means busy
        prev = now;
        if (now - lastBusy >= QUIET) return done();
        setTimeout(tick, 16);
      })();
    });
  }
  // The page's own code has run once this runs (DOMContentLoaded). Not waiting for the window's load event: that
  // waits for every image on the page, hundreds of covers with a big library. Only the first screen's covers count.
  var pageLoaded = document.readyState !== 'loading'
    ? Promise.resolve()
    : new Promise(function(r){ document.addEventListener('DOMContentLoaded', r, { once:true }); });
  var fonts = (document.fonts && document.fonts.ready) ? document.fonts.ready.catch(function(){}) : Promise.resolve();
  var fontsOrTimeout = Promise.race([fonts, new Promise(function(r){ setTimeout(r, 2500); })]);
  pageLoaded.then(function(){
    mark('page');
    var lib = window.__ppLibReady || Promise.resolve();
    return Promise.all([fontsOrTimeout, lib]);
  }).then(function(){
    mark('library');
    try { if (window.__ppRenderHomeNow) window.__ppRenderHomeNow(); } catch(e){ if (typeof ppCaught === "function") ppCaught(e); }
    return coversShown();
  }).then(function(){ mark('covers'); return quiet(); })
    .then(function(){ requestAnimationFrame(function(){ requestAnimationFrame(function(){ finish('ready'); }); }); },
          function(){ finish('failed'); });
  setTimeout(function(){ finish('timeout'); }, CAP);

  // For a bug report: when the start was slow, or the app was still busy after the loading screen, it is noted in
  // Settings > Error log (on this phone only).
  function watchAfter(){
    if (!lt || !window.ppErrorLog) return;
    after = { ms: 0, n: 0, max: 0 };
    setTimeout(function(){
      try { lt.disconnect(); } catch(e){}
      var slow = marks.why !== 'ready' || after.ms > 1500 || marks.done > 12000;
      if (!slow) return;
      window.ppErrorLog.add('slow start', 'Loading screen ' + (marks.done / 1000).toFixed(1) + ' s (' + marks.why + '; page ' + marks.page +
        ' ms, library ' + marks.library + ' ms, covers ' + marks.covers + ' ms; busy ' + Math.round(busyMs) + ' ms in ' + busyN +
        ' long tasks). In the 15 s after it: busy ' + Math.round(after.ms) + ' ms in ' + after.n + ' long tasks, the longest ' + Math.round(after.max) + ' ms.');
    }, 15000);
  }
})();
