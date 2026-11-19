  // ---------- The phone's Back button ----------
  // MainActivity asks window.ppBack() what to do with each Back press. It closes the top-most thing on screen, one per press:
  //   1. a menu, dialog, dropdown or popover   2. the layout studio / widget editing   3. the queue board
  //   4. multi-select   5. the player, a library folder, a game, immersive (the history steps those already push)
  //   6. any tab but Home goes back to Home
  // It returns false only when nothing is left to close; the app then goes to the background (music keeps playing).
  (function(){
    'use strict';
    var body = document.body;
    // Things that open and close. They show with an "open" class (or are dialogs that show by not being hidden).
    var LAYER = '[id$="-overlay"].open, [id$="-modal"].open, [id$="-dropdown"].open, [id$="-popover"].open, [id$="-menu"].open, ' +
                '[id$="-sheet"].open, [id$="-panel"].open, #sub-tx.open, [role="dialog"], [aria-modal="true"]';
    // Always-on displays, and layers that close through the history (their popstate handlers do it right).
    var SKIP = '#lyrics-overlay, #subtitle-overlay, #pp-ringscreen, #pq-root, #pq-root *, #pp-games, #pp-games *, #pp-game, #pp-game *';
    var CLOSE = '[id$="-close"], [id$="-close-btn"], [id$="-cancel"], [id$="-cancel-btn"], .modal-close, .close-btn, .pw-sheet-close, ' +
                '[data-act="close"], [data-act="cancel"], [aria-label="Close"], [aria-label="Cancel"], [aria-label^="Close "]';

    function shown(el){
      if (!el || el.hidden || !el.isConnected) return false;
      if (!el.getClientRects().length) return false;
      var cs = getComputedStyle(el);
      return cs.display !== 'none' && cs.visibility !== 'hidden' && cs.pointerEvents !== 'none' && parseFloat(cs.opacity || '1') > 0.05;
    }
    function zOf(el){
      for (var e = el; e && e !== document.documentElement; e = e.parentElement){
        var z = getComputedStyle(e).zIndex;
        if (z !== 'auto' && z !== '') return parseInt(z, 10) || 0;
      }
      return 0;
    }
    function topLayer(){
      var best = null, bestZ = -Infinity;
      document.querySelectorAll(LAYER).forEach(function(el){
        if (el.matches(SKIP) || !shown(el)) return;
        var z = zOf(el);
        // Higher z wins; on a tie the one inside, or later in the page, is on top.
        if (!best || z > bestZ || (z === bestZ && (best.contains(el) || (best.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING)))){
          best = el; bestZ = z;
        }
      });
      return best;
    }
    function gone(el){ return !shown(el) || (el.classList.contains('open') === false && el._ppWasOpen); }
    function click(el){
      ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click'].forEach(function(t){
        var Ev = t.indexOf('pointer') === 0 && window.PointerEvent ? PointerEvent : MouseEvent;
        el.dispatchEvent(new Ev(t, { bubbles: true, cancelable: true, view: window }));
      });
    }
    function closeLayer(el){
      el._ppWasOpen = el.classList.contains('open');
      // 1. its own close / cancel button
      var btns = el.querySelectorAll(CLOSE);
      for (var i = 0; i < btns.length; i++){ if (shown(btns[i])){ btns[i].click(); if (gone(el)) return; break; } }
      // 2. a tap on its backdrop (the overlay itself, or the overlay it sits in)
      var ov = el.matches('[id$="-overlay"]') ? el : el.closest('[id$="-overlay"]');
      if (ov && shown(ov)){ click(ov); if (gone(el)) return; }
      // 3. dropdowns and popovers close on a tap anywhere else
      if (!ov){ click(body); if (gone(el)) return; }
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

    window.ppBack = function(){
      try {
        // A text field being edited: Back first just puts the keyboard away.
        var a = document.activeElement;
        if (a && a !== body && a.matches && a.matches('input:not([type="range"]):not([type="checkbox"]):not([type="radio"]), textarea, [contenteditable="true"]')){
          a.blur(); return true;
        }
        var queueOpen = body.classList.contains('pq-open');
        var layer = topLayer();
        // The queue board sits above the page's own menus; anything opened from inside it is closed by its Escape.
        if (queueOpen && (!layer || zOf(layer) <= zOf(document.getElementById('pq-root')))){
          document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true, cancelable: true }));
          return true;
        }
        if (layer){ closeLayer(layer); return true; }
        if (body.classList.contains('ls-open') || body.classList.contains('pw-editing')){
          escapeOnWindow(); return true;
        }
        var cancel = document.querySelector('#select-bar [data-act="cancel"], #ph-select-bar [data-act="cancel"]');
        if (cancel && shown(cancel)){ cancel.click(); return true; }
        if (historyLayer()){ history.back(); return true; }
        var tabs = document.getElementById('pl-tabbar');
        if (tabs && shown(tabs)){
          var on = tabs.querySelector('button.active'), home = tabs.querySelector('[data-pl-view="home"]');
          if (on && home && on !== home && shown(home)){ home.click(); return true; }
        }
      } catch(e){ if (typeof ppCaught === 'function') ppCaught(e); }
      return false;
    };
  })();
