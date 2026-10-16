/* Word Well pixel icons: 16x16 card art, 9x9 HUD art, 7x7 special tile marks.
   Rows are strings over '.', 'w' (white) and 'r' (red). */
(function (root) {
  'use strict';

  const FONT = root.WordWellFont || (typeof require === 'function' ? require('./font.js') : null);

  // A small grid to draw on; rows() gives the strings.
  function grid(n) {
    const a = Array.from({ length: n }, () => Array(n).fill('.'));
    const g = {
      px(c, ...pts) { for (const [x, y] of pts) if (x >= 0 && y >= 0 && x < n && y < n) a[y][x] = c; return g; },
      rect(c, x, y, w, h) { for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) g.px(c, [x + i, y + j]); return g; },
      line(c, x0, y0, x1, y1) {
        const steps = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0));
        for (let i = 0; i <= steps; i++) g.px(c, [Math.round(x0 + (x1 - x0) * i / (steps || 1)), Math.round(y0 + (y1 - y0) * i / (steps || 1))]);
        return g;
      },
      // outlined box with the game's tile corners cut and a dotted lip
      tile(c, x, y, s, lip) {
        for (let i = 1; i < s; i++) g.px(c, [x + i, y], [x + i, y + s], [x, y + i], [x + s, y + i]);
        if (lip) for (let i = 2; i < s - 1; i += 2) g.px(c, [x + i, y + s - 1]);
        return g;
      },
      glyph(c, ch, x, y) {
        FONT.glyphs[ch].forEach((r, j) => [...r].forEach((p, i) => { if (p === '#') g.px(c, [x + i, y + j]); }));
        return g;
      },
      rows() { return a.map(r => r.join('')); },
    };
    return g;
  }

  // Fixed art, padded on the right and bottom to n x n.
  const pad = (rows, n) => { const o = rows.map(r => r + '.'.repeat(n - r.length)); while (o.length < n) o.push('.'.repeat(n)); return o; };
  const S16 = (...rows) => pad(rows, 16);

  const card = {};

  // PACE
  card.feather = (() => {
    const g = grid(16);
    for (let x = 2; x <= 14; x++) for (let y = 1; y <= 14; y++) {
      const d = x + y - 16, t = x - 2; // d: across the leaf, t: along it
      const hw = Math.min(t, 12 - t) * 0.5 + 0.5;
      if (Math.abs(d) <= hw && t >= 2) g.px(Math.abs(d) <= 0 ? 'r' : 'w', [x, y]);
    }
    g.line('r', 2, 14, 4, 12).line('r', 12, 3, 5, 10);
    // hollow the vane so it reads as a feather, not a blob
    return g.px('.', [8, 5], [9, 6], [10, 7], [7, 8], [6, 9], [11, 5]).rows();
  })();
  card.sticky = (() => {
    const g = grid(16);
    g.rect('w', 3, 0, 10, 2).rect('w', 3, 14, 10, 2);
    for (let k = 0; k < 6; k++) { g.px('w', [3 + k, 2 + k], [12 - k, 2 + k]); g.px('w', [3 + k, 13 - k], [12 - k, 13 - k]); }
    g.rect('r', 5, 3, 6, 1).rect('r', 6, 4, 4, 1).rect('r', 7, 5, 2, 1).rect('r', 7, 6, 2, 2);
    g.rect('r', 5, 12, 6, 1).rect('r', 6, 11, 4, 1).rect('r', 7, 10, 2, 1).rect('r', 7, 8, 2, 1);
    return g.rows();
  })();
  card.daredevil = S16(
    '.......r........', '......rr........', '.....rrr....r...', '.....rrrr..rr...', '....rrrrrr.rr...',
    '....rrrrrrrrrr..', '...rrrrrrrrrrr..', '...rrrwwrrrrrr..', '..rrrwwwwrrrrr..', '..rrrwwwwwrrrr..',
    '..rrrwwwwwrrrr..', '..rrrrwwwwrrrr..', '...rrrrwwrrrr...', '....rrrrrrrr....', '.....rrrrrr.....');

  // WORDS
  card.mirror = (() => {
    const g = grid(16);
    for (let y = 0; y < 16; y += 2) g.px('w', [7, y], [8, y]);
    g.glyph('w', 'R', 1, 4);
    FONT.glyphs.R.forEach((r, j) => [...r].forEach((p, i) => { if (p === '#') g.px('r', [14 - i, 4 + j]); }));
    return g.rect('w', 1, 12, 5, 1).rect('r', 10, 12, 5, 1).rows();
  })();
  card.shortfuse = (() => {
    const g = grid(16);
    g.rect('w', 2, 13, 5, 3).px('.', [3, 14]);
    g.px('w', [4, 12], [4, 11], [5, 10], [6, 9], [6, 8], [7, 7], [8, 6], [8, 5]);
    g.px('r', [10, 1], [10, 2], [10, 3], [8, 3], [9, 3], [11, 3], [12, 3], [10, 4], [10, 5], [9, 2], [11, 2], [9, 4], [11, 4], [14, 0], [1, 6]);
    return g.px('w', [10, 3]).rows();
  })();
  card.purist = S16(
    '................', '....wwwwwwww....', '...w.rr..rr.w...', '..w..rr..rr..w..', '.wwwwwwwwwwwwww.',
    '..w...rrrr...w..', '...w..rrrr..w...', '....w..rr..w....', '.....w.rr.w.....', '......w..w......',
    '.......ww.......');

  // BLAST
  card.crossfire = (() => {
    const g = grid(16);
    g.tile('w', 3, 3, 9).px('.', [3, 3], [12, 3], [3, 12], [12, 12]);
    g.rect('r', 7, 0, 2, 3).rect('r', 7, 13, 2, 3).rect('r', 0, 7, 3, 2).rect('r', 13, 7, 3, 2).rect('r', 7, 7, 2, 2);
    return g.rows();
  })();
  card.sinkhole = (() => {
    const g = grid(16);
    for (const y of [1, 5]) { g.rect('w', 0, y, 16, 3); for (let x = (y === 1 ? 4 : 8); x < 16; x += 8) g.rect('.', x, y + 1, 1, 2); }
    g.rect('r', 0, 9, 4, 2).rect('r', 12, 9, 4, 2);
    g.rect('r', 7, 9, 2, 5).px('r', [5, 12], [6, 13], [9, 13], [10, 12], [6, 12], [9, 12]).rect('r', 6, 14, 4, 1);
    return g.rows();
  })();
  card.quake = (() => {
    const g = grid(16);
    g.px('r', [9, 0], [8, 1], [7, 2], [6, 3], [7, 4], [8, 5], [9, 6], [8, 7], [7, 8], [8, 9], [9, 10], [8, 11], [9, 12], [8, 13]);
    g.px('r', [10, 0], [9, 1], [8, 2], [7, 3], [8, 4], [9, 5], [10, 6], [9, 7], [8, 8], [9, 9], [10, 10], [9, 11]);
    g.rect('w', 0, 11, 7, 2).rect('w', 11, 11, 5, 2).rect('w', 0, 14, 5, 1).rect('w', 12, 14, 4, 1);
    g.px('w', [1, 4], [2, 4], [1, 7], [2, 7], [13, 4], [14, 4], [13, 7], [14, 7]);
    return g.rows();
  })();

  // GEAR
  card.packrat = (() => {
    const g = grid(16);
    g.rect('w', 2, 4, 12, 1).rect('w', 2, 14, 12, 1).rect('w', 2, 4, 1, 11).rect('w', 13, 4, 1, 11).rect('w', 2, 8, 12, 1);
    g.rect('w', 3, 2, 10, 1).px('w', [2, 3], [13, 3]);
    g.rect('r', 6, 7, 4, 4).rect('.', 7, 9, 2, 1);
    g.px('r', [0, 1], [15, 1], [1, 2], [14, 2]);
    return g.rows();
  })();
  card.bigbang = (() => {
    const g = grid(16);
    for (const [dx, dy] of [[0, -1], [0, 1], [-1, 0], [1, 0], [-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      for (const [ox, oy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) {
        const sx = 7 + ox + (dx > 0 ? 0 : 0), sy = 7 + oy;
        const reach = dx && dy ? 5 : 7;
        for (let k = 3; k <= reach; k++) g.px('r', [sx + dx * k, sy + dy * k]);
      }
    }
    g.rect('w', 5, 5, 6, 6).rect('r', 7, 7, 2, 2);
    return g.rows();
  })();
  card.joker = (() => {
    const g = grid(16);
    g.rect('r', 1, 0, 2, 2).rect('r', 7, 0, 2, 2).rect('r', 13, 0, 2, 2);
    g.line('w', 2, 2, 4, 10).line('w', 3, 2, 5, 10).line('w', 7, 2, 7, 10).line('w', 8, 2, 8, 10).line('w', 13, 2, 11, 10).line('w', 12, 2, 10, 10);
    g.rect('w', 3, 11, 10, 4).rect('r', 4, 12, 8, 2).px('.', [6, 12], [8, 12], [10, 12], [7, 13], [9, 13], [11, 13]);
    return g.rows();
  })();

  // SCORE
  card.stretch = S16(
    '................', '................', '................',
    '..r..........r..', '.rr..........rr.', 'rrrrrrrrrrrrrrrr', '.rr..........rr.', '..r..........r..',
    '................',
    'wwwwwwwwwwwwwwww', 'w..w..w..w..w..w', 'w.ww.ww.ww.ww.ww', 'w..w..w..w..w..w', 'wwwwwwwwwwwwwwww');
  card.aftershock = S16(
    '.........rrrrr..', '..w.....rrrrr...', '.w.....rrrrr....', '......rrrrr.....', '.....rrrrr......',
    '....rrrrrrrrr...', '...rrrrrrrrr....', '.......rrrr.....', '......rrrr......', '.....rrr........',
    '....rrr.....w...', '...rr......w....', '..rr........w...', '..r..........w..');
  card.scrabbler = (() => {
    const g = grid(16);
    g.tile('w', 1, 4, 10, true).glyph('r', 'Z', 4, 6);
    g.px('r', [13, 0], [13, 1], [11, 2], [12, 2], [14, 2], [15, 2], [13, 3], [13, 4]);
    return g.rows();
  })();

  // ITEMS
  card.bomb = S16(
    '...........r.r..', '............r...', '...........r.r..', '..........w.....', '.........w......',
    '.......rrrr.....', '.....rrrrrrrr...', '....rrrrrrrrrr..', '...rrwwrrrrrrrr.', '...rwwrrrrrrrrr.',
    '...rwrrrrrrrrrr.', '...rrrrrrrrrrrr.', '....rrrrrrrrrr..', '.....rrrrrrrr...', '.......rrrr.....');
  card.wild = (() => {
    const g = grid(16);
    g.tile('w', 1, 1, 13, true).glyph('r', '?', 5, 4);
    return g.px('r', [12, 3], [12, 5], [11, 4], [13, 4]).rows();
  })();
  card.reroll = (() => {
    const g = grid(16);
    g.tile('w', 1, 1, 13, true);
    for (const [x, y] of [[4, 4], [10, 4], [7, 7], [4, 10], [10, 10]]) g.rect('r', x, y, 2, 2);
    return g.rows();
  })();
  card.drill = (() => {
    const g = grid(16);
    g.rect('w', 4, 0, 8, 1).rect('w', 4, 0, 1, 3).rect('w', 11, 0, 1, 3).rect('w', 4, 2, 8, 1);
    for (let y = 3; y <= 12; y++) {
      const hw = Math.max(0, 4 - Math.floor((y - 3) * 0.45));
      g.px('w', [8 - hw - 1, y], [7 + hw + 1, y]);
      for (let x = 8 - hw; x <= 7 + hw; x++) g.px((x + y) % 4 < 2 ? 'r' : 'w', [x, y]);
    }
    g.px('w', [7, 13], [8, 13]).px('r', [7, 14], [8, 14], [7, 15], [8, 15]);
    return g.rows();
  })();
  card.freeze = (() => {
    const g = grid(16);
    g.rect('w', 7, 0, 2, 16).rect('w', 0, 7, 16, 2);
    for (let i = 1; i <= 6; i++) g.px('w', [i + 1, i + 1], [14 - i, i + 1], [i + 1, 14 - i], [14 - i, 14 - i]);
    g.rect('.', 7, 3, 2, 1).px('w', [5, 3], [10, 3], [5, 12], [10, 12], [3, 5], [3, 10], [12, 5], [12, 10]);
    g.rect('r', 6, 6, 4, 4).rect('.', 7, 7, 2, 2);
    return g.rows();
  })();
  card.ibeam = (() => {
    const g = grid(16);
    g.rect('w', 0, 2, 16, 2).rect('w', 0, 12, 16, 2);
    for (let i = 0; i < 4; i++) g.tile('w', i * 4, 5, 4).rect('r', i * 4 + 1, 6, 2, 2).rect('w', 0, 5, 0, 0);
    return g.px('w', [3, 5]).rows();
  })();
  card.beacon = (() => {
    const g = grid(16);
    g.rect('r', 7, 3, 2, 3).rect('w', 5, 2, 6, 1);
    g.rect('w', 6, 6, 4, 1).rect('w', 6, 6, 1, 8).rect('w', 9, 6, 1, 8).rect('w', 7, 9, 2, 1).rect('w', 4, 14, 8, 2);
    g.px('r', [0, 3], [1, 3], [2, 3], [0, 5], [1, 5], [13, 3], [14, 3], [15, 3], [14, 5], [15, 5]);
    g.px('r', [2, 0], [3, 1], [4, 2], [13, 0], [12, 1], [11, 2], [3, 5], [4, 4], [12, 4], [11, 4]);
    return g.rows();
  })();

  const hud = {
    bomb: ['.......r.', '......w.r', '.....w...', '..rrrr...', '.rrrrrr..', 'rwwrrrrr.', 'rwrrrrrr.', 'rrrrrrrr.', '.rrrrrr..'],
    wild: (() => {
      const g = grid(9);
      g.rect('w', 1, 0, 7, 1).rect('w', 1, 8, 7, 1).rect('w', 0, 1, 1, 7).rect('w', 8, 1, 1, 7);
      return g.glyph('r', '?', 2, 1).rows();
    })(),
    reroll: ['.wwwwwww.', 'w.......w', 'w.r...r.w', 'w.......w', 'w...r...w', 'w.......w', 'w.r...r.w', 'w.......w', '.wwwwwww.'],
    drill: ['.wwwwwww.', '.wrwrwrw.', '..wrwrw..', '..rwrwr..', '...wrw...', '...rwr...', '....w....', '....r....', '....r....'],
    freeze: ['....w....', '.w..w..w.', '..w.w.w..', '...www...', 'wwwwrwwww', '...www...', '..w.w.w..', '.w..w..w.', '....w....'],
    ibeam: ['wwwwwwwww', '.........', 'wwwwwwwww', 'wrwwrwwrw', 'wrwwrwwrw', 'wwwwwwwww', '.........', 'wwwwwwwww', '.........'],
    beacon: ['....r....', 'r..rrr..r', '.r.www.r.', '...www...', '...w.w...', '...www...', '..w...w..', '..wwwww..', '.wwwwwww.'],
  };

  const tile = {
    bomb: ['......r', '.....w.', '..rrr..', '.rrrrr.', 'rwrrrrr', 'rrrrrrr', '.rrrrr.'],
    stone: ['wwww.ww', 'wwww.ww', '.......', 'ww.wwww', 'ww.wwww', '.......', 'wwwww.w'],
    drill: ['wwwwwww', '.wrwrw.', '..wrw..', '..rwr..', '...w...', '...r...', '...r...'],
  };

  const api = { card, hud, tile };
  root.WordWellIcons = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
