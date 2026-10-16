const { L, dict, assert, well } = require('./_setup.cjs');
const TARGETS = window.TARGETS.split(' ');
const board = well([19, 0, 'strangeli'], [18, 0, 'pla.et']);
const gen = new L.PieceGenerator(dict, { rng: L.makeRng(9), targets: TARGETS });
const peek = gen.peekType(), until = gen.untilTarget;
const d = gen.dealType(board, 'I');
assert.ok(d.type === 'I' && d.letters.length === 4);
assert.strictEqual(gen.peekType(), peek); assert.strictEqual(gen.untilTarget, until);
const p = L.createPiece('T', ['s', 't', 'x', 'e'], { word: 'strong', idx: [0, 1], last: false });
const r = gen.reroll(board, p);
assert.deepStrictEqual([r.letters[0], r.letters[1]], ['s', 't'], 'red letters stay');
assert.strictEqual(gen.callTarget(), until > 0); assert.strictEqual(gen.untilTarget, 0);
assert.strictEqual(gen.callTarget(), false, 'already due');
let target = null; for (let i = 0; i < 5 && !target; i++) { const n = gen.next(board); if (n.target) target = n.target; }
assert.ok(target && target.anchor, 'a target is dealt right after BEACON');
const plain = new L.PieceGenerator(dict, { rng: L.makeRng(9) });
assert.strictEqual(plain.callTarget(), false, 'no target list');
console.log('dealer items ok');
