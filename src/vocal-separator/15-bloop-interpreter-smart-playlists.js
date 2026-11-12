    // ---------- Smarter interpreter in front of the agent. It only works out WHAT you meant; every action still runs through the
    // agent's own safe commands. No chat-model guessing: low confidence asks first, and anything it cannot do it says so. ----------
    // Undo history: every undoable change is pushed here, newest last, so "undo" can step back through many of them, not just the last.
    // Entries are either { media: true, snap, ui } (volume, track, shuffle, play state, and any settings controls the command flipped)
    // or { label, undo } (playlists, mixes, tags and anything that registers itself through smartSt.pu / lcUndo).
    const undoStack = [];
    const uPush = e => { e.at = Date.now(); undoStack.push(e); if (undoStack.length > 40) undoStack.shift(); };
    const smartSt = { last: null, at: 0, snap: null, noRoute: '', get pu() { return null; }, set pu(v) { if (v) uPush(v); } };
    const sRec = (snap, cmd) => {
      smartSt.snap = snap; smartSt.last = cmd; smartSt.at = Date.now();
      let ui = []; try { const A = window.__ppApi; if (snap && A && snap.idx === A.currentIndex()) ui = uiDiff(snap.ui, uiNow()); } catch (e) {}   // a track change reloads many controls by itself, so skip those
      uPush({ media: true, snap, ui, cmd });
    };
    const HELP_SMART = '\n\u2022 \u201cundo\u201d, \u201cagain\u201d, \u201ca bit more\u201d, \u201cmuch quieter\u201d, \u201cvolume up 15\u201d\n\u2022 several at once: \u201cplay something chill and turn it down a bit\u201d\n\u2022 goals: \u201cbedtime\u201d, \u201cgym time\u201d, \u201cstudy mode\u201d, \u201cparty mode\u201d\n\u2022 questions: \u201cis it paused\u201d, \u201cwhat\u2019s the volume\u201d, \u201cis shuffle on\u201d\n\u2022 \u201cmake a playlist for me\u201d, \u201csomething new\u201d, \u201cforgotten favorites\u201d, \u201cplaylist like <song>\u201d\n\u2022 \u201cmake a chill playlist with <song> without <artist>\u201d, \u201cadd <song> to <playlist>\u201d, \u201cremove the slow songs from <playlist>\u201d\n\u2022 typos are fine, and if I am unsure I will ask \u201cdid you mean\u2026\u201d';
    const sClean = r => String(r).trim().replace(/^(hey |hi |ok |okay )?(bloop[,:]?\s*)?/i, '').replace(/^((can|could|would|will) you( please)?|please|pls|i want you to|i'?d like you to|go ahead and)\s+/i, '').replace(/\s*(please|pls|thanks|thank you)[.!?]*$/i, '').replace(/[.!?]+$/, '').trim();
    const sSay = s => { add('bot', blTone(s)); return true; }, sDone = s => sSay('\u2713 ' + s);
    const S_Q = /^(?:what|how|who|which|where|when|why|is|are|am|do|does|did|list|show|tell|my|help)\b|\?$/i;
    const snapNow = () => { const A = window.__ppApi, v = $id('volume'), s = $id('seek'), sb = $id('shuffle-btn'); return { vol: v ? parseFloat(v.value) : null, pos: s ? parseFloat(s.value) : null, idx: A ? A.currentIndex() : -1, shuffle: !!(sb && sb.classList.contains('toggled')), playing: mediaOn(), ui: uiNow() }; };
    // Sliders, switches and drop-downs with an id (equaliser, speed, the settings tickboxes). Volume and the seek bar are handled on their own.
    const uiNow = () => { const o = {}; document.querySelectorAll('input[type=range][id],input[type=checkbox][id],select[id]').forEach(e => { if (e.id === 'seek' || e.id === 'volume' || e.closest('#ppv-chat,#bl-react,#ppv-cfab')) return; o[e.id] = e.type === 'checkbox' ? e.checked : e.value; }); return o; };
    const uiDiff = (a, b) => { const out = []; if (!a || !b) return out; Object.keys(a).forEach(k => { if (k in b && a[k] !== b[k]) out.push([k, a[k]]); }); return out.length > 25 ? [] : out; };   // a huge change list means the page redrew, not the user
    const uiRestore = list => { const n = []; (list || []).forEach(([id, v]) => { const e = document.getElementById(id); if (!e) return; if (e.type === 'checkbox') { if (e.checked === v) return; e.checked = v; e.dispatchEvent(new Event('change', { bubbles: true })); } else { if (e.value === v) return; e.value = v; e.dispatchEvent(new Event('input', { bubbles: true })); e.dispatchEvent(new Event('change', { bubbles: true })); } n.push(id); }); return n; };
    function sExec(cmd) { const b = snapNow(), ok = agent(cmd); if (ok && !S_Q.test(cmd)) { sRec(b, cmd); } return ok; }
    const sKind = s => /\b(louder|quieter|softer|volume|loud|turn (?:it |the \w+ )?(?:up|down))\b/i.test(s) ? 'vol' : /\b(faster|slower|speed|slow)\b/i.test(s) ? 'speed' : /\b(rewind|forward|skip (?:\d|ahead|back|forward)|jump|seek|ff)\b/i.test(s) ? 'seek' : '';
    const sDir = s => /\b(quieter|softer|down|lower|decrease|reduce|slower|slow|rewind|back|backward)\b/i.test(s) ? -1 : /\b(louder|up|raise|increase|higher|faster|forward|ahead|skip|jump)\b/i.test(s) ? 1 : 0;
    const S_AMT = s => /\b(a lot|much|way|so much|a ton|loads|significantly|really|super)\b/i.test(s) ? 25 : /\b(a little|a bit|a touch|a tad|a notch|slightly|just|barely|little|bit)\b/i.test(s) ? 5 : 10;

    // volume: relative ("a bit louder", "down 15", "2 notches up") or absolute ("set it to 40%")
    function relVol(t) {
      const s = t.toLowerCase(); let m;
      if (/\b(speed|tempo|bass|treble|bright\w*|filter|eq|zoom|playlist|frames?)\b/.test(s)) return null;
      if ((m = s.match(/^(?:set|put|make|turn|bring|get)(?: the)?(?: volume| sound| music| it)? (?:up |down )?(?:to|at) (\d{1,3}) ?(?:%|percent|volume)$/))) return { abs: +m[1] };
      const up = /\b(louder|up|higher|raise|increase|boost|crank|bump)\b/.test(s), dn = /\b(quieter|softer|down|lower|decrease|reduce|drop|dim)\b/.test(s);
      if (up === dn || !/\b(louder|quieter|softer|volume|sound|turn (?:it|the music|the sound)|bring (?:it|the)|crank|bump|make it|dim|it (?:up|down))\b/.test(s)) return null;
      const dir = up ? 1 : -1;
      if ((m = s.match(/\bto (\d{1,3})\s*(?:%|percent)/))) return { abs: +m[1] };
      if ((m = s.match(/\b(\d{1,3})\s*(%|percent|points?|notch(?:es)?)?(?!\w)/))) return { d: dir * Math.min(100, +m[1] * (/^notch/.test(m[2] || '') ? 5 : 1)) };
      return { d: dir * S_AMT(s) };
    }
    function sApplyVol(r) {
      const e = $id('volume'); if (!e) return false; const was = Math.round(parseFloat(e.value)), v = Math.max(0, Math.min(100, Math.round(r.abs != null ? r.abs : was + r.d)));
      if (v === was) return sSay('Volume is already at ' + v + '%.');
      e.value = v; e.dispatchEvent(new Event('input', { bubbles: true })); e.dispatchEvent(new Event('change', { bubbles: true }));
      return sDone('Volume ' + v + '% (was ' + was + '%).');
    }

    // undo: steps back through the undo history, newest first. Entries that changed nothing are skipped.
    function sUndoMedia(s) {
      const A = window.__ppApi; if (!s || !A) return [];
      const now = snapNow(), out = [];
      if (s.vol != null && now.vol != null && Math.round(s.vol) !== Math.round(now.vol)) { const e = $id('volume'); e.value = s.vol; e.dispatchEvent(new Event('input', { bubbles: true })); e.dispatchEvent(new Event('change', { bubbles: true })); out.push('volume back to ' + Math.round(s.vol) + '%'); }
      if (s.shuffle !== now.shuffle) { const b = $id('shuffle-btn'); if (b) { b.click(); out.push('shuffle ' + (s.shuffle ? 'on' : 'off')); } }
      const tr = A.tracks();
      if (s.idx >= 0 && s.idx !== now.idx && tr[s.idx]) { A.play(s.idx, tr.map((x, i) => i).filter(i => !tr[i].stem)); out.push('back to \u201c' + tr[s.idx].title + '\u201d'); }
      else if (s.idx === now.idx) {
        const sk = $id('seek'); if (sk && s.pos != null && now.pos != null && Math.abs(s.pos - now.pos) > 2) { sk.value = s.pos; sk.dispatchEvent(new Event('input', { bubbles: true })); sk.dispatchEvent(new Event('change', { bubbles: true })); out.push('back to ' + Math.floor(s.pos / 60) + ':' + String(Math.round(s.pos) % 60).padStart(2, '0')); }
        if (s.playing !== now.playing) { const pb = $id('play-btn'); if (pb) { pb.click(); out.push(s.playing ? 'playing again' : 'paused'); } }
      }
      return out;
    }
    // One step back. Returns the sentence to show, or null when there is nothing left to undo.
    function uStep() {
      while (undoStack.length) {
        const u = undoStack.pop();
        if (u.media) {
          const out = sUndoMedia(u.snap), st = uiRestore(u.ui); if (st.length) out.push('put ' + st.length + ' setting' + (st.length > 1 ? 's' : '') + ' back');
          if (out.length) return 'Undid that: ' + out.join(', ') + '.'; continue;
        }
        try { u.undo(); } catch (e) { console.error(e); return 'I could not undo that: ' + e.message; }
        return u.label;
      }
      return null;
    }
    function sUndo(n) {
      if (!window.__ppApi) return false;
      if (!n || n < 2) { const r = uStep(); return r ? sDone(r) : sSay('There is nothing to undo yet.'); }
      const done = []; for (let i = 0; i < n; i++) { const r = uStep(); if (!r) break; done.push(r.replace(/^Undid that: /, '')); }
      return done.length ? sDone('Undid ' + done.length + ' thing' + (done.length > 1 ? 's' : '') + ': ' + done.join(' ')) : sSay('There is nothing to undo yet.');
    }

    // goals -> a short plan of ordinary commands
    const S_SCENES = [
      [/\b(bed ?time|time (?:for|to go to) (?:bed|sleep)|night ?mode|sleep mode|lights out|getting ready for bed)\b/i, ['play something sleep', 'sleep timer 30 minutes'], 'Bedtime mode:'],
      [/\b(?:work ?out|gym|training|exercise) (?:mode|time|session)\b|\b(?:hit|going to|heading to|off to) the gym\b|\btime to (?:work ?out|train|exercise|lift)\b/i, ['play something workout', 'shuffle on'], 'Workout mode:'],
      [/\b(?:study|focus|homework|deep work|work) (?:mode|time|session)\b|\btime to (?:study|focus|concentrate|get work done)\b|\bhelp me (?:focus|concentrate|study)\b/i, ['play something focus'], 'Focus mode:'],
      [/\b(?:party|dance) (?:mode|time)\b|\bstart the party\b|\blet'?s party\b|\bget the party started\b/i, ['play something party', 'shuffle on'], 'Party mode:'],
      [/\b(?:chill|relax(?:ation)?|unwind|wind[- ]down) (?:mode|time)\b|\bi (?:need|want) to (?:relax|unwind|chill|calm down)\b/i, ['play something chill'], 'Chill mode:']
    ];
    function sChain(steps, intro) {
      if (intro) sSay(intro);
      for (const c of steps) {
        const sb = $id('shuffle-btn'); if (c === 'shuffle on' && sb && sb.classList.contains('toggled')) continue;
        let ok = false; try { ok = agent(c, true); } catch (e) { console.error(e); return sSay('Oops, that step did not work: ' + e.message); }
        if (!ok) return sSay('I could not do \u201c' + c + '\u201d.');
      }
      return true;
    }

    // several commands in one sentence. Only splits when every piece starts like a command, and never inside a song title.
    const S_VERB = /^(?:play|pause|stop|resume|continue|next|skip|previous|prev|back|shuffle|repeat|loop|mute|unmute|volume|turn|set|make|add|remove|rename|tag|split|open|show|go|jump|rewind|restart|replay|speed|slow|faster|slower|louder|quieter|softer|lower|raise|sleep|eq|enable|disable|search|find|zoom|rotate|surprise|get|put|queue|clear|cancel|crank|bring|dim|bump|fullscreen|full|split|separate|tag|analy[sz]e)\b/i;
    // Any command can start a later part. A later part must begin with a command word, so "play Jazz and Rock" stays one request.
    const S_LEAD = /^(?:play|pause|stop|resume|continue|next|skip|previous|prev|back|shuffle|repeat|loop|mute|unmute|volume|turn|set|make|add|remove|rename|tag|split|separate|analy[sz]e|open|show|go|jump|rewind|restart|replay|speed|slow|faster|slower|louder|quieter|softer|lower|raise|increase|decrease|boost|reduce|sleep|eq|enable|disable|search|find|zoom|rotate|surprise|get|put|queue|clear|cancel|crank|bring|dim|bump|fullscreen|full|what|how|which|who|why|where|when|is|are|do|does|can|list|tell|flip|toss|roll|pick|choose|duplicate|copy|clone|empty|forget|teach|learn|like|more|less|start|begin|reset|use|select|give|remind|undo|again|help|lyrics|transcribe|mix|recommend|suggest|timer|stem|stems|bloop|you|i)\b/i;
    function sSplit(t) {
      if (t.length > 400 || !/\b(?:and|then|after that)\b|[,;&]/i.test(t)) return null;
      // keep library titles intact (e.g. "Tom and Jerry") by hiding them while splitting
      const keep = []; let s = t;
      sReal().map(i => window.__ppApi.tracks()[i].title).filter(x => x && x.length >= 3).sort((a, b) => b.length - a.length).forEach(title => {
        const re = new RegExp(title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
        s = s.replace(re, mt => { keep.push(mt); return '\u0001' + (keep.length - 1) + '\u0001'; });
      });
      const parts = s.split(/\s*(?:[,;]\s*(?:and\s+|then\s+)?|\s+&\s+|\s+and\s+then\s+|\s+then\s+|\s+and\s+|\s+after that\s+)/i)
        .map(x => x.trim()).filter(Boolean).map(x => x.replace(/\u0001(\d+)\u0001/g, (_, k) => keep[+k]));
      if (parts.length < 2 || parts.length > 8) return null;
      if (!parts.slice(1).every(p => S_LEAD.test(p))) return null;
      return parts;
    }

    // typo repair: only retried after the exact text failed, never touches song titles, and says what it read
    const S_VOCAB = 'play pause stop resume continue next skip previous shuffle repeat loop mute unmute volume louder quieter softer restart replay rewind forward speed faster slower fullscreen playlist playlists lyrics split sleep timer equalizer search open show immersive library music track song turn down switch enable disable'.split(' ');
    const S_TITLEV = /^(?:play|queue|find|search|add|put|make|create|rename|delete|remove|look|locate|where)$/i;
    function sLev(a, b) {
      const m = a.length, n = b.length, d = []; for (let i = 0; i <= m; i++) d[i] = [i]; for (let j = 1; j <= n; j++) d[0][j] = j;
      for (let i = 1; i <= m; i++) for (let j = 1; j <= n; j++) { d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)); if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1); }
      return d[m][n];
    }
    function sFixTypos(t) {
      const w = t.split(/\s+/); let ch = false;
      for (let i = 0; i < Math.min(w.length, 4); i++) {
        const x = w[i].toLowerCase(); if (i > 0 && S_TITLEV.test(w[0])) break;
        if (x.length < 4 || /\d/.test(x) || S_VOCAB.includes(x)) continue;
        let best = null, bd = 9;
        for (const v of S_VOCAB) { if (Math.abs(v.length - x.length) > 2) continue; const d = sLev(x, v); if (d < bd && d <= (x.length >= 7 ? 2 : 1) && (x[0] === v[0] || x.length >= 7)) { bd = d; best = v; } }
        if (best) { w[i] = best; ch = true; }
      }
      return ch ? w.join(' ') : t;
    }

    // live state questions, answered from the real player (never from memory)
    function sStatus(t) {
      const A = window.__ppApi, s = t.toLowerCase(); let m;
      if (/\b(shuffl\w*)\b/.test(s) && /^(?:is|are|am)\b/.test(s)) { const b = $id('shuffle-btn'); return b ? sSay('Shuffle is ' + (b.classList.contains('toggled') ? 'on.' : 'off.')) : false; }
      if (/\b(repeat\w*|loop\w*)\b/.test(s) && /^(?:is|are|am)\b/.test(s)) { const b = $id('repeat-btn'); return b ? sSay(b.title === 'Repeat' ? 'Repeat is off.' : b.title + ' is on.') : false; }
      if (/^(?:what'?s|what is|how loud is)(?: the| my)?(?: current)? ?(?:volume|sound level|it)?(?: level| at)?$|^how loud(?: is it)?$/.test(s) && /volume|loud|level/.test(s)) { const v = $id('volume'); return v ? sSay('Volume is ' + Math.round(parseFloat(v.value)) + '%.') : false; }
      if (/^(?:is|are)\b.*\b(playing|paused)\b/.test(s) && s.split(/\s+/).length <= 6) return sSay(A.currentIndex() < 0 ? 'Nothing is loaded yet.' : mediaOn() ? 'Yes, it is playing.' : 'No, it is paused.');
      return false;
    }

    // did-you-mean router: a catalog of intents with example phrasings, scored with typo-tolerant word overlap
    const S_CAT = [
      ['pause', 1, ['pause the music', 'stop the music', 'stop playing', 'hold on', 'pause it']],
      ['play', 1, ['resume the music', 'continue playing', 'start the music', 'unpause', 'keep going', 'carry on', 'play it']],
      ['play something', 1, ['play something', 'put something on', 'play anything', 'play whatever', 'just play something']],
      ['next', 1, ['next song', 'skip song', 'skip track', 'play the next one', 'another song', 'next track', 'skip it', 'play something else']],
      ['previous', 1, ['previous song', 'go back a song', 'play the last song', 'last track', 'previous track', 'play the one before']],
      ['louder', 1, ['louder', 'turn it up', 'volume up', 'raise the volume', 'increase the volume', 'i cannot hear', 'too quiet']],
      ['quieter', 1, ['quieter', 'turn it down', 'volume down', 'lower the volume', 'decrease the volume', 'too loud']],
      ['mute', 1, ['mute', 'silence', 'mute the sound', 'no sound']],
      ['unmute', 1, ['unmute', 'sound back on', 'bring the sound back']],
      ['shuffle on', 1, ['shuffle on', 'turn on shuffle', 'shuffle my music', 'mix it up', 'play in random order', 'randomize']],
      ['shuffle off', 1, ['shuffle off', 'turn off shuffle', 'stop shuffling', 'play in order', 'no shuffle']],
      ['restart', 1, ['restart the song', 'play it again', 'start over', 'from the beginning', 'replay this song', 'back to the start']],
      ['repeat this song', 1, ['repeat this song', 'loop this song', 'keep playing this song', 'repeat one', 'play this on repeat']],
      ['fullscreen', 1, ['fullscreen', 'full screen', 'make it bigger', 'go full screen', 'enlarge the video']],
      ["what's this song", 1, ['what song is this', 'what is playing', 'who sings this', 'name of this song', 'whats this song', 'what am i hearing']],
      ['more like this', 1, ['more like this', 'songs like this', 'similar songs', 'play similar music']],
      ['faster', 1, ['faster', 'speed up', 'speed it up', 'play faster']],
      ['slower', 1, ['slower', 'slow down', 'slow it down', 'play slower']],
      ['time left', 1, ['how much time is left', 'time remaining', 'how long is left', 'how long until it ends', 'how much longer']],
      ['my playlists', 1, ['show my playlists', 'list my playlists', 'what playlists do i have', 'my playlists']],
      ['library stats', 1, ['library stats', 'how many songs do i have', 'how big is my library', 'tell me about my library']],
      ['help', 1, ['help', 'what can you do', 'what can i say', 'show me commands']],
      ['get the lyrics', 0, ['get the lyrics', 'write the lyrics', 'show me the lyrics', 'transcribe this song', 'lyrics for this song']],
      ['split this song', 0, ['split this song', 'separate the vocals', 'remove the vocals', 'make a karaoke version', 'get the stems', 'isolate the vocals']],
      ['tag this song', 0, ['tag this song', 'analyze this song', 'find the bpm', 'what is the key', 'detect the tempo']]
    ];
    const S_STOP = new Set(['the', 'a', 'an', 'to', 'of', 'this', 'that', 'it', 'please', 'my', 'me', 'i', 'you', 'can', 'could', 'would', 'now', 'just', 'and', 'for']);
    const sToks = s => String(s).toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, ' ').split(/\s+/).filter(w => w && !S_STOP.has(w)).map(w => w.length > 4 ? w.replace(/(?:ing|ed|es|s)$/, '') : w);
    function sScore(Q, P) {
      if (!Q.length || !P.length) return 0; const used = new Set(); let hit = 0;
      P.forEach(p => { const j = Q.findIndex((q, k) => !used.has(k) && (q === p || (p.length >= 5 && sLev(q, p) <= 1) || (p.length >= 8 && sLev(q, p) <= 2))); if (j >= 0) { used.add(j); hit++; } });
      const pr = hit / Q.length, rc = hit / P.length; return pr + rc ? 2 * pr * rc / (pr + rc) : 0;
    }
    function sRank(t) {
      const Q = sToks(t); if (!Q.length || Q.length > 7) return [];
      return S_CAT.map(([cmd, safe, ph]) => ({ cmd, safe, s: Math.max(...ph.map(p => sScore(Q, sToks(p)))) })).filter(x => x.s >= .55).sort((a, b) => b.s - a.s);
    }
    // Runs after the exact rules, tag talk and small talk, right before the chat model. Returns true when it answered.
    function routeIntent(raw) {
      const t = sClean(raw); if (!t || t.length > 70 || smartSt.noRoute === raw || /\b(?:don'?t|dont|do not|never|without)\b/i.test(t) || !window.__ppApi) return false;
      const r = sRank(t); if (!r.length) return false;
      const top = r[0], nxt = r[1];
      if (top.safe && top.s >= .85 && (!nxt || top.s - nxt.s >= .2)) { const n = add('bot', '(Reading that as \u201c' + top.cmd + '\u201d.)'); if (sExec(top.cmd)) return true; n.remove(); return false; }
      add('bot', 'Did you mean ' + r.slice(0, 2).map(x => '\u201c' + x.cmd + '\u201d').join(' or ') + '?');
      actions(r.slice(0, 2).map(x => ['\u25b6 ' + x.cmd, (b, d) => { d.remove(); sExec(x.cmd); }]).concat([['Neither', (b, d) => { d.remove(); smartSt.noRoute = raw; send(raw, true); }]]));
      return true;
    }

    function smart(raw, noAl, noSplit) {
      const A = window.__ppApi, t = sClean(blFrame(raw)); if (!A || !t) return false;
      if (!noAl && !blChain) blQueue = [];
      if (!noAl) { const al = blAlias(t); if (al) { add('bot', '(Reading that as \u201c' + al + '\u201d.)'); if (!smart(al, true)) add('bot', 'I learned \u201c' + t + '\u201d as \u201c' + al + '\u201d, but I cannot do that. Say \u201cforget ' + t + '\u201d to remove it.'); return true; } }
      if (/^(?:undo|undo (?:that|it|this)|take (?:that|it) back|revert(?: that)?|put it back|go back to how it was)$/i.test(t)) return sUndo();
      { const mu = t.match(/^undo (?:(all|everything)(?: you did| i did| that)?|(?:the )?(?:last )?(\d{1,2})(?: times| things| actions| steps| changes)?)$/i); if (mu) return sUndo(mu[1] ? 40 : Math.max(1, +mu[2])); }
      if (/^(?:again|do (?:that|it) again|one more time|once more|same again|repeat that|do the same)$/i.test(t)) return smartSt.last ? smart(smartSt.last) : sSay('I have nothing to repeat yet.');
      const before = snapNow();
      const fin = (ok, cmd) => { if (ok && cmd && !S_Q.test(cmd)) { sRec(before, cmd); } return ok; };
      // "a bit more", "less", "too much": continue or reverse the last volume / speed / seek change
      const fu = t.match(/^(?:(?:and|even|just|still|some|a little|a bit|a lot|much|slightly)\s+)*(more|less|further|too much|too little|not enough)$/i);
      if (fu && smartSt.last && Date.now() - smartSt.at < 180000 && sKind(smartSt.last)) {
        const k = sKind(smartSt.last), dir = (sDir(smartSt.last) || 1) * (/^(less|too much)$/i.test(fu[1]) ? -1 : 1), amt = S_AMT(t);
        if (k === 'vol') return fin(sApplyVol({ d: dir * amt }), dir > 0 ? 'louder' : 'quieter');
        if (k === 'speed') return fin(agent(dir > 0 ? 'faster' : 'slower', true), dir > 0 ? 'faster' : 'slower');
        return fin(agent((dir > 0 ? 'skip forward ' : 'rewind ') + (amt === 25 ? 30 : amt === 5 ? 5 : 10) + ' seconds', true), dir > 0 ? 'skip forward' : 'rewind');
      }
      try { if (sPlaylistCmd(t)) return true; } catch (e) { console.error(e); return sSay('Oops, that playlist request did not work: ' + e.message); }
      if (t.length < 70) { const sc = S_SCENES.find(x => x[0].test(t)); if (sc) return fin(sChain(sc[1], sc[2]), t); }
      if (!noSplit) { const parts = sSplit(t); if (parts) { blRunChain(parts); if (!S_Q.test(t)) { sRec(before, t); } return true; } }
      if (agent(raw)) { if (!S_Q.test(t)) { sRec(before, t); } return true; }
      const rv = relVol(t); if (rv && $id('volume')) return fin(sApplyVol(rv), t);
      { const kw = kwRoute(t); if (kw) { if (kw.cmd === 'undo') return sUndo(); if (kw.cmd) return sExec(kw.cmd); if (blChain) return false; return kwPick(kw.ask, 'Did you mean ' + kw.ask.map(c => '\u201c' + c + '\u201d').join(' or ') + '?'); } }
      if (sStatus(t)) return true;
      if (!blChain) { const tc = typoCands(t); if (tc.length) return kwPick(tc, 'Did you mean ' + tc.map(c => '\u201c' + c + '\u201d').join(' or ') + '?'); }
      return false;
    }
    // SMART END

    // PLAYLISTS START
    // ---------- Smarter playlists: For you / Discover / Forgotten favourites, "like <song>", with / without, add / remove by name ----------
    // Picks use your tags, the stem-tagger's sound embeddings and your listening history (Portfolio). Selection is diversity-aware
    // (maximal marginal relevance + a per-artist cap), then ordered so neighbours flow. Nothing here uses the chat model.
    const sNrm = x => String(x).toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');
    const sReal = () => { const tr = window.__ppApi.tracks(); return tr.map((x, i) => i).filter(i => !tr[i].stem); };
    let sPFmemo = { at: 0, v: {} };
    const sPF = () => { if (Date.now() - sPFmemo.at < 2000) return sPFmemo.v; try { if (window.PPPortfolioApi && window.PPPortfolioApi.flush) window.PPPortfolioApi.flush(); } catch (e) {} let v = {}; try { v = (JSON.parse(localStorage.getItem('pppSaveV1')) || {}).trackPlays || {}; } catch (e) {} sPFmemo = { at: Date.now(), v }; return v; };
    function sTaste() {   // what you actually listen to: top tracks weighted by plays, time listened and recency
      const A = window.__ppApi, tr = A.tracks(), pf = sPF(), now = Date.now(), idx = new Map(tr.map((t, i) => [String(t.dbId), i])), count = new Map(), last = new Map(), an = [];
      Object.entries(pf).forEach(([id, p]) => {
        const i = idx.get(String(id)); if (i == null || tr[i].stem || !p || !(p.count > 0)) return;
        const lp = typeof p.lastPlayed === 'number' ? p.lastPlayed : (Date.parse(p.lastPlayed) || 0), days = lp ? (now - lp) / 864e5 : 0;
        count.set(i, p.count); last.set(i, lp); an.push([i, (Math.log(1 + p.count) + Math.min(3, (p.totalMs || 0) / 9e5)) * Math.exp(-days / 60)]);
      });
      an.sort((a, b) => b[1] - a[1]); return { anchors: an.slice(0, 15), count, last };
    }
    const sJac = (x, y) => { if (!x.size || !y.size) return 0; let n = 0; x.forEach(v => { if (y.has(v)) n++; }); return n / (x.size + y.size - n); };
    function sFeat(c) {
      if (!c) return null;
      return { v: new Set(vibes(c).filter(v => !/^(slow|mid-tempo|fast|very-fast|vocals)$/.test(v))), g: new Set((c.gp || []).map(x => x[0]).concat((c.gn || []).slice(0, 2).map(x => x[0]))), i: new Set((c.in || []).slice(0, 5).map(x => x[0])), bpm: c.bpm || 0, ck: c.ck || '' };
    }
    function sFSim(a, b) {   // tag similarity 0..1: mood, genre, instruments, tempo (half/double aware), key
      if (!a || !b) return .1;
      const bp = a.bpm && b.bpm ? Math.exp(-Math.min(Math.abs(a.bpm - b.bpm), Math.abs(a.bpm * 2 - b.bpm), Math.abs(a.bpm - b.bpm * 2)) / 25) : .3;
      return .35 * sJac(a.v, b.v) + .3 * sJac(a.g, b.g) + .15 * sJac(a.i, b.i) + .12 * bp + .08 * (camOk(a.ck, b.ck) ? 1 : 0);
    }
    async function sEmbScores(seedIdx, wts) {   // cosine to the weighted average of the seeds' sound embeddings; null when the seeds were never analysed
      const A = window.__ppApi, tr = A.tracks(), embs = await Promise.all(tr.map(t => loadEmb(t.dbId).catch(() => null)));
      const seeds = seedIdx.map((i, k) => [i, wts ? wts[k] : 1]).filter(x => embs[x[0]]); if (!seeds.length) return null;
      const have = tr.map((_, i) => i).filter(i => embs[i]), D = embs[have[0]].length, mean = new Float32Array(D);
      have.forEach(i => { for (let c = 0; c < D; c++) mean[c] += embs[i][c] / have.length; });
      const norm = i => { const v = new Float32Array(D); let n = 0; for (let c = 0; c < D; c++) { v[c] = embs[i][c] - mean[c]; n += v[c] * v[c]; } n = Math.sqrt(n) || 1; for (let c = 0; c < D; c++) v[c] /= n; return v; };
      const q = new Float32Array(D); seeds.forEach(([i, w]) => { const v = norm(i); for (let c = 0; c < D; c++) q[c] += v[c] * w; });
      let qn = 0; for (let c = 0; c < D; c++) qn += q[c] * q[c]; qn = Math.sqrt(qn) || 1;
      const out = new Map(); have.forEach(i => { const v = norm(i); let s = 0; for (let c = 0; c < D; c++) s += q[c] * v[c]; out.set(i, s / qn); }); return out;
    }
    // Maximal marginal relevance: each pick balances "fits the brief" against "too close to what is already chosen", with a per-artist cap.
    function sMMR(cands, rel, F, k, lam, cap, tr, already) {
      const art = i => sNrm(tr[i].artist || ''), picked = [], per = {}, rest = cands.slice(), ms = new Map(), al = already || [];
      al.forEach(i => { const a = art(i); if (a) per[a] = (per[a] || 0) + 1; });
      rest.forEach(i => { let m = 0; al.forEach(p => { m = Math.max(m, sFSim(F.get(i), F.get(p))); }); ms.set(i, m); });
      let c = cap;
      while (picked.length < k && rest.length) {
        let bi = -1, bs = -1e9;
        for (let n = 0; n < rest.length; n++) { const i = rest[n], a = art(i); if (a && (per[a] || 0) >= c) continue; const s = lam * rel(i) - (1 - lam) * ms.get(i); if (s > bs) { bs = s; bi = n; } }
        if (bi < 0) { if (c > cap + 3) break; c++; continue; }
        const i = rest.splice(bi, 1)[0]; picked.push(i); const a = art(i); if (a) per[a] = (per[a] || 0) + 1;
        rest.forEach(j => { const s = sFSim(F.get(i), F.get(j)); if (s > ms.get(j)) ms.set(j, s); });
      }
      return picked;
    }
    function sFlow(list, F, tr, first) {   // order so neighbours fit (tempo / mood / key) and the same artist never plays twice in a row
      const rest = list.slice(), out = []; let cur = first != null && rest.includes(first) ? first : rest[0]; if (cur == null) return out;
      rest.splice(rest.indexOf(cur), 1); out.push(cur);
      while (rest.length) {
        const a = sNrm(tr[cur].artist || ''); let bi = 0, bs = -9;
        rest.forEach((j, n) => { const s = sFSim(F.get(cur), F.get(j)) - (a && sNrm(tr[j].artist || '') === a ? .5 : 0) + Math.random() * .05; if (s > bs) { bs = s; bi = n; } });
        cur = rest.splice(bi, 1)[0]; out.push(cur);
      }
      return out;
    }

    // ---- turning words into tracks: "Hello", "Adele", "slow songs", "piano", "this song" ----
    const S_CUR = /^(?:this|that|it|current|the current|(?:this|that|the current|current) (?:song|track|one)|what'?s playing|what is playing|the one (?:playing|that'?s playing)(?: now)?)$/i;
    const S_FILL = new Set(['make', 'create', 'build', 'generate', 'give', 'get', 'put', 'together', 'start', 'compose', 'curate', 'new', 'another', 'some', 'me', 'my', 'the', 'a', 'an', 'of', 'that', 'is', 'are', 'for', 'you', 'playlist', 'playlists', 'mix', 'mixtape', 'song', 'songs', 'track', 'tracks', 'music', 'please', 'just', 'only', 'all', 'any', 'more', 'also', 'stuff', 'thing', 'things', 'something', 'one', 'ones']);
    function sResolve(m0) {   // -> {tracks, artist?} | {vibes} | {words, tracks} | {none} | null
      const A = window.__ppApi, tr = A.tracks(), real = sReal();
      if (S_CUR.test(String(m0).trim())) { const c = A.currentIndex(); return c >= 0 ? { tracks: [c] } : { none: true }; }
      const cleaned = String(m0).trim().replace(/^(?:the |a |an |some |any )+/i, '').replace(/^(?:songs?|tracks?|music|artists?|bands?|stuff)\s+(?:by |from )?/i, ''), q = sNrm(cleaned); if (!q) return null;
      const pf = sPF(), pc = i => (pf[tr[i].dbId] || pf[String(tr[i].dbId)] || {}).count || 0, best = a => a.slice().sort((x, y) => pc(y) - pc(x))[0];
      const ti = i => sNrm(tr[i].title), an = i => sNrm(tr[i].artist || '');
      const ex = real.filter(i => ti(i) === q); if (ex.length) return { tracks: [best(ex)] };
      const toks = cleaned.toLowerCase().split(/[^\p{L}\p{N}'-]+/u).filter(w => w && !S_FILL.has(w));
      if (toks.length && toks.every(w => VIBEW.has(w) || VIBE_SYN[w])) return { vibes: vibeWordsOf(cleaned) };
      const by = cleaned.match(/^(.+?)\s+by\s+(.+)$/i);
      if (by) { const a = sNrm(by[2]), tt = sNrm(by[1]), r = real.filter(i => ti(i).includes(tt) && an(i).includes(a)); if (r.length) return { tracks: [best(r)] }; }
      const ar = real.filter(i => an(i) === q || an(i) === 'the' + q); if (ar.length) return { artist: q, tracks: ar.sort((x, y) => pc(y) - pc(x)) };
      const ws = cleaned.toLowerCase().split(/[^\p{L}\p{N}']+/u).filter(w => w.length > 1 || /\d/.test(w));
      if (ws.length) {
        const hay = i => (tr[i].title + ' ' + (tr[i].artist || '')).toLowerCase(), c = real.filter(i => ws.every(w => hay(i).includes(w)));
        if (c.length) {
          const tc = c.filter(i => ws.every(w => tr[i].title.toLowerCase().includes(w)));
          if (tc.length) { tc.sort((x, y) => (ti(y).startsWith(q) - ti(x).startsWith(q)) || (ti(x).length - ti(y).length) || (pc(y) - pc(x))); return { tracks: [tc[0]] }; }
          return { artist: q, tracks: c.sort((x, y) => pc(y) - pc(x)) };
        }
        const tgs = loadTags(), w2 = ws.filter(x => x.length > 2);
        if (w2.length) { const m = real.filter(i => { const c = tgs[tr[i].dbId]; return c && w2.every(x => (' ' + tagWords(c) + ' ').includes(' ' + x + ' ')); }); if (m.length) return { words: w2, tracks: m }; }
      }
      return null;
    }
    function sMentions(str) {   // "A, B and C" -> ["A","B","C"], unless the whole thing is one title / artist
      const s = String(str).replace(/["\u201c\u201d]/g, '').trim(); if (!s) return [];
      if (sResolve(s)) return [s];
      return s.split(/\s*(?:,|;|&|\band\b|\bor\b|\bplus\b)\s*/i).map(x => x.trim()).filter(Boolean);
    }
    const sLabel = (r, m) => { const tr = window.__ppApi.tracks(); return r.vibes ? r.vibes.join(' + ') + ' songs' : r.words ? r.words.join(' ') + ' songs' : r.artist ? tr[r.tracks[0]].artist : '\u201c' + tr[r.tracks[0]].title + '\u201d'; };
    function sApply(sp, m, mode) {
      const r = sResolve(m), tr = window.__ppApi.tracks(); if (!r) { sp.miss.push(m); return; } if (r.none) { sp.miss.push(m + ' (nothing is playing)'); return; }
      const lab = sLabel(r, m);
      if (mode === 'seed') { if (r.vibes || r.words) { sp.miss.push(m + ' (I need a song or artist to match)'); return; } sp.seeds.push(...(r.artist ? r.tracks.slice(0, 5) : r.tracks)); sp.said.seed.push(lab); }
      else if (mode === 'inc') { if (r.vibes) sp.themeWords.push(...r.vibes); else if (r.words) sp.themeWords.push(...r.words); else sp.include.push(...(r.artist ? r.tracks.slice(0, 6) : r.tracks)); sp.said.inc.push(lab); }
      else { if (r.vibes) sp.exVibes.push(...r.vibes); else if (r.words) sp.exWords.push(...r.words); else if (r.artist) sp.exArtists.push(sNrm(tr[r.tracks[0]].artist)); else sp.exclude.push(...r.tracks); sp.said.exc.push(lab); }
    }
    // ---- reading a playlist request ----
    const S_STOPM = '(?=\\s+(?:with|without|including|include|featuring|excluding|exclude|except|but|and (?:no|without|exclude|not)|no|not|similar|based on|inspired|called|named)\\b|$)';
    const R_SIM = new RegExp('\\b(?:similar to|similar|(?:songs|tracks|music|stuff|playlist|mix|something|vibes?) like|based on|inspired by|in the style of|(?:sounds?|sounding) like|resembling)\\s+(.+?)' + S_STOPM, 'i');
    const R_EXC = /\b(?:without|excluding|exclude|except(?: for)?|but (?:no|not|without)|and (?:no|without|exclude|not)|not including|leave out|leaving out|minus|skip|no)\s+(.+?)(?=\s+(?:with|including|include|featuring|similar|based on|inspired|called|named)\b|$)/i;
    const R_INC = new RegExp('\\b(?:with|including|include|featuring|containing|that (?:has|have|includes?|contains?)|plus|and add|also add)\\s+(.+?)' + S_STOPM, 'i');
    function sParsePl(t0) {
      const t = t0.replace(/^(?:i (?:want|need|would like|'d like|wanna)|can i (?:get|have)|could you|let'?s|how about)\s+/i, '').trim(), s = t.toLowerCase();
      const hasPl = /\b(?:playlists?|mix|mixtape)\b/.test(s);
      const mk = /^(?:make|create|build|generate|give|get|put together|start|compose|curate|set up|queue up|refresh|redo|regenerate|remake|new|another)\b/.test(s) || /^(?:a |an |my |the )?(?:playlist|mix|mixtape)\b/.test(s);
      const rec = /^(?:recommend|suggest)\w*\b/.test(s) || /^(?:give|get|make|show)(?: me)?(?: some| a few)? (?:recommendations?|suggestions?)\b/.test(s);
      if (!((hasPl && mk) || rec)) return null;
      const sp = { kind: 'custom', seeds: [], include: [], exclude: [], exArtists: [], exVibes: [], exWords: [], themeWords: [], themeSet: null, theme: '', size: 0, name: '', miss: [], said: { seed: [], inc: [], exc: [] } };
      let w = t, m;
      if ((m = w.match(/\b(?:called|named|titled)\s+["\u201c]?(.+?)["\u201d]?$/i))) { sp.name = m[1].trim().slice(0, 50); w = w.replace(m[0], ' '); }
      if ((m = s.match(/\b(\d{1,3})[- ]?(?:song|track)s?\b/))) sp.size = +m[1]; else if (/\b(?:short|small|quick)\b/.test(s)) sp.size = 10; else if (/\b(?:long|big|huge|large)\b/.test(s)) sp.size = 40;
      const grab = (re, mode) => { const x = w.match(re); if (!x) return false; w = w.replace(x[0], ' '); sMentions(x[1]).forEach(mm => sApply(sp, mm, mode)); return true; };
      grab(R_SIM, 'seed'); const hadEx = grab(R_EXC, 'exc'), hadIn = grab(R_INC, 'inc');
      let byArtist = null; if ((m = w.match(/\bby\s+(.+?)(?:\s+songs?)?$/i))) { const r = sResolve(m[1]); if (r && r.artist) { byArtist = r.tracks; w = w.replace(m[0], ' '); } }
      if (/\b(?:rediscover|forgotten (?:favou?rites|songs|tracks)|old favou?rites|songs i forgot|(?:haven'?t|have not) (?:played|heard|listened to)[\w\s]* in (?:a )?(?:while|ages)|drifted away)\b/.test(s)) sp.kind = 'redisc';
      else if (/\b(?:discover|something new|new (?:songs|music|tracks|stuff)|(?:haven'?t|have not|never) (?:played|heard|listened to)|unplayed|unheard|new to me|hidden gems?|deep cuts?)\b/.test(s)) sp.kind = 'discover';
      else if (/\b(?:for you|for me|recommend\w*|suggest\w*|daily mix|made for me|i might like|i(?:'d| would) like(?! to)|based on (?:what i|my) (?:listen|play|like|taste)|my taste)\b/.test(s)) sp.kind = 'foryou';
      if (sp.seeds.length) sp.kind = 'similar';
      const th = w.replace(/\b(?:make|create|build|generate|give|get|put together|start|compose|curate|set up|queue up|refresh|redo|regenerate|remake|recommend\w*|suggest\w*|for me|for you|please|playlists?|mixtapes?|mix|made|daily|discover\w*|rediscover\w*|something new|forgotten favou?rites|(?:\d{1,3})[- ]?(?:songs?|tracks?)|short|small|quick|long|big|huge|large)\b/gi, ' ').replace(/\b(?:me|my|a|an|the|some|another|new|of|that|is|are|songs?|tracks?|music|and|in|i|i'?d|would|like|might)\b/gi, ' ').replace(/\s+/g, ' ').trim();
      const ws = wordsOf(th + ' ' + sp.themeWords.join(' ')).filter(x => x && !S_FILL.has(x));
      sp.theme = th;
      const sets = []; if (ws.length) sets.push(findTracks(ws)); if (byArtist) sets.push(byArtist);
      if (sets.length) sp.themeSet = [...new Set([].concat(...sets))];
      const custom = hadIn || hadEx || byArtist || (sp.size && ws.length);
      if (sp.kind === 'custom' && !custom) return null;
      return sp;
    }
