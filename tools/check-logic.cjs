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
