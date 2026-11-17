#!/usr/bin/env python3
"""Builds www/pp-sr-models.js: the small AI upscalers used live by Picture enhance (and later the enhanced-copy job).

Every model becomes the same simple description, which the app turns into shader passes:
  layers: [{ins: [{t: input map, f: 0 plain | 1 max(x,0) | 2 max(-x,0), c: channels (multiple of 4)}],
            out: map name, o: output channels, k: kernel size, act: 'relu' | 'clip' | 'none', add: map added after act,
            w: float16 weights [o][sum c][k][k] (base64), b: float16 bias [o]}]
  final: last map; kind 'rgb' (12 channels -> 2x RGB by depth-to-space) or 'luma' (4 channels -> one 2x detail
  value added to the bilinear-enlarged picture); pad 'zero' (PyTorch) or 'clamp' (mpv). The input picture is map 'x'
  (RGBA, alpha ignored).

Sources (see tools/sr-models/README.md for licences):
  tools/sr-models/aimet-weights.json  QuickSRNet small/medium, XLSR, SESR-M5 (2x, float32), from Qualcomm's AIMET model
                                      zoo; SESR's linear blocks already collapsed.
  tools/sr-models/anime4k/*.glsl      Anime4K v3.2 Upscale CNN x2 S/M (mpv shaders), MIT.
Run: python3 tools/build_sr_models.py
"""
import base64, json, os, re
import numpy as np

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'tools', 'sr-models')
OUT = os.path.join(ROOT, 'www', 'pp-sr-models.js')

def b16(a): return base64.b64encode(np.asarray(a, np.float16).tobytes()).decode()

def pad_in(w, cin_to):  # pad the input-channel axis with zeros
    o, c, k, _ = w.shape
    if c == cin_to: return w
    z = np.zeros((o, cin_to, k, k), np.float32); z[:, :c] = w; return z

def to_k(w, k):  # put a smaller kernel in the middle of a k x k one
    o, c, kk, _ = w.shape
    if kk == k: return w
    z = np.zeros((o, c, k, k), np.float32); m = (k - kk) // 2; z[:, :, m:m + kk, m:m + kk] = w; return z

def layer(ins, out, w, b, act='none', add=None):
    w = np.asarray(w, np.float32)
    assert w.shape[1] == sum(i['c'] for i in ins), (out, w.shape, ins)
    assert w.shape[0] % 4 == 0
    return {'ins': ins, 'out': out, 'o': int(w.shape[0]), 'k': int(w.shape[2]), 'act': act, 'add': add, 'w': b16(w), 'b': b16(b)}

def grouped_dense(w, groups):  # grouped conv weights -> dense with zeros between groups
    o, cg, k, _ = w.shape; og = o // groups
    d = np.zeros((o, cg * groups, k, k), np.float32)
    for g in range(groups): d[g * og:(g + 1) * og, g * cg:(g + 1) * cg] = w[g * og:(g + 1) * og]
    return d

def aimet():
    raw = json.load(open(os.path.join(SRC, 'aimet-weights.json')))
    W = {m: {k: np.frombuffer(base64.b64decode(v['f32']), np.float32).reshape(v['shape']) for k, v in t.items()} for m, t in raw.items()}
    X = {'t': 'x', 'f': 0, 'c': 4}
    models = {}
    for name, n in (('quicksrnet_small', 2), ('quicksrnet_medium', 5)):
        p = W[name]; L = []
        L.append(layer([X], 'f0', pad_in(p['cnn.0.weight'], 4), p['cnn.0.bias'], 'clip'))
        for i in range(1, n + 1):
            L.append(layer([{'t': 'f%d' % (i - 1), 'f': 0, 'c': 32}], 'f%d' % i, p['cnn.%d.weight' % (2 * i)], p['cnn.%d.bias' % (2 * i)], 'clip'))
        L.append(layer([{'t': 'f%d' % n, 'f': 0, 'c': 32}], 'o', p['conv_last.weight'], p['conv_last.bias'], 'clip'))
        models[name] = {'kind': 'rgb', 'pad': 'zero', 'layers': L, 'final': 'o'}
    p = W['sesr_m5']; L = []
    L.append(layer([X], 'a', pad_in(p['first.weight'], 4), p['first.bias'], 'relu'))
    prev = 'a'
    for i in range(5):
        L.append(layer([{'t': prev, 'f': 0, 'c': 16}], 'h%d' % i, p['res.%d.weight' % i], p['res.%d.bias' % i], 'relu', 'a' if i == 4 else None))
        prev = 'h%d' % i
    w = np.concatenate([p['last.weight'], to_k(pad_in(p['anchor.weight'], 4), 5)], 1)
    L.append(layer([{'t': prev, 'f': 0, 'c': 16}, X], 'o', w, p['last.bias'] + p['anchor.bias']))
    models['sesr_m5'] = {'kind': 'rgb', 'pad': 'zero', 'layers': L, 'final': 'o'}
    p = W['xlsr']; L = []
    L.append(layer([X], 'r', pad_in(p['residual.weight'], 4), p['residual.bias']))
    L.append(layer([X], 'c0', pad_in(p['cnn.0.weight'], 4), p['cnn.0.bias'], 'relu'))
    L.append(layer([{'t': 'c0', 'f': 0, 'c': 32}], 'c1', p['cnn.2.weight'], p['cnn.2.bias']))
    prev = 'c1'
    for i in (3, 4, 5):
        L.append(layer([{'t': prev, 'f': 0, 'c': 32}], 'g%da' % i, grouped_dense(p['cnn.%d.net.0.weight' % i], 4), p['cnn.%d.net.0.bias' % i], 'relu'))
        L.append(layer([{'t': 'g%da' % i, 'f': 0, 'c': 32}], 'g%d' % i, p['cnn.%d.net.2.weight' % i], p['cnn.%d.net.2.bias' % i]))
        prev = 'g%d' % i
    L.append(layer([{'t': prev, 'f': 0, 'c': 32}, {'t': 'r', 'f': 0, 'c': 16}], 't0', p['tail.0.weight'], p['tail.0.bias'], 'relu'))
    L.append(layer([{'t': 't0', 'f': 0, 'c': 32}], 'o', p['tail.2.weight'], p['tail.2.bias']))
    models['xlsr'] = {'kind': 'rgb', 'pad': 'zero', 'layers': L, 'final': 'o'}
    return models

NUM = r'[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?'

def anime4k(path):
    text = open(path).read()
    blocks = re.split(r'\n(?=//!DESC)', text)[1:]
    L, final = [], None
    for blk in blocks:
        save = re.search(r'//!SAVE (\S+)', blk).group(1)
        if 'Depth-to-Space' in blk:
            final = re.search(r'//!BIND (conv2d\S*)', blk).group(1); continue
        defs = {}
        for m in re.finditer(r'#define go_(\d+)\(x_off, y_off\) \((.*)\)\s*$', blk, re.M):
            body = m.group(2); name = re.search(r'(\w+)_texOff', body).group(1)
            f = 2 if 'max(-(' in body else 1 if body.startswith('max(') else 0
            defs[int(m.group(1))] = ('x' if name == 'MAIN' else name, f)
        for m in re.finditer(r'#define g_(\d+) \((.*)\)\s*$', blk, re.M):   # 1x1 layers: no offsets
            body = m.group(2); name = re.search(r'(\w+)_tex\(', body).group(1)
            f = 2 if 'max(-(' in body else 1 if body.startswith('max(') else 0
            defs[int(m.group(1))] = ('x' if name == 'MAIN' else name, f)
        order = sorted(defs)
        taps = {}
        bias = np.zeros(4, np.float32)
        for m in re.finditer(r'mat4\((' + NUM + r'(?:,\s*' + NUM + r'){15})\)\s*\*\s*go_(\d+)\((' + NUM + r'),\s*(' + NUM + r')\)', blk):
            vals = np.array([float(v) for v in m.group(1).split(',')], np.float32).reshape(4, 4)  # column i = input i
            taps[(int(m.group(2)), int(float(m.group(3))), int(float(m.group(4))))] = vals.T             # [out][in]
        for m in re.finditer(r'mat4\((' + NUM + r'(?:,\s*' + NUM + r'){15})\)\s*\*\s*g_(\d+)\b', blk):
            vals = np.array([float(v) for v in m.group(1).split(',')], np.float32).reshape(4, 4)
            taps[(int(m.group(2)), 0, 0)] = vals.T
        mb = re.search(r'result \+= vec4\((' + NUM + r'(?:,\s*' + NUM + r'){3})\);', blk)
        if mb: bias = np.array([float(v) for v in mb.group(1).split(',')], np.float32)
        r = max(max(abs(dx), abs(dy)) for (_, dx, dy) in taps); k = 2 * r + 1
        w = np.zeros((4, 4 * len(order), k, k), np.float32)
        for (g, dx, dy), m4 in taps.items():
            gi = order.index(g); w[:, gi * 4:gi * 4 + 4, dy + r, dx + r] = m4
        ins = [{'t': defs[g][0], 'f': defs[g][1], 'c': 4} for g in order]
        L.append(layer(ins, save, w, bias))
    return {'kind': 'luma', 'pad': 'clamp', 'layers': L, 'final': final}

def main():
    models = aimet()
    models['anime4k_s'] = anime4k(os.path.join(SRC, 'anime4k', 'Anime4K_Upscale_CNN_x2_S.glsl'))
    models['anime4k_m'] = anime4k(os.path.join(SRC, 'anime4k', 'Anime4K_Upscale_CNN_x2_M.glsl'))
    names = {'sesr_m5': 'SESR-M5', 'quicksrnet_small': 'QuickSRNet small', 'quicksrnet_medium': 'QuickSRNet medium',
             'xlsr': 'XLSR', 'anime4k_s': 'Anime4K S', 'anime4k_m': 'Anime4K M'}
    for k, m in models.items(): m['name'] = names[k]
    body = json.dumps(models, separators=(',', ':'))
    with open(OUT, 'w') as f:
        f.write('/* Press Play AI upscalers, generated by tools/build_sr_models.py. Do not edit by hand.\n'
                '   QuickSRNet, XLSR, SESR-M5 weights: Qualcomm AIMET model zoo (BSD-3-Clause). SESR design: ARM (Apache-2.0).\n'
                '   Anime4K: Copyright (c) 2019-2021 bloc97 (MIT). Full notices: CREDITS.txt */\n'
                'window.PP_SR_MODELS=' + body + ';\n')
    for k, m in models.items():
        print(k, len(m['layers']), 'layers', [(l['out'], l['o'], l['k'], len(l['ins'])) for l in m['layers']])
    print('wrote', OUT, os.path.getsize(OUT), 'bytes')

if __name__ == '__main__':
    main()
