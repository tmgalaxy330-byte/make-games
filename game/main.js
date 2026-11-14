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
  let boss = null;
  let goal = null;
  let START = { x: 3 * TILE, y: 10 * TILE };
  let CHECKPOINT = null;
  let theme = null;

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
      enemy: (kind, x, row = 10) => enemies.push({
        kind, x: x * TILE + 2, y: row * TILE - 14, baseY: row * TILE - 14, w: 12, h: kind === 'pata' ? 10 : 14,
        vx: kind === 'pata' ? -18 : -22, vy: 0, active: false, dead: null, deadT: 0, onGround: false, t: x,
      }),
      // 左右に動く板：x0（左はし）, row, 幅（マス）, 動く幅（マス）, 速さ
      mover: (x0, row, wTiles, range, speed) => movers.push({
        x: x0 * TILE, y: row * TILE, w: wTiles * TILE, h: 6, x0: x0 * TILE, range: range * TILE, speed, t: 0, dx: 0,
      }),
      wallEnd: () => { for (let y = 0; y < 10; y++) set(LEVEL_W - 1, y, '#'); },
    };
  }

  const THEMES = {
    meadow: { sky: [[92, 150, 250], [196, 228, 255]], mtn: ['#96baec', '#70a6ce'], hill: ['#54ac60', '#8cd678'] },
    forest: { sky: [[78, 136, 214], [168, 214, 236]], mtn: ['#7fb0c8', '#4f8f7e'], hill: ['#2f7f4a', '#5ab86a'], trees: true },
    sunset: { sky: [[236, 128, 124], [255, 214, 150]], mtn: ['#c48aa8', '#9a6a94'], hill: ['#5a9a5a', '#8cc878'], lighthouse: true },
    storm: { sky: [[64, 56, 104], [146, 128, 168]], mtn: ['#5a5280', '#463e6a'], hill: ['#3e5a4a', '#5a7a62'], noSun: true },
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
    '1-3': { w: 170, theme: 'sunset', checkpoint: 66, goal: 156, build(B) {
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
      boss = {
        x: 20 * TILE, y: 10 * TILE - 24, w: 26, h: 24, vx: 0, vy: 0, hp: 3, maxHp: 3,
        mode: 'idle', t: 0, hurtT: 0, face: -1, onGround: true, dead: false, deadT: 0, squash: 0,
      };
    } },
  };

  function buildLevel(idOverride) {
    const id = idOverride || STAGES[stageIndex].id;
    const def = LEVEL_DEFS[id];
    LEVEL_W = def.w;
    level.length = 0;
    for (const k in contents) delete contents[k];
    for (const k in parcelHits) delete parcelHits[k];
    for (const k in gemSpots) delete gemSpots[k];
    enemies = []; movers = []; boss = null; shockwaves = []; bigGem = null;
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
  const STAGES = [
    { id: '1-1', label: '1-1', playable: true },
    { id: '1-2', label: '1-2', playable: true },
    { id: '1-3', label: '1-3', playable: true },
    { id: '1-B', label: 'BOSS', playable: true, boss: true },
  ];
  let stageIndex = 0;

  // ------------------------------------------------------------------ セーブ（この端末のブラウザに保存）
  const SAVE_KEY = 'mister-postman-save-v1';
  const emptySave = () => ({ cleared: {}, best: {}, gems: {}, last: 0, prologue: false, chapter1: false });
  let save = emptySave();
  function loadSave() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (raw) save = Object.assign(emptySave(), JSON.parse(raw));
    } catch (e) { save = emptySave(); }
  }
  function writeSave() {
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); } catch (e) { /* 保存できない環境でも遊べる */ }
  }
  const hasSave = () => save.prologue || Object.keys(save.cleared).length > 0;

  // 色をうばわれた世界：クリアするまで色がうすい
  function setSat(v, animate) {
    canvas.style.transition = animate ? 'filter 1.4s ease-out' : 'none';
    canvas.style.filter = `saturate(${v})`;
  }

  const isSolid = c => c === '#' || c === 'B' || c === 'P' || c === 'U';
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
  function makeGroundTile(top, seed) {
    const c = document.createElement('canvas'); c.width = 16; c.height = 16;
    const g = c.getContext('2d');
    let s = seed;
    const rnd = () => (s = (s * 9301 + 49297) % 233280) / 233280;
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
      const t = y / 15;
      let col = [lerp(196, 140, t), lerp(124, 80, t), lerp(64, 42, t)];
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
        g.fillStyle = '#46aa3c'; g.fillRect(x, 0, 1, h);
        g.fillStyle = '#6ed246'; g.fillRect(x, 0, 1, 2);
        g.fillStyle = '#aaf06e'; g.fillRect(x, 0, 1, 1);
        g.fillStyle = '#287832'; g.fillRect(x, h, 1, x % 4 === 1 ? 2 : 1);
      }
    }
    return c;
  }
  const GTOP = [makeGroundTile(true, 11), makeGroundTile(true, 23), makeGroundTile(true, 37)];
  const GMID = [makeGroundTile(false, 5), makeGroundTile(false, 17), makeGroundTile(false, 29)];
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
  };
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
    stageIndex = i;
    run.stamps = 0; run.checkpoint = false; run.gems = [false, false, false];
    run.hearts = RULE.hearts; run.invT = 0; run.hurtT = 0;
    setDash(false);
    document.getElementById('world-label').textContent = STAGES[i].label;
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
    for (const sc of [titleScreen, mapScreen, dialogEl]) sc.hidden = true;
    document.body.classList.remove('cutscene', 'menu');
    setSat(save.cleared[STAGES[stageIndex].id] ? 1 : 0.35, false);
    updateHud();
  }

  // ------------------------------------------------------------------ ダメージ・ミス
  function damage() {
    if (run.invT > 0 || run.hurtT > 0 || state !== 'play') return;
    // なくなる順番：カバン → パワーアップ → ハート
    if (run.bag) { run.bag = false; popText('カバンがやぶれた！'); sfx.bagRip(); }
    else if (run.power) { popText(NAMES[run.power] + 'をなくした'); run.power = null; }
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
      if (run.stamps % RULE.stampsFor1up === 0) { run.lives++; popText('1UP！', '#7dff8a'); sfx.oneup(); }
    }
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      particles.push({ kind: 'spark', x: x + 6, y: y + 6, vx: Math.cos(a) * 50, vy: Math.sin(a) * 50, t: 0, life: 0.3 });
    }
    updateHud();
  }

  function popText(text, color = '#fff') {
    particles.push({ kind: 'text', text, color, x: player.x + player.w / 2, y: player.y - 6, t: 0, life: 1.2 });
  }

  function collect(kind) {
    const x = player.x, y = player.y;
    if (POWERS.includes(kind)) {
      if (run.power === kind) { addStamps(RULE.dupStamps, x, y); popText('切手 +' + RULE.dupStamps, '#ffec96'); }
      else { run.power = kind; popText(NAMES[kind] + '！', '#ffec96'); sfx.power(); }
    } else if (kind === 'bag') {
      if (run.bag) { addStamps(RULE.dupStamps, x, y); popText('切手 +' + RULE.dupStamps, '#ffec96'); }
      else { run.bag = true; popText('大きな配達カバン！', '#ffec96'); sfx.power(); }
    } else if (kind === 'onigiri') {
      if (run.hearts < RULE.hearts) { run.hearts++; popText('ハート回復！', '#ff9aa0'); sfx.heal(); }
      else { addStamps(RULE.dupStamps, x, y); popText('切手 +' + RULE.dupStamps, '#ffec96'); }
    } else if (kind === 'scarf') {
      run.invT = RULE.invincible; popText('むてき！', '#fff4aa'); sfx.power();
    } else if (kind === 'oneup') {
      run.lives++; popText('1UP！', '#7dff8a'); sfx.oneup();
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
      if (e.kind === 'pata') {
        // パタクモ：ゆっくり左右に進みながら、ふわふわ上下する
        e.t += dt;
        e.x += e.vx * dt;
        e.y = e.baseY + Math.sin(e.t * 2.2) * 18;
        const ahead = e.vx > 0 ? Math.floor((e.x + e.w) / TILE) : Math.floor(e.x / TILE);
        if (isSolid(tileAt(ahead, Math.floor((e.y + 5) / TILE)))) e.vx = -e.vx;
      } else if (moveBody(e, dt)) e.vx = -e.vx;
      // 足場のはしで引き返す（小学生でも読みやすい動き）
      if (e.kind !== 'pata' && e.onGround) {
        const fx = e.vx > 0 ? Math.floor((e.x + e.w + 1) / TILE) : Math.floor((e.x - 1) / TILE);
        const fy = Math.floor((e.y + e.h + 1) / TILE);
        const c = tileAt(fx, fy);
        if (!isSolid(c) && c !== '=') e.vx = -e.vx;
      }
      if (e.y > ROWS * TILE + 40) { e.dead = 'gone'; continue; }

      // 主人公とのふれあい
      if (state !== 'play' || !overlap(player, e)) continue;
      if (run.invT > 0) { killEnemy(e, 'fall'); continue; }
      const fromAbove = player.vy > 0 && player.prevBottom <= e.y + 6;
      if ((e.kind === 'moyan' || e.kind === 'pata') && fromAbove) {
        killEnemy(e, 'squash'); sfx.stomp();
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
    if (player.vx > 0) {
      const tx = Math.floor((player.x + player.w) / TILE);
      for (let ty = top; ty <= bot; ty++) if (isSolid(tileAt(tx, ty))) { player.x = tx * TILE - player.w; player.vx = 0; return; }
    } else if (player.vx < 0) {
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
    let top = input.dash ? PHYS.dash : PHYS.run;
    if (run.invT > 0) top *= 1.1;                       // むてき中は少し速い
    let accel = player.onGround ? (dir ? PHYS.accel : PHYS.decel) : PHYS.air;
    // ダッシュをやめたときは、少しずつ歩く速さにもどす（急ブレーキにしない）
    if (dir && Math.abs(player.vx) > top && Math.sign(player.vx) === dir) accel = 260;
    // 空中ブレーキ：空中で進む向きと反対を押すと強く減速できる（着地を合わせやすく）
    if (!player.onGround && dir && player.vx && Math.sign(player.vx) === -dir) accel = PHYS.airBrake;
    player.vx = approach(player.vx, dir * top, accel * dt);

    // ---- ジャンプ（先行入力・コヨーテタイム）
    const jumpPressed = input.jump && !jumpPrev;
    jumpPrev = input.jump;
    player.buffer = jumpPressed ? PHYS.buffer : Math.max(0, player.buffer - dt);
    player.coyote = player.onGround ? PHYS.coyote : Math.max(0, player.coyote - dt);
    if (player.onGround) player.usedDouble = false;
    if (player.buffer > 0 && player.coyote > 0) {
      // 速く走っているほど高く跳べる（歩きの速さ以下は通常ジャンプ）
      const k = Math.max(0, Math.min(1, (Math.abs(player.vx) - PHYS.run) / (PHYS.dash - PHYS.run)));
      player.vy = -lerp(PHYS.jump, PHYS.dashJump, k); player.buffer = 0; player.coyote = 0;
      sfx.jump();
      player.onGround = false; player.jumping = true;
    } else if (jumpPressed && !player.onGround && run.power === 'boots' && !player.usedDouble) {
      // バネぐつ：空中でもう1回ジャンプ
      player.vy = -PHYS.doubleJump; player.usedDouble = true; player.jumping = true; player.buffer = 0;
      sfx.jump2();
      for (let i = 0; i < 6; i++) {
        particles.push({ kind: 'dust', x: player.x + player.w / 2 + (i - 2.5) * 3, y: player.y + player.h, vx: (i - 2.5) * 12, vy: 20, t: 0, life: 0.3 });
      }
    }
    if (player.vy >= 0) player.jumping = false;

    // ---- 重力（押している長さで高さが変わる）
    const g = (player.vy < 0 && input.jump && player.jumping) ? PHYS.gUp : PHYS.gDown;
    player.gliding = run.power === 'plane' && !player.onGround && player.vy > 0 && input.jump;
    const maxFall = player.gliding ? PHYS.glideFall : PHYS.maxFall;
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
      const nx = m.x0 + (Math.sin(m.t * m.speed - Math.PI / 2) + 1) / 2 * m.range;
      m.dx = nx - m.x; m.x = nx;
      if (player.onMover === m) player.x += m.dx;
    }
    player.onMover = null;

    // ---- 移動と当たり判定
    player.x += player.vx * dt; collideX();
    const prevTop = player.y;
    player.prevBottom = player.y + player.h;
    player.y += player.vy * dt; collideY(prevTop, player.prevBottom);
    if (player.vy >= 0) {
      for (const m of movers) {
        if (player.x + player.w > m.x && player.x < m.x + m.w &&
            player.prevBottom <= m.y + 1 && player.y + player.h >= m.y) {
          player.y = m.y - player.h; player.vy = 0; player.onGround = true; player.onMover = m;
        }
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
        popText('ヒカリのかけら！', '#9ef0ff'); sfx.gem();
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
    if (CHECKPOINT && !run.checkpoint && player.x > CHECKPOINT.x) { run.checkpoint = true; popText('中間ポスト！', '#ffec96'); sfx.check(); }

    // ---- ゴール
    if (goal && player.x + player.w > goal.x + 2 && player.x < goal.x + goal.w - 2 && player.y + player.h > goal.y) {
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
        if (!e.dead && e.active && overlap(b, e)) { killEnemy(e, 'fall'); b.done = true; break; }
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
      const firstTime = !save.chapter1;
      save.chapter1 = true; writeSave();
      if (firstTime) playDialog(CHAPTER1_END, () => enterMap(3), true);
      else enterMap(stageIndex);
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
    updateBoss(dt);
    updateItems(dt);
    updateBalls(dt);

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
      else if (p.kind === 'text') { p.y -= 18 * dt; }
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
    const sy = Math.round(player.y + player.h - base.height + 1 - camY) - 12;
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
    const lit = save.chapter1;
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
  function updateBoss(dt) {
    if (!boss) { updateBigGem(dt); return; }
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
    if (wasAir && b.onGround && b.t > 0.1) {
      b.mode = 'idle'; b.t = 0; b.vx = 0; shake = 0.3; sfx.thud();
      for (const dir of [-1, 1]) {
        shockwaves.push({ x: b.x + b.w / 2, dir, speed: 120 + speedUp * 60, t: 0, y: b.y + b.h });
      }
    }
    if (b.onGround && b.mode !== 'air') b.vx = 0;

    // 主人公とのふれあい
    if (state === 'play' && overlap(player, b)) {
      const fromAbove = player.vy > 0 && player.prevBottom <= b.y + 10;
      if (fromAbove) {
        if (b.hurtT <= 0) hitBoss(1, true);
        else { player.vy = -200; player.y = b.y - player.h; }       // ダメージ直後は、はね返るだけ
      } else if (run.invT > 0) { if (b.hurtT <= 0) hitBoss(1, false); }
      else damage();
    }
    // 光の玉
    for (const ball of balls) {
      if (!ball.done && overlap(ball, b) && b.hurtT <= 0) { ball.done = true; hitBoss(1 / 3, false); }
    }
    // 地面のゆれ
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
    b.hurtT = stomped ? 1.0 : 0.25;
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
      b.dead = true; b.deadT = 0; b.vy = -200; shockwaves = [];
      SND.stop(); sfx.bossDown();
      popText('やった！', '#ffec96');
    }
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
      ctx.fillStyle = 'rgba(255,236,150,.9)';
      ctx.fillRect(x - 3, y - 6, 6, 6);
      ctx.fillStyle = 'rgba(200,140,60,.9)';
      ctx.fillRect(x - 5, y - 3, 10, 3);
    }
    if (bigGem && !bigGem.taken) {
      const gx = Math.round(bigGem.x - cx), gy = Math.round(bigGem.y - camY + Math.sin(time * 3) * 2);
      ctx.fillStyle = 'rgba(158,240,255,.35)'; ctx.beginPath(); ctx.arc(gx + 6, gy + 6, 14, 0, 7); ctx.fill();
      ctx.drawImage(SPR.BIGGEM, gx, gy);
    }
    const b = boss;
    if (!b) return;
    if (b.hurtT > 0 && Math.floor(time * 20) % 2 === 0 && !b.dead) return;
    const img = SPR['GEKO' + (b.face > 0 ? '_L' : '')];
    const sq = b.squash * 0.25, st = b.mode === 'air' ? 0.12 : 0;
    const w = Math.round(img.width * (1 + sq - st)), h = Math.round(img.height * (1 - sq + st));
    const x = Math.round(b.x + b.w / 2 - w / 2 - cx), y = Math.round(b.y + b.h - h - camY);
    if (b.dead) {
      ctx.save(); ctx.translate(x + w / 2, y + h / 2); ctx.scale(1, -1); ctx.drawImage(img, -w / 2, -h / 2, w, h); ctx.restore();
    } else ctx.drawImage(img, x, y, w, h);
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
      const sy = theme.lighthouse ? viewH - 90 : 44;      // 夕日は低い位置
      ctx.fillStyle = 'rgba(255,246,200,.25)'; ctx.beginPath(); ctx.arc(viewW - 60, sy, 24, 0, 7); ctx.fill();
      ctx.fillStyle = 'rgba(255,246,200,.4)'; ctx.beginPath(); ctx.arc(viewW - 60, sy, 16, 0, 7); ctx.fill();
      ctx.fillStyle = theme.lighthouse ? '#fff0b0' : '#fff6c8'; ctx.beginPath(); ctx.arc(viewW - 60, sy, 10, 0, 7); ctx.fill();
    }

    // 雲（とても遠い）
    for (const [x, y, img] of CLOUDS) {
      const sx = ((x - cx * 0.08) % 560 + 560) % 560 - 60;
      ctx.drawImage(img, Math.round(sx), y - camY * 0.1);
    }
    // 山（奥ほどゆっくり動く）
    const groundY = 10 * TILE - camY;
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
        ctx.drawImage(above === '#' ? GMID[tx % 3] : GTOP[tx % 3], dx, dy);
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
      if (level[ROWS - 1][tx] !== '#') continue;
      for (let y = ROWS * TILE - camY; y < viewH; y += TILE) ctx.drawImage(GMID[(tx + 1) % 3], tx * TILE - cx, y);
    }

    drawCheckpoint(camY);
    // ゴールのポスト
    const pb = postBounce > 0 ? Math.round(Math.sin((1 - postBounce / 0.35) * Math.PI) * 5) : 0;
    if (goal) ctx.drawImage(SPR.POST, Math.round(goal.x - cx) - 1, Math.round(goal.y - camY) - 3 - pb);
    if (theme.lighthouse && goal) drawLighthouse(goal.x + 6 * TILE - cx, 10 * TILE - camY);

    // 動く足場
    for (const m of movers) {
      for (let x = 0; x < m.w; x += 16) ctx.drawImage(PLANK, Math.round(m.x + x - cx), Math.round(m.y - camY));
      ctx.fillStyle = 'rgba(0,0,0,.18)'; ctx.fillRect(Math.round(m.x - cx), Math.round(m.y - camY) + 6, m.w, 2);
    }
    drawBoss(camY, cx);

    // 敵
    for (const e of enemies) {
      if (!e.active) continue;
      const img = SPR[({ moyan: 'MOYAN', toge: 'TOGE', pata: 'PATA' })[e.kind] + (e.vx > 0 ? '_L' : '')];
      const ex = Math.round(e.x + e.w / 2 - img.width / 2 - cx);
      const ey = Math.round(e.y + e.h - img.height - camY);
      if (e.dead === 'squash') {
        ctx.drawImage(img, ex, ey + img.height - 6, img.width, 6);
      } else if (e.dead === 'fall') {
        ctx.save(); ctx.translate(ex + img.width / 2, ey + img.height / 2); ctx.scale(1, -1);
        ctx.drawImage(img, -img.width / 2, -img.height / 2); ctx.restore();
      } else {
        const bob = e.kind === 'pata' ? 0 : Math.floor(time * 6 + e.x) % 2;
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
    // 相棒ポッチ（光）
    const pxs = Math.round(pocchi.x - cx), pys = Math.round(pocchi.y - camY);
    ctx.fillStyle = 'rgba(255,250,200,.35)'; ctx.beginPath(); ctx.arc(pxs + 9, pys + 7, 11, 0, 7); ctx.fill();
    ctx.drawImage(SPR.POCCHI, pxs, pys);

    // 主人公
    drawPlayer(camY);
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
      } else if (p.kind === 'text') {
        ctx.globalAlpha = Math.min(1, (p.life - p.t) * 3);
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
    if (fadeT > 0) { ctx.fillStyle = `rgba(16,20,40,${fadeT * 1.6})`; ctx.fillRect(0, 0, viewW, viewH); }
    drawIris(camY);
  }

  // ------------------------------------------------------------------ HUD・メニュー
  const stampsEl = document.getElementById('stamps');
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
    for (const sc of [titleScreen, mapScreen, dialogEl]) sc.hidden = sc !== el;
    for (const m of [pauseMenu, clearMenu, overMenu]) m.hidden = true;
    document.body.classList.add('menu');
    document.body.classList.remove('cutscene');
  }

  function enterTitle() {
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
  tap('btn-play', () => { if (STAGES[mapSel].playable && unlocked(mapSel)) enterStage(mapSel); });

  let mapSel = 0;
  const unlocked = i => i === 0 || !!save.cleared[STAGES[i - 1].id];
  function enterMap(sel, from) {
    state = 'map'; showActors = false;
    buildLevel('1-1'); enemies = []; items = []; particles.length = 0; boss = null;
    setSat(save.cleared[STAGES[0].id] ? 1 : 0.35, false);
    showMenuScene(mapScreen);
    mapNodes.innerHTML = '';
    STAGES.forEach((st, i) => {
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
      if (st.boss) img = SPR.GEKO;
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
    [...mapNodes.children].forEach((n, k) => n.classList.toggle('sel', k === i));
    const node = mapNodes.children[i];
    const dot = node.querySelector(".icon");
    const track = mapHero.parentElement.getBoundingClientRect(), d = dot.getBoundingClientRect();
    const x = d.left - track.left + d.width / 2 - mapHero.offsetWidth / 2;
    if (instant) { mapHero.style.transition = 'none'; mapHero.style.left = x + 'px'; void mapHero.offsetWidth; mapHero.style.transition = ''; }
    else mapHero.style.left = x + 'px';
    const st = STAGES[i];
    playBtn.disabled = !st.playable;
    playBtn.textContent = st.playable ? 'PLAY ' + st.label : 'COMING SOON';
    document.getElementById('map-title').textContent = st.boss ? '大ガエル ゲコドン' : 'はじまりの草原島';
  }

  // ---- 会話（1場面 2〜5往復）
  const PROLOGUE = [
    { who: 'postman', text: 'あれ？　島の色が消えてる！' },
    { who: 'pocchi', text: 'たすけて！　男爵が灯台の光をうばったの。' },
    { who: 'postman', text: '光がないと、橋がわたれない…。手紙が届けられないよ！' },
    { who: 'pocchi', text: 'かけらを取りもどせば、光がもどるよ。' },
    { who: 'postman', text: 'よし、配達に出発だ！' },
  ];
  const CHAPTER1_END = [
    { who: 'pocchi', text: '見て！　灯台に光がもどったよ！' },
    { who: 'postman', text: 'やった！　草原にも色がもどった！' },
    { who: 'pocchi', text: '次の島への橋もかかったよ。' },
    { who: 'postman', text: 'あと4つ。いっしょにがんばろう！' },
  ];
  const WHO = {
    postman: { name: 'ポストマン', face: 'STAND', cls: '' },
    pocchi: { name: 'ポッチ', face: 'POCCHI', cls: 'pocchi' },
  };
  let dlg = null;
  const dlgName = document.getElementById('dialog-name');
  const dlgText = document.getElementById('dialog-text');
  function playDialog(lines, done, atLighthouse) {
    state = 'dialog'; showActors = false;
    buildLevel(atLighthouse ? '1-3' : '1-1'); enemies = []; items = []; particles.length = 0; boss = null; bigGem = null;
    run.checkpoint = false; placePlayer(); showActors = true;
    if (atLighthouse) {
      // 1-3 のゴールの先、光がもどった灯台の前で話す
      player.x = goal.x + 2 * TILE; player.y = 10 * TILE - player.h;
      camX = Math.max(0, Math.min(player.x - viewW * 0.35, LEVEL_W * TILE - viewW));
      pocchi.x = player.x + 20; pocchi.y = player.y - 20;
    }
    setSat(atLighthouse ? 1 : 0, false);       // プロローグは色が消えた世界
    showMenuScene(dialogEl);
    dlg = { lines, i: -1, done, shown: 0, full: true, music: atLighthouse ? 'warm' : 'sad' };
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
    else if (state === 'play' || state === 'pause') {
      if (boss && boss.dead) return;
      want = run.invT > 0 ? 'invincible' : THEME_SONG[Object.keys(THEMES).find(k => THEMES[k] === theme)];
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
      if (state === 'title' || state === 'map') {
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
  enterTitle();
  requestAnimationFrame(frame);

  // テスト用（ブラウザの開発ツールから状態を見られる）
  window.__game = {
    player, run, keys: keyKeys, sync: syncInput, collect, damage,
    get level() { return level; }, get enemies() { return enemies; }, get items() { return items; },
    get balls() { return balls; }, get state() { return state; }, get stamps() { return run.stamps; },
    get save() { return save; }, enterStage, enterMap, enterTitle, get boss() { return boss; }, get bigGem() { return bigGem; },
  };
})();
