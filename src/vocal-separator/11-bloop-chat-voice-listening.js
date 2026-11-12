    // ---------- Opening lines (chat box and first greeting). Picked by time of day, never the same line twice in a row. ----------
    const BL_OPEN = {
      any: ["Hey there! It's me, It's Bloopy! Ask me anything!", "Hi! Bloop here, bouncing in to help. What do you need?", "Yo! It's Bloop. Songs, stems, lyrics, playlists: pick one!", "Hello! I'm Bloop, and I'm ready when you are.", "Boing! Hi, it's Bloop. What are we listening to?", "Hey! Want to chat, or should I just play something?"],
      morning: ["Good morning! It's Bloopy, ready for a new day of music!", "Morning! Bloop here. Coffee first, or a song first?"],
      day: ["Hey there, it's Bloopy! How's your day going?", "Afternoon! Bloop here. Want something to keep you going?"],
      night: ["Up late? It's me, Bloopy! Want something soft?", "Good evening! Bloop here. Tell me what you need, I'm all ears."]
    };
    let blLastOpen = '';
    function blOpenLine() {
      const h = new Date().getHours(), pool = h < 5 || h >= 22 ? BL_OPEN.night : h < 12 ? BL_OPEN.morning : h < 18 ? BL_OPEN.day : BL_OPEN.any;
      const all = pool.concat(BL_OPEN.any), sp = (BL_SKIN_SAY[blSkinKey()] || {}).open, from = sp && Math.random() < 0.7 ? sp : all, fresh = from.filter(x => x !== blLastOpen), line = pick(fresh.length ? fresh : from);
      blLastOpen = line; return line;
    }
    function set(m, text, hold) {
      if (!on) return;
      mood = m; clearTimeout(tmr);
      [pb, fb].forEach(x => { x.className = 'ppv-ball m-' + m; blFace(x, m); });
      if (text != null) bub.textContent = fbub.textContent = text;
      if (hold) tmr = setTimeout(() => { key = ''; set('idle', blLine('idle', L.idle)); }, hold);
    }
    function pop() {
      if (!on || !bubblesOn() || panel.style.display === 'block') return;
      fl.style.display = 'flex'; clearTimeout(ftmr); ftmr = setTimeout(() => { fl.style.display = 'none'; }, 6000);
    }
    function react(text) {
      try { jobEnd(text); } catch (e) { console.error(e); }
      if (!on) return; text = String(text || '');
      let m = 'work', k = 'gen', lines = L.gen;
      if (/^Error|failed/i.test(text)) { m = 'err'; k = 'err'; lines = L.err; }
      else if (/^(Done|Tagged and saved|Playlists updated|Playlist made|Auto-EQ set|Jumped|Deleted)/.test(text)) { m = 'done'; k = 'done'; lines = L.done; }
      else if (/^Stopp/.test(text)) { set('idle', 'Okay, stopping here.'); key = ''; return; }
      else if (/^Downloading/.test(text)) { k = 'dl'; lines = L.dl; }
      else if (/^Decoding/.test(text)) { k = 'dec'; lines = L.dec; }
      else if (/^Separating/.test(text)) { k = 'sep'; lines = L.sep; }
      else if (/^Encoding/.test(text)) { k = 'enc'; lines = L.enc; }
      else if (/^(Tagging|Analysing|Finding|Listening)/.test(text)) { k = 'tag'; lines = L.tag; }
      else if (/transcrib|whisper|lyrics/i.test(text)) { k = 'wh'; lines = L.wh; }
      else if (!/…|\d+%\s*$/.test(text)) {                         // "Ready", "Model not downloaded yet"... = nothing running
        if (mood === 'work') { key = ''; set('idle', blLine('idle', L.idle)); }
        else if (panel.style.display === 'block' && key !== 'panel') { key = 'panel'; set('idle', blLine('panel', L.panel)); }
        return;
      }
      try { blEquip(blPropOfJob(k) || (m === 'err' ? 'phone' : null)); } catch (e) { console.error(e); }
      if (k === key) return;                                       // same phase, keep the current animation going
      key = k;
      if (m === 'work') { set('work', blLine(k, lines)); return; }
      set(m, blLine(k, lines), 6000); pop();
    }

    // ---------- Chat with Bloop: a small on-device language model (choose one in settings) via transformers.js ----------
    // Off by default. App questions and crisis messages are answered from fixed text (no model needed, always reliable);
    // everything else goes to the small model. Chat is kept in memory only.
    // Chat models. Pick one in the Bloop brain settings. file = the ONNX file in that repo, eos = end-of-turn tokens, mb = rough download size.
    const CHAT_MODELS = {
      qwen05:  { id: 'onnx-community/Qwen2.5-0.5B-Instruct', label: 'Qwen2.5 0.5B (default, better, ~520 MB)', mb: 520, file: 'onnx/model_quantized.onnx', eos: ['<|im_end|>', '<|endoftext|>'], lid: 'llm_qwen05' },
      llama1b: { id: 'onnx-community/Llama-3.2-1B-Instruct', label: 'Llama 3.2 1B (most capable, ~1.3 GB, needs a strong phone)', mb: 1300, file: 'onnx/model_quantized.onnx', eos: ['<|eot_id|>', '<|end_of_text|>'], lid: 'llm_llama1b' },
      // LiteRT-LM models (Android app only): one .litertlm file, the runtime does tokenizing, chat template and sampling.
      // To add another, copy this line and use the exact file name from the model's "Files" page on Hugging Face.
      gemma4:  { id: 'litert-community/gemma-4-E2B-it-litert-lm', label: 'Gemma 4 E2B (LiteRT-LM, app only, ~2.4 GB, strong phone)', mb: 2400, lm: true, lid: 'lm_gemma4_e2b', url: 'https://huggingface.co/litert-community/gemma-4-E2B-it-litert-lm/resolve/main/gemma-4-E2B-it.litertlm' },
      gemma4e4b: { id: 'litert-community/gemma-4-E4B-it-litert-lm', label: 'Gemma 4 E4B (LiteRT-LM, app only, ~3.7 GB, flagship phones)', mb: 3650, lm: true, lid: 'lm_gemma4_e4b', url: 'https://huggingface.co/litert-community/gemma-4-E4B-it-litert-lm/resolve/main/gemma-4-E4B-it.litertlm' },
      qwen15lm:  { id: 'litert-community/Qwen2.5-1.5B-Instruct', label: 'Qwen2.5 1.5B (LiteRT-LM, app only, ~1.6 GB)', mb: 1600, lm: true, lid: 'lm_qwen15_q8', url: 'https://huggingface.co/litert-community/Qwen2.5-1.5B-Instruct/resolve/main/Qwen2.5-1.5B-Instruct_multi-prefill-seq_q8_ekv4096.litertlm' },
      qwen15i4:  { id: 'leuconoe/litert-lm-unity-quantized', label: 'Qwen2.5 1.5B 4-bit (LiteRT-LM, app only, ~790 MB, community build)', mb: 790, lm: true, lid: 'lm_qwen15_i4', url: 'https://huggingface.co/leuconoe/litert-lm-unity-quantized/resolve/main/qwen2.5-1.5b-instruct/Qwen2.5-1.5B-Instruct_wi4b64_ekv4096.litertlm' },
      qwen05i4:  { id: 'leuconoe/litert-lm-unity-quantized', label: 'Qwen2.5 0.5B 4-bit (LiteRT-LM, app only, ~265 MB, community build, short memory)', mb: 265, lm: true, lid: 'lm_qwen05_i4', url: 'https://huggingface.co/leuconoe/litert-lm-unity-quantized/resolve/main/qwen2.5-0.5b-instruct/Qwen2.5-0.5B-Instruct_wi4b64_ekv1280.litertlm' },
      smol135: { id: 'HuggingFaceTB/SmolLM2-135M-Instruct', label: 'SmolLM2 135M (tiny, ~150 MB, the old one)', mb: 150, file: 'onnx/model_quantized.onnx', eos: ['<|im_end|>'], lid: 'llm_smollm2' }
    };
    // Users who already downloaded the old SmolLM2 keep it; everyone else gets Qwen2.5 0.5B.
    const chatKey = () => {
      try {
        const k = localStorage.getItem('ppvChatModel');
        if (CHAT_MODELS[k]) return k;
        return localStorage.getItem('ppvChatDl') === '1' ? 'smol135' : 'qwen05';
      } catch (e) { return 'qwen05'; }
    };
    const webId = k => (CHAT_MODELS[k].lm ? CHAT_MODELS.qwen05 : CHAT_MODELS[k]).id;   // the browser cannot run .litertlm, so it uses Qwen instead
    let CHAT_MODEL = webId(chatKey());
    let pendingJob = null, holdModel = false, idleT = 0, chatOn = lsGet('ppvChat') === '1', gen = null, genP = null, chatBusy = false, dlOk = false, hist = [], musicMode = lsGet('ppvMusicMode') === '1', aiOnly = lsGet('ppvAiOnly') === '1';
    // How many past exchanges (your message + Bloop's reply) he remembers during a chat. 0 = none. More memory = slower and more RAM on a tiny model.
    const MEM_MAX = 8, memN = () => { const v = parseInt(lsGet('ppvMem'), 10); return isNaN(v) ? 4 : Math.max(0, Math.min(MEM_MAX, v)); };
    const setMem = v => { v = Math.max(0, Math.min(MEM_MAX, parseInt(v, 10) || 0)); lsSet('ppvMem', String(v)); hist = memN() ? hist.slice(-2 * memN()) : []; return v; };
    const cstyle = document.createElement('style');
    cstyle.textContent = `
      #ppv-cfab{position:fixed;left:12px;bottom:calc(96px + env(safe-area-inset-bottom,0px));z-index:99997;display:none;filter:drop-shadow(0 4px 10px #0007)}
      #ppv-cfab .ppv-ball{width:54px;height:54px}
      #ppv-cfab[data-unread]::after{content:'';position:absolute;top:2px;right:2px;width:13px;height:13px;border-radius:50%;background:#ff5c7c;border:2px solid #1b1c20}
      #ppv-chat{position:fixed;left:12px;right:12px;bottom:calc(160px + env(safe-area-inset-bottom,0px));z-index:99997;max-width:420px;max-height:min(58vh,440px);display:none;flex-direction:column;background:#1b1c20;color:#eee;border:1px solid #3a3b42;border-radius:14px;box-shadow:0 8px 28px #000a;font:13.5px/1.4 system-ui,sans-serif;overflow:hidden}
      #ppv-chat .ch-h{display:flex;align-items:center;gap:8px;padding:8px 10px;border-bottom:1px solid #2e2f36}
      #ppv-chat .ch-n{flex:1;font-size:10.5px;opacity:.6;line-height:1.25}
      #ppv-chat button{background:#2f3037;color:#eee;border:1px solid #484952;border-radius:8px;padding:6px 10px;font:inherit;cursor:pointer}
      #ppv-chat .ch-c{padding:3px 8px;font-size:12px}
      #ppv-chat .ch-l{flex:1;overflow:auto;padding:10px;display:flex;flex-direction:column;gap:7px;min-height:90px}
      #ppv-chat .ch-m{max-width:86%;padding:7px 10px;border-radius:12px;white-space:pre-wrap;word-wrap:break-word}
      #ppv-chat .ch-m.bot{align-self:flex-start;background:#2a2b31}
      #ppv-chat .ch-m.me{align-self:flex-end;background:var(--accent,#7c5cff);color:#fff}
      #ppv-chat .ch-a{align-self:flex-start;display:flex;gap:6px;flex-wrap:wrap}
      #ppv-chat .lf-box{padding:4px 10px}#ppv-chat .lf-it{display:flex;gap:8px;align-items:flex-start;padding:7px 0;border-top:1px solid #3a3b42;cursor:pointer}#ppv-chat .lf-it:first-child{border-top:0}#ppv-chat .lf-it input{margin-top:3px;flex:none}#ppv-chat .lf-it span{flex:1;min-width:0}#ppv-chat .ch-a button:disabled{opacity:.4}#ppv-chat .lf-it{border-top:0;padding:7px 0 2px}#ppv-chat .lf-item{border-top:1px solid #3a3b42}#ppv-chat .lf-item:first-child{border-top:0}#ppv-chat .lf-it u.o{text-decoration:underline wavy #ff6b6b;text-underline-offset:3px}#ppv-chat .lf-it u.n{text-decoration:underline #4ade80;text-underline-offset:3px}#ppv-chat .lf-row{display:flex;gap:6px;flex-wrap:wrap;margin:2px 0 6px 26px}#ppv-chat .lf-ed{flex-direction:column;gap:6px;margin:0 0 8px 26px}#ppv-chat .lf-ed input{padding:7px;border-radius:8px;background:#2a2b31;color:#eee;border:1px solid #444;font:inherit;width:100%;box-sizing:border-box}#ppv-chat .lf-ed button{align-self:flex-start}#ppv-chat .lf-h{font-size:12px;opacity:.75}
      #ppv-chat .ch-i{display:flex;gap:6px;padding:8px;border-top:1px solid #2e2f36}
      #ppv-chat .ch-i input{flex:1;min-width:0;padding:8px;border-radius:8px;background:#2a2b31;color:#eee;border:1px solid #444;font:inherit}
      #ppv-chat .ch-i .ch-mic{padding:6px 9px;display:flex;align-items:center}
      #ppv-chat .ch-mic svg{width:16px;height:16px}
      #ppv-chat .ch-mic.rec{background:#ff5c7c;border-color:#ff5c7c;color:#fff}`;
    document.head.appendChild(cstyle);
    const cfab = document.createElement('div'); cfab.id = 'ppv-cfab'; cfab.setAttribute('role', 'button'); cfab.setAttribute('aria-label', 'Chat with Bloop');
    const cball = ball(); cfab.appendChild(cball);
    const cbox = document.createElement('div'); cbox.id = 'ppv-chat';
    cbox.innerHTML = '<div class="ch-h"><b>Bloop</b><span class="ch-n">Your tiny helper in the player!.</span><button class="ch-c" data-a="aionly" aria-pressed="false" title="Send everything to the AI. Bloop will not jump in on keywords">AI only: off</button><button class="ch-c" data-a="music" aria-pressed="false" title="Only talk about the music in your library and playlists">Music: off</button><button class="ch-c" data-a="clear">Clear</button><button class="ch-c" data-a="x" aria-label="Close">&times;</button></div><div class="ch-l"></div><div class="ch-i"><input type="text" maxlength="400" placeholder="Say something to Bloop" enterkeyhint="send"><button data-a="mic" class="ch-mic" aria-label="Talk to Bloop" style="display:none"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="2" width="6" height="12" rx="3"/><path d="M5 11a7 7 0 0 0 14 0"/><line x1="12" y1="18" x2="12" y2="22"/></svg></button><button data-a="send">Send</button></div>';
    document.body.append(cfab, cbox);
    const clist = cbox.querySelector('.ch-l'), cin = cbox.querySelector('input');
    // Music mode: Bloop only talks about the user's own songs and playlists, using real library data in the prompt.
    const musicBtn = cbox.querySelector('[data-a="music"]');
    const setMusicMode = v => {
      musicMode = !!v; lsSet('ppvMusicMode', musicMode ? '1' : '0'); hist = [];                 // a fresh memory, so the two modes do not mix
      musicBtn.textContent = musicMode ? 'Music: on' : 'Music: off'; musicBtn.setAttribute('aria-pressed', String(musicMode));
      musicBtn.style.opacity = musicMode ? '1' : '.65'; cin.placeholder = musicMode ? 'Talk about your music' : 'Say something to Bloop';
    };
    setMusicMode(musicMode);
    // AI only: skip every keyword rule, command and scripted reply, and send the message straight to the AI. The crisis safety check still runs.
    const aiBtn = cbox.querySelector('[data-a="aionly"]');
    const setAiOnly = v => { aiOnly = !!v; lsSet('ppvAiOnly', aiOnly ? '1' : '0'); aiBtn.textContent = aiOnly ? 'AI only: on' : 'AI only: off'; aiBtn.setAttribute('aria-pressed', String(aiOnly)); aiBtn.style.opacity = aiOnly ? '1' : '.65'; };
    setAiOnly(aiOnly);
    const cm = m => { cball.className = 'ppv-ball m-' + m; blFace(cball, m); };
    const scrollDown = () => { clist.scrollTop = clist.scrollHeight; };
    const add = (who, text) => { const d = document.createElement('div'); d.className = 'ch-m ' + who; d.textContent = text; clist.appendChild(d); scrollDown(); if (who === 'bot') { blReact(text); if (!aiOnly) blFollowUp(d, text); try { vSpeak(text); } catch (e) {} } return d; };
    const actions = btns => { const d = document.createElement('div'); d.className = 'ch-a'; btns.forEach(([t, fn]) => { const b = document.createElement('button'); b.textContent = t; b.onclick = () => { fn(b, d); }; d.appendChild(b); }); clist.appendChild(d); scrollDown(); return d; };
    // ---------- Voice and meaning (all optional, all on-device, all off until ticked) ----------
    // MiniLM (~25 MB): loose wording finds the right command, and songs are found by meaning ("something for a rainy drive").
    // Kokoro (82M, ~90 MB): Bloop's voice. Moonshine tiny (~50 MB): speech to text. openWakeWord: three tiny ONNX files on onnxruntime-web.
    // Each download is asked for once, then comes from the browser cache. Nothing here runs unless its checkbox is on.
    const MINI_ID = 'Xenova/all-MiniLM-L6-v2', KOKORO_ID = 'onnx-community/Kokoro-82M-v1.0-ONNX', MOON_ID = 'onnx-community/moonshine-tiny-ONNX';
    const KOKORO_JS = 'https://cdn.jsdelivr.net/npm/kokoro-js@1.2.1/dist/kokoro.web.js';
    const WAKE_HF = 'https://huggingface.co/Soulcreek2/speechkit-wakeword-models/resolve/main/';   // Apache-2.0 openWakeWord-style heads; hey_bloop.onnx in HF_BASE wins if you upload one
    const SEM = { auto: 0.70, ask: 0.52, gap: 0.03, song: 0.32, songBare: 0.45 };                   // MiniLM cosine cut-offs: tune these if it guesses too much or too little
    const VOICE = { fr: 1280, vad: 0.02, quiet: 13, wait: 75, max: 150, speed: 1.04 };             // 80 ms frames: stop after ~1 s of quiet, give up after ~6 s of nothing, cap ~12 s
    const VOICES = [['af_heart', 'Heart (warm)'], ['af_nicole', 'Nicole (calm)'], ['af_bella', 'Bella (brighter)'], ['af_sarah', 'Sarah'], ['am_michael', 'Michael'], ['bf_emma', 'Emma (British)'], ['bm_george', 'George (British)']];
    const vFlag = k => lsGet(k) === '1';
    const miniOn = () => vFlag('ppvMini'), speakOn = () => vFlag('ppvVoice'), micOn = () => vFlag('ppvMic'), wakeOn = () => vFlag('ppvWake') && micOn() && chatOn;
    const vCat = (a, b) => { const o = new Float32Array(a.length + b.length); o.set(a); o.set(b, a.length); return o; };
    const vDot = (a, b) => { let s = 0; for (let i = 0; i < a.length; i++) s += a[i] * b[i]; return s; };
    const vHash = s => { let h = 5381; for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0; return h >>> 0; };
    const tfLoad = async () => { if (!tfMod) tfMod = await import(TF_URL); try { tfMod.env.backends.onnx.wasm.numThreads = self.crossOriginIsolated ? Math.min(2, navigator.hardwareConcurrency || 2) : 1; } catch (e) {} return tfMod; };
    const dlSay = (say, what) => p => { if (say && p && p.status === 'progress' && p.file) say('Downloading ' + what + ' ' + Math.round(p.progress || 0) + '%'); };
    // Ask once before a big download (same pattern as the chat brain). Returns true when it asked, so the caller stops and waits for the answer.
    const dlAsk = (flag, msg, go) => { if (lsGet(flag) === '1') return false; add('bot', msg); actions([['Download', (b, d) => { d.remove(); lsSet(flag, '1'); go(); }], ['Not now', (b, d) => d.remove()]]); return true; };
    let voiceTurn = false, vSpeaking = false, wwHold = 0, duckSave = null;

    // ---- MiniLM: meaning ----
    let miniP = null, miniT = 0, semCmd = null, semIdx = null, semBusy = false, semAsked = false;
    function getMini(say) {
      if (miniP) return miniP;
      miniP = (async () => {
        const CP = window.Capacitor && window.Capacitor.Plugins, PE = CP && CP.PPEmbed, OS = CP && CP.OnnxSeparator;
        say && say('Loading MiniLM\u2026');
        // Android app, fully native: Java tokenizes and runs the model on background threads, so transformers.js is never loaded
        // and nothing heavy runs on the page. An older app build without loadVocab/embed throws here and drops to the routes below.
        if (NATIVE && PE && OS) {
          try {
            const base = 'https://huggingface.co/' + MINI_ID + '/resolve/main/';
            const need = async (id, url, what) => { if (!(await OS.exists({ id })).ready) { say && say('Downloading ' + what + '\u2026'); await OS.download({ id, url }); } };
            await need('minilm_q8', base + 'onnx/model_quantized.onnx', 'MiniLM');
            await need('minilm_tok', base + 'tokenizer.json', 'MiniLM vocabulary');
            await PE.load({ id: 'minilm_q8' });
            await PE.loadVocab({ id: 'minilm_tok' });
            const fe = async texts => { const r = await PE.embed({ texts, maxLen: 128 }); return { dims: [r.count, r.dim], data: await fromB64(r.data) }; };   // already mean-pooled and normalized natively
            fe.dispose = async () => { try { await PE.unload(); } catch (e) {} };
            return fe;
          } catch (e) { console.warn('fully native MiniLM unavailable, trying the older route', e); }
        }
        const tf = await tfLoad();
        // Older route: the model runs natively but the tokenizer stays in JS. Any failure falls back to the web pipeline below.
        if (NATIVE && PE && OS) {
          try {
            const tok = await tf.AutoTokenizer.from_pretrained(MINI_ID);
            if (!(await OS.exists({ id: 'minilm_q8' })).ready) { say && say('Downloading MiniLM\u2026'); await OS.download({ id: 'minilm_q8', url: 'https://huggingface.co/' + MINI_ID + '/resolve/main/onnx/model_quantized.onnx' }); }
            await PE.load({ id: 'minilm_q8' });
            const fe = async texts => {
              const enc = tok(texts, { padding: true, truncation: true, max_length: 128 }), B = enc.input_ids.dims[0], L = enc.input_ids.dims[1];
              const rows = t => { const out = []; for (let i = 0; i < B; i++) { const r = new Array(L); for (let j = 0; j < L; j++) r[j] = Number(t.data[i * L + j]); out.push(r); } return out; };
              const r = await PE.run({ ids: rows(enc.input_ids), mask: rows(enc.attention_mask) });
              const bin = atob(r.data), u8 = new Uint8Array(bin.length);
              for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
              return { dims: [r.count, r.dim], data: new Float32Array(u8.buffer) };   // already mean-pooled and normalized natively
            };
            fe.dispose = async () => { try { await PE.unload(); } catch (e) {} };
            return fe;
          } catch (e) { console.warn('native MiniLM unavailable, using the web version', e); }
        }
        return tf.pipeline('feature-extraction', MINI_ID, { dtype: 'q8', device: 'wasm', progress_callback: dlSay(say, 'MiniLM') });
      })();
      miniP.catch(() => { miniP = null; });
      return miniP;
    }
    async function freeMini() { clearTimeout(miniT); const p = miniP; miniP = null; if (p) { try { const fe = await p; await fe.dispose(); } catch (e) {} } }
    async function mEmbed(texts, say) {
      const fe = await getMini(say), out = [];
      for (let i = 0; i < texts.length; i += 16) {
        const r = await fe(texts.slice(i, i + 16), { pooling: 'mean', normalize: true }), w = r.dims[r.dims.length - 1];
        for (let k = 0; k < r.dims[0]; k++) out.push(Float32Array.from(r.data.subarray(k * w, (k + 1) * w)));
        if (texts.length > 16) await tick();
      }
      clearTimeout(miniT); miniT = setTimeout(freeMini, 120000);
      return out;
    }
    // Every phrase the agent already knows for each command, embedded once and kept in IndexedDB.
    async function semCommands(say) {
      if (semCmd) return semCmd;
      const items = []; S_CAT.forEach(([cmd, safe, ph]) => ph.forEach(t => items.push({ cmd, safe, t })));
      const sig = vHash(items.map(x => x.t).join('|'));
      let c = null; try { c = await idbGet('mini_cmd'); } catch (e) {}
      if (c && c.sig === sig && c.v && c.v.length === items.length) { items.forEach((x, i) => { x.v = c.v[i]; }); return (semCmd = items); }
      const vs = await mEmbed(items.map(x => x.t), say); items.forEach((x, i) => { x.v = vs[i]; });
      try { await idbPut('mini_cmd', { sig, v: vs }); } catch (e) {}
      return (semCmd = items);
    }
    // One short text per song: title, artist, tag words and the start of any lyrics. Re-embedded only when that text changes.
    const trackText = t => (t.title + '. ' + (t.artist || '') + '. ' + (window.__ppTagText ? window.__ppTagText(t.dbId) : '')).replace(/\s+/g, ' ').slice(0, 600);
    async function semTracks(say) {
      const A = window.__ppApi, tr = A.tracks(), want = [];
      if (!semIdx) { try { semIdx = (await idbGet('mini_trk')) || {}; } catch (e) { semIdx = {}; } }
      tr.forEach(t => { if (t.stem) return; const x = trackText(t), h = vHash(x); if (!semIdx[t.dbId] || semIdx[t.dbId].h !== h) want.push({ id: t.dbId, x, h }); });
      for (let i = 0; i < want.length; i += 48) {
        const part = want.slice(i, i + 48), vs = await mEmbed(part.map(w => w.x), null);
        part.forEach((w, k) => { semIdx[w.id] = { h: w.h, v: vs[k] }; });
        say && say('Learning songs\u2026 ' + Math.min(want.length, i + 48) + ' of ' + want.length);
      }
      if (want.length) { try { await idbPut('mini_trk', semIdx); } catch (e) {} }
      return tr.map((t, i) => !t.stem && semIdx[t.dbId] ? { i, v: semIdx[t.dbId].v } : null).filter(Boolean);
    }
    const MUSICWORD = /\b(song|songs|music|track|tracks|tune|tunes|playlist|vibe|mood|feel|feels|feeling|something|anything|play|listen|put on|about)\b/i;
    // Runs after the exact rules and the keyword matcher, right before the chat brain. Returns true when it answered.
    async function semRoute(raw) {
      if (!miniOn() || !window.__ppApi || semBusy || smartSt.noRoute === raw) return false;
      const t = sClean(raw); if (!t || t.length > 90 || /\b(?:don'?t|dont|do not|never)\b/i.test(t) || heavyBusy()) return false;
      if (lsGet('ppvMiniDl') !== '1') {
        if (!semAsked) { semAsked = true; dlAsk('ppvMiniDl', 'To understand looser wording and find songs by meaning I need to download MiniLM first: about 25 MB, one time.', () => send(raw, true)); }
        return false;
      }
      semBusy = true; const note = add('bot', '\u2026'), say = s => { note.textContent = s; }, A = window.__ppApi;
      try {
        const cmds = await semCommands(say), q = (await mEmbed([t], say))[0], byCmd = new Map();
        cmds.forEach(x => { const s = vDot(q, x.v), o = byCmd.get(x.cmd); if (!o || o.s < s) byCmd.set(x.cmd, { cmd: x.cmd, safe: x.safe, s }); });
        const rank = [...byCmd.values()].sort((a, b) => b.s - a.s), top = rank[0], nxt = rank[1];
        if (top && top.s >= SEM.ask && (!nxt || top.s - nxt.s >= SEM.gap)) {                       // 1) the same command in other words
          if (top.safe && top.s >= SEM.auto) { note.textContent = '(Reading that as \u201c' + top.cmd + '\u201d.)'; if (sExec(top.cmd)) return true; note.remove(); return false; }
          note.textContent = 'Did you mean \u201c' + top.cmd + '\u201d?'; vSpeak(note.textContent);
          actions([['\u25b6 ' + top.cmd, (b, d) => { d.remove(); sExec(top.cmd); }], ['No', (b, d) => { d.remove(); smartSt.noRoute = raw; send(raw, true); }]]);
          return true;
        }
        const songs = await semTracks(say);                                                         // 2) songs that fit the meaning
        const sc = songs.map(o => ({ i: o.i, s: vDot(q, o.v) })).sort((a, b) => b.s - a.s), need = MUSICWORD.test(t) ? SEM.song : SEM.songBare;
        const take = sc.slice(0, 12).filter(o => o.s >= need && o.s >= sc[0].s - 0.12).map(o => o.i);
        if (take.length < 3) { note.remove(); return false; }
        const tr = A.tracks();
        note.textContent = 'These fit \u201c' + t + '\u201d:\n' + take.slice(0, 5).map(i => '\u2022 ' + tr[i].title).join('\n') + (take.length > 5 ? '\n\u2026and ' + (take.length - 5) + ' more.' : '');
        vSpeak('Here are ' + take.length + ' songs that fit.');
        actions([['\u25b6 Play them', () => { A.play(take[0], take); }], ['Make a playlist', (b, d) => {
          d.remove(); const pl = A.createPlaylist('\ud83d\udd0e ' + t.slice(0, 40)); take.forEach(i => A.addToPlaylist(tr[i].dbId, pl.id)); A.commitPlaylists();
          smartSt.pu = { at: Date.now(), label: 'Deleted \u201c' + pl.name + '\u201d.', undo: () => { A.deletePlaylistQuiet(pl.id); A.commitPlaylists(); } };
          add('bot', '\u2713 Made \u201c' + pl.name + '\u201d with ' + take.length + ' tracks.');
        }]]);
        return true;
      } catch (e) { console.error(e); note.textContent = 'Smart understanding failed: ' + e.message; return true; }
      finally { semBusy = false; }
    }

    // ---- Kokoro: Bloop speaks ----
    let kP = null, kT = 0, kLoaded = false, spkId = 0, spkCtx = null, spkSrc = null, voiceAsked = false;
    // Native option (app only): the phone's own text-to-speech reads the reply, so nothing is downloaded. A failure drops back to Kokoro for the session.
    let vNatFailed = false, natTalk = false;
    const natTts = () => { try { return NATIVE ? window.Capacitor.Plugins.PPSpeech : null; } catch (e) { return null; } };
    const voiceNat = () => !vNatFailed && vFlag('ppvVoiceNat') && !!natTts();
    async function speakNative(id, sents) {
      const P = natTts(); vDuck(true); natTalk = true; vSpeaking = true;
      try { for (const t of sents) { if (id !== spkId) return; const r = await P.speak({ text: t, rate: VOICE.speed, lang: 'en-US' }); if (id !== spkId || !r || r.done === false) return; } }
      finally { if (id === spkId) { natTalk = false; vSpeaking = false; wwHold = Date.now() + 700; vDuck(false); } }
    }
    const voiceWho = () => { const v = lsGet('ppvVoiceWho'); return VOICES.some(x => x[0] === v) ? v : 'af_heart'; }, voiceWhen = () => lsGet('ppvVoiceWhen') === 'all' ? 'all' : 'talk';
    function getTts(say) {
      if (kP) return kP;
      kP = (async () => {
        say && say('Loading my voice\u2026');
        const mod = await import(KOKORO_JS);
        return mod.KokoroTTS.from_pretrained(KOKORO_ID, { dtype: 'q8', device: 'wasm', progress_callback: dlSay(say, 'my voice') });
      })();
      kP.catch(() => { kP = null; kLoaded = false; });
      return kP;
    }
    async function freeVoice() { clearTimeout(kT); const p = kP; kP = null; kLoaded = false; if (p) { try { const t = await p; await t.model.dispose(); } catch (e) {} } }
    const SKIPSPEAK = /^(?:\u2026|\.\.\.|\(Reading that as|Downloading|Loading|Listening|Transcribing)/;
    // Calm, not bubbly: exclamation marks become full stops, and only the first few sentences are read out.
    function speechSentences(s, full) {
      const t = String(s).replace(/https?:\/\/\S+/g, ' ').replace(/[\u2713\u2022\u25b6\u2192\u2190]/g, ' ').replace(/\p{Extended_Pictographic}/gu, ' ').replace(/[\u201c\u201d"]/g, '')
        .replace(/\(([^)]{0,80})\)/g, ', $1,').replace(/\s*\n+\s*/g, '. ').replace(/!+/g, '.').replace(/\.{2,}/g, '.').replace(/\s+/g, ' ').trim();
      const parts = t.split(/(?<=[.?])\s+/).filter(x => /\p{L}/u.test(x)); if (full) return parts;
      const out = []; let n = 0;
      for (const p of parts) { if (out.length >= 3 || (out.length && n + p.length > 260)) break; out.push(p.length > 260 ? p.slice(0, 260).replace(/\s+\S*$/, '') : p); n += p.length; }
      return out;
    }
    function vSpeak(text, force) {
      if (!speakOn() || !text || (!force && voiceWhen() === 'talk' && !voiceTurn)) return;
      const s = String(text).trim(); if (SKIPSPEAK.test(s) || heavyBusy()) return;
      const sents = speechSentences(s, typeof CRISIS_MSG !== 'undefined' && s === CRISIS_MSG); if (!sents.length) return;   // a safety message is always read in full
      if (!voiceNat() && lsGet('ppvVoiceDl') !== '1') { if (!voiceAsked) { voiceAsked = true; dlAsk('ppvVoiceDl', 'To talk out loud I need to download my voice first: about 90 MB, one time. Wi-Fi is best.', () => { voiceAsked = false; vSpeak(s, true); }); } return; }
      const id = ++spkId; stopAudio();
      speakRun(id, sents).catch(e => { console.error(e); if (id === spkId) vDuck(false); });
    }
    async function speakRun(id, sents) {
      if (voiceNat()) {
        try { await speakNative(id, sents); return; }
        catch (e) {
          console.warn('native voice failed, using Kokoro', e); vNatFailed = true; if (id !== spkId) return;
          if (lsGet('ppvVoiceDl') !== '1') { add('bot', 'The phone\u2019s own voice did not work here, so I will use my downloaded voice instead.'); spkId++; vSpeak(sents.join(' '), true); return; }
        }
      }
      let note = null; if (!kLoaded) note = add('bot', 'Loading my voice\u2026');
      let tts; try { tts = await getTts(note ? m => { note.textContent = m; } : null); }
      catch (e) { if (note) note.textContent = 'My voice would not load: ' + e.message; return; }
      kLoaded = true; if (note) note.remove();
      if (id !== spkId) return;
      const gen = s => tts.generate(s, { voice: voiceWho(), speed: VOICE.speed });
      let nxt = gen(sents[0]); nxt.catch(() => {}); vDuck(true);
      for (let i = 0; i < sents.length; i++) {
        const a = await nxt; if (id !== spkId) return;
        if (i + 1 < sents.length) { nxt = gen(sents[i + 1]); nxt.catch(() => {}); }          // make the next sentence while this one plays
        await playPcm(a.audio, a.sampling_rate, id); if (id !== spkId) return;
      }
      vDuck(false); clearTimeout(kT); kT = setTimeout(freeVoice, 180000);
    }
    function playPcm(pcm, rate) {
      return new Promise(res => {
        try {
          const C = window.AudioContext || window.webkitAudioContext, ctx = spkCtx || (spkCtx = new C());
          if (ctx.state === 'suspended') ctx.resume();
          const buf = ctx.createBuffer(1, pcm.length, rate), src = ctx.createBufferSource(); buf.copyToChannel(pcm, 0); src.buffer = buf; src.connect(ctx.destination);
          spkSrc = src; vSpeaking = true;
          src.onended = () => { if (spkSrc === src) spkSrc = null; vSpeaking = false; wwHold = Date.now() + 700; res(); };
          src.start();
        } catch (e) { vSpeaking = false; res(); }
      });
    }
    function stopAudio() { if (natTalk) { natTalk = false; try { natTts().stop().catch(() => {}); } catch (e) {} } const s = spkSrc; spkSrc = null; if (s) { try { s.onended = null; s.stop(); } catch (e) {} } vSpeaking = false; }
    function stopSpeak() { spkId++; stopAudio(); vDuck(false); }
    function vDuck(on) {                                                                          // music dips while he talks or listens
      try {
        if (on && !duckSave) { duckSave = []; document.querySelectorAll('audio,video').forEach(m => { if (!m.paused) { duckSave.push([m, m.volume]); m.volume = m.volume * 0.25; } }); if (!duckSave.length) duckSave = null; }
        else if (!on && duckSave) { duckSave.forEach(([m, v]) => { m.volume = v; }); duckSave = null; }
      } catch (e) {}
    }
    function vPrime() { try { const C = window.AudioContext || window.webkitAudioContext; if (!speakOn() || !C) return; if (!spkCtx) spkCtx = new C(); if (spkCtx.state === 'suspended') spkCtx.resume(); } catch (e) {} }   // browsers want audio started from a tap
    function vTyped() { voiceTurn = false; vPrime(); stopSpeak(); }

    // ---- Moonshine: Bloop listens ----
    let earsP = null, earsT = 0, dictating = false, dictStop = false;
    function getEars(say) {
      if (earsP) return earsP;
      earsP = (async () => {
        const tf = await tfLoad(); say && say('Loading my ears\u2026');
        try { return await tf.pipeline('automatic-speech-recognition', MOON_ID, { dtype: 'q8', device: 'wasm', progress_callback: dlSay(say, 'my ears') }); }
        catch (e) { return tf.pipeline('automatic-speech-recognition', MOON_ID, { device: 'wasm', progress_callback: dlSay(say, 'my ears') }); }
      })();
      earsP.catch(() => { earsP = null; });
      return earsP;
    }
    // Native option (app only): the app's own Whisper engine (the one that makes subtitles) hears the sentence instead of Moonshine.
    // It uses English Base if that is already on the phone, otherwise English Tiny. A failure drops back to Moonshine for the session.
    let eNatFailed = false, earsNT = 0;
    const earsNat = () => !!NATIVE && !eNatFailed && vFlag('ppvEarsNat');
    async function earsNative(pcm, say) {
      let size = 'tiny_en';
      try { if ((await NP.exists({ id: 'wh_base_en_enc' })).ready && (await NP.exists({ id: 'wh_base_en_dec' })).ready) size = 'base_en'; } catch (e) {}
      const raw = await whisperNative(pcm, [[0, pcm.length / 16000]], { size, lang: 'english', task: 'transcribe', quick: true }, m => { if (say) say(/^Transcribing/.test(m) ? 'Transcribing\u2026' : m); });
      clearTimeout(earsNT); earsNT = setTimeout(() => { if (!heavyBusy()) NP.whisperUnload().catch(() => {}); }, 120000);   // give the memory back, unless a subtitle job is using the engine
      return raw.map(r => r.text).join(' ');
    }
    async function hear(pcm, say) {
      if (earsNat()) { try { return await earsNative(pcm, say); } catch (e) { console.warn('native listening failed, using Moonshine', e); eNatFailed = true; } }
      const out = await (await getEars(say))(pcm);
      clearTimeout(earsT); earsT = setTimeout(freeEars, 120000);
      return String(out && out.text || '');
    }
    async function freeEars() { clearTimeout(earsT); const p = earsP; earsP = null; if (p) { try { const a = await p; await a.dispose(); } catch (e) {} } }
    // One shared microphone: the wake word and the recorder both read its 16 kHz frames. It closes as soon as nobody needs it.
    const mic = { ctx: null, stream: null, node: null, src: null, subs: new Set(), users: 0, opening: null };
    function vResampler(inRate) {
      if (inRate === 16000) return b => new Float32Array(b);
      const r = inRate / 16000; let pos = 1, prev = 0;
      return b => {
        const x = new Float32Array(b.length + 1); x[0] = prev; x.set(b, 1); const out = [];
        for (; pos < x.length - 1; pos += r) { const i = Math.floor(pos), f = pos - i; out.push(x[i] * (1 - f) + x[i + 1] * f); }
        pos -= x.length - 1; prev = x[x.length - 1]; return Float32Array.from(out);
      };
    }
    function micOpen() {
      if (mic.ctx) return Promise.resolve();
      if (mic.opening) return mic.opening;
      mic.opening = (async () => {
        const s = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
        const C = window.AudioContext || window.webkitAudioContext; let ctx; try { ctx = new C({ sampleRate: 16000 }); } catch (e) { ctx = new C(); }
        if (ctx.state === 'suspended') { try { await ctx.resume(); } catch (e) {} }
        const src = ctx.createMediaStreamSource(s), node = ctx.createScriptProcessor(4096, 1, 1), mute = ctx.createGain(), rs = vResampler(ctx.sampleRate); mute.gain.value = 0;
        node.onaudioprocess = e => { const f = rs(e.inputBuffer.getChannelData(0)); if (f.length) mic.subs.forEach(fn => { try { fn(f); } catch (er) { console.error(er); } }); };
        src.connect(node); node.connect(mute); mute.connect(ctx.destination);
        Object.assign(mic, { ctx, stream: s, node, src });
      })().finally(() => { mic.opening = null; });
      return mic.opening;
    }
    async function micAcquire() { mic.users++; try { await micOpen(); } catch (e) { mic.users--; throw e; } }
    function micRelease() { if (--mic.users > 0) return; mic.users = 0; try { mic.node && (mic.node.onaudioprocess = null); mic.stream && mic.stream.getTracks().forEach(t => t.stop()); mic.ctx && mic.ctx.close(); } catch (e) {} mic.ctx = mic.stream = mic.node = mic.src = null; mic.subs.clear(); }
    ['pointerdown', 'keydown'].forEach(ev => document.addEventListener(ev, () => { if (mic.ctx && mic.ctx.state === 'suspended') mic.ctx.resume(); }, { passive: true }));
    // Records one spoken sentence: starts at the first loud frame, stops after about a second of quiet. skip = frames to ignore first (the wake phrase tail).
    function recordUtterance(skip) {
      return new Promise(resolve => {
        const all = []; let acc = new Float32Array(0), first = -1, last = -1, done = false, skipped = skip || 0;
        const end = () => {
          if (done) return; done = true; mic.subs.delete(sub);
          if (first < 0) return resolve(null);
          const a = Math.max(0, first - 5), b = Math.min(all.length, last + 9), out = new Float32Array((b - a) * VOICE.fr);
          for (let i = a; i < b; i++) out.set(all[i], (i - a) * VOICE.fr);
          resolve(out);
        };
        const sub = f => {
          if (done) return; acc = vCat(acc, f);
          while (acc.length >= VOICE.fr) {
            const fr = acc.slice(0, VOICE.fr); acc = acc.slice(VOICE.fr);
            if (skipped > 0) { skipped--; continue; }
            let e = 0; for (let i = 0; i < fr.length; i++) e += fr[i] * fr[i];
            const idx = all.push(fr) - 1; if (Math.sqrt(e / fr.length) > VOICE.vad) { if (first < 0) first = idx; last = idx; }
            if (dictStop || (first >= 0 && all.length - 1 - last >= VOICE.quiet) || all.length >= VOICE.max || (first < 0 && all.length >= VOICE.wait)) { end(); return; }
          }
        };
        mic.subs.add(sub);
      });
    }
    const micEl = cbox.querySelector('.ch-mic');
    const micBtn = rec => { if (micEl) micEl.classList.toggle('rec', !!rec); };
    const micShow = () => { if (micEl) micEl.style.display = micOn() && chatOn ? '' : 'none'; };
    async function dictate(viaWake) {
      if (dictating) { dictStop = true; return; }
      if (!micOn() || !chatOn) return;
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) { add('bot', 'This phone will not give me the microphone here.'); return; }
      if (heavyBusy()) { if (!viaWake) add('bot', "I'm busy with a heavy job right now, so I'm not listening. Ask me again when it's done."); return; }
      if (cbox.style.display !== 'flex') { cbox.style.display = 'flex'; delete cfab.dataset.unread; blAnchor(); }
      if (viaWake && lsGet('ppvEarsDl') !== '1') return;                                         // the wake word never starts a download
      if (dlAsk('ppvEarsDl', 'To listen I need to download my ears first: about 50 MB, one time. Wi-Fi is best.', () => dictate())) return;
      dictating = true; dictStop = false; stopSpeak(); vDuck(true); micBtn(true); cm('greet');
      const note = add('bot', 'Listening\u2026'); let text = '', held = false;
      try {
        await micAcquire(); held = true;
        const pcm = await recordUtterance(viaWake ? 6 : 0); micRelease(); held = false;
        if (pcm) {
          note.textContent = 'Transcribing\u2026';
          text = (await hear(pcm, m => { note.textContent = m; })).trim().replace(/^(?:hey[, ]+)?(?:jarvis|computer|bloop|blue ?p)[,.!?]*\s*/i, '');
        }
        if (!/[a-z0-9]{2}/i.test(text) || /^(?:you|thank you|thanks for watching|bye)[.!]*$/i.test(text)) { note.textContent = pcm ? 'I did not catch that.' : 'I did not hear anything.'; text = ''; }
      } catch (e) {
        console.error(e); text = '';
        note.textContent = /NotAllowed|Permission|denied/i.test(String(e && (e.name + ' ' + e.message))) ? 'I need microphone permission to listen.' : 'Listening failed: ' + e.message;
      } finally { if (held) micRelease(); dictating = false; vDuck(false); micBtn(false); cm('idle'); }
      if (text) { note.remove(); voiceTurn = true; send(text); }
    }

