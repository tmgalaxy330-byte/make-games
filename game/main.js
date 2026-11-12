// ミスターポストマン：Step 1 試作（走る・跳ぶ・床に立つ・タッチ操作）
(() => {
  'use strict';

  // ------------------------------------------------------------------ 定数
  const TILE = 16;
  const ROWS = 12;                 // ステージの高さ（タイル数）
  const BASE_H = 180;              // 基準の画面の高さ（ドット）
  const STEP = 1 / 60;             // 物理計算の間隔（秒）

  // 動きの調整値（単位：ドット/秒）
  const PHYS = {
    run: 96,          // 走る最高速度
    accel: 700,       // 地上の加速
    decel: 900,       // 地上の減速
    air: 480,         // 空中の加速
    jump: 300,        // ジャンプの初速 → 最大の高さ ≒ 300² / (2×900) = 50ドット（約3マス）
    gUp: 900,         // 上昇中（ボタンを押している間）の重力
    gDown: 1500,      // 下降中・ボタンを離したときの重力
    maxFall: 380,
    coyote: 0.10,     // 足場から落ちた後もジャンプできる時間
    buffer: 0.12,     // 着地前のジャンプ入力を覚えておく時間
  };

  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  const SPR = window.SPR;

  // ------------------------------------------------------------------ ステージ（1-1 試作）
  // '#'=地面 '='=板（下から通りぬけ可） 'B'=手紙ブロック 'P'=小包ブロック '*'=ハート切手
  const LEVEL_W = 150;
  const level = [];
  let goal = { x: 0, y: 0, w: 16, h: 20 };
  let start = { x: 3 * TILE, y: 9 * TILE };

  function buildLevel() {
    level.length = 0;
    for (let r = 0; r < ROWS; r++) level.push(new Array(LEVEL_W).fill('.'));
    const set = (x, y, c) => { if (x >= 0 && x < LEVEL_W && y >= 0 && y < ROWS) level[y][x] = c; };
    const ground = (x0, x1, top = 10) => { for (let x = x0; x <= x1; x++) for (let y = top; y < ROWS; y++) set(x, y, '#'); };
    const plank = (x0, x1, y) => { for (let x = x0; x <= x1; x++) set(x, y, '='); };
    const stamps = (x0, x1, y) => { for (let x = x0; x <= x1; x++) set(x, y, '*'); };

    ground(0, 30);
    stamps(8, 11, 8);
    set(15, 6, 'B'); set(16, 6, 'P'); set(17, 6, 'B');
    stamps(15, 17, 4);
    plank(22, 26, 7); stamps(23, 25, 5);
    // 穴（3マス）
    ground(34, 62);
    set(40, 9, '#'); for (let y = 8; y <= 9; y++) set(41, y, '#'); for (let y = 7; y <= 9; y++) set(42, y, '#');
    stamps(40, 42, 5);
    plank(47, 51, 7); plank(53, 56, 5); stamps(53, 56, 3);
    // 穴（4マス）＋まん中に板
    plank(64, 65, 8); stamps(64, 65, 6);
    ground(68, 100);
    for (let y = 8; y <= 9; y++) set(74, y, '#');
    for (let y = 7; y <= 9; y++) set(80, y, '#');
    for (let y = 6; y <= 9; y++) set(86, y, '#');
    stamps(76, 78, 6); stamps(82, 84, 5);
    set(92, 6, 'B'); set(93, 6, 'B'); set(94, 6, 'B');
    // 穴（3マス）
    ground(104, LEVEL_W - 1);
    for (let i = 0; i < 4; i++) for (let y = 9 - i; y <= 9; y++) set(112 + i, y, '#');
    stamps(118, 122, 8);
    goal = { x: 134 * TILE, y: 10 * TILE - 20, w: 16, h: 20 };
    for (let y = 0; y < 10; y++) set(LEVEL_W - 1, y, '#');   // 右はしの壁
  }

  const isSolid = c => c === '#' || c === 'B' || c === 'P' || c === 'U';
  const tileAt = (tx, ty) => (tx < 0 || tx >= LEVEL_W) ? '#' : (ty < 0 || ty >= ROWS) ? '.' : level[ty][tx];

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
    for (let x = 0; x < PERIOD; x++) {
      const k = (2 * Math.PI) / PERIOD;
      const n1 = Math.round(L.f * PERIOD / (2 * Math.PI)) || 1;
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
  const input = { left: false, right: false, jump: false, act: false };
  let jumpPrev = false;
  const touchKeys = { left: false, right: false, jump: false, act: false };
  const keyKeys = { left: false, right: false, jump: false, act: false };

  const buttons = [...document.querySelectorAll('#pad .btn')].map(el => ({ el, key: el.dataset.key }));
  const HIT_PAD = 18;   // ボタンの反応範囲を見た目より広くする（px）

  function hitTest(x, y) {
    let best = null, bestD = Infinity;
    for (const b of buttons) {
      const r = b.el.getBoundingClientRect();
      if (x < r.left - HIT_PAD || x > r.right + HIT_PAD || y < r.top - HIT_PAD || y > r.bottom + HIT_PAD) continue;
      const d = Math.hypot(x - (r.left + r.right) / 2, y - (r.top + r.bottom) / 2);
      if (d < bestD) { bestD = d; best = b.key; }
    }
    return best;
  }

  function onTouch(e) {
    if (e.target.closest && e.target.closest('button')) return;   // メニューのボタンは通常どおり
    e.preventDefault();
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
    Space: 'jump', ArrowUp: 'jump', KeyZ: 'jump', KeyW: 'jump', KeyX: 'act', ShiftLeft: 'act' };
  addEventListener('keydown', e => {
    if (e.code === 'Escape' || e.code === 'KeyP') { togglePause(); return; }
    const k = KEYMAP[e.code]; if (!k) return;
    e.preventDefault(); keyKeys[k] = true; syncInput();
  });
  addEventListener('keyup', e => { const k = KEYMAP[e.code]; if (!k) return; keyKeys[k] = false; syncInput(); });

  function syncInput() {
    for (const k in input) input[k] = touchKeys[k] || keyKeys[k];
    for (const b of buttons) b.el.classList.toggle('on', input[b.key]);
  }

  // ------------------------------------------------------------------ プレイヤー
  const player = {
    x: 0, y: 0, w: 10, h: 18, vx: 0, vy: 0,
    onGround: false, face: 1, coyote: 0, buffer: 0, jumping: false, animT: 0,
  };
  const pocchi = { x: 0, y: 0, t: 0 };
  let stampCount = 0;
  let camX = 0;
  let state = 'play';       // 'play' | 'pause' | 'clear'
  let fadeT = 0;            // ミス時のフェード
  const particles = [];
  const bumps = [];         // たたかれたブロックのゆれ

  function reset() {
    buildLevel();
    player.x = start.x; player.y = start.y + TILE - player.h;
    player.vx = player.vy = 0; player.face = 1; player.onGround = false;
    pocchi.x = player.x - 16; pocchi.y = player.y - 20;
    stampCount = 0; updateStampHud();
    camX = 0; particles.length = 0; bumps.length = 0;
    state = 'play';
    pauseMenu.hidden = true; clearMenu.hidden = true;
  }

  function respawn() {
    player.x = start.x; player.y = start.y + TILE - player.h;
    player.vx = player.vy = 0; fadeT = 0.5;
    camX = Math.max(0, player.x - viewW * 0.4);
  }

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

  function collideY(prevBottom) {
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
      // 頭がいちばん重なっているブロックをたたく
      let hit = null, best = -1;
      for (let tx = left; tx <= right; tx++) {
        if (!isSolid(tileAt(tx, ty))) continue;
        const overlap = Math.min(player.x + player.w, (tx + 1) * TILE) - Math.max(player.x, tx * TILE);
        if (overlap > best) { best = overlap; hit = tx; }
      }
      if (hit !== null) {
        player.y = (ty + 1) * TILE; player.vy = 0;
        hitBlock(hit, ty);
      }
    }
  }

  function hitBlock(tx, ty) {
    const c = level[ty][tx];
    if (c !== 'B' && c !== 'P') return;
    bumps.push({ tx, ty, t: 0 });
    // 試作：中身はすべてハート切手1枚（Step 2以降でアイテムを入れる）
    giveStamp(tx * TILE + 2, ty * TILE - 14, true);
    if (c === 'B') level[ty][tx] = 'U';
    else {
      const key = tx + ',' + ty;
      parcelHits[key] = (parcelHits[key] || 0) + 1;
      if (parcelHits[key] >= 10) level[ty][tx] = 'U';
    }
  }
  const parcelHits = {};

  function giveStamp(x, y, popup) {
    stampCount++; updateStampHud();
    if (popup) particles.push({ kind: 'stamp', x, y, vy: -140, t: 0 });
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      particles.push({ kind: 'spark', x: x + 6, y: y + 6, vx: Math.cos(a) * 50, vy: Math.sin(a) * 50, t: 0 });
    }
  }

  function update(dt) {
    // ---- 横の動き
    const dir = (input.right ? 1 : 0) - (input.left ? 1 : 0);
    if (dir) player.face = dir;
    const accel = player.onGround ? (dir ? PHYS.accel : PHYS.decel) : PHYS.air;
    player.vx = approach(player.vx, dir * PHYS.run, accel * dt);

    // ---- ジャンプ（先行入力・コヨーテタイム）
    const jumpPressed = input.jump && !jumpPrev;
    jumpPrev = input.jump;
    player.buffer = jumpPressed ? PHYS.buffer : Math.max(0, player.buffer - dt);
    player.coyote = player.onGround ? PHYS.coyote : Math.max(0, player.coyote - dt);
    if (player.buffer > 0 && player.coyote > 0) {
      player.vy = -PHYS.jump; player.buffer = 0; player.coyote = 0;
      player.onGround = false; player.jumping = true;
    }
    if (player.vy >= 0) player.jumping = false;

    // ---- 重力（押している長さで高さが変わる）
    const g = (player.vy < 0 && input.jump && player.jumping) ? PHYS.gUp : PHYS.gDown;
    player.vy = Math.min(player.vy + g * dt, PHYS.maxFall);

    // ---- 移動と当たり判定
    player.x += player.vx * dt; collideX();
    const prevBottom = player.y + player.h;
    player.y += player.vy * dt; collideY(prevBottom);

    // ---- 切手を拾う
    const l = Math.floor(player.x / TILE), r = Math.floor((player.x + player.w - 1) / TILE);
    const t = Math.floor(player.y / TILE), b = Math.floor((player.y + player.h - 1) / TILE);
    for (let ty = t; ty <= b; ty++) for (let tx = l; tx <= r; tx++) {
      if (tileAt(tx, ty) === '*') { level[ty][tx] = '.'; giveStamp(tx * TILE + 2, ty * TILE + 2, false); }
    }

    // ---- 穴に落ちた
    if (player.y > ROWS * TILE + 40) respawn();

    // ---- ゴール
    if (player.x + player.w > goal.x + 2 && player.x < goal.x + goal.w - 2 && player.y + player.h > goal.y) {
      state = 'clear';
      document.getElementById('clear-stamps').textContent = stampCount;
      clearMenu.hidden = false;
    }

    // ---- アニメ・カメラ・相棒
    player.animT += Math.abs(player.vx) * dt;
    const targetCam = Math.max(0, Math.min(player.x + player.w / 2 - viewW * 0.42, LEVEL_W * TILE - viewW));
    camX = lerp(camX, targetCam, Math.min(1, dt * 8));
    pocchi.t += dt;
    const px = player.x + player.w / 2 - player.face * 20 - 8, py = player.y - 18 + Math.sin(pocchi.t * 3) * 3;
    pocchi.x = lerp(pocchi.x, px, Math.min(1, dt * 4));
    pocchi.y = lerp(pocchi.y, py, Math.min(1, dt * 4));

    for (const p of particles) {
      p.t += dt;
      if (p.kind === 'stamp') { p.y += p.vy * dt; p.vy += 500 * dt; }
      else { p.x += p.vx * dt; p.y += p.vy * dt; }
    }
    for (let i = particles.length - 1; i >= 0; i--) if (particles[i].t > (particles[i].kind === 'stamp' ? 0.45 : 0.3)) particles.splice(i, 1);
    for (const bm of bumps) bm.t += dt;
    for (let i = bumps.length - 1; i >= 0; i--) if (bumps[i].t > 0.15) bumps.splice(i, 1);
    if (fadeT > 0) fadeT -= dt;
  }

  // ------------------------------------------------------------------ 描画
  let time = 0;
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
    // 丘
    const off = cx * 0.5;
    for (let x = 0; x < viewW; x++) {
      const hy = Math.round(groundY - 10 - 8 * Math.sin((x + off) * 0.03 + 1));
      ctx.fillStyle = '#54ac60'; ctx.fillRect(x, hy, 1, groundY - hy);
      ctx.fillStyle = '#8cd678'; ctx.fillRect(x, hy, 1, 1);
    }

    // タイル
    const x0 = Math.floor(cx / TILE), x1 = Math.min(LEVEL_W - 1, Math.floor((cx + viewW) / TILE));
    for (let ty = 0; ty < ROWS; ty++) for (let tx = x0; tx <= x1; tx++) {
      const c = level[ty][tx];
      if (c === '.') continue;
      let dx = tx * TILE - cx, dy = ty * TILE - camY;
      const bm = bumps.find(b => b.tx === tx && b.ty === ty);
      if (bm) dy -= Math.round(Math.sin((bm.t / 0.15) * Math.PI) * 4);
      if (c === '#') {
        const above = tileAt(tx, ty - 1);
        ctx.drawImage(above === '#' ? GMID[tx % 3] : GTOP[tx % 3], dx, dy);
      } else if (c === '=') ctx.drawImage(PLANK, dx, dy);
      else if (c === 'B') ctx.drawImage(SPR.LETTERBLK, dx, dy);
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

    // ゴールのポスト
    ctx.drawImage(SPR.POST, Math.round(goal.x - cx) - 1, Math.round(goal.y - camY) - 3);

    // 相棒ポッチ（光）
    const pxs = Math.round(pocchi.x - cx), pys = Math.round(pocchi.y - camY);
    ctx.fillStyle = 'rgba(255,250,200,.35)'; ctx.beginPath(); ctx.arc(pxs + 9, pys + 7, 11, 0, 7); ctx.fill();
    ctx.drawImage(SPR.POCCHI, pxs, pys);

    // 主人公
    let key = 'STAND';
    if (!player.onGround) key = 'JUMP';
    else if (Math.abs(player.vx) > 8) key = (Math.floor(player.animT / 10) % 2) ? 'RUN' : 'STAND';
    const img = SPR[key + (player.face < 0 ? '_L' : '')];
    const sx = Math.round(player.x + player.w / 2 - img.width / 2 - cx);
    const sy = Math.round(player.y + player.h - img.height + 1 - camY);
    if (player.onGround) {
      ctx.fillStyle = 'rgba(30,40,20,.3)';
      ctx.beginPath(); ctx.ellipse(Math.round(player.x + player.w / 2 - cx), Math.round(player.y + player.h - camY), 7, 1.5, 0, 0, 7); ctx.fill();
    }
    ctx.drawImage(img, sx, sy);

    // エフェクト
    for (const p of particles) {
      if (p.kind === 'stamp') ctx.drawImage(SPR.STAMP, Math.round(p.x - cx), Math.round(p.y - camY));
      else { ctx.fillStyle = '#fff4aa'; ctx.fillRect(Math.round(p.x - cx), Math.round(p.y - camY), 2, 2); }
    }

    if (fadeT > 0) { ctx.fillStyle = `rgba(16,20,40,${fadeT * 1.6})`; ctx.fillRect(0, 0, viewW, viewH); }
  }

  // ------------------------------------------------------------------ HUD・メニュー
  const stampsEl = document.getElementById('stamps');
  function updateStampHud() { stampsEl.textContent = '× ' + stampCount; }
  (() => {
    const ic = document.getElementById('stamp-icon').getContext('2d');
    ic.drawImage(SPR.STAMP, 0, 0);
  })();

  const pauseMenu = document.getElementById('pause-menu');
  const clearMenu = document.getElementById('clear-menu');
  function togglePause(force) {
    if (state === 'clear') return;
    const toPause = force !== undefined ? force : state !== 'pause';
    state = toPause ? 'pause' : 'play';
    pauseMenu.hidden = !toPause;
    for (const k in touchKeys) touchKeys[k] = false;
    syncInput();
  }
  const tap = (id, fn) => document.getElementById(id).addEventListener('click', fn);
  tap('btn-pause', () => togglePause());
  tap('btn-resume', () => togglePause(false));
  tap('btn-restart', reset);
  tap('btn-again', reset);
  // アプリを切りかえたら自動で一時停止
  document.addEventListener('visibilitychange', () => { if (document.hidden && state === 'play') togglePause(true); });

  // ------------------------------------------------------------------ ループ
  let last = performance.now(), acc = 0;
  function frame(now) {
    const dt = Math.min(0.1, (now - last) / 1000); last = now;
    if (state === 'play') {
      acc += dt;
      while (acc >= STEP) { update(STEP); acc -= STEP; }
      time += dt;
    } else acc = 0;
    draw();
    requestAnimationFrame(frame);
  }

  addEventListener('resize', resize);
  resize();
  reset();
  requestAnimationFrame(frame);

  // テスト用（ブラウザの開発ツールから状態を見られる）
  window.__game = { player, get stamps() { return stampCount; }, get state() { return state; } };
})();
