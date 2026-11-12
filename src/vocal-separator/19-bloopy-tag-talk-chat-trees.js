    // ---------- Tag talk: answers about moods, genres and instruments come straight from the tags, never from the AI ----------
    const tagLine = t => { const c = loadTags()[t.dbId]; if (!c) return ''; const g = (c.gn || []).slice(0, 2).map(v => v[0]), mo = (c.md || []).slice(0, 2).map(v => v[0]);
      return vibes(c).join(', ') + (c.bpm ? ', ' + c.bpm + ' BPM' : '') + (c.key ? ', ' + c.key + (c.ck ? ' ' + c.ck : '') : '') + (g.length ? '; genre: ' + g.join(', ') : '') + (mo.length ? '; mood: ' + mo.join(', ') : ''); };
    // 'sad or chill' = either; 'sad and slow' (default) = both.
    function findVibe(ws, any) { if (!any || ws.length < 2) return findTracks(ws); const seen = new Set(), out = []; ws.forEach(w => findTracks([w]).forEach(i => { if (!seen.has(i)) { seen.add(i); out.push(i); } })); return out; }
    function tagTalk(text) {
      const A = window.__ppApi; if (!A) return false;
      const x = String(text).trim().replace(/[?!.]+$/g, ''), tg = loadTags(), say = z => { add('bot', z); return true; };
      const cu = A.currentIndex() >= 0 ? A.tracks()[A.currentIndex()] : null;
      const askTag = t => { add('bot', '\u201c' + t.title + '\u201d is not tagged yet, so I do not know. Want me to tag it?'); actions([['Tag this track', (b, d) => { d.remove(); agent('tag this song'); }]]); return true; };
      const kind = /^(?:what|which) genres? (?:is|are)(?: in)? (?:this|it)(?: song| track)?$|^what'?s (?:the )?genre of (?:this|it)(?: song| track)?$|^what genre is (?:this|it)(?: song| track)?$/i.test(x) ? 'g'
        : /^(?:what|which) instruments? (?:are |is )?(?:in|does) (?:this|it)(?: song| track)?(?: have| use)?$|^what instruments (?:are )?(?:used|playing)(?: in (?:this|it))?$/i.test(x) ? 'i'
        : /^(?:tell me about|describe|what do you know about|what are the tags (?:of|for)|show (?:me )?(?:the )?tags (?:of|for)|what'?s (?:the )?(?:info|tags|details) (?:of|for|on))(?: this| it| the current)(?: song| track)?$/i.test(x) ? 'a' : '';
      if (kind) {
        if (!cu) return say('Play or pick a track first.'); const c = tg[cu.dbId]; if (!c) return askTag(cu);
        if (kind === 'g') { const g = (c.gn || []).slice(0, 3).map(v => v[0] + ' (' + v[1] + '%)'); return say(g.length ? 'Genre: ' + g.join(', ') + '.' : 'The tagger did not find a clear genre for this one.'); }
        if (kind === 'i') { const n = (c.in || []).slice(0, 5).map(v => v[0]); return say(n.length ? 'Instruments I hear: ' + n.join(', ') + '.' : 'I did not pick up clear instruments in this one.'); }
        return say('\u201c' + cu.title + '\u201d: ' + tagLine(cu) + '.');
      }
      let m;
      if ((m = x.match(/^is (?:this|it)(?: song| track)? (?:a |an |very |really )?(\w+)(?: song| track)?$/i))) {
        const w = vibeWordsOf(m[1])[0]; if (w) { if (!cu) return say('Play or pick a track first.'); const c = tg[cu.dbId]; if (!c) return askTag(cu); const ok = vibes(c).includes(w); return say(ok ? 'Yes, it is tagged ' + w + '.' : 'No, it is not tagged ' + w + '. Its tags: ' + vibes(c).join(', ') + '.'); }
      }
      // "any moody songs?", "what sad songs do I have", "give me some chill music"
      if ((/^(?:what|which|any|do i have|have i got|got any|show|list|give me|tell me|recommend|suggest|find|are there|is there|name|got|something|songs?|music|tracks?|tunes?|i need|i want|i'd like|i would like|need|want|can you (?:find|show|suggest|recommend))\b/i.test(x) || /^(?:[\w-]+\s+){0,4}(?:songs?|tracks?|music|tunes?)$/i.test(x)) && (/\b(songs?|tracks?|music|tunes?|jams?)\b/i.test(x) || /\b(listen to|something (to|for)|put on)\b/i.test(x))) {
        const ws = vibeWordsOf(x); if (!ws.length) return false; const anyOf = /\b(or|either)\b/i.test(x);
        const S = tagStats(); if (!S.tagged.length) { add('bot', 'None of your tracks are tagged yet, so I cannot tell what is ' + ws.join(' ') + '. Want me to tag your library?'); actions([['Tag my library', (b, d) => { d.remove(); agent('tag all'); }]]); return true; }
        const r = findVibe(ws, anyOf), tr = A.tracks(), note = S.left > 0 ? ' (' + S.tagged.length + ' of ' + S.real.length + ' tracks are tagged)' : '';
        if (!r.length) return say('None of your tagged tracks are ' + ws.join(' ') + note + '.');
        add('bot', r.length + ' ' + ws.join(' ') + ' track' + (r.length === 1 ? '' : 's') + note + ':\n' + r.slice(0, 8).map(i => tr[i].title + (tr[i].artist ? ' \u2013 ' + tr[i].artist : '')).join('\n') + (r.length > 8 ? '\n\u2026and ' + (r.length - 8) + ' more' : ''));
        actions([['\u25b6 Play ' + (r.length > 1 ? 'them' : 'it'), () => { const q = r.slice(0, 30); A.play(q[0], q); }]]); return true;
      }
      return false;
    }
    // Facts handed to the chat AI with each message, so it talks about YOUR tracks and tags instead of making things up.
    function groundCtx(text) {
      const A = window.__ppApi; if (!A) return '';
      const tr = realTr(), tg = loadTags(), cu = A.currentIndex() >= 0 ? A.tracks()[A.currentIndex()] : null, L = [];
      L.push(' LIBRARY DATA (the only facts you may use about the music): ' + tr.length + ' tracks, ' + tr.filter(t => tg[t.dbId]).length + ' tagged.');
      if (cu && tg[cu.dbId]) L.push('Now playing is tagged: ' + tagLine(cu) + '.');
      const ws = vibeWordsOf(text), anyOf = /\b(or|either)\b/i.test(text);
      if (ws.length) { const r = findVibe(ws, anyOf).slice(0, 5), all = A.tracks(); L.push(r.length ? 'Tracks that are ' + ws.join(' ') + ': ' + r.map(i => all[i].title + (all[i].artist ? ' by ' + all[i].artist : '') + ' (' + tagLine(all[i]) + ')').join('; ') + '.' : 'No tagged tracks are ' + ws.join(' ') + '.'); }
      blNamed(text).forEach(i => { const x = A.tracks()[i]; L.push('Named track ' + x.title + (x.artist ? ' by ' + x.artist : '') + ': ' + (loadTags()[x.dbId] ? tagLine(x) : 'not tagged yet') + '.'); });
      L.push('Never invent song names, artists, tags or moods. Only name tracks listed here. If the answer is not here, say you do not know and suggest tagging.');
      return L.join(' ');
    }
    // ---------- Long, branching chats ("trees") ----------
    // Mood talks that go many steps deep. Each step is a short Bloopy message with tap-to-answer buttons, and typed replies work too
    // (yes / no, a button's words, or keywords like work, friend, lonely). Choices are remembered (blTr.ctx) and some steps run a
    // music command and then carry on ("How is it landing?"). Say stop at any time to leave. Safety phrases are caught before this runs.
    let blTr = null;                                                  // { id, ctx, bad, busy, timer }
    /*TREE-DATA-START*/
    const bg = (l, n, set) => [l, n, set], bc = (l, cmd, then) => [l, '>' + cmd, then], bm = (l, cmd, then) => bc('\u25b6 ' + l, cmd, then);
    const BL_T = {}, bnode = (id, t, o, x) => { BL_T[id] = Object.assign({ t, o: o || [] }, x || {}); };
    const CHK = () => [bg('A bit better', 'wrap_better'), bg('About the same', 'wrap_same'), bg('Worse', 'wrap_worse')];
    // ----- shared endings -----
    bnode('wrap', "Thanks for talking with me. How are you feeling compared to when we started?", CHK());
    bnode('wrap_better', "I'm really glad. Small bounces count. Want a song to lock that in?", [bm('Something happy', 'play something happy', 'bye'), bg('No thanks', 'bye')]);
    bnode('wrap_same', "That's okay. Not everything shifts in one chat. Want gentle music going in the background?", [bm('Gentle music', 'play something chill', 'bye'), bg('No thanks', 'bye')]);
    bnode('wrap_worse', "I'm sorry. I'm a small ball and can only do so much. If it feels heavy, please talk to someone you trust today, like a friend, a family member or a professional. Would quiet music help while you reach out?", [bm('Quiet music', 'play something chill', 'bye_trust'), bg('I will reach out', 'bye_trust'), bg('Not right now', 'bye_trust')]);
    bnode('bye_trust', "Please do reach out, even with one short message. If you ever feel unsafe, contact your local emergency number or a crisis line right away. I'm here too.", [], { end: [['\u25b6 Something chill', 'play something chill'], ['Keep talking', 'I feel down']] });
    bnode('bye', "I'm here any time. Tell me how you're feeling and we'll pick it up again.", [], { end: [['Talk about how I feel', 'I feel down'], ['\u25b6 Surprise me', 'surprise me'], ['\u25b6 Something chill', 'play something chill'], ['What can you do?', 'help']] });
    // ----- SAD / rough day -----
    bnode('s0', "I'm sorry you're feeling that way. Do you want to talk it through a bit, or would you rather just have some music?", [bg('Talk it through', 's_talk'), bg('Just music', 's_music'), bg('Not sure', 's_unsure')]);
    bnode('s_rough', "Rough days are the worst. Want to vent about it, or shake it off with music?", [bg('Vent about it', 's_talk'), bg('Shake it off', 's_music'), bg('Both', 's_talk')]);
    bnode('s_pick', "A pick-me-up, coming right up. Want a joke, a fun fact, or happy music?", [bc('A joke', 'tell me a joke', 's_check'), bc('A fun fact', 'fun fact', 's_check'), bm('Happy music', 'play something happy', 's_check')]);
    bnode('s_unsure', "That's okay, you don't have to know. Sometimes a feeling just shows up. Does it feel more heavy, or more flat and empty?", [bg('Heavy', 's_heavy'), bg('Flat and empty', 's_flat'), bg('A mix of both', 's_mixed')]);
    bnode('s_heavy', "Heavy feelings usually mean something matters to you. Do you know where it's coming from?", [bg('Yes, I do', 's_talk'), bg('Not really', 's_noreason'), bg('I would rather have music', 's_music')]);
    bnode('s_flat', "Flat days are real too, even when nothing is technically wrong. Has it been like this for a while, or just today?", [bg('Just today', 's_today'), bg('A while now', 's_while')]);
    bnode('s_mixed', "Mixed is honest. Let's go slowly. Want to start with the part that's loudest right now?", [bg('Yes, start there', 's_talk'), bg('Not now', 's_music')]);
    bnode('s_talk', "Okay, I'm listening. What's it mostly about?", [bg('Something that happened', 's_event', { why: 'what happened' }), bg('Someone', 's_person', { why: 'that person' }), bg('Too much at once', 's_pile', { why: 'everything piling up' }), bg('Nothing in particular', 's_noreason', { why: 'all of that' })],
      { k: [[/work|job|boss|school|exam|homework|college|uni\b|deadline/, 's_work', { why: 'the work stuff' }], [/friend|partner|girlfriend|boyfriend|family|mum|mom|dad|brother|sister|ex\b/, 's_person', { why: 'that person' }], [/lonely|alone|no one|nobody/, 'lo0'], [/tired|sleep|exhaust/, 'ti0']] });
    bnode('s_event', "That kind of thing can sit heavy. Was it today, or a while back?", [bg('Today', 's_today'), bg('A while ago', 's_while')]);
    bnode('s_work', "Work and school stuff follows you everywhere. Is it the pressure, or something someone said?", [bg('The pressure', 's_pressure'), bg('Something someone said', 's_person'), bg('Both', 's_pressure')]);
    bnode('s_pressure', "Pressure makes everything look bigger at night. Is there a deadline coming up, or is it more constant?", [bg('A deadline', 'st_deadline'), bg('It is constant', 'st_constant')]);
    bnode('s_person', "People can hurt the most because we care the most. Is this someone close to you?", [bg('Yes, very', 's_close'), bg('Not that close', 's_notclose')]);
    bnode('s_close', "That's hard. Do you want to fix it, or do you just need to feel it for a bit first?", [bg('Fix it', 's_fix'), bg('Feel it first', 's_feel')]);
    bnode('s_fix', "Fixing usually starts with one small message. Not a big speech, just one honest line. Want to write it later, with a clearer head?", [bg('Yes, later', 's_later'), bg('I would rather not message', 's_feel'), bg('I am not ready', 's_feel')]);
    bnode('s_feel', "That's fair. Feelings pass faster when you let them in the door. Want music that matches the mood, or something that lifts it a little?", [bg('Match it', 's_match'), bg('Lift it', 's_lift')]);
    bnode('s_notclose', "Even small clashes sting, especially on a tired day. Do you think it will matter next week?", [bg('Probably not', 's_prob'), bg('Maybe it will', 's_maybe')]);
    bnode('s_prob', "Then it's a splinter, not a wound. Splinters still hurt. Want a distraction while it fades?", [bg('Yes, distract me', 's_lift'), bg('I will sit with it', 's_feel')]);
    bnode('s_maybe', "Then it deserves a proper think, not tonight's tired version of you. Want to put it on hold and come back to it tomorrow?", [bg('Good idea', 's_later'), bg('I would rather think now', 's_fix')]);
    bnode('s_pile', "When everything lands at once, it's hard to tell which problem is which. Want to pick just one to look at?", [bg('Yes, one thing', 's_one'), bg('No, it is all blurry', 's_blur')]);
    bnode('s_one', "Good. Which one is the loudest right now?", [bg('Work or money', 's_work'), bg('A person', 's_person'), bg('Myself', 's_self'), bg('My health', 's_health')]);
    bnode('s_blur', "Blurry is normal. Try this: name three things that are bothering you, just names, no fixing. Ready?", [bg('Done, I have three', 's_named'), bg('That is too hard', 's_music')]);
    bnode('s_named', "Nice, that's already smaller than the cloud was. Which of the three could you do something about in the next ten minutes?", [bg('One of them', 's_tiny'), bg('None of them', 's_none')]);
    bnode('s_tiny', "Then that's your first move. Ten minutes, nothing more. Want focus music for it?", [bm('Yes, focus music', 'make a focus playlist', 's_check'), bg('I will go quiet', 's_check')]);
    bnode('s_none', "Then the job isn't to solve it, just to get through tonight. That's allowed. Water, a snack, and some slow music?", [bm('Slow music', 'play something chill', 's_check'), bg('I will do the basics', 's_basics_no')]);
    bnode('s_self', "Being hard on yourself is exhausting. What would you say to a friend who felt this way?", [bg('Something kind', 's_kind'), bg('I do not know', 's_dunno')]);
    bnode('s_kind', "Then that kind voice is yours too. Could you say a little of it to yourself tonight?", [bg('I will try', 's_check'), bg('It is hard to believe', 's_dunno')]);
    bnode('s_dunno', "That's okay. It takes practice, and some days it just isn't there. I'm only a ball, but you seem worth being kind to.", [bg('Thank you', 's_check'), bg('Play me something', 's_music')]);
    bnode('s_health', "Health worries are scary, and I can't help with those. A doctor or someone you trust can. Have you been able to talk to anyone?", [bg('Yes, I have', 's_check'), bg('Not yet', 's_trust'), bg('I would rather not', 's_trust')]);
    bnode('s_today', "Today's hurts feel biggest right when they happen. Have you eaten and had some water today?", [bg('Yes', 's_basics_ok'), bg('Not really', 's_basics_no')]);
    bnode('s_while', "Carrying something for a while is tiring. Is it getting lighter, heavier, or staying the same?", [bg('Lighter', 's_lighter'), bg('Heavier', 's_heavier'), bg('The same', 's_same')]);
    bnode('s_lighter', "Slow progress is still progress. What's been helping?", [bg('People', 's_ppl'), bg('Time', 's_time'), bg('Music, mostly', 's_musichelps')]);
    bnode('s_ppl', "Keep those people close. Want to send one of them a quick hello tonight?", [bg('Good idea', 's_check'), bg('Maybe tomorrow', 's_check')]);
    bnode('s_time', "Time does a lot of quiet work. Keep being gentle with yourself while it does.", [bg('Thanks', 's_check')]);
    bnode('s_musichelps', "That makes me bounce. Want me to put on more of what helps?", [bm('Yes, please', 'play something chill', 's_check'), bg('No thanks', 's_check')]);
    bnode('s_heavier', "I'm sorry. Heavier over time is a sign it's worth sharing with someone. Is there one person you trust enough to tell?", [bg('Yes, there is', 's_trust_yes'), bg('No one right now', 's_trust')]);
    bnode('s_same', "Stuck feelings are tiring too. Would a change of scene help, like a walk or some fresh air, even for five minutes?", [bg('Maybe', 's_walk'), bg('I am not up to it', 's_notup')]);
    bnode('s_walk', "Five minutes, your choice of songs. Want something good for walking?", [bm('Yes, walking music', 'play something happy', 's_check'), bg('Later', 's_check')]);
    bnode('s_notup', "Then lie back and let the music do the moving. Something gentle?", [bm('Yes, gentle', 'play something chill', 's_check'), bg('No thanks', 's_check')]);
    bnode('s_basics_ok', "Good, that's a solid base. Would music help, or talking a little more?", [bg('Music', 's_music'), bg('Talk more', 's_talk')]);
    bnode('s_basics_no', "Maybe that's step one. A glass of water and a snack can change a mood more than you'd think. Want gentle music on while you do?", [bm('Yes, gentle music', 'play something chill', 's_check'), bg('I will go do it', 's_check')]);
    bnode('s_music', "Okay, music it is. Should it match the mood, or lift it a little?", [bg('Match it', 's_match'), bg('Lift it', 's_lift'), bm('Surprise me', 'surprise me', 's_after')]);
    bnode('s_match', "Sometimes the sad song is exactly right. Want something gentle that sits with you?", [bm('Yes, gentle', 'play something chill', 's_after'), bg('Actually, lift it', 's_lift')]);
    bnode('s_lift', "Let's nudge it up slowly, not all at once. Start soft and get brighter?", [bm('Start soft', 'play something chill', 's_after_lift'), bm('Straight to bright', 'play something happy', 's_after')]);
    bnode('s_after_lift', "Doing okay with that? Say the word when you want it brighter.", [bm('Brighter please', 'play something happy', 's_after'), bg('This is fine', 's_check')]);
    bnode('s_after', "How is it landing?", [bg('Helping', 's_check'), bg('Not really', 's_other')]);
    bnode('s_other', "Not every song fits. Want to try a different feel, or talk instead?", [bg('Different music', 's_music'), bg('Talk instead', 's_talk')]);
    bnode('s_later', "Okay. I'll be here whenever you want to come back to it. Want anything playing for now?", [bm('Something chill', 'play something chill', 'wrap'), bg('No thanks', 'wrap')]);
    bnode('s_trust', "That's okay for tonight, but heavy things get lighter when shared. It doesn't need to be a big talk. A text like rough day, can you chat, counts. Could you send one?", [bg('Yes, I could', 's_trust_yes'), bg('Maybe', 's_trust_maybe'), bg('I would rather not', 's_trust_no')]);
    bnode('s_trust_yes', "Good. Go for it. I'll keep the music soft while you do.", [bm('Soft music', 'play something chill', 'wrap'), bg('I am good', 'wrap')]);
    bnode('s_trust_maybe', "The offer stays open. A doctor or counselor is also a good option if this keeps going. Want some music now?", [bm('Yes, music', 'play something chill', 'wrap'), bg('No thanks', 'wrap')]);
    bnode('s_trust_no', "Still, if it ever feels like too much, please reach out to someone you trust or a local support line. They exist for exactly this. For now, want to do something small together?", [bm('Gentle music', 'play something chill', 'wrap'), bc('A joke', 'tell me a joke', 's_check')]);
    bnode('s_noreason', "Not every feeling has a reason, and that's fine. Sometimes sleep, food or a long week is the cause. How have you been sleeping?", [bg('Badly', 's_sleep_bad'), bg('Okay', 's_sleep_ok'), bg('Not sure', 's_sleep_ok')]);
    bnode('s_sleep_bad', "That alone can darken everything. Want to sort out tonight's sleep first?", [bg('Yes, sleep first', 'ti_cant'), bg('Not now', 's_music')]);
    bnode('s_sleep_ok', "Good, that helps. Have you moved around or been outside today?", [bg('A little', 's_walk'), bg('Not really', 's_walk')]);
    bnode('s_check', ctx => (ctx.why ? 'Thank you for telling me about ' + ctx.why + '. ' : '') + 'How are you feeling right now?', CHK());
    // ----- STRESS / ANXIETY -----
    bnode('st0', "That sounds like a lot. Is it more racing thoughts, or a tight, tense body?", [bg('Racing thoughts', 'st_think'), bg('Tense body', 'st_body'), bg('Both', 'st_both')]);
    bnode('st_both', "That's the full package. Let's go one at a time. Thoughts first?", [bg('Yes, thoughts first', 'st_think'), bg('Body first', 'st_body')]);
    bnode('st_think', "Racing thoughts need a job. Want to try a quick reset: breathe in for four, out for six, three times?", [bg('Yes, let us try', 'st_breath'), bg('Not now', 'st_tell')]);
    bnode('st_breath', "Okay, go. In for four, out for six, three times, no rush. Tell me when you're done.", [bg('Done', 'st_after_breath')]);
    bnode('st_after_breath', "How did that feel?", [bg('Calmer', 'st_calmer'), bg('About the same', 'st_same'), bg('Harder', 'st_harder')]);
    bnode('st_calmer', "That's your body listening. Want music to keep it going?", [bm('Calm music', 'play something chill', 'st_next'), bg('No thanks', 'st_next')]);
    bnode('st_same', "Sometimes it takes a few rounds. Want to try once more, or write the worries down instead?", [bg('Once more', 'st_breath'), bg('Write them down', 'st_write')]);
    bnode('st_harder', "Slow breathing can feel strange when you're wound up. Skip it. Try this: look around and name five things you can see.", [bg('Done', 'st_ground'), bg('I would rather talk', 'st_tell')]);
    bnode('st_ground', "Nice, that pulls your attention back into the room. Now, what's on your mind?", [bg('Work or school', 'st_deadline'), bg('A person', 's_person'), bg('The future', 'st_future'), bg('Not sure', 'st_next')]);
    bnode('st_body', "Tension hides in the shoulders and jaw. Drop your shoulders, unclench your jaw, take one slow breath. Any better?", [bg('A little', 'st_calmer'), bg('Not really', 'st_move')]);
    bnode('st_move', "Sometimes the body needs to move the stress out. Shake out your hands, roll your shoulders, or walk for a minute. Want music with some pace?", [bm('Yes, some pace', 'play something happy', 'st_next'), bg('I will just stretch', 'st_next')]);
    bnode('st_tell', "Okay. What's weighing on you most?", [bg('A deadline or exam', 'st_deadline'), bg('Something ongoing', 'st_constant'), bg('The future', 'st_future'), bg('A person', 's_person')],
      { k: [[/work|job|boss|exam|test|homework|deadline|project|presentation|interview/, 'st_deadline'], [/future|career|money|rent|bills/, 'st_future'], [/friend|partner|family|mum|mom|dad/, 's_person']] });
    bnode('st_deadline', "Deadlines shrink when you cut them into pieces. When is it due?", [bg('Today or tomorrow', 'st_soon'), bg('This week', 'st_week'), bg('Further out', 'st_far')]);
    bnode('st_soon', "Then we're in triage. Is there one part that matters most?", [bg('Yes, I know which', 'st_focus'), bg('Everything matters', 'st_prior')]);
    bnode('st_prior', "Pick the part worth the most, or the one that unblocks the rest. If you can't tell, start with the easiest piece to get moving. Want focus music?", [bm('Yes, focus music', 'make a focus playlist', 'st_back'), bg('No thanks', 'st_back')]);
    bnode('st_focus', "Good. Do that first, for twenty-five minutes, nothing else. Shall I start focus music?", [bm('Yes, start it', 'make a focus playlist', 'st_back'), bg('I will start now', 'st_back')]);
    bnode('st_week', "A week is enough if you start today. Plan three small steps: today, tomorrow, the day before. Does that feel doable?", [bg('Yes, doable', 'st_focus'), bg('Not really', 'st_prior')]);
    bnode('st_far', "Far-away deadlines still nag. Write the first tiny step down and let your brain put the rest down for now. Want to do that?", [bg('Yes, let us', 'st_write'), bg('Later', 'st_next')]);
    bnode('st_write', "Grab paper or a note. Dump every worry for two minutes, messy is fine. Tell me when you're done.", [bg('Done', 'st_after_write')]);
    bnode('st_after_write', "How does the list look compared to the cloud in your head?", [bg('Smaller', 'st_calmer'), bg('Still big', 'st_circle')]);
    bnode('st_circle', "Circle just one thing. One. The rest can wait until after.", [bg('Circled it', 'st_focus')]);
    bnode('st_constant', "Constant stress wears you down more than one big thing. Are you getting any breaks at all?", [bg('Some', 'st_breaks'), bg('Hardly any', 'st_nobreaks')]);
    bnode('st_breaks', "Protect those. Want a short music break right now?", [bm('Yes, a break', 'play something chill', 'st_back'), bg('Later', 'st_next')]);
    bnode('st_nobreaks', "That's a lot. Could you carve out even ten minutes today that are only for you?", [bg('I will try', 'st_next'), bg('Not really', 's_trust')]);
    bnode('st_future', "The future is mostly guesses wearing a serious face. What's the one thing you're most afraid will happen?", [bg('Failing', 'st_fail'), bg('Losing someone', 's_person'), bg('Not knowing', 'st_unknown')]);
    bnode('st_fail', "Fear of failing means you care. If it did happen, do you think you'd get through it?", [bg('Yes, I would', 'st_surv'), bg('I am not sure', 'st_unsure')]);
    bnode('st_surv', "Right, and you'd probably learn something. Does that shrink it a bit?", [bg('A bit', 'st_calmer'), bg('Not yet', 'st_next')]);
    bnode('st_unsure', "That feeling is common, and it exaggerates. People usually cope better than they expect. Who could help you if it happened?", [bg('Someone could', 'st_calmer'), bg('Nobody', 's_trust')]);
    bnode('st_unknown', "Not knowing is uncomfortable, but it also leaves room for good things. What's one thing you can control today?", [bg('Something small', 'st_focus'), bg('Nothing', 's_none')]);
    bnode('st_next', "Want to keep going, or take a breather with music?", [bg('Keep going', 'st_tell'), bm('A breather', 'play something chill', 'wrap'), bg('I am good for now', 'wrap')]);
    bnode('st_back', "Welcome back. How's the stress feeling now?", CHK());
    // ----- TIRED / CAN'T SLEEP -----
    bnode('ti0', "Sounds like your battery is low. Is it a sleepy kind of tired, or drained from everything?", [bg('Sleepy', 'ti_sleepy'), bg('Drained', 'ti_drained')]);
    bnode('ti_sleepy', "Then rest is the answer. Is it late right now, or could you nap soon?", [bg('It is late', 'ti_late'), bg('I could nap', 'ti_nap'), bg('No rest possible', 'ti_norest')]);
    bnode('ti_late', "Then it's wind-down time. Want music that stops by itself?", [bm('Sleep timer 30 min', 'sleep timer 30 minutes', 'ti_bye'), bm('Something soft first', 'play something chill', 'ti_timer')]);
    bnode('ti_timer', "Good. Want me to set the timer too, so it stops once you drift off?", [bc('Yes, set it', 'sleep timer 30 minutes', 'ti_bye'), bg('No thanks', 'ti_bye')]);
    bnode('ti_bye', "Sleep well. I'll stay quiet. Say hi when you're back.", [], { end: [['\u23f2 Sleep timer 30 min', 'sleep timer 30 minutes'], ['\u25b6 Something chill', 'play something chill']] });
    bnode('ti_nap', "A short nap, around twenty minutes, does wonders. Longer ones can leave you groggy. Want a timer?", [bc('Yes, 20 minutes', 'sleep timer 20 minutes', 'ti_bye'), bg('No thanks', 'ti_bye')]);
    bnode('ti_norest', "Ugh. Then small tricks: water, bright light, a brisk walk, or upbeat music. Which sounds easiest?", [bg('Water and light', 'ti_water'), bg('A walk', 's_walk'), bm('Upbeat music', 'play something happy', 'ti_back')]);
    bnode('ti_water', "Do that first, it can beat coffee. Want music while you do?", [bm('Yes, music', 'play something happy', 'ti_back'), bg('No thanks', 'ti_back')]);
    bnode('ti_back', "How's the energy now?", [bg('Better', 'wrap_better'), bg('Still low', 'ti_drained')]);
    bnode('ti_drained', "Drained tired comes from carrying a lot, not just lack of sleep. What's been taking the most out of you?", [bg('Work or school', 's_work'), bg('People', 's_person'), bg('Everything', 's_pile'), bg('Not sure', 'ti_notsure')]);
    bnode('ti_notsure', "That's common. Maybe let today be a low-power day. Is there one thing you could drop or delay?", [bg('Yes, something', 'ti_drop'), bg('Nothing', 's_none')]);
    bnode('ti_drop', "Then drop it, guilt free. Rest counts as productive. Want slow music while you do nothing?", [bm('Yes, slow music', 'play something chill', 'wrap'), bg('No thanks', 'wrap')]);
    bnode('ti_cant', "Not sleeping is miserable. Is it a busy mind, or just not feeling sleepy?", [bg('Busy mind', 'ti_busy'), bg('Not sleepy', 'ti_notsleepy'), bg('Noise or discomfort', 'ti_env')]);
    bnode('ti_busy', "Busy minds need somewhere to put things. Want to dump your thoughts on paper, or settle with slow music?", [bg('Dump my thoughts', 'st_write'), bm('Slow music', 'play something chill', 'ti_timer')]);
    bnode('ti_notsleepy', "Lying there and fighting it makes it worse. Want quiet music with a timer, or to get up for a bit?", [bm('Music and timer', 'play something chill', 'ti_timer'), bg('Get up for a bit', 'ti_getup')]);
    bnode('ti_getup', "Keep the light dim, skip the phone scrolling, do something boring. When you're drowsy, back to bed. Want soft music meanwhile?", [bm('Yes, soft music', 'play something chill', 'ti_timer'), bg('No thanks', 'ti_bye')]);
    bnode('ti_env', "Then fix that if you can. Want soft music to cover the noise, with a timer?", [bm('Yes, please', 'play something chill', 'ti_timer'), bg('No thanks', 'ti_bye')]);
    // ----- ANGRY / FRUSTRATED -----
    bnode('an0', "That sounds frustrating. Want to let it out, or cool down first?", [bg('Let it out', 'an_out'), bg('Cool down', 'an_cool')]);
    bnode('an_out', "Go for it, I can take it. What happened?", [bg('Someone did something', 'an_person'), bg('Something broke or failed', 'an_thing'), bg('I am just angry', 'an_just')],
      { k: [[/boss|friend|partner|family|he |she |they |someone|person|coworker/, 'an_person'], [/broke|failed|crash|lost|late|stuck|traffic/, 'an_thing']] });
    bnode('an_person', "That's infuriating when it feels unfair. Do you think it was on purpose?", [bg('Yes', 'an_purpose'), bg('Not sure', 'an_unsure'), bg('Probably not', 'an_not')]);
    bnode('an_purpose', "Then your anger makes sense. What do you want to happen next?", [bg('An apology', 'an_apol'), bg('To move on', 'an_move'), bg('To hit back', 'an_back')]);
    bnode('an_apol', "Fair. You can ask for that calmly once the heat drops. Want to cool down first?", [bg('Yes, cool down', 'an_cool'), bg('No, I am ready now', 'an_ready')]);
    bnode('an_ready', "Then keep it short and plain: what happened, how it felt, what you want. Anger is heard best in plain words. Want steady music while you plan it?", [bm('Yes, steady music', 'make a focus playlist', 'an_check'), bg('No thanks', 'an_check')]);
    bnode('an_move', "That's mature, and your anger still counts. Want something with energy to burn it off?", [bm('Yes, energy', 'play something happy', 'an_check'), bg('Calm instead', 'an_cool')]);
    bnode('an_back', "Getting back at someone feels good for a minute and costs a lot later. Want to sleep on it first?", [bg('Yes, sleep on it', 'an_cool'), bg('No', 'an_ready')]);
    bnode('an_unsure', "Not knowing is part of what makes it grind. Is there a way to ask them directly?", [bg('Yes', 'an_ready'), bg('No', 'an_cool')]);
    bnode('an_not', "Then maybe the sting is bigger than the intent. Still valid. Want to cool off and see how it looks later?", [bg('Yes', 'an_cool'), bg('No', 'an_just')]);
    bnode('an_thing', "Things breaking at the worst time is the worst. Can you fix it right now?", [bg('Yes, I can', 'an_fix'), bg('No, I cannot', 'an_nofix')]);
    bnode('an_fix', "Then breathe once, fix the one thing, and let the rest wait. Want focus music?", [bm('Yes, focus music', 'make a focus playlist', 'an_check'), bg('No thanks', 'an_check')]);
    bnode('an_nofix', "Then it's about waiting it out, which is its own kind of annoying. Want to burn off the energy?", [bg('Yes, burn it off', 'an_energy'), bg('Calm me down', 'an_cool')]);
    bnode('an_just', "Sometimes it's just a stacked-up day. Have you eaten and slept okay?", [bg('Yes', 'an_cool'), bg('Not really', 's_basics_no')]);
    bnode('an_cool', "Okay. Breathe out longer than you breathe in, a few times, and loosen your hands. Want music too?", [bm('Calm music', 'play something chill', 'an_check'), bg('Something with energy', 'an_energy')]);
    bnode('an_energy', "Burn it off, then. Loud music, a quick walk, or squats. Which one?", [bm('Loud music', 'play something happy', 'an_check'), bg('A walk', 's_walk'), bg('Squats', 'an_squats')]);
    bnode('an_squats', "Twenty of them, no thinking. Tell me when you're done.", [bg('Done', 'an_check')]);
    bnode('an_check', "How hot is it now?", [bg('Cooler', 'wrap_better'), bg('About the same', 'wrap_same'), bg('Hotter', 'an_hotter')]);
    bnode('an_hotter', "Then step away from whatever is feeding it, even for ten minutes. Fresh air helps. Come back and tell me how it goes.", [bg('I will', 'bye')]);
    // ----- LONELY -----
    bnode('lo0', "I'm sorry it feels that way. Is it lonely because you're on your own, or lonely even around people?", [bg('On my own', 'lo_alone'), bg('Around people', 'lo_crowd'), bg('Both', 'lo_crowd')]);
    bnode('lo_alone', "Being alone and being lonely aren't the same, but both can ache. Is there someone you miss?", [bg('Yes, someone', 'lo_miss'), bg('Not really', 'lo_nobody'), bg('I am new here', 'lo_new')]);
    bnode('lo_miss', "Missing someone means the bond is real. Could you message them right now, even something small?", [bg('Yes, I could', 'lo_send'), bg('They are far away', 'lo_far'), bg('I do not know what to say', 'lo_say')]);
    bnode('lo_send', "Do it. A small thinking of you is enough. I'll keep music on while you type.", [bm('Soft music', 'play something chill', 'lo_back'), bg('I am good', 'lo_back')]);
    bnode('lo_far', "Distance is hard. A voice note or a photo can bridge some of it. Does that feel possible?", [bg('Maybe', 'lo_send'), bg('Not really', 'lo_nobody')]);
    bnode('lo_say', "Keep it tiny: hey, I thought of you today, how are you? Want to try it?", [bg('Yes, I will', 'lo_send'), bg('Maybe later', 'lo_back')]);
    bnode('lo_nobody', "Then it's the missing-connection kind of lonely, which is very human. Is there a group or place you could join, even online?", [bg('Maybe', 'lo_group'), bg('Not up to it', 'lo_notup')]);
    bnode('lo_group', "Small steps. A hobby group, a class, a music community. What do you like doing?", [bg('Music', 'lo_music'), bg('Games', 'lo_games'), bg('Something else', 'lo_else')]);
    bnode('lo_music', "There are so many music communities, and sharing songs is a friendly way in. Want to find something to share first?", [bm('Yes, find a song', 'surprise me', 'lo_back'), bg('Later', 'lo_back')]);
    bnode('lo_games', "Games have friendly communities, and playing together counts. Want music while you look around?", [bm('Sure', 'play something happy', 'lo_back'), bg('No thanks', 'lo_back')]);
    bnode('lo_else', "Whatever it is, other people like it too. This week, look for one group, online or local. Just one. Okay?", [bg('Okay', 'lo_back'), bg('Maybe', 'lo_back')]);
    bnode('lo_notup', "That's okay, some days are for staying in. Want company in the form of a ball and some music?", [bm('Yes, please', 'play something chill', 'lo_back'), bg('No thanks', 'lo_back')]);
    bnode('lo_new', "New places are lonely at first. Friendships take months, not days. Is there someone you've almost spoken to?", [bg('Yes, there is', 'lo_say'), bg('Not yet', 'lo_group')]);
    bnode('lo_crowd', "That kind is sneaky. It's about being understood, not about being near people. Is there one person who really gets you?", [bg('Yes, one', 'lo_send'), bg('Not really', 'lo_gets')]);
    bnode('lo_gets', "Then maybe it starts with being a bit more honest with one person, slowly. Does that feel safe?", [bg('Maybe', 'lo_back'), bg('Not really', 's_trust')]);
    bnode('lo_back', "Thanks for sharing that with me. How do you feel now?", CHK());
    // ----- HAPPY -----
    bnode('ha0', "Yay, that's great! What's making it a good one?", [bg('Something good happened', 'ha_event'), bg('Just a good mood', 'ha_mood'), bg('I achieved something', 'ha_win'), bg('Someone', 'ha_person')]);
    bnode('ha_event', "Ooh, tell me more! Was it big, or a nice little thing?", [bg('Big', 'ha_big'), bg('Little', 'ha_little')]);
    bnode('ha_big', "That's wonderful. Do you want to celebrate, or keep it quiet for a while?", [bg('Celebrate', 'ha_celebrate'), bg('Keep it quiet', 'ha_quiet')]);
    bnode('ha_celebrate', "Celebrate! A party playlist, or your own favorites?", [bm('Party playlist', 'make a party playlist', 'ha_back'), bm('My favorites', 'surprise me', 'ha_back')]);
    bnode('ha_quiet', "Sometimes savoring it alone is best. Want warm, easy music to go with it?", [bm('Yes, warm music', 'play something chill', 'ha_back'), bg('No thanks', 'ha_back')]);
    bnode('ha_little', "The little ones are the best, honestly. Want to make it last with a good song?", [bm('Yes, a good song', 'play something happy', 'ha_back'), bg('No thanks', 'ha_back')]);
    bnode('ha_mood', "Good moods with no reason are the best kind. Want to ride it, or use it for something?", [bg('Ride it', 'ha_ride'), bg('Use it', 'ha_use')]);
    bnode('ha_ride', "Then let's ride. Upbeat, or a surprise?", [bm('Upbeat', 'play something happy', 'ha_back'), bm('Surprise', 'surprise me', 'ha_back')]);
    bnode('ha_use', "Smart. Good mood energy is great for things you've been avoiding. What have you put off?", [bg('Chores', 'ha_chores'), bg('Work or study', 'ha_work'), bg('Something creative', 'ha_create')]);
    bnode('ha_chores', "Perfect, music makes chores faster. Want an upbeat mix?", [bm('Yes, upbeat', 'play something happy', 'ha_back'), bg('No thanks', 'ha_back')]);
    bnode('ha_work', "Great timing. Focus playlist, or something upbeat?", [bm('Focus playlist', 'make a focus playlist', 'ha_back'), bm('Upbeat', 'play something happy', 'ha_back')]);
    bnode('ha_create', "Ooh. Ride that wave. Want something inspiring while you make it?", [bm('Yes, inspire me', 'surprise me', 'ha_back'), bg('I will keep it quiet', 'ha_back')]);
    bnode('ha_win', "Congratulations! That deserves a moment. Did you work hard for it?", [bg('Yes, a lot', 'ha_hard'), bg('It just happened', 'ha_luck')]);
    bnode('ha_hard', "Then the pride is earned. What helped you get there?", [bg('Practice', 'ha_prac'), bg('Other people', 'ha_ppl'), bg('Stubbornness', 'ha_stub')]);
    bnode('ha_prac', "Practice really is the secret. Want a victory song?", [bm('Yes, victory song', 'play something happy', 'ha_back'), bg('No thanks', 'ha_back')]);
    bnode('ha_ppl', "Then tell them thank you, they'll love it. Want something warm on while you write it?", [bm('Yes, something warm', 'play something chill', 'ha_back'), bg('No thanks', 'ha_back')]);
    bnode('ha_stub', "Stubborn is underrated. Victory music?", [bm('Yes, victory music', 'play something happy', 'ha_back'), bg('No thanks', 'ha_back')]);
    bnode('ha_luck', "Sometimes luck shows up, and that's lovely too. Enjoy it. Want a song to go with it?", [bm('Yes, please', 'play something happy', 'ha_back'), bg('No thanks', 'ha_back')]);
    bnode('ha_person', "Aww. People make the best moods. Is it someone new, or someone you know well?", [bg('Someone new', 'ha_new'), bg('Someone I know well', 'ha_old')]);
    bnode('ha_new', "New connections are thrilling. Want a playlist for that feeling?", [bm('Yes, please', 'play something happy', 'ha_back'), bg('Keep it private', 'ha_back')]);
    bnode('ha_old', "Those are the roots of a good life. Want something warm to go with it?", [bm('Yes, warm', 'play something chill', 'ha_back'), bg('No thanks', 'ha_back')]);
    bnode('ha_back', "I love this for you. Want to keep the good stuff going?", [bm('Surprise me', 'surprise me', 'ha_end'), bc('Another joke', 'tell me a joke', 'ha_end'), bg('I am good', 'ha_end')]);
    bnode('ha_end', "Thanks for sharing the good vibes. I'm bouncing. Come back any time.", [], { end: [['\u25b6 Surprise me', 'surprise me'], ['\u25b6 Something happy', 'play something happy'], ['\ud83d\ude04 A joke', 'tell me a joke'], ['What can you do?', 'help']] });
    // ----- BORED -----
    bnode('bo0', "Bored? Let's fix that. Want something active, something chill, or something silly?", [bg('Active', 'bo_active'), bg('Chill', 'bo_chill'), bg('Silly', 'bo_silly')]);
    bnode('bo_active', "Okay. Music, a quick task, or a mini challenge?", [bm('Music', 'play something happy', 'bo_back'), bg('A task', 'bo_task'), bg('A challenge', 'bo_chal')]);
    bnode('bo_task', "Pick the smallest chore you've been dodging and do it during one full song. When the song ends, stop. Ready?", [bm('Start the song', 'play something happy', 'bo_back'), bg('No chores', 'bo_chal')]);
    bnode('bo_chal', "Challenge: find a song in your library you've never played and listen to all of it. Go?", [bm('Go', 'play songs I have never played', 'bo_back'), bg('Too easy', 'bo_hard')]);
    bnode('bo_hard', "Fine. Guess the mood of the next song before I tell you. Want to try?", [bc('Yes, try it', 'what mood is this', 'bo_back'), bg('Pass', 'bo_silly')]);
    bnode('bo_chill', "Slow boredom is nice sometimes. Want some calm music or a surprise?", [bm('Calm music', 'play something chill', 'bo_back'), bm('Surprise', 'surprise me', 'bo_back')]);
    bnode('bo_silly', "Silly mode on! A joke, a fun fact, or a coin flip?", [bc('A joke', 'tell me a joke', 'bo_back'), bc('A fun fact', 'fun fact', 'bo_back'), bc('Flip a coin', 'flip a coin', 'bo_back')]);
    bnode('bo_back', "Better? Bored brains need variety.", [bg('Yes, better', 'bo_end'), bg('Still bored', 'bo_more')]);
    bnode('bo_more', "Okay, a bigger change. Want me to make a playlist, or show you everything I can do?", [bc('Make a playlist', 'make a playlist', 'bo_end'), bc('Show me what you can do', 'help', 'bo_end')]);
    bnode('bo_end', "Any time you're bored, tell me and I'll find something. Bounce!", [], { end: [['\u25b6 Surprise me', 'surprise me'], ['\ud83d\ude04 A joke', 'tell me a joke'], ['\ud83d\udca1 Fun fact', 'fun fact'], ['What can you do?', 'help']] });
    // ===== EXTENSIONS: deeper branches grafted onto the chats above =====
    const bx = (id, ...o) => { BL_T[id].o.push(...o); }, bk = (id, ...k) => { BL_T[id].k = (BL_T[id].k || []).concat([]); BL_T[id].k.unshift(...k); };
    // ----- SAD: keep talking, loss, breakups, not good enough -----
    bx('s_check', bg('I want to keep talking', 's_more'));
    bnode('s_more', "Sure. Want to go deeper into what's behind it, or try something to change how you feel?", [bg('Go deeper', 's_deeper'), bg('Try something different', 's_change')]);
    bnode('s_deeper', "Okay. Roughly when did this feeling start?", [bg('Today', 's_today'), bg('This week', 's_week_feel'), bg('A long time ago', 's_while')]);
    bnode('s_week_feel', "A week is long enough to deserve a plan. What changed around then?", [bg('Something happened', 's_event'), bg('Nothing obvious', 's_noreason'), bg('Work or school', 's_work')]);
    bnode('s_change', "Three ways in: move, make, or connect. Move is a walk or stretch, make is writing or doodling, connect is messaging someone. Which one?", [bg('Move', 's_walk'), bg('Make', 's_make'), bg('Connect', 's_ppl')]);
    bnode('s_make', "Make something tiny: two lines of writing, a doodle, a mini playlist. Nobody has to see it. Want music while you do?", [bm('Yes, music', 'play something chill', 's_check'), bg('No thanks', 's_check')]);
    bx('s_talk', bg('Someone or something I lost', 's_loss', { why: 'that loss' }));
    bk('s_talk', [/died|passed away|death|funeral|grief|grieving|lost my/, 's_loss', { why: 'that loss' }], [/breakup|broke up|dumped|split up/, 's_breakup', { why: 'the breakup' }]);
    bnode('s_loss', "I'm so sorry. Losing someone or something leaves a hole. What kind of loss is it?", [bg('A person', 's_loss_person'), bg('A pet', 's_loss_pet'), bg('A relationship ending', 's_breakup'), bg('A job, home or plan', 's_loss_other')]);
    bnode('s_loss_person', "Grief comes in waves, and there's no schedule for it. Do you want to remember them for a bit, or rest from it?", [bg('Remember them', 's_remember'), bg('Rest from it', 's_music')]);
    bnode('s_remember', "Remembering is a way of keeping them close. Is there a song that reminds you of them?", [bg('Yes, there is', 's_song_them'), bg('Not sure', 's_memory_tell')]);
    bnode('s_song_them', "Songs hold people the way jars hold light. Want some gentle music for it now?", [bm('Yes, gentle music', 'play something chill', 's_after_mem'), bg('Maybe later', 's_later')]);
    bnode('s_after_mem', "That can bring up a lot. How are you doing with it?", [bg('Okay', 's_check'), bg('It hurts', 's_hurts')]);
    bnode('s_hurts', "It's allowed to hurt, because it mattered. Be gentle with yourself. Is there someone who also knew them that you could share this with?", [bg('Yes, there is', 's_trust_yes'), bg('Not really', 's_trust')]);
    bnode('s_memory_tell', "If you like, think of one small thing about them. Funny, warm, anything. Which kind comes to mind?", [bg('Something funny', 's_funny_mem'), bg('Something warm', 's_warm_mem'), bg('I would rather not', 's_music')]);
    bnode('s_funny_mem', "Laughing through it honors them. Hold onto that one.", [bg('Thank you', 's_check')]);
    bnode('s_warm_mem', "Warm memories stay. They're yours to keep, any time you need them.", [bg('Thank you', 's_check')]);
    bnode('s_loss_pet', "Pets are family, so that's a real loss. When did it happen?", [bg('Just now or days ago', 's_pet_new'), bg('A while ago', 's_pet_old')]);
    bnode('s_pet_new', "The first days are the rawest. Eat something, drink water, and let yourself cry if you need to. Want gentle music?", [bm('Yes, gentle music', 'play something chill', 's_check'), bg('No thanks', 's_check')]);
    bnode('s_pet_old', "Missing them long after is just love still going. Do you have a favorite memory of them?", [bg('Yes, I do', 's_warm_mem'), bg('Not right now', 's_check')]);
    bnode('s_breakup', "Breakups hurt in strange, almost physical ways. Was it your choice, theirs, or mutual?", [bg('Mine', 's_bk_mine'), bg('Theirs', 's_bk_theirs'), bg('Mutual', 's_bk_mutual')]);
    bnode('s_bk_mine', "Even a right choice can hurt. You can miss someone and still know. Are you doubting it?", [bg('A little', 's_bk_doubt'), bg('No, I am sure', 's_bk_sure')]);
    bnode('s_bk_doubt', "Doubt after a breakup is common, and it's usually the missing talking, not the facts. Write down why you decided, and read it when it gets loud. Want to do that now?", [bg('Yes, now', 'st_write'), bg('Maybe later', 's_later')]);
    bnode('s_bk_sure', "Then it's grief without regret, a clean kind of ache. Want music, or a distraction?", [bm('Music', 'play something chill', 's_check'), bg('A distraction', 's_pick')]);
    bnode('s_bk_theirs', "That's a hard one, feeling left behind. Does it feel like you did something wrong?", [bg('Yes, maybe', 's_bk_blame'), bg('No, just hurt', 's_bk_hurt')]);
    bnode('s_bk_blame', "Relationships end for many reasons, and rarely because of one person's flaw. What would you tell a friend in your spot?", [bg('Something kind', 's_kind'), bg('I do not know', 's_dunno')]);
    bnode('s_bk_hurt', "Hurt needs room. A few low-energy days are normal. One thing that helps: don't check their profile tonight. Could you try that?", [bg('Good idea', 's_check'), bg('Too late', 's_bk_oops')]);
    bnode('s_bk_oops', "It happens to everyone. Close the app and put the phone down for an hour. Want music to fill the gap?", [bm('Yes, music', 'play something chill', 's_check'), bg('No thanks', 's_check')]);
    bnode('s_bk_mutual', "Mutual ones are strange: sad and calm at the same time. Are you okay being both?", [bg('Yes, I am', 's_check'), bg('It is confusing', 's_unsure')]);
    bnode('s_loss_other', "Losing a job, a home or a plan shakes your footing. Which is it closest to?", [bg('A job', 's_job'), bg('A home or a move', 's_move_home'), bg('A plan or dream', 's_dream')]);
    bnode('s_job', "That shakes more than money, it shakes identity too. Is the worry more about bills, or about how you see yourself?", [bg('Bills', 'st_money'), bg('How I see myself', 's_self')]);
    bnode('s_move_home', "Leaving a place leaves a gap in your routines. What do you miss most?", [bg('People', 'lo_miss'), bg('The place itself', 's_place'), bg('My routines', 's_routine')]);
    bnode('s_place', "Places hold memories. Want a song that feels like home?", [bm('Yes, home music', 'play something chill', 's_check'), bg('No thanks', 's_check')]);
    bnode('s_routine', "Routines are scaffolding. Try rebuilding one tiny one: the same drink at the same time each morning. Want to plan one?", [bg('Yes, plan one', 'st_write'), bg('Not now', 's_check')]);
    bnode('s_dream', "A dream breaking hurts because you put hope into it. Is it over, or just delayed?", [bg('Just delayed', 's_dream_delay'), bg('It is over', 's_dream_dead')]);
    bnode('s_dream_delay', "Delayed things can still happen, just differently. What would one small step be?", [bg('I know one', 'st_focus'), bg('No idea', 's_none')]);
    bnode('s_dream_dead', "Letting a dream go is grief too. Sometimes a different one grows in the same soil, but there's no rush. Want to just sit with music for now?", [bm('Yes, music', 'play something chill', 's_check'), bg('No thanks', 's_check')]);
    bx('s_work', bg('Not feeling good enough', 's_enough'));
    bnode('s_enough', "Feeling not good enough is common among people who care about doing well. Is it about a specific mistake, or a general feeling?", [bg('A specific mistake', 's_mistake'), bg('A general feeling', 's_self')]);
    bnode('s_mistake', "Mistakes feel loud to the person who made them and quieter to everyone else. What kind was it?", [bg('Work or school', 's_mistake_fix'), bg('I hurt someone', 's_hurt_someone')]);
    bnode('s_mistake_fix', "Can it be fixed or explained?", [bg('Yes, it can', 's_fix_it'), bg('No, not really', 's_accept')]);
    bnode('s_fix_it', "Then fixing it quickly is the move, and owning it looks good. Want to plan what to say?", [bg('Yes, plan it', 's_say_plan'), bg('Later', 's_later')]);
    bnode('s_say_plan', "Keep it to three parts: what happened, what you're doing about it, what you'll change. That's it. Want focus music while you draft?", [bm('Yes, focus music', 'make a focus playlist', 's_check'), bg('No thanks', 's_check')]);
    bnode('s_accept', "Then the lesson is the part you keep, and the shame is the part you can put down. Anything else you'd like to talk through?", [bg('Yes', 's_talk'), bg('No, I am okay', 's_check')]);
    bnode('s_hurt_someone', "That weighs on a caring person. Would an honest apology help?", [bg('Yes, I think so', 's_apology'), bg('Not sure', 's_close')]);
    bnode('s_apology', "Keep it short and sincere: what you did, that you're sorry, what you'll do differently. No excuses attached. Want to write it now, or later?", [bg('Now', 'st_write'), bg('Later', 's_later')]);
    // ----- STRESS: panic, exams, money, social worries -----
    bx('st0', bg('Panicky right now', 'st_panic'));
    bnode('st_panic', "Okay, right now. You're safe in this moment. Press your feet into the floor, press your palms together, and breathe out slowly. Look around and name what you see. Tell me when it eases.", [bg('It is easing', 'st_calmer'), bg('Not easing', 'st_panic2')]);
    bnode('st_panic2', "Keep going slowly, with a longer out-breath than in-breath. If you have chest pain or can't breathe properly, please get medical help or call your local emergency number. Is it easing at all?", [bg('A little', 'st_calmer'), bg('No', 'st_panic3')]);
    bnode('st_panic3', "Then please reach out to someone near you now, or contact local emergency services if you feel unsafe. I'm only a small ball, but I'm here.", [bg('I will', 'bye_trust'), bg('It is passing', 'st_calmer')]);
    bx('st_deadline', bg('An exam', 'st_exam'));
    bnode('st_exam', "Exams are stressful. Is the worry about not knowing the material, or blanking on the day?", [bg('Not knowing it', 'st_study'), bg('Blanking', 'st_blank')]);
    bnode('st_study', "Then list the topics and star the three that matter most. Study those in twenty-five minute chunks. Want focus music?", [bm('Yes, focus music', 'make a focus playlist', 'st_back'), bg('No thanks', 'st_back')]);
    bnode('st_blank', "Blanking is anxiety, not ignorance. Practice recalling with no notes, and breathe slowly before you start. Want to try a breathing round now?", [bg('Yes, try it', 'st_breath'), bg('Not now', 'st_next')]);
    bx('st_future', bg('Money', 'st_money'));
    bnode('st_money', "Money stress is heavy because it touches everything. Is it a bill due soon, or a general worry?", [bg('A bill', 'st_bill'), bg('A general worry', 'st_money_gen')]);
    bnode('st_bill', "Then get the exact amount and date in front of you. The real number is usually smaller than the fear of it. Do you know the number?", [bg('Yes, I do', 'st_bill_plan'), bg('No', 'st_bill_find')]);
    bnode('st_bill_find', "Finding it is step one. Open the statement, read the amount, close it. That's all for tonight. Ready?", [bg('Found it', 'st_bill_plan')]);
    bnode('st_bill_plan', "Two options: contact whoever you owe, since many offer extensions, or cut one expense this week. Which feels doable?", [bg('Contact them', 'st_contact'), bg('Cut an expense', 'st_cut')]);
    bnode('st_contact', "Short and honest works: I can pay, I need until this date. People respond better than you'd expect. Want to draft it?", [bg('Yes, draft it', 'st_write'), bg('Later', 'st_next')]);
    bnode('st_cut', "Pick one thing, only one. Small wins calm the panic. Want to note it down?", [bg('Yes, note it', 'st_write'), bg('Later', 'st_next')]);
    bnode('st_money_gen', "General money worry loves vagueness. Could you jot down income, fixed costs and what's left? Rough is fine.", [bg('Done', 'st_money_after'), bg('Not tonight', 'st_next')]);
    bnode('st_money_after', "Now it's a puzzle instead of a fog. What's the biggest piece?", [bg('Rent or housing', 'st_bill_plan'), bg('Debt', 'st_debt'), bg('Not enough income', 'st_income')]);
    bnode('st_debt', "Debt responds to a plan. Smallest first builds motivation, highest interest first saves the most. Which would you pick?", [bg('Smallest first', 'st_next'), bg('Highest interest first', 'st_next')]);
    bnode('st_income', "Then the question is more income or less spending. Which feels more possible this month?", [bg('More income', 'st_next'), bg('Less spending', 'st_cut')]);
    bx('st_tell', bg('Being around people', 'st_social'));
    bnode('st_social', "Social stress is exhausting. Is it a specific event coming up, or people in general?", [bg('An event', 'st_event'), bg('People in general', 'st_people')]);
    bnode('st_event', "Events feel worse in your head than in the room. When is it?", [bg('Soon', 'st_event_soon'), bg('Later on', 'st_event_later')]);
    bnode('st_event_soon', "Then prep light: one opening line, one exit plan, one friendly face to find. Want to rehearse the opening line here?", [bg('Yes, rehearse', 'st_rehearse'), bg('No', 'st_event_music')]);
    bnode('st_rehearse', "Try: hi, I'm so-and-so, how do you know the host? Simple wins. Say it in your head twice. Feeling any better?", [bg('A bit', 'st_calmer'), bg('Not really', 'st_exit')]);
    bnode('st_exit', "Then the exit plan matters most. You can leave after an hour, and that's allowed. Having it makes staying easier. Want calming music before you go?", [bm('Yes, calming music', 'play something chill', 'st_back'), bg('No thanks', 'st_back')]);
    bnode('st_event_music', "Okay. Pump-up music or calming music beforehand?", [bm('Pump-up', 'play something happy', 'st_back'), bm('Calming', 'play something chill', 'st_back')]);
    bnode('st_event_later', "Then you have time to prepare gently. Each day, do one tiny thing toward it. Want to pick the first one?", [bg('Yes, pick one', 'st_write'), bg('Not yet', 'st_next')]);
    bnode('st_people', "With people in general, is it being judged, or being drained?", [bg('Being judged', 'st_judged'), bg('Being drained', 'ti_drained')]);
    bnode('st_judged', "Most people are busy worrying about how they look, not judging you. Does that land at all?", [bg('A little', 'st_calmer'), bg('Not really', 'st_judged2')]);
    bnode('st_judged2', "Try this next time: pick one person and just be curious about them. Curiosity pulls your attention outward. Want to give it a go?", [bg('Yes', 'st_next'), bg('Maybe', 'st_next')]);
    // ----- TIRED: burnout, coffee, night waking, screens, tips -----
    bx('ti_drained', bg('Burned out', 'ti_burn'));
    bnode('ti_burn', "Burnout is when rest alone doesn't fix it. How long has it been going on?", [bg('Weeks', 'ti_burn_weeks'), bg('Months', 'ti_burn_months')]);
    bnode('ti_burn_weeks', "Weeks you can often turn around with boundaries and rest. Is there one thing you could say no to this week?", [bg('Yes, something', 'ti_drop'), bg('Nothing', 'ti_burn_months')]);
    bnode('ti_burn_months', "Months of that deserves real support from a doctor, a manager, or someone who can change the load. Could you talk to one of them?", [bg('Yes, I could', 's_trust_yes'), bg('Not yet', 's_trust')]);
    bx('ti_norest', bg('Coffee', 'ti_coffee'));
    bnode('ti_coffee', "Coffee helps for a bit, but a short walk and daylight help for longer. Want to try the walk first?", [bg('Yes, the walk', 's_walk'), bg('Coffee anyway', 'ti_back')]);
    bx('ti_cant', bg('I wake in the night', 'ti_wake'), bg('Too much scrolling', 'ti_screen'));
    bnode('ti_wake', "Waking at night is frustrating. Do you fall back asleep, or lie there?", [bg('I fall back asleep', 'ti_wake_ok'), bg('I lie there', 'ti_notsleepy')]);
    bnode('ti_wake_ok', "Then it's a light disruption. Keep the room dark and cool, and avoid screens. Want soft music with a timer tonight?", [bm('Yes, soft music', 'play something chill', 'ti_timer'), bg('No thanks', 'ti_bye')]);
    bnode('ti_screen', "Screens keep the brain awake. Try putting the phone away and letting music on a timer take over. Want that now?", [bm('Yes, music', 'play something chill', 'ti_timer'), bg('No thanks', 'ti_bye')]);
    bx('ti_late', bg('Wind-down tips first', 'ti_tips'));
    bnode('ti_tips', "Quick wind-down: dim lights, no caffeine late, a cool room, the same bedtime. Which one could you change tonight?", [bg('Dim the lights', 'ti_late'), bg('Cool the room', 'ti_late'), bg('Same bedtime', 'ti_late')]);
    // ----- ANGRY: work, self, triggers -----
    bx('an0', bg('At myself', 'an_self'));
    bx('an_out', bg('Work or school', 'an_work'));
    bnode('an_work', "Work frustration is the worst because you can't always respond. Was it a person, or the workload?", [bg('A person', 'an_boss'), bg('The workload', 'st_constant')]);
    bnode('an_boss', "Who was it?", [bg('A boss', 'an_boss2'), bg('A coworker', 'an_cow'), bg('A customer', 'an_cust')]);
    bnode('an_boss2', "Bosses hold the power, which makes it harder to let anger out. Do you need to say something, or just get through the day?", [bg('Say something', 'an_ready'), bg('Get through the day', 'an_cool')]);
    bnode('an_cow', "Coworkers you can't avoid are the toughest. Is it a one-off, or a pattern?", [bg('A one-off', 'an_not'), bg('A pattern', 'an_pattern')]);
    bnode('an_pattern', "Patterns deserve a calm, specific conversation, or a word with someone above if it's serious. Which feels right?", [bg('A direct talk', 'an_ready'), bg('Tell someone above', 'an_doc')]);
    bnode('an_doc', "Write down dates and what happened, facts only. That makes it easier to be taken seriously. Want to start a quick note now?", [bg('Yes, now', 'st_write'), bg('Later', 'an_check')]);
    bnode('an_cust', "Customers can be rough, and you're not their punching bag. Want to cool off with music before the next one?", [bm('Yes, cool off', 'play something chill', 'an_check'), bg('No thanks', 'an_check')]);
    bnode('an_self', "Anger at yourself is a heavy kind. What's it about?", [bg('I made a mistake', 's_mistake'), bg('Something I did not do', 'an_undone'), bg('Just everything', 's_self')]);
    bnode('an_undone', "Not doing something you wanted to do stings. Could you do even a tiny version of it today?", [bg('Yes, I could', 's_tiny'), bg('Not today', 's_none')]);
    bx('an_check', bg('Cooler, and I want to find the trigger', 'an_trigger'));
    bnode('an_trigger', "Good idea. What set it off: something said, something done, or something expected that didn't happen?", [bg('Something said', 'an_trig_said'), bg('Something done', 'an_trig_done'), bg('An unmet expectation', 'an_trig_exp')]);
    bnode('an_trig_said', "Words stick when they hit a belief. Did it touch something you worry about?", [bg('Yes', 's_self'), bg('No', 'an_ready')]);
    bnode('an_trig_done', "Then the boundary is the thing. What would you want them to do instead?", [bg('I know what I want', 'an_ready'), bg('Not sure', 'an_unsure')]);
    bnode('an_trig_exp', "Unmet expectations are quiet anger fuel. Was the expectation fair, and was it ever said out loud?", [bg('Fair but unsaid', 'an_say'), bg('Not really fair', 'an_reset')]);
    bnode('an_say', "Then say it plainly next time, as a request, not a test. Want to practice the line?", [bg('Yes, practice', 'an_ready'), bg('Later', 'wrap')]);
    bnode('an_reset', "Adjusting an expectation is hard, and it frees you. Want to let it go with some music?", [bm('Yes, music', 'play something chill', 'wrap'), bg('No thanks', 'wrap')]);
