    // ---- openWakeWord: always-on wake phrase (opt-in) ----
    let wk = null, wkStarting = false;
    async function wakeFiles(say) {
      const have = async k => NATIVE ? !!(await NP.exists({ id: k })).ready : !!(await idbGet(k));
      const ensure = async (key, file, abs) => {
        if (await have(key)) return;
        if (NATIVE) { say && say('Downloading ' + file + '…'); await nativeFetch(key, abs ? WAKE_HF + file : file, () => {}); return; }   // the app's own engine reads its own model store
        await fetchPart(key, abs ? WAKE_HF + file : file, (g, t) => say && say('Downloading ' + file + (t ? ' ' + Math.round(g / t * 100) + '%' : '')), true);
      };
      await ensure('ww_mel', 'melspectrogram.onnx', true); await ensure('ww_emb', 'embedding_model.onnx', true);
      if (await have('ww_bloop')) return ['ww_bloop', 0.5, 'Hey Bloop'];
      if (Date.now() - (+lsGet('ppvWakeMiss') || 0) > 6048e5) {                                    // your own hey_bloop.onnx in HF_BASE, checked at most once a week
        try { if (NATIVE) await nativeFetch('ww_bloop', 'hey_bloop.onnx', () => {}); else await fetchPart('ww_bloop', 'hey_bloop.onnx', null, true); return ['ww_bloop', 0.5, 'Hey Bloop']; } catch (e) { lsSet('ppvWakeMiss', String(Date.now())); }
      }
      await ensure('ww_jarvis', 'hey_jarvis.onnx', true); return ['ww_jarvis', 0.45, 'Hey Jarvis'];
    }
    async function wakeStart(say) {
      if (wk || wkStarting) return; wkStarting = true;
      try {
        await loadOrt(); const h = await wakeFiles(say);
        if (!NATIVE) { ort.env.wasm.wasmPaths = ORT; ort.env.wasm.numThreads = 1; }
        const mk = async k => NATIVE ? makeSession(k, false, null) : ort.InferenceSession.create(new Uint8Array(await getPart(k)), { executionProviders: ['wasm'], graphOptimizationLevel: 'all' });
        const mel = await mk('ww_mel'), emb = await mk('ww_emb'), head = await mk(h[0]);
        await micAcquire();
        wk = { mel, emb, head, thr: h[1], name: h[2], raw: new Float32Array(480), melBuf: [], embBuf: [], acc: new Float32Array(0), q: [], busy: false, hits: 0, cool: 0, pre: [], hang: 0, floor: null };
        mic.subs.add(wakeSub); say && say('Wake word ready: say \u201c' + h[2] + '\u201d.');
      } finally { wkStarting = false; }
    }
    function wakeStop() {
      const w = wk; if (!w) return; wk = null; mic.subs.delete(wakeSub);
      [w.mel, w.emb, w.head].forEach(s => { try { s.release && s.release(); } catch (e) {} }); micRelease();
    }
    function wakeSub(f) {
      const w = wk; if (!w) return;
      if (dictating || vSpeaking || Date.now() < wwHold || document.hidden || heavyBusy()) { w.acc = new Float32Array(0); w.q.length = 0; return; }
      w.acc = vCat(w.acc, f);
      while (w.acc.length >= 1280) { const c = w.acc.slice(0, 1280); w.acc = w.acc.slice(1280); if (w.q.length < 8) w.q.push(c); }
      if (!w.busy) wakeRun(w);
    }
    async function wakeRun(w) {
      w.busy = true;
      try {
        while (w.q.length && wk === w) {
          const c = w.q.shift();
          // Quiet-room saver: in silence the three models are skipped. The last ~2 s of audio is kept and replayed the moment
          // sound starts, so the phrase is still heard from its first syllable. Loud = clearly above a slowly tracked noise floor.
          let e = 0, n = 0; for (let i = 0; i < c.length; i += 4) { e += c[i] * c[i]; n++; }
          const rms = Math.sqrt(e / Math.max(1, n));
          w.floor = w.floor == null ? rms : (rms < w.floor ? rms : w.floor * 0.995 + rms * 0.005);
          const now = Date.now();
          if (rms > Math.max(0.006, Math.min(w.floor, 0.02) * 2.5)) w.hang = now + 2500;
          if (now > w.hang) { w.pre.push(c); if (w.pre.length > 25) w.pre.shift(); w.hits = 0; continue; }
          const batch = w.pre.length ? w.pre.splice(0).concat([c]) : [c];
          for (const cc of batch) {
            if (wk !== w) break;
            const x = new Float32Array(cc.length); for (let i = 0; i < cc.length; i++) x[i] = cc[i] * 32768;   // the mel model wants 16-bit scale
            const s = await wakeScore(w, x); w.hits = s >= w.thr ? w.hits + 1 : 0;
            if (w.hits >= 2 && Date.now() > w.cool) { w.cool = Date.now() + 3500; w.hits = 0; dictate(true); }
          }
        }
      } catch (e) { console.error(e); if (wk === w) { wakeStop(); lsSet('ppvWake', '0'); add('bot', 'The wake word stopped: ' + e.message); } }
      finally { w.busy = false; }
    }
    // openWakeWord, streaming: 1280 new samples -> 8 mel frames -> 1 embedding (96 numbers) -> the last 16 embeddings -> a score.
    async function wakeScore(w, x) {
      w.raw = vCat(w.raw.slice(-480), x);
      const mo = await w.mel.run({ [w.mel.inputNames[0]]: new ort.Tensor('float32', w.raw, [1, w.raw.length]) }), md = mo[w.mel.outputNames[0]].data, nf = md.length / 32;
      for (let i = 0; i < nf; i++) { const fr = new Float32Array(32); for (let k = 0; k < 32; k++) fr[k] = md[i * 32 + k] / 10 + 2; w.melBuf.push(fr); }
      if (w.melBuf.length > 76) w.melBuf.splice(0, w.melBuf.length - 76);
      if (w.melBuf.length < 76) return 0;
      const ein = new Float32Array(76 * 32); w.melBuf.forEach((fr, i) => ein.set(fr, i * 32));
      const eo = await w.emb.run({ [w.emb.inputNames[0]]: new ort.Tensor('float32', ein, [1, 76, 32, 1]) });
      w.embBuf.push(Float32Array.from(eo[w.emb.outputNames[0]].data)); if (w.embBuf.length > 16) w.embBuf.shift();
      if (w.embBuf.length < 16) return 0;
      const hin = new Float32Array(16 * 96); w.embBuf.forEach((e, i) => hin.set(e, i * 96));
      const ho = await w.head.run({ [w.head.inputNames[0]]: new ort.Tensor('float32', hin, [1, 16, 96]) });
      return ho[w.head.outputNames[0]].data[0];
    }

    // ---- switches, used by the settings panel ----
    function vSync(say) {
      micShow();
      if (wakeOn() && !wk && !wkStarting) wakeStart(say).catch(e => { console.error(e); lsSet('ppvWake', '0'); add('bot', 'The wake word did not start: ' + e.message); });
      else if (!wakeOn() && wk) wakeStop();
    }
    function vSet(k, on, say) {
      lsSet(k, on ? '1' : '0');
      if (k === 'ppvVoice' && !on) { stopSpeak(); freeVoice(); }
      if (k === 'ppvVoiceNat') { stopSpeak(); vNatFailed = false; if (on) freeVoice(); }
      if (k === 'ppvEarsNat') { eNatFailed = false; if (on) freeEars(); }
      if (k === 'ppvMini' && !on) freeMini();
      if (k === 'ppvMic' && !on) { dictStop = true; freeEars(); }
      vSync(say);
    }
    async function vFree() {
      stopSpeak(); dictStop = true; if (wk) wakeStop();
      await freeVoice(); await freeEars(); await freeMini();
      ['ppvMiniDl', 'ppvVoiceDl', 'ppvEarsDl', 'ppvWake'].forEach(k => lsSet(k, '0')); voiceAsked = false; semAsked = false;
      for (const k of ['ww_mel', 'ww_emb', 'ww_bloop', 'ww_jarvis', 'mini_cmd', 'mini_trk']) { try { await idbDel(k); } catch (e) {} }
      semIdx = null; semCmd = null;
      try { for (const k of await caches.keys()) { if (k === 'kokoro-voices') await caches.delete(k); else if (/transformers/i.test(k)) { const c = await caches.open(k); for (const r of await c.keys()) if (/MiniLM|moonshine|Kokoro/i.test(r.url)) await c.delete(r); } } } catch (e) {}
    }
    const ppVoiceApi = {
      get: k => vFlag(k), set: vSet, free: vFree, list: VOICES, who: voiceWho, when: voiceWhen,
      setWho: v => { lsSet('ppvVoiceWho', v); if (speakOn() && lsGet('ppvVoiceDl') === '1') { vPrime(); vSpeak('Hi, I am Bloop.', true); } },
      setWhen: v => lsSet('ppvVoiceWhen', v === 'all' ? 'all' : 'talk')
    };
    setTimeout(vSync, 0);
    // ---------- Follow-up buttons ----------
    // When Bloop ends a reply with a question (or a "pick one!") and nothing else offered buttons, add the likely answers
    // as tappable buttons so nobody has to guess what to type. Only the newest message gets them, and only if it has none.
    const BL_FOLLOW = [
      [/stops? by itself|stop by itself|drift off|sleep timer/i, [['\u23f2 Sleep timer 30 min', 'sleep timer 30 minutes'], ['\u25b6 Something chill', 'play something chill']]],
      [/\bfocus\b/i, [['\u25b6 Focus playlist', 'make a focus playlist'], ['\u25b6 Surprise me', 'surprise me']]],
      [/party playlist|party mix/i, [['\u25b6 Party playlist', 'make a party playlist'], ['\u25b6 Something happy', 'play something happy']]],
      [/song, a joke, or a fun fact/i, [['\u25b6 A song', 'surprise me'], ['\ud83d\ude04 A joke', 'tell me a joke'], ['\ud83d\udca1 Fun fact', 'fun fact']]],
      [/coffee first/i, [['\u25b6 Music first', 'surprise me'], ['\ud83d\ude04 A joke first', 'tell me a joke']]],
      [/similar to this|more like this/i, [['\u25b6 More like this', 'more like this'], ['\u25b6 Surprise me', 'surprise me']]],
      [/how(?:'s| is) your day/i, [['\ud83d\ude0a Good', 'I feel happy'], ['\ud83d\ude14 Rough', 'I feel sad'], ['\u25b6 Play something', 'surprise me']]],
      [/something (?:soft|mellow|gentle|calm|to sit with)|sit with for a while|music to go with it|music might help/i, [['\u25b6 Something chill', 'play something chill'], ['\u25b6 Surprise me', 'surprise me']]],
      [/something (?:bright|happy|loud|to match|to keep you going)|keep (?:you|it) going|something loud|match\?/i, [['\u25b6 Something happy', 'play something happy'], ['\u25b6 Something chill', 'play something chill']]],
      [/surprise (?:mix|playlist|me)|pick one from your library|shake things up|pick one[?!]?$/i, [['\u25b6 Surprise me', 'surprise me'], ['\u25b6 Something happy', 'play something happy'], ['\u25b6 Songs I never played', 'play songs I have never played']]],
      [/play (?:something|a song)|listening to|ready for some music|what do you need|what can i (?:do|help)|ready when you are/i, [['\u25b6 Surprise me', 'surprise me'], ['\u25b6 Something chill', 'play something chill'], ['\u25b6 Something happy', 'play something happy'], ['\u2754 What can you do?', 'help']]]
    ];
    // "Try next": after a command finishes, offer 2 or 3 fitting commands from blSuggestions(). Skips the one just run,
    // and only appears after every other finished command so it stays a nudge and not noise.
    let blLastSent = '', blNudgeGap = 1;
    const BL_DONE = /^(?:\u2713|done\b|added\b|started\b|now playing\b|playing\b|tagged\b|split\b|queued\b|saved\b|created\b|made\b|set\b|turned\b|opened\b|cleared\b)/i;
    function blNextNudge(t) {
      if (!BL_DONE.test(t)) return;
      if (++blNudgeGap < 2) return; blNudgeGap = 0;
      const picks = blSuggestions().filter(c => c.toLowerCase() !== blLastSent).slice(0, 3); if (!picks.length) return;
      const cap1 = c => c[0].toUpperCase() + c.slice(1), play = /^(?:play|surprise|more like)/i;
      const row = actions(picks.map(c => [(play.test(c) ? '\u25b6 ' : '') + cap1(c), (b, r) => { r.remove(); send(c, true); }]));
      const lab = document.createElement('span'); lab.textContent = 'Try next:'; lab.style.cssText = 'font-size:12px;opacity:.7;align-self:center;white-space:nowrap';
      row.prepend(lab);
    }
    function blFollowUp(d, text) {
      setTimeout(() => {
        try {
          if (blTr || !d.isConnected || d.nextElementSibling) return;                       // newer message or buttons already there
          if (typeof CRISIS_MSG !== 'undefined' && text === CRISIS_MSG) return;     // never put "play something" under a safety message
          const t = String(text).trim();
          if (!/\?$|pick one!?$/i.test(t)) { blNextNudge(t); return; }              // a finished command: suggest what to do next
          const last = (t.match(/[^.!?]*[?!]?$/) || [''])[0].trim() || t, hit = BL_FOLLOW.find(r => r[0].test(last)) || BL_FOLLOW.find(r => r[0].test(t));
          if (!hit) return;
          const row = hit[1].map(([label, cmd]) => [label, (b, row) => { row.remove(); send(cmd, true); }]);
          row.push(['Not now', (b, row) => row.remove()]);
          actions(row);
        } catch (e) { console.error(e); }
      }, 80);
    }
    const setChatOn = v => { chatOn = !!v; lsSet('ppvChat', chatOn ? '1' : '0'); cfab.style.display = chatOn ? 'block' : 'none'; if (!chatOn) cbox.style.display = 'none'; try { vSync(); } catch (e) {} };
    cfab.style.display = chatOn ? 'block' : 'none';
    cfab.onclick = () => {
      if (Date.now() < blSuppress) return;
      const open = cbox.style.display !== 'flex'; cbox.style.display = open ? 'flex' : 'none'; if (open) { delete cfab.dataset.unread; blAnchor(); }
      if (open) { if (!clist.children.length) add('bot', blOpenLine()); cm('greet'); setTimeout(() => cm('idle'), 1300); cin.focus(); }
    };
    cbox.addEventListener('click', e => {
      const a = e.target.closest && e.target.closest('[data-a]'); if (!a) return;
      if (a.dataset.a === 'x') cbox.style.display = 'none';
      else if (a.dataset.a === 'aionly') { setAiOnly(!aiOnly); add('bot', aiOnly ? (brainOn() ? 'AI only is on. I will not jump in on keywords or commands. Everything goes to the AI. Switch it off to use commands like play something chill.' : 'AI only is on, but my AI brain is switched off in the settings, so I will keep using the normal helper until you turn the brain on.') : 'AI only is off. Commands and quick replies are back.'); }
      else if (a.dataset.a === 'music') { setMusicMode(!musicMode); add('bot', musicMode ? 'Music mode on. Ask me about your songs, artists and playlists, and I will stick to those.' : 'Music mode off. We can chat about anything again.'); }
      else if (a.dataset.a === 'clear') { clist.textContent = ''; hist = []; try { clearTimeout(blTr && blTr.timer); } catch (e) {} blTr = null; }
      else if (a.dataset.a === 'send') { const v = cin.value; cin.value = ''; vTyped(); send(v); }
      else if (a.dataset.a === 'mic') { vPrime(); dictate(); }
    });
    cin.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); const v = cin.value; cin.value = ''; vTyped(); send(v); } });

    const CRISIS = /(suicid|kill (myself|me)|end (my life|it all)|ending my life|want to die|wanna die|don'?t want to (live|be here|exist)|self[- ]?harm|hurt(ing)? myself|cut(ting)? myself|better off (dead|without me))/i;
    const CRISIS_MSG = "I'm really sorry you're hurting this much. I'm only a tiny music-app ball and I can't help with this the way a person can. Please reach out to someone right now: a friend or family member you trust, or a crisis line where you live (in the US you can call or text 988). If you might act on these thoughts, or you are in danger, call your local emergency number. You deserve real support.";
    const FAQ = [
      [/^\s*(hi|hello|hey|yo|hiya|sup|good (morning|evening|afternoon))\W*$/i, 'Hi! How are you feeling today?'],
      [/^\s*(thanks?|thank you|thx|ty|cheers)\W*$/i, "You're welcome!"],
      [/^\s*(ok(ay)?|cool|nice|great|good|lol|haha|k|yes|yeah|no|nope)\W*$/i, 'Okay! Want me to play something, or tell me how your day is going?'],
      [/^\s*(bye|goodbye|good ?night|see you|cya)\W*$/i, 'Bye! Take care.'],
      [/^\s*(how are you|how'?s it going|how are you doing|how do you feel|what'?s up|wassup|whats up)\W*$/i, ["I'm doing great, I'm a ball in a music player. How about you?", "Rolling along nicely! How are you?", "Pretty bouncy today. How are you feeling?"]],
      [/\b(tell (me )?a joke|joke|make me laugh|something funny)\b/i, ["Why did the song go to therapy? It had too many issues with its bridge.", "What's a ball's favorite music? Anything with a good bounce.", "Why was the musician arrested? She got caught with the notes.", "I'd tell you a joke about a drum, but it might be a bit flat. Wait, that's a different instrument."]],
      [/\b(fun fact|did you know|tell me something|random fact|music fact)\b/i, ["Fun fact: a song's tempo is measured in BPM, and most pop songs sit between 100 and 130.", "Fun fact: the human brain tends to remember songs from your teenage years better than almost any other music.", "Fun fact: a vocal-free version of a song is called an instrumental, and a karaoke track is usually one with the lead vocal removed.", "Fun fact: music at about 60 BPM is often used to help people relax, because it is close to a resting heartbeat."]],
      [/\b(you'?re|you are|u r|ur)\s+(so |really |very )?(cute|nice|great|awesome|cool|the best|amazing|funny|smart|sweet)\b|\b(i (like|love) you|good (bot|ball|job))\b/i, ["Aww, thank you! That made my day.", "You're sweet! Back at you.", "Thanks! I'm glad to help."]],
      [/\b(you'?re|you are|u r|ur)\s+(so |really |very )?(dumb|stupid|useless|bad|annoying|terrible|trash)\b|\b(i hate you|shut up)\b/i, ["Sorry about that, I missed it. Tell me what you wanted and I'll try again.", "Fair enough, I'm still learning. Say \u201chelp\u201d and I'll show what I can do for sure."]],
      [/\b(favou?rite (song|music|band|artist|genre)|what music do you like|what do you listen to)\b/i, ["I like anything with a good beat, but I can't really hear it. I just bounce along. What's yours?", "I'm a ball, so probably anything with bounce. What's your favorite?"]],
      [/\b(are you (real|human|alive|a (person|robot|bot))|are you ai)\b/i, "I'm Bloop, the AI buddy in this player. Not a person, but I love music and a good chat about pretty much anything."],
      [/\b(how old are you|where (do you|are you) (live|from)|do you (sleep|eat))\b/i, "I live inside this player, so I'm exactly as old as the page you opened. No sleeping or eating, just bouncing."],
      [/\b(i'?m|i am) (bored|so bored)\b|\bwhat should i (do|listen to|play)\b/i, ["Want me to play something upbeat? Just say \u201cplay something fun\u201d. Or tell me your mood and I'll pick for it.", "How about a mood playlist? Tell me how you feel and I'll find something from your tagged tracks."]],
      [/\b(good (morning|evening|night)|gn|gm)\b/i, ["Good one to you too! Want some music to go with it?", "Hey! Hope it's a good one."]],
      [/\b(what('?s| is) (the )?(time|date)|what time is it|what day is it)\b/i, () => new Date().toLocaleString([], { weekday: 'long', hour: 'numeric', minute: '2-digit', month: 'short', day: 'numeric' })],
      [/\b(sorry|my bad|oops)\b/i, ["No worries at all!", "It's all good."]],
      [/^\s*(help|\?|commands|what can i (say|ask))\W*$/i, "You can ask me to play a mood (\u201cI'm tired\u201d, \u201cplay something happy\u201d), make playlists, tag tracks, split stems, get lyrics, or control the player. You can also ask for a joke or a fun fact."],
      [/\b(stems?|karaoke|separat\w*|split (a |the |this |my )?(song|track|music)|vocal remov\w*)/i, 'Stems: play a track, open the Stems button, pick what to keep, then tap "Split current track". The pieces go to "Split tracks" in the library selector instead of All tracks. In that panel you can also make a playlist or a section for each split song.'],
      [/\bsurprise/i, 'Surprise playlists get put together from your tags while you are away. Turn them on under "Background tagging & surprise playlists" in the Library tab. When one shows up, tap Play to hear it, or Keep so it is not replaced later.'],
      [/\b(smart playlists?|auto(matic)? playlists?|make a playlist)/i, 'Smart playlists live in the Library tab under "AI tagging & smart playlists". Tick the ones you want and tap Create / update. They are real playlists and keep updating as tracks get tagged.'],
      [/\b(tagging|tag (a |my |the |all )?(song|track)s?|bpm|tempo)/i, 'AI tagging is in the Library tab. Tag one track, a chosen one, or everything. It finds tempo, key, genre and vibe. You can also let it tag while you are away in the background tagging settings.'],
      [/\b(lyrics?|subtitles?|captions?|whisper|transcrib\w*)/i, 'Lyrics: Whisper writes synced lyrics for songs (Lyrics tab) and subtitles for videos (captions menu). It runs on your device and downloads a model the first time.'],
      [/\b(who are you|what are you|your name|what can you do|how do you work)\b/i, "I'm Bloop, the little ball in this player. I can explain how things work here, suggest music for your mood, or just chat. I'm a very small AI, so I get things wrong sometimes."],
      [/\b(private|privacy|offline|where (does|is) (this|it) run|download)/i, 'I run on your device after a one-time download of about 150 MB, so what you tell me stays on your phone. I forget the chat when you close the page or tap Clear.']
    ];
    const MOODS = [
      [/\b(sad|down|blue|lonely|cry(ing)?|heartbroken)\b/i, 'chill', 'something gentle'],
      [/\b(stress(ed)?|anxious|anxiety|nervous|overwhelm\w*|worried|panic\w*)\b/i, 'chill', 'something calming'],
      [/\b(tired|sleepy|exhaust\w*|insomnia|can'?t sleep)\b/i, 'sleep', 'something to wind down'],
      [/\b(angry|mad|annoyed|frustrat\w*|furious)\b/i, 'workout', 'something with energy'],
      [/\b(happy|excited|amazing|pumped|joyful)\b/i, 'happy', 'something upbeat'],
      [/\b(bored|party|dance|dancing)\b/i, 'party', 'something fun'],
      [/\b(focus|study(ing)?|homework|concentrat\w*)\b/i, 'focus', 'something to focus to']
    ];
    function moodQueue(sid) {
      const A = window.__ppApi; if (!A) return [];
      const s = SMART.find(x => x.id === sid), tg = loadTags(), tr = A.tracks();
      const q = tr.map((t, i) => i).filter(i => { const c = tg[tr[i].dbId]; return !tr[i].stem && c && s.test(c, vibes(c)); });
      for (let i = q.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); const v = q[i]; q[i] = q[j]; q[j] = v; }
      return q.slice(0, 30);
    }
    function moodChip(text, retried) {
      const m = MOODS.find(x => x[0].test(text)); if (!m) return false;
      const q = moodQueue(m[1]);
      if (q.length < 3) {
        if (tagStats().left > 0 && !retried) { add('bot', 'I can pick music for how you feel once your tracks are tagged.'); actions([['Tag my library', (b, d) => { d.remove(); tagAll(() => moodChip(text, true)); }]]); }
        else add('bot', 'I do not have enough matching tagged tracks yet.');
        return true;
      }
      actions([['\u25b6 Play ' + m[2], () => { window.__ppApi.play(q[0], q); }], ['\u2795 Make a playlist', (b, d) => { d.remove(); moodPlaylist(m[1], 'For how you feel,'); }]]);
      return true;
    }
    // ---------- Bloop's personality: he has favorites, picked from YOUR library and remembered ----------
    const realTr = () => { const A = window.__ppApi; return A ? A.tracks().filter(x => !x.stem) : []; };
    const favState = () => { try { return JSON.parse(lsGet('ppvFav')) || {}; } catch (e) { return {}; } };
    const favSave = o => lsSet('ppvFav', JSON.stringify(o));
    const hashN = str => { let h = 0; for (const c of String(str)) h = (h * 31 + c.charCodeAt(0)) | 0; return Math.abs(h); };
    function favSong() { const tr = realTr(); if (!tr.length) return null; const st = favState(); let t = tr.find(x => x.dbId === st.song); if (!t) { t = tr[Math.floor(Math.random() * tr.length)]; st.song = t.dbId; favSave(st); } return t; }
    function favArtist() { const c = {}; realTr().forEach(x => { const a = (x.artist || '').trim(); if (a) c[a] = 1; }); const n = Object.keys(c); if (!n.length) return null; const st = favState(); if (!(st.artist && c[st.artist])) { st.artist = n[Math.floor(Math.random() * n.length)]; favSave(st); } return st.artist; }
    function favVibe() { const tg = loadTags(), c = {}; realTr().forEach(x => { const g = tg[x.dbId]; if (g) vibes(g).forEach(v => { c[v] = (c[v] || 0) + 1; }); }); const e = Object.entries(c).sort((a, b) => b[1] - a[1]); return e.length ? e[0][0] : null; }
    const songLine = t => '\u201c' + t.title + '\u201d' + (t.artist ? ' by ' + t.artist : '');
    const playMe = (t, label) => { const A = window.__ppApi, i = A.tracks().indexOf(t); if (i >= 0) actions([[label || '\u25b6 Play it', () => { A.play(i, [i]); }]]); };
    // Answers in character without any AI download. Returns false when the chat brain should handle it (free-form pretend/roleplay).
    function roleplay(text) {
      const x = String(text).trim().replace(/[?!.]+$/g, ''), A = window.__ppApi; if (!x) return false;
      // "favorite MOODY song", "favorite chill artist", "favorite jazz track": narrow his pick to tracks matching the tags.
      const GENERIC = new Set(['all', 'time', 'ever', 'overall', 'current', 'right', 'now', 'new', 'old', 'recent', 'one', 'single', 'of', 'the', 'a', 'an', 'your', 'ur', 'fav', 'favorite', 'favourite', 'best', 'top', 'to', 'for', 'in', 'my', 'this', 'that', 'listen', 'play', 'and', 'or']);
      const vibeFilter = () => {
        const ws = vibeWordsOf(x); let idx = null, label = '';
        if (ws.length) { idx = findVibe(ws, /\b(or|either)\b/i.test(x)); label = ws.join(' or '); if (ws.length === 1) { const tok = x.toLowerCase().split(/[^\p{L}\p{N}-]+/u).find(w => w === ws[0] || VIBE_SYN[w] === ws[0]); if (tok) label = tok; } }
        else { const mm = x.match(/\b(?:favou?rite|fav)\s+(.+?)\s+(?:songs?|tracks?|tunes?|jams?|music|artists?|bands?|singers?)\b/i); if (mm) { const lw = wordsOf(mm[1]).filter(w => !GENERIC.has(w)); if (lw.length) { idx = findTracks(lw); label = lw.join(' '); } } }
        return idx === null ? null : { idx: idx.filter(i => !A.tracks()[i].stem), label };
      };
      const favPick = (key, list, id) => { const st = favState(); st.v = st.v || {}; let v = st.v[key]; if (!list.some(it => id(it) === v)) { v = id(list[Math.floor(Math.random() * list.length)]); st.v[key] = v; favSave(st); } return list.find(it => id(it) === v); };
      const noMatch = label => { const S = tagStats(); add('bot', S.tagged.length ? 'None of your tagged tracks are ' + label + ', so I cannot pick a favorite there yet.' : 'I need your tracks tagged to pick a ' + label + ' favorite. Say \u201ctag all\u201d and ask me again!'); return true; };
      const noLib = () => { add('bot', pick(["My library is empty, so I have nothing to pick from yet! Add some songs and I'll choose a favorite.", "I need songs to have a favorite! Add some to the player first."])); return true; };
      if (/\b(your|ur)\b.*\b(favou?rite|fav)\b.*\b(artist|band|singer|musician|rapper)\b|\bwho do you (like|love|listen to)\b|\bwhich artist do you (like|love)\b/i.test(x)) {
        const vf = vibeFilter();
        if (vf) {
          if (!vf.idx.length) return noMatch(vf.label);
          const tr = A.tracks(), names = [...new Set(vf.idx.map(i => (tr[i].artist || '').trim()).filter(Boolean))]; if (!names.length) return add('bot', 'I do not see artist names on those tracks.'), true;
          const a = favPick('a:' + vf.label, names, n => n);
          add('bot', pick(['For ' + vf.label + ' stuff? ' + a + ', easily.', 'My favorite ' + vf.label + ' artist is ' + a + '. They always get me bouncing the right way.', a + '! Nobody does ' + vf.label + ' like them in your library.'])); return true;
        }
        const a = favArtist(); if (!a) return add('bot', "I do not see artist names on your tracks yet, so I can't pick one. Ask me about my favorite song instead!"), true;
        add('bot', pick(['Ooh, ' + a + '! Every time they come on I bounce a little higher.', 'Easy: ' + a + '. I picked them out of your library myself.', a + ', no contest. Rolling around to them is my favorite thing.'])); return true;
      }
      if (/\b(your|ur)\b.*\b(favou?rite|fav)\b.*\b(genre|vibe|mood|style|kind of music|type of music|sound)\b/i.test(x)) {
        const v = favVibe(); add('bot', v ? pick(['I love ' + v + ' stuff. It shows up the most in your tagged tracks and I bounce to it.', 'Definitely ' + v + '. That is what I hear most in your library.']) : "I can't tell yet! Tag your library and I'll find the vibe I like best."); return true;
      }
      if (/\b(your|ur)\b.*\b(favou?rite|fav)\b.*\bcolou?r\b/i.test(x)) { add('bot', pick(['Blue, like my ball body. Though I look great in whatever your theme is.', 'Whatever colors the visualizer is showing right now!'])); return true; }
      if (/\b(your|ur)\b.*\b(favou?rite|fav)\b.*\b(food|snack|meal)\b/i.test(x)) { add('bot', pick(["I'm a ball in a music player, so I run on good beats. Maybe bass-flavored?", "Anything with a lot of bass. I don't eat, but I'd try it."])); return true; }
      if (/\b(your|ur)\b.*\b(favou?rite|fav)\b.*\b(song|track|tune|jam|music)\b|\bwhat (song|track|music) do you (like|love|listen to|play)\b|\bwhat'?s your (favou?rite|fav)$|\bwhat are you (listening to|into)$|\bwhich (song|track) do you (like|love)\b|\bdo you have a favou?rite (song|track)\b/i.test(x)) {
        const vf = vibeFilter();
        if (vf) {
          if (!vf.idx.length) return noMatch(vf.label);
          const tr = A.tracks(), t = favPick('s:' + vf.label, vf.idx.map(i => tr[i]), z => z.dbId);
          add('bot', pick(['My favorite ' + vf.label + ' song? ' + songLine(t) + '. It gets me every time.', 'For ' + vf.label + ' vibes I pick ' + songLine(t) + '.', songLine(t) + '! Best ' + vf.label + ' track in your library, if you ask me.'])); playMe(t, '\u25b6 Play it with me'); return true;
        }
        const t = favSong(); if (!t) return noLib();
        add('bot', pick(['My favorite? ' + songLine(t) + '. I bounce extra high for that one.', 'Oh, easy: ' + songLine(t) + '. I picked it out of your library.', songLine(t) + '! Every time it plays I get a little dizzy with happiness.'])); playMe(t, '\u25b6 Play it with me'); return true;
      }
      const cu = A && A.currentIndex() >= 0 ? A.tracks()[A.currentIndex()] : null;
      if (/\b(do you (like|love|enjoy|hate)|what do you think (of|about)|how do you like|rate|what'?s your (rating|score) (for|of))\b.*\b(this|the current|current|playing)\b( song| track| one)?$|^(do you like (it|this)|rate (it|this|this song))$/i.test(x) && !/\b(volume|shuffle|repeat|playlist|video)\b/i.test(x)) {
        if (!cu) return add('bot', 'Play something first and I will tell you what I think!'), true;
        const fav = favSong(), r = fav && fav.dbId === cu.dbId ? 10 : 6 + hashN(cu.dbId) % 5;
        add('bot', (r === 10 ? 'That is MY FAVORITE! 10 out of 10, I could bounce to it all day.' : pick(['I give ' + songLine(cu) + ' a ' + r + ' out of 10. ', r + '/10 from me! ', 'Solid. Probably a ' + r + ' out of 10 for me. ']) + (r >= 9 ? 'I love it.' : r >= 8 ? 'Really nice.' : 'It grows on me.'))); return true;
      }
      if (/^(pick|choose|select|recommend|suggest)( me)?( a| one)?( song| track| tune)?( for me)?$|^(what|which) (song|track) (should i|do you think i should) (listen to|play)$|^what should i (listen to|play)$/i.test(x)) {
        const tr = realTr(); if (!tr.length) return noLib(); const t = tr[Math.floor(Math.random() * tr.length)];
        add('bot', pick(['How about ' + songLine(t) + '?', 'I pick ' + songLine(t) + '!', 'Try ' + songLine(t) + '. Trust the ball.'])); playMe(t, '\u25b6 Play it'); return true;
      }
      if (/\bdo you (like|love|enjoy) (music|songs|listening)\b/i.test(x)) { add('bot', pick(['I love it! It is basically my whole life. I live in a music player.', 'Music is the best. I can feel the bass in my little ball body.'])); return true; }
      if (/\b(can you|do you) (hear|dance|have ears|listen)\b/i.test(x)) { add('bot', pick(["I can't really hear, but I feel the beat in my own way and I bounce along.", 'I dance every time you press play. You just have to watch me.'])); return true; }
      if (/\b(role ?play|pretend|play pretend|act (like|as)|let'?s pretend)\b/i.test(x)) {
        if (brainOn()) return false;
        add('bot', "I'd love to play pretend! Without the chat brain I only do a little: ask me my favorite song, favorite artist or what I think of the current track. Turn on the chat brain in settings for freer roleplay."); return true;
      }
      return false;
    }
    const sysPrompt = () => {
      const A = window.__ppApi, t = A && A.tracks()[A.currentIndex()], c = t && loadTags()[t.dbId];
      return "You are Bloop, a small bouncy ball who lives in a music player." + blSkinNote() + " You are friendly, playful, gentle and a little silly. Reply in one or two short, plain sentences. No lists, no markdown, no emoji. Only state music facts you are sure of. If you are not sure, say so. Only name songs, artists and tags that appear in LIBRARY DATA below. Never invent them. You cannot press buttons or change the player, so never say you did something in the app. If the user wants an action, tell them what to type, such as play something chill, or say help for the full list. The app can split songs into stems, tag songs by mood, genre, tempo and key, write lyrics and subtitles with Whisper, make smart playlists, and set an equaliser. You are not a doctor, lawyer or financial adviser, and not a counselor. If someone sounds distressed, be kind and suggest talking to someone they trust. Keep everything suitable for all ages. If asked about your favourites, answer in character as Bloop and have fun with it." +
        (A && A.tracks().filter(x => !x.stem).length ? " The library has " + A.tracks().filter(x => !x.stem).length + " tracks, e.g. " + A.tracks().filter(x => !x.stem).slice(0, 5).map(x => x.title).join("; ") + "." : "") +
        (favSong() ? " Your favorite song is " + songLine(favSong()) + (favArtist() ? " and your favorite artist is " + favArtist() : "") + "." : "") +
        (t ? " Now playing: " + t.title + (c ? " (" + vibes(c).join(', ') + ")." : ".") : "");
    };
    // Android app: the chat model runs in Java (LlmNative: KV cache + sampling on the CPU). Tokenizing stays here, only token ids cross the bridge.
    const llmId = () => CHAT_MODELS[chatKey()].lid, llmUrl = () => CHAT_MODELS[chatKey()].url || ('https://huggingface.co/' + CHAT_MODELS[chatKey()].id + '/resolve/main/' + CHAT_MODELS[chatKey()].file);
    let llmNativeFailed = false;                                     // set when the Java runtime rejects the model: use the web version for the rest of the session
    async function nativeBrain(say) {
      const pcb = p => { if (p && p.status === 'progress' && p.file) say('Downloading ' + p.file.split('/').pop() + ' ' + Math.round(p.progress || 0) + '%'); };
      const tok = await tfMod.AutoTokenizer.from_pretrained(CHAT_MODEL, { progress_callback: pcb });
      if (!(await NP.exists({ id: llmId() })).ready) await nativeFetch(llmId(), llmUrl(), say);
      await NP.llmLoad({ id: llmId() });
      const eos = [];                                                  // end-of-turn ids for the chosen model
      for (const t of CHAT_MODELS[chatKey()].eos) { try { const e = tok.encode(t, { add_special_tokens: false }); if (e && e.length === 1) eos.push(Number(e[0])); } catch (x) {} }
      if (!eos.length) eos.push(0, 2);
      const g = async (msgs, opts) => {
        opts = opts || {};
        const prompt = Array.from(tok.apply_chat_template(msgs, { add_generation_prompt: true, tokenize: true, return_tensor: false }), Number);
        const ids = [], cb = opts.streamer && opts.streamer.callback_function; let shown = 0;
        const h = await NP.addListener('llmToken', e => {
          ids.push(e.id); if (!cb) return;
          const t = tok.decode(ids, { skip_special_tokens: true });
          if (t.length > shown && !t.endsWith('\ufffd')) { cb(t.slice(shown)); shown = t.length; }
        });
        let out;
        try { out = await NP.llmGenerate({ prompt, eos, maxNew: opts.max_new_tokens || 60, sample: opts.do_sample !== false, temp: opts.temperature == null ? 0.5 : opts.temperature, topP: opts.top_p == null ? 0.9 : opts.top_p, rep: opts.repetition_penalty || 1.1 }); }
        finally { h.remove(); }
        const text = tok.decode(out.tokens, { skip_special_tokens: true }).trim();
        return [{ generated_text: msgs.concat([{ role: 'assistant', content: text }]) }];
      };
      g.tokenizer = tok;
      g.dispose = async () => { try { await NP.llmUnload(); } catch (e) {} };
      return g;
    }
    // Android app, LiteRT-LM: plain text goes in, text streams back. No tokenizer or token ids on this side.
    async function nativeLm(say) {
      const m = CHAT_MODELS[chatKey()];
      if (!(await NP.exists({ id: m.lid })).ready) await nativeFetch(m.lid, m.url, say);
      say('Starting the model\u2026');
      await NP.lmLoad({ id: m.lid, gpu: lsGet('ppvLmGpu') !== '0' });   // phone GPU by default: several times faster; the app falls back to the CPU if it can't
      const g = async (msgs, opts) => {
        opts = opts || {};
        const sys = msgs.length && msgs[0].role === 'system' ? String(msgs[0].content) : '';
        const rest = msgs.filter(x => x.role !== 'system'), last = rest.pop();
        const history = rest.map(x => ({ role: x.role === 'assistant' ? 'assistant' : 'user', text: String(x.content) }));
        const cb = opts.streamer && opts.streamer.callback_function, greedy = opts.do_sample === false;
        const h = await NP.addListener('lmText', e => { if (cb && e && e.text) cb(e.text); });
        let out;
        try { out = await NP.lmChat({ system: sys, history, user: last ? String(last.content) : '', maxNew: opts.max_new_tokens || 60, temp: greedy ? 0 : (opts.temperature == null ? 0.5 : opts.temperature), topK: greedy ? 1 : (opts.top_k || 40), topP: opts.top_p == null ? 0.9 : opts.top_p, rep: opts.repetition_penalty || 1.1 }); }
        finally { h.remove(); }
        const text = String((out && out.text) || '').trim();
        return [{ generated_text: msgs.concat([{ role: 'assistant', content: text }]) }];
      };
      g.lm = true;
      g.dispose = async () => { try { await NP.lmUnload(); } catch (e) {} };
      return g;
    }
    async function ensureModel(say) {
      if (gen) return gen; if (genP) return genP;
      genP = (async () => {
        say('Loading my brain\u2026');
        if (NATIVE && !llmNativeFailed) {                                // native models don't need the web AI library at all
          if (CHAT_MODELS[chatKey()].lm) { try { gen = await nativeLm(say); lsSet('ppvChatDl', '1'); return gen; } catch (e) { console.warn('Native chat model failed, using the web version', e); llmNativeFailed = true; say('Native brain unavailable, using the web version\u2026'); } }
        }
        if (!tfMod) tfMod = await import(TF_URL);
        if (NATIVE && !llmNativeFailed && !CHAT_MODELS[chatKey()].lm) {
          try { gen = await nativeBrain(say); lsSet('ppvChatDl', '1'); return gen; }
          catch (e) { console.warn('Native chat model failed, using the web version', e); llmNativeFailed = true; say('Native brain unavailable, using the web version…'); }
        }
        const gpuOn = lsGet('ppvChatGpu') === '1' && navigator.gpu;
        try { tfMod.env.backends.onnx.wasm.numThreads = self.crossOriginIsolated ? Math.min(2, navigator.hardwareConcurrency || 2) : 1; } catch (e) {}   // fewer threads = less RAM
        const pcb = p => { if (p && p.status === 'progress' && p.file) say('Downloading ' + p.file.split('/').pop() + ' ' + Math.round(p.progress || 0) + '%'); };
        try { gen = await tfMod.pipeline('text-generation', CHAT_MODEL, { dtype: gpuOn ? 'fp16' : 'q8', device: gpuOn ? 'webgpu' : 'wasm', progress_callback: pcb }); }   // q4 is too lossy for a 135M model: it prints garbage
        catch (e) { if (!gpuOn) throw e; gen = await tfMod.pipeline('text-generation', CHAT_MODEL, { dtype: 'q8', device: 'wasm', progress_callback: pcb }); }
        lsSet('ppvChatDl', '1');
        try { if (navigator.storage && navigator.storage.persist) await navigator.storage.persist(); } catch (e) {}   // ask the browser not to evict the downloaded model files
        return gen;
      })();
      try { return await genP; } finally { genP = null; }
    }
    // Take the language model out of RAM (it stays on disk and reloads later without asking).
    async function unloadModel() { clearTimeout(idleT); if (gen) { const g = gen; gen = null; try { await g.dispose(); } catch (e) {} } }
    // How long the model may sit idle in RAM. Reloading a big model takes seconds, so phones with plenty of RAM keep it
    // around for 5 minutes; heavy jobs (split, lyrics, tagging) still free it first.
    const bigRam = () => { try { return (navigator.deviceMemory || 0) >= 8; } catch (e) { return false; } };
    const keepMs = () => bigRam() ? 300000 : 60000;
    const idleUnload = () => { clearTimeout(idleT); idleT = setTimeout(() => { if (gen && !chatBusy && !holdModel) unloadModel(); }, keepMs()); };
    const heavyBusy = () => ['ppv-go', 'ppv-wgo', 'ppv-tag'].some(id => { const b = document.getElementById(id); return b && b.disabled; });
    // The chat brain (tiny language model) is optional. Everything Bloop DOES (moods, playlists, tagging, player control) runs without it.
    const brainOn = () => { const v = lsGet('ppvBrain'); return v == null ? lsGet('ppvChatDl') === '1' : v === '1'; };   // unset: on only if it was already downloaded
    const setBrain = v => { lsSet('ppvBrain', v ? '1' : '0'); if (!v) unloadModel(); const b = document.getElementById('ppv-brain-on'); if (b) b.checked = !!v; };
    const looksOk = r => { const L = (r.match(/\p{L}/gu) || []).length, W = (r.match(/\p{L}{2,}/gu) || []).length; return r.length <= 8 || (L / r.length >= 0.6 && W >= 2); };
    const FALLBACK = { split: 'Your split tracks are ready.', lyrics: 'The lyrics are ready.', tag: 'Tagging is finished.' };
    // Write the "all done" line NOW, while the model is loaded, so the model can leave RAM before the heavy job starts.
    // Never downloads the model just for this; falls back to a fixed line if it is missing, slow or garbled.
    async function signoff(job) {
      if (!brainOn() || (!gen && lsGet('ppvChatDl') !== '1')) return null;
      let aborted = false;
      const p = (async () => {
        const g = await ensureModel(() => {}); if (aborted) return null;
        const out = await g([{ role: 'system', content: 'You are Bloop, a friendly ball mascot in a music player. Reply with one short, warm sentence.' },
          { role: 'user', content: 'The task "' + job.what + '" just finished successfully. Tell me so in one short sentence.' }], { max_new_tokens: 40, do_sample: true, temperature: 0.5, top_p: 0.9, repetition_penalty: 1.1 });
        let r = out && out[0] && out[0].generated_text; r = Array.isArray(r) ? (r[r.length - 1] || {}).content : r;
        r = String(r || '').trim().split(/\n/)[0]; return r && r.length < 220 && looksOk(r) ? r : null;
      })().catch(() => null);
      const r = await Promise.race([p, new Promise(res => setTimeout(() => res(null), 25000))]);
      aborted = true; p.then(unloadModel); return r;
    }
    // Heavy job: write the sign-off, drop the model from RAM, THEN start the job; jobEnd() posts the message when it finishes.
    async function runJob(kind, what, start, after) {
      if (heavyBusy()) return add('bot', "I'm in the middle of another job. Ask me again when it finishes.");
      const job = { kind, what, msg: null, after }; pendingJob = job; chatBusy = true; cm('work');
      add('bot', "\u2713 On it. I'll message you here when it's done.");
      try { job.msg = await signoff(job); await unloadModel(); }
      catch (e) { console.error(e); }
      chatBusy = false; cm('idle');
      if (pendingJob !== job) return;
      if (!start()) { pendingJob = null; add('bot', "I couldn't start that. Another job may be running."); return; }
      setTimeout(() => { if (pendingJob === job && !heavyBusy()) pendingJob = null; }, 3000);   // it never started (e.g. you cancelled a prompt)
    }
    function jobEnd(text) {
      const j = pendingJob; if (!j) return; text = String(text || ''); let msg;
      if (/^(Done|Tagged and saved)/.test(text)) msg = '\u2713 ' + (j.msg || FALLBACK[j.kind]) + (/^Done\./.test(text) && text.length > 6 ? '\n' + text : '');
      else if (/^Stopped/.test(text)) msg = 'Okay, I stopped. ' + text.replace(/^Stopped\.?\s*/, '');
      else if (/^(Error|Stalled)/.test(text)) msg = "That didn't work: " + text.replace(/^Error:\s*/, '');
      else return;
      pendingJob = null; add('bot', msg.trim());
      if (cbox.style.display !== 'flex') cfab.dataset.unread = '1';
      if (j.after && /^(Done|Tagged and saved)/.test(text)) { try { j.after(); } catch (e) { console.error(e); } }   // e.g. build the playlist that was waiting for tags
    }
    const askYN = (q, yes, no, yl, nl) => { if (blChain) blPaused = true; add('bot', q); actions([[yl || 'Yes', (b, d) => { d.remove(); yes(); blResume(); }], [nl || 'No', (b, d) => { d.remove(); if (no) no(); else add('bot', 'Okay, never mind.'); blResume(); }]]); };
    const tagStats = () => { const A = window.__ppApi, tg = loadTags(), real = A ? A.tracks().filter(t => !t.stem) : [], tagged = real.filter(t => tg[t.dbId]); return { A, tg, real, tagged, left: real.length - tagged.length }; };
    function tagAll(after) {
      const sc = $id('ppv-scope'); if (!sc || !$id('ppv-tag')) return add('bot', 'Tagging is not ready yet. Open the Stems panel once, then try again.');
      runJob('tag', 'tagging your whole library', () => { const b = $id('ppv-tag'); if (!b || b.disabled) return false; const prev = sc.value; sc.value = 'all'; b.click(); sc.value = prev; return true; }, after);
    }
    // Same live "\u2728 Name" playlist the tagger panel makes, so it keeps updating as tracks get tagged.
    function buildMood(sm, tr, tg) {
      const A = window.__ppApi, name = '\u2728 ' + sm.name, pl = A.playlists().find(x => x.name === name) || A.createPlaylist(name);
      Object.assign(pl, { auto: 'smart', smartKey: sm.id });
      let n = 0; tr.forEach(t => { const c = !t.stem && tg[t.dbId]; if (c && sm.test(c, vibes(c)) && A.addToPlaylist(t.dbId, pl.id)) n++; });
      return { pl, n };
    }
    // Mood playlist from the tagger's mood data. No chat AI involved. Offers to tag first when there is too little to go on.
    function moodPlaylist(sid, why, retried) {
      const { A, tg, real, tagged, left } = tagStats(), sm = SMART.find(x => x.id === sid);
      if (!A || !sm) return add('bot', 'I cannot reach your library yet.');
      if (!real.length) return add('bot', 'Your library is empty.');
      const n = tagged.filter(t => sm.test(tg[t.dbId], vibes(tg[t.dbId]))).length, nm = sm.name.toLowerCase();
      if (left > 0 && n < 5 && !retried) {
        askYN((tagged.length ? 'Only ' + n + ' of your tagged tracks sound ' + nm + ' so far, and ' + left + ' are not tagged yet.' : 'None of your tracks are tagged yet, and I pick by mood from the tags.') + ' Tag your library first? It can take a while. I will make the playlist when it is done.',
          () => tagAll(() => moodPlaylist(sid, why, true)), n ? () => moodPlaylist(sid, why, true) : null, n ? 'Tag first' : 'Yes', n ? 'Use what I have' : 'No');
        return;
      }
      if (!n) return add('bot', 'None of your ' + tagged.length + ' tagged tracks sound ' + nm + '. Tagging more tracks, or ticking \u201cMood models\u201d in the Library tab, helps me tell.');
      const tr = A.tracks(), r = buildMood(sm, tr, tg); A.commitPlaylists();
      const q = shuffleIn(tr.map((t, i) => i).filter(i => !tr[i].stem && tg[tr[i].dbId] && sm.test(tg[tr[i].dbId], vibes(tg[tr[i].dbId]))));
      add('bot', '\u2713 ' + (why ? why + ' ' : '') + 'Made \u201c' + r.pl.name + '\u201d with ' + r.n + ' track' + (r.n === 1 ? '' : 's') + (left ? ' (' + left + ' untagged tracks were left out)' : '') + '. Find it in the Playlists tab; it keeps updating as tracks get tagged.' + (tagged.some(c => c.hd) ? '' : '\nTip: tick \u201cMood models\u201d in the Library tab for sharper moods.'));
      actions([['\u25b6 Play it', () => { A.play(q[0], q); }]]);
      if (cbox.style.display !== 'flex') cfab.dataset.unread = '1';
    }
    function smartAll(retried) {
      const { A, tg, tagged } = tagStats(); if (!A) return add('bot', 'I cannot reach your library yet.');
      if (!tagged.length && !retried) return askYN('None of your tracks are tagged yet, and smart playlists are built from tags. Tag your library first? I will make them when it is done.', () => tagAll(() => smartAll(true)));
      const made = SMART.map(sm => [sm, tagged.filter(t => sm.test(tg[t.dbId], vibes(tg[t.dbId]))).length]).filter(x => x[1] >= 3);
      if (!made.length) return add('bot', 'No mood has 3 or more tagged tracks yet. Tag more tracks first.');
      const tr = A.tracks(); made.forEach(([sm]) => buildMood(sm, tr, tg)); A.commitPlaylists();
      add('bot', '\u2713 Made or updated ' + made.length + ' mood playlists:\n' + made.map(([sm, n]) => '\u2728 ' + sm.name + ' (' + n + ')').join('\n'));
    }
    // What Bloop says to something that is not a command when the chat brain is off: still helpful, no model needed.
    function fallbackReply(text) {
      if (MOODS.find(x => x[0].test(text))) { add('bot', pick(["That sounds hard. Want to tell me more, or shall I find some music for it?", "I'm sorry it feels like that. Want some music to go with it?", 'Thanks for telling me. Music might help a little.'])); moodChip(text); return; }
      add('bot', "I need my chat brain on to talk about that. Without it I can play music by mood, make playlists, tag, split, get lyrics and control the player. Say \u201chelp\u201d for the list.");
      actions([['Turn on chat AI', (b, d) => { d.remove(); setBrain(true); dlOk = true; send(text, true); }], ['No thanks', (b, d) => d.remove()]]);
    }
    async function freeChat() {
      if (gen) { try { await gen.dispose(); } catch (e) {} gen = null; }
      if (NATIVE) { for (const m of Object.values(CHAT_MODELS)) { try { await NP.remove({ id: m.lid }); } catch (e) {} } }
      lsSet('ppvChatDl', '0');
      const ks = await caches.keys();
      for (const k of ks) if (/transformers/i.test(k)) { const c = await caches.open(k); for (const r of await c.keys()) if (/SmolLM2|Qwen2\.5-0\.5B|Llama-3\.2-1B/i.test(r.url)) await c.delete(r); }
    }
    // Switch the chat model: drop the loaded one, and ask for the new download the next time Bloop chats.
    async function setChatModel(k) {
      if (!CHAT_MODELS[k]) return;
      try { localStorage.setItem('ppvChatModel', k); } catch (e) {}
      CHAT_MODEL = webId(k); llmNativeFailed = false; dlOk = false;
      await unloadModel();
      lsSet('ppvChatDl', '0');
    }
    // AGENT START
