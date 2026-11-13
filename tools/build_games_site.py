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

    # Cache-busting for the games: GitHub Pages lets browsers keep files for 10 minutes (phones often longer),
    # so a game's page and scripts kept loading old copies after a publish. In the site copy only, every local
    # script and stylesheet a game page loads gets ?v=<content hash>, and the Games screen opens each game page
    # with ?v=<hash of the whole game folder>. A changed file gets a new URL; an unchanged one stays cached.
    def fhash(path):
        return hashlib.sha1(open(path, 'rb').read()).hexdigest()[:10]
    game_ver = {}
    gdir = os.path.join(out, 'games')
    for gid in sorted(os.listdir(gdir)):
        page_path = os.path.join(gdir, gid, 'index.html')
        if not os.path.isfile(page_path):
            continue
        html = open(page_path, encoding='utf-8').read()
        def stamp(m):
            attr, url = m.group(1), m.group(2)
            if re.match(r'(?:[a-z]+:|//|#)', url) or '?' in url:
                return m.group(0)
            f = os.path.normpath(os.path.join(gdir, gid, url))
            if not os.path.isfile(f):
                return m.group(0)
            return '%s="%s?v=%s"' % (attr, url, fhash(f))
        html = re.sub(r'(<script[^>]*\bsrc)="([^"]+)"', stamp, html)
        html = re.sub(r'(<link[^>]*\bhref)="([^"]+\.css)"', stamp, html)
        open(page_path, 'w', encoding='utf-8').write(html)
        h = hashlib.sha1()
        for root, _dirs, fnames in sorted(os.walk(os.path.join(gdir, gid))):
            for fn in sorted(fnames):
                h.update(fn.encode()); h.update(open(os.path.join(root, fn), 'rb').read())
        game_ver[gid] = h.hexdigest()[:10]
    def stamp_src(m):
        gid = m.group(1)
        return "src:'games/%s/index.html?v=%s'" % (gid, game_ver[gid]) if gid in game_ver else m.group(0)
    page = open(os.path.join(out, 'index.html'), encoding='utf-8').read()
    page, n = re.subn(r"src:'games/([a-z]+)/index\.html'", stamp_src, page)
    if n == 0:
        die("found no src:'games/<id>/index.html' in the Games screen script to version")
    open(os.path.join(out, 'index.html'), 'w', encoding='utf-8').write(page)

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
