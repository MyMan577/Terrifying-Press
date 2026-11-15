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
    return !memcFailed && (memcSmoothing() || glDelay || memcEnhOn())
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

    // Motion vectors are in analysis pixels, stored companded in .rg (sqrt curve, +-128 px): fine steps for slow
    // motion, coarse only for very fast motion. Works at 8-bit (RGBA8) as well as half float. .b = trust 0..1;
    // it never shortens a vector.
    const MV = 'const float MVR = 128.0;\n'
      + 'vec2 mvDec(vec2 e){ vec2 s = e * 2.0 - 1.0; return s * abs(s) * MVR; }\n'
      + 'vec4 mvEnc(vec2 v, float conf){ vec2 s = clamp(v / MVR, -1.0, 1.0); return vec4(0.5 + 0.5 * sign(s) * sqrt(abs(s)), conf, 1.0); }\n';
    // Shared by the field passes (ME, REF, MED). Needs uCur, uPrev, uSize, uPrior, uHasPrior. uHasPrior: 0 = no
    // previous field, +1 = it points the same way as this one, -1 = the opposite way (negated when read).
    const MVL = MV
      + 'float lc(ivec2 p){ return texelFetch(uCur, clamp(p, ivec2(0), uSize - 1), 0).r; }\n'
      + 'float lp(ivec2 p){ return texelFetch(uPrev, clamp(p, ivec2(0), uSize - 1), 0).r; }\n'
      + 'vec2 priorAt(ivec2 p){\n'
      + '  ivec2 n = textureSize(uPrior, 0);\n'
      + '  ivec2 q = clamp((p * n) / uSize, ivec2(0), n - 1);\n'
      + '  return mvDec(texelFetch(uPrior, q, 0).rg) * uHasPrior;\n'
      + '}\n'
      + 'float sadW(ivec2 c, ivec2 d, int st){\n'
      + '  float s = 0.0;\n'
      + '  for (int j = -4; j < 4; j++){ for (int i = -4; i < 4; i++){\n'
      + '    ivec2 p = c + ivec2(i, j) * st;\n'
      + '    s += abs(lc(p) - lp(p + d));\n'
      + '  } }\n'
      + '  return s * (1.0 / 64.0);\n'
      + '}\n'
      // x = SAD with no motion, y = texture (mean 1-px luma gradient) of the block.
      + 'vec2 zeroAct(ivec2 c, int st){\n'
      + '  float s = 0.0, g = 0.0;\n'
      + '  for (int j = -4; j < 4; j++){ for (int i = -4; i < 4; i++){\n'
      + '    ivec2 p = c + ivec2(i, j) * st;\n'
      + '    float a = lc(p);\n'
      + '    s += abs(a - lp(p));\n'
      + '    g += abs(a - lc(p + ivec2(1, 0))) + abs(a - lc(p + ivec2(0, 1)));\n'
      + '  } }\n'
      + '  return vec2(s * (1.0 / 64.0), g * (1.0 / 128.0));\n'
      + '}\n'
      // How much better than "no motion" a moving vector must match: a share of the no-motion error, capped by the
      // texture. Busy areas that barely change keep zero motion; anything that really moves clears it easily.
      + 'float zbias(vec2 za){ return min(0.35 * za.x, 0.004 + 0.15 * za.y); }\n'
      // Trust: the match is good for this much texture, or (motion blur, changing shapes) it is clearly better
      // than no motion while still being a plausible match. A block with no real match (just uncovered) stays low.
      + 'float trust(float sb, vec2 za, bool moving){\n'
      + '  float r = sb / (0.006 + 0.5 * za.y);\n'
      + '  float m = 1.0 - smoothstep(1.2, 2.8, r);\n'
      + '  float g = moving ? smoothstep(0.05, 0.4, (za.x - sb) / (za.x + 0.002)) * (1.0 - smoothstep(2.5, 5.0, r)) : 0.0;\n'
      + '  return max(m, g);\n'
      + '}\n'
      + 'float lenPen(vec2 d){ return 0.0006 * min(length(d), 8.0); }\n';

    // Coarse field, one vector per 8px block, pointing from uCur into uPrev. Candidates: no motion, the previous
    // field (followed along its own track, plus 4 neighbours); where those do not already match well, a coarse
    // search on the quarter-size luma (mip 2, 32px window: an 11x11 grid 20px apart, then +-8/4px; reaches
    // +-112px); then +-4/2/1 px refinement around the best and a sub-pixel fit.
    const FS_ME = 'uniform sampler2D uCur; uniform sampler2D uPrev; uniform ivec2 uSize; uniform float uLambda;\n'
      + 'uniform sampler2D uPrior; uniform float uHasPrior;\n'
      + MVL
      + 'void tryV(ivec2 c, ivec2 d, float zb, inout ivec2 best, inout float bestCost, inout float bestSad){\n'
      + '  float s = sadW(c, d, 2);\n'
      + '  float cost = s + (d == ivec2(0) ? 0.0 : zb) + uLambda * min(length(vec2(d)), 8.0);\n'
      + '  if (cost < bestCost){ bestCost = cost; best = d; bestSad = s; }\n'
      + '}\n'
      // SAD of a 32px window on the quarter-size copy of the luma (mip 2), 8x8 taps.
      + 'float sad2(ivec2 c2, ivec2 d2){\n'
      + '  ivec2 n2 = uSize >> 2;\n'
      + '  float s = 0.0;\n'
      + '  for (int j = -4; j < 4; j++){ for (int i = -4; i < 4; i++){\n'
      + '    ivec2 p = c2 + ivec2(i, j);\n'
      + '    s += abs(texelFetch(uCur, clamp(p, ivec2(0), n2 - 1), 2).r - texelFetch(uPrev, clamp(p + d2, ivec2(0), n2 - 1), 2).r);\n'
      + '  } }\n'
      + '  return s * (1.0 / 64.0);\n'
      + '}\n'
      + 'void main(){\n'
      + '  ivec2 c = ivec2(gl_FragCoord.xy) * 8 + 4;\n'
      + '  vec2 za = zeroAct(c, 2);\n'
      + '  float zb = zbias(za);\n'
      + '  ivec2 best = ivec2(0); float bestCost = za.x; float bestSad = za.x;\n'
      + '  if (uHasPrior != 0.0){\n'
      + '    ivec2 v = ivec2(round(priorAt(c)));\n'
      + '    tryV(c, v, zb, best, bestCost, bestSad);\n'
      + '    if (uHasPrior > 0.0) tryV(c, ivec2(round(priorAt(c + v))), zb, best, bestCost, bestSad);\n'
      + '    tryV(c, ivec2(round(priorAt(c + ivec2(16, 0)))), zb, best, bestCost, bestSad);\n'
      + '    tryV(c, ivec2(round(priorAt(c - ivec2(16, 0)))), zb, best, bestCost, bestSad);\n'
      + '    tryV(c, ivec2(round(priorAt(c + ivec2(0, 16)))), zb, best, bestCost, bestSad);\n'
      + '    tryV(c, ivec2(round(priorAt(c - ivec2(0, 16)))), zb, best, bestCost, bestSad);\n'
      + '  }\n'
      // The wide search only where no motion and the previous track do not already match well for this texture:
      // new, fast or changing motion gets the effort; still areas and steady tracks stay cheap.
      + '  int stp;\n'
      + '  if (bestSad > 0.4 * (0.006 + 0.5 * za.y)){\n'
      + '    ivec2 c2 = c >> 2; ivec2 cb = ivec2(0); float cc = sad2(c2, cb);\n'
      + '    for (int j = -5; j <= 5; j++){ for (int i = -5; i <= 5; i++){\n'
      + '      if (i == 0 && j == 0) continue;\n'
      + '      ivec2 d = ivec2(i, j) * 5;\n'
      + '      float s = sad2(c2, d) + 0.0015 + uLambda * min(4.0 * length(vec2(d)), 8.0);\n'
      + '      if (s < cc){ cc = s; cb = d; }\n'
      + '    } }\n'
      + '    stp = 2;\n'
      + '    for (int l = 0; l < 2; l++){\n'
      + '      ivec2 ctr = cb;\n'
      + '      for (int j = -1; j <= 1; j++){ for (int i = -1; i <= 1; i++){\n'
      + '        if (i == 0 && j == 0) continue;\n'
      + '        ivec2 d = ctr + ivec2(i, j) * stp;\n'
      + '        float s = sad2(c2, d) + 0.0015 + uLambda * min(4.0 * length(vec2(d)), 8.0);\n'
      + '        if (s < cc){ cc = s; cb = d; }\n'
      + '      } }\n'
      + '      stp = stp / 2;\n'
      + '    }\n'
      + '    tryV(c, cb * 4, zb, best, bestCost, bestSad);\n'
      + '  }\n'
      + '  stp = 4;\n'
      + '  for (int l = 0; l < 3; l++){\n'
      + '    ivec2 ctr = best;\n'
      + '    for (int j = -1; j <= 1; j++){ for (int i = -1; i <= 1; i++){\n'
      + '      if (i == 0 && j == 0) continue;\n'
      + '      tryV(c, ctr + ivec2(i, j) * stp, zb, best, bestCost, bestSad);\n'
      + '    } }\n'
      + '    stp = stp / 2;\n'
      + '  }\n'
      + '  vec2 sub = vec2(0.0);\n'
      + '  bool moving = best != ivec2(0);\n'
      + '  if (moving){\n'
      + '    float xm = sadW(c, best + ivec2(-1, 0), 2); float xp = sadW(c, best + ivec2(1, 0), 2);\n'
      + '    float ym = sadW(c, best + ivec2(0, -1), 2); float yp = sadW(c, best + ivec2(0, 1), 2);\n'
      + '    float dx = xm - 2.0 * bestSad + xp; float dy = ym - 2.0 * bestSad + yp;\n'
      + '    if (dx > 1e-5) sub.x = clamp(0.5 * (xm - xp) / dx, -0.5, 0.5);\n'
      + '    if (dy > 1e-5) sub.y = clamp(0.5 * (ym - yp) / dy, -0.5, 0.5);\n'
      + '  }\n'
      // flat blocks say little about motion: weak say when MED weighs neighbours
      + '  float cf = trust(bestSad, za, moving) * (0.25 + 0.75 * smoothstep(0.004, 0.03, za.y));\n'
      + '  oc = mvEnc(vec2(best) + sub, cf);\n'
      + '}\n';

    // Vector clean-up (replaces a plain 3x3 vote). Each block re-tests its 3x3 neighbours' vectors, no motion and
    // the previous field's vector on ITS OWN pixels, and keeps the cheapest: match error + no-motion bias + a
    // pull toward trusted neighbours and the previous track. A small fast object keeps its vector because only that
    // vector matches its pixels; noisy vectors in busy still areas lose to no motion; flat blocks (no evidence either
    // way) follow their neighbours instead of defaulting to no motion. Then a steady track is eased
    // toward the previous field (less sub-pixel jitter). Block size = uSize / uGrid (8 Advanced, 4 Ultra).
    // Output .b = trust for drawing.
    const FS_MED = 'uniform sampler2D uRaw; uniform ivec2 uGrid;\n'
      + 'uniform sampler2D uCur; uniform sampler2D uPrev; uniform ivec2 uSize; uniform sampler2D uPrior; uniform float uHasPrior;\n'
      + MVL
      + 'void main(){\n'
      + '  ivec2 g = ivec2(gl_FragCoord.xy);\n'
      + '  int bs = uSize.x / uGrid.x; int st = max(bs / 4, 1);\n'
      + '  ivec2 c = g * bs + bs / 2;\n'
      + '  vec2 v[9]; float w[9];\n'
      + '  for (int j = 0; j < 3; j++){ for (int i = 0; i < 3; i++){\n'
      + '    vec4 t = texelFetch(uRaw, clamp(g + ivec2(i - 1, j - 1), ivec2(0), uGrid - 1), 0);\n'
      + '    v[j * 3 + i] = mvDec(t.rg); w[j * 3 + i] = 0.1 + t.b;\n'
      + '  } }\n'
      + '  vec2 za = zeroAct(c, st);\n'
      + '  float zb = zbias(za);\n'
      + '  float lam = 0.003 + 0.2 * za.y;\n'
      + '  float tex = smoothstep(0.004, 0.03, za.y);\n'
      + '  bool hp = uHasPrior != 0.0;\n'
      + '  vec2 pv = hp ? priorAt(uHasPrior > 0.0 ? c + ivec2(round(v[4])) : c) : vec2(0.0);\n'
      + '  vec2 bestV = vec2(0.0); float bestCost = 1e9; float bestSad = za.x;\n'
      + '  for (int k = 0; k < 11; k++){\n'
      + '    if (k == 10 && !hp) continue;\n'
      + '    vec2 cand = k < 9 ? v[k] : (k == 9 ? vec2(0.0) : pv);\n'
      + '    ivec2 d = ivec2(round(cand));\n'
      + '    bool z = d == ivec2(0);\n'
      + '    float s = z ? za.x : sadW(c, d, st);\n'
      + '    float sm = 0.0, ws = 0.0;\n'
      + '    for (int n = 0; n < 9; n++){ if (n == 4) continue; sm += w[n] * min(length(cand - v[n]), 6.0); ws += w[n]; }\n'
      + '    float tp = hp ? 0.25 * min(length(cand - pv), 6.0) : 0.0;\n'
      + '    float cost = s + (z ? 0.0 : zb) + lam * (0.5 * sm / ws + tp) + tex * (lenPen(cand) + (k == 4 ? 0.0 : 0.0005));\n'
      + '    if (cost < bestCost){ bestCost = cost; bestV = cand; bestSad = s; }\n'
      + '  }\n'
      + '  if (hp && length(bestV - pv) < 1.0) bestV = mix(bestV, pv, 0.3);\n'
      + '  oc = mvEnc(bestV, trust(bestSad, za, length(bestV) >= 0.5));\n'
      + '}\n';

    // Compares two frames on an 8x8 grid of cells (16x16 samples each). R = mean diff (x32),
    // G = count of clearly-changed samples, B = coarse mean diff (x2, for hard-cut detection).
    // Fast-object candidates, once per field: for each block, the fastest trusted vector (over 3 px) whose path
    // between the two frames passes this block. Searched every 8 px out to +-128 px. The draw pass tries it as a
    // second track, so a small fast object is found at any point between the frames (following the field from the
    // pixel alone lands on background once the object has moved more than its own size).
    const FS_DIL = 'uniform sampler2D uMv; uniform ivec2 uGrid; uniform ivec2 uSize;\n'
      + MV
      + 'void main(){\n'
      + '  ivec2 g = ivec2(gl_FragCoord.xy);\n'
      + '  int bs = uSize.x / uGrid.x; int st = max(8 / bs, 1);\n'
      + '  vec2 p = (vec2(g) + 0.5) * float(bs);\n'
      + '  float reach = 0.75 * float(bs * st) + float(bs);\n'
      + '  vec2 best = vec2(0.0); float bm = 3.0; float btr = 0.0;\n'
      + '  for (int j = -16; j <= 16; j++){ for (int i = -16; i <= 16; i++){\n'
      + '    ivec2 q = g + ivec2(i, j) * st;\n'
      + '    if (q.x < 0 || q.y < 0 || q.x >= uGrid.x || q.y >= uGrid.y) continue;\n'
      + '    vec4 t = texelFetch(uMv, q, 0);\n'
      + '    vec2 v = mvDec(t.rg); float L = length(v);\n'
      + '    if (L <= bm || t.b < 0.5) continue;\n'
      + '    vec2 o = p - (vec2(q) + 0.5) * float(bs);\n'
      + '    float h = clamp(dot(o, v) / (L * L), 0.0, 1.0);\n'
      + '    if (length(o - v * h) > reach) continue;\n'
      // a lone vector (or a pair) is more likely a stray match than an object: need 2 neighbours moving the same way
      + '    float tl = 0.2 * L + 1.0; int sup = 0;\n'
      + '    for (int n = 0; n < 9; n++){\n'
      + '      if (n == 4) continue;\n'
      + '      ivec2 o2 = ivec2(n % 3 - 1, n / 3 - 1);\n'
      + '      if (length(mvDec(texelFetch(uMv, clamp(q + o2, ivec2(0), uGrid - 1), 0).rg) - v) < tl) sup++;\n'
      + '    }\n'
      + '    if (sup < 2) continue;\n'
      + '    bm = L; best = v; btr = t.b;\n'
      + '  } }\n'
      + '  oc = mvEnc(best, btr);\n'
      + '}\n';

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

    // Picture enhance (see memcEnhPasses). Kept identical to NativeVideoView.kt.
    // PRE, at the processing size: compression clean-up (8x8 block edges + an edge-keeping smooth for ringing),
    // banding smoothing (averages flat areas, then a 1-step grain so the bands stay gone) and anime lines
    // (darker line art).
    const FS_ENH_PRE = 'uniform sampler2D uTex; uniform vec2 uSize; uniform float uDeblock; uniform float uDeband; uniform float uAnime; uniform float uBlock; uniform float uRad; uniform float uSeed; uniform float uFlipY;\n'
      + 'float lum(vec3 c){ return dot(c, vec3(0.299, 0.587, 0.114)); }\n'
      + 'vec3 tx(vec2 p){ return texture(uTex, p / uSize).rgb; }\n'
      + 'float hash(vec2 p){ vec3 q = fract(vec3(p.xyx) * 0.1031); q += dot(q, q.yzx + 33.33); return fract((q.x + q.y) * q.z); }\n'
      + 'vec3 deblockAxis(vec3 c, vec2 p, float fq, vec2 ax){\n'
      + '  float dl = fq, dr = uBlock - fq;\n'
      + '  float k = floor(min(dl, dr));\n'
      + '  if (k > 1.0) return c;\n'
      + '  vec2 s = dl < dr ? -ax : ax;\n'
      + '  vec3 A = tx(p + s * k), B = tx(p + s * (k + 1.0));\n'
      + '  vec3 A2 = tx(p + s * (k - 1.0)), B2 = tx(p + s * (k + 2.0));\n'
      + '  float step0 = abs(lum(B) - lum(A));\n'
      + '  if (step0 > 0.09 || abs(lum(A2) - lum(A)) > 0.03 || abs(lum(B2) - lum(B)) > 0.03) return c;\n'
      + '  return c + (B - A) * (k < 0.5 ? 0.375 : 0.125);\n'
      + '}\n'
      + 'void main(){\n'
      + '  vec2 p = vUv * uSize;\n'
      + '  vec3 c = tx(p);\n'
      + '  if (uDeblock > 0.5){\n'
      + '    if (uBlock >= 4.0){\n'
      + '      float ty = uFlipY > 0.5 ? uSize.y - p.y : p.y;\n'
      + '      c = deblockAxis(c, p, mod(p.x, uBlock), vec2(1.0, 0.0));\n'
      + '      c = deblockAxis(c, p, mod(ty, uBlock), vec2(0.0, uFlipY > 0.5 ? -1.0 : 1.0));\n'
      + '    }\n'
      + '    vec3 acc = vec3(0.0); float ws = 0.0; float l0 = lum(c);\n'
      + '    for (int j = -1; j <= 1; j++){ for (int i = -1; i <= 1; i++){\n'
      + '      vec3 s = (i == 0 && j == 0) ? c : tx(p + vec2(float(i), float(j)));\n'
      + '      float d = lum(s) - l0;\n'
      + '      float w = exp(-d * d * 900.0) * ((i == 0 || j == 0) ? 1.0 : 0.6);\n'
      + '      acc += s * w; ws += w;\n'
      + '    } }\n'
      + '    c = mix(c, acc / ws, 0.5);\n'
      + '  }\n'
      + '  if (uDeband > 0.5){\n'
      + '    vec3 a = c;\n'
      + '    for (int it = 1; it <= 2; it++){\n'
      + '      float fi = float(it);\n'
      + '      float r = uRad * fi * (0.5 + hash(p + fi * 17.0));\n'
      + '      float an = hash(p * 1.7 + fi * 31.0) * 6.2831853;\n'
      + '      vec2 o = vec2(cos(an), sin(an)) * r;\n'
      + '      vec3 s1 = tx(p + o), s2 = tx(p - o), s3 = tx(p + vec2(-o.y, o.x)), s4 = tx(p + vec2(o.y, -o.x));\n'
      + '      vec3 av = (s1 + s2 + s3 + s4) * 0.25;\n'
      + '      vec3 df = max(max(abs(s1 - a), abs(s2 - a)), max(abs(s3 - a), abs(s4 - a)));\n'
      + '      a = mix(av, a, step(vec3(0.011 / fi), df));\n'
      + '    }\n'
      + '    c = a + (hash(p + uSeed) - hash(p.yx + uSeed + 7.0)) * (1.0 / 255.0);\n'
      + '  }\n'
      + '  if (uAnime > 0.5){\n'
      + '    float t00 = lum(tx(p + vec2(-1.0, -1.0))), t10 = lum(tx(p + vec2(0.0, -1.0))), t20 = lum(tx(p + vec2(1.0, -1.0)));\n'
      + '    float t01 = lum(tx(p + vec2(-1.0, 0.0))), t11 = lum(tx(p)), t21 = lum(tx(p + vec2(1.0, 0.0)));\n'
      + '    float t02 = lum(tx(p + vec2(-1.0, 1.0))), t12 = lum(tx(p + vec2(0.0, 1.0))), t22 = lum(tx(p + vec2(1.0, 1.0)));\n'
      + '    vec2 g = vec2(t20 + 2.0 * t21 + t22 - t00 - 2.0 * t01 - t02, t02 + 2.0 * t12 + t22 - t00 - 2.0 * t10 - t20);\n'
      + '    float m = length(g);\n'
      + '    float e = smoothstep(0.1, 0.45, m);\n'
      + '    float mean = (t00 + t10 + t20 + t01 + t11 + t21 + t02 + t12 + t22) * (1.0 / 9.0);\n'
      + '    c -= vec3(max(0.0, mean - t11) * 1.2 * e);\n'
      + '  }\n'
      + '  oc = vec4(clamp(c, 0.0, 1.0), 1.0);\n'
      + '}\n';

    const FS_ENH_UP = 'uniform sampler2D uTex; uniform vec2 uSrc;\n'
      + 'void main(){\n'
      + '  vec2 pos = vUv * uSrc - 0.5;\n'
      + '  vec2 fp = floor(pos); vec2 f = pos - fp;\n'
      + '  ivec2 ip = ivec2(fp); ivec2 mx = ivec2(uSrc) - 1;\n'
      + '  vec3 c[16]; float l[16];\n'
      + '  for (int j = 0; j < 4; j++){ for (int i = 0; i < 4; i++){\n'
      + '    vec3 s = texelFetch(uTex, clamp(ip + ivec2(i - 1, j - 1), ivec2(0), mx), 0).rgb;\n'
      + '    c[j * 4 + i] = s; l[j * 4 + i] = dot(s, vec3(0.299, 0.587, 0.114));\n'
      + '  } }\n'
      + '  float sxx = 0.0, syy = 0.0, sxy = 0.0;\n'
      + '  for (int j = 1; j <= 2; j++){ for (int i = 1; i <= 2; i++){\n'
      + '    float w = (i == 1 ? 1.0 - f.x : f.x) * (j == 1 ? 1.0 - f.y : f.y);\n'
      + '    float gx = l[j * 4 + i + 1] - l[j * 4 + i - 1];\n'
      + '    float gy = l[(j + 1) * 4 + i] - l[(j - 1) * 4 + i];\n'
      + '    sxx += w * gx * gx; syy += w * gy * gy; sxy += w * gx * gy;\n'
      + '  } }\n'
      + '  float tr = sxx + syy;\n'
      + '  float dd = sqrt((sxx - syy) * (sxx - syy) + 4.0 * sxy * sxy);\n'
      + '  float l1 = 0.5 * (tr + dd), l2 = 0.5 * (tr - dd);\n'
      + '  vec2 v = vec2(l1 - syy, sxy);\n'
      + '  float vl = length(v);\n'
      + '  vec2 dir = vl > 1e-8 ? v / vl : vec2(1.0, 0.0);\n'
      + '  float len = tr > 1e-7 ? (l1 - l2) / (l1 + l2) : 0.0;\n'
      + '  len *= smoothstep(0.0002, 0.003, tr);\n'
      + '  float stretch = 1.0 / max(abs(dir.x), abs(dir.y));\n'
      + '  vec2 len2 = vec2(1.0 + (stretch - 1.0) * len, 1.0 - 0.5 * len);\n'
      + '  float lob = 0.5 + ((0.25 - 0.04) - 0.5) * len;\n'
      + '  float clp = 1.0 / lob;\n'
      + '  vec3 acc = vec3(0.0); float ws = 0.0;\n'
      + '  for (int j = 0; j < 4; j++){ for (int i = 0; i < 4; i++){\n'
      + '    vec2 d = vec2(float(i - 1), float(j - 1)) - f;\n'
      + '    vec2 r = vec2(dot(d, dir), dot(d, vec2(-dir.y, dir.x))) * len2;\n'
      + '    float x2 = min(dot(r, r), clp);\n'
      + '    float wB = 0.4 * x2 - 1.0; float wA = lob * x2 - 1.0;\n'
      + '    float w = (1.5625 * wB * wB - 0.5625) * (wA * wA);\n'
      + '    acc += c[j * 4 + i] * w; ws += w;\n'
      + '  } }\n'
      + '  vec3 o = acc / ws;\n'
      + '  vec3 mn = min(min(c[5], c[6]), min(c[9], c[10]));\n'
      + '  vec3 mxv = max(max(c[5], c[6]), max(c[9], c[10]));\n'
      + '  oc = vec4(clamp(o, mn, mxv), 1.0);\n'
      + '}\n';

    const FS_ENH_FIN = 'uniform sampler2D uTex; uniform sampler2D uBefore; uniform float uCon; uniform float uSplit;\n'
      + 'void main(){\n'
      + '  ivec2 q = ivec2(gl_FragCoord.xy); ivec2 mx = textureSize(uTex, 0) - 1;\n'
      + '  vec3 e = texelFetch(uTex, clamp(q, ivec2(0), mx), 0).rgb;\n'
      + '  vec3 o = e;\n'
      + '  if (uCon > 0.0){\n'
      + '    vec3 b = texelFetch(uTex, clamp(q + ivec2(0, -1), ivec2(0), mx), 0).rgb;\n'
      + '    vec3 d = texelFetch(uTex, clamp(q + ivec2(-1, 0), ivec2(0), mx), 0).rgb;\n'
      + '    vec3 f = texelFetch(uTex, clamp(q + ivec2(1, 0), ivec2(0), mx), 0).rgb;\n'
      + '    vec3 h = texelFetch(uTex, clamp(q + ivec2(0, 1), ivec2(0), mx), 0).rgb;\n'
      + '    vec3 mn4 = min(min(b, d), min(f, h)); vec3 mx4 = max(max(b, d), max(f, h));\n'
      + '    vec3 hitMin = min(mn4, e) / (4.0 * mx4 + 1e-4);\n'
      + '    vec3 hitMax = (1.0 - max(mx4, e)) / (4.0 * min(mn4, e) - 4.0 - 1e-4);\n'
      + '    vec3 lr = max(-hitMin, hitMax);\n'
      + '    float lobe = max(-0.1875, min(max(lr.r, max(lr.g, lr.b)), 0.0)) * uCon;\n'
      + '    vec3 W = vec3(0.299, 0.587, 0.114);\n'
      + '    float bL = dot(b, W), dL = dot(d, W), eL = dot(e, W), fL = dot(f, W), hL = dot(h, W);\n'
      + '    float nz = 0.25 * (bL + dL + fL + hL) - eL;\n'
      + '    float rng = max(max(max(bL, dL), max(eL, fL)), hL) - min(min(min(bL, dL), min(eL, fL)), hL);\n'
      + '    nz = clamp(abs(nz) / max(rng, 1e-4), 0.0, 1.0);\n'
      + '    lobe *= 1.0 - 0.5 * nz;\n'
      + '    o = (lobe * (b + d + f + h) + e) / (4.0 * lobe + 1.0);\n'
      + '  }\n'
      + '  if (uSplit >= 0.0){\n'
      + '    vec2 uv = (vec2(q) + 0.5) / vec2(mx + 1);\n'
      + '    if (uv.x < uSplit) o = texture(uBefore, uv).rgb;\n'
      + '  }\n'
      + '  oc = vec4(clamp(o, 0.0, 1.0), 1.0);\n'
      + '}\n';

    // Ultra: refine the 8px vectors to 4px blocks (8x8 window). Candidates: no motion, the parent's and its
    // neighbours' vectors, the previous field's vector (followed along its track), then a local +-1 search and a
    // parabolic sub-pixel fit. Same no-motion bias and trust as FS_ME.
    const FS_REF = 'uniform sampler2D uCur; uniform sampler2D uPrev; uniform sampler2D uRaw; uniform sampler2D uPrior; uniform float uHasPrior; uniform ivec2 uSize; uniform ivec2 uGrid;\n'
      + MVL
      + 'void tryV(ivec2 c, ivec2 d, float zb, float extra, inout ivec2 best, inout float bestCost, inout float bestSad){\n'
      + '  float s = sadW(c, d, 1);\n'
      + '  float cost = s + (d == ivec2(0) ? 0.0 : zb) + lenPen(vec2(d)) + extra;\n'
      + '  if (cost < bestCost){ bestCost = cost; best = d; bestSad = s; }\n'
      + '}\n'
      + 'void main(){\n'
      + '  ivec2 f = ivec2(gl_FragCoord.xy);\n'
      + '  ivec2 c = f * 4 + 2;\n'
      + '  ivec2 par = f / 2;\n'
      + '  vec2 za = zeroAct(c, 1);\n'
      + '  float zb = zbias(za);\n'
      + '  ivec2 best = ivec2(0); float bestCost = za.x; float bestSad = za.x;\n'
      + '  for (int j = -1; j <= 1; j++){ for (int i = -1; i <= 1; i++){\n'
      + '    vec4 t = texelFetch(uRaw, clamp(par + ivec2(i, j), ivec2(0), uGrid - 1), 0);\n'
      + '    tryV(c, ivec2(round(mvDec(t.rg))), zb, (i != 0 || j != 0) ? 0.002 : 0.0, best, bestCost, bestSad);\n'
      + '  } }\n'
      + '  if (uHasPrior != 0.0){\n'
      + '    ivec2 v = ivec2(round(priorAt(c)));\n'
      + '    tryV(c, v, zb, 0.0, best, bestCost, bestSad);\n'
      + '    if (uHasPrior > 0.0) tryV(c, ivec2(round(priorAt(c + v))), zb, 0.0, best, bestCost, bestSad);\n'
      + '  }\n'
      + '  for (int l = 0; l < 2; l++){\n'
      + '    ivec2 ctr = best;\n'
      + '    for (int j = -1; j <= 1; j++){ for (int i = -1; i <= 1; i++){\n'
      + '      if (i == 0 && j == 0) continue;\n'
      + '      tryV(c, ctr + ivec2(i, j), zb, 0.0, best, bestCost, bestSad);\n'
      + '    } }\n'
      + '  }\n'
      + '  vec2 sub = vec2(0.0);\n'
      + '  bool moving = best != ivec2(0);\n'
      + '  if (moving){\n'
      + '    float xm = sadW(c, best + ivec2(-1, 0), 1); float xp = sadW(c, best + ivec2(1, 0), 1);\n'
      + '    float ym = sadW(c, best + ivec2(0, -1), 1); float yp = sadW(c, best + ivec2(0, 1), 1);\n'
      + '    float dx = xm - 2.0 * bestSad + xp; float dy = ym - 2.0 * bestSad + yp;\n'
      + '    if (dx > 1e-5) sub.x = clamp(0.5 * (xm - xp) / dx, -0.5, 0.5);\n'
      + '    if (dy > 1e-5) sub.y = clamp(0.5 * (ym - yp) / dy, -0.5, 0.5);\n'
      + '  }\n'
      + '  float cf = trust(bestSad, za, moving) * (0.25 + 0.75 * smoothstep(0.004, 0.03, za.y));\n'
      + '  oc = mvEnc(vec2(best) + sub, cf);\n'
      + '}\n';

    const FS_BLEND = SAMP + 'uniform sampler2D uF0; uniform sampler2D uF1; uniform float uA;\n'
      + 'void main(){ oc = vec4(mix(samp(uF0, vUv), samp(uF1, vUv), uA), 1.0); }\n';

    // Draw-side helpers. track(): the vector of the motion passing this pixel at time uA. Follows the field from
    // the pixel (back = how far to step back along it: 1-uA for a field on the later frame, uA for one on the
    // earlier frame), then tries the fast-object candidate (FS_DIL) and takes it where the field confirms it: the
    // point it lands on in that frame moves the same way. A faster confirmed track wins (it passes in front).
    // near(): 1 when two vectors agree (tolerance grows with speed), 0 when they clearly differ.
    const MVT = MV
      + 'vec2 dec(sampler2D t, vec2 uv){ return mvDec(texture(t, clamp(uv, 0.0, 1.0)).rg); }\n'
      + 'float near(vec2 a, vec2 b, float tol){ float t = tol * (1.0 + 0.05 * length(a)); return 1.0 - smoothstep(t, 3.0 * t, length(a - b)); }\n'
      // Fallback picture: the two real frames, weighted to the nearer one in time (no snap), and away from a frame
      // where a fast object covers this point (h0, h1: object present in frame 0 / frame 1).
      + 'vec3 fallback(vec3 s0, vec3 s1, float a, float h0, float h1){\n'
      + '  float t = a * a * (3.0 - 2.0 * a);\n'
      + '  float w0 = (1.0 - t) * (1.0 - h0) + 1e-3, w1 = t * (1.0 - h1) + 1e-3;\n'
      + '  return (w0 * s0 + w1 * s1) / (w0 + w1);\n'
      + '}\n'
      + 'vec2 track(sampler2D mv, sampler2D dil, vec2 uv, vec2 inv, float back, int iters){\n'
      + '  vec2 d = dec(mv, uv);\n'
      + '  for (int i = 0; i < iters; i++) d = dec(mv, uv - d * inv * back);\n'
      + '  vec2 c = dec(dil, uv); float L = length(c);\n'
      + '  if (L > length(d) + 2.0){\n'
      + '    vec2 c1 = dec(mv, uv - c * inv * back);\n'
      + '    d = mix(d, c1, 1.0 - smoothstep(0.2 * L + 1.0, 0.4 * L + 2.0, length(c1 - c)));\n'
      + '  }\n'
      + '  return d;\n'
      + '}\n';

    // Advanced: warp both frames along the full vector (trust never shortens it). Near a fast object the
    // background takes its colour only from the frame where the object does not cover it. Where the field is not
    // trusted (its block did not match), ease toward a soft cross-fade weighted to the nearer frame. Trust is read
    // from the bilinear field, so the change is spatially smooth: no per-pixel switching. uFall carries Strength.
    const FS_MC = SAMP + MVT + 'uniform sampler2D uF0; uniform sampler2D uF1; uniform sampler2D uMv; uniform sampler2D uMvD;\n'
      + 'uniform float uA; uniform vec2 uInvAna; uniform vec2 uFall;\n'
      + 'void main(){\n'
      + '  vec2 inv = uInvAna; float a = uA, wa = 1.0 - uA;\n'
      + '  float k = clamp((uFall.x - 0.06) / 0.24, 0.0, 1.0);\n'
      + '  vec2 d = track(uMv, uMv, vUv, inv, wa, 2);\n'
      + '  vec2 c = dec(uMvD, vUv); float L = length(c);\n'
      + '  float wfg = 0.0, h0 = 0.0, h1 = 0.0; vec2 cf = c;\n'
      + '  if (L > length(d) + 2.0){\n'
      + '    cf = dec(uMv, vUv - c * inv * wa);\n'
      + '    wfg = near(c, cf, 0.2 * L / (1.0 + 0.05 * L) + 1.0);\n'
      + '    h0 = near(c, dec(uMv, vUv + d * inv * a - c * inv), 1.0);\n'
      + '    h1 = near(c, dec(uMv, vUv - d * inv * wa), 1.0);\n'
      + '  }\n'
      + '  vec2 p1 = clamp(vUv - d * inv * wa, 0.0, 1.0);\n'
      + '  float w0 = wa * (1.0 - h0) + 1e-3, w1 = a * (1.0 - h1) + 1e-3;\n'
      + '  vec3 bg = (w0 * samp(uF0, vUv + d * inv * a) + w1 * samp(uF1, p1)) / (w0 + w1);\n'
      + '  vec3 fg = mix(samp(uF0, vUv + cf * inv * a), samp(uF1, vUv - cf * inv * wa), a);\n'
      + '  vec3 moved = mix(bg, fg, wfg);\n'
      + '  float tr = mix(texture(uMv, p1).b, 1.0, wfg);\n'
      + '  vec3 fb = fallback(samp(uF0, vUv), samp(uF1, vUv), a, h0, h1);\n'
      + '  float ok = smoothstep(mix(0.12, 0.0, k), mix(0.45, 0.25, k), tr);\n'
      + '  oc = vec4(mix(fb, moved, ok), 1.0);\n'
      + '}\n';

    // Ultra: uses BOTH the forward field (at the later frame) and the backward field (at the earlier frame), each
    // giving a track through this pixel (with the fast-object candidate). A track holds if its vector matches the
    // field where it starts. The forward/backward check then says whether the track's point is also visible in the
    // other frame: if not (covered or uncovered area) it takes its colour from its own frame alone, still moving
    // along its vector. The tracks are weighed softly (holds, visibility, trust, how well their ends match). Only
    // where NEITHER track holds (typically the edge of an area just covered or uncovered, where the field has no
    // real match) does it ease toward fallback(): the real frames weighted to the nearer one, and away from the
    // frame where a fast object covers the point. Fast motion is never a reason to fall back. The tolerances grow
    // with uFall (Strength).
    const FS_MC2 = SAMP + MVT + 'uniform sampler2D uF0; uniform sampler2D uF1; uniform sampler2D uMvF; uniform sampler2D uMvB;\n'
      + 'uniform sampler2D uMvDF; uniform sampler2D uMvDB; uniform float uA; uniform vec2 uInvAna; uniform vec2 uFall;\n'
      + 'float mx(vec3 v){ return max(v.r, max(v.g, v.b)); }\n'
      + 'void main(){\n'
      + '  vec2 inv = uInvAna; float a = uA, wa = 1.0 - uA;\n'
      + '  float k = clamp((uFall.x - 0.06) / 0.24, 0.0, 1.0);\n'
      + '  float tol = mix(0.6, 1.4, k);\n'
      + '  vec2 d = track(uMvF, uMvDF, vUv, inv, wa, 3), e = track(uMvB, uMvDB, vUv, inv, a, 3);\n'
      + '  vec2 p1 = clamp(vUv - d * inv * wa, 0.0, 1.0);\n'
      + '  vec2 q0 = clamp(vUv - e * inv * a, 0.0, 1.0);\n'
      + '  vec4 tF = texture(uMvF, p1), tB = texture(uMvB, q0);\n'
      + '  float sF = near(d, mvDec(tF.rg), tol), sB = near(e, mvDec(tB.rg), tol);\n'
      + '  float cF = near(d, -dec(uMvB, p1 + d * inv), tol);\n'
      + '  float cB = near(e, -dec(uMvF, q0 + e * inv), tol);\n'
      + '  vec3 fa0 = samp(uF0, vUv + d * inv * a), fa1 = samp(uF1, p1);\n'
      + '  vec3 ba0 = samp(uF0, q0), ba1 = samp(uF1, vUv + e * inv * wa);\n'
      + '  float vF = wa * cF + a, vB = wa + a * cB;\n'
      + '  vec3 colF = (wa * cF * fa0 + a * fa1) / max(vF, 1e-4);\n'
      + '  vec3 colB = (wa * ba0 + a * cB * ba1) / max(vB, 1e-4);\n'
      + '  float ef = mx(abs(fa0 - fa1)) * cF, eb = mx(abs(ba0 - ba1)) * cB;\n'
      + '  float sig = mix(0.06, 0.14, k), em = min(ef, eb);\n'
      + '  float wF = sF * vF * (0.3 + 0.7 * tF.b) * exp(-(ef - em) / sig);\n'
      + '  float wB = sB * vB * (0.3 + 0.7 * tB.b) * exp(-(eb - em) / sig);\n'
      + '  vec2 c = dec(uMvDF, vUv); float h0 = 0.0, h1 = 0.0;\n'
      + '  if (length(c) > 2.0){ h0 = near(c, dec(uMvF, vUv - c * inv), 1.0); h1 = near(c, dec(uMvF, vUv), 1.0); }\n'
      + '  vec3 fb = fallback(samp(uF0, vUv), samp(uF1, vUv), a, h0, h1);\n'
      + '  vec3 moved = (wF * colF + wB * colB + 1e-6 * fb) / (wF + wB + 1e-6);\n'
      + '  oc = vec4(mix(fb, moved, max(sF, sB)), 1.0);\n'
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
        me:    mk(FS_ME,    ['uCur', 'uPrev', 'uSize', 'uLambda', 'uPrior', 'uHasPrior']),
        med:   mk(FS_MED,   ['uRaw', 'uGrid', 'uCur', 'uPrev', 'uSize', 'uPrior', 'uHasPrior']),
        blend: mk(FS_BLEND, ['uF0', 'uF1', 'uA', 'uUp']),
        mc:    mk(FS_MC,    ['uF0', 'uF1', 'uMv', 'uMvD', 'uA', 'uInvAna', 'uFall', 'uUp']),
        dil:   mk(FS_DIL,   ['uMv', 'uGrid', 'uSize']),
        ref:   mk(FS_REF,   ['uCur', 'uPrev', 'uRaw', 'uPrior', 'uHasPrior', 'uSize', 'uGrid']),
        mc2:   mk(FS_MC2,   ['uF0', 'uF1', 'uMvF', 'uMvB', 'uMvDF', 'uMvDB', 'uA', 'uInvAna', 'uFall', 'uUp']),
        enhPre: mk(FS_ENH_PRE, ['uTex', 'uSize', 'uDeblock', 'uDeband', 'uAnime', 'uBlock', 'uRad', 'uSeed', 'uFlipY']),
        enhUp:  mk(FS_ENH_UP,  ['uTex', 'uSrc']),
        enhFin: mk(FS_ENH_FIN, ['uTex', 'uBefore', 'uCon', 'uSplit'])
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
      memcGL = null; memcRing = []; memcResKey = ''; srLiveCtx = null;
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

  // levels > 1: a mip chain (sampled with texelFetch at a chosen level; filled by generateMipmap).
  function memcMakeTex(w, h, filter, fmt, levels){
    const gl = memcGL;
    const t = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texStorage2D(gl.TEXTURE_2D, levels || 1, fmt || gl.RGBA8, w, h);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, (levels || 1) > 1 ? gl.NEAREST_MIPMAP_NEAREST : filter);
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
      slot.mvTexD = memcMakeTex(mw, mh, gl.NEAREST, fine ? memcVecFmt() : undefined);   // fast-object candidates (FS_DIL)
      slot.mvFboD = memcMakeFbo(slot.mvTexD);
      if (fine){
        slot.mvTexB = memcMakeTex(mw, mh, gl.LINEAR, fine ? memcVecFmt() : undefined);
        slot.mvFboB = memcMakeFbo(slot.mvTexB);
        slot.mvTexDB = memcMakeTex(mw, mh, gl.NEAREST, memcVecFmt());
        slot.mvFboDB = memcMakeFbo(slot.mvTexDB);
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
        if (s.mvFboD) gl.deleteFramebuffer(s.mvFboD);
        if (s.mvTexD) gl.deleteTexture(s.mvTexD);
        if (s.mvFboDB) gl.deleteFramebuffer(s.mvFboDB);
        if (s.mvTexDB) gl.deleteTexture(s.mvTexDB);
      });
      memcLuma.forEach(l => { gl.deleteFramebuffer(l.fbo); gl.deleteTexture(l.tex); });
      if (memcMvRaw){ gl.deleteFramebuffer(memcMvRaw.fbo); gl.deleteTexture(memcMvRaw.tex); }
      if (memcMvRef){ gl.deleteFramebuffer(memcMvRef.fbo); gl.deleteTexture(memcMvRef.tex); }
      for (const k in memcEnh){ const t = memcEnh[k]; if (t){ gl.deleteFramebuffer(t.fbo); gl.deleteTexture(t.tex); } }
      srFreeAll(srLiveCtx);
    }
    memcEnh = { mid: null, pre: null, up: null, ai: null };
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

  // A toast (once per video and size) when a video is drawn smaller than it is AND smaller than the screen can show,
  // so detail is really lost. Says why and what raises it.
  let memcFullOom = false, memcResNoted = '';
  function memcResNote(vw, vh, rw, rh, screenPx, smoothing){
    const long = Math.max(rw, rh), want = Math.min(Math.max(vw, vh), screenPx);
    if (long >= want * 0.97) return;
    let id = ''; try { const t = tracks[currentIndex]; id = t ? (t.id || t.name || '') : ''; } catch (e){}
    const k = id + '|' + vw + 'x' + vh + '|' + rw + 'x' + rh;
    if (k === memcResNoted) return;
    memcResNoted = k;
    const why = !smoothing ? (memcFullOom ? 'the GPU ran short of memory' : 'the picture delay keeps many frames in memory')
      : memcQuality < MEMC_TIERS.length - 1 ? 'Motion smoothing quality is ' + MEMC_TIERS[memcQuality].name + '. Raise it for full detail'
      : 'smoothing at this size needs more GPU memory';
    showToast('Playing at ' + rw + '\u00d7' + rh + ' (video is ' + vw + '\u00d7' + vh + '): ' + why + '.');
  }

  function memcEnsureResources(vw, vh){
    const gl = memcGL;
    const smoothing = memcSmoothing();
    const motion = memcIsMotion() && !memcBypass;
    const fps = Math.min(120, 1 / Math.max(memcPeriod, 0.004));
    const needFrames = Math.ceil((Math.min(Math.max(effLatencyMs(), 0), 2000) / 1000 + (smoothing ? 0.4 : 0.3)) * fps) + 4;
    const wantN = Math.max(12, Math.ceil(needFrames / 8) * 8);
    const tier = MEMC_TIERS[memcQuality];
    const key = (motion ? (memcMode === 'ultra' ? 'u' : 'm') : smoothing ? 'b' : 'd') + memcQuality + ':' + vw + 'x' + vh;
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
    // Only holding the picture back (no smoothing): keep the video's own size, up to the screen's real pixels,
    // instead of the smoothing tier's width (Low drew a 1080p video at 720p). The smoothing tiers still apply
    // when it is smoothing, and after the GPU once ran out of memory at full size.
    const full = !smoothing && !memcFullOom;
    const screenPx = Math.round(Math.max(screen.width || 0, screen.height || 0, window.innerWidth, window.innerHeight) * (window.devicePixelRatio || 1));
    const maxW = full ? Math.max(screenPx, 1280) : (motion ? tier.motionW : tier.simpleW);
    let scale = Math.min(1, maxW / (full ? Math.max(vw, vh) : vw));
    scale = Math.min(scale, Math.sqrt(((full ? 400 : smoothing ? tier.mb : Math.max(tier.mb, 160)) * 1048576) / (N * 4 * vw * vh)));
    const rw = Math.max(64, Math.round(vw * scale / 2) * 2);
    const rh = Math.max(36, Math.round(vh * scale / 2) * 2);
    memcRingW = rw; memcRingH = rh;
    memcResNote(vw, vh, rw, rh, screenPx, smoothing);
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
        const tex = memcMakeTex(wa, ha, gl.NEAREST, gl.RGBA8, 3);   // mip 2: the coarse search level
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
    if (gl.getError() === gl.OUT_OF_MEMORY && full){
      memcFreeResources(); memcFullOom = true; memcResKey = ''; return;   // fall back to the tier size
    }
    if (!full && gl.getError() === gl.OUT_OF_MEMORY && memcQuality > 0){
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
    const capH = !enhMaster ? 0 : (MEMC_UP_CAPS[memcUpscale] || (enhAI !== 'off' ? 2160 : 0));   // an AI upscaler enlarges up to the screen even with Upscale off
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
      memcBind(0, memcLuma[cur].tex);
      gl.generateMipmap(gl.TEXTURE_2D);

      if (memcPrevLumaValid && !disc && memcMode !== 'ultra'){
        // The previous unique frame's field seeds the search and steadies the track (not across a cut or gap).
        const prior = (puSlot && puSlot.hasMv && puSlot.mvTex && puSlot.seq === slot.prevSeq) ? puSlot.mvTex : null;
        memcMeVec(memcLuma[cur], memcLuma[prev], slot.mvFbo, A.gw, A.gh, memcMvRaw.tex, prior, 1, slot.mvTex, slot.mvFboD);
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

  // One motion field: ME (8px blocks, into memcMvRaw) -> [Ultra: REF to 4px blocks, into memcMvRef] -> MED (clean-up,
  // into outFbo, gw x gh or fw x fh). la/lb: luma of the frame the field sits on / the frame it points into.
  // prior: the previous unique frame's forward field (or null); sgn: +1 if this field points the same way, -1 if
  // it points the other way (the backward field), so it is negated when read.
  function memcMeVec(la, lb, outFbo, ow, oh, medIn, prior, sgn, outTex, dilFbo){
    const gl = memcGL, A = memcAna, M = memcProgs;
    const hp = prior ? sgn : 0;
    gl.bindFramebuffer(gl.FRAMEBUFFER, memcMvRaw.fbo);
    gl.viewport(0, 0, A.gw, A.gh);
    gl.useProgram(M.me.p);
    memcBind(0, la.tex); memcBind(1, lb.tex); memcBind(2, prior || la.tex);
    gl.uniform1i(M.me.u.uCur, 0); gl.uniform1i(M.me.u.uPrev, 1); gl.uniform1i(M.me.u.uPrior, 2);
    gl.uniform1f(M.me.u.uHasPrior, hp);
    gl.uniform2i(M.me.u.uSize, A.w, A.h);
    gl.uniform1f(M.me.u.uLambda, 0.0006);
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    if (memcMvRef && medIn === memcMvRef.tex){
      gl.bindFramebuffer(gl.FRAMEBUFFER, memcMvRef.fbo);
      gl.viewport(0, 0, A.fw, A.fh);
      gl.useProgram(M.ref.p);
      memcBind(0, la.tex); memcBind(1, lb.tex); memcBind(2, memcMvRaw.tex);
      memcBind(3, prior || memcMvRaw.tex);
      gl.uniform1i(M.ref.u.uCur, 0); gl.uniform1i(M.ref.u.uPrev, 1); gl.uniform1i(M.ref.u.uRaw, 2);
      gl.uniform1i(M.ref.u.uPrior, 3); gl.uniform1f(M.ref.u.uHasPrior, hp);
      gl.uniform2i(M.ref.u.uSize, A.w, A.h);
      gl.uniform2i(M.ref.u.uGrid, A.gw, A.gh);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    }

    gl.bindFramebuffer(gl.FRAMEBUFFER, outFbo);
    gl.viewport(0, 0, ow, oh);
    gl.useProgram(M.med.p);
    memcBind(0, medIn); memcBind(1, la.tex); memcBind(2, lb.tex); memcBind(3, prior || medIn);
    gl.uniform1i(M.med.u.uRaw, 0); gl.uniform1i(M.med.u.uCur, 1); gl.uniform1i(M.med.u.uPrev, 2);
    gl.uniform1i(M.med.u.uPrior, 3); gl.uniform1f(M.med.u.uHasPrior, hp);
    gl.uniform2i(M.med.u.uGrid, ow, oh);
    gl.uniform2i(M.med.u.uSize, A.w, A.h);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    memcBind(1, null); memcBind(2, null); memcBind(3, null);

    gl.bindFramebuffer(gl.FRAMEBUFFER, dilFbo);
    gl.useProgram(M.dil.p);
    memcBind(0, outTex);
    gl.uniform1i(M.dil.u.uMv, 0);
    gl.uniform2i(M.dil.u.uGrid, ow, oh);
    gl.uniform2i(M.dil.u.uSize, A.w, A.h);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  // Ultra motion field: coarse 8px search -> 4px refinement (+temporal prior, sub-pixel) -> clean-up, run both ways.
  // slot.mvTex: at this frame's positions, pointing into the previous unique frame.
  // slot.mvTexB: at the previous frame's positions, pointing into this one.
  // pu: previous unique slot. Its forward field seeds both searches (negated for the backward one: at the previous
  // frame's own positions it is exactly the opposite of the backward field when motion is steady).
  function memcUltraMv(slot, cur, prev, pu){
    const A = memcAna;
    const prior = (pu && pu.hasMv && pu.mvTex && pu.seq === slot.prevSeq) ? pu.mvTex : null;
    memcMeVec(memcLuma[cur], memcLuma[prev], slot.mvFbo, A.fw, A.fh, memcMvRef.tex, prior, 1, slot.mvTex, slot.mvFboD);
    memcMeVec(memcLuma[prev], memcLuma[cur], slot.mvFboB, A.fw, A.fh, memcMvRef.tex, prior, -1, slot.mvTexB, slot.mvFboDB);
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
    // With picture enhance on, the frame goes to a texture at the processing size first; memcEnhPasses takes it from there.
    const mid = memcEnhOn() ? memcEnhTex('mid', memcRingW, memcRingH) : null;
    const up = mid ? 0 : (memcOutW > memcRingW ? 1 : 0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, mid ? mid.fbo : null);
    gl.viewport(0, 0, mid ? mid.w : memcCanvas.width, mid ? mid.h : memcCanvas.height);
    if (f1 && a > 0 && memcIsMotion() && memcAna && f1.hasMv && f1.prevSeq === f0.seq && (memcMode !== 'ultra' || f1.mvTexB)){
      const ultra = memcMode === 'ultra';
      const P = ultra ? memcProgs.mc2 : memcProgs.mc;
      gl.useProgram(P.p);
      memcBind(0, f0.tex); memcBind(1, f1.tex); memcBind(2, f1.mvTex);
      gl.uniform1i(P.u.uF0, 0); gl.uniform1i(P.u.uF1, 1);
      if (ultra){
        memcBind(3, f1.mvTexB); memcBind(4, f1.mvTexD); memcBind(5, f1.mvTexDB);
        gl.uniform1i(P.u.uMvF, 2); gl.uniform1i(P.u.uMvB, 3); gl.uniform1i(P.u.uMvDF, 4); gl.uniform1i(P.u.uMvDB, 5);
      } else { memcBind(3, f1.mvTexD); gl.uniform1i(P.u.uMv, 2); gl.uniform1i(P.u.uMvD, 3); }
      gl.uniform1f(P.u.uA, a);
      gl.uniform2f(P.u.uInvAna, 1 / memcAna.w, 1 / memcAna.h);
      gl.uniform1f(P.u.uUp, up);
      gl.uniform2f(P.u.uFall, 0.06 + 0.24 * memcStrength, 0.15 + 0.6 * memcStrength);
    } else {
      const P = memcProgs.blend;
      const second = (f1 && a > 0) ? f1 : f0;
      gl.useProgram(P.p);
      memcBind(0, f0.tex); memcBind(1, second.tex);
      gl.uniform1i(P.u.uF0, 0); gl.uniform1i(P.u.uF1, 1);
      gl.uniform1f(P.u.uA, (f1 && a > 0) ? a : 0);
      gl.uniform1f(P.u.uUp, up);
    }
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    if (mid) memcEnhPasses(mid);
  }

  // ---------- AI upscalers (Picture enhance and the enhanced copy) ----------
  // Small neural upscalers (2x) from www/pp-sr-models.js (built by tools/build_sr_models.py), run as shader passes:
  // QuickSRNet small/medium, XLSR, SESR-M5 (trained on photos) and Anime4K S/M (anime). Each layer becomes one pass
  // writing up to 8 textures at once (multiple render targets), so every input pixel is read once per tap for all of
  // its outputs. Features are half floats. A context C = {gl, floatOk, flipY, nets} lets the same code run on the
  // player's engine and on the enhanced-copy job's own canvas. flipY: the frames are stored bottom row first (as the
  // live engine and the native player do); the models were trained top row first, so their taps and the sub-pixel
  // order are mirrored to match. The same model description drives NativeVideoView.kt (srSpec below).
  const SR_MAX_PX = 1280 * 736;
  function srEnsureLoaded(){
    if (window.PP_SR_MODELS) return Promise.resolve(true);
    if (srLoading) return srLoading;
    srLoading = new Promise((res) => {
      const s = document.createElement('script');
      s.src = 'pp-sr-models.js';
      s.onload = () => res(!!window.PP_SR_MODELS);
      s.onerror = () => { srLoading = null; res(false); };
      document.head.appendChild(s);
    });
    return srLoading;
  }
  function srHalf(b64){
    const bin = atob(b64), u = new Uint16Array(bin.length >> 1);
    for (let i = 0; i < u.length; i++) u[i] = bin.charCodeAt(2 * i) | (bin.charCodeAt(2 * i + 1) << 8);
    const f = new Float32Array(u.length);
    for (let i = 0; i < u.length; i++){
      const h = u[i], s = h & 0x8000 ? -1 : 1, e = (h >> 10) & 31, m = h & 1023;
      f[i] = e === 0 ? s * m * Math.pow(2, -24) : e === 31 ? (m ? NaN : s * Infinity) : s * (1 + m / 1024) * Math.pow(2, e - 15);
    }
    return f;
  }
  const srNum = (v) => { let s = String(+v.toPrecision(6)); if (!/[.e]/.test(s)) s += '.0'; return s; };
  // The shader sources for a model: [{src, out, outs (output texture indices), slots: [{t, part}]}], plus the final
  // pass and the maps' channel counts. G = most textures one pass may write.
  function srSpec(id, G, flipY){
    const M = window.PP_SR_MODELS && window.PP_SR_MODELS[id];
    if (!M) return null;
    const chans = { x: 4 };
    M.layers.forEach(L => { chans[L.out] = L.o; });
    const fy = flipY ? -1 : 1;
    const head = '#version 300 es\nprecision highp float;\nprecision highp int;\nprecision highp sampler2D;\n';
    const fetchFn = M.pad === 'clamp'
      ? 'vec4 F(sampler2D t, ivec2 p){ return texelFetch(t, clamp(p, ivec2(0), uSize - 1), 0); }\n'
      : 'vec4 F(sampler2D t, ivec2 p){ return (p.x < 0 || p.y < 0 || p.x >= uSize.x || p.y >= uSize.y) ? vec4(0.0) : texelFetch(t, p, 0); }\n';
    const passes = [];
    M.layers.forEach(L => {
      const w = srHalf(L.w), b = srHalf(L.b), k = L.k, r = k >> 1, ctot = L.ins.reduce((n, i) => n + i.c, 0);
      const nOut = L.o / 4;
      for (let g0 = 0; g0 < nOut; g0 += G){
        const g1 = Math.min(nOut, g0 + G), outs = [], slots = [];
        const slotOf = (t, part) => { const key = t + ':' + part; let i = slots.findIndex(s => s.key === key); if (i < 0){ slots.push({ key, t, part }); i = slots.length - 1; } return i; };
        for (let j = g0; j < g1; j++) outs.push(j);
        const body = [];
        outs.forEach(j => body.push('  vec4 a' + j + ' = vec4(' + [0, 1, 2, 3].map(o => srNum(b[4 * j + o])).join(', ') + ');'));
        let cOff = 0;
        L.ins.forEach(inp => {
          for (let part = 0; part < inp.c / 4; part++){
            const si = slotOf(inp.t, part);
            for (let ky = 0; ky < k; ky++) for (let kx = 0; kx < k; kx++){
              const terms = [];
              outs.forEach(j => {
                const m = []; let any = false;
                for (let i = 0; i < 4; i++) for (let o = 0; o < 4; o++){
                  const v = w[(((4 * j + o) * ctot + cOff + 4 * part + i) * k + ky) * k + kx];
                  if (v !== 0) any = true;
                  m.push(srNum(v));
                }
                if (any) terms.push('  a' + j + ' += mat4(' + m.join(', ') + ') * v;');
              });
              if (!terms.length) continue;
              const raw = 'F(s' + si + ', p + ivec2(' + (kx - r) + ', ' + fy * (ky - r) + '))';
              body.push('  v = ' + (inp.f === 1 ? 'max(' + raw + ', 0.0)' : inp.f === 2 ? 'max(-' + raw + ', 0.0)' : raw) + ';');
              terms.forEach(t => body.push(t));
            }
          }
          cOff += inp.c;
        });
        outs.forEach(j => {
          if (L.act === 'relu') body.push('  a' + j + ' = max(a' + j + ', 0.0);');
          else if (L.act === 'clip') body.push('  a' + j + ' = clamp(a' + j + ', 0.0, 1.0);');
          if (L.add){ const si = slotOf(L.add, j); body.push('  a' + j + ' += texelFetch(s' + si + ', p, 0);'); }
          body.push('  o' + (j - g0) + ' = a' + j + ';');
        });
        const src = head + 'uniform ivec2 uSize;\n'
          + slots.map((s, i) => 'uniform sampler2D s' + i + ';').join('\n') + '\n'
          + outs.map((j, i) => 'layout(location = ' + i + ') out vec4 o' + i + ';').join('\n') + '\n'
          + fetchFn + 'void main(){\n  ivec2 p = ivec2(gl_FragCoord.xy);\n  vec4 v;\n' + body.join('\n') + '\n}\n';
        passes.push({ src, out: L.out, outs, slots: slots.map(s => ({ t: s.t, part: s.part })) });
      }
    });
    // depth-to-space: sub-pixel (row, column) of 2x2; with flipY the row counted from the bottom is the other one
    const sub = 'int s = (' + (flipY ? '1 - (q.y & 1)' : '(q.y & 1)') + ') * 2 + (q.x & 1);';
    const fin = head + (M.kind === 'rgb'
      ? 'uniform sampler2D s0, s1, s2;\nout vec4 oc;\nvoid main(){ ivec2 q = ivec2(gl_FragCoord.xy), p = q / 2; ' + sub + '\n'
        + '  oc = vec4(clamp(vec3(texelFetch(s0, p, 0)[s], texelFetch(s1, p, 0)[s], texelFetch(s2, p, 0)[s]), 0.0, 1.0), 1.0); }\n'
      : 'uniform sampler2D s0, sx;\nuniform vec2 uHr;\nout vec4 oc;\nvoid main(){ ivec2 q = ivec2(gl_FragCoord.xy), p = q / 2; ' + sub + '\n'
        + '  vec3 base = texture(sx, (vec2(q) + 0.5) / uHr).rgb;\n  oc = vec4(clamp(base + texelFetch(s0, p, 0)[s], 0.0, 1.0), 1.0); }\n');
    return { name: M.name || id, kind: M.kind, final: M.final, chans, passes, fin };
  }
  window.__ppSrSpec = (id, G, flipY) => srSpec(id, G, flipY);   // for the native player (NativeVideoView.kt)
  function srBind(C, unit, tex){ C.gl.activeTexture(C.gl.TEXTURE0 + unit); C.gl.bindTexture(C.gl.TEXTURE_2D, tex); }
  function srBuild(C, id){
    if (C.nets[id]) return C.nets[id];
    const gl = C.gl;
    if (!gl || !C.floatOk || !window.PP_SR_MODELS || !window.PP_SR_MODELS[id]) return null;
    const G = Math.max(1, Math.min(8, gl.getParameter(gl.MAX_DRAW_BUFFERS) || 4));
    const spec = srSpec(id, G, C.flipY);
    const compile = (src) => {
      const sh = (type, s) => { const o = gl.createShader(type); gl.shaderSource(o, s); gl.compileShader(o); if (!gl.getShaderParameter(o, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(o) || 'sr compile'); return o; };
      const p = gl.createProgram();
      gl.attachShader(p, sh(gl.VERTEX_SHADER, '#version 300 es\nvoid main(){ vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2)); gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0); }\n'));
      gl.attachShader(p, sh(gl.FRAGMENT_SHADER, src));
      gl.linkProgram(p);
      if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p) || 'sr link');
      return p;
    };
    const passes = spec.passes.map(P => {
      const prog = compile(P.src);
      return { prog, out: P.out, outs: P.outs, slots: P.slots, uSize: gl.getUniformLocation(prog, 'uSize'), locs: P.slots.map((s, i) => gl.getUniformLocation(prog, 's' + i)) };
    });
    const finProg = compile(spec.fin);
    const net = { spec, passes, fin: finProg, finLoc: ['s0', 's1', 's2', 'sx', 'uHr'].reduce((o, n) => (o[n] = gl.getUniformLocation(finProg, n), o), {}), tex: {}, w: 0, h: 0, hr: null };
    C.nets[id] = net;
    return net;
  }
  function srFreeNet(C, net){
    const gl = C.gl; if (!gl || !net) return;
    Object.values(net.tex).forEach(t => { t.texs.forEach(x => gl.deleteTexture(x)); t.fbos.forEach(f => gl.deleteFramebuffer(f)); });
    if (net.hr){ gl.deleteTexture(net.hr.tex); gl.deleteFramebuffer(net.hr.fbo); }
    net.tex = {}; net.hr = null; net.w = net.h = 0;
  }
  function srFreeAll(C){ if (C) Object.values(C.nets).forEach(n => srFreeNet(C, n)); }
  // Feature textures for this frame size: one set per map, plus one framebuffer per pass (its output group).
  function srAlloc(C, net, w, h){
    if (net.w === w && net.h === h) return;
    srFreeNet(C, net);
    const gl = C.gl;
    net.w = w; net.h = h;
    const mk = (fmt, filter, W, H) => {
      const t = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, t);
      gl.texStorage2D(gl.TEXTURE_2D, 1, fmt, W, H);
      [gl.TEXTURE_MIN_FILTER, gl.TEXTURE_MAG_FILTER].forEach(p => gl.texParameteri(gl.TEXTURE_2D, p, filter));
      [gl.TEXTURE_WRAP_S, gl.TEXTURE_WRAP_T].forEach(p => gl.texParameteri(gl.TEXTURE_2D, p, gl.CLAMP_TO_EDGE));
      return t;
    };
    Object.keys(net.spec.chans).forEach(name => {
      if (name === 'x') return;
      const texs = [];
      for (let i = 0; i < net.spec.chans[name] / 4; i++) texs.push(mk(gl.RGBA16F, gl.NEAREST, w, h));
      net.tex[name] = { texs, fbos: [] };
    });
    net.passes.forEach(P => {
      const f = gl.createFramebuffer();
      gl.bindFramebuffer(gl.FRAMEBUFFER, f);
      P.outs.forEach((j, i) => gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0 + i, gl.TEXTURE_2D, net.tex[P.out].texs[j], 0));
      gl.drawBuffers(P.outs.map((j, i) => gl.COLOR_ATTACHMENT0 + i));
      P.fbo = f; net.tex[P.out].fbos.push(f);
    });
    const hrTex = mk(gl.RGBA8, gl.LINEAR, w * 2, h * 2), hrFbo = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, hrFbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, hrTex, 0);
    net.hr = { tex: hrTex, fbo: hrFbo, w: w * 2, h: h * 2 };
  }
  // src: {tex, w, h} (RGBA8, linear) -> {tex, fbo, w, h}: the 2x picture, or null (not ready / failed).
  function srRun(C, id, src){
    const gl = C.gl;
    let net = null;
    try { net = srBuild(C, id); } catch (e){ console.warn('[ai upscale]', e); C.status = 'Could not start this model on this phone.'; C.broken = C.broken || {}; C.broken[id] = true; return null; }
    if (!net) return null;
    srAlloc(C, net, src.w, src.h);
    const texOf = (t, part) => t === 'x' ? src.tex : net.tex[t].texs[part];
    gl.viewport(0, 0, src.w, src.h);
    net.passes.forEach(P => {
      gl.bindFramebuffer(gl.FRAMEBUFFER, P.fbo);
      gl.useProgram(P.prog);
      gl.uniform2i(P.uSize, src.w, src.h);
      P.slots.forEach((s, i) => { srBind(C, i, texOf(s.t, s.part)); gl.uniform1i(P.locs[i], i); });
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    });
    const hr = net.hr;
    gl.bindFramebuffer(gl.FRAMEBUFFER, hr.fbo);
    gl.viewport(0, 0, hr.w, hr.h);
    gl.useProgram(net.fin);
    const fin = net.tex[net.spec.final].texs, L = net.finLoc;
    if (net.spec.kind === 'rgb'){ [0, 1, 2].forEach(i => { srBind(C, i, fin[i]); gl.uniform1i(L['s' + i], i); }); }
    else { srBind(C, 0, fin[0]); gl.uniform1i(L.s0, 0); srBind(C, 1, src.tex); gl.uniform1i(L.sx, 1); gl.uniform2f(L.uHr, hr.w, hr.h); }
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    C.status = net.spec.name + ': ' + src.w + '×' + src.h + ' → ' + hr.w + '×' + hr.h;
    return hr;
  }
  // The player's own context (its frames are stored bottom row first).
  function srLive(){
    if (!memcGL) return null;
    if (!srLiveCtx || srLiveCtx.gl !== memcGL) srLiveCtx = { gl: memcGL, floatOk: memcFloatOk, flipY: true, nets: {}, status: '', broken: {} };
    return srLiveCtx;
  }
  // Self-test (developer use): runs one model on raw RGBA pixels (top row first) on a context of its own and returns
  // the 2x RGBA pixels (top row first), to compare against the reference implementation in tools/. flipY tests the
  // bottom-row-first path the player uses.
  window.__ppSrSelfTest = async function(id, rgba, w, h, flipY){
    if (!(await srEnsureLoaded())) return null;
    const cv = document.createElement('canvas'), gl = cv.getContext('webgl2');
    if (!gl) return { error: 'no WebGL2' };
    const C = { gl, floatOk: !!(gl.getExtension('EXT_color_buffer_float') || gl.getExtension('EXT_color_buffer_half_float')), flipY: !!flipY, nets: {}, status: '' };
    const data = new Uint8Array(rgba);
    let up = data;
    if (flipY){ up = new Uint8Array(data.length); for (let y = 0; y < h; y++) up.set(data.subarray((h - 1 - y) * w * 4, (h - y) * w * 4), y * w * 4); }
    const t = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, up);
    [gl.TEXTURE_MIN_FILTER, gl.TEXTURE_MAG_FILTER].forEach(p => gl.texParameteri(gl.TEXTURE_2D, p, gl.LINEAR));
    [gl.TEXTURE_WRAP_S, gl.TEXTURE_WRAP_T].forEach(p => gl.texParameteri(gl.TEXTURE_2D, p, gl.CLAMP_TO_EDGE));
    const t0 = performance.now(), hr = srRun(C, id, { tex: t, w, h });
    if (!hr) return { error: C.status || 'not ready' };
    let out = new Uint8Array(hr.w * hr.h * 4);
    gl.bindFramebuffer(gl.FRAMEBUFFER, hr.fbo);
    gl.readPixels(0, 0, hr.w, hr.h, gl.RGBA, gl.UNSIGNED_BYTE, out);
    if (flipY){ const o = new Uint8Array(out.length), rw = hr.w * 4; for (let y = 0; y < hr.h; y++) o.set(out.subarray((hr.h - 1 - y) * rw, (hr.h - y) * rw), y * rw); out = o; }
    try { gl.getExtension('WEBGL_lose_context').loseContext(); } catch (e){}
    return { w: hr.w, h: hr.h, ms: performance.now() - t0, data: Array.from(out) };
  };

  function memcEnhTex(name, w, h){
    const gl = memcGL, t = memcEnh[name];
    if (t && t.w === w && t.h === h) return t;
    if (t){ gl.deleteFramebuffer(t.fbo); gl.deleteTexture(t.tex); }
    const tex = memcMakeTex(w, h, gl.LINEAR);
    return (memcEnh[name] = { tex, fbo: memcMakeFbo(tex), w, h });
  }
  // mid (the plain frame, processing size) -> [clean-up / deband / anime] -> [edge-aware upscale to the output size]
  // -> adaptive sharpening (FSR-style RCAS: strongest on soft detail, held back on noise and where it would overshoot)
  // -> the canvas. With Compare on, the left half shows the plain frame as it would look without any of this.
  function memcEnhPasses(mid){
    const gl = memcGL, P = memcProgs;
    let src = mid;
    if (enhDeblock || enhDeband || enhAnime){
      const pre = memcEnhTex('pre', mid.w, mid.h), u = P.enhPre.u;
      gl.bindFramebuffer(gl.FRAMEBUFFER, pre.fbo); gl.viewport(0, 0, pre.w, pre.h);
      gl.useProgram(P.enhPre.p); memcBind(0, mid.tex);
      gl.uniform1i(u.uTex, 0); gl.uniform2f(u.uSize, mid.w, mid.h);
      gl.uniform1f(u.uDeblock, enhDeblock ? 1 : 0); gl.uniform1f(u.uDeband, enhDeband ? 1 : 0); gl.uniform1f(u.uAnime, enhAnime ? 1 : 0);
      gl.uniform1f(u.uBlock, 8 * mid.w / Math.max(1, videoEl.videoWidth || mid.w));   // the codec's 8x8 grid at this size
      gl.uniform1f(u.uRad, Math.max(2, 8 * mid.h / 1080));
      memcEnhSeed = (memcEnhSeed + 1) % 997; gl.uniform1f(u.uSeed, memcEnhSeed * 1.37);
      gl.uniform1f(u.uFlipY, 1);   // frames are stored bottom row first
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      src = pre;
    }
    // AI upscaler: 2x when the picture has to be enlarged and is small enough to keep up; the standard pass then fits
    // its result to the output size.
    const C = srLive();
    if (enhAI === 'off') srStatus = '';
    else if (C && !(C.broken && C.broken[enhAI])){
      if (!memcFloatOk) srStatus = 'Not available on this phone (no half-float rendering).';
      else if (!window.PP_SR_MODELS) srStatus = 'Loading\u2026';
      else if (memcOutW <= src.w * 1.15 && memcOutH <= src.h * 1.15) srStatus = 'Not needed: the picture is already as sharp as the screen.';
      else if (src.w * src.h > SR_MAX_PX) srStatus = 'Skipped: over 720p is too big to run live (standard upscaler used).';
      else { const hr = srRun(C, enhAI, src); srStatus = C.status; if (hr) src = hr; }
    } else if (C) srStatus = C.status;
    if (memcOutW !== src.w || memcOutH !== src.h){
      const upT = memcEnhTex('up', memcOutW, memcOutH), u = P.enhUp.u;
      gl.bindFramebuffer(gl.FRAMEBUFFER, upT.fbo); gl.viewport(0, 0, upT.w, upT.h);
      gl.useProgram(P.enhUp.p); memcBind(0, src.tex);
      gl.uniform1i(u.uTex, 0); gl.uniform2f(u.uSrc, src.w, src.h);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      src = upT;
    }
    const u = P.enhFin.u;
    gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.viewport(0, 0, memcCanvas.width, memcCanvas.height);
    gl.useProgram(P.enhFin.p); memcBind(0, src.tex); memcBind(1, mid.tex);
    gl.uniform1i(u.uTex, 0); gl.uniform1i(u.uBefore, 1);
    gl.uniform1f(u.uCon, enhSharp / 100); gl.uniform1f(u.uSplit, enhCompare ? enhCompareX : -1);
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
      maxIn: memcMaxIn, outFps: memcOutFps, strength, quality: memcQuality,
      // Picture enhance only when its Apply button is on
      upscale: enhMaster ? memcUpscale : 0, sharp: enhMaster ? enhSharp / 100 : 0, deband: !!enhMaster && enhDeband, deblock: !!enhMaster && enhDeblock,
      anime: !!enhMaster && enhAnime, compare: !!enhMaster && enhCompare, split: Math.round(enhCompareX * 1000) / 1000, ai: enhMaster ? enhAI : 'off'
    });
    // The AI upscaler's shader passes, built here once and handed to the native engine (8 outputs per pass, frames
    // stored bottom row first there too).
    if (enhMaster && enhAI !== 'off' && PPNative.setSrModel){
      if (window.PP_SR_MODELS){ try { const sp = srSpec(enhAI, 8, true); if (sp) PPNative.setSrModel(enhAI, sp); } catch (e){ console.warn('[ai upscale]', e); } }
      else srEnsureLoaded();
    }
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

