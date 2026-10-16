/* Word Well — pure game logic (no DOM). Loaded by the browser game and by node scripts. */
(function (root) {
  'use strict';

  const COLS = 10;
  const ROWS = 20;

  // Letter frequencies: roughly Scrabble tile counts, with the awkward letters damped.
  // Q only ever appears as a single "QU" tile.
  const VOWEL_WEIGHTS = { a: 9, e: 12, i: 8, o: 8, u: 3 };
  const CONSONANT_WEIGHTS = {
    b: 2, c: 3, d: 4, f: 2, g: 3, h: 3, j: 0.4, k: 1, l: 4, m: 3, n: 6, p: 2,
    qu: 0.5, r: 6, s: 5, t: 6, v: 1.2, w: 2, x: 0.4, y: 2, z: 0.4,
  };
  const RARE = new Set(['j', 'k', 'qu', 'v', 'x', 'z']);
  const POINTS = {
    a: 1, b: 3, c: 3, d: 2, e: 1, f: 4, g: 2, h: 4, i: 1, j: 8, k: 5, l: 1, m: 3,
    n: 1, o: 1, p: 3, qu: 10, r: 1, s: 1, t: 1, u: 1, v: 4, w: 4, x: 8, y: 4, z: 10,
  };

  // Spawn orientation of each classic tetromino inside an n x n box.
  const SHAPES = {
    I: { n: 4, cells: [[0, 1], [1, 1], [2, 1], [3, 1]] },
    O: { n: 2, cells: [[0, 0], [1, 0], [0, 1], [1, 1]] },
    T: { n: 3, cells: [[1, 0], [0, 1], [1, 1], [2, 1]] },
    S: { n: 3, cells: [[1, 0], [2, 0], [0, 1], [1, 1]] },
    Z: { n: 3, cells: [[0, 0], [1, 0], [1, 1], [2, 1]] },
    J: { n: 3, cells: [[0, 0], [0, 1], [1, 1], [2, 1]] },
    L: { n: 3, cells: [[2, 0], [0, 1], [1, 1], [2, 1]] },
  };
  const TYPES = Object.keys(SHAPES);
  const KICKS = [[0, 0], [-1, 0], [1, 0], [-2, 0], [2, 0], [0, -1], [-1, -1], [1, -1]];

  // Target words: the dealer grows one out of board letters over one or two pieces, then leaves
  // room before the next.
  const TARGET_WINDOW = 3; // pieces you get after the last chunk lands
  const TARGET_GAP = 2; // plain pieces between one target's window and the next target
  const FIRST_TARGET = 3; // plain pieces before the first target
  const TARGET_BONUS = 3; // score multiplier for spelling the target

  // Hooks: the dealer letters a piece so it can turn letters already on the board into a longer word.
  const HOOK_MIN = 4; // shortest hook word
  const HOOK_MAX = 7; // longest hook word
  const HOOK_RATE = 0.9; // share of plain pieces that try to be a hook

  function isVowel(ch) {
    return ch === 'a' || ch === 'e' || ch === 'i' || ch === 'o' || ch === 'u';
  }

  function makeRng(seed) {
    let s = seed >>> 0;
    return function () {
      s = (s + 0x6d2b79f5) >>> 0;
      let t = Math.imul(s ^ (s >>> 15), 1 | s);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function shuffle(arr, rng) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  function pickWeighted(weights, rng) {
    let total = 0;
    for (const k in weights) total += weights[k];
    let r = rng() * total;
    let last;
    for (const k in weights) {
      last = k;
      r -= weights[k];
      if (r < 0) return k;
    }
    return last;
  }

  // words: valid answers (3+ letters). infixes: every 2-4 letter chunk that occurs inside a
  // word, used to check that a piece's letters can actually sit inside real words.
  // byPrefix/bySuffix: hook-length words (no Q, which only exists as the QU tile) keyed by
  // "length|prefix" and "length|suffix", for wordsMatching.
  function buildDictionary(text) {
    const words = new Set();
    const infixes = new Set();
    const byPrefix = new Map();
    const bySuffix = new Map();
    const add = (map, k, w) => { const list = map.get(k); if (list) list.push(w); else map.set(k, [w]); };
    let maxLen = 0;
    for (const raw of text.split(/\s+/)) {
      const w = raw.toLowerCase();
      if (w.length < 3 || !/^[a-z]+$/.test(w)) continue;
      words.add(w);
      if (w.length > maxLen) maxLen = w.length;
      for (let a = 0; a < w.length; a++) {
        for (let n = 2; n <= 4 && a + n <= w.length; n++) infixes.add(w.slice(a, a + n));
      }
      if (w.length < HOOK_MIN || w.length > HOOK_MAX || w.includes('q')) continue;
      for (let k = 1; k < w.length; k++) {
        add(byPrefix, w.length + '|' + w.slice(0, k), w);
        add(bySuffix, w.length + '|' + w.slice(w.length - k), w);
      }
    }
    return { words, infixes, maxLen, byPrefix, bySuffix };
  }

  // Hook-length words of exactly len letters that start with pre and end with suf (not both empty).
  function wordsMatching(dict, len, pre, suf) {
    if (!pre) return dict.bySuffix.get(len + '|' + suf) || [];
    const list = dict.byPrefix.get(len + '|' + pre) || [];
    return suf ? list.filter(w => w.endsWith(suf)) : list;
  }

  function emptyGrid(cols = COLS, rows = ROWS) {
    return Array.from({ length: rows }, () => new Array(cols).fill(null));
  }

  // target (optional): { word, idx, last } marks cells idx as reserved for the target word.
  function createPiece(type, letters, target) {
    const shape = SHAPES[type];
    const cells = shape.cells.map(([x, y], i) => {
      const c = { x, y, ch: letters[i] };
      if (target && target.idx.includes(i)) c.tgt = target.word;
      return c;
    });
    return { type, n: shape.n, x: 0, y: 0, cells, target };
  }

  // Letters ride along with their squares, so rotating re-arranges the reading order.
  function rotateCells(cells, n, dir) {
    return cells.map(c => (dir > 0
      ? { ...c, x: n - 1 - c.y, y: c.x }
      : { ...c, x: c.y, y: n - 1 - c.x }));
  }

  function collides(grid, piece, dx, dy, cells = piece.cells) {
    const rows = grid.length;
    const cols = grid[0].length;
    for (const c of cells) {
      const x = piece.x + c.x + dx;
      const y = piece.y + c.y + dy;
      if (x < 0 || x >= cols || y >= rows) return true;
      if (y >= 0 && grid[y][x]) return true;
    }
    return false;
  }

  function tryRotate(grid, piece, dir) {
    const cells = rotateCells(piece.cells, piece.n, dir);
    for (const [kx, ky] of KICKS) {
      if (!collides(grid, piece, kx, ky, cells)) return { x: piece.x + kx, y: piece.y + ky, cells };
    }
    return null;
  }

  // Searches every row (left to right) and column (top to bottom). Within one unbroken run of
  // tiles the longest words win and may not overlap; an across and a down word may share a tile.
  // A tile reserved for a target word (tile.tgt) only clears as part of a word containing that target.
  function findWords(grid, dict, minLen = 3) {
    const rows = grid.length;
    const cols = grid[0].length;
    const found = [];
    for (let y = 0; y < rows; y++) scanLine(cols, i => grid[y][i], i => ({ x: i, y }), 'h', dict, minLen, found);
    for (let x = 0; x < cols; x++) scanLine(rows, i => grid[i][x], i => ({ x, y: i }), 'v', dict, minLen, found);
    return found;
  }

  function scanLine(len, get, pos, dir, dict, minLen, found) {
    let s = 0;
    while (s < len) {
      if (!get(s)) { s++; continue; }
      let e = s;
      while (e < len && get(e)) e++;
      wordsInRun(s, e, get, pos, dir, dict, minLen, found);
      s = e;
    }
  }

  function wordsInRun(s, e, get, pos, dir, dict, minLen, found) {
    const cands = [];
    for (let a = s; a < e; a++) {
      let str = '';
      for (let b = a; b < e; b++) {
        str += get(b).ch;
        if (str.length > dict.maxLen) break;
        if (str.length >= minLen && dict.words.has(str) && respectsTargets(a, b, str, get)) cands.push({ a, b, str });
      }
    }
    if (!cands.length) return;
    cands.sort((p, q) => q.str.length - p.str.length || p.a - q.a);
    const taken = [];
    for (const c of cands) {
      if (taken.some(t => c.a <= t.b && t.a <= c.b)) continue;
      taken.push(c);
      const cells = [];
      for (let i = c.a; i <= c.b; i++) cells.push(pos(i));
      found.push({ word: c.str, dir, cells });
    }
  }

  function respectsTargets(a, b, str, get) {
    for (let i = a; i <= b; i++) {
      const t = get(i).tgt;
      if (t && !str.includes(t)) return false;
    }
    return true;
  }

  // Unlike classic Tetris, cleared squares leave holes, so every column settles on its own.
  function applyGravity(grid) {
    const rows = grid.length;
    const cols = grid[0].length;
    const moves = [];
    for (let x = 0; x < cols; x++) {
      let write = rows - 1;
      for (let y = rows - 1; y >= 0; y--) {
        const tile = grid[y][x];
        if (!tile) continue;
        if (y !== write) {
          grid[write][x] = tile;
          grid[y][x] = null;
          moves.push({ tile, x, fromY: y, toY: write });
        }
        write--;
      }
    }
    return moves;
  }

  function scoreWord(word, chain = 1) {
    let base = 0;
    for (let i = 0; i < word.length; i++) {
      if (word[i] === 'q' && word[i + 1] === 'u') { base += POINTS.qu; i++; } else base += POINTS[word[i]] || 0;
    }
    return base * 10 * Math.max(1, word.length - 2) * chain;
  }

  function vowelRatio(grid) {
    let tiles = 0;
    let vowels = 0;
    for (const row of grid) {
      for (const t of row) {
        if (!t) continue;
        tiles++;
        if (isVowel(t.ch)) vowels++;
      }
    }
    return tiles < 8 ? null : vowels / tiles;
  }

  // Every across/down run of 2+ letters inside a piece, read left-to-right / top-to-bottom. Runs that
  // touch a reserved target cell are left out: those letters can only ever form the target.
  function runsOf(cells) {
    const at = new Map(cells.map(c => [c.x + ',' + c.y, c]));
    const runs = [];
    const read = (x, y, dx, dy) => {
      let s = '';
      for (; at.has(x + ',' + y); x += dx, y += dy) {
        const c = at.get(x + ',' + y);
        if (c.tgt) return;
        s += c.ch;
      }
      runs.push(s);
    };
    for (const c of cells) {
      if (!at.has((c.x - 1) + ',' + c.y) && at.has((c.x + 1) + ',' + c.y)) read(c.x, c.y, 1, 0);
      if (!at.has(c.x + ',' + (c.y - 1)) && at.has(c.x + ',' + (c.y + 1))) read(c.x, c.y, 0, 1);
    }
    return runs;
  }

  // Every resting spot of a piece type dropped straight down, in rotation 0 (spawn) or 1 (one
  // clockwise turn): the two turns that keep a row's reading order. Cells keep their index i.
  function landings(grid, type) {
    const n = SHAPES[type].n;
    const out = [];
    let cells = SHAPES[type].cells.map(([x, y], i) => ({ x, y, i }));
    for (let rot = 0; rot < 2; rot++) {
      for (let x = -n; x < grid[0].length; x++) {
        const p = { x, y: -n, cells };
        if (collides(grid, p, 0, 0)) continue;
        while (!collides(grid, p, 0, 1)) p.y++;
        const at = cells.map(c => ({ i: c.i, x: p.x + c.x, y: p.y + c.y }));
        if (at.some(c => c.y < 0)) continue;
        out.push({ rot, x, y: p.y, cells: at });
      }
      cells = rotateCells(cells, n, 1);
    }
    return out;
  }

  // Unreserved board letters from (x, y) onwards in steps of (dx, dy), up to the first gap.
  function boardRun(grid, x, y, dx, dy) {
    const out = [];
    while (y >= 0 && y < grid.length && x >= 0 && x < grid[0].length) {
      const t = grid[y][x];
      if (!t || t.tgt) break;
      out.push({ x, y, ch: t.ch });
      x += dx;
      y += dy;
    }
    return out;
  }

  // The straight lines a landed piece makes: in each row and column it touches, its cells there
  // (always one unbroken segment, in reading order) and the board letters directly before and after.
  function segments(grid, land) {
    const at = new Map(land.cells.map(c => [c.x + ',' + c.y, c]));
    const out = [];
    for (const [dir, dx, dy] of [['h', 1, 0], ['v', 0, 1]]) {
      for (const c of land.cells) {
        if (at.has((c.x - dx) + ',' + (c.y - dy))) continue;
        const seg = [];
        for (let x = c.x, y = c.y; at.has(x + ',' + y); x += dx, y += dy) seg.push(at.get(x + ',' + y));
        const end = seg[seg.length - 1];
        out.push({
          dir, seg,
          before: boardRun(grid, c.x - dx, c.y - dy, -dx, -dy).reverse(),
          after: boardRun(grid, end.x + dx, end.y + dy, dx, dy),
        });
      }
    }
    return out;
  }

  // Hooks for a piece type: spots where one straight segment of the piece, with board letters before
  // and/or after it, would spell a HOOK_MIN..HOOK_MAX letter word. Each hook lists every word that fits;
  // seg holds the piece's cell indices in reading order, pre/suf the board letters used.
  function findHooks(grid, type, dict) {
    const hooks = [];
    for (const land of landings(grid, type)) {
      const at = new Set(land.cells.map(c => c.x + ',' + c.y));
      const holes = land.cells.filter(c => c.y + 1 < grid.length && !grid[c.y + 1][c.x] && !at.has(c.x + ',' + (c.y + 1))).length;
      for (const s of segments(grid, land)) {
        const B = s.before.length, A = s.after.length, m = s.seg.length;
        for (let i = 0; i <= B; i++) {
          for (let j = 0; j <= A; j++) {
            const len = i + m + j;
            if (i + j === 0 || len < HOOK_MIN || len > HOOK_MAX) continue;
            const pre = s.before.slice(B - i).map(t => t.ch).join('');
            const suf = s.after.slice(0, j).map(t => t.ch).join('');
            const words = wordsMatching(dict, len, pre, suf);
            if (words.length) {
              hooks.push({ rot: land.rot, x: land.x, y: land.y, dir: s.dir, pre, suf, len, board: i + j, holes, seg: s.seg.map(c => c.i), words });
            }
          }
        }
      }
    }
    return hooks;
  }

  // A copy of the grid with a dealt piece dropped at spot {rot (0|1), x, y}.
  function placeAt(grid, deal, spot) {
    let cells = createPiece(deal.type, deal.letters, deal.target).cells;
    if (spot.rot) cells = rotateCells(cells, SHAPES[deal.type].n, 1);
    const g = grid.map(row => row.slice());
    for (const c of cells) g[spot.y + c.y][spot.x + c.x] = c.tgt ? { ch: c.ch, tgt: c.tgt } : { ch: c.ch };
    return g;
  }

  // Every occupied cell in the row (across) or column (down) of a found word: what a target hit clears.
  function lineCells(grid, found) {
    const { x, y } = found.cells[0];
    const out = [];
    if (found.dir === 'h') {
      for (let i = 0; i < grid[0].length; i++) if (grid[y][i]) out.push({ x: i, y });
    } else {
      for (let i = 0; i < grid.length; i++) if (grid[i][x]) out.push({ x, y: i });
    }
    return out;
  }

  function pickIndex(weights, rng) {
    let total = 0;
    for (const w of weights) total += w;
    let r = rng() * total;
    for (let i = 0; i < weights.length; i++) {
      r -= weights[i];
      if (r < 0) return i;
    }
    return weights.length - 1;
  }

  // Among hooks of the chosen length band: longer words and more board letters used weigh more,
  // spots that bury empty cells much less.
  const hookWeight = h => (h.len - 3) * (h.len - 3) * (1 + h.board) / (1 + 3 * h.holes);

  // Deals tetrominoes from a 7-bag and letters them so they stay usable:
  //  - letters are drawn from weighted frequencies, with a vowel quota that leans against the board
  //    (a consonant-heavy stack gets more vowels, a vowel-heavy one fewer)
  //  - at most one rare letter (J K QU V X Z) per piece and no letter three times
  //  - every across/down run inside the piece must occur inside a real word ("TRYX" never appears)
  //  - a piece never arrives already spelling a word (no free clears)
  // Given the board, it also deals hooks (see hookPiece) and, with opts.targets (a word list),
  // target words that grow out of board letters (see planTarget).
  class PieceGenerator {
    constructor(dict, opts = {}) {
      this.dict = dict;
      this.rng = opts.rng || Math.random;
      this.minLen = opts.minLen || 3;
      this.hookRate = opts.hookRate == null ? HOOK_RATE : opts.hookRate;
      this.targets = opts.targets && opts.targets.length ? opts.targets : null;
      this.targetsBy = new Map(); // "p|st" / "s|ing" -> target words starting / ending with those letters
      for (const w of this.targets || []) {
        for (let a = 1; a <= 3; a++) {
          for (const k of ['p|' + w.slice(0, a), 's|' + w.slice(w.length - a)]) {
            if (!this.targetsBy.has(k)) this.targetsBy.set(k, []);
            this.targetsBy.get(k).push(w);
          }
        }
      }
      this.bag = [];
      this.pending = null; // the peeked plain shape, lettered by the next call to next()
      this.plan = []; // a target's second piece, dealt next
      this.untilTarget = FIRST_TARGET;
    }

    nextType() {
      if (!this.bag.length) this.bag = shuffle(TYPES.slice(), this.rng);
      return this.bag.pop();
    }

    // The shape of the piece the next call to next() deals: what the NEXT box shows.
    peekType() {
      if (this.plan.length) return this.plan[0].type;
      if (!this.pending) this.pending = this.nextType();
      return this.pending;
    }

    // Letters the peeked piece for the board as it is now, the moment it spawns. A due target that
    // finds no anchor for this shape is tried again on the following piece.
    next(grid = null) {
      if (this.plan.length) return this.plan.shift();
      const type = this.peekType();
      this.pending = null;
      const ratio = grid ? vowelRatio(grid) : null;
      if (this.targets && grid && this.untilTarget-- <= 0) {
        const plan = this.planTarget(grid, ratio, type);
        if (plan) {
          this.plan = plan.slice(1);
          this.untilTarget = TARGET_WINDOW + TARGET_GAP;
          return plan[0];
        }
      }
      if (grid && this.rng() < this.hookRate) {
        const hooked = this.hookPiece(type, grid, ratio);
        if (hooked) return hooked;
      }
      return { type, letters: this.lettersFor(type, ratio) };
    }

    // The live target was spelled before its second piece spawned: that piece keeps the shape NEXT
    // shows but arrives as plain letters.
    targetEnded() {
      for (const d of this.plan) delete d.target;
    }

    // Letters this piece so one of its straight segments, dropped at a hook spot, spells a word with
    // the board letters there. 5+ letter hooks win whenever there are any. Returns
    // { type, letters, hook: { word, rot, x, y } }, or null when no hook works.
    hookPiece(type, grid, ratio) {
      let hooks = findHooks(grid, type, this.dict);
      const long = hooks.filter(h => h.len >= 5);
      if (long.length) hooks = long;
      for (let tries = 0; tries < 8 && hooks.length; tries++) {
        const k = pickIndex(hooks.map(hookWeight), this.rng);
        const h = hooks[k];
        const word = h.words[Math.floor(this.rng() * h.words.length)];
        const mid = word.slice(h.pre.length, h.len - h.suf.length);
        const letters = this.fillAround(type, h.seg.map((i, n) => [i, mid[n]]), ratio);
        if (letters) {
          const deal = { type, letters, hook: { word, rot: h.rot, x: h.x, y: h.y } };
          if (this.spells(placeAt(grid, deal, deal.hook), word)) return deal;
        }
        hooks.splice(k, 1);
      }
      return null;
    }

    // Does the board spell word (or a longer word containing it)?
    spells(grid, word) {
      return findWords(grid, this.dict, this.minLen).some(w => w.word.includes(word));
    }

    // Letters for a piece whose cells in fixed ([[index, letter], ...]) are already decided; the rest
    // are drawn as usual and the whole piece must pass the usual checks. Null if no draw passes.
    fillAround(type, fixed, ratio, target) {
      for (let attempt = 0; attempt < 60; attempt++) {
        const letters = this.drawLetters(this.vowelCount(ratio));
        if (!letters) continue;
        for (const [i, ch] of fixed) letters[i] = ch;
        if (this.problems(type, letters, target) === 0) return letters;
      }
      return null;
    }

    // Picks a target word that grows out of 1-3 letters already on the board (the anchor) and deals
    // the rest over one or two pieces, each holding one straight segment of it:
    //  - across, the anchor is the word's start (new letters to its right) or its end (to its left)
    //  - down, new letters can only land on top, so the anchor is the word's end
    // The first piece has the shape NEXT already showed; it touches the anchor. A second piece, when
    // needed, picks its own shape. Every chunk is checked to land where planned and the finished word
    // to fire. Returns the deals, or null when nothing fits yet.
    planTarget(grid, ratio, type) {
      const cands = [];
      for (const land of landings(grid, type)) {
        for (const s of segments(grid, land)) {
          if (s.seg.length < 2) continue;
          for (const start of [true, false]) {
            const run = start ? s.before : s.after;
            if ((start ? s.after : s.before).length) continue; // the far side stays open
            for (let a = 1; a <= Math.min(3, run.length); a++) {
              const anchor = start ? run.slice(run.length - a) : run.slice(0, a);
              const key = (start ? 'p|' : 's|') + anchor.map(t => t.ch).join('');
              for (const word of this.targetsBy.get(key) || []) {
                const rest = word.length - a - s.seg.length;
                if (rest === 0 || (rest >= 2 && rest <= 4)) cands.push({ type, land, s, start, anchor, word, rest });
              }
            }
          }
        }
      }
      // Across first: stacking down onto a column is always possible, so it would crowd across out.
      // Within each, one piece when that's enough: a second piece is more of a chore.
      const tries = [];
      for (const dir of ['h', 'v']) {
        for (const one of [true, false]) {
          tries.push(...shuffle(cands.filter(c => c.s.dir === dir && (c.rest === 0) === one), this.rng).slice(0, 10));
        }
      }
      for (const c of tries) {
        const plan = this.buildTarget(grid, ratio, c);
        if (plan) return plan;
      }
      return null;
    }

    buildTarget(grid, ratio, { type, land, s, start, anchor, word }) {
      const a = anchor.length, m = s.seg.length, rest = word.length - a - m;
      const mid = start ? word.slice(a, a + m) : word.slice(rest, rest + m);
      const far = start ? word.slice(a + m) : word.slice(0, rest);
      const spot = { rot: land.rot, x: land.x, y: land.y };
      const target = { word, idx: s.seg.map(c => c.i), last: rest === 0, spot, anchor: anchor.map(t => ({ x: t.x, y: t.y })) };
      const letters = this.fillAround(type, s.seg.map((c, k) => [c.i, mid[k]]), ratio, target);
      if (!letters) return null;
      const first = { type, letters, target };
      const reserved = grid.map(row => row.slice());
      for (const t of anchor) reserved[t.y][t.x] = { ch: t.ch, tgt: word };
      const board = placeAt(reserved, first, spot);
      if (!rest) return this.spells(board, word) ? [first] : null;
      // The second chunk's segment must start right where the word continues.
      const [dx, dy] = s.dir === 'h' ? [1, 0] : [0, 1];
      const from = start ? s.seg[m - 1] : s.seg[0];
      const want = start ? { x: from.x + dx, y: from.y + dy } : { x: from.x - rest * dx, y: from.y - rest * dy };
      for (const type2 of shuffle(TYPES.slice(), this.rng)) {
        for (const land2 of landings(board, type2)) {
          for (const s2 of segments(board, land2)) {
            if (s2.dir !== s.dir || s2.seg.length !== rest || s2.seg[0].x !== want.x || s2.seg[0].y !== want.y) continue;
            const target2 = { word, idx: s2.seg.map(c => c.i), last: true, spot: { rot: land2.rot, x: land2.x, y: land2.y } };
            const letters2 = this.fillAround(type2, s2.seg.map((c, k) => [c.i, far[k]]), ratio, target2);
            if (!letters2) continue;
            const second = { type: type2, letters: letters2, target: target2 };
            if (this.spells(placeAt(board, second, target2.spot), word)) return [first, second];
          }
        }
      }
      return null;
    }

    vowelCount(boardVowelRatio) {
      let e = 1.6; // ~40% vowels, like English text
      if (boardVowelRatio != null) e = Math.min(2.6, Math.max(1, 1.6 + (0.4 - boardVowelRatio) * 4));
      const k = Math.floor(e);
      return k + (this.rng() < e - k ? 1 : 0);
    }

    drawLetters(vowels) {
      const vowelSlots = shuffle([0, 1, 2, 3], this.rng).slice(0, vowels);
      const letters = [];
      let rare = 0;
      for (let i = 0; i < 4; i++) {
        const ch = pickWeighted(vowelSlots.includes(i) ? VOWEL_WEIGHTS : CONSONANT_WEIGHTS, this.rng);
        if (RARE.has(ch) && ++rare > 1) return null;
        if (letters.filter(l => l === ch).length >= 2) return null;
        letters.push(ch);
      }
      return letters;
    }

    readable(s) {
      if (s.length <= 4) return this.dict.infixes.has(s);
      for (let i = 0; i + 4 <= s.length; i++) {
        if (!this.dict.infixes.has(s.slice(i, i + 4))) return false;
      }
      return true;
    }

    problems(type, letters, target) {
      let bad = 0;
      for (const run of runsOf(createPiece(type, letters, target).cells)) {
        if (!this.readable(run)) bad += 2;
        else if (run.length >= this.minLen && this.dict.words.has(run)) bad += 1;
      }
      return bad;
    }

    lettersFor(type, boardVowelRatio) {
      let best = null;
      let bestBad = Infinity;
      for (let attempt = 0; attempt < 400; attempt++) {
        const letters = this.drawLetters(this.vowelCount(boardVowelRatio));
        if (!letters) continue;
        const bad = this.problems(type, letters);
        if (bad === 0) return letters;
        if (bad < bestBad) { best = letters; bestBad = bad; }
      }
      return best || ['s', 't', 'e', 'a'];
    }
  }

  // Follows the live target through a game: announce() when its first piece is dealt, placed() on
  // every lock, hit() on every resolve pass and endTurn() once the board has settled. The target
  // expires TARGET_WINDOW pieces after its last chunk lands; when it ends (hit or expired) its leftover
  // tiles, anchor included, become ordinary letters.
  class TargetTracker {
    constructor(window = TARGET_WINDOW) {
      this.window = window;
      this.word = null;
      this.left = Infinity; // pieces left, counted once the last chunk is down
      this.turn = undefined; // target info of the piece placed this turn (null: a plain piece)
    }

    // The target goes live as soon as its first piece is dealt: its anchor tiles are reserved.
    announce(grid, target) {
      this.word = target.word;
      this.left = Infinity;
      for (const a of target.anchor) grid[a.y][a.x].tgt = target.word;
    }

    placed(info) {
      this.turn = info || null;
    }

    // The found words that spell the live target (they score the bonus). A hit ends the target.
    hit(grid, found) {
      const word = this.word;
      if (!word) return [];
      const hits = found.filter(w => w.word.includes(word) && w.cells.some(c => grid[c.y][c.x].tgt === word));
      if (hits.length) this.end(grid);
      return hits;
    }

    // Returns the target word if it just expired. Only the first call after a placed() counts.
    endTurn(grid) {
      const info = this.turn;
      this.turn = undefined;
      if (info === undefined) return null;
      if (info && info.word === this.word) {
        if (info.last) this.left = this.window;
        return null;
      }
      if (info) { // a chunk of a target that already ended: its letters are free
        this.end(grid);
        return null;
      }
      if (!this.word || --this.left > 0) return null;
      const word = this.word;
      this.end(grid);
      return word;
    }

    end(grid) {
      this.word = null;
      this.left = Infinity;
      for (const row of grid) for (const t of row) if (t && t.tgt) delete t.tgt;
    }
  }

  const api = {
    COLS, ROWS, SHAPES, TYPES, POINTS, TARGET_WINDOW, TARGET_BONUS, HOOK_MIN, HOOK_MAX, HOOK_RATE,
    isVowel, makeRng, buildDictionary, wordsMatching, emptyGrid, createPiece, rotateCells, collides, tryRotate,
    findWords, applyGravity, scoreWord, vowelRatio, runsOf, landings, segments, findHooks, placeAt, lineCells,
    PieceGenerator, TargetTracker,
  };
  root.WordWellLogic = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
