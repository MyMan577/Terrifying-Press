// Theme, first paint: puts the saved theme's CSS (built by pp-theme.js) in place before the page draws,
// so the app never flashes the stock colours first.
(function(){
  try {
    var css = localStorage.getItem('ppThemeCssV1');
    if (!css) return;
    var root = document.documentElement;
    root.setAttribute('data-pp-theme', '');
    var s = document.createElement('style');
    s.id = 'pp-theme-live';
    s.textContent = css;
    document.head.appendChild(s);
    var bg = localStorage.getItem('ppThemeBarV1');
    var m = document.querySelector('meta[name="theme-color"]');
    if (bg && m) m.setAttribute('content', bg);
  } catch(e){}
})();
