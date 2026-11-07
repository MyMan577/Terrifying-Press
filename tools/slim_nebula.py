#!/usr/bin/env python3
"""Build the slim Nebula Touch bundled in Press Play.

Takes index.html from the MyMan577/Nebula-touch- repo and writes a cut-down
copy: no built-in music player (Press Play is the music player), no fps
readout, no tuning knobs nobody needs (friction, drift, speed limit, edge
return, velocity trails, fps cap, auto safeguards, hot core, sharp render,
bloom strength, custom palettes). three.js loads from a local file so it
works offline.

usage: slim_nebula.py <upstream index.html> <output index.html>
"""
import re, sys

s = open(sys.argv[1], encoding='utf-8').read()

def sub(old, new, count=1):
    global s
    n = s.count(old)
    if n < 1:
        sys.exit('not found: ' + old[:80])
    s = s.replace(old, new, count)

def cut_between(start, end, keep_end=True):
    """Remove from start up to end (end itself kept unless keep_end=False)."""
    global s
    a = s.find(start)
    if a < 0: sys.exit('start not found: ' + start[:80])
    b = s.find(end, a)
    if b < 0: sys.exit('end not found: ' + end[:80])
    s = s[:a] + s[b if keep_end else b + len(end):]

# ---------- HTML ----------
sub('"three": "https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js"', '"three": "./three.module.js"')
sub('  <div id="fps"></div>\n', '')
sub('<div id="hint">drag to stir the field</div>', '<div id="hint">drag to play</div>')
sub('    <button class="sidebar-tab" data-menu="sound" aria-selected="false"><span class="tab-icon">♫</span>Sound</button>\n', '')
sub('<p class="section-note">Choose how each touch reshapes the field.</p>', '<p class="section-note">Pick what your finger does.</p>')
cut_between('      <div id="customPaletteCreator"', '    </section>')
sub('''        <button id="fpsCapBtn">60fps cap: off</button>
        <button id="clearBtn">Scatter</button>''', '''        <button id="clearBtn">Scatter</button>''')
cut_between('        <button id="autoPerfBtn"', '      </div>\n      <p class="section-note">Auto safeguards')
cut_between('      <p class="section-note">Auto safeguards', '      <div class="slider-group">')
for sid in ['frictionVal', 'driftVal', 'maxSpeedVal', 'edgeReturnVal']:
    m = re.search(r'\n        <div class="slider-row"><span class="label">[^<]*</span><span class="value" id="%s">[^\n]*\n        <input [^\n]*\n' % sid, s)
    if not m: sys.exit('slider not found: ' + sid)
    s = s[:m.start()] + '\n' + s[m.end():]
sub('<div class="slider-row"><span class="label">Center vortex</span>', '<div class="slider-row"><span class="label">Spin</span>')
sub(' title="Adds flowing, position-based motion noise"', '')
sub(' title="Rotates particles around the center of the field"', '')
cut_between('        <button id="hotCoreBtn"', '        <button id="sparkleBtn"')
cut_between('        <button id="sharpBtn"', '      </div>')
cut_between('      <div class="slider-group">\n        <div class="slider-row"><span class="label">Bloom strength', '    </section>')
cut_between('    <section class="menu-section" data-menu-panel="sound">', '  </div>\n</aside>')

# ---------- JS: music player ----------
# Everything from the Soundtrack heading up to the final restore call goes.
# The animation loop still asks for audio levels, so it gets silent stubs.
cut_between('  // ---------- Soundtrack ----------', '  restoreSettings();\n  updatePlayerControls();', keep_end=True)
sub('  restoreSettings();\n  updatePlayerControls();', '''  // Press Play is the music player, so the game has no player of its own.
  // The visualizer code below still reads these; they stay silent.
  const audioLevels = { bass: 0, mid: 0, high: 0, kick: 0, snare: 0, hat: 0 };
  function readAudioEnergy() { return audioLevels; }

  restoreSettings();''')
# the loop runs before the stub line above is reached at runtime? No: frame()
# only starts after this whole module has run, so hoisted function + const are ready.
sub('''      if (!backgroundPlaybackEnabled && !audioEl.paused) {
        audioEl.pause();
        soundStatus.textContent = 'paused while backgrounded';
      } else if (backgroundPlaybackEnabled && !audioEl.paused) {
        maintainAudioContextPlayback();
        startBackgroundResumeWatchdog();
      }
''', '')
sub('''      stopBackgroundResumeWatchdog();
      maintainAudioContextPlayback();
      if (backgroundPlaybackEnabled && !audioEl.paused) requestWakeLock();
''', '')
sub('VISUALIZER_PRESETS[visualizerPreset] || VISUALIZER_PRESETS.Pulse', 'VISUALIZER_PRESETS.Pulse')
sub('const kdx = pt.x - kickX, kdy = pt.y - kickY;', 'const kdx = pt.x, kdy = pt.y;')

# ---------- JS: fps readout ----------
sub("  const fpsEl = document.getElementById('fps');\n", '')
m = re.search(r"\n    if \(now - lastHudUpdate >= HUD_UPDATE_INTERVAL\) \{.*?\n    \}\n", s, re.S)
if not m: sys.exit('hud block not found')
s = s[:m.start()] + '\n' + s[m.end():]

# ---------- JS: settings that no longer have controls ----------
sub('''      friction: +frictionSlider.value, speed: +speedSlider.value,
      drift: +driftSlider.value, turbulence: +turbulenceSlider.value,
      vortex: +vortexSlider.value, maxSpeed: +maxSpeedSlider.value,
      edgeReturn: +edgeReturnSlider.value, velocityTrails,
      fpsCap, volume: Math.round(audioEl.volume * 100), audioReactive,
      repeatMode, shuffleEnabled, playbackRate, backgroundPlaybackEnabled,
      visualizerPreset,
      bloomEnabled, bloomStrength: Math.round(bloomStrengthMult * 100), hotCoreEnabled, sparkleEnabled,
      sharpRender, performanceSafeguards: qualityMode === 'auto'
''', '''      speed: +speedSlider.value, turbulence: +turbulenceSlider.value,
      vortex: +vortexSlider.value, bloomEnabled, sparkleEnabled
''')
for name in ['frictionSlider', 'driftSlider', 'maxSpeedSlider', 'edgeReturnSlider']:
    cut_between("  const %s = document.getElementById('%s');" % (name, name), '  });\n', keep_end=False)
cut_between("  const velocityTrailBtn = document.getElementById('velocityTrailBtn');", "  document.getElementById('clearBtn')")
cut_between("  const hotCoreBtn = document.getElementById('hotCoreBtn');", "  const sparkleBtn")
cut_between("  const sharpBtn = document.getElementById('sharpBtn');", '  // Restore last-used settings')
# custom palettes: keep the swatches, drop the "+ Custom" maker and delete buttons
cut_between('    if (key.startsWith(\'custom_\')) {', '    paletteSwatches[key] = sw;')
sub('''    if (beforeAddBtn) paletteRow.insertBefore(sw, addPaletteBtn);
    else paletteRow.appendChild(sw);''', '    paletteRow.appendChild(sw);')
cut_between('  // "+" swatch toggles the color-picker panel', '  // Particles slider sets')
m = re.search(r"\n    if \(typeof saved\.friction.*?\n    if \(typeof saved\.turbulence", s, re.S)
s = s[:m.start()] + "\n    if (typeof saved.speed === 'number') { speedSlider.value = saved.speed; speedSlider.dispatchEvent(new Event('input')); }\n    if (typeof saved.turbulence" + s[m.end():]
m = re.search(r"\n    if \(typeof saved\.maxSpeed.*?\n    if \(typeof saved\.bloomEnabled", s, re.S)
s = s[:m.start()] + "\n    if (typeof saved.bloomEnabled" + s[m.end():]
m = re.search(r"\n    if \(typeof saved\.hotCoreEnabled[^\n]*\n", s)
s = s[:m.start()] + '\n' + s[m.end():]
m = re.search(r"\n    // `performanceSafeguards`.*?\n  \}\n", s, re.S)
s = s[:m.start()] + '\n  }\n' + s[m.end():]
sub("effects: 'Effects', sound: 'Soundtrack' }", "effects: 'Effects' }")
# Custom palettes saved by the full version are not loaded here.
sub('function loadCustomPalettes() {', 'function loadCustomPalettes() {\n    return {};')

# ---------- no service worker inside the app ----------
m = re.search(r"<script>\s*if \('serviceWorker' in navigator\).*?</script>\n?", s, re.S)
if m: s = s[:m.start()] + s[m.end():]

open(sys.argv[2], 'w', encoding='utf-8').write(s)
print('ok', s.count('\n'), 'lines')
