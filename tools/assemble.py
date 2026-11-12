#!/usr/bin/env python3
"""Builds the two big app files from their parts in src/.

  www/index.html          <- src/index.html, with every "@@include path@@" line replaced by that file (paths are relative to src/)
  www/vocal-separator.js  <- every file in src/vocal-separator/, joined in name order

The parts are plain cuts of the full files: joined back together they are the full file, byte for byte.
Most parts are pieces of one long script, so a part is not a complete program by itself. Check the built files, not the parts.

usage: python3 tools/assemble.py            build both files into www/
       python3 tools/assemble.py --check    exit 1 if www/ does not match the parts (nothing is written)
"""
import glob, os, re, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'src')
WWW = os.path.join(ROOT, 'www')
INCLUDE = re.compile(r'^@@include (\S+)@@\n', re.M)


def die(msg):
    sys.exit('assemble: ' + msg)


def read(path):
    if not os.path.isfile(path):
        die('missing part: ' + os.path.relpath(path, ROOT))
    with open(path, encoding='utf-8', newline='') as f:
        text = f.read()
    if not text.endswith('\n'):
        die(os.path.relpath(path, ROOT) + ' must end with a newline')
    return text


def build_index():
    shell = read(os.path.join(SRC, 'index.html'))
    used = set()

    def fill(m):
        rel = m.group(1)
        if rel in used:
            die(rel + ' is included twice in src/index.html')
        used.add(rel)
        return read(os.path.join(SRC, rel))

    page = INCLUDE.sub(fill, shell)
    if '@@include' in page:
        die('a part contains an @@include line; includes only work in src/index.html, one per line')
    on_disk = set()
    for base, _, files in os.walk(os.path.join(SRC, 'index')):
        for name in files:
            on_disk.add(os.path.relpath(os.path.join(base, name), SRC).replace(os.sep, '/'))
    unused = sorted(on_disk - used)
    if unused:
        die('not included anywhere in src/index.html: ' + ', '.join(unused))
    return page


def build_separator():
    parts = sorted(glob.glob(os.path.join(SRC, 'vocal-separator', '*.js')))
    if not parts:
        die('no parts in src/vocal-separator/')
    return ''.join(read(p) for p in parts)


def main():
    check = '--check' in sys.argv[1:]
    bad = 0
    for name, text in (('index.html', build_index()), ('vocal-separator.js', build_separator())):
        out = os.path.join(WWW, name)
        if check:
            same = os.path.isfile(out) and open(out, encoding='utf-8', newline='').read() == text
            print('%s www/%s' % ('ok      ' if same else 'DIFFERS ', name))
            bad += not same
        else:
            with open(out, 'w', encoding='utf-8', newline='') as f:
                f.write(text)
            print('built www/%s (%d bytes)' % (name, len(text.encode('utf-8'))))
    sys.exit(1 if bad else 0)


if __name__ == '__main__':
    main()
