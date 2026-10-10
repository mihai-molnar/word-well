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
  function buildDictionary(text) {
    const words = new Set();
    const infixes = new Set();
    let maxLen = 0;
    for (const raw of text.split(/\s+/)) {
      const w = raw.toLowerCase();
      if (w.length < 3 || !/^[a-z]+$/.test(w)) continue;
      words.add(w);
      if (w.length > maxLen) maxLen = w.length;
      for (let a = 0; a < w.length; a++) {
        for (let n = 2; n <= 4 && a + n <= w.length; n++) infixes.add(w.slice(a, a + n));
      }
    }
    return { words, infixes, maxLen };
  }

  function emptyGrid(cols = COLS, rows = ROWS) {
    return Array.from({ length: rows }, () => new Array(cols).fill(null));
  }

  function createPiece(type, letters) {
    const shape = SHAPES[type];
    const cells = shape.cells.map(([x, y], i) => ({ x, y, ch: letters[i] }));
    return { type, n: shape.n, x: 0, y: 0, cells };
  }

  // Letters ride along with their squares, so rotating re-arranges the reading order.
  function rotateCells(cells, n, dir) {
    return cells.map(c => (dir > 0
      ? { x: n - 1 - c.y, y: c.x, ch: c.ch }
      : { x: c.y, y: n - 1 - c.x, ch: c.ch }));
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
        if (str.length >= minLen && dict.words.has(str)) cands.push({ a, b, str });
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

  // Every across/down run of 2+ letters inside a piece, read left-to-right / top-to-bottom.
  function runsOf(cells) {
    const at = new Map(cells.map(c => [c.x + ',' + c.y, c.ch]));
    const runs = [];
    for (const c of cells) {
      if (!at.has((c.x - 1) + ',' + c.y) && at.has((c.x + 1) + ',' + c.y)) {
        let s = '';
        for (let x = c.x; at.has(x + ',' + c.y); x++) s += at.get(x + ',' + c.y);
        runs.push(s);
      }
      if (!at.has(c.x + ',' + (c.y - 1)) && at.has(c.x + ',' + (c.y + 1))) {
        let s = '';
        for (let y = c.y; at.has(c.x + ',' + y); y++) s += at.get(c.x + ',' + y);
        runs.push(s);
      }
    }
    return runs;
  }

  // Deals tetrominoes from a 7-bag and letters them so they stay usable:
  //  - letters are drawn from weighted frequencies, with a vowel quota that leans against the board
  //    (a consonant-heavy stack gets more vowels, a vowel-heavy one fewer)
  //  - at most one rare letter (J K QU V X Z) per piece and no letter three times
  //  - every across/down run inside the piece must occur inside a real word ("TRYX" never appears)
  //  - a piece never arrives already spelling a word (no free clears)
  class PieceGenerator {
    constructor(dict, opts = {}) {
      this.dict = dict;
      this.rng = opts.rng || Math.random;
      this.minLen = opts.minLen || 3;
      this.bag = [];
    }

    nextType() {
      if (!this.bag.length) this.bag = shuffle(TYPES.slice(), this.rng);
      return this.bag.pop();
    }

    next(boardVowelRatio = null) {
      const type = this.nextType();
      return { type, letters: this.lettersFor(type, boardVowelRatio) };
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

    problems(type, letters) {
      let bad = 0;
      for (const run of runsOf(createPiece(type, letters).cells)) {
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

  const api = {
    COLS, ROWS, SHAPES, TYPES, POINTS,
    isVowel, makeRng, buildDictionary, emptyGrid, createPiece, rotateCells, collides, tryRotate,
    findWords, applyGravity, scoreWord, vowelRatio, runsOf, PieceGenerator,
  };
  root.WordWellLogic = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
