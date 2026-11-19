const { chromium, devices } = require('playwright');
(async () => {
  const b = await chromium.launch();
  const p = await (await b.newContext({ ...devices['iPhone 13 landscape'] })).newPage();
  await p.goto('file:///home/user/make-games/game/index.html'); await p.waitForTimeout(300);
  const out = await p.evaluate(() => {
    const g = __game, res = [];
    const ids = ['4-1','4-2','4-3','5-1','5-2','5-3','6-1','6-2','6-3','7-1','7-2','7-3'];
    ids.forEach(id => {
      const idx = ['1','2','3','4','5','6','7'].flatMap(w => ['1','2','3','B'].map(k => `${w}-${k}`)).indexOf(id);
      g.save.preboss = { 5: true, 7: true };
      g.enterStage(idx);
      const T = 16;
      const box = tr => tr.type === 'piston' ? [tr.x * T + 2, tr.x * T + 14] : tr.type === 'zap' ? [tr.x * T + 5, tr.x * T + 11] :
        tr.type === 'bolt' ? [tr.x * T + 3, tr.x * T + 13] : tr.type === 'door' ? [tr.x * T, tr.x * T + 16] : [tr.x0 * T, (tr.x1 + 1) * T];
      const list = g.traps.filter(t => t.type !== 'wind').sort((a, c) => box(a)[0] - box(c)[0]);
      list.forEach((tr, i) => {
        let win = 0, need = 0, note = '';
        if (tr.type === 'piston') { const up = Math.min(1.0, tr.period * 0.45); win = tr.period - 0.35 - up + 0.05; need = 0.32; note = `h${tr.h}`; }
        if (tr.type === 'zap') { win = tr.period - tr.on; need = 0.3; }
        if (tr.type === 'door') { win = tr.open; need = 0.4; }
        if (tr.type === 'bolt') { win = tr.period - 0.3; need = 0.3; }
        const nx = list[i + 1];
        const gap = nx ? box(nx)[0] - box(tr)[1] : 999;
        const flag = (win < need ? ' ★すきま不足' : '') + (gap < 16 && nx && nx.type !== 'door' ? ' ★次との間がせまい(' + gap + 'px)' : '');
        if (flag) res.push(`${id} ${tr.type}@${tr.x} 周期${tr.period} 安全${win.toFixed(2)}s ${note}${flag}`);
      });
    });
    return res;
  });
  console.log(out.join('\n') || 'none');
  await b.close();
})();
