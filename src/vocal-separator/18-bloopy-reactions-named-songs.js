    // ---------- Bloopy's voice on command replies: short replies sometimes get a quip for their topic. Lists and longer answers never do. ----------
    const BL_QUIPS = [
      [/volume|louder|quieter|muted?|unmuted/i, ['Ears are happy.', 'Easy on the speakers, friend.', 'Turned up the fun!']],
      [/skipped|went back|back to|next|previous/i, ['Next stop, next song!', 'Onwards!', 'Rewinding my memory too.']],
      [/paused|playing|resum|now playing/i, ['Let the music roll.', 'Bouncing along.', 'Ahhh, that is the good stuff.']],
      [/shuffle/i, ['Mixing it up like a DJ.', 'Chaos mode, but tasteful.']],
      [/playlist|mix/i, ['A fresh mix, made with care.', 'Playlists are my favourite thing to build.', 'Another one for the collection!']],
      [/tagged|tag|bpm|tempo|\bkey\b|mood/i, ['I listened closely. Good ears, these tags.', 'Sniffed out the vibe.']],
      [/split|stems?|vocals?|separat/i, ['Careful, I just took it apart. Gently!', 'Scissors, but make it music.']],
      [/lyrics|subtitles?|transcrib/i, ['I wrote every word down. My pencil is tired.', 'Lyrics unlocked!']],
      [/sleep timer|stop after/i, ['Sleep well soon!', 'Ticking away.']],
      [/\beq\b|equali|preset|bass|treble/i, ['Tuned it up, sounds fancy.', 'A proper sound stage now.']],
      [/speed|faster|slower/i, ['Wheeee!', 'Slow and steady, I like that.']],
      [/fullscreen|zoom|picture|frame|rotate/i, ['Big screen time!', 'Let me see that picture.']],
      [/not find|could not find|cannot find|do not see|do not have|not in your/i, ['Hmm, I looked everywhere.', 'Not in here, and I checked twice.', 'Maybe it is hiding in another folder.']],
      [/nothing is playing|nothing is loaded/i, ['Silence is golden, but I would rather bounce.', 'Play something and I will join in.']],
      [/undid|undo|back to how it was/i, ['Time travel complete.', 'Rewound my own mistake.']],
      [/library is empty|empty/i, ['An empty library is a sad ball.', 'Add some songs and I will cheer.']]
    ];
    function blTone(s) {
      const t = String(s);
      if (t.includes('\n') || t.length > 120 || Math.random() > (blSkinKey() ? 0.55 : 0.4)) return t;
      const hi = BL_QUIPS.findIndex(([re]) => re.test(t));
      return hi < 0 ? t : t + ' ' + pick(blTopic(BL_QUIP_TOPICS[hi], BL_QUIPS[hi][1]));
    }
    // ---------- Bloopy reacts to clicks and taps: a speech bubble over the page, his face changes, and poking him gets a different reaction each time. ----------
    const blReactCss = document.createElement('style');
    blReactCss.textContent = '#bl-react{position:fixed;left:50%;bottom:100px;transform:translate(-50%,8px);opacity:0;transition:opacity .25s,transform .25s;background:#23242a;color:#eee;border:1px solid #444;border-radius:12px;padding:7px 12px;font:13px system-ui,sans-serif;z-index:99990;pointer-events:none;max-width:86vw;text-align:center;box-shadow:0 6px 18px #0008}#bl-react.show{opacity:1;transform:translate(-50%,0)}';
    document.head.appendChild(blReactCss);
    let blBubble = null, blSpeakT = 0, blFaceT = 0, blLastSpeak = 0, blLastLine = '';
    const BL_CLICK = {
      'play-btn': ['Play, pause, play. I never get tired of that button.', 'Ooh, the big button! Something is about to happen.', 'Pressed play. Bounce engaged.'],
      'next-btn': ['Next song! Bye bye, last one.', 'Skipping ahead. Very brave.', 'Next! I hope you like the next one.'],
      'prev-btn': ['Back we go! Time travel is my favourite.', 'Previous song. A little nostalgia never hurt.'],
      'shuffle-btn': ['Shuffle on! Let the chaos begin.', 'Shuffle toggled. Your playlists will never be the same twice.'],
      'repeat-btn': ['Again, again! Round and round we go.', 'Repeat mode. I like a song I can hear twice.'],
      'volume': ['Volume slider! Careful, my ears are sensitive.', 'Sliding the sound. Nice and steady.'],
      'seek': ['Scrubbing through! Wheeee.', 'Jumping around the song like a bouncing ball.'],
      'eq-btn': ['Equaliser! Let me bring out the bass.', 'Tuning the sound. Very professional.'],
      'speed-btn': ['Speed menu! Gotta go fast.', 'Speedy choices.'],
      'sleep-btn': ['Sleep timer? Good plan. I will nap too.', 'Tucking the music in.'],
      'fx-btn': ['Effects! Ooh, shiny.', 'Effects menu. Let\u2019s get fancy.'],
      'subtitle-btn': ['Captions! I can read along with you.', 'Subtitles on the menu. Good call.'],
      'menu-btn': ['Menu! The big list of things.', 'Opening the menu. What are we after?'],
      'pip-btn': ['Picture in picture! Tiny screen, big fun.'],
      'rotate-btn': ['Rotating! Wheee, I feel a bit dizzy.', 'Turning the picture around. Careful now.'],
      'ppv-go': ['Splitting now. Scissors out!', 'Here we go, pulling the song apart.'],
      'ppv-tag': ['Tagging! Sniffing out the vibe.', 'Listening carefully. Good tags take a moment.'],
      'ppv-wgo': ['Lyrics! Pencil ready.', 'Writing down every word.'],
      'ppv-simgo': ['Finding songs that sound alike. Good hunt!'],
      'ppv-surpnow': ['Surprise! I love a good surprise.'],
      'ppv-eqall': ['Auto EQ on all tagged tracks. Very tidy.'],
      'ppv-del': ['Deleting the model. Bye bye, big file.'],
      'ppv-heads': ['Mood models again? I will be right here.']
    };
    const BL_CLICK_GEN = {
      button: ['Click! Nice.', 'Ooh, pressed it.', 'Button pressed. Bouncing approves.', 'Good click.', 'Tap, tap. I felt that.', 'Done, whatever that was!'],
      toggle: ['Switched! Flip, flip.', 'On or off, I trust you.', 'Toggle time!', 'Clicky click. Nice switch.', 'That one changes things, huh?'],
      tab: ['A new tab! Let\u2019s see what\u2019s in here.', 'Switching panes. Looking around.', 'Tab hop!', 'Ooh, a new room.'],
      slider: ['Sliding! Nice and smooth.', 'Watch the numbers move.', 'Slide, slide.']
    };
    const BL_POKE = ['Boing!', 'Hehe, that tickles!', 'Hey! I was bouncing.', 'Poke me again and I will wobble.', 'That is my nose... I think?', 'Okay, okay, I am awake!', 'Stop poking, I am trying to think!', 'You really like me, huh?'];
    const BL_DIZZY = ['Whoa, I am so dizzy!', 'The room is spinning. Give me a second.', 'Okay, that is enough poking for now!'];
    const blFresh = pool => { const fresh = pool.filter(x => x !== blLastLine); const l = pick(fresh.length ? fresh : pool); blLastLine = l; return l; };
    // A speech bubble over the page. Quick repeats are skipped unless forced (dizzy).
    function blSpeak(line, face, force) {
      if (!bubblesOn()) return;
      if (!force && Date.now() - blLastSpeak < 1200) return;
      blLastSpeak = Date.now();
      if (!blBubble) { blBubble = document.createElement('div'); blBubble.id = 'bl-react'; document.body.appendChild(blBubble); }
      blBubble.textContent = line; blBubble.classList.add('show');
      clearTimeout(blSpeakT); blSpeakT = setTimeout(() => blBubble.classList.remove('show'), 2600);
      if (face) { [fb, cball].forEach(b => blFace(b, face)); clearTimeout(blFaceT); blFaceT = setTimeout(() => [fb, cball].forEach(b => blFace(b, 'idle')), 1800); }
    }
    const blPokes = [];
    function blPoke(ball) {
      const now = Date.now(); blPokes.push(now); while (blPokes.length && now - blPokes[0] > 3500) blPokes.shift();
      if (blPokes.length >= 5) { blPokes.length = 0; blFace(ball, 'err'); blSpeak(blLine('dizzy', BL_DIZZY), 'err', true); setTimeout(() => blFace(ball, 'idle'), 2200); return; }
      blSpeak(blFresh(blPool('poke', BL_POKE)), 'greet');
    }
    document.addEventListener('click', e => {
      if (Date.now() < blSuppress || !e.target || !e.target.closest) return;
      const ball = e.target.closest('.ppv-ball');
      if (ball) { if (ball !== pb) blPoke(ball); return; }
      const el = e.target.closest('button, input, label, select, [data-sidebar-tab]');
      if (!el || el.closest('#ppv-chat, #bl-react')) return;
      let pool = el.id && BL_CLICK[el.id] ? BL_CLICK[el.id] : null;
      if (!pool) {
        const kind = el.hasAttribute('data-sidebar-tab') ? 'tab' : el.matches('input[type=range]') ? 'slider' : el.matches('input[type=checkbox], label, select') ? 'toggle' : el.matches('button') ? 'button' : null;
        pool = kind ? BL_CLICK_GEN[kind] : null;
      }
      if (pool && Math.random() < 0.6) blSpeak(blFresh(blPool('click', pool)), 'excited');
    }, true);
    // ---------- Named songs: questions about a song you name ("bpm of Hello", "tell me about Hello") are answered from its tags. ----------
    // Library tracks whose title appears as whole words in the text, longest title first, at most three.
    function blNamed(text) {
      const A = window.__ppApi; if (!A) return [];
      const q = ' ' + String(text).toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ') + ' ', tr = A.tracks(), hits = [];
      sReal().forEach(i => { const tt = ' ' + String(tr[i].title).toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim() + ' '; if (tt.length >= 5 && q.includes(tt)) hits.push(i); });
      return hits.sort((a, b) => tr[b].title.length - tr[a].title.length).slice(0, 3);
    }
    function blNamedTalk(text) {
      const x = String(text).trim().replace(/[?!.]+$/, '');
      if (!/^(?:what|which|is|are|how|tell|describe|does|do|whats)\b/i.test(x) && !/\b(of|for|about)\b/i.test(x)) return false;
      const hits = blNamed(x); if (!hits.length) return false;
      const A = window.__ppApi, t = A.tracks()[hits[0]], tgc = loadTags()[t.dbId], label = t.title + (t.artist ? ' by ' + t.artist : '');
      if (!tgc) return blSay(label + ' is not tagged yet, so I do not know its tags. Tag it first and I will tell you.');
      if (/\b(bpm|tempo)\b/i.test(x)) return blSay(label + ': ' + (tgc.bpm ? tgc.bpm + ' BPM' : 'no tempo found yet') + '.');
      if (/\bkey\b/i.test(x)) return blSay(label + ': ' + (tgc.key ? 'key of ' + tgc.key + (tgc.ck ? ' ' + tgc.ck : '') : 'no key found yet') + '.');
      if (/\bgenre\b/i.test(x)) return blSay(label + ': genre ' + ((tgc.gn || []).slice(0, 3).map(v => v[0]).join(', ') || 'not clear') + '.');
      return blSay(label + ': ' + tagLine(t) + '.');
    }
    let blChain = false, blPaused = false, blQueue = [];
    // Runs each part of a chain as its own command, one reply per part. A part that needs a yes/no pauses the chain;
    // the rest runs after the answer. A part that cannot be understood is skipped and the rest still runs.
    function blRunChain(parts) {
      const was = blChain; blChain = true;
      try {
        for (let i = 0; i < parts.length; i++) {
          let ok = false;
          try { ok = smart(parts[i], false, true); } catch (e) { console.error(e); add('bot', 'Oops, that did not work: ' + e.message); ok = true; }
          if (!ok) { add('bot', 'I did not understand \u201c' + parts[i] + '\u201d, so I skipped it.'); continue; }
          if (blPaused) { blPaused = false; blQueue = parts.slice(i + 1); return; }
        }
      } finally { blChain = was; }
    }
    function blResume() { const q = blQueue; blQueue = []; if (q.length) blRunChain(q); }
    const HELP_MORE = '\n\u2022 \u201cwhy is <song> in my <playlist>\u201d, \u201cwhy is <song> in my mixes\u201d, \u201cwhy is it in my for you\u201d\n\u2022 \u201cteach yourself \u201cchill out\u201d means \u201cplay something chill\u201d\u201d, \u201cwhen I say play * vibes, play something *\u201d, \u201cforget chill out\u201d, \u201cwhat have you learned\u201d\n\u2022 \u201cwhich playlists is this in\u201d, \u201cwhich song is in the most playlists\u201d, \u201cduplicate playlist Gym as Gym 2\u201d, \u201cempty playlist Old\u201d\n\u2022 \u201cplay my top 10 songs\u201d, \u201cplay songs I have never played\u201d, \u201chow many songs have I never played\u201d\n\u2022 \u201cplay the last song I added\u201d, \u201cplay the first song I added\u201d\n\u2022 \u201chow much did I listen yesterday\u201d, \u201chow much in the last 7 days\u201d\n\u2022 \u201cwhat genres do I have\u201d, \u201cmost common moods\u201d, \u201caverage tempo\u201d, \u201cmost common key\u201d, \u201chow many songs are untagged\u201d\n\u2022 \u201cwhat time is it\u201d, \u201cwhat is today\u2019s date\u201d, \u201cflip a coin\u201d, \u201croll a d20\u201d, \u201cpick a number from 1 to 50\u201d\n\u2022 \u201cwhat can I do now?\u201d, \u201csuggest something\u201d: five things to try for what is playing right now\n\u2022 Put several together with commas or \u201cthen\u201d, for any commands: \u201csplit <song>, play <song> then raise volume\u201d. Bloopy answers each one in its own message, and pauses to ask when something needs a yes or no.';
    // The extra commands. Returns true when it handled the text.
    function blExtra(t) {
      const A = window.__ppApi, tr = A.tracks(), ids = sReal(), cu = A.currentIndex();
      let PC = null; const plays = () => PC || (PC = blSave().trackPlays || {}), cnt = i => ((plays()[tr[i].dbId] || {}).count || 0);
      const playIdx = (q, label) => { A.play(q[0], q); return blDone(label); };
      const nothingTagged = () => blSay('I need tagged songs for that. Say \u201ctag all\u201d first.');
      let m;
      if (blDress(t)) return true;
      if (BL_SUGGEST_RE.test(t)) { const s = blSuggestions(); if (!s.length) return blSay('Nothing to suggest right now. Try \u201cplay something chill\u201d.'); blSay('Here are a few things you could try right now:'); actions(s.map(c => ['\u25b6 ' + c, (b, d) => { d.remove(); send(c, true); }])); return true; }
      // why (any song, any playlist or mix)
      if ((m = t.match(/^why (?:is|are|was|were|did|does|do) (.+)$/i))) { const r = blParseWhy(m[1]); if (r) return blWhy(r.song, r.tgt); }
      // teach / forget / list his commands
      if ((m = t.match(/^(?:teach (?:yourself|bloopy?|you)|learn|new command|(?:make|create|add) (?:a |an )?(?:new )?(?:command|shortcut))(?:[:,]| that| called| named| for)?\s+["\u201c']?(.+?)["\u201d']?\s+(?:means|=|->|does|runs|should do)\s+["\u201c']?(.+?)["\u201d']?$/i))) return blTeachSave(m[1], m[2]);
      if ((m = t.match(/^when i (?:say|type|ask(?: you)?) ["\u201c']?(.+?)["\u201d']?,?\s+(?:then\s+)?(?:do|run|play|go with|use|make)\s+(?:it as\s+)?["\u201c']?(.+?)["\u201d']?$/i))) return blTeachSave(m[1], m[2]);
      if ((m = t.match(/^(?:forget|unlearn|delete|remove) (?:the |my |that )?(?:taught |custom |new )?(?:command|phrase|shortcut)(?: called| named| for)? (.+)$/i))) {
        const p = blNormPhrase(m[1]), L = blTaughtGet(), left = L.filter(e => e.p !== p);
        if (left.length === L.length) return blSay('I have no taught command for \u201c' + p + '\u201d. Say \u201cwhat have you learned\u201d to see them.');
        blTaughtSet(left); return blDone('Forgot \u201c' + p + '\u201d.');
      }
      if (/^(?:what have you (?:learned|learnt)|what (?:commands|shortcuts) have i taught you|(?:list|show)(?: me)? (?:my |the )?(?:taught|custom|learned|learnt|own) (?:commands|shortcuts)|my (?:taught |custom |own )?commands)\??$/i.test(t)) {
        const L = blTaughtGet();
        return blSay(L.length ? 'I have learned ' + L.length + ':\n' + L.map(e => '\u2022 \u201c' + e.p + '\u201d means \u201c' + e.c + '\u201d').join('\n') : 'I have not learned any commands yet. Try: teach yourself \u201cchill out\u201d means \u201cplay something chill\u201d.');
      }
      // playlists
      if (/^(?:which|what) playlists? (?:is|are) (?:this|it|the current)(?: (?:song|track|one))? (?:in|part of)\??$|^how many playlists (?:is|are) (?:this|it)(?: (?:song|track))? in\??$/i.test(t)) {
        if (cu < 0) return blSay('Play or pick a track first.');
        const pls = blPls().filter(p => blIn(tr[cu], p));
        return blSay(pls.length ? tr[cu].title + ' is in ' + pls.length + ' playlist' + (pls.length === 1 ? '' : 's') + ': ' + pls.map(p => p.name).join(', ') + '.' : tr[cu].title + ' is not in any playlist.');
      }
      if (/^which (?:song|track) is in the most playlists\??$|^what (?:song|track) is in (?:the )?most playlists\??$/i.test(t)) {
        const pl = blPls(); let best = -1, bn = 0;
        ids.forEach(i => { const n = pl.filter(p => blIn(tr[i], p)).length; if (n > bn) { bn = n; best = i; } });
        return blSay(best < 0 ? 'None of your songs are in a playlist yet.' : '\u201c' + tr[best].title + '\u201d is in the most playlists: ' + bn + '.');
      }
      if ((m = t.match(/^(?:duplicate|copy|clone) (?:my |the )?playlist (.+?) (?:as|to|called|named) (.+)$/i))) {
        const src = blFindPl(m[1]); if (!src) return blSay('I cannot find a playlist called \u201c' + m[1] + '\u201d.');
        const pl = A.createPlaylist(m[2].trim().slice(0, 60)); let n = 0;
        tr.forEach(x => { if (!x.stem && blIn(x, src)) { A.addToPlaylist(x.dbId, pl.id); n++; } });
        A.commitPlaylists(); return blDone('Made \u201c' + pl.name + '\u201d with ' + n + ' song' + (n === 1 ? '' : 's') + ' from \u201c' + src.name + '\u201d.');
      }
      if ((m = t.match(/^(?:empty|clear out|clear) (?:my |the )?playlist (.+)$/i))) {
        const pl = blFindPl(m[1]); if (!pl) return blSay('I cannot find a playlist called \u201c' + m[1] + '\u201d.');
        if (pl.liveKey) return blSay('Auto mixes refill themselves, so I will not empty them. Turn them off in the Library tab if you want them gone.');
        const n = tr.filter(x => !x.stem && blIn(x, pl)).length; if (!n) return blSay('\u201c' + pl.name + '\u201d is already empty.');
        askYN('Take all ' + n + ' song' + (n === 1 ? '' : 's') + ' out of \u201c' + pl.name + '\u201d? They stay in your library.', () => { tr.forEach(x => { if (blIn(x, pl)) A.removeFromPlaylist(x.dbId, pl.id); }); A.commitPlaylists(); blDone('Emptied \u201c' + pl.name + '\u201d.'); });
        return true;
      }
      // play by history and by order
      if ((m = t.match(/^play (?:my )?top (\d{1,2}|one|two|three|four|five|six|seven|eight|nine|ten|fifteen|twenty) (?:songs|tracks)$/i))) {
        const n = Math.min(50, BL_NUM[m[1].toLowerCase()] || +m[1]), q = ids.filter(i => cnt(i) > 0).sort((a, b) => cnt(b) - cnt(a)).slice(0, n);
        return q.length ? playIdx(q, 'Playing your top ' + q.length + ' most played song' + (q.length === 1 ? '' : 's') + '.') : blSay('I have no play counts yet. Play some music first.');
      }
      if (/^play (?:the )?(?:songs|tracks|music) i (?:have )?(?:never|not yet) (?:played|heard|listened to)$|^play (?:the )?(?:unplayed|unheard) (?:songs|tracks|music)$/i.test(t)) {
        const q = ids.filter(i => cnt(i) === 0).sort(() => Math.random() - .5);
        return q.length ? playIdx(q.slice(0, 50), 'Playing ' + q.length + ' song' + (q.length === 1 ? '' : 's') + ' you have never played, shuffled.') : blSay('You have played every song in your library.');
      }
      if (/^how many (?:songs|tracks) (?:have i|did i) (?:never|not yet) (?:played|heard|listened to)\??$|^how many (?:songs|tracks) (?:are )?(?:unplayed|unheard)\??$/i.test(t)) {
        const n = ids.filter(i => cnt(i) === 0).length; return blSay(n + ' of your ' + ids.length + ' songs ' + (n === 1 ? 'has' : 'have') + ' never been played.');
      }
      if (/^play (?:the )?(?:song|track) i (?:added|imported|uploaded) (?:last|most recently|recently)$|^play (?:the )?(?:newest|latest|most recently added) (?:song|track)$/i.test(t)) {
        const i = ids[ids.length - 1]; if (i === undefined) return blSay('Your library is empty.');
        return playIdx([i], 'Playing \u201c' + tr[i].title + '\u201d, the last song you added.');
      }
      if (/^play (?:the )?(?:song|track) i (?:added|imported|uploaded) first$|^play (?:the )?(?:oldest|first added) (?:song|track)$/i.test(t)) {
        const i = ids[0]; if (i === undefined) return blSay('Your library is empty.');
        return playIdx([i], 'Playing \u201c' + tr[i].title + '\u201d, the first song you added.');
      }
      // listening history
      if (/^how (?:much|long) (?:did i|have i) (?:listen(?:ed)?|played)(?: to)? yesterday\??$|^(?:how much|what(?:'s| is) my (?:listening|listen)(?: time)?) yesterday\??$/i.test(t)) {
        const d = new Date(); d.setDate(d.getDate() - 1); const ms = ((blSave().x || {}).dayMs || {})[blDayKey(d)] || 0;
        return blSay(ms ? 'Yesterday you listened for ' + blMin(ms) + '.' : 'I have no listening recorded for yesterday.');
      }
      if (/^how (?:much|long) (?:did i|have i) (?:listen(?:ed)?|played)(?: to (?:music|anything))? (?:in )?(?:the )?(?:last|past) (?:week|7 days|seven days)\??$/i.test(t)) {
        const dm = (blSave().x || {}).dayMs || {}, d = new Date(); let sum = 0;
        for (let k = 0; k < 7; k++) { sum += dm[blDayKey(d)] || 0; d.setDate(d.getDate() - 1); }
        return blSay(sum ? 'In the last 7 days you listened for ' + blMin(sum) + '.' : 'I have no listening recorded for the last 7 days.');
      }
      // what the tags say about the whole library
      if (/^what (?:genres?|kinds? of music) (?:do i have|am i listening to|do i listen to|are in my (?:library|music))\??$|^(?:what|which) genres? (?:are|is) (?:in )?(?:my )?(?:library|music)\??$/i.test(t)) {
        const tgs = loadTags(), c2 = {}; let n = 0;
        ids.forEach(i => { const c = tgs[tr[i].dbId]; if (!c) return; n++; (c.gn || []).slice(0, 2).forEach(v => { c2[v[0]] = (c2[v[0]] || 0) + 1; }); });
        if (!n) return nothingTagged();
        const top = Object.entries(c2).sort((a, b) => b[1] - a[1]).slice(0, 6);
        return blSay('Top genres in ' + n + ' tagged songs:\n' + top.map((x, k) => (k + 1) + '. ' + x[0] + ' (' + x[1] + ')').join('\n'));
      }
      if (/^what (?:moods?|vibes?) (?:are )?(?:the )?(?:most )?(?:common|popular|top)(?: in)?(?: my)?(?: (?:library|music|songs|tracks))?\??$|^what (?:moods?|vibes?) (?:do i have|is my (?:library|music))\??$/i.test(t)) {
        const tgs = loadTags(), c2 = {}; let n = 0;
        ids.forEach(i => { const c = tgs[tr[i].dbId]; if (!c) return; n++; vibes(c).forEach(v => { c2[v] = (c2[v] || 0) + 1; }); });
        if (!n) return nothingTagged();
        const top = Object.entries(c2).sort((a, b) => b[1] - a[1]).slice(0, 6);
        return blSay('Most common moods in ' + n + ' tagged songs:\n' + top.map((x, k) => (k + 1) + '. ' + x[0] + ' (' + x[1] + ')').join('\n'));
      }
      if (/^(?:what(?:'s| is)|tell me|give me) (?:the )?(?:average|avg|typical|mean) (?:tempo|bpm)(?: (?:of|for|in) (?:my|the) (?:library|music|songs|tracks))?\??$|^(?:what(?:'s| is)|what is) (?:the )?(?:bpm|tempo) range(?: (?:of|in) (?:my|the) (?:library|music|songs|tracks))?\??$/i.test(t)) {
        const tgs = loadTags(), bp = ids.map(i => (tgs[tr[i].dbId] || {}).bpm).filter(b => b > 0);
        if (!bp.length) return nothingTagged();
        const avg = Math.round(bp.reduce((a, b) => a + b, 0) / bp.length);
        return blSay('Across ' + bp.length + ' tagged songs the average is ' + avg + ' BPM, ranging from ' + Math.min(...bp) + ' to ' + Math.max(...bp) + ' BPM.');
      }
      if (/^what keys? (?:is|are) (?:my |the )?(?:library|music|songs|tracks)(?: mostly)? in\??$|^what(?:'s| is) the most common key(?: in my (?:library|music))?\??$/i.test(t)) {
        const tgs = loadTags(), k2 = {};
        ids.forEach(i => { const c = tgs[tr[i].dbId]; if (c && c.key) k2[c.key] = (k2[c.key] || 0) + 1; });
        const top = Object.entries(k2).sort((a, b) => b[1] - a[1]).slice(0, 5);
        return top.length ? blSay('Most common keys: ' + top.map(x => x[0] + ' (' + x[1] + ')').join(', ') + '.') : nothingTagged();
      }
      if (/^how many (?:songs|tracks) (?:are )?(?:still )?(?:not tagged|untagged|left to tag)(?: yet)?\??$|^how many (?:songs|tracks) (?:still )?need tagging\??$/i.test(t)) {
        const tgs = loadTags(), n = ids.filter(i => !tgs[tr[i].dbId]).length;
        return blSay(n + ' of your ' + ids.length + ' songs ' + (n === 1 ? 'is' : 'are') + ' not tagged yet.' + (n ? ' Say \u201ctag all\u201d to fix that.' : ''));
      }
      // small things
      if (/^what time is it(?: right now| now)?\??$|^what(?:'s| is) the (?:current|exact|clock) time(?: right now| now)?\??$|^tell me the time\??$/i.test(t)) return blSay('It is ' + new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) + ' on this device.');
      if (/^what(?:'s| is) (?:today'?s |the )?date(?: today)?\??$|^what day is (?:it|today)\??$|^what(?:'s| is) today\??$/i.test(t)) return blSay('Today is ' + new Date().toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }) + '.');
      if (/^(?:flip|toss)(?: a| the)? coin\??$|^heads or tails\??$/i.test(t)) return blSay(Math.random() < .5 ? 'Heads.' : 'Tails.');
      if ((m = t.match(/^roll (?:a |the )?(?:dice|die|d(\d{1,4}))\??$/i))) { const n = m[1] ? Math.max(2, +m[1]) : 6; return blSay('You rolled a ' + (1 + Math.floor(Math.random() * n)) + ' (d' + n + ').'); }
      if ((m = t.match(/^(?:pick|choose|give me|random) (?:a )?(?:random )?number (?:from|between) (-?\d+) (?:to|and) (-?\d+)\??$/i))) {
        let lo = +m[1], hi = +m[2]; if (lo > hi) { const z = lo; lo = hi; hi = z; }
        return blSay('I picked ' + (lo + Math.floor(Math.random() * (hi - lo + 1))) + '.');
      }
      return false;
    }
    const HELP_MIX = '\n\u2022 \u201cmake a playlist\u201d (I will ask what kind), or tap the chips above the box\n\u2022 \u201crefresh my mixes\u201d, \u201cplay my for you\u201d, \u201cplay ones you may like\u201d, \u201cplay your pattern\u201d\n\u2022 \u201cturn auto mixes off\u201d / \u201con\u201d\n\u2022 \u201cblock this song\u201d, \u201cblock this artist\u201d, \u201cblock <artist>\u201d (add \u201cun\u201d to undo), \u201cwhy is this in my mixes\u201d\n\u2022 Type \u201cplay\u201d, \u201cadd this to\u201d or \u201csongs by\u201d and I suggest matches as you type. Say \u201cundo\u201d to take back most of this.';
    function lcCmd(t) {
      const A = window.__ppApi, L = window.__ppLiveMixes; if (!A || !L) return false; let m;
      const ci = A.currentIndex(), cur = ci >= 0 ? A.tracks()[ci] : null;
      if (/^(?:make|create|build|start)(?: me)?(?: a| an)?(?: new)? playlist$/i.test(t)) return (guidePl(), true);
      if (/^(?:refresh|update|rebuild|redo)(?: my| the| all)?(?: auto| live)? mixes$/i.test(t)) {
        if (!lvOn()) return sSay('Auto mixes are off. Say \u201cturn auto mixes on\u201d first.');
        const snap = () => { const o = {}; A.playlists().filter(p => p.liveKey).forEach(p => { o[p.id] = { p, ids: A.tracks().filter(x => !x.stem && (x.playlistIds || []).includes(p.id)).map(x => x.dbId) }; }); return o; }, before = snap();
        sSay('Refreshing your mixes\u2026');
        L.refresh().then(() => {
          const after = snap(); let add_ = 0, rem = 0;
          Object.keys(after).forEach(k => { const b = (before[k] ? before[k].ids : []).map(String), a = after[k].ids.map(String); add_ += a.filter(x => !b.includes(x)).length; rem += b.filter(x => !a.includes(x)).length; });
          lcUndo('Put your mixes back how they were.', () => { Object.keys(after).forEach(k => { const b = (before[k] ? before[k].ids : []), bs = b.map(String), a = after[k].ids, as = a.map(String), pl = after[k].p; a.filter((x, n) => !bs.includes(as[n])).forEach(x => A.removeFromPlaylist(x, pl.id)); b.filter((x, n) => !as.includes(bs[n])).forEach(x => A.addToPlaylist(x, pl.id)); }); A.commitPlaylists(); lvLast = Date.now() + 8 * 60000; });
          sDone(add_ || rem ? 'Mixes updated: ' + add_ + ' added, ' + rem + ' removed.' : 'Your mixes already look right. Nothing to change.');
        }).catch(e => sSay('I could not refresh: ' + e.message));
        return true;
      }
      if ((m = t.match(/^(?:play|start|put on|open)(?: my| the)? (for you|ones you may like|your pattern|pattern)(?: mix| playlist)?$/i))) {
        const key = /for you/i.test(m[1]) ? 'foryou' : /may like/i.test(m[1]) ? 'maylike' : 'pattern', n = lcPlayMix(key);
        if (n) return sDone('Playing ' + n + '.');
        if (!lvOn()) return sSay('Auto mixes are off. Say \u201cturn auto mixes on\u201d first.');
        sSay('That mix is empty, so I will fill it first.'); L.refresh().then(() => { const n2 = lcPlayMix(key); sSay(n2 ? '\u25b6 Playing ' + n2 + '.' : 'I could not find enough songs for it yet. Play and tag a few more tracks.'); }); return true;
      }
      if (/^(?:(?:turn|switch|set)(?: my| the)?(?: auto| live)? mixes (?:on|off)|(?:turn|switch) (?:on|off)(?: my| the)?(?: auto| live) mixes|(?:enable|disable)(?: my| the)?(?: auto| live)? mixes)$/i.test(t)) {
        const want = /\b(on|enable)\b/i.test(t), was = lvOn(), b = document.getElementById('ppv-lmix');
        const setTo = v => { if (b) { b.checked = v; b.dispatchEvent(new Event('change', { bubbles: true })); } else lvLs('ppvLiveMix', v ? '1' : '0'); };
        if (want === was) return sSay('Auto mixes are already ' + (was ? 'on' : 'off') + '.');
        setTo(want); lcUndo('Auto mixes are ' + (was ? 'on' : 'off') + ' again.', () => setTo(was)); return sDone('Auto mixes are ' + (want ? 'on' : 'off') + '.');
      }
      if ((m = t.match(/^(un)?block (?:this|the current)(?: song| track)?(?: from| in)? ?(?:my |the )?(?:auto |live )?(?:mixes|recommendations)?$/i)) || (m = t.match(/^()(?:never|don'?t|do not|stop) (?:recommend(?:ing)?|suggest(?:ing)?|show(?:ing)?)(?: me)? (?:this|it)(?: song| track)?(?: again)?$/i))) {
        if (!cur) return sSay('Play or pick a track first.'); const un = !!m[1], was = !!lvState().blocked[String(cur.dbId)];
        if (un === !was) return sSay('\u201c' + cur.title + '\u201d is already ' + (un ? 'allowed' : 'blocked') + '.');
        un ? L.unblock([cur.dbId]) : L.block([cur.dbId]); lcUndo(un ? 'Blocked \u201c' + cur.title + '\u201d again.' : 'Unblocked \u201c' + cur.title + '\u201d.', () => un ? L.block([cur.dbId]) : L.unblock([cur.dbId]));
        return sDone(un ? '\u201c' + cur.title + '\u201d can show up in your auto mixes again.' : '\u201c' + cur.title + '\u201d will not appear in For You, Ones You May Like or Your Pattern. Say \u201cundo\u201d to take it back.');
      }
      if ((m = t.match(/^(un)?block (?:the )?(?:artist|everything by|songs? by|this artist)(?: (.+?))?(?: from (?:my |the )?(?:auto |live )?mixes)?$/i))) {
        const tr = A.tracks(), name = (m[2] || '').trim() || (cur && cur.artist) || ''; if (!name) return sSay('Which artist? Say \u201cblock <artist>\u201d, or play one of their songs first.');
        const r = m[2] ? sResolve(name) : null, an = sNrm(r && r.artist ? tr[r.tracks[0]].artist : name), ids = sReal().filter(i => sNrm(tr[i].artist || '') === an).map(i => tr[i].dbId);
        if (!ids.length) return sSay('I could not find songs by \u201c' + name + '\u201d.');
        const un = !!m[1]; un ? L.unblock(ids) : L.block(ids); lcUndo(un ? 'Blocked ' + name + ' again.' : 'Unblocked ' + name + '.', () => un ? L.block(ids) : L.unblock(ids));
        return sDone((un ? 'Unblocked ' : 'Blocked ') + ids.length + ' song' + (ids.length === 1 ? '' : 's') + ' by ' + name + (un ? '.' : ' from your auto mixes.'));
      }
      if (/^why\b.*\b(?:this|that|it)\b.*(?:mix|for you|recommend|pattern|playlist|picked|here|suggest)/i.test(t)) return sSay(lcWhy());
      return false;
    }
    // chips: chosen by where the chat was opened and what is going on, big features first, small gestures last
    let lcChipKey = '', lcLyr = { id: null, v: false };
    const lcVis = el => { if (!el) return false; const cs = getComputedStyle(el); if (cs.display === 'none' || cs.visibility === 'hidden') return false; const r = el.getBoundingClientRect(); return r.width > 20 && r.height > 20 && r.right > 0 && r.left < innerWidth && r.bottom > 0 && r.top < innerHeight; };
    // Where the person is in the app: the open sidebar tab (library / playlist / settings, read from the pane id), the video player, or the plain now-playing view.
    function lcWhere() {
      const A = window.__ppApi, t = A && A.currentIndex() >= 0 ? A.tracks()[A.currentIndex()] : null;
      const pane = [...document.querySelectorAll('[id^="sidebar-pane-"]')].find(lcVis);
      if (pane) { const id = pane.id.replace('sidebar-pane-', ''); return /lib/i.test(id) ? 'library' : /play|queue|track/i.test(id) ? 'playlist' : /set/i.test(id) ? 'settings' : 'other'; }
      if (document.fullscreenElement || (t && t.kind === 'video')) return 'video';
      return 'player';
    }
    const lcToggle = (boxId, name) => () => {
      const b = document.getElementById(boxId); if (!b) return add('bot', 'I cannot find that setting.'); const was = b.checked, set = v => { b.checked = v; b.dispatchEvent(new Event('change', { bubbles: true })); };
      set(!was); lcUndo(name + ' is ' + (was ? 'on' : 'off') + ' again.', () => set(was)); add('bot', '\u2713 ' + name + ' is ' + (!was ? 'on' : 'off') + '.');
    };
    function lcChips(noDraw) {
      const A = window.__ppApi; if (!A || !A.tracks || cbox.style.display !== 'flex') return;
      if (!cin.value && lcSug.childNodes.length) lcSug.textContent = '';
      const where = lcWhere(), ci = A.currentIndex(), t = ci >= 0 ? A.tracks()[ci] : null, tg = loadTags(), S = tagStats(), tr = A.tracks();
      const hasMix = k => A.playlists().some(p => p.liveKey === k && tr.some(x => (x.playlistIds || []).includes(p.id)));
      if (t && lcLyr.id !== t.dbId) { let has = false; try { const o = JSON.parse(localStorage.getItem('playerLyricsV1')) || {}; has = !!o[t.dbId]; } catch (e) {} lcLyr = { id: t.dbId, v: has }; }
      const c = [], P = (label, act, w, ctx) => c.push([label, act, w + (ctx && ctx.includes(where) ? 30 : 0)]);
      // big features
      P('\u2795 Make a playlist', guidePl, 80, ['playlist', 'library']);
      if (lvOn()) P(hasMix('foryou') ? '\u25b6 Play For You' : '\u25b6 Play something', lcPlaySomething, 85, ['player', 'video', 'playlist']);
      else P('\u2728 Turn on auto mixes', lcToggle('ppv-lmix', 'Auto mixes'), 88, ['settings', 'playlist', 'library']);
      if (S.left >= 5) P('\ud83c\udff7 Tag ' + S.left + ' untagged tracks', () => askYN('Tag ' + S.left + ' untagged track' + (S.left === 1 ? '' : 's') + '? It can take a while.', () => tagAll()), 80, ['library']);
      if (S.tagged.length >= 8) P('\ud83d\udcc0 Make smart playlists', 'make smart playlists', 70, ['library', 'playlist']);
      if (lvOn() && (hasMix('foryou') || hasMix('pattern'))) P('\ud83d\udd04 Refresh my mixes', 'refresh my mixes', 60, ['playlist', 'settings']);
      if (where === 'settings') { P((lvLs('ppvBg') === '1' ? 'Stop' : 'Start') + ' background tagging', lcToggle('ppv-bg', 'Background tagging'), 75, ['settings']); P('\ud83c\udf81 Surprise me', 'surprise me', 55, ['settings']); }
      if (where === 'playlist') { if (hasMix('maylike')) P('\ud83d\udc9c Ones You May Like', 'play ones you may like', 72, ['playlist']); if (hasMix('pattern')) P('\ud83d\udd17 Your Pattern', 'play your pattern', 70, ['playlist']); }
      if (where === 'playlist' || where === 'library') P('My playlists', 'my playlists', 40);
      if (t && !t.stem) P(t.kind === 'video' ? '\ud83d\udcac Get subtitles' : (lcLyr.v ? '\ud83c\udfa4 Redo lyrics' : '\ud83c\udfa4 Get lyrics'), 'get the lyrics', lcLyr.v ? 20 : 65, t.kind === 'video' ? ['video'] : ['player']);
      // smaller things
      if (t) { P('\ud83d\udd17 More like this', 'more like this', 50, ['player']); const bl = lvState().blocked[String(t.dbId)]; P(bl ? 'Unblock this song' : '\ud83d\udeab Block this song', bl ? 'unblock this song' : 'block this song', 30); if (!t.stem && !tg[t.dbId]) P(t.kind === 'video' ? 'Tag this video' : 'Tag this song', 'tag this song', t.kind === 'video' ? 25 : 25, ['video']); }
      if (t && !t.stem) P('Split this song', 'split this song', 10);
      P('Help', 'help', 5);
      c.sort((a, b) => b[2] - a[2]); lcAll = c; if (noDraw === true) return; const top = c.slice(0, 6), key = where + '|' + top.map(x => x[0]).join('|'); if (key === lcChipKey) return; lcChipKey = key; lcChipBar.textContent = '';
      top.forEach(([label, act]) => { const b = document.createElement('button'); b.type = 'button'; b.textContent = label; b.onclick = () => { typeof act === 'function' ? act() : send(act); }; lcChipBar.appendChild(b); });
    }
    // two pinned menus under the chips: every recommended command the chips know about, and Bloopy's accessories
    const LC_ACC = [['Wizard', 'wizard', 'wizard'], ['Party hat', 'party hat', 'party'], ['Crown', 'crown', 'crown'], ['Glasses', 'glasses', 'glasses'], ['Headphones', 'headphones', 'headphones'], ['Phone', 'phone', 'phone'], ['Pencil', 'pencil', 'pencil'], ['Note', 'note', 'note'], ['Timer', 'timer', 'timer'], ['Scissors', 'scissors', 'scissors']];
    let lcMenu = '', lcAll = [];
    const lcWorn = () => ((typeof pb !== 'undefined' && pb && pb.dataset.props) || '').split(',').filter(Boolean);
    function lcDrawMenu() {
      lcMenuBtns.textContent = ''; lcMenuBar.textContent = '';
      [['rec', 'Recommended'], ['acc', 'Accessories'], ['skin', 'Skins']].forEach(([k, label]) => { const b = document.createElement('button'); b.type = 'button'; b.textContent = label; if (lcMenu === k) b.className = 'on'; b.onclick = () => { lcMenu = lcMenu === k ? '' : k; lcDrawMenu(); }; lcMenuBtns.appendChild(b); });
      const mk = (label, fn, on, ic) => { const b = document.createElement('button'); b.type = 'button'; if (ic) b.insertAdjacentHTML('beforeend', ic.charAt(0) === '<' ? ic : blIcon(ic)); b.append(label); if (on) b.className = 'on'; b.onclick = fn; lcMenuBar.appendChild(b); };
      if (lcMenu === 'rec') { lcChips(true); lcAll.forEach(([label, act]) => mk(label, () => { typeof act === 'function' ? act() : send(act); })); }
      if (lcMenu === 'acc') {
        const worn = lcWorn();
        LC_ACC.forEach(([label, name, ic]) => { const need = [].concat(blItem(name) || []), on = need.length && need.every(p => worn.includes(p)); mk(label, () => { blDress(on ? 'take off ' + name : name); lcDrawMenu(); }, on, ic); });
        mk('Take all off', () => { blDress('take off everything'); lcDrawMenu(); });
      }
      if (lcMenu === 'skin') {
        const cur = lsGet('ppvSkin') || '';
        mk('Default', () => { blSkinCmd('skin default'); lcDrawMenu(); }, !cur, blSkinIcon(''));
        BL_SKIN_KEYS.forEach(k => mk(BL_SKINS[k].name, () => { blSkinCmd('skin ' + k); lcDrawMenu(); }, cur === k, blSkinIcon(k)));
      }
    }
    lcDrawMenu();
    setInterval(lcChips, 1500); cfab.addEventListener('click', () => setTimeout(lcChips, 50));
    // type-ahead: songs, artists and playlist names for play / add / find / like / block
    function lcSuggest() {
      const A = window.__ppApi; lcSug.textContent = ''; if (!A || !A.tracks) return; const v = cin.value; let m; const items = [], tr = A.tracks();
      const put = (label, fill) => { if (items.length < 6 && !items.some(x => x[1] === fill)) items.push([label, fill]); };
      if ((m = v.match(/^(add (?:this|it)(?: song| track)? to (?:my |the )?)(.*)$/i))) { const q = sNrm(m[2]); A.playlists().filter(p => !p.stemOf && sNrm(p.name).includes(q) && sNrm(p.name) !== q).slice(0, 6).forEach(p => put(p.name, m[1] + p.name)); }
      else if ((m = v.match(/^((?:play(?: me)?|find|queue|block|more like|songs? like|similar to|songs by|songs from)\s+)(.{1,40})$/i)) && !/^(?:this|it|that|my|the|something|some|a|an)\b/i.test(m[2])) {
        const q = sNrm(m[2]), verb = m[1].trim().toLowerCase(), real = sReal(); if (q) {
          real.map(i => ({ i, nt: sNrm(tr[i].title), na: sNrm(tr[i].artist || '') })).filter(o => (o.nt.includes(q) || o.na.includes(q)) && o.nt !== q && o.na !== q)
            .sort((x, y) => ((y.nt.startsWith(q) || y.na.startsWith(q)) - (x.nt.startsWith(q) || x.na.startsWith(q))) || x.nt.length - y.nt.length).slice(0, 4).forEach(o => put(tr[o.i].title + (tr[o.i].artist ? ' \u2014 ' + tr[o.i].artist : ''), (/^(?:songs? like|similar to)$/.test(verb) ? 'songs like ' : m[1]) + tr[o.i].title));
          const seen = new Set(); real.forEach(i => { const a = tr[i].artist || '', na = sNrm(a); if (a && na.includes(q) && na !== q && !seen.has(na)) { seen.add(na); if (seen.size <= 2) put('\ud83c\udfa4 ' + a, 'songs by ' + a); } });
          if (/^play/.test(verb)) A.playlists().filter(p => !p.stemOf && sNrm(p.name).includes(q)).slice(0, 2).forEach(p => put('\ud83d\udcc0 ' + p.name, 'play my ' + p.name.replace(/^[^\p{L}\p{N}]+/u, '') + ' playlist'));
        }
      }
      items.forEach(([label, fill]) => { const b = document.createElement('button'); b.type = 'button'; b.textContent = label; b.onclick = () => { cin.value = fill; lcSug.textContent = ''; cin.focus(); }; lcSug.appendChild(b); });
    }
    cin.addEventListener('input', lcSuggest);
    // CHAT HELPERS END

