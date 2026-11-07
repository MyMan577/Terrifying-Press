"""Small helpers shared by the slim_*.py game builders. Every edit must match
exactly once, so a change in the source game fails loudly instead of silently."""
import re, sys

class Doc:
    def __init__(self, path):
        self.s = open(path, encoding='utf-8').read()
        self.start_lines = self.s.count('\n')

    def sub(self, old, new, count=1):
        n = self.s.count(old)
        if n != count:
            sys.exit('expected %d match(es), found %d: %r' % (count, n, old[:90]))
        self.s = self.s.replace(old, new)

    def cut(self, start, end, keep_end=False):
        """Remove from the first `start` through the next `end` (inclusive unless keep_end)."""
        if self.s.count(start) < 1:
            sys.exit('start not found: %r' % start[:90])
        a = self.s.index(start)
        b = self.s.find(end, a + len(start))
        if b < 0: sys.exit('end not found after start: %r' % end[:90])
        self.s = self.s[:a] + self.s[b if keep_end else b + len(end):]

    def cut_line(self, needle, count=1):
        """Remove whole lines containing needle."""
        lines = self.s.split('\n')
        keep = [l for l in lines if needle not in l]
        if len(lines) - len(keep) != count:
            sys.exit('expected %d line(s) with %r, found %d' % (count, needle[:80], len(lines) - len(keep)))
        self.s = '\n'.join(keep)

    def text(self, pairs):
        """[prefix, new] pairs: replace the whole HTML text node or JS string
        literal that starts with prefix."""
        for prefix, new in pairs:
            i = self.s.find(prefix)
            if i < 0: sys.exit('text not found: %r' % prefix[:80])
            q = self.s[i - 1]
            if q in "'\"`":
                j = i
                while True:
                    j = self.s.index(q, j)
                    if self.s[j - 1] != '\\': break
                    j += 1
                rep = new.replace(q, '\\' + q) if q != '`' else new
            else:
                j = self.s.index('<', i)
                rep = new
            self.s = self.s[:i] + rep + self.s[j:]

    def save(self, path):
        open(path, 'w', encoding='utf-8').write(self.s)
        print('%s: %d -> %d lines' % (path, self.start_lines, self.s.count('\n')))
