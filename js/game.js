/* Word Well — rendering, input, audio and the game loop. */
(function () {
  'use strict';

  const L = window.WordWellLogic;
  const FONT = window.WordWellFont;
  const dict = L.buildDictionary(window.WORDLIST || '');
  const TARGETS = (window.TARGETS || '').split(' ').filter(Boolean);

  // ---- layout, in internal pixels (the canvas is scaled up by a whole-number factor) ----
  const W = 320, H = 272;
  const CELL = 12, TILE = 11;
  const COLS = L.COLS, ROWS = L.ROWS;
  const WELL_X = 100, WELL_Y = 22;
  const WELL_W = COLS * CELL + 1, WELL_H = ROWS * CELL + 1;
  const WALL = 8;
  const LEFT_X = 8, PANEL_W = 76;
  const RIGHT_X = WELL_X + WELL_W + WALL + 8;
  const GEM_X = W - 12, GEM_Y = 8; // centre of the score gem, where flying gems land

  const RED = '#f2121b', WHITE = '#ffffff', BLACK = '#000000';
  const GREY = '#8c8c8c', DIM = '#262626', DIMRED = '#6e0a10';

  // ---- timing (ms) ----
  const LOCK_DELAY = 500, CLEAR_TIME = 480, DAS = 150, ARR = 45, SOFT_ARR = 35;
  const WORDS_PER_LEVEL = 8;
  const gravityInterval = lvl => Math.max(70, 900 * Math.pow(0.86, lvl - 1));

  const canvas = document.getElementById('screen');
  const ctx = canvas.getContext('2d');
  canvas.width = W;
  canvas.height = H;
  ctx.imageSmoothingEnabled = false; // keep scaled glyphs crisp
  function fit() {
    const s = Math.max(1, Math.floor(Math.min(innerWidth / W, innerHeight / H)));
    canvas.style.width = W * s + 'px';
    canvas.style.height = H * s + 'px';
  }
  addEventListener('resize', fit);
  fit();

  const store = {
    get(k, d) {
      try { const v = localStorage.getItem('wordwell.' + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; }
    },
    set(k, v) {
      try { localStorage.setItem('wordwell.' + k, JSON.stringify(v)); } catch (e) { /* storage unavailable */ }
    },
  };

  const rand = (a, b) => a + Math.random() * (b - a);
  const key = (x, y) => x + ',' + y;
  const cellPx = x => WELL_X + 1 + x * CELL;
  const cellPy = y => WELL_Y + 1 + y * CELL;

  // ---------------------------------------------------------------------------------------------
  // Sprites
  // ---------------------------------------------------------------------------------------------
  function makeCanvas(w, h) {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    return c;
  }

  function paintBitmap(g, rows, x, y, color) {
    g.fillStyle = color;
    for (let r = 0; r < rows.length; r++) {
      for (let c = 0; c < rows[r].length; c++) if (rows[r][c] === '#') g.fillRect(x + c, y + r, 1, 1);
    }
  }

  const glyphCache = new Map();
  function glyph(ch, color) {
    const k = ch + color;
    if (!glyphCache.has(k)) {
      const rows = FONT.glyphs[ch] || FONT.glyphs[ch.toUpperCase()];
      let c = null;
      if (rows) {
        c = makeCanvas(5, 7);
        paintBitmap(c.getContext('2d'), rows, 0, 0, color);
      }
      glyphCache.set(k, c);
    }
    return glyphCache.get(k);
  }

  const textWidth = (str, scale = 1) => (str.length ? str.length * 6 * scale - scale : 0);
  const OUTLINE = [[-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [1, -1], [-1, 1], [1, 1]];

  function drawText(str, x, y, color, opts = {}) {
    const scale = opts.scale || 1;
    const w = textWidth(str, scale);
    if (opts.align === 'center') x -= Math.floor(w / 2);
    else if (opts.align === 'right') x -= w;
    if (opts.outline) for (const [ox, oy] of OUTLINE) drawRaw(str, x + ox, y + oy, opts.outline, scale);
    drawRaw(str, x, y, color, scale);
    return w;
  }

  function drawRaw(str, x, y, color, scale) {
    for (let i = 0; i < str.length; i++) {
      const g = glyph(str[i], color);
      if (g) ctx.drawImage(g, x + i * 6 * scale, y, 5 * scale, 7 * scale);
    }
  }

  // Tile looks: locked (white stone), active (red), ghost (dotted), hint (part of a word the ghost
  // would complete), flash/flashRed (being cleared), dead (game over wipe). Letters reserved for the
  // target word are red: target/targetHint when locked, activeTarget (white square) while falling.
  const tileCache = new Map();
  function tileSprite(ch, style) {
    const k = style + ':' + ch;
    if (tileCache.has(k)) return tileCache.get(k);
    const c = makeCanvas(TILE, TILE);
    const g = c.getContext('2d');
    const S = TILE - 1;
    const outline = (color, dotted) => {
      g.fillStyle = color;
      for (let i = 1; i < S; i++) {
        if (dotted && i % 2 === 0) continue;
        g.fillRect(i, 0, 1, 1);
        g.fillRect(i, S, 1, 1);
        g.fillRect(0, i, 1, 1);
        g.fillRect(S, i, 1, 1);
      }
    };
    const fill = color => {
      g.fillStyle = color;
      g.fillRect(1, 0, S - 1, TILE);
      g.fillRect(0, 1, TILE, S - 1);
    };
    const lip = color => {
      g.fillStyle = color;
      for (let i = 2; i < S - 1; i += 2) g.fillRect(i, S - 1, 1, 1);
    };
    let letter = WHITE;
    switch (style) {
      case 'locked': outline(WHITE); lip(WHITE); break;
      case 'hint': outline(RED); lip(RED); break;
      case 'active': fill(RED); break;
      case 'ghost': outline(RED, true); letter = DIMRED; break;
      case 'ghostHint': outline(RED); break;
      case 'flash': fill(WHITE); letter = BLACK; break;
      case 'flashRed': fill(RED); letter = BLACK; break;
      case 'dead': outline(RED); lip(RED); letter = RED; break;
      case 'target': outline(WHITE); lip(WHITE); letter = RED; break;
      case 'targetHint': outline(RED); lip(RED); letter = RED; break;
      case 'activeTarget': fill(WHITE); letter = RED; break;
    }
    if (ch === 'qu') {
      paintBitmap(g, FONT.glyphs.Q, 1, 2, letter);
      paintBitmap(g, FONT.smallU, 7, 4, letter);
    } else if (ch) {
      paintBitmap(g, FONT.glyphs[ch.toUpperCase()], 3, 2, letter);
    }
    tileCache.set(k, c);
    return c;
  }

  const gemSprite = (() => {
    const c = makeCanvas(7, 7);
    const g = c.getContext('2d');
    FONT.gem.forEach((row, y) => [...row].forEach((p, x) => {
      if (p === '.') return;
      g.fillStyle = p === 'w' ? WHITE : RED;
      g.fillRect(x, y, 1, 1);
    }));
    return c;
  })();

  // Cobblestone strips for the well walls and floor.
  function stoneStrip(w, h, vertical, color, seed) {
    const c = makeCanvas(w, h);
    const g = c.getContext('2d');
    const rnd = L.makeRng(seed);
    g.fillStyle = color;
    const stone = (x, y, sw, sh) => {
      if (sw < 3 || sh < 3) return;
      g.fillRect(x + 1, y, sw - 2, 1);
      g.fillRect(x + 1, y + sh - 1, sw - 2, 1);
      g.fillRect(x, y + 1, 1, sh - 2);
      g.fillRect(x + sw - 1, y + 1, 1, sh - 2);
      g.fillRect(x + 2, y + 2, 1, 1);
      for (let i = x + 2; i < x + sw - 2; i += 2) g.fillRect(i, y + sh - 2, 1, 1);
    };
    if (vertical) {
      for (let y = 0; y < h;) {
        const sh = 5 + Math.floor(rnd() * 7);
        if (rnd() < 0.3) { stone(0, y, 4, sh); stone(4, y, w - 4, sh); } else stone(0, y, w, sh);
        y += sh;
      }
    } else {
      for (let x = 0; x < w;) {
        const sw = 6 + Math.floor(rnd() * 9);
        stone(x, 0, Math.min(sw, w - x), h);
        x += sw;
      }
    }
    return c;
  }

  const WALL_H = WELL_Y + WELL_H;
  const walls = {
    left: stoneStrip(WALL, WALL_H, true, WHITE, 11),
    right: stoneStrip(WALL, WALL_H, true, WHITE, 23),
    leftRed: stoneStrip(WALL, WALL_H, true, RED, 11),
    rightRed: stoneStrip(WALL, WALL_H, true, RED, 23),
    floor: stoneStrip(WELL_W + WALL * 2, 8, false, WHITE, 37),
  };

  // ---------------------------------------------------------------------------------------------
  // Audio: tiny square-wave blips, created on the first key press
  // ---------------------------------------------------------------------------------------------
  const sfx = (() => {
    let ac = null;
    let muted = store.get('muted', false);
    let lastGem = 0;
    function ensure() {
      if (!ac) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (AC) ac = new AC();
      }
      if (ac && ac.state === 'suspended') ac.resume();
    }
    function tone(freq, dur, o = {}) {
      if (!ac || muted) return;
      const t0 = ac.currentTime + (o.delay || 0);
      const osc = ac.createOscillator();
      const g = ac.createGain();
      osc.type = o.type || 'square';
      osc.frequency.setValueAtTime(freq, t0);
      if (o.slide) osc.frequency.exponentialRampToValueAtTime(freq * o.slide, t0 + dur);
      g.gain.setValueAtTime(o.vol || 0.05, t0);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      osc.connect(g);
      g.connect(ac.destination);
      osc.start(t0);
      osc.stop(t0 + dur + 0.02);
    }
    function noise(dur, vol) {
      if (!ac || muted) return;
      const len = Math.floor(ac.sampleRate * dur);
      const buf = ac.createBuffer(1, len, ac.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
      const src = ac.createBufferSource();
      const g = ac.createGain();
      src.buffer = buf;
      g.gain.value = vol;
      src.connect(g);
      g.connect(ac.destination);
      src.start();
    }
    const semi = (f, s) => f * Math.pow(2, s / 12);
    return {
      ensure,
      toggle() { muted = !muted; store.set('muted', muted); },
      get muted() { return muted; },
      move: () => tone(220, 0.025, { vol: 0.02 }),
      rotate: () => tone(440, 0.05, { vol: 0.03, slide: 1.5 }),
      lock: () => tone(130, 0.07, { vol: 0.05, slide: 0.6 }),
      drop: () => { noise(0.1, 0.1); tone(110, 0.1, { vol: 0.05, slide: 0.4 }); },
      word: (chain, len) => [0, 4, 7, 12, 16, 19].slice(0, Math.min(6, len))
        .forEach((s, i) => tone(semi(523, s + (chain - 1) * 2), 0.1, { vol: 0.035, delay: i * 0.055 })),
      gem: () => {
        const now = performance.now();
        if (now - lastGem < 35) return;
        lastGem = now;
        tone(1500 + Math.random() * 500, 0.04, { vol: 0.02, type: 'triangle' });
      },
      level: () => [0, 4, 7, 12].forEach((s, i) => tone(semi(392, s), 0.12, { vol: 0.05, delay: i * 0.08, type: 'triangle' })),
      target: () => [0, 7, 12, 16, 19, 24].forEach((s, i) => tone(semi(523, s), 0.09, { vol: 0.04, delay: i * 0.05, type: 'triangle' })),
      missed: () => [0, -5].forEach((s, i) => tone(semi(220, s), 0.12, { vol: 0.04, delay: i * 0.1 })),
      over: () => [0, -3, -7, -12].forEach((s, i) => tone(semi(330, s), 0.2, { vol: 0.05, delay: i * 0.15, slide: 0.9 })),
    };
  })();

  // ---------------------------------------------------------------------------------------------
  // Game state
  // ---------------------------------------------------------------------------------------------
  let state = 'title'; // title | play | clearing | settling | paused | over
  let minLen = store.get('minLen', 3);
  let showHints = store.get('hints', true);
  let best = store.get('best', 0);

  let grid = L.emptyGrid();
  let gen = null;
  let tracker = null; // the live target word (L.TargetTracker)
  let piece = null;
  let score = 0, shownScore = 0, wordsCleared = 0, level = 1, chain = 0, maxChain = 0;
  let longest = '', newBest = false;
  let targetsHit = 0, targetsSeen = 0;
  let dropTimer = 0, lockTimer = 0, lockResets = 0;
  let clearing = null;
  let hint = { cells: new Set(), words: [] };
  let recent = [];
  let particles = [], gems = [], popups = [], banner = null;
  let shake = 0, gemFlash = 0, time = 0, overTime = 0;

  function newGame() {
    grid = L.emptyGrid();
    gen = new L.PieceGenerator(dict, { minLen, targets: TARGETS });
    tracker = new L.TargetTracker();
    score = shownScore = wordsCleared = chain = maxChain = 0;
    targetsHit = targetsSeen = 0;
    level = 1;
    longest = '';
    newBest = false;
    recent = [];
    particles = [];
    gems = [];
    popups = [];
    banner = null;
    clearing = null;
    state = 'play';
    spawn();
  }

  // Letters are dealt the moment a piece spawns, from the board as it is now (NEXT only shows the
  // shape), so a hook the dealer aims at is still there. A target goes live with its first piece.
  function spawn() {
    const dealt = gen.next(grid);
    if (dealt.target && dealt.target.anchor) {
      tracker.announce(grid, dealt.target);
      showBanner('TARGET ' + dealt.target.word.toUpperCase());
    }
    piece = L.createPiece(dealt.type, dealt.letters, dealt.target);
    piece.x = Math.floor((COLS - piece.n) / 2);
    piece.y = -Math.min(...piece.cells.map(c => c.y));
    dropTimer = lockTimer = lockResets = 0;
    state = 'play';
    if (L.collides(grid, piece, 0, 0)) { gameOver(); return; }
    updateHints();
  }

  const grounded = () => L.collides(grid, piece, 0, 1);

  function ghostDrop() {
    let d = 0;
    while (!L.collides(grid, piece, 0, d + 1)) d++;
    return d;
  }

  // Which words would the piece spell if dropped straight down right now?
  function updateHints() {
    hint = { cells: new Set(), words: [] };
    if (!piece || !showHints) return;
    const d = ghostDrop();
    const tmp = grid.map(row => row.slice());
    for (const c of piece.cells) {
      const y = piece.y + c.y + d;
      if (y < 0) return;
      tmp[y][piece.x + c.x] = { ch: c.ch, tgt: c.tgt };
    }
    for (const w of L.findWords(tmp, dict, minLen)) {
      hint.words.push(w.word);
      for (const p of w.cells) hint.cells.add(key(p.x, p.y));
    }
  }

  function afterMove() {
    if (grounded() && lockResets < 15) { lockTimer = 0; lockResets++; }
    updateHints();
  }

  function moveH(dx) {
    if (L.collides(grid, piece, dx, 0)) return;
    piece.x += dx;
    sfx.move();
    afterMove();
  }

  function rotate(dir) {
    const r = L.tryRotate(grid, piece, dir);
    if (!r) return;
    Object.assign(piece, r);
    sfx.rotate();
    afterMove();
  }

  function softDrop() {
    if (L.collides(grid, piece, 0, 1)) { lockTimer = LOCK_DELAY; return; }
    piece.y++;
    dropTimer = 0;
    lockTimer = 0;
  }

  function hardDrop() {
    const d = ghostDrop();
    piece.y += d;
    if (d > 0) {
      for (const c of piece.cells) {
        const px = cellPx(piece.x + c.x) + 5, py = cellPy(piece.y + c.y) + TILE;
        for (let i = 0; i < 2; i++) {
          particles.push({ x: px + rand(-5, 5), y: py, vx: rand(-0.08, 0.08), vy: rand(-0.12, -0.02), life: rand(150, 350), color: WHITE, size: 1 });
        }
      }
      shake = Math.max(shake, 1.5);
    }
    sfx.drop();
    lockPiece();
  }

  function lockPiece() {
    for (const c of piece.cells) {
      const y = piece.y + c.y;
      if (y < 0) { gameOver(); return; }
      const tile = { ch: c.ch, dy: 0, vy: 0 };
      if (c.tgt) tile.tgt = c.tgt;
      grid[y][piece.x + c.x] = tile;
    }
    tracker.placed(piece.target);
    piece = null;
    hint = { cells: new Set(), words: [] };
    sfx.lock();
    resolve();
  }

  // Look for words; if any, flash them (state 'clearing'), then remove them and let columns
  // settle (state 'settling'), then look again: each extra pass is a chain. Once the board is still,
  // a target whose window has run out expires and its freed letters get one more look.
  function resolve() {
    const found = L.findWords(grid, dict, minLen);
    if (!found.length) {
      const missed = tracker.endTurn(grid);
      if (missed) {
        targetsSeen++;
        showBanner('MISSED ' + missed.toUpperCase());
        sfx.missed();
        resolve();
        return;
      }
      chain = 0;
      spawn();
      return;
    }
    const hits = new Set(tracker.hit(grid, found));
    if (hits.size) { targetsHit++; targetsSeen++; }
    chain++;
    maxChain = Math.max(maxChain, chain);
    const cells = new Set();
    let gained = 0;
    found.forEach((w, i) => {
      const pts = L.scoreWord(w.word, chain) * (hits.has(w) ? L.TARGET_BONUS : 1);
      gained += pts;
      for (const p of w.cells) cells.add(key(p.x, p.y));
      const cx = Math.round(w.cells.reduce((s, p) => s + cellPx(p.x), 0) / w.cells.length) + 5;
      const cy = Math.round(w.cells.reduce((s, p) => s + cellPy(p.y), 0) / w.cells.length) + 5;
      // Several words at once: stagger and stack the popups so they stay readable.
      popups.push({ text: w.word.toUpperCase(), pts, x: cx, y: Math.max(WELL_Y + 24, cy - i * 20), t: -i * 140 });
      recent.unshift({ word: w.word, pts });
      if (w.word.length > longest.length) longest = w.word;
    });
    recent.length = Math.min(recent.length, 22);
    clearing = { found, cells, gained, t: 0 };
    state = 'clearing';
    if (hits.size) {
      showBanner('TARGET X' + L.TARGET_BONUS);
      sfx.target();
    } else {
      if (chain > 1) showBanner('CHAIN X' + chain);
      sfx.word(chain, Math.max(...found.map(w => w.word.length)));
    }
  }

  function finishClear() {
    const { found, cells, gained } = clearing;
    clearing = null;
    score += gained;
    wordsCleared += found.length;
    for (const k of cells) {
      const [x, y] = k.split(',').map(Number);
      const px = cellPx(x) + 5, py = cellPy(y) + 5;
      for (let i = 0; i < 7; i++) {
        particles.push({
          x: px + rand(-4, 4), y: py + rand(-4, 4), vx: rand(-0.12, 0.12), vy: rand(-0.28, -0.04),
          life: rand(350, 800), color: Math.random() < 0.5 ? WHITE : RED, size: Math.random() < 0.3 ? 2 : 1,
        });
      }
      for (let i = 0; i < 2; i++) gems.push({ x: px, y: py, vx: rand(-0.15, 0.15), vy: rand(-0.25, -0.08), t: 0 });
      grid[y][x] = null;
    }
    for (const m of L.applyGravity(grid)) {
      m.tile.dy = (m.fromY - m.toY) * CELL;
      m.tile.vy = 0;
    }
    const newLevel = 1 + Math.floor(wordsCleared / WORDS_PER_LEVEL);
    if (newLevel > level) {
      level = newLevel;
      showBanner('LEVEL ' + level);
      sfx.level();
    }
    shake = Math.min(6, 2 + cells.size / 4);
    state = 'settling';
  }

  function showBanner(text) {
    banner = { text, t: 0 };
  }

  function gameOver() {
    state = 'over';
    overTime = 0;
    piece = null;
    hint = { cells: new Set(), words: [] };
    if (score > best) {
      best = score;
      newBest = true;
      store.set('best', best);
    }
    shake = 4;
    sfx.over();
  }

  // ---------------------------------------------------------------------------------------------
  // Update
  // ---------------------------------------------------------------------------------------------
  function update(dt) {
    time += dt;
    updateHeld(dt);
    if (state === 'play') updatePlay(dt);
    else if (state === 'clearing') {
      clearing.t += dt;
      if (clearing.t >= CLEAR_TIME) finishClear();
    } else if (state === 'settling') updateSettling(dt);
    else if (state === 'over') overTime += dt;
    if (state !== 'paused') updateFx(dt);
  }

  function updatePlay(dt) {
    if (grounded()) {
      lockTimer += dt;
      if (lockTimer >= LOCK_DELAY) lockPiece();
      return;
    }
    dropTimer += dt;
    if (dropTimer >= gravityInterval(level)) {
      dropTimer = 0;
      lockTimer = 0;
      piece.y++;
    }
  }

  function updateSettling(dt) {
    let moving = false;
    for (const row of grid) {
      for (const t of row) {
        if (!t || t.dy >= 0) continue;
        t.vy += 0.0016 * dt;
        t.dy += t.vy * dt;
        if (t.dy >= 0) { t.dy = 0; t.vy = 0; } else moving = true;
      }
    }
    if (!moving) resolve();
  }

  function updateFx(dt) {
    for (const p of particles) {
      p.vy += 0.0009 * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.life -= dt;
    }
    particles = particles.filter(p => p.life > 0);

    for (const g of gems) {
      g.t += dt;
      if (g.t < 220) {
        g.vy += 0.0006 * dt; // short burst before homing in on the score
      } else {
        const dx = GEM_X - g.x, dy = GEM_Y - g.y;
        const d = Math.hypot(dx, dy) || 1;
        const sp = Math.min(0.6, 0.05 + (g.t - 220) * 0.0012);
        g.vx += (dx / d * sp - g.vx) * 0.25;
        g.vy += (dy / d * sp - g.vy) * 0.25;
        if (d < 4 + sp * dt || g.t > 2500) {
          g.done = true;
          gemFlash = 120;
          sfx.gem();
        }
      }
      g.x += g.vx * dt;
      g.y += g.vy * dt;
    }
    gems = gems.filter(g => !g.done);

    for (const p of popups) p.t += dt;
    popups = popups.filter(p => p.t < 1200);
    if (banner && (banner.t += dt) > 1500) banner = null;
    shake = Math.max(0, shake - dt * 0.02);
    gemFlash = Math.max(0, gemFlash - dt);
    if (shownScore < score) {
      shownScore = Math.min(score, shownScore + Math.max(1, Math.ceil((score - shownScore) * dt * 0.006)));
    }
  }

  // ---------------------------------------------------------------------------------------------
  // Input
  // ---------------------------------------------------------------------------------------------
  const BIND = {
    ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right', ArrowDown: 'down', KeyS: 'down',
    ArrowUp: 'cw', KeyX: 'cw', KeyW: 'cw', KeyZ: 'ccw', Space: 'drop', KeyP: 'pause', Escape: 'pause',
    KeyM: 'mute', KeyH: 'hints', Enter: 'start',
  };
  const held = new Map(); // action -> { t, r } for auto-repeat

  addEventListener('keydown', e => {
    const action = BIND[e.code];
    if (!action) return;
    e.preventDefault();
    sfx.ensure();
    if (e.repeat) return;
    if (action === 'left' || action === 'right' || action === 'down') held.set(action, { t: 0, r: 0 });
    press(action);
  });
  addEventListener('keyup', e => held.delete(BIND[e.code]));
  addEventListener('blur', () => {
    held.clear();
    if (state === 'play') state = 'paused';
  });

  function updateHeld(dt) {
    if (state !== 'play') return;
    for (const [action, h] of held) {
      h.t += dt;
      const delay = action === 'down' ? 0 : DAS;
      const rate = action === 'down' ? SOFT_ARR : ARR;
      if (h.t < delay) continue;
      h.r += dt;
      while (h.r >= rate && state === 'play') {
        h.r -= rate;
        act(action);
      }
    }
  }

  function press(action) {
    if (action === 'mute') { sfx.toggle(); return; }
    if (action === 'hints') {
      showHints = !showHints;
      store.set('hints', showHints);
      updateHints();
      return;
    }
    switch (state) {
      case 'title':
        if (action === 'start' || action === 'drop') newGame();
        else if (action === 'left' || action === 'right') {
          minLen = Math.min(5, Math.max(3, minLen + (action === 'left' ? -1 : 1)));
          store.set('minLen', minLen);
          sfx.move();
        }
        break;
      case 'over':
        if ((action === 'start' || action === 'drop') && overTime > 900) newGame();
        break;
      case 'paused':
        if (action === 'pause' || action === 'start') state = 'play';
        break;
      case 'play':
        if (action === 'pause') state = 'paused';
        else act(action);
        break;
    }
  }

  function act(action) {
    if (!piece) return;
    if (action === 'left') moveH(-1);
    else if (action === 'right') moveH(1);
    else if (action === 'down') softDrop();
    else if (action === 'cw') rotate(1);
    else if (action === 'ccw') rotate(-1);
    else if (action === 'drop') hardDrop();
  }

  // ---------------------------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------------------------
  function render() {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = BLACK;
    ctx.fillRect(0, 0, W, H);
    const sx = shake ? Math.round(rand(-shake, shake)) : 0;
    const sy = shake ? Math.round(rand(-shake, shake)) : 0;
    ctx.setTransform(1, 0, 0, 1, sx, sy);
    drawWell();
    drawBoard();
    drawPiece();
    drawParticles();
    drawPopups();
    drawBanner();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    drawHUD();
    for (const g of gems) {
      ctx.fillStyle = RED;
      ctx.fillRect(Math.round(g.x) - 1, Math.round(g.y), 3, 1);
      ctx.fillRect(Math.round(g.x), Math.round(g.y) - 1, 1, 3);
    }
    if (state === 'title') drawTitle();
    else if (state === 'paused') drawPaused();
    else if (state === 'over') drawGameOver();
  }

  function isDanger() {
    for (let y = 0; y < 4; y++) if (grid[y].some(Boolean)) return true;
    return false;
  }

  function drawWell() {
    ctx.fillStyle = DIM;
    for (let y = 1; y < ROWS; y++) {
      for (let x = 1; x < COLS; x++) ctx.fillRect(WELL_X + x * CELL, WELL_Y + y * CELL, 1, 1);
    }
    const danger = state !== 'title' && isDanger() && Math.floor(time / 300) % 2 === 0;
    ctx.drawImage(danger ? walls.leftRed : walls.left, WELL_X - WALL, 0);
    ctx.drawImage(danger ? walls.rightRed : walls.right, WELL_X + WELL_W, 0);
    ctx.drawImage(walls.floor, WELL_X - WALL, WELL_Y + WELL_H);
  }

  function drawBoard() {
    const pulse = Math.floor(time / 180) % 2 === 0;
    const wiped = state === 'over' ? Math.floor(overTime / 40) : 0;
    for (let y = 0; y < ROWS; y++) {
      for (let x = 0; x < COLS; x++) {
        const t = grid[y][x];
        if (!t) continue;
        const k = key(x, y);
        let style = 'locked';
        if (clearing && clearing.cells.has(k)) style = Math.floor(clearing.t / 60) % 2 ? 'flashRed' : 'flash';
        else if (state === 'over' && y >= ROWS - wiped) style = 'dead';
        else if (pulse && hint.cells.has(k)) style = t.tgt ? 'targetHint' : 'hint';
        else if (t.tgt) style = 'target';
        ctx.drawImage(tileSprite(t.ch, style), cellPx(x), cellPy(y) + Math.round(t.dy || 0));
      }
    }
  }

  function drawPiece() {
    if (!piece || (state !== 'play' && state !== 'paused')) return;
    const pulse = Math.floor(time / 180) % 2 === 0;
    const d = ghostDrop();
    if (d > 0) {
      for (const c of piece.cells) {
        const x = piece.x + c.x, y = piece.y + c.y + d;
        const style = pulse && hint.cells.has(key(x, y)) ? 'ghostHint' : 'ghost';
        ctx.drawImage(tileSprite(c.ch, style), cellPx(x), cellPy(y));
      }
    }
    for (const c of piece.cells) ctx.drawImage(tileSprite(c.ch, c.tgt ? 'activeTarget' : 'active'), cellPx(piece.x + c.x), cellPy(piece.y + c.y));
  }

  function drawParticles() {
    for (const p of particles) {
      ctx.fillStyle = p.color;
      ctx.fillRect(Math.round(p.x), Math.round(p.y), p.size, p.size);
    }
  }

  function drawPopups() {
    for (const p of popups) {
      if (p.t < 0 || (p.t > 900 && Math.floor(p.t / 60) % 2)) continue;
      const rise = Math.round(p.t * 0.02);
      const half = Math.ceil(textWidth(p.text) / 2);
      const x = Math.min(Math.max(p.x, WELL_X + half + 2), WELL_X + WELL_W - half - 2);
      drawText(p.text, x, p.y - 12 - rise, WHITE, { align: 'center', outline: BLACK });
      drawText('+' + p.pts, x, p.y - 3 - rise, RED, { align: 'center', outline: BLACK });
    }
  }

  // Red rule with a boxed caption across the well, like Downwell's "GEM HIGH".
  function drawRuleBanner(text, y, color = WHITE) {
    const cx = WELL_X + Math.floor(WELL_W / 2);
    const w = textWidth(text) + 8;
    ctx.fillStyle = RED;
    ctx.fillRect(WELL_X + 6, y + 3, WELL_W - 12, 2);
    ctx.fillRect(WELL_X + 4, y + 2, 2, 4);
    ctx.fillRect(WELL_X + WELL_W - 6, y + 2, 2, 4);
    ctx.fillStyle = BLACK;
    ctx.fillRect(cx - Math.floor(w / 2), y - 1, w, 10);
    drawText(text, cx, y, color, { align: 'center' });
  }

  function drawBanner() {
    if (!banner || (banner.t > 1200 && Math.floor(banner.t / 70) % 2)) return;
    drawRuleBanner(banner.text, WELL_Y + 30);
  }

  function drawHeader(label, x, y) {
    drawText(label, x, y, WHITE);
    ctx.fillStyle = RED;
    ctx.fillRect(x, y + 9, PANEL_W, 1);
    ctx.fillRect(x + PANEL_W - 3, y + 8, 3, 1);
  }

  // NEXT shows only the shape (letters come at spawn); a target's second piece shows its red cells.
  function drawMiniPiece(next, cx, cy, style) {
    const cells = L.createPiece(next.type, ['', '', '', ''], next.target).cells;
    const xs = cells.map(c => c.x), ys = cells.map(c => c.y);
    const minX = Math.min(...xs), minY = Math.min(...ys);
    const w = (Math.max(...xs) - minX + 1) * CELL - 1;
    const h = (Math.max(...ys) - minY + 1) * CELL - 1;
    const ox = cx - Math.floor(w / 2), oy = cy - Math.floor(h / 2);
    const tgtStyle = style === 'active' ? 'activeTarget' : 'target';
    for (const c of cells) ctx.drawImage(tileSprite(c.ch, c.tgt ? tgtStyle : style), ox + (c.x - minX) * CELL, oy + (c.y - minY) * CELL);
  }

  function drawHUD() {
    // Level bar, top-left (Downwell's HP bar).
    const bx = LEFT_X, by = 4, bw = PANEL_W, bh = 11;
    const into = wordsCleared % WORDS_PER_LEVEL;
    ctx.fillStyle = RED;
    ctx.fillRect(bx, by, bw, 1);
    ctx.fillRect(bx, by + bh - 1, bw, 1);
    ctx.fillRect(bx, by, 1, bh);
    ctx.fillRect(bx + bw - 1, by, 1, bh);
    ctx.fillRect(bx + 2, by + 2, Math.round((bw - 4) * into / WORDS_PER_LEVEL), bh - 4);
    drawText('LV' + level, bx + 4, by + 2, WHITE);
    drawText(into + '/' + WORDS_PER_LEVEL, bx + bw - 4, by + 2, WHITE, { align: 'right' });

    // Score with the red gem, top-right.
    drawText(String(Math.floor(shownScore)), W - 18, 5, gemFlash > 0 ? RED : WHITE, { align: 'right' });
    ctx.drawImage(gemSprite, GEM_X - 3, GEM_Y - 4);
    ctx.fillStyle = RED;
    ctx.fillRect(RIGHT_X, 15, W - 8 - RIGHT_X - 10, 1);
    ctx.fillRect(W - 18, 14, 8, 2);

    if (state === 'title') { drawTitlePanels(); return; }

    // Left panel: words found, newest first.
    drawHeader('WORDS', LEFT_X, 26);
    recent.slice(0, 21).forEach((r, i) => {
      const pts = String(r.pts);
      const room = 12 - pts.length;
      const word = r.word.length > room ? r.word.slice(0, room - 1) + '.' : r.word;
      const y = 42 + i * 10;
      drawText(word.toUpperCase(), LEFT_X, y, i < 3 ? WHITE : GREY);
      drawText(pts, LEFT_X + PANEL_W, y, i < 3 ? RED : DIMRED, { align: 'right' });
    });

    // Right panel: next pieces, stats, hint.
    drawHeader('NEXT', RIGHT_X, 26);
    if (gen) drawMiniPiece(gen.plan[0] || { type: gen.peekType() }, RIGHT_X + PANEL_W / 2, 58, 'active');

    const stat = (label, value, y, color = WHITE) => {
      drawText(label, RIGHT_X, y, GREY);
      drawText(value, RIGHT_X + PANEL_W, y + 10, color, { align: 'right' });
    };
    stat('BEST', String(Math.max(best, score)), 116);
    drawTargetPanel(140);

    drawHeader('HINT', RIGHT_X, 196);
    if (!showHints) drawText('OFF (H)', RIGHT_X, 212, GREY);
    else if (hint.words.length) {
      hint.words.slice(0, 3).forEach((w, i) => drawText(w.toUpperCase().slice(0, 12), RIGHT_X, 212 + i * 10, RED));
    } else drawText('-', RIGHT_X, 212, GREY);
    drawText('MIN ' + minLen + (sfx.muted ? '  MUTE' : ''), RIGHT_X, 252, GREY);
  }

  // The live target and how many pieces are left to spell it.
  function drawTargetPanel(y) {
    drawHeader('TARGET', RIGHT_X, y);
    const word = tracker.word;
    if (!word) { drawText('-', RIGHT_X, y + 16, GREY); return; }
    const text = word.toUpperCase();
    const scale = textWidth(text, 2) <= PANEL_W ? 2 : 1;
    drawText(text, RIGHT_X, y + 16 + (scale === 1 ? 4 : 0), RED, { scale });
    drawText('X' + L.TARGET_BONUS, RIGHT_X, y + 34, WHITE);
    if (tracker.word && Number.isFinite(tracker.left)) {
      for (let i = 0; i < L.TARGET_WINDOW; i++) {
        const px = RIGHT_X + PANEL_W - (L.TARGET_WINDOW - i) * 8 + 1;
        ctx.fillStyle = RED;
        if (i < tracker.left) ctx.fillRect(px, y + 35, 6, 5);
        else { ctx.fillRect(px, y + 35, 6, 1); ctx.fillRect(px, y + 39, 6, 1); ctx.fillRect(px, y + 35, 1, 5); ctx.fillRect(px + 5, y + 35, 1, 5); }
      }
    }
  }

  function drawTitlePanels() {
    drawHeader('CONTROLS', LEFT_X, 26);
    [
      ['← →', 'MOVE'], ['↑ X', 'ROTATE'], ['Z', 'ROT LEFT'], ['↓', 'SOFT'], ['SPC', 'DROP'],
      ['P', 'PAUSE'], ['H', 'HINTS'], ['M', 'MUTE'],
    ].forEach(([k, v], i) => {
      drawText(k, LEFT_X, 42 + i * 11, RED);
      drawText(v, LEFT_X + PANEL_W, 42 + i * 11, WHITE, { align: 'right' });
    });

    drawHeader('HOW TO', RIGHT_X, 26);
    [
      ['SPELL WORDS', WHITE], ['ACROSS → OR', WHITE], ['DOWN ↓.', WHITE], ['', WHITE],
      ['WORDS BREAK,', WHITE], ['TILES ABOVE', WHITE], ['FALL IN.', WHITE], ['', WHITE],
      ['CHAINS AND', RED], ['LONG WORDS', RED], ['SCORE MORE.', RED], ['', WHITE],
      ['RED LETTERS', RED], ['MAKE THE', WHITE], ['TARGET WORD:', WHITE], ['JOIN THEM', WHITE], ['FOR X3.', WHITE],
    ].forEach(([t, c], i) => drawText(t, RIGHT_X, 42 + i * 10, c));
    drawText('BEST ' + best, RIGHT_X, 252, GREY);
  }

  function drawTitle() {
    const cx = WELL_X + Math.floor(WELL_W / 2);
    ctx.fillStyle = BLACK;
    ctx.fillRect(WELL_X + 2, WELL_Y + 24, WELL_W - 4, 196);
    for (const [word, y] of [['WORD', 52], ['WELL', 88]]) {
      drawText(word, cx, y + 3, RED, { scale: 4, align: 'center' });
      drawText(word, cx, y, WHITE, { scale: 4, align: 'center', outline: BLACK });
    }
    drawRuleBanner('FALLING WORDS', 128, RED);
    if (Math.floor(time / 450) % 2 === 0) drawText('PRESS ENTER', cx, 152, WHITE, { align: 'center' });
    drawText('MIN WORD LENGTH', cx, 176, GREY, { align: 'center' });
    drawText('← ' + minLen + ' →', cx, 188, WHITE, { align: 'center' });
    drawText('HINTS ' + (showHints ? 'ON' : 'OFF'), cx, 206, showHints ? RED : GREY, { align: 'center' });
  }

  function drawPaused() {
    ctx.fillStyle = BLACK;
    ctx.fillRect(WELL_X + 2, WELL_Y + 100, WELL_W - 4, 40);
    drawRuleBanner('PAUSED', WELL_Y + 110);
    drawText('P TO RESUME', WELL_X + Math.floor(WELL_W / 2), WELL_Y + 126, GREY, { align: 'center' });
  }

  function drawGameOver() {
    if (overTime < 900) return;
    const cx = WELL_X + Math.floor(WELL_W / 2);
    ctx.fillStyle = BLACK;
    ctx.fillRect(WELL_X + 2, WELL_Y + 56, WELL_W - 4, 146);
    drawText('GAME', cx, WELL_Y + 62, WHITE, { scale: 2, align: 'center' });
    drawText('OVER', cx, WELL_Y + 80, WHITE, { scale: 2, align: 'center' });
    drawRuleBanner(String(score), WELL_Y + 102, WHITE);
    if (newBest) drawText('NEW BEST!', cx, WELL_Y + 116, RED, { align: 'center' });
    const row = (label, value, y) => {
      drawText(label, WELL_X + 8, y, GREY);
      drawText(value, WELL_X + WELL_W - 8, y, WHITE, { align: 'right' });
    };
    row('LONGEST', longest ? longest.toUpperCase().slice(0, 9) : '-', WELL_Y + 134);
    row('CHAIN', 'X' + Math.max(1, maxChain), WELL_Y + 146);
    row('TARGETS', targetsHit + '/' + targetsSeen, WELL_Y + 158);
    if (Math.floor(time / 450) % 2 === 0) drawText('ENTER RETRY', cx, WELL_Y + 180, WHITE, { align: 'center' });
  }

  // ---------------------------------------------------------------------------------------------
  // Loop
  // ---------------------------------------------------------------------------------------------
  let last = performance.now();
  function frame(now) {
    const dt = Math.min(50, now - last);
    last = now;
    update(dt);
    render();
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  // Handy from the dev console: wordwell.grid, wordwell.piece, ...
  window.wordwell = {
    get state() { return state; },
    get grid() { return grid; },
    get piece() { return piece; },
    get score() { return score; },
    get gen() { return gen; },
    get tracker() { return tracker; },
    newGame,
  };
})();
