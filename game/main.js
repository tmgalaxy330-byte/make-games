// ミスターポストマン：Step 2 試作（敵・アイテム・ダメージ・のこり人数・中間ポスト）
(() => {
  'use strict';

  // ------------------------------------------------------------------ 定数
  const TILE = 16;
  const ROWS = 12;                 // ステージの高さ（タイル数）
  const BASE_H = 180;              // 基準の画面の高さ（ドット）
  const STEP = 1 / 60;             // 物理計算の間隔（秒）

  // 動きの調整値（単位：ドット/秒）
  const PHYS = {
    run: 96,          // 歩く最高速度
    dash: 150,        // ダッシュの最高速度
    accel: 700,       // 地上の加速
    decel: 900,       // 地上の減速
    air: 480,         // 空中の加速
    airBrake: 1100,   // 空中で反対向きを押したときの減速
    jump: 318,        // ジャンプの初速 → 最大の高さ ≒ 318² / (2×900) ≒ 56ドット（約3.5マス）
    dashJump: 360,    // ダッシュ最高速でのジャンプ初速 → ≒ 72ドット（約4.5マス）
    doubleJump: 280,  // バネぐつの2段目
    stomp: 230,       // 敵を踏んだときのはね返り
    stompHigh: 330,   // 踏んだときにJUMPを押していると高くはねる
    gUp: 900,         // 上昇中（ボタンを押している間）の重力
    gDown: 1500,      // 下降中・ボタンを離したときの重力
    maxFall: 380,
    glideFall: 45,    // 紙ひこうきマントで滑空中の落ちる速さ
    coyote: 0.10,     // 足場から落ちた後もジャンプできる時間
    buffer: 0.12,     // 着地前のジャンプ入力を覚えておく時間
  };
  // ゲームのルール
  const RULE = {
    hearts: 3,        // 体力
    lives: 3,         // のこり人数（ミスできる回数）
    iframes: 1.5,     // ダメージ後に点めつして当たらない時間
    invincible: 8,    // ニジのスカーフのむてき時間
    invWarn: 2,       // むてきが終わる前に点めつする時間
    stampsFor1up: 100,
    dupStamps: 5,     // 同じアイテムを取ったときの切手
  };
  const POWERS = ['boots', 'lantern', 'plane'];
  const NAMES = {
    boots: 'バネぐつ', lantern: 'ランタン', plane: '紙ひこうきマント', bag: '大きな配達カバン',
    onigiri: 'おにぎり', scarf: 'ニジのスカーフ', oneup: 'はげましの手紙',
  };
  const ITEM_SPR = {
    boots: 'BOOTS', lantern: 'LANTERN', plane: 'PLANE', bag: 'BIGBAG',
    onigiri: 'ONIGIRI', scarf: 'SCARF', oneup: 'LETTER_1UP',
  };

  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  const SPR = window.SPR;
  const SND = window.SOUND || { sfx: new Proxy({}, { get: () => () => {} }), play() {}, stop() {}, pause() {}, setEnabled() {}, enabled: false };
  const sfx = SND.sfx;

  // ------------------------------------------------------------------ ステージ（1-1 試作）
  // '#'=地面 '='=板（下から通りぬけ可） 'B'=手紙ブロック 'P'=小包ブロック
  // 'H'=かくしブロック（見えない） 'U'=空ブロック '*'=ハート切手
  let LEVEL_W = 150;
  const level = [];
  const contents = {};      // "x,y" → ブロックの中身
  const parcelHits = {};
  const gemSpots = {};      // "x,y" → ヒカリのかけらの番号（0〜2）
  let enemies = [];
  let movers = [];          // 動く足場
  let traps = [];           // トゲの柱・電気の門
  let crumbles = {};        // くずれる足場のようす
  let trapClock = 0;
  let boss = null;
  let goal = null;
  let START = { x: 3 * TILE, y: 10 * TILE };
  let CHECKPOINT = null;
  let theme = null;
  let levelDef = {};
  let curWorld = 1;

  // ステージを組み立てる道具
  function makeBuilder() {
    const set = (x, y, c) => { if (x >= 0 && x < LEVEL_W && y >= 0 && y < ROWS) level[y][x] = c; };
    return {
      set,
      ground: (x0, x1, top = 10) => { for (let x = x0; x <= x1; x++) for (let y = top; y < ROWS; y++) set(x, y, '#'); },
      plank: (x0, x1, y) => { for (let x = x0; x <= x1; x++) set(x, y, '='); },
      stamps: (x0, x1, y) => { for (let x = x0; x <= x1; x++) set(x, y, '*'); },
      block: (x, y, item = 'stamp', kind = 'B') => { set(x, y, kind); contents[x + ',' + y] = item; },
      pillar: (x, h) => { for (let y = 10 - h; y <= 9; y++) set(x, y, '#'); },
      gem: (x, y, n) => { set(x, y, 'K'); gemSpots[x + ',' + y] = n; },
      // row = 敵の足もとの行（ふつうは地面の10）。パタクモは空中を上下に飛ぶ
      enemy: (kind, x, row = 10, opt = {}) => {
        const h = { pata: 10, hover: 10, mogu: 12, yuki: 11, tsurara: 9, sakana: 8, uni: 11 }[kind] || 14;
        const vx = { pata: -18, hover: 0, yuki: -40, mogu: 0, tsurara: 0, sakana: -30, uni: 0 }[kind] ?? -22;
        // つららは row の行の上はしにぶら下がる。ほかは row が足もと
        const y = kind === 'tsurara' ? row * TILE : row * TILE - h;
        enemies.push({ kind, x: x * TILE + (kind === 'tsurara' ? 4 : 2), baseX: x * TILE + 2, y, baseY: y, w: kind === 'tsurara' ? 8 : kind === 'uni' ? 11 : 12, h,
          vx, vy: 0, active: false, dead: null, deadT: 0, onGround: false, t: x * 0.37, shakeT: 0, falling: false, sway: opt.sway || 0 });
      },
      // 左右に動く板：x0（左はし）, row, 幅（マス）, 動く幅（マス）, 速さ, ずらし
      mover: (x0, row, wTiles, range, speed, phase = 0) => movers.push({
        x: x0 * TILE, y: row * TILE, w: wTiles * TILE, h: 6, x0: x0 * TILE, y0: row * TILE, range: range * TILE, speed, t: phase, dx: 0, dy: 0, axis: 'x',
      }),
      // 上下に動く板：row（いちばん上）から range マス下まで
      vmover: (x0, row, wTiles, range, speed, phase = 0) => movers.push({
        x: x0 * TILE, y: row * TILE, w: wTiles * TILE, h: 6, x0: x0 * TILE, y0: row * TILE, range: range * TILE, speed, t: phase, dx: 0, dy: 0, axis: 'y',
      }),
      // くずれる足場（乗ると少しして落ちる。しばらくするともどる）
      crumble: (x0, x1, row) => { for (let x = x0; x <= x1; x++) set(x, row, 'C'); },
      // トゲの柱：地面から出たり引っこんだり（高さ h マス、周期、ずらし）
      piston: (x, h = 2, period = 2.6, phase = 0) => traps.push({ type: 'piston', x, h, period, phase, f: 0 }),
      // 電気の門：row0〜row1 に電気が流れたり止まったり
      zap: (x, row0, row1, period = 2.6, on = 1.1, phase = 0) => traps.push({ type: 'zap', x, row0, row1, period, on, phase, live: false }),
      // 天井（0行目から row 行目まで岩）
      ceiling: (x0, x1, row) => { for (let x = x0; x <= x1; x++) for (let y = 0; y <= row; y++) set(x, y, '#'); },
      hang: (x, row0, row1) => { for (let y = row0; y <= row1; y++) set(x, y, '#'); },
      // ベルトコンベア：乗っていると dir の向きに運ばれる（dir = -1 左 / 1 右）
      conveyor: (x0, x1, row, dir) => { for (let x = x0; x <= x1; x++) set(x, row, dir < 0 ? '<' : '>'); },
      // 開け閉めする扉：row0〜row1 をふさぐ。open 秒だけ開く
      door: (x, row0, row1, period = 3, open = 1.4, phase = 0) => {
        traps.push({ type: 'door', x, row0, row1, period, open, phase, shut: true });
        for (let y = row0; y <= row1; y++) set(x, y, 'D');
      },
      // 雷：空の雲から、x の列に雷が落ちる（落ちる前に雲が光る）
      bolt: (x, period = 3, phase = 0) => traps.push({ type: 'bolt', x, period, phase, live: false, warn: false }),
      // 強い風：x0〜x1 で、ときどき force の強さでおし流す（マイナスは左向き）
      wind: (x0, x1, period = 4, on = 1.8, force = -70, phase = 0) => traps.push({ type: 'wind', x0, x1, period, on, force, phase, live: false }),
      // 円をえがいて回る足場：中心（マス）、半径（マス）、速さ
      cmover: (cx, cyRow, radius, speed, phase = 0, wTiles = 2) => movers.push({
        x: 0, y: 0, w: wTiles * TILE, h: 6, cx: cx * TILE, cy: cyRow * TILE, r: radius * TILE, speed, t: phase, dx: 0, dy: 0, axis: 'circle', first: true,
      }),
      wallEnd: () => { for (let y = 0; y < 10; y++) set(LEVEL_W - 1, y, '#'); },
      // 氷：row の行に氷ブロックをならべる。iceGround は地面の表面を氷にする
      ice: (x0, x1, row) => { for (let x = x0; x <= x1; x++) set(x, row, 'I'); },
      iceGround: (x0, x1) => { for (let x = x0; x <= x1; x++) set(x, 10, 'I'); },
      // 流砂：地面の表面を流砂にする（しずんで、遅くなる）
      quicksand: (x0, x1) => { for (let x = x0; x <= x1; x++) set(x, 10, 'Q'); },
      // 敵の大きさは種類ごと（つららは天井からぶら下がる）
      boss: (type) => {
        const size = { geko: [26, 24], zara: [16, 12], snow: [20, 23], tako: [26, 22], baron: [18, 30], gear: [20, 21], toki: [18, 21] }[type];
        boss = {
          type, x: 20 * TILE, y: 10 * TILE - size[1], w: size[0], h: size[1], vx: 0, vy: 0, hp: 3, maxHp: 3,
          mode: type === 'zara' ? 'crawl' : 'idle', t: 0, hurtT: 0, face: -1, onGround: true, dead: false, deadT: 0,
          squash: 0, throws: 0, dir: -1, hist: [],
        };
        if (type === 'zara') for (let i = 0; i < 70; i++) boss.hist.push({ x: boss.x, y: boss.y });
        if (type === 'toki') { boss.hp = boss.maxHp = 4; }
        if (type === 'baron') { boss.y = 4 * TILE; boss.homeY = 4 * TILE; boss.alpha = 1; }
        boss.alpha = 1;
      },
    };
  }

  const THEMES = {
    meadow: { sky: [[92, 150, 250], [196, 228, 255]], mtn: ['#96baec', '#70a6ce'], hill: ['#54ac60', '#8cd678'], song: 'meadow' },
    forest: { sky: [[78, 136, 214], [168, 214, 236]], mtn: ['#7fb0c8', '#4f8f7e'], hill: ['#2f7f4a', '#5ab86a'], trees: true, song: 'forest' },
    sunset: { sky: [[236, 128, 124], [255, 214, 150]], mtn: ['#c48aa8', '#9a6a94'], hill: ['#5a9a5a', '#8cc878'], lowSun: true, song: 'sunset' },
    storm: { sky: [[64, 56, 104], [146, 128, 168]], mtn: ['#5a5280', '#463e6a'], hill: ['#3e5a4a', '#5a7a62'], noSun: true, song: 'boss' },
    // ワールド2：カラカラ砂丘島
    desert: { sky: [[96, 170, 240], [250, 226, 170]], mtn: ['#ecd09a', '#d8ae76'], hill: ['#dcb474', '#f0d494'], tiles: 'sand', pyramids: true, song: 'desert' },
    ruins: { sky: [[184, 124, 92], [242, 194, 134]], mtn: ['#c89a70', '#a87a58'], hill: ['#b88c5c', '#d8b07c'], tiles: 'sand', pyramids: true, song: 'desert' },
    dusk: { sky: [[118, 90, 160], [252, 172, 122]], mtn: ['#a07898', '#80608a'], hill: ['#c09060', '#e0b07c'], tiles: 'sand', pyramids: true, lowSun: true, song: 'desert' },
    sandstorm: { sky: [[150, 110, 80], [222, 182, 132]], mtn: ['#a88660', '#8a6a4a'], hill: ['#b08c5c', '#c8a070'], tiles: 'sand', noSun: true, song: 'boss' },
    // ワールド3：ツララ雪原島
    snow: { sky: [[150, 190, 232], [232, 242, 255]], mtn: ['#c8d8f0', '#a8bce0'], hill: ['#e4eefa', '#ffffff'], tiles: 'snow', snowfall: true, song: 'snow' },
    icecave: { sky: [[40, 60, 112], [92, 132, 182]], mtn: ['#4a6a9a', '#3a5684'], hill: ['#5a7aa8', '#7a9ac4'], tiles: 'snow', snowfall: true, noSun: true, song: 'snow' },
    aurora: { sky: [[18, 28, 70], [60, 92, 142]], mtn: ['#3a4a7a', '#2e3c68'], hill: ['#c8d8f0', '#e8f0ff'], tiles: 'snow', snowfall: true, noSun: true, aurora: true, song: 'snow' },
    // ワールド4：シズク海底島
    coast: { sky: [[96, 180, 240], [200, 236, 255]], mtn: ['#8ccce6', '#5ab0d8'], hill: ['#3a9ad0', '#8cd4f4'], tiles: 'wetsand', song: 'sea' },
    deep: { sky: [[8, 36, 86], [28, 92, 150]], mtn: ['#1c4a7a', '#163e68'], hill: ['#1a5a6a', '#2a7a8a'], tiles: 'rock', noSun: true, water: true, song: 'deep' },
    reef: { sky: [[236, 136, 112], [255, 212, 160]], mtn: ['#5a9ac0', '#4a88b0'], hill: ['#3a8ab8', '#6ab0d8'], tiles: 'wetsand', lowSun: true, song: 'sea' },
    tide: { sky: [[36, 56, 98], [88, 120, 162]], mtn: ['#2c4c74', '#22405f'], hill: ['#2a6a8a', '#4a8aa8'], tiles: 'rock', noSun: true, song: 'boss' },
    // ワールド5：クモリ城（第一幕さいご）
    castle: { sky: [[52, 40, 84], [128, 104, 150]], mtn: ['#4a3e6a', '#3a3058'], hill: ['#5a5070', '#76698e'], tiles: 'stone', noSun: true, castle: true, song: 'castle' },
    castleIn: { sky: [[30, 22, 50], [70, 54, 96]], mtn: ['#3a2e54', '#2c2244'], hill: ['#44385c', '#5a4c74'], tiles: 'stone', noSun: true, castle: true, song: 'castle' },
    castleTop: { sky: [[64, 52, 110], [196, 150, 190]], mtn: ['#5a4c80', '#483c6a'], hill: ['#6a5c84', '#8a7ca4'], tiles: 'stone', lowSun: true, castle: true, song: 'castle' },
    thunder: { sky: [[28, 22, 46], [84, 70, 110]], mtn: ['#3a3054', '#2c2444'], hill: ['#40365a', '#544a70'], tiles: 'stone', noSun: true, song: 'final' },
    // ワールド6：歯車の時計島（第二幕）
    clock: { sky: [[214, 170, 110], [250, 224, 170]], mtn: ['#c49a62', '#a87e4c'], hill: ['#b48a54', '#d0a870'], tiles: 'brass', gears: true, song: 'clock' },
    clockIn: { sky: [[90, 64, 40], [150, 112, 70]], mtn: ['#6e4e30', '#5a3e24'], hill: ['#7a5a38', '#946e48'], tiles: 'brass', gears: true, noSun: true, song: 'clock' },
    clockDusk: { sky: [[150, 90, 110], [250, 186, 130]], mtn: ['#9a6a70', '#80545e'], hill: ['#a07a58', '#c09a70'], tiles: 'brass', gears: true, lowSun: true, song: 'clock' },
    clockBoss: { sky: [[70, 50, 34], [130, 96, 60]], mtn: ['#5a4028', '#48321e'], hill: ['#6a4c30', '#80603e'], tiles: 'brass', gears: true, noSun: true, song: 'boss' },
    // ワールド7：時の灯台（第二幕さいご）
    time: { sky: [[40, 30, 90], [110, 90, 170]], mtn: ['#3a3078', '#2e2664'], hill: ['#4a3e8a', '#6a5aaa'], tiles: 'time', noSun: true, stars: true, song: 'time' },
    timeIn: { sky: [[16, 12, 44], [56, 44, 110]], mtn: ['#241c54', '#1c1644'], hill: ['#2e2462', '#40347e'], tiles: 'time', noSun: true, stars: true, song: 'time' },
    timeTop: { sky: [[30, 40, 110], [200, 170, 230]], mtn: ['#3a3a88', '#2e2e70'], hill: ['#5a4e9a', '#7a6eba'], tiles: 'time', lowSun: true, stars: true, song: 'time' },
    timeBoss: { sky: [[10, 8, 30], [50, 36, 90]], mtn: ['#1c1640', '#141030'], hill: ['#261e50', '#342a66'], tiles: 'time', noSun: true, stars: true, song: 'final' },
    blizzard: { sky: [[90, 100, 142], [172, 182, 212]], mtn: ['#7a84aa', '#646e94'], hill: ['#c0cce4', '#dce4f4'], tiles: 'snow', snowfall: true, noSun: true, song: 'boss' },
  };

  const LEVEL_DEFS = {
    // ---------------- 1-1 はじまりの草原
    '1-1': { w: 150, theme: 'meadow', checkpoint: 60, goal: 134, build(B) {
      B.ground(0, 30);
      B.stamps(6, 9, 8);
      B.block(13, 6); B.block(14, 6, 'boots'); B.block(15, 6, 'stamp', 'P'); B.block(16, 6);
      B.enemy('moyan', 20);
      B.plank(22, 26, 7); B.stamps(23, 25, 5); B.gem(24, 3, 0);
      B.enemy('moyan', 28);
      B.ground(34, 62);
      B.block(37, 6, 'plane');
      B.pillar(40, 1); B.pillar(41, 2); B.pillar(42, 3);
      B.stamps(40, 42, 5);
      B.enemy('toge', 45);
      B.plank(47, 51, 7); B.block(49, 3, 'bag');
      B.plank(53, 56, 5); B.stamps(53, 56, 3); B.gem(56, 1, 1);
      B.enemy('moyan', 57); B.enemy('moyan', 59);
      B.plank(64, 65, 8); B.stamps(64, 65, 6);
      B.ground(68, 100);
      B.pillar(74, 2);
      B.enemy('toge', 77);
      B.pillar(80, 3);
      B.enemy('moyan', 83);
      B.pillar(85, 2); B.pillar(86, 4);
      B.stamps(76, 78, 6); B.stamps(82, 84, 5);
      B.block(92, 6, 'onigiri'); B.block(93, 6, 'lantern'); B.block(94, 6);
      B.enemy('moyan', 96);
      B.block(97, 6, 'oneup', 'H');
      B.enemy('moyan', 99);
      B.ground(104, LEVEL_W - 1);
      B.block(106, 6, 'scarf');
      B.enemy('moyan', 108); B.enemy('toge', 109); B.enemy('moyan', 110);
      for (let i = 0; i < 4; i++) B.pillar(112 + i, i + 1);
      B.gem(115, 3, 2);
      B.stamps(118, 122, 8);
      B.enemy('moyan', 122); B.enemy('moyan', 125); B.enemy('toge', 128);
      B.wallEnd();
    } },

    // ---------------- 1-2 森のこみち（パタクモ登場）
    '1-2': { w: 160, theme: 'forest', checkpoint: 62, goal: 146, build(B) {
      B.ground(0, 24);
      B.stamps(5, 8, 8);
      B.block(10, 6); B.block(11, 6, 'boots'); B.block(12, 6);
      B.enemy('moyan', 16);
      B.plank(18, 22, 7); B.gem(20, 4, 0); B.enemy('pata', 21, 6);
      B.ground(28, 60);
      B.pillar(32, 2); B.enemy('toge', 35); B.pillar(38, 3);
      B.enemy('pata', 41, 7);
      B.plank(43, 47, 7); B.stamps(43, 47, 5);
      B.plank(49, 53, 5); B.stamps(49, 53, 3);
      B.block(51, 1, 'stamp', 'P');
      B.enemy('moyan', 55); B.enemy('moyan', 57);
      B.plank(62, 63, 8); B.stamps(62, 63, 6);
      B.ground(65, 100);
      B.pillar(70, 2); B.pillar(71, 3);
      B.enemy('pata', 75, 6);
      B.block(76, 6); B.block(77, 6, 'plane'); B.block(78, 6);
      B.enemy('pata', 80, 7); B.enemy('moyan', 82);
      B.pillar(85, 2); B.pillar(86, 4); B.gem(86, 2, 1);
      B.enemy('toge', 90); B.enemy('moyan', 94);
      B.block(97, 6, 'oneup', 'H');
      B.ground(104, LEVEL_W - 1);
      for (let i = 0; i < 4; i++) B.pillar(110 + i, i + 1);
      B.plank(116, 121, 6); B.stamps(116, 121, 4); B.gem(121, 2, 2);
      B.enemy('moyan', 125); B.enemy('pata', 128, 7); B.enemy('toge', 131);
      B.enemy('moyan', 136);
      B.wallEnd();
    } },

    // ---------------- 1-3 丘の上の灯台（動く足場）
    '1-3': { w: 170, theme: 'sunset', checkpoint: 66, goal: 156, lighthouse: true, build(B) {
      B.ground(0, 20);
      B.stamps(4, 7, 8);
      B.block(9, 6, 'bag');
      B.enemy('moyan', 14);
      B.mover(21, 8, 3, 2, 1.1); B.stamps(22, 25, 6);
      B.ground(26, 56);
      B.pillar(30, 2); B.pillar(31, 3);
      B.enemy('pata', 36, 6); B.enemy('toge', 40);
      B.block(44, 6); B.block(45, 6, 'onigiri'); B.block(46, 6);
      B.gem(45, 3, 0);
      B.enemy('moyan', 48); B.enemy('moyan', 50);
      B.mover(57, 8, 3, 2, 1.3); B.stamps(58, 61, 6);
      B.ground(62, 108);
      B.enemy('toge', 70); B.enemy('pata', 74, 6);
      B.enemy('moyan', 78); B.enemy('moyan', 80); B.enemy('moyan', 82);
      B.block(85, 6, 'scarf');
      B.pillar(90, 2); B.pillar(91, 4); B.pillar(92, 2); B.gem(91, 3, 1);
      B.enemy('moyan', 96); B.enemy('pata', 100, 6);
      B.block(104, 6, 'oneup', 'H');
      B.mover(109, 8, 3, 2, 1.5);
      B.ground(114, LEVEL_W - 1);
      for (let i = 0; i < 4; i++) B.pillar(120 + i, i + 1);
      for (let x = 124; x <= 127; x++) B.pillar(x, 4);
      B.gem(126, 3, 2); B.stamps(124, 127, 4);
      B.enemy('moyan', 134); B.enemy('toge', 138); B.enemy('pata', 142, 6);
      B.wallEnd();
    } },

    // ---------------- ボス：大ガエル ゲコドン
    '1-B': { w: 28, theme: 'storm', checkpoint: null, goal: null, build(B) {
      B.ground(0, 27);
      for (let y = 0; y < 10; y++) { B.set(0, y, '#'); B.set(27, y, '#'); }
      B.plank(5, 7, 6); B.plank(20, 22, 6);
      B.boss('geko');
    } },

    // ================= ワールド2：カラカラ砂丘島 =================
    // ---------------- 2-1 さばくの入り口（流砂・モグラ登場）
    '2-1': { w: 150, theme: 'desert', checkpoint: 66, goal: 134, build(B) {
      B.ground(0, 30);
      B.stamps(6, 9, 8);
      B.block(12, 6); B.block(13, 6, 'boots'); B.block(14, 6);
      B.enemy('moyan', 18);
      B.quicksand(22, 27); B.stamps(22, 27, 8); B.enemy('mogu', 25);
      B.ground(34, 74);
      B.pillar(38, 2); B.enemy('mogu', 42); B.enemy('toge', 46);
      B.plank(48, 52, 7); B.stamps(48, 52, 5); B.gem(50, 3, 0);
      B.pillar(55, 1); B.pillar(56, 2); B.pillar(57, 3);
      B.enemy('mogu', 61);
      B.quicksand(69, 73); B.enemy('moyan', 72);
      B.ground(78, 110);
      B.enemy('pata', 82, 6);
      B.block(85, 6, 'lantern');
      B.enemy('mogu', 88); B.enemy('moyan', 91); B.enemy('toge', 94);
      B.pillar(98, 2); B.pillar(99, 4); B.gem(99, 2, 1);
      B.block(103, 6, 'oneup', 'H');
      B.ground(114, LEVEL_W - 1);
      for (let i = 0; i < 4; i++) B.pillar(118 + i, i + 1);
      B.gem(121, 3, 2);
      B.quicksand(124, 128); B.enemy('mogu', 126);
      B.enemy('moyan', 131);
      B.wallEnd();
    } },
    // ---------------- 2-2 いせきの道（動く足場・流砂）
    '2-2': { w: 160, theme: 'ruins', checkpoint: 70, goal: 146, build(B) {
      B.ground(0, 22);
      B.stamps(5, 8, 8);
      B.enemy('moyan', 14);
      B.block(16, 6, 'bag');
      B.mover(23, 8, 3, 2, 1.2); B.stamps(24, 26, 6);
      B.ground(28, 62);
      B.pillar(31, 1); B.pillar(32, 3);
      B.enemy('mogu', 36); B.enemy('mogu', 40);
      B.plank(43, 46, 7); B.stamps(43, 46, 5);
      B.plank(48, 51, 5); B.gem(49, 2, 0);
      B.enemy('toge', 54);
      B.pillar(56, 2);
      B.enemy('pata', 60, 6);
      B.plank(63, 66, 8);
      B.ground(67, 104);
      B.quicksand(74, 80); B.enemy('mogu', 77);
      B.enemy('moyan', 83);
      B.block(86, 6); B.block(87, 6, 'onigiri'); B.block(88, 6);
      B.pillar(92, 2); B.pillar(93, 4); B.gem(93, 2, 1);
      B.enemy('pata', 96, 6); B.enemy('toge', 100);
      B.mover(105, 8, 3, 2, 1.4);
      B.ground(110, LEVEL_W - 1);
      B.enemy('mogu', 114); B.enemy('mogu', 118);
      for (let i = 0; i < 4; i++) B.pillar(122 + i, i + 1);
      for (let x = 126; x <= 129; x++) B.pillar(x, 4);
      B.gem(128, 3, 2);
      B.enemy('moyan', 134); B.enemy('toge', 138);
      B.wallEnd();
    } },
    // ---------------- 2-3 夕ぐれのオアシス（灯台）
    '2-3': { w: 170, theme: 'dusk', checkpoint: 66, goal: 156, lighthouse: true, build(B) {
      B.ground(0, 24);
      B.block(9, 6, 'plane');
      B.enemy('mogu', 14); B.enemy('pata', 18, 6);
      B.ground(28, 60);
      B.quicksand(32, 38); B.enemy('mogu', 35);
      B.pillar(42, 2); B.enemy('toge', 45);
      B.plank(47, 51, 7); B.stamps(47, 51, 5); B.gem(49, 3, 0);
      B.enemy('moyan', 53); B.enemy('moyan', 55); B.enemy('moyan', 57);
      B.mover(61, 8, 3, 2, 1.3);
      B.ground(66, 110);
      B.block(70, 6, 'scarf');
      B.enemy('mogu', 74); B.enemy('toge', 76); B.enemy('moyan', 78); B.enemy('pata', 81, 6);
      B.pillar(85, 2); B.pillar(86, 4); B.gem(86, 2, 1);
      B.quicksand(90, 96); B.enemy('mogu', 93);
      B.enemy('moyan', 100);
      B.block(104, 6, 'oneup', 'H');
      B.ground(114, LEVEL_W - 1);
      for (let i = 0; i < 4; i++) B.pillar(120 + i, i + 1);
      for (let x = 124; x <= 127; x++) B.pillar(x, 4);
      B.gem(126, 3, 2);
      B.enemy('toge', 134); B.enemy('mogu', 138); B.enemy('pata', 142, 6);
      B.wallEnd();
    } },
    // ---------------- ボス：砂ムカデ ザラザラ
    '2-B': { w: 28, theme: 'sandstorm', checkpoint: null, goal: null, build(B) {
      B.ground(0, 27);
      for (let y = 0; y < 10; y++) { B.set(0, y, '#'); B.set(27, y, '#'); }
      B.plank(5, 7, 6); B.plank(20, 22, 6);
      B.boss('zara');
    } },

    // ================= ワールド3：ツララ雪原島 =================
    // ---------------- 3-1 ゆきの原っぱ（すべる氷・ユキコロ登場）
    '3-1': { w: 150, theme: 'snow', checkpoint: 64, goal: 134, build(B) {
      B.ground(0, 30);
      B.stamps(5, 8, 8);
      B.block(12, 6); B.block(13, 6, 'boots'); B.block(14, 6);
      B.enemy('yuki', 18);
      B.iceGround(22, 30); B.enemy('moyan', 27);
      B.ground(34, 70);
      B.pillar(38, 2); B.enemy('yuki', 42);
      B.plank(45, 49, 7); B.stamps(45, 49, 5); B.gem(47, 4, 0);
      B.iceGround(52, 60); B.enemy('yuki', 56);
      B.ground(74, 105);
      B.block(78, 6, 'lantern');
      B.enemy('yuki', 82); B.enemy('toge', 86);
      B.pillar(90, 2); B.pillar(91, 4); B.gem(91, 2, 1);
      B.iceGround(94, 102); B.enemy('yuki', 98);
      B.block(100, 6, 'oneup', 'H');
      B.ground(109, LEVEL_W - 1);
      for (let i = 0; i < 4; i++) B.pillar(114 + i, i + 1);
      B.gem(117, 3, 2);
      B.iceGround(120, 128); B.enemy('yuki', 124); B.enemy('moyan', 128);
      B.wallEnd();
    } },
    // ---------------- 3-2 こおりのどうくつ（落ちてくるつらら）
    '3-2': { w: 160, theme: 'icecave', checkpoint: 70, goal: 146, build(B) {
      B.ground(0, 26);
      B.stamps(5, 8, 8);
      B.block(10, 6, 'bag');
      B.ice(14, 20, 3); B.enemy('tsurara', 15, 4); B.enemy('tsurara', 17, 4); B.enemy('tsurara', 19, 4);
      B.enemy('yuki', 23);
      B.ground(30, 66);
      B.iceGround(34, 44); B.ice(36, 42, 3); B.enemy('tsurara', 37, 4); B.enemy('tsurara', 40, 4);
      B.enemy('yuki', 41);
      B.pillar(48, 2); B.pillar(49, 3); B.gem(49, 4, 0);
      B.enemy('toge', 53);
      B.plank(56, 60, 7); B.stamps(56, 60, 5);
      B.enemy('pata', 62, 6);
      B.ground(70, 108);
      B.block(74, 6); B.block(75, 6, 'onigiri'); B.block(76, 6);
      B.ice(80, 88, 3); B.enemy('tsurara', 81, 4); B.enemy('tsurara', 84, 4); B.enemy('tsurara', 87, 4);
      B.enemy('yuki', 85);
      B.iceGround(90, 98); B.gem(94, 7, 1); B.enemy('yuki', 96);
      B.pillar(102, 2); B.pillar(103, 4);
      B.mover(109, 8, 3, 2, 1.3);
      B.ground(114, LEVEL_W - 1);
      for (let i = 0; i < 4; i++) B.pillar(118 + i, i + 1);
      for (let x = 122; x <= 125; x++) B.pillar(x, 4);
      B.gem(124, 3, 2);
      B.ice(130, 136, 3); B.enemy('tsurara', 131, 4); B.enemy('tsurara', 134, 4);
      B.enemy('yuki', 138); B.enemy('moyan', 140);
      B.wallEnd();
    } },
    // ---------------- 3-3 オーロラの丘（灯台）
    '3-3': { w: 170, theme: 'aurora', checkpoint: 68, goal: 156, lighthouse: true, build(B) {
      B.ground(0, 24);
      B.block(9, 6, 'plane');
      B.enemy('yuki', 14); B.enemy('pata', 18, 6);
      B.ground(28, 62);
      B.iceGround(30, 40); B.ice(32, 38, 3); B.enemy('tsurara', 33, 4); B.enemy('tsurara', 36, 4);
      B.enemy('yuki', 36);
      B.pillar(44, 2); B.enemy('toge', 47);
      B.plank(50, 54, 7); B.stamps(50, 54, 5); B.gem(52, 3, 0);
      B.enemy('yuki', 57); B.enemy('yuki', 59);
      B.mover(63, 8, 3, 2, 1.4);
      B.ground(67, 110);
      B.block(72, 6, 'scarf');
      B.enemy('yuki', 76); B.enemy('yuki', 78); B.enemy('toge', 80); B.enemy('pata', 83, 6);
      B.iceGround(86, 96); B.ice(88, 94, 3); B.enemy('tsurara', 89, 4); B.enemy('tsurara', 92, 4);
      B.pillar(99, 2); B.pillar(100, 4); B.gem(100, 2, 1);
      B.block(105, 6, 'oneup', 'H');
      B.ground(114, LEVEL_W - 1);
      for (let i = 0; i < 4; i++) B.pillar(120 + i, i + 1);
      for (let x = 124; x <= 127; x++) B.pillar(x, 4);
      B.gem(126, 3, 2);
      B.enemy('yuki', 134); B.enemy('toge', 138); B.enemy('pata', 142, 6);
      B.wallEnd();
    } },
    // ---------------- ボス：雪だるま将軍
    '3-B': { w: 28, theme: 'blizzard', checkpoint: null, goal: null, build(B) {
      B.ground(0, 27);
      for (let y = 0; y < 10; y++) { B.set(0, y, '#'); B.set(27, y, '#'); }
      B.plank(5, 7, 6); B.plank(20, 22, 6);
      B.boss('snow');
    } },

    // ================= ワールド4：シズク海底島（ここから少しむずかしい） =================
    // ---------------- 4-1 しおかぜの海岸（くずれる足場・トゲの柱・敵をふんでわたる）
    '4-1': { w: 170, theme: 'coast', time: 260, checkpoint: 80, goal: 156, build(B) {
      B.ground(0, 20);
      B.stamps(5, 8, 8);
      B.block(10, 6); B.block(11, 6, 'boots'); B.block(12, 6);
      B.enemy('moyan', 16);
      B.crumble(21, 28, 10); B.stamps(22, 27, 8);               // くずれる橋：止まらずにわたる
      B.ground(29, 58);
      B.piston(33, 2, 2.6, 0); B.piston(37, 2, 2.6, 1.3); B.piston(41, 2, 2.6, 0);
      B.stamps(35, 39, 7);
      B.enemy('moyan', 46); B.enemy('toge', 50);
      B.block(53, 6, 'onigiri');
      // 大きな穴：うかぶ雲をふんでわたる
      B.enemy('hover', 61.5, 8); B.enemy('hover', 65, 8); B.enemy('hover', 68.5, 8);
      B.gem(65, 3, 0);
      B.ground(72, 112);
      B.zap(84, 4, 9, 2.6, 1.1, 0); B.plank(85, 89, 6); B.gem(87, 3, 1); B.zap(90, 4, 9, 2.6, 1.1, 1.3);
      B.enemy('moyan', 87);
      B.piston(98, 2, 2.2, 0); B.piston(101, 2, 2.2, 0.5); B.piston(104, 2, 2.2, 1.0);
      B.block(108, 6, 'oneup', 'H');
      B.crumble(115, 116, 9); B.crumble(119, 120, 8);
      B.ground(123, LEVEL_W - 1);
      // 高い台：上下に動く板でのぼる
      B.vmover(126, 4, 2, 4, 1.2);
      for (let x = 128; x <= 131; x++) B.pillar(x, 6);
      B.gem(130, 2, 2);
      B.enemy('moyan', 136);
      B.piston(140, 2, 2.4, 0); B.piston(143, 2, 2.4, 0.6);
      B.zap(148, 5, 9, 2.4, 1.0, 0.6);
      B.wallEnd();
    } },
    // ---------------- 4-2 しんかいの森（泳ぐ・電気の門・ウニ）
    '4-2': { w: 160, theme: 'deep', time: 260, checkpoint: 74, goal: 146, water: true, build(B) {
      B.ceiling(0, LEVEL_W - 1, 1);
      B.ground(0, 29);
      B.stamps(5, 8, 6);
      B.block(10, 6, 'bag');
      B.enemy('sakana', 14, 7);
      B.hang(18, 2, 6); B.enemy('uni', 21, 10); B.pillar(23, 5);
      B.stamps(18, 18, 8); B.stamps(23, 23, 3);
      // 深いみぞ（しずむとミス）
      B.ground(38, 65);
      B.zap(42, 2, 9, 2.8, 1.2, 0); B.zap(47, 2, 9, 2.8, 1.2, 1.4);
      B.enemy('sakana', 51, 5); B.enemy('uni', 55, 10); B.enemy('uni', 53, 3);
      B.pillar(60, 4); B.gem(62, 3, 0); B.hang(64, 2, 5);
      B.ground(72, 109);
      B.zap(78, 2, 9, 2.4, 1.0, 0); B.zap(82, 2, 9, 2.4, 1.0, 0.8); B.zap(86, 2, 9, 2.4, 1.0, 1.6);
      B.enemy('sakana', 80, 6); B.enemy('sakana', 88, 4);
      B.pillar(92, 5); B.enemy('uni', 94, 10); B.hang(96, 2, 6); B.gem(96, 8, 1); B.enemy('uni', 98, 3); B.pillar(100, 5);
      B.block(104, 6, 'oneup', 'H');
      B.ground(118, LEVEL_W - 1);
      B.enemy('sakana', 122, 6); B.enemy('sakana', 126, 8); B.enemy('sakana', 130, 5);
      B.zap(134, 2, 9, 2.6, 1.2, 0.5);
      B.pillar(139, 3); B.gem(140, 3, 2);
      B.wallEnd();
    } },
    // ---------------- 4-3 さんごしょうの灯台（上下の板・速いトゲ・ゆれる雲）
    '4-3': { w: 170, theme: 'reef', time: 260, checkpoint: 82, goal: 156, lighthouse: true, build(B) {
      B.ground(0, 18);
      B.block(8, 6, 'plane');
      B.enemy('moyan', 13);
      B.vmover(20, 5, 2, 3, 1.4, 0); B.vmover(24, 5, 2, 3, 1.4, 1.6);
      B.ground(29, 60);
      B.piston(33, 2, 2.0, 0); B.piston(35, 2, 2.0, 0.35); B.piston(37, 2, 2.0, 0.7);
      B.zap(42, 5, 9, 2.4, 1.0, 0);
      B.enemy('moyan', 46); B.enemy('toge', 49);
      B.crumble(52, 56, 7); B.gem(54, 4, 0); B.stamps(52, 56, 5);
      // ゆれる雲をふんでわたる
      B.enemy('hover', 63, 8, { sway: 0.35 }); B.enemy('hover', 66.5, 8, { sway: 0.35 }); B.enemy('hover', 70, 8, { sway: 0.35 });
      B.ground(74, 112);
      B.zap(86, 4, 9, 2.2, 0.9, 0); B.zap(89, 4, 9, 2.2, 0.9, 1.1);
      B.piston(94, 2, 2.0, 0); B.piston(97, 2, 2.0, 0.4); B.piston(100, 2, 2.0, 0.8);
      B.block(103, 6, 'scarf');
      B.vmover(105, 3, 2, 5, 1.2);
      for (let x = 107; x <= 111; x++) B.pillar(x, 5);
      B.gem(110, 2, 1);
      B.crumble(114, 115, 9); B.crumble(117, 118, 8); B.crumble(120, 121, 9);
      B.ground(124, LEVEL_W - 1);
      for (let i = 0; i < 4; i++) B.pillar(127 + i, i + 1);
      B.enemy('moyan', 136);
      B.zap(140, 5, 9, 2.4, 1.0, 0.3);
      B.piston(146, 2, 2.2, 0); B.piston(149, 2, 2.2, 0.7);
      B.gem(130, 2, 2);
      B.wallEnd();
    } },
    // ---------------- ボス：大ダコ ヌルリン
    '4-B': { w: 28, theme: 'tide', time: 160, checkpoint: null, goal: null, build(B) {
      B.ground(0, 27);
      for (let y = 0; y < 10; y++) { B.set(0, y, '#'); B.set(27, y, '#'); }
      B.plank(5, 7, 6); B.plank(20, 22, 6);
      B.boss('tako');
    } },

    // ================= ワールド5：クモリ城（第一幕のさいご） =================
    '5-1': { w: 170, theme: 'castle', time: 280, checkpoint: 60, goal: 156, build(B) {
      B.ground(0, 22); B.stamps(5, 8, 8);
      B.block(10, 6); B.block(11, 6, 'boots'); B.block(12, 6);
      B.enemy('moyan', 16); B.enemy('toge', 19);
      B.ground(23, 40);
      B.bolt(26, 3.0, 0); B.bolt(30, 3.0, 1.0); B.bolt(34, 3.0, 2.0);       // 雷：雲が光ったら止まる
      B.door(38, 6, 9, 3.2, 1.5, 0);                                     // 扉：開いたらすばやく通る
      B.enemy('hover', 43.5, 8); B.enemy('hover', 47, 8); B.enemy('hover', 50.5, 8);
      B.ground(54, 100);
      B.enemy('pata', 64, 6);
      B.crumble(66, 70, 7); B.gem(68, 4, 0);
      B.piston(74, 2, 2.0, 0); B.piston(76, 2, 2.0, 0.3); B.piston(78, 2, 2.0, 0.6);
      B.door(83, 5, 9, 2.8, 1.2, 0.5);
      B.bolt(88, 2.6, 0.4); B.enemy('toge', 90); B.bolt(92, 2.6, 1.7);
      B.block(95, 6, 'onigiri');
      B.vmover(102, 5, 2, 3, 1.3, 0); B.vmover(106, 5, 2, 3, 1.3, 1.5);
      B.ground(110, LEVEL_W - 1);
      B.wind(116, 128, 4.0, 1.6, -80, 0);                               // 向かい風の中のトゲ
      B.piston(120, 2, 2.4, 0); B.piston(124, 2, 2.4, 1.2);
      B.plank(120, 124, 6); B.gem(122, 3, 1);
      B.enemy('moyan', 132);
      B.door(137, 5, 9, 3.0, 1.3, 0);
      for (let i = 0; i < 4; i++) B.pillar(141 + i, i + 1);
      B.gem(144, 3, 2);
      B.bolt(150, 2.4, 0);
      B.wallEnd();
    } },
    '5-2': { w: 170, theme: 'castleIn', time: 280, checkpoint: 82, goal: 156, build(B) {
      B.ceiling(0, LEVEL_W - 1, 1);
      B.ground(0, 24); B.stamps(4, 7, 8);
      B.block(9, 6, 'lantern');
      B.conveyor(14, 22, 10, -1); B.enemy('moyan', 18);                    // ベルトコンベア（左へ）
      B.cmover(30, 7, 2.5, 1.4, 0, 3);                                   // 回る足場
      B.ground(35, 70);
      B.door(40, 5, 9, 2.6, 1.2, 0);
      B.zap(45, 5, 9, 2.4, 1.0, 0.6);
      B.conveyor(48, 56, 10, 1); B.piston(52, 2, 2.2, 0); B.piston(55, 2, 2.2, 0.33);
      B.enemy('toge', 60); B.enemy('moyan', 63);
      B.plank(64, 68, 6); B.gem(66, 3, 0);
      B.crumble(72, 73, 9); B.crumble(76, 77, 8);
      B.ground(80, 120);
      B.zap(86, 4, 9, 2.4, 1.0, 0); B.zap(89, 4, 9, 2.4, 1.0, 0.8); B.zap(92, 4, 9, 2.4, 1.0, 1.6);
      B.conveyor(95, 105, 10, 1); B.piston(98, 2, 2.0, 0); B.piston(101, 2, 2.0, 0.33);
      B.door(108, 5, 9, 3.0, 1.2, 0.3);
      B.block(112, 6, 'oneup', 'H');
      B.plank(114, 118, 6); B.gem(116, 3, 1);
      B.cmover(126.5, 7, 3, 1.2, 0, 3);
      B.ground(132, LEVEL_W - 1);
      for (let i = 0; i < 4; i++) B.pillar(136 + i, i + 1);
      for (let x = 140; x <= 143; x++) B.pillar(x, 4);
      B.gem(142, 3, 2);
      B.door(147, 6, 9, 2.6, 1.1, 0);
      B.zap(151, 5, 9, 2.2, 1.0, 0.5);
      B.wallEnd();
    } },
    '5-3': { w: 170, theme: 'castleTop', time: 280, checkpoint: 76, goal: 156, lighthouse: true, build(B) {
      B.ground(0, 20);
      B.block(8, 6, 'plane'); B.enemy('moyan', 13);
      B.ground(21, 27); B.crumble(28, 33, 10); B.ground(34, 60);
      B.wind(21, 40, 3.8, 1.4, -90, 0);                                  // 向かい風＋くずれる橋（風がやんだらわたる）
      B.bolt(38, 2.6, 0); B.bolt(42, 2.6, 0.9); B.bolt(46, 2.6, 1.8);
      B.enemy('toge', 50);
      B.piston(54, 2, 1.8, 0); B.piston(56, 2, 1.8, 0.5);
      B.enemy('hover', 63, 8, { sway: 0.35 }); B.enemy('hover', 66.5, 8, { sway: 0.35 }); B.enemy('hover', 70, 8, { sway: 0.35 });
      B.ground(74, 112);
      B.door(80, 5, 9, 3.0, 1.2, 0);
      B.conveyor(84, 92, 10, -1);
      B.zap(95, 4, 9, 2.2, 0.9, 0); B.zap(98, 4, 9, 2.2, 0.9, 1.1);
      B.block(101, 6, 'scarf');
      B.vmover(104, 3, 2, 5, 1.2);
      for (let x = 106; x <= 110; x++) B.pillar(x, 5);
      B.gem(108, 2, 1);
      B.crumble(114, 115, 9); B.crumble(117, 118, 8); B.crumble(120, 121, 9);
      B.ground(123, LEVEL_W - 1);
      for (let i = 0; i < 4; i++) B.pillar(126 + i, i + 1);
      B.gem(129, 3, 2);
      B.bolt(134, 2.2, 0); B.enemy('moyan', 136); B.bolt(138, 2.2, 1.1);
      B.wind(140, 150, 3.0, 1.4, -90, 0.5);
      B.wallEnd();
    } },
    '5-B': { w: 28, theme: 'thunder', time: 180, checkpoint: null, goal: null, build(B) {
      B.ground(0, 27);
      for (let y = 0; y < 10; y++) { B.set(0, y, '#'); B.set(27, y, '#'); }
      B.plank(5, 7, 6); B.plank(20, 22, 6);
      B.boss('baron');
    } },

    // ================= ワールド6：歯車の時計島（第二幕） =================
    '6-1': { w: 170, theme: 'clock', time: 300, checkpoint: 80, goal: 156, build(B) {
      B.ground(0, 20); B.stamps(4, 7, 8);
      B.block(9, 6); B.block(10, 6, 'boots'); B.block(11, 6);
      B.enemy('moyan', 15); B.enemy('toge', 18);
      B.cmover(26.5, 7, 3, 1.3, 0, 3);
      B.ground(33, 64);
      B.conveyor(36, 46, 10, 1); B.piston(40, 2, 2.0, 0); B.piston(43, 2, 2.0, 0.33);
      B.plank(42, 46, 6); B.gem(44, 3, 0);
      B.door(50, 5, 9, 2.6, 1.0, 0);
      B.enemy('moyan', 55);
      B.zap(59, 4, 9, 2.2, 0.9, 0.4);
      B.enemy('hover', 67.5, 8); B.enemy('hover', 71, 8); B.enemy('hover', 74.5, 8);
      B.ground(78, 118);
      B.door(86, 5, 9, 2.6, 1.0, 0); B.door(90, 5, 9, 2.6, 1.0, 1.3);
      B.conveyor(93, 103, 10, 1);
      B.piston(96, 2, 1.8, 0); B.piston(99, 2, 1.8, 0.33); B.piston(102, 2, 1.8, 0.66);
      B.block(106, 6, 'onigiri');
      B.vmover(110, 3, 2, 5, 1.4);
      for (let x = 112; x <= 116; x++) B.pillar(x, 5);
      B.gem(114, 2, 1);
      B.cmover(122, 7, 2, 1.5, 0, 2); B.cmover(127.5, 7, 2, 1.5, Math.PI / 1.5, 2);
      B.ground(131, LEVEL_W - 1);
      B.pillar(136, 4); B.pillar(135, 2); B.gem(136, 3, 2);
      B.zap(142, 4, 9, 2.0, 0.8, 0); B.zap(145, 4, 9, 2.0, 0.8, 1.0);
      B.door(150, 5, 9, 2.4, 1.0, 0.2);
      B.wallEnd();
    } },
    '6-2': { w: 170, theme: 'clockIn', time: 300, checkpoint: 83, goal: 156, build(B) {
      B.ceiling(0, LEVEL_W - 1, 1);
      B.ground(0, 22);
      B.block(9, 6, 'lantern');
      B.conveyor(13, 21, 10, -1); B.enemy('moyan', 18);
      B.crumble(24, 25, 9); B.crumble(27, 28, 8); B.crumble(30, 31, 9);
      B.ground(34, 66);
      B.door(38, 4, 9, 2.4, 1.0, 0); B.door(42, 4, 9, 2.4, 1.0, 1.2);
      B.piston(46, 2, 1.6, 0); B.piston(48, 2, 1.6, 0.27); B.piston(50, 2, 1.6, 0.54);
      B.plank(45, 51, 6); B.gem(48, 3, 0);
      B.conveyor(53, 62, 10, 1);
      B.zap(58, 4, 9, 2.0, 0.8, 0.3);
      B.cmover(70.5, 6, 2, 1.3, 0, 3); B.cmover(76.5, 6, 2, 1.3, Math.PI, 3);
      B.ground(81, 120);
      B.wind(86, 100, 3.2, 1.4, -80, 0);
      B.piston(90, 2, 2.2, 0); B.piston(94, 2, 2.2, 1.1);
      B.enemy('toge', 97);
      B.block(103, 6, 'scarf');
      B.door(107, 4, 9, 2.6, 1.0, 0.5);
      B.vmover(111, 3, 2, 5, 1.3);
      for (let x = 113; x <= 117; x++) B.pillar(x, 5);
      B.gem(115, 2, 1);
      B.enemy('hover', 123.5, 8, { sway: 0.4 }); B.enemy('hover', 127, 8, { sway: 0.4 }); B.enemy('hover', 130.5, 8, { sway: 0.4 });
      B.ground(134, LEVEL_W - 1);
      B.zap(139, 4, 9, 1.8, 0.7, 0); B.zap(142, 4, 9, 1.8, 0.7, 0.6); B.zap(145, 4, 9, 1.8, 0.7, 1.2);
      B.pillar(149, 2); B.pillar(150, 4); B.gem(150, 3, 2);
      B.wallEnd();
    } },
    '6-3': { w: 170, theme: 'clockDusk', time: 300, checkpoint: 79, goal: 156, lighthouse: true, build(B) {
      B.ground(0, 18);
      B.block(8, 6, 'plane'); B.enemy('moyan', 13);
      B.vmover(20, 5, 2, 3, 1.5, 0); B.vmover(24, 5, 2, 3, 1.5, 1.6);
      B.ground(29, 62);
      B.conveyor(32, 40, 10, 1); B.piston(34, 2, 1.8, 0); B.piston(37, 2, 1.8, 0.33);
      B.door(44, 4, 9, 2.4, 1.0, 0);
      B.zap(48, 4, 9, 2.0, 0.8, 0.5);
      B.crumble(52, 57, 7); B.gem(54, 4, 0);
      B.cmover(66.5, 7, 2.5, 1.5, 0, 3); B.cmover(73, 7, 2.5, 1.5, Math.PI, 3);
      B.ground(78, 116);
      B.door(84, 4, 9, 2.0, 0.9, 0); B.door(87, 4, 9, 2.0, 0.9, 1.0);
      B.wind(90, 104, 3.0, 1.4, -90, 0.3);
      B.piston(93, 2, 1.6, 0); B.piston(96, 2, 1.6, 0.2); B.piston(99, 2, 1.6, 0.4); B.piston(102, 2, 1.6, 0.6);
      B.block(106, 6, 'oneup', 'H');
      B.vmover(108, 3, 2, 5, 1.3);
      for (let x = 110; x <= 114; x++) B.pillar(x, 5);
      B.gem(112, 2, 1);
      B.crumble(118, 119, 9); B.crumble(121, 122, 8); B.crumble(124, 125, 9);
      B.ground(128, LEVEL_W - 1);
      for (let i = 0; i < 4; i++) B.pillar(131 + i, i + 1);
      B.gem(134, 3, 2);
      B.zap(140, 4, 9, 1.8, 0.8, 0); B.door(144, 4, 9, 2.2, 0.9, 0.4);
      B.wallEnd();
    } },
    '6-B': { w: 28, theme: 'clockBoss', time: 180, checkpoint: null, goal: null, build(B) {
      B.ground(0, 27);
      for (let y = 0; y < 10; y++) { B.set(0, y, '#'); B.set(27, y, '#'); }
      B.plank(5, 7, 6); B.plank(20, 22, 6);
      B.boss('gear');
    } },

    // ================= ワールド7：時の灯台（第二幕のさいご） =================
    '7-1': { w: 170, theme: 'time', time: 300, checkpoint: 82, goal: 156, build(B) {
      B.ground(0, 18); B.stamps(4, 7, 8);
      B.block(9, 6, 'boots'); B.enemy('moyan', 14);
      B.enemy('hover', 21.5, 8, { sway: 0.4 }); B.enemy('hover', 25, 8, { sway: 0.4 }); B.enemy('hover', 28.5, 8, { sway: 0.4 });
      B.ground(32, 66);
      B.bolt(36, 2.0, 0); B.bolt(39, 2.0, 0.6); B.bolt(42, 2.0, 1.2);
      B.door(46, 4, 9, 2.2, 0.9, 0);
      B.conveyor(49, 58, 10, 1); B.piston(52, 2, 1.6, 0); B.piston(55, 2, 1.6, 0.33);
      B.plank(53, 57, 6); B.gem(55, 3, 0);
      B.zap(62, 4, 9, 1.8, 0.7, 0.3);
      B.cmover(70, 6, 2, 1.5, 0, 3); B.cmover(75.5, 6, 2, 1.5, Math.PI, 3);
      B.ground(80, 118);
      B.wind(86, 100, 2.8, 1.4, -100, 0);
      B.bolt(89, 2.4, 0.3); B.bolt(95, 2.4, 1.5);
      B.crumble(102, 106, 7); B.gem(104, 4, 1);
      B.door(110, 4, 9, 2.0, 0.9, 0); B.door(113, 4, 9, 2.0, 0.9, 1.0);
      B.crumble(120, 121, 9); B.crumble(123, 124, 8); B.crumble(126, 127, 9);
      B.ground(130, LEVEL_W - 1);
      B.piston(135, 2, 1.4, 0); B.piston(137, 2, 1.4, 0.2); B.piston(139, 2, 1.4, 0.4); B.piston(141, 2, 1.4, 0.6);
      B.zap(146, 4, 9, 1.8, 0.7, 0);
      B.pillar(149, 2); B.pillar(150, 4); B.gem(150, 3, 2);
      B.wallEnd();
    } },
    '7-2': { w: 170, theme: 'timeIn', time: 300, checkpoint: 86, goal: 156, build(B) {
      B.ceiling(0, LEVEL_W - 1, 1);
      B.ground(0, 22);
      B.block(8, 6, 'bag');
      B.cmover(27.5, 6, 3, 1.1, 0, 3);
      B.ground(33, 70);
      B.zap(38, 4, 9, 1.8, 0.7, 0); B.zap(41, 4, 9, 1.8, 0.7, 0.6); B.zap(44, 4, 9, 1.8, 0.7, 1.2);
      B.conveyor(47, 60, 10, 1);
      B.piston(50, 2, 1.6, 0); B.piston(53, 2, 1.6, 0.33); B.piston(56, 2, 1.6, 0.66); B.piston(59, 2, 1.6, 0.99);
      B.plank(50, 56, 6); B.gem(53, 3, 0);
      B.door(64, 4, 9, 2.2, 0.9, 0.4);
      B.enemy('hover', 73.5, 8, { sway: 0.45 }); B.enemy('hover', 77, 8, { sway: 0.45 }); B.enemy('hover', 80.5, 8, { sway: 0.45 });
      B.ground(84, 120);
      B.door(90, 4, 9, 2.4, 1.0, 0); B.door(93, 4, 9, 2.4, 1.0, 0.8); B.door(96, 4, 9, 2.4, 1.0, 1.6);
      B.wind(99, 112, 3.0, 1.4, -90, 0);
      B.crumble(103, 108, 7); B.gem(105, 4, 1);
      B.block(114, 6, 'scarf');
      B.vmover(122, 5, 2, 3, 1.4, 0); B.cmover(128, 6, 2, 1.3, 0, 3);
      B.ground(132, LEVEL_W - 1);
      B.zap(136, 4, 9, 1.6, 0.6, 0); B.zap(140, 4, 9, 1.6, 0.6, 0.5); B.zap(144, 4, 9, 1.6, 0.6, 1.0);
      B.pillar(147, 2); B.pillar(148, 4); B.gem(148, 3, 2);
      B.wallEnd();
    } },
    '7-3': { w: 170, theme: 'timeTop', time: 300, checkpoint: 60, goal: 156, lighthouse: true, build(B) {
      B.ground(0, 16);
      B.block(7, 6, 'plane'); B.enemy('moyan', 12);
      B.ground(17, 18); B.crumble(19, 24, 10); B.ground(25, 44);
      B.wind(17, 40, 3.6, 1.4, -90, 0);
      B.bolt(29, 2.0, 0); B.bolt(33, 2.0, 0.7); B.bolt(37, 2.0, 1.4);
      B.enemy('hover', 47.5, 8, { sway: 0.45 }); B.enemy('hover', 51, 8, { sway: 0.45 }); B.enemy('hover', 54.5, 8, { sway: 0.45 });
      B.ground(58, 92);
      B.conveyor(62, 72, 10, 1); B.piston(65, 2, 1.4, 0); B.piston(68, 2, 1.4, 0.33); B.piston(71, 2, 1.4, 0.66);
      B.plank(65, 71, 6); B.gem(68, 3, 0);
      B.door(76, 4, 9, 2.0, 0.9, 0); B.zap(80, 4, 9, 1.8, 0.7, 0.6); B.door(84, 4, 9, 2.0, 0.9, 1.1);
      B.cmover(96.5, 7, 2.5, 1.6, 0, 3); B.cmover(103, 7, 2.5, 1.6, Math.PI, 3);
      B.ground(108, LEVEL_W - 1);
      B.vmover(112, 3, 2, 5, 1.5);
      for (let x = 114; x <= 118; x++) B.pillar(x, 5);
      B.gem(116, 2, 1);
      B.bolt(122, 2.0, 0); B.bolt(126, 2.0, 1.0);
      B.piston(130, 2, 1.4, 0); B.piston(132, 2, 1.4, 0.3); B.piston(134, 2, 1.4, 0.6);
      B.zap(138, 4, 9, 1.6, 0.6, 0); B.zap(141, 4, 9, 1.6, 0.6, 0.8);
      B.wind(144, 152, 2.6, 1.2, -110, 0.4);
      B.pillar(147, 3); B.gem(147, 2, 2);
      B.wallEnd();
    } },
    '7-B': { w: 28, theme: 'timeBoss', time: 200, checkpoint: null, goal: null, build(B) {
      B.ground(0, 27);
      for (let y = 0; y < 10; y++) { B.set(0, y, '#'); B.set(27, y, '#'); }
      B.plank(5, 7, 6); B.plank(20, 22, 6);
      B.boss('toki');
    } },
  };

  function buildLevel(idOverride) {
    const id = idOverride || STAGES[stageIndex].id;
    const def = LEVEL_DEFS[id];
    levelDef = def;
    curWorld = Number(id[0]);
    LEVEL_W = def.w;
    level.length = 0;
    for (const k in contents) delete contents[k];
    for (const k in parcelHits) delete parcelHits[k];
    for (const k in gemSpots) delete gemSpots[k];
    enemies = []; movers = []; boss = null; shockwaves = []; bigGem = null; bossShots = [];
    traps = []; crumbles = {}; trapClock = 0; slams = [];
    for (let r = 0; r < ROWS; r++) level.push(new Array(LEVEL_W).fill('.'));
    START = { x: 3 * TILE, y: 10 * TILE };
    CHECKPOINT = def.checkpoint ? { x: def.checkpoint * TILE, y: 10 * TILE } : null;
    goal = def.goal ? { x: def.goal * TILE, y: 10 * TILE - 20, w: 16, h: 20 } : null;
    const newTheme = THEMES[def.theme];
    if (theme !== newTheme) { theme = newTheme; if (sky) makeSky(); }
    def.build(makeBuilder());
    // すでに取ったかけらは、半とうめいで表示（もう一度取れる）
  }

  // ワールド1のステージ一覧（playable=false は準備中）
  const WORLDS = {
    1: { name: 'はじまりの草原島', boss: '大ガエル ゲコドン', icon: 'GEKO' },
    2: { name: 'カラカラ砂丘島', boss: '砂ムカデ ザラザラ', icon: 'ZARA_HEAD' },
    3: { name: 'ツララ雪原島', boss: '雪だるま将軍', icon: 'SNOWMAN' },
    4: { name: 'シズク海底島', boss: '大ダコ ヌルリン', icon: 'TAKO' },
    5: { name: 'クモリ城', boss: 'クモリ男爵', icon: 'BARON' },
    6: { name: '歯車の時計島', boss: 'ギアゴーレム', icon: 'GEARBOT' },
    7: { name: '時の灯台', boss: '時の番人 トキモリ', icon: 'TOKIMORI' },
  };
  const STAGES = [];
  for (const w of [1, 2, 3, 4, 5, 6, 7]) {
    for (const k of ['1', '2', '3']) STAGES.push({ id: `${w}-${k}`, w, label: `${w}-${k}`, playable: true });
    STAGES.push({ id: `${w}-B`, w, label: 'BOSS', playable: true, boss: true });
  }
  let stageIndex = 0;

  // ------------------------------------------------------------------ セーブ（この端末のブラウザに保存）
  const SAVE_KEY = 'mister-postman-save-v1';
  const emptySave = () => ({ cleared: {}, best: {}, gems: {}, last: 0, prologue: false, chapters: {}, preboss: {} });
  let save = emptySave();
  function loadSave() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (raw) save = Object.assign(emptySave(), JSON.parse(raw));
      if (save.chapter1) { save.chapters[1] = true; delete save.chapter1; }   // 古いセーブのつづき
      if (!save.preboss) save.preboss = {};
    } catch (e) { save = emptySave(); }
  }
  let writeSave = function () {
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); } catch (e) { /* 保存できない環境でも遊べる */ }
  }
  const hasSave = () => save.prologue || Object.keys(save.cleared).length > 0;

  // 色をうばわれた世界：クリアするまで色がうすい
  function setSat(v, animate) {
    canvas.style.transition = animate ? 'filter 1.4s ease-out' : 'none';
    canvas.style.filter = `saturate(${v})`;
  }

  const isSolid = c => c === '#' || c === 'B' || c === 'P' || c === 'U' || c === 'I' || c === 'Q' || c === 'C' || c === 'D' || c === '<' || c === '>';
  const tileAt = (tx, ty) => (tx < 0 || tx >= LEVEL_W) ? '#' : (ty < 0 || ty >= ROWS) ? '.' : level[ty][tx];
  const overlap = (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;

  // ------------------------------------------------------------------ 画面サイズ
  let viewW = 320, viewH = BASE_H;
  let sky = null;

  function resize() {
    const dpr = window.devicePixelRatio || 1;
    const devW = Math.round(innerWidth * dpr), devH = Math.round(innerHeight * dpr);
    // ドットがきれいに見えるよう、拡大率は整数にする
    const scale = Math.max(1, Math.floor(devH / BASE_H));
    viewW = Math.ceil(devW / scale);
    viewH = Math.ceil(devH / scale);
    canvas.width = viewW; canvas.height = viewH;
    canvas.style.width = (viewW * scale / dpr) + 'px';
    canvas.style.height = (viewH * scale / dpr) + 'px';
    ctx.imageSmoothingEnabled = false;
    makeSky();
  }

  // ------------------------------------------------------------------ 背景
  const lerp = (a, b, t) => a + (b - a) * t;
  function mix(c1, c2, t) { return `rgb(${c1.map((v, i) => Math.round(lerp(v, c2[i], t))).join(',')})`; }

  function makeSky() {
    sky = document.createElement('canvas');
    sky.width = 1; sky.height = viewH;
    const g = sky.getContext('2d');
    for (let y = 0; y < viewH; y += 6) {           // 段々のグラデーション（ドット絵らしく）
      const T = theme || THEMES.meadow;
      g.fillStyle = mix(T.sky[0], T.sky[1], y / viewH);
      g.fillRect(0, y, 1, 6);
    }
  }

  const LAYERS = [
    { col: '#96baec', base: 108, amp: 26, f: 0.022, ph: 0.5, par: 0.15 },
    { col: '#70a6ce', base: 124, amp: 18, f: 0.035, ph: 2.0, par: 0.3 },
  ];
  const PERIOD = 2048;
  for (const L of LAYERS) {
    L.h = new Int16Array(PERIOD);
    const k = (2 * Math.PI) / PERIOD;
    const n1 = Math.round(L.f * PERIOD / (2 * Math.PI)) || 1;
    for (let x = 0; x < PERIOD; x++) {
      L.h[x] = Math.round(L.base - L.amp * (0.6 * Math.sin(x * k * n1 + L.ph) + 0.4 * Math.sin(x * k * n1 * 2 + L.ph * 3)));
    }
  }

  function makeCloud(w) {
    const c = document.createElement('canvas'); c.width = w; c.height = 16;
    const g = c.getContext('2d');
    const blobs = [[0.3, 6], [0.55, 8], [0.78, 5], [0.15, 4]];
    g.fillStyle = '#d6e8fc';
    blobs.forEach(([cx, r]) => { g.beginPath(); g.ellipse(w * cx, 15 - r, r, r, 0, 0, 7); g.fill(); });
    g.fillStyle = '#fff';
    blobs.forEach(([cx, r]) => { g.beginPath(); g.ellipse(w * cx, 13 - r, r, r - 1, 0, 0, 7); g.fill(); });
    return c;
  }
  const CLOUDS = [[20, 34, makeCloud(44)], [150, 22, makeCloud(56)], [300, 50, makeCloud(36)], [430, 30, makeCloud(48)]];

  // ------------------------------------------------------------------ タイル画像
  const TILESETS = {
    grass: { dirt: [[196, 124, 64], [140, 80, 42]], top: ['#46aa3c', '#6ed246', '#aaf06e', '#287832'] },
    sand: { dirt: [[226, 190, 120], [188, 144, 86]], top: ['#e2c070', '#f0d890', '#fff0b4', '#b8904c'] },
    snow: { dirt: [[150, 162, 196], [106, 116, 152]], top: ['#dce8f8', '#f4f8ff', '#ffffff', '#a8b8d8'] },
    wetsand: { dirt: [[214, 196, 150], [168, 148, 108]], top: ['#e8d8a8', '#f8ecc4', '#ffffff', '#b8a070'] },
    rock: { dirt: [[110, 132, 146], [72, 88, 104]], top: ['#2e9a8c', '#4cc4ae', '#98ead8', '#1a625c'] },
    stone: { dirt: [[112, 106, 134], [76, 70, 98]], top: ['#8a84a8', '#a8a2c4', '#d0cce4', '#5a5478'] },
    brass: { dirt: [[176, 136, 82], [128, 94, 52]], top: ['#d8b060', '#f0cc78', '#fff0b0', '#8a6430'] },
    time: { dirt: [[92, 82, 142], [56, 48, 100]], top: ['#b8a8f0', '#d8ccff', '#ffffff', '#6a58b0'] },
  };
  function makeGroundTile(top, seed, ts = TILESETS.grass) {
    const c = document.createElement('canvas'); c.width = 16; c.height = 16;
    const g = c.getContext('2d');
    let s = seed;
    const rnd = () => (s = (s * 9301 + 49297) % 233280) / 233280;
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
      const t = y / 15;
      let col = [0, 1, 2].map(i => lerp(ts.dirt[0][i], ts.dirt[1][i], t));
      if (rnd() < 0.08) col = col.map(v => v * 0.75);
      g.fillStyle = `rgb(${col.map(Math.round).join(',')})`; g.fillRect(x, y, 1, 1);
    }
    for (let i = 0; i < 2; i++) {
      const px = 1 + Math.floor(rnd() * 12), py = (top ? 6 : 1) + Math.floor(rnd() * 7);
      g.fillStyle = '#b0a096'; g.fillRect(px, py, 2, 2);
      g.fillStyle = '#dcd2c8'; g.fillRect(px, py - 1, 1, 1);
      g.fillStyle = '#786862'; g.fillRect(px + 1, py + 1, 1, 1);
    }
    if (top) {
      for (let x = 0; x < 16; x++) {
        const h = 4 + ((x * 7) % 5 === 0 ? 1 : 0);
        g.fillStyle = ts.top[0]; g.fillRect(x, 0, 1, h);
        g.fillStyle = ts.top[1]; g.fillRect(x, 0, 1, 2);
        g.fillStyle = ts.top[2]; g.fillRect(x, 0, 1, 1);
        g.fillStyle = ts.top[3]; g.fillRect(x, h, 1, x % 4 === 1 ? 2 : 1);
      }
    }
    return c;
  }
  const TILES = {};
  for (const [k, ts] of Object.entries(TILESETS)) {
    TILES[k] = {
      top: [11, 23, 37].map(sd => makeGroundTile(true, sd, ts)),
      mid: [5, 17, 29].map(sd => makeGroundTile(false, sd, ts)),
    };
  }
  // 氷のブロック（すべる）
  const ICE = (() => {
    const c = document.createElement('canvas'); c.width = 16; c.height = 16;
    const g = c.getContext('2d');
    g.fillStyle = '#9cd8f4'; g.fillRect(0, 0, 16, 16);
    g.fillStyle = '#d8f4ff'; g.fillRect(0, 0, 16, 2); g.fillRect(0, 0, 2, 16);
    g.fillStyle = '#5aa8d8'; g.fillRect(0, 14, 16, 2); g.fillRect(14, 0, 2, 16);
    g.fillStyle = '#ffffff'; g.fillRect(3, 3, 4, 1); g.fillRect(3, 4, 1, 3); g.fillRect(9, 9, 3, 1);
    return c;
  })();
  // くずれる足場（サンゴの岩・ひびあり）
  const CRUMBLE = (() => {
    const c = document.createElement('canvas'); c.width = 16; c.height = 16;
    const g = c.getContext('2d');
    g.fillStyle = '#e88a7a'; g.fillRect(0, 0, 16, 16);
    g.fillStyle = '#ffb4a4'; g.fillRect(0, 0, 16, 2); g.fillRect(0, 0, 2, 16);
    g.fillStyle = '#a8505a'; g.fillRect(0, 14, 16, 2); g.fillRect(14, 0, 2, 16);
    g.fillStyle = '#7a3040';
    g.fillRect(4, 3, 1, 4); g.fillRect(5, 6, 3, 1); g.fillRect(8, 7, 1, 4); g.fillRect(9, 10, 3, 1); g.fillRect(11, 4, 1, 3);
    g.fillStyle = '#ffd8cc'; g.fillRect(3, 11, 2, 2); g.fillRect(12, 2, 1, 1);
    return c;
  })();
  // 流砂（足がしずむ）
  function drawQuicksand(dx, dy, tx) {
    ctx.fillStyle = '#c8a060'; ctx.fillRect(dx, dy, 16, 16);
    ctx.fillStyle = '#e0bc78'; ctx.fillRect(dx, dy, 16, 3);
    ctx.fillStyle = '#a8804a';
    for (let i = 0; i < 3; i++) {
      const ox = Math.round((time * 10 + i * 6 + tx * 5) % 16);
      ctx.fillRect(dx + ox, dy + 5 + i * 4, 4, 1);
      if (ox > 12) ctx.fillRect(dx + ox - 16, dy + 5 + i * 4, 4, 1);
    }
  }
  const PLANK = (() => {
    const c = document.createElement('canvas'); c.width = 16; c.height = 6;
    const g = c.getContext('2d');
    g.fillStyle = '#aa6834'; g.fillRect(0, 0, 16, 6);
    g.fillStyle = '#e2a05c'; g.fillRect(0, 0, 16, 1);
    g.fillStyle = '#c88446'; g.fillRect(0, 1, 16, 1);
    g.fillStyle = '#704022'; g.fillRect(0, 5, 16, 1); g.fillRect(15, 0, 1, 6);
    g.fillRect(3, 3, 1, 1); g.fillRect(12, 3, 1, 1);
    return c;
  })();
  const USED = (() => {
    const c = document.createElement('canvas'); c.width = 16; c.height = 16;
    const g = c.getContext('2d');
    g.fillStyle = '#8a5a34'; g.fillRect(0, 0, 16, 16);
    g.fillStyle = '#a8744a'; g.fillRect(1, 1, 14, 1); g.fillRect(1, 1, 1, 14);
    g.fillStyle = '#5c3820'; g.fillRect(0, 15, 16, 1); g.fillRect(15, 0, 1, 16);
    g.fillRect(3, 3, 2, 2); g.fillRect(11, 3, 2, 2); g.fillRect(3, 11, 2, 2); g.fillRect(11, 11, 2, 2);
    return c;
  })();

  // ------------------------------------------------------------------ 入力（タッチ＋キーボード）
  const input = { left: false, right: false, jump: false, dash: false, throw: false };
  const touchKeys = { left: false, right: false, jump: false, dash: false, throw: false };
  const keyKeys = { left: false, right: false, jump: false, dash: false, throw: false };
  let jumpPrev = false, throwPrev = false;

  const buttons = [...document.querySelectorAll('#pad .btn')].map(el => ({ el, key: el.dataset.key }));
  const HIT_PAD = 18;   // ボタンの反応範囲を見た目より広くする（px）

  // 1本の指で押しているボタン（いちばん近いもの）を返す
  function hitTest(x, y) {
    let best = null, bestD = Infinity;
    for (const b of buttons) {
      if (b.el.hidden) continue;
      const r = b.el.getBoundingClientRect();
      if (x < r.left - HIT_PAD || x > r.right + HIT_PAD || y < r.top - HIT_PAD || y > r.bottom + HIT_PAD) continue;
      const d = Math.hypot(x - (r.left + r.right) / 2, y - (r.top + r.bottom) / 2);
      if (d < bestD) { bestD = d; best = b.key; }
    }
    return best;
  }

  function onTouch(e) {
    if (e.target.closest && e.target.closest('button')) return;   // メニューのボタンは通常どおり
    if (state === 'title' || state === 'map') return;
    e.preventDefault();
    if (state === 'dialog') { if (e.type === 'touchstart' && e.target.closest('#dialog-box')) nextLine(); return; }
    for (const k in touchKeys) touchKeys[k] = false;
    for (const t of e.touches) {
      const k = hitTest(t.clientX, t.clientY);
      if (k) touchKeys[k] = true;
    }
    syncInput();
  }
  ['touchstart', 'touchmove', 'touchend', 'touchcancel'].forEach(type =>
    document.addEventListener(type, onTouch, { passive: false }));

  // マウスでも押せるように（PC確認用）
  let mouseKey = null;
  document.addEventListener('mousedown', e => { mouseKey = hitTest(e.clientX, e.clientY); if (mouseKey) { touchKeys[mouseKey] = true; syncInput(); } });
  document.addEventListener('mouseup', () => { if (mouseKey) { touchKeys[mouseKey] = false; mouseKey = null; syncInput(); } });

  const KEYMAP = { ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right',
    Space: 'jump', ArrowUp: 'jump', KeyZ: 'jump', KeyW: 'jump',
    KeyX: 'dash', ShiftLeft: 'dash', ShiftRight: 'dash', KeyC: 'throw' };
  addEventListener('keydown', e => {
    if (e.code === 'Escape' || e.code === 'KeyP') { togglePause(); return; }
    if (state === 'dialog' && (e.code === 'Space' || e.code === 'Enter' || e.code === 'KeyZ')) { e.preventDefault(); nextLine(); return; }
    const k = KEYMAP[e.code]; if (!k) return;
    e.preventDefault(); if (e.repeat) return;
    keyKeys[k] = true; syncInput();
  });
  addEventListener('keyup', e => { const k = KEYMAP[e.code]; if (!k) return; keyKeys[k] = false; syncInput(); });

  // DASH は切りかえ式：1回押すとON、もう1回押すとOFF
  let dashMode = false, dashRawPrev = false;
  const dashBtn = document.getElementById('btn-dash');
  function setDash(on) {
    dashMode = on;
    dashBtn.classList.toggle('active', on);
    dashBtn.textContent = on ? 'DASH ON' : 'DASH';
  }
  function syncInput() {
    const raw = {};
    for (const k in input) raw[k] = touchKeys[k] || keyKeys[k];
    if (raw.dash && !dashRawPrev) { setDash(!dashMode); sfx.click(); }
    dashRawPrev = raw.dash;
    input.left = raw.left; input.right = raw.right; input.jump = raw.jump; input.throw = raw.throw;
    input.dash = dashMode;
    for (const b of buttons) b.el.classList.toggle('on', raw[b.key]);
  }

  // ------------------------------------------------------------------ ゲームの状態
  const player = {
    x: 0, y: 0, w: 10, h: 18, vx: 0, vy: 0, prevBottom: 0,
    onGround: false, face: 1, coyote: 0, buffer: 0, jumping: false, animT: 0,
    usedDouble: false, gliding: false,
  };
  const pocchi = { x: 0, y: 0, t: 0 };
  const run = {
    hearts: RULE.hearts, lives: RULE.lives, stamps: 0,
    power: null, bag: false, invT: 0, hurtT: 0, checkpoint: false,
    gems: [false, false, false],
    time: 200, hurry: false,
  };
  const HURRY_AT = 50;      // のこり50秒で「急げ！」
  let items = [];           // ブロックから出たアイテム
  let balls = [];           // ランタンの光の玉
  let camX = 0;
  let state = 'play';       // 'play' | 'pause' | 'miss' | 'clear' | 'over'
  let missT = 0;
  let fadeT = 0;
  const particles = [];
  const bumps = [];
  let dustT = 0;
  let postBounce = 0;
  let showActors = true;

  function placePlayer() {
    const p = run.checkpoint ? CHECKPOINT : START;
    player.x = p.x; player.y = p.y - player.h;
    player.vx = player.vy = 0; player.face = 1; player.onGround = false;
    player.usedDouble = false; player.gliding = false;
    pocchi.x = player.x - 16; pocchi.y = player.y - 20;
    camX = Math.max(0, Math.min(player.x - viewW * 0.42, LEVEL_W * TILE - viewW));
  }

  function resetRun() {
    run.hearts = RULE.hearts; run.lives = RULE.lives; run.stamps = 0;
    run.power = null; run.bag = false; run.invT = 0; run.hurtT = 0; run.checkpoint = false;
  }

  // マップからステージに入る（stamps はステージごとに数える）
  function enterStage(i) {
    const st = STAGES[i];
    if (st.boss && PRE_BOSS[st.w] && !save.preboss[st.w]) {
      // ボスの前の会話（はじめての時だけ）
      save.preboss[st.w] = true; writeSave();
      stageIndex = i;
      playDialog(PRE_BOSS[st.w], () => enterStage(i), st.id, st.w === 7 ? 'time' : 'castle');
      return;
    }
    stageIndex = i;
    run.stamps = 0; run.checkpoint = false; run.gems = [false, false, false];
    run.hearts = RULE.hearts; run.invT = 0; run.hurtT = 0;
    setDash(false);
    document.getElementById('world-label').textContent = STAGES[i].boss ? `${STAGES[i].w}-BOSS` : STAGES[i].label;
    save.last = i; writeSave();
    startLevel();
  }

  // ステージを作り直して、スタート地点（または中間ポスト）から
  function startLevel() {
    buildLevel();
    items = []; balls = []; particles.length = 0; bumps.length = 0;
    placePlayer();
    state = 'play';
    showActors = true;
    for (const m of [pauseMenu, clearMenu, overMenu]) m.hidden = true;
    for (const sc of [titleScreen, mapScreen, dialogEl, document.getElementById('act-screen'), document.getElementById('credits-screen')]) sc.hidden = true;
    document.body.classList.remove('cutscene', 'menu');
    setSat(save.cleared[STAGES[stageIndex].id] ? 1 : 0.35, false);
    run.time = levelDef.time || (STAGES[stageIndex].boss ? 150 : 200);
    run.hurry = false;
    SND.setTempo(1);
    timeEl.textContent = Math.ceil(run.time);
    timePill.classList.remove('hurry');
    updateHud();
  }

  // ------------------------------------------------------------------ ダメージ・ミス
  function damage() {
    if (run.invT > 0 || run.hurtT > 0 || state !== 'play') return;
    // なくなる順番：カバン → パワーアップ → ハート
    if (run.bag) { run.bag = false; popIcon('BIGBAG', { lost: true }); sfx.bagRip(); }
    else if (run.power) { popIcon(ITEM_SPR[run.power], { lost: true }); run.power = null; }
    else { run.hearts--; }
    if (!run.bag) sfx.hurt();
    run.hurtT = RULE.iframes;
    player.vy = Math.min(player.vy, -140);
    player.vx = -player.face * 60;
    updateHud();
    if (run.hearts <= 0) miss();
  }

  function miss() {
    if (state !== 'play') return;
    state = 'miss'; missT = 1.2;
    sfx.miss();
    player.vx = 0; player.vy = -220;
  }

  function afterMiss() {
    if (run.lives <= 0) {
      state = 'over';
      overMenu.hidden = false;
      SND.play('over', { once: true });
      return;
    }
    run.lives--;
    run.hearts = RULE.hearts; run.power = null; run.bag = false; run.invT = 0; run.hurtT = 0;
    if (!run.checkpoint) run.gems = [false, false, false];
    fadeT = 0.5;
    startLevel();
  }

  // ------------------------------------------------------------------ 切手・アイテム
  function addStamps(n, x, y) {
    sfx.stamp();
    for (let i = 0; i < n; i++) {
      run.stamps++;
      if (run.stamps % RULE.stampsFor1up === 0) { run.lives++; popText('1UP', '#7dff8a'); popJoy(3); sfx.oneup(); }
    }
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      particles.push({ kind: 'spark', x: x + 6, y: y + 6, vx: Math.cos(a) * 50, vy: Math.sin(a) * 50, t: 0, life: 0.3 });
    }
    updateHud();
  }

  // 文字は短く・すぐ消える（0.6秒）
  function popText(text, color = '#fff') {
    particles.push({ kind: 'text', text, color, x: player.x + player.w / 2, y: player.y - 6, t: 0, life: 0.6 });
  }
  // よろこびの音符（♪）がふわっと出る
  const NOTE_IMGS = ['NOTE_Y', 'NOTE_P', 'NOTE_C'];
  function popJoy(n = 3, x = player.x + player.w / 2, y = player.y) {
    for (let i = 0; i < n; i++) {
      particles.push({ kind: 'icon', img: NOTE_IMGS[i % 3], x: x + (i - (n - 1) / 2) * 7, y: y - 4 - (i % 2) * 4,
        vy: -38 - (i % 3) * 8, sway: (i % 2 ? 1 : -1) * (6 + i), t: 0, life: 0.75 + (i % 3) * 0.1 });
    }
  }
  // 取ったもの（または、なくしたもの）のアイコンが頭の上に出る
  function popIcon(img, opt = {}) {
    particles.push({ kind: 'icon', img, x: player.x + player.w / 2, y: player.y - 8,
      vy: opt.lost ? 30 : -30, sway: 0, t: 0, life: opt.lost ? 0.6 : 0.6, lost: !!opt.lost });
  }

  function collect(kind) {
    const x = player.x, y = player.y;
    if (POWERS.includes(kind)) {
      if (run.power === kind) { addStamps(RULE.dupStamps, x, y); popText('+' + RULE.dupStamps, '#ffec96'); }
      else { run.power = kind; popIcon(ITEM_SPR[kind]); popJoy(3); sfx.power(); }
    } else if (kind === 'bag') {
      if (run.bag) { addStamps(RULE.dupStamps, x, y); popText('+' + RULE.dupStamps, '#ffec96'); }
      else { run.bag = true; popIcon('BIGBAG'); popJoy(3); sfx.power(); }
    } else if (kind === 'onigiri') {
      if (run.hearts < RULE.hearts) { run.hearts++; popIcon('HEART_S'); popJoy(2); sfx.heal(); }
      else { addStamps(RULE.dupStamps, x, y); popText('+' + RULE.dupStamps, '#ffec96'); }
    } else if (kind === 'scarf') {
      run.invT = RULE.invincible; popJoy(5); sfx.power();
    } else if (kind === 'oneup') {
      run.lives++; popText('1UP', '#7dff8a'); popJoy(3); sfx.oneup();
    }
    updateHud();
  }

  function hitBlock(tx, ty) {
    const c = level[ty][tx];
    if (c !== 'B' && c !== 'P' && c !== 'H') return;
    bumps.push({ tx, ty, t: 0 });
    sfx.bump();
    const key = tx + ',' + ty;
    const what = contents[key] || 'stamp';
    // ブロックの上にいる敵ははね飛ばす
    for (const e of enemies) {
      if (!e.dead && e.x + e.w > tx * TILE && e.x < (tx + 1) * TILE && Math.abs(e.y + e.h - ty * TILE) < 3) killEnemy(e, 'fall');
    }
    if (what === 'stamp') {
      particles.push({ kind: 'stamp', x: tx * TILE + 2, y: ty * TILE - 14, vy: -140, t: 0, life: 0.45 });
      addStamps(1, tx * TILE + 2, ty * TILE - 14);
    } else {
      items.push({ kind: what, x: tx * TILE, y: ty * TILE, w: 16, h: 16, rise: 0, baseY: ty * TILE });
      sfx.sprout();
    }
    if (c === 'P') {
      parcelHits[key] = (parcelHits[key] || 0) + 1;
      if (parcelHits[key] >= 10) level[ty][tx] = 'U';
    } else level[ty][tx] = 'U';
  }

  // ------------------------------------------------------------------ 敵
  function killEnemy(e, how) {
    if (e.dead) return;
    e.dead = how; e.deadT = 0;
    if (how === 'fall') { e.vy = -160; e.vx = (e.x < player.x ? -1 : 1) * 40; sfx.kick(); }
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + 0.6;
      particles.push({ kind: 'spark', x: e.x + 6, y: e.y + 6, vx: Math.cos(a) * 60, vy: Math.sin(a) * 60, t: 0, life: 0.3 });
    }
  }

  // 敵・光の玉などに使う、かんたんな当たり判定つき移動
  function moveBody(b, dt) {
    b.vy = Math.min(b.vy + PHYS.gDown * dt, PHYS.maxFall);
    let hitWall = false;
    b.x += b.vx * dt;
    const top = Math.floor(b.y / TILE), bot = Math.floor((b.y + b.h - 1) / TILE);
    if (b.vx > 0) {
      const tx = Math.floor((b.x + b.w) / TILE);
      for (let ty = top; ty <= bot; ty++) if (isSolid(tileAt(tx, ty))) { b.x = tx * TILE - b.w; hitWall = true; break; }
    } else if (b.vx < 0) {
      const tx = Math.floor(b.x / TILE);
      for (let ty = top; ty <= bot; ty++) if (isSolid(tileAt(tx, ty))) { b.x = (tx + 1) * TILE; hitWall = true; break; }
    }
    const prevBottom = b.y + b.h;
    b.y += b.vy * dt;
    b.onGround = false;
    const l = Math.floor(b.x / TILE), r = Math.floor((b.x + b.w - 1) / TILE);
    if (b.vy >= 0) {
      const ty = Math.floor((b.y + b.h) / TILE);
      for (let tx = l; tx <= r; tx++) {
        const c = tileAt(tx, ty);
        if (isSolid(c) || (c === '=' && prevBottom <= ty * TILE + 0.01)) { b.y = ty * TILE - b.h; b.vy = 0; b.onGround = true; break; }
      }
    } else {
      const ty = Math.floor(b.y / TILE);
      for (let tx = l; tx <= r; tx++) if (isSolid(tileAt(tx, ty))) { b.y = (ty + 1) * TILE; b.vy = 0; break; }
    }
    return hitWall;
  }

  const STOMPABLE = { moyan: true, pata: true, mogu: true, yuki: true, hover: true, sakana: true };
  function updateEnemies(dt) {
    for (const e of enemies) {
      if (!e.active) {
        if (e.x < camX + viewW + 24) e.active = true; else continue;
      }
      if (e.dead) {
        e.deadT += dt;
        if (e.dead === 'fall') { e.vy += PHYS.gDown * dt; e.x += e.vx * dt; e.y += e.vy * dt; }
        continue;
      }
      e.t += dt;
      if (e.kind === 'pata') {
        // パタクモ：ゆっくり左右に進みながら、ふわふわ上下する
        e.x += e.vx * dt;
        e.y = e.baseY + Math.sin(e.t * 2.2) * 18;
        const ahead = e.vx > 0 ? Math.floor((e.x + e.w) / TILE) : Math.floor(e.x / TILE);
        if (isSolid(tileAt(ahead, Math.floor((e.y + 5) / TILE)))) e.vx = -e.vx;
      } else if (e.kind === 'hover') {
        // その場でうかぶ雲（ふみ台にして穴をわたる）。sway があれば左右にもゆれる
        e.y = e.baseY + Math.sin(e.t * 2.0) * 4;
        e.x = e.baseX + Math.sin(e.t * 1.1) * e.sway * TILE;
      } else if (e.kind === 'sakana') {
        // 魚：左右に泳ぐ（かべで引き返す）
        e.x += e.vx * dt;
        e.y = e.baseY + Math.sin(e.t * 3) * 5;
        const ahead = e.vx > 0 ? Math.floor((e.x + e.w) / TILE) : Math.floor(e.x / TILE);
        if (isSolid(tileAt(ahead, Math.floor((e.y + 4) / TILE))) || e.x < 2 || e.x > LEVEL_W * TILE - 20) e.vx = -e.vx;
      } else if (e.kind === 'uni') {
        // ウニ：動かない。ふめない
      } else if (e.kind === 'mogu') {
        // スナモグラ：地面から出たり（約1.2秒）、もぐったり（約1.6秒）
        const ph = e.t % 3.0;
        e.up = ph < 1.4 ? 0 : ph < 1.6 ? (ph - 1.4) / 0.2 : ph < 2.8 ? 1 : (3.0 - ph) / 0.2;
        e.vx = player.x < e.x ? -1 : 1;     // 向きだけ（動かない）
      } else if (e.kind === 'tsurara') {
        // つらら：真下に近づくと、ぷるぷるしてから落ちる
        if (!e.falling) {
          const near = Math.abs(player.x + player.w / 2 - (e.x + e.w / 2)) < 30 && player.y > e.y;
          if (near || e.shakeT > 0) e.shakeT += dt;
          if (e.shakeT > 0.4) { e.falling = true; e.vy = 0; }
        } else {
          e.vy = Math.min(e.vy + PHYS.gDown * dt, PHYS.maxFall);
          e.y += e.vy * dt;
          const ty = Math.floor((e.y + e.h) / TILE);
          if (isSolid(tileAt(Math.floor((e.x + e.w / 2) / TILE), ty)) || e.y > ROWS * TILE) {
            e.dead = 'gone';
            for (let i = 0; i < 5; i++) particles.push({ kind: 'spark', x: e.x + 4, y: ty * TILE - 2, vx: (i - 2) * 30, vy: -40 - i * 8, t: 0, life: 0.3 });
            sfx.bump();
            continue;
          }
        }
      } else if (moveBody(e, dt)) e.vx = -e.vx;
      // 足場のはしで引き返す（小学生でも読みやすい動き）
      if ((e.kind === 'moyan' || e.kind === 'toge' || e.kind === 'yuki') && e.onGround) {
        const fx = e.vx > 0 ? Math.floor((e.x + e.w + 1) / TILE) : Math.floor((e.x - 1) / TILE);
        const fy = Math.floor((e.y + e.h + 1) / TILE);
        const c = tileAt(fx, fy);
        if (!isSolid(c) && c !== '=') e.vx = -e.vx;
      }
      if (e.y > ROWS * TILE + 40) { e.dead = 'gone'; continue; }

      // 主人公とのふれあい
      if (e.kind === 'mogu' && e.up < 0.6) continue;        // もぐっている間はさわれない
      if (e.kind === 'tsurara' && !e.falling) continue;
      if (state !== 'play' || !overlap(player, e)) continue;
      if (run.invT > 0) { killEnemy(e, 'fall'); continue; }
      const fromAbove = player.vy > 0 && player.prevBottom <= e.y + 6;
      if (STOMPABLE[e.kind] && fromAbove) {
        killEnemy(e, 'squash'); sfx.stomp();
        if (Math.random() < 0.5) popJoy(1, e.x + 6, e.y);
        player.y = e.y - player.h;
        player.vy = -(input.jump ? PHYS.stompHigh : PHYS.stomp);
        player.jumping = input.jump;
        player.usedDouble = false;
      } else {
        damage();
      }
    }
    enemies = enemies.filter(e => !(e.dead === 'squash' && e.deadT > 0.4) && !(e.dead === 'fall' && e.y > ROWS * TILE + 60) && e.dead !== 'gone');
  }

  // ------------------------------------------------------------------ 主人公の動き
  function approach(v, target, amount) { return v < target ? Math.min(v + amount, target) : Math.max(v - amount, target); }

  function collideX() {
    const top = Math.floor(player.y / TILE), bot = Math.floor((player.y + player.h - 1) / TILE);
    const v = player.vx + (player.pushX || 0);
    if (v > 0) {
      const tx = Math.floor((player.x + player.w) / TILE);
      for (let ty = top; ty <= bot; ty++) if (isSolid(tileAt(tx, ty))) { player.x = tx * TILE - player.w; player.vx = 0; return; }
    } else if (v < 0) {
      const tx = Math.floor(player.x / TILE);
      for (let ty = top; ty <= bot; ty++) if (isSolid(tileAt(tx, ty))) { player.x = (tx + 1) * TILE; player.vx = 0; return; }
    }
  }

  function collideY(prevTop, prevBottom) {
    const left = Math.floor(player.x / TILE), right = Math.floor((player.x + player.w - 1) / TILE);
    player.onGround = false;
    if (player.vy >= 0) {
      const ty = Math.floor((player.y + player.h) / TILE);
      for (let tx = left; tx <= right; tx++) {
        const c = tileAt(tx, ty);
        const oneWayOk = c === '=' && prevBottom <= ty * TILE + 0.01;
        if (isSolid(c) || oneWayOk) {
          player.y = ty * TILE - player.h; player.vy = 0; player.onGround = true; return;
        }
      }
    } else {
      const ty = Math.floor(player.y / TILE);
      // 頭がいちばん重なっているブロックをたたく（かくしブロックは下からだけ当たる）
      let hit = null, best = -1;
      for (let tx = left; tx <= right; tx++) {
        const c = tileAt(tx, ty);
        const hiddenOk = c === 'H' && prevTop >= (ty + 1) * TILE - 0.5;
        if (!isSolid(c) && !hiddenOk) continue;
        const ov = Math.min(player.x + player.w, (tx + 1) * TILE) - Math.max(player.x, tx * TILE);
        if (ov > best) { best = ov; hit = tx; }
      }
      if (hit !== null) {
        player.y = (ty + 1) * TILE; player.vy = 0;
        hitBlock(hit, ty);
      }
    }
  }

  function updatePlayer(dt) {
    // ---- 横の動き
    const dir = (input.right ? 1 : 0) - (input.left ? 1 : 0);
    if (dir) player.face = dir;
    // 足もとの地面：氷はすべる、流砂はしずんで遅くなる
    const under = player.onGround ? tileAt(Math.floor((player.x + player.w / 2) / TILE), Math.floor((player.y + player.h + 1) / TILE)) : '.';
    player.onIce = under === 'I';
    player.inSand = under === 'Q';
    let top = input.dash ? PHYS.dash : PHYS.run;
    if (player.inSand) top *= 0.55;
    if (levelDef.water) top *= 0.75;
    if (run.invT > 0) top *= 1.1;                       // むてき中は少し速い
    let accel = player.onGround ? (dir ? PHYS.accel : PHYS.decel) : PHYS.air;
    // ダッシュをやめたときは、少しずつ歩く速さにもどす（急ブレーキにしない）
    if (dir && Math.abs(player.vx) > top && Math.sign(player.vx) === dir) accel = 260;
    // 空中ブレーキ：空中で進む向きと反対を押すと強く減速できる（着地を合わせやすく）
    if (!player.onGround && dir && player.vx && Math.sign(player.vx) === -dir) accel = PHYS.airBrake;
    if (player.onIce) accel = dir ? 170 : 60;
    player.vx = approach(player.vx, dir * top, accel * dt);

    // ---- ジャンプ（先行入力・コヨーテタイム）
    const jumpPressed = input.jump && !jumpPrev;
    jumpPrev = input.jump;
    player.buffer = jumpPressed ? PHYS.buffer : Math.max(0, player.buffer - dt);
    player.coyote = player.onGround ? PHYS.coyote : Math.max(0, player.coyote - dt);
    if (player.onGround) player.usedDouble = false;
    if (levelDef.water) {
      // 海の中：JUMP を押すたびに「ひとかき」して上へ。ゆっくりしずむ
      player.buffer = 0;
      if (jumpPressed) {
        player.vy = Math.min(player.vy, 0) - 150; player.vy = Math.max(player.vy, -170);
        player.onGround = false; sfx.swim();
        particles.push({ kind: 'bubble', x: player.x + player.w / 2, y: player.y + 4, vy: -30, t: 0, life: 1.2 });
      }
    } else if (player.buffer > 0 && player.coyote > 0) {
      // 速く走っているほど高く跳べる（歩きの速さ以下は通常ジャンプ）
      const k = Math.max(0, Math.min(1, (Math.abs(player.vx) - PHYS.run) / (PHYS.dash - PHYS.run)));
      player.vy = -lerp(PHYS.jump, PHYS.dashJump, k) * (player.inSand ? 0.82 : 1); player.buffer = 0; player.coyote = 0;
      sfx.jump();
      player.onGround = false; player.jumping = true;
    } else if (!levelDef.water && jumpPressed && !player.onGround && run.power === 'boots' && !player.usedDouble) {
      // バネぐつ：空中でもう1回ジャンプ
      player.vy = -PHYS.doubleJump; player.usedDouble = true; player.jumping = true; player.buffer = 0;
      sfx.jump2();
      for (let i = 0; i < 6; i++) {
        particles.push({ kind: 'dust', x: player.x + player.w / 2 + (i - 2.5) * 3, y: player.y + player.h, vx: (i - 2.5) * 12, vy: 20, t: 0, life: 0.3 });
      }
    }
    if (player.vy >= 0) player.jumping = false;

    // ---- 重力（押している長さで高さが変わる）
    const g = levelDef.water ? 260 : (player.vy < 0 && input.jump && player.jumping) ? PHYS.gUp : PHYS.gDown;
    player.gliding = run.power === 'plane' && !player.onGround && player.vy > 0 && input.jump;
    const maxFall = levelDef.water ? 75 : player.gliding ? PHYS.glideFall : PHYS.maxFall;
    player.vy = Math.min(player.vy + g * dt, maxFall);

    // ---- ランタン：光の玉を投げる（画面に2つまで）
    const throwPressed = input.throw && !throwPrev;
    throwPrev = input.throw;
    if (throwPressed && run.power === 'lantern' && balls.length < 2) {
      sfx.fire();
      balls.push({ x: player.x + player.w / 2 + player.face * 6 - 3, y: player.y + 6, w: 6, h: 6, vx: player.face * 170, vy: 40, t: 0 });
    }

    // ---- 動く足場（乗っていたら一緒に動く）
    for (const m of movers) {
      m.t += dt;
      const k = (Math.sin(m.t * m.speed - Math.PI / 2) + 1) / 2;
      if (m.axis === 'circle') {
        const nx = m.cx + Math.cos(m.t * m.speed) * m.r - m.w / 2, ny = m.cy + Math.sin(m.t * m.speed) * m.r;
        if (m.first) { m.x = nx; m.y = ny; m.first = false; }
        m.dx = nx - m.x; m.dy = ny - m.y; m.x = nx; m.y = ny;
      } else if (m.axis === 'y') { const ny = m.y0 + k * m.range; m.dy = ny - m.y; m.y = ny; m.dx = 0; }
      else { const nx = m.x0 + k * m.range; m.dx = nx - m.x; m.x = nx; m.dy = 0; }
      if (player.onMover === m) { player.x += m.dx; player.y += m.dy; }
    }
    player.onMover = null;

    // ---- 移動と当たり判定
    // ベルトコンベア・風でおされる
    let push = 0;
    if (player.onGround) {
      const ut = tileAt(Math.floor((player.x + player.w / 2) / TILE), Math.floor((player.y + player.h + 1) / TILE));
      if (ut === '<') push -= 48; else if (ut === '>') push += 48;
    }
    for (const tr of traps) {
      if (tr.type === 'wind' && tr.live && player.x + player.w > tr.x0 * TILE && player.x < (tr.x1 + 1) * TILE) push += tr.force * (player.onGround ? 0.8 : 1);
    }
    player.pushX = push;
    player.x += (player.vx + push) * dt; collideX();
    const prevTop = player.y;
    player.prevBottom = player.y + player.h;
    player.y += player.vy * dt; collideY(prevTop, player.prevBottom);
    if (player.vy >= 0) {
      for (const m of movers) {
        if (player.x + player.w > m.x && player.x < m.x + m.w &&
            player.prevBottom <= m.y - m.dy + 1.5 && player.y + player.h >= m.y) {
          player.y = m.y - player.h; player.vy = 0; player.onGround = true; player.onMover = m;
        }
      }
    }
    // くずれる足場に乗ったら、カウント開始
    if (player.onGround) {
      const fy = Math.floor((player.y + player.h + 1) / TILE);
      for (const fx of [Math.floor((player.x + 1) / TILE), Math.floor((player.x + player.w - 2) / TILE)]) {
        const key = fx + ',' + fy;
        if (tileAt(fx, fy) === 'C' && !crumbles[key]) crumbles[key] = { x: fx, y: fy, t: 0, gone: false };
      }
    }

    // ---- 切手を拾う
    const l = Math.floor(player.x / TILE), r = Math.floor((player.x + player.w - 1) / TILE);
    const t = Math.floor(player.y / TILE), b = Math.floor((player.y + player.h - 1) / TILE);
    for (let ty = t; ty <= b; ty++) for (let tx = l; tx <= r; tx++) {
      const tc = tileAt(tx, ty);
      if (tc === '*') { level[ty][tx] = '.'; addStamps(1, tx * TILE + 2, ty * TILE + 2); }
      else if (tc === 'K') {
        level[ty][tx] = '.';
        run.gems[gemSpots[tx + ',' + ty]] = true;
        popIcon('GEM'); popJoy(3); sfx.gem();
        for (let i = 0; i < 8; i++) {
          const a = (i / 8) * Math.PI * 2;
          particles.push({ kind: 'spark', x: tx * TILE + 8, y: ty * TILE + 8, vx: Math.cos(a) * 70, vy: Math.sin(a) * 70, t: 0, life: 0.4 });
        }
        updateHud();
      }
    }

    // ---- 穴に落ちた
    if (player.y > ROWS * TILE + 24) { run.hearts = 0; updateHud(); miss(); }

    // ---- 中間ポスト
    if (CHECKPOINT && !run.checkpoint && player.x > CHECKPOINT.x) { run.checkpoint = true; popJoy(3); sfx.check(); }

    // ---- ゴール
    if (goal && player.x + player.w > goal.x + 2 && player.x < goal.x + goal.w - 2 && (levelDef.water || player.y + player.h > goal.y)) {
      startGoal();
    }

    // ---- ダッシュ中の土けむり
    if (player.onGround && Math.abs(player.vx) > PHYS.run + 10) {
      dustT -= dt;
      if (dustT <= 0) {
        dustT = 0.06;
        particles.push({ kind: 'dust', x: player.x + player.w / 2 - player.face * 6, y: player.y + player.h - 2,
          vx: -player.face * 20, vy: -15, t: 0, life: 0.3 });
      }
    }
    player.animT += Math.abs(player.vx) * dt;
  }

  function updateItems(dt) {
    for (const it of items) {
      if (it.rise < 1) { it.rise = Math.min(1, it.rise + dt / 0.35); it.y = it.baseY - 16 * it.rise; continue; }
      if (overlap(player, { x: it.x + 2, y: it.y + 2, w: 12, h: 14 })) { it.taken = true; collect(it.kind); }
    }
    items = items.filter(it => !it.taken);
  }

  function updateBalls(dt) {
    for (const b of balls) {
      b.t += dt;
      const wall = moveBody(b, dt);
      if (b.onGround) b.vy = -170;
      for (const e of enemies) {
        if (!e.dead && e.active && !(e.kind === 'mogu' && e.up < 0.6) && overlap(b, e)) { killEnemy(e, 'fall'); b.done = true; break; }
      }
      if (wall || b.t > 1.6 || b.y > ROWS * TILE) b.done = true;
      if (b.done) particles.push({ kind: 'spark', x: b.x, y: b.y, vx: 0, vy: -30, t: 0, life: 0.25 });
    }
    balls = balls.filter(b => !b.done);
  }

  // ------------------------------------------------------------------ ゴールの演出（文字なし）
  // 1) 手紙をポストに入れる → 2) ポストがはねて花火と虹 → 3) 主人公がよろこぶ → 4) 丸く画面が閉じる
  const GOAL = { letter: 0.55, fireworks: 0.7, rainbow: 0.8, irisStart: 3.4, irisEnd: 4.3 };
  let goalT = 0, fwNext = 0;
  const FW_COLORS = ['#ff5a5a', '#ffaa3c', '#ffe650', '#6edc5a', '#5aa0ff', '#be6eff', '#ffffff', '#ff8cc8'];

  let colorDone = false;
  function startGoal() {
    state = 'goal'; goalT = 0; fwNext = GOAL.fireworks; colorDone = false;
    const id = STAGES[stageIndex].id;
    save.cleared[id] = true;
    save.best[id] = Math.max(save.best[id] || 0, run.stamps);
    const old = save.gems[id] || [false, false, false];
    save.gems[id] = old.map((g, i) => g || run.gems[i]);
    save.last = Math.min(stageIndex + 1, STAGES.length - 1);
    writeSave();
    player.vx = 0; player.face = 1;
    if (goal) player.x = Math.min(player.x, goal.x - player.w - 1);    // ポストの横に立つ
    run.invT = 0; run.hurtT = 0;
    document.body.classList.add('cutscene');
    SND.stop();
    setTimeout(() => { if (state === 'goal') SND.play('clear', { once: true }); }, 600);
    if (goal) {
      particles.push({ kind: 'letter', sx: player.x + player.w / 2, sy: player.y + 6,
        ex: goal.x + 7, ey: goal.y + 3, x: 0, y: 0, t: 0, life: GOAL.letter });
    } else burst(player.x + player.w / 2, player.y - 10);
  }

  function burst(x, y) {
    const col = FW_COLORS[Math.floor(Math.random() * FW_COLORS.length)];
    const col2 = FW_COLORS[Math.floor(Math.random() * FW_COLORS.length)];
    const n = 40;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2, sp = (i % 2 ? 70 : 45) + Math.random() * 20;
      particles.push({ kind: 'fw', x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, t: 0, life: 1.3, color: i % 2 ? col : col2 });
    }
    particles.push({ kind: 'flash', x, y, t: 0, life: 0.15 });
  }

  function updateGoal(dt) {
    goalT += dt;
    if (!colorDone && goalT >= GOAL.rainbow) { colorDone = true; setSat(1, true); }   // 色がもどる
    // 主人公：その場でうれしそうにぴょんぴょん
    player.vy = Math.min(player.vy + PHYS.gDown * dt, PHYS.maxFall);
    player.y += player.vy * dt;
    const floor = 10 * TILE;
    // 足もとの高さ（ボス戦では板の上のこともある）

    if (player.y + player.h >= floor) { player.y = floor - player.h; player.vy = 0; player.onGround = true; } else player.onGround = false;
    if (player.onGround && goalT > GOAL.letter + 0.2 && goalT < GOAL.irisStart) player.vy = -190;
    // 花火（打ち上げ → 開く）
    if (goalT >= fwNext && goalT < GOAL.irisStart - 0.3) {
      fwNext += 0.32;
      const tx = camX + viewW * (0.15 + Math.random() * 0.7);
      particles.push({ kind: 'rocket', x: tx, y: floor, vx: 0, vy: -230, t: 0, life: 0.32 + Math.random() * 0.18 });
    }
    // 相棒もくるくる
    pocchi.t += dt * 3;
    pocchi.x = lerp(pocchi.x, player.x - 14 + Math.cos(pocchi.t) * 14, Math.min(1, dt * 6));
    pocchi.y = lerp(pocchi.y, player.y - 20 + Math.sin(pocchi.t) * 8, Math.min(1, dt * 6));
    updateParticles(dt);
    if (goalT >= GOAL.irisEnd + 0.25 && state === 'goal' && STAGES[stageIndex].boss) {
      state = 'chapter';
      const w = STAGES[stageIndex].w;
      const firstTime = !save.chapters[w];
      save.chapters[w] = true; writeSave();
      const next = Math.min(stageIndex + 1, STAGES.length - 1);
      if (firstTime) playDialog(CHAPTER_END[w], () => afterChapter(w, next), `${w}-3`, w === 7 ? 'ending' : 'warm');
      else enterMap(next);
      return;
    }
    if (goalT >= GOAL.irisEnd + 0.25 && state === 'goal') {
      state = 'clear';
      document.getElementById('clear-stamps').textContent = run.stamps;
      clearMenu.hidden = false;
    }
  }

  function drawRainbow(camY) {
    if (state !== 'goal' && state !== 'clear') return;
    const p = Math.max(0, Math.min(1, (goalT - GOAL.rainbow) / 1.2));
    if (p <= 0) return;
    const cxr = (goal ? goal.x + 8 : player.x + 40) - camX, cyr = 10 * TILE - camY;
    const cols = ['#ff5a5a', '#ffaa3c', '#ffe650', '#6edc5a', '#5aa0ff', '#be6eff'];
    ctx.save();
    ctx.globalAlpha = 0.75;
    ctx.lineWidth = 5;
    cols.forEach((c, i) => {
      ctx.strokeStyle = c;
      ctx.beginPath();
      ctx.arc(cxr - 40, cyr, 110 - i * 5, Math.PI, Math.PI + Math.PI * p);
      ctx.stroke();
    });
    ctx.restore();
  }

  function drawIris(camY) {
    if (state !== 'goal' && state !== 'clear') return;
    const p = Math.max(0, Math.min(1, (goalT - GOAL.irisStart) / (GOAL.irisEnd - GOAL.irisStart)));
    if (p <= 0) return;
    const cxp = player.x + player.w / 2 - camX, cyp = player.y + player.h / 2 - camY;
    const maxR = Math.hypot(Math.max(cxp, viewW - cxp), Math.max(cyp, viewH - cyp));
    const r = maxR * (1 - p) * (1 - p);
    ctx.fillStyle = '#141428';
    ctx.beginPath();
    ctx.rect(0, 0, viewW, viewH);
    if (r > 0.5) ctx.arc(cxp, cyp, r, 0, Math.PI * 2, true);
    ctx.fill('evenodd');
  }

  function update(dt) {
    if (state === 'goal') { updateGoal(dt); camX = lerp(camX, Math.max(0, Math.min(player.x + player.w / 2 - viewW * 0.42, LEVEL_W * TILE - viewW)), Math.min(1, dt * 8)); return; }
    if (state === 'miss') {
      missT -= dt;
      player.vy += PHYS.gDown * 0.6 * dt; player.y += player.vy * dt;
      if (missT <= 0) afterMiss();
      updateParticles(dt);
      return;
    }
    updatePlayer(dt);
    if (state !== 'play') return;
    updateEnemies(dt);
    updateTraps(dt);
    updateBoss(dt);
    updateItems(dt);
    updateBalls(dt);

    // ---- のこり時間
    const before = Math.ceil(run.time);
    run.time = Math.max(0, run.time - dt);
    const nowT = Math.ceil(run.time);
    if (nowT !== before) {
      timeEl.textContent = nowT;
      if (run.hurry && nowT <= 10) sfx.click();          // 最後の10秒はカチカチ
    }
    if (!run.hurry && run.time <= HURRY_AT) {
      run.hurry = true; timePill.classList.add('hurry'); SND.hurry();
    }
    if (run.time <= 0 && state === 'play') { run.hearts = 0; updateHud(); popText('TIME UP', '#ff9aa0'); miss(); return; }

    if (run.invT > 0) run.invT = Math.max(0, run.invT - dt);
    if (run.hurtT > 0) run.hurtT = Math.max(0, run.hurtT - dt);

    // ---- カメラ・相棒
    const targetCam = Math.max(0, Math.min(player.x + player.w / 2 - viewW * 0.42, LEVEL_W * TILE - viewW));
    camX = lerp(camX, targetCam, Math.min(1, dt * 8));
    pocchi.t += dt;
    const px = player.x + player.w / 2 - player.face * 20 - 8, py = player.y - 18 + Math.sin(pocchi.t * 3) * 3;
    pocchi.x = lerp(pocchi.x, px, Math.min(1, dt * 4));
    pocchi.y = lerp(pocchi.y, py, Math.min(1, dt * 4));

    updateParticles(dt);
    for (const bm of bumps) bm.t += dt;
    for (let i = bumps.length - 1; i >= 0; i--) if (bumps[i].t > 0.15) bumps.splice(i, 1);
    if (fadeT > 0) fadeT -= dt;
  }

  function updateParticles(dt) {
    for (const p of particles) {
      p.t += dt;
      if (p.kind === 'stamp') { p.y += p.vy * dt; p.vy += 500 * dt; }
      else if (p.kind === 'text') { p.y -= 40 * dt; }
      else if (p.kind === 'bubble') { p.y += p.vy * dt; p.x += Math.sin(p.t * 8) * 0.3; }
      else if (p.kind === 'debris') { p.vy += 600 * dt; p.y += p.vy * dt; }
      else if (p.kind === 'icon') { p.y += p.vy * dt; p.vy *= p.lost ? 1 : 0.96; }
      else if (p.kind === 'letter') {
        const k = Math.min(1, p.t / p.life);
        p.x = lerp(p.sx, p.ex, k); p.y = lerp(p.sy, p.ey, k) - Math.sin(k * Math.PI) * 18;
        if (k >= 1 && !p.done) { p.done = true; postBounce = 0.35; burst(goal.x + 8, goal.y - 6); sfx.drop(); }
      }
      else if (p.kind === 'fw') { p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= 0.97; p.vy = p.vy * 0.97 + 40 * dt; }
      else if (p.kind === 'rocket') {
        p.y += p.vy * dt;
        if (p.t >= p.life && !p.done) { p.done = true; burst(p.x, p.y); sfx.boom(); }
      }
      else { p.x += p.vx * dt; p.y += p.vy * dt; }
    }
    if (postBounce > 0) postBounce = Math.max(0, postBounce - dt);
    for (let i = particles.length - 1; i >= 0; i--) if (particles[i].t > particles[i].life + (particles[i].kind === 'letter' ? 0.01 : 0)) particles.splice(i, 1);
  }

  // ------------------------------------------------------------------ 描画
  let time = 0;
  const RAINBOW = ['#ff5a5a', '#ffaa3c', '#ffe650', '#6edc5a', '#5aa0ff', '#be6eff'];
  const pc = document.createElement('canvas'); pc.width = 40; pc.height = 40;
  const pg = pc.getContext('2d');

  // 向きに合わせて左右反転した位置に重ねる
  function layer(name, x, y, base) {
    const left = player.face < 0;
    const img = SPR[name + (left ? '_L' : '')];
    const dx = left ? base.width - x - img.width : x;
    pg.drawImage(img, 12 + dx, 12 + y);
  }

  function drawPlayer(camY) {
    let key = 'STAND';
    if (!player.onGround) key = 'JUMP';
    else if (Math.abs(player.vx) > 8) key = (Math.floor(player.animT / (Math.abs(player.vx) > PHYS.run + 10 ? 14 : 10)) % 2) ? 'RUN' : 'STAND';
    const base = SPR[(run.power === 'boots' ? 'B_' : '') + key + (player.face < 0 ? '_L' : '')];
    pg.clearRect(0, 0, pc.width, pc.height);
    if (run.power === 'plane') layer(player.gliding ? 'WINGS_OPEN' : 'WINGS', player.gliding ? -8 : -5, 9, base);
    pg.drawImage(base, 12, 12);
    if (run.bag) layer('BAGOVER', 0, 12, base);
    if (run.power === 'lantern') layer('LANTERN_S', 12, key === 'JUMP' ? 2 : 12, base);
    if (run.invT > 0) {
      pg.save();
      pg.globalCompositeOperation = 'source-atop';
      pg.globalAlpha = 0.5;
      pg.fillStyle = RAINBOW[Math.floor(time * 12) % RAINBOW.length];
      pg.fillRect(0, 0, pc.width, pc.height);
      pg.restore();
    }
    // 点めつ：ダメージ直後、むてきの終わり間近
    const blinkHurt = run.hurtT > 0 && Math.floor(time * 15) % 2 === 0;
    const blinkInv = run.invT > 0 && run.invT < RULE.invWarn && Math.floor(time * 10) % 2 === 0;
    if (blinkHurt) return;
    const sx = Math.round(player.x + player.w / 2 - base.width / 2 - camX) - 12;
    const sy = Math.round(player.y + player.h - base.height + 1 - camY) - 12 + (player.inSand && player.onGround ? 3 : 0);
    if (player.onGround && state === 'play') {
      ctx.fillStyle = 'rgba(30,40,20,.3)';
      ctx.beginPath(); ctx.ellipse(Math.round(player.x + player.w / 2 - camX), Math.round(player.y + player.h - camY), 7, 1.5, 0, 0, 7); ctx.fill();
    }
    if (blinkInv) ctx.globalAlpha = 0.5;
    ctx.drawImage(pc, sx, sy);
    ctx.globalAlpha = 1;
    if (run.invT > 0 && Math.floor(time * 20) % 3 === 0) {
      particles.push({ kind: 'spark', x: player.x + Math.random() * 14 - 2, y: player.y + Math.random() * 18, vx: 0, vy: -20, t: 0, life: 0.3 });
    }
  }

  // クモリ城のシルエット（ワールド5）
  function drawCastle(cx, groundY) {
    const off = cx * 0.15, step = 260;
    for (let i = Math.floor(off / step) - 1; i * step - off < viewW + step; i++) {
      const x = Math.round(i * step - off + ((i * 53) % 70));
      const base = groundY - 14;
      ctx.fillStyle = 'rgba(30,22,52,.55)';
      ctx.fillRect(x, base - 50, 70, 50);
      for (let k = 0; k < 70; k += 10) ctx.fillRect(x + k, base - 56, 6, 6);
      ctx.fillRect(x + 8, base - 80, 14, 30); ctx.fillRect(x + 48, base - 92, 16, 42);
      ctx.beginPath(); ctx.moveTo(x + 6, base - 80); ctx.lineTo(x + 15, base - 96); ctx.lineTo(x + 24, base - 80); ctx.fill();
      ctx.beginPath(); ctx.moveTo(x + 46, base - 92); ctx.lineTo(x + 56, base - 112); ctx.lineTo(x + 66, base - 92); ctx.fill();
      ctx.fillStyle = 'rgba(255,220,120,.5)';
      ctx.fillRect(x + 54, base - 80, 4, 6); ctx.fillRect(x + 30, base - 34, 4, 6);
    }
  }
  // 歯車（ワールド6の遠く）
  function drawGears(cx, groundY) {
    const off = cx * 0.2, step = 150;
    for (let i = Math.floor(off / step) - 1; i * step - off < viewW + step; i++) {
      const r = 18 + ((i * 7) % 3) * 8;
      const x = i * step - off + ((i * 41) % 60), y = groundY - 40 - ((i * 29) % 50);
      const ang = time * (i % 2 ? 0.6 : -0.6);
      ctx.fillStyle = 'rgba(110,76,40,.45)';
      ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill();
      for (let k = 0; k < 8; k++) {
        const a = ang + k * Math.PI / 4;
        ctx.fillRect(Math.round(x + Math.cos(a) * (r + 3)) - 3, Math.round(y + Math.sin(a) * (r + 3)) - 3, 6, 6);
      }
      ctx.fillStyle = 'rgba(250,224,170,.35)';
      ctx.beginPath(); ctx.arc(x, y, r * 0.35, 0, 7); ctx.fill();
    }
  }
  // 星と、うかぶ時計（ワールド7）
  function drawStarsClocks(cx) {
    ctx.fillStyle = '#fff';
    for (let i = 0; i < 40; i++) {
      const tw = (Math.sin(time * 2 + i) + 1) / 2;
      ctx.globalAlpha = 0.4 + tw * 0.6;
      ctx.fillRect((i * 97 + Math.floor(cx * 0.03)) % viewW, (i * 53) % 110, 1, 1);
    }
    ctx.globalAlpha = 1;
    const off = cx * 0.1, step = 300;
    for (let i = Math.floor(off / step) - 1; i * step - off < viewW + step; i++) {
      const x = i * step - off + ((i * 37) % 80), y = 40 + ((i * 31) % 40), r = 16;
      ctx.strokeStyle = 'rgba(220,210,255,.45)'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.stroke();
      const a1 = time * 0.5 + i, a2 = time * 3 + i;
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(a1) * r * 0.5, y + Math.sin(a1) * r * 0.5);
      ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(a2) * r * 0.8, y + Math.sin(a2) * r * 0.8); ctx.stroke();
    }
  }

  // ピラミッド（ワールド2の遠く）
  function drawPyramids(cx, groundY) {
    const off = cx * 0.12, step = 220;
    for (let i = Math.floor(off / step) - 1; i * step - off < viewW + step; i++) {
      const x = Math.round(i * step - off + ((i * 71) % 60)), h = 46 + ((i * 29) % 24);
      const base = groundY - 18;
      for (let y = 0; y < h; y++) {
        const w = Math.round((y / h) * h * 1.1);
        ctx.fillStyle = y % 6 === 0 ? 'rgba(160,110,70,.55)' : 'rgba(200,150,96,.55)';
        ctx.fillRect(x - w, base - h + y, w, 1);
        ctx.fillStyle = y % 6 === 0 ? 'rgba(130,86,56,.55)' : 'rgba(170,120,78,.55)';
        ctx.fillRect(x, base - h + y, w, 1);
      }
    }
  }
  // オーロラ（ワールド3の夜空）
  function drawAurora() {
    const cols = ['rgba(110,240,170,.22)', 'rgba(120,200,255,.18)', 'rgba(200,140,255,.14)'];
    cols.forEach((c, k) => {
      ctx.fillStyle = c;
      for (let x = 0; x < viewW; x += 2) {
        const y = 30 + k * 12 + Math.sin(x * 0.02 + time * 0.6 + k) * 10 + Math.sin(x * 0.007 + k * 2) * 14;
        ctx.fillRect(x, Math.round(y), 2, 14 + Math.round(Math.sin(x * 0.05 + time + k) * 4));
      }
    });
    // 星
    ctx.fillStyle = '#fff';
    for (let i = 0; i < 30; i++) ctx.fillRect((i * 97) % viewW, (i * 53) % 90, 1, 1);
  }
  // 海の中：青い光と、のぼっていくあわ
  function drawWater() {
    ctx.fillStyle = 'rgba(40,130,210,.16)'; ctx.fillRect(0, 0, viewW, viewH);
    ctx.fillStyle = 'rgba(200,240,255,.06)';
    for (let i = 0; i < 4; i++) {
      const x = ((i * 110 + time * 6) % (viewW + 120)) - 60;
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x + 30, 0); ctx.lineTo(x + 90, viewH); ctx.lineTo(x + 50, viewH); ctx.fill();
    }
    ctx.strokeStyle = 'rgba(220,240,255,.5)'; ctx.lineWidth = 1;
    for (let i = 0; i < 14; i++) {
      const x = (i * 71) % viewW + Math.sin(time * 2 + i) * 3;
      const y = viewH - ((time * (14 + (i % 4) * 6) + i * 37) % viewH);
      ctx.beginPath(); ctx.arc(x, y, 1 + (i % 3), 0, 7); ctx.stroke();
    }
  }
  // 雪がふる（画面に重ねる）
  function drawSnowfall() {
    for (let i = 0; i < 45; i++) {
      const sp = 14 + (i % 5) * 7;
      const x = Math.round(((i * 53 + time * (8 + (i % 3) * 5)) % (viewW + 20)) - 10 + Math.sin(time + i) * 4);
      const y = Math.round((i * 41 + time * sp) % viewH);
      ctx.fillStyle = i % 4 === 0 ? 'rgba(255,255,255,.95)' : 'rgba(255,255,255,.7)';
      ctx.fillRect(x, y, i % 4 === 0 ? 2 : 1, i % 4 === 0 ? 2 : 1);
    }
  }

  // 森の木（奥の列）
  function drawForest(cx, groundY) {
    const par = 0.6, step = 40;
    const off = cx * par;
    for (let i = Math.floor(off / step) - 1; i * step - off < viewW + step; i++) {
      const x = Math.round(i * step - off + ((i * 37) % 17));
      const h = 26 + ((i * 53) % 14);
      ctx.fillStyle = '#4a3420'; ctx.fillRect(x + 6, groundY - h + 10, 4, h - 10);
      ctx.fillStyle = '#1f5e3a'; ctx.beginPath(); ctx.arc(x + 8, groundY - h + 8, 12, 0, 7); ctx.fill();
      ctx.fillStyle = '#2f7f4a'; ctx.beginPath(); ctx.arc(x + 6, groundY - h + 5, 8, 0, 7); ctx.fill();
    }
  }

  // 灯台（1-3のゴールの先）。ワールド1をクリアすると光る
  function drawLighthouse(x, groundY) {
    x = Math.round(x);
    const lit = !!save.chapters[curWorld];
    for (let i = 0; i < 64; i++) {
      const w = Math.round(lerp(14, 22, i / 63));
      const stripe = Math.floor(i / 10) % 2 === 1;
      ctx.fillStyle = stripe ? '#e23034' : '#f4f0e8';
      ctx.fillRect(x - Math.floor(w / 2), groundY - 64 + i, w, 1);
    }
    ctx.fillStyle = '#281c34'; ctx.fillRect(x - 10, groundY - 66, 20, 3);
    ctx.fillStyle = lit ? '#fff4aa' : '#8a8ca0'; ctx.fillRect(x - 6, groundY - 76, 12, 10);
    ctx.fillStyle = '#281c34'; ctx.fillRect(x - 8, groundY - 80, 16, 4); ctx.fillRect(x - 1, groundY - 84, 2, 4);
    if (lit) {
      ctx.fillStyle = 'rgba(255,244,170,.25)';
      ctx.beginPath(); ctx.moveTo(x, groundY - 71); ctx.lineTo(x - 120, groundY - 100); ctx.lineTo(x - 120, groundY - 50); ctx.fill();
    }
  }

  // ------------------------------------------------------------------ ボス：ゲコドン
  // ぴょーんと跳んで、着地すると地面を走る「ゆれ」を出す。上から3回ふむと勝ち
  let shockwaves = [];
  let bigGem = null;
  let shake = 0;
  let bossShots = [];     // 雪だるま将軍の雪玉

  function updateBoss(dt) {
    if (!boss) { updateBigGem(dt); updateShockwaves(dt); return; }
    const b = boss;
    if (b.hurtT > 0) b.hurtT -= dt;
    if (b.dead) {
      b.deadT += dt; b.vy += PHYS.gDown * dt; b.y += b.vy * dt;
      if (b.deadT > 1.2 && !bigGem) {
        bigGem = { x: LEVEL_W * TILE / 2 - 6, y: 20, vy: 0, w: 12, h: 11, landed: false };
      }
      updateBigGem(dt);
      return;
    }
    if (!b.active) { if (player.x > 6 * TILE) b.active = true; else return; }
    const speedUp = (b.maxHp - b.hp) * 0.25;
    b.t += dt;
    if (b.type === 'geko') updateGeko(b, dt, speedUp);
    else if (b.type === 'zara') updateZara(b, dt, speedUp);
    else if (b.type === 'tako') updateTako(b, dt, speedUp);
    else if (b.type === 'baron') updateBaron(b, dt, speedUp);
    else if (b.type === 'gear') updateGear(b, dt, speedUp);
    else if (b.type === 'toki') updateToki(b, dt, speedUp);
    else updateSnowman(b, dt, speedUp);

    // 主人公とのふれあい（頭をふむとダメージ。ほかの場所をふんだら、はね返るだけ）
    if (state === 'play') {
      for (const box of bossBoxes(b)) {
        if (!overlap(player, box)) continue;
        const fromAbove = player.vy > 0 && player.prevBottom <= box.y + 8;
        if (fromAbove) {
          if (box.head && b.hurtT <= 0) hitBoss(1, true);
          else { player.vy = -230; player.y = box.y - player.h; player.jumping = false; }
        } else if (run.invT > 0) { if (b.hurtT <= 0) hitBoss(1, false); }
        else damage();
        break;
      }
    }
    // 光の玉
    for (const ball of balls) {
      if (!ball.done && b.hurtT <= 0 && bossBoxes(b).some(box => overlap(ball, box))) { ball.done = true; hitBoss(1 / 3, false); }
    }
    updateShockwaves(dt);
    updateBossShots(dt);
    updateSlams(dt);
  }

  function bossBoxes(b) {
    if (b.type === 'zara') {
      return [{ x: b.x, y: b.y, w: b.w, h: b.h, head: true }, ...zaraSegs(b).map(p => ({ x: p.x + 1, y: p.y + 1, w: 12, h: 9 }))];
    }
    if (b.type === 'baron') return [{ x: b.x + 3, y: b.y, w: b.w - 6, h: 10, head: true }, { x: b.x - 4, y: b.y + 10, w: b.w + 8, h: b.h - 10 }];
    if (b.type === 'toki') return b.alpha < 0.5 ? [] : [{ x: b.x + 2, y: b.y, w: b.w - 4, h: 9, head: true }, { x: b.x, y: b.y + 9, w: b.w, h: b.h - 9 }];
    if (b.type === 'gear') return [{ x: b.x + 2, y: b.y, w: b.w - 4, h: 9, head: true }, { x: b.x, y: b.y + 9, w: b.w, h: b.h - 9 }];
    if (b.type === 'tako') return [{ x: b.x + 4, y: b.y, w: b.w - 8, h: 10, head: true }, { x: b.x, y: b.y + 10, w: b.w, h: b.h - 10 }];
    if (b.type === 'snow') return [{ x: b.x + 3, y: b.y, w: b.w - 6, h: 11, head: true }, { x: b.x - 1, y: b.y + 11, w: b.w + 2, h: b.h - 11 }];
    return [{ x: b.x, y: b.y, w: b.w, h: b.h, head: true }];
  }

  function landShock(b, speed) {
    b.vx = 0; shake = 0.3; sfx.thud();
    for (const dir of [-1, 1]) shockwaves.push({ x: b.x + b.w / 2, dir, speed, t: 0, y: b.y + b.h });
  }

  // ゲコドン：ためて → 大ジャンプ → 着地でゆれ
  function updateGeko(b, dt, speedUp) {
    if (b.mode === 'idle') {
      b.face = player.x < b.x ? -1 : 1;
      if (b.t > 1.1 - speedUp) { b.mode = 'crouch'; b.t = 0; }
    } else if (b.mode === 'crouch') {
      b.squash = Math.min(1, b.t / 0.3);
      if (b.t > 0.35) {
        b.mode = 'air'; b.t = 0; b.squash = 0;
        b.vy = -340;
        b.vx = Math.max(-130, Math.min(130, (player.x - b.x) * 1.1));
      }
    }
    const wasAir = b.mode === 'air';
    moveBody(b, dt);
    if (wasAir && b.onGround && b.t > 0.1) { b.mode = 'idle'; b.t = 0; landShock(b, 120 + speedUp * 60); }
    if (b.onGround && b.mode !== 'air') b.vx = 0;
  }

  // ザラザラ：地面をはって往復し、ときどき大きくはねる。体は頭のあとをついてくる
  function zaraSegs(b) {
    const segs = [];
    for (let i = 1; i <= 5; i++) {
      const p = b.hist[Math.max(0, b.hist.length - 1 - i * 10)];
      segs.push({ x: p.x - 1, y: p.y + 2 });
    }
    return segs;
  }
  function updateZara(b, dt, speedUp) {
    const speed = 62 + speedUp * 50;
    if (b.mode === 'crawl') {
      b.vx = b.dir * speed;
      if (b.t > 2.4 - speedUp * 1.2 && b.onGround) { b.mode = 'leap'; b.t = 0; b.vy = -310; }
    }
    if (moveBody(b, dt)) b.dir = -b.dir;
    b.face = b.dir;
    if (b.mode === 'leap' && b.onGround && b.t > 0.15) {
      b.mode = 'crawl'; b.t = 0;
      landShock(b, 100 + speedUp * 50);
      b.vx = b.dir * speed;
    }
    b.hist.push({ x: b.x, y: b.y });
    if (b.hist.length > 70) b.hist.shift();
  }

  // 雪だるま将軍：雪玉を2回なげて → ジャンプ → 着地でゆれ
  function updateSnowman(b, dt, speedUp) {
    if (b.mode === 'idle') {
      b.face = player.x < b.x ? -1 : 1;
      if (b.t > 1.0 - speedUp * 0.8) {
        b.t = 0;
        if (b.throws < 2) {
          b.throws++;
          const dx = player.x - b.x;
          bossShots.push({ x: b.x + b.w / 2 - 5, y: b.y + 4, w: 10, h: 10, vx: Math.max(-150, Math.min(150, dx * 0.9)), vy: -250, bounces: 0 });
          sfx.fire();
        } else { b.mode = 'crouch'; b.throws = 0; }
      }
    } else if (b.mode === 'crouch') {
      b.squash = Math.min(1, b.t / 0.3);
      if (b.t > 0.35) {
        b.mode = 'air'; b.t = 0; b.squash = 0;
        b.vy = -300; b.vx = Math.max(-110, Math.min(110, (player.x - b.x) * 1.0));
      }
    }
    const wasAir = b.mode === 'air';
    moveBody(b, dt);
    if (wasAir && b.onGround && b.t > 0.1) { b.mode = 'idle'; b.t = 0; landShock(b, 110 + speedUp * 60); }
    if (b.onGround && b.mode !== 'air') b.vx = 0;
  }

  function updateBossShots(dt) {
    for (const sh of bossShots) {
      if (sh.roll) {
        // 転がる歯車：地面を一直線に転がる。かべで消える
        sh.x += sh.vx * dt; sh.t = (sh.t || 0) + dt;
        if (sh.x < TILE || sh.x > (LEVEL_W - 1) * TILE - sh.w) sh.done = true;
        for (const ball of balls) if (!ball.done && overlap(ball, sh)) { ball.done = true; sh.done = true; }
        if (!sh.done && state === 'play' && overlap(player, sh)) { if (run.invT > 0) sh.done = true; else damage(); }
        continue;
      }
      sh.vy = Math.min(sh.vy + 900 * dt, 360);
      sh.x += sh.vx * dt; sh.y += sh.vy * dt;
      if (sh.y + sh.h >= 10 * TILE) {
        sh.y = 10 * TILE - sh.h; sh.bounces++;
        sh.vy = -170;
        if (sh.bounces > 2) sh.done = true;
      }
      if (sh.x < TILE || sh.x > (LEVEL_W - 1) * TILE - sh.w) sh.vx = -sh.vx;
      for (const ball of balls) if (!ball.done && overlap(ball, sh)) { ball.done = true; sh.done = true; }
      if (!sh.done && state === 'play' && overlap(player, sh)) {
        if (run.invT > 0) sh.done = true; else damage();
      }
      if (sh.done) for (let i = 0; i < 6; i++) particles.push({ kind: 'spark', x: sh.x + 5, y: sh.y + 5, vx: (i - 2.5) * 30, vy: -60 + i * 10, t: 0, life: 0.3 });
    }
    bossShots = bossShots.filter(sh => !sh.done);
  }

  function updateShockwaves(dt) {
    for (const w of shockwaves) {
      w.t += dt; w.x += w.dir * w.speed * dt;
      if (state === 'play' && player.onGround && Math.abs(player.y + player.h - w.y) < 4 &&
          Math.abs(player.x + player.w / 2 - w.x) < 8) damage();
    }
    shockwaves = shockwaves.filter(w => w.t < 2.2 && w.x > TILE && w.x < (LEVEL_W - 1) * TILE);
    if (shake > 0) shake -= dt;
  }

  function hitBoss(amount, stomped) {
    const b = boss;
    b.hp = Math.max(0, b.hp - amount);
    b.hurtT = (stomped || amount >= 1) ? 1.0 : 0.25;    // むてきでさわったときも、ふんだときと同じ間をあける
    sfx.bossHit();
    if (stomped) {
      player.vy = -PHYS.stompHigh; player.jumping = input.jump; player.usedDouble = false;
      player.y = b.y - player.h;
    }
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      particles.push({ kind: 'spark', x: b.x + b.w / 2, y: b.y + 6, vx: Math.cos(a) * 80, vy: Math.sin(a) * 80, t: 0, life: 0.35 });
    }
    if (b.hp <= 0.001) {
      b.dead = true; b.deadT = 0; b.vy = -200; shockwaves = []; bossShots = []; slams = [];
      SND.stop(); sfx.bossDown();
      popJoy(6);
    }
  }

  // ------------------------------------------------------------------ わな（タイミングで通る）
  // トゲの柱の動き：出ている時間は周期の45%まで（最大1.0秒）。
  // 周期が短くても、かならず「引っこんでいる時間」が残るようにする（通れるすきまを保証）
  const pistonTiming = tr => {
    const rise = 0.15, lower = 0.2, up = Math.min(1.0, tr.period * 0.45);
    return { rise, lower, up, down: tr.period - rise - up - lower };
  };
  const pistonF = tr => {
    const { rise, lower, up, down } = pistonTiming(tr);
    const ph = (trapClock + tr.phase) % tr.period;
    if (ph < down) return 0;
    if (ph < down + rise) return (ph - down) / rise;
    if (ph < down + rise + up) return 1;
    return 1 - (ph - down - rise - up) / lower;
  };
  function trapBox(tr) {
    if (tr.type === 'bolt') return { x: tr.x * TILE + 3, y: 0, w: 10, h: 10 * TILE };
    if (tr.type === 'piston') {
      const hgt = tr.f * tr.h * TILE;
      return { x: tr.x * TILE + 2, y: 10 * TILE - hgt, w: 12, h: hgt };
    }
    return { x: tr.x * TILE + 5, y: tr.row0 * TILE, w: 6, h: (tr.row1 - tr.row0 + 1) * TILE };
  }
  function updateTraps(dt) {
    trapClock += dt;
    for (const tr of traps) {
      if (tr.type === 'door') {
        // 扉：開いているあいだだけ通れる（主人公がはさまるときは閉めない）
        const ph = (trapClock + tr.phase) % tr.period;
        const wantOpen = ph < tr.open;
        tr.warn = !wantOpen && ph > tr.period - 0.5;
        const box = { x: tr.x * TILE, y: tr.row0 * TILE, w: TILE, h: (tr.row1 - tr.row0 + 1) * TILE };
        if (wantOpen && tr.shut) { tr.shut = false; for (let y = tr.row0; y <= tr.row1; y++) level[y][tr.x] = '.'; }
        else if (!wantOpen && !tr.shut && !overlap(player, box)) { tr.shut = true; for (let y = tr.row0; y <= tr.row1; y++) level[y][tr.x] = 'D'; }
        continue;
      }
      if (tr.type === 'bolt') {
        const ph = (trapClock + tr.phase) % tr.period;
        const live = ph > tr.period - 0.3;
        tr.warn = !live && ph > tr.period - 1.0;
        const near = Math.abs(tr.x * TILE - player.x) < viewW * 0.6;
        if (live && !tr.live && near) { sfx.thud(); shake = Math.max(shake, 0.1); }
        tr.live = live;
        if (live && overlap(player, trapBox(tr))) damage();
        continue;
      }
      if (tr.type === 'wind') {
        const ph = (trapClock + tr.phase) % tr.period;
        tr.live = ph < tr.on;
        tr.warn = !tr.live && ph > tr.period - 0.6;
        continue;
      }
      if (tr.type === 'piston') {
        tr.f = pistonF(tr);
        const ph = (trapClock + tr.phase) % tr.period, dn = pistonTiming(tr).down;
        tr.warn = ph > dn - 0.35 && ph < dn;
        if (tr.f > 0.15 && overlap(player, trapBox(tr))) damage();
      } else {
        const ph = (trapClock + tr.phase) % tr.period;
        const live = ph < tr.on;
        tr.warn = !live && ph > tr.period - 0.45;
        const near = Math.abs(tr.x * TILE - player.x) < viewW * 0.6;
        if (live && !tr.live && near) sfx.zap();
        tr.live = live;
        if (live && overlap(player, trapBox(tr))) damage();
        if (live) for (const e of enemies) if (!e.dead && overlap(e, trapBox(tr)) && e.kind !== 'uni') killEnemy(e, 'fall');
      }
    }
    // くずれる足場
    for (const key in crumbles) {
      const c = crumbles[key];
      c.t += dt;
      if (!c.gone && c.t > 0.45) {
        c.gone = true; c.t = 0; level[c.y][c.x] = '.'; sfx.crumble();
        particles.push({ kind: 'debris', x: c.x * TILE, y: c.y * TILE, vy: 0, t: 0, life: 0.8 });
      } else if (c.gone && c.t > 3.2) {
        const box = { x: c.x * TILE, y: c.y * TILE, w: TILE, h: TILE };
        if (!overlap(player, box)) { level[c.y][c.x] = 'C'; delete crumbles[key]; }
      }
    }
  }
  function drawTraps(camY, cx) {
    for (const tr of traps) {
      if (tr.type === 'wind') { drawWind(tr, camY, cx); continue; }
      if (tr.type === 'door') {
        if (tr.warn && !tr.shut) {
          ctx.fillStyle = 'rgba(255,90,90,.6)';
          const dx0 = Math.round(tr.x * TILE - cx);
          for (let y = tr.row0; y <= tr.row1; y++) ctx.fillRect(dx0 + 6, Math.round(y * TILE - camY) + 6, 4, 4);
        }
        continue;
      }
      const b = trapBox(tr);
      const x = Math.round(b.x - cx);
      if (x < -20 || x > viewW + 20) continue;
      if (tr.type === 'bolt') { drawBolt(tr, x, camY); continue; }
      if (tr.type === 'piston') {
        // 出る前は、地面がぶくぶく
        if (tr.warn) {
          ctx.fillStyle = 'rgba(255,255,255,.8)';
          for (let i = 0; i < 3; i++) ctx.fillRect(x + 1 + i * 4, Math.round(10 * TILE - camY) - 2 - ((Math.floor(time * 12) + i) % 3), 2, 2);
        }
        if (b.h < 1) continue;
        const top = Math.round(b.y - camY), bottom = Math.round(10 * TILE - camY);
        ctx.fillStyle = '#60228c'; ctx.fillRect(x + 2, top + 4, 8, bottom - top - 4);
        ctx.fillStyle = '#9640c8'; ctx.fillRect(x + 3, top + 4, 3, bottom - top - 4);
        for (let yy = top + 6; yy < bottom; yy += 6) { ctx.fillStyle = '#ffffff'; ctx.fillRect(x, yy, 2, 2); ctx.fillRect(x + 10, yy + 3, 2, 2); }
        // とがった先
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(x + 5, top, 2, 2); ctx.fillRect(x + 4, top + 2, 4, 2); ctx.fillStyle = '#cc82f4'; ctx.fillRect(x + 3, top + 3, 6, 2);
      } else {
        // 電気の門：上と下にクラゲ、間に電気
        const y0 = Math.round(tr.row0 * TILE - camY), y1 = Math.round((tr.row1 + 1) * TILE - camY);
        ctx.drawImage(SPR.JELLY, x - 2, y0 - 2);
        ctx.save(); ctx.translate(x - 2 + SPR.JELLY.width / 2, y1 + 2); ctx.scale(1, -1); ctx.drawImage(SPR.JELLY, -SPR.JELLY.width / 2, 0); ctx.restore();
        if (tr.live || (tr.warn && Math.floor(time * 16) % 2 === 0)) {
          ctx.fillStyle = tr.live ? 'rgba(255,250,160,.35)' : 'rgba(255,250,160,.15)';
          ctx.fillRect(x - 3, y0 + 8, 12, y1 - y0 - 16);
          if (tr.live) {
            ctx.fillStyle = '#fff8a0';
            let px = x + 3;
            for (let yy = y0 + 8; yy < y1 - 8; yy += 3) {
              px = x + 1 + ((yy * 7 + Math.floor(time * 30)) % 5);
              ctx.fillRect(px, yy, 2, 3);
            }
          }
        }
      }
    }
  }

  // 雷：上に黒い雲。落ちる前は雲が光り、地面に小さな火花
  function drawBolt(tr, x, camY) {
    const gy = Math.round(10 * TILE - camY);
    const cyy = 14;
    const flash = tr.warn && Math.floor(time * 14) % 2 === 0;
    ctx.fillStyle = flash ? '#a8a0d0' : '#4a4468';
    ctx.beginPath(); ctx.ellipse(x + 5, cyy + 4, 16, 7, 0, 0, 7); ctx.fill();
    ctx.beginPath(); ctx.ellipse(x - 4, cyy + 7, 9, 5, 0, 0, 7); ctx.fill();
    ctx.beginPath(); ctx.ellipse(x + 14, cyy + 7, 9, 5, 0, 0, 7); ctx.fill();
    if (tr.warn) {
      ctx.fillStyle = 'rgba(255,240,120,.7)';
      ctx.fillRect(x + 1 + (Math.floor(time * 20) % 3) * 3, gy - 3, 2, 2);
    }
    if (tr.live) {
      ctx.fillStyle = 'rgba(255,250,200,.35)'; ctx.fillRect(x - 3, cyy + 8, 16, gy - cyy - 8);
      ctx.fillStyle = '#fff8a0';
      let px = x + 4;
      for (let y = cyy + 8; y < gy; y += 6) {
        const nx = x + 2 + ((y * 13 + Math.floor(time * 40)) % 7);
        ctx.fillRect(Math.min(px, nx), y, Math.abs(nx - px) + 3, 3);
        ctx.fillRect(nx, y, 3, 6);
        px = nx;
      }
    }
  }
  // 風：流れる白い線（吹く前は少しだけ）
  function drawWind(tr, camY, cx) {
    const x0 = tr.x0 * TILE - cx, x1 = (tr.x1 + 1) * TILE - cx;
    if (x1 < 0 || x0 > viewW) return;
    const n = tr.live ? 14 : tr.warn ? 4 : 0;
    const dir = Math.sign(tr.force);
    ctx.fillStyle = 'rgba(255,255,255,.75)';
    for (let i = 0; i < n; i++) {
      const span = x1 - x0;
      const xx = x0 + (((i * 67 + time * 180 * dir) % span) + span) % span;
      const yy = Math.round(10 * TILE - camY) - 12 - ((i * 23) % 110);
      ctx.fillRect(Math.round(xx), yy, 14, 1);
    }
  }

  // ------------------------------------------------------------------ ボス：大ダコ ヌルリン
  // スミをはく → 足をたたきつける（影が出た場所に落ちてくる）→ ジャンプ、のくり返し
  let slams = [];
  function updateTako(b, dt, speedUp) {
    if (b.mode === 'idle') {
      b.face = player.x < b.x ? -1 : 1;
      if (b.t > 1.0 - speedUp * 0.6) {
        b.t = 0;
        const act = ['ink', 'slam', 'jump'][b.throws % 3];
        b.throws++;
        if (act === 'ink') {
          for (const a of [-1, 0, 1]) {
            const dx = player.x - b.x;
            bossShots.push({ x: b.x + b.w / 2 - 5, y: b.y + 6, w: 10, h: 10, ink: true,
              vx: Math.max(-170, Math.min(170, dx * 0.9)) + a * 45, vy: -230 - Math.abs(a) * 40, bounces: 1 });
          }
          sfx.fire();
        } else if (act === 'slam') {
          for (const off of [0, 72, -72]) {
            const x = Math.max(TILE * 2, Math.min((LEVEL_W - 3) * TILE, player.x + player.w / 2 + off));
            slams.push({ x, t: 0, warn: 0.75 - speedUp * 0.15 });
          }
        } else { b.mode = 'crouch'; }
      }
    } else if (b.mode === 'crouch') {
      b.squash = Math.min(1, b.t / 0.3);
      if (b.t > 0.35) {
        b.mode = 'air'; b.t = 0; b.squash = 0;
        b.vy = -320; b.vx = Math.max(-120, Math.min(120, (player.x - b.x) * 1.0));
      }
    }
    const wasAir = b.mode === 'air';
    moveBody(b, dt);
    if (wasAir && b.onGround && b.t > 0.1) { b.mode = 'idle'; b.t = 0; landShock(b, 115 + speedUp * 60); }
    if (b.onGround && b.mode !== 'air') b.vx = 0;
  }
  function updateSlams(dt) {
    for (const sl of slams) {
      sl.t += dt;
      if (sl.t > sl.warn && !sl.hit) { sl.hit = true; shake = 0.15; sl.kind === 'sand' ? sfx.crumble() : sfx.thud(); }
      if (sl.hit && sl.t < sl.warn + 0.45 && state === 'play' &&
          overlap(player, { x: sl.x - 9, y: 0, w: 18, h: 10 * TILE })) damage();
    }
    slams = slams.filter(sl => sl.t < sl.warn + 0.6);
  }
  function drawSlams(camY, cx) {
    for (const sl of slams) {
      const x = Math.round(sl.x - cx), gy = Math.round(10 * TILE - camY);
      if (sl.t < 0) continue;
      if (sl.kind === 'bolt' || sl.kind === 'sand') {
        if (!sl.hit) {
          const k = Math.max(0, sl.t / sl.warn);
          ctx.fillStyle = sl.kind === 'bolt' ? `rgba(255,240,120,${0.2 + k * 0.5})` : `rgba(240,210,140,${0.2 + k * 0.5})`;
          ctx.fillRect(x - 6 - Math.round(k * 4), gy - 2, 12 + Math.round(k * 8), 2);
          if (sl.kind === 'sand') { ctx.fillStyle = 'rgba(240,210,140,.6)'; for (let i = 0; i < 4; i++) ctx.fillRect(x - 4 + i * 3, ((time * 80 + i * 17) % 60) + 30, 1, 3); }
        } else if (sl.kind === 'bolt') {
          ctx.fillStyle = 'rgba(255,250,200,.35)'; ctx.fillRect(x - 8, 0, 16, gy);
          ctx.fillStyle = '#fff8a0';
          for (let y = 0; y < gy; y += 6) { const nx = x - 3 + ((y * 13 + Math.floor(time * 40)) % 7); ctx.fillRect(nx, y, 3, 6); }
        } else {
          ctx.fillStyle = '#c8a060'; ctx.fillRect(x - 7, 0, 14, gy);
          ctx.fillStyle = '#f0d890'; ctx.fillRect(x - 4, 0, 5, gy);
          ctx.fillStyle = '#fff0b4'; for (let y = (Math.floor(time * 200) % 8); y < gy; y += 8) ctx.fillRect(x - 2, y, 2, 3);
        }
        continue;
      }
      if (!sl.hit) {
        // 落ちてくる場所に影
        const k = sl.t / sl.warn;
        ctx.fillStyle = `rgba(20,10,40,${0.25 + k * 0.4})`;
        ctx.beginPath(); ctx.ellipse(x, gy - 1, 6 + k * 6, 2, 0, 0, 7); ctx.fill();
      } else {
        const k = Math.min(1, (sl.t - sl.warn) / 0.08);
        const top = Math.round(gy - 10 * TILE * k);
        ctx.fillStyle = '#961828'; ctx.fillRect(x - 8, top, 16, gy - top);
        ctx.fillStyle = '#e23034'; ctx.fillRect(x - 6, top, 10, gy - top);
        for (let yy = top + 4; yy < gy; yy += 8) { ctx.fillStyle = '#ff7868'; ctx.fillRect(x - 4, yy, 4, 4); }
      }
    }
  }

  // ------------------------------------------------------------------ ボス：クモリ男爵（雷雲にのる）
  // 空を左右にただよい、雷を落とす → 手下をよぶ → 地面までおりてくる（このとき頭をふめる）
  function updateBaron(b, dt, speedUp) {
    const mid = LEVEL_W * TILE / 2;
    b.face = player.x < b.x ? -1 : 1;
    if (b.mode === 'idle' || b.mode === 'float') {
      b.mode = 'float';
      b.x = mid - b.w / 2 + Math.sin(b.t * (0.7 + speedUp * 0.4)) * 8 * TILE;
      b.y = lerp(b.y, b.homeY + Math.sin(b.t * 2) * 6, Math.min(1, dt * 3));
      b.act = (b.act || 0) + dt;
      if (b.act > 2.6 - speedUp) {
        b.act = 0;
        const what = ['bolt', 'swoop', 'summon', 'bolt', 'swoop'][b.throws % 5];
        b.throws++;
        if (what === 'bolt') {
          for (const off of [0, 80, -80]) {
            const x = Math.max(TILE * 2, Math.min((LEVEL_W - 3) * TILE, player.x + player.w / 2 + off));
            slams.push({ x, t: 0, warn: 0.8 - speedUp * 0.15, kind: 'bolt' });
          }
        } else if (what === 'summon') {
          if (enemies.filter(e => !e.dead).length < 3) {
            for (const sx of [3, LEVEL_W - 4]) enemies.push({ kind: 'moyan', x: sx * TILE, y: 6 * TILE, baseY: 0, w: 12, h: 14, vx: sx < 10 ? 30 : -30, vy: 0, active: true, dead: null, deadT: 0, onGround: false, t: 0 });
          }
        } else { b.mode = 'swoop'; b.t = 0; b.swoopX = Math.max(2 * TILE, Math.min((LEVEL_W - 3) * TILE, player.x)); }
      }
    } else if (b.mode === 'swoop') {
      // おりてくる → 地面で少し休む（チャンス）→ もどる
      const groundY = 10 * TILE - b.h;
      if (b.t < 0.7) { b.x = lerp(b.x, b.swoopX, Math.min(1, dt * 4)); b.y = lerp(b.y, groundY, Math.min(1, dt * 5)); }
      else if (b.t < 2.3 - speedUp * 0.4) { b.y = groundY; if (!b.landed) { b.landed = true; landShock(b, 100 + speedUp * 50); } }
      else { b.y = lerp(b.y, b.homeY, Math.min(1, dt * 3)); if (b.t > 3.0) { b.mode = 'float'; b.landed = false; b.t = Math.asin(Math.max(-1, Math.min(1, (b.x + b.w / 2 - mid) / (8 * TILE)))) / (0.7 + speedUp * 0.4); } }
    }
  }

  // ------------------------------------------------------------------ ボス：ギアゴーレム（転がる歯車）
  function updateGear(b, dt, speedUp) {
    if (b.mode === 'idle') {
      b.face = player.x < b.x ? -1 : 1;
      b.vx = b.face * (30 + speedUp * 30);
      if (b.t > 1.4 - speedUp * 0.5) {
        b.t = 0;
        if (b.throws < 2) {
          b.throws++;
          bossShots.push({ x: b.x + b.w / 2 - 6, y: 10 * TILE - 12, w: 12, h: 12, vx: b.face * (140 + speedUp * 40), vy: 0, roll: true, bounces: 0 });
          sfx.fire();
        } else { b.mode = 'crouch'; b.throws = 0; b.vx = 0; }
      }
    } else if (b.mode === 'crouch') {
      b.vx = 0; b.squash = Math.min(1, b.t / 0.3);
      if (b.t > 0.35) { b.mode = 'air'; b.t = 0; b.squash = 0; b.vy = -330; b.vx = Math.max(-130, Math.min(130, (player.x - b.x) * 1.1)); }
    }
    const wasAir = b.mode === 'air';
    if (moveBody(b, dt) && b.mode === 'idle') b.vx = 0;
    if (wasAir && b.onGround && b.t > 0.1) { b.mode = 'idle'; b.t = 0; landShock(b, 120 + speedUp * 60); }
  }

  // ------------------------------------------------------------------ ボス：時の番人 トキモリ（さいごのボス）
  // 砂をふらせる → 消えて反対側へワープ → 砂の柱を3本 → ジャンプ、のくり返し
  function updateToki(b, dt, speedUp) {
    if (b.mode === 'idle') {
      b.face = player.x < b.x ? -1 : 1;
      if (b.t > 0.9 - speedUp * 0.5) {
        b.t = 0;
        const what = ['sand', 'warp', 'pillars', 'jump'][b.throws % 4];
        b.throws++;
        if (what === 'sand') {
          for (let i = 0; i < 5; i++) {
            const x = Math.max(TILE * 2, Math.min((LEVEL_W - 3) * TILE, player.x + (i - 2) * 56 + (Math.random() - 0.5) * 20));
            slams.push({ x, t: -i * 0.18, warn: 0.75, kind: 'sand' });
          }
        } else if (what === 'warp') { b.mode = 'fadeout'; }
        else if (what === 'pillars') {
          [0, 1, 2].forEach(i => slams.push({ x: Math.max(TILE * 2, Math.min((LEVEL_W - 3) * TILE, player.x + player.w / 2 + (i - 1) * 40)), t: -i * 0.3, warn: 0.7, kind: 'sand' }));
        } else { b.mode = 'crouch'; }
      }
    } else if (b.mode === 'fadeout') {
      b.alpha = Math.max(0, 1 - b.t / 0.4);
      if (b.t > 0.45) {
        b.x = player.x < LEVEL_W * TILE / 2 ? (LEVEL_W - 5) * TILE : 4 * TILE;
        b.mode = 'fadein'; b.t = 0;
      }
    } else if (b.mode === 'fadein') {
      b.alpha = Math.min(1, b.t / 0.4);
      if (b.t > 0.45) { b.mode = 'idle'; b.t = 0; b.alpha = 1; }
    } else if (b.mode === 'crouch') {
      b.squash = Math.min(1, b.t / 0.3);
      if (b.t > 0.35) { b.mode = 'air'; b.t = 0; b.squash = 0; b.vy = -350; b.vx = Math.max(-140, Math.min(140, (player.x - b.x) * 1.2)); }
    }
    const wasAir = b.mode === 'air';
    if (b.mode !== 'fadeout' && b.mode !== 'fadein') moveBody(b, dt);
    if (wasAir && b.onGround && b.t > 0.1) { b.mode = 'idle'; b.t = 0; b.vx = 0; landShock(b, 130 + speedUp * 50); }
    if (b.onGround && b.mode !== 'air') b.vx = 0;
  }

  // ボスをたおすと出る、大きなヒカリのかけら
  function updateBigGem(dt) {
    const g = bigGem;
    if (!g || g.taken) return;
    if (!g.landed) {
      g.vy = Math.min(g.vy + 300 * dt, 120); g.y += g.vy * dt;
      if (g.y + g.h >= 10 * TILE - 8) { g.y = 10 * TILE - 8 - g.h; g.landed = true; }
    }
    if (state === 'play' && overlap(player, g)) { g.taken = true; boss = null; startGoal(); }
  }

  function drawBoss(camY, cx) {
    // ゆれ
    for (const w of shockwaves) {
      const x = Math.round(w.x - cx), y = Math.round(w.y - camY);
      ctx.fillStyle = theme.tiles === 'snow' ? 'rgba(230,244,255,.95)' : 'rgba(255,236,150,.9)';
      ctx.fillRect(x - 3, y - 6, 6, 6);
      ctx.fillStyle = theme.tiles === 'snow' ? 'rgba(140,170,220,.95)' : 'rgba(200,140,60,.9)';
      ctx.fillRect(x - 5, y - 3, 10, 3);
    }
    // 雪玉
    for (const sh of bossShots) {
      if (sh.roll) {
        const gx = Math.round(sh.x + 6 - cx), gy = Math.round(sh.y + 6 - camY), a = (sh.t || 0) * 10 * Math.sign(sh.vx);
        ctx.fillStyle = '#281c34'; ctx.beginPath(); ctx.arc(gx, gy, 7, 0, 7); ctx.fill();
        ctx.fillStyle = '#d8b060'; ctx.beginPath(); ctx.arc(gx, gy, 5, 0, 7); ctx.fill();
        for (let k = 0; k < 6; k++) { const aa = a + k * Math.PI / 3; ctx.fillRect(Math.round(gx + Math.cos(aa) * 6) - 1, Math.round(gy + Math.sin(aa) * 6) - 1, 3, 3); }
        ctx.fillStyle = '#8a6430'; ctx.fillRect(gx - 1, gy - 1, 2, 2);
        continue;
      }
      const x = Math.round(sh.x + 5 - cx), y = Math.round(sh.y + 5 - camY);
      ctx.fillStyle = '#281c34'; ctx.beginPath(); ctx.arc(x, y, 6, 0, 7); ctx.fill();
      ctx.fillStyle = sh.ink ? '#5a3a78' : '#f4f8ff'; ctx.beginPath(); ctx.arc(x, y, 5, 0, 7); ctx.fill();
      ctx.fillStyle = sh.ink ? '#8a6aa8' : '#c8d8f0'; ctx.fillRect(x, y + 1, 3, 2);
    }
    if (bigGem && !bigGem.taken) {
      const gx = Math.round(bigGem.x - cx), gy = Math.round(bigGem.y - camY + Math.sin(time * 3) * 2);
      ctx.fillStyle = 'rgba(158,240,255,.35)'; ctx.beginPath(); ctx.arc(gx + 6, gy + 6, 14, 0, 7); ctx.fill();
      ctx.drawImage(SPR.BIGGEM, gx, gy);
    }
    const b = boss;
    if (!b) return;
    if (b.hurtT > 0 && Math.floor(time * 20) % 2 === 0 && !b.dead) return;
    const flip = b.face > 0 ? '_L' : '';
    if (b.type === 'zara') {
      // 体（しっぽから順にかく）
      if (!b.dead) {
        const segs = zaraSegs(b);
        for (let i = segs.length - 1; i >= 0; i--) {
          const p = segs[i], img = SPR.ZARA_SEG;
          ctx.drawImage(img, Math.round(p.x - cx) - 1, Math.round(p.y - camY) - 1 + (Math.floor(time * 10 + i) % 2));
        }
      }
      const img = SPR['ZARA_HEAD' + flip];
      const x = Math.round(b.x + b.w / 2 - img.width / 2 - cx), y = Math.round(b.y + b.h - img.height - camY + 1);
      if (b.dead) { ctx.save(); ctx.translate(x + img.width / 2, y + img.height / 2); ctx.scale(1, -1); ctx.drawImage(img, -img.width / 2, -img.height / 2); ctx.restore(); }
      else ctx.drawImage(img, x, y);
    } else {
      if (b.type === 'baron') {
        // 雷雲（大きなくも）に男爵がのっている
        const cloud = SPR.MOYAN;
        const cx0 = Math.round(b.x + b.w / 2 - cloud.width - cx), cy0 = Math.round(b.y + b.h - cloud.height * 1.2 - camY);
        ctx.globalAlpha = 0.95;
        ctx.drawImage(cloud, cx0, cy0, cloud.width * 2, Math.round(cloud.height * 1.2));
        ctx.globalAlpha = 1;
        const bi = SPR['BARON' + flip];
        const bx = Math.round(b.x + b.w / 2 - bi.width / 2 - cx), by = Math.round(b.y - camY) - 2;
        if (b.dead) { ctx.save(); ctx.translate(bx + bi.width / 2, by + bi.height / 2); ctx.scale(1, -1); ctx.drawImage(bi, -bi.width / 2, -bi.height / 2); ctx.restore(); }
        else ctx.drawImage(bi, bx, by);
        if (b.mode === 'float' && b.act > 2.0 - (b.maxHp - b.hp) * 0.25) { ctx.fillStyle = '#fff8a0'; ctx.fillRect(bx + 4 + Math.floor(time * 30) % 8, by + bi.height + 8, 2, 4); }
        drawBossHp(b);
        return;
      }
      const img = SPR[({ geko: 'GEKO', snow: 'SNOWMAN', tako: 'TAKO', gear: 'GEARBOT', toki: 'TOKIMORI' })[b.type] + flip];
      ctx.globalAlpha = b.alpha === undefined ? 1 : b.alpha;
      const sq = b.squash * 0.25, st = b.mode === 'air' ? 0.12 : 0;
      const w = Math.round(img.width * (1 + sq - st)), h = Math.round(img.height * (1 - sq + st));
      const x = Math.round(b.x + b.w / 2 - w / 2 - cx), y = Math.round(b.y + b.h - h - camY + 1);
      if (b.dead) {
        ctx.save(); ctx.translate(x + w / 2, y + h / 2); ctx.scale(1, -1); ctx.drawImage(img, -w / 2, -h / 2, w, h); ctx.restore();
      } else ctx.drawImage(img, x, y, w, h);
      ctx.globalAlpha = 1;
    }
    drawBossHp(b);
  }
  function drawBossHp(b) {
    // HP（画面上のまん中）
    if (!b.dead) {
      const n = b.maxHp, bw = 18;
      const sx = Math.round(viewW / 2 - (n * (bw + 3)) / 2);
      for (let i = 0; i < n; i++) {
        const fill = Math.max(0, Math.min(1, b.hp - i));
        ctx.fillStyle = '#281c34'; ctx.fillRect(sx + i * (bw + 3) - 1, 33, bw + 2, 7);
        ctx.fillStyle = '#5a4a78'; ctx.fillRect(sx + i * (bw + 3), 34, bw, 5);
        ctx.fillStyle = '#6ed246'; ctx.fillRect(sx + i * (bw + 3), 34, Math.round(bw * fill), 5);
      }
    }
  }

  function drawCheckpoint(camY) {
    if (!CHECKPOINT) return;
    const x = Math.round(CHECKPOINT.x - camX), y = CHECKPOINT.y - camY;
    ctx.fillStyle = '#646474'; ctx.fillRect(x, y - 28, 2, 28);
    ctx.fillStyle = '#9696a2'; ctx.fillRect(x, y - 28, 1, 28);
    if (run.checkpoint) {
      const wave = Math.round(Math.sin(time * 6));
      ctx.fillStyle = '#281c34'; ctx.fillRect(x + 2, y - 28 + wave, 12, 9);
      ctx.fillStyle = '#fff'; ctx.fillRect(x + 3, y - 27 + wave, 10, 7);
      ctx.fillStyle = '#d6e2f0'; ctx.fillRect(x + 3, y - 27 + wave, 10, 1);
      ctx.fillStyle = '#e23034'; ctx.fillRect(x + 7, y - 25 + wave, 2, 2);
    } else {
      ctx.fillStyle = '#6e7086'; ctx.fillRect(x + 2, y - 28, 10, 7);
      ctx.fillStyle = '#a0a2b6'; ctx.fillRect(x + 3, y - 27, 8, 5);
    }
    ctx.fillStyle = '#281c34'; ctx.fillRect(x - 2, y - 2, 6, 2);
  }

  function draw() {
    // 地面の上面を、下のボタンより上（画面下から約46ドット）に置く
    const camY = 10 * TILE - (viewH - 46) + (shake > 0 ? Math.round(Math.sin(time * 80) * 2) : 0);
    const cx = Math.round(camX);
    ctx.drawImage(sky, 0, 0, viewW, viewH);

    // 太陽
    if (!theme.noSun) {
      const sy = theme.lowSun ? viewH - 90 : 44;      // 夕日は低い位置
      ctx.fillStyle = 'rgba(255,246,200,.25)'; ctx.beginPath(); ctx.arc(viewW - 60, sy, 24, 0, 7); ctx.fill();
      ctx.fillStyle = 'rgba(255,246,200,.4)'; ctx.beginPath(); ctx.arc(viewW - 60, sy, 16, 0, 7); ctx.fill();
      ctx.fillStyle = theme.lowSun ? '#fff0b0' : '#fff6c8'; ctx.beginPath(); ctx.arc(viewW - 60, sy, 10, 0, 7); ctx.fill();
    }

    // 雲（とても遠い）
    if (!theme.water && !theme.castle && !theme.stars && theme.song !== 'final') for (const [x, y, img] of CLOUDS) {
      const sx = ((x - cx * 0.08) % 560 + 560) % 560 - 60;
      ctx.drawImage(img, Math.round(sx), y - camY * 0.1);
    }
    // 山（奥ほどゆっくり動く）
    const groundY = 10 * TILE - camY;
    if (theme.aurora) drawAurora();
    if (theme.stars) drawStarsClocks(cx);
    if (theme.castle) drawCastle(cx, groundY);
    if (theme.gears) drawGears(cx, groundY);
    if (theme.pyramids) drawPyramids(cx, groundY);
    LAYERS.forEach((L, li) => {
      ctx.fillStyle = theme.mtn[li];
      const off = Math.floor(cx * L.par);
      for (let x = 0; x < viewW; x++) {
        const hy = L.h[(x + off) % PERIOD] - BASE_H + viewH;
        ctx.fillRect(x, hy, 1, groundY - hy);
      }
    });
    drawRainbow(camY);
    // 丘
    const off = cx * 0.5;
    for (let x = 0; x < viewW; x++) {
      const hy = Math.round(groundY - 10 - 8 * Math.sin((x + off) * 0.03 + 1));
      ctx.fillStyle = theme.hill[0]; ctx.fillRect(x, hy, 1, groundY - hy);
      ctx.fillStyle = theme.hill[1]; ctx.fillRect(x, hy, 1, 1);
    }
    if (theme.trees) drawForest(cx, groundY);

    // ブロックから出てくるアイテム（ブロックの後ろから出るように先にかく）
    for (const it of items) {
      const img = SPR[ITEM_SPR[it.kind]];
      const bob = it.rise >= 1 ? Math.round(Math.sin(time * 4) * 1) : 0;
      ctx.drawImage(img, Math.round(it.x + 8 - img.width / 2 - cx), Math.round(it.y + 16 - img.height - camY + bob));
    }

    // タイル
    const x0 = Math.floor(cx / TILE), x1 = Math.min(LEVEL_W - 1, Math.floor((cx + viewW) / TILE));
    for (let ty = 0; ty < ROWS; ty++) for (let tx = x0; tx <= x1; tx++) {
      const c = level[ty][tx];
      if (c === '.' || c === 'H') continue;
      const dx = tx * TILE - cx;
      let dy = ty * TILE - camY;
      const bm = bumps.find(b => b.tx === tx && b.ty === ty);
      if (bm) dy -= Math.round(Math.sin((bm.t / 0.15) * Math.PI) * 4);
      if (c === '#') {
        const above = tileAt(tx, ty - 1);
        const T = TILES[theme.tiles || 'grass'];
        ctx.drawImage(above === '#' || above === 'I' || above === 'Q' ? T.mid[tx % 3] : T.top[tx % 3], dx, dy);
      } else if (c === '=') ctx.drawImage(PLANK, dx, dy);
      else if (c === 'B') {
        ctx.drawImage(SPR.LETTERBLK, dx, dy);
        // パワーアップ入りは、ときどきキラッと光る
        const what = contents[tx + ',' + ty];
        if (what && what !== 'stamp' && (time + tx * 0.37) % 1.6 < 0.25) {
          ctx.fillStyle = '#fff';
          ctx.fillRect(dx + 12, dy + 1, 1, 5); ctx.fillRect(dx + 10, dy + 3, 5, 1);
        }
      }
      else if (c === 'P') ctx.drawImage(SPR.PARCEL, dx, dy);
      else if (c === 'I') ctx.drawImage(ICE, dx, dy);
      else if (c === 'D') {
        ctx.fillStyle = '#5a5e74'; ctx.fillRect(dx, dy, 16, 16);
        ctx.fillStyle = '#8a8ea8'; ctx.fillRect(dx + 2, dy, 3, 16); ctx.fillRect(dx + 11, dy, 3, 16);
        ctx.fillStyle = '#3a3c50'; ctx.fillRect(dx, dy + 14, 16, 2);
        ctx.fillStyle = '#ffd23c'; ctx.fillRect(dx + 6, dy + 6, 4, 4);
      }
      else if (c === '<' || c === '>') {
        const d = c === '<' ? -1 : 1;
        ctx.fillStyle = '#3a3c50'; ctx.fillRect(dx, dy, 16, 16);
        ctx.fillStyle = '#6a6e88'; ctx.fillRect(dx, dy + 2, 16, 5);
        ctx.fillStyle = '#ffd23c';
        const o = ((Math.floor(time * 24 * d) % 8) + 8) % 8;
        for (let k = -8; k < 16; k += 8) { const ax = dx + k + o; if (ax >= dx && ax <= dx + 12) { ctx.fillRect(ax, dy + 3, 2, 3); ctx.fillRect(ax + d, dy + 4, 2, 1); } }
        ctx.fillStyle = '#9a9eb8'; ctx.fillRect(dx + 3, dy + 10, 3, 3); ctx.fillRect(dx + 10, dy + 10, 3, 3);
      }
      else if (c === 'C') {
        const cr = crumbles[tx + ',' + ty];
        const sh = cr && !cr.gone ? Math.round(Math.sin(time * 70)) : 0;
        ctx.drawImage(CRUMBLE, dx + sh, dy);
      }
      else if (c === 'Q') drawQuicksand(dx, dy, tx);
      else if (c === 'U') ctx.drawImage(USED, dx, dy);
      else if (c === '*') {
        const bob = Math.round(Math.sin(time * 4 + tx) * 1.5);
        ctx.drawImage(SPR.STAMP, dx + 1, dy + 1 + bob);
      } else if (c === 'K') {
        const n = gemSpots[tx + ',' + ty];
        const had = (save.gems[STAGES[stageIndex].id] || [])[n];
        const bob = Math.round(Math.sin(time * 3 + tx) * 2);
        ctx.globalAlpha = had ? 0.45 : 1;
        ctx.fillStyle = 'rgba(158,240,255,.35)'; ctx.beginPath(); ctx.arc(dx + 8, dy + 8 + bob, 8, 0, 7); ctx.fill();
        ctx.drawImage(SPR.GEM, dx + 3, dy + 4 + bob);
        ctx.globalAlpha = 1;
      }
    }
    // ステージより下も土で埋める（画面の下まで）
    for (let tx = x0; tx <= x1; tx++) {
      if (!isSolid(level[ROWS - 1][tx])) continue;
      for (let y = ROWS * TILE - camY; y < viewH; y += TILE) ctx.drawImage(TILES[theme.tiles || 'grass'].mid[(tx + 1) % 3], tx * TILE - cx, y);
    }

    drawCheckpoint(camY);
    // ゴールのポスト
    const pb = postBounce > 0 ? Math.round(Math.sin((1 - postBounce / 0.35) * Math.PI) * 5) : 0;
    if (goal && !(state === 'dialog' && sceneOpt.noPlayer)) ctx.drawImage(SPR.POST, Math.round(goal.x - cx) - 1, Math.round(goal.y - camY) - 3 - pb);
    if (levelDef.lighthouse && goal) drawLighthouse(goal.x + 6 * TILE - cx, 10 * TILE - camY);

    // 動く足場
    for (const m of movers) {
      for (let x = 0; x < m.w; x += 16) ctx.drawImage(PLANK, Math.round(m.x + x - cx), Math.round(m.y - camY));
      ctx.fillStyle = 'rgba(0,0,0,.18)'; ctx.fillRect(Math.round(m.x - cx), Math.round(m.y - camY) + 6, m.w, 2);
    }
    drawTraps(camY, cx);
    drawBoss(camY, cx);
    drawSlams(camY, cx);

    // 敵
    for (const e of enemies) {
      if (!e.active) continue;
      const name = { moyan: 'MOYAN', toge: 'TOGE', pata: 'PATA', hover: 'PATA', mogu: 'MOGU', yuki: 'YUKI', tsurara: 'TSURARA', sakana: 'SAKANA', uni: 'UNI' }[e.kind];
      const img = SPR[name + (e.vx > 0 ? '_L' : '')];
      const ex = Math.round(e.x + e.w / 2 - img.width / 2 - cx);
      let ey = Math.round(e.y + e.h - img.height - camY);
      if (e.kind === 'tsurara') {
        ey = Math.round(e.y - camY) - 1;
        const shake = !e.falling && e.shakeT > 0 ? Math.round(Math.sin(time * 60)) : 0;
        ctx.drawImage(img, ex + shake, ey);
        continue;
      }
      if (e.kind === 'mogu' && !e.dead) {
        // 地面から顔を出す：地面より下はかくす
        const rise = Math.round((1 - (e.up || 0)) * (img.height - 1));
        if (rise >= img.height - 1) {
          // もぐっているときは、土がもこもこ動く
          ctx.fillStyle = 'rgba(120,80,40,.6)';
          ctx.fillRect(ex + 3, Math.round(e.y + e.h - camY) - 2 - (Math.floor(time * 8) % 2), img.width - 6, 2);
          continue;
        }
        ctx.save();
        ctx.beginPath(); ctx.rect(ex - 2, 0, img.width + 4, Math.round(e.y + e.h - camY)); ctx.clip();
        ctx.drawImage(img, ex, ey + rise);
        ctx.restore();
        continue;
      }
      if (e.dead === 'squash') {
        ctx.drawImage(img, ex, ey + img.height - 6, img.width, 6);
      } else if (e.dead === 'fall') {
        ctx.save(); ctx.translate(ex + img.width / 2, ey + img.height / 2); ctx.scale(1, -1);
        ctx.drawImage(img, -img.width / 2, -img.height / 2); ctx.restore();
      } else {
        const bob = (e.kind === 'pata' || e.kind === 'hover' || e.kind === 'sakana' || e.kind === 'uni') ? 0 : Math.floor(time * 6 + e.x) % 2;
        ctx.drawImage(img, ex, ey - bob);
      }
    }

    // 光の玉
    for (const b of balls) {
      const bx = Math.round(b.x + 3 - cx), by = Math.round(b.y + 3 - camY);
      ctx.fillStyle = 'rgba(255,240,150,.4)'; ctx.beginPath(); ctx.arc(bx, by, 6, 0, 7); ctx.fill();
      ctx.fillStyle = '#ffe650'; ctx.beginPath(); ctx.arc(bx, by, 3, 0, 7); ctx.fill();
      ctx.fillStyle = '#fff'; ctx.fillRect(bx - 1, by - 1, 2, 2);
    }

    if (showActors) drawActors(camY, cx);
    finishDraw(camY, cx);
  }

  function drawActors(camY, cx) {
    drawSceneExtras(camY, cx);
    if (sceneOpt.noPlayer && (state === 'dialog')) return;
    // 相棒ポッチ（光）
    const pxs = Math.round(pocchi.x - cx), pys = Math.round(pocchi.y - camY);
    ctx.fillStyle = 'rgba(255,250,200,.35)'; ctx.beginPath(); ctx.arc(pxs + 9, pys + 7, 11, 0, 7); ctx.fill();
    ctx.drawImage(SPR.POCCHI, pxs, pys);

    // 主人公
    drawPlayer(camY);
  }

  // 会話の場面に置く人物・小物（エンディングで使う）
  function drawSceneExtras(camY, cx) {
    if (state !== 'dialog' || !sceneOpt.extras) return;
    for (const ex of sceneOpt.extras) {
      if (ex.showFrom !== undefined && (!dlg || dlg.i < ex.showFrom)) continue;
      ex.a = Math.min(1, (ex.a || 0) + 0.02);
      const img = SPR[ex.img + (ex.flip ? '_L' : '')];
      const x = Math.round(ex.x - cx), y = Math.round(ex.y - camY - img.height + Math.sin(time * (ex.bobSpeed || 0)) * (ex.bob || 0));
      ctx.globalAlpha = ex.showFrom !== undefined ? ex.a : 1;
      if (ex.aura) {
        // 黒い雲のもや
        for (let i = 0; i < 7; i++) {
          ctx.fillStyle = 'rgba(20,10,40,.45)';
          ctx.beginPath(); ctx.arc(x + img.width / 2 + Math.sin(time * 1.3 + i) * 10, y + img.height - 2 + Math.cos(time + i * 2) * 4, 8 + (i % 3) * 3, 0, 7); ctx.fill();
        }
      }
      ctx.drawImage(img, x, y);
      if (ex.glow) { ctx.fillStyle = `rgba(255,220,90,${0.5 + Math.sin(time * 4) * 0.3})`; ctx.fillRect(x + 6, y + 9, 2, 2); ctx.fillRect(x + 12, y + 9, 2, 2); }
      ctx.globalAlpha = 1;
    }
  }

  function finishDraw(camY, cx) {

    // エフェクト
    ctx.textAlign = 'center';
    ctx.font = 'bold 9px "Hiragino Sans", "Noto Sans JP", sans-serif';
    for (const p of particles) {
      const px = Math.round(p.x - cx), py = Math.round(p.y - camY);
      if (p.kind === 'stamp') ctx.drawImage(SPR.STAMP, px, py);
      else if (p.kind === 'dust') {
        ctx.fillStyle = `rgba(236,220,196,${1 - p.t / p.life})`;
        const r = 1 + Math.round(p.t * 10);
        ctx.fillRect(px - r, py - r, r * 2, r * 2);
      } else if (p.kind === 'bubble') {
        ctx.strokeStyle = 'rgba(220,240,255,.8)'; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.arc(px, py, 2, 0, 7); ctx.stroke();
      } else if (p.kind === 'debris') {
        ctx.globalAlpha = 1 - p.t / p.life;
        ctx.fillStyle = '#e88a7a'; ctx.fillRect(px + 1, py, 6, 6); ctx.fillRect(px + 9, py + 3, 5, 5);
        ctx.fillStyle = '#a8505a'; ctx.fillRect(px + 4, py + 7, 4, 4);
        ctx.globalAlpha = 1;
      } else if (p.kind === 'icon') {
        const img = SPR[p.img];
        ctx.globalAlpha = Math.max(0, Math.min(1, (p.life - p.t) * 4)) * (p.lost ? 0.6 : 1);
        const sx = px + Math.round(Math.sin(p.t * 9) * (p.sway || 0) * 0.3) - Math.floor(img.width / 2);
        ctx.drawImage(img, sx, py - img.height);
        ctx.globalAlpha = 1;
      } else if (p.kind === 'text') {
        ctx.globalAlpha = Math.min(1, (p.life - p.t) * 5);
        ctx.lineWidth = 3; ctx.strokeStyle = '#281c34'; ctx.strokeText(p.text, px, py);
        ctx.fillStyle = p.color; ctx.fillText(p.text, px, py);
        ctx.globalAlpha = 1;
      } else if (p.kind === 'letter') {
        if (!p.done) { ctx.fillStyle = '#281c34'; ctx.fillRect(px - 5, py - 4, 10, 8); ctx.fillStyle = '#fff'; ctx.fillRect(px - 4, py - 3, 8, 6); ctx.fillStyle = '#e23034'; ctx.fillRect(px - 1, py - 1, 2, 2); }
      } else if (p.kind === 'fw') {
        ctx.globalAlpha = Math.max(0, 1 - p.t / p.life);
        ctx.fillStyle = p.color; ctx.fillRect(px - 1, py - 1, 3, 3);
        ctx.fillRect(Math.round(px - p.vx * 0.05), Math.round(py - p.vy * 0.05), 2, 2);
        ctx.fillRect(Math.round(px - p.vx * 0.1), Math.round(py - p.vy * 0.1), 1, 1);
        ctx.globalAlpha = 1;
      } else if (p.kind === 'flash') {
        ctx.fillStyle = `rgba(255,255,230,${1 - p.t / p.life})`;
        ctx.beginPath(); ctx.arc(px, py, 10, 0, 7); ctx.fill();
      } else if (p.kind === 'rocket') {
        if (!p.done) { ctx.fillStyle = '#fff4aa'; ctx.fillRect(px, py, 1, 3); ctx.fillStyle = 'rgba(255,244,170,.5)'; ctx.fillRect(px, py + 3, 1, 4); }
      } else { ctx.fillStyle = '#fff4aa'; ctx.fillRect(px, py, 2, 2); }
    }

    if (state === 'miss') {
      ctx.fillStyle = `rgba(16,20,40,${Math.min(0.6, (1.2 - missT) * 0.8)})`;
      ctx.fillRect(0, 0, viewW, viewH);
      ctx.font = 'bold 16px "Hiragino Sans", "Noto Sans JP", sans-serif';
      ctx.lineWidth = 4; ctx.strokeStyle = '#281c34'; ctx.strokeText('ミス！', viewW / 2, viewH / 2 - 10);
      ctx.fillStyle = '#fff'; ctx.fillText('ミス！', viewW / 2, viewH / 2 - 10);
    }
    if (state === 'dialog' && sceneOpt.dark) { ctx.fillStyle = 'rgba(4,2,16,.62)'; ctx.fillRect(0, 0, viewW, viewH); }
    if (state === 'credits') drawCredits(camY, cx);
    if (blackT > 0) { ctx.fillStyle = `rgba(0,0,0,${Math.min(1, blackT)})`; ctx.fillRect(0, 0, viewW, viewH); }
    if (theme.snowfall) drawSnowfall();
    if (theme.water) drawWater();
    if (fadeT > 0) { ctx.fillStyle = `rgba(16,20,40,${fadeT * 1.6})`; ctx.fillRect(0, 0, viewW, viewH); }
    drawIris(camY);
  }

  // ------------------------------------------------------------------ HUD・メニュー
  const stampsEl = document.getElementById('stamps');
  const timeEl = document.getElementById('time');
  const timePill = document.getElementById('time-pill');
  const livesEl = document.getElementById('lives');
  const heartEls = [...document.querySelectorAll('#hearts .heart')];
  const itemCanvas = document.getElementById('item-icons');
  const itemCtx = itemCanvas.getContext('2d');
  const throwBtn = document.getElementById('btn-throw');
  document.getElementById('stamp-icon').getContext('2d').drawImage(SPR.STAMP, 0, 0);
  document.getElementById('clear-stamp-icon').getContext('2d').drawImage(SPR.STAMP, 0, 0);

  const gemCanvas = document.getElementById('gem-icons');
  const gemCtx = gemCanvas.getContext('2d');
  function updateHud() {
    gemCtx.clearRect(0, 0, gemCanvas.width, gemCanvas.height);
    run.gems.forEach((g, i) => {
      gemCtx.globalAlpha = g ? 1 : 0.3;
      gemCtx.drawImage(SPR.GEM, i * 11, 0);
    });
    gemCtx.globalAlpha = 1;
    document.getElementById('gems-pill').hidden = STAGES[stageIndex].boss;
    stampsEl.textContent = '× ' + run.stamps;
    livesEl.textContent = '× ' + run.lives;
    heartEls.forEach((h, i) => h.classList.toggle('empty', i >= run.hearts));
    // 持っているもの（カバン・パワーアップ）
    itemCtx.clearRect(0, 0, itemCanvas.width, itemCanvas.height);
    const icons = [];
    if (run.bag) icons.push('BIGBAG');
    if (run.power) icons.push(ITEM_SPR[run.power]);
    icons.forEach((k, i) => {
      const img = SPR[k];
      itemCtx.drawImage(img, i * 18 + Math.floor((16 - img.width) / 2), Math.floor((16 - img.height) / 2));
    });
    itemCanvas.parentElement.hidden = icons.length === 0;
    itemCanvas.width = Math.max(1, icons.length) * 18 - 2;
    itemCanvas.style.width = itemCanvas.width * 1.5 + 'px';
    icons.forEach((k, i) => {
      const img = SPR[k];
      itemCtx.drawImage(img, i * 18 + Math.floor((16 - img.width) / 2), Math.floor((16 - img.height) / 2));
    });
    throwBtn.hidden = run.power !== 'lantern';
    if (throwBtn.hidden) { touchKeys.throw = false; }
  }

  const pauseMenu = document.getElementById('pause-menu');
  const clearMenu = document.getElementById('clear-menu');
  const overMenu = document.getElementById('over-menu');
  function togglePause(force) {
    if (state !== 'play' && state !== 'pause') return;
    const toPause = force !== undefined ? force : state !== 'pause';
    state = toPause ? 'pause' : 'play';
    pauseMenu.hidden = !toPause;
    SND.pause(toPause);
    for (const k in touchKeys) touchKeys[k] = false;
    syncInput();
  }
  const tap = (id, fn) => document.getElementById(id).addEventListener('click', fn);
  tap('btn-pause', () => togglePause());
  tap('btn-resume', () => togglePause(false));
  const retry = () => { resetRunLivesIfOver(); enterStage(stageIndex); };
  function resetRunLivesIfOver() { if (state === 'over') { run.lives = RULE.lives; run.power = null; run.bag = false; } }
  tap('btn-restart', retry);
  tap('btn-over', retry);
  tap('btn-replay', () => enterStage(stageIndex));
  tap('btn-next', () => enterMap(Math.min(stageIndex + 1, STAGES.length - 1), stageIndex));
  tap('btn-pause-map', () => enterMap(stageIndex));
  tap('btn-over-map', () => { resetRunLivesIfOver(); enterMap(stageIndex); });

  // ------------------------------------------------------------------ タイトル・マップ・会話
  const titleScreen = document.getElementById('title-screen');
  const mapScreen = document.getElementById('map-screen');
  const dialogEl = document.getElementById('dialog');
  const confirmNew = document.getElementById('confirm-new');
  const playBtn = document.getElementById('btn-play');
  const mapNodes = document.getElementById('map-nodes');
  const mapHero = document.getElementById('map-hero');
  const drawFace = (id, img) => {
    const c = document.getElementById(id), g = c.getContext('2d');
    c.width = img.width; c.height = img.height; g.clearRect(0, 0, c.width, c.height); g.drawImage(img, 0, 0);
  };
  drawFace('title-hero', SPR.JUMP);
  drawFace('map-hero', SPR.STAND);

  function showMenuScene(el) {
    for (const sc of [titleScreen, mapScreen, dialogEl, document.getElementById('act-screen'), document.getElementById('credits-screen')]) sc.hidden = sc !== el;
    for (const m of [pauseMenu, clearMenu, overMenu]) m.hidden = true;
    document.body.classList.add('menu');
    document.body.classList.remove('cutscene');
  }

  function enterTitle() {
    sceneOpt = {};
    SND.setTempo(1);
    state = 'title'; showActors = false;
    buildLevel('1-1'); enemies = []; items = []; particles.length = 0; boss = null;
    setSat(1, false);
    showMenuScene(titleScreen);
    confirmNew.hidden = true;
    const can = hasSave();
    document.getElementById('btn-continue').hidden = !can;
    document.getElementById('btn-start').textContent = can ? 'NEW GAME' : 'START';
    document.getElementById('btn-start').classList.toggle('sub', can);
  }

  function startNewGame() {
    save = emptySave(); writeSave();
    resetRun();
    playDialog(PROLOGUE, () => { save.prologue = true; writeSave(); enterStage(0); });
  }
  tap('btn-start', () => { if (hasSave()) confirmNew.hidden = false; else startNewGame(); });
  tap('btn-new-yes', startNewGame);
  tap('btn-new-no', () => { confirmNew.hidden = true; });
  tap('btn-continue', () => { resetRun(); enterMap(save.last || 0); });
  tap('btn-title', enterTitle);
  tap('btn-world-prev', () => { if (WORLDS[mapWorld - 1]) enterMap(firstOfWorld(mapWorld - 1)); });
  tap('btn-world-next', () => {
    const i = firstOfWorld(mapWorld + 1);
    if (i >= 0 && unlocked(i)) enterMap(i);
  });
  tap('btn-play', () => { if (STAGES[mapSel].playable && unlocked(mapSel)) enterStage(mapSel); });

  let mapSel = 0, mapWorld = 1;
  const unlocked = i => i === 0 || !!save.cleared[STAGES[i - 1].id];
  const firstOfWorld = w => STAGES.findIndex(st => st.w === w);
  function enterMap(sel, from) {
    SND.setTempo(1);
    state = 'map'; showActors = false;
    mapWorld = STAGES[sel].w;
    if (from !== undefined && STAGES[from].w !== mapWorld) from = undefined;
    buildLevel(`${mapWorld}-1`); enemies = []; items = []; particles.length = 0; boss = null; movers = [];
    setSat(save.cleared[`${mapWorld}-1`] ? 1 : 0.35, false);
    showMenuScene(mapScreen);
    mapNodes.innerHTML = '';
    document.getElementById('map-world').textContent = 'WORLD ' + mapWorld + (mapWorld >= 6 ? ' ・ 第二幕' : '');
    const prevW = WORLDS[mapWorld - 1], nextW = WORLDS[mapWorld + 1];
    document.getElementById('btn-world-prev').disabled = !prevW;
    document.getElementById('btn-world-next').disabled = !nextW || !unlocked(firstOfWorld(mapWorld + 1));
    STAGES.forEach((st, i) => {
      if (st.w !== mapWorld) return;
      const b = document.createElement('button');
      const open = unlocked(i);
      const cls = ['node'];
      if (st.boss) cls.push('boss');
      if (save.cleared[st.id]) cls.push('cleared');
      else if (!open) cls.push('locked');
      else if (!st.playable) cls.push('soon');
      b.className = cls.join(' ');
      b.id = 'node-' + st.id;
      let info = '';
      const gems = save.gems[st.id] || [];
      if (!open) info = '<span class="info">LOCK</span>';
      else if (st.boss) info = save.cleared[st.id] ? '<span class="info gold">CLEAR</span>' : '<span class="info">BOSS</span>';
      else info = '<span class="info gems">' + [0, 1, 2].map(k => `<i class="${gems[k] ? 'on' : ''}"></i>`).join('') + '</span>';
      b.innerHTML = `<canvas class="icon" width="16" height="16"></canvas><span class="tag">${st.label}</span>${info}`;
      const icon = b.querySelector('canvas');
      const icx = icon.getContext('2d');
      let img = SPR.LETTERBLK;
      if (st.boss) img = SPR[WORLDS[st.w].icon];
      else if (save.cleared[st.id]) img = SPR.POST;
      else if (!open) img = USED;
      icon.width = img.width; icon.height = img.height;
      icx.drawImage(img, 0, 0);
      if (!open) { icon.style.filter = 'grayscale(1) brightness(.8)'; }
      b.addEventListener('click', () => selectNode(i));
      mapNodes.appendChild(b);
    });
    // NEXT で来たときは、前のステージから歩いて移動
    selectNode(from !== undefined ? from : sel, true);
    if (from !== undefined && from !== sel) setTimeout(() => selectNode(sel), 250);
  }

  function selectNode(i, instant) {
    if (!unlocked(i)) return;
    mapSel = i;
    [...mapNodes.children].forEach(n => n.classList.toggle('sel', n.id === 'node-' + STAGES[i].id));
    const node = document.getElementById('node-' + STAGES[i].id);
    const dot = node.querySelector(".icon");
    const track = mapHero.parentElement.getBoundingClientRect(), d = dot.getBoundingClientRect();
    const x = d.left - track.left + d.width / 2 - mapHero.offsetWidth / 2;
    if (instant) { mapHero.style.transition = 'none'; mapHero.style.left = x + 'px'; void mapHero.offsetWidth; mapHero.style.transition = ''; }
    else mapHero.style.left = x + 'px';
    const st = STAGES[i];
    playBtn.disabled = !st.playable;
    playBtn.textContent = st.playable ? 'PLAY ' + st.label : 'COMING SOON';
    document.getElementById('map-title').textContent = st.boss ? WORLDS[st.w].boss : WORLDS[st.w].name;
  }

  // ---- 会話（1場面 2〜5往復）
  const PROLOGUE = [
    { who: 'postman', text: 'あれ？　島の色が消えてる！' },
    { who: 'pocchi', text: 'たすけて！　男爵が灯台の光をうばったの。' },
    { who: 'postman', text: '光がないと、橋がわたれない…。手紙が届けられないよ！' },
    { who: 'pocchi', text: 'かけらを取りもどせば、光がもどるよ。' },
    { who: 'postman', text: 'よし、配達に出発だ！' },
  ];
  const CHAPTER_END = {};
  CHAPTER_END[1] = [
    { who: 'pocchi', text: '見て！　灯台に光がもどったよ！' },
    { who: 'postman', text: 'やった！　草原にも色がもどった！' },
    { who: 'pocchi', text: '次の島への橋もかかったよ。' },
    { who: 'postman', text: 'あと4つ。いっしょにがんばろう！' },
  ];
  CHAPTER_END[2] = [
    { who: 'pocchi', text: '砂の島にも、光がもどったね！' },
    { who: 'postman', text: '遺跡に古い写真があった。灯台と…男爵？' },
    { who: 'pocchi', text: '男爵は、むかし灯台守だったんだって。' },
    { who: 'postman', text: 'どうして光をうばったんだろう…。' },
  ];
  CHAPTER_END[4] = [
    { who: 'pocchi', text: 'サンゴの中に、手紙が1通…これが最後の手紙？' },
    { who: 'postman', text: 'うん。あとは男爵に届けるだけだ。' },
    { who: 'pocchi', text: 'クモリ城へ行こう！' },
  ];
  const PRE_BOSS = {};
  PRE_BOSS[5] = [
    { who: 'baron', text: '灯台を守っても、だれもお礼を言わなかった！' },
    { who: 'postman', text: 'ちがう！　みんな手紙を書いていたんだ。' },
    { who: 'baron', text: 'うそだ！　そんなもの、とどいていない！' },
    { who: 'postman', text: 'だから今、届けに来た！' },
  ];
  PRE_BOSS[7] = [
    { who: 'toki', text: 'わたしは時の番人、トキモリ。' },
    { who: 'toki', text: 'ここに来られるのは、本当の配達員だけだ。' },
    { who: 'postman', text: '手紙を受け取りに来ました！' },
    { who: 'toki', text: 'ならば、その力を見せてみよ！' },
  ];
  CHAPTER_END[5] = [
    { who: 'postman', text: '男爵、お届けものです。' },
    { who: 'baron', text: '…「いつも光をありがとう」…。' },
    { who: 'baron', text: 'わたしは…ずっと、ひとりだと思っていた。' },
    { who: 'pocchi', text: '見て！　全部の灯台が光ってる！' },
    { who: 'postman', text: 'さあ、今日も配達だ！' },
  ];
  const TEASER = [
    { who: 'pocchi', text: 'ポストマン！　あなたあての手紙が来てるよ。' },
    { who: 'postman', text: 'ぼくに？　…差出人が書いてない。' },
    { who: 'postman', text: '「時の灯台で待つ」…？' },
    { who: 'pocchi', text: '時の灯台って、歯車の時計島のずっと先だよ！' },
    { who: 'postman', text: '行ってみよう。新しい配達だ！' },
  ];
  CHAPTER_END[6] = [
    { who: 'pocchi', text: 'この古い帽子…ポストマンと同じマーク！' },
    { who: 'postman', text: 'おじいちゃんの帽子だ。むかし、配達員だったんだ。' },
    { who: 'pocchi', text: 'あの手紙の字、帽子のメモと同じ字だよ。' },
    { who: 'postman', text: '…まさか。時の灯台へ急ごう！' },
  ];
  CHAPTER_END[7] = [
    { who: 'toki', text: '見事だ、2代目ポストマン。あずかっていた手紙をわたそう。' },
    { who: 'letter', text: '「未来のポストマンへ。手紙は、人と人の心をつなぐ光だ。」' },
    { who: 'letter', text: '「おまえなら、きっと届けられる。たのんだぞ。　おじいちゃんより」' },
    { who: 'postman', text: 'おじいちゃん…ちゃんと、届いたよ。' },
    { who: 'pocchi', text: '時の灯台が光ってる！　すべての島がつながったよ！' },
  ];

  // ---- エンディング（7章のあと）：エピローグ → エンドロール → おまけの場面
  // 正体のわからない影（ドット絵をその場で作る）
  SPR.SHADOW = (() => {
    const c = document.createElement('canvas'); c.width = 20; c.height = 30;
    const g = c.getContext('2d');
    g.fillStyle = '#3a3058';
    g.fillRect(6, 0, 8, 2); g.fillRect(4, 2, 12, 4); g.fillRect(3, 6, 14, 6); g.fillRect(2, 12, 16, 10); g.fillRect(1, 22, 18, 8);
    g.fillStyle = '#0c0a14';
    g.fillRect(7, 1, 6, 2); g.fillRect(5, 3, 10, 4); g.fillRect(4, 7, 12, 6); g.fillRect(3, 13, 14, 10); g.fillRect(2, 23, 16, 7);
    g.fillStyle = '#ffd23c'; g.fillRect(7, 9, 2, 1); g.fillRect(11, 9, 2, 1);
    return c;
  })();
  SPR.SHADOW_L = SPR.SHADOW;
  SPR.BLACKLETTER = (() => {
    const c = document.createElement('canvas'); c.width = 12; c.height = 9;
    const g = c.getContext('2d');
    g.fillStyle = '#5a4a78'; g.fillRect(0, 0, 12, 9);
    g.fillStyle = '#141020'; g.fillRect(1, 1, 10, 7);
    g.fillStyle = '#3a3058'; g.fillRect(2, 2, 2, 1); g.fillRect(4, 3, 2, 1); g.fillRect(6, 3, 2, 1); g.fillRect(8, 2, 2, 1);
    g.fillStyle = '#c8202a'; g.fillRect(5, 4, 2, 2);
    return c;
  })();
  SPR.BLACKLETTER_L = SPR.BLACKLETTER;

  const EPILOGUE = [
    { who: 'pocchi', text: 'おじいちゃん、きっと見てるよ。' },
    { who: 'postman', text: 'うん。…さあ、今日も配達だ！' },
  ];
  const POSTCREDIT = [
    { who: 'toki', text: '…あずかっている手紙は、もう一通あったな。' },
    { who: 'unknown', text: '――次は、わたしに届けてもらおうか。ミスターポストマン。' },
  ];
  const CREDITS = [
    ['STAND', 'ミスターポストマン'], ['POCCHI', 'ポッチ'], ['MOYAN', 'モヤン'], ['TOGE', 'トゲボウシ'], ['PATA', 'パタクモ'],
    ['MOGU', 'スナモグラ'], ['YUKI', 'ユキコロ'], ['SAKANA', 'サカナ'], ['UNI', 'ウニ'],
    ['GEKO', '大ガエル ゲコドン'], ['ZARA_HEAD', '砂ムカデ ザラザラ'], ['SNOWMAN', '雪だるま将軍'], ['TAKO', '大ダコ ヌルリン'],
    ['GEARBOT', 'ギアゴーレム'], ['TOKIMORI', '時の番人 トキモリ'], ['BARON', 'クモリ男爵'],
  ];
  const CREDIT_GAP = 2.3, CREDIT_SPEED = 62;
  let creditT = 0, blackT = 0, blackDone = null;
  const creditsEl = document.getElementById('credits-screen');

  function playEnding() {
    if (!window.PREVIEW_ENDING) { save.act2 = true; writeSave(); }
    playDialog(EPILOGUE, startCredits, '1-3', 'ending');
  }
  function startCredits() {
    state = 'credits'; showActors = false; creditT = 0;
    buildLevel('1-1'); enemies = []; items = []; particles.length = 0; boss = null; movers = []; traps = [];
    for (let y = 0; y < ROWS; y++) for (let x = 0; x < LEVEL_W; x++) level[y][x] = y >= 10 ? '#' : '.';
    CHECKPOINT = null; goal = null;
    camX = 0; setSat(1, false);
    showMenuScene(creditsEl);
  }
  // エンドロール：キャラクターが順番に歩いていく。最後は3人で並んで歩く
  const creditName = document.getElementById('credit-name');
  function drawCredits(camY) {
    const gy = Math.round(10 * TILE - camY);
    let bestA = 0, bestName = '';
    ctx.font = '10px "DotGothic16", "Hiragino Sans", sans-serif';
    ctx.textAlign = 'center';
    CREDITS.forEach(([key, name], i) => {
      const t = creditT - 0.8 - i * CREDIT_GAP;
      if (t < 0) return;
      const img = SPR[key + '_L'] || SPR[key];
      const x = Math.round(viewW + 10 - t * CREDIT_SPEED);
      if (x < -img.width - 40) return;
      const hop = Math.floor(t * 6) % 2;
      const run = key === 'STAND' ? SPR[(hop ? 'RUN' : 'STAND') + '_L'] : img;
      const flying = ['POCCHI', 'PATA', 'SAKANA'].includes(key);
      const y = flying ? gy - img.height - 14 + Math.round(Math.sin(t * 4) * 3) : gy - img.height - hop;
      ctx.drawImage(run, x, y);
      // 名前：まん中あたりを通るときに出る（文字は画面の上にくっきり表示）
      const mid = Math.abs(x + img.width / 2 - viewW / 2);
      const a = Math.max(0, 1 - mid / (viewW * 0.35));
      if (a > bestA) { bestA = a; bestName = name; }
    });
    creditName.textContent = bestName;
    creditName.style.opacity = bestA.toFixed(2);
    // さいご：ポストマン・ポッチ・男爵がならんで右へ歩いていく
    // 最後のキャラクターが画面の外へ出てから
    const tEnd = 0.8 + (CREDITS.length - 1) * CREDIT_GAP + (viewW + 50) / CREDIT_SPEED;
    const tf = creditT - tEnd;
    if (tf > 0) {
      const x = Math.round(-30 + Math.min(tf, 4.2) * 46);
      const hop = tf < 4.2 ? Math.floor(tf * 6) % 2 : 0;
      ctx.drawImage(SPR.BARON, x - 26, gy - SPR.BARON.height - hop);
      ctx.drawImage(SPR[hop ? 'RUN' : 'STAND'], x, gy - SPR.STAND.height - hop);
      ctx.drawImage(SPR.POCCHI, x + 18, gy - 40 + Math.round(Math.sin(tf * 4) * 3));
      if (tf > 4.6 && tf < 6.2) {
        // 立ち止まって、手紙をかかげる
        ctx.drawImage(SPR.LETTER_1UP, x + 2, gy - SPR.STAND.height - 14);
        if (Math.floor(tf * 3) % 2 === 0) popJoyAt(x + 8, gy - 40);
      }
    }
    if (tf > 7.4 && !blackDone) startBlack(1.6, startPostCredit);
  }
  let joyCool = 0;
  function popJoyAt(x, y) {
    if (joyCool > 0) return;
    joyCool = 0.35;
    particles.push({ kind: 'icon', img: NOTE_IMGS[Math.floor(Math.random() * 3)], x: x + camX, y: y + (10 * TILE - (viewH - 46)), vy: -36, sway: 6, t: 0, life: 0.9 });
  }
  function startBlack(dur, done) { blackT = 0.001; blackDone = { dur, done }; }
  function startPostCredit() {
    // 夜の時の灯台：トキモリと黒い手紙。2つめのセリフで影があらわれる
    blackT = 0; blackDone = null;
    const g = LEVEL_DEFS['7-3'].goal * TILE;
    playDialog(POSTCREDIT, () => startBlack(2.2, () => { blackT = 0; blackDone = null; enterTitle(); }), '7-3', 'none', {
      noPlayer: true, dark: true,
      extras: [
        { img: 'TOKIMORI', x: g + 5 * TILE, y: 10 * TILE, flip: true },
        { img: 'BLACKLETTER', x: g + 4 * TILE - 4, y: 10 * TILE - 10, bob: 1.5, bobSpeed: 2 },
        { img: 'SHADOW', x: g + 9 * TILE, y: 10 * TILE - 6, showFrom: 1, aura: true, glow: true, bob: 2, bobSpeed: 1.2 },
      ],
    });
    camX = Math.max(0, Math.min(g + 6 * TILE - viewW * 0.5, LEVEL_W * TILE - viewW));
    for (let y = 0; y < ROWS; y++) for (let x = 0; x < LEVEL_W; x++) if (level[y][x] === 'K' || level[y][x] === '*') level[y][x] = '.';
    CHECKPOINT = null;
  }
  tap('btn-credits-skip', () => { if (state === 'credits') { creditT = 999; } });

  // ---- 幕の終わり（第一幕おわり → 予告 → 第二幕へ ／ THE END）
  const actScreen = document.getElementById('act-screen');
  let actDone = null;
  function showAct(title, sub, done) {
    state = 'act'; showActors = false;
    buildLevel('1-1'); enemies = []; items = []; particles.length = 0; boss = null; movers = []; traps = [];
    // 幕の終わりは、すっきりした景色だけ（地面をひとつながりにする）
    for (let y = 0; y < ROWS; y++) for (let x = 0; x < LEVEL_W; x++) level[y][x] = y >= 10 ? '#' : '.';
    CHECKPOINT = null; goal = null;
    setSat(1, false);
    showMenuScene(actScreen);
    document.getElementById('act-title').textContent = title;
    document.getElementById('act-sub').textContent = sub;
    actDone = done;
  }
  tap('btn-act-next', () => { if (actDone) { const d = actDone; actDone = null; d(); } });
  function afterChapter(w, next) {
    if (w === 5) {
      save.act1 = true; writeSave();
      showAct('第一幕　おわり', 'ACT 1 ・ THE END', () =>
        playDialog(TEASER, () => showAct('第二幕へ　つづく', 'TO BE CONTINUED', () => enterMap(next)), '1-1', 'map'));
    } else if (w === 7) {
      playEnding();
    } else enterMap(next);
  }
  CHAPTER_END[3] = [
    { who: 'pocchi', text: 'この郵便ポスト、手紙でいっぱい！' },
    { who: 'postman', text: '全部、男爵あてだ。島のみんなからだよ。' },
    { who: 'pocchi', text: 'でも、ずっと届いてなかったんだね…。' },
    { who: 'postman', text: 'ぼくが届ける。それが仕事だから！' },
  ];
  const WHO = {
    postman: { name: 'ポストマン', face: 'STAND', cls: '' },
    pocchi: { name: 'ポッチ', face: 'POCCHI', cls: 'pocchi' },
    baron: { name: 'クモリ男爵', face: 'BARON', cls: 'baron' },
    toki: { name: 'トキモリ', face: 'TOKIMORI', cls: 'toki' },
    letter: { name: '手紙', face: 'LETTER_1UP', cls: 'letter' },
    unknown: { name: '？？？', face: 'SHADOW', cls: 'unknown' },
  };
  let dlg = null;
  const dlgName = document.getElementById('dialog-name');
  const dlgText = document.getElementById('dialog-text');
  let sceneOpt = {};        // 会話の場面のオプション（主人公をかくす・暗くする・人物を置く）
  function playDialog(lines, done, sceneId, music, opt = {}) {
    sceneOpt = opt;
    const atLighthouse = !!sceneId;
    state = 'dialog'; showActors = false;
    SND.setTempo(1);
    buildLevel(sceneId || '1-1'); enemies = []; items = []; particles.length = 0; bigGem = null;
    if (!(sceneId && sceneId.endsWith('B'))) boss = null;     // ボスの前の会話ではボスも見せる
    run.checkpoint = false; placePlayer(); showActors = true;
    if (atLighthouse && goal) {
      // 1-3 のゴールの先、光がもどった灯台の前で話す
      player.x = goal.x + 2 * TILE; player.y = 10 * TILE - player.h;
      camX = Math.max(0, Math.min(player.x - viewW * 0.35, LEVEL_W * TILE - viewW));
      pocchi.x = player.x + 20; pocchi.y = player.y - 20;
    }
    setSat(atLighthouse ? 1 : 0, false);       // プロローグは色が消えた世界
    showMenuScene(dialogEl);
    if (music === 'none') SND.stop();
    dlg = { lines, i: -1, done, shown: 0, full: true, music: music === 'none' ? null : (music || (atLighthouse ? 'warm' : 'sad')) };
    nextLine();
  }
  function nextLine() {
    if (!dlg) return;
    if (!dlg.full) { dlg.shown = dlg.lines[dlg.i].text.length; dlg.full = true; dlgText.textContent = dlg.lines[dlg.i].text; return; }
    dlg.i++;
    if (dlg.i >= dlg.lines.length) { const d = dlg.done; dlg = null; d(); return; }
    const line = dlg.lines[dlg.i], w = WHO[line.who];
    dlgName.textContent = w.name; dlgName.className = 'dialog-name ' + w.cls;
    drawFace('dialog-face', SPR[w.face]);
    dlg.shown = 0; dlg.full = false; dlg.acc = 0; dlgText.textContent = '';
  }
  function updateDialog(dt) {
    if (!dlg || dlg.full) return;
    dlg.acc += dt;
    const text = dlg.lines[dlg.i].text;
    const n = Math.min(text.length, Math.floor(dlg.acc / 0.045));
    if (n !== dlg.shown) { dlg.shown = n; dlgText.textContent = text.slice(0, n); if (n % 2 === 0) sfx.blip(); }
    if (n >= text.length) dlg.full = true;
  }
  document.getElementById('dialog-box').addEventListener('click', nextLine);
  tap('btn-skip', () => { if (dlg) { const d = dlg.done; dlg = null; d(); } });
  // アプリを切りかえたら自動で一時停止
  document.addEventListener('visibilitychange', () => { if (document.hidden && state === 'play') togglePause(true); });

  // ------------------------------------------------------------------ BGM えらび
  const THEME_SONG = { meadow: 'meadow', forest: 'forest', sunset: 'sunset', storm: 'boss' };
  function updateMusic() {
    let want = null;
    if (state === 'title') want = 'title';
    else if (state === 'map') want = 'map';
    else if (state === 'dialog') want = dlg ? dlg.music : null;
    else if (state === 'act' || state === 'credits') want = 'ending';
    else if (state === 'play' || state === 'pause') {
      if (boss && boss.dead) return;
      want = run.invT > 0 ? 'invincible' : theme.song;
    } else return;      // ミス・ゴール・ゲームオーバー中は、その場の音にまかせる
    if (want && SND.current !== want) SND.play(want);
  }
  // 画面のボタンを押した音
  document.addEventListener('click', e => { if (e.target.closest('.scene button, .panel button')) sfx.select(); });
  // 音のON/OFF
  function refreshSoundButtons() {
    for (const id of ['btn-sound', 'btn-sound-title']) {
      const b = document.getElementById(id);
      if (!b) continue;
      b.classList.toggle('off', !SND.enabled);
      b.setAttribute('aria-label', SND.enabled ? '音を消す' : '音を出す');
      if (id === 'btn-sound-title') b.textContent = SND.enabled ? 'SOUND ON' : 'SOUND OFF';
    }
  }
  for (const id of ['btn-sound', 'btn-sound-title']) {
    document.getElementById(id).addEventListener('click', () => { SND.setEnabled(!SND.enabled); refreshSoundButtons(); });
  }
  refreshSoundButtons();

  // ------------------------------------------------------------------ ループ
  let last = performance.now(), acc = 0;
  function frame(now) {
    const dt = Math.min(0.1, (now - last) / 1000); last = now;
    if (state === 'play' || state === 'miss' || state === 'goal') {
      acc += dt;
      while (acc >= STEP) { update(STEP); acc -= STEP; }
      time += dt;
    } else {
      acc = 0;
      if (blackDone) {
        blackT += dt / blackDone.dur;
        if (blackT >= 1.05) { const d = blackDone.done; blackDone = null; d(); }
      }
      if (joyCool > 0) joyCool -= dt;
      if (state === 'credits') {
        creditT += dt; time += dt;
        camX += 14 * dt;
        updateParticles(dt);
        if (creditT > 900 && !blackDone) { creditT = 0.8 + (CREDITS.length - 1) * CREDIT_GAP + (viewW + 50) / CREDIT_SPEED + 7.5; }
      } else if (state === 'title' || state === 'map' || state === 'act') {
        // 背景の世界をゆっくり流す
        camX = (camX + 18 * dt) % Math.max(1, LEVEL_W * TILE - viewW - 20);
        time += dt;
      } else if (state === 'dialog') {
        updateDialog(dt); time += dt;
        pocchi.t += dt;
        pocchi.x = lerp(pocchi.x, player.x + 22, Math.min(1, dt * 3));
        pocchi.y = lerp(pocchi.y, player.y - 14 + Math.sin(pocchi.t * 3) * 3, Math.min(1, dt * 3));
      }
    }
    updateMusic();
    draw();
    requestAnimationFrame(frame);
  }

  addEventListener('resize', resize);
  resize();
  loadSave();
  resetRun();
  if (window.PREVIEW_ENDING) {
    // 試写用：エンディングだけを見る（セーブは書きかえない）
    for (const w of [1, 2, 3, 4, 5, 6, 7]) save.chapters[w] = true;
    writeSave = () => {};
    stageIndex = STAGES.findIndex(st => st.id === '7-B');
    enterTitle();
    const st = document.getElementById('btn-start'), cont = document.getElementById('btn-continue');
    cont.hidden = true; st.classList.remove('sub'); st.textContent = 'エンディングを見る';
    const fresh = st.cloneNode(true); st.replaceWith(fresh);
    fresh.addEventListener('click', () => playDialog(CHAPTER_END[7], playEnding, '7-3', 'ending'));
  } else enterTitle();
  requestAnimationFrame(frame);

  // テスト用（ブラウザの開発ツールから状態を見られる）
  window.__game = {
    player, run, keys: keyKeys, sync: syncInput, collect, damage,
    get level() { return level; }, get enemies() { return enemies; }, get items() { return items; },
    get balls() { return balls; }, get state() { return state; }, get stamps() { return run.stamps; },
    get save() { return save; }, get levelDef() { return levelDef; }, get movers() { return movers; }, get traps() { return traps; }, get trapClock() { return trapClock; }, enterStage, enterMap, enterTitle, get boss() { return boss; }, get bigGem() { return bigGem; },
  };
})();
