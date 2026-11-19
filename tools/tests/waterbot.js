const { chromium, devices } = require('playwright');
(async () => {
  const b = await chromium.launch();
  const [stage, skipsJson] = [Number(process.argv[2]), process.argv[3] || '[]'];
  const skips = JSON.parse(skipsJson);
  for (const dash of [false]) {
    const p = await (await b.newContext({ ...devices['iPhone 13 landscape'] })).newPage();
    const errs = []; p.on('pageerror', e => errs.push(e.message));
    await p.goto('file:///home/user/make-games/game/index.html'); await p.waitForTimeout(300);
    const r = await p.evaluate(({ stage, dash, skips }) => new Promise(res => {
      const g = __game; g.enterStage(stage);
      const P = g.player, T = 16;
      const L = () => g.level;
      const solid = (x, y) => y >= 0 && y < 12 && x >= 0 && x < L()[0].length && '#BPUIQC'.includes(L()[y][x]);
      let deaths = 0, lastX = 0, holdT = 0, t0 = performance.now(), swimT = 0, maxX = 0;
      g.keys.right = true; g.keys.dash = dash; g.run.lives = 99; let hits = [], hurtSeen = false;
      const water = !!g.levelDef.water;
      const iv = setInterval(() => {
        g.run.invT = 0; g.run.time = 999; g.run.lives = 99; g.run.hearts = 3;
        for (let i = g.enemies.length - 1; i >= 0; i--) if (g.enemies[i].kind === 'sakana') g.enemies.splice(i, 1);
        if (g.run.hurtT > 1.4 && !hurtSeen) { hurtSeen = true; hits.push(Math.round(P.x / T)); } if (g.run.hurtT <= 0) hurtSeen = false;
        if (P.x < lastX - 100) deaths++;
        lastX = P.x; maxX = Math.max(maxX, P.x);
        for (const [a, z] of skips) if (P.x > a * T && P.x < z * T) { P.x = z * T + 4; P.y = 100; P.vy = 0; }
        const fx = Math.floor((P.x + P.w + 6) / T), feet = Math.floor((P.y + P.h - 1) / T);
        if (water) {
          // 泳ぎ：前の2列で通れる行のまん中をめざす
          let best = null;
          // 前の3列すべてで通れる行（共通部分）のうち、いまの高さに近いまとまりをめざす
          const free = [];
          for (let y = 2; y <= 9; y++) if (!solid(fx - 1, y) && !solid(fx, y) && !solid(fx + 1, y) && !solid(fx + 2, y)) free.push(y);
          if (free.length) {
            const groups = []; let cur = [free[0]];
            for (let i = 1; i < free.length; i++) { if (free[i] === free[i - 1] + 1) cur.push(free[i]); else { groups.push(cur); cur = [free[i]]; } }
            groups.push(cur);
            const pr = (P.y + P.h / 2) / T;
            groups.sort((a, b) => Math.abs((a[0] + a[a.length - 1]) / 2 - pr) - Math.abs((b[0] + b[b.length - 1]) / 2 - pr));
            const gsel = groups.find(gr => gr.length >= 2) || groups[0];
            best = (gsel[0] + gsel[gsel.length - 1]) / 2 + 0.5;
          }
          const target = best === null ? 6 : Math.min(best, 8.6);
          swimT--;
          const want = (P.y + P.h / 2) / T > target + 0.5 && P.vy > -40;
          g.keys.jump = want && swimT <= 0 ? !g.keys.jump : false;
          if (g.keys.jump) swimT = 8;
          // 電気の門：通りぬける間ずっと消えているときだけ進む
          let go = true;
          for (const tr of g.traps) {
            if (tr.type !== 'zap') continue;
            const x0 = tr.x * T + 5, x1 = tr.x * T + 11, front = P.x + P.w;
            if (x0 - front > 16 || x1 < P.x || front > x0 - 1) continue;
            const tIn = Math.max(0, (x0 - front) / 68), tOut = (x1 - P.x + 2) / 68;
            for (let t = tIn; t <= tOut + 0.05; t += 0.02) { const ph = ((g.trapClock + t + tr.phase) % tr.period + tr.period) % tr.period; if (ph < tr.on + 0.05 || ph > tr.period - 0.05) { go = false; break; } }
          }
          g.keys.right = go;
        } else {
          let wall = false; for (let y = feet - 3; y <= feet; y++) if (solid(fx, y) || solid(fx + 1, y)) wall = true;
          const below = Math.floor((P.y + P.h + 2) / T);
          const gap = !solid(fx, below) && !solid(fx + 1, below) && !solid(fx, below + 1) && !(L()[below] && L()[below][fx] === '=') && !solid(fx, 10) && !solid(fx + 1, 10);
          if (P.onGround && (wall || gap) && holdT <= 0 && !g.keys.jump) holdT = 22;
          g.keys.jump = holdT > 0; holdT--;
        }
        g.sync();
        if (g.state === 'clear' || g.state === 'goal' || performance.now() - t0 > 70000) {
          clearInterval(iv); res({ state: g.state, maxX: Math.round(maxX / T), hits: hits.join(','), deaths, secs: Math.round((performance.now() - t0) / 1000) });
        }
      }, 16);
    }), { stage, dash, skips });
    console.log(stage, dash ? 'DASH' : 'WALK', JSON.stringify(r), errs.slice(0, 2));
  }
  await b.close();
})();
