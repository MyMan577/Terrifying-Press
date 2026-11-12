    // ---------- Agent: Bloop does things when asked ----------
    // Fixed command patterns, not model guesswork: a 135M model cannot be trusted to pick tools, and it must never claim
    // it did something it did not. Light actions run at once; heavy ones (split, tag all, lyrics) ask first.
    const agentOn = () => lsGet('ppvAgent') !== '0';
    const $id = id => document.getElementById(id);
    const mediaOn = () => [...document.querySelectorAll('audio,video')].some(m => !m.paused && !m.ended && m.readyState > 2);
    const SYN = { relax: 'chill', relaxing: 'chill', relaxed: 'chill', calm: 'chill', mellow: 'chill', dance: 'party', dancing: 'party', gym: 'workout', exercise: 'workout', upbeat: 'happy', moody: 'sad', melancholy: 'sad', melancholic: 'sad', gloomy: 'sad', somber: 'sad', depressing: 'sad', sorrowful: 'sad', emotional: 'sad', angry: 'aggressive', furious: 'aggressive', study: 'focus', studying: 'focus', instrumentals: 'instrumental',
      song: '', songs: '', track: '', tracks: '', music: '', tunes: '', something: '', some: '', a: '', an: '', the: '', me: '', my: '', to: '', for: '', of: '', with: '', from: '' };
    const VIBEW = new Set(['chill', 'party', 'workout', 'happy', 'sad', 'focus', 'sleep', 'acoustic', 'instrumental', 'slow', 'fast', 'aggressive', 'vocals', 'mid-tempo']);

    // Many ways to say each vibe. Every word here maps to one of the tagger's vibes (the VIBEW set).
    const VIBE_SYN = {};
    Object.entries({
      chill: 'relax relaxing relaxed relaxation calm calming mellow soothing peaceful gentle soft smooth laidback laid-back easygoing tranquil serene lounge lofi lo-fi cozy cosy dreamy breezy unwind zen quiet tender downtempo chilled chillout chilling easy comforting',
      party: 'dance dancing danceable club clubbing rave banger bangers bop bops groovy groove funky festive celebrate celebration lively disco edm bounce bouncy',
      workout: 'gym exercise exercising cardio running run jogging lifting training pump pumped pumping energetic energy motivational motivation hype hyped powerful adrenaline sprint',
      happy: 'upbeat cheerful joyful joy fun sunny positive uplifting feel-good feelgood bright cheery playful optimistic summer smile bubbly',
      sad: 'moody melancholy melancholic gloomy somber sombre depressing depressed sorrowful emotional heartbreak heartbroken tearjerker crying cry lonely sentimental nostalgic bittersweet dark brooding haunting mournful grief down bleak wistful tragic angsty blue sorrow',
      focus: 'study studying homework concentrate concentration work working reading productivity coding deep-work background',
      sleep: 'sleepy sleeping bedtime lullaby insomnia nap drowsy nighttime goodnight',
      acoustic: 'unplugged stripped organic',
      instrumental: 'instrumentals wordless no-vocals karaoke backing',
      slow: 'slower ballad ballads slow-tempo',
      fast: 'quick speedy up-tempo uptempo rapid fast-paced fastpaced brisk',
      aggressive: 'angry furious rage raging heavy hard harsh brutal intense loud rough fierce aggro fury',
      vocals: 'singing sung vocal lyrics',
      'mid-tempo': 'midtempo medium-tempo moderate'
    }).forEach(([v, ws]) => ws.split(' ').forEach(w => { VIBE_SYN[w] = v; }));
    // Phrases that mean a vibe without a single keyword.
    const VIBE_PHRASES = [[/\b(make(s)? me (cry|sad|emotional)|break ?up|broken heart|miss(ing)? (someone|you|her|him)|feel(ing)? (low|down|blue)|rainy day)\b/i, 'sad'], [/\b(get(ting)? (me )?(pumped|hyped|moving|energi[sz]ed)|work(ing)? out|lift(ing)? weights|pre-?game|run(ning)? (a )?(race|marathon)|burn calories)\b/i, 'workout'], [/\b(fall(ing)? asleep|go(ing)? to (sleep|bed)|can'?t sleep|before bed|put me to sleep|help me sleep)\b/i, 'sleep'], [/\b(wind(ing)? down|chill(ing)? out|take it easy|relax(ing)? (after|at)|after (a )?(long|hard) (day|week)|sunday morning)\b/i, 'chill'], [/\b(get(ting)? work done|do(ing)? (my )?(homework|work)|concentrat\w+|stay(ing)? focused|deep work|study(ing)? (for|session)|background (music|noise))\b/i, 'focus'], [/\b(house party|pre-?party|go(ing)? out|night out|get(ting)? the party started|dance floor|dancefloor)\b/i, 'party'], [/\b(road ?trip|sunny day|good mood|feel(ing)? good|put me in a good mood|cheer me up|cheer up)\b/i, 'happy'], [/\b(without (vocals|singing|lyrics)|no (vocals|singing|lyrics)|just (music|beats))\b/i, 'instrumental'], [/\b(with (vocals|singing|lyrics)|someone singing)\b/i, 'vocals'], [/\b(blow off steam|let (it|off) out|(feel(ing)?|so) (angry|mad)|rage)\b/i, 'aggressive'], [/\b(mid[- ]?tempo|medium (tempo|speed|pace))\b/i, 'mid-tempo'], [/\b(slow(er)? (and|\+) (soft|gentle|sad)|slow jam|slow songs?)\b/i, 'slow'], [/\b(fast[- ]?paced|up[- ]?tempo|high energy|full speed)\b/i, 'fast']];
    function vibeWordsOf(text) {
      const x = String(text).toLowerCase(), out = [], addV = v => { if (v && !out.includes(v)) out.push(v); };
      VIBE_PHRASES.forEach(([re, v]) => { if (re.test(x)) addV(v); });
      x.replace(/[^\p{L}\p{N}\s'-]/gu, ' ').split(/\s+/).filter(Boolean).forEach(w => { const v = VIBEW.has(w) ? w : VIBE_SYN[w]; if (v === 'vocals' && /\b(without|no)\s+(vocals?|singing|lyrics)\b/.test(x)) return; addV(v); });
      return out;
    }
    // Words that are also common in song titles stay out of the general search mapping, so "play Dark Horse" still finds Dark Horse.
    { const RISK = new Set(['dark', 'blue', 'down', 'heavy', 'hard', 'run', 'running', 'summer', 'fun', 'sunny', 'cry', 'crying', 'work', 'working', 'reading', 'loud', 'rough', 'quiet', 'soft', 'easy', 'bright', 'smooth', 'energy', 'groove', 'bounce', 'organic', 'lyrics', 'vocal', 'sung', 'singing', 'moderate', 'quick', 'rapid', 'stripped', 'background', 'rage', 'fury', 'joy', 'sorrow', 'smile', 'training', 'club', 'disco', 'banger', 'bangers', 'bop', 'bops', 'zen', 'lounge', 'nap', 'lonely', 'tender', 'gentle', 'powerful', 'positive', 'lively', 'fierce', 'brutal', 'harsh']);
      Object.keys(VIBE_SYN).forEach(k => { if (!RISK.has(k) && !(k in SYN)) SYN[k] = VIBE_SYN[k]; }); }
    const wordsOf = s => String(s).toLowerCase().replace(/[^\p{L}\p{N}\s'-]/gu, ' ').split(/\s+/).filter(Boolean).map(w => SYN[w] === undefined ? w : SYN[w]).filter(Boolean);
    const shuffleIn = a => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); const v = a[i]; a[i] = a[j]; a[j] = v; } return a; };
    function findTracks(ws) {
      const A = window.__ppApi, tr = A.tracks(), out = []; if (!ws.length) return out;
      tr.forEach((t, i) => {
        if (t.stem) return;
        const ti = (t.title + ' ' + (t.artist || '')).toLowerCase(), hay = ti + ' ' + (window.__ppTagText ? window.__ppTagText(t.dbId) : '');
        if (ws.every(w => hay.includes(w))) out.push([i, ws.filter(w => ti.includes(w)).length]);
      });
      return out.sort((a, b) => b[1] - a[1]).map(o => o[0]);
    }
    // ---------- Library matcher for "play ..." / "open ..." (fast, no model) ----------
    // Understands artists ("play Drake", "something by Drake", "Drake's songs"), "<title> by <artist>", small typos
    // and featured-artist credits. Returns null when nothing is close; then the caller can offer "did you mean".
    const mNorm = x => String(x || '').toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
    const mFlat = x => mNorm(x).replace(/ /g, '');
    function mLev(a, b, max) {                                          // edit distance, gives up past max
      if (Math.abs(a.length - b.length) > max) return max + 1;
      let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
      for (let i = 1; i <= a.length; i++) {
        const cur = [i]; let best = i;
        for (let j = 1; j <= b.length; j++) { cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)); best = Math.min(best, cur[j]); }
        if (best > max) return max + 1; prev = cur;
      }
      return prev[b.length];
    }
    // How well a name matches what was said: 1 exact .. 0 nothing. Tolerates typos, missing spaces and a trailing "s".
    function mScore(name, q) {
      const a = mFlat(name).replace(/^the(?=.{3})/, ''), b = mFlat(q).replace(/^the(?=.{3})/, ''); if (!a || !b) return 0;   // 'The Weeknd' = 'weeknd'
      if (a === b || a === b.replace(/s$/, '') || a.replace(/s$/, '') === b) return 1;
      if (b.length >= 3 && a.startsWith(b)) return 0.86 + 0.1 * b.length / a.length;
      if (b.length >= 4 && a.includes(b)) return 0.8 + 0.1 * b.length / a.length;
      if (a.length >= 4 && b.includes(a)) return 0.78;
      const max = b.length >= 9 ? 2 : b.length >= 4 ? 1 : 0, d = max ? mLev(a, b, max) : 99;
      if (d <= max) return 0.8 - 0.05 * d;
      const wa = mNorm(name).split(' '), wb = mNorm(q).split(' ').filter(w => w.length > 1);
      if (!wb.length) return 0;
      const hit = wb.filter(w => wa.some(x => x === w || (w.length >= 5 && mLev(x, w, 1) <= 1))).length;
      return hit === wb.length ? 0.7 : hit / wb.length >= 0.6 ? 0.5 : 0;
    }
    const mArtists = () => {                                            // artist name -> track indexes, credits split ("A feat. B", "A & B")
      const tr = window.__ppApi.tracks(), by = new Map();
      tr.forEach((t, i) => {
        if (t.stem || !t.artist || /^(unknown artist|video|stream)$/i.test(t.artist)) return;
        const parts = new Set([t.artist, ...String(t.artist).split(/\s*(?:,|&|\bfeat\.?|\bft\.?|\bfeaturing\b|\bx\b|\bwith\b|\band\b)\s*/i)].map(x => x.trim()).filter(x => x.length > 1));
        parts.forEach(n => { const k = mNorm(n); if (!k) return; if (!by.has(k)) by.set(k, { name: n, idxs: [] }); by.get(k).idxs.push(i); });
      });
      return [...by.values()];
    };
    function mBestArtist(q, min) {
      let best = null, bs = 0;
      mArtists().forEach(a => { const sc = mScore(a.name, q) + Math.min(0.02, a.idxs.length / 1000); if (sc > bs) { bs = sc; best = a; } });
      return best && bs >= (min || 0.75) ? Object.assign({ score: bs }, best) : null;
    }
    function mBestSongs(q, pool) {                                      // indexes ranked by title match
      const tr = window.__ppApi.tracks(), ids = pool || tr.map((x, i) => i).filter(i => !tr[i].stem);
      return ids.map(i => [i, mScore(tr[i].title, q)]).filter(x => x[1] >= 0.7).sort((x, y) => y[1] - x[1]);
    }
    // "play X": {kind:'artist', a} | {kind:'song', idx, queue} | null
    function resolveMusic(raw) {
      let q = String(raw).trim().replace(/[.!?]+$/, '');
      q = q.replace(/^(?:(?:some|any|a|an|the|my|me|more|all)\s+)+/i, '');
      let m;
      if ((m = q.match(/^(?:(?:songs?|music|tracks?|stuff|something|anything|hits?|albums?)\s+)?(?:by|from)\s+(.+)$/i))) { const a = mBestArtist(m[1], 0.7); return a ? { kind: 'artist', a } : null; }
      if ((m = q.match(/^(.+?)(?:'s|\u2019s|s')\s+(?:songs?|music|tracks?|stuff|hits?|albums?)$/i)) || (m = q.match(/^(.+?)\s+(?:songs?|music|tracks?|hits?)$/i))) { const a = mBestArtist(m[1], 0.7); if (a) return { kind: 'artist', a }; q = m[1]; }
      if ((m = q.match(/^(.+?)\s+by\s+(.+)$/i))) {                     // "<title> by <artist>"
        const a = mBestArtist(m[2], 0.7);
        if (a) { const s = mBestSongs(m[1], a.idxs); if (s.length) return { kind: 'song', idx: s[0][0], queue: [s[0][0], ...a.idxs.filter(i => i !== s[0][0])] }; }
      }
      const songs = mBestSongs(q), art = mBestArtist(q, 0.75);
      // An exact artist beats a loose title; an exact title beats a loose artist.
      if (art && (!songs.length || art.score >= songs[0][1] || art.score >= 0.99)) return { kind: 'artist', a: art };
      if (songs.length) return { kind: 'song', idx: songs[0][0], queue: songs.map(x => x[0]).slice(0, 30) };
      return null;
    }
    // Closest names for "did you mean": a few artists and titles that are near but not good enough to act on.
    function nearMisses(q) {
      const tr = window.__ppApi.tracks(), out = [];
      mArtists().forEach(a => { const sc = mScore(a.name, q); if (sc >= 0.45) out.push([sc, 'play ' + a.name, a.name]); });
      tr.forEach((t, i) => { if (t.stem) return; const sc = mScore(t.title, q); if (sc >= 0.45) out.push([sc, 'play ' + t.title + (t.artist ? ' by ' + t.artist : ''), t.title]); });
      const seen = new Set(); return out.sort((x, y) => y[0] - x[0]).filter(x => !seen.has(x[2]) && seen.add(x[2])).slice(0, 3);
    }
    const HELP = 'I can do things when you ask:\n\u2022 play / pause / next / previous / shuffle on\n\u2022 \u201cplay something chill\u201d, \u201cplay <song name>\u201d, \u201csurprise me\u201d\n\u2022 \u201cvolume 40\u201d, \u201clouder\u201d, \u201cmute\u201d\n\u2022 \u201csleep timer 30 minutes\u201d\n\u2022 \u201cmake a playlist of slow piano\u201d, \u201cadd this to <playlist>\u201d\n\u2022 \u201ctag this song\u201d, \u201csplit this song\u201d, \u201cget the lyrics\u201d, \u201cmore like this\u201d\n\u2022 \u201cturn on background tagging\u201d\n\u2022 \u201cmake a chill playlist\u201d, \u201cplaylist for studying\u201d, \u201cmake a playlist for when I\u2019m stressed\u201d, \u201cmake smart playlists\u201d, \u201cwhat mood is this\u201d, \u201cauto EQ\u201d (no chat AI needed)\n\u2022 \u201cskip 30 seconds\u201d, \u201crewind 10\u201d, \u201cgo to 1:30\u201d, \u201crestart\u201d, \u201chow long is left\u201d\n\u2022 \u201crepeat this song\u201d, \u201cspeed 1.5x\u201d, \u201cfullscreen\u201d, \u201ceq rock\u201d, \u201cloop start\u201d / \u201cloop end\u201d\n\u2022 \u201cmy playlists\u201d, \u201cplay my gym playlist\u201d, \u201cremove this from <playlist>\u201d, \u201crename playlist X to Y\u201d, \u201cdelete playlist X\u201d\n\u2022 \u201clibrary stats\u201d, \u201cwhat\u2019s the BPM\u201d, \u201cplay the fastest song\u201d, \u201cplay songs around 120 bpm\u201d, \u201cplay slow songs\u201d\n\u2022 \u201copen my portfolio\u201d, \u201cmy top artist\u201d, \u201cmost played song\u201d, \u201ctop 5 songs\u201d, \u201chow much have I listened\u201d, \u201cwhen do I listen most\u201d, \u201cmy streak\u201d\n\u2022 \u201cwhat songs do I have\u201d, \u201csongs by <artist>\u201d, \u201cdo I have <song>\u201d, \u201cfind <song>\u201d, \u201cmy artists\u201d, \u201cmy videos\u201d, \u201crecently added\u201d, \u201cuntagged songs\u201d, \u201cwhich songs are chill\u201d\n\u2022 Ask me about me: \u201cwhat\u2019s your favorite song?\u201d, \u201cfavorite artist?\u201d, \u201cdo you like this song?\u201d, \u201cpick a song for me\u201d\n\u2022 From your tags: \u201cany moody songs?\u201d, \u201cwhat genre is this?\u201d, \u201cwhat instruments are in this?\u201d, \u201cis this song sad?\u201d, \u201ctell me about this song\u201d\n\u2022 \u201csearch for jazz\u201d, \u201copen settings\u201d, \u201cplay the first song\u201d, \u201czoom in\u201d, \u201cnext filter\u201d\nYou can say it your own way too: \u201ctoo quiet\u201d, \u201cI don\u2019t like this one\u201d, \u201cstop in half an hour\u201d, \u201cwho sings this\u201d.\nOr just chat with me.';
    // Whenever the agent handles a message (a command, or a loose phrasing it understood), the model is dropped from RAM.
    // ---------- Song summaries in the chat: show the saved one, or write one with the chat model ----------
    let sumBusy = false;
    async function chatSummary(i, fresh) {
      const A = window.__ppApi, t = A.tracks()[i]; if (!t) return;
      const label = t.title + (t.artist && !/^(unknown artist|video|stream)$/i.test(t.artist) ? ' by ' + t.artist : '');
      const old = sumLoad()[t.dbId];
      if (old && !fresh) {
        add('bot', '\ud83d\udcdd ' + label + '\n\n' + old.t);
        actions([['\ud83d\udcac Talk about it', (b, d) => { d.remove(); startSongTalk(i); }], ['\u270e Write a new one', (b, d) => { d.remove(); chatSummary(i, true); }]]);
        return;
      }
      if (sumBusy || chatBusy) { add('bot', blTone('I am already writing something. Ask me again in a moment.')); return; }
      sumBusy = true; holdModel = true;
      const live = add('bot', '\ud83d\udcdd ' + label + '\n\n\u2026');
      try {
        const tr = getTranscript(t.dbId), c = loadTags()[t.dbId];
        // The words appear as they are written (native models stream), so there is something to read straight away.
        const ask2 = async (msgs, opts, say) => {
          const g = await ensureModel(say || (x => { live.textContent = '\ud83d\udcdd ' + label + '\n\n' + x; }));
          let acc = ''; opts = Object.assign({}, opts || {});
          if (g.lm) opts.streamer = { callback_function: x => { acc += x; live.textContent = '\ud83d\udcdd ' + label + '\n\n' + acc; scrollDown(); } };
          const o = await g(msgs, opts); const gt = o[0].generated_text; return String(Array.isArray(gt) ? gt[gt.length - 1].content : gt).trim();
        };
        const ai = await aiSummary(t, c, tr, ask2, x => { live.textContent = '\ud83d\udcdd ' + label + '\n\n' + x; }, sumLenKey(), ctxOf());
        if (!ai) {
          live.remove();
          add('bot', blTone(tr.words >= 12 ? 'The summary came out unusable. Try again, or pick a bigger AI brain in the assistant settings.'
            : 'I have no lyrics for ' + label + ' and I do not know it well enough to explain it without guessing. Transcribe it first (Lyrics & subtitles) and ask me again.'));
          return;
        }
        const prof = soundProfile(c, t.kind), text = [ai, prof.line ? 'Sound: ' + prof.line : ''].filter(Boolean).join('\n\n');
        const kept = await sumSave(t.dbId, { t: text, ts: Date.now(), len: sumLenKey(), sty: sumStyleKey() });
        live.textContent = '\ud83d\udcdd ' + label + '\n\n' + text; scrollDown();
        if (!kept) add('bot', blTone('I could not save that summary on this device (storage is full or blocked). Copy it now if you want to keep it.'));
        actions([['\ud83d\udcac Talk about it', (b, d) => { d.remove(); startSongTalk(i); }]]);
      } catch (e) { console.warn(e); try { live.remove(); } catch (x) {} add('bot', blTone('I could not write it: ' + errText(e))); }
      finally { sumBusy = false; holdModel = false; idleUnload(); }
    }
    // ---------- Song Talk: an in-depth conversation about one song (literal meaning, metaphors, composition) ----------
    // The song's lyrics, saved summary and composition facts go into the system prompt; the conversation keeps its own memory
    // until "done" / End. Player commands ("pause", "next") still work in the middle of it.
    let songTalk = null, stBar = null;
    const mmssT = x => Math.floor(x / 60) + ':' + String(Math.floor(x % 60)).padStart(2, '0');
    function songTalkFacts(t) {
      // Few raw numbers on purpose: the small model garbles numbers it copies, so strengths are words and only the tempo is a number.
      const c = loadTags()[t.dbId] || {}, L = [], how = v => v == null ? '' : v >= 70 ? ' (strong)' : v >= 40 ? '' : ' (faint)', lst = a => (a || []).map(v => v[0] + how(v[1])).join(', ');
      if (c.bpm) L.push('Tempo: about ' + c.bpm + ' BPM (' + (c.bpm < 70 ? 'slow' : c.bpm < 100 ? 'mid-tempo' : c.bpm < 128 ? 'upbeat' : 'fast') + ')');
      if (c.key) L.push('Key: ' + c.key + (c.ck ? ' (' + c.ck + ')' : ''));
      if (c.gp && c.gp.length) L.push('Genre: ' + lst(c.gp)); if (c.st && c.st.length) L.push('Style: ' + lst(c.st));
      const feel = Object.entries(c.hd || {}).filter(e => e[1] >= 50).sort((a, b) => b[1] - a[1]).map(e => e[0] + how(e[1])); if (feel.length) L.push('Mood/feel (audio models): ' + feel.join(', '));
      const th = ((c.hm || {}).theme || []).map(x => String(x[0]).replace(/_/g, ' ')); if (th.length) L.push('Themes (audio models): ' + th.join(', '));
      const IN2 = { acousticguitar: 'acoustic guitar', electricguitar: 'electric guitar', classicalguitar: 'classical guitar', acousticbassguitar: 'acoustic bass', electricpiano: 'electric piano', drummachine: 'drum machine', pipeorgan: 'pipe organ', doublebass: 'double bass' };
      if (c.in && c.in.length) L.push('Instruments heard: ' + lst(c.in.map(v => [IN2[v[0]] || v[0], v[1]])));
      if (c.v != null) L.push(c.v >= 50 ? 'Has vocals' : 'Mostly instrumental');
      if (c.fv != null) L.push('Vocals from ' + mmssT(c.fv) + ' to ' + mmssT(c.lv));
      if (c.d) L.push('Length: ' + mmssT(c.d));
      try { const m = songMap(t.dbId, c); if (m) L.push('Song map (where the song changes and what changes in the music, from the lyrics and the sound):\n' + songMapRows(m).join('\n') + (m.duet ? '\n  (the voice changes between parts: maybe two singers)' : '')); } catch (e) {}
      // Structure from the timed lyrics: lines that come back are the chorus / hook.
      let cues = []; try { const e = (JSON.parse(localStorage.getItem('playerSubtitles')) || {})[t.dbId]; if (e && e.c) cues = e.c.map(q => [+q[0], String(q[2] || '').trim()]).filter(q => q[1]); } catch (x) {}
      if (cues.length >= 6) {
        const nz = q => q.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim(), cnt = new Map();
        cues.forEach(([at, q]) => { const k = nz(q); if (k.length < 6) return; const o = cnt.get(k) || { q, n: 0, at: [] }; o.n++; o.at.push(at); cnt.set(k, o); });
        const hooks = [...cnt.values()].filter(o => o.n >= 2).sort((a, b) => b.n - a.n).slice(0, 3);
        if (hooks.length) L.push('Repeated lines (chorus/hook): ' + hooks.map(o => '"' + o.q.slice(0, 60) + '" x' + o.n + ' (first at ' + mmssT(o.at[0]) + ')').join('; '));
        L.push('Lyric timeline: ' + cues.length + ' lines from ' + mmssT(cues[0][0]) + ' to ' + mmssT(cues[cues.length - 1][0]));
      }
      return { lines: L, cues };
    }
    function songTalkSys(st, lyricTok) {
      const t = st.t, f = songTalkFacts(t), sum = (sumLoad()[t.dbId] || {}).t || '';
      let lyr = f.cues.length ? f.cues.map(([at, q]) => '[' + mmssT(at) + '] ' + q) : getTranscript(t.dbId).lines;
      // collapse straight repeats so the budget goes to new lines
      lyr = lyr.filter((q, i) => i === 0 || q.replace(/^\[[^\]]*\] /, '') !== lyr[i - 1].replace(/^\[[^\]]*\] /, ''));
      let cut = false; while (lyr.length > 8 && Math.ceil(lyr.join('\n').length / 3) > lyricTok) { lyr.pop(); cut = true; }
      return 'You are Bloop, talking in depth with the user about ONE song: "' + t.title + '"' + (st.artist ? ' by ' + st.artist : '') + '. ' +
        'Cover what they ask about: the LITERAL meaning (what the words actually say happens), the METAPHORICAL meaning (images, symbols, double meanings and what they stand for), and the COMPOSITION (structure, how the music, tempo, key, instruments and vocals support the words). ' +
        'Use the lyrics and facts below. You may add what you reliably know about this song and artist; never invent facts, and say clearly when something is interpretation rather than fact. ' +
        'Quote at most a short line at a time. Answer the question directly ' + (CHAT_STYLES[chatStyleKey()].bul ? CHAT_LENS[chatLenKey()].bul : CHAT_LENS[chatLenKey()].talk) + ', then you may suggest one thing to explore next. ' + CHAT_STYLES[chatStyleKey()].talk + '\n' +
        (sum ? '\nSAVED SUMMARY:\n' + sum.replace(/\n*Sound:[^\n]*$/, '') + '\n' : '') +
        (f.lines.length ? '\nCOMPOSITION FACTS (from the app\'s audio analysis):\n- ' + f.lines.join('\n- ') + '\n' : '') +
        (lyr.length ? '\nLYRICS (automatic transcript, may contain mistakes' + (cut ? ', shortened' : '') + '):\n' + lyr.join('\n') : '\nNo lyrics are saved for this song.');
    }
    function endSongTalk(msg) {
      if (!songTalk) return; const lbl = songTalk.title; songTalk = null;
      if (stBar) { stBar.remove(); stBar = null; }
      cin.placeholder = musicMode ? 'Talk about your music' : 'Say something to Bloop';
      if (msg !== false) add('bot', blTone('Done talking about ' + lbl + '. Back to normal chat.'));
    }
    function startSongTalk(i) {
      const A = window.__ppApi, t = A.tracks()[i]; if (!t) return;
      if (songTalk) endSongTalk(false);
      const artist = t.artist && !/^(unknown artist|video|stream)$/i.test(t.artist) ? t.artist : '';
      songTalk = { t, idx: i, title: t.title, artist, hist: [] };
      cbox.style.display = 'flex'; try { blAnchor(); } catch (e) {}
      stBar = document.createElement('div');
      stBar.style.cssText = 'display:flex;align-items:center;gap:8px;padding:6px 10px;border-bottom:1px solid #2e2f36;font-size:12px;background:#22232a';
      const lab = document.createElement('span'); lab.style.cssText = 'flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap';
      lab.textContent = '\ud83d\udcac Talking about ' + t.title + (artist ? ' \u2013 ' + artist : '');
      const x = document.createElement('button'); x.textContent = '\u2715 End'; x.className = 'ch-c'; x.onclick = () => endSongTalk();
      stBar.append(lab, x); cbox.insertBefore(stBar, clist);
      cin.placeholder = 'Ask about ' + t.title + '\u2026';
      const tr = getTranscript(t.dbId);
      add('bot', blTone('Let\'s talk about ' + t.title + (artist ? ' by ' + artist : '') + '. Ask me anything: what it literally says, what the images stand for, or how the music is built.' +
        (tr.words < 12 ? ' (I have no lyrics for it yet, so I can only go on what I know about it and its sound. Transcribing it first gives much better answers.)' : '')));
      actions([['Literal story', (b, d) => { d.remove(); send('What literally happens in this song, verse by verse?'); }],
               ['Metaphors', (b, d) => { d.remove(); send('What are the main metaphors and symbols, and what do they stand for?'); }],
               ['How it\'s built', (b, d) => { d.remove(); send('How is the song built musically, and how does that support the meaning?'); }],
               ['\u270e Fix lyrics', (b, d) => { d.remove(); startLyFix(i); }]]);
    }
    async function songTalkReply(text) {
      const st = songTalk; if (!st) return;
      if (heavyBusy()) { add('bot', "I'm busy with a heavy job (split, lyrics or tagging). Ask me again when it's done."); return; }
      chatBusy = true; holdModel = true; cm('work');
      const el = add('bot', '\u2026');
      try {
        const g = await ensureModel(x => { el.textContent = x; });
        const ctx = ctxOf(), mx = Math.max(90, Math.min(Math.floor(ctx * 0.3), Math.round(Math.max(160, Math.min(420, Math.floor(ctx * 0.18))) * CHAT_LENS[chatLenKey()].mul)));
        const lyricTok = Math.max(250, Math.floor(ctx * 0.85) - mx - 700 - Math.min(3, st.hist.length / 2) * 160);
        const uMsg = { role: 'user', content: text };
        let fit = fitMsgs([{ role: 'system', content: songTalkSys(st, lyricTok) }].concat(st.hist.slice(-8), [uMsg]), mx);
        if (fit.over) fit = fitMsgs([{ role: 'system', content: songTalkSys(st, Math.floor(lyricTok / 2)) }].concat(st.hist.slice(-4), [uMsg]), mx);
        let acc = ''; const opts = { max_new_tokens: mx, do_sample: true, temperature: 0.6, top_p: 0.92, top_k: 40, repetition_penalty: 1.12 };
        const onPiece = x => { acc += x; el.textContent = acc; scrollDown(); };
        if (g.lm) opts.streamer = { callback_function: onPiece };
        else if (tfMod && tfMod.TextStreamer) opts.streamer = new tfMod.TextStreamer(g.tokenizer, { skip_prompt: true, skip_special_tokens: true, callback_function: onPiece });
        const out = await g(fit.msgs, opts);
        let r = out && out[0] && out[0].generated_text; r = Array.isArray(r) ? (r[r.length - 1] || {}).content : (r || acc);
        r = finishSentence(String(r || acc).trim());
        try { const tb = (loadTags()[st.t.dbId] || {}).bpm; r = fixNums(r, tb ? [tb] : []); } catch (e) {}
        if (!looksOk(r)) { el.textContent = 'Sorry, that came out garbled. Ask me again?'; return; }
        el.textContent = r; scrollDown(); try { vSpeak(r); } catch (e) {}
        if (songTalk === st) { st.hist.push(uMsg, { role: 'assistant', content: r }); st.hist = st.hist.slice(-12); }
      } catch (e) { console.error(e); el.textContent = 'Oops, my brain would not load: ' + errText(e); }
      finally { chatBusy = false; holdModel = false; cm('greet'); setTimeout(() => cm('idle'), 1300); idleUnload(); }
    }
    // ---------- Lyric Fix: the AI proofreads automatic lyrics, you approve each change ----------
    // 1) consistency pass, no AI: a chorus transcribed slightly differently each time gets its most common wording.
    // 2) AI pass: sections of lines with context around them; the model lists only lines it would change ("12| new line").
    //    Suggestions that rewrite too much are dropped. Nothing is saved until you tap Accept. Timestamps never change.
    // 3) chat: "line 12 should be ...", "replace X with Y", "show the lyrics", "undo", "check again", or ask anything.
    let lyFix = null, lfBar = null;
    const LF_TAG = /^(\s*(?:\[\d{1,3}:\d{2}(?:[.:]\d{1,3})?\]\s*)*)(.*)$/;
    function lfLoad(t) {
      let e = null, lyr = '';
      try { e = (JSON.parse(localStorage.getItem('playerSubtitles')) || {})[t.dbId] || null; } catch (x) {}
      try { lyr = (JSON.parse(localStorage.getItem('playerLyricsV1')) || {})[t.dbId] || ''; } catch (x) {}
      const raw = e ? (Array.isArray(e) ? e.map(q => [q.start, q.end, q.text]) : (e.c || [])) : [];
      if (raw.length) {
        const off = e && !Array.isArray(e) && isFinite(+e.o) ? +e.o : 0;                   // fold the offset into the times so nothing shifts
        const cues = raw.map(q => ({ start: +q[0] + off, end: +q[1] + off, text: String(q[2] || '') }));
        return { kind: 'subs', name: (e && !Array.isArray(e) && e.n) || 'Whisper', cues, texts: cues.map(c => c.text), lyr, rawSubs: JSON.stringify(e) };
      }
      if (!lyr) return null;
      const lines = String(lyr).split(/\r?\n/), map = [], texts = [];
      lines.forEach((ln, k) => { const m = ln.match(LF_TAG), tx = (m ? m[2] : ln).trim(); if (tx && !/^\[[^\]]*\]$/.test(tx)) { map.push(k); texts.push(tx); } });
      return texts.length ? { kind: 'lyrics', lines, map, texts, lyr } : null;
    }
    function lfSave() {                                                   // write the current texts back, keeping every timestamp
      const F = lyFix; if (!F) return false;
      const A = window.__ppApi, L = window.__ppLyrics, D = F.data;
      if (D.kind === 'subs') {
        const ok = A.setSubtitles(F.t.dbId, D.cues.map((c, k) => ({ start: c.start, end: c.end, text: F.texts[k] })), D.name);
        if (D.lyr && L) {                                                 // the same lines in the saved (LRC) lyrics follow
          const swap = new Map(); D.texts.forEach((o, k) => { if (F.texts[k] !== o && !swap.has(o.trim())) swap.set(o.trim(), F.texts[k]); });
          if (swap.size) { const nl = String(D.lyr).split(/\r?\n/).map(ln => { const m = ln.match(LF_TAG); return m && swap.has(m[2].trim()) ? m[1] + swap.get(m[2].trim()) : ln; }).join('\n'); if (nl !== D.lyr) L.set(F.t.dbId, nl); }
        }
        return ok !== false;
      }
      const lines = D.lines.slice(); D.map.forEach((k, j) => { const m = lines[k].match(LF_TAG); lines[k] = (m ? m[1] : '') + F.texts[j]; });
      if (L) L.set(F.t.dbId, lines.join('\n')); return true;
    }
    function lfUndoAll() {
      const F = lyFix; if (!F) return;
      F.texts = F.data.texts.slice(); F.stack = [];
      const A = window.__ppApi, L = window.__ppLyrics, D = F.data;
      if (D.kind === 'subs') A.setSubtitles(F.t.dbId, D.cues, D.name);
      if (L && D.lyr) L.set(F.t.dbId, D.lyr);
      add('bot', blTone('\u21ba All changes undone. The lyrics are back to how they were.'));
    }
    function lfApply(n, txt, why) {                                       // one change (n = 1-based line), saved right away
      const F = lyFix; if (!F || n < 1 || n > F.texts.length) return false;
      const old = F.texts[n - 1]; if (old === txt) return false;
      F.stack.push([n, old]); F.texts[n - 1] = txt; F.changed++;
      return lfSave();
    }
    const lfSim = (a, b) => { a = mNorm(a); b = mNorm(b); if (!a || !b) return 0; const mx = Math.max(a.length, b.length), d = mLev(a, b, Math.ceil(mx * 0.6)); return 1 - d / mx; };
    const lfTok = q => String(q).trim().split(/\s+/).filter(Boolean), lfW = w => w.toLowerCase().replace(/[^\p{L}\p{N}']/gu, '');
    function lfDiff(o, n) {                                               // word diff: which words of the old line (and of the new one) differ
      const a = lfTok(o), b = lfTok(n), A = a.map(lfW), B = b.map(lfW), L = a.length, M = b.length, dp = [];
      for (let x = 0; x <= L; x++) dp.push(new Array(M + 1).fill(0));
      for (let x = L - 1; x >= 0; x--) for (let y = M - 1; y >= 0; y--) dp[x][y] = A[x] === B[y] ? dp[x + 1][y + 1] + 1 : Math.max(dp[x + 1][y], dp[x][y + 1]);
      const oBad = new Array(L).fill(true), nBad = new Array(M).fill(true); let x = 0, y = 0;
      while (x < L && y < M) { if (A[x] === B[y]) { oBad[x] = nBad[y] = false; x++; y++; } else if (dp[x + 1][y] >= dp[x][y + 1]) x++; else y++; }
      const span = f => { const k = f.indexOf(true); return k < 0 ? null : [k, f.lastIndexOf(true)]; };
      return { a, b, os: span(oBad), ns: span(nBad), oBad, nBad };
    }
    function lfMark(tok, bad, cls) {                                      // the words with the differing ones underlined
      const f = document.createDocumentFragment();
      tok.forEach((w, k) => { if (k) f.appendChild(document.createTextNode(' ')); if (bad[k]) { const u = document.createElement('u'); u.className = cls; u.textContent = w; f.appendChild(u); } else f.appendChild(document.createTextNode(w)); });
      return f;
    }
    function lfSuggest(list, intro) {                                     // [[n, newText, why]] -> one list: tick boxes, per-line Accept / Skip / Both wrong, underlined differences
      const F = lyFix; if (!F) return;
      const todo = list.filter(([n, tx]) => n >= 1 && n <= F.texts.length && tx && tx !== F.texts[n - 1]);
      if (!todo.length) return false;
      if (intro) add('bot', blTone(intro));
      const box = document.createElement('div'); box.className = 'ch-m bot lf-box'; const items = [];
      let bar = null, accB = null;
      const live = () => items.filter(o => o.item.isConnected), picked = () => live().filter(o => o.cb.checked);
      const upd = () => { if (!accB) return; const k = picked().length; accB.textContent = '\u2713 Accept ' + (k === live().length ? 'all ' : '') + k + ' ticked'; accB.disabled = !k; };
      const after = () => { if (!live().length) { box.remove(); if (bar) bar.remove(); } else upd(); };
      const mkB = (t, fn) => { const b = document.createElement('button'); b.textContent = t; b.className = 'ch-c'; b.onclick = ev => { ev.preventDefault(); ev.stopPropagation(); fn(b); }; return b; };
      todo.forEach(([n, tx, why]) => {
        const old = F.texts[n - 1], d = lfDiff(old, tx);
        const item = document.createElement('div'), lab = document.createElement('label'), cb = document.createElement('input'), sp = document.createElement('span');
        item.className = 'lf-item'; lab.className = 'lf-it'; cb.type = 'checkbox'; cb.checked = true; cb.onchange = upd;
        sp.appendChild(document.createTextNode('Line ' + n + (why ? ' (' + why + ')' : '') + ':\n\u2013 ')); sp.appendChild(lfMark(d.a, d.oBad, 'o'));
        sp.appendChild(document.createTextNode('\n+ ')); sp.appendChild(lfMark(d.b, d.nBad, 'n'));
        lab.append(cb, sp); item.appendChild(lab);
        const o = { n, tx, item, cb }; items.push(o);
        const row = document.createElement('div'), ed = document.createElement('div'); row.className = 'lf-row'; ed.className = 'lf-ed'; ed.style.display = 'none';
        const done = (txt, msg) => { if (lfApply(n, txt)) add('bot', msg); item.remove(); after(); };
        row.append(
          mkB('\u2713 Accept', () => done(tx, '\u2713 Line ' + n + ' fixed.')),
          mkB('\u2715 Skip', () => { item.remove(); after(); }),
          mkB('\u270e Both wrong', () => { ed.style.display = ed.style.display === 'none' ? 'flex' : 'none'; }));
        // Editor for when neither the heard line nor the suggestion is right: rewrite just the underlined part, or the whole line.
        const inp = v => { const i = document.createElement('input'); i.type = 'text'; i.value = v; return i; };
        const hint = t => { const h = document.createElement('div'); h.className = 'lf-h'; h.textContent = t; return h; };
        let partIn = null;
        if (d.os) {
          const bad = d.a.slice(d.os[0], d.os[1] + 1).join(' '), sugPart = d.ns ? d.b.slice(d.ns[0], d.ns[1] + 1).join(' ') : '';
          partIn = inp(sugPart); partIn.placeholder = 'What the underlined part should say';
          const pre = d.a.slice(0, d.os[0]), post = d.a.slice(d.os[1] + 1);
          ed.append(hint('Just the underlined part (\u201c' + bad + '\u201d):'), partIn,
            mkB('Use this part fix', () => { const v = partIn.value.trim(); if (!v) { add('bot', 'Type what the underlined part should say, or use the whole-line box.'); return; } done(pre.concat([v], post).join(' '), '\u2713 Line ' + n + ' fixed with your wording for \u201c' + bad + '\u201d.'); }));
        }
        const whole = inp(tx); whole.placeholder = 'The whole line';
        ed.append(hint('Or rewrite the whole line:'), whole,
          mkB('Use my whole line', () => { const v = whole.value.trim(); if (!v) { add('bot', 'The line cannot be empty.'); return; } done(v, '\u2713 Line ' + n + ' set to your wording.'); }),
          mkB('Cancel', () => { ed.style.display = 'none'; }));
        item.append(row, ed); box.appendChild(item);
      });
      clist.appendChild(box); scrollDown();
      bar = actions([
        ['\u2713 Accept', (b, d) => {
          const sel = picked(); let k = 0;
          sel.forEach(o => { if (F.texts[o.n - 1] !== o.tx && lfApply(o.n, o.tx)) k++; o.item.remove(); });
          add('bot', blTone('\u2713 ' + k + ' line' + (k === 1 ? '' : 's') + ' fixed. Say \u201cundo\u201d to take back the last one.'));
          after();
        }],
        ['Select all', () => { live().forEach(o => { o.cb.checked = true; }); upd(); }],
        ['Select none', () => { live().forEach(o => { o.cb.checked = false; }); upd(); }],
        ['Skip the rest', (b, d) => { box.remove(); d.remove(); }]]);
      accB = bar.children[0]; upd();
      return true;
    }
    // Choruses often change on purpose between passes ("I'm falling" -> "I'm flying", a twist in the last chorus), so a
    // repeat is only flagged when the difference looks like a mishearing: spacing/punctuation only, or ONE word that is
    // one letter off with the same first letter ("dawn"/"down", "save"/"saves"). A different word, several changed words, or a line sung only
    // twice is left alone. Each flag is still just a suggestion with Accept / Skip.
    function lfMisheard(a, b) {
      if (mFlat(a) === mFlat(b)) return true;                            // "gonna" vs "gon na", commas, capitals
      const wa = mNorm(a).split(' '), wb = mNorm(b).split(' ');
      if (wa.length !== wb.length) return false;
      const diff = []; for (let k = 0; k < wa.length; k++) if (wa[k] !== wb[k]) diff.push(k);
      if (diff.length !== 1) return false;
      const x = wa[diff[0]], y = wb[diff[0]];
      return x[0] === y[0] && mLev(x, y, 1) <= 1;                         // one letter, same start: "dawn"/"down" yes, "falling"/"flying" or "night"/"light" no
    }
    function lfConsistency() {
      const F = lyFix, T = F.texts, n = T.length, used = new Array(n).fill(false), out = [];
      for (let i = 0; i < n; i++) {
        if (used[i] || mNorm(T[i]).length < 10) continue;
        const grp = [i];
        for (let j = i + 1; j < n; j++) if (!used[j] && lfSim(T[i], T[j]) >= 0.8) grp.push(j);
        if (grp.length < 3) continue;                                     // needs at least three passes to know which one is odd
        grp.forEach(j => used[j] = true);
        const cnt = new Map(); grp.forEach(j => cnt.set(T[j], (cnt.get(T[j]) || 0) + 1));
        const best = [...cnt.entries()].sort((a, b) => b[1] - a[1] || b[0].length - a[0].length)[0];
        if (best[1] < 2 || best[1] < grp.length / 2) continue;           // no clear majority: the variations are probably the song
        grp.forEach(j => { if (T[j] !== best[0] && cnt.get(T[j]) === 1 && lfMisheard(T[j], best[0])) out.push([j + 1, best[0], 'possibly misheard: the other ' + best[1] + ' times it is sung this way']); });
      }
      return out;
    }
    const LF_SYS = 'You correct automatic lyric transcriptions. The speech recognizer often hears a phrase that SOUNDS like what was sung but means something else, so a line can read fluently and still be wrong. ' +
      'Check each line against the song\'s subject (given below), the lines around it, and normal grammar. Fix: misheard words, words that make no sense in context, lines that are fluent but do not fit what the song is talking about when a similar-sounding phrase would fit, and names or places heard as ordinary words. ' +
      'Repeated lines such as a chorus can change on purpose between repeats: do not make them match unless one is clearly misheard. ' +
      'A fix must sound almost the same when spoken aloud and keep about the same length. Keep the singer\'s own style, slang, contractions and repetition. Do not rewrite, improve, censor or translate, and never add or remove lines. ' +
      'Reply with ONLY the lines you change, one per line, exactly as: number| corrected line. If nothing needs fixing, reply: NONE';
    const LF_SYS2 = 'You are a careful proofreader of automatic lyric transcriptions. The speech recognizer often writes a phrase that SOUNDS like what was sung but is the wrong words. Such a line is usually grammatical, so being grammatical does not make it right. ' +
      'Go through every line and ask: does this fit the song\'s subject and the lines before and after it? Does each word make sense here? Is there a similar-sounding word or phrase that fits better (for example a name, a place, a common expression, or a repeated phrase from nearby lines)? ' +
      'If a line is odd, out of place, or unrelated to its surroundings, give the line the singer most likely sang. It must sound almost the same when spoken aloud and have about the same number of syllables. ' +
      'Repeated lines such as a chorus can change on purpose between repeats: do not make them match unless one is clearly misheard. ' +
      'Do not change lines that already fit. Do not polish, censor, translate, add or remove lines. Reply with ONLY the lines you change, one per line, exactly as: number| corrected line. If nothing needs fixing, reply: NONE';
    const lfPho = a => String(a || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z\s]/g, '').replace(/\bkn/g, 'n').replace(/\bwr/g, 'r').replace(/ph/g, 'f').replace(/ck/g, 'k').replace(/c(?=[eiy])/g, 's').replace(/c/g, 'k').replace(/q/g, 'k').replace(/x/g, 'ks').replace(/z/g, 's').replace(/gh/g, '').replace(/([a-z])\1+/g, '$1').replace(/(?<=[a-z])[aeiouy]+/g, '').replace(/\s+/g, ' ').trim();   // rough sound skeleton, so sound-alike fixes pass the guard even when the spelling differs
    const lfGuard = (o, tx, deep) => { if (!tx || tx === o) return false; const lr = tx.length / Math.max(1, o.length); if (lr < (deep ? 0.4 : 0.5) || lr > (deep ? 2.2 : 1.8)) return false; return lfSim(o, tx) >= (deep ? 0.3 : 0.4) || lfSim(lfPho(o), lfPho(tx)) >= 0.6; };
    const lfParse = (r, lo, hi) => String(r || '').split(/\n/).map(ln => ln.match(/^\s*(?:line\s*)?(\d{1,4})\s*[|:.)\]-]\s*(.+?)\s*$/i)).filter(Boolean).map(m => [+m[1], m[2].replace(/^["\u201c]+|["\u201d]+$/g, '').trim()]).filter(([n]) => n >= lo && n <= hi);
    // Decode pass: a word that is out of place (a name like "Lincoln" in a line that has nothing to do with it) is often the recognizer
    // hearing two ordinary words as one name, or one word as another. The model is asked to sound the odd word out and say what was sung.
    const LF_SYS3 = 'You repair automatic lyric transcriptions. The speech recognizer often turns ordinary words into a NAME or an odd word that has nothing to do with the song, or glues two words into one, or splits one word in two. ' +
      'For example, "Kingston my heart" was really "king\'s in my heart", and "hold me Carolina" was really "hold me, carry on". ' +
      'Look at each line. If a word (especially a name or a rare word) does not fit the song\'s subject or the lines around it, say it out loud syllable by syllable and work out which ordinary word or words sound the same and make sense there. The fix can be one word, two or three words, or a different word. ' +
      'Change only the odd word or words. Keep every other word exactly as written. Do not polish, translate, add or remove lines. If the odd word really could be a real name that belongs, leave it. ' +
      'Repeated lines such as a chorus can change on purpose between repeats: do not make them match unless one is clearly misheard. ' +
      'Reply with ONLY the lines you change, one per line, exactly as: number| corrected line. If nothing needs fixing, reply: NONE';
    function lfSuspects() {                                                // mid-line capitalised words (names) that are not in the title or artist and are not sung over and over
      const F = lyFix, T = F.texts, cnt = new Map(), out = new Map(), skip = new Set(lfTok((F.t.title || '') + ' ' + (F.artist || '')).map(lfW).filter(Boolean));
      T.forEach(q => new Set(lfTok(q).map(lfW)).forEach(w => { if (w) cnt.set(w, (cnt.get(w) || 0) + 1); }));
      T.forEach((q, j) => {
        const tk = lfTok(q), bad = [];
        tk.forEach((w, k) => { const c = lfW(w); if (k && c.length >= 3 && /^\p{Lu}\p{Ll}/u.test(w) && !/[.!?]["')\u201d]?$/.test(tk[k - 1]) && !skip.has(c) && (cnt.get(c) || 0) <= 2) bad.push(w.replace(/^[^\p{L}]+|[^\p{L}\p{N}']+$/gu, '')); });
        if (bad.length) out.set(j, bad);
      });
      return out;
    }
    const lfDecGuard = (o, tx) => {                                        // looser than lfGuard: the odd word may become 2-3 words, but it must sound like what it replaces
      if (!tx || tx === o) return false; const lr = tx.length / Math.max(1, o.length); if (lr < 0.5 || lr > 2.2) return false;
      const d = lfDiff(o, tx); if (!d.os || !d.ns) return lfGuard(o, tx, true);
      if (d.os[1] - d.os[0] > 3 || d.ns[1] - d.ns[0] > 4) return false;     // a rewrite of the whole line is not a decode
      const a = d.a.slice(d.os[0], d.os[1] + 1).join(' '), b = d.b.slice(d.ns[0], d.ns[1] + 1).join(' ');
      const sk = x => lfPho(x).replace(/[aeiouy\s]/g, '').replace(/h/g, ''), x = sk(a), y = sk(b); if (!x || !y) return lfSim(a, b) >= 0.4;   // consonant skeleton: "Lincoln" ~ "the link on"
      const [sh, lo] = x.length <= y.length ? [x, y] : [y, x]; let prev = new Array(lo.length + 1).fill(0);                         // best match of the shorter skeleton anywhere inside the longer (extra little words like "the" are free)
      for (let i = 1; i <= sh.length; i++) { const cur = [i]; for (let j = 1; j <= lo.length; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (sh[i - 1] === lo[j - 1] ? 0 : 1)); prev = cur; }
      return 1 - Math.min(...prev) / sh.length >= 0.55 || lfSim(a, b) >= 0.4;
    };
    async function lfAiPass(mode) {
      const dec = mode === 'decode', deep = mode === true || dec;
      const F = lyFix; if (!F || F.busy) return; F.busy = true;
      chatBusy = true; holdModel = true; cm('work');
      const sus = dec ? lfSuspects() : null, status = add('bot', '\u2026'), who = F.t.title + (F.artist ? ' by ' + F.artist : '');
      let found = 0;
      try {
        const g = await ensureModel(x => { status.textContent = x; });
        const T = F.texts, N = T.length, CH = deep ? 8 : 12, CX = deep ? 8 : 5;
        if (F.theme == null) {                                           // what the song is about: the single biggest help for spotting lines that read fine but do not belong
          F.theme = ''; status.textContent = 'Getting the gist of the song\u2026'; scrollDown();
          try {
            const ctxT = ctxOf(), lim = Math.max(1200, Math.min(6000, Math.floor(ctxT * 2.2)));
            let body = ''; for (let k = 0; k < N && body.length < lim; k++) body += T[k] + '\n';
            const o = await g([{ role: 'system', content: 'These are automatic lyrics and some words are wrong. In ONE short sentence, say what the song is about and its mood. Do not quote lines.' }, { role: 'user', content: 'Song: ' + who + '\n' + body }], { max_new_tokens: 70, do_sample: false, temperature: 0, top_k: 1, repetition_penalty: 1.05 });
            let tr = o && o[0] && o[0].generated_text; tr = Array.isArray(tr) ? (tr[tr.length - 1] || {}).content : tr; F.theme = String(tr || '').replace(/\s+/g, ' ').trim().slice(0, 240);
          } catch (e) { console.warn('lyric fix theme failed', e); }
        }
        for (let s0 = 0; s0 < N && lyFix === F; s0 += CH) {
          const s1 = Math.min(N, s0 + CH);
          status.textContent = (dec ? 'Sounding out odd words in lines ' : deep ? 'Looking closely at lines ' : 'Reading lines ') + (s0 + 1) + '\u2013' + s1 + ' of ' + N + '\u2026'; scrollDown();
          const ctxB = T.slice(Math.max(0, s0 - CX), s0).join(' / '), ctxA = T.slice(s1, Math.min(N, s1 + CX)).join(' / ');
          const user = 'Song: ' + who + '\n' + (F.theme ? 'What the song is about: ' + F.theme + '\n' : '') + (ctxB ? 'Lines just before (context only): ' + ctxB + '\n' : '') + 'Lines to check:\n' +
            T.slice(s0, s1).map((q, k) => (s0 + k + 1) + '| ' + q).join('\n') + (dec ? (() => { const h = []; for (let k = s0; k < s1; k++) if (sus.has(k)) h.push((k + 1) + '| ' + sus.get(k).join(', ')); return h.length ? '\nWords that look out of place (check these first):\n' + h.join('\n') : ''; })() : '') + (ctxA ? '\nLines just after (context only): ' + ctxA : '');
          let r = '';
          try { const o = await g([{ role: 'system', content: dec ? LF_SYS3 : deep ? LF_SYS2 : LF_SYS }, { role: 'user', content: user }], { max_new_tokens: 420, do_sample: false, temperature: 0, top_k: 1, repetition_penalty: 1.05 }); r = o && o[0] && o[0].generated_text; r = Array.isArray(r) ? (r[r.length - 1] || {}).content : r; }
          catch (e) { console.warn('lyric fix chunk failed', e); continue; }
          if (/^\s*none\s*$/i.test(String(r))) continue;
          // Guard against rewrites: a fix must still look like the line it replaces.
          const sug = lfParse(r, s0 + 1, s1).filter(([n, tx]) => dec ? lfDecGuard(T[n - 1], tx) : lfGuard(T[n - 1], tx, deep)).map(([n, tx]) => { let why = deep ? 'sounds similar, fits the song better' : ''; if (dec) { const d = lfDiff(T[n - 1], tx); if (d.os && d.ns) why = 'heard \u201c' + d.a.slice(d.os[0], d.os[1] + 1).join(' ') + '\u201d, probably \u201c' + d.b.slice(d.ns[0], d.ns[1] + 1).join(' ') + '\u201d'; } return [n, tx, why]; });
          if (sug.length) { found += sug.length; lfSuggest(sug); }
        }
        status.textContent = found ? (dec ? 'Done decoding: ' : 'Done reading: ') + found + ' suggestion' + (found === 1 ? '' : 's') + ' above.' : 'Done reading. I did not find anything I am sure is wrong.';
        if (!dec) { const btns = []; if (!deep) btns.push(['\ud83d\udd0e Look harder (finds more, may be less sure)', (b, d) => { d.remove(); lfAiPass(true); }]); btns.push(['\ud83e\udde9 Decode odd words and names', (b, d) => { d.remove(); lfAiPass('decode'); }]); actions(btns); }
        add('bot', blTone('You can also tell me: \u201cline 12 should be \u2026\u201d, \u201creplace Carly with Charlie\u201d, \u201cshow the lyrics\u201d, or ask about any line. Say \u201cdone\u201d when you are finished.'));
      } catch (e) { console.error(e); status.textContent = 'Oops, my brain would not load: ' + errText(e); }
      finally { F.busy = false; chatBusy = false; holdModel = false; cm('idle'); idleUnload(); scrollDown(); }
    }
    function endLyFix(msg) {
      if (!lyFix) return; const F = lyFix; lyFix = null;
      if (lfBar) { lfBar.remove(); lfBar = null; }
      cin.placeholder = musicMode ? 'Talk about your music' : 'Say something to Bloop';
      if (msg !== false) add('bot', blTone(F.changed ? 'Saved. ' + F.changed + ' change' + (F.changed === 1 ? '' : 's') + ' to the lyrics of ' + F.t.title + '.' : 'Done. Nothing was changed.'));
    }
    function startLyFix(i) {
      const A = window.__ppApi, t = A.tracks()[i]; if (!t) return;
      if (typeof songTalk !== 'undefined' && songTalk) endSongTalk(false);
      if (lyFix) endLyFix(false);
      cbox.style.display = 'flex'; try { blAnchor(); } catch (e) {}
      const data = lfLoad(t);
      if (!data) { add('bot', blTone('There are no lyrics or subtitles saved for ' + t.title + ' yet. Transcribe it first (Lyrics & subtitles), or let auto-lyrics find them, then ask me again.')); return; }
      const artist = t.artist && !/^(unknown artist|video|stream)$/i.test(t.artist) ? t.artist : '';
      lyFix = { t, idx: i, artist, data, texts: data.texts.slice(), stack: [], changed: 0, hist: [], busy: false };
      lfBar = document.createElement('div');
      lfBar.style.cssText = 'display:flex;align-items:center;gap:6px;padding:6px 10px;border-bottom:1px solid #2e2f36;font-size:12px;background:#22232a';
      const lab = document.createElement('span'); lab.style.cssText = 'flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap';
      lab.textContent = '\u270e Fixing lyrics: ' + t.title;
      const u = document.createElement('button'); u.textContent = '\u21ba Undo all'; u.className = 'ch-c'; u.onclick = () => lfUndoAll();
      const x = document.createElement('button'); x.textContent = '\u2715 Done'; x.className = 'ch-c'; x.onclick = () => endLyFix();
      lfBar.append(lab, u, x); cbox.insertBefore(lfBar, clist);
      cin.placeholder = 'e.g. line 12 should be \u2026';
      add('bot', blTone('Let\'s fix the lyrics of ' + t.title + (artist ? ' by ' + artist : '') + ' (' + lyFix.texts.length + ' lines' + (data.kind === 'subs' ? ', timing stays as it is' : '') + '). Nothing changes until you accept it.'));
      const cons = lfConsistency();
      if (!lfSuggest(cons, 'First, repeated lines (like the chorus) where one pass looks misheard. Skip any that the song really changes:')) add('bot', 'No repeated lines look misheard. \u2713');
      if (brainOn() && (gen || lsGet('ppvChatDl') === '1')) actions([['\ud83d\udd0d Check every line with AI', (b, d) => { d.remove(); lfAiPass(); }], ['\ud83e\udde9 Decode odd words and names', (b, d) => { d.remove(); lfAiPass('decode'); }], ['Show the lyrics', (b, d) => { d.remove(); lfShow(); }]]);
      else add('bot', 'Turn on my AI brain in the assistant settings for the line-by-line check. You can still edit lines here: \u201cline 12 should be \u2026\u201d.');
    }
    function lfShow(from) {
      const F = lyFix; if (!F) return; const a = Math.max(0, (from || 1) - 1), b = Math.min(F.texts.length, a + 40);
      add('bot', F.texts.slice(a, b).map((q, k) => (a + k + 1) + '. ' + q).join('\n') + (b < F.texts.length ? '\n\u2026 say \u201cshow from line ' + (b + 1) + '\u201d for more' : ''));
    }
    async function lfChat(text) {                                          // everything typed while Lyric Fix is open
      const F = lyFix; let m;
      if ((m = text.match(/^line\s*(\d{1,4})\s*(?:should be|is|=|:|->|to|says?)\s*["\u201c']?(.+?)["\u201d']?$/i))) {
        const n = +m[1]; if (n < 1 || n > F.texts.length) { add('bot', 'There are ' + F.texts.length + ' lines.'); return; }
        const old = F.texts[n - 1]; if (lfApply(n, m[2].trim())) add('bot', '\u2713 Line ' + n + ':\n\u2013 ' + old + '\n+ ' + m[2].trim()); else add('bot', 'Line ' + n + ' already says that.'); return;
      }
      if ((m = text.match(/^(?:replace|change|swap)\s+["\u201c']?(.+?)["\u201d']?\s+(?:with|to|for|->)\s+["\u201c']?(.+?)["\u201d']?(?:\s+everywhere)?$/i))) {
        const from = m[1].trim(), to = m[2].trim(), re = new RegExp('(^|[^\\p{L}\\p{N}])' + from.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(?=$|[^\\p{L}\\p{N}])', 'giu');
        let k = 0; F.texts.forEach((q, j) => { const nq = q.replace(re, (all, pre) => pre + to); if (nq !== q && lfApply(j + 1, nq)) k++; });
        add('bot', k ? '\u2713 Replaced \u201c' + from + '\u201d with \u201c' + to + '\u201d in ' + k + ' line' + (k === 1 ? '' : 's') + '.' : 'I could not find \u201c' + from + '\u201d in the lyrics.'); return;
      }
      if ((m = text.match(/^(?:show|list|read)(?: me)?(?: the)? (?:lyrics|lines)(?: from(?: line)? (\d+))?$|^show from line (\d+)$/i))) { lfShow(+(m[1] || m[2] || 1)); return; }
      if (/^undo(?: last| that)?$/i.test(text)) { const u = F.stack.pop(); if (!u) { add('bot', 'Nothing to undo.'); return; } F.texts[u[0] - 1] = u[1]; F.changed = Math.max(0, F.changed - 1); lfSave(); add('bot', '\u21ba Line ' + u[0] + ' is back to: ' + u[1]); return; }
      if (/^undo (?:all|everything)$/i.test(text)) { lfUndoAll(); return; }
      if (/^(?:decode|check|fix|find)(?: the)? (?:odd|weird|wrong|strange|unrelated)? ?(?:words?|names?)(?: and (?:words?|names?))?$|^(?:decode|sound out) (?:it|them|the lyrics)$/i.test(text)) { await lfAiPass('decode'); return; }
      if (/^(?:look|check|go over|read|review)(?: it| them| the lyrics)? (?:harder|closer|more carefully|deeper)$|^(?:deep|deeper|harder) check$/i.test(text)) { await lfAiPass(true); return; }
      if (/^(?:check|review|go over|proofread)(?: it| them| the lyrics)?(?: again)?$|^check again$/i.test(text)) { await lfAiPass(); return; }
      // Anything else: ask the AI with the numbered lyrics; fixes it proposes come back as Accept buttons.
      if (!brainOn() || (!gen && lsGet('ppvChatDl') !== '1')) { add('bot', 'That needs my AI brain. Edits work without it: \u201cline 12 should be \u2026\u201d, \u201creplace X with Y\u201d.'); return; }
      chatBusy = true; holdModel = true; cm('work'); const el = add('bot', '\u2026');
      try {
        const g = await ensureModel(x => { el.textContent = x; });
        const ctx = ctxOf(), mx = Math.max(160, Math.min(380, Math.floor(ctx * 0.16)));
        let lines = F.texts.map((q, k) => (k + 1) + '| ' + q); while (lines.length > 10 && Math.ceil(lines.join('\n').length / 3) > Math.floor(ctx * 0.85) - mx - 500) lines.pop();
        const sys = 'You help the user correct the automatic lyrics of "' + F.t.title + '"' + (F.artist ? ' by ' + F.artist : '') + '. Answer their question in one or two short sentences. ' +
          'If you suggest corrections, put each on its own line at the end as: number| corrected line. Only suggest fixes for clear transcription mistakes; never rewrite the song.\nLYRICS (numbered):\n' + lines.join('\n');
        const fit = fitMsgs([{ role: 'system', content: sys }].concat(F.hist.slice(-4), [{ role: 'user', content: text }]), mx);
        let acc = ''; const opts = { max_new_tokens: mx, do_sample: false, temperature: 0, top_k: 1, repetition_penalty: 1.08 };
        if (g.lm) opts.streamer = { callback_function: x => { acc += x; el.textContent = acc; scrollDown(); } };
        const out = await g(fit.msgs, opts); let r = out && out[0] && out[0].generated_text; r = String(Array.isArray(r) ? (r[r.length - 1] || {}).content : (r || acc)).trim();
        const sug = lfParse(r, 1, F.texts.length).filter(([n, tx]) => tx !== F.texts[n - 1] && lfSim(F.texts[n - 1], tx) >= 0.35);
        const talk = r.split(/\n/).filter(ln => !/^\s*(?:line\s*)?\d{1,4}\s*[|:.)\]-]/i.test(ln)).join('\n').trim();
        el.textContent = talk || (sug.length ? 'Here is what I would change:' : 'I am not sure. Tell me what you hear and I will fix it.');
        if (sug.length) lfSuggest(sug.map(([n, tx]) => [n, tx, '']));
        F.hist.push({ role: 'user', content: text }, { role: 'assistant', content: r }); F.hist = F.hist.slice(-8);
      } catch (e) { console.error(e); el.textContent = 'Oops, my brain would not load: ' + errText(e); }
      finally { chatBusy = false; holdModel = false; cm('idle'); idleUnload(); scrollDown(); }
    }
    function agent(raw, skip) { holdModel = false; const hit = agentCore(raw, skip); if (hit && !chatBusy && !holdModel && !bigRam()) unloadModel(); return hit; }   // big-RAM phones keep it warm (idleUnload frees it later)
    // Loose phrasing -> canonical command, by plain rules (no model needed). Returns {cmd, q} or null. q = ask before acting.
    function interpret(t) {
      const s = t.toLowerCase(); let m;
      const R = (re, cmd, q) => re.test(s) ? { cmd, q } : null;
      if ((m = s.match(/\b(?:stop|pause|turn (?:it |the music )?off|shut (?:it )?off|sleep)\b.*?\b(?:in|after|for)\s+(half an?|an?|one|\d+(?:\.\d+)?)\s*(hours?|hrs?|h|minutes?|mins?)\b/))) {
        const n = /^half/.test(m[1]) ? .5 : /^(an?|one)$/.test(m[1]) ? 1 : parseFloat(m[1]);
        return { cmd: 'sleep timer ' + Math.max(1, Math.round(/^h/.test(m[2]) ? n * 60 : n)) + ' minutes' };
      }
      if ((m = s.match(/^(?:i (?:want|wanna|would like|'?d like|feel like)(?: to)? (?:hear|listen to)|let'?s (?:hear|listen to)|i'?m in the mood for|play me)\s+(.+)$/))) return { cmd: 'play ' + m[1] };
      if ((m = s.match(/\b(?:music|something|songs?|tunes|a playlist) (?:for|to) (study\w*|focus\w*|work ?out|working out|exercis\w*|running|sleep\w*|relax\w*|unwind\w*|party\w*|danc\w*|cook\w*|clean\w*|driv\w*)\b/))) {
        const w = m[1], id = /study|focus/.test(w) ? 'focus' : /work ?out|exercis|running/.test(w) ? 'workout' : /sleep/.test(w) ? 'sleep' : /relax|unwind/.test(w) ? 'chill' : /party|danc/.test(w) ? 'party' : 'happy';
        return { cmd: /playlist/.test(m[0]) ? 'make a ' + id + ' playlist' : 'play something ' + id };
      }
      return R(/\b(too quiet|can'?t hear (it|this|anything)|hard to hear|bump (it|the volume) up|crank it( up)?)\b|\bmake it (a (bit|little) )?louder\b/, 'louder')
        || R(/\b(too loud|hurts? my ears|bring (it|the volume) down)\b|\bmake it (a (bit|little) )?(quieter|softer|lower)\b/, 'quieter')
        || R(/\b(turn off the music|kill the music|shut off the music|silence the music)\b/, 'pause')
        || R(/\b(i (don'?t|do not) (like|want) (this|that)( song| one| track)?|not (into|feeling) (this|that)( one| song)?|something else|change (the |this )?(song|track))\b/, 'next')
        || R(/\b(going to (bed|sleep)|gonna (sleep|go to bed)|help me (fall asleep|sleep)|put me to sleep)\b/, 'sleep timer 30 minutes', 'Set a 30 minute sleep timer so the music stops by itself?')
        || R(/\b(who (sings|is singing|plays|made)( this| it)?|what('?s| is) (this|that) (song|track) called|name of (this|the) (song|track)|what are we listening to)\b/, "what's this song")
        || R(/\b(i (really )?(love|like) (this|it)( song| one| track)?)\b/, 'more like this', 'Nice! Want me to find tracks similar to this one?')
        || R(/\b(play (more|something) (like (this|that)|similar)|more of this|songs like this)\b/, 'more like this')
        || R(/\b(what are (they|he|she) saying|can'?t (understand|make out) (the )?(words|lyrics)|show (me )?the lyrics)\b/, 'get the lyrics')
        || R(/^(make|give|get|turn)( me)?( a| an| the)? (karaoke|instrumental|acapella)\b|\b(remove|take out|strip) (the )?vocals?\b|\bwithout (the )?vocals?\b/, 'split this song')
        || R(/\b(what('?s| is) (the )?(bpm|tempo|key|genre|mood)( of (this|it))?|how fast is (this|it))\b/, 'tag this song')
        || R(/\b(mix it up|randomi[sz]e|shuffle (my|the) (music|songs|tracks|library))\b/, 'shuffle on')
        || R(/\b(i missed (that|it)|say that again|play that (part|bit) again|what did (he|she|they) say)\b/, 'rewind 10 seconds')
        || R(/\b(skip|jump past|get past) (this|that) (part|bit|section)\b/, 'skip forward 30 seconds')
        || R(/\b(slow (it|this) down|too fast)\b/, 'slower')
        || R(/\b(speed (it|this) up|too slow)\b/, 'faster')
        || R(/\b(more bass|needs? (more )?bass|bass is (weak|low)|boost the bass)\b/, 'set eq to bass')
        || R(/\b(can'?t (hear|understand) the (voice|vocals?|singer)|vocals? (are|is) (quiet|muffled|low))\b/, 'set eq to vocal')
        || R(/\b(put|throw) something on\b/, 'play something');
    }
    function agentCore(raw, skip) {
      let t = blFrame(String(raw)).trim().replace(/^(hey |hi |ok |okay )?(bloop[,:]?\s*)?/i, '').replace(/^((can|could|would|will) you( please)?|please|pls|i want you to|i'?d like you to|go ahead and)\s+/i, '').replace(/\s*(please|pls|thanks|thank you)[.!?]*$/i, '').replace(/[.!?]+$/, '').trim();
      const A = window.__ppApi; if (!A || !t) return false;
      let m; const say = s => { add('bot', blTone(s)); return true; }, done = s => say('\u2713 ' + s);
      const click = id => { const b = $id(id); if (b && !b.disabled) { b.click(); return true; } return false; };
      const ask = (q, fn, keep) => { if (keep) { holdModel = true; clearTimeout(idleT); idleT = setTimeout(unloadModel, 60000); } if (blChain) blPaused = true; add('bot', q); actions([['Yes', (b, d) => { d.remove(); fn(); blResume(); }], ['No', (b, d) => { d.remove(); unloadModel(); add('bot', 'Okay, never mind.'); blResume(); }]]); return true; };
      const busyMsg = () => say("I'm in the middle of another job. Ask me again when it finishes.");
      const cur = () => A.tracks()[A.currentIndex()], need = () => cur() ? null : say('Play or pick a track first.');
      const vol = () => $id('volume');
      const setVol = v => { const e = vol(); if (!e) return false; v = Math.max(0, Math.min(100, Math.round(v))); e.value = v; e.dispatchEvent(new Event('input', { bubbles: true })); e.dispatchEvent(new Event('change', { bubbles: true })); return done('Volume ' + v + '%.'); };
      const sleepSet = (v, msg) => { const b = document.querySelector('#sleep-dropdown [data-sleep="' + v + '"]'); if (!b) return say('I cannot reach the sleep timer.'); b.click(); return done(msg); };
      const tagWith = scope => { const sc = $id('ppv-scope'); if (!sc || !$id('ppv-tag')) return say('Tagging is not ready yet.'); { const saved = Object.assign({}, loadTags()), scp = scope === 'all' ? 'your library' : 'this track'; uPush({ label: 'Put the old tags back on ' + scp + '.', undo: () => { const st = loadTags(); Object.keys(st).forEach(k => delete st[k]); Object.assign(st, saved); saveTagStore(); } }); } runJob('tag', scope === 'all' ? 'tagging your whole library' : 'tagging this track', () => { const prev = sc.value; sc.value = scope; const ok = click('ppv-tag'); sc.value = prev; return ok; }); return true; };

      if (!skip) { const ip = interpret(t); if (ip) { if (ip.q) return ask(ip.q, () => agent(ip.cmd, true)); t = ip.cmd; } }
      if (/^(help|commands|what can you do|what can i ask( you)?|what do you do)$/i.test(t)) return say(HELP + HELP_SMART + HELP_MIX + HELP_MORE);
      if (blExtra(t)) return true;
      // transport
      if (/^(pause|stop)( the)?( music| song| track| playing| playback)?$/i.test(t)) { if (!mediaOn()) return say('Nothing is playing right now.'); click('play-btn'); return done('Paused.'); }
      if (/^(resume|unpause|continue|play|keep playing|start( the)? music|play( the)? (music|song|track))$/i.test(t)) { if (mediaOn()) return say('It is already playing.'); if (A.currentIndex() < 0) return say('Nothing is loaded yet. Try \u201cplay something chill\u201d.'); click('play-btn'); return done('Playing.'); }
      if (/^(next|skip)( (the |this )?(song|track))?$/i.test(t)) { if (A.currentIndex() < 0) return say('Nothing is playing.'); click('next-btn'); return done('Skipped.'); }
      if (/^(previous|prev|go back|back)( (song|track))?$/i.test(t)) { if (A.currentIndex() < 0) return say('Nothing is playing.'); click('prev-btn'); return done('Went back.'); }
      if ((m = t.match(/^(?:(?:turn|switch) )?shuffle(?: (on|off))?$|^(?:turn|switch) (on|off) shuffle$/i))) {
        const sb = $id('shuffle-btn'); if (!sb) return say('I cannot find the shuffle button.');
        const want = (m[1] || m[2] || '').toLowerCase(), isOn = sb.classList.contains('toggled');
        if (want && (want === 'on') === isOn) return say('Shuffle is already ' + want + '.');
        sb.click(); return done('Shuffle ' + (isOn ? 'off' : 'on') + '.');
      }
      // volume
      if ((m = t.match(/^(raise|increase|turn up|boost|lower|decrease|turn down|reduce) (?:the )?volume(?: up| down)?(?: by (\d{1,3}))?$/i))) { const n = m[2] ? +m[2] : 10; return vol() ? setVol(parseFloat(vol().value) + (/^(raise|increase|turn up|boost)$/i.test(m[1]) ? n : -n)) : false; }
      if ((m = t.match(/^(?:set )?(?:the )?volume (?:to |at )?(\d{1,3})\s*%?$/i))) return setVol(+m[1]);
      if (/^(volume up|turn (it |the volume |the music )?up|louder|raise the volume|increase the volume)$/i.test(t)) return vol() ? setVol(parseFloat(vol().value) + 10) : false;
      if (/^(volume down|turn (it |the volume |the music )?down|quieter|softer|lower the volume|decrease the volume)$/i.test(t)) return vol() ? setVol(parseFloat(vol().value) - 10) : false;
      if (/^mute$/i.test(t)) { if (!vol()) return false; if (parseFloat(vol().value) > 0) agent.prevVol = parseFloat(vol().value); return setVol(0); }
      if (/^unmute$/i.test(t)) return setVol(agent.prevVol || 60);
      // sleep timer
      if (/^(cancel|turn off|clear|stop)( the)? sleep timer$/i.test(t)) return sleepSet('off', 'Sleep timer off.');
      if (/^(stop|pause|sleep)( the music| playing)? after (this|the current) (song|track)$/i.test(t) || /^sleep timer (for )?(the )?(end of )?(this |the current )?(song|track)$/i.test(t)) return sleepSet('track', 'I will stop after this track.');
      if ((m = t.match(/^(?:set (?:a )?)?sleep timer(?: for| to)?\s*(\d+)\s*(?:min\w*)?$/i)) || (m = t.match(/^(?:stop|pause|sleep)(?: the music| playing)? in (\d+)\s*(?:min\w*)?$/i))) {
        const want = +m[1], pk = [15, 30, 45, 60].reduce((a, b) => Math.abs(b - want) < Math.abs(a - want) ? b : a);
        return sleepSet(String(pk), 'Sleep timer set for ' + pk + ' minutes' + (pk !== want ? ' (the closest option to ' + want + ')' : '') + '.');
      }
      if (/^(set (a )?)?sleep timer$/i.test(t)) return say('How long? Say \u201csleep timer 30 minutes\u201d (15, 30, 45 or 60).');
      // info
      if (/^(what'?s|what is) (this|playing|the current)( song| track)?( playing)?$|^what (song|track) is this$|^what am i (listening to|hearing)$/i.test(t)) {
        const c = cur(); if (!c) return say('Nothing is playing.'); const tg = loadTags()[c.dbId];
        return say(c.title + (c.artist ? ' \u2013 ' + c.artist : '') + (tg ? '\n' + vibes(tg).join(', ') : ''));
      }
      if (/^how many (tracks|songs).*tagged$/i.test(t)) { const tg = loadTags(), tr = A.tracks().filter(x => !x.stem); return say(tr.filter(x => tg[x.dbId]).length + ' of ' + tr.length + ' tracks are tagged.'); }
      // current-track jobs through the panel's own buttons
      if (/^(tag|analy[sz]e)( this| the current| current| it)?( song| track)?$/i.test(t)) return need() || tagWith('cur');
      if (/^(tag|analy[sz]e) (all|everything|every)( of)?( my)?( songs| tracks| music| library)?$/i.test(t)) return ask('Tag your whole library? It runs one track at a time and can take a while.', () => { tagWith('all'); }, true);
      const splitIt = (c, q) => { const go = () => { runJob('split', 'splitting \u201c' + c.title + '\u201d into stems', () => { if (!window.__ppSplitTrack) return false; window.__ppSplitTrack(c); return true; }); return true; }; if (q && !blChain) return ask('Split \u201c' + c.title + '\u201d into stems using your Stems settings? It can take a while on a phone.', go, true); return go(); };
      if (/^(split|separate)( this| the current| current| it)?( song| track)?( into stems)?$|^(make|get) (the )?stems( of| for)?( this| it)?( song| track)?$/i.test(t)) { const c = cur(); if (!c) return say('Play or pick a track first.'); return splitIt(c, true); }
      if ((m = t.match(/^(?:split|separate)(?: the)? (?:song |track )?(.+?)(?: into stems)?$/i)) && !/^(?:this|it|that|one|this one|that one|this song|this track|the current|current|the current song|the current track|the song|the track)$/i.test(m[1].trim())) { const k = blFindSong(m[1]); if (k < 0) return say('I cannot find \u201c' + m[1] + '\u201d in your library.'); return splitIt(A.tracks()[k], true); }
      if (/^(transcribe|get (the )?lyrics|add lyrics|write (out )?the lyrics)( for)?( this| it)?( song| track)?$/i.test(t)) {
        const c = cur(); if (!c) return say('Play or pick a track first.');
        return ask('Write lyrics for \u201c' + c.title + '\u201d with Whisper? It downloads a model the first time.', () => { runJob('lyrics', 'writing lyrics for \u201c' + c.title + '\u201d', () => click('ppv-wgo')); }, true);
      }
      if (lcCmd(t)) return true;
      if (/^(play |find )?(more like (this|it)|similar( songs| tracks| music)?( to this)?)$/i.test(t)) return need() || (click('ppv-simgo') ? done('Looking for similar tracks.') : busyMsg());
      if (/^(skip|jump past|jump over|get past)( the)? intro$|^jump to (the )?first vocals?$/i.test(t)) return need() || (click('ppv-skipgo') ? done('Jumping ahead.') : busyMsg());
      if (/^(surprise me|play (me )?a surprise|make (me )?a surprise( playlist)?)$/i.test(t)) return click('ppv-surpnow') ? done('Putting a surprise together. It needs at least 12 tagged tracks, and I will show it when ready.') : busyMsg();
