const { L, dict, assert, well } = require('./_setup.cjs');
const TARGETS = window.TARGETS.split(' ');
const gen = new L.PieceGenerator(dict, { rng: L.makeRng(3) });
assert.deepStrictEqual(gen.rules, { minLen: 3, shortLen: 0, mirror: false, rareBoost: 1 });
const cat = well([19, 0, 'cat']);
assert.ok(gen.spells(cat, 'cat'));
gen.setRules({ minLen: 4 }); assert.ok(!gen.spells(cat, 'cat'));
assert.ok(gen.clearsAlone('cats') && !gen.clearsAlone('cat'));
// hooks and targets respect the effective minimum
const board = well([19, 0, 'strangeli'], [18, 0, 'pla.et'], [17, 1, 'ow']);
const g5 = new L.PieceGenerator(dict, { rng: L.makeRng(4), hookRate: 1 }); g5.setRules({ minLen: 5 });
let hooks = 0;
for (let i = 0; i < 300; i++) { const d = g5.next(board); if (d.hook) { hooks++; assert.ok(d.hook.word.length >= 5); assert.ok(d.hook.idx.length >= 1); } }
assert.ok(hooks > 0, 'hook deals: ' + hooks);
const g6 = new L.PieceGenerator(dict, { rng: L.makeRng(4), targets: TARGETS }); g6.setRules({ minLen: 6 });
let tgts = 0;
for (let i = 0; i < 300; i++) { const d = g6.next(board); if (d.target) { tgts++; assert.ok(d.target.word.length >= 6, d.target.word); } }
assert.ok(tgts > 0, 'target deals: ' + tgts);
// SCRABBLER doubles J K QU X Z
const share = boost => { const gg = new L.PieceGenerator(dict, { rng: L.makeRng(7) }); gg.setRules({ minLen: 3, rareBoost: boost }); let r = 0, n = 0;
  for (let i = 0; i < 20000; i++) for (const ch of gg.next(null).letters) { n++; if (L.SCRABBLE_RARE.has(ch)) r++; } return r / n; };
const ratio = share(2) / share(1);
assert.ok(ratio > 1.5 && ratio < 2.5, 'rare letters about doubled: ' + ratio.toFixed(2));
// filler cells
const p = L.createPiece('T', ['a', 'b', 'c', 'd']); p.hookIdx = [0, 1];
for (let i = 0; i < 50; i++) assert.ok([2, 3].includes(L.pickFiller(p, Math.random)));
const pt = L.createPiece('I', ['s', 't', 'r', 'o'], { word: 'strong', idx: [0, 1, 2, 3], last: false });
assert.strictEqual(L.pickFiller(pt, Math.random), -1);
console.log('dealer ok, hooks', hooks, 'targets', tgts, 'rare ratio', ratio.toFixed(2));
