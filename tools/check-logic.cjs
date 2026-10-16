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

// --- pattern index: hook-length words by prefix and suffix
assert.ok(L.wordsMatching(dict, 6, 'st', '').includes('strong'));
assert.deepStrictEqual(L.wordsMatching(dict, 6, 'pl', 'et'), ['planet']);
assert.ok(L.wordsMatching(dict, 7, '', 'ing').includes('nothing'));
for (const [len, pre, suf] of [[5, 'c', ''], [6, '', 'er'], [7, 'st', 'ng'], [4, 'qu', '']]) {
  for (const w of L.wordsMatching(dict, len, pre, suf)) {
    assert.ok(w.length === len && w.startsWith(pre) && w.endsWith(suf) && !w.includes('q'), `${w} matches ${len}|${pre}|${suf}`);
  }
}
assert.deepStrictEqual(L.wordsMatching(dict, 3, 'ca', ''), [], 'hooks are 4+ letters');
assert.deepStrictEqual(L.wordsMatching(dict, 8, 'st', ''), [], 'hooks are at most 7 letters');

// --- hooks: board letters a piece can turn into a longer word
const well = (...rows) => {
  const g = L.emptyGrid();
  for (const [y, x, s] of rows) [...s].forEach((ch, i) => { if (ch !== '.') g[y][x + i] = { ch }; });
  return g;
};
const column = (g, x, top, s) => { [...s].forEach((ch, i) => { g[top + i][x] = { ch }; }); return g; };
for (const t of L.TYPES) {
  for (const land of L.landings(L.emptyGrid(), t)) {
    assert.ok(land.rot === 0 || land.rot === 1, 'only the turns that keep reading order');
    assert.ok(land.cells.some(c => c.y === L.ROWS - 1), 'an empty well: every piece rests on the floor');
  }
}
// A nearly full well: only spots inside the well count.
const full = L.emptyGrid();
for (let y = 0; y < L.ROWS; y++) for (let x = 0; x < L.COLS; x++) if (x !== 4) full[y][x] = { ch: 'e' };
assert.deepStrictEqual(L.landings(full, 'I').map(l => [l.rot, l.cells.map(c => c.x).join()]), [[1, '4,4,4,4']], 'only the upright I fits the one open column');
assert.ok(L.TYPES.filter(t => t !== 'I').every(t => L.landings(full, t).length === 0), 'nothing else fits');

let hooks = L.findHooks(well([19, 0, 'st']), 'I', dict);
assert.ok(hooks.some(h => h.rot === 0 && h.x === 2 && h.y === 18 && h.dir === 'h' && h.pre === 'st' && h.words.includes('strong')), 'ST + an I across');
hooks = L.findHooks(well([19, 6, 'ate']), 'I', dict);
assert.ok(hooks.some(h => h.dir === 'h' && h.suf === 'ate' && h.words.includes('climate')), 'an I across to the left of ATE');
hooks = L.findHooks(well([19, 0, 'pl..et']), 'O', dict);
assert.ok(hooks.some(h => h.pre === 'pl' && h.suf === 'et' && h.words.includes('planet')), 'an O bridging PL..ET');
hooks = L.findHooks(column(L.emptyGrid(), 4, 17, 'ing'), 'I', dict);
assert.ok(hooks.some(h => h.rot === 1 && h.dir === 'v' && h.suf === 'ing' && h.words.includes('nothing')), 'an upright I on top of ING');
assert.ok(hooks.every(h => h.rot === 0 || h.rot === 1));
const reservedSt = well([19, 0, 'st']);
reservedSt[19][0].tgt = reservedSt[19][1].tgt = 'stone';
assert.deepStrictEqual(L.findHooks(reservedSt, 'I', dict), [], 'reserved tiles are never hooked');
const quWell = L.emptyGrid();
[{ ch: 'qu' }, { ch: 'i' }, { ch: 't' }].forEach((t, i) => { quWell[19][i] = t; });
hooks = L.findHooks(quWell, 'I', dict);
assert.ok(hooks.length && hooks.every(h => !h.pre.includes('q') && !h.suf.includes('q') && h.words.every(w => !w.includes('q'))), 'QU tiles never take part in hooks');
// placeAt drops a dealt piece at a planned spot (rotation 1 = one clockwise turn).
const placed = L.placeAt(L.emptyGrid(), { type: 'I', letters: ['w', 'o', 'r', 'd'] }, { rot: 1, x: 0, y: 16 });
assert.deepStrictEqual([16, 17, 18, 19].map(y => placed[y][2] && placed[y][2].ch).join(''), 'word');

// A rough mid-game board: plain pieces dropped at random spots, words cleared as they form.
function roughBoard(seed, pieces) {
  const rng = L.makeRng(seed);
  const gen = new L.PieceGenerator(dict, { rng, hookRate: 0 });
  let g = L.emptyGrid();
  for (let i = 0; i < pieces; i++) {
    const d = gen.next(g);
    const spots = L.landings(g, d.type);
    g = L.placeAt(g, d, spots[Math.floor(rng() * spots.length)]);
    for (let found; (found = L.findWords(g, dict, 3)).length;) {
      for (const w of found) for (const c of w.cells) g[c.y][c.x] = null;
      L.applyGravity(g);
    }
  }
  return g;
}

// --- the dealer letters hook pieces so the word really fires at the hook spot, preferring 5+ letters
const hookGen = new L.PieceGenerator(dict, { rng: L.makeRng(11), hookRate: 1 });
let hooked = 0, longHooks = 0, deals = 0;
for (let seed = 1; seed <= 12; seed++) {
  const g = roughBoard(seed, 12);
  for (let i = 0; i < 10; i++) {
    const type = hookGen.peekType();
    const anyLong = L.findHooks(g, type, dict).some(h => h.len >= 5);
    const d = hookGen.next(g);
    assert.strictEqual(d.type, type, 'next() deals the peeked shape');
    deals++;
    if (!d.hook) continue;
    hooked++;
    assert.ok(d.hook.word.length >= L.HOOK_MIN && d.hook.word.length <= L.HOOK_MAX);
    assert.ok(L.findWords(L.placeAt(g, d, d.hook), dict, 3).some(w => w.word.includes(d.hook.word)), d.hook.word + ' fires at its spot');
    assert.strictEqual(hookGen.problems(d.type, d.letters), 0, 'hook pieces pass the usual letter checks');
    if (anyLong) assert.ok(d.hook.word.length >= 5, '5+ letter hooks win when there are any');
    if (d.hook.word.length >= 5) longHooks++;
  }
}
console.log('hook deals', hooked + '/' + deals, 'of them 5+ letters', longHooks);
assert.ok(hooked >= deals * 0.6, 'most pieces on a rough board can be hooks');
assert.ok(!new L.PieceGenerator(dict, { rng: L.makeRng(1), hookRate: 1 }).next(null).hook, 'no board, no hooks');
// MIN 5: a hook shorter than the minimum could never fire, so none is dealt.
const min5 = new L.PieceGenerator(dict, { rng: L.makeRng(2), hookRate: 1, minLen: 5 });
for (let seed = 1; seed <= 6; seed++) {
  const g = roughBoard(seed, 12);
  for (let i = 0; i < 8; i++) {
    const d = min5.next(g);
    if (d.hook) assert.ok(d.hook.word.length >= 5, 'min 5 hook ' + d.hook.word);
  }
}

// --- anchored targets: a target grows out of board letters and arrives in one or two pieces
const planOn = (g, type, words, seed = 3) => new L.PieceGenerator(dict, { rng: L.makeRng(seed), targets: words, hookRate: 0 }).planTarget(g, null, type);
// Plays a plan at its planned spots: the target must fire exactly once.
function playPlan(g, plan) {
  const T = new L.TargetTracker();
  g = g.map(row => row.map(t => t && { ...t }));
  T.announce(g, plan[0].target);
  for (const d of plan) g = L.placeAt(g, d, d.target.spot);
  const hits = T.hit(g, L.findWords(g, dict, 3));
  assert.strictEqual(hits.length, 1, plan[0].target.word + ' fires once every chunk lands');
  return hits[0];
}
let plan = planOn(well([19, 0, 'st']), 'I', ['strong']);
assert.strictEqual(plan.length, 1, 'ST + an I holds all of STRONG');
assert.deepStrictEqual(plan[0].target.anchor, [{ x: 0, y: 19 }, { x: 1, y: 19 }]);
assert.strictEqual(plan[0].target.last, true);
assert.strictEqual(plan[0].target.idx.map(i => plan[0].letters[i]).join(''), 'rong');
assert.strictEqual(playPlan(well([19, 0, 'st']), plan).dir, 'h');

plan = planOn(well([19, 0, 'st']), 'O', ['strong']);
assert.strictEqual(plan.length, 2, 'an O holds 2 letters, so STRONG needs a second piece');
assert.ok(!plan[0].target.last && plan[1].target.last && !plan[1].target.anchor);
playPlan(well([19, 0, 'st']), plan);

plan = planOn(column(L.emptyGrid(), 4, 17, 'ing'), 'I', ['nothing']);
assert.strictEqual(plan[0].target.spot.rot, 1, 'down: an upright I on top of the column');
assert.deepStrictEqual(plan[0].target.anchor, [{ x: 4, y: 17 }, { x: 4, y: 18 }, { x: 4, y: 19 }]);
assert.strictEqual(playPlan(column(L.emptyGrid(), 4, 17, 'ing'), plan).dir, 'v');

for (let seed = 1; seed <= 6; seed++) {
  plan = planOn(column(well([19, 0, 'st']), 7, 17, 'ing'), 'I', ['strong', 'nothing'], seed);
  assert.strictEqual(plan[0].target.word, 'strong', 'across beats down when both fit');
}
assert.strictEqual(planOn(L.emptyGrid(), 'I', ['strong']), null, 'no board letters, no target');

// Targets come round on schedule, never overlapping; a second chunk comes right after its first.
const tgen = new L.PieceGenerator(dict, { rng: L.makeRng(7), targets: window.TARGETS.split(' '), hookRate: 0 });
const tboard = roughBoard(4, 14);
assert.strictEqual(tgen.next(L.emptyGrid()).target, undefined);
const dealt = Array.from({ length: 120 }, () => tgen.next(tboard));
let starts = 0, lastEnd = -Infinity;
dealt.forEach((d, i) => {
  if (!d.target || !d.target.anchor) return;
  assert.ok(i - lastEnd > L.TARGET_WINDOW, 'a new target never starts inside the last one\'s window');
  const n = d.target.last ? 1 : 2;
  if (n === 2) assert.ok(dealt[i + 1].target && dealt[i + 1].target.last && dealt[i + 1].target.word === d.target.word, 'the second chunk comes right after the first');
  starts++;
  lastEnd = i + n - 1;
});
console.log('targets started in 120 pieces on a rough board', starts);
assert.ok(starts >= 12, 'targets come round regularly');
assert.ok(!new L.PieceGenerator(dict, { rng: L.makeRng(7) }).next(tboard).target, 'no targets unless asked for');
// While a two-piece target's first chunk is in play, NEXT shows the second chunk's shape.
const pgen = new L.PieceGenerator(dict, { rng: L.makeRng(3), targets: ['strong'], hookRate: 0 });
pgen.untilTarget = 0;
pgen.pending = 'O';
const firstChunk = pgen.next(well([19, 0, 'st']));
assert.ok(firstChunk.target && !firstChunk.target.last, 'an O cannot hold RONG, so STRONG takes two pieces');
assert.strictEqual(pgen.peekType(), pgen.plan[0].type);

// --- tracker: announce reserves the anchor; a hit or an expiry frees every red tile
const stInfo = { word: 'strong', anchor: [{ x: 0, y: 0 }, { x: 1, y: 0 }] };
const T1 = new L.TargetTracker();
let g7 = line(plain('st'), plain('l'));
T1.announce(g7, stInfo);
assert.strictEqual(T1.word, 'strong');
assert.deepStrictEqual(g7[0].slice(0, 2).map(t => t.tgt), ['strong', 'strong'], 'anchor tiles turn red');
g7 = line(g7[0].slice(0, 2), tg('rong', 'strong'));
T1.placed({ word: 'strong', last: true });
assert.deepStrictEqual(T1.hit(g7, L.findWords(g7, dict, 3)).map(w => w.word), ['strong']);
assert.strictEqual(T1.word, null, 'a hit ends the target');

const T2 = new L.TargetTracker();
const g9 = line(plain('st'), plain('x'), tg('ong', 'strong'));
g9[0][2] = null;
T2.announce(g9, stInfo);
T2.placed(null); assert.strictEqual(T2.endTurn(g9), null, 'pieces before the last chunk do not count');
T2.placed({ word: 'strong', last: true }); assert.strictEqual(T2.endTurn(g9), null);
for (let i = 0; i < 2; i++) { T2.placed(null); assert.strictEqual(T2.endTurn(g9), null); }
assert.strictEqual(T2.endTurn(g9), null, 'a second endTurn in the same turn does not count');
T2.placed(null);
assert.strictEqual(T2.endTurn(g9), 'strong', 'expires after 3 more pieces');
assert.ok(g9[0].every(t => !t || !t.tgt), 'expiry frees the anchor too');

const T3 = new L.TargetTracker();
const g10 = line(tg('ong', 'strong'));
T3.placed({ word: 'strong', last: true });
assert.strictEqual(T3.endTurn(g10), null);
assert.ok(g10[0].every(t => !t || !t.tgt), 'a chunk of a target that already ended lands as plain letters');

// Anchor tiles that fall (a clear beneath them) keep their mark and are still freed on expiry.
const gf = L.emptyGrid(10, 3);
gf[1][0] = { ch: 's' }; gf[1][1] = { ch: 't' }; gf[2][0] = { ch: 'x' };
const T4 = new L.TargetTracker();
T4.announce(gf, { word: 'strong', anchor: [{ x: 0, y: 1 }, { x: 1, y: 1 }] });
gf[2][0] = null;
L.applyGravity(gf);
assert.strictEqual(gf[2][0].tgt, 'strong', 'the red mark falls with its tile');
T4.placed({ word: 'strong', last: true }); T4.endTurn(gf);
for (let i = 0; i < 3; i++) { T4.placed(null); T4.endTurn(gf); }
assert.ok(gf.every(r => r.every(t => !t || !t.tgt)), 'moved anchor tiles are freed too');

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
// adaptive vowel quota: a board of 20 tiles with the given share of vowels
for (const r of [0.15, 0.4, 0.65]) {
  const vb = L.emptyGrid();
  for (let i = 0; i < 20; i++) vb[18 + (i >= 10 ? 1 : 0)][i % 10] = { ch: i < Math.round(20 * r) ? 'a' : 't' };
  const vgen = new L.PieceGenerator(dict, { rng: L.makeRng(1), hookRate: 0 });
  let v = 0;
  for (let i = 0; i < 4000; i++) v += vgen.next(vb).letters.filter(L.isVowel).length;
  console.log('board vowel ratio', r, '-> vowels/piece', (v / 4000).toFixed(2));
}
