// Logic sanity checks + letter-generator stats. Run: node tools/check-logic.cjs
globalThis.window = globalThis;
const P = require('path').join(__dirname, '../js/');
require(P + 'words.js');
const L = require(P + 'logic.js');
const assert = require('assert');
const dict = L.buildDictionary(window.WORDLIST);
console.log('dict', dict.words.size, 'infixes', dict.infixes.size, 'maxLen', dict.maxLen);

// --- findWords
const g = L.emptyGrid(10, 6);
const put = (x, y, s) => [...s].forEach((ch, i) => g[y][x + i] = { ch });
put(1, 5, 'xheartz'.split('').join(''));
let f = L.findWords(g, dict, 3).map(w => w.word);
console.log('row xheartz ->', f); assert.deepStrictEqual(f, ['heart']);
// crossing: vertical 'cat' sharing the 'a'? put c above a
const g2 = L.emptyGrid(5, 5);
'cat'.split('').forEach((ch, i) => g2[2 + i - 1][2] = { ch });       // column x=2 rows 1..3: c,a,t
'bad'.split('').forEach((ch, i) => g2[2][1 + i] = { ch });           // row y=2: b,a,d  (a shared at (2,2))
f = L.findWords(g2, dict, 3).map(w => w.word + ':' + w.dir);
console.log('cross ->', f); assert.deepStrictEqual(f.sort(), ['bad:h', 'cat:v']);
// QU tile
const g3 = L.emptyGrid(6, 1); [{ ch: 'qu' }, { ch: 'i' }, { ch: 'z' }].forEach((t, i) => g3[0][i] = t);
f = L.findWords(g3, dict, 3).map(w => w.word); console.log('qu tile ->', f); assert.deepStrictEqual(f, ['quiz']);
// min length 4 ignores 3-letter
const g4 = L.emptyGrid(5, 1); 'cats'.split('').forEach((ch, i) => g4[0][i] = { ch });
assert.deepStrictEqual(L.findWords(g4, dict, 4).map(w => w.word), ['cats']);
const g5 = L.emptyGrid(5, 1); 'cat'.split('').forEach((ch, i) => g5[0][i] = { ch });
assert.deepStrictEqual(L.findWords(g5, dict, 4), []);

// --- gravity
const g6 = L.emptyGrid(2, 4); g6[0][0] = { ch: 'a' }; g6[2][0] = { ch: 'b' }; g6[1][1] = { ch: 'c' };
const mv = L.applyGravity(g6);
assert.strictEqual(g6[3][0].ch, 'b'); assert.strictEqual(g6[2][0].ch, 'a'); assert.strictEqual(g6[3][1].ch, 'c');
console.log('gravity moves', mv.map(m => `${m.tile.ch}:${m.fromY}->${m.toY}`));

// --- rotation keeps letters with squares; O cycles; I reading order
const O = L.createPiece('O', ['a', 'b', 'c', 'd']);
const read = cells => { const s = [...cells].sort((p, q) => p.y - q.y || p.x - q.x); return s.map(c => c.ch).join(''); };
console.log('O', read(O.cells), '-> cw', read(L.rotateCells(O.cells, 2, 1)), '-> ccw', read(L.rotateCells(O.cells, 2, -1)));
const I = L.createPiece('I', ['w', 'o', 'r', 'd']);
console.log('I', read(I.cells), '-> cw (top-down)', read(L.rotateCells(I.cells, 4, 1)), '-> 180', read(L.rotateCells(L.rotateCells(I.cells, 4, 1), 4, 1)));
console.log('score cat', L.scoreWord('cat'), 'heart', L.scoreWord('heart'), 'quiz x2', L.scoreWord('quiz', 2));

// --- target words
const TARGETS = window.TARGETS.split(' ');
console.log('targets', TARGETS.length, TARGETS.slice(0, 8).join(' '));
assert.ok(TARGETS.length >= 1000, 'target pool too small');
for (const w of TARGETS) {
  assert.ok(dict.words.has(w), w + ' not in dictionary');
  assert.ok(w.length >= 5 && w.length <= 7 && !/[jkqvxz]/.test(w) && !w.endsWith('s'), 'bad target ' + w);
}

// Reserved tiles only clear as part of the target word (or a longer word containing it).
const tg = (s, word) => [...s].map(ch => ({ ch, tgt: word }));
const plain = s => [...s].map(ch => ({ ch }));
const line = (...parts) => { const g = L.emptyGrid(10, 1); parts.flat().forEach((t, i) => g[0][i] = t); return g; };
const words = g => L.findWords(g, dict, 3).map(w => w.word);
assert.deepStrictEqual(words(line(plain('l'), tg('ong', 'strong'))), [], 'LONG must not eat reserved ONG');
assert.deepStrictEqual(words(line(tg('strong', 'strong'))), ['strong']);
assert.deepStrictEqual(words(line(tg('strong', 'strong'), plain('er'))), ['stronger']);
assert.deepStrictEqual(words(line(plain('cat'), tg('ong', 'strong'))), ['cat'], 'unreserved neighbours still clear');
const gv = L.emptyGrid(1, 3); gv[0][0] = { ch: 'c' }; gv[1][0] = { ch: 'a', tgt: 'garden' }; gv[2][0] = { ch: 't' };
assert.deepStrictEqual(words(gv), [], 'a crossing word must not use a reserved tile');

// Target flags ride along with their squares.
const tp = L.createPiece('I', ['s', 't', 'r', 'e'], { word: 'strong', idx: [0, 1, 2], last: false });
assert.deepStrictEqual(tp.cells.filter(c => c.tgt === 'strong').map(c => c.ch), ['s', 't', 'r']);
assert.deepStrictEqual(L.rotateCells(tp.cells, 4, 1).filter(c => c.tgt === 'strong').map(c => c.ch), ['s', 't', 'r']);

// The dealer splits a target over two consecutive pieces: the word's end first, then its start,
// each sitting in the piece's bottom row so they join across (B left of A) or down (B on top of A).
const pool = ['strong', 'planet', 'garden', 'mother', 'castle'];
const tgen = new L.PieceGenerator(dict, { rng: L.makeRng(7), targets: pool });
const dealt = Array.from({ length: 140 }, () => tgen.next(null));
const bottomRow = d => {
  const cells = L.createPiece(d.type, d.letters, d.target).cells;
  const maxY = Math.max(...cells.map(c => c.y));
  return cells.filter(c => c.y === maxY).sort((p, q) => p.x - q.x);
};
let pairs = 0, lastEnd = -Infinity;
for (let i = 0; i < dealt.length; i++) {
  const a = dealt[i];
  if (!a.target || a.target.last) continue;
  const b = dealt[i + 1];
  if (!b) break;
  assert.ok(b.target && b.target.last && b.target.word === a.target.word, 'first chunk must be followed by the last chunk');
  assert.ok(pool.includes(a.target.word));
  assert.ok(i - lastEnd > 3, 'a new target must not start inside the previous one\'s window');
  const rowA = bottomRow(a), rowB = bottomRow(b);
  const tA = rowA.filter(c => c.tgt).map(c => c.ch).join(''), tB = rowB.filter(c => c.tgt).map(c => c.ch).join('');
  assert.strictEqual(tB + tA, a.target.word, 'prefix (2nd piece) + suffix (1st piece) spell the word');
  assert.ok(tA.length >= 2 && tB.length >= 2);
  assert.ok(rowA[0].tgt, 'suffix chunk starts at the left end of its row');
  assert.ok(rowB[rowB.length - 1].tgt, 'prefix chunk ends at the right end of its row');
  for (const d of [a, b]) {
    const cells = L.createPiece(d.type, d.letters, d.target).cells;
    assert.strictEqual(cells.filter(c => c.tgt).length, (d === a ? tA : tB).length, 'only bottom-row chunk cells are reserved');
  }
  pairs++;
  lastEnd = i + 1;
}
console.log('target pairs in 140 pieces', pairs);
assert.ok(pairs >= 15, 'targets should come round regularly');
assert.ok(!new L.PieceGenerator(dict, { rng: L.makeRng(7) }).next(null).target, 'no targets unless asked for');

// Tracker: a target hit, an expiry after 3 more pieces, and a hit on the very last piece.
const board = () => line(plain('l'), tg('ong', 'strong'));
const T1 = new L.TargetTracker();
const g7 = board();
T1.placed({ word: 'strong', last: false }); assert.strictEqual(T1.endTurn(g7), null);
const g8 = line(tg('str', 'strong'), tg('ong', 'strong'));
T1.placed({ word: 'strong', last: true });
assert.deepStrictEqual(T1.hit(g8, L.findWords(g8, dict, 3)).map(w => w.word), ['strong']);
assert.strictEqual(T1.word, null, 'a hit ends the target');

const T2 = new L.TargetTracker();
const g9 = board();
T2.placed({ word: 'strong', last: false }); T2.endTurn(g9);
T2.placed({ word: 'strong', last: true }); assert.strictEqual(T2.endTurn(g9), null);
for (let i = 0; i < 2; i++) { T2.placed(null); assert.strictEqual(T2.endTurn(g9), null); }
assert.strictEqual(T2.endTurn(g9), null, 'a second endTurn in the same turn does not count');
assert.deepStrictEqual(words(g9), [], 'still reserved inside the window');
T2.placed(null);
assert.strictEqual(T2.endTurn(g9), 'strong', 'expires after 3 more pieces');
assert.deepStrictEqual(words(g9), ['long'], 'expired tiles become ordinary letters');

const T3 = new L.TargetTracker();
const g10 = line(tg('str', 'strong'), tg('ong', 'strong'));
T3.placed({ word: 'strong', last: false }); T3.endTurn(g10);
T3.placed({ word: 'strong', last: true }); T3.endTurn(g10);
T3.placed(null); T3.endTurn(g10); T3.placed(null); T3.endTurn(g10);
T3.placed(null);
assert.deepStrictEqual(T3.hit(g10, L.findWords(g10, dict, 3)).map(w => w.word), ['strong'], 'the 3rd piece can still complete it');

// --- generator stats
const gen = new L.PieceGenerator(dict, { rng: L.makeRng(1) });
let vow = 0, n = 0, bad = 0; const freq = {}; const samples = {};
for (let i = 0; i < 20000; i++) {
  const p = gen.next(null);
  for (const ch of p.letters) { freq[ch] = (freq[ch] || 0) + 1; n++; if (L.isVowel(ch)) vow++; }
  if (gen.problems(p.type, p.letters) > 0) bad++;
  (samples[p.type] = samples[p.type] || []).length < 6 && samples[p.type].push(L.runsOf(L.createPiece(p.type, p.letters).cells).join('/'));
}
console.log('vowel share', (vow / n).toFixed(3), 'pieces with problems', bad);
console.log('letter freq', Object.entries(freq).sort((a, b) => b[1] - a[1]).map(([k, v]) => k + (v / n * 100).toFixed(1)).join(' '));
for (const t in samples) console.log(' ', t, samples[t].join('  '));
// adaptive vowel quota
for (const r of [0.15, 0.4, 0.65]) { let v = 0; for (let i = 0; i < 4000; i++) v += gen.next(r).letters.filter(L.isVowel).length; console.log('board vowel ratio', r, '-> vowels/piece', (v / 4000).toFixed(2)); }
