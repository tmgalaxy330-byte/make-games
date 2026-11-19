const { chromium, devices } = require('playwright');
const wait = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const b = await chromium.launch();
  const p = await (await b.newContext({ ...devices['iPhone 13 landscape'] })).newPage();
  const errs = []; p.on('pageerror', e => errs.push(e.message + ' ' + (e.stack || '').split('\n')[1]));
  await p.goto('file:///home/user/make-games/game/index.html'); await wait(400);
  const log = [];
  const beat = async (idx, label) => {
    const r = await p.evaluate(async (idx) => {
      const g = __game, sl = ms => new Promise(r => setTimeout(r, ms));
      for (const st of ['1','2','3','4','5','6','7']) for (const k of ['1','2','3','B']) if (`${st}-${k}` < `${Math.ceil((idx+1)/4)}-${['1','2','3','B'][idx%4]}`) g.save.cleared[`${st}-${k}`] = true;
      g.enterStage(idx); await sl(200);
      const pre = g.state;
      if (g.state === 'dialog') { document.getElementById('btn-skip').click(); await sl(300); }
      g.run.lives = 9; g.run.time = 999; g.player.x = 8 * 16; await sl(1500);
      const hp = [];
      for (let k = 0; k < 14 && g.boss && !g.boss.dead; k++) {
        const bo = g.boss;
        // 男爵は地面までおりてきたときだけふめる
        if (bo.type === 'baron') { g.run.hearts = 3; g.run.hurtT = 0; let w = 0; while (bo.mode !== 'swoop' || bo.t < 0.9) { await sl(50); if (++w > 400) break; } }
        if (bo.type === 'toki') { let w = 0; while (bo.alpha < 1) { await sl(100); if (++w > 30) break; } }
        bo.hurtT = 0;
        g.player.x = bo.x + bo.w / 2 - 5; g.player.y = bo.y - 24; g.player.vy = 120; g.player.prevBottom = g.player.y + g.player.h;
        await sl(160); hp.push(Math.round(bo.hp * 100) / 100); await sl(700);
      }
      await sl(2600);
      const gem = g.bigGem; if (gem) { g.player.x = gem.x; g.player.y = gem.y - 5; }
      await sl(300);
      return { pre, hp, st: g.state };
    }, idx);
    log.push(label + ' ' + JSON.stringify(r));
  };
  await beat(19, '5-B');
  await wait(5300);
  log.push('after 5-B goal: ' + await p.evaluate(() => __game.state));
  await p.screenshot({ path: 'sto1.png' });
  await p.evaluate(() => document.getElementById('btn-skip').click()); await wait(600);
  log.push('act: ' + await p.evaluate(() => __game.state + ' ' + document.getElementById('act-title').textContent));
  await p.screenshot({ path: 'sto2.png' });
  await p.evaluate(() => document.getElementById('btn-act-next').click()); await wait(600);
  log.push('teaser: ' + await p.evaluate(() => __game.state + ' ' + document.getElementById('dialog-text').textContent));
  await p.evaluate(() => document.getElementById('btn-skip').click()); await wait(600);
  log.push('act2: ' + await p.evaluate(() => document.getElementById('act-title').textContent));
  await p.evaluate(() => document.getElementById('btn-act-next').click()); await wait(800);
  log.push('map: ' + await p.evaluate(() => __game.state + ' ' + document.getElementById('map-world').textContent + ' ' + document.getElementById('btn-play').textContent));
  await p.screenshot({ path: 'sto3.png' });
  await beat(23, '6-B');
  await wait(5300); await p.evaluate(() => document.getElementById('btn-skip').click()); await wait(600);
  log.push('after 6-B: ' + await p.evaluate(() => __game.state + ' ' + document.getElementById('map-world').textContent));
  await beat(27, '7-B');
  await wait(5300);
  await p.screenshot({ path: 'sto4.png' });
  await p.evaluate(() => document.getElementById('btn-skip').click()); await wait(600);
  log.push('end: ' + await p.evaluate(() => __game.state + ' ' + document.getElementById('act-title').textContent));
  await p.screenshot({ path: 'sto5.png' });
  await p.evaluate(() => document.getElementById('btn-act-next').click()); await wait(600);
  log.push('title: ' + await p.evaluate(() => __game.state));
  console.log(log.join('\n'), errs.slice(0, 4));
  await b.close();
})();
