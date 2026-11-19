  // ---------- The phone's Back button ----------
  // MainActivity asks window.ppBack() what to do with each Back press. It closes the top-most thing on screen, one per press:
  //   1. a menu, dialog, dropdown or popover   2. the layout studio / widget editing   3. the queue board
  //   4. multi-select   5. the player, a library folder, a game, immersive (the history steps those already push)
  //   6. any tab but Home goes back to Home
  // It returns false only when nothing is left to close; the app then goes to the background (music keeps playing).
  (function(){
    'use strict';
    var body = document.body;
    // Things that open and close: any element whose id names it a layer (overlay, modal, sheet, panel, menu...) while it shows
    // with an "open" class or sits fixed on screen, and every visible dialog. Ids, not a fixed list, so panels added later
    // (and the ones the separate scripts build, like the CC panel) are covered too.
    var LAYER_ID = /overlay|modal|dropdown|popover|popup|menu|sheet|panel|dialog|picker|drawer|hub|-ask|-box$|sub-tx|-tester|licences/i;
    // Always-on displays, banners that go by themselves, and layers that close through the history (their popstate handlers).
    var SKIP = '#lyrics-overlay, #subtitle-overlay, #pp-ringscreen, #menu-panel, #pl-home, #main, #sidebar, [id*="banner"], [id*="toast"], ' +
               '#pq-root, #pq-root *, #pp-games, #pp-games *, #pp-game, #pp-game *, #ppx-hub, #ppx-hub *';
    // Layers that pushed a history step when they opened: Back must leave that step, or the next press would do nothing.
    var HIST_LAYERS = ['ppx-hub', 'pp-game', 'pp-games'];
    var CLOSE = '[id$="-close"], [id$="-close-btn"], [id$="-cancel"], [id$="-cancel-btn"], [id$="-done"], .modal-close, .close-btn, .pw-sheet-close, ' +
                '[class*="-close"], [data-act="close"], [data-act="cancel"], [aria-label="Close"], [aria-label="Cancel"], [aria-label^="Close "], [aria-label="Back"], [title="Close"]';
    var CLOSE_TEXT = /^(\u00d7|\u2715|\u2716|\u2573|x|close|cancel|done|back|\u2190|\u2039)$/i;

    function shown(el){
      if (!el || el.hidden || !el.isConnected) return false;
      if (!el.getClientRects().length) return false;
      var r = el.getBoundingClientRect();   // on screen, not slid out of view or squeezed to nothing
      if (r.width < 2 || r.height < 2 || r.bottom <= 0 || r.right <= 0 || r.top >= innerHeight || r.left >= innerWidth) return false;
      var cs = getComputedStyle(el);
      return cs.display !== 'none' && cs.visibility !== 'hidden' && cs.pointerEvents !== 'none' && parseFloat(cs.opacity || '1') > 0.05;
    }
    // Paint order, roughly as the browser does it: the z-index of every stacking context from the page down to the element.
    // Comparing these lists (not single numbers) keeps a dropdown inside the menu above the menu, whatever its own z-index.
    function zChain(el){
      var chain = [];
      for (var e = el; e && e !== document.documentElement; e = e.parentElement){
        var cs = getComputedStyle(e), z = cs.zIndex;
        if (z !== 'auto' && z !== '' && (cs.position !== 'static' || cs.display === 'flex' || cs.display === 'grid')) chain.unshift(parseInt(z, 10) || 0);
        else if (cs.position === 'fixed' || cs.position === 'sticky') chain.unshift(0);
      }
      return chain;
    }
    function above(a, b){   // is a painted over b?
      if (b.contains(a)) return true;
      if (a.contains(b)) return false;
      var ca = zChain(a), cb = zChain(b);
      for (var i = 0; i < Math.min(ca.length, cb.length); i++) if (ca[i] !== cb[i]) return ca[i] > cb[i];
      if (ca.length !== cb.length){
        var x = ca.length > cb.length ? ca[cb.length] : cb[ca.length];   // the deeper one's next level against 0
        if (x !== 0) return ca.length > cb.length ? x > 0 : x < 0;
      }
      return !!(b.compareDocumentPosition(a) & Node.DOCUMENT_POSITION_FOLLOWING);
    }
    function isLayer(el){
      if (el.matches('[role="dialog"], [aria-modal="true"]')) return true;
      if (!el.id || !LAYER_ID.test(el.id)) return false;
      if (el.classList.contains('open')) return true;
      // A fixed layer that shows by display alone: only a big one (not a fixed button or bar that happens to match).
      if (el.matches('button, a, input, [role="button"]') || getComputedStyle(el).position !== 'fixed') return false;
      var r = el.getBoundingClientRect();
      return r.width * r.height >= innerWidth * innerHeight * 0.15;
    }
    function topLayer(){
      var best = null;
      document.querySelectorAll('[id], [role="dialog"], [aria-modal="true"]').forEach(function(el){
        if (!isLayer(el) || el.matches(SKIP) || !shown(el)) return;
        var r = el.getBoundingClientRect();
        if (r.width < 24 || r.height < 24) return;
        if (!best || above(el, best)) best = el;
      });
      return best;
    }
    function closeButtons(el){
      var out = [].slice.call(el.querySelectorAll(CLOSE));
      el.querySelectorAll('button, [role="button"]').forEach(function(b){
        if (out.indexOf(b) < 0 && CLOSE_TEXT.test((b.textContent || '').trim())) out.push(b);
      });
      // Only the layer's own buttons, not those of another layer inside it.
      return out.filter(function(b){ var l = b.parentElement; while (l && l !== el && !(l.matches && isLayer(l))) l = l.parentElement; return l === el && shown(b); });
    }
    function gone(el){ return !shown(el) || (el._ppWasOpen && !el.classList.contains('open')); }
    function click(el){   // a tap on a backdrop
      ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click'].forEach(function(t){
        var Ev = t.indexOf('pointer') === 0 && window.PointerEvent ? PointerEvent : MouseEvent;
        el.dispatchEvent(new Ev(t, { bubbles: true, cancelable: true, view: window }));
      });
    }
    function closeLayer(el){
      el._ppWasOpen = el.classList.contains('open');
      // 1. its own close / cancel button
      var btns = closeButtons(el);
      if (btns.length){ btns[0].click(); if (gone(el)) return; }
      // 2. a tap on its backdrop: the overlay itself, or the overlay it is the box of. Never an overlay further out: a
      //    dropdown inside the menu must not take the whole menu with it.
      var ov = el.matches('[id$="-overlay"]') ? el : (el.parentElement && el.parentElement.matches('[id$="-overlay"]') ? el.parentElement : null);
      if (ov && shown(ov)){ click(ov); if (gone(el)) return; }
      // 3. a dropdown or popover: closed directly, with its button. (Not by a pretend tap elsewhere: that tap also reached
      //    whatever was under it, and closed the player or ended multi-select along with the dropdown.)
      if (!ov && el.classList.contains('open')){
        el.classList.remove('open');
        var owner = el.id && document.getElementById(el.id.replace(/-(dropdown|popover|menu|panel)$/, '-btn'));
        if (owner && owner !== el){ owner.classList.remove('open'); if (owner.hasAttribute('aria-expanded')) owner.setAttribute('aria-expanded', 'false'); }
        document.querySelectorAll('[aria-expanded="true"]').forEach(function(b){ var c = b.getAttribute('aria-controls'); if (c && c === el.id) b.setAttribute('aria-expanded', 'false'); });
        return;
      }
      // 4. last resort: just hide it
      if (el.classList.contains('open')) el.classList.remove('open');
      else if (el.matches('[role="dialog"], [aria-modal="true"]')) el.hidden = true;
    }
    // Escape sent to the window only: the studio and widget editor listen there, and nothing on the document sees it.
    function escapeOnWindow(){ window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: false })); }

    var HISTORY_FLAGS = ['ppPlayer', 'ppQueue', 'ppBrowse', 'ppGame', 'ppGames', 'ppHub', 'ppImm'];
    function historyLayer(){
      var st = history.state;
      if (!st || typeof st !== 'object') return false;
      return HISTORY_FLAGS.some(function(k){ return !!st[k]; });
    }

    // What the last press did, for checking by hand: window.ppBack.last
    function did(what){ window.ppBack.last = what; return true; }
    window.ppBack = function(){
      try {
        // (The on-screen keyboard takes the first Back itself, before it ever reaches the app, so there is no step for it here.)
        var a = document.activeElement;
        if (a && a !== body && a.blur) try { a.blur(); } catch(e){}
        var queueOpen = body.classList.contains('pq-open');
        var layer = topLayer();
        // The queue board sits above the page's own menus; anything opened from inside it is closed by its Escape.
        if (queueOpen && (!layer || !above(layer, document.getElementById('pq-root')))){
          document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true, cancelable: true }));
          return did('queue');
        }
        // A layer with its own history step (the Points hub, a game, the games page) above everything else: leave the step.
        if (historyLayer()){
          var hl = null;
          HIST_LAYERS.forEach(function(id){ var e = document.getElementById(id); if (e && shown(e) && (!hl || above(e, hl))) hl = e; });
          if (hl && (!layer || above(hl, layer))){ history.back(); return did('history #' + hl.id); }
        }
        if (layer){ closeLayer(layer); return did('layer ' + (layer.id ? '#' + layer.id : layer.className)); }
        if (body.classList.contains('ls-open') || body.classList.contains('pw-editing')){
          escapeOnWindow(); return did('editor');
        }
        var cancel = document.querySelector('#select-bar [data-act="cancel"], #ph-select-bar [data-act="cancel"]');
        if (cancel && shown(cancel)){ cancel.click(); return did('select'); }
        if (historyLayer()){ history.back(); return did('history ' + JSON.stringify(history.state)); }
        // The disc clicker's slide-out panel.
        var dc = document.getElementById('dc-widget'), dcTab = document.getElementById('dc-tab');
        if (dc && dcTab && dc.classList.contains('dc-open') && shown(dc)){ dcTab.click(); return did('disc clicker'); }
        // The mini player flipped over to Up next: flip it back.
        var qb = window.__ppQueueBoard;
        if (qb && qb.flipped && qb.flipped()){ qb.flip(false); return did('up next'); }
        var tabs = document.getElementById('pl-tabbar');
        if (tabs && shown(tabs)){
          var on = tabs.querySelector('button.active'), home = tabs.querySelector('[data-pl-view="home"]');
          if (on && home && on !== home && shown(home)){ home.click(); return did('home tab'); }
        }
      } catch(e){ if (typeof ppCaught === 'function') ppCaught(e); }
      return did('') && false;
    };
  })();
