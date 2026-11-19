const { chromium, devices } = require('playwright');
const wait = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const b = await chromium.launch();
  const p = await (await b.newContext({ ...devices['iPhone 13 landscape'] })).newPage();
  const errs = []; p.on('pageerror', e => errs.push(e.message + ' ' + (e.stack || '').split('\n')[1]));
  await p.goto('file:///home/user/make-games/game/index.html'); await wait(500);
  const st = () => p.evaluate(() => __game.state);
  const log = [];
  log.push('before: 2-1 filter=' + await p.evaluate(() => { __game.enterStage(4); return document.getElementById('game').style.filter; }));
  // 5-B をたおす
  await p.evaluate(async () => {
    const g = __game, sl = ms => new Promise(r => setTimeout(r, ms));
    for (const w of ['1','2','3','4']) for (const k of ['1','2','3','B']) g.save.cleared[`${w}-${k}`] = true;
    for (const k of ['1','2','3']) g.save.cleared[`5-${k}`] = true;
    for (const w of [1,2,3,4]) g.save.chapters[w] = true;
    g.save.preboss[5] = true;
    g.enterStage(19); await sl(300);
    const bo = g.boss; bo.hp = 0.01; bo.active = true;
    let w = 0; while (bo.mode !== 'swoop' || bo.t < 0.9) { await sl(50); if (++w > 400) break; }
    bo.hurtT = 0; g.player.x = bo.x + bo.w / 2 - 5; g.player.y = bo.y - 24; g.player.vy = 120; g.player.prevBottom = g.player.y + g.player.h;
    await sl(2800);
    const gem = g.bigGem; if (gem) { g.player.x = gem.x; g.player.y = gem.y - 5; }
  });
  for (let i = 0; i < 80 && (await st()) !== 'dialog'; i++) await wait(100);
  log.push('after boss: ' + await st() + ' / ' + await p.evaluate(() => document.getElementById('dialog-text').textContent || ''));
  await p.evaluate(() => document.getElementById('btn-skip').click());
  await wait(300);
  log.push('next: ' + await st());
  await wait(2900); await p.screenshot({ path: 'm1.png' });
  for (let i = 0; i < 150 && (await st()) !== 'dialog'; i++) await wait(100);
  log.push('daily: ' + await st());
  for (let i = 0; i < 3; i++) { await p.tap('#dialog-box'); await wait(80); await p.tap('#dialog-box'); await wait(150); }
  await wait(600); await p.screenshot({ path: 'm2.png' });
  log.push('line: ' + await p.evaluate(() => document.getElementById('dialog-text').textContent));
  await p.evaluate(() => document.getElementById('btn-skip').click()); await wait(700);
  log.push('map: ' + await st() + ' ' + await p.evaluate(() => document.getElementById('map-world').textContent + ' / ' + document.getElementById('btn-play').textContent));
  log.push('act-screen shown? ' + await p.evaluate(() => !document.getElementById('act-screen').hidden));
  log.push('after: 2-1 filter=' + await p.evaluate(() => { __game.enterStage(4); return document.getElementById('game').style.filter; }));
  log.push('after: 1-1 filter=' + await p.evaluate(() => { __game.save.cleared['1-1'] = false; __game.enterStage(0); return document.getElementById('game').style.filter; }));
  console.log(log.join('\n'), errs.slice(0, 3));
  await b.close();
})();
