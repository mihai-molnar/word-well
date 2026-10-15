// Greedy-bot simulation: how playable are the dealt letters? Compares uniform random letters
// with PieceGenerator, with and without target words. Re-run after tuning weights or target rules
// in js/logic.js. Run: node tools/simulate.cjs
globalThis.window = globalThis;
const P = require('path').join(__dirname, '../js/');
require(P + 'words.js');
const L = require(P + 'logic.js');
const dict = L.buildDictionary(window.WORDLIST);
const TARGETS = window.TARGETS.split(' ');
const AZ = 'abcdefghijklmnopqrstuvwxyz'.split('');

// Every resting position of a piece: the grid with it placed (no clears yet).
function placements(grid, deal) {
  const out = [];
  let base = L.createPiece(deal.type, deal.letters, deal.target);
  for (let r = 0; r < 4; r++) {
    for (let x = -3; x < 10; x++) {
      const p = { ...base, x, y: 0 };
      if (L.collides(grid, p, 0, 0)) continue;
      while (!L.collides(grid, p, 0, 1)) p.y++;
      const g = grid.map(row => row.slice());
      p.cells.forEach(c => { g[p.y + c.y][p.x + c.x] = c.tgt ? { ch: c.ch, tgt: c.tgt } : { ch: c.ch }; });
      out.push(g);
    }
    base = { ...base, cells: L.rotateCells(base.cells, base.n, 1) };
  }
  return out;
}

// Letters cleared (target words count TARGET_BONUS times) plus a small reward for a low stack.
function value(g, minLen, target, rng) {
  const letters = L.findWords(g, dict, minLen)
    .reduce((s, w) => s + w.word.length * (target && w.word.includes(target) ? L.TARGET_BONUS : 1), 0);
  return letters * 10 + g.findIndex(row => row.some(Boolean)) + rng() * 0.5;
}

// One-ply greedy, except for a target's first chunk: then it also tries every spot for the
// second chunk (which the NEXT preview shows) and keeps the pair that scores best.
function choose(grid, deal, upcoming, minLen, target, rng) {
  let best = null;
  for (const g of placements(grid, deal)) {
    let val = value(g, minLen, target, rng);
    if (deal.target && !deal.target.last && upcoming) {
      let follow = 0;
      for (const g2 of placements(g, upcoming)) follow = Math.max(follow, value(g2, minLen, deal.target.word, rng));
      val += follow;
    }
    if (!best || val > best.val) best = { val, g };
  }
  return best && best.g;
}

function play(dealer, minLen, maxPieces, rng, stats) {
  let grid = L.emptyGrid();
  let pieces = 0;
  const tracker = new L.TargetTracker();
  let upcoming = dealer(grid);
  while (pieces < maxPieces) {
    const deal = upcoming;
    upcoming = dealer(grid);
    const g = choose(grid, deal, upcoming, minLen, tracker.word || (deal.target && deal.target.word), rng);
    pieces++;
    if (!g) return { pieces, over: true };
    grid = g;
    tracker.placed(deal.target);
    if (deal.target && deal.target.last) stats.targets++;
    for (;;) {
      const found = L.findWords(grid, dict, minLen);
      if (!found.length) {
        if (tracker.endTurn(grid)) continue; // expired: its letters are free now, look again
        break;
      }
      stats.hits += tracker.hit(grid, found).length ? 1 : 0;
      for (const w of found) {
        stats.lens[Math.min(6, w.word.length)]++;
        stats.words++;
        for (const c of w.cells) grid[c.y][c.x] = null;
      }
      L.applyGravity(grid);
    }
  }
  return { pieces, over: false };
}

const TYPES = L.TYPES;
const dealers = {
  'uniform A-Z      ': rng => () => ({ type: TYPES[Math.floor(rng() * 7)], letters: [0, 1, 2, 3].map(() => AZ[Math.floor(rng() * 26)]) }),
  'generator        ': rng => { const gen = new L.PieceGenerator(dict, { rng }); return grid => gen.next(L.vowelRatio(grid)); },
  'generator+targets': rng => { const gen = new L.PieceGenerator(dict, { rng, targets: TARGETS }); return grid => gen.next(L.vowelRatio(grid)); },
};
const GAMES = 8;
for (const minLen of [3, 4]) {
  console.log(`--- min word length ${minLen}, greedy bot, ${GAMES} games x up to 300 pieces`);
  for (const [name, mk] of Object.entries(dealers)) {
    const stats = { words: 0, lens: [0, 0, 0, 0, 0, 0, 0], targets: 0, hits: 0 };
    let pieces = 0, overs = 0;
    for (let s = 1; s <= GAMES; s++) {
      const rng = L.makeRng(s * 101);
      const r = play(mk(rng), minLen, 300, rng, stats);
      pieces += r.pieces; overs += r.over;
    }
    const pct = n => (stats.lens[n] / stats.words * 100).toFixed(0).padStart(3) + '%';
    console.log(name, 'words/piece', (stats.words / pieces).toFixed(2), ' pieces survived', (pieces / GAMES).toFixed(0),
      ' lost', overs + '/' + GAMES, ' | len 3', pct(3), ' 4', pct(4), ' 5', pct(5), ' 6+', pct(6),
      stats.targets ? ` | targets hit ${stats.hits}/${stats.targets}` : '');
  }
}
