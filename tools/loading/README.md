# Loading-screen shots

`scenes.js` stages an action moment in each game and takes a burst of shots;
`pick.py` keeps the busiest frame per game. Some final picks were chosen by eye
(Obby frame 12, Toque frame 15 with Kanata on the shore, Ante Up frame 3).

    cd www && python3 -m http.server 8765 &
    node tools/loading/scenes.js /tmp/shots-dir [game ...]   # needs /tmp/shots-dir/shots/
    python3 tools/loading/pick.py /tmp/shots-dir

Obby uses `obby-showcase.json` (copy it into the shots dir first). The chosen
frame is saved as `www/games/<game>/loading.jpg` (JPEG, max 1830px).

Icons: `node tools/icons/render.js tools/icons/<game>.svg www/games/<game>/icon.png`
