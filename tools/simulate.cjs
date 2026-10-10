// Greedy-bot simulation: how playable are the dealt letters? Compares uniform random letters
// with PieceGenerator. Re-run after tuning weights in js/logic.js. Run: node tools/simulate.cjs
globalThis.window = globalThis;
const P = require('path').join(__dirname, '../js/');
require(P + 'words.js');
const L = require(P + 'logic.js');
const dict = L.buildDictionary(window.WORDLIST);
const AZ = 'abcdefghijklmnopqrstuvwxyz'.split('');

function play(dealer, minLen, maxPieces, rng) {
  let grid = L.emptyGrid(); let words = 0, pieces = 0, longest = 0;
  while (pieces < maxPieces) {
    const { type, letters } = dealer(grid);
    let base = L.createPiece(type, letters);
    let best = null;
    for (let r = 0; r < 4; r++) {
      for (let x = -3; x < 10; x++) {
        const p = { ...base, x, y: 0 };
        if (L.collides(grid, p, 0, 0)) continue;
        while (!L.collides(grid, p, 0, 1)) p.y++;
        const g = grid.map(row => row.slice());
        p.cells.forEach(c => g[p.y + c.y][p.x + c.x] = { ch: c.ch });
        const found = L.findWords(g, dict, minLen);
        const letterCount = found.reduce((s, w) => s + w.word.length, 0);
        const top = g.findIndex(row => row.some(Boolean));
        const val = letterCount * 10 + top + rng() * 0.5;
        if (!best || val > best.val) best = { val, g };
      }
      base = { ...base, cells: L.rotateCells(base.cells, base.n, 1) };
    }
    pieces++;
    if (!best) return { pieces, words, over: true, longest };
    grid = best.g;
    for (;;) {
      const found = L.findWords(grid, dict, minLen);
      if (!found.length) break;
      words += found.length;
      for (const w of found) { longest = Math.max(longest, w.word.length); for (const c of w.cells) grid[c.y][c.x] = null; }
      L.applyGravity(grid);
    }
  }
  return { pieces, words, over: false, longest };
}

const TYPES = L.TYPES;
const dealers = {
  'uniform A-Z  ': rng => () => ({ type: TYPES[Math.floor(rng() * 7)], letters: [0, 1, 2, 3].map(() => AZ[Math.floor(rng() * 26)]) }),
  'generator    ': rng => { const gen = new L.PieceGenerator(dict, { rng }); return grid => gen.next(L.vowelRatio(grid)); },
};
for (const minLen of [3, 4]) {
  console.log(`--- min word length ${minLen}, greedy bot, 8 games x up to 400 pieces`);
  for (const [name, mk] of Object.entries(dealers)) {
    let words = 0, pieces = 0, overs = 0, longest = 0;
    for (let s = 1; s <= 8; s++) {
      const rng = L.makeRng(s * 101);
      const r = play(mk(rng), minLen, 400, rng);
      words += r.words; pieces += r.pieces; overs += r.over; longest = Math.max(longest, r.longest);
    }
    console.log(name, 'words/piece', (words / pieces).toFixed(2), ' avg pieces survived', (pieces / 8).toFixed(0), ' games lost', overs + '/8', ' longest word', longest);
  }
}
