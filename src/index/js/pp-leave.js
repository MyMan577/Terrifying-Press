// ===================== Settings > Playback > Leaving the player =====================
// What happens to what is playing once you leave the player page, and around it:
//  - mini player: the bar above the tabs. Off, leaving the player either keeps the track playing (tap it in Home or
//    the Library to get back to it) or stops it.
//  - media controls notification (and lock-screen controls), other apps' sound (pause / turn down / play along),
//    calls (pause / keep playing), and whether playback survives the app being swiped away. These four are Android's
//    (NativePlayerPlugin.setPlaybackPrefs, PlaybackService) and only show in the app.
// Saved in localStorage 'ppLeaveV1'.
(function(){
  'use strict';
  var KEY = 'ppLeaveV1', body = document.body;
  var DEF = { mini: true, leave: 'keep', notify: true, survive: true, other: 'pause', calls: 'keep' };
  var NAT = !!(window.PPNative && PPNative.available && PPNative.setPlaybackPrefs);
  function get(){ var o = {}; try { o = JSON.parse(localStorage.getItem(KEY)) || {}; } catch(e){} return Object.assign({}, DEF, o); }
  function set(k, v){ var o = get(); o[k] = v; try { localStorage.setItem(KEY, JSON.stringify(o)); } catch(e){} apply(); }

  function apply(){
    var o = get();
    body.classList.toggle('pp-no-mini', !o.mini);
    window.__ppNoMediaNotif = !o.notify;            // read by updateMediaSession (the browser's own media controls)
    if (!o.notify){ try { navigator.mediaSession.metadata = null; navigator.mediaSession.playbackState = 'none'; } catch(e){} }
    else if (window.__ppUpdateMediaSession) window.__ppUpdateMediaSession();
    if (NAT) PPNative.setPlaybackPrefs({ other: o.other, calls: o.calls, notify: !!o.notify, survive: !!o.survive });
    paint();
  }

  // ---------- leaving the player with the mini player off and "Stop the track" ----------
  function closeTrack(){ if (window.__ppCloseTrack) window.__ppCloseTrack(); }
  var wasOpen = body.hasAttribute('data-pl-player');
  new MutationObserver(function(){
    var open = body.hasAttribute('data-pl-player');
    if (wasOpen && !open){
      var o = get();
      // not while the Layout studio moves between screens
      if (!o.mini && o.leave === 'stop' && !body.classList.contains('ls-open')) closeTrack();
    }
    wasOpen = open;
  }).observe(body, { attributes: true, attributeFilter: ['data-pl-player'] });

  // ---------- the section in Settings ----------
  var sec = null;
  function sw(k, title, sub, on, extra){
    return '<div class="settings-row' + (extra || '') + '" data-leave-row="' + k + '"><div class="settings-row-text"><div class="settings-row-title">' + title + '</div><div class="settings-row-sub">' + sub + '</div></div>' +
      '<label class="settings-switch"><input type="checkbox" data-leave="' + k + '"' + (on ? ' checked' : '') + '><span class="settings-switch-track"><span class="settings-switch-thumb"></span></span></label></div>';
  }
  function sel(k, title, sub, val, opts, extra){
    return '<div class="settings-row' + (extra || '') + '" data-leave-row="' + k + '"><div class="settings-row-text"><div class="settings-row-title">' + title + '</div><div class="settings-row-sub">' + sub + '</div></div>' +
      '<select data-leave="' + k + '" aria-label="' + title + '">' + opts.map(function(x){ return '<option value="' + x[0] + '"' + (x[0] === val ? ' selected' : '') + '>' + x[1] + '</option>'; }).join('') + '</select></div>';
  }
  function build(){
    var pane = document.getElementById('sidebar-pane-settings'); if (!pane || document.getElementById('leave-section')) return;
    var o = get();
    sec = document.createElement('div'); sec.className = 'settings-section'; sec.id = 'leave-section';
    sec.innerHTML = '<div class="settings-section-label">Leaving the player</div>' +
      sw('mini', 'Mini player', 'The bar above the tabs with what is playing.', o.mini) +
      sel('leave', 'When you leave the player', 'Keep playing: tap the song in Home or the Library to get back to it. Stop: leaving ends the track.', o.leave,
        [['keep', 'Keep playing'], ['stop', 'Stop the track']], ' pp-leave-sub') +
      (NAT ?
        sw('notify', 'Media controls notification', 'Controls in the notification shade and on the lock screen. Without it, Android may stop the music a while after you leave the app.', o.notify) +
        sel('other', 'When other apps play sound', 'A video in another app, a voice message, a game.', o.other,
          [['pause', 'Pause'], ['duck', 'Turn mine down'], ['mix', 'Keep playing']]) +
        sel('calls', 'During calls', 'Phone and video calls, and while the phone rings.', o.calls, [['keep', 'Keep playing'], ['pause', 'Pause, then carry on']]) +
        sw('survive', 'Keep playing when the app is swiped away', 'Off: closing the app from the recent apps list stops the music.', o.survive)
      : '');
    pane.appendChild(sec);
    sec.addEventListener('change', function(e){
      var k = e.target.dataset && e.target.dataset.leave; if (!k) return;
      set(k, e.target.type === 'checkbox' ? e.target.checked : e.target.value);
    });
    paint();
  }
  function paint(){
    if (!sec) return;
    var o = get(), r = sec.querySelector('[data-leave-row="leave"]');
    if (r) r.style.display = o.mini ? 'none' : '';   // only asked when the mini player is off (rows are flex: [hidden] alone does not hide them)
  }

  apply();
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', build); else build();
  window.PPLeave = { get: get, set: set };
})();
