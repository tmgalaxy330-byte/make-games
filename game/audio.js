// ミスターポストマン：音（効果音・BGM）
// 音のファイルは使わず、ブラウザの音の機能（Web Audio）でファミコン風の音を作る。
// 曲はこのゲームのためのオリジナル。
(() => {
  'use strict';

  const AC = window.AudioContext || window.webkitAudioContext;
  let ctx = null, master = null, musicBus = null, sfxBus = null;
  let enabled = true;
  try { enabled = localStorage.getItem('mister-postman-sound') !== 'off'; } catch (e) { /* 保存できなくても鳴らす */ }
  const pulse = {};       // 音色（パルス波）
  let noiseBuf = null;

  function init() {
    if (ctx || !AC) return;
    ctx = new AC();
    master = ctx.createGain(); master.gain.value = enabled ? 0.32 : 0; master.connect(ctx.destination);
    musicBus = ctx.createGain(); musicBus.gain.value = 0.55; musicBus.connect(master);
    sfxBus = ctx.createGain(); sfxBus.gain.value = 0.9; sfxBus.connect(master);
    // ファミコンのような「パルス波」（デューティ比 12.5% / 25% / 50%）
    for (const d of [0.125, 0.25, 0.5]) {
      const n = 40, re = new Float32Array(n), im = new Float32Array(n);
      for (let k = 1; k < n; k++) re[k] = (2 / (k * Math.PI)) * Math.sin(k * Math.PI * d);
      pulse[d] = ctx.createPeriodicWave(re, im);
    }
    // ノイズ（ドラム・爆発用）
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const data = noiseBuf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  }

  // スマホは「さわったとき」でないと音を出せないので、最初の操作で準備する
  function unlock() {
    init();
    if (!ctx) return;
    if (ctx.state === 'suspended' && !paused) ctx.resume();
    if (pendingSong && enabled) { const s = pendingSong; pendingSong = null; current = null; play(s); }
  }
  ['touchstart', 'touchend', 'mousedown', 'keydown', 'click'].forEach(t =>
    document.addEventListener(t, unlock, { capture: true, passive: true }));

  const midiHz = m => 440 * Math.pow(2, (m - 69) / 12);
  const NOTE = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
  function parseNote(s) {
    const m = /^([A-G])([#b]?)(-?\d)$/.exec(s);
    if (!m) return null;
    return 12 * (Number(m[3]) + 1) + NOTE[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0);
  }

  // ------------------------------------------------------------------ 1音を鳴らす
  function tone(bus, t, { wave = 0.5, f, f2, dur, vol = 0.3, attack = 0.005, release = 0.04, glide }) {
    const o = ctx.createOscillator();
    if (wave === 'tri') o.type = 'triangle';
    else if (wave === 'sine') o.type = 'sine';
    else o.setPeriodicWave(pulse[wave]);
    o.frequency.setValueAtTime(f, t);
    if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + (glide || dur));
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + attack);
    g.gain.setValueAtTime(vol, t + Math.max(attack, dur - release));
    g.gain.linearRampToValueAtTime(0, t + dur);
    o.connect(g); g.connect(bus);
    o.start(t); o.stop(t + dur + 0.02);
    return o;
  }
  function noise(bus, t, { dur = 0.1, vol = 0.3, hp = 0, lp = 0 }) {
    const src = ctx.createBufferSource(); src.buffer = noiseBuf;
    let node = src;
    if (hp) { const f = ctx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = hp; node.connect(f); node = f; }
    if (lp) { const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = lp; node.connect(f); node = f; }
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    node.connect(g); g.connect(bus);
    src.start(t, Math.random() * 0.5); src.stop(t + dur + 0.02);
  }

  // ------------------------------------------------------------------ 効果音
  const S = {
    jump()   { tone(sfxBus, now(), { wave: 0.25, f: 300, f2: 760, dur: 0.14, vol: 0.22 }); },
    jump2()  { tone(sfxBus, now(), { wave: 0.125, f: 520, f2: 1200, dur: 0.12, vol: 0.2 }); },
    stomp()  { const t = now(); tone(sfxBus, t, { wave: 0.5, f: 520, f2: 180, dur: 0.1, vol: 0.25 }); noise(sfxBus, t, { dur: 0.06, vol: 0.15, hp: 1500 }); },
    kick()   { const t = now(); tone(sfxBus, t, { wave: 0.25, f: 700, f2: 120, dur: 0.18, vol: 0.2 }); },
    stamp()  { const t = now(); tone(sfxBus, t, { wave: 0.25, f: midiHz(88), dur: 0.05, vol: 0.18 }); tone(sfxBus, t + 0.05, { wave: 0.25, f: midiHz(95), dur: 0.12, vol: 0.18 }); },
    bump()   { const t = now(); tone(sfxBus, t, { wave: 'tri', f: 180, f2: 90, dur: 0.09, vol: 0.4 }); noise(sfxBus, t, { dur: 0.05, vol: 0.12, lp: 900 }); },
    sprout() { tone(sfxBus, now(), { wave: 0.5, f: 200, f2: 800, dur: 0.35, vol: 0.14 }); },
    power()  { arp([72, 76, 79, 84, 88, 91], 0.055, 0.25, 0.2); },
    heal()   { arp([79, 84, 88], 0.08, 0.5, 0.2); },
    oneup()  { arp([76, 79, 88, 84, 86, 91], 0.09, 0.25, 0.22); },
    gem()    { arp([84, 91, 96, 103], 0.06, 0.125, 0.18); },
    hurt()   { const t = now(); tone(sfxBus, t, { wave: 0.5, f: 520, f2: 140, dur: 0.3, vol: 0.22 }); tone(sfxBus, t, { wave: 0.125, f: 540, f2: 150, dur: 0.3, vol: 0.12 }); },
    bagRip() { const t = now(); noise(sfxBus, t, { dur: 0.22, vol: 0.25, hp: 800 }); tone(sfxBus, t, { wave: 0.25, f: 400, f2: 200, dur: 0.2, vol: 0.15 }); },
    fire()   { const t = now(); tone(sfxBus, t, { wave: 0.125, f: 1400, f2: 500, dur: 0.08, vol: 0.18 }); },
    check()  { arp([79, 84, 91], 0.07, 0.5, 0.18); },
    click()  { tone(sfxBus, now(), { wave: 0.5, f: 880, dur: 0.035, vol: 0.12 }); },
    select() { const t = now(); tone(sfxBus, t, { wave: 0.25, f: 660, dur: 0.04, vol: 0.14 }); tone(sfxBus, t + 0.045, { wave: 0.25, f: 990, dur: 0.06, vol: 0.14 }); },
    swim()   { tone(sfxBus, now(), { wave: 0.5, f: 380, f2: 620, dur: 0.08, vol: 0.1 }); },
    crumble(){ noise(sfxBus, now(), { dur: 0.18, vol: 0.18, lp: 1200 }); },
    zap()    { const t = now(); tone(sfxBus, t, { wave: 0.125, f: 1600, f2: 900, dur: 0.06, vol: 0.06 }); },
    blip()   { tone(sfxBus, now(), { wave: 0.25, f: 1200, dur: 0.02, vol: 0.06 }); },
    drop()   { tone(sfxBus, now(), { wave: 0.5, f: 900, f2: 300, dur: 0.15, vol: 0.18 }); },
    boom()   { const t = now(); noise(sfxBus, t, { dur: 0.45, vol: 0.18, lp: 1800 }); },
    thud()   { const t = now(); tone(sfxBus, t, { wave: 'tri', f: 120, f2: 40, dur: 0.3, vol: 0.55 }); noise(sfxBus, t, { dur: 0.25, vol: 0.2, lp: 400 }); },
    bossHit(){ const t = now(); tone(sfxBus, t, { wave: 0.5, f: 300, f2: 100, dur: 0.2, vol: 0.25 }); noise(sfxBus, t, { dur: 0.15, vol: 0.2, hp: 600 }); },
    bossDown(){ const t = now(); for (let i = 0; i < 5; i++) noise(sfxBus, t + i * 0.12, { dur: 0.3, vol: 0.2, lp: 1500 - i * 200 }); tone(sfxBus, t, { wave: 0.5, f: 400, f2: 60, dur: 0.9, vol: 0.2 }); },
    miss()   { if (!ctx) return; stop(); arp([76, 74, 71, 67, 64, 60], 0.11, 0.5, 0.2); },
  };
  function arp(notes, step, wave, vol) {
    const t = now();
    notes.forEach((n, i) => tone(sfxBus, t + i * step, { wave, f: midiHz(n), dur: step * 1.6, vol }));
  }
  const now = () => ctx.currentTime + 0.005;

  // ------------------------------------------------------------------ 曲（BGM）
  // 書き方：1つの区切りが step 拍。'-' は前の音をのばす、'.' は休み、'|' は小節の区切り（読みやすくするだけ）
  // ドラム：k=バスドラム、s=スネア、h=ハイハット
  const SONGS = {
    // タイトル：元気な行進
    title: { bpm: 132, tracks: [
      { wave: 0.25, vol: 0.16, step: 0.5, notes:
        'G4 G4 B4 D5 | G5 - D5 B4 | C5 E5 G5 E5 | D5 - - . | E5 E5 D5 C5 | B4 D5 G5 F#5 | E5 C5 A4 F#4 | G4 - - . ' },
      { wave: 'tri', vol: 0.28, step: 1, notes: 'G2 D3 G2 D3 | C3 G3 G2 D3 | C3 G2 D3 D2 | G2 D3 G2 . ' },
      { drum: true, vol: 0.12, step: 0.5, notes: 'k h s h k h s h | k h s h k k s h | k h s h k h s h | k h s h k s s s ' },
    ] },
    // マップ：のんびり
    map: { bpm: 104, tracks: [
      { wave: 0.5, vol: 0.12, step: 0.5, notes:
        'E5 - D5 C5 | D5 - G4 - | A4 B4 C5 E5 | D5 - - - | C5 - B4 A4 | B4 - E4 - | F4 A4 C5 B4 | C5 - - - ' },
      { wave: 'tri', vol: 0.28, step: 1, notes: 'C3 G3 G2 D3 | F2 C3 G2 D3 | A2 E3 E2 B2 | F2 C3 C3 . ' },
    ] },
    // 1-1 草原：明るく軽快
    meadow: { bpm: 150, tracks: [
      { wave: 0.25, vol: 0.15, step: 0.5, notes:
        'E5 G5 C6 G5 | A5 G5 E5 C5 | D5 E5 F5 A5 | G5 - - . | E5 G5 C6 G5 | A5 C6 B5 A5 | G5 F5 E5 D5 | C5 - - . ' +
        'F5 - A5 F5 | E5 - G5 E5 | D5 F5 A5 C6 | B5 - G5 . | A5 - F5 A5 | G5 - E5 G5 | F5 E5 D5 B4 | C5 - - . ' },
      { wave: 'tri', vol: 0.3, step: 0.5, notes:
        'C3 . G3 . | F3 . C3 . | D3 . A3 . | G3 . B2 . | C3 . G3 . | F3 . A3 . | G3 . G2 . | C3 . G3 . ' +
        'F3 . C3 . | C3 . G3 . | D3 . F3 . | G3 . D3 . | F3 . C3 . | C3 . E3 . | G3 . G2 . | C3 . C3 . ' },
      { drum: true, vol: 0.1, step: 0.5, notes:
        'k h s h | k h s h | k h s h | k h s h | k h s h | k h s h | k h s h | k s s s ' +
        'k h s h | k h s h | k h s h | k h s h | k h s h | k h s h | k h s h | k s k s ' },
    ] },
    // 1-2 森：はずむリズム（短調ぎみ）
    forest: { bpm: 140, tracks: [
      { wave: 0.125, vol: 0.15, step: 0.5, notes:
        'A4 . C5 E5 | D5 . C5 A4 | G4 . B4 D5 | C5 - B4 . | A4 . C5 E5 | F5 . E5 D5 | E5 . G#4 B4 | A4 - - . ' +
        'C5 . E5 G5 | F5 . E5 C5 | D5 . F5 A5 | G5 - E5 . | F5 . D5 F5 | E5 . C5 E5 | D5 B4 G#4 B4 | A4 - - . ' },
      { wave: 'tri', vol: 0.3, step: 0.5, notes:
        'A2 A3 E3 A3 | D3 D3 A2 D3 | G2 G3 D3 G3 | C3 E3 G3 E3 | A2 A3 E3 A3 | D3 F3 A3 F3 | E3 E3 B2 E3 | A2 E3 A2 . ' +
        'C3 C3 G3 C3 | F2 F3 C3 F3 | D3 D3 A3 D3 | C3 G3 E3 G3 | D3 D3 F3 D3 | C3 C3 E3 C3 | E3 E3 G#3 E3 | A2 E3 A2 . ' },
      { drum: true, vol: 0.1, step: 0.5, notes: 'k . h k | s . h . | k . h k | s . h h | k . h k | s . h . | k . h k | s s s . ' },
    ] },
    // 1-3 夕日の丘：ゆったり
    sunset: { bpm: 116, tracks: [
      { wave: 0.5, vol: 0.12, step: 0.5, notes:
        'C5 - F5 - | A5 - G5 F5 | E5 - G5 - | F5 - - . | D5 - G5 - | Bb5 - A5 G5 | A5 G5 F5 E5 | F5 - - . ' +
        'A5 - C6 - | Bb5 - A5 G5 | G5 - Bb5 - | A5 - - . | F5 - A5 - | G5 - E5 C5 | D5 E5 F5 G5 | F5 - - . ' },
      { wave: 'tri', vol: 0.3, step: 1, notes:
        'F2 C3 | F2 A2 | C3 G2 | F2 C3 | Bb2 F3 | G2 D3 | C3 C3 | F2 C3 | F2 C3 | Bb2 F3 | C3 G2 | F2 A2 | D3 A2 | C3 G2 | C3 C3 | F2 . ' },
      { drum: true, vol: 0.08, step: 0.5, notes: 'k . h . s . h . | k . h . s . h h ' },
    ] },
    // ワールド2 砂丘：エキゾチック（和声的短音階）
    desert: { bpm: 128, tracks: [
      { wave: 0.125, vol: 0.15, step: 0.5, notes:
        'D5 . F5 E5 | D5 C#5 D5 . | A4 . Bb4 C#5 | D5 - - . | F5 . G5 A5 | Bb5 A5 G5 F5 | E5 F5 E5 C#5 | D5 - - . ' +
        'A5 . G5 F5 | E5 . F5 D5 | C5 . D5 E5 | F5 - E5 . | D5 . E5 F5 | G5 F5 E5 D5 | C#5 D5 E5 C#5 | D5 - - . ' },
      { wave: 'tri', vol: 0.3, step: 0.5, notes:
        'D3 . A2 . | D3 . A2 . | G2 . A2 . | D3 . A2 . | Bb2 . F3 . | G2 . D3 . | A2 . E3 . | D3 . A2 . ' +
        'F2 . C3 . | C3 . G2 . | F2 . A2 . | Bb2 . F2 . | Bb2 . F3 . | G2 . D3 . | A2 . C#3 . | D3 . D3 . ' },
      { drum: true, vol: 0.1, step: 0.5, notes: 'k . h k | s . h . ' },
    ] },
    // ワールド3 雪原：鈴のようにきらきら
    snow: { bpm: 120, tracks: [
      { wave: 0.125, vol: 0.13, step: 0.5, notes:
        'B5 - G#5 E5 | F#5 - B4 . | C#5 E5 G#5 F#5 | E5 - - . | A5 - F#5 D#5 | E5 - B4 . | C#5 D#5 E5 F#5 | G#5 - - . ' +
        'B5 - A5 G#5 | F#5 - E5 . | A5 - G#5 F#5 | E5 - C#5 . | D#5 - E5 F#5 | G#5 - A5 . | F#5 E5 D#5 F#5 | E5 - - . ' },
      { wave: 'tri', vol: 0.28, step: 1, notes:
        'E3 B2 | E3 B2 | A2 E3 | E3 B2 | F#2 C#3 | E3 B2 | A2 B2 | E3 B2 | E3 B2 | A2 E3 | F#2 C#3 | A2 E3 | B2 F#3 | E3 C#3 | B2 B2 | E3 . ' },
      { drum: true, vol: 0.07, step: 0.5, notes: 'h . h . s . h . ' },
    ] },
    // ワールド4 海岸：波がゆれるような6拍子
    sea: { bpm: 138, tracks: [
      { wave: 0.25, vol: 0.14, step: 0.5, notes:
        'G5 - E5 C5 - E5 | G5 - A5 G5 - . | F5 - D5 B4 - D5 | F5 - G5 F5 - . | E5 - C5 A4 - C5 | E5 - F5 E5 - D5 | C5 - D5 E5 - G5 | C5 - - - - . ' },
      { wave: 'tri', vol: 0.3, step: 1.5, notes: 'C3 G2 | C3 E3 | G2 D3 | G2 B2 | A2 E3 | F2 C3 | G2 G2 | C3 . ' },
      { drum: true, vol: 0.08, step: 0.5, notes: 'k . h s . h ' },
    ] },
    // ワールド4 海の中：ゆらゆらしたアルペジオ
    deep: { bpm: 96, tracks: [
      { wave: 0.5, vol: 0.1, step: 0.5, notes:
        'A4 C5 E5 A5 E5 C5 | G4 B4 D5 G5 D5 B4 | F4 A4 C5 F5 C5 A4 | E4 G#4 B4 E5 B4 G#4 ' },
      { wave: 0.125, vol: 0.09, step: 1, notes: 'E5 - - D5 - C5 | B4 - - - - . | C5 - - E5 - A5 | G#5 - - - - . ' },
      { wave: 'tri', vol: 0.26, step: 3, notes: 'A2 G2 F2 E2 ' },
    ] },
    // ワールド5 クモリ城：おもおもしい短調
    castle: { bpm: 120, tracks: [
      { wave: 0.25, vol: 0.13, step: 0.5, notes:
        'D5 - A4 D5 | F5 - E5 D5 | C#5 - A4 C#5 | E5 - - . | D5 - F5 A5 | Bb5 - A5 G5 | F5 E5 D5 C#5 | D5 - - . ' },
      { wave: 0.125, vol: 0.07, step: 1, notes: 'A4 - D5 - | A4 - G4 - | Bb4 - A4 - | A4 - - . ' },
      { wave: 'tri', vol: 0.3, step: 0.5, notes: 'D3 . D3 A2 | D3 . D3 A2 | A2 . A2 E3 | A2 . A2 C#3 | Bb2 . Bb2 F3 | G2 . G2 D3 | A2 . A2 E3 | D3 . D3 . ' },
      { drum: true, vol: 0.1, step: 0.5, notes: 'k . . k s . . . ' },
    ] },
    // ワールド6 時計島：チクタク、はずむ
    clock: { bpm: 144, tracks: [
      { wave: 0.125, vol: 0.13, step: 0.5, notes:
        'G5 . E5 . | C5 . E5 G5 | A5 . F5 . | D5 . F5 A5 | G5 . E5 . | C5 . D5 E5 | F5 E5 D5 B4 | C5 . . . ' +
        'E5 . G5 . | C6 . B5 A5 | G5 . F5 . | E5 . D5 . | C5 . E5 . | G5 . A5 G5 | F5 . D5 B4 | C5 . . . ' },
      { wave: 'tri', vol: 0.3, step: 0.5, notes:
        'C3 G2 C3 G2 | C3 G2 C3 G2 | F2 C3 F2 C3 | D3 A2 D3 A2 | C3 G2 C3 G2 | A2 E3 A2 E3 | G2 D3 G2 D3 | C3 G2 C3 . ' +
        'C3 G2 C3 G2 | A2 E3 A2 E3 | F2 C3 F2 C3 | C3 G2 C3 G2 | A2 E3 A2 E3 | E2 B2 E2 B2 | G2 D3 G2 D3 | C3 G2 C3 . ' },
      { drum: true, vol: 0.09, step: 0.5, notes: 'h h h h ' },
    ] },
    // ワールド7 時の灯台：ふしぎなワルツ
    time: { bpm: 132, tracks: [
      { wave: 0.5, vol: 0.11, step: 1, notes:
        'E5 - B4 | C5 - D5 | E5 - G5 | F#5 - - | D5 - A4 | B4 - C5 | D5 - F#5 | E5 - - | E5 - G5 | B5 - A5 | G5 - E5 | F#5 - D5 | E5 - C5 | B4 - A4 | G#4 - B4 | E5 - - ' },
      { wave: 'tri', vol: 0.26, step: 1, notes:
        'E3 B3 B3 | A2 E3 E3 | C3 G3 G3 | B2 F#3 F#3 | D3 A3 A3 | G2 D3 D3 | B2 F#3 F#3 | E3 B3 B3 | C3 G3 G3 | G2 D3 D3 | C3 G3 G3 | B2 F#3 F#3 | A2 E3 E3 | D3 A3 A3 | E3 B3 B3 | E3 . . ' },
    ] },
    // 最後のボス：はげしく
    final: { bpm: 172, tracks: [
      { wave: 0.25, vol: 0.14, step: 0.5, notes: 'A5 . A5 G5 | A5 . C6 . | B5 A5 G5 E5 | G5 - . . | F5 . F5 E5 | F5 . A5 . | G#5 F5 E5 D5 | E5 - . . ' },
      { wave: 0.125, vol: 0.07, step: 0.5, notes: 'E5 . E5 D5 | E5 . G5 . | G5 F5 E5 C5 | D5 - . . | D5 . D5 C5 | D5 . F5 . | E5 D5 C5 B4 | C5 - . . ' },
      { wave: 'tri', vol: 0.32, step: 0.5, notes: 'A2 A3 A2 A3 | A2 A3 A2 A3 | E2 E3 E2 E3 | E2 E3 E2 E3 | F2 F3 F2 F3 | D2 D3 D2 D3 | E2 E3 E2 E3 | E2 E3 G#2 B2 ' },
      { drum: true, vol: 0.12, step: 0.5, notes: 'k h s h k k s s ' },
    ] },
    // エンディング：やさしく、あたたかく
    ending: { bpm: 92, tracks: [
      { wave: 0.5, vol: 0.12, step: 1, notes: 'E5 D5 C5 G4 | A4 C5 D5 - | E5 G5 A5 G5 | E5 - - . | F5 E5 D5 C5 | D5 E5 G5 - | E5 D5 C5 D5 | C5 - - . ' },
      { wave: 0.125, vol: 0.06, step: 2, notes: 'C5 E5 | F5 D5 | C5 E5 | G5 - | A4 C5 | B4 D5 | G4 B4 | C5 . ' },
      { wave: 'tri', vol: 0.26, step: 2, notes: 'C3 G2 | F2 G2 | C3 E3 | A2 G2 | F2 C3 | G2 E3 | F2 G2 | C3 . ' },
    ] },
    // ボス：せまってくる感じ
    boss: { bpm: 164, tracks: [
      { wave: 0.25, vol: 0.14, step: 0.5, notes:
        'E5 . E5 F5 | G5 . F5 E5 | D#5 . D#5 E5 | F#5 . B4 . | E5 . E5 F5 | G5 . A5 B5 | C6 B5 A5 G5 | F#5 - - . ' },
      { wave: 'tri', vol: 0.32, step: 0.5, notes:
        'E2 E3 E2 E3 | E2 E3 E2 E3 | B1 B2 B1 B2 | B1 B2 B1 B2 | C2 C3 C2 C3 | A1 A2 A1 A2 | F#2 F#3 F#2 F#3 | B1 B2 B1 B2 ' },
      { drum: true, vol: 0.12, step: 0.5, notes: 'k h s h k k s h ' },
    ] },
    // むてき：はやいアルペジオ
    invincible: { bpm: 190, tracks: [
      { wave: 0.25, vol: 0.13, step: 0.5, notes: 'C5 E5 G5 C6 G5 E5 | D5 F5 A5 D6 A5 F5 | E5 G5 B5 E6 B5 G5 | F5 A5 C6 F6 C6 A5 ' },
      { wave: 'tri', vol: 0.3, step: 1.5, notes: 'C3 C3 | D3 D3 | E3 E3 | F3 G3 ' },
      { drum: true, vol: 0.1, step: 0.5, notes: 'k h s k h s ' },
    ] },
    // プロローグ：色が消えた世界（さみしげ）
    sad: { bpm: 84, tracks: [
      { wave: 0.5, vol: 0.11, step: 1, notes: 'E5 D5 C5 B4 | A4 - - . | F4 G4 A4 C5 | B4 - - . | E5 D5 C5 A4 | B4 C5 D5 - | C5 B4 A4 G#4 | A4 - - . ' },
      { wave: 'tri', vol: 0.26, step: 2, notes: 'A2 E3 | F2 C3 | D3 A2 | E3 E2 | A2 C3 | G2 D3 | F2 E2 | A2 . ' },
    ] },
    // ワールドクリアの会話：あたたかく
    warm: { bpm: 100, tracks: [
      { wave: 0.5, vol: 0.12, step: 1, notes: 'G4 C5 E5 D5 | C5 - G4 . | A4 C5 F5 E5 | D5 - - . | E5 G5 C6 B5 | A5 - F5 . | G5 E5 D5 B4 | C5 - - . ' },
      { wave: 'tri', vol: 0.26, step: 2, notes: 'C3 G2 | C3 E3 | F2 C3 | G2 D3 | C3 E3 | F2 A2 | G2 G2 | C3 . ' },
    ] },
  };
  // 1回だけ鳴らすジングル
  const JINGLES = {
    clear: { bpm: 150, tracks: [
      { wave: 0.25, vol: 0.18, step: 0.5, notes: 'C5 E5 G5 C6 | . G5 C6 - | D6 - E6 - | C6 - - - ' },
      { wave: 0.125, vol: 0.1, step: 0.5, notes: 'G4 C5 E5 G5 | . E5 G5 - | B5 - C6 - | G5 - - - ' },
      { wave: 'tri', vol: 0.3, step: 1, notes: 'C3 G2 | C3 E3 | G2 G2 | C3 - ' },
    ] },
    // 時間が少ないぞ！の合図
    hurry: { bpm: 220, tracks: [
      { wave: 0.25, vol: 0.18, step: 0.5, notes: 'E6 C6 E6 C6 E6 C6 G6 - ' },
      { wave: 0.125, vol: 0.1, step: 0.5, notes: 'C6 A5 C6 A5 C6 A5 E6 - ' },
    ] },
    over: { bpm: 96, tracks: [
      { wave: 0.5, vol: 0.14, step: 1, notes: 'C5 B4 Bb4 A4 | F4 G4 E4 . ' },
      { wave: 'tri', vol: 0.28, step: 2, notes: 'F2 D2 | G2 C2 ' },
    ] },
  };

  let tempo = 1;            // 曲の速さ（時間が少なくなると上がる）
  function compile(song, mult = 1) {
    const spb = 60 / (song.bpm * mult);
    let loopLen = 0;
    const tracks = song.tracks.map(tr => {
      const toks = tr.notes.split(/\s+/).filter(x => x && x !== '|');
      const ev = [];
      toks.forEach((tk, i) => {
        if (tk === '-') { if (ev.length && ev[ev.length - 1].end === i) { ev[ev.length - 1].end = i + 1; } return; }
        if (tk === '.') return;
        ev.push({ tk, start: i, end: i + 1 });
      });
      const len = toks.length * tr.step * spb;
      loopLen = Math.max(loopLen, len);
      return { tr, len, ev: ev.map(e => ({ tk: e.tk, t: e.start * tr.step * spb, d: (e.end - e.start) * tr.step * spb })) };
    });
    return { tracks, loopLen };
  }
  const compiled = {};
  const get = (name, mult = 1) => compiled[name + '@' + mult] || (compiled[name + '@' + mult] = compile(SONGS[name] || JINGLES[name], mult));

  let current = null, songGain = null, timer = null, pendingSong = null, paused = false;
  let curTempo = 1, holdUntil = 0, wanted = null;
  function scheduleLoop(c, gain, t0) {
    for (const { tr, len, ev } of c.tracks) {
      // 短いトラック（ドラムなど）は曲の長さまでくり返す
      for (let rep = 0; rep * len < c.loopLen - 0.001; rep++) {
        for (const e of ev) {
          const t = t0 + rep * len + e.t;
          if (tr.drum) {
            if (e.tk === 'k') tone(gain, t, { wave: 'tri', f: 160, f2: 45, dur: 0.12, vol: tr.vol * 3.2 });
            else if (e.tk === 's') noise(gain, t, { dur: 0.12, vol: tr.vol * 1.6, hp: 1200 });
            else if (e.tk === 'h') noise(gain, t, { dur: 0.04, vol: tr.vol, hp: 6000 });
          } else {
            const m = parseNote(e.tk); if (m === null) continue;
            tone(gain, t, { wave: tr.wave, f: midiHz(m), dur: e.d * 0.92, vol: tr.vol, release: Math.min(0.08, e.d * 0.3) });
          }
        }
      }
    }
  }

  function play(name, { once = false } = {}) {
    if (!SONGS[name] && !JINGLES[name]) return;
    if (current === name && curTempo === tempo && !once) return;
    if (!once && performance.now() < holdUntil) { wanted = name; current = name; return; }   // 合図の音が鳴っている間は待つ
    if (!ctx || ctx.state !== 'running') { pendingSong = name; current = name; return; }
    stop();
    current = name;
    const mult = once ? 1 : tempo;
    curTempo = tempo;
    const c = get(name, mult);
    songGain = ctx.createGain(); songGain.connect(musicBus);
    let t0 = ctx.currentTime + 0.06;
    scheduleLoop(c, songGain, t0);
    if (once) { current = null; return; }
    const g = songGain;
    timer = setInterval(() => {
      if (ctx.currentTime > t0 + c.loopLen - 0.4) { t0 += c.loopLen; scheduleLoop(c, g, t0); }
    }, 100);
  }
  function stop() {
    pendingSong = null;
    if (timer) { clearInterval(timer); timer = null; }
    if (songGain) {
      const g = songGain;
      try { g.gain.setTargetAtTime(0, ctx.currentTime, 0.02); } catch (e) { /* もう止まっている */ }
      setTimeout(() => g.disconnect(), 150);
      songGain = null;
    }
    current = null;
  }
  // 「急げ！」：合図を鳴らしてから、同じ曲を速いテンポで鳴らしなおす
  function hurry() {
    if (!ctx || !enabled) { tempo = 1.35; return; }
    const song = current;
    stop();
    play('hurry', { once: true });
    holdUntil = performance.now() + 1100;
    wanted = song; current = song;
    setTimeout(() => {
      holdUntil = 0; tempo = 1.35;
      const n = wanted; wanted = null; current = null;
      if (n) play(n);
    }, 1100);
  }
  function setTempo(m) {
    if (tempo === m) return;
    tempo = m; holdUntil = 0;
    if (current && SONGS[current]) { const n = current; current = null; play(n); }
  }
  function pause(p) {
    paused = p;
    if (!ctx) return;
    if (p) ctx.suspend(); else if (enabled) ctx.resume();
  }
  function setEnabled(on) {
    enabled = on;
    try { localStorage.setItem('mister-postman-sound', on ? 'on' : 'off'); } catch (e) { /* 保存できなくてもよい */ }
    init();
    if (master) master.gain.setTargetAtTime(on ? 0.32 : 0, ctx.currentTime, 0.02);
    if (on && ctx && ctx.state === 'suspended' && !paused) ctx.resume();
  }

  // 効果音の呼び出し口（音が使えないときは何もしない）
  const sfx = {};
  for (const k of Object.keys(S)) sfx[k] = () => { if (ctx && enabled && ctx.state === 'running') { try { S[k](); } catch (e) { /* 音が出なくても遊べる */ } } };

  window.SOUND = {
    sfx, play, stop, pause, setEnabled, hurry, setTempo,
    get tempo() { return tempo; },
    get enabled() { return enabled; },
    get current() { return current; },
    get state() { return ctx ? ctx.state : 'none'; },
    _songs: SONGS, _compile: compile,
  };
})();
