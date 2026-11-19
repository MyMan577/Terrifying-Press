// ===================== The alarm page: the ringing screen =====================
// Shows the ringing screen (pp-widgets-pendulum.js draws it, with its background and its widgets) for the alarm that
// is ringing, and answers Snooze and Stop: a note for the app ('ppAlarmActV1', counted by the Pendulum code the
// next time the app runs, so it knows about the snooze and never rings this one again), then the phone does the rest.
(function(){
  'use strict';
  var AP = window.__ppAlarmPage, P = window.PPAlarm || null, I = AP.info || {};
  var ACT_KEY = 'ppAlarmActV1';
  function note(x){
    try { var l = JSON.parse(localStorage.getItem(ACT_KEY)) || []; if (!Array.isArray(l)) l = []; l.push(x); localStorage.setItem(ACT_KEY, JSON.stringify(l.slice(-20))); } catch(e){}
  }
  AP.done = function(a, at, snooze, mins, focus){
    var now = Date.now(), id = (a && a.id) || I.alarm || '';
    var snoozeAt = snooze ? now + mins * 60000 : 0;
    note({ id: id, at: at || I.at || now, t: now, snooze: !!snooze, snoozeAt: snoozeAt || undefined, focus: !!focus });
    if (P){ if (snooze) P.snooze(String(snoozeAt)); else P.stop(!!focus); }
    if (snooze && window.ppToast) window.ppToast('Snoozing for ' + mins + ' minutes.');
  };
  // a snooze rang again while the screen was still up: start again with that one
  AP.again = function(){ location.reload(); };

  var until = (I.at || Date.now()) + (+I.timeout || 10 * 60000);
  var shown = AP.ring ? AP.ring(I.alarm || '', I.at, until) : false;
  if (!shown){
    // the alarm is not in the app's list any more (deleted since it was set): a plain screen with Stop
    var el = document.getElementById('pp-ringscreen') || document.body;
    el.hidden = false;
    el.innerHTML = '<div class="prs-bg prs-bg-sunrise"><i></i><i></i><i></i></div><div class="prs-in"><div class="prs-tag"><b></b><span></span></div>' +
      '<div class="prs-zone"></div><div class="prs-act"><button type="button" class="on" data-alp="stop">Stop</button></div></div>';
    el.querySelector('.prs-tag b').textContent = I.label || 'Alarm';
    el.querySelector('.prs-tag span').textContent = I.time || '';
    el.addEventListener('click', function(e){ if (e.target.closest('[data-alp="stop"]')) AP.done(null, I.at, false, 0, false); });
  }
})();
