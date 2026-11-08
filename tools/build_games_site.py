#!/usr/bin/env python3
"""Build the Press Play games website (GitHub Pages) from the app's own files.

web/index.html is the page shell. Its PP:... slots are filled from www/index.html:
  PP:games-style    the Games screen's CSS        (<style id="pp-games-style">)
  PP:games-js       the Games screen's script     (<script id="pp-games-js">)
  PP:clicker        the Disc Clicker side game    (its self-contained block)
  PP:shared-scripts pp-points.js and the Playground scripts, in the app's order
Then www/games and those scripts are copied next to it. The shell sets window.__ppWeb,
which makes the shared scripts leave out everything that needs the media player.

Every piece must be found exactly once, so a change in the app that moves one fails
the build instead of shipping a broken site.

usage: build_games_site.py <output folder>
"""
import hashlib, os, re, shutil, subprocess, sys, tempfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
WWW = os.path.join(ROOT, 'www')
SHELL = os.path.join(ROOT, 'web', 'index.html')


def die(msg):
    sys.exit('build_games_site: ' + msg)


def one(s, pattern, what):
    found = re.findall(pattern, s, re.S)
    if len(found) != 1:
        die('expected 1 %s in www/index.html, found %d' % (what, len(found)))
    return found[0]


def main():
    if len(sys.argv) != 2:
        die('usage: build_games_site.py <output folder>')
    out = sys.argv[1]
    app = open(os.path.join(WWW, 'index.html'), encoding='utf-8').read()

    style = one(app, r'<style id="pp-games-style">.*?</style>', 'Games screen style')
    games_js = one(app, r'<script id="pp-games-js">.*?</script>', 'Games screen script')
    # Disc Clicker: from its banner comment to the end of its IIFE, which is the first
    # "  })();" line after window.PPClicker is defined.
    start = one(app, r'\n(  /\* =+\n     Disc Clicker, small isolated side-game\.)', 'Disc Clicker start')
    a = app.index(start)
    b = app.find('window.PPClicker = {', a)
    if b < 0:
        die('window.PPClicker not found after the Disc Clicker start')
    end = app.find('\n  })();\n', b)
    if end < 0:
        die('end of the Disc Clicker block not found')
    clicker = '<script>\n' + app[a:end + len('\n  })();')] + '\n</script>'

    # The shared scripts, in the order the app loads them, with a content hash so browsers pick up new versions.
    names = re.findall(r'<script src="\./(pp-[a-z-]+\.js)\?v=[^"]*"></script>', app)
    want = ['pp-points.js', 'pp-playground.js', 'pp-playground-album.js', 'pp-playground-lab.js', 'pp-playground-stars.js']
    if sorted(names) != sorted(want):
        die('the app loads %s, expected %s. Update this script if a Games script was added or removed.' % (names, want))

    def tag(n):
        h = hashlib.sha1(open(os.path.join(WWW, n), 'rb').read()).hexdigest()[:10]
        return '<script src="%s?v=%s"></script>' % (n, h)
    shared = '\n'.join(tag(n) for n in names)

    page = open(SHELL, encoding='utf-8').read()
    for slot, html in (('games-style', style), ('games-js', games_js), ('clicker', clicker), ('shared-scripts', shared)):
        mark = '<!--PP:%s-->' % slot
        if page.count(mark) != 1:
            die('web/index.html must contain %s exactly once' % mark)
        page = page.replace(mark, html)

    if os.path.exists(out):
        shutil.rmtree(out)
    os.makedirs(out)
    open(os.path.join(out, 'index.html'), 'w', encoding='utf-8').write(page)
    shutil.copytree(os.path.join(WWW, 'games'), os.path.join(out, 'games'))
    for n in names:
        shutil.copy2(os.path.join(WWW, n), out)
    open(os.path.join(out, '.nojekyll'), 'w').close()   # serve the files as they are

    # every game the Games screen lists must be there
    for gid in re.findall(r"\{ id:'([a-z]+)'", games_js):
        if not os.path.isfile(os.path.join(out, 'games', gid, 'index.html')):
            die('the Games screen lists %s but www/games/%s/index.html is missing' % (gid, gid))

    # syntax-check the page's inline scripts and the shared scripts when Node is available
    if shutil.which('node'):
        blocks = re.findall(r'<script>(.*?)</script>', page, re.S) + re.findall(r'<script id="pp-games-js">(.*?)</script>', page, re.S)
        files = [os.path.join(out, n) for n in names]
        with tempfile.TemporaryDirectory() as tmp:
            for i, code in enumerate(blocks):
                p = os.path.join(tmp, 'inline%d.js' % i)
                open(p, 'w', encoding='utf-8').write(code)
                files.append(p)
            for p in files:
                r = subprocess.run(['node', '--check', p], capture_output=True, text=True)
                if r.returncode:
                    die('syntax error in %s:\n%s' % (os.path.basename(p), r.stderr))
    print('games site built in %s (%d games)' % (out, len(re.findall(r"\{ id:'([a-z]+)'", games_js))))


if __name__ == '__main__':
    main()
