/* Touch feel: the numbers every touch handler in the app uses, so a tap, a hold, a flick and a swipe feel the same on
   every screen. Loaded early so any script can read window.PPTouch. Distances are CSS px, speeds px per ms. */
(function(){
  var T = {
    SLOP: 10,           // a finger may wander this far and still be tapping or holding (Android's touch slop is 8 dp)
    HOLD_MS: 450,       // how long a press must last to count as a long-press / hold
    FLICK: 0.5,         // release speed that counts as a flick
    SWIPE_MIN: 40,      // shortest movement that can be a swipe at all; a swipe this short must also be a flick
    SWIPE_SURE: 70,     // a movement this long is a swipe at any speed
    MULTI_GAP_MS: 320,  // double / triple tap: longest wait from a release to the next press
    MULTI_SLOP: 90,     // double / triple tap: how far a follow-up tap may land from the first
    /** True once (x, y) is further than SLOP from (x0, y0). */
    moved: function(x0, y0, x, y){ return Math.hypot(x - x0, y - y0) > T.SLOP; },
    /** Is a movement of `dist` px over `ms` a swipe? Long enough at any speed, or short but quick. */
    isSwipe: function(dist, ms){ return dist >= T.SWIPE_SURE || (dist >= T.SWIPE_MIN && dist / Math.max(1, ms) >= T.FLICK); }
  };
  window.PPTouch = T;
})();
