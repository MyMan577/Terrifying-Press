// ===================== Notifications: reminders, rewards and the odd fun one =====================
// Short notifications built from what is going on in the app: a daily bonus that is ready, a streak about to end, a
// level close by, the song you stopped on, new files waiting in New on this phone, your week in music, and now and
// then something silly. Never more than one a day, only in the daytime, and each kind can be switched off in
// Settings > Notifications. The Android side (PPNotify in JobsPlugin.kt) shows them with the app closed; the list is
// worked out again whenever the app is opened or left, so it always follows the latest streak, level and library.
(function(){
  'use strict';
  var KEY = 'ppNotifyV1', N = window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.PPNotify;
  var KINDS = [
    ['tips', 'Reminders and tips', 'The song you stopped on, new files on your phone, your week in music.'],
    ['rewards', 'Rewards and streaks', 'Your daily bonus is ready, a streak is about to end, a level is close.'],
    ['fun', 'Fun ones', 'Now and then, something silly.']
  ];
  function prefs(){ var p = {}; try { p = JSON.parse(localStorage.getItem(KEY)) || {}; } catch(e){} KINDS.forEach(function(k){ if (typeof p[k[0]] !== 'boolean') p[k[0]] = true; }); return p; }
  function savePrefs(p){ try { localStorage.setItem(KEY, JSON.stringify(p)); } catch(e){} }

  var DAY = 864e5;
  function at(dayOff, h, m){ var d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() + dayOff); d.setHours(h, m || 0, 0, 0); return d.getTime(); }
  function dayOf(ms){ var d = new Date(ms); d.setHours(0, 0, 0, 0); return d.getTime(); }
  function pick(list, seed){ return list[Math.abs(Math.floor(seed)) % list.length]; }
  function plural(n, w){ return n + ' ' + w + (n === 1 ? '' : 's'); }
  function short(s, n){ s = String(s || ''); return s.length > n ? s.slice(0, n - 1) + '…' : s; }

  // ---------- what there is to say ----------
  // Each candidate: { at, kind, pri (higher wins the day), title, text }
  function candidates(){
    var p = prefs(), out = [], now = Date.now(), A = window.__ppApi, K = window.__ppHomeKit;
    var tracks = A && A.tracks ? A.tracks().filter(function(t){ return !t.stem; }) : [];
    var hist = K && K.history ? K.history() : [];
    var byId = {}; tracks.forEach(function(t){ byId[t.dbId] = t; });
    var lastAt = hist.length ? hist[0].at : 0, last = hist.length ? byId[hist[0].id] : null;
    var add = function(o){ if (o.at > now + 60e3) out.push(o); };

    if (p.rewards && window.__ppProgress && tracks.length){
      var g = window.__ppProgress(), n = g.streak;
      // the daily bonus, the morning after you last listened (or later today if not yet)
      var bDay = g.listenedToday ? 1 : 0;
      add({ at: at(bDay, 10, 30), kind:'reward', pri: 5, title: g.nextDay % 7 === 0 ? '🎁 Double bonus day' : '🎁 Daily bonus ready',
        text: '+' + g.nextBonus + ' XP is waiting' + (g.nextDay % 7 === 0 ? ' (day ' + g.nextDay + ' pays double)' : '') + '. Press play to collect it.' });
      // the streak, on the evening before it would end (one missed day is allowed)
      if (n >= 2){
        var endDay = g.listenedToday ? 2 : Math.max(0, g.lastDay + 2 - g.today);
        var rec = n >= 3 && n >= g.best;
        add({ at: at(endDay, 19, 30), kind:'reward', pri: 9, title: '🔥 ' + n + '-day streak at stake',
          text: rec ? 'One song tonight and you set a new record.' : 'One song tonight keeps it alive.' });
      }
      // a level that is close
      var mins = Math.ceil(g.xpToNext / 30);
      if (g.xpToNext > 0 && mins <= 25)
        add({ at: at(1, 13, 0), kind:'reward', pri: 7, title: '⭐ Level ' + (g.level + 1) + ' is close', text: 'About ' + plural(mins, 'minute') + ' of music away.' });
    }

    if (p.tips && tracks.length){
      // the song you stopped on, three days after you last listened
      if (last && lastAt){
        var d3 = Math.max(1, Math.round((dayOf(lastAt) + 3 * DAY - dayOf(now)) / DAY));
        add({ at: at(d3, 18, 0), kind:'tip', pri: 4, title: '🎧 Pick up where you left off', text: short(last.title, 40) + (last.artist && !/^(Unknown artist|Video)$/.test(last.artist) ? ' by ' + short(last.artist, 24) : '') + ' is still waiting.' });
        var d8 = Math.max(1, Math.round((dayOf(lastAt) + 8 * DAY - dayOf(now)) / DAY));
        add({ at: at(d8, 18, 0), kind:'tip', pri: 4, title: '👋 It’s quiet in here', text: plural(tracks.length, 'track') + ' and not one of them playing. Fancy one?' });
      }
      // files found on the phone, waiting to be added
      var found = 0; try { found = (JSON.parse(localStorage.getItem('ppFoundV1')) || []).length; } catch(e){}
      if (found) add({ at: at(1, 17, 0), kind:'tip', pri: 6, title: '📥 New on this phone', text: plural(found, 'new file') + ' found. Add the ones you want in the Library.' });
      // your week, on Sunday evening
      var weekAgo = now - 7 * DAY, plays = hist.filter(function(h){ return h.at > weekAgo; }), cnt = {};
      plays.forEach(function(h){ cnt[h.id] = (cnt[h.id] || 0) + 1; });
      var top = Object.keys(cnt).sort(function(a, b){ return cnt[b] - cnt[a]; })[0], toSun = (7 - new Date().getDay()) % 7 || 7;
      if (plays.length >= 3 && byId[top])
        add({ at: at(toSun, 18, 30), kind:'tip', pri: 3, title: '📊 Your week in music', text: plural(plays.length, 'play') + '. On top: ' + short(byId[top].title, 36) + '.' });
      // a song you have never played
      var heard = {}; hist.forEach(function(h){ heard[h.id] = 1; });
      var unheard = tracks.filter(function(t){ return !heard[t.dbId]; });
      if (unheard.length) add({ at: at(2, 16, 0), kind:'tip', pri: 2, title: '💎 Never played', text: short(pick(unheard, dayOf(now) / DAY).title, 44) + '. Give it a go?' });
    }

    if (p.fun){
      var FUN = [
        ['🌀 Dizzy', 'The fidget spinner misses you. It’s been spinning alone.'],
        ['💿 Click click', 'Your disc hasn’t been clicked today. Just saying.'],
        ['👋 Bloopy says hi', 'That’s it. That’s the notification.'],
        ['🎚️ Try this', 'Slowed + reverb, on a song you know by heart.'],
        ['🎤 Karaoke night?', 'Split the vocals off any song and sing over it.'],
        ['🌙 Wind down', 'The sleep timer can fade the music out for you tonight.'],
        ['🫧 Pop pop pop', 'The pop-it has fresh bubbles. Nobody else is popping them.'],
        ['🔊 Loud thought', 'The bass boost has been very patient.']
      ];
      for (var f = 3; f <= 9; f += 3){ var it = pick(FUN, dayOf(now) / DAY + f); add({ at: at(f, 15, 0), kind:'tip', pri: 1, title: it[0], text: it[1] }); }
    }
    return out;
  }

  // ---------- one a day, the most useful one ----------
  function plan(){
    var best = {};
    candidates().forEach(function(c){ var d = dayOf(c.at); if (!best[d] || c.pri > best[d].pri) best[d] = c; });
    return Object.keys(best).map(function(d){ return best[d]; }).sort(function(a, b){ return a.at - b.at; }).slice(0, 10)
      .map(function(c, i){ return { id: 'n' + Math.floor(dayOf(c.at) / DAY) + '_' + i, at: c.at, kind: c.kind, title: c.title, text: c.text }; });
  }
  var schedT = 0;
  function reschedule(){
    clearTimeout(schedT);
    schedT = setTimeout(function(){ if (N && N.replace) N.replace({ items: plan() }).catch(function(){}); }, 300);
  }
  // left the app, came back, or the library / streak changed in a way that matters
  document.addEventListener('visibilitychange', reschedule);
  window.addEventListener('pagehide', reschedule);
  setTimeout(reschedule, 4000);

  // ---------- Settings > Notifications ----------
  function section(){
    var pane = document.getElementById('sidebar-pane-settings'); if (!pane || document.getElementById('notify-section')) return;
    var p = prefs(), sec = document.createElement('div'); sec.className = 'settings-section'; sec.id = 'notify-section';
    sec.innerHTML = '<div class="settings-section-label">Notifications</div>' + KINDS.map(function(k){
      return '<div class="settings-row"><div class="settings-row-text"><div class="settings-row-title">' + k[1] + '</div><div class="settings-row-sub">' + k[2] + '</div></div>' +
        '<label class="settings-switch"><input type="checkbox" data-notify="' + k[0] + '"' + (p[k[0]] ? ' checked' : '') + '><span class="settings-switch-track"><span class="settings-switch-thumb"></span></span></label></div>';
    }).join('') +
      '<div class="settings-row"><div class="settings-row-text"><div class="settings-row-sub">' + (N ? 'Never more than one a day, and only in the daytime.' : 'Notifications arrive in the Android app.') + '</div></div>' +
      '<button type="button" class="settings-toggle-btn" id="notify-preview">Preview</button></div>';
    pane.appendChild(sec);
    sec.addEventListener('change', function(e){
      var k = e.target.dataset && e.target.dataset.notify; if (!k) return;
      var q = prefs(); q[k] = e.target.checked; savePrefs(q); reschedule();
    });
    sec.querySelector('#notify-preview').addEventListener('click', function(){
      // the next one that would be sent, or a sample of the kinds switched on
      var l = plan(), c = l[0];
      if (!c){ var q = prefs(); c = q.rewards ? { title:'🎁 Daily bonus ready', text:'Press play to collect it.', kind:'reward' } : q.tips ? { title:'🎧 Pick up where you left off', text:'Your last song is still waiting.', kind:'tip' } : q.fun ? { title:'👋 Bloopy says hi', text:'That’s it. That’s the notification.', kind:'tip' } : null; }
      if (!c){ if (window.ppToast) window.ppToast('Every kind of notification is switched off.'); return; }
      if (N && N.show) N.show({ id:'preview', title: c.title, text: c.text, kind: c.kind }).catch(function(){});
      else if (window.ppToast) window.ppToast(c.title + ': ' + c.text);
    });
  }
  window.PPNotify = { plan: plan, reschedule: reschedule, prefs: prefs };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', section); else section();
})();
