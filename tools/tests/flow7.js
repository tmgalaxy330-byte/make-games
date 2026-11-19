const { chromium, devices } = require('playwright');
const wait = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const b = await chromium.launch();
  const p = await (await b.newContext({ ...devices['iPhone 13 landscape'] })).newPage();
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto('file:///home/user/make-games/game/index.html'); await wait(500);
  const st = () => p.evaluate(() => __game.state);
  const seq = [];
  await p.evaluate(async () => {
    const g = __game, sl = ms => new Promise(r => setTimeout(r, ms));
    for (const w of ['1','2','3','4','5','6']) for (const k of ['1','2','3','B']) g.save.cleared[`${w}-${k}`] = true;
    for (const k of ['1','2','3']) g.save.cleared[`7-${k}`] = true;
    for (const w of [1,2,3,4,5,6]) g.save.chapters[w] = true;
    g.save.preboss[7] = true;
    g.enterStage(27); await sl(1500);
    for (let k = 0; k < 8 && g.boss && !g.boss.dead; k++) {
      const bo = g.boss; let w = 0; while (bo.alpha < 1) { await sl(100); if (++w > 30) break; }
      bo.hurtT = 0; g.player.x = bo.x + bo.w / 2 - 5; g.player.y = bo.y - 24; g.player.vy = 120; g.player.prevBottom = g.player.y + g.player.h;
      await sl(900);
    }
    await sl(2600);
    const gem = g.bigGem; if (gem) { g.player.x = gem.x; g.player.y = gem.y - 5; }
  });
  const until = async (s, ms) => { for (let i = 0; i < ms / 100 && (await st()) !== s; i++) await wait(100); return st(); };
  seq.push(await until('dialog', 9000));
  await p.evaluate(() => document.getElementById('btn-skip').click()); await wait(400);   // 手紙
  seq.push(await st());
  await p.evaluate(() => document.getElementById('btn-skip').click()); await wait(400);   // エピローグ
  seq.push(await st());
  await p.evaluate(() => document.getElementById('btn-credits-skip').click());
  seq.push(await until('dialog', 20000));
  await p.evaluate(() => document.getElementById('btn-skip').click());
  seq.push(await until('comeback', 6000));
  seq.push(await until('title', 14000));
  console.log(seq.join(' → '), errs.slice(0, 3));
  await b.close();
})();
