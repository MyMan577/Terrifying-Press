      // ---- AI tasks that need no chat AI: moods come from the tagger's tags ----
      const MOODMAP = [[/\b(workout|work out|working out|gym|exercis\w*|cardio|running|energetic|energy|pump\w*)\b/i, 'workout'], [/\b(chill\w*|relax\w*|calm\w*|mellow|soothing|peaceful|gentle|unwind\w*|wind down)\b/i, 'chill'], [/\b(party|parties|danc\w*|club)\b/i, 'party'], [/\b(happy|upbeat|cheerful|feel[- ]good|joyful)\b/i, 'happy'], [/\b(sad|melanchol\w*|heartbreak\w*|emotional|crying)\b/i, 'sad'], [/\b(focus\w*|study\w*|homework|concentrat\w*|reading)\b/i, 'focus'], [/\b(sleep\w*|bed ?time|lullab\w*|insomnia)\b/i, 'sleep'], [/\b(acoustic|unplugged)\b/i, 'acoustic'], [/\b(instrumentals?)\b/i, 'instr'], [/\b(very fast|intense|hype)\b/i, 'rush'], [/\b(slow)\b/i, 'slow'], [/\b(fast)\b/i, 'fast']];
      const FILL = new Set(['make', 'create', 'build', 'generate', 'put', 'together', 'give', 'get', 'start', 'new', 'for', 'with', 'of', 'that', 'is', 'fits', 'i', 'want', 'need', 'would', 'like', 'to', 'listen', 'hear', 'some', 'something', 'good', 'nice', 'great', 'perfect', 'please', 'just', 'can', 'have', "i'd", "i'm", 'songs', 'tracks', 'mood', 'music', 'all', 'my', 'me', 'a', 'an', 'the', 'this', 'up', 'set', 'full', 'when', 'am', 'feeling', 'feel']);
      if (/^(?:make|create|build|update|refresh|generate)(?: me)?(?: my| the| all| some| new| a| an)*(?: smart| mood)+ playlists?$/i.test(t)) return (smartAll(), true);
      if (/\bplaylist\b/i.test(t) && (/^(?:make|create|build|generate|put together|give|get|start)\b/i.test(t) || /^i(?:'d| would)? (?:want|need|like)\b/i.test(t)) && !/\b(?:called|named)\b/i.test(t)) {
        const feelWord = /\b(?:i'?m|i am|im|i feel|feeling|when i|my mood|how i feel|how i'?m feeling)\b/i.test(t), feel = feelWord ? MOODS.find(x => x[0].test(t)) : null;
        if (feel) return (moodPlaylist(feel[1], 'For how you feel,'), true);
        if (/\b(?:my mood|how i feel|how i'?m feeling)\b/i.test(t)) return say('How are you feeling? Try \u201cmake a playlist for when I\u2019m stressed\u201d.');
        const rest = t.toLowerCase().replace(/\bplaylists?\b/g, ' '), mm = MOODMAP.find(x => x[0].test(rest));
        if (mm && !wordsOf(rest).filter(w => !FILL.has(w) && !mm[0].test(w) && !VIBEW.has(w)).length) return (moodPlaylist(mm[1]), true);
      }
      if (/^(?:what|how)(?:'s| is)? (?:the )?(?:mood|vibe|feel|feeling)(?: of)?(?: is)?(?: this| it)?(?: song| track)?$|^what mood is (?:this|it)(?: song| track)?$|^(?:what|how) does this (?:song |track )?(?:feel|sound)(?: like)?$/i.test(t)) {
        const c = cur(); if (!c) return say('Play or pick a track first.'); const tgc = loadTags()[c.dbId];
        if (!tgc) return ask('\u201c' + c.title + '\u201d is not tagged yet, so I cannot tell. Tag it now?', () => tagWith('cur'), true);
        return say(vibes(tgc).join(', ') + (tgc.bpm ? '\n' + tgc.bpm + ' BPM' + (tgc.key ? ', ' + tgc.key + (tgc.ck ? ' ' + tgc.ck : '') : '') : ''));
      }
      if (/^(?:(?:apply|set|turn on|use) )?auto[- ]?eq(?: to (?:all|everything|my (?:tracks|songs|music)))?$|^(?:eq|equali[sz]e) (?:all|everything|my (?:tracks|songs|music))(?: automatically)?$/i.test(t)) return click('ppv-eqall') ? done('Applying a genre-based EQ to your tagged tracks.') : busyMsg();
      // playlists
      if ((m = t.match(/^(?:make|create|start)(?: me)?(?: a| an)?(?: new)? playlist (?:called|named) (.+)$/i))) {
        const pl = A.createPlaylist(m[1].trim().slice(0, 60)); A.commitPlaylists(); return done('Made an empty playlist \u201c' + pl.name + '\u201d. Say \u201cadd this to ' + pl.name + '\u201d to fill it.');
      }
      if ((m = t.match(/^(?:make|create|build|start)(?: me)?(?: a| an)?(?: new)? playlist (?:of |with |from |for )?(.+)$/i)) || (m = t.match(/^(?:make|create|build)(?: me)?(?: a| an)? (.+?) playlist$/i))) {
        const ws = wordsOf(m[1]); if (!ws.length) return say('What should be in it? Try \u201cmake a playlist of slow piano\u201d.');
        const r = findTracks(ws); if (!r.length) return say('I could not find any tracks for \u201c' + m[1] + '\u201d. Tagging more tracks helps me find moods and styles.');
        const tr = A.tracks(), pl = A.createPlaylist('\ud83e\udd16 ' + m[1].trim().slice(0, 40)); r.slice(0, 200).forEach(i => A.addToPlaylist(tr[i].dbId, pl.id)); A.commitPlaylists();
        add('bot', '\u2713 Made \u201c' + pl.name + '\u201d with ' + Math.min(r.length, 200) + ' tracks. Find it in the Playlists tab.'); actions([['\u25b6 Play it', () => { A.play(r[0], r.slice(0, 200)); }]]); return true;
      }
      if ((m = t.match(/^add (?:this|it|the current)(?: song| track)? to (?:my |the )?(.+?)(?: playlist)?$/i))) {
        const c = cur(); if (!c) return say('Play or pick a track first.');
        const norm = s => String(s).toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ''), want = norm(m[1]);
        const pls = A.playlists(), pl = pls.find(p => norm(p.name) === want) || pls.find(p => want && norm(p.name).includes(want));
        if (!pl) return say('I cannot find a playlist called \u201c' + m[1] + '\u201d.' + (pls.length ? ' You have: ' + pls.slice(0, 6).map(p => p.name).join(', ') + '.' : ' You have no playlists yet. Say \u201cmake a playlist called ' + m[1] + '\u201d.'));
        A.addToPlaylist(c.dbId, pl.id); A.commitPlaylists(); return done('Added \u201c' + c.title + '\u201d to ' + pl.name + '.');
      }
      // ---- things you would normally do with a gesture or a tap: Bloop runs the app's own gesture actions and buttons ----
      const GA = id => { const ga = A.gestureActions && A.gestureActions(), g = ga && ga[id]; if (!g || !g.run) return false; g.run(); return true; };
      const sk = () => $id('seek'), dur = () => parseFloat(sk() && sk().max) || 0, pos = () => parseFloat(sk() && sk().value) || 0;
      const clock = x => { x = Math.max(0, Math.round(x)); return Math.floor(x / 60) + ':' + String(x % 60).padStart(2, '0'); };
      const seekTo = x => { const e = sk(); if (!e) return false; e.value = Math.max(0, dur() ? Math.min(dur(), x) : x); e.dispatchEvent(new Event('input', { bubbles: true })); e.dispatchEvent(new Event('change', { bubbles: true })); return true; };
      const isVid = () => { const c = cur(); return !!c && c.kind === 'video'; };
      const vidOnly = () => isVid() ? null : say('That one is for videos, and the current track is audio.');
      const numOf = w => /^half/i.test(w) ? .5 : /^(a|an|one)$/i.test(w) ? 1 : parseFloat(w);
      const ab = $id('ab-loop-btn'), abT = () => (ab && ab.title) || '';

      // seek forward / back by an amount
      if ((m = t.match(/^(fast[- ]?forward|ff|forward|skip ahead|skip|jump|seek|go|move|skip forward|jump ahead|jump forward|go forward|go ahead|seek forward|fwd|rewind|rew|skip back(?:wards?)?|jump back(?:wards?)?|seek back(?:wards?)?|go back|back)(?: (?:by |for |about )?(a|an|one|half a|half an|\d+(?:\.\d+)?) ?(seconds?|secs?|s|minutes?|mins?|m)?)?$/i)) && !(m[2] && !m[3] && isNaN(+m[2])) && !(/^(skip|jump|seek|go|move)$/i.test(m[1]) && !m[2])) {
        if (A.currentIndex() < 0 || !sk()) return say('Nothing is playing.');
        const back = /^(rew|back|go back|skip back|jump back|seek back)/i.test(m[1]);
        let secs = m[2] ? numOf(m[2]) * (/^m/i.test(m[3] || '') ? 60 : 1) : 10; secs = Math.min(3600, Math.max(1, Math.round(secs)));
        const to = Math.max(0, pos() + (back ? -secs : secs)); seekTo(to);
        return done((back ? 'Back ' : 'Ahead ') + (secs >= 60 && secs % 60 === 0 ? secs / 60 + ' min' : secs + ' s') + ', now at ' + clock(dur() ? Math.min(dur(), to) : to) + '.');
      }
      // jump to a time, a percentage, the middle, the end
      if ((m = t.match(/^(?:go|jump|skip|seek|move|fast[- ]?forward|rewind)(?: (?:back|forward|ahead))? to (?:the )?(?:(?:(\d{1,2}):)?(\d{1,2}):(\d{2})|(\d+(?:\.\d+)?) ?(seconds?|secs?|minutes?|mins?|%|percent)|(middle|halfway|half ?way|start|beginning|top|end))$/i))) {
        if (A.currentIndex() < 0 || !dur()) return say('Nothing is playing.');
        let x; const w = (m[6] || '').toLowerCase().replace(/\s/g, '');
        if (m[3] !== undefined) x = (m[1] ? +m[1] * 3600 : 0) + +m[2] * 60 + +m[3];
        else if (m[4] !== undefined) { const n = parseFloat(m[4]); x = /^m/i.test(m[5]) ? n * 60 : /^(%|percent)/i.test(m[5]) ? dur() * n / 100 : n; }
        else x = /middle|halfway/.test(w) ? dur() / 2 : /end/.test(w) ? Math.max(0, dur() - 2) : 0;
        if (x > dur()) return say('That is past the end. This one is ' + clock(dur()) + ' long.');
        seekTo(x); return done('Jumped to ' + clock(x) + ' of ' + clock(dur()) + '.');
      }
      // restart
      if (/^(restart|replay|start over|start again|(play|start) (it |this |that |the (song|track) )?(again|over|from the (top|beginning|start))|from the (top|beginning|start)|(go |back |rewind )+(back )?to the (start|beginning|top)|restart (this |the )?(song|track))$/i.test(t)) {
        if (A.currentIndex() < 0) return say('Nothing is playing.');
        GA('restart'); if (!mediaOn()) click('play-btn'); return done('Back to the start.');
      }
      // A-B loop (a part of a song)
      if (/^(?:set |mark |start )?(?:a )?loop (?:start|point a|a|from here|here)$|^(?:set |mark )?point a$|^start (?:a )?loop(?: here)?$/i.test(t)) {
        if (!ab || A.currentIndex() < 0) return say('Play a track first.');
        if (!/point A/.test(abT())) return say('A loop is already started. Say \u201cset loop end\u201d or \u201cclear loop\u201d.');
        click('ab-loop-btn'); return done('Loop start marked at ' + clock(pos()) + '. Say \u201cset loop end\u201d where the part ends.');
      }
      if (/^(?:set |mark )?(?:a )?loop (?:end|point b|b|to here)$|^(?:set |mark )?point b$|^end (?:the )?loop(?: here)?$/i.test(t)) {
        if (!/point B/.test(abT())) return say('Mark the start first: say \u201cset loop start\u201d.');
        click('ab-loop-btn'); return /Looping/.test(abT()) ? done('Looping that part.') : say('The end has to come after the start. Let it play a bit further and try again.');
      }
      if (/^(?:clear|remove|cancel|stop|turn off)(?: the)?(?: a-?b)? ?loop(?:ing)?$|^loop off$/i.test(t) && /point B|Looping/.test(abT())) {
        for (let i = 0; i < 2 && !/point A/.test(abT()); i++) click('ab-loop-btn');
        return done('Loop cleared.');
      }
      // repeat mode (cycles Repeat off / all / one)
      if (/^(?:(?:turn|switch|set) )?(?:(?:on|off) )?(?:repeat|loop)(?: mode)?(?: (?:on|off|one|all|this(?: song| track)?|it|the (?:song|track|playlist)|everything))?$|^(?:repeat|loop) (?:this|it)(?: song| track)?$|^(?:stop|quit|end) (?:repeating|looping)$/i.test(t)) {
        const rb = $id('repeat-btn'); if (!rb) return say('I cannot find the repeat button.');
        const off = /\boff\b|^(stop|quit|end)\b/i.test(t), all = /\b(all|everything|playlist)\b/i.test(t), one = /\b(one|this|song|track|it)\b/i.test(t) || /^loop\b/i.test(t);
        const want = off ? 'Repeat' : all && !one ? 'Repeat all' : one ? 'Repeat one' : 'Repeat all';
        for (let i = 0; i < 3 && rb.title !== want; i++) rb.click();
        return rb.title === want ? done(want === 'Repeat' ? 'Repeat off.' : want + '.') : say('I could not set repeat.');
      }
      // playback speed
      if (/^(?:speed (?:it )?up|(?:make it |play it |go |play )?(?:a (?:bit|little) )?faster)$/i.test(t)) return GA('speedUp') ? done('Faster (+0.25x).') : false;
      if (/^(?:slow (?:it )?down|(?:make it |play it |go |play )?(?:a (?:bit|little) )?slower)$/i.test(t)) return GA('speedDown') ? done('Slower (-0.25x).') : false;
      if (/^(?:normal|regular|default|reset|original) speed$|^(?:reset|restore) (?:the )?speed$|^speed (?:reset|normal)$|^(?:play )?(?:it )?at normal speed$/i.test(t)) return GA('speedReset') ? done('Normal speed.') : false;
      if ((m = t.match(/^(?:(?:set|change|play)(?: the)?(?: playback)? )?speed(?: to| at)? ?(\d+(?:\.\d+)?) ?x?$|^(?:play )?(?:it )?at (\d+(?:\.\d+)?) ?x(?: speed)?$|^(\d+(?:\.\d+)?)x(?: speed)?$/i))) {
        const r = Math.max(.25, Math.min(4, Math.round(parseFloat(m[1] || m[2] || m[3]) * 4) / 4)), n = Math.round((r - 1) / .25);
        GA('speedReset'); for (let i = 0; i < Math.abs(n); i++) GA(n > 0 ? 'speedUp' : 'speedDown');
        return done('Speed ' + r + 'x (steps of 0.25, between 0.25x and 4x).');
      }
      // volume shortcuts
      if (/^(?:max(?:imum)?|full) volume$|^volume (?:max|full)$|^(?:turn it|set it|put it) (?:up )?(?:to )?(?:max|full)$/i.test(t)) return setVol(100);
      if (/^half volume$|^volume half$/i.test(t)) return setVol(50);
      // fullscreen / immersive / picture in picture / rotate / zoom / fit / filter / frames (video things)
      if ((m = t.match(/^(?:(?:go|enter|turn on|switch to|put it in|make it) )?full ?screen(?: mode)?(?: on)?$|^(exit|leave|close|turn off|get out of|quit|stop) full ?screen(?: mode)?$/i))) {
        const inFs = !!document.fullscreenElement, out = !!m[1];
        if (out && !inFs) return say('It is not in fullscreen.'); if (!out && inFs) return say('Already in fullscreen.');
        if (!out && !isVid()) return say('Fullscreen is for videos, and the current track is audio.');
        GA('fullscreen'); return done(out ? 'Left fullscreen.' : 'Fullscreen.');
      }
      if ((m = t.match(/^(?:(?:turn|switch) )?(on |off )?immersive(?: mode)?( on| off)?$|^(exit|leave|stop|enter|start) immersive(?: mode)?$/i))) {
        const isOn = document.body.classList.contains('immersive'), w = ((m[1] || m[2] || '').trim() || (m[3] ? (/^(exit|leave|stop)/i.test(m[3]) ? 'off' : 'on') : '')).toLowerCase();
        if (w && (w === 'on') === isOn) return say('Immersive mode is already ' + w + '.');
        GA('immersive'); return done('Immersive mode ' + (isOn ? 'off' : 'on') + '.');
      }
      if (/^(?:pip|picture[- ]in[- ]picture)(?: mode)?$|^(?:(?:go|switch) to|turn on|open|enter) (?:pip|picture[- ]in[- ]picture)(?: mode)?$/i.test(t)) return vidOnly() || (click('pip-btn') ? done('Picture in picture.') : say('I cannot reach picture in picture.'));
      if (/^rotate(?: the)?(?: screen| video| picture)?$/i.test(t)) return vidOnly() || (click('rotate-btn') ? done('Rotated.') : say('I cannot find rotate.'));
      if (/^zoom in$/i.test(t)) return vidOnly() || (GA('zoomIn'), done('Zoomed in.'));
      if (/^zoom out$/i.test(t)) return vidOnly() || (GA('zoomOut'), done('Zoomed out.'));
      if (/^(?:reset|undo|clear) (?:the )?zoom(?: and fit)?$|^(?:fit|reset) (?:the )?(?:video|picture|screen)$/i.test(t)) return vidOnly() || (GA('zoomReset'), done('Zoom and fit reset.'));
      if (/^(?:change|switch|cycle|next)(?: the)?(?: video)? (?:fit|aspect(?: ratio)?)$/i.test(t)) return vidOnly() || (GA('cycleFit'), done('Changed the video fit.'));
      if (/^(?:next|change|switch|cycle|another)(?: the)?(?: video)? filter$/i.test(t)) return vidOnly() || (GA('nextFilter'), done('Next video filter.'));
      if (/^(?:(?:step|go) )?(?:forward|ahead|next)(?: one)?(?: a)? frame$|^frame (?:forward|ahead)$/i.test(t)) return vidOnly() || (GA('frameFwd'), done('One frame forward.'));
      if (/^(?:(?:step|go) )?(?:back|backward|previous|prev)(?: one)?(?: a)? frame$|^frame back(?:ward)?$/i.test(t)) return vidOnly() || (GA('frameBack'), done('One frame back.'));
      // equalizer
      const EQN = { flat: 'flat', off: 'flat', 'turn off': 'flat', disable: 'flat', normal: 'flat', reset: 'flat', none: 'flat', bass: 'bass', 'bass boost': 'bass', 'more bass': 'bass', treble: 'treble', 'more treble': 'treble', vocal: 'vocal', vocals: 'vocal', voice: 'vocal', 'v shape': 'vshape', 'v-shape': 'vshape', vshape: 'vshape', 'v shaped': 'vshape', acoustic: 'acoustic', pop: 'pop', rock: 'rock', jazz: 'jazz', classical: 'classical', electronic: 'electronic', edm: 'electronic', 'hip hop': 'hiphop', 'hip-hop': 'hiphop', hiphop: 'hiphop', rap: 'hiphop', loudness: 'loudness', loud: 'loudness', podcast: 'podcast', speech: 'podcast', 'late night': 'latenight', latenight: 'latenight', night: 'latenight' };
      if (/^(?:next|change|switch|cycle|another)(?: the)?(?: eq| equali[sz]er)(?: preset)?$|^(?:next|another) (?:eq|equali[sz]er)(?: preset)?$/i.test(t)) return need() || (GA('nextEqPreset'), done('Switched to the next EQ preset.'));
      if ((m = t.match(/^(?!(?:open|show|bring up|pull up|close|hide) )(?:(?:set|change|switch|use|apply|put|make)(?: the)?(?: eq| equali[sz]er)(?: preset)?(?: to| on)?|(?:eq|equali[sz]er)(?: preset)?(?: to)?) (.+)$|^(.+?) (?:eq|equali[sz]er)(?: preset)?$|^(?:boost|more|add|increase) (?:the )?(bass|treble|vocals?)$|^(bass boost)$|^(?:turn off|disable|reset) (?:the )?(?:eq|equali[sz]er)$/i)) && !/^(?:open|show|bring up|pull up|close|hide) /i.test(t)) {
        const c = cur(); if (!c) return say('Play or pick a track first.');
        const key = (m[1] || m[2] || m[3] || m[4] || 'flat').toLowerCase().trim().replace(/\s+the$/, ''), name = EQN[key];
        if (!name) return say('I know these EQ presets: bass, treble, vocal, v-shape, acoustic, pop, rock, jazz, classical, electronic, hip hop, loudness, podcast, late night, or flat.');
        return A.setTrackEqPreset(c.dbId, name) ? done('EQ set to ' + name + ' for this track.' + (name === 'flat' ? '' : ' Say \u201ceq off\u201d to undo.')) : say('That preset did not work.');
      }
      // ---- Lyric Fix ("fix the lyrics", "correct the lyrics of Hello", "proofread the lyrics") ----
      {
        const mf = t.match(/^(?:fix|correct|clean up|proofread|check|repair)(?: the| my)? (?:lyrics|subtitles|captions|transcript(?:ion)?)(?: (?:of|for|in|on) (.+))?$/i);
        if (mf) {
          const q = String(mf[1] || '').trim().replace(/^["\u201c']+|["\u201d'.!?]+$/g, '');
          let idx = -1;
          if (!q || /^(?:this|that|it|the|current|this one)(?: song| track| video| one)?$/i.test(q)) { idx = A.currentIndex(); if (idx < 0) return say('Play or pick a song first, or name one: \u201cfix the lyrics of Hello\u201d.'); }
          else { const hit = resolveMusic(q.replace(/^(?:the )?(?:song|track) /i, '')); if (hit && hit.kind === 'song') idx = hit.idx; else return say(hit && hit.kind === 'artist' ? 'Which song by ' + hit.a.name + '?' : 'I cannot find a song called \u201c' + q + '\u201d.'); }
          startLyFix(idx); return true;
        }
      }
      // ---- Song Talk ("let's talk about this song", "discuss Hello", "deep dive into Charlie's Inferno") ----
      {
        const mt = t.match(/^(?:let'?s |can we |i want to )?(?:talk|chat) (?:about|through) (.+)$|^(?:discuss|analy[sz]e|deep dive(?: into)?|break down the meaning of) (.+)$/i);
        if (mt) {
          const q = String(mt[1] || mt[2] || '').trim().replace(/^["\u201c']+|["\u201d'.!?]+$/g, '');
          if (/^(?:this|that|it|the|current|this one)(?: song| track| one)?$/i.test(q)) { if (A.currentIndex() < 0) return say('Play or pick a song first, or name one: \u201clet\u2019s talk about Hello\u201d.'); startSongTalk(A.currentIndex()); return true; }
          const hit = resolveMusic(q.replace(/^(?:the )?(?:song|track) /i, ''));
          if (hit && hit.kind === 'song') { startSongTalk(hit.idx); return true; }
          if (hit && hit.kind === 'artist') return say('Which song by ' + hit.a.name + '? Say \u201clet\u2019s talk about <song>\u201d.');
          // not a song in the library: let normal chat take "let's talk about life"
        }
      }
      // ---- song summaries ("summarize this", "what is Hello about", "show the summary of X", "write a new summary") ----
      {
        let sm = null, fresh = false, showOnly = false;
        if ((sm = t.match(/^(?:summari[sz]e|sum up|explain|break down)(?: (?:this|the|that|it|current))?(?: song| track| video)?(?: for me)?$/i))) sm = [sm[0], ''];
        else if ((sm = t.match(/^(?:write|make|generate|create|give me|get me)(?: me)?(?: a)?( new)? summary(?: (?:of|for|about) (.+))?$/i))) { fresh = !!sm[1]; sm = [sm[0], sm[2] || '']; }
        else if ((sm = t.match(/^(?:show|read|view|open|see|display)(?: me)?(?: the| my)?(?: saved)? summary(?: (?:of|for) (.+))?$/i))) { showOnly = true; sm = [sm[0], sm[1] || '']; }
        else if ((sm = t.match(/^(?:summari[sz]e|sum up|explain|break down) (.+)$/i))) sm = [sm[0], sm[1]];
        else if ((sm = t.match(/^what(?:'s| is| was) (.+?) (?:really )?about$/i)) || (sm = t.match(/^(?:what does|what do) (.+?) mean$/i)) || (sm = t.match(/^(?:what(?:'s| is) )?the (?:meaning|message|story) (?:of|behind) (.+)$/i))) sm = [sm[0], sm[1]];
        else sm = null;
        if (sm) {
          let q = String(sm[1] || '').trim().replace(/^["\u201c']+|["\u201d'.!?]+$/g, '');
          const isCur = !q || /^(?:this|that|it|the|current|this one)(?: song| track| video| one)?$/i.test(q);
          let idx = -1;
          if (isCur) { idx = A.currentIndex(); if (idx < 0) return say('Play or pick a song first, or name one: \u201cwhat is Hello about\u201d.'); }
          else {
            const hit = resolveMusic(q.replace(/^(?:the )?(?:song|track) /i, ''));
            if (hit && hit.kind === 'song') idx = hit.idx;
            else if (hit && hit.kind === 'artist') return say('Which song by ' + hit.a.name + '? Say \u201cwhat is <song> about\u201d.');
            else if (/\bsummar|\bsum up\b/i.test(t)) return say('I cannot find a song called \u201c' + q + '\u201d in your library.');
            else return false;                                         // "explain shuffle", "what is love about": not a song here, let the chat answer
          }
          const saved = sumLoad()[A.tracks()[idx].dbId];
          if (showOnly && !saved) { const tt = A.tracks()[idx]; return ask('There is no saved summary for ' + tt.title + ' yet. Write one now?', () => chatSummary(idx, true), true); }
          chatSummary(idx, fresh);
          return true;
        }
      }
      // library search and tabs/menus
      if ((m = t.match(/^(?:search(?: my library| the library| my music| tracks)?(?: for)?|look up|filter(?: by| for)?)\s+(.+)$/i))) {
        const inp = $id('track-search'); if (!inp) return say('I cannot find the search box.');
        const tab = document.querySelector('[data-sidebar-tab="playlist"]'); tab && tab.click();
        inp.value = m[1].trim(); inp.dispatchEvent(new Event('input', { bubbles: true })); return done('Searching your library for \u201c' + inp.value + '\u201d. Say \u201cclear search\u201d to reset.');
      }
      if (/^(?:clear|reset|close)(?: the| my)? (?:search|filter)$/i.test(t)) { const inp = $id('track-search'); if (!inp) return false; inp.value = ''; inp.dispatchEvent(new Event('input', { bubbles: true })); return done('Search cleared.'); }
      if ((m = t.match(/^(?:open|show|go to|switch to|take me to)(?: the| my)? (settings|playlist|playlists|library|queue|tracks|track list)(?: tab| page| pane| screen)?$/i))) {
        const isSet = m[1].toLowerCase() === 'settings', b = document.querySelector('[data-sidebar-tab="' + (isSet ? 'settings' : 'playlist') + '"]');
        return b ? (b.click(), done((isSet ? 'Settings' : 'Playlist') + ' opened.')) : say('I cannot find that tab.');
      }
      if ((m = t.match(/^(?:open|show|bring up|pull up)(?: the| my)? (.+?)(?: menu)?$/i))) {
        const OPEN = [[/^(?:eq|equali[sz]er)$/, 'eq-btn', 'Equalizer'], [/^sleep(?: timer)?$/, 'sleep-btn', 'Sleep timer'], [/^(?:speed|playback speed)$/, 'speed-btn', 'Speed menu'], [/^(?:effects|fx)$/, 'fx-btn', 'Effects'], [/^(?:subtitles?|captions?)$/, 'subtitle-btn', 'Subtitles'], [/^(?:main )?menu$/, 'menu-btn', 'Menu']];
        const o = OPEN.find(x => x[0].test(m[1].toLowerCase().trim())); if (o) return click(o[1]) ? done(o[2] + ' opened.') : say('I cannot reach that.');
      }
      if (/^(?:close|hide)(?: the)? menu$/i.test(t)) return click('menu-close-btn') ? done('Menu closed.') : say('The menu is not open.');
      // position info
      if (/^how (?:much|long)(?: time)?(?: is)?(?: there)?(?: left| remaining)(?: in (?:this|the) (?:song|track|video))?$|^(?:time|how long) left$|^what'?s left$/i.test(t)) { if (!dur()) return say('Nothing is playing.'); return say(clock(dur() - pos()) + ' left (' + clock(pos()) + ' of ' + clock(dur()) + ').'); }
      if (/^how long is (?:this|it|the current)(?: song| track| video)?$|^(?:what'?s|what is) the (?:length|duration)(?: of (?:this|it))?$/i.test(t)) { if (!dur()) return say('Nothing is playing.'); return say('It is ' + clock(dur()) + ' long.'); }
      if (/^(?:where am i|how far in(?: am i)?|what time is it in the (?:song|track)|what'?s the (?:time|position))$/i.test(t)) { if (!dur()) return say('Nothing is playing.'); return say('You are at ' + clock(pos()) + ' of ' + clock(dur()) + '.'); }
      // ---- library & playlist management ----
      const nrm = x => String(x).toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');
      const findPl = name => {
        const w = nrm(name), pls = A.playlists().filter(p => !p.stemOf); if (!w) return null;
        return pls.find(p => nrm(p.name) === w) || pls.find(p => nrm(p.name).includes(w)) || pls.map(p => [p, mScore(p.name, name)]).filter(x => x[1] >= 0.7).sort((x, y) => y[1] - x[1]).map(x => x[0])[0] || null;
      };
      const plIdx = pl => { const tr = A.tracks(); return tr.map((x, i) => i).filter(i => !tr[i].stem && (tr[i].playlistIds || []).includes(pl.id)); };
      // "open / show / view / pull up my Chill playlist": that playlist's own page, plus a play button
      if ((m = t.match(/^(?:open|show|view|see|display|pull up|bring up|go to|take me to|navigate to|load)(?: me| up)?(?: the| my)?(?: playlist)? (.+?)(?: playlist)?$/i))
          && !/^(?:settings|library|queue|tracks|track list|playlists?|eq|equali[sz]er|sleep(?: timer)?|speed|playback speed|effects|fx|subtitles?|captions?|(?:main )?menu|lyrics|player|home|what'?s in .+)$/i.test(m[1].trim())) {
        const pl = findPl(m[1]);
        if (pl) {
          const q = plIdx(pl), opened = !!(window.__ppOpenPlaylist && window.__ppOpenPlaylist(pl.id));
          if (!opened) { const tab = document.querySelector('[data-sidebar-tab="playlist"]'); tab && tab.click(); }
          add('bot', blTone('\u2713 ' + (opened ? 'Opened ' : 'Here is ') + pl.name + ' (' + q.length + ' track' + (q.length === 1 ? '' : 's') + ')' + (opened ? '.' : (q.length ? ': ' + q.slice(0, 6).map(i => A.tracks()[i].title).join(', ') + (q.length > 6 ? ', \u2026' : '') : '.'))));
          if (q.length) actions([['\u25b6 Play it', (b, d) => { d.remove(); A.play(q[0], q); }], ['\u21c4 Shuffle it', (b, d) => { d.remove(); const s2 = shuffleIn(q.slice()); A.play(s2[0], s2); }]]);
          return true;
        }
        if (/\bplaylist\b/i.test(t)) { const pls = A.playlists().filter(p => !p.libOnly && !p.stemOf); return say('I cannot find a playlist called \u201c' + m[1] + '\u201d.' + (pls.length ? ' You have: ' + pls.slice(0, 8).map(p => p.name).join(', ') + '.' : '')); }
      }
      if (/^(?:(?:what|which|list|show)(?: me)?(?: are)?(?: all)?(?: of)?(?: my)? playlists(?: do i have)?|my playlists|how many playlists(?: do i have)?)$/i.test(t)) {
        const pls = A.playlists().filter(p => !p.libOnly);
        return say(pls.length ? 'You have ' + pls.length + ' playlist' + (pls.length === 1 ? '' : 's') + ': ' + pls.slice(0, 12).map(p => p.name + ' (' + plIdx(p).length + ')').join(', ') + (pls.length > 12 ? ', and more' : '') + '.' : 'You have no playlists yet. Say \u201cmake a playlist called Favorites\u201d.');
      }
      if ((m = t.match(/^(?:play|start|put on|shuffle|shuffle play)(?: my| the)? (?:playlist )?(.+?)(?: playlist)?$/i)) && (/\bplaylist\b/i.test(t) || /^shuffle\b/i.test(t))) {
        const pl = findPl(m[1]);
        if (pl) { const q = plIdx(pl); if (!q.length) return say('\u201c' + pl.name + '\u201d is empty.'); if (/^shuffle/i.test(t)) shuffleIn(q); A.play(q[0], q); return done('Playing ' + pl.name + ' (' + q.length + ' tracks' + (/^shuffle/i.test(t) ? ', shuffled' : '') + ').'); }
      }
      if ((m = t.match(/^(?:how many (?:songs|tracks) (?:are )?in|what'?s in|what is in|show (?:me )?what'?s in|list (?:the )?(?:songs|tracks) in) (?:my |the )?(.+?)(?: playlist)?$/i))) {
        const pl = findPl(m[1]);
        if (pl) { const q = plIdx(pl), tr = A.tracks(); return say(pl.name + ' has ' + q.length + ' track' + (q.length === 1 ? '' : 's') + (q.length ? ': ' + q.slice(0, 8).map(i => tr[i].title).join(', ') + (q.length > 8 ? ', and ' + (q.length - 8) + ' more' : '') : '') + '.'); }
      }
      if ((m = t.match(/^(?:remove|take|delete) (?:this|it|the current)(?: song| track)? (?:from|out of) (?:my |the )?(.+?)(?: playlist)?$/i))) {
        const c = cur(); if (!c) return say('Play or pick a track first.');
        const pl = findPl(m[1]); if (!pl) return say('I cannot find a playlist called \u201c' + m[1] + '\u201d.');
        if (!(c.playlistIds || []).includes(pl.id)) return say('\u201c' + c.title + '\u201d is not in ' + pl.name + '.');
        A.removeFromPlaylist(c.dbId, pl.id); A.commitPlaylists(); return done('Removed \u201c' + c.title + '\u201d from ' + pl.name + '.');
      }
      if ((m = t.match(/^rename(?: my| the)? playlist (.+?) (?:to|as) (.+)$/i))) {
        const pl = findPl(m[1]); if (!pl) return say('I cannot find a playlist called \u201c' + m[1] + '\u201d.');
        const old = pl.name; pl.name = m[2].trim().slice(0, 60); A.commitPlaylists(); return done('Renamed \u201c' + old + '\u201d to \u201c' + pl.name + '\u201d.');
      }
      if ((m = t.match(/^(?:delete|remove|get rid of)(?: my| the)? playlist (.+)$|^(?:delete|remove|get rid of)(?: my| the)? (.+?) playlist$/i))) {
        const pl = findPl(m[1] || m[2]); if (!pl) return say('I cannot find a playlist called \u201c' + (m[1] || m[2]) + '\u201d.');
        return ask('Delete the playlist \u201c' + pl.name + '\u201d? Your tracks stay in the library.', () => { A.deletePlaylistQuiet(pl.id); A.commitPlaylists(); done('Deleted ' + pl.name + '.'); });
      }
      if (/^(?:(?:show|tell|give)(?: me)?(?: my)? )?(?:library|music) (?:stats|statistics|summary|info)$|^tell me about my (?:library|music)$|^how (?:big|large) is my (?:library|collection)$|^how many (?:songs|tracks|videos|things)(?: do i have| are there| in my library)?$|^(?:what'?s|what is) in my library$/i.test(t)) {
        const tr = A.tracks().filter(x => !x.stem), vids = tr.filter(x => x.kind === 'video').length, tgc = tr.filter(x => loadTags()[x.dbId]).length, stems = A.tracks().length - tr.length;
        return say('Your library has ' + tr.length + ' item' + (tr.length === 1 ? '' : 's') + ' (' + (tr.length - vids) + ' audio, ' + vids + ' video), ' + tgc + ' tagged, ' + A.playlists().filter(p => !p.libOnly).length + ' playlists' + (stems ? ', and ' + stems + ' split tracks' : '') + '.');
      }
      // tempo and key questions and requests (these use the tags)
      if (/^(?:what'?s|what is) (?:the )?(?:bpm|tempo|key)(?: of (?:this|it)(?: song| track)?)?$|^how fast is (?:this|it)(?: song| track)?$|^what key is (?:this|it)(?: song| track)?(?: in)?$/i.test(t)) {
        const c = cur(); if (!c) return say('Play or pick a track first.'); const tgc = loadTags()[c.dbId];
        if (!tgc || !tgc.bpm) return ask('\u201c' + c.title + '\u201d is not tagged yet. Tag it now to find the tempo and key?', () => tagWith('cur'), true);
        return say(tgc.bpm + ' BPM' + (tgc.key ? ', key of ' + tgc.key + (tgc.ck ? ' ' + tgc.ck : '') : '') + '.');
      }
      if ((m = t.match(/^play (?:the )?(fastest|slowest)(?: (?:song|track))?$|^play (?:songs|tracks|music) (?:at|around|near|about) (\d{2,3}) ?bpm$|^play (?:songs|tracks|music) between (\d{2,3}) and (\d{2,3}) ?bpm$|^play (fast|slow)[- ]?(?:tempo )?(?:songs|tracks|music)$/i))) {
        const tr = A.tracks(), tgs = loadTags(), q = tr.map((x, i) => i).filter(i => !tr[i].stem && tgs[tr[i].dbId] && tgs[tr[i].dbId].bpm), bp = i => tgs[tr[i].dbId].bpm;
        if (!q.length) return say('I need tempo tags for that. Tag your library first: say \u201ctag all\u201d.');
        let r, label;
        if (m[1]) { r = q.slice().sort((a, b) => m[1].toLowerCase() === 'fastest' ? bp(b) - bp(a) : bp(a) - bp(b)).slice(0, 1); label = 'the ' + m[1].toLowerCase() + ' song (' + bp(r[0]) + ' BPM)'; }
        else if (m[2]) { const n = +m[2]; r = q.filter(i => Math.abs(bp(i) - n) <= 8); label = r.length + ' tracks near ' + n + ' BPM'; }
        else if (m[3]) { const lo = Math.min(+m[3], +m[4]), hi = Math.max(+m[3], +m[4]); r = q.filter(i => bp(i) >= lo && bp(i) <= hi); label = r.length + ' tracks between ' + lo + ' and ' + hi + ' BPM'; }
        else { const fast = /^fast/i.test(m[5]); r = q.filter(i => fast ? bp(i) >= 125 : bp(i) <= 95); label = r.length + (fast ? ' fast' : ' slow') + ' tracks'; }
        if (!r.length) return say('None of your tagged tracks match that tempo.');
        shuffleIn(r); r = r.slice(0, 30); A.play(r[0], r); return done('Playing ' + label + '.');
      }
      // ---- Press Play Portfolio (the listening stats). Read-only: Bloop reads the Portfolio's own saved stats and can open it. ----
      const PF = () => { try { if (window.PPPortfolioApi && window.PPPortfolioApi.flush) window.PPPortfolioApi.flush(); } catch (e) {} try { return JSON.parse(localStorage.getItem('pppSaveV1')) || null; } catch (e) { return null; } };
      const dur2 = ms => { const mn = Math.round(ms / 60000); return mn < 1 ? 'under a minute' : mn < 60 ? mn + ' min' : Math.floor(mn / 60) + ' h ' + (mn % 60) + ' min'; };
      const topN = (o, n, f) => Object.entries(o || {}).map(([k, v]) => [k, f ? f(v) : v]).filter(x => x[1] > 0).sort((a, b) => b[1] - a[1]).slice(0, n);
      const NOPF = 'The Portfolio has no listening data yet. Play some music first.';
      if (/^(?:open|show|go to|take me to|bring up|pull up|view|see)(?: me)?(?: my| the)? (?:press ?play )?(?:portfolio|wrapped|listening (?:stats|recap|history)|stats|recap|retrospective)$/i.test(t)) {
        const r = $id('ppp-entry-row'); if (!r) return say('I cannot find the Portfolio.'); r.click(); return done('Portfolio opened.');
      }
      if (/^(?:how (?:much|long) (?:have i|did i) (?:listened?|listening|played|watch\w*)(?: (?:in total|so far|overall|altogether))?|(?:what'?s|what is) my (?:total )?(?:listening|listen|play) time|total (?:listening|listen) time|how much (?:music )?have i (?:listened to|played))$/i.test(t)) {
        const d = PF(); if (!d || !d.totalListenMs) return say(NOPF);
        return say('You have listened for ' + dur2(d.totalListenMs) + ' in total (' + dur2(d.totalAudioMs || 0) + ' audio, ' + dur2(d.totalVideoMs || 0) + ' video).');
      }
      if (/^(?:how (?:much|long) (?:have i|did i) (?:listened?|played|watch\w*) )?today$|^(?:how much|what'?s my (?:listening|listen)(?: time)?) today$|^how much did i listen today$/i.test(t)) {
        const d = PF(), x = d && d.x; if (!x) return say(NOPF); const n = new Date(), k = n.getFullYear() + '-' + (n.getMonth() + 1) + '-' + n.getDate();
        return say('Today you have listened for ' + dur2((x.dayMs || {})[k] || 0) + '.');
      }
      if ((m = t.match(/^(?:who(?:'s| is)|what(?:'s| is)) my (?:top|most (?:played|listened(?: to)?)|favou?rite|#1) (artist|song|track|video)s?$|^(?:who|which artist) (?:do i|have i) (?:listen(?:ed)? to|play(?:ed)?) (?:the )?most$|^(?:what|which) (?:song|track) (?:do i|have i) (?:play(?:ed)?|listen(?:ed)? to) (?:the )?most$|^my (?:top|most played) (artist|song|track)s?$/i))) {
        const d = PF(); if (!d) return say(NOPF); const w = (m[1] || m[2] || m[3] || (/artist/i.test(t) ? 'artist' : 'song')).toLowerCase();
        if (w === 'artist') { const x = d.x || {}, a = topN(x.artistMs, 1)[0] || topN(x.artistPlays, 1)[0]; return a ? say('Your top artist is ' + a[0] + (x.artistMs && x.artistMs[a[0]] ? ' (' + dur2(x.artistMs[a[0]]) + ' listened)' : '') + '.') : say(NOPF); }
        const tp = topN(d.trackPlays, 1, v => v.count)[0]; if (!tp) return say(NOPF); const e = d.trackPlays[tp[0]];
        return say('Your most played ' + (e.kind === 'video' ? 'video' : 'song') + ' is \u201c' + (e.title || 'Unknown') + '\u201d' + (e.artist ? ' by ' + e.artist : '') + ', played ' + e.count + ' time' + (e.count === 1 ? '' : 's') + '.');
      }
      if ((m = t.match(/^(?:show |tell |give )?(?:me )?(?:my )?top (\d{1,2}|three|five|ten) (artists?|songs?|tracks?)$|^(?:my )?top (artists|songs|tracks)$/i))) {
        const d = PF(); if (!d) return say(NOPF); const nm = { three: 3, five: 5, ten: 10 }, n = m[1] ? (nm[m[1].toLowerCase()] || Math.min(10, +m[1])) : 5, art = /artist/i.test(m[2] || m[3]);
        const r = art ? topN((d.x || {}).artistMs, n).map(a => a[0] + ' (' + dur2(a[1]) + ')') : topN(d.trackPlays, n, v => v.count).map(a => (d.trackPlays[a[0]].title || 'Unknown') + ' (' + a[1] + ' plays)');
        return say(r.length ? 'Your top ' + (art ? 'artists' : 'songs') + ':\n' + r.map((x, i) => (i + 1) + '. ' + x).join('\n') : NOPF);
      }
      if ((m = t.match(/^how many times (?:have i|did i) (?:played|listened to) (?:this|it)(?: song| track)?$|^how often (?:have i|did i) (?:played|listened to) (?:this|it)(?: song| track)?$/i))) {
        const c = cur(); if (!c) return say('Play or pick a track first.'); const d = PF(), e = d && d.trackPlays && d.trackPlays[c.dbId];
        return say(e ? 'You have played \u201c' + c.title + '\u201d ' + e.count + ' time' + (e.count === 1 ? '' : 's') + ' (' + dur2(e.totalMs || 0) + ' listened).' : 'I have no plays recorded for \u201c' + c.title + '\u201d yet.');
      }
      if (/^when do i (?:listen|play)(?: (?:the )?most| a lot)?$|^(?:what'?s|what is) my (?:peak|busiest|favou?rite) (?:listening )?(?:time|hour|day)(?: of (?:the )?(?:day|week))?$|^what time do i (?:listen|play)(?: (?:the )?most)?$/i.test(t)) {
        const d = PF(), x = d && d.x; if (!x || !x.hourMs) return say(NOPF); const hm = x.hourMs, h = hm.indexOf(Math.max.apply(null, hm)), wm = x.weekdayMs || [], wd = wm.indexOf(Math.max.apply(null, wm));
        if (!(hm[h] > 0)) return say(NOPF); const hh = h % 12 || 12, ap = h < 12 ? 'AM' : 'PM', days = ['Sundays', 'Mondays', 'Tuesdays', 'Wednesdays', 'Thursdays', 'Fridays', 'Saturdays'];
        return say('You listen most around ' + hh + ' ' + ap + (wm[wd] > 0 ? ', and most of all on ' + days[wd] : '') + '.');
      }
      if (/^(?:what'?s|what is|how long is) my (?:listening )?streak$|^(?:how many days|how long) (?:in a row|straight) (?:have i|did i) (?:listened?|played)$|^(?:my )?(?:listening )?streak$/i.test(t)) {
        const d = PF(), dm = d && d.x && d.x.dayMs; if (!dm || !Object.keys(dm).length) return say(NOPF);
        const key = dt => dt.getFullYear() + '-' + (dt.getMonth() + 1) + '-' + dt.getDate(), dd = new Date(); let n = 0;
        if (!(dm[key(dd)] > 0)) dd.setDate(dd.getDate() - 1);
        while (dm[key(dd)] > 0) { n++; dd.setDate(dd.getDate() - 1); }
        return say(n ? 'You are on a ' + n + '-day listening streak.' : 'No current streak. Listen today to start one!');
      }
      if (/^how many (?:songs|tracks)? ?(?:have i|did i) (?:skipped|finished|completed)$|^(?:how many )?(?:skips|completions)$|^how many (?:skips|songs skipped)(?: have i (?:done|made))?$|^(?:what'?s|what is) my skip (?:count|rate)$/i.test(t)) {
        const d = PF(), x = d && d.x; if (!x) return say(NOPF); return say('You have skipped ' + (x.skips || 0) + ' tracks and played ' + (x.completions || 0) + ' all the way to the end.');
      }
      if (/^(?:what are |what'?s )?my (?:portfolio|listening) (?:stats|summary|numbers)$|^(?:portfolio|listening) (?:stats|summary)$|^(?:give me |show me )?(?:a )?(?:summary|recap) of my listening$/i.test(t)) {
        const d = PF(); if (!d || !d.totalListenMs) return say(NOPF); const x = d.x || {}, tp = topN(d.trackPlays, 1, v => v.count)[0], ar = topN(x.artistMs, 1)[0];
        return say('Listened: ' + dur2(d.totalListenMs) + '. Tracks played: ' + Object.keys(d.trackPlays || {}).length + '.' + (tp ? '\nTop song: ' + (d.trackPlays[tp[0]].title || 'Unknown') + ' (' + tp[1] + ' plays).' : '') + (ar ? '\nTop artist: ' + ar[0] + '.' : '') + '\nSkips: ' + (x.skips || 0) + ', finished: ' + (x.completions || 0) + '.');
      }
      // ---- browsing the songs in the player ----
      const real = () => { const tr = A.tracks(); return tr.map((x, i) => i).filter(i => !tr[i].stem); };
      const ttl = i => { const x = A.tracks()[i]; return x.title + (x.artist ? ' \u2013 ' + x.artist : ''); };
      const listOf = (idx, n) => idx.slice(0, n).map(ttl).join('\n') + (idx.length > n ? '\n\u2026and ' + (idx.length - n) + ' more' : '');
      const playBtn = (idx, label) => { if (idx.length) actions([[label || '\u25b6 Play ' + (idx.length > 1 ? 'these' : 'it'), () => { const q = idx.slice(0, 50); A.play(q[0], q); }]]); };
      const byWords = x => { const w = wordsOf(x).filter(v => v.length > 1 || /\d/.test(v)); return real().filter(i => { const tr = A.tracks()[i], h = nrm(tr.title + ' ' + (tr.artist || '')); return w.length && w.every(v => h.includes(nrm(v))); }); };
      if (/^(?:what|which) (?:songs|tracks|music|videos?) do i have$|^(?:list|show)(?: me)?(?: all)?(?: of)?(?: my)? (?:songs|tracks|music|library)$|^(?:what'?s|what is) in my (?:player|music|songs)$/i.test(t)) {
        const q = real(); if (!q.length) return say('Your library is empty. Add some songs first.');
        say('You have ' + q.length + ' item' + (q.length === 1 ? '' : 's') + ':\n' + listOf(q, 12)); playBtn(q.slice().sort(() => Math.random() - .5), '\u25b6 Shuffle them'); return true;
      }
      if (/^(?:list|show)(?: me)?(?: all)?(?: of)?(?: my)? videos$|^(?:what|which) videos do i have$/i.test(t)) {
        const tr = A.tracks(), q = real().filter(i => tr[i].kind === 'video'); if (!q.length) return say('You have no videos in the library.');
        say('You have ' + q.length + ' video' + (q.length === 1 ? '' : 's') + ':\n' + listOf(q, 12)); playBtn(q); return true;
      }
      if (/^(?:list|show)(?: me)?(?: all)?(?: of)?(?: my)? artists$|^(?:what|which|who) (?:artists|are my artists)(?: do i have)?$|^who are my artists$|^my artists$/i.test(t)) {
        const tr = A.tracks(), c = {}; real().forEach(i => { const a = (tr[i].artist || '').trim(); if (a) c[a] = (c[a] || 0) + 1; });
        const a = Object.entries(c).sort((x, y) => y[1] - x[1]); if (!a.length) return say('I do not see artist names in your tracks yet.');
        return say(a.length + ' artist' + (a.length === 1 ? '' : 's') + ': ' + a.slice(0, 15).map(x => x[0] + ' (' + x[1] + ')').join(', ') + (a.length > 15 ? ', and more' : '') + '.');
      }
      if ((m = t.match(/^(?:what|which)(?: songs| tracks| music)?(?: do i have| have i got| is there)? by (.+)$|^(?:list|show)(?: me)?(?: my)?(?: songs| tracks| music)? by (.+)$|^how many (?:songs|tracks)(?: do i have)? by (.+)$|^(?:songs|tracks|music) by (.+)$/i))) {
        const nm = (m[1] || m[2] || m[3] || m[4]).trim(), tr = A.tracks(), w = nrm(nm), q = real().filter(i => nrm(tr[i].artist || '').includes(w));
        if (!q.length) return say('I could not find any songs by \u201c' + nm + '\u201d.');
        say(q.length + ' song' + (q.length === 1 ? '' : 's') + ' by ' + nm + ':\n' + listOf(q, 10)); playBtn(q); return true;
      }
      if ((m = t.match(/^(?:do i have|have i got|is there|is) (.+?)(?: in (?:my |the )?(?:library|music|player|collection))?$/i)) && !/\b(?:playlist|volume|shuffle|repeat|playing|eq|tagged)\b/i.test(m[1]) && /^(?:do i have|have i got|is there)\b|in (?:my |the )?(?:library|music|player|collection)$/i.test(t)) {
        const q = byWords(m[1]); if (!q.length) return say('I do not see \u201c' + m[1] + '\u201d in your library.');
        say('Yes: ' + (q.length === 1 ? ttl(q[0]) : q.length + ' matches:\n' + listOf(q, 6))); playBtn(q); return true;
      }
      if ((m = t.match(/^(?:find|where is|where'?s|look for|locate)(?: me)? (?!more like|similar)(.+)$/i))) {
        const q = byWords(m[1]); if (!q.length) return say('I could not find \u201c' + m[1] + '\u201d in your library.');
        say(q.length + ' match' + (q.length === 1 ? '' : 'es') + ':\n' + listOf(q, 6)); playBtn(q); return true;
      }
      if (/^(?:what (?:did i|have i) (?:add|added)(?: recently| lately)?|(?:show|list)(?: me)?(?: my)? (?:recent(?:ly added)?|newest|latest)(?: songs| tracks)?|what'?s new in my library|(?:my )?(?:recently added|newest|latest)(?: songs| tracks)?|recent (?:songs|tracks|additions))$/i.test(t)) {
        const q = real().slice(-6).reverse(); if (!q.length) return say('Your library is empty.'); say('Most recently added:\n' + listOf(q, 6)); playBtn(q); return true;
      }
      if (/^(?:which|what) (?:songs|tracks) (?:are|have)(?:n'?t| not) (?:been )?tagged(?: yet)?$|^(?:list|show)(?: me)?(?: my)? untagged(?: songs| tracks)?$/i.test(t)) {
        const tgs = loadTags(), q = real().filter(i => !tgs[A.tracks()[i].dbId]); if (!q.length) return say('Every track is tagged.');
        say(q.length + ' untagged:\n' + listOf(q, 8)); return ask('Tag them all now?', () => tagWith('all'), true);
      }
      if ((m = t.match(/^(?:which|what) (?:songs|tracks|music) (?:are|sound|feel) (?:(?:the )?most |really |very )?(.+)$/i))) {
        const ws = wordsOf(m[1]); if (ws.length && ws.every(w => VIBEW.has(w))) { const r = findTracks(ws); if (!r.length) return say('No tagged tracks match that yet. Tagging more tracks helps.'); say(r.length + ' match:\n' + listOf(r, 8)); playBtn(r); return true; }
      }
      if (/^play (?:a |some )?(?:random )?videos?$|^play (?:me )?a (?:random )?video$/i.test(t)) {
        const tr = A.tracks(), q = shuffleIn(real().filter(i => tr[i].kind === 'video')); if (!q.length) return say('You have no videos in the library.'); A.play(q[0], q); return done('Playing ' + tr[q[0]].title + '.');
      }
      // play by position
      if ((m = t.match(/^play (?:the )?(first|second|third|last|random|\d+(?:st|nd|rd|th)?) (?:song|track)$/i))) {
        const tr = A.tracks(), q = tr.map((x, i) => i).filter(i => !tr[i].stem); if (!q.length) return say('Your library is empty.');
        const w = m[1].toLowerCase(), ord = { first: 1, second: 2, third: 3 }, n = w === 'last' ? q.length : w === 'random' ? 1 + Math.floor(Math.random() * q.length) : (ord[w] || parseInt(w, 10));
        if (!(n >= 1 && n <= q.length)) return say('You have ' + q.length + ' tracks, so I cannot play number ' + w + '.');
        A.play(q[n - 1], q); return done('Playing ' + tr[q[n - 1]].title + '.');
      }
      // settings
      let tg = null; if ((m = t.match(/^(?:turn|switch|set) (on|off) (.+)$/i))) tg = [m[1], m[2]]; else if ((m = t.match(/^(enable|disable) (.+)$/i))) tg = [m[1] === 'enable' ? 'on' : 'off', m[2]];
      if (tg) {
        const TOG = [[/background|away|idle/i, 'ppv-bg', 'Background tagging'], [/surprise/i, 'ppv-surp', 'Surprise playlists'], [/section/i, 'ppv-sect', 'Split-song sections'], [/(live|smart)/i, 'ppv-live', 'Live smart playlists']];
        const hit = TOG.find(x => x[0].test(tg[1])), el = hit && $id(hit[1]);
        if (!hit || !el) return say('I can switch these on or off: background tagging, surprise playlists, split-song sections, live smart playlists.');
        el.checked = tg[0].toLowerCase() === 'on'; el.dispatchEvent(new Event('change', { bubbles: true })); return done(hit[2] + ' ' + (el.checked ? 'on' : 'off') + '.');
      }
      // play something
      if ((m = t.match(/^(?:play|put on|queue up|start playing)\s+(.+)$/i))) {
        const ws = wordsOf(m[1]), tr = A.tracks();
        if (!ws.length || ws.every(w => ['random', 'anything', 'everything', 'all', 'shuffle', 'shuffled'].includes(w))) {
          const q = shuffleIn(tr.map((x, i) => i).filter(i => !tr[i].stem)); if (!q.length) return say('Your library is empty.'); A.play(q[0], q); return done('Playing a shuffled mix.');
        }
        if (!ws.every(w => VIBEW.has(w))) {                             // names, not moods: artist / title / playlist, typo-tolerant
          const hit = resolveMusic(m[1]);
          if (hit && hit.kind === 'artist') { const q = shuffleIn(hit.a.idxs.filter(i => !tr[i].stem)); A.play(q[0], q); return done('Playing ' + q.length + ' song' + (q.length === 1 ? '' : 's') + ' by ' + hit.a.name + (q.length > 1 ? ', shuffled' : '') + ': ' + tr[q[0]].title + '.'); }
          if (hit && hit.kind === 'song') { const q = hit.queue; A.play(q[0], q); return done('Playing ' + tr[q[0]].title + (tr[q[0]].artist ? ' by ' + tr[q[0]].artist : '') + '.'); }
          const pl0 = (() => { const w = mFlat(m[1]); return A.playlists().filter(p => !p.libOnly && !p.stemOf).find(p => mFlat(p.name) === w); })();
          if (pl0) { const q = tr.map((x, i) => i).filter(i => !tr[i].stem && (tr[i].playlistIds || []).includes(pl0.id)); if (q.length) { A.play(q[0], q); return done('Playing your ' + pl0.name + ' playlist (' + q.length + ' tracks).'); } }
        }
        const r = findTracks(ws); if (!r.length) {
          const near = ws.every(w => VIBEW.has(w)) ? [] : nearMisses(m[1]);
          if (near.length) { add('bot', blTone('I could not find \u201c' + m[1] + '\u201d. Did you mean:')); actions(near.map(n => ['\u25b6 ' + n[2], (b, d) => { d.remove(); agent(n[1], true); }])); return true; }
          if (ws.length && ws.every(w => VIBEW.has(w)) && tagStats().left > 0) return (askYN('I pick music by mood from your tags, and some tracks are not tagged yet. Tag your library first? I will start the music when it is done.', () => tagAll(() => agent(t, true))), true);
          return say('I could not find anything for \u201c' + m[1] + '\u201d. Tagging more tracks helps me find moods and styles.');
        }
        const vibeOnly = ws.every(w => VIBEW.has(w)); if (vibeOnly) shuffleIn(r);
        const q = r.slice(0, 30); A.play(q[0], q);
        return done('Playing ' + (vibeOnly ? q.length + ' ' + ws.join(' ') + ' tracks' : tr[q[0]].title + (q.length > 1 ? ' (and ' + (q.length - 1) + ' more matches queued)' : '')) + '.');
      }
      return false;
    }
    // AGENT END

    // SMART START
