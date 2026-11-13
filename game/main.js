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

  // ------------------------------------------------------------------ ステージ（1-1 試作）
  // '#'=地面 '='=板（下から通りぬけ可） 'B'=手紙ブロック 'P'=小包ブロック
  // 'H'=かくしブロック（見えない） 'U'=空ブロック '*'=ハート切手
  const LEVEL_W = 150;
  const level = [];
  const contents = {};      // "x,y" → ブロックの中身
  const parcelHits = {};
  let enemies = [];
  let goal = { x: 134 * TILE, y: 10 * TILE - 20, w: 16, h: 20 };
  const START = { x: 3 * TILE, y: 10 * TILE };
  const CHECKPOINT = { x: 60 * TILE, y: 10 * TILE };

  function buildLevel() {
    level.length = 0;
    for (const k in contents) delete contents[k];
    for (const k in parcelHits) delete parcelHits[k];
    enemies = [];
    for (let r = 0; r < ROWS; r++) level.push(new Array(LEVEL_W).fill('.'));
    const set = (x, y, c) => { if (x >= 0 && x < LEVEL_W && y >= 0 && y < ROWS) level[y][x] = c; };
    const ground = (x0, x1, top = 10) => { for (let x = x0; x <= x1; x++) for (let y = top; y < ROWS; y++) set(x, y, '#'); };
    const plank = (x0, x1, y) => { for (let x = x0; x <= x1; x++) set(x, y, '='); };
    const stamps = (x0, x1, y) => { for (let x = x0; x <= x1; x++) set(x, y, '*'); };
    const block = (x, y, item = 'stamp', kind = 'B') => { set(x, y, kind); contents[x + ',' + y] = item; };
    const pillar = (x, h) => { for (let y = 10 - h; y <= 9; y++) set(x, y, '#'); };
    const enemy = (kind, x) => enemies.push({
      kind, x: x * TILE + 2, y: 10 * TILE - 14, w: 12, h: 14, vx: -22, vy: 0,
      active: false, dead: null, deadT: 0, onGround: false,
    });

    // --- はじまり
    ground(0, 30);
    stamps(6, 9, 8);
    block(13, 6); block(14, 6, 'boots'); block(15, 6, 'stamp', 'P'); block(16, 6);
    enemy('moyan', 20);
    plank(22, 26, 7); stamps(23, 25, 5);
    enemy('moyan', 28);
    // 穴（3マス）
    ground(34, 62);
    block(37, 6, 'plane');
    pillar(40, 1); pillar(41, 2); pillar(42, 3);
    stamps(40, 42, 5);
    enemy('toge', 45);
    plank(47, 51, 7); block(49, 3, 'bag');
    plank(53, 56, 5); stamps(53, 56, 3);
    enemy('moyan', 57); enemy('moyan', 59);
    // 中間ポスト（x=60）のあと、穴（まん中に板）
    plank(64, 65, 8); stamps(64, 65, 6);
    ground(68, 100);
    pillar(74, 2);
    enemy('toge', 77);
    pillar(80, 3);
    enemy('moyan', 83);
    pillar(85, 2); pillar(86, 4);
    stamps(76, 78, 6); stamps(82, 84, 5);
    block(92, 6, 'onigiri'); block(93, 6, 'lantern'); block(94, 6);
    enemy('moyan', 96);
    block(97, 6, 'oneup', 'H');                     // かくしブロック
    enemy('moyan', 99);
    // 穴（3マス）
    ground(104, LEVEL_W - 1);
    block(106, 6, 'scarf');
    enemy('moyan', 108); enemy('toge', 109); enemy('moyan', 110);
    for (let i = 0; i < 4; i++) pillar(112 + i, i + 1);
    stamps(118, 122, 8);
    enemy('moyan', 122); enemy('moyan', 125); enemy('toge', 128);
    goal = { x: 134 * TILE, y: 10 * TILE - 20, w: 16, h: 20 };
    for (let y = 0; y < 10; y++) set(LEVEL_W - 1, y, '#');   // 右はしの壁
  }

  // ワールド1のステージ一覧（playable=false は準備中）
  const STAGES = [
    { id: '1-1', label: '1-1', playable: true },
    { id: '1-2', label: '1-2', playable: false },
    { id: '1-3', label: '1-3', playable: false },
    { id: '1-B', label: 'BOSS', playable: false, boss: true },
  ];
  let stageIndex = 0;

  // ------------------------------------------------------------------ セーブ（この端末のブラウザに保存）
  const SAVE_KEY = 'mister-postman-save-v1';
  const emptySave = () => ({ cleared: {}, best: {}, last: 0, prologue: false });
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
      g.fillStyle = mix([92, 150, 250], [196, 228, 255], y / viewH);
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
    if (raw.dash && !dashRawPrev) setDash(!dashMode);
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
    run.stamps = 0; run.checkpoint = false;
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
    if (run.bag) { run.bag = false; popText('カバンがやぶれた！'); }
    else if (run.power) { popText(NAMES[run.power] + 'をなくした'); run.power = null; }
    else { run.hearts--; }
    run.hurtT = RULE.iframes;
    player.vy = Math.min(player.vy, -140);
    player.vx = -player.face * 60;
    updateHud();
    if (run.hearts <= 0) miss();
  }

  function miss() {
    if (state !== 'play') return;
    state = 'miss'; missT = 1.2;
    player.vx = 0; player.vy = -220;
  }

  function afterMiss() {
    if (run.lives <= 0) {
      state = 'over';
      overMenu.hidden = false;
      return;
    }
    run.lives--;
    run.hearts = RULE.hearts; run.power = null; run.bag = false; run.invT = 0; run.hurtT = 0;
    fadeT = 0.5;
    startLevel();
  }

  // ------------------------------------------------------------------ 切手・アイテム
  function addStamps(n, x, y) {
    for (let i = 0; i < n; i++) {
      run.stamps++;
      if (run.stamps % RULE.stampsFor1up === 0) { run.lives++; popText('1UP！', '#7dff8a'); }
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
      else { run.power = kind; popText(NAMES[kind] + '！', '#ffec96'); }
    } else if (kind === 'bag') {
      if (run.bag) { addStamps(RULE.dupStamps, x, y); popText('切手 +' + RULE.dupStamps, '#ffec96'); }
      else { run.bag = true; popText('大きな配達カバン！', '#ffec96'); }
    } else if (kind === 'onigiri') {
      if (run.hearts < RULE.hearts) { run.hearts++; popText('ハート回復！', '#ff9aa0'); }
      else { addStamps(RULE.dupStamps, x, y); popText('切手 +' + RULE.dupStamps, '#ffec96'); }
    } else if (kind === 'scarf') {
      run.invT = RULE.invincible; popText('むてき！', '#fff4aa');
    } else if (kind === 'oneup') {
      run.lives++; popText('1UP！', '#7dff8a');
    }
    updateHud();
  }

  function hitBlock(tx, ty) {
    const c = level[ty][tx];
    if (c !== 'B' && c !== 'P' && c !== 'H') return;
    bumps.push({ tx, ty, t: 0 });
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
    if (how === 'fall') { e.vy = -160; e.vx = (e.x < player.x ? -1 : 1) * 40; }
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
      if (moveBody(e, dt)) e.vx = -e.vx;
      // 足場のはしで引き返す（小学生でも読みやすい動き）
      if (e.onGround) {
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
      if (e.kind === 'moyan' && fromAbove) {
        killEnemy(e, 'squash');
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
      player.onGround = false; player.jumping = true;
    } else if (jumpPressed && !player.onGround && run.power === 'boots' && !player.usedDouble) {
      // バネぐつ：空中でもう1回ジャンプ
      player.vy = -PHYS.doubleJump; player.usedDouble = true; player.jumping = true; player.buffer = 0;
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
      balls.push({ x: player.x + player.w / 2 + player.face * 6 - 3, y: player.y + 6, w: 6, h: 6, vx: player.face * 170, vy: 40, t: 0 });
    }

    // ---- 移動と当たり判定
    player.x += player.vx * dt; collideX();
    const prevTop = player.y;
    player.prevBottom = player.y + player.h;
    player.y += player.vy * dt; collideY(prevTop, player.prevBottom);

    // ---- 切手を拾う
    const l = Math.floor(player.x / TILE), r = Math.floor((player.x + player.w - 1) / TILE);
    const t = Math.floor(player.y / TILE), b = Math.floor((player.y + player.h - 1) / TILE);
    for (let ty = t; ty <= b; ty++) for (let tx = l; tx <= r; tx++) {
      if (tileAt(tx, ty) === '*') { level[ty][tx] = '.'; addStamps(1, tx * TILE + 2, ty * TILE + 2); }
    }

    // ---- 穴に落ちた
    if (player.y > ROWS * TILE + 24) { run.hearts = 0; updateHud(); miss(); }

    // ---- 中間ポスト
    if (!run.checkpoint && player.x > CHECKPOINT.x) { run.checkpoint = true; popText('中間ポスト！', '#ffec96'); }

    // ---- ゴール
    if (player.x + player.w > goal.x + 2 && player.x < goal.x + goal.w - 2 && player.y + player.h > goal.y) {
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
    save.last = Math.min(stageIndex + 1, STAGES.length - 1);
    writeSave();
    player.vx = 0; player.face = 1;
    player.x = Math.min(player.x, goal.x - player.w - 1);    // ポストの横に立つ
    run.invT = 0; run.hurtT = 0;
    document.body.classList.add('cutscene');
    particles.push({ kind: 'letter', sx: player.x + player.w / 2, sy: player.y + 6,
      ex: goal.x + 7, ey: goal.y + 3, x: 0, y: 0, t: 0, life: GOAL.letter });
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
    const cxr = goal.x + 8 - camX, cyr = 10 * TILE - camY;
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
        if (k >= 1 && !p.done) { p.done = true; postBounce = 0.35; burst(goal.x + 8, goal.y - 6); }
      }
      else if (p.kind === 'fw') { p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= 0.97; p.vy = p.vy * 0.97 + 40 * dt; }
      else if (p.kind === 'rocket') {
        p.y += p.vy * dt;
        if (p.t >= p.life && !p.done) { p.done = true; burst(p.x, p.y); }
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

  function drawCheckpoint(camY) {
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
    const camY = 10 * TILE - (viewH - 46);
    const cx = Math.round(camX);
    ctx.drawImage(sky, 0, 0, viewW, viewH);

    // 太陽
    ctx.fillStyle = 'rgba(255,246,200,.25)'; ctx.beginPath(); ctx.arc(viewW - 60, 44, 24, 0, 7); ctx.fill();
    ctx.fillStyle = 'rgba(255,246,200,.4)'; ctx.beginPath(); ctx.arc(viewW - 60, 44, 16, 0, 7); ctx.fill();
    ctx.fillStyle = '#fff6c8'; ctx.beginPath(); ctx.arc(viewW - 60, 44, 10, 0, 7); ctx.fill();

    // 雲（とても遠い）
    for (const [x, y, img] of CLOUDS) {
      const sx = ((x - cx * 0.08) % 560 + 560) % 560 - 60;
      ctx.drawImage(img, Math.round(sx), y - camY * 0.1);
    }
    // 山（奥ほどゆっくり動く）
    const groundY = 10 * TILE - camY;
    for (const L of LAYERS) {
      ctx.fillStyle = L.col;
      const off = Math.floor(cx * L.par);
      for (let x = 0; x < viewW; x++) {
        const hy = L.h[(x + off) % PERIOD] - BASE_H + viewH;
        ctx.fillRect(x, hy, 1, groundY - hy);
      }
    }
    drawRainbow(camY);
    // 丘
    const off = cx * 0.5;
    for (let x = 0; x < viewW; x++) {
      const hy = Math.round(groundY - 10 - 8 * Math.sin((x + off) * 0.03 + 1));
      ctx.fillStyle = '#54ac60'; ctx.fillRect(x, hy, 1, groundY - hy);
      ctx.fillStyle = '#8cd678'; ctx.fillRect(x, hy, 1, 1);
    }

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
    ctx.drawImage(SPR.POST, Math.round(goal.x - cx) - 1, Math.round(goal.y - camY) - 3 - pb);

    // 敵
    for (const e of enemies) {
      if (!e.active) continue;
      const img = SPR[(e.kind === 'moyan' ? 'MOYAN' : 'TOGE') + (e.vx > 0 ? '_L' : '')];
      const ex = Math.round(e.x + e.w / 2 - img.width / 2 - cx);
      const ey = Math.round(e.y + e.h - img.height - camY);
      if (e.dead === 'squash') {
        ctx.drawImage(img, ex, ey + img.height - 6, img.width, 6);
      } else if (e.dead === 'fall') {
        ctx.save(); ctx.translate(ex + img.width / 2, ey + img.height / 2); ctx.scale(1, -1);
        ctx.drawImage(img, -img.width / 2, -img.height / 2); ctx.restore();
      } else {
        const bob = Math.floor(time * 6 + e.x) % 2;
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

  function updateHud() {
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
    buildLevel(); enemies = []; items = []; particles.length = 0;
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
    buildLevel(); enemies = []; items = []; particles.length = 0;
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
      if (!st.playable) info = '<span class="info">SOON</span>';
      else if (!open) info = '<span class="info">LOCK</span>';
      else if (save.cleared[st.id]) info = `<span class="info gold">切手 ${save.best[st.id] || 0}</span>`;
      else info = '<span class="info">NEW</span>';
      b.innerHTML = `<span class="dot">${st.label}</span>${info}`;
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
    const dot = node.querySelector('.dot');
    const track = mapHero.parentElement.getBoundingClientRect(), d = dot.getBoundingClientRect();
    const x = d.left - track.left + d.width / 2 - mapHero.offsetWidth / 2;
    if (instant) { mapHero.style.transition = 'none'; mapHero.style.left = x + 'px'; void mapHero.offsetWidth; mapHero.style.transition = ''; }
    else mapHero.style.left = x + 'px';
    const st = STAGES[i];
    playBtn.disabled = !st.playable;
    playBtn.textContent = st.playable ? 'PLAY ' + st.label : 'COMING SOON';
  }

  // ---- 会話（1場面 2〜5往復）
  const PROLOGUE = [
    { who: 'postman', text: 'あれ？　島の色が消えてる！' },
    { who: 'pocchi', text: 'たすけて！　男爵が灯台の光をうばったの。' },
    { who: 'postman', text: '光がないと、橋がわたれない…。手紙が届けられないよ！' },
    { who: 'pocchi', text: 'かけらを取りもどせば、光がもどるよ。' },
    { who: 'postman', text: 'よし、配達に出発だ！' },
  ];
  const WHO = {
    postman: { name: 'ポストマン', face: 'STAND', cls: '' },
    pocchi: { name: 'ポッチ', face: 'POCCHI', cls: 'pocchi' },
  };
  let dlg = null;
  const dlgName = document.getElementById('dialog-name');
  const dlgText = document.getElementById('dialog-text');
  function playDialog(lines, done) {
    state = 'dialog'; showActors = false;
    buildLevel(); enemies = []; items = []; particles.length = 0;
    placePlayer(); showActors = true;
    setSat(0, false);                          // 色が消えた世界
    showMenuScene(dialogEl);
    dlg = { lines, i: -1, done, shown: 0, full: true };
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
    if (n !== dlg.shown) { dlg.shown = n; dlgText.textContent = text.slice(0, n); }
    if (n >= text.length) dlg.full = true;
  }
  document.getElementById('dialog-box').addEventListener('click', nextLine);
  tap('btn-skip', () => { if (dlg) { const d = dlg.done; dlg = null; d(); } });
  // アプリを切りかえたら自動で一時停止
  document.addEventListener('visibilitychange', () => { if (document.hidden && state === 'play') togglePause(true); });

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
        camX = (camX + 18 * dt) % (LEVEL_W * TILE - viewW - 20);
        time += dt;
      } else if (state === 'dialog') {
        updateDialog(dt); time += dt;
        pocchi.t += dt;
        pocchi.x = lerp(pocchi.x, player.x + 22, Math.min(1, dt * 3));
        pocchi.y = lerp(pocchi.y, player.y - 14 + Math.sin(pocchi.t * 3) * 3, Math.min(1, dt * 3));
      }
    }
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
    get save() { return save; }, enterStage, enterMap, enterTitle,
  };
})();
