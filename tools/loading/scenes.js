// Captures an action shot from each game for its Press Play loading screen.
// Each scene is set up, then shot several times; pick.py keeps the busiest frame.
const { chromium } = require('playwright');
const D = process.argv[2];
const only = process.argv.slice(3);
const base = 'http://localhost:8765/games/';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const CANVAS_ONLY = 'body *{visibility:hidden!important} canvas{visibility:visible!important}';
const P = { width: 412, height: 915 }, L = { width: 915, height: 412 };

const scenes = {
  obby: { vp: L, async setup(p) {
    await p.goto(base + 'obby/index.html'); await sleep(2500);
    const json = require('fs').readFileSync(D + '/obby-showcase.json', 'utf8');
    await p.evaluate(j => { window._importLevel(j); window._setMode('play'); }, json);
    await sleep(600);
    await p.evaluate(() => { const s = document.getElementById('sidebar'); if (s && getComputedStyle(s).display !== 'none') document.getElementById('menuToggle').click(); });
    await sleep(300);
    await p.keyboard.down('ArrowRight');
    return CANVAS_ONLY;
  }, async step(p, i) { if (i % 4 === 0) await p.keyboard.press('Space'); }, frames: 24, gap: 140 },

  toque: { vp: L, async setup(p) {
    await p.goto(base + 'toque/index.html'); await sleep(400);
    return 'body *{visibility:hidden!important} canvas{visibility:visible!important}';
  }, frames: 30, gap: 1000 },

  weaponball: { vp: { width: 1500, height: 1000 }, async setup(p) {
    await p.goto(base + 'weaponball/index.html'); await sleep(1200);
    await p.evaluate(() => { document.getElementById('btn4way').click(); });
    await sleep(200);
    await p.evaluate(() => {
      const want = ['necromancer', 'hivequeen', 'echomancer', 'arcanist', 'phoenix', 'swarm', 'pyro', 'laser'];
      const pick = want.map(w => BALL_TYPES.find(b => b.id.toLowerCase().includes(w))).filter(Boolean);
      ['red', 'blue', 'green', 'orange'].forEach((s, i) => selectType(s, (pick[i] || BALL_TYPES[i * 7]).id));
      document.getElementById('btnStart').click();
    });
    await sleep(6000);
    return null;
  }, element: 'canvas', frames: 14, gap: 500 },

  anteup: { vp: P, async setup(p) {
    await p.goto(base + 'anteup/index.html'); await sleep(1500);
    // stage a big hand: four Kings, then play it and shoot the scoring
    await p.evaluate(() => {
      const suits = [...new Set(state.hand.map(c => c.suit))];
      state.hand.slice(0, 4).forEach((c, i) => { c.rank = 'K'; c.suit = suits[i % suits.length]; });
      state.selected = state.hand.slice(0, 4).map(c => c.id);
      render();
    });
    await sleep(400);
    await p.evaluate(() => playHand());
    return null;
  }, frames: 18, gap: 140 },

  lastcard: { vp: P, async setup(p) {
    await p.goto(base + 'lastcard/index.html'); await sleep(1200);
    await p.evaluate(() => { newGame(); });
    await sleep(2500);
    await p.evaluate(() => { document.querySelectorAll('#ck,#fx,#fxp,.side,#effects').forEach(e => { e.hidden = true; }); const x = document.getElementById('fxx'); x && x.click(); });
    return null;
  }, frames: 12, gap: 450 },

  blob: { vp: L, async setup(p) {
    await p.goto(base + 'blob/index.html'); await sleep(1200);
    // 4 teams of 2, all bots
    await p.evaluate(() => {
      document.getElementById('suc').click();
      CFG.nt = 4; CFG.nw = 1; CFG.bots = [0,1,2,3].map(() => [0]); CFG.timer = 0;
      init();
    });
    await sleep(1500);
    // line all 8 blobs up on the flattest stretch of ground, colours mixed,
    // with the blob whose turn it is in the middle (the camera follows it)
    await p.evaluate(() => {
      const gy = x => { let y = 0; while (y < WL && !solid(x, y)) y++; return y; };
      let best = null;
      for (let x = 200; x < W - 640; x += 20) {
        const ys = []; for (let k = 0; k < 9; k++) ys.push(gy(x + k * 50));
        const spread = Math.max(...ys) - Math.min(...ys);
        if (Math.max(...ys) < WL - 30 && (!best || spread < best.s)) best = { x, s: spread };
      }
      const order = teams.map(t => t.w[0]);
      const cur = me(); const ci = order.indexOf(cur); if (ci >= 0) { order.splice(ci, 1); order.splice(1, 0, cur); }
      order.forEach((w, k) => { w.x = best.x + 30 + k * 120; w.y = gy(w.x) - 12; w.vx = 0; w.vy = 0; w.dir = k < 2 ? 1 : -1; });
      window.__grp = { x: best.x, order };
    });
    await sleep(2000);
    await p.evaluate(() => { document.getElementById('zi').click(); document.getElementById('zi').click(); });
    await sleep(600);
    await p.evaluate(() => {
      const { x, order } = window.__grp;
      const gy = x => { let y = 0; while (y < WL && !solid(x, y)) y++; return y; };
      for (let k = -2; k < 15; k++) { const fx0 = x + k * 30; if ([1, 5, 9, 13].includes(k)) continue; fires.push({ x: fx0, y: gy(fx0), e: fr + 900, o: order[0], big: 1 }); }
      fts.push({ w: order[0], t: 90, a: 8, d: 1 }); fts.push({ w: order[3], t: 90, a: 8, d: -1 });
      for (let i = 0; i < 3; i++) { const bx = x + 90 + i * 120; boom(bx, gy(bx) + 6, 12, 0, order[0]); }
    });
    await sleep(500);
    return CANVAS_ONLY;
  }, element: 'canvas', frames: 10, gap: 180 },

  bastion: { vp: P, async setup(p) {
    await p.goto(base + 'bastion/index.html'); await sleep(1500);
    await p.evaluate(() => { const ids = ['knight', 'hogrider', 'pekka', 'musket', 'babydragon', 'valkyrie', 'wizard', 'goblingang']; playerDeck.length = 0; ids.forEach(i => playerDeck.push(CARDS.find(c => c.id === i))); startFromPicker(); });
    await sleep(1200);
    await p.evaluate(() => {
      const mine = ['pekka', 'valkyrie', 'wizard', 'babydragon', 'musket', 'knight', 'goblingang'];
      const theirs = ['megaknight', 'witch', 'electrowizard', 'infernodragon', 'archers', 'minionhorde', 'skelarmy'];
      const cx = 206, my = 520, ty = 360;
      mine.forEach((id, i) => { const c = CARDS.find(x => x.id === id); try { playCard(c, cx - 120 + (i % 4) * 80, my + (i > 3 ? 40 : 0), 'player'); } catch (e) {} });
      theirs.forEach((id, i) => { const c = CARDS.find(x => x.id === id); try { playCard(c, cx - 120 + (i % 4) * 80, ty - (i > 3 ? 40 : 0), 'enemy'); } catch (e) {} });
    });
    await sleep(3500);
    return null;
  }, frames: 14, gap: 350 },
};

(async () => {
  const b = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  for (const [name, sc] of Object.entries(scenes)) {
    if (only.length && !only.includes(name)) continue;
    const p = await b.newPage({ viewport: sc.vp, hasTouch: true, deviceScaleFactor: 2 });
    p.on('dialog', d => d.dismiss());
    try {
      const css = await sc.setup(p);
      if (css) await p.addStyleTag({ content: css });
      const n = sc.frames || 12;
      for (let i = 0; i < n; i++) {
        if (sc.step) await sc.step(p, i);
        await sleep(sc.gap || 400);
        const path = `${D}/shots/${name}-${String(i).padStart(2, '0')}.png`;
        if (sc.element) await (await p.$(sc.element)).screenshot({ path }); else await p.screenshot({ path });
      }
      console.log(name, 'ok');
    } catch (e) { console.log(name, 'FAILED', e.message.split('\n')[0]); }
    await p.close();
  }
  await b.close();
})();
