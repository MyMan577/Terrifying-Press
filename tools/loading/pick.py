# Picks the busiest frame per game (most edge detail) and makes a contact sheet.
import glob, os, sys
from PIL import Image, ImageFilter, ImageStat
D = sys.argv[1]
best = {}
for f in sorted(glob.glob(os.path.join(D, 'shots', '*.png'))):
    name = os.path.basename(f).rsplit('-', 1)[0]
    im = Image.open(f).convert('L').resize((320, 320))
    score = ImageStat.Stat(im.filter(ImageFilter.FIND_EDGES)).mean[0]
    if name not in best or score > best[name][0]:
        best[name] = (score, f)
thumbs = []
for name, (score, f) in sorted(best.items()):
    im = Image.open(f).convert('RGB')
    im.save(os.path.join(D, 'scene-%s.png' % name))
    t = im.copy(); t.thumbnail((380, 380)); thumbs.append(t)
    print(name, round(score, 1), os.path.basename(f))
W = sum(t.width for t in thumbs) + 10 * (len(thumbs) + 1); H = max(t.height for t in thumbs) + 20
sheet = Image.new('RGB', (W, H), (20, 20, 26)); x = 10
for t in thumbs: sheet.paste(t, (x, 10)); x += t.width + 10
sheet.save(os.path.join(D, 'scenes-sheet.png'))
