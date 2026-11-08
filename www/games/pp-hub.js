/* Press Play Points bridge for games.
   A game reports events and achievements to the app, and picks up boosts bought
   in the Games > Shop. Outside the app (no parent hub) every call is a harmless no-op. */
(function(){
  'use strict';
  var m = /\/games\/([^\/]+)\//.exec(location.pathname);
  var id = m ? m[1] : '';
  function hub(){
    try { return (window.parent && window.parent !== window && window.parent.__ppHub) || null; } catch(e){ return null; }
  }
  function call(fn, args, dflt){
    var h = hub();
    if (!h || typeof h[fn] !== 'function') return dflt;
    try { var r = h[fn].apply(h, [id].concat(args)); return r == null ? dflt : r; } catch(e){ return dflt; }
  }
  window.PPHub = {
    id: id,
    // something countable happened: 'win', 'clear', 'serve'... value is the amount (default 1)
    event: function(type, value){ call('event', [type, value == null ? 1 : value]); },
    // a game-level "best so far" stat: highest ante, best streak...
    best: function(type, value){ call('best', [type, value]); },
    // one of the game's own achievements unlocked
    ach: function(achId){ call('ach', [achId]); },
    // the game's own achievement list: [{id, name, desc, p, done}]
    native: function(list){ call('native', [list]); },
    // a fact the shop needs, such as how many knights are still locked
    info: function(key, value){ call('info', [key, value]); },
    // take every pending boost of this kind; returns the amount (0 if none)
    take: function(kind){ return +call('take', [kind], 0) || 0; }
  };
})();
