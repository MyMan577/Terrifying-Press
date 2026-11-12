  // ---------- Motion smoothing (frame interpolation) ----------
  // Adds in-between frames to low-fps video (24/30 fps on a 60 Hz+ screen).
  // Runs on its own WebGL2 canvas (#memc-canvas) and, while active, takes over
  // from the audio-delay canvas (videoDelayActive() returns false), doing the
  // Bluetooth latency hold itself from the same frame ring it needs anyway.
  //
  //   Simple   - cross-fades the two neighbouring frames. One cheap pass.
  //   Advanced - block-matching motion estimation (per source frame) and a
  //              motion-compensated warp (per screen refresh).
  //
  // Interpolating needs the NEXT real frame, so the picture is shown at least
  // ~1 frame late. That is folded into the latency: effective delay =
  // max(latency slider, ~1 frame). Subtitles follow via memcExtraSec.
  // All state lives in the block near subtitleLatencyMs (TDZ-safe: this file
  // section only declares functions).

  function memcUpdateUI(){
    memcModeBtns.forEach(b => b.classList.toggle('toggled', b.dataset.memcMode === memcMode));
    const pl = document.getElementById('memc-pill-label');
    if (pl) pl.textContent = memcMode === 'blend' ? 'Simple' : memcMode === 'motion' ? 'Advanced' : memcMode === 'ultra' ? 'Ultra' : 'Off';
  }

  function memcUpdateStatus(){
    if (!memcStatusEl) return;
    let txt = '', tip = '';
    if (memcMode !== 'off'){
      const nst = (window.PPNative && PPNative.videoActive && PPNative.videoActive()) ? (PPNative.memcStatus || {}) : null;
      if (nst){
        if (nst.failed){ txt = 'Unsupported'; tip = nst.why || ''; }
        else if (nst.bypass){ txt = 'Skipped (fps)'; tip = 'This video is faster than the "Smooth up to" limit (or too slow to interpolate).'; }
        else if (nst.inFps > 0){ txt = Math.round(nst.inFps) + ' fps \u2192 up to ' + (nst.outFps || memcOutFps); tip = 'Native engine' + (nst.ring ? ', processing at ' + nst.ring : '') + (nst.qualityDrop ? ' (quality lowered: out of GPU memory)' : ''); }
        else txt = 'Starting\u2026';
      }
      else if (memcFailed){ txt = 'Unsupported'; tip = memcFailWhy; }
      else if (memcBypass){ txt = 'Skipped (fps)'; tip = 'This video is faster than the "Smooth up to" limit (or too slow to interpolate).'; }
      else if (memcActive){ txt = Math.round(memcEffRate()) + ' fps \u2192 up to ' + memcOutFps; }
      else txt = 'Video only';
    }
    if (memcMode === 'off' && memcActive){ txt = 'Delay via GPU'; tip = 'Smoothing is off; the picture delay is rendered on the GPU.'; }
    if (memcMode === 'off' && window.PPNative && PPNative.videoActive && PPNative.videoActive() && subtitleLatencyMs > 0){ txt = 'Delay (native)'; tip = 'The native renderer holds the picture back to match Bluetooth audio.'; }
    memcStatusEl.textContent = txt;
    memcStatusEl.title = tip;
  }

  // True while frames are actually being interpolated (as opposed to only delayed).
  function memcSmoothing(){ return memcMode !== 'off' && !memcBypass && !perfLightActive(); }

  // The GL engine also carries the picture delay (positive latency) when smoothing is
  // off or skipped: it uploads frames straight from the video on the GPU, which is far
  // lighter than the 2D-canvas capture path, so heavy videos stop dropping frames.
  function memcWanted(){
    const glDelay = memcDelayGL && effLatencyMs() > 0 && !(losslessLatency && VIDEO_DELAY_CAN_USE_TRACK);
    return !memcFailed && (memcSmoothing() || glDelay)
      && 'requestVideoFrameCallback' in videoEl
      && videoWrap.style.display !== 'none'
      && currentIndex !== -1 && tracks[currentIndex] && tracks[currentIndex].kind === 'video';
  }

  function memcInitGL(){
    if (memcGL) return true;
    if (memcFailed) return false;
    const fail = (why) => { memcFailed = true; memcFailWhy = why; console.warn('[motion smoothing]', why); return false; };
    let gl = null;
    try {
      gl = memcCanvas.getContext('webgl2', { alpha: false, antialias: false, depth: false, stencil: false, preserveDrawingBuffer: false });
    } catch (e){ gl = null; }
    if (!gl) return fail('WebGL2 is not available on this phone.');

    const VS = '#version 300 es\n'
      + 'out vec2 vUv;\n'
      + 'void main(){ vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));'
      + ' vUv = p; gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0); }\n';
    const HEAD = '#version 300 es\nprecision highp float;\nprecision highp int;\nprecision highp sampler2D;\nin vec2 vUv;\nout vec4 oc;\n';

    const FS_COPY = 'uniform sampler2D uTex;\n'
      + 'void main(){ oc = vec4(texture(uTex, vUv).rgb, 1.0); }\n';

    const FS_LUMA = 'uniform sampler2D uTex; uniform vec2 uOff;\n'
      + 'float lum(vec2 uv){ return dot(texture(uTex, uv).rgb, vec3(0.299, 0.587, 0.114)); }\n'
      + 'void main(){\n'
      + '  float y = 0.25 * (lum(vUv + vec2(uOff.x, uOff.y)) + lum(vUv + vec2(-uOff.x, uOff.y))\n'
      + '                  + lum(vUv + vec2(uOff.x, -uOff.y)) + lum(vUv + vec2(-uOff.x, -uOff.y)));\n'
      + '  oc = vec4(y, y, y, 1.0);\n'
      + '}\n';

    const FS_ME = 'uniform sampler2D uCur; uniform sampler2D uPrev; uniform ivec2 uSize; uniform float uLambda;\n'
      + 'float sad(ivec2 c, ivec2 d){\n'
      + '  float s = 0.0;\n'
      + '  for (int j = -8; j < 8; j += 2){\n'
      + '    for (int i = -8; i < 8; i += 2){\n'
      + '      ivec2 p = c + ivec2(i, j);\n'
      + '      float a = texelFetch(uCur, clamp(p, ivec2(0), uSize - 1), 0).r;\n'
      + '      float b = texelFetch(uPrev, clamp(p + d, ivec2(0), uSize - 1), 0).r;\n'
      + '      s += abs(a - b);\n'
      + '    }\n'
      + '  }\n'
      + '  return s * (1.0 / 64.0);\n'
      + '}\n'
      + 'void main(){\n'
      + '  ivec2 c = ivec2(gl_FragCoord.xy) * 8 + 4;\n'
      + '  ivec2 best = ivec2(0);\n'
      + '  float s0 = sad(c, best);\n'
      + '  float bestCost = s0;\n'
      + '  float bestSad = s0;\n'
      + '  int stp = 32;\n'
      + '  for (int l = 0; l < 6; l++){\n'
      + '    ivec2 ctr = best;\n'
      + '    for (int j = -1; j <= 1; j++){\n'
      + '      for (int i = -1; i <= 1; i++){\n'
      + '        if (i == 0 && j == 0) continue;\n'
      + '        ivec2 d = ctr + ivec2(i, j) * stp;\n'
      + '        float s = sad(c, d);\n'
      + '        float cost = s + uLambda * length(vec2(d));\n'
      + '        if (cost < bestCost){ bestCost = cost; best = d; bestSad = s; }\n'
      + '      }\n'
      + '    }\n'
      + '    stp = stp / 2;\n'
      + '  }\n'
      + '  if (bestSad > s0 * 0.9 - 0.004){ best = ivec2(0); bestSad = s0; }\n'
      + '  float conf = 1.0 - smoothstep(0.05, 0.16, bestSad);\n'
      + '  vec2 dv = clamp(vec2(best), -63.0, 63.0);\n'
      + '  oc = vec4((dv + 64.0) / 128.0, conf, 1.0);\n'
      + '}\n';

    const FS_MED = 'uniform sampler2D uRaw; uniform ivec2 uGrid;\n'
      + 'vec3 fetchMv(ivec2 p){\n'
      + '  vec4 t = texelFetch(uRaw, clamp(p, ivec2(0), uGrid - 1), 0);\n'
      + '  return vec3(t.rg * 128.0 - 64.0, t.b);\n'
      + '}\n'
      + 'void main(){\n'
      + '  ivec2 p = ivec2(gl_FragCoord.xy);\n'
      + '  vec3 v[9];\n'
      + '  for (int j = 0; j < 3; j++){\n'
      + '    for (int i = 0; i < 3; i++){\n'
      + '      v[j * 3 + i] = fetchMv(p + ivec2(i - 1, j - 1));\n'
      + '    }\n'
      + '  }\n'
      + '  float bestS = 1e9;\n'
      + '  int bi = 4;\n'
      + '  for (int a = 0; a < 9; a++){\n'
      + '    float s = 0.0;\n'
      + '    for (int b = 0; b < 9; b++) s += length(v[a].xy - v[b].xy);\n'
      + '    if (a == 4) s -= 0.75;\n'
      + '    if (s < bestS){ bestS = s; bi = a; }\n'
      + '  }\n'
      + '  vec3 m = v[bi];\n'
      + '  oc = vec4((m.xy + 64.0) / 128.0, m.z, 1.0);\n'
      + '}\n';

    // Compares two frames on an 8x8 grid of cells (16x16 samples each). R = mean diff (x32),
    // G = count of clearly-changed samples, B = coarse mean diff (x2, for hard-cut detection).
    const FS_DUP = 'uniform sampler2D uA; uniform sampler2D uB;\n'
      + 'void main(){\n'
      + '  vec2 cell = floor(gl_FragCoord.xy);\n'
      + '  float s = 0.0; float n = 0.0;\n'
      + '  for (int j = 0; j < 16; j++){\n'
      + '    for (int i = 0; i < 16; i++){\n'
      + '      vec2 uv = (cell + (vec2(float(i), float(j)) + 0.5) * (1.0 / 16.0)) * 0.125;\n'
      + '      vec3 d = abs(texture(uA, uv).rgb - texture(uB, uv).rgb);\n'
      + '      float m = max(d.r, max(d.g, d.b));\n'
      + '      s += m; if (m > 0.05) n += 1.0;\n'
      + '    }\n'
      + '  }\n'
      + '  s *= (1.0 / 256.0);\n'
      + '  oc = vec4(clamp(s * 32.0, 0.0, 1.0), min(n, 15.0) / 15.0, clamp(s * 2.0, 0.0, 1.0), 1.0);\n'
      + '}\n';

    // Catmull-Rom bicubic (9 taps) - a sharper resampler used when upscaling.
    const SAMP = 'uniform float uUp;\n'
      + 'vec3 samp(sampler2D t, vec2 uv){\n'
      + '  if (uUp < 0.5) return texture(t, uv).rgb;\n'
      + '  vec2 sz = vec2(textureSize(t, 0));\n'
      + '  vec2 pos = uv * sz;\n'
      + '  vec2 c = floor(pos - 0.5) + 0.5;\n'
      + '  vec2 f = pos - c;\n'
      + '  vec2 w0 = f * (-0.5 + f * (1.0 - 0.5 * f));\n'
      + '  vec2 w1 = 1.0 + f * f * (-2.5 + 1.5 * f);\n'
      + '  vec2 w2 = f * (0.5 + f * (2.0 - 1.5 * f));\n'
      + '  vec2 w3 = f * f * (-0.5 + 0.5 * f);\n'
      + '  vec2 w12 = w1 + w2;\n'
      + '  vec2 p0 = (c - 1.0) / sz, p3 = (c + 2.0) / sz, p12 = (c + w2 / w12) / sz;\n'
      + '  vec3 r = texture(t, vec2(p0.x, p0.y)).rgb * (w0.x * w0.y)\n'
      + '         + texture(t, vec2(p12.x, p0.y)).rgb * (w12.x * w0.y)\n'
      + '         + texture(t, vec2(p3.x, p0.y)).rgb * (w3.x * w0.y)\n'
      + '         + texture(t, vec2(p0.x, p12.y)).rgb * (w0.x * w12.y)\n'
      + '         + texture(t, vec2(p12.x, p12.y)).rgb * (w12.x * w12.y)\n'
      + '         + texture(t, vec2(p3.x, p12.y)).rgb * (w3.x * w12.y)\n'
      + '         + texture(t, vec2(p0.x, p3.y)).rgb * (w0.x * w3.y)\n'
      + '         + texture(t, vec2(p12.x, p3.y)).rgb * (w12.x * w3.y)\n'
      + '         + texture(t, vec2(p3.x, p3.y)).rgb * (w3.x * w3.y);\n'
      + '  return clamp(r, 0.0, 1.0);\n'
      + '}\n';

    // Ultra: refine the 8px vectors to 4px blocks (8x8 window). Candidates: the parent's and its
    // neighbours' vectors, the previous frame's vector at the same spot (temporal prior), then a
    // local +-1 search and a parabolic sub-pixel fit.
    const FS_REF = 'uniform sampler2D uCur; uniform sampler2D uPrev; uniform sampler2D uRaw; uniform sampler2D uPrior; uniform float uHasPrior; uniform ivec2 uSize; uniform ivec2 uGrid;\n'
      + 'float sad4(ivec2 c, ivec2 d){\n'
      + '  float s = 0.0;\n'
      + '  for (int j = -4; j < 4; j++){ for (int i = -4; i < 4; i++){\n'
      + '    ivec2 p = c + ivec2(i, j);\n'
      + '    s += abs(texelFetch(uCur, clamp(p, ivec2(0), uSize - 1), 0).r - texelFetch(uPrev, clamp(p + d, ivec2(0), uSize - 1), 0).r);\n'
      + '  } }\n'
      + '  return s * (1.0 / 64.0);\n'
      + '}\n'
      + 'void main(){\n'
      + '  ivec2 f = ivec2(gl_FragCoord.xy);\n'
      + '  ivec2 c = f * 4 + 2;\n'
      + '  ivec2 par = f / 2;\n'
      + '  float s0 = sad4(c, ivec2(0));\n'
      + '  ivec2 best = ivec2(0); float bestCost = s0 + 0.0015; float bestSad = s0;\n'
      + '  for (int j = -1; j <= 1; j++){ for (int i = -1; i <= 1; i++){\n'
      + '    vec4 t = texelFetch(uRaw, clamp(par + ivec2(i, j), ivec2(0), uGrid - 1), 0);\n'
      + '    ivec2 d = ivec2(round(t.rg * 128.0 - 64.0));\n'
      + '    float s = sad4(c, d);\n'
      + '    float cost = s + 0.0006 * length(vec2(d)) + ((i != 0 || j != 0) ? 0.002 : 0.0);\n'
      + '    if (cost < bestCost){ bestCost = cost; best = d; bestSad = s; }\n'
      + '  } }\n'
      + '  if (uHasPrior > 0.5){\n'
      + '    vec4 t = texelFetch(uPrior, f, 0);\n'
      + '    ivec2 d = ivec2(round(t.rg * 128.0 - 64.0));\n'
      + '    float s = sad4(c, d);\n'
      + '    float cost = s + 0.0006 * length(vec2(d)) + 0.0005;\n'
      + '    if (cost < bestCost){ bestCost = cost; best = d; bestSad = s; }\n'
      + '  }\n'
      + '  for (int l = 0; l < 2; l++){\n'
      + '    ivec2 ctr = best;\n'
      + '    for (int j = -1; j <= 1; j++){ for (int i = -1; i <= 1; i++){\n'
      + '      if (i == 0 && j == 0) continue;\n'
      + '      ivec2 d = ctr + ivec2(i, j);\n'
      + '      float s = sad4(c, d);\n'
      + '      float cost = s + 0.0006 * length(vec2(d));\n'
      + '      if (cost < bestCost){ bestCost = cost; best = d; bestSad = s; }\n'
      + '    } }\n'
      + '  }\n'
      + '  if (bestSad > s0 * 0.9 - 0.004){ best = ivec2(0); bestSad = s0; }\n'
      + '  vec2 sub = vec2(0.0);\n'
      + '  float xm = sad4(c, best + ivec2(-1, 0)); float xp = sad4(c, best + ivec2(1, 0));\n'
      + '  float ym = sad4(c, best + ivec2(0, -1)); float yp = sad4(c, best + ivec2(0, 1));\n'
      + '  float dx = xm - 2.0 * bestSad + xp; float dy = ym - 2.0 * bestSad + yp;\n'
      + '  if (dx > 1e-5) sub.x = clamp(0.5 * (xm - xp) / dx, -0.5, 0.5);\n'
      + '  if (dy > 1e-5) sub.y = clamp(0.5 * (ym - yp) / dy, -0.5, 0.5);\n'
      + '  float conf = 1.0 - smoothstep(0.05, 0.16, bestSad);\n'
      + '  vec2 dv = clamp(vec2(best) + sub, -63.0, 63.0);\n'
      + '  oc = vec4((dv + 64.0) / 128.0, conf, 1.0);\n'
      + '}\n';

    const FS_BLEND = SAMP + 'uniform sampler2D uF0; uniform sampler2D uF1; uniform float uA;\n'
      + 'void main(){ oc = vec4(mix(samp(uF0, vUv), samp(uF1, vUv), uA), 1.0); }\n';

    const FS_MC = SAMP + 'uniform sampler2D uF0; uniform sampler2D uF1; uniform sampler2D uMv;\n'
      + 'uniform float uA; uniform vec2 uInvAna; uniform vec2 uFall;\n'
      + 'void main(){\n'
      + '  vec4 t = texture(uMv, vUv);\n'
      + '  vec2 d = (t.rg * 128.0 - 64.0) * t.b;\n'
      + '  for (int k = 0; k < 2; k++){\n'
      + '    vec4 t2 = texture(uMv, clamp(vUv - d * uInvAna * (1.0 - uA), 0.0, 1.0));\n'
      + '    d = (t2.rg * 128.0 - 64.0) * t2.b;\n'
      + '  }\n'
      + '  vec2 duv = d * uInvAna;\n'
      + '  vec3 c0 = samp(uF0, vUv + duv * uA);\n'
      + '  vec3 c1 = samp(uF1, vUv - duv * (1.0 - uA));\n'
      + '  vec3 s0 = samp(uF0, vUv);\n'
      + '  vec3 s1 = samp(uF1, vUv);\n'
      + '  vec3 still = mix(s0, s1, uA);\n'
      + '  vec3 moved = mix(c0, c1, uA);\n'
      + '  vec3 dm = abs(c0 - c1);\n'
      + '  vec3 ds = abs(s0 - s1);\n'
      + '  float em = max(dm.r, max(dm.g, dm.b));\n'
      + '  float es = max(ds.r, max(ds.g, ds.b));\n'
      + '  bool useMoved = em + 0.03 < es;\n'
      + '  vec3 m = useMoved ? moved : still;\n'
      + '  float err = useMoved ? em : es;\n'
      + '  float bad = smoothstep(uFall.x, uFall.y, err);\n'
      + '  oc = vec4(mix(m, still, bad), 1.0);\n'
      + '}\n';

    // Ultra: uses BOTH the forward field (at the later frame) and the backward field (at the
    // earlier frame). Each candidate is checked for forward/backward consistency (following a
    // vector and then the opposite field should land back where it started); where neither is
    // consistent the pixel is occluded or uncovered and the nearest real frame is shown.
    const FS_MC2 = SAMP + 'uniform sampler2D uF0; uniform sampler2D uF1; uniform sampler2D uMvF; uniform sampler2D uMvB;\n'
      + 'uniform float uA; uniform vec2 uInvAna; uniform vec2 uFall;\n'
      + 'vec2 dec(vec4 t){ return (t.rg * 128.0 - 64.0) * t.b; }\n'
      + 'float mx(vec3 v){ return max(v.r, max(v.g, v.b)); }\n'
      + 'void main(){\n'
      + '  vec2 inv = uInvAna;\n'
      + '  vec2 d = dec(texture(uMvF, vUv));\n'
      + '  vec2 e = dec(texture(uMvB, vUv));\n'
      + '  for (int k = 0; k < 2; k++){\n'
      + '    d = dec(texture(uMvF, clamp(vUv - d * inv * (1.0 - uA), 0.0, 1.0)));\n'
      + '    e = dec(texture(uMvB, clamp(vUv - e * inv * uA, 0.0, 1.0)));\n'
      + '  }\n'
      + '  vec2 p1f = clamp(vUv - d * inv * (1.0 - uA), 0.0, 1.0);\n'
      + '  vec2 q0b = clamp(vUv - e * inv * uA, 0.0, 1.0);\n'
      + '  float rF = length(d + dec(texture(uMvB, clamp(p1f + d * inv, 0.0, 1.0))));\n'
      + '  float rB = length(e + dec(texture(uMvF, clamp(q0b + e * inv, 0.0, 1.0))));\n'
      + '  vec3 fa0 = samp(uF0, vUv + d * inv * uA);\n'
      + '  vec3 fa1 = samp(uF1, vUv - d * inv * (1.0 - uA));\n'
      + '  vec3 ba0 = samp(uF0, vUv - e * inv * uA);\n'
      + '  vec3 ba1 = samp(uF1, vUv + e * inv * (1.0 - uA));\n'
      + '  vec3 s0 = samp(uF0, vUv); vec3 s1 = samp(uF1, vUv);\n'
      + '  float ef = mx(abs(fa0 - fa1)); float eb = mx(abs(ba0 - ba1)); float es = mx(abs(s0 - s1));\n'
      + '  bool useF = (ef + 0.02 * min(rF, 4.0)) <= (eb + 0.02 * min(rB, 4.0));\n'
      + '  vec3 c0 = useF ? fa0 : ba0; vec3 c1 = useF ? fa1 : ba1;\n'
      + '  float em = useF ? ef : eb;\n'
      + '  float rr = useF ? rF : rB;\n'
      + '  vec3 still = mix(s0, s1, uA);\n'
      + '  bool useMoved = em + 0.03 < es;\n'
      + '  vec3 m = useMoved ? mix(c0, c1, uA) : still;\n'
      + '  float err = useMoved ? em : es;\n'
      + '  float bad = max(smoothstep(uFall.x, uFall.y, err), useMoved ? smoothstep(1.5, 4.0, rr) : 0.0);\n'
      + '  vec3 nearest = mix(s0, s1, smoothstep(0.35, 0.65, uA));\n'
      + '  oc = vec4(mix(m, nearest, bad), 1.0);\n'
      + '}\n';

    const compile = (type, src) => {
      const s = gl.createShader(type);
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)){
        const log = gl.getShaderInfoLog(s);
        gl.deleteShader(s);
        throw new Error(log || 'shader compile failed');
      }
      return s;
    };
    const mk = (fs, names) => {
      const p = gl.createProgram();
      gl.attachShader(p, compile(gl.VERTEX_SHADER, VS));
      gl.attachShader(p, compile(gl.FRAGMENT_SHADER, HEAD + fs));
      gl.linkProgram(p);
      if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p) || 'link failed');
      const u = {};
      names.forEach(n => { u[n] = gl.getUniformLocation(p, n); });
      return { p, u };
    };

    try {
      memcProgs = {
        copy:  mk(FS_COPY,  ['uTex']),
        luma:  mk(FS_LUMA,  ['uTex', 'uOff']),
        dup:   mk(FS_DUP,   ['uA', 'uB']),
        me:    mk(FS_ME,    ['uCur', 'uPrev', 'uSize', 'uLambda']),
        med:   mk(FS_MED,   ['uRaw', 'uGrid']),
        blend: mk(FS_BLEND, ['uF0', 'uF1', 'uA', 'uUp']),
        mc:    mk(FS_MC,    ['uF0', 'uF1', 'uMv', 'uA', 'uInvAna', 'uFall', 'uUp']),
        ref:   mk(FS_REF,   ['uCur', 'uPrev', 'uRaw', 'uPrior', 'uHasPrior', 'uSize', 'uGrid']),
        mc2:   mk(FS_MC2,   ['uF0', 'uF1', 'uMvF', 'uMvB', 'uA', 'uInvAna', 'uFall', 'uUp'])
      };
    } catch (e){
      return fail('Shader error: ' + (e && e.message ? e.message : e));
    }

    memcSrcTex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, memcSrcTex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.BLEND);

    memcCanvas.addEventListener('webglcontextlost', (e) => {
      e.preventDefault();
      memcGL = null; memcRing = []; memcResKey = '';
      memcFailed = true; memcFailWhy = 'The graphics context was lost.';
      memcStop();
      document.body.classList.remove('memc-active');
      memcActive = false;
      refreshVideoDelayState();
      memcUpdateStatus();
    }, false);

    memcFloatOk = !!(gl.getExtension('EXT_color_buffer_float') || gl.getExtension('EXT_color_buffer_half_float'));
    memcGL = gl;
    memcDupTex = memcMakeTex(8, 8, gl.NEAREST);
    memcDupFbo = memcMakeFbo(memcDupTex);
    memcDupBuf = new Uint8Array(8 * 8 * 4);
    return true;
  }

  function memcMakeTex(w, h, filter, fmt){
    const gl = memcGL;
    const t = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texStorage2D(gl.TEXTURE_2D, 1, fmt || gl.RGBA8, w, h);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return t;
  }
  function memcMakeFbo(tex){
    const gl = memcGL;
    const f = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, f);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    return f;
  }

  function memcMakeSlot(motion){
    const gl = memcGL;
    const tex = memcMakeTex(memcRingW, memcRingH, gl.LINEAR);
    const slot = { tex, fbo: memcMakeFbo(tex), mvTex: null, mvFbo: null,
                   t: 0, valid: false, disc: false, dup: false, hasMv: false, seq: 0, prevSeq: 0 };
    if (motion && memcAna){
      const fine = !!memcAna.fw;
      const mw = fine ? memcAna.fw : memcAna.gw, mh = fine ? memcAna.fh : memcAna.gh;
      slot.mvTex = memcMakeTex(mw, mh, gl.LINEAR, fine ? memcVecFmt() : undefined);
      slot.mvFbo = memcMakeFbo(slot.mvTex);
      if (fine){
        slot.mvTexB = memcMakeTex(mw, mh, gl.LINEAR, fine ? memcVecFmt() : undefined);
        slot.mvFboB = memcMakeFbo(slot.mvTexB);
      }
    }
    return slot;
  }

  function memcFreeResources(){
    const gl = memcGL;
    if (gl){
      memcRing.forEach(s => {
        if (s.fbo) gl.deleteFramebuffer(s.fbo);
        if (s.tex) gl.deleteTexture(s.tex);
        if (s.mvFbo) gl.deleteFramebuffer(s.mvFbo);
        if (s.mvTex) gl.deleteTexture(s.mvTex);
        if (s.mvFboB) gl.deleteFramebuffer(s.mvFboB);
        if (s.mvTexB) gl.deleteTexture(s.mvTexB);
      });
      memcLuma.forEach(l => { gl.deleteFramebuffer(l.fbo); gl.deleteTexture(l.tex); });
      if (memcMvRaw){ gl.deleteFramebuffer(memcMvRaw.fbo); gl.deleteTexture(memcMvRaw.tex); }
      if (memcMvRef){ gl.deleteFramebuffer(memcMvRef.fbo); gl.deleteTexture(memcMvRef.tex); }
    }
    memcRing = []; memcLuma = []; memcMvRaw = null; memcMvRef = null; memcAna = null;
    memcResKey = ''; memcWrite = 0; memcPrevSeq = 0; memcPrevLumaValid = false; memcLumaIdx = 0;
    memcPrevSlot = null; memcUniqSlot = null;
    memcLastKey = '';
  }

  function memcInvalidate(){
    for (let i = 0; i < memcRing.length; i++){ memcRing[i].valid = false; memcRing[i].hasMv = false; }
    memcPrevSeq = 0; memcPrevLumaValid = false; memcLastKey = '';
    memcPrevSlot = null; memcUniqSlot = null;
  }

  // Forget timing history (seek, pause, rate change, mode change).
  function memcResetStream(){
    memcInvalidate();
    memcLastT = null;
    memcOffValid = false;
    memcLastTT = -Infinity;
    memcLastUniqT = null;
  }
  // Forget everything learned about the current file.
  function memcResetSource(){
    memcResetStream();
    memcPeriod = 1 / 30; memcPeriodN = 0; memcDts = [];
    memcUDts = []; memcDupMs = 0; memcDupN = 0; memcDupOff = false;
    memcBypass = false;
  }

  function memcEnsureResources(vw, vh){
    const gl = memcGL;
    const smoothing = memcSmoothing();
    const motion = memcIsMotion() && !memcBypass;
    const fps = Math.min(120, 1 / Math.max(memcPeriod, 0.004));
    const needFrames = Math.ceil((Math.min(Math.max(effLatencyMs(), 0), 2000) / 1000 + (smoothing ? 0.4 : 0.3)) * fps) + 4;
    const wantN = Math.max(12, Math.ceil(needFrames / 8) * 8);
    const tier = MEMC_TIERS[memcQuality];
    const key = (motion ? (memcMode === 'ultra' ? 'u' : 'm') : 'b') + memcQuality + ':' + vw + 'x' + vh;
    if (key === memcResKey && wantN <= memcRing.length) return;
    // Slider pushed the delay past the ring: grow in place instead of wiping.
    // Old frames stay, new empty slots go in at the write head, so the picture
    // keeps playing and the extra history simply fills in as frames arrive.
    if (key === memcResKey && memcRing.length && memcRingW){
      const budget = (smoothing ? tier.mb : Math.max(tier.mb, 160)) * 1048576;
      if (wantN * memcRingW * memcRingH * 4 * 1.05 <= budget * 1.5){
        const fresh = [];
        for (let i = memcRing.length; i < wantN; i++) fresh.push(memcMakeSlot(motion));
        memcRing.splice(memcWrite, 0, ...fresh);
        if (gl.getError() === gl.OUT_OF_MEMORY){
          memcFreeResources();
          if (memcQuality > 0){
            memcQuality--;
            try { localStorage.setItem(MEMC_Q_KEY, String(memcQuality)); } catch (e){}
            memcUpdateQualityUI();
          }
        }
        return;
      }
    }

    memcFreeResources();
    const N = wantN;
    const maxW = motion ? tier.motionW : tier.simpleW;
    let scale = Math.min(1, maxW / vw);
    scale = Math.min(scale, Math.sqrt(((smoothing ? tier.mb : Math.max(tier.mb, 160)) * 1048576) / (N * 4 * vw * vh)));
    const rw = Math.max(64, Math.round(vw * scale / 2) * 2);
    const rh = Math.max(36, Math.round(vh * scale / 2) * 2);
    memcRingW = rw; memcRingH = rh;
    // Mipmaps are regenerated for every frame, which is costly at full video size. Delay-only
    // mode skips them unless the downscale is large (over 2x).
    memcSrcMip = rw < vw * (smoothing ? 0.7 : 0.5);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, memcSrcTex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, memcSrcMip ? gl.LINEAR_MIPMAP_LINEAR : gl.LINEAR);

    if (motion){
      const wa = Math.max(64, Math.round(Math.min(rw, tier.ana) / 8) * 8);
      const ha = Math.max(24, Math.round(wa * rh / rw / 8) * 8);
      memcAna = { w: wa, h: ha, gw: wa / 8, gh: ha / 8 };
      for (let i = 0; i < 2; i++){
        const tex = memcMakeTex(wa, ha, gl.NEAREST);
        memcLuma.push({ tex, fbo: memcMakeFbo(tex) });
      }
      const rawTex = memcMakeTex(memcAna.gw, memcAna.gh, gl.NEAREST);
      memcMvRaw = { tex: rawTex, fbo: memcMakeFbo(rawTex) };
      if (memcMode === 'ultra'){
        memcAna.fw = memcAna.gw * 2; memcAna.fh = memcAna.gh * 2;
        const refTex = memcMakeTex(memcAna.fw, memcAna.fh, gl.NEAREST, memcVecFmt());
        memcMvRef = { tex: refTex, fbo: memcMakeFbo(refTex) };
      }
    }
    for (let i = 0; i < N; i++) memcRing.push(memcMakeSlot(motion));
    // Out of GPU memory: drop one tier and rebuild on the next frame.
    if (gl.getError() === gl.OUT_OF_MEMORY && memcQuality > 0){
      memcFreeResources();
      memcQuality--;
      try { localStorage.setItem(MEMC_Q_KEY, String(memcQuality)); } catch (e){}
      memcUpdateQualityUI();
      return;
    }
    memcResKey = key;
    memcOutW = 0; memcOutH = 0;
    memcApplyOutSize();
  }

  // Canvas backing size: the processing size, or larger (up to the chosen cap and the
  // screen's real pixel size) when upscaling is on.
  function memcApplyOutSize(){
    if (!memcRingW) return;
    const dpr = window.devicePixelRatio || 1;
    const bw = memcCanvas.clientWidth * dpr, bh = memcCanvas.clientHeight * dpr;
    const capH = MEMC_UP_CAPS[memcUpscale];
    let scale = 1;
    if (capH && bw > 0 && bh > 0){
      const fit = Math.min(bw / memcRingW, bh / memcRingH);
      scale = Math.max(1, Math.min(fit, capH / memcRingH));
    }
    const w = Math.round(memcRingW * scale / 2) * 2, h = Math.round(memcRingH * scale / 2) * 2;
    if (w === memcOutW && h === memcOutH) return;
    memcOutW = w; memcOutH = h;
    memcCanvas.width = w; memcCanvas.height = h;
    memcLastKey = '';
  }

  function memcBind(unit, tex){
    memcGL.activeTexture(memcGL.TEXTURE0 + unit);
    memcGL.bindTexture(memcGL.TEXTURE_2D, tex);
  }

  function memcCapture(meta){
    const gl = memcGL;
    const vw = videoEl.videoWidth, vh = videoEl.videoHeight;
    if (!gl || !vw || !vh || videoEl.readyState < 2) return false;
    const t = meta.mediaTime;

    let disc = false;
    if (memcLastT != null){
      const dt = t - memcLastT;
      if (dt === 0) return false;
      if (dt < 0){
        memcInvalidate();
        disc = true;
      } else {
        if (dt > 0.004 && dt < 0.25){
          memcDts.push(dt);
          if (memcDts.length > 32) memcDts.shift();
          memcPeriodN = memcDts.length;
          const srt = memcDts.slice().sort((x, y) => x - y);
          memcPeriod = srt[srt.length >> 1];
        }
        if (dt > memcPeriod * 2.6) disc = true;
      }
    }
    memcLastT = meta.synthetic ? null : t;

    const rate = videoEl.playbackRate || 1;
    const off = (meta.expectedDisplayTime || performance.now()) - (t * 1000) / rate;
    if (!memcOffValid || disc || Math.abs(off - memcOffMs) > 40){ memcOffMs = off; memcOffValid = true; }
    else memcOffMs += (off - memcOffMs) * (Math.abs(off - memcOffMs) > 12 ? 0.02 : 0.05);

    memcEnsureResources(vw, vh);
    if (!memcRing.length) return false;   // stepped down after running out of memory; retry next frame

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, memcSrcTex);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, videoEl);
    if (memcSrcMip) gl.generateMipmap(gl.TEXTURE_2D);

    const slot = memcRing[memcWrite];
    memcWrite = (memcWrite + 1) % memcRing.length;

    gl.bindFramebuffer(gl.FRAMEBUFFER, slot.fbo);
    gl.viewport(0, 0, memcRingW, memcRingH);
    gl.useProgram(memcProgs.copy.p);
    memcBind(0, memcSrcTex);
    gl.uniform1i(memcProgs.copy.u.uTex, 0);
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    let dup = false;
    if (memcSmoothing() && !memcDupOff && memcPrevSlot && memcPrevSlot.valid && !disc){
      const r = memcDupCheck(memcPrevSlot, slot);
      dup = r.dup;
      if (r.cut) disc = true;   // hard cut: never blend across it, and skip motion search
    }
    memcPrevSlot = slot;
    slot.t = t; slot.valid = true; slot.disc = disc; slot.dup = dup; slot.hasMv = false;
    slot.seq = ++memcSeq; slot.prevSeq = memcPrevSeq;
    const puSlot = memcUniqSlot;
    if (!dup) memcUniqSlot = slot;
    if (!dup){
      memcPrevSeq = slot.seq;
      if (!disc && memcLastUniqT != null){
        const ug = t - memcLastUniqT;
        if (ug > 0.004 && ug < 0.5){ memcUDts.push(ug); if (memcUDts.length > 24) memcUDts.shift(); }
      }
      memcLastUniqT = t;
    }

    if (memcIsMotion() && memcAna && !memcBypass && !dup){
      const cur = memcLumaIdx, prev = 1 - cur;
      const A = memcAna;
      gl.bindFramebuffer(gl.FRAMEBUFFER, memcLuma[cur].fbo);
      gl.viewport(0, 0, A.w, A.h);
      gl.useProgram(memcProgs.luma.p);
      memcBind(0, slot.tex);
      gl.uniform1i(memcProgs.luma.u.uTex, 0);
      gl.uniform2f(memcProgs.luma.u.uOff, 0.25 / A.w, 0.25 / A.h);
      gl.drawArrays(gl.TRIANGLES, 0, 3);

      if (memcPrevLumaValid && !disc && memcMode !== 'ultra'){
        gl.bindFramebuffer(gl.FRAMEBUFFER, memcMvRaw.fbo);
        gl.viewport(0, 0, A.gw, A.gh);
        gl.useProgram(memcProgs.me.p);
        memcBind(0, memcLuma[cur].tex);
        memcBind(1, memcLuma[prev].tex);
        gl.uniform1i(memcProgs.me.u.uCur, 0);
        gl.uniform1i(memcProgs.me.u.uPrev, 1);
        gl.uniform2i(memcProgs.me.u.uSize, A.w, A.h);
        gl.uniform1f(memcProgs.me.u.uLambda, 0.0006);
        gl.drawArrays(gl.TRIANGLES, 0, 3);

        gl.bindFramebuffer(gl.FRAMEBUFFER, slot.mvFbo);
        gl.viewport(0, 0, A.gw, A.gh);
        gl.useProgram(memcProgs.med.p);
        memcBind(0, memcMvRaw.tex);
        gl.uniform1i(memcProgs.med.u.uRaw, 0);
        gl.uniform2i(memcProgs.med.u.uGrid, A.gw, A.gh);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
        slot.hasMv = true;
      } else if (memcPrevLumaValid && !disc && memcMvRef){
        memcUltraMv(slot, cur, prev, puSlot);
      }
      memcPrevLumaValid = true;
      memcLumaIdx = prev;
    }
    return true;
  }

  // Returns { dup, cut } comparing frame b against the previous capture a.
  // One tiny synchronous readback per source frame; switches itself off if that is slow.
  function memcDupCheck(a, b){
    const gl = memcGL, P = memcProgs.dup;
    gl.bindFramebuffer(gl.FRAMEBUFFER, memcDupFbo);
    gl.viewport(0, 0, 8, 8);
    gl.useProgram(P.p);
    memcBind(0, a.tex); memcBind(1, b.tex);
    gl.uniform1i(P.u.uA, 0); gl.uniform1i(P.u.uB, 1);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    const t0 = performance.now();
    gl.readPixels(0, 0, 8, 8, gl.RGBA, gl.UNSIGNED_BYTE, memcDupBuf);
    memcDupMs += ((performance.now() - t0) - memcDupMs) * 0.1;
    if (++memcDupN >= 24 && memcDupMs > 10) memcDupOff = true;
    let maxMean = 0, cnt = 0, coarse = 0;
    for (let i = 0; i < 64; i++){
      const m = memcDupBuf[i * 4] / 255 / 32;
      if (m > maxMean) maxMean = m;
      cnt += Math.round(memcDupBuf[i * 4 + 1] / 255 * 15);
      coarse += memcDupBuf[i * 4 + 2] / 255 / 2;
    }
    coarse /= 64;
    return { dup: maxMean < 0.006 && cnt <= 2, cut: coarse > 0.25 };
  }

  function memcVecFmt(){ return memcFloatOk ? memcGL.RGBA16F : memcGL.RGBA8; }
  function memcIsMotion(){ return memcMode === 'motion' || memcMode === 'ultra'; }

  // Ultra motion field: coarse 8px search -> 4px refinement (+temporal prior, sub-pixel) -> median,
  // run both ways. slot.mvTex: at this frame's positions, pointing into the previous unique frame.
  // slot.mvTexB: at the previous frame's positions, pointing into this one.
  // pu: previous unique slot; its fields seed the search (motion is usually continuous).
  function memcUltraMv(slot, cur, prev, pu){
    const gl = memcGL, A = memcAna, M = memcProgs;
    const havePrior = !!(pu && pu.hasMv && pu.mvTex && pu.mvTexB && pu.seq === slot.prevSeq);
    const run = (la, lb, outFbo, priorTex) => {
      gl.bindFramebuffer(gl.FRAMEBUFFER, memcMvRaw.fbo);
      gl.viewport(0, 0, A.gw, A.gh);
      gl.useProgram(M.me.p);
      memcBind(0, la.tex); memcBind(1, lb.tex);
      gl.uniform1i(M.me.u.uCur, 0); gl.uniform1i(M.me.u.uPrev, 1);
      gl.uniform2i(M.me.u.uSize, A.w, A.h);
      gl.uniform1f(M.me.u.uLambda, 0.0006);
      gl.drawArrays(gl.TRIANGLES, 0, 3);

      gl.bindFramebuffer(gl.FRAMEBUFFER, memcMvRef.fbo);
      gl.viewport(0, 0, A.fw, A.fh);
      gl.useProgram(M.ref.p);
      memcBind(0, la.tex); memcBind(1, lb.tex); memcBind(2, memcMvRaw.tex);
      memcBind(3, priorTex || memcMvRaw.tex);
      gl.uniform1i(M.ref.u.uCur, 0); gl.uniform1i(M.ref.u.uPrev, 1); gl.uniform1i(M.ref.u.uRaw, 2);
      gl.uniform1i(M.ref.u.uPrior, 3); gl.uniform1f(M.ref.u.uHasPrior, priorTex ? 1 : 0);
      gl.uniform2i(M.ref.u.uSize, A.w, A.h);
      gl.uniform2i(M.ref.u.uGrid, A.gw, A.gh);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      memcBind(2, null); memcBind(3, null);

      gl.bindFramebuffer(gl.FRAMEBUFFER, outFbo);
      gl.viewport(0, 0, A.fw, A.fh);
      gl.useProgram(M.med.p);
      memcBind(0, memcMvRef.tex);
      gl.uniform1i(M.med.u.uRaw, 0);
      gl.uniform2i(M.med.u.uGrid, A.fw, A.fh);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    };
    run(memcLuma[cur], memcLuma[prev], slot.mvFbo, havePrior ? pu.mvTex : null);
    run(memcLuma[prev], memcLuma[cur], slot.mvFboB, havePrior ? pu.mvTexB : null);
    slot.hasMv = true;
  }

  // Typical gap between UNIQUE source frames (longer than the frame period when the content
  // holds each picture for 2-3 frames, e.g. animation on twos). Drives the lookahead.
  function memcUniqGap(){
    let g = memcPeriod;
    if (memcUDts.length >= 6){
      const srt = memcUDts.slice().sort((x, y) => x - y);
      g = Math.max(g, srt[Math.min(srt.length - 1, Math.floor(srt.length * 0.8))]);
    }
    return Math.min(g, memcPeriod * 4);
  }

  const memcDrawStamps = [];
  let memcCountDraws = false;
  function memcDraw(f0, f1, a){
    const gl = memcGL;
    if (memcCountDraws) memcDrawStamps.push(performance.now());
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, memcCanvas.width, memcCanvas.height);
    if (f1 && a > 0 && memcIsMotion() && memcAna && f1.hasMv && f1.prevSeq === f0.seq && (memcMode !== 'ultra' || f1.mvTexB)){
      const ultra = memcMode === 'ultra';
      const P = ultra ? memcProgs.mc2 : memcProgs.mc;
      gl.useProgram(P.p);
      memcBind(0, f0.tex); memcBind(1, f1.tex); memcBind(2, f1.mvTex);
      gl.uniform1i(P.u.uF0, 0); gl.uniform1i(P.u.uF1, 1);
      if (ultra){ memcBind(3, f1.mvTexB); gl.uniform1i(P.u.uMvF, 2); gl.uniform1i(P.u.uMvB, 3); }
      else gl.uniform1i(P.u.uMv, 2);
      gl.uniform1f(P.u.uA, a);
      gl.uniform2f(P.u.uInvAna, 1 / memcAna.w, 1 / memcAna.h);
      gl.uniform1f(P.u.uUp, memcOutW > memcRingW ? 1 : 0);
      gl.uniform2f(P.u.uFall, 0.06 + 0.24 * memcStrength, 0.15 + 0.6 * memcStrength);
    } else {
      const P = memcProgs.blend;
      const second = (f1 && a > 0) ? f1 : f0;
      gl.useProgram(P.p);
      memcBind(0, f0.tex); memcBind(1, second.tex);
      gl.uniform1i(P.u.uF0, 0); gl.uniform1i(P.u.uF1, 1);
      gl.uniform1f(P.u.uA, (f1 && a > 0) ? a : 0);
      gl.uniform1f(P.u.uUp, memcOutW > memcRingW ? 1 : 0);
    }
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  // hold=true: paused/seeking - show the exact frame for (time - latency), no interpolation.
  function memcPresent(mediaNow, hold){
    if (!memcGL || memcRing.length === 0) return;
    const Ltarget = Math.max(effLatencyMs(), 0) / 1000;
    // Ease toward a new latency (picture runs ~0.65x-1.35x speed while it
    // settles) instead of jumping, so dragging the slider doesn't stutter.
    const nowMs = performance.now();
    let L = Ltarget;
    if (hold || memcLEff == null){ memcLEff = Ltarget; }
    else {
      const dt = Math.min(0.1, Math.max(0, (nowMs - memcLEffAt) / 1000));
      const diff = Ltarget - memcLEff;
      if (Math.abs(diff) > 0.8) memcLEff = Ltarget;
      else { const st = 0.35 * dt; memcLEff += Math.abs(diff) <= st ? diff : Math.sign(diff) * st; }
      L = memcLEff;
    }
    memcLEffAt = nowMs;
    const uGap = memcUniqGap();
    const minE = uGap * 1.15 + 0.004;
    const smoothing = memcSmoothing();
    memcExtraSec = (hold || !smoothing) ? 0 : Math.max(0, minE - L);
    let tt = mediaNow - ((hold || !smoothing) ? L : Math.max(L, minE));
    // Media-time step between presented frames. Scaled by playback speed so "Output up to"
    // is measured per real second: at 0.5x a 60 fps video yields 30 unique frames/s, so it
    // can be filled out to the full output rate instead of just 60.
    const outStep = memcRate() / memcOutFps;
    const smoothOn = !hold && smoothing && outStep < memcPeriod * 0.95;
    // Never step backwards by a hair (clock-estimate jitter would flip the
    // picture back a frame); real seeks/big changes still go through.
    if (hold) memcLastTT = -Infinity;
    else {
      if (tt < memcLastTT && memcLastTT - tt < 0.12) tt = memcLastTT;
      memcLastTT = tt;
    }
    if (smoothOn && nowMs - memcLastDrawMs < 800 / memcOutFps) return;

    // While interpolating, repeated (held) frames are not anchors: blend between the
    // neighbouring UNIQUE frames so held pictures glide instead of sitting still then snapping.
    let f0 = null, f1 = null, f0a = null, oldest = null, any = false;
    for (let i = 0; i < memcRing.length; i++){
      const s = memcRing[i];
      if (!s.valid) continue;
      any = true;
      if (!oldest || s.t < oldest.t) oldest = s;
      const skip = smoothOn && s.dup;
      if (s.t <= tt){
        if (!f0a || s.t > f0a.t) f0a = s;
        if (!skip && (!f0 || s.t > f0.t)) f0 = s;
      } else if (!skip && (!f1 || s.t < f1.t)) f1 = s;
    }
    if (!any) return;
    if (!f0) f0 = f0a;
    if (!f0){ f0 = oldest; f1 = null; }
    let a = 0;
    if (smoothOn && f1 && !f1.disc){
      const gap = f1.t - f0.t;
      if (gap > 0 && gap <= Math.max(memcPeriod * 2.6, uGap * 1.25)) a = Math.min(1, Math.max(0, (tt - f0.t) / gap));
    } else {
      f1 = null;
    }
    const key = f0.seq + ':' + (f1 ? f1.seq : 0) + ':' + Math.round(a * 64) + ':' + memcMode;
    if (key === memcLastKey) return;
    memcLastKey = key;
    memcLastDrawMs = nowMs;
    memcDraw(f0, f1, a);
  }

  function memcFailHard(e){
    console.warn('[motion smoothing]', e);
    memcFailed = true;
    memcFailWhy = (e && e.message) ? e.message : String(e);
    refreshVideoDelayState();
  }

  // Unique source frames per REAL second: source fps x playback speed (0.5x on 60 fps = 30).
  function memcEffRate(){ return memcRate() / Math.max(memcPeriod, 0.004); }

  function memcOnFrame(now, meta){
    memcVfcId = null;
    if (!memcActive) return;
    memcVfcId = videoEl.requestVideoFrameCallback(memcOnFrame);
    try {
      const ok = memcCapture(meta);
      if (ok && memcMode !== 'off' && memcPeriodN >= 30 && !memcBypass && (memcRate() / memcUniqGap() > memcMaxIn + 1.5 || memcPeriod / memcRate() > 0.125)){
        memcBypass = true;
        refreshVideoDelayState();
        return;
      }
      if (ok && (memcPeriodN === 8 || memcPeriodN === 30)) memcUpdateStatus();
      if (ok && videoEl.paused) memcPresent(videoEl.currentTime, true);
    } catch (e){ memcFailHard(e); }
  }

  function memcTick(ts){
    memcRafId = null;
    if (!memcActive) return;
    try {
      if (!videoEl.paused && !videoEl.ended){
        memcRafId = requestAnimationFrame(memcTick);
        if (memcOffValid) memcPresent((ts - memcOffMs) * (videoEl.playbackRate || 1) / 1000, false);
      } else {
        memcPresent(videoEl.currentTime, true);
      }
    } catch (e){ memcFailHard(e); }
  }

  function memcKickRaf(){
    if (memcRafId == null && memcActive && !videoEl.paused) memcRafId = requestAnimationFrame(memcTick);
  }

  function memcCaptureNow(){
    if (videoEl.readyState < 2) return;
    try {
      if (memcCapture({ mediaTime: videoEl.currentTime, expectedDisplayTime: performance.now(), synthetic: true })){
        memcPresent(videoEl.currentTime, true);
      }
    } catch (e){ memcFailHard(e); }
  }

  function memcStart(){
    if (memcVfcId == null) memcVfcId = videoEl.requestVideoFrameCallback(memcOnFrame);
    if (!memcRunning){
      memcRunning = true;
      memcResetStream();
      memcCaptureNow();
    }
    memcKickRaf();
  }

  function memcStop(){
    if (memcVfcId != null && 'cancelVideoFrameCallback' in videoEl) videoEl.cancelVideoFrameCallback(memcVfcId);
    memcVfcId = null;
    if (memcRafId != null) cancelAnimationFrame(memcRafId);
    memcRafId = null;
    if (memcRunning){
      memcRunning = false;
      memcFreeResources();
      memcExtraSec = 0;
      memcLEff = null; memcLastTT = -Infinity;
    }
  }

  // Native video (beta): the same settings drive the native renderer's port of this engine (NativeVideoView.kt).
  // The picture delay there is just the Bluetooth latency: the native player keeps sound and picture in sync itself,
  // so the web decoder's +300 ms compensation doesn't apply.
  function nativeMemcPush(){
    if (!(window.PPNative && PPNative.videoActive && PPNative.videoActive() && PPNative.setMemc)) return;
    let strength = 0.5; try { strength = memcStrength; } catch (e){}   // declared further down the file
    PPNative.setMemc({
      mode: (memcMode !== 'off' && !perfLightActive()) ? memcMode : 'off',
      delayMs: Math.max(0, subtitleLatencyMs || 0),
      maxIn: memcMaxIn, outFps: memcOutFps, strength, quality: memcQuality, upscale: memcUpscale
    });
  }
  setInterval(nativeMemcPush, 700);   // sliders change these without calling memcSync; the bridge only sends changes
  if (window.PPNative) PPNative.hooks.memcStatus = (st) => {
    memcExtraSec = Math.max(0, (st && st.extraMs) || 0) / 1000;    // subtitles follow the extra picture lag, as on the web
    memcUpdateStatus();
  };

  // Idempotent, no recursion: refreshVideoDelayState() calls this first.
  function memcSync(){
    nativeMemcPush();
    const want = !(window.PPNative && PPNative.videoActive()) && memcWanted() && memcInitGL();
    memcActive = want;
    document.body.classList.toggle('memc-active', want);
    if (want) memcStart(); else memcStop();
    memcUpdateStatus();
  }

  // Native video (beta) draws outside the page, so the web MEMC has no frames to work with: stop it when native video starts.
  window.addEventListener('pp-native-video', () => refreshVideoDelayState());

  function setMemcMode(m){
    if (m !== 'off' && m !== 'blend' && m !== 'motion' && m !== 'ultra') m = 'off';
    memcMode = m;
    try { localStorage.setItem(MEMC_KEY, m); } catch (e){}
    memcBypass = false;
    memcResetStream();
    memcUpdateUI();
    refreshVideoDelayState();
  }
  memcModeBtns.forEach(b => b.addEventListener('click', () => setMemcMode(b.dataset.memcMode)));

  function memcUpdateSliders(){
    memcThreshEl.value = memcMaxIn; memcOutEl.value = memcOutFps;
    memcThreshValEl.textContent = memcMaxIn + ' fps';
    memcOutValEl.textContent = memcOutFps + ' fps';
  }
  memcThreshEl.addEventListener('input', () => {
    memcMaxIn = parseInt(memcThreshEl.value, 10) || 50;
    memcUpdateSliders();
    try { localStorage.setItem(MEMC_IN_KEY, String(memcMaxIn)); } catch (e){}
    memcResetSource();
    refreshVideoDelayState();
  });
  memcOutEl.addEventListener('input', () => {
    memcOutFps = parseInt(memcOutEl.value, 10) || 120;
    memcUpdateSliders();
    memcLastKey = '';
    try { localStorage.setItem(MEMC_OUT_KEY, String(memcOutFps)); } catch (e){}
    memcUpdateStatus();
  });
  memcUpdateSliders();
  const memcSpeedEl = document.getElementById('memc-speed-toggle');
  if (memcSpeedEl){
    memcSpeedEl.checked = memcSpeedAware;
    memcSpeedEl.addEventListener('change', () => {
      memcSpeedAware = memcSpeedEl.checked;
      try { localStorage.setItem(MEMC_SPEED_KEY, memcSpeedAware ? '1' : '0'); } catch (e){}
      memcBypass = false;       // re-judge the skip with the new rule
      memcLastKey = '';
      memcResetStream();
      refreshVideoDelayState();
      memcUpdateStatus();
    });
  }

  const memcStrEl = document.getElementById('memc-str'), memcStrValEl = document.getElementById('memc-str-val');
  const MEMC_STR_KEY = 'playerMemcStrength';
  let memcStrength = 0.5;
  try { const v = parseInt(localStorage.getItem(MEMC_STR_KEY), 10); if (v >= 0 && v <= 100) memcStrength = v / 100; } catch (e){}
  function memcUpdateStrength(){
    memcStrEl.value = Math.round(memcStrength * 100);
    memcStrValEl.textContent = Math.round(memcStrength * 100) + '%';
  }
  memcStrEl.addEventListener('input', () => {
    memcStrength = (parseInt(memcStrEl.value, 10) || 0) / 100;
    memcUpdateStrength();
    memcLastKey = '';
    try { localStorage.setItem(MEMC_STR_KEY, String(Math.round(memcStrength * 100))); } catch (e){}
    if (memcActive && videoEl.paused) try { memcPresent(videoEl.currentTime, true); } catch (e){}
  });
  memcUpdateStrength();

  const memcDelayTog = document.getElementById('memc-delay-gl-toggle');
  if (memcDelayTog){
    memcDelayTog.checked = memcDelayGL;
    memcDelayTog.addEventListener('change', () => {
      memcDelayGL = memcDelayTog.checked;
      try { localStorage.setItem(MEMC_DELAY_KEY, memcDelayGL ? '1' : '0'); } catch (e){}
      refreshVideoDelayState();
    });
  }

