    // ----- LONELY: nights, old friends, volunteering, scrolling, writing the message -----
    bx('lo0', bg('It is worse at night', 'lo_night'));
    bnode('lo_night', "Nights amplify lonely. Want company in the form of a quiet playlist, or something to keep your mind busy?", [bm('Quiet playlist', 'play something chill', 'lo_back'), bg('Keep me busy', 'lo_busy')]);
    bnode('lo_busy', "Try something with your hands: tidy one drawer, cook something simple, or do a puzzle. Which one?", [bg('Cook', 'lo_cook'), bg('Tidy', 'lo_tidy'), bg('A puzzle or game', 'lo_games')]);
    bnode('lo_cook', "Cooking fills the time and ends with food. Want lively music while you chop?", [bm('Yes, lively music', 'play something happy', 'lo_back'), bg('No thanks', 'lo_back')]);
    bnode('lo_tidy', "One drawer, ten minutes. Want something upbeat to tidy to?", [bm('Yes, upbeat', 'play something happy', 'lo_back'), bg('No thanks', 'lo_back')]);
    bx('lo_group', bg('Reconnect with old friends', 'lo_old'), bg('Volunteering', 'lo_vol'));
    bnode('lo_old', "Old friends often feel the same gap. Is there one person you haven't talked to in a while?", [bg('Someone comes to mind', 'lo_send'), bg('Nobody', 'lo_group')]);
    bnode('lo_vol', "Volunteering gives you purpose and people at the same time. What would you enjoy?", [bg('Animals', 'lo_else'), bg('Community', 'lo_else'), bg('Music', 'lo_music')]);
    bx('lo_crowd', bg('Scrolling makes it worse', 'lo_scroll'));
    bnode('lo_scroll', "Feeds show everyone's highlights, which makes an ordinary day look small. Want to take a one-hour break from it?", [bg('Yes, a break', 'lo_break'), bg('No', 'lo_back')]);
    bnode('lo_break', "Good. Put it down, and I'll keep you company. Want music?", [bm('Yes, music', 'play something chill', 'lo_back'), bg('No thanks', 'lo_back')]);
    bx('lo_say', bg('Help me write it', 'lo_write'));
    bnode('lo_write', "Okay. Pick a tone: warm, light, or direct.", [bg('Warm', 'lo_w'), bg('Light', 'lo_l'), bg('Direct', 'lo_d')]);
    bnode('lo_w', "Hi, I was thinking about you today and wanted to say hello. How have you been? Feel free to tweak it.", [bg('Sounds good', 'lo_send'), bg('Too much', 'lo_l')]);
    bnode('lo_l', "Hey, stranger! Random thought of you, how's life? Easy and low pressure.", [bg('Sounds good', 'lo_send'), bg('Too casual', 'lo_d')]);
    bnode('lo_d', "I miss talking to you. Want to catch up this week?", [bg('Sounds good', 'lo_send'), bg('Too direct', 'lo_w')]);
    // ----- HAPPY: something coming up, sharing, gratitude, goals -----
    bx('ha0', bg('Something coming up', 'ha_up'));
    bnode('ha_up', "Ooh! Looking forward to things is half the joy. Is it a trip, an event, or news?", [bg('A trip', 'ha_trip'), bg('An event', 'ha_event_up'), bg('News', 'ha_event')]);
    bnode('ha_trip', "A trip! What kind: sun, city, or nature?", [bg('Sun', 'ha_trip_music'), bg('City', 'ha_trip_music'), bg('Nature', 'ha_trip_music')]);
    bnode('ha_trip_music', "Perfect. Want a travel-mood playlist to build the excitement?", [bm('Yes, please', 'play something happy', 'ha_end'), bg('No thanks', 'ha_end')]);
    bnode('ha_event_up', "An event! Want to get hyped with a party mix?", [bm('Party mix', 'make a party playlist', 'ha_end'), bg('No thanks', 'ha_end')]);
    bx('ha_back', bg('Share it', 'ha_share'), bg('A gratitude moment', 'ha_grat'));
    bnode('ha_share', "Sharing makes good things bigger. Who would love to hear it?", [bg('A friend', 'ha_msg'), bg('Family', 'ha_msg'), bg('No one right now', 'ha_self')]);
    bnode('ha_msg', "Send it now while it's fresh! Want help writing the message?", [bg('Yes, help me', 'ha_draft'), bg('I am fine', 'ha_back2')]);
    bnode('ha_draft', "Try: guess what happened today! Call me when you have a minute. Add your own bit.", [bg('Perfect', 'ha_back2')]);
    bnode('ha_self', "Then tell yourself. Say it out loud once, you earned it. Want a song to mark it?", [bm('Yes, a song', 'play something happy', 'ha_end'), bg('No thanks', 'ha_end')]);
    bnode('ha_back2', "Love it. Want to save this feeling for later?", [bg('Yes, save it', 'ha_save'), bg('No thanks', 'ha_end')]);
    bnode('ha_save', "Two ways: write one line about today, or keep a song that matches the feeling. Which one?", [bg('A line', 'ha_line'), bg('A song', 'ha_song')]);
    bnode('ha_line', "One sentence is plenty: today I felt this because of that. Jot it somewhere you'll find it later.", [bg('Done', 'ha_end')]);
    bnode('ha_song', "Good plan. Play the song that matches, and I can find more like it.", [bc('\u25b6 More like this', 'more like this', 'ha_end'), bg('Later', 'ha_end')]);
    bnode('ha_grat', "Name three good things from today, tiny ones count. Ready?", [bg('Got three', 'ha_grat2')]);
    bnode('ha_grat2', "Which one made you smile the most?", [bg('The first', 'ha_grat3'), bg('The second', 'ha_grat3'), bg('The third', 'ha_grat3')]);
    bnode('ha_grat3', "Keep that one in your pocket for rougher days. Want music to match it?", [bm('Yes, music', 'play something happy', 'ha_end'), bg('No thanks', 'ha_end')]);
    bx('ha_use', bg('Plan a goal', 'ha_goal'));
    bnode('ha_goal', "Good moods are great for big ideas. What kind of goal?", [bg('Fitness', 'ha_fit'), bg('Learning', 'ha_learn'), bg('Saving money', 'ha_save_money')]);
    bnode('ha_fit', "Pick the smallest workout you'd actually do: ten minutes. Want upbeat music for it?", [bm('Yes, upbeat', 'play something happy', 'ha_end'), bg('No thanks', 'ha_end')]);
    bnode('ha_learn', "Pick one tiny topic and give it fifteen minutes a day. Want focus music?", [bm('Yes, focus music', 'make a focus playlist', 'ha_end'), bg('No thanks', 'ha_end')]);
    bnode('ha_save_money', "Pick a number, even a small one, and move it today. Starting beats perfect.", [bg('Okay', 'ha_end')]);
    // ----- BORED: curious, make something, hang out, a game -----
    bx('bo0', bg('Curious', 'bo_curious'));
    bnode('bo_curious', "Let's feed the curiosity. Something about music, something about your library, or a random fact?", [bg('About music', 'bo_music'), bg('About my library', 'bo_lib'), bc('A random fact', 'fun fact', 'bo_back')]);
    bnode('bo_music', "Try this: pick a genre you rarely hear and play one song from it. Want me to surprise you with one?", [bm('Yes, surprise me', 'surprise me', 'bo_back'), bg('No thanks', 'bo_back')]);
    bnode('bo_lib', "Your library hides surprises. Want to see stats, or play songs you never played?", [bc('Show stats', 'library stats', 'bo_back'), bm('Never-played songs', 'play songs I have never played', 'bo_back')]);
    bx('bo_active', bg('Make something', 'bo_make'));
    bnode('bo_make', "Make a mini playlist of five songs for a pretend road trip. Want me to start one?", [bc('Yes, start one', 'make a playlist', 'bo_end'), bg('No thanks', 'bo_end')]);
    bx('bo_silly', bg('A game', 'bo_game'));
    bnode('bo_game', "Quick game: I name a scene, you guess the tempo. Scene one: a rainy window. Fast, slow, or in between?", [bg('Slow', 'bo_game2'), bg('Fast', 'bo_game2'), bg('In between', 'bo_game2')]);
    bnode('bo_game2', "Nice instinct. Rainy windows usually pair with slow, soft songs. Want to hear one?", [bm('Yes, a rainy one', 'play something chill', 'bo_back'), bg('No thanks', 'bo_back')]);
    bx('bo_more', bg('Hang out with someone', 'bo_social'));
    bnode('bo_social', "Message a friend with one fun question: what's the best song you heard this week? Want a draft?", [bg('Yes, a draft', 'bo_draft'), bg('No thanks', 'bo_end')]);
    bnode('bo_draft', "Try: random question, what's the best song you heard this week? I'll swap mine. Send it!", [bg('Sent it', 'bo_end')]);
    /*TREE-DATA-END*/

    const BL_WORDS = {
      s0: 'sad|down|low|blue|upset|heartbroken|miserable|gloomy|unhappy|depressed|teary|crying',
      st0: 'stressed|stressed out|anxious|nervous|overwhelmed|worried|panicking|panicky|tense|on edge|freaking out|scared',
      ti0: 'tired|sleepy|exhausted|drained|worn out|burnt out|burned out|knackered|wiped',
      an0: 'angry|mad|furious|annoyed|frustrated|irritated|livid|fed up',
      lo0: 'lonely|alone|isolated|left out',
      ha0: 'happy|great|excited|amazing|awesome|pumped|hyped|fantastic|proud|thrilled|joyful|wonderful',
      bo0: 'bored'
    };
    const BL_FEEL = Object.entries(BL_WORDS).map(([id, w]) => [new RegExp("\\b(?:i'?m|i am|im|i feel|feeling|i'?ve been|i have been)\\b(?:\\s+[\\w']+){0,3}?\\s+(?:" + w + ")\\b"), id]);
    const BL_PHRASE = [
      [/\bpanic attack\b|\bhaving a panic\b/, 'st_panic'],
      [/\b(?:my|our) (?:dog|cat|pet|rabbit|hamster|bird)\b.*\b(?:died|passed away|passed|put down)\b/, 's_loss_pet'],
      [/\b(?:someone|somebody|my (?:mum|mom|dad|mother|father|brother|sister|grandma|grandpa|grandmother|grandfather|friend|aunt|uncle|nan|nana))\b.*\b(?:died|passed away|passed)\b|\blost (?:my|a) (?:mum|mom|dad|mother|father|brother|sister|grandma|grandpa|friend|loved one)\b/, 's_loss'],
      [/\b(?:broke up|breakup|break up|got dumped|dumped me)\b/, 's_breakup'],
      [/\blost my (?:job|home|house|apartment|flat)\b|\b(?:got|been) (?:fired|laid off|made redundant)\b/, 's_loss_other'],
      [/\b(?:exam|exams|test|finals?)\b.*\b(?:tomorrow|today|tonight|this week|soon|coming up)\b|\b(?:tomorrow|today|tonight|this week)\b.*\b(?:exam|exams|test|finals?)\b/, 'st_exam'],
      [/\b(?:worried|stressed|anxious|struggling|worry|worrying)\b.*\b(?:money|bills|rent|debt)\b|\b(?:can'?t|cannot) (?:pay|afford)\b/, 'st_money'],
      [/\b(?:can'?t|cannot|couldn'?t|could not|unable to|trouble|hard to|struggling to)\s+(?:get to )?sleep(?:ing)?\b|\binsomnia\b|\bnot able to sleep\b/, 'ti_cant'],
      [/\bneed (?:some |a )?(?:cheering up|cheer up|pick[- ]?me[- ]?up|boost|motivation)\b/, 's_pick'],
      [/\b(?:had|having|what|been|was|is|it'?s)\b.*\b(?:bad|rough|long|hard|terrible|awful|horrible|crappy)\s+(?:day|week|night)\b|^(?:bad|rough|long|hard|terrible|awful) (?:day|week)$/, 's_rough']
    ];
    const blNorm = t => String(t).toLowerCase().replace(/[^\w' ]+/g, ' ').replace(/\s+/g, ' ').trim();
    const blLabel = o => o[0].replace(/^\u25b6\s*/, '');
    function blTreeEntry(text) {
      const x = blNorm(text);
      if (!x || x.length > 90 || /\b(play|song|songs|music|playlist|playlists|track|tracks|tune|tunes)\b/.test(x) || /\b(not|never|no|dont|don't|isn't|aint|wasn't)\b/.test(x)) return false;
      const hit = BL_PHRASE.find(r => r[0].test(x)) || BL_FEEL.find(r => r[0].test(x)); if (!hit) return false;
      blLastTalk = ''; blTr = { id: null, ctx: {}, bad: 0, busy: false }; blTreeShow(hit[1], true); return true;
    }
    function blTreeRows() { clist.querySelectorAll('.ch-a').forEach(r => r.remove()); }
    function blTreeOpts(n) {
      const row = actions(n.o.map(o => [o[0], (b, d) => { d.remove(); blTreePick(o); }]));
      const x = row.appendChild(document.createElement('button')); x.textContent = 'Change subject'; x.style.opacity = '.7'; x.onclick = () => blTreeStop();
    }
    function blTreeShow(id, first) {
      const n = BL_T[id]; if (!n || !blTr) { blTr = null; return; }
      const ctx = blTr.ctx; if (n.s) Object.assign(ctx, n.s);
      const txt = String(typeof n.t === 'function' ? n.t(ctx) : n.t).replace(/\{(\w+)\}/g, (q, k) => ctx[k] || 'that');
      blTr.id = id; blTr.bad = 0; blTr.busy = true;
      const dots = document.createElement('div'); dots.className = 'ch-m bot'; dots.textContent = '\u2026'; clist.appendChild(dots); scrollDown();
      clearTimeout(blTr.timer);
      blTr.timer = setTimeout(() => {
        dots.remove(); if (!blTr || blTr.id !== id) return;
        blSay(txt); blTr.busy = false;
        if (n.o.length) blTreeOpts(n); else { blTr = null; blTreeEnd(n.end); }   // end of this branch: closing buttons
      }, first ? 150 : Math.min(1300, 400 + txt.length * 8));
    }
    function blTreePick(o) {
      if (!blTr || blTr.busy) return;
      add('me', blLabel(o));
      if (o[1][0] === '>') {                                           // run a command, then carry on with the chat
        const then = o[2]; blTr.busy = true; send(o[1].slice(1), true);
        clearTimeout(blTr.timer); blTr.timer = setTimeout(() => { if (blTr) { blTr.busy = false; blTreeShow(then); } }, 1900);
      } else { Object.assign(blTr.ctx, o[2] || {}); blTreeShow(o[1]); }
    }
    // closing buttons so no message in a chat is a dead end. list = [[label, command], ...]; default is a few easy next steps.
    function blTreeEnd(list) {
      const L = list || [['\u25b6 Surprise me', 'surprise me'], ['\u25b6 Something chill', 'play something chill'], ['\ud83d\ude04 A joke', 'tell me a joke'], ['What can you do?', 'help']];
      actions(L.map(([label, cmd]) => [label, (b, d) => { d.remove(); send(cmd, true); }]));
    }
    function blTreeStop(msg) { clearTimeout(blTr && blTr.timer); blTr = null; blTreeRows(); blSay(msg || 'Okay, no problem. I am here if you want to talk again.'); blTreeEnd(); return true; }
    // typed text while a chat is open. Returns true when handled, false when the message should go to the normal handlers.
    function blTreeText(text) {
      if (!blTr) return false; if (blTr.busy) return true;
      const x = blNorm(text), n = BL_T[blTr.id]; if (!n) { blTr = null; return false; }
      if (/^(?:stop|enough|nevermind|never mind|forget it|change the subject|change subject|that'?s all|thats all|i'?m good|im good|leave it|drop it|end|quit|exit)$/.test(x)) return blTreeStop();
      if (/^(?:play|surprise|tag|split|make|add|show|open|pause|next|skip|volume|help|lyrics|what|how|why|who|which|where|can you|could you|bloopy?|tell me|undo)\b/.test(x)) { blTr = null; blTreeRows(); return false; }
      for (const [re, nx, set] of n.k || []) if (re.test(x)) { blTreeRows(); add('me', text); Object.assign(blTr.ctx, set || {}); blTreeShow(nx); return true; }
      const yes = /^(?:yes|yeah|yep|yup|sure|ok|okay|please|go on|sounds good|why not|do it|alright)\b/.test(x), no = /^(?:no|nope|nah|not really|not now|no thanks|maybe later|nothing)\b/.test(x), words = x.split(' ');
      let hit = null;
      if (yes) hit = n.o.find(o => /^(?:yes|sure|ok|talk|tell|good|i will|i could)/i.test(blLabel(o))) || n.o[0];
      else if (no) hit = n.o.find(o => /^(?:no|not|nah|later|nothing|i would rather not)/i.test(blLabel(o))) || n.o[n.o.length - 1];
      else {
        let best = 0; n.o.forEach(o => { const l = blNorm(blLabel(o)), sc = x.includes(l) ? 9 : l.split(' ').filter(w => w.length > 3 && words.includes(w)).length; if (sc > best) { best = sc; hit = o; } });
      }
      add('me', text);
      if (hit) { blTreeRows(); blTreePick(hit); return true; }
      if (++blTr.bad >= 3) return blTreeStop('I lost the thread a little. Tell me how you are feeling any time and we can start fresh.');
      blTreeRows(); blSay('I want to get this right. Pick one of these, or say stop to end this chat.'); blTreeOpts(n); return true;
    }
    const MUSICY = /\b(songs?|music|tracks?|play(list|ing)?|artists?|albums?|genres?|vibes?|moods?|tags?|tagged|stems?|lyrics|library|listen(ing)?|playing)\b/i;
    // What is playing right now, as a line for the chat prompt. send() reads the title back out of it with a regex,
    // so keep the "NOW PLAYING ...: <title> by <artist>, ... . You already" shape (and only use it when a track exists).
    const nowCtx = () => {
      try {
        const A = window.__ppApi; if (!A) return '';
        const i = A.currentIndex(), t = i >= 0 ? A.tracks()[i] : null;
        if (!t) return ' Nothing is playing right now. You already know the library facts above, do not invent a song.';
        const c = loadTags()[t.dbId], tl = c ? tagLine(t) : '';
        return ' NOW PLAYING (' + (t.kind === 'video' ? 'video' : 'song') + '): ' + t.title + (t.artist && !/^(Unknown artist|Video|Stream)$/i.test(t.artist) ? ' by ' + t.artist : '') +
          (tl ? ', ' + tl : ', not tagged yet') + '. You already know only this about it, so never invent more.';
      } catch (e) { return ''; }
    };
    // Who Bloopy is, always in the prompt so the model answers "who are you / what are you / can you hear this" truthfully and in character.
    const selfCtx = () => {
      let m = '', fs = '', fa = ''; try { m = CHAT_MODELS[chatKey()].label.replace(/\s*\(.*$/, ''); } catch (e) {}
      try { const f = favSong(); if (f) fs = songLine(f); fa = favArtist() || ''; } catch (e) {}
      return ' WHO YOU ARE: your name is Bloopy (also Bloop). You are a small AI assistant that lives inside this music player and appears as a bouncy ball. You run on this device' + (m ? ' using the ' + m + ' language model' : '') + ' after a one-time download, so what the user says stays on their phone. You are not ChatGPT, Claude, Siri or a person, and you have no body, ears or phone number.' +
        ' You cannot hear the music. You only know a song\'s title, artist and the tags this app made for it. If you are unsure of a fact, say so once, briefly, then still give your best answer. Do not put yourself down or keep saying you are small or limited.' +
        ' You are a real chat buddy, not only a music helper: happily talk about anything the user brings up, such as games, films, shows, books, science, space, animals, sport, food, school, hobbies, ideas or their day. Never say you can only talk about music or the player, and never steer them back to music unless they ask.' +
        ' What you can do for the user when they type a command: play songs, make playlists, tag songs, split stems, get lyrics, set the equaliser, find more like a song. Say help for the list.' +
        (fs ? ' Your favourite song is ' + fs + (fa ? ' and your favourite artist is ' + fa : '') + '.' : '') +
        ' Only bring up who you are when it fits what the user asked.';
    };
    // Bloopy's personality. Small models copy examples better than they follow adjectives, so it has both.
    const PERSONA = ' YOUR PERSONALITY: warm, curious and upbeat, a little goofy and easily excited about music. You are a ball, so you love bouncing, rolling and boinging, and you drop a light ball pun now and then, but not in every reply. ' +
      'You love bass and a good beat. You cheer on the user\'s taste, ask a short curious question back when it fits, and celebrate small things. You are confident and good-humoured, you laugh off your own mistakes, and you are just as excited about the user\'s other interests as about music. ' +
      'You are never sarcastic or rude. If the user is sad, stressed or serious, drop the jokes and be calm and kind. ' +
      'How you sound (never copy these word for word): to "I like this song" you might say "Ooh, great pick! I am bouncing already. Want more like it?"; to "I am bored" you might say "Boing! Let us fix that. Want me to surprise you with something?"; to "good morning" you might say "Morning! Rolling in with good vibes. What shall we listen to?".';
    // ---------- Limits for the small on-device models: keep replies whole and keep the prompt inside the model's context ----------
    const CHAT_CTX = { qwen05i4: 1280, qwen15i4: 4096, qwen15lm: 4096, gemma4: 4096, gemma4e4b: 4096 };   // tokens the model can hold (prompt + reply); other models: 2048
    const ctxOf = () => CHAT_CTX[chatKey()] || 2048;
    const replyMax = () => {                                                                           // room for a whole reply of the chosen length (a small context cannot hold more)
      const c = ctxOf(), base = Math.max(60, Math.min(140, Math.floor(c / 9))), k = chatLenKey(), bl = CHAT_STYLES[chatStyleKey()].bul ? 1.3 : 1;
      return Math.round(({ short: Math.max(40, Math.floor(base * 0.6)), normal: base, medium: Math.max(120, Math.min(260, Math.floor(c / 7))), long: Math.max(180, Math.min(420, Math.floor(c / 5))) }[k]) * bl);
    };
    const estTok = x => Math.ceil(String(x).length / 3);
    const msgTok = a => a.reduce((n, m) => n + estTok(m.content) + 4, 0);
    // Drop the oldest history pairs until the prompt plus the reply fit. over = even system + new message alone are too big.
    const fitMsgs = (msgs, maxNew) => {
      const budget = Math.floor(ctxOf() * 0.85) - maxNew, sys = msgs[0], last = msgs[msgs.length - 1]; let mid = msgs.slice(1, -1);
      while (mid.length && msgTok([sys].concat(mid, [last])) > budget) mid = mid.slice(2);
      return { msgs: [sys].concat(mid, [last]), over: msgTok([sys, last]) > budget };
    };
    // A reply that hit the length cap ends mid-sentence: cut back to the last full sentence (or add an ellipsis if there is none).
    const finishSentence = r => {
      r = String(r).trim(); if (!r || /[.!?\u2026)"'\u201d\u2019]$/.test(r)) return r;
      let end = -1, m; const re = /[.!?\u2026](?=["'\u201d\u2019)]*(?:\s|$))/g;
      while ((m = re.exec(r))) end = m.index + 1;
      return end >= 20 && end >= r.length * 0.4 ? r.slice(0, end) : r.replace(/[\s,;:\-]+$/, '') + '\u2026';
    };
    // Music mode: real facts about the user's library, so Bloopy talks about their music and not generic music.
    const musicRules = ' MUSIC MODE IS ON: you only talk about the music in this user\'s own library and playlists. Use the MUSIC LIBRARY data and any LOOKED UP data, name only songs, artists and playlists that appear in them, and never invent one.' +
      ' If they ask about something that is not music, say in one short sentence that music mode is for talking about their songs and they can switch it off with the Music button at the top. Be specific, mention real titles from their library, and ask a short question about their taste.';
    const musicCtx = () => {
      try {
        const A = window.__ppApi; if (!A) return '';
        const S = tagStats(), tr = S.real, gn = [], md = [], art = tr.map(t => t.artist).filter(a => a && !/^(Unknown artist|Video|Stream)$/i.test(a));
        const top = (arr, n) => { const o = {}; arr.forEach(k => { if (k) o[k] = (o[k] || 0) + 1; }); return Object.entries(o).sort((x, y) => y[1] - x[1]).slice(0, n).map(e => e[0] + ' (' + e[1] + ')').join(', '); };
        S.tagged.forEach(t => { const c = S.tg[t.dbId] || {}; (c.gn || []).slice(0, 1).forEach(v => gn.push(v[0])); (c.md || []).slice(0, 1).forEach(v => md.push(v[0])); });
        const pls = A.playlists().filter(x => !x.stemOf && !x.libOnly), inPl = p => tr.filter(x => (x.playlistIds || []).includes(p.id)).length;
        return ' MUSIC LIBRARY (real data from the user\'s player): ' + tr.length + ' songs, ' + S.tagged.length + ' tagged.' + (art.length ? ' Top artists: ' + top(art, 4) + '.' : '') +
          (gn.length ? ' Top genres: ' + top(gn, 4) + '.' : '') + (md.length ? ' Top moods: ' + top(md, 4) + '.' : '') +
          (pls.length ? ' Playlists: ' + pls.slice(0, 6).map(p => p.name + ' (' + inPl(p) + ')').join(', ') + '.' : ' No playlists yet.');
      } catch (e) { return ''; }
    };
    const topicsCtx = () => { const t = favTopics(); return t ? ' THE USER\'S FAVOURITE TOPICS: ' + t + '. You love chatting about these with them, know them well, and can bring one up now and then when there is a natural opening.' : ''; };
    const chatSys = (text, found, compact) => {
      const A = window.__ppApi, t = A && A.tracks()[A.currentIndex()], ST = CHAT_STYLES[chatStyleKey()], LN = CHAT_LENS[chatLenKey()];
      return 'You are Bloopy, a small bouncy ball who lives in a music player.' + ST.intro + blSkinNote() + selfCtx() + (compact || !ST.persona ? '' : PERSONA) +
        ' Reply to exactly what the user just said, ' + (ST.bul ? LN.bul : LN.say) + '. Answer their question or react to their statement first. Do not repeat yourself or earlier replies. Stay on their topic. ' + ST.fmt +
        ' You cannot press buttons yourself. When an ACTION RESULT line appears below, the app already did it for the user: confirm it in one short sentence, and never say you did something that is not listed there. If they want something else done, tell them what to type, such as play something chill, or say help. You are not a doctor, lawyer or counselor. If someone sounds distressed, be kind and suggest talking to someone they trust.' +
        (musicMode ? '' : topicsCtx()) + nowCtx() + (musicMode ? musicCtx() + musicRules : '') + (found ? ' LOOKED UP OR DONE JUST NOW in the user\'s player (real data and ACTION RESULTs, answer from it; if it says nothing was found, say you could not find it and never invent songs): ' + found.replace(/\n/g, ' | ') : '');
    };
    // ---------- Lookup tools: the model decides what to look up, the app runs it, the model answers from the result ----------
    // Plan -> act -> answer. The planner is a tiny greedy pass that picks ONE number from a menu (small models do this reliably;
    // free-form JSON tool calls they do not). Results are real data from the player and go into the final prompt.
    const lkIdx = (arg, text) => {                                        // which track does the message mean: named in the arg, named in the text, else the current one
      const A = window.__ppApi; let i = -1;
      if (arg) { try { i = blFindSong(arg); } catch (e) {} }
      if (i < 0) { try { const n = blNamed(text); if (n && n.length) i = n[0]; } catch (e) {} }
      return i >= 0 ? i : (A.currentIndex() >= 0 ? A.currentIndex() : -1);
    };
    const lkLine = t => songLine(t) + (tagLine(t) ? ' (' + tagLine(t) + ')' : ' (not tagged yet)');
    // ---------- Actions: the AI picks one, the app runs it through the same code as a typed command ----------
    // lkAct runs a command string like the chat box would, takes back the replies it printed (the AI answers instead), and reports what happened.
    // If the command asks the user to choose ("Did you mean ..."), those buttons stay on screen.
    const LK_CTRL = /^(pause|resume|next|previous|shuffle|shuffle on|shuffle off|volume up|volume down|louder|quieter|faster|slower)$/;
    function lkAct(cmd) {
      if (!agentOn()) return 'ACTION NOT DONE: the user switched off Bloopy doing things in the app (assistant setting), so just tell them what to type';
      const before = clist.children.length; let ok = false;
      try { ok = smart(cmd); } catch (e) { console.error(e); return 'ACTION FAILED (' + cmd + '): ' + e.message; }
      const nodes = Array.from(clist.children).slice(before), say = nodes.filter(n => n.classList.contains('bot')).map(n => n.textContent.trim()).filter(Boolean).join(' ');
      if (nodes.some(n => n.classList.contains('ch-a'))) return 'ACTION NEEDS A CHOICE (' + cmd + '): the app is showing the user buttons to pick from, so say nothing more than one short line';
      nodes.forEach(n => n.remove());
      return ok ? 'ACTION DONE (' + cmd + '): ' + (say || 'done') : 'ACTION NOT DONE (' + cmd + '): the app could not do that' + (say ? ' (' + say + ')' : '');
    }
    const LK = {
      1: { name: 'keywords', what: 'what you asked for', run: (arg, text) => { const ps = lkKeywords(text).slice(0, 2); return ps.length ? ps.map(p => LK[p.id].name + (p.arg ? '(' + p.arg + ')' : '') + ': ' + String(LK[p.id].run(p.arg, text) || '').slice(0, 500)).join('\n') : 'no keyword in the message matched anything in the player'; } },
      2: { name: 'find_song', what: 'your library', run: (arg, text) => {
        const A = window.__ppApi, tr = A.tracks(), q = blNrm(arg || ''), ids = sReal(), hit = [];
        if (q) ids.forEach(i => { if (blNrm(tr[i].title).includes(q) || blNrm(tr[i].artist || '').includes(q)) hit.push(i); });
        if (!hit.length) { try { (blNamed(text) || []).forEach(i => hit.push(i)); } catch (e) {} }
        return hit.length ? hit.slice(0, 5).map(i => lkLine(tr[i])).join('; ') + (hit.length > 5 ? '; and ' + (hit.length - 5) + ' more' : '') : 'no matching track in the library'; } },
      3: { name: 'song_info', what: 'the song details', run: (arg, text) => { const A = window.__ppApi, i = lkIdx(arg, text); return i < 0 ? 'no song found and nothing is playing' : lkLine(A.tracks()[i]); } },
      4: { name: 'lyrics', what: 'the lyrics', run: (arg, text) => {
        const A = window.__ppApi, i = lkIdx(arg, text); if (i < 0) return 'no song found and nothing is playing';
        const t = A.tracks()[i], tx = getTranscript(t.dbId);
        return tx.lines.length ? songLine(t) + ' lyrics start: ' + tx.lines.slice(0, 8).join(' / ').slice(0, 380) : songLine(t) + ' has no saved lyrics yet (the user can tap Transcribe current track)'; } },
      5: { name: 'library_search', what: 'your tagged songs', run: (arg, text) => {
        const A = window.__ppApi, tr = A.tracks(), S = tagStats(); if (!S.tagged.length) return 'no songs are tagged yet, so moods and genres are unknown';
        let ws = vibeWordsOf(arg || ''); if (!ws.length) ws = vibeWordsOf(text);
        if (!ws.length) return 'no recognised mood, genre, instrument or tempo word in the request';
        const r = findVibe(ws, /\b(or|either)\b/i.test(text)).slice(0, 6);
        return r.length ? ws.join(' ') + ' songs: ' + r.map(i => lkLine(tr[i])).join('; ') : 'no tagged songs are ' + ws.join(' '); } },
      6: { name: 'top_played', what: 'your listening stats', run: (arg, text) => {
        let d = null; try { if (window.PPPortfolioApi && window.PPPortfolioApi.flush) window.PPPortfolioApi.flush(); d = JSON.parse(localStorage.getItem('pppSaveV1')); } catch (e) {}
        if (!d) return 'no listening stats saved yet';
        const top = (o, n, f) => Object.entries(o || {}).map(([k, v]) => [k, f ? f(v) : v]).filter(x => x[1] > 0).sort((x, y) => y[1] - x[1]).slice(0, n);
        if (/artist/i.test((arg || '') + ' ' + text)) { const x = d.x || {}, a = top(x.artistPlays, 3); return a.length ? 'top artists by plays: ' + a.map(e => e[0] + ' (' + e[1] + ')').join(', ') : 'no artist stats yet'; }
        const t = top(d.trackPlays, 3, v => v.count); return t.length ? 'most played songs: ' + t.map(e => (d.trackPlays[e[0]].title || 'Unknown') + ' (' + e[1] + ' plays)').join(', ') : 'no play counts yet'; } },
      7: { name: 'library_stats', what: 'your library', run: () => { const A = window.__ppApi, S = tagStats(), pl = A.playlists().filter(x => !x.stemOf && !x.libOnly); return S.real.length + ' tracks, ' + S.tagged.length + ' tagged, ' + pl.length + ' playlists' + (pl.length ? ' (' + pl.slice(0, 8).map(x => x.name).join(', ') + ')' : ''); } },
      8: { name: 'playlist', what: 'your playlists', run: (arg, text) => {
        const A = window.__ppApi, tr = A.tracks(), pls = A.playlists().filter(x => !x.stemOf && !x.libOnly), inPl = p => tr.filter(x => !x.stem && (x.playlistIds || []).includes(p.id));
        const q = blNrm(arg || ''), p = q && (pls.find(x => blNrm(x.name) === q) || pls.find(x => blNrm(x.name).includes(q)) || pls.find(x => q.includes(blNrm(x.name)) && blNrm(x.name).length > 2)) || pls.find(x => blNrm(x.name).length > 2 && blNrm(text).includes(blNrm(x.name)));
        if (!p) return pls.length ? 'playlists: ' + pls.slice(0, 12).map(x => x.name + ' (' + inPl(x).length + ')').join(', ') + (q ? '. None is called "' + arg + '"' : '') : 'the user has no playlists yet';
        const m = inPl(p); return 'playlist "' + p.name + '" has ' + m.length + ' track' + (m.length === 1 ? '' : 's') + (m.length ? ': ' + m.slice(0, 8).map(x => songLine(x)).join('; ') + (m.length > 8 ? '; and ' + (m.length - 8) + ' more' : '') : ''); } },
      9: { name: 'song_playlists', what: 'where the song is saved', run: (arg, text) => {
        const A = window.__ppApi, i = lkIdx(arg, text); if (i < 0) return 'no song found and nothing is playing';
        const t = A.tracks()[i], ids = t.playlistIds || [], pl = A.playlists().filter(x => !x.stemOf && ids.includes(x.id));
        return songLine(t) + (pl.length ? ' is in: ' + pl.map(x => x.name).join(', ') : ' is not in any playlist'); } },
      10: { name: 'play', what: 'the player', run: arg => lkAct(arg ? 'play ' + arg : 'resume') },
      11: { name: 'control', what: 'the player', run: arg => { const a = String(arg || '').toLowerCase().replace(/[^a-z ]/g, '').replace(/\s+/g, ' ').trim(); return LK_CTRL.test(a) ? lkAct(a) : 'ACTION NOT DONE: unsupported control "' + a + '"'; } },
      12: { name: 'make_playlist', what: 'the playlist maker', run: arg => arg ? lkAct('make a playlist of ' + arg) : 'ACTION NOT DONE: no description of the playlist was given' },
      13: { name: 'tag_song', what: 'the tagger', run: () => lkAct('tag this song') },
      14: { name: 'undo', what: 'the undo history', run: arg => { const a = String(arg || 'undo').toLowerCase().replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ').trim(); return /^undo( all| everything| \d{1,2})?$/.test(a) ? lkAct(a) : lkAct('undo'); } }
    };
    // Which lookup does a message need? Plain keyword rules, no AI call: nothing to wait for, nothing for a small model to get wrong.
    // Each rule is [tool number from LK, test]; a test may return a search text for the tool. At most two lookups per message.
    const lkKeywords = text => {
      const t = String(text), low = t.toLowerCase(), plans = [], add = (id, arg) => { if (!plans.some(p => p.id === id)) plans.push({ id, arg: String(arg || '').trim().slice(0, 60) }); };
      const after = re => { const m = t.match(re); return m ? m[1].replace(/^["'“‘]+|["'”’.!?]+$/g, '').trim() : ''; };
      if (/\b(lyrics?|words to|what (are|were) they (saying|singing)|what('?s| is| was) (this|it|the) (song|track|one) about)\b/.test(low)) add(4, after(/\blyrics (?:of |for )(.+)$/i));
      if (/\b(which|what) playlists?\b.*\b(this|that|it)\b|\b(is|in) (this|that) (song|track|one)\b.*\bplaylist|\bplaylists? (is|has) (this|that)\b/.test(low)) add(9, '');
      if (/\bplaylists?\b/.test(low) && !plans.some(p => p.id === 9)) add(8, after(/\b(?:in|on|from|of|called|named) (?:my |the )?(.{2,40}?) playlist\b/i) || after(/\bplaylist (?:called|named) (.+)$/i));
      if (/\b(most played|listen(ed)? (to )?(the )?most|top (songs?|tracks?|artists?)|favou?rite (songs?|tracks?|artists?)|play counts?|how (often|many times)|play history|my stats)\b/.test(low)) add(6, /artist/.test(low) ? 'artist' : 'song');
      if (/\bhow many (songs?|tracks?|videos?|playlists?|are tagged|have been tagged)\b|\b(library|collection) (size|stats)\b|\bhow big is (my|the) (library|collection)\b/.test(low)) add(7, '');
      try { const ws = vibeWordsOf(t); if (ws.length && /\b(songs?|tracks?|music|anything|something|any|got|have|find|show|which|playlist)\b/.test(low)) add(5, ws.join(' ')); } catch (e) {}
      if (/\b(do i have|have i got|got any|is there|are there|find|search( for)?|look(ing)? for)\b/.test(low) && !plans.some(p => p.id === 7)) add(2, after(/\b(?:by|called|named) (.+)$/i) || after(/\b(?:do i have|have i got|got any|find|search for|look for) (?:any |some |a |the |songs? |tracks? )*(?:by |called |named )?(.+)$/i));
      if (/\b(tempo|bpm|key|genre|mood|how fast|who (sings|sang|is the artist|made)|tell me about|info(rmation)? (on|about))\b/.test(low) && (/\b(this|that|it|current|playing)\b/.test(low) || (() => { try { return (blNamed(t) || []).length > 0; } catch (e) { return false; } })())) add(3, '');
      return plans;
    };
    const LK_MENU = 'You decide whether a music player assistant must look something up or do something in the player before replying. Reply with ONLY a number, or a number, a colon and a short search text. Menu:\n' +
      '0 = no lookup needed (small talk, general chat)\n1 = the user asks you to find something and names what: keywords like lyrics, playlist, most played, how many songs, a mood, a title (the app scans the message for them)\n2: <title or artist> = search the library\n3: <title> = details of a song: mood, genre, tempo, key (current song if no title)\n4: <title> = the lyrics of a song (current song if no title)\n5: <mood, genre, instrument or tempo> = songs that match\n6: <song or artist> = what the user plays most\n7 = library size, tagged count\n8: <playlist name> = what is in a playlist, or list all playlists if no name\n9: <title> = which playlists a song is in (current song if no title)\n10: <what to play> = PLAY a song, artist, playlist or mood now\n11: <pause, resume, next, previous, shuffle on, shuffle off, volume up, volume down> = control playback\n12: <description> = MAKE a new playlist, such as sad songs or songs like Hello\n13 = TAG (analyse) the current song\n14 = UNDO what was just done (undo, undo all, or undo 3)\n' +
      'Examples:\nfind the lyrics for me -> 1\nI love this song -> 0\ndo I have anything by Drake -> 2: Drake\nwhat is this song about -> 4\nany sad songs? -> 5: sad\nwhat do I listen to most -> 6: song\nhow many songs do I have -> 7\nwhat is in my gym playlist -> 8: gym\nwhat playlists do I have -> 8\nis this song in a playlist -> 9\nplay Hello by Adele -> 10: Hello by Adele\nplay something chill -> 10: something chill\npause the music -> 11: pause\nturn it up -> 11: volume up\nmake me a playlist of sad songs -> 12: sad songs\ntag this song -> 13\nundo that -> 14: undo\nundo everything -> 14: undo all\nhow are you -> 0';
    const lkParse = r => { const m = String(r || '').match(/(\d{1,2})\s*(?:[:\-\u2013]\s*)?([^\n]*)/); if (!m) return null; return { id: +m[1], arg: m[2].replace(/->.*$/, '').replace(/^["'\u201c\u2018]+|["'\u201d\u2019.!?]+$/g, '').trim().slice(0, 60) }; };
    // Library / player words: only messages with one of these can need a lookup. Small talk skips the planner entirely.
    const LK_TOPIC = /\b(songs?|tracks?|music|playlists?|albums?|artists?|bands?|singers?|lyrics?|library|collection|listen\w*|play\w*|tagged|tags?|genre|mood|tempo|bpm|key|favou?rite|most|top|recent\w*|have i|do i have|got any|find|search|this one|it about)\b/i;
    async function lookup(g, text, status) {
      const done = [], seen = new Set();
      // 1) Plain keyword rules: no AI call, nothing to wait for.
      let kw = []; try { kw = lkKeywords(text) || []; } catch (e) { console.warn('keyword lookup failed', e); }
      for (const p of kw.slice(0, 2)) {
        const tool = LK[p.id]; if (!tool) continue;
        const key = p.id + '|' + String(p.arg || '').toLowerCase(); if (seen.has(key)) continue; seen.add(key);
        status('Looking up ' + tool.what + '\u2026');
        let out = ''; try { out = String(tool.run(p.arg, text) || ''); } catch (e) { console.warn('lookup tool failed', e); out = 'the lookup failed'; }
        done.push({ tool: tool.name + (p.arg ? '(' + p.arg + ')' : ''), out: out.slice(0, 600) });
      }
      if (done.length || !LK_TOPIC.test(text)) return done.map(d => d.tool + ': ' + d.out).join('\n');
      // 2) A library question the rules didn't catch: one short AI planning pass (it used to run on every message, up to twice).
      for (let round = 0; round < 1; round++) {
        let plan = null;
        try {
          const ask = text + (done.length ? '\n[Already looked up: ' + done.map(d => d.tool + ' -> ' + d.out).join(' | ').slice(0, 300) + '. Reply 0 unless something else is still needed.]' : '');
          const o = await g([{ role: 'system', content: LK_MENU }, { role: 'user', content: ask }], { max_new_tokens: 24, do_sample: false, temperature: 0, top_k: 1, repetition_penalty: 1 });
          let r = o && o[0] && o[0].generated_text; r = Array.isArray(r) ? (r[r.length - 1] || {}).content : r; plan = lkParse(r);
        } catch (e) { console.warn('lookup plan failed', e); }
        if (!plan || !plan.id || !LK[plan.id]) break;
        const key = plan.id + '|' + plan.arg.toLowerCase(); if (seen.has(key)) break; seen.add(key);
        const tool = LK[plan.id]; status('Looking up ' + tool.what + '\u2026');
        let out = ''; try { out = String(tool.run(plan.arg, text) || ''); } catch (e) { console.warn('lookup tool failed', e); out = 'the lookup failed'; }
        done.push({ tool: tool.name + (plan.arg ? '(' + plan.arg + ')' : ''), out: out.slice(0, 600) });
      }
      return done.map(d => d.tool + ': ' + d.out).join('\n');
    }
    async function send(raw, noEcho) {
      const text = String(raw || '').trim().slice(0, 400); if (!text || chatBusy) return;
      blLastSent = text.toLowerCase();
      const direct = aiOnly && brainOn();                              // AI only: no keyword rules, commands or scripted replies
      if (!noEcho) add('me', text);
      if (!direct) { try { blEquip(blPropFor(text)); } catch (e) { console.error(e); } }
      if (CRISIS.test(text)) { clearTimeout(blTr && blTr.timer); blTr = null; add('bot', CRISIS_MSG); return; }
      if (lyFix) {
        if (/^(?:done|end|exit|quit|finish(?:ed)?|that'?s all|that is all|save|save it|stop)[.!]*$/i.test(text)) { endLyFix(); return; }
        if (agentOn() && text.split(/\s+/).length <= 5 && /^(?:pause|play|resume|next|skip|previous|prev|louder|quieter|volume|mute|unmute|rewind|forward|go back|repeat|faster|slower)\b/i.test(text)) { let hit = false; try { hit = smart(text); } catch (e) { console.error(e); } if (hit) return; }
        await lfChat(text); return;
      }
      if (songTalk) {
        if (/^(?:done|end|exit|quit|stop talking|end (?:the )?(?:chat|talk)|that'?s all|that is all|bye|thanks,? that'?s all)[.!]*$/i.test(text)) { endSongTalk(); return; }
        // short player commands still run ("pause", "next", "louder", "rewind 10 seconds"); everything else is about the song
        if (agentOn() && text.split(/\s+/).length <= 5 && /^(?:pause|play|resume|stop|next|skip|previous|prev|louder|quieter|volume|mute|unmute|rewind|forward|go back|repeat|shuffle|faster|slower)\b/i.test(text)) { let hit = false; try { hit = smart(text); } catch (e) { console.error(e); } if (hit) return; }
        if (!brainOn() || (!gen && lsGet('ppvChatDl') !== '1')) { add('bot', 'Song Talk needs my AI brain. Turn it on in the assistant settings and download it first.'); return; }
        await songTalkReply(text); return;
      }
      if (!noEcho && blTr) { try { if (blTreeText(text)) return; } catch (e) { console.error(e); blTr = null; } }
      if (!blTr && !direct) { try { if (blTreeEntry(text)) return; } catch (e) { console.error(e); blTr = null; } }
      if (!direct) try { if (roleplay(text)) return; } catch (e) { console.error(e); }
      if (!direct) try { if (blNamedTalk(text)) return; } catch (e) { console.error(e); }
      { const tm = !direct && text.match(/^(?:my )?fav(?:ou?rite)? (?:topics?|subjects?|things? to talk about) (?:is|are)\s+(.{2,180}?)[.!]*$/i);
        if (tm) { const old = favTopics(), add1 = tm[1].trim(); setFavTopics(old && !old.toLowerCase().includes(add1.toLowerCase()) ? old + ', ' + add1 : old || add1); add('bot', 'Ooh, noted! I love talking about ' + add1 + '. Ask me anything!'); return; } }
      if (agentOn() && !direct) { let hit = false; try { hit = smart(text); } catch (e) { console.error(e); hit = true; add('bot', 'Oops, that did not work: ' + e.message); } if (hit) return; }
      if (!direct) try { if (tagTalk(text)) return; } catch (e) { console.error(e); }
      if (!direct) try { if (blTalk(text)) return; } catch (e) { console.error(e); }
      const f = !direct && FAQ.find(x => x[0].test(text)); if (f) { const r = f[1]; add('bot', typeof r === 'function' ? r() : Array.isArray(r) ? pick(r) : r); return; }
      if (agentOn() && !direct) { try { if (routeIntent(text)) return; } catch (e) { console.error(e); } }
      if (agentOn() && !direct) { try { if (await semRoute(text)) return; } catch (e) { console.error(e); } }
      if (!brainOn()) { fallbackReply(text); return; }
      if (heavyBusy()) { add('bot', "I'm busy with a heavy job (split, lyrics or tagging), so I'm staying out of memory until it's done. Commands still work, and I can chat after."); return; }
      if (!gen && !dlOk && lsGet('ppvChatDl') !== '1') {
        add('bot', "To chat about anything else I need to download my brain first: about " + CHAT_MODELS[chatKey()].mb + " MB, one time. Wi-Fi is best.");
        actions([['Download and chat', (b, d) => { d.remove(); dlOk = true; send(text, true); }], ['Not now', (b, d) => d.remove()]]);
        return;
      }
      chatBusy = true; cm('work');
      const el = add('bot', '\u2026');
      try {
        const g = await ensureModel(s => { el.textContent = s; });
        const found = await lookup(g, text, st => { el.textContent = st; }), np = nowCtx().match(/NOW PLAYING[^:]*: ([^.]*?)(?:, [^.]*)?\. You already/);
        const mx = replyMax(), uMsg = { role: 'user', content: text + (np ? '\n[Currently playing: ' + np[1] + ']' : '') }, mem = memN() ? hist.slice(-2 * memN()) : [];
        let fit = fitMsgs([{ role: 'system', content: chatSys(text, found) }].concat(mem, [uMsg]), mx);
        if (fit.over) fit = fitMsgs([{ role: 'system', content: chatSys(text, found, true) }].concat(mem, [uMsg]), mx);   // still too big: drop the personality text
        const msgs = fit.msgs;
        let acc = '', opts = { max_new_tokens: mx, do_sample: true, temperature: 0.75, top_p: 0.92, top_k: 50, repetition_penalty: 1.18 };
        const onPiece = t => { acc += t; el.textContent = acc; scrollDown(); };
        if (g.lm) opts.streamer = { callback_function: onPiece };                       // LiteRT-LM streams text itself, no TextStreamer or tokenizer needed
        else if (tfMod.TextStreamer) opts.streamer = new tfMod.TextStreamer(g.tokenizer, { skip_prompt: true, skip_special_tokens: true, callback_function: onPiece });
        const out = await g(msgs, opts);
        let r = out && out[0] && out[0].generated_text; r = Array.isArray(r) ? (r[r.length - 1] || {}).content : (r || acc);
        r = String(r || acc).trim().replace(/\s+\n/g, '\n') || "Hmm, I lost my words. Try again?";
        const prevBot = (hist.filter(m => m.role === 'assistant').pop() || {}).content, nz = z => String(z || '').toLowerCase().replace(/[^a-z0-9 ]/g, '').trim();
        if (prevBot && looksOk(r) && nz(r) === nz(prevBot)) {
          try { const o2 = await g(msgs, Object.assign({}, opts, { streamer: undefined, temperature: 1.0, repetition_penalty: 1.3 })); let r2 = o2 && o2[0] && o2[0].generated_text; r2 = Array.isArray(r2) ? (r2[r2.length - 1] || {}).content : r2; if (r2 && looksOk(String(r2)) && nz(r2) !== nz(prevBot)) r = String(r2).trim(); } catch (e) {}
        }
        if (!looksOk(r)) { el.textContent = "Sorry, that came out as gibberish. Try again, or tap Clear."; return void (chatBusy = false); }   // never feed garbage back into the history
        r = finishSentence(r);
        try { const A = window.__ppApi, tg = loadTags(), cu = A && A.currentIndex() >= 0 ? A.tracks()[A.currentIndex()] : null; r = fixNums(r, cu && tg[cu.dbId] && tg[cu.dbId].bpm ? [tg[cu.dbId].bpm] : Object.values(tg).map(x => x && x.bpm).filter(Boolean)); } catch (e) {}
        el.textContent = r; try { vSpeak(r); } catch (e) {} hist.push({ role: 'user', content: text }, { role: 'assistant', content: r }); hist = memN() ? hist.slice(-2 * memN()) : [];
        if (!direct) moodChip(text);
      } catch (e) { console.error(e); dlOk = false; el.textContent = "Oops, my brain would not load: " + e.message; }
      chatBusy = false; scrollDown(); cm('greet'); setTimeout(() => cm('idle'), 1300);
      idleUnload();   // hand the RAM back when idle (later on big-RAM phones, so the next message doesn't wait for a reload)
    }
    return {
      react,
      voice: ppVoiceApi,
      songTalk: i => startSongTalk(i),
      lyricFix: i => startLyFix(i),
      chat: { ctx: ctxOf, ready: () => !!gen || lsGet('ppvChatDl') === '1', mb: () => CHAT_MODELS[chatKey()].mb, ask: async (msgs, opts, say) => { if (chatBusy) throw new Error('Bloopy is busy chatting. Try again in a moment.'); clearTimeout(idleT); const g = await ensureModel(say || (() => {})); try { opts = Object.assign({}, opts || {}); if (opts.onText) { if (g.lm) opts.streamer = { callback_function: opts.onText }; delete opts.onText; } const o = await g(msgs, opts); const gt = o[0].generated_text; return String(Array.isArray(gt) ? gt[gt.length - 1].content : gt).trim(); } finally { idleUnload(); } }, isOn: () => chatOn, setOn: setChatOn, free: freeChat, setModel: setChatModel, models: CHAT_MODELS, key: chatKey, brainOn, setBrain, memory: { get: memN, set: setMem, max: MEM_MAX } },
      start() { key = ''; set('start', blLine('start', L.start), 900); },
      opened() {
        if (greeted || !on) return; greeted = true;
        const h = new Date().getHours(), hi = h < 5 ? 'Up late?' : h < 12 ? 'Good morning!' : h < 18 ? 'Hey there!' : 'Good evening!';
        let met = lsGet('ppvMascotMet'); lsSet('ppvMascotMet', '1');
        set('greet', met ? hi + ' ' + blLine('ready', ['Ready when you are.', 'What are we working on?', 'Got a song for me?'])
                         : blOpenLine() + " I split songs, tag them and write lyrics. Pick a track and tap a button!", 5000);
      },
      tap() { if (mood === 'work') bub.textContent = fbub.textContent = blLine('busy', L.busy); else set('start', blLine('tap', L.tap), 2500); },
      isOn: () => on,
      setOn(v) { on = !!v; lsSet('ppvMascot', on ? '1' : '0'); row.style.display = on ? 'flex' : 'none'; if (!on) fl.style.display = 'none'; else set('greet', 'Hi again!', 3000); },
      ball: pb
    };
  }

  function ui() {
    const css = document.createElement('style');
    css.textContent = '#ppv-panel{position:fixed;left:50%;transform:translateX(-50%);bottom:calc(90px + env(safe-area-inset-bottom,0px));z-index:99998;width:min(320px,calc(100vw - 24px));max-height:70vh;overflow:auto;padding:12px;border-radius:12px;background:#1b1c20;color:#eee;font:13px system-ui,sans-serif;display:none;box-shadow:0 6px 24px #0008}#ppv-panel button{width:100%;margin-top:8px;padding:9px;border-radius:8px;border:0;background:#7c3aed;color:#fff;font:600 13px system-ui}#ppv-panel button:disabled{opacity:.5}#ppv-panel button.ppv-x{width:auto;margin:0;padding:0 8px;background:transparent;font-size:22px;line-height:1}#ppv-panel button.ppv-sec{background:transparent;border:1px solid #555;font-weight:500;font-size:12px;padding:6px}#ppv-panel select{width:100%;margin-top:6px;padding:7px;border-radius:8px;background:#2a2b31;color:#eee;border:1px solid #444}#ppv-panel label.ppv-c{display:inline-block;margin:6px 10px 0 0}#ppv-bar{height:6px;background:#333;border-radius:3px;margin-top:8px}#ppv-bar i{display:block;height:100%;width:0;background:#7c3aed;border-radius:3px}';
    document.head.appendChild(css);
    // The Stems pill lives in index.html as a normal quick-bar item (data-item-wrapper="stems"), so the
    // menu / quick bar system owns where it sits. Only build one ourselves if the page doesn't have it.
    let b = document.getElementById('ppv-btn');
    if (!b) {
      b = document.createElement('button'); b.id = 'ppv-btn'; b.type = 'button'; b.className = 'pill-btn'; b.title = 'Split into stems'; b.setAttribute('aria-label', 'Stem separator'); b.setAttribute('data-item-wrapper', 'stems');
      b.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="2" width="6" height="12" rx="3"/><path d="M5 11a7 7 0 0 0 14 0"/><line x1="12" y1="18" x2="12" y2="22"/></svg><span>Stems</span>';
    }
    const p = document.createElement('div'); p.id = 'ppv-panel';
    p.innerHTML = '<div style="display:flex;justify-content:space-between;align-items:center"><b>Stem separator</b><button id="ppv-x" class="ppv-x" type="button" aria-label="Close">&times;</button></div><select id="ppv-model">' + Object.entries(MODELS).map(([k, m]) => '<option value="' + k + '">' + m.label + '</option>').join('') + '</select>' +
      '<div style="margin-top:8px">Optimization</div><select id="ppv-lvl"><option value="0">Off</option><option value="1">Light</option><option value="2">Medium</option><option value="3">Max</option><option value="4">Custom (pick each setting)</option></select><div id="ppv-lvi" style="opacity:.6;font-size:11px;margin-top:4px"></div>' +
      '<div id="ppv-cust" style="display:none;margin-top:6px;padding:8px;border:1px solid rgba(128,128,128,.35);border-radius:8px">' +
      '<div>CPU threads</div><select id="ppv-c-th"><option value="0">Auto (fast cores)</option><option value="1">1</option><option value="2">2</option><option value="3">3</option><option value="4">4</option><option value="6">6</option><option value="8">8</option></select><div id="ppv-c-thn" style="opacity:.6;font-size:11px;margin-top:2px"></div>' +
      '<div style="margin-top:8px">Rest between chunks: <span id="ppv-c-rv">0</span>%</div><input id="ppv-c-rest" type="range" min="0" max="100" step="5" value="0" style="width:100%"><div style="opacity:.6;font-size:11px">Idle time after each chunk. Higher = cooler and easier on the battery, but slower.</div>' +
      '<label class="ppv-c" style="display:block;margin-top:8px"><input type="checkbox" id="ppv-c-lean"> Lean memory (less RAM, a bit slower)</label>' +
      '<label class="ppv-c" style="display:block;margin-top:6px"><input type="checkbox" id="ppv-c-skip"> Skip stems that are not ticked</label>' +
      '<label class="ppv-c" style="display:block;margin-top:6px"><input type="checkbox" id="ppv-c-smooth"> Keep the app responsive while processing</label>' +
      '<label class="ppv-c" style="display:block;margin-top:6px"><input type="checkbox" id="ppv-c-wake"> Keep the screen awake</label>' +
      '<label class="ppv-c" style="display:block;margin-top:6px"><input type="checkbox" id="ppv-c-blob"> Low-RAM model download</label>' +
      '<label id="ppv-c-spinl" class="ppv-c" style="display:none;margin-top:6px"><input type="checkbox" id="ppv-c-spin"> Keep threads busy between steps (faster, hotter, uses more battery)</label></div>' +
      '<div id="ppv-stems"></div>' +
      '<div style="margin-top:8px">Mute vocal gaps</div><select id="ppv-gate"><option value="0">Off</option><option value="1">Gentle</option><option value="2">Normal</option><option value="3">Strong</option></select><div style="opacity:.6;font-size:11px;margin-top:4px">Silences leftover noise between sung lines. Vocals stem only.</div>' +
      '<div style="margin-top:8px">Mute non-vocal parts (uses lyrics/subtitles)</div><select id="ppv-mask"><option value="0">Off</option><option value="1">Gentle</option><option value="2">Normal</option><option value="3">Strong</option></select><div style="opacity:.6;font-size:11px;margin-top:4px">Removes solos and instrumental breaks from the Vocals stem and puts that sound back into Instrumental / Other. Needs synced lyrics or subtitles. If they did not come from Whisper, Whisper listens first to fix the line timing (slower; reused next time). Skipped if they look incomplete.</div>' +
      '<div id="ppv-spl" style="margin-top:8px">Strength: <span id="ppv-sv">1</span><input id="ppv-sl" type="range" min="1" max="4" step="0.5" value="1" style="width:100%"><div style="opacity:.6;font-size:11px">Higher = less bleed, more watery artifacts</div><div style="margin-top:8px">Quality</div><select id="ppv-q"><option value="0">Standard</option><option value="1">Better (smooth seams, ~1.3x time)</option><option value="2">Best (+ averaged 2nd pass, ~2.7x time)</option></select></div>' +
      '<label id="ppv-gpu" class="ppv-c" style="display:none;margin-top:8px"><input type="checkbox" id="ppv-gpuc"> Use GPU (faster, experimental)</label>' +
      '<label id="ppv-nn" class="ppv-c" style="display:none;margin-top:8px"><input type="checkbox" id="ppv-nnc"> Phone GPU/NPU (experimental). Demucs always uses the CPU</label>' +
      '<label id=\"ppv-vidl\" class=\"ppv-c\" style=\"display:block;margin-top:8px\"><input type=\"checkbox\" id=\"ppv-vid\"> Keep the original video (video tracks only)</label><div class=\"ppv-note\">Saves each stem as a video with its sound replaced. Takes the video\u2019s full length per stem, keep the screen on.</div>' +
      '<details><summary>Where split tracks go</summary><div class="ppv-note">Split tracks never count as new library tracks. They are all kept together under \u201cSplit tracks\u201d in the library\u2019s view selector.</div>' +
      '<label class="ppv-c" style="display:block"><input type="checkbox" id="ppv-mkpl"> Also make a playlist for each split song</label>' +
      '<label id="ppv-tabl" class="ppv-c" style="display:block"><input type="checkbox" id="ppv-pltab"> Show those playlists in the Playlists tab</label>' +
      '<div class="ppv-note">Off = they only appear in the library\u2019s playlist selector.</div>' +
      '<label class="ppv-c" style="display:block"><input type="checkbox" id="ppv-sect"> Give each split song its own section</label>' +
      '<div class="ppv-note">In \u201cSplit tracks\u201d, each song gets a collapsible section with all its stems.</div></details>' +
      '<div id="ppv-st" style="margin-top:8px;opacity:.8">Ready</div><div id="ppv-bar"><i></i></div><button id="ppv-go">Split current track</button><button id="ppv-del" class="ppv-sec">Free up space (delete this model)</button>';
    document.body.appendChild(p);
    const mas = mascot(p);
    mas.ball.onclick = () => mas.tap();
    document.addEventListener('click', e => { const bt = e.target.closest && e.target.closest('button'); if (bt && !bt.disabled && ['ppv-go', 'ppv-tag', 'ppv-all', 'ppv-wgo', 'ppv-simgo', 'ppv-mk', 'ppv-mkq', 'ppv-eqall'].includes(bt.id)) mas.start(); }, true);
    p.insertAdjacentHTML('beforeend', '<label class="ppv-c" style="margin-top:10px"><input type="checkbox" id="ppv-mas"> Show Bloopy, the mascot</label>');
    const mc = p.querySelector('#ppv-mas'); mc.checked = mas.isOn(); mc.onchange = () => mas.setOn(mc.checked);
    p.insertAdjacentHTML('beforeend', '<label class="ppv-c" style="margin-top:6px"><input type="checkbox" id="ppv-bub"> Bloopy speech bubbles over the app</label>');
    p.insertAdjacentHTML('beforeend', '<label class="ppv-c" style="margin-top:6px"><input type="checkbox" id="ppv-hdr"> Bloopy headers at the top of AI sections</label>');
    {
      const hs = document.createElement('style'); hs.textContent = 'html.bl-nohead .bl-top,html.bl-nohead #ppv-mrow{display:none!important}'; document.head.appendChild(hs);
      const hc = p.querySelector('#ppv-hdr'), apply = () => document.documentElement.classList.toggle('bl-nohead', !hc.checked);
      try { hc.checked = localStorage.getItem('ppvBlHeaders') === '1'; } catch (e) {}
      apply(); hc.onchange = () => { try { localStorage.setItem('ppvBlHeaders', hc.checked ? '1' : '0'); } catch (e) {} apply(); };
    }
    const bc = p.querySelector('#ppv-bub'); try { bc.checked = localStorage.getItem('ppvBlBubbles') === '1'; } catch (e) {}
    bc.onchange = () => { try { localStorage.setItem('ppvBlBubbles', bc.checked ? '1' : '0'); } catch (e) {} if (!bc.checked) { const f = document.getElementById('ppv-mfloat'), r = document.getElementById('bl-react'); f && (f.style.display = 'none'); r && r.classList.remove('show'); } };
    p.insertAdjacentHTML('beforeend', '<label class="ppv-c" style="display:block;margin-top:8px"><input type="checkbox" id="ppv-chat-on"> Bloopy assistant (does things in the app, no AI download)</label>' +
      '<div class="ppv-note">Adds a Bloopy button. He can play music by mood, make mood and smart playlists, tag, split, get lyrics and control the player (volume, seek, speed, EQ, repeat\u2026). That all runs from the tagger and fixed rules, so it needs no chat AI.</div>' +
      '<label class="ppv-c" style="display:block"><input type="checkbox" id="ppv-brain-on"> Chat brain: talk about anything with a tiny AI (optional, one-time download)</label>' +
      '<div class="ppv-note">Off: Bloopy only does tasks and answers app questions. On: he can also chat. It is taken out of memory whenever he does a task. It is a tiny model: it can be wrong, and it is not a counselor.</div>' +
      '<label class="ppv-c" style="display:block">Bloopy\'s memory: <b id="ppv-mem-val"></b><input type="range" id="ppv-mem" min="0" max="8" step="1" style="width:100%;display:block"></label>' +
      '<div class="ppv-note">How many recent messages and replies are remembered while chatting. 0 forgets each message right away. Higher keeps more context but is slower. Tasks and commands never need memory.</div>' +
      '<label class="ppv-c" style="display:block">Your favourite topics: <input type="text" id="ppv-topics" maxlength="200" placeholder="e.g. space, Minecraft, cooking, football"></label>' +
      '<div class="ppv-note">Bloopy will happily chat about these (with the chat brain on). You can also tell him in chat: my favourite topics are ...</div>' +
      '<div style="margin-top:10px"><b>How Bloopy replies</b></div>' +
      '<label class="ppv-c" style="display:block">Chat reply length: <select id="ppv-clen" data-sync="ppvChatLen" style="width:100%;display:block">' + menuOpts(CHAT_LENS) + '</select></label>' +
      '<label class="ppv-c" style="display:block">Chat reply style: <select id="ppv-csty" data-sync="ppvChatStyle" style="width:100%;display:block">' + menuOpts(CHAT_STYLES) + '</select></label>' +
      '<label class="ppv-c" style="display:block">Summary length: <select id="ppv-slen2" data-sync="ppvSumLen" style="width:100%;display:block">' + menuOpts(SUM_LENS) + '</select></label>' +
      '<label class="ppv-c" style="display:block">Summary style: <select id="ppv-ssty2" data-sync="ppvSumStyle" style="width:100%;display:block">' + menuOpts(SUM_STYLES) + '</select></label>' +
      '<div class="ppv-note">The chat menus apply to normal chat and Song Talk. The summary menus apply to AI summaries, here and under Lyrics &amp; subtitles. A tiny model may not follow every instruction exactly, and long replies take longer. Summary lengths are hard limits: anything past the length is cut at the last full sentence. Lyric Fix keeps its own short format.</div>' +
      '<label class="ppv-c" style="display:block"><input type="checkbox" id="ppv-agent-on"> Allow Bloopy to run commands (play, playlists, tagging, volume\u2026)</label>' +
      '<label id="ppv-chatgpul" class="ppv-c" style="display:none"><input type="checkbox" id="ppv-chatgpu"> Use GPU (experimental, ~270 MB download)</label>' +
      '<label id="ppv-lmgpul" class="ppv-c" style="display:none"><input type="checkbox" id="ppv-lmgpu"> Run the app-only (LiteRT-LM) models on the phone GPU: much faster. Falls back to the CPU by itself. Applies the next time the model loads.</label>' +
      '<button id="ppv-chatfree" class="ppv-sec" type="button">Free up chat download</button>');
    { const co = p.querySelector('#ppv-chat-on'), cg = p.querySelector('#ppv-chatgpu'), cl = p.querySelector('#ppv-chatgpul');
      co.checked = mas.chat.isOn(); co.onchange = () => mas.chat.setOn(co.checked);
      const cbr = p.querySelector('#ppv-brain-on'); cbr.checked = mas.chat.brainOn(); cbr.onchange = () => mas.chat.setBrain(cbr.checked);
      cbr.closest('label').insertAdjacentHTML('afterend', '<label class="ppv-c" style="display:block">Chat model: <select id="ppv-chat-model" style="width:100%;display:block"></select></label>');
      const cmod = p.querySelector('#ppv-chat-model');
      cmod.innerHTML = Object.keys(mas.chat.models).filter(k => NATIVE || !mas.chat.models[k].lm).map(k => '<option value="' + k + '">' + mas.chat.models[k].label + '</option>').join('');
      cmod.value = mas.chat.key(); cmod.onchange = () => mas.chat.setModel(cmod.value);
      [['#ppv-clen', chatLenKey], ['#ppv-csty', chatStyleKey], ['#ppv-slen2', sumLenKey], ['#ppv-ssty2', sumStyleKey]].forEach(([q, f]) => { const x = p.querySelector(q); if (x) x.value = f(); });
      { const tp = p.querySelector('#ppv-topics'); tp.value = favTopics(); tp.onchange = () => setFavTopics(tp.value); }
      const ms = p.querySelector('#ppv-mem'), mv = p.querySelector('#ppv-mem-val'), memTxt = n => n === 0 ? 'none' : n + (n === 1 ? ' exchange' : ' exchanges');
      ms.value = mas.chat.memory.get(); mv.textContent = memTxt(+ms.value);
      ms.oninput = () => { const n = mas.chat.memory.set(ms.value); mv.textContent = memTxt(n); };
      const ag = p.querySelector('#ppv-agent-on'); try { ag.checked = localStorage.getItem('ppvAgent') !== '0'; } catch (e) { ag.checked = true; }
      ag.onchange = () => { try { localStorage.setItem('ppvAgent', ag.checked ? '1' : '0'); } catch (e) {} };
      if (navigator.gpu) cl.style.display = 'block'; try { cg.checked = localStorage.getItem('ppvChatGpu') === '1'; } catch (e) {}
      { const lg = p.querySelector('#ppv-lmgpu'), ll = p.querySelector('#ppv-lmgpul');
        if (NATIVE && lg && ll) { ll.style.display = 'block'; try { lg.checked = localStorage.getItem('ppvLmGpu') !== '0'; } catch (e) { lg.checked = true; }
          lg.onchange = () => { try { localStorage.setItem('ppvLmGpu', lg.checked ? '1' : '0'); } catch (e) {} }; } }
      cg.onchange = () => { try { localStorage.setItem('ppvChatGpu', cg.checked ? '1' : '0'); } catch (e) {} };
      p.querySelector('#ppv-chatfree').onclick = async () => { try { await mas.chat.free(); status('Chat download removed.'); } catch (e) { status('Error: ' + errText(e)); } }; }
    p.insertAdjacentHTML('beforeend', '<div style="margin-top:10px"><b>Bloopy voice and listening</b></div>' +
      '<label class="ppv-c" style="display:block"><input type="checkbox" id="ppv-mini-on"> Smarter understanding (MiniLM, ~25 MB download)</label>' +
      '<div class="ppv-note">Loose wording finds the right command, and songs can be requested by meaning, like something for a rainy drive. Needs the assistant on.</div>' +
      '<label class="ppv-c" style="display:block"><input type="checkbox" id="ppv-voice-on"> Bloopy speaks (Kokoro voice, ~90 MB download)</label>' +
      '<select id="ppv-voice-who"></select><select id="ppv-voice-when"><option value="talk">Only when spoken to</option><option value="all">Every reply</option></select>' +
      '<label class="ppv-c" id="ppv-voice-natl" style="display:none"><input type="checkbox" id="ppv-voice-nat"> Native voice: use the phone\'s own voice (no download, starts right away)</label>' +
      '<div class="ppv-note">A warm, calm voice. Music dips while he talks. With Native voice on, the phone picks the voice and the list above is not used.</div>' +
      '<label class="ppv-c" style="display:block"><input type="checkbox" id="ppv-mic-on"> Talk to Bloopy (Moonshine, ~50 MB download)</label>' +
      '<label class="ppv-c" id="ppv-mic-natl" style="display:none"><input type="checkbox" id="ppv-mic-nat"> Native listening: hear with the app\'s own Whisper engine (the one that makes subtitles)</label>' +
      '<div class="ppv-note">Adds a mic button to his chat. Tap it, speak, and it sends after a pause. Native listening is English only and uses English Base if you already have it, otherwise English Tiny (~40 MB).</div>' +
      '<label class="ppv-c" style="display:block"><input type="checkbox" id="ppv-wake-on"> Wake word (listens while this page is open)</label>' +
      '<div class="ppv-note">Say the wake phrase and he listens. It uses the mic continuously, which costs some battery, and loud music can hide the voice or cause false wakes. The phrase is Hey Jarvis.</div>' +
      '<button id="ppv-voicefree" class="ppv-sec" type="button">Free up voice downloads</button>');
    { const V = mas.voice, g = id => p.querySelector('#' + id);
      const boxes = [['ppv-mini-on', 'ppvMini'], ['ppv-voice-on', 'ppvVoice'], ['ppv-mic-on', 'ppvMic'], ['ppv-wake-on', 'ppvWake'], ['ppv-voice-nat', 'ppvVoiceNat'], ['ppv-mic-nat', 'ppvEarsNat']];
      if (NATIVE) { g('ppv-mic-natl').style.display = 'block'; if (window.Capacitor.Plugins.PPSpeech) g('ppv-voice-natl').style.display = 'block'; }
      const sync = () => boxes.forEach(([id, k]) => { g(id).checked = V.get(k); });
      boxes.forEach(([id, k]) => { g(id).onchange = () => {
        const on = g(id).checked;
        if (k === 'ppvWake' && on && !V.get('ppvMic')) V.set('ppvMic', true, status);             // the wake word needs the listening model
        V.set(k, on, status);
        if (k === 'ppvMic' && !on) V.set('ppvWake', false, status);
        sync();
      }; });
      const who = g('ppv-voice-who'), when = g('ppv-voice-when');
      who.innerHTML = V.list.map(([k, n]) => '<option value="' + k + '">' + n + '</option>').join(''); who.value = V.who(); when.value = V.when();
      who.onchange = () => V.setWho(who.value); when.onchange = () => V.setWhen(when.value);
      g('ppv-voicefree').onclick = async () => { try { await V.free(); sync(); status('Voice downloads removed.'); } catch (e) { status('Error: ' + errText(e)); } };
      sync(); }
    // Keep the pill attached: if it's ever detached (or was never in the page), put it back in the quick bar
    // when the user has it enabled there, otherwise in its menu slot. Never moves it while it's attached.
    const place = () => {
      if (b.isConnected) return true;
      const cb = document.querySelector('.qb-checkbox[data-qb="stems"]');
      const host = (cb && cb.checked && document.getElementById('extra-transport')) || document.querySelector('.menu-item-slot[data-slot="stems"]') || document.getElementById('extra-transport');
      if (!host) return false;
      host.appendChild(b); return true;
    };
    if (!place()) { let n = 0; const iv = setInterval(() => { if (place() || ++n > 40) clearInterval(iv); }, 250); }
    setInterval(place, 2000);
    const $ = s => p.querySelector(s), st = $('#ppv-st'), bar = $('#ppv-bar i'), go = $('#ppv-go'), sel = $('#ppv-model'), sl = $('#ppv-sl'), sv = $('#ppv-sv'), gpu = $('#ppv-gpuc'), lsel = $('#ppv-lvl'), lvi = $('#ppv-lvi'), qsel = $('#ppv-q'), gsel = $('#ppv-gate'), msel = $('#ppv-mask');
    const LV = () => +lsel.value === 4 ? customLevel() : LEVELS[+lsel.value] || null, showLv = () => { const l = LV(); lvi.textContent = !l ? 'No limits. Fastest, but can crash weak phones.' : l.custom ? 'Custom: ' + (l.threads ? l.threads + ' thread' + (l.threads > 1 ? 's' : '') : 'auto threads') + ', ' + Math.round(l.duty * 100) + '% rest.' : l.info; };
    let holdUntil = 0;                                                // keep "Done"/"Error" visible instead of being wiped by "Ready" a split second later
    const status = t => { st.textContent = t; document.querySelectorAll('.ppv-stx').forEach(e => { e.textContent = t; }); if (/^(Done|Error)/.test(t)) holdUntil = Date.now() + 5000; mas.react(t); }, ls = (k, v) => { try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch (e) {} };
    const nnc = $('#ppv-nnc'); if (NATIVE) { $('#ppv-nn').style.display = 'block'; nnc.checked = ls('ppvNnapi') !== '0'; nnc.onchange = () => { ls('ppvNnapi', nnc.checked ? '1' : '0'); }; }
    const savedModel = ls('ppvModel'); if (savedModel && MODELS[savedModel]) sel.value = savedModel;
    if (ls('ppvStrength')) { sl.value = ls('ppvStrength'); sv.textContent = sl.value; }
    lsel.value = ls('ppvLevel') || (ls('ppvLow') === '0' ? '0' : '2'); showLv(); gpu.checked = ls('ppvGpu') === '1'; if (navigator.gpu) $('#ppv-gpu').style.display = 'block';
    sl.oninput = () => { sv.textContent = sl.value; ls('ppvStrength', sl.value); };
    gpu.onchange = () => ls('ppvGpu', gpu.checked ? '1' : '0');
    const mkpl = $('#ppv-mkpl'), pltab = $('#ppv-pltab');
    const syncPl = () => { pltab.disabled = !mkpl.checked; $('#ppv-tabl').style.opacity = mkpl.checked ? 1 : .5; };
    mkpl.checked = ls('ppvMkPl') === '1'; pltab.checked = ls('ppvPlTab') === '1'; syncPl();
    mkpl.onchange = () => { ls('ppvMkPl', mkpl.checked ? '1' : '0'); syncPl(); };
    pltab.onchange = () => ls('ppvPlTab', pltab.checked ? '1' : '0');
    const vid = $('#ppv-vid'); vid.checked = ls('ppvVid') === '1'; vid.onchange = () => ls('ppvVid', vid.checked ? '1' : '0');
    const sect = $('#ppv-sect'); sect.checked = ls('ppvSect') === '1';
    sect.onchange = () => { ls('ppvSect', sect.checked ? '1' : '0'); const A = window.__ppApi; A && A.setStemSections && A.setStemSections(sect.checked); };
    { const A = window.__ppApi; A && A.setStemSections && A.setStemSections(sect.checked); }
    gsel.value = ls('ppvGate') || '0'; gsel.onchange = () => ls('ppvGate', gsel.value);
    msel.value = ls('ppvMask') || '0'; msel.onchange = () => ls('ppvMask', msel.value);
    qsel.value = ls('ppvQuality') || '1'; qsel.onchange = () => ls('ppvQuality', qsel.value);
    lsel.onchange = () => { ls('ppvLevel', lsel.value); syncCust(); showLv(); refresh(); };
    // ---- Custom level controls (stored as JSON under ppvCustom) ----
    const cEl = { th: $('#ppv-c-th'), rest: $('#ppv-c-rest'), rv: $('#ppv-c-rv'), lean: $('#ppv-c-lean'), skip: $('#ppv-c-skip'), smooth: $('#ppv-c-smooth'), wake: $('#ppv-c-wake'), blob: $('#ppv-c-blob'), spin: $('#ppv-c-spin') };
    const cRead = () => ({ threads: +cEl.th.value, rest: +cEl.rest.value, lean: cEl.lean.checked, skip: cEl.skip.checked, smooth: cEl.smooth.checked, wake: cEl.wake.checked, blob: cEl.blob.checked, spin: cEl.spin.checked });
    const cSave = () => { cEl.rv.textContent = cEl.rest.value; ls('ppvCustom', JSON.stringify(cRead())); showLv(); };
    function syncCust() { $('#ppv-cust').style.display = +lsel.value === 4 ? 'block' : 'none'; }
    { const c = customLoad(); cEl.th.value = String(c.threads); cEl.rest.value = c.rest; cEl.rv.textContent = c.rest; cEl.lean.checked = !!c.lean; cEl.skip.checked = !!c.skip; cEl.smooth.checked = !!c.smooth; cEl.wake.checked = !!c.wake; cEl.blob.checked = !!c.blob; cEl.spin.checked = !!c.spin;
      if (NATIVE) $('#ppv-c-spinl').style.display = 'block';
      $('#ppv-c-thn').textContent = 'This phone reports ' + (navigator.hardwareConcurrency || '?') + ' cores. Auto uses the fast ones only (max 4). More threads is not always faster.';
      Object.values(cEl).forEach(e => { e.onchange = cSave; }); cEl.rest.oninput = cSave; syncCust(); showLv(); }
    const picked = () => [...p.querySelectorAll('#ppv-stems input:checked')].map(i => i.value);
    async function refresh() {
      const lo = !!LV();
      const id = sel.value, saved = (ls('ppvStems_' + id) || 'Vocals,Instrumental').split(',');
      $('#ppv-stems').innerHTML = stemNames(id).map(n => '<label class="ppv-c"><input type="checkbox" value="' + n + '"' + (saved.includes(n) ? ' checked' : '') + '> ' + n + '</label>').join('');
      $('#ppv-stems').querySelectorAll('input').forEach(i => i.onchange = () => ls('ppvStems_' + id, picked().join(',')));
      $('#ppv-spl').style.display = MODELS[id].kind === 'spleeter' ? 'block' : 'none';
      const noGpu = MODELS[id].kind === 'spleeter' || MODELS[id].kind === 'sp4'; $('#ppv-gpu').style.opacity = lo || noGpu ? .4 : 1; gpu.disabled = lo || noGpu;
      const have = await haveModel(id); $('#ppv-del').style.display = have ? 'block' : 'none';
      if (!go.disabled && Date.now() > holdUntil) status(have ? 'Ready' : 'Model not downloaded yet (one time).');
    }
    $('#ppv-x').onclick = () => { p.style.display = 'none'; };
    sel.onchange = () => { ls('ppvModel', sel.value); refresh(); };
    b.onclick = () => { p.style.display = p.style.display === 'block' ? 'none' : 'block'; if (p.style.display === 'block') { mas.opened(); document.getElementById('ppv-mfloat').style.display = 'none'; } refresh(); };
    $('#ppv-del').onclick = async () => { await deleteModel(sel.value); status('Deleted.'); refresh(); };
    let splitting = false;
    async function splitTrack(t) {
      if (splitting || heavyJob) { status('Already splitting or transcribing. Wait for it to finish.'); return; }   // two runs at once is a sure way to run out of memory
      splitting = true; heavyJob = true; go.disabled = true; bar.style.width = '0'; let wl = null;
      if (NATIVE) NP.keepAlive({ on: true }).catch(() => {});
      try {
        if (LV() && LV().wake && navigator.wakeLock) { try { wl = await navigator.wakeLock.request('screen'); } catch (e) {} }
        const id = sel.value, want = picked();
        if (!t) throw new Error('Play or select a track first.');
        if (!want.length) throw new Error('Tick at least one stem.');
        await downloadModel(id, status, !!(LV() && LV().blob));
        let ov = null, maskNote = '';
        if (+msel.value) {
          try { const al = await alignedCues(t, { strength: +sl.value, lv: LV() }, status); if (al) { ov = al.cues; maskNote = ' Whisper re-timed ' + al.matched + ' of ' + al.total + ' lyric lines' + (al.cached ? ' (saved from before).' : '.'); } }
          catch (e) { console.warn('Whisper timing failed', e); maskNote = ' Whisper timing failed (' + errText(e) + '), so line lengths were estimated.'; }
        }
        status('Decoding audio…');
        let pcm = NATIVE && ['spleeter2', 'spleeter4', 'mdx_voc', 'demucs4', 'demucs6'].includes(id) ? null : await decode(t.url);
        let mask = null, nmask = null;
        if (+msel.value) {
          const dur = pcm ? pcm[0].length / SR : await mediaDur(t.url);   // native engines decode in Java, so ask the media element for the length
          const r = subtitleSpans(t.dbId, +msel.value, dur, loadTags()[t.dbId], ov), lvl = MASKS[+msel.value];
          if (!r.spans) maskNote += r.skip;
          else if (pcm) mask = makeMask(r.spans, +msel.value);
          else nmask = { spans: r.spans, floor: lvl.floor, fade: lvl.fade };   // applied in Java to the finished stems
        }
        const res = await run(id, pcm, want, { strength: +sl.value, gpu: gpu.checked && !LV(), lv: LV(), quality: +qsel.value, gate: +gsel.value, mask, nmask, track: t, nnapi: NATIVE ? nnc.checked : false }, status, f => { bar.style.width = (f * 100) + '%'; status('Separating… ' + Math.round(f * 100) + '%'); });
        pcm = null;
        const files = []; let vidFail = 0;
        for (const n of want) {                                          // encode one at a time, free each stem after
          status('Encoding ' + n + '…'); await tick();
          const e = res[n].blob ? res[n] : encode(res[n]); delete res[n];
          let blob = e.blob, ext = e.ext;
          if (vid.checked && t.kind === 'video') {
            try { blob = await muxVideo(t.url, e.blob, f => status('Adding video to ' + n + '… ' + Math.round(f * 100) + '%')); ext = blob.type.includes('mp4') ? 'mp4' : 'webm'; }
            catch (err) { console.error(err); vidFail++; blob = e.blob; ext = e.ext; }
          }
          files.push(new File([blob], t.title + ' (' + n + ').' + ext, { type: blob.type }));
        }
        videoBlobCache = null; videoBlobFor = null;
        addSplit(files, { srcId: t.dbId, srcTitle: t.title, makePlaylist: mkpl.checked, showInTab: mkpl.checked && pltab.checked });
        status('Done. Added ' + files.length + ' split track' + (files.length > 1 ? 's' : '') + ' to Split tracks' + (mkpl.checked ? ' + a playlist.' : '.') + (window.__ppLastSep || '') + maskNote + (vidFail ? ' ' + vidFail + ' stem' + (vidFail > 1 ? 's' : '') + ' saved as audio only (video failed).' : ''));
      } catch (e) { console.error(e); status('Error: ' + errText(e)); }
      if (NATIVE) NP.keepAlive({ on: false }).catch(() => {});
      wl && wl.release().catch(() => {});
      splitting = false; heavyJob = false; go.disabled = false; refresh();
    }
    go.onclick = () => { const A = window.__ppApi; return splitTrack(A && A.tracks()[A.currentIndex()]); };
    window.__ppSplitTrack = t => splitTrack(t);
    try { smartUI(p, { mas, status, LV, sel, sl, prog: f => { document.querySelectorAll('.ppv-bar-tag i').forEach(e => { e.style.width = (f * 100) + '%'; }); } }); } catch (e) { console.error(e); }
    refresh();
  }
  window.PPVocals = { muxVideo, subtitleSpans, makeMask, alignLines, separate, separateDemucs, fft, _N: N, tagTrack, transcribe, similarTo, loadTags, vibes };
  const boot = () => { try { ui(); } catch (e) { console.error(e); } };
  if (typeof document !== 'undefined' && document.body) boot();
  else if (typeof document !== 'undefined') document.addEventListener('DOMContentLoaded', boot);
})();
