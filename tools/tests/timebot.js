const { chromium, devices } = require('playwright');
// 動く足場を「待って」から跳ぶボット。むてき状態でステージを最後まで進めるかをしらべる
(async () => {
  const b = await chromium.launch();
  const stage = Number(process.argv[2]); const skips = JSON.parse(process.argv[3] || '[]');
  const modes = (process.argv[4] || 'walk,dash').split(',');
  for (const mode of modes) {
    const p = await (await b.newContext({ ...devices['iPhone 13 landscape'] })).newPage();
    const errs = []; p.on('pageerror', e => errs.push(e.message));
    await p.goto('file:///home/user/make-games/game/index.html'); await p.waitForTimeout(300);
    const r = await p.evaluate(({ stage, skips, dash }) => new Promise(res => {
      const g = __game; g.enterStage(stage); if (g.state === 'dialog') g.enterStage(stage);
      const P = g.player, T = 16, L = () => g.level;
      const solid = (x, y) => y >= 0 && y < 12 && x >= 0 && x < L()[0].length && '#BPUIQCD<>'.includes(L()[y][x]);
      const stand = (x, y) => (solid(x, y) || (L()[y] && L()[y][x] === '=')) && !solid(x, y - 1);
      let hits = [], hurtSeen = false, deaths = 0, lastX = 0, holdT = 0, t0 = performance.now(), maxX = 0, target = null, airT = 0;
      g.keys.dash = dash; g.sync();
      const iv = setInterval(() => {
        g.run.invT = 0; g.run.time = 999; g.run.lives = 99; g.run.hearts = 3;
        for (let i = g.enemies.length - 1; i >= 0; i--) if (g.enemies[i].kind !== 'hover') g.enemies.splice(i, 1);
        if (g.run.hurtT > 1.4 && !hurtSeen) { hurtSeen = true; hits.push(Math.round(P.x / T)); } if (g.run.hurtT <= 0) hurtSeen = false;
        if (P.x < lastX - 100) { deaths++; target = null; }
        lastX = P.x; maxX = Math.max(maxX, P.x);
        for (const [a, z] of skips) if (P.x > a * T && P.x < z * T) { P.x = z * T + 4; P.y = 100; P.vy = 0; }
        const cx = P.x + P.w / 2, feetY = P.y + P.h;
        const movers = g.movers || [];
        let right = true, jump = false;
        if (P.onGround) {
          target = null; airT = 0;
          // 前に足場があるか（4px先）
          const aheadX = Math.floor((P.x + P.w + 4) / T), footRow = Math.floor((feetY + 1) / T);
          const groundAhead = stand(aheadX, footRow) || solid(aheadX, footRow) || movers.some(m => P.onMover === m && P.x + P.w + 4 < m.x + m.w);
          // 前のかべ
          const fx = Math.floor((P.x + P.w + 6) / T), feetRow = Math.floor((feetY - 1) / T);
          let wallH = 0; for (let k = 0; k < 6; k++) { if (solid(fx, feetRow - k)) wallH = k + 1; else break; }
          const door = L()[feetRow] && L()[feetRow][fx] === 'D';
          if (!groundAhead) {
            // 穴：着地できる場所をさがす
            const cands = [];
            for (const m of movers) if (m !== P.onMover && m.x + m.w > P.x + P.w - 2) cands.push({ m, x: Math.min(m.x + m.w / 2, m.x + 12), y: m.y, mover: true });
            for (let c = aheadX; c < aheadX + 6; c++) for (let rr = footRow - 3; rr <= 10; rr++) if (stand(c, rr)) { cands.push({ x: c * T + 5, y: rr * T, col: c }); break; }
            cands.sort((a, b2) => a.x - b2.x);
            const reach = dash ? 6 * T : 3.6 * T;
            const ok = c => c.x - cx <= reach && c.x - cx > -4 && feetY - c.y <= 46; const t = cands.find(c => ok(c) && c.y - feetY < 90) || cands.find(c => ok(c) && !c.mover && c.y - feetY < 140);
            if (t) { target = t; jump = true; holdT = 22; }
            else right = false;                 // とどかない：ふちで待つ
          } else if (wallH > 0 && wallH <= 3 && !door) { jump = true; holdT = 22; }
          else if (wallH > 3 && !door) {
            // 高いかべ：近くの上下に動く板が下りてきたら飛び乗る
            const m = movers.find(m => m !== P.onMover && m.x < P.x + P.w + 3 * T && m.x + m.w > P.x - T);
            if (m && feetY - m.y <= 50 && feetY - m.y > 4) { target = { m, mover: true, x: m.x + m.w / 2, y: m.y }; jump = true; holdT = 22; }
            else right = false;
          }
          else if (door) right = true;
        } else {
          airT++;
          if (target) {
            const tx = target.mover ? target.m.x + target.m.w / 2 : target.x;
            right = cx < tx - 3; const left = cx > tx + 3 && P.vy > -50;
            g.keys.left = left;
            if (!right && !left) { /* そのまま */ }
          }
        }
        if (holdT > 0) { holdT--; g.keys.jump = holdT > 0 && (jump || airT > 0 || true); } else g.keys.jump = false;
        if (jump) g.keys.jump = true;
        // ---- しかけの前で「今入ったら安全か」を予測して、だめなら待つ
        if (right && P.onGround) {
          const clock = g.trapClock;
          const tm = tr => { const up = Math.min(1.0, tr.period * 0.45); return { rise: 0.15, lower: 0.2, up, down: tr.period - 0.35 - up }; };
          const pf = (tr, t) => { const q = tm(tr), ph = ((t + tr.phase) % tr.period + tr.period) % tr.period;
            if (ph < q.down) return 0; if (ph < q.down + q.rise) return (ph - q.down) / q.rise; if (ph < q.down + q.rise + q.up) return 1; return 1 - (ph - q.down - q.rise - q.up) / q.lower; };
          const danger = (tr, t) => { const ph = ((t + tr.phase) % tr.period + tr.period) % tr.period;
            if (tr.type === 'piston') return pf(tr, t) > 0.05;
            if (tr.type === 'zap') return ph < tr.on + 0.05 || ph > tr.period - 0.05;
            if (tr.type === 'bolt') return ph > tr.period - 0.35;
            return false; };
          const bx = tr => tr.type === 'piston' ? [tr.x * T + 2, tr.x * T + 14] : tr.type === 'zap' ? [tr.x * T + 5, tr.x * T + 11] : [tr.x * T + 3, tr.x * T + 13];
          // 近くにならんだしかけは「ひとまとまり」として、全部を通りぬける間ずっと安全かを調べる
          const hz = g.traps.filter(tr => ['piston', 'zap', 'bolt'].includes(tr.type) && !(tr.type === 'zap' && tr.row1 * T + T < P.y))
            .map(tr => ({ tr, b: bx(tr) })).filter(h => h.b[1] >= P.x).sort((p1, p2) => p1.b[0] - p2.b[0]);
          const front = P.x + P.w;
          if (hz.length && hz[0].b[0] - front <= 18) {
            const group = [hz[0]];
            for (let i = 1; i < hz.length; i++) { if (hz[i].b[0] - group[group.length - 1].b[1] < P.w + 10) group.push(hz[i]); else break; }
            const inside = front > group[0].b[0] - 1;
            if (!inside) {
              const ut = L()[Math.floor((feetY + 1) / T)] ? L()[Math.floor((feetY + 1) / T)][Math.floor(cx / T)] : '.';
              const beltAhead = L()[Math.floor((feetY + 1) / T)] ? L()[Math.floor((feetY + 1) / T)][Math.floor((group[0].b[0]) / T)] : '.';
              const belt = beltAhead === '>' ? 48 : beltAhead === '<' ? -48 : 0;
              const v = Math.max(30, 86 + belt);
              let bad = false;
              for (const h of group) {
                const tIn = Math.max(0, (h.b[0] - front) / v), tOut = (h.b[1] - P.x + 2) / v;
                for (let t = tIn; t <= tOut + 0.04; t += 0.02) if (danger(h.tr, clock + t)) { bad = true; break; }
                if (bad) break;
              }
              if (bad) right = false;
            }
          }
          // くずれる橋：風がふく予定なら、やむまで待つ
          const fr = Math.floor((feetY + 1) / T);
          const nx = Math.floor((P.x + P.w + 6) / T);
          if (right && L()[fr] && L()[fr][nx] === 'C' && L()[fr][Math.floor(cx / T)] !== 'C') {
            let n = 0; while (L()[fr][nx + n] === 'C') n++;
            const tCross = (n * T + P.w) / 80 + 0.2;
            for (const tr of g.traps) if (tr.type === 'wind' && tr.x0 <= nx + n && tr.x1 >= nx) {
              for (let t = 0; t <= tCross; t += 0.05) { const ph = ((clock + t + tr.phase) % tr.period + tr.period) % tr.period; if (ph < tr.on) { right = false; break; } }
            }
          }
        }
        // ベルトの上で待つときは、ベルトにさからって立ち止まる
        if (!right && P.onGround) {
          const ut2 = L()[Math.floor((feetY + 1) / T)] ? L()[Math.floor((feetY + 1) / T)][Math.floor(cx / T)] : '.';
          if (ut2 === '>') { g.keys.left = true; g.sync(); }
        }
        const keepLeft = !right && P.onGround && (L()[Math.floor((feetY + 1) / T)] || [])[Math.floor(cx / T)] === '>';
        g.keys.right = right; if ((!target || P.onGround) && !keepLeft) g.keys.left = false;
        g.sync();
        if (g.state === 'goal' || g.state === 'clear' || performance.now() - t0 > 80000) {
          clearInterval(iv); res({ state: g.state, maxX: Math.round(maxX / T), hits: hits.join(','), deaths, secs: Math.round((performance.now() - t0) / 1000) });
        }
      }, 16);
    }), { stage, skips, dash: mode === 'dash' });
    console.log(stage, mode.toUpperCase(), JSON.stringify(r), errs.slice(0, 2));
  }
  await b.close();
})();
