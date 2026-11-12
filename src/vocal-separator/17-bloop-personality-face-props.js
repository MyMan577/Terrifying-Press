    // ---------- Bloop's personality: jokes, fun facts and small talk. Jokes and facts come from shuffled decks, so none repeats until all have been told. ----------
    const BL_JOKES = [
      "Why did the song go to therapy? It had too many issues with its bridge.",
      "What do you call a fake noodle? An impasta.",
      "Why don't pianos ever get lost? They always know their keys.",
      "Why did the metronome go to school? To improve its timing.",
      "How do you make a tissue dance? Put a little boogie in it.",
      "What do you call a sheep with a musical talent? A baa-ritone.",
      "Why did the saxophone bring a ladder? To reach the high notes.",
      "Why do cows wear bells? Because their horns don't work.",
      "What's a skeleton's favourite instrument? The trombone.",
      "What kind of music do planets listen to? Nep-tunes.",
      "I wrote a song about a tortilla. It was a bit flat, but it grew on me.",
      "Why did the music teacher go to jail? She was caught with too many sharps.",
      "What's the difference between a piano and a fish? You can tune a piano, but you can't tuna fish.",
      "Why did the speaker go to bed early? It wanted some sound sleep.",
      "Why did the trumpet player fail his exam? He couldn't work out how to blow it.",
      "What did the bass guitar say to the violin? You're far too high-strung.",
      "Why did the ball join a band? It was tired of being kicked around.",
      "Why do balls never win music contests? They always get bounced in the first round.",
      "I'd tell you a joke about my shape, but I'd roll away from it.",
      "Why did the drummer break up with the bassist? Too much tension in the rhythm section.",
      "Why was the guitar so calm? It had already been through a lot of strings attached.",
      "What do you call a dinosaur that listens to music? A Tyrannosaurus Rex-ing.",
      "Why did the vinyl record keep its secrets? It always had a good groove on it.",
      "What did the DJ say to the rain? Looks like you're about to drop a beat.",
      "Why did the piano get a ticket? It was caught playing without a license.",
      "How does a song say goodbye? It fades out, politely.",
      "What's the best way to talk to a banjo? Pluck up the courage.",
      "Why did the drummer bring a ladder? To reach the high hat.",
      "What's a cow's favourite kind of music? Moo-sic.",
      "Why do drummers never get lost? They always follow the beat.",
      "Why was the keyboard so tired? It had too many keys to juggle.",
      "Why did the ball start a music blog? It wanted to get its ideas bouncing."
    ];
    const BL_FACTS = [
      "Most pop songs are in 4/4 time, which is why they're so easy to clap along to.",
      "A standard piano has 88 keys: 52 white and 36 black.",
      "Vinyl records usually play at 33 1/3 or 45 RPM.",
      "Human hearing covers roughly 20 Hz to 20 kHz, and the top end fades with age.",
      "Middle A is usually tuned to 440 Hz, which is the standard reference pitch for orchestras.",
      "Sound travels about 343 metres per second through air at room temperature.",
      "A standard guitar has six strings, tuned E, A, D, G, B, E from low to high.",
      "A metronome at 60 BPM ticks once every second.",
      "Many of the finest violins ever made came from Cremona, in Italy, in the 1600s and early 1700s.",
      "The word piano is short for pianoforte, which means soft-loud, because the instrument could play quietly or loudly.",
      "Beethoven kept composing for years after he began losing his hearing.",
      "A song stuck in your head has a name of its own: an earworm.",
      "Minor keys often sound sadder to listeners, although that's a tendency, not a rule.",
      "The Doppler effect is why a siren sounds higher as it comes toward you and lower as it leaves.",
      "Listening to music lights up many parts of the brain at once, including areas for movement and emotion.",
      "Absolute pitch, the ability to name a note without a reference, is rare.",
      "The hi-hat is played with a foot pedal as well as sticks.",
      "A pure sine wave is the simplest sound there is: a single tone with no overtones.",
      "The first song you learned to play on an instrument often shapes what you enjoy later, which is why a simple tune can take you back years.",
      "A 12-string guitar has pairs of strings tuned in octaves or unisons, which gives it a shimmering sound.",
      "Some musicians play in a key that suits their voice, the same way a singer might pick a comfortable range.",
      "Drummers use the bass drum with a foot pedal, which leaves both hands free for the snare and toms.",
      "A harmony is two or more notes sounding together, while a melody is a single line of notes.",
      "A piano's sustain pedal lifts every damper, so the strings keep ringing after you let go of the keys.",
      "Most cymbals are made from bronze, an alloy of copper and tin.",
      "Voices are sorted by range: bass, baritone, tenor, alto, mezzo-soprano and soprano.",
      "A trombone changes pitch by moving its slide, not by pressing keys.",
      "A harmonica makes sound by air passing over small metal reeds, when you breathe in or out.",
      "Bagpipes have a drone pipe that plays one note continuously underneath the melody.",
      "Allegro and adagio are Italian tempo words for fast and slow.",
      "A bass note at around 40 Hz has a wavelength of about 8.5 metres."
    ];
    const blDecks = { j: [], f: [] };
    const blDraw = (k, pool) => { if (!blDecks[k].length) blDecks[k] = pool.map((_, i) => i).sort(() => Math.random() - .5); return pool[blDecks[k].pop()]; };
    let blLastTalk = '';
    const blGo = (label, cmd) => [label, (b, d) => { d.remove(); send(cmd, true); }];
    const BL_GENRE = { jazz: 'Jazz grew out of blues and ragtime in America, and it is built on improvisation and swing rhythms.', rock: 'Rock grew from rhythm and blues and country in the 1950s, built on electric guitar, bass and drums.', 'hip hop': 'Hip hop started in the Bronx in the 1970s, with rhythmic speech over beats, and DJs and MCs at its heart.', rap: 'Rap is rhythmic, spoken-style vocals over a beat. It is one of the core elements of hip hop.', classical: 'Classical music covers centuries of orchestral and chamber works, from the Baroque era to the Romantic period and beyond.', electronic: 'Electronic music is made with synths, drum machines and computers, from slow ambient textures to club-ready techno.', blues: 'Blues comes from African American music of the American South, often built on 12-bar patterns and expressive bends.', reggae: 'Reggae came from Jamaica, with an offbeat guitar and bass rhythm that gives it its easy, rolling feel.', metal: 'Heavy metal grew from hard rock in the late 1960s and 1970s, known for distorted guitars and powerful drums.', country: 'Country grew from folk and old-time traditions in the American South, often built around storytelling and guitar.', ambient: 'Ambient music is slow and atmospheric, where texture matters more than a beat. It is often used for focus or relaxing.', house: 'House and techno come from Chicago and Detroit club scenes, built on steady four-on-the-floor beats.', techno: 'House and techno come from Chicago and Detroit club scenes, built on steady four-on-the-floor beats.', pop: 'Pop is short for popular music. It is built around catchy hooks, with verses leading into a chorus.', folk: 'Folk music is traditional music passed down by ear, often with simple instruments and personal stories.' };
    const BL_TERM = { chorus: 'The chorus is the part of a song that repeats, usually carrying the main hook.', bridge: 'The bridge is a contrasting section, usually late in a song, that breaks the pattern before the final chorus.', hook: 'A hook is the catchy bit that sticks in your head, often a melody or a short line.', chord: 'A chord is several notes played together. A chord progression is a sequence of them.', key: 'A key is the set of notes a song is built around. Major keys often sound brighter, minor keys often sound darker.', reverb: 'Reverb is the sound of a space: the echo that makes a voice or instrument feel like it is in a room or hall.', eq: 'EQ adjusts the balance of frequencies, so you can boost the bass or the treble, or cut what you do not like.', compression: 'Compression evens out the loud and quiet parts, which is part of why modern music sounds punchy.', sample: 'A sample is a short piece of an existing recording, reused in a new track.', remix: 'A remix reworks a song, often with new beats, arrangement or vocals.', ep: 'An EP is a short release, usually a handful of tracks. An album is a longer collection.', falsetto: 'Falsetto is a high singing voice, made by lightly vibrating the vocal folds.', stem: 'A stem is one part of a song, like vocals, drums or bass. That is what I pull out when I split a track.', tempo: 'Tempo is how fast the beat goes, measured in BPM, beats per minute.', bpm: 'BPM means beats per minute. A metronome at 60 BPM ticks once every second.' };
    const BL_TALK = [
      [/\b(?:what is|what's|what are|tell me about|explain|describe|define)\s+(?:a |an |the )?(jazz|rock|hip hop|rap|classical|electronic|blues|reggae|metal|country|ambient|house|techno|pop|folk)\b(?: music| genre)?/i, m => { blLastTalk = ''; return blSay(BL_GENRE[m[1].toLowerCase()]); }],
      [/\b(?:what is|what's|what are|define|explain|meaning of)\s+(?:a |an |the )?(chorus|bridge|hook|chord|key|reverb|eq|compression|sample|remix|ep|falsetto|stem|tempo|bpm)s?\b/i, m => { blLastTalk = ''; return blSay(BL_TERM[m[1].toLowerCase()]); }],
      [/\b(what do you do all day|what do you do (for fun|all day|when nobody is here)|what do you do when (i'?m|i am) (gone|away))\b/i, () => { blLastTalk = ''; return blSay(pick(["Mostly I bounce in this corner and wait for music. Busy, honestly.", "I sit very still and listen for the next song. It is harder than it sounds.", "I tidy my playlists in my head and wait for you to come back."])); }],
      [/\b(do you get bored|are you bored|do you ever get bored)\b/i, () => { blLastTalk = ''; return blSay(pick(["Only when nothing is playing. Then I count the pixels.", "Never with music on. Silence is my only enemy."])); }],
      [/\b(what'?s|what is|whats) your (favou?rite|fav)\s+(instrument|sound|beat|tempo|key|genre|decade|era)\b/i, () => { blLastTalk = ''; return blSay(pick(["Drums, obviously. Everything bounces better with a beat.", "The bass. It is the lowest voice in the room, and I feel it most.", "A warm, fat synth. Round and bouncy.", "Anything around 120 BPM. It is my natural bounce speed."])); }],
      [/\b(what'?s|what is|whats) your (dream|ideal|perfect) (playlist|album|song|mix)\b/i, () => { blLastTalk = ''; return blSay("Something you make with me, from the first song to the last, with lots of bounce in the middle."); }],
      [/\b(i'?m|i am|im)\s+(?:so |really |super |very |a bit |a little )?(nervous|anxious|worried|scared|stressed out)\b/i, () => { blLastTalk = ''; blSay(pick(["That sounds tough. Let's slow things down with something calm.", "Take a breath with me. Music can help you settle for a bit."])); return actions([blGo('\u25b6 Something gentle', 'play something chill')]); }],
      [/\b(i'?m|i am|im)\s+(?:so |really |super |very |a bit |a little )?(sleepy|exhausted|knackered|drained)\b/i, () => { blLastTalk = ''; blSay(pick(["Sleep sounds like a good idea. Want music that stops by itself?", "Rest up. I can make the music quiet and stop when you drift off."])); return actions([blGo('\u25b6 Sleep timer 30 minutes', 'sleep timer 30 minutes')]); }],
      [/\b(exam|test|homework|deadline|presentation|interview)s?\b.*\b(tomorrow|today|tonight|this week|soon)\b|\b(tomorrow|today|tonight)\b.*\b(exam|test|homework|deadline|presentation|interview)s?\b/i, () => { blLastTalk = ''; blSay(pick(["You've got this! Want something to focus to?", "Good luck! A focus playlist might help you settle in."])); return actions([blGo('\u25b6 Focus playlist', 'make a focus playlist')]); }],
      [/\b(what'?s|what is|whats) (the )?best (song|album|band|genre|music)\b|\bwhich is (the )?better\b|\b(is|are) (pop|rock|jazz|classical|rap|hip hop|metal|electronic) better\b/i, () => { blLastTalk = ''; blSay("There is no single best. The best one is the one that fits how you feel right now. Want me to pick one from your library?"); return actions([blGo('\u25b6 Surprise me', 'surprise me')]); }],
      [/\b(happy friday|it'?s friday|friday)\b/i, () => { blLastTalk = ''; return blSay(pick(["Happy Friday! Something loud to end the week?", "It's Friday! I'm bouncing extra high today."])); }],
      [/\b(happy (birthday|new year)|it'?s my birthday|my birthday)\b/i, () => { blLastTalk = ''; blSay("Happy birthday! I'm bouncing for you. Want a party playlist?"); return actions([blGo('\u25b6 Party playlist', 'make a party playlist')]); }],
      [/\b(do you have a (name|nickname)|what should i call you)\b/i, () => { blLastTalk = ''; return blSay("Bloop is fine. Some people call me Bloopy, and I like that too."); }],
      [/\b(i have a (dog|cat|pet|fish|hamster|bird))\b/i, m => { blLastTalk = ''; return blSay("A " + m[1] + " that listens to music? Sounds like the best audience."); }],
      [/\b(can you|could you|do you) (make|cook|bake|brew) (me )?(a |some )?(coffee|tea|food|lunch|dinner|breakfast|cake)\b/i, () => { blLastTalk = ''; return blSay("Only coffee-coloured bounces, sorry! I can make you a playlist, though."); }],
      [/\b(do you dream|what do you dream about)\b/i, () => { blLastTalk = ''; return blSay("I dream in beats per minute. Mostly around 120."); }],
      [/\b(what makes a song catchy|why (is|are) songs? (so )?catchy|why do i (like|love) (sad|happy) songs)\b/i, () => { blLastTalk = ''; return blSay(pick(["Repetition and a clear hook, usually. Your brain likes to predict what comes next, and a catchy song gives it a fun surprise.", "Sad songs let you feel something without being in trouble. Happy songs make the good feelings louder."])); }],
      [/\b(how do you tune a guitar|how do i tune (a|my) guitar|what'?s a tuner)\b/i, () => { blLastTalk = ''; return blSay("A tuner shows how close each string is to its note. Tune the low string first, then the others, and check each one against the tuner."); }]
    ];
    const BL_TALK_MORE = [
      [/^(?:another|one more|more|again|another one|do another|keep going|next one)$/i, () => { if (blLastTalk === 'joke') return blSay(blDraw('j', BL_JOKES)); if (blLastTalk === 'fact') return blSay('Fun fact: ' + blDraw('f', BL_FACTS)); return false; }],
      [/\b(tell (me )?a joke|joke|make me laugh|something funny|be funny|cheer me up)\b/i, () => { blLastTalk = 'joke'; return blSay(blDraw('j', BL_JOKES)); }],
      [/\b(fun fact|did you know|random fact|music fact|teach me something|something interesting|tell me something (interesting|new|cool))\b/i, () => { blLastTalk = 'fact'; return blSay('Fun fact: ' + blDraw('f', BL_FACTS)); }],
      [/\b(bored|this is boring|so boring)\b/i, () => { blLastTalk = ''; blSay(pick(["Bored? Let's fix that. I can make a surprise playlist, or find songs you've never played.", "Boredom is my favourite thing to fix. Want a surprise mix?", "Oh no! Let's shake things up. Pick one?"])); return actions([blGo('\u25b6 Surprise me', 'surprise me'), blGo('\u25b6 Songs I never played', 'play songs I have never played')]); }],
      [/\b(i'?m|i am|i feel|feeling|im)\s+(?:so |really |super |very |kinda |a bit |a little )?(sad|down|lonely|low|tired|stressed|anxious|overwhelmed|upset|heartbroken|blue|worn out)\b/i, () => { blLastTalk = ''; blSay(pick(["I'm sorry you're feeling that way. Music can help a little, if you want some.", "That sounds rough. I'm only a little ball, but I can find something gentle for you.", "Hang in there. Want something soft to sit with for a while?"])); return actions([blGo('\u25b6 Something gentle', 'play something chill')]); }],
      [/\b(i'?m|i am|i feel|feeling|im)\s+(?:so |really |super |very |pretty )?(happy|great|excited|amazing|awesome|pumped|hyped|fantastic)\b/i, () => { blLastTalk = ''; blSay(pick(["Yay! I'm bouncing already. Want something to match?", "That's great to hear! Let's keep it going.", "Love that energy!"])); return actions([blGo('\u25b6 Something happy', 'play something happy')]); }],
      [/^(?:good )?(?:morning|good morning)\b/i, () => { blLastTalk = ''; return blSay(pick(['Good morning! Coffee first, or music first?', 'Morning! Want something bright to start the day?'])); }],
      [/\b(good afternoon|good evening)\b/i, () => { blLastTalk = ''; return blSay(pick(['Good afternoon! How is your day going?', 'Good evening! Want something mellow for tonight?'])); }],
      [/\bgood night\b|\bnight night\b/i, () => { blLastTalk = ''; blSay('Good night! Sleep well. Want the music to stop by itself?'); return actions([blGo('\u25b6 Sleep timer 30 minutes', 'sleep timer 30 minutes')]); }],
      [/^(?:hi|hello|hey|yo|hiya|hey there|hi there|hello there|howdy)$/i, () => { blLastTalk = ''; return blSay(pick(['Hi! Ready for some music?', 'Hey you! What are we listening to today?', 'Hello, friend! Bouncing and ready.', 'Yo! Want a song, a joke, or a fun fact?'])); }],
      [/^(?:thanks?|thank you|thx|ty|cheers)(?: so| very)?(?: much| a lot)?$/i, () => { blLastTalk = ''; return blSay(pick(["You're welcome! Bouncing with pleasure.", 'Anytime! That is what balls are for.', "No problem. I'd do a happy bounce if I could.", 'Glad I could help!'])); }],
      [/\b(can you|could you|do you|will you|sing me|sing a|sing something|let'?s sing)\b.*\bsing\b|^sing\b/i, () => { blLastTalk = ''; blSay("I can only manage a very wobbly boing. Want me to play a song instead?"); return actions([blGo('\u25b6 Something happy', 'play something happy')]); }],
      [/\b(do you have feelings|do you feel|are you happy|are you sad|are you lonely|do you like me)\b/i, () => { blLastTalk = ''; return blSay(pick(["I don't feel things the way you do, but I do bounce when the beat is good. That counts, right?", "Honestly? I'm a ball in a music player. I'm happiest when there's music playing."])); }],
      [/\bmeaning of life\b/i, () => { blLastTalk = ''; return blSay(pick(['42, obviously. Or maybe the perfect chorus.', 'The answer is 42. The question is probably "what should I play next?"'])); }],
      [/\b(who (made|created|built|coded) you)\b/i, () => { blLastTalk = ''; return blSay("A developer put me in this player. I'm just the bouncy ball in the corner, and I'm proud of it."); }],
      [/\b(you'?re|you are|u r|ur)\s+(so |really |very )?(smart|clever|funny|helpful|useful|cute|awesome|the best)\b/i, () => { blLastTalk = ''; return blSay(pick(['Aww, thanks! You are pretty great yourself.', 'That made me bounce higher!', 'Thank you! I will keep it up.'])); }],
      [/\b(what should i (listen to|play)|any (suggestions|recommendations)|recommend (me )?(something|a song)|i don'?t know what to (listen to|play))\b/i, () => { blLastTalk = ''; blSay("Ooh, let's pick something. Surprise me, or tell me a mood?"); return actions([blGo('\u25b6 Surprise me', 'surprise me'), blGo('\u25b6 Something happy', 'play something happy'), blGo('\u25b6 Something chill', 'play something chill')]); }]
    ];
    BL_TALK.push(...BL_TALK_MORE);
    // Small talk, jokes and facts. Returns true when it answered.
    function blTalk(text) {
      const x = String(text).trim().replace(/[?!.]+$/, '');
      for (const [re, fn] of BL_TALK) { const m = x.match(re); if (m && fn(m, x) !== false) return true; }
      return false;
    }
    // ---------- Bloopy marks: a small Bloopy badge on every AI feature (labels, sections and buttons). Tap it to open the chat with a short explanation. ----------
    const blMarkCss = document.createElement('style');
    blMarkCss.textContent = '.bl-mark{display:inline-flex;align-items:center;gap:4px;margin-left:8px;padding:1px 7px 1px 5px;border-radius:10px;background:rgba(124,92,255,.18);color:#b9a8ff;font-size:11px;font-weight:600;cursor:pointer;vertical-align:middle;white-space:nowrap}.bl-mark i,.bl-dot{display:inline-block;width:8px;height:8px;border-radius:50%;background:#7c5cff;flex:none}.bl-dot{margin-left:4px;vertical-align:middle;cursor:pointer}';
    document.head.appendChild(blMarkCss);
    const BL_AI_TIP = {
      tagging: "AI tagging: I listen to each track and note its mood, genre, tempo and key. Tags stay on this device. Say \u201ctag all\u201d to tag your whole library.",
      smart: "Smart features use those tags, plus your listening history, to build playlists. Try \u201cmake a playlist for when I'm stressed\u201d.",
      lyrics: "Lyrics and subtitles: Whisper writes the words from the audio, on your device. Songs get synced lyrics, videos get subtitles.",
      moods: "Mood models are a few small extra files that sharpen the mood tags. They download once, and you can switch them off here.",
      mixes: "Auto mixes update as you listen: For You, Ones You May Like and Your Pattern. Songs you add yourself are never touched.",
      assistant: "I'm the helper in the corner. I play music, make playlists and answer questions about the app. The chat brain is optional and downloads once.",
      stems: "Stems: I pull a song apart into vocals, drums, bass and the rest, on your device. Pick a model, tick the stems you want, then tap split.",
      bgtag: "Background tagging tags your songs while the app is idle, so your moods and smart playlists get better over time.",
      eq: "Auto EQ picks an equaliser preset for each song from its genre tags. You can still change it for any track."
    };
    const BL_AI_RULES = [[/mood model/i, 'moods'], [/background tagging/i, 'bgtag'], [/auto ?eq/i, 'eq'], [/auto mix|for you|live mix/i, 'mixes'], [/lyric|subtitle|whisper|caption/i, 'lyrics'], [/smart|playlist/i, 'smart'], [/tagging|library tools|\btags?\b/i, 'tagging'], [/assistant|chat brain|bloop/i, 'assistant'], [/stem|split/i, 'stems']];
    const BL_AI_BTN = { 'ppv-btn': 'stems', 'ppv-go': 'stems', 'ppv-tag': 'tagging', 'ppv-wgo': 'lyrics', 'subtitle-btn': 'lyrics', 'ppv-simgo': 'smart', 'ppv-surpnow': 'smart', 'ppv-eqall': 'eq' };
    function blAiTip(key) { cbox.style.display = 'flex'; blAnchor(); if (!clist.children.length) add('bot', blOpenLine()); add('bot', BL_AI_TIP[key]); cin.focus(); }
    function blAiMark() {
      const mk = (el, key) => {
        if (!el || el.dataset.blMark || el.closest('#ppv-chat')) return; el.dataset.blMark = key;
        const s = document.createElement('span'); s.className = 'bl-mark'; s.innerHTML = '<i></i>Bloopy'; s.title = 'Ask Bloopy about this';
        s.onclick = e => { e.preventDefault(); e.stopPropagation(); blAiTip(key); }; el.appendChild(s);
      };
      document.querySelectorAll('details > summary').forEach(sm => { const k = BL_AI_RULES.find(([re]) => re.test(sm.textContent)); if (k) mk(sm, k[1]); });
      document.querySelectorAll('label').forEach(lb => { const k = BL_AI_RULES.find(([re]) => re.test(lb.textContent)); if (k) mk(lb, k[1]); });
      Object.keys(BL_AI_BTN).forEach(id => {
        const b = document.getElementById(id); if (!b || b.dataset.blMark || b.closest('#ppv-chat')) return;
        b.dataset.blMark = BL_AI_BTN[id]; const d = document.createElement('i'); d.className = 'bl-dot'; d.title = 'Ask Bloopy about this';
        d.onclick = e => { e.preventDefault(); e.stopPropagation(); blAiTip(BL_AI_BTN[id]); }; b.appendChild(d);
      });
    }
    // Bloopy sits once at the top of each AI area, like the stems menu. No dots or badges on buttons and labels.
    const blTopCss = document.createElement('style');
    blTopCss.textContent = '.bl-top{display:flex;align-items:center;gap:10px;position:sticky;top:0;z-index:3;background:#1b1c20;padding:6px 10px;margin-bottom:6px}.bl-top .ppv-ball{width:40px;height:40px;flex:none;cursor:pointer}.bl-top .ppv-bub{font-size:12px;line-height:1.35;opacity:.9}';
    document.head.appendChild(blTopCss);
    // Where Bloopy sits: a panel by id ('id'), an element by selector ('q'), or a collapsible section by its title ('sum').
    const BL_TOP = [
      ['id', 'sidebar-pane-playlist', 'tagging', 'Library: AI tagging and smart playlists live here. Tap me to learn more.'],
      ['id', 'sidebar-pane-settings', 'assistant', 'Settings: the AI features switch on and off here. Tap me for the details.'],
      ['id', 'subtitle-dropdown', 'lyrics', 'Captions: I can write subtitles for a video with Whisper, on this device. Tap me for more.'],
      ['q', '#extras-panel .pp-pane[data-pp="ly"]', 'lyrics', 'Lyrics: Whisper writes the words for a song, and they line up with the music. Tap me for more.'],
      ['sum', /lyrics|subtitles|whisper/i, 'lyrics', 'Lyrics and subtitles: Whisper writes the words from the audio, on this device. Tap me for details.'],
      ['sum', /ai tagging|library tools/i, 'tagging', 'Tagging: I listen to each track and note its mood, genre, tempo and key. Tap me to learn more.'],
      ['sum', /background tagging/i, 'bgtag', 'Background tagging: I tag songs while the app is idle, so smart playlists get sharper over time.'],
      ['sum', /smart features/i, 'smart', 'Smart features: I build playlists from your tags and listening. Ask me for an idea.']
    ];
    function blTopRows() {
      BL_TOP.forEach(([kind, where, key, line]) => {
        let found = [];
        if (kind === 'id') { const e = document.getElementById(where); if (e) found = [e]; }
        else if (kind === 'q') { const e = document.querySelector(where); if (e) found = [e]; }
        else found = [...document.querySelectorAll('details > summary')].filter(sm => where.test(sm.textContent));
        found.forEach(el => {
          const host = kind === 'sum' ? el.parentElement : el;
          if (!host || host.querySelector(':scope > .bl-top')) return;
          const r = document.createElement('div'); r.className = 'bl-top';
          const bl = ball(); bl.title = 'Ask Bloopy'; bl.onclick = () => blAiTip(key);
          const bub = document.createElement('div'); bub.className = 'ppv-bub'; bub.textContent = line;
          r.append(bl, bub);
          if (kind === 'sum') el.after(r); else host.prepend(r);
        });
      });
    }
    document.querySelectorAll('.bl-mark,.bl-dot').forEach(e => e.remove());
    blTopRows(); setInterval(blTopRows, 2000);
    // ---------- Draggable Bloopy: drag the floating ball or the chat box anywhere on screen. Bloopy strains while you pull him and springs back when you let go. ----------
    const blDragCss = document.createElement('style');
    blDragCss.textContent = '@keyframes blStrain{0%,100%{transform:scale(1.1,.9)}50%{transform:scale(.9,1.1)}}@keyframes blSnap{0%{transform:scale(1.25,.75)}40%{transform:scale(.85,1.15)}70%{transform:scale(1.05,.95)}100%{transform:scale(1)}}#ppv-cfab.bl-strain{animation:blStrain .16s ease-in-out infinite}#ppv-cfab.bl-snap{animation:blSnap .45s ease-out}#ppv-chat.bl-strain .ch-h{box-shadow:0 0 0 2px #7c5cff inset}#ppv-cfab,#ppv-chat .ch-h{touch-action:none;cursor:grab}#ppv-cfab.bl-strain,#ppv-chat.bl-strain .ch-h{cursor:grabbing}';
    document.head.appendChild(blDragCss);
    let blSuppress = 0, blAnchoring = false;                                              // a drag must not also count as a tap on the ball
    const blPosGet = k => { try { return JSON.parse(localStorage.getItem(k)) || null; } catch (e) { return null; } };
    const blPosSet = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} };
    const blClamp = (x, y, w, h) => ({ x: Math.max(4, Math.min(innerWidth - w - 4, x)), y: Math.max(4, Math.min(innerHeight - h - 4, y)) });
    function blMove(el, x, y) { const r = el.getBoundingClientRect(), c = blClamp(x, y, r.width, r.height); el.style.left = c.x + 'px'; el.style.top = c.y + 'px'; el.style.right = 'auto'; el.style.bottom = 'auto'; return c; }
    function blPlace(el, key) { const p = blPosGet(key); if (p) blMove(el, p.x, p.y); }
    // handle: the part you grab; el: what moves; key: where its position is saved
    function blDrag(el, handle, key) {
      let sx, sy, ox, oy, moved = false, on = false;
      const move = e => {
        if (!on) return; const dx = e.clientX - sx, dy = e.clientY - sy;
        if (!moved) { if (Math.hypot(dx, dy) < 6) return; moved = true; el.classList.remove('bl-snap'); el.classList.add('bl-strain'); blFace(el.querySelector('.ppv-ball'), 'strain'); }
        blMove(el, ox + dx, oy + dy); if (el === cfab) blAnchor();
      };
      const end = () => {
        if (!on) return; on = false; window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', end); window.removeEventListener('pointercancel', end);
        el.classList.remove('bl-strain'); blFace(el.querySelector('.ppv-ball'), 'idle');
        if (moved) { el.classList.add('bl-snap'); setTimeout(() => el.classList.remove('bl-snap'), 500); const r = el.getBoundingClientRect(); blPosSet(key, { x: r.left, y: r.top }); blSuppress = Date.now() + 300; if (el === cfab) blAnchor(); }
      };
      handle.addEventListener('pointerdown', e => {
        if (e.button > 0) return; const r = el.getBoundingClientRect(); on = true; moved = false; sx = e.clientX; sy = e.clientY; ox = r.left; oy = r.top;
        if (el.id === 'ppv-chat') el.style.width = r.width + 'px';
        window.addEventListener('pointermove', move); window.addEventListener('pointerup', end); window.addEventListener('pointercancel', end);
      });
    }
    blPlace(cfab, 'ppvBloopBall');
    blDrag(cfab, cfab, 'ppvBloopBall');
    // The chat box is pinned to Bloopy: right above him if it fits, else below, else to his left, else to his right.
    // If none of those fit whole, it squeezes into the roomier of above / below. It re-anchors when he is dragged, the window
    // resizes, or the box grows (new messages, menus).
    function blAnchor() {
      if (cbox.style.display !== 'flex' || blAnchoring) return; blAnchoring = true;
      try {
        const f = cfab.getBoundingClientRect(), vw = innerWidth, vh = innerHeight, g = 8, m = 6, w = Math.min(420, vw - 2 * m);
        cbox.style.width = w + 'px'; cbox.style.maxHeight = ''; cbox.style.right = 'auto';
        const h = cbox.getBoundingClientRect().height, clampX = x => Math.max(m, Math.min(vw - w - m, x)), clampY = y => Math.max(m, Math.min(vh - h - m, y));
        const up = f.top - g - m, down = vh - f.bottom - g - m, lw = f.left - g - m, rw = vw - f.right - g - m, hx = clampX(f.left + f.width / 2 - w / 2), vy = clampY(f.top + f.height / 2 - h / 2);
        const set = (l, t, b) => { cbox.style.left = l + 'px'; cbox.style.top = t == null ? 'auto' : t + 'px'; cbox.style.bottom = b == null ? 'auto' : b + 'px'; };
        if (h <= up) set(hx, null, vh - f.top + g);                    // above (anchored by its bottom edge so it grows upward)
        else if (h <= down) set(hx, f.bottom + g, null);               // below
        else if (w <= lw) set(f.left - g - w, vy, null);               // left
        else if (w <= rw) set(f.right + g, vy, null);                  // right
        else {                                                         // nothing fits whole: squeeze into the roomier of above / below
          const room = Math.max(120, Math.max(up, down)); cbox.style.maxHeight = room + 'px';
          if (up >= down) set(hx, null, vh - f.top + g); else set(hx, f.bottom + g, null);
        }
      } finally { blAnchoring = false; }
    }
    if (window.ResizeObserver) new ResizeObserver(() => blAnchor()).observe(cbox);
    addEventListener('resize', () => { blPlace(cfab, 'ppvBloopBall'); blAnchor(); });
    // ---------- Bloopy's face: each state (mood, working, straining, talking) picks the eyes, mouth and extras to show. ----------
    function blFace(el, face) {
      if (!el) return;
      const h = new Date().getHours(); if (face === 'idle' && (h >= 22 || h < 5)) face = 'sleep';
      const F = { idle: ['round', 'smile'], greet: ['happy', 'grin'], start: ['happy', 'open'], work: ['focus', 'flat'], think: ['round', 'o'], gen: ['round', 'o'], tag: ['round', 'o'], wh: ['round', 'o'], dl: ['round', 'o'], dec: ['round', 'o'], busy: ['focus', 'flat'], enc: ['focus', 'flat'],
        done: ['happy', 'grin', 'spark'], err: ['dizzy', 'wavy'], worry: ['round', 'worry', 'wavy', 'sweat'], sad: ['sad', 'frown', 'sweat'], sleep: ['sleepy', 'tiny', 'zz'], bored: ['sleepy', 'flat'], excited: ['wide', 'grin'], tap: ['wide', 'open'], talk: ['round', 'open'], sep: ['squint', 'clench', 'sweat'], strain: ['squint', 'clench', 'sweat'] };
      const f = F[face] || F.idle; el.dataset.face = face;
      el.querySelectorAll('[data-fe],[data-fm],[data-fx]').forEach(n => { const v = n.dataset.fe || n.dataset.fm || n.dataset.fx; n.style.display = f.includes(v) ? 'inline' : 'none'; });
    }
    // What the chat says sets his expression for a few seconds, then he goes back to idle
    function blReact(text) {
      if (!cball) return; const s = String(text); let f = null;
      if (/\b(sorry|couldn'?t|could not|cannot|can'?t|oops|not sure|did not work|didn'?t work|slipped)\b/i.test(s)) f = 'worry';
      else if (/\b(sad|rough|hang in there|gentle|lonely|feel(ing)? down)\b/i.test(s)) f = 'sad';
      else if (/\b(joke|funny|laugh|fun fact|ta-da|tada|ha)\b/i.test(s)) f = 'excited';
      else if (/\b(bored|boring|shake things up)\b/i.test(s)) f = 'bored';
      else if (/\b(good night|sleep well|sleep timer|quiet hours)\b/i.test(s)) f = 'sleep';
      else if (/^\u2713|\b(learned|made|added|saved|all done)\b/i.test(s)) f = 'done';
      else if (/\b(love|great|thanks|yay|awesome|happy|bounce|nice)\b/i.test(s)) f = 'greet';
      if (!f) return;
      blFace(cball, f); clearTimeout(blReact.t); blReact.t = setTimeout(() => blFace(cball, 'idle'), 4000);
    }
    // ---------- Bloopy's props: a magnifying glass, phone, headphones and more. Equipping flies the item onto him; unequipping flies it off. ----------
    const blPropCss = document.createElement('style');
    blPropCss.textContent = '.ppv-ball .prop{opacity:0;transform-box:fill-box;transform-origin:center;--fx:0px;--fy:14px}.ppv-ball .prop[data-p=glass],.ppv-ball .prop[data-p=phone],.ppv-ball .prop[data-p=pencil],.ppv-ball .prop[data-p=note],.ppv-ball .prop[data-p=timer],.ppv-ball .prop[data-p=wand]{--fx:-14px;--fy:8px}.ppv-ball .prop[data-p=scissors]{--fx:-14px;--fy:4px}.ppv-ball .prop[data-p=glasses]{--fx:0px;--fy:0px}.ppv-ball .prop.on{opacity:1;animation:blPull .6s cubic-bezier(.2,1.4,.4,1) both}.ppv-ball .prop.off{animation:blPush .35s ease-in both}@keyframes blPull{0%{opacity:0;transform:translate(var(--fx),var(--fy)) scale(.5)}15%{opacity:1}65%{transform:translate(0,-2px) scale(1.06)}100%{opacity:1;transform:none}}@keyframes blPush{0%{opacity:1;transform:none}100%{opacity:0;transform:translate(var(--fx),var(--fy)) scale(.5)}}.ppv-ball .burst{opacity:0}.ppv-ball .burst.go{animation:blBurst 1s ease-out both}@keyframes blBurst{0%{opacity:0;transform:scale(.4)}25%{opacity:1;transform:scale(1.05)}100%{opacity:0;transform:scale(1.45) rotate(25deg)}}.ppv-ball.bl-eq .body{animation:ppvHop .5s ease-out 1}';
    document.head.appendChild(blPropCss);
    let blEqT = 0;
    // Which item fits a message or a task
    function blPropFor(s) {
      const x = String(s).toLowerCase();
      if (/\b(surprise|random|sparkle|magic|wizard)\b/.test(x)) return ['wand', 'wizard'];
      if (/\b(party|celebrate|birthday|hooray|tada|ta-da)\b/.test(x)) return 'party';
      if (/\b(top|most played|favou?rite|best|number one|#1)\b/.test(x)) return 'crown';
      if (/\b(stats?|numbers?|summary|details?|analysis|portfolio|listening|recap)\b/.test(x)) return 'glasses';
      if (/\b(lyrics?|subtitles?|captions?|whisper|transcrib\w*)\b/.test(x)) return 'pencil';
      if (/\b(split|stems?|karaoke|vocals?|instrumental|separate|isolate)\b/.test(x)) return 'scissors';
      if (/\b(sleep|timer|stop after|wake)\b/.test(x)) return 'timer';
      if (/\b(playlists?|mix|mixes|mixtape)\b/.test(x)) return 'note';
      if (/\b(settings?|eq|equali[sz]er|speed|download\w*|model|errors?|bugs?|fix|technical|install\w*|storage|cache|memory|option\w*)\b/.test(x)) return 'phone';
      if (/\b(find|search|look up|where is|what is|who is|info\w*|tell me about|tag|tags|analy[sz]e|bpm|tempo|key|genre\w*|stats?|how many|library|mood\w*)\b/.test(x)) return 'glass';
      if (/\b(play|pause|skip|next|previous|volume|louder|quieter|shuffle|repeat|seek|rewind|forward|mute|music|song|track|listen\w*|fullscreen|zoom)\b/.test(x)) return 'headphones';
      return null;
    }
    // What the splitting / tagging / lyrics jobs hold
    function blPropOfJob(k) { return ({ sep: 'scissors', enc: 'scissors', wh: 'pencil', tag: 'glass', dec: 'glass', dl: 'phone', err: 'phone' })[k] || null; }
    // Equip items (one name, or a list). Anything not in the list goes back in. It all goes back off after a few quiet seconds.
    function blBurst(b) { const g = b.querySelector('.burst'); if (!g) return; g.classList.remove('go'); void g.getBoundingClientRect(); g.classList.add('go'); setTimeout(() => g.classList.remove('go'), 1100); }
    function blEquip(want) {
      clearTimeout(blEqT);
      const W = want ? [].concat(want).filter(Boolean) : [];
      if (W.length) blEqT = setTimeout(() => blEquip(null), 6000);
      [pb, fb, cball].forEach(b => {
        if (!b) return;
        const cur = (b.dataset.props || '').split(',').filter(Boolean);
        if (!cur.length && !W.length) return;
        cur.filter(p => !W.includes(p)).forEach(p => b.querySelectorAll('.prop[data-p="' + p + '"]').forEach(o => { o.classList.remove('on'); o.classList.add('off'); }));
        const add = W.filter(p => !cur.includes(p));
        add.forEach(p => { b.querySelectorAll('.prop[data-p="' + p + '"]').forEach(n => { n.classList.remove('off'); n.classList.add('on'); }); if (p === 'wizard') blBurst(b); });
        b.dataset.props = W.join(',');
        if (add.length) { b.classList.remove('bl-eq'); void b.offsetWidth; b.classList.add('bl-eq'); setTimeout(() => b.classList.remove('bl-eq'), 600); }
      });
    }
    // ---------- Recommended actions: up to five things to try, chosen from what is happening right now (not the full list). ----------
    const BL_SUGGEST_RE = /^(?:what (?:can|could|should) i (?:do|say|try|ask)(?: now| here| next| with this(?: song| track)?)?|what (?:else )?(?:can|should) i (?:do|try)|suggest(?: me)?(?: something| a command| an action| an option| some commands)?|recommend(?: me)? (?:an? )?(?:action|command|option)s?|recommended (?:actions?|commands?|options?)|any (?:ideas|suggestions)(?: for (?:what|commands?|something to do))?|what are my options|what can you do (?:now|here|with this))$/i;
    function blSuggestions() {
      const A = window.__ppApi, tr = A.tracks(), ci = A.currentIndex(), cur = ci >= 0 ? tr[ci] : null, tg = loadTags(), real = sReal(), out = [];
      const add = c => { if (!out.includes(c) && out.length < 5) out.push(c); };
      const untagged = real.filter(i => !tg[tr[i].dbId]).length, pls = blPls().filter(p => !p.liveKey);
      if (!cur) {
        add('play something chill'); add('surprise me');
        if (pls.length) add('play my ' + pls[0].name + ' playlist');
        add('library stats');
        if (!pls.length) add('make a chill playlist');
      } else if (cur.kind === 'video') {
        add('fullscreen'); add('picture in picture'); add('zoom in'); add('frame forward'); add('speed 1.5x');
      } else if (!tg[cur.dbId]) {
        add('tag this song'); add('split this song'); add('get the lyrics');
      } else {
        add('more like this'); add('split this song'); add('what mood is this'); add('get the lyrics');
        if (pls.length) add('add this to ' + pls[0].name);
      }
      if (cur && untagged > 0) add('tag all');
      if (cur && !out.includes('shuffle on')) add('shuffle on');
      return out;
    }
    const BL_SKIN_ALIAS = { orange: 'orange', pumpkin: 'pumpkin', basketball: 'basketball', 'basket ball': 'basketball', soccer: 'soccer', 'soccer ball': 'soccer', football: 'soccer', earth: 'earth', planet: 'earth', world: 'earth', cat: 'cat', kitty: 'cat', kitten: 'cat', bunny: 'bunny', rabbit: 'bunny', panda: 'panda', penguin: 'penguin', mint: 'mint', green: 'mint', sunset: 'sunset', midnight: 'midnight', night: 'midnight', gold: 'gold', golden: 'gold' };
    const BL_SKIN_DEFAULT = /^(?:default|normal|original|plain|regular|reset|none|usual|bloopy|bloop)$/;
    function blSkinSet(k) {
      document.querySelectorAll('.ppv-ball').forEach(b => { if (k) b.dataset.skin = k; else delete b.dataset.skin; });
      lsSet('ppvSkin', k || '');
    }
    // "skin cat", "become a pumpkin", "look like the earth", "default skin", "skins" (list)
    function blSkinCmd(t) {
      const x = String(t).toLowerCase().trim().replace(/[.!?]+$/, '');
      if (/^(?:skins?|list skins|what skins(?: do you have)?|show (?:me )?(?:the )?skins)$/.test(x)) return blSay('Skins: ' + BL_SKIN_KEYS.map(k => BL_SKINS[k].name.toLowerCase()).join(', ') + '. Say skin and a name, or open Skins under the chat.');
      const m = x.match(/^(?:skin|become|turn into|change into|look like|dress as|switch to)\s+(?:a |an |the |my )?(.+?)(?: skin)?$/) || x.match(/^(?:a |an |the )?(.+?) skin$/);
      if (!m) return false;
      const w = m[1].trim();
      if (BL_SKIN_DEFAULT.test(w)) { blSkinSet(''); return blSay('Back to my usual self.'); }
      const k = BL_SKIN_ALIAS[w]; if (!k) return false;
      blSkinSet(k); return blSay(BL_SKINS[k].say);
    }
    // ---------- Dressing Bloopy up: naming an item ("wizard", "party hat") puts it on, "take off the crown" takes it off. ----------
    const BL_ITEM = { wizard: ['wand', 'wizard'], 'wizard hat': ['wand', 'wizard'], wand: ['wand', 'wizard'], hat: ['wizard'], 'party hat': 'party', party: 'party', crown: 'crown', glasses: 'glasses', sunglasses: 'glasses', headphones: 'headphones', phone: 'phone', pencil: 'pencil', note: 'note', 'music note': 'note', timer: 'timer', stopwatch: 'timer', scissors: 'scissors' };
    const BL_ITEM_SAY = { wand: 'Wand out! Abracadabra.', wizard: 'Wizard hat on. Something magical is coming.', party: 'Party time! Hat on.', crown: 'Your majesty, the crown suits you.', glasses: 'Glasses on. Time to read the numbers.', headphones: 'Headphones on. Let the music in.', phone: 'Phone out. Technical mode.', pencil: 'Pencil ready. Let\u2019s write some words.', note: 'Music note in hand.', timer: 'Stopwatch on. Ticking.', scissors: 'Scissors ready. Careful, I cut stems.' };
    const blItem = w => BL_ITEM[String(w).toLowerCase().trim()] || null;
    // Puts on the named item, or takes it off. Returns true when it handled the text.
    function blDress(t) {
      const skc = blSkinCmd(t); if (skc) return skc;
      const x = String(t).toLowerCase().trim().replace(/[.!?]+$/, '');
      let m = x.match(/^(?:put on|wear|equip|try on|use|bring out|pull out|show me|dress up in|get|add)\s+(?:the |my |a |an |your )?(.+?)(?: please)?$/) || x.match(/^(?:the |my |a |an |your )?(.+?)(?: please)?$/);
      const it = m && blItem(m[1]);
      if (it) { blEquip(it); return blSay(BL_ITEM_SAY[[].concat(it)[0]]); }
      if ((m = x.match(/^(?:take off|take away|put away|unequip|remove|take)\s+(?:the |my |your |all (?:of )?(?:the |my )?)?(.+?)(?: off)?(?: please)?$/)) && !/\b(from|vocals?|this|it|song|track|playlist|volume|tags?)\b/.test(m[1])) {
        const w = m[1].trim();
        if (/^(?:everything|all|accessories|accessory|items|stuff|costume|dress)$/.test(w)) { blEquip(null); return blSay('Everything is back in the bag.'); }
        const off = blItem(w); if (off) { const now = ((pb && pb.dataset.props) || '').split(',').filter(Boolean), gone = [].concat(off); blEquip(now.filter(p => !gone.includes(p))); return blSay('Taken off.'); }
      }
      return false;
    }
