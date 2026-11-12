// ミスターポストマン：ドット絵データ（1文字＝1ドット、'.'＝透明）
(() => {
  'use strict';
  const PAL = {
    K: '#281c34', W: '#ffffff', w: '#d6e2f0',
    T: '#008c92', t: '#46c8be', U: '#005868',
    Y: '#ffd23c', y: '#dc961e', G: '#fff4aa',
    S: '#ffcca4', s: '#e49676', H: '#784224', h: '#aa6432', E: '#221e38', m: '#d25a5a',
    b: '#609cf4', v: '#3a64c8', N: '#965828', n: '#cc863e', k: '#462c28',
    O: '#fca44c', o: '#dc6e2c', R: '#e23034', r: '#ff7868', q: '#961828',
    B: '#4684ea', Z: '#9696a2', z: '#646474',
    c: '#d6aa6e', x: '#aa7c46', X: '#f0ce96',
  };
  const HEAD = [
    '......tttTT.....',
    '.....tTTTTTTU...',
    '.....TTTYTTTU...',
    '.....UUUUUUUUUU.',
    '.....HHSSSSs....',
    '....HhSSSESs....',
    '....HSSSSESSs...',
    '.....SSSSSSSs...',
    '.....sSSSmms....',
    '......ssss......',
  ];
  const BODY = [
    '....TbbbbbbT....',
    '...TbNbbbbvTT...',
    '...SbbNbbbbvS...',
    '..NnnnnnNbbvs...',
    '..NWWWWnNbbv....',
    '..NNNNNNNUUU....',
  ];
  const DATA = {
    STAND: [...HEAD, ...BODY,
      '....UUUU.UUU....',
      '....UUU..UUU....',
      '...kkkk..kkkk...'],
    RUN: [...HEAD, ...BODY,
      '...UUU...UUUU...',
      '..UUU.....UUU...',
      '.kkkk.....kkkk..'],
    JUMP: [
      '......tttTT...S.',
      '.....tTTTTTTU.S.',
      '.....TTTYTTTUbb.',
      '.....UUUUUUUUbv.',
      '.....HHSSSSs.b..',
      '....HhSSSESs.b..',
      '....HSSSSESSsb..',
      '.....SSSSSSSb...',
      '.....sSSSmmb....',
      '......ssssb.....',
      '....TbbbbbbT....',
      '...TbNbbbbvT....',
      '...SbbNbbbbv....',
      '..NnnnnnNbbv....',
      '..NWWWWnNbbvUU..',
      '..NNNNNNNUUUUUU.',
      '...UUU......UUU.',
      '..kkkk.......kk.',
      '..kkk........k..'],
    STAMP: [
      'W.WW.W.WW.W',
      'WWWWWWWWWWW',
      '.WBBBBBBBW.',
      'WWBRRBRRBWW',
      '.WRrRRRRRW.',
      'WWRRRRRRRWW',
      '.WBRRRRRBW.',
      'WWBBRRRBBWW',
      '.WBBBRBBBW.',
      'WWWWWWWWWWW',
      'W.WW.W.WW.W'],
    POCCHI: [
      '......GWWG......',
      '....GWWWWWWG....',
      '...GWWWWWWWWG...',
      '..GWWEWWWWEWWG..',
      '..GWWEWWWWEWWG..',
      '..GWrWWWWWWrWG..',
      '..GWWWWmmWWWwG..',
      '...GWWWWWWWwG...',
      '....GWWWWwwG....',
      '.....GGwwGG.....',
      '......G..G......'],
    POST: [
      '...rrrrrrrrr....',
      '..rRRRRRRRRRq...',
      '.rRRRRRRRRRRRq..',
      '.rRKKKKKKKKKRq..',
      '.rRKEEEEEEEKRq..',
      '.rRKKKKKKKKKRq..',
      '.rRRRRRRRRRRRq..',
      '.rRRWRRRRWRRRq..',
      '.rRRRWWWWRRRRq..',
      '.rRRRRRRRRRRRq..',
      '.rRRRRRRRRRRqq..',
      '.rRRRRRRRRRRqq..',
      '.qqqqqqqqqqqqq..',
      '......ZZz.......',
      '......ZZz.......',
      '......ZZz.......',
      '......ZZz.......',
      '......ZZz.......',
      '......ZZz.......',
      '....ZZZZZzz.....'],
    LETTERBLK: [
      'nnnnnnnnnnnnnnnN',
      'nOOOOOOOOOOOOOoN',
      'nOyOOOOOOOOOOyoN',
      'nOOWWWWWWWWWWOoN',
      'nOOWwWWWWWWwWOoN',
      'nOOWWwWWWWwWWOoN',
      'nOOWWWwWWwWWWOoN',
      'nOOWWWWRRWWWWOoN',
      'nOOWWWWRRWWWWOoN',
      'nOOWWWWWWWWWWOoN',
      'nOOwwwwwwwwwwOoN',
      'nOOOOOOOOOOOOOoN',
      'nOyOOOOOOOOOOyoN',
      'nOoooooooooooooN',
      'NNNNNNNNNNNNNNNN',
      'NNNNNNNNNNNNNNNN'],
    PARCEL: [
      'xxxxxxxRRxxxxxxx',
      'xXXXXXXRRXXXXXXx',
      'xXccccccRccccccx',
      'xXccccccRccccccx',
      'xXccccccRccccccx',
      'xXccccccRccccccx',
      'RRRRRRRRRRRRRRRR',
      'RRRRRRRRRRRRRRRR',
      'xXccccccRccccccx',
      'xXcccccRrRcccccx',
      'xXccccccRccccccx',
      'xXccccccRccccccx',
      'xXccccccRccccccx',
      'xXccccccRccccccx',
      'xxxxxxxxRxxxxxxx',
      'xxxxxxxxxxxxxxxx'],
  };
  const NO_OUTLINE = new Set(['LETTERBLK', 'PARCEL']);

  function build(rows, outline) {
    const w = Math.max(...rows.map(r => r.length));
    const h = rows.length;
    const pad = outline ? 1 : 0;
    const cv = document.createElement('canvas');
    cv.width = w + pad * 2; cv.height = h + pad * 2;
    const g = cv.getContext('2d');
    const solid = (x, y) => y >= 0 && y < h && x >= 0 && x < rows[y].length && rows[y][x] !== '.';
    if (outline) {
      g.fillStyle = PAL.K;
      for (let y = -1; y <= h; y++) for (let x = -1; x <= w; x++) {
        if (solid(x, y)) continue;
        if (solid(x + 1, y) || solid(x - 1, y) || solid(x, y + 1) || solid(x, y - 1)) g.fillRect(x + pad, y + pad, 1, 1);
      }
    }
    rows.forEach((r, y) => [...r].forEach((c, x) => {
      if (c === '.') return;
      g.fillStyle = PAL[c]; g.fillRect(x + pad, y + pad, 1, 1);
    }));
    return cv;
  }
  function flip(cv) {
    const f = document.createElement('canvas');
    f.width = cv.width; f.height = cv.height;
    const g = f.getContext('2d');
    g.translate(cv.width, 0); g.scale(-1, 1); g.drawImage(cv, 0, 0);
    return f;
  }
  const SPR = {};
  for (const [k, rows] of Object.entries(DATA)) {
    SPR[k] = build(rows, !NO_OUTLINE.has(k));
    SPR[k + '_L'] = flip(SPR[k]);
  }
  window.SPR = SPR;
  window.PAL = PAL;
})();
