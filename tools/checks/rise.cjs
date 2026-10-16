const { L, U, dict, assert, well } = require('./_setup.cjs');
assert.strictEqual(L.hazardLevel(10, 3), 10); assert.strictEqual(L.hazardLevel(10, 4), 9); assert.strictEqual(L.hazardLevel(10, 5), 8);
assert.deepStrictEqual([1, 2, 3, 4, 5, 6, 7, 8, 40].map(L.riseInterval), [0, 6, 5, 4, 3, 2, 1, 1, 1]);
assert.deepStrictEqual([3, 8, 9, 14, 15, 30].map(L.junkLetters), [4, 4, 3, 3, 2, 2]);
assert.strictEqual(L.hookRateFor(1), 0.9); assert.strictEqual(L.hookRateFor(2), 0.9);
assert.strictEqual(L.hookRateFor(15), 0.5); assert.strictEqual(L.hookRateFor(30), 0.5);
for (let l = 3; l <= 15; l++) assert.ok(L.hookRateFor(l) < L.hookRateFor(l - 1), 'falls every level from 2 to 15');
for (let s = 1; s <= 200; s++) {
  const n = 2 + (s % 3), lay = L.junkLayout(n, L.makeRng(s));
  assert.strictEqual(lay.length, L.COLS); assert.strictEqual(lay.filter(Boolean).length, n);
  for (let x = 1; x < lay.length; x++) assert.ok(!(lay[x] && lay[x - 1]), 'no two letters side by side');
}
// shiftUp
let g = well([19, 0, 'ab'], [18, 0, 'c']);
const row = Array.from({ length: L.COLS }, () => L.stoneTile());
assert.strictEqual(L.shiftUp(g, row), true);
assert.strictEqual(g[18][0].ch, 'a'); assert.strictEqual(g[17][0].ch, 'c'); assert.strictEqual(g[19], row);
g = well([0, 4, 'x'], [19, 0, 'a']);
assert.strictEqual(L.shiftUp(g, row), false, 'a tile in row 0 tops out');
assert.strictEqual(g[0][4].ch, 'x'); assert.strictEqual(g[19][0].ch, 'a');
// junkRow: stones where the layout says, safe letters, never fires a word
assert.strictEqual(Object.keys(L.JUNK_WEIGHTS)[0], 'e');
const layout = [false, true, false, false, true, false, false, true, false, false];
for (let s = 1; s <= 100; s++) {
  const gen = new L.PieceGenerator(dict, { rng: L.makeRng(s) });
  const b = well([18, 1, 'c'], [19, 1, 'a'], [18, 4, 't'], [19, 4, 'h'], [18, 7, 'o'], [19, 7, 'n']);
  const r = gen.junkRow(b, layout);
  r.forEach((t, x) => assert.ok(layout[x] ? (t.ch && !t.stone && !'jkvxzq'.includes(t.ch[0])) || t.stone : t.stone));
  assert.deepStrictEqual(L.findWords(b.slice(1).concat([r]), dict, 3), [], 'seed ' + s);
}
// last resort: an rng stuck at 0 always draws 'e'; under T,H that spells THE, so that cell becomes stone
const stuck = new L.PieceGenerator(dict, { rng: () => 0 });
const b2 = well([18, 4, 't'], [19, 4, 'h']);
const r2 = stuck.junkRow(b2, layout);
assert.ok(r2[4].stone, 'the would-be word cell is stone'); assert.strictEqual(r2[1].ch, 'e');
// the dealer's rules count: F over L over the junk E reads FLE down (no word) and ELF backwards
assert.ok(dict.words.has('elf') && !dict.words.has('fle'));
const plain = new L.PieceGenerator(dict, { rng: () => 0 }).junkRow(well([18, 1, 'f'], [19, 1, 'l']), layout);
assert.strictEqual(plain[1].ch, 'e', 'plain rules: FLE fires nothing, the letter stays');
const mir = new L.PieceGenerator(dict, { rng: () => 0 }); mir.setRules({ minLen: 3, mirror: true });
const b4 = well([18, 1, 'f'], [19, 1, 'l']);
const r4 = mir.junkRow(b4, layout);
assert.ok(r4[1].stone, 'MIRROR: ELF would fire, so that cell becomes stone');
assert.deepStrictEqual(L.findWords(b4.slice(1).concat([r4]), dict, mir.rules), []);
assert.strictEqual(U.ITEM_CHANCE, 1 / 5); assert.strictEqual(U.PACK_RAT_CHANCE, 2 / 5);
console.log('rise ok');
