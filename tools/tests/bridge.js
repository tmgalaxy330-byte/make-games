const { chromium, devices } = require('playwright');
(async () => {
  const b = await chromium.launch();
  const p = await (await b.newContext({ ...devices['iPhone 13 landscape'] })).newPage();
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto('file:///home/user/make-games/game/index.html'); await p.waitForTimeout(400);
  const cfg = JSON.parse(process.argv[2]);
  const out = [];
  for (const dash of [false, true]) for (const off of cfg.offs) {
    const r = await p.evaluate(({ stage, startX, edge, land, dash, off }) => new Promise(res => {
      const g = __game; g.enterStage(stage); g.run.lives = 99; g.run.time = 999; g.run.invT = 0;
      const P = g.player; P.x = startX * 16; P.y = 160 - P.h; P.vx = 0;
      g.keys.right = true; g.keys.dash = dash; g.sync();
      let jumped = false, t0 = performance.now(), stomps = 0, lastVy = 0;
      const iv = setInterval(() => {
        if (!jumped && P.x >= (edge + off) * 16) { g.keys.jump = true; g.sync(); jumped = true; }
        if (P.vy < -200 && lastVy >= 0 && jumped) stomps++;
        if (jumped && !P.onGround) {
          // 空中で次の雲にねらいを合わせる（ふつうのプレイヤーの操作をまねる）
          const cx = P.x + P.w / 2;
          const hv = g.enemies.filter(e => e.kind === 'hover' && !e.dead && e.x + 6 > cx - 8).sort((a, b) => a.x - b.x)[0];
          let want = 1;
          if (hv && P.vy > -60) { const tx = hv.x + 6; want = cx < tx - 3 ? 1 : cx > tx + 3 ? -1 : 0; }
          g.keys.right = want > 0; g.keys.left = want < 0; g.sync();
        }
        lastVy = P.vy;
        const done = (P.x > land * 16 && P.onGround) || P.y > 200 || g.state !== 'play' || performance.now() - t0 > 6000;
        if (done) { clearInterval(iv); g.keys.right = false; g.keys.left = false; g.keys.jump = false; g.keys.dash = false; g.sync();
          res({ ok: P.x > land * 16 && P.onGround, x: +(P.x / 16).toFixed(1), stomps }); }
      }, 16);
    }), { ...cfg, dash, off });
    out.push(`${dash ? 'DASH' : 'WALK'} off=${off}: ${r.ok ? 'OK' : 'NG'} x=${r.x} stomps=${r.stomps}`);
  }
  console.log(out.join('\n'), errs);
  await b.close();
})();
